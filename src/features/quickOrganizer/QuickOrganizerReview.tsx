import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bell, Bot, CalendarDays, Check, ChevronLeft, Clock3, LayoutGrid, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { Opportunity } from '../../types';
import { CalendarView } from '../../components/CalendarView';
import { isOpportunitySchedulable, isTaskActive } from '../schedule/scheduleHelpers';
import { ParsedDueDateRow, ParsedReminderRow, ParsedScheduleRow } from './responseParser';
import { QuickOrganizerWeekAgenda } from './QuickOrganizerWeekAgenda';

interface Props {
    rows: ParsedScheduleRow[];
    reminderRows: ParsedReminderRow[];
    recommendations: string[];
    paretoInsights: string[];
    blockerInsights: string[];
    deliveryInsights: string[];
    missingTaskInsights: string[];
    dueDateRows: ParsedDueDateRow[];
    opportunities: Opportunity[];
    errors: { section: string; line: string; reason: string }[];
    onChange: (id: string, patch: Partial<ParsedScheduleRow>) => void;
    onReminderChange: (id: string, patch: Partial<ParsedReminderRow>) => void;
    onDueDateChange: (id: string, patch: Partial<ParsedDueDateRow>) => void;
    onRemove: (id: string) => void;
    onRemoveReminder: (id: string) => void;
    onScheduleTask: (oppId: string, taskId: string) => void;
    onBack: () => void;
    onApply: () => void;
}

const isoToday = () => new Date().toLocaleDateString('en-CA');

/** Category badges the prompt asks the AI to prefix each RECOMMENDATIONS bullet with ("FOCUS: …"). */
const REC_CATEGORIES: Record<string, { label: string; cls: string; order: number }> = {
    FOCUS: { label: 'FOCUS', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60', order: 0 },
    NEXT: { label: 'FOCUS', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60', order: 0 },
    FOCO: { label: 'FOCUS', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60', order: 0 },
    ENFOQUE: { label: 'FOCUS', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60', order: 0 },
    RISK: { label: 'RISK', cls: 'bg-rose-950/70 text-rose-300 border-rose-700/60', order: 1 },
    RIESGO: { label: 'RISK', cls: 'bg-rose-950/70 text-rose-300 border-rose-700/60', order: 1 },
    WAITING: { label: 'WAITING', cls: 'bg-amber-950/70 text-amber-300 border-amber-700/60', order: 2 },
    ESPERA: { label: 'WAITING', cls: 'bg-amber-950/70 text-amber-300 border-amber-700/60', order: 2 },
    STATUS: { label: 'STATUS', cls: 'bg-gray-800 text-gray-300 border-gray-600', order: 3 },
    ESTADO: { label: 'STATUS', cls: 'bg-gray-800 text-gray-300 border-gray-600', order: 3 },
    TIP: { label: 'TIP', cls: 'bg-sky-950/70 text-sky-300 border-sky-700/60', order: 4 },
    CONSEJO: { label: 'TIP', cls: 'bg-sky-950/70 text-sky-300 border-sky-700/60', order: 4 },
};

interface ParsedRecommendation { badge: { label: string; cls: string } | null; order: number; body: string }

/** "RISK: text" → badge + text. Untagged bullets keep a neutral dot and sort after tagged ones. */
const parseRecommendation = (text: string): ParsedRecommendation => {
    const match = text.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,12})\s*[:|·—–-]\s+(.+)$/);
    if (match) {
        const token = match[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const category = REC_CATEGORIES[token];
        if (category) return { badge: { label: category.label, cls: category.cls }, order: category.order, body: match[2].trim() };
    }
    return { badge: null, order: 9, body: text };
};

/** Complete draft workspace. Nothing in here mutates an opportunity until onApply is confirmed. */
export const QuickOrganizerReview: React.FC<Props> = ({
    rows, reminderRows, recommendations, paretoInsights, blockerInsights, deliveryInsights, missingTaskInsights, dueDateRows, opportunities, errors, onChange, onReminderChange, onDueDateChange,
    onRemove, onRemoveReminder, onScheduleTask, onBack, onApply,
}) => {
    const [taskTab, setTaskTab] = useState<'scheduled' | 'unscheduled' | 'all'>('scheduled');
    const [search, setSearch] = useState('');
    const [plannerView, setPlannerView] = useState<'agenda' | 'calendar'>('agenda');
    const [showMissingTasks, setShowMissingTasks] = useState(true);

    const allTasks = useMemo(() => opportunities.flatMap(opp =>
        isOpportunitySchedulable(opp)
            ? (opp.tasks || []).filter(isTaskActive).map(task => ({ opp, task }))
            : []
    ), [opportunities]);
    const plannedKeys = useMemo(() => new Set(rows.map(r => `${r.oppId}::${r.taskId}`)), [rows]);
    const scheduledTasks = useMemo(() => allTasks.filter(({ opp, task }) => plannedKeys.has(`${opp.id}::${task.id}`)), [allTasks, plannedKeys]);
    const unscheduledTasks = useMemo(() => allTasks.filter(({ opp, task }) => !plannedKeys.has(`${opp.id}::${task.id}`)), [allTasks, plannedKeys]);

    const visibleTasks = (taskTab === 'scheduled' ? scheduledTasks : taskTab === 'unscheduled' ? unscheduledTasks : allTasks)
        .filter(({ opp, task }) => `${opp.alias || opp.title} ${task.title}`.toLowerCase().includes(search.toLowerCase()));

    const dates = useMemo(() => Array.from(new Set(rows.map(r => r.date).filter(Boolean))).sort(), [rows]);
    const invalidRows = rows.filter(r => !r.date || !r.startTime || !r.endTime || r.endTime <= r.startTime);
    const canApply = rows.length + reminderRows.length + dueDateRows.length > 0 && invalidRows.length === 0;

    return <div className="fixed inset-0 z-[210] bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
        <header className="shrink-0 px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#3DCD58] flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5 text-white" /></div>
                <div className="min-w-0"><h1 className="font-black">AI Organizer</h1><p className="text-[11px] text-gray-400">This is only a draft. Edit it freely; TenderLoop will not change until you accept the plan.</p></div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button onClick={onBack} className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-gray-800 rounded-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
                <button disabled={!canApply} onClick={onApply} className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[#3DCD58] text-white rounded-lg hover:bg-[#34b34c] disabled:opacity-40 disabled:cursor-not-allowed"><Check className="w-4 h-4" /> Accept plan</button>
            </div>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_360px]">
            <main className="min-w-0 overflow-y-auto p-5 space-y-5">
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                    <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Bot className="w-4 h-4 text-[#3DCD58]" /> AI recommendations</h2>
                    {recommendations.length ? (
                        <div className="mt-3 divide-y divide-gray-800/80 rounded-xl border border-gray-800 overflow-hidden">
                            {recommendations
                                .map((text, i) => ({ ...parseRecommendation(text), i }))
                                .sort((a, b) => a.order - b.order || a.i - b.i)
                                .map(item => (
                                    <div key={item.i} className={`flex items-start gap-3 px-3 py-2.5 ${item.badge?.label === 'FOCUS' ? 'bg-emerald-950/20' : 'bg-gray-900/60'}`}>
                                        {item.badge
                                            ? <span className={`shrink-0 mt-0.5 text-[9px] font-black tracking-wider border rounded-md px-1.5 py-0.5 ${item.badge.cls}`}>{item.badge.label}</span>
                                            : <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-[#3DCD58]" />}
                                        <p className="text-[13px] leading-relaxed text-gray-200 min-w-0">{item.body}</p>
                                    </div>
                                ))}
                        </div>
                    ) : <p className="mt-3 text-xs text-gray-500">The response did not include recommendations.</p>}
                </section>

                <div className="grid lg:grid-cols-3 gap-3">
                    {([['20/80 high-leverage tasks', paretoInsights], ['Blockers and dependencies', blockerInsights], ['Delivery outlook', deliveryInsights]] as const).map(([title, items]) => <section key={title} className="bg-gray-900 border border-gray-800 rounded-2xl p-4"><h2 className="text-[10px] font-black uppercase tracking-widest text-[#3DCD58]">{title}</h2><div className="mt-3 space-y-2">{items.length ? items.map((item, index) => <p key={index} className="text-xs leading-relaxed text-gray-200">{item}</p>) : <p className="text-xs text-gray-600">No analysis returned.</p>}</div></section>)}
                </div>

                <section className="bg-amber-950/30 border border-amber-800/70 rounded-2xl overflow-hidden">
                    <button onClick={() => setShowMissingTasks(value => !value)} className="w-full flex items-center justify-between gap-3 p-4 text-left"><div><h2 className="text-xs font-black uppercase tracking-widest text-amber-300">Missing tasks suggested by AI</h2><p className="text-[10px] text-amber-200/50 mt-1">Potential process steps or deliverables that do not currently exist in the opportunity task list.</p></div><span className="text-[10px] font-black text-amber-300 border border-amber-700 rounded-lg px-2 py-1">{showMissingTasks ? 'HIDE' : `SHOW (${missingTaskInsights.length})`}</span></button>
                    {showMissingTasks && <div className="border-t border-amber-800/50 p-4 space-y-2">{missingTaskInsights.length ? missingTaskInsights.map((item, index) => <p key={index} className="text-xs leading-relaxed text-amber-100 bg-amber-950/40 rounded-lg p-2.5">{item}</p>) : <p className="text-xs text-amber-200/50">No missing tasks were suggested.</p>}<p className="text-[10px] text-amber-200/40 pt-1">Suggestions are informational only. They are not created or added to the accepted plan automatically.</p></div>}
                </section>

                {(errors.length > 0 || invalidRows.length > 0) && <section className="bg-rose-950/50 border border-rose-800 rounded-xl p-3">
                    <p className="text-xs font-bold text-rose-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {errors.length + invalidRows.length} item(s) require review before the plan can be accepted.</p>
                    {errors.map((e, i) => <p key={i} className="text-[11px] text-rose-300/80 mt-1">[{e.section}] {e.reason}</p>)}
                </section>}

                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-4"><div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-[#3DCD58]" /> Proposed schedule</h2><p className="text-[11px] text-gray-500 mt-1">Drag a block to another day or time, or select it to edit its exact values. Previous blocks for rescheduled active tasks are replaced when you accept.</p></div><div className="flex bg-gray-900 border border-gray-700 rounded-lg p-1"><button onClick={() => setPlannerView('agenda')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-black ${plannerView === 'agenda' ? 'bg-[#3DCD58] text-white' : 'text-gray-400'}`}><CalendarDays className="w-3.5 h-3.5" /> AGENDA</button><button onClick={() => setPlannerView('calendar')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-black ${plannerView === 'calendar' ? 'bg-[#3DCD58] text-white' : 'text-gray-400'}`}><LayoutGrid className="w-3.5 h-3.5" /> CALENDAR</button></div></div>
                    {plannerView === 'agenda' ? <QuickOrganizerWeekAgenda rows={rows} onChange={onChange} onRemove={onRemove} /> : <div className="h-[650px] rounded-2xl overflow-hidden border border-gray-800 bg-white text-gray-900"><CalendarView<ParsedDueDateRow> items={dueDateRows} getDate={row => row.date} onDateDrop={(id, _type, newDate) => onDueDateChange(id, { date: newDate })} renderItem={row => <div draggable onDragStart={e => { e.dataTransfer.setData('id', row.id); e.dataTransfer.setData('type', 'ai-due-date'); }} className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-800 cursor-grab" title={row.rationale}><b>Due:</b> {row.taskLabel}</div>} className="h-full" /></div>}
                    {!dates.length && <div className="bg-gray-900 border border-dashed border-gray-700 rounded-2xl py-10 text-center"><p className="text-xs text-gray-500">The AI did not propose any sessions. Add tasks from the right panel.</p></div>}
                </section>

                {reminderRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3"><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Bell className="w-4 h-4 text-[#3DCD58]" /> Proposed reminders</h2>{reminderRows.map(row => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_180px_32px] gap-2 items-center bg-gray-800/60 rounded-xl p-2"><div><p className="text-xs font-bold">{row.taskLabel}</p><input value={row.title} onChange={e => onReminderChange(row.id, { title: e.target.value })} className="mt-1 w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-[11px]"/></div><input type="datetime-local" value={row.remindAt} onChange={e => onReminderChange(row.id, { remindAt: e.target.value })} className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-[10px]"/><button onClick={() => onRemoveReminder(row.id)} className="text-gray-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div>)}</section>}
            </main>

            <aside className="border-l border-gray-800 bg-gray-900/70 flex flex-col min-h-0">
                <div className="p-4 border-b border-gray-800"><h2 className="font-black text-sm">Organizer tasks</h2><p className="text-[10px] text-gray-500 mt-1">Add or remove tasks from the draft before accepting it.</p><div className="mt-3 flex items-center gap-2 bg-gray-950 border border-gray-700 rounded-lg px-2"><Search className="w-3.5 h-3.5 text-gray-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" className="w-full bg-transparent border-0 px-0 py-2 text-xs focus:ring-0"/></div></div>
                <div className="grid grid-cols-3 border-b border-gray-800">
                    {([['scheduled', `Scheduled (${scheduledTasks.length})`], ['unscheduled', `Unscheduled (${unscheduledTasks.length})`], ['all', `All (${allTasks.length})`]] as const).map(([id,label]) => <button key={id} onClick={() => setTaskTab(id)} className={`py-2.5 text-[9px] font-black uppercase border-b-2 ${taskTab === id ? 'text-[#3DCD58] border-[#3DCD58]' : 'text-gray-500 border-transparent'}`}>{label}</button>)}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {visibleTasks.map(({ opp, task }) => { const planned = plannedKeys.has(`${opp.id}::${task.id}`); const existing = (task.executionBlocks || []).length; return <div key={`${opp.id}::${task.id}`} className="bg-gray-800 border border-gray-700 rounded-xl p-3"><div className="flex justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-black text-[#3DCD58] truncate">{opp.alias || opp.title}</p><p className="text-xs font-bold mt-0.5 leading-snug">{task.title}</p></div><span className={`h-fit text-[8px] font-black uppercase px-2 py-1 rounded-full ${planned ? 'bg-emerald-900/60 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>{planned ? 'In plan' : 'Unscheduled'}</span></div><div className="mt-2 flex items-center justify-between"><span className="text-[9px] text-gray-500 flex items-center gap-1"><Clock3 className="w-3 h-3"/>{existing ? `${existing} current block(s)` : `No current schedule`}</span>{!planned && <button onClick={() => onScheduleTask(opp.id, task.id)} className="flex items-center gap-1 text-[10px] font-bold text-[#3DCD58] hover:underline"><Plus className="w-3 h-3"/> Schedule</button>}</div></div>; })}
                    {!visibleTasks.length && <p className="text-xs text-gray-600 text-center py-10">There are no tasks in this section.</p>}
                </div>
                <div className="p-3 border-t border-gray-800 bg-gray-950/60"><p className="text-[10px] text-gray-500">Default when adding manually: {isoToday()}, 09:00–10:00. You can edit it immediately in the agenda.</p></div>
            </aside>
        </div>
    </div>;
};
