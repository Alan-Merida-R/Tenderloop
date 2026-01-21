
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
