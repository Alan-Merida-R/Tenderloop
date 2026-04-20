@echo off
title Cerrar TenderLoop
color 0C
echo ==========================================
echo    DETENIENDO TENDERLOOP...
echo ==========================================

:: Matar solo el proceso de Loop (puerto 3000) para no tocar Flow (3003)
set LOOP_PID=
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do set LOOP_PID=%%a

if defined LOOP_PID (
    taskkill /f /pid %LOOP_PID% >nul 2>&1
    echo.
    echo [OK] TenderLoop (puerto 3000) detenido.
) else (
    echo.
    echo [!] No se detecto TenderLoop activo en el puerto 3000.
)

:: Matar tambien el helper de apertura de archivos (puerto 3099)
set HELPER_PID=
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3099') do set HELPER_PID=%%a
if defined HELPER_PID (
    taskkill /f /pid %HELPER_PID% >nul 2>&1
    echo [OK] Helper de archivos (puerto 3099) detenido.
)

echo ==========================================
timeout /t 3 >nul
exit
