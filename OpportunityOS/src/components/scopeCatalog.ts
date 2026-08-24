/**
 * Scope / System / Notes-at-a-glance option lists.
 *
 * These are the three catalogs asked in the SOW's Base Data card and in the expediente's
 * Scope quick view. They are user-editable (Settings → Labels & Scope), so both surfaces —
 * plus the sandboxed SOW iframe, which receives a copy over postMessage — must agree on the
 * shape, on the answer keys, and on how a sub-module key is derived. That agreement lives here.
 *
 * `DEFAULT_SCOPE_CATALOG` is duplicated inside `services/sowTemplate.html` so the iframe can
 * still render standalone (exported and opened directly in a browser). Keep the two in step.
 */

export interface ScopeCatalogOption {
    id: string;
    label: string;
    /**
     * Chip colour, as a hex string. Optional on purpose: an option without one falls back to
     * its group's default (see SCOPE_GROUP_COLORS), so the catalog keeps working untouched and
     * only the options the user actually recoloured carry a value.
     */
    color?: string;
    children?: ScopeCatalogOption[];
}

export interface ScopeCatalog {
    scope: ScopeCatalogOption[];
    systems: ScopeCatalogOption[];
    quickNotes: ScopeCatalogOption[];
    /** Historical labels that do not match Scope, System, sub-system or note options. */
    extras: ScopeCatalogOption[];
}

export type ScopeCatalogGroup = keyof ScopeCatalog;

/**
 * Default chip colours, by role rather than by option.
 *
 * The point of colour here is telling KINDS apart at a glance on a card — "what work" vs
 * "on which system" vs "a label that is not scope at all" — so the defaults stay in the
 * grey/blue family the app already used and only diverge where the role differs. Anything
 * the user recolours overrides these per option.
 */
export const SCOPE_GROUP_COLORS = {
    scope: '#2db64a',
    systems: '#2563eb',
    /** Sub-modules sit visually under their parent system, so they read lighter. */
    submodule: '#60a5fa',
    quickNotes: '#64748b',
    /** Labels that matched no catalog option — the "extra" group. */
    extra: '#94a3b8',
} as const;

export type ScopeColorRole = keyof typeof SCOPE_GROUP_COLORS;

/** The colour a catalog option should render with: its own, else its role's default. */
export const scopeOptionColor = (option: ScopeCatalogOption | undefined, role: ScopeColorRole): string =>
    (option?.color || '').trim() || SCOPE_GROUP_COLORS[role];

export const SCOPE_CATALOG_GROUPS: Array<{ key: ScopeCatalogGroup; title: string; hint: string }> = [
    { key: 'scope', title: 'Scope', hint: 'What kind of work the opportunity is: green field, upgrade, migration, CF, parts or services.' },
    { key: 'systems', title: 'Systems', hint: 'Which platform is in scope. A system can hold sub-modules (Triconex → Tricon CX, SIS, F&G, BMS, Run time).' },
    { key: 'quickNotes', title: 'Notes at a glance', hint: 'Short commercial flags shown next to the scope: new cabinets, resale bands, and so on.' },
    { key: 'extras', title: 'Labels / Extras', hint: 'Historical labels that do not match another Scope option. Matching names are shown only once.' },
];

export const DEFAULT_SCOPE_CATALOG: ScopeCatalog = {
    scope: [
        { id: 'greenfield', label: 'Green field' },
        { id: 'upgrade', label: 'Upgrade' },
        { id: 'migration', label: 'Migration' },
        { id: 'cf', label: 'CF' },
        { id: 'parts', label: 'Parts' },
        { id: 'services', label: 'Services' },
    ],
    systems: [
        { id: 'eae', label: 'EAE' },
        { id: 'modicon-580', label: 'Modicon 580' },
        { id: 'modicon-580-safety', label: 'Modicon 580 Safety' },
        { id: 'epe', label: 'EPE' },
        { id: 'epp', label: 'EPP' },
        { id: 'foxboro', label: 'Foxboro' },
        {
            id: 'triconex', label: 'Triconex', children: [
                { id: 'tricon-cx', label: 'Tricon CX' },
                { id: 'sis', label: 'SIS' },
                { id: 'fg', label: 'F&G' },
                { id: 'bms', label: 'BMS' },
                { id: 'run-time', label: 'Run time' },
            ]
        },
        { id: 'aveva', label: 'AVEVA' },
        { id: 'cyber', label: 'Cyber' },
    ],
    quickNotes: [
        { id: 'new-cabinets', label: 'New Cabinets', children: [{ id: 'integration', label: 'Integration' }] },
        { id: 'resales-lt-20', label: 'Resales <20%' },
        { id: 'resales-gt-20', label: 'Resales >20%' },
        { id: 'no-resales', label: 'No resales' },
    ],
    extras: [],
};

/** Accent/case/spacing-insensitive identity used to prevent a legacy label duplicating Scope. */
export const scopeLabelKey = (value: string): string => String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

export const catalogContainsLabel = (catalog: ScopeCatalog, label: string): boolean => {
    const key = scopeLabelKey(label);
    return (['scope', 'systems', 'quickNotes'] as const).some(group => catalog[group].some(option =>
        scopeLabelKey(option.label) === key || (option.children || []).some(child => scopeLabelKey(child.label) === key)));
};

/** Same rules as `slugify()` inside sowTemplate.html — both derive the identical sub-module key. */
export const scopeSlugify = (value: string): string =>
    String(value || 'section').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'section';

/**
 * Answer key for one option's sub-module list. Triconex keeps `triconex_products`, the key the
 * SOW used before catalogs existed, so those answers are never orphaned.
 */
export const scopeModuleKey = (group: ScopeCatalogGroup, option: ScopeCatalogOption): string => {
    if (group === 'systems' && /^triconex$/i.test(option.label.trim())) return 'triconex_products';
    return `${group === 'systems' ? 'sysmod' : 'qnmod'}_${scopeSlugify(option.id || option.label)}`;
};

/** Accepts `#abc` / `#aabbcc`; anything else is dropped so a bad value cannot break a chip. */
const normalizeColor = (raw: any): string | undefined => {
    const value = String(raw ?? '').trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : undefined;
};

const normalizeOption = (raw: any, index: number, depth: number): ScopeCatalogOption | null => {
    const label = String(raw?.label ?? '').trim();
    if (!label) return null;
    const option: ScopeCatalogOption = { id: String(raw?.id || scopeSlugify(label) || `option-${index}`), label };
    const color = normalizeColor(raw?.color);
    if (color) option.color = color;
    if (depth === 0 && Array.isArray(raw?.children)) {
        const children = raw.children.map((child: any, i: number) => normalizeOption(child, i, 1)).filter(Boolean) as ScopeCatalogOption[];
        if (children.length) option.children = children;
    }
    return option;
};

/**
 * Accepts whatever is stored in settings (possibly written by an older build, possibly partial)
 * and returns a catalog every consumer can render, or null when there is nothing usable.
 */
export const normalizeScopeCatalog = (raw: any): ScopeCatalog | null => {
    if (!raw || typeof raw !== 'object') return null;
    const group = (name: ScopeCatalogGroup): ScopeCatalogOption[] => {
        const list = Array.isArray(raw[name]) ? raw[name] : null;
        if (!list) return DEFAULT_SCOPE_CATALOG[name];
        return list.map((option: any, index: number) => normalizeOption(option, index, 0)).filter(Boolean) as ScopeCatalogOption[];
    };
    return { scope: group('scope'), systems: group('systems'), quickNotes: group('quickNotes'), extras: group('extras') };
};
