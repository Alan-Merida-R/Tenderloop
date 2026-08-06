# SOW / KOM Workspace

## Purpose

The SOW note is TenderLoop's guided workspace for KOMs and information-request meetings. It is not a Word generator. It helps capture answers, identify required unanswered questions, keep selected fields synchronized with the expediente, and create a `KOM` note containing the pending questions.

## Important files

Read these files before changing SOW behavior:

| File | Responsibility |
| --- | --- |
| `services/sowTemplate.html` | SOW UI, default Steps/questions, conditional logic, question designer, Overview, SOW-to-host messages. This is the main implementation. |
| `services/sowTemplate.ts` | Exposes the HTML template to React. |
| `components/SowFormEmbed.tsx` | Sandboxed iframe host, message bridge, SOW backup per opportunity, full-height Overview panel. |
| `components/OpportunityDetail.tsx` | Supplies expediente data, receives SOW updates, writes synchronized values and creates the `KOM` note. |
| `components/SettingsModal.tsx` | `Settings → SOW Library`: global default-question overrides, reusable sections, reusable questions and basic relationships. |
| `App.tsx` | Stores `globalSowForm` in app settings and passes it into every opportunity. |
| `types.ts` | Opportunity and Commercial field definitions used by SOW synchronization. |

## Data model

Each SOW is a `MeetingNote` with `format: 'sow'`. Its `content` is serialized JSON sent from the iframe to `SowFormEmbed` using `postMessage`.

The saved state contains:

- `fields`: answers keyed by `data-key`.
- `tables`: dynamic-table values.
- `customForm`: local custom sections/questions and local `flowOverrides`.
- `ui`: UI state such as Guided mode.

Additionally, `SowFormEmbed` stores a browser backup under `tenderloop-sow-backup-<opportunity-id>`. It allows a replacement SOW note to restore captured SOW answers after the original SOW note was deleted. Expediente-linked values are refreshed from the expediente afterward.

## Default flow

`FLOW_DATA` in `services/sowTemplate.html` defines the built-in Steps:

1. Base Data
2. Commercial
3. Technical Scope
4. Hardware & Cabinets
5. Services & Execution
6. Tests & Site Activities
7. Training
8. Documentation & Deliverables

Built-in questions use keys such as `flow_B001`, `flow_C001`, and `flow_T001`. Do not change an existing key casually: keys are used by saved answers, dependencies and synchronization.

## Global Library vs. local customization

### Settings → SOW Library

This is the global library shared by all opportunities.

- Global reusable questions are stored in `AppSettings.globalSowForm.questions`.
- Global reusable sections are stored in `AppSettings.globalSowForm.sections`.
- Edits to built-in questions are stored in `AppSettings.globalSowForm.flowOverrides`.
- A global override is merged with the matching question key at render time.
- Global sections can have a simple visibility relationship. Example: `flow_T001` `includes` `Modicon` makes a complete custom Modicon section appear only when Modicon is selected.

### SOW → Designer (form designer)

This is the visual editor inside an individual SOW.

- It can add questions to any Step.
- It can edit built-in question wording, type, list options, required state, area and dependencies.
- Those changes are local unless they are configured through Settings as global library content.
- Complex relationships (`ALL` / `ANY` conditions) are edited here.

## Conditional logic

Questions and custom sections use `logic` objects, for example:

```json
{ "op": "includes", "source": "flow_T001", "value": "Modicon" }
```

Supported operators are implemented in `evaluateLogic()` in `services/sowTemplate.html`. Common choices:

- `equals`: source answer exactly matches the value.
- `includes`: a multi-select source includes the value.
- `includes_any`: source includes any supplied values.
- `has_value`: source has any answer.
- `is_empty`: source has no answer.

For multiple rules, use `{ "all": [...] }` or `{ "any": [...] }`.

Platform modules use `.platform-section` with `data-platform`. Platform checkboxes are intentionally unselected by default. Selecting systems through `flow_T001` updates platform visibility; do not restore default checked states unless all platform modules should be visible on a blank SOW.

## Expedited field synchronization

SOW answers are synchronized using `syncChangedKey()` and a short debounce to avoid writing on every keystroke.

Current linked values include:

| SOW | Expediente |
| --- | --- |
| `flow_B004` Proposal due date | `dates.expected` |
| `site` / `flow_B007` | `customerAddress` |
| Seller / CSE | `seller` |
| Customer | `customer` |
| Alias | `alias` |
| Objective | `description` |
| Proposal type | `quoteType` |
| `flow_C012` CQA selling price | `commercial.cqaOfficialSellPrice` |
| `flow_C013` expected CCO margin | `commercial.cqaOfficialMargin` |
| `flow_C014` commercial notes | `commercial.discountsAndNotes` |

Changes from the expediente are sent back into the iframe through the `update-prefill` message. Only linked keys are overwritten; unrelated SOW answers remain intact.

## Overview

The Overview button opens a second SOW iframe in a fixed right-side panel with full application height. The original SOW iframe remains in place behind it. It supports search, filtering by section, editable answers, Close, click-outside and Escape.

Important message types:

- `overview-open` / `overview-close`: control the host panel.
- `open-overview`: tells the panel iframe to open its Overview UI.

Do not move the main SOW iframe to create the panel; doing so makes the original note disappear and causes a visual jump.

## KOM note generation

`Meeting note` (toolbar) sends `generated-note` to the host. `OpportunityDetail` creates a new regular note titled `KOM` whose body is an ordered list of applicable required questions that are still unanswered.

If this stops working, verify in this order:

1. The button calls `generateMeetingNote()` in `services/sowTemplate.html`.
2. `SowFormEmbed` accepts the `generated-note` message.
3. Both SOW render paths in `OpportunityDetail.tsx` pass `onGeneratedNote={addGeneratedSowNote}`.
4. `addGeneratedSowNote()` creates a `MeetingNote` and calls `handleFieldChange('notes', ..., true)`.

## Safe change checklist

Before shipping an SOW change:

1. Preserve question keys and test existing saved SOW data.
2. Verify Guided mode hides/shows dependent questions correctly.
3. Verify a linked expediente field in both directions.
4. Verify a new global Library question appears in a different opportunity.
5. Verify Overview opens without altering the original SOW view and closes with click outside/Escape.
6. Verify `Meeting note` creates a note titled `KOM`.
7. Run `node .\\node_modules\\vite\\bin\\vite.js build`.
