// Web automation endpoints (/api/web/*).
//
// Phase 1 is reconnaissance: sign in once in a visible window, then probe a
// page to see exactly which fields and network payloads are extractable. The
// probe writes its artifacts (HTML, text, screenshot, JSON responses) to
// %APPDATA%\OpportunityOS\web-probes so they can be inspected offline.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isWebUrlAllowed, WEB_ALLOWED_HOSTS } from '../config';
import { openLoginWindow, probeUrl, redactProbe, sessionStatus, closeSession } from '../os/webAutomation';

export const webRouter = Router();

/** Validate the caller-supplied URL, or write the 4xx and return null. */
const requireAllowedUrl = (req: Request, res: Response): string | null => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
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
