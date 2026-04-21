@echo off
:: Espera a que Vite responda en localhost:3000 y abre el navegador en modo app
:WAIT
timeout /t 1 /nobreak >nul
curl.exe -s -o nul http://localhost:3000 >nul 2>&1
if errorlevel 1 goto WAIT

:: --- Buscar Vivaldi ---
:: Ruta tipica: %LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe
if exist "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe" (
    start "" "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe" --app="http://localhost:3000"
    exit /b 0
)
:: Ruta alternativa: Program Files
if exist "%ProgramFiles%\Vivaldi\Application\vivaldi.exe" (
    start "" "%ProgramFiles%\Vivaldi\Application\vivaldi.exe" --app="http://localhost:3000"
    exit /b 0
)
:: Ruta alternativa: Program Files (x86)
if exist "%ProgramFiles(x86)%\Vivaldi\Application\vivaldi.exe" (
    start "" "%ProgramFiles(x86)%\Vivaldi\Application\vivaldi.exe" --app="http://localhost:3000"
    exit /b 0
)

:: --- Vivaldi no encontrado: abrir en navegador por defecto ---
start "" "http://localhost:3000"
