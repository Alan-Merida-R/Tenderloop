
/**
 * Persistence for the link between an opportunity and its folder on disk.
 *
 * TWO LAYERS, DELIBERATELY:
 *
 * 1. `FileSystemDirectoryHandle` — IndexedDB, unavoidably per browser profile. Handles
 *    are not serialisable, so they cannot be shared. A handle buys direct read/write
 *    access without the local helper.
 * 2. The absolute PATH — mirrored into the shared JSON DB (`opportunity.folderPaths`).
 *    Any browser or machine running the local helper can browse and open files from the
 *    path alone, so a missing handle is an inconvenience, never a lost link.
 *
 * The guiding rule everywhere below: a link is only ever considered lost when the local
 * helper positively reports the path as gone. Never because a handle is absent, never
 * because the user opened a different browser, never because a new revision was created,
 * and never because auto-detection happened to fail this time.
 */

import { readOpportunityFolderPaths } from './opportunityFolderStore';

const DB_NAME = 'OpportunityFolderDB';
const STORE_NAME = 'Handles';
const META_STORE = 'Meta';
const DB_VERSION = 2;
const LEGACY_DB_NAME = 'TenderLoopFolders';
const LEGACY_HANDLE_STORE = 'handles';

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Storage key for a folder link. Folders are linked PER REVISION so that each
 * revision (R0, R1, ...) keeps its own folder and viewing an old revision shows
 * the folder that was linked to it. A missing/empty revision falls back to the
 * bare opportunityId (legacy single-folder scheme).
 */
export const folderKey = (opportunityId: string, revision?: string): string =>
  revision && revision.trim() ? `${opportunityId}::${revision.trim()}` : opportunityId;

/** True when `key` belongs to `opportunityId` (either the bare id or `id::revision`). */
const keyBelongsTo = (key: string, opportunityId: string): boolean =>
  key === opportunityId || key.startsWith(`${opportunityId}::`);

/** Every stored handle key for an opportunity, across all revisions. */
const listHandleKeys = async (opportunityId: string): Promise<string[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys();
    request.onsuccess = () =>
      resolve((request.result as IDBValidKey[]).map(String).filter(k => keyBelongsTo(k, opportunityId)));
    request.onerror = () => reject(request.error);
  });
};

/** Read the single-folder handle used before OpportunityFolderDB existed. */
const getLegacyFolderHandle = async (opportunityId: string): Promise<FileSystemDirectoryHandle | null> =>
  new Promise(resolve => {
    try {
      const request = indexedDB.open(LEGACY_DB_NAME, 1);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LEGACY_HANDLE_STORE)) {
          db.close();
          resolve(null);
          return;
        }
        const read = db.transaction(LEGACY_HANDLE_STORE, 'readonly').objectStore(LEGACY_HANDLE_STORE).get(opportunityId);
        read.onsuccess = () => { const handle = read.result || null; db.close(); resolve(handle); };
        read.onerror = () => { db.close(); resolve(null); };
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

/**
 * Read every absolute path left by older app versions in this browser's IndexedDB.
 * The bare opportunity id is the legacy single-folder key; `id::revision` is the
 * newer per-revision form. Nothing is deleted, so this import is safe to repeat.
 */
export const getStoredFolderPaths = async (opportunityId: string): Promise<Record<string, string>> => {
  const db = await getDB();
  return new Promise(resolve => {
    const paths: Record<string, string> = {};
    try {
      const request = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(paths);
          return;
        }
        const key = String(cursor.primaryKey);
        const value = typeof cursor.value === 'string' ? cursor.value.trim() : '';
        if (value && keyBelongsTo(key, opportunityId)) {
          const revision = key === opportunityId ? '' : key.slice(opportunityId.length + 2).trim();
          if (revision || key === opportunityId) paths[revision] = value;
        }
        cursor.continue();
      };
      request.onerror = () => resolve(paths);
    } catch {
      resolve(paths);
    }
  });
};

/**
 * Read a handle for a specific revision.
 *
 * Falls back to the legacy global key and then to ANY handle stored for this
 * opportunity. That last step is what keeps a newly created revision usable: revisions
 * of one opportunity live in the same folder tree far more often than not, so inheriting
 * the previous revision's handle is right in the common case and harmless otherwise —
 * the user can always re-link, and the per-revision key is written the moment they do.
 */
export const getFolderHandleForRevision = async (opportunityId: string, revision?: string): Promise<FileSystemDirectoryHandle | null> => {
  const primary = await getFolderHandle(folderKey(opportunityId, revision));
  if (primary) return primary;
  if (!revision || !revision.trim()) {
    const oldHandle = await getLegacyFolderHandle(opportunityId);
    if (oldHandle) await setFolderHandle(opportunityId, oldHandle);
    return oldHandle;
  }

  const legacy = await getFolderHandle(opportunityId);
  if (legacy) return legacy;

  try {
    const keys = await listHandleKeys(opportunityId);
    for (const key of keys) {
      const handle = await getFolderHandle(key);
      if (handle) return handle;
    }
  } catch {
    // Enumeration is a best-effort convenience; never fail the lookup over it.
  }

  // Last-resort upgrade path from releases that stored one handle in
  // TenderLoopFolders/handles. Preserve it under both the legacy key and the current
  // revision so the normal path auto-detection can subsequently write its path to DB.
  const oldHandle = await getLegacyFolderHandle(opportunityId);
  if (oldHandle) {
    await setFolderHandle(opportunityId, oldHandle);
    if (revision?.trim()) await setFolderHandle(folderKey(opportunityId, revision), oldHandle);
    return oldHandle;
  }
  return null;
};

/** Path-display counterpart to getFolderHandleForRevision (same inheritance rules). */
export const getRootPathDisplayForRevision = async (opportunityId: string, revision?: string): Promise<string> => {
  const primary = await getRootPathDisplay(folderKey(opportunityId, revision));
  if (primary) return primary;
  if (!revision || !revision.trim()) return '';

  const legacy = await getRootPathDisplay(opportunityId);
  if (legacy) return legacy;

  try {
    const keys = await listHandleKeys(opportunityId);
    for (const key of keys) {
      const path = await getRootPathDisplay(key);
      if (path) return path;
    }
  } catch {
    // best effort
  }
  return '';
};

/**
 * Pick the best known absolute path for a revision out of the shared DB.
 *
 * Order: the revision's own path, then the legacy unkeyed path, then the most recently
 * recorded path for any other revision. Object keys preserve insertion order through the
 * JSON round-trip, so the last entry is the one written most recently.
 *
 * Inheriting across revisions is the whole point: creating R1 must not force the user to
 * re-link a folder they already linked for R0.
 */
export const resolveFolderPathFromDb = (
  folderPaths: Record<string, string> | undefined,
  revision?: string,
): string => {
  if (!folderPaths) return '';
  const rev = (revision || '').trim();
  if (rev && folderPaths[rev]) return folderPaths[rev];
  if (folderPaths['']) return folderPaths[''];
  const values = Object.entries(folderPaths)
    .filter(([key, value]) => key !== rev && !!value)
    .map(([, value]) => value);
  return values.length ? values[values.length - 1] : '';
};

/**
 * The absolute folder path to actually use for an opportunity + revision, checking
 * every layer: this browser's IndexedDB first (fastest, and the most specific), then
 * the shared database.
 *
 * This is what any feature outside the Folder tab should call. Reading IndexedDB alone
 * is why linked documents and email attachments reported "set the folder base path
 * first" on a machine that had simply never linked the folder itself, even though the
 * path was sitting in the shared database the whole time.
 */
export const resolveEffectiveRootPath = async (opportunityId: string, revision?: string): Promise<string> => {
  const local = await getRootPathDisplayForRevision(opportunityId, revision);
  if (local) return local;
  const shared = resolveFolderPathFromDb(readOpportunityFolderPaths(opportunityId), revision);
  if (shared) {
    // Cache it locally so subsequent lookups in this browser skip the DB hop.
    try { await setRootPathDisplay(folderKey(opportunityId, revision), shared); } catch { /* non-critical */ }
  }
  return shared;
};

/**
 * Copy the folder link (handle + display path) from one revision to another.
 * Used when a new revision is created and the user chooses to reuse the previous
 * revision's folder. Returns true if a source handle existed and was copied.
 */
export const copyFolderLinkToRevision = async (opportunityId: string, fromRevision: string, toRevision: string): Promise<boolean> => {
  const handle = await getFolderHandleForRevision(opportunityId, fromRevision);
  if (!handle) return false;
  await setFolderHandle(folderKey(opportunityId, toRevision), handle);
  const path = await getRootPathDisplayForRevision(opportunityId, fromRevision);
  if (path) await setRootPathDisplay(folderKey(opportunityId, toRevision), path);
  return true;
};

/**
 * Promote the legacy opportunity-level folder key to a per-revision key.
 *
 * The legacy entry is deliberately KEPT. It used to be deleted here, which quietly broke
 * every future revision: once R0 owned the only copy of the handle, creating R1 found
 * nothing under `id::R1` and nothing under the (now erased) legacy key, so the user was
 * asked to re-link a folder that had never moved. Leaving the legacy entry in place costs
 * one IndexedDB row and makes it the permanent fallback for every revision.
 */
export const moveLegacyFolderLinkToRevision = async (opportunityId: string, revision: string): Promise<boolean> => {
  const trimmedRevision = revision.trim();
  if (!trimmedRevision) return false;

  const revisionKey = folderKey(opportunityId, trimmedRevision);
  const existingRevisionHandle = await getFolderHandle(revisionKey);
  if (existingRevisionHandle) return false;

  const legacyHandle = await getFolderHandle(opportunityId);
  if (!legacyHandle) return false;

  const legacyPath = await getRootPathDisplay(opportunityId);
  await setFolderHandle(revisionKey, legacyHandle);
  if (legacyPath) await setRootPathDisplay(revisionKey, legacyPath);
  return true;
};

export const setFolderHandle = async (opportunityId: string, handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(handle, opportunityId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getFolderHandle = async (opportunityId: string): Promise<FileSystemDirectoryHandle | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(opportunityId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Store the absolute path for a folder key.
 *
 * An empty `path` is ignored rather than written. Callers reach here from
 * auto-detection, which fails transiently whenever the local helper is starting up or
 * the folder sits outside the indexed locations — and blanking a path that was already
 * proven good turns a momentary hiccup into a permanently broken link. Use
 * `clearRootPathDisplay` when erasing is genuinely intended.
 */
export const setRootPathDisplay = async (opportunityId: string, path: string): Promise<void> => {
  if (!path || !path.trim()) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, 'readwrite');
    const store = transaction.objectStore(META_STORE);
    const request = store.put(path.trim(), opportunityId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/** Explicit erase of a stored path — only for a deliberate unlink. */
export const clearRootPathDisplay = async (opportunityId: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, 'readwrite');
    const request = transaction.objectStore(META_STORE).delete(opportunityId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getRootPathDisplay = async (opportunityId: string): Promise<string> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, 'readonly');
    const store = transaction.objectStore(META_STORE);
    const request = store.get(opportunityId);
    request.onsuccess = () => resolve(request.result || '');
    request.onerror = () => reject(request.error);
  });
};

export const clearFolderHandle = async (opportunityId: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, META_STORE], 'readwrite');
    transaction.objectStore(STORE_NAME).delete(opportunityId);
    transaction.objectStore(META_STORE).delete(opportunityId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const verifyPermission = async (handle: FileSystemHandle, readWrite: boolean = false): Promise<boolean> => {
  const options: any = {
    mode: readWrite ? 'readwrite' : 'read',
  };
  // @ts-ignore
  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }
  // @ts-ignore
  if ((await handle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
};
