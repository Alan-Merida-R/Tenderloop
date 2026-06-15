@echo off
setlocal
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=VISIBLE"

:: --- Liberar puerto 3000 si esta ocupado ---
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: --- Verificar Node.js ---
where node >nul 2>&1
if %errorlevel% neq 0 (
    if "%MODE%"=="VISIBLE" (
        echo [ERROR] Node.js no encontrado. Instala desde https://nodejs.org/
        pause
    )
    exit /b 1
)

:: --- Instalar dependencias si faltan ---
if not exist node_modules (
    echo [INFO] Instalando dependencias por primera vez, puede tardar varios minutos...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        if "%MODE%"=="VISIBLE" (
            echo.
            echo [ERROR] npm install fallo. Posibles causas:
            echo   - Sin conexion a internet
            echo   - Proxy corporativo bloqueando npm
            echo   - Node.js desactualizado
            echo.
            pause
        )
        exit /b 1
    )
)

:: --- Verificar vite ---
if not exist "node_modules\.bin\vite.cmd" (
    if "%MODE%"=="VISIBLE" (
        echo [ERROR] vite no encontrado. Borra node_modules y reintenta.
        pause
    )
    exit /b 1
)

:: --- Open helper en segundo plano ---
if exist "server\openHelper.js" (
    start "" /B node server\openHelper.js
)

:: --- Abrir navegador en modo app cuando vite este listo ---
start "" /B cmd /c "call "%~dp0_open_browser.bat""

:: --- Arrancar Vite (bloquea hasta que se cierre) ---
call node_modules\.bin\vite.cmd --port 3000 --strictPort
