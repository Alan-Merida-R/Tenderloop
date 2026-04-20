@echo off
setlocal
cd /d "%~dp0"

taskkill /f /im node.exe >nul 2>&1
taskkill /f /im esbuild.exe >nul 2>&1

node -v >nul 2>&1
if %errorlevel% neq 0 exit

if not exist node_modules (
    echo Instalando paquetes por primera vez, por favor espere...
    call npm install --prefer-offline --no-audit --no-fund --maxsockets 1
    call npm install xlsx mammoth --prefer-offline --no-audit --no-fund --maxsockets 1
)

start "" /B node server\openHelper.js

start vivaldi --app="http://localhost:3000" || start msedge --app="http://localhost:3000" || start chrome --app="http://localhost:3000" || start "" "http://localhost:3000"
call node_modules\.bin\vite.cmd --port 3000 --strictPort
