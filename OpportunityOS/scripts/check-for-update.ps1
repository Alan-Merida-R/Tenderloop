$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$localDataRoot = if ($env:APPDATA) { $env:APPDATA } else { $env:USERPROFILE }
$settingsFile = Join-Path (Join-Path $localDataRoot 'OpportunityOS') 'update-settings.json'

function Show-UpdateMessage([string]$message, [string]$icon = 'Information') {
    Add-Type -AssemblyName System.Windows.Forms
    $messageIcon = [System.Windows.Forms.MessageBoxIcon]::$icon
    [System.Windows.Forms.MessageBox]::Show($message, 'Tender Control Update', [System.Windows.Forms.MessageBoxButtons]::OK, $messageIcon) | Out-Null
}

function Remove-ObsoleteManagedFiles([string]$Root, [string]$BackupRoot) {
    $oldPath = Join-Path $BackupRoot 'release-manifest.json'; $newPath = Join-Path $Root 'release-manifest.json'
    if (!(Test-Path -LiteralPath $oldPath) -or !(Test-Path -LiteralPath $newPath)) { return }
    $old = Get-Content -LiteralPath $oldPath -Raw | ConvertFrom-Json; $new = Get-Content -LiteralPath $newPath -Raw | ConvertFrom-Json
    $newFiles = @($new.managedFiles | ForEach-Object { [string]$_ }); $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    foreach ($relative in @($old.managedFiles | ForEach-Object { [string]$_ })) {
        if (!$relative -or $newFiles -contains $relative -or $relative -match '(^|[\\/])\.\.([\\/]|$)') { continue }
        $candidate = [IO.Path]::GetFullPath((Join-Path $Root $relative))
        if ($candidate.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { Remove-Item -LiteralPath $candidate -Force }
    }
}

function Remove-NewManagedFilesOnRollback([string]$Root, [string]$BackupRoot) {
    $newPath = Join-Path $Root 'release-manifest.json'; $oldPath = Join-Path $BackupRoot 'release-manifest.json'
    if (!(Test-Path -LiteralPath $newPath) -or !(Test-Path -LiteralPath $oldPath)) { return }
    $new = Get-Content -LiteralPath $newPath -Raw | ConvertFrom-Json; $old = Get-Content -LiteralPath $oldPath -Raw | ConvertFrom-Json
    $oldFiles = @($old.managedFiles | ForEach-Object { [string]$_ }); $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    foreach ($relative in @($new.managedFiles | ForEach-Object { [string]$_ })) {
        if (!$relative -or $oldFiles -contains $relative -or $relative -match '(^|[\/])\.\.([\/]|$)') { continue }
        $candidate = [IO.Path]::GetFullPath((Join-Path $Root $relative))
        if ($candidate.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { Remove-Item -LiteralPath $candidate -Force }
    }
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
    foreach ($required in @('package.json', 'engine_opportunityos.bat', '_open_browser.bat', 'CLOSE_OPPORTUNITYOS.bat', 'DESINSTALAR_OPPORTUNITYOS.bat', 'release-manifest.json', 'offline-runtime.json', 'runtime\node.exe', 'dist\index.html', 'node_modules\tsx\dist\loader.mjs', 'node_modules\vite\bin\vite.js', 'scripts\start-local-services.mjs', 'scripts\stop-local-services.mjs', 'scripts\verify-offline-runtime.mjs', 'scripts\uninstall-opportunityos.ps1')) {
        if (!(Test-Path -LiteralPath (Join-Path $extractedRoot $required) -PathType Leaf)) { throw "The offline update package is incomplete: $required" }
    }
    $newPackage = Get-Content -LiteralPath $newPackagePath -Raw | ConvertFrom-Json
    if ([string]$newPackage.version -ne [string]$manifest.version) { throw 'The package version does not match the update manifest.' }

    $copyExclusions = @('.git', '.claude', '.agents', '.ai', '.codex', '.gemini', '.tmp', '.tmp*', 'dev-dist')
    & robocopy.exe $projectRoot $backupRoot /E /NFL /NDL /NJH /NJS /NP /XD $copyExclusions | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "The current installation could not be backed up (code $LASTEXITCODE)." }

    try {
        & robocopy.exe $extractedRoot $projectRoot /E /NFL /NDL /NJH /NJS /NP /XD $copyExclusions | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "The update files could not be installed (code $LASTEXITCODE)." }
        Remove-ObsoleteManagedFiles $projectRoot $backupRoot
        & (Join-Path $projectRoot 'runtime\node.exe') (Join-Path $projectRoot 'scripts\verify-offline-runtime.mjs') $projectRoot
        if ($LASTEXITCODE -ne 0) { throw "Offline verification failed with exit code $LASTEXITCODE." }
    } catch {
        Remove-NewManagedFilesOnRollback $projectRoot $backupRoot
        & robocopy.exe $backupRoot $projectRoot /E /NFL /NDL /NJH /NJS /NP /XD $copyExclusions | Out-Null
        throw
    }

    Show-UpdateMessage "Tender Control was updated successfully to version $availableVersion."
    exit 10
} catch {
    try { Show-UpdateMessage ("The update could not be installed.`r`n`r`n" + $_.Exception.Message + "`r`n`r`nTender Control will open using the current version.") 'Warning' } catch {}
} finally {
    if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

exit 0
