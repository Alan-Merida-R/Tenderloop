---
name: subagent-tareas-schedule
description: Subagente especializado en Tareas y Schedule del expediente de Tender Loop. Gestiona TASK-022 a TASK-033.
---

# Subagente: Tareas y Schedule

## Tareas asignadas
- TASK-022: Drag & drop se traba en calendario (Alta/bug)
- TASK-023: Tarea sin fecha no registra fecha al marcar Done (Media/bug)
- TASK-024: Next Step no señala la tarea correcta (Media/bug)
- TASK-025: App se traba al setear fecha (Alta/bug)
- TASK-026: Schedule se traba al mover tareas (Alta/bug)
- TASK-027: Filtros de Schedule mal implementados (Media/mejora)
- TASK-028: No aparecen notificaciones push (Alta/bug)
- TASK-029: Tareas agendables sin info no se identifican (Media/mejora)
- TASK-030: Status de tarea no aparece en detalles (Media/mejora)
- TASK-031: App se traba al modificar tareas (Alta/bug)
- TASK-032: Agregar status 'Aprobación' en Tareas (Media/mejora)
- TASK-033: Next Step desde expediente no ilumina la tarea (Media/bug)

## Archivos permitidos
- components/CalendarView.tsx
- components/OpportunityDetail.tsx
- services/taskUtils.ts
- types.ts

## Notas técnicas
- TASK-022, TASK-025, TASK-026, TASK-031: Todos son freezes/trabas. Causa raíz probable: re-renders en cascada o guardado sincrónico. Investigar juntos.
- TASK-028: Requiere Notification API del navegador y permisos del usuario.
- TASK-024 y TASK-033: Mismo problema visto desde dos lugares. Corregir en un solo fix.

## Orden sugerido
1. TASK-023 (fecha al hacer Done — pequeña y segura)
2. TASK-030 (status en detalles)
3. TASK-032 (nuevo status Aprobación)
4. TASK-024 + TASK-033 (Next Step navegación — fix conjunto)
5. TASK-031 (freeze al modificar)
6. TASK-025 (freeze al setear fecha — causa raíz probablemente igual a 031)
7. TASK-022 + TASK-026 (drag & drop freeze)
8. TASK-027 (filtros Schedule)
9. TASK-029 (indicador visual)
10. TASK-028 (notificaciones — requiere Notification API)
