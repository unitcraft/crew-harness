# test-contour.ps1 - a test contour of the console (пульт) from THIS worktree, for the owner's check of a small-route
# task (task 191): the owner says «сделай X мгновенно» / «сделай X, супер быстро» (the orchestrator recognizes the entry),
# the executor raises the contour and gives the owner the link;
# the mark «ссылка на контур выдана» is crew_task {action: "contour", n, link}.
#
#   powershell -File scripts/test-contour.ps1            start the contour, print the link (a free port from 8100 up)
#   powershell -File scripts/test-contour.ps1 -Port 8103 start on this port
#   powershell -File scripts/test-contour.ps1 -Build     build hub/front of THIS tree first (a server task), then start
#   powershell -File scripts/test-contour.ps1 -Stop      stop the contour of this tree
#
# What it does: the front and hub programs are the BUILT ones of the main copy (its target/), unless the task changes the
# server (the diff main...HEAD touches src/ outside src/web, or -Build is given) — then they are built from THIS tree
# (nova build). The pages come from src/web of THIS tree (web_dir), the store is a files store in a data dir of its own
# (in the temporary folder, keyed by the path of the tree): the contour shares nothing with the live service. The pid of
# the front is written next to the data dir; -Stop ends the front and its hub (the process tree).
param(
    [switch]$Stop,
    [switch]$Build,
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$tree = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $tree

$sha1 = [System.Security.Cryptography.SHA1]::Create()
$hash = [System.BitConverter]::ToString($sha1.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($tree.ToLowerInvariant()))).Replace('-', '').Substring(0, 8).ToLowerInvariant()
$dir = Join-Path $env:TEMP "crew-contour-$hash"
$pidFile = Join-Path $dir 'contour.pid'

if ($Stop) {
    if (-not (Test-Path $pidFile)) { Write-Output "the contour of this tree is not running (no $pidFile)"; exit 0 }
    $pid_ = [int](Get-Content $pidFile)
    $alive = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
    if ($alive) {
        & taskkill /PID $pid_ /T /F | Out-Null
        Write-Output "the contour of this tree is stopped (pid $pid_ with its hub)"
    } else {
        Write-Output "the contour of this tree was not running (pid $pid_ is gone)"
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
    exit 0
}

# the main copy of the repository (its target/ holds the built programs of the live service)
$common = & git rev-parse --git-common-dir
if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine('git rev-parse --git-common-dir failed'); exit 1 }
$mainCopy = (Resolve-Path (Join-Path $common '..')).Path

# a server task: the diff to main touches src/ outside src/web — build from THIS tree, else take the built main copy
$serverChange = @(& git diff --name-only main...HEAD -- src/ | Where-Object { $_ -and -not $_.StartsWith('src/web/') })
if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine('git diff main...HEAD failed'); exit 1 }
$buildHere = $Build -or $serverChange.Count -gt 0

$front = Join-Path $tree 'target/crew-harness.exe'
$hub = Join-Path $tree 'target/crew-hub.exe'
if ($buildHere) {
    Write-Output ('building the server programs of THIS tree (' + ($(if ($Build) { '-Build' } else { 'src/ changed' })) + ')...')
    & nova build src/crew_hub.nv -o target/crew-hub.exe
    if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine('nova build src/crew_hub.nv failed'); exit 1 }
    & nova build src/crew_harness.nv -o target/crew-harness.exe
    if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine('nova build src/crew_harness.nv failed'); exit 1 }
} else {
    $front = Join-Path $mainCopy 'target/crew-harness.exe'
    $hub = Join-Path $mainCopy 'target/crew-hub.exe'
    if (-not ((Test-Path $front) -and (Test-Path $hub))) {
        [Console]::Error.WriteLine("The built programs of the main copy are not there ($front). Build them in the main copy:")
        [Console]::Error.WriteLine('  nova build src/crew_hub.nv -o target/crew-hub.exe')
        [Console]::Error.WriteLine('  nova build src/crew_harness.nv -o target/crew-harness.exe')
        exit 1
    }
}

if (Test-Path $pidFile) {
    $old = [int](Get-Content $pidFile)
    if (Get-Process -Id $old -ErrorAction SilentlyContinue) {
        $oldPort = Get-Content (Join-Path $dir 'contour.port') -ErrorAction SilentlyContinue
        Write-Output "the contour of this tree is already running: http://127.0.0.1:$oldPort/ (pid $old; stop: powershell -File scripts/test-contour.ps1 -Stop)"
        exit 0
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

function Test-PortFree([int]$p) {
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
        $listener.Start(); $listener.Stop()
        return $true
    } catch { return $false }
}
if ($Port -le 0) {
    for ($p = 8100; $p -lt 8200; $p++) { if (Test-PortFree $p) { $Port = $p; break } }
    if ($Port -le 0) { [Console]::Error.WriteLine('no free port in 8100..8199'); exit 1 }
} elseif (-not (Test-PortFree $Port)) {
    [Console]::Error.WriteLine("port $Port is busy; another one: -Port 0 or a free one"); exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $dir 'data') | Out-Null
$settings = @{
    port = $Port
    data_dir = (Join-Path $dir 'data')
    store = 'files'
    agents = @(@{ id = 'opencode'; label = 'OpenCode'; program = 'opencode.cmd'; args = @('acp') })
    idle_term_seconds = 900
    workdir = ''
    web_dir = (Join-Path $tree 'src/web')
    hub = @{ program = $hub; args = @() }
}
$config = Join-Path $dir 'server.json'
# без BOM: разбор JSON сервера его не принимает
[System.IO.File]::WriteAllText($config, ($settings | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))

$proc = Start-Process -FilePath $front -ArgumentList 'serve', "`"$config`"" -WorkingDirectory $tree -PassThru `
    -RedirectStandardOutput (Join-Path $dir 'front.out.log') -RedirectStandardError (Join-Path $dir 'front.err.log')
Start-Sleep -Milliseconds 800
if ($proc.HasExited) {
    [Console]::Error.WriteLine("the front exited at once ($($proc.ExitCode)); the log: $(Join-Path $dir 'front.err.log')")
    exit 1
}
Set-Content $pidFile $proc.Id
Set-Content (Join-Path $dir 'contour.port') $Port
Write-Output "the test contour of this tree is up: http://127.0.0.1:$Port/"
Write-Output "give the link to the owner and record the mark: crew_task {action: `"contour`", n: <N>, link: `"http://127.0.0.1:$Port/`"}"
Write-Output "stop: powershell -File scripts/test-contour.ps1 -Stop (data: $dir)"
