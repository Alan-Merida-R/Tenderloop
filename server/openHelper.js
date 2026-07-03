// Local helper server that opens files/folders in their native Windows app and
// provides OS-level integration the browser sandbox cannot do on its own:
//   /open        — open a single file/folder in its native app
//   /open-many   — open several paths at once
//   /reveal      — reveal a file/folder in Explorer (selected)
//   /clipboard   — copy real files to the Windows clipboard (paste in Explorer/Outlook/Teams)
//   /locate      — find the absolute path of a folder by a unique marker file
// No external deps — uses Node's built-in http + child_process + PowerShell.

import http from 'node:http';
import { exec, execFile } from 'node:child_process';
import { existsSync, statSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.TENDERLOOP_OPEN_PORT) || 3099;
const HOST = '127.0.0.1';

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
};

const openNative = (target) => new Promise((resolve, reject) => {
  // On Windows, `start` is a cmd.exe built-in. The first "" is a required empty
  // window title — without it, `start "C:\path"` would treat the path as a title.
  const safe = target.replace(/"/g, '\\"');
  const cmd = `start "" "${safe}"`;
  exec(cmd, { windowsHide: true }, (err) => {
    if (err) reject(err); else resolve();
  });
});

// Run a PowerShell command and resolve with its stdout (trimmed).
// `timeoutMs` kills the process if it runs too long (e.g. a slow disk search).
const runPowerShell = (script, timeoutMs = 0) => new Promise((resolve, reject) => {
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 1024 * 1024 * 8, timeout: timeoutMs, killSignal: 'SIGKILL' },
    (err, stdout) => {
      // On timeout `err` is set but we may still have partial stdout — use it.
      const out = (stdout || '').trim();
      if (err && !out) reject(err); else resolve(out);
    }
  );
});

// Escape a JS string so it can sit inside a PowerShell single-quoted literal.
const psSingleQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Parse a `paths` query param that holds a JSON array of absolute paths.
const parsePaths = (raw) => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(p => typeof p === 'string' && p.trim()) : [];
  } catch {
    return [];
  }
};

const shouldSkipCopyTemplateEntry = (name) => {
  const lower = String(name || '').toLowerCase();
  return ['desktop.ini', 'thumbs.db', '.ds_store', '$recycle.bin', 'system volume information'].includes(lower);
};

const copyDirectoryBestEffort = (sourceDir, targetDir, stats = { copied: 0, skipped: [] }, rel = '') => {
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
    } catch (err) {
      stats.skipped.push({ path: entryRel, reason: err?.message || String(err) });
    }
  }
  return stats;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true, port: PORT, features: ['open', 'open-many', 'reveal', 'clipboard', 'locate', 'find-dir', 'copy-template'] });
  }

  // --- Copy a full template folder by absolute paths, bypassing browser picker restrictions ---
  if (url.pathname === '/copy-template' && req.method === 'GET') {
    const sourceRaw = url.searchParams.get('source');
    const destParentRaw = url.searchParams.get('destParent');
    const folderName = (url.searchParams.get('folderName') || '').trim();
    if (!sourceRaw || !destParentRaw || !folderName) return json(res, 400, { error: 'Missing source, destParent or folderName' });
    if (/[\\/:*?"<>|]/.test(folderName)) return json(res, 400, { error: 'Invalid folderName' });

    const source = path.normalize(sourceRaw);
    const destParent = path.normalize(destParentRaw);
    if (!existsSync(source) || !statSync(source).isDirectory()) return json(res, 404, { error: 'Template source does not exist or is not a folder', source });
    if (!existsSync(destParent) || !statSync(destParent).isDirectory()) return json(res, 404, { error: 'Destination parent does not exist or is not a folder', destParent });

    const target = path.join(destParent, folderName);
    try {
      const result = copyDirectoryBestEffort(source, target);
      if (result.copied === 0) return json(res, 500, { error: 'No template files could be copied', skipped: result.skipped });
      return json(res, 200, { ok: true, target, copied: result.copied, skipped: result.skipped });
    } catch (err) {
      return json(res, 500, { error: err?.message || String(err), source, target });
    }
  }

  // --- Find a directory's absolute path by its NAME + child-name hints ---
  // Replaces the marker-file approach of /locate: nothing is written into the
  // user's folder. The Windows Search index is asked first (instant for any
  // indexed location: user profile, OneDrive, ...), then prioritised roots are
  // scanned as fallback. `hints` (names of entries inside the folder) are used
  // to verify/disambiguate folders that share the same name.
  if (url.pathname === '/find-dir' && req.method === 'GET') {
    const name = (url.searchParams.get('name') || '').trim();
    if (!name || /[\\/:*?"<>|]/.test(name)) return json(res, 400, { error: 'Invalid "name"' });
    const hints = parsePaths(url.searchParams.get('hints'));

    const scoreCandidate = (dir) => {
      if (!existsSync(dir)) return -1;
      try { if (!statSync(dir).isDirectory()) return -1; } catch { return -1; }
      let hits = 0;
      for (const h of hints) {
        if (!h || /[\\/]/.test(h)) continue;
        if (existsSync(path.join(dir, h))) hits++;
      }
      return hits;
    };
    const pickBest = (rawCandidates) => {
      let best = null;
      let bestScore = -1;
      const candidates = rawCandidates.map(c => path.normalize(String(c).trim())).filter(Boolean);
      for (const dir of candidates) {
        const score = scoreCandidate(dir);
        if (score > bestScore) { best = dir; bestScore = score; }
      }
      // Ambiguity guard: several same-named folders and none matched a hint.
      if (best && hints.length > 0 && bestScore === 0 && candidates.length > 1) return null;
      return best;
    };

    // 1. Windows Search index (no disk walk — returns instantly).
    // System.ItemUrl (file:C:/Users/...) is used instead of ItemPathDisplay,
    // which returns LOCALIZED paths ("C:\Usuarios\...\Documentos") that don't
    // exist on the real filesystem.
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
      const found = pickBest((out || '').split(/\r?\n/).filter(l => l.trim()));
      if (found) return json(res, 200, { ok: true, path: found, source: 'index' });
    } catch { /* index unavailable — fall through to scan */ }

    // 2. Fallback: scan prioritised roots for a directory with that name.
    // Likely user locations go FIRST with a bounded depth — a naive recursive
    // walk from the profile root drowns in AppData and never finishes (that was
    // the old /locate bug). AppData/node_modules/recycle bin are filtered out.
    const home = process.env.USERPROFILE || process.env.HOMEPATH || 'C:\\Users';
    const roots = [];
    const pushRoot = (p) => { if (p && existsSync(p) && !roots.includes(p)) roots.push(p); };
    pushRoot(path.join(home, 'Documents'));
    pushRoot(path.join(home, 'Desktop'));
    pushRoot(path.join(home, 'Downloads'));
    pushRoot(process.env.OneDrive);
    pushRoot(process.env.OneDriveCommercial);
    pushRoot(process.env.OneDriveConsumer);
    pushRoot('C:\\Projects');
    pushRoot('D:\\');
    for (const root of roots) {
      try {
        const out = await runPowerShell(
          `$ErrorActionPreference='SilentlyContinue';` +
          `Get-ChildItem -LiteralPath ${psSingleQuote(root)} -Filter ${psSingleQuote(name)} -Recurse -Directory -Force -Depth 6 ` +
          `| Where-Object { $_.FullName -notmatch '\\\\(AppData|node_modules|\\$Recycle\\.Bin)\\\\' } ` +
          `| Select-Object -First 5 -ExpandProperty FullName`,
          12000
        );
        const found = pickBest((out || '').split(/\r?\n/).filter(l => l.trim()));
        if (found) return json(res, 200, { ok: true, path: found, source: 'scan', searchedRoot: root });
      } catch { /* try next root */ }
    }
    return json(res, 404, { error: 'Directory not found', name });
  }

  // --- Open a single file/folder in its native app ---
  if (url.pathname === '/open' && req.method === 'GET') {
    const raw = url.searchParams.get('path');
    if (!raw) return json(res, 400, { error: 'Missing "path" query param' });

    const target = path.normalize(raw);
    if (!existsSync(target)) {
      return json(res, 404, { error: 'Path does not exist', path: target });
    }

    try {
      await openNative(target);
      const kind = statSync(target).isDirectory() ? 'directory' : 'file';
      return json(res, 200, { ok: true, opened: target, kind });
    } catch (err) {
      return json(res, 500, { error: err.message, path: target });
    }
  }

  // --- Open several paths at once ---
  if (url.pathname === '/open-many' && req.method === 'GET') {
    const paths = parsePaths(url.searchParams.get('paths'));
    if (paths.length === 0) return json(res, 400, { error: 'Missing or empty "paths" (JSON array)' });

    const opened = [];
    const missing = [];
    for (const raw of paths) {
      const target = path.normalize(raw);
      if (!existsSync(target)) { missing.push(target); continue; }
      try { await openNative(target); opened.push(target); }
      catch { missing.push(target); }
    }
    return json(res, 200, { ok: true, opened, missing });
  }

  // --- Reveal a file/folder in Explorer (selected) ---
  if (url.pathname === '/reveal' && req.method === 'GET') {
    const raw = url.searchParams.get('path');
    if (!raw) return json(res, 400, { error: 'Missing "path" query param' });
    const target = path.normalize(raw);
    if (!existsSync(target)) return json(res, 404, { error: 'Path does not exist', path: target });
    exec(`explorer /select,"${target.replace(/"/g, '')}"`, { windowsHide: true }, () => {});
    return json(res, 200, { ok: true, revealed: target });
  }

  // --- Copy real files to the Windows clipboard (paste in Explorer/Outlook/Teams) ---
  if (url.pathname === '/clipboard' && req.method === 'GET') {
    const paths = parsePaths(url.searchParams.get('paths'));
    if (paths.length === 0) return json(res, 400, { error: 'Missing or empty "paths" (JSON array)' });

    const existing = paths.map(p => path.normalize(p)).filter(p => existsSync(p));
    if (existing.length === 0) return json(res, 404, { error: 'None of the paths exist', paths });

    const list = existing.map(psSingleQuote).join(',');
    try {
      await runPowerShell(`Set-Clipboard -LiteralPath @(${list})`);
      return json(res, 200, { ok: true, copied: existing, count: existing.length });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  // --- Locate the absolute path of a folder by a unique marker file inside it ---
  // The web app writes a uniquely-named marker file into the just-picked folder
  // (via the File System Access API), then asks us to find it. We search the
  // user's most likely roots and return the marker's parent directory.
  if (url.pathname === '/locate' && req.method === 'GET') {
    const marker = (url.searchParams.get('marker') || '').trim();
    if (!marker || /[\\/]/.test(marker)) return json(res, 400, { error: 'Invalid "marker"' });

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
        return json(res, 200, { ok: true, path: firstLine, searchedRoot: 'index' });
      }
    } catch { /* index unavailable; scan below */ }

    const home = process.env.USERPROFILE || process.env.HOMEPATH || 'C:\\Users';
    const roots = [];
    const pushRoot = (p) => { if (p && existsSync(p) && !roots.includes(p)) roots.push(p); };
    // Prioritised roots: where work folders almost always live.
    pushRoot(home);
    pushRoot(process.env.OneDrive);
    pushRoot(process.env.OneDriveCommercial);
    pushRoot(process.env.OneDriveConsumer);
    pushRoot('C:\\Projects');
    pushRoot('D:\\');
    pushRoot('C:\\');

    const markerLit = psSingleQuote(marker);
    for (const root of roots) {
      try {
        // Per-root timeout so a slow/huge drive can't hang the request.
        const dir = await runPowerShell(
          `$ErrorActionPreference='SilentlyContinue';` +
          `Get-ChildItem -LiteralPath ${psSingleQuote(root)} -Filter ${markerLit} -Recurse -File -Force ` +
          `| Select-Object -First 1 -ExpandProperty DirectoryName`,
          20000
        );
        const firstLine = (dir || '').split(/\r?\n/)[0].trim();
        if (firstLine && existsSync(firstLine)) {
          return json(res, 200, { ok: true, path: firstLine, searchedRoot: root });
        }
      } catch { /* try next root */ }
    }
    return json(res, 404, { error: 'Marker not found in known roots', marker });
  }

  json(res, 404, { error: 'Not found' });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[open-helper] Port ${PORT} already in use — helper likely already running. Exiting quietly.`);
    process.exit(0);
  } else {
    console.error('[open-helper] Server error:', err);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[open-helper] Ready on http://${HOST}:${PORT}`);
});
