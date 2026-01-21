
/**
 * Service to persist FileSystemDirectoryHandles in IndexedDB.
 * Handles are not serializable to JSON, so we store them in IDB.
 */

const DB_NAME = 'TenderLoopFolders';
const STORE_NAME = 'handles';

const getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Stores a directory handle associated with an opportunity ID.
 */
export const setFolderHandle = async (oppId: string, handle: FileSystemDirectoryHandle): Promise<void> => {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, oppId);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Retrieves a directory handle for an opportunity ID.
 * Returns null if not found.
 */
export const getFolderHandle = async (oppId: string): Promise<FileSystemDirectoryHandle | null> => {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(oppId);
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Clears the folder link for an opportunity.
 */
export const clearFolderHandle = async (oppId: string): Promise<void> => {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(oppId);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Checks if the handle still has permission.
 * Browsers often reset permissions on page reload.
 */
export const verifyPermission = async (handle: FileSystemHandle, mode: 'read' | 'readwrite' = 'readwrite'): Promise<boolean> => {
    // @ts-ignore
    if ((await handle.queryPermission({ mode })) === 'granted') {
        return true;
    }
    // @ts-ignore
    if ((await handle.requestPermission({ mode })) === 'granted') {
        return true;
    }
    return false;
};
