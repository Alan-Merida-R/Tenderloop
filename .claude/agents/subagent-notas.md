---
name: subagent-notas
description: Subagente especializado en Notas y Plantillas del expediente de Tender Loop. Gestiona TASK-034 a TASK-039. Prioridad alta: TASK-037 es pérdida de datos.
---

# Subagente: Notas y Plantillas

## Tareas asignadas
- TASK-034: Freeze al escribir en notas (Alta/bug) — PRIORIDAD ALTA
- TASK-035: Bullets encimados en notas (Media/bug)
- TASK-036: Atajos de formato no funcionan (Media/bug)
- TASK-037: Nota no se guarda — pérdida de datos (Alta/bug) — CRÍTICA
- TASK-038: Templates no se quitan al borrarlos (Media/bug)
- TASK-039: Organizar notas con jerarquía (Alta/mejora)

## Archivos permitidos
- components/OpportunityDetail.tsx
- components/SettingsModal.tsx
- services/save.worker.ts
- index.css (solo para estilos de notas)
- types.ts

## Notas técnicas
- TASK-034 y TASK-037 pueden tener la misma causa raíz: guardado sincrónico en cada keystroke. Solución probable: debounce de 500ms + indicador de guardado.
- TASK-036: Puede requerir integrar un editor rich text como tiptap, o implementar manejo de keyboard events manualmente.
- TASK-039: Tarea grande. Debe dividirse en subtareas: (a) modelo de datos, (b) UI de jerarquía, (c) navegación.

## Orden sugerido
1. TASK-037 (pérdida de datos — CRÍTICA, primero)
2. TASK-034 (freeze escribiendo — probablemente misma fix que 037)
3. TASK-035 (CSS bullets)
4. TASK-038 (templates no se quitan)
5. TASK-036 (atajos de formato)
6. TASK-039 (jerarquía de notas — tarea grande)
