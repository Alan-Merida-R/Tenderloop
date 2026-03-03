import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
/* Added Subtask to imports */
import { Opportunity, ProcessStage, STAGE_COLORS, TaskStatus, TASK_STATUS_COLORS, Task, Subtask, TaskPriority, PRIORITY_COLORS, STATUS_COLORS, OpportunityStatus, TaskOwner, KPIs, DeepLink, OpportunityLabel, FloatingTab, DetailedStatus, DETAILED_STATUS_COLORS } from '../types';
import { LayoutGrid, Table as TableIcon, Search, Calendar as CalendarIcon, Filter, Plus, CheckSquare, List, ChevronDown, ChevronRight, ChevronLeft, User, Download, Clock, X, Grid, Briefcase, ArrowRight, DollarSign, Trophy, Trash2, Edit2, MoreHorizontal, Layers, Copy, Link as LinkIcon, Upload, FileText, Columns, Unlink, Lock, ListChecks, Target, TrendingUp, BarChart3, Minus, Info, Maximize2, Minimize2, RefreshCw, Zap, Activity } from 'lucide-react';
import { LinkedDocsList } from '../features/doc-links/LinkedDocsList';
import { DocumentPickerModal } from '../features/doc-links/DocumentPickerModal';
import { saveMeta, listLinkedForTask } from '../services/opportunityDocMetaStore';
import { CalendarView } from './CalendarView';
import { exportOpportunity, importOpportunity, downloadJSON } from '../services/opportunityExportImport';
import { RichTextEditor } from './OpportunityDetail';
import { countBusinessDays, countCalendarDays } from '../services/dateUtils';
import { TrackingView } from '../features/tracking/TrackingView';
import { CalendarDays, Play, Pause } from 'lucide-react';
import { OpportunitySearchInput, parseBooleanQuery } from './OpportunitySearchInput';
import { TaskSearchInput } from './TaskSearchInput';
import { useTimer } from '../contexts/TimerContext';
import { EditableCell, ColumnSelector } from './TableComponents';


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
    onMinimize?: (tab: FloatingTab) => void;
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

const translateProcessStage = (stage: string) => {
    const parts = stage.split('. ');
    if (parts.length < 2) return stage;
    const name = parts[1];
    const mapping: Record<string, string> = {
        'Recepción': 'Reception',
        'Análisis Técnico': 'Technical Analysis',
        'Arquitectura': 'Architecture',
        'Basket/BOM': 'Basket / BOM',
        'Costeo': 'Costing',
        'Propuesta': 'Proposal',
        'Validación': 'Review',
        'Entrega/Soporte': 'Delivery',
        'Won/Lost': 'Won / Lost'
    };
    return `${parts[0]}. ${mapping[name] || name}`;
};

const translateStatus = (status: string) => {
    const mapping: Record<string, string> = {
        'No Status': 'No Status',
        'Waiting': 'Waiting',
        'Info Needed': 'Info Needed',
        'Paused': 'Paused',
        'Approval': 'In Approval',
        'Meeting': 'Meeting',
        'Completed': 'Completed',
        'Canceled': 'Canceled'
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
            <div className="font-medium text-gray-800 mb-1 pr-12">{item.title}</div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                    <div className="flex items-center gap-1">
                        {item.order && <span className="bg-gray-100 px-1.5 py-0.5 rounded font-black text-gray-500 text-[9px] border border-gray-200" title="Execution Order">#{item.order}</span>}
                        {item.opp.alias && <span className="bg-[#3DCD58] text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tight shadow-sm border border-[#2db64a]" title={item.opp.title}>{item.opp.alias}</span>}
                    </div>
                    {(item.opp.labels || []).map((l: OpportunityLabel) => (
                        <div key={l.id} className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} title={l.text}></div>
                    ))}
                    {isTimerActive && (
                        <div className="flex items-center gap-1 text-[#3DCD58] animate-pulse ml-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span className="text-[9px] font-black uppercase">Active</span>
                        </div>
                    )}
                </div>
                <div className="flex gap-1 items-center">
                    {item.blockDoneUntilDependenciesDone && <Lock className="w-2.5 h-2.5 text-gray-400" />}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const order: TaskPriority[] = ['Low', 'Medium', 'High'];
                            const next = order[(order.indexOf(item.priority as TaskPriority) + 1) % 3];
                            onUpdate(item.opp.id, item.id, { priority: next });
                        }}
                        className={`w-2 h-2 rounded-full hover:scale-150 transition-transform cursor-pointer ${PRIORITY_COLORS[item.priority as TaskPriority]?.split(' ')[1]}`}
                        title={`Priority: ${item.priority} (Click to cycle)`}
                    ></button>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2">
                <select
                    value={item.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onStatusChange(item.opp.id, item.id, e.target.value as TaskStatus)}
                    className={`text-[10px] border-none p-0 bg-transparent font-medium cursor-pointer ${TASK_STATUS_COLORS[item.status as TaskStatus].split(' ')[1]}`}
                >
                    {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                </select>
            </div>

            <div className="flex justify-between mt-2 pt-2 border-t border-gray-50">
                {(item.externalAreas || []).length > 0 && <span className="text-[10px] text-[#3DCD58] bg-[#3DCD58]/10 px-1 rounded truncate max-w-[100px]">{(item.externalAreas || []).join(', ')}</span>}
                <input
                    type="date"
                    value={item.dueDate}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdate(item.opp.id, item.id, { dueDate: e.target.value })}
                    className="text-[10px] text-gray-400 ml-auto border-none p-0 bg-transparent text-right w-16 focus:ring-0"
                />
            </div>

            <TaskTimerControls item={item} />
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
                <div className={`w-1 h-10 rounded-full shrink-0 ${STAGE_COLORS[item.stageContext] || 'bg-gray-300'}`} title={`Stage: ${item.stageContext}`}></div>
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
                        {(item.externalAreas || []).length > 0 && <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 rounded flex items-center gap-1 shrink-0"><User className="w-3 h-3" /> {(item.externalAreas || []).join(', ')}</span>}
                        {item.blockDoneUntilDependenciesDone && <Lock className="w-3 h-3 text-gray-400 shrink-0" />}
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
                    {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
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

const Dashboard: React.FC<Props> = ({ mode, opportunities, onSelect, onCreate, onStageChange, onDateChange, onOppUpdate, onTaskUpdate, holidays = [], globalLabels = [], onMinimize }) => {
    const { startTimer, pauseTimer } = useTimer(); // Only consume methods, not ticking state if possible
    // Note: Dashboard now avoids subscribing to ticking timerState to prevent whole-app 1s re-renders.
    const [proposalsViewMode, setProposalsViewMode] = useState<'board' | 'table' | 'calendar'>('board');
    const [tasksViewMode, setTasksViewMode] = useState<'board' | 'table' | 'calendar'>('board');

    // Derived current view mode based on component 'mode' prop
    const viewMode = mode === 'tasks' ? tasksViewMode : proposalsViewMode;
    const setViewMode = mode === 'tasks' ? setTasksViewMode : setProposalsViewMode;

    const [filterText, setFilterText] = useState('');
    const deferredFilterText = useDeferredValue(filterText); // Optimize search performance
    const [labelFilters, setLabelFilters] = useState<string[]>([]);
    const [selectedOppChips, setSelectedOppChips] = useState<string[]>([]);
    const [statusFilters, setStatusFilters] = useState<string[]>([]);
    const [dateFilterStart, setDateFilterStart] = useState('');
    const [dateFilterEnd, setDateFilterEnd] = useState('');
    const [rankFilter, setRankFilter] = useState('');
    const [detailedStatusFilters, setDetailedStatusFilters] = useState<string[]>([]);

    // Column State
    const allColumns = [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'customer', label: 'Customer' },
        { key: 'status', label: 'Status' },
        { key: 'stage', label: 'Stage' },
        { key: 'assigned', label: 'Assigned' },
        { key: 'expected', label: 'Expected Date' },
        { key: 'amount', label: 'Amount' },
        { key: 'nextStep', label: 'Next Step' },
        { key: 'waiting', label: 'Waiting On' }
    ];
    const [visibleColumns, setVisibleColumns] = useState<string[]>(allColumns.map(c => c.key));

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
    const [hideNextStepBadges, setHideNextStepBadges] = useState(false);
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

    // Workload chart
    const [showWorkloadChart, setShowWorkloadChart] = useState(false);

    // Sticky Notes (stored in localStorage)
    const STICKY_KEY = 'tenderloop.stickynotes.v1';
    interface StickyNote { id: string; content: string; createdAt: string; }
    const [stickyNotes, setStickyNotes] = useState<StickyNote[]>(() => {
        try { return JSON.parse(localStorage.getItem(STICKY_KEY) || '[]'); } catch { return []; }
    });
    const [showStickyPanel, setShowStickyPanel] = useState(false);
    const [newStickyText, setNewStickyText] = useState('');
    useEffect(() => { localStorage.setItem(STICKY_KEY, JSON.stringify(stickyNotes)); }, [stickyNotes]);
    const addStickyNote = () => {
        if (!newStickyText.trim()) return;
        setStickyNotes(prev => [{ id: crypto.randomUUID(), content: newStickyText.trim(), createdAt: new Date().toISOString() }, ...prev]);
        setNewStickyText('');
    };
    const deleteStickyNote = (id: string) => setStickyNotes(prev => prev.filter(n => n.id !== id));
    const updateStickyNote = (id: string, content: string) => setStickyNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));

    // Kanban mini-notes per opportunity (in-memory, persisted via opp data would need onOppUpdate)
    const [kanbanMiniNotes, setKanbanMiniNotes] = useState<Record<string, string>>(() => {
        try { return JSON.parse(localStorage.getItem('tenderloop.kanban.mininotes.v1') || '{}'); } catch { return {}; }
    });
    useEffect(() => { localStorage.setItem('tenderloop.kanban.mininotes.v1', JSON.stringify(kanbanMiniNotes)); }, [kanbanMiniNotes]);

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
                if (parsed.tasksViewMode) setTasksViewMode(parsed.tasksViewMode);
                if (parsed.proposalsViewMode) setProposalsViewMode(parsed.proposalsViewMode);
            } else {
                // Default: All statuses + priorities selected
                setTaskStatusFilters(Object.keys(TASK_STATUS_COLORS));
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
    const [kanbanGroupBy, setKanbanGroupBy] = useState<'status' | 'stage' | 'detailed' | 'agile'>('status');

    const [selectedTask, setSelectedTask] = useState<{ task: Task, oppId: string } | null>(null);
    const [showDocPicker, setShowDocPicker] = useState<boolean>(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [splitViewNoteId, setSplitViewNoteId] = useState<string | null>(null);
    const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(new Date().toLocaleDateString('en-CA'));
    const [showCalendarSidebar, setShowCalendarSidebar] = useState(true);
    const [isCalendarMaximized, setIsCalendarMaximized] = useState(false);

    // Bulk selection state for export
    const [selectedForExport, setSelectedForExport] = useState<string[]>([]);
    const importInputRef = useRef<HTMLInputElement>(null);


    // --- Calculations ---
    const getBadgeInfo = (opp: Opportunity) => {
        const status = opp.statusLabel;

        // A) Active states: Check Due Date (Expected Date)
        if (status === 'In Progress' || status === 'On Hold') {
            if (!opp.dates.expected) {
                return { text: opp.alias || opp.id, color: 'bg-gray-100 text-gray-500' };
            }

            const todayStr = new Date().toLocaleDateString('en-CA');
            const diffDays = countBusinessDays(todayStr, opp.dates.expected, holidays);

            let colorClass = '';
            let style: React.CSSProperties = {};

            if (diffDays < -10) {
                // Extreme Alert: White with red diagonals
                style = {
                    background: 'repeating-linear-gradient(45deg, #ffffff, #ffffff 10px, #fecaca 10px, #fecaca 20px)',
                    color: '#991b1b',
                    border: '1px solid #f87171'
                };
            } else if (diffDays <= -6) {
                // Overdue > 5 days: Purple
                colorClass = 'bg-purple-600 text-white shadow-md shadow-purple-200';
            } else if (diffDays < 0) {
                colorClass = 'bg-red-500 text-white';
            } else if (diffDays <= 2) {
                colorClass = 'bg-orange-500 text-white';
            } else if (diffDays <= 5) {
                colorClass = 'bg-yellow-400 text-gray-900';
            } else {
                colorClass = 'bg-[#3DCD58] text-white';
            }

            return {
                text: opp.alias || opp.id,
                color: colorClass,
                style: style,
                tooltip: diffDays < 0 ? `${Math.abs(diffDays)}d overdue` : diffDays === 0 ? 'Due today' : `${diffDays}d left`
            };
        }

        // B) Delivered states
        if (['Submitted', 'Won', 'Lost'].includes(status)) {
            const received = opp.kpis?.timeline?.receivedAt;
            const delivered = opp.kpis?.timeline?.deliveredAt;

            if (received && delivered) {
                const days = countCalendarDays(received, delivered);
                const displayDays = Math.max(0, days);
                return { text: opp.alias || opp.id, color: 'bg-blue-50 text-blue-600', tooltip: `${displayDays}d to deliver` };
            }
        }

        return { text: opp.alias || opp.id, color: 'bg-gray-100 text-gray-400' };
    };

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

        return `${STAGE_COLORS[item.stage as ProcessStage] || 'bg-gray-100'} border-transparent font-bold mb-0.5`;
    };

    const handleResetFilters = () => {
        setFilterText('');
        setTaskSearchText('');
        setSelectedOppChips([]);
        setStatusFilters([]);
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
    };

    const getImportanceColor = (rank: number | null, dateStr?: string, isCompleted: boolean = false) => {
        if (isCompleted) return "bg-gray-100 text-gray-500";
        return "bg-white/90 text-gray-800 border border-black/10 shadow-sm backdrop-blur-[2px]";
    };

    const calculateProgress = (stage: ProcessStage) => {
        const stageNum = parseInt(stage.split('.')[0]) || 1;
        return Math.round((stageNum / 9) * 100);
    };

    const getSellPrice = (opp: Opportunity) => {
        if (opp.commercial.cqaOfficialSellPrice > 0) return opp.commercial.cqaOfficialSellPrice;
        return (opp.commercial.swHw?.sellPrice || 0) + (opp.commercial.services?.sellPrice || 0) + (opp.commercial.resale?.sellPrice || 0);
    };

    // --- Filter Logic ---
    // Deduplicate opportunities to prevent double rendering
    const uniqueOpps = useMemo(() => {
        const seen = new Set();
        return opportunities.filter(o => {
            if (seen.has(o.id)) return false;
            seen.add(o.id);
            return true;
        });
    }, [opportunities]);

    // --- Derived Data: Filtered Opportunities ---
    // Consolidated filter logic to ensure Tasks inherit all filters (Text, Status, etc.) 
    // BUT date filtering is handled contextually.
    // Base filter (Status, Date, Labels) - used for Search Suggestions to provide candidates
    const baseFilteredOpps = useMemo(() => {
        return uniqueOpps.filter(opp => {
            // Status/Stage filter
            if (statusFilters.length > 0) {
                const isStageFilter = Object.keys(STAGE_COLORS).some(s => statusFilters.includes(s));
                if (isStageFilter) {
                    if (!statusFilters.includes(opp.stage)) return false;
                } else {
                    if (!statusFilters.includes(opp.statusLabel)) return false;
                }
            }

            // Date filter
            if ((dateFilterStart || dateFilterEnd) && mode !== 'tasks') {
                const dateToCheck = (mode === 'general' && opp.kpis?.timeline.deliveredAt)
                    ? opp.kpis.timeline.deliveredAt
                    : opp.dates.expected;

                if (dateFilterStart && (!dateToCheck || dateToCheck < dateFilterStart)) return false;
                if (dateFilterEnd && (!dateToCheck || dateToCheck > dateFilterEnd)) return false;
            }

            // Labels filter
            if (labelFilters.length > 0) {
                if (!(opp.labels || []).some(l => labelFilters.includes(l.id))) return false;
            }

            // Opp Status filter
            if (taskOppStatusFilters.length > 0) {
                if (!taskOppStatusFilters.includes(opp.statusLabel)) return false;
            }

            // Detailed Status filter
            if (detailedStatusFilters.length > 0) {
                if (!opp.detailedStatus || !detailedStatusFilters.includes(opp.detailedStatus)) return false;
            }

            return true;
        });
    }, [uniqueOpps, statusFilters, mode, dateFilterStart, dateFilterEnd, labelFilters, taskOppStatusFilters, detailedStatusFilters]);

    // Final filter (Text, Chips) - used for Dashboard display
    const filteredOpps = useMemo(() => {
        const booleanMatcher = parseBooleanQuery(deferredFilterText);

        return baseFilteredOpps.filter(opp => {
            // Text Search
            if (booleanMatcher) {
                const labelsText = (opp.labels || []).map(l => l.text).join(' ');
                const raw = `${opp.title} ${opp.id} ${opp.customer} ${opp.statusLabel} ${opp.alias || ''} ${labelsText}`.toLowerCase();
                if (!booleanMatcher(raw)) return false;
            }

            // Chips filter
            if (selectedOppChips.length > 0 && !selectedOppChips.includes(opp.id)) return false;

            return true;
        });
    }, [baseFilteredOpps, deferredFilterText, selectedOppChips]);

    // --- KPI Aggregation Logic ---
    const kpiData = useMemo(() => {
        // 1. Filter opportunities based on dashboard filters AND specific KPI filter
        const targetOpps = filteredOpps.filter(opp => {
            if (kpiSoldFilter === 'all') return true;
            if (kpiSoldFilter === 'sold') return opp.kpis?.sold === true;
            if (kpiSoldFilter === 'not-sold') return opp.kpis?.sold === false;
            return true;
        });

        const count = targetOpps.length;
        if (count === 0) return null;

        // 2. Aggregate
        const sumLang = targetOpps.reduce((sum, o) => sum + (o.kpis?.languageSkill || 0), 0);
        const sumTech = targetOpps.reduce((sum, o) => sum + (o.kpis?.technicalUnderstanding || 0), 0);
        const sumDeal = targetOpps.reduce((sum, o) => sum + (o.kpis?.dealProbability || 0), 0);
        const sumEffort = targetOpps.reduce((sum, o) => sum + (o.kpis?.effortContribution || 0), 0);
        const sumAmount = targetOpps.reduce((sum, o) => sum + (o.kpis?.proposalAmountUSD || 0), 0);

        const validLangCount = targetOpps.filter(o => o.kpis?.languageSkill !== null).length;
        const validTechCount = targetOpps.filter(o => o.kpis?.technicalUnderstanding !== null).length;
        const validDealCount = targetOpps.filter(o => o.kpis?.dealProbability !== null).length;
        const validEffortCount = targetOpps.filter(o => o.kpis?.effortContribution !== null && o.kpis?.effortContribution > 0).length;

        const soldCount = targetOpps.filter(o => o.kpis?.sold === true).length;
        const totalSoldStatus = targetOpps.filter(o => o.kpis?.sold !== null).length;

        // Timelines
        let sumDeliveryDays = 0;
        let validDeliveryCount = 0;
        let sumWorkDays = 0;
        let validWorkCount = 0;

        targetOpps.forEach(o => {
            if (o.kpis?.timeline.receivedAt && o.kpis?.timeline.deliveredAt) {
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
            avgLang: validLangCount ? (sumLang / validLangCount).toFixed(1) : '-',
            avgTech: validTechCount ? (sumTech / validTechCount).toFixed(1) : '-',
            avgDeal: validDealCount ? (sumDeal / validDealCount).toFixed(1) : '-',
            avgEffort: validEffortCount ? (sumEffort / validEffortCount).toFixed(1) : '-',
            winRate: totalSoldStatus ? ((soldCount / totalSoldStatus) * 100).toFixed(1) : '-',
            avgAmount: count ? (sumAmount / count).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-',
            avgDeliveryDays: validDeliveryCount ? (sumDeliveryDays / validDeliveryCount).toFixed(1) : '-',
            avgWorkDays: validWorkCount ? (sumWorkDays / validWorkCount).toFixed(1) : '-',
            totalOpps: count
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
                if (o.kpis?.timeline.receivedAt && o.kpis?.timeline.deliveredAt) {
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

        const task = opp.tasks.find(t => t.id === taskId);
        if (!task || !task.blockDoneUntilDependenciesDone || !task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) return true;

        const pendingDeps = opp.tasks.filter(t => task.dependsOnTaskIds!.includes(t.id) && t.status !== 'Done' && t.status !== 'Canceled');

        if (pendingDeps.length > 0) {
            alert("This task is blocked until its dependencies are completed.");
            return false;
        }
        return true;
    };

    const { timerState, confirmStop } = useTimer();

    const handleTaskStatusChange = (oppId: string, taskId: string, newStatus: TaskStatus): void => {
        // If marking as Done and there's an active timer for THIS task, we must stop it first to log the time.
        if (newStatus === 'Done' && timerState.taskId === taskId && timerState.isRunning) {
            confirmStop('Done'); // This will call handleTimerLog which updates DB and status
            return;
        }

        if (newStatus === 'Done') {
            const opp = opportunities.find(o => o.id === oppId);
            const task = opp?.tasks.find(t => t.id === taskId);
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
    };

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

        // Cache constants
        const today = new Date().toLocaleDateString('en-CA');
        const taskMatcher = parseBooleanQuery(taskSearchText);

        // Initialize groups if in tasks mode
        if (mode === 'tasks') {
            if (taskGroupBy === 'status') {
                ['Pending', 'In Progress', 'On Hold', 'Missing Info', 'Done', 'Canceled'].forEach(k => result.grouped[k] = []);
            }
            else if (taskGroupBy === 'priority') ['High', 'Medium', 'Low'].forEach(k => result.grouped[k] = []);
        }

        filteredOpps.forEach(opp => {
            opp.tasks.forEach(t => {
                // 1. Task Search (Local)
                if (taskMatcher) {
                    const raw = `${t.id} ${t.title} ${t.description || ''} ${t.responsible || ''} ${t.status} ${t.priority} ${(t.externalAreas || []).join(' ')}`.toLowerCase();
                    if (!taskMatcher(raw)) return;
                }

                // 2. Global Date Filter (Applied to Task Due Date)
                if (dateFilterStart || dateFilterEnd) {
                    if (!t.dueDate) return;
                    if (dateFilterStart && t.dueDate < dateFilterStart) return;
                    if (dateFilterEnd && t.dueDate > dateFilterEnd) return;
                }

                // 3. Task Specific Filters
                if (taskOppFilters.length > 0 && !taskOppFilters.includes(opp.id)) return;
                if (taskStatusFilters.length > 0 && !taskStatusFilters.includes(t.status)) return;
                if (taskPriorityFilters.length > 0 && !taskPriorityFilters.includes(t.priority)) return;
                if (taskOppStatusFilters.length > 0 && !taskOppStatusFilters.includes(opp.statusLabel)) return;

                if (taskAreaFilters.length > 0) {
                    const isInternal = t.owner === 'Me' && taskAreaFilters.includes('Internal');
                    const isExternal = t.externalAreas && t.externalAreas.some(area => taskAreaFilters.includes(area));
                    if (!isInternal && !isExternal) return;
                }

                if (taskCalendarizedFilter === 'calendarized' && !t.calendarized) return;
                if (taskCalendarizedFilter === 'not-calendarized' && t.calendarized) return;

                // Create task object with context (Only for items that pass filters!)
                const taskWithOpp = { ...t, opp };
                result.filtered.push(taskWithOpp);

                if (mode === 'tasks') {
                    let key = 'Other';
                    if (taskGroupBy === 'status') {
                        const status = t.status as TaskStatus;
                        // Map all statuses to the 6 principals (Safe check although we restricted the type)
                        if (['Pending'].includes(status)) key = 'Pending';
                        else if (['Missing Info'].includes(status)) key = 'Missing Info';
                        else if (['On Hold'].includes(status)) key = 'On Hold';
                        else if (['In Progress'].includes(status)) key = 'In Progress';
                        else if (['Done'].includes(status)) key = 'Done';
                        else if (['Canceled'].includes(status)) key = 'Canceled';
                        else key = 'Pending';
                    }
                    else if (taskGroupBy === 'priority') key = t.priority;
                    else if (taskGroupBy === 'area') {
                        if (t.owner === 'Me') key = 'Internal';
                        else if (t.externalAreas && t.externalAreas.length > 0) key = 'External';
                    } else if (taskGroupBy === 'opportunity') {
                        key = `${opp.id} - ${opp.title}`;
                    }
                    if (!result.grouped[key]) result.grouped[key] = [];
                    result.grouped[key].push(taskWithOpp);

                    // --- Next Steps (lowest order, exclude terminal states) ---
                    const isTerminal = ['Done', 'Canceled'].includes(t.status);
                    if (!isTerminal && mode === 'tasks') {
                        if (!t.dueDate) result.nextSteps.noDate.push(taskWithOpp);
                        else if (t.dueDate < today) result.nextSteps.overdue.push(taskWithOpp);
                        else if (t.dueDate === today) result.nextSteps.dueToday.push(taskWithOpp);
                    }
                }
            });
        });

        // --- Optimized Final Sorts ---

        // Table View Sort
        result.filtered.sort((a, b) => {
            const orderA = a.opp.priorityOrder ?? 999;
            const orderB = b.opp.priorityOrder ?? 999;
            if (orderA !== orderB) return orderA - orderB;

            const pMap: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2 };
            const pA = pMap[a.opp.priority] ?? 1;
            const pB = pMap[b.opp.priority] ?? 1;
            if (pA !== pB) return pA - pB;

            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
        });

        // Kanban Groups Sort
        if (mode === 'tasks') {
            Object.keys(result.grouped).forEach(key => {
                result.grouped[key].sort((a, b) => {
                    const orderA = a.order ?? 9999;
                    const orderB = b.order ?? 9999;
                    if (orderA !== orderB) return orderA - orderB;
                    const dateA = a.dueDate || "9999-12-31";
                    const dateB = b.dueDate || "9999-12-31";
                    return dateA.localeCompare(dateB);
                });
            });
        }

        return result;
    }, [filteredOpps, taskStatusFilters, taskPriorityFilters, taskAreaFilters, taskOppFilters, taskOppStatusFilters, taskCalendarizedFilter, dateFilterStart, dateFilterEnd, taskSearchText, taskGroupBy, mode, showNextSteps, kanbanGroupBy]);

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

    const kpiTotalAmount = useMemo(() => {
        return filteredOpps.reduce((sum, opp) => sum + getSellPrice(opp), 0);
    }, [filteredOpps]);

    const kpiWonAmount = useMemo(() => {
        return filteredOpps.filter(o => o.statusLabel === 'Won').reduce((sum, opp) => sum + getSellPrice(opp), 0);
    }, [filteredOpps]);

    const getWaitingOnAreas = (opp: Opportunity) => {
        if (opp.statusLabel === 'Won' || opp.statusLabel === 'Lost' || opp.statusLabel === 'Canceled') return null;

        const externalPending = opp.tasks.filter(t => t.owner === 'External Area' && t.status !== 'Done');
        if (externalPending.length === 0) return null;

        const areas = Array.from(new Set(externalPending.flatMap(t => t.externalAreas || [])));
        return areas.join(', ');
    };

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
        } else if (kanbanGroupBy === 'detailed') {
            // Remove 'Waiting' — migrate to 'Info Needed'
            ['No Status', 'Info Needed', 'Paused', 'Approval', 'Meeting', 'Completed', 'Canceled'].forEach(g => groups[g] = []);
            filteredOpps.forEach(o => {
                let key = o.detailedStatus || 'No Status';
                if (key === 'Waiting') key = 'Info Needed'; // Migration
                if (groups[key]) groups[key].push(o);
                else if (groups['No Status']) groups['No Status'].push(o);
            });
            Object.keys(groups).forEach(k => groups[k].sort((a, b) => (a.priorityOrder ?? 999) - (b.priorityOrder ?? 999)));
        } else if (kanbanGroupBy === 'agile') {
            // Agile board: Backlog → Review → Working on it → Done
            ['Backlog', 'Review', 'Working on it', 'Done'].forEach(g => groups[g] = []);
            filteredOpps.forEach(o => {
                let key = 'Backlog';
                if (o.statusLabel === 'Won' || o.statusLabel === 'Submitted') key = 'Done';
                else if (o.statusLabel === 'On Hold') key = 'Review';
                else if (o.statusLabel === 'In Progress') key = 'Working on it';
                else key = 'Backlog';
                groups[key].push(o);
            });
            Object.keys(groups).forEach(k => groups[k].sort((a, b) => (a.priorityOrder ?? 999) - (b.priorityOrder ?? 999)));
        } else {
            Object.keys(STAGE_COLORS).forEach(stage => {
                groups[stage] = filteredOpps
                    .filter(o => o.stage === stage)
                    .sort((a, b) => (a.priorityOrder ?? 999) - (b.priorityOrder ?? 999));
            });
        }
        return groups;
    }, [filteredOpps, kanbanGroupBy]);



    const handleDragStart = (e: React.DragEvent, id: string, type: 'opp' | 'task' = 'opp', extra?: string) => {
        e.dataTransfer.setData('id', id);
        e.dataTransfer.setData('type', type);
        if (extra) e.dataTransfer.setData('extra', extra);
    };
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
                    } else if (kanbanGroupBy === 'detailed') {
                        onOppUpdate({ ...opp, detailedStatus: target as DetailedStatus });
                    } else {
                        onStageChange(id, target as ProcessStage);
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
        const rows = filteredOpps.flatMap(opp => opp.tasks.map(t => [
            opp.id,
            `"${t.title.replace(/"/g, '""')}"`,
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

    const handleInlineEdit = (opp: Opportunity, field: string, value: any) => {
        let updated = { ...opp };
        if (field.includes('dates.')) {
            const sub = field.split('.')[1];
            updated.dates = { ...updated.dates, [sub]: value };
        } else {
            // @ts-ignore
            updated[field] = value;
        }
        onOppUpdate(updated);
    };

    const updateSelectedTask = (field: keyof Task, value: any) => {
        if (!selectedTask) return;

        if (field === 'status' && !validateTaskCompletion(selectedTask.oppId, selectedTask.task.id, value)) {
            return;
        }

        const opp = opportunities.find(o => o.id === selectedTask.oppId);
        if (!opp) return;

        const updatedTasks = opp.tasks.map(t => t.id === selectedTask.task.id ? { ...t, [field]: value } : t);
        const updatedOpp = { ...opp, tasks: updatedTasks };
        onOppUpdate(updatedOpp);
        setSelectedTask({ ...selectedTask, task: { ...selectedTask.task, [field]: value } });
    };

    const deleteTaskInModal = () => {
        if (!selectedTask) return;
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        const opp = opportunities.find(o => o.id === selectedTask.oppId);
        if (!opp) return;
        const updatedTasks = opp.tasks.filter(t => t.id !== selectedTask.task.id);
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

    const handleDeleteTask = (e: React.MouseEvent, oppId: string, taskId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        const opp = opportunities.find(o => o.id === oppId);
        if (opp) {
            onOppUpdate({ ...opp, tasks: opp.tasks.filter(t => t.id !== taskId) });
        }
    };

    const copyTaskSummary = async () => {
        if (!selectedTask) return;
        const t = selectedTask.task;
        const opp = opportunities.find(o => o.id === selectedTask.oppId);

        // Resolve doc titles
        let docTitles: string[] = [];
        if (opp) {
            try {
                const docs = await listLinkedForTask(opp.id, t.id);
                docTitles = docs.map(d => d.fileKey.split('/').pop() || d.fileKey);
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

    // Reusable Task Card Renderer for Next Steps


    return (
        <div className="flex flex-col h-full bg-[#f1f3f4] p-6 gap-6 relative">
            {/* Top Bar */}
            <div className="flex justify-between items-center flex-wrap gap-4">
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

                    {mode === 'proposals' && viewMode === 'table' && (
                        <div className="mr-2">
                            <ColumnSelector
                                columns={allColumns}
                                visibleColumns={visibleColumns}
                                onChange={setVisibleColumns}
                            />
                        </div>
                    )}

                    <div className="flex gap-2 items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm mr-2">
                        <input type="date" value={dateFilterStart} onChange={e => setDateFilterStart(e.target.value)} className="text-xs border-none focus:ring-0 p-1" />
                        <span className="text-gray-400">-</span>
                        <input type="date" value={dateFilterEnd} onChange={e => setDateFilterEnd(e.target.value)} className="text-xs border-none focus:ring-0 p-1" />
                    </div>

                    {(mode === 'proposals' || mode === 'general') && (
                        <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm mr-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rank:</label>
                            <input
                                type="number"
                                placeholder="All"
                                className="w-12 text-xs border-none focus:ring-0 p-0 font-bold text-gray-700 text-center"
                                value={rankFilter}
                                onChange={e => setRankFilter(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="relative z-20">
                        <OpportunitySearchInput
                            // Pass base opportunities filtered by STATUS/DATE/LABELS but NOT text, 
                            // so suggestions can work on the subset of relevant items.
                            // Actually, if we pass 'filteredOpps', it includes the text filter.
                            // If I type "Pro", filteredOpps becomes small. Suggestions are small.
                            // If I backspace, filteredOpps grows.
                            // This works fine.
                            // To fix slowness, we need useDeferredValue in the Dashboard component logic mainly.
                            // Use baseFilteredOpps so the dropdown suggestions include all candidates,
                            // not just the ones currently shown on the dashboard (which are filtered by chips).
                            opportunities={baseFilteredOpps}
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
                                label="Filter Stage"
                                options={Object.keys(STAGE_COLORS)}
                                selected={statusFilters}
                                onChange={setStatusFilters}
                                isOpen={openDropdown === 'status'}
                                onToggle={() => toggleDropdown('status')}
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
                        </div>
                    )}

                    <MultiSelectDropdown
                        label="Labels"
                        options={globalLabels.map(l => l.text)}
                        selected={labelFilters.map(id => globalLabels.find(l => l.id === id)?.text || id)}
                        onChange={(texts) => {
                            const ids = texts.map(t => globalLabels.find(l => l.text === t)?.id).filter(Boolean) as string[];
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
                                options={Object.keys(TASK_STATUS_COLORS)}
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
                            <span className="text-xs text-gray-500 font-medium whitespace-nowrap whitespace-nowrap translate-y-[-1px]">Kanban View:</span>
                            <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                <button
                                    onClick={() => setKanbanGroupBy('status')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${kanbanGroupBy === 'status' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Standard
                                </button>
                                <button
                                    onClick={() => setKanbanGroupBy('agile')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${kanbanGroupBy === 'agile' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Agile
                                </button>
                                <button
                                    onClick={() => setKanbanGroupBy('detailed')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${kanbanGroupBy === 'detailed' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Process
                                </button>
                                <button
                                    onClick={() => setKanbanGroupBy('stage')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${kanbanGroupBy === 'stage' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Stages
                                </button>
                            </div>
                        </div>
                    )}

                    {mode !== 'general' && (
                        <div className="flex items-center gap-2">
                            <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                <button onClick={() => setViewMode('board')} className={`p-1.5 rounded ${viewMode === 'board' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Board View"><LayoutGrid className="w-4 h-4" /></button>
                                <button onClick={() => setViewMode('table')} className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Table View"><TableIcon className="w-4 h-4" /></button>
                                <button onClick={() => setViewMode('calendar')} className={`p-1.5 rounded ${viewMode === 'calendar' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`} title="Calendar View"><CalendarIcon className="w-4 h-4" /></button>
                            </div>

                            <button onClick={() => { setStartTimerData({ oppId: '', taskId: '' }); setShowStartTimerModal(true); }} className="flex items-center gap-2 bg-gray-900 hover:bg-black text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors mr-2">
                                <Play className="w-4 h-4" /> Start Timer
                            </button>

                            <button
                                onClick={handleResetFilters}
                                className="bg-white hover:bg-orange-50 text-gray-400 hover:text-orange-500 p-2 rounded-lg border border-gray-200 transition-colors shadow-sm"
                                title="Reset All Filters"
                            >
                                <RefreshCw className="w-5 h-5" />
                            </button>
                        </div>
                    )}

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
                                onClick={() => setShowStickyPanel(!showStickyPanel)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors ${showStickyPanel ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                                📌 Sticky Notes
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
                                        const pendingTasks = filteredTasks.filter(t => ['Pending', 'In Progress', 'On Hold', 'Missing Info'].includes(t.status));
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
                            <button
                                onClick={() => setHideNextStepBadges(!hideNextStepBadges)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border ${hideNextStepBadges ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}
                            >
                                <Zap className={`w-4 h-4 ${hideNextStepBadges ? 'opacity-50' : 'fill-blue-500'}`} />
                                {hideNextStepBadges ? 'Show Next Steps' : 'Hide Next Steps'}
                            </button>
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
            <div className="flex-1 overflow-x-auto overflow-hidden min-h-0">

                {/* ... General View and Tasks View unchanged ... */}
                {mode === 'general' && (
                    /* ... existing General View ... */
                    <div className="flex flex-col gap-6 h-full overflow-y-auto pr-2 pb-4">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Filtered Amount</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">${kpiTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><DollarSign className="w-6 h-6" /></div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Won Amount (Filtered)</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">${kpiWonAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><Trophy className="w-6 h-6" /></div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Count</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{filteredOpps.filter(o => o.statusLabel === 'In Progress').length}</p>
                                </div>
                                <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Briefcase className="w-6 h-6" /></div>
                            </div>
                        </div>

                        {/* NEW KPI SECTION */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[#3DCD58]" /> Performance KPIs</h3>
                                <div className="flex gap-2">
                                    <button onClick={() => setKpiSoldFilter('all')} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${kpiSoldFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>All</button>
                                    <button onClick={() => setKpiSoldFilter('sold')} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${kpiSoldFilter === 'sold' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-gray-600 border-gray-200'}`}>Sold Only</button>
                                    <button onClick={() => setKpiSoldFilter('not-sold')} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${kpiSoldFilter === 'not-sold' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-gray-600 border-gray-200'}`}>Not Sold</button>
                                </div>
                            </div>
                            {kpiData ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Win Rate</p>
                                        <p className="text-lg font-black text-gray-800">{kpiData.winRate}%</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Language</p>
                                        <p className="text-lg font-black text-gray-800">{kpiData.avgLang}%</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Tech</p>
                                        <p className="text-lg font-black text-gray-800">{kpiData.avgTech}%</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Deal Prob</p>
                                        <p className="text-lg font-black text-gray-800">{kpiData.avgDeal}%</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Amount</p>
                                        <p className="text-lg font-black text-gray-800">${kpiData.avgAmount}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Delivery</p>
                                        <p className="text-lg font-black text-gray-800">{kpiData.avgDeliveryDays} d</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg text-center" title="Represents the combined effort invested by me and all involved areas.">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Effort Contrib.</p>
                                        <p className="text-lg font-black text-gray-800">{(kpiData as any).avgEffort}%</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg My Work</p>
                                        <p className="text-lg font-black text-gray-800">{kpiData.avgWorkDays} d</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-400 italic text-sm">No KPI data available for current filters.</div>
                            )}
                        </div>



                        {/* List */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
                            <div className="overflow-auto flex-1">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
                                        <tr>
                                            <th className="px-6 py-3 w-32">ID</th>
                                            <th className="px-6 py-3">Title</th>
                                            <th className="px-6 py-3">Customer</th>
                                            <th className="px-6 py-3">Status</th>
                                            <th className="px-6 py-3">Stage</th>
                                            <th className="px-6 py-3">Expected Date</th>
                                            <th className="px-6 py-3 text-right">Amount</th>
                                            <th className="px-6 py-3">Waiting On</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredOpps.map(opp => {
                                            const waitingOn = getWaitingOnAreas(opp);
                                            const amount = getSellPrice(opp);
                                            return (
                                                <tr key={opp.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-3 font-mono text-xs text-gray-500 whitespace-nowrap cursor-pointer hover:text-[#3DCD58] hover:underline" onClick={() => onSelect(opp.id)}>{opp.id}</td>
                                                    <td className="px-6 py-3 font-medium text-gray-900">{opp.title}</td>
                                                    <td className="px-6 py-3 text-gray-600">{opp.customer}</td>
                                                    <td className="px-6 py-3">
                                                        <select
                                                            value={opp.statusLabel}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => handleInlineEdit(opp, 'statusLabel', e.target.value)}
                                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase border cursor-pointer ${STATUS_COLORS[opp.statusLabel]}`}
                                                        >
                                                            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STAGE_COLORS[opp.stage as ProcessStage]}`}>{translateProcessStage(opp.stage)}</span></td>
                                                    <td className="px-6 py-3 text-xs text-gray-600 font-mono">
                                                        <input
                                                            type="date"
                                                            value={opp.dates?.expected}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => handleInlineEdit(opp, 'dates.expected', e.target.value)}
                                                            className="bg-transparent border-none p-0 text-xs text-gray-600 focus:ring-0"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-mono font-medium">${amount.toLocaleString()}</td>
                                                    <td className="px-6 py-3">
                                                        {waitingOn ? <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100">{waitingOn}</span> : <span className="text-xs text-gray-400">-</span>}
                                                    </td>
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
                            <div className="flex h-full pb-4 px-2 min-w-max items-stretch gap-6">
                                {Object.entries(groupedOpps).map(([columnKey, opps]: [string, Opportunity[]], index, arr) => (
                                    <div
                                        key={columnKey}
                                        className={`${kanbanGroupBy === 'detailed' ? 'w-60' : 'w-80'} flex flex-col h-full relative group select-none`}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, columnKey, 'column')}
                                    >
                                        {kanbanGroupBy === 'status' ? (
                                            <div className={`flex items-center justify-between mb-4 p-3 rounded-lg border-t-4 shadow-sm bg-white ${STATUS_COLORS[columnKey as OpportunityStatus]}`}>
                                                <div className="flex flex-col">
                                                    <h3 className="text-sm font-bold uppercase tracking-wider">{translateStatus(columnKey)}</h3>
                                                </div>
                                                <span className="bg-white/50 px-2 py-0.5 rounded-full text-xs font-bold">{opps.length}</span>
                                            </div>
                                        ) : kanbanGroupBy === 'detailed' ? (
                                            <div className={`flex items-center justify-between mb-4 p-2 rounded-lg border-t-4 shadow-sm bg-white ${DETAILED_STATUS_COLORS[columnKey as DetailedStatus]}`}>
                                                <div className="flex flex-col">
                                                    <h3 className="text-[10px] font-black uppercase tracking-tighter leading-none">{translateStatus(columnKey)}</h3>
                                                </div>
                                                <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px] font-black">{opps.length}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between mb-4 bg-white/50 backdrop-blur-sm p-2 rounded-lg border border-gray-200/50">
                                                <div className="flex flex-col">
                                                    <h3 className="text-xs font-bold uppercase text-gray-600 tracking-wider truncate w-48" title={columnKey}>{translateProcessStage(columnKey)}</h3>
                                                    <div className="h-1 w-24 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                                        <div className="h-full bg-[#3DCD58]" style={{ width: `${calculateProgress(columnKey as ProcessStage)}%` }}></div>
                                                    </div>
                                                </div>
                                                <span className="bg-[#3DCD58]/10 text-[#2b9342] text-xs px-2 py-1 rounded-full font-bold shadow-sm">{opps.length}</span>
                                            </div>
                                        )}

                                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-10 cursor-default">
                                            {opps.map(opp => {
                                                const badge = getBadgeInfo(opp);
                                                return (
                                                    <div
                                                        key={opp.id}
                                                        onClick={(e) => { e.stopPropagation(); onSelect(opp.id); }}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, opp.id, 'opp')}
                                                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-[#3DCD58] cursor-grab active:cursor-grabbing transition-all group relative flex flex-col gap-2 overflow-hidden"
                                                    >
                                                        <div className={`absolute top-0 left-0 right-0 h-1 ${opp.statusLabel === 'Won' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                                                        <div className="flex flex-col gap-1 mt-2">
                                                            <div className="flex items-start justify-between gap-2 overflow-hidden mb-1">
                                                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                                    <span className="text-[9px] font-mono text-gray-400 bg-gray-50 px-1 rounded truncate py-0.5">ID: {opp.id}</span>
                                                                    {opp.detailedStatus && (
                                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tight ${DETAILED_STATUS_COLORS[opp.detailedStatus]} whitespace-nowrap`}>
                                                                            {translateStatus(opp.detailedStatus)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                                    {badge && (
                                                                        <div
                                                                            className={`text-[9px] font-black px-2 py-0.5 rounded shadow-sm tracking-tight uppercase ${badge.color} max-w-[90px] text-center truncate`}
                                                                            style={badge.style}
                                                                            title={badge.tooltip}
                                                                        >
                                                                            {badge.text}
                                                                        </div>
                                                                    )}
                                                                    {opp.priorityOrder && (
                                                                        <span className="text-[9px] font-bold text-[#3DCD58] bg-[#3DCD58]/10 px-1.5 py-0.5 rounded whitespace-nowrap border border-[#3DCD58]/20">
                                                                            Rank #{opp.priorityOrder}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <p className="text-xs text-gray-900 font-bold leading-tight line-clamp-2" title={opp.title}>{opp.title}</p>
                                                            <p className="text-[10px] text-gray-500 truncate">{opp.customer}</p>

                                                            {!hideNextStepBadges && (() => {
                                                                const nextTask = (opp.tasks || [])
                                                                    .filter(t => !['Done', 'Canceled'].includes(t.status))
                                                                    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))[0];
                                                                const isMissingInfoStale = nextTask?.status === 'Missing Info' && nextTask?.dueDate && (() => {
                                                                    const hrs = (Date.now() - new Date(nextTask.dueDate).getTime()) / 3600000;
                                                                    return hrs > 48;
                                                                })();
                                                                return nextTask ? (
                                                                    <div className={`mt-1 flex items-start gap-1.5 p-2 rounded-lg border shadow-sm animate-in fade-in slide-in-from-top-1 ${isMissingInfoStale ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                                                        <div className="shrink-0 mt-0.5">
                                                                            {isMissingInfoStale
                                                                                ? <span title="Blocked >48h">⚠️</span>
                                                                                : <Zap className="w-3 h-3 text-blue-500 fill-blue-500" />}
                                                                        </div>
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-[9px] font-black uppercase opacity-60 tracking-wider">Next Step</span>
                                                                            <span className="text-[11px] font-bold leading-tight line-clamp-2">{nextTask.title}</span>
                                                                            {nextTask.status === 'Missing Info' && <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-1 rounded">⚠ Missing Info</span>}
                                                                        </div>
                                                                    </div>
                                                                ) : null;
                                                            })()}

                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {(opp.labels || []).map(l => (
                                                                    <div key={l.id} className="text-[9px] px-1.5 py-0.5 rounded font-bold text-white shadow-sm" style={{ backgroundColor: l.color }}>
                                                                        {l.text}
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Mini-note for quick annotations */}
                                                            <div className="mt-2" onClick={e => e.stopPropagation()}>
                                                                <textarea
                                                                    placeholder="Quick note..."
                                                                    value={kanbanMiniNotes[opp.id] || ''}
                                                                    onChange={e => setKanbanMiniNotes(prev => ({ ...prev, [opp.id]: e.target.value }))}
                                                                    className="w-full text-[10px] text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg p-1.5 resize-none focus:ring-1 focus:ring-yellow-300 outline-none placeholder-gray-300"
                                                                    rows={2}
                                                                />
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                                <div
                                                                    className={`text-[10px] px-2 py-0.5 rounded-full border border-transparent font-medium truncate max-w-[120px] ${STAGE_COLORS[opp.stage as ProcessStage]}`}
                                                                    title="Technical Stage"
                                                                >
                                                                    {translateProcessStage(opp.stage)}
                                                                </div>
                                                                <div className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${STATUS_COLORS[opp.statusLabel as OpportunityStatus]}`}>
                                                                    {translateStatus(opp.statusLabel)}
                                                                </div>
                                                                {opp.priority && (
                                                                    <div className={`text-[9px] w-2 h-2 rounded-full ${PRIORITY_COLORS[opp.priority as TaskPriority]?.split(' ')[1]}`} title={`Priority: ${opp.priority}`}></div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-gray-100">
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
                                                            <div className="flex gap-1">
                                                                {opp.tasks.length > 0 && (
                                                                    <div className="flex items-center gap-1 text-[10px] bg-gray-50 px-1.5 py-0.5 rounded text-gray-500" title="Tasks Completed">
                                                                        <CheckSquare className="w-3 h-3" />
                                                                        {opp.tasks.filter(t => t.status === 'Done').length}/{opp.tasks.length}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
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
                                                {visibleColumns.includes('id') && <th className="px-6 py-3 w-32">ID</th>}
                                                {visibleColumns.includes('title') && <th className="px-6 py-3">Title</th>}
                                                {visibleColumns.includes('customer') && <th className="px-6 py-3">Customer</th>}
                                                {visibleColumns.includes('status') && <th className="px-6 py-3">Status</th>}
                                                {visibleColumns.includes('stage') && <th className="px-6 py-3">Stage</th>}
                                                {visibleColumns.includes('assigned') && <th className="px-6 py-3">Assigned</th>}
                                                {visibleColumns.includes('expected') && <th className="px-6 py-3">Expected Date</th>}
                                                {visibleColumns.includes('amount') && <th className="px-6 py-3 text-right">Amount</th>}
                                                {visibleColumns.includes('waiting') && <th className="px-6 py-3">Waiting On</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredOpps.map(opp => {
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
                                                        {visibleColumns.includes('stage') && (
                                                            <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STAGE_COLORS[opp.stage as ProcessStage]}`}>{translateProcessStage(opp.stage)}</span></td>
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
                                                                    const nextTask = (opp.tasks || []).find(t => !['Done', 'Completada', 'Won', 'Lost', 'Canceled', 'Cancelada'].includes(t.status));
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
                                                    {o.alias && (
                                                        <span className={`${getImportanceColor(o.priorityOrder, o.dates.expected, o.statusLabel === 'Won' || o.statusLabel === 'Lost' || o.statusLabel === 'Canceled')} px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tight shrink-0 shadow-sm`}>
                                                            {o.alias}
                                                        </span>
                                                    )}
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

                {/* ... Tasks Mode ... */}
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
                                            {(taskGroupBy === 'none' ? [['All Tasks', filteredTasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())]] : Object.entries(groupedTasks)).map(([group, tasks]) => (
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
                                                        {t.opp.alias && (
                                                            <span className={`${getImportanceColor(t.opp.priorityOrder, t.dueDate, t.status === 'Done' || t.status === 'Canceled')} px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shrink-0`}>
                                                                {t.opp.alias}
                                                            </span>
                                                        )}
                                                        <span className="truncate flex-1">{t.title}</span>
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

                                        {showCalendarSidebar && (
                                            <div className="w-80 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
                                                <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between shrink-0">
                                                    <div className="flex flex-col">
                                                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest leading-none">Schedule</h3>
                                                        {selectedCalendarDate && <span className="text-[10px] font-bold text-gray-400 mt-1">{new Date(selectedCalendarDate + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>}
                                                    </div>
                                                    <button onClick={() => setShowCalendarSidebar(false)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 transition-colors">
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
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
                                                                            {t.opp.alias && <span className={`${getImportanceColor(t.opp.priorityOrder, t.dueDate, t.status === 'Done' || t.status === 'Canceled')} px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>{t.opp.alias}</span>}
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
                                            </div>
                                        )}

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
                                            <input className="w-full text-2xl font-bold text-gray-900 border-b border-gray-200 focus:border-[#3DCD58] focus:ring-0 px-0 py-2 placeholder-gray-300" value={selectedTask.task.title} onChange={(e) => updateSelectedTask('title', e.target.value)} />
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
                                                {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s}>{s}</option>)}
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
                                                    <input placeholder="Person Name" className="border-gray-200 rounded-lg text-sm flex-1 bg-white mt-2" value={selectedTask.task.responsible || ''} onChange={(e) => updateSelectedTask('responsible', e.target.value)} />
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
                                            <LinkedDocsList key={refreshKey} opportunityId={selectedTask.oppId} taskId={selectedTask.task.id} />
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
                                        <textarea className="w-full border-gray-200 rounded-lg text-sm h-32 resize-none bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.description} onChange={(e) => updateSelectedTask('description', e.target.value)} />
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
                                                    <input
                                                        className={`flex-1 border-none focus:ring-0 py-1 text-sm ${sub.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                                                        value={sub.title}
                                                        onChange={(e) => {
                                                            if (!selectedTask) return;
                                                            const currentSubs = selectedTask.task.subtasks || [];
                                                            const updatedSubs = currentSubs.map(s => s.id === sub.id ? { ...s, title: e.target.value } : s);
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
                        multi={true}
                        onSelect={handleDocLink}
                        onClose={() => setShowDocPicker(false)}
                        title="Link documents to task"
                    />
                )
            }
            {/* Add Task Modal */}
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
                                    <input
                                        type="text"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent text-sm font-bold"
                                        placeholder="Enter task title..."
                                        value={newTaskData.title}
                                        onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
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
            {/* Start Timer Modal */}
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
                                        opportunities={opportunities.filter(o => o.statusLabel === 'In Progress' || o.statusLabel === 'On Hold' || !o.statusLabel)}
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
            {/* Close Task Modal with Time Logs */}
            {closeTaskData && (
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

                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
                                <span className="text-sm font-bold text-blue-800">Total Time Spent</span>
                                <span className="text-2xl font-mono font-black text-blue-600">
                                    {(() => {
                                        const logged = (closeTaskData.task.timeLogs || []).reduce((acc: any, log: any) => acc + (log.durationSeconds || 0), 0);
                                        const current = (timerState.taskId === closeTaskData.task.id) ? timerState.elapsedSeconds : 0;
                                        const total = logged + current;
                                        const h = Math.floor(total / 3600);
                                        const m = Math.floor((total % 3600) / 60);
                                        return `${h}h ${m}m`;
                                    })()}
                                </span>
                            </div>

                            {timerState.taskId === closeTaskData.task.id && timerState.isRunning && (
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
                                            {timerState.taskId === closeTaskData.task.id && timerState.isRunning && (
                                                <tr className="bg-green-50/30">
                                                    <td className="p-2 text-green-700 font-bold">Current</td>
                                                    <td className="p-2 text-green-600 font-mono">{new Date(timerState.startTime || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                    <td className="p-2 text-green-600 font-mono italic">Now</td>
                                                    <td className="p-2 text-green-700 font-mono font-black text-right">
                                                        {Math.floor(timerState.elapsedSeconds / 3600)}h {Math.floor((timerState.elapsedSeconds % 3600) / 60)}m
                                                    </td>
                                                </tr>
                                            )}
                                            {(!closeTaskData.task.timeLogs || closeTaskData.task.timeLogs.length === 0) && !(timerState.taskId === closeTaskData.task.id && timerState.isRunning) && (
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
                                        if (timerState.taskId === closeTaskData.task.id && timerState.isRunning) {
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
                        </div>
                    </div>
                </div>
            )}

            {/* ===== STICKY NOTES PANEL ===== */}
            {showStickyPanel && (
                <div className="fixed bottom-6 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-yellow-200 overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
                    <div className="flex items-center justify-between px-4 py-3 bg-yellow-50 border-b border-yellow-200">
                        <span className="font-black text-yellow-800 text-sm flex items-center gap-2">📌 Sticky Notes</span>
                        <button onClick={() => setShowStickyPanel(false)} className="text-yellow-600 hover:text-yellow-900 font-bold text-lg leading-none">×</button>
                    </div>
                    <div className="p-3 border-b border-yellow-100 flex gap-2">
                        <textarea
                            placeholder="Write a note..."
                            value={newStickyText}
                            onChange={e => setNewStickyText(e.target.value)}
                            className="flex-1 text-xs border border-yellow-200 rounded-lg p-2 resize-none focus:ring-1 focus:ring-yellow-300 outline-none bg-yellow-50"
                            rows={2}
                        />
                        <button onClick={addStickyNote} className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-lg text-xs font-black hover:bg-yellow-500 transition-colors self-end">Add</button>
                    </div>
                    <div className="overflow-y-auto flex-1 p-3 space-y-2 bg-yellow-50/30">
                        {stickyNotes.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No sticky notes yet.</p>}
                        {stickyNotes.map(note => (
                            <div key={note.id} className="bg-yellow-50 border border-yellow-200 rounded-xl p-2 shadow-sm group relative">
                                <textarea
                                    value={note.content}
                                    onChange={e => updateStickyNote(note.id, e.target.value)}
                                    className="w-full text-xs text-gray-700 bg-transparent border-none resize-none focus:ring-0 outline-none"
                                    rows={Math.max(2, note.content.split('\n').length)}
                                />
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-[9px] text-gray-400">{new Date(note.createdAt).toLocaleDateString()}</span>
                                    <button onClick={() => deleteStickyNote(note.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-[10px] font-bold transition-opacity">Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ===== WORKLOAD CHART ===== */}
            {showWorkloadChart && mode === 'tasks' && (() => {
                const today = new Date();
                const days: { label: string; date: string; count: number }[] = [];
                for (let i = -3; i <= 10; i++) {
                    const d = new Date(today);
                    d.setDate(d.getDate() + i);
                    const dateStr = d.toLocaleDateString('en-CA');
                    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const count = taskData.filtered.filter((t: any) => t.dueDate === dateStr).length;
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
                                        <span className="text-[8px] text-gray-400 truncate w-full text-center" title={d.label}>{d.label.split(',')[0]}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[9px] text-gray-400 mt-2">🔵 Today · 🔴 5+ tasks (overloaded) · 🟠 3-4 tasks · ⚪ 1-2</p>
                        </div>
                    </div>
                );
            })()}

            {/* ===== BULK EDIT MODAL ===== */}
            {showBulkEditModal && (
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
                                    {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
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
            )}
        </div >
    );
};

export default Dashboard;
