// OS-integration primitives, ported 1:1 from the legacy server/openHelper.js.
// Behavior parity is the contract: same search order, same timeouts, same
// skip rules — only the transport (Express) changed.

import { exec, execFile } from 'node:child_process';
import { existsSync, statSync, readdirSync, mkdirSync, copyFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runPowerShell, psSingleQuote } from './powershell';
import { runWarmPowerShell } from './psWorker';

/**
 * Prefer the warm PowerShell worker, fall back to a one-shot process.
 * Everything user-facing in the Folder tab goes through here: the worker turns
 * ~700 ms of interpreter start-up into ~30 ms, which is the difference between
 * "opens instantly" and "did my click register?".
 */
const runPs = async (script: string, timeoutMs = 8000): Promise<string> => {
    try {
        return await runWarmPowerShell(script, timeoutMs);
    } catch {
        return await runPowerShell(script, timeoutMs);
    }
};

/** Open a file in its native Windows app (cmd `start`). */
const openFileNative = (target: string): Promise<void> =>
    new Promise((resolve, reject) => {
        // The first "" is a required empty window title — without it,
        // `start "C:\path"` would treat the path as a title.
        const safe = target.replace(/"/g, '\\"');
        exec(`start "" "${safe}"`, { windowsHide: true }, (err) => {
            if (err) reject(err); else resolve();
        });
    });

/**
 * Open a FOLDER in Explorer and actually bring it to the front.
 *
 * Plain `start "" "C:\\folder"` launches Explorer, but this server is a
 * background process, so Windows' foreground lock refuses to raise the new
 * window - the taskbar button just blinks and the user has to click it. The
 * script below reuses an already-open window for that exact folder when there
 * is one, otherwise launches Explorer and waits for its window to appear, then
 * forces it foreground through the OppyWin interop pre-loaded in the worker.
 */
const openFolderForeground = async (target: string): Promise<void> => {
    // Explorer reports its location with backslashes and no trailing separator;
    // compare like with like or the window is never recognised as already open.
    const normalized = path.normalize(target).replace(/[\/]+$/, '');
    // [char]92 is a backslash: writing one as a literal would have to survive both
    // the TypeScript template string and PowerShell quoting.
    const script = [
        `$p=${psSingleQuote(normalized)}`,
        `if($global:OppyShell -eq $null){ $global:OppyShell=New-Object -ComObject Shell.Application }`,
        // Shell.Windows() also yields Internet Explorer windows; Document.Folder is
        // what tells an Explorer window apart, and it reports the real path.
        `function Get-OppyWin($want){ foreach($w in $global:OppyShell.Windows()){ $d=$null; try{ $d=$w.Document.Folder.Self.Path }catch{}; if($d -and ($d.TrimEnd([char]92) -ieq $want)){ return $w } }; return $null }`,
        `$win=Get-OppyWin $p`,
        // Enumerating Shell.Windows() costs a few hundred ms, so back off instead of
        // polling on a tight loop while the new window is being created.
        `if($win -eq $null){ Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $p + '"'); foreach($wait in 200,250,350,500,700){ Start-Sleep -Milliseconds $wait; $win=Get-OppyWin $p; if($win -ne $null){ break } } }`,
        `if($win -ne $null){ [void][OppyWin]::Force([IntPtr]$win.HWND) }`,
    ].join('; ');

    // Raising a window can take a couple of seconds when Explorer has to create it,
    // but the caller only needs to know the request was accepted — making the HTTP
    // round trip wait for the animation is what made opening feel sluggish. Let the
    // raise finish in the background and answer as soon as the folder is on its way.
    const raise = runWarmPowerShell(script, 15000).catch(() => {
        // Worker unavailable: at least open the folder, even if it lands behind.
        execFile('explorer.exe', [normalized], { windowsHide: true }, () => { });
    });
    await Promise.race([raise, new Promise<void>(resolve => { setTimeout(resolve, 400); })]);
};

/** Open a file/folder in its native Windows app. Folders are raised to the front. */
export const openNative = async (target: string): Promise<void> => {
    let isDir = false;
    try { isDir = statSync(target).isDirectory(); } catch { /* treat as file */ }
    if (isDir) return openFolderForeground(target);
    return openFileNative(target);
};

// ---------------------------------------------------------------------------
// Move (real filesystem rename, with a cross-volume copy fallback)
// ---------------------------------------------------------------------------

/**
 * Move a file/folder on disk.
 *
 * The Folder tab used to move things purely through File System Access handles
 * (copy the entry, then `handle.remove()`). When the remove half failed — locked
 * file, OneDrive placeholder, a handle whose permission had silently lapsed —
 * the UI had already re-listed the destination, so the app showed the file in
 * its new home while the bytes were still in the old one, and opening it failed
 * with "does not exist". A rename through the OS is atomic: it either moves or
 * it reports an error, and there is no in-between state to mis-render.
 */
export const movePath = (source: string, destDir: string, overwrite = false): { target: string } => {
    if (!existsSync(source)) throw new Error(`Source does not exist: ${source}`);
    if (!existsSync(destDir) || !statSync(destDir).isDirectory()) throw new Error(`Destination folder does not exist: ${destDir}`);

    const name = path.basename(source);
    const target = path.join(destDir, name);
    const normalizedSource = path.resolve(source);
    const normalizedTarget = path.resolve(target);
    if (normalizedSource === normalizedTarget) return { target };
    // Moving a folder into itself would delete the tree it is being moved from.
    if (statSync(source).isDirectory() && (normalizedTarget + path.sep).startsWith(normalizedSource + path.sep)) {
        throw new Error('A folder cannot be moved inside itself.');
    }
    if (existsSync(target) && !overwrite) throw new Error(`"${name}" already exists in the destination folder.`);

    try {
        if (existsSync(target) && overwrite) rmSync(target, { recursive: true, force: true });
        renameSync(source, target);
        return { target };
    } catch (err: any) {
        // EXDEV: different volumes (a network drive, a different disk) — rename
        // is impossible there, so fall back to copy + delete, and only delete
        // once the copy is verified to exist.
        if (err?.code !== 'EXDEV') throw err;
        const stats = statSync(source);
        if (stats.isDirectory()) {
            copyDirectoryBestEffort(source, target);
        } else {
            mkdirSync(path.dirname(target), { recursive: true });
            copyFileSync(source, target);
        }
        if (!existsSync(target)) throw new Error(`The copy to "${target}" could not be verified; nothing was deleted.`);
        rmSync(source, { recursive: true, force: true });
        return { target };
    }
};

/** Reveal (select) a file/folder in Windows Explorer. Fire-and-forget. */
export const revealInExplorer = (target: string): void => {
    exec(`explorer /select,"${target.replace(/"/g, '')}"`, { windowsHide: true }, () => { });
};

/** Pin/unpin the dedicated timer popup above every Windows window. The title is
 * supplied by the local app and matched exactly, so no unrelated window is touched. */
export const setTimerWindowTopmost = async (title: string, enabled: boolean): Promise<boolean> => {
    if (!title.trim() || title.length > 500) return false;
    const typeDefinition = 'using System; using System.Runtime.InteropServices; public static class OpportunityOSTimerWindow { [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindow(string className, string windowName); [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags); }';
    const script = [
        `$title=${psSingleQuote(title)}`,
        `Add-Type -TypeDefinition ${psSingleQuote(typeDefinition)}`,
        `$h=[OpportunityOSTimerWindow]::FindWindow($null,$title)`,
        `if($h -eq [IntPtr]::Zero){ Write-Output 'NOT_FOUND'; exit }`,
        `$after=if(${enabled ? '$true' : '$false'}){[IntPtr](-1)}else{[IntPtr](-2)}`,
        `$ok=[OpportunityOSTimerWindow]::SetWindowPos($h,$after,0,0,0,0,0x0003)`,
        `if($ok){Write-Output 'OK'}else{Write-Output 'FAILED'}`,
    ].join("; ");
    const out = await runPowerShell(script, 5000).catch(() => '');
    return out.includes('OK');
};

/** Resolve a browser-selected file to one unambiguous indexed Windows path. */
export const findFileByMetadata = async (name: string, size: number, mtime: number): Promise<string | null> => {
    const out = await runPowerShell(
        `$ErrorActionPreference='SilentlyContinue';` +
        `$n=${psSingleQuote(name)};` +
        `$sql='SELECT TOP 50 System.ItemUrl FROM SYSTEMINDEX WHERE System.FileName = ''' + $n.Replace("'","''") + '''';` +
        `$c=New-Object System.Data.OleDb.OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows'");` +
        `$c.Open();$q=$c.CreateCommand();$q.CommandText=$sql;$r=$q.ExecuteReader();` +
        `while($r.Read()){[uri]::UnescapeDataString(($r.GetString(0) -replace '^file:','')) -replace '/','\\'};$c.Close()`,
        2000
    ).catch(() => '');
    const matches = (out || '').split(/\r?\n/).map(p => path.normalize(p.trim())).filter(candidate => {
        try {
            const info = statSync(candidate);
            return info.isFile() && info.size === size && Math.abs(info.mtimeMs - mtime) < 2000;
        } catch { return false; }
    });
    return matches.length === 1 ? matches[0] : null;
};

/** Copy real files to the Windows clipboard (paste in Explorer/Outlook/Teams). */
export const copyPathsToClipboard = async (paths: string[]): Promise<void> => {
    const list = paths.map(psSingleQuote).join(',');
    // Warm worker: this is a hot, user-visible action and a cold PowerShell start
    // made it feel like the click had not registered.
    await runPs(`Set-Clipboard -LiteralPath @(${list})`, 10000);
};

/** Copy reply HTML/text plus real attachment files as one multi-format Windows clipboard object. */
export const copyEmailReplyToClipboard = async (html: string, text: string, paths: string[]): Promise<void> => {
    const html64 = Buffer.from(html, 'utf8').toString('base64');
    const text64 = Buffer.from(text, 'utf8').toString('base64');
    const list = paths.map(psSingleQuote).join(',');
    await runPowerShell(
        `Add-Type -AssemblyName System.Windows.Forms;` +
        `$html=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${psSingleQuote(html64)}));` +
        `$text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${psSingleQuote(text64)}));` +
        `$data=New-Object System.Windows.Forms.DataObject;` +
        `$data.SetText($text,[System.Windows.Forms.TextDataFormat]::UnicodeText);` +
        `$data.SetText($html,[System.Windows.Forms.TextDataFormat]::Html);` +
        `$files=New-Object System.Collections.Specialized.StringCollection;` +
        `@(${list})|ForEach-Object{[void]$files.Add($_)};` +
        `if($files.Count -gt 0){$data.SetFileDropList($files)};` +
        `[System.Windows.Forms.Clipboard]::SetDataObject($data,$true)`
    );
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

// ---------------------------------------------------------------------------
// Exact directory resolution (find-dir)
// ---------------------------------------------------------------------------

/**
 * A child entry of the folder being located, as the browser sees it.
 * `size`/`mtime` are what make this reliable: two opportunities can easily own a
 * folder called "R0", but they will not both contain a file of the same name,
 * byte size AND modification time.
 */
export interface DirChildHint {
    name: string;
    /** Omitted when the caller only knows the entry's name (legacy hint lists). */
    kind?: 'file' | 'directory';
    size?: number;
    mtime?: number;
}

const SCAN_SKIP = new Set([
    'appdata', 'node_modules', '$recycle.bin', 'system volume information',
    '.git', 'windows', 'program files', 'program files (x86)', 'programdata',
    'perflogs', '.vscode', '.cache',
]);

/**
 * How well `dir` matches the children the browser reported. Returns -1 when the
 * folder cannot be a match at all; `exact` means every reported entry was found,
 * with matching size and mtime wherever the browser could supply them.
 */
const matchChildren = (dir: string, children: DirChildHint[]): { score: number; exact: boolean } => {
    const usable = children.filter(c => c.name && !/[\\/]/.test(c.name));
    if (usable.length === 0) return { score: 0, exact: false };
    let present = 0;
    let verified = 0;
    let verifiable = 0;
    for (const child of usable) {
        const full = path.join(dir, child.name);
        let info;
        try { info = statSync(full); } catch { continue; }
        if (child.kind === 'directory' && !info.isDirectory()) continue;
        if (child.kind === 'file' && !info.isFile()) continue;
        present += 1;
        if (child.kind !== 'file' || typeof child.size !== 'number' || typeof child.mtime !== 'number') continue;
        verifiable += 1;
        // OneDrive/SMB round mtimes differently between the browser's File object and
        // the filesystem, so allow a 2 s window (same tolerance as findFileByMetadata).
        if (info.size === child.size && Math.abs(info.mtimeMs - child.mtime) < 2000) verified += 1;
    }
    if (present === 0) return { score: -1, exact: false };
    return {
        score: present + verified,
        exact: present === usable.length && verified === verifiable,
    };
};

/**
 * Choose the one directory that matches the reported children, or nothing.
 *
 * "Or nothing" is the important half. The previous implementation returned the
 * best-scoring candidate whenever it was not tied, so a folder missing from the
 * index could resolve to an unrelated same-named folder and the expediente
 * silently pointed at another job's documents. A candidate now has to be an
 * exact content match AND the only one.
 */
const pickExact = (candidates: string[], children: DirChildHint[]): string | null => {
    const seen = new Set<string>();
    const exact: string[] = [];
    for (const raw of candidates) {
        const dir = path.normalize(String(raw || '').trim());
        if (!dir || seen.has(dir.toLowerCase())) continue;
        seen.add(dir.toLowerCase());
        try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
        if (matchChildren(dir, children).exact) exact.push(dir);
    }
    return exact.length === 1 ? exact[0] : null;
};

/** Every directory with this exact name, according to the Windows Search index. */
const indexedDirsNamed = async (name: string, limit = 100): Promise<string[]> => {
    const out = await runPs(
        `$ErrorActionPreference='SilentlyContinue';` +
        `$n=${psSingleQuote(name)};` +
        `$sql='SELECT TOP ${limit} System.ItemUrl FROM SYSTEMINDEX WHERE System.FileName = ''' + $n.Replace("'","''") + ''' AND System.ItemType = ''Directory''';` +
        `$c=New-Object System.Data.OleDb.OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows'");` +
        `$c.Open();$q=$c.CreateCommand();$q.CommandText=$sql;` +
        `$r=$q.ExecuteReader();while($r.Read()){[uri]::UnescapeDataString(($r.GetString(0) -replace '^file:','')) -replace '/','\\'};$c.Close()`,
        2500
    ).catch(() => '');
    return (out || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
};

/**
 * Directories that directly contain a file with this exact name, per the index.
 *
 * Files are indexed far more aggressively than folders, so asking "who holds
 * PROPOSAL.docx?" frequently answers when "where is folder R0?" does not — and
 * the answer is then verified against size and mtime, so it cannot be wrong.
 */
const indexedParentsOfChild = async (childName: string, limit = 60): Promise<string[]> => {
    const out = await runPs(
        `$ErrorActionPreference='SilentlyContinue';` +
        `$n=${psSingleQuote(childName)};` +
        `$sql='SELECT TOP ${limit} System.ItemUrl FROM SYSTEMINDEX WHERE System.FileName = ''' + $n.Replace("'","''") + '''';` +
        `$c=New-Object System.Data.OleDb.OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows'");` +
        `$c.Open();$q=$c.CreateCommand();$q.CommandText=$sql;` +
        `$r=$q.ExecuteReader();while($r.Read()){` +
        `$p=[uri]::UnescapeDataString(($r.GetString(0) -replace '^file:','')) -replace '/','\\';` +
        `Split-Path -LiteralPath $p -Parent};$c.Close()`,
        2500
    ).catch(() => '');
    return (out || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
};

/**
 * Breadth-first scan for directories named `name`, in Node rather than through
 * `Get-ChildItem -Recurse`.
 *
 * The PowerShell recursive scan this replaces was removed for being slow enough
 * to freeze the UI, which left any folder outside the Windows Search index with
 * no way to resolve at all — that is the reported "linking an existing folder
 * never fills in the path". readdirSync over a pruned tree with a hard time
 * budget runs inline comfortably, and every candidate still has to pass
 * `pickExact`, so a slow scan can only ever cost time, never correctness.
 */
const scanForDirsNamed = (name: string, roots: string[], budgetMs: number, maxDepth = 7): string[] => {
    const deadline = Date.now() + budgetMs;
    const wanted = name.toLowerCase();
    const found: string[] = [];
    const seen = new Set<string>();
    const queue: { dir: string; depth: number }[] = roots
        .filter(r => r && existsSync(r))
        .map(r => ({ dir: path.normalize(r), depth: 0 }));

    while (queue.length > 0) {
        if (Date.now() > deadline) break;
        const { dir, depth } = queue.shift()!;
        const lower = dir.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        if (depth >= maxDepth) continue;
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const childLower = entry.name.toLowerCase();
            if (childLower.startsWith('$') || SCAN_SKIP.has(childLower)) continue;
            const full = path.join(dir, entry.name);
            if (childLower === wanted) found.push(full);
            queue.push({ dir: full, depth: depth + 1 });
        }
    }
    return found;
};

/**
 * Resolve a directory's absolute path from its name plus the entries the browser
 * can see inside it.
 *
 * `near` are paths already known for this opportunity (the previous revision's
 * folder, say). Their parents are searched first because a newly created folder
 * is almost always a sibling of the last one, which usually answers instantly.
 */
export const findDirByChildren = async (
    name: string,
    children: DirChildHint[],
    near: string[] = [],
): Promise<FindDirResult | null> => {
    // 0. Direct hit: the folder sits exactly where a related one already lives.
    const nearDirs = near
        .map(p => path.normalize(String(p || '').trim().replace(/[\\/]+$/, '')))
        .filter(p => p && p !== '.');
    const directGuesses = nearDirs.flatMap(p => [p, path.join(path.dirname(p), name), path.join(p, name)]);
    const direct = pickExact(directGuesses, children);
    if (direct) return { path: direct, source: 'index' };

    // 1. Windows Search index, by folder name — instant when the folder is indexed.
    const byIndex = pickExact(await indexedDirsNamed(name), children);
    if (byIndex) return { path: byIndex, source: 'index' };

    // 1b. Same index, asked the other way round: which folders hold these files?
    // Only files carrying a size and mtime are used, so a hit is self-verifying.
    const verifiableChildren = children
        .filter(c => c.kind === 'file' && typeof c.size === 'number' && typeof c.mtime === 'number')
        .slice(0, 3);
    for (const child of verifiableChildren) {
        const parents = await indexedParentsOfChild(child.name);
        const owner = pickExact(
            parents.filter(dir => path.basename(dir).toLowerCase() === name.toLowerCase()),
            children,
        );
        if (owner) return { path: owner, source: 'index' };
    }

    // 2. Targeted scan around folders we already know about (cheap and precise).
    const nearRoots = Array.from(new Set(nearDirs.map(p => path.dirname(p)).filter(p => existsSync(p))));
    if (nearRoots.length) {
        const nearHit = pickExact(scanForDirsNamed(name, nearRoots, 1500, 4), children);
        if (nearHit) return { path: nearHit, source: 'scan', searchedRoot: nearRoots[0] };
    }

    // 3. Bounded scan of the usual document roots.
    const roots = userRoots();
    const byScan = pickExact(scanForDirsNamed(name, roots, 4000), children);
    if (byScan) return { path: byScan, source: 'scan', searchedRoot: roots[0] };

    return null;
};

/**
 * Back-compatible entry point: resolve by name plus plain child NAMES.
 *
 * Delegates to findDirByChildren, which is strictly safer than the old
 * best-effort scoring — an ambiguous or unverifiable candidate now resolves to
 * nothing instead of to "the least-bad guess", because a wrong path here points
 * every native action at somebody else's folder.
 */
export const findDirByName = async (name: string, hints: string[]): Promise<FindDirResult | null> =>
    findDirByChildren(name, hints.map(hint => ({ name: hint })));

/**
 * DEPRECATED (kept for parity): find a folder by a unique marker file inside
 * it. Slow full-tree scan; superseded by findDirByName.
 */
export const locateByMarker = async (marker: string, folderName = ''): Promise<{ path: string; searchedRoot: string } | null> => {
    // The marker itself may take several seconds to enter Windows Search. The folder
    // normally already exists in the index, though, so enumerate every same-named
    // folder and test for the unique marker directly on disk. This is deterministic
    // even when several opportunities use an identical revision folder name.
    if (folderName) {
        try {
            const out = await runPowerShell(
                `$ErrorActionPreference='SilentlyContinue';` +
                `$n=${psSingleQuote(folderName)};` +
                `$sql='SELECT TOP 100 System.ItemUrl FROM SYSTEMINDEX WHERE System.FileName = ''' + $n.Replace("'","''") + ''' AND System.ItemType = ''Directory''';` +
                `$c=New-Object System.Data.OleDb.OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows'");` +
                `$c.Open();$q=$c.CreateCommand();$q.CommandText=$sql;` +
                `$r=$q.ExecuteReader();while($r.Read()){[uri]::UnescapeDataString(($r.GetString(0) -replace '^file:','')) -replace '/','\\'};$c.Close()`,
                2500
            );
            const matches = (out || '')
                .split(/\r?\n/)
                .map(candidate => path.normalize(candidate.trim()))
                .filter(candidate => candidate && existsSync(path.join(candidate, marker)));
            const unique = Array.from(new Set(matches));
            if (unique.length === 1) return { path: unique[0], searchedRoot: 'folder-index' };
        } catch { /* fall through to querying the marker itself */ }
    }
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
            1500
        );
        const firstLine = (out || '').split(/\r?\n/).map(l => l.trim()).find(Boolean);
        if (firstLine && existsSync(path.join(firstLine, marker))) {
            return { path: firstLine, searchedRoot: 'index' };
        }
    } catch { /* index unavailable â€” fall back to scan */ }

    // A marker that is not indexed yet is preferable to an incorrect path.
    // Do not recursively scan all local drives from the UI request.
    return null;

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
