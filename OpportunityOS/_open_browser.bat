@echo off
setlocal EnableExtensions
set "APP_URL=http://127.0.0.1:3000"
set "BROWSER_MODE=%~1"
if not defined BROWSER_MODE set "BROWSER_MODE=TAB"

if /I "%BROWSER_MODE%"=="TAB" (
    start "" "%APP_URL%"
    exit /b 0
)

set "KEEP_ALIVE_FLAGS=--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,MemorySaverMode,TabDiscarding,AutomaticTabDiscarding"

for %%B in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
    "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe"
    "%ProgramFiles%\Vivaldi\Application\vivaldi.exe"
    "%ProgramFiles(x86)%\Vivaldi\Application\vivaldi.exe"
) do (
    if exist "%%~B" (
        start "" "%%~B" --app="%APP_URL%" %KEEP_ALIVE_FLAGS%
        exit /b 0
    )
)

:: The standard URL association is the final fallback and does not use
:: Windows Script Host.
start "" "%APP_URL%"
exit /b 0
