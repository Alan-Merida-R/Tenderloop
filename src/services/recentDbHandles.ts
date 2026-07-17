
/**
 * Service to persist recent Database File Handles in IndexedDB.
 * Used to auto-load the last DB and provide a "Recents" list.
 */

const DB_NAME = 'TenderLoopRecents';
const STORE_NAME = 'db_handles';
const MAX_RECENTS = 5;

export interface RecentDbEntry {
  id: string;
  name: string;
  lastOpenedAt: number;
}

interface StoredEntry extends RecentDbEntry {
  handle: FileSystemFileHandle;
}

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getRecentDbs = async (): Promise<RecentDbEntry[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items: StoredEntry[] = request.result;
      // Sort by lastOpenedAt descending
      items.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
      // Return metadata only
      resolve(items.map(({ id, name, lastOpenedAt }) => ({ id, name, lastOpenedAt })));
    };
    request.onerror = () => reject(request.error);
  });
};

export const getRecentDbHandle = async (id: string): Promise<FileSystemFileHandle | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ? request.result.handle : null);
    request.onerror = () => reject(request.error);
  });
};

export const rememberDb = async (handle: FileSystemFileHandle, meta?: { name?: string }): Promise<void> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  // 1. Get all items to manage list size and duplicates
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = async () => {
      const items: StoredEntry[] = request.result;
      const now = Date.now();
      const name = meta?.name || handle.name;
      
      // Check for existing entry by name to update it
      const existingIndex = items.findIndex(i => i.name === name);
      let entry: StoredEntry;

      if (existingIndex >= 0) {
        // Update existing
        entry = { ...items[existingIndex], handle, lastOpenedAt: now };
        // We will put this update, effectively moving it to "top" by time
        items[existingIndex] = entry; 
      } else {
        // Create new
        entry = { id: crypto.randomUUID(), handle, name, lastOpenedAt: now };
        items.push(entry);
      }

      // Save the specific entry
      store.put(entry);

      // Sort and prune if too many
      items.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
      
      if (items.length > MAX_RECENTS) {
        const toRemove = items.slice(MAX_RECENTS);
        toRemove.forEach(i => store.delete(i.id));
      }
      
      tx.oncomplete = () => resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

export const removeRecentDb = async (id: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearAllRecentDbs = async (): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getLastDb = async (): Promise<FileSystemFileHandle | null> => {
  const recents = await getRecentDbs();
  if (recents.length === 0) return null;
  // Get handle of the most recent one (index 0 after sort)
  return getRecentDbHandle(recents[0].id);
};
