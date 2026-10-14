# Versioned local source snapshot. No Git writes, credentials or hosting state.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entryHtml = [IO.File]::ReadAllText((Join-Path $projectRoot 'dist/index.html'))
$versionMatch = [regex]::Match($entryHtml, 'core\.js\?v=(\d+)')
if (-not $versionMatch.Success) { throw 'Missing source version.' }
$versionTag = 'V' + $versionMatch.Groups[1].Value
$sourceFiles = [Collections.Generic.List[string]]::new()
foreach ($relative in @('dist/index.html', 'dist/core.js', 'dist/game.js', 'dist/style.css', 'dist/app.js', 'AGENTS.md', '.gitignore')) {
    if (Test-Path -LiteralPath (Join-Path $projectRoot $relative) -PathType Leaf) { $sourceFiles.Add($relative) }
}
# Only known source/document directories and root Markdown, not .git/.openai/accounts.
foreach ($directory in @('tests', 'scripts', 'docs')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse) {
        if ($file.Extension -in @('.js', '.cjs', '.ps1', '.txt', '.md', '.json')) {
            if (-not $file.FullName.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Source escaped project directory.' }
            $sourceFiles.Add($file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/'))
        }
    }
}
foreach ($file in Get-ChildItem -LiteralPath $projectRoot -Filter '*.md' -File) {
    if (-not $sourceFiles.Contains($file.Name)) { $sourceFiles.Add($file.Name) }
}
$manifest = [ordered]@{version=$versionTag; createdAt=(Get-Date).ToString('o'); files=@()}
foreach ($relative in $sourceFiles) {
    $path = Join-Path $projectRoot $relative
    $manifest.files += [ordered]@{path=$relative; bytes=(Get-Item -LiteralPath $path).Length; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}
}
$releaseRoot = Join-Path $projectRoot 'releases'
[void][IO.Directory]::CreateDirectory($releaseRoot)
$archivePath = Join-Path $releaseRoot ("neon-" + $versionTag + "-source-backup-" + (Get-Date -Format 'yyyyMMdd-HHmmssfff') + '.zip')
$folder = 'neon-' + $versionTag
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in $sourceFiles) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $projectRoot $relative), "$folder/$relative", [IO.Compression.CompressionLevel]::Optimal)
    }
    $entry = $zip.CreateEntry("$folder/backup-manifest.json")
    $stream = $entry.Open()
    try { $bytes = [Text.Encoding]::UTF8.GetBytes(($manifest | ConvertTo-Json -Depth 6)); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
} finally { $zip.Dispose() }
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if ($zip.Entries.Count -ne $sourceFiles.Count + 1) { throw 'Unexpected snapshot entries.' }
    foreach ($file in $manifest.files) {
        $stream = $zip.GetEntry("$folder/$($file.path)").Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') } finally { $stream.Dispose(); $sha.Dispose() }
        if ($actual -ne $file.sha256) { throw "Snapshot hash mismatch: $($file.path)" }
    }
} finally { $zip.Dispose() }
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
Write-Output "PASS: $versionTag snapshot; $($sourceFiles.Count) source files verified; hosting and credentials excluded."
