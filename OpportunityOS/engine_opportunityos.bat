@echo off
setlocal
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=VISIBLE"
:: BROWSER_MODE=TAB opens the default browser as a normal tab instead of the
:: app-style window (see _open_browser.bat). Defaults to the app window.
set "BROWSER_MODE=%~2"
if "%BROWSER_MODE%"=="" set "BROWSER_MODE=APP"
title OpportunityOS - Installer and launcher

if "%MODE%"=="VISIBLE" (
    cls
    echo OpportunityOS
    echo =============
    echo.
    echo Preparing the local Windows app...
    echo.
)
if "%MODE%"=="INSTALL" (
    cls
    echo OpportunityOS Installer
    echo =======================
    echo.
    echo This window will stay open until setup is complete.
    echo You will choose Open app or Close installer at the end.
    echo.
)

:: --- Reuse OpportunityOS only when BOTH the frontend and the current local
:: OpportunityOS helper are responding. A frontend alone may be a stale version
:: left behind by an earlier installation, so do not open it by mistake.
curl.exe -s -o nul --max-time 2 http://127.0.0.1:3000 >nul 2>&1
if not errorlevel 1 (
    curl.exe -f -s -o nul --max-time 2 -H "Origin: http://127.0.0.1:3000" http://127.0.0.1:3099/health >nul 2>&1
    if not errorlevel 1 (
        start "" /B cmd /c call "%~dp0_open_browser.bat" %BROWSER_MODE%
        exit /b 0
    )
    if not "%MODE%"=="HIDDEN" echo [INFO] An older or incomplete OpportunityOS instance was found. Restarting it now.
    call "%~dp0CLOSE_OPPORTUNITYOS.bat" SILENT
    timeout /t 1 /nobreak >nul
)

:: A listener that does not answer HTTP is also a stale/incomplete local
:: OpportunityOS process. Clear the reserved ports before the strict-port checks
:: below so a hung Vite process cannot block the new application forever.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    if not "%MODE%"=="HIDDEN" echo [INFO] Clearing a non-responsive OpportunityOS process on port 3000.
    call "%~dp0CLOSE_OPPORTUNITYOS.bat" SILENT
    timeout /t 1 /nobreak >nul
)

if "%MODE%"=="VISIBLE" echo [1/5] Checking local ports... 4 steps remaining.
if "%MODE%"=="INSTALL" echo [1/5] Checking local ports... 4 steps remaining.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo [ERROR] Port 3000 is in use by another application. OpportunityOS will not close it.
    if not "%MODE%"=="HIDDEN" pause
    exit /b 1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3099 " ^| findstr "LISTENING"') do (
    echo [ERROR] Port 3099 is in use by another application. OpportunityOS will not close it.
    if not "%MODE%"=="HIDDEN" pause
    exit /b 1
)

:: --- Check Node.js ---
if "%MODE%"=="VISIBLE" echo [2/5] Checking Node.js... 3 steps remaining.
if "%MODE%"=="INSTALL" echo [2/5] Checking Node.js... 3 steps remaining.
where node >nul 2>&1
if %errorlevel% neq 0 (
    if not "%MODE%"=="HIDDEN" (
        echo [ERROR] Node.js was not found. Install it from https://nodejs.org/
        pause
    )
    exit /b 1
)

:: --- Install dependencies if needed ---
if "%MODE%"=="VISIBLE" echo [3/5] Checking dependencies... 2 steps remaining.
if "%MODE%"=="INSTALL" echo [3/5] Checking dependencies... 2 steps remaining.
:: A partially installed node_modules folder is not usable. Check the launcher
:: that OpportunityOS actually needs instead of treating the folder as success.
if not exist "node_modules\.bin\vite.cmd" (
    if not "%MODE%"=="HIDDEN" echo.
    echo [INFO] Installing or repairing dependencies. This can take several minutes.
    if not "%MODE%"=="HIDDEN" echo [INFO] npm will show download progress below. After this, 2 setup steps remain.
    :: Vite is required to run the local application. --include=dev keeps it
    :: available even when a corporate PC has NODE_ENV=production configured.
    :: Use the committed lockfile so every installation receives the reviewed
    :: dependency tree instead of resolving newer semver-compatible packages.
    call npm ci --include=dev --no-audit --no-fund
    if errorlevel 1 (
        if not "%MODE%"=="HIDDEN" (
            echo.
            echo [ERROR] npm ci failed. Possible causes:
            echo   - No internet connection
            echo   - Corporate proxy blocking npm
            echo   - Outdated Node.js
            echo.
            pause
        )
        exit /b 1
    )
    if not "%MODE%"=="HIDDEN" echo [OK] Dependencies installed. 2 setup steps remaining.
) else (
    if "%MODE%"=="INSTALL" echo [OK] Dependencies are already installed. 2 setup steps remaining.
)

:: --- Check Vite ---
if not exist "node_modules\.bin\vite.cmd" (
    if not "%MODE%"=="HIDDEN" (
        echo [ERROR] Vite was not found. Delete node_modules and run the installer again.
        pause
    )
    exit /b 1
)

if "%MODE%"=="INSTALL" (
    echo [4/5] Creating desktop and Start Menu shortcuts... 1 step remaining.
    echo [OK] Shortcuts were created by the installer.
    echo [5/5] Setup complete. 0 steps remaining.
    echo.
    choice /c OC /n /m "Press O to Open app, or C to Close installer: "
    if errorlevel 2 exit /b 0
    start "" wscript.exe "%~dp0OPEN_OPPORTUNITYOS.vbs"
    exit /b 0
)

:: --- OpportunityOS backend in background (port 3099) ---
if "%MODE%"=="VISIBLE" echo [4/5] Starting local engine... 1 step remaining.
if exist "server\index.ts" (
    start "" /B node_modules\.bin\tsx.cmd server\index.ts
) else (
    echo [ERROR] OpportunityOS server files are missing.
    if not "%MODE%"=="HIDDEN" pause
    exit /b 1
)

:: --- Open browser when Vite is ready ---
if "%MODE%"=="VISIBLE" echo [5/5] Opening OpportunityOS... 0 steps remaining.
start "" /B cmd /c call "%~dp0_open_browser.bat" %BROWSER_MODE%

:: --- Start Vite (keeps running until closed) ---
call node_modules\.bin\vite.cmd --port 3000 --strictPort
