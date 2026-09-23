/**
 * Shared-DB storage for everything the user builds around the opportunity folder:
 * document attachments (classification, aliases, notes, task/note links), quick-access
 * pins and the manual file-revision log.
 *
 * WHY THIS EXISTS
 * ---------------
 * All of this used to live in per-browser IndexedDB (`TenderLoopDocMeta`,
 * `TenderLoopFolderPins`, `TenderLoopFileRevisionHistory`). IndexedDB is scoped to one
 * browser profile on one machine, so opening the app in a different browser — or after
 * a profile reset — showed a folder with no links, no pins and no history, and the user
 * had to re-link every file by hand.
 *
 * The opportunity JSON database is the only storage the whole team actually shares, so
 * it is now the source of truth. IndexedDB keeps exactly one job it cannot delegate:
 * holding `FileSystemDirectoryHandle`s, which are not serialisable and are inherently
 * per-browser (see opportunityFolderLink.ts). Everything else is mirrored here, and the
 * legacy IndexedDB contents are migrated in once per opportunity.
 *
 * NOTHING IS EVER DELETED AUTOMATICALLY. A file that vanishes from disk keeps its
 * record and its links and is flagged with `missingSince`; only an explicit user action
 * removes a record.
 */

import type { Opportunity, FolderDocRecord, FolderPinRecord, FileRevisionRecord } from '../types';

/**
 * Wiring supplied by App, which owns the database state.
 *
 * `mutate` takes a FUNCTION rather than a finished opportunity on purpose: folder
 * reconciliation, pin toggles and link edits can all land within the same tick, and a
 * read-modify-write built on a stale snapshot would silently drop one of them. The
 * mutator runs against whatever the database holds at commit time.
 */
export interface OpportunityFolderBridge {
  read: (opportunityId: string) => Opportunity | undefined;
  mutate: (opportunityId: string, mutator: (opp: Opportunity) => Opportunity) => void;
}

let bridge: OpportunityFolderBridge | null = null;

/**
 * Write-through projection of pending mutations.
 *
 * `mutate` ultimately lands in React state, which does not commit until the end of the
 * tick — but callers here read straight back after writing (save a link, then re-list
 * it; toggle a pin, then render the strip). Without this, those reads would return the
 * pre-write value and the UI would appear to lose the change.
 *
 * `source` is the exact opportunity object the projection was derived from. When the
 * bridge starts returning a different object the database has moved on (our own commit
 * landed, another tab synced, the user switched revision) and the projection is dropped
 * in favour of the real value.
 */
const projection = new Map<string, { source: Opportunity | undefined; value: Opportunity }>();

export const registerOpportunityFolderBridge = (next: OpportunityFolderBridge | null) => {
  bridge = next;
  projection.clear();
};

/** True once App has wired the bridge. Used to no-op safely in isolation/tests. */
export const isFolderStoreReady = () => bridge !== null;

const readOpp = (opportunityId: string): Opportunity | undefined => {
  const source = bridge?.read(opportunityId);
  const pending = projection.get(opportunityId);
  if (pending && pending.source === source) return pending.value;
  if (pending) projection.delete(opportunityId);
  return source;
};

const mutateOpp = (opportunityId: string, mutator: (opp: Opportunity) => Opportunity) => {
  if (!bridge) return;
  const current = readOpp(opportunityId);
  if (current) {
    const next = mutator(current);
    if (next === current) return; // mutator decided nothing changed — skip the commit
    projection.set(opportunityId, { source: bridge.read(opportunityId), value: next });
  }
  // Re-run the mutator against whatever the database holds at commit time rather than
  // pushing `next`, so concurrent writes in the same tick compose instead of clobbering.
  bridge.mutate(opportunityId, mutator);
};

const nowIso = () => new Date().toISOString();

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The shared-DB folder paths for an opportunity, or undefined when unknown. */
export const readOpportunityFolderPaths = (opportunityId: string): Record<string, string> | undefined =>
  readOpp(opportunityId)?.folderPaths;

/**
 * Record the absolute folder path for one revision.
 *
 * Deliberately routed through the same functional mutate as documents and pins rather
 * than through App's `updateOpportunity`. That helper commits inside
 * `React.startTransition` from a captured opportunity snapshot, so a path write queued
 * next to a pin or attachment write could land later and overwrite it with the
 * pre-write value. Going through the bridge makes every folder write compose.
 *
 * An empty path is ignored — see setRootPathDisplay in opportunityFolderLink.ts for why
 * blanking a known-good path is never what the caller wants.
 */
export const setFolderPath = (opportunityId: string, revision: string, path: string) => {
  if (!path || !path.trim()) return;
  const clean = path.trim();
  mutateOpp(opportunityId, opp => {
    const paths = opp.folderPaths || {};
    if (paths[revision] === clean && opp.folderLinked) return opp;
    return { ...opp, folderLinked: true, folderPaths: { ...paths, [revision]: clean } };
  });
};

/**
 * Erase the recorded path for one revision.
 *
 * The deliberate counterpart to setFolderPath's "an empty path is ignored" rule.
 * Re-linking an opportunity to a DIFFERENT folder has to be able to drop the old
 * path: keeping it meant a template created for an opportunity that already had a
 * folder stayed pointed at the previous location, and every open/copy action went
 * to the old folder while the tab listed the new one.
 */
export const clearFolderPath = (opportunityId: string, revision: string) => {
  mutateOpp(opportunityId, opp => {
    const paths = opp.folderPaths || {};
    if (!(revision in paths)) return opp;
    const next = { ...paths };
    delete next[revision];
    return { ...opp, folderPaths: next, folderLinked: Object.keys(next).length > 0 };
  });
};

/**
 * Add paths recovered from an older browser-local installation to the shared DB.
 * Existing shared paths always win: an old browser must never overwrite a newer
 * folder change made by another browser or app version.
 */
export const mergeFolderPaths = (opportunityId: string, recovered: Record<string, string>) => {
  const cleanEntries = Object.entries(recovered)
    .map(([revision, value]) => [revision.trim(), typeof value === 'string' ? value.trim() : ''] as const)
    .filter(([, value]) => !!value);
  if (!cleanEntries.length) return;

  mutateOpp(opportunityId, opp => {
    const paths = { ...(opp.folderPaths || {}) };
    let changed = false;
    for (const [revision, value] of cleanEntries) {
      if (paths[revision]) continue;
      paths[revision] = value;
      changed = true;
    }
    if (!changed && opp.folderLinked) return opp;
    return { ...opp, folderLinked: true, folderPaths: paths };
  });
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const listDocs = (opportunityId: string): FolderDocRecord[] => readOpp(opportunityId)?.folderDocs || [];

/** Find a doc by its CURRENT key, falling back to any key it used to have. */
export const findDoc = (docs: FolderDocRecord[], fileKey: string): FolderDocRecord | undefined =>
  docs.find(d => d.fileKey === fileKey) || docs.find(d => (d.previousKeys || []).includes(fileKey));

export const getDoc = (opportunityId: string, fileKey: string): FolderDocRecord | undefined =>
  findDoc(listDocs(opportunityId), fileKey);

const emptyDoc = (id: string, fileKey: string, stamp: string): FolderDocRecord => ({
  id,
  fileKey,
  name: fileKey.split('/').pop() || fileKey,
  linkedTaskIds: [],
  linkedNoteIds: [],
  firstSeenAt: stamp,
  updatedAt: stamp,
});

/**
 * Create-or-update the record for `fileKey`. Only the supplied fields change; a doc
 * that already exists under a previous key is updated in place rather than duplicated.
 */
export const upsertDoc = (opportunityId: string, fileKey: string, patch: Partial<FolderDocRecord>) => {
  // Generated OUTSIDE the mutator: mutateOpp applies it twice (once to project the
  // result, once against the committed database) and both runs must agree on the id.
  const freshId = newId();
  const stamp = nowIso();
  mutateOpp(opportunityId, opp => {
    const docs = opp.folderDocs || [];
    const existing = findDoc(docs, fileKey);
    if (!existing) {
      return { ...opp, folderDocs: [...docs, { ...emptyDoc(freshId, fileKey, stamp), ...patch, fileKey }] };
    }
    return {
      ...opp,
      folderDocs: docs.map(d => (d.id === existing.id ? { ...d, ...patch, updatedAt: stamp } : d)),
    };
  });
};

/**
 * Explicit user removal — the ONLY way a record leaves the database. Detaching the
 * document from the app is deliberately separate from the file's fate on disk.
 */
export const deleteDoc = (opportunityId: string, docId: string) => {
  mutateOpp(opportunityId, opp => ({
    ...opp,
    folderDocs: (opp.folderDocs || []).filter(d => d.id !== docId),
  }));
};

/**
 * Re-point a record at a new path, remembering where it used to live.
 *
 * Used both by an in-app rename and by reconciliation when a file is found again at a
 * different name. Keeping the old key in `previousKeys` is what allows the record to be
 * re-attached if that name ever comes back.
 */
export const rebindDoc = (opportunityId: string, docId: string, newFileKey: string) => {
  mutateOpp(opportunityId, opp => ({
    ...opp,
    folderDocs: (opp.folderDocs || []).map(d => {
      if (d.id !== docId || d.fileKey === newFileKey) return d;
      const history = d.previousKeys || [];
      return {
        ...d,
        fileKey: newFileKey,
        name: newFileKey.split('/').pop() || newFileKey,
        previousKeys: history.includes(d.fileKey) ? history : [...history, d.fileKey],
        missingSince: null,
        lastSeenAt: nowIso(),
        updatedAt: nowIso(),
      };
    }),
  }));
};

export const listDocsForTask = (opportunityId: string, taskId: string): FolderDocRecord[] =>
  listDocs(opportunityId).filter(d => d.linkedTaskIds.includes(taskId));

export const listDocsForNote = (opportunityId: string, noteId: string): FolderDocRecord[] =>
  listDocs(opportunityId).filter(d => d.linkedNoteIds.includes(noteId));

// ---------------------------------------------------------------------------
// Reconciliation — matching records against what is actually on disk
// ---------------------------------------------------------------------------

export interface DiskEntry {
  /** Relative path from the folder root, joined with '/'. */
  fileKey: string;
  name: string;
  size?: number;
  mtime?: number;
}

export interface ReconcileResult {
  docs: FolderDocRecord[];
  /** True when anything changed and the caller should persist. */
  changed: boolean;
}

/** Same file, moved or renamed: size and mtime are preserved by a rename on every OS. */
const isSameFile = (doc: FolderDocRecord, entry: DiskEntry): boolean =>
  doc.size !== undefined &&
  doc.mtime !== undefined &&
  entry.size !== undefined &&
  entry.mtime !== undefined &&
  doc.size === entry.size &&
  Math.abs(doc.mtime - entry.mtime) < 2000; // filesystems round mtime differently

const dirOf = (fileKey: string) => fileKey.split('/').slice(0, -1).join('/');

/**
 * Match the stored records for ONE directory against the entries currently on disk.
 *
 * Only records that live in `directory` are considered, because that is all the listing
 * can speak to — a record elsewhere in the tree must not be declared missing just
 * because it is not in the folder the user happens to be looking at.
 *
 * Resolution order, most to least certain:
 *   1. exact path match                  -> present, refresh fingerprint
 *   2. fingerprint match (size + mtime)  -> renamed, follow it
 *   3. a previous name reappeared        -> restored, re-attach
 *   4. nothing matched                   -> flag missing, KEEP the record and its links
 */
export const reconcileDirectory = (
  docs: FolderDocRecord[],
  directory: string,
  entries: DiskEntry[],
): ReconcileResult => {
  const inDir = docs.filter(d => dirOf(d.fileKey) === directory);
  if (inDir.length === 0 && entries.length === 0) return { docs, changed: false };

  const byKey = new Map(entries.map(e => [e.fileKey, e]));
  const claimed = new Set<string>();
  const updates = new Map<string, FolderDocRecord>();
  const stamp = nowIso();

  // Pass 1 — exact path still on disk.
  for (const doc of inDir) {
    const hit = byKey.get(doc.fileKey);
    if (!hit) continue;
    claimed.add(hit.fileKey);
    if (doc.missingSince || doc.size !== hit.size || doc.mtime !== hit.mtime) {
      updates.set(doc.id, { ...doc, size: hit.size, mtime: hit.mtime, missingSince: null, lastSeenAt: stamp, updatedAt: stamp });
    }
  }

  // A record is resolved only if its own path is still on disk; everything else has
  // to be matched by identity below.
  const unresolved = inDir.filter(d => !byKey.has(d.fileKey));
  const free = entries.filter(e => !claimed.has(e.fileKey));

  for (const doc of unresolved) {
    // Pass 2 — renamed in place: same bytes, same timestamp, different name.
    const renamed = free.find(e => !claimed.has(e.fileKey) && isSameFile(doc, e));
    // Pass 3 — a name this document used before is back on disk.
    const restored = renamed
      ? undefined
      : free.find(e => !claimed.has(e.fileKey) && (doc.previousKeys || []).includes(e.fileKey));

    const match = renamed || restored;
    if (match) {
      claimed.add(match.fileKey);
      const history = doc.previousKeys || [];
      updates.set(doc.id, {
        ...doc,
        fileKey: match.fileKey,
        name: match.name,
        previousKeys: history.includes(doc.fileKey) || doc.fileKey === match.fileKey ? history : [...history, doc.fileKey],
        size: match.size,
        mtime: match.mtime,
        missingSince: null,
        lastSeenAt: stamp,
        updatedAt: stamp,
      });
      continue;
    }

    // Pass 4 — genuinely absent. Flag it, never drop it; the links stay usable the
    // moment the file comes back. Don't rewrite the timestamp on every listing.
    if (!doc.missingSince) {
      updates.set(doc.id, { ...doc, missingSince: stamp, updatedAt: stamp });
    }
  }

  if (updates.size === 0) return { docs, changed: false };
  return { docs: docs.map(d => updates.get(d.id) || d), changed: true };
};

/** Apply reconcileDirectory against the shared DB. */
export const reconcileDocsForDirectory = (opportunityId: string, directory: string, entries: DiskEntry[]) => {
  mutateOpp(opportunityId, opp => {
    const { docs, changed } = reconcileDirectory(opp.folderDocs || [], directory, entries);
    return changed ? { ...opp, folderDocs: docs } : opp;
  });
};

// ---------------------------------------------------------------------------
// Quick-access pins
// ---------------------------------------------------------------------------

const pinsFor = (opp: Opportunity | undefined, storageKey: string): FolderPinRecord[] =>
  (opp?.folderPins || {})[storageKey] || [];

export const listPins = (opportunityId: string, storageKey: string): FolderPinRecord[] =>
  pinsFor(readOpp(opportunityId), storageKey);

export const addPinRecord = (opportunityId: string, storageKey: string, pin: Omit<FolderPinRecord, 'addedAt'>) => {
  mutateOpp(opportunityId, opp => {
    const all = opp.folderPins || {};
    const current = all[storageKey] || [];
    if (current.some(p => p.key === pin.key)) return opp;
    return { ...opp, folderPins: { ...all, [storageKey]: [...current, { ...pin, addedAt: nowIso() }] } };
  });
};

export const removePinRecord = (opportunityId: string, storageKey: string, key: string) => {
  mutateOpp(opportunityId, opp => {
    const all = opp.folderPins || {};
    const current = all[storageKey] || [];
    if (!current.some(p => p.key === key)) return opp;
    return { ...opp, folderPins: { ...all, [storageKey]: current.filter(p => p.key !== key) } };
  });
};

export const movePinRecord = (opportunityId: string, storageKey: string, key: string, direction: -1 | 1) => {
  mutateOpp(opportunityId, opp => {
    const all = opp.folderPins || {};
    const current = all[storageKey] || [];
    const index = current.findIndex(pin => pin.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return opp;
    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return { ...opp, folderPins: { ...all, [storageKey]: reordered } };
  });
};

/**
 * Copy pins from one revision's storage key to another.
 *
 * Pins are stored relative to the folder root, so a new revision that reuses the same
 * folder structure — or the same folder at a moved path — inherits working pins without
 * the user re-pinning anything.
 */
export const inheritPins = (opportunityId: string, fromKey: string, toKey: string) => {
  mutateOpp(opportunityId, opp => {
    const all = opp.folderPins || {};
    if ((all[toKey] || []).length > 0) return opp; // never overwrite existing pins
    const source = all[fromKey] || [];
    if (source.length === 0) return opp;
    return { ...opp, folderPins: { ...all, [toKey]: source.map(p => ({ ...p })) } };
  });
};

// ---------------------------------------------------------------------------
// File revision history
// ---------------------------------------------------------------------------

export const listRevisionHistory = (opportunityId: string, familyIdOrKey: string): FileRevisionRecord[] =>
  (readOpp(opportunityId)?.fileRevisionHistory || [])
    .filter(e => (e.familyId || e.familyKey) === familyIdOrKey)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** Every revision-history entry for an opportunity, oldest first. */
export const listAllRevisionHistory = (opportunityId: string): FileRevisionRecord[] =>
  [...(readOpp(opportunityId)?.fileRevisionHistory || [])]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const addRevisionRecord = (
  opportunityId: string,
  entry: Omit<FileRevisionRecord, 'id' | 'createdAt'>,
): FileRevisionRecord => {
  const saved: FileRevisionRecord = { ...entry, id: newId(), createdAt: nowIso() };
  mutateOpp(opportunityId, opp => ({ ...opp, fileRevisionHistory: [...(opp.fileRevisionHistory || []), saved] }));
  return saved;
};

export const updateRevisionRecord = (
  opportunityId: string,
  entryId: string,
  updates: Pick<FileRevisionRecord, 'changes' | 'reason'>,
) => {
  mutateOpp(opportunityId, opp => ({
    ...opp,
    fileRevisionHistory: (opp.fileRevisionHistory || []).map(e =>
      e.id === entryId ? { ...e, ...updates, updatedAt: nowIso() } : e,
    ),
  }));
};

/**
 * Removes only the manual log entry — an explicit user action that never touches the
 * physical file.
 */
export const deleteRevisionRecord = (opportunityId: string, entryId: string) => {
  mutateOpp(opportunityId, opp => {
    const history = opp.fileRevisionHistory || [];
    if (!history.some(e => e.id === entryId)) return opp;
    return { ...opp, fileRevisionHistory: history.filter(e => e.id !== entryId) };
  });
};

export const assignRevisionFamilyId = (opportunityId: string, legacyFamilyKey: string, familyId: string) => {
  mutateOpp(opportunityId, opp => ({
    ...opp,
    fileRevisionHistory: (opp.fileRevisionHistory || []).map(e =>
      e.familyKey === legacyFamilyKey && e.familyId !== familyId ? { ...e, familyId, updatedAt: e.updatedAt || nowIso() } : e,
    ),
  }));
};

// ---------------------------------------------------------------------------
// One-time migration out of the legacy per-browser IndexedDB stores
// ---------------------------------------------------------------------------

const openLegacyDb = (name: string, version: number, stores: string[]): Promise<IDBDatabase | null> =>
  new Promise(resolve => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, version);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      stores.forEach(store => {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

const readAllEntries = (db: IDBDatabase, storeName: string): Promise<{ key: string; value: any }[]> =>
  new Promise(resolve => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const out: { key: string; value: any }[] = [];
    try {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        out.push({ key: String(cursor.primaryKey), value: cursor.value });
        cursor.continue();
      };
      request.onerror = () => resolve(out);
    } catch {
      resolve(out);
    }
  });

/**
 * Copy this opportunity's legacy IndexedDB folder metadata into the shared DB.
 *
 * Runs at most once per opportunity (guarded by `folderDataMigrated`) and is purely
 * additive: an entry already present in the shared DB always wins, so a browser that
 * still holds stale IndexedDB rows can never clobber newer shared data. The legacy
 * stores are intentionally left untouched — if anything goes wrong the old data is
 * still there to migrate again.
 */
export const migrateLegacyFolderData = async (opportunityId: string): Promise<void> => {
  const opp = readOpp(opportunityId);
  if (!opp || opp.folderDataMigrated) return;

  const legacyDocs: FolderDocRecord[] = [];
  const legacyPins: Record<string, FolderPinRecord[]> = {};
  const legacyHistory: FileRevisionRecord[] = [];
  const stamp = nowIso();

  const metaDb = await openLegacyDb('TenderLoopDocMeta', 2, ['docMeta']);
  if (metaDb) {
    const rows = await readAllEntries(metaDb, 'docMeta');
    for (const { key, value } of rows) {
      if (!key.startsWith(`${opportunityId}||`)) continue;
      const fileKey = key.slice(opportunityId.length + 2);
      if (!fileKey) continue;
      legacyDocs.push({
        id: newId(),
        fileKey,
        name: fileKey.split('/').pop() || fileKey,
        docType: value?.docType || '',
        alias: value?.alias || '',
        editableStatus: value?.editableStatus || '',
        internalNotes: value?.internalNotes || '',
        revisionFamilyId: value?.revisionFamilyId || '',
        linkedTaskIds: Array.isArray(value?.linkedTaskIds) ? value.linkedTaskIds : [],
        linkedNoteIds: Array.isArray(value?.linkedNoteIds) ? value.linkedNoteIds : [],
        firstSeenAt: value?.updatedAt || stamp,
        updatedAt: value?.updatedAt || stamp,
      });
    }
    metaDb.close();
  }

  const pinsDb = await openLegacyDb('TenderLoopFolderPins', 1, ['pins']);
  if (pinsDb) {
    const rows = await readAllEntries(pinsDb, 'pins');
    for (const { key, value } of rows) {
      // Pins are keyed by folder storage key: `oppId` or `oppId::revision`.
      if (key !== opportunityId && !key.startsWith(`${opportunityId}::`)) continue;
      if (!Array.isArray(value)) continue;
      legacyPins[key] = value
        .map((p: any): FolderPinRecord => ({
          key: String(p?.key || ''),
          name: String(p?.name || ''),
          kind: p?.kind === 'directory' ? 'directory' : 'file',
          relativePath: Array.isArray(p?.relativePath) ? p.relativePath : [],
          addedAt: p?.addedAt || stamp,
        }))
        .filter((p: FolderPinRecord) => !!p.key);
    }
    pinsDb.close();
  }

  const historyDb = await openLegacyDb('TenderLoopFileRevisionHistory', 1, []);
  if (historyDb) {
    const rows = await readAllEntries(historyDb, 'fileRevisions');
    for (const { value } of rows) {
      if (value?.opportunityId !== opportunityId) continue;
      legacyHistory.push(value as FileRevisionRecord);
    }
    historyDb.close();
  }

  mutateOpp(opportunityId, current => {
    if (current.folderDataMigrated) return current;

    const docs = [...(current.folderDocs || [])];
    for (const legacy of legacyDocs) {
      if (findDoc(docs, legacy.fileKey)) continue; // shared DB already knows this file
      docs.push(legacy);
    }

    const pins = { ...(current.folderPins || {}) };
    for (const [key, value] of Object.entries(legacyPins)) {
      if ((pins[key] || []).length > 0) continue;
      pins[key] = value;
    }

    const historyIds = new Set((current.fileRevisionHistory || []).map(e => e.id));
    const history = [...(current.fileRevisionHistory || []), ...legacyHistory.filter(e => !historyIds.has(e.id))];

    return {
      ...current,
      folderDocs: docs,
      folderPins: pins,
      fileRevisionHistory: history,
      folderDataMigrated: true,
    };
  });
};
