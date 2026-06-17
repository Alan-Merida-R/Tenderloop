/**
 * Persists "quick access" pins for the opportunity folder (files & folders the
 * user pins for fast access). Keyed per folder-storage-key (opportunityId::revision)
 * so each revision keeps its own pins, matching how folders are linked.
 */

const DB_NAME = 'TenderLoopFolderPins';
const STORE_NAME = 'pins';
const DB_VERSION = 1;

export interface FolderPin {
  key: string;            // relativePath joined with '/'
  name: string;
  kind: 'file' | 'directory';
  relativePath: string[];
  addedAt: string;
}

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getPins = async (storageKey: string): Promise<FolderPin[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(storageKey);
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
};

const setPins = async (storageKey: string, pins: FolderPin[]): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(pins, storageKey);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const addPin = async (storageKey: string, pin: Omit<FolderPin, 'addedAt'>): Promise<FolderPin[]> => {
  const pins = await getPins(storageKey);
  if (pins.some(p => p.key === pin.key)) return pins; // already pinned
  const next = [...pins, { ...pin, addedAt: new Date().toISOString() }];
  await setPins(storageKey, next);
  return next;
};

export const removePin = async (storageKey: string, key: string): Promise<FolderPin[]> => {
  const pins = await getPins(storageKey);
  const next = pins.filter(p => p.key !== key);
  await setPins(storageKey, next);
  return next;
};

export const isPinned = (pins: FolderPin[], key: string): boolean => pins.some(p => p.key === key);
