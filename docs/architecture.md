# Arquitectura — Tender Loop

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript |
| Build | Vite 6 |
| Estilos | TailwindCSS 4 |
| Iconos | Lucide React |
| PDF | jsPDF 2.5.1 + jspdf-autotable 3.8.1 |
| Docs Word | docx 9.6.1, mammoth |
| Excel | xlsx |
| Flujos | @xyflow/react |
| Servidor local | Node.js (server/openHelper.js) |

## Aplicaciones

| App | Puerto | Entry | Descripción |
|-----|--------|-------|-------------|
| Tender Loop | 3000 | index.tsx | Gestión principal de propuestas |
| Tender Flow | 3003 | index_flow.tsx | Flujo de propuestas (módulo separado) |

## Estructura de Carpetas

```
/
├── App.tsx                    # Componente raíz y estado global
├── index.tsx                  # Entry de Tender Loop
├── index_flow.tsx             # Entry de Tender Flow
├── types.ts                   # Tipos TypeScript globales
├── index.css                  # Estilos globales
├── components/                # Componentes principales
│   ├── Dashboard.tsx          # Dashboard de propuestas
│   ├── OpportunityDetail.tsx  # Expediente (vista detallada)
│   ├── TableComponents.tsx    # Vista General (tabla)
│   ├── TimerWidget.tsx        # Widget del timer
│   ├── CalendarView.tsx       # Vista de calendario de tareas
│   └── SettingsModal.tsx      # Modal de configuración
├── features/                  # Features modulares
│   ├── opportunity-folder/    # Carpetas de oportunidades
│   ├── opportunity-export/    # Exportación de oportunidades
│   ├── doc-links/             # Vinculación de documentos
│   ├── tracking/              # Tracking de KPIs
│   └── quickOrganizer/        # Organizador semanal asistido por IA (copiar/pegar prompt)
├── services/                  # Lógica de negocio y utilidades
│   ├── save.worker.ts         # Worker para guardado async
│   ├── folderStorage.ts       # Gestión de carpetas
│   ├── taskUtils.ts           # Utilidades de tareas
│   ├── dateUtils.ts           # Utilidades de fechas
│   └── recentDbHandles.ts     # Gestión de BD recientes
├── contexts/                  # Contextos de React
├── server/                    # Servidor Node.js local
│   └── openHelper.js          # Helper para abrir browser
└── tender-flow/               # Módulo Tender Flow (submódulo)
```

## Modelo de Datos Principal
El modelo de datos vive en `types.ts`. La BD es un archivo JSON local accedido con File System Access API.

## Almacenamiento
- **BD principal:** Archivo JSON en el sistema de archivos del usuario (File System Access API)
- **Configuración:** localStorage del navegador (problemas reportados en TASK-060)
- **Recientes:** services/recentDbHandles.ts

---

*Este documento se actualiza cuando hay cambios arquitectónicos aprobados.*
