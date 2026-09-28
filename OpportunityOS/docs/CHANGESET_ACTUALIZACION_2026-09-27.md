# Changeset de `Actualizacion` — 2026-09-27

> Registro histórico. El flujo HTA/VBScript descrito más abajo fue retirado el
> 2026-09-28. El procedimiento vigente está en
> [`INSTALLATION_ENGINE.md`](INSTALLATION_ENGINE.md) y usa
> `engine_opportunityos.bat`.

## Propósito

Este documento registra el estado completo que se prepara para subir a la rama
`Actualizacion`. No es una publicación ni un cambio de versión: `package.json`
permanece en `1.0.5`, no se genera un ZIP y no se modifica ni fusiona `main`.

Base revisada: `81ecb3e` (`origin/Actualizacion` antes de este changeset).

## Resumen funcional

### 1. Distribución offline autocontenida

- El paquete de publicación incluye `dist`, el árbol exacto de `node_modules` y
  un runtime Node.js x64 firmado por OpenJS.
- La PC destino no ejecuta `npm install`, `npm ci` ni `npm run build`, no descarga
  dependencias, no requiere permisos de administrador y limita frontend/backend
  a `127.0.0.1`.
- `offline-runtime.json` describe runtime, arquitectura, hashes y límites de red.
- `release-manifest.json` pasa a esquema 2 e incorpora SHA-256 para cada archivo
  administrado.
- El verificador offline comprueba integridad, rutas seguras, archivos mínimos,
  hashes del runtime y lockfile, arquitectura y capacidad de arrancar Node.
- El publicador enumera archivos versionados para impedir que bases JSON,
  exportaciones, logs, temporales o archivos de IA entren al paquete.
- Se agrega el aviso de licencia de Node.js y se conservan las licencias propias
  incluidas por las dependencias dentro de `node_modules`.

### 2. Instalación, actualización, rollback y desinstalación

- El instalador visual verifica el paquete local y crea accesos directos; ya no
  busca Node.js del sistema, instala paquetes ni compila.
- El motor usa `runtime/node.exe` en paquetes publicados y sirve el build mediante
  Vite Preview. El fallback a Node del sistema queda solo para árboles de desarrollo
  sin manifiesto offline.
- La actualización automática y la manual exigen un payload offline completo,
  verifican hashes tras copiarlo y restauran la versión anterior ante errores.
- El rollback elimina también archivos nuevos introducidos por el paquete fallido,
  evitando que queden mezcladas dos versiones.
- Los cierres solo terminan listeners de 3000/3099 cuya ruta o línea de comando
  pertenece a la instalación actual; un proceso ajeno nunca se mata por usar el puerto.
- El desinstalador elimina la carpeta de aplicación después de confirmación, pero
  conserva `%APPDATA%\OpportunityOS`, bases externas y otras instalaciones de Node.

### 3. Seguridad de dependencias

- `@xmldom/xmldom`: `0.8.13` → `0.8.15`.
- `dompurify`: `^3.4.12` → `3.4.13`.
- `xlsx`: npm `0.18.5` → tarball oficial fijado de SheetJS `0.20.3`.
- Overrides fijados: `nanoid` `5.1.16` y `qs` `6.16.0`.
- El publicador exige auditoría de todo el árbol, firma válida del runtime y ausencia
  de comandos de red/compilación destinados a PCs usuarias.

### 4. Carpeta de oportunidad y servicio local

- Nueva ruta `POST /api/os/recycle` y capacidad anunciada en `/api/health`.
- Borrado simple o múltiple usa `IFileOperation` con Recycle Bin; no existe fallback
  a eliminación permanente y se rechazan raíces de unidad o rutas inexistentes.
- Selección estilo Explorador: clic reemplaza; Ctrl/Meta agrega o quita; Shift marca
  rango; Ctrl+Shift agrega rango; se limpia selección obsoleta al buscar, refrescar
  o navegar.
- Los folders creados desde plantilla pueden quedar enlazados por ruta comprobada
  aunque Chromium no entregue un `FileSystemDirectoryHandle`; se elimina el handle
  anterior para no mezclar contenido viejo con acciones nativas sobre la ruta nueva.
- El localizador por marker añade exploración acotada de rutas cercanas, ubicaciones
  del usuario y unidades FileSystem montadas. El marker aleatorio sigue siendo la
  prueba de identidad y coincidencias ambiguas se rechazan.
- Apertura simple y múltiple incorpora timeouts y errores explícitos. Un fallo parcial
  ya no reintenta los elementos exitosos ni abre duplicados.
- Se retiran de la UI botones de historial de revisiones de archivos que ya no formaban
  parte del flujo principal; los datos de historial no se eliminan.

### 5. Dashboard, ranking, fechas y notas

- La tabla General muestra Notes y Last Event con el mismo tratamiento visual de las
  tarjetas; Last Event se edita en sitio y Save Note to History vuelve a ser columna
  opcional independiente.
- Migraciones de preferencias muestran esas columnas una vez a usuarios con layouts
  guardados sin perder el orden configurado.
- Clics en inputs, textarea, select, botones, enlaces o texto seleccionado no abren el
  expediente. Tampoco comienza drag-and-drop mientras se edita un control.
- Fechas se muestran como `DD/MM/YYYY`, se siguen guardando como `YYYY-MM-DD`, se evita
  guardar el mismo valor otra vez y el calendario aparece alineado con el campo.
- Ranking considera `0`, negativos, texto y `NaN` como no rankeados; al borrar una
  oportunidad se compacta la secuencia restante.
- Se corrige el carácter de raya larga mal codificado y el padding del encabezado del
  editor de notas para que no choque con controles superpuestos.

### 6. SOW embebido

- Nuevo bloque inicial de cuatro pasos y encabezados visuales para Base Data,
  Objective, Description, Type, Systems, Safety, Extra Scope y Labels.
- Indicador orientativo de esfuerzo derivado de tipo/sistemas seleccionados; no altera
  la alarma ni el cálculo de Proposal Age.
- Ayuda técnica breve en español, activable y persistida dentro del estado UI del SOW.
- Panel Gaps agrupa campos obligatorios pendientes y permite saltar al campo exacto.
- Overview claro y editable, agrupado por sección, con contadores captured/pending,
  estado OK/TBD/PENDING y navegación al origen.
- Navegación reconstruida como mapa completo de secciones visibles y sus campos.
- Controles Expand all / Collapse all y toolbar más compacta.
- Flujo guiado reducido a Bid Strategy & Inputs, Installed Base y Cabinets & Panels;
  se eliminan preguntas duplicadas que ya viven en secciones dedicadas.
- Lógica de términos y condiciones conectada a la base T&Cs elegida en Bid Strategy.
- Títulos de secciones acortados y textos iniciales uniformados en inglés.

## Inventario de archivos versionables

### Aplicación y servicio

- `src/App.tsx`
- `src/components/Dashboard.tsx`
- `src/components/OpportunityDetail.tsx`
- `src/components/TableComponents.tsx`
- `src/features/opportunity-folder/OpportunityFolderTab.tsx`
- `src/features/opportunity-folder/fileOps.ts`
- `src/features/opportunity-folder/selectionUtils.ts` (nuevo)
- `src/services/sowTemplate.html`
- `server/index.ts`
- `server/os/shell.ts`
- `server/routes/os.ts`

### Instalación y actualización

- `CLOSE_OPPORTUNITYOS.bat`
- `DESINSTALAR_OPPORTUNITYOS.bat`
- `DESINSTALAR_OPPORTUNITYOS.hta`
- `INSTALAR_OPPORTUNITYOS.hta`
- `engine_opportunityos.bat`
- `scripts/check-for-update.ps1`
- `scripts/install-update-v2.ps1`
- `scripts/install-source-mode.ps1` (nuevo; solo para copias del repositorio)
- `scripts/publish-update.ps1`
- `scripts/verify-offline-runtime.ps1` (nuevo)
- `THIRD_PARTY_NOTICES.txt` (nuevo)

### Dependencias, comprobaciones y documentación

- `package.json`
- `package-lock.json`
- `scripts/verify-folder-persistence.ts`
- `scripts/verify-system-section.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/MANUAL_USUARIO.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/CHANGESET_ACTUALIZACION_2026-09-27.md` (nuevo)

## Archivos deliberadamente excluidos

- `.tmp-update-integration-20260925/`: fixture/artefacto temporal con instalaciones
  simuladas y ZIPs de prueba; no es código fuente ni parte de una publicación.
- `AGENTS.md` y demás archivos de IA: son locales y están ignorados por diseño.
- Bases `.json`, exportaciones y `%APPDATA%\OpportunityOS`: datos del usuario, nunca
  se versionan ni se suben.
- `dist`, `node_modules`, `runtime`, `offline-runtime.json` y `release-manifest.json`:
  son artefactos generados por el flujo de publicación, no por este commit fuente.

## Compatibilidad y migración

- No cambia el esquema persistido de oportunidades ni requiere migración de base.
- No cambia la versión declarada (`1.0.5`) porque este commit no publica un release.
- Las preferencias de columnas se migran mediante claves nuevas de `localStorage`.
- Un paquete publicado con este código cambia el contrato de instalación: debe contener
  runtime, build, dependencias y manifiestos offline completos.

## Matriz de verificación

Resultados obtenidos antes del commit y push:

| Comprobación | Cobertura | Resultado |
| --- | --- | --- |
| `npx tsc --noEmit` | Tipos frontend | PASS |
| `npm run build` | Build de producción + SOW empaquetado | PASS; solo warning conocido de chunks mayores a 500 kB |
| `npm run check:server` | Tipos del servicio local | PASS |
| `npm run check:folder` | Persistencia, rutas y selección | PASS, 43/43 |
| `npm run check:system-section` | Copy, marker scan y seguridad de Papelera | PASS |
| Parseo de todos los `.ps1` modificados/nuevos | Sintaxis PowerShell sin ejecutar instaladores | PASS, 4/4 |
| Validación de scripts del SOW | JavaScript embebido | PASS, 1/1 script inline |
| `npm audit --json` | Dependencias completas | PASS, 0 vulnerabilidades en 623 dependencias |
| `git diff --check` | Espacios y conflictos de parche | PASS; solo avisos informativos LF→CRLF de Git |

También se ejecutó `git fetch origin Actualizacion main` antes del commit. La
rama remota `Actualizacion` seguía exactamente en la base revisada `81ecb3e` y
`main` permanecía sin cambios en `8423b32`.

## Corrección posterior: reinstalación desde archivos fuente

Después del primer commit del changeset se restauró el flujo usado para copiar
una versión nueva encima de una carpeta existente y ejecutar nuevamente el
instalador o el engine:

- `INSTALAR_OPPORTUNITYOS.hta` detecta automáticamente el tipo de carpeta.
- Con `offline-runtime.json`, conserva la verificación estricta del paquete
  publicado y nunca instala ni compila en la PC destino.
- Sin ese manifiesto, reconoce una copia del repositorio, valida Node.js/npm,
  repara dependencias, genera `dist` y vuelve a crear los accesos directos.
- `engine_opportunityos.bat` ofrece la misma recuperación cuando HTA/VBS está
  bloqueado o se ejecuta el motor directamente.
- El marcador `.opportunityos-setup-complete` se sobrescribe con el modo realmente
  validado, por lo que un marcador oculto de una instalación anterior no impide
  reparar la carpeta.
- `scripts/install-source-mode.ps1` encapsula el modo fuente sin borrar datos ni
  requerir elevación.
- `scripts/publish-update.ps1` excluye expresamente ese helper de los ZIP oficiales;
  por ello un paquete publicado incompleto no puede caer al modo fuente.

Verificación de esta corrección:

| Comprobación | Resultado |
| --- | --- |
| Parseo del JavaScript inline de `INSTALAR_OPPORTUNITYOS.hta` | PASS |
| Parseo de `install-source-mode.ps1` y `publish-update.ps1` | PASS, 2/2 |
| Aserciones de enrutamiento dual y exclusión del helper | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; solo warning conocido de chunks grandes |
| `git diff --check` | PASS; solo avisos informativos LF→CRLF |

Por la regla de seguridad de instaladores, no se ejecutaron automáticamente los
puntos de entrada ni el publicador. La prueba manual vigente es copiar los
archivos versionados a una carpeta de prueba sin `node_modules`/`dist` y ejecutar
`engine_opportunityos.bat` con Node.js/npm disponibles.

## Riesgos residuales y prueba manual recomendada

- La integración real con la Papelera depende de Windows COM y debe probarse con un
  archivo desechable desde la app antes de publicar a usuarios.
- El escaneo de unidades montadas tiene presupuesto de tiempo; carpetas remotas muy
  lentas pueden devolver “no encontrado” sin seleccionar una ruta incorrecta.
- SOW, Dashboard, selector de carpetas e instalador requieren revisión visual/funcional
  en la aplicación antes de etiquetar una versión pública.
- El publicador no se ejecuta durante esta validación por regla de seguridad; solo se
  revisa y parsea su código.
