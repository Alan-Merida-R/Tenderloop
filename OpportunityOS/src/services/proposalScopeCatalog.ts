import type { ScopeCatalog, ScopeCatalogOption } from '../components/scopeCatalog';

export type ProposalScopeBucket = 'scope' | 'systems' | 'applications' | 'quickNotes' | 'extras';

export interface ProposalScopeTimeRow {
    category: string;
    bucket: ProposalScopeBucket;
    label: string;
    mode: 'base' | 'extra';
}

/** Builds the Settings matrix and calculator choices directly from the live Scope catalog. */
export const buildProposalScopeTimeRows = (catalog: ScopeCatalog): ProposalScopeTimeRow[] => {
    const flatten = (options: ScopeCatalogOption[]) => options.flatMap(option => [option, ...(option.children || [])]);
    return [
        ...catalog.scope.map(option => ({ category: 'Proposal type', bucket: 'scope' as const, label: option.label, mode: 'base' as const })),
        ...catalog.systems.flatMap(option => [
            { category: 'System', bucket: 'systems' as const, label: option.label, mode: 'extra' as const },
            ...(option.children || []).map(child => ({ category: `${option.label} sub-modules`, bucket: 'systems' as const, label: child.label, mode: 'extra' as const })),
        ]),
        ...flatten(catalog.applications).map(option => ({ category: 'Safety application', bucket: 'applications' as const, label: option.label, mode: 'extra' as const })),
        ...catalog.quickNotes.flatMap(option => [
            { category: 'Extra Scope', bucket: 'quickNotes' as const, label: option.label, mode: 'extra' as const },
            ...(option.children || []).map(child => ({ category: `${option.label} sub-modules`, bucket: 'quickNotes' as const, label: child.label, mode: 'extra' as const })),
        ]),
        ...flatten(catalog.extras).map(option => ({ category: 'Label / extra', bucket: 'extras' as const, label: option.label, mode: 'extra' as const })),
    ];
};

