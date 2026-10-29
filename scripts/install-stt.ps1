# install-stt.ps1 - installs the local speech recognizer of the control panel (task 192l): whisper.cpp (`whisper-server`) and a model.
#
#   powershell -File scripts/install-stt.ps1                 installs the default model (small)
#   powershell -File scripts/install-stt.ps1 -Model medium   installs another model of the manifest
#   powershell -File scripts/install-stt.ps1 -Check          only says whether everything is in place (exit 0 - yes, 1 - no)
#
# The files are not in the repository (685 MB and 488 MB): the addresses, sizes and SHA256 are in tools/stt/manifest.json. The script downloads
# what is missing into `<tool folder>/_download`, checks the size and the SHA256 (a mismatch stops it and deletes the file), unpacks, and
# says what it did. A second run downloads nothing when the files are in place and their SHA256 are right.
# The tool folder (the same one the control panel looks in; the setting voice.dir / stt.dir names another): CREW_VOICE_DIR, CREW_STT_DIR, an older install in
# %LOCALAPPDATA%/crew-harness/stt that is still there, CREW_TOOLS_DIR/whisper, <CREW_HOME>/tools/whisper, else ~/.crew-harness/tools/whisper (task 192.12, ADR-0016).
# No path of a machine is written in the repository.
param(
    [string]$Model = '',
    [switch]$Check,
    [string]$Manifest = ''
)

$ErrorActionPreference = 'Stop'

# ----- the parts that the tests call (scripts/tests/test-install-stt.ps1) -----

function Get-SttDir {
    if (-not [string]::IsNullOrWhiteSpace($env:CREW_VOICE_DIR)) { return $env:CREW_VOICE_DIR }
    if (-not [string]::IsNullOrWhiteSpace($env:CREW_STT_DIR)) { return $env:CREW_STT_DIR }
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $older = Join-Path $env:LOCALAPPDATA 'crew-harness/stt'
        if (Test-Path (Join-Path $older 'bin/whisper-server.exe')) { return $older }
    }
    if (-not [string]::IsNullOrWhiteSpace($env:CREW_TOOLS_DIR)) { return (Join-Path $env:CREW_TOOLS_DIR 'whisper') }
    if (-not [string]::IsNullOrWhiteSpace($env:CREW_HOME)) { return (Join-Path $env:CREW_HOME 'tools/whisper') }
    $home_dir = $env:USERPROFILE
    if ([string]::IsNullOrWhiteSpace($home_dir)) { $home_dir = $env:HOME }
    if (-not [string]::IsNullOrWhiteSpace($home_dir)) { return (Join-Path $home_dir '.crew-harness/tools/whisper') }
    throw 'No folder known: name it in CREW_VOICE_DIR (or CREW_STT_DIR, CREW_TOOLS_DIR, CREW_HOME).'
}

function Assert-ManifestEntry($entry, $what, $needStrip) {
    foreach ($key in @('url', 'file', 'size', 'sha256', 'dest')) {
        if (-not $entry.PSObject.Properties[$key]) { throw "Manifest: $what has no '$key'." }
    }
    if (-not ([string]$entry.url).StartsWith('https://')) { throw "Manifest: $what url must be https://." }
    if ([int64]$entry.size -le 0) { throw "Manifest: $what size must be positive." }
    if (-not ([string]$entry.sha256 -match '^[0-9a-f]{64}$')) { throw "Manifest: $what sha256 must be 64 lowercase hex digits." }
    $dest = [string]$entry.dest
    if ($dest.Contains('..') -or $dest.StartsWith('/') -or $dest.Contains(':')) { throw "Manifest: $what dest must be a relative path inside the folder." }
}

# The manifest as an object; throws a sentence on a wrong one.
function Read-SttManifest([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Manifest not found: $path" }
    $m = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($m.version -ne 1) { throw 'Manifest: version must be 1.' }
    if (-not $m.binary) { throw "Manifest: no 'binary'." }
    Assert-ManifestEntry $m.binary 'binary' $true
    if (-not $m.binary.check) { throw "Manifest: binary has no 'check'." }
    if (-not $m.models) { throw "Manifest: no 'models'." }
    $names = @($m.models.PSObject.Properties.Name)
    if ($names.Count -eq 0) { throw 'Manifest: no model.' }
    foreach ($n in $names) { Assert-ManifestEntry $m.models.$n "model '$n'" $false }
    if (-not $m.default_model -or ($names -notcontains [string]$m.default_model)) { throw 'Manifest: default_model is not among models.' }
    $m
}

# $null - the file is as the manifest says; else the reason (size or SHA256 differs, or the file is missing).
function Test-SttFile([string]$path, [int64]$size, [string]$sha256) {
    if (-not (Test-Path -LiteralPath $path)) { return 'missing' }
    $len = (Get-Item -LiteralPath $path).Length
    if ($len -ne $size) { return "size $len, expected $size" }
    $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $sha256.ToLowerInvariant()) { return "sha256 $actual, expected $sha256" }
    $null
}

# A downloaded file is verified; one that does not match is deleted and the script stops.
function Assert-SttDownload([string]$path, [int64]$size, [string]$sha256, [string]$label) {
    $why = Test-SttFile $path $size $sha256
    if ($why) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        throw "$label does not match the manifest ($why); the file is deleted."
    }
}

function Get-SttFile([string]$url, [string]$to) {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        & $curl.Source -fsSL --retry 3 --retry-delay 3 -o $to $url
        if ($LASTEXITCODE -ne 0) { throw "Download failed (curl exit code $LASTEXITCODE): $url" }
    } else {
        (New-Object System.Net.WebClient).DownloadFile($url, $to)
    }
}

# Unpack a zip into $destDir, dropping the leading $strip of every name; names that would leave the folder are refused.
function Expand-SttZip([string]$zip, [string]$destDir, [string]$strip) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $root = [IO.Path]::GetFullPath($destDir)
    if (-not $root.EndsWith([IO.Path]::DirectorySeparatorChar)) { $root += [IO.Path]::DirectorySeparatorChar }
    $archive = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
        foreach ($e in $archive.Entries) {
            $name = $e.FullName
            if ($strip -and $name.StartsWith($strip)) { $name = $name.Substring($strip.Length) }
            if ([string]::IsNullOrEmpty($name) -or $name.EndsWith('/')) { continue }
            $target = [IO.Path]::GetFullPath((Join-Path $root $name))
            if (-not $target.StartsWith($root)) { throw "The archive holds a name that leaves the folder: $($e.FullName)" }
            New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $target, $true)
        }
    } finally { $archive.Dispose() }
}

# Is the binary part in place? The marker `bin/.sha256` holds the SHA256 of the archive it was unpacked from.
function Test-SttBinaryInstalled([string]$dir, $binary) {
    $exe = Join-Path $dir ([string]$binary.check)
    $marker = Join-Path $dir (Join-Path ([string]$binary.dest) '.sha256')
    if (-not (Test-Path -LiteralPath $exe)) { return $false }
    if (-not (Test-Path -LiteralPath $marker)) { return $false }
    ((Get-Content -LiteralPath $marker -Raw).Trim().ToLowerInvariant()) -eq ([string]$binary.sha256).ToLowerInvariant()
}

function Install-SttMain {
    $repo = Split-Path -Parent $PSScriptRoot
    $manifestPath = if ($Manifest) { $Manifest } else { Join-Path $repo 'tools/stt/manifest.json' }
    $m = Read-SttManifest $manifestPath
    $name = if ($Model) { $Model } else { [string]$m.default_model }
    if (-not $m.models.PSObject.Properties[$name]) {
        throw "No model '$name' in the manifest (there are: $(@($m.models.PSObject.Properties.Name) -join ', '))."
    }
    $entry = $m.models.$name
    $dir = Get-SttDir
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $modelPath = Join-Path $dir ([string]$entry.dest)
    $binOk = Test-SttBinaryInstalled $dir $m.binary
    $modelWhy = Test-SttFile $modelPath ([int64]$entry.size) ([string]$entry.sha256)

    if ($Check) {
        if ($binOk -and -not $modelWhy) { Write-Host "In place: $dir (model $name)."; exit 0 }
        Write-Host "Not complete: binary $(if ($binOk) { 'ok' } else { 'missing' }), model $name $(if ($modelWhy) { $modelWhy } else { 'ok' }). Run scripts/install-stt.ps1."
        exit 1
    }

    $done = @()
    $tmp = Join-Path $dir '_download'
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
        if (-not $binOk) {
            $zip = Join-Path $tmp ([string]$m.binary.file)
            Write-Host "Downloading $($m.binary.name) $($m.binary.version) ($([math]::Round([int64]$m.binary.size / 1MB)) MB)..."
            Get-SttFile ([string]$m.binary.url) $zip
            Assert-SttDownload $zip ([int64]$m.binary.size) ([string]$m.binary.sha256) 'The archive'
            $binDir = Join-Path $dir ([string]$m.binary.dest)
            $stage = $binDir + '.new'
            if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
            Expand-SttZip $zip $stage ([string]$m.binary.strip)
            if (-not (Test-Path -LiteralPath (Join-Path $stage (Split-Path -Leaf ([string]$m.binary.check))))) { throw 'The archive holds no whisper-server.exe.' }
            Set-Content -LiteralPath (Join-Path $stage '.sha256') -Value ([string]$m.binary.sha256) -Encoding ASCII
            if (Test-Path -LiteralPath $binDir) {
                try { Remove-Item -LiteralPath $binDir -Recurse -Force } catch { throw "The old $binDir cannot be replaced (is the recognizer running? stop the control panel or scripts/stop-stt.ps1): $($_.Exception.Message)" }
            }
            Move-Item -LiteralPath $stage -Destination $binDir
            Remove-Item -LiteralPath $zip -Force
            $done += "binary $($m.binary.version)"
        }
        if ($modelWhy) {
            $file = Join-Path $tmp ([string]$entry.file)
            Write-Host "Downloading model $name ($([math]::Round([int64]$entry.size / 1MB)) MB)..."
            Get-SttFile ([string]$entry.url) $file
            Assert-SttDownload $file ([int64]$entry.size) ([string]$entry.sha256) "The model $name"
            New-Item -ItemType Directory -Force -Path (Split-Path $modelPath) | Out-Null
            Move-Item -LiteralPath $file -Destination $modelPath -Force
            $done += "model $name"
        }
    } finally {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    }
    if ($done.Count -eq 0) {
        Write-Host "Already in place, nothing downloaded: $dir (model $name)."
    } else {
        Write-Host "Installed $($done -join ' and ') into $dir."
    }
    Write-Host "The control panel starts and stops the recognizer itself (setting stt.managed); the folder is the default of stt.dir$(if ($env:CREW_STT_DIR) { ' (CREW_STT_DIR is set: name it in stt.dir or CREW_SERVER_STT_DIR too if the panel does not see the variable)' })."
}

# A dot-sourcing (the tests) only loads the functions.
if ($MyInvocation.InvocationName -ne '.') {
    try { Install-SttMain } catch {
        [Console]::Error.WriteLine("install-stt: $($_.Exception.Message)")
        exit 1
    }
}
