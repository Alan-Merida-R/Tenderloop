// OS-integration endpoints — behavior-identical port of server/openHelper.js.
// Mounted at /api/os/* (canonical) AND at the legacy root paths (/open, ...)
// so the frontend keeps working unmodified until the Phase-3 cutover.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import {
    openNative, revealInExplorer, copyPathsToClipboard,
    copyDirectoryBestEffort, findDirByName, locateByMarker
} from '../os/shell';

/** Parse a query param holding a JSON array of strings. */
const parsePaths = (raw: unknown): string[] => {
    if (!raw || typeof raw !== 'string') return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(p => typeof p === 'string' && p.trim()) : [];
    } catch {
        return [];
    }
};

const q = (req: Request, name: string): string => {
    const v = req.query[name];
    return typeof v === 'string' ? v : '';
};

export const osRouter = Router();

// --- Open a single file/folder in its native app ---
osRouter.get('/open', async (req: Request, res: Response) => {
    const raw = q(req, 'path');
    if (!raw) return res.status(400).json({ error: 'Missing "path" query param' });

    const target = path.normalize(raw);
    if (!existsSync(target)) {
        return res.status(404).json({ error: 'Path does not exist', path: target });
    }
    try {
        await openNative(target);
        const kind = statSync(target).isDirectory() ? 'directory' : 'file';
        return res.json({ ok: true, opened: target, kind });
    } catch (err: any) {
        return res.status(500).json({ error: err.message, path: target });
    }
});

// --- Open several paths at once ---
osRouter.get('/open-many', async (req: Request, res: Response) => {
    const paths = parsePaths(req.query.paths);
    if (paths.length === 0) return res.status(400).json({ error: 'Missing or empty "paths" (JSON array)' });

    const opened: string[] = [];
    const missing: string[] = [];
    for (const raw of paths) {
        const target = path.normalize(raw);
        if (!existsSync(target)) { missing.push(target); continue; }
        try { await openNative(target); opened.push(target); }
        catch { missing.push(target); }
    }
    return res.json({ ok: true, opened, missing });
});

// --- Reveal a file/folder in Explorer (selected) ---
osRouter.get('/reveal', (req: Request, res: Response) => {
    const raw = q(req, 'path');
    if (!raw) return res.status(400).json({ error: 'Missing "path" query param' });
    const target = path.normalize(raw);
    if (!existsSync(target)) return res.status(404).json({ error: 'Path does not exist', path: target });
    revealInExplorer(target);
    return res.json({ ok: true, revealed: target });
});

// --- Copy real files to the Windows clipboard ---
osRouter.get('/clipboard', async (req: Request, res: Response) => {
    const paths = parsePaths(req.query.paths);
    if (paths.length === 0) return res.status(400).json({ error: 'Missing or empty "paths" (JSON array)' });

    const existing = paths.map(p => path.normalize(p)).filter(p => existsSync(p));
    if (existing.length === 0) return res.status(404).json({ error: 'None of the paths exist', paths });

    try {
        await copyPathsToClipboard(existing);
        return res.json({ ok: true, copied: existing, count: existing.length });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// --- Copy a full template folder by absolute paths ---
osRouter.get('/copy-template', (req: Request, res: Response) => {
    const sourceRaw = q(req, 'source');
    const destParentRaw = q(req, 'destParent');
    const folderName = q(req, 'folderName').trim();
    if (!sourceRaw || !destParentRaw || !folderName) return res.status(400).json({ error: 'Missing source, destParent or folderName' });
    if (/[\\/:*?"<>|]/.test(folderName)) return res.status(400).json({ error: 'Invalid folderName' });

    const source = path.normalize(sourceRaw);
    const destParent = path.normalize(destParentRaw);
    if (!existsSync(source) || !statSync(source).isDirectory()) return res.status(404).json({ error: 'Template source does not exist or is not a folder', source });
    if (!existsSync(destParent) || !statSync(destParent).isDirectory()) return res.status(404).json({ error: 'Destination parent does not exist or is not a folder', destParent });

    const target = path.join(destParent, folderName);
    try {
        const result = copyDirectoryBestEffort(source, target);
        if (result.copied === 0) return res.status(500).json({ error: 'No template files could be copied', skipped: result.skipped });
        return res.json({ ok: true, target, copied: result.copied, skipped: result.skipped });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || String(err), source, target });
    }
});

// --- Find a directory's absolute path by NAME + child-name hints ---
osRouter.get('/find-dir', async (req: Request, res: Response) => {
    const name = q(req, 'name').trim();
    if (!name || /[\\/:*?"<>|]/.test(name)) return res.status(400).json({ error: 'Invalid "name"' });
    const hints = parsePaths(req.query.hints);

    const found = await findDirByName(name, hints);
    if (found) return res.json({ ok: true, ...found });
    return res.status(404).json({ error: 'Directory not found', name });
});

// --- DEPRECATED: locate a folder by unique marker file ---
osRouter.get('/locate', async (req: Request, res: Response) => {
    const marker = q(req, 'marker').trim();
    if (!marker || /[\\/]/.test(marker)) return res.status(400).json({ error: 'Invalid "marker"' });

    const found = await locateByMarker(marker);
    if (found) return res.json({ ok: true, ...found });
    return res.status(404).json({ error: 'Marker not found in known roots', marker });
});
