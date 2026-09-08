@echo off
cd /d "%~dp0"
title Grabadora bFO - OpportunityOS

echo.
echo   GRABADORA bFO
echo   =============
echo.

rem --- El backend de OpportunityOS tiene que estar arriba, puerto 3099 ---
curl.exe -f -s -o nul --max-time 3 -H "Origin: http://localhost:3000" http://127.0.0.1:3099/api/health
if errorlevel 1 goto :sinapp

rem --- Confirmar que ese backend ya trae la grabadora ---
rem Se busca "web-recorder", no "web-automation": builds anteriores ya
rem reportaban web-automation sin tener las rutas de grabacion, y el .bat
rem los daba por buenos hasta que la grabacion fallaba con "Not found".
curl.exe -s --max-time 5 -H "Origin: http://localhost:3000" http://127.0.0.1:3099/api/health | findstr /C:"web-recorder" >nul
if errorlevel 1 goto :vieja

echo   Conectado a OpportunityOS.
echo.
echo   Antes de seguir: conectate a la VPN.
echo.
echo   Pega la URL del SR en bFO, la que te llega en el correo.
echo   Se ve asi:
echo     https://se.lightning.force.com/lightning/r/OPP_SupportRequest__c/XXXX/view
echo.
set "SRURL="
set /p "SRURL=URL del SR: "
if not defined SRURL goto :sinurl

echo.
echo   Abriendo bFO...
rem El dato va por query string: en cmd, escapar JSON es una fuente de errores.
curl.exe -s --max-time 90 -X POST -H "Origin: http://localhost:3000" "http://127.0.0.1:3099/api/web/record/start?url=%SRURL%"
echo.
echo.
echo   ------------------------------------------------------------
echo    AHORA, EN LA VENTANA DE CHROME QUE SE ABRIO:
echo.
echo    1. Pasa PingID como siempre.
echo    2. En NAVEGAR, entra a Edicion y usa bFO normalmente.
echo    3. Dale al boton "Senalar campo" del panel negro de arriba
echo       a la derecha, y luego clic al control completo de la lista,
echo       fecha o comentario. Elige que dato es.
echo    4. Repite para cada dato que quieras guardar.
echo    5. Escribe un nombre en el panel y pulsa "Listo". Ese boton
echo       guarda la receta inmediatamente.
echo.
echo    Cuando termines, REGRESA AQUI y presiona una tecla.
echo   ------------------------------------------------------------
echo.
pause

echo.
echo   Pasos grabados:
set "RECSTATUS=%TEMP%\opportunityos-bfo-recorder-status.json"
curl.exe -s --max-time 10 -H "Origin: http://localhost:3000" http://127.0.0.1:3099/api/web/record/steps -o "%RECSTATUS%"
type "%RECSTATUS%"
echo.
echo.

findstr /C:"\"finished\":true" "%RECSTATUS%" >nul
if not errorlevel 1 goto :guardada

set "RECETA="
set /p "RECETA=Nombre para esta receta, por ejemplo direccion-cliente: "
if not defined RECETA set "RECETA=receta"

echo.
echo   Guardando...
curl.exe -s --max-time 20 -X POST -H "Origin: http://localhost:3000" "http://127.0.0.1:3099/api/web/record/stop?name=%RECETA%"
echo.
echo.

:guardada
echo   Listo. La receta quedo guardada en la carpeta:
echo     %APPDATA%\OpportunityOS\web-recipes
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
echo           sin la grabadora.
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
