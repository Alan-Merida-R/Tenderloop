@echo off
title Cerrar Tender Flow - Schneider Electric
color 0B
echo ==========================================
echo    DETENIENDO TENDER FLOW ENGINE...
echo ==========================================

:: Matar especificamente el proceso que esta en el puerto 3003
set FLOW_PID=
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3003') do set FLOW_PID=%%a

if defined FLOW_PID (
    taskkill /f /pid %FLOW_PID% >nul 2>&1
    echo.
    echo [OK] El motor de Flow en el puerto 3003 se ha detenido.
    echo [OK] Puerto liberado satisfactoriamente.
) else (
    echo.
    echo [!] No se detecto ninguna instancia de Tender Flow activa en el puerto 3003.
)

echo ==========================================
echo Esta ventana se cerrara en 3 segundos.
timeout /t 3 >nul
exit
