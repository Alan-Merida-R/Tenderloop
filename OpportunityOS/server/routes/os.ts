// OS-integration endpoints — behavior-identical port of server/openHelper.js.
// Mounted at /api/os/* (canonical) AND at the legacy root paths (/open, ...)
// so the frontend keeps working unmodified until the Phase-3 cutover.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
    openNative, revealInExplorer, copyPathsToClipboard, copyEmailReplyToClipboard,
    copyDirectoryBestEffort, copyFileVerified, findDirByName, findDirByChildren, findFileByMetadata, locateByMarker,
    setTimerWindowTopmost, movePath
} from '../os/shell';
import type { DirChildHint } from '../os/shell';
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

/** Characters Windows forbids in a file or folder name. */
const INVALID_NAME_RE = /[\/:*?"<>|]/;

const q = (req: Request, name: string): string => {
    const v = req.query[name];
    return typeof v === 'string' ? v : '';
};

export const osRouter = Router();

osRouter.post('/timer-window-topmost', async (req: Request, res: Response) => {
    const title = typeof req.body?.title === 'string' ? req.body.title : '';
    const enabled = req.body?.enabled === true;
    try {
        const ok = await setTimerWindowTopmost(title, enabled);
        if (!ok) return res.status(404).json({ error: 'The timer window was not found. Open the timer popup first.' });
        return res.json({ ok: true, enabled });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || String(err) });
    }
});

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

// Copy one file by absolute paths. This is used for Word revisions in folders
// beyond the browser/Win32 MAX_PATH boundary and verifies the byte count.
osRouter.get('/copy-file', (req: Request, res: Response) => {
    const source = path.normalize(q(req, 'source'));
    const target = path.normalize(q(req, 'target'));
    const sourceFs = process.platform === 'win32' ? path.toNamespacedPath(source) : source;
    const targetFs = process.platform === 'win32' ? path.toNamespacedPath(target) : target;
    if (!source || !target || !path.isAbsolute(source) || !path.isAbsolute(target)) return res.status(400).json({ error: 'Absolute source and target paths are required.' });
    if (!existsSync(sourceFs) || !statSync(sourceFs).isFile()) return res.status(404).json({ error: 'Source file does not exist.', source });
    if (!existsSync(path.dirname(targetFs)) || !statSync(path.dirname(targetFs)).isDirectory()) return res.status(404).json({ error: 'Target folder does not exist.', target });
    if (existsSync(targetFs)) return res.status(409).json({ error: 'Target file already exists.', target });
    try {
        copyFileVerified(source, target);
        return res.json({ ok: true, target, size: statSync(targetFs).size });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || String(err), source, target });
    }
});

const alarmSettingsFile = (folderRaw: string) => path.join(path.normalize(folderRaw), 'OpportunityOS-Alarmas.json');

osRouter.get('/alarm-settings', (req: Request, res: Response) => {
    const folder = q(req, 'folder').trim();
    if (!folder || !path.isAbsolute(folder)) return res.status(400).json({ error: 'Select an absolute shared folder path.' });
    const file = alarmSettingsFile(folder);
    if (!existsSync(file)) return res.status(404).json({ error: 'No shared alarm configuration exists in this folder yet.' });
    try {
        const value = JSON.parse(readFileSync(file, 'utf8'));
        if (!Array.isArray(value?.alarms)) return res.status(422).json({ error: 'The shared alarm file is invalid.' });
        return res.json({ alarms: value.alarms, updatedAt: value.updatedAt || null });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'Could not read the shared alarm file.' });
    }
});

osRouter.put('/alarm-settings', (req: Request, res: Response) => {
    const folder = typeof req.body?.folderPath === 'string' ? req.body.folderPath.trim() : '';
    const alarms = req.body?.alarms;
    if (!folder || !path.isAbsolute(folder) || !existsSync(folder) || !statSync(folder).isDirectory()) return res.status(400).json({ error: 'The shared folder does not exist.' });
    if (!Array.isArray(alarms)) return res.status(400).json({ error: 'Alarm settings must be an array.' });
    const file = alarmSettingsFile(folder);
    const temporary = `${file}.tmp-${process.pid}`;
    try {
        writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), alarms }, null, 2), 'utf8');
        renameSync(temporary, file);
        return res.json({ ok: true, file });
    } catch (err: any) {
        try { if (existsSync(temporary)) rmSync(temporary, { force: true }); } catch { /* best effort */ }
        return res.status(500).json({ error: err?.message || 'Could not publish the shared alarm file.' });
    }
});

// --- Write a manager report JSON into a chosen folder (atomic overwrite) ---
osRouter.post('/write-manager-report', (req: Request, res: Response) => {
    const body = req.body || {};
    const dirRaw = typeof body.dirPath === 'string' ? body.dirPath.trim() : '';
    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';

    if (!dirRaw) return res.status(400).json({ error: 'Missing "dirPath"' });
    // Narrow scope: this endpoint can only ever produce manager-report files.
    if (!/^[A-Za-z0-9 _.-]+$/.test(filename) || !filename.endsWith('_manager-report.json')) {
        return res.status(400).json({ error: 'Invalid "filename"' });
    }
    if (!content) return res.status(400).json({ error: 'Missing "content"' });
    try {
        const parsed = JSON.parse(content);
        if (parsed?.kind !== 'opportunityos-manager-report') {
            return res.status(400).json({ error: 'Content is not a manager report' });
        }
    } catch {
        return res.status(400).json({ error: 'Content is not valid JSON' });
    }

    const dir = path.normalize(dirRaw);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        return res.status(404).json({ error: 'Destination folder does not exist', path: dir });
    }

    const target = path.join(dir, filename);
    const temp = path.join(dir, `.${filename}.tmp`);
    try {
        writeFileSync(temp, content, 'utf8');
        renameSync(temp, target);
        return res.json({ ok: true, path: target, bytes: Buffer.byteLength(content, 'utf8') });
    } catch (err: any) {
        try { rmSync(temp, { force: true }); } catch { /* best effort */ }
        return res.status(500).json({ error: err?.message || String(err), path: target });
    }
});

/** Parse the `children` param: a JSON array of {name, kind, size, mtime}. */
const parseChildren = (raw: unknown): DirChildHint[] => {
    if (!raw || typeof raw !== 'string') return [];
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr
            .filter((c: any) => c && typeof c.name === 'string' && c.name.trim())
            .map((c: any) => ({
                name: String(c.name),
                kind: c.kind === 'file' || c.kind === 'directory' ? c.kind : undefined,
                size: Number.isFinite(c.size) ? Number(c.size) : undefined,
                mtime: Number.isFinite(c.mtime) ? Number(c.mtime) : undefined,
            }));
    } catch {
        return [];
    }
};

// --- Find a directory's absolute path by NAME + the entries it contains ---
// `children` (name + size + mtime) is what makes the answer trustworthy: two
// opportunities often own a folder with the same name, but not one holding the
// same file at the same byte size and timestamp. `hints` is the older
// names-only form, still accepted.
osRouter.get('/find-dir', async (req: Request, res: Response) => {
    const name = q(req, 'name').trim();
    if (!name || INVALID_NAME_RE.test(name)) return res.status(400).json({ error: 'Invalid "name"' });
    const children = parseChildren(req.query.children);
    // Absolute paths already known for this opportunity: a new folder is usually a
    // sibling of the previous one, so searching there first is both fast and precise.
    const near = parsePaths(req.query.near);

    const found = children.length
        ? await findDirByChildren(name, children, near)
        : await findDirByName(name, parsePaths(req.query.hints));
    if (found) return res.json({ ok: true, ...found });
    return res.status(404).json({ error: 'Directory not found', name });
});

// --- Move a file/folder on disk (atomic rename, verified) ---
// The browser's File System Access API can only emulate a move as copy + delete,
// which leaves the app showing a file in its new location while the bytes are
// still in the old one whenever the delete half fails. This does the real thing.
osRouter.post('/move', (req: Request, res: Response) => {
    const body = req.body || {};
    const sources: string[] = Array.isArray(body.sources)
        ? body.sources.filter((v: unknown): v is string => typeof v === 'string' && !!v.trim())
        : (typeof body.source === 'string' ? [body.source] : []);
    const destDirRaw = typeof body.destDir === 'string' ? body.destDir.trim() : '';
    const overwrite = body.overwrite === true;

    if (!sources.length) return res.status(400).json({ error: 'Missing "sources"' });
    if (!destDirRaw) return res.status(400).json({ error: 'Missing "destDir"' });

    const destDir = path.normalize(destDirRaw);
    if (!existsSync(destDir) || !statSync(destDir).isDirectory()) {
        return res.status(404).json({ error: 'Destination folder does not exist', path: destDir });
    }

    const moved: { source: string; target: string }[] = [];
    const failed: { source: string; error: string }[] = [];
    for (const raw of sources) {
        const source = path.normalize(raw);
        try {
            const { target } = movePath(source, destDir, overwrite);
            // Never report success on an unverified move: that is precisely how a file
            // ended up listed in its new home while still living in the old one.
            if (!existsSync(target) || existsSync(source)) {
                failed.push({ source, error: 'The move could not be verified on disk.' });
            } else {
                moved.push({ source, target });
            }
        } catch (err: any) {
            failed.push({ source, error: err?.message || String(err) });
        }
    }

    if (moved.length === 0) {
        return res.status(500).json({ error: failed[0]?.error || 'Nothing could be moved', moved, failed });
    }
    return res.json({ ok: true, moved, failed });
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
    const name = q(req, 'name').trim();
    if (!marker || /[\\/]/.test(marker)) return res.status(400).json({ error: 'Invalid "marker"' });
    if (name && /[\\/:*?"<>|]/.test(name)) return res.status(400).json({ error: 'Invalid "name"' });

    const found = await locateByMarker(marker, name);
    if (found) return res.json({ ok: true, ...found });
    return res.status(404).json({ error: 'Marker not found in known roots', marker });
});
