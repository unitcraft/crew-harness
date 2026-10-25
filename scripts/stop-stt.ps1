# stop-stt.ps1 - stops the local speech recognizer started by scripts/start-stt.ps1 (whisper-server on 127.0.0.1:8178).
#
#   powershell -File scripts/stop-stt.ps1            stops it; prints 0 when nothing is left
#   powershell -File scripts/stop-stt.ps1 -DryRun    only names the processes
#
# It stops only the `whisper-server.exe` that listens on the port (CREW_STT_PORT, default 8178) - never a process by name alone.
param(
    [switch]$DryRun
)

$port = if ($env:CREW_STT_PORT) { [int]$env:CREW_STT_PORT } else { 8178 }
$owners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
$mine = @()
foreach ($id in $owners) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'whisper-server') { $mine += $p }
}
if ($DryRun) {
    $mine | ForEach-Object { Write-Host "whisper-server, process $($_.Id), port $port" }
    exit 0
}
foreach ($p in $mine) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500
$left = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Where-Object {
    (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -eq 'whisper-server' })
Write-Host $left.Count
