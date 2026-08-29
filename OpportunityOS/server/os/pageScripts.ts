// Functions in this file do NOT run in Node — Playwright serializes their
// source and evaluates them inside the page. Two rules follow from that:
//   1. They must be self-contained (no imports, no closures over module state).
//   2. Only plain JS the browser understands — no TS-only syntax that would
//      leave transpiler helpers behind.
// The server tsconfig has no "dom" lib (it is a Node config), so the browser
// globals are declared as `any` here instead of polluting the shared config.

declare const document: any;
declare const window: any;

/** One editable control found on the page. */
export interface PageField {
    label: string;
    name: string;
    id: string;
    type: string;
    value: string;
    /** Raw identifying attributes; the selector is composed in Node. */
    target: {
        tag: string;
        apiName?: string;
        name?: string;
        id?: string;
        ariaLabel?: string;
        nth?: number;
    };
    /** Filled in by the server from `target` — always empty inside the page. */
    selector: string;
    /** Salesforce field API name, when the page exposes one. */
    apiName?: string;
    options?: string[];
}

/** One read-only "Label: value" pair rendered on the page. */
export interface PageValue {
    label: string;
    value: string;
    source: string;
    /** Salesforce field API name, when the page exposes one. */
    apiName?: string;
}

export interface PageSnapshot {
    title: string;
    url: string;
    /** Heuristic: the page looks like a sign-in / SSO wall, not real content. */
    looksLikeLogin: boolean;
    text: string;
    fields: PageField[];
    values: PageValue[];
    frames: number;
}

/**
 * Collect everything a recipe author needs: editable controls (for filling),
 * label/value pairs (for extraction) and the visible text (fallback + context).
 */
export function collectSnapshot(): PageSnapshot {
    const clean = (s: unknown): string => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

    const isVisible = (el: any): boolean => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    // CSS.escape is not available in every embedded engine; fall back to a
    // conservative escape so generated selectors stay usable either way.
    const esc = (s: string): string =>
        (window.CSS && window.CSS.escape) ? window.CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1');

    /** Resolve a human label for a control, cheapest reliable source first. */
    const labelFor = (el: any): string => {
        if (el.id) {
            const explicit = document.querySelector(`label[for="${esc(el.id)}"]`);
            if (explicit) return clean(explicit.textContent);
        }
        const aria = el.getAttribute('aria-label');
        if (aria) return clean(aria);
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            const parts = labelledBy.split(/\s+/)
                .map((id: string) => document.getElementById(id))
                .filter(Boolean)
                .map((node: any) => clean(node.textContent));
            if (parts.length) return parts.join(' ');
        }
        const wrapping = el.closest('label');
        if (wrapping) return clean(wrapping.textContent);
        // Salesforce Lightning renders label and control as siblings in a
        // .slds-form-element wrapper rather than using label[for].
        const formEl = el.closest('.slds-form-element, .form-group, .field');
        if (formEl) {
            const lbl = formEl.querySelector('label, .slds-form-element__label');
            if (lbl) return clean(lbl.textContent);
        }
        return clean(el.getAttribute('placeholder') || el.getAttribute('name') || '');
    };

    /**
     * The API name Lightning stamps on every record field, e.g.
     * "sfdc:RecordField.OPP_SupportRequest__c.Status__c". It is tied to the
     * field's definition rather than the record, the layout or the visible
     * label, which makes it the sturdiest anchor available on these pages —
     * labels get renamed and reordered, API names do not.
     */
    const apiNameFor = (el: any): string => {
        const holder = el.closest ? el.closest('[data-target-selection-name]') : null;
        return holder ? clean(holder.getAttribute('data-target-selection-name')) : '';
    };

    /** Collect raw identifying attributes only — Node decides which one wins
     *  (buildSelector in selectorPolicy.ts). Keeping the priority policy out of
     *  the page means the probe and the recorder cannot drift apart. */
    const targetPartsFor = (el: any, index: number) => ({
        tag: el.tagName.toLowerCase(),
        apiName: apiNameFor(el) || undefined,
        name: clean(el.getAttribute('name')) || undefined,
        id: clean(el.id) || undefined,
        ariaLabel: clean(el.getAttribute('aria-label')) || undefined,
        nth: index,
    });

    const fields: PageField[] = [];
    const controls = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');
    for (let i = 0; i < controls.length; i++) {
        const el = controls[i];
        const type = clean(el.getAttribute('type') || el.tagName).toLowerCase();
        // Never surface credential inputs: they are not fillable by design and
        // echoing their metadata into a probe artifact serves no purpose.
        if (type === 'password' || type === 'hidden') continue;
        if (!isVisible(el)) continue;
        const field: PageField = {
            label: labelFor(el),
            name: clean(el.getAttribute('name')),
            id: clean(el.id),
            type,
            value: clean(el.value),
            target: targetPartsFor(el, i),
            selector: '',
            apiName: apiNameFor(el) || undefined,
        };
        if (el.tagName.toLowerCase() === 'select') {
            field.options = Array.from(el.options || []).map((o: any) => clean(o.textContent)).slice(0, 40);
        }
        fields.push(field);
    }

    const values: PageValue[] = [];
    const push = (label: string, value: string, source: string, apiName?: string) => {
        const l = clean(label).replace(/[:*]\s*$/, '');
        const v = clean(value);
        if (!l || !v || l === v) return;
        if (l.length > 80 || v.length > 400) return;
        values.push({ label: l, value: v, source, apiName: apiName || undefined });
    };

    /**
     * Try selectors in priority order, one at a time.
     *
     * A single comma-separated querySelector would NOT do this: it returns the
     * first match in *document order*, so an ancestor like
     * .slds-form-element__control beats the precise .test-id__field-value nested
     * inside it — and that ancestor also contains the inline-edit button, whose
     * "Edit <field>" assistive text then lands in the value.
     */
    const firstMatch = (root: any, selectors: string[]): any => {
        for (let i = 0; i < selectors.length; i++) {
            const found = root.querySelector(selectors[i]);
            if (found) return found;
        }
        return null;
    };

    // Salesforce Lightning read-only fields.
    const sldsGroups = document.querySelectorAll('.slds-form-element');
    for (let i = 0; i < sldsGroups.length; i++) {
        const group = sldsGroups[i];
        if (!isVisible(group)) continue;
        const lbl = firstMatch(group, ['.test-id__field-label', '.slds-form-element__label', 'label']);
        const val = firstMatch(group, [
            '[data-output-element-id="output-field"]',
            '.test-id__field-value',
            '.slds-form-element__static',
            'output',
            'lightning-formatted-text',
            '.slds-form-element__control',
        ]);
        if (lbl && val) push(lbl.textContent, val.textContent, 'slds', apiNameFor(group));
    }

    // Definition lists.
    const dts = document.querySelectorAll('dt');
    for (let i = 0; i < dts.length; i++) {
        const dd = dts[i].nextElementSibling;
        if (dd && dd.tagName === 'DD' && isVisible(dts[i])) push(dts[i].textContent, dd.textContent, 'dl');
    }

    // Two-column "label | value" table rows, the classic detail-page layout.
    const rows = document.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].children;
        if (cells.length === 2 && isVisible(rows[i])) push(cells[0].textContent, cells[1].textContent, 'table');
    }

    const bodyText = clean(document.body ? document.body.innerText : '');
    const lowerText = bodyText.toLowerCase();
    const looksLikeLogin =
        !!document.querySelector('input[type="password"]') ||
        /sign in|log in|iniciar sesi|single sign|authenticat/.test(lowerText.slice(0, 600));

    return {
        title: clean(document.title),
        url: String(window.location.href),
        looksLikeLogin,
        // Cap the text: probe artifacts are written to disk and read back by a
        // human, and a full Lightning page can dump hundreds of KB of chrome.
        text: bodyText.slice(0, 20000),
        fields,
        values: values.slice(0, 400),
        frames: window.frames ? window.frames.length : 0,
    };
}
