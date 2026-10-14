# Build a minimal, credential-free offline ZIP from the current game assets.
# Run from any directory: powershell -File scripts/package-offline.ps1
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distRoot = Join-Path $projectRoot 'dist'
$entryHtml = [IO.File]::ReadAllText((Join-Path $distRoot 'index.html'))
$versionMatch = [regex]::Match($entryHtml, 'core\.js\?v=(\d+)')
if (-not $versionMatch.Success) { throw 'Missing game resource version.' }
$versionTag = 'v' + $versionMatch.Groups[1].Value
foreach ($resource in @('game.js', 'style.css')) {
    $escapedResource = [regex]::Escape($resource)
    if ($entryHtml -notmatch ($escapedResource + '\?v=' + $versionMatch.Groups[1].Value + '["'']')) {
        throw "Resource version mismatch: $resource"
    }
}
$requiredFiles = @('index.html', 'core.js', 'game.js', 'style.css')
foreach ($name in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $distRoot $name) -PathType Leaf)) {
        throw "Missing offline asset: $name"
    }
}
# Fail before packaging if future markup starts depending on an unshipped asset.
$runtimeReferences = @(
    [regex]::Matches($entryHtml, '<(?:script|link|img|source|audio|video)\b[^>]*\b(?:src|href)=["'']([^"'']+)["'']', 'IgnoreCase') |
        ForEach-Object { $_.Groups[1].Value }
)
$runtimeCss = [IO.File]::ReadAllText((Join-Path $distRoot 'style.css'))
$runtimeReferences += @(
    [regex]::Matches($runtimeCss, 'url\(\s*["'']?([^\s)"'']+)', 'IgnoreCase') |
        ForEach-Object { $_.Groups[1].Value }
)
foreach ($runtimeReference in $runtimeReferences) {
    if ($runtimeReference -match '^(data:|#)') { continue }
    $localReference = [Uri]::UnescapeDataString(($runtimeReference -split '[?#]', 2)[0]) -replace '^\./', ''
    if (-not ($requiredFiles -ccontains $localReference)) {
        throw "Unshipped or external runtime asset: $runtimeReference"
    }
}
$instructions = Join-Path $projectRoot 'docs/离线游玩说明.txt'
if (-not (Test-Path -LiteralPath $instructions -PathType Leaf)) { throw 'Missing play instructions.' }
if ([IO.File]::ReadAllText($instructions) -notmatch ('· ' + $versionTag + ' ')) {
    throw 'Instructions and game version do not match.'
}
$releaseRoot = Join-Path $projectRoot 'releases'
[void][IO.Directory]::CreateDirectory($releaseRoot)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
$archivePath = Join-Path $releaseRoot "霓虹炼金场-$versionTag-离线试玩-$stamp.zip"
$folder = "霓虹炼金场-$versionTag"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($name in $requiredFiles) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, (Join-Path $distRoot $name), "$folder/$name", [IO.Compression.CompressionLevel]::Optimal)
    }
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $instructions, "$folder/先读我.txt", [IO.Compression.CompressionLevel]::Optimal)
} finally { $zip.Dispose() }

# Verify that each shipped file is byte-identical to the game being played locally.
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if ($zip.Entries.Count -ne 5) { throw 'Unexpected archive contents.' }
    foreach ($name in @($requiredFiles) + '先读我.txt') {
        $entry = $zip.GetEntry("$folder/$name")
        if ($null -eq $entry) { throw "Missing ZIP entry: $name" }
        $sourcePath = if ($name -eq '先读我.txt') { $instructions } else { Join-Path $distRoot $name }
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $actualHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose(); $sha.Dispose() }
        $expectedHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
        if ($actualHash -ne $expectedHash) { throw "ZIP file mismatch: $name" }
    }
} finally { $zip.Dispose() }
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
