# Handoff al Tester (Gemini) — Ronda 2 y 3

Fecha: 2026-06-15
Tareas a testear: TASK-003, TASK-023, TASK-034, TASK-037, TASK-041, TASK-042, TASK-044, TASK-045

## TASK-003: Lógica incorrecta del descanso en módulo flotante
Archivos: contexts/TimerContext.tsx, App.tsx
Fix: TimerProvider tiene prop primary. Auto-phase watcher deshabilitado en ventana flotante (primary=false).
Test: Iniciar pomodoro. Al llegar al descanso, verificar que SOLO la app principal avanza la fase.

## TASK-023: Fecha al marcar tarea Done
Archivo: components/OpportunityDetail.tsx
Fix: Al marcar tarea inline como Done, si linkedTask.dueDate esta vacio, se asigna dueDate=hoy.
Test: Marcar tarea inline como Done -> verificar que la tarea vinculada tiene fecha de hoy.

## TASK-034: Freeze al escribir en notas
Archivo: components/OpportunityDetail.tsx
Fix: Removido setActiveNoteHtml(val) del ciclo de escritura - elimina re-render de 6000 lineas.
Test: Escribir texto rapido en una nota -> NO debe haber freeze ni lag.

## TASK-037: Nota no se guarda al cerrar rapido
Archivo: components/OpportunityDetail.tsx RichTextEditor
Fix: Debounce 500ms->150ms. Cleanup en unmount llama onChange incondicionalmente.
Test: Escribir en nota y cambiar de nota inmediatamente (<150ms) -> contenido debe guardarse.

## TASK-041: Versiones del expediente se sobreescriben (CRITICO)
Archivos: components/OpportunityDetail.tsx, App.tsx
Fix: handleUpdateSnapshotMeta excluye campo snapshot. updateOpportunity protege snapshots existentes.
Test: Crear R1, editar expediente, crear R2. View de R1 debe mostrar datos originales de R1.

## TASK-042: Auto fecha Delivered/Tendered al pasar a Submitted
Archivo: components/OpportunityDetail.tsx
Fix: Cuando statusLabel cambia a Submitted -> kpis.timeline.deliveredAt = hoy. Al revertir -> null.
Test: Cambiar status a Submitted -> KPI -> Delivered At debe mostrar hoy. Revertir -> fecha se borra.

## TASK-044: Auto-asignar statusLabel Won al seleccionar stage Won/Lost
Archivo: components/OpportunityDetail.tsx
Fix: Al stage=9. Won/Lost, si statusLabel no es terminal -> auto Won.
Test: stage=Won/Lost -> status debe auto-cambiarse a Won (si no era ya Won/Lost/Canceled).

## TASK-045: No se guarda folder en revision 0
Archivo: features/opportunity-folder/OpportunityFolderTab.tsx
Fix 1: handleChangeRoot llama onUpdate con folderLinked:true.
Fix 2: init useEffect usa queryPermission (no requestPermission). Muestra boton Grant Folder Access si permiso no concedido.
Test: Vincular folder -> recargar -> debe aparecer Grant Folder Access y restaurar al hacer clic.

---
Respuestas en .ai/handoff/responses.md
