// Browser automation engine.
//
// Drives the Chrome ALREADY installed on the machine (no browser download)
// against a dedicated OpportunityOS profile under %APPDATA%. That profile is
// what makes corporate SSO practical: the user signs in once by hand in a
// visible window, the session cookies stay inside the profile, and later runs
// reuse them. OpportunityOS never sees, stores or types a credential.
//
// Phase 1 exposes reconnaissance only (open a login window, probe a page).
// Filling and submitting forms build on the same session in a later phase.

import { chromium } from 'playwright-core';
import type { BrowserContext, Page, Response } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHROME_PROFILE_DIR, WEB_PROBES_DIR } from '../config';
import { collectSnapshot } from './pageScripts';
import type { PageSnapshot } from './pageScripts';

/** Same search order as _open_browser.bat, so both pick the same Chrome. */
const chromeCandidates = (): string[] => [
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    // Edge is Chromium too and ships with Windows — a usable last resort.
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];

export const findBrowserExecutable = (): string | null =>
    chromeCandidates().find(candidate => candidate && existsSync(candidate)) || null;

// --- Session -------------------------------------------------------------

let context: BrowserContext | null = null;
let contextHeadless: boolean | null = null;
// A Chrome profile directory can only be opened by one process at a time, so
// concurrent requests must share one launch instead of racing into a lock error.
let launching: Promise<BrowserContext> | null = null;

const launchContext = async (headless: boolean): Promise<BrowserContext> => {
    const executablePath = findBrowserExecutable();
    if (!executablePath) {
        throw new Error('Google Chrome was not found on this machine. Install Chrome, or set an executable path in the web automation settings.');
    }
    if (!existsSync(CHROME_PROFILE_DIR)) mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

    try {
        return await chromium.launchPersistentContext(CHROME_PROFILE_DIR, {
            executablePath,
            headless,
            viewport: headless ? { width: 1440, height: 900 } : null,
            acceptDownloads: true,
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                // Same reason as the app window in _open_browser.bat: Windows
                // occlusion checks can freeze a covered Chromium window.
                '--disable-features=CalculateNativeWinOcclusion',
            ],
        });
    } catch (err: any) {
        const message = String(err?.message || err);
        if (/ProcessSingleton|profile appears to be in use|SingletonLock/i.test(message)) {
            throw new Error('The OpportunityOS browser profile is already open in another window. Close it and try again.');
        }
        throw err;
    }
};

/**
 * Get the shared context, launching it if needed. Switching between headless
 * and visible needs a relaunch — one profile cannot back two Chrome processes.
 */
const getContext = async (headless: boolean): Promise<BrowserContext> => {
    if (launching) await launching.catch(() => { });
    if (context && contextHeadless !== headless) await closeSession();
    if (context) return context;

    launching = launchContext(headless);
    try {
        context = await launching;
        contextHeadless = headless;
        // A crash or a user closing the last window must not leave a stale handle.
        context.on('close', () => { context = null; contextHeadless = null; });
        return context;
    } finally {
        launching = null;
    }
};

export const closeSession = async (): Promise<void> => {
    const open = context;
    context = null;
    contextHeadless = null;
    if (open) await open.close().catch(() => { });
};

export const sessionStatus = () => ({
    open: !!context,
    headless: contextHeadless,
    profileDir: CHROME_PROFILE_DIR,
    browserPath: findBrowserExecutable(),
    pages: context ? context.pages().length : 0,
});

// --- Login ---------------------------------------------------------------

/**
 * Open `url` in a VISIBLE window and return immediately, leaving it open so the
 * user can complete SSO/MFA by hand. Whatever session that produces lives in
 * the profile and is what later headless probes ride on.
 */
export const openLoginWindow = async (url: string): Promise<{ url: string }> => {
    const ctx = await getContext(false);
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.bringToFront().catch(() => { });
    return { url: page.url() };
};

// --- Probe ---------------------------------------------------------------

export interface CapturedResponse {
    url: string;
    status: number;
    contentType: string;
    bytes: number;
    /** Artifact filename holding the full body, when one was saved. */
    file?: string;
    preview: string;
    /** JSON key paths — the payload's schema, safe to share. */
    keys?: string[];
}

export interface ProbeResult {
    ok: true;
    requestedUrl: string;
    finalUrl: string;
    title: string;
    looksLikeLogin: boolean;
    frames: number;
    fields: PageSnapshot['fields'];
    values: PageSnapshot['values'];
    textPreview: string;
    responses: CapturedResponse[];
    artifactsDir: string;
    files: { html: string; text: string; screenshot: string; snapshot: string };
    warnings: string[];
    /** True when values were stripped and only the structure is present. */
    redacted?: boolean;
}

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');

/**
 * Run a page script in the browser.
 *
 * Playwright normally takes the function itself, but tsx/esbuild compiles this
 * file with `keepNames`, which rewrites nested helpers as `__name(fn, "fn")`.
 * That helper only exists in the Node module scope, so the serialized source
 * throws `__name is not defined` inside the page. Evaluating an expression that
 * declares a local no-op `__name` restores it without touching page globals.
 */
const evaluateInPage = <T>(page: Page, fn: () => T): Promise<T> =>
    page.evaluate(`(() => { const __name = (f) => f; return (${fn.toString()})(); })()`) as Promise<T>;

/** Assets are noise; JSON/XHR payloads are the stable data source worth keeping. */
const isInterestingResponse = (res: Response): boolean => {
    const type = (res.headers()['content-type'] || '').toLowerCase();
    if (!/json|xml/.test(type)) return false;
    return !/\.(png|jpe?g|gif|svg|woff2?|css|js)(\?|$)/i.test(res.url());
};

// --- Redaction -----------------------------------------------------------
//
// A probe of a real record contains customer data and internal URLs. Writing
// that to disk on the user's own machine is fine; putting it in a payload that
// gets pasted into a chat, a ticket or a commit is not. Redacted mode keeps
// everything that describes STRUCTURE (labels, selectors, types, JSON key
// paths, URL shape) and drops everything that is CONTENT.

/** Describe a value's shape instead of revealing it. */
const describeValue = (value: string): string => {
    const v = value.trim();
    if (!v) return '';
    if (/^[\w.+-]+@[\w.-]+$/.test(v)) return '<email>';
    if (/^https?:\/\//i.test(v)) return '<url>';
    if (/^[-+]?[\d.,\s$€%]+$/.test(v)) return '<number>';
    if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(v)) return '<date>';
    return `<text ${v.length} chars>`;
};

/**
 * Keep a URL's shape, drop its identifiers: path segments that look like IDs
 * (Salesforce 15/18-char keys, numbers, GUIDs) become {id}, query values are
 * replaced by their key names. Enough to write a recipe, useless to an
 * onlooker.
 */
const maskUrl = (raw: string): string => {
    let parsed: URL;
    try { parsed = new URL(raw); } catch { return '<invalid url>'; }
    const segments = parsed.pathname.split('/').map(seg => {
        if (!seg) return seg;
        if (/^[0-9]+$/.test(seg)) return '{id}';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return '{guid}';
        // Opaque token: long, alphanumeric, contains a digit. Pinning this to
        // Salesforce's exact 15/18 chars let anything else through, so err
        // toward over-masking — real path words ("Opportunity", "view") have
        // no digits and survive.
        if (seg.length >= 10 && /^[a-zA-Z0-9]+$/.test(seg) && /\d/.test(seg)) return '{id}';
        return seg;
    });
    const keys = [...parsed.searchParams.keys()];
    const query = keys.length ? `?${keys.map(k => `${k}={value}`).join('&')}` : '';
    return `${parsed.origin}${segments.join('/')}${query}`;
};

/** Collect key paths from a JSON payload — the schema, never the values. */
const jsonKeyPaths = (text: string, limit = 60): string[] => {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return []; }
    const paths = new Set<string>();
    const walk = (node: unknown, trail: string) => {
        if (paths.size >= limit || node === null || typeof node !== 'object') return;
        if (Array.isArray(node)) return walk(node[0], `${trail}[]`);
        for (const [key, value] of Object.entries(node)) {
            if (paths.size >= limit) return;
            const next = trail ? `${trail}.${key}` : key;
            paths.add(next);
            walk(value, next);
        }
    };
    walk(parsed, '');
    return [...paths];
};

/** Strip every piece of content from a probe, keeping only its structure. */
export const redactProbe = (result: ProbeResult): ProbeResult => ({
    ...result,
    requestedUrl: maskUrl(result.requestedUrl),
    finalUrl: maskUrl(result.finalUrl),
    title: `<text ${result.title.length} chars>`,
    fields: result.fields.map(field => ({
        ...field,
        value: describeValue(field.value),
        options: field.options ? [`<${field.options.length} options>`] : undefined,
    })),
    values: result.values.map(pair => ({ ...pair, value: describeValue(pair.value) })),
    textPreview: `<page text: ${result.textPreview.length}+ chars, kept on disk only>`,
    responses: result.responses.map(res => ({
        ...res,
        url: maskUrl(res.url),
        preview: res.keys?.length ? `keys: ${res.keys.join(', ')}` : '<body kept on disk only>',
    })),
    redacted: true,
});

export const probeUrl = async (
    url: string,
    opts: { headless?: boolean; waitMs?: number } = {}
): Promise<ProbeResult> => {
    const headless = opts.headless !== false;
    const settleMs = Math.min(Math.max(opts.waitMs ?? 3000, 0), 60000);
    const warnings: string[] = [];

    const ctx = await getContext(headless);
    const page: Page = await ctx.newPage();

    const responses: CapturedResponse[] = [];
    const artifactsDir = path.join(WEB_PROBES_DIR, stamp());
    mkdirSync(artifactsDir, { recursive: true });

    page.on('response', res => {
        // Cap the capture: one Lightning page can fire hundreds of XHRs.
        if (responses.length >= 40 || !isInterestingResponse(res)) return;
        const index = responses.length;
        const entry: CapturedResponse = {
            url: res.url(),
            status: res.status(),
            contentType: res.headers()['content-type'] || '',
            bytes: 0,
            preview: '',
        };
        responses.push(entry);
        // Bodies resolve asynchronously; fill the entry in place when ready.
        res.body().then(buf => {
            entry.bytes = buf.length;
            const text = buf.toString('utf8');
            entry.preview = text.slice(0, 2000);
            entry.keys = jsonKeyPaths(text);
            if (buf.length <= 4 * 1024 * 1024) {
                const file = `response-${String(index).padStart(2, '0')}.json`;
                writeFileSync(path.join(artifactsDir, file), text, 'utf8');
                entry.file = file;
            }
        }).catch(() => { /* body already discarded (redirect, aborted) */ });
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // networkidle never settles on apps that long-poll — treat it as a hint.
        await page.waitForLoadState('networkidle', { timeout: 15000 })
            .catch(() => warnings.push('The page kept making network requests; captured it after the timeout.'));
        if (settleMs) await page.waitForTimeout(settleMs);

        const snapshot = await evaluateInPage<PageSnapshot>(page, collectSnapshot);
        const html = await page.content();
        const files = {
            html: 'page.html',
            text: 'page.txt',
            screenshot: 'page.png',
            snapshot: 'snapshot.json',
        };
        writeFileSync(path.join(artifactsDir, files.html), html, 'utf8');
        writeFileSync(path.join(artifactsDir, files.text), snapshot.text, 'utf8');
        writeFileSync(path.join(artifactsDir, files.snapshot), JSON.stringify(snapshot, null, 2), 'utf8');
        await page.screenshot({ path: path.join(artifactsDir, files.screenshot), fullPage: true }).catch(() => {
            warnings.push('The screenshot could not be captured.');
        });

        if (snapshot.looksLikeLogin) {
            warnings.push('This looks like a sign-in page. Run the login step in a visible window first, then probe again.');
        }
        if (snapshot.frames > 0) {
            warnings.push(`The page contains ${snapshot.frames} iframe(s); this probe only inspected the main frame.`);
        }

        // Give in-flight response bodies a moment to land before reporting.
        await page.waitForTimeout(500);

        return {
            ok: true,
            requestedUrl: url,
            finalUrl: page.url(),
            title: snapshot.title,
            looksLikeLogin: snapshot.looksLikeLogin,
            frames: snapshot.frames,
            fields: snapshot.fields,
            values: snapshot.values,
            textPreview: snapshot.text.slice(0, 4000),
            responses,
            artifactsDir,
            files,
            warnings,
        };
    } finally {
        // Keep the context (and its session) alive; only drop this page.
        await page.close().catch(() => { });
    }
};
