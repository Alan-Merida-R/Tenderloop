import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, LayoutGrid, Filter, Bell, BellOff } from 'lucide-react';
import { Opportunity, Task, ExecutionBlock } from '../../types';
import { ScheduleWeekGrid } from './ScheduleWeekGrid';
import { ScheduleMonthView } from './ScheduleMonthView';
import { SchedulePanel } from './SchedulePanel';
import { ScheduleFiltersBar } from './ScheduleFiltersBar';
import { getOpportunityColor, isTaskActive, isOpportunitySchedulable, ScheduleFilters, EMPTY_FILTERS, taskMatchesFilters } from './scheduleHelpers';
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
    /** True when active filters are set and this item DOES match — highlighted in calendar.
     *  The calendar never hides/dims non-matching blocks; it only emphasizes matches. */
    highlighted?: boolean;
}

interface Props {
    opportunities: Opportunity[];
    /** Open the task in the expediente (full view with focused task). */
    onSelectTask: (oppId: string, taskId: string) => void;
    /** Open the task in the split sub-view (side panel, not full expediente). */
    onOpenTaskSubView?: (oppId: string, taskId: string) => void;
    /** `immediate` makes the change commit synchronously (no startTransition) so a
     *  dragged block persists at once instead of briefly snapping back. */
    onOppUpdate: (updated: Opportunity, id?: string, immediate?: boolean) => void;
    onStartTimer: (taskId: string, oppId: string, taskTitle: string) => void;
}

/**
 * Top-level Schedule view. Aggregates all execution blocks across
 * active tasks (Done/Cancelled excluded) and renders Work Week or Month.
 * Owns the right panel (Task Details / Unscheduled) and delegates block
 * mutations to the opportunities via onOppUpdate.
 */
export const ScheduleView: React.FC<Props> = ({ opportunities, onSelectTask, onOpenTaskSubView, onOppUpdate, onStartTimer }) => {
    const [tab, setTab] = useState<'week' | 'month'>('week');
    const [anchor, setAnchor] = useState<Date>(() => new Date());
    const [panelTab, setPanelTab] = useState<'details' | 'unscheduled'>('details');
    const [filters, setFilters] = useState<ScheduleFilters>(EMPTY_FILTERS);
    const [selected, setSelected] = useState<{ oppId: string; taskId: string } | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    // Notification permission state, so we can show an "Enable notifications" button.
    // requestPermission must run from a user gesture (a click) to be reliable.
    const notifSupported = typeof window !== 'undefined' && typeof Notification !== 'undefined';
    const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(
        notifSupported ? Notification.permission : 'unsupported'
    );
    useEffect(() => {
        if (!notifSupported) return;
        const sync = () => setNotifPerm(Notification.permission);
        const id = window.setInterval(sync, 2000);
        return () => window.clearInterval(id);
    }, [notifSupported]);
    const requestNotifications = useCallback(async () => {
        if (!notifSupported) return;
        try {
            const p = await Notification.requestPermission();
            setNotifPerm(p);
            if (p === 'granted') {
                new Notification('Notifications enabled', {
                    body: "You'll be alerted 15 min before each scheduled block and when it starts.",
                });
            }
        } catch { /* ignored */ }
    }, [notifSupported]);

    /** All active tasks flat list (Done/Canceled tasks and closed opportunities excluded). */
    const activeTasks = useMemo(() => {
        const out: { task: Task; opp: Opportunity }[] = [];
        for (const opp of opportunities) {
            // Skip opportunities that are Completed/Canceled in the process status.
            if (!isOpportunitySchedulable(opp)) continue;
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
        const hasActiveFilters =
            filters.oppIds.length + filters.statuses.length +
            filters.priorities.length + filters.owners.length > 0;
        // Calendar always shows ALL scheduled tasks. Filters never empty the agenda:
        // matching tasks are highlighted, the rest stay visible and normally styled.
        for (const { task, opp } of activeTasks) {
            const blocks = task.executionBlocks || [];
            const oppColor = colorByOpp.get(opp.id) || '#3DCD58';
            const matchesFilter = hasActiveFilters && taskMatchesFilters(task, opp.id, filters);
            for (const block of blocks) {
                out.push({
                    block,
                    task,
                    oppId: opp.id,
                    oppAlias: opp.alias,
                    oppColor,
                    oppName: opp.title,
                    highlighted: matchesFilter,
                });
            }
        }
        return out;
    }, [activeTasks, filters, colorByOpp]);

    const unscheduledTasks = useMemo(
        () => filteredTasks.filter(({ task }) => !isTaskScheduled(task)),
        [filteredTasks]
    );

    /** Apply a task mutation and bubble up to opportunities.
     *  immediate=true so block drags/edits commit synchronously and don't snap back. */
    const mutateTask = useCallback((oppId: string, taskId: string, fn: (t: Task) => Task) => {
        const opp = opportunities.find(o => o.id === oppId);
        if (!opp) return;
        const task = opp.tasks?.find(t => t.id === taskId);
        if (!task) return;
        const updatedTask = fn(task);
        const updatedTasks = opp.tasks.map(t => (t.id === taskId ? updatedTask : t));
        onOppUpdate({ ...opp, tasks: updatedTasks, lastUpdated: new Date().toISOString() }, oppId, true);
    }, [opportunities, onOppUpdate]);

    /** Change a task's status from the details panel. */
    const handleChangeStatus = useCallback((oppId: string, taskId: string, status: Task['status']) => {
        mutateTask(oppId, taskId, t => ({ ...t, status }));
    }, [mutateTask]);

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
                        {notifSupported && notifPerm !== 'granted' && (
                            <button
                                onClick={requestNotifications}
                                title={notifPerm === 'denied'
                                    ? 'Notifications are blocked in your browser settings — re-enable them there to get block alerts.'
                                    : 'Enable browser notifications for 15-min and at-start block alerts'}
                                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase tracking-widest rounded border ${notifPerm === 'denied' ? 'text-rose-600 border-rose-200 bg-rose-50' : 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'}`}
                            >
                                <BellOff className="w-3 h-3" /> {notifPerm === 'denied' ? 'Notifs blocked' : 'Enable alerts'}
                            </button>
                        )}
                        {notifSupported && notifPerm === 'granted' && (
                            <span className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase tracking-widest rounded border text-[#3DCD58] border-[#3DCD58]/30 bg-[#3DCD58]/10" title="Block alerts are on">
                                <Bell className="w-3 h-3" /> Alerts on
                            </span>
                        )}
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
                            onOpenTask={onOpenTaskSubView || onSelectTask}
                            onCreateBlock={handleCreateBlock}
                            onUpdateBlock={handleUpdateBlock}
                            onStartTimer={onStartTimer}
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
                onChangeStatus={handleChangeStatus}
                onCreateBlock={handleCreateBlock}
                onUpdateBlock={handleUpdateBlock}
                onDeleteBlock={handleDeleteBlock}
            />
        </div>
    );
};
