# AGENTS.md — Sistema Multiagente de Tender Loop

> Arquitectura del sistema de orquestación autónoma para el desarrollo ordenado de Tender Loop.

## Orquestador Principal
**Modelo:** Claude Sonnet 4.6
**Rol:** Coordina todos los agentes, controla los locks, activa tareas y muestra el dashboard de avance.
**Sin preguntas** salvo para acciones irreversibles (borrar datos, credenciales, deploy a producción).

---

## Agentes del Sistema

| Agente | Archivo | Modelo | Disponibilidad |
|--------|---------|--------|----------------|
| Task Manager | .claude/agents/task-manager.md | Claude Sonnet | Directo |
| Programmer/Editor | .claude/agents/programmer-editor.md | Claude Sonnet | Directo |
| Reviewer Global | .claude/agents/reviewer-global.md | ChatGPT | Handoff manual |
| Tester 1 | .claude/agents/tester-1.md | Gemini | Handoff manual |
| Tester 2 | .claude/agents/tester-2.md | Gemini | Handoff manual |
| Documenter | .claude/agents/documenter.md | Claude Sonnet | Directo |

---

## Subagentes por Categoría

| Subagente | Archivo | Tareas |
|-----------|---------|--------|
| Timer | subagent-timer.md | TASK-001 a TASK-005 |
| Dashboard | subagent-dashboard.md | TASK-006 a TASK-010 |
| Vista General | subagent-vista-general.md | TASK-011 a TASK-021 |
| Tareas y Schedule | subagent-tareas-schedule.md | TASK-022 a TASK-033 |
| Notas y Plantillas | subagent-notas.md | TASK-034 a TASK-039 |
| KPIs y Versiones | subagent-kpis-versiones.md | TASK-040 a TASK-050 |
| PDF | subagent-pdf.md | TASK-051 a TASK-053 |
| Integraciones | subagent-integraciones.md | TASK-054 a TASK-056 |
| Configuración/BD | subagent-configuracion-db.md | TASK-057 a TASK-060 |

---

## Archivos de Estado

| Archivo | Propósito |
|---------|-----------|
| .ai/state/tasks.json | Fuente de verdad de todas las tareas |
| .ai/state/locks.json | Control de archivos bloqueados actualmente |
| .ai/state/errors.json | Errores detectados durante testing |
| .ai/state/agent-progress.json | Estado actual de cada agente |
| .ai/state/project-status.json | Estado general del proyecto |
| .ai/state/assumptions.md | Suposiciones del orquestador |
| .ai/logs/progress-log.md | Bitácora técnica detallada |
| .ai/reports/Progreso.md | Reporte visible para el usuario |

---

## Archivos de Handoff (Modelos Externos)

| Archivo | Destinatario |
|---------|-------------|
| .ai/handoff/to-chatgpt.md | ChatGPT — Revisor Global |
| .ai/handoff/to-gemini-tester-1.md | Gemini — Tester 1 (happy path) |
| .ai/handoff/to-gemini-tester-2.md | Gemini — Tester 2 (edge cases) |
| .ai/handoff/responses.md | Respuestas pegadas por el usuario |

---

## Flujo de una Tarea

```
pending → ready → locked* → in_progress → needs_testing
                                              ↓
                                        failed_testing → in_progress (retry)
                                              ↓
                                        needs_review → needs_changes → in_progress (retry)
                                              ↓
                                        approved → documented → done
```

*`locked` = otro agente usa un archivo que necesita esta tarea.

---

## Reglas de Seguridad

NUNCA modificar automáticamente:
- `.env` o cualquier archivo de credenciales
- Configuración de pagos o facturación
- Migraciones destructivas de BD
- Deploy a producción
- Permisos de seguridad críticos

Si una tarea requiere cualquiera de lo anterior → estado `blocked` + explicación al usuario.

---

## Fuente de Errores
`G:\Mi unidad\...\Seguimiento de errores.md` — **SOLO LECTURA, NUNCA EDITAR**

## Reporte Visible
`.ai/reports/Progreso.md` — actualizado en cada avance grande
