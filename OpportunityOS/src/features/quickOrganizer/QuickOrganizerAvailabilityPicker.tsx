import React, { useEffect, useMemo, useRef, useState } from 'react';

interface Day { iso: string; weekday: string; dayNum: number; isToday: boolean }
interface Range { start: string; end: string }
interface Props {
    days: Day[];
    rangesByDate: Record<string, Range[]>;
    onToggleDay: (iso: string) => void;
    onChange: (next: Record<string, Range[]>) => void;
    language: 'en' | 'es';
}

const START = 6 * 60;
const END = 24 * 60;
const STEP = 30;
const slots = Array.from({ length: (END - START) / STEP }, (_, index) => START + index * STEP);
const time = (minutes: number) => minutes === 1440 ? '24:00' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const toMinutes = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes; };

const selectedSlots = (ranges: Range[]) => {
    const result = new Set<number>();
    ranges.forEach(range => slots.forEach(slot => { if (slot >= toMinutes(range.start) && slot + STEP <= toMinutes(range.end)) result.add(slot); }));
    return result;
};
const mergeSlots = (values: Set<number>): Range[] => {
    const ordered = [...values].sort((a, b) => a - b);
    const ranges: Range[] = [];
    ordered.forEach(value => {
        const last = ranges.at(-1);
        if (last && toMinutes(last.end) === value) last.end = time(value + STEP);
        else ranges.push({ start: time(value), end: time(value + STEP) });
    });
    return ranges;
};

export const QuickOrganizerAvailabilityPicker: React.FC<Props> = ({ days, rangesByDate, onToggleDay, onChange, language }) => {
    const [paintMode, setPaintMode] = useState<'add' | 'remove' | null>(null);
    useEffect(() => { const stop = () => setPaintMode(null); window.addEventListener('pointerup', stop); return () => window.removeEventListener('pointerup', stop); }, []);
    const slotMap = useMemo(() => new Map(days.map(day => [day.iso, selectedSlots(rangesByDate[day.iso] || [])])), [days, rangesByDate]);
    const liveSlots = useRef(slotMap);
    const liveRanges = useRef(rangesByDate);
    useEffect(() => { liveSlots.current = slotMap; liveRanges.current = rangesByDate; }, [slotMap, rangesByDate]);
    const paint = (iso: string, minute: number, mode: 'add' | 'remove') => {
        if (!(iso in rangesByDate)) return;
        const values = new Set<number>(liveSlots.current.get(iso) || []);
        if (mode === 'add') values.add(minute); else values.delete(minute);
        liveSlots.current = new Map(liveSlots.current).set(iso, values);
        const next = { ...liveRanges.current, [iso]: mergeSlots(values) };
        liveRanges.current = next;
        onChange(next);
    };
    return <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-950 select-none">
        <div className="overflow-x-auto">
            <div className="min-w-[820px]">
                <div className="grid border-b border-gray-700 bg-gray-900" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(88px,1fr))` }}>
                    <div className="border-r border-gray-700 p-2 text-center text-[8px] font-black uppercase text-gray-500">{language === 'es' ? 'Hora' : 'Time'}</div>
                    {days.map(day => { const active = day.iso in rangesByDate; return <button key={day.iso} onClick={() => onToggleDay(day.iso)} className={`border-r border-gray-700 px-2 py-2 text-center last:border-r-0 ${active ? 'bg-emerald-50 text-emerald-800' : 'text-gray-500 hover:bg-gray-800'}`}><p className="text-[9px] font-black uppercase">{day.weekday}</p><p className="text-sm font-black">{day.dayNum}</p><p className="text-[8px] font-bold">{active ? (language === 'es' ? 'ACTIVO' : 'ACTIVE') : (language === 'es' ? 'SELECCIONAR' : 'SELECT')}</p></button>; })}
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                    {slots.map(minute => <div key={minute} className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(88px,1fr))` }}>
                        <div className={`h-6 border-r border-gray-700 pr-2 text-right text-[9px] text-gray-500 ${minute % 60 === 0 ? 'border-t border-t-gray-700 pt-0.5' : ''}`}>{minute % 60 === 0 ? time(minute) : ''}</div>
                        {days.map(day => { const enabled = day.iso in rangesByDate; const selected = slotMap.get(day.iso)?.has(minute) || false; return <button key={day.iso} type="button" disabled={!enabled} onPointerDown={event => { event.preventDefault(); const mode = selected ? 'remove' : 'add'; setPaintMode(mode); paint(day.iso, minute, mode); }} onPointerEnter={() => { if (paintMode) paint(day.iso, minute, paintMode); }} title={`${day.iso} ${time(minute)}–${time(minute + STEP)}`} className={`h-6 border-r border-t last:border-r-0 ${minute % 60 === 0 ? 'border-t-gray-600' : 'border-t-gray-800'} ${!enabled ? 'cursor-not-allowed bg-gray-900/50' : selected ? 'bg-[#3DCD58] hover:bg-[#34b34c]' : 'bg-gray-950 hover:bg-emerald-950/50'}`} />; })}
                    </div>)}
                </div>
            </div>
        </div>
        <div className="flex items-center justify-between border-t border-gray-700 bg-gray-900 px-3 py-2 text-[9px] text-gray-500"><span>{language === 'es' ? 'Arrastra para pintar o quitar bloques de 30 minutos.' : 'Drag to paint or remove 30-minute blocks.'}</span><span className="font-bold">06:00–24:00</span></div>
    </div>;
};
