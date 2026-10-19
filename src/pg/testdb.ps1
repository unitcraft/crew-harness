# testdb.ps1 - a temporary PostgreSQL for the tests of src/pg (task 098), in Docker.
#
#   powershell -File src/pg/testdb.ps1          start a container on a random port of 127.0.0.1, wait until it accepts
#                                               connections, write target/pg-test.json (the port, the password of the
#                                               administrator and the password of the test logins of THIS container)
#   powershell -File src/pg/testdb.ps1 -Stop    stop and remove the container, delete target/pg-test.json
#
# The passwords are made at random for the temporary container; they open nothing else. The script never touches a PostgreSQL
# service of the machine. If Docker is not running the script says so and stops: there is no other way to get a database.
param(
    [switch]$Stop,
    [string]$Image = 'postgres:16-alpine'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$settings = Join-Path $root 'target/pg-test.json'
# two random passwords for THIS container only; they are written to target/pg-test.json (not in the repository), nowhere else
$adminPw = [guid]::NewGuid().ToString('N')
$appPw = [guid]::NewGuid().ToString('N')

if ($Stop) {
    if (Test-Path $settings) {
        $name = (Get-Content $settings -Raw | ConvertFrom-Json).container
        docker rm -f $name | Out-Null
        Remove-Item $settings
        Write-Output "removed container $name"
    } else {
        Write-Output 'nothing to stop: target/pg-test.json is not there'
    }
    return
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Docker is not running: start Docker Desktop and run this script again.'
    exit 1
}
if (Test-Path $settings) {
    Write-Error 'target/pg-test.json exists: a test container may be running; run this script with -Stop first.'
    exit 1
}

$name = 'crew-pg-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
# ORACLE-WORKAROUND(57): md5 for the test logins: a connection with SCRAM costs about a quarter of a second on the unoptimized build of the driver
# (4096 rounds of HMAC in Nova), and the tests make hundreds of connections; use SCRAM for all the logins when item 57 is fixed.
# A login created with a SCRAM secret still authenticates with SCRAM under this setting (the test "SCRAM login" makes one).
docker run --rm -d --name $name -e "POSTGRES_PASSWORD=$adminPw" -e 'POSTGRES_INITDB_ARGS=--auth-host=md5' -p '127.0.0.1::5432' $Image -c password_encryption=md5 | Out-Null
$port = 0
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $mapping = docker port $name 5432 2>$null
    if ($mapping) { $port = [int](($mapping | Select-Object -First 1).Split(':')[-1]) }
    docker exec $name pg_isready -U postgres -h 127.0.0.1 *> $null
    if ($LASTEXITCODE -eq 0 -and $port -gt 0) { break }
}
if ($port -le 0) {
    docker rm -f $name | Out-Null
    Write-Error 'the container did not start in 60 seconds'
    exit 1
}
New-Item -ItemType Directory -Force (Join-Path $root 'target') | Out-Null
@{ port = $port; admin_password = $adminPw; app_password = $appPw; container = $name } | ConvertTo-Json | Set-Content -Path $settings -Encoding ascii
Write-Output "container $name on 127.0.0.1:$port, settings in target/pg-test.json"
