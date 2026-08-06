# Prints the app-id Chrome assigned OpportunityOS if the user installed it as
# a real Chrome app (address bar "Install" button), or nothing if they didn't.
# Kept as its own file rather than inlined in _open_browser.bat: a long
# PowerShell -Command string full of parentheses inside a batch for/f
# confuses cmd.exe's own paren-matching (it happened once already in
# engine_opportunityos.bat with a stray ::  comment) — a real .ps1 file has
# none of that ambiguity.
$ErrorActionPreference = 'SilentlyContinue'
$shell = New-Object -ComObject WScript.Shell
$dirs = @(
    (Join-Path $shell.SpecialFolders('Programs') 'Chrome Apps'),
    (Join-Path $shell.SpecialFolders('Programs') 'Aplicaciones de Chrome')
)
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    $shortcut = Get-ChildItem $dir -Filter 'OpportunityOS*.lnk' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $shortcut) { continue }
    $link = $shell.CreateShortcut($shortcut.FullName)
    if ($link.Arguments -match '--app-id=([a-z]+)') {
        Write-Output $matches[1]
        break
    }
}
