import path from 'node:path';

/**
 * TenderLoop backend configuration.
 * Port 3099 is inherited from the legacy openHelper so the existing
 * CERRAR/DESINSTALAR scripts and any in-flight frontend keep working.
 */
export const PORT = Number(process.env.TENDERLOOP_OPEN_PORT) || 3099;
export const HOST = '127.0.0.1';

/**
 * Local data directory for server-side state (recents, DB backups).
 * %APPDATA%\TenderLoop on Windows; falls back to the user home elsewhere.
 */
export const DATA_DIR = path.join(
    process.env.APPDATA || process.env.HOME || process.cwd(),
    'TenderLoop'
);

export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const DEFAULT_DB_PATH = path.join(DATA_DIR, 'tendering_db.json');

/**
 * OS-integration routes (/api/os/*) act on the local machine (open files,
 * clipboard, Explorer). A future hosted deployment disables them wholesale.
 */
export const ENABLE_OS_INTEGRATION = process.env.TENDERLOOP_DISABLE_OS !== '1';
