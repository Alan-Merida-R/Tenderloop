import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BACKUPS_DIR, DEFAULT_DB_PATH } from '../config';
import { DatabaseSchema, INITIAL_DB } from '../../src/types';

const BACKUP_MIN_INTERVAL_MS = 10_000;
const MAX_BACKUPS = 10;

export interface DbSnapshot {
    data: DatabaseSchema;
    revision: number;
    path: string;
    name: string;
    lastLoadedAt: string;
    lastSavedAt: string | null;
}

export interface DbStatus {
    open: boolean;
    path: string | null;
    name: string | null;
    revision: number;
    lastLoadedAt: string | null;
    lastSavedAt: string | null;
}

export class DbRepository {
    private snapshot: DbSnapshot | null = null;
    // Serializes save() calls so overlapping requests (multiple tabs/windows,
    // a retry racing a fresh autosave) can't both pass the revision check
    // before either write lands — without this, two concurrent saves could
    // silently clobber each other or race on the same-destination rename().
    private writeChain: Promise<unknown> = Promise.resolve();
    private lastBackupAt = 0;

    status(): DbStatus {
        return {
            open: Boolean(this.snapshot),
            path: this.snapshot?.path ?? null,
            name: this.snapshot?.name ?? null,
            revision: this.snapshot?.revision ?? 0,
            lastLoadedAt: this.snapshot?.lastLoadedAt ?? null,
            lastSavedAt: this.snapshot?.lastSavedAt ?? null,
        };
    }

    current(): DbSnapshot | null {
        return this.snapshot ? { ...this.snapshot, data: structuredClone(this.snapshot.data) } : null;
    }

    async open(filePath: string): Promise<DbSnapshot> {
        const resolved = resolveJsonPath(filePath);
        const raw = await readFile(resolved, 'utf8');
        const parsed = JSON.parse(raw);
        const data = validateDatabase(parsed);
        this.snapshot = {
            data,
            path: resolved,
            name: path.basename(resolved),
            revision: 1,
            lastLoadedAt: new Date().toISOString(),
            lastSavedAt: null,
        };
        return this.currentOrThrow();
    }

    async openDefault(): Promise<DbSnapshot> {
        return this.open(DEFAULT_DB_PATH);
    }

    async create(filePath: string, overwrite = false): Promise<DbSnapshot> {
        const resolved = resolveJsonPath(filePath);
        if (!overwrite) {
            try {
                await stat(resolved);
                throw new Error(`Database already exists: ${resolved}`);
            } catch (err: any) {
                if (err?.code !== 'ENOENT') throw err;
            }
        }

        const data = structuredClone(INITIAL_DB);
        data.meta = { ...data.meta, lastUpdated: new Date().toISOString() };
        await mkdir(path.dirname(resolved), { recursive: true });
        await writeAtomicJson(resolved, data);
        this.snapshot = {
            data,
            path: resolved,
            name: path.basename(resolved),
            revision: 1,
            lastLoadedAt: new Date().toISOString(),
            lastSavedAt: new Date().toISOString(),
        };
        return this.currentOrThrow();
    }

    async createDefault(overwrite = false): Promise<DbSnapshot> {
        return this.create(DEFAULT_DB_PATH, overwrite);
    }

    async importDefault(data: unknown): Promise<DbSnapshot> {
        const validated = validateDatabase(data);
        validated.meta = {
            ...validated.meta,
            lastUpdated: new Date().toISOString(),
        };
        await mkdir(path.dirname(DEFAULT_DB_PATH), { recursive: true });
        await writeAtomicJson(DEFAULT_DB_PATH, validated);
        this.snapshot = {
            data: validated,
            path: DEFAULT_DB_PATH,
            name: path.basename(DEFAULT_DB_PATH),
            revision: 1,
            lastLoadedAt: new Date().toISOString(),
            lastSavedAt: new Date().toISOString(),
        };
        return this.currentOrThrow();
    }

    async save(data: unknown, expectedRevision?: number): Promise<DbSnapshot> {
        // Chain onto the shared queue so this save's revision check + write
        // happen atomically with respect to any other in-flight save. The
        // chain always resolves (errors are swallowed on the shared link)
        // so one failed save can't wedge every save after it; the actual
        // result/error for this call is still carried by `run`.
        const run = this.writeChain.then(
            () => this.performSave(data, expectedRevision),
            () => this.performSave(data, expectedRevision)
        );
        this.writeChain = run.then(() => undefined, () => undefined);
        return run;
    }

    private async performSave(data: unknown, expectedRevision?: number): Promise<DbSnapshot> {
        if (!this.snapshot) throw new Error('No database is open.');
        if (expectedRevision != null && expectedRevision !== this.snapshot.revision) {
            const err = new Error(`Revision conflict. Current revision is ${this.snapshot.revision}.`);
            (err as any).statusCode = 409;
            throw err;
        }

        const validated = validateDatabase(data);
        validated.meta = {
            ...validated.meta,
            lastUpdated: new Date().toISOString(),
        };
        try {
            await this.backup(false);
        } catch (err) {
            console.warn('[db] Backup before save failed; continuing with atomic save.', err);
        }
        await writeAtomicJson(this.snapshot.path, validated);
        this.snapshot = {
            ...this.snapshot,
            data: validated,
            revision: this.snapshot.revision + 1,
            lastSavedAt: new Date().toISOString(),
        };
        return this.currentOrThrow();
    }

    // `force` bypasses the throttle below — used by the explicit "backup now"
    // endpoint, which should always produce a fresh copy on request.
    async backup(force = true): Promise<{ path: string } | null> {
        if (!this.snapshot) return null;
        // Backups run before every save, but autosave can fire every few
        // seconds while a user is typing — skip the extra full-file copy
        // when the last one is still fresh, since it already covers this
        // window of edits.
        if (!force && Date.now() - this.lastBackupAt < BACKUP_MIN_INTERVAL_MS) return null;
        try {
            await stat(this.snapshot.path);
        } catch {
            return null;
        }

        await mkdir(BACKUPS_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = path.basename(this.snapshot.path).replace(/[^a-zA-Z0-9._-]/g, '_');
        const backupPath = path.join(BACKUPS_DIR, `${timestamp}_${safeName}`);
        await copyFile(this.snapshot.path, backupPath);
        this.lastBackupAt = Date.now();
        await this.pruneBackups();
        return { path: backupPath };
    }

    /** Store a recovery-only snapshot without changing the active database. */
    async archiveSnapshot(data: unknown, sourceName = 'tendering_db.json'): Promise<{ path: string } | null> {
        if (Date.now() - this.lastBackupAt < BACKUP_MIN_INTERVAL_MS) return null;
        const validated = validateDatabase(data);
        await mkdir(BACKUPS_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = path.basename(sourceName).replace(/[^a-zA-Z0-9._-]/g, '_') || 'tendering_db.json';
        const backupPath = path.join(BACKUPS_DIR, `${timestamp}_${safeName}`);
        await writeFile(backupPath, JSON.stringify(validated), 'utf8');
        this.lastBackupAt = Date.now();
        await this.pruneBackups();
        return { path: backupPath };
    }

    private async pruneBackups(): Promise<void> {
        const entries = await readdir(BACKUPS_DIR, { withFileTypes: true });
        const files = entries.filter(entry => entry.isFile()).map(entry => entry.name).sort().reverse();
        await Promise.all(files.slice(MAX_BACKUPS).map(name => unlink(path.join(BACKUPS_DIR, name))));
    }

    close(): void {
        this.snapshot = null;
    }

    private currentOrThrow(): DbSnapshot {
        const current = this.current();
        if (!current) throw new Error('No database is open.');
        return current;
    }
}

export const dbRepository = new DbRepository();

const resolveJsonPath = (rawPath: string): string => {
    if (!rawPath || typeof rawPath !== 'string') throw new Error('Missing database path.');
    const resolved = path.resolve(rawPath);
    if (path.extname(resolved).toLowerCase() !== '.json') {
        throw new Error('Database path must point to a .json file.');
    }
    return resolved;
};

const validateDatabase = (value: unknown): DatabaseSchema => {
    if (!value || typeof value !== 'object') throw new Error('Invalid database: expected an object.');
    const candidate = value as Partial<DatabaseSchema>;
    if (!Array.isArray(candidate.opportunities)) {
        throw new Error('Invalid database: missing opportunities array.');
    }
    return structuredClone({
        ...candidate,
        meta: {
            version: candidate.meta?.version || INITIAL_DB.meta.version,
            lastUpdated: candidate.meta?.lastUpdated || new Date().toISOString(),
        },
        userSettings: candidate.userSettings || INITIAL_DB.userSettings,
        opportunities: candidate.opportunities,
    } as DatabaseSchema);
};

const writeAtomicJson = async (targetPath: string, data: DatabaseSchema): Promise<void> => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    const tmpPath = path.join(path.dirname(targetPath), `${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
    // Compact (no pretty-print indentation) — cuts serialization + write time
    // noticeably on a large DB, since every save now waits in a write queue
    // (see DbRepository.save) rather than racing concurrently.
    await writeFile(tmpPath, JSON.stringify(data), 'utf8');
    await rename(tmpPath, targetPath);
};
