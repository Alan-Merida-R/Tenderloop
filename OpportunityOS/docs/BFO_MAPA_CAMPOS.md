# Mapa de campos bFO — confirmado

> Documentación. La app no lee este archivo. Sale del reconocimiento hecho en bFO
> el 2026-08-28 sobre una Op/SR reales, más el HTML pegado desde el DOM.

## Regla de oro de los selectores

bFO (Salesforce Lightning) marca cada campo con su **nombre de API**:

```
data-target-selection-name="sfdc:RecordField.<Objeto>.<CampoAPI>"
```

Ese es el ancla que usan las recetas. No cambia entre registros, ni si mueven el
campo de lugar, ni si renombran la etiqueta visible. **Nunca usar el `id`**: Lightning
regenera cosas como `input-9377` en cada carga.

Para leer el valor, dentro de ese contenedor:
`[data-output-element-id="output-field"]` (o `.test-id__field-value`).
Para entrar a edición: `button.test-id__inline-edit-trigger` (`title="Edit <Etiqueta>"`).

Prueba de regresión: `npm run check:bfo`

## Objetos y URLs

| Objeto | Forma de la URL | Prefijo de ID |
|---|---|---|
| Support Request | `/lightning/r/OPP_SupportRequest__c/{id}/view` | `a0T` |
| Opportunity | `/lightning/r/Opportunity/{id}/view` | `006` |
| Account | `/lightning/r/Account/{id}/view` | `001` |
| Opportunity Lines | `/lightning/r/Opportunity/{id}/related/Product_Line_2__r/view` | — |

## El punto de partida: SOLO se conoce la URL del SR

La única URL que la app tiene guardada es la del **SR**, que viene del correo. Todo lo
demás se deriva a partir de ella. Ninguna receta puede asumir que conoce la URL de la
Op, de la cuenta ni de las líneas.

La cadena completa:

```
URL del SR (única conocida, viene del correo)
      |
      v
  Abrir el SR
      |
      +--> El panel de arriba YA TRAE los dos enlaces, sin navegar:
      |      href de Opportunity  -> ID de la Op
      |      href de Account      -> ID de la cuenta
      |
      +--> Con el ID de la Op se CALCULA la URL de Opportunity Lines
             (URL de la Op + /related/Product_Line_2__r/view)
      |
      v
  Abrir la Opportunity  -> Amount, y el href de End User Account
      |
      v
  Abrir el Account      -> Address
```

Lo importante: **los IDs de la Op y de la cuenta se leen del propio SR**, del atributo
`href` de los enlaces del panel superior. No hace falta clic ni navegación para
obtenerlos — sólo para leer valores que viven en esas otras páginas.

> Cuidado: ese panel superior **trunca los valores mostrados** (aparecen como
> `EUR 1,517,...`). Los `href` no se truncan porque son atributos, pero cualquier
> **texto** de ese panel no es confiable: hay que leerlo de la página del objeto.

## Cadencia — qué se llena cuándo

| Cuándo | Campos | Páginas que abre |
|---|---|---|
| **Una sola vez** (primer autofill) | Dirección del cliente, URL de la Op, link de Opportunity Lines | SR → Opportunity → Account |
| **Cada sync** — app → bFO | Comentarios, Status, Expected Completion Date | SR |
| **Cada sync** — bFO → app | Amount, Won/Lost | Opportunity |

La navegación lenta (llegar hasta Account) ocurre una vez por oportunidad. El sync
recurrente sólo toca SR y Opportunity.

## LECTURA — de bFO hacia la app

| Dato app | Objeto | Etiqueta en bFO | Notas |
|---|---|---|---|
| `customerAddress` | Account | `Address` | Un solo campo. Se llega por **End User Account** desde la Op. |
| quick link `bfo` | Opportunity | — | La URL misma |
| Won / Lost | Opportunity | `Forecast Category` | Sólo lectura, sin lápiz. Ver sección aparte |
| `commercial.oppLinesLink` | — | — | Calculada (ver arriba) |
| Monto final | Opportunity | `Amount` | Formato `USD 1,733,104.35`. **No** usar el monto del panel del SR: sale truncado y en EUR |

En la Op **no existe** ningún campo de dirección. Sólo `Location` (texto libre tipo
"Ciudad, Estado"). La dirección real vive en el registro de Account.

## ESCRITURA — de la app hacia bFO

Todo esto vive en el **SR**. Al entrar a edición de un campo, **se habilitan todos**,
así que va un solo lápiz → llenar todo → un solo `Save`.

### Comments
- API: `sfdc:RecordField.OPP_SupportRequest__c.Comments__c` (por confirmar el nombre exacto)
- Control: `<textarea class="slds-textarea" maxlength="32000">` — **texto plano**
- Respeta saltos de línea en bFO (no en el correo que se genera)
- Estructura con línea marcadora: lo de arriba lo reescribe la app, lo de abajo nunca se toca

### Status
- API: `sfdc:RecordField.OPP_SupportRequest__c.Status__c`
- Control: desplegable. Lista completa:

```
--None--
New
Submitted
Accepted - Scheduled
Accepted - In Progress
Accepted - On Hold Back-Office
Accepted - On Hold Front-Office
Completed
Cancelled
Rejected
```

- Piden justificación: `Accepted - On Hold Back-Office`, `Accepted - On Hold Front-Office`,
  `Completed`, `Cancelled`, `Rejected`

### Resolution Comments (la justificación)
- Control: **editor de texto enriquecido** (barra con negritas, listas, links) — NO es
  un textarea. Se llena distinto: hay que escribir dentro del contenedor editable, no
  con un `fill()` normal.
- Contenido: el último comentario del History

### Expected Completion Date
- Etiqueta: `Expected Completion Date`
- Formato: **MM/DD/YYYY** (bFO muestra la ayuda `Format: 12/31/2024`)
- Es un input de texto con calendario opcional → **se escribe directo**, más confiable
  que navegar el calendario
- Ojo: `Expected Delivery Date` es OTRO campo, un desplegable de trimestres (`2026-Q4`).
  No es el que se actualiza.

## Equivalencia de status

| Status en la app | Status en bFO | ¿Justificación? |
|---|---|---|
| In Progress | `Accepted - In Progress` | No |
| On Hold | `Accepted - On Hold Back-Office` | Sí |
| Submitted | `Completed` | Sí |
| Won | `Completed` | Sí |
| Lost | `Completed` | Sí |
| Canceled | `Cancelled` | Sí |

Ojo con la ortografía: bFO usa `Cancelled` (dos eles) y la app usa `Canceled` (una).

### Regla: escribir sólo si cambia

Antes de escribir el status, se compara el valor que ya tiene bFO contra el destino.
**Si son iguales, no se toca nada.**

Eso resuelve solo el caso de Submitted / Won / Lost: los tres apuntan a `Completed`, así
que una vez que el SR quedó en `Completed`, moverse entre esos tres en la app ya no
vuelve a escribir en bFO. No hace falta ningún caso especial, sale de la regla general.

Además evita disparar la justificación (`Resolution Comments`) de a gratis cada vez.

## Quién manda cuando hay conflicto

| Dato | Fuente de la verdad | Dirección |
|---|---|---|
| Amount | **bFO** | bFO → app |
| Won / Lost | **bFO** | bFO → app |
| Comentarios, Status, Expected Completion Date | **la app** | app → bFO |

El won/lost lo decide bFO porque ahí lo cierra el vendedor, no el equipo de propuestas.
Todo lo demás lo manda la app.

## Won / Lost — campo `Forecast Category` (Opportunity)

La app lee de bFO si la oportunidad se ganó y lo refleja en su propio status.

- Objeto: **Opportunity**
- Etiqueta: `Forecast Category`
- API (por confirmar): `sfdc:RecordField.Opportunity.ForecastCategoryName`
- Valor habitual mientras está abierta: `Pipeline`
- Elemento propio: `<sfa-output-forecast-category data-output-element-id="output-field">`

### Es de SOLO LECTURA

En el HTML real este campo **no tiene botón de lápiz** (`test-id__inline-edit-trigger`),
a diferencia de Status o de las fechas. Salesforce lo calcula a partir de la etapa de
venta. Encaja perfecto con el diseño: este dato va **bFO → app** y nunca al revés.

Cubierto en `npm run check:bfo`, para garantizar que un campo sin botón de edición
también se extrae bien.

### Valores (confirmados)

| Forecast Category en bFO | Status en la app |
|---|---|
| `Won` | Won |
| `Omitted` | Lost |
| cualquier otro (`Pipeline`, `Best Case`, `Commit`, ...) | sigue abierta, la app no cambia nada |

## Comportamiento del entorno

- Sesión: expira alrededor de 1 hora
- Popup de "¿sigues ahí?": hay que cerrarlo
- Carga de pantalla: ~4 segundos
- Subvistas al pasar el mouse sobre Op/cuentas/personas: frágiles, se prefiere navegar
  a la página completa
- PingID: al entrar, y otra vez después de varias horas
