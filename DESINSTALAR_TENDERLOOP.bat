@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"
set "DESKTOP_DIR=%~1"
set "PROGRAM_DIR=%~2"
set "FAILED=0"

echo [1/4] Closing TenderLoop processes...
for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  taskkill /f /pid %%P >nul 2>&1
  if not errorlevel 1 echo [OK] Closed app process %%P
)
for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":3099 " ^| findstr "LISTENING"') do (
  taskkill /f /pid %%P >nul 2>&1
  if not errorlevel 1 echo [OK] Closed local engine %%P
)
powershell -NoProfile -Command "$target = (Resolve-Path -LiteralPath '%APP_DIR%').Path.ToLowerInvariant(); Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" ^| Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($target) } ^| ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Output ('[OK] Closed Node process ' + $_.ProcessId) } catch { Write-Output ('[WARN] Could not close Node process ' + $_.ProcessId) } }"
taskkill /f /im TenderLoop.exe >nul 2>&1
if not errorlevel 1 echo [OK] Closed launcher process
timeout /t 1 /nobreak >nul

echo [2/4] Removing local dependencies, build files, and launcher...
for %%D in ("%APP_DIR%node_modules" "%APP_DIR%dist" "%APP_DIR%.vite") do (
  if exist "%%~D" (
    rmdir /s /q "%%~D"
    if exist "%%~D" (echo [WARN] Could not completely remove %%~nxD & set "FAILED=1") else (echo [OK] Removed %%~nxD)
  ) else (echo [OK] %%~nxD was already absent)
)
for %%F in ("%APP_DIR%TenderLoop.exe" "%APP_DIR%tenderloop.ico") do (
  if exist "%%~F" (
    del /f /q "%%~F" >nul 2>&1
    if exist "%%~F" (echo [WARN] Could not remove %%~nxF & set "FAILED=1") else (echo [OK] Removed %%~nxF)
  )
)

echo [3/4] Removing TenderLoop shortcuts...
if defined DESKTOP_DIR if exist "%DESKTOP_DIR%\TenderLoop.lnk" del /q "%DESKTOP_DIR%\TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR if exist "%PROGRAM_DIR%\TenderLoop.lnk" del /q "%PROGRAM_DIR%\TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR if exist "%PROGRAM_DIR%\Uninstall TenderLoop.lnk" del /q "%PROGRAM_DIR%\Uninstall TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR rd "%PROGRAM_DIR%" >nul 2>&1
echo [OK] TenderLoop shortcuts removed.

echo [4/4] Keeping your data safe...
echo [OK] Your database, Node.js installation, and TenderLoop source files were not changed.
if "%FAILED%"=="1" exit /b 2
exit /b 0
