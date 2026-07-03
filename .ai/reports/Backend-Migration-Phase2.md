# Backend Migration - Phase 2

Fecha: 2026-07-03

## Objetivo

Iniciar la fase 2 de la migracion a backend local: agregar un data plane `/api/db/*` para operar la base JSON desde Express, sin cortar todavia el frontend actual basado en File System Access API.

## Estado

Implementado y verificado end-to-end.

## Cambios

- `server/db/repository.ts`: repositorio de BD JSON con open/create/current/save/backup/close.
- `server/routes/db.ts`: rutas Express `/api/db/status`, `/api/db/current`, `/api/db/open`, `/api/db/create`, `/api/db/backup`, `/api/db/close`.
- `server/index.ts`: montaje de `/api/db` y health check conectado al estado real del repositorio.
- `services/backendDb.ts`: cliente frontend para `/api/db`.
- `App.tsx`: carga automatica desde backend, importacion de JSON existente al backend, creacion de BD backend por defecto y autosave por API.
- `server/config.ts`: ruta por defecto `%APPDATA%/TenderLoop/tendering_db.json`.

## Garantias tecnicas

- Validacion minima de estructura: `meta` presente y `opportunities` como arreglo.
- Guardado atomico por archivo temporal + rename.
- Control optimista de revision con respuesta 409 si el cliente guarda contra una revision vieja.
- Backup previo best-effort durante save: si el backup local falla, el guardado atomico continua.
- `/api/db/backup` explicito sigue reportando errores si el backup no se puede crear.
- Si el backend no esta disponible, el frontend conserva el flujo legacy de File System Access API.
- La app importa una BD JSON existente al backend cuando el usuario usa `Import JSON`.
- El autosave frontend usa revision optimista del backend para evitar pisar cambios concurrentes.
- El autosave backend serializa con Web Worker, igual que el guardado legacy, para no congelar la UI con bases grandes.
- `PUT /api/db/current?compact=1` devuelve solo estado/revision, no toda la BD, para reducir parseo y trafico en autosave.
- Las pestañas sincronizan la revision backend con BroadcastChannel (`BACKEND_REVISION`) para evitar conflictos 409 falsos tras cambios remotos.
- Bases legacy sin `meta` se normalizan en backend con defaults antes de guardar/importar.

## Verificacion

- `npm.cmd run check:server`: OK.
- `node .\node_modules\vite\bin\vite.js build`: OK, con advertencia preexistente de chunks grandes.
- Smoke test en puerto 3101:
  - `POST /api/db/create`: OK, revision 1.
  - `GET /api/db/current`: OK.
  - `PUT /api/db/current` con `expectedRevision=1`: OK, revision 2.
  - Segundo `PUT` con revision vieja: 409 esperado.
- Smoke test de DB por defecto con `APPDATA` temporal:
  - `GET /api/db/default` antes de crear: 404 esperado.
  - `POST /api/db/default`: OK, crea `tendering_db.json`.
  - `PUT /api/db/current`: OK, revision 2.
  - `POST /api/db/import`: OK.
- `npx.cmd tsc --noEmit`: OK.
- Smoke test legacy:
  - `POST /api/db/import` con DB sin `meta`: OK, normaliza a version 1.9.
  - `PUT /api/db/current?compact=1`: OK, devuelve revision sin `data`.
- Runtime local:
  - `http://127.0.0.1:3099/api/health`: OK, reporta campo `db`.
  - `http://127.0.0.1:3000`: OK.

## Siguiente fase recomendada

Siguiente paso recomendado: pruebas manuales en la app real tras reiniciar TenderLoop para confirmar importacion de una BD existente, creacion de BD backend y autosave de una oportunidad editada.
