// OS-integration primitives, ported 1:1 from the legacy server/openHelper.js.
// Behavior parity is the contract: same search order, same timeouts, same
// skip rules — only the transport (Express) changed.

import { exec } from 'node:child_process';
import { existsSync, statSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { runPowerShell, psSingleQuote } from './powershell';

/** Open a file/folder in its native Windows app (cmd `start`). */
export const openNative = (target: string): Promise<void> =>
    new Promise((resolve, reject) => {
        // The first "" is a required empty window title — without it,
        // `start "C:\path"` would treat the path as a title.
        const safe = target.replace(/"/g, '\\"');
        exec(`start "" "${safe}"`, { windowsHide: true }, (err) => {
            if (err) reject(err); else resolve();
        });
    });

/** Reveal (select) a file/folder in Windows Explorer. Fire-and-forget. */
export const revealInExplorer = (target: string): void => {
    exec(`explorer /select,"${target.replace(/"/g, '')}"`, { windowsHide: true }, () => { });
};

/** Copy real files to the Windows clipboard (paste in Explorer/Outlook/Teams). */
export const copyPathsToClipboard = async (paths: string[]): Promise<void> => {
    const list = paths.map(psSingleQuote).join(',');
    await runPowerShell(`Set-Clipboard -LiteralPath @(${list})`);
};

// ---------------------------------------------------------------------------
// Template copy (best-effort recursive)
// ---------------------------------------------------------------------------

export interface CopyStats {
    copied: number;
    skipped: { path: string; reason: string }[];
}

const shouldSkipCopyTemplateEntry = (name: string): boolean => {
    const lower = String(name || '').toLowerCase();
    return ['desktop.ini', 'thumbs.db', '.ds_store', '$recycle.bin', 'system volume information'].includes(lower);
};

/**
 * Recursive folder copy that skips Windows metadata files and never aborts on
 * a single failure — protected/locked entries are reported in `skipped`.
 */
export const copyDirectoryBestEffort = (
    sourceDir: string,
    targetDir: string,
    stats: CopyStats = { copied: 0, skipped: [] },
    rel = ''
): CopyStats => {
    mkdirSync(targetDir, { recursive: true });
    const entries = readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const source = path.join(sourceDir, entry.name);
        const target = path.join(targetDir, entry.name);
        const entryRel = rel ? path.join(rel, entry.name) : entry.name;
        if (shouldSkipCopyTemplateEntry(entry.name)) {
            stats.skipped.push({ path: entryRel, reason: 'System metadata skipped' });
            continue;
        }
        try {
            if (entry.isDirectory()) {
                copyDirectoryBestEffort(source, target, stats, entryRel);
                stats.copied += 1;
            } else if (entry.isFile()) {
                mkdirSync(path.dirname(target), { recursive: true });
                copyFileSync(source, target);
                stats.copied += 1;
            }
        } catch (err: any) {
            stats.skipped.push({ path: entryRel, reason: err?.message || String(err) });
        }
    }
    return stats;
};

// ---------------------------------------------------------------------------
// Directory search (find-dir / legacy locate)
// ---------------------------------------------------------------------------

export interface FindDirResult {
    path: string;
    source: 'index' | 'scan';
    searchedRoot?: string;
}

const scoreCandidate = (dir: string, hints: string[]): number => {
    if (!existsSync(dir)) return -1;
    try { if (!statSync(dir).isDirectory()) return -1; } catch { return -1; }
    let hits = 0;
    for (const h of hints) {
        if (!h || /[\\/]/.test(h)) continue;
        if (existsSync(path.join(dir, h))) hits++;
    }
    return hits;
};

const pickBest = (rawCandidates: string[], hints: string[]): string | null => {
    let best: string | null = null;
    let bestScore = -1;
    const candidates = rawCandidates.map(c => path.normalize(String(c).trim())).filter(Boolean);
    for (const dir of candidates) {
        const score = scoreCandidate(dir, hints);
        if (score > bestScore) { best = dir; bestScore = score; }
    }
    // Ambiguity guard: several same-named folders and none matched a hint.
    if (best && hints.length > 0 && bestScore === 0 && candidates.length > 1) return null;
    return best;
};

const userRoots = (extra: string[] = []): string[] => {
    const home = process.env.USERPROFILE || process.env.HOMEPATH || 'C:\\Users';
    const roots: string[] = [];
    const pushRoot = (p?: string) => { if (p && existsSync(p) && !roots.includes(p)) roots.push(p); };
    pushRoot(path.join(home, 'Documents'));
    pushRoot(path.join(home, 'Desktop'));
    pushRoot(path.join(home, 'Downloads'));
    pushRoot(process.env.OneDrive);
    pushRoot(process.env.OneDriveCommercial);
    pushRoot(process.env.OneDriveConsumer);
    pushRoot('C:\\Projects');
    pushRoot('D:\\');
    extra.forEach(p => pushRoot(p));
    return roots;
};

/**
 * Find a directory's absolute path by NAME + child-name hints.
 * 1) Windows Search index via System.ItemUrl — NEVER ItemPathDisplay, which
 *    returns localized paths ("C:\Usuarios\...") that don't exist on disk.
 * 2) Fallback: bounded-depth scan of prioritised user roots, excluding
 *    AppData/node_modules/recycle bin (an unbounded walk never finishes).
 */
export const findDirByName = async (name: string, hints: string[]): Promise<FindDirResult | null> => {
    try {
        const out = await runPowerShell(
            `$ErrorActionPreference='SilentlyContinue';` +
            `$n=${psSingleQuote(name)};` +
            `$sql='SELECT TOP 25 System.ItemUrl FROM SYSTEMINDEX WHERE System.FileName = ''' + $n.Replace("'","''") + ''' AND System.ItemType = ''Directory''';` +
            `$c=New-Object System.Data.OleDb.OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows'");` +
            `$c.Open();$q=$c.CreateCommand();$q.CommandText=$sql;` +
            `$r=$q.ExecuteReader();while($r.Read()){[uri]::UnescapeDataString(($r.GetString(0) -replace '^file:','')) -replace '/','\\'};$c.Close()`,
            10000
        );
        const found = pickBest((out || '').split(/\r?\n/).filter(l => l.trim()), hints);
        if (found) return { path: found, source: 'index' };
    } catch { /* index unavailable — fall through to scan */ }

    for (const root of userRoots()) {
        try {
            const out = await runPowerShell(
                `$ErrorActionPreference='SilentlyContinue';` +
                `Get-ChildItem -LiteralPath ${psSingleQuote(root)} -Filter ${psSingleQuote(name)} -Recurse -Directory -Force -Depth 6 ` +
                `| Where-Object { $_.FullName -notmatch '\\\\(AppData|node_modules|\\$Recycle\\.Bin)\\\\' } ` +
                `| Select-Object -First 5 -ExpandProperty FullName`,
                12000
            );
            const found = pickBest((out || '').split(/\r?\n/).filter(l => l.trim()), hints);
            if (found) return { path: found, source: 'scan', searchedRoot: root };
        } catch { /* try next root */ }
    }
    return null;
};

/**
 * DEPRECATED (kept for parity): find a folder by a unique marker file inside
 * it. Slow full-tree scan; superseded by findDirByName.
 */
export const locateByMarker = async (marker: string): Promise<{ path: string; searchedRoot: string } | null> => {
    try {
        const out = await runPowerShell(
            `$ErrorActionPreference='SilentlyContinue';` +
            `$m=${psSingleQuote(marker)};` +
            `$sql='SELECT TOP 10 System.ItemUrl FROM SYSTEMINDEX WHERE System.FileName = ''' + $m.Replace("'","''") + '''';` +
            `$c=New-Object System.Data.OleDb.OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows'");` +
            `$c.Open();$q=$c.CreateCommand();$q.CommandText=$sql;` +
            `$r=$q.ExecuteReader();while($r.Read()){` +
            `$p=[uri]::UnescapeDataString(($r.GetString(0) -replace '^file:','')) -replace '/','\\';` +
            `Split-Path -LiteralPath $p -Parent` +
            `};$c.Close()`,
            5000
        );
        const firstLine = (out || '').split(/\r?\n/).map(l => l.trim()).find(Boolean);
        if (firstLine && existsSync(path.join(firstLine, marker))) {
            return { path: firstLine, searchedRoot: 'index' };
        }
    } catch { /* index unavailable â€” fall back to scan */ }

    const home = process.env.USERPROFILE || process.env.HOMEPATH || 'C:\\Users';
    const roots: string[] = [];
    const pushRoot = (p?: string) => { if (p && existsSync(p) && !roots.includes(p)) roots.push(p); };
    pushRoot(home);
    pushRoot(process.env.OneDrive);
    pushRoot(process.env.OneDriveCommercial);
    pushRoot(process.env.OneDriveConsumer);
    pushRoot('C:\\Projects');
    pushRoot('D:\\');
    pushRoot('C:\\');

    for (const root of roots) {
        try {
            const dir = await runPowerShell(
                `$ErrorActionPreference='SilentlyContinue';` +
                `Get-ChildItem -LiteralPath ${psSingleQuote(root)} -Filter ${psSingleQuote(marker)} -Recurse -File -Force ` +
                `| Select-Object -First 1 -ExpandProperty DirectoryName`,
                20000
            );
            const firstLine = (dir || '').split(/\r?\n/)[0].trim();
            if (firstLine && existsSync(firstLine)) return { path: firstLine, searchedRoot: root };
        } catch { /* try next root */ }
    }
    return null;
};
