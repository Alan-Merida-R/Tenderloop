
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
/* Added Subtask to imports */
import { Opportunity, ProcessStage, STAGE_COLORS, Task, Subtask, CommercialRow, TaskStatus, TASK_STATUS_COLORS, TaskOwner, ExternalArea, TaskPriority, HistoryEntry, PrdPresentation, STATUS_COLORS, OpportunityStatus, Question, MeetingNote, Commercial, QuickLinks, KPIs, KPIArea, InlineTask, DayType, AreaDayRecord, KPITimeline } from '../types';
import { ArrowLeft, ExternalLink, Save, Plus, Trash2, Copy, FileText, CheckSquare, DollarSign, ListChecks, Bold, Heading1, List as ListIcon, ListOrdered, User, Search, AlignLeft, CheckCircle, Table, Type, Italic, Calendar as CalendarIcon, X, Clock, History as HistoryIcon, Presentation, FileDown, Briefcase, Zap, HelpCircle, GripVertical, Maximize2, Minimize2, MessageCircle, SplitSquareHorizontal, ChevronUp, ChevronDown, Highlighter, Link, Unlink, Eraser, FolderOpen, AlertCircle, Link as LinkIcon, Columns, LayoutGrid, Filter, RotateCcw, Lock, ArrowUpDown, BarChart3, Target, CalendarDays, Timer, ChevronLeft, ChevronRight, Edit3 } from 'lucide-react';
import { OpportunityFolderTab } from '../features/opportunity-folder/OpportunityFolderTab';
import { LinkedDocsList } from '../features/doc-links/LinkedDocsList';
import { DocumentPickerModal } from '../features/doc-links/DocumentPickerModal';
import { saveMeta, listLinkedForNote, listLinkedForTask } from '../services/opportunityDocMetaStore';
import { CalendarView } from './CalendarView';
import { OpportunityExportImportButtons } from '../features/opportunity-export/OpportunityExportImportButtons';
import { NoteTemplate, SimpleMultiSelect } from './SettingsModal';
import { countBusinessDays, countCalendarDays } from '../services/dateUtils';

// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface Props {
    opportunity: Opportunity;
    onBack: () => void;
    onUpdate: (updated: Opportunity) => void;
    onDelete: () => void;
    noteTemplates?: NoteTemplate[];
    holidays?: string[];
    trackedAreas?: string[];
}

export interface RichTextEditorHandle {
    highlightSelection: (id: string, text: string) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, { content: string, onChange: (val: string) => void, onSelection?: () => void, onLinkClick?: (id: string) => void, onAttach?: () => void }>(
    ({ content, onChange, onSelection, onLinkClick, onAttach }, ref) => {
        const editorRef = useRef<HTMLDivElement>(null);
        const isInternalUpdate = useRef(false);

        useImperativeHandle(ref, () => ({
            highlightSelection: (id: string, text: string) => {
                const html = `<span class="question-highlight" data-question-id="${id}">${text}</span>`;
                document.execCommand('insertHTML', false, html);
                if (editorRef.current) {
                    onChange(editorRef.current.innerHTML);
                }
            }
        }));

        useEffect(() => {
            if (editorRef.current) {
                const currentHTML = editorRef.current.innerHTML;
                if (content !== currentHTML && !isInternalUpdate.current) {
                    editorRef.current.innerHTML = content || '';
                }
                isInternalUpdate.current = false;
            }
        }, [content]);

        const exec = (command: string, value: string | undefined = undefined) => {
            if (editorRef.current) editorRef.current.focus();
            document.execCommand(command, false, value);
            if (editorRef.current) {
                isInternalUpdate.current = true;
                onChange(editorRef.current.innerHTML);
            }
        };

        const insertHtml = (html: string) => {
            exec('insertHTML', html);
        };

        const highlightColor = (color: string) => {
            exec('hiliteColor', color);
        };

        const addLink = () => {
            const url = window.prompt('Enter URL:');
            if (url) {
                if (editorRef.current) editorRef.current.focus();
                exec('createLink', url);
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
            }
        };

        const handleClick = (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.dataset.questionId && onLinkClick) {
                onLinkClick(target.dataset.questionId);
            }
            if (target.tagName === 'A') {
                const href = (target as HTMLAnchorElement).getAttribute('href');
                if (href) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                }
            }
        };

        const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
            isInternalUpdate.current = true;
            onChange(e.currentTarget.innerHTML);
        };

        return (
            <div className="flex flex-col h-full relative">
                <div className="flex items-center gap-1 border-b border-gray-200 p-2 bg-gray-50 overflow-x-auto shrink-0 select-none">
                    <button onClick={() => exec('formatBlock', 'H1')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Heading 1"><Heading1 className="w-4 h-4" /></button>
                    <button onClick={() => exec('bold')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Bold"><Bold className="w-4 h-4" /></button>
                    <button onClick={() => exec('italic')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Italic"><Italic className="w-4 h-4" /></button>
                    <button onClick={() => exec('removeFormat')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Clear Formatting"><Eraser className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button onClick={addLink} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Insert Link"><Link className="w-4 h-4" /></button>
                    <button onClick={() => exec('unlink')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Remove Link"><Unlink className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button onClick={onAttach} className="p-1.5 hover:bg-gray-200 rounded text-[#3DCD58] flex items-center gap-1" title="Attach Doc"><LinkIcon className="w-4 h-4" /> <span className="text-[10px] font-bold uppercase">Attach</span></button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <div className="flex gap-1 items-center bg-white px-1 rounded border border-gray-200">
                        <button onClick={() => highlightColor('#fca5a5')} className="w-4 h-4 rounded-full bg-red-300 hover:scale-110 transition-transform"></button>
                        <button onClick={() => highlightColor('#fde047')} className="w-4 h-4 rounded-full bg-yellow-300 hover:scale-110 transition-transform"></button>
                        <button onClick={() => highlightColor('#86efac')} className="w-4 h-4 rounded-full bg-green-300 hover:scale-110 transition-transform"></button>
                        <button onClick={() => highlightColor('#93c5fd')} className="w-4 h-4 rounded-full bg-blue-300 hover:scale-110 transition-transform"></button>
                    </div>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button onClick={() => exec('insertUnorderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Bullet List"><ListIcon className="w-4 h-4" /></button>
                    <button onClick={() => exec('insertOrderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Numbered List"><ListOrdered className="w-4 h-4" /></button>
                    <button onClick={() => insertHtml('<input type="checkbox"> ')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Checkbox"><CheckCircle className="w-4 h-4" /></button>
                    <button onClick={() => insertHtml('<hr>')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Divider">_</button>
                </div>
                <div
                    ref={editorRef}
                    className="flex-1 p-6 overflow-y-auto focus:outline-none text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none min-h-0 editor-content bg-white"
                    contentEditable
                    onInput={handleInput}
                    onMouseUp={onSelection}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    suppressContentEditableWarning={true}
                    style={{ listStylePosition: 'inside' }}
                />
                <style>{`
                .editor-content ul { list-style-type: disc; margin-left: 1.5em; }
                .editor-content ol { list-style-type: decimal; margin-left: 1.5em; }
                .editor-content a { color: #3b82f6; text-decoration: underline; cursor: pointer; }
                .question-highlight { border-bottom: 2px solid #3DCD58; background-color: rgba(61, 205, 88, 0.1); cursor: pointer; font-weight: 500; transition: background-color 0.2s; }
                .question-highlight { border-bottom: 2px solid #3DCD58; background-color: rgba(61, 205, 88, 0.1); cursor: pointer; font-weight: 500; transition: background-color 0.2s; }
                .question-highlight:hover { background-color: rgba(61, 205, 88, 0.4); }
                .editor-content h1 { font-size: 1.5em; font-weight: bold; margin-top: 0.5em; margin-bottom: 0.25em; }
            `}</style>
            </div>
        );
    });

const MultiSelect = ({ options, selected, onChange, placeholder }: { options: string[], selected: string[], onChange: (val: string[]) => void, placeholder: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 flex justify-between items-center text-gray-600 shadow-sm hover:bg-gray-50 min-w-[140px]">
                <span className="truncate">{selected.length ? `${selected.length} selected` : placeholder}</span>
                <ChevronDown className="w-3 h-3" />
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full left-0 w-48 mt-1 bg-white border border-gray-200 shadow-lg z-20 max-h-40 overflow-y-auto rounded-lg p-1">
                        {options.map(opt => (
                            <div key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer rounded" onClick={() => {
                                if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
                                else onChange([...selected, opt]);
                            }}>
                                <div className={`w-3 h-3 border rounded flex items-center justify-center ${selected.includes(opt) ? 'bg-[#3DCD58] border-[#3DCD58]' : 'border-gray-300'}`}>
                                    {selected.includes(opt) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                <span className="text-xs">{opt}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

const HistoryEventsModal = ({
    date,
    history,
    onAdd,
    onEdit,
    onDelete,
    onClose
}: {
    date: string,
    history: HistoryEntry[],
    onAdd: (content: string) => void,
    onEdit: (id: string, content: string) => void,
    onDelete: (id: string) => void,
    onClose: () => void
}) => {
    const [isEditing, setIsEditing] = useState<string | null>(null); // Entry ID or 'new'
    const [editContent, setEditContent] = useState('');

    const dayEntries = history.filter(h => h.date.split('T')[0] === date);

    const handleSave = () => {
        if (!editContent.trim()) return;
        if (isEditing === 'new') {
            onAdd(editContent);
        } else if (isEditing) {
            onEdit(isEditing, editContent);
        }
        setIsEditing(null);
        setEditContent('');
    };

    return (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-black text-gray-800 flex items-center gap-2">
                        <HistoryIcon className="w-5 h-5 text-[#3DCD58]" />
                        History Events — {date}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {isEditing ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Event Description</label>
                                <textarea
                                    className="w-full h-32 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent text-sm resize-none"
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSave} className="flex-1 bg-[#3DCD58] text-white py-2.5 rounded-xl font-bold hover:bg-[#2db64a] transition-all">Save Event</button>
                                <button onClick={() => setIsEditing(null)} className="flex-1 bg-white border border-gray-200 text-gray-600 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {dayEntries.length > 0 ? (
                                <div className="space-y-3">
                                    {dayEntries.map((h, i) => (
                                        <div key={h.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 relative group">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] font-black text-[#3DCD58] uppercase">Event #{i + 1}</span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setIsEditing(h.id); setEditContent(h.content); }} className="p-1 hover:bg-white rounded text-gray-400 hover:text-blue-500 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                                                    <button onClick={() => { if (confirm("Delete this event?")) onDelete(h.id); }} className="p-1 hover:bg-white rounded text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-700 leading-relaxed">{h.content}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No history events for this date</p>
                                </div>
                            )}
                            <button
                                onClick={() => { setIsEditing('new'); setEditContent(''); }}
                                className="w-full mt-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs font-black uppercase tracking-widest hover:border-[#3DCD58] hover:text-[#3DCD58] transition-all flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Add Event
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AddAreaModal = ({
    availableAreas,
    onAdd,
    onClose
}: {
    availableAreas: string[],
    onAdd: (area: string) => void,
    onClose: () => void
}) => {
    const [selectedArea, setSelectedArea] = useState(availableAreas[0] || '');

    return (
        <div className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-black text-gray-800 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-purple-600" />
                        Add New Area
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-4">
                    {availableAreas.length > 0 ? (
                        <>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Select Area to Add</label>
                                <select
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm font-bold"
                                    value={selectedArea}
                                    onChange={(e) => setSelectedArea(e.target.value)}
                                >
                                    {availableAreas.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => onAdd(selectedArea)} className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg active:scale-95">Add Area</button>
                                <button onClick={onClose} className="flex-1 bg-white border border-gray-200 text-gray-600 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all">Cancel</button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-sm font-bold text-gray-500">All available areas have been added.</p>
                            <button onClick={onClose} className="mt-4 w-full bg-gray-900 text-white py-2.5 rounded-xl font-bold">Close</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const KpiCalendarModal = ({
    area,
    onClose,
    onSave,
    suggestedWaitingDates,
    holidays,
    history = [],
    onNavigateToHistory,
    onAddHistory,
    onEditHistory,
    onDeleteHistory
}: {
    area: KPIArea,
    onClose: () => void,
    onSave: (calendar: Record<string, AreaDayRecord>) => void,
    suggestedWaitingDates: string[],
    holidays: string[],
    history?: HistoryEntry[],
    onNavigateToHistory?: (eventId: string) => void,
    onAddHistory: (date: string, content: string) => void,
    onEditHistory: (id: string, content: string) => void,
    onDeleteHistory: (id: string) => void
}) => {
    const [calendar, setCalendar] = useState<Record<string, AreaDayRecord>>(area.calendar || {});
    const [viewDate, setViewDate] = useState(new Date());
    const [selectionStart, setSelectionStart] = useState<string | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<string | null>(null);
    const [viewingHistoryDate, setViewingHistoryDate] = useState<string | null>(null);

    const isTendering = area.area === 'Tendering';

    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(Date.UTC(year, month, 1));
        const days = [];
        const firstDay = date.getUTCDay();

        for (let i = 0; i < firstDay; i++) {
            const prev = new Date(Date.UTC(year, month, -i));
            days.unshift({ date: prev.toISOString().split('T')[0], isCurrent: false });
        }

        while (date.getUTCMonth() === month) {
            days.push({ date: date.toISOString().split('T')[0], isCurrent: true });
            date.setUTCDate(date.getUTCDate() + 1);
        }

        while (days.length % 7 !== 0) {
            days.push({ date: date.toISOString().split('T')[0], isCurrent: false });
            date.setUTCDate(date.getUTCDate() + 1);
        }

        return days;
    };

    const monthDays = getDaysInMonth(viewDate.getUTCFullYear(), viewDate.getUTCMonth());

    const handleDayClick = (date: string, shift: boolean) => {
        if (!selectionStart || (selectionStart && selectionEnd) || shift === false) {
            setSelectionStart(date);
            setSelectionEnd(null);
        } else {
            setSelectionEnd(date);
        }
    };

    const applyType = (type: DayType | null) => {
        const start = selectionStart || selectionEnd;
        const end = selectionEnd || selectionStart;
        if (!start || !end) return;

        const d1 = new Date(start < end ? start : end);
        const d2 = new Date(start < end ? end : start);
        const newCal = { ...calendar };

        let it = new Date(d1);
        while (it <= d2) {
            const dateStr = it.toISOString().split('T')[0];
            if (type === null) {
                delete newCal[dateStr];
            } else {
                newCal[dateStr] = { ...newCal[dateStr], type };
            }
            it.setUTCDate(it.getUTCDate() + 1);
        }
        setCalendar(newCal);
        setSelectionStart(null);
        setSelectionEnd(null);
    };

    const updateHours = (date: string, hours: number) => {
        setCalendar(prev => ({
            ...prev,
            [date]: { ...(prev[date] || { type: 'Worked' }), hours, type: hours > 0 ? 'Worked' : (prev[date]?.type || 'Worked') }
        }));
    };

    const applySuggestions = () => {
        if (!confirm("This will suggest Waiting days based on History and Inactive status for weekends/holidays. Continue?")) return;
        const newCal = { ...calendar };
        suggestedWaitingDates.forEach(d => {
            if (!newCal[d]) newCal[d] = { type: 'Waiting' };
        });

        monthDays.forEach(d => {
            const isHoliday = holidays.includes(d.date);
            const dayOfWeek = new Date(d.date).getUTCDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            if (isHoliday || isWeekend) {
                if (!newCal[d.date]) newCal[d.date] = { type: 'Inactive' };
            }
        });

        setCalendar(newCal);
    };

    const isInSelection = (date: string) => {
        if (!selectionStart) return false;
        if (!selectionEnd) return date === selectionStart;
        const s = selectionStart < selectionEnd ? selectionStart : selectionEnd;
        const e = selectionStart < selectionEnd ? selectionEnd : selectionStart;
        return date >= s && date <= e;
    };

    const changeMonth = (offset: number) => {
        const next = new Date(viewDate);
        next.setUTCMonth(next.getUTCMonth() + offset);
        setViewDate(next);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-4">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <CalendarIcon className="w-5 h-5 text-blue-500" />
                            Calendar: {area.area}
                        </h2>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
                            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-50 rounded"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
                            <span className="text-sm font-bold w-32 text-center text-gray-700 capitalize">
                                {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-50 rounded"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={applySuggestions} className="text-[10px] font-bold bg-yellow-50 text-yellow-700 px-3 py-1 rounded border border-yellow-200 hover:bg-yellow-100">Apply Suggestions</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase py-1">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-3">
                        {monthDays.map(d => {
                            const date = d.date;
                            const record = calendar[date];
                            const isSelected = isInSelection(date);
                            const isHoliday = holidays.includes(date);
                            const dayOfWeek = new Date(date).getUTCDay();
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                            const dayHistory = history.filter(h => h.date.split('T')[0] === date);

                            return (
                                <div
                                    key={date}
                                    onClick={(e) => handleDayClick(date, e.shiftKey)}
                                    className={`relative p-2 h-24 border rounded-xl flex flex-col transition-all group ${!d.isCurrent ? 'bg-gray-50/50 opacity-40' : 'bg-white'
                                        } ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10' : 'border-gray-100 hover:border-blue-200'} cursor-pointer shadow-sm hover:shadow-md`}
                                >
                                    <div className="flex justify-between items-start w-full">
                                        <span className={`text-[10px] font-black ${isWeekend || isHoliday ? 'text-red-400' : 'text-gray-400'}`}>
                                            {new Date(date).getUTCDate()}
                                        </span>
                                        {dayHistory.length > 0 && (
                                            <div className="flex gap-0.5">
                                                {dayHistory.map((h, i) => (
                                                    <div
                                                        key={i}
                                                        onClick={(e) => { e.stopPropagation(); setViewingHistoryDate(date); }}
                                                        title="Click to view history events"
                                                        className="w-2 h-2 rounded-full bg-[#3DCD58] shadow-sm hover:scale-150 transition-transform cursor-help"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${record?.type === 'Worked' ? 'bg-blue-100 border-blue-500 text-blue-700' :
                                            record?.type === 'Waiting' ? 'bg-yellow-100 border-yellow-500 text-yellow-700' :
                                                record?.type === 'Inactive' ? 'bg-red-100 border-red-500 text-red-700' :
                                                    'bg-transparent border-transparent'
                                            }`}>
                                            {record?.type === 'Worked' ? <Zap className="w-4 h-4" /> :
                                                record?.type === 'Waiting' ? <Clock className="w-4 h-4" /> :
                                                    record?.type === 'Inactive' ? <X className="w-4 h-4" /> :
                                                        null}
                                        </div>

                                        {isTendering && (
                                            <div className="flex items-center gap-0.5 mt-0.5">
                                                <input
                                                    type="number"
                                                    placeholder="h"
                                                    className="w-8 text-[10px] text-center border-none bg-transparent focus:ring-0 font-bold p-0"
                                                    value={record?.hours || ''}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => updateHours(date, parseFloat(e.target.value) || 0)}
                                                />
                                                <span className="text-[8px] text-gray-400 font-black uppercase">h</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                    <div className="flex gap-2">
                        <button onClick={() => applyType('Worked')} className="flex items-center gap-1 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors shadow-sm">Mark Worked</button>
                        <button onClick={() => applyType('Waiting')} className="flex items-center gap-1 bg-yellow-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-600 transition-colors shadow-sm">Mark Waiting</button>
                        <button onClick={() => applyType('Inactive')} className="flex items-center gap-1 bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 transition-colors shadow-sm">Mark Inactive</button>
                        <button onClick={() => applyType(null)} className="flex items-center gap-1 bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors ml-4 shadow-sm">Clear</button>
                    </div>
                    <button onClick={() => onSave(calendar)} className="bg-[#3DCD58] text-white px-8 py-2.5 rounded-xl font-bold shadow-lg hover:bg-[#2db64a] transition-all active:scale-95 flex items-center gap-2">
                        <Save className="w-4 h-4" /> Save Calendar
                    </button>
                </div>
            </div>

            {viewingHistoryDate && (
                <HistoryEventsModal
                    date={viewingHistoryDate}
                    history={history}
                    onAdd={(content) => onAddHistory(viewingHistoryDate, content)}
                    onEdit={onEditHistory}
                    onDelete={onDeleteHistory}
                    onClose={() => setViewingHistoryDate(null)}
                />
            )}
        </div>
    );
};

const FullCalendarModal = ({
    areas,
    onClose,
    onSaveAreaCalendar,
    onAddArea,
    onRemoveArea,
    holidays,
    history = [],
    onAddHistory,
    onEditHistory,
    onDeleteHistory,
    trackedAreas,
    timeline,
    onUpdateTimeline
}: {
    areas: KPIArea[],
    onClose: () => void,
    onSaveAreaCalendar: (areaId: string, calendar: Record<string, AreaDayRecord>) => void,
    onAddArea: (area: string) => void,
    onRemoveArea: (id: string) => void,
    holidays: string[],
    history?: HistoryEntry[],
    onAddHistory: (date: string, content: string) => void,
    onEditHistory: (id: string, content: string) => void,
    onDeleteHistory: (id: string) => void,
    trackedAreas: string[],
    timeline: KPITimeline,
    onUpdateTimeline: (field: keyof KPITimeline, value: string | null) => void
}) => {
    const [viewDate, setViewDate] = useState(new Date());
    const [viewingHistoryDate, setViewingHistoryDate] = useState<string | null>(null);
    const [isInternalAddAreaOpen, setIsInternalAddAreaOpen] = useState(false);

    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(Date.UTC(year, month, 1));
        const days = [];
        while (date.getUTCMonth() === month) {
            days.push(date.toISOString().split('T')[0]);
            date.setUTCDate(date.getUTCDate() + 1);
        }
        return days;
    };

    const days = getDaysInMonth(viewDate.getUTCFullYear(), viewDate.getUTCMonth());

    const changeMonth = (offset: number) => {
        const next = new Date(viewDate);
        next.setUTCMonth(next.getUTCMonth() + offset);
        setViewDate(next);
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] h-[95vh] flex flex-col overflow-hidden animate-fade-in border border-gray-100">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50/80">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                                <Table className="w-7 h-7 text-purple-600" />
                                Implementation Timeline
                            </h2>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Full Calendar / Project Management View</p>
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm">
                            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors"><ChevronLeft className="w-6 h-6 text-gray-600" /></button>
                            <span className="text-xl font-black w-56 text-center text-gray-700 capitalize">
                                {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors"><ChevronRight className="w-6 h-6 text-gray-600" /></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsInternalAddAreaOpen(true)}
                            className="bg-white border-2 border-purple-500 text-purple-600 px-6 py-2.5 rounded-xl font-black shadow-sm hover:bg-purple-50 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Plus className="w-5 h-5" /> Add New Area
                        </button>
                        <button onClick={onClose} className="p-3 hover:bg-red-50 hover:text-red-500 rounded-full transition-all text-gray-400"><X className="w-8 h-8" /></button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar for Timeline & Execution */}
                    <div className="w-72 border-r bg-gray-50/50 p-6 flex flex-col gap-6 overflow-y-auto">
                        <div>
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <Timer className="w-4 h-4 text-purple-500" />
                                Execution Status
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Received At</label>
                                    <input
                                        type="date"
                                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-all"
                                        value={timeline.receivedAt || ''}
                                        onChange={(e) => onUpdateTimeline('receivedAt', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Delivered At</label>
                                    <input
                                        type="date"
                                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-bold focus:ring-2 focus:ring-[#3DCD58] transition-all"
                                        value={timeline.deliveredAt || ''}
                                        onChange={(e) => onUpdateTimeline('deliveredAt', e.target.value)}
                                    />
                                </div>
                                <div className="pt-4 border-t border-gray-100">
                                    <label className="block text-[10px] font-black text-red-400 uppercase tracking-widest mb-1.5">Cancelled At</label>
                                    <input
                                        type="date"
                                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-bold focus:ring-2 focus:ring-red-500 transition-all"
                                        value={timeline.cancelledAt || ''}
                                        onChange={(e) => onUpdateTimeline('cancelledAt', e.target.value)}
                                    />
                                </div>
                                {timeline.cancelledAt && (
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Reason Header</label>
                                        <textarea
                                            className="w-full h-24 bg-white border border-gray-200 rounded-xl p-2.5 text-sm font-bold focus:ring-2 focus:ring-red-500 transition-all resize-none"
                                            placeholder="Why was it cancelled?"
                                            value={timeline.cancelledReason || ''}
                                            onChange={(e) => onUpdateTimeline('cancelledReason', e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-auto p-4 bg-purple-50 rounded-2xl border border-purple-100">
                            <p className="text-[10px] font-black text-purple-600 uppercase leading-relaxed text-center">
                                All changes in this view are immediate and persistent.
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-4 bg-gray-50/20 shadow-inner">
                        <div className="min-w-max pb-4">
                            <div
                                className="grid gap-px bg-gray-200 border border-gray-200 rounded-2xl overflow-hidden shadow-xl"
                                style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(60px, 1fr))` }}
                            >
                                {/* Header */}
                                <div className="bg-gray-50 p-4 text-[11px] font-black text-gray-400 uppercase tracking-widest border-r flex items-center justify-between">
                                    Area Name
                                    <Filter className="w-3 h-3" />
                                </div>
                                {days.map(d => {
                                    const isHoliday = holidays.includes(d);
                                    const dayOfWeek = new Date(d).getUTCDay();
                                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                    return (
                                        <div key={d} className={`p-2 text-center border-l transition-colors ${isWeekend || isHoliday ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
                                            <div className="text-[10px] font-black uppercase">{new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}</div>
                                            <div className="text-sm font-black">{new Date(d).getUTCDate()}</div>
                                        </div>
                                    );
                                })}

                                {/* History Indicators Row */}
                                <div className="bg-white p-4 text-[10px] font-black text-[#3DCD58] uppercase flex items-center gap-2 border-r border-t bg-gray-50/30">
                                    <HistoryIcon className="w-4 h-4" /> History Events
                                </div>
                                {days.map(d => {
                                    const dayHistory = history.filter(h => h.date.split('T')[0] === d);
                                    return (
                                        <div
                                            key={d}
                                            onClick={() => setViewingHistoryDate(d)}
                                            className="bg-white border-l border-t flex items-center justify-center min-h-[48px] cursor-pointer hover:bg-[#3DCD58]/5 group transition-all"
                                            title="Click to manage history events"
                                        >
                                            {dayHistory.length > 0 ? (
                                                <div className="flex gap-1">
                                                    {dayHistory.map((h, i) => (
                                                        <div key={i} title={h.content} className="w-3 h-3 rounded-full bg-[#3DCD58] shadow-sm transform group-hover:scale-125 transition-transform" />
                                                    ))}
                                                </div>
                                            ) : (
                                                <Plus className="w-4 h-4 text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Area Rows */}
                                {areas.map(area => (
                                    <React.Fragment key={area.id}>
                                        <div className="bg-white p-4 text-sm font-black text-gray-700 border-r border-t flex flex-col justify-center relative group">
                                            <div className="flex items-center justify-between group">
                                                <span className="truncate pr-2">{area.area}</span>
                                                <button
                                                    onClick={() => onRemoveArea(area.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-red-400 hover:text-red-500 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="text-[10px] text-[#3DCD58] bg-[#3DCD58]/10 px-2 py-0.5 rounded-full font-black uppercase">{area.daysSpent}d Work</span>
                                                {area.waitingDays > 0 && <span className="text-[10px] text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full font-black uppercase">{area.waitingDays}d Wait</span>}
                                            </div>
                                        </div>
                                        {days.map(d => {
                                            const record = (area.calendar?.[d]) as AreaDayRecord | undefined;
                                            return (
                                                <div
                                                    key={d}
                                                    className={`border-l border-t h-20 flex flex-col items-center justify-center transition-all cursor-pointer hover:scale-[1.02] hover:z-10 hover:shadow-inner ${record?.type === 'Worked' ? 'bg-blue-50/40' :
                                                        record?.type === 'Waiting' ? 'bg-yellow-50/40' :
                                                            record?.type === 'Inactive' ? 'bg-red-50/30' :
                                                                'bg-white'
                                                        }`}
                                                    onClick={() => {
                                                        const currentType = record?.type;
                                                        const nextType: DayType | null =
                                                            !currentType ? 'Worked' :
                                                                currentType === 'Worked' ? 'Waiting' :
                                                                    currentType === 'Waiting' ? 'Inactive' :
                                                                        null;

                                                        const newCal = { ...(area.calendar || {}) };
                                                        if (nextType === null) delete newCal[d];
                                                        else newCal[d] = { ...newCal[d], type: nextType };
                                                        onSaveAreaCalendar(area.id, newCal);
                                                    }}
                                                >
                                                    {record?.type === 'Worked' && (
                                                        <div className="flex flex-col items-center gap-1 animate-in fade-in zoom-in duration-300">
                                                            <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md">
                                                                <Zap className="w-4 h-4" />
                                                            </div>
                                                            {area.area === 'Tendering' && (
                                                                <div className="flex items-center gap-1 mt-1 px-1 bg-blue-50/50 rounded-lg border border-blue-100/50" onClick={(e) => e.stopPropagation()}>
                                                                    <input
                                                                        type="number"
                                                                        className="w-7 text-[10px] text-center border-none bg-transparent focus:ring-0 font-black p-0 h-4 text-blue-700"
                                                                        placeholder="0"
                                                                        value={(record as AreaDayRecord).hours || ''}
                                                                        onChange={(e) => {
                                                                            const val = parseFloat(e.target.value) || 0;
                                                                            const newCal = { ...(area.calendar || {}) };
                                                                            newCal[d] = { ...newCal[d], hours: val, type: 'Worked' };
                                                                            onSaveAreaCalendar(area.id, newCal);
                                                                        }}
                                                                    />
                                                                    <span className="text-[8px] font-black text-blue-400 uppercase">h</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {record?.type === 'Waiting' && (
                                                        <div className="w-7 h-7 rounded-full bg-yellow-500 text-white flex items-center justify-center shadow-md animate-in fade-in zoom-in duration-300">
                                                            <Clock className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                    {record?.type === 'Inactive' && (
                                                        <div className="w-7 h-7 rounded-full bg-red-100 text-red-500 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                                                            <X className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t bg-gray-50 flex justify-between items-center shadow-2xl">
                        <div className="flex gap-10">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg"><Zap className="w-5 h-5 text-white" /></div>
                                <span className="text-[11px] font-black uppercase text-gray-500 tracking-widest">Worked Day</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-yellow-500 rounded-xl flex items-center justify-center shadow-lg"><Clock className="w-5 h-5 text-white" /></div>
                                <span className="text-[11px] font-black uppercase text-gray-500 tracking-widest">Waiting Day</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center border-2 border-red-200"><X className="w-5 h-5 text-red-500" /></div>
                                <span className="text-[11px] font-black uppercase text-gray-500 tracking-widest">Inactive / Holiday</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <p className="text-[10px] font-black text-gray-400 bg-white px-4 py-2 rounded-xl border border-gray-200 italic shadow-sm">
                                Tip: Continuous work blocks create the project execution flow.
                            </p>
                            <button onClick={onClose} className="bg-gray-900 text-white px-10 py-3.5 rounded-2xl font-black shadow-2xl hover:bg-black transition-all active:scale-95 text-lg">Close Dashboard</button>
                        </div>
                    </div>
                </div>

                {viewingHistoryDate && (
                    <HistoryEventsModal
                        date={viewingHistoryDate}
                        history={history}
                        onAdd={(content) => onAddHistory(viewingHistoryDate, content)}
                        onEdit={onEditHistory}
                        onDelete={onDeleteHistory}
                        onClose={() => setViewingHistoryDate(null)}
                    />
                )}

                {isInternalAddAreaOpen && (
                    <AddAreaModal
                        availableAreas={(trackedAreas || []).filter(ta => !areas.some(a => a.area === ta))}
                        onAdd={(areaName) => {
                            onAddArea(areaName);
                            setIsInternalAddAreaOpen(false);
                        }}
                        onClose={() => setIsInternalAddAreaOpen(false)}
                    />
                )}
            </div>
        </div >
    );
};

const OpportunityDetail: React.FC<Props> = ({ opportunity, onBack, onUpdate, onDelete, noteTemplates = [], holidays = [], trackedAreas = [] }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'commercial' | 'notes' | 'tasks' | 'questions' | 'history' | 'presentation' | 'folder' | 'kpi'>('overview');
    const [editingAreaCalendar, setEditingAreaCalendar] = useState<string | null>(null); // Area ID
    const [showFullCalendar, setShowFullCalendar] = useState(false);
    const [showAddAreaModal, setShowAddAreaModal] = useState(false);
    const [localOpp, setLocalOpp] = useState<Opportunity>(opportunity);
    const [searchTerm, setSearchTerm] = useState('');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const noteEditorRef = useRef<RichTextEditorHandle>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [isNoteFullScreen, setIsNoteFullScreen] = useState(false);
    const [textSelection, setTextSelection] = useState<string | null>(null);
    const [showQuestionsSplit, setShowQuestionsSplit] = useState(false);
    const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<{ task: Task } | null>(null);
    const [taskViewMode, setTaskViewMode] = useState<'list' | 'calendar'>('list');
    const [taskFilter, setTaskFilter] = useState('');
    const filterKey = `opportunityTasksFilters:${opportunity.id}`;
    const [taskStatusFilters, setTaskStatusFilters] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(filterKey);
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [highlightedQuestionId, setHighlightedQuestionId] = useState<string | null>(null);
    const [showDocPicker, setShowDocPicker] = useState<{ type: 'task' | 'note'; id: string } | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const [showNotePickerForTask, setShowNotePickerForTask] = useState<string | null>(null);
    const [noteSearch, setNoteSearch] = useState('');
    const [selectedNotesToLink, setSelectedNotesToLink] = useState<string[]>([]);

    const [splitViewNoteId, setSplitViewNoteId] = useState<string | null>(null);
    const [taskSort, setTaskSort] = useState<'none' | 'dueDate' | 'order'>('none');
    const [folderNavTarget, setFolderNavTarget] = useState<string | null>(null);

    useEffect(() => {
        setLocalOpp(opportunity);
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTo(0, 0);
    }, [opportunity]);

    useEffect(() => {
        localStorage.setItem(filterKey, JSON.stringify(taskStatusFilters));
    }, [taskStatusFilters, filterKey]);

    const handleFieldChange = (field: keyof Opportunity, value: any) => {
        const updated = { ...localOpp, [field]: value, lastUpdated: new Date().toISOString() };
        setLocalOpp(updated);
        onUpdate(updated, opportunity.id);
    };

    const updateOfficialSellPrice = (value: number) => {
        const newCommercial = { ...localOpp.commercial, cqaOfficialSellPrice: value };
        const newKpis = { ...localOpp.kpis, proposalAmountUSD: value };
        const updated = { ...localOpp, commercial: newCommercial, kpis: newKpis, lastUpdated: new Date().toISOString() };
        setLocalOpp(updated);
        onUpdate(updated, opportunity.id);
    };

    const updateKpiField = (path: string, value: any) => {
        const newKpis = JSON.parse(JSON.stringify(localOpp.kpis));

        if (path.includes('.')) {
            const parts = path.split('.');
            // @ts-ignore
            newKpis[parts[0]][parts[1]] = value;
        } else {
            // @ts-ignore
            newKpis[path] = value;
        }

        let updatedOpp = { ...localOpp, kpis: newKpis, lastUpdated: new Date().toISOString() };

        // Sync Logic for Proposal Amount -> CQA Official Sell
        if (path === 'proposalAmountUSD') {
            updatedOpp.commercial = {
                ...updatedOpp.commercial,
                cqaOfficialSellPrice: Number(value)
            };
        }

        setLocalOpp(updatedOpp);
        onUpdate(updatedOpp, opportunity.id);
    };

    const filteredNotes = localOpp.notes.filter(n => {
        const term = searchTerm.toLowerCase();
        const plainContent = n.content.replace(/<[^>]*>/g, '').toLowerCase();
        return n.title.toLowerCase().includes(term) || plainContent.includes(term);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const filteredTasks = localOpp.tasks.filter(t => {
        const matchesText = t.title.toLowerCase().includes(taskFilter.toLowerCase()) ||
            t.description.toLowerCase().includes(taskFilter.toLowerCase()) ||
            (t.externalAreas && t.externalAreas.some(area => area.toLowerCase().includes(taskFilter.toLowerCase())));
        const matchesStatus = taskStatusFilters.length === 0 || taskStatusFilters.includes(t.status);
        return matchesText && matchesStatus;
    }).sort((a, b) => {
        if (taskSort === 'dueDate') {
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        if (taskSort === 'order') {
            return (a.order || 999999) - (b.order || 999999);
        }
        return 0;
    });

    const displayValue = (val: number) => val === 0 ? '' : val;
    const updateCommercialRow = (rowKey: 'swHw' | 'services' | 'resale', field: keyof CommercialRow, value: number) => {
        const currentRow = localOpp.commercial[rowKey];
        let newRow = { ...currentRow, [field]: value };
        if (field === 'cost' || field === 'margin') {
            if (newRow.margin < 100) newRow.sellPrice = Number((newRow.cost / (1 - (newRow.margin / 100))).toFixed(2));
        }
        if (field === 'sellPrice') {
            if (newRow.sellPrice !== 0) newRow.margin = Number(((1 - (newRow.cost / newRow.sellPrice)) * 100).toFixed(2));
            else newRow.margin = 0;
        }
        newRow.finalPrice = Number((newRow.sellPrice * (1 - (newRow.discount / 100))).toFixed(2));
        const updated = { ...localOpp, commercial: { ...localOpp.commercial, [rowKey]: newRow } };
        setLocalOpp(updated);
        onUpdate(updated);
    };
    const totals = ['swHw', 'services', 'resale'].reduce((acc, key) => {
        const row = localOpp.commercial[key as 'swHw'];
        acc.cost += row.cost; acc.sellPrice += row.sellPrice; acc.finalPrice += row.finalPrice;
        return acc;
    }, { cost: 0, sellPrice: 0, finalPrice: 0 });
    const totalMargin = totals.sellPrice ? ((1 - (totals.cost / totals.sellPrice)) * 100).toFixed(1) : '0';

    const addNote = (templateTitle?: string, content?: string) => {
        const newNote: MeetingNote = {
            id: crypto.randomUUID(),
            title: templateTitle ? `New ${templateTitle}` : 'New Note',
            date: new Date().toISOString().split('T')[0],
            type: 'General',
            attendees: '',
            content: content || '',
            inlineTasks: []
        };
        const updated = { ...localOpp, notes: [newNote, ...localOpp.notes] };
        setLocalOpp(updated); onUpdate(updated); setSelectedNoteId(newNote.id);
    };

    const deleteNote = (noteId: string) => {
        if (!window.confirm("Are you sure you want to delete this note?")) return;
        const updatedNotes = localOpp.notes.filter(n => n.id !== noteId);
        const updated = { ...localOpp, notes: updatedNotes };
        setLocalOpp(updated); onUpdate(updated);
        if (selectedNoteId === noteId) setSelectedNoteId(null);
    };
    const updateSelectedNote = (field: keyof MeetingNote, value: string) => {
        if (!selectedNoteId) return;
        const updatedNotes = localOpp.notes.map(n => n.id === selectedNoteId ? { ...n, [field]: value } : n);
        handleFieldChange('notes', updatedNotes);
    };
    const updateNoteById = (noteId: string, field: keyof MeetingNote, value: string) => {
        const updatedNotes = localOpp.notes.map(n => n.id === noteId ? { ...n, [field]: value } : n);
        handleFieldChange('notes', updatedNotes);
    }
    const handleSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) setTextSelection(selection.toString());
        else setTextSelection(null);
    };
    const handleLinkClick = (questionId: string) => {
        setShowQuestionsSplit(true); setHighlightedQuestionId(questionId);
    };
    const getLinkedTasksForNote = (noteId: string) => {
        return localOpp.tasks.filter(t => (t.linkedNoteIds || []).includes(noteId) || t.linkedNoteId === noteId);
    };

    const addQuestion = (sourceId: string, quote: string) => {
        const newId = crypto.randomUUID();
        if (noteEditorRef.current) noteEditorRef.current.highlightSelection(newId, quote);
        const newQ: Question = {
            id: newId, sourceId, sourceType: 'note', quote, question: 'New Question...', answer: '', isResolved: false, createdAt: new Date().toISOString()
        };
        const updated = { ...localOpp, questions: [...(localOpp.questions || []), newQ] };
        setLocalOpp(updated); onUpdate(updated);
        setShowQuestionsSplit(true); setHighlightedQuestionId(newId); setTextSelection(null);
    };
    const updateQuestion = (qId: string, field: keyof Question, value: any) => {
        const updatedQs = localOpp.questions.map(q => q.id === qId ? { ...q, [field]: value } : q);
        handleFieldChange('questions', updatedQs);
    };

    const addHistoryEntry = (date?: string, content?: string) => {
        const newEntry: HistoryEntry = {
            id: crypto.randomUUID(),
            date: date || new Date().toISOString().split('T')[0],
            content: content || 'New event...'
        };
        const updatedHistory = [...(localOpp.history || []), newEntry].sort((a, b) => b.date.localeCompare(a.date));
        handleFieldChange('history', updatedHistory);
    };
    const updateHistoryEntry = (id: string, field: keyof HistoryEntry, value: string) => {
        const updatedHistory = (localOpp.history || []).map(h => h.id === id ? { ...h, [field]: value } : h);
        if (field === 'date') updatedHistory.sort((a, b) => b.date.localeCompare(a.date));
        handleFieldChange('history', updatedHistory);
    };
    const totalElapsedCalendarDays = localOpp.kpis?.timeline.deliveredAt
        ? countCalendarDays(localOpp.kpis.timeline.receivedAt, localOpp.kpis.timeline.deliveredAt)
        : countCalendarDays(localOpp.kpis.timeline.receivedAt, new Date().toISOString().split('T')[0]);

    const executionUniqueDays = React.useMemo(() => {
        const uniqueDates = new Set<string>();
        (localOpp.kpis?.areasInvolved || []).forEach(area => {
            if (area.calendar) {
                Object.entries(area.calendar).forEach(([date, record]) => {
                    const r = record as AreaDayRecord;
                    if (r.type === 'Worked') {
                        if (area.area === 'Tendering') {
                            if ((r.hours || 0) >= 1) uniqueDates.add(date);
                        } else {
                            uniqueDates.add(date);
                        }
                    }
                });
            }
        });
        return uniqueDates.size;
    }, [localOpp.kpis?.areasInvolved]);

    const deleteHistoryEntry = (id: string) => {
        if (!window.confirm("Are you sure?")) return;
        const updatedHistory = (localOpp.history || []).filter(h => h.id !== id);
        handleFieldChange('history', updatedHistory);
    };
    const copyHistoryToClipboard = () => {
        const text = `Summary of SR history:\n` + (localOpp.history || []).sort((a, b) => a.date.localeCompare(b.date)).map(h => `${h.date}\n${h.content}`).join('\n');
        navigator.clipboard.writeText(text); alert("History copied to clipboard for bFO.");
    };

    const addKpiArea = (area: string) => {
        if (!area) return;
        if ((localOpp.kpis?.areasInvolved || []).some(a => a.area === area)) {
            alert("This area is already being tracked.");
            return;
        }
        const newArea: KPIArea = { id: crypto.randomUUID(), area, daysSpent: 0, waitingDays: 0, calendar: {} };
        const baseKpis = localOpp.kpis || { languageSkill: 0, technicalUnderstanding: 0, dealProbability: 0, sold: null, proposalAmountUSD: 0, timeline: { receivedAt: new Date().toISOString().split('T')[0], deliveredAt: null, cancelledAt: null, cancelledReason: null }, execution: { myWorkDays: 0, waitingOnOthersDays: 0 }, areasInvolved: [] };
        const updated = { ...localOpp, kpis: { ...baseKpis, areasInvolved: [...(baseKpis.areasInvolved || []), newArea] } };
        setLocalOpp(updated); onUpdate(updated);
    };

    const updateKpiArea = (id: string, field: keyof KPIArea, value: any) => {
        const newAreas = (localOpp.kpis?.areasInvolved || []).map(a => a.id === id ? { ...a, [field]: value } : a);
        updateKpiField('areasInvolved', newAreas);
    };

    const removeKpiArea = (id: string) => {
        const newAreas = (localOpp.kpis?.areasInvolved || []).filter(a => a.id !== id);
        updateKpiField('areasInvolved', newAreas);
    };

    const handleSaveAreaCalendar = (areaId: string, calendar: Record<string, AreaDayRecord>) => {
        const area = localOpp.kpis?.areasInvolved.find(a => a.id === areaId);
        if (!area) return;

        let worked = 0;
        let waiting = 0;
        Object.values(calendar).forEach(r => {
            if (r.type === 'Worked') {
                if (area.area === 'Tendering') {
                    if ((r.hours || 0) >= 1) worked++;
                } else {
                    worked++;
                }
            } else if (r.type === 'Waiting') {
                waiting++;
            }
        });

        const newAreas = (localOpp.kpis?.areasInvolved || []).map(a => a.id === areaId ? { ...a, calendar, daysSpent: worked, waitingDays: waiting } : a);
        updateKpiField('areasInvolved', newAreas);
        setEditingAreaCalendar(null);
    };

    const totalAreaDays = (localOpp.kpis?.areasInvolved || []).reduce((sum, a) => sum + (a.daysSpent || 0), 0);

    const suggestWaitingDaysFromHistory = () => {
        const waitingKeywords = ['on hold', 'waiting for', 'missing information', 'pending response'];
        const suggestedDates = new Set<string>();
        (localOpp.history || []).forEach(h => {
            const content = h.content.toLowerCase();
            if (waitingKeywords.some(key => content.includes(key))) {
                suggestedDates.add(h.date.split('T')[0]);
            }
        });
        return Array.from(suggestedDates);
    };

    // Validation value for Business Days elapsed (workable time)
    const totalElapsedBusinessDays = localOpp.kpis?.timeline.deliveredAt
        ? countBusinessDays(localOpp.kpis.timeline.receivedAt, localOpp.kpis.timeline.deliveredAt, holidays)
        : countBusinessDays(localOpp.kpis.timeline.receivedAt, new Date().toISOString().split('T')[0], holidays);

    const totalTrackedDays = (localOpp.kpis?.execution.myWorkDays || 0) +
        (localOpp.kpis?.execution.waitingOnOthersDays || 0) +
        (localOpp.kpis?.areasInvolved || []).reduce((sum, a) => sum + (a.daysSpent || 0), 0);

    const addTask = () => {
        const newTask: Task = {
            id: crypto.randomUUID(), title: 'New Task', description: '', status: 'Pending', priority: 'Medium', owner: 'Me',
            externalAreas: [], responsible: '', dueDate: new Date().toISOString().split('T')[0], stageContext: localOpp.stage, subtasks: [], linkedNoteIds: [],
            order: null, dependsOnTaskIds: [], blockDoneUntilDependenciesDone: false
        };
        handleFieldChange('tasks', [...localOpp.tasks, newTask]);
    };

    const validateTaskCompletion = (taskId: string, newStatus: TaskStatus): boolean => {
        if (newStatus !== 'Done') return true;
        const task = localOpp.tasks.find(t => t.id === taskId);
        if (!task || !task.blockDoneUntilDependenciesDone || !task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) return true;

        const pendingDeps = localOpp.tasks.filter(t => task.dependsOnTaskIds!.includes(t.id) && t.status !== 'Done');
        if (pendingDeps.length > 0) {
            alert("This task is blocked until its dependencies are completed.");
            return false;
        }
        return true;
    };

    const updateTaskInModal = (field: keyof Task, value: any) => {
        if (!selectedTaskForEdit) return;
        if (field === 'status' && !validateTaskCompletion(selectedTaskForEdit.task.id, value)) {
            return;
        }

        // Optimistically update selected task in modal
        const updatedTaskData = { ...selectedTaskForEdit.task, [field]: value };
        setSelectedTaskForEdit({ task: updatedTaskData });

        let updatedTasks = localOpp.tasks.map(t => t.id === selectedTaskForEdit.task.id ? updatedTaskData : t);
        let updatedNotes = localOpp.notes;

        // Sync to inline tasks if status or title changed
        if (field === 'status' || field === 'title') {
            updatedNotes = localOpp.notes.map(note => {
                if (!note.inlineTasks) return note;
                const hasUpdates = note.inlineTasks.some(it => it.linkedTaskId === updatedTaskData.id);
                if (!hasUpdates) return note;

                const newInlineTasks = note.inlineTasks.map(it => {
                    if (it.linkedTaskId !== updatedTaskData.id) return it;
                    return {
                        ...it,
                        isDone: field === 'status' ? value === 'Done' : it.isDone,
                        text: field === 'title' ? value : it.text
                    };
                });
                return { ...note, inlineTasks: newInlineTasks };
            });
        }

        // Batch update
        const newOpp = { ...localOpp, tasks: updatedTasks, notes: updatedNotes, lastUpdated: new Date().toISOString() };
        setLocalOpp(newOpp);
        onUpdate(newOpp);
    };

    const deleteTaskInModal = () => {
        if (!selectedTaskForEdit) return; if (!window.confirm("Are you sure you want to delete this task?")) return;
        const updatedTasks = localOpp.tasks.filter(t => t.id !== selectedTaskForEdit.task.id);
        handleFieldChange('tasks', updatedTasks); setSelectedTaskForEdit(null);
    };
    const moveSubtask = (index: number, direction: 'up' | 'down') => {
        if (!selectedTaskForEdit) return;
        const subtasks = [...selectedTaskForEdit.task.subtasks];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex >= 0 && newIndex < subtasks.length) {
            [subtasks[index], subtasks[newIndex]] = [subtasks[newIndex], subtasks[index]];
            updateTaskInModal('subtasks', subtasks);
        }
    };
    const getStatusSummary = () => {
        const pending = localOpp.tasks.filter(t => t.status !== 'Done');
        const summary = `*STATUS REPORT: ${localOpp.id}*\nRemaining Tasks: ${pending.length}\n\n${pending.map(t => `- [${t.status}] ${t.title}`).join('\n')}`;
        navigator.clipboard.writeText(summary); alert("Status summary copied to clipboard.");
    };

    const linkNotesToTask = (taskId: string, noteIds: string[]) => {
        const task = localOpp.tasks.find(t => t.id === taskId);
        if (!task) return;
        const currentIds = task.linkedNoteIds || (task.linkedNoteId ? [task.linkedNoteId] : []) || [];
        const newIds = Array.from(new Set([...currentIds, ...noteIds]));
        const updatedTasks = localOpp.tasks.map(t => t.id === taskId ? { ...t, linkedNoteIds: newIds } : t);
        handleFieldChange('tasks', updatedTasks);
        if (selectedTaskForEdit && selectedTaskForEdit.task.id === taskId) {
            setSelectedTaskForEdit({ task: { ...selectedTaskForEdit.task, linkedNoteIds: newIds } });
        }
        setShowNotePickerForTask(null);
        setSelectedNotesToLink([]);
        setNoteSearch('');
    };

    const unlinkNoteFromTask = (taskId: string, noteId: string) => {
        const task = localOpp.tasks.find(t => t.id === taskId);
        if (!task) return;
        const currentIds = task.linkedNoteIds || (task.linkedNoteId ? [task.linkedNoteId] : []) || [];
        const newIds = currentIds.filter(id => id !== noteId);
        const updatedTasks = localOpp.tasks.map(t => t.id === taskId ? { ...t, linkedNoteIds: newIds, linkedNoteId: undefined } : t);
        handleFieldChange('tasks', updatedTasks);
        if (selectedTaskForEdit && selectedTaskForEdit.task.id === taskId) {
            setSelectedTaskForEdit({ task: { ...selectedTaskForEdit.task, linkedNoteIds: newIds } });
        }
    };

    const copyTaskSummary = async () => {
        if (!selectedTaskForEdit) return;
        const t = selectedTaskForEdit.task;
        let docTitles: string[] = [];
        try {
            const docs = await listLinkedForTask(localOpp.id, t.id);
            if (docs && docs.length > 0) {
                docTitles = docs.map(d => d.fileKey.split('/').pop() || d.fileKey);
            }
        } catch (e) { console.error("Failed to load docs for summary", e); }

        const noteTitles = (t.linkedNoteIds || (t.linkedNoteId ? [t.linkedNoteId] : [])).map(nid => {
            return localOpp.notes.find(n => n.id === nid)?.title;
        }).filter(Boolean) as string[];

        const summary = `
                                    Task: ${t.title}
                                    Due Date: ${t.dueDate}
                                    Status: ${t.status} | Priority: ${t.priority}
                                    Description:
                                    ${t.description}

                                    Subtasks:
                                    ${(t.subtasks || []).map(s => `- [${s.completed ? 'x' : ' '}] ${s.title}`).join('\n')}

                                    Linked documents:
                                    ${docTitles.join('\n')}

                                    Linked notes:
                                    ${noteTitles.join('\n')}
                                    `.trim();
        navigator.clipboard.writeText(summary);
        alert("Task summary with links copied to clipboard!");
    };

    const handleExportPDF = async () => {
        const doc = new jsPDF();
        const s = localOpp;
        const pageWidth = doc.internal.pageSize.getWidth();

        /**
         * Improved HTML Parser for PDF
         * Preserves structure for H1, H2, H3, lists, and basic formatting.
         */
        const parseHtmlToPdfText = (html: string): string => {
            if (!html) return "";
            let text = html;

            // Basic block level conversion
            text = text.replace(/<h1>/g, '\n\n# ').replace(/<\/h1>/g, '\n');
            text = text.replace(/<h2>/g, '\n\n## ').replace(/<\/h2>/g, '\n');
            text = text.replace(/<h3>/g, '\n\n### ').replace(/<\/h3>/g, '\n');
            text = text.replace(/<p>/g, '\n').replace(/<\/p>/g, '\n');
            text = text.replace(/<br\s*\/?>/g, '\n');

            // Lists
            text = text.replace(/<ul>/g, '\n').replace(/<\/ul>/g, '\n');
            text = text.replace(/<ol>/g, '\n').replace(/<\/ol>/g, '\n');
            text = text.replace(/<li>/g, '\n• ').replace(/<\/li>/g, '');

            // Tables (simplification)
            text = text.replace(/<tr>/g, '\n| ').replace(/<\/tr>/g, ' |');
            text = text.replace(/<td>/g, ' ').replace(/<\/td>/g, ' |');
            text = text.replace(/<th>/g, ' ').replace(/<\/th>/g, ' |');

            // Formatting (strip but keep content)
            text = text.replace(/<strong>/g, '').replace(/<\/strong>/g, '');
            text = text.replace(/<em>/g, '').replace(/<\/em>/g, '');
            text = text.replace(/<u>/g, '').replace(/<\/u>/g, '');

            // Strip remaining tags
            text = text.replace(/<[^>]*>/g, '');

            // Decode entities
            const txt = document.createElement('textarea');
            txt.innerHTML = text;
            return txt.value.trim();
        };

        /**
         * Helper to look for and extract images from HTML content
         */
        const renderImagesFromHtml = (html: string, currentY: number): number => {
            const imgRegex = /<img[^>]+src="([^">]+)"/g;
            let match;
            let y = currentY;
            while ((match = imgRegex.exec(html)) !== null) {
                const src = match[1];
                try {
                    if (src.startsWith('data:image')) {
                        // Attempt to add base64 image
                        const imgProps = doc.getImageProperties(src);
                        const imgWidth = Math.min(pageWidth - 28, imgProps.width / 5); // Simple scaling
                        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

                        if (y + imgHeight > 270) {
                            doc.addPage();
                            y = 20;
                        }
                        doc.addImage(src, 'PNG', 14, y, imgWidth, imgHeight);
                        y += imgHeight + 10;
                    } else {
                        // External URL - render as placeholder
                        doc.setTextColor(150);
                        doc.setFontSize(8);
                        doc.text(`[Image Link: ${src.substring(0, 50)}...]`, 14, y);
                        doc.setTextColor(0);
                        y += 10;
                    }
                } catch (e) {
                    console.warn("Failed to render image in PDF", e);
                }
            }
            return y;
        };

        doc.setFillColor(61, 205, 88);
        doc.rect(0, 0, pageWidth, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text("Tender Documentation", 14, 16);

        let yPos = 40;
        doc.setTextColor(0);
        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        const splitTitle = doc.splitTextToSize(s.title, pageWidth - 28);
        doc.text(splitTitle, 14, yPos);
        yPos += (splitTitle.length * 10) + 10;

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.text(`Customer: ${s.customer} | ID: ${s.id} | QLK: ${s.qlk || '-'} | Rev: ${s.revision}`, 14, yPos);
        yPos += 10;

        autoTable(doc, {
            startY: yPos,
            head: [['Parameter', 'Value']],
            body: [
                ['Requested', s.dates.requested || '-'],
                ['Expected', s.dates.expected || '-'],
                ['Assigned', s.dates.assigned || '-'],
                ['Stage', s.stage],
                ['Status', s.statusLabel]
            ],
            theme: 'striped',
            headStyles: { fillColor: [61, 205, 88] }
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;

        if (s.commercial) {
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Commercial Summary", 14, yPos);
            yPos += 8;
            autoTable(doc, {
                startY: yPos,
                head: [['Item', 'Cost', 'Margin %', 'Sell Price', 'Discount %', 'Final Price']],
                body: [
                    ['Hardware/Software', s.commercial.swHw.cost, s.commercial.swHw.margin, s.commercial.swHw.sellPrice, s.commercial.swHw.discount, s.commercial.swHw.finalPrice],
                    ['Services', s.commercial.services.cost, s.commercial.services.margin, s.commercial.services.sellPrice, s.commercial.services.discount, s.commercial.services.finalPrice],
                    ['Resale', s.commercial.resale.cost, s.commercial.resale.margin, s.commercial.resale.sellPrice, s.commercial.resale.discount, s.commercial.resale.finalPrice]
                ],
                theme: 'grid',
                headStyles: { fillColor: [61, 205, 88] }
            });
            yPos = (doc as any).lastAutoTable.finalY + 12;

            // Enhanced Sell Price - Highlighted and Larger
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Official reference margin: ${s.commercial.cqaOfficialMargin}%`, 14, yPos);
            yPos += 10;
            doc.setFontSize(16); // Larger size
            doc.setFont(undefined, 'bold');
            doc.setTextColor(61, 205, 88); // Bold green
            doc.text(`CQA TOTAL SELL PRICE: $${s.commercial.cqaOfficialSellPrice.toLocaleString()}`, 14, yPos);
            doc.setTextColor(0);
            yPos += 15;
        }

        if (s.tasks && s.tasks.length > 0) {
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Tasks & Action Plan", 14, yPos);
            yPos += 8;

            // Sort tasks: Order -> DueDate -> Title
            const sortedTasks = [...s.tasks].sort((a, b) => {
                if (a.order !== null && b.order !== null) return a.order - b.order;
                if (a.order !== null) return -1;
                if (b.order !== null) return 1;
                if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return (a.title || "").localeCompare(b.title || "");
            });

            // Pre-fetch linked documents for all tasks to include in body
            const taskDocMap: Record<string, string[]> = {};
            for (const t of sortedTasks) {
                try {
                    const docs = await listLinkedForTask(s.id, t.id);
                    if (docs && docs.length > 0) {
                        taskDocMap[t.id] = docs.map(d => d.fileKey.split('/').pop() || d.fileKey);
                    }
                } catch (e) { }
            }

            autoTable(doc, {
                startY: yPos,
                head: [['Task Details', 'Status', 'Due Info']],
                body: sortedTasks.map(t => {
                    // Build complex details string
                    let details = `${t.title.toUpperCase()}\n`;
                    if (t.description) details += `Desc: ${t.description}\n`;

                    // Subtasks
                    if (t.subtasks && t.subtasks.length > 0) {
                        details += `Subtasks: ${t.subtasks.map(st => `${st.completed ? '[x]' : '[ ]'} ${st.title}`).join(', ')}\n`;
                    }

                    // Dependencies
                    if (t.dependsOnTaskIds && t.dependsOnTaskIds.length > 0) {
                        const depTitles = t.dependsOnTaskIds.map(id => s.tasks.find(tk => tk.id === id)?.title).filter(Boolean);
                        details += `Blocked by: ${depTitles.join(', ')}\n`;
                    }

                    // Linked Notes
                    const noteTitles = (t.linkedNoteIds || (t.linkedNoteId ? [t.linkedNoteId] : [])).map(nid => s.notes.find(n => n.id === nid)?.title).filter(Boolean);
                    if (noteTitles.length > 0) details += `Notes: ${noteTitles.join(', ')}\n`;

                    // Linked Documents (New)
                    if (taskDocMap[t.id] && taskDocMap[t.id].length > 0) {
                        details += `Docs: ${taskDocMap[t.id].join(', ')}\n`;
                    }

                    return [
                        details.trim(),
                        t.status,
                        `${t.dueDate}\nPriority: ${t.priority}\nArea: ${t.owner === 'External Area' ? (t.externalAreas || []).join(', ') : t.owner}`
                    ];
                }),
                theme: 'grid',
                headStyles: { fillColor: [61, 205, 88] },
                styles: { fontSize: 8, cellPadding: 4 },
                columnStyles: { 0: { cellWidth: 100 } }
            });
            yPos = (doc as any).lastAutoTable.finalY + 15;
        }

        if (s.questions && s.questions.length > 0) {
            if (yPos > 250) { doc.addPage(); yPos = 20; }
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Questions & Answers", 14, yPos);
            yPos += 8;
            autoTable(doc, {
                startY: yPos,
                head: [['Question', 'Answer', 'Resolved']],
                body: s.questions.map(q => [q.question, q.answer, q.isResolved ? 'Yes' : 'No']),
                theme: 'striped',
                headStyles: { fillColor: [61, 205, 88] },
                columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 } }
            });
            yPos = (doc as any).lastAutoTable.finalY + 15;
        }

        if (s.history && s.history.length > 0) {
            if (yPos > 250) { doc.addPage(); yPos = 20; }
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("Opportunity History", 14, yPos);
            yPos += 8;
            s.history.sort((a, b) => b.date.localeCompare(a.date)).forEach(h => {
                if (yPos > 270) { doc.addPage(); yPos = 20; }
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text(h.date, 14, yPos);
                doc.setFont(undefined, 'normal');
                const splitText = doc.splitTextToSize(h.content, pageWidth - 50);
                doc.text(splitText, 40, yPos);
                yPos += (splitText.length * 5) + 5;
            });
            yPos += 10;
        }

        if (s.notes && s.notes.length > 0) {
            doc.addPage();
            yPos = 20;
            doc.setFontSize(18);
            doc.setFont(undefined, 'bold');
            doc.text("Meeting Notes Detail", 14, yPos);
            yPos += 15;
            for (const note of s.notes) {
                if (yPos > 250) { doc.addPage(); yPos = 20; }
                doc.setFontSize(14);
                doc.setTextColor(61, 205, 88);
                doc.setFont(undefined, 'bold');
                doc.text(note.title, 14, yPos);
                yPos += 6;
                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.setFont(undefined, 'normal');
                doc.text(`${note.date} | Type: ${note.type}`, 14, yPos);
                yPos += 8;

                const linkedTasks = getLinkedTasksForNote(note.id);
                let linkedDocsText = "";
                try {
                    const docs = await listLinkedForNote(s.id, note.id);
                    if (docs && docs.length > 0) {
                        linkedDocsText = docs.map(d => d.fileKey.split('/').pop()).join(', ');
                    }
                } catch (e) { }

                if (linkedTasks.length > 0 || linkedDocsText) {
                    doc.setFont(undefined, 'bold');
                    if (linkedTasks.length > 0) {
                        doc.text(`Linked Tasks: ${linkedTasks.map(t => t.title).join(', ')}`, 14, yPos);
                        yPos += 5;
                    }
                    if (linkedDocsText) {
                        doc.text(`Linked Documents: ${linkedDocsText}`, 14, yPos);
                        yPos += 5;
                    }
                    yPos += 4;
                }

                doc.setTextColor(0);
                doc.setFont(undefined, 'normal');

                // 1. Render text content with improved parsing
                const formattedContent = parseHtmlToPdfText(note.content);
                const splitNote = doc.splitTextToSize(formattedContent, pageWidth - 28);
                if (yPos + (splitNote.length * 5) > 280) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.text(splitNote, 14, yPos);
                yPos += (splitNote.length * 5) + 10;

                // 2. Render images if present in content
                yPos = renderImagesFromHtml(note.content, yPos);

                yPos += 10;
            }
        }

        // Generate filename based on opportunity title (sanitized)
        const sanitizedTitle = s.title.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_');
        const fileName = `Documentation_${sanitizedTitle}.pdf`;

        // Use File System Access API if available for "Save As" behavior
        // @ts-ignore
        if (window.showSaveFilePicker) {
            try {
                // @ts-ignore
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'PDF Document',
                        accept: { 'application/pdf': ['.pdf'] },
                    }],
                });
                const blob = doc.output('blob');
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('Save File Picker failed:', err);
                    doc.save(fileName);
                }
            }
        } else {
            doc.save(fileName);
        }
    };

    const generateExecutiveSummary = () => {
        const s = localOpp;
        const text = `
                                                                                        ${s.revision} report for the ${s.id}
                                                                                        SR Link: ${s.links.srLink || ''}
                                                                                        Description of the request: ${s.description || ''}
                                                                                        Executive summary: ${s.presentation.executiveSummary || ''}

                                                                                        Information
                                                                                        CQA Sell price: ${s.commercial.cqaOfficialSellPrice ? `$${s.commercial.cqaOfficialSellPrice.toLocaleString()}` : ''}
                                                                                        GM CCO: ${s.commercial.cqaOfficialMargin ? `${s.commercial.cqaOfficialMargin}%` : ''}
                                                                                        Notes / Discounts Logic: ${s.commercial.discountsAndNotes || ''}
                                                                                        CQA 2.0 Link: ${s.links.cqaLink || ''}
                                                                                        `.trim();
        navigator.clipboard.writeText(text);
        alert("Executive summary copied to clipboard!");
    };

    const handleDocSelect = async (keys: string[]) => {
        if (!showDocPicker) return;
        const { type, id } = showDocPicker;
        for (const key of keys) {
            await saveMeta(opportunity.id, key, type === 'task' ? { linkedTaskIds: [id] } : { linkedNoteIds: [id] });
        }
        setShowDocPicker(null);
        setRefreshKey(prev => prev + 1);
    };

    const navigateToFile = (fileKey: string) => {
        setFolderNavTarget(fileKey);
        setActiveTab('folder');
    };

    const updateTaskDetails = (taskId: string, updates: Partial<Task>) => {
        const updatedTasks = localOpp.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t);
        handleFieldChange('tasks', updatedTasks);
    };

    const handleTaskDrop = (id: string, type: string, newDate: string) => {
        if (type === 'task') {
            updateTaskDetails(id, { dueDate: newDate });
        }
    };

    // --- Inline Task Handlers ---

    const handleAddInlineTask = (noteId: string) => {
        // Fix: Ensure noteId exists before proceeding
        if (!noteId) return;

        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        if (noteIndex === -1) return;

        const note = localOpp.notes[noteIndex];
        const newInlineTask: InlineTask = {
            id: crypto.randomUUID(),
            text: '',
            isDone: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString() // Added missing field
        };

        const currentInlineTasks = note.inlineTasks || [];
        const updatedNote = { ...note, inlineTasks: [...currentInlineTasks, newInlineTask] };

        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = updatedNote;

        // Update state and persist
        handleFieldChange('notes', updatedNotes);
    };

    const handleInlineTaskChange = (noteId: string, taskId: string, changes: Partial<InlineTask>) => {
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        if (noteIndex === -1) return;
        const note = localOpp.notes[noteIndex];
        const inlineTasks = note.inlineTasks || [];
        const taskIndex = inlineTasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const oldTask = inlineTasks[taskIndex];
        const updatedTask = { ...oldTask, ...changes, updatedAt: new Date().toISOString() };

        const newInlineTasks = [...inlineTasks];
        newInlineTasks[taskIndex] = updatedTask;

        const updatedNote = { ...note, inlineTasks: newInlineTasks };
        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = updatedNote;

        // Sync to linked Task if needed
        let updatedTasks = localOpp.tasks;
        if (updatedTask.linkedTaskId) {
            const linkedTaskIndex = localOpp.tasks.findIndex(t => t.id === updatedTask.linkedTaskId);
            if (linkedTaskIndex !== -1) {
                const linkedTask = localOpp.tasks[linkedTaskIndex];
                let taskUpdates: Partial<Task> = {};

                if (changes.hasOwnProperty('isDone')) {
                    const newStatus = updatedTask.isDone ? 'Done' : (linkedTask.status === 'Done' ? 'Pending' : linkedTask.status);
                    if (newStatus !== linkedTask.status) taskUpdates.status = newStatus;
                }
                if (changes.hasOwnProperty('text')) {
                    if (updatedTask.text !== linkedTask.title) taskUpdates.title = updatedTask.text || 'Note Task';
                }

                if (Object.keys(taskUpdates).length > 0) {
                    updatedTasks = [...localOpp.tasks];
                    updatedTasks[linkedTaskIndex] = { ...linkedTask, ...taskUpdates };
                }
            }
        }

        // Batch Update
        const newOpp = { ...localOpp, notes: updatedNotes, tasks: updatedTasks, lastUpdated: new Date().toISOString() };
        setLocalOpp(newOpp);
        onUpdate(newOpp);
    };

    const handleCreateLinkedTask = (noteId: string, inlineTask: InlineTask) => {
        const newTask: Task = {
            id: crypto.randomUUID(),
            title: inlineTask.text || 'Note Task',
            description: '',
            status: inlineTask.isDone ? 'Done' : 'Pending',
            priority: 'Medium',
            owner: 'Me',
            externalAreas: [],
            responsible: '',
            dueDate: new Date().toISOString().split('T')[0],
            stageContext: localOpp.stage,
            subtasks: [],
            linkedNoteIds: [noteId],
            order: null,
            dependsOnTaskIds: [],
            blockDoneUntilDependenciesDone: false
        };

        const updatedTasks = [...localOpp.tasks, newTask];

        // Update inline task with link
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        const note = localOpp.notes[noteIndex];
        const newInlineTasks = note.inlineTasks!.map(t => t.id === inlineTask.id ? { ...t, linkedTaskId: newTask.id } : t);
        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = { ...note, inlineTasks: newInlineTasks };

        const newOpp = { ...localOpp, tasks: updatedTasks, notes: updatedNotes, lastUpdated: new Date().toISOString() };
        setLocalOpp(newOpp);
        onUpdate(newOpp);
    };

    const handleUnlinkInlineTask = (noteId: string, inlineTask: InlineTask) => {
        // Clear linkedTaskId in note only
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        const note = localOpp.notes[noteIndex];
        const newInlineTasks = note.inlineTasks!.map(t => t.id === inlineTask.id ? { ...t, linkedTaskId: undefined } : t);
        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = { ...note, inlineTasks: newInlineTasks };

        handleFieldChange('notes', updatedNotes);
    };

    const handleDeleteInlineTask = (noteId: string, taskId: string) => {
        const noteIndex = localOpp.notes.findIndex(n => n.id === noteId);
        const note = localOpp.notes[noteIndex];
        const newInlineTasks = note.inlineTasks!.filter(t => t.id !== taskId);
        const updatedNotes = [...localOpp.notes];
        updatedNotes[noteIndex] = { ...note, inlineTasks: newInlineTasks };

        handleFieldChange('notes', updatedNotes);
    };

    // New: Handle opening Split View from inline task
    const handleOpenSplitView = (task: Task, noteId: string) => {
        setSelectedTaskForEdit({ task });
        setSplitViewNoteId(noteId);
    };

    const currentNote = localOpp.notes.find(n => n.id === selectedNoteId);

    const myWorkStats = React.useMemo(() => {
        const tendering = localOpp.kpis?.areasInvolved.find(a => a.area === 'Tendering');
        if (!tendering || !tendering.calendar) return { days: 0, hours: 0 };
        let days = 0;
        let hours = 0;
        Object.values(tendering.calendar).forEach(record => {
            const r = record as AreaDayRecord;
            if (r.type === 'Worked') {
                const h = r.hours || 0;
                if (h >= 1) days++;
                hours += h;
            }
        });
        return { days, hours };
    }, [localOpp.kpis?.areasInvolved]);

    const waitingOnOthersDays = React.useMemo(() => {
        let totalWaiting = 0;
        (localOpp.kpis?.areasInvolved || []).forEach(a => {
            totalWaiting += a.waitingDays || 0;
        });
        return totalWaiting;
    }, [localOpp.kpis?.areasInvolved]);

    const handleExportKpiPDF = async () => {
        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF();

        // Header
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('KPI Implementation Report', 14, 20);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Opportunity: ${localOpp.title}`, 14, 28);
        const received = localOpp.kpis?.timeline?.receivedAt || 'N/A';
        const delivered = localOpp.kpis?.timeline?.deliveredAt || 'In Progress';
        doc.text(`Period: ${received} - ${delivered}`, 14, 33);

        // Executive Summary
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text('Executive Summary', 14, 45);

        autoTable(doc, {
            startY: 50,
            head: [['Metric', 'Value']],
            body: [
                ['Elapsed Calendar Days', `${totalElapsedCalendarDays}d`],
                ['Elapsed Business Days', `${totalElapsedBusinessDays}d`],
                ['My Work (Days)', `${myWorkStats.days}d`],
                ['My Work (Total Hours)', `${myWorkStats.hours}h`],
                ['Waiting on Others (Total Days)', `${waitingOnOthersDays}d`],
                ['Unique Execution Days', `${executionUniqueDays}d`]
            ],
            theme: 'striped',
            headStyles: { fillColor: [61, 205, 88] }
        });

        // Areas Table
        doc.text('Areas Involved Breakdown', 14, (doc as any).lastAutoTable.finalY + 15);
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Area', 'Days Worked', 'Days Waiting']],
            body: (localOpp.kpis?.areasInvolved || []).map(a => [a.area, `${a.daysSpent}d`, `${a.waitingDays}d`]),
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] }
        });

        // Simple Gantt Visualization
        const finalY = (doc as any).lastAutoTable.finalY + 15;
        doc.text('Implementation Timeline (Gantt)', 14, finalY);

        // Draw Legend
        doc.setFontSize(8);
        doc.setFillColor(59, 130, 246); doc.rect(14, finalY + 5, 5, 5, 'F'); doc.text('Worked', 22, finalY + 9);
        doc.setFillColor(234, 179, 8); doc.rect(40, finalY + 5, 5, 5, 'F'); doc.text('Waiting', 48, finalY + 9);
        doc.setFillColor(239, 68, 68); doc.rect(66, finalY + 5, 5, 5, 'F'); doc.text('Inactive', 74, finalY + 9);

        // We'll draw 30 days starting from ReceivedAt
        const receivedAtStr = localOpp.kpis?.timeline?.receivedAt || new Date().toISOString().split('T')[0];
        const startDate = new Date(receivedAtStr);
        const cellWidth = 5;
        const rowHeight = 8;
        let currentY = finalY + 20;

        // Draw Headers (Days 1-30)
        doc.setFontSize(6);
        for (let i = 0; i < 30; i++) {
            doc.text(`${i + 1}`, 45 + (i * cellWidth), currentY - 2);
        }

        (localOpp.kpis?.areasInvolved || []).forEach(area => {
            doc.setFontSize(8);
            doc.text(area.area, 14, currentY + 5);

            for (let i = 0; i < 30; i++) {
                // Use UTC to ensure key matching with calendar
                const dateParts = receivedAtStr.split('-').map(Number);
                const dayDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                dayDate.setUTCDate(dayDate.getUTCDate() + i);
                const dayStr = dayDate.toISOString().split('T')[0];
                const record = area.calendar?.[dayStr] as AreaDayRecord | undefined;

                if (record && record.type) {
                    if (record.type === 'Worked') doc.setFillColor(59, 130, 246);
                    else if (record.type === 'Waiting') doc.setFillColor(234, 179, 8);
                    else if (record.type === 'Inactive') doc.setFillColor(239, 68, 68);
                    doc.rect(45 + (i * cellWidth), currentY, cellWidth - 0.5, rowHeight, 'F');
                } else {
                    doc.setDrawColor(240);
                    doc.rect(45 + (i * cellWidth), currentY, cellWidth - 0.5, rowHeight, 'S');
                }
            }
            currentY += rowHeight + 1;
        });

        // Activity History
        if (localOpp.history && localOpp.history.length > 0) {
            doc.addPage();
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('Activity History', 14, 20);
            autoTable(doc, {
                startY: 25,
                head: [['Date', 'Activity']],
                body: (localOpp.history || []).map(h => [h.date.split('T')[0], h.content]),
                theme: 'striped',
                columnStyles: {
                    0: { cellWidth: 30 },
                    1: { cellWidth: 'auto' }
                },
                headStyles: { fillColor: [61, 205, 88] }
            });
        }

        doc.save(`${localOpp.qlk}_${localOpp.title}_KPI_Report.pdf`);
    };


    const handleNavigateToHistory = (eventId: string) => {
        setActiveTab('history');
        setTimeout(() => {
            const el = document.getElementById(`history-entry-${eventId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                        <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-lg transition-colors mr-2"><X className="w-5 h-5 text-gray-500" /></button>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1 rounded-md shadow-sm">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">OP</span>
                            <input className="text-sm font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-16 bg-transparent" value={localOpp.id.replace(/^OP-/, '')} onChange={(e) => handleFieldChange('id', `OP-${e.target.value}`)} />
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1 rounded-md shadow-sm">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">QLK</span>
                            <input className="text-sm font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-24 bg-transparent" value={localOpp.qlk} onChange={(e) => handleFieldChange('qlk', e.target.value)} placeholder="000000" />
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1 rounded-md shadow-sm">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">REV</span>
                            <input className="text-sm font-mono font-bold text-gray-800 border-none focus:ring-0 p-0 w-8 bg-transparent" value={localOpp.revision} onChange={(e) => handleFieldChange('revision', e.target.value)} placeholder="R0" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <OpportunityExportImportButtons
                            opportunity={localOpp}
                            onImport={(importedOpp) => onUpdate(importedOpp)}
                        />
                        <div className="w-px h-8 bg-gray-200 mx-1"></div>
                        <button onClick={handleExportPDF} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:text-[#3DCD58] transition-all shadow-sm"><FileDown className="w-4 h-4" /> Export PDF</button>
                        <button onClick={generateExecutiveSummary} className="flex items-center gap-2 px-3 py-2 bg-[#3DCD58]/10 text-[#3DCD58] rounded-lg text-sm font-medium hover:bg-[#3DCD58]/20 transition-all shadow-sm"><Copy className="w-4 h-4" /> Copy Summary</button>
                        <div className="w-px h-8 bg-gray-200 mx-1"></div>
                        <button onClick={() => { if (window.confirm('Are you sure you want to delete this opportunity?')) onDelete(); }} className="p-2 text-gray-400 hover:text-red-600 rounded-lg transition-colors" title="Delete"><Trash2 className="w-5 h-5" /></button>
                    </div>
                </div>
                <div className="flex flex-wrap md:flex-nowrap justify-between items-end gap-4 mb-2">
                    <div className="flex-1 w-full md:w-auto min-w-[200px]">
                        <input value={localOpp.title} onChange={(e) => handleFieldChange('title', e.target.value)} className="text-3xl font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-full placeholder-gray-300" placeholder="Title" />
                        <input value={localOpp.customer} onChange={(e) => handleFieldChange('customer', e.target.value)} className="text-lg text-gray-500 bg-transparent border-none focus:ring-0 p-0 w-full mt-1 placeholder-gray-400" placeholder="Customer" />
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <select value={localOpp.statusLabel} onChange={(e) => handleFieldChange('statusLabel', e.target.value)} className={`text-xs font-bold px-3 py-1.5 rounded border outline-none w-32 uppercase tracking-wider cursor-pointer ${STATUS_COLORS[localOpp.statusLabel]}`}>{Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                        <select value={localOpp.stage} onChange={(e) => handleFieldChange('stage', e.target.value)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border-none outline-none w-40 text-center cursor-pointer ${STAGE_COLORS[localOpp.stage]}`}>{Object.keys(STAGE_COLORS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                    </div>
                </div>
            </div>

            <div className="flex border-b border-gray-200 px-6 overflow-x-auto shrink-0 bg-white sticky top-0 z-10">
                <button onClick={() => setActiveTab('overview')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'overview' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}>Overview</button>
                <button onClick={() => setActiveTab('kpi')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'kpi' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><BarChart3 className="w-4 h-4" /> KPI</button>
                <button onClick={() => setActiveTab('presentation')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'presentation' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><Presentation className="w-4 h-4" /> Presentation</button>
                <button onClick={() => setActiveTab('history')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'history' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><HistoryIcon className="w-4 h-4" /> History</button>
                <button onClick={() => setActiveTab('tasks')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'tasks' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><ListChecks className="w-4 h-4" /> Tasks</button>
                <button onClick={() => setActiveTab('commercial')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'commercial' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><DollarSign className="w-4 h-4" /> Commercial</button>
                <button onClick={() => setActiveTab('notes')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'notes' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><FileText className="w-4 h-4" /> Notes</button>
                <button onClick={() => setActiveTab('folder')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'folder' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><FolderOpen className="w-4 h-4" /> Opportunity Folder</button>
                <button onClick={() => setActiveTab('questions')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'questions' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}><HelpCircle className="w-4 h-4" /> Questions</button>
            </div>

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <label className="block text-xs font-bold text-gray-500 uppercase">Description of the Request</label>
                            <textarea value={localOpp.description} onChange={(e) => handleFieldChange('description', e.target.value)} className="w-full text-sm border-gray-200 rounded-lg min-h-[300px]" placeholder="Detailed description..." />
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-gray-500 uppercase">Requested</label><input type="date" value={localOpp.dates.requested} onChange={(e) => handleFieldChange('dates', { ...localOpp.dates, requested: e.target.value })} className="w-full text-sm border-gray-200 rounded-lg" /></div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase">Expected</label><input type="date" value={localOpp.dates.expected} onChange={(e) => handleFieldChange('dates', { ...localOpp.dates, expected: e.target.value })} className="w-full text-sm border-gray-200 rounded-lg" /></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
                            <h3 className="text-sm font-semibold mb-2">Quick Links</h3>
                            {Object.keys(localOpp.links).map((key) => (
                                <div key={key} className="flex gap-2 items-center">
                                    <span className="w-24 text-[10px] text-gray-400 font-bold uppercase truncate">{key}</span>
                                    <input value={localOpp.links[key as keyof QuickLinks]} onChange={(e) => handleFieldChange('links', { ...localOpp.links, [key]: e.target.value })} className="flex-1 text-sm border-gray-200 rounded-lg" placeholder="https://..." />
                                    {localOpp.links[key as keyof QuickLinks] && <a href={localOpp.links[key as keyof QuickLinks]} target="_blank" className="p-2 bg-gray-100 rounded-lg shadow-sm"><ExternalLink className="w-4 h-4" /></a>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'kpi' && localOpp.kpis && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Performance Ratings */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <Target className="w-5 h-5 text-[#3DCD58]" />
                                    <h3 className="font-bold text-gray-800">Performance Ratings</h3>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-500 uppercase mb-1">
                                            <span>Language Skill</span>
                                            <span>{localOpp.kpis.languageSkill || 0}%</span>
                                        </div>
                                        <input type="range" min="0" max="100" value={localOpp.kpis.languageSkill || 0} onChange={(e) => updateKpiField('languageSkill', parseInt(e.target.value))} className="w-full accent-[#3DCD58]" />
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-500 uppercase mb-1">
                                            <span>Technical Understanding</span>
                                            <span>{localOpp.kpis.technicalUnderstanding || 0}%</span>
                                        </div>
                                        <input type="range" min="0" max="100" value={localOpp.kpis.technicalUnderstanding || 0} onChange={(e) => updateKpiField('technicalUnderstanding', parseInt(e.target.value))} className="w-full accent-[#3DCD58]" />
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold text-gray-500 uppercase mb-1">
                                            <span>Deal Probability</span>
                                            <span>{localOpp.kpis.dealProbability || 0}%</span>
                                        </div>
                                        <input type="range" min="0" max="100" value={localOpp.kpis.dealProbability || 0} onChange={(e) => updateKpiField('dealProbability', parseInt(e.target.value))} className="w-full accent-[#3DCD58]" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sold?</label>
                                        <div className="flex gap-2">
                                            <button onClick={() => updateKpiField('sold', true)} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${localOpp.kpis.sold === true ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500'}`}>Yes</button>
                                            <button onClick={() => updateKpiField('sold', false)} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${localOpp.kpis.sold === false ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-500'}`}>No</button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Proposal Amount (USD)</label>
                                        <input type="number" value={localOpp.kpis.proposalAmountUSD || ''} onChange={(e) => updateKpiField('proposalAmountUSD', parseFloat(e.target.value))} className="w-full border-gray-200 rounded-lg text-sm" placeholder="0.00" />
                                    </div>
                                </div>
                            </div>

                            {/* Timeline & Execution */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="w-5 h-5 text-blue-500" />
                                        <h3 className="font-bold text-gray-800">Timeline & Execution</h3>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleExportKpiPDF}
                                            className="text-xs font-black bg-white text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm active:scale-95"
                                        >
                                            <FileDown className="w-4 h-4 text-gray-400" /> Export KPI PDF
                                        </button>
                                        <button
                                            onClick={() => setShowFullCalendar(true)}
                                            className="text-xs font-black bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg border border-purple-100 hover:bg-purple-100 transition-all flex items-center gap-2 shadow-sm active:scale-95"
                                        >
                                            <Table className="w-4 h-4" /> View Full Calendar
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Received At</label>
                                        <input type="date" value={localOpp.kpis.timeline?.receivedAt || ''} onChange={(e) => updateKpiField('timeline.receivedAt', e.target.value)} className="w-full border-gray-200 rounded text-sm mt-1" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Delivered / Tendered At</label>
                                        <input type="date" value={localOpp.kpis.timeline?.deliveredAt || ''} onChange={(e) => updateKpiField('timeline.deliveredAt', e.target.value)} className="w-full border-gray-200 rounded text-sm mt-1" />
                                    </div>
                                </div>

                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-sm text-center">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Elapsed Calendar Days</label>
                                            <div className="text-xl font-black text-gray-800">{totalElapsedCalendarDays}</div>
                                            <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Total Time</div>
                                        </div>
                                        <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-sm text-center">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Elapsed Business Days</label>
                                            <div className="text-xl font-black text-blue-600">{totalElapsedBusinessDays}</div>
                                            <div className="text-[10px] text-blue-400/60 font-bold uppercase mt-1">Workable</div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-gray-200 w-full" />

                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="text-center">
                                            <label className="block text-[9px] font-bold text-gray-400 uppercase">My Work (Days)</label>
                                            <div className="text-lg font-black text-[#3DCD58]">{myWorkStats.days}</div>
                                        </div>
                                        <div className="text-center">
                                            <label className="block text-[9px] font-bold text-gray-400 uppercase">My Work (Hours)</label>
                                            <div className="text-lg font-black text-[#3DCD58]">{myWorkStats.hours}h</div>
                                        </div>
                                        <div className="text-center">
                                            <label className="block text-[9px] font-bold text-gray-400 uppercase">Waiting (Sum)</label>
                                            <div className="text-lg font-black text-yellow-600">{waitingOnOthersDays}d</div>
                                        </div>
                                    </div>

                                    {(myWorkStats.days + waitingOnOthersDays) > totalElapsedBusinessDays && (
                                        <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-100">
                                            <AlertCircle className="w-4 h-4 text-red-500" />
                                            <p className="text-[10px] text-red-600 font-bold">Inconsistency detected: Logged time exceeds Business Days ({totalElapsedBusinessDays})</p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div className="flex gap-2 mb-1">
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Cancelled At</label>
                                        <input type="date" value={localOpp.kpis.timeline.cancelledAt || ''} onChange={(e) => updateKpiField('timeline.cancelledAt', e.target.value)} className="border-gray-200 rounded text-xs p-1 h-6 shrink-0" />
                                    </div>
                                    <textarea value={localOpp.kpis.timeline.cancelledReason || ''} onChange={(e) => updateKpiField('timeline.cancelledReason', e.target.value)} className="w-full border-gray-200 rounded-lg text-sm h-16 resize-none" placeholder="Reason for cancellation..." />
                                </div>
                            </div>
                        </div>

                        {/* Areas Involved Table */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <div className="flex items-center gap-2">
                                    <User className="w-5 h-5 text-purple-500" />
                                    <h3 className="font-bold text-gray-800">Areas Involved</h3>
                                </div>
                                <button onClick={() => setShowAddAreaModal(true)} className="text-xs bg-purple-50 text-purple-600 font-bold px-3 py-1.5 rounded-lg border border-purple-100 hover:bg-purple-100">+ Add Area</button>
                            </div>

                            <table className="w-full text-sm text-left">
                                <thead className="text-[10px] text-gray-400 font-bold uppercase bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-2">Area / Team</th>
                                        <th className="px-4 py-2 w-32 text-center">Worked Days</th>
                                        <th className="px-4 py-2 w-32 text-center">Waiting Days</th>
                                        <th className="px-4 py-2 w-24"></th>
                                        <th className="px-4 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {(localOpp.kpis?.areasInvolved || []).map(area => (
                                        <tr key={area.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 text-gray-800 font-medium">
                                                {area.area || 'Unnamed Area'}
                                            </td>
                                            <td className="px-4 py-2 text-center font-bold text-blue-600">
                                                {area.daysSpent || 0}
                                            </td>
                                            <td className="px-4 py-2 text-center font-bold text-yellow-600">
                                                {area.waitingDays || 0}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button
                                                    onClick={() => setEditingAreaCalendar(area.id)}
                                                    className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 hover:bg-white transition-colors"
                                                >
                                                    Edit Cal
                                                </button>
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <button onClick={() => removeKpiArea(area.id)} className="text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!localOpp.kpis?.areasInvolved || localOpp.kpis.areasInvolved.length === 0) && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-8 text-gray-400 italic text-xs">No specific areas tracked yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                <div className="p-3 bg-blue-50 rounded-lg shadow-inner">
                                    <label className="text-[9px] font-black text-blue-500 uppercase block mb-1">Execution Unique Days</label>
                                    <div className="text-xl font-black text-blue-700">{executionUniqueDays}</div>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-lg shadow-inner text-right">
                                    <label className="text-[9px] font-black text-purple-500 uppercase block mb-1">Total Record Duration</label>
                                    <div className="text-xl font-black text-purple-700">{totalAreaDays}d</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showFullCalendar && (
                    <FullCalendarModal
                        areas={localOpp.kpis?.areasInvolved || []}
                        holidays={holidays}
                        history={localOpp.history}
                        onSaveAreaCalendar={handleSaveAreaCalendar}
                        onAddArea={addKpiArea}
                        onRemoveArea={removeKpiArea}
                        onAddHistory={addHistoryEntry}
                        onEditHistory={(id, content) => updateHistoryEntry(id, 'content', content)}
                        onDeleteHistory={deleteHistoryEntry}
                        onClose={() => setShowFullCalendar(false)}
                        trackedAreas={trackedAreas || []}
                        timeline={localOpp.kpis?.timeline || { receivedAt: new Date().toISOString().split('T')[0], deliveredAt: null, cancelledAt: null, cancelledReason: null }}
                        onUpdateTimeline={(field, val) => updateKpiField('timeline', { ...localOpp.kpis?.timeline, [field]: val })}
                    />
                )}

                {activeTab === 'presentation' && (
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Executive Summary</label>
                            <textarea value={localOpp.presentation.executiveSummary} onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, executiveSummary: e.target.value })} className="w-full border-gray-200 rounded-lg h-32 text-sm" placeholder="Summarize for leadership..." />
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">Issues / Blockers</label>
                                <textarea value={localOpp.presentation.issues} onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, issues: e.target.value })} className="w-full border-gray-200 rounded-lg h-32 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">Key Requirements</label>
                                <textarea value={localOpp.presentation.requirements} onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, requirements: e.target.value })} className="w-full border-gray-200 rounded-lg h-32 text-sm" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">KPIs / Success Criteria</label>
                            <textarea value={localOpp.presentation.kpis} onChange={(e) => handleFieldChange('presentation', { ...localOpp.presentation, kpis: e.target.value })} className="w-full border-gray-200 rounded-lg h-20 text-sm" />
                        </div>
                    </div>
                )}

                {activeTab === 'commercial' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {['swHw', 'services', 'resale'].map((key) => {
                                const row = localOpp.commercial[key as 'swHw'];
                                return (
                                    <div key={key} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-4">
                                        <h4 className="text-sm font-black text-gray-800 uppercase tracking-wide border-b border-gray-100 pb-2">{key === 'swHw' ? 'Hardware / Software' : key}</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Cost</label><input type="number" value={displayValue(row.cost)} onChange={(e) => updateCommercialRow(key as any, 'cost', parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm p-1.5 mt-1 font-mono" /></div>
                                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Margin %</label><input type="number" value={displayValue(row.margin)} onChange={(e) => updateCommercialRow(key as any, 'margin', parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm p-1.5 mt-1 font-mono text-blue-600 font-bold" /></div>
                                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Sell Price</label><input type="number" value={displayValue(row.sellPrice)} onChange={(e) => updateCommercialRow(key as any, 'sellPrice', parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm p-1.5 mt-1 font-mono font-bold" /></div>
                                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Discount %</label><input type="number" value={displayValue(row.discount)} onChange={(e) => updateCommercialRow(key as any, 'discount', parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm p-1.5 mt-1 font-mono text-orange-600" /></div>
                                        </div>
                                        <div className="pt-2 border-t border-gray-100 mt-auto">
                                            <div className="flex justify-between items-end">
                                                <span className="text-xs font-medium text-gray-500">Final Price</span>
                                                <span className="text-lg font-bold text-[#3DCD58]">${row.finalPrice.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Global Adjustments</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-bold text-gray-400 uppercase">Risk</label><input type="number" value={displayValue(localOpp.commercial.risk)} onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, risk: parseFloat(e.target.value) || 0 })} className="w-full border-gray-200 rounded text-sm mt-1" /></div>
                                    <div><label className="text-[10px] font-bold text-gray-400 uppercase">Contingency</label><input type="number" value={displayValue(localOpp.commercial.contingency)} onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, contingency: parseFloat(e.target.value) || 0 })} className="w-full border-gray-200 rounded text-sm mt-1" /></div>
                                </div>
                                <div><label className="text-[10px] font-bold text-gray-400 uppercase">Notes / Discounts Logic</label><textarea value={localOpp.commercial.discountsAndNotes} onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, discountsAndNotes: e.target.value })} className="w-full border-gray-200 rounded text-sm mt-1 h-20" /></div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Project Totals</h4>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">GM: {totalMargin}%</span>
                                </div>
                                {/* REMOVED TOTAL SELL PRICE DISPLAY HERE */}
                                <div className="p-4 border border-gray-100 rounded-lg">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="text-[10px] font-bold text-gray-400 uppercase">CQA Official Sell</label><input type="number" value={displayValue(localOpp.commercial.cqaOfficialSellPrice)} onChange={(e) => updateOfficialSellPrice(parseFloat(e.target.value) || 0)} className="w-full border-gray-200 rounded text-sm mt-1 font-bold" /></div>
                                        <div><label className="text-[10px] font-bold text-gray-400 uppercase">CQA Margin %</label><input type="number" value={displayValue(localOpp.commercial.cqaOfficialMargin)} onChange={(e) => handleFieldChange('commercial', { ...localOpp.commercial, cqaOfficialMargin: parseFloat(e.target.value) || 0 })} className="w-full border-gray-200 rounded text-sm mt-1" /></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-gray-800">Change Log / Events</h3>
                            <div className="flex gap-2">
                                <button onClick={copyHistoryToClipboard} className="text-xs font-bold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Copy for bFO</button>
                                <button onClick={addHistoryEntry} className="text-xs font-bold px-3 py-1.5 bg-[#3DCD58] text-white rounded-lg hover:bg-[#2db64a] transition-colors">+ Add Entry</button>
                            </div>
                        </div>
                        <div className="relative border-l-2 border-[#3DCD58]/20 ml-3 space-y-8 pl-6 py-2">
                            {localOpp.history.map(entry => (
                                <div key={entry.id} id={`history-entry-${entry.id}`} className="relative">
                                    <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-[#3DCD58] border-4 border-white shadow-sm"></div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                                        <div className="flex justify-between items-center mb-2">
                                            <input type="date" value={entry.date} onChange={(e) => updateHistoryEntry(entry.id, 'date', e.target.value)} className="text-xs font-bold text-[#3DCD58] border-none p-0 focus:ring-0" />
                                            <button onClick={() => deleteHistoryEntry(entry.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                        <textarea value={entry.content} onChange={(e) => updateHistoryEntry(entry.id, 'content', e.target.value)} className="w-full text-sm text-gray-600 border-none p-0 focus:ring-0 resize-none bg-transparent" placeholder="Event description..." />
                                    </div>
                                </div>
                            ))}
                            {localOpp.history.length === 0 && <p className="text-center text-gray-400 italic py-8">No history recorded yet.</p>}
                        </div>
                    </div>
                )}

                {activeTab === 'questions' && (
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-gray-800">Q&A Tracker</h3>
                        </div>
                        <div className="space-y-4">
                            {localOpp.questions.map(q => (
                                <div key={q.id} className="p-4 border border-gray-200 rounded-xl hover:shadow-sm transition-shadow">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-[10px] font-bold bg-gray-100 px-2 py-0.5 rounded text-gray-500 uppercase">Source: {q.sourceType}</span>
                                        <button onClick={() => { if (window.confirm('Delete?')) handleFieldChange('questions', localOpp.questions.filter(qi => qi.id !== q.id)) }} className="text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                                    </div>
                                    {q.quote && <div className="text-xs text-gray-400 italic mb-2 border-l-2 border-gray-200 pl-2">"{q.quote}"</div>}
                                    <input className="w-full font-bold text-gray-800 border-none p-0 focus:ring-0 mb-2" value={q.question} onChange={(e) => updateQuestion(q.id, 'question', e.target.value)} />
                                    <textarea className="w-full text-sm text-gray-600 border-gray-100 bg-gray-50 rounded p-2" placeholder="Answer..." value={q.answer} onChange={(e) => updateQuestion(q.id, 'answer', e.target.value)} rows={2} />
                                </div>
                            ))}
                            {localOpp.questions.length === 0 && <p className="text-center text-gray-400 italic py-8">No questions logged from notes or tasks.</p>}
                        </div>
                    </div>
                )}

                {editingAreaCalendar && (() => {
                    const area = localOpp.kpis?.areasInvolved.find(a => a.id === editingAreaCalendar);
                    if (!area) return null;
                    return (
                        <KpiCalendarModal
                            area={area}
                            holidays={holidays}
                            suggestedWaitingDates={[]}
                            onClose={() => setEditingAreaCalendar(null)}
                            onSave={(cal) => {
                                handleSaveAreaCalendar(editingAreaCalendar!, cal);
                                setEditingAreaCalendar(null);
                            }}
                            history={localOpp.history}
                            onNavigateToHistory={handleNavigateToHistory}
                            onAddHistory={addHistoryEntry}
                            onEditHistory={(id, content) => updateHistoryEntry(id, 'content', content)}
                            onDeleteHistory={deleteHistoryEntry}
                        />
                    );
                })()}

                {activeTab === 'folder' && (
                    <OpportunityFolderTab opportunityId={opportunity.id} opportunity={localOpp} onUpdate={onUpdate} initialFileKey={folderNavTarget || undefined} />
                )}

                {activeTab === 'notes' && (
                    <div className={`flex h-full gap-6 ${isNoteFullScreen ? 'fixed inset-0 z-50 bg-white p-6' : ''}`}>
                        {!isNoteFullScreen && (
                            <div className="w-1/3 flex flex-col gap-3 overflow-y-auto">
                                {/* Search Bar for Notes */}
                                <div className="relative mb-1">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search notes..."
                                        className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    {/* Dynamic Note Template Buttons */}
                                    {noteTemplates.length > 0 ? (
                                        noteTemplates.map(tmpl => (
                                            <button
                                                key={tmpl.id}
                                                onClick={() => addNote(tmpl.title, tmpl.content)}
                                                className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold capitalize flex items-center justify-center gap-2 shadow-sm transition-all"
                                            >
                                                <Plus className="w-3 h-3" /> {tmpl.title}
                                            </button>
                                        ))
                                    ) : (
                                        // Fallback if settings fail or empty
                                        ['Kick-off', 'Scope', 'General'].map(t => (
                                            <button key={t} onClick={() => addNote(t)} className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold capitalize flex items-center justify-center gap-2 shadow-sm transition-all">
                                                <Plus className="w-3 h-3" /> {t}
                                            </button>
                                        ))
                                    )}
                                    <button onClick={() => addNote()} className="p-3 bg-gray-50 hover:bg-[#3DCD58]/10 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"><Zap className="w-3 h-3" /> Blank</button>
                                </div>
                                {filteredNotes.length === 0 && searchTerm && (
                                    <div className="text-center text-gray-400 text-xs py-4">No notes found matching "{searchTerm}"</div>
                                )}
                                {filteredNotes.map(note => (
                                    <div key={note.id} className={`p-3 rounded-lg border cursor-pointer relative group transition-all ${selectedNoteId === note.id ? 'bg-[#3DCD58]/10 border-[#3DCD58]/30 ring-1 ring-[#3DCD58]/20 shadow-md' : 'bg-white border-gray-200 hover:border-gray-300'}`} onClick={() => setSelectedNoteId(note.id)}>
                                        <div className="font-bold text-sm text-gray-900 truncate pr-6">{note.title}</div>
                                        <div className="text-[10px] font-mono text-gray-400 mt-1 uppercase">{note.date}</div>
                                        <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex-1 flex gap-4 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col shadow-sm">
                            {currentNote ? (
                                <>
                                    <div className="p-4 border-b border-gray-100 flex justify-between bg-gray-50 shrink-0 items-center">
                                        <input value={currentNote.title} onChange={(e) => updateSelectedNote('title', e.target.value)} className="font-black text-lg bg-transparent border-none focus:ring-0 text-gray-800 flex-1 px-0" />
                                        <div className="flex items-center gap-3">
                                            {textSelection && <button className="text-xs bg-[#3DCD58] text-white px-3 py-1.5 rounded-lg font-bold shadow-md shadow-[#3DCD58]/20 animate-bounce flex items-center gap-1" onClick={() => addQuestion(currentNote.id, textSelection)}><HelpCircle className="w-3 h-3" /> Ask Question</button>}
                                            <button
                                                onClick={() => setShowQuestionsSplit(!showQuestionsSplit)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showQuestionsSplit ? 'bg-[#3DCD58]/10 border-[#3DCD58]/20 text-[#3DCD58]' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                                title="Open Questions"
                                            >
                                                <SplitSquareHorizontal className="w-3 h-3" />
                                                Open Questions
                                            </button>
                                            <button onClick={() => setIsNoteFullScreen(!isNoteFullScreen)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">{isNoteFullScreen ? <Minimize2 className="w-4 h-4 text-gray-500" /> : <Maximize2 className="w-4 h-4 text-gray-500" />}</button>
                                        </div>
                                    </div>
                                    {/* Editor Container with Vertical Flex */}
                                    <div className="flex-1 flex flex-col min-h-0">
                                        <RichTextEditor
                                            key={currentNote.id}
                                            ref={noteEditorRef}
                                            content={currentNote.content}
                                            onChange={(val) => updateSelectedNote('content', val)}
                                            onSelection={handleSelection}
                                            onLinkClick={handleLinkClick}
                                            onAttach={() => setShowDocPicker({ type: 'note', id: currentNote.id })}
                                        />

                                        {/* Tasks in this note section */}
                                        <div className="border-t border-gray-100 bg-gray-50 flex-shrink-0 flex flex-col max-h-[300px]">
                                            <div className="px-6 py-2 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0">
                                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tasks in this note</h3>
                                                <button
                                                    onClick={() => handleAddInlineTask(currentNote.id)}
                                                    disabled={!currentNote}
                                                    className="text-xs flex items-center gap-1 font-bold text-[#3DCD58] hover:bg-[#3DCD58]/10 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Plus className="w-3 h-3" /> Add task
                                                </button>
                                            </div>
                                            <div className="overflow-y-auto p-4 space-y-2">
                                                {(currentNote.inlineTasks || []).length === 0 && (
                                                    <div className="text-center text-gray-400 text-xs italic py-2">No tasks in this note. Add one to track actions.</div>
                                                )}
                                                {(currentNote.inlineTasks || []).map((inlineTask) => {
                                                    const isLinked = !!inlineTask.linkedTaskId;
                                                    return (
                                                        <div key={inlineTask.id} className="flex items-center gap-3 group">
                                                            <input
                                                                type="checkbox"
                                                                checked={inlineTask.isDone}
                                                                onChange={(e) => handleInlineTaskChange(currentNote.id, inlineTask.id, { isDone: e.target.checked })}
                                                                className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                                            />
                                                            <input
                                                                value={inlineTask.text}
                                                                onChange={(e) => handleInlineTaskChange(currentNote.id, inlineTask.id, { text: e.target.value })}
                                                                className={`flex-1 text-sm bg-transparent border-none p-0 focus:ring-0 ${inlineTask.isDone ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                                                                placeholder="Task description..."
                                                            />
                                                            {isLinked ? (
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                                                                        <Link className="w-3 h-3" /> Linked
                                                                    </span>
                                                                    <button
                                                                        onClick={() => {
                                                                            const task = localOpp.tasks.find(t => t.id === inlineTask.linkedTaskId);
                                                                            if (task) handleOpenSplitView(task, currentNote.id);
                                                                        }}
                                                                        className="text-[10px] text-gray-400 hover:text-blue-500 underline flex items-center gap-1"
                                                                        title="Open Split View"
                                                                    >
                                                                        <Columns className="w-3 h-3" /> Split
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleUnlinkInlineTask(currentNote.id, inlineTask)}
                                                                        className="p-1 text-gray-300 hover:text-red-500 rounded"
                                                                        title="Unlink"
                                                                    >
                                                                        <Unlink className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleCreateLinkedTask(currentNote.id, inlineTask)}
                                                                    className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-blue-500 hover:bg-blue-50 px-2 py-1 rounded transition-all"
                                                                >
                                                                    Create linked task
                                                                </button>
                                                            )}
                                                            <button onClick={() => handleDeleteInlineTask(currentNote.id, inlineTask.id)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Linked Items Container (Scrollable) */}
                                    <div className="px-6 pb-4 bg-white border-t border-gray-100 max-h-48 overflow-y-auto">
                                        <LinkedDocsList
                                            key={refreshKey}
                                            opportunityId={opportunity.id}
                                            noteId={currentNote.id}
                                            onNavigateToFile={navigateToFile}
                                            onPreview={() => { }}
                                        />

                                        {/* Linked Tasks Section */}
                                        {getLinkedTasksForNote(currentNote.id).length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-gray-100">
                                                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Linked Tasks (Legacy & Manual Links)</h5>
                                                <div className="flex flex-wrap gap-2">
                                                    {getLinkedTasksForNote(currentNote.id).map(t => (
                                                        <div key={t.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                                                            <CheckSquare className="w-3.5 h-3.5 text-gray-400" />
                                                            <span className="text-xs font-medium text-gray-700">{t.title}</span>
                                                            <button
                                                                onClick={() => { setActiveTab('tasks'); setSelectedTaskForEdit({ task: t }); }}
                                                                className="ml-2 text-[10px] font-bold text-[#3DCD58] hover:underline uppercase"
                                                            >
                                                                Open
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2"><FileText className="w-12 h-12 opacity-10" /><p className="font-bold opacity-30">Select a note to start editing</p></div>}
                        </div>
                        {showQuestionsSplit && (
                            <div className="w-1/3 bg-gray-50 border-l border-gray-200 p-4 overflow-y-auto animate-slide-in-right">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="font-black text-gray-700 uppercase tracking-widest text-xs">Linked Questions</h4>
                                    <button onClick={() => setShowQuestionsSplit(false)} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="space-y-4">
                                    {localOpp.questions.filter(q => q.sourceId === selectedNoteId).map(q => (
                                        <div key={q.id} className={`p-4 rounded-xl border bg-white shadow-sm transition-all ${highlightedQuestionId === q.id ? 'border-[#3DCD58] ring-1 ring-[#3DCD58]/20' : 'border-gray-200'}`}>
                                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-2 border-l-2 border-[#3DCD58] pl-2 italic truncate">"{q.quote}"</div>
                                            <input className="w-full text-sm font-bold text-gray-900 bg-transparent border-none p-0 focus:ring-0" value={q.question} onChange={(e) => updateQuestion(q.id, 'question', e.target.value)} />
                                            <textarea className="w-full text-xs text-gray-500 mt-2 bg-gray-50 border-none p-2 rounded focus:bg-gray-100 transition-colors" value={q.answer} placeholder="Type answer..." onChange={(e) => updateQuestion(q.id, 'answer', e.target.value)} rows={2} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ... Tasks and other tabs unchanged in structure ... */}
                {activeTab === 'tasks' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm min-h-[500px] flex flex-col">
                        {/* Task View Content */}
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                            <div className="flex items-center gap-4">
                                <h3 className="font-black text-gray-800 uppercase tracking-wider">Action Plan</h3>
                                <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                    <button onClick={() => setTaskViewMode('list')} className={`p-1.5 rounded ${taskViewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="List View"><ListIcon className="w-4 h-4" /></button>
                                    <button onClick={() => setTaskViewMode('calendar')} className={`p-1.5 rounded ${taskViewMode === 'calendar' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Calendar View"><CalendarIcon className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                    <input className="pl-8 pr-4 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-[#3DCD58] focus:border-[#3DCD58] w-40" placeholder="Filter tasks..." value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} />
                                </div>
                                {/* CHANGED: Replaced select with MultiSelect for Status Filtering */}
                                <MultiSelect
                                    options={Object.keys(TASK_STATUS_COLORS)}
                                    selected={taskStatusFilters}
                                    onChange={setTaskStatusFilters}
                                    placeholder="All Status"
                                />
                                <button onClick={getStatusSummary} className="text-xs font-bold bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Get Status</button>
                                <button onClick={addTask} className="text-xs font-bold bg-[#3DCD58] text-white px-4 py-2 rounded-lg hover:bg-[#2db64a] shadow-lg shadow-[#3DCD58]/20 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Task</button>
                            </div>
                        </div>

                        {taskViewMode === 'list' && (
                            <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-b border-gray-100">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setTaskSort(taskSort === 'dueDate' ? 'none' : 'dueDate')}
                                        className={`flex items-center gap-1 bg-white border px-2 py-1 rounded text-[10px] font-bold shadow-sm transition-colors ${taskSort === 'dueDate' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                                    >
                                        <CalendarIcon className="w-3 h-3" /> Sort by due date
                                    </button>
                                    <button
                                        onClick={() => setTaskSort(taskSort === 'order' ? 'none' : 'order')}
                                        className={`flex items-center gap-1 bg-white border px-2 py-1 rounded text-[10px] font-bold shadow-sm transition-colors ${taskSort === 'order' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                                    >
                                        <ArrowUpDown className="w-3 h-3" /> Sort by order
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-hidden">
                            {taskViewMode === 'list' ? (
                                <div className="p-6 space-y-3 overflow-y-auto h-full">
                                    {filteredTasks.length === 0 ? (
                                        <div className="py-20 text-center text-gray-400 opacity-20"><ListChecks className="w-20 h-20 mx-auto mb-2" /><p className="font-bold">No tasks found with these filters</p></div>
                                    ) : filteredTasks.map(task => (
                                        <div key={task.id} className="group border border-gray-100 p-4 rounded-xl flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-all hover:border-[#3DCD58]/30 hover:shadow-md" onClick={() => setSelectedTaskForEdit({ task })}>
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="text-xs font-bold text-gray-300 w-6 text-center"
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Execution Order"
                                                >
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent border-none text-center focus:ring-0 p-0 text-gray-400 font-bold"
                                                        placeholder="#"
                                                        value={task.order || ''}
                                                        onChange={(e) => {
                                                            const newOrder = e.target.value ? parseInt(e.target.value) : null;
                                                            const updatedTasks = localOpp.tasks.map(t => t.id === task.id ? { ...t, order: newOrder } : t);
                                                            handleFieldChange('tasks', updatedTasks);
                                                        }}
                                                    />
                                                </div>
                                                <div className={`w-2 h-2 rounded-full ${task.status === 'Done' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                                <div className="flex-1">
                                                    <div className="font-bold text-gray-900 group-hover:text-[#3DCD58] transition-colors">{task.title}</div>
                                                    <div className="text-[10px] font-black uppercase mt-1 flex items-center gap-2">
                                                        <User className="w-3 h-3" /> {task.owner}
                                                        <span className="text-gray-300">|</span>
                                                        <Clock className="w-3 h-3" /> {task.dueDate}
                                                        {(task.externalAreas || []).map(a => <span key={a} className="bg-emerald-50 text-emerald-600 px-1.5 rounded">{a}</span>)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {task.blockDoneUntilDependenciesDone && <Lock className="w-3 h-3 text-gray-400" />}
                                                <div className={`text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-sm ${TASK_STATUS_COLORS[task.status]}`}>{task.status}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-6 h-full">
                                    <CalendarView<Task>
                                        items={filteredTasks}
                                        getDate={(t) => t.dueDate}
                                        onDateDrop={handleTaskDrop}
                                        renderItem={(t) => (
                                            <div
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('id', t.id);
                                                    e.dataTransfer.setData('type', 'task');
                                                }}
                                                onClick={() => setSelectedTaskForEdit({ task: t })}
                                                className="text-[10px] p-1 rounded border border-gray-100 truncate cursor-pointer shadow-sm active:scale-95 transition-transform bg-blue-50 text-blue-700 font-medium"
                                                title={t.title}
                                            >
                                                {t.title}
                                            </div>
                                        )}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Task Edit Modal */}
            {selectedTaskForEdit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !splitViewNoteId && setSelectedTaskForEdit(null)}>
                    <div
                        className={`bg-white shadow-2xl rounded-3xl p-8 animate-slide-in-right relative transition-all duration-300 ${splitViewNoteId ? 'w-[95vw] h-[90vh] grid grid-cols-2 gap-8 overflow-hidden' : 'w-full max-w-2xl max-h-[90vh] overflow-y-auto'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Left Column (Task Editor) */}
                        <div className="flex flex-col h-full overflow-y-auto pr-2">
                            <div className="flex justify-between items-start mb-8 shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-2xl shadow-sm ${TASK_STATUS_COLORS[selectedTaskForEdit.task.status]}`}><ListChecks className="w-6 h-6" /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-gray-900">Task Detail</h2>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{selectedTaskForEdit.task.id}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={copyTaskSummary} className="flex items-center gap-1 text-xs font-bold bg-[#3DCD58]/10 text-[#3DCD58] px-3 py-1.5 rounded-lg hover:bg-[#3DCD58]/20 transition-colors">
                                        <Copy className="w-3 h-3" /> Summary
                                    </button>
                                    {!splitViewNoteId && <button onClick={() => setSelectedTaskForEdit(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-all"><X className="w-6 h-6 text-gray-400" /></button>}
                                </div>
                            </div>

                            <div className="space-y-8 flex-1">
                                <div className="flex items-start gap-4">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Task Title</label>
                                        <input className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0" value={selectedTaskForEdit.task.title} onChange={(e) => updateTaskInModal('title', e.target.value)} />
                                    </div>
                                    <div className="w-24 space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Order</label>
                                        <input type="number" className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0 text-center" value={selectedTaskForEdit.task.order || ''} onChange={(e) => updateTaskInModal('order', e.target.value ? parseInt(e.target.value) : null)} placeholder="#" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Current Status</label>
                                        <select className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 cursor-pointer focus:bg-white transition-all" value={selectedTaskForEdit.task.status} onChange={(e) => updateTaskInModal('status', e.target.value as any)}>{Object.keys(TASK_STATUS_COLORS).map(s => <option key={s}>{s}</option>)}</select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Due Date</label>
                                        <input type="date" className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 focus:bg-white transition-all" value={selectedTaskForEdit.task.dueDate} onChange={(e) => updateTaskInModal('dueDate', e.target.value)} />
                                    </div>
                                </div>

                                <div className="p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Assignment</label>
                                    <div className="flex gap-4 items-center">
                                        <select
                                            className="border-gray-200 rounded-lg text-sm bg-white font-bold p-2"
                                            value={selectedTaskForEdit.task.owner}
                                            onChange={(e) => updateTaskInModal('owner', e.target.value)}
                                        >
                                            <option value="Me">Me</option>
                                            <option value="External Area">External Area</option>
                                        </select>
                                        {selectedTaskForEdit.task.owner === 'External Area' && (
                                            <div className="flex gap-2 flex-1 flex-col">
                                                <MultiSelect
                                                    placeholder="Select Areas"
                                                    options={['Delivery', 'SCM', 'Sales', 'Legal', 'Finance', 'TSC', 'Other']}
                                                    selected={selectedTaskForEdit.task.externalAreas || []}
                                                    onChange={(vals) => updateTaskInModal('externalAreas', vals)}
                                                />
                                                <input placeholder="Person Name" className="border-gray-200 rounded-lg text-sm flex-1 bg-white p-2" value={selectedTaskForEdit.task.responsible || ''} onChange={(e) => updateTaskInModal('responsible', e.target.value)} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Dependency Section */}
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Scheduling & Dependencies</label>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                        <div className="flex-1">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Depends on</label>
                                            <SimpleMultiSelect
                                                placeholder="Select dependencies..."
                                                options={localOpp.tasks.filter(t => t.id !== selectedTaskForEdit.task.id).map(t => ({ id: t.id, label: `${t.order ? `[${t.order}] ` : ''}${t.title}` }))}
                                                selected={selectedTaskForEdit.task.dependsOnTaskIds || []}
                                                onChange={(val) => updateTaskInModal('dependsOnTaskIds', val)}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="blockDoneToggle"
                                                checked={selectedTaskForEdit.task.blockDoneUntilDependenciesDone || false}
                                                onChange={e => updateTaskInModal('blockDoneUntilDependenciesDone', e.target.checked)}
                                                className="rounded text-[#3DCD58] focus:ring-[#3DCD58]"
                                            />
                                            <label htmlFor="blockDoneToggle" className="text-[10px] font-bold text-gray-600 uppercase select-none cursor-pointer flex items-center gap-1">
                                                <Lock className="w-3 h-3 text-gray-400" />
                                                Block Done until dependencies are done
                                            </label>
                                        </div>

                                        {/* Dependency Status Preview */}
                                        {selectedTaskForEdit.task.dependsOnTaskIds && selectedTaskForEdit.task.dependsOnTaskIds.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-gray-200/50">
                                                {selectedTaskForEdit.task.dependsOnTaskIds.map(depId => {
                                                    const depTask = localOpp.tasks.find(t => t.id === depId);
                                                    if (!depTask) return null;
                                                    return (
                                                        <div key={depId} className="flex items-center gap-2 text-xs py-0.5">
                                                            <div className={`w-2 h-2 rounded-full ${depTask.status === 'Done' ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                            <span className={`${depTask.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>{depTask.title}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Detailed Description</label>
                                    <textarea className="w-full border-gray-100 bg-gray-50 rounded-2xl text-sm min-h-[120px] p-4 shadow-inner focus:bg-white transition-all focus:ring-0" value={selectedTaskForEdit.task.description} onChange={(e) => updateTaskInModal('description', e.target.value)} />
                                </div>

                                {/* DOCUMENT LINKS */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Documents</label>
                                        <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => setShowDocPicker({ type: 'task', id: selectedTaskForEdit.task.id })}>+ Link Doc</button>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl">
                                        <LinkedDocsList key={refreshKey} opportunityId={opportunity.id} taskId={selectedTaskForEdit.task.id} onNavigateToFile={navigateToFile} />
                                    </div>
                                </div>

                                {/* NOTE LINKS */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Notes</label>
                                        <button
                                            className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline"
                                            onClick={() => setShowNotePickerForTask(selectedTaskForEdit.task.id)}
                                        >
                                            + Link Note
                                        </button>
                                    </div>

                                    {showNotePickerForTask === selectedTaskForEdit.task.id && (
                                        <div className="relative z-10 p-4 bg-white border border-gray-200 shadow-lg rounded-xl mb-4 animate-fade-in">
                                            <div className="flex justify-between items-center mb-3">
                                                <h5 className="font-bold text-sm">Select Notes</h5>
                                                <button onClick={() => setShowNotePickerForTask(null)}><X className="w-4 h-4 text-gray-400" /></button>
                                            </div>
                                            <input
                                                className="w-full text-xs border-gray-200 rounded-lg mb-2"
                                                placeholder="Search notes..."
                                                value={noteSearch}
                                                onChange={(e) => setNoteSearch(e.target.value)}
                                            />
                                            <div className="max-h-40 overflow-y-auto space-y-1 mb-3">
                                                {localOpp.notes.filter(n => n.title.toLowerCase().includes(noteSearch.toLowerCase())).map(n => (
                                                    <label key={n.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedNotesToLink.includes(n.id)}
                                                            onChange={() => {
                                                                if (selectedNotesToLink.includes(n.id)) setSelectedNotesToLink(prev => prev.filter(id => id !== n.id));
                                                                else setSelectedNotesToLink(prev => [...prev, n.id]);
                                                            }}
                                                            className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-300"
                                                        />
                                                        <span className="text-xs truncate">{n.title}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => linkNotesToTask(selectedTaskForEdit.task.id, selectedNotesToLink)}
                                                className="w-full bg-[#3DCD58] text-white text-xs font-bold py-2 rounded-lg"
                                            >
                                                Link Selected
                                            </button>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {(selectedTaskForEdit.task.linkedNoteIds || [selectedTaskForEdit.task.linkedNoteId]).filter(Boolean).map((nid) => {
                                            const note = localOpp.notes.find(n => n.id === nid);
                                            if (!note) return null;
                                            return (
                                                <div key={nid} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-[#3DCD58] transition-all bg-white group">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="w-4 h-4 text-gray-400 group-hover:text-[#3DCD58]" />
                                                        <span className="text-sm font-medium">{note.title}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => { setSelectedTaskForEdit(null); setActiveTab('notes'); setSelectedNoteId(note.id); }}
                                                            className="text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] uppercase px-2 py-1 bg-gray-50 rounded"
                                                        >
                                                            Open Note
                                                        </button>
                                                        <button
                                                            onClick={() => setSplitViewNoteId(note.id)}
                                                            className="text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] uppercase px-2 py-1 bg-gray-50 rounded flex items-center gap-1"
                                                        >
                                                            <Columns className="w-3 h-3" /> Split View
                                                        </button>
                                                        <button
                                                            onClick={() => unlinkNoteFromTask(selectedTaskForEdit.task.id, note.id)}
                                                            className="text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase px-2 py-1 bg-gray-50 rounded"
                                                            title="Unlink"
                                                        >
                                                            <Unlink className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {!selectedTaskForEdit.task.linkedNoteIds?.length && !selectedTaskForEdit.task.linkedNoteId && (
                                            <div className="text-center py-4 text-gray-300 text-xs italic">No notes linked</div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sub-Tasks Checklist</label>
                                        <button className="text-[10px] font-black text-[#3DCD58] uppercase hover:underline" onClick={() => updateTaskInModal('subtasks', [...selectedTaskForEdit.task.subtasks, { id: crypto.randomUUID(), title: 'New Sub-task', completed: false }])}>+ Add Entry</button>
                                    </div>
                                    <div className="space-y-2 bg-gray-50 p-4 rounded-2xl">
                                        {selectedTaskForEdit.task.subtasks.map((sub, idx) => (
                                            <div key={sub.id} className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm group">
                                                <div className="flex flex-col -space-y-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => moveSubtask(idx, 'up')} disabled={idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-0"><ChevronUp className="w-4 h-4" /></button>
                                                    <button onClick={() => moveSubtask(idx, 'down')} disabled={idx === selectedTaskForEdit.task.subtasks.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-0"><ChevronDown className="w-4 h-4" /></button>
                                                </div>
                                                <input type="checkbox" className="w-5 h-5 rounded border-gray-200 text-[#3DCD58] focus:ring-[#3DCD58]" checked={sub.completed} onChange={(e) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, completed: e.target.checked } : s))} />
                                                <input className={`flex-1 border-none focus:ring-0 p-0 text-sm font-medium ${sub.completed ? 'line-through text-gray-300' : 'text-gray-700'}`} value={sub.title} onChange={(e) => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.map(s => s.id === sub.id ? { ...s, title: e.target.value } : s))} />
                                                <button onClick={() => updateTaskInModal('subtasks', selectedTaskForEdit.task.subtasks.filter(s => s.id !== sub.id))} className="text-gray-200 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-6 border-t flex justify-between gap-4">
                                    <button onClick={deleteTaskInModal} className="px-6 py-3 rounded-2xl text-sm font-black uppercase text-red-500 hover:bg-red-50 transition-all border border-red-100">Delete Task</button>
                                    {!splitViewNoteId && <button onClick={() => setSelectedTaskForEdit(null)} className="flex-1 bg-gray-900 text-white px-6 py-3 rounded-2xl text-sm font-black uppercase shadow-xl hover:shadow-gray-900/20 active:scale-95 transition-all">Close & Save</button>}
                                </div>
                            </div>
                        </div>

                        {/* Right Column (Split View Note Editor) */}
                        {splitViewNoteId && (
                            <div className="flex flex-col h-full border-l border-gray-100 pl-8 overflow-hidden">
                                <div className="flex justify-between items-center mb-4 shrink-0">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-[#3DCD58]" />
                                        {localOpp.notes.find(n => n.id === splitViewNoteId)?.title}
                                    </h3>
                                    <button
                                        onClick={() => setSplitViewNoteId(null)}
                                        className="text-xs font-bold uppercase bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        Close Split View
                                    </button>
                                </div>
                                <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                                    <RichTextEditor
                                        key={splitViewNoteId}
                                        content={localOpp.notes.find(n => n.id === splitViewNoteId)?.content || ''}
                                        onChange={(val) => updateNoteById(splitViewNoteId, 'content', val)}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showDocPicker && (
                <DocumentPickerModal
                    opportunityId={opportunity.id}
                    multi={true}
                    onSelect={handleDocSelect}
                    onClose={() => setShowDocPicker(null)}
                    title={`Link documents to ${showDocPicker.type}`}
                />
            )}

            {showAddAreaModal && (
                <AddAreaModal
                    availableAreas={(trackedAreas || []).filter(ta => !((localOpp.kpis?.areasInvolved || []).some(a => a.area === ta)))}
                    onAdd={(areaName) => {
                        addKpiArea(areaName);
                        setShowAddAreaModal(false);
                    }}
                    onClose={() => setShowAddAreaModal(false)}
                />
            )}
        </div>
    );
};

export default OpportunityDetail;
