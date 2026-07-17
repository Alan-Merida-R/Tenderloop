import { DatabaseSchema, INITIAL_DB } from '../types';

// File System Access API — not yet in lib.dom.d.ts for all TS versions.
// Declare the two entry points we use so the rest of the module can call them
// without @ts-ignore littering.
declare global {
  interface Window {
    showOpenFilePicker?: (options?: any) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: any) => Promise<FileSystemFileHandle>;
  }
}

export interface FileHandlerResult {
  handle: FileSystemFileHandle | null;
  data: DatabaseSchema | null;
  error: string | null;
  name?: string;
}

/**
 * Open file picker to select the JSON DB
 */
export const openDatabaseFile = async (): Promise<FileHandlerResult> => {
  // 1. Define fallback logic explicitly
  const runFallback = (): Promise<FileHandlerResult> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        document.body.removeChild(input);

        if (!file) {
          resolve({ handle: null, data: null, error: 'Selección cancelada.' });
          return;
        }
        try {
          const text = await file.text();
          const data = JSON.parse(text) as DatabaseSchema;
          resolve({ handle: null, data, error: null, name: file.name });
        } catch (err: any) {
          resolve({ handle: null, data: null, error: 'Error al leer el archivo: ' + err.message });
        }
      };

      // On some browsers, if the user cancels properly, focus returns. 
      // But standard behavior is just to click.
      input.click();
    });
  };

  try {
    // 2. Try modern API first
    // @ts-ignore
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'JSON Database',
            accept: { 'application/json': ['.json'] },
          }],
          multiple: false,
        });

        const file = await handle.getFile();
        const text = await file.text();
        const data = JSON.parse(text) as DatabaseSchema;

        return { handle, data, error: null, name: file.name };
      } catch (innerErr: any) {
        // If it's an AbortError, user cancelled -> Return cancel.
        if (innerErr.name === 'AbortError') {
          return { handle: null, data: null, error: 'Selección cancelada.' };
        }
        // If it's something else (SecurityError, etc), FALLBACK to Input.
        console.warn("File System API failed, switching to fallback:", innerErr);
        return runFallback();
      }
    } else {
      return runFallback();
    }
  } catch (err: any) {
    // Fallback for top-level errors specifically
    return runFallback();
  }
};

/**
 * Save file picker to create a new JSON DB
 */
export const createDatabaseFile = async (): Promise<FileHandlerResult> => {
  try {
    // @ts-ignore
    const handle = await window.showSaveFilePicker({
      suggestedName: 'tendering_db.json',
      types: [{
        description: 'JSON Database',
        accept: { 'application/json': ['.json'] },
      }],
    });

    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(INITIAL_DB, null, 2));
    await writable.close();

    return { handle, data: INITIAL_DB, error: null };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { handle: null, data: null, error: 'Creación cancelada.' };
    }
    return { handle: null, data: null, error: 'Error al crear archivo: ' + err.message };
  }
};

/**
 * Write data to the existing handle.
 * Uses a Web Worker for JSON serialization to avoid blocking the main thread.
 */

// Lazy-initialized worker singleton — created only once per app session
let saveWorker: Worker | null = null;

const getSaveWorker = (): Worker => {
  if (!saveWorker) {
    // Vite's ?worker&inline syntax bundles the worker inline — no extra file needed
    saveWorker = new Worker(
      new URL('./save.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return saveWorker;
};

export const saveToDisk = (handle: FileSystemFileHandle, data: DatabaseSchema): Promise<boolean> => {
  return new Promise((resolve) => {
    const worker = getSaveWorker();

    const onMessage = async (e: MessageEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);

      if (!e.data.success) {
        console.error('[Save Worker] Serialization failed:', e.data.error);
        resolve(false);
        return;
      }

      try {
        // @ts-ignore
        const writable = await handle.createWritable();
        await writable.write(e.data.serialized);
        await writable.close();
        resolve(true);
      } catch (error) {
        console.error('[AutoSave] Write failed:', error);
        resolve(false);
      }
    };

    const onError = (e: ErrorEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      console.error('[Save Worker] Error:', e);
      resolve(false);
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    // Send data to worker — this is non-blocking (uses structured clone)
    worker.postMessage(data);
  });
};