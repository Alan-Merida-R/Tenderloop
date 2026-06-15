# Contexto de Sesión — Para Recuperación de Tokens

> Si la sesión se interrumpe, LEER ESTE ARCHIVO PRIMERO antes de continuar.
> Última actualización: 2026-06-14 — Ronda 1 completa

---

## ESTADO ACTUAL DEL ORQUESTADOR

**Fase:** Ronda 1 implementada — esperando testing de usuario/Gemini
**Tareas implementadas:** TASK-018 ✅, TASK-057 ✅, TASK-004 ✅
**Tareas en testing:** TASK-018, TASK-057, TASK-004
**Siguiente acción:** Esperar respuesta de testing. Si el usuario vuelve con "continúa", pasar a segunda tanda.

---

## CAMBIOS DE CÓDIGO REALIZADOS EN ESTA SESIÓN

### TASK-018 — components/Dashboard.tsx
- **Línea:** ~1728
- **ANTES:** `<div className="flex justify-between items-center flex-wrap gap-4">`
- **DESPUÉS:** `<div className="flex flex-wrap items-center gap-4">`
- **Por qué:** `justify-between` empujaba los filtros al extremo derecho. Con `flex-wrap` sin justify, los filtros siguen al título de izquierda a derecha.

### TASK-057 — App.tsx
- **Ubicación:** Líneas ~1653-1720 (después de `<div className="flex-1 overflow-hidden relative flex min-h-0">`)
- **Qué se agregó:** Startup screen overlay con `absolute inset-0 bg-white z-50` cuando `!isDbLoaded`
- **Contenido del overlay:**
  - Ícono HardDrive verde
  - Título "Tender Loop"
  - Si `pendingHandle && startupHint === '__reopen__'`: botón GRANDE verde "Reabrir: [filename]"
  - Si no: botones "Abrir Base de Datos" y "Nueva Base de Datos"
  - Lista de bases de datos recientes (máximo 5)
- **Lógica del botón Reabrir:** Llama a `pendingHandle.requestPermission({ mode: 'readwrite' })` → si granted → `loadDbFromHandle(h)`

### TASK-004 — components/TimerWidget.tsx
- **Cambio 1:** Línea ~147 — `bg-rose-900/85 border-rose-800` → `bg-red-900/92 border-red-800`
- **Cambio 2:** Línea ~250 — `from-rose-950/90 to-rose-900/85` → `from-red-950 to-red-900`
- **Por qué:** Los colores `rose-*` son demasiado rosados/oscuros y difíciles de distinguir. `red-*` es un rojo más claro y distinguible sin ser alarmante.

---

## SEGUNDA TANDA (sin conflictos con la primera)

Estas tareas tocan archivos DISTINTOS a los de la primera tanda:

| ID | Tarea | Archivo principal | Razón para segunda tanda |
|---|---|---|---|
| TASK-009 | OP larga truncada + contraste | components/Dashboard.tsx | Esperar a que TASK-018 pase testing (mismo archivo) |
| TASK-023 | Tarea sin fecha → fecha al marcar Done | components/OpportunityDetail.tsx | Archivo diferente, sin conflicto |
| TASK-044 | Auto Sold status | components/OpportunityDetail.tsx | Mismo archivo que TASK-023 pero pequeña |
| TASK-047 | Duración en días laborables | services/dateUtils.ts | Archivo separado, sin conflicto |
| TASK-035 | Bullets encimados en notas | index.css | Archivo CSS separado |

**Nota:** TASK-009 toca Dashboard.tsx igual que TASK-018. Esperar a que TASK-018 termine testing antes de activar TASK-009.

---

## TAREAS CRÍTICAS (pérdida de datos) — PRIORIDAD ALTA

Estas deben implementarse en cuanto la primera tanda pase testing:

| ID | Tarea | Archivo | Complejidad |
|---|---|---|---|
| TASK-037 | Nota no se guarda | OpportunityDetail.tsx + save.worker.ts | Media — agregar debounce |
| TASK-041 | Versiones se sobreescriben | OpportunityDetail.tsx | Alta — leer código de versiones primero |
| TASK-045 | No se guarda folder en revisión 0 | OpportunityDetail.tsx + folderStorage.ts | Media |

---

## FLUJO DE HANDOFF PARA GEMINI/CHATGPT

1. **Para testing:** `.ai/handoff/to-gemini-tester-1.md` — está actualizado para TASK-018, TASK-057, TASK-004
2. **El usuario copia** el contenido en Gemini
3. **El usuario pega** la respuesta de Gemini en `.ai/handoff/responses.md`
4. **Orquestador lee** `responses.md` y continúa el flujo

---

## CÓMO CONTINUAR DESPUÉS DE INTERRUPCIÓN

1. Lee este archivo: `.ai/state/session-context.md`
2. Lee `.ai/state/tasks.json` → busca status `needs_testing` o `in_progress`
3. Lee `.ai/handoff/responses.md` → ¿hay respuestas de Gemini/ChatGPT?
   - Si SÍ: procesar respuestas y actualizar estados de tareas
   - Si NO: generar nuevo handoff o implementar siguiente tanda
4. Lee `.ai/state/locks.json` → qué archivos están bloqueados
5. Continúa desde el "Siguiente acción" de este archivo

---

## ESTADO DE LOCKS

| Archivo | Tarea | Estado |
|---|---|---|
| components/Dashboard.tsx | TASK-018 | needs_testing |
| App.tsx | TASK-057 | needs_testing |
| components/TimerWidget.tsx | TASK-004 | needs_testing |

**Archivos LIBRES para siguiente tanda:**
- `components/OpportunityDetail.tsx` (para TASK-023, TASK-044, TASK-037, TASK-041, TASK-045)
- `services/dateUtils.ts` (para TASK-047)
- `index.css` (para TASK-035)

---

## REFERENCIA RÁPIDA DE ARCHIVOS DEL SISTEMA

| Archivo | Propósito | Cuándo actualizar |
|---|---|---|
| `.ai/state/session-context.md` | Este archivo — contexto de sesión | Cada vez que hay un avance |
| `.ai/state/tasks.json` | 60 tareas con estados | Cuando cambia estado de una tarea |
| `.ai/state/locks.json` | Archivos bloqueados | Al activar o liberar una tarea |
| `.ai/state/project-status.json` | Estado general | Al completar una ronda |
| `.ai/state/agent-progress.json` | Estado de cada agente | Al cambiar estado de agente |
| `.ai/state/assumptions.md` | Suposiciones del orquestador | Cuando se hace una suposición |
| `.ai/handoff/to-gemini-tester-1.md` | Contexto de testing para Gemini | Antes de cada ronda de testing |
| `.ai/handoff/responses.md` | Respuestas de ChatGPT/Gemini | El usuario pega aquí |
| `.ai/logs/progress-log.md` | Bitácora técnica | Después de cada acción |
| `G:\...\Progreso.md` | Reporte visible usuario | En cada avance grande |
| `AGENTS.md` | Arquitectura del sistema | Cuando hay cambios estructurales |
