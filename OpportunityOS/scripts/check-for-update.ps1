$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$localDataRoot = if ($env:APPDATA) { $env:APPDATA } else { $env:USERPROFILE }
$settingsFile = Join-Path (Join-Path $localDataRoot 'OpportunityOS') 'update-settings.json'

function Show-UpdateMessage([string]$message, [string]$icon = 'Information') {
    Add-Type -AssemblyName System.Windows.Forms
    $messageIcon = [System.Windows.Forms.MessageBoxIcon]::$icon
    [System.Windows.Forms.MessageBox]::Show($message, 'Tender Control Update', [System.Windows.Forms.MessageBoxButtons]::OK, $messageIcon) | Out-Null
}

try {
    if (!(Test-Path -LiteralPath $settingsFile)) { exit 0 }
    $settings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
    $updateFolder = [string]$settings.folderPath
    if ([string]::IsNullOrWhiteSpace($updateFolder) -or !(Test-Path -LiteralPath $updateFolder -PathType Container)) { exit 0 }

    $manifestPath = Join-Path $updateFolder 'latest.json'
    if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) { exit 0 }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $installedPackage = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
    $installedVersion = [version](([string]$installedPackage.version -split '[+-]')[0])
    $availableVersion = [version](([string]$manifest.version -split '[+-]')[0])
    if ($availableVersion -le $installedVersion) { exit 0 }

    $packageName = [string]$manifest.package
    if (!$packageName -or [IO.Path]::GetFileName($packageName) -ne $packageName) { throw 'The update manifest contains an invalid package name.' }
    $packagePath = Join-Path $updateFolder $packageName
    if (!(Test-Path -LiteralPath $packagePath -PathType Leaf)) { throw "The update package was not found: $packageName" }
    if ([string]::IsNullOrWhiteSpace([string]$manifest.sha256)) { throw 'The update manifest does not contain a SHA-256 checksum.' }
    $actualHash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash
    if ($actualHash -ine [string]$manifest.sha256) { throw 'The update package is incomplete or damaged.' }

    Show-UpdateMessage "A new version of Tender Control is available ($availableVersion). It will be installed now."
    $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('OpportunityOS-update-' + [Guid]::NewGuid().ToString('N'))
    $extractedRoot = Join-Path $temporaryRoot 'new'
    $backupRoot = Join-Path $temporaryRoot 'backup'
    New-Item -ItemType Directory -Path $extractedRoot, $backupRoot -Force | Out-Null
    Expand-Archive -LiteralPath $packagePath -DestinationPath $extractedRoot -Force
    $newPackagePath = Join-Path $extractedRoot 'package.json'
    if (!(Test-Path -LiteralPath $newPackagePath)) { throw 'The update package has an invalid structure.' }
    $newPackage = Get-Content -LiteralPath $newPackagePath -Raw | ConvertFrom-Json
    if ([string]$newPackage.version -ne [string]$manifest.version) { throw 'The package version does not match the update manifest.' }

    $oldLockHash = if (Test-Path (Join-Path $projectRoot 'package-lock.json')) { (Get-FileHash (Join-Path $projectRoot 'package-lock.json') -Algorithm SHA256).Hash } else { '' }
    $copyExclusions = @('.git', 'node_modules', 'dist', 'dev-dist', '.tmp')
    & robocopy.exe $projectRoot $backupRoot /E /NFL /NDL /NJH /NJS /NP /XD $copyExclusions | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "The current installation could not be backed up (code $LASTEXITCODE)." }

    try {
        & robocopy.exe $extractedRoot $projectRoot /E /NFL /NDL /NJH /NJS /NP /XD $copyExclusions | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "The update files could not be installed (code $LASTEXITCODE)." }
        $newLockHash = if (Test-Path (Join-Path $projectRoot 'package-lock.json')) { (Get-FileHash (Join-Path $projectRoot 'package-lock.json') -Algorithm SHA256).Hash } else { '' }
        if ($newLockHash -ne $oldLockHash) {
            Push-Location $projectRoot
            try {
                & npm.cmd install --include=dev --no-audit --no-fund
                if ($LASTEXITCODE -ne 0) { throw 'Dependencies could not be updated.' }
            } finally { Pop-Location }
        }

        # The release archive intentionally excludes dist. Rebuild it before
        # declaring the update complete so the normal launcher can serve the
        # stable, non-HMR application immediately.
        Push-Location $projectRoot
        try {
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'The stable application build could not be created.' }
        } finally { Pop-Location }
    } catch {
        & robocopy.exe $backupRoot $projectRoot /E /NFL /NDL /NJH /NJS /NP /XD $copyExclusions | Out-Null
        throw
    }

    Show-UpdateMessage "Tender Control was updated successfully to version $availableVersion."
} catch {
    try { Show-UpdateMessage ("The update could not be installed.`r`n`r`n" + $_.Exception.Message + "`r`n`r`nTender Control will open using the current version.") 'Warning' } catch {}
} finally {
    if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

exit 0
