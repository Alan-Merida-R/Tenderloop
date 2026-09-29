@echo off
setlocal EnableExtensions
set "SILENT=%~1"
set "OPPORTUNITYOS_CLOSE_ROOT=%~dp0"
set "CLOSE_NODE_EXE=%~dp0runtime\node.exe"

if /i not "%SILENT%"=="SILENT" (
    title Cerrar Tender Control
    color 0C
    echo ==========================================
    echo    DETENIENDO TENDER CONTROL...
    echo ==========================================
)

:: New installations keep the exact background service PIDs in APPDATA. Stop
:: only those recorded processes when they still own Tender Control's ports.
:: The PowerShell block below remains as a compatibility fallback for versions
:: that predate the process record.
if not exist "%CLOSE_NODE_EXE%" (
    set "CLOSE_NODE_EXE="
    where node.exe >nul 2>&1
    if not errorlevel 1 set "CLOSE_NODE_EXE=node.exe"
)
if exist "%~dp0scripts\stop-local-services.mjs" (
    if defined CLOSE_NODE_EXE "%CLOSE_NODE_EXE%" "%~dp0scripts\stop-local-services.mjs" "%~dp0"
)

:: Only close listeners whose executable or command line belongs to this exact
:: Tender Control folder. A different application using 3000/3099 is never killed.
powershell.exe -NoProfile -Command "$ports=@(3000,3099); $root=[IO.Path]::GetFullPath($env:OPPORTUNITYOS_CLOSE_ROOT).TrimEnd('\'); $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }); $blocked=$false; foreach($listener in $listeners){ $processId=$listener.OwningProcess; $owned=$false; try { $process=Get-Process -Id $processId -ErrorAction Stop; $executable=$process.Path; if($executable -and $executable.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){ $owned=$true } } catch {}; if(-not $owned){ try { $commandLine=(Get-CimInstance Win32_Process -Filter ('ProcessId = '+$processId) -ErrorAction Stop).CommandLine; if($commandLine -and $commandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0){ $owned=$true } } catch {} }; if($owned){ try { Stop-Process -Id $processId -Force -ErrorAction Stop; Write-Output ('[OK] Closed Tender Control local process '+$processId) } catch { Write-Output ('[WARN] Could not close Tender Control process '+$processId); $blocked=$true } } else { Write-Output ('[WARN] Port '+$listener.LocalPort+' belongs to another application and was not closed.'); $blocked=$true } }; Start-Sleep -Milliseconds 400; if($blocked -or @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }).Count -gt 0){exit 1}"
if errorlevel 1 (
    echo [WARN] A process is still using Tender Control port 3000 or 3099.
    if /i not "%SILENT%"=="SILENT" pause
    exit /b 1
)

echo [OK] Tender Control local ports are free.
if /i not "%SILENT%"=="SILENT" timeout /t 2 >nul
exit /b 0
