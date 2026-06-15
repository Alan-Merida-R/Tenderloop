# Handoff: Testing requerido — 14 tareas en needs_testing

> Generado: 2026-06-15 | Orquestador: Claude Sonnet 4.6

## Estado del sistema

Se han implementado **19 cambios** en total (14 en needs_testing + 5 marcadas done). Las **39 tareas pending** restantes están bloqueadas porque tocan archivos que tienen cambios sin testear. Para continuar necesito que el usuario pase estas tareas.

---

## Archivos con cambios pendientes de testing

| Archivo | Tareas con cambios |
|---|---|
| `components/OpportunityDetail.tsx` | TASK-023, TASK-037, TASK-042, TASK-043, TASK-044, TASK-034 |
| `components/Dashboard.tsx` | TASK-018 |
| `App.tsx` | TASK-057, TASK-003 |
| `contexts/TimerContext.tsx` | TASK-003 |
| `components/TimerWidget.tsx` | TASK-004 |
| `features/opportunity-folder/OpportunityFolderTab.tsx` | TASK-045 |
| `index.css` | TASK-035 |
| `types.ts` | TASK-032 |
| `vite.config.ts`, `public/manifest.json`, `public/icon.svg`, `index.html` | TASK-058 |

---

## Las 14 tareas a testear

### TIMER (testear módulo flotante)

#### TASK-003 — Lógica del descanso en módulo flotante
- **Cambio**: `TimerProvider primary={false}` en ventana flotante. Auto-phase watcher deshabilitado.
- **Cómo testear**: Abrir el módulo flotante del timer. Iniciar sesión de trabajo → esperar que complete → verificar que pasa a DESCANSO correctamente (no vuelve a trabajo).

#### TASK-004 — Color del descanso
- **Cambio**: rose-900 → red-900 en widget flotante y timer completo.
- **Cómo testear**: Iniciar descanso en el módulo flotante. Verificar que el fondo es rojo distinguible.

---

### DASHBOARD / VISTA GENERAL

#### TASK-018 — Filtros alineados a la izquierda
- **Cambio**: Removido `justify-between` de la barra de filtros en Dashboard.tsx.
- **Cómo testear**: Ir a Vista General. Los filtros y buscador deben estar alineados a la izquierda, no repartidos a ambos extremos.

---

### BD / APP STARTUP

#### TASK-057 — BD no recuerda selección
- **Cambio**: Overlay de startup con botón prominente "Reabrir: [nombre]" cuando hay BD pendiente.
- **Cómo testear**: Con una BD ya cargada, cerrar y reabrir la app. Verificar que aparece el overlay con el botón para reabrir la BD fácilmente.

---

### NOTAS

#### TASK-034 — Freeze al escribir en notas
- **Cambio**: Removido `setActiveNoteHtml()` del ciclo de escritura (solo actualiza ref).
- **Cómo testear**: Abrir un expediente → ir a Notas → escribir un párrafo largo rápido. No debe haber lag ni freeze.

#### TASK-035 — Bullets encimados
- **Cambio**: CSS `.editor-content ul/ol/li` agregado en index.css.
- **Cómo testear**: En el editor de notas, crear una lista con bullets (`*` o botón de lista). Los bullets deben aparecer correctamente con indentación y sin superponerse al texto.

#### TASK-037 — Nota no se guarda (CRÍTICO)
- **Cambio**: Debounce 500ms → 150ms, cleanup incondicional al desmontar.
- **Cómo testear**: Escribir en una nota. Cambiar inmediatamente de nota (antes de 500ms). Volver a la nota anterior → el contenido debe estar guardado.

---

### TAREAS

#### TASK-023 — Tarea sin fecha no registra fecha al Done
- **Cambio**: Al marcar Done tarea sin dueDate, se asigna today automáticamente.
- **Cómo testear**: Crear tarea sin fecha. Marcarla como Done. Verificar que aparece la fecha de hoy en dueDate.

#### TASK-032 — Status 'Aprobación' en Tareas
- **Cambio**: `'Approval'` agregado a `TaskStatus` y `TASK_STATUS_COLORS` (purple).
- **Cómo testear**: Abrir detalles de cualquier tarea. En el dropdown de status debe aparecer "Approval" con color púrpura.

---

### KPIS / VERSIONES

#### TASK-042 — Auto fecha Delivered al pasar a Submitted
- **Cambio**: Al cambiar statusLabel a 'Submitted', `kpis.timeline.deliveredAt = today`. Al revertir → null.
- **Cómo testear**: Cambiar el status de una oportunidad a "Submitted". Ir a KPIs → la fecha "Delivered/Tendered At" debe haberse llenado con hoy. Cambiar a otro status → la fecha se borra.

#### TASK-043 — Proposal Amount / CQA Target Sell sincronizados
- **Cambio**: CQA Target Sell usa `updateOfficialSellPrice()` que sincroniza ambos campos.
- **Cómo testear**: En los KPIs, cambiar el valor de "CQA Target Sell" → el campo "Proposal Amount (USD)" debe actualizarse también al mismo valor.

#### TASK-044 — Auto Sold status
- **Cambio**: Al pasar stage a '9. Won/Lost', statusLabel se auto-asigna a 'Won' si no está ya en terminal.
- **Cómo testear**: Cambiar el Stage de una oportunidad a "9. Won/Lost". Verificar que el Process Status cambia automáticamente a "Won" (si no era Won/Lost/Canceled antes).

#### TASK-045 — Folder no se guarda en revisión 0 (CRÍTICO)
- **Cambio**: (1) `handleChangeRoot` llama `onUpdate({folderLinked:true})`. (2) Init useEffect usa `queryPermission` en lugar de `requestPermission`. (3) Botón "Grant Folder Access" si el permiso no está concedido.
- **Cómo testear**: 
  1. Crear nueva oportunidad (revisión 0).
  2. Ir a Carpeta → vincular una carpeta.
  3. Recargar la app.
  4. La carpeta debe seguir vinculada (o mostrar botón "Grant Folder Access" si el permiso expiró, y al hacer clic debe restaurarse).

---

### PWA

#### TASK-057 — App como PWA en todos los navegadores
- **Cambio**: manifest.json con iconos SVG válidos. vite.config.ts con navigateFallback.
- **Cómo testear**: Abrir la app en Chrome. En la barra de dirección debe aparecer el botón de "Instalar app". Instalar y verificar que funciona como PWA standalone.

---

## Cuando termines el testing

Para cada tarea que aprueba: marca en `.ai/state/tasks.json` su `status` como `"done"` y elimina su entrada de `locks.json`.

Una vez liberados los locks, las siguientes tareas se podrán implementar inmediatamente:
- **TASK-009** (OP truncada en tarjetas) → Dashboard.tsx
- **TASK-017** (Waiting On con Approval) → Dashboard.tsx línea 2256
- **TASK-001, TASK-002, TASK-005** (Timer fixes) → TimerWidget.tsx
- ...y 35 tareas más en OpportunityDetail.tsx

