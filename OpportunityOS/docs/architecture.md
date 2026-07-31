# Arquitectura del repositorio

## Aplicaciones

| Aplicacion | Puerto | Entrada | Descripcion |
| --- | --- | --- | --- |
| OpportunityOS | 3000 | `OpportunityOS/src/index.tsx` | Gestion de oportunidades, expedientes, tareas y documentos. |
| Servicio local OpportunityOS | 3099 | `OpportunityOS/server/index.ts` | Acceso controlado a archivos locales y Outlook. |
| TenderFlow | 3003 | `TenderFlow/src/index.tsx` | Checklists y flujos de decision ejecutivos. |
| ManagerTool | N/A | `ManagerTool/index.html` | Consolidador local de reportes exportados. |

## Estructura

```text
Tenderloop/
|- OpportunityOS/
|  |- src/          # Frontend React
|  |- server/       # Servicio local Express
|  |- scripts/      # Comprobaciones ejecutables
|  |- public/       # Recursos estaticos
|  `- docs/         # Documentacion de OpportunityOS
|- TenderFlow/
|  `- src/          # Frontend React independiente
`- ManagerTool/     # Aplicacion estatica local
```

Cada aplicacion con dependencias Node tiene su propio `package.json` y se
instala desde su respectiva carpeta. No existe un `package.json` en la raiz.

## Datos locales

OpportunityOS usa la File System Access API y el servicio local para guardar y
operar sobre los archivos que el usuario autoriza. Las bases de datos,
exportaciones y reportes son datos de trabajo locales y no deben versionarse.

*Actualiza este documento cuando cambien las fronteras entre aplicaciones,
puertos, puntos de entrada o mecanismos de persistencia.*
