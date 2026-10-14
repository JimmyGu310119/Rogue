# Local-only regression checks. Does not install, publish, sync, or change Git state.
# Run: powershell -File scripts/verify-local.ps1 [-StressSeconds 40] [-RoundtripSeconds 12] [-Package]
[CmdletBinding()]
param(
    [ValidateRange(1, 180)][int]$StressSeconds = 40,
    [ValidateRange(2, 60)][int]$RoundtripSeconds = 12,
    [switch]$Package
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location -LiteralPath $projectRoot
try {
    foreach ($scriptPath in @('dist/core.js', 'dist/game.js', 'tests/core.test.cjs', 'tests/interface.test.cjs', 'scripts/stress-core.cjs', 'scripts/roundtrip-core.cjs')) {
        & node --check $scriptPath
        if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $scriptPath" }
    }
    foreach ($testPath in @('tests/core.test.cjs', 'tests/interface.test.cjs')) {
        & node $testPath
        if ($LASTEXITCODE -ne 0) { throw "Regression check failed: $testPath" }
    }
    & node scripts/stress-core.cjs $StressSeconds
    if ($LASTEXITCODE -ne 0) { throw 'Core stress probe failed.' }
    & node scripts/roundtrip-core.cjs $RoundtripSeconds
    if ($LASTEXITCODE -ne 0) { throw 'Deterministic continuation probe failed.' }
    $safeDirectory = $projectRoot.Replace('\', '/')
    & git -c "safe.directory=$safeDirectory" diff --check
    if ($LASTEXITCODE -ne 0) { throw 'Git whitespace check failed.' }
    if ($Package) { & (Join-Path $PSScriptRoot 'package-offline.ps1') }
    Write-Output 'PASS: local regression and core logic checks; real-browser visuals and FPS remain unverified.'
} finally {
    Pop-Location
}
