# Technical Documentation: TenderLoop & Tender Flow

This document provides a comprehensive overview of the architecture, performance optimizations, and data flow of the TenderLoop ecosystem (Loop DB & Tender Flow).

---

## 🏗️ 1. Architecture Overview

The system is a distributed React application that operates directly on the user's local file system using the **File System Access API**.

### Core Stack
- **Frontend:** React (TypeScript) + Vite/Next.js (Tender Flow).
- **Styling:** Vanilla CSS (Modern aesthetic with glassmorphism).
- **Database:** Local JSON files (Schema defined in `types.ts`).
- **Communication:** `BroadcastChannel` for cross-tab synchronization.

### Key Directory Structure
- `/App.tsx`: Main entry point, state management, and orchestration.
- `/components/Dashboard.tsx`: High-performance Kanban and list views.
- `/components/OpportunityDetail.tsx`: Complex form/note editor for "Expedientes".
- `/tender-flow/`: Strategic roadmap and logical map application.
- `/services/fileSystem.ts`: File I/O operations and permission management.

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
- **Tiered Autosave:** Disk writes are throttled to every 10 seconds to avoid IO bottlenecks.

---

## 🛡️ 4. Recovery & Stability

### Root Error Boundary
Located in `components/RootErrorBoundary.tsx`, it wraps the entire application.
- **Crash Detection:** If a corrupted database or a migration bug causes a "White Screen", the boundary catches it.
- **Emergency Reset:** Provides a button to clear the currently stuck database connection from `localStorage`, allowing the user to recover the app immediately.

---

## 📖 5. Developer Glossary: User Terminology Mapping

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

---

## 🗺️ 6. Tender Flow: Strategic Matrix Logic

The strategic layer (`tender-flow/`) handles complex decision trees and executive reporting using a high-performance "Backbone" architecture.

### A. Data Integrity & Deduplication
To prevent recursive item multiplication (e.g., importing a case into its own source):
- **ID-Based Guard:** The `parseExcelSheet` service uses a `seenIds` Set to ensure only one item per ID is added to the backbone.
- **System Injector Guard:** In `handleCreateNew`, the system auto-injects `SYS_*` fields (Alias, OP ID, Amount) only if they are not already present in the source snapshot.

### B. Versatile Responder Engine
The `MemoizedBackboneItem` dynamically adapts its UI based on `responseType` and `itemType`:
- **Selective UI:** Notes/Textarea are hidden for `boolean`, `link`, and `selection` types to maintain a minimalist executive dashboard.
- **Type Versatility:** Supports `text`, `string`, `number`, `date`, `link`, and `boolean` natively.
- **Visual Dependencies:** Locked items (unmet dependencies) remain visible to provide context, but inputs are disabled (`opacity: 0.5`, `cursor: not-allowed`).
