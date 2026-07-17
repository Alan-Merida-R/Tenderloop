import React, { useState, useMemo, useRef, useEffect, useDeferredValue, useCallback } from 'react';
/* Added Subtask to imports */
import { Opportunity, ProcessStage, TaskStatus, TASK_STATUS_COLORS, TASK_STATUS_ORDER, Task, Subtask, TaskPriority, PRIORITY_COLORS, STATUS_COLORS, OpportunityStatus, TaskOwner, KPIs, DeepLink, OpportunityLabel, FloatingTab, DetailedStatus, DETAILED_STATUS_COLORS } from '../types';
import { LayoutGrid, Table as TableIcon, Search, Calendar as CalendarIcon, Filter, Plus, CheckSquare, List, ChevronDown, ChevronRight, ChevronLeft, User, Download, Clock, X, Grid, Briefcase, ArrowRight, Trash2, Edit2, MoreHorizontal, Layers, Copy, Link as LinkIcon, Upload, FileText, Columns, Unlink, Lock, ListChecks, Target, TrendingUp, BarChart3, Minus, Info, Maximize2, Minimize2, RefreshCw, Zap, Activity, Eye, EyeOff, History, Check, Bell } from 'lucide-react';
import { LinkedDocsList } from '../features/doc-links/LinkedDocsList';
import { collectSowTeamMembers } from '../services/sowTeamMembers';
import { ResponsibleTeamPicker } from './OpportunityDetail';
import { DocumentPickerModal } from '../features/doc-links/DocumentPickerModal';
import { saveMeta, listLinkedForTask } from '../services/opportunityDocMetaStore';
import { getNextTask, compareTasksGlobal, getOppStatusWeight, getTaskPriorityWeight } from '../services/taskUtils';
import { CalendarView } from './CalendarView';
import { exportOpportunity, importOpportunity, downloadJSON } from '../services/opportunityExportImport';
import { RichTextEditor } from './OpportunityDetail';
import { TrackingView } from '../features/tracking/TrackingView';
import { CalendarDays, Play, Pause } from 'lucide-react';
import { OpportunitySearchInput, parseBooleanQuery } from './OpportunitySearchInput';
import { TaskSearchInput } from './TaskSearchInput';
import { OptimizedInput, OptimizedTextArea } from './OptimizedInput';
import { DateTimePicker } from './RemindersBell';
import { useTimer, useTimerActions } from '../contexts/TimerContext';
import { EditableCell, ColumnSelector, ColumnFilter } from './TableComponents';
import { ExecutionScheduleSection } from '../features/schedule/ExecutionScheduleSection';
import { ScheduleView } from '../features/schedule/ScheduleView';

const GENERAL_COLUMNS_STORAGE_KEY = 'tenderloop_general_columns_v1';
const GENERAL_SAVE_NOTE_COLUMN_MIGRATION_KEY = 'tenderloop_general_columns_save_note_v1';

const normalizeColumnKeys = (keys: unknown, fallbackKeys: string[]) => {
    if (!Array.isArray(keys)) return fallbackKeys;
    const validKeys = keys.filter((key): key is string => typeof key === 'string' && fallbackKeys.includes(key));
    const missingKeys = fallbackKeys.filter(key => !validKeys.includes(key));
    return [...validKeys, ...missingKeys];
};

const normalizeVisibleColumnKeys = (keys: unknown, fallbackKeys: string[]) => {
    if (!Array.isArray(keys)) return fallbackKeys;
    return keys.filter((key): key is string => typeof key === 'string' && fallbackKeys.includes(key));
};

const readGeneralColumnPrefs = (fallbackKeys: string[], defaultVisibleKeys = fallbackKeys) => {
    try {
        const saved = localStorage.getItem(GENERAL_COLUMNS_STORAGE_KEY);
        if (!saved) return { visibleColumns: defaultVisibleKeys, columnOrder: fallbackKeys };
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            const visibleColumns = normalizeVisibleColumnKeys(parsed, fallbackKeys);
            if (!localStorage.getItem(GENERAL_SAVE_NOTE_COLUMN_MIGRATION_KEY)) {
                localStorage.setItem(GENERAL_SAVE_NOTE_COLUMN_MIGRATION_KEY, '1');
                if (fallbackKeys.includes('saveNote') && !visibleColumns.includes('saveNote')) visibleColumns.push('saveNote');
            }
            return {
                visibleColumns,
                columnOrder: fallbackKeys,
            };
        }
        const visibleColumns = normalizeVisibleColumnKeys(parsed?.visibleColumns, fallbackKeys);
        if (!localStorage.getItem(GENERAL_SAVE_NOTE_COLUMN_MIGRATION_KEY)) {
            localStorage.setItem(GENERAL_SAVE_NOTE_COLUMN_MIGRATION_KEY, '1');
            if (fallbackKeys.includes('saveNote') && !visibleColumns.includes('saveNote')) visibleColumns.push('saveNote');
        }
        return {
            visibleColumns,
            columnOrder: normalizeColumnKeys(parsed?.columnOrder, fallbackKeys),
        };
    } catch (e) {
        return { visibleColumns: defaultVisibleKeys, columnOrder: fallbackKeys };
    }
};




const KPIEvolutionChart: React.FC<{ data: any[], metrics: { key: string, color: string, label: string }[], maxValue: number }> = ({ data, metrics, maxValue }) => {
    const width = 800; // Increased width for better visibility
    const height = 240;
    const padding = 40;

    // Scale functions
    const xScale = (i: number) => padding + (i * (width - 2 * padding) / (data.length - 1 || 1));
    const yScale = (val: number) => height - padding - (val * (height - 2 * padding) / (maxValue || 100));

    return (
        <div className="w-full overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-gray-200">
            <svg width={width} height={height} className="overflow-visible mx-auto">
                {/* Horizontal Grid Lines */}
                {[0, 25, 50, 75, 100].map(v => {
                    const y = yScale(maxValue * (v / 100));
                    return (
                        <g key={v}>
                            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                            <text x={padding - 10} y={y + 3} textAnchor="end" fontSize="8" fontWeight="bold" fill="#9ca3af">{Math.round(maxValue * (v / 100))}</text>
                        </g>
                    );
                })}

                {/* Vertical Period Lines */}
                {data.map((_, i) => (
                    <line key={i} x1={xScale(i)} y1={padding} x2={xScale(i)} y2={height - padding} stroke="#f9fafb" strokeWidth="1" />
                ))}

                {/* Y Axis line */}
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />
                {/* X Axis line */}
                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />

                {/* Data Lines */}
                {metrics.map(m => {
                    const points = data.map((d, i) => `${xScale(i)},${yScale(d[m.key] || 0)}`).join(' ');
                    return (
                        <g key={m.key}>
                            <polyline points={points} fill="none" stroke={m.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />
                            {data.map((d, i) => (
                                <circle
                                    key={i}
                                    cx={xScale(i)}
                                    cy={yScale(d[m.key] || 0)}
                                    r="4.5"
                                    fill="white"
                                    stroke={m.color}
                                    strokeWidth="2.5"
                                    className="cursor-pointer transition-all hover:r-6"
                                >
                                    <title>{`${m.label}\nPeriod: ${d.period}\nValue: ${d[m.key].toFixed(1)}\nOpps: ${d.count}`}</title>
                                </circle>
                            ))}
                        </g>
                    );
                })}

                {/* X Axis Labels */}
                {data.map((d, i) => (
                    <text key={i} x={xScale(i)} y={height - padding + 20} textAnchor="middle" fontSize="9" fontWeight="black" fill="#6b7280" className="uppercase tracking-tighter">{d.period}</text>
                ))}
            </svg>
        </div>
    );
};

interface Props {
    mode: 'proposals' | 'tasks' | 'general';
    opportunities: Opportunity[];
    onSelect: (id: string, deepLink?: DeepLink) => void;
    onCreate: (stage?: ProcessStage) => void;
    onStageChange: (id: string, newStage: ProcessStage) => void;
    onDateChange: (id: string, type: 'expected' | 'dueDate', newDate: string) => void;
    onOppUpdate: (updated: Opportunity) => void;
    onTaskUpdate: (oppId: string, taskId: string, updates: Partial<Task>) => void;
    holidays?: string[];
    globalLabels: OpportunityLabel[];
    alarms?: import('../types').AlarmConfig[];
    hiddenProposalProcessColumns?: string[];
    processBoardColors?: Record<string, string>;
    onMinimize?: (tab: FloatingTab) => void;
    onOpenTaskSubView?: (oppId: string, taskId: string) => void;
    /** Whether the "Remind me" button shows up in the task detail modal. Off by default. */
    remindersEnabled?: boolean;
    onAddReminder?: (reminder: Omit<import('../types').Reminder, 'id' | 'createdAt'>) => void;
    /** Increment to force the Tasks view into the Agenda (schedule) mode — e.g. right after the Quick Organizer applies a plan. */
    agendaFocusNonce?: number;
}

// Helper: Copy text to clipboard
const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(err => console.error('Failed to copy: ', err));
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
    }
};

const PROPOSAL_CARD_FIELD_OPTIONS = [
    { key: 'opId', label: 'OP' },
    { key: 'alias', label: 'Alias', required: true },
    { key: 'detailedStatus', label: 'Detailed Status' },
    { key: 'rank', label: 'Rank' },
    { key: 'title', label: 'Title' },
    { key: 'customer', label: 'Customer' },
    { key: 'nextStep', label: 'Next Step' },
    { key: 'lastHistoryEvent', label: 'Last History Event' },
    { key: 'labels', label: 'Labels' },
    { key: 'quickNote', label: 'Quick Note' },
    { key: 'saveQuickNote', label: 'Save Quick Note' },
    { key: 'processStatus', label: 'Process Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'expectedDate', label: 'Expected Date' },
    { key: 'taskProgress', label: 'Task Progress' },
] as const;

type ProposalCardFieldKey = typeof PROPOSAL_CARD_FIELD_OPTIONS[number]['key'];

const PROPOSAL_CARD_FIELD_STORAGE_KEY = 'tl.proposalCard.visibleFields.v1';
const PROPOSAL_SAVE_NOTE_DEFAULT_OFF_MIGRATION_KEY = 'tl.proposalCard.saveQuickNote.defaultOff.v1';
const PROPOSAL_LAST_HISTORY_EVENT_DEFAULT_ON_MIGRATION_KEY = 'tl.proposalCard.lastHistoryEvent.defaultOn.v1';
const REQUIRED_PROPOSAL_CARD_FIELDS = new Set<ProposalCardFieldKey>(['alias']);
const PROPOSAL_CARD_DEFAULT_VISIBLE_FIELDS = PROPOSAL_CARD_FIELD_OPTIONS
    .map(option => option.key)
    .filter(key => key !== 'saveQuickNote');

const orderProposalCardFields = (fields: Iterable<ProposalCardFieldKey>, includeRequired = true) => {
    const selected = new Set(fields);
    if (includeRequired) {
        REQUIRED_PROPOSAL_CARD_FIELDS.forEach(field => selected.add(field));
    }
    return PROPOSAL_CARD_FIELD_OPTIONS
        .map(option => option.key)
        .filter(field => selected.has(field));
};

const normalizeProposalCardFields = (value: unknown, fallback: ProposalCardFieldKey[], includeRequired = true) => {
    const validKeys = new Set<ProposalCardFieldKey>(PROPOSAL_CARD_FIELD_OPTIONS.map(option => option.key));
    if (!Array.isArray(value)) return orderProposalCardFields(fallback, includeRequired);
    return orderProposalCardFields(
        value.filter((field): field is ProposalCardFieldKey =>
            typeof field === 'string' && validKeys.has(field as ProposalCardFieldKey)
        ),
        includeRequired
    );
};

const readProposalCardFields = (storageKey: string, fallback: ProposalCardFieldKey[], includeRequired = true) => {
    try {
        const saved = localStorage.getItem(storageKey);
        if (!saved) return orderProposalCardFields(fallback, includeRequired);
        return normalizeProposalCardFields(JSON.parse(saved), fallback, includeRequired);
    } catch {
        return orderProposalCardFields(fallback, includeRequired);
    }
};

// --- Sub-components for better performance ---


const TaskTimerControls = React.memo(({
    item,
    isTable = false
}: {
    item: any,
    isTable?: boolean
}) => {
    const { timerState, startTimer, pauseTimer } = useTimer();
    const isActive = timerState.taskId === item.id;
    const isRunning = isActive && timerState.isRunning;

    const total = (item.timeLogs || []).reduce((acc: any, log: any) => acc + (log.durationSeconds || 0), 0);
    const displaySeconds = isActive ? timerState.elapsedSeconds : total;

    const showTime = displaySeconds > 0 || isActive;
    const h = Math.floor(displaySeconds / 3600);
    const m = Math.floor((displaySeconds % 3600) / 60);

    if (isTable) {
        return (
            <div className="flex items-center gap-2 mr-2">
                {showTime && (
                    <span className="text-xs font-mono font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                        {h}h {m}m
                    </span>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isRunning) pauseTimer();
                        else startTimer(item.id, item.opp.id, item.title);
                    }}
                    className={`p-1.5 rounded-full transition-colors ${isRunning ? 'text-red-500 animate-pulse bg-red-50' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                    title={isRunning ? 'Pause Timer' : 'Start Timer'}
                >
                    {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
            </div>
        );
    }

    return (
        <div className="absolute bottom-3 right-20 flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 shadow-sm">
                {h}h {m}m
            </span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (isRunning) pauseTimer();
                    else startTimer(item.id, item.opp.id, item.title);
                }}
                className={`p-1.5 rounded-full transition-colors z-10 bg-white border border-gray-100 shadow-sm ${isRunning ? 'text-red-500 animate-pulse border-red-200' : 'text-gray-400 hover:text-green-500 hover:border-green-200 opacity-0 group-hover:opacity-100'}`}
                title={isRunning ? 'Pause Timer' : 'Start Timer'}
            >
                {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
        </div>
    );
});

// --- Memoized Kanban Card for performance ---
const OpportunityCard = React.memo(({
    opp,
    onSelect,
    handleDragStart,
    handleInlineEdit,
    kanbanMiniNote,
    onNoteChange,
    onArchiveQuickNote,
    cardFieldVisibility,
    translateStatus,
    alarms
}: any) => {
    const nextTask = useMemo(() => getNextTask(opp.tasks || []), [opp.tasks]);
    const isCardFieldVisible = useCallback((field: ProposalCardFieldKey) => cardFieldVisibility?.[field] !== false, [cardFieldVisibility]);
    const latestHistoryContent = useMemo(() => {
        const list = opp.history || [];
        if (!list.length) return '';
        return [...list].sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))[0]?.content || '';
    }, [opp.history]);
    const isBlockedStale = useMemo(() => {
        if ((nextTask?.status === 'Missing Info' || nextTask?.status === 'Approval') && nextTask?.dueDate) {
            const hrs = (Date.now() - new Date(nextTask.dueDate).getTime()) / 3600000;
            return hrs > 48;
        }
        return false;
    }, [nextTask]);

    const showFooter = isCardFieldVisible('expectedDate') || isCardFieldVisible('taskProgress');

    return (
        <div
            onClick={(e) => { e.stopPropagation(); onSelect(opp.id); }}
            draggable
            onDragStart={(e) => handleDragStart(e, opp.id, 'opp')}
            className="kanban-cursor-grab bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-[#3DCD58] cursor-grab active:cursor-grabbing transition-all group relative flex flex-col gap-2 overflow-hidden"
        >
            <div className={`absolute top-0 left-0 right-0 h-1 ${opp.statusLabel === 'Won' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
            <div className="flex flex-col gap-1 mt-2">
                <div className="flex items-start justify-between gap-2 overflow-hidden mb-1">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        {isCardFieldVisible('opId') && (
                            <span className="text-[9px] font-mono text-gray-500 bg-gray-50 px-1 rounded truncate py-0.5">OP: {opp.id}</span>
                        )}
                        {isCardFieldVisible('alias') && opp.alias && (() => {
                            const imp = getImportanceColor(opp.priorityOrder, opp.dates?.expected, opp.statusLabel === 'Won' || opp.statusLabel === 'Lost' || opp.statusLabel === 'Canceled' || opp.detailedStatus === 'Completed' || opp.detailedStatus === 'Canceled', alarms);
                            return (
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tight ${imp.className}`} style={imp.style}>
                                    {opp.alias}
                                </span>
                            );
                        })()}
                        {isCardFieldVisible('detailedStatus') && opp.detailedStatus && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tight ${DETAILED_STATUS_COLORS[opp.detailedStatus]} whitespace-nowrap`}>
                                {translateStatus(opp.detailedStatus)}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        {isCardFieldVisible('rank') && opp.priorityOrder && (
                            <span className="text-[9px] font-bold text-[#3DCD58] bg-[#3DCD58]/10 px-1.5 py-0.5 rounded whitespace-nowrap border border-[#3DCD58]/20">
                                Rank #{opp.priorityOrder}
                            </span>
                        )}
                    </div>
                </div>
                {isCardFieldVisible('title') && (
                    <p className="text-xs text-gray-900 font-bold leading-tight line-clamp-2" title={opp.title}>{opp.title}</p>
                )}
                {isCardFieldVisible('customer') && (
                    <p className="text-[10px] text-gray-500 truncate">{opp.customer}</p>
                )}

                {isCardFieldVisible('nextStep') && nextTask && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(opp.id, { tab: 'tasks', taskId: nextTask.id });
                        }}
                        className={`kanban-cursor-pointer mt-1 flex items-start gap-1.5 p-2 rounded-lg border shadow-sm animate-in fade-in slide-in-from-top-1 cursor-pointer hover:brightness-95 transition-all ${isBlockedStale ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}
                        title="Open this task in expediente"
                    >
                        <div className="shrink-0 mt-0.5">
                            {isBlockedStale
                                ? <span title="Blocked >48h">⚠️</span>
                                : <Zap className="w-3 h-3 text-blue-500 fill-blue-500" />}
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-black uppercase opacity-60 tracking-wider">Next Step</span>
                            <span className="text-[11px] font-bold leading-tight line-clamp-2">{nextTask.title}</span>
                            {nextTask.status === 'Missing Info' && (
                                <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-1 rounded">
                                    ⚠ Missing Info{nextTask.responsible ? ` · ${nextTask.responsible}` : ''}
                                </span>
                            )}
                            {nextTask.status === 'Approval' && (
                                <span className="text-[9px] font-black text-purple-600 bg-purple-100 px-1 rounded">
                                    ⚠ Approval{nextTask.responsible ? ` · ${nextTask.responsible}` : ''}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {isCardFieldVisible('labels') && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {(opp.labels || []).map((l: any) => (
                            <div key={l.id} className="text-[9px] px-1.5 py-0.5 rounded font-bold text-white shadow-sm" style={{ backgroundColor: l.color }}>
                                {l.text}
                            </div>
                        ))}
                    </div>
                )}

                {isCardFieldVisible('lastHistoryEvent') && (latestHistoryContent || opp.lastHistoryEventOverride) && (
                    <div className="mt-1 flex items-start gap-1.5 p-1.5 rounded-lg bg-gray-50 border border-gray-100" onClick={e => e.stopPropagation()}>
                        <History className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                        <OptimizedTextArea
                            value={opp.lastHistoryEventOverride || latestHistoryContent}
                            onChange={(val: string) => handleInlineEdit(opp, 'lastHistoryEventOverride', val)}
                            placeholder="Last history event..."
                            title="Last history event (editable — overrides what's shown on the card)"
                            className="min-h-12 max-h-48 min-w-0 flex-1 resize-y overflow-auto bg-transparent border-none p-0 text-[10px] leading-relaxed text-gray-600 focus:ring-0"
                        />
                    </div>
                )}

                {isCardFieldVisible('quickNote') && (
                    <div className="mt-2 flex items-stretch gap-1.5" onClick={e => e.stopPropagation()}>
                        <OptimizedTextArea
                            placeholder="Quick note..."
                            value={kanbanMiniNote}
                            onChange={(val) => onNoteChange(val, opp.id)}
                            onDraftChange={(val: string) => onNoteChange(val, opp.id, true)}
                            className="min-w-0 flex-1 text-[10px] text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg p-1.5 h-12 focus:ring-1 focus:ring-yellow-300 outline-none placeholder-gray-300"
                        />
                        {isCardFieldVisible('saveQuickNote') && (
                            <button
                                type="button"
                                onClick={() => onArchiveQuickNote(opp.id)}
                                className="shrink-0 self-stretch px-2 text-amber-700 bg-amber-100 border border-amber-200 rounded-lg hover:bg-amber-200 transition-colors"
                                title="Save quick note to history"
                            >
                                <History className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-2">
                    {isCardFieldVisible('processStatus') && (
                        <div className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${STATUS_COLORS[opp.statusLabel as OpportunityStatus]}`}>
                            {translateStatus(opp.statusLabel)}
                        </div>
                    )}
                    {isCardFieldVisible('priority') && opp.priority && (
                        <div className={`text-[9px] w-2 h-2 rounded-full ${(PRIORITY_COLORS[opp.priority as TaskPriority] || '').split(' ')[1] || ''}`} title={`Priority: ${opp.priority}`}></div>
                    )}
                </div>
            </div>
            {showFooter && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-gray-100">
                    {isCardFieldVisible('expectedDate') ? (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <Clock className="w-3 h-3" />
                            <input
                                type="date"
                                value={opp.dates?.expected}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleInlineEdit(opp, 'dates.expected', e.target.value)}
                                className="bg-transparent border-none p-0 text-[10px] text-gray-500 focus:ring-0 w-20"
                            />
                        </div>
                    ) : <div />}
                    {isCardFieldVisible('taskProgress') && (
                        <div className="flex gap-1">
                            {(opp.tasks || []).length > 0 && (
                                <div className="flex items-center gap-1 text-[10px] bg-gray-50 px-1.5 py-0.5 rounded text-gray-500" title="Tasks Completed">
                                    <CheckSquare className="w-3 h-3" />
                                    {(opp.tasks || []).filter((t: any) => t.status === 'Done').length}/{(opp.tasks || []).length}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    // FIX: prop is kanbanMiniNote (singular), not kanbanMiniNotes (plural)
    return prev.opp === next.opp
        && prev.kanbanMiniNote === next.kanbanMiniNote
        && prev.cardFieldVisibilityKey === next.cardFieldVisibilityKey
        && prev.alarms === next.alarms;
});


const getImportanceColor = (rank: number | null, dateStr?: string, isCompleted: boolean = false, alarms?: import('../types').AlarmConfig[]): { className: string, style?: React.CSSProperties } => {
    if (isCompleted) return { className: "bg-gray-100 text-gray-400 line-through" };
    if (!dateStr) return { className: "bg-white/90 text-gray-700 border border-gray-200 shadow-sm" };
    const daysLeft = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    
    if (alarms && alarms.length > 0) {
        // Find the first alarm where daysLeft <= alarm.daysThreshold
        // Assuming alarms are sorted by daysThreshold
        const sortedAlarms = [...alarms].sort((a, b) => a.daysThreshold - b.daysThreshold);
        for (const alarm of sortedAlarms) {
            if (daysLeft <= alarm.daysThreshold) {
                if (alarm.backgroundColor) {
                    return { 
                        className: "shadow-sm border border-gray-200/50", 
                        style: { backgroundColor: alarm.backgroundColor, color: alarm.textColor || '#ffffff' } 
                    };
                }
                return { className: alarm.color };
            }
        }
        return { className: "bg-[#3DCD58] text-white shadow-sm" }; // fallback if no alarm matches
    }

    // Default legacy behavior (if no alarms in DB)
    if (daysLeft < -10) return { className: "bg-[repeating-linear-gradient(45deg,#ffffff,#ffffff_10px,#fecaca_10px,#fecaca_20px)] text-[#991b1b] border border-[#f87171]" };
    if (daysLeft <= -6) return { className: "bg-purple-600 text-white shadow-md shadow-purple-200" };
    if (daysLeft < 0)  return { className: "bg-red-500 text-white shadow-sm" };
    if (daysLeft <= 2) return { className: "bg-orange-500 text-white shadow-sm" };
    if (daysLeft <= 5) return { className: "bg-yellow-400 text-gray-900 shadow-sm" };
    return { className: "bg-[#3DCD58] text-white shadow-sm" };
};

const translateStatus = (status: string) => {
    const mapping: Record<string, string> = {
        'Working on it': 'Working on it',
        'Review': 'Review',
        'Info Needed': 'Info Needed',
        'Paused': 'Paused',
        'Approval': 'Approval',
        'Meeting': 'Meeting',
        'Completed': 'Completed',
        'Canceled': 'Canceled',
        // Legacy
        'No Status': 'Review',
        'Waiting': 'Info Needed'
    };
    return mapping[status] || status;
};

const TaskCard = React.memo(({
    item,
    onSelect,
    onDelete,
    onUpdate,
    onStatusChange,
    onDragStart
}: {
    item: any,
    onSelect: (t: any) => void,
    onDelete: (e: React.MouseEvent, oppId: string, taskId: string) => void,
    onUpdate: (oppId: string, taskId: string, updates: any) => void,
    onStatusChange: (oppId: string, taskId: string, status: TaskStatus) => void,
    onDragStart: (e: React.DragEvent, id: string, type: 'task', oppId: string) => void
}) => {
    const { startTimer, timerState } = useTimer();
    const isTimerActive = timerState.taskId === item.id && timerState.isRunning;
    const isDone = item.status === 'Done';
    const [isExpanded, setIsExpanded] = useState(false);
    const [assignOpen, setAssignOpen] = useState(false);
    const subtasks: Subtask[] = item.subtasks || [];
    const doneSubtasks = subtasks.filter(s => s.completed).length;
    const totalSubtasks = subtasks.length;
    const sowTeamMembers = useMemo(() => collectSowTeamMembers(item.opp.notes), [item.opp.notes]);

    const toggleSubtask = (subtaskId: string) => {
        const updatedSubtasks = subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
        onUpdate(item.opp.id, item.id, { subtasks: updatedSubtasks });
        const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed);
        if (allDone && item.status !== 'Done') onStatusChange(item.opp.id, item.id, 'Done');
        else if (!allDone && item.status === 'Done') onStatusChange(item.opp.id, item.id, 'In Progress');
    };

    return (
        <div
            className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 text-sm cursor-pointer hover:border-[#3DCD58] transition-all relative group"
            onClick={() => onSelect({ task: item, oppId: item.opp.id })}
            draggable
            onDragStart={(e) => onDragStart(e, item.id, 'task', item.opp.id)}
        >
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isTimerActive && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            startTimer(item.id, item.opp.id, item.title);
                        }}
                        className="p-1 text-gray-400 hover:text-[#3DCD58] rounded hover:bg-[#3DCD58]/10 transition-colors"
                        title="Start Timer"
                    >
                        <Play className="w-3.5 h-3.5" />
                    </button>
                )}
                <button
                    onClick={(e) => onDelete(e, item.opp.id, item.id)}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    title="Delete Task"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                {item.order && <span className="bg-gray-100 px-1.5 py-0.5 rounded font-black text-gray-500 text-[9px] border border-gray-200" title="Execution Order">#{item.order}</span>}
                {item.opp.alias && <span className="bg-[#3DCD58] text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tight shadow-sm border border-[#2db64a]" title={item.opp.title}>{item.opp.alias}</span>}
                {(item.opp.labels || []).map((l: OpportunityLabel) => (
                    <div key={l.id} className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} title={l.text}></div>
                ))}
                {isTimerActive && (
                    <div className="flex items-center gap-1 text-[#3DCD58] animate-pulse">
                        <Clock className="w-2.5 h-2.5" />
                        <span className="text-[9px] font-black uppercase">Active</span>
                    </div>
                )}
                {(item.executionBlocks?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-0.5 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1 py-0" title={`${item.executionBlocks.length} scheduled block${item.executionBlocks.length === 1 ? '' : 's'}`}>
                        <CalendarDays className="w-2.5 h-2.5" />
                        <span className="text-[9px] font-black uppercase">Scheduled</span>
                    </div>
                )}
            </div>

            <div className="flex items-start gap-2 pr-12">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onStatusChange(item.opp.id, item.id, isDone ? 'Pending' : 'Done');
                    }}
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isDone ? 'bg-[#3DCD58] border-[#3DCD58]' : 'border-gray-300 hover:border-[#3DCD58]'}`}
                    title={isDone ? 'Mark as not done' : 'Mark as done'}
                >
                    {isDone && <Check className="w-2.5 h-2.5 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>{item.title}</div>
                    {item.description && (
                        <p className={`text-xs mt-0.5 line-clamp-2 ${isDone ? 'text-gray-300' : 'text-gray-500'}`}>{item.description}</p>
                    )}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        const order: TaskPriority[] = ['Low', 'Medium', 'High'];
                        const next = order[(order.indexOf(item.priority as TaskPriority) + 1) % 3];
                        onUpdate(item.opp.id, item.id, { priority: next });
                    }}
                    className={`w-2 h-2 rounded-full hover:scale-150 transition-transform cursor-pointer mt-1.5 shrink-0 ${(PRIORITY_COLORS[item.priority as TaskPriority] || '').split(' ')[1] || ''}`}
                    title={`Priority: ${item.priority} (Click to cycle)`}
                ></button>
                {item.blockDoneUntilDependenciesDone && <Lock className="w-2.5 h-2.5 text-gray-400 mt-1.5 shrink-0" />}
            </div>

            {totalSubtasks > 0 && (
                <div className="mt-2 pl-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#3DCD58] transition-all" style={{ width: `${Math.round(doneSubtasks / totalSubtasks * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 shrink-0">{doneSubtasks}/{totalSubtasks}</span>
                        <button onClick={() => setIsExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 shrink-0" title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}>
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <div className="mt-1.5 space-y-1">
                        {(isExpanded ? subtasks : subtasks.slice(0, 2)).map(sub => (
                            <label key={sub.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={sub.completed}
                                    onChange={() => toggleSubtask(sub.id)}
                                    className="w-3 h-3 rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                />
                                <span className={`text-[10px] truncate ${sub.completed ? 'line-through text-gray-300' : 'text-gray-600'}`}>{sub.title}</span>
                            </label>
                        ))}
                        {!isExpanded && totalSubtasks > 2 && (
                            <button onClick={() => setIsExpanded(true)} className="text-[9px] font-bold text-gray-400 hover:text-[#3DCD58]">+{totalSubtasks - 2} more</button>
                        )}
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2 mt-2">
                <select
                    value={item.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onStatusChange(item.opp.id, item.id, e.target.value as TaskStatus)}
                    className={`text-[10px] border-none p-0 bg-transparent font-medium cursor-pointer ${(TASK_STATUS_COLORS[item.status as TaskStatus] || '').split(' ')[1] || ''}`}
                >
                    {TASK_STATUS_ORDER.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                </select>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 flex-wrap gap-1">
                <div className="flex items-center gap-1 flex-wrap">
                    {!!item.responsible && (item.externalAreas || []).length > 0 && <span className="text-[10px] text-[#3DCD58] bg-[#3DCD58]/10 px-1 rounded truncate max-w-[100px]">{(item.externalAreas || []).join(', ')}</span>}
                    <button
                        onClick={(e) => { e.stopPropagation(); setAssignOpen(v => !v); }}
                        className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                    >
                        <User className="w-2.5 h-2.5" /> {item.responsible || 'Assign'}
                    </button>
                </div>
                <input
                    type="date"
                    value={item.dueDate}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdate(item.opp.id, item.id, { dueDate: e.target.value })}
                    className="text-[10px] text-gray-400 ml-auto border-none p-0 bg-transparent text-right w-16 focus:ring-0"
                />
            </div>

            {(item.responsibleRequestedDate || item.responsibleDueDate) && (
                <div className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-bold mt-1 inline-block" title="Requested on / committed date">
                    {item.responsibleRequestedDate || '?'} → {item.responsibleDueDate || '?'}
                </div>
            )}

            {assignOpen && (
                <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <ResponsibleTeamPicker
                        options={sowTeamMembers}
                        selected={item.responsibleTeamMemberIds || []}
                        onChange={(ids) => onUpdate(item.opp.id, item.id, {
                            responsibleTeamMemberIds: ids,
                            responsible: ids.map((id: string) => sowTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', '),
                            owner: ids.length > 0 ? 'External Area' : item.owner,
                            externalAreas: Array.from(new Set(ids.map((id: string) => sowTeamMembers.find(m => m.id === id)?.area).filter(Boolean))),
                            ...(ids.length > 0 ? { isAssignment: true, responsibleRequestedDate: item.responsibleRequestedDate || new Date().toLocaleDateString('en-CA') } : {})
                        })}
                    />
                    {(item.responsibleTeamMemberIds || []).length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Requested on</label>
                                <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-xs p-1.5" value={item.responsibleRequestedDate || ''} onChange={(e) => onUpdate(item.opp.id, item.id, { responsibleRequestedDate: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-gray-500 uppercase">Committed date</label>
                                <input type="date" className="w-full border-gray-200 bg-white rounded-lg text-xs p-1.5" value={item.responsibleDueDate || ''} onChange={(e) => onUpdate(item.opp.id, item.id, { responsibleDueDate: e.target.value })} />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isExpanded && (
                <div onClick={(e) => e.stopPropagation()}>
                    <LinkedDocsList opportunityId={item.opp.id} revision={item.opp.revision} taskId={item.id} />
                </div>
            )}

            {/* isTable variant renders inline (not absolutely positioned) so it can't overlap the
                assign popover / attachments content below it when the card grows taller. */}
            <div className="mt-2 pt-2 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                <TaskTimerControls item={item} isTable={true} />
            </div>
        </div >
    );
});

const TaskRow = React.memo(({
    item,
    isSelected,
    onSelect,
    onSelectionToggle,
    onUpdate,
    onStatusChange
}: {
    item: any,
    isSelected: boolean,
    onSelect: (t: any) => void,
    onSelectionToggle: (id: string, checked: boolean) => void,
    onUpdate: (oppId: string, taskId: string, updates: any) => void,
    onStatusChange: (oppId: string, taskId: string, status: TaskStatus) => void
}) => {
    // Optimized date diff
    const diff = useMemo(() => {
        if (!item.dueDate) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(item.dueDate + 'T00:00:00');
        return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }, [item.dueDate]);

    return (
        <div
            className={`bg-white hover:bg-gray-50 flex items-center justify-between p-3 cursor-pointer group transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}
            onClick={() => onSelect({ task: item, oppId: item.opp.id })}
        >
            <div className="flex items-center gap-4 flex-1 min-w-0">
                <div onClick={(e) => e.stopPropagation()} className="pl-2">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelectionToggle(item.id, e.target.checked)}
                        className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58] cursor-pointer"
                    />
                </div>
                <div className="w-1 h-10 rounded-full shrink-0 bg-gray-200"></div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-mono px-1.5 rounded bg-gray-100 text-gray-500`}>{item.opp.id}</span>
                        {item.opp.alias && <span className="bg-[#3DCD58]/10 text-[#3DCD58] px-1.5 rounded text-[9px] font-black uppercase tracking-tight">{item.opp.alias}</span>}
                        <span className="text-[10px] font-bold text-gray-400 truncate max-w-[150px]" title={item.opp.title}>{item.opp.title}</span>
                        <span className={`hidden md:inline-block text-[9px] px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[item.opp.statusLabel] || 'border-gray-200 text-gray-400'}`}>{item.opp.statusLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {item.order && <span className="text-xs font-bold text-gray-400 shrink-0">#{item.order}</span>}
                        <span className="text-sm font-bold text-gray-900 truncate" title={item.title}>{item.title}</span>
                        {!!item.responsible && (item.externalAreas || []).length > 0 && <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 rounded flex items-center gap-1 shrink-0"><User className="w-3 h-3" /> {(item.externalAreas || []).join(', ')}</span>}
                        {item.blockDoneUntilDependenciesDone && <Lock className="w-3 h-3 text-gray-400 shrink-0" />}
                        {(item.executionBlocks?.length ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0" title={`${item.executionBlocks.length} scheduled block${item.executionBlocks.length === 1 ? '' : 's'}`}>
                                <CalendarDays className="w-2.5 h-2.5" /> Scheduled
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4 pl-4 shrink-0">
                <div className="text-right flex items-center gap-3">
                    <TaskTimerControls item={item} isTable={true} />
                    <div className="text-xs font-bold text-gray-700 flex items-center gap-1 justify-end">
                        <CalendarIcon className="w-3 h-3 text-gray-400" />
                        <input
                            type="date"
                            value={item.dueDate}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onUpdate(item.opp.id, item.id, { dueDate: e.target.value })}
                            className="bg-transparent border-none p-0 text-xs text-gray-700 font-bold focus:ring-0 text-right w-24 cursor-pointer"
                        />
                    </div>
                    {diff !== null && (
                        <div className={`text-[9px] font-bold ${diff < 0 ? 'text-red-500' : diff === 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                            {diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? 'Due today' : `${diff}d left`}
                        </div>
                    )}
                </div>

                <select
                    value={item.priority || 'Medium'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdate(item.opp.id, item.id, { priority: e.target.value as any })}
                    className={`text-[10px] px-2 py-1 rounded border-none cursor-pointer font-bold uppercase w-20 ${PRIORITY_COLORS[item.priority as TaskPriority]}`}
                >
                    {Object.keys(PRIORITY_COLORS).map(p => <option key={p} value={p}>{p}</option>)}
                </select>

                <select
                    value={item.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onStatusChange(item.opp.id, item.id, e.target.value as TaskStatus)}
                    className={`text-[10px] px-2 py-1 rounded border-none cursor-pointer font-bold uppercase w-28 ${TASK_STATUS_COLORS[item.status as TaskStatus]}`}
                >
                    {TASK_STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
        </div>
    );
});




interface MultiSelectDropdownProps {
    options: string[];
    selected: string[];
    onChange: (val: string[]) => void;
    label: string;
    isOpen: boolean;
    onToggle: () => void;
}

const MultiSelectDropdown = ({ options, selected, onChange, label, isOpen, onToggle }: MultiSelectDropdownProps) => {
    // Internal search for dropdown
    const [searchTerm, setSearchTerm] = useState("");
    const deferredSearchTerm = useDeferredValue(searchTerm);

    // Filter options for display
    const visibleOptions = useMemo(() => {
        if (!deferredSearchTerm && options.length <= 50) return options;
        const lower = deferredSearchTerm.toLowerCase();
        return options.filter(opt => opt.toLowerCase().includes(lower));
    }, [options, deferredSearchTerm]);

    // Limit rendered items to keep DOM light
    const renderedOptions = visibleOptions.slice(0, 50);
    const allRenderedSelected = renderedOptions.length > 0 && renderedOptions.every(opt => selected.includes(opt));
    const toggleAllRendered = () => {
        if (allRenderedSelected) {
            onChange(selected.filter(opt => !renderedOptions.includes(opt)));
            return;
        }
        onChange(Array.from(new Set([...selected, ...renderedOptions])));
    };

    return (
        <div className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 shadow-sm hover:bg-gray-50 whitespace-nowrap"
            >
                <Filter className="w-4 h-4 text-gray-400" />
                {selected.length === 0 ? label : `${selected.length} selected`}
                <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => onToggle()}></div>
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-[500] max-h-80 overflow-y-auto p-2 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                        {options.length > 10 && (
                            <div className="px-2 sticky top-0 bg-white z-20 pb-2 border-b border-gray-100">
                                <input
                                    autoFocus
                                    placeholder="Search..."
                                    className="w-full text-xs p-1.5 border border-gray-200 rounded bg-gray-50 focus:bg-white focus:ring-1 focus:ring-[#3DCD58] outline-none transition-colors"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    // Prevent closing when typing
                                    onClick={e => e.stopPropagation()}
                                />
                            </div>
                        )}
                        <div className="flex flex-col gap-1 overflow-y-auto">
                            {renderedOptions.length > 0 && (
                                <label className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer group border-b border-gray-100 mb-1 pb-3">
                                    <input
                                        type="checkbox"
                                        checked={allRenderedSelected}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            toggleAllRendered();
                                        }}
                                        className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58] cursor-pointer"
                                    />
                                    <span className="text-sm font-semibold text-gray-800">Select all</span>
                                </label>
                            )}
                            {renderedOptions.map(opt => (
                                <label key={opt} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(opt)}
                                        onChange={() => {
                                            if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
                                            else onChange([...selected, opt]);
                                        }}
                                        className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58] cursor-pointer"
                                    />
                                    <span className="text-sm text-gray-700 group-hover:text-gray-900 truncate" title={opt}>{opt}</span>
                                </label>
                            ))}
                            {visibleOptions.length > 50 && (
                                <div className="text-xs text-center text-gray-400 py-1 italic">
                                    + {visibleOptions.length - 50} more...
                                </div>
                            )}
                        </div>

                        {selected.length > 0 && (
                            <button
                                onClick={() => { onChange([]); onToggle(); }}
                                className="w-full text-center text-xs text-red-500 hover:text-red-700 py-2 border-t border-gray-100 mt-1"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

/**
 * Principal Dashboard component for TenderLoop.
 * Provides views for Kanban, Timeline, Table, and KPI metrics.
 */
const Dashboard: React.FC<Props> = React.memo(({ mode, opportunities, onSelect, onCreate, onStageChange, onDateChange, onOppUpdate, onTaskUpdate, globalLabels = [], alarms = [], hiddenProposalProcessColumns = [], processBoardColors = {}, onMinimize, onOpenTaskSubView, remindersEnabled = false, onAddReminder, agendaFocusNonce = 0 }) => {
    const { startTimer, pauseTimer, getTimerState } = useTimerActions();
    // Note: Dashboard now avoids subscribing to ticking timerState to prevent whole-app 1s re-renders.
    const [proposalsViewMode, setProposalsViewMode] = useState<'board' | 'table' | 'calendar'>('board');
    const [tasksViewMode, setTasksViewMode] = useState<'board' | 'table' | 'calendar' | 'schedule'>('board');

    // Derived current view mode based on component 'mode' prop
    const viewMode = mode === 'tasks' ? tasksViewMode : proposalsViewMode;
    const setViewMode = mode === 'tasks' ? setTasksViewMode : setProposalsViewMode;

    // External "jump to the Agenda" signal (e.g. Quick Organizer just applied a plan). The
    // Dashboard stays mounted under that overlay, so a nonce is the only way to retarget it.
    useEffect(() => {
        if (agendaFocusNonce > 0) setTasksViewMode('schedule');
    }, [agendaFocusNonce]);

    const [filterText, setFilterText] = useState('');
    const deferredFilterText = useDeferredValue(filterText); // Optimize search performance
    const [labelFilters, setLabelFilters] = useState<string[]>([]);
    const [selectedOppChips, setSelectedOppChips] = useState<string[]>([]);
    const [statusFilters, setStatusFilters] = useState<string[]>([]);
    const [dateFilterStart, setDateFilterStart] = useState('');
    const [dateFilterEnd, setDateFilterEnd] = useState('');
    const [detailedStatusFilters, setDetailedStatusFilters] = useState<string[]>([]);

    // Column State
    const allColumns = useMemo(() => [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'customer', label: 'Customer' },
        { key: 'seller', label: 'Seller' },
        { key: 'status', label: 'Process Status' },
        { key: 'assigned', label: 'Assigned' },
        { key: 'expected', label: 'Expected Date' },
        { key: 'amount', label: 'Amount' },
        { key: 'nextStep', label: 'Next Step' },
        { key: 'waiting', label: 'Waiting On' },
        { key: 'lastHistoryEvent', label: 'Last History Event' },
        { key: 'notes', label: 'Notes' },
        { key: 'saveNote', label: 'Save Quick Note' }
    ], []);
    const allColumnKeys = useMemo(() => allColumns.map(c => c.key), [allColumns]);
    const defaultVisibleColumns = useMemo(() => allColumnKeys.filter(key => key !== 'lastHistoryEvent'), [allColumnKeys]);
    const [visibleColumns, setVisibleColumns] = useState<string[]>(() => readGeneralColumnPrefs(allColumnKeys, defaultVisibleColumns).visibleColumns);
    const [columnOrder, setColumnOrder] = useState<string[]>(() => readGeneralColumnPrefs(allColumnKeys).columnOrder);
    const orderedTableColumns = useMemo(() => {
        const byKey = new Map(allColumns.map(col => [col.key, col]));
        return normalizeColumnKeys(columnOrder, allColumnKeys)
            .map(key => byKey.get(key))
            .filter(Boolean) as typeof allColumns;
    }, [allColumns, allColumnKeys, columnOrder]);

    useEffect(() => {
        const normalizedVisible = visibleColumns.filter(key => allColumnKeys.includes(key));
        const normalizedOrder = normalizeColumnKeys(columnOrder, allColumnKeys);
        localStorage.setItem(GENERAL_COLUMNS_STORAGE_KEY, JSON.stringify({
            visibleColumns: normalizedVisible,
            columnOrder: normalizedOrder,
        }));
    }, [visibleColumns, columnOrder, allColumnKeys]);

    const [collapsedColumns, setCollapsedColumns] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('tenderloop_collapsed_proposal_columns');
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return [];
    });

    useEffect(() => {
        localStorage.setItem('tenderloop_collapsed_proposal_columns', JSON.stringify(collapsedColumns));
    }, [collapsedColumns]);
    
    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
    const quickNoteDraftsRef = useRef<Record<string, string>>({});
    const [historySaveNotice, setHistorySaveNotice] = useState<string | null>(null);
    const historySaveNoticeTimeoutRef = useRef<number | null>(null);
    const customerOptions = useMemo(() => Array.from(new Set(opportunities.map(o => o.customer).filter(Boolean))) as string[], [opportunities]);
    const sellerOptions = useMemo(() => Array.from(new Set(opportunities.map(o => o.seller).filter(Boolean))) as string[], [opportunities]);
    const assignedOptions = useMemo(() => Array.from(new Set(opportunities.map(o => o.assigned).filter(Boolean))) as string[], [opportunities]);
    const idOptions = useMemo(() => Array.from(new Set(opportunities.map(o => o.id).filter(Boolean))) as string[], [opportunities]);
    const titleOptions = useMemo(() => Array.from(new Set(opportunities.map(o => o.title).filter(Boolean))) as string[], [opportunities]);
    // The Process Status column displays detailedStatus, not the main opportunity status.
    const statusOptions = useMemo(() => Array.from(new Set(opportunities.map(o => o.detailedStatus || 'Working on it'))) as string[], [opportunities]);
    const mainStatusOptions = useMemo(() => Array.from(new Set(opportunities.map(o => o.statusLabel).filter(Boolean))) as string[], [opportunities]);
    const expectedOptions = useMemo(() => Array.from(new Set(opportunities.map(o => o.dates?.expected).filter(Boolean))) as string[], [opportunities]);
    const waitingOptions = useMemo(() => Array.from(new Set(opportunities.map(getWaitingOnAreas).filter(Boolean))) as string[], [opportunities]);
    // Include labels created from Settings and labels already assigned to any opportunity.
    const availableLabels = useMemo(() => {
        const labels = new Map<string, OpportunityLabel>();
        globalLabels.forEach(label => labels.set(label.id, label));
        opportunities.forEach(opp => (opp.labels || []).forEach(label => labels.set(label.id, label)));
        return [...labels.values()];
    }, [globalLabels, opportunities]);

    // KPI Filter State
    const [kpiSoldFilter, setKpiSoldFilter] = useState<'all' | 'sold' | 'not-sold'>('all');
    const [kpiTimeRange, setKpiTimeRange] = useState<'weekly' | 'monthly' | 'quarterly' | 'semester' | 'yearly'>('monthly');

    // Task specific filters with persistence
    const taskFilterKey = 'generalTasksFilters';
    const [taskSearchText, setTaskSearchText] = useState('');
    const [taskStatusFilters, setTaskStatusFilters] = useState<string[]>([]);
    const [taskPriorityFilters, setTaskPriorityFilters] = useState<string[]>([]);

    // UI State for filtering (Dropdowns)
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const toggleDropdown = (name: string) => {
        setOpenDropdown(prev => prev === name ? null : name);
    };
    const [taskOppFilters, setTaskOppFilters] = useState<string[]>([]);
    const [taskAreaFilters, setTaskAreaFilters] = useState<string[]>([]);
    const [taskOppStatusFilters, setTaskOppStatusFilters] = useState<string[]>([]);
    const [taskGroupBy, setTaskGroupBy] = useState<'status' | 'area' | 'priority' | 'opportunity'>('status');
    const [taskCalendarizedFilter, setTaskCalendarizedFilter] = useState<'all' | 'calendarized' | 'not-calendarized'>('all');

    // Next Steps Toggle
    const [showNextSteps, setShowNextSteps] = useState(false);
    const [showProposalCardFieldsMenu, setShowProposalCardFieldsMenu] = useState(false);
    const [proposalCardVisibleFields, setProposalCardVisibleFields] = useState<ProposalCardFieldKey[]>(
        () => readProposalCardFields(PROPOSAL_CARD_FIELD_STORAGE_KEY, PROPOSAL_CARD_DEFAULT_VISIBLE_FIELDS)
    );
    const [showTracking, setShowTracking] = useState(false);

    // Add Task Modal State
    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    const [newTaskData, setNewTaskData] = useState<{ oppId: string, title: string }>({ oppId: '', title: '' });

    // Start Timer Modal State
    const [showStartTimerModal, setShowStartTimerModal] = useState(false);
    const [startTimerData, setStartTimerData] = useState<{ oppId: string, taskId: string }>({ oppId: '', taskId: '' });
    const [timerSearch, setTimerSearch] = useState('');
    const [newTaskSearch, setNewTaskSearch] = useState('');

    // Task Selection and Bulk Actions
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [showCopyToOppModal, setShowCopyToOppModal] = useState(false);
    const [copyTargetOppId, setCopyTargetOppId] = useState('');
    const [showBulkEditModal, setShowBulkEditModal] = useState(false);
    const [bulkEditStatus, setBulkEditStatus] = useState('');
    const [bulkEditDate, setBulkEditDate] = useState('');
    // Performance Optimization: Defer search calculation
    const deferredTaskSearchText = useDeferredValue(taskSearchText);

    // Workload chart
    const [showWorkloadChart, setShowWorkloadChart] = useState(false);

    // Sticky Notes (stored in localStorage)
    const STICKY_KEY = 'tenderloop.stickynotes.v1';
    interface StickyNote { id: string; content: string; createdAt: string; }
    const [stickyNotes, setStickyNotes] = useState<StickyNote[]>(() => {
        try { return JSON.parse(localStorage.getItem(STICKY_KEY) || '[]'); } catch { return []; }
    });
    const [showStickyPanel, setShowStickyPanel] = useState(false);
    const [stickyMinimized, setStickyMinimized] = useState(false);
    const [newStickyText, setNewStickyText] = useState('');
    useEffect(() => { localStorage.setItem(STICKY_KEY, JSON.stringify(stickyNotes)); }, [stickyNotes]);
    const addStickyNote = () => {
        if (!newStickyText.trim()) return;
        setStickyNotes(prev => [{ id: crypto.randomUUID(), content: newStickyText.trim(), createdAt: new Date().toISOString() }, ...prev]);
        setNewStickyText('');
    };
    const deleteStickyNote = (id: string) => setStickyNotes(prev => prev.filter(n => n.id !== id));
    const updateStickyNote = (id: string, content: string) => setStickyNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));

    useEffect(() => {
        localStorage.setItem(PROPOSAL_CARD_FIELD_STORAGE_KEY, JSON.stringify(proposalCardVisibleFields));
    }, [proposalCardVisibleFields]);

    useEffect(() => {
        if (localStorage.getItem(PROPOSAL_SAVE_NOTE_DEFAULT_OFF_MIGRATION_KEY)) return;
        localStorage.setItem(PROPOSAL_SAVE_NOTE_DEFAULT_OFF_MIGRATION_KEY, '1');
        setProposalCardVisibleFields(prev => prev.filter(field => field !== 'saveQuickNote'));
    }, []);

    useEffect(() => {
        if (localStorage.getItem(PROPOSAL_LAST_HISTORY_EVENT_DEFAULT_ON_MIGRATION_KEY)) return;
        localStorage.setItem(PROPOSAL_LAST_HISTORY_EVENT_DEFAULT_ON_MIGRATION_KEY, '1');
        setProposalCardVisibleFields(prev => orderProposalCardFields([...prev, 'lastHistoryEvent']));
    }, []);

    useEffect(() => () => {
        if (historySaveNoticeTimeoutRef.current !== null) window.clearTimeout(historySaveNoticeTimeoutRef.current);
    }, []);

    const toggleProposalCardField = useCallback((field: ProposalCardFieldKey) => {
        if (REQUIRED_PROPOSAL_CARD_FIELDS.has(field)) return;
        setProposalCardVisibleFields(prev => {
            const selected = new Set(normalizeProposalCardFields(prev, PROPOSAL_CARD_DEFAULT_VISIBLE_FIELDS));
            if (selected.has(field)) selected.delete(field);
            else selected.add(field);
            return orderProposalCardFields(selected);
        });
    }, []);

    const proposalCardFieldVisibility = useMemo(() => {
        const visible = new Set(normalizeProposalCardFields(proposalCardVisibleFields, PROPOSAL_CARD_DEFAULT_VISIBLE_FIELDS));

        return PROPOSAL_CARD_FIELD_OPTIONS.reduce((acc, option) => {
            acc[option.key] = REQUIRED_PROPOSAL_CARD_FIELDS.has(option.key)
                || visible.has(option.key);
            return acc;
        }, {} as Record<ProposalCardFieldKey, boolean>);
    }, [proposalCardVisibleFields]);

    const proposalCardFieldVisibilityKey = useMemo(() => (
        PROPOSAL_CARD_FIELD_OPTIONS
            .map(option => `${option.key}:${proposalCardFieldVisibility[option.key] ? '1' : '0'}`)
            .join('|')
    ), [proposalCardFieldVisibility]);

    // Kanban mini-notes are now integrated into the Opportunity object (kanbanNote field) 
    // to ensure portability and unified database management. No longer using localStorage.

    // Close Task Modal State
    const [closeTaskData, setCloseTaskData] = useState<{ task: Task, oppId: string } | null>(null);

    // Load persistent filters (Tab Independent)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(taskFilterKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.status) setTaskStatusFilters(parsed.status);
                if (parsed.priority) setTaskPriorityFilters(parsed.priority);
                if (parsed.opp) setTaskOppFilters(parsed.opp);
                if (parsed.area) setTaskAreaFilters(parsed.area);
                if (parsed.groupBy) setTaskGroupBy(parsed.groupBy);
                // Table view was removed — migrate any persisted 'table' preference to 'board'.
                if (parsed.tasksViewMode) setTasksViewMode(parsed.tasksViewMode === 'table' ? 'board' : parsed.tasksViewMode);
                if (parsed.proposalsViewMode) setProposalsViewMode(parsed.proposalsViewMode === 'table' ? 'board' : parsed.proposalsViewMode);
            } else {
                // Default: All statuses + priorities selected
                setTaskStatusFilters(TASK_STATUS_ORDER);
                setTaskPriorityFilters(Object.keys(PRIORITY_COLORS));
            }
        } catch (e) { }
    }, []);

    // Save persistent filters (Tab Independent)
    useEffect(() => {
        const state = {
            status: taskStatusFilters,
            priority: taskPriorityFilters,
            opp: taskOppFilters,
            area: taskAreaFilters,
            groupBy: taskGroupBy,
            tasksViewMode,
            proposalsViewMode
        };
        localStorage.setItem(taskFilterKey, JSON.stringify(state));
    }, [taskStatusFilters, taskPriorityFilters, taskOppFilters, taskAreaFilters, taskGroupBy, tasksViewMode, proposalsViewMode]);



    // Kanban Grouping State
    const [kanbanGroupBy, setKanbanGroupBy] = useState<'status' | 'detailed'>('detailed');
    // Editable column order for Process Kanban — persisted in localStorage
    const PROCESS_COLS_DEFAULT = ['Working on it', 'Review', 'Info Needed', 'Paused', 'Approval', 'Meeting', 'Completed', 'Canceled'];
    const [processColumnOrder, setProcessColumnOrder] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('tl.processColOrder') || 'null') || PROCESS_COLS_DEFAULT; } catch { return PROCESS_COLS_DEFAULT; }
    });
    const [draggingCol, setDraggingCol] = useState<string | null>(null);
    useEffect(() => { localStorage.setItem('tl.processColOrder', JSON.stringify(processColumnOrder)); }, [processColumnOrder]);
    const moveProcessColumn = (from: string, to: string) => {
        if (from === to) return;
        setProcessColumnOrder(prev => {
            const next = [...prev];
            const fi = next.indexOf(from); const ti = next.indexOf(to);
            if (fi < 0 || ti < 0) return prev;
            next.splice(fi, 1); next.splice(ti, 0, from);
            return next;
        });
    };

    const [selectedTask, setSelectedTask] = useState<{ task: Task, oppId: string } | null>(null);
    const [remindTaskPopoverOpen, setRemindTaskPopoverOpen] = useState(false);
    const [remindTaskWhen, setRemindTaskWhen] = useState('');
    const [remindTaskPicking, setRemindTaskPicking] = useState(false);
    const [showDocPicker, setShowDocPicker] = useState<boolean>(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [splitViewNoteId, setSplitViewNoteId] = useState<string | null>(null);
    const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(new Date().toLocaleDateString('en-CA'));
    const [showCalendarSidebar, setShowCalendarSidebar] = useState(true);
    const [calendarSidebarTab, setCalendarSidebarTab] = useState<'date' | 'unscheduled'>('date');
    const [isCalendarMaximized, setIsCalendarMaximized] = useState(false);

    // Bulk selection state for export
    const [selectedForExport, setSelectedForExport] = useState<string[]>([]);
    const importInputRef = useRef<HTMLInputElement>(null);


    // --- Calculations ---
    const getCalendarItemStyles = (item: any, type: 'task' | 'opp') => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let dateStr = type === 'task' ? item.dueDate : item.dates.expected;

        const isCompleted = type === 'task'
            ? item.status === 'Done' || item.status === 'Canceled'
            : ['Submitted', 'Won', 'Lost', 'Canceled'].includes(item.statusLabel);

        if (dateStr && !isCompleted) {
            const itemDate = new Date(dateStr + 'T00:00:00');
            const diffTime = today.getTime() - itemDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 6) {
                return "bg-purple-900 text-white border-purple-950 font-black shadow-lg shadow-purple-900/20";
            }
        }

        if (type === 'task') return "bg-blue-50 text-blue-700 border-blue-100 font-bold hover:bg-blue-100/80 mb-0.5";

        // Distinguishable colors for proposals with alias
        if (type === 'opp' && item.alias) {
            const distColors = [
                'bg-blue-600 text-white border-blue-700 shadow-blue-500/20',
                'bg-emerald-600 text-white border-emerald-700 shadow-emerald-500/20',
                'bg-orange-600 text-white border-orange-700 shadow-orange-500/20',
                'bg-rose-600 text-white border-rose-700 shadow-rose-500/20',
                'bg-cyan-600 text-white border-cyan-700 shadow-cyan-500/20',
                'bg-indigo-600 text-white border-indigo-700 shadow-indigo-500/20',
                'bg-teal-600 text-white border-teal-700 shadow-teal-500/20',
                'bg-pink-600 text-white border-pink-700 shadow-pink-500/20',
                'bg-amber-600 text-white border-amber-700 shadow-amber-500/20',
                'bg-fuchsia-600 text-white border-fuchsia-700 shadow-fuchsia-500/20',
            ];
            let hash = 0;
            const seed = item.alias + item.id;
            for (let i = 0; i < seed.length; i++) {
                hash = seed.charCodeAt(i) + ((hash << 5) - hash);
            }
            const index = Math.abs(hash) % distColors.length;
            return `${distColors[index]} font-bold mb-0.5 shadow-sm active:scale-95 transition-all`;
        }

        return 'bg-gray-100 border-transparent font-bold mb-0.5';
    };

    const handleResetFilters = () => {
        setFilterText('');
        setTaskSearchText('');
        setSelectedOppChips([]);
        setStatusFilters([]);
        setDetailedStatusFilters([]);
        setLabelFilters([]);
        setDateFilterStart('');
        setDateFilterEnd('');
        
        // Task specific
        setTaskStatusFilters([]);
        setTaskPriorityFilters([]);
        setTaskOppFilters([]);
        setTaskAreaFilters([]);
        setTaskOppStatusFilters([]);
        setTaskCalendarizedFilter('all');
        setColumnFilters({});
        setKpiSoldFilter('all');
        setOpenDropdown(null);
        setShowNextSteps(false);
    };



    const getSellPrice = (opp: Opportunity) => {
        if (!opp.commercial) return opp.kpis?.proposalAmountUSD || 0;
        if ((opp.commercial.cqaOfficialSellPrice || 0) > 0) return opp.commercial.cqaOfficialSellPrice;
        
        const sections = opp.commercial.customSections || [];
        if (sections.length > 0) {
            return sections.reduce((acc, sec) => acc + (sec.sellPrice || 0), 0);
        }
        
        // Fallback for legacy data
        const legacy = opp.commercial as any;
        return (legacy.swHw?.sellPrice || 0) + (legacy.services?.sellPrice || 0) + (legacy.resale?.sellPrice || 0);
    };

    // NOTE: deferredOpportunities is already deferred above (line 659).
    // Use it directly to avoid a second useDeferredValue on the same value.

    // --- Filter Logic ---
    const filteredOpps = useMemo(() => {
        const seen = new Set();
        const booleanMatcher = parseBooleanQuery(deferredFilterText);
        const results: Opportunity[] = [];

        for (let i = 0; i < (opportunities || []).length; i++) {
            const opp = opportunities[i];

            // 1. Deduplicate
            if (seen.has(opp.id)) continue;
            seen.add(opp.id);

            // 2. Chip Filter (Fast Exit)
            if (selectedOppChips.length > 0 && !selectedOppChips.includes(opp.id)) continue;

            // 3. Status Filter
            if (statusFilters.length > 0) {
                if (!statusFilters.includes(opp.statusLabel)) continue;
            }

            // 4. Date Filter
            if ((dateFilterStart || dateFilterEnd) && mode !== 'tasks') {
                const dateToCheck = (mode === 'general' && opp.kpis?.timeline?.deliveredAt)
                    ? opp.kpis.timeline.deliveredAt
                    : opp.dates?.expected;
                if (dateFilterStart && (!dateToCheck || dateToCheck < dateFilterStart)) continue;
                if (dateFilterEnd && (!dateToCheck || dateToCheck > dateFilterEnd)) continue;
            }

            // 5. Labels/Task status Filters
            if (labelFilters.length > 0 && !(opp.labels || []).some(l => labelFilters.includes(l.id))) continue;
            if (taskOppStatusFilters.length > 0 && !taskOppStatusFilters.includes(opp.statusLabel)) continue;
            if (detailedStatusFilters.length > 0 && (!opp.detailedStatus || !detailedStatusFilters.includes(opp.detailedStatus))) continue;
            if (columnFilters.customer?.length > 0 && (!opp.customer || !columnFilters.customer.includes(opp.customer))) continue;
            if (columnFilters.seller?.length > 0 && (!opp.seller || !columnFilters.seller.includes(opp.seller))) continue;
            if (columnFilters.assigned?.length > 0 && (!opp.assigned || !columnFilters.assigned.includes(opp.assigned))) continue;
            if (columnFilters.id?.length > 0 && (!opp.id || !columnFilters.id.includes(opp.id))) continue;
            if (columnFilters.title?.length > 0 && (!opp.title || !columnFilters.title.includes(opp.title))) continue;
            if (columnFilters.status?.length > 0) {
                const statusValue = mode === 'general' ? (opp.detailedStatus || 'Working on it') : opp.statusLabel;
                if (!columnFilters.status.includes(statusValue)) continue;
            }
            if (columnFilters.expected?.length > 0 && (!opp.dates?.expected || !columnFilters.expected.includes(opp.dates.expected))) continue;
            if (columnFilters.amount?.length > 0) {
                const [operator, rawValue] = columnFilters.amount[0].split(':');
                const filterValue = Number(rawValue);
                const amount = getSellPrice(opp);
                const matchesAmount = Number.isFinite(filterValue) && (
                    (operator === 'lt' && amount < filterValue) ||
                    (operator === 'lte' && amount <= filterValue) ||
                    (operator === 'gt' && amount > filterValue) ||
                    (operator === 'gte' && amount >= filterValue) ||
                    (operator === 'eq' && amount === filterValue) ||
                    (operator === 'neq' && amount !== filterValue)
                );
                if (!matchesAmount) continue;
            }
            if (columnFilters.waiting?.length > 0 && !columnFilters.waiting.includes(getWaitingOnAreas(opp) || '')) continue;

            // 6. Multi-term Search (Ultra Optimized v5000)
            if (booleanMatcher) {
                const searchable = (opp as any)._searchIndex || '';
                if (!booleanMatcher(searchable)) continue;
            }

            results.push(opp);
        }
        return results;
    }, [opportunities, deferredFilterText, selectedOppChips, statusFilters, mode, dateFilterStart, dateFilterEnd, labelFilters, taskOppStatusFilters, detailedStatusFilters, columnFilters]);

    // --- KPI Aggregation Logic ---
    const kpiData = useMemo(() => {
        if (filteredOpps.length === 0) return null;

        const res = {
            count: 0, sumL: 0, vL: 0, sumT: 0, vT: 0, sumD: 0, vD: 0, sumE: 0, vE: 0, sumA: 0,
            sC: 0, tS: 0, sumDD: 0, vDD: 0, sumWD: 0, vWD: 0
        };

        // HIGH PERFORMANCE SINGLE PASS
        for (let i = 0; i < filteredOpps.length; i++) {
            const o = filteredOpps[i];
            if (kpiSoldFilter === 'sold' && o.kpis?.sold !== true) continue;
            if (kpiSoldFilter === 'not-sold' && o.kpis?.sold !== false) continue;

            res.count++;
            const k = o.kpis;
            if (!k) continue;

            if (k.languageSkill !== null) { res.sumL += k.languageSkill; res.vL++; }
            if (k.technicalUnderstanding !== null) { res.sumT += k.technicalUnderstanding; res.vT++; }
            if (k.dealProbability !== null) { res.sumD += k.dealProbability; res.vD++; }
            if (k.effortContribution !== null && k.effortContribution > 0) { res.sumE += k.effortContribution; res.vE++; }
            if (k.proposalAmountUSD) res.sumA += k.proposalAmountUSD;
            if (k.sold === true) res.sC++;
            if (k.sold !== null) res.tS++;

            if (k.timeline?.receivedAt && k.timeline?.deliveredAt) {
                const s = new Date(k.timeline.receivedAt).getTime();
                const e = new Date(k.timeline.deliveredAt).getTime();
                const d = Math.ceil((e - s) / 86400000);
                if (d >= 0) { res.sumDD += d; res.vDD++; }
            }
            if (k.execution?.myWorkDays !== null) { res.sumWD += (k.execution?.myWorkDays || 0); res.vWD++; }
        }

        if (res.count === 0) return null;

        return {
            avgLang: res.vL ? (res.sumL / res.vL).toFixed(1) : '-',
            avgTech: res.vT ? (res.sumT / res.vT).toFixed(1) : '-',
            avgDeal: res.vD ? (res.sumD / res.vD).toFixed(1) : '-',
            avgEffort: res.vE ? (res.sumE / res.vE).toFixed(1) : '-',
            winRate: res.tS ? ((res.sC / res.tS) * 100).toFixed(1) : '-',
            avgAmount: res.count ? (res.sumA / res.count).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-',
            avgDeliveryDays: res.vDD ? (res.sumDD / res.vDD).toFixed(1) : '-',
            avgWorkDays: res.vWD ? (res.sumWD / res.vWD).toFixed(1) : '-',
            totalOpps: res.count
        };
    }, [filteredOpps, kpiSoldFilter]);

    // --- Historical KPI Data ---
    const kpiHistoricalData = useMemo<any[] | null>(() => {
        const targetOpps = filteredOpps.filter(opp => {
            if (!opp.kpis?.timeline.deliveredAt) return false;
            if (kpiSoldFilter === 'all') return true;
            if (kpiSoldFilter === 'sold') return opp.kpis?.sold === true;
            if (kpiSoldFilter === 'not-sold') return opp.kpis?.sold === false;
            return true;
        });

        if (targetOpps.length === 0) return null;

        const getPeriodKey = (dateStr: string, range: string) => {
            if (!dateStr) return 'No_Date';
            const [y, m, d] = dateStr.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            const year = date.getFullYear();

            if (range === 'yearly') return `${year}`;
            if (range === 'monthly') {
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
            if (range === 'quarterly') {
                const q = Math.floor(date.getMonth() / 3) + 1;
                return `${year} Q${q}`;
            }
            if (range === 'semester') {
                const s = Math.floor(date.getMonth() / 6) + 1;
                return `${year} S${s}`;
            }
            if (range === 'weekly') {
                const firstDayOfYear = new Date(year, 0, 1);
                const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
                const week = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                return `${year} W${week.toString().padStart(2, '0')}`;
            }
            return dateStr;
        };

        // Grouping
        const groups: Record<string, Opportunity[]> = {};
        targetOpps.forEach(opp => {
            const key = getPeriodKey(opp.kpis!.timeline.deliveredAt!, kpiTimeRange);
            if (!groups[key]) groups[key] = [];
            groups[key].push(opp);
        });

        // Custom sort for period keys (Smarter sort for string labels)
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            // Priority: Year first, then sub-period
            const aYear = a.match(/\d{4}/)?.[0] || "";
            const bYear = b.match(/\d{4}/)?.[0] || "";
            if (aYear !== bYear) return aYear.localeCompare(bYear);
            return a.localeCompare(b);
        });
        return sortedKeys.map(key => {
            const opps = groups[key];
            const count = opps.length;

            const sumLang = opps.reduce((sum, o) => sum + (o.kpis?.languageSkill || 0), 0);
            const sumTech = opps.reduce((sum, o) => sum + (o.kpis?.technicalUnderstanding || 0), 0);
            const sumDeal = opps.reduce((sum, o) => sum + (o.kpis?.dealProbability || 0), 0);
            const sumEffort = opps.reduce((sum, o) => sum + (o.kpis?.effortContribution || 0), 0);

            const validLangCount = opps.filter(o => o.kpis?.languageSkill !== null).length;
            const validTechCount = opps.filter(o => o.kpis?.technicalUnderstanding !== null).length;
            const validDealCount = opps.filter(o => o.kpis?.dealProbability !== null).length;
            const validEffortCount = opps.filter(o => o.kpis?.effortContribution !== null && o.kpis?.effortContribution > 0).length;

            const soldCount = opps.filter(o => o.kpis?.sold === true).length;
            const totalSoldStatus = opps.filter(o => o.kpis?.sold !== null).length;

            let sumDeliveryDays = 0;
            let validDeliveryCount = 0;
            let sumWorkDays = 0;
            let validWorkCount = 0;

            opps.forEach(o => {
                if (o.kpis?.timeline?.receivedAt && o.kpis?.timeline?.deliveredAt) {
                    const start = new Date(o.kpis.timeline.receivedAt).getTime();
                    const end = new Date(o.kpis.timeline.deliveredAt).getTime();
                    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    if (days >= 0) {
                        sumDeliveryDays += days;
                        validDeliveryCount++;
                    }
                }
                if (o.kpis?.execution.myWorkDays !== null) {
                    sumWorkDays += (o.kpis?.execution.myWorkDays || 0);
                    validWorkCount++;
                }
            });

            return {
                period: key,
                count,
                avgLang: validLangCount ? sumLang / validLangCount : 0,
                avgTech: validTechCount ? sumTech / validTechCount : 0,
                avgDeal: validDealCount ? sumDeal / validDealCount : 0,
                avgEffort: validEffortCount ? sumEffort / validEffortCount : 0,
                winRate: totalSoldStatus ? (soldCount / totalSoldStatus) * 100 : 0,
                avgDelivery: validDeliveryCount ? sumDeliveryDays / validDeliveryCount : 0,
                avgWork: validWorkCount ? sumWorkDays / validWorkCount : 0
            };
        });
    }, [filteredOpps, kpiSoldFilter, kpiTimeRange]);

    // --- Helper: Validate Task Completion ---
    const validateTaskCompletion = (oppId: string, taskId: string, newStatus: TaskStatus): boolean => {
        if (newStatus !== 'Done') return true;

        const opp = opportunities.find(o => o.id === oppId);
        if (!opp) return true;

        const task = (opp.tasks || []).find(t => t.id === taskId);
        if (!task || !task.blockDoneUntilDependenciesDone || !task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) return true;

        const pendingDeps = (opp.tasks || []).filter(t => task.dependsOnTaskIds!.includes(t.id) && t.status !== 'Done' && t.status !== 'Canceled');

        if (pendingDeps.length > 0) {
            alert("This task is blocked until its dependencies are completed.");
            return false;
        }
        return true;
    };

    const { confirmStop } = useTimerActions();

    const handleTaskStatusChange = useCallback((oppId: string, taskId: string, newStatus: TaskStatus): void => {
        const currentState = getTimerState();
        // If marking as Done and there's an active timer for THIS task, we must stop it first to log the time.
        if (newStatus === 'Done' && currentState.taskId === taskId && currentState.isRunning) {
            confirmStop('Done'); // This will call handleTimerLog which updates DB and status
            return;
        }

        if (newStatus === 'Done') {
            const opp = opportunities.find(o => o.id === oppId);
            const task = opp?.tasks.find(t => t.id === taskId);
            if (task?.isAssignment) {
                const today = new Date().toISOString().split('T')[0];
                if (task.status === 'Missing Info' && (task.approverTeamMemberIds || []).length > 0) {
                    onTaskUpdate(oppId, taskId, { status: 'Approval', responsibleDeliveredDate: task.responsibleDeliveredDate || today, approvalRequestedDate: task.approvalRequestedDate || today });
                    return;
                }
                if (task.status === 'Missing Info') {
                    onTaskUpdate(oppId, taskId, { status: 'Done', responsibleDeliveredDate: task.responsibleDeliveredDate || today });
                    return;
                }
                if (task.status === 'Approval') {
                    onTaskUpdate(oppId, taskId, { status: 'Done', approvalDeliveredDate: task.approvalDeliveredDate || today });
                    return;
                }
            }
            // Allow checking validation first or assume validation passes?
            if (validateTaskCompletion(oppId, taskId, newStatus)) {
                if (task) {
                    setCloseTaskData({ task, oppId });
                    return;
                }
            } else {
                return; // Validation failed
            }
        }

        if (validateTaskCompletion(oppId, taskId, newStatus)) {
            onTaskUpdate(oppId, taskId, { status: newStatus });
        }
    }, [opportunities, confirmStop, getTimerState, onTaskUpdate]);

    // Dynamic Opportunity Options for filter
    const oppFilterOptions = useMemo(() => {
        return filteredOpps.map(o => o.id);
    }, [filteredOpps]);

    // --- Consolidated Task Processing (Filtering, Grouping, Next Steps) ---
    // Single pass through possibilities to avoid multiple heavy flatMaps and filter/sort cycles.
    const taskData = useMemo(() => {
        const result = {
            filtered: [] as any[],
            grouped: {} as Record<string, any[]>,
            nextSteps: { overdue: [] as any[], dueToday: [] as any[], noDate: [] as any[] }
        };

        if (mode !== 'tasks' && !showTracking) return result;

        const today = new Date().toLocaleDateString('en-CA');
        const taskMatcher = parseBooleanQuery(deferredTaskSearchText);

        // Pre-convert filters to Sets for O(1) lookups
        const statusFilterSet = new Set(taskStatusFilters);
        const priorityFilterSet = new Set(taskPriorityFilters);
        const areaFilterSet = new Set(taskAreaFilters);
        const oppFilterSet = new Set(taskOppFilters);
        const oppStatusFilterSet = new Set(taskOppStatusFilters);

        // Define groups
        if (mode === 'tasks') {
            if (taskGroupBy === 'status') {
                TASK_STATUS_ORDER.forEach(k => result.grouped[k] = []);
            } else if (taskGroupBy === 'priority') {
                ['High', 'Medium', 'Low'].forEach(k => result.grouped[k] = []);
            }
        }

        const taskWithRanks: any[] = [];

        filteredOpps.forEach(opp => {
            const oppStatusWeight = getOppStatusWeight(opp.statusLabel);
            const oppPriority = opp.priorityOrder ?? 999;
            
            // Skip if opp doesn't match general filter in specific modes
            if (oppFilterSet.size > 0 && !oppFilterSet.has(opp.id)) return;
            if (oppStatusFilterSet.size > 0 && !oppStatusFilterSet.has(opp.statusLabel)) return;

            (opp.tasks || []).forEach(t => {
                // 1. Task Search (Local)
                if (taskMatcher) {
                    const raw = `${t.id} ${t.title} ${t.description || ''} ${t.responsible || ''} ${t.status} ${t.priority} ${(t.externalAreas || []).join(' ')}`.toLowerCase();
                    if (!taskMatcher(raw)) return;
                }

                // 2. Date Filter
                if (dateFilterStart || dateFilterEnd) {
                    if (!t.dueDate) return;
                    if (dateFilterStart && t.dueDate < dateFilterStart) return;
                    if (dateFilterEnd && t.dueDate > dateFilterEnd) return;
                }

                // 3. Task Status/Priority Filters
                if (statusFilterSet.size > 0 && !statusFilterSet.has(t.status)) return;
                if (priorityFilterSet.size > 0 && !priorityFilterSet.has(t.priority)) return;

                if (areaFilterSet.size > 0) {
                    const isInternal = t.owner === 'Me' && areaFilterSet.has('Internal');
                    const isExternal = t.externalAreas && t.externalAreas.some(area => areaFilterSet.has(area));
                    if (!isInternal && !isExternal) return;
                }

                if (taskCalendarizedFilter === 'calendarized' && !t.calendarized) return;
                if (taskCalendarizedFilter === 'not-calendarized' && t.calendarized) return;

                // PRE-CALCULATE SORT RANK (CRITICAL PERFORMANCE IMPROVEMENT)
                const taskPriorityWeight = getTaskPriorityWeight(t.priority);
                const orderVal = t.order ?? 999999;
                const dueDateKey = t.dueDate || '9999-99-99';
                // Rank: [OppStatus(1)][DueDate(10)][Order(6)][TaskPriority(1)][OppPriority(3)][Title(20)]
                const sortRank = `${oppStatusWeight}-${dueDateKey}-${String(orderVal).padStart(6, '0')}-${taskPriorityWeight}-${String(oppPriority).padStart(3, '0')}-${(t.title || '').slice(0, 20)}`;

                const taskWithOpp = { ...t, opp, sortRank };
                taskWithRanks.push(taskWithOpp);

                if (mode === 'tasks') {
                    let key = 'Other';
                    if (taskGroupBy === 'status') {
                        key = TASK_STATUS_ORDER.includes(t.status) ? t.status : 'Pending';
                    }
                    else if (taskGroupBy === 'priority') key = t.priority;
                    else if (taskGroupBy === 'area') {
                        key = (t.owner === 'Me') ? 'Internal' : 'External';
                    } else if (taskGroupBy === 'opportunity') {
                        key = `${opp.id} - ${opp.title}`;
                    }

                    if (!result.grouped[key]) result.grouped[key] = [];
                    result.grouped[key].push(taskWithOpp);

                    const isTerminal = ['Done', 'Canceled'].includes(t.status);
                    if (!isTerminal) {
                        if (!t.dueDate) result.nextSteps.noDate.push(taskWithOpp);
                        else if (t.dueDate < today) result.nextSteps.overdue.push(taskWithOpp);
                        else if (t.dueDate === today) result.nextSteps.dueToday.push(taskWithOpp);
                    }
                }
            });
        });

        // FAST SORT using rank strings (much faster than calling helper 400k times)
        // taskWithRanks.sort((a, b) => a.sortRank.localeCompare(b.sortRank));
        // ONLY sort the main array if we actually need it for a flat view
        if (taskGroupBy === 'none') {
            taskWithRanks.sort((a, b) => a.sortRank.localeCompare(b.sortRank));
        }
        result.filtered = taskWithRanks;

        if (mode === 'tasks') {
            Object.keys(result.grouped).forEach(key => {
                result.grouped[key].sort((a, b) => a.sortRank.localeCompare(b.sortRank));
            });
        }

        return result;
    }, [filteredOpps, taskStatusFilters, taskPriorityFilters, taskAreaFilters, taskOppFilters, taskOppStatusFilters, taskCalendarizedFilter, dateFilterStart, dateFilterEnd, deferredTaskSearchText, taskGroupBy, mode, showNextSteps, kanbanGroupBy, showTracking]);

    // Convenient aliases to keep rest of code working
    // If showNextSteps is active, we basically filter the 'current' view (Kanban or Table)
    // to only show the next actionable items.
    const filteredTasks = useMemo(() => {
        if (mode === 'tasks' && showNextSteps) {
            return taskData.filtered.filter(t => !['Done', 'Completada', 'Won', 'Lost', 'Canceled', 'Cancelada'].includes(t.status));
        }
        return taskData.filtered;
    }, [mode, showNextSteps, taskData.filtered]);

    const groupedTasks = useMemo(() => {
        if (mode === 'tasks' && showNextSteps) {
            const newGrouped: Record<string, any[]> = {};
            Object.keys(taskData.grouped).forEach(k => {
                newGrouped[k] = taskData.grouped[k].filter(t => !['Done', 'Completada', 'Won', 'Lost', 'Canceled', 'Cancelada'].includes(t.status));
            });
            return newGrouped;
        }
        return taskData.grouped;
    }, [mode, showNextSteps, taskData.grouped]);

    const nextStepsData = taskData.nextSteps;

    function getWaitingOnAreas(opp: Opportunity) {
        if (opp.statusLabel === 'Won' || opp.statusLabel === 'Lost' || opp.statusLabel === 'Canceled') return null;

        const externalPending = (opp.tasks || []).filter(t => t.owner === 'External Area' && t.status !== 'Done');
        if (externalPending.length === 0) return null;

        const areas = Array.from(new Set(externalPending.flatMap(t => t.externalAreas || [])));
        return areas.join(', ');
    }

    // --- Grouping (Dynamic: Status or Stage or Detailed) ---
    const groupedOpps = useMemo(() => {
        const groups: Record<string, Opportunity[]> = {};

        if (kanbanGroupBy === 'status') {
            ['In Progress', 'On Hold', 'Submitted', 'Won', 'Lost', 'Canceled'].forEach(g => groups[g] = []);
            filteredOpps.forEach(o => {
                const key = o.statusLabel;
                if (groups[key]) groups[key].push(o);
                else if (groups['In Progress']) groups['In Progress'].push(o); // Fallback for safety
            });
            Object.keys(groups).forEach(k => groups[k].sort((a, b) => (a.priorityOrder ?? 999) - (b.priorityOrder ?? 999)));
        } else {
            // Process view — No Status migrates to Review
            processColumnOrder.forEach(g => groups[g] = []);
            filteredOpps.forEach(o => {
                let key = o.detailedStatus || 'Review'; // No Status → Review
                if (key === 'Waiting' || key === 'No Status') key = 'Review'; // Legacy migration
                if (groups[key] !== undefined) groups[key].push(o);
                else groups['Review'].push(o);
            });
            Object.keys(groups).forEach(k => groups[k].sort((a, b) => (a.priorityOrder ?? 999) - (b.priorityOrder ?? 999)));
        }
        return groups;
    }, [filteredOpps, kanbanGroupBy, processColumnOrder]);

    const visibleBoardColumns = useMemo(() => Object.entries(groupedOpps).filter(([columnKey]) => (
        kanbanGroupBy !== 'detailed' || !hiddenProposalProcessColumns.includes(columnKey)
    )), [groupedOpps, hiddenProposalProcessColumns, kanbanGroupBy]);

    const boardGridTemplateColumns = useMemo(() => visibleBoardColumns.map(([columnKey]) => (
        collapsedColumns.includes(columnKey)
            ? '4rem'
            : `minmax(${kanbanGroupBy === 'detailed' ? '15rem' : '20rem'}, 1fr)`
    )).join(' '), [visibleBoardColumns, collapsedColumns, kanbanGroupBy]);



    const handleDragStart = useCallback((e: React.DragEvent, id: string, type: 'opp' | 'task' = 'opp', extra?: string) => {
        e.dataTransfer.setData('id', id);
        e.dataTransfer.setData('type', type);
        if (extra) e.dataTransfer.setData('extra', extra);
    }, []);
    const handleDragOver = (e: React.DragEvent) => e.preventDefault();

    const handleDrop = (e: React.DragEvent, target: string, type: 'column' | 'date' | 'taskGroup') => {
        e.preventDefault();
        const id = e.dataTransfer.getData('id');
        const dragType = e.dataTransfer.getData('type');
        const extra = e.dataTransfer.getData('extra');

        if (dragType === 'opp') {
            if (type === 'column') {
                const opp = opportunities.find(o => o.id === id);
                if (opp) {
                    if (kanbanGroupBy === 'status') {
                        onOppUpdate({ ...opp, statusLabel: target as OpportunityStatus });
                    } else {
                        onOppUpdate({ ...opp, detailedStatus: target as DetailedStatus });
                    }
                }
            }
            if (type === 'date') onDateChange(id, 'expected', target);
        } else if (dragType === 'task') {
            const oppId = extra;
            if (type === 'taskGroup') {
                if (taskGroupBy === 'status') {
                    handleTaskStatusChange(oppId, id, target as TaskStatus);
                }
                if (taskGroupBy === 'priority') onTaskUpdate(oppId, id, { priority: target as TaskPriority });
            }
            if (type === 'date') {
                onTaskUpdate(oppId, id, { dueDate: target });
            }
        }
    };

    const handleCalendarDrop = (id: string, dragType: string, dateStr: string, extra?: string) => {
        if (dragType === 'opp') {
            onDateChange(id, 'expected', dateStr);
        } else if (dragType === 'task') {
            const oppId = extra;
            if (oppId) {
                onTaskUpdate(oppId, id, { dueDate: dateStr });
            }
        }
    };

    const exportTasksToCSV = () => {
        const headers = ['Opportunity ID', 'Task Title', 'Status', 'Priority', 'Due Date', 'Owner', 'Areas', 'Responsible', 'Description'];
        const rows = filteredOpps.flatMap(opp => (opp.tasks || []).map(t => [
            opp.id,
            `"${(t.title || '').replace(/"/g, '""')}"`,
            t.status,
            t.priority,
            t.dueDate,
            t.owner,
            `"${(t.externalAreas || []).join(', ')}"`,
            t.responsible || '',
            `"${t.description.replace(/"/g, '""')}"`
        ]));

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "tasks_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleInlineEdit = useCallback((opp: Opportunity, field: string, value: any) => {
        let updated = { ...opp };
        if (field.includes('dates.')) {
            const sub = field.split('.')[1];
            updated.dates = { ...updated.dates, [sub]: value };
        } else {
            // @ts-ignore
            updated[field] = value;
        }
        onOppUpdate(updated);
    }, [onOppUpdate]);

    const handleKanbanNoteChange = useCallback((val: any, oppId: string, draftOnly = false) => {
        quickNoteDraftsRef.current[oppId] = String(val ?? '');
        if (draftOnly) return;
        const opp = (opportunities || []).find(o => o.id === oppId);
        if (opp) {
            onOppUpdate({ ...opp, kanbanNote: val });
        }
    }, [onOppUpdate, opportunities]);

    const handleArchiveQuickNote = useCallback((oppId: string) => {
        const opp = (opportunities || []).find(item => item.id === oppId);
        const content = (quickNoteDraftsRef.current[oppId] ?? opp?.kanbanNote ?? '').trim();
        if (!opp || !content) return;

        onOppUpdate({
            ...opp,
            kanbanNote: '',
            history: [...(opp.history || []), {
                id: crypto.randomUUID(),
                date: new Date().toLocaleDateString('en-CA'),
                content,
            }],
            lastUpdated: new Date().toISOString(),
        });
        quickNoteDraftsRef.current[oppId] = '';
        setHistorySaveNotice('Quick note saved to history');
        if (historySaveNoticeTimeoutRef.current !== null) window.clearTimeout(historySaveNoticeTimeoutRef.current);
        historySaveNoticeTimeoutRef.current = window.setTimeout(() => setHistorySaveNotice(null), 2500);
    }, [onOppUpdate, opportunities]);

    const updateSelectedTask = (field: keyof Task, value: any) => {
        if (!selectedTask) return;

        if (field === 'status' && !validateTaskCompletion(selectedTask.oppId, selectedTask.task.id, value)) {
            return;
        }

        const opp = opportunities.find(o => o.id === selectedTask.oppId);
        if (!opp) return;

        const updatedTasks = (opp.tasks || []).map(t => t.id === selectedTask.task.id ? { ...t, [field]: value } : t);
        const updatedOpp = { ...opp, tasks: updatedTasks };
        onOppUpdate(updatedOpp);
        setSelectedTask({ ...selectedTask, task: { ...selectedTask.task, [field]: value } });
    };

    const deleteTaskInModal = () => {
        if (!selectedTask) return;
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        const opp = opportunities.find(o => o.id === selectedTask.oppId);
        if (!opp) return;
        const updatedTasks = (opp.tasks || []).filter(t => t.id !== selectedTask.task.id);
        onOppUpdate({ ...opp, tasks: updatedTasks });
        setSelectedTask(null);
    };

    const handleCreateTask = () => {
        setNewTaskData({ oppId: '', title: '' });
        setShowCreateTaskModal(true);
    };

    const handleConfirmCreateTask = () => {
        if (!newTaskData.oppId || !newTaskData.title) return;

        const opp = opportunities.find(o => o.id === newTaskData.oppId);
        if (!opp) return;

        const newTask: Task = {
            id: crypto.randomUUID(),
            title: newTaskData.title,
            description: '',
            status: 'Pending',
            priority: 'Medium',
            owner: 'Me',
            externalAreas: [],
            responsible: '',
            dueDate: new Date().toLocaleDateString('en-CA'),
            stageContext: opp.stage,
            subtasks: [],
            order: null,
            dependsOnTaskIds: [],
            blockDoneUntilDependenciesDone: false,
            linkedNoteIds: []
        };

        onOppUpdate({ ...opp, tasks: [...opp.tasks, newTask] });
        setShowCreateTaskModal(false);
        setSelectedTask({ task: newTask, oppId: opp.id });
    };

    const handleDeleteTask = useCallback((e: React.MouseEvent, oppId: string, taskId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        const opp = opportunities.find(o => o.id === oppId);
        if (opp) {
            onOppUpdate({ ...opp, tasks: (opp.tasks || []).filter(t => t.id !== taskId) });
        }
    }, [opportunities, onOppUpdate]);

    const copyTaskSummary = async () => {
        if (!selectedTask) return;
        const t = selectedTask.task;
        const opp = opportunities.find(o => o.id === selectedTask.oppId);

        // Resolve doc titles
        let docTitles: string[] = [];
        if (opp) {
            try {
                const docs = await listLinkedForTask(opp.id, t.id);
                docTitles = docs.map(d => d.fileKey ? d.fileKey.split('/').pop() || d.fileKey : '');
            } catch (e) { console.error("Failed docs", e); }
        }

        // Resolve notes
        const noteTitles = (t.linkedNoteIds || (t.linkedNoteId ? [t.linkedNoteId] : [])).map(nid => {
            return opp?.notes.find(n => n.id === nid)?.title;
        }).filter(Boolean) as string[];

        // Fix for unknown type error by casting subtasks explicitly
        const subtasksList = (t.subtasks as any as Subtask[]) || [];

        const summary = `
                    Task: ${t.title}
                    Due Date: ${t.dueDate}
                    Status: ${t.status} | Priority: ${t.priority}
                    Description:
                    ${t.description}

                    Subtasks:
                    ${subtasksList.map(s => `- [${s.completed ? 'x' : ' '}] ${s.title}`).join('\n')}

                    Linked documents:
                    ${docTitles.join('\n')}

                    Linked notes:
                    ${noteTitles.join('\n')}
                    `.trim();
        navigator.clipboard.writeText(summary);
        alert("Task summary with links copied to clipboard!");
    };

    const handleDocLink = async (keys: string[]) => {
        if (!selectedTask) return;
        for (const key of keys) {
            await saveMeta(selectedTask.oppId, key, { linkedTaskIds: [selectedTask.task.id] });
        }
        setShowDocPicker(false);
        setRefreshKey(prev => prev + 1);
    };

    const unlinkNote = (noteId: string) => {
        if (!selectedTask) return;
        const currentIds = selectedTask.task.linkedNoteIds || (selectedTask.task.linkedNoteId ? [selectedTask.task.linkedNoteId] : []) || [];
        const newIds = currentIds.filter(id => id !== noteId);
        updateSelectedTask('linkedNoteIds', newIds);
        updateSelectedTask('linkedNoteId', undefined); // Clear legacy
    };

    // Bulk Export / Import Handlers
    const handleBulkExport = async () => {
        if (selectedForExport.length === 0) {
            alert("Select opportunities to export via table view checkboxes.");
            return;
        }
        const packages = [];
        for (const id of selectedForExport) {
            const opp = opportunities.find(o => o.id === id);
            if (opp) packages.push(await exportOpportunity(opp));
        }
        downloadJSON(packages, `Bulk_Export_${packages.length}_Opps.json`);
        setSelectedForExport([]);
    };

    const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const content = JSON.parse(text);
            const items = Array.isArray(content) ? content : [content];

            let count = 0;
            for (const item of items) {
                // Pass existing opportunities to check duplicates if needed, but per requirement we create new
                const newOpp = await importOpportunity(item, opportunities);
                onOppUpdate(newOpp); // Add to DB
                count++;
            }
            alert(`Imported ${count} opportunities.`);
        } catch (err: any) {
            console.error(err);
            alert("Bulk import failed: " + err.message);
        } finally {
            if (importInputRef.current) importInputRef.current.value = '';
        }
    };

    const toggleSelectExport = (id: string) => {
        setSelectedForExport(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    };

    const visibleOrderedTableColumns = orderedTableColumns.filter(col => visibleColumns.includes(col.key));

    const getLatestHistoryEvent = (opp: Opportunity) => {
        const events = (opp.history || []).filter(event => event.content?.trim());
        if (events.length === 0) return null;
        return events.reduce((latest, event) => (event.date || '').localeCompare(latest.date || '') > 0 ? event : latest);
    };

    const renderOpportunityColumnHeader = (key: string, statusLabel = 'Process Status') => {
        switch (key) {
            case 'id':
                return <th key={key} className="px-6 py-3 w-32"><div className="flex items-center">ID<ColumnFilter options={idOptions} selected={columnFilters.id || []} onChange={v => setColumnFilters(p => ({...p, id: v}))} /></div></th>;
            case 'title':
                return <th key={key} className="px-6 py-3"><div className="flex items-center">Title<ColumnFilter options={titleOptions} selected={columnFilters.title || []} onChange={v => setColumnFilters(p => ({...p, title: v}))} /></div></th>;
            case 'customer':
                return <th key={key} className="px-6 py-3"><div className="flex items-center">Customer<ColumnFilter options={customerOptions} selected={columnFilters.customer || []} onChange={v => setColumnFilters(p => ({...p, customer: v}))} /></div></th>;
            case 'seller':
                return <th key={key} className="px-6 py-3"><div className="flex items-center">Seller<ColumnFilter options={sellerOptions} selected={columnFilters.seller || []} onChange={v => setColumnFilters(p => ({...p, seller: v}))} /></div></th>;
            case 'status':
                return <th key={key} className="px-6 py-3"><div className="flex items-center">{statusLabel}<ColumnFilter options={statusOptions} selected={columnFilters.status || []} onChange={v => setColumnFilters(p => ({...p, status: v}))} /></div></th>;
            case 'assigned':
                return <th key={key} className="px-6 py-3"><div className="flex items-center">Assigned<ColumnFilter options={assignedOptions} selected={columnFilters.assigned || []} onChange={v => setColumnFilters(p => ({...p, assigned: v}))} /></div></th>;
            case 'expected':
                return <th key={key} className="px-6 py-3"><div className="flex items-center">Expected Date<ColumnFilter options={expectedOptions} selected={columnFilters.expected || []} onChange={v => setColumnFilters(p => ({...p, expected: v}))} /></div></th>;
            case 'amount':
                return <th key={key} className="px-6 py-3 text-right"><div className="flex items-center justify-end">Amount<ColumnFilter options={[]} selected={columnFilters.amount || []} onChange={v => setColumnFilters(p => ({...p, amount: v}))} numeric /></div></th>;
            case 'nextStep':
                return <th key={key} className="px-6 py-3">Next Step</th>;
            case 'waiting':
                return <th key={key} className="px-6 py-3"><div className="flex items-center">Waiting On<ColumnFilter options={waitingOptions} selected={columnFilters.waiting || []} onChange={v => setColumnFilters(p => ({...p, waiting: v}))} /></div></th>;
            case 'lastHistoryEvent':
                return <th key={key} className="px-6 py-3 min-w-[320px]">Last History Event</th>;
            case 'notes':
                return <th key={key} className="px-6 py-3 resize-x overflow-auto min-w-[150px]">Notes</th>;
            case 'saveNote':
                return <th key={key} className="px-3 py-3 w-12"><span className="sr-only">Save quick note</span></th>;
            default:
                return null;
        }
    };

    const renderGeneralOpportunityCell = (opp: Opportunity, key: string) => {
        const amount = getSellPrice(opp);
        const nextTask = getNextTask(opp.tasks || []);
        const waitingTasks = (opp.tasks || []).filter(t => t.status === 'Missing Info' || t.status === 'Approval');

        switch (key) {
            case 'id':
                return <td key={key} className="px-6 py-3 font-mono text-xs text-gray-500 whitespace-nowrap cursor-pointer hover:text-[#3DCD58] hover:underline" onClick={() => onSelect(opp.id)}>{opp.id}</td>;
            case 'title':
                return <td key={key} className="px-6 py-3 font-medium text-gray-900"><EditableCell value={opp.title} onChange={(val) => handleInlineEdit(opp, 'title', val)} /></td>;
            case 'customer':
                return <td key={key} className="px-6 py-3 text-gray-600"><EditableCell value={opp.customer} onChange={(val) => handleInlineEdit(opp, 'customer', val)} /></td>;
            case 'seller':
                return <td key={key} className="px-6 py-3 text-gray-600"><EditableCell value={opp.seller || ''} onChange={(val) => handleInlineEdit(opp, 'seller', val)} /></td>;
            case 'status':
                return (
                    <td key={key} className="px-6 py-3">
                        <EditableCell
                            type="select"
                            value={opp.detailedStatus || 'Working on it'}
                            options={Object.keys(DETAILED_STATUS_COLORS)}
                            onChange={(val) => handleInlineEdit(opp, 'detailedStatus', val)}
                            displayValue={<span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${DETAILED_STATUS_COLORS[opp.detailedStatus || 'Working on it']}`}>{translateStatus(opp.detailedStatus || 'Working on it')}</span>}
                        />
                    </td>
                );
            case 'assigned':
                return <td key={key} className="px-6 py-3 text-xs text-gray-600">{opp.dates?.assigned || '-'}</td>;
            case 'expected':
                return <td key={key} className="px-6 py-3 text-xs text-gray-600 font-mono"><EditableCell type="date" value={opp.dates?.expected || ''} onChange={(val) => handleInlineEdit(opp, 'dates.expected', val)} /></td>;
            case 'amount':
                return <td key={key} className="px-6 py-3 text-right font-mono font-medium"><EditableCell type="number" value={amount} onChange={(val) => handleInlineEdit(opp, 'sellPrice', val)} displayValue={`$${amount.toLocaleString()}`} /></td>;
            case 'nextStep':
                return (
                    <td key={key} className="px-6 py-3 text-xs text-gray-600">
                        {nextTask ? (
                            <div className="flex flex-col gap-1">
                                <EditableCell value={nextTask.title} onChange={(val) => onTaskUpdate(opp.id, nextTask.id, { title: val })} />
                                <select value={nextTask.status} onChange={(e) => onTaskUpdate(opp.id, nextTask.id, { status: e.target.value as any })} className={`text-[9px] border-none p-0 bg-transparent font-medium cursor-pointer uppercase ${TASK_STATUS_COLORS[nextTask.status as any]}`}>
                                    {TASK_STATUS_ORDER.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                                </select>
                            </div>
                        ) : <span className="text-gray-300 italic">No tasks</span>}
                    </td>
                );
            case 'waiting':
                return (
                    <td key={key} className="px-6 py-3">
                        {waitingTasks.length > 0 ? (
                            <div className="flex flex-col gap-1">
                                {waitingTasks.map(t => (
                                    <div key={t.id} className={`text-[10px] px-1.5 py-0.5 rounded border flex flex-col ${t.status === 'Approval' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`} title={t.title}>
                                        <span className="font-bold truncate max-w-[150px]">{t.status === 'Approval' ? 'Approval: ' : ''}{t.title}</span>
                                        {!!t.responsible && (t.externalAreas || []).length > 0 && <span className="text-[9px] opacity-80">{(t.externalAreas || []).join(', ')}</span>}
                                        {t.responsible && <span className="text-[9px] opacity-80 italic">{t.status === 'Approval' ? 'Approver' : 'Owes info'}: {t.responsible}</span>}
                                    </div>
                                ))}
                            </div>
                        ) : <span className="text-xs text-gray-400">-</span>}
                    </td>
                );
            case 'lastHistoryEvent': {
                const event = getLatestHistoryEvent(opp);
                return <td key={key} className="px-6 py-3 text-xs text-gray-700 whitespace-pre-wrap break-words min-w-[320px]">
                    {event ? <div className="flex flex-col gap-1"><span className="text-[10px] font-medium text-gray-400">{event.date}</span><span>{event.content}</span></div> : <span className="text-gray-400">-</span>}
                </td>;
            }
            case 'notes':
                return <td key={key} className="px-6 py-3 text-xs text-gray-600"><OptimizedInput value={opp.kanbanNote || ''} onChange={(val) => handleKanbanNoteChange(val, opp.id)} onDraftChange={(val) => handleKanbanNoteChange(val, opp.id, true)} className="w-full bg-transparent border-none p-0 text-xs text-gray-600 focus:ring-0" placeholder="Quick note..." /></td>;
            case 'saveNote':
                return <td key={key} className="px-3 py-3 text-center"><button type="button" onClick={() => handleArchiveQuickNote(opp.id)} className="p-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors" title="Save quick note to history"><History className="w-3.5 h-3.5" /></button></td>;
            default:
                return null;
        }
    };

    // Reusable Task Card Renderer for Next Steps


    return (
        <div className="flex flex-col h-full bg-[#f1f3f4] p-6 gap-6 relative">
            {historySaveNotice && <div role="status" className="absolute right-6 top-6 z-[1000] rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 shadow-sm">{historySaveNotice}</div>}
            {/* Top Bar */}
            <div className="flex flex-wrap items-center gap-4">
                {/* ... (Existing top bar code unchanged) ... */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{mode === 'proposals' ? 'Proposals Dashboard' : mode === 'tasks' ? 'Tasks Overview' : 'General Overview'}</h1>
                    <p className="text-sm text-gray-500">{mode === 'proposals' ? 'Manage your tendering pipeline' : mode === 'tasks' ? 'Track actions across all opportunities' : 'Executive summary of all opportunities'}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {mode === 'proposals' && viewMode === 'table' && (
                        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm mr-2">
                            <button
                                onClick={handleBulkExport}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors ${selectedForExport.length > 0 ? 'text-[#3DCD58] hover:bg-[#3DCD58]/10' : 'text-gray-400 cursor-not-allowed'}`}
                                disabled={selectedForExport.length === 0}
                            >
                                <Download className="w-3.5 h-3.5" /> Export Selected ({selectedForExport.length})
                            </button>
                            <div className="w-px h-4 bg-gray-200"></div>
                            <button
                                onClick={() => importInputRef.current?.click()}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-[#3DCD58] rounded transition-colors"
                            >
                                <Upload className="w-3.5 h-3.5" /> Import
                            </button>
                            <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={handleBulkImport} />
                        </div>
                    )}

                    {((mode === 'proposals' && viewMode === 'table') || mode === 'general') && (
                        <div className="mr-2">
                            <ColumnSelector
                                columns={allColumns}
                                visibleColumns={visibleColumns}
                                onChange={setVisibleColumns}
                                columnOrder={columnOrder}
                                onOrderChange={setColumnOrder}
                            />
                        </div>
                    )}

                    <div className="flex gap-2 items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm mr-2">
                        <input type="date" value={dateFilterStart} onChange={e => setDateFilterStart(e.target.value)} className="text-xs border-none focus:ring-0 p-1" />
                        <span className="text-gray-400">-</span>
                        <input type="date" value={dateFilterEnd} onChange={e => setDateFilterEnd(e.target.value)} className="text-xs border-none focus:ring-0 p-1" />
                    </div>

                    <div className="relative z-20">
                        <OpportunitySearchInput
                            // Pass base opportunities filtered by STATUS/DATE/LABELS but NOT text, 
                            // so suggestions can work on the subset of relevant items.
                            // Actually, if we pass 'filteredOpps', it includes the text filter.
                            // If I type "Pro", filteredOpps becomes small. Suggestions are small.
                            // If I backspace, filteredOpps grows.
                            // This works fine.
                            // To fix slowness, we need useDeferredValue in the Dashboard component logic mainly.
                            // Use filteredOpps for suggestions as it is already optimized
                            opportunities={filteredOpps}
                            value={filterText}
                            onChange={setFilterText}
                            selectedIds={selectedOppChips}
                            onSelect={(id) => setSelectedOppChips(prev => [...prev, id])}
                            onRemove={(id) => setSelectedOppChips(prev => prev.filter(p => p !== id))}
                            isOpen={openDropdown === 'search'}
                            onToggle={(isOpen) => setOpenDropdown(isOpen ? 'search' : null)}
                        />
                    </div>

                    {mode === 'tasks' && (
                        <div className="relative z-20">
                            <TaskSearchInput
                                tasks={filteredTasks}
                                value={taskSearchText}
                                onChange={setTaskSearchText}
                            />
                        </div>
                    )}

                    {(mode === 'proposals' || mode === 'general') && (
                        <div className="flex gap-2">
                            <MultiSelectDropdown
                                label="Process Status"
                                options={Object.keys(DETAILED_STATUS_COLORS)}
                                selected={detailedStatusFilters}
                                onChange={setDetailedStatusFilters}
                                isOpen={openDropdown === 'detailedStatus'}
                                onToggle={() => toggleDropdown('detailedStatus')}
                            />
                            <MultiSelectDropdown
                                label="Opp Status"
                                options={Object.keys(STATUS_COLORS)}
                                selected={taskOppStatusFilters}
                                onChange={setTaskOppStatusFilters}
                                isOpen={openDropdown === 'taskOppStatus'}
                                onToggle={() => toggleDropdown('taskOppStatus')}
                            />
                        </div>
                    )}

                    <MultiSelectDropdown
                        label="Labels"
                        options={availableLabels.map(l => l.text)}
                        selected={labelFilters.map(id => availableLabels.find(l => l.id === id)?.text || id)}
                        onChange={(texts) => {
                            const ids = texts.map(t => availableLabels.find(l => l.text === t)?.id).filter(Boolean) as string[];
                            setLabelFilters(ids);
                        }}
                        isOpen={openDropdown === 'labels'}
                        onToggle={() => toggleDropdown('labels')}
                    />

                    {mode === 'tasks' && (
                        <div className="flex items-center gap-2">
                            <MultiSelectDropdown
                                label="Opportunities"
                                options={oppFilterOptions}
                                selected={taskOppFilters}
                                onChange={setTaskOppFilters}
                                isOpen={openDropdown === 'taskOpp'}
                                onToggle={() => toggleDropdown('taskOpp')}
                            />
                            <MultiSelectDropdown
                                label="Status"
                                options={TASK_STATUS_ORDER}
                                selected={taskStatusFilters}
                                onChange={setTaskStatusFilters}
                                isOpen={openDropdown === 'taskStatus'}
                                onToggle={() => toggleDropdown('taskStatus')}
                            />
                            <MultiSelectDropdown
                                label="Priority"
                                options={Object.keys(PRIORITY_COLORS)}
                                selected={taskPriorityFilters}
                                onChange={setTaskPriorityFilters}
                                isOpen={openDropdown === 'taskPriority'}
                                onToggle={() => toggleDropdown('taskPriority')}
                            />
                            <MultiSelectDropdown
                                label="Process Status"
                                options={Object.keys(DETAILED_STATUS_COLORS)}
                                selected={detailedStatusFilters}
                                onChange={setDetailedStatusFilters}
                                isOpen={openDropdown === 'detailedStatus'}
                                onToggle={() => toggleDropdown('detailedStatus')}
                            />
                            <MultiSelectDropdown
                                label="Opp Status"
                                options={Object.keys(STATUS_COLORS)}
                                selected={taskOppStatusFilters}
                                onChange={setTaskOppStatusFilters}
                                isOpen={openDropdown === 'taskOppStatus'}
                                onToggle={() => toggleDropdown('taskOppStatus')}
                            />
                            <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer select-none">Calendarized:</label>
                                <select
                                    className="text-[10px] font-bold text-gray-700 bg-transparent border-none focus:ring-0 p-0"
                                    value={taskCalendarizedFilter}
                                    onChange={(e) => setTaskCalendarizedFilter(e.target.value as any)}
                                >
                                    <option value="all">All</option>
                                    <option value="calendarized">Only Calendarized</option>
                                    <option value="not-calendarized">Not Calendarized</option>
                                </select>
                            </div>
                            <div className="h-6 w-px bg-gray-300 mx-1"></div>
                            <span className="text-xs text-gray-500 font-medium ml-2">Group by:</span>
                            <select
                                className="text-sm border-gray-200 rounded-lg p-2 bg-white shadow-sm"
                                value={taskGroupBy}
                                onChange={(e) => setTaskGroupBy(e.target.value as any)}
                            >
                                <option value="status">Status</option>
                                <option value="priority">Priority</option>
                                <option value="area">Area</option>
                                <option value="opportunity">Opportunity</option>
                            </select>
                        </div>
                    )}

                    {viewMode === 'board' && mode !== 'tasks' && (mode === 'proposals' || (mode === 'tasks' && taskGroupBy === 'status')) && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium whitespace-nowrap translate-y-[-1px]">Kanban View:</span>
                            <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                <button
                                    onClick={() => setKanbanGroupBy('status')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${kanbanGroupBy === 'status' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Standard
                                </button>
                                <button
                                    onClick={() => setKanbanGroupBy('detailed')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${kanbanGroupBy === 'detailed' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Process
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {mode !== 'general' && (
                            <>
                                <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                    <button onClick={() => setViewMode('board')} className={`p-1.5 rounded ${viewMode === 'board' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Board View"><LayoutGrid className="w-4 h-4" /></button>
                                    <button onClick={() => setViewMode('calendar')} className={`p-1.5 rounded ${viewMode === 'calendar' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Calendar View"><CalendarIcon className="w-4 h-4" /></button>
                                    {mode === 'tasks' && (
                                        <button onClick={() => setViewMode('schedule')} className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-bold ${viewMode === 'schedule' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`} title="Agenda de tareas"><CalendarDays className="w-4 h-4" /><span>Agenda</span></button>
                                    )}
                                </div>

                            </>
                        )}

                        <button
                            onClick={handleResetFilters}
                            className="bg-white hover:bg-orange-50 text-gray-400 hover:text-orange-500 p-2 rounded-lg border border-gray-200 transition-colors shadow-sm"
                            title="Reset All Filters"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>

                    {mode === 'tracking' && (
                        <div className="flex bg-gray-100/50 p-1 rounded-2xl items-center">
                            <div className="px-4 py-2 text-xs font-black text-[#3DCD58] uppercase flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Activity Tracking
                            </div>
                        </div>
                    )}

                    {mode === 'tasks' && (
                        <>
                            <button
                                onClick={() => setShowTracking(!showTracking)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors ${showTracking ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                                <Activity className="w-4 h-4" /> Tracker
                            </button>
                            <button
                                onClick={() => setShowWorkloadChart(!showWorkloadChart)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors ${showWorkloadChart ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                                📊 Workload
                            </button>

                            <button
                                onClick={() => setShowNextSteps(!showNextSteps)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors ${showNextSteps ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                                <ListChecks className="w-4 h-4" /> Next steps
                            </button>

                            <button onClick={handleCreateTask} className="flex items-center gap-2 bg-[#3DCD58] hover:bg-[#2db64a] text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors">
                                <Plus className="w-4 h-4" /> Add Task
                            </button>
                            <button onClick={exportTasksToCSV} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                                <Download className="w-4 h-4" /> CSV
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm("Copy tasks summary?\nOK = Pending Only (Pending, In Progress, On Hold)\nCancel = All Tasks")) {
                                        // Pending Only
                                        const pendingTasks = filteredTasks.filter(t => ['Pending', 'In Progress', 'On Hold', 'Approval', 'Missing Info'].includes(t.status));
                                        const text = pendingTasks.map(t => `[${t.status}] ${t.title} - ${t.opp.customer}`).join('\n');
                                        copyToClipboard(text);
                                        // alert(`Copied ${pendingTasks.length} pending tasks to clipboard.`);
                                    } else {
                                        // All Tasks
                                        const text = filteredTasks.map(t => `[${t.status}] ${t.title} - ${t.opp.customer}`).join('\n');
                                        copyToClipboard(text);
                                        // alert(`Copied ${filteredTasks.length} tasks to clipboard.`);
                                    }
                                }}
                                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
                                title="Copy Status"
                            >
                                <Copy className="w-4 h-4" /> Copy Status
                            </button>
                            {selectedTaskIds.length > 0 && (
                                <div className="ml-4 flex items-center gap-2 animate-in slide-in-from-left fade-in">
                                    <span className="text-xs font-bold text-gray-500">{selectedTaskIds.length} Selected</span>
                                    <button
                                        onClick={() => setShowCopyToOppModal(true)}
                                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors shadow-sm"
                                    >
                                        <Copy className="w-4 h-4" /> Copy to Opp
                                    </button>
                                    <button
                                        onClick={() => setSelectedTaskIds([])}
                                        className="px-2 py-2 text-gray-400 hover:text-gray-600 rounded-lg text-xs font-medium"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                            {selectedTaskIds.length > 0 && (
                                <button
                                    onClick={() => setShowBulkEditModal(true)}
                                    className="ml-1 flex items-center gap-2 px-3 py-2 bg-purple-500 text-white hover:bg-purple-600 rounded-lg text-sm font-medium transition-colors shadow-sm"
                                >
                                    ✏️ Bulk Edit ({selectedTaskIds.length})
                                </button>
                            )}
                        </>
                    )}

                    {mode === 'proposals' && (
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowProposalCardFieldsMenu(prev => !prev);
                                    }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border ${showProposalCardFieldsMenu ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                    title="Configure proposal card fields"
                                >
                                    <Edit2 className="w-4 h-4" />
                                    Edit Cards
                                </button>
                                {showProposalCardFieldsMenu && (
                                    <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute left-0 mt-2 w-80 bg-white rounded-lg border border-gray-200 shadow-xl z-[9999] overflow-hidden origin-top-left"
                                    >
                                        <div className="px-3 py-2 border-b border-gray-100">
                                            <div className="text-xs font-black uppercase tracking-wide text-gray-600">Card Fields</div>
                                            <div className="grid grid-cols-[1fr_56px] gap-2 mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                                <span>Field</span>
                                                <span className="text-center">Card</span>
                                            </div>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto">
                                            {PROPOSAL_CARD_FIELD_OPTIONS.map(option => {
                                                const required = REQUIRED_PROPOSAL_CARD_FIELDS.has(option.key);
                                                const visible = required || proposalCardVisibleFields.includes(option.key);
                                                return (
                                                    <div key={option.key} className="grid grid-cols-[1fr_56px] gap-2 items-center px-3 py-2 text-xs hover:bg-gray-50">
                                                        <div className="min-w-0">
                                                            <span className="font-medium text-gray-700 truncate block">{option.label}</span>
                                                            {required && <span className="text-[10px] text-gray-400">Required</span>}
                                                        </div>
                                                        <label className="flex justify-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={visible}
                                                                disabled={required}
                                                                onChange={() => toggleProposalCardField(option.key)}
                                                                className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58] accent-[#3DCD58]"
                                                            />
                                                        </label>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => onCreate()}
                                className="flex items-center gap-2 bg-[#3DCD58] hover:bg-[#2db64a] text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                            >
                                <Plus className="w-4 h-4" /> New
                            </button>
                        </div>
                    )}

                    {mode === 'general' && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onCreate()}
                                className="flex items-center gap-2 bg-[#3DCD58] hover:bg-[#2db64a] text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                            >
                                <Plus className="w-4 h-4" /> New
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">

                {/* ... General View and Tasks View unchanged ... */}
                {mode === 'general' && (
                    /* ... existing General View ... */
                    <div className="flex flex-col gap-6 h-full overflow-y-auto pr-2 pb-4">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 gap-2 shrink-0 w-full">
                            <div className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide leading-none">Total OPs</p>
                                    <p className="text-base font-bold text-gray-900 mt-0.5 leading-none">{filteredOpps.length}</p>
                                </div>
                                <div className="p-1 bg-[#3DCD58]/10 text-[#3DCD58] rounded"><Briefcase className="w-3.5 h-3.5" /></div>
                            </div>
                            <div className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide leading-none">Active</p>
                                    <p className="text-base font-bold text-gray-900 mt-0.5 leading-none">{filteredOpps.filter(o => o.statusLabel === 'In Progress').length}</p>
                                </div>
                                <div className="p-1 bg-purple-50 text-purple-600 rounded"><Briefcase className="w-3.5 h-3.5" /></div>
                            </div>
                        </div>



                        {/* List */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
                            <div className="overflow-auto flex-1">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
                                        <tr>
                                            {visibleOrderedTableColumns.map(col => renderOpportunityColumnHeader(col.key, 'Process Status'))}
                                            {visibleColumns.length < allColumns.length && <th className="px-6 py-3 text-gray-400 italic">Ocultas ({allColumns.length - visibleColumns.length})</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredOpps.map(opp => {
                                            const waitingOn = getWaitingOnAreas(opp);
                                            const amount = getSellPrice(opp);
                                            const nextTask = getNextTask(opp.tasks || []);
                                            const waitingTasks = (opp.tasks || []).filter(t => t.status === 'Missing Info' || t.status === 'Approval' || t.status === 'Waiting');
                                            return (
                                                <tr key={opp.id} className="hover:bg-gray-50 transition-colors">
                                                    {visibleOrderedTableColumns.map(col => renderGeneralOpportunityCell(opp, col.key))}
                                                    {false && <>
                                                    {visibleColumns.includes('id') && <td className="px-6 py-3 font-mono text-xs text-gray-500 whitespace-nowrap cursor-pointer hover:text-[#3DCD58] hover:underline" onClick={() => onSelect(opp.id)}>{opp.id}</td>}
                                                    {visibleColumns.includes('title') && <td className="px-6 py-3 font-medium text-gray-900"><EditableCell value={opp.title} onChange={(val) => handleInlineEdit(opp, 'title', val)} /></td>}
                                                    {visibleColumns.includes('customer') && <td className="px-6 py-3 text-gray-600"><EditableCell value={opp.customer} onChange={(val) => handleInlineEdit(opp, 'customer', val)} /></td>}
                                                    {visibleColumns.includes('seller') && <td className="px-6 py-3 text-gray-600"><EditableCell value={opp.seller || ''} onChange={(val) => handleInlineEdit(opp, 'seller', val)} /></td>}
                                                    {visibleColumns.includes('status') && <td className="px-6 py-3">
                                                        <EditableCell
                                                            type="select"
                                                            value={opp.detailedStatus || 'Working on it'}
                                                            options={Object.keys(DETAILED_STATUS_COLORS)}
                                                            onChange={(val) => handleInlineEdit(opp, 'detailedStatus', val)}
                                                            displayValue={<span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${DETAILED_STATUS_COLORS[opp.detailedStatus || 'Working on it']}`}>{translateStatus(opp.detailedStatus || 'Working on it')}</span>}
                                                        />
                                                    </td>}
                                                    {visibleColumns.includes('expected') && <td className="px-6 py-3 text-xs text-gray-600 font-mono">
                                                        <EditableCell
                                                            type="date"
                                                            value={opp.dates?.expected || ''}
                                                            onChange={(val) => handleInlineEdit(opp, 'dates.expected', val)}
                                                        />
                                                    </td>}
                                                    {visibleColumns.includes('amount') && <td className="px-6 py-3 text-right font-mono font-medium"><EditableCell type="number" value={amount} onChange={(val) => handleInlineEdit(opp, 'sellPrice', val)} displayValue={`$${amount.toLocaleString()}`} /></td>}
                                                    {visibleColumns.includes('nextStep') && <td className="px-6 py-3 text-xs text-gray-600">
                                                        {nextTask ? (
                                                            <div className="flex flex-col gap-1">
                                                                <EditableCell value={nextTask.title} onChange={(val) => onTaskUpdate(opp.id, nextTask.id, { title: val })} />
                                                                <select value={nextTask.status} onChange={(e) => onTaskUpdate(opp.id, nextTask.id, { status: e.target.value as any })} className={`text-[9px] border-none p-0 bg-transparent font-medium cursor-pointer uppercase ${TASK_STATUS_COLORS[nextTask.status as any]}`}>
                                                                    {TASK_STATUS_ORDER.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                                                                </select>
                                                            </div>
                                                        ) : <span className="text-gray-300 italic">No tasks</span>}
                                                    </td>}
                                                    {visibleColumns.includes('waiting') && <td className="px-6 py-3">
                                                        {waitingTasks.length > 0 ? (
                                                            <div className="flex flex-col gap-1">
                                                                {waitingTasks.map(t => (
                                                                    <div key={t.id} className={`text-[10px] px-1.5 py-0.5 rounded border flex flex-col ${t.status === 'Approval' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`} title={t.title}>
                                                                        <span className="font-bold truncate max-w-[150px]">{t.status === 'Approval' ? '⚠ Approval: ' : ''}{t.title}</span>
                                                                        {!!t.responsible && (t.externalAreas || []).length > 0 && <span className="text-[9px] opacity-80">{(t.externalAreas || []).join(', ')}</span>}
                                                                        {t.responsible && <span className="text-[9px] opacity-80 italic">{t.status === 'Approval' ? 'Approver' : 'Owes info'}: {t.responsible}</span>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : <span className="text-xs text-gray-400">-</span>}
                                                    </td>}
                                                    {visibleColumns.includes('notes') && <td className="px-6 py-3 text-xs text-gray-600"><EditableCell value={opp.kanbanNote || ''} onChange={(val) => handleInlineEdit(opp, 'kanbanNote', val)} /></td>}
                                                    </>}
                                                    {visibleColumns.length < allColumns.length && <td className="px-6 py-3"></td>}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* === PROPOSALS MODE === */}
                {mode === 'proposals' && (
                    <>
                        {viewMode === 'board' && (
                            <div
                                className="grid h-full min-h-0 min-w-full items-stretch gap-6 overflow-x-auto overflow-y-hidden pb-4 px-2"
                                style={{ gridTemplateColumns: boardGridTemplateColumns || 'minmax(0, 1fr)' }}
                            >
                                {visibleBoardColumns.map(([columnKey, opps]: [string, Opportunity[]]) => (
                                    <div
                                        key={columnKey}
                                        className={`${collapsedColumns.includes(columnKey) ? 'w-16 min-w-[4rem]' : 'min-w-0'} flex flex-col h-full min-h-0 relative group select-none transition-all duration-300`}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, columnKey, 'column')}
                                    >
                                        {kanbanGroupBy === 'status' ? (
                                            (() => {
                                                const topBorderColor: Record<string, string> = {
                                                    'In Progress': 'border-blue-400',
                                                    'On Hold': 'border-yellow-400',
                                                    'Submitted': 'border-purple-400',
                                                    'Won': 'border-emerald-400',
                                                    'Lost': 'border-red-400',
                                                    'Canceled': 'border-gray-400',
                                                };
                                                const isCollapsed = collapsedColumns.includes(columnKey);
                                                return (
                                                    <div className={`flex items-center justify-between mb-4 p-3 rounded-lg border-t-4 shadow-sm ${STATUS_COLORS[columnKey as OpportunityStatus]} ${topBorderColor[columnKey] ?? ''} ${isCollapsed ? 'flex-col gap-3 py-4' : ''}`}>
                                                        <div className="flex flex-col items-center">
                                                            {!isCollapsed && <h3 className="text-sm font-bold uppercase tracking-wider">{translateStatus(columnKey)}</h3>}
                                                            {isCollapsed && <span className="text-[10px] font-black uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 opacity-70">{translateStatus(columnKey)}</span>}
                                                        </div>
                                                        <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'gap-2'}`}>
                                                            <span className="bg-white/50 px-2 py-0.5 rounded-full text-xs font-bold shrink-0">{opps.length}</span>
                                                            <button onClick={() => setCollapsedColumns(prev => prev.includes(columnKey) ? prev.filter(k => k !== columnKey) : [...prev, columnKey])} className="p-1 hover:bg-black/10 rounded transition-colors opacity-0 group-hover:opacity-100" title={isCollapsed ? "Expand column" : "Collapse column"}>
                                                                {isCollapsed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            (() => {
                                                const isCollapsed = collapsedColumns.includes(columnKey);
                                                const customColor = processBoardColors[columnKey];
                                                return (
                                            <div
                                                className={`kanban-cursor-grab flex items-center justify-between mb-4 p-2 rounded-lg border-t-4 shadow-sm cursor-grab active:cursor-grabbing select-none ${!customColor ? (DETAILED_STATUS_COLORS[columnKey] || 'bg-gray-100 text-gray-600 border-gray-200') : ''} ${draggingCol === columnKey ? 'opacity-40 scale-95' : ''} transition-all ${isCollapsed ? 'flex-col gap-3 py-4' : ''}`}
                                                style={customColor ? { backgroundColor: customColor, borderColor: customColor, color: '#fff' } : undefined}
                                                draggable
                                                onDragStart={(e) => { e.stopPropagation(); setDraggingCol(columnKey); e.dataTransfer.setData('colKey', columnKey); }}
                                                onDragEnd={() => setDraggingCol(null)}
                                                onDragOver={(e) => { e.preventDefault(); }}
                                                onDrop={(e) => {
                                                    const from = e.dataTransfer.getData('colKey');
                                                    if (from) {
                                                        e.stopPropagation();
                                                        if (from !== columnKey) moveProcessColumn(from, columnKey);
                                                        setDraggingCol(null);
                                                    }
                                                }}
                                                title="Drag to reorder column"
                                            >
                                                <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'gap-1'}`}>
                                                    <span className={`text-white/60 text-[8px] ${isCollapsed ? '' : 'mr-0.5'}`}>⠿</span>
                                                    {!isCollapsed && <h3 className="text-[10px] font-black uppercase tracking-tighter leading-none">{translateStatus(columnKey)}</h3>}
                                                    {isCollapsed && <span className="text-[10px] font-black uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 opacity-70">{translateStatus(columnKey)}</span>}
                                                </div>
                                                <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'gap-1'}`}>
                                                    <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0">{opps.length}</span>
                                                    <button onClick={() => setCollapsedColumns(prev => prev.includes(columnKey) ? prev.filter(k => k !== columnKey) : [...prev, columnKey])} className="p-1 hover:bg-black/10 rounded transition-colors opacity-0 group-hover:opacity-100" title={isCollapsed ? "Expand column" : "Collapse column"}>
                                                        {isCollapsed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </div>
                                                );
                                            })()
                                        )}

                                        {collapsedColumns.includes(columnKey) && (
                                            <div 
                                                className="flex-1 border-2 border-dashed border-gray-200/50 rounded-lg mx-2 mb-4 opacity-30 transition-all group-hover:opacity-100 group-hover:border-gray-300"
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleDrop(e, columnKey, 'column')}
                                            ></div>
                                        )}

                                        {!collapsedColumns.includes(columnKey) && (
                                            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2 pb-10 cursor-default custom-scrollbar">
                                                {opps.slice(0, 30).map(opp => (
                                                <OpportunityCard
                                                    key={opp.id}
                                                    opp={opp}
                                                    onSelect={onSelect}
                                                    handleDragStart={handleDragStart}
                                                    handleInlineEdit={handleInlineEdit}
                                                    kanbanMiniNote={opp.kanbanNote || ''}
                                                    onNoteChange={handleKanbanNoteChange}
                                                    onArchiveQuickNote={handleArchiveQuickNote}
                                                    cardFieldVisibility={proposalCardFieldVisibility}
                                                    cardFieldVisibilityKey={proposalCardFieldVisibilityKey}
                                                    translateStatus={translateStatus}
                                                    alarms={alarms}
                                                />
                                            ))}

                                            {opps.length > 30 && (
                                                <div className="py-6 px-4 text-center border-t border-dashed border-gray-100 bg-gray-50/30 rounded-xl mt-4">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                                        Showing 30 of {opps.length}
                                                    </p>
                                                    <p className="text-[9px] text-gray-400 italic mt-1.5 leading-relaxed">
                                                        Limit reached for board performance. <br /> Use search or filters to locate specific projects.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Table View and Calendar View can remain unchanged */}
                        {viewMode === 'table' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                                <div className="overflow-auto flex-1">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
                                            <tr>
                                                <th className="px-4 py-3 w-10">
                                                    <input type="checkbox" onChange={(e) => e.target.checked ? setSelectedForExport(filteredOpps.map(o => o.id)) : setSelectedForExport([])} checked={filteredOpps.length > 0 && selectedForExport.length === filteredOpps.length} className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-300" />
                                                </th>
                                                {visibleColumns.includes('id') && <th className="px-6 py-3 w-32"><div className="flex items-center">ID<ColumnFilter options={idOptions} selected={columnFilters.id || []} onChange={v => setColumnFilters(p => ({...p, id: v}))} /></div></th>}
                                                {visibleColumns.includes('title') && <th className="px-6 py-3"><div className="flex items-center">Title<ColumnFilter options={titleOptions} selected={columnFilters.title || []} onChange={v => setColumnFilters(p => ({...p, title: v}))} /></div></th>}
                                                {visibleColumns.includes('customer') && <th className="px-6 py-3"><div className="flex items-center">Customer<ColumnFilter options={customerOptions} selected={columnFilters.customer || []} onChange={v => setColumnFilters(p => ({...p, customer: v}))} /></div></th>}
                                                {visibleColumns.includes('seller') && <th className="px-6 py-3"><div className="flex items-center">Seller<ColumnFilter options={sellerOptions} selected={columnFilters.seller || []} onChange={v => setColumnFilters(p => ({...p, seller: v}))} /></div></th>}
                                                {visibleColumns.includes('status') && <th className="px-6 py-3"><div className="flex items-center">Status<ColumnFilter options={mainStatusOptions} selected={columnFilters.status || []} onChange={v => setColumnFilters(p => ({...p, status: v}))} /></div></th>}
                                                {visibleColumns.includes('assigned') && <th className="px-6 py-3"><div className="flex items-center">Assigned<ColumnFilter options={assignedOptions} selected={columnFilters.assigned || []} onChange={v => setColumnFilters(p => ({...p, assigned: v}))} /></div></th>}
                                                {visibleColumns.includes('expected') && <th className="px-6 py-3"><div className="flex items-center">Expected Date<ColumnFilter options={expectedOptions} selected={columnFilters.expected || []} onChange={v => setColumnFilters(p => ({...p, expected: v}))} /></div></th>}
                                                {visibleColumns.includes('amount') && <th className="px-6 py-3 text-right"><div className="flex items-center justify-end">Amount<ColumnFilter options={[]} selected={columnFilters.amount || []} onChange={v => setColumnFilters(p => ({...p, amount: v}))} numeric /></div></th>}
                                                {visibleColumns.includes('waiting') && <th className="px-6 py-3"><div className="flex items-center">Waiting On<ColumnFilter options={waitingOptions} selected={columnFilters.waiting || []} onChange={v => setColumnFilters(p => ({...p, waiting: v}))} /></div></th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredOpps.slice(0, 100).map(opp => {
                                                const waitingOn = getWaitingOnAreas(opp);
                                                const amount = getSellPrice(opp);
                                                return (
                                                    <tr key={opp.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <input type="checkbox" checked={selectedForExport.includes(opp.id)} onChange={() => toggleSelectExport(opp.id)} className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-300" />
                                                        </td>
                                                        {visibleColumns.includes('id') && (
                                                            <td className="px-6 py-3 font-mono text-xs text-gray-500 whitespace-nowrap cursor-pointer hover:text-[#3DCD58] hover:underline" onClick={() => onSelect(opp.id)}>{opp.id}</td>
                                                        )}
                                                        {visibleColumns.includes('title') && (
                                                            <td className="px-6 py-3">
                                                                <EditableCell value={opp.title} onChange={(val) => handleInlineEdit(opp, 'title', val)} className="font-medium text-gray-900" />
                                                            </td>
                                                        )}
                                                        {visibleColumns.includes('customer') && (
                                                            <td className="px-6 py-3">
                                                                <EditableCell value={opp.customer} onChange={(val) => handleInlineEdit(opp, 'customer', val)} className="text-gray-600" />
                                                            </td>
                                                        )}
                                                        {visibleColumns.includes('seller') && (
                                                            <td className="px-6 py-3">
                                                                <EditableCell value={opp.seller || ''} onChange={(val) => handleInlineEdit(opp, 'seller', val)} className="text-gray-600" />
                                                            </td>
                                                        )}
                                                        {visibleColumns.includes('status') && (
                                                            <td className="px-6 py-3">
                                                                <EditableCell
                                                                    value={opp.statusLabel}
                                                                    onChange={(val) => handleInlineEdit(opp, 'statusLabel', val)}
                                                                    type="select"
                                                                    options={Object.keys(STATUS_COLORS)}
                                                                    displayValue={<span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${STATUS_COLORS[opp.statusLabel]}`}>{opp.statusLabel}</span>}
                                                                />
                                                            </td>
                                                        )}
                                                        {visibleColumns.includes('assigned') && (
                                                            <td className="px-6 py-3 text-xs text-gray-600">{opp.dates.assigned}</td>
                                                        )}
                                                        {visibleColumns.includes('expected') && (
                                                            <td className="px-6 py-3">
                                                                <EditableCell type="date" value={opp.dates?.expected} onChange={(val) => handleInlineEdit(opp, 'dates.expected', val)} className="text-xs text-gray-600 font-mono" />
                                                            </td>
                                                        )}
                                                        {visibleColumns.includes('amount') && (
                                                            <td className="px-6 py-3 text-right font-mono font-medium">${amount.toLocaleString()}</td>
                                                        )}
                                                        {visibleColumns.includes('nextStep') && (
                                                            <td className="px-6 py-3">
                                                                {(() => {
                                                                    const nextTask = getNextTask(opp.tasks || []);
                                                                    return nextTask ? <span className="text-xs font-bold text-blue-600 line-clamp-1" title={nextTask.title}>{nextTask.title}</span> : <span className="text-xs text-gray-400 italic">None</span>;
                                                                })()}
                                                            </td>
                                                        )}
                                                        {visibleColumns.includes('waiting') && (
                                                            <td className="px-6 py-3">
                                                                {waitingOn ? <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100">{waitingOn}</span> : <span className="text-xs text-gray-400">-</span>}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredOpps.length > 100 && (
                                        <div className="bg-amber-50 p-4 text-center border-t border-amber-100">
                                            <p className="text-xs font-bold text-amber-700">Displaying first 100 projects for performance stability.</p>
                                            <p className="text-[10px] text-amber-600">Showing 100 of {filteredOpps.length} results. Please use filters to narrow down your search.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                {viewMode === 'calendar' && (
                    <div className={isCalendarMaximized ? "fixed inset-0 z-[60] bg-[#f1f3f4] p-6 flex flex-col animate-in fade-in duration-300" : "flex h-full gap-4 overflow-hidden relative"}>

                        <div className="flex-1 min-w-0 h-full">
                            <CalendarView<Opportunity>
                                items={filteredOpps}
                                getDate={(o) => o.dates.expected}
                                onDateDrop={handleCalendarDrop}
                                isMaximized={isCalendarMaximized}
                                onMaximize={() => setIsCalendarMaximized(!isCalendarMaximized)}
                                renderItem={(o) => (
                                    <div
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, o.id, 'opp')}
                                        onClick={() => onSelect(o.id)}
                                        className={`text-[10px] p-1.5 rounded-lg border truncate cursor-pointer shadow-sm active:scale-95 transition-all mb-0.5 group ${getCalendarItemStyles(o, 'opp')}`}
                                        title={o.title}
                                    >
                                        <div className="flex items-center gap-2">
                                            {o.alias && (() => {
                                                const imp = getImportanceColor(o.priorityOrder, o.dates.expected, o.statusLabel === 'Won' || o.statusLabel === 'Lost' || o.statusLabel === 'Canceled' || o.detailedStatus === 'Completed' || o.detailedStatus === 'Canceled', alarms);
                                                return (
                                                    <span className={`${imp.className} px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tight shrink-0 shadow-sm`} style={imp.style}>
                                                        {o.alias}
                                                    </span>
                                                );
                                            })()}
                                            <span className="truncate">{o.id}</span>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                )}
                    </>
                )}

                {/* === TASKS MODE === */}
                {mode === 'tasks' && (
                showTracking ? (
                    <div className="h-full">
                        <TrackingView
                            opportunities={filteredOpps}
                            onClose={() => setShowTracking(false)}
                            onUpdateOpportunity={onOppUpdate}
                            onSelectOpp={onSelect}
                        />
                    </div>
                ) : (
                    <>
                        {viewMode === 'board' && (
                            <div className="flex gap-4 h-full pb-2 min-w-max">
                                {Object.entries(groupedTasks).map(([group, tasks]: [string, any]) => (
                                    <div key={group} className="w-72 flex flex-col h-full" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, group, 'taskGroup')}>
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <h3 className={`text-xs font-semibold uppercase tracking-wider text-gray-600`}>{translateStatus(group)}</h3>
                                            <span className="text-gray-400 text-xs">{tasks.length}</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 bg-gray-100/50 p-2 rounded-xl">
                                            {tasks.slice(0, 50).map((item: any) => (
                                                <TaskCard
                                                    key={`${item.opp.id}-${item.id}`}
                                                    item={item}
                                                    onSelect={setSelectedTask}
                                                    onDelete={handleDeleteTask}
                                                    onUpdate={onTaskUpdate}
                                                    onStatusChange={handleTaskStatusChange}
                                                    onDragStart={handleDragStart}
                                                />
                                            ))}
                                            {tasks.length > 50 && (
                                                <div className="text-center py-2 text-xs text-gray-400 font-bold uppercase tracking-wider">
                                                    Showing 50 of {tasks.length} tasks
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {viewMode === 'table' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                                <div className="overflow-auto flex-1 p-4">
                                    <div className="space-y-0 divide-y divide-gray-100">
                                        {(taskGroupBy === 'none' ? [['All Tasks', filteredTasks]] : Object.entries(groupedTasks)).map(([group, tasks]) => (
                                            <div key={group}>
                                                {taskGroupBy !== 'none' && (
                                                    <div className="bg-gray-50/80 backdrop-blur px-4 py-2 font-bold text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-200 sticky top-0 z-10">
                                                        {group} <span className="opacity-50 ml-1">({tasks.length})</span>
                                                    </div>
                                                )}

                                                {tasks.slice(0, 50).map((item: any) => (
                                                    <TaskRow
                                                        key={item.id}
                                                        item={item}
                                                        isSelected={selectedTaskIds.includes(item.id)}
                                                        onSelect={setSelectedTask}
                                                        onSelectionToggle={(id, checked) => {
                                                            if (checked) setSelectedTaskIds([...selectedTaskIds, id]);
                                                            else setSelectedTaskIds(selectedTaskIds.filter(prevId => prevId !== id));
                                                        }}
                                                        onUpdate={onTaskUpdate}
                                                        onStatusChange={handleTaskStatusChange}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {viewMode === 'calendar' && (
                            <div className={isCalendarMaximized ? "fixed inset-0 z-[60] bg-[#f1f3f4] p-6 flex flex-col animate-in fade-in duration-300" : "flex h-full gap-4 overflow-hidden relative"}>


                                <div className="flex-1 min-w-0 h-full flex gap-4 overflow-hidden relative">
                                    <div className="flex-1 min-w-0 h-full">
                                        <CalendarView<any>
                                            items={filteredTasks}
                                            getDate={(t) => t.dueDate}
                                            onDateDrop={handleCalendarDrop}
                                            onDateClick={setSelectedCalendarDate}
                                            selectedDate={selectedCalendarDate}
                                            isMaximized={isCalendarMaximized}
                                            onMaximize={() => setIsCalendarMaximized(!isCalendarMaximized)}
                                            renderItem={(t) => (
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        handleDragStart(e, t.id, 'task', t.opp.id);
                                                        // Also add JSON for Tracker-style dragging compatibility
                                                        e.dataTransfer.setData('application/json', JSON.stringify({ id: t.id, type: 'task', date: t.dueDate, opportunityId: t.opp.id }));
                                                    }}
                                                    onClick={(e) => { e.stopPropagation(); setSelectedTask({ task: t, oppId: t.opp.id }); }}
                                                    className={`text-[10px] p-1.5 rounded-lg border flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all mb-0.5 group ${getCalendarItemStyles(t, 'task')}`}
                                                    title={`${t.opp.id}: ${t.title}`}
                                                >
                                                    <div className="flex items-center gap-1 min-w-0 mt-0.5">
                                                        {t.opp.alias && (() => {
                                                            const imp = getImportanceColor(t.opp.priorityOrder, t.dueDate, t.status === 'Done' || t.status === 'Canceled', alarms);
                                                            return (
                                                                <span className={`${imp.className} px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shrink-0`} style={imp.style}>
                                                                    {t.opp.alias}
                                                                </span>
                                                            );
                                                        })()}
                                                        <span className="truncate flex-1">{t.title}</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            startTimer(t.id, t.opp.id, t.title);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[#3DCD58] transition-all ml-auto shrink-0"
                                                        title="Start Timer"
                                                    >
                                                        <Play className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        />
                                    </div>

                                    {showCalendarSidebar && (() => {
                                        const unscheduledSidebarTasks = filteredTasks.filter(t => !t.dueDate && t.status !== 'Done' && t.status !== 'Canceled');
                                        return (
                                        <div className="w-80 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
                                            <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between shrink-0">
                                                <div className="flex flex-col">
                                                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest leading-none">Schedule</h3>
                                                    {calendarSidebarTab === 'date' && selectedCalendarDate && <span className="text-[10px] font-bold text-gray-400 mt-1">{new Date(selectedCalendarDate + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>}
                                                    {calendarSidebarTab === 'unscheduled' && <span className="text-[10px] font-bold text-gray-400 mt-1">Tasks without a due date</span>}
                                                </div>
                                                <button onClick={() => setShowCalendarSidebar(false)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 transition-colors">
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="flex border-b border-gray-100 shrink-0">
                                                <button
                                                    onClick={() => setCalendarSidebarTab('date')}
                                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${calendarSidebarTab === 'date' ? 'text-gray-900 border-[#3DCD58]' : 'text-gray-400 border-transparent hover:text-gray-700'}`}
                                                >
                                                    Date
                                                </button>
                                                <button
                                                    onClick={() => setCalendarSidebarTab('unscheduled')}
                                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${calendarSidebarTab === 'unscheduled' ? 'text-gray-900 border-[#3DCD58]' : 'text-gray-400 border-transparent hover:text-gray-700'}`}
                                                >
                                                    Unscheduled{unscheduledSidebarTasks.length > 0 && ` (${unscheduledSidebarTasks.length})`}
                                                </button>
                                            </div>
                                            {calendarSidebarTab === 'unscheduled' ? (
                                                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/20">
                                                    {unscheduledSidebarTasks.length === 0 ? (
                                                        <div className="flex flex-col items-center justify-center h-40 text-gray-300 opacity-60">
                                                            <Info className="w-8 h-8 mb-2" />
                                                            <p className="text-[10px] font-black uppercase">All Scheduled</p>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <p className="text-[10px] text-gray-400 italic">Drag onto a day to set a due date.</p>
                                                            {unscheduledSidebarTasks.map(t => (
                                                                <div
                                                                    key={`u-${t.id}`}
                                                                    draggable
                                                                    onDragStart={(e) => {
                                                                        handleDragStart(e, t.id, 'task', t.opp.id);
                                                                        e.dataTransfer.setData('application/json', JSON.stringify({ id: t.id, type: 'task', date: t.dueDate, opportunityId: t.opp.id }));
                                                                    }}
                                                                    onClick={() => setSelectedTask({ task: t, oppId: t.opp.id })}
                                                                    className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing"
                                                                >
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[t.priority as TaskPriority] || 'bg-gray-300'}`}></div>
                                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t.opp.id}</span>
                                                                        {t.opp.alias && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">{t.opp.alias}</span>}
                                                                    </div>
                                                                    <p className="text-xs font-bold text-gray-800 leading-snug">{t.title}</p>
                                                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                                                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[t.status as TaskStatus] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); startTimer(t.id, t.opp.id, t.title); }}
                                                                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-[#3DCD58] transition-colors"
                                                                            title="Start Timer"
                                                                        >
                                                                            <Play className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/20">
                                                {filteredTasks.filter(t => t.dueDate === selectedCalendarDate).length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center h-40 text-gray-300 opacity-60">
                                                        <Info className="w-8 h-8 mb-2" />
                                                        <p className="text-[10px] font-black uppercase">No Tasks</p>
                                                    </div>
                                                ) : (
                                                    filteredTasks
                                                        .filter(t => t.dueDate === selectedCalendarDate)
                                                        .sort((a, b) => (a.opp.priorityOrder ?? 999) - (b.opp.priorityOrder ?? 999))
                                                        .map(t => (
                                                            <div
                                                                key={t.id}
                                                                draggable
                                                                onDragStart={(e) => {
                                                                    handleDragStart(e, t.id, 'task', t.opp.id);
                                                                    e.dataTransfer.setData('application/json', JSON.stringify({ id: t.id, type: 'task', date: t.dueDate, opportunityId: t.opp.id }));
                                                                }}
                                                                className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group"
                                                                onClick={() => setSelectedTask({ task: t, oppId: t.opp.id })}
                                                            >
                                                                <div className="flex flex-col gap-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[t.priority as TaskPriority] || 'bg-gray-300'}`}></div>
                                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t.opp.id}</span>
                                                                        {t.order && <span className="bg-gray-100 px-1.5 py-0.5 rounded font-black text-gray-500 text-[9px] border border-gray-200">#{t.order}</span>}
                                                                        {t.opp.alias && (() => {
                                                                            const imp = getImportanceColor(t.opp.priorityOrder, t.dueDate, t.status === 'Done' || t.status === 'Canceled', alarms);
                                                                            return <span className={`${imp.className} px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`} style={imp.style}>{t.opp.alias}</span>;
                                                                        })()}
                                                                        <span className="text-gray-900 font-medium truncate">{t.title}</span>
                                                                    </div>
                                                                    <p className="text-xs font-bold text-gray-800 leading-snug">{t.title}</p>
                                                                    <div className="flex items-center justify-between mt-1 pt-2 border-t border-gray-50">
                                                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[t.status as TaskStatus] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                                                                        <div className="flex items-center gap-1">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    startTimer(t.id, t.opp.id, t.title);
                                                                                }}
                                                                                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-[#3DCD58] transition-colors"
                                                                                title="Start Timer"
                                                                            >
                                                                                <Play className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            {t.responsible && <span className="text-[8px] font-bold text-gray-400 flex items-center gap-1"><User className="w-2.5 h-2.5" /> {t.responsible}</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                )}
                                            </div>
                                            )}
                                        </div>
                                        );
                                    })()}

                                    {!showCalendarSidebar && (
                                        <button
                                            onClick={() => setShowCalendarSidebar(true)}
                                            className="absolute right-0 top-1/2 -translate-y-1/2 bg-white p-1.5 rounded-l-xl border-l border-y border-gray-200 shadow-xl text-gray-400 hover:text-[#3DCD58] transition-all z-20 group"
                                            title="Show Schedule"
                                        >
                                            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {viewMode === 'schedule' && mode === 'tasks' && (
                            <div className="h-full w-full min-w-0 overflow-hidden">
                                <ScheduleView
                                    opportunities={opportunities}
                                    onSelectTask={(oppId, taskId) => onSelect(oppId, { tab: 'tasks', taskId })}
                                    onOpenTaskSubView={onOpenTaskSubView}
                                    onOppUpdate={onOppUpdate}
                                    onStartTimer={startTimer}
                                />
                            </div>
                        )}
                    </>
                )
            )}
        </div>

            {
        selectedTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !splitViewNoteId && setSelectedTask(null)}>
                <div
                    className={`bg-white shadow-2xl rounded-2xl flex flex-col animate-slide-in-right relative transition-all duration-300 ${splitViewNoteId ? 'w-[95vw] h-[90vh] grid grid-cols-2 gap-8 overflow-hidden' : 'w-[90%] max-w-3xl h-[85vh] overflow-hidden'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Left Column (Task Details) */}
                    <div className="flex flex-col h-full overflow-y-auto">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
                            <button onClick={deleteTaskInModal} className="p-2 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"><Trash2 className="w-5 h-5" /></button>
                            <div className="text-center">
                                <h2 className="text-lg font-bold text-gray-900">Task Details</h2>
                                <div className="text-[10px] text-gray-500 font-medium flex items-center justify-center gap-2">
                                    <span>{selectedTask.oppId}</span>
                                    {(() => {
                                        const opp = opportunities.find(o => o.id === selectedTask.oppId);
                                        return opp?.alias ? <span className="bg-[#3DCD58]/10 text-[#3DCD58] px-2 py-0.5 rounded font-black uppercase tracking-tight">{opp.alias}</span> : null;
                                    })()}
                                    <button onClick={() => onSelect(selectedTask.oppId, { tab: 'tasks', taskId: selectedTask.task.id })} className="text-[#3DCD58] hover:underline ml-2 uppercase font-bold">Open task in expediente</button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={copyTaskSummary} className="flex items-center gap-1 text-xs font-medium bg-[#3DCD58]/10 text-[#3DCD58] px-3 py-1.5 rounded-lg hover:bg-[#3DCD58]/20 transition-colors">
                                    <Copy className="w-3 h-3" /> Summary
                                </button>
                                {remindersEnabled && (
                                    <div className="relative">
                                        <button
                                            onClick={() => { setRemindTaskWhen(''); setRemindTaskPopoverOpen(o => !o); setRemindTaskPicking(false); }}
                                            title="Schedule a reminder for this task"
                                            className="flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                                        >
                                            <Bell className="w-3 h-3" /> Remind me
                                        </button>
                                        {remindTaskPopoverOpen && (
                                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-50 p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                                                {!remindTaskPicking ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setRemindTaskPicking(true)}
                                                        className="w-full text-left border border-gray-200 rounded-lg text-sm p-2 bg-white hover:bg-gray-50"
                                                    >
                                                        {remindTaskWhen ? new Date(remindTaskWhen).toLocaleString() : <span className="text-gray-400">Pick date &amp; time…</span>}
                                                    </button>
                                                ) : (
                                                    <DateTimePicker
                                                        value={remindTaskWhen}
                                                        onConfirm={(isoLocal) => { setRemindTaskWhen(isoLocal); setRemindTaskPicking(false); }}
                                                        onCancel={() => setRemindTaskPicking(false)}
                                                    />
                                                )}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (!remindTaskWhen) return;
                                                            onAddReminder?.({
                                                                title: selectedTask.task.title,
                                                                dueAt: new Date(remindTaskWhen).toISOString(),
                                                                opportunityId: selectedTask.oppId,
                                                                taskId: selectedTask.task.id,
                                                            });
                                                            setRemindTaskPopoverOpen(false);
                                                        }}
                                                        disabled={!remindTaskWhen}
                                                        className="flex-1 py-1.5 text-sm font-medium bg-[#3DCD58] text-white rounded-lg hover:bg-[#34b34c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => setRemindTaskPopoverOpen(false)}
                                                        className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        onMinimize?.({
                                            id: selectedTask.task.id,
                                            type: 'task',
                                            title: `TSK: ${selectedTask.task.title.slice(0, 10)}`,
                                            color: '#3B82F6',
                                            data: { oppId: selectedTask.oppId, isSubView: true, deepLink: { tab: 'tasks', taskId: selectedTask.task.id } }
                                        });
                                        setSelectedTask(null);
                                    }}
                                    className="p-2 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                                    title="Minimizar Tarea"
                                >
                                    <Minus className="w-5 h-5 text-gray-400" />
                                </button>
                                {!splitViewNoteId && <button onClick={() => setSelectedTask(null)} className="p-2 text-gray-500 hover:bg-gray-200 rounded transition-colors"><X className="w-6 h-6" /></button>}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                            {/* ... Task details form ... */}
                            <div className="flex items-start gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Title</label>
                                    <OptimizedInput className="w-full text-2xl font-bold text-gray-900 border-b border-gray-200 focus:border-[#3DCD58] focus:ring-0 px-0 py-2 placeholder-gray-300" value={selectedTask.task.title} onChange={(val: string) => updateSelectedTask('title', val)} />
                                </div>
                                {selectedTask.task.order && (
                                    <div className="w-20">
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Order</label>
                                        <div className="text-xl font-bold text-gray-500 py-2 border-b border-gray-200 text-center">#{selectedTask.task.order}</div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Status</label>
                                    <select className="w-full border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.status} onChange={(e) => updateSelectedTask('status', e.target.value)}>
                                        {TASK_STATUS_ORDER.map(s => <option key={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Priority</label>
                                    <select className="w-full border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.priority || 'Medium'} onChange={(e) => updateSelectedTask('priority', e.target.value)}>
                                        <option>High</option><option>Medium</option><option>Low</option>
                                    </select>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Due Date</label>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="checkbox"
                                                id="modalCalendarized"
                                                checked={selectedTask.task.calendarized || false}
                                                onChange={(e) => updateSelectedTask('calendarized', e.target.checked)}
                                                className="rounded text-[#3DCD58] focus:ring-[#3DCD58] w-3 h-3"
                                            />
                                            <label htmlFor="modalCalendarized" className="text-[9px] font-bold text-gray-500 uppercase cursor-pointer">Calendarized</label>
                                        </div>
                                    </div>
                                    <input type="date" className="w-full border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.dueDate} onChange={(e) => updateSelectedTask('dueDate', e.target.value)} />
                                </div>
                            </div>

                            <div className="p-4 border border-gray-100 rounded-xl bg-gray-50/50">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Assignment</label>
                                <div className="flex gap-4 items-center">
                                    <select
                                        className="border-gray-200 rounded-lg text-sm bg-white"
                                        value={selectedTask.task.owner}
                                        onChange={(e) => updateSelectedTask('owner', e.target.value)}
                                    >
                                        <option>Me</option>
                                        <option>External Area</option>
                                    </select>

                                    {selectedTask.task.owner === 'External Area' && (
                                        <div className="flex gap-2 flex-1 relative flex-col">
                                            <MultiSelectDropdown
                                                label="Select Areas"
                                                options={['Internal', 'Delivery', 'SCM', 'Sales', 'Legal', 'Finance', 'TSC', 'Other']}
                                                selected={selectedTask.task.externalAreas || []}
                                                onChange={(vals) => updateSelectedTask('externalAreas', vals)}
                                                isOpen={openDropdown === 'taskExternalAreas'}
                                                onToggle={() => toggleDropdown('taskExternalAreas')}
                                            />
                                            <input list="dashboard-stakeholders-datalist" placeholder="Person Name" className="border-gray-200 rounded-lg text-sm flex-1 bg-white mt-2" value={selectedTask.task.responsible || ''} onChange={(e) => updateSelectedTask('responsible', e.target.value)} />
                                            <datalist id="dashboard-stakeholders-datalist">
                                                {(opportunities.find(o => o.id === selectedTask.oppId)?.stakeholders || []).map(p => <option key={p.id} value={p.name} />)}
                                            </datalist>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Dependency Status Preview */}
                            {(selectedTask.task.dependsOnTaskIds || []).length > 0 && (
                                <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Lock className="w-4 h-4 text-orange-500" />
                                        <label className="text-xs font-bold text-orange-700 uppercase tracking-wider">
                                            Dependencies {selectedTask.task.blockDoneUntilDependenciesDone && "(Blocking)"}
                                        </label>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {(selectedTask.task.dependsOnTaskIds || []).map((depId: string) => {
                                            const depTask = opportunities.find(o => o.id === selectedTask.oppId)?.tasks.find(t => t.id === depId);
                                            return depTask ? (
                                                <div key={depId} className="flex items-center gap-2 text-xs">
                                                    <div className={`w-2 h-2 rounded-full ${depTask.status === 'Done' ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                    <span className={depTask.status === 'Done' ? 'text-gray-500 line-through' : 'text-gray-800'}>{depTask.title}</span>
                                                </div>
                                            ) : null;
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Linked Documents</label>
                                    <button className="text-[10px] font-bold text-[#3DCD58] uppercase hover:underline" onClick={() => setShowDocPicker(true)}>+ Link Doc</button>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl">
                                    <LinkedDocsList key={refreshKey} opportunityId={selectedTask.oppId} revision={opportunities.find(o => o.id === selectedTask.oppId)?.revision} taskId={selectedTask.task.id} />
                                </div>
                            </div>

                            {/* NOTE LINKS - Added for General Dashboard */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Linked Notes</label>
                                </div>
                                <div className="space-y-2">
                                    {(selectedTask.task.linkedNoteIds || [selectedTask.task.linkedNoteId]).filter(Boolean).map((nid) => {
                                        const opp = opportunities.find(o => o.id === selectedTask.oppId);
                                        const note = opp?.notes.find(n => n.id === nid);
                                        if (!note) return null;
                                        return (
                                            <div key={nid} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-[#3DCD58] transition-all bg-white group">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="w-4 h-4 text-gray-400 group-hover:text-[#3DCD58]" />
                                                    <span className="text-sm font-medium">{note.title}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => onSelect(selectedTask.oppId)}
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
                                                        onClick={() => unlinkNote(note.id)}
                                                        className="text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase px-2 py-1 bg-gray-50 rounded"
                                                        title="Unlink"
                                                    >
                                                        <Unlink className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {!selectedTask.task.linkedNoteIds?.length && !selectedTask.task.linkedNoteId && (
                                        <div className="text-center py-4 text-gray-300 text-xs italic">No notes linked</div>
                                    )}
                                </div>
                            </div>

                            {/* TIME TRACKING HISTORY */}
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Time Tracking History</label>
                                <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                                    <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-100/50">
                                        <span className="text-xs font-bold text-gray-500">Total Time</span>
                                        <span className="text-sm font-mono font-black text-gray-700">
                                            {(() => {
                                                const total = (selectedTask.task.timeLogs || []).reduce((acc: any, log: any) => acc + (log.durationSeconds || 0), 0);
                                                const h = Math.floor(total / 3600);
                                                const m = Math.floor((total % 3600) / 60);
                                                return `${h}h ${m}m`;
                                            })()}
                                        </span>
                                    </div>
                                    {(selectedTask.task.timeLogs || []).length > 0 ? (
                                        <div className="max-h-32 overflow-y-auto">
                                            <table className="w-full text-[10px] text-left">
                                                <tbody className="divide-y divide-gray-100">
                                                    {[...selectedTask.task.timeLogs].reverse().map((log: any) => (
                                                        <tr key={log.id} className="hover:bg-white transition-colors">
                                                            <td className="p-2 text-gray-500">{new Date(log.startTime).toLocaleDateString()}</td>
                                                            <td className="p-2 text-gray-400 font-mono">{new Date(log.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(log.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                            <td className="p-2 text-right font-bold text-gray-700">
                                                                {Math.floor(log.durationSeconds / 3600)}h {Math.floor((log.durationSeconds % 3600) / 60)}m
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="p-4 text-center text-xs text-gray-400 italic">No time recorded yet.</div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</label>
                                <OptimizedTextArea className="w-full border-gray-200 rounded-lg text-sm h-32 resize-none bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.description} onChange={(val: string) => updateSelectedTask('description', val)} />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Subtasks</label>
                                <div className="space-y-2">
                                    {/* Simplified rendering of subtasks to avoid typing issues */}
                                    {(selectedTask.task.subtasks || []).map((sub: Subtask) => (
                                        <div key={sub.id} className="flex items-center gap-2 group">
                                            <input
                                                type="checkbox"
                                                className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-300"
                                                checked={sub.completed}
                                                onChange={() => {
                                                    if (!selectedTask) return;
                                                    const currentSubs = selectedTask.task.subtasks || [];
                                                    const updatedSubs = currentSubs.map(s => s.id === sub.id ? { ...s, completed: !s.completed } : s);
                                                    updateSelectedTask('subtasks', updatedSubs);
                                                }}
                                            />
                                            <OptimizedInput
                                                className={`flex-1 w-full outline-none border-none py-1 text-sm ${sub.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                                                value={sub.title}
                                                onChange={(val: string) => {
                                                    if (!selectedTask) return;
                                                    const currentSubs = selectedTask.task.subtasks || [];
                                                    const updatedSubs = currentSubs.map(s => s.id === sub.id ? { ...s, title: val } : s);
                                                    updateSelectedTask('subtasks', updatedSubs);
                                                }}
                                            />
                                        </div>
                                    ))}
                                    <button
                                        className="text-xs text-[#3DCD58] font-medium mt-2 flex items-center gap-1 hover:underline"
                                        onClick={() => {
                                            if (!selectedTask) return;
                                            const newSub: Subtask = { id: crypto.randomUUID(), title: 'New Subtask', completed: false };
                                            const currentSubs = selectedTask.task.subtasks || [];
                                            updateSelectedTask('subtasks', [...currentSubs, newSub]);
                                        }}
                                    >
                                        <Plus className="w-3 h-3" /> Add Subtask
                                    </button>
                                </div>
                            </div>

                            <ExecutionScheduleSection
                                task={selectedTask.task}
                                onChange={(updated) => updateSelectedTask('executionBlocks', updated.executionBlocks || [])}
                            />
                        </div>
                    </div>

                    {/* Right Column (Split View Note Editor) */}
                    {splitViewNoteId && (
                        <div className="flex flex-col h-full border-l border-gray-100 pl-8 overflow-hidden">
                            <div className="flex justify-between items-center mb-4 shrink-0 pt-4 pr-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-[#3DCD58]" />
                                    {opportunities.find(o => o.id === selectedTask.oppId)?.notes.find(n => n.id === splitViewNoteId)?.title}
                                </h3>
                                <button
                                    onClick={() => setSplitViewNoteId(null)}
                                    className="text-xs font-bold uppercase bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    Close Split View
                                </button>
                            </div>
                            <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col mb-4 mr-4">
                                <RichTextEditor
                                    key={splitViewNoteId}
                                    content={opportunities.find(o => o.id === selectedTask.oppId)?.notes.find(n => n.id === splitViewNoteId)?.content || ''}
                                    onChange={(val) => {
                                        const opp = opportunities.find(o => o.id === selectedTask.oppId);
                                        if (opp) {
                                            const updatedNotes = opp.notes.map(n => n.id === splitViewNoteId ? { ...n, content: val } : n);
                                            onOppUpdate({ ...opp, notes: updatedNotes });
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    {
        showDocPicker && selectedTask && (
            <DocumentPickerModal
                opportunityId={selectedTask.oppId}
                revision={opportunities.find(o => o.id === selectedTask.oppId)?.revision}
                multi={true}
                onSelect={handleDocLink}
                onClose={() => setShowDocPicker(false)}
                title="Link documents to task"
            />
        )
    }
    {/* Add Task Modal */ }
    {
        showCreateTaskModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                    <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                        <h3 className="font-black text-gray-800 flex items-center gap-2"><Plus className="w-5 h-5 text-[#3DCD58]" /> New Task</h3>
                        <button onClick={() => setShowCreateTaskModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-1">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Opportunity</label>
                            <OpportunitySearchInput
                                opportunities={opportunities}
                                selectedIds={newTaskData.oppId ? [newTaskData.oppId] : []}
                                onSelect={(id) => {
                                    setNewTaskData({ ...newTaskData, oppId: id });
                                    setNewTaskSearch('');
                                }}
                                onRemove={() => setNewTaskData({ ...newTaskData, oppId: '' })}
                                value={newTaskSearch}
                                onChange={setNewTaskSearch}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Task Title</label>
                            <OptimizedInput
                                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent text-sm font-bold"
                                placeholder="Enter task title..."
                                value={newTaskData.title}
                                onChange={(val: string) => setNewTaskData({ ...newTaskData, title: val })}
                            />
                        </div>
                    </div>
                    <div className="p-4 bg-gray-50 border-t flex gap-3">
                        <button onClick={() => setShowCreateTaskModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-100 transition-all">Cancel</button>
                        <button onClick={handleConfirmCreateTask} className="flex-1 py-2.5 rounded-xl bg-[#3DCD58] text-white font-bold hover:bg-[#2db64a] shadow-lg transition-all">Create Task</button>
                    </div>
                </div>
            </div>
        )
    }
    {/* Start Timer Modal */ }
    {
        showStartTimerModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200">
                    <div className="p-4 border-b bg-gray-50 flex justify-between items-center rounded-t-2xl">
                        <h3 className="font-black text-gray-800 flex items-center gap-2"><Play className="w-5 h-5 text-[#3DCD58]" /> Start New Timer</h3>
                        <button onClick={() => setShowStartTimerModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-1">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Opportunity</label>
                            <OpportunitySearchInput
                                opportunities={(opportunities || []).filter(o => o.statusLabel === 'In Progress' || o.statusLabel === 'On Hold' || !o.statusLabel)}
                                selectedIds={startTimerData.oppId ? [startTimerData.oppId] : []}
                                onSelect={(id) => {
                                    setStartTimerData({ ...startTimerData, oppId: id, taskId: '' });
                                    setTimerSearch('');
                                }}
                                onRemove={() => setStartTimerData({ ...startTimerData, oppId: '', taskId: '' })}
                                value={timerSearch}
                                onChange={setTimerSearch}
                            />
                        </div>
                        {startTimerData.oppId && (
                            <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Task</label>
                                <select
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent text-sm font-bold bg-gray-50 hover:bg-white transition-colors"
                                    value={startTimerData.taskId}
                                    onChange={(e) => setStartTimerData({ ...startTimerData, taskId: e.target.value })}
                                    size={5}
                                >
                                    <option value="" disabled className="text-gray-400 italic">Select a task...</option>
                                    {opportunities.find(o => o.id === startTimerData.oppId)?.tasks.map(t => (
                                        <option key={t.id} value={t.id} className="py-1">{t.title}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-gray-50 border-t flex gap-3 rounded-b-2xl">
                        <button onClick={() => setShowStartTimerModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-100 transition-all">Cancel</button>
                        <button
                            onClick={() => {
                                if (startTimerData.oppId && startTimerData.taskId) {
                                    const opp = opportunities.find(o => o.id === startTimerData.oppId);
                                    const task = opp?.tasks.find(t => t.id === startTimerData.taskId);
                                    if (opp && task) {
                                        startTimer(task.id, opp.id, task.title);
                                        setShowStartTimerModal(false);
                                    }
                                }
                            }}
                            disabled={!startTimerData.oppId || !startTimerData.taskId}
                            className="flex-1 py-2.5 rounded-xl bg-[#3DCD58] text-white font-bold hover:bg-[#2db64a] shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Start Timer
                        </button>
                    </div>
                </div>
            </div>
        )
    }
    {/* Close Task Modal with Time Logs */ }
    {
        closeTaskData && (
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <CheckSquare className="w-5 h-5 text-green-500" /> Complete Task
                        </h3>
                        <button onClick={() => setCloseTaskData(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Task</label>
                            <div className="text-gray-900 font-medium">{closeTaskData.task.title}</div>
                        </div>

                        {(() => {
                            const currentTimerState = getTimerState();
                            return (
                                <>
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">

                                        <span className="text-sm font-bold text-blue-800">Total Time Spent</span>
                                        <span className="text-2xl font-mono font-black text-blue-600">
                                            {(() => {
                                                const logged = (closeTaskData.task.timeLogs || []).reduce((acc: any, log: any) => acc + (log.durationSeconds || 0), 0);
                                                const current = (currentTimerState.taskId === closeTaskData.task.id) ? currentTimerState.elapsedSeconds : 0;
                                                const total = logged + current;

                                                const h = Math.floor(total / 3600);
                                                const m = Math.floor((total % 3600) / 60);
                                                return `${h}h ${m}m`;
                                            })()}
                                        </span>
                                    </div>

                                    {currentTimerState.taskId === closeTaskData.task.id && currentTimerState.isRunning && (
                                        <div className="p-3 bg-green-50 rounded-xl border border-green-100 flex items-center gap-3 animate-pulse">

                                            <Clock className="w-5 h-5 text-green-600" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase text-green-600 tracking-wider leading-tight">Active Timer Logged Automatically</span>
                                                <span className="text-xs font-bold text-green-800">Confirming will stop the timer and include the active session.</span>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Session History</label>
                                        <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto bg-gray-50/50">
                                            <table className="w-full text-xs text-left">
                                                <thead className="bg-gray-100 text-gray-500 font-bold sticky top-0">
                                                    <tr>
                                                        <th className="p-2">Date</th>
                                                        <th className="p-2">Start</th>
                                                        <th className="p-2">End</th>
                                                        <th className="p-2 text-right">Duration</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 bg-white">
                                                    {(closeTaskData.task.timeLogs || []).map((log: any) => (
                                                        <tr key={log.id}>
                                                            <td className="p-2 text-gray-600">{new Date(log.startTime).toLocaleDateString()}</td>
                                                            <td className="p-2 text-gray-500 font-mono">{new Date(log.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                            <td className="p-2 text-gray-500 font-mono">{new Date(log.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                            <td className="p-2 text-gray-900 font-mono font-bold text-right">
                                                                {Math.floor(log.durationSeconds / 3600)}h {Math.floor((log.durationSeconds % 3600) / 60)}m
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {currentTimerState.taskId === closeTaskData.task.id && currentTimerState.isRunning && (
                                                        <tr className="bg-green-50/30">
                                                            <td className="p-2 text-green-700 font-bold">Current</td>
                                                            <td className="p-2 text-green-600 font-mono">{new Date(currentTimerState.startTime || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                            <td className="p-2 text-green-600 font-mono italic">Now</td>
                                                            <td className="p-2 text-green-700 font-mono font-black text-right">
                                                                {Math.floor(currentTimerState.elapsedSeconds / 3600)}h {Math.floor((currentTimerState.elapsedSeconds % 3600) / 60)}m
                                                            </td>
                                                        </tr>
                                                    )}

                                                    {(!closeTaskData.task.timeLogs || closeTaskData.task.timeLogs.length === 0) && !(currentTimerState.taskId === closeTaskData.task.id && currentTimerState.isRunning) && (
                                                        <tr>

                                                            <td colSpan={4} className="p-4 text-center text-gray-400 italic">No time logs recorded.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 justify-end pt-4 border-t">
                                        <button onClick={() => setCloseTaskData(null)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                                        <button
                                            onClick={() => {
                                                if (currentTimerState.taskId === closeTaskData.task.id && currentTimerState.isRunning) {
                                                    confirmStop('Done');
                                                } else {
                                                    onTaskUpdate(closeTaskData.oppId, closeTaskData.task.id, { status: 'Done' });
                                                }

                                                setCloseTaskData(null);
                                            }}
                                            className="px-6 py-2 text-sm font-bold text-white bg-[#3DCD58] hover:bg-[#2db64a] rounded-lg shadow-md flex items-center gap-2"
                                        >
                                            <CheckSquare className="w-4 h-4" /> Confirm &amp; Close
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                </div>
            </div>
        )
    }


    {/* ===== WORKLOAD CHART ===== */ }
    {
        showWorkloadChart && mode === 'tasks' && (() => {
            const today = new Date();
            const days: { label: string; date: string; count: number }[] = [];
            for (let i = -3; i <= 10; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() + i);
                const dateStr = d.toLocaleDateString('en-CA');
                const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const count = filteredTasks.filter((t: any) => t.dueDate === dateStr).length;
                days.push({ label, date: dateStr, count });
            }
            const maxCount = Math.max(...days.map(d => d.count), 1);
            return (
                <div className="fixed bottom-6 left-6 z-50 bg-white rounded-2xl shadow-2xl border border-indigo-200 overflow-hidden" style={{ width: '480px' }}>
                    <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-200">
                        <span className="font-black text-indigo-800 text-sm">📊 Daily Workload (next 10 days)</span>
                        <button onClick={() => setShowWorkloadChart(false)} className="text-indigo-600 hover:text-indigo-900 font-bold text-lg leading-none">×</button>
                    </div>
                    <div className="p-4 overflow-x-auto">
                        <div className="flex items-end gap-1 h-32" style={{ minWidth: `${days.length * 32}px` }}>
                            {days.map(d => (
                                <div key={d.date} className="flex flex-col items-center gap-1 flex-1">
                                    <span className="text-[9px] font-bold text-gray-600">{d.count > 0 ? d.count : ''}</span>
                                    <div
                                        className={`rounded-t w-full transition-all ${d.date === new Date().toLocaleDateString('en-CA') ? 'bg-indigo-500' : d.count >= 5 ? 'bg-red-400' : d.count >= 3 ? 'bg-orange-400' : 'bg-indigo-200'}`}
                                        style={{ height: `${Math.max(4, (d.count / maxCount) * 96)}px` }}
                                        title={`${d.count} tasks on ${d.label}`}
                                    />
                                    <span className="text-[8px] text-gray-400 truncate w-full text-center" title={d.label}>{d.label ? d.label.split(',')[0] : ''}</span>
                                </div>
                            ))}
                        </div>

                    </div>
                </div>
            );
        })()
    }

    {/* ===== BULK EDIT MODAL ===== */ }
    {
        showBulkEditModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBulkEditModal(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                    <div className="p-5 border-b bg-purple-50 flex justify-between items-center rounded-t-2xl">
                        <h3 className="font-black text-purple-800 text-lg">✏️ Bulk Edit — {selectedTaskIds.length} tasks</h3>
                        <button onClick={() => setShowBulkEditModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Set Status (optional)</label>
                            <select
                                value={bulkEditStatus}
                                onChange={e => setBulkEditStatus(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-300 outline-none"
                            >
                                <option value="">— No change —</option>
                                {TASK_STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Set Due Date (optional)</label>
                            <input
                                type="date"
                                value={bulkEditDate}
                                onChange={e => setBulkEditDate(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-300 outline-none"
                            />
                        </div>
                    </div>
                    <div className="p-5 border-t flex gap-3">
                        <button onClick={() => { setShowBulkEditModal(false); setBulkEditStatus(''); setBulkEditDate(''); }} className="flex-1 px-4 py-2 text-sm font-bold text-gray-500 border rounded-xl hover:bg-gray-100">Cancel</button>
                        <button
                            onClick={() => {
                                if (!bulkEditStatus && !bulkEditDate) { setShowBulkEditModal(false); return; }
                                const updates: any = {};
                                if (bulkEditStatus) updates.status = bulkEditStatus;
                                if (bulkEditDate) updates.dueDate = bulkEditDate;
                                selectedTaskIds.forEach(taskId => {
                                    const opp = opportunities.find(o => o.tasks.some(t => t.id === taskId));
                                    if (opp) onTaskUpdate(opp.id, taskId, updates);
                                });
                                setSelectedTaskIds([]);
                                setShowBulkEditModal(false);
                                setBulkEditStatus('');
                                setBulkEditDate('');
                            }}
                            className="flex-[2] px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-black hover:bg-purple-600 shadow transition-all"
                        >
                            Apply to {selectedTaskIds.length} tasks
                        </button>
                    </div>
                </div>
            </div>
        )
    }
        </div >
    );
});

export default Dashboard;
