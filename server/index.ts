// TenderLoop local backend.
// Grew out of server/openHelper.js (same port 3099, same launch lifecycle in
// motor_tenderloop.bat). Phase 1: OS-integration routes. Phase 2 adds the
// /api/db/* data plane (JSON DB behind a DbRepository).

import express from 'express';
import { PORT, HOST, ENABLE_OS_INTEGRATION } from './config';
import { osRouter } from './routes/os';
import { dbRouter } from './routes/db';
import { dbRepository } from './db/repository';

const app = express();
app.disable('x-powered-by');
// A local DB can be several MB, but accepting 100 MB requests made the helper
// unnecessarily easy to exhaust from a browser on the same machine.
app.use(express.json({ limit: '20mb' }));

const TRUSTED_ORIGINS = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]);

// The helper can open files, copy folders and access TenderLoop's local data.
// Enforce the local TenderLoop origin server-side: merely omitting a CORS
// header would still allow a hostile page to trigger simple GET requests.
app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!origin || !TRUSTED_ORIGINS.has(origin)) {
        return res.status(403).json({ error: 'Requests are restricted to the local TenderLoop application.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

// AUTH SLOT (hosted deployments): uncomment and implement when moving off
// localhost — e.g. app.use('/api', authMiddleware);

const health = (_req: express.Request, res: express.Response) => {
    res.json({
        ok: true,
        port: PORT,
        dbOpen: dbRepository.status().open,
        db: dbRepository.status(),
        features: ['open', 'open-many', 'reveal', 'clipboard', 'locate', 'find-dir', 'copy-template'],
    });
};

app.get('/api/health', health);
app.get('/health', health); // legacy alias
app.use('/api/db', dbRouter);

if (ENABLE_OS_INTEGRATION) {
    app.use('/api/os', osRouter);
    // Legacy root aliases (frontend still calls /open, /reveal, ... until the
    // Phase-3 cutover). Removed in Phase 4.
    app.use('/', osRouter);
}

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const server = app.listen(PORT, HOST, () => {
    console.log(`[tenderloop-server] Ready on http://${HOST}:${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`[tenderloop-server] Port ${PORT} already in use — server likely already running. Exiting quietly.`);
        process.exit(0);
    } else {
        console.error('[tenderloop-server] Server error:', err);
        process.exit(1);
    }
});
