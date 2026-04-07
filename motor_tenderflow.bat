@echo off
setlocal
:: Forzar que el script trabaje en la carpeta donde esta el archivo
cd /d "%~dp0"

:: 1. LIMPIEZA: Intentar liberar el puerto 3003 específicamente para no chocar con Loop (3000)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3003') do taskkill /f /pid %%a >nul 2>&1

:: 2. Verificar Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js no esta instalado. Por favor instalo antes de continuar.
    pause
    exit
)

:: 3. Instalacion silenciosa de dependencias (solo si faltan)
if not exist node_modules (
    echo [INFO] Instalando dependencias por primera vez...
    call npm install --quiet
)

:: 4. Iniciar la aplicación en modo App (ventana sin barras de navegacion)
:: Usamos index_flow.html especificamente
start vivaldi --app="http://localhost:3003/index_flow.html" || start msedge --app="http://localhost:3003/index_flow.html" || start chrome --app="http://localhost:3003/index_flow.html" || start "" "http://localhost:3003/index_flow.html"

:: 5. Ejecutar el motor de Flow forzando el puerto 3003 y modo estricto
echo [OK] Tender Flow iniciado en el puerto 3003.
call npx vite --port 3003 --strictPort
