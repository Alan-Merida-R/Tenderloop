# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Fixed
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
