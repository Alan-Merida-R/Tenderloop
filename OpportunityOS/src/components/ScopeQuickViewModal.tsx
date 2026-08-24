import React, { useEffect, useMemo, useState } from 'react';
import { X, Crosshair, Plus } from 'lucide-react';
import { MeetingNote, OpportunityLabel } from '../types';
import { ScopeCatalog, DEFAULT_SCOPE_CATALOG, normalizeScopeCatalog, scopeModuleKey, scopeOptionColor, scopeLabelKey, catalogContainsLabel } from './scopeCatalog';
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

/** platform_* still drives the SOW's 4A/4B/4C platform sections, so it follows the System answer. */
const platformMirror = (systems: string[]): Record<string, boolean> => {
    const known: Array<[string, RegExp]> = [['platform_modicon', /modicon/i], ['platform_triconex', /tricon/i], ['platform_foxboro', /foxboro/i]];
    const mirror: Record<string, boolean> = {};
    known.forEach(([key, test]) => { mirror[key] = systems.some(name => test.test(name)); });
    mirror.platform_other = systems.some(name => !known.some(([, test]) => test.test(name)));
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
    const quickNotesFromSow = useMemo(() => selectedFromFields(fields, 'quick_notes', resolvedCatalog.quickNotes), [fields, resolvedCatalog]);
    const extrasFromSow = useMemo(() => {
        const direct = selectedFromFields(fields, 'scope_extras', resolvedCatalog.extras);
        const legacy = legacyLabels.filter(label => !catalogContainsLabel(resolvedCatalog, label.text)).map(label => label.text);
        return Array.from(new Set([...direct, ...legacy]));
    }, [fields, resolvedCatalog, legacyLabels]);
    // One flat map of sub-module answers, keyed exactly like the SOW stores them
    // (Triconex keeps `triconex_products` so pre-catalog answers survive).
    const modulesFromSow = useMemo(() => modulesFromFields(fields, resolvedCatalog), [fields, resolvedCatalog]);

    const [scopeTypes, setScopeTypes] = useState<string[]>(scopeTypesFromSow);
    const [systems, setSystems] = useState<string[]>(systemsFromSow);
    const [quickNotes, setQuickNotes] = useState<string[]>(quickNotesFromSow);
    const [extras, setExtras] = useState<string[]>(extrasFromSow);
    const [modules, setModules] = useState<Record<string, string[]>>(modulesFromSow);
    useEffect(() => { setScope(scopeFromSow); }, [scopeFromSow]);
    useEffect(() => { setScopeTypes(scopeTypesFromSow); }, [scopeTypesFromSow]);
    useEffect(() => { setSystems(systemsFromSow); }, [systemsFromSow]);
    useEffect(() => { setQuickNotes(quickNotesFromSow); }, [quickNotesFromSow]);
    useEffect(() => { setExtras(extrasFromSow); }, [extrasFromSow]);
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
            quick_notes: quickNotes,
            scope_extras: extras,
            // Sub-modules are written even when their parent is unselected, matching the SOW's
            // "hidden answers are preserved" rule — re-checking the parent brings them back.
            ...modules,
            ...platformMirror(systems),
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
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{option.label} sub-modules</p>
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
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Scope description</label>
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
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Scope</label>
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
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">System</label>
                                {renderGroup('systems', systems, setSystems)}
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Notes at a glance</label>
                                {renderGroup('quickNotes', quickNotes, setQuickNotes)}
                            </div>

                            {!!resolvedCatalog.extras.length && <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Labels / Extras</label>
                                <div className="flex flex-wrap gap-2">{resolvedCatalog.extras.map(option => <label key={option.id} className={chip(extras.some(value => scopeLabelKey(value) === scopeLabelKey(option.label)))} style={extras.some(value => scopeLabelKey(value) === scopeLabelKey(option.label)) ? { backgroundColor: scopeOptionColor(option, 'extra') } : undefined}><input type="checkbox" checked={extras.some(value => scopeLabelKey(value) === scopeLabelKey(option.label))} onChange={() => setExtras(toggle(extras, option.label))} disabled={disabled} className="rounded border-gray-300 text-slate-600 focus:ring-slate-500" />{option.label}</label>)}</div>
                                <p className="text-[11px] text-gray-400 mt-1 italic">Only historical labels that do not match another Scope option appear here.</p>
                            </div>}

                            <p className="text-[11px] text-gray-400 italic">These three lists are the same ones the SOW asks in Base Data. Add or remove options in Settings &rarr; Labels &amp; Scope.</p>
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
