import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { ScheduledItem } from './ScheduleView';
import { getPastelBlockStyle, isBlockAfterDueDate, formatBlockTimeRange } from './executionBlockUtils';

interface Props {
    items: ScheduledItem[];
    anchor: Date;
    onAnchorChange: (d: Date) => void;
    onSelectTask: (oppId: string, taskId: string) => void;
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-CA');

/** First visible Monday of the month grid (may be in prior month). */
const firstGridDay = (anchor: Date): Date => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const day = first.getDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day;
    const d = new Date(first);
    d.setDate(first.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

export const ScheduleMonthView: React.FC<Props> = ({ items, anchor, onAnchorChange, onSelectTask }) => {
    const gridStart = useMemo(() => firstGridDay(anchor), [anchor]);
    const days = useMemo(() => Array.from({ length: 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        return d;
    }), [gridStart]);

    const itemsByDate = useMemo(() => {
        const map = new Map<string, ScheduledItem[]>();
        for (const it of items) {
            const arr = map.get(it.block.date) || [];
            arr.push(it);
            map.set(it.block.date, arr);
        }
        // Sort each bucket chronologically
        for (const [k, arr] of map) {
            map.set(k, [...arr].sort((a, b) => a.block.startTime < b.block.startTime ? -1 : 1));
        }
        return map;
    }, [items]);

    const shiftMonth = (delta: number) => {
        const d = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
        onAnchorChange(d);
    };

    const currentMonth = anchor.getMonth();
    const todayStr = fmtDate(new Date());

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={() => shiftMonth(-1)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => onAnchorChange(new Date())} className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-800 px-2 py-1 rounded border border-gray-200">Today</button>
                    <button onClick={() => shiftMonth(1)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><ChevronRight className="w-4 h-4" /></button>
                </div>
                <div className="text-xs font-bold text-gray-700">
                    {anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
                <div className="text-[10px] text-gray-400">{items.length} block{items.length === 1 ? '' : 's'} total</div>
            </div>

            <div className="grid shrink-0 border-b border-gray-100 bg-gray-50/60" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => (
                    <div key={w} className="text-[10px] font-black uppercase tracking-widest text-gray-400 text-center py-2">{w}</div>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(96px, 1fr)' }}>
                    {days.map(d => {
                        const dateStr = fmtDate(d);
                        const dayItems = itemsByDate.get(dateStr) || [];
                        const inMonth = d.getMonth() === currentMonth;
                        const isToday = dateStr === todayStr;
                        return (
                            <div key={dateStr} className={`border-r border-b border-gray-100 p-1.5 flex flex-col gap-1 overflow-hidden ${inMonth ? 'bg-white' : 'bg-gray-50/60'}`}>
                                <div className={`text-[10px] font-black ${isToday ? 'text-[#3DCD58]' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>{d.getDate()}</div>
                                <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                                    {dayItems.slice(0, 3).map(it => {
                                        const style = getPastelBlockStyle(it.oppColor || '#3DCD58');
                                        const warn = isBlockAfterDueDate(it.block, it.task.dueDate);
                                        return (
                                            <button
                                                key={it.block.id}
                                                onClick={() => onSelectTask(it.oppId, it.task.id)}
                                                className={`rounded border px-1 py-0.5 text-left truncate hover:shadow-sm transition-all flex items-center gap-1${it.highlighted ? ' ring-2 ring-amber-400' : ''}`}
                                                style={{ backgroundColor: style.bg, borderColor: style.border, color: style.text }}
                                                title={`${it.oppAlias || it.oppId} — ${it.task.title}\n${formatBlockTimeRange(it.block)}`}
                                            >
                                                {warn && <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-amber-700" />}
                                                <span className="text-[9px] font-mono shrink-0 opacity-70">{it.block.startTime}</span>
                                                <span className="text-[10px] font-bold truncate">{it.task.title}</span>
                                            </button>
                                        );
                                    })}
                                    {dayItems.length > 3 && (
                                        <span className="text-[9px] text-gray-400 font-bold">+{dayItems.length - 3} more</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
