[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,

    [Parameter(Mandatory = $true)]
    [ValidateSet('Validate', 'Dependencies', 'Build')]
    [string]$Phase
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path

if (Test-Path -LiteralPath (Join-Path $root 'offline-runtime.json')) {
    throw 'Source-copy setup is disabled for official offline packages.'
}
foreach ($required in @('package.json', 'package-lock.json', 'engine_opportunityos.bat')) {
    if (!(Test-Path -LiteralPath (Join-Path $root $required) -PathType Leaf)) {
        throw "The source copy is incomplete: $required is missing."
    }
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$npmCommand = Get-Command npm.cmd -ErrorAction Stop

if ($Phase -eq 'Validate') {
    $nodeVersion = (& $nodeCommand.Source --version).Trim()
    $npmVersion = (& $npmCommand.Source --version).Trim()
    if ($LASTEXITCODE -ne 0 -or !$nodeVersion -or !$npmVersion) {
        throw 'Node.js or npm could not start.'
    }
    Write-Host "[OK] Node.js $nodeVersion and npm $npmVersion are available."
    exit 0
}

Push-Location $root
try {
    if ($Phase -eq 'Dependencies') {
        Write-Host '[INFO] Installing or repairing the exact project dependencies...'
        & $npmCommand.Source install --include=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
        foreach ($required in @('node_modules\tsx\dist\cli.mjs', 'node_modules\vite\bin\vite.js')) {
            if (!(Test-Path -LiteralPath (Join-Path $root $required) -PathType Leaf)) {
                throw "Dependency installation is incomplete: $required is missing."
            }
        }
        Write-Host '[OK] Dependencies are ready.'
        exit 0
    }

    Write-Host '[INFO] Building the production application...'
    & $npmCommand.Source run build
    if ($LASTEXITCODE -ne 0) { throw 'The production build failed.' }
    if (!(Test-Path -LiteralPath (Join-Path $root 'dist\index.html') -PathType Leaf)) {
        throw 'The production build did not create dist\index.html.'
    }
    Write-Host '[OK] Production build is ready.'
} finally {
    Pop-Location
}
