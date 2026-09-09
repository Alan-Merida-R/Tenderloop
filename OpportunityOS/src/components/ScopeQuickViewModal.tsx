import React, { useEffect, useMemo, useState } from 'react';
import { X, Crosshair, Plus } from 'lucide-react';
import { MeetingNote, OpportunityLabel } from '../types';
import { ScopeCatalog, DEFAULT_SCOPE_CATALOG, normalizeScopeCatalog, scopeModuleKey, scopeOptionColor, scopeLabelKey, catalogContainsLabel, SCOPE_EXTRA_REFERENCE_IDS } from './scopeCatalog';
// The same readers the proposal cards use, so the card and this modal can never disagree
// about which options are selected. See services/scopeSummary.ts.
import { parseSowFields, asLabels, selectedFromFields, scopeFromLegacy, systemsFromLegacy, modulesFromFields } from '../services/scopeSummary';

/**
 * Legacy Opportunity Type wording. The Scope catalog replaced it as the question the user
 * answers, but flow_B008 / opp_type are still what the SOW's built-in dependency rules read,
 * so a Scope option whose label matches one of these keeps those branches working.
 */
const LEGACY_OPP_TYPES = ['Greenfield', 'Modernization', 'Migration', 'Upgrade', 'Expansion', 'Services Only'];
const toLegacyOppType = (label: string): string => {
    const clean = label.trim().toLowerCase().replace(/\s+/g, ' ');
    if (clean === 'green field') return 'Greenfield';
    return LEGACY_OPP_TYPES.find(option => option.toLowerCase() === clean) || '';
};

/**
 * platform_* still drives the SOW's 4A/4B/4C platform sections, so it follows the System answer.
 * Triconex/Safety is matched by catalog id, not by a "tricon" regex on the label — the Safety
 * rename means the label no longer contains "tricon", so a label-only match would silently stop
 * opening the 4B section the moment a system used the Safety option.
 */
const platformMirror = (systems: string[], catalog: ScopeCatalog): Record<string, boolean> => {
    const isTriconex = (label: string) => catalog.systems.find(option => option.label === label)?.id === 'triconex';
    const isKnown = (label: string) => isTriconex(label) || /modicon|foxboro/i.test(label);
    const mirror: Record<string, boolean> = {
        platform_modicon: systems.some(name => /modicon/i.test(name)),
        platform_triconex: systems.some(isTriconex),
        platform_foxboro: systems.some(name => /foxboro/i.test(name)),
    };
    mirror.platform_other = systems.some(name => !isKnown(name));
    return mirror;
};

interface Props {
    sowNote: MeetingNote | null;
    catalog?: ScopeCatalog;
    disabled?: boolean;
    legacyLabels?: OpportunityLabel[];
    onSaveFields: (patch: Record<string, unknown>) => void;
    onCreateSowNote: () => void;
    onClose: () => void;
}

const ScopeQuickViewModal: React.FC<Props> = ({ sowNote, catalog, legacyLabels = [], disabled = false, onSaveFields, onCreateSowNote, onClose }) => {
    const fields = useMemo(() => parseSowFields(sowNote), [sowNote]);
    const resolvedCatalog = useMemo(() => normalizeScopeCatalog(catalog) || DEFAULT_SCOPE_CATALOG, [catalog]);

    // `included_scope` is the actual detailed SOW answer. `scope_summary` is
    // retained for old SOW notes, but must never mask a newer SOW response.
    // An empty included_scope is still a string, so prefer it only when it
    // actually has content — otherwise fall back to scope_summary.
    const includedScope = typeof fields.included_scope === 'string' ? fields.included_scope : '';
    const summaryScope = typeof fields.scope_summary === 'string' ? fields.scope_summary : '';
    const scopeFromSow = includedScope.trim() ? includedScope : summaryScope;
    const [scope, setScope] = useState<string>(scopeFromSow);

    const scopeTypesFromSow = useMemo(() => {
        const direct = selectedFromFields(fields, 'scope_types', resolvedCatalog.scope);
        return direct.length ? direct : scopeFromLegacy(fields, resolvedCatalog.scope);
    }, [fields, resolvedCatalog]);
    const systemsFromSow = useMemo(() => {
        const direct = selectedFromFields(fields, 'sow_systems', resolvedCatalog.systems);
        return direct.length ? direct : systemsFromLegacy(fields, resolvedCatalog.systems);
    }, [fields, resolvedCatalog]);
    const applicationsFromSow = useMemo(() => {
        const applicationOptions = resolvedCatalog.applications || [];
        const direct = selectedFromFields(fields, 'safety_applications', applicationOptions);
        if (direct.length) return direct;
        // Before applications had their own section they were stored among Safety products.
        return selectedFromFields(fields, 'triconex_products', applicationOptions);
    }, [fields, resolvedCatalog]);
    const quickNotesFromSow = useMemo(() => selectedFromFields(fields, 'quick_notes', resolvedCatalog.quickNotes), [fields, resolvedCatalog]);
    const extrasFromSow = useMemo(() => {
        const direct = selectedFromFields(fields, 'scope_extras', resolvedCatalog.extras);
        const legacy = legacyLabels.filter(label => !catalogContainsLabel(resolvedCatalog, label.text)).map(label => label.text);
        return Array.from(new Set([...direct, ...legacy]));
    }, [fields, resolvedCatalog, legacyLabels]);
    // One flat map of sub-module answers, keyed exactly like the SOW stores them
    // (Triconex keeps `triconex_products` so pre-catalog answers survive).
    const modulesFromSow = useMemo(() => modulesFromFields(fields, resolvedCatalog), [fields, resolvedCatalog]);
    // "Similar/Copy" and "Split" ask for a reference (an internal expediente or a link) once
    // ticked. Stored per option id so a future rename never loses the reference.
    const extraReferenceKey = (id: string) => `extra_ref_${id}`;
    const extraReferencesFromSow = useMemo(() => {
        const refs: Record<string, string> = {};
        SCOPE_EXTRA_REFERENCE_IDS.forEach(id => {
            const value = fields[extraReferenceKey(id)];
            if (typeof value === 'string' && value) refs[id] = value;
        });
        return refs;
    }, [fields]);

    // Optional: which internal office quoted/executes this proposal, only relevant when Alan
    // works across more than one quoting center. Empty by default, never required.
    const EXECUTION_CENTERS = ['Mexico', 'USA', 'Canada'];
    const executionCenterFromSow = typeof fields.execution_center === 'string' ? fields.execution_center : '';
    const [executionCenter, setExecutionCenter] = useState<string>(executionCenterFromSow);
    useEffect(() => { setExecutionCenter(executionCenterFromSow); }, [executionCenterFromSow]);

    const [scopeTypes, setScopeTypes] = useState<string[]>(scopeTypesFromSow);
    const [systems, setSystems] = useState<string[]>(systemsFromSow);
    const [applications, setApplications] = useState<string[]>(applicationsFromSow);
    const [quickNotes, setQuickNotes] = useState<string[]>(quickNotesFromSow);
    const [extras, setExtras] = useState<string[]>(extrasFromSow);
    const [modules, setModules] = useState<Record<string, string[]>>(modulesFromSow);
    const [extraReferences, setExtraReferences] = useState<Record<string, string>>(extraReferencesFromSow);
    useEffect(() => { setScope(scopeFromSow); }, [scopeFromSow]);
    useEffect(() => { setScopeTypes(scopeTypesFromSow); }, [scopeTypesFromSow]);
    useEffect(() => { setSystems(systemsFromSow); }, [systemsFromSow]);
    useEffect(() => { setApplications(applicationsFromSow); }, [applicationsFromSow]);
    useEffect(() => { setQuickNotes(quickNotesFromSow); }, [quickNotesFromSow]);
    useEffect(() => { setExtras(extrasFromSow); }, [extrasFromSow]);
    useEffect(() => { setExtraReferences(extraReferencesFromSow); }, [extraReferencesFromSow]);
    useEffect(() => { setModules(modulesFromSow); }, [modulesFromSow]);

    const toggle = (list: string[], value: string) => list.includes(value) ? list.filter(item => item !== value) : [...list, value];
    const toggleModule = (key: string, label: string) => setModules(prev => ({ ...prev, [key]: toggle(prev[key] || [], label) }));

    const handleSave = () => {
        const legacyTypes = scopeTypes.map(toLegacyOppType).filter(Boolean);
        // Merge, never replace: flow_B008 can hold answers this catalog has no equivalent for
        // (Modernization, Expansion, the HMI/SCADA variants). Only membership of the options
        // this modal knows about is rewritten.
        const mergedTypes = new Set(asLabels(fields.flow_B008));
        LEGACY_OPP_TYPES.forEach(option => { if (legacyTypes.includes(option)) mergedTypes.add(option); else mergedTypes.delete(option); });
        const legacyList = [...mergedTypes];
        onSaveFields({
            scope_summary: scope,
            // The detailed SOW question and the Overview quick view describe
            // the same scope, so keep both answer keys aligned.
            included_scope: scope,
            scope_types: scopeTypes,
            sow_systems: systems,
            safety_applications: applications,
            quick_notes: quickNotes,
            scope_extras: extras,
            execution_center: executionCenter,
            // Sub-modules are written even when their parent is unselected, matching the SOW's
            // "hidden answers are preserved" rule — re-checking the parent brings them back.
            ...modules,
            ...Object.fromEntries(SCOPE_EXTRA_REFERENCE_IDS.map(id => [extraReferenceKey(id), extraReferences[id] || ''])),
            ...platformMirror(systems, resolvedCatalog),
            // Legacy mirrors: the SOW's built-in dependency rules still read these.
            flow_B008: legacyList,
            opp_type: legacyList.length === 1 ? legacyList[0].replace('Services Only', 'Services only') : (legacyList.length ? 'Mixed' : ''),
        });
        onClose();
    };

    const chip = (active: boolean) => `flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${active ? 'text-white border-white/20 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-500'} ${disabled ? 'opacity-60 cursor-default' : 'hover:border-slate-400'}`;

    const renderGroup = (group: 'systems' | 'quickNotes', selected: string[], setSelected: (next: string[]) => void) => (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {resolvedCatalog[group].map(option => (
                    <label key={option.id} className={chip(selected.includes(option.label))} style={selected.includes(option.label) ? { backgroundColor: scopeOptionColor(option, group === 'systems' ? 'systems' : 'quickNotes') } : undefined}>
                        <input
                            type="checkbox"
                            checked={selected.includes(option.label)}
                            onChange={() => setSelected(toggle(selected, option.label))}
                            disabled={disabled}
                            className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                        />
                        {option.label}
                    </label>
                ))}
            </div>
            {resolvedCatalog[group].filter(option => option.children?.length && selected.includes(option.label)).map(option => {
                const key = scopeModuleKey(group, option);
                const chosen = modules[key] || [];
                return (
                    <div key={key} className="border-l-2 border-emerald-200 pl-3 ml-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{group === 'systems' && option.id === 'triconex' ? 'Extra Scope' : `${option.label} sub-modules`}</p>
                        <div className="flex flex-wrap gap-2">
                            {option.children!.map(child => (
                                <label key={child.id} className={chip(chosen.includes(child.label))} style={chosen.includes(child.label) ? { backgroundColor: scopeOptionColor(child, 'submodule') } : undefined}>
                                    <input
                                        type="checkbox"
                                        checked={chosen.includes(child.label)}
                                        onChange={() => toggleModule(key, child.label)}
                                        disabled={disabled}
                                        className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                    />
                                    {child.label}
                                </label>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => disabled ? onClose() : handleSave()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200 max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest">
                        <Crosshair className="w-5 h-5 text-[#3DCD58]" />
                        Scope
                    </h3>
                    <button onClick={() => disabled ? onClose() : handleSave()} className="text-gray-400 hover:text-gray-600" title={disabled ? 'Close' : 'Save and close'}><X className="w-5 h-5" /></button>
                </div>

                {!sowNote ? (
                    <div className="p-8 text-center space-y-4">
                        <p className="text-sm text-gray-500">This opportunity has no SOW (Scope of Work) note yet. The scope lives in the SOW, so create it first.</p>
                        {!disabled && (
                            <button
                                onClick={() => { onCreateSowNote(); onClose(); }}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#3DCD58] text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-[#2db64a] transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Create SOW note
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="p-6 space-y-5 overflow-y-auto">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Proposal Description</label>
                                <textarea
                                    value={scope}
                                    onChange={(e) => setScope(e.target.value)}
                                    disabled={disabled}
                                    placeholder="Describe el alcance de la oportunidad..."
                                    className="w-full text-base leading-relaxed p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent min-h-[22vh] resize-y disabled:bg-gray-50"
                                />
                                <p className="text-[11px] text-gray-400 mt-1 italic">En este p&aacute;rrafo define de qu&eacute; trata el alcance y qu&eacute; se utiliz&oacute;. Sincronizado con la nota SOW.</p>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Type of Proposal</label>
                                <div className="flex flex-wrap gap-2">
                                    {resolvedCatalog.scope.map(option => (
                                        <label key={option.id} className={chip(scopeTypes.includes(option.label))} style={scopeTypes.includes(option.label) ? { backgroundColor: scopeOptionColor(option, 'scope') } : undefined}>
                                            <input
                                                type="checkbox"
                                                checked={scopeTypes.includes(option.label)}
                                                onChange={() => setScopeTypes(toggle(scopeTypes, option.label))}
                                                disabled={disabled}
                                                className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                            />
                                            {option.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Execution Center <span className="normal-case font-semibold text-gray-400">(optional — only if this proposal is quoted from more than one center)</span></label>
                                <div className="flex flex-wrap gap-2">
                                    {EXECUTION_CENTERS.map(center => (
                                        <label key={center} className={chip(executionCenter === center)} style={executionCenter === center ? { backgroundColor: '#64748b' } : undefined}>
                                            <input
                                                type="checkbox"
                                                checked={executionCenter === center}
                                                onChange={() => setExecutionCenter(prev => prev === center ? '' : center)}
                                                disabled={disabled}
                                                className="rounded border-gray-300 text-slate-600 focus:ring-slate-500"
                                            />
                                            {center}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">System</label>
                                {renderGroup('systems', systems, setSystems)}
                            </div>

                            {systems.some(label => resolvedCatalog.systems.find(option => option.label === label)?.id === 'triconex') && (
                                <div className="border-l-2 border-teal-200 pl-3 ml-1">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Application Safety</label>
                                    <div className="flex flex-wrap gap-2">
                                        {(resolvedCatalog.applications || []).map(option => (
                                            <label key={option.id} className={chip(applications.includes(option.label))} style={applications.includes(option.label) ? { backgroundColor: scopeOptionColor(option, 'applications') } : undefined}>
                                                <input type="checkbox" checked={applications.includes(option.label)} onChange={() => setApplications(toggle(applications, option.label))} disabled={disabled} className="rounded border-gray-300 text-teal-700 focus:ring-teal-600" />
                                                {option.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Extra Scope</label>
                                {renderGroup('quickNotes', quickNotes, setQuickNotes)}
                            </div>

                            {!!resolvedCatalog.extras.length && <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Labels / Extras</label>
                                <div className="flex flex-wrap gap-2">{resolvedCatalog.extras.map(option => <label key={option.id} className={chip(extras.some(value => scopeLabelKey(value) === scopeLabelKey(option.label)))} style={extras.some(value => scopeLabelKey(value) === scopeLabelKey(option.label)) ? { backgroundColor: scopeOptionColor(option, 'extra') } : undefined}><input type="checkbox" checked={extras.some(value => scopeLabelKey(value) === scopeLabelKey(option.label))} onChange={() => setExtras(toggle(extras, option.label))} disabled={disabled} className="rounded border-gray-300 text-slate-600 focus:ring-slate-500" />{option.label}</label>)}</div>
                                <p className="text-[11px] text-gray-400 mt-1 italic">Only historical labels that do not match another Scope option appear here.</p>
                                {(SCOPE_EXTRA_REFERENCE_IDS as readonly string[]).filter(id => {
                                    const option = resolvedCatalog.extras.find(o => o.id === id);
                                    return option && extras.some(value => scopeLabelKey(value) === scopeLabelKey(option.label));
                                }).map(id => {
                                    const option = resolvedCatalog.extras.find(o => o.id === id)!;
                                    return (
                                        <div key={id} className="mt-2">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{option.label} reference (expediente or link)</label>
                                            <input
                                                type="text"
                                                value={extraReferences[id] || ''}
                                                onChange={(e) => setExtraReferences(prev => ({ ...prev, [id]: e.target.value }))}
                                                disabled={disabled}
                                                placeholder="e.g. OPP-1234 or https://..."
                                                className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent disabled:bg-gray-50"
                                            />
                                        </div>
                                    );
                                })}
                            </div>}

                            <p className="text-[11px] text-gray-400 italic">These lists are shared with the SOW Base Data section. Add or remove options in Settings &rarr; Labels &amp; Scope.</p>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                            <button onClick={onClose} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-700">
                                {disabled ? 'Close' : 'Discard'}
                            </button>
                            {!disabled && (
                                <button onClick={handleSave} className="px-5 py-2 bg-[#3DCD58] text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-[#2db64a] transition-colors">
                                    Save
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ScopeQuickViewModal;
