# Handoff - Mejora de ligar correos a TenderLoop

Fecha: 2026-06-17
Estado: PAUSADO por solicitud del usuario antes de terminar.

## Solicitud del usuario

Implementar una mejora para ligar correos de Outlook a TenderLoop:

- El usuario usa Outlook nuevo corporativo.
- No tiene permisos corporativos para Microsoft Graph actualmente.
- Quiere implementar la experiencia como si los permisos existieran, para validar si el diseño esta bien.
- Quiere leer carpetas completas en el futuro, seleccionadas manualmente por oportunidad.
- Quiere trabajar por conversaciones completas, no por correos sueltos.
- Quiere poder organizar conversaciones en TenderLoop con:
  - carpetas fantasma que NO afecten Outlook,
  - etiquetas,
  - orden manual.
- Quiere ligar conversaciones a notas y tareas.
- En notas, al ligar un correo/conversacion, debe insertarse una referencia visible.
- Si el feature esta apagado, no debe aparecer nada relacionado con emails.
- Default: feature apagado.
- Si se apaga despues de usarlo, NO se borra data; solo se oculta/pausa.

## Decision tecnica tomada

Se empezo una implementacion en dos capas:

1. Feature flag global en Settings:
   - `emailIntegrationEnabled?: boolean`
   - Default `false`
   - Persistido en `TenderLoop_Settings_V1`
   - `App.tsx` ahora carga settings con merge superficial:
     `setAppSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) })`

2. Modelo local por oportunidad:
   - `Opportunity.emails?: OpportunityEmailsData`
   - Conversaciones completas (`EmailConversation`)
   - Mensajes dentro de conversacion (`EmailMessage`)
   - Carpetas fantasma (`EmailGhostFolder`)
   - Labels (`EmailLabel`)
   - Vinculos por IDs:
     - conversation `linkedTaskIds`, `linkedNoteIds`
     - task `linkedEmailConversationIds`
     - note `linkedEmailConversationIds`

## Archivos modificados hasta ahora

### `types.ts`

Agregado:

- `Task.linkedEmailConversationIds?: string[]`
- `MeetingNote.linkedEmailConversationIds?: string[]`
- `Opportunity.emails?: OpportunityEmailsData`
- Interfaces nuevas:
  - `EmailLabel`
  - `EmailGhostFolder`
  - `EmailMessage`
  - `EmailConversation`
  - `OpportunityEmailsData`

### `components/SettingsModal.tsx`

Agregado:

- Import de `Mail` desde `lucide-react`.
- Campo en `AppSettings`:
  - `emailIntegrationEnabled?: boolean`
- Default:
  - `emailIntegrationEnabled: false`
- En tab `General`, nuevo bloque "Outlook Emails" con toggle.
- El texto indica que si esta desactivado, emails quedan guardados pero ocultos/pausados.

### `App.tsx`

Agregado:

- Merge de settings guardados con defaults, para settings viejos:
  - `setAppSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) })`
- Paso de prop a `OpportunityDetail`:
  - `emailIntegrationEnabled={appSettings.emailIntegrationEnabled || false}`
- Se agrego en:
  - render de split/subview
  - render principal del expediente

Nota: `App.tsx` ya traia cambios previos de esta conversacion, no revertirlos.

### `components/OpportunityDetail.tsx`

Agregado parcialmente:

- Import de tipos nuevos:
  - `EmailConversation`
  - `EmailGhostFolder`
  - `EmailLabel`
  - `OpportunityEmailsData`
- Import de iconos:
  - `Mail`
  - `Inbox`
- Prop nueva:
  - `emailIntegrationEnabled?: boolean`
- Nuevo tipo:
  - `OpportunityDetailTab = ... | 'emails'`
- Guard:
  - Si el feature esta apagado y activeTab es `emails`, vuelve a `overview`.
- Helper:
  - `createEmptyEmailsData()`
- Estados UI:
  - `selectedEmailFolderId`
  - `selectedEmailConversationId`
  - `showEmailLinkPicker`
  - `showOutlookSelector`
- Helpers de email:
  - `emailsData`
  - `emailConversations`
  - `selectedEmailConversation`
  - `updateEmailsData`
  - `addEmailGhostFolder`
  - `addEmailLabel`
  - `addLocalEmailConversation`
  - `updateEmailConversation`
  - `moveEmailConversation`
  - `toggleEmailLabel`
  - `openEmailConversation`
  - `linkEmailConversationToTarget`
  - `getLinkedEmailConversations`
  - `renderLinkedEmailsForTarget`
- Tab button `Emails` condicionado por `emailIntegrationEnabled`.
- Vista `activeTab === 'emails' && emailIntegrationEnabled` agregada:
  - Sidebar de carpetas fantasma.
  - Labels.
  - Boton `Select Email`.
  - Boton `Add Conversation`.
  - Lista de conversaciones con orden manual.
  - Panel detalle con summary, mensajes, folder, labels, linked tasks, linked notes.
- Modales agregados:
  - `showEmailLinkPicker`
  - `showOutlookSelector`

## Punto exacto donde se pauso

El usuario pidio documentar antes de continuar. NO se compilo despues de los cambios de email.

Antes de seguir, hay que:

1. Correr build y corregir errores TypeScript.
2. Revisar si hay props/handlers con tipos incorrectos en `showEmailLinkPicker`.
3. Confirmar que `renderLinkedEmailsForTarget` aparece en:
   - modal normal de tarea,
   - task subview si aplica,
   - notas.
4. Agregar `emails: createEmptyEmailsData()` donde se crea nueva oportunidad en `App.tsx`.
5. Agregar `emails: createEmptyEmailsData()` al reset de revision limpia en `OpportunityDetail.tsx`.
6. Revisar si `DocumentPickerModal` usa `getFolderHandle(opportunityId)` legacy en vez de per-revision; NO tocar salvo que el usuario lo pida.
7. Revisar que si `emailIntegrationEnabled` esta false:
   - no aparece tab Emails,
   - no aparece Linked Emails,
   - no aparece modal de emails,
   - no se ejecutan llamadas de Outlook.

## Riesgos conocidos

- Todavia no existe conector real Microsoft Graph.
- El boton `Select Email` abre un modal placeholder y permite crear una conversacion local para validar UI.
- `openEmailConversation` abre `webLink` si existe; si no existe, muestra alert.
- Como el usuario no tiene permisos de Graph, esta fase debe quedarse como UI/modelo preparado.
- No se ha agregado servicio `outlookConnector.ts`; probablemente conviene hacerlo despues, como capa separada con metodos stub:
  - `listFolders`
  - `listConversations`
  - `listMessagesByConversation`
  - `openConversation`

## Recomendacion para continuar

Cuando el usuario diga "continua con ligar correos":

1. NO volver a preguntar diseno salvo que cambie requisitos.
2. Primero correr:
   `node .\node_modules\vite\bin\vite.js build`
3. Corregir errores.
4. Completar defaults:
   - nueva oportunidad,
   - revision limpia.
5. Mejorar `showOutlookSelector`:
   - mantener placeholder sin Graph,
   - dejar interfaz lista para carpetas/conversaciones.
6. Agregar una capa separada `services/outlookConnector.ts` con stubs tipados.
7. Compilar de nuevo.
8. Responder al usuario con estado claro.

## Comando de validacion esperado

```powershell
node .\node_modules\vite\bin\vite.js build
```

Build NO corrido despues de esta documentacion.
