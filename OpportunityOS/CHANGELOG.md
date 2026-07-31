# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Added a Quick Organizer workflow that exports current workload context as a copy/paste prompt, imports a reviewed response, previews the resulting weekly agenda, reminders and due-date adjustments, and applies changes only after explicit confirmation.
- Added persistent user reminders linked to opportunities, tasks or notes, including a header bell, overdue state, browser notifications, configurable sound and direct navigation to the linked item.
- Added agenda-oriented task planning improvements, dashboard indicators and expanded opportunity quick views for prioritization and follow-up.
- Added backend-assisted database file resolution and native opening so a browser-selected database can be matched safely to one unambiguous Windows path.

### Changed
- Simplified Windows startup to one normal visible entry point: `ABRIR_TENDERLOOP.vbs`. It hides the internal launcher and installer files on first use, opens setup automatically when required, and leaves `motor_tenderloop.bat` visible as the recovery path for restrictive computers.
- Expanded task, opportunity, SOW and email data handling so new planning and reminder fields survive backend persistence, import/export and existing-data normalization.
- Updated the embedded SOW form, dashboards, settings and email workflows with the latest usability and data-consistency improvements.

### Removed
- Removed the direct Google AI SDK integration, API-key ambient declaration and legacy AI Thinking modal. The Quick Organizer uses an explicit copy/paste review flow and does not send project data to an AI provider from TenderLoop.

### Fixed
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
