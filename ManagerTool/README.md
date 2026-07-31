# Manager Tool

Aplicación local, de solo lectura, para consolidar reportes exportados desde
OpportunityOS. No requiere Node.js ni instalación de dependencias.

## Inicio desde el ZIP beta

1. Descarga y extrae el ZIP completo de la rama `version-beta`.
2. Abre la carpeta `ManagerTool`.
3. Ejecuta `OPEN_MANAGER_TOOL.bat`.

## Uso

1. Abre `OPEN_MANAGER_TOOL.bat`.
2. In **Settings**, click **Create database** and save the Manager Tool database file in a safe, backed-up location.
3. Select the shared folder containing `*_manager-report.json` files.
4. Click **Refresh reports** after tenders upload new report versions.

La aplicación no envía datos a internet. Su archivo de base de datos guarda los
equipos, notas, recordatorios, tareas, ajustes y la última copia válida de cada
reporte. Copia ese archivo junto con la aplicación para mover los datos a otro
equipo; allí usa **Open database**.

The browser keeps a private local copy only to make large report sets load faster. Once a Manager Tool database has been created or opened, changes are also saved to that portable database file.

Los usuarios exportan el archivo desde OpportunityOS con **Export Manager
report** y lo colocan manualmente en la carpeta compartida. Los reportes y la
base de datos local son datos de trabajo: no los incluyas en GitHub.
