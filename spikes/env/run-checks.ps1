# Builds and checks all spike programs. Windows PowerShell 5.1 or 7.
#   powershell -File run-checks.ps1 -NovaHome C:/work/nova-oracle-0.1.0-windows-x86_64 [-Port 18091]
# Changes nothing outside the session: PATH and the Nova variables are set for this process only.
param(
    [Parameter(Mandatory = $true)][string]$NovaHome,
    [int]$Port = 18091
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $NovaHome "setup-env.ps1") | Out-Null
$failed = 0

function Step($name, [scriptblock]$body) {
    Write-Host "=== $name"
    try { & $body; if ($LASTEXITCODE -ne 0) { throw "exit code $LASTEXITCODE" } }
    catch { Write-Host "FAILED: $name ($_)"; $script:failed++ }
}
function Build($dir, $file) {
    Push-Location (Join-Path $here $dir)
    # ORACLE-WORKAROUND(5): the output of `nova build` is filtered, because dozens of lint warnings from the dependency packages hide the real errors; print the whole output when item 5 is fixed
    try { cmd /c "nova build $file 2>&1" | Where-Object { $_ -match '^built|error' } } finally { Pop-Location }
    if (-not (Test-Path (Join-Path (Join-Path $here $dir) ($file -replace '\.nv$', '.exe')))) { throw "no exe" }
    $global:LASTEXITCODE = 0
}

Step "hello" { Build "hello" "hello.nv"; Push-Location "$here\hello"; .\hello.exe; Pop-Location }
Step "child_echo" { Build "child_echo" "child_echo.nv"; Push-Location "$here\child_echo"; .\child_echo.exe; Pop-Location }
Step "ws_echo" {
    Push-Location "$here\ws_echo"
    try {
        nova update | Out-Null
        Build "ws_echo" "ws_echo.nv"
        $srv = Start-Process -FilePath .\ws_echo.exe -ArgumentList $Port -PassThru -WindowStyle Hidden
        try { Start-Sleep -Seconds 2; node ws_echo_check.mjs $Port } finally { Stop-Process -Id $srv.Id -Force }
    } finally { Pop-Location }
}
Step "acp_initialize" { node "$here\acp\acp_initialize.mjs" }

if ($failed -eq 0) { Write-Host "ALL STEPS PASSED" } else { Write-Host "$failed STEP(S) FAILED"; exit 1 }
