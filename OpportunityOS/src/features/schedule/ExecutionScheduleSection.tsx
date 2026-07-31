import React, { useState } from 'react';
import { Plus, Clock, Trash2, Edit3, AlertTriangle, CalendarClock, ExternalLink } from 'lucide-react';
import { Task, ExecutionBlock } from '../../types';
import {
    addBlockToTask,
    updateBlockInTask,
    removeBlockFromTask,
    sortBlocks,
    isBlockAfterDueDate,
    formatBlockTimeRange,
} from './executionBlockUtils';
import { ScheduleBlockEditor } from './ScheduleBlockEditor';

interface Props {
    task: Task;
    onChange: (updated: Task) => void;
    onOpenScheduleView?: () => void;
    disabled?: boolean;
}

/**
 * Reusable section for viewing/editing a task's Execution Schedule (work-time blocks).
 * Renders inside task detail modals and the floating task view.
 */
export const ExecutionScheduleSection: React.FC<Props> = ({
    task,
    onChange,
    onOpenScheduleView,
    disabled = false,
}) => {
    const [editing, setEditing] = useState<ExecutionBlock | null>(null);
    const [adding, setAdding] = useState(false);

    const blocks = sortBlocks(task.executionBlocks || []);

    const handleAdd = (block: ExecutionBlock) => {
        onChange(addBlockToTask(task, block));
        setAdding(false);
    };

    const handleEdit = (block: ExecutionBlock) => {
        onChange(updateBlockInTask(task, block.id, block));
        setEditing(null);
    };

    const handleDelete = (id: string) => {
        if (!window.confirm('Delete this block?')) return;
        onChange(removeBlockFromTask(task, id));
    };

    return (
        <div className="p-4 border border-gray-100 rounded-xl bg-gray-50/50">
            <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-[#3DCD58]" /> Execution Schedule
                </label>
                <div className="flex gap-2">
                    {onOpenScheduleView && (
                        <button
                            onClick={onOpenScheduleView}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] transition-colors"
                            title="Open full Schedule view"
                        >
                            <ExternalLink className="w-3 h-3" /> Open Schedule
                        </button>
                    )}
                    {!disabled && (
                        <button
                            onClick={() => setAdding(true)}
                            className="flex items-center gap-1 px-3 py-1 bg-[#3DCD58] text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#2db64a] transition-all"
                        >
                            <Plus className="w-3 h-3" /> Add Block
                        </button>
                    )}
                </div>
            </div>

            {blocks.length === 0 ? (
                <div className="text-center py-4 text-gray-400 text-xs">
                    No execution blocks yet. Add one to plan when you'll work on this task.
                </div>
            ) : (
                <ul className="space-y-2">
                    {blocks.map(block => {
                        const warn = isBlockAfterDueDate(block, task.dueDate);
                        return (
                            <li
                                key={block.id}
                                className={`flex items-center gap-3 p-2.5 bg-white rounded-lg border transition-all group ${warn ? 'border-amber-300' : 'border-gray-100 hover:border-[#3DCD58]'}`}
                            >
                                <div className="shrink-0 p-1.5 bg-[#3DCD58]/10 rounded text-[#3DCD58]">
                                    <Clock className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold text-gray-800">
                                        {new Date(block.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </div>
                                    <div className="text-[11px] text-gray-500 font-mono">{formatBlockTimeRange(block)}</div>
                                </div>
                                {warn && (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title="After due date">
                                        <AlertTriangle className="w-3 h-3" /> Past due
                                    </span>
                                )}
                                {!disabled && (
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setEditing(block)} className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Edit"><Edit3 className="w-3 h-3" /></button>
                                        <button onClick={() => handleDelete(block.id)} className="p-1 hover:bg-red-50 rounded text-red-400" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {adding && (
                <ScheduleBlockEditor
                    dueDate={task.dueDate}
                    onSave={handleAdd}
                    onClose={() => setAdding(false)}
                />
            )}
            {editing && (
                <ScheduleBlockEditor
                    initial={editing}
                    dueDate={task.dueDate}
                    onSave={handleEdit}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
};
