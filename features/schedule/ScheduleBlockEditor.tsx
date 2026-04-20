import React, { useState, useMemo } from 'react';
import { X, Clock, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { ExecutionBlock } from '../../types';
import {
    createBlock,
    timeToMinutes,
    minutesToTime,
    snapMinutes,
    MIN_BLOCK_MINUTES,
    isBlockAfterDueDate,
} from './executionBlockUtils';

interface Props {
    initial?: ExecutionBlock | null;
    dueDate?: string;
    onSave: (block: ExecutionBlock) => void;
    onClose: () => void;
}

const todayStr = () => new Date().toLocaleDateString('en-CA');

/**
 * Modal editor for a single ExecutionBlock. Used for both create and edit.
 * Keeps data model unaware of UI by always returning a valid ExecutionBlock.
 */
export const ScheduleBlockEditor: React.FC<Props> = ({ initial, dueDate, onSave, onClose }) => {
    const [date, setDate] = useState<string>(initial?.date || todayStr());
    const [startTime, setStartTime] = useState<string>(initial?.startTime || '09:00');
    const [endTime, setEndTime] = useState<string>(initial?.endTime || '10:00');

    const durationMin = useMemo(() => {
        const s = timeToMinutes(startTime);
        const e = timeToMinutes(endTime);
        return isNaN(s) || isNaN(e) ? 0 : e - s;
    }, [startTime, endTime]);

    const afterDue = useMemo(
        () => dueDate ? isBlockAfterDueDate({ id: '', date, startTime, endTime, createdAt: '' }, dueDate) : false,
        [date, startTime, endTime, dueDate]
    );

    const invalid = durationMin < MIN_BLOCK_MINUTES;

    const handleSave = () => {
        if (invalid) {
            alert(`El bloque debe durar al menos ${MIN_BLOCK_MINUTES} minutos.`);
            return;
        }
        if (initial) {
            // Edit: preserve id and createdAt
            onSave({
                ...initial,
                date,
                startTime: minutesToTime(snapMinutes(timeToMinutes(startTime))),
                endTime: minutesToTime(snapMinutes(timeToMinutes(endTime))),
            });
        } else {
            onSave(createBlock(date, startTime, endTime));
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-[#3DCD58]" />
                        {initial ? 'Edit Block' : 'New Block'}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" /> Date
                        </label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Start</label>
                            <input
                                type="time"
                                step={60 * 15}
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">End</label>
                            <input
                                type="time"
                                step={60 * 15}
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3DCD58] focus:border-[#3DCD58]"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                        <span>Duration</span>
                        <span className={`font-bold ${invalid ? 'text-red-500' : 'text-gray-700'}`}>
                            {invalid ? `< ${MIN_BLOCK_MINUTES} min` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`}
                        </span>
                    </div>
                    {afterDue && (
                        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>This block is scheduled after the task's due date. It's allowed, but may miss the deadline.</span>
                        </div>
                    )}
                </div>
                <div className="flex gap-3 justify-end mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium text-sm">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={invalid}
                        className="px-5 py-2 bg-[#3DCD58] text-white rounded-lg font-bold text-sm shadow-lg hover:bg-[#2db64a] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {initial ? 'Save Changes' : 'Create Block'}
                    </button>
                </div>
            </div>
        </div>
    );
};
