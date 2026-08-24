# CLAUDE.md

Read this before exploring the codebase. It exists to save tokens: it points at exact
files/lines/patterns instead of making you re-derive them with Explore/grep sweeps.

> Note for humans: this file is read automatically by Claude Code. If this repo ever grows an
> `AGENTS.md` (Codex CLI or similar), keep this file as a short pointer to it instead of
> duplicating instructions in both places.

## Project shape

- Frontend source lives under `src/`; the local backend is `server/` (port 3099). Windows launchers
  (*.bat, *.vbs, *.hta) must stay in the repo root — shortcuts and `%~dp0` paths depend on it.
- Two apps share this codebase: **Loop** (`npm run dev`, port 3000) and **Flow** (`npm run dev-flow`,
  port 3003).
- `src/App.tsx` is the root: owns `appSettings` (type `AppSettings` from `components/SettingsModal.tsx`),
  top-level nav (`currentView`), and renders `OpportunityDetail` from **two** call sites (see below).
- `src/components/SettingsModal.tsx` is the single settings file: the `AppSettings` interface, its
  `DEFAULT_SETTINGS`, and every settings-tab UI all live here. Tabs are picked with local state
  `activeTab` (`'general' | 'contacts' | 'expediente' | 'tasks' | 'notes' | 'sow' | 'labels' |
  'taskview' | 'alarms' | 'emailTemplates'`).
- `src/components/OpportunityDetail.tsx` is the "expediente" — huge file, header block only
  (title/status/buttons bar) is roughly lines 5630-5990.

## Established patterns — reuse these, don't reinvent

**Pattern A — hideable list of items** (used for opportunity-detail sections, indicator sections,
header fields, top-level views):
1. Add a key union type + label list, e.g. `OpportunityHeaderFieldKey` / `OPPORTUNITY_HEADER_FIELDS`
   in `SettingsModal.tsx`.
2. Add `hidden<X>?: KeyType[]` to `AppSettings`, default `[]` (or non-empty if hidden-by-default is
   wanted) in `DEFAULT_SETTINGS`.
3. Settings UI: a card with one checkbox per item, toggling membership in the hidden array
   (`new Set(...)`, add/delete, spread back).
4. Consumer: `const hidden = new Set(hiddenX); {!hidden.has('key') && <Thing/>}`.

Existing instances of this pattern (don't grep for these from scratch, they're already built):
- `hiddenOpportunityDetailSections` — which detail tabs (KPI/History/Tasks/...) show. UI in
  Settings "Expediente" tab. Consumed in `src/components/OpportunityDetail.tsx`.
- `hiddenIndicatorSections` — which blocks show in `src/components/IndicatorsDashboard.tsx`.
- `hiddenOpportunityHeaderFields` (`OpportunityHeaderFieldKey`) — header bar fields/buttons
  (address, seller, nextStep, quoteType, alias, labels, emailButton, exportImport, revisions,
  exportPdf, copySummary, autoFillEmail, delete, principalStatus, processStatus, priority).
  UI in Settings "Expediente" tab ("Header Fields" card). Consumed via `hiddenHeaderFields` Set
  built with `useMemo` near `localOpp` state in `src/components/OpportunityDetail.tsx`.
- `hiddenViews` (`AppViewKey`, `APP_VIEWS` list) — which top-level nav tabs show (General/
  Proposals/Tasks/Indicators). At least one must stay visible — UI disables the last checkbox.
  Paired with `defaultStartView` (startup view). Both live in Settings "General" tab. Consumed
  in `src/App.tsx` nav buttons + the mount effect that restores/falls back to a visible view.

**Pattern B — simple feature toggle** (used for SOW note, Stakeholders note):
1. `<x>SectionEnabled?: boolean` in `AppSettings`, default `false`.
2. Checkbox card in Settings "Notes" tab.
3. **Must be threaded through `OpportunityDetail` props at BOTH render call sites in `src/App.tsx`**
   (`renderSplitTabContent`, ~line 890s, and the full-screen overlay, ~line 2230s) — it's easy to
   only update one and silently break the split-tab view.
4. Gate the button/section in `OpportunityDetail.tsx` with `{flagName && <Button/>}`.

Existing instances: `sowSectionEnabled` (the "+ SOW" note button), `stakeholdersSectionEnabled`
(the "Stakeholders" team-panel button, next to SOW in the Notes tab quick-add row).

## Gotchas

- `OpportunityDetail` is rendered twice in `src/App.tsx` — always grep `sowSectionEnabled` (or any prop
  you're adding near it) to find both spots before declaring a prop-threading change done.
- Nav/view state: `currentView` can come from (a) the settings-driven `defaultStartView`, or
  (b) `sessionStorage` (`TenderLoop_Navigation_V1`) restoring the last-used tab within the same
  session. `sessionStorage` wins if present — `defaultStartView` only applies on a fresh session
  (real app relaunch). A separate guard effect redirects away from any view listed in `hiddenViews`.
- All UI strings should be English — the app went through a Spanish→English cleanup
  (`IndicatorsDashboard.tsx` was the last offender). Don't reintroduce Spanish labels.
- Settings persist to `localStorage` key `TenderLoop_Settings_V1` via `handleSaveSettings` in
  `App.tsx`; nothing else to wire for persistence once a field is in `AppSettings`.

## Before spawning an Explore agent

For settings/expediente-header work, check the patterns above first — most changes are "add one
more entry to an existing list" (Pattern A) or "clone the SOW toggle" (Pattern B), not new
architecture. Only spawn Explore for genuinely new subsystems.
