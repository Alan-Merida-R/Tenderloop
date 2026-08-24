# Technical Documentation: Tender Control

This document describes Tender Control. TenderFlow is an independent application
in `../TenderFlow`; its source code is not nested inside OpportunityOS.

---

## 🏗️ 1. Architecture Overview

The system is a distributed React application that operates directly on the user's local file system using the **File System Access API**.

### Core Stack
- **Frontend:** React + TypeScript + Vite.
- **Styling:** Tailwind CSS and application CSS.
- **Database:** Local JSON files (schema in `src/types.ts`).
- **Communication:** `BroadcastChannel` for cross-tab synchronization.

### Key Directory Structure
- `src/App.tsx`: Main entry point, state management, and orchestration.
- `src/components/Dashboard.tsx`: High-performance Kanban and list views.
- `src/components/OpportunityDetail.tsx`: Complex form/note editor for expedientes.
- `src/services/fileSystem.ts`: File I/O operations and permission management.
- `server/`: Loopback-only local service on port 3099.
- `server/os/`: Windows integration — Explorer, clipboard, Outlook, window control (`shell.ts`) and the browser engine (`webAutomation.ts`, `pageScripts.ts`).
- `scripts/`: Runnable checks (`verify-folder-persistence.ts`) and build/maintenance helpers (`generate-icon.mjs`, `toggle-app-window.ps1`, `find-chrome-app-id.ps1`).

---

## ⚡ 2. Performance Engine (v5000 Optimization)

To handle 5,000+ opportunities with heavy HTML notes without UI lags ("trabarse"), the system uses a **Tiered Data Architecture**:

### A. Light Cache System (`lightOpportunities`)
Instead of passing the full database to the Dashboard, `App.tsx` maintains a `lightCacheRef`.
- **Light Object:** Strips heavy fields like note content (`content: ''`), internal versions, and deep history.
- **Cache-Busting:** Uses `_originalRef` comparison to only re-map objects that actually changed.
- **Search Indexing:** Pre-calculates `_searchIndex` once per object change, making filters instantaneous.

### B. Anti-Lag Typing Algorithm
In `OpportunityDetail.tsx`, typing in notes is isolated:
- **`NoteEditorWrapper`:** Encapsulates the live HTML state. It prevents the 5,000-line `OpportunityDetail` component from re-rendering on every keystroke.
- **Deferred Sync:** Live typing only updates a local state. Background synchronization to the main DB is debounced (5s) or triggered immediately on tab/note switch.

### C. Stable Prop Identity (Anti-Freeze Navigation)
Several settings fields (`holidays`, `globalLabels`, `trackedAreas`) are optional arrays. Inline fallbacks like `holidays={appSettings.holidays || []}` return a **new array** on every `App.tsx` render, which invalidates `React.memo` on Dashboard and OpportunityDetail and triggers cascading re-renders during navigation.
- **`EMPTY_ARR`:** A module-level `Object.freeze([])` sentinel provides a stable identity for missing settings arrays.
- **`stableHolidays` / `stableGlobalLabels` / `stableTrackedAreas`:** `useMemo` wrappers that return the settings array when present, or `EMPTY_ARR` otherwise. Consumed by Dashboard + both OpportunityDetail mounts (overlay + split tab).
- **`handleTimerTaskClick`:** Stabilized via `useCallback` + `dbRef` / `floatingTabsRef`, so the Timer context does not bust its consumers every time opportunities change.

---

## 🔄 3. Data Sync & Persistence

### A. Smart Merge Strategy
To prevent "Light" objects from overwriting "Full" records:
- All light objects are tagged with `_isLight: true`.
- `updateOpportunity` in `App.tsx` detects this tag and performs a **differential merge**, preserving `notes` and `versions` from the existing record.

### B. Cross-Tab Sync (Broadcast Delta)
Instead of broadcasting the entire 50MB+ JSON file between tabs:
- **Deltas:** The system only broadcasts the ID and the modified `oppData`. Receivers merge this delta into their local memory state.
- **`isBroadcastingRef`:** A guard flag prevents infinite broadcast loops between tabs.

### C. Forced Persistence
- **Unmount Protection:** All components (Modal, Tab, App) have `useEffect` cleanups that force a disk save if there's a pending change.
- **Tiered Autosave:** Disk writes are debounced at **3 s** for normal edits. When a mutation is flagged `immediate` (note flush, critical-field blur, expediente close), the debounce collapses to **120 ms** so closing the app seconds after typing still lands the change on disk.
- **Immediate Propagation:** `updateOpportunity(opp, id, immediate?)` accepts a third flag. When `true`, the setDb call skips `React.startTransition` (commits in the current tick) and sets `immediateFlushRef`, which the autosave effect consumes to shorten its next debounce.
- **Concurrency Retry:** If the autosave timeout fires while a previous save is still in flight, it re-schedules itself after 250 ms instead of dropping the change.

### D. Note Crash Recovery (localStorage Backup)
Notes are the largest, most fragile payload. On every `flushNoteRef` commit, the latest content is mirrored synchronously to `localStorage` under `tl-note-backup-<oppId>-<noteId>`. If the window closes before `saveToDisk` lands the change:
- On next boot, `loadDbFromHandle` / `handleOpenDB` calls `mergeNoteCrashBackups`, which walks `localStorage`, compares each backup against the freshly-loaded DB, and restores any newer content.
- After every successful `saveToDisk`, all `tl-note-backup-*` keys are cleared — so the recovery layer only ever sees genuinely unsaved content.

This gives note edits a **survivability guarantee** even across browser crashes or abrupt window closes.

### E. Configurable Sound Layer (`services/soundService.ts`)
Instead of shipping MP3 assets, alerts are synthesized on demand via **WebAudio**:
- **Shared `AudioContext`:** A single lazily-created context is reused across every alert. Rebuilding contexts per play can starve device audio output on some browsers.
- **`SoundType`:** `'beep' | 'chime' | 'bell' | 'alarm' | 'ding' | 'triad' | 'none'`. Each preset is a list of `ToneSpec` entries (frequency, duration, gain envelope, optional offset) which `scheduleTone` plays via oscillator + gain ramps to avoid click artifacts.
- **Settings wiring:** `AppSettings.notificationSound` and `AppSettings.timerSound` default to `'beep'`. `SettingsModal.tsx` exposes both dropdowns with a Preview button.
- **Ref-based consumption:** `TimerProvider` (pomodoro phase alerts + task-start notifications) and `useScheduleNotifications` (5-min pre-block push) hold the user's choice in `useRef`s. Mutating the setting does **not** re-run the timer/scheduler effects — the next tick reads the latest ref.

### F. Database-Owned User Settings
Widget state that used to live in `localStorage` is now stored in `UserSettings` inside the JSON database, so it travels with the file instead of with the browser:
- **`stickyNotes` / `generalQuickLinks`:** written by `App.tsx` and passed down as props. `StickyNotesWidget` no longer reads or writes storage itself.
- **One-time migration:** a `*Migrated` boolean guards each import. The effect merges legacy entries with anything already in the database by `id`, sets the flag, and never runs again. A malformed legacy value is swallowed so it can never block loading.
- **Same pattern as `globalContacts`:** when adding another widget of this kind, copy the flag-guarded merge rather than reading storage at render time.

### G. Search Index Normalization
`buildOpportunitySearchIndex` in `App.tsx` runs once per opportunity change; the Dashboard filter runs on every keystroke across every record. Accent-stripping therefore belongs in the index, not the filter:
- **`normalizeSearchText`** (exported from `components/OpportunitySearchInput.tsx`) is the single normalizer — NFD, strip combining marks, lowercase.
- The index applies it to the joined values, `parseBooleanQuery` applies it to each parsed term, and the matcher is told the haystack is pre-normalized (`booleanMatcher(searchable, true)`).
- SOW notes are serialized JSON. Their **values** are already collected; the index additionally pushes the SOW **field keys** so custom scope terms are findable without parsing that JSON on the hot path.

---

## 🌐 4. Web Automation (`server/os/webAutomation.ts`)

Phase 1 is reconnaissance: sign in once by hand, then inspect a page to see what is extractable. Filling and submitting forms build on the same session later. See [security.md](security.md) for the guardrails — host allow-list, redaction and profile isolation are load-bearing, not incidental.

- **Engine:** `playwright-core` driving the Chrome (or Edge) already installed on the machine. `findBrowserExecutable` uses the same search order as `_open_browser.bat`, so both pick the same binary.
- **Persistent context:** `chromium.launchPersistentContext(CHROME_PROFILE_DIR, ...)`. The session lives in the profile, so a headless probe rides on the login the user completed in a visible window.
- **Single shared context:** a Chrome profile directory can only be opened by one process at a time. `getContext` serializes concurrent launches through a `launching` promise, and switching between headless and visible forces a relaunch. A `close` listener clears the handle so a crash cannot strand a stale context.
- **Routes:** `GET /api/web/status`, `POST /api/web/login`, `POST /api/web/probe`, `POST /api/web/close`. Mounted only when `ENABLE_WEB_AUTOMATION` is true; `/api/health` lists `web-automation` in `features` when it is.
- **`evaluateInPage` gotcha:** `tsx`/esbuild compiles this file with `keepNames`, rewriting nested helpers as `__name(fn, "fn")`. That helper exists only in the Node module scope, so a serialized page function throws `__name is not defined` inside the browser. Page scripts are therefore evaluated as an expression string that declares a local no-op `__name` first. Keep new page scripts in `pageScripts.ts` and run them through this helper.
- **Response capture:** only JSON/XML responses are kept, capped at 40 per probe, with bodies filled in asynchronously and written to the artifacts folder when under 4 MB.

---

## 🛡️ 5. Recovery & Stability

### Root Error Boundary
Located in `components/RootErrorBoundary.tsx`, it wraps the entire application.
- **Crash Detection:** If a corrupted database or a migration bug causes a "White Screen", the boundary catches it.
- **Emergency Reset:** Provides a button to clear the currently stuck database connection from `localStorage`, allowing the user to recover the app immediately.

---

## 📖 6. Developer Glossary: User Terminology Mapping

When the user requests changes, they often use specific terms. Use this table to translate them into code concepts:

| User Term | Technical Concept | Location |
| :--- | :--- | :--- |
| **"Expediente"** | `Opportunity` | `OpportunityDetail.tsx` |
| **"Hoja de Notas"** | `MeetingNote` array | `OpportunityDetail.tsx` (Notes Tab) |
| **"Se traba"** | Main Thread Blocking / Lag | Check `lightOpportunities` cache |
| **"BD" / "Base"** | JSON Database file | `App.tsx` -> `db` state |
| **"FIME / Presupuestal"** | `quoteType` field | `Opportunity` interface |
| **"Expected"** | `dates.expected` | Target delivery date |
| **"Requested"** | `dates.requested` | Original stakeholder request date |
| **"Status Label"** | `statusLabel` | Color-coded status |
| **"Sub-vista"** | `splitTab` / `FloatingTab` | Minimized or side-view overlay |
| **"KPIS"** | `OpportunityMetrics` | `Dashboard.tsx` summary logic |

---

## 🛠️ Developer Tips
1. **Always use Functional Updates:** Use `setDb(prev => ...)` to ensure consistency.
2. **Respect the Migration Engine:** When adding new fields, update `migrateData` in `App.tsx`.
3. **Check `isSubView`:** Components behave differently in sidebar vs. full screen.
4. **Avoid Deep Spreads:** Be precise with updates to avoid cloning 5,000 objects.
5. **Never Persist From Inside a State Updater:** A functional updater must stay pure. Calling the database updater from one nests a React update inside another and can freeze the UI — this is exactly what made the expediente hang when a Pomodoro break started. Stash the record in a ref and flush it after the commit, as `TimerProvider` does with `pendingPomodoroLogRef`.
6. **Migrations Are Additive:** Legacy recovery (folder paths, sticky notes, quick links) must merge, never overwrite. A user who already has newer data in the database must not lose it to an older value found in browser storage.
7. **Distinguish "Backend Said No" From "Backend Never Answered":** In `services/backendDb.ts`, `err.status` is set only when the backend actually responded. A missing status means the request never arrived, which is retryable; a real response such as a 409 must propagate.
8. **Not Every Unreferenced File Is Dead:** `src/ambient.d.ts` is loaded by tsconfig and `src/services/save.worker.ts` is loaded through `new Worker(new URL(...))` — neither appears in any import statement. See [testing.md](testing.md) for the dead-code procedure before deleting a file.

---

## 🗺️ 7. TenderFlow: Strategic Matrix Logic

TenderFlow lives in the sibling `../TenderFlow/` directory and handles complex
decision trees and executive reporting. Consult its `README.md` and source for
its current implementation details.

### A. Data Integrity & Deduplication
To prevent recursive item multiplication (e.g., importing a case into its own source):
- **ID-Based Guard:** The `parseExcelSheet` service uses a `seenIds` Set to ensure only one item per ID is added to the backbone.
- **System Injector Guard:** In `handleCreateNew`, the system auto-injects `SYS_*` fields (Alias, OP ID, Amount) only if they are not already present in the source snapshot.

### B. Versatile Responder Engine
The `MemoizedBackboneItem` dynamically adapts its UI based on `responseType` and `itemType`:
- **Selective UI:** Notes/Textarea are hidden for `boolean`, `link`, and `selection` types to maintain a minimalist executive dashboard.
- **Type Versatility:** Supports `text`, `string`, `number`, `date`, `link`, and `boolean` natively.
- **Visual Dependencies:** Locked items (unmet dependencies) remain visible to provide context, but inputs are disabled (`opacity: 0.5`, `cursor: not-allowed`).
