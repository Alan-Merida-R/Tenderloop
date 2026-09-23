import path from 'node:path';

/**
 * TenderLoop backend configuration.
 * Port 3099 is inherited from the legacy openHelper so the existing
 * CERRAR/DESINSTALAR scripts and any in-flight frontend keep working.
 */
export const PORT = Number(process.env.TENDERLOOP_OPEN_PORT) || 3099;
export const HOST = '127.0.0.1';

/**
 * Local data directory for server-side state (recents, DB backups).
 * %APPDATA%\TenderLoop on Windows; falls back to the user home elsewhere.
 */
export const DATA_DIR = path.join(
    process.env.APPDATA || process.env.HOME || process.cwd(),
    'OpportunityOS'
);

export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const DEFAULT_DB_PATH = path.join(DATA_DIR, 'tendering_db.json');

/**
 * OS-integration routes (/api/os/*) act on the local machine (open files,
 * clipboard, Explorer). A future hosted deployment disables them wholesale.
 */
export const ENABLE_OS_INTEGRATION = process.env.TENDERLOOP_DISABLE_OS !== '1';

// --- Web automation (/api/web/*) ------------------------------------------

/** Same kill switch shape as the OS routes: opt-out via env for hosted runs. */
export const ENABLE_WEB_AUTOMATION = process.env.OPPORTUNITYOS_DISABLE_WEB !== '1';

/**
 * Dedicated Chrome profile for automation. Keeping it out of the user's normal
 * profile matters twice over: Chrome refuses remote control of the default
 * profile, and a corporate session captured here can never leak into (or be
 * clobbered by) day-to-day browsing.
 */
export const CHROME_PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');

/** Probe artifacts (HTML / screenshots / captured JSON responses). */
export const WEB_PROBES_DIR = path.join(DATA_DIR, 'web-probes');

/**
 * Host allow-list. The browser engine can log in as the user, so an endpoint
 * that accepted any URL would turn the local helper into a confused deputy:
 * anything able to reach port 3099 could drive an authenticated corporate
 * session. Only these hosts (and their subdomains) are ever navigated to.
 * Extend with OPPORTUNITYOS_WEB_HOSTS="host1,host2" — no code change needed.
 */
const DEFAULT_WEB_HOSTS = [
    'salesforce.com',
    'force.com',
    'se.com',
    'schneider-electric.com',
];

export const WEB_ALLOWED_HOSTS = [
    ...DEFAULT_WEB_HOSTS,
    ...(process.env.OPPORTUNITYOS_WEB_HOSTS || '')
        .split(',')
        .map(h => h.trim().toLowerCase())
        .filter(Boolean),
];

/**
 * Link-rewriting gateways that may only be a STARTING point.
 *
 * SR links arrive by email already rewritten by the mail scanner, so the URL
 * the user pastes is a gateway that redirects to Salesforce a moment later.
 * These hosts are deliberately NOT in WEB_ALLOWED_HOSTS: a rewritten link can
 * point anywhere, so landing on one proves nothing. The reader still refuses to
 * read a page until the browser has actually arrived on an allow-listed
 * Salesforce host, which is what keeps the gateway from widening the door.
 */
const ENTRY_GATEWAY_HOSTS = [
    'mimecastprotect.com',
    'protect-eu.mimecast.com',
    'protect-us.mimecast.com',
    'safelinks.protection.outlook.com',
];

/** True when the host is a mail-scanner gateway we accept as an entry point. */
export const isWebEntryGateway = (url: string): boolean => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return false; }
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return ENTRY_GATEWAY_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
};

/**
 * True when the URL's host is allow-listed AND the scheme is safe.
 * Subdomains match ("bfo.salesforce.com"); look-alike suffixes do not
 * ("notsalesforce.com"). Loopback is NOT allow-listed by default — it has to be
 * opted into via OPPORTUNITYOS_WEB_HOSTS like any other host, so this endpoint
 * cannot be pointed at arbitrary local services.
 */
export const isWebUrlAllowed = (url: string): boolean => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return false; }

    const host = parsed.hostname.toLowerCase();
    const hostAllowed = WEB_ALLOWED_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
    if (!hostAllowed) return false;

    // Plain http is tolerated only on loopback, where traffic never leaves the
    // machine; everything reachable over the network must be https.
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopback);
};
