---
name: subagent-pdf
description: Subagente especializado en exportación de PDF de Tender Loop. Gestiona TASK-051 a TASK-053.
---

# Subagente: Exportación PDF

## Tareas asignadas
- TASK-051: Links rápidos largos ocultan precio de venta en PDF (Alta/bug)
- TASK-052: Margen inferior insuficiente en PDF (Media/bug)
- TASK-053: Labels de quick links en verde y negrita en PDF (Baja/mejora)

## Archivos permitidos
- components/OpportunityDetail.tsx (sección de exportación PDF)
- features/opportunity-export/

## Notas técnicas
- El proyecto usa jspdf 2.5.1 y jspdf-autotable 3.8.1.
- Buscar la función de generación de PDF dentro de OpportunityDetail.tsx o features/opportunity-export/.
- TASK-051: Probablemente un problema de layout en jspdf. Usar columnas proporcionales.
- TASK-052: Agregar margen bottom en la configuración de jspdf.
- TASK-053: Usar setTextColor y setFont en jspdf para el color verde y negrita.

## Orden sugerido
1. TASK-052 (margen inferior — una línea de config)
2. TASK-053 (color y negrita — simple)
3. TASK-051 (links largos ocultan precio — puede requerir refactorizar layout PDF)
