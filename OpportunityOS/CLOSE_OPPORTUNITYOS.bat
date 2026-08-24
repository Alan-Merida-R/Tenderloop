@echo off
setlocal EnableExtensions
set "SILENT=%~1"

if /i not "%SILENT%"=="SILENT" (
    title Cerrar Tender Control
    color 0C
    echo ==========================================
    echo    DETENIENDO TENDER CONTROL...
    echo ==========================================
)

:: Close exactly the processes LISTENING on OpportunityOS's reserved local ports.
:: Get-NetTCPConnection is reliable here; parsing netstat text could select a
:: client connection instead of the listener and leave an old Vite process up.
powershell.exe -NoProfile -Command "$ports = @(3000,3099); $connections = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }); $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique); foreach ($processId in $processIds) { try { Stop-Process -Id $processId -Force -ErrorAction Stop; Write-Output ('[OK] Closed Tender Control local process ' + $processId) } catch { Write-Output ('[WARN] Could not close process ' + $processId) } }; Start-Sleep -Milliseconds 400; $remaining = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }); if ($remaining.Count -gt 0) { exit 1 }"
if errorlevel 1 (
    echo [WARN] A process is still using a Tender Control port (3000 or 3099).
    if /i not "%SILENT%"=="SILENT" pause
    exit /b 1
)

echo [OK] Tender Control local ports are free.
if /i not "%SILENT%"=="SILENT" timeout /t 2 >nul
exit /b 0
