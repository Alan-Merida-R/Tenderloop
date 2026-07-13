# Progreso de Tender Loop â€” Reporte Local

Ãšltima actualizaciÃ³n: 2026-06-17

## Resumen general

Estado general: Ronda 1 implementada + Vista General (10 tareas) â€” testing pendiente
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
| TASK-004 | Color del descanso en timer | components/TimerWidget.tsx | rose-900 â†’ red-900 | needs_testing |
| TASK-018 | Filtros desalineados Vista General | components/Dashboard.tsx | justificado a la derecha | done |
| TASK-057 | BD no recuerda selecciÃ³n | App.tsx | Startup screen overlay | needs_testing |
| TASK-011 a TASK-021 | Mejoras Vista General (Tabla Excel, Ocultas, Notes, Next Step, KPIs) | Dashboard.tsx, OpportunityFolderTab.tsx | MÃºltiples mejoras UI | done |

## Cambios directos recientes

| Fecha | Ãrea | Archivo | Cambio | Estado |
|---|---|---|---|---|
| 2026-06-16 | Proposals Dashboard | components/Dashboard.tsx | Las columnas contraÃ­das se guardan en localStorage y se restauran al recargar hasta que el usuario las expanda | needs_testing manual |
| 2026-06-16 | Expediente / Quick Links | components/OpportunityDetail.tsx | Defaults sin duplicados: SRLink, BFO, CQA, Folder, BA y GEET; icono de abrir inmediato al capturar URL; contenedor usa todo el espacio disponible | needs_testing manual |
| 2026-06-17 | Expediente / Folder | features/opportunity-folder/, server/openHelper.js, services/folderPinsStore.ts | 5 mejoras: Base Path automÃ¡tico (sin pedir ruta), multiselecciÃ³n estilo Windows + "Copy to Windows" (portapapeles real), accesos rÃ¡pidos (pins), flujo template (copia + elegir raÃ­z/revisiÃ³n), arrastre a carpeta para mover. UI en inglÃ©s. Relacionado TASK-021 y TASK-056. | needs_testing manual |

## Tareas listas (segunda tanda â€” no activar aÃºn)

| ID | Nombre | Estado | CondiciÃ³n |
|---|---|---|---|
| TASK-009 | OP truncada en tarjetas | ready | Espera testing TASK-018 |
| TASK-023 | Fecha al marcar Done sin fecha | ready | Espera fin ronda 1 |
| TASK-044 | Auto Sold por Process Status | ready | Espera fin ronda 1 |

## Tareas crÃ­ticas â€” pÃ©rdida de datos âš ï¸

| ID | Nombre | Estado |
|---|---|---|
| TASK-037 | Nota no se guarda | pending â€” URGENTE |
| TASK-041 | Versiones se sobreescriben | pending â€” URGENTE |
| TASK-045 | No se guarda folder en revisiÃ³n 0 | pending â€” URGENTE |

---

## Cambios 2026-07-11

| Area | Archivo | Cambio | Estado |
|---|---|---|---|
| Abrir aplicacion / Instalacion | App.tsx, _open_browser.bat, motor_tenderloop.bat, INSTALAR_TENDERLOOP.vbs | Apertura en modo app con navegador predeterminado compatible, instalador de accesos directos, progreso visible de arranque/descarga y nueva BD siempre pide ubicacion. | needs_testing manual |
| Abrir aplicacion / Instalacion | INSTALAR_TENDERLOOP.vbs, LANZAR_TENDERLOOP.vbs, motor_tenderloop.bat, _open_browser.bat | Instalador en ingles con pasos restantes, espera al final hasta elegir Open app o Close installer; textos visibles de apertura en navegador pasados a ingles. | needs_testing manual |
| InstalaciÃ³n / desinstalaciÃ³n | DESINSTALAR_TENDERLOOP.vbs, DESINSTALAR_TENDERLOOP.hta, DESINSTALAR_TENDERLOOP.bat | Retirado el desinstalador de consola heredado. El flujo visual cierra los procesos locales, borra dependencias y accesos, y preserva datos/cÃ³digo. | needs_testing manual |
| Stakeholders / SOW / Tasks / KPI | types.ts, App.tsx, SettingsModal.tsx, OpportunityDetail.tsx, Dashboard.tsx | Directorio global, roles por oportunidad, equipo SOW, menciones, Assignment con fases y fechas, ciclos de cambios e integraciÃ³n editable Worked/Waiting con el KPI. | build aprobado; needs_testing manual |
| Opportunity Team / Contacts | SettingsModal.tsx, OpportunityDetail.tsx, App.tsx, sowTemplate.html | Roles unificados con Tracked Areas; panel fijo en Notes convertido en nota plegable; gestiÃ³n retirada de SOW; bÃºsqueda/creaciÃ³n de contactos y Ã¡reas desde Settings, Notes y Assignment. | build aprobado; needs_testing manual |

*Ver `.ai/handoff/claude-status-for-codex.md` para status completo legible por Codex.*
*Ver `G:\Mi unidad\...\Tender Loop\Progreso.md` para el reporte visible completo.*

## Cambios 2026-07-13

| Area | Archivo | Cambio | Estado |
|---|---|---|---|
| SOW / KOM | `docs/sow.md` | Documentación técnica para futuros agentes: arquitectura, archivos críticos, Library global, dependencias, sincronización, Overview, minuta KOM y checklist de cambios seguros. | documentado |
| Publicación beta | `README.md`, `docs/version-beta.md` | Se documentó la rama `version-beta`, sus cambios integrados, requisitos, descarga directa desde GitHub y uso mediante el lanzador de Windows. | build y chequeo de servidor aprobados |

