# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased - 2026-09-27

### Added
- Added a self-contained offline Windows distribution model: published packages now carry the reviewed production build, exact dependency tree, an OpenJS-signed x64 Node.js runtime, third-party notices and SHA-256 integrity metadata. Target PCs no longer need Node.js, npm, administrator rights or Internet access.
- Added `scripts/verify-offline-runtime.mjs` to validate every managed release file, the packaged runtime and lockfile hashes, package completeness, architecture and localhost-only configuration before installation or update without depending on PowerShell execution policy.
- Added safe Windows Recycle Bin support to the opportunity folder through `POST /api/os/recycle`. Files and folders are recycled through `IFileOperation`; failure never falls back to permanent deletion.
- Added Explorer-style folder selection with Ctrl/Meta toggle, Shift ranges, Ctrl+Shift additive ranges, active-item tracking and stale-selection cleanup, backed by the pure `selectionUtils.ts` helper and regression checks.
- Added a marker-based filesystem scan fallback for newly created, empty, unindexed or deeply nested linked folders, including mapped/cloud drives, while continuing to reject ambiguous matches.
- Added an SOW effort-at-a-glance indicator, first-use guidance, optional Spanish field help, an actionable missing-required-fields panel, editable grouped Overview, complete document navigation and Expand/Collapse all controls.

### Changed
- Replaced the HTA/VBScript/Windows Script Host installation stack with `engine_opportunityos.bat` as the primary entry point. It now prepares source copies idempotently, starts and health-checks both localhost services, opens the browser directly and keeps diagnostics visible.
- Source preparation now uses the committed npm lockfile through `npm ci`, skips unchanged dependencies/builds by SHA-256 fingerprints, and reports phase, failed command and exit code without interactive parameters.
- Manual update discovery now uses `%APPDATA%\OpportunityOS\install-root.txt`; update relaunch and deferred uninstall use BAT/PowerShell only and do not alter PowerShell execution policy.
- Installer, launcher and both update paths now consume the packaged offline runtime and production build instead of downloading dependencies or compiling on the destination PC. Updates verify the complete payload and remove newly introduced managed files during rollback.
- Release publishing now builds from version-controlled files, excludes AI/scratch/data paths, audits the complete dependency tree, validates the runtime signature and localhost bindings, packages `dist` plus `node_modules`, and emits a schema-2 release manifest with per-file hashes.
- Dependency security was refreshed: `@xmldom/xmldom` 0.8.15, DOMPurify 3.4.13, patched SheetJS 0.20.3 from its pinned official CDN tarball, plus fixed `nanoid` and `qs` overrides.
- Process shutdown now verifies that listeners on ports 3000/3099 belong to the current Tender Control folder before stopping them. Uninstall preserves the separate `%APPDATA%\OpportunityOS` data area and other Node.js installations.
- Opportunity-folder opening now uses bounded requests with clearer partial/missing-file errors. Template-created folders can be linked in path-only mode when Chromium cannot return a handle.
- Dashboard General view now presents Notes, Save Note to History and editable Last Event as card-style columns, preserves them for existing saved layouts, prevents row navigation/dragging while editing, and displays dates as `DD/MM/YYYY` without changing stored ISO values.
- Opportunity ranking now treats invalid/non-positive values as unranked and closes priority gaps after deletion.
- The embedded SOW was reorganized into a leaner non-duplicated guided flow, shorter section names, clearer top-level scope blocks, connected contract logic and a lighter review/navigation experience.

### Fixed
- Removed the mandatory three-call `Phase` contract that could be swallowed by the trailing backslash in the quoted `%~dp0` argument and leave PowerShell waiting for interactive input.
- Restored in-place installation from a manually copied source folder: the engine detects the absence of an offline manifest, validates local Node.js/npm, repairs dependencies and builds `dist` without an interactive phase parameter. Official release ZIPs remain strictly offline because the source-mode helper is excluded during publication.
- Fixed permanent deletion from the folder UI by routing single and multi-item removal exclusively through the Windows Recycle Bin.
- Fixed ghost or inconsistent multi-selection after refresh, search, navigation and Ctrl-click deselection.
- Fixed replacement/template folders retaining an obsolete handle/path when the new folder was empty or not indexed yet.
- Fixed duplicate native opens after partial `/open-many` failures and slow opening requests that could wait indefinitely.
- Fixed Dashboard controls, text selection and editable fields accidentally opening or dragging the surrounding opportunity/task row.
- Fixed General-view date rendering and native date-picker alignment, a mojibake em dash, and note-editor header spacing beneath overlay controls.

Full technical inventory and validation evidence: [`docs/CHANGESET_ACTUALIZACION_2026-09-27.md`](docs/CHANGESET_ACTUALIZACION_2026-09-27.md).

## v1.0.5 - 2026-09-25

### Added
- Proposal alarm targets now follow the same formula as `Alarmas.xlsx` exactly: every selected proposal type, system, application, extra Scope item, amount tier and Firm/Budgetary adds its days; the sum is multiplied by the active multipliers (revision, Similar/Copy, Split — summed, 1 when none applies) and never drops below the Base. Added `services/alarmFormula.ts` (formula parser/validator, Excel-style functions and Spanish variable names) and an editable `targetFormula` on the policy so the formula itself can be customized from Settings.
- Added Excel import/export for the alarm policy (`services/proposalAlarmExcel.ts`, `Exportar`/`Importar Excel` buttons in Settings > Alarms): download the live weights as `.xlsx`, edit it like the reference sheet, and re-import to update weights, amount tiers and the formula in one step.
- Added an optional Execution Center adjustment (Mexico/USA/Canada) to the Scope quick view and the alarm policy (`executionCenterDays`), replacing the short-lived `countryDays` field (auto-migrated on first load).
- Added a shared, folder-synced alarm configuration: `GET/PUT /api/os/alarm-settings` reads and atomically writes `OpportunityOS-Alarmas.json` in a chosen shared folder, so a team can align on the same alarm weights from Settings without emailing files around.
- Added `[TA-2]` approval workflow support: setting a task to `Approval` with approvers now starts its clock the same way `Missing Info` does (`approvalRequestedDate`, `isAssignment`), and task cards show approver names inline.
- Added `[TA-1]` a one-time remap of tasks that still pointed at a stakeholder's legacy SOW `name|area` id (e.g. the Seller/CSE) onto the real stakeholder id, so the person is no longer offered — and counted — twice in team pickers.
- Added `copyFileVerified`/`GET /api/os/copy-file` (`server/os/shell.ts`, `server/routes/os.ts`): byte-verified file copies using Win32 extended-length paths, used for creating file revisions in folders that exceed `MAX_PATH`. `copyDirectoryBestEffort` now uses the same extended-path handling. Covered by `check:system-section` (`scripts/verify-system-section.ts`).
- Added `check:system-section` npm script.
- The installer (`INSTALAR_OPPORTUNITYOS.hta`, `engine_opportunityos.bat`) now fingerprints `package-lock.json` and reinstalls dependencies whenever it changes, instead of only checking that `node_modules` exists — a stale `node_modules` from a previous version no longer passes setup.
- The updater (`scripts/check-for-update.ps1`, `scripts/publish-update.ps1`) now ships and compares a `release-manifest.json` per release, so an update also removes files that no longer belong to the current release instead of only overwriting/adding files. Added `ACTUALIZAR_TENDER_CONTROL.cmd` and `scripts/install-update-v2.ps1` as the standalone manual-update package copied next to `latest.json`.
- Added `findDirByMarkerCandidates` (`server/os/shell.ts`): proves a folder's identity by checking known/nearby candidates on disk for a unique marker file, instead of only scanning the Windows Search index. `locateByMarker` checks these `near` candidates first and answers instantly when one matches; the `GET /api/os/locate` route now accepts a `near` list. Covered by a new `check:system-section` case.
- `locateFolderPathWithMarker` now accepts `near` candidates (checked first) and throws a typed `MarkerUnwritableError` when the marker can't be written, so callers can fall back to content-matching instead of reporting "not found" for a read-only folder.
- Added `DocumentPickerModal` fallback to path-only browsing (`listDirByPath`) when the browser folder permission/handle isn't available, so linked-folder documents stay pickable after a handle is revoked; it now also surfaces load/search errors instead of showing an empty list.
- `handleSaveRootPath` (Folder tab) now verifies a manually typed Base Path against the linked handle (or, without a handle, that it is a real, listable folder) before saving it, instead of trusting free text.
- Added `normalizeWindowsPath`/`relativeFromAbsolute` (`fileOps.ts`) for canonical absolute-path building and mapping an absolute path back to segments inside the linked folder (used by "Go to path"); covered by new `check:folder` cases (drive roots, UNC shares, round-trips).

### Changed
- Creating a new proposal revision now keeps the previous revision's SOW/Scope note instead of discarding it: the new revision starts with an editable copy of the SOW note (Scope lives there), while the prior revision's own copy is untouched.
- Folder pins and the expediente's Quick Access pins now use Ctrl+click (`event.ctrlKey || event.metaKey`) to reveal a pin in the Folder tab, replacing Shift+click.
- `openFileNative` now hands the file to `explorer.exe` and returns as soon as the process is accepted, instead of waiting for the target application to finish starting; window-foregrounding runs as a best-effort background step afterward so `/open` no longer feels frozen for slow-starting apps (e.g. Office).
- `sowTeamMembers.ts`: added `buildOpportunityTeamMembers`, consolidating the stakeholder+SOW team-member merge logic that `Dashboard.tsx` and `OpportunityDetail.tsx` each duplicated separately.
- `resolveExactFolderPath` now always confirms a content match with the marker check (proving handle identity) instead of only falling back to the marker when content matching fails outright — two folders with byte-identical copied templates could otherwise resolve to the wrong one.
- Explorer is now always launched via a quoted `execFile` call (`spawnExplorer`) so a path containing `,` or `;` (e.g. `ACME,Inc`) opens the intended folder instead of Documents.

### Fixed
- Fixed a proposal's Seller/CSE appearing twice in team pickers (once as a stakeholder, once under its legacy SOW `name|area` id) by matching on name/alias before merging the two lists.
- Fixed the expediente's Quick Access pin navigation not opening a pinned folder correctly: a trailing slash is now added for directory pins so Folder deep-navigation doesn't treat the last path segment as a file name.
- Fixed two em dashes in `INSTALAR_OPPORTUNITYOS.hta` that had been mangled into `â€”` by a previous save with the wrong encoding.
- Fixed "Go to path" only accepting a path that started with the currently typed (possibly unsaved) Base Path text; it now resolves against the saved root and correctly maps any path truly inside it.
- Removed the unused `scripts/install-update.ps1` (superseded by `scripts/install-update-v2.ps1`, which is the only one referenced by the updater and publish script).
- Removed dead unreachable code left after a previous `locateByMarker` rewrite (a disk-wide fallback scan below an unconditional `return null`).

## v1.0.2 - 2026-08-28
### Fixed
- Fixed the Proposals "Scope" filter not matching selected options: it compared a label's internal id against the scope/systems/labels text read from the SOW, so a selection like "Foxboro" never matched anything. It now matches on the same text values everywhere.
- Fixed duplicate entries in the Scope filter dropdown (e.g. the same label appearing several times) caused by legacy labels sharing the same text under different internal ids.

### Changed
- The Scope filter is now grouped by section (Type of Proposal, Systems, Notes at a glance, Labels/Extras) with its own search box per section, mirroring the Scope quick view.
- The Scope filter only lists options present among currently visible proposals, so a hidden process-status column no longer leaks its labels into the filter.
- Free-text search is now limited to the OP number, alias, overview description, scope/systems/labels, customer and seller, instead of matching against nearly every field on an opportunity — narrowing overly broad search results.
- Standardized the General view table's header row to a consistent font size across all columns.

### Added
- Added a Duration filter and a Rank filter/sort (Excel-style, from the column header) to the General view table.

## v1.0.4 - 2026-09-23

### Added
- Added `proposalDaysEstimate` field on KPIs: tender owners can now enter their own duration estimate directly from the proposal card, blended with the scope-based calculation using a configurable weight (`tenderEstimateWeightPercent`, default 60%).
- Added the Tender Estimate input to the Settings > Alarms calculator so the blending behaviour can be previewed before committing it on a live proposal.
- Added `check:quick-organizer` npm script and `scripts/verify-quick-organizer.ts` test suite for the Quick Organizer prompt builder and response parser.
- Added Quick Organizer Intro splash: a motivational screen shown once each time the user opens the organizer, before the main view loads.
- Added `QuickOrganizerIntro` component gated by a new `showQuickOrganizerIntro` state in `App.tsx`.
- Added reorderable folder pins: `movePinRecord` in `opportunityFolderStore.ts` and `movePin` in `folderPinsStore.ts` let the user drag pins up/down in the Quick Access sidebar.
- Added `calendarTasks` memo in Dashboard that filters out closed/canceled opportunities from the Calendar View so only schedulable work appears.
- Added `assignmentStatusPatch` helper in `OpportunityDetail.tsx`: assigning a responsible person or area now automatically moves the task to Missing Info and starts the assignment clock in one atomic update.
- Added diagnostic counters (`counts`) to the BFO reader script (`bfoReaderScript.ts`): reports how many API holders, form groups, anchors, address elements, shadow roots and iframes were found, so empty-value failures are diagnosable without a round trip.
- Added page-save diagnostics to `bfoReader.ts`: when a field is not found (e.g. Account address), the reader now saves the full page HTML/screenshot to a timestamped diagnostics folder and reports the path.
- Added `isWebEntryGateway` to `server/config.ts`: the `/read` endpoint now accepts mail-scanner redirect URLs (Mimecast, Safe Links) as valid entry points, since SR links from Outlook go through those gateways before reaching Salesforce.
- Added `openFileForeground` in `server/os/shell.ts`: opening a document now finds an already-open window by title and brings it to the front instead of launching a duplicate or showing an "already open" error.
- Added `quoteType` (Firm/Budgetary) selector to the Settings alarm calculator so the Firm validation premium is previewed alongside amount and scope.

### Changed
- Dashboard filter state is now shared between General and Proposals views (`filterScope = 'opps'`): switching between them preserves the search text and filters instead of resetting. Tasks view keeps its own independent scope.
- Dashboard Status column filter now matches against both `detailedStatus` and `statusLabel` so a selection made in one view does not silently empty the other.
- Error boundary recovery now clears the new shared `opps` filter key alongside the legacy per-mode keys.
- Quick Organizer prompt builder no longer includes email addresses, prices or margins in the copied AI prompt; only names and roles are sent. The prompt now emits the expediente rank alongside user priority and includes the CSE window dates for delivery reasoning.
- Quick Organizer agenda rule split: a normal run preserves existing blocks as baseline (AGENDA PRESERVATION RULE); only an explicit reschedule request rebuilds them (AGENDA REORGANIZATION RULE).
- Proposal alarm engine (`calculateProposalAlarm`) now returns `calculatedDays` (pure scope result) alongside `expectedDays` (blended), plus `warningDays`, `criticalDays`, and all intermediate values in a single return object. `getProposalAgeTargets` delegates entirely to the engine instead of duplicating percent/offset math.
- Opportunity detail header uses CSS `@container` queries and responsive widths so the ID/QLK inputs shrink gracefully on narrow screens. QLK input widened from `w-16` to `w-20` with a tooltip for long quotelink numbers.
- Opportunity detail main content area changed from `overflow-hidden` to `overflow-y-auto` so tall header content is scrollable instead of clipped.

### Fixed
- Fixed task assignment not starting the clock: assigning a responsible person through the team picker, the task card, or the detail modal now atomically sets `owner: 'External Area'`, `isAssignment: true`, status `Missing Info` and `responsibleRequestedDate` in one update instead of requiring a separate status change.
- Fixed Task status dropdown in Dashboard task cards: replaced invisible `bg-transparent border-none` select with a visible pill-style `rounded px-2 py-1` select that shows the status color.
- Fixed Calendar View showing tasks from closed/canceled opportunities: the view now only renders tasks whose parent opportunity is still schedulable.

## v1.0.3 - 2026-09-18
### Added
- Added optional SharePoint-folder updates, including per-PC Settings, package checksum validation, backup and automatic recovery without blocking normal startup.
- Added `PUBLICAR_ACTUALIZACION.bat`, which validates the project, asks for the release destination, and generates the versioned ZIP plus `latest.json`.
- Added the installed application version to Settings > General.
- Added web automation (`/api/web/*`, disabled with `OPPORTUNITYOS_DISABLE_WEB=1`). It drives the Chrome already installed on the machine against a dedicated OpportunityOS profile under `%APPDATA%`, so the user signs in to corporate sites once by hand and later runs reuse that session. This first phase is reconnaissance only: `POST /login` opens a visible window for SSO/MFA, `POST /probe` inspects a page and writes its artifacts (HTML, text, screenshot, captured JSON) to `web-probes`, `GET /status` reports the session and `POST /close` releases the browser. OpportunityOS never sees, stores or types a credential.
- Added a per-opportunity workflow timeline to the expediente: a Gantt-style view of execution and approval phases per task, day-by-day summaries (completed, expected, missed, worked hours, scheduled blocks) and per-area breakdowns resolved from stakeholder assignments.
- Added an explicit completion date on tasks (`Task.completionDate`). Marking a task Done now asks which day the work actually finished, kept independent from `dueDate` (the commitment) and `completedAt` (the click timestamp) so a task closed late or early still reports the real completion day.
- Added General quick links: round shortcuts shown above Sticky Notes, configured in Settings with a name, colour and icon. Each one opens a web URL or an absolute Windows file/folder path through the local OS helper.
- Added a search box to Sticky Notes, and Escape now closes the panel.
- Added hideable notes (`MeetingNote.hidden`) and hideable task lists (`TaskStandard.hidden`). Both stay saved and keep feeding the rest of the expediente — a hidden SOW note still answers the Overview Scope button — but are left out of the lists and pickers until the user asks to see them.
- Added approver tracking on approval events (`ApprovalEvent.approverTeamMemberIds`), so the history feed can name who signed an approval off.
- Added the option to import an SR email into an existing opportunity as a new revision instead of always creating a new one, including its commit message, tags and task list.
- Added `npm run icon:build`: regenerates `public/icon.png` and the multi-resolution `opportunityos.ico` from the single vector source `public/icon.svg` (`scripts/generate-icon.mjs`, using `sharp` and `png-to-ico`).
- Added a pin control to the timer popup that keeps it above every other Windows window, backed by the new `/api/os/timer-window-topmost` endpoint. The window is matched by its exact title, so no unrelated window is touched.
- Added a Quick Organizer workflow that exports current workload context as a copy/paste prompt, imports a reviewed response, previews the resulting weekly agenda, reminders and due-date adjustments, and applies changes only after explicit confirmation.
- Added persistent user reminders linked to opportunities, tasks or notes, including a header bell, overdue state, browser notifications, configurable sound and direct navigation to the linked item.
- Added agenda-oriented task planning improvements, dashboard indicators and expanded opportunity quick views for prioritization and follow-up.
- Added backend-assisted database file resolution and native opening so a browser-selected database can be matched safely to one unambiguous Windows path.

### Changed
- Sticky notes and general quick links are now owned by the JSON database instead of `localStorage`, so they survive a browser reset, a cache wipe or a move to another machine. A one-time migration imports existing browser-only notes and links, then the database becomes the single source of truth.
- Opportunity search now normalizes accents once, when the per-opportunity search index is built, instead of on every record for every keystroke. SOW field names are added to that index, so custom scope terms are searchable without parsing the SOW JSON on the typing path.
- Reopening `OPEN_OPPORTUNITYOS.vbs` while the app is already running now toggles the existing window — restore and focus it, or minimize it if it is already in front — instead of stacking another window on top (`scripts/toggle-app-window.ps1`).
- The app window is launched with flags that keep it live when it loses focus, is covered or the laptop suspends, so it no longer comes back as a blank shell. When the user installed OpportunityOS as a real Chrome app, the launcher can reuse that stable app-id and taskbar identity; `scripts/find-chrome-app-id.ps1` reports it.
- Rewrote the timer popup around the shared absolute timestamps, removing roughly 600 lines of duplicated clock logic between the main widget and the popup window and keeping both readouts in agreement.
- Simplified Windows startup to one normal visible entry point: `ABRIR_TENDERLOOP.vbs`. It hides the internal launcher and installer files on first use, opens setup automatically when required, and leaves `motor_tenderloop.bat` visible as the recovery path for restrictive computers.
- Expanded task, opportunity, SOW and email data handling so new planning and reminder fields survive backend persistence, import/export and existing-data normalization.
- Updated the embedded SOW form, dashboards, settings and email workflows with the latest usability and data-consistency improvements.

### Removed
- Removed three source files that nothing reached: `src/components/OpportunityFolder.tsx` (411 lines, the pre-`OpportunityFolderTab` folder browser), `src/services/folderStorage.ts` (75 lines, only ever imported by that component) and `src/components/ConfirmModal.tsx` (60 lines, never referenced). Verified by walking the real import graph from `src/index.tsx`, not by text search — `src/ambient.d.ts` and `src/services/save.worker.ts` look unreferenced the same way but are not, since a `.d.ts` is picked up by tsconfig and the worker is loaded through `new Worker(new URL(...))`.
- Removed a disabled duplicate-SR warning in `ImportSrEmailModal.tsx` that was gated behind a literal `false &&`. It was superseded by the OP-based duplicate block that offers "Create revision" or "Keep as new OP".
- Removed `KPIEvolutionChart` (65 lines) and the `kpiData` / `kpiHistoricalData` memos (157 lines) from `Dashboard.tsx`. Nothing consumed them, so the KPI aggregation and the historical roll-up were recomputed on every render and discarded; the `kpiTimeRange` state that only fed them went with them.
- Removed 86 unused import specifiers across 22 files, two whole import statements, and roughly 60 further lines of unused declarations (helpers, memos and dead `useState` pairs) elsewhere in the expediente, the folder tab and the sticky-notes widget. This took the unused-declaration count from 181 to 21. Left alone on purpose: unused *parameters* — removing one changes a call signature and silently shifts positional arguments — along with unused destructured props and `useState` bindings whose other half is still live.

### Fixed
- Starting a Pomodoro break no longer freezes the expediente. The phase transition logged its time from inside a React state updater, which nested one update inside another; the pending record is now held in a ref and flushed after React commits.
- A backend save conflict no longer loops forever. When the database changed elsewhere, every later autosave kept resending the same stale revision and failing with 409 until the whole app was reloaded; the revision counter is now re-synced immediately, leaving the in-memory edits intact so the next autosave succeeds.
- A momentary loopback hiccup — typically right after the laptop wakes or the window regains focus — no longer shows a "failed to save" banner. A request that never reached the backend is retried once before surfacing an error; a real backend response, such as a 409, still propagates untouched.
- Linking a folder no longer falls back to manual path entry because of a race with Windows Search. The marker file is kept alive across retries and the folder name is used to find same-named candidates directly on disk, which is deterministic even when several opportunities share a revision folder name.
- Folder paths saved by older releases are now recovered into the shared database, including the very old single-string field and the pre-`OpportunityFolderDB` IndexedDB handle store. Recovery is additive: it never overwrites a newer path already in the database.
- Uninstalling from the Start Menu shortcut now cleans up shortcuts correctly. `DESINSTALAR_OPPORTUNITYOS.bat` falls back to the standard per-user Desktop and Start Menu locations when it is run directly instead of through the HTA uninstaller.
- The setup marker is ignored again by git. `.gitignore` still listed only the pre-rename `.tenderloop-setup-complete`, so the current `.opportunityos-setup-complete` was showing up as a file to commit.
- Restored direct application startup: `ABRIR_TENDERLOOP.vbs` now launches TenderLoop whenever Vite is available, without requiring an installer-completion marker or reopening setup after an interrupted installation.
- The installer no longer creates Desktop or Start Menu shortcuts. It validates the visible `ABRIR_TENDERLOOP.vbs` launcher instead, avoiding stale shortcut paths on corporate computers.
- Starting setup no longer deletes the existing completion marker. The installer now records its start time and only treats a marker updated during that specific run as success, so a cancelled or blocked setup cannot make an existing installation appear uninstalled.
- Uninstall preparation no longer reports itself as complete removal. The explicit **Remove folder now** action runs a detached cleanup that closes TenderLoop's local ports again, retries folder deletion for up to 60 seconds, and only reports success after the project folder is gone.
- Removed the optional unsigned `TenderLoop.exe` launcher. The supported user-facing launcher is now `ABRIR_TENDERLOOP.vbs`, which opens TenderLoop without a terminal and starts verified setup when installation is incomplete. This avoids corporate security products quarantining a helper EXE.
- The installer keeps a visible “Still working” status every five seconds while a background command runs, with no command window shown. It reports a clear timeout after 15 minutes instead of appearing frozen indefinitely.
- The VBS installer now waits for setup to complete and verifies its completion marker. If the HTA setup window is blocked or closes prematurely, it shows a clear corporate-security diagnostic instead of failing silently; the normal launcher routes incomplete setups through this verified path.
- Setup no longer marks its installer, uninstaller or launcher support files as hidden. They remain visible in Explorer so a completed installation cannot look like files were deleted.
- Installer and uninstaller windows now receive the real folder path from their VBS launchers instead of relying solely on the HTA virtual path. This prevents shortcuts from being created with an invalid sandbox-like path.
- Desktop and Start Menu shortcuts now launch `LANZAR_TENDERLOOP.vbs` directly rather than depending on the optional unsigned helper EXE. This keeps the no-terminal experience working when corporate security software quarantines that helper.
- The installer now monitors each setup command process directly, just like the repaired uninstaller. It no longer relies on a temporary completion file that could fail to appear and leave setup waiting indefinitely; command output is shown when the step completes.
- The port cleanup now uses Windows' local listener API rather than parsing `netstat`, and correctly avoids PowerShell's reserved `$PID` variable. It closes only the processes listening on TenderLoop ports `3000` and `3099`, without administrator rights.
- Before repairing dependencies, the installer clears those TenderLoop ports. It now uses in-place `npm install` recovery rather than a destructive `npm ci`, which is more resilient to corporate antivirus locks on native package files while still validating that Vite was created.
- The uninstaller now monitors the cleanup batch process directly instead of waiting for a completion file. This removes the remaining false timeout at step 2; it reports the batch output when it finishes and times out visibly after 15 seconds only if that actual process is still running.
- Installer and uninstaller command execution now uses temporary command runners with explicit log and completion files. This fixes the broken nested command redirection that could install dependencies in the wrong directory (leaving Vite missing) or leave the uninstaller stuck on a remaining-steps message.
- The normal launcher now rejects a stale frontend on port `3000` unless the current TenderLoop helper also responds on `3099`; it closes that old instance and starts the installed version.
- The uninstaller no longer uses the WMI process query that could hang indefinitely on some Windows installations. It now closes TenderLoop's local services by their reserved ports and shows a visible timeout after 45 seconds instead of waiting forever.
- Before starting the newly installed app, the installer now silently clears TenderLoop's reserved local ports (`3000` and `3099`) and records that cleanup in its visible log. This prevents a previous TenderLoop engine from blocking the new version.
- The launcher no longer treats a partially present `node_modules` folder as a completed installation. It requires Vite and a completion marker, otherwise it opens the visible installer.
- The installer now keeps the setup window open after starting TenderLoop, checks that the local application responds within 30 seconds, confirms the launch visibly, and reports unexpected interface errors instead of failing silently.
- The uninstaller now waits for an explicit final **Close and remove** action before it closes. A temporary cleanup process then stops processes launched from the TenderLoop folder, retries complete folder removal, and displays a final success or blocking message.
- The installer remains open after **Open app** is selected, so the user can confirm that the application started and close setup manually.
- Creating a note from a template now creates and opens that exact note on the first click. The previous selection race could leave the editor on the prior note or empty until the action was repeated.
- Creating or opening the Scope of Work (SOW) note now uses the same atomic creation-and-selection flow, so it also works on the first click.
- Note PDF export now flushes pending editor changes before rendering. The downloaded file therefore includes the latest visible text and embedded form values instead of an older saved copy.
- The PDF note renderer now mirrors more of the editor structure, including headings, tables, blockquotes, code blocks, checkboxes and form controls.

### Security
- Web automation only navigates to allow-listed hosts (Salesforce/bFO and Schneider Electric domains by default, extended with `OPPORTUNITYOS_WEB_HOSTS`). The browser engine can act as the signed-in user, so an endpoint accepting any URL would let anything able to reach port 3099 drive an authenticated corporate session. Subdomains match; look-alike suffixes do not; loopback is not allow-listed by default. Plain HTTP is tolerated only on loopback — everything reachable over the network must be HTTPS.
- Probe responses are redacted unless the caller explicitly opts out. Redacted mode keeps structure (labels, selectors, field types, JSON key paths, URL shape) and drops content: values become `<email>`, `<number>`, `<text N chars>` and identifiers in URLs become `{id}`. The full capture is always written to the local artifacts folder, so a probe result can be shared without leaking customer data.
- The automation profile is deliberately separate from the user's normal Chrome profile. Chrome refuses remote control of the default profile, and the split means a captured corporate session can never leak into — or be clobbered by — day-to-day browsing.
- The `/locate` endpoint now rejects folder names containing path separators or other invalid Windows filename characters.

## folder-module-2026-06-17 — Expediente / Folder enhancements
### Added
- Auto-detected Base Path: linking a folder now resolves its absolute path automatically (no manual typing / no prompt). New local-helper endpoint `/locate` finds the folder via a temporary marker file. Path also auto-detects on load and on demand when opening/copying.
- Windows-Explorer-style multi-selection (click, Ctrl+click, Shift+range) with a bulk action bar: Open all, Copy to Windows, Copy/Move (in-app), Pin, Delete.
- "Copy to Windows": copies the real files to the Windows clipboard (helper `/clipboard` -> PowerShell `Set-Clipboard`) so they can be pasted (Ctrl+V) into Explorer, Outlook or Teams — the reliable alternative to cross-app drag.
- Quick Access pins: pin files/folders to a right-side panel for fast navigation (persisted per opportunity+revision in IndexedDB, `services/folderPinsStore.ts`).
- Template flow rebuilt: pick template folder -> pick destination -> recursive copy of all files/subfolders named after the opportunity -> choose the whole folder or a subfolder (revision) as root.
- In-app drag to move: drop selected items onto a folder row to move them.
- Helper endpoints `/open-many` and `/reveal`.
### Changed
- All folder UI text moved to English.
### Fixed
- Opening files no longer fails when the helper hasn't been updated: `openManyNative` falls back to the legacy `/open` endpoint, and missing paths are resolved on the fly.
### Notes
- Real drag-and-drop of files into Outlook/Teams is not possible from a browser sandbox; superseded by "Copy to Windows" (clipboard). The local helper must be restarted (LANZAR_TENDERLOOP) to pick up `/locate`, `/clipboard`, `/open-many`, `/reveal`.
- Files touched: `features/opportunity-folder/OpportunityFolderTab.tsx`, `features/opportunity-folder/fileOps.ts`, `services/folderPinsStore.ts` (new), `server/openHelper.js`.

## stable-kpi-20260121
- Fixed: KPI full calendar now shows worked hours for Tendering.
- Fixed: KPI PDF export Gantt now renders day status colors (worked/waiting/inactive).

## v0.0.0 - 2024-01-21
### Added
- Project initialization.
