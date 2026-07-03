
/**
 * Service to persist file metadata (classification, linkedTaskIds, linkedNoteIds) in IndexedDB.
 * Stability: Uses file relative path as key within an opportunity.
 */

const DB_NAME = 'TenderLoopDocMeta';
const STORE_NAME = 'docMeta';
const DB_VERSION = 2;

export interface DocMeta {
  docType: string;
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  revisionFamilyId?: string;
  alias?: string;
  editableStatus?: string;
  internalNotes?: string;
  updatedAt: string;
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

const getEntryKey = (opportunityId: string, fileKey: string) => `${opportunityId}||${fileKey}`;

export const getMeta = async (opportunityId: string, fileKey: string): Promise<DocMeta | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(getEntryKey(opportunityId, fileKey));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const saveMeta = async (opportunityId: string, fileKey: string, meta: Partial<DocMeta>): Promise<void> => {
  const existing = await getMeta(opportunityId, fileKey);
  const updated: DocMeta = {
    docType: meta.docType ?? existing?.docType ?? '',
    linkedTaskIds: meta.linkedTaskIds ?? existing?.linkedTaskIds ?? [],
    linkedNoteIds: meta.linkedNoteIds ?? existing?.linkedNoteIds ?? [],
    revisionFamilyId: meta.revisionFamilyId ?? existing?.revisionFamilyId ?? '',
    alias: meta.alias ?? existing?.alias ?? '',
    editableStatus: meta.editableStatus ?? existing?.editableStatus ?? 'Not started',
    internalNotes: meta.internalNotes ?? existing?.internalNotes ?? '',
    updatedAt: new Date().toISOString()
  };

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(updated, getEntryKey(opportunityId, fileKey));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const listLinkedForTask = async (opportunityId: string, taskId: string): Promise<{ fileKey: string; meta: DocMeta }[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    const results: { fileKey: string; meta: DocMeta }[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const key = cursor.primaryKey as string;
        if (key.startsWith(`${opportunityId}||`)) {
          const meta = cursor.value as DocMeta;
          if (meta.linkedTaskIds.includes(taskId)) {
            results.push({ fileKey: key.split('||')[1], meta });
          }
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const listLinkedForNote = async (opportunityId: string, noteId: string): Promise<{ fileKey: string; meta: DocMeta }[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    const results: { fileKey: string; meta: DocMeta }[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const key = cursor.primaryKey as string;
        if (key.startsWith(`${opportunityId}||`)) {
          const meta = cursor.value as DocMeta;
          if (meta.linkedNoteIds.includes(noteId)) {
            results.push({ fileKey: key.split('||')[1], meta });
          }
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
};
