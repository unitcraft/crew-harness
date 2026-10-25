# test-install-stt.ps1 - the unit tests of scripts/install-stt.ps1 (task 192l): the manifest, the size and SHA256 check, the unpacking, the "in place" marker.
#   powershell -File scripts/tests/test-install-stt.ps1       prints "N/N" and exits 0 when all pass
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'install-stt.ps1')

$script:pass = 0
$script:fail = 0
function Check([string]$name, [bool]$ok) {
    if ($ok) { $script:pass++ } else { $script:fail++; [Console]::Error.WriteLine("FAIL: $name") }
}
function Throws([scriptblock]$block) {
    try { & $block | Out-Null; return $false } catch { return $true }
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("crew-install-stt-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
    $repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    # the manifest of the repository is a good one
    $real = Read-SttManifest (Join-Path $repo 'tools/stt/manifest.json')
    Check 'repo manifest: binary has https url and sha256' (([string]$real.binary.url).StartsWith('https://') -and $real.binary.sha256.Length -eq 64)
    Check 'repo manifest: small and medium' ((@($real.models.PSObject.Properties.Name) -contains 'small') -and (@($real.models.PSObject.Properties.Name) -contains 'medium'))
    Check 'repo manifest: default model small' ($real.default_model -eq 'small')
    Check 'repo manifest: sizes' (($real.binary.size -eq 684913404) -and ($real.models.small.size -eq 487601967))

    # a good small manifest, and the wrong ones
    function New-Good {
        @{
            version = 1
            binary = @{ url = 'https://x/y.zip'; file = 'y.zip'; size = 10; sha256 = ('a' * 64); dest = 'bin'; check = 'bin/w.exe'; strip = 'R/' }
            default_model = 'm'
            models = @{ m = @{ url = 'https://x/m.bin'; file = 'm.bin'; size = 5; sha256 = ('b' * 64); dest = 'models/m.bin' } }
        }
    }
    function Write-Manifest($obj, $name) {
        $p = Join-Path $tmp $name
        ($obj | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $p -Encoding UTF8
        $p
    }
    $good = New-Good
    $okPath = Write-Manifest $good 'good.json'
    Check 'manifest: a good one is read' ((Read-SttManifest $okPath).default_model -eq 'm')
    Check 'manifest: missing file' (Throws { Read-SttManifest (Join-Path $tmp 'nope.json') })
    $bad = New-Good; $bad.binary.sha256 = 'abc'
    Check 'manifest: short sha256' (Throws { Read-SttManifest (Write-Manifest $bad 'b1.json') })
    $bad = New-Good; $bad.binary.url = 'http://x/y.zip'
    Check 'manifest: http url' (Throws { Read-SttManifest (Write-Manifest $bad 'b2.json') })
    $bad = New-Good; $bad.binary.size = 0
    Check 'manifest: zero size' (Throws { Read-SttManifest (Write-Manifest $bad 'b3.json') })
    $bad = New-Good; $bad.binary.dest = '../evil'
    Check 'manifest: dest leaves the folder' (Throws { Read-SttManifest (Write-Manifest $bad 'b4.json') })
    $bad = New-Good; $bad.default_model = 'zzz'
    Check 'manifest: default model not listed' (Throws { Read-SttManifest (Write-Manifest $bad 'b5.json') })
    $bad = New-Good; $bad.version = 2
    Check 'manifest: version 2' (Throws { Read-SttManifest (Write-Manifest $bad 'b6.json') })
    $bad = @{ version = 1; default_model = 'm'; models = $good.models }
    Check 'manifest: no binary' (Throws { Read-SttManifest (Write-Manifest $bad 'b7.json') })

    # size and SHA256
    $f = Join-Path $tmp 'data.bin'
    [IO.File]::WriteAllBytes($f, [Text.Encoding]::ASCII.GetBytes('hello'))
    $sha = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    Check 'file: matches' ($null -eq (Test-SttFile $f 5 $sha))
    Check 'file: uppercase sha256 of the manifest is accepted' ($null -eq (Test-SttFile $f 5 $sha.ToUpperInvariant()))
    Check 'file: wrong size' ([bool](Test-SttFile $f 6 $sha))
    Check 'file: wrong sha256' ([bool](Test-SttFile $f 5 ('0' * 64)))
    Check 'file: missing' ((Test-SttFile (Join-Path $tmp 'none') 5 $sha) -eq 'missing')
    Assert-SttDownload $f 5 $sha 'ok'
    Check 'download: a good one stays' (Test-Path -LiteralPath $f)
    Check 'download: a bad one stops the script' (Throws { Assert-SttDownload $f 5 ('0' * 64) 'The file' })
    Check 'download: a bad one is deleted' (-not (Test-Path -LiteralPath $f))

    # unpacking: the leading folder is stripped, a name that leaves the folder is refused
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = Join-Path $tmp 'a.zip'
    $z = [IO.Compression.ZipFile]::Open($zip, 'Create')
    foreach ($n in @('R/whisper-server.exe', 'R/sub/x.dll')) {
        $e = $z.CreateEntry($n); $s = $e.Open(); $b = [Text.Encoding]::ASCII.GetBytes('x'); $s.Write($b, 0, $b.Length); $s.Dispose()
    }
    $z.Dispose()
    $out = Join-Path $tmp 'out'
    Expand-SttZip $zip $out 'R/'
    Check 'unzip: stripped names' ((Test-Path (Join-Path $out 'whisper-server.exe')) -and (Test-Path (Join-Path $out 'sub/x.dll')))
    $evil = Join-Path $tmp 'evil.zip'
    $z = [IO.Compression.ZipFile]::Open($evil, 'Create')
    $e = $z.CreateEntry('../escape.txt'); $s = $e.Open(); $s.WriteByte(1); $s.Dispose()
    $z.Dispose()
    Check 'unzip: a name that leaves the folder is refused' (Throws { Expand-SttZip $evil (Join-Path $tmp 'out2') '' })
    Check 'unzip: nothing escaped' (-not (Test-Path (Join-Path $tmp 'escape.txt')))

    # "in place": the exe and the marker with the SHA256 of the archive
    $inst = Join-Path $tmp 'inst'
    New-Item -ItemType Directory -Force -Path (Join-Path $inst 'bin') | Out-Null
    $binary = (New-Good).binary | ConvertTo-Json | ConvertFrom-Json
    Check 'installed: nothing yet' (-not (Test-SttBinaryInstalled $inst $binary))
    Set-Content -LiteralPath (Join-Path $inst 'bin/w.exe') -Value 'x'
    Check 'installed: no marker' (-not (Test-SttBinaryInstalled $inst $binary))
    Set-Content -LiteralPath (Join-Path $inst 'bin/.sha256') -Value ('c' * 64)
    Check 'installed: another archive' (-not (Test-SttBinaryInstalled $inst $binary))
    Set-Content -LiteralPath (Join-Path $inst 'bin/.sha256') -Value ('a' * 64)
    Check 'installed: the marker is right' (Test-SttBinaryInstalled $inst $binary)

    # the folder: CREW_STT_DIR first, then LOCALAPPDATA
    $oldDir = $env:CREW_STT_DIR; $oldLocal = $env:LOCALAPPDATA
    try {
        $env:CREW_STT_DIR = 'C:/work/somewhere/stt'
        Check 'dir: CREW_STT_DIR' ((Get-SttDir) -eq 'C:/work/somewhere/stt')
        $env:CREW_STT_DIR = ''
        $env:LOCALAPPDATA = 'C:/work/local'
        Check 'dir: LOCALAPPDATA default' ((Get-SttDir).Replace('\', '/') -eq 'C:/work/local/crew-harness/stt')
        $env:LOCALAPPDATA = ''
        Check 'dir: neither is an error' (Throws { Get-SttDir })
    } finally { $env:CREW_STT_DIR = $oldDir; $env:LOCALAPPDATA = $oldLocal }
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
$total = $script:pass + $script:fail
Write-Host "$($script:pass)/$total"
if ($script:fail -gt 0) { exit 1 }
