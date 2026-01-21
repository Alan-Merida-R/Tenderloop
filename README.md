
# TenderLoop - Local Tendering Manager

A local-first, no-code style Tendering Management System for Schneider Electric processes using File System Access API.

## Features
- **Dashboard**: Track proposals and tasks with Kanban, Table, and Calendar views.
- **Rich Text Notes**: Create and manage meeting notes with templates and link them to tasks.
- **Commercial Management**: Calculate costs, margins, and discounts with automatic totalization.
- **PDF Export**: Generate professional tender documentation.
- **History Log**: Track the progression of support requests.

## Opportunity Folder
Associate a real local folder to each opportunity for integrated file management. Supports navigation, creation, renaming, and selective deletion.

### Document Classification & Links (NEW)
- **Type Metadata**: Assign a classification (Status, Info, Approvals, Proposal, etc.) to any file or folder. This is stored in **IndexedDB** locally.
- **Doc Linking**: Link specific files to **Tasks** or **Notes**.
- **Best-effort Native Open**: Open files directly via browser Blob URLs. No files are copied into the application storage; we reference the local filesystem handle.
- **.msg Support**: Outlook email files (.msg) are listed and can be linked/opened (limited preview support).

## Import / Export
Opportunities can be exported as portable JSON packages (`.oppkg.json`) to share between users.

- **Content**: The export includes all opportunity data, tasks, notes, questions, history, and document metadata (relative paths + relationships).
- **Files**: Physical files are **not** included. The export only contains metadata and relative paths.
- **Import Behavior**: Importing creates a *new* opportunity with a new ID to avoid collisions. All internal links (Task <-> Note) are preserved.
- **Folder Re-linking**: Because file handles are machine-specific, after importing an opportunity, you must re-link the root folder in the "Opportunity Folder" tab. The system will automatically resolve all document links using the stored relative paths.

### Requirements
- A Chromium-based browser (Chrome 86+, Edge 86+) is required for the File System Access API.
