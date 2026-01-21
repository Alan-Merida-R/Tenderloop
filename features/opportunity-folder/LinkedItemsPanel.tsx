
import React, { useState } from 'react';
import { X, FileText, CheckSquare, ChevronRight, ArrowLeft, Calendar, User, Tag, Info } from 'lucide-react';
import { Opportunity, Task, MeetingNote } from '../../types';
import { DocMeta } from '../../services/opportunityDocMetaStore';
import { TASK_STATUS_COLORS } from '../../types';

interface Props {
  opportunity: Opportunity;
  meta: DocMeta | null;
  fileKey: string;
  onClose: () => void;
  onUpdate: (updated: Opportunity) => void;
}

export const LinkedItemsPanel: React.FC<Props> = ({ opportunity, meta, fileKey, onClose, onUpdate }) => {
  const [activeItem, setActiveItem] = useState<{ type: 'task' | 'note'; id: string } | null>(null);

  const linkedTasks = opportunity.tasks.filter(t => meta?.linkedTaskIds?.includes(t.id));
  const linkedNotes = opportunity.notes.filter(n => meta?.linkedNoteIds?.includes(n.id));

  const totalLinks = linkedTasks.length + linkedNotes.length;

  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    const updatedTasks = opportunity.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t);
    onUpdate({ ...opportunity, tasks: updatedTasks });
  };

  const handleUpdateNote = (noteId: string, updates: Partial<MeetingNote>) => {
    const updatedNotes = opportunity.notes.map(n => n.id === noteId ? { ...n, ...updates } : n);
    onUpdate({ ...opportunity, notes: updatedNotes });
  };

  const renderTaskEditor = (task: Task) => (
    <div className="p-6 space-y-6 animate-fade-in">
      <button onClick={() => setActiveItem(null)} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to list
      </button>
      <div className="space-y-4">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Task Title</label>
        <input 
          className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0" 
          value={task.title} 
          onChange={(e) => handleUpdateTask(task.id, { title: e.target.value })} 
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Status</label>
          <select 
            className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 focus:bg-white transition-all outline-none" 
            value={task.status} 
            onChange={(e) => handleUpdateTask(task.id, { status: e.target.value as any })}
          >
            {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Due Date</label>
          <input 
            type="date" 
            className="w-full border-gray-100 bg-gray-50 rounded-xl text-sm font-bold p-3 focus:bg-white transition-all outline-none" 
            value={task.dueDate} 
            onChange={(e) => handleUpdateTask(task.id, { dueDate: e.target.value })} 
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Description</label>
        <textarea 
          className="w-full border-gray-100 bg-gray-50 rounded-2xl text-sm min-h-[150px] p-4 focus:bg-white transition-all focus:ring-0 outline-none resize-none" 
          value={task.description} 
          onChange={(e) => handleUpdateTask(task.id, { description: e.target.value })} 
        />
      </div>
    </div>
  );

  const renderNoteEditor = (note: MeetingNote) => (
    <div className="p-6 space-y-6 animate-fade-in flex flex-col h-full">
      <button onClick={() => setActiveItem(null)} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to list
      </button>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Note Title</label>
        <input 
          className="w-full text-xl font-bold border-b-2 border-gray-100 focus:border-[#3DCD58] transition-all px-1 py-2 focus:ring-0 outline-none" 
          value={note.title} 
          onChange={(e) => handleUpdateNote(note.id, { title: e.target.value })} 
        />
      </div>
      <div className="space-y-2 flex-1 min-h-0">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Content (Read-only view for preview)</label>
        <div 
          className="bg-white border border-gray-100 rounded-2xl p-4 overflow-y-auto h-full prose prose-sm max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: note.content }}
        />
      </div>
      <div className="bg-emerald-50 p-3 rounded-xl flex items-center gap-2 border border-emerald-100">
         <Info className="w-4 h-4 text-emerald-500" />
         <span className="text-[10px] text-emerald-700 font-bold uppercase">To edit full content, use the Notes tab.</span>
      </div>
    </div>
  );

  return (
    <div className="w-[450px] border-l border-gray-100 bg-white flex flex-col shadow-2xl z-[70] animate-slide-in-right">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <LinkIcon className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-black text-gray-800 uppercase tracking-wider text-sm">Linked Items</h3>
            <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{fileKey.split('/').pop()}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!activeItem ? (
          <div className="p-4 space-y-6">
            {totalLinks === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-20">
                <LinkIcon className="w-16 h-16 mb-4" />
                <p className="font-bold uppercase tracking-widest">No linked items</p>
              </div>
            ) : (
              <>
                {linkedTasks.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-2">Linked Tasks ({linkedTasks.length})</h4>
                    <div className="space-y-2">
                      {linkedTasks.map(t => (
                        <div 
                          key={t.id} 
                          onClick={() => setActiveItem({ type: 'task', id: t.id })}
                          className="p-4 rounded-2xl border border-gray-100 bg-white hover:border-[#3DCD58] hover:shadow-lg transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <CheckSquare className="w-4 h-4 text-[#3DCD58]" />
                            <span className="font-bold text-gray-800 text-sm group-hover:text-[#3DCD58] transition-colors">{t.title}</span>
                          </div>
                          <div className="flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase">
                            <span className={`px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[t.status]}`}>{t.status}</span>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {t.dueDate}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {linkedNotes.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-2">Linked Notes ({linkedNotes.length})</h4>
                    <div className="space-y-2">
                      {linkedNotes.map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => setActiveItem({ type: 'note', id: n.id })}
                          className="p-4 rounded-2xl border border-gray-100 bg-white hover:border-[#3DCD58] hover:shadow-lg transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <FileText className="w-4 h-4 text-emerald-600" />
                            <span className="font-bold text-gray-800 text-sm group-hover:text-[#3DCD58] transition-colors">{n.title}</span>
                          </div>
                          <div className="flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase">
                             <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {n.date}
                             </div>
                             {n.type !== 'General' && (
                               <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded border border-emerald-100">{n.type}</span>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          activeItem.type === 'task' 
            ? renderTaskEditor(linkedTasks.find(t => t.id === activeItem.id)!)
            : renderNoteEditor(linkedNotes.find(n => n.id === activeItem.id)!)
        )}
      </div>
    </div>
  );
};

const LinkIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
);
