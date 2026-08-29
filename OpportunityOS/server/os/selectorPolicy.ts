// How a DOM element becomes a selector a recipe can replay.
//
// This lives in Node, not in the page, so there is exactly ONE implementation:
// the probe and the recorder both collect raw `TargetParts` in the browser and
// hand them here to be turned into a selector string. Keeping the policy in one
// testable place matters because the failure mode is silent — a selector that
// looks fine today and matches nothing after the next Lightning render.

/** Raw identifying attributes collected from an element, in the page. */
export interface TargetParts {
    tag: string;
    /** Salesforce field API name from the enclosing [data-target-selection-name]. */
    apiName?: string;
    name?: string;
    id?: string;
    ariaLabel?: string;
    /** Visible text — the sturdiest handle for tabs, buttons and links. */
    text?: string;
    /** Position among same-tag siblings; the fallback of last resort. */
    nth?: number;
}

/**
 * Salesforce Lightning regenerates ids like "input-9377" or "combobox-button-12"
 * on every render. They look stable within a single snapshot and break on the
 * next load, so a trailing run of digits disqualifies an id outright.
 */
export const isStableId = (id: string): boolean =>
    !!id && !/^[0-9]/.test(id) && !/:/.test(id) && !/-\d{2,}$/.test(id);

/** CSS-escape a value used inside an attribute selector's quotes. */
const quote = (value: string): string => value.replace(/["\\]/g, '\\$&');

/**
 * Build a selector, strongest anchor first.
 *
 * The API name wins because it is tied to the field's definition rather than to
 * the record, the page layout or the visible label — all three of which change.
 */
export const buildSelector = (parts: TargetParts): string => {
    const tag = (parts.tag || '*').toLowerCase();
    if (parts.apiName) return `[data-target-selection-name="${quote(parts.apiName)}"] ${tag}`;
    if (parts.name) return `${tag}[name="${quote(parts.name)}"]`;
    if (parts.id && isStableId(parts.id)) return `#${parts.id.replace(/([^\w-])/g, '\\$1')}`;
    if (parts.ariaLabel) return `${tag}[aria-label="${quote(parts.ariaLabel)}"]`;
    return `${tag}:nth-of-type(${(parts.nth ?? 0) + 1})`;
};

/**
 * How much to trust a selector, so the UI can warn before a recipe is saved
 * on top of something fragile.
 */
export const selectorConfidence = (parts: TargetParts): 'high' | 'medium' | 'low' => {
    if (parts.apiName) return 'high';
    if (parts.name || (parts.id && isStableId(parts.id)) || parts.ariaLabel) return 'medium';
    return 'low';
};
