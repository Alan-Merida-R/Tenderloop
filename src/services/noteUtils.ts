import { MeetingNote, NoteFolder } from '../types';

/** Sibling group key: notes/folders only compete for order within the same parent container. */
const noteContainerKey = (n: MeetingNote) => `${n.folderId || 'root'}::${n.parentId || ''}`;
const folderContainerKey = (f: NoteFolder) => f.parentFolderId || 'root';

/**
 * Re-indexes a single sibling group (same folder/parent) from 1..N by `order`,
 * leaving notes/folders in other containers untouched. Notes/folders missing
 * an `order` are placed last, in their current array order.
 */
function reindexGroup<T extends { order?: number }>(items: T[]): T[] {
    const sorted = [...items].sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
    return sorted.map((item, idx) => ({ ...item, order: idx + 1 }));
}

/**
 * Moves `targetNoteId` to `newFolderId`/`newParentId` (or within its current
 * container) and inserts it at `newIndex` among its new siblings, re-indexing
 * that sibling group. Other containers are left untouched.
 */
export function moveAndReorderNote(
    notes: MeetingNote[],
    targetNoteId: string,
    newFolderId: string | undefined,
    newParentId: string | undefined,
    newIndex: number,
    /** IDs in the order currently displayed to the user. */
    destinationOrderIds?: string[]
): MeetingNote[] {
    const target = notes.find(n => n.id === targetNoteId);
    if (!target) return notes;

    const moved: MeetingNote = { ...target, folderId: newFolderId, parentId: newParentId };
    const destKey = noteContainerKey(moved);

    const destSiblings = notes.filter(n => n.id !== targetNoteId && noteContainerKey(n) === destKey);
    const posIndex = Math.max(0, Math.min(newIndex, destSiblings.length));
    // `newIndex` is calculated from the visible tree.  Do not rebuild that list
    // from the raw storage array: old notes are normally displayed by date, so
    // doing so made a drop at the top appear at the bottom (or vice versa).
    const visiblePosition = new Map((destinationOrderIds || []).map((id, index) => [id, index]));
    const sortedDest = [...destSiblings].sort((a, b) => {
        const aPos = visiblePosition.get(a.id);
        const bPos = visiblePosition.get(b.id);
        if (aPos != null || bPos != null) return (aPos ?? Number.MAX_SAFE_INTEGER) - (bPos ?? Number.MAX_SAFE_INTEGER);
        return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
    });
    sortedDest.splice(posIndex, 0, moved);
    // `sortedDest` is already in the exact order requested by the drop.  Do not
    // pass it through reindexGroup (which sorts by the *previous* order again),
    // otherwise the visible move is silently undone.
    const reindexedDest = sortedDest.map((item, idx) => ({ ...item, order: idx + 1 }));
    const reindexedById = new Map(reindexedDest.map(n => [n.id, n]));

    return notes.map(n => reindexedById.get(n.id) || n);
}

/** Reorders a folder within its current parent (or moves it under `newParentFolderId`). */
export function moveAndReorderFolder(
    folders: NoteFolder[],
    targetFolderId: string,
    newParentFolderId: string | undefined,
    newIndex: number
): NoteFolder[] {
    const target = folders.find(f => f.id === targetFolderId);
    if (!target) return folders;

    const moved: NoteFolder = { ...target, parentFolderId: newParentFolderId };
    const destKey = folderContainerKey(moved);

    const destSiblings = folders.filter(f => f.id !== targetFolderId && folderContainerKey(f) === destKey);
    const posIndex = Math.max(0, Math.min(newIndex, destSiblings.length));
    const sortedDest = reindexGroup(destSiblings).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    sortedDest.splice(posIndex, 0, moved);
    const reindexedDest = reindexGroup(sortedDest);
    const reindexedById = new Map(reindexedDest.map(f => [f.id, f]));

    return folders.map(f => reindexedById.get(f.id) || f);
}

/** True if `candidateAncestorId` is `folderId` itself or one of its ancestors — guards against dropping a folder inside its own descendant. */
export function isFolderDescendantOf(folders: NoteFolder[], folderId: string, candidateAncestorId: string): boolean {
    let current = folders.find(f => f.id === folderId);
    while (current) {
        if (current.id === candidateAncestorId) return true;
        current = current.parentFolderId ? folders.find(f => f.id === current!.parentFolderId) : undefined;
    }
    return false;
}

/** Sort a list of notes/folders: by `order` if any sibling has one set, else by date/name (via fallback comparator). */
export function sortWithOrderFallback<T extends { order?: number }>(items: T[], fallback: (a: T, b: T) => number): T[] {
    const hasOrder = items.some(i => i.order != null);
    if (!hasOrder) return [...items].sort(fallback);
    return [...items].sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
}
