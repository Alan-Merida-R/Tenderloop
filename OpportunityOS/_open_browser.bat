@echo off
setlocal
:: Use the same loopback host Vite binds to. Previous launchers used localhost,
:: whose old PWA/service-worker cache could keep serving a stale blank shell.
:: 127.0.0.1 gives the local app a clean, consistent origin.
set "APP_URL=http://127.0.0.1:3000"

:: BROWSER_MODE=TAB opens the user's default browser as a normal tab (address
:: bar, tabs, back button) instead of the app-style window. Some users prefer
:: that over the app window; OPEN_OPPORTUNITYOS_BROWSER.vbs requests it.
set "BROWSER_MODE=%~1"
if "%BROWSER_MODE%"=="" set "BROWSER_MODE=APP"

:: Wait until Vite answers, then open the app window.
:WAIT
ping -n 2 127.0.0.1 >nul
curl.exe -s -o nul %APP_URL% >nul 2>&1
if errorlevel 1 goto WAIT

if "%BROWSER_MODE%"=="TAB" (
    start "" "%APP_URL%"
    exit /b 0
)

:: Prefer Chrome when available. It supports TenderLoop as an installable PWA
:: and is the first choice for the desktop application experience.
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%"
    exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%"
    exit /b 0
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%"
    exit /b 0
)

:: Vivaldi is the next app-mode choice; use the default browser only as a fallback.
if exist "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe" (
    start "" "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe" --app="%APP_URL%"
    exit /b 0
)
if exist "%ProgramFiles%\Vivaldi\Application\vivaldi.exe" (
    start "" "%ProgramFiles%\Vivaldi\Application\vivaldi.exe" --app="%APP_URL%"
    exit /b 0
)
if exist "%ProgramFiles(x86)%\Vivaldi\Application\vivaldi.exe" (
    start "" "%ProgramFiles(x86)%\Vivaldi\Application\vivaldi.exe" --app="%APP_URL%"
    exit /b 0
)

:: Get the default browser path in a robust, non-blocking way
set "TEMP_FILE=%TEMP%\tl_browser_%RANDOM%.txt"
powershell.exe -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $prog=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice').ProgId; $cmd=(Get-ItemProperty ('Registry::HKEY_CLASSES_ROOT\' + $prog + '\shell\open\command')).'(default)'; if($cmd -and $cmd -match ([char]34 + '([^' + [char]34 + ']+\.exe)' + [char]34)){ $path=$matches[1] } else { $path=$cmd.Split(' ')[0] }; if($path){ [System.IO.File]::WriteAllText('%TEMP_FILE%', $path) }"

if exist "%TEMP_FILE%" (
    set /p DEFAULT_BROWSER=<"%TEMP_FILE%"
    del "%TEMP_FILE%" >nul 2>&1
)

if defined DEFAULT_BROWSER (
    if exist "%DEFAULT_BROWSER%" (
        echo "%DEFAULT_BROWSER%" | findstr /i "chrome.exe msedge.exe brave.exe vivaldi.exe" >nul
        if not errorlevel 1 (
            start "" "%DEFAULT_BROWSER%" --app="%APP_URL%"
            exit /b 0
        )
    )
)

:: Known app-mode fallbacks if the default browser cannot be resolved.
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%"
    exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%"
    exit /b 0
)
if exist "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe" (
    start "" "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe" --app="%APP_URL%"
    exit /b 0
)

:: Non-Chromium browsers do not expose a reliable app-window mode.
start "" "%APP_URL%"
