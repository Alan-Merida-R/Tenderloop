[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$manifestPath = Join-Path $root 'offline-runtime.json'
$releaseManifestPath = Join-Path $root 'release-manifest.json'
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'offline-runtime.json is missing.'
}
if (!(Test-Path -LiteralPath $releaseManifestPath -PathType Leaf)) {
    throw 'release-manifest.json is missing.'
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 1 -or $manifest.noNetworkInstallation -ne $true) {
    throw 'The offline runtime manifest is invalid.'
}
if ($manifest.nodeArchitecture -ne 'x64') {
    throw 'This Tender Control package does not contain the required x64 runtime.'
}
if ($manifest.frontendHost -ne '127.0.0.1' -or $manifest.backendHost -ne '127.0.0.1') {
    throw 'The package is not restricted to the local computer.'
}

$releaseManifest = Get-Content -LiteralPath $releaseManifestPath -Raw | ConvertFrom-Json
if ($releaseManifest.schema -ne 2 -or [string]$releaseManifest.version -ne [string]$manifest.releaseVersion) {
    throw 'The release integrity manifest is invalid.'
}
$hashEntries = @($releaseManifest.fileHashes)
if ($hashEntries.Count -eq 0 -or $hashEntries.Count -ne @($releaseManifest.managedFiles).Count) {
    throw 'The release integrity manifest is incomplete.'
}
$rootPrefix = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
$checked = 0
foreach ($entry in $hashEntries) {
    $relativePath = [string]$entry.path
    $expectedHash = [string]$entry.sha256
    if ([string]::IsNullOrWhiteSpace($relativePath) -or $relativePath -match '(^|[\/])\.\.([\/]|$)' -or $expectedHash -notmatch '^[0-9a-fA-F]{64}$') {
        throw 'The release integrity manifest contains an unsafe entry.'
    }
    $candidate = [IO.Path]::GetFullPath((Join-Path $root $relativePath))
    if (!$candidate.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "The offline package is missing a managed file: $relativePath"
    }
    if ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -ine $expectedHash) {
        throw "A packaged file failed its SHA-256 integrity check: $relativePath"
    }
    $checked++
    if (($checked % 1000) -eq 0) { Write-Host "[INFO] Verified $checked packaged files..." }
}

$requiredFiles = @(
    'runtime\node.exe',
    'package-lock.json',
    'dist\index.html',
    'server\index.ts',
    'node_modules\tsx\dist\cli.mjs',
    'node_modules\vite\bin\vite.js'
)
foreach ($relativePath in $requiredFiles) {
    if (!(Test-Path -LiteralPath (Join-Path $root $relativePath) -PathType Leaf)) {
        throw "The offline package is incomplete: $relativePath"
    }
}

$nodeHash = (Get-FileHash -LiteralPath (Join-Path $root 'runtime\node.exe') -Algorithm SHA256).Hash
if ($nodeHash -ine [string]$manifest.nodeSha256) {
    throw 'The packaged Node.js runtime failed its SHA-256 integrity check.'
}
$lockHash = (Get-FileHash -LiteralPath (Join-Path $root 'package-lock.json') -Algorithm SHA256).Hash
if ($lockHash -ine [string]$manifest.packageLockSha256) {
    throw 'package-lock.json failed its SHA-256 integrity check.'
}

$nodeVersion = & (Join-Path $root 'runtime\node.exe') --version
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeVersion)) {
    throw 'The packaged Node.js runtime could not start.'
}

Write-Host "[OK] Offline runtime $($manifest.nodeVersion) verified."
Write-Host "[OK] $checked packaged files passed SHA-256 integrity checks."
Write-Host '[OK] Installation requires no npm access and both services are restricted to 127.0.0.1.'
