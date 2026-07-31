// Parser for Schneider bFO "Support Request" notification emails.
// Deterministic (regex-based, no AI): the email body is a fixed template of
// `Field Name: value` lines separated by ==== / ---- dividers, with `Comments`
// being the only free multiline field. Works with text pasted from Outlook
// (new or classic) and with plain text extracted from .eml / .msg files.

export interface ParsedSrEmail {
    srId?: string;              // "SR-4343702"
    srStatus?: string;          // "Accepted - In Progress"
    statusChangedBy?: string;   // "Edward ROSAS"
    requestedDate?: string;     // ISO "YYYY-MM-DD"
    expectedDate?: string;      // ISO "YYYY-MM-DD"
    comments?: string;
    createdBy?: string;
    ownerEmail?: string;
    typeOfOffer?: string;       // "Bid to Buy" | "Bid to Bid" | "Non Binding Budgetary" ...
    assignedTo?: string;
    oppName?: string;
    seReference?: string;       // "OP-260128-16340497"
    closeDate?: string;         // ISO
    amount?: number;
    country?: string;
    priorityLevel?: string;
    leader?: string;
    quoteSubmissionDate?: string;
    account?: string;
    accountId?: string;
    accountCountry?: string;
    endUser?: string;
    srLink?: string;
    boxLink?: string;
}

/** Fields ready to merge into an existing Opportunity (expediente auto-fill). */
export interface SrPrefill {
    opId?: string;
    title?: string;
    alias?: string;
    customer?: string;
    seller?: string;
    srId?: string;
    quoteType?: 'Firm' | 'Budgetary';
    requestedDate?: string;
    expectedDate?: string;
    proposalAmountUSD?: number;
    srLink?: string;
    /** SR "Comments" free text — lands in Overview → Description of the Request. */
    comments?: string;
    noteTitle: string;
    noteHtml: string;
}

const MONTHS: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

/** Resolve a month name (full or 3+ letter abbreviation, e.g. "Jul"/"Sept") to "MM". */
const monthFromName = (name: string): string | undefined => {
    const key = name.toLowerCase().replace(/\.$/, '');
    if (MONTHS[key]) return MONTHS[key];
    if (key.length >= 3) {
        const full = Object.keys(MONTHS).find(m => m.startsWith(key));
        if (full) return MONTHS[full];
    }
    return undefined;
};

/**
 * Tolerant date parser for the formats bFO/Outlook emit:
 * "July 1, 2026" · "Jul 1, 2026" · "1 July 2026" · "01-Jul-2026" ·
 * "07/01/2026" · "2026-07-01"  ->  "2026-07-01" ('' if unparseable).
 */
export const parseUsDate = (raw: string | undefined): string => {
    if (!raw) return '';
    const value = raw.trim();
    if (!value) return '';

    // "July 1, 2026" / "Jul 1 2026"
    const monthFirst = value.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (monthFirst) {
        const month = monthFromName(monthFirst[1]);
        if (month) return `${monthFirst[3]}-${month}-${monthFirst[2].padStart(2, '0')}`;
    }
    // "1 July 2026" / "01-Jul-2026" / "1. July 2026"
    const dayFirst = value.match(/(\d{1,2})[.\s-]+([A-Za-z]{3,})\.?[.\s-]+(\d{4})/);
    if (dayFirst) {
        const month = monthFromName(dayFirst[2]);
        if (month) return `${dayFirst[3]}-${month}-${dayFirst[1].padStart(2, '0')}`;
    }
    // "07/01/2026" (US order, as bFO sends)
    const slash = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
    const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
    return '';
};

const decodeEntities = (text: string): string => text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');

/**
 * Extracts the real target from a URL, unwrapping Mimecast protection links
 * (https://url...mimecastprotect.com/s/TOKEN?domain=real.host) is kept as-is —
 * it redirects fine — but markdown `[text](url "title")` wrappers are removed.
 */
const extractUrl = (value: string | undefined): string => {
    if (!value) return '';
    // Markdown link from new Outlook copy: [SRLink](https://... "https://...")
    const md = value.match(/\((https?:\/\/[^\s)"]+)/);
    if (md) return md[1];
    const raw = value.match(/https?:\/\/[^\s<>")\]]+/);
    return raw ? raw[0] : '';
};

const normalize = (raw: string): string => decodeEntities(raw)
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')
    .replace(/\*\*/g, '')            // bold markers from markdown-ish copies
    .replace(/^\[External email:.*$/gim, '');

/** A line that starts a new `Some Label:` field (used to avoid stealing the next field's label as a value). */
const LOOKS_LIKE_LABEL = /^[A-Za-z][A-Za-z /()-]{2,60}:/;

/**
 * Grab the value of a `Label: value` field (first occurrence). If the value is
 * empty on the label's own line (common with .msg RTF bodies, where the line
 * break lands right after the colon), falls back to the next non-empty line —
 * unless that line looks like another field label.
 */
const grab = (text: string, label: string, allowNextLine = true): string | undefined => {
    const pattern = new RegExp('^[ \\t]*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*:[ \\t]*(.*)$', 'im');
    const match = text.match(pattern);
    if (!match || match.index === undefined) return undefined;
    const value = match[1].trim();
    if (value) return value;
    if (!allowNextLine) return undefined;

    const rest = text.slice(match.index + match[0].length);
    const nextLine = rest.split('\n').map(l => l.trim()).find(l => l);
    if (nextLine && !LOOKS_LIKE_LABEL.test(nextLine) && !/^[=-]{5,}$/.test(nextLine)) return nextLine;
    return undefined;
};

/**
 * Extract the first URL appearing after `Label:`, scanning forward until the
 * earliest of the given stop patterns (next field label, boilerplate, divider).
 * Handles URLs hidden behind anchor text that end up on a following line.
 */
const grabUrlAfter = (text: string, label: string, stopPatterns: RegExp[]): string => {
    const pattern = new RegExp('^[ \\t]*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*:', 'im');
    const match = text.match(pattern);
    if (!match || match.index === undefined) return '';
    const window = text.slice(match.index + match[0].length);
    let end = window.length;
    for (const stop of stopPatterns) {
        const sm = window.match(stop);
        if (sm && sm.index !== undefined && sm.index < end) end = sm.index;
    }
    return extractUrl(window.slice(0, end));
};

export const parseSrEmail = (raw: string): ParsedSrEmail => {
    const text = normalize(raw);
    const result: ParsedSrEmail = {};

    const srMatch = text.match(/Support Request\s+(SR-\d+)/i) || text.match(/\b(SR-\d{5,})\b/);
    if (srMatch) result.srId = srMatch[1].toUpperCase();

    const changed = text.match(/has been changed to\s+'([^']+)'\s+by\s+([^.\n]+)/i);
    if (changed) {
        result.srStatus = changed[1].trim();
        result.statusChangedBy = changed[2].trim();
    }
    result.srStatus = grab(text, 'Support Request Status') || result.srStatus;

    result.requestedDate = parseUsDate(grab(text, 'Support Requested By')) || undefined;
    result.expectedDate = parseUsDate(grab(text, 'Expected Completed Date')) || undefined;

    // Comments is the only free multiline field: capture until the next known label.
    const comments = text.match(/Comments:\s*([\s\S]*?)\n\s*Support Request Created By\s*:/i);
    if (comments) result.comments = comments[1].trim() || undefined;

    result.createdBy = grab(text, 'Support Request Created By');
    // "Owner Email ID" and "Owner Email" are the same field across template versions.
    result.ownerEmail = grab(text, 'Owner Email ID') || grab(text, 'Owner Email');
    result.typeOfOffer = grab(text, 'Type of Offer');
    result.assignedTo = grab(text, 'The Support Request has been assigned to');

    result.oppName = grab(text, 'Opportunity Name');
    result.seReference = grab(text, 'Opportunity SE Reference');
    result.closeDate = parseUsDate(grab(text, 'Opportunity Close Date')) || undefined;

    const amountRaw = grab(text, 'Opportunity Amount');
    if (amountRaw) {
        const amount = parseFloat(amountRaw.replace(/[^0-9.]/g, ''));
        if (!isNaN(amount)) result.amount = amount;
    }

    result.country = grab(text, 'Country of Destination');
    result.priorityLevel = grab(text, 'Opportunity Priority Level');
    result.leader = grab(text, 'Opportunity Leader');
    const quoteDate = parseUsDate(grab(text, 'Opportunity Quote Submission Date'));
    if (quoteDate) result.quoteSubmissionDate = quoteDate;

    result.account = grab(text, 'Account');
    result.accountId = grab(text, 'SE Account ID');
    result.accountCountry = grab(text, 'Account Country');
    result.endUser = grab(text, 'End user');

    // Links: the URL often sits behind anchor text ("SRLink") and may land on
    // the line after the label, so search a window from the label up to the
    // next known section — never into the "Please click ... bFO Mobile"
    // boilerplate, whose URL must not be mistaken for a field value.
    result.srLink = grabUrlAfter(text, 'Link to the support request', [
        /^[ \t]*Link to the BOX Documentation[ \t]*:/im,
        /Please click on the following link/i,
        /^={5,}/m
    ]) || undefined;
    result.boxLink = grabUrlAfter(text, 'Link to the BOX Documentation', [
        /Please click on the following link/i,
        /^={5,}/m
    ]) || undefined;

    return result;
};

/** True when the text yielded enough signal to be a real bFO SR email. */
export const isSrEmail = (parsed: ParsedSrEmail): boolean =>
    !!(parsed.srId || parsed.oppName || parsed.seReference);

const escapeHtml = (text: string): string => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const mapQuoteType = (typeOfOffer: string | undefined): 'Firm' | 'Budgetary' | undefined => {
    if (!typeOfOffer) return undefined;
    if (/budgetary/i.test(typeOfOffer)) return 'Budgetary';
    if (/bid to/i.test(typeOfOffer)) return 'Firm';
    return undefined;
};

/** Short code like "SCOUT5656" from "SCOUT5656 - Xcel Energy Plant X Upgrade - ...". */
const extractAlias = (oppName: string | undefined): string | undefined => {
    if (!oppName) return undefined;
    const first = oppName.split(' - ')[0].trim();
    if (first && first.length <= 24 && first !== oppName) return first;
    return undefined;
};

/**
 * bFO may provide the SE reference with or without its `OP-` prefix.  Keep a
 * single canonical form throughout the expediente and email-derived fields.
 */
export const normalizeOpportunityId = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;

    const prefixed = trimmed.match(/\b(OP-\d+(?:-\d+)+)\b/i);
    if (prefixed) return prefixed[1].toUpperCase();

    // Some bFO email variants omit only the OP prefix from the SE reference.
    if (/^\d+(?:-\d+)+$/.test(trimmed)) return `OP-${trimmed}`;

    return trimmed;
};

export const buildSrPrefill = (parsed: ParsedSrEmail): SrPrefill => {
    const opId = normalizeOpportunityId(parsed.seReference);
    const noteRows: [string, string | undefined][] = [
        ['SR Status', parsed.srStatus],
        ['Status Changed By', parsed.statusChangedBy],
        ['Type of Offer', parsed.typeOfOffer],
        ['Assigned To', parsed.assignedTo],
        ['Created By', parsed.createdBy],
        ['Owner Email', parsed.ownerEmail],
        ['Opportunity SE Reference', parsed.seReference],
        ['Opportunity Close Date', parsed.closeDate],
        ['Opportunity Amount', parsed.amount !== undefined ? parsed.amount.toLocaleString('en-US') : undefined],
        ['Country of Destination', parsed.country],
        ['Priority Level', parsed.priorityLevel],
        ['Quote Submission Date', parsed.quoteSubmissionDate],
        ['Account', parsed.account],
        ['SE Account ID', parsed.accountId],
        ['Account Country', parsed.accountCountry],
        ['End User', parsed.endUser],
        ['BOX Documentation', parsed.boxLink],
    ];

    const rowsHtml = noteRows
        .filter(([, value]) => value)
        .map(([label, value]) => `<tr><td style="padding:2px 10px 2px 0"><b>${label}</b></td><td>${escapeHtml(value!)}</td></tr>`)
        .join('');

    const commentsHtml = parsed.comments
        ? `<h3>Comments</h3><p>${escapeHtml(parsed.comments).replace(/\n/g, '<br/>')}</p>`
        : '';

    const noteHtml = `<h2>SR Email Import ${parsed.srId ? `— ${parsed.srId}` : ''}</h2>`
        + `<p><i>Imported ${new Date().toLocaleString()}</i></p>`
        + (rowsHtml ? `<table>${rowsHtml}</table>` : '')
        + commentsHtml;

    return {
        // Title = "OP-xxxxxx-xxxxxxxx - Opportunity Name" (SE Reference prefix)
        opId,
        title: [opId, parsed.oppName].filter(Boolean).join(' - ') || undefined,
        alias: extractAlias(parsed.oppName),
        customer: parsed.account || parsed.endUser,
        seller: parsed.leader,
        srId: parsed.srId,
        quoteType: mapQuoteType(parsed.typeOfOffer),
        requestedDate: undefined,
        expectedDate: parsed.expectedDate,
        proposalAmountUSD: parsed.amount,
        srLink: parsed.srLink,
        comments: parsed.comments,
        noteTitle: `SR Import${parsed.srId ? ` — ${parsed.srId}` : ''}`,
        noteHtml
    };
};
