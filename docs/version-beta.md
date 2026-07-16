# TenderLoop — Version Beta

**Branch:** `version-beta`  
**Date:** 2026-07-16
**Base:** backend integration now incorporated into `main`

## Installation and use

Users can download this exact branch from GitHub using **Code -> Download ZIP**, or directly from:

`https://github.com/Alan-Merida-R/Tenderloop/archive/refs/heads/version-beta.zip`

Extract the ZIP, install Node.js 18+ LTS and run `LANZAR_TENDERLOOP.vbs`. The first run installs dependencies; later runs start the local app. See `MANUAL_USUARIO.md` for the complete Windows guide.

## Included baseline: backend integration

The backend work is now part of `main` and is the base for this beta:

- Express/TypeScript local backend replaces the former file-opening helper.
- Backend database storage was implemented.
- Persistent file revision history was added.
- Template-folder path resolution was fixed.
- SR imports use the requested expediente date.

## Changes included in this beta

### Quick Organizer and reminders

- Added a review-first Quick Organizer for weekly planning. TenderLoop prepares a prompt from the current workload, the user chooses where to process it, and the returned plan is parsed and previewed before any task schedule, reminder or due date is changed.
- Added a weekly agenda and review workspace for scheduled and unscheduled tasks, recommendations, blockers, delivery risks and missing-task suggestions.
- Added persistent reminders linked to opportunities, tasks and notes, with a header bell, overdue tracking, optional browser notifications and direct navigation.
- Removed the previous direct Google AI SDK/API-key integration and the legacy AI Thinking modal. TenderLoop no longer calls an AI provider directly for this workflow.

### Database and Windows integration

- Browser-selected database files can now be resolved by metadata through the local backend and opened natively when Windows finds exactly one matching indexed path.
- Persistence and normalization were expanded for reminder, planning and updated opportunity fields.

### Opportunity, dashboard and process

- Dashboard search now indexes the complete opportunity safely, including rich-text content, while excluding internal snapshots.
- A floating process-radial widget can be enabled and opened in its own window.
- Deep links can open a specific opportunity directly.
- Opportunity views, table controls, folder links and document pickers received usability and layout improvements.
- Internal commercial revisions are initialized and persisted with each opportunity.

### Contacts, tasks and SOW/KOM

- Global contacts and tracked areas can be managed centrally and used from opportunities.
- New opportunities include a Scope of Work (SOW) note by default.
- The SOW/KOM workflow supports a reusable global library, conditional questions, synchronized expediente fields, an Overview panel, backups and generated KOM meeting notes.
- Task assignment, stakeholders, roles, dates, worked/waiting tracking and KPI integration were expanded.

### Email drafts for Outlook

- Added a full email composer with six built-in draft types plus editable custom templates.
- Drafts are created only for review: Outlook classic uses COM when available and new Outlook uses an editable `.eml` fallback. The feature never sends email automatically.
- Supports recipients from stakeholders/contacts, attachments from the opportunity folder, editable HTML preview, validation, task reminders and generated-email history.
- Added dynamic salutations, simplified Status Reports, Price Approval executive summaries and Proposal Approval draft/final controls.
- Added task-assignment delivery fields, per-task reminders and an informed indicator after assignment messages are generated.

### Local data reliability and installation

- Backend saves are serialized to prevent concurrent autosave writes from overwriting each other.
- Automatic backups are throttled during frequent autosaves; an explicit backup still creates a fresh copy.
- Windows launch, install and uninstall scripts were refreshed, including a visual uninstaller that preserves user data.
- PWA/service-worker configuration was updated.

## Validation status

- The backend branch was already synchronized with GitHub before promotion to `main`.
- This beta will be checked with the production build and server TypeScript validation before publication.
- Manual UI validation remains appropriate for: the six Outlook draft flows, custom templates, SOW global-library synchronization, folder permissions and the Windows install/uninstall experience.

## Security hardening

- The local application and backend are restricted to loopback and trusted TenderLoop browser origins.
- HTML rendered from imported or user-provided content is sanitized.
- Dependency installation follows the committed lockfile and can repair an incomplete local installation in place.
- PDF and transitive dependency vulnerabilities identified by npm audit were updated. See `docs/security.md` for the remaining `xlsx` export-only advisory and security boundaries.

## Stability

- The PWA service worker is disabled while running the local Vite development server used by the Windows launcher. This prevents automatic development updates from repeatedly reloading the application; production builds still include the PWA service worker.

## Publishing rules

This branch includes the source code, scripts and documentation required by the Windows installer. The supported launcher is `ABRIR_TENDERLOOP.vbs`; no unsigned executable is required. It deliberately excludes local assistant/editor workspaces, permissions, temporary files, dependencies and generated build artifacts.
