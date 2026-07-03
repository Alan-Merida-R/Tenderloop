const DB_NAME = 'TenderLoopFileRevisionHistory';
const STORE_NAME = 'fileRevisions';
const DB_VERSION = 1;

export interface FileRevisionEntry {
  id: string;
  opportunityId: string;
  familyId?: string;
  familyKey: string;
  sourceFileKey: string;
  newFileKey: string;
  sourceFileName: string;
  newFileName: string;
  sourceRevision: string;
  newRevision: string;
  contains: string;
  changes: string;
  reason: string;
  createdAt: string;
  updatedAt?: string;
}

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
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

export const saveFileRevisionEntry = async (entry: Omit<FileRevisionEntry, 'id' | 'createdAt'>): Promise<FileRevisionEntry> => {
  const saved: FileRevisionEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).put(saved);
    request.onsuccess = () => resolve(saved);
    request.onerror = () => reject(request.error);
  });
};

export const getFileRevisionHistory = async (opportunityId: string, familyIdOrKey: string): Promise<FileRevisionEntry[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    const results: FileRevisionEntry[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(results.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        return;
      }
      const value = cursor.value as FileRevisionEntry;
      if (value.opportunityId === opportunityId && (value.familyId || value.familyKey) === familyIdOrKey) {
        results.push(value);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
};

export const assignFileRevisionFamilyId = async (
  opportunityId: string,
  legacyFamilyKey: string,
  familyId: string
): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const value = cursor.value as FileRevisionEntry;
      if (value.opportunityId === opportunityId && value.familyKey === legacyFamilyKey && value.familyId !== familyId) {
        cursor.update({
          ...value,
          familyId,
          updatedAt: value.updatedAt || new Date().toISOString(),
        });
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
};

export const updateFileRevisionEntry = async (
  entryId: string,
  updates: Pick<FileRevisionEntry, 'contains' | 'changes' | 'reason'>
): Promise<FileRevisionEntry> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(entryId);
    getReq.onerror = () => reject(getReq.error);
    getReq.onsuccess = () => {
      const existing = getReq.result as FileRevisionEntry | undefined;
      if (!existing) {
        reject(new Error('Revision history entry not found.'));
        return;
      }
      const updated: FileRevisionEntry = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error);
    };
  });
};
