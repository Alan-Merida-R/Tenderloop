# TenderLoop — Version Beta

**Branch:** `version-beta`  
**Date:** 2026-07-13  
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

## Publishing rules

This branch includes the source code, scripts, documentation and `TenderLoop.exe` required by the Windows installer. It deliberately excludes local editor permissions (`.claude/settings.local.json`) and generated development artifacts (`dev-dist/`).
