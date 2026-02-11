import React, { useState } from 'react';
import { X, Clock, CheckCircle2, AlertCircle, PlayCircle, PauseCircle } from 'lucide-react';
import { TaskStatus, TASK_STATUS_COLORS } from '../types';

interface StopTimerModalProps {
    isOpen: boolean;
    onClose: () => void;
    taskTitle: string;
    elapsedTime: string;
    onConfirm: (status?: TaskStatus) => void;
}

export const StopTimerModal: React.FC<StopTimerModalProps> = ({ isOpen, onClose, taskTitle, elapsedTime, onConfirm }) => {
    const [selectedStatus, setSelectedStatus] = useState<TaskStatus>('Done');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200 border border-gray-100">
                <div className="p-8 space-y-8">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-[#3DCD58] font-black text-[10px] uppercase tracking-[0.2em]">
                                <Clock className="w-3 h-3" />
                                Timer Summary
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 leading-tight">Stop & Log Activity</h3>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                            <X className="w-6 h-6 text-gray-400" />
                        </button>
                    </div>

                    {/* Stats Card */}
                    <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Task</label>
                            <div className="text-lg font-bold text-gray-800 line-clamp-2">{taskTitle}</div>
                        </div>

                        <div className="pt-4 border-t border-gray-200/50 flex justify-between items-end">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Time Elapsed</label>
                                <div className="text-3xl font-mono font-black text-[#3DCD58]">{elapsedTime}</div>
                            </div>
                        </div>
                    </div>

                    {/* Status Selection */}
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Update Task Status To:</label>
                        <div className="grid grid-cols-2 gap-3">
                            {(Object.keys(TASK_STATUS_COLORS) as TaskStatus[]).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setSelectedStatus(status)}
                                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col gap-2 relative overflow-hidden ${selectedStatus === status
                                            ? 'border-[#3DCD58] bg-[#3DCD58]/5'
                                            : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${selectedStatus === status ? 'text-[#3DCD58]' : 'text-gray-500'
                                            }`}>
                                            {status}
                                        </span>
                                        {selectedStatus === status && <CheckCircle2 className="w-4 h-4 text-[#3DCD58]" />}
                                    </div>
                                    <div className={`w-full h-1.5 rounded-full ${TASK_STATUS_COLORS[status]}`}></div>
                                </button>
                            ))}
                            <button
                                onClick={() => onConfirm(undefined)}
                                className="p-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:bg-gray-50 hover:border-gray-300 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center col-span-2 mt-2"
                            >
                                Stop without updating status
                            </button>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex gap-4 pt-4">
                        <button
                            onClick={onClose}
                            className="flex-1 py-4 px-6 rounded-2xl border-2 border-gray-100 text-gray-500 font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all"
                        >
                            Back
                        </button>
                        <button
                            onClick={() => onConfirm(selectedStatus)}
                            className="flex-[2] py-4 px-6 rounded-2xl bg-gray-900 text-white font-black text-xs uppercase tracking-widest hover:bg-black shadow-xl shadow-gray-200 transition-all flex items-center justify-center gap-2"
                        >
                            Stop & Log Time
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
