# Progreso de Tender Loop — Reporte Local

Última actualización: 2026-06-17

## Resumen general

Estado general: Ronda 1 implementada + Vista General (10 tareas) — testing pendiente
Porcentaje estimado: 25%
Tareas totales: 60
Tareas hechas: 0
Tareas en testing: 14
Tareas listas (segunda tanda): 3
Tareas en proceso: 0
Tareas pendientes: 43
Tareas bloqueadas: 0

---

## Tareas en testing (ronda 1 + Vista General)

| ID | Nombre | Archivo modificado | Cambio | Estado |
|---|---|---|---|---|
| TASK-004 | Color del descanso en timer | components/TimerWidget.tsx | rose-900 → red-900 | needs_testing |
| TASK-018 | Filtros desalineados Vista General | components/Dashboard.tsx | justificado a la derecha | done |
| TASK-057 | BD no recuerda selección | App.tsx | Startup screen overlay | needs_testing |
| TASK-011 a TASK-021 | Mejoras Vista General (Tabla Excel, Ocultas, Notes, Next Step, KPIs) | Dashboard.tsx, OpportunityFolderTab.tsx | Múltiples mejoras UI | done |

## Cambios directos recientes

| Fecha | Área | Archivo | Cambio | Estado |
|---|---|---|---|---|
| 2026-06-16 | Proposals Dashboard | components/Dashboard.tsx | Las columnas contraídas se guardan en localStorage y se restauran al recargar hasta que el usuario las expanda | needs_testing manual |
| 2026-06-16 | Expediente / Quick Links | components/OpportunityDetail.tsx | Defaults sin duplicados: SRLink, BFO, CQA, Folder, BA y GEET; icono de abrir inmediato al capturar URL; contenedor usa todo el espacio disponible | needs_testing manual |
| 2026-06-17 | Expediente / Folder | features/opportunity-folder/, server/openHelper.js, services/folderPinsStore.ts | 5 mejoras: Base Path automático (sin pedir ruta), multiselección estilo Windows + "Copy to Windows" (portapapeles real), accesos rápidos (pins), flujo template (copia + elegir raíz/revisión), arrastre a carpeta para mover. UI en inglés. Relacionado TASK-021 y TASK-056. | needs_testing manual |

## Tareas listas (segunda tanda — no activar aún)

| ID | Nombre | Estado | Condición |
|---|---|---|---|
| TASK-009 | OP truncada en tarjetas | ready | Espera testing TASK-018 |
| TASK-023 | Fecha al marcar Done sin fecha | ready | Espera fin ronda 1 |
| TASK-044 | Auto Sold por Process Status | ready | Espera fin ronda 1 |

## Tareas críticas — pérdida de datos ⚠️

| ID | Nombre | Estado |
|---|---|---|
| TASK-037 | Nota no se guarda | pending — URGENTE |
| TASK-041 | Versiones se sobreescriben | pending — URGENTE |
| TASK-045 | No se guarda folder en revisión 0 | pending — URGENTE |

---

*Ver `.ai/handoff/claude-status-for-codex.md` para status completo legible por Codex.*
*Ver `G:\Mi unidad\...\Tender Loop\Progreso.md` para el reporte visible completo.*
