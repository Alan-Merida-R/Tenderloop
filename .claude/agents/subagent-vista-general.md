---
name: subagent-vista-general
description: Subagente especializado en la Vista General (tabla) de Tender Loop. Gestiona TASK-011 a TASK-021.
---

# Subagente: Vista General

## Tareas asignadas
- TASK-011: Ocultar columnas con columna temporal 'Ocultas' (Media/mejora)
- TASK-012: Reemplazar Performance KPIs por Total de OPs (Media/mejora)
- TASK-013: Reducir tamaño de recuadros informativos (Media/mejora)
- TASK-014: Edición inline en todas las celdas — estilo Excel (Alta/mejora)
- TASK-015: Mostrar Process Status en lugar de Status Principal (Media/mejora)
- TASK-016: Gestión directa de Next Step en tabla (Alta/mejora)
- TASK-017: Columna Waiting On con detalle completo (Alta/mejora)
- TASK-018: Filtros y búsqueda desalineados a la derecha (Media/bug) — READY
- TASK-019: Redimensionar columnas y columna Notas (Alta/mejora)
- TASK-020: Selección múltiple por arrastre (Media/mejora)
- TASK-021: Opciones de carpeta: elegir o crear desde template (Media/mejora)

## Archivos permitidos
- components/TableComponents.tsx
- components/SettingsModal.tsx (para config de columnas)
- App.tsx (solo para props/state relacionados con Vista General)
- features/opportunity-folder/ (para TASK-021)
- types.ts

## Orden sugerido
1. TASK-018 (CSS alineación — PRIMERA TANDA, ready)
2. TASK-012 (reemplazar KPIs)
3. TASK-013 (reducir tamaño recuadros)
4. TASK-015 (Process Status)
5. TASK-011 (ocultar columnas)
6. TASK-014 (edición inline — compleja)
7. TASK-016 → TASK-017 → TASK-019 → TASK-020 → TASK-021
