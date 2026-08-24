@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0scripts\publish-update.ps1"
if errorlevel 1 (
  echo.
  echo The update package was not published.
  pause
)
