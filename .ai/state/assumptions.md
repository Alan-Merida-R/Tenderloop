# Assumptions del Orquestador

## 2026-06-14

### AS-001 — Archivo de cambios principal
- **Supuesto:** El archivo `G:\Mi unidad\...\Seguimiento de errores.md` es la fuente única y más completa de errores y mejoras.
- **Razón:** Es el único archivo de seguimiento encontrado. No existe ningún otro archivo de roadmap, todo o cambios en la raíz del proyecto ni en .ai/input/.
- **Acción:** Se usó este archivo como fuente. Se ignoró el CHANGELOG.md existente (es un archivo de historial, no de pendientes).

### AS-002 — Sin framework de testing
- **Supuesto:** El proyecto no tiene framework de testing configurado (no hay Jest, Vitest ni Cypress en package.json).
- **Razón:** Revisión de package.json no muestra devDependencies de testing.
- **Acción:** Los testers usarán inspección manual y archivos de handoff hacia Gemini. No se ejecutarán test runners automáticos.

### AS-003 — Modelo orquestador
- **Supuesto:** Se usa Claude Sonnet 4.6 como orquestador (el modelo activo actual). No está disponible Claude Opus directamente como herramienta separada.
- **Razón:** El entorno actual ejecuta claude-sonnet-4-6. No hay acceso a múltiples instancias de modelo con distintos roles desde esta sesión.
- **Acción:** Claude Sonnet actúa como orquestador, programador/editor y gestor de tareas. ChatGPT y Gemini reciben handoffs manuales via archivos en .ai/handoff/.

### AS-004 — ChatGPT y Gemini no disponibles via API
- **Supuesto:** No hay MCP ni herramienta disponible para llamar a ChatGPT o Gemini directamente.
- **Razón:** No se detectó ninguna herramienta MCP externa para estos modelos en el entorno actual.
- **Acción:** Se generan archivos de handoff en .ai/handoff/ para que el usuario copie y pegue en ChatGPT/Gemini. Las respuestas deben pegarse en .ai/handoff/responses.md.

### AS-005 — Archivos sensibles protegidos
- **Supuesto:** Los archivos .env, credenciales, y configuración de base de datos no serán tocados.
- **Razón:** No se encontraron archivos .env en el proyecto, pero cualquier archivo de configuración de BD queda protegido por regla de seguridad.
- **Acción:** Si una tarea requiere tocar archivos de configuración, se marcará como blocked para revisión manual.

### AS-006 — Prioridad de primera tanda
- **Supuesto:** La primera tanda segura incluye: TASK-057 (BD), TASK-018 (CSS), TASK-004 (UI/color), como tareas sin dependencias ni riesgo.
- **Razón:** Son las más pequeñas, más seguras y sin conflicto de archivos entre sí.
- **Acción:** Se activa TASK-018 primero (CSS puro, sin lógica de negocio).
