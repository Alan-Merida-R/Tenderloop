@echo off
cd /d "%~dp0"
title Leer bFO - OpportunityOS

echo.
echo   LEER DATOS DE bFO
echo   =================
echo.
echo   Esta prueba SOLO LEE. No escribe ni guarda nada en bFO.
echo.

rem --- El backend de OpportunityOS tiene que estar arriba, puerto 3099 ---
curl.exe -f -s -o nul --max-time 3 -H "Origin: http://localhost:3000" http://127.0.0.1:3099/api/health
if errorlevel 1 goto :sinapp

rem --- Confirmar que ese backend ya trae el lector ---
curl.exe -s --max-time 5 -H "Origin: http://localhost:3000" http://127.0.0.1:3099/api/health | findstr /C:"web-reader" >nul
if errorlevel 1 goto :vieja

echo   Conectado a OpportunityOS.
echo.
echo   Antes de seguir: conectate a la VPN.
echo.
echo   Pega la URL del SR, la que te llega en el correo.
echo.
set "SRURL="
set /p "SRURL=URL del SR: "
if not defined SRURL goto :sinurl

echo.
echo   Leyendo. Se va a abrir Chrome y va a recorrer tres paginas:
echo   el SR, la Opportunity y la cuenta. Tarda entre 20 y 40 segundos.
echo.
echo   Si te pide PingID, autorizalo y espera.
echo.

curl.exe -s --max-time 300 -X POST -H "Origin: http://localhost:3000" "http://127.0.0.1:3099/api/web/read?url=%SRURL%"

echo.
echo.
echo   ------------------------------------------------------------
echo    Revisa arriba los valores contra lo que ves en bFO y dime
echo    cuales salieron bien y cuales mal.
echo   ------------------------------------------------------------
echo.
echo   La ventana de Chrome se queda abierta; la puedes cerrar.
echo.
pause
exit /b 0

:sinapp
echo   [ERROR] OpportunityOS no esta abierto.
echo.
echo   Abrelo primero con OPEN_OPPORTUNITYOS.bat, espera a que cargue,
echo   y vuelve a ejecutar este archivo.
echo.
pause
exit /b 1

:vieja
echo   [ERROR] El OpportunityOS que esta abierto es una version vieja,
echo           sin el lector.
echo.
echo   Cierralo con CLOSE_OPPORTUNITYOS.bat y vuelvelo a abrir.
echo.
pause
exit /b 1

:sinurl
echo.
echo   No escribiste ninguna URL. Saliendo.
echo.
pause
exit /b 1
