# Testing — Tender Control

## Estado actual

El proyecto **no tiene framework de testing configurado**: no hay Jest, Vitest ni
Cypress en `package.json`. La validacion se apoya en comprobaciones ejecutables y
en verificacion manual del flujo afectado.

## Comprobaciones disponibles

Ejecutalas desde `OpportunityOS/`:

```powershell
npm run build
npm run check:server
npm run check:folder
```

| Comando | Que valida |
| --- | --- |
| `npm run build` | Que el frontend compila (tipos incluidos) y que el bundle se genera. |
| `npm run check:server` | Tipos del servicio local (`tsc -p server --noEmit`). |
| `npm run check:folder` | Reglas de persistencia del modulo de carpetas (`scripts/verify-folder-persistence.ts`). |

Y desde `TenderFlow/`:

```powershell
npm run build
```

## `check:folder`

`scripts/verify-folder-persistence.ts` no usa un runner: son aserciones planas
(`node:assert/strict`) contra funciones puras mas un bridge simulado. Cubre el
comportamiento que se rompio y se reporto en uso real:

- un vinculo de carpeta debe sobrevivir a una nueva revision y a otro navegador;
- los pines de acceso rapido no deben perderse;
- un adjunto debe seguir a un renombrado, volver tras una restauracion y no
  borrarse solo porque el archivo desaparecio;
- la recuperacion de rutas heredadas es aditiva y nunca pisa una ruta mas
  reciente ya guardada en la base de datos.

Cuando corrijas un error de persistencia, agrega aqui el caso que lo reproducia
antes de darlo por cerrado. Es el unico punto del proyecto donde una regresion
queda protegida de forma automatica.

## Buscar codigo muerto

El proyecto no tiene ESLint, pero `tsc` reporta declaraciones sin usar bajo
demanda sin necesidad de cambiar `tsconfig.json`:

```powershell
npx tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters
```

Los resultados (`TS6133`) no son todos accionables. Antes de borrar:

- **Los parametros sin usar no se tocan.** Quitar uno cambia la firma y desplaza
  los argumentos posicionales de quien la llama, en silencio.
- **Un par `useState` con una mitad viva se queda.** Solo se elimina cuando ni el
  valor ni el setter se usan.

Para archivos completos, la unica prueba valida es recorrer el grafo real de
imports desde `src/index.tsx`. Una busqueda de texto no basta, y hay dos falsos
positivos permanentes que **no** deben borrarse:

- `src/ambient.d.ts` — un `.d.ts` lo carga `tsconfig`, nadie lo importa.
- `src/services/save.worker.ts` — se carga con `new Worker(new URL(...))`, que no
  es una declaracion de import.

Despues de borrar, repite el ciclo: quitar una declaracion suele dejar huerfano
el estado o los imports que solo ella usaba.

## Verificacion manual

Para lo que no cubren esas comprobaciones, prueba el flujo completo en la
aplicacion real (`OPEN_OPPORTUNITYOS.vbs`), no solo el componente modificado:

- **Persistencia:** haz el cambio, cierra la app y vuelve a abrirla. El
  autoguardado es diferido, asi que un cambio que "se ve bien" puede no haber
  llegado al disco.
- **Doble montaje del expediente:** `OpportunityDetail` se renderiza en la vista
  dividida y en la pantalla completa. Comprueba las dos.
- **Base de datos con datos previos:** los campos nuevos pasan por migracion.
  Abre una base creada con una version anterior, no solo una recien creada.
- **Automatizacion web:** requiere una sesion corporativa iniciada a mano y VPN.
  Verifica primero `GET /api/health` y `GET /api/web/status`.

## Agregar testing formal (recomendado a futuro)

```powershell
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```

Y en `vite.config.ts`:

```ts
test: { environment: 'jsdom' }
```

---

*Este documento se actualiza cuando cambia la estrategia de testing.*
