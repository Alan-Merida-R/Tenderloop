# Reconocimiento de bFO — guía para llenar en la computadora del trabajo

> **Este archivo no lo usa la aplicación.** Es solo una guía para ti. Llénalo en la
> compu del trabajo, regrésamelo, y con eso construyo el botón de sync.

---

## Cómo usar este archivo

Ábrelo en la compu del trabajo, ten bFO abierto al lado, y ve llenando los espacios
que dicen `➜ RESPUESTA:`. No tienes que contestar todo de un jalón — lo que llenes
sirve. Lo que no sepas, déjalo y escribe "no sé".

## Reglas importantes

1. **No escribas datos reales de clientes.** No necesito la dirección de nadie ni
   montos reales. Necesito **cómo se llama el campo** y **dónde está**, no qué dice.
   - ❌ `Dirección: Av. Reforma 123, CDMX`
   - ✅ `El campo se llama "Billing Address" y está en la pestaña Details de la cuenta`
2. **Las URLs, córtalas.** Reemplaza la parte del ID por `{id}`.
   - ✅ `https://xxx.lightning.force.com/lightning/r/Opportunity/{id}/view`
3. **Copia los textos exactos.** Si el botón dice `Edit`, escribe `Edit`, no "editar".
   Las mayúsculas y los espacios importan — de ahí salen los selectores.
4. **Los screenshots ayudan mucho.** Si puedes, recorta solo la zona del campo (sin
   datos del cliente) y guárdalos junto a este archivo.

## Antes de empezar

- [ ] Conéctate a la VPN
- [ ] Entra a bFO y pasa PingID como siempre
- [ ] Abre **una oportunidad cualquiera** que ya tenga datos, para usarla de ejemplo

➜ **RESPUESTA — ¿Cómo se ve la URL de una oportunidad?** (con `{id}`)
```
```

➜ **RESPUESTA — ¿Cuántas veces te pidió PingID?** (al entrar / cada cuánto vuelve a pedir)
```
```

---

# PARTE A — Lo que la app va a LEER de bFO

## A1. Dirección del cliente

**Qué necesito:** el camino de clics desde la oportunidad hasta donde se ve la dirección.

1. Desde la oportunidad abierta, ¿qué le picas para llegar a la dirección?
   Anota **cada** clic en orden, con el texto exacto del botón/pestaña.

➜ **RESPUESTA — Camino de clics:**
```
1. Clic en "..."
2. Clic en "..."
3. ...
```

➜ **RESPUESTA — ¿Cómo se llama exactamente la etiqueta del campo?**
(ej. `Billing Address`, `Shipping Address`, `Dirección`)
```
```

➜ **RESPUESTA — ¿La dirección viene en un solo campo o en varios?**
(calle / ciudad / estado / CP por separado, o todo junto)
```
```

➜ **RESPUESTA — ¿Se abre una ventana nueva o cambia la URL?** Si cambia, anótala con `{id}`
```
```

## A2. URL de la Op

➜ **RESPUESTA — ¿La URL de la oportunidad es la misma que ya tienes en el correo del SR,
o es distinta?** Si es distinta, ¿de dónde la sacas?
```
```

## A3. Opportunity Lines

1. Desde la oportunidad, ¿cómo llegas a las Opportunity Lines?

➜ **RESPUESTA — Camino de clics:**
```
1. Clic en "..."
2. ...
```

➜ **RESPUESTA — ¿Tiene URL propia?** (con `{id}`) — esta es la que se va a guardar en Comercial
```
```

➜ **RESPUESTA — ¿Las líneas se ven como tabla?** ¿Cómo se llaman las columnas?
(solo los nombres de las columnas, no los datos)
```
```

➜ **RESPUESTA — ¿Hay que darle "ver más" o paginar para verlas todas?**
```
```

## A4. Monto comercial final

➜ **RESPUESTA — ¿Cómo se llama la etiqueta del campo del monto final?**
(ej. `Amount`, `Total Amount`, `Net Amount`)
```
```

➜ **RESPUESTA — ¿En qué pantalla está?** (la misma de las líneas, o en otra)
```
```

➜ **RESPUESTA — ¿Cómo viene escrito?** (ej. `$1,234.56 USD` / `1234.56` / con moneda aparte)
```
```

---

# PARTE B — Lo que la app va a ESCRIBIR en bFO

> Todo lo de esta parte se va a hacer con confirmación tuya en pantalla antes de guardar.

## B1. Comentarios (el campo de texto plano)

1. Ve al SR en bFO, donde escribes tus comentarios.

➜ **RESPUESTA — Camino de clics para llegar al campo de comentarios:**
```
1. Clic en "..."
2. ...
```

➜ **RESPUESTA — ¿Cómo se llama la etiqueta del campo?** (ej. `Comments`, `Description`)
```
```

➜ **RESPUESTA — ¿Hay que darle a un botón "Edit" primero?** ¿Cómo dice exactamente?
```
```

➜ **RESPUESTA — ¿Cómo se guarda?** ¿Cómo dice el botón exactamente? (ej. `Save`)
```
```

➜ **RESPUESTA — ¿El campo respeta los saltos de línea?**
(escribe 3 renglones, guarda, y dime si se ven en 3 renglones o se juntan en uno)
```
```

➜ **RESPUESTA — ¿Tiene límite de caracteres?**
(si al pegar mucho texto te lo corta o te marca error, dime más o menos en cuánto)
```
```

### La línea marcadora

Así va a quedar el campo. Todo lo que está **arriba** de la línea lo borra y lo
reescribe la app en cada sync. Todo lo que está **abajo** no se toca nunca:

```
<aquí van tus eventos del History, se reescriben cada vez>

===== OpportunityOS ===== no borrar esta linea =====

<aquí quedan los comentarios originales del vendedor, intactos para siempre>
```

➜ **RESPUESTA — ¿Te parece bien ese texto de la línea marcadora, o prefieres otro?**
(que sea algo que nadie más vaya a escribir por accidente)
```
```

## B2. Status

1. Ve al SR en bFO, a la lista desplegable del status.

➜ **RESPUESTA — Camino de clics para llegar al desplegable:**
```
1. Clic en "..."
2. ...
```

➜ **RESPUESTA — ¿Cómo se llama la etiqueta del desplegable?** (ej. `Status`, `SR Status`)
```
```

➜ **RESPUESTA — La lista COMPLETA de opciones, copiadas tal cual:**
```
-
-
-
-
-
```

➜ **RESPUESTA — ¿CUÁLES de esas opciones te piden justificación?** Márcalas
```
```

➜ **RESPUESTA — Cuando pide justificación, ¿cómo se llama ese campo?**
¿Sale en una ventana nueva o en la misma pantalla?
```
```

> En esas, la app va a poner **el último comentario del History**, como pediste.

## B3. Fecha de entrega

➜ **RESPUESTA — ¿Cómo se llama la etiqueta del campo de fecha?**
(ej. `Expected Date`, `Delivery Date`)
```
```

➜ **RESPUESTA — ¿En qué formato la pide?** (`DD/MM/YYYY`, `MM/DD/YYYY`, ...)
```
```

➜ **RESPUESTA — ¿Se escribe a mano o hay que usar el calendarito?**
```
```

---

# PARTE C — Tabla de equivalencias de status

Del lado izquierdo van los estatus de la app; del derecho, cómo se llaman en bFO.
Usa los nombres exactos que copiaste en B2.

| Status en la app | Status en bFO | ¿Pide justificación? |
|---|---|---|
|  |  |  |
|  |  |  |
|  |  |  |
|  |  |  |
|  |  |  |

➜ **RESPUESTA — ¿Hay estatus de la app que NO existan en bFO** (o al revés)? ¿Cuáles?
```
```

---

# PARTE D — Preguntas sueltas

➜ **¿En algún momento bFO se abre dentro de un recuadro/marco** (como una página
dentro de otra página)? Se nota porque el scroll va por separado.
```
```

➜ **¿Cuánto tarda en cargar** una pantalla de bFO, más o menos? (2 seg / 10 seg / más)
```
```

➜ **¿Te saca la sesión sola** cada cierto tiempo? ¿Cada cuánto?
```
```

➜ **¿Hay algún aviso, pop-up o "aceptar" que salga seguido** y haya que cerrar?
```
```

---

# Anexo — el atajo automático (opcional)

Si en algún momento quieres ahorrarte llenar esto a mano, la app ya trae un
"probe" que captura solo la estructura de la pantalla (nombres de campos y
selectores, **sin datos**) y la guarda en tu disco. Te paso los pasos cuando
quieras. No es necesario para llenar este archivo.
