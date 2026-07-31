# Testing — Tender Loop

## Estado Actual

El proyecto **no tiene framework de testing configurado** (no hay Jest, Vitest ni Cypress en package.json).

## Estrategia de Testing del Sistema Multiagente

### Tester 1 (Gemini — handoff manual)
- Valida el happy path de cada cambio.
- Verifica los criterios de aceptación uno por uno.
- Propone tests unitarios si aplica.
- Reporta errores con pasos exactos para reproducirlos.

### Tester 2 (Gemini — handoff manual)
- Busca edge cases.
- Verifica regresiones en funcionalidades adyacentes.
- Prueba integración del cambio con el resto del sistema.

### Proceso
1. Programmer implementa → estado `needs_testing`.
2. Tester 1 revisa → genera handoff en `.ai/handoff/to-gemini-tester-1.md`.
3. Usuario pega en Gemini y pega respuesta en `.ai/handoff/responses.md`.
4. Tester 2 revisa (si Tester 1 pasó) → genera handoff en `.ai/handoff/to-gemini-tester-2.md`.
5. Usuario pega en Gemini y pega respuesta en `.ai/handoff/responses.md`.
6. Si ambos pasan → Revisor Global (ChatGPT) hace revisión final.

## Agregar Testing Formal (Recomendado Futuro)
Para agregar Vitest al proyecto:
```
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```
Y agregar a vite.config.ts:
```ts
test: { environment: 'jsdom' }
```

---

*Este documento se actualiza cuando cambia la estrategia de testing.*
