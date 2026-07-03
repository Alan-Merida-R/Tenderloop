import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BACKUPS_DIR, DEFAULT_DB_PATH } from '../config';
import { DatabaseSchema, INITIAL_DB } from '../../types';

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
            await this.backup();
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

    async backup(): Promise<{ path: string } | null> {
        if (!this.snapshot) return null;
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
        return { path: backupPath };
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
    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmpPath, targetPath);
};
