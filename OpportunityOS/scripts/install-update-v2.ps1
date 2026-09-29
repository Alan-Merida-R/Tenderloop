[CmdletBinding()]
param(
    [string]$PackageFolder,
    [string]$PackagePath,
    [string]$TargetRoot,
    [switch]$NoLaunch,
    [switch]$SkipBuild,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$temporaryRoot = $null

function Notify([string]$Message, [string]$Icon = 'Information') {
    if ($Quiet) { Write-Host $Message; return }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($Message, 'Tender Control Update', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::$Icon) | Out-Null
}

function Find-InstalledRoot {
    if ($TargetRoot) {
        if (Test-Path -LiteralPath (Join-Path $TargetRoot 'engine_opportunityos.bat') -PathType Leaf) { return (Resolve-Path -LiteralPath $TargetRoot).Path }
        throw "The selected Tender Control installation is invalid: $TargetRoot"
    }
    $localDataRoot = if ($env:APPDATA) { $env:APPDATA } else { $env:USERPROFILE }
    $pointerPath = Join-Path (Join-Path $localDataRoot 'OpportunityOS') 'install-root.txt'
    if (Test-Path -LiteralPath $pointerPath -PathType Leaf) {
        $savedRoot = (Get-Content -LiteralPath $pointerPath -Raw).Trim()
        if ($savedRoot -and (Test-Path -LiteralPath (Join-Path $savedRoot 'engine_opportunityos.bat') -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $savedRoot).Path
        }
    }
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Select the Tender Control folder that contains engine_opportunityos.bat.'
    $dialog.ShowNewFolderButton = $false
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $selectedRoot = $dialog.SelectedPath
        if (Test-Path -LiteralPath (Join-Path $selectedRoot 'engine_opportunityos.bat') -PathType Leaf) {
            return (Resolve-Path -LiteralPath $selectedRoot).Path
        }
        throw 'The selected folder is not a Tender Control installation.'
    }
    throw 'Tender Control could not be found and no installation folder was selected.'
}

function Get-Package {
    if ($PackagePath) { if (!(Test-Path -LiteralPath $PackagePath -PathType Leaf)) { throw "The update package was not found: $PackagePath" }; return (Resolve-Path -LiteralPath $PackagePath).Path }
    if (!$PackageFolder -or !(Test-Path -LiteralPath $PackageFolder -PathType Container)) { throw 'The update folder was not found.' }
    $packages = @(Get-ChildItem -LiteralPath $PackageFolder -Filter 'OpportunityOS-*.zip' -File | Sort-Object LastWriteTime -Descending)
    if ($packages.Count -eq 0) { throw 'No OpportunityOS-<version>.zip was found next to the updater.' }
    return $packages[0].FullName
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

function Stop-TenderControl([string]$Root) {
    $ports = @(3000, 3099)
    $rootPrefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort })
    foreach ($listener in $listeners) {
        $processId = $listener.OwningProcess
        $owned = $false
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            if ($process.Path -and $process.Path.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { $owned = $true }
        } catch {}
        if (!$owned) {
            try {
                $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop).CommandLine
                if ($commandLine -and $commandLine.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $owned = $true }
            } catch {}
        }
        if (!$owned) { throw "Port $($listener.LocalPort) belongs to another application or could not be verified. Close Tender Control manually and retry; no process was terminated." }
        Stop-Process -Id $processId -Force -ErrorAction Stop
    }
    Start-Sleep -Milliseconds 400
    if (@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }).Count -gt 0) {
        throw 'Tender Control could not be stopped safely.'
    }
}

try {
    $target = Find-InstalledRoot; $zip = Get-Package
    $manifestPath = Join-Path (Split-Path -Parent $zip) 'latest.json'
    if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'latest.json is missing from the update folder.' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.package -ne [IO.Path]::GetFileName($zip) -or [string]::IsNullOrWhiteSpace([string]$manifest.sha256)) { throw 'latest.json does not describe this update package.' }
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ine [string]$manifest.sha256) { throw 'The update package checksum does not match latest.json.' }
    $installed = Get-Content -LiteralPath (Join-Path $target 'package.json') -Raw | ConvertFrom-Json
    $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('OpportunityOS-update-' + [Guid]::NewGuid().ToString('N'))
    $newRoot = Join-Path $temporaryRoot 'new'; $backupRoot = Join-Path $temporaryRoot 'backup'
    New-Item -ItemType Directory -Path $newRoot, $backupRoot -Force | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $newRoot -Force
    foreach ($required in @('package.json', 'engine_opportunityos.bat', '_open_browser.bat', 'CLOSE_OPPORTUNITYOS.bat', 'DESINSTALAR_OPPORTUNITYOS.bat', 'release-manifest.json', 'offline-runtime.json', 'runtime\node.exe', 'dist\index.html', 'node_modules\tsx\dist\loader.mjs', 'node_modules\vite\bin\vite.js', 'scripts\start-local-services.mjs', 'scripts\stop-local-services.mjs', 'scripts\verify-offline-runtime.mjs', 'scripts\uninstall-opportunityos.ps1')) { if (!(Test-Path -LiteralPath (Join-Path $newRoot $required) -PathType Leaf)) { throw "Invalid offline update package: $required is missing." } }
    $new = Get-Content -LiteralPath (Join-Path $newRoot 'package.json') -Raw | ConvertFrom-Json
    if ([version](([string]$new.version -split '[+-]')[0]) -le [version](([string]$installed.version -split '[+-]')[0])) { throw 'This update is not newer than the installed version.' }
    $exclusions = @('.git', '.claude', '.agents', '.ai', '.codex', '.gemini', '.tmp', '.tmp*', 'dev-dist')
    Stop-TenderControl $target
    & robocopy.exe $target $backupRoot /E /NFL /NDL /NJH /NJS /NP /XD $exclusions | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'Could not back up the installed version.' }
    try {
        & robocopy.exe $newRoot $target /E /NFL /NDL /NJH /NJS /NP /XD $exclusions | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'Could not install the new files.' }
        Remove-ObsoleteManagedFiles $target $backupRoot
        & (Join-Path $target 'runtime\node.exe') (Join-Path $target 'scripts\verify-offline-runtime.mjs') $target
        if ($LASTEXITCODE -ne 0) { throw "Offline verification failed with exit code $LASTEXITCODE." }
    } catch {
        Remove-NewManagedFilesOnRollback $target $backupRoot
        & robocopy.exe $backupRoot $target /E /NFL /NDL /NJH /NJS /NP /XD $exclusions | Out-Null
        throw
    }
    if (!$NoLaunch) {
        Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', 'call', ('"' + (Join-Path $target 'engine_opportunityos.bat') + '"')) -WorkingDirectory $target
    }
    Notify "Tender Control was updated successfully to version $($new.version)."
} catch { Notify ("The update could not be installed.`r`n`r`n" + $_.Exception.Message + "`r`n`r`nThe prior version was restored when possible.") 'Warning'; exit 1 }
finally { if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue } }
