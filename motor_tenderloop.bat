@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title Tender Loop - Motor (puerto 3000)

:: ============================================================
:: 1. Limpieza: liberar el puerto 3000 (no mata Flow en 3003)
::    Si no hay nada en el puerto, simplemente continua.
:: ============================================================
echo [INFO] Verificando puerto 3000...
set "FOUND_PID="
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " 2^>nul') do (
    if not "%%a"=="0" (
        set "FOUND_PID=%%a"
        taskkill /f /pid %%a >nul 2>&1
    )
)
if defined FOUND_PID (
    echo [INFO] Proceso anterior en puerto 3000 terminado ^(PID: !FOUND_PID!^).
    timeout /t 1 /nobreak >nul
) else (
    echo [INFO] Puerto 3000 libre.
)

:: ============================================================
:: 2. Verificar Node.js
:: ============================================================
echo [INFO] Verificando Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ===================================================
    echo  [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo          Descargalo en https://nodejs.org/ ^(version LTS^)
    echo          y reinicia la PC despues de instalarlo.
    echo ===================================================
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js %%v detectado.

:: ============================================================
:: 3. Instalar dependencias si faltan
:: ============================================================
if not exist node_modules (
    echo.
    echo [INFO] Primera ejecucion: instalando paquetes...
    echo        Esto puede tardar varios minutos, no cierres esta ventana.
    echo.
    call npm install --prefer-offline --no-audit --no-fund --maxsockets 1
    if errorlevel 1 (
        echo.
        echo [ERROR] Fallo "npm install". Revisa tu conexion a internet o proxy corporativo.
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
    echo.
    echo [OK] Paquetes instalados correctamente.
    echo.
)

:: ============================================================
:: 4. Verificar que vite quedo instalado
:: ============================================================
if not exist "node_modules\.bin\vite.cmd" (
    echo.
    echo ===================================================
    echo  [ERROR] No se encontro vite en node_modules.
    echo          La instalacion pudo fallar o estar incompleta.
    echo          Borra la carpeta node_modules y vuelve a
    echo          ejecutar este archivo.
    echo ===================================================
    echo.
    pause
    exit /b 1
)
echo [OK] Vite detectado.

:: ============================================================
:: 5. Arrancar helper de apertura de archivos en segundo plano
:: ============================================================
if exist "server\openHelper.js" (
    start "" /B node server\openHelper.js
    echo [OK] Open-helper iniciado.
) else (
    echo [WARN] server\openHelper.js no encontrado, omitiendo helper.
)

echo.
echo ===================================================
echo  Servidor iniciando en http://localhost:3000
echo  Deja esta ventana abierta mientras uses la app.
echo ===================================================
echo.

:: ============================================================
:: 6. Lanzar script que espera a que Vite este listo y abre navegador
:: ============================================================
start "" /B cmd /c "title TL-BrowserWait & :ESPERAR & timeout /t 2 /nobreak >nul & curl -s -o nul -w """%%{http_code}""" http://localhost:3000 2>nul | findstr /r "200 304" >nul 2>&1 & if errorlevel 1 goto ESPERAR & start msedge --app=""http://localhost:3000"" 2>nul || start chrome --app=""http://localhost:3000"" 2>nul || start """" ""http://localhost:3000"""

:: ============================================================
:: 7. Ejecutar vite — esta llamada bloquea hasta que vite muera
:: ============================================================
echo [INFO] Lanzando Vite en puerto 3000...
echo.
call node_modules\.bin\vite.cmd --port 3000 --strictPort
set VITE_EXIT=%errorlevel%

:: ============================================================
:: 8. Si vite termino (error o Ctrl+C), pausar para diagnostico
:: ============================================================
echo.
if %VITE_EXIT% neq 0 (
    echo ===================================================
    echo  [ERROR] Vite termino con codigo de error %VITE_EXIT%.
    echo  Revisa el log de arriba para mas detalles.
    echo ===================================================
) else (
    echo [INFO] Vite se detuvo normalmente.
)
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause >nul
