$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $projectRoot 'package.json'
$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$releaseVersion = [string]$packageJson.version
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$nodeExecutable = $nodeCommand.Source

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

    Write-Host 'Checking the current npm advisory database on the publishing workstation...'
    & npm.cmd audit --json
    if ($LASTEXITCODE -ne 0) { throw 'The complete packaged dependency tree did not pass npm audit.' }

    foreach ($requiredPath in @(
        'dist\index.html',
        'node_modules\tsx\dist\loader.mjs',
        'node_modules\vite\bin\vite.js',
        'scripts\start-local-services.mjs',
        'scripts\stop-local-services.mjs',
        'scripts\verify-offline-runtime.mjs'
    )) {
        if (!(Test-Path -LiteralPath (Join-Path $projectRoot $requiredPath) -PathType Leaf)) {
            throw "The offline release payload is incomplete: $requiredPath"
        }
    }

    $nodePlatform = (& $nodeExecutable -p "process.platform").Trim()
    $nodeArchitecture = (& $nodeExecutable -p "process.arch").Trim()
    $nodeVersion = (& $nodeExecutable --version).Trim()
    if ($nodePlatform -ne 'win32' -or $nodeArchitecture -ne 'x64') {
        throw "Offline releases require an x64 Windows Node.js runtime; found $nodePlatform/$nodeArchitecture."
    }
    $nodeSignature = Get-AuthenticodeSignature -LiteralPath $nodeExecutable
    if ($nodeSignature.Status -ne 'Valid' -or $nodeSignature.SignerCertificate.Subject -notmatch 'OpenJS Foundation') {
        throw 'The local Node.js executable is not validly signed by the OpenJS Foundation.'
    }

    $serviceStarterText = Get-Content -LiteralPath (Join-Path $projectRoot 'scripts\start-local-services.mjs') -Raw
    $serverConfigText = Get-Content -LiteralPath (Join-Path $projectRoot 'server\config.ts') -Raw
    if ($serviceStarterText -notmatch "'--host',\s*'127\.0\.0\.1'" -or $serverConfigText -notmatch "HOST\s*=\s*'127\.0\.0\.1'") {
        throw 'The release launchers are not restricted to 127.0.0.1.'
    }
    foreach ($targetScript in @('engine_opportunityos.bat', '_open_browser.bat', 'OPEN_OPPORTUNITYOS.bat', 'DESINSTALAR_OPPORTUNITYOS.bat', 'scripts\install-update-v2.ps1', 'scripts\check-for-update.ps1', 'scripts\start-local-services.mjs', 'scripts\stop-local-services.mjs', 'scripts\verify-offline-runtime.mjs', 'scripts\uninstall-opportunityos.ps1')) {
        $targetText = Get-Content -LiteralPath (Join-Path $projectRoot $targetScript) -Raw
        if ($targetText -match '(?i)npm(?:\.cmd)?\s+(?:ci|install|run\s+build)\b|Invoke-WebRequest|Start-BitsTransfer|curl\.exe\s+https?://') {
            throw "Target-side network or build command found in $targetScript. Offline publication was stopped."
        }
    }
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
    # Copy only version-controlled application files. This prevents local JSON
    # databases, exports, logs, AI files and scratch folders from entering a
    # release even when they happen to live below the project directory.
    $excludedReleaseNames = @('AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'GEMINI.md', 'release-manifest.json', 'offline-runtime.json', 'install-source-mode.mjs')
    $trackedFiles = @(& git.exe -C $projectRoot ls-files -- .)
    if ($LASTEXITCODE -ne 0 -or $trackedFiles.Count -eq 0) { throw 'Could not enumerate version-controlled release files.' }
    foreach ($relativePath in $trackedFiles) {
        if ($excludedReleaseNames -contains [IO.Path]::GetFileName($relativePath)) { continue }
        if ($relativePath -match '(^|[\/])\.(agents|ai|claude|codex|gemini)([\/]|$)') { continue }
        $sourcePath = Join-Path $projectRoot $relativePath
        $destinationPath = Join-Path $stagingRoot $relativePath
        $destinationDirectory = Split-Path -Parent $destinationPath
        if (!(Test-Path -LiteralPath $destinationDirectory)) { New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null }
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }

    # These release-safety files may be new in the current worktree before
    # the release commit is created; copy them explicitly after validating them.
    foreach ($relativePath in @('THIRD_PARTY_NOTICES.txt', 'scripts\start-local-services.mjs', 'scripts\stop-local-services.mjs', 'scripts\verify-offline-runtime.mjs')) {
        $destinationPath = Join-Path $stagingRoot $relativePath
        $destinationDirectory = Split-Path -Parent $destinationPath
        if (!(Test-Path -LiteralPath $destinationDirectory)) { New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null }
        Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination $destinationPath -Force
    }

    # The release is deliberately self-contained: the reviewed build and its
    # exact installed dependencies travel in the ZIP, so target PCs never use npm.
    foreach ($directoryName in @('dist', 'node_modules')) {
        # npm can leave dot-prefixed swap directories when antivirus or a live
        # dev process held a native binary. They are never valid runtime input.
        & robocopy.exe (Join-Path $projectRoot $directoryName) (Join-Path $stagingRoot $directoryName) /E /NFL /NDL /NJH /NJS /NP /XD '.cache' '.vite' '.rollup-*' '.win32-*' '.oxide-*' '.tsx-*' '.lightningcss-*' '.esbuild-*' | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Could not package $directoryName (Robocopy exit code $LASTEXITCODE)." }
    }

    $runtimeRoot = Join-Path $stagingRoot 'runtime'
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    Copy-Item -LiteralPath $nodeExecutable -Destination (Join-Path $runtimeRoot 'node.exe') -Force
    $runtimeManifest = [ordered]@{
        schema = 1
        releaseVersion = $releaseVersion
        nodeVersion = $nodeVersion
        nodeArchitecture = $nodeArchitecture
        nodeSha256 = (Get-FileHash -LiteralPath (Join-Path $runtimeRoot 'node.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
        packageLockSha256 = (Get-FileHash -LiteralPath (Join-Path $stagingRoot 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant()
        noNetworkInstallation = $true
        frontendHost = '127.0.0.1'
        backendHost = '127.0.0.1'
    }
    $runtimeManifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stagingRoot 'offline-runtime.json') -Encoding UTF8

    $managedFiles = @(Get-ChildItem -LiteralPath $stagingRoot -File -Recurse | ForEach-Object { $_.FullName.Substring($stagingRoot.Length).TrimStart('\\') } | Sort-Object)
    $fileHashes = @($managedFiles | ForEach-Object {
        [ordered]@{
            path = $_
            sha256 = (Get-FileHash -LiteralPath (Join-Path $stagingRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    })
    [ordered]@{ schema = 2; version = $releaseVersion; managedFiles = $managedFiles; fileHashes = $fileHashes } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $stagingRoot 'release-manifest.json') -Encoding UTF8
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
        "Tender Control $releaseVersion was published successfully as a self-contained offline package.`r`n`r`n$zipName`r`nlatest.json`r`nACTUALIZAR_TENDER_CONTROL.cmd`r`ninstall-update-v2.ps1`r`n`r`nTarget PCs do not need npm or internet access. For a manual update, keep these four files together and open ACTUALIZAR_TENDER_CONTROL.cmd.",
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
