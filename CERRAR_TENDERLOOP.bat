@echo off
title Cerrar TenderLoop - Schneider Electric
color 0C
echo ==========================================
echo    DETENIENDO TENDERLOOP MANAGER...
echo ==========================================

:: Matar todos los procesos de Node.js de forma forzada
taskkill /f /im node.exe >nul 2>&1

if %errorlevel% equ 0 (
    echo.
    echo [OK] La aplicacion se ha cerrado correctamente.
    echo [OK] Puerto 3000 liberado.
) else (
    echo.
    echo [!] No se encontraron instancias de TenderLoop activas.
)

echo ==========================================
echo Puedes cerrar esta ventana.
timeout /t 3 >nul
exit