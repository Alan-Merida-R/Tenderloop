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
import { existsSync, statSync } from 'node:fs';
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
    return json(res, 200, { ok: true, port: PORT, features: ['open', 'open-many', 'reveal', 'clipboard', 'locate'] });
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
