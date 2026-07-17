# 🗺️ INDEX Navegación Rápida - TenderLoop & TenderFlow

Este documento es el **Mapa Maestro de Ingeniería** del repositorio. Está diseñado para facilitar el trabajo futuro, permitiéndote navegar rápidamente a los archivos, estados y componentes exactos según el cambio que necesites hacer, minimizando las búsquedas.

---

## 1. 🏢 Vista General del Repo

El proyecto no es una sola aplicación, sino **dos aplicaciones distintas** conviviendo en el mismo repositorio, compartiendo algunos tipos pero con flujos de arranque totalmente separados.

*   **TenderLoop (Main App)**: Gestor de oportunidades, expedientes, notas y KPIs.
    *   **Punto de entrada:** `index.html` → `src/index.tsx` → `App.tsx`
*   **TenderFlow (Standalone):** Matriz ejecutiva de decisiones y flujos.
    *   **Punto de entrada:** `index_flow.html` → `index_flow.tsx` → `tender-flow/src/components/FlowDashboard.tsx`

**Rutas Principales:**
*   `/` (Raíz) y `/components`: Contienen todo el código pesado de TenderLoop (`App.tsx`, `Dashboard.tsx`, `OpportunityDetail.tsx`).
*   `/tender-flow/src`: Contiene la aplicación aislada TenderFlow.
*   `/src/features` y `/services`: Utilidades de persistencia, links, exportación y worker.
*   `/contexts`: Guarda el `TimerContext.tsx` (único context real).

---

## 2. 🧩 Mapa por Funcionalidades

### 📁 Expediente / Opportunity Detail
*   **Qué es:** La pantalla de detalle ("Full View" Notion-like) de un proyecto.
*   **Dónde vive:** `components/OpportunityDetail.tsx` (¡Es un archivo masivo de +400KB!)
*   **Subcomponentes internos vitales:** El archivo maneja las pestañas (Tabs) de Notes, Tasks, Commercial, Versions, KPIs y Overview internamente.
*   **Cuidado:** Modificar el estado local en este archivo puede causar re-renders grandes. Usa `memo` conscientemente.

### 📝 Notes (Notas y Rich Text)
*   **Qué hace:** Pestaña de Notas ricas usando `document.execCommand`.
*   **Render principal:** `RichTextEditor` wrapper contenido en `components/OpportunityDetail.tsx`.
*   **Side Effects:** Está fuertemente debounced (`NoteEditorWrapper`) para evitar que cada tecla bloquee la UI en expedientes grandes.

### ✅ Tasks (Métricas y Kanban)
*   **Dashboard View:** `TaskRow` y `TaskCard` en `components/Dashboard.tsx`.
*   **Detail View:** Pestaña de Tasks en `OpportunityDetail.tsx`.
*   **Time Tracking:** Usa `contexts/TimerContext.tsx`.
*   **Utilidades:** `services/taskUtils.ts` (ordena y clasifica).

### ⏳ Versions / Snapshots
*   **Qué hace:** Guarda un historial en tiempo real y versiones estáticas del expediente.
*   **Dónde vive:** Modal de `HistoryEventsModal` (dentro de `OpportunityDetail.tsx`).
*   **Lógica:** Almacenadas en el array `history` dentro del objeto `Opportunity`.

### 🔄 Funcionalidad: Loop (Main) vs Flow
*   **LOOP:** Gestor general en `App.tsx`. Maneja la base de datos completa.
*   **FLOW:** En `tender-flow/src/components/FlowDashboard.tsx`. Analiza lógica estricta (`evaluator.ts`) usando una DB separada propia (JSON workspace).
*   **IMPORTANTE (2026-04-14):** La sincronización bidireccional Loop ↔ Flow fue **eliminada por completo**. Flow ahora es 100% standalone. Las acciones se manejan solo dentro del workspace de Flow. Se removió: `syncWithLoop`, `handleAutoLoadLoopDb`, `handleUpdateLoopTask`, `loopDb/loopDbName` state, `loopTaskMap`, prop drilling `loopDb/dbName/onLoopDbChange` a QuestionDetailPanel, `TaskMappingModal`, imports `parseLoopDatabase/parseLoopJsonDatabase`, campo `isSynced` rendering en acciones, bloque "SYNCED WITH LOOP" y "BREAK SYNC & MODIFY MANUALLY", botón Refresh del sidebar, y el `focus` listener que recargaba Loop DB. Los tipos `ItemResponse.isSynced` y `StandardItem.linkedTaskId` permanecen como campos muertos no usados. El localStorage cache (`te_loop_db_cache`, `te_loop_db_name`) se limpia al arranque del workspace.

### 💾 Persistencia / Guardado Local y Autosave
*   **Dónde ocurre:** En `App.tsx` exclusivamente.
*   **Cómo:** A través de un `setInterval` debounced (Tiered Autosave cada ~10s). Usa la File System Access API para guardar a disco a través de `services/fileSystem.ts`.
*   **Comunicación entre pestañas:** Usa `BroadcastChannel('tenderloop_db_sync')` directo en `App.tsx` para sincronizarse si tienes abierto el proyecto en dos pestañas del navegador.

---

## 3. 🎯 Rutas de Navegación para Cambios Comunes

> **"Si me piden X cambio, ¿por dónde empiezo?"**

### 🟢 "Agrega un botón en el expediente (Opportunity Detail)"
*   **Ve a:** `components/OpportunityDetail.tsx`.
*   **Busca:** El render de la toolbar principal superior o busca `activeTab === 'notes'` (etc) para ubicar la botonera de la pestaña específica.
*   **No toques:** El estado `db` de `App.tsx` si solo es un cambio visual. Usa la prop `onUpdate`. 

### 📝 "Cambia algo en el tab de Notes"
*   **Ve a:** `NoteEditorWrapper` o `RichTextEditor` (dentro de `components/OpportunityDetail.tsx`).
*   **Atención:** Cuidado con el `useEffect` que tiene `execCommand`. El debounce protege el rendimiento (`handleInnerChange`).

### ✅ "Modifica cómo funcionan y se renderizan las Tasks"
*   **Ve a:** `components/Dashboard.tsx` si el cambio es en la vista global Kanban/Tabla.
*   **Ve a:** `components/OpportunityDetail.tsx` (busca en el archivo `tab === 'tasks'`) si es en un expediente concreto.
*   **Helper:** Si afecta a cálculo, modifica `services/taskUtils.ts`.
*   **Cuidado con:** El hook `useTimer` inyectado en cada `TaskRow`.

### 💾 "Arregla un bug en el Autosave o Sincronización"
*   **Ve a:** `App.tsx`.
*   **Busca:** El hook `useEffect` que instancia `saveTimeoutRef` y analiza `fileHandle`.
*   **Cuidado:** Modificar la velocidad del autosave puede congelar la pestaña en computadoras de baja RAM.

### 📊 "Cambia algo en Flow o matriz ejecutiva"
*   **Ve a:** `tender-flow/src/components/FlowDashboard.tsx`
*   **No busques en:** `App.tsx` ni `Dashboard.tsx`. Flow es una Single Page App paralela e independiente.
*   **Cálculos Pesados:** `tender-flow/src/engine/evaluator.ts` (aquí se definen las visibilidades de ramas completas dependiendo de decisiones previas).

### 🛠 "Exporta información (Excel/Word/PDF)"
*   **Ve a:** `services/opportunityExportImport.ts` o `services/exporter.ts` (para Flow).
*   **Rendimiento:** Las librerías de PDF (`jsPDF`) se cargan "Lazy" porque pesan casi 400KB solas. No rompas el import asíncrono `loadPdfLibs()`.

---

## 4. 🗄️ Archivos Clave del Proyecto

| Archivo / Ruta                               | Qué Hace                                        | Riesgo de Modificación |
| -------------------------------------------- | ----------------------------------------------- | ---------------------- |
| **`App.tsx`**                                | Global state, file loading, tab synchronizer    | **ALTO**               |
| **`components/OpportunityDetail.tsx`**       | Core de la UI de Expediente, Notes y KPIs       | **ALTO (Muy grande)**  |
| **`components/Dashboard.tsx`**               | Vistas globales (Kanban, Listas, Tasks)         | **ALTO**               |
| **`index_flow.tsx`**                         | Punto de inicio de TenderFlow                   | Bajo                   |
| **`tender-flow/src/components/FlowDashboard.tsx`** | El equivalente a la app entera para "Flow"      | **Medio**              |
| **`contexts/TimerContext.tsx`**              | Rastreo de tiempo activo en tareas              | Medio                  |
| **`types.ts`**                               | Contratos T-Script. Si tocas esto, impactas todo| **ALTO**               |

---

## 5. 🌊 Flujo Real de Datos

1.  **Carga Inicial:** `App.tsx` llama a `openDatabaseFile()` o lee de `getRecentDbs()`.
2.  **Mounting Data:** Un objeto JSON masivo llamado `db` se almacena en el state `[db, setDb]` de `App.tsx`.
3.  **Distribución:** `db` se pasa mediante "Prop Drilling" (pasando props manualmente) hacia `Dashboard`, `OpportunityDetail`, etc. No hay Redux ni Zustand global.
4.  **Mutaciones:** Cuando un componente profundo cambia un dato (ej. en Notes), invoca la función `onUpdate: (updated: Opportunity) => void` la cual viaja hasta `App.tsx`.
5.  **Re-render y Guardado:** `App.tsx` actualiza el gran objecto `db`. Esto dispara un ciclo de re-render *y* levanta una bandera de "hay cambios".
6.  **Autosave:** Después de ~10 segundos de inactividad de tipeo, `App.tsx` vacía todo localmente al File System (`fileHandle`).

---

## 6. ⚠️ Riesgos y Zonas Delicadas

*   **⚠️ Monolito `OpportunityDetail.tsx`:** Mide más de 5000 líneas. Tiene demasiados efectos colaterales y subclases (`NoteEditorWrapper`, modales in-line). Usa la búsqueda ctrl+F inteligentemente, no trates de leerlo de arriba hacia abajo.
*   **⚠️ Prop Drilling de Estado:** Como la data viaja desde `App.tsx` a casi toda la aplicación, agregar nuevas colecciones de datos globales puede causar dolor de cabeza pasando la prop por 5 niveles de profundidad.
*   **⚠️ File System Access API:** La aplicación lee un archivo local de tu PC real. Si rompes las funciones de carga en `App.tsx` -> `fileSystem.ts`, la pantalla se quedará en estado de error irremediable.
*   **⚠️ Re-Renders Globales:** Cada tecla pulsada en un campo sin control (`DebouncedInput` evita esto) re-renderiza `App.tsx` entero. **Jamás elimines los debounces o memos existentes** (`useCallback`, `React.memo` aplicados en Dashboard).

---

## 7. 📘 Convenciones del Proyecto

*   **Archivos Base:** Los archivos están casi todos alojados en `/` o `/components`. TenderFlow usa `/tender-flow/`.
*   **Estado:** Usa `useState` nativo de React, prop drilling y `React.memo` agresivo.
*   **Manejo de Rendimiento (Debounce):** Todo campo de texto enorme o escritura al DOM/Storage que puede provocar jank está envuelto en un timer (`setTimeout` a 300ms/1000ms/10000ms).
*   **Icons:** Usa `lucide-react` masivamente.
*   **Styling:** Usa Tailwind CSS nativo (por ejemplo: `bg-green-500`, `px-4`, etc.). Ojo en TenderFlow que a veces se recae en "variables css" online.

---

## 8. ⚡ Atajos de Búsqueda y Navegación (Quick Find)

Si necesitas hacer una tarea específica, busca literalmente esto:

*   **"Botones principales del expediente"** → Busca `<span className="truncate">Tasks</span>` en `OpportunityDetail.tsx` para ubicar el panel de pestañas, luego viaja hacia abajo al `if (activeTab === ...)` .
*   **"Error en Guardado / Persistent"** → Busca `window.setTimeout(async () => {` dentro del `useEffect` de `App.tsx`.
*   **"Lógica de Flow Rendering"** → Abre `tender-flow/src/components/FlowDashboard.tsx` y revisa `MemoizedBackboneItem`.
*   **"Modal de Exportar"** → Ve y edita `OpportunityExportImportButtons.tsx` dentro de `/features/opportunity-export/`.
*   **"Añadir columnas al archivo de excel"** → Revisa `services/opportunityExportImport.ts`.
*   **"Añadir color a un label (Prioridad o Stage)"** → Ve directo a `types.ts` y modifica `PRIORITY_COLORS` o `STAGE_COLORS`.

---

## 9. ⚡ AUDIT DE PERFORMANCE — TenderFlow (Abril 2026)

> Resultado de auditoría profunda. Usa esta sección antes de leer cualquier archivo de Flow para ir directo al punto de dolor.

### 9.1 Mapa de Archivos — TenderFlow (`tender-flow/src/`)

| Archivo                                      | Líneas | Qué Hace                                                  |
| -------------------------------------------- | ------ | --------------------------------------------------------- |
| `components/FlowDashboard.tsx`               | ~1 330 | Orquestador principal: estado, filtros, render de items   |
| `components/QuestionDetailPanel.tsx`         | ~785   | Panel derecho de edición de pregunta y respuesta          |
| `components/DecisionMap.tsx`                 | ~752   | Mapa visual ReactFlow del árbol de decisiones             |
| `components/StructureEditor.tsx`             | ~564   | Modal para editar la estructura del estándar              |
| `components/ChecklistWizard.tsx`             | ~264   | Wizard de onboarding para nuevos proyectos                |
| `components/ExecutiveDecisionMap.tsx`        | ~178   | Árbol estratégico agrupado por etapas                     |
| `components/TaskMappingModal.tsx`            | ~213   | Modal para vincular acciones con tareas de Loop           |
| `engine/evaluator.ts`                        | ~469   | Evaluación de dependencias y visibilidad de ítems         |
| `engine/mockStandard.ts`                     | ~205   | Mock data de preguntas estándar                           |
| `services/storage.ts`                        | ~353   | File System API + IndexedDB para guardar workspace        |
| `services/excelParser.ts`                    | ~229   | Importación desde Excel/JSON                              |
| `services/exporter.ts`                       | ~205   | Exportación a Excel y Word                                |
| `types/index.ts`                             | ~168   | Interfaces TypeScript (sin problemas de runtime)          |

---

### 9.2 Top 10 Optimizaciones por Impacto

#### TIER 1 — Críticas (bloquean la UI de inmediato)

**#1 — `QuestionDetailPanel.tsx` no tiene React.memo**
- Cada tecla en el padre re-renderiza todo el panel aunque el ítem seleccionado no cambie.
- Línea afectada: `1` (export de componente)
- Fix: `export const QuestionDetailPanel = React.memo(...)` + extraer `renderInput` como sub-componente memo.

**#2 — `FlowDashboard.tsx` L42-100: 150+ instancias de debounce activas**
- `MemoizedBackboneItem` crea `localValue`, `localNote`, `localLabel` + 3 `useRef` de timeout por cada ítem visible. Con 50 ítems = 150 timers simultáneos.
- Fix: un único `useCallback(debounce(...), [])` en el padre pasado como prop estable.

**#3 — ~~Sync con Loop O(N×M)~~ → RESUELTO (2026-04-14): sync eliminado por completo**
- Se eliminó toda la sincronización Loop ↔ Flow. Flow ahora es 100% standalone.
- Motivo: la sync rompía las tareas y ralentizaba la app. El usuario pidió removerla completamente en vez de optimizarla.

**#4 — `services/storage.ts` L266: JSON.stringify bloquea el hilo principal**
- `JSON.stringify(workspace, null, 2)` sobre workspaces grandes (100+ ítems, 50 casos) puede tardar 100-500 ms y congelar la UI.
- Fix: mover a Web Worker. Hasta entonces, al menos quitar el `null, 2` (pretty-print) en producción.

**#5 — `StructureEditor.tsx` L148-432: lista de 200+ preguntas sin virtualizar**
- Renderiza todos los ítems expandibles del estándar al mismo tiempo. Con 200 preguntas cada una con su form JSX, el DOM crece >2 000 nodos.
- Fix: `react-window` o `@tanstack/virtual` en la lista de preguntas.

#### TIER 2 — Alto impacto (implementar siguiente sprint)

**#6 — `evaluator.ts` L235-305: `getVisibleItems` parsea lógica por ítem sin caché**
- Cada llamada re-parsea `logicString` con regex+split para todos los ítems. Con 200 ítems y evaluación frecuente = 200 parseos por ciclo.
- Fix: pre-compilar cada `logicString` a función en un `useMemo` del componente padre.

**#7 — `DecisionMap.tsx` L418-441: todos los nodos reconstruidos aunque solo 1 cambie**
- `.map()` sobre todos los ítems recrea 200+ objetos de nodo por cada cambio estructural.
- Fix: mantener Map de nodos por ID y actualizar solo los nodos modificados.

**#8 — `FlowDashboard.tsx` L369-440: `visibleItems` aplica 6 filtros en cadena sin índices**
- Cada filtro (search, areas, stages, deliverables, hideCommon, hideAnswered, hideLocked) itera el array completo por separado.
- Fix: pasar a una sola pasada con todas las condiciones en un `filter` compuesto.

**#9 — `QuestionDetailPanel.tsx` L455-512: búsqueda de deliverables sin debounce**
- `availableDeliverables.filter()` se ejecuta con cada carácter tecleado en el campo `delivSearch` sin ningún debounce.
- Fix: debounce de 200 ms en el input o `useDeferredValue`.

**#10 — `services/storage.ts` L527-530: localStorage escribe sincrónicamente en cada guardado**
- `localStorage.setItem()` con el workspace completo serializado bloquea el hilo. Sin guard de cuota.
- Fix: envolver en `try/catch`, debounce de 500 ms, y considerar IndexedDB para datos grandes.

---

### 9.3 Quick-Find de Performance en TenderFlow

Si el agente recibe un reporte de lag, busca aquí primero:

| Síntoma                                       | Archivo                          | Línea(s) de inicio | Causa probable                          |
| --------------------------------------------- | -------------------------------- | ------------------- | --------------------------------------- |
| Lag al escribir respuestas                    | `FlowDashboard.tsx`              | 42, 59-76           | Debounces inestables en cada BackboneItem |
| Panel derecho se re-renderiza todo            | `QuestionDetailPanel.tsx`        | 1, 138              | Sin React.memo, renderInput no memoizado |
| Congelamiento al guardar workspace            | `services/storage.ts`            | 256-273             | JSON.stringify en hilo principal         |
| ~~Sync con Loop lento~~                       | —                                | —                   | **RESUELTO**: sync Loop ↔ Flow eliminada 2026-04-14 |
| Mapa visual lento al editar                   | `DecisionMap.tsx`                | 418-465             | Reconstrucción completa de nodos         |
| Editor de estructura tarda en abrir           | `StructureEditor.tsx`            | 148-432             | Lista sin virtualizar, 200+ nodos DOM    |
| Visibilidad de ítems lenta                    | `engine/evaluator.ts`            | 235-305             | logicString re-parseada sin caché        |
| Cálculo de semáforos lento (áreas/etapas)     | `engine/evaluator.ts`            | 315-354             | O(N×M) sin índice previo por área        |
| Búsqueda de entregables lenta                 | `QuestionDetailPanel.tsx`        | 455-512             | Filter sin debounce por cada tecla       |

---

### 9.5 Optimizaciones Pendientes (NO implementadas aún)

| # | Archivo | Línea | Descripción |
|---|---------|-------|-------------|
| 1 | `StructureEditor.tsx` | L148-432 | Lista de 200+ preguntas sin virtualización — usar `@tanstack/virtual` |
| 2 | `evaluator.ts` | L235-305 | logicString re-parseada por ítem sin caché — compilar a función en useMemo del padre |
| 3 | `DecisionMap.tsx` | L418-441 | Todos los nodos reconstruidos aunque solo 1 cambie — Map de nodos por ID |
| 4 | `services/storage.ts` | L266 | JSON.stringify bloquea hilo principal — mover a Web Worker |
| 5 | `ExecutiveDecisionMap.tsx` | L104 | `areas.find()` por ítem — pre-construir Map de áreas |

---

### 9.4 Patrones de Optimización Ya Implementados (NO deshacer)

- `handleDetailUpdate` en `FlowDashboard.tsx`: `useCallback(fn, [])` con refs de render-body. Es intencional y correcto.
- `MemoizedBackboneItem`: envuelto en `React.memo`. Mantener.
- `DecisionMap.tsx` Effect A/B: separación de reconstrucción estructural vs actualizaciones de respuesta con debounce 120 ms. Mantener.
- `evaluateNumberedLogic`: normalización de expresión con `.replace(/(\d+)/g, ' $1 ')` antes de usar `\b`. Mantener.
- Evaluación estricta (sin optimistic fallback) en `getVisibleItems` cuando hay `logicString`. Mantener.
- `QuestionDetailPanel` exportado como `React.memo(QuestionDetailPanel_)` — el nombre interno es `QuestionDetailPanel_`. NO quitar el memo.
- Local state + debounce (250ms) en `QuestionDetailPanel` para `localTextValue`, `localNoteValue`, `localLinkLabel`, `localLinkUrl`. Refs always-latest: `localLinkLabelRef`, `localLinkUrlRef`. NO eliminar.
- `allItemsMap = useMemo(() => new Map(...), [allItems])` en `QuestionDetailPanel` para O(1) lookup en reglas de dependencia. NO cambiar a `allItems.find()`.

---

## 10. 🧠 Performance Audit — TenderLoop (Main App, 2026-04-14)

Mapeo exhaustivo de cuellos de botella en la app Loop (~17 700 líneas).
Orden: impacto real sobre la experiencia del usuario. Cuando alguien reporte lag, **empieza aquí**.

### 10.1 Mapa de archivos pesados

| Archivo                                         | Líneas | Rol                                              | Riesgo perf |
|-------------------------------------------------|--------|--------------------------------------------------|-------------|
| `components/OpportunityDetail.tsx`              | 5 878  | Full-view del expediente (Notes/Tasks/KPIs/etc)  | **CRÍTICO** |
| `components/Dashboard.tsx`                      | 3 304  | Home: KPIs, listas, kanban, tarjetas             | **CRÍTICO** |
| `App.tsx`                                       | 1 507  | Global state, autosave, BroadcastChannel         | **ALTO**    |
| `features/tracking/TrackingView.tsx`            | 1 331  | Agregador global de tareas/notas/historia        | **ALTO**    |
| `features/opportunity-folder/OpportunityFolderTab.tsx` | 858 | Explorador de archivos del expediente            | MEDIO       |
| `components/SettingsModal.tsx`                  | 614    | Ajustes + links a opps                           | MEDIO       |
| `components/CalendarView.tsx`                   | 248    | Calendario mensual                               | MEDIO       |
| `contexts/TimerContext.tsx`                     | 232    | Cronómetro global con BroadcastChannel           | MEDIO       |
| `services/opportunityExportImport.ts`           | 168    | Export/Import con IndexedDB                      | MEDIO       |

### 10.2 Top 20 optimizaciones (ordenadas por impacto)

#### TIER 1 — CRÍTICOS (≈70 % del lag)

**#1 — `App.tsx` L247-262: BroadcastChannel clona DB entera cada 2 s**
```tsx
syncChannel.current.postMessage({ type: 'OPP_UPDATE', oppId, oppData: currentOpp });
```
`postMessage` hace `structuredClone` internamente. DBs de 10-50 MB = 200-500 ms de bloqueo cada 2 s.
**Fix:** enviar delta `{ id, lastUpdated, dirtyFields }`. La otra pestaña relee del archivo.

**#2 — `OpportunityDetail.tsx` L1703, 3300, 3320: `JSON.stringify` como comparador**
```tsx
if (JSON.stringify(currentOpp.kpis) !== JSON.stringify(baseKpis)) { ... }
```
Serializa objetos grandes en cada render. 20-50 serializaciones/s con teclado rápido.
**Fix:** shallow-equal por campo o mantener un hash/version counter que solo cambia al guardar.

**#3 — `TrackingView.tsx` L134-231: agregación O(N³) sin índices**
`workItems` combina opps × tasks × history × notes × KPIs en un solo useMemo. 20 opps × 30 tasks × 50 history = 30 000 iteraciones por cambio de filtro.
**Fix:** dividir en sub-memos por eje, pre-indexar por fecha/status, invalidar selectivamente.

**#4 — `Dashboard.tsx` L1146-1157: KPIs 5×filter+reduce por periodo**
Dentro del `.map(sortedKeys)` ejecuta 5 filtros y 5 reduces por cada periodo. 12 meses = 120 operaciones O(N) por render.
**Fix:** un solo `reduce` que acumule todos los KPIs en un objeto agregado.

**#5 — `Dashboard.tsx` L1418, 1428, 1439: 3 `.sort()` dentro de `forEach`**
Re-ordenamiento triple por grupo en cada render. 10 grupos × 50 opps = 1 500 comparaciones innecesarias.
**Fix:** `useMemo` con keys estables, mover sort afuera del forEach.

**#6 — `OpportunityFolderTab.tsx` L461: tabla sin virtualizar**
100+ archivos renderizan el DOM completo. Scroll lento + memoria alta.
**Fix:** `react-window` o `@tanstack/virtual`.

#### TIER 2 — ALTO IMPACTO

**#7 — `OpportunityDetail.tsx` L1999-3033: cálculos encadenados repetidos**
`executionUniqueDays`, `waitingOnOthersDays`, `suggestedEffortScore` recorren el mismo array 3 veces por keystroke.
**Fix:** un solo `useMemo` iterando una vez y devolviendo las 3 métricas.

**#8 — Callbacks inline en listas** (Dashboard L378, 489, 2502, 2592; OppDetail L321-330, 482, 788)
`onClick={() => handler(x)}` dentro de `.map()` invalida `React.memo` en cada render.
**Fix:** `useCallback` estable + `data-id` en el botón para recuperar x en el handler.

**#9 — `Dashboard.tsx` L2275, 2329, 2460, 2494: `.slice(0, N)` tras filter+sort sobre array completo**
Filtra/ordena 2 000 para mostrar 30.
**Fix:** cortar antes (partial sort) o `.find()` si solo necesitas el primero.

**#10 — `services/opportunityExportImport.ts` L27-41: IndexedDB cursor sin índice**
Escanea todo el store para filtrar por `oppId||*`. Miles de docs = export de 2-5 s.
**Fix:** índice compuesto `by_opp` → `store.index('by_opp').getAll(oppId)`.

**#11 — `App.tsx` L984-1001: `rebalancePriorities` O(N²)**
`group.find()` + `group.filter()` por status. 1 000 opps = drag & drop lento.
**Fix:** `Map(group.map(o => [o.id, o]))` para lookup O(1).

**#12 — `TimerContext.tsx` L82, 88-95: `localStorage.setItem` por tick + onmessage sin throttle**
Timer puede escribir localStorage 60 Hz y re-renderiza todo el árbol consumidor.
**Fix:** debounce 1 s al setItem + throttle 500 ms al `onmessage` del BroadcastChannel.

#### TIER 3 — MEDIO / PULIDO

**#13 — `CalendarView.tsx` L67, 108, 117, 210: `toLocaleString` + `new Date()` por celda**
`Intl.DateTimeFormat` costoso. 42 celdas × 3 formateos = 126 llamadas por render.
**Fix:** cachear `Intl.DateTimeFormat` en módulo + `useMemo(today, [])`.

**#14 — `SettingsModal.tsx` L363-364: búsqueda sin debounce**
`opportunities.filter(...).slice(0,5)` por keystroke sobre 1 000+ items.
**Fix:** debounce 200 ms + `useDeferredValue`.

**#15 — `LinkedItemsPanel.tsx` L96: `dangerouslySetInnerHTML` sin sanitizar**
Además del riesgo XSS, re-parsea HTML en cada render.
**Fix:** DOMPurify o render a Markdown controlado.

**#16 — `TrackingView.tsx` L379: `JSON.parse(JSON.stringify(opp.tasks))`**
Clone sync de arrays grandes.
**Fix:** `structuredClone()` nativo, o evitar clone si es inmutable.

**#17 — `StickyNotesWidget.tsx` L37-69: `renderContent` recrea JSX sin memo**
**Fix:** `useCallback` + `useMemo` por línea.

**#18 — `App.tsx` L243-247: debounce global en `window[...]`**
Race conditions entre ventanas.
**Fix:** `useRef` local al componente.

**#19 — `QuickNavDock.tsx` L64-67: `findIndex + splice + splice` en `onDragOver` (60 Hz)**
20+ tabs = jank al arrastrar.
**Fix:** swap directo sin spread, o librería de DnD con diff.

**#20 — `Dashboard.tsx` L751, 824, 843, 1258: `new Date().toISOString()` en render**
**Fix:** `useMemo(() => ..., [])` por componente.

### 10.3 Quick-Find por síntoma del usuario

| Reporte del usuario                              | Archivo / línea                      | Causa raíz                        |
|--------------------------------------------------|--------------------------------------|-----------------------------------|
| Lag al editar oportunidades abiertas             | `App.tsx` L247, `OppDetail.tsx` L1703 | BroadcastChannel + JSON.stringify |
| Dashboard tarda en cargar con muchas opps        | `Dashboard.tsx` L1146, L1418         | KPIs + sorts sin memoizar         |
| Typing lento en detalle de oportunidad           | `OppDetail.tsx` L1999-3033           | Cálculos encadenados              |
| TrackingView se congela al cambiar filtro        | `TrackingView.tsx` L134-231          | Agregación O(N³)                  |
| Carpeta con muchos archivos scrollea mal         | `OppFolderTab.tsx` L461              | Sin virtualización                |
| Drag & drop lento al reordenar prioridades       | `App.tsx` L984                       | O(N²) sin Map                     |
| Export lento                                      | `opportunityExportImport.ts` L27    | IndexedDB cursor sin índice       |
| Timer causa lag general                           | `TimerContext.tsx` L82              | setState global + localStorage sync |
| Búsqueda en settings lenta                        | `SettingsModal.tsx` L363            | Sin debounce                       |
| App lenta con 5+ pestañas abiertas                | `TimerContext.tsx` L88-95           | BroadcastChannel sin throttle     |
| Jank al arrastrar tabs del dock                   | `QuickNavDock.tsx` L64              | splice en onDragOver 60 Hz        |

### 10.4 Patrones a preservar en Loop (NO deshacer)

- `NoteEditorWrapper` en `OpportunityDetail.tsx`: debounce del rich text editor. Mantener — sin esto cada tecla bloquea la UI en expedientes grandes.
- `Tiered Autosave` en `App.tsx`: `setInterval` debounced ~10 s usando File System Access API. Mantener. NO cambiar a autosave por cada keystroke.
- `services/save.worker.ts`: worker ya presente para escribir sin bloquear el main thread. Usar/extender, no remover.
- Split actual entre `Dashboard.tsx` (lista) y `OpportunityDetail.tsx` (full view): no unificarlos, re-render cascade sería masivo.
- `BroadcastChannel('tenderloop_db_sync')` en `App.tsx`: mecanismo multi-pestaña funcional. Solo reducir tamaño del payload (ver #1), no eliminar.

### 10.5 Orden de ataque recomendado (ROI)

**Sprint 1 — 80 % de la mejora (1-2 días):** bugs #1, #2, #3, #11.
**Sprint 2 — (2-3 días):** bugs #4, #5, #7, #6, #12.
**Sprint 3 — pulido:** resto.

### 10.6 Optimizaciones pendientes (NO implementadas aún)

| # | Archivo | Línea | Descripción |
|---|---------|-------|-------------|
| 1 | `App.tsx` | L247-262 | BroadcastChannel envía objeto completo — cambiar a delta |
| 2 | `OpportunityDetail.tsx` | L1703, 3300, 3320 | JSON.stringify como comparador — usar hash/shallow |
| 3 | `TrackingView.tsx` | L134-231 | workItems O(N³) — dividir en sub-memos indexados |
| 4 | `Dashboard.tsx` | L1146-1157 | KPIs históricos — consolidar en un solo reduce |
| 5 | `Dashboard.tsx` | L1418-1439 | 3 sorts dentro de forEach — memoizar |
| 6 | `OpportunityFolderTab.tsx` | L461 | Tabla sin virtualizar — react-window |
| 7 | `OpportunityDetail.tsx` | L1999-3033 | Cálculos de tasks encadenados — useMemo único |
| 8 | Varios | — | Callbacks inline en listas — useCallback + data-id |
| 9 | `opportunityExportImport.ts` | L27-41 | Cursor sin índice — índice by_opp |
| 10 | `App.tsx` | L984-1001 | rebalancePriorities O(N²) — Map |
| 11 | `TimerContext.tsx` | L82, L88-95 | localStorage cada tick + onmessage sin throttle |

---
*Este documento te ahorrará una enorme cantidad de investigación (y por tanto tokens) en el futuro. Empieza por revisarlo cada vez que se te encomiende un nuevo bug fix o feature.*
