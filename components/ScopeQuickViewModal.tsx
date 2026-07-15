import React, { useMemo, useState } from 'react';
import { X, Crosshair, Plus } from 'lucide-react';
import { MeetingNote } from '../types';

export const SOW_PLATFORM_OPTIONS: { key: string; label: string }[] = [
    { key: 'platform_modicon', label: 'Modicon PLC' },
    { key: 'platform_triconex', label: 'Triconex SIS' },
    { key: 'platform_foxboro', label: 'Foxboro DCS' },
    { key: 'platform_other', label: 'Other / AVEVA / Cyber' },
];

export const SOW_OPP_TYPES = ['Greenfield', 'Modernization', 'Migration', 'Upgrade', 'Expansion', 'Services only', 'Mixed'];

const parseSowFields = (note: MeetingNote | null): Record<string, any> => {
    if (!note?.content) return {};
    try {
        const parsed = JSON.parse(note.content);
        return parsed && typeof parsed === 'object' && parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
    } catch {
        return {};
    }
};

/**
 * Mirrors the SOW iframe's syncChangedKey logic (sowTemplate.html) so edits made
 * here keep the guided-flow answers (flow_T001 platforms, flow_B008 opp type)
 * consistent with the platform checkboxes and opp_type select.
 */
const buildMirroredFlowKeys = (fields: Record<string, any>, platforms: Record<string, boolean>, oppType: string) => {
    const t001 = new Set<string>(Array.isArray(fields.flow_T001) ? fields.flow_T001 : []);
    (['Modicon', 'Triconex', 'Foxboro'] as const).forEach(name => {
        if (platforms[`platform_${name.toLowerCase()}`]) t001.add(name); else t001.delete(name);
    });
    if (platforms.platform_other) {
        if (!t001.has('AVEVA') && !t001.has('Cyber')) t001.add('AVEVA');
    } else {
        t001.delete('AVEVA');
        t001.delete('Cyber');
    }
    const b008 = new Set<string>(Array.isArray(fields.flow_B008) ? fields.flow_B008 : []);
    if (oppType) b008.add(oppType);
    return { flow_T001: [...t001], flow_B008: [...b008] };
};

interface Props {
    sowNote: MeetingNote | null;
    disabled?: boolean;
    onSaveFields: (patch: Record<string, unknown>) => void;
    onCreateSowNote: () => void;
    onClose: () => void;
}

const ScopeQuickViewModal: React.FC<Props> = ({ sowNote, disabled = false, onSaveFields, onCreateSowNote, onClose }) => {
    const fields = useMemo(() => parseSowFields(sowNote), [sowNote]);
    const [scope, setScope] = useState<string>(typeof fields.scope_summary === 'string' ? fields.scope_summary : '');
    const [oppType, setOppType] = useState<string>(typeof fields.opp_type === 'string' ? fields.opp_type : '');
    const [platforms, setPlatforms] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(SOW_PLATFORM_OPTIONS.map(p => [p.key, fields[p.key] === true]))
    );

    const handleSave = () => {
        onSaveFields({
            scope_summary: scope,
            opp_type: oppType,
            ...platforms,
            ...buildMirroredFlowKeys(fields, platforms, oppType),
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200 max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest">
                        <Crosshair className="w-5 h-5 text-[#3DCD58]" />
                        Scope
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
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
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Scope (Alcance)</label>
                                <textarea
                                    value={scope}
                                    onChange={(e) => setScope(e.target.value)}
                                    disabled={disabled}
                                    placeholder="Describe el alcance de la oportunidad..."
                                    className="w-full text-lg leading-relaxed p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent min-h-[40vh] resize-y disabled:bg-gray-50"
                                />
                                <p className="text-[11px] text-gray-400 mt-1 italic">En este p&aacute;rrafo define de qu&eacute; trata el alcance y qu&eacute; se utiliz&oacute;. Sincronizado con la nota SOW.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Opportunity Type</label>
                                    <select
                                        value={oppType}
                                        onChange={(e) => setOppType(e.target.value)}
                                        disabled={disabled}
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent text-sm font-bold disabled:bg-gray-50"
                                    >
                                        <option value=""></option>
                                        {SOW_OPP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Platforms Included</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SOW_PLATFORM_OPTIONS.map(p => (
                                            <label key={p.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${platforms[p.key] ? 'bg-emerald-50 border-emerald-200 text-[#2db64a]' : 'bg-gray-50 border-gray-200 text-gray-500'} ${disabled ? 'opacity-60 cursor-default' : 'hover:border-emerald-300'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={platforms[p.key]}
                                                    onChange={(e) => setPlatforms(prev => ({ ...prev, [p.key]: e.target.checked }))}
                                                    disabled={disabled}
                                                    className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                                />
                                                {p.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                            <button onClick={onClose} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-700">
                                {disabled ? 'Close' : 'Cancel'}
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
