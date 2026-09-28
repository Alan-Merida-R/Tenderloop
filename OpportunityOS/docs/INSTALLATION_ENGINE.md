# Instalación y ejecución con `engine_opportunityos.bat`

## Punto de entrada

`engine_opportunityos.bat` es el único punto de entrada principal de Tender
Control. No usa HTA, VBScript, `wscript.exe`, `cscript.exe` ni Windows Script
Host. Tampoco solicita permisos de administrador ni cambia la política de
ejecución de PowerShell.

El frontend continúa limitado a `http://127.0.0.1:3000` y el backend a
`http://127.0.0.1:3099`.

La preparación y el inicio principales usan BAT + Node y no dependen de poder
ejecutar archivos PowerShell. PowerShell permanece en actualización,
publicación y desinstalación; esos flujos respetan la política corporativa y no
usan `-ExecutionPolicy Bypass`. Si la organización los bloquea, deben
autorizarse por el canal de Cybersecurity en vez de saltar el control.

## Flujo automático

1. Si frontend y backend ya responden, cierra de forma segura esa instancia
   anterior y libera 3000/3099 antes de iniciar la versión actual.
2. Comprueba que los puertos 3000 y 3099 estén libres.
3. Distingue una distribución oficial por `offline-runtime.json`.
4. En una distribución oficial, verifica runtime, manifiestos, hashes, build y
   dependencias empaquetadas. Nunca ejecuta npm ni descarga archivos.
5. En una copia fuente, comprueba Node.js, npm, `package.json` y el lockfile.
   Ejecuta `npm ci --include=dev --no-audit --no-fund` únicamente cuando falta
   el árbol de dependencias o cambió `package-lock.json`. Calcula una huella de
   las entradas del frontend y ejecuta `npm run build` solo si `dist` falta o
   quedó obsoleto.
   Si la copia se pegó encima de una instalación antigua y quedaron manifiestos
   offline, la presencia de `scripts/install-source-mode.mjs` da prioridad segura
   al modo fuente. Después del build retira solamente los launchers HTA/VBS y
   helpers WSH obsoletos conocidos.
6. Inicia Express y Vite Preview, ambos en loopback, y espera hasta 60 segundos
   a que los dos health checks respondan.
7. Abre una pestaña mediante la asociación HTTP estándar de Windows. El modo
   ventana Chromium queda disponible como opción explícita `APP`, no como valor
   predeterminado.
8. Mantiene la consola abierta para mostrar errores y conservar observables los
   dos procesos locales.

## Causa del antiguo error `Phase`

`scripts/install-source-mode.ps1` (ya retirado) declaraba `Phase` como parámetro obligatorio
con los valores `Validate`, `Dependencies` y `Build`. El engine lo invocaba tres
veces, pero entregaba `-ProjectRoot "%~dp0"`. En BAT, `%~dp0` siempre termina en
barra invertida. Al cruzar la línea de comandos nativa de `powershell.exe`, esa
barra final podía absorber el cierre de comillas y hacer que `-Phase Validate`
formara parte del argumento anterior. PowerShell recibía `ProjectRoot`, pero no
`Phase`, y por eso abría el prompt interactivo.

La solución no relaja `Mandatory`: elimina la API artificial por fases. El
helper recibe solo una ruta sin barra final (`%CD%`) y decide internamente qué
trabajo es necesario. Por lo tanto no existe ningún parámetro técnico que el
usuario deba contestar.

## Actualización y reparación

- Para reemplazar manualmente una copia fuente, cierra Tender Control con
  `CLOSE_OPPORTUNITYOS.bat`, copia los archivos nuevos sobre la misma carpeta y
  vuelve a ejecutar `engine_opportunityos.bat`. No es necesario borrar primero
  `node_modules`, `dist` ni metadatos antiguos: el engine los valida o reconstruye.
- Una distribución oficial puede aplicar el paquete configurado en Settings al
  inicio. El actualizador verifica SHA-256, crea respaldo, instala, verifica y
  revierte si hay error.
- `ACTUALIZAR_TENDER_CONTROL.cmd` sigue disponible para una actualización manual
  offline. Localiza la instalación mediante
  `%APPDATA%\OpportunityOS\install-root.txt`, escrito por el engine. Si migra
  una instalación antigua que todavía no tiene ese archivo, solicita elegir la
  carpeta mediante el selector estándar de Windows.

## Cierre y desinstalación

`CLOSE_OPPORTUNITYOS.bat` libera los servicios locales. Para desinstalar, ejecuta
`DESINSTALAR_OPPORTUNITYOS.bat`: confirma la operación, cierra los servicios y
delega a un script PowerShell temporal la eliminación de la carpeta después de
que el BAT termine. `%APPDATA%\OpportunityOS`, bases externas y otras
instalaciones de Node.js se conservan.

## Diagnóstico

Los comandos npm muestran su salida. Si fallan, el helper informa la fase, el
comando exacto y el exit code. El engine no redirige los mensajes de Node, Vite
o Express, y ante timeout indica los puertos que deben revisarse.
