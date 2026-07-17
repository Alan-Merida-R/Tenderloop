import React, { useEffect, useMemo, useState } from 'react';
import { X, CheckSquare, Square, FileText, Link as LinkIcon, Layers3 } from 'lucide-react';
import { MeetingNote, QuickLinkItem } from '../types';

type QuickLinkCandidate = {
    id: string;
    label: string;
    url: string;
};

interface RevisionCarryoverModalProps {
    isOpen: boolean;
    sourceLabel: string;
    notes: MeetingNote[];
    defaultLinks: QuickLinkCandidate[];
    customLinks: QuickLinkItem[];
    onClose: () => void;
    onApply: (selection: { noteIds: string[]; defaultLinkIds: string[]; customLinkIds: string[] }) => void;
}

const noteSortValue = (note: MeetingNote) => `${note.date || ''} ${note.title || ''}`;

export const RevisionCarryoverModal: React.FC<RevisionCarryoverModalProps> = ({
    isOpen,
    sourceLabel,
    notes,
    defaultLinks,
    customLinks,
    onClose,
    onApply
}) => {
    const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
    const [selectedDefaultLinkIds, setSelectedDefaultLinkIds] = useState<string[]>([]);
    const [selectedCustomLinkIds, setSelectedCustomLinkIds] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedNoteIds([]);
        setSelectedDefaultLinkIds([]);
        setSelectedCustomLinkIds([]);
    }, [isOpen, sourceLabel]);

    const sortedNotes = useMemo(() => [...notes].sort((a, b) => noteSortValue(a).localeCompare(noteSortValue(b))), [notes]);

    if (!isOpen) return null;

    const toggle = (id: string, setSelected: React.Dispatch<React.SetStateAction<string[]>>) => {
        setSelected(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
    };

    const selectAll = (ids: string[], setSelected: React.Dispatch<React.SetStateAction<string[]>>) => {
        setSelected(prev => prev.length === ids.length ? [] : ids);
    };

    const apply = () => {
        onApply({
            noteIds: selectedNoteIds,
            defaultLinkIds: selectedDefaultLinkIds,
            customLinkIds: selectedCustomLinkIds
        });
    };

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-gray-800 flex items-center gap-2">
                            <Layers3 className="w-5 h-5 text-[#3DCD58]" />
                            Carry over from {sourceLabel}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">Pick the notes and quick links you want to reuse in the new revision.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-400" /> Notes
                            </h4>
                            <button
                                type="button"
                                onClick={() => selectAll(sortedNotes.map(n => n.id), setSelectedNoteIds)}
                                className="text-[10px] font-bold text-[#3DCD58] hover:underline"
                            >
                                {selectedNoteIds.length === sortedNotes.length && sortedNotes.length > 0 ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        {sortedNotes.length === 0 ? (
                            <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl p-4">No notes available in the source revision.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {sortedNotes.map(note => {
                                    const checked = selectedNoteIds.includes(note.id);
                                    return (
                                        <button
                                            key={note.id}
                                            type="button"
                                            onClick={() => toggle(note.id, setSelectedNoteIds)}
                                            className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${checked ? 'border-[#3DCD58] bg-[#3DCD58]/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                        >
                                            {checked ? <CheckSquare className="w-4 h-4 text-[#3DCD58] shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />}
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-gray-800 truncate">{note.title}</div>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                                                    {note.type} {note.date ? `• ${note.date}` : ''}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                <LinkIcon className="w-4 h-4 text-gray-400" /> Quick Links
                            </h4>
                            <button
                                type="button"
                                onClick={() => selectAll(defaultLinks.map(l => l.id), setSelectedDefaultLinkIds)}
                                className="text-[10px] font-bold text-[#3DCD58] hover:underline"
                            >
                                {selectedDefaultLinkIds.length === defaultLinks.length && defaultLinks.length > 0 ? 'Deselect Defaults' : 'Select Defaults'}
                            </button>
                        </div>

                        {defaultLinks.length === 0 ? (
                            <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl p-4">No default quick links were found in the source revision.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {defaultLinks.map(link => {
                                    const checked = selectedDefaultLinkIds.includes(link.id);
                                    return (
                                        <button
                                            key={link.id}
                                            type="button"
                                            onClick={() => toggle(link.id, setSelectedDefaultLinkIds)}
                                            className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${checked ? 'border-[#3DCD58] bg-[#3DCD58]/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                        >
                                            {checked ? <CheckSquare className="w-4 h-4 text-[#3DCD58] shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />}
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-gray-800 truncate">{link.label}</div>
                                                <div className="text-[10px] font-mono text-gray-400 truncate mt-1">{link.url}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {customLinks.length > 0 && (
                            <div className="pt-2 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Custom Links</span>
                                    <button
                                        type="button"
                                        onClick={() => selectAll(customLinks.map(l => l.id), setSelectedCustomLinkIds)}
                                        className="text-[10px] font-bold text-[#3DCD58] hover:underline"
                                    >
                                        {selectedCustomLinkIds.length === customLinks.length && customLinks.length > 0 ? 'Deselect Custom' : 'Select Custom'}
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {customLinks.map(link => {
                                        const checked = selectedCustomLinkIds.includes(link.id);
                                        return (
                                            <button
                                                key={link.id}
                                                type="button"
                                                onClick={() => toggle(link.id, setSelectedCustomLinkIds)}
                                                className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${checked ? 'border-[#3DCD58] bg-[#3DCD58]/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                            >
                                                {checked ? <CheckSquare className="w-4 h-4 text-[#3DCD58] shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />}
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold text-gray-800 truncate">{link.label}</div>
                                                    <div className="text-[10px] font-mono text-gray-400 truncate mt-1">{link.url || '—'}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-100 transition-all">
                        Keep Blank
                    </button>
                    <button
                        onClick={apply}
                        className="px-4 py-2 rounded-xl bg-[#3DCD58] text-white font-bold hover:bg-[#2db64a] transition-all shadow-sm"
                    >
                        Apply Selected
                    </button>
                </div>
            </div>
        </div>
    );
};
