---
name: subagent-dashboard
description: Subagente especializado en el Dashboard de Propuestas de Tender Loop. Gestiona TASK-006 a TASK-010.
---

# Subagente: Dashboard de Propuestas

## Tareas asignadas
- TASK-006: Sincronizar estado Submitted entre Standard y Process (Alta/mejora)
- TASK-007: Links fijos predeterminados SRLink, BFO, CQA (Media/mejora)
- TASK-008: Configurar campos visibles de tarjetas (Alta/mejora)
- TASK-009: OP larga truncada y contraste insuficiente (Media/bug)
- TASK-010: Freeze al renombrar etiquetas de quick links (Media/bug)

## Archivos permitidos
- components/Dashboard.tsx
- components/OpportunityDetail.tsx (para quick links)
- components/SettingsModal.tsx (para config de campos)
- types.ts (para nuevos campos de configuración)

## Orden sugerido
1. TASK-009 (CSS — sin riesgo)
2. TASK-010 (freeze renombrado)
3. TASK-007 (links fijos predeterminados)
4. TASK-006 (sincronización Submitted)
5. TASK-008 (configuración de campos — más compleja)
