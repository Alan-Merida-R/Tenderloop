@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if exist "%~dp0scripts\check-for-update.ps1" powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0scripts\check-for-update.ps1"

:: Compatibility launcher for Windows environments that block .vbs or .hta
:: files. It never deletes project files and keeps setup errors visible.
if exist "node_modules\.bin\vite.cmd" (
    call "%~dp0engine_opportunityos.bat" HIDDEN
    exit /b %errorlevel%
)

echo Tender Control needs a first-time setup before it can open.
echo A visible installer will run now. Keep this window open if an error appears.
call "%~dp0engine_opportunityos.bat" INSTALL
exit /b %errorlevel%
