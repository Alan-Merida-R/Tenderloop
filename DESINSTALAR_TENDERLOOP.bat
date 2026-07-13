@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"
set "DESKTOP_DIR=%~1"
set "PROGRAM_DIR=%~2"
echo [1/3] Closing TenderLoop processes...
:: Do not use WMI/Get-CimInstance here: on some corporate Windows machines it
:: can stall indefinitely and leave the uninstaller waiting forever. TenderLoop
:: reserves these two local ports, so close their owners directly and quickly.
call "%APP_DIR%CERRAR_TENDERLOOP.bat" SILENT
taskkill /f /im TenderLoop.exe >nul 2>&1
echo [OK] Requested shutdown of TenderLoop local services.

echo [2/3] Removing TenderLoop shortcuts...
if defined DESKTOP_DIR if exist "%DESKTOP_DIR%\TenderLoop.lnk" del /q "%DESKTOP_DIR%\TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR if exist "%PROGRAM_DIR%\TenderLoop.lnk" del /q "%PROGRAM_DIR%\TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR if exist "%PROGRAM_DIR%\Uninstall TenderLoop.lnk" del /q "%PROGRAM_DIR%\Uninstall TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR rd "%PROGRAM_DIR%" >nul 2>&1
echo [OK] TenderLoop shortcuts removed.

echo [3/3] Ready to remove the complete TenderLoop folder.
echo [OK] Close this window with the final button to start complete removal.
echo [INFO] Node.js itself is not removed. Local TenderLoop data inside this folder will be removed.
exit /b 0
