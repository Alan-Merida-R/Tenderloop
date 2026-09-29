# Changeset del engine — 2026-09-28

## Objetivo

Sustituir por completo el flujo HTA/VBScript/Windows Script Host de Tender
Control por un único punto de entrada auditable: `engine_opportunityos.bat`.
No se cambia la versión `1.0.5`, no se publica un ZIP y no se modifica `main`.

## Causa raíz corregida

El helper de fuente exigía `-Phase` con `Validate`, `Dependencies` o `Build`.
Aunque el engine escribía el parámetro, el argumento anterior era
`-ProjectRoot "%~dp0"`; `%~dp0` termina en `\` y podía romper el límite de comillas
al llegar a `powershell.exe`. El resultado era que `-Phase Validate` se absorbía
en la ruta y PowerShell pedía el valor obligatorio de forma interactiva.

Se eliminó el contrato por fases. El engine entrega una ruta normalizada sin
barra final y el helper decide de forma automática si debe validar, instalar o
compilar.

## Cambios funcionales

- El engine detecta distribución offline o copia fuente.
- La preparación fuente y la verificación del paquete se migraron a scripts
  Node `.mjs`, por lo que el inicio principal no depende de la política de
  ejecución de PowerShell.
- El modo fuente valida Node.js/npm y lockfile v3, usa `npm ci` y conserva
  huellas SHA-256 dentro de `node_modules`/`dist` para evitar trabajo repetido.
- El paquete oficial sigue sin usar npm: verifica runtime, manifiesto, hashes,
  dependencias y build empaquetados.
- Frontend y backend se inician en `127.0.0.1`, se comprueban mediante HTTP y
  solo entonces se abre el navegador.
- Después de los health checks, ambos servicios continúan como procesos Node
  desacoplados y ocultos; el engine cierra su consola automáticamente. Sus PID
  quedan registrados para un cierre limitado a esta instalación y sus logs se
  guardan en `%APPDATA%\OpportunityOS\logs`.
- Los errores de npm muestran fase, comando y exit code; los mensajes de Vite,
  Express y Node permanecen visibles.
- El navegador se abre con BAT y `start`; no se descubre ni ejecuta un app-id
  mediante COM de Windows Script Host.
- La actualización automática se ejecuta desde el engine. La actualización
  manual localiza la instalación por `%APPDATA%\OpportunityOS\install-root.txt`
  y relanza el engine con `cmd.exe`; para una instalación antigua sin ese
  puntero usa el selector estándar de carpetas de Windows.
- La desinstalación confirma en BAT y usa un PowerShell temporal para eliminar
  la carpeta cuando el BAT ya terminó, preservando datos de usuario.
- Se retiró `-ExecutionPolicy Bypass` de todos los puntos de entrada del ciclo
  de instalación/publicación/actualización.

## Archivos eliminados

- `INSTALAR_OPPORTUNITYOS.hta`
- `INSTALAR_OPPORTUNITYOS.vbs`
- `OPEN_OPPORTUNITYOS.vbs`
- `OPEN_OPPORTUNITYOS_BROWSER.vbs`
- `DESINSTALAR_OPPORTUNITYOS.hta`
- `DESINSTALAR_OPPORTUNITYOS.vbs`
- `scripts/find-chrome-app-id.ps1`
- `scripts/toggle-app-window.ps1`

Los dos PowerShell eliminados solo daban soporte a launchers WSH: lectura de
accesos directos Chrome y alternancia de ventanas. El modo app continúa mediante
los ejecutables instalados de Chrome, Edge o Vivaldi, con la asociación HTTP de
Windows como fallback.

## Límites de seguridad

- Sin privilegios administrativos, exclusiones antivirus ni cambios de política.
- Sin descarga/ejecución de binarios remotos.
- Paquetes oficiales autocontenidos y verificados con SHA-256.
- Copias fuente sujetas al `package-lock.json` versionado.
- Puertos 3000/3099 limitados a loopback.
- Bases, exportaciones y `%APPDATA%\OpportunityOS` no se versionan ni se borran.

## Verificación

Por las reglas de seguridad de publicación, los instaladores, actualizadores,
desinstaladores y el engine no se ejecutan automáticamente durante revisión. Se
validan por parseo, aserciones estáticas, checks TypeScript/build y comprobación
del lockfile. La prueba manual debe hacerse sobre una copia desechable y un ZIP
oficial antes de publicar.

| Comprobación | Resultado |
| --- | --- |
| `npm run check:launcher` | PASS: sin HTA/VBS/WSH, flujo automático y loopback |
| `npm ci --dry-run --ignore-scripts --no-audit --no-fund` | PASS: lockfile v3 consistente |
| Parseo de PowerShell con `System.Management.Automation.Language.Parser` | PASS: 4 scripts |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; solo warning conocido de chunks mayores a 500 kB |
| `npm run check:server` | PASS |
| Smoke test directo de Vite Preview + Express | PASS: HTTP 200 en 3000 y `/health` en 3099 con Origin confiable; procesos cerrados al terminar |
| `git diff --check` | PASS; avisos informativos LF→CRLF únicamente |

## Compatibilidad posterior con instalaciones antiguas

- Cada ejecución cierra primero una instancia anterior verificada en 3000/3099
  y arranca los archivos de la carpeta actual; un proceso ajeno no se termina.
- La apertura predeterminada cambió de ventana Chromium `--app` a una pestaña
  estándar, evitando que el engine se cierre sin mostrar la aplicación.
- Si una copia fuente nueva se pega sobre un paquete offline viejo, la presencia
  de `scripts/install-source-mode.mjs` tiene prioridad sobre manifiestos antiguos.
- Ese modo reinstala con el lockfile, reconstruye `dist` cuando corresponde y
  elimina solamente los launchers HTA/VBS y helpers WSH obsoletos conocidos.
- Los actualizadores oficial y manual continúan usando `managedFiles` para
  retirar archivos administrados de releases anteriores durante la migración.
- `CLOSE_OPPORTUNITYOS.bat` usa el nuevo registro de PID y conserva el cierre
  heredado para instalaciones antiguas que todavía no lo tengan.
