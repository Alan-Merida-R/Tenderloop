@echo off
title Cerrar TenderLoop
color 0C
echo ==========================================
echo    DETENIENDO TENDERLOOP...
echo ==========================================

taskkill /f /im node.exe >nul 2>&1
taskkill /f /im esbuild.exe >nul 2>&1

echo.
echo [OK] Todos los procesos detenidos.
echo [OK] Archivos liberados en el sistema operativo.
echo ==========================================
timeout /t 3 >nul
exit
