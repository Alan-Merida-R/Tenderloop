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

const legacyLabelsForOption = (option: ScopeCatalogOption): string[] => {
    if (option.id === 'trainings' || option.label === 'Training') return ['Trainings'];
    if (option.id === 'triconex' || option.label === 'Safety') return ['Triconex'];
    if (option.id === 'm580-s' || option.label === 'M580 S') return ['Modicon 580 Safety', 'M580 Safety'];
    if (option.id === 'tri-gp' || option.label === 'TriGP') return ['Tri-GP'];
    if (option.id === 'resales-lt-49' || option.label === 'Resales <49%') return ['Resales >20%'];
    if (option.id === 'fg' || option.label === 'SF&G') return ['F&G'];
    return [];
};

const savedIncludesOption = (saved: Set<string>, option: ScopeCatalogOption): boolean =>
    saved.has(option.label) || legacyLabelsForOption(option).some(label => saved.has(label));

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
    return options.filter(option => savedIncludesOption(saved, option)).map(option => option.label);
};

/**
 * Systems captured before the catalog existed only ever set platform_modicon/triconex/foxboro
 * (or flow_T001). Map those onto the closest catalog option so an older SOW does not read blank.
 */
export const systemsFromLegacy = (fields: Record<string, any>, options: ScopeCatalogOption[]): string[] => {
    const flowSystems = asLabels(fields.flow_T001);
    const oldSystems = asLabels(fields.sow_systems);
    const found: string[] = [];
    const add = (label?: string) => { if (label && !found.includes(label)) found.push(label); };
    if (fields.platform_modicon === true) add(options.find(o => /modicon/i.test(o.label))?.label);
    // Matched by id, not a "tricon" label regex: the Safety rename means the label no longer
    // contains "tricon", but the option's id stays 'triconex' so this keeps finding it.
    if (fields.platform_triconex === true) add(options.find(o => o.id === 'triconex')?.label);
    if (oldSystems.some(name => /^(triconex|modicon\s*580\s*safety|m580\s*safety)$/i.test(name.trim()))) {
        add(options.find(o => o.id === 'triconex')?.label);
    }
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
        (catalog[group] || []).forEach(option => {
            if (!option.children?.length) return;
            const key = scopeModuleKey(group, option);
            const saved = new Set(asLabels(fields[key]));
            const selected = option.children.filter(child => savedIncludesOption(saved, child)).map(child => child.label);
            if (option.id === 'triconex' && asLabels(fields.sow_systems).some(name => /^(modicon\s*580\s*safety|m580\s*safety)$/i.test(name.trim()))) {
                const m580 = option.children.find(child => child.id === 'm580-s');
                if (m580 && !selected.includes(m580.label)) selected.push(m580.label);
            }
            map[key] = selected;
        });
    });
    return map;
};

export interface ScopeSelection {
    scope: string[];
    systems: string[];
    applications: string[];
    quickNotes: string[];
    extras: string[];
    modules: Record<string, string[]>;
}

export const EMPTY_SCOPE_SELECTION: ScopeSelection = { scope: [], systems: [], applications: [], quickNotes: [], extras: [], modules: {} };

/** Everything the Scope quick view holds, read straight out of a SOW note's fields. */
export const readScopeSelection = (fields: Record<string, any>, catalog: ScopeCatalog): ScopeSelection => {
    const scopeDirect = selectedFromFields(fields, 'scope_types', catalog.scope);
    const systemsDirect = selectedFromFields(fields, 'sow_systems', catalog.systems);
    return {
        scope: scopeDirect.length ? scopeDirect : scopeFromLegacy(fields, catalog.scope),
        systems: systemsDirect.length ? systemsDirect : systemsFromLegacy(fields, catalog.systems),
        applications: (() => {
            const applicationOptions = catalog.applications || [];
            const direct = selectedFromFields(fields, 'safety_applications', applicationOptions);
            return direct.length ? direct : selectedFromFields(fields, 'triconex_products', applicationOptions);
        })(),
        quickNotes: selectedFromFields(fields, 'quick_notes', catalog.quickNotes),
        extras: selectedFromFields(fields, 'scope_extras', catalog.extras),
        modules: modulesFromFields(fields, catalog),
    };
};

/**
 * Systems as they read at a glance: each selected system followed by its selected
 * sub-modules, flattened into one list — "Safety, SIS, Tricon CX" rather than a tree.
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
    applications: string[];
    quickNotes: string[];
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
    const legacySet = new Set(legacyText);
    const legacyMatches = (options: ScopeCatalogOption[]) => options
        .filter(option => savedIncludesOption(legacySet, option))
        .map(option => option.label);
    const scope = Array.from(new Set([...selection.scope, ...legacyMatches(resolved.scope)]));
    const systemOptions = resolved.systems.flatMap(option => [option, ...(option.children || [])]);
    const systems = Array.from(new Set([...flattenSystems(selection, resolved), ...legacyMatches(systemOptions)]));
    const safetySelected = selection.systems.some(label => resolved.systems.find(option => option.label === label)?.id === 'triconex');
    const applications = safetySelected ? Array.from(new Set([...(selection.applications || []), ...legacyMatches(resolved.applications || [])])) : [];
    const quickNotes = Array.from(new Set([...selection.quickNotes, ...legacyMatches(resolved.quickNotes)]));
    const extras = Array.from(new Map([
        ...selection.extras,
        ...legacyLabels.filter(label => !catalogContainsLabel(resolved, label.text)).map(label => label.text),
    ].map(label => [scopeLabelKey(label), label])).values());
    return { scope, systems, applications, quickNotes, extras, hasAny: scope.length > 0 || systems.length > 0 || applications.length > 0 || quickNotes.length > 0 || extras.length > 0 };
};

/** Plain-text form, e.g. "Upgrade, Migration and CF - EAE, Triconex, SIS". Used for tooltips. */
export const formatScopeGlance = (glance: ScopeGlance): string => {
    const join = (list: string[]) =>
        list.length <= 1 ? (list[0] || '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
    return [
        join(glance.scope || []),
        [...(glance.systems || []), ...(glance.applications || []), ...(glance.quickNotes || [])].join(', '),
        (glance.extras || []).join(', '),
    ].filter(Boolean).join(' - ');
};
