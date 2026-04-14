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
*   **FLOW:** En `tender-flow/src/components/FlowDashboard.tsx`. Analiza lógica estricta (`evaluator.ts`) usando una DB separada que se sincroniza usando cachés locales a Loop.

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

**#3 — `FlowDashboard.tsx` L558-606: sync con Loop es O(N×M)**
- Por cada ítem de acción, recorre `loopDb` con dos loops anidados. 100 ítems × 1000 filas DB = 100 000 iteraciones en cada sync.
- Fix: `useMemo` que construya `Map<taskId, task>` desde `loopDb` una sola vez.
  ```tsx
  const loopTaskMap = useMemo(() => {
    const m = new Map();
    loopDb?.forEach(op => op.tasks?.forEach(t => m.set(t.id, t)));
    return m;
  }, [loopDb]);
  ```

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
| Sync con Loop lento                           | `FlowDashboard.tsx`              | 558-606             | Loop O(N×M), sin Map de índice           |
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
- `handleUpdateLoopTask` en `FlowDashboard.tsx`: igual que arriba, dependencia vía ref.
- `MemoizedBackboneItem`: envuelto en `React.memo`. Mantener.
- `DecisionMap.tsx` Effect A/B: separación de reconstrucción estructural vs actualizaciones de respuesta con debounce 120 ms. Mantener.
- `evaluateNumberedLogic`: normalización de expresión con `.replace(/(\d+)/g, ' $1 ')` antes de usar `\b`. Mantener.
- Evaluación estricta (sin optimistic fallback) en `getVisibleItems` cuando hay `logicString`. Mantener.
- `QuestionDetailPanel` exportado como `React.memo(QuestionDetailPanel_)` — el nombre interno es `QuestionDetailPanel_`. NO quitar el memo.
- Local state + debounce (250ms) en `QuestionDetailPanel` para `localTextValue`, `localNoteValue`, `localLinkLabel`, `localLinkUrl`. Refs always-latest: `localLinkLabelRef`, `localLinkUrlRef`. NO eliminar.
- `allItemsMap = useMemo(() => new Map(...), [allItems])` en `QuestionDetailPanel` para O(1) lookup en reglas de dependencia. NO cambiar a `allItems.find()`.
- `loopTaskMap` useMemo en `FlowDashboard.tsx` (después de `hasPendingActions`): Map plano de `loopDb` para sync O(N). syncWithLoop usa `loopTaskMap.get(rawId)` en lugar de loops anidados. NO revertir.

---
*Este documento te ahorrará una enorme cantidad de investigación (y por tanto tokens) en el futuro. Empieza por revisarlo cada vez que se te encomiende un nuevo bug fix o feature.*
