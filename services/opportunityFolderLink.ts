
/**
 * Service to persist FileSystemDirectoryHandles in IndexedDB.
 * Since handles cannot be stored in JSON or LocalStorage, IDB is used.
 */

const DB_NAME = 'OpportunityFolderDB';
const STORE_NAME = 'Handles';
const META_STORE = 'Meta';
const DB_VERSION = 2;

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

/**
 * Read a handle for a specific revision, falling back to the legacy global key
 * (`opportunityId` with no revision) so folders linked before per-revision
 * storage existed still resolve.
 */
export const getFolderHandleForRevision = async (opportunityId: string, revision?: string): Promise<FileSystemDirectoryHandle | null> => {
  const primary = await getFolderHandle(folderKey(opportunityId, revision));
  if (primary) return primary;
  if (revision && revision.trim()) return await getFolderHandle(opportunityId); // legacy fallback
  return null;
};

/** Path-display counterpart to getFolderHandleForRevision (same legacy fallback). */
export const getRootPathDisplayForRevision = async (opportunityId: string, revision?: string): Promise<string> => {
  const primary = await getRootPathDisplay(folderKey(opportunityId, revision));
  if (primary) return primary;
  if (revision && revision.trim()) return await getRootPathDisplay(opportunityId);
  return '';
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

export const setRootPathDisplay = async (opportunityId: string, path: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, 'readwrite');
    const store = transaction.objectStore(META_STORE);
    const request = store.put(path, opportunityId);
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
