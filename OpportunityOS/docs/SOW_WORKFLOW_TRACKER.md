# SOW Workflow Tracker

Documento vivo para definir el flujo del SOW desde la recepción del SR, registrar variantes y convertir cada decisión en preguntas condicionales dentro de OpportunityOS.

> Estado general: pausado por decisión del usuario. Retomar después de terminar y validar los arreglos funcionales de OpportunityOS.

## Método

Para cada paso se documentará:

1. Qué información entra.
2. Qué decisión se toma.
3. Qué puede pasar después.
4. Qué rutas alternativas existen.
5. Qué preguntas debe mostrar el SOW.
6. De qué tecnología u otra respuesta depende cada pregunta.

## Estado de la definición

| Paso | Tema | Estado | Pendiente |
|---|---|---|---|
| 1 | Recepción del SR | Definido | — |
| 2 | Clasificación de oportunidad | Pausado | Confirmar los tipos de propuesta disponibles y si se puede elegir más de uno |
| 3 | Plataforma o tecnología | Parcial | Definir ramas para Foxboro, Triconex, Modicon, AVEVA, Cyber y otras |
| 4 | Alcance técnico | Pendiente | Recorrer cada ruta paso a paso |
| 5 | Servicios, pruebas y sitio | Pendiente | Recorrer cada ruta paso a paso |
| 6 | Entregables y cierre | Pendiente | Recorrer cada ruta paso a paso |

## Flujo base conocido

```text
SR ya creado y asignado en BFO (entrada obligatoria)
  -> llega correo de aviso de la asignación
  -> reconocer BFO + correo como la misma oportunidad
  -> importar primero el correo en OpportunityOS
  -> abrir desde el correo el enlace del SR
  -> desde el SR navegar a la OP en BFO
  -> guardar en OpportunityOS la URL de la OP en el campo BFO
  -> consultar en BFO la ubicación/dirección del cliente
  -> guardar la ubicación del cliente en OpportunityOS
  -> definir el tipo de propuesta
  -> definir la tecnología o tecnologías
  -> abrir únicamente las ramas aplicables
  -> definir hardware, software, servicios y responsabilidades
  -> validar pruebas, sitio, capacitación y entregables
  -> revisar faltantes
  -> cerrar borrador del SOW
```

## Rama Upgrade — requisitos confirmados

- Preguntar cuántos sistemas se actualizarán y cuáles son (T002 existente).
- Preguntar qué software se actualizará.
- Preguntar cuál es la versión anterior.
- Las preguntas específicas deben depender de la tecnología seleccionada.
- No abrir la rama de Modernization solamente por seleccionar Upgrade.
- No repetir la pregunta de arquitectura T007.
- Pendiente de aclaración: significado y opciones de “qué se va a regresar”.

## Registro de decisiones

| Fecha | Decisión |
|---|---|
| 2026-07-31 | Stakeholders del SOW debe mostrar únicamente personas involucradas en la oportunidad. |
| 2026-07-31 | Las áreas del contacto se copian como roles al involucrarlo en una oportunidad. |
| 2026-07-31 | Upgrade y Modernization son ramas independientes. |
| 2026-07-31 | Las respuestas tipo link pueden agregarse a Quick Links desde el SOW. |
| 2026-07-31 | T001 duplicada y T007 se retiran de la vista estándar. |
| 2026-07-31 | Toda oportunidad inicia con un SR previamente creado; no existe una ruta sin SR. |
| 2026-07-31 | El SR se asigna en BFO, que es la fuente en línea, y después llega un correo de aviso. Ambos representan la misma entrada del flujo. |
| 2026-07-31 | El primer paso operativo es importar el correo en OpportunityOS. |
| 2026-07-31 | El enlace del SR incluido en el correo se usa para navegar a la OP; la URL de esa OP se guarda en el campo BFO del expediente. |
| 2026-07-31 | Después de guardar la URL de BFO se consulta y registra la ubicación del cliente. |
| 2026-07-31 | Después de completar la ubicación se define primero el tipo de propuesta y la tecnología; ambas respuestas controlan las ramas del SOW. |

## Próxima pregunta

### Paso 1 — SR

¿Cuáles son todos los tipos de propuesta que utilizas? Actualmente la app contempla Greenfield, Modernization, Migration, Upgrade, Expansion y Services Only. Indícame cuáles aplican, cuáles faltan y si una oportunidad puede tener más de un tipo.
