import React, { useState } from 'react';
import { X, Copy, CheckSquare, Square } from 'lucide-react';
import { Opportunity, TaskStatus, TASK_STATUS_COLORS } from '../types';
import { OpportunitySearchInput } from './OpportunitySearchInput';

interface CopyTasksModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceOpp: Opportunity;
    opportunities: Opportunity[];
    onCopy: (taskIds: string[], targetOppId: string, targetStatus: TaskStatus) => void;
}

export const CopyTasksModal: React.FC<CopyTasksModalProps> = ({ isOpen, onClose, sourceOpp, opportunities, onCopy }) => {
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [targetOppId, setTargetOppId] = useState('');
    const [targetStatus, setTargetStatus] = useState<TaskStatus>('Pending');
    const [searchQuery, setSearchQuery] = useState('');

    if (!isOpen) return null;

    const toggleTask = (id: string) => {
        setSelectedTaskIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
    };

    const toggleAll = () => {
        if (selectedTaskIds.length === sourceOpp.tasks.length) setSelectedTaskIds([]);
        else setSelectedTaskIds(sourceOpp.tasks.map(t => t.id));
    };

    const handleCopy = () => {
        if (selectedTaskIds.length > 0 && targetOppId) {
            onCopy(selectedTaskIds, targetOppId, targetStatus);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-black text-gray-800 flex items-center gap-2"><Copy className="w-5 h-5 text-blue-500" /> Copy Tasks</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Source Tasks */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Tasks to Copy</label>
                            <button onClick={toggleAll} className="text-[10px] font-bold text-blue-500 hover:underline">{selectedTaskIds.length === sourceOpp.tasks.length ? 'Deselect All' : 'Select All'}</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {sourceOpp.tasks.map(task => (
                                <div
                                    key={task.id}
                                    onClick={() => toggleTask(task.id)}
                                    className={`p-3 rounded-xl border text-sm flex items-center gap-3 cursor-pointer transition-all ${selectedTaskIds.includes(task.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}
                                >
                                    {selectedTaskIds.includes(task.id) ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-gray-300" />}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-gray-800 truncate">{task.title}</div>
                                        <div className="text-[10px] text-gray-400 uppercase font-black">{task.owner} | {task.status}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Target Opportunity */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Destination Opportunity</label>
                            <OpportunitySearchInput
                                opportunities={opportunities}
                                selectedIds={targetOppId ? [targetOppId] : []}
                                onSelect={setTargetOppId}
                                onRemove={() => setTargetOppId('')}
                                value={searchQuery}
                                onChange={setSearchQuery}
                                placeholder="Search opportunity..."
                            />
                        </div>

                        {/* Target Status */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Initial Status for Coppies</label>
                            <select
                                className="w-full p-2.5 border border-gray-200 rounded-xl text-sm font-bold bg-gray-50 focus:bg-white transition-all focus:ring-2 focus:ring-blue-500"
                                value={targetStatus}
                                onChange={(e) => setTargetStatus(e.target.value as TaskStatus)}
                            >
                                {Object.keys(TASK_STATUS_COLORS).map(status => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 border-t flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-100 transition-all">Cancel</button>
                    <button
                        onClick={handleCopy}
                        disabled={selectedTaskIds.length === 0 || !targetOppId}
                        className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Copy className="w-4 h-4" /> Copy {selectedTaskIds.length} Tasks
                    </button>
                </div>
            </div>
        </div>
    );
};
