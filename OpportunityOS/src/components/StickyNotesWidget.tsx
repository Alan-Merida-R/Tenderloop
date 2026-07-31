import React, { useState, useEffect } from 'react';

interface StickyNote { id: string; content: string; createdAt: string; }
const STICKY_KEY = 'tenderloop.stickynotes.v1';

function loadNotes(): StickyNote[] {
    try { return JSON.parse(localStorage.getItem(STICKY_KEY) || '[]'); } catch { return []; }
}

export const StickyNotesWidget: React.FC = () => {
    const [notes, setNotes] = useState<StickyNote[]>(loadNotes);
    const [open, setOpen] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const [newText, setNewText] = useState('');

    useEffect(() => { localStorage.setItem(STICKY_KEY, JSON.stringify(notes)); }, [notes]);

    const addNote = () => {
        if (!newText.trim()) return;
        setNotes(prev => [{ id: crypto.randomUUID(), content: newText.trim(), createdAt: new Date().toISOString() }, ...prev]);
        setNewText('');
    };
    const deleteNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));
    const updateNote = (id: string, content: string) => setNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));

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
    const pill = (
        <div
            className="fixed bottom-20 right-4 z-[101] flex items-center gap-2 bg-yellow-400 text-yellow-900 px-3 py-1.5 rounded-full shadow-xl cursor-pointer hover:bg-yellow-500 transition-all select-none font-black text-xs border-2 border-yellow-300 animate-in fade-in zoom-in duration-300"
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
            <div className="fixed bottom-20 right-20 z-[102] w-80 bg-white rounded-2xl shadow-2xl border border-yellow-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300" style={{ maxHeight: '70vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-yellow-50 border-b border-yellow-200 select-none">
                    <span className="font-black text-yellow-800 text-sm flex items-center gap-2">
                        📌 Sticky Notes
                        <span className="text-[9px] font-bold text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded-full">{notes.length}</span>
                    </span>
                    <button onClick={() => setOpen(false)} className="text-yellow-500 hover:text-yellow-900 font-bold text-lg leading-none" title="Close">×</button>
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
                    {notes.map(note => (
                        <div key={note.id} className="bg-yellow-50 border border-yellow-200 rounded-xl shadow-sm group">
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
