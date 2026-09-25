$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $projectRoot 'package.json'
$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$releaseVersion = [string]$packageJson.version

if ($releaseVersion -notmatch '^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$') {
    throw "package.json contains an invalid release version: $releaseVersion"
}

Write-Host "Preparing Tender Control version $releaseVersion..."
Push-Location $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'The production build failed.' }

    & npm.cmd run check:server
    if ($LASTEXITCODE -ne 0) { throw 'The local server check failed.' }
} finally {
    Pop-Location
}

Add-Type -AssemblyName System.Windows.Forms
$folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
$folderDialog.Description = 'Select the synchronized SharePoint folder where the update will be published.'
$folderDialog.ShowNewFolderButton = $true
if ($folderDialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host 'Publishing was cancelled.'
    exit 0
}
$destination = $folderDialog.SelectedPath

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("OpportunityOS-publish-" + [Guid]::NewGuid().ToString('N'))
$stagingRoot = Join-Path $temporaryRoot 'OpportunityOS'
$zipName = "OpportunityOS-$releaseVersion.zip"
$zipPath = Join-Path $destination $zipName
$manifestPath = Join-Path $destination 'latest.json'

try {
    New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
    $excludedDirectories = @('.git', '.claude', '.tmp', 'node_modules', 'dist', 'dev-dist')
    $excludedFiles = @('.opportunityos-setup-complete', '.vite-test.err.log', '.vite-test.out.log', 'latest.json', '*.zip', 'CLAUDE.md', 'AGENTS.md', 'CODEX.md', 'GEMINI.md', 'release-manifest.json')
    $robocopyArgs = @($projectRoot, $stagingRoot, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XD') + $excludedDirectories + @('/XF') + $excludedFiles
    & robocopy.exe @robocopyArgs | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Could not prepare the update files (Robocopy exit code $LASTEXITCODE)." }

    $managedFiles = @(Get-ChildItem -LiteralPath $stagingRoot -File -Recurse | ForEach-Object { $_.FullName.Substring($stagingRoot.Length).TrimStart('\\') } | Sort-Object)
    [ordered]@{ schema = 1; version = $releaseVersion; managedFiles = $managedFiles } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $stagingRoot 'release-manifest.json') -Encoding UTF8
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest = [ordered]@{
        version = $releaseVersion
        package = $zipName
        sha256 = $hash
        publishedAt = [DateTime]::UtcNow.ToString('o')
    }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Copy-Item -LiteralPath (Join-Path $projectRoot 'ACTUALIZAR_TENDER_CONTROL.cmd') -Destination (Join-Path $destination 'ACTUALIZAR_TENDER_CONTROL.cmd') -Force
    Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts\install-update-v2.ps1') -Destination (Join-Path $destination 'install-update-v2.ps1') -Force

    [System.Windows.Forms.MessageBox]::Show(
        "Tender Control $releaseVersion was published successfully.`r`n`r`n$zipName`r`nlatest.json`r`nACTUALIZAR_TENDER_CONTROL.cmd`r`ninstall-update-v2.ps1`r`n`r`nFor a manual update, keep these four files together and open ACTUALIZAR_TENDER_CONTROL.cmd.",
        'Tender Control Update Publisher',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    Write-Host "Published successfully to: $destination"
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
