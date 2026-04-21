@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title Tender Loop - Motor (puerto 3000)

:: Detectar modo: HIDDEN (desde VBS normal) o VISIBLE (primera vez / manual)
set "MODE=%~1"
if "%MODE%"=="" set "MODE=VISIBLE"

:: ============================================================
:: 1. Limpieza: liberar el puerto 3000 (no mata Flow en 3003)
:: ============================================================
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " 2^>nul') do (
    if not "%%a"=="0" (
        taskkill /f /pid %%a >nul 2>&1
    )
)

:: ============================================================
:: 2. Verificar Node.js
:: ============================================================
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo         Descargalo en https://nodejs.org/ ^(version LTS^) y reinicia la PC.
    if "%MODE%"=="VISIBLE" pause
    exit /b 1
)

:: ============================================================
:: 3. Instalar dependencias si faltan
:: ============================================================
if not exist node_modules (
    echo [INFO] Primera ejecucion: instalando paquetes...
    echo        Esto puede tardar varios minutos, no cierres esta ventana.
    echo.
    call npm install --prefer-offline --no-audit --no-fund --maxsockets 1
    if errorlevel 1 (
        echo [ERROR] Fallo "npm install". Revisa tu conexion o proxy corporativo.
        if "%MODE%"=="VISIBLE" pause
        exit /b 1
    )
    call npm install xlsx mammoth --prefer-offline --no-audit --no-fund --maxsockets 1
    if errorlevel 1 (
        echo [ERROR] Fallo "npm install xlsx mammoth".
        if "%MODE%"=="VISIBLE" pause
        exit /b 1
    )
    echo [OK] Paquetes instalados correctamente.
)

:: ============================================================
:: 4. Verificar que vite quedo instalado
:: ============================================================
if not exist "node_modules\.bin\vite.cmd" (
    echo [ERROR] No se encontro vite en node_modules. Borra node_modules y reintenta.
    if "%MODE%"=="VISIBLE" pause
    exit /b 1
)

:: ============================================================
:: 5. Arrancar helper de apertura de archivos en segundo plano
:: ============================================================
if exist "server\openHelper.js" (
    start "" /B node server\openHelper.js
)

:: ============================================================
:: 6. Esperar a que Vite arranque y abrir navegador en modo app
::    (sin marcos, sin barra de direccion — parece app nativa)
:: ============================================================
start "" /B cmd /c "title TL-Wait & :W & timeout /t 1 /nobreak >nul & curl -s http://localhost:3000 >nul 2>&1 & if errorlevel 1 goto W & start msedge --app=""http://localhost:3000"" 2>nul & if errorlevel 1 start chrome --app=""http://localhost:3000"" 2>nul & if errorlevel 1 start """" ""http://localhost:3000"""

:: ============================================================
:: 7. Ejecutar vite (bloquea hasta que se cierre la app)
:: ============================================================
call node_modules\.bin\vite.cmd --port 3000 --strictPort
