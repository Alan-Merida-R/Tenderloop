import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Play } from 'lucide-react';
import { ScheduledItem } from './ScheduleView';
import { ExecutionBlock } from '../../types';
import { useTimerActions } from '../../contexts/TimerContext';
import {
    timeToMinutes,
    minutesToTime,
    snapMinutes,
    getPastelBlockStyle,
    isBlockAfterDueDate,
    formatBlockTimeRange,
    MIN_BLOCK_MINUTES,
    DEFAULT_BLOCK_MINUTES,
} from './executionBlockUtils';

interface Props {
    items: ScheduledItem[];
    anchor: Date;
    onAnchorChange: (d: Date) => void;
    onSelectTask: (oppId: string, taskId: string) => void;
    onOpenTask: (oppId: string, taskId: string) => void;
    onCreateBlock: (oppId: string, taskId: string, date: string, startTime: string, endTime?: string) => void;
    onUpdateBlock: (oppId: string, taskId: string, blockId: string, updates: Partial<ExecutionBlock>) => void;
}

const HOUR_START = 8;   // 08:00
const HOUR_END = 20;    // 20:00
const SLOT_MIN = 15;
const SLOT_HEIGHT = 12; // px per 15-min slot → 48px/hour
const TOTAL_MIN = (HOUR_END - HOUR_START) * 60;
const CLICK_DELAY_MS = 220;

const fmtDate = (d: Date) => d.toLocaleDateString('en-CA');

const mondayOf = (d: Date): Date => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const day = x.getDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return x;
};

type Drag =
    | { mode: 'move'; oppId: string; taskId: string; blockId: string; origStart: number; origEnd: number; origDate: string; startY: number; colEl: HTMLElement; colDate: string }
    | { mode: 'resize'; oppId: string; taskId: string; blockId: string; origStart: number; origEnd: number; date: string; startY: number }
    | null;

interface LaidOut {
    item: ScheduledItem;
    col: number;
    totalCols: number;
}

/**
 * Google Calendar-style lane assignment: sort by start, then greedy-place
 * each block in the leftmost lane that doesn't overlap. Per-cluster totalCols
 * so non-overlapping groups render at full width.
 */
const layoutDay = (items: ScheduledItem[], preview?: Record<string, { date: string; startTime: string; endTime: string }>): LaidOut[] => {
    const resolved = items.map(it => {
        const p = preview?.[it.block.id];
        const b = p ? { ...it.block, ...p } : it.block;
        return { it, start: timeToMinutes(b.startTime), end: timeToMinutes(b.endTime) };
    }).filter(x => !isNaN(x.start) && !isNaN(x.end));

    resolved.sort((a, b) => (a.start - b.start) || (b.end - a.end));

    const result: LaidOut[] = [];
    let cluster: { it: ScheduledItem; start: number; end: number; col: number }[] = [];
    let clusterEnd = -Infinity;

    const flush = () => {
        const totalCols = cluster.reduce((m, c) => Math.max(m, c.col + 1), 0) || 1;
        for (const c of cluster) result.push({ item: c.it, col: c.col, totalCols });
        cluster = [];
        clusterEnd = -Infinity;
    };

    for (const { it, start, end } of resolved) {
        if (cluster.length && start >= clusterEnd) flush();
        const used = new Set<number>();
        for (const c of cluster) if (c.end > start) used.add(c.col);
        let col = 0;
        while (used.has(col)) col++;
        cluster.push({ it, start, end, col });
        clusterEnd = Math.max(clusterEnd, end);
    }
    if (cluster.length) flush();
    return result;
};

export const ScheduleWeekGrid: React.FC<Props> = ({ items, anchor, onAnchorChange, onSelectTask, onOpenTask, onCreateBlock, onUpdateBlock }) => {
    const timerActions = useTimerActions();
    const weekStart = useMemo(() => mondayOf(anchor), [anchor]);
    const days = useMemo(() => Array.from({ length: 5 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
    }), [weekStart]);

    const itemsByDate = useMemo(() => {
        const map = new Map<string, ScheduledItem[]>();
        for (const it of items) {
            const arr = map.get(it.block.date) || [];
            arr.push(it);
            map.set(it.block.date, arr);
        }
        return map;
    }, [items]);

    const shiftWeek = (delta: number) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + delta * 7);
        onAnchorChange(d);
    };

    const todayStr = fmtDate(new Date());
    const hours = useMemo(() => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i), []);

    const dragRef = useRef<Drag>(null);
    const [previewById, setPreviewById] = useState<Record<string, { date: string; startTime: string; endTime: string }>>({});
    const [hoverDate, setHoverDate] = useState<string | null>(null);

    // Tick every 60s for the now-line; also re-render after minute boundary for accuracy.
    const [nowMin, setNowMin] = useState(() => {
        const n = new Date();
        return n.getHours() * 60 + n.getMinutes();
    });
    useEffect(() => {
        const tick = () => {
            const n = new Date();
            setNowMin(n.getHours() * 60 + n.getMinutes());
        };
        const id = window.setInterval(tick, 60_000);
        return () => window.clearInterval(id);
    }, []);

    // Click-vs-doubleclick discrimination. Per-block pending timer.
    const clickTimerRef = useRef<Record<string, number>>({});
    const handleBlockClick = (it: ScheduledItem) => {
        const key = it.block.id;
        if (clickTimerRef.current[key]) return; // already queued
        clickTimerRef.current[key] = window.setTimeout(() => {
            delete clickTimerRef.current[key];
            onSelectTask(it.oppId, it.task.id);
        }, CLICK_DELAY_MS);
    };
    const handleBlockDblClick = (it: ScheduledItem) => {
        const key = it.block.id;
        const t = clickTimerRef.current[key];
        if (t) {
            window.clearTimeout(t);
            delete clickTimerRef.current[key];
        }
        onOpenTask(it.oppId, it.task.id);
    };
    useEffect(() => () => {
        for (const k of Object.keys(clickTimerRef.current)) window.clearTimeout(clickTimerRef.current[k]);
    }, []);

    const yToMinutes = (yPx: number) => {
        const mins = HOUR_START * 60 + (yPx / SLOT_HEIGHT) * SLOT_MIN;
        return snapMinutes(mins);
    };

    const onPointerMove = useCallback((e: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        if (d.mode === 'move') {
            const dy = e.clientY - d.startY;
            const newStart = Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 - MIN_BLOCK_MINUTES, snapMinutes(d.origStart + (dy / SLOT_HEIGHT) * SLOT_MIN)));
            const dur = d.origEnd - d.origStart;
            const newEnd = Math.min(HOUR_END * 60, newStart + dur);
            let targetDate = d.origDate;
            const cols = document.querySelectorAll<HTMLElement>('[data-day-col]');
            cols.forEach(col => {
                const r = col.getBoundingClientRect();
                if (e.clientX >= r.left && e.clientX <= r.right) {
                    const ds = col.getAttribute('data-day-col');
                    if (ds) targetDate = ds;
                }
            });
            setPreviewById(prev => ({ ...prev, [d.blockId]: { date: targetDate, startTime: minutesToTime(newStart), endTime: minutesToTime(newEnd) } }));
        } else if (d.mode === 'resize') {
            const dy = e.clientY - d.startY;
            const newEnd = Math.min(HOUR_END * 60, Math.max(d.origStart + MIN_BLOCK_MINUTES, snapMinutes(d.origEnd + (dy / SLOT_HEIGHT) * SLOT_MIN)));
            setPreviewById(prev => ({ ...prev, [d.blockId]: { date: d.date, startTime: minutesToTime(d.origStart), endTime: minutesToTime(newEnd) } }));
        }
    }, []);

    const onPointerUp = useCallback(() => {
        const d = dragRef.current;
        dragRef.current = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (!d) return;
        setPreviewById(prev => {
            const p = prev[d.blockId];
            if (p) onUpdateBlock(d.oppId, d.taskId, d.blockId, { date: p.date, startTime: p.startTime, endTime: p.endTime });
            const next = { ...prev };
            delete next[d.blockId];
            return next;
        });
    }, [onPointerMove, onUpdateBlock]);

    const beginMove = (e: React.PointerEvent, it: ScheduledItem, colEl: HTMLElement) => {
        e.stopPropagation();
        e.preventDefault();
        const startMin = timeToMinutes(it.block.startTime);
        const endMin = timeToMinutes(it.block.endTime);
        dragRef.current = {
            mode: 'move',
            oppId: it.oppId,
            taskId: it.task.id,
            blockId: it.block.id,
            origStart: startMin,
            origEnd: endMin,
            origDate: it.block.date,
            startY: e.clientY,
            colEl,
            colDate: it.block.date,
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    const beginResize = (e: React.PointerEvent, it: ScheduledItem) => {
        e.stopPropagation();
        e.preventDefault();
        const startMin = timeToMinutes(it.block.startTime);
        const endMin = timeToMinutes(it.block.endTime);
        dragRef.current = {
            mode: 'resize',
            oppId: it.oppId,
            taskId: it.task.id,
            blockId: it.block.id,
            origStart: startMin,
            origEnd: endMin,
            date: it.block.date,
            startY: e.clientY,
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    const handleDrop = (e: React.DragEvent, dateStr: string) => {
        e.preventDefault();
        setHoverDate(null);
        const raw = e.dataTransfer.getData('application/x-tenderloop-task');
        if (!raw) return;
        try {
            const { oppId, taskId } = JSON.parse(raw);
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const startMin = Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 - DEFAULT_BLOCK_MINUTES, yToMinutes(y)));
            const endMin = Math.min(HOUR_END * 60, startMin + DEFAULT_BLOCK_MINUTES);
            onCreateBlock(oppId, taskId, dateStr, minutesToTime(startMin), minutesToTime(endMin));
        } catch {
            /* ignored */
        }
    };

    const handleDragOver = (e: React.DragEvent, dateStr: string) => {
        if (e.dataTransfer.types.includes('application/x-tenderloop-task')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (hoverDate !== dateStr) setHoverDate(dateStr);
        }
    };

    const handleStartTimer = (e: React.MouseEvent, it: ScheduledItem) => {
        e.stopPropagation();
        timerActions.startTimer(it.task.id, it.oppId, it.task.title);
    };

    const nowLineTop = ((nowMin - HOUR_START * 60) / SLOT_MIN) * SLOT_HEIGHT;
    const nowLineVisible = nowMin >= HOUR_START * 60 && nowMin <= HOUR_END * 60;

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={() => shiftWeek(-1)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => onAnchorChange(new Date())} className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-800 px-2 py-1 rounded border border-gray-200">Today</button>
                    <button onClick={() => shiftWeek(1)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><ChevronRight className="w-4 h-4" /></button>
                </div>
                <div className="text-xs font-bold text-gray-700">
                    {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {days[4].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-[10px] text-gray-400">Click: details · Double-click: open · Drag to move</div>
            </div>

            {/* Day headers */}
            <div className="grid shrink-0 border-b border-gray-100 bg-gray-50/60" style={{ gridTemplateColumns: '60px repeat(5, 1fr)' }}>
                <div />
                {days.map(d => {
                    const isToday = fmtDate(d) === todayStr;
                    return (
                        <div key={d.toISOString()} className={`px-3 py-2 text-center ${isToday ? 'bg-[#3DCD58]/10 border-b-2 border-[#3DCD58]' : ''}`}>
                            <div className={`text-[10px] font-black uppercase tracking-widest ${isToday ? 'text-[#3DCD58]' : 'text-gray-400'}`}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                            <div className={`text-sm font-bold ${isToday ? 'text-[#3DCD58]' : 'text-gray-800'}`}>{d.getDate()}</div>
                        </div>
                    );
                })}
            </div>

            {/* Scrollable grid */}
            <div className="flex-1 overflow-y-auto">
                <div className="grid relative" style={{ gridTemplateColumns: '60px repeat(5, 1fr)' }}>
                    {/* Hour labels */}
                    <div className="border-r border-gray-100">
                        {hours.map(h => (
                            <div key={h} style={{ height: SLOT_HEIGHT * 4 }} className="text-[10px] font-mono text-gray-400 pr-2 text-right pt-0.5 border-b border-gray-50">
                                {String(h).padStart(2, '0')}:00
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    {days.map(d => {
                        const dateStr = fmtDate(d);
                        const isToday = dateStr === todayStr;
                        const dayItems = itemsByDate.get(dateStr) || [];
                        const isHovered = hoverDate === dateStr;
                        const laidOut = layoutDay(dayItems, previewById);
                        return (
                            <div
                                key={dateStr}
                                data-day-col={dateStr}
                                className={`relative border-r border-gray-100 transition-colors ${isToday ? 'bg-[#3DCD58]/[0.04]' : ''} ${isHovered ? 'bg-[#3DCD58]/10' : ''}`}
                                style={{ height: hours.length * SLOT_HEIGHT * 4 }}
                                onDragOver={(e) => handleDragOver(e, dateStr)}
                                onDragLeave={() => setHoverDate(h => (h === dateStr ? null : h))}
                                onDrop={(e) => handleDrop(e, dateStr)}
                            >
                                {/* Hour lines */}
                                {hours.map(h => (
                                    <div key={h} style={{ top: (h - HOUR_START) * SLOT_HEIGHT * 4, height: SLOT_HEIGHT * 4 }} className="absolute inset-x-0 border-b border-gray-50" />
                                ))}
                                {/* Half-hour ticks */}
                                {hours.map(h => (
                                    <div key={`half-${h}`} style={{ top: (h - HOUR_START) * SLOT_HEIGHT * 4 + SLOT_HEIGHT * 2 }} className="absolute inset-x-0 border-b border-dashed border-gray-50" />
                                ))}

                                {/* Now line — only on today's column */}
                                {isToday && nowLineVisible && (
                                    <div
                                        className="absolute inset-x-0 z-30 pointer-events-none"
                                        style={{ top: nowLineTop }}
                                    >
                                        <div className="relative">
                                            <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-rose-500 shadow" />
                                            <div className="border-t-2 border-rose-500" />
                                        </div>
                                    </div>
                                )}

                                {laidOut.map(({ item: it, col, totalCols }) => {
                                    const preview = previewById[it.block.id];
                                    const effBlock = preview ? { ...it.block, ...preview } : it.block;
                                    if (preview && preview.date !== dateStr) return null;
                                    const startMin = timeToMinutes(effBlock.startTime) - HOUR_START * 60;
                                    const endMin = timeToMinutes(effBlock.endTime) - HOUR_START * 60;
                                    const top = (Math.max(0, startMin) / SLOT_MIN) * SLOT_HEIGHT;
                                    const height = Math.max(SLOT_HEIGHT, ((Math.min(TOTAL_MIN, endMin) - Math.max(0, startMin)) / SLOT_MIN) * SLOT_HEIGHT);
                                    const style = getPastelBlockStyle(it.oppColor);
                                    const warn = isBlockAfterDueDate(effBlock, it.task.dueDate);
                                    const widthPct = 100 / totalCols;
                                    const leftPct = col * widthPct;
                                    const compact = height < SLOT_HEIGHT * 3;
                                    return (
                                        <div
                                            key={it.block.id}
                                            onClick={() => handleBlockClick(it)}
                                            onDoubleClick={() => handleBlockDblClick(it)}
                                            onPointerDown={(e) => {
                                                const col = (e.currentTarget.parentElement as HTMLElement);
                                                if (col) beginMove(e, it, col);
                                            }}
                                            className={`absolute rounded-md border shadow-sm text-left px-1.5 py-1 overflow-hidden hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing select-none${it.highlighted ? ' ring-2 ring-amber-400 ring-offset-1 z-20' : ' z-10'}`}
                                            style={{
                                                top,
                                                height,
                                                left: `calc(${leftPct}% + 2px)`,
                                                width: `calc(${widthPct}% - 4px)`,
                                                backgroundColor: style.bg,
                                                borderColor: style.border,
                                                color: style.text,
                                            }}
                                            title={`${it.oppAlias || it.oppId} — ${it.task.title}\n${formatBlockTimeRange(effBlock)}${it.task.dueDate ? `\nDue ${it.task.dueDate}` : ''}${warn ? '\n⚠ After due date' : ''}\n(Click: details · Double-click: open)`}
                                        >
                                            <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-tight leading-none">
                                                <span className="truncate flex-1">{it.oppAlias || it.oppId}</span>
                                                {warn && <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-amber-700" />}
                                                <button
                                                    onClick={(e) => handleStartTimer(e, it)}
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onDoubleClick={(e) => e.stopPropagation()}
                                                    className="shrink-0 p-0.5 rounded hover:bg-white/60"
                                                    title="Start timer for this task"
                                                >
                                                    <Play className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                            <div className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-bold leading-tight truncate mt-0.5`}>{it.task.title}</div>
                                            {!compact && (
                                                <div className="text-[9px] font-mono opacity-70 mt-0.5 truncate">{formatBlockTimeRange(effBlock)}</div>
                                            )}
                                            {!compact && it.task.dueDate && (
                                                <div className="text-[8px] opacity-60 truncate">Due {it.task.dueDate}</div>
                                            )}
                                            <div
                                                onPointerDown={(e) => beginResize(e, it)}
                                                className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize bg-transparent hover:bg-black/10 rounded-b"
                                                title="Drag to resize"
                                            />
                                        </div>
                                    );
                                })}

                                {/* Cross-day preview ghost */}
                                {(Object.entries(previewById) as [string, { date: string; startTime: string; endTime: string }][]).map(([blockId, p]) => {
                                    if (p.date !== dateStr) return null;
                                    const it = items.find(x => x.block.id === blockId);
                                    if (!it || it.block.date === dateStr) return null;
                                    const startMin = timeToMinutes(p.startTime) - HOUR_START * 60;
                                    const endMin = timeToMinutes(p.endTime) - HOUR_START * 60;
                                    const top = (Math.max(0, startMin) / SLOT_MIN) * SLOT_HEIGHT;
                                    const height = Math.max(SLOT_HEIGHT, ((Math.min(TOTAL_MIN, endMin) - Math.max(0, startMin)) / SLOT_MIN) * SLOT_HEIGHT);
                                    const style = getPastelBlockStyle(it.oppColor);
                                    return (
                                        <div
                                            key={`ghost-${blockId}`}
                                            className="absolute left-1 right-1 rounded-md border-2 border-dashed px-1.5 py-1 overflow-hidden z-20 pointer-events-none opacity-80"
                                            style={{ top, height, backgroundColor: style.bg, borderColor: style.border, color: style.text }}
                                        >
                                            <div className="text-[9px] font-black uppercase truncate">{it.oppAlias || it.oppId}</div>
                                            <div className="text-[10px] font-bold truncate">{it.task.title}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
