@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "APP_DIR=%CD%"

echo Tender Control Uninstaller
echo ==========================
echo.
echo This removes the application folder:
echo %APP_DIR%
echo.
echo Your separate data in %%APPDATA%%\OpportunityOS is preserved.
echo Any files stored manually inside the application folder will be removed.
echo.
choice /c YN /n /m "Continue? [Y/N]: "
if errorlevel 2 exit /b 0

echo [1/3] Closing Tender Control local services...
call "%APP_DIR%\CLOSE_OPPORTUNITYOS.bat" SILENT
echo [OK] Shutdown requested.

echo [2/3] Removing legacy shortcuts...
if exist "%USERPROFILE%\Desktop\Tender Control.lnk" del /q "%USERPROFILE%\Desktop\Tender Control.lnk" >nul 2>&1
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Tender Control\Tender Control.lnk" del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Tender Control\Tender Control.lnk" >nul 2>&1
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Tender Control\Uninstall Tender Control.lnk" del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Tender Control\Uninstall Tender Control.lnk" >nul 2>&1
rd "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Tender Control" >nul 2>&1
echo [OK] Legacy shortcuts removed.

echo [3/3] Handing folder removal to PowerShell...
set "TEMP_UNINSTALLER=%TEMP%\OpportunityOS-uninstall-%RANDOM%-%RANDOM%.ps1"
copy /y "%APP_DIR%\scripts\uninstall-opportunityos.ps1" "%TEMP_UNINSTALLER%" >nul
if errorlevel 1 (
    echo [ERROR] Could not create the temporary removal helper.
    pause
    exit /b 1
)
start "Tender Control Uninstaller" powershell.exe -NoProfile -File "%TEMP_UNINSTALLER%" -TargetRoot "%APP_DIR%"
exit /b 0
