# Stops every OpenCode process (the windows first, the service last) and prints what is left:
# just "0" when nothing is left, otherwise the table of the remaining processes.
# Use it before a service restart (AGENTS.md, rule 12). -DryRun only lists the processes, stops none.
param(
  [int]$WaitSeconds = 15,
  [switch]$DryRun
)

function Get-OpenCode {
  @(Get-CimInstance Win32_Process -Filter "Name='opencode.exe'" -ErrorAction SilentlyContinue)
}

$all = Get-OpenCode
$service = @($all | Where-Object { [string]$_.CommandLine -match 'serve --service' })
$windows = @($all | Where-Object { [string]$_.CommandLine -notmatch 'serve --service' })

if ($DryRun) {
  Write-Host ("windows: {0}, service: {1}" -f $windows.Count, $service.Count)
  $all | Select-Object ProcessId, @{ n = 'Command'; e = { ([string]$_.CommandLine) } } | Format-Table -AutoSize -Wrap
  return
}

foreach ($p in $windows) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($p in $service) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }

$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
  Start-Sleep -Milliseconds 500
  $left = Get-OpenCode
} while ($left.Count -gt 0 -and (Get-Date) -lt $deadline)

if ($left.Count -eq 0) {
  0
} else {
  $left | Select-Object ProcessId, @{ n = 'Command'; e = { ([string]$_.CommandLine) } } | Format-Table -AutoSize -Wrap
}
