---
name: subagent-configuracion-db
description: Subagente especializado en Configuración y Base de Datos de Tender Loop. Gestiona TASK-057 a TASK-060.
---

# Subagente: Configuración y Base de Datos

## Tareas asignadas
- TASK-057: BD no recuerda la selección del usuario (Alta/bug) — PRIMERA TANDA
- TASK-058: App no se despliega como PWA en todos los navegadores (Media/bug)
- TASK-059: Eliminar campo Stage de todo el sistema (Alta/bug)
- TASK-060: Pérdida de configuración de labels según navegador (Alta/bug)

## Archivos permitidos
- App.tsx
- services/recentDbHandles.ts
- vite.config.ts (para TASK-058 PWA)
- public/ (para TASK-058 manifest)
- index.html (para TASK-058)
- components/SettingsModal.tsx (para TASK-060)
- components/TableComponents.tsx (para TASK-059)
- components/Dashboard.tsx (para TASK-059)
- components/OpportunityDetail.tsx (para TASK-059)
- types.ts (para TASK-059 y TASK-060)

## Notas técnicas
- TASK-057: Revisar services/recentDbHandles.ts. La app ya tiene lógica de recent DB handles — verificar por qué no persiste el seleccionado como default.
- TASK-058: El proyecto ya tiene vite-plugin-pwa instalado. Verificar configuración en vite.config.ts y public/manifest.json.
- TASK-059: Buscar TODAS las referencias a 'stage' (case-insensitive) en el código. Esta tarea toca muchos archivos — implementar con cuidado.
- TASK-060: Las labels están en localStorage. Moverlas a la BD (archivo JSON) para que persistan entre navegadores.

## Orden sugerido
1. TASK-057 (BD recuerda selección — PRIMERA TANDA)
2. TASK-058 (PWA — revisar vite-plugin-pwa config)
3. TASK-060 (labels en BD — migración de localStorage a BD)
4. TASK-059 (eliminar Stage — toca muchos archivos, implementar al final)
