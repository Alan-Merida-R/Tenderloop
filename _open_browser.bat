@echo off
:: Espera a que Vite responda en localhost:3000 y abre el navegador en modo app
:WAIT
timeout /t 1 /nobreak >nul
curl.exe -s -o nul http://localhost:3000 >nul 2>&1
if errorlevel 1 goto WAIT

:: Intentar Edge en modo app (sin marcos, parece app nativa)
start "" msedge --app="http://localhost:3000" 2>nul
if not errorlevel 1 exit /b 0

:: Intentar Chrome en modo app
start "" chrome --app="http://localhost:3000" 2>nul
if not errorlevel 1 exit /b 0

:: Fallback: navegador por defecto
start "" "http://localhost:3000"
