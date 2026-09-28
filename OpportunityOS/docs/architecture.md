# Arquitectura del repositorio

## Aplicaciones

| Aplicacion | Puerto | Entrada | Descripcion |
| --- | --- | --- | --- |
| Tender Control | 3000 | `OpportunityOS/src/index.tsx` | Gestion de oportunidades, expedientes, tareas y documentos. |
| Servicio local Tender Control | 3099 | `OpportunityOS/server/index.ts` | Acceso controlado a archivos locales, Outlook y automatizacion web. |
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
El paquete publicado de OpportunityOS es autocontenido: incluye `dist`,
`node_modules` y un runtime Node.js x64 validado. La PC destino no ejecuta npm,
no compila y no necesita acceso a Internet para instalar o actualizar.
`OpportunityOS/engine_opportunityos.bat` es la entrada operativa: distingue el
paquete oficial de una copia fuente, prepara lo necesario y comprueba ambos
servicios. No existe una capa HTA/VBScript/Windows Script Host.

## Servicio local (puerto 3099)

| Prefijo | Contenido | Interruptor |
| --- | --- | --- |
| `/api/db/*` | Base de datos JSON gestionada por el backend. | Siempre activo. |
| `/api/os/*` | Explorador, portapapeles, Outlook y control de ventanas. | `TENDERLOOP_DISABLE_OS=1` |
| `/api/web/*` | Navegador automatizado sobre un perfil de Chrome dedicado. | `OPPORTUNITYOS_DISABLE_WEB=1` |

`/api/health` indica que rutas estan montadas. Consulta
[security.md](security.md) antes de tocar `/api/web/*`: la lista blanca de
hosts y la redaccion son controles de seguridad, no detalles opcionales.

## Datos locales

OpportunityOS usa la File System Access API y el servicio local para guardar y
operar sobre los archivos que el usuario autoriza. Las bases de datos,
exportaciones y reportes son datos de trabajo locales y no deben versionarse.

El servicio local escribe ademas bajo `%APPDATA%\OpportunityOS\`:

| Carpeta | Contenido |
| --- | --- |
| `chrome-profile/` | Perfil de Chrome dedicado a la automatizacion; contiene la sesion corporativa del usuario. |
| `web-probes/` | Artefactos de cada sondeo (HTML, texto, captura, JSON) **sin redactar**. |
| `web-recipes/` | Recetas de extraccion (fase 2). |

Estas carpetas son datos de trabajo: nunca se versionan ni se comparten.

*Actualiza este documento cuando cambien las fronteras entre aplicaciones,
puertos, puntos de entrada o mecanismos de persistencia.*
