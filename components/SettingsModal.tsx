
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, GripVertical, CheckSquare, FileText, ChevronUp, ChevronDown, RotateCcw, ArrowUpDown, Lock, Calendar, Settings, User, Search, Tag } from 'lucide-react';
import { TaskStatus, TaskPriority, TaskOwner, TASK_STATUS_COLORS, PRIORITY_COLORS, OpportunityLabel } from '../types';
import { MEETING_TEMPLATES } from './MeetingTemplates';
import { STANDARD_TASKS } from './StandardTasks';

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  owner: TaskOwner;
  order: number | null;
  dependsOnTaskIds: string[];
  blockDoneUntilDependenciesDone: boolean;
  dueDateOffset?: number;
  subtasks?: { id: string; title: string; completed: boolean }[];
  externalAreas?: string[];
  calendarized?: boolean;
}

export interface NoteTemplate {
  id: string;
  title: string;
  content: string;
  autoCreate: boolean;
}

export interface AppSettings {
  defaultTasks: TaskTemplate[];
  noteTemplates: NoteTemplate[];
  holidays?: string[]; // ISO date strings YYYY-MM-DD
  trackedAreas?: string[]; // New: Areas for KPIs
  taskStandardTemplate?: import('../types').TaskStandardTemplate | null;
  globalLabels?: OpportunityLabel[];
}
export const DEFAULT_TRACKED_AREAS = [
  "Tendering", "Sales CSE", "TSC", "Manager", "Supply Chain", "Delivery", "Engineering of Site"
];


export const DEFAULT_SETTINGS: AppSettings = {
  defaultTasks: STANDARD_TASKS.map((t) => ({
    id: crypto.randomUUID(),
    title: t.title || 'New Task',
    description: t.description || '',
    status: t.status || 'Pending',
    priority: t.priority || 'Medium',
    owner: t.owner || 'Me',
    order: t.order || 0,
    dependsOnTaskIds: t.dependsOnTaskIds || [],
    blockDoneUntilDependenciesDone: t.blockDoneUntilDependenciesDone || false,
    subtasks: t.subtasks || [],
    externalAreas: t.externalAreas || [],
    calendarized: t.calendarized || false
  })),
  noteTemplates: Object.entries(MEETING_TEMPLATES).map(([key, content]) => ({
    id: crypto.randomUUID(),
    title: key.charAt(0).toUpperCase() + key.slice(1),
    content: content,
    autoCreate: false
  })),
  holidays: [],
  trackedAreas: DEFAULT_TRACKED_AREAS,
  taskStandardTemplate: null,
  globalLabels: [
    { id: '1', text: 'Urgent', color: '#ef4444' }, // Red
    { id: '2', text: 'Strategic', color: '#8b5cf6' }, // Violet
    { id: '3', text: 'Low Hanging Fruit', color: '#10b981' }, // Emerald
    { id: '4', text: 'Complex', color: '#f59e0b' }, // Amber
  ]
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  initialSettings: AppSettings;
  opportunities: import('../types').Opportunity[];
}

export const SimpleMultiSelect = ({ options, selected, onChange, placeholder }: { options: { id: string, label: string }[], selected: string[], onChange: (val: string[]) => void, placeholder: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  return (
    <div className="relative">
      <button onClick={() => { setIsOpen(!isOpen); setSearchTerm(''); }} className="w-full text-left text-[10px] bg-white border border-gray-200 rounded p-1.5 flex justify-between items-center text-gray-600 shadow-sm hover:bg-gray-50 min-h-[28px]">
        <span className="truncate">{selected.length ? `${selected.length} selected` : placeholder}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 w-64 mt-1 bg-white border border-gray-200 shadow-lg z-20 max-h-60 overflow-y-auto rounded-lg p-1 flex flex-col">
            <div className="p-1 sticky top-0 bg-white border-b border-gray-100 z-30 mb-1">
              <div className="relative">
                <Search className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full pl-6 pr-2 py-1 text-[10px] border border-gray-200 rounded focus:border-[#3DCD58] focus:ring-0"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            {options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? <div className="text-[10px] p-2 text-gray-400">No matches found</div> :
              options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase())).map(opt => (
                <div key={opt.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer rounded shrink-0" onClick={() => {
                  if (selected.includes(opt.id)) onChange(selected.filter(s => s !== opt.id));
                  else onChange([...selected, opt.id]);
                }}>
                  <div className={`w-3 h-3 border rounded flex items-center justify-center ${selected.includes(opt.id) ? 'bg-[#3DCD58] border-[#3DCD58]' : 'border-gray-300'}`}>
                    {selected.includes(opt.id) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <span className="text-[10px] truncate">{opt.label}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
};

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialSettings, opportunities }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'tasks' | 'notes' | 'labels'>('general');
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [holidaysText, setHolidaysText] = useState('');
  const [trackedAreasText, setTrackedAreasText] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateMsg, setTemplateMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  // Reset internal state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSettings(initialSettings);
      setHolidaysText((initialSettings.holidays || []).join('\n'));
      setTrackedAreasText((initialSettings.trackedAreas || DEFAULT_TRACKED_AREAS).join('\n'));
    }
  }, [isOpen, initialSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    const holidays = holidaysText.split('\n').map(l => l.trim()).filter(l => /^\d{4}-\d{2}-\d{2}$/.test(l));
    const trackedAreas = trackedAreasText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    onSave({ ...settings, holidays, trackedAreas });
    onClose();
  };

  const handleTaskChange = (id: string, field: keyof TaskTemplate, value: any) => {
    setSettings(prev => ({
      ...prev,
      defaultTasks: prev.defaultTasks.map(t => t.id === id ? { ...t, [field]: value } : t)
    }));
  };

  const addTask = () => {
    setSettings(prev => {
      const maxOrder = prev.defaultTasks.reduce((max, t) => Math.max(max, t.order || 0), 0);
      return {
        ...prev,
        defaultTasks: [...prev.defaultTasks, {
          id: crypto.randomUUID(),
          title: 'New Task',
          status: 'Pending',
          priority: 'Medium',
          owner: 'Me',
          order: maxOrder + 1,
          dependsOnTaskIds: [],
          blockDoneUntilDependenciesDone: false
        }]
      };
    });
  };

  const removeTask = (id: string) => {
    setSettings(prev => ({
      ...prev,
      defaultTasks: prev.defaultTasks.filter(t => t.id !== id)
    }));
  };

  const moveTask = (index: number, direction: 'up' | 'down') => {
    const newTasks = [...settings.defaultTasks];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < newTasks.length) {
      [newTasks[index], newTasks[newIndex]] = [newTasks[newIndex], newTasks[index]];
      setSettings(prev => ({ ...prev, defaultTasks: newTasks }));
    }
  };

  const sortByOrder = () => {
    setSettings(prev => ({
      ...prev,
      defaultTasks: [...prev.defaultTasks].sort((a, b) => (a.order || 0) - (b.order || 0))
    }));
  };

  const handleNoteChange = (id: string, field: keyof NoteTemplate, value: any) => {
    setSettings(prev => ({
      ...prev,
      noteTemplates: prev.noteTemplates.map(n => n.id === id ? { ...n, [field]: value } : n)
    }));
  };

  const addNote = () => {
    setSettings(prev => ({
      ...prev,
      noteTemplates: [...prev.noteTemplates, { id: crypto.randomUUID(), title: 'New Template', content: '<p>Content...</p>', autoCreate: false }]
    }));
  };

  const removeNote = (id: string) => {
    setSettings(prev => ({
      ...prev,
      noteTemplates: prev.noteTemplates.filter(n => n.id !== id)
    }));
  };

  const resetDefaults = () => {
    if (confirm("Reset all settings to system defaults?")) {
      setSettings(DEFAULT_SETTINGS);
      setHolidaysText('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Settings</h2>
            <p className="text-sm text-gray-500">Configure defaults for new opportunities</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 bg-white overflow-x-auto">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'general' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Settings className="w-4 h-4" /> General
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'tasks' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <CheckSquare className="w-4 h-4" /> Default Tasks
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'notes' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <FileText className="w-4 h-4" /> Note Templates
          </button>
          <button
            onClick={() => setActiveTab('labels')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'labels' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Tag className="w-4 h-4" /> Labels
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">

          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> Holidays</h3>
                <p className="text-xs text-gray-500 mb-2">
                  Define non-working days (Company Holidays) for business day calculations. Weekends are automatically excluded.
                  Enter dates in <b>YYYY-MM-DD</b> format, one per line.
                </p>
                <textarea
                  value={holidaysText}
                  onChange={(e) => setHolidaysText(e.target.value)}
                  className="w-full h-48 border-gray-200 rounded-lg text-sm font-mono p-3 focus:border-[#3DCD58] focus:ring-0"
                  placeholder="2025-01-01&#10;2025-12-25"
                />
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Tracked Areas (KPIs)</h3>
                <p className="text-xs text-gray-500 mb-2">
                  Define the teams or areas involved in the tendering process. Tendering is the default area. One per line.
                </p>
                <textarea
                  value={trackedAreasText}
                  onChange={(e) => setTrackedAreasText(e.target.value)}
                  className="w-full h-32 border-gray-200 rounded-lg text-sm p-3 focus:border-[#3DCD58] focus:ring-0"
                  placeholder="Tendering&#10;Sales CSE&#10;TSC"
                />
              </div>

              {/* TASK STANDARD TEMPLATE */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-blue-500" /> Task Standard Template
                  </h3>
                  {settings.taskStandardTemplate && (
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, taskStandardTemplate: null }))}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Clear standard template
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Select an existing opportunity to use its tasks (including subtasks and dependencies) as the default template for new opportunities.
                </p>

                {settings.taskStandardTemplate ? (
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-blue-200 shadow-sm text-blue-500 font-bold">
                        {settings.taskStandardTemplate.tasks.length}
                      </div>
                      <div>
                        <p className="text-xs font-black text-blue-900 uppercase">Standard Active</p>
                        <p className="text-[10px] text-blue-700 font-bold">Source: {settings.taskStandardTemplate.sourceOpportunityName} ({settings.taskStandardTemplate.sourceOpportunityId})</p>
                        <p className="text-[10px] text-blue-400">Created: {new Date(settings.taskStandardTemplate.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSettings(prev => ({ ...prev, taskStandardTemplate: null }))}
                        className="bg-white text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-gray-50 transition-all shadow-sm"
                      >
                        Change Template
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search opportunity by name or ID..."
                          className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:ring-0"
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    {templateSearch.length >= 2 && (
                      <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl bg-white divide-y divide-gray-50 shadow-sm">
                        {opportunities
                          .filter(o => o.title.toLowerCase().includes(templateSearch.toLowerCase()) || o.id.toLowerCase().includes(templateSearch.toLowerCase()))
                          .slice(0, 5)
                          .map(opp => (
                            <div
                              key={opp.id}
                              className="p-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group transition-colors"
                              onClick={() => {
                                if (!opp.tasks || opp.tasks.length === 0) {
                                  setTemplateMsg({ text: "Selected opportunity has no tasks.", type: 'error' });
                                  return;
                                }
                                // Create snapshot
                                const snapshot = {
                                  sourceOpportunityId: opp.id,
                                  sourceOpportunityName: opp.title,
                                  createdAt: new Date().toISOString(),
                                  tasks: JSON.parse(JSON.stringify(opp.tasks)) // Clean copy
                                };
                                setSettings(prev => ({ ...prev, taskStandardTemplate: snapshot }));
                                setTemplateSearch('');
                                setTemplateMsg({ text: "Standard template updated successfully!", type: 'success' });
                                setTimeout(() => setTemplateMsg(null), 3000);
                              }}
                            >
                              <div>
                                <p className="text-xs font-bold text-gray-800 group-hover:text-blue-700">{opp.title}</p>
                                <p className="text-[10px] font-mono text-gray-400">{opp.id} • {opp.tasks.length} tasks</p>
                              </div>
                              <button className="text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">USE AS STANDARD</button>
                            </div>
                          ))}
                      </div>
                    )}

                    {templateMsg && (
                      <p className={`text-[10px] font-bold ${templateMsg.type === 'error' ? 'text-red-500' : 'text-emerald-500'} animate-fade-in`}>
                        {templateMsg.text}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                <p className="text-xs text-blue-700">These tasks will be automatically created for every <b>new</b> opportunity. Order duplicates are allowed.</p>
                <div className="flex gap-2">
                  <button title="Sort by Due Date (Not available for templates)" disabled className="flex items-center gap-1 bg-white border border-gray-200 text-gray-300 px-2 py-1 rounded text-[10px] font-bold shadow-sm cursor-not-allowed">
                    <Calendar className="w-3 h-3" /> Sort by due date
                  </button>
                  <button onClick={sortByOrder} className="flex items-center gap-1 bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded text-[10px] font-bold shadow-sm hover:bg-blue-50">
                    <ArrowUpDown className="w-3 h-3" /> Sort by order
                  </button>
                </div>
              </div>

              {settings.defaultTasks.map((task, index) => (
                <div key={task.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-2 group">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1 text-gray-300">
                      <button onClick={() => moveTask(index, 'up')} disabled={index === 0} className="hover:text-gray-500 disabled:opacity-0"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveTask(index, 'down')} disabled={index === settings.defaultTasks.length - 1} className="hover:text-gray-500 disabled:opacity-0"><ChevronDown className="w-4 h-4" /></button>
                    </div>

                    <div className="flex-1 grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Order</label>
                        <input type="number" className="w-full text-sm font-bold text-center border border-gray-200 rounded p-1.5 focus:border-[#3DCD58] focus:ring-0" value={task.order || 0} onChange={e => handleTaskChange(task.id, 'order', parseInt(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Title</label>
                        <input className="w-full text-sm font-medium border border-gray-200 rounded p-1.5 focus:border-[#3DCD58] focus:ring-0" value={task.title} onChange={e => handleTaskChange(task.id, 'title', e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Status</label>
                        <select className="w-full text-xs border border-gray-200 rounded p-1.5" value={task.status} onChange={e => handleTaskChange(task.id, 'status', e.target.value)}>
                          {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Priority</label>
                        <select className="w-full text-xs border border-gray-200 rounded p-1.5" value={task.priority} onChange={e => handleTaskChange(task.id, 'priority', e.target.value)}>
                          {Object.keys(PRIORITY_COLORS).map(p => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Owner</label>
                        <select className="w-full text-xs border border-gray-200 rounded p-1.5" value={task.owner} onChange={e => handleTaskChange(task.id, 'owner', e.target.value)}>
                          <option>Me</option>
                          <option>External Area</option>
                        </select>
                      </div>
                    </div>

                    <button onClick={() => removeTask(task.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>

                  {/* Row 2: Dependencies and Locking */}
                  <div className="flex items-center gap-4 pl-8 border-t border-gray-50 pt-2">
                    <div className="flex-1 max-w-sm">
                      <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Depends on</label>
                      <SimpleMultiSelect
                        placeholder="Select dependencies..."
                        options={settings.defaultTasks.filter(t => t.id !== task.id).map(t => ({ id: t.id, label: `${t.order ? `[${t.order}] ` : ''}${t.title}` }))}
                        selected={task.dependsOnTaskIds || []}
                        onChange={(val) => handleTaskChange(task.id, 'dependsOnTaskIds', val)}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-4 bg-gray-50 px-3 py-1.5 rounded border border-gray-100">
                      <input
                        type="checkbox"
                        id={`lock-${task.id}`}
                        checked={task.blockDoneUntilDependenciesDone || false}
                        onChange={e => handleTaskChange(task.id, 'blockDoneUntilDependenciesDone', e.target.checked)}
                        className="rounded text-[#3DCD58] focus:ring-[#3DCD58]"
                      />
                      <label htmlFor={`lock-${task.id}`} className="text-[10px] font-bold text-gray-600 uppercase select-none cursor-pointer flex items-center gap-1">
                        <Lock className="w-3 h-3 text-gray-400" />
                        Block Done until dependencies are done
                      </label>
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={addTask} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold hover:border-[#3DCD58] hover:text-[#3DCD58] transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Task Template
              </button>
            </div>
          )}

          {/* NOTES TAB */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-700 mb-4">
                Define templates available in the "Add Note" menu. Enable <b>Auto-Create</b> to automatically insert a note with this content into every <b>new</b> opportunity.
              </div>

              {settings.noteTemplates.map(note => (
                <div key={note.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3 relative group">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Template Title</label>
                      <input className="w-full font-bold text-gray-800 border-b border-gray-200 focus:border-[#3DCD58] focus:ring-0 py-1" value={note.title} onChange={e => handleNoteChange(note.id, 'title', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded border border-gray-100">
                      <input type="checkbox" id={`auto-${note.id}`} checked={note.autoCreate} onChange={e => handleNoteChange(note.id, 'autoCreate', e.target.checked)} className="rounded text-[#3DCD58] focus:ring-[#3DCD58]" />
                      <label htmlFor={`auto-${note.id}`} className="text-xs font-medium text-gray-600 select-none cursor-pointer">Auto-Create on New Opp</label>
                    </div>
                    <button onClick={() => removeNote(note.id)} className="p-2 text-gray-300 hover:text-red-500 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase">Default Content (HTML)</label>
                    <textarea
                      className="w-full text-xs font-mono text-gray-600 border border-gray-200 rounded p-2 h-24 focus:border-[#3DCD58] focus:ring-0"
                      value={note.content}
                      onChange={e => handleNoteChange(note.id, 'content', e.target.value)}
                      placeholder="<p>HTML Content...</p>"
                    />
                  </div>
                </div>
              ))}

              <button onClick={addNote} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold hover:border-[#3DCD58] hover:text-[#3DCD58] transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Note Template
              </button>
            </div>
          )}

          {/* LABELS TAB */}
          {activeTab === 'labels' && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2"><Tag className="w-4 h-4" /> Global Labels</h3>
                    <p className="text-xs text-gray-500">Define standardized labels for opportunities. These can be selected in any opportunity.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(settings.globalLabels || []).map((label, idx) => (
                    <div key={label.id} className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg hover:bg-gray-50">
                      <input
                        type="color"
                        value={label.color}
                        onChange={(e) => {
                          const newLabels = [...(settings.globalLabels || [])];
                          newLabels[idx] = { ...label, color: e.target.value };
                          setSettings({ ...settings, globalLabels: newLabels });
                        }}
                        className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={label.text}
                        onChange={(e) => {
                          const newLabels = [...(settings.globalLabels || [])];
                          newLabels[idx] = { ...label, text: e.target.value };
                          setSettings({ ...settings, globalLabels: newLabels });
                        }}
                        className="flex-1 text-sm font-bold text-gray-700 border border-gray-200 rounded p-1.5 focus:border-[#3DCD58] focus:ring-0"
                        placeholder="Label Name"
                      />
                      <button
                        onClick={() => {
                          const newLabels = (settings.globalLabels || []).filter(l => l.id !== label.id);
                          setSettings({ ...settings, globalLabels: newLabels });
                        }}
                        className="p-2 text-gray-300 hover:text-red-500 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    const newLabel: OpportunityLabel = { id: crypto.randomUUID(), text: 'New Label', color: '#94a3b8' };
                    setSettings({ ...settings, globalLabels: [...(settings.globalLabels || []), newLabel] });
                  }}
                  className="w-full mt-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold hover:border-[#3DCD58] hover:text-[#3DCD58] transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Label
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-white flex justify-between items-center">
          <button onClick={resetDefaults} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-600">
            <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-8 py-2.5 bg-[#3DCD58] hover:bg-[#2db64a] text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
