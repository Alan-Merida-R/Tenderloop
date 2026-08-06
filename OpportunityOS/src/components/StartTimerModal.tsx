import React, { useState, useEffect, useMemo } from 'react';
import { X, Play } from 'lucide-react';
import { Opportunity } from '../types';
import { OpportunitySearchInput } from './OpportunitySearchInput';

interface StartTimerModalProps {
    isOpen: boolean;
    onClose: () => void;
    opportunities: Opportunity[];
    onStart: (taskId: string, oppId: string, taskTitle: string) => void;
}

export const StartTimerModal: React.FC<StartTimerModalProps> = ({ isOpen, onClose, opportunities, onStart }) => {
    const [startTimerData, setStartTimerData] = useState({ oppId: '', taskId: '' });
    const [timerSearch, setTimerSearch] = useState('');
    const [taskSearch, setTaskSearch] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setStartTimerData({ oppId: '', taskId: '' });
            setTimerSearch('');
            setTaskSearch('');
        }
    }, [isOpen]);

    // Keep the timer's opportunity picker aligned with the manual Rank from
    // General. Unranked opportunities retain chronological order.
    const orderedOpportunities = useMemo(() => [...opportunities].sort((a, b) => {
        const aRank = Number(a.priorityOrder);
        const bRank = Number(b.priorityOrder);
        const aHasRank = Number.isFinite(aRank) && aRank > 0;
        const bHasRank = Number.isFinite(bRank) && bRank > 0;
        if (aHasRank || bHasRank) {
            if (aHasRank && bHasRank && aRank !== bRank) return aRank - bRank;
            if (aHasRank !== bHasRank) return aHasRank ? -1 : 1;
        }
        const aDate = a.kpis?.timeline?.receivedAt || a.dates?.requested || a.dates?.expected || '';
        const bDate = b.kpis?.timeline?.receivedAt || b.dates?.requested || b.dates?.expected || '';
        return aDate.localeCompare(bDate) || a.title.localeCompare(b.title);
    }), [opportunities]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-black text-gray-800 flex items-center gap-2"><Play className="w-5 h-5 text-[#3DCD58]" /> Start New Timer</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Opportunity</label>
                        <OpportunitySearchInput
                            opportunities={orderedOpportunities}
                            selectedIds={startTimerData.oppId ? [startTimerData.oppId] : []}
                            onSelect={(id) => {
                                setStartTimerData({ ...startTimerData, oppId: id, taskId: '' });
                                setTimerSearch('');
                                setTaskSearch('');
                            }}
                            onRemove={() => setStartTimerData({ ...startTimerData, oppId: '', taskId: '' })}
                            value={timerSearch}
                            onChange={setTimerSearch}
                        />
                    </div>
                    {startTimerData.oppId && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Filter Tasks</label>
                                <input
                                    type="text"
                                    className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent text-xs"
                                    placeholder="Search by task title..."
                                    value={taskSearch}
                                    onChange={(e) => setTaskSearch(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Task</label>
                                <select
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3DCD58] focus:border-transparent text-sm font-bold bg-gray-50 hover:bg-white transition-colors"
                                    value={startTimerData.taskId}
                                    onChange={(e) => setStartTimerData({ ...startTimerData, taskId: e.target.value })}
                                    size={5}
                                >
                                    <option value="" disabled className="text-gray-400 italic">Select a task...</option>
                                    {opportunities.find(o => o.id === startTimerData.oppId)?.tasks
                                        .filter(t => !taskSearch || t.title.toLowerCase().includes(taskSearch.toLowerCase()))
                                        .map(t => (
                                            <option key={t.id} value={t.id} className="py-1">{t.title}</option>
                                        ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-100 transition-all">Cancel</button>
                    <button
                        onClick={() => {
                            if (startTimerData.oppId && startTimerData.taskId) {
                                const opp = orderedOpportunities.find(o => o.id === startTimerData.oppId);
                                const task = opp?.tasks.find(t => t.id === startTimerData.taskId);
                                if (opp && task) {
                                    onStart(task.id, opp.id, task.title);
                                    onClose();
                                }
                            }
                        }}
                        disabled={!startTimerData.oppId || !startTimerData.taskId}
                        className="flex-1 py-2.5 rounded-xl bg-[#3DCD58] text-white font-bold hover:bg-[#2db64a] shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Start Timer
                    </button>
                </div>
            </div>
        </div>
    );
};
