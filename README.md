# Tenderloop

Repositorio del ecosistema local de gestion de oportunidades de tendering. Cada
aplicacion se instala y ejecuta desde su propia carpeta.

## Componentes

| Carpeta | Proposito | Inicio |
| --- | --- | --- |
| `OpportunityOS/` | Gestion operativa de oportunidades, expedientes, tareas, documentos e indicadores. | `OPEN_OPPORTUNITYOS.vbs` o `npm run dev` |
| `TenderFlow/` | Checklists y flujos de decision ejecutivos. | `npm run dev` |
| `ManagerTool/` | Consolidador local, de solo lectura, de reportes exportados desde OpportunityOS. | `OPEN_MANAGER_TOOL.bat` |

## Requisitos

- Windows para los launchers incluidos.
- Node.js 18 o una version LTS posterior para OpportunityOS y TenderFlow.
- Un navegador moderno; Chrome o Edge son recomendados para las funciones de
  acceso a archivos locales.

## Descargar la versión beta

Para instalar la versión preparada para usuarios, abre la rama
[`version-beta`](https://github.com/Alan-Merida-R/Tenderloop/tree/version-beta)
en GitHub y selecciona **Code → Download ZIP**. También puedes descargarla
directamente desde:

`https://github.com/Alan-Merida-R/Tenderloop/archive/refs/heads/version-beta.zip`

Descomprime el ZIP completo en una ruta corta, sin caracteres especiales, por
ejemplo `C:\Tenderloop`. No muevas archivos sueltos fuera de sus carpetas.

Después abre la aplicación que necesitas. No es necesario instalar ni ejecutar
TenderFlow para usar OpportunityOS o ManagerTool.

### OpportunityOS

Entra a `OpportunityOS/` y ejecuta `OPEN_OPPORTUNITYOS.vbs`. Si Windows bloquea
los archivos VBS, usa `OPEN_OPPORTUNITYOS.bat`.

La primera vez necesitas Node.js 18 o una versión LTS posterior y conexión a
internet. El launcher instala las dependencias necesarias automáticamente. La
aplicación usa `http://127.0.0.1:3000` y un servicio local en el puerto 3099.

### TenderFlow

```powershell
cd TenderFlow
npm ci
npm run dev
```

Se inicia en `http://localhost:3003`.

### ManagerTool

Entra a `ManagerTool/` y ejecuta `OPEN_MANAGER_TOOL.bat`. No requiere Node.js
ni instalación de dependencias. Consulta su [guía](ManagerTool/README.md) para
crear o abrir su base de datos local y consolidar reportes.

## Desarrollo y validacion

Cada proyecto tiene su propio `package.json`. Ejecuta los comandos desde la
carpeta correspondiente; no hay comandos npm en la raiz del repositorio.

```powershell
cd OpportunityOS
npm run build
npm run check:server
npm run check:folder

cd ..\TenderFlow
npm run build
```

## Datos locales y seguridad

No incluyas en GitHub bases de datos locales, archivos de oportunidades,
exportaciones `*_manager-report.json`, archivos `.env` ni carpetas
`node_modules`. El archivo `.gitignore` ya cubre dependencias, builds y la
mayoria de configuracion local; revisa siempre los archivos antes de hacer un
commit.

La documentacion especifica de OpportunityOS esta en
[OpportunityOS/docs](OpportunityOS/docs/).
