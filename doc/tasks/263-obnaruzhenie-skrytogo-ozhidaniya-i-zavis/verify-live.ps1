param([Parameter(Mandatory=$true)][string]$NovaHome, [string]$RepoRoot, [string]$OutputName = 'candidate')
$ErrorActionPreference = 'Stop'
$projectRoot = if ($RepoRoot) { (Resolve-Path $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path }
. (Join-Path $NovaHome 'setup-env.ps1')
$out = Join-Path $projectRoot "target/263-live-$OutputName"
New-Item -ItemType Directory -Force -Path $out | Out-Null
# Nova's summary counts test executables, not test blocks. Preserve and run the actual executable for full output.
$env:NOVA_DEBUG_RUN_DUMP = '1'
$compiler = Start-Process -FilePath (Join-Path $NovaHome 'nova.exe') -ArgumentList @('test','src/server_live/hub_test.nv','--jobs','1','--timeout','900','--keep-artifacts','--color','never') -WorkingDirectory $projectRoot -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $out 'nova.out') -RedirectStandardError (Join-Path $out 'nova.err')
$null = $compiler.Handle
$compiler.WaitForExit()
$temp = Join-Path $env:TEMP "nova_tests-$($compiler.Id)"
$executables = @(Get-ChildItem $temp -Recurse -Filter 'hub_test.exe' -ErrorAction SilentlyContinue)
if ($executables.Count -ne 1) { throw "Expected one retained hub_test.exe; found $($executables.Count); see $out/nova.*" }
Write-Output "Retained executable: $($executables[0].FullName)"
Get-FileHash $executables[0].FullName -Algorithm SHA256 | Format-List
$runner = Start-Process -FilePath $executables[0].FullName -WorkingDirectory $projectRoot -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $out 'raw.out') -RedirectStandardError (Join-Path $out 'raw.err')
$null = $runner.Handle
if (-not $runner.WaitForExit(900000)) {
    & taskkill /PID $runner.Id /T /F | Out-Null
    throw 'Own test executable timed out'
}
$runner.WaitForExit()
Write-Output "Nova exit: $($compiler.ExitCode); raw exit: $($runner.ExitCode); logs: $out"
Get-Content (Join-Path $out 'raw.out') | Select-String -Pattern 'ask_user_question|FAIL|passed|failed'
exit $runner.ExitCode
