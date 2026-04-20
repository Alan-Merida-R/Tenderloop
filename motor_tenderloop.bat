@echo off
setlocal
cd /d "%~dp0"

title Tender Loop - Motor (puerto 3000)

:: 1. Limpieza: liberar solo el puerto 3000 (no mata a Flow en 3003)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1

:: 2. Verificar Node.js (mensaje claro si falta)
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo         Descargalo en https://nodejs.org/ (version LTS) y reinicia la PC.
    echo.
    pause
    exit /b 1
)

:: 3. Instalar dependencias si faltan (con verificacion de exito)
if not exist node_modules (
    echo [INFO] Instalando paquetes por primera vez, puede tardar varios minutos...
    call npm install --prefer-offline --no-audit --no-fund --maxsockets 1
    if errorlevel 1 (
        echo.
        echo [ERROR] Fallo "npm install". Revisa tu conexion o proxy corporativo.
        echo.
        pause
        exit /b 1
    )
    call npm install xlsx mammoth --prefer-offline --no-audit --no-fund --maxsockets 1
    if errorlevel 1 (
        echo.
        echo [ERROR] Fallo "npm install xlsx mammoth".
        echo.
        pause
        exit /b 1
    )
)

:: 4. Verificar que vite quedo instalado
if not exist "node_modules\.bin\vite.cmd" (
    echo.
    echo [ERROR] No se encontro vite en node_modules. La instalacion pudo fallar.
    echo         Borra la carpeta node_modules y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)

:: 5. Arrancar helper de apertura de archivos en segundo plano
start "" /B node server\openHelper.js

:: 6. Abrir navegador en modo app (el primero que encuentre)
start vivaldi --app="http://localhost:3000" || start msedge --app="http://localhost:3000" || start chrome --app="http://localhost:3000" || start "" "http://localhost:3000"

echo [OK] Tender Loop iniciado en http://localhost:3000
echo     (deja esta ventana abierta mientras uses la app)
echo.

:: 7. Ejecutar vite. Si cae, pausar para ver el error
call node_modules\.bin\vite.cmd --port 3000 --strictPort
if errorlevel 1 (
    echo.
    echo [ERROR] Vite termino con error. Revisa el log anterior.
    echo.
    pause
)
