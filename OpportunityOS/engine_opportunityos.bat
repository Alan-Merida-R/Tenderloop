@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PROJECT_ROOT=%CD%"
set "SOURCE_MODE="
if exist "%PROJECT_ROOT%\scripts\install-source-mode.mjs" set "SOURCE_MODE=1"
set "MODE=%~1"
if not defined MODE set "MODE=VISIBLE"
set "BROWSER_MODE=%~2"
if not defined BROWSER_MODE set "BROWSER_MODE=TAB"
if /I "%MODE%"=="TAB" (
    set "BROWSER_MODE=TAB"
    set "MODE=VISIBLE"
)
title Tender Control

if /I not "%MODE%"=="HIDDEN" (
    cls
    echo Tender Control
    echo =============
    echo.
    echo Preparing the local Windows app...
    echo.
)

curl.exe -f -s -o nul --max-time 2 http://127.0.0.1:3000 >nul 2>&1
if not errorlevel 1 (
    curl.exe -f -s -o nul --max-time 2 -H "Origin: http://127.0.0.1:3000" http://127.0.0.1:3099/health >nul 2>&1
    if not errorlevel 1 (
        if /I not "%MODE%"=="HIDDEN" echo [INFO] Closing the previous Tender Control instance before restarting...
        call "%PROJECT_ROOT%\CLOSE_OPPORTUNITYOS.bat" SILENT
        timeout /t 1 /nobreak >nul
        goto :previous_instance_closed
    )
    if /I not "%MODE%"=="HIDDEN" echo [INFO] An incomplete Tender Control instance was found. Restarting it...
    call "%PROJECT_ROOT%\CLOSE_OPPORTUNITYOS.bat" SILENT
    timeout /t 1 /nobreak >nul
)

:previous_instance_closed

:: A backend-only or frontend-only process can also retain locks after an
:: interrupted launch. Ask the scoped closer to remove only listeners that
:: belong to this folder; unrelated applications are left untouched.
set "LOCAL_LISTENER="
for %%P in (3000 3099) do for /f "tokens=5" %%A in ('netstat -aon ^| findstr ":%%P " ^| findstr "LISTENING"') do set "LOCAL_LISTENER=1"
if defined LOCAL_LISTENER (
    if /I not "%MODE%"=="HIDDEN" echo [INFO] Clearing an incomplete Tender Control process...
    call "%PROJECT_ROOT%\CLOSE_OPPORTUNITYOS.bat" SILENT
    timeout /t 1 /nobreak >nul
)

if /I not "%MODE%"=="HIDDEN" echo [1/5] Checking local ports... 4 steps remaining.
for %%P in (3000 3099) do (
    for /f "tokens=5" %%A in ('netstat -aon ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        echo [ERROR] Port %%P is in use by another application. Tender Control did not close it.
        echo [ACTION] Close the application using that port, then run engine_opportunityos.bat again.
        if /I not "%MODE%"=="HIDDEN" pause
        exit /b 1
    )
)

if not defined SOURCE_MODE if exist "%PROJECT_ROOT%\offline-runtime.json" if exist "%PROJECT_ROOT%\scripts\check-for-update.ps1" (
    powershell.exe -NoProfile -STA -File "%PROJECT_ROOT%\scripts\check-for-update.ps1"
    if errorlevel 10 (
        call "%PROJECT_ROOT%\engine_opportunityos.bat" "%MODE%" "%BROWSER_MODE%"
        exit /b
    )
)

if /I not "%MODE%"=="HIDDEN" echo [2/5] Checking runtime... 3 steps remaining.
set "NODE_EXE=%PROJECT_ROOT%\runtime\node.exe"
if defined SOURCE_MODE (
    where node.exe >nul 2>&1
    if errorlevel 1 goto :source_runtime_missing
    where npm.cmd >nul 2>&1
    if errorlevel 1 goto :source_runtime_missing
    set "NODE_EXE=node.exe"
) else (
    if not exist "%PROJECT_ROOT%\offline-runtime.json" goto :package_marker_missing
    if not exist "%NODE_EXE%" goto :runtime_missing
)

if /I not "%MODE%"=="HIDDEN" echo [3/5] Checking application files... 2 steps remaining.
if not defined SOURCE_MODE goto :prepare_offline

if exist "%PROJECT_ROOT%\offline-runtime.json" (
    echo [INFO] Old offline-package metadata was found beside new source files.
    echo [INFO] Source-copy mode takes priority and will rebuild the current files.
    "%NODE_EXE%" "%PROJECT_ROOT%\scripts\install-source-mode.mjs" "%PROJECT_ROOT%" --allow-stale-offline-manifest
) else (
    echo [INFO] Source-copy mode detected.
    "%NODE_EXE%" "%PROJECT_ROOT%\scripts\install-source-mode.mjs" "%PROJECT_ROOT%"
)
if errorlevel 1 goto :prepare_failed
goto :files_ready

:prepare_offline
if not exist "%PROJECT_ROOT%\scripts\verify-offline-runtime.mjs" (
    echo [ERROR] Offline verification helper is missing.
    goto :prepare_failed
)
"%NODE_EXE%" "%PROJECT_ROOT%\scripts\verify-offline-runtime.mjs" "%PROJECT_ROOT%"
if errorlevel 1 goto :prepare_failed
goto :files_ready

:runtime_missing
echo [ERROR] The packaged Node.js runtime is missing: runtime\node.exe
echo [ACTION] Extract the complete official release again. No download was attempted.
if /I not "%MODE%"=="HIDDEN" pause
exit /b 1

:package_marker_missing
echo [ERROR] This folder is neither a complete source copy nor an official offline package.
echo [ACTION] Copy the complete new version into this folder, then run the engine again.
if /I not "%MODE%"=="HIDDEN" pause
exit /b 1

:source_runtime_missing
echo [ERROR] Node.js and npm are required to prepare a source copy, but one or both were not found.
echo [ACTION] Install the approved Node.js LTS package, then run engine_opportunityos.bat again.
if /I not "%MODE%"=="HIDDEN" pause
exit /b 1

:prepare_failed
echo [ERROR] Tender Control could not prepare the application files.
echo [ACTION] Review the command and exit code printed above, correct that issue, and retry.
if /I not "%MODE%"=="HIDDEN" pause
exit /b 1

:files_ready
for %%F in ("node_modules\tsx\dist\loader.mjs" "node_modules\vite\bin\vite.js" "dist\index.html" "server\index.ts" "scripts\start-local-services.mjs" "scripts\stop-local-services.mjs") do (
    if not exist "%%~F" (
        echo [ERROR] Required application file is missing: %%~F
        goto :prepare_failed
    )
)

:: A source copy can be placed over a much older installation. Remove only the
:: obsolete application launchers/helpers that depended on Windows Script Host;
:: never touch databases, exports, APPDATA, or unknown user files.
if defined SOURCE_MODE (
    for %%F in (
        "INSTALAR_OPPORTUNITYOS.hta"
        "INSTALAR_OPPORTUNITYOS.vbs"
        "OPEN_OPPORTUNITYOS.vbs"
        "OPEN_OPPORTUNITYOS_BROWSER.vbs"
        "DESINSTALAR_OPPORTUNITYOS.hta"
        "DESINSTALAR_OPPORTUNITYOS.vbs"
        "scripts\find-chrome-app-id.ps1"
        "scripts\toggle-app-window.ps1"
        "scripts\install-source-mode.ps1"
        "scripts\verify-offline-runtime.ps1"
    ) do if exist "%%~F" del /q "%%~F" >nul 2>&1
)

if defined APPDATA (
    if not exist "%APPDATA%\OpportunityOS" mkdir "%APPDATA%\OpportunityOS" >nul 2>&1
    >"%APPDATA%\OpportunityOS\install-root.txt" echo(%PROJECT_ROOT%
)

if /I not "%MODE%"=="HIDDEN" echo [4/5] Starting local services... 1 step remaining.
"%NODE_EXE%" "%PROJECT_ROOT%\scripts\start-local-services.mjs" "%PROJECT_ROOT%" "%NODE_EXE%"
if errorlevel 1 (
    echo [ERROR] The local services could not be started. Exit code: %ERRORLEVEL%
    goto :startup_failed
)

set /a START_ATTEMPTS=0
:wait_for_services
set "FRONT_READY="
set "BACK_READY="
curl.exe -f -s -o nul --max-time 2 http://127.0.0.1:3000 >nul 2>&1 && set "FRONT_READY=1"
curl.exe -f -s -o nul --max-time 2 -H "Origin: http://127.0.0.1:3000" http://127.0.0.1:3099/health >nul 2>&1 && set "BACK_READY=1"
if defined FRONT_READY if defined BACK_READY goto :services_ready
set /a START_ATTEMPTS+=1
if %START_ATTEMPTS% GEQ 60 (
    echo [ERROR] Local services did not become ready within 60 seconds.
    echo [ACTION] Review %%APPDATA%%\OpportunityOS\logs. Ports 3000 and 3099 must be available.
    goto :startup_failed
)
timeout /t 1 /nobreak >nul
goto :wait_for_services

:services_ready
if /I not "%MODE%"=="HIDDEN" echo [5/5] Opening Tender Control... 0 steps remaining.
call "%PROJECT_ROOT%\_open_browser.bat" "%BROWSER_MODE%"
echo.
echo Tender Control is ready.
echo.
echo Frontend: http://127.0.0.1:3000
echo Backend:  http://127.0.0.1:3099
echo.
echo The engine window can now close; services will remain hidden.
timeout /t 2 /nobreak >nul
exit /b 0

:startup_failed
call "%PROJECT_ROOT%\CLOSE_OPPORTUNITYOS.bat" SILENT
if /I not "%MODE%"=="HIDDEN" pause
exit /b 1
