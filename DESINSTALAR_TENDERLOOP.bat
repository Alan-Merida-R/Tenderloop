@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"
set "DESKTOP_DIR=%~1"
set "PROGRAM_DIR=%~2"
set "FAILED=0"

echo [1/4] Closing TenderLoop processes...
:: Do not claim ports globally: another approved application may use them.
:: Only stop Node or TenderLoop.exe processes launched from this exact folder.
powershell -NoProfile -Command "$target = (Resolve-Path -LiteralPath '%APP_DIR%').Path.TrimEnd('\').ToLowerInvariant(); Get-CimInstance Win32_Process ^| Where-Object { $cmd = $_.CommandLine; $exe = $_.ExecutablePath; (($_.Name -ieq 'node.exe') -and $cmd -and $cmd.ToLowerInvariant().Contains($target)) -or (($_.Name -ieq 'TenderLoop.exe') -and $exe -and $exe.ToLowerInvariant().StartsWith($target)) } ^| ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Output ('[OK] Closed TenderLoop process ' + $_.ProcessId) } catch { Write-Output ('[WARN] Could not close TenderLoop process ' + $_.ProcessId) } }"
timeout /t 1 /nobreak >nul

echo [2/4] Removing local dependencies and build files...
for %%D in ("%APP_DIR%node_modules" "%APP_DIR%dist" "%APP_DIR%.vite") do (
  if exist "%%~D" (
    rmdir /s /q "%%~D"
    if exist "%%~D" (echo [WARN] Could not completely remove %%~nxD & set "FAILED=1") else (echo [OK] Removed %%~nxD)
  ) else (echo [OK] %%~nxD was already absent)
)

echo [3/4] Removing TenderLoop shortcuts...
if defined DESKTOP_DIR if exist "%DESKTOP_DIR%\TenderLoop.lnk" del /q "%DESKTOP_DIR%\TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR if exist "%PROGRAM_DIR%\TenderLoop.lnk" del /q "%PROGRAM_DIR%\TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR if exist "%PROGRAM_DIR%\Uninstall TenderLoop.lnk" del /q "%PROGRAM_DIR%\Uninstall TenderLoop.lnk" >nul 2>&1
if defined PROGRAM_DIR rd "%PROGRAM_DIR%" >nul 2>&1
echo [OK] TenderLoop shortcuts removed.

echo [4/4] Keeping your data safe...
echo [OK] Your database, Node.js installation, launcher, and TenderLoop source files were not changed.
if "%FAILED%"=="1" exit /b 2
exit /b 0
