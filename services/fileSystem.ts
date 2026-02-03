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
  try {
    // Check if API is supported
    // @ts-ignore
    if (typeof window.showOpenFilePicker === 'function') {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'JSON Database',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
        multiple: false,
      });

      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text) as DatabaseSchema;

      return { handle, data, error: null, name: file.name };
    } else {
      // Fallback for browsers without File System Access API
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none'; // hidden
        document.body.appendChild(input); // Append to DOM to ensure click works

        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          document.body.removeChild(input); // Clean up
          if (!file) {
            resolve({ handle: null, data: null, error: 'Selección cancelada.' });
            return;
          }
          try {
            const text = await file.text();
            const data = JSON.parse(text) as DatabaseSchema;
            resolve({ handle: null, data, error: null, name: file.name }); // No handle in fallback
          } catch (err: any) {
            resolve({ handle: null, data: null, error: 'Error al leer el archivo: ' + err.message });
          }
        };

        // Check for cancel/no-action (simulated via strict timeout or focus? difficult to detect cancel mostly)
        // But standard behavior is just to wait. If user cancels, promise hangs or we assume nothing.
        // A common trick is checking on window focus, but let's keep it simple.

        input.click();
      });
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { handle: null, data: null, error: 'Selección cancelada.' };
    }
    return { handle: null, data: null, error: 'Error al leer el archivo: ' + err.message };
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