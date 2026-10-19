# db.ps1 - the permanent PostgreSQL of the product in Docker (task 115).
#
#   powershell -File src/pg/db.ps1 up                  create/start the container crew-harness-pg (volume crew-harness-pg-data, port
#                                                      15432 on 127.0.0.1), make the database crew, apply schema.sql, make the login
#                                                      crew_service; safe to run again (no password changes)
#   powershell -File src/pg/db.ps1 status              container, port, volume, version, schema (tables, functions), sessions
#   powershell -File src/pg/db.ps1 down                stop the container, keep the volume
#   powershell -File src/pg/db.ps1 psql [-Sql "..."]   psql inside the container as the administrator (interactive, or one command)
#   powershell -File src/pg/db.ps1 backup [file]       pg_dump of the database into a file (default: backups/ next to the settings)
#   powershell -File src/pg/db.ps1 restore <file>      restore the database from a dump (a safety dump of the present state is made first)
#   powershell -File src/pg/db.ps1 reset -Force        remove the container AND THE VOLUME (all data; cannot be undone)
#   powershell -File src/pg/db.ps1 env [-ShowPassword] the variables of the environment for the server (the password only on request)
#   powershell -File src/pg/db.ps1 serve-config        write an example settings file of the server with store pg (no password)
#   powershell -File src/pg/db.ps1 dropdb -Database crew_x   drop an extra database crew_* (made by `up -Database crew_x`; never `crew`)
#
# Options: -Port (15432; a changed port re-creates the container, the data stay), -Config (the file with the passwords,
# default ~/.config/crew-harness/pg.json), -Database (default crew; `up` makes it, `psql`, `backup`, `restore` use it), -Out
# (serve-config), -Image (postgres:16-alpine).
#
# The script works with ONE container, `crew-harness-pg`, and ONE volume, `crew-harness-pg-data`, and with nothing else: other
# containers and volumes of the machine, and any PostgreSQL service of the machine, are not touched. The passwords are made at
# random on the first `up` and kept in the settings file OUTSIDE the repository (only its owner may read it); they are in no output
# of this script except `env -ShowPassword`. Docker not running: a message and exit code 1.
param(
    [Parameter(Position = 0)][string]$Command = 'help',
    [Parameter(Position = 1)][string]$Path = '',
    [int]$Port = 0,
    [string]$Config = '',
    [string]$Database = 'crew',
    [string]$Out = '',
    [string]$Sql = '',
    [string]$Image = 'postgres:16-alpine',
    [switch]$Force,
    [switch]$ShowPassword
)

$ErrorActionPreference = 'Continue'
$Container = 'crew-harness-pg'
$Volume = 'crew-harness-pg-data'
$ServiceUser = 'crew_service'
$DefaultPort = 15432
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$schemaFile = Join-Path $PSScriptRoot 'schema.sql'
$configDir = Join-Path $HOME '.config/crew-harness'
if ($Config -eq '') { $Config = Join-Path $configDir 'pg.json' }
$script:Secrets = @()

function Stop-Script([string]$Message, [int]$Code = 1) {
    [Console]::Error.WriteLine($Message)
    exit $Code
}

# a text with the passwords of this run hidden (an error of psql may quote a statement)
function Hide-Secrets([string]$Text) {
    foreach ($s in $script:Secrets) { if ($s) { $Text = $Text.Replace($s, '***') } }
    return $Text
}

function New-Password {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Assert-Docker {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Stop-Script 'Docker is not running: start Docker Desktop and run this script again.'
    }
}

function Test-DatabaseName([string]$Name) {
    return ($Name -cmatch '^[a-z][a-z0-9_]{0,40}$')
}

function Get-ContainerState {
    $s = docker container inspect -f '{{.State.Status}}' $Container 2>$null
    if ($LASTEXITCODE -ne 0) { return 'absent' }
    return ($s | Select-Object -First 1)
}

# the host port of the container, from its configuration (so a stopped container has one too)
function Get-ContainerPort {
    $j = docker container inspect -f '{{json .HostConfig.PortBindings}}' $Container 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $j) { return 0 }
    try {
        $bindings = ($j | Select-Object -First 1) | ConvertFrom-Json
        return [int]$bindings.'5432/tcp'[0].HostPort
    } catch { return 0 }
}

function Test-Volume {
    docker volume inspect $Volume *> $null
    return ($LASTEXITCODE -eq 0)
}

function Read-Settings {
    if (-not (Test-Path $Config)) { return $null }
    try { return (Get-Content -Raw -Path $Config | ConvertFrom-Json) } catch { Stop-Script "the settings file $Config is not JSON: remove it or fix it." }
}

# the file is readable by its owner only
function Protect-File([string]$File) {
    if ($env:OS -eq 'Windows_NT') {
        $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        icacls $File /inheritance:r /grant:r "${me}:(F)" *> $null
        if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine("warning: could not restrict the rights of $File") }
    } else {
        chmod 600 $File
    }
}

function Write-JsonFile([string]$File, $Object, [switch]$Secret) {
    $dir = Split-Path -Parent $File
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    $json = $Object | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($File, $json + "`n", (New-Object System.Text.UTF8Encoding $false))
    if ($Secret) { Protect-File $File }
}

# SQL (and only SQL, never a password in the command line) goes to psql in the container over stdin
function Invoke-Sql([string]$Db, [string]$Text) {
    $output = $Text | docker exec -i $Container psql -U postgres -d $Db -v ON_ERROR_STOP=1 -q -t -A 2>&1
    $code = $LASTEXITCODE
    return [pscustomobject]@{ Code = $code; Text = (Hide-Secrets (($output | ForEach-Object { "$_" }) -join "`n")).Trim() }
}

function Invoke-SqlOrStop([string]$Db, [string]$Text, [string]$What) {
    $r = Invoke-Sql $Db $Text
    if ($r.Code -ne 0) { Stop-Script "${What} failed: $($r.Text)" }
    return $r.Text
}

function Wait-Ready {
    for ($i = 0; $i -lt 90; $i++) {
        docker exec $Container pg_isready -U postgres -h 127.0.0.1 *> $null
        if ($LASTEXITCODE -eq 0) {
            $r = Invoke-Sql 'postgres' 'select 1'
            if ($r.Code -eq 0) { return }
        }
        Start-Sleep -Seconds 1
    }
    Stop-Script "the container $Container did not accept connections in 90 seconds (docker logs $Container)."
}

# a real login with the password through the network address of the container (not the trusted local one)
function Test-Login([string]$Db, [string]$User, [string]$Password) {
    $env:CREW_DB_PROBE_PW = $Password
    try {
        $cmd = ('PGPASSWORD=$CREW_DB_PROBE_PW psql -h $(hostname -i) -U {0} -d {1} -v ON_ERROR_STOP=1 -q -t -A -c ''select count(*) from crew.list_sessions()''' -f $User, $Db)
        $o = docker exec -e CREW_DB_PROBE_PW $Container sh -c $cmd 2>&1
        return @{ Ok = ($LASTEXITCODE -eq 0); Text = (Hide-Secrets (($o | ForEach-Object { "$_" }) -join ' ')) }
    } finally {
        Remove-Item Env:CREW_DB_PROBE_PW -ErrorAction SilentlyContinue
    }
}

function Invoke-Up {
    Assert-Docker
    if (-not (Test-DatabaseName $Database)) { Stop-Script "the database name $Database is not allowed (lower case letters, digits, underscore)." }
    if (-not (Test-Path $schemaFile)) { Stop-Script "schema.sql is not found beside this script." }
    $cfg = Read-Settings
    $state = Get-ContainerState
    $newSettings = $false
    if ($null -eq $cfg) {
        $newSettings = $true
        $p = $DefaultPort
        if ($Port -gt 0) { $p = $Port } elseif ($state -ne 'absent') { $actual = Get-ContainerPort; if ($actual -gt 0) { $p = $actual } }
        $cfg = [ordered]@{
            container = $Container; volume = $Volume; host = '127.0.0.1'; port = $p; database = 'crew'
            admin_user = 'postgres'; admin_password = (New-Password)
            service_user = $ServiceUser; service_password = (New-Password)
        }
        Write-JsonFile $Config $cfg -Secret
        $cfg = Read-Settings
    }
    $script:Secrets = @($cfg.admin_password, $cfg.service_password)
    $wantPort = [int]$cfg.port
    if ($Port -gt 0) { $wantPort = $Port }

    # the container: absent -> run; stopped -> start; another port than asked -> re-create (the volume stays)
    if ($state -ne 'absent' -and (Get-ContainerPort) -gt 0 -and (Get-ContainerPort) -ne $wantPort -and $Port -gt 0) {
        Write-Output "the container is on port $(Get-ContainerPort), asked ${wantPort}: re-creating the container, the volume $Volume stays"
        docker rm -f $Container | Out-Null
        $state = 'absent'
    }
    if ($state -eq 'absent') {
        # the password goes by the environment of the process (the command line has the name of the variable only)
        $env:POSTGRES_PASSWORD = $cfg.admin_password
        try {
            $run = docker run -d --name $Container --restart unless-stopped -v "${Volume}:/var/lib/postgresql/data" -e POSTGRES_PASSWORD -p "127.0.0.1:${wantPort}:5432" $Image 2>&1
        } finally { Remove-Item Env:POSTGRES_PASSWORD -ErrorAction SilentlyContinue }
        if ($LASTEXITCODE -ne 0) {
            docker rm -f $Container *> $null
            Stop-Script ("could not start the container: " + (Hide-Secrets (($run | ForEach-Object { "$_" }) -join ' ')) + " (a port taken? try -Port <other>)")
        }
        Write-Output "container $Container created (image $Image, volume $Volume, 127.0.0.1:$wantPort)"
    } elseif ($state -ne 'running') {
        docker start $Container | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Script "could not start the container $Container (docker logs $Container)." }
        Write-Output "container $Container started"
    } else {
        Write-Output "container $Container is running"
    }
    if ($wantPort -ne [int]$cfg.port) {
        $cfg.port = $wantPort
        Write-JsonFile $Config $cfg -Secret
    }
    Wait-Ready

    # settings lost but the container lives: the passwords of the new file are set in the database (local trusted login)
    if ($newSettings -and $state -ne 'absent') {
        $null = Invoke-SqlOrStop 'postgres' "alter role postgres password '$($cfg.admin_password)'" 'setting the administrator password'
    }

    $exists = Invoke-SqlOrStop 'postgres' "select 1 from pg_database where datname = '$Database'" 'looking for the database'
    if ($exists -ne '1') {
        $null = Invoke-SqlOrStop 'postgres' "create database $Database" 'creating the database'
        Write-Output "database $Database created"
    }
    docker cp $schemaFile "${Container}:/tmp/crew-schema.sql" | Out-Null
    $apply = docker exec $Container psql -U postgres -d $Database -v ON_ERROR_STOP=1 -q -f /tmp/crew-schema.sql 2>&1
    $applyCode = $LASTEXITCODE
    docker exec $Container rm -f /tmp/crew-schema.sql *> $null
    if ($applyCode -ne 0) { Stop-Script ("applying schema.sql failed: " + (($apply | ForEach-Object { "$_" }) -join ' ')) }

    # the login: made once; its password is not touched afterwards, except when the settings file was made anew
    $pw = $cfg.service_password
    $role = @"
do `$`$
begin
    if not exists (select 1 from pg_roles where rolname = '$($cfg.service_user)') then
        create role $($cfg.service_user) login password '$pw' in role crew_app;
    end if;
end
`$`$;
"@
    $null = Invoke-SqlOrStop 'postgres' $role 'making the login'
    if ($newSettings -and $state -ne 'absent') {
        $null = Invoke-SqlOrStop 'postgres' "alter role $($cfg.service_user) password '$pw'" 'setting the login password'
    }
    $null = Invoke-SqlOrStop 'postgres' "grant crew_app to $($cfg.service_user)" 'granting crew_app'

    $login = Test-Login $Database $cfg.service_user $pw
    if (-not $login.Ok) { Stop-Script "the login $($cfg.service_user) cannot connect to $Database with the password of $Config : $($login.Text)" }
    Write-Output "ready: 127.0.0.1:$wantPort, database $Database, login $($cfg.service_user), settings $Config"
}

function Invoke-Status {
    Assert-Docker
    $state = Get-ContainerState
    Write-Output "container: $Container ($state)"
    Write-Output ("volume: $Volume (" + $(if (Test-Volume) { 'present' } else { 'absent' }) + ')')
    $cfg = Read-Settings
    Write-Output ("settings: $Config (" + $(if ($cfg) { 'present' } else { 'absent' }) + ')')
    if ($state -ne 'running') {
        Write-Output 'not running: powershell -File src/pg/db.ps1 up'
        exit 1
    }
    Write-Output "port: 127.0.0.1:$(Get-ContainerPort)"
    $script:Secrets = @()
    if ($cfg) { $script:Secrets = @($cfg.admin_password, $cfg.service_password) }
    $version = Invoke-SqlOrStop 'postgres' 'show server_version' 'asking the version'
    Write-Output "postgres: $version"
    $space = docker exec $Container df -h /var/lib/postgresql/data 2>$null | Select-Object -Last 1
    if ($space) {
        $cols = ($space -split '\s+')
        Write-Output "disk of the volume: $($cols[2]) used of $($cols[1]), $($cols[3]) free ($($cols[4]))"
    }
    $dbs = Invoke-SqlOrStop 'postgres' "select string_agg(datname, ', ' order by datname) from pg_database where not datistemplate and datname <> 'postgres'" 'listing the databases'
    Write-Output "databases: $dbs"
    $has = Invoke-SqlOrStop 'postgres' "select 1 from pg_database where datname = '$Database'" 'looking for the database'
    if ($has -ne '1') { Write-Output "database ${Database}: absent"; return }
    $schema = Invoke-SqlOrStop $Database "select (select count(*) from information_schema.tables where table_schema = 'crew') || ' tables, ' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crew') || ' functions'" 'reading the schema'
    Write-Output "schema crew in ${Database}: $schema"
    $sessions = Invoke-Sql $Database 'select count(*) from crew.list_sessions()'
    if ($sessions.Code -eq 0) { Write-Output "sessions: $($sessions.Text)" }
    if ($cfg) {
        $login = Test-Login $Database $cfg.service_user $cfg.service_password
        Write-Output ("login $($cfg.service_user): " + $(if ($login.Ok) { 'ok' } else { 'FAILED - ' + $login.Text }))
    }
}

function Invoke-Down {
    Assert-Docker
    $state = Get-ContainerState
    if ($state -eq 'absent') { Write-Output "container $Container is not there"; return }
    if ($state -eq 'running') {
        docker stop $Container | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Script "could not stop $Container." }
    }
    Write-Output "container $Container stopped; the volume $Volume is kept"
}

function Invoke-Psql {
    Assert-Docker
    if ((Get-ContainerState) -ne 'running') { Stop-Script "the container $Container is not running: powershell -File src/pg/db.ps1 up" }
    if ($Sql -ne '') {
        # over stdin: quotes in the text survive (an argument of a native command does not keep them in Windows PowerShell)
        ($Sql + "`n;`n") | docker exec -i $Container psql -U postgres -d $Database -v ON_ERROR_STOP=1
        exit $LASTEXITCODE
    }
    docker exec -it $Container psql -U postgres -d $Database
    exit $LASTEXITCODE
}

function Resolve-UserPath([string]$P) {
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($P)
}

function Invoke-Dump([string]$Target) {
    $inside = '/tmp/crew-backup.dump'
    $o = docker exec $Container pg_dump -U postgres -d $Database -Fc -f $inside 2>&1
    if ($LASTEXITCODE -ne 0) { Stop-Script ("pg_dump failed: " + (($o | ForEach-Object { "$_" }) -join ' ')) }
    $dir = Split-Path -Parent $Target
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    docker cp "${Container}:${inside}" $Target | Out-Null
    $code = $LASTEXITCODE
    docker exec $Container rm -f $inside *> $null
    if ($code -ne 0) { Stop-Script "could not copy the dump out of the container." }
}

function Invoke-Backup {
    Assert-Docker
    if ((Get-ContainerState) -ne 'running') { Stop-Script "the container $Container is not running: powershell -File src/pg/db.ps1 up" }
    $target = $Path
    if ($target -eq '') { $target = Join-Path $configDir ("backups/$Database-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump') }
    $target = Resolve-UserPath $target
    Invoke-Dump $target
    Write-Output ("backup of ${Database}: $target (" + (Get-Item $target).Length + ' bytes)')
}

function Invoke-Restore {
    Assert-Docker
    if ($Path -eq '') { Stop-Script 'usage: db.ps1 restore <file>' }
    $file = Resolve-UserPath $Path
    if (-not (Test-Path $file)) { Stop-Script "the file $file is not there." }
    Write-Output "WARNING: the content of the database $Database will be REPLACED by the dump $file."
    Invoke-Up
    $safety = Join-Path $configDir ("backups/$Database-before-restore-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
    Invoke-Dump $safety
    Write-Output "the present state is saved first: $safety"
    $inside = '/tmp/crew-restore.dump'
    docker cp $file "${Container}:${inside}" | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-Script 'could not copy the dump into the container.' }
    $o = docker exec $Container pg_restore -U postgres -d $Database --clean --if-exists --single-transaction $inside 2>&1
    $code = $LASTEXITCODE
    docker exec $Container rm -f $inside *> $null
    if ($code -ne 0) { Stop-Script ("pg_restore failed (the database is as before; the safety dump is above): " + (($o | ForEach-Object { "$_" }) -join ' ')) }
    # the schema again, so that functions and rights are those of this repository
    docker cp $schemaFile "${Container}:/tmp/crew-schema.sql" | Out-Null
    docker exec $Container psql -U postgres -d $Database -v ON_ERROR_STOP=1 -q -f /tmp/crew-schema.sql *> $null
    docker exec $Container rm -f /tmp/crew-schema.sql *> $null
    Write-Output "restored $Database from $file"
}

function Invoke-Reset {
    Assert-Docker
    if (-not $Force) {
        Write-Output "reset removes the container $Container AND THE VOLUME $Volume with ALL its data (sessions, journals); it cannot be undone."
        Write-Output 'Make a backup first (db.ps1 backup). To go on: powershell -File src/pg/db.ps1 reset -Force'
        exit 2
    }
    if ((Get-ContainerState) -ne 'absent') {
        docker rm -f $Container | Out-Null
        Write-Output "container $Container removed"
    }
    if (Test-Volume) {
        docker volume rm $Volume | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Script "could not remove the volume $Volume." }
        Write-Output "volume $Volume removed"
    }
    if (Test-Path $Config) {
        Remove-Item $Config
        Write-Output "settings file $Config removed (its passwords were those of the removed volume)"
    }
}

function Invoke-DropDb {
    Assert-Docker
    if ($Database -cnotmatch '^crew_[a-z0-9_]+$') { Stop-Script "dropdb drops only an extra database named crew_<something> (not $Database); reset removes everything." }
    if ((Get-ContainerState) -ne 'running') { Stop-Script "the container $Container is not running." }
    $null = Invoke-SqlOrStop 'postgres' "drop database if exists $Database with (force)" 'dropping the database'
    Write-Output "database $Database dropped"
}

function Invoke-Env {
    $cfg = Read-Settings
    if (-not $cfg) { Stop-Script "no settings file $Config : run powershell -File src/pg/db.ps1 up first." }
    $vars = [ordered]@{
        CREW_SERVER_STORE = 'pg'
        CREW_PG_HOST = $cfg.host
        CREW_PG_PORT = [string]$cfg.port
        CREW_PG_DATABASE = $cfg.database
        CREW_PG_USER = $cfg.service_user
    }
    if ($ShowPassword) { $vars['CREW_PG_PASSWORD'] = $cfg.service_password }
    foreach ($name in $vars.Keys) { Write-Output ("`$env:{0} = '{1}'" -f $name, $vars[$name]) }
    if (-not $ShowPassword) {
        Write-Output "# CREW_PG_PASSWORD: the field service_password of $Config (add -ShowPassword to print it)"
    }
}

function Invoke-ServeConfig {
    $cfg = Read-Settings
    if (-not $cfg) { Stop-Script "no settings file $Config : run powershell -File src/pg/db.ps1 up first." }
    $target = $Out
    if ($target -eq '') { $target = Join-Path $configDir 'server-pg.json' }
    $target = Resolve-UserPath $target
    if ((Test-Path $target) -and -not $Force) {
        Write-Output "settings file $target exists and is kept (-Force writes it anew)"
        return
    }
    $server = [ordered]@{
        port = 8099
        data_dir = 'target/crew-data'
        store = 'pg'
        pg = [ordered]@{ host = $cfg.host; port = [int]$cfg.port; database = $cfg.database; user = $cfg.service_user }
        agents = @([ordered]@{ id = 'opencode'; label = 'OpenCode'; program = 'opencode.cmd'; args = @('acp') })
        idle_term_seconds = 900
        workdir = ''
        web_dir = 'src/web'
        hub = [ordered]@{ program = 'target/crew-hub.exe'; args = @() }
    }
    Write-JsonFile $target $server
    Write-Output "settings of the server with store pg (no password) written: $target"
}

switch ($Command) {
    'up' { Invoke-Up }
    'status' { Invoke-Status }
    'down' { Invoke-Down }
    'psql' { Invoke-Psql }
    'backup' { Invoke-Backup }
    'restore' { Invoke-Restore }
    'reset' { Invoke-Reset }
    'env' { Invoke-Env }
    'serve-config' { Invoke-ServeConfig }
    'dropdb' { Invoke-DropDb }
    default {
        Get-Content $PSCommandPath | Select-Object -First 20 | ForEach-Object { $_ -replace '^# ?', '' }
        if ($Command -ne 'help') { exit 2 }
    }
}
