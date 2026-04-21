@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title Desinstalar TenderLoop
color 0C

echo ==========================================
echo    DESINSTALACION DE TENDERLOOP
echo ==========================================
echo.
echo Este script:
echo   1) Cierra los procesos de Node que esten
echo      bloqueando archivos de esta carpeta.
echo   2) Borra node_modules, dist y caches
echo      (ocupan mucho espacio y son los que
echo      suelen impedir borrar la carpeta).
echo   3) Te deja libre la carpeta para que la
echo      puedas eliminar manualmente o no.
echo.
echo TU BASE DE DATOS (archivo .json fuera de esta
echo carpeta) NO se toca. Tus proyectos quedan
echo intactos en la ruta que elegiste al crearla.
echo.
set /p CONFIRM="Continuar? (s/n): "
if /i not "%CONFIRM%"=="s" (
    echo.
    echo Cancelado. No se modifico nada.
    timeout /t 2 >nul
    exit /b 0
)

echo.
echo ==========================================
echo  Paso 1 de 3 - Cerrando procesos de TenderLoop
echo ==========================================

:: Cerrar procesos en puertos 3000 (Loop), 3003 (Flow) y 3099 (helper)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
    if not errorlevel 1 echo   [OK] Cerrado PID %%a ^(puerto 3000^)
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3003 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
    if not errorlevel 1 echo   [OK] Cerrado PID %%a ^(puerto 3003^)
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3099 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
    if not errorlevel 1 echo   [OK] Cerrado PID %%a ^(puerto 3099^)
)

:: Cerrar procesos node.exe que esten corriendo desde esta carpeta.
:: (Usamos PowerShell + CIM, que siempre viene con Windows 10/11.)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$target = (Resolve-Path '.').Path.ToLower();" ^
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" |" ^
    "  Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($target) } |" ^
    "  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Host ('  [OK] Cerrado node.exe PID ' + $_.ProcessId) } catch {} }" 2>nul

:: Pequena pausa para que Windows libere los locks de archivos
timeout /t 2 /nobreak >nul

echo.
echo ==========================================
echo  Paso 2 de 3 - Borrando dependencias y cache
echo ==========================================

if exist node_modules (
    echo   Borrando node_modules ^(esto puede tardar 1-2 min^)...
    rmdir /s /q node_modules
    if exist node_modules (
        echo   [AVISO] No se pudo borrar node_modules por completo.
        echo           Cierra la app y vuelve a ejecutar este script.
    ) else (
        echo   [OK] node_modules eliminado.
    )
) else (
    echo   node_modules ya no existe, se omite.
)

if exist dist (
    rmdir /s /q dist
    echo   [OK] dist eliminado.
)

if exist .vite (
    rmdir /s /q .vite
    echo   [OK] cache .vite eliminado.
)

if exist package-lock.json (
    del /f /q package-lock.json >nul 2>&1
    echo   [OK] package-lock.json eliminado.
)

echo.
echo ==========================================
echo  Paso 3 de 3 - Listo
echo ==========================================
echo.
echo [OK] TenderLoop fue desinstalado de esta carpeta.
echo.
echo Ahora puedes:
echo   - Borrar toda esta carpeta desde el Explorador
echo     de Windows sin que te aparezca el error de
echo     "archivo en uso".
echo   - O volver a ejecutar LANZAR_TENDERLOOP.vbs
echo     si cambias de opinion ^(reinstalara todo^).
echo.
echo Tus datos ^(archivo .json^) NO se tocaron.
echo.
pause
exit /b 0
