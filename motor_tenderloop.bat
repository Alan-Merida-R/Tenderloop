@echo off
setlocal
:: Forzar que el script trabaje en la carpeta donde esta el archivo
cd /d "%~dp0"

:: 1. LIMPIEZA: Matar procesos de Node previos para liberar el puerto 3000
:: Esto evita que se mueva al puerto 3001, 3002, etc.
taskkill /f /im node.exe >nul 2>&1

:: 2. Verificar Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 exit

:: 3. Instalacion silenciosa de dependencias (solo si faltan)
if not exist node_modules (
    call npm install --quiet
)

:: 4. Asegurar librerias de Excel/Word
call npm install xlsx mammoth --quiet

:: 5. Iniciar la aplicación FORZANDO el puerto 3000
:: Primero intentamos abrir como App (Vivaldi, Edge o Chrome). Si fallan, abre el default.
start vivaldi --app="http://localhost:3000" || start msedge --app="http://localhost:3000" || start chrome --app="http://localhost:3000" || start "" "http://localhost:3000"
:: Luego ejecutamos Vite forzando el puerto y la carpeta actual
call npx vite --port 3000 --strictPort