@echo off
setlocal
title TenderLoop Motor
cd /d "%~dp0"

echo [1/3] Limpiando procesos previos...
taskkill /f /im node.exe >nul 2>&1

echo [2/3] Verificando entorno (Inicio Rapido)...
if not exist node_modules (
    echo Instalando dependencias por primera vez...
    call npm install --quiet
)

echo [3/3] Iniciando Servidor...
REM Ejecutamos Vite directamente desde node_modules para maxima velocidad
start /B "" "node_modules\.bin\vite.cmd" --port 3000 --strictPort

echo Esperando al servidor en puerto 3000...
:WAIT_LOOP
timeout /t 1 /nobreak >nul
(curl -s http://localhost:3000 >nul) || goto WAIT_LOOP

echo.
echo ==========================================
echo   TenderLoop esta CORRIENDO (App Mode)
echo   Cierra la ventana de la App para salir.
echo ==========================================
echo.

REM Buscamos Vivaldi en rutas comunes (LocalAppData o Program Files)
set "VIVALDI_PATH=vivaldi"
if exist "%LocalAppData%\Vivaldi\Application\vivaldi.exe" set "VIVALDI_PATH=%LocalAppData%\Vivaldi\Application\vivaldi.exe"
if exist "%ProgramFiles%\Vivaldi\Application\vivaldi.exe" set "VIVALDI_PATH=%ProgramFiles%\Vivaldi\Application\vivaldi.exe"
if exist "%ProgramFiles(x86)%\Vivaldi\Application\vivaldi.exe" set "VIVALDI_PATH=%ProgramFiles(x86)%\Vivaldi\Application\vivaldi.exe"

echo [TenderLoop] Abriendo en Vivaldi (Modo App)...
echo Cierra la ventana de la App para apagar la operacion.

REM Lanzamos Vivaldi en modo App y esperamos a que cierre
start /wait "" "%VIVALDI_PATH%" --app=http://localhost:3000 --new-window

echo.
echo Apagando servidor TenderLoop local...
taskkill /f /im node.exe >nul 2>&1
echo Operacion finalizada correctamente.
timeout /t 2 >nul
exit