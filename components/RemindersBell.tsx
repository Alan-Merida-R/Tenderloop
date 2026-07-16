import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Trash2, X } from 'lucide-react';
import { Reminder, Opportunity, Task } from '../types';

interface RemindersBellProps {
    reminders: Reminder[];
    opportunities: Opportunity[];
    onAdd: (reminder: Omit<Reminder, 'id' | 'createdAt'>) => void;
    onUpdate: (id: string, changes: Partial<Reminder>) => void;
    onDelete: (id: string) => void;
    onOpenReminder: (opportunityId: string, taskId?: string, noteId?: string) => void;
}

/** Reminders can only be linked to opportunities still in play — not Completed or Canceled. */
const isEligibleForReminder = (opp: Opportunity) =>
    opp.detailedStatus !== 'Completed' && opp.detailedStatus !== 'Canceled' && opp.statusLabel !== 'Canceled';

export interface SearchableOption {
    id: string;
    label: string;
}

/**
 * Single-select combobox with its own text filter and its own outside-click
 * handling scoped to a local ref — never touches the parent bell popover's
 * open state, so picking an option can't accidentally close the whole panel.
 */
export const SearchableSelect: React.FC<{
    value: string;
    onChange: (id: string) => void;
    options: SearchableOption[];
    placeholder: string;
    disabled?: boolean;
}> = ({ value, onChange, options, placeholder, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find(o => o.id === value);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const filtered = useMemo(
        () => options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())),
        [options, query]
    );

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(o => !o)}
                className="w-full text-left border border-gray-200 rounded-lg text-sm p-2 bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed truncate"
            >
                {selected ? selected.label : <span className="text-gray-400">{placeholder}</span>}
            </button>
            {isOpen && !disabled && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col overflow-hidden">
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search…"
                        className="border-b border-gray-100 text-sm p-2 focus:ring-0 focus:border-[#3DCD58]"
                        autoFocus
                    />
                    <div className="max-h-40 overflow-y-auto">
                        {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No matches</p>}
                        {filtered.map(o => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => { onChange(o.id); setQuery(''); setIsOpen(false); }}
                                className={`w-full text-left text-sm px-2 py-1.5 hover:bg-gray-50 truncate ${o.id === value ? 'bg-emerald-50 text-[#3DCD58] font-medium' : 'text-gray-700'}`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad2 = (n: number) => String(n).padStart(2, '0');

interface DateTimeParts {
    year: number;
    month: number; // 1-12
    day: number;
    hour: number;
    minute: number;
}

const partsFromWhen = (isoLocal: string): DateTimeParts => {
    if (isoLocal) {
        const [datePart, timePart] = isoLocal.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = (timePart || '00:00').split(':').map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) return { year, month, day, hour: hour || 0, minute: minute || 0 };
    }
    const d = new Date(Date.now() + 30 * 60 * 1000);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
};

const whenFromParts = (p: DateTimeParts): string =>
    `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;

const daysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();

/** Weeks of cells for a given month, padded with `null` so every row has 7 slots (Sun–Sat). */
const buildCalendarWeeks = (year: number, month: number): (number | null)[][] => {
    const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
    const total = daysInMonth(year, month);
    const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
};

/**
 * Own mini calendar (month grid with weekday headers) + hour/minute selects —
 * deliberately not the native datetime-local calendar popup, whose dismissal
 * behavior is confusing (no reliable way back to the rest of the form after
 * picking a day).
 */
export const DateTimePicker: React.FC<{ value: string; onConfirm: (isoLocal: string) => void; onCancel: () => void }> = ({ value, onConfirm, onCancel }) => {
    const [parts, setParts] = useState<DateTimeParts>(() => partsFromWhen(value));

    const changeMonth = (delta: number) => {
        setParts(prev => {
            let month = prev.month + delta;
            let year = prev.year;
            if (month < 1) { month = 12; year -= 1; }
            if (month > 12) { month = 1; year += 1; }
            return { ...prev, year, month, day: Math.min(prev.day, daysInMonth(year, month)) };
        });
    };

    const weeks = useMemo(() => buildCalendarWeeks(parts.year, parts.month), [parts.year, parts.month]);
    const today = new Date();
    const hours12 = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
    const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
    const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
    const meridiem: 'AM' | 'PM' = parts.hour < 12 ? 'AM' : 'PM';
    const setHour12 = (h12: number) => setParts(prev => {
        const isPM = prev.hour >= 12;
        return { ...prev, hour: (h12 % 12) + (isPM ? 12 : 0) };
    });
    const setMeridiem = (m: 'AM' | 'PM') => setParts(prev => {
        const h12 = prev.hour % 12 === 0 ? 12 : prev.hour % 12;
        return { ...prev, hour: (h12 % 12) + (m === 'PM' ? 12 : 0) };
    });

    return (
        <div className="border border-gray-200 rounded-lg p-2 space-y-2 bg-gray-50">
            <div className="flex items-center justify-between px-0.5">
                <button type="button" onClick={() => changeMonth(-1)} className="p-1 rounded hover:bg-gray-200 text-gray-500" title="Previous month">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-gray-700">{MONTH_NAMES[parts.month - 1]} {parts.year}</span>
                <button type="button" onClick={() => changeMonth(1)} className="p-1 rounded hover:bg-gray-200 text-gray-500" title="Next month">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
                {WEEKDAY_LABELS.map(w => <span key={w} className="text-[10px] font-bold text-gray-400 py-1">{w}</span>)}
                {weeks.flat().map((day, i) => {
                    if (day == null) return <span key={i} />;
                    const isSelected = day === parts.day;
                    const isToday = day === today.getDate() && parts.month === today.getMonth() + 1 && parts.year === today.getFullYear();
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setParts(prev => ({ ...prev, day }))}
                            className={`text-xs rounded-lg py-1 transition-colors ${isSelected ? 'bg-[#3DCD58] text-white font-bold' : isToday ? 'bg-emerald-50 text-[#3DCD58] font-bold' : 'text-gray-700 hover:bg-gray-200'}`}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
                <select value={hour12} onChange={e => setHour12(Number(e.target.value))} className="border-gray-200 rounded-lg text-sm p-1.5 focus:border-[#3DCD58] focus:ring-0">
                    {hours12.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <select value={parts.minute} onChange={e => setParts(prev => ({ ...prev, minute: Number(e.target.value) }))} className="border-gray-200 rounded-lg text-sm p-1.5 focus:border-[#3DCD58] focus:ring-0">
                    {minutes.map(m => <option key={m} value={m}>{pad2(m)}min</option>)}
                </select>
                <select value={meridiem} onChange={e => setMeridiem(e.target.value as 'AM' | 'PM')} className="border-gray-200 rounded-lg text-sm p-1.5 focus:border-[#3DCD58] focus:ring-0">
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                </select>
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => onConfirm(whenFromParts(parts))}
                    className="flex-1 py-1.5 text-sm font-medium bg-[#3DCD58] text-white rounded-lg hover:bg-[#34b34c] transition-colors"
                >
                    OK
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export const RemindersBell: React.FC<RemindersBellProps> = ({ reminders, opportunities, onAdd, onUpdate, onDelete, onOpenReminder }) => {
    const [open, setOpen] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showUpcoming, setShowUpcoming] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newWhen, setNewWhen] = useState('');
    const [newOppId, setNewOppId] = useState('');
    const [newTaskId, setNewTaskId] = useState('');
    const [pickingDate, setPickingDate] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const now = Date.now();
    const dueCount = useMemo(
        () => reminders.filter(r => !r.seenAt && new Date(r.dueAt).getTime() <= now).length,
        [reminders, now]
    );

    const { due, upcoming } = useMemo(() => {
        const due: Reminder[] = [];
        const upcoming: Reminder[] = [];
        [...reminders]
            .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
            .forEach(r => {
                if (r.seenAt) return;
                if (new Date(r.dueAt).getTime() <= now) due.push(r);
                else upcoming.push(r);
            });
        return { due, upcoming };
    }, [reminders, now]);

    const opportunityById = useMemo(() => new Map(opportunities.map(o => [o.id, o])), [opportunities]);
    const eligibleOpportunities = useMemo(() => opportunities.filter(isEligibleForReminder), [opportunities]);
    const oppOptions: SearchableOption[] = useMemo(
        () => eligibleOpportunities.map(o => ({ id: o.id, label: o.alias || o.title })),
        [eligibleOpportunities]
    );
    const newOppTasks: Task[] = opportunityById.get(newOppId)?.tasks || [];
    const taskOptions: SearchableOption[] = useMemo(
        () => newOppTasks.map(t => ({ id: t.id, label: t.title })),
        [newOppTasks]
    );

    // Close on Escape or on a click on the invisible full-screen backdrop only —
    // NOT on a generic document-wide mousedown, which used to misfire while
    // interacting with the native date/time picker and closed the whole panel
    // (losing the in-progress reminder) before the user could finish it.
    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setOpen(false); setShowForm(false); setPickingDate(false); }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open]);

    const resetForm = () => {
        setNewTitle('');
        setNewWhen('');
        setNewOppId('');
        setNewTaskId('');
        setPickingDate(false);
        setShowForm(false);
        setEditingId(null);
    };

    const startEdit = (r: Reminder) => {
        setEditingId(r.id);
        setNewTitle(r.title);
        setNewWhen(r.dueAt.slice(0, 16));
        setNewOppId(r.opportunityId);
        setNewTaskId(r.taskId || '');
        setPickingDate(false);
        setShowForm(true);
        setShowUpcoming(false);
    };

    const submitNew = () => {
        if (!newTitle.trim() || !newWhen || !newOppId) return;
        const dueAt = new Date(newWhen).toISOString();
        if (editingId) {
            onUpdate(editingId, { title: newTitle.trim(), dueAt, opportunityId: newOppId, taskId: newTaskId || undefined });
        } else {
            onAdd({ title: newTitle.trim(), dueAt, opportunityId: newOppId, taskId: newTaskId || undefined });
        }
        resetForm();
    };

    const dismissAllDue = () => due.forEach(r => onDelete(r.id));

    const renderRow = (r: Reminder, isDue: boolean) => {
        const opp = opportunityById.get(r.opportunityId);
        const task = r.taskId ? opp?.tasks.find(t => t.id === r.taskId) : undefined;
        const note = r.noteId ? opp?.notes.find(n => n.id === r.noteId) : undefined;
        const oppLabel = opp ? (opp.alias || opp.title) : null;
        return (
            <div key={r.id} className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => { onOpenReminder(r.opportunityId, r.taskId, r.noteId); setOpen(false); }}
                >
                    <p className="text-sm text-gray-800 truncate">{r.title}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                        {new Date(r.dueAt).toLocaleString()}
                        {oppLabel && ` · ${oppLabel}`}
                        {task && ` · ${task.title}`}
                        {note && ` · ${note.title}`}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {isDue ? (
                        <button onClick={() => onDelete(r.id)} title="Done — no longer need to see this" className="p-1 rounded hover:bg-emerald-100 text-emerald-600">
                            <Check className="w-3.5 h-3.5" />
                        </button>
                    ) : (
                        <button onClick={() => startEdit(r)} title="Edit" className="p-1 rounded hover:bg-blue-100 text-blue-500">
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button onClick={() => onDelete(r.id)} title="Delete" className="p-1 rounded hover:bg-red-100 text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setOpen(o => !o)}
                className="relative flex items-center justify-center w-9 h-9 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                title="Reminders"
            >
                <Bell className="w-4 h-4" />
                {dueCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {dueCount}
                    </span>
                )}
            </button>

            {open && (
                <>
                    {/* Invisible backdrop: closing only happens on an explicit click here,
                        so interacting with nested pickers/comboboxes never closes the panel. */}
                    <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowForm(false); setPickingDate(false); }} />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-visible" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Reminders</span>
                            {due.length > 0 && (
                                <button onClick={dismissAllDue} className="text-[11px] font-medium text-[#3DCD58] hover:underline">
                                    Dismiss all
                                </button>
                            )}
                        </div>

                        <div className="max-h-72 overflow-y-auto">
                            {due.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-6">Nothing due right now.</p>
                            )}
                            {due.map(r => renderRow(r, true))}

                            <button
                                onClick={() => setShowUpcoming(v => !v)}
                                className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide hover:bg-gray-50 border-t border-gray-100"
                            >
                                <span>Upcoming ({upcoming.length})</span>
                                {showUpcoming ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {showUpcoming && (
                                upcoming.length === 0
                                    ? <p className="text-xs text-gray-400 text-center py-4">No upcoming reminders.</p>
                                    : upcoming.map(r => renderRow(r, false))
                            )}
                        </div>

                        <div className="border-t border-gray-100 p-2">
                            {!showForm ? (
                                <button
                                    onClick={() => setShowForm(true)}
                                    className="w-full py-2 text-sm font-medium text-[#3DCD58] hover:bg-emerald-50 rounded-lg transition-colors"
                                >
                                    + New reminder
                                </button>
                            ) : (
                                <div className="space-y-2 p-1">
                                    <input
                                        type="text"
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        placeholder="Reminder title"
                                        className="w-full border-gray-200 rounded-lg text-sm p-2 focus:border-[#3DCD58] focus:ring-0"
                                        autoFocus
                                    />
                                    <SearchableSelect
                                        value={newOppId}
                                        onChange={id => { setNewOppId(id); setNewTaskId(''); }}
                                        options={oppOptions}
                                        placeholder="Select opportunity…"
                                    />
                                    <SearchableSelect
                                        value={newTaskId}
                                        onChange={setNewTaskId}
                                        options={taskOptions}
                                        placeholder={newOppId ? 'Link a task (optional)…' : 'Select an opportunity first'}
                                        disabled={!newOppId}
                                    />

                                    {!pickingDate ? (
                                        <button
                                            type="button"
                                            onClick={() => setPickingDate(true)}
                                            className="w-full text-left border border-gray-200 rounded-lg text-sm p-2 bg-white hover:bg-gray-50"
                                        >
                                            {newWhen ? new Date(newWhen).toLocaleString() : <span className="text-gray-400">Pick date &amp; time…</span>}
                                        </button>
                                    ) : (
                                        <DateTimePicker
                                            value={newWhen}
                                            onConfirm={(isoLocal) => { setNewWhen(isoLocal); setPickingDate(false); }}
                                            onCancel={() => setPickingDate(false)}
                                        />
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={submitNew}
                                            disabled={!newTitle.trim() || !newWhen || !newOppId}
                                            className="flex-1 py-1.5 text-sm font-medium bg-[#3DCD58] text-white rounded-lg hover:bg-[#34b34c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {editingId ? 'Update' : 'Save'}
                                        </button>
                                        <button
                                            onClick={resetForm}
                                            className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
