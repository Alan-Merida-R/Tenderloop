import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Check, ChevronDown, ChevronUp, Copy, Sparkles, Trash2, X } from 'lucide-react';
import { Opportunity, Reminder } from '../../types';
import { isOpportunitySchedulable, isTaskActive } from '../schedule/scheduleHelpers';
import { createBlock } from '../schedule/executionBlockUtils';
import { buildOrganizerPrompt, ORGANIZER_CHIPS, TimeRange } from './promptBuilder';
import { ParsedDueDateRow, ParsedOpportunityAssessment, ParsedReminderRow, ParsedScheduleRow, parseOrganizerResponse } from './responseParser';
import { QuickOrganizerIntro } from './QuickOrganizerIntro';
import { QuickOrganizerReview } from './QuickOrganizerReview';

interface Props {
    opportunities: Opportunity[];
    reminders: Reminder[];
    userName: string;
    onOppUpdate: (updated: Opportunity, id?: string, immediate?: boolean) => void;
    onAddReminder: (reminder: Omit<Reminder, 'id' | 'createdAt'>) => void;
    onDeleteReminder: (id: string) => void;
    onClose: () => void;
    /** Called right after a plan is accepted — the host navigates to the Tasks view in Agenda mode. */
    onPlanAccepted?: () => void;
}

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 px-2 py-1 focus:border-[#3DCD58] focus:ring-0 w-full';

interface DayOption {
    iso: string; // YYYY-MM-DD
    weekday: string; // "Mon"
    dayNum: number;
    isToday: boolean;
}

/** Today through the same weekday next week (8 days, inclusive). */
const buildDayWindow = (): DayOption[] => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 8 }, (_, i) => {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        return {
            iso: d.toLocaleDateString('en-CA'),
            weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
            dayNum: d.getDate(),
            isToday: i === 0,
        };
    });
};

export const QuickOrganizerView: React.FC<Props> = ({ opportunities, reminders, userName, onOppUpdate, onAddReminder, onDeleteReminder, onClose, onPlanAccepted }) => {
    const [phase, setPhase] = useState<'intro' | 'main' | 'review'>('intro');
    const [extraInstructions, setExtraInstructions] = useState('');
    const [activeChipIds, setActiveChipIds] = useState<string[]>([]);
    const [recommendationLanguage, setRecommendationLanguage] = useState<'en' | 'es'>('es');
    const dayWindow = useMemo(buildDayWindow, []);

    const eligibleOpps = useMemo(
        () => opportunities
            .filter(isOpportunitySchedulable)
            .filter(opp => (opp.tasks || []).some(isTaskActive))
            .map(opp => ({ id: opp.id, label: opp.alias || opp.title, taskCount: (opp.tasks || []).filter(isTaskActive).length, expected: opp.dates?.expected || '', quoteType: opp.quoteType || 'Unspecified', pendingDays: opp.dates?.requested ? Math.max(0, Math.floor((Date.now() - new Date(`${opp.dates.requested}T00:00:00`).getTime()) / 86400000)) : null })),
        [opportunities]
    );
    // Keep the prompt intentionally small: an empty selection excludes all opportunities.
    const [selectedOppIds, setSelectedOppIds] = useState<string[]>(() => opportunities.filter(isOpportunitySchedulable).filter(opp => (opp.tasks || []).some(isTaskActive)).map(opp => opp.id).slice(0, 8));
    const toggleOpp = (id: string) => setSelectedOppIds(prev => prev.includes(id) ? prev.filter(o => o !== id) : prev.length < 8 ? [...prev, id] : prev);
    const moveOpp = (id: string, direction: -1 | 1) => setSelectedOppIds(prev => { const index = prev.indexOf(id); const target = index + direction; if (index < 0 || target < 0 || target >= prev.length) return prev; const next = [...prev]; [next[index], next[target]] = [next[target], next[index]]; return next; });
    // Keyed by ISO date; presence of a key = that date is selected. Each date starts with one
    // default 08:00–17:00 range, editable/removable/addable — "which lapsos do I want to work
    // that day," per date.
    const [timeRangesByDate, setTimeRangesByDate] = useState<Record<string, TimeRange[]>>({});
    const isDaySelected = (iso: string) => iso in timeRangesByDate;
    const toggleDate = (iso: string) => setTimeRangesByDate(prev => {
        if (iso in prev) {
            const next = { ...prev };
            delete next[iso];
            return next;
        }
        return { ...prev, [iso]: [{ start: '08:00', end: '17:00' }] };
    });
    const selectNextWorkWeek = () => {
        const nextFive = dayWindow.filter(day => {
            const weekday = new Date(`${day.iso}T00:00:00`).getDay();
            return weekday >= 1 && weekday <= 5;
        }).slice(0, 5);
        setTimeRangesByDate(Object.fromEntries(nextFive.map(day => [day.iso, [{ start: '08:00', end: '17:00' }]])));
    };
    const addRange = (iso: string) => setTimeRangesByDate(prev => ({ ...prev, [iso]: [...(prev[iso] || []), { start: '08:00', end: '17:00' }] }));
    const removeRange = (iso: string, idx: number) => setTimeRangesByDate(prev => ({ ...prev, [iso]: (prev[iso] || []).filter((_, i) => i !== idx) }));
    const updateRange = (iso: string, idx: number, patch: Partial<TimeRange>) => setTimeRangesByDate(prev => ({
        ...prev,
        [iso]: (prev[iso] || []).map((r, i) => i === idx ? { ...r, ...patch } : r),
    }));
    const todayLabel = useMemo(() => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), []);
    const [prompt, setPrompt] = useState('');
    const [promptDirty, setPromptDirty] = useState(false);
    const [copied, setCopied] = useState(false);

    const [pasteText, setPasteText] = useState('');
    const [scheduleRows, setScheduleRows] = useState<ParsedScheduleRow[]>([]);
    const [reminderRows, setReminderRows] = useState<ParsedReminderRow[]>([]);
    const [dueDateRows, setDueDateRows] = useState<ParsedDueDateRow[]>([]);
    const [parseErrors, setParseErrors] = useState<{ section: string; line: string; reason: string }[]>([]);
    const [recommendations, setRecommendations] = useState<string[]>([]);
    const [paretoInsights, setParetoInsights] = useState<string[]>([]);
    const [blockerInsights, setBlockerInsights] = useState<string[]>([]);
    const [deliveryInsights, setDeliveryInsights] = useState<string[]>([]);
    const [missingTaskInsights, setMissingTaskInsights] = useState<string[]>([]);
    const [opportunityAssessments, setOpportunityAssessments] = useState<ParsedOpportunityAssessment[]>([]);
    const [applied, setApplied] = useState(false);

    const stats = useMemo(() => {
        let eligibleTasks = 0, alreadyScheduled = 0, opps = 0;
        for (const opp of opportunities) {
            if (!isOpportunitySchedulable(opp)) continue;
            const tasks = (opp.tasks || []).filter(isTaskActive);
            if (!tasks.length) continue;
            opps++;
            eligibleTasks += tasks.length;
            alreadyScheduled += tasks.filter(t => (t.executionBlocks?.length ?? 0) > 0).length;
        }
        return { eligibleTasks, alreadyScheduled, opps };
    }, [opportunities]);

    const generatedPrompt = useMemo(
        () => buildOrganizerPrompt(opportunities, { userName, extraInstructions, activeChipIds, dayWindows: timeRangesByDate, oppIds: selectedOppIds, recommendationLanguage, reminders }),
        [opportunities, userName, extraInstructions, activeChipIds, timeRangesByDate, selectedOppIds, recommendationLanguage, reminders]
    );

    // Keep the editable prompt in sync with instructions/chips until the user
    // hand-edits it directly — at that point we stop overwriting their edits.
    useEffect(() => {
        if (!promptDirty) setPrompt(generatedPrompt);
    }, [generatedPrompt, promptDirty]);

    const toggleChip = (id: string) => {
        setActiveChipIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard permission denied — user can still select+copy manually */ }
    };

    const handleParse = () => {
        const result = parseOrganizerResponse(pasteText, opportunities, { dayWindows: timeRangesByDate });
        setScheduleRows(result.scheduleRows);
        const tasksWithCurrentReminder = new Set(reminders
            .filter(reminder => !reminder.seenAt)
            .filter(reminder => reminder.taskId)
            .map(reminder => `${reminder.opportunityId}::${reminder.taskId}`));
        const importedTaskKeys = new Set<string>();
        setReminderRows(result.reminderRows.filter(row => {
            const key = `${row.oppId}::${row.taskId}`;
            if (tasksWithCurrentReminder.has(key) || importedTaskKeys.has(key)) return false;
            importedTaskKeys.add(key);
            return true;
        }));
        setParseErrors(
            result.scheduleRows.length || result.reminderRows.length || result.dueDateRows.length
                ? result.errors
                : [...result.errors, { section: 'FORMAT', line: '', reason: 'No structured SCHEDULE, PROPOSED_DUE_DATES or REMINDERS rows were detected. Review the imported analysis, then go back and ask the AI to reproduce the exact table format.' }]
        );
        setRecommendations(result.recommendations);
        setParetoInsights(result.paretoInsights);
        setBlockerInsights(result.blockerInsights);
        setDeliveryInsights(result.deliveryInsights);
        setMissingTaskInsights(result.missingTaskInsights);
        setOpportunityAssessments(result.opportunityAssessments);
        const importedDueDateKeys = new Set<string>();
        setDueDateRows(result.dueDateRows.filter(row => {
            const key = `${row.oppId}::${row.taskId}`;
            if (importedDueDateKeys.has(key)) return false;
            importedDueDateKeys.add(key);
            return true;
        }));
        setApplied(false);
        // Always open review after a non-empty paste. Even a partially malformed answer
        // must be inspectable so the user is never trapped on the paste screen.
        if (pasteText.trim()) setPhase('review');
    };

    const removeScheduleRow = (id: string) => setScheduleRows(prev => prev.filter(r => r.id !== id));
    const removeReminderRow = (id: string) => setReminderRows(prev => prev.filter(r => r.id !== id));
    const removeDueDateRow = (id: string) => setDueDateRows(prev => prev.filter(r => r.id !== id));

    const updateScheduleRow = (id: string, patch: Partial<ParsedScheduleRow>) =>
        setScheduleRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const updateReminderRow = (id: string, patch: Partial<ParsedReminderRow>) =>
        setReminderRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const updateDueDateRow = (id: string, patch: Partial<ParsedDueDateRow>) => setDueDateRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row));

    const scheduleTaskInDraft = (oppId: string, taskId: string) => {
        const opp = opportunities.find(o => o.id === oppId);
        const task = opp?.tasks?.find(t => t.id === taskId);
        if (!opp || !task) return;
        const allowedDates = Object.keys(timeRangesByDate).sort();
        const today = new Date().toLocaleDateString('en-CA');
        const date = task.dueDate && task.dueDate >= today && (!allowedDates.length || allowedDates.includes(task.dueDate))
            ? task.dueDate
            : allowedDates[0] || today;
        const range = timeRangesByDate[date]?.[0] || { start: '09:00', end: '10:00' };
        setScheduleRows(prev => [...prev, {
            id: `draft-${Date.now()}-${oppId}-${taskId}`,
            key: `${oppId}::${taskId}`,
            oppId,
            taskId,
            oppLabel: opp.alias || opp.title,
            taskLabel: task.title,
            date,
            startTime: range.start,
            endTime: range.end,
            note: 'Added during plan review',
        }]);
    };

    const handleApply = () => {
        const selectedSet = new Set(selectedOppIds);
        for (const reminder of reminders) {
            if (!selectedSet.has(reminder.opportunityId)) continue;
            const opp = opportunities.find(item => item.id === reminder.opportunityId);
            const task = reminder.taskId ? opp?.tasks?.find(item => item.id === reminder.taskId) : undefined;
            const obsolete = Boolean(reminder.seenAt)
                || new Date(reminder.dueAt).getTime() < Date.now()
                || Boolean(reminder.taskId && (!task || task.status === 'Done' || task.status === 'Canceled'));
            if (obsolete) onDeleteReminder(reminder.id);
        }
        const byOpp = new Map<string, Map<string, ParsedScheduleRow[]>>();
        for (const row of scheduleRows) {
            if (!byOpp.has(row.oppId)) byOpp.set(row.oppId, new Map());
            const byTask = byOpp.get(row.oppId)!;
            if (!byTask.has(row.taskId)) byTask.set(row.taskId, []);
            byTask.get(row.taskId)!.push(row);
        }

        const affectedOppIds = new Set([...byOpp.keys(), ...dueDateRows.map(row => row.oppId)]);
        for (const oppId of affectedOppIds) {
            const byTask = byOpp.get(oppId) || new Map<string, ParsedScheduleRow[]>();
            const opp = opportunities.find(o => o.id === oppId);
            if (!opp) continue;
            const updatedTasks = opp.tasks.map(t => {
                const rows = byTask.get(t.id);
                const proposedDueDate = dueDateRows.find(row => row.oppId === oppId && row.taskId === t.id)?.date;
                if (!rows && !proposedDueDate) return t;
                // Replace (not append) — a re-run always fully reschedules the task.
                const blocks = rows ? rows.map(r => createBlock(r.date, r.startTime, r.endTime)) : t.executionBlocks;
                return { ...t, executionBlocks: blocks, ...(proposedDueDate ? { dueDate: proposedDueDate } : {}) };
            });
            onOppUpdate({ ...opp, tasks: updatedTasks, lastUpdated: new Date().toISOString() }, oppId, true);
        }

        const existingTaskReminders = new Set(reminders
            .filter(reminder => !reminder.seenAt)
            .filter(reminder => reminder.taskId)
            .map(reminder => `${reminder.opportunityId}::${reminder.taskId}`));
        for (const row of reminderRows) {
            const due = new Date(row.remindAt);
            if (isNaN(due.getTime())) continue;
            const taskKey = `${row.oppId}::${row.taskId}`;
            if (existingTaskReminders.has(taskKey)) continue;
            existingTaskReminders.add(taskKey);
            onAddReminder({ title: row.title, dueAt: due.toISOString(), opportunityId: row.oppId, taskId: row.taskId });
        }

        setApplied(true);
    };

    if (phase === 'intro') {
        return <QuickOrganizerIntro userName={userName} onDone={() => setPhase('main')} />;
    }

    if (phase === 'review') {
        return <QuickOrganizerReview
            rows={scheduleRows}
            reminderRows={reminderRows}
            recommendations={recommendations}
            paretoInsights={paretoInsights}
            blockerInsights={blockerInsights}
            deliveryInsights={deliveryInsights}
            missingTaskInsights={missingTaskInsights}
            opportunityAssessments={opportunityAssessments}
            dueDateRows={dueDateRows}
            opportunities={opportunities.filter(opp => selectedOppIds.includes(opp.id))}
            errors={parseErrors}
            onChange={updateScheduleRow}
            onReminderChange={updateReminderRow}
            onDueDateChange={updateDueDateRow}
            onRemove={removeScheduleRow}
            onRemoveReminder={removeReminderRow}
            onRemoveDueDate={removeDueDateRow}
            onScheduleTask={scheduleTaskInDraft}
            onBack={() => setPhase('main')}
            onApply={() => {
                handleApply();
                // Jump straight to the Tasks Agenda so the user immediately sees the accepted plan.
                if (onPlanAccepted) onPlanAccepted();
                else setPhase('main');
            }}
        />;
    }

    return (
        <div className="qo-scene-in fixed inset-0 z-[200] bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#3DCD58] flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-black">Quick Organizer</h1>
                        <p className="text-[11px] text-gray-400">
                            Today is <span className="text-[#3DCD58] font-bold">{todayLabel}</span> · {stats.eligibleTasks} open task{stats.eligibleTasks === 1 ? '' : 's'} across {stats.opps} opportunit{stats.opps === 1 ? 'y' : 'ies'} · {stats.alreadyScheduled} already scheduled
                        </p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-800 transition-colors" title="Back to Settings">
                    <X className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
                {/* Step 1: opportunity picker */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">1. Select and prioritize opportunities</h2>
                        <button onClick={() => setSelectedOppIds(selectedOppIds.length === Math.min(8, eligibleOpps.length) ? [] : eligibleOpps.slice(0, 8).map(opp => opp.id))} className="text-[11px] font-bold text-gray-400 hover:text-gray-200">{selectedOppIds.length === Math.min(8, eligibleOpps.length) ? 'Exclude all' : 'Include first 8'}</button>
                    </div>
                    <p className="text-[11px] text-gray-500">
                        Select up to 8 opportunities so the prompt stays reliable in smaller AI models. Use the arrows to set priority. ({selectedOppIds.length}/8 selected)
                    </p>
                    {eligibleOpps.length === 0 ? (
                        <p className="text-xs text-gray-500 py-2">No opportunities with open tasks.</p>
                    ) : (
                        <div className="space-y-2">
                            {[...eligibleOpps].sort((a, b) => { const ai = selectedOppIds.indexOf(a.id), bi = selectedOppIds.indexOf(b.id); if (ai >= 0 && bi >= 0) return ai - bi; if (ai >= 0) return -1; if (bi >= 0) return 1; return a.label.localeCompare(b.label); }).map(opp => {
                                const active = selectedOppIds.includes(opp.id);
                                const rank = selectedOppIds.indexOf(opp.id);
                                return (
                                    <div key={opp.id} className={`grid grid-cols-[28px_32px_minmax(0,1fr)_auto] gap-2 items-center rounded-xl border p-2 ${active ? 'bg-emerald-950/30 border-[#3DCD58]/50' : 'bg-gray-800/40 border-gray-800 opacity-60'}`}>
                                        <input type="checkbox" checked={active} disabled={!active && selectedOppIds.length >= 8} onChange={() => toggleOpp(opp.id)} className="rounded border-gray-600 text-[#3DCD58] focus:ring-[#3DCD58] disabled:opacity-30" />
                                        <span className={`text-xs font-black text-center ${active ? 'text-[#3DCD58]' : 'text-gray-600'}`}>{active ? `#${rank + 1}` : '—'}</span>
                                        <button onClick={() => toggleOpp(opp.id)} className="text-left min-w-0"><p className="text-xs font-bold truncate">{opp.label}</p><p className="text-[10px] text-gray-400 mt-0.5">Delivery: {opp.expected || 'Not set'} · {opp.quoteType} · {opp.pendingDays === null ? 'Age unknown' : `${opp.pendingDays} calendar days`} · {opp.taskCount} open tasks</p></button>
                                        <div className="flex gap-1"><button disabled={!active || rank === 0} onClick={() => moveOpp(opp.id, -1)} className="p-1 text-gray-400 hover:text-white disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button><button disabled={!active || rank === selectedOppIds.length - 1} onClick={() => moveOpp(opp.id, 1)} className="p-1 text-gray-400 hover:text-white disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button></div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Step 2: day picker + per-day time ranges */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">2. Which days — and what time ranges — should I schedule? (optional)</h2>
                        {Object.keys(timeRangesByDate).length > 0 && (
                            <button onClick={() => setTimeRangesByDate({})} className="text-[11px] font-bold text-gray-400 hover:text-gray-200">
                                Clear
                            </button>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-500">
                        Pick one or more days — e.g. only Monday, or Monday and Tuesday — then set the time range(s) you're free that day. Leave empty to let the AI use any day/time.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={selectNextWorkWeek} className="px-3 py-1.5 rounded-lg border border-[#3DCD58]/60 text-[11px] font-bold text-[#3DCD58] hover:bg-emerald-950/40">Select next 5 workdays</button>
                        <span className="self-center text-[10px] text-gray-500">Adds one clean 08:00-17:00 window per day.</span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {dayWindow.map(day => {
                            const active = isDaySelected(day.iso);
                            return (
                                <button
                                    key={day.iso}
                                    onClick={() => toggleDate(day.iso)}
                                    className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2 transition-colors ${active ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : day.isToday ? 'border-[#3DCD58]/60 text-gray-200 hover:border-[#3DCD58]' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                                >
                                    <span className="text-[9px] font-bold uppercase tracking-wide">{day.weekday}</span>
                                    <span className="text-sm font-black">{day.dayNum}</span>
                                    {day.isToday && <span className={`text-[8px] font-bold uppercase ${active ? 'text-white/80' : 'text-[#3DCD58]'}`}>Today</span>}
                                </button>
                            );
                        })}
                    </div>

                    {Object.keys(timeRangesByDate).length > 0 && (
                        <div className="space-y-2 pt-1">
                            {Object.entries(timeRangesByDate)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([iso, ranges]: [string, TimeRange[]]) => {
                                    const dayInfo = dayWindow.find(d => d.iso === iso);
                                    return (
                                        <div key={iso} className="flex items-start gap-3 bg-gray-800/50 border border-gray-700 rounded-xl p-2.5">
                                            <span className="text-[11px] font-bold text-gray-300 w-16 pt-1.5 shrink-0">
                                                {dayInfo ? `${dayInfo.weekday} ${dayInfo.dayNum}` : iso}
                                            </span>
                                            <div className="flex-1 flex flex-wrap items-center gap-2">
                                                {ranges.map((r, idx) => (
                                                    <div key={idx} className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-lg px-1.5 py-1">
                                                        <input
                                                            type="time"
                                                            value={r.start}
                                                            onChange={e => updateRange(iso, idx, { start: e.target.value })}
                                                            className="bg-transparent text-[11px] text-gray-100 w-[82px] focus:outline-none"
                                                        />
                                                        <span className="text-gray-500 text-[11px]">–</span>
                                                        <input
                                                            type="time"
                                                            value={r.end}
                                                            onChange={e => updateRange(iso, idx, { end: e.target.value })}
                                                            className="bg-transparent text-[11px] text-gray-100 w-[82px] focus:outline-none"
                                                        />
                                                        {ranges.length > 1 && (
                                                            <button onClick={() => removeRange(iso, idx)} className="text-gray-500 hover:text-rose-400 ml-1">
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                <button onClick={() => addRange(iso)} className="text-[11px] font-bold text-[#3DCD58] hover:underline px-1">
                                                    + Add range
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </section>

                {/* Step 1: extra instructions */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">3. Extra instructions (optional)</h2>
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-800/60 border border-gray-700 px-3 py-2">
                        <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-[#3DCD58]" /> AI recommendations language</span>
                        <div className="flex rounded-lg overflow-hidden border border-gray-700 text-[11px] font-bold">
                            <button onClick={() => setRecommendationLanguage('es')} className={`px-2.5 py-1 ${recommendationLanguage === 'es' ? 'bg-[#3DCD58] text-white' : 'text-gray-400 hover:text-white'}`}>Español</button>
                            <button onClick={() => setRecommendationLanguage('en')} className={`px-2.5 py-1 ${recommendationLanguage === 'en' ? 'bg-[#3DCD58] text-white' : 'text-gray-400 hover:text-white'}`}>English</button>
                        </div>
                    </div>
                    <textarea
                        value={extraInstructions}
                        onChange={e => setExtraInstructions(e.target.value)}
                        placeholder="e.g. I stepped away from the original plan, reschedule everything starting tomorrow…"
                        className={`${inputCls} h-16 resize-none`}
                    />
                    <div className="flex flex-wrap gap-2">
                        {ORGANIZER_CHIPS.map(chip => (
                            <button
                                key={chip.id}
                                onClick={() => toggleChip(chip.id)}
                                className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${activeChipIds.includes(chip.id) ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Step 2: prompt */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">4. Copy this prompt into your AI chat</h2>
                        <div className="flex items-center gap-2">
                            {promptDirty && (
                                <button onClick={() => { setPromptDirty(false); setPrompt(generatedPrompt); }} className="text-[11px] font-bold text-gray-400 hover:text-gray-200">
                                    Regenerate
                                </button>
                            )}
                            <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#3DCD58] text-white rounded-lg hover:bg-[#34b34c] transition-colors">
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy Prompt'}
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={prompt}
                        onChange={e => { setPrompt(e.target.value); setPromptDirty(true); }}
                        className={`${inputCls} h-56 font-mono text-[11px] leading-relaxed resize-y`}
                    />
                    <p className={`text-[10px] font-bold ${prompt.length > 15000 ? 'text-rose-400' : prompt.length > 10000 ? 'text-amber-400' : 'text-gray-500'}`}>
                        {(prompt.length / 1000).toFixed(1)}k characters
                        {prompt.length > 15000
                            ? ' — exceeds most Copilot paste limits. Deselect opportunities or days until this shrinks.'
                            : prompt.length > 10000
                                ? ' — may exceed the free Copilot paste limit (~10k). M365 Copilot accepts it; otherwise deselect some opportunities.'
                                : ' — fits comfortably in Copilot.'}
                    </p>
                </section>

                {/* Step 3: paste response */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">5. Paste the AI's reply</h2>
                    <textarea
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                        placeholder="Paste Copilot's full reply here — it must include the ### SCHEDULE table (use 'Copy' on the whole message, not a screenshot)…"
                        className={`${inputCls} h-40 font-mono text-[11px] resize-y`}
                    />
                    <button
                        onClick={handleParse}
                        disabled={!pasteText.trim()}
                        className="px-3 py-1.5 text-xs font-bold bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Bot className="w-4 h-4 inline mr-1.5" /> Review AI plan
                    </button>
                </section>

                {/* Draft/applied status — full editing happens in the dedicated review workspace. */}
                {(applied || scheduleRows.length > 0 || reminderRows.length > 0 || dueDateRows.length > 0 || parseErrors.length > 0) && (
                    <section className={`rounded-2xl p-4 flex items-center justify-between gap-3 border ${applied ? 'bg-emerald-950/30 border-[#3DCD58]/50' : 'bg-gray-900 border-gray-800'}`}>
                        <div className="min-w-0">
                            {applied ? (
                                <p className="text-sm font-bold text-[#3DCD58] flex items-center gap-2"><Check className="w-4 h-4 shrink-0" /> Plan applied — execution blocks, due dates and reminders were saved.</p>
                            ) : (
                                <p className="text-sm font-bold text-gray-200">
                                    Draft ready: {scheduleRows.length} session{scheduleRows.length === 1 ? '' : 's'} · {reminderRows.length} reminder{reminderRows.length === 1 ? '' : 's'} · {dueDateRows.length} due date{dueDateRows.length === 1 ? '' : 's'}{parseErrors.length ? ` · ${parseErrors.length} issue${parseErrors.length === 1 ? '' : 's'}` : ''}
                                </p>
                            )}
                            <p className="text-[11px] text-gray-500 mt-1">{applied ? 'Check the Schedule view and the reminders bell — everything is already there.' : 'Nothing is saved yet. Open the review workspace to edit and accept the plan.'}</p>
                        </div>
                        <button onClick={() => setPhase('review')} className="shrink-0 px-3 py-2 text-xs font-bold bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                            {applied ? 'Reopen review' : 'Open review'}
                        </button>
                    </section>
                )}
            </div>
        </div>
    );
};
