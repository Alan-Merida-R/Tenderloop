import { DatabaseSchema, INITIAL_DB } from '../types';

export interface FileHandlerResult {
  handle: FileSystemFileHandle | null;
  data: DatabaseSchema | null;
  error: string | null;
}

/**
 * Open file picker to select the JSON DB
 */
export const openDatabaseFile = async (): Promise<FileHandlerResult> => {
  try {
    // @ts-ignore - File System Access API types might not be fully available in all TS configs
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

    return { handle, data, error: null };
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