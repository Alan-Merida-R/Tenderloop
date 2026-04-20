import React, { useState } from 'react';
import { ListChecks, CalendarClock, ExternalLink, Plus, Trash2, Edit3, AlertTriangle, Search } from 'lucide-react';
import { Opportunity, Task, ExecutionBlock, TASK_STATUS_COLORS, PRIORITY_COLORS } from '../../types';
import {
    sortBlocks,
    formatBlockTimeRange,
    isBlockAfterDueDate,
    getPastelBlockStyle,
} from './executionBlockUtils';
import { ScheduleBlockEditor } from './ScheduleBlockEditor';

interface UnscheduledItem {
    task: Task;
    opp: Opportunity;
    color: string;
}

interface Props {
    tab: 'details' | 'unscheduled';
    onTabChange: (t: 'details' | 'unscheduled') => void;
    selected: { opp: Opportunity; task: Task } | null;
    unscheduled: UnscheduledItem[];
    onOpenInExpediente: (oppId: string, taskId: string) => void;
    onCreateBlock: (oppId: string, taskId: string, date: string, startTime: string, endTime?: string) => void;
    onUpdateBlock: (oppId: string, taskId: string, blockId: string, updates: Partial<ExecutionBlock>) => void;
    onDeleteBlock: (oppId: string, taskId: string, blockId: string) => void;
}

const fmtTodayStr = () => new Date().toLocaleDateString('en-CA');

/**
 * Right-side panel for the Schedule view. Hosts the Task Details tab
 * (shows selected task + its execution blocks) and the Unscheduled tab
 * (draggable list of active tasks without blocks).
 */
export const SchedulePanel: React.FC<Props> = ({
    tab,
    onTabChange,
    selected,
    unscheduled,
    onOpenInExpediente,
    onCreateBlock,
    onUpdateBlock,
    onDeleteBlock,
}) => {
    return (
        <aside className="w-[340px] shrink-0 border-l border-gray-100 flex flex-col bg-gray-50/40">
            <div className="flex border-b border-gray-100 bg-white shrink-0">
                <TabButton
                    active={tab === 'details'}
                    onClick={() => onTabChange('details')}
                    icon={<ListChecks className="w-3.5 h-3.5" />}
                    label="Task Details"
                />
                <TabButton
                    active={tab === 'unscheduled'}
                    onClick={() => onTabChange('unscheduled')}
                    icon={<CalendarClock className="w-3.5 h-3.5" />}
                    label={`Unscheduled${unscheduled.length ? ` (${unscheduled.length})` : ''}`}
                />
            </div>
            <div className="flex-1 overflow-y-auto">
                {tab === 'details' ? (
                    <DetailsTab
                        selected={selected}
                        onOpenInExpediente={onOpenInExpediente}
                        onCreateBlock={onCreateBlock}
                        onUpdateBlock={onUpdateBlock}
                        onDeleteBlock={onDeleteBlock}
                    />
                ) : (
                    <UnscheduledTab items={unscheduled} />
                )}
            </div>
        </aside>
    );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }>
    = ({ active, onClick, icon, label }) => (
        <button
            onClick={onClick}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 ${active ? 'text-gray-900 border-[#3DCD58]' : 'text-gray-400 border-transparent hover:text-gray-700'}`}
        >
            {icon} {label}
        </button>
    );

/** Detail pane: selected task, its blocks, and quick add. */
const DetailsTab: React.FC<{
    selected: { opp: Opportunity; task: Task } | null;
    onOpenInExpediente: (oppId: string, taskId: string) => void;
    onCreateBlock: (oppId: string, taskId: string, date: string, startTime: string, endTime?: string) => void;
    onUpdateBlock: (oppId: string, taskId: string, blockId: string, updates: Partial<ExecutionBlock>) => void;
    onDeleteBlock: (oppId: string, taskId: string, blockId: string) => void;
}> = ({ selected, onOpenInExpediente, onCreateBlock, onUpdateBlock, onDeleteBlock }) => {
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<ExecutionBlock | null>(null);

    if (!selected) {
        return (
            <div className="p-6 text-center text-xs text-gray-400">
                Click a block in the calendar or a task in the Unscheduled list to see details here.
            </div>
        );
    }

    const { opp, task } = selected;
    const blocks = sortBlocks(task.executionBlocks || []);

    return (
        <div className="p-4 space-y-4">
            <div>
                <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    <span>{opp.alias || opp.title.slice(0, 22)}</span>
                    <span className="text-gray-300">·</span>
                    <span className="truncate">{opp.customer}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900 leading-snug break-words">{task.title}</h3>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[task.status]}`}>{task.status}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[task.priority || 'Medium']}`}>{task.priority || 'Medium'}</span>
                    {task.dueDate && (
                        <span className="text-[10px] font-bold text-gray-500">Due {task.dueDate}</span>
                    )}
                </div>
                <button
                    onClick={() => onOpenInExpediente(opp.id, task.id)}
                    className="mt-3 flex items-center gap-1 text-[10px] font-black text-[#3DCD58] hover:underline uppercase"
                >
                    <ExternalLink className="w-3 h-3" /> Open in Expediente
                </button>
            </div>

            <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Execution Blocks ({blocks.length})
                    </span>
                    <button
                        onClick={() => setAdding(true)}
                        className="flex items-center gap-1 text-[10px] font-black text-[#3DCD58] hover:underline uppercase"
                    >
                        <Plus className="w-3 h-3" /> Add
                    </button>
                </div>
                {blocks.length === 0 && (
                    <div className="text-[11px] text-gray-400 italic py-3 text-center">No blocks yet.</div>
                )}
                <ul className="space-y-1.5">
                    {blocks.map(b => {
                        const warn = isBlockAfterDueDate(b, task.dueDate);
                        return (
                            <li key={b.id} className={`flex items-center gap-2 bg-white rounded-lg border p-2 ${warn ? 'border-amber-300' : 'border-gray-100'}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-bold text-gray-800">
                                        {new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </div>
                                    <div className="text-[10px] font-mono text-gray-500">{formatBlockTimeRange(b)}</div>
                                </div>
                                {warn && (
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                )}
                                <button onClick={() => setEditing(b)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Edit3 className="w-3 h-3" /></button>
                                <button
                                    onClick={() => {
                                        if (window.confirm('Delete this block?')) onDeleteBlock(opp.id, task.id, b.id);
                                    }}
                                    className="p-1 hover:bg-red-50 rounded text-red-400"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {adding && (
                <ScheduleBlockEditor
                    dueDate={task.dueDate}
                    onSave={(b) => {
                        onCreateBlock(opp.id, task.id, b.date, b.startTime, b.endTime);
                        setAdding(false);
                    }}
                    onClose={() => setAdding(false)}
                />
            )}
            {editing && (
                <ScheduleBlockEditor
                    initial={editing}
                    dueDate={task.dueDate}
                    onSave={(b) => {
                        onUpdateBlock(opp.id, task.id, b.id, { date: b.date, startTime: b.startTime, endTime: b.endTime });
                        setEditing(null);
                    }}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
};

/** Unscheduled tab: flat list of active tasks without blocks, draggable. */
const UnscheduledTab: React.FC<{ items: UnscheduledItem[] }> = ({ items }) => {
    const [q, setQ] = useState('');
    const filtered = items.filter(it => {
        if (!q) return true;
        const s = q.toLowerCase();
        return it.task.title.toLowerCase().includes(s)
            || (it.opp.alias || '').toLowerCase().includes(s)
            || it.opp.title.toLowerCase().includes(s);
    });

    if (items.length === 0) {
        return (
            <div className="p-6 text-center text-xs text-gray-400">
                All active tasks already have execution blocks.
            </div>
        );
    }

    return (
        <div className="p-3 space-y-2">
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search tasks"
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                />
            </div>
            <div className="text-[10px] text-gray-400 italic px-1">Drag a task onto the calendar to schedule it.</div>
            <ul className="space-y-1.5">
                {filtered.map(({ task, opp, color }) => {
                    const style = getPastelBlockStyle(color);
                    return (
                        <li
                            key={`${opp.id}-${task.id}`}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/x-tenderloop-task', JSON.stringify({ oppId: opp.id, taskId: task.id }));
                                e.dataTransfer.effectAllowed = 'copy';
                            }}
                            className="flex items-start gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-sm transition-all"
                            style={{ backgroundColor: style.bg, borderColor: style.border }}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-tight truncate" style={{ color: style.text }}>
                                    {opp.alias || opp.id}
                                </div>
                                <div className="text-[11px] font-bold text-gray-800 break-words">{task.title}</div>
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    <span className={`text-[9px] font-bold px-1.5 py-0 rounded ${TASK_STATUS_COLORS[task.status]}`}>{task.status}</span>
                                    {task.dueDate && <span className="text-[9px] text-gray-500">Due {task.dueDate}</span>}
                                </div>
                            </div>
                        </li>
                    );
                })}
                {filtered.length === 0 && (
                    <li className="text-[11px] text-gray-400 italic text-center py-3">No matches.</li>
                )}
            </ul>
        </div>
    );
};
