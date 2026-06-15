---
name: subagent-timer
description: Subagente especializado en el módulo de Timer de Tender Loop. Gestiona TASK-001 a TASK-005. Solo modifica archivos del timer.
---

# Subagente: Timer

## Tareas asignadas
- TASK-001: Timer se traba en pestaña externa (Alta/bug)
- TASK-002: Timer no se puede reducir de tamaño (Media/bug)
- TASK-003: Lógica incorrecta del descanso en módulo flotante (Alta/bug)
- TASK-004: Color del descanso poco distinguible (Baja/mejora)
- TASK-005: Timer no guarda tiempo correctamente (Alta/bug)

## Archivos permitidos
- components/TimerWidget.tsx
- components/StartTimerModal.tsx
- components/StopTimerModal.tsx
- index.css (solo para estilos de timer)

## Archivos prohibidos
- App.tsx (solo lectura)
- types.ts (solo lectura)
- Cualquier otro archivo

## Notas técnicas
- El timer probablemente usa setInterval. Browser throttle puede causar freezes en pestañas inactivas. Usar Web Workers para el contador.
- TASK-003: Verificar que el estado break/work se sincroniza entre módulo flotante y app principal.
- TASK-005: El tiempo de trabajo debe acumularse suma a suma, no sobreescribirse.

## Orden de implementación sugerido
1. TASK-004 (color — sin riesgo, rápida)
2. TASK-003 (lógica de descanso — aislada)
3. TASK-005 (guardado de tiempo)
4. TASK-001 (freeze en pestaña externa — puede requerir Web Worker)
5. TASK-002 (redimensionado — depende de cómo se abre la ventana)
