# CODEX_PROJECT_MAP

Ultima revision Codex: 2026-07-02

## Stack y comandos
- React 19 + TypeScript + Vite 6 + Tailwind 4.
- App principal: `npm run dev` / puerto 3000 / entry `index.tsx`.
- Tender Flow: `npm run dev-flow` / puerto 3003 / entry `index_flow.tsx`.
- Build verificado: `node .\node_modules\vite\bin\vite.js build` pasa.
- Warning conocido: chunks > 500 kB, no bloquea build.

## Archivos clave
- `App.tsx`: estado global, apertura/creacion de DB JSON, migraciones, autosave, navegacion, overlays, TimerProvider.
- `types.ts`: contrato de datos. Cambios de esquema deben sincronizarse con `App.tsx`/migracion.
- `components/Dashboard.tsx`: vistas General, Proposals y Tasks; kanban, tabla, calendario, schedule y filtros.
- `components/OpportunityDetail.tsx`: expediente completo; tabs, notas, tareas, KPIs, comercial, versiones, PDF.
- `contexts/TimerContext.tsx` y `components/TimerWidget.tsx`: timer principal/flotante.
- `features/schedule/*`: schedule semanal/mensual, filtros, bloque editor y notificaciones.
- `features/opportunity-folder/*`: acceso a carpetas locales, previews y metadatos.
- `services/fileSystem.ts`: File System Access API para DB local.
- `services/recentDbHandles.ts`: DB recientes y permisos.
- `services/taskUtils.ts`, `services/dateUtils.ts`: reglas reutilizables.

## Estado multiagente
- Fuente de verdad: `.ai/state/tasks.json`.
- Locks: `.ai/state/locks.json`, pero puede estar desfasado respecto a `tasks.json`.
- Estado actual contado desde `tasks.json`: `done=12`, `needs_testing=20`, `ready=1`, `pending=28`.
- Tarea lista para implementar: `TASK-009` (`components/Dashboard.tsx`).
- Muchos cambios recientes siguen en `needs_testing`; evitar reabrirlos salvo que la tarea lo exija.

## Worktree al revisar
- Cambios existentes no hechos por Codex: `.ai/reports/Progreso.md`, `.ai/state/tasks.json`, `CHANGELOG.md`.
- Archivo no trackeado existente: `.ai/reports/CAMBIOS_2026-06-17.md`.
- No revertir ni mezclar esos cambios sin instruccion explicita.

## Reglas practicas para cambios
- Antes de tocar una tarea, revisar `tasks.json` y locks relacionados.
- Si se cambia esquema de `Opportunity`, `Task`, `Commercial`, etc.: actualizar `types.ts` y migracion en `App.tsx`.
- Si se toca persistencia/notas/autosave, tratarlo como riesgo alto de perdida de datos y probar build.
- Para UI, seguir patrones existentes: Tailwind inline, lucide-react, componentes memoizados en listas/render repetido.
- Validacion minima tras cambios: `node .\node_modules\vite\bin\vite.js build`.
