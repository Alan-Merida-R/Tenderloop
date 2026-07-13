@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"
set "DESKTOP_DIR=%~1"
set "PROGRAM_DIR=%~2"
echo [1/3] Closing TenderLoop processes...
:: Do not claim ports globally: another approved application may use them.
:: Only stop Node or TenderLoop.exe processes launched from this exact folder.
powershell -NoProfile -Command "$target = (Resolve-Path -LiteralPath '%APP_DIR%').Path.TrimEnd('\').ToLowerInvariant(); Get-CimInstance Win32_Process ^| Where-Object { $cmd = $_.CommandLine; $exe = $_.ExecutablePath; (($_.Name -ieq 'node.exe') -and $cmd -and $cmd.ToLowerInvariant().Contains($target)) -or (($_.Name -ieq 'TenderLoop.exe') -and $exe -and $exe.ToLowerInvariant().StartsWith($target)) } ^| ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Output ('[OK] Closed TenderLoop process ' + $_.ProcessId) } catch { Write-Output ('[WARN] Could not close TenderLoop process ' + $_.ProcessId) } }"
timeout /t 1 /nobreak >nul

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
