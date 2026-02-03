import { DatabaseSchema, INITIAL_DB } from '../types';

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
 * Write data to the existing handle
 */
export const saveToDisk = async (handle: FileSystemFileHandle, data: DatabaseSchema) => {
  try {
    // @ts-ignore
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch (error) {
    console.error("Auto-save failed:", error);
    return false;
  }
};