import React, { useEffect, useRef, useState } from 'react';
import type { StickyNote } from '../types';
import type { GeneralQuickLink } from '../types';
import { Bookmark, BriefcaseBusiness, FileText, Folder, Globe2, GripVertical, Link2, Mail, Search, Star, X } from 'lucide-react';
import { openAbsolutePath } from '../features/opportunity-folder/fileOps';

interface Props {
    notes: StickyNote[];
    onNotesChange: (updater: (notes: StickyNote[]) => StickyNote[]) => void;
    /** Keep notes above the timer only while that control is visible. */
    timerVisible?: boolean;
}

export const StickyNotesWidget: React.FC<Props> = ({ notes, onNotesChange, timerVisible = true }) => {
    const [open, setOpen] = useState(false);
    const [newText, setNewText] = useState('');
    const [search, setSearch] = useState('');
    const [orderedNotes, setOrderedNotes] = useState(notes);
    const draggedNoteIdRef = useRef<string | null>(null);
    const isDraggingRef = useRef(false);
    useEffect(() => {
        if (!isDraggingRef.current) setOrderedNotes(notes);
    }, [notes]);
    const visibleNotes = search.trim()
        ? orderedNotes.filter(note => note.content.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        : orderedNotes;

    useEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [open]);

    const addNote = () => {
        if (!newText.trim()) return;
        onNotesChange(prev => [{ id: crypto.randomUUID(), content: newText.trim(), createdAt: new Date().toISOString() }, ...prev]);
        setNewText('');
    };
    const deleteNote = (id: string) => onNotesChange(prev => prev.filter(n => n.id !== id));
    const updateNote = (id: string, content: string) => onNotesChange(prev => prev.map(n => n.id === id ? { ...n, content } : n));

    const previewNoteMove = (overId: string) => {
        const draggedId = draggedNoteIdRef.current;
        if (!draggedId || draggedId === overId) return;
        setOrderedNotes(current => {
            const from = current.findIndex(note => note.id === draggedId);
            const to = current.findIndex(note => note.id === overId);
            if (from < 0 || to < 0) return current;
            const next = [...current];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const saveNoteOrder = () => {
        const ids = orderedNotes.map(note => note.id);
        onNotesChange(current => {
            const latestById = new Map(current.map(note => [note.id, note]));
            const reordered = ids.map(id => latestById.get(id)).filter((note): note is StickyNote => !!note);
            const known = new Set(ids);
            return [...reordered, ...current.filter(note => !known.has(note.id))];
        });
        draggedNoteIdRef.current = null;
        isDraggingRef.current = false;
    };

    const insertAtCursor = (text: string) => {
        const el = document.getElementById('sticky-new-input') as HTMLTextAreaElement | null;
        if (!el) { setNewText(t => t + text); return; }
        const start = el.selectionStart ?? newText.length;
        const end = el.selectionEnd ?? start;
        const next = newText.slice(0, start) + text + newText.slice(end);
        setNewText(next);
        setTimeout(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); }, 0);
    };

    // Render note content with bold + checklist
    const renderContent = (raw: string, noteId: string) =>
        raw.split('\n').map((line, li) => {
            const hr = line.match(/^-{3,}$/);
            if (hr) return <hr key={li} className="border-yellow-300 my-1" />;
            const checkMatch = line.match(/^- \[([ x])\] (.*)/);
            if (checkMatch) {
                const checked = checkMatch[1] === 'x';
                const label = checkMatch[2];
                return (
                    <div key={li} className="flex items-start gap-1.5 my-0.5">
                        <input
                            type="checkbox" checked={checked}
                            onChange={() => {
                                const lines = raw.split('\n');
                                lines[li] = checked ? `- [ ] ${label}` : `- [x] ${label}`;
                                updateNote(noteId, lines.join('\n'));
                            }}
                            className="mt-0.5 accent-yellow-500 cursor-pointer"
                        />
                        <span className={`text-xs ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{label}</span>
                    </div>
                );
            }
            const parts = line.split(/(\*\*[^*]+\*\*)/);
            return (
                <p key={li} className="text-xs text-gray-700 leading-relaxed break-all min-h-[1em]">
                    {parts.map((p, pi) => p.startsWith('**') && p.endsWith('**')
                        ? <strong key={pi}>{p.slice(2, -2)}</strong>
                        : p
                    )}
                </p>
            );
        });

    // Pill (always visible, above timer) — toggles panel open/closed
    const notesBottom = timerVisible ? 'bottom-20' : 'bottom-4';
    const panelBottom = timerVisible ? 'bottom-20' : 'bottom-4';
    const pill = (
        <div
            className={`fixed ${notesBottom} right-4 z-[101] flex items-center gap-2 bg-yellow-400 text-yellow-900 px-3 py-1.5 rounded-full shadow-xl cursor-pointer hover:bg-yellow-500 transition-all select-none font-black text-xs border-2 border-yellow-300 animate-in fade-in zoom-in duration-300`}
            onClick={() => setOpen(prev => !prev)}
            title={open ? 'Close Sticky Notes' : 'Open Sticky Notes'}
        >
            📌 <span>{notes.length}</span>
        </div>
    );

    if (!open) return pill;

    return (
        <>
            {pill}
            <div className={`fixed ${panelBottom} right-20 z-[102] w-80 bg-white rounded-2xl shadow-2xl border border-yellow-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300`} style={{ maxHeight: '70vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-yellow-50 border-b border-yellow-200 select-none">
                    <span className="font-black text-yellow-800 text-sm flex items-center gap-2">
                        📌 Sticky Notes
                        <span className="text-[9px] font-bold text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded-full">{notes.length}</span>
                    </span>
                    <button onClick={() => setOpen(false)} className="text-yellow-500 hover:text-yellow-900 font-bold text-lg leading-none" title="Close">×</button>
                </div>

                <div className="px-3 pt-2 bg-yellow-50/20">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-yellow-700" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes"
                            className="w-full rounded-lg border border-yellow-200 bg-white py-1.5 pl-7 pr-7 text-[11px] text-gray-700 outline-none placeholder:text-gray-400 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-300" />
                        {search && <button type="button" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-yellow-100 hover:text-yellow-800" title="Clear search"><X className="h-3 w-3" /></button>}
                    </div>
                </div>

                {/* Toolbar */}
                <div className="px-3 pt-2 pb-1 flex gap-1.5 border-b border-yellow-100 flex-wrap">
                    <button
                        onClick={() => insertAtCursor('**bold**')}
                        className="text-[10px] font-black px-2 py-0.5 bg-yellow-100 hover:bg-yellow-200 rounded border border-yellow-200 text-yellow-800"
                        title="Bold"
                    ><strong>B</strong></button>
                    <button
                        onClick={() => insertAtCursor((newText.endsWith('\n') || newText === '' ? '' : '\n') + '- [ ] ')}
                        className="text-[10px] px-2 py-0.5 bg-yellow-100 hover:bg-yellow-200 rounded border border-yellow-200 text-yellow-800"
                        title="Checklist item"
                    >☑</button>
                    <button
                        onClick={() => insertAtCursor((newText.endsWith('\n') || newText === '' ? '' : '\n') + '---\n')}
                        className="text-[10px] px-2 py-0.5 bg-yellow-100 hover:bg-yellow-200 rounded border border-yellow-200 text-yellow-800 font-mono tracking-tighter"
                        title="Separator line"
                    >───</button>
                    <span className="text-[9px] text-gray-400 self-center ml-auto">⌘+Enter to add</span>
                </div>

                {/* New note input */}
                <div className="p-3 border-b border-yellow-100 flex gap-2">
                    <textarea
                        id="sticky-new-input"
                        placeholder="Write a note..."
                        value={newText}
                        onChange={e => setNewText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }}
                        className="flex-1 text-xs border border-yellow-200 rounded-lg p-2 resize-none focus:ring-1 focus:ring-yellow-300 outline-none bg-yellow-50/60"
                        rows={3}
                    />
                    <button onClick={addNote} className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-lg text-xs font-black hover:bg-yellow-500 transition-colors self-end shadow-sm">Add</button>
                </div>

                {/* Notes list */}
                <div className="overflow-y-auto flex-1 p-3 space-y-2 bg-yellow-50/20">
                    {notes.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No sticky notes yet.</p>}
                    {notes.length > 0 && visibleNotes.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No matching notes.</p>}
                    {visibleNotes.map(note => (
                        <div key={note.id} onDragOver={event => event.preventDefault()} onDragEnter={() => previewNoteMove(note.id)} onDrop={event => { event.preventDefault(); saveNoteOrder(); }} className={`bg-yellow-50 border border-yellow-200 rounded-xl shadow-sm group transition ${draggedNoteIdRef.current === note.id ? 'opacity-50 ring-2 ring-yellow-400' : ''}`}>
                            {!search.trim() && <div className="flex justify-center border-b border-yellow-100 py-0.5">
                                <button type="button" draggable onDragStart={event => {
                                    draggedNoteIdRef.current = note.id;
                                    isDraggingRef.current = true;
                                    event.dataTransfer.effectAllowed = 'move';
                                    event.dataTransfer.setData('text/plain', note.id);
                                }} onDragEnd={saveNoteOrder} className="cursor-grab text-yellow-500 hover:text-yellow-800 active:cursor-grabbing" title="Drag to reorder" aria-label="Drag note to reorder">
                                    <GripVertical className="h-4 w-4" />
                                </button>
                            </div>}
                            <div className="p-2">{renderContent(note.content, note.id)}</div>
                            <details>
                                <summary className="text-[9px] font-bold text-yellow-600 cursor-pointer px-2 pb-1 list-none hover:text-yellow-800">Edit ▾</summary>
                                <div className="px-2 pb-2">
                                    <textarea
                                        value={note.content}
                                        onChange={e => updateNote(note.id, e.target.value)}
                                        className="w-full text-xs text-gray-700 bg-white border border-yellow-200 rounded-lg p-2 resize-none focus:ring-1 focus:ring-yellow-300 outline-none"
                                        rows={Math.max(2, note.content.split('\n').length)}
                                    />
                                </div>
                            </details>
                            <div className="flex items-center justify-between px-2 pb-1.5">
                                <span className="text-[9px] text-gray-400">{new Date(note.createdAt).toLocaleDateString()}</span>
                                <button onClick={() => deleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-[9px] font-bold transition-opacity">Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};

export const GENERAL_QUICK_LINK_ICON_OPTIONS = [
    { id: 'link', label: 'Link', Icon: Link2 },
    { id: 'globe', label: 'Globe', Icon: Globe2 },
    { id: 'folder', label: 'Folder', Icon: Folder },
    { id: 'bookmark', label: 'Bookmark', Icon: Bookmark },
    { id: 'briefcase', label: 'Briefcase', Icon: BriefcaseBusiness },
    { id: 'file', label: 'File', Icon: FileText },
    { id: 'mail', label: 'Mail', Icon: Mail },
    { id: 'star', label: 'Star', Icon: Star },
] as const;

const getLocalPath = (target: string): string | null => {
    const value = target.trim();
    if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) return value;
    if (!value.toLowerCase().startsWith('file://')) return null;
    try {
        const url = new URL(value);
        return decodeURIComponent(url.pathname).replace(/^\/+([a-zA-Z]:)/, '$1').replace(/\//g, '\\');
    } catch { return null; }
};

const openQuickLink = async (target: string) => {
    const localPath = getLocalPath(target);
    if (localPath) {
        try { await openAbsolutePath(localPath); }
        catch (err: any) { alert(err?.message || 'Could not open the local file or folder.'); }
        return;
    }
    try {
        const url = new URL(target);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch { alert('Enter a valid web URL or an absolute Windows path.'); }
};

export const GeneralQuickLinksWidget: React.FC<{ links: GeneralQuickLink[]; timerVisible?: boolean }> = ({ links, timerVisible = true }) => {
    if (!links.length) return null;
    // Sits one step above the sticky-notes pill, which itself sits above the timer. When the timer
    // is hidden the whole stack drops by one slot — it must not land on bottom-4 or it would
    // overlap the pill.
    return (
        <div className={`fixed ${timerVisible ? 'bottom-32' : 'bottom-16'} right-4 z-[100] flex flex-col items-end gap-2.5 py-1`}>
            {links.map(link => {
                const Icon = GENERAL_QUICK_LINK_ICON_OPTIONS.find(option => option.id === link.icon)?.Icon || Link2;
                return (
                    <button key={link.id} type="button" onClick={() => { void openQuickLink(link.url); }}
                        title={link.name} aria-label={`Open ${link.name}`}
                        className="group flex h-10 w-10 items-center justify-center rounded-full border border-white/80 text-white shadow-md transition-all hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-1 focus:ring-offset-1"
                        style={{ backgroundColor: link.color || '#3DCD58', boxShadow: `0 3px 8px ${link.color || '#3DCD58'}30` }}>
                        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                        <span className="pointer-events-none absolute right-full mr-3 max-w-64 whitespace-normal rounded-md bg-gray-900 px-3 py-2 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">{link.name}</span>
                    </button>
                );
            })}
        </div>
    );
};
