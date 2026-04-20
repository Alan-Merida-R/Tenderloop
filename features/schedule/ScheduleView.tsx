import React, { useCallback, useMemo, useState } from 'react';
import { CalendarDays, LayoutGrid, Filter } from 'lucide-react';
import { Opportunity, Task, ExecutionBlock } from '../../types';
import { ScheduleWeekGrid } from './ScheduleWeekGrid';
import { ScheduleMonthView } from './ScheduleMonthView';
import { SchedulePanel } from './SchedulePanel';
import { ScheduleFiltersBar } from './ScheduleFiltersBar';
import { getOpportunityColor, isTaskActive, ScheduleFilters, EMPTY_FILTERS, taskMatchesFilters } from './scheduleHelpers';
import {
    addBlockToTask,
    removeBlockFromTask,
    updateBlockInTask,
    createBlock,
    isTaskScheduled,
} from './executionBlockUtils';

/**
 * Flattened block with its parent task + opportunity metadata.
 * Consumed by the calendar grids for rendering.
 */
export interface ScheduledItem {
    block: ExecutionBlock;
    task: Task;
    oppId: string;
    oppAlias?: string;
    oppColor: string;
    oppName: string;
}

interface Props {
    opportunities: Opportunity[];
    /** Open the task in the expediente (full view with focused task). */
    onSelectTask: (oppId: string, taskId: string) => void;
    onOppUpdate: (updated: Opportunity) => void;
}

/**
 * Top-level Schedule view. Aggregates all execution blocks across
 * active tasks (Done/Cancelled excluded) and renders Work Week or Month.
 * Owns the right panel (Task Details / Unscheduled) and delegates block
 * mutations to the opportunities via onOppUpdate.
 */
export const ScheduleView: React.FC<Props> = ({ opportunities, onSelectTask, onOppUpdate }) => {
    const [tab, setTab] = useState<'week' | 'month'>('week');
    const [anchor, setAnchor] = useState<Date>(() => new Date());
    const [panelTab, setPanelTab] = useState<'details' | 'unscheduled'>('details');
    const [filters, setFilters] = useState<ScheduleFilters>(EMPTY_FILTERS);
    const [selected, setSelected] = useState<{ oppId: string; taskId: string } | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    /** All active tasks flat list (Done/Canceled excluded). */
    const activeTasks = useMemo(() => {
        const out: { task: Task; opp: Opportunity }[] = [];
        for (const opp of opportunities) {
            for (const task of opp.tasks || []) {
                if (!isTaskActive(task)) continue;
                out.push({ task, opp });
            }
        }
        return out;
    }, [opportunities]);

    /** Tasks passing filters (used to drive calendar items and Unscheduled list). */
    const filteredTasks = useMemo(
        () => activeTasks.filter(({ task, opp }) => taskMatchesFilters(task, opp.id, filters)),
        [activeTasks, filters]
    );

    /** Stable color map keyed by oppId — avoids recomputing on every item. */
    const colorByOpp = useMemo(() => {
        const m = new Map<string, string>();
        for (const opp of opportunities) m.set(opp.id, getOpportunityColor(opp));
        return m;
    }, [opportunities]);

    const items: ScheduledItem[] = useMemo(() => {
        const out: ScheduledItem[] = [];
        for (const { task, opp } of filteredTasks) {
            const blocks = task.executionBlocks || [];
            const oppColor = colorByOpp.get(opp.id) || '#3DCD58';
            for (const block of blocks) {
                out.push({
                    block,
                    task,
                    oppId: opp.id,
                    oppAlias: opp.alias,
                    oppColor,
                    oppName: opp.title,
                });
            }
        }
        return out;
    }, [filteredTasks, colorByOpp]);

    const unscheduledTasks = useMemo(
        () => filteredTasks.filter(({ task }) => !isTaskScheduled(task)),
        [filteredTasks]
    );

    /** Apply a task mutation and bubble up to opportunities. */
    const mutateTask = useCallback((oppId: string, taskId: string, fn: (t: Task) => Task) => {
        const opp = opportunities.find(o => o.id === oppId);
        if (!opp) return;
        const task = opp.tasks?.find(t => t.id === taskId);
        if (!task) return;
        const updatedTask = fn(task);
        const updatedTasks = opp.tasks.map(t => (t.id === taskId ? updatedTask : t));
        onOppUpdate({ ...opp, tasks: updatedTasks, lastUpdated: new Date().toISOString() });
    }, [opportunities, onOppUpdate]);

    const handleCreateBlock = useCallback((oppId: string, taskId: string, date: string, startTime: string, endTime?: string) => {
        const block = createBlock(date, startTime, endTime);
        mutateTask(oppId, taskId, t => addBlockToTask(t, block));
        setSelected({ oppId, taskId });
        setPanelTab('details');
    }, [mutateTask]);

    const handleUpdateBlock = useCallback((oppId: string, taskId: string, blockId: string, updates: Partial<ExecutionBlock>) => {
        mutateTask(oppId, taskId, t => updateBlockInTask(t, blockId, updates));
    }, [mutateTask]);

    const handleDeleteBlock = useCallback((oppId: string, taskId: string, blockId: string) => {
        mutateTask(oppId, taskId, t => removeBlockFromTask(t, blockId));
    }, [mutateTask]);

    const selectedCtx = useMemo(() => {
        if (!selected) return null;
        const opp = opportunities.find(o => o.id === selected.oppId);
        const task = opp?.tasks?.find(t => t.id === selected.taskId);
        if (!opp || !task) return null;
        return { opp, task };
    }, [selected, opportunities]);

    const handleSelect = useCallback((oppId: string, taskId: string) => {
        setSelected({ oppId, taskId });
        setPanelTab('details');
    }, []);

    const activeFilterCount =
        filters.oppIds.length + filters.statuses.length + filters.priorities.length + filters.owners.length;

    return (
        <div className="flex h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Main area (calendar) */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60 shrink-0">
                    <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-[#3DCD58]" />
                        <h2 className="text-sm font-black uppercase tracking-widest text-gray-800">Schedule</h2>
                        <span className="text-[10px] text-gray-400">
                            {items.length} block{items.length === 1 ? '' : 's'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase tracking-widest rounded border ${showFilters || activeFilterCount > 0 ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-500 hover:text-gray-800 border-gray-200'}`}
                        >
                            <Filter className="w-3 h-3" /> Filters
                            {activeFilterCount > 0 && (
                                <span className="ml-1 bg-[#3DCD58] text-white text-[9px] font-black rounded-full px-1.5 py-0">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                            <button
                                onClick={() => setTab('week')}
                                className={`px-3 py-1 text-[11px] font-bold uppercase tracking-widest rounded ${tab === 'week' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                Work Week
                            </button>
                            <button
                                onClick={() => setTab('month')}
                                className={`px-3 py-1 text-[11px] font-bold uppercase tracking-widest rounded flex items-center gap-1 ${tab === 'month' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                <LayoutGrid className="w-3 h-3" /> Month
                            </button>
                        </div>
                    </div>
                </div>

                {showFilters && (
                    <ScheduleFiltersBar
                        opportunities={opportunities}
                        filters={filters}
                        onChange={setFilters}
                    />
                )}

                <div className="flex-1 overflow-hidden">
                    {tab === 'week' ? (
                        <ScheduleWeekGrid
                            items={items}
                            anchor={anchor}
                            onAnchorChange={setAnchor}
                            onSelectTask={handleSelect}
                            onOpenTask={onSelectTask}
                            onCreateBlock={handleCreateBlock}
                            onUpdateBlock={handleUpdateBlock}
                        />
                    ) : (
                        <ScheduleMonthView
                            items={items}
                            anchor={anchor}
                            onAnchorChange={setAnchor}
                            onSelectTask={handleSelect}
                        />
                    )}
                </div>
            </div>

            {/* Right panel */}
            <SchedulePanel
                tab={panelTab}
                onTabChange={setPanelTab}
                selected={selectedCtx}
                unscheduled={unscheduledTasks.map(({ task, opp }) => ({
                    task,
                    opp,
                    color: colorByOpp.get(opp.id) || '#3DCD58',
                }))}
                onOpenInExpediente={onSelectTask}
                onCreateBlock={handleCreateBlock}
                onUpdateBlock={handleUpdateBlock}
                onDeleteBlock={handleDeleteBlock}
            />
        </div>
    );
};
