@echo off
setlocal EnableExtensions
set "UPDATE_ROOT=%~dp0"

:: Published next to OpportunityOS-<version>.zip. It runs outside the installed
:: folder, allowing the application files to be replaced safely.
powershell.exe -NoProfile -STA -File "%UPDATE_ROOT%install-update-v2.ps1" -PackageFolder "%UPDATE_ROOT%"
if errorlevel 1 (
    echo.
    echo The Tender Control update was not installed. Review the message above.
    pause
)
