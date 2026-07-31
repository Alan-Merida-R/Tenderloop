@echo off
setlocal EnableExtensions
cd /d "%~dp0"

:: Same as OPEN_OPPORTUNITYOS.bat, but opens OpportunityOS as a normal browser
:: tab instead of the app-style window. Compatibility launcher for Windows
:: environments that block .vbs files.
if exist "node_modules\.bin\vite.cmd" (
    call "%~dp0engine_opportunityos.bat" HIDDEN TAB
    exit /b %errorlevel%
)

echo OpportunityOS needs a first-time setup before it can open.
echo A visible installer will run now. Keep this window open if an error appears.
call "%~dp0engine_opportunityos.bat" INSTALL
exit /b %errorlevel%
