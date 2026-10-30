param(
    [Parameter(Mandatory = $true)][string]$NovaHome,
    [string]$TestPath = 'src/server_live/hub_test.nv',
    [int]$CompileTimeout = 120,
    [int]$RunTimeout = 600,
    [string]$RepositoryRoot = '',
    [string]$Output = 'target/260-live-diagnostic'
)
$ErrorActionPreference = 'Stop'
# setup-env defines $root in the caller's scope. Keep the project path in a distinct variable.
$projectRoot = if ($RepositoryRoot) { (Resolve-Path $RepositoryRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path }
. (Join-Path $NovaHome 'setup-env.ps1')
$out = Join-Path $projectRoot $Output
New-Item -ItemType Directory -Force -Path $out | Out-Null
$argsForNova = @('test', $TestPath, '--jobs', '1', '--timeout', [string]$CompileTimeout, '--keep-artifacts', '--color', 'never')
$compileWatch = [Diagnostics.Stopwatch]::StartNew()
$compiler = Start-Process -FilePath (Join-Path $NovaHome 'nova.exe') -ArgumentList $argsForNova -WorkingDirectory $projectRoot -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $out 'nova.out') -RedirectStandardError (Join-Path $out 'nova.err')
$null = $compiler.Handle # Pin the process handle before it exits (PowerShell 5.1 ExitCode).
$compiler.WaitForExit()
$compileWatch.Stop()
if ($null -eq $compiler.ExitCode) { throw 'No exit status from Nova' }
$compileExit = $compiler.ExitCode
$temp = Join-Path $env:TEMP "nova_tests-$($compiler.Id)"
$name = [IO.Path]::GetFileNameWithoutExtension($TestPath) + '.exe'
$executables = @(Get-ChildItem -Path $temp -Recurse -Filter $name -ErrorAction SilentlyContinue)
if ($executables.Count -ne 1) { throw "Expected one $name in $temp; found $($executables.Count). Nova exit $compileExit; see nova.out/nova.err" }
$runWatch = [Diagnostics.Stopwatch]::StartNew()
$runner = Start-Process -FilePath $executables[0].FullName -WorkingDirectory $projectRoot -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $out 'raw.out') -RedirectStandardError (Join-Path $out 'raw.err')
$null = $runner.Handle
$finished = $runner.WaitForExit($RunTimeout * 1000)
if (-not $finished) {
    # Only this diagnostic's own process tree; never stop a service or a process by name.
    & taskkill /PID $runner.Id /T /F | Out-Null
    $runExit = 124
} else {
    $runner.WaitForExit()
    if ($null -eq $runner.ExitCode) { throw 'No exit status from the retained test executable' }
    $runExit = $runner.ExitCode
}
$runWatch.Stop()
$result = @{ nova_pid = $compiler.Id; compile_exit = $compileExit; compile_and_first_run_ms = $compileWatch.ElapsedMilliseconds; runner_pid = $runner.Id; run_exit = $runExit; raw_run_ms = $runWatch.ElapsedMilliseconds; timed_out = (-not $finished); executable = $executables[0].FullName }
[IO.File]::WriteAllText((Join-Path $out 'result.json'), ($result | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
Write-Output "Nova exit: $compileExit; raw executable exit: $runExit; logs: $out"
exit $runExit
