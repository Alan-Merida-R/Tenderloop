# SOW / KOM Workspace

## Purpose

The SOW note is TenderLoop's guided workspace for KOMs and information-request meetings. It is not a Word generator. It helps capture answers, identify required unanswered questions, keep selected fields synchronized with the expediente, and create a `KOM` note containing the pending questions.

To grow the question set, [sow-feedback-prompt.md](sow-feedback-prompt.md) holds the two prompts used to pull the checklist that proposal engineers carry in their heads and turn it into a concrete change plan.

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
3. Technical Scope (includes the conditional **Installed Base** subsection: FERRET, CFA/MSA, Advantage returns, controllers)
4. Hardware & Cabinets (owns every cabinet/panel question; section 5 keeps only the responsibility matrix)
5. Services & Execution
6. Tests & Site Activities
7. Training
8. Documentation & Deliverables
9. Bid Strategy & Inputs (bid-desk checklist: RFP, T&Cs, pricing strategy, commercial route, bid status, timing, input files)

Steps 1-8 and their questions live in the `FLOW_DATA` literal. Everything added afterwards lives in
`EXTRA_FLOW_STEPS` / `EXTRA_FLOW_QUESTIONS`, two plain JSON literals declared right after it between
the `FLOW_EXTRAS_BEGIN` / `FLOW_EXTRAS_END` markers. `SettingsModal.tsx` parses all three with
regexes anchored on those markers to build the SOW Library, so keep them JSON-parsable and keep the
markers where they are. `allFlowQuestions()` is the single accessor that merges them at runtime.

Built-in questions use keys such as `flow_B001`, `flow_C001`, and `flow_T001`. Do not change an existing key casually: keys are used by saved answers, dependencies and synchronization.

A flow question may deliberately reuse a classic field's key (`cabinets_included`, `included_scope`,
`payment_milestones`): that is how a question moves into the guided flow without migrating data.
`syncChangedKey()` keeps duplicate controls in lockstep and the Overview lists such an answer once.

### Retired questions still used as logic sources

`flow_T001` (systems) and `flow_B008` (opportunity type) are in `REMOVED_FLOW_QUESTIONS` — the
Scope and System catalogs replaced them as the question the user answers. Dozens of built-in rules
still name them, so `conditionAnswer()` special-cases both and answers them from
`systemValues()` / `opportunityTypeValues()` instead of from a DOM element.

## Scope / System / Notes-at-a-glance catalogs

The three Base Data catalogs are user-editable in `Settings → Labels & Scope`. Their shape, the
default lists and the sub-module key derivation live in `components/scopeCatalog.ts`, which the
Scope quick view and `SettingsModal` import directly. The sandboxed iframe cannot import it, so
`sowTemplate.html` keeps its own copy of the defaults and receives the live catalog over
postMessage (`init` payload, plus `update-scope-catalog` when settings change) — keep the two
default lists in step.

| Catalog | Answer key | Sub-module key |
| --- | --- | --- |
| Scope | `scope_types` | — |
| Systems | `sow_systems` | `triconex_products` for Triconex, otherwise `sysmod_<option id>` |
| Notes at a glance | `quick_notes` | `qnmod_<option id>` |

Answers are stored as **labels**, not ids, so they read correctly in the Overview and feed the
label-based `includes` rules. Renaming an option therefore unticks it in existing SOWs.

Legacy mirrors are written on every catalog edit and must stay: `platform_modicon/triconex/foxboro/other`
still drive the 4A/4B/4C platform sections, and `opp_type` / `flow_B008` still drive the built-in
opportunity-type branches. `migrateLegacyDuplicateFields()` seeds the catalogs from those keys the
first time an older SOW is opened.

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

Platform modules use `.platform-section` with `data-platform`. The `platform_*` checkboxes are now a
hidden mirror of the System catalog (`#platformMirror`) and are intentionally unselected by default;
`mirrorSystemsToPlatforms()` writes them. Do not restore default checked states unless all platform
modules should be visible on a blank SOW.

## Follow-up flags

`flaggedQuestions` is one store for the whole document. Guided-flow questions carry their flag
button inside `createQuestionCard()`; the classic sections get the same button injected into each
field label by `decorateStaticFlags()`, which marks the box with `data-flag-box="<key>"`.
`toggleFlag()` updates both representations and `body.flag-filtering` hides whatever is unflagged.
Flags are keyed by answer key, so the Overview and the navigation panel need no special handling.

## Typing performance

Three things run per edit and each has its own cadence:

- `save()` — 180 ms debounce, then `postMessage('save')` + `localStorage`.
- `scheduleVisualUpdate()` — 260 ms debounce for `updateConditionalVisibility()` + Overview rerender.
  `change` events and `focusout` call `flushVisualUpdate()` instead, so nothing lags behind a click.
- `SowFormEmbed` keeps `lastFromIframeRef`: when the `content` prop comes back byte-identical to what
  this iframe just saved, the `update-fields` echo is skipped. Without that guard, a save round-trip
  wrote stale text back into the field being typed in and dropped characters. As a second line of
  defence the iframe's `update-fields` handler never restores the key that currently has focus.

## Expedited field synchronization

SOW answers are synchronized using `syncChangedKey()` and a short debounce to avoid writing on every keystroke.

Current linked values include:

| SOW | Expediente |
| --- | --- |
| `proposal_delivery` Expected proposal delivery | `dates.expected` (both directions) |
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
