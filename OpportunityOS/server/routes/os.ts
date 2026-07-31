// OS-integration endpoints — behavior-identical port of server/openHelper.js.
// Mounted at /api/os/* (canonical) AND at the legacy root paths (/open, ...)
// so the frontend keeps working unmodified until the Phase-3 cutover.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
    openNative, revealInExplorer, copyPathsToClipboard, copyEmailReplyToClipboard,
    copyDirectoryBestEffort, findDirByName, findFileByMetadata, locateByMarker
} from '../os/shell';
import { composeEmail, findMissingAttachments } from '../os/outlookCompose';
import type { ComposeMode } from '../os/outlookCompose';

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

osRouter.get('/find-db-file', async (req: Request, res: Response) => {
    const name = q(req, 'name').trim();
    const size = Number(q(req, 'size'));
    const mtime = Number(q(req, 'mtime'));
    if (!name || !Number.isFinite(size) || !Number.isFinite(mtime)) {
        return res.status(400).json({ error: 'Missing or invalid file metadata.' });
    }
    const found = await findFileByMetadata(name, size, mtime);
    if (!found) return res.status(404).json({ error: 'The selected database path could not be resolved unambiguously.' });
    return res.json({ ok: true, path: found });
});

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

// --- Copy a formatted reply and its real attachments to one Windows clipboard object ---
osRouter.post('/clipboard-email-reply', async (req: Request, res: Response) => {
    const body = req.body || {};
    const html = typeof body.html === 'string' ? body.html : '';
    const text = typeof body.text === 'string' ? body.text : '';
    const requested: string[] = Array.isArray(body.attachments)
        ? body.attachments.filter((value: unknown): value is string => typeof value === 'string' && !!value.trim()).map(path.normalize)
        : [];
    const existing = requested.filter(filePath => existsSync(filePath));
    const missing = requested.filter(filePath => !existsSync(filePath));
    if (!html.trim() && !text.trim()) return res.status(400).json({ error: 'Reply body is empty.' });
    try {
        await copyEmailReplyToClipboard(html, text, existing);
        return res.json({ ok: true, attachmentCount: existing.length, missingAttachments: missing });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || String(err), missingAttachments: missing });
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

// --- Check whether an absolute path exists (used to validate persisted folder paths) ---
osRouter.get('/check-path', (req: Request, res: Response) => {
    const raw = q(req, 'path');
    if (!raw) return res.status(400).json({ error: 'Missing "path" query param' });
    const target = path.normalize(raw);
    if (!existsSync(target)) return res.status(404).json({ error: 'Path does not exist', exists: false, path: target });
    try {
        const kind = statSync(target).isDirectory() ? 'directory' : 'file';
        return res.json({ ok: true, exists: true, kind, path: target });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || String(err), path: target });
    }
});

// --- List a directory's entries by absolute path (path-mode browsing without a handle) ---
osRouter.get('/list-dir', (req: Request, res: Response) => {
    const raw = q(req, 'path');
    if (!raw) return res.status(400).json({ error: 'Missing "path" query param' });
    const target = path.normalize(raw);
    try {
        if (!existsSync(target) || !statSync(target).isDirectory()) {
            return res.status(404).json({ error: 'Directory does not exist', path: target });
        }
        const entries = readdirSync(target, { withFileTypes: true }).flatMap(d => {
            try {
                const st = statSync(path.join(target, d.name));
                return [{
                    name: d.name,
                    kind: d.isDirectory() ? 'directory' as const : 'file' as const,
                    size: d.isFile() ? st.size : 0,
                    mtime: st.mtimeMs,
                }];
            } catch {
                // Locked files / OneDrive cloud-only placeholders: skip, never abort the listing.
                return [];
            }
        });
        return res.json({ ok: true, path: target, entries });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || String(err), path: target });
    }
});

// --- Open an email DRAFT in Outlook (classic via COM, new via .eml) — never sends ---
osRouter.post('/compose-email', async (req: Request, res: Response) => {
    const body = req.body || {};
    const strArr = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim()) : [];

    const payload = {
        to: strArr(body.to),
        cc: strArr(body.cc),
        bcc: strArr(body.bcc),
        subject: typeof body.subject === 'string' ? body.subject : '',
        htmlBody: typeof body.htmlBody === 'string' ? body.htmlBody : '',
        attachments: strArr(body.attachments).map(p => path.normalize(p)),
    };
    const mode: ComposeMode = body.mode === 'com' || body.mode === 'eml' ? body.mode : 'auto';

    if (!payload.to.length) return res.status(400).json({ error: 'Missing "to" recipients' });
    if (!payload.subject.trim()) return res.status(400).json({ error: 'Missing "subject"' });

    const missingAttachments = findMissingAttachments(payload.attachments);
    if (missingAttachments.length) {
        return res.status(400).json({ error: 'Some attachments do not exist', missingAttachments });
    }

    try {
        const result = await composeEmail(payload, mode);
        return res.json({ ok: true, openedWith: result.openedWith, missingAttachments: [] });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || String(err) });
    }
});

// --- DEPRECATED: locate a folder by unique marker file ---
osRouter.get('/locate', async (req: Request, res: Response) => {
    const marker = q(req, 'marker').trim();
    if (!marker || /[\\/]/.test(marker)) return res.status(400).json({ error: 'Invalid "marker"' });

    const found = await locateByMarker(marker);
    if (found) return res.json({ ok: true, ...found });
    return res.status(404).json({ error: 'Marker not found in known roots', marker });
});
