# OpportunityOS

Aplicacion local para gestionar oportunidades de tendering: expedientes, tareas,
notas, indicadores, calendario, documentos y reportes para responsables.

OpportunityOS funciona en el equipo del usuario. Los datos de las oportunidades
se guardan en la base de datos local que el propio usuario crea o selecciona; no
se incluyen datos de trabajo reales en este repositorio.

## Inicio para usuarios en Windows

1. Descarga el ZIP de la rama `version-beta` desde el repositorio y extraelo
   completo en una ruta corta, por ejemplo `C:\Tenderloop`.
2. Instala Node.js 18 o una version LTS posterior.
3. En la carpeta `OpportunityOS`, abre `OPEN_OPPORTUNITYOS.vbs`.

Si Windows bloquea los archivos VBS, usa `OPEN_OPPORTUNITYOS.bat`. En el primer
inicio, el launcher instala las dependencias automáticamente; por tanto no es
necesario ejecutar `npm install` ni `npm ci` manualmente para usar la aplicación.

La aplicación se abre en
`http://127.0.0.1:3000`. Tambien inicia el servicio local de archivos en el
puerto `3099`.

Para abrirla como una pestana normal del navegador, usa
`OPEN_OPPORTUNITYOS_BROWSER.vbs` o `OPEN_OPPORTUNITYOS_BROWSER.bat`. Para
cerrar la aplicacion y liberar sus puertos, ejecuta `CLOSE_OPPORTUNITYOS.bat`.

## Desarrollo

```powershell
npm ci
npm run dev
```

En otra terminal, si se necesitan las funciones locales de archivos y correo:

```powershell
npm run server
```

Comprobaciones disponibles:

```powershell
npm run build
npm run check:server
npm run check:folder
```

## Estructura

- `src/`: interfaz React y logica de la aplicacion.
- `server/`: servicio local para operaciones del sistema de archivos y Outlook.
- `scripts/`: comprobaciones ejecutables de persistencia.
- `public/`: iconos y manifiesto de la aplicacion.
- `docs/`: documentacion funcional, tecnica y de seguridad.

## Datos y privacidad

No subas bases de datos locales, exportaciones de oportunidades ni reportes de
responsables al repositorio. Usa los mecanismos de exportacion de la aplicacion
para compartirlos mediante el canal autorizado por tu equipo.

## Documentacion relacionada

- [Manual de usuario](docs/MANUAL_USUARIO.md)
- [Documentacion tecnica](docs/TECHNICAL_DOCS.md)
- [Seguridad](docs/security.md)
- [Pruebas](docs/testing.md)
