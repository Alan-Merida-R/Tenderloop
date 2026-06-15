@echo off
setlocal
cd /d "%~dp0"

title Tender Flow - Motor (puerto 3003)

:: 1. Limpieza: liberar solo el puerto 3003 (no choca con Loop en 3000)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3003') do taskkill /f /pid %%a >nul 2>&1

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
    echo [INFO] Instalando dependencias por primera vez, puede tardar varios minutos...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [ERROR] Fallo "npm install". Posibles causas:
        echo   - Sin conexion a internet
        echo   - Proxy corporativo bloqueando npm
        echo   - Node.js desactualizado
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

echo [OK] Servidor iniciando... El navegador se abrira automaticamente.
echo     (deja esta ventana abierta mientras uses la app)
echo.

:: 5. Lanzar script que espera a que Vite este listo y LUEGO abre el navegador
start "" /B cmd /c "
  :ESPERAR
  timeout /t 1 /nobreak >nul
  curl -s http://localhost:3003/index_flow.html >nul 2>&1
  if errorlevel 1 goto ESPERAR
  start msedge --app="http://localhost:3003/index_flow.html" 2>nul
  if errorlevel 1 start chrome --app="http://localhost:3003/index_flow.html" 2>nul
  if errorlevel 1 start "" "http://localhost:3003/index_flow.html"
"

:: 6. Ejecutar vite. Si cae, pausar para ver el error
call node_modules\.bin\vite.cmd --port 3003 --strictPort
if errorlevel 1 (
    echo.
    echo [ERROR] Vite termino con error. Revisa el log anterior.
    echo.
    pause
)
