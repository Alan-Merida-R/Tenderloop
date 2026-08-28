
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

import { readOpportunityFolderPaths, setFolderPath } from './opportunityFolderStore';

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
 * True once this opportunity records a folder for at least one specific revision.
 *
 * The opportunity-level ("legacy") link means "this opportunity has one folder", which
 * every revision may legitimately inherit. Once even one revision owns a folder of its
 * own, that statement no longer holds — and inheriting the legacy entry anyway is how a
 * newly created revision, and an SR import that lands on an existing opportunity, ended
 * up silently linked to the previous revision's folder before the user had chosen
 * between a template and an existing folder.
 */
const usesPerRevisionFolders = (opportunityId: string): boolean => {
  const paths = readOpportunityFolderPaths(opportunityId);
  return !!paths && Object.entries(paths).some(([key, value]) => key !== '' && !!value);
};

/**
 * Whether this opportunity has started using revision-specific links in either
 * persistence layer. Once it has, the old unkeyed link must never be borrowed by
 * a different revision: that would make a new revision look linked before the user
 * chooses either an existing folder or a template.
 */
const hasPerRevisionFolderLink = async (opportunityId: string): Promise<boolean> => {
  if (usesPerRevisionFolders(opportunityId)) return true;
  try {
    const handleKeys = await listHandleKeys(opportunityId);
    if (handleKeys.some(key => key.startsWith(`${opportunityId}::`))) return true;
    const storedPaths = await getStoredFolderPaths(opportunityId);
    return Object.entries(storedPaths).some(([revision, path]) => !!revision && !!path);
  } catch {
    // If local storage cannot be inspected, do not risk opening a different
    // revision's legacy folder. The user can still explicitly link a folder.
    return true;
  }
};

/**
 * Read a handle for a specific revision.
 *
 * Falls back to the LEGACY opportunity-level key (the pre-per-revision scheme, which
 * genuinely describes this opportunity's one folder) and to the even older
 * TenderLoopFolders store. It deliberately does NOT fall back to another revision's
 * handle any more.
 *
 * That fallback caused the worst folder bug: a fresh revision silently adopted a
 * sibling revision's handle while its PATH came from the shared database, so the tab
 * listed the contents of one folder while every native action (open, copy path, move)
 * addressed another. Downloading a file into the "linked" folder then appeared to do
 * nothing, and re-linking the same folder was the only cure. Reusing a previous
 * revision's folder is still one click away — but it is now a click, in
 * `inheritFolderLinkFromRevision`, rather than a guess.
 */
export const getFolderHandleForRevision = async (opportunityId: string, revision?: string): Promise<FileSystemDirectoryHandle | null> => {
  const primary = await getFolderHandle(folderKey(opportunityId, revision));
  if (primary) return primary;
  if (!revision || !revision.trim()) {
    const oldHandle = await getLegacyFolderHandle(opportunityId);
    if (oldHandle) await setFolderHandle(opportunityId, oldHandle);
    return oldHandle;
  }

  // The legacy opportunity-level handle is only inheritable while the opportunity
  // still has ONE folder. See usesPerRevisionFolders above.
  if (await hasPerRevisionFolderLink(opportunityId)) return null;

  const legacy = await getFolderHandle(opportunityId);
  if (legacy) return legacy;

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

/** Every revision of this opportunity that already holds a folder handle in this browser. */
export const listLinkedRevisions = async (opportunityId: string): Promise<string[]> => {
  try {
    const keys = await listHandleKeys(opportunityId);
    return keys.map(key => (key === opportunityId ? '' : key.slice(opportunityId.length + 2)));
  } catch {
    return [];
  }
};

/**
 * Explicitly adopt another revision's folder for this revision.
 *
 * The deliberate counterpart to the automatic inheritance removed above: the user
 * picks which revision to reuse, and both the handle and the path are written under
 * this revision's own key, so nothing has to be guessed again later.
 */
export const inheritFolderLinkFromRevision = async (
  opportunityId: string,
  fromRevision: string,
  toRevision: string,
): Promise<{ handle: FileSystemDirectoryHandle | null; path: string }> => {
  const fromKey = folderKey(opportunityId, fromRevision);
  const toKey = folderKey(opportunityId, toRevision);
  const handle = await getFolderHandle(fromKey);
  if (handle) await setFolderHandle(toKey, handle);
  const inheritedPath = await getRootPathDisplay(fromKey);
  if (inheritedPath) await setRootPathDisplay(toKey, inheritedPath);
  return { handle, path: inheritedPath };
};

/** Path-display counterpart to getFolderHandleForRevision (same strict rules). */
export const getRootPathDisplayForRevision = async (opportunityId: string, revision?: string): Promise<string> => {
  const primary = await getRootPathDisplay(folderKey(opportunityId, revision));
  if (primary) return primary;
  if (!revision || !revision.trim()) return '';
  // Only the legacy opportunity-level entry, and only while it still describes the
  // opportunity as a whole. Borrowing a sibling revision's path is what produced
  // "the path is correct but it is showing another folder's files".
  if (await hasPerRevisionFolderLink(opportunityId)) return '';
  return await getRootPathDisplay(opportunityId);
};

/**
 * The known absolute path for a revision, out of the shared DB.
 *
 * Order: the revision's own path, then the legacy unkeyed path (which predates
 * per-revision folders and describes the opportunity as a whole).
 *
 * It used to end with "...otherwise the most recently recorded path for ANY other
 * revision". That is what auto-linked a brand-new revision — and a new opportunity
 * imported on top of an existing one — to whatever folder happened to be written
 * last, before the user had any chance to choose between a template and an existing
 * folder. Reuse is now offered explicitly, via `listInheritableFolderPaths`.
 */
export const resolveFolderPathFromDb = (
  folderPaths: Record<string, string> | undefined,
  revision?: string,
): string => {
  if (!folderPaths) return '';
  const rev = (revision || '').trim();
  if (rev && folderPaths[rev]) return folderPaths[rev];
  // The unkeyed entry only speaks for the whole opportunity while no revision has a
  // folder of its own; after that it is just the oldest revision's folder.
  const hasPerRevision = Object.entries(folderPaths).some(([key, value]) => key !== '' && !!value);
  if (rev && hasPerRevision) return '';
  return folderPaths[''] || '';
};

/**
 * Folders linked to OTHER revisions of the same opportunity, most recent first.
 *
 * Offered to the user as "reuse this one" when the current revision has no folder of
 * its own. Object keys survive the JSON round-trip in insertion order, so the last
 * entry is the most recently linked.
 */
export const listInheritableFolderPaths = (
  folderPaths: Record<string, string> | undefined,
  revision?: string,
): { revision: string; path: string }[] => {
  if (!folderPaths) return [];
  const rev = (revision || '').trim();
  return Object.entries(folderPaths)
    .filter(([key, value]) => key !== rev && key !== '' && !!value)
    .map(([key, value]) => ({ revision: key, path: value }))
    .reverse();
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
  if (handle) await setFolderHandle(folderKey(opportunityId, toRevision), handle);
  const path = await getRootPathDisplayForRevision(opportunityId, fromRevision);
  if (path) {
    await setRootPathDisplay(folderKey(opportunityId, toRevision), path);
    setFolderPath(opportunityId, toRevision, path);
  }
  return !!handle;
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
  // Same rule as getFolderHandleForRevision: once any revision owns a folder, the
  // opportunity-level link no longer speaks for the opportunity, and copying it onto
  // a revision that has not been linked yet would auto-link that revision to the
  // oldest folder instead of letting the user choose.
  if (await hasPerRevisionFolderLink(opportunityId)) return false;

  const revisionKey = folderKey(opportunityId, trimmedRevision);
  const existingRevisionHandle = await getFolderHandle(revisionKey);
  if (existingRevisionHandle) return false;

  const legacyHandle = await getFolderHandle(opportunityId);
  if (!legacyHandle) return false;

  const legacyPath = await getRootPathDisplay(opportunityId);
  await setFolderHandle(revisionKey, legacyHandle);
  if (legacyPath) {
    await setRootPathDisplay(revisionKey, legacyPath);
    setFolderPath(opportunityId, trimmedRevision, legacyPath);
  }
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

/**
 * Forget only the directory handle, keeping the absolute path.
 *
 * Used when this browser's handle is found to point at a different folder than the
 * path the shared database records. The path is the trustworthy half — it is shared,
 * and the local helper confirmed it exists — so the handle is what has to go, and the
 * tab falls back to read-only path browsing until the user re-links.
 */
export const clearFolderHandleOnly = async (opportunityId: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).delete(opportunityId);
    request.onsuccess = () => resolve();
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
