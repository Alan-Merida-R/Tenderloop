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
    $shortcuts = @(
        Join-Path ([Environment]::GetFolderPath('Desktop')) 'Tender Control.lnk',
        Join-Path ([Environment]::GetFolderPath('Programs')) 'Tender Control\Tender Control.lnk'
    )
    $roots = foreach ($shortcutPath in $shortcuts) {
        if (!(Test-Path -LiteralPath $shortcutPath)) { continue }
        $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
        if (("$($shortcut.TargetPath) $($shortcut.Arguments)") -match '"?([^"\r\n]+\\OPEN_OPPORTUNITYOS\.(?:vbs|bat))"?') { Split-Path -Parent $Matches[1] }
    }
    $valid = @($roots | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'engine_opportunityos.bat')) } | Select-Object -Unique)
    if ($valid.Count -eq 1) { return (Resolve-Path -LiteralPath $valid[0]).Path }
    throw 'Tender Control could not be found from its Desktop or Start Menu shortcut.'
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

function Stop-TenderControl([string]$Root) {
    $closer = Join-Path $Root 'CLOSE_OPPORTUNITYOS.bat'
    if (Test-Path -LiteralPath $closer) { & cmd.exe /d /c call $closer SILENT | Out-Null }
    $needle = [regex]::Escape($Root)
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -match $needle } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
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
    foreach ($required in @('package.json', 'engine_opportunityos.bat', 'release-manifest.json')) { if (!(Test-Path -LiteralPath (Join-Path $newRoot $required))) { throw "Invalid update package: $required is missing." } }
    $new = Get-Content -LiteralPath (Join-Path $newRoot 'package.json') -Raw | ConvertFrom-Json
    if ([version](([string]$new.version -split '[+-]')[0]) -le [version](([string]$installed.version -split '[+-]')[0])) { throw 'This update is not newer than the installed version.' }
    $oldLock = if (Test-Path -LiteralPath (Join-Path $target 'package-lock.json')) { (Get-FileHash (Join-Path $target 'package-lock.json') -Algorithm SHA256).Hash } else { '' }
    $exclusions = @('.git', 'node_modules', 'dist', 'dev-dist', '.tmp')
    Stop-TenderControl $target
    & robocopy.exe $target $backupRoot /E /NFL /NDL /NJH /NJS /NP /XD $exclusions | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'Could not back up the installed version.' }
    try {
        & robocopy.exe $newRoot $target /E /NFL /NDL /NJH /NJS /NP /XD $exclusions | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'Could not install the new files.' }
        Remove-ObsoleteManagedFiles $target $backupRoot
        $newLock = if (Test-Path -LiteralPath (Join-Path $target 'package-lock.json')) { (Get-FileHash (Join-Path $target 'package-lock.json') -Algorithm SHA256).Hash } else { '' }
        Push-Location $target
        try {
            if ($newLock -ne $oldLock) { & npm.cmd install --include=dev --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Dependencies could not be updated.' } }
            if (!$SkipBuild) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'The production build failed.' } }
        } finally { Pop-Location }
    } catch { & robocopy.exe $backupRoot $target /E /NFL /NDL /NJH /NJS /NP /XD $exclusions | Out-Null; throw }
    if (!$NoLaunch) { Start-Process -FilePath wscript.exe -ArgumentList ('"' + (Join-Path $target 'OPEN_OPPORTUNITYOS.vbs') + '"') }
    Notify "Tender Control was updated successfully to version $($new.version)."
} catch { Notify ("The update could not be installed.`r`n`r`n" + $_.Exception.Message + "`r`n`r`nThe prior version was restored when possible.") 'Warning'; exit 1 }
finally { if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue } }
