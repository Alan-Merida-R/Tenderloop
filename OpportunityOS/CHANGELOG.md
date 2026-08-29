# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [Unreleased]
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
