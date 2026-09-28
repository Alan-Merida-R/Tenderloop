[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TargetRoot
)

$ErrorActionPreference = 'Stop'
try {
    $target = [IO.Path]::GetFullPath($TargetRoot).TrimEnd('\')
    $root = [IO.Path]::GetPathRoot($target).TrimEnd('\')
    if (!$target -or $target -eq $root -or !(Test-Path -LiteralPath (Join-Path $target 'engine_opportunityos.bat') -PathType Leaf)) {
        throw 'The requested folder is not a valid Tender Control installation.'
    }

    Start-Sleep -Seconds 2
    $removed = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
            if (!(Test-Path -LiteralPath $target)) { $removed = $true; break }
        } catch {
            if ($attempt -eq 60) { throw }
        }
        Start-Sleep -Seconds 1
    }
    if (!$removed) { throw 'The application folder still exists after 60 attempts.' }
    Write-Host '[OK] Tender Control was removed.' -ForegroundColor Green
    Write-Host '[OK] User data under APPDATA\OpportunityOS was preserved.'
} catch {
    Write-Host '[ERROR] Tender Control could not be completely removed.' -ForegroundColor Red
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '[ACTION] Close Explorer, terminals, editors, or antivirus scans using the folder, then retry.'
    Read-Host 'Press Enter to close'
    exit 1
} finally {
    Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
}
