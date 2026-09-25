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
    /** Applications shown only when the Safety system is selected. */
    applications: ScopeCatalogOption[];
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
    applications: '#0f766e',
    quickNotes: '#64748b',
    /** Labels that matched no catalog option — the "extra" group. */
    extra: '#94a3b8',
} as const;

export type ScopeColorRole = keyof typeof SCOPE_GROUP_COLORS;

/** The colour a catalog option should render with: its own, else its role's default. */
export const scopeOptionColor = (option: ScopeCatalogOption | undefined, role: ScopeColorRole): string =>
    (option?.color || '').trim() || SCOPE_GROUP_COLORS[role];

export const SCOPE_CATALOG_GROUPS: Array<{ key: ScopeCatalogGroup; title: string; hint: string }> = [
    { key: 'scope', title: 'Type of Proposal', hint: 'What kind of proposal this is: green field, upgrade, migration, CF, parts, services or training.' },
    { key: 'systems', title: 'Systems', hint: 'Which platform is involved. Safety and Foxboro open their own sub-system lists.' },
    { key: 'applications', title: 'Safety Applications', hint: 'Application choices shown below Systems whenever Safety is selected.' },
    { key: 'quickNotes', title: 'Extra Scope', hint: 'Short commercial scope flags: new cabinets, resale bands, and so on.' },
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
        { id: 'trainings', label: 'Training' },
    ],
    systems: [
        { id: 'eae', label: 'EAE' },
        { id: 'modicon-580', label: 'Modicon 580' },
        { id: 'epe', label: 'EPE' },
        { id: 'epp', label: 'EPP' },
        {
            id: 'foxboro', label: 'Foxboro', children: [
                { id: 'foxboro-cps', label: 'CPs' },
                { id: 'foxboro-ios', label: 'I/Os' },
                { id: 'foxboro-servers-workstations', label: 'Servers / Workstations' },
                { id: 'foxboro-network', label: 'Network' },
            ]
        },
        {
            // id stays 'triconex' on purpose: it is the historic key scopeModuleKey() matches on
            // (by id, not label) so renaming the label to "Safety" never orphans stored answers.
            id: 'triconex', label: 'Safety', children: [
                { id: 'tricon-cx', label: 'Tricon CX' },
                { id: 'tricon', label: 'Tricon' },
                { id: 'trident', label: 'Trident' },
                { id: 'tri-gp', label: 'TriGP' },
                { id: 'm580-s', label: 'M580 S' },
            ]
        },
        { id: 'aveva', label: 'AVEVA' },
        { id: 'cyber', label: 'Cyber' },
    ],
    applications: [
        { id: 'sis', label: 'SIS/ESD' },
        { id: 'bms', label: 'BMS' },
        { id: 'tmc', label: 'TMC' },
        { id: 'fg', label: 'SF&G' },
        { id: 'hipps', label: 'HIPPS' },
    ],
    quickNotes: [
        { id: 'new-cabinets', label: 'New Cabinets', children: [
            { id: 'regional-integration', label: 'Regional Integration' },
            { id: 'india-cabinets', label: 'India Cabinets' },
        ] },
        { id: 'resales-lt-20', label: 'Resales <20%' },
        { id: 'resales-lt-49', label: 'Resales <49%' },
        { id: 'resales-gt-50', label: 'Resales >50%' },
    ],
    extras: [
        { id: 'similar-copy', label: 'Similar/Copy' },
        { id: 'split', label: 'Split' },
    ],
};

/** Optional Execution Center choices asked in the Scope (only when quoted from more than one center). */
export const EXECUTION_CENTERS = ['Mexico', 'USA', 'Canada'] as const;

/** Extras that carry a free-text reference (an internal file/expediente or a link) when ticked. */
export const SCOPE_EXTRA_REFERENCE_IDS = ['similar-copy', 'split'] as const;

/** Accent/case/spacing-insensitive identity used to prevent a legacy label duplicating Scope. */
export const scopeLabelKey = (value: string): string => String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

export const catalogContainsLabel = (catalog: ScopeCatalog, label: string): boolean => {
    const key = scopeLabelKey(label);
    const matches = (option: ScopeCatalogOption): boolean => {
        if (scopeLabelKey(option.label) === key) return true;
        if (option.id === 'triconex' && key === 'triconex') return true;
        if (option.id === 'm580-s' && ['modicon580safety', 'm580safety'].includes(key)) return true;
        if (option.id === 'tri-gp' && key === 'trigp') return true;
        return false;
    };
    return (['scope', 'systems', 'applications', 'quickNotes'] as const).some(group => catalog[group].some(option =>
        matches(option) || (option.children || []).some(matches)));
};

/** Same rules as `slugify()` inside sowTemplate.html — both derive the identical sub-module key. */
export const scopeSlugify = (value: string): string =>
    String(value || 'section').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'section';

/**
 * Answer key for one option's sub-module list. Triconex/Safety keeps `triconex_products`, the
 * key the SOW used before catalogs existed, so those answers are never orphaned. Matched by
 * `id` (stable) rather than by label: the label is user-editable (e.g. "Triconex" -> "Safety"
 * per the Safety rename), and matching on label used to silently re-key — and orphan — every
 * answer the moment someone renamed the option from Settings.
 */
export const scopeModuleKey = (group: ScopeCatalogGroup, option: ScopeCatalogOption): string => {
    if (group === 'systems' && option.id === 'triconex') return 'triconex_products';
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
 *
 * This is purely structural (shape/id/color validation) — it must NOT inject or rewrite specific
 * options, because it runs on every read (including every keystroke while editing the catalog in
 * Settings). An older version of this function also injected a handful of options (SPE, Regional
 * Integration...) unconditionally; since it ran on every read, a user who deliberately *removed*
 * one of those options would see it silently reappear the next render — that one-way fight was
 * the "errors editing scope from Settings" bug. One-time data fixes belong in
 * `migrateLegacyScopeCatalog` below, run once via `ensureScopeCatalogMigrated`.
 */
export const normalizeScopeCatalog = (raw: any): ScopeCatalog | null => {
    if (!raw || typeof raw !== 'object') return null;
    const group = (name: ScopeCatalogGroup): ScopeCatalogOption[] => {
        const list = Array.isArray(raw[name]) ? raw[name] : null;
        if (!list) return DEFAULT_SCOPE_CATALOG[name];
        return list.map((option: any, index: number) => normalizeOption(option, index, 0)).filter(Boolean) as ScopeCatalogOption[];
    };
    return { scope: group('scope'), systems: group('systems'), applications: group('applications'), quickNotes: group('quickNotes'), extras: group('extras') };
};

/**
 * Bump this whenever `migrateLegacyScopeCatalog` gains a new one-time fix, so it runs again for
 * everyone still below the new version. Never decrease it.
 */
export const SCOPE_CATALOG_MIGRATION_VERSION = 9;

/**
 * One-time data fixes for catalogs saved by older builds: options that used to be missing,
 * misspelled or misnamed. Unlike `normalizeScopeCatalog`, this is allowed to add/rename options
 * because it only runs once per install (gated by `SCOPE_CATALOG_MIGRATION_VERSION`), so it never
 * fights a deliberate later edit.
 */
export const migrateLegacyScopeCatalog = (catalog: ScopeCatalog): ScopeCatalog => {
    const scope = [...catalog.scope];
    const trainingIndex = scope.findIndex(option => option.id === 'trainings' || ['training', 'trainings'].includes(scopeLabelKey(option.label)));
    if (trainingIndex < 0) scope.push({ id: 'trainings', label: 'Training' });
    else scope[trainingIndex] = { ...scope[trainingIndex], id: 'trainings', label: 'Training' };

    let safetyFound = false;
    const systems = catalog.systems
      .filter(option => option.id !== 'modicon-580-safety' && scopeLabelKey(option.label) !== 'modicon580safety')
      .map(option => {
        const isSafety = option.id === 'triconex' || /^(triconex|safety)$/i.test(option.label.trim());
        if (!isSafety) return option;
        // Some edited legacy catalogs contain both an old Triconex row and a newer Safety row.
        // Consolidate them into the first matching row instead of rendering two systems.
        if (safetyFound) return null;
        safetyFound = true;
        // Safety rename (was "Triconex"): scopeModuleKey() matches by id, so the label change
        // below never orphans stored answers.
        const label = 'Safety';
        // This is an intentionally exact built-in list. Older catalogs mixed Safety
        // applications (SIS/BMS/TMC/SF&G/ESD), SPE and Run time into this group, sometimes
        // under user-generated ids. Match by id OR label to preserve colours, but never carry
        // an obsolete sixth option into Triconex Technology.
        const previousChildren = option.children || [];
        const technologyDefaults: ScopeCatalogOption[] = [
            { id: 'tricon-cx', label: 'Tricon CX' },
            { id: 'tricon', label: 'Tricon' },
            { id: 'trident', label: 'Trident' },
            { id: 'tri-gp', label: 'TriGP' },
            { id: 'm580-s', label: 'M580 S' },
        ];
        const children = technologyDefaults.map(expected => {
            const previous = previousChildren.find(child => child.id === expected.id || scopeLabelKey(child.label) === scopeLabelKey(expected.label));
            return previous?.color ? { ...expected, color: previous.color } : expected;
        });
        return { ...option, id: 'triconex', label, children };
      })
      .filter(Boolean) as ScopeCatalogOption[];
    if (!safetyFound) {
        const defaultSafety = DEFAULT_SCOPE_CATALOG.systems.find(option => option.id === 'triconex');
        if (defaultSafety) systems.push(defaultSafety);
    }

    const foxboroSubsystems: ScopeCatalogOption[] = [
        { id: 'foxboro-cps', label: 'CPs' },
        { id: 'foxboro-ios', label: 'I/Os' },
        { id: 'foxboro-servers-workstations', label: 'Servers / Workstations' },
        { id: 'foxboro-network', label: 'Network' },
    ];
    const systemsWithFoxboro = systems.map(option => {
        if (option.id !== 'foxboro' && !/^foxboro$/i.test(option.label)) return option;
        if (option.children?.length) return option;
        return { ...option, children: foxboroSubsystems };
    });

    const quickNotes = catalog.quickNotes.flatMap(option => {
        if (option.id === 'no-resales' || /^no resales$/i.test(option.label)) return [];
        if (option.id === 'resales-gt-20' || /^resales\s*>\s*20%$/i.test(option.label)) {
            return [{ ...option, id: 'resales-lt-49', label: 'Resales <49%' }];
        }
        if (option.id !== 'new-cabinets' && !/^new cabinets$/i.test(option.label)) return [option];
        const children = (option.children || []).filter(child => child.id !== 'integration' && !/^integration$/i.test(child.label));
        if (!children.some(child => child.id === 'regional-integration' || /^regional integration$/i.test(child.label))) {
            children.push({ id: 'regional-integration', label: 'Regional Integration' });
        }
        if (!children.some(child => child.id === 'india-cabinets' || /^india cabinets$/i.test(child.label))) {
            children.push({ id: 'india-cabinets', label: 'India Cabinets' });
        }
        return [{ ...option, children }];
    });
    if (!quickNotes.some(option => option.id === 'resales-gt-50' || /^resales\s*>\s*50%$/i.test(option.label))) {
        quickNotes.push({ id: 'resales-gt-50', label: 'Resales >50%' });
    }

    const extras = [...catalog.extras];
    if (!extras.some(option => option.id === 'similar-copy' || scopeLabelKey(option.label) === 'similarcopy')) {
        extras.push({ id: 'similar-copy', label: 'Similar/Copy' });
    }
    if (!extras.some(option => option.id === 'split' || scopeLabelKey(option.label) === 'split')) {
        extras.push({ id: 'split', label: 'Split' });
    }

    // ESD was merged into SIS ("SIS/ESD") and dropped as its own option. Match the existing 'sis'
    // or 'esd' row (whichever the user answered) so a prior ESD-only selection isn't silently
    // lost, but always force the current "SIS/ESD" label — a stale "SIS" label would never
    // self-correct otherwise, since matching by id/label short-circuits before this rename.
    const applications = DEFAULT_SCOPE_CATALOG.applications.map(defaultOption => {
        const stored = catalog.applications || [];
        const existing = stored.find(option => option.id === defaultOption.id || scopeLabelKey(option.label) === scopeLabelKey(defaultOption.label))
            || (defaultOption.id === 'sis' ? stored.find(option => option.id === 'esd' || scopeLabelKey(option.label) === 'esd') : undefined);
        if (!existing) return defaultOption;
        return defaultOption.id === 'sis' ? { ...existing, id: 'sis', label: 'SIS/ESD' } : existing;
    });

    return { scope, systems: systemsWithFoxboro, applications, quickNotes, extras };
};

/**
 * Runs `migrateLegacyScopeCatalog` exactly once per install (tracked by
 * `scopeCatalogMigrationVersion` alongside the catalog in settings). Call this only at the
 * settings-load boundary — every other read should go through the cheap, non-mutating
 * `normalizeScopeCatalog`.
 */
export const ensureScopeCatalogMigrated = <T extends { scopeCatalog?: any; scopeCatalogMigrationVersion?: number }>(settings: T): T => {
    if ((settings.scopeCatalogMigrationVersion || 0) >= SCOPE_CATALOG_MIGRATION_VERSION) return settings;
    const sanitized = normalizeScopeCatalog(settings.scopeCatalog) || DEFAULT_SCOPE_CATALOG;
    return { ...settings, scopeCatalog: migrateLegacyScopeCatalog(sanitized), scopeCatalogMigrationVersion: SCOPE_CATALOG_MIGRATION_VERSION };
};
