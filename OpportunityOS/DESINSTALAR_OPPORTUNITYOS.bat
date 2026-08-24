@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"
set "DESKTOP_DIR=%~1"
set "PROGRAM_DIR=%~2"
:: The HTA uninstaller passes both paths explicitly. When this runs directly
:: (e.g. from the "Uninstall OpportunityOS" Start Menu shortcut, which needs
:: no .vbs/.hta), fall back to the standard per-user locations so shortcuts
:: still get cleaned up.
if not defined DESKTOP_DIR set "DESKTOP_DIR=%USERPROFILE%\Desktop"
if not defined PROGRAM_DIR set "PROGRAM_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Tender Control"
echo [1/3] Closing Tender Control processes...
:: Do not use WMI/Get-CimInstance here: on some corporate Windows machines it
:: can stall indefinitely and leave the uninstaller waiting forever. OpportunityOS
:: reserves these two local ports, so close their owners directly and quickly.
call "%APP_DIR%CLOSE_OPPORTUNITYOS.bat" SILENT
taskkill /f /im OpportunityOS.exe >nul 2>&1
echo [OK] Requested shutdown of Tender Control local services.

echo [2/3] Removing Tender Control shortcuts...
if defined DESKTOP_DIR if exist "%DESKTOP_DIR%\Tender Control.lnk" del /q "%DESKTOP_DIR%\Tender Control.lnk" >nul 2>&1
if defined PROGRAM_DIR if exist "%PROGRAM_DIR%\Tender Control.lnk" del /q "%PROGRAM_DIR%\Tender Control.lnk" >nul 2>&1
if defined PROGRAM_DIR if exist "%PROGRAM_DIR%\Uninstall Tender Control.lnk" del /q "%PROGRAM_DIR%\Uninstall Tender Control.lnk" >nul 2>&1
if defined PROGRAM_DIR rd "%PROGRAM_DIR%" >nul 2>&1
echo [OK] Tender Control shortcuts removed.

echo [3/3] Ready to remove the complete Tender Control folder.
echo [OK] Select "Remove folder now" in the uninstaller to start complete removal.
echo [INFO] Node.js itself is not removed. Local Tender Control data inside this folder will be removed.
exit /b 0
