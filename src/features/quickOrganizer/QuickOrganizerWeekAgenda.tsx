import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Trash2 } from 'lucide-react';
import { ParsedScheduleRow } from './responseParser';
import { minutesToTime, snapMinutes } from '../schedule/executionBlockUtils';

interface Props {
    rows: ParsedScheduleRow[];
    onChange: (id: string, patch: Partial<ParsedScheduleRow>) => void;
    onRemove: (id: string) => void;
}

const iso = (date: Date) => date.toLocaleDateString('en-CA');
const mondayOf = (date: Date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() + (result.getDay() === 0 ? -6 : 1 - result.getDay()));
    return result;
};
const toMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };

export const QuickOrganizerWeekAgenda: React.FC<Props> = ({ rows, onChange, onRemove }) => {
    const [anchor, setAnchor] = useState(() => rows[0]?.date ? new Date(`${rows[0].date}T00:00:00`) : new Date());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const weekStart = useMemo(() => mondayOf(anchor), [anchor]);
    const days = useMemo(() => Array.from({ length: 5 }, (_, index) => { const day = new Date(weekStart); day.setDate(day.getDate() + index); return day; }), [weekStart]);
    const selected = rows.find(row => row.id === selectedId);
    const startHour = 8;
    const endHour = 20;
    const hourHeight = 48;
    const shift = (daysToAdd: number) => { const next = new Date(anchor); next.setDate(next.getDate() + daysToAdd); setAnchor(next); };

    return <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
            <div className="flex items-center gap-1"><button onClick={() => shift(-7)} className="p-1.5 hover:bg-gray-800 rounded"><ChevronLeft className="w-4 h-4" /></button><button onClick={() => setAnchor(new Date())} className="px-2 py-1 text-[10px] font-black border border-gray-700 rounded">TODAY</button><button onClick={() => shift(7)} className="p-1.5 hover:bg-gray-800 rounded"><ChevronRight className="w-4 h-4" /></button></div>
            <p className="text-xs font-bold">{weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {days[4].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <span className="text-[10px] text-gray-500">{rows.length} session{rows.length === 1 ? '' : 's'}</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '58px repeat(5,minmax(110px,1fr))' }}>
            <div className="border-r border-gray-800" />
            {days.map(day => <div key={iso(day)} className="text-center py-2 border-r last:border-r-0 border-gray-800 bg-gray-800/50"><p className="text-[9px] font-black text-[#3DCD58]">{day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</p><p className="text-sm font-bold">{day.getDate()}</p></div>)}
        </div>
        <div className="overflow-y-auto max-h-[590px]">
            <div className="grid" style={{ gridTemplateColumns: '58px repeat(5,minmax(110px,1fr))' }}>
                <div>{Array.from({ length: endHour - startHour }, (_, index) => <div key={index} style={{ height: hourHeight }} className="border-r border-b border-gray-800 text-[9px] text-gray-500 text-right pr-2 pt-1">{String(startHour + index).padStart(2, '0')}:00</div>)}</div>
                {days.map(day => { const date = iso(day); return <div key={date} onDragOver={event => { if (event.dataTransfer.types.includes('application/x-tenderloop-ai-block')) event.preventDefault(); }} onDrop={event => { const id = event.dataTransfer.getData('application/x-tenderloop-ai-block'); const row = rows.find(item => item.id === id); if (!row) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const duration = Math.max(15, toMinutes(row.endTime) - toMinutes(row.startTime)); const rawStart = startHour * 60 + ((event.clientY - rect.top) / hourHeight) * 60; const start = Math.max(startHour * 60, Math.min(endHour * 60 - duration, snapMinutes(rawStart))); onChange(row.id, { date, startTime: minutesToTime(start), endTime: minutesToTime(start + duration) }); setSelectedId(row.id); }} className="relative border-r last:border-r-0 border-gray-800" style={{ height: (endHour - startHour) * hourHeight, backgroundImage: 'linear-gradient(to bottom, rgba(55,65,81,.65) 1px, transparent 1px)', backgroundSize: `100% ${hourHeight}px` }}>
                    {rows.filter(row => row.date === date).map(row => { const top = Math.max(0, (toMinutes(row.startTime) - startHour * 60) / 60 * hourHeight); const height = Math.max(24, (toMinutes(row.endTime) - toMinutes(row.startTime)) / 60 * hourHeight); return <button key={row.id} draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-tenderloop-ai-block', row.id); setSelectedId(row.id); }} onClick={() => setSelectedId(row.id)} style={{ top, height }} title="Drag to another day or time" className={`absolute left-1 right-1 rounded-md border px-1.5 py-1 text-left overflow-hidden cursor-grab active:cursor-grabbing ${selectedId === row.id ? 'bg-emerald-500 border-white text-white' : 'bg-emerald-900/80 border-emerald-600 text-emerald-100'}`}><p className="text-[9px] font-black flex items-center gap-0.5"><GripVertical className="w-2.5 h-2.5" />{row.startTime}–{row.endTime}</p><p className="text-[10px] font-bold truncate">{row.taskLabel}</p><p className="text-[8px] opacity-70 truncate">{row.oppLabel}</p></button>; })}
                </div>; })}
            </div>
        </div>
        {selected && <div className="grid grid-cols-[minmax(0,1fr)_130px_90px_90px_32px] gap-2 items-center p-3 border-t border-gray-800 bg-gray-950"><div className="min-w-0"><p className="text-xs font-bold truncate">{selected.taskLabel}</p><p className="text-[10px] text-[#3DCD58] truncate">{selected.oppLabel}</p></div><input type="date" value={selected.date} onChange={event => onChange(selected.id, { date: event.target.value })} className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[10px]" /><input type="time" value={selected.startTime} onChange={event => onChange(selected.id, { startTime: event.target.value })} className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[10px]" /><input type="time" value={selected.endTime} onChange={event => onChange(selected.id, { endTime: event.target.value })} className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[10px]" /><button onClick={() => { onRemove(selected.id); setSelectedId(null); }} className="text-gray-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button></div>}
    </div>;
};
