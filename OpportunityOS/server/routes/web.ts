// Web automation endpoints (/api/web/*).
//
// Phase 1 is reconnaissance: sign in once in a visible window, then probe a
// page to see exactly which fields and network payloads are extractable. The
// probe writes its artifacts (HTML, text, screenshot, JSON responses) to
// %APPDATA%\OpportunityOS\web-probes so they can be inspected offline.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isWebUrlAllowed, WEB_ALLOWED_HOSTS } from '../config';
import {
    openLoginWindow, probeUrl, redactProbe, sessionStatus, closeSession,
    startRecording, stopRecording, getRecordedSteps, recordingStatus,
} from '../os/webAutomation';
import { RECIPE_FIELDS } from '../os/bfoFieldMap';

export const webRouter = Router();

/**
 * Read a string parameter from either the JSON body or the query string.
 *
 * The query-string fallback exists for the Windows .bat launchers: quoting JSON
 * inside cmd is a minefield (a pasted value can carry a stray carriage return
 * straight into the middle of a JSON string and break the parse), while a query
 * parameter needs no escaping at all. Trimmed, because that stray  is exactly
 * what tends to ride along.
 */
const param = (req: Request, name: string): string => {
    const fromBody = (req.body as Record<string, unknown> | undefined)?.[name];
    if (typeof fromBody === 'string') return fromBody.trim();
    const fromQuery = req.query?.[name];
    return typeof fromQuery === 'string' ? fromQuery.trim() : '';
};

/** Validate the caller-supplied URL, or write the 4xx and return null. */
const requireAllowedUrl = (req: Request, res: Response): string | null => {
    const url = param(req, 'url');
    if (!url) {
        res.status(400).json({ error: 'Missing "url".' });
        return null;
    }
    if (!isWebUrlAllowed(url)) {
        res.status(403).json({
            error: 'This host is not allow-listed for web automation.',
            allowedHosts: WEB_ALLOWED_HOSTS,
            hint: 'Add it with the OPPORTUNITYOS_WEB_HOSTS environment variable (comma-separated).',
        });
        return null;
    }
    return url;
};

webRouter.get('/status', (_req: Request, res: Response) => {
    res.json({ ok: true, session: sessionStatus(), allowedHosts: WEB_ALLOWED_HOSTS });
});

// --- Open a visible window so the user can complete SSO/MFA by hand ---
webRouter.post('/login', async (req: Request, res: Response) => {
    const url = requireAllowedUrl(req, res);
    if (!url) return;
    try {
        const result = await openLoginWindow(url);
        return res.json({
            ok: true,
            ...result,
            message: 'Sign in in the window that just opened, then leave it open or close it — the session stays in the Tender Control profile.',
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// --- Inspect a page: fields, label/value pairs, captured JSON responses ---
//
// Redaction is ON unless the caller explicitly opts out: the safe default is
// the one where a probe of a real customer record can be shared freely. The
// full content is always written to the artifacts folder either way.
webRouter.post('/probe', async (req: Request, res: Response) => {
    const url = requireAllowedUrl(req, res);
    if (!url) return;
    const headless = req.body?.headless !== false;
    const redact = req.body?.redact !== false;
    const waitMs = Number(req.body?.waitMs);
    try {
        const result = await probeUrl(url, {
            headless,
            waitMs: Number.isFinite(waitMs) ? waitMs : undefined,
        });
        return res.json(redact ? redactProbe(result) : result);
    } catch (err: any) {
        const message = String(err?.message || err);
        // A VPN drop and an expired SSO session are the two failures worth
        // naming: both look like a generic navigation error otherwise.
        const hint = /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_|ERR_TIMED_OUT|ERR_INTERNET_DISCONNECTED/.test(message)
            ? 'The page could not be reached. Check the VPN connection and try again.'
            : undefined;
        return res.status(500).json({ error: message, hint, url: redact ? undefined : url });
    }
});

// --- Release the browser (the profile keeps the session on disk) ---
webRouter.post('/close', async (_req: Request, res: Response) => {
    await closeSession();
    return res.json({ ok: true });
});

// --- Recorder ------------------------------------------------------------
//
// Teach a recipe once by browsing bFO normally. The window is deliberately
// visible: PingID needs a human, and the user is the one driving.

/** Panel copy, in Spanish because the person reading it is the user. */
const RECORDER_STRINGS = {
    title: 'Grabando',
    navigate: 'Navegar',
    capture: 'Senalar campo',
    finish: 'Listo',
    pickPrompt: 'Que dato es este?',
    cancel: 'Cancelar',
    steps: '{n} pasos grabados',
    help: 'Navegar: abre Edicion y usa bFO normalmente. Senalar campo: marca el control completo de cada lista, fecha o comentario. Listo: guarda la receta ahora.',
    recipeName: 'Nombre de la receta (opcional)',
    saving: 'Guardando receta...',
    saved: 'Guardada correctamente ({n} pasos). Ya puedes cerrar esta ventana.',
    saveError: 'No se pudo guardar. Revisa que OpportunityOS siga abierto e intenta de nuevo.',
};

webRouter.post('/record/start', async (req: Request, res: Response) => {
    const url = requireAllowedUrl(req, res);
    if (!url) return;
    try {
        const result = await startRecording(url, {
            fields: RECIPE_FIELDS.map(f => ({ key: f.key, label: f.label })),
            strings: RECORDER_STRINGS,
        });
        return res.json({
            ok: true,
            ...result,
            message: 'Se abrio bFO. Pasa PingID, navega como siempre, y usa "Senalar campo" para marcar cada dato.',
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

webRouter.get('/record/steps', (_req: Request, res: Response) => {
    res.json({ ok: true, status: recordingStatus(), steps: getRecordedSteps() });
});

webRouter.post('/record/stop', async (req: Request, res: Response) => {
    const name = param(req, 'name') || 'recipe';
    try {
        const result = await stopRecording(name);
        return res.json({ ok: true, ...result });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});
