/**
 * Reading the Scope answers back out of an opportunity.
 *
 * The Scope quick view WRITES its answers into the SOW note's JSON (`scope_types`,
 * `sow_systems`, `quick_notes`, plus one key per sub-module list). Anything that wants to
 * DISPLAY those answers — the proposal cards, and the quick view itself when it reopens —
 * has to apply the same rules: keep only options the catalog still offers, and fall back to
 * the pre-catalog answer keys so an older SOW does not read as empty.
 *
 * Those rules used to live inside ScopeQuickViewModal, which is why nothing else could show
 * the scope. They live here now; the modal imports them rather than keeping its own copy.
 */

import type { MeetingNote, OpportunityLabel } from '../types';
import {
    ScopeCatalog,
    ScopeCatalogOption,
    ScopeCatalogGroup,
    DEFAULT_SCOPE_CATALOG,
    normalizeScopeCatalog,
    scopeModuleKey,
    catalogContainsLabel,
    scopeLabelKey,
} from '../components/scopeCatalog';

/**
 * The single SOW note an opportunity works against. Duplicates could be created before
 * `addSowNote` became idempotent (and a carried-over revision can bring another one), and a
 * plain `.find()` would silently bind to an empty leftover while the user edits the filled
 * one. Prefer the most recently saved SOW first: choosing only by answer count made the
 * primary note flip back to an older duplicate whenever a user cleared a Scope answer, which
 * looked exactly like the edit had not been saved. Legacy notes without `savedAt` still use
 * answer count, with document order as the stable final tie-breaker.
 */
export const pickPrimarySowNote = (notes: MeetingNote[] | undefined): MeetingNote | null => {
    const sowNotes = (notes || []).filter(note => note.format === 'sow');
    if (sowNotes.length <= 1) return sowNotes[0] ?? null;
    const savedAt = (note: MeetingNote) => {
        try {
            const parsed = JSON.parse(note.content || '');
            const timestamp = Date.parse(String(parsed?.savedAt || ''));
            return Number.isFinite(timestamp) ? timestamp : 0;
        } catch {
            return 0;
        }
    };
    const weight = (note: MeetingNote) => {
        try {
            const parsed = JSON.parse(note.content || '');
            return Object.keys(parsed?.fields || {}).filter(key => {
                const v = parsed.fields[key];
                return Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' ? v : String(v ?? '').trim().length > 0;
            }).length;
        } catch {
            return 0;
        }
    };
    return sowNotes.reduce((best, note) => {
        const noteSavedAt = savedAt(note);
        const bestSavedAt = savedAt(best);
        if (noteSavedAt !== bestSavedAt) return noteSavedAt > bestSavedAt ? note : best;
        return weight(note) > weight(best) ? note : best;
    }, sowNotes[0]);
};

export const parseSowFields = (note: MeetingNote | null): Record<string, any> => {
    if (!note?.content) return {};
    try {
        const parsed = JSON.parse(note.content);
        return parsed && typeof parsed === 'object' && parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
    } catch {
        return {};
    }
};

export const asLabels = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/**
 * Reads a catalog group's answer, keeping only options the catalog still offers. Answers for
 * options the user later deleted stay untouched in the note — they are simply not shown.
 */
export const selectedFromFields = (
    fields: Record<string, any>,
    key: string,
    options: ScopeCatalogOption[],
): string[] => {
    const saved = new Set(asLabels(fields[key]));
    return options.filter(option => saved.has(option.label)).map(option => option.label);
};

/**
 * Systems captured before the catalog existed only ever set platform_modicon/triconex/foxboro
 * (or flow_T001). Map those onto the closest catalog option so an older SOW does not read blank.
 */
export const systemsFromLegacy = (fields: Record<string, any>, options: ScopeCatalogOption[]): string[] => {
    const flowSystems = asLabels(fields.flow_T001);
    const found: string[] = [];
    const add = (label?: string) => { if (label && !found.includes(label)) found.push(label); };
    if (fields.platform_modicon === true) add(options.find(o => /modicon/i.test(o.label))?.label);
    if (fields.platform_triconex === true) add(options.find(o => /tricon/i.test(o.label))?.label);
    if (fields.platform_foxboro === true) add(options.find(o => /foxboro/i.test(o.label))?.label);
    flowSystems.forEach(name => add(options.find(o => o.label.toLowerCase().includes(name.toLowerCase()))?.label));
    return found;
};

export const scopeFromLegacy = (fields: Record<string, any>, options: ScopeCatalogOption[]): string[] => {
    const same = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, '') === b.toLowerCase().replace(/\s+/g, '');
    const candidates = [...asLabels(fields.flow_B008)];
    if (typeof fields.opp_type === 'string' && fields.opp_type && fields.opp_type !== 'Mixed') candidates.push(fields.opp_type);
    const found: string[] = [];
    candidates.forEach(candidate => {
        const match = options.find(option => same(option.label, candidate));
        if (match && !found.includes(match.label)) found.push(match.label);
    });
    return found;
};

/** Every sub-module answer, keyed exactly like the SOW stores them. */
export const modulesFromFields = (
    fields: Record<string, any>,
    catalog: ScopeCatalog,
): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    (['systems', 'quickNotes'] as const).forEach((group: ScopeCatalogGroup) => {
        catalog[group].forEach(option => {
            if (!option.children?.length) return;
            const key = scopeModuleKey(group, option);
            const saved = new Set(asLabels(fields[key]));
            map[key] = option.children.filter(child => saved.has(child.label)).map(child => child.label);
        });
    });
    return map;
};

export interface ScopeSelection {
    scope: string[];
    systems: string[];
    quickNotes: string[];
    extras: string[];
    modules: Record<string, string[]>;
}

export const EMPTY_SCOPE_SELECTION: ScopeSelection = { scope: [], systems: [], quickNotes: [], extras: [], modules: {} };

/** Everything the Scope quick view holds, read straight out of a SOW note's fields. */
export const readScopeSelection = (fields: Record<string, any>, catalog: ScopeCatalog): ScopeSelection => {
    const scopeDirect = selectedFromFields(fields, 'scope_types', catalog.scope);
    const systemsDirect = selectedFromFields(fields, 'sow_systems', catalog.systems);
    return {
        scope: scopeDirect.length ? scopeDirect : scopeFromLegacy(fields, catalog.scope),
        systems: systemsDirect.length ? systemsDirect : systemsFromLegacy(fields, catalog.systems),
        quickNotes: selectedFromFields(fields, 'quick_notes', catalog.quickNotes),
        extras: selectedFromFields(fields, 'scope_extras', catalog.extras),
        modules: modulesFromFields(fields, catalog),
    };
};

/**
 * Systems as they read at a glance: each selected system followed by its selected
 * sub-modules, flattened into one list — "Triconex, SIS, Tricon CX" rather than a tree.
 * A sub-module whose parent is unselected is skipped, matching what the quick view shows.
 */
export const flattenSystems = (selection: ScopeSelection, catalog: ScopeCatalog): string[] => {
    const flat: string[] = [];
    const push = (label: string) => { if (label && !flat.includes(label)) flat.push(label); };
    selection.systems.forEach(label => {
        push(label);
        const option = catalog.systems.find(item => item.label === label);
        if (!option?.children?.length) return;
        (selection.modules[scopeModuleKey('systems', option)] || []).forEach(push);
    });
    return flat;
};

export interface ScopeGlance {
    scope: string[];
    systems: string[];
    extras: string[];
    /** False when the opportunity has no SOW answers at all — nothing to render. */
    hasAny: boolean;
}

/**
 * The at-a-glance scope for one opportunity: the Scope answers and the Systems answers
 * (sub-modules included), with nothing invented. Reads "Upgrade, Migration, CF" +
 * "EAE, Triconex, SIS".
 */
export const readScopeGlance = (
    notes: MeetingNote[] | undefined,
    catalog?: ScopeCatalog,
    legacyLabels: OpportunityLabel[] = [],
): ScopeGlance => {
    const resolved = normalizeScopeCatalog(catalog) || DEFAULT_SCOPE_CATALOG;
    const fields = parseSowFields(pickPrimarySowNote(notes));
    const selection = readScopeSelection(fields, resolved);
    const legacyText = legacyLabels.map(label => label.text);
    const legacyMatches = (options: ScopeCatalogOption[]) => options
        .filter(option => legacyText.some(label => scopeLabelKey(label) === scopeLabelKey(option.label)))
        .map(option => option.label);
    const scope = Array.from(new Set([...selection.scope, ...legacyMatches(resolved.scope)]));
    const systemOptions = resolved.systems.flatMap(option => [option, ...(option.children || [])]);
    const systems = Array.from(new Set([...flattenSystems(selection, resolved), ...legacyMatches(systemOptions)]));
    const extras = Array.from(new Map([
        ...selection.extras,
        ...legacyLabels.filter(label => !catalogContainsLabel(resolved, label.text)).map(label => label.text),
    ].map(label => [scopeLabelKey(label), label])).values());
    return { scope, systems, extras, hasAny: scope.length > 0 || systems.length > 0 || extras.length > 0 };
};

/** Plain-text form, e.g. "Upgrade, Migration and CF - EAE, Triconex, SIS". Used for tooltips. */
export const formatScopeGlance = (glance: ScopeGlance): string => {
    const join = (list: string[]) =>
        list.length <= 1 ? (list[0] || '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
    return [join(glance.scope), glance.systems.join(', '), glance.extras.join(', ')].filter(Boolean).join(' - ');
};
