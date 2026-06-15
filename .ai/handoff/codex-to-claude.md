# Mensaje de Codex GPT-5.5 para Claude Orquestador

Fecha: 2026-06-15
Rol: Agente de apoyo / revisor / analista

## Estado detectado

Claude parece estar en fase inicial de orquestacion. El sistema multiagente ya clasifico 60 tareas desde Seguimiento de errores.md, con estado general `planning` / `initial_analysis` y 5% de avance. La primera tanda propuesta es TASK-057, TASK-018 y TASK-004, pero solo TASK-018 aparece con lock activo en `.ai/state/locks.json` sobre `components/TableComponents.tsx`. En `.ai/state/tasks.json`, TASK-018 y TASK-057 estan en `ready`; TASK-004 sigue en `pending`, aunque `project-status.json` la menciona como parte de la primera tanda.

No pude leer directamente `G:\Mi unidad\...\Seguimiento de errores.md` desde este sandbox por `Acceso denegado`; el analisis se basa en los archivos `.ai/state/*`, `.ai/logs/progress-log.md` y `.ai/handoff/*`.

## Riesgos detectados

| Riesgo | Severidad | Archivo/Tarea afectada | Recomendacion |
|---|---|---|---|
| Inconsistencia entre primera tanda y locks/status | Media | TASK-004, TASK-018, TASK-057 / `project-status.json`, `tasks.json`, `locks.json` | Antes de activar mas agentes, sincronizar estados: si TASK-004 va en primera tanda, moverla a `ready` y crear lock; si no, quitarla del `next_action`. |
| Muchas tareas convergen en `components/OpportunityDetail.tsx` | Alta | 36 tareas, incluidas TASK-037, TASK-041, TASK-045 | No paralelizar cambios sobre este archivo. Agrupar por flujo funcional y resolver primero bugs de perdida de datos. |
| Tareas criticas de perdida de datos siguen pendientes | Critica | TASK-037, TASK-041, TASK-045 | Priorizar despues de cerrar la tanda segura o antes de mejoras visuales grandes. Requieren pruebas manuales y revision global. |
| No hay framework de tests detectado | Alta | Todo el proyecto | Para cada tarea, exigir al menos smoke test manual reproducible y, si no se instala framework, documentar pasos exactos en handoff. |
| Tareas grandes mezclan cambios de UI, modelo y persistencia | Alta | TASK-014, TASK-039, TASK-049, TASK-059, TASK-060 | Dividir antes de implementar. Evitar que una tarea amplia toque `types.ts`, `App.tsx` y `OpportunityDetail.tsx` junto con cambios de layout sin checkpoints. |
| TASK-056 puede ser tecnicamente inviable en browser | Alta | TASK-056 / `features/opportunity-folder/` | Marcar como investigacion o `blocked` si la app no corre en Electron/entorno con soporte real de drag cross-app. |
| Codificacion mojibake visible en JSON/reportes | Baja | Archivos `.ai/state/*.json`, `.ai/logs/progress-log.md` | Verificar encoding UTF-8 al escribir reportes para evitar perdida de legibilidad en acentos. No es bloqueante para codigo. |
| TASK-057 depende de permisos persistentes del File System Access API | Media | TASK-057 / `App.tsx`, `services/recentDbHandles.ts` | Validar casos: permiso concedido, permiso revocado, navegador sin API, handle obsoleto, multiples BD. |

## Conflictos de tareas o archivos

| Conflicto | Tareas afectadas | Archivos afectados | Accion recomendada |
|---|---|---|---|
| Lock activo de Vista General | TASK-018 vs TASK-011, TASK-012, TASK-013, TASK-014, TASK-015, TASK-016, TASK-017, TASK-019, TASK-020, TASK-059 | `components/TableComponents.tsx` | Mientras TASK-018 este activa, no iniciar ninguna otra tarea que toque este archivo. |
| Configuracion/BD comparte raiz de app | TASK-057 vs TASK-006, TASK-011, TASK-012, TASK-013, TASK-014, TASK-016, TASK-028, TASK-059, TASK-060 | `App.tsx` | TASK-057 puede correr en paralelo con TASK-018 y TASK-004, pero no con cambios de estado global, labels, Stage o notificaciones. |
| Timer comparte componente central | TASK-001, TASK-002, TASK-003, TASK-004, TASK-005 | `components/TimerWidget.tsx` | Ejecutar de una en una o convertir en bloque Timer con una sola rama de cambios. TASK-004 es simple, pero no debe solaparse con TASK-001/003/005. |
| Calendario/tareas parecen duplicar freezes | TASK-022, TASK-025, TASK-026, TASK-031 | `components/CalendarView.tsx`, `components/OpportunityDetail.tsx` | Antes de implementar, hacer diagnostico comun de renders/estado. Probable causa compartida. |
| Versiones y folders antiguos se pisan conceptualmente | TASK-041, TASK-045, TASK-046 | `components/OpportunityDetail.tsx`, `services/folderStorage.ts`, `features/opportunity-folder/` | Resolver TASK-041/TASK-045 primero; TASK-046 depende funcionalmente de versionado estable aunque solo declare dependencia con TASK-041. |
| Submitted afecta dashboard, fechas y estados | TASK-006, TASK-042, posiblemente TASK-044 | `components/Dashboard.tsx`, `components/OpportunityDetail.tsx`, `types.ts` | Implementar TASK-006 antes de TASK-042; revisar si TASK-044 comparte la misma funcion de cambio de status. |
| PDF quick links son una mini-serie | TASK-051, TASK-052, TASK-053 | `features/opportunity-export/`, `components/OpportunityDetail.tsx` | Hacerlas juntas o secuenciales por el mismo subagente PDF para evitar retrabajo de layout. |
| Stage removal es transversal | TASK-059 vs casi todas las tareas de tabla/dashboard/expediente | `App.tsx`, `TableComponents.tsx`, `Dashboard.tsx`, `OpportunityDetail.tsx`, `types.ts`, `SettingsModal.tsx` | No correr en paralelo con tareas de Vista General, Dashboard, Settings o Expediente. Preparar busqueda exhaustiva y checklist antes. |

## Tareas recomendadas para Claude

| Prioridad | ID sugerido | Nombre | Motivo | Puede ir en paralelo |
|---|---|---|---|---|
| P0 | TASK-018 | Cerrar alineacion de filtros en Vista General | Ya tiene lock activo y alcance bajo; terminarla limpia reduce estado abierto. | Si, solo con tareas que no toquen `TableComponents.tsx`. |
| P0 | TASK-057 | BD recuerda seleccion al reabrir | Alta prioridad UX y sin conflicto con TASK-018. | Si, con TASK-018 y TASK-004 si se bloquean archivos correctamente. |
| P1 | TASK-004 | Color descanso | Baja complejidad, buena para validar flujo de implementacion/testing/documentacion. | Si, pero no con otras tareas Timer. |
| P1 | TASK-041 | Versiones no deben sobreescribirse | Critica por perdida de datos; debe subir en prioridad tras la tanda segura. | No, debe ir aislada. |
| P1 | TASK-045 | Guardado de folder en revision 0 | Critica por perdida de datos; relacionada con versionado/folders. | No con TASK-041 salvo que sea el mismo agente y plan integrado. |
| P1 | TASK-037 | Nota no se guarda | Critica por perdida de datos, pero depende de diagnosticar TASK-034. | No con otras tareas de `OpportunityDetail.tsx`. |
| P2 | TASK-034 | Freeze al escribir en notas | Probable causa raiz o prerequisito practico de TASK-037. | No con TASK-037 si hay dos agentes distintos. |
| P2 | TASK-022/TASK-025/TASK-026/TASK-031 | Diagnostico comun de freezes en tareas/calendario | Varias tareas parecen sintomas de rerenders o persistencia sincrona. | No como implementacion paralela; si como analisis unico. |
| P2 | TASK-051/TASK-052/TASK-053 | Paquete PDF export | Mismo modulo y criterios visuales relacionados. | Si, despues de aislar de `OpportunityDetail.tsx` activo. |
| P3 | TASK-056 | Viabilidad drag a Outlook/Teams | Puede estar bloqueada por limitaciones del navegador. | Si, como investigacion sin edicion de codigo. |

## Tareas que NO deben correr en paralelo

| Tarea A | Tarea B | Motivo |
|---|---|---|
| TASK-018 | TASK-011/TASK-012/TASK-013/TASK-014/TASK-015/TASK-016/TASK-017/TASK-019/TASK-020/TASK-059 | Comparten `components/TableComponents.tsx`. |
| TASK-057 | TASK-060 | Ambas modifican persistencia/configuracion y `App.tsx`; riesgo de pisar modelo de guardado. |
| TASK-057 | TASK-059 | TASK-059 es transversal y toca `App.tsx`; puede invalidar cambios recientes de carga inicial. |
| TASK-004 | TASK-001/TASK-003/TASK-005 | Comparten `TimerWidget.tsx`; evitar conflictos y regresiones de estado del timer. |
| TASK-041 | TASK-045 | Ambas tratan versionado/folders y perdida de datos en expediente; si se hacen juntas debe ser por el mismo agente con plan unico. |
| TASK-037 | TASK-034 | TASK-034 puede ser causa raiz de guardado de notas; dos agentes podrian tocar la misma logica. |
| TASK-022 | TASK-025/TASK-026/TASK-031 | Comparten sintomas de freezes en tareas/calendario y archivos centrales. |
| TASK-006 | TASK-042 | TASK-042 depende de estado Submitted sincronizado por TASK-006. |
| TASK-014 | TASK-016 | TASK-016 depende de edicion inline de TASK-014. |
| TASK-059 | Cualquier tarea que toque `App.tsx`, `TableComponents.tsx`, `Dashboard.tsx`, `OpportunityDetail.tsx`, `types.ts` o `SettingsModal.tsx` | Eliminacion de Stage es transversal y deberia aislarse. |

## Tests recomendados

| Tarea | Test recomendado | Tipo |
|---|---|---|
| TASK-018 | Abrir Vista General y confirmar que buscador/filtros quedan alineados a la izquierda en desktop y ventana estrecha; verificar que filtros siguen funcionando. | Manual visual + smoke |
| TASK-057 | Configurar BD, cerrar/reabrir app, recargar pagina y confirmar carga automatica; revocar permiso y verificar fallback no rompe; probar segunda BD reciente. | Manual persistencia |
| TASK-004 | Cambiar entre trabajo/descanso y verificar color distinguible sin parecer error; revisar contraste en modo normal si existe. | Manual visual |
| TASK-041 | Crear version nueva, editar contenido, navegar a version anterior, salir/recargar, volver a version nueva y confirmar que no se sobreescribe. | Regresion critica de datos |
| TASK-045 | En revision 0 asignar folder, navegar entre revisiones, cerrar/reabrir y confirmar persistencia del folder. | Regresion critica de datos |
| TASK-037 | Escribir nota, esperar autosave, recargar y confirmar contenido; repetir con texto largo y caracteres especiales. | Persistencia |
| TASK-034 | Escribir rapido durante 30-60s en notas y medir si la UI se congela; probar con expediente grande. | Performance manual |
| TASK-022/TASK-025/TASK-026/TASK-031 | Arrastrar tareas, cambiar fechas, abrir subvista de tareas y observar re-renders/freezes con dataset grande. | Performance + regresion |
| TASK-051/TASK-052/TASK-053 | Exportar PDF con quick links cortos/largos, muchos links y precio alto; revisar margen inferior y labels. | Visual PDF |
| TASK-059 | Buscar `stage`/`Stage` en repo tras cambio; validar que filtros, tarjetas, tabla y expediente no muestran ni dependen del campo. | Checklist + grep + manual |
| TASK-060 | Crear labels en un navegador/BD, abrir misma BD en otro navegador o perfil y confirmar que aparecen; probar migracion desde labels locales. | Persistencia cross-browser |

## Mensaje corto para que Claude lo lea

Claude: cierra primero TASK-018 porque ya tiene lock activo. Antes de activar TASK-004, sincroniza `tasks.json`/`locks.json` con `project-status.json`; ahora TASK-004 esta mencionada en la primera tanda pero sigue `pending` y sin lock. TASK-057 puede correr en paralelo con TASK-018 si se bloquean `App.tsx` y `services/recentDbHandles.ts`, pero no la mezcles con TASK-059 ni TASK-060. Despues de la tanda segura, sube prioridad real a los bugs criticos de perdida de datos: TASK-041, TASK-045 y TASK-037. Evita paralelizar cualquier trabajo sobre `components/OpportunityDetail.tsx`; concentra ahi los cambios por flujo y con pruebas manuales reproducibles.
