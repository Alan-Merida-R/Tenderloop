// Reads one opportunity out of bFO, starting from the only URL the app has:
// the Support Request link that came in the SR email.
//
// The chain is walked by NAVIGATING, not by replaying clicks:
//
//   SR  ──> hrefs for Opportunity and Account, plus the SR's own fields
//    │
//    ├──> Opportunity  ──> Amount, Forecast Category, End User Account link
//    │                     (Opportunity Lines URL is computed, never visited)
//    │
//    └──> Account      ──> the address
//
// Going straight to a URL is the sturdiest step there is: it either loaded or
// it did not. Replaying a click path depends on the page looking the same as
// it did on the day it was recorded, which is exactly what Lightning does not
// guarantee.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { WEB_PROBES_DIR } from '../config';
import { readBfoPage } from './bfoReaderScript';
import type { ReadResult } from './bfoReaderScript';

export interface BfoReadout {
    srUrl: string;
    opportunityUrl?: string;
    accountUrl?: string;
    oppLinesUrl?: string;
    clientAddress?: string;
    finalAmount?: string;
    forecastCategory?: string;
    srStatus?: string;
    srComments?: string;
    expectedCompletionDate?: string;
    resolutionComments?: string;
    warnings: string[];
    /** Which page each value came from, so a wrong value is easy to trace. */
    sources: Record<string, string>;
    /** Per-page element counts: what the reader actually saw on each page. */
    diagnostics: Record<string, ReadResult['counts']>;
    /** Folder holding the saved HTML of any page that yielded no fields. */
    savedPages?: string;
}

/** Playwright's evaluate needs the __name shim; see evaluateInPage in webAutomation. */
const readPage = (page: Page): Promise<ReadResult> =>
    page.evaluate(`(() => { const __name = (f) => f; return (${readBfoPage.toString()})(); })()`) as Promise<ReadResult>;

/**
 * Wait until the browser actually lands on Salesforce.
 *
 * SR links arrive by email and are rewritten by Mimecast, so the first URL is a
 * scanner that redirects a moment later. Reading too early means reading an
 * empty interstitial and concluding the fields are missing.
 */
const waitForSalesforce = async (page: Page, timeoutMs = 60000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (/\.force\.com|\.salesforce\.com/i.test(page.url())) return true;
        // Local fixtures stand in for bFO in the regression test; never enabled
        // in normal use, where only a real Salesforce host counts as arrival.
        if (process.env.OOS_READER_ALLOW_LOCAL === '1' && /^(file:|http:\/\/127\.0\.0\.1)/.test(page.url())) return true;
        await page.waitForTimeout(500);
    }
    return false;
};

/**
 * Wait until the record's fields are actually on the page.
 *
 * A fixed timer is a guess, and it guesses wrong in both directions: Lightning
 * often needs more than three seconds to paint a record body, and the first run
 * against real bFO came back with every value empty while the links (which
 * render much earlier) were all correct. Polling for the field wrappers instead
 * ties the wait to the thing we actually need.
 */
const settle = async (page: Page, settleMs: number, timeoutMs = 20000) => {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ready = await page.evaluate(
            `document.querySelectorAll('[data-target-selection-name], .slds-form-element, .forceOutputAddressText').length`
        ).catch(() => 0);
        if (Number(ready) > 0) break;
        await page.waitForTimeout(500);
    }
    // Even once the wrappers exist, their values stream in a beat later.
    await page.waitForTimeout(settleMs);
};

/**
 * Save a page that produced nothing, so the next failure can be diagnosed from
 * the real DOM instead of another round trip to the work computer.
 */
const savePageForDiagnosis = async (page: Page, label: string, dir: string) => {
    try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, `${label}.html`), await page.content(), 'utf8');
        await page.screenshot({ path: path.join(dir, `${label}.png`), fullPage: true }).catch(() => { });
    } catch { /* diagnosis is best-effort; never fail the read over it */ }
};

/** Find a value by the tail of its API name, e.g. "Amount" or "ForecastCategoryName". */
const byApi = (read: ReadResult, ...suffixes: string[]): string | undefined => {
    for (const suffix of suffixes) {
        for (const key of Object.keys(read.byApiName)) {
            if (key.toLowerCase().endsWith(suffix.toLowerCase())) return read.byApiName[key];
        }
    }
    return undefined;
};

/** Fall back to the visible label when the API name is not exposed. */
const byLabel = (read: ReadResult, ...labels: string[]): string | undefined => {
    for (const label of labels) {
        for (const key of Object.keys(read.byLabel)) {
            if (key.toLowerCase() === label.toLowerCase()) return read.byLabel[key];
        }
    }
    return undefined;
};

const absolute = (href: string, base: string): string => {
    try { return new URL(href, base).href; } catch { return href; }
};

/**
 * Walk SR -> Opportunity -> Account and collect everything in one pass.
 * Read-only: nothing here clicks a pencil or saves anything.
 */
export const readOpportunityFromSr = async (page: Page, srUrl: string, settleMs = 3000): Promise<BfoReadout> => {
    const warnings: string[] = [];
    const sources: Record<string, string> = {};
    const diagnostics: Record<string, ReadResult['counts']> = {};
    const out: BfoReadout = { srUrl, warnings, sources, diagnostics };
    const diagDir = path.join(WEB_PROBES_DIR, 'read-' + new Date().toISOString().replace(/[:.]/g, '-'));
    let savedAnything = false;

    /** Record what a page yielded, and keep its HTML when it yielded nothing. */
    const account = async (label: string, read: ReadResult) => {
        diagnostics[label] = read.counts;
        // An Account page renders its address without any form wrappers, so
        // "no fields" only means trouble when nothing at all came through.
        if (read.counts.apiHolders === 0 && read.counts.formGroups === 0 && read.counts.addressEls === 0) {
            warnings.push(`No fields rendered on the ${label} page (saw ${read.counts.anchors} links, ${read.counts.shadowRoots} shadow roots, ${read.counts.iframes} iframes). Its HTML was saved for diagnosis.`);
            await savePageForDiagnosis(page, label, diagDir);
            savedAnything = true;
            out.savedPages = diagDir;
        }
    };

    // --- 1. The Support Request -------------------------------------------
    await page.goto(srUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!await waitForSalesforce(page)) {
        warnings.push('The link never reached Salesforce after 60s (it may still be sitting on a Mimecast/Safe-Links redirect, or the wrapper failed to resolve). Open the original SR email and paste the direct salesforce.com/force.com link instead.');
        return out;
    }
    await settle(page, settleMs);

    const sr = await readPage(page);
    await account('sr', sr);
    if (sr.looksLikeLogin) {
        warnings.push('bFO asked to sign in. Open the login window, clear PingID, and run this again.');
        return out;
    }

    out.srStatus = byApi(sr, 'Status__c') ?? byLabel(sr, 'Status');
    out.srComments = byApi(sr, 'Comments__c') ?? byLabel(sr, 'Comments');
    out.expectedCompletionDate = byLabel(sr, 'Expected Completion Date');
    out.resolutionComments = byLabel(sr, 'Resolution Comments');
    for (const key of ['srStatus', 'srComments', 'expectedCompletionDate', 'resolutionComments']) sources[key] = 'SR';

    if (sr.links.Opportunity) out.opportunityUrl = absolute(sr.links.Opportunity, page.url());
    if (sr.links.Account) out.accountUrl = absolute(sr.links.Account, page.url());
    sources.opportunityUrl = 'SR (href)';

    if (!out.opportunityUrl) {
        warnings.push('No Opportunity link was found on the SR, so the Opportunity and Account values were skipped.');
        return out;
    }

    // --- 2. The Opportunity ------------------------------------------------
    await page.goto(out.opportunityUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, settleMs);
    const opp = await readPage(page);
    await account('opportunity', opp);

    out.finalAmount = byApi(opp, 'Opportunity.Amount', '.Amount') ?? byLabel(opp, 'Amount');
    out.forecastCategory = byApi(opp, 'ForecastCategoryName', 'ForecastCategory') ?? byLabel(opp, 'Forecast Category');
    sources.finalAmount = 'Opportunity';
    sources.forecastCategory = 'Opportunity';

    // Computed, never visited: the related list lives at a fixed path.
    out.oppLinesUrl = out.opportunityUrl.replace(/\/view\/?$/, '') + '/related/Product_Line_2__r/view';
    sources.oppLinesUrl = 'computed from the Opportunity URL';

    // The Opportunity's End User Account is the authoritative one for the
    // address; the SR's Account link is only a fallback.
    if (opp.links.Account) {
        out.accountUrl = absolute(opp.links.Account, page.url());
        sources.accountUrl = 'Opportunity (End User Account)';
    } else if (out.accountUrl) {
        sources.accountUrl = 'SR (fallback)';
        warnings.push('No Account link on the Opportunity; used the one from the SR instead.');
    }

    if (!out.accountUrl) {
        warnings.push('No Account link was found, so the client address was skipped.');
        return out;
    }

    // --- 3. The Account ----------------------------------------------------
    await page.goto(out.accountUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, settleMs);
    const acct = await readPage(page);
    await account('account', acct);

    if (acct.addressLines.length) {
        out.clientAddress = acct.addressLines.join(', ');
        sources.clientAddress = 'Account (address component)';
    } else {
        out.clientAddress = byLabel(acct, 'Address', 'Billing Address', 'Shipping Address');
        sources.clientAddress = 'Account (label)';
        if (!out.clientAddress) {
            warnings.push(`The address was not found on the Account page (saw ${acct.counts.addressEls} address elements and ${acct.counts.apiHolders} fields).`);
            if (!savedAnything) await savePageForDiagnosis(page, 'account', diagDir);
            out.savedPages = diagDir;
        }
    }

    return out;
};
