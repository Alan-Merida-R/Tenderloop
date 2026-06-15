# Handoff al Tester 1 (Gemini) — Ronda 1

**Fecha:** 2026-06-14
**Tareas a testear:** TASK-018, TASK-057, TASK-004

---

## CONTEXTO DEL PROYECTO

**Proyecto:** Tender Loop
**Stack:** React 19 + TypeScript + Vite + TailwindCSS 4
**Descripción:** App local-first para gestión de propuestas (licitaciones) para Schneider Electric.
**Cómo correr:** `npm run dev` → http://localhost:3000

---

## TAREA 1 — TASK-018: Filtros y búsqueda desalineados

**Archivo modificado:** `components/Dashboard.tsx` línea ~1728

**Cambio hecho:**
```diff
- <div className="flex justify-between items-center flex-wrap gap-4">
+ <div className="flex flex-wrap items-center gap-4">
```

**Criterios de aceptación:**
- [ ] En Vista General, los filtros y buscador NO están pegados al extremo derecho de la pantalla
- [ ] Los filtros y buscador aparecen alineados a la izquierda, continuando desde el título
- [ ] En Proposals Dashboard, la UI sigue funcionando correctamente
- [ ] En Tasks Dashboard, la UI sigue funcionando correctamente
- [ ] No hay elementos rotos ni desaparecidos

**Pasos para verificar:**
1. Abrir la app → ir a "General" view
2. Verificar que los filtros (fecha, rank, búsqueda, stage) están alineados a la izquierda
3. Ir a "Proposals" view → verificar que todo funciona
4. Ir a "Tasks" view → verificar que todo funciona

---

## TAREA 2 — TASK-057: BD no recuerda la selección

**Archivo modificado:** `App.tsx` — startup screen overlay agregado (líneas ~1653-1720)

**Cambio hecho:**
Se agregó una pantalla de inicio prominente cuando no hay BD cargada:
- Si hay un handle pendiente (permiso expirado): muestra un botón GRANDE verde "Reabrir: [nombre_del_archivo]"
- Si no hay handle: muestra botones "Abrir Base de Datos" y "Nueva Base de Datos"
- Siempre muestra la lista de bases de datos recientes

**Criterios de aceptación:**
- [ ] Al abrir la app sin BD, se muestra una pantalla de inicio centrada (no el dashboard vacío)
- [ ] Si había una BD previamente, aparece el botón prominente "Reabrir: [nombre]"
- [ ] Al hacer clic en "Reabrir", el sistema pide permiso al navegador y carga la BD
- [ ] La lista de recientes aparece en la pantalla de inicio
- [ ] Al hacer clic en una BD reciente, se carga correctamente
- [ ] Una vez cargada la BD, la pantalla de inicio desaparece y muestra el dashboard

**Pasos para verificar:**
1. Abrir la app con una BD ya configurada → funciona normal
2. Recargar la página → debería mostrar la pantalla de inicio prominente con botón "Reabrir"
3. Hacer clic en "Reabrir" → el navegador pide permiso → aprobar → la BD carga
4. Abrir en un navegador diferente (sin BD configurada) → mostrar pantalla de inicio con "Abrir Base de Datos"

---

## TAREA 3 — TASK-004: Color del descanso poco distinguible

**Archivo modificado:** `components/TimerWidget.tsx` líneas ~146-147 y ~249-250

**Cambio hecho:**
```diff
# Floating widget
- 'bg-rose-900/85 border-rose-800'  (rosado oscuro)
+ 'bg-red-900/92 border-red-800'    (rojo oscuro)

# Full timer
- 'bg-gradient-to-br from-rose-950/90 to-rose-900/85'  (rosado oscuro)
+ 'bg-gradient-to-br from-red-950 to-red-900'          (rojo oscuro más sólido)
```

**Criterios de aceptación:**
- [ ] Durante el descanso (break), el color de fondo del timer es visiblemente distinto al modo trabajo (gris oscuro)
- [ ] El color de descanso es un rojo oscuro distinguible pero NO alarmante (no es rojo brillante)
- [ ] Tanto el widget flotante como el timer completo muestran el color correcto durante descanso
- [ ] Durante el modo trabajo, el color sigue siendo gris oscuro (sin cambios)

**Pasos para verificar:**
1. Iniciar el timer en modo Pomodoro (work session)
2. Verificar que el color es gris oscuro durante el trabajo
3. Dejar que el timer pase a modo descanso (o forzarlo)
4. Verificar que el color cambia a rojo oscuro — distinguible del modo trabajo
5. Verificar que el rojo no es brillante/alarmante

---

## FORMATO DE RESPUESTA

Por favor, pega tu respuesta en `.ai/handoff/responses.md` con este formato:

```
## Test 1 de TASK-018 por Gemini (Tester 1)
Resultado: PASS | FAIL | PARCIAL
Criterios verificados:
- [criterio]: ✅ / ❌
Errores encontrados: [descripción o "Ninguno"]

## Test 1 de TASK-057 por Gemini (Tester 1)
Resultado: PASS | FAIL | PARCIAL
Criterios verificados:
- [criterio]: ✅ / ❌
Errores encontrados: [descripción o "Ninguno"]

## Test 1 de TASK-004 por Gemini (Tester 1)
Resultado: PASS | FAIL | PARCIAL
Criterios verificados:
- [criterio]: ✅ / ❌
Errores encontrados: [descripción o "Ninguno"]
```
