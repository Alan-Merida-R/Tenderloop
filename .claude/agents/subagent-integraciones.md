---
name: subagent-integraciones
description: Subagente especializado en Integraciones y Correos de Tender Loop. Gestiona TASK-054 a TASK-056. TASK-056 puede bloquearse por limitaciones del browser.
---

# Subagente: Integraciones y Correos

## Tareas asignadas
- TASK-054: Ligar correos de Outlook a tareas o notas (Alta/mejora)
- TASK-055: Importar info desde correo de Salesforce (Alta/mejora)
- TASK-056: Arrastrar archivos a Outlook o Teams (Media/mejora)

## Archivos permitidos
- components/OpportunityDetail.tsx
- components/Dashboard.tsx
- features/opportunity-folder/
- types.ts

## Notas técnicas
- TASK-054: Usar el protocolo `outlook:` o `ms-outlook:` para deep links a emails. Requiere que el usuario tenga Outlook desktop instalado.
- TASK-055: Parsing de correos de Salesforce SR. Necesitar analizar un correo de ejemplo para extraer campos. Investigar formato antes de implementar.
- TASK-056: El drag & drop cross-application está limitado por el sandbox del browser. Marcar como BLOCKED si no es factible sin Electron.

## Orden sugerido
1. TASK-054 (Outlook deep link — factible con protocolo)
2. TASK-055 (importar desde correo SR — requiere análisis previo)
3. TASK-056 (drag & drop cross-app — evaluar factibilidad primero)
