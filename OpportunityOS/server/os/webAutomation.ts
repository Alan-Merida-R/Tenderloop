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
import { CHROME_PROFILE_DIR, WEB_PROBES_DIR, WEB_RECIPES_DIR } from '../config';
import { collectSnapshot } from './pageScripts';
import type { PageSnapshot } from './pageScripts';
import { buildSelector, selectorConfidence } from './selectorPolicy';
import type { TargetParts } from './selectorPolicy';
import { installRecorder } from './recorderScript';
import type { RecorderConfig } from './recorderScript';

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
            throw new Error('The Tender Control browser profile is already open in another window. Close it and try again.');
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
        // The page only collects raw attributes; selector policy lives in Node.
        for (const field of snapshot.fields) field.selector = buildSelector(field.target);
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

// --- Recorder -------------------------------------------------------------
//
// Teaching a recipe by watching. The overlay is injected into every document of
// a VISIBLE session (PingID has to be answered by a human), reports each click
// through an exposed binding, and the selector policy is applied here in Node.

export interface RecordedStep {
    index: number;
    kind: 'navigate' | 'click' | 'capture';
    /** Masked: recipes and their logs must not carry record ids around. */
    url: string;
    label: string;
    text?: string;
    field?: string;
    selector?: string;
    confidence?: 'high' | 'medium' | 'low';
    target?: TargetParts;
}

interface RecordingSession {
    startedAt: string;
    steps: RecordedStep[];
    finished: boolean;
}

let recording: RecordingSession | null = null;

export const recordingStatus = () => ({
    active: !!recording && !recording.finished,
    finished: !!recording?.finished,
    steps: recording ? recording.steps.length : 0,
    startedAt: recording?.startedAt ?? null,
});

/** Everything captured so far, with record ids masked out of the URLs. */
export const getRecordedSteps = (): RecordedStep[] => recording ? recording.steps : [];

/**
 * Start a recording session at `url` in a visible window.
 *
 * Visible is not a preference here: the user has to clear PingID by hand, and
 * the whole point is that they drive the browser themselves.
 */
export const startRecording = async (url: string, config: RecorderConfig): Promise<{ url: string }> => {
    // A fresh session must not inherit half-recorded steps from an old one.
    recording = { startedAt: new Date().toISOString(), steps: [], finished: false };

    const ctx = await getContext(false);

    // exposeBinding throws if the name is already taken by an earlier session.
    await ctx.exposeBinding('__oosRecord', (_source: unknown, payload: any) => {
        if (!recording || recording.finished) return;
        if (payload?.kind === 'finish') {
            recording.finished = true;
            return;
        }
        const target = payload?.target as TargetParts | undefined;
        recording.steps.push({
            index: recording.steps.length,
            kind: payload?.kind === 'capture' ? 'capture' : payload?.kind === 'click' ? 'click' : 'navigate',
            url: maskUrl(String(payload?.url || '')),
            label: String(payload?.label || ''),
            text: payload?.text ? String(payload.text) : undefined,
            field: payload?.field ? String(payload.field) : undefined,
            target,
            selector: target ? buildSelector(target) : undefined,
            confidence: target ? selectorConfidence(target) : undefined,
        });
    }).catch((err: any) => {
        // Re-recording in the same browser session is normal; the binding
        // survives from last time and can simply be reused.
        if (!/already registered/i.test(String(err?.message || err))) throw err;
    });

    await ctx.addInitScript({
        content: `(() => { const __name = (f) => f; (${installRecorder.toString()})(${JSON.stringify(config)}); })()`,
    });

    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.bringToFront().catch(() => { });
    return { url: page.url() };
};

/**
 * Close the session and write the recipe to disk.
 *
 * Navigate steps are dropped from the saved recipe: they record where the user
 * happened to be, not an instruction to replay. What matters is the clicks that
 * got them there and the values they pointed at.
 */
export const stopRecording = async (name: string): Promise<{ file: string; steps: number; warnings: string[] }> => {
    if (!recording) throw new Error('No recording is in progress.');
    recording.finished = true;

    const steps = recording.steps
        .filter(step => step.kind !== 'navigate')
        .map(step => {
            // On a click, `text` is the button or tab label — worth keeping, it
            // is what makes a saved recipe readable. On a capture it is the
            // VALUE that was pointed at (a customer address, an amount), which
            // the recipe never needs: replay reads whatever is there at the
            // time. Dropping it keeps customer data out of a file that gets
            // shared while debugging a recipe.
            if (step.kind !== 'capture') return step;
            const { text, ...rest } = step;
            return { ...rest, text: text ? `<${text.length} chars>` : undefined };
        });
    const warnings: string[] = [];

    const weak = steps.filter(step => step.confidence === 'low');
    if (weak.length) {
        warnings.push(`${weak.length} step(s) could only be pinned down by position, so they will break if bFO reorders that part of the page.`);
    }
    if (!steps.some(step => step.kind === 'capture')) {
        warnings.push('Nothing was tagged as a field, so this recipe would navigate but never read anything.');
    }

    if (!existsSync(WEB_RECIPES_DIR)) mkdirSync(WEB_RECIPES_DIR, { recursive: true });
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60) || 'recipe';
    const file = path.join(WEB_RECIPES_DIR, `${safeName}.json`);
    writeFileSync(file, JSON.stringify({
        name: safeName,
        recordedAt: recording.startedAt,
        // The starting URL is never stored: it is injected per opportunity from
        // whatever SR link the expediente already holds.
        startsFrom: '{srUrl}',
        steps,
    }, null, 2), 'utf8');

    return { file, steps: steps.length, warnings };
};
