# start-stt.ps1 - starts the local speech recognizer of the control panel (task 192f): whisper.cpp `whisper-server`,
# hidden, on 127.0.0.1:8178 (the panel sends the voice to it through `POST /api/stt`, see src/server/README.md).
#
#   $env:CREW_STT_DIR = '<folder>'; powershell -File scripts/start-stt.ps1
#
# CREW_STT_DIR is the folder that holds `bin/whisper-server.exe` (with its dlls) and `models/<model>.bin`; it lives outside the
# repository, so nothing about the machine is written here. Without it the script only says so.
# Optional: CREW_STT_MODEL (file in models/, default ggml-small.bin), CREW_STT_LANGUAGE (default auto), CREW_STT_PORT (default 8178;
# then set `stt.url` of the settings file or CREW_SERVER_STT_URL to the same port).
# The log is `<CREW_STT_DIR>/server.log` (+ `server.err.log`). It stops with scripts/stop-stt.ps1. Started twice, it does nothing the second time.
param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$dir = $env:CREW_STT_DIR
if ([string]::IsNullOrWhiteSpace($dir)) {
    # the word "set" in Russian is written as escapes: the file stays ASCII
    $ru = [regex]::Unescape('\u0437\u0430\u0434\u0430\u0439\u0442\u0435')
    [Console]::Error.WriteLine("CREW_STT_DIR is not set: $ru CREW_STT_DIR (the folder with bin/whisper-server.exe and models/).")
    exit 1
}
$model = if ($env:CREW_STT_MODEL) { $env:CREW_STT_MODEL } else { 'ggml-small.bin' }
$language = if ($env:CREW_STT_LANGUAGE) { $env:CREW_STT_LANGUAGE } else { 'auto' }
$port = if ($env:CREW_STT_PORT) { [int]$env:CREW_STT_PORT } else { 8178 }
$exe = Join-Path $dir 'bin/whisper-server.exe'
$modelPath = Join-Path $dir (Join-Path 'models' $model)
foreach ($need in @($exe, $modelPath)) {
    if (-not (Test-Path -LiteralPath $need)) {
        [Console]::Error.WriteLine("Not found: $need (CREW_STT_DIR must hold bin/whisper-server.exe and models/$model).")
        exit 1
    }
}

function Test-Recognizer {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 2
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

if (Test-Recognizer) {
    if (-not $Quiet) { Write-Host "The recognizer already answers on 127.0.0.1:$port." }
    exit 0
}

$log = Join-Path $dir 'server.log'
$err = Join-Path $dir 'server.err.log'
$started = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru `
    -WorkingDirectory (Join-Path $dir 'bin') `
    -RedirectStandardOutput $log -RedirectStandardError $err `
    -ArgumentList @('-m', $modelPath, '--host', '127.0.0.1', '--port', "$port", '-l', $language)

# the model loads in a few seconds (the first start on the GPU is the slowest)
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if ($started.HasExited) { break }
    if (Test-Recognizer) { $ready = $true; break }
}
if (-not $ready) {
    [Console]::Error.WriteLine("The recognizer did not come up (see $err).")
    exit 1
}
if (-not $Quiet) { Write-Host "The recognizer is up on 127.0.0.1:$port (process $($started.Id), model $model, language $language)." }
