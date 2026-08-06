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
    /** Best-effort selector to target this control from a recipe. */
    selector: string;
    options?: string[];
}

/** One read-only "Label: value" pair rendered on the page. */
export interface PageValue {
    label: string;
    value: string;
    source: string;
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

    /** Stable-ish selector: prefer name, then id, then a positional fallback. */
    const selectorFor = (el: any, index: number): string => {
        const tag = el.tagName.toLowerCase();
        const name = el.getAttribute('name');
        if (name) return `${tag}[name="${name}"]`;
        if (el.id && !/^[0-9]/.test(el.id) && !/:/.test(el.id)) return `#${esc(el.id)}`;
        const aria = el.getAttribute('aria-label');
        if (aria) return `${tag}[aria-label="${aria}"]`;
        return `${tag}:nth-of-type(${index + 1})`;
    };

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
            selector: selectorFor(el, i),
        };
        if (el.tagName.toLowerCase() === 'select') {
            field.options = Array.from(el.options || []).map((o: any) => clean(o.textContent)).slice(0, 40);
        }
        fields.push(field);
    }

    const values: PageValue[] = [];
    const push = (label: string, value: string, source: string) => {
        const l = clean(label).replace(/[:*]\s*$/, '');
        const v = clean(value);
        if (!l || !v || l === v) return;
        if (l.length > 80 || v.length > 400) return;
        values.push({ label: l, value: v, source });
    };

    // Salesforce Lightning read-only fields.
    const sldsGroups = document.querySelectorAll('.slds-form-element');
    for (let i = 0; i < sldsGroups.length; i++) {
        const group = sldsGroups[i];
        if (!isVisible(group)) continue;
        const lbl = group.querySelector('.slds-form-element__label, label');
        const val = group.querySelector('.slds-form-element__static, output, lightning-formatted-text, .slds-form-element__control');
        if (lbl && val) push(lbl.textContent, val.textContent, 'slds');
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
