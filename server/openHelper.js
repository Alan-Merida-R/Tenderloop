// Local helper server that opens files/folders in their native Windows app.
// No external deps — uses Node's built-in http + child_process.

import http from 'node:http';
import { exec } from 'node:child_process';
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
    return json(res, 200, { ok: true, port: PORT });
  }

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
