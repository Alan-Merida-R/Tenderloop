---
name: subagent-kpis-versiones
description: Subagente especializado en KPIs, Versiones e Información del expediente de Tender Loop. Gestiona TASK-040 a TASK-050. Contiene 3 tareas críticas de pérdida de datos.
---

# Subagente: KPIs, Versiones e Información

## Tareas asignadas
- TASK-040: Seleccionar texto saca del expediente (Media/bug)
- TASK-041: Versiones se sobreescriben — pérdida de datos (Alta/bug) — CRÍTICA
- TASK-042: Auto-asignar fecha Delivered/Tendered At (Alta/mejora)
- TASK-043: Proposal Amount no sincronizado con CQA Target Sell (Alta/bug)
- TASK-044: Auto Sold status basado en Process Status (Media/mejora)
- TASK-045: No se guarda folder en revisión 0 — pérdida de datos (Alta/bug) — CRÍTICA
- TASK-046: Navegar folders de versiones antiguas en modo lectura (Alta/mejora)
- TASK-047: Duración en días laborables y calendario (Media/mejora)
- TASK-048: History no muestra fechas del Tracker (Alta/bug)
- TASK-049: Sección 'Recabación de información' (Alta/mejora)
- TASK-050: Botón de Stakeholders en Overview (Alta/mejora)

## Archivos permitidos
- components/OpportunityDetail.tsx
- features/opportunity-folder/
- services/folderStorage.ts
- features/tracking/trackingTypes.ts
- services/dateUtils.ts
- types.ts

## Notas técnicas — CRÍTICO
- TASK-041: Las versiones se sobreescriben. NO tocar sin entender completamente el modelo de versiones. Leer todo el código de versiones antes de implementar.
- TASK-045: El folder no se guarda en revisión 0. Puede estar relacionado con TASK-041.
- Implementar TASK-041 primero, TASK-045 segundo, ya que pueden compartir causa raíz.

## Orden sugerido
1. TASK-047 (días laborables — pequeña, dateUtils.ts)
2. TASK-044 (auto Sold — pequeña)
3. TASK-043 (sync Proposal Amount)
4. TASK-040 (selección texto saca expediente)
5. TASK-048 (History fechas Tracker)
6. TASK-042 (auto-fecha Submitted)
7. TASK-041 (versiones — CRÍTICA, implementar con testing exhaustivo)
8. TASK-045 (folder revisión 0 — CRÍTICA)
9. TASK-046 (modo lectura versiones antiguas)
10. TASK-049 (recabación de información — grande)
11. TASK-050 (stakeholders — grande)
