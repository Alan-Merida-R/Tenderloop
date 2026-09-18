import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bell, Bot, CalendarDays, Check, ChevronLeft, ClipboardList, Clock3, Gauge, LayoutGrid, ListOrdered, Moon, MoveRight, Plus, Search, Send, Sparkles, Sun, Timer, Trash2, Truck } from 'lucide-react';
import { Opportunity } from '../../types';
import { CalendarView } from '../../components/CalendarView';
import { isOpportunitySchedulable, isTaskActive } from '../schedule/scheduleHelpers';
import {
    ParsedContingentRow, ParsedDeliveryDateRow, ParsedDueDateRow, ParsedExternalPushRow, ParsedMeta,
    ParsedMissingTaskSuggestion, ParsedOpportunityAssessment, ParsedOutOfScopeRow, ParsedQueueRow,
    ParsedRankingRow, ParsedReminderRow, ParsedScheduleRow, ParsedSuggestedMoveRow,
} from './responseParser';
import { QuickOrganizerWeekAgenda } from './QuickOrganizerWeekAgenda';
import { QuickOrganizerPmDashboard } from './QuickOrganizerPmDashboard';

interface Props {
    rows: ParsedScheduleRow[];
    reminderRows: ParsedReminderRow[];
    recommendations: string[];
    paretoInsights: string[];
    blockerInsights: string[];
    deliveryInsights: string[];
    missingTaskInsights: string[];
    missingTaskSuggestions: ParsedMissingTaskSuggestion[];
    dueDateRows: ParsedDueDateRow[];
    /** [TA6] Applied on accept, like dueDateRows — but on the opportunity, not on a task. */
    deliveryDateRows: ParsedDeliveryDateRow[];
    /** [TA6] Advisory sections: shown so the user can act on them by hand, never written. */
    rankingRows: ParsedRankingRow[];
    externalPushRows: ParsedExternalPushRow[];
    contingentRows: ParsedContingentRow[];
    queueRows: ParsedQueueRow[];
    suggestedMoveRows: ParsedSuggestedMoveRow[];
    outOfScopeRows: ParsedOutOfScopeRow[];
    assumptions: string[];
    meta: ParsedMeta | null;
    opportunityAssessments: ParsedOpportunityAssessment[];
    opportunities: Opportunity[];
    errors: { section: string; line: string; reason: string }[];
    onChange: (id: string, patch: Partial<ParsedScheduleRow>) => void;
    onReminderChange: (id: string, patch: Partial<ParsedReminderRow>) => void;
    onDueDateChange: (id: string, patch: Partial<ParsedDueDateRow>) => void;
    onRemove: (id: string) => void;
    onRemoveReminder: (id: string) => void;
    onRemoveDueDate: (id: string) => void;
    onDeliveryDateChange: (id: string, patch: Partial<ParsedDeliveryDateRow>) => void;
    onRemoveDeliveryDate: (id: string) => void;
    onScheduleTask: (oppId: string, taskId: string) => void;
    onCreateSuggestedTask: (suggestion: ParsedMissingTaskSuggestion) => void;
    language: 'en' | 'es';
    theme: 'light' | 'dark';
    onLanguageChange: (language: 'en' | 'es') => void;
    onThemeChange: (theme: 'light' | 'dark') => void;
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
    rows, reminderRows, recommendations, paretoInsights, blockerInsights, deliveryInsights, missingTaskInsights, missingTaskSuggestions, dueDateRows, opportunityAssessments, opportunities, errors, onChange, onReminderChange, onDueDateChange,
    deliveryDateRows, rankingRows, externalPushRows, contingentRows, queueRows, suggestedMoveRows, outOfScopeRows, assumptions, meta,
    onRemove, onRemoveReminder, onRemoveDueDate, onDeliveryDateChange, onRemoveDeliveryDate, onScheduleTask, onCreateSuggestedTask, language, theme, onLanguageChange, onThemeChange, onBack, onApply,
}) => {
    const es = language === 'es';
    const [workspaceView, setWorkspaceView] = useState<'pm' | 'plan'>('pm');
    const [taskTab, setTaskTab] = useState<'scheduled' | 'unscheduled' | 'all'>('scheduled');
    const [search, setSearch] = useState('');
    const [plannerView, setPlannerView] = useState<'agenda' | 'calendar'>('agenda');
    const [showMissingTasks, setShowMissingTasks] = useState(true);
    const [createdSuggestionIds, setCreatedSuggestionIds] = useState<string[]>([]);

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
    const invalidDueDates = dueDateRows.filter(row => !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date < isoToday());
    const invalidReminders = reminderRows.filter(row => !row.title.trim() || isNaN(new Date(row.remindAt).getTime()));
    // [TA6] A delivery date is written into the opportunity, so it gets the same gate as a due
    // date. A row for a hard commitment is reported instead of blocking: it is simply skipped
    // when the plan is applied, and the user is told why.
    const invalidDeliveryDates = deliveryDateRows.filter(row => !/^\d{4}-\d{2}-\d{2}$/.test(row.date));
    const hardCommittedDeliveries = deliveryDateRows.filter(row =>
        opportunities.find(opp => opp.id === row.oppId)?.commercial?.deliveryCommitted === 'hard');
    const invalidCount = invalidRows.length + invalidDueDates.length + invalidReminders.length + invalidDeliveryDates.length;
    const canApply = rows.length + reminderRows.length + dueDateRows.length + deliveryDateRows.length + createdSuggestionIds.length > 0 && invalidCount === 0;

    return <div className={`fixed inset-0 z-[210] bg-gray-950 text-gray-100 flex flex-col overflow-hidden ${theme === 'light' ? 'qo-theme-light' : 'qo-theme-dark'}`}>
        <header className="shrink-0 px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#3DCD58] flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5 text-white" /></div>
                <div className="min-w-0"><h1 className="font-black">Quick Organizer PM</h1><p className="text-[11px] text-gray-400">{es ? 'Análisis guardado y plan editable. Nada cambia hasta que aceptes el plan.' : 'Saved analysis and editable plan. Nothing changes until you accept the plan.'}</p></div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <div className="flex overflow-hidden rounded-lg border border-gray-700 text-[10px] font-black"><button onClick={() => onLanguageChange('es')} className={`px-2 py-1.5 ${language === 'es' ? 'bg-[#3DCD58] text-white' : 'text-gray-400'}`}>ES</button><button onClick={() => onLanguageChange('en')} className={`px-2 py-1.5 ${language === 'en' ? 'bg-[#3DCD58] text-white' : 'text-gray-400'}`}>EN</button></div>
                <button onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800" title={es ? 'Cambiar tema' : 'Change theme'}>{theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button>
                <button onClick={onBack} className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-gray-800 rounded-lg"><ChevronLeft className="w-4 h-4" /> {es ? 'Volver' : 'Back'}</button>
                <button disabled={!canApply} onClick={onApply} className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[#3DCD58] text-white rounded-lg hover:bg-[#34b34c] disabled:opacity-40 disabled:cursor-not-allowed"><Check className="w-4 h-4" /> {es ? 'Aceptar plan' : 'Accept plan'}</button>
            </div>
        </header>

        <nav className="flex shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900 px-6 py-2">
            <button onClick={() => setWorkspaceView('pm')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black ${workspaceView === 'pm' ? 'bg-[#3DCD58] text-white' : 'text-gray-400 hover:bg-gray-800'}`}><Gauge className="h-4 w-4" />{es ? 'TABLERO PM' : 'PM DASHBOARD'}</button>
            <button onClick={() => setWorkspaceView('plan')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black ${workspaceView === 'plan' ? 'bg-[#3DCD58] text-white' : 'text-gray-400 hover:bg-gray-800'}`}><ClipboardList className="h-4 w-4" />{es ? 'MI PLAN Y AGENDA' : 'MY PLAN & AGENDA'}</button>
            <span className="ml-auto text-[10px] text-gray-500">{es ? `${opportunities.length} oportunidades · ${rows.length} bloques propuestos` : `${opportunities.length} opportunities · ${rows.length} proposed blocks`}</span>
        </nav>

        {workspaceView === 'pm' ? <div className="flex-1 overflow-y-auto bg-gray-100 p-5"><div className="mx-auto max-w-7xl"><QuickOrganizerPmDashboard opportunities={opportunities} rows={rows} assessments={opportunityAssessments} recommendations={recommendations} language={language} /></div></div> : <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_360px]">
            <main className="min-w-0 overflow-y-auto p-5 space-y-5">
                <section>
                    <div className="mb-3"><h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{es ? 'Avance operativo según la IA' : 'AI-estimated operating progress'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Estimación realista basada en entregables, trabajo restante, dependencias, información y aprobaciones; no es el porcentaje de tareas terminadas.' : 'Realistic estimate based on deliverables, remaining work, dependencies, information and approvals; it is not task completion percentage.'}</p></div>
                    {opportunityAssessments.length ? <div className="grid xl:grid-cols-2 gap-3">{opportunityAssessments.map(item => {
                        return <article key={item.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                            <div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><h3 className="font-black truncate">{item.oppLabel}</h3><p className="text-[11px] text-gray-400 mt-1">{item.summary}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-[#3DCD58]" style={{ width: `${item.health}%` }} /></div></div><div className="shrink-0 text-right"><span className="text-2xl font-black tabular-nums">{item.health}%</span><span className="block text-[8px] font-black uppercase text-gray-500">{es ? 'avance IA' : 'AI progress'}</span></div></div>
                            <div className="grid grid-cols-3 gap-2 mt-3 text-center"><div className="rounded-lg bg-gray-950 p-2"><p className="text-[9px] text-gray-500 uppercase">{es ? 'Requeridas' : 'Required'}</p><p className="text-sm font-black">{item.requiredHours}h</p></div><div className="rounded-lg bg-gray-950 p-2"><p className="text-[9px] text-gray-500 uppercase">{es ? 'Disponibles' : 'Available'}</p><p className="text-sm font-black">{item.availableHours}h</p></div><div className="rounded-lg bg-gray-950 p-2"><p className="text-[9px] text-gray-500 uppercase">{es ? 'Viable' : 'Feasible'}</p><p className="text-xs font-black">{item.feasible}</p></div></div>
                            <div className="mt-3 space-y-1.5 text-[11px]"><p><span className="text-gray-500 font-bold">{es ? 'Qué la frena:' : 'What stops it:'}</span> {item.blocker}</p><p><span className="text-[#3DCD58] font-bold">{es ? 'Haz ahora:' : 'Do now:'}</span> {item.nextAction}</p><p><span className="text-gray-500 font-bold">{es ? 'Entrega:' : 'Delivery:'}</span> {item.suggestedDelivery || (es ? 'Requiere confirmación' : 'Needs confirmation')} · {item.reason}</p></div>
                        </article>;
                    })}</div> : <div className="rounded-2xl border border-dashed border-gray-700 p-5 text-xs text-gray-500">{es ? 'La respuesta no incluyó la evaluación estructurada. Regenera el prompt para ver avance IA, capacidad y fechas realistas.' : 'The AI reply did not include the structured assessment. Regenerate the prompt to see AI progress, capacity and realistic delivery dates.'}</div>}
                </section>
                {rankingRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Gauge className="w-4 h-4 text-[#3DCD58]" /> {es ? 'Prioridad calculada por la IA' : 'AI-computed priority'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Puntaje = cierre barato + urgencia + apalancamiento + valor. Cubo A: cierra en menos de 1h. Cubo B: destraba a otro. Cubo C: construcción.' : 'Score = cheap close + urgency + leverage + value. Bucket A: closes in under 1h. Bucket B: unblocks someone. Bucket C: build work.'}</p></div>
                    <div className="mt-3 divide-y divide-gray-800/80 rounded-xl border border-gray-800 overflow-hidden">
                        {[...rankingRows].sort((a, b) => a.rank - b.rank).map(row => <div key={row.id} className={`flex items-center gap-3 px-3 py-2 ${row.outOfScope ? 'bg-gray-900/40 opacity-70' : 'bg-gray-900/60'}`}>
                            <span className="shrink-0 w-6 text-center text-[11px] font-black text-gray-500 tabular-nums">{row.rank}</span>
                            <div className="min-w-0 flex-1"><p className="text-xs font-bold truncate">{row.oppLabel}{row.outOfScope && <span className="ml-2 text-[9px] font-black text-amber-400">{es ? 'FUERA DE ALCANCE' : 'OUT OF SCOPE'}</span>}</p><p className="text-[10px] text-gray-500 truncate">{row.why}</p></div>
                            {row.bucket && <span className="shrink-0 text-[9px] font-black border border-gray-600 text-gray-300 rounded-md px-1.5 py-0.5">{row.bucket}</span>}
                            <span className="shrink-0 text-sm font-black tabular-nums">{row.score}</span>
                        </div>)}
                    </div>
                </section>}

                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                    <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Bot className="w-4 h-4 text-[#3DCD58]" /> {es ? 'Recomendaciones de IA' : 'AI recommendations'}</h2>
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
                    ) : <p className="mt-3 text-xs text-gray-500">{es ? 'La respuesta no incluyó recomendaciones.' : 'The response did not include recommendations.'}</p>}
                </section>

                {assumptions.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> {es ? 'Supuestos que tomó la IA' : 'Assumptions the AI made'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Cada inferencia, dato faltante que rellenó y contradicción que encontró. Léelos antes de aceptar el plan.' : 'Every inference, missing field it filled in and contradiction it found. Read them before accepting the plan.'}</p></div>
                    <ul className="mt-3 space-y-1.5">{assumptions.map((item, index) => <li key={index} className="flex items-start gap-2 text-[12px] leading-relaxed text-gray-200"><span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-amber-400" />{item}</li>)}</ul>
                </section>}

                {meta && <p className="text-[10px] text-gray-500">
                    {es ? 'Respuesta' : 'Answer'} {meta.schemaVersion || '?'} · {meta.generatedAt || '?'} · {meta.opportunityCount ?? '?'} {es ? 'oportunidades' : 'opportunities'} · {meta.taskCount ?? '?'} {es ? 'tareas' : 'tasks'}{meta.overallConfidence !== null ? ` · ${es ? 'confianza' : 'confidence'} ${meta.overallConfidence}%` : ''}
                    {meta.opportunityCount !== null && meta.opportunityCount !== opportunities.length && <span className="ml-2 font-bold text-amber-400">{es ? `La IA dice haber analizado ${meta.opportunityCount} y tú seleccionaste ${opportunities.length}: la respuesta puede venir truncada.` : `The AI says it analyzed ${meta.opportunityCount} but you selected ${opportunities.length}: the answer may be truncated.`}</span>}
                </p>}

                <div className="grid lg:grid-cols-3 gap-3">
                    {([[es ? 'Tareas 20/80 de mayor impacto' : '20/80 high-leverage tasks', paretoInsights], [es ? 'Bloqueos y dependencias' : 'Blockers and dependencies', blockerInsights], [es ? 'Panorama de entrega' : 'Delivery outlook', deliveryInsights]] as const).map(([title, items]) => <section key={title} className="bg-gray-900 border border-gray-800 rounded-2xl p-4"><h2 className="text-[10px] font-black uppercase tracking-widest text-[#3DCD58]">{title}</h2><div className="mt-3 space-y-2">{items.length ? items.map((item, index) => <p key={index} className="text-xs leading-relaxed text-gray-200">{item}</p>) : <p className="text-xs text-gray-600">{es ? 'La IA no devolvió análisis.' : 'No analysis returned.'}</p>}</div></section>)}
                </div>

                <section className={`border rounded-2xl overflow-hidden ${theme === 'light' ? 'bg-amber-50 border-amber-300' : 'bg-amber-950/30 border-amber-800/70'}`}>
                    <button onClick={() => setShowMissingTasks(value => !value)} className="w-full flex items-center justify-between gap-3 p-4 text-left"><div><h2 className={`text-xs font-black uppercase tracking-widest ${theme === 'light' ? 'text-amber-900' : 'text-amber-300'}`}>{es ? 'Tareas faltantes sugeridas por IA' : 'Missing tasks suggested by AI'}</h2><p className={`text-[10px] mt-1 ${theme === 'light' ? 'text-gray-700' : 'text-amber-200/70'}`}>{es ? 'Pasos operativos que parecen faltar. El título se guardará en inglés.' : 'Operational steps that appear to be missing. The title is saved in English.'}</p></div><span className={`text-[10px] font-black border rounded-lg px-2 py-1 ${theme === 'light' ? 'text-amber-900 border-amber-400' : 'text-amber-300 border-amber-700'}`}>{showMissingTasks ? (es ? 'OCULTAR' : 'HIDE') : `${es ? 'MOSTRAR' : 'SHOW'} (${missingTaskSuggestions.length + missingTaskInsights.length})`}</span></button>
                    {showMissingTasks && <div className={`border-t p-4 space-y-2 ${theme === 'light' ? 'border-amber-300' : 'border-amber-800/50'}`}>
                        {missingTaskSuggestions.map(item => { const created = createdSuggestionIds.includes(item.id); return <article key={item.id} className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${theme === 'light' ? 'border-amber-200 bg-white' : 'border-amber-800/50 bg-amber-950/40'}`}><div className="min-w-0"><p className={`text-[10px] font-black uppercase ${theme === 'light' ? 'text-amber-800' : 'text-amber-300'}`}>{item.oppLabel}</p><p className={`mt-0.5 text-xs font-bold ${theme === 'light' ? 'text-gray-900' : 'text-amber-50'}`}>{item.titleEnglish}</p><p className={`mt-1 text-[10px] leading-relaxed ${theme === 'light' ? 'text-gray-700' : 'text-amber-100/80'}`}>{item.reason} · {item.dueDate || (es ? 'fecha por definir' : 'date to confirm')}</p></div><button disabled={created} onClick={() => { onCreateSuggestedTask(item); setCreatedSuggestionIds(ids => [...ids, item.id]); }} className="shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-[10px] font-black text-amber-950 disabled:opacity-50">{created ? (es ? 'AGREGADA AL PLAN' : 'ADDED TO PLAN') : (es ? 'AGREGAR AL PLAN' : 'ADD TO PLAN')}</button></article>; })}
                        {missingTaskInsights.map((item, index) => <p key={index} className={`rounded-lg p-2.5 text-xs leading-relaxed ${theme === 'light' ? 'bg-white text-gray-800' : 'bg-amber-950/40 text-amber-100'}`}>{item}</p>)}
                        {!missingTaskSuggestions.length && !missingTaskInsights.length && <p className={`text-xs ${theme === 'light' ? 'text-gray-600' : 'text-amber-200/70'}`}>{es ? 'No se sugirieron tareas faltantes.' : 'No missing tasks were suggested.'}</p>}
                    </div>}
                </section>

                {(errors.length > 0 || invalidCount > 0) && <section className="bg-rose-950/50 border border-rose-800 rounded-xl p-3">
                    <p className="text-xs font-bold text-rose-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {es ? `${errors.length + invalidCount} elementos requieren revisión${invalidCount ? ' antes de aceptar el plan' : ''}.` : `${errors.length + invalidCount} item(s) require review${invalidCount ? ' before the plan can be accepted' : ''}.`}</p>
                    {errors.map((e, i) => <p key={i} className="text-[11px] text-rose-300/80 mt-1">[{e.section}] {e.reason}</p>)}
                    {invalidDueDates.length > 0 && <p className="text-[11px] text-rose-300/80 mt-1">{es ? 'Las fechas de tarea no pueden estar vacías ni en el pasado.' : 'Task due dates cannot be blank or in the past.'}</p>}
                    {invalidReminders.length > 0 && <p className="text-[11px] text-rose-300/80 mt-1">{es ? 'Los recordatorios necesitan fecha, hora y un título concreto.' : 'Reminders need a valid date/time and a concrete title.'}</p>}
                    {invalidDeliveryDates.length > 0 && <p className="text-[11px] text-rose-300/80 mt-1">{es ? 'Alguna fecha de entrega propuesta no es una fecha válida.' : 'A proposed delivery date is not a valid date.'}</p>}
                </section>}

                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-4"><div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-[#3DCD58]" /> {es ? 'Agenda propuesta' : 'Proposed schedule'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Arrastra un bloque para cambiar día u hora, o selecciónalo para editarlo.' : 'Drag a block to another day or time, or select it to edit its exact values.'}</p></div><div className="flex bg-gray-900 border border-gray-700 rounded-lg p-1"><button onClick={() => setPlannerView('agenda')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-black ${plannerView === 'agenda' ? 'bg-[#3DCD58] text-white' : 'text-gray-400'}`}><CalendarDays className="w-3.5 h-3.5" /> AGENDA</button><button onClick={() => setPlannerView('calendar')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-black ${plannerView === 'calendar' ? 'bg-[#3DCD58] text-white' : 'text-gray-400'}`}><LayoutGrid className="w-3.5 h-3.5" /> {es ? 'CALENDARIO' : 'CALENDAR'}</button></div></div>
                    {plannerView === 'agenda' ? <QuickOrganizerWeekAgenda rows={rows} onChange={onChange} onRemove={onRemove} language={language} /> : <div className="h-[650px] rounded-2xl overflow-hidden border border-gray-800 bg-white text-gray-900"><CalendarView<ParsedDueDateRow> items={dueDateRows} getDate={row => row.date} onDateDrop={(id, _type, newDate) => onDueDateChange(id, { date: newDate })} renderItem={row => <div draggable onDragStart={e => { e.dataTransfer.setData('id', row.id); e.dataTransfer.setData('type', 'ai-due-date'); }} className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-800 cursor-grab" title={row.rationale}><b>{es ? 'Fecha:' : 'Due:'}</b> {row.taskLabel}</div>} className="h-full" /></div>}
                    {!dates.length && <div className="bg-gray-900 border border-dashed border-gray-700 rounded-2xl py-10 text-center"><p className="text-xs text-gray-500">{es ? 'La IA no propuso sesiones. Agrega tareas desde el panel derecho.' : 'The AI did not propose any sessions. Add tasks from the right panel.'}</p></div>}
                </section>

                {dueDateRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-amber-400" /> {es ? 'Cambios de fecha en tareas' : 'Task due-date changes'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Revisa cada cambio contra la fecha de entrega de la propuesta.' : 'Review each change against the proposal delivery date.'}</p></div>
                    {dueDateRows.map(row => {
                        const opp = opportunities.find(item => item.id === row.oppId);
                        const task = opp?.tasks?.find(item => item.id === row.taskId);
                        return <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_130px_32px] gap-2 items-center bg-gray-800/60 rounded-xl p-2.5"><div className="min-w-0"><p className="text-xs font-bold truncate">{row.taskLabel}</p><p className="text-[10px] text-gray-400 mt-0.5">Current: {task?.dueDate || 'Not set'} · Proposal delivery: {opp?.dates?.expected || 'Not set'}</p><p className="text-[10px] text-amber-300/80 mt-0.5 truncate" title={row.rationale}>{row.rationale || 'AI adjustment'}</p></div><input type="date" value={row.date} onChange={e => onDueDateChange(row.id, { date: e.target.value })} className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-[10px]"/><button onClick={() => onRemoveDueDate(row.id)} className="text-gray-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div>;
                    })}
                </section>}

                {deliveryDateRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Truck className="w-4 h-4 text-amber-400" /> {es ? 'Cambios de fecha de ENTREGA de la propuesta' : 'Proposal DELIVERY date changes'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Esta fecha es la de la oportunidad completa, no la de una tarea. Solo se aplica cuando el compromiso no es "hard".' : 'This is the whole opportunity date, not a task date. It is only applied when the commitment is not "hard".'}</p></div>
                    {deliveryDateRows.map(row => {
                        const opp = opportunities.find(item => item.id === row.oppId);
                        const isHard = opp?.commercial?.deliveryCommitted === 'hard';
                        return <div key={row.id} className={`grid grid-cols-[minmax(0,1fr)_130px_32px] gap-2 items-center rounded-xl p-2.5 ${isHard ? 'bg-rose-950/40 border border-rose-800/60' : 'bg-gray-800/60'}`}>
                            <div className="min-w-0">
                                <p className="text-xs font-bold truncate">{row.oppLabel}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{es ? 'Actual:' : 'Current:'} {opp?.dates?.expected || row.currentDelivery || (es ? 'sin fecha' : 'not set')} · {es ? 'Compromiso:' : 'Commitment:'} {opp?.commercial?.deliveryCommitted || (es ? 'sin definir (se asume soft)' : 'unset (assumed soft)')}</p>
                                <p className="text-[10px] text-amber-300/80 mt-0.5" title={row.rationale}>{row.rationale || (es ? 'Ajuste de la IA' : 'AI adjustment')}</p>
                                {isHard && <p className="text-[10px] font-bold text-rose-300 mt-0.5">{es ? 'Compromiso duro con el cliente: NO se aplicará. Requiere renegociar.' : 'Hard customer commitment: it will NOT be applied. Renegotiation required.'}</p>}
                            </div>
                            <input type="date" value={row.date} onChange={e => onDeliveryDateChange(row.id, { date: e.target.value })} className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-[10px]" />
                            <button onClick={() => onRemoveDeliveryDate(row.id)} className="text-gray-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                        </div>;
                    })}
                    {hardCommittedDeliveries.length > 0 && <p className="text-[10px] text-rose-300/80">{es ? `${hardCommittedDeliveries.length} propuesta(s) se omitirán al aceptar por ser compromiso duro.` : `${hardCommittedDeliveries.length} proposal(s) will be skipped on accept because the commitment is hard.`}</p>}
                </section>}

                {externalPushRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Send className="w-4 h-4 text-sky-400" /> {es ? 'Empujar a otros (correos, preguntas, escalamientos)' : 'Push on others (pings, questions, escalations)'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Acciones de cinco minutos que ponen a trabajar a alguien más. No se agendan ni se guardan: hazlas y listo.' : 'Five-minute actions that put someone else to work. They are not scheduled or saved: just do them.'}</p></div>
                    {externalPushRows.map(row => <article key={row.id} className="rounded-xl bg-gray-800/60 p-2.5">
                        <div className="flex items-center gap-2">
                            <span className={`shrink-0 text-[9px] font-black tracking-wider border rounded-md px-1.5 py-0.5 ${row.type === 'Escalation' ? 'bg-rose-950/70 text-rose-300 border-rose-700/60' : row.type === 'Question' ? 'bg-amber-950/70 text-amber-300 border-amber-700/60' : 'bg-sky-950/70 text-sky-300 border-sky-700/60'}`}>{row.type.toUpperCase()}</span>
                            <p className="text-[11px] font-bold text-gray-200 truncate">{row.to || (es ? 'destinatario sin definir' : 'recipient not set')}</p>
                            {row.sendBy && <span className="ml-auto shrink-0 text-[10px] font-black tabular-nums text-gray-400">{es ? 'antes de' : 'by'} {row.sendBy}</span>}
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-gray-100">{row.message}</p>
                        <p className="mt-0.5 text-[10px] text-gray-500 truncate">{row.oppLabel}</p>
                    </article>)}
                </section>}

                {contingentRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Timer className="w-4 h-4 text-emerald-400" /> {es ? 'Trabajo contingente (listo en cuanto te respondan)' : 'Contingent work (ready the moment they answer)'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'No ocupa bloque de calendario porque depende de otro. Se activa con el disparador.' : 'It gets no calendar block because it waits on someone else. The trigger activates it.'}</p></div>
                    {contingentRows.map(row => <div key={row.id} className="rounded-xl bg-gray-800/60 p-2.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0"><p className="text-xs font-bold truncate">{row.taskLabel}</p><p className="text-[10px] text-gray-500 truncate">{row.oppLabel}</p></div>
                            {row.estMinutes !== null && <span className="shrink-0 text-[10px] font-black text-emerald-300 tabular-nums">{row.estMinutes} min</span>}
                        </div>
                        <p className="mt-1 text-[11px] text-amber-200/90"><b>{es ? 'Cuando:' : 'When:'}</b> {row.trigger}</p>
                        <p className="mt-0.5 text-[11px] text-gray-200"><b>{es ? 'Haz:' : 'Do:'}</b> {row.action}</p>
                    </div>)}
                </section>}

                {queueRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><ListOrdered className="w-4 h-4 text-[#3DCD58]" /> {es ? 'Cola de ejecución paso a paso' : 'Step-by-step execution queue'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Síguela de arriba a abajo sin tener que decidir nada más.' : 'Follow it top to bottom without having to decide anything else.'}</p></div>
                    <ol className="divide-y divide-gray-800/80 rounded-xl border border-gray-800 overflow-hidden">
                        {[...queueRows].sort((a, b) => a.position - b.position).map(row => <li key={row.id} className="flex items-start gap-3 bg-gray-900/60 px-3 py-2">
                            <span className="shrink-0 mt-0.5 w-6 text-center text-[10px] font-black text-[#3DCD58] tabular-nums">{row.position}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-bold text-gray-100">{row.subtask || row.taskLabel}</p>
                                {row.subtask && <p className="text-[10px] text-gray-500 truncate">{row.taskLabel}</p>}
                                {row.doneWhen && <p className="text-[10px] text-gray-400 mt-0.5">{es ? 'Terminado cuando:' : 'Done when:'} {row.doneWhen}</p>}
                                {row.dependsOn && row.dependsOn !== '-' && <p className="text-[10px] text-amber-300/80 mt-0.5">{es ? 'Depende de:' : 'Depends on:'} {row.dependsOn}</p>}
                            </div>
                            {row.estMinutes !== null && <span className="shrink-0 text-[10px] font-black text-gray-400 tabular-nums">{row.estMinutes} min</span>}
                        </li>)}
                    </ol>
                </section>}

                {suggestedMoveRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><MoveRight className="w-4 h-4 text-amber-400" /> {es ? 'Bloques que convendría mover (tú decides)' : 'Blocks worth moving (you decide)'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'Son bloques fuera del alcance seleccionado: la IA no los reescribe, solo propone a dónde moverlos.' : 'These blocks are outside the selected scope: the AI never rewrites them, it only proposes where to move them.'}</p></div>
                    {suggestedMoveRows.map(row => <div key={row.id} className="rounded-xl bg-gray-800/60 p-2.5">
                        <div className="flex items-center gap-2"><span className="shrink-0 text-[9px] font-black tracking-wider border border-amber-700/60 bg-amber-950/70 text-amber-300 rounded-md px-1.5 py-0.5">{row.action.toUpperCase()}</span><p className="text-xs font-bold truncate">{row.name}</p></div>
                        <p className="mt-1 text-[11px] text-gray-300 tabular-nums">{row.currentDate} {row.currentStart}–{row.currentEnd} → <b className="text-[#3DCD58]">{row.newDate} {row.newStart}–{row.newEnd}</b></p>
                        <p className="mt-0.5 text-[10px] text-gray-500">{row.reason}</p>
                    </div>)}
                </section>}

                {outOfScopeRows.length > 0 && <section className="bg-gray-900 border border-amber-800/60 rounded-2xl p-4 space-y-2">
                    <div><h2 className="text-xs font-black uppercase tracking-widest text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {es ? 'Fechas correctas que caen fuera del horizonte' : 'Correct dates that fall outside the horizon'}</h2><p className="text-[11px] text-gray-500 mt-1">{es ? 'No se escriben en la base de datos porque están fuera de los días que autorizaste. Si quieres que sí se muevan, amplía los días en el paso 2 y vuelve a correr el prompt.' : 'They are not written to the database because they fall outside the days you authorized. To have them moved, widen the days in step 2 and re-run the prompt.'}</p></div>
                    {outOfScopeRows.map(row => <div key={row.id} className="rounded-xl bg-amber-950/30 p-2.5">
                        <div className="flex items-center gap-2"><span className="shrink-0 text-[9px] font-black tracking-wider border border-amber-700/60 text-amber-300 rounded-md px-1.5 py-0.5">{row.scope === 'Opportunity' ? (es ? 'OPORTUNIDAD' : 'OPPORTUNITY') : (es ? 'TAREA' : 'TASK')}</span><p className="text-xs font-bold truncate">{row.name}</p></div>
                        <p className="mt-1 text-[11px] text-gray-300 tabular-nums">{row.currentDate || (es ? 'sin fecha' : 'not set')} → <b className="text-amber-300">{row.advisedDate}</b> {es ? '(solo consejo, no se aplica)' : '(advice only, not applied)'}</p>
                        <p className="mt-0.5 text-[10px] text-gray-500">{row.reason}</p>
                    </div>)}
                </section>}

                {reminderRows.length > 0 && <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3"><h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Bell className="w-4 h-4 text-[#3DCD58]" /> {es ? 'Recordatorios propuestos' : 'Proposed reminders'}</h2>{reminderRows.map(row => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_180px_32px] gap-2 items-center bg-gray-800/60 rounded-xl p-2"><div><p className="text-xs font-bold">{row.taskLabel}</p><input value={row.title} onChange={e => onReminderChange(row.id, { title: e.target.value })} className="mt-1 w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-[11px]"/></div><input type="datetime-local" value={row.remindAt} onChange={e => onReminderChange(row.id, { remindAt: e.target.value })} className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-[10px]"/><button onClick={() => onRemoveReminder(row.id)} className="text-gray-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div>)}</section>}
            </main>

            <aside className="border-l border-gray-800 bg-gray-900/70 flex flex-col min-h-0">
                <div className="p-4 border-b border-gray-800"><h2 className="font-black text-sm">{es ? 'Tareas del organizador' : 'Organizer tasks'}</h2><p className="text-[10px] text-gray-500 mt-1">{es ? 'Agrega tareas al borrador antes de aceptar.' : 'Add tasks to the draft before accepting it.'}</p><div className="mt-3 flex items-center gap-2 bg-gray-950 border border-gray-700 rounded-lg px-2"><Search className="w-3.5 h-3.5 text-gray-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={es ? 'Buscar tareas…' : 'Search tasks…'} className="w-full bg-transparent border-0 px-0 py-2 text-xs focus:ring-0"/></div></div>
                <div className="grid grid-cols-3 border-b border-gray-800">
                    {([['scheduled', `${es ? 'Agendadas' : 'Scheduled'} (${scheduledTasks.length})`], ['unscheduled', `${es ? 'Sin agenda' : 'Unscheduled'} (${unscheduledTasks.length})`], ['all', `${es ? 'Todas' : 'All'} (${allTasks.length})`]] as const).map(([id,label]) => <button key={id} onClick={() => setTaskTab(id)} className={`py-2.5 text-[9px] font-black uppercase border-b-2 ${taskTab === id ? 'text-[#3DCD58] border-[#3DCD58]' : 'text-gray-500 border-transparent'}`}>{label}</button>)}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {visibleTasks.map(({ opp, task }) => { const planned = plannedKeys.has(`${opp.id}::${task.id}`); const existing = (task.executionBlocks || []).length; return <div key={`${opp.id}::${task.id}`} className="bg-gray-800 border border-gray-700 rounded-xl p-3"><div className="flex justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-black text-[#3DCD58] truncate">{opp.alias || opp.title}</p><p className="text-xs font-bold mt-0.5 leading-snug">{task.title}</p></div><span className={`h-fit text-[8px] font-black uppercase px-2 py-1 rounded-full ${planned ? 'bg-emerald-900/60 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>{planned ? 'In plan' : 'Unscheduled'}</span></div><div className="mt-2 flex items-center justify-between"><span className="text-[9px] text-gray-500 flex items-center gap-1"><Clock3 className="w-3 h-3"/>{existing ? `${existing} current block(s)` : `No current schedule`}</span>{!planned && <button onClick={() => onScheduleTask(opp.id, task.id)} className="flex items-center gap-1 text-[10px] font-bold text-[#3DCD58] hover:underline"><Plus className="w-3 h-3"/> Schedule</button>}</div></div>; })}
                    {!visibleTasks.length && <p className="text-xs text-gray-600 text-center py-10">There are no tasks in this section.</p>}
                </div>
                <div className="p-3 border-t border-gray-800 bg-gray-950/60"><p className="text-[10px] text-gray-500">Default when adding manually: {isoToday()}, 09:00–10:00. You can edit it immediately in the agenda.</p></div>
            </aside>
        </div>}
    </div>;
};
