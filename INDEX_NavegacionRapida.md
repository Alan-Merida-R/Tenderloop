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
*Este documento te ahorrará una enorme cantidad de investigación (y por tanto tokens) en el futuro. Empieza por revisarlo cada vez que se te encomiende un nuevo bug fix o feature.*
