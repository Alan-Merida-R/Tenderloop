# Implementation Plan: Versioning System Refinement

The goal is to fix and complete the versioning system in TenderLoop to ensure a single active editable version, read-only historical snapshots, and correct reset/restore logic.

## 1. Core Logic & State Management

### A. Read-Only Enforcement
- Modify `handleFieldChange` to explicitly return early if `viewingVersionId` is set.
- Ensure `isWorkingCopy` (meaning "viewing a snapshot") is used to disable all interactive elements in the UI.

### B. New Version Creation (`handleCreateVersion`)
- **Validation**:
  - Check for mandatory `commitMessage`.
  - Check for `srId` (if empty, use from current `localOpp`, if still empty, block and alert).
  - Version Limit: Block creation if `localOpp.versions.length >= 10`.
  - If current version is "clean" (needs a heuristic, e.g., no notes, default status), show informative message but allow.
- **Process**:
  1. Create a `snapshot` of EXACTLY current `localOpp`.
  2. Clean the snapshot from recursive data (`history`, `versions`).
  3. Reset the `localOpp` (the active version) according to these rules:
     - **Preserve**: Opportunity ID, Title, Customer, Alias, Labels, Priority order, Task structure (Titles, Order, Assignment, Dependencies, Subtasks structure), Parent opportunity relation.
     - **Reset Header/Meta**:
       - `revision` (REF): Auto-increment (e.g. R4 -> R5).
       - `srId`: Propose from modal, then keep editable.
       - `description`: Clear.
       - `statusLabel`: 'In Progress'.
       - `detailedStatus`: 'Working on it'.
       - `stage`: '1. Intake'.
       - `priority`: 'Medium'.
       - `dates` (requested, expected, assigned): Clear.
       - `links` (Quick Links): Clear.
       - `presentation`: Reset all fields.
       - `history`: Clear.
     - **Reset Modules**:
       - `notes`: Clear all.
       - `questions`: Clear all.
       - `kpis`: Clear all (reset to defaults).
       - `folderLinked`: Reset/Clear official link.
     - **Reset Tasks**:
       - Keep structure but set `status` to 'Pending'.
       - Clear `dueDate`, `description`, `timeLogs`, `linkedNotes`.
       - Reset `subtasks` (all checked = false).
     - **Commercial**:
       - Clear all editable fields.
       - The UI will show the summary of the PREVIOUS version (from the snapshots list).
  4. Add the `snapshot` to `localOpp.versions`.
  5. Save to parent.

### C. Version Restoration (`handleRestoreVersion`)
- Create a NEW active version by copying exactly from an old snapshot.
- Current active version MUST be saved as a snapshot before restoring.
- Prompt for `commitMessage`, `srId`, `tags` for the new revision.
- Do NOT mutate existing snapshots.

## 2. UI / UX Enhancements

### A. Versions List
- Sort newest above.
- Add Search Bar filtering by: SR, Date, Tag, Commit Message.
- Display Format: `REF - commit message` + SR + Date + Tag.
- Actions on Historical Versions:
  - "Restore as New Version" (Standard restore flow).
  - "Edit Metadata" (Rename/Edit commit message, tags, SR).
  - "Delete" (Explicit confirmation).

### B. Commercial Tab
- If previous versions exist, show a non-editable banner with `CQA Official Sell` and `CQA Margin` from the last snapshot.

### C. Global Read-Only State
- When `viewingVersionId` is active:
  - Navigation allowed.
  - Disable all inputs, textareas, checkboxes.
  - Disable "Save", "Add", "Delete" buttons in all modules.

## 3. Compatibility & Performance
- Ensure reading older snapshots handles missing fields gracefully (defensive coding).
- Avoid deep cloning of versions list when creating snapshots.

## 4. Proposed Changes

- `components/OpportunityDetail.tsx`: Main logic for versioning, UI components, and state control.
- `types.ts`: Ensure `OpportunityVersion` and `Opportunity` types support all needed fields.
