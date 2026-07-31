@echo off
setlocal EnableExtensions
cd /d "%~dp0"

:: Compatibility launcher for Windows environments that block .vbs or .hta
:: files. It never deletes project files and keeps setup errors visible.
if exist "node_modules\.bin\vite.cmd" (
    call "%~dp0engine_opportunityos.bat" HIDDEN
    exit /b %errorlevel%
)

echo OpportunityOS needs a first-time setup before it can open.
echo A visible installer will run now. Keep this window open if an error appears.
call "%~dp0engine_opportunityos.bat" INSTALL
exit /b %errorlevel%
