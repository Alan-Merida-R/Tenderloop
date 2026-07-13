# Módulo de correos de Outlook — Estado de implementación

**Fecha:** 2026-07-11 · **Rama:** `nueva-aplicacion-con-back-end` · **Plan aprobado:** `C:\Users\Alan Merida\.claude\plans\lovely-chasing-kahan.md`

## Objetivo
Generar **borradores de Outlook** (clásico Y nuevo, nunca envío automático) desde el expediente: 6 tipos de correo + plantillas custom del usuario, autollenado desde la Opportunity, To/CC/BCC desde stakeholders, adjuntos desde Folder, vista previa editable, validaciones, registro en historial.

## Estado: IMPLEMENTACIÓN COMPLETA — verificación parcial

`npx tsc --noEmit` limpio (solo queda 1 error PREEXISTENTE ajeno: `components/ProcessRadialWidget.tsx(287)` prop `key`).

### Archivos NUEVOS (todos completos)
| Archivo | Qué contiene |
|---|---|
| `services/emailTemplates.ts` | `EmailTemplate`, `EmailComposeSettings`, catálogo `EMAIL_VARIABLES` + `variablesForKind()`, `DEFAULT_EMAIL_TEMPLATES` (6 tipos), `DEFAULT_SUBJECT_FORMAT='({topic}) - {fullOpportunityName}'`, `resolveTemplates()` (built-ins + overrides + customs), `mergeEmailComposeSettings()` |
| `services/emailComposer.ts` | Motor puro: `buildEmailContext()` (todas las variables), `renderTemplate()` (marca `{var}` desconocidas), `buildEmailDraft()`, `validateComposedEmail()`, clasificación de tareas (blocked = On Hold/Missing Info/deps sin cumplir), `resolveTeamMemberRecipients()` (ids `person.id` \| `GlobalContact.id` \| legacy `"name\|area"`), `resolveQuickLinkUrls()` (links objeto legacy Y array) |
| `services/emailDraftService.ts` | Cliente `composeOutlookDraft()` → POST `http://127.0.0.1:3099/api/os/compose-email`. `ComposeEmailResponse` es interface plana (ok/openedWith/error/missingAttachments) porque el tsconfig NO es strict y la unión discriminada no hace narrowing |
| `server/os/outlookCompose.ts` | `composeViaCom` (PowerShell COM, HTML en base64, `.Display()`, marcador `TL_COMPOSE_OK`), `buildEmlContent` (MIME multipart, `X-Unsent: 1`, base64), `composeViaEml` (escribe en `%TEMP%\tenderloop-emails\` + `openNative`), `composeEmail(payload, mode)` auto con fallback COM→eml y caché `lastWorkingMode`, `findMissingAttachments()` |
| `components/EmailComposeModal.tsx` | Modal 2 columnas: selector de plantilla (chips), `RecipientField` To/CC/BCC (typeahead stakeholders+directorio+email libre), selector de tareas (checkbox; badge "Assig." si `isAssignment`/approvers), campos manuales por tipo (reviewPoints/infoNeededBullets/deliverable/paCost), `FolderPicker` (File System Access API, navegación + filtro + docType de `opportunityDocMetaStore`), preview `contentEditable` con Reset, validación en footer, botón "Open draft in Outlook" |

### Archivos MODIFICADOS
- **`types.ts`**: `Commercial.paCost?`, `Task.deliverable?`, `OpportunityEmailsData.generatedEmails?`, `GeneratedEmailKind` (6 tipos + `'custom'`), `GeneratedEmailRecord`.
- **`server/routes/os.ts`**: `POST /compose-email` (valida to/subject, 400 con `missingAttachments` si falta un adjunto). VERIFICADO: devuelve 400 con adjunto inexistente.
- **`components/SettingsModal.tsx`**: `AppSettings.emailCompose?`, tab nueva **"Emails"** (`activeTab === 'emailTemplates'`): formato de asunto global, formato fullName, modo Outlook (auto/com/eml), gestor de plantillas (editar cualquiera, **+ Add template** custom, Duplicate, Delete customs, Reset to default built-ins, dropdown Insert variable con descripciones, preview). Helpers: `emailCfg`, `effectiveEmailTemplates`, `upsertEmailTemplate`, `patchSelectedEmailTemplate`, `resetOrDeleteEmailTemplate`, `addCustomEmailTemplate`, `duplicateEmailTemplate`, `insertEmailVariable` (+ estados `emailTplSelectedId`, `emailBodyRef`).
- **`components/OpportunityDetail.tsx`**:
  - Import de `EmailComposeModal`, `mergeEmailComposeSettings`, `GeneratedEmailRecord`.
  - Prop nueva `emailComposeSettings` (viene de `appSettings.emailCompose`).
  - Junto a `updateEmailsData`: `mergedEmailComposeSettings`, `emailComposeState`, `openEmailCompose(templateId?, taskIds?)`, `handleEmailGenerated(record)` → **update combinado único** de `emails.generatedEmails` + entrada en `history` (`setLocalOpp` + `onUpdate(updated, id, true)`), evita carrera del debounce.
  - Botón **"Email"** en header del expediente (junto a Principal Status, oculto en snapshots; NO depende de `emailIntegrationEnabled`).
  - Botón **"Remind"** (ámbar) en header de Tasks → abre reminder con tareas Pending/vencidas preseleccionadas.
  - Botón **"Email"** (azul) en los 2 modales de edición de tarea (junto a "Summary") → `task_assignment` con esa tarea.
  - Campo **Deliverable** en el grid de asignación de ambos modales de tarea.
  - Input **PA Cost** en tab Commercial (junto a CQA Target GM %).
  - Sección **"Generated Emails"** en la tab History (lista con tipo/asunto/destinatarios/adjuntos/fecha + botón re-abrir que re-lanza `composeOutlookDraft` con el snapshot). NOTA: se puso en History (siempre visible) en vez de la tab Emails porque esa tab sigue tras el flag `emailIntegrationEnabled` (default false).
  - Render del `<EmailComposeModal>` junto a `ImportSrEmailModal`.
- **`App.tsx`**: pasa `emailComposeSettings={appSettings.emailCompose || null}` en los 2 montajes de OpportunityDetail (junto a `userName`).

## Verificación
- [x] `npx tsc --noEmit` limpio (solo error preexistente de ProcessRadialWidget, ajeno a este módulo).
- [x] Endpoint 400 con adjunto inexistente (probado contra instancia en puerto 3098 con `TENDERLOOP_OPEN_PORT=3098`).
- [x] Compose modo `eml`: respuesta `{"ok":true,"openedWith":"eml"}`; `.eml` inspeccionado en `%TEMP%\tenderloop-emails\` — `X-Unsent: 1`, asunto UTF-8 con acentos vía `=?UTF-8?B?...?=`, cuerpo HTML base64, adjunto real embebido correctamente.
- [x] Compose modo `com`: respuesta `{"ok":true,"openedWith":"com"}` contra Outlook clásico instalado en la máquina — el script PowerShell con COM `.Display()` confirmó vía el marcador `TL_COMPOSE_OK`.
- [x] Instancia de prueba (puerto 3098) detenida limpiamente al terminar, puerto liberado.
- [ ] PENDIENTE (requiere sesión interactiva con UI): flujo completo en la app — generar cada uno de los 6 tipos desde el botón "Email" del expediente y desde una tarea, confirmar que Outlook abre el borrador con destinatarios/asunto/cuerpo/adjuntos correctos, verificar que el registro aparece en "Generated Emails" (tab History) y persiste tras recargar, y probar una plantilla custom creada en Settings → Emails.
- [ ] PENDIENTE: **reiniciar el motor** (`motor_tenderloop.bat` o el proceso `tsx server/index.ts` en 3099) para que el servidor activo cargue la nueva ruta `/compose-email` — el que corre ahora es anterior a estos cambios y tsx no hace hot-reload.

## Ronda 2 de cambios (2026-07-12) — feedback del usuario tras primer uso

El usuario reportó "Not found" al abrir el draft (servidor viejo sin reiniciar — resuelto pidiéndole reiniciar con CERRAR_TENDERLOOP.bat) y pidió ajustes de contenido:

1. **Saludo dinámico** (`buildGreeting` en `emailComposer.ts`): 1 destinatario en To → "Hello {FirstName}, I hope you're doing well."; 2 → "Hello {A} and {B}, ..."; 3+ → "Hello team,". Solo cuenta el campo To (CC no afecta). Nueva variable `{greeting}` usada en las 6 plantillas en vez de "Hello," fijo. **Nota: implementado en inglés** para mantener consistencia con el resto de las plantillas (todas en inglés) — el usuario escribió el ejemplo en español ("Hola alan...") pero no se le preguntó explícitamente el idioma; avisar si lo quiere en español.
2. **Bug de asunto duplicado — CORREGIDO**: `DEFAULT_FULLNAME_FORMAT` era `'{opId} - {customer} - {projectTitle}'`, pero `opp.title` ya sigue la convención "OP-xxxx - SR - Proyecto - Cliente", causando duplicados. Cambiado a `'{projectTitle}'` únicamente. Verificado con script de prueba: asunto ya no se repite.
3. **Status Report simplificado**: nuevas funciones `getLastPendingTask` (mayor `order` entre no-Done/no-Canceled/no-Missing Info) y `getMissingInfoTasks`; nueva variable `{lastPendingTaskList}`; `missingInfoTasksList` ahora usa `taskListHtmlNoStage` (sin badge de status, con descripción de la tarea si existe). Plantilla default: quitado "Completed" y "Blocked", queda "Next task" + "Waiting on information" + último comentario de history. Variables antiguas (`tasksCompletedList`, `tasksBlockedList`, etc.) siguen calculadas y disponibles para plantillas custom, solo no están en el body default.
4. **Price Approval reescrito**: nuevo `buildExecutiveSummaryHtml()` que replica exactamente el formato de "Copy Summary" (`generateExecutiveSummary` en OpportunityDetail.tsx:4634) — Requested/Expected dates, Executive Notes, Commercial Information (CQA Sell Price, GM CCO, Notes/Discounts, **PA Cost** agregado), Required Links (SR Link + CQA 2.0 Link). Nueva variable `{executiveSummaryBlock}`. Se quitó `{totalCost}`/`{totalSellPrice}` del body default (las variables siguen existiendo para customs). Verificado con script de prueba: coincide con el ejemplo pegado por el usuario.
5. **Proposal Approval — nuevas funciones**:
   - Toggle Draft/Final revision (`manual.revisionType`) → variable `{revisionNotice}` con tono distinto (draft: "please share feedback/questions"; final: "I'll remain attentive... if no further changes, I will proceed to close the SR").
   - Campo manual vacío "What changed in this version" (`manual.changeNotes` → `{changeNotes}`), NO se autocompleta (decisión confirmada con el usuario).
   - Checkbox "Also include price approval in this email" (`manual.includePriceApproval`) + input manual "Seller / CSE to tag" (`manual.sellerName`, con datalist sugiriendo `opp.seller` y stakeholders) → variable `{priceApprovalBlock}` que antepone `@{sellerName}` y reutiliza `buildExecutiveSummaryHtml`.
6. **Task Assignment**:
   - El selector de tareas ahora solo lista tareas con `isAssignment` o `approverTeamMemberIds` (además siempre incluye la tarea preseleccionada aunque no cumpla, para no desaparecer cuando se abre desde esa tarea directamente).
   - Badge **"✓ Informed"** calculado de `emailsData.generatedEmails` (kind `task_assignment` + `relatedTaskIds`) — visible en: tarjeta de tarea (lista), modal de edición de tarea, y selector de tareas dentro del compositor.
   - Botón **"Remind"** (ámbar) por tarea individual en la tarjeta de tarea Y en el modal de edición — abre el compositor en modo `reminder` preseleccionando solo esa tarea (distinto del botón "Remind" global del header que junta todas las pendientes/vencidas).
   - El precargado de destinatario (To = responsable de la tarea) ya existía y sigue funcionando vía `resolveTaskResponsibleRecipients`.

### Verificación de la ronda 2
- Script temporal (`_scratch_test_email.ts`, ya eliminado) ejecutado con `npx tsx` contra una Opportunity de prueba con título tipo "OP-xxx - SR - Proyecto - Cliente": confirmé asunto sin duplicar, saludo correcto para 1/2/3 destinatarios, Status Report solo con "Next task" + "Waiting on information" (sin completadas, sin stage, con descripción), y Price Approval con el formato exacto del Copy Summary sin total cost.
- `npx tsc --noEmit`: limpio (solo el error preexistente ajeno de `ProcessRadialWidget.tsx`).
- Servidor de prueba en puerto 3098 usado y detenido correctamente al terminar.
- PENDIENTE: probar en la UI real (requiere que el usuario reinicie `CERRAR_TENDERLOOP.bat` + relanzar) los 6 tipos de correo, el toggle draft/final, el checkbox de price-approval-en-proposal, y los botones Remind/Informed en las tarjetas de tarea.

## ⚠️ IMPORTANTE para que funcione en producción
El servidor activo en el puerto 3099 se lanzó ANTES de estos cambios → **NO tiene la ruta `/compose-email`**. Hay que **reiniciar el motor** (cerrar y relanzar `motor_tenderloop.bat`, o el proceso `tsx server/index.ts`) para que el botón Email funcione. tsx no hace hot-reload.

Instancia de prueba: proceso background en puerto 3098 (task id `b2zrv9h4f`) — matar al terminar (`Get-Process | Where-Object {...tsx...}` o dejar que muera con la sesión).

## Decisiones clave (por si hay dudas al retomar)
- Outlook nuevo (olk.exe) no soporta COM → modo `auto` intenta COM y cae a `.eml` con `X-Unsent: 1` (borrador editable en ambos Outlooks). BCC no fiable en .eml → warning en el modal.
- HTML siempre viaja en **base64** hacia PowerShell (evita quoting).
- Plantillas: en settings solo se guardan **overrides + customs** (`resolveTemplates` mezcla con defaults en runtime); built-ins se identifican por `id === kind`.
- "Bloqueadas" = `On Hold` | `Missing Info` | dependencias sin `Done`.
- `{paCost}`: usa `Commercial.paCost` y si está vacío, campo manual en el modal.
- Persistencia: NUNCA `saveBackendDb` directo; todo vía `handleFieldChange`/update combinado → autosave de App.tsx.
