# TenderFlow

Aplicacion estrategica para gestionar checklists, flujos de decision y mapas
ejecutivos de oportunidades de licitacion.

## Inicio rapido

1. Instala Node.js 18 o una version LTS posterior.
2. Abre una terminal en la carpeta `TenderFlow`.
3. Instala y ejecuta la aplicacion:

   ```powershell
   npm ci
   npm run dev
   ```

La aplicacion se abre en `http://localhost:3003`. El puerto fijo permite usarla
al mismo tiempo que OpportunityOS, que utiliza el puerto 3000.

En Windows tambien puedes ejecutar `LANZAR_TENDERFLOW.vbs`. Si quieres ver la
ventana del motor local y los posibles mensajes de instalacion, ejecuta
`motor_tenderflow.bat`.

## Compilar

```powershell
npm run build
```

Los archivos generados se guardan en `dist/`, directorio que no se versiona.

## Caracteristicas

- Flujo offline-first con almacenamiento local.
- Motor de reglas con dependencias AND, OR y NOT.
- Tablero ejecutivo, semaforos por area y modo de reunion.
- Editor de estandares, etapas, areas y preguntas.
- Mapas de decision en diagrama y en roadmap vertical.
- Importacion y exportacion de datos mediante Excel.

## Estructura del Excel estandar

El archivo de importacion debe incluir estas hojas:

1. `Questions`: ID, Stage, Area, ItemType, Priority, Content, Description,
   ResponseType, AllowedValues, DependencyRules, LogicOperator y Deliverables.
2. `Stages`: name, order y active.
3. `Areas`: name, order, active y color.

## Desarrollo

Tecnologias: React, TypeScript, Vite y CSS nativo. La persistencia se realiza
en el navegador mediante almacenamiento local y migraciones de esquema.
