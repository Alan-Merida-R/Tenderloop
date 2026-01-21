
import React, { useState, useMemo, useRef, useEffect } from 'react';
/* Added Subtask to imports */
import { Opportunity, ProcessStage, STAGE_COLORS, TaskStatus, TASK_STATUS_COLORS, Task, Subtask, TaskPriority, PRIORITY_COLORS, STATUS_COLORS, OpportunityStatus, TaskOwner, KPIs } from '../types';
import { LayoutGrid, Table as TableIcon, Search, Calendar as CalendarIcon, Filter, Plus, CheckSquare, List, ChevronDown, ChevronRight, User, Download, Clock, X, Grid, Briefcase, ArrowRight, DollarSign, Trophy, Trash2, Edit2, MoreHorizontal, Layers, Copy, Link as LinkIcon, Upload, FileText, Columns, Unlink, Lock, ListChecks, Target, TrendingUp, BarChart3 } from 'lucide-react';
import { LinkedDocsList } from '../features/doc-links/LinkedDocsList';
import { DocumentPickerModal } from '../features/doc-links/DocumentPickerModal';
import { saveMeta, listLinkedForTask } from '../services/opportunityDocMetaStore';
import { CalendarView } from './CalendarView';
import { exportOpportunity, importOpportunity, downloadJSON } from '../services/opportunityExportImport';
import { RichTextEditor } from './OpportunityDetail';
import { countBusinessDays, countCalendarDays } from '../services/dateUtils';

interface Props {
  mode: 'proposals' | 'tasks' | 'general';
  opportunities: Opportunity[];
  onSelect: (id: string) => void;
  onCreate: (stage?: ProcessStage) => void;
  onStageChange: (id: string, newStage: ProcessStage) => void;
  onDateChange: (id: string, type: 'expected' | 'dueDate', newDate: string) => void;
  onOppUpdate: (updated: Opportunity) => void;
  onTaskUpdate: (oppId: string, taskId: string, updates: Partial<Task>) => void;
  holidays?: string[];
}

// Multi-select component
const MultiSelectDropdown = ({ options, selected, onChange, label }: { options: string[], selected: string[], onChange: (val: string[]) => void, label: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 shadow-sm hover:bg-gray-50 whitespace-nowrap"
            >
                <Filter className="w-4 h-4 text-gray-400" />
                {selected.length === 0 ? label : `${selected.length} selected`}
                <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto p-2">
                        {options.map(opt => (
                            <label key={opt} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={selected.includes(opt)}
                                    onChange={() => {
                                        if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
                                        else onChange([...selected, opt]);
                                    }}
                                    className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                                />
                                <span className="text-sm text-gray-700 truncate">{opt}</span>
                            </label>
                        ))}
                        {selected.length > 0 && (
                            <button 
                                onClick={() => { onChange([]); setIsOpen(false); }}
                                className="w-full text-center text-xs text-red-500 hover:text-red-700 mt-2 py-1 border-t border-gray-100"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

const Dashboard: React.FC<Props> = ({ mode, opportunities, onSelect, onCreate, onStageChange, onDateChange, onOppUpdate, onTaskUpdate, holidays = [] }) => {
  const [viewMode, setViewMode] = useState<'board' | 'table' | 'calendar'>('board');
  const [filterText, setFilterText] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [dateFilterStart, setDateFilterStart] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');
  
  // KPI Filter State
  const [kpiSoldFilter, setKpiSoldFilter] = useState<'all' | 'sold' | 'not-sold'>('all');

  // Task specific filters with persistence
  const taskFilterKey = 'generalTasksFilters';
  const [taskStatusFilters, setTaskStatusFilters] = useState<string[]>([]);
  const [taskPriorityFilters, setTaskPriorityFilters] = useState<string[]>([]);
  const [taskOppFilters, setTaskOppFilters] = useState<string[]>([]);
  const [taskAreaFilters, setTaskAreaFilters] = useState<string[]>([]);
  const [taskGroupBy, setTaskGroupBy] = useState<'status' | 'area' | 'priority'>('status');
  
  // Next Steps Toggle
  const [showNextSteps, setShowNextSteps] = useState(false);

  // Add Task Modal State
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [newTaskData, setNewTaskData] = useState({ oppId: '', title: '' });

  // Load persistent filters
  useEffect(() => {
      try {
          const saved = localStorage.getItem(taskFilterKey);
          if (saved) {
              const parsed = JSON.parse(saved);
              if(parsed.status) setTaskStatusFilters(parsed.status);
              if(parsed.priority) setTaskPriorityFilters(parsed.priority);
              if(parsed.opp) setTaskOppFilters(parsed.opp);
              if(parsed.area) setTaskAreaFilters(parsed.area);
              if(parsed.groupBy) setTaskGroupBy(parsed.groupBy);
          }
      } catch (e) {}
  }, []);

  // Save persistent filters
  useEffect(() => {
      const state = {
          status: taskStatusFilters,
          priority: taskPriorityFilters,
          opp: taskOppFilters,
          area: taskAreaFilters,
          groupBy: taskGroupBy
      };
      localStorage.setItem(taskFilterKey, JSON.stringify(state));
  }, [taskStatusFilters, taskPriorityFilters, taskOppFilters, taskAreaFilters, taskGroupBy]);
  
  // Kanban Grouping State
  const [kanbanGroupBy, setKanbanGroupBy] = useState<'status' | 'stage'>('status');
  
  const [selectedTask, setSelectedTask] = useState<{task: Task, oppId: string} | null>(null);
  const [showDocPicker, setShowDocPicker] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [splitViewNoteId, setSplitViewNoteId] = useState<string | null>(null);
  
  // Bulk selection state for export
  const [selectedForExport, setSelectedForExport] = useState<string[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);

  // --- Calculations ---
  const getBadgeInfo = (opp: Opportunity) => {
    const status = opp.statusLabel;
    
    // A) Active states: Check Due Date (Business Days)
    if (status === 'In Progress' || status === 'On Hold') {
        if (!opp.dates.expected) return null;
        
        const todayStr = new Date().toISOString().split('T')[0];
        
        // Calculate business days between today and expected
        // If expected > today: Positive business days left (exclusive start, inclusive end logic in util roughly matches)
        // If expected < today: Negative business days overdue
        const diffDays = countBusinessDays(todayStr, opp.dates.expected, holidays);
        
        if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, color: 'bg-red-500 text-white' };
        if (diffDays === 0) return { text: 'Due today', color: 'bg-orange-500 text-white' };
        return { text: `${diffDays}d left`, color: 'bg-gray-800 text-white' };
    }
    
    // B) Delivered states: Check Duration (Calendar Days)
    if (['Submitted', 'Won', 'Lost'].includes(status)) {
        const received = opp.kpis?.timeline?.receivedAt;
        const delivered = opp.kpis?.timeline?.deliveredAt;
        
        if (received && delivered) {
            const days = countCalendarDays(received, delivered);
            // Ensure non-negative display if dates are messed up
            const displayDays = Math.max(0, days);
            return { text: `${displayDays}d to deliver`, color: 'bg-blue-50 text-blue-600' };
        }
    }
    
    return null;
  };

  const calculateProgress = (stage: ProcessStage) => {
    const stageNum = parseInt(stage.split('.')[0]) || 1;
    return Math.round((stageNum / 9) * 100);
  };

  const getSellPrice = (opp: Opportunity) => {
      if (opp.commercial.cqaOfficialSellPrice > 0) return opp.commercial.cqaOfficialSellPrice;
      return (opp.commercial.swHw?.sellPrice || 0) + (opp.commercial.services?.sellPrice || 0) + (opp.commercial.resale?.sellPrice || 0);
  };

  // --- Filter Logic (Moved up to prevent use-before-declaration error) ---
  const filteredOpps = useMemo(() => {
    return opportunities.filter(opp => {
      const matchesText = 
        opp.title.toLowerCase().includes(filterText.toLowerCase()) || 
        opp.id.toLowerCase().includes(filterText.toLowerCase()) ||
        opp.customer.toLowerCase().includes(filterText.toLowerCase());
      
      let matchesStatus = true;
      if (statusFilters.length > 0) {
          const isStageFilter = Object.keys(STAGE_COLORS).some(s => statusFilters.includes(s));
          if (isStageFilter) {
               matchesStatus = statusFilters.includes(opp.stage);
          } else {
               matchesStatus = statusFilters.includes(opp.statusLabel);
          }
      }
      
      let matchesDate = true;
      if (dateFilterStart || dateFilterEnd) {
         const dateToCheck = opp.dates.expected;
         if (dateFilterStart && dateToCheck < dateFilterStart) matchesDate = false;
         if (dateFilterEnd && dateToCheck > dateFilterEnd) matchesDate = false;
      }
      
      return matchesText && matchesStatus && matchesDate;
    });
  }, [opportunities, filterText, statusFilters, dateFilterStart, dateFilterEnd]);

  // --- KPI Aggregation Logic ---
  const kpiData = useMemo(() => {
      // 1. Filter opportunities based on dashboard filters AND specific KPI filter
      const targetOpps = filteredOpps.filter(opp => {
          if (kpiSoldFilter === 'all') return true;
          if (kpiSoldFilter === 'sold') return opp.kpis?.sold === true;
          if (kpiSoldFilter === 'not-sold') return opp.kpis?.sold === false;
          return true;
      });

      const count = targetOpps.length;
      if (count === 0) return null;

      // 2. Aggregate
      const sumLang = targetOpps.reduce((sum, o) => sum + (o.kpis?.languageSkill || 0), 0);
      const sumTech = targetOpps.reduce((sum, o) => sum + (o.kpis?.technicalUnderstanding || 0), 0);
      const sumDeal = targetOpps.reduce((sum, o) => sum + (o.kpis?.dealProbability || 0), 0);
      const sumAmount = targetOpps.reduce((sum, o) => sum + (o.kpis?.proposalAmountUSD || 0), 0);
      
      const validLangCount = targetOpps.filter(o => o.kpis?.languageSkill !== null).length;
      const validTechCount = targetOpps.filter(o => o.kpis?.technicalUnderstanding !== null).length;
      const validDealCount = targetOpps.filter(o => o.kpis?.dealProbability !== null).length;

      const soldCount = targetOpps.filter(o => o.kpis?.sold === true).length;
      const totalSoldStatus = targetOpps.filter(o => o.kpis?.sold !== null).length;

      // Timelines
      let sumDeliveryDays = 0;
      let validDeliveryCount = 0;
      let sumWorkDays = 0;
      let validWorkCount = 0;

      targetOpps.forEach(o => {
          if (o.kpis?.timeline.receivedAt && o.kpis?.timeline.deliveredAt) {
              const start = new Date(o.kpis.timeline.receivedAt).getTime();
              const end = new Date(o.kpis.timeline.deliveredAt).getTime();
              const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
              if (days >= 0) {
                  sumDeliveryDays += days;
                  validDeliveryCount++;
              }
          }
          if (o.kpis?.execution.myWorkDays !== null) {
              sumWorkDays += (o.kpis?.execution.myWorkDays || 0);
              validWorkCount++;
          }
      });

      return {
          avgLang: validLangCount ? (sumLang / validLangCount).toFixed(1) : '-',
          avgTech: validTechCount ? (sumTech / validTechCount).toFixed(1) : '-',
          avgDeal: validDealCount ? (sumDeal / validDealCount).toFixed(1) : '-',
          winRate: totalSoldStatus ? ((soldCount / totalSoldStatus) * 100).toFixed(1) : '-',
          avgAmount: count ? (sumAmount / count).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-',
          avgDeliveryDays: validDeliveryCount ? (sumDeliveryDays / validDeliveryCount).toFixed(1) : '-',
          avgWorkDays: validWorkCount ? (sumWorkDays / validWorkCount).toFixed(1) : '-',
          totalOpps: count
      };
  }, [filteredOpps, kpiSoldFilter]);

  // --- Helper: Validate Task Completion ---
  const validateTaskCompletion = (oppId: string, taskId: string, newStatus: TaskStatus): boolean => {
      if (newStatus !== 'Done') return true;
      
      const opp = opportunities.find(o => o.id === oppId);
      if (!opp) return true;
      
      const task = opp.tasks.find(t => t.id === taskId);
      if (!task || !task.blockDoneUntilDependenciesDone || !task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) return true;

      const pendingDeps = opp.tasks.filter(t => task.dependsOnTaskIds!.includes(t.id) && t.status !== 'Done');
      
      if (pendingDeps.length > 0) {
          alert("This task is blocked until its dependencies are completed.");
          return false;
      }
      return true;
  };

  const handleTaskStatusChange = (oppId: string, taskId: string, newStatus: TaskStatus) => {
      if (validateTaskCompletion(oppId, taskId, newStatus)) {
          onTaskUpdate(oppId, taskId, { status: newStatus });
      }
  };

  // Dynamic Opportunity Options for filter
  const oppFilterOptions = useMemo(() => {
    return filteredOpps.map(o => o.id);
  }, [filteredOpps]);

  // Derived Tasks for Task View
  const filteredTasks = useMemo(() => {
      let tasks = filteredOpps.flatMap(opp => opp.tasks.map(t => ({...t, opp})));
      
      if (taskOppFilters.length > 0) {
        tasks = tasks.filter(t => taskOppFilters.includes(t.opp.id));
      }
      if (taskStatusFilters.length > 0) {
          tasks = tasks.filter(t => taskStatusFilters.includes(t.status));
      }
      if (taskPriorityFilters.length > 0) {
          tasks = tasks.filter(t => taskPriorityFilters.includes(t.priority));
      }
      if (taskAreaFilters.length > 0) {
          tasks = tasks.filter(t => {
              if (t.owner === 'Me' && taskAreaFilters.includes('Internal')) return true;
              return t.externalAreas && t.externalAreas.some(area => taskAreaFilters.includes(area));
          });
      }
      return tasks;
  }, [filteredOpps, taskStatusFilters, taskPriorityFilters, taskAreaFilters, taskOppFilters]);

  // --- Next Steps Logic ---
  const nextStepsData = useMemo(() => {
      const today = new Date().toISOString().split('T')[0];
      const overdue: any[] = [];
      const dueToday: any[] = [];
      const noDate: any[] = [];

      filteredTasks.forEach(task => {
          if (task.status === 'Done' || task.status === 'Canceled') return;

          if (!task.dueDate) {
              noDate.push(task);
          } else if (task.dueDate < today) {
              overdue.push(task);
          } else if (task.dueDate === today) {
              dueToday.push(task);
          }
      });

      return { overdue, dueToday, noDate };
  }, [filteredTasks]);

  const kpiTotalAmount = useMemo(() => {
      return filteredOpps.reduce((sum, opp) => sum + getSellPrice(opp), 0);
  }, [filteredOpps]);

  const kpiWonAmount = useMemo(() => {
      return filteredOpps.filter(o => o.statusLabel === 'Won').reduce((sum, opp) => sum + getSellPrice(opp), 0);
  }, [filteredOpps]);

  const getWaitingOnAreas = (opp: Opportunity) => {
      if (opp.statusLabel === 'Won' || opp.statusLabel === 'Lost' || opp.statusLabel === 'Canceled') return null;
      
      const externalPending = opp.tasks.filter(t => t.owner === 'External Area' && t.status !== 'Done');
      if (externalPending.length === 0) return null;
      
      const areas = Array.from(new Set(externalPending.flatMap(t => t.externalAreas || [])));
      return areas.join(', ');
  };

  // --- Grouping (Dynamic: Status or Stage) ---
  const groupedOpps = useMemo(() => {
    const groups: Record<string, Opportunity[]> = {};
    
    if (kanbanGroupBy === 'status') {
        Object.keys(STATUS_COLORS).forEach(status => {
            groups[status] = filteredOpps.filter(o => o.statusLabel === status);
        });
    } else {
        Object.keys(STAGE_COLORS).forEach(stage => {
            groups[stage] = filteredOpps.filter(o => o.stage === stage);
        });
    }
    return groups;
  }, [filteredOpps, kanbanGroupBy]);

  const groupedTasks = useMemo(() => {
     const groups: Record<string, any[]> = {};
     if (taskGroupBy === 'status') {
         Object.keys(TASK_STATUS_COLORS).forEach(k => groups[k] = []);
     } else if (taskGroupBy === 'priority') {
         ['High', 'Medium', 'Low'].forEach(k => groups[k] = []);
     } else {
         groups['Internal'] = [];
         groups['External'] = [];
     }

     filteredTasks.forEach(task => {
           let key = 'Other';
           if (taskGroupBy === 'status') key = task.status;
           else if (taskGroupBy === 'priority') key = task.priority;
           else if (taskGroupBy === 'area') {
               if (task.owner === 'Me') key = 'Internal';
               else if (task.externalAreas.length > 0) key = 'External'; // Simplified group for now
           }
           if (!groups[key]) groups[key] = [];
           groups[key].push(task);
     });
     return groups;
  }, [filteredTasks, taskGroupBy]);

  const handleDragStart = (e: React.DragEvent, id: string, type: 'opp' | 'task' = 'opp', extra?: string) => {
    e.dataTransfer.setData('id', id);
    e.dataTransfer.setData('type', type);
    if(extra) e.dataTransfer.setData('extra', extra); 
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  
  const handleDrop = (e: React.DragEvent, target: string, type: 'column' | 'date' | 'taskGroup') => {
    e.preventDefault();
    const id = e.dataTransfer.getData('id');
    const dragType = e.dataTransfer.getData('type');
    const extra = e.dataTransfer.getData('extra'); 

    if (dragType === 'opp') {
        if (type === 'column') {
             const opp = opportunities.find(o => o.id === id);
             if (opp) {
                 if (kanbanGroupBy === 'status') {
                     onOppUpdate({ ...opp, statusLabel: target as OpportunityStatus });
                 } else {
                     onStageChange(id, target as ProcessStage);
                 }
             }
        }
        if (type === 'date') onDateChange(id, 'expected', target);
    } else if (dragType === 'task') {
        const oppId = extra;
        if (type === 'taskGroup') {
            if (taskGroupBy === 'status') {
                handleTaskStatusChange(oppId, id, target as TaskStatus);
            }
            if (taskGroupBy === 'priority') onTaskUpdate(oppId, id, { priority: target as TaskPriority });
        }
        if (type === 'date') {
            onTaskUpdate(oppId, id, { dueDate: target });
        }
    }
  };

  const handleCalendarDrop = (id: string, dragType: string, dateStr: string, extra?: string) => {
    if (dragType === 'opp') {
      onDateChange(id, 'expected', dateStr);
    } else if (dragType === 'task') {
      const oppId = extra;
      if (oppId) {
        onTaskUpdate(oppId, id, { dueDate: dateStr });
      }
    }
  };

  const exportTasksToCSV = () => {
    const headers = ['Opportunity ID', 'Task Title', 'Status', 'Priority', 'Due Date', 'Owner', 'Areas', 'Responsible', 'Description'];
    const rows = filteredOpps.flatMap(opp => opp.tasks.map(t => [
      opp.id, 
      `"${t.title.replace(/"/g, '""')}"`, 
      t.status,
      t.priority,
      t.dueDate, 
      t.owner, 
      `"${(t.externalAreas || []).join(', ')}"`, 
      t.responsible || '', 
      `"${t.description.replace(/"/g, '""')}"`
    ]));
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "tasks_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleInlineEdit = (opp: Opportunity, field: string, value: any) => {
      let updated = { ...opp };
      if (field.includes('dates.')) {
          const sub = field.split('.')[1];
          updated.dates = { ...updated.dates, [sub]: value };
      } else {
          // @ts-ignore
          updated[field] = value;
      }
      onOppUpdate(updated);
  };

  const updateSelectedTask = (field: keyof Task, value: any) => {
     if (!selectedTask) return;
     
     if (field === 'status' && !validateTaskCompletion(selectedTask.oppId, selectedTask.task.id, value)) {
         return;
     }

     const opp = opportunities.find(o => o.id === selectedTask.oppId);
     if (!opp) return;

     const updatedTasks = opp.tasks.map(t => t.id === selectedTask.task.id ? { ...t, [field]: value } : t);
     const updatedOpp = { ...opp, tasks: updatedTasks };
     onOppUpdate(updatedOpp);
     setSelectedTask({ ...selectedTask, task: { ...selectedTask.task, [field]: value } });
  };

  const deleteTaskInModal = () => {
    if (!selectedTask) return;
    if(!window.confirm("Are you sure you want to delete this task?")) return;
    const opp = opportunities.find(o => o.id === selectedTask.oppId);
    if (!opp) return;
    const updatedTasks = opp.tasks.filter(t => t.id !== selectedTask.task.id);
    onOppUpdate({ ...opp, tasks: updatedTasks });
    setSelectedTask(null);
  };
  
  const handleCreateTask = () => {
      setNewTaskData({ oppId: '', title: '' });
      setShowCreateTaskModal(true);
  };

  const handleConfirmCreateTask = () => {
      if (!newTaskData.oppId || !newTaskData.title) return;
      
      const opp = opportunities.find(o => o.id === newTaskData.oppId);
      if (!opp) return;

      const newTask: Task = {
        id: crypto.randomUUID(),
        title: newTaskData.title,
        description: '',
        status: 'Pending',
        priority: 'Medium',
        owner: 'Me',
        externalAreas: [],
        responsible: '',
        dueDate: new Date().toISOString().split('T')[0],
        stageContext: opp.stage,
        subtasks: [],
        order: null,
        dependsOnTaskIds: [],
        blockDoneUntilDependenciesDone: false,
        linkedNoteIds: []
      };

      onOppUpdate({ ...opp, tasks: [...opp.tasks, newTask] });
      setShowCreateTaskModal(false);
      setSelectedTask({ task: newTask, oppId: opp.id });
  };
  
  const handleDeleteTask = (e: React.MouseEvent, oppId: string, taskId: string) => {
      e.stopPropagation();
      if(!window.confirm("Are you sure you want to delete this task?")) return;
      const opp = opportunities.find(o => o.id === oppId);
      if(opp) {
          onOppUpdate({...opp, tasks: opp.tasks.filter(t => t.id !== taskId)});
      }
  };

  const copyTaskSummary = async () => {
      if(!selectedTask) return;
      const t = selectedTask.task;
      const opp = opportunities.find(o => o.id === selectedTask.oppId);
      
      // Resolve doc titles
      let docTitles: string[] = [];
      if(opp) {
          try {
              const docs = await listLinkedForTask(opp.id, t.id);
              docTitles = docs.map(d => d.fileKey.split('/').pop() || d.fileKey);
          } catch(e) { console.error("Failed docs", e); }
      }

      // Resolve notes
      const noteTitles = (t.linkedNoteIds || (t.linkedNoteId ? [t.linkedNoteId] : [])).map(nid => {
          return opp?.notes.find(n => n.id === nid)?.title;
      }).filter(Boolean) as string[];

      // Fix for unknown type error by casting subtasks explicitly
      const subtasksList = (t.subtasks as any as Subtask[]) || [];

      const summary = `
Task: ${t.title}
Due Date: ${t.dueDate}
Status: ${t.status} | Priority: ${t.priority}
Description: 
${t.description}

Subtasks:
${subtasksList.map(s => `- [${s.completed?'x':' '}] ${s.title}`).join('\n')}

Linked documents:
${docTitles.join('\n')}

Linked notes:
${noteTitles.join('\n')}
      `.trim();
      navigator.clipboard.writeText(summary);
      alert("Task summary with links copied to clipboard!");
  };

  const handleDocLink = async (keys: string[]) => {
    if (!selectedTask) return;
    for (const key of keys) {
      await saveMeta(selectedTask.oppId, key, { linkedTaskIds: [selectedTask.task.id] });
    }
    setShowDocPicker(false);
    setRefreshKey(prev => prev + 1);
  };

  const unlinkNote = (noteId: string) => {
      if (!selectedTask) return;
      const currentIds = selectedTask.task.linkedNoteIds || (selectedTask.task.linkedNoteId ? [selectedTask.task.linkedNoteId] : []) || [];
      const newIds = currentIds.filter(id => id !== noteId);
      updateSelectedTask('linkedNoteIds', newIds);
      updateSelectedTask('linkedNoteId', undefined); // Clear legacy
  };

  // Bulk Export / Import Handlers
  const handleBulkExport = async () => {
    if (selectedForExport.length === 0) {
      alert("Select opportunities to export via table view checkboxes.");
      return;
    }
    const packages = [];
    for (const id of selectedForExport) {
      const opp = opportunities.find(o => o.id === id);
      if (opp) packages.push(await exportOpportunity(opp));
    }
    downloadJSON(packages, `Bulk_Export_${packages.length}_Opps.json`);
    setSelectedForExport([]);
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const content = JSON.parse(text);
      const items = Array.isArray(content) ? content : [content];
      
      let count = 0;
      for (const item of items) {
        // Pass existing opportunities to check duplicates if needed, but per requirement we create new
        const newOpp = await importOpportunity(item, opportunities);
        onOppUpdate(newOpp); // Add to DB
        count++;
      }
      alert(`Imported ${count} opportunities.`);
    } catch (err: any) {
      console.error(err);
      alert("Bulk import failed: " + err.message);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const toggleSelectExport = (id: string) => {
    setSelectedForExport(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  // Reusable Task Card Renderer for Next Steps
  const renderTaskCard = (item: any) => (
    <div key={`${item.opp.id}-${item.id}`} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 text-sm cursor-pointer hover:border-[#3DCD58] transition-all relative group" onClick={() => setSelectedTask({ task: item, oppId: item.opp.id })} draggable onDragStart={(e) => handleDragStart(e, item.id, 'task', item.opp.id)}>
        <button onClick={(e) => handleDeleteTask(e, item.opp.id, item.id)} className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
        <div className="font-medium text-gray-800 mb-1 pr-6">{item.title}</div>
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="font-mono bg-gray-100 px-1 rounded">{item.opp.id}</span>
                {item.order && <span className="bg-gray-100 px-1 rounded font-bold text-gray-600" title="Execution Order">#{item.order}</span>}
            </div>
            <div className="flex gap-1 items-center">
                {item.blockDoneUntilDependenciesDone && <Lock className="w-2.5 h-2.5 text-gray-400" />}
                <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[item.priority as TaskPriority]?.split(' ')[1]}`}></span>
            </div>
        </div>
        
        <div className="flex items-center gap-2 mt-2">
                <select 
                value={item.status} 
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                    handleTaskStatusChange(item.opp.id, item.id, e.target.value as TaskStatus);
                }}
                className={`text-[10px] border-none p-0 bg-transparent font-medium cursor-pointer ${TASK_STATUS_COLORS[item.status as TaskStatus].split(' ')[1]}`}
                >
                {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
        </div>

        <div className="flex justify-between mt-2 pt-2 border-t border-gray-50">
            {(item.externalAreas || []).length > 0 && <span className="text-[10px] text-[#3DCD58] bg-[#3DCD58]/10 px-1 rounded truncate max-w-[100px]">{(item.externalAreas || []).join(', ')}</span>}
            <input 
                type="date" 
                value={item.dueDate}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onTaskUpdate(item.opp.id, item.id, { dueDate: e.target.value })}
                className="text-[10px] text-gray-400 ml-auto border-none p-0 bg-transparent text-right w-16 focus:ring-0" 
            />
        </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#f1f3f4] p-6 gap-6 relative">
      {/* Top Bar */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        {/* ... (Existing top bar code unchanged) ... */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{mode === 'proposals' ? 'Proposals Dashboard' : mode === 'tasks' ? 'Tasks Overview' : 'General Overview'}</h1>
          <p className="text-sm text-gray-500">{mode === 'proposals' ? 'Manage your tendering pipeline' : mode === 'tasks' ? 'Track actions across all opportunities' : 'Executive summary of all opportunities'}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {mode === 'proposals' && viewMode === 'table' && (
             <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm mr-2">
                <button 
                  onClick={handleBulkExport} 
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors ${selectedForExport.length > 0 ? 'text-[#3DCD58] hover:bg-[#3DCD58]/10' : 'text-gray-400 cursor-not-allowed'}`}
                  disabled={selectedForExport.length === 0}
                >
                  <Download className="w-3.5 h-3.5" /> Export Selected ({selectedForExport.length})
                </button>
                <div className="w-px h-4 bg-gray-200"></div>
                <button 
                  onClick={() => importInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-[#3DCD58] rounded transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> Import
                </button>
                <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={handleBulkImport} />
             </div>
          )}

          <div className="flex gap-2 items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm mr-2">
             <input type="date" value={dateFilterStart} onChange={e => setDateFilterStart(e.target.value)} className="text-xs border-none focus:ring-0 p-1" />
             <span className="text-gray-400">-</span>
             <input type="date" value={dateFilterEnd} onChange={e => setDateFilterEnd(e.target.value)} className="text-xs border-none focus:ring-0 p-1" />
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-[#3DCD58] focus:border-[#3DCD58] shadow-sm w-48"
            />
          </div>
          
          {(mode === 'proposals' || mode === 'general') && (
            <MultiSelectDropdown 
                label="Filter Status"
                options={mode === 'general' ? Object.keys(STATUS_COLORS) : Object.keys(STAGE_COLORS)}
                selected={statusFilters}
                onChange={setStatusFilters}
            />
          )}

          {mode === 'tasks' && (
             <div className="flex items-center gap-2">
                 <MultiSelectDropdown 
                    label="Opportunities" 
                    options={oppFilterOptions} 
                    selected={taskOppFilters} 
                    onChange={setTaskOppFilters} 
                 />
                 <MultiSelectDropdown 
                    label="Status" 
                    options={Object.keys(TASK_STATUS_COLORS)} 
                    selected={taskStatusFilters} 
                    onChange={setTaskStatusFilters} 
                 />
                 <MultiSelectDropdown 
                    label="Priority" 
                    options={Object.keys(PRIORITY_COLORS)} 
                    selected={taskPriorityFilters} 
                    onChange={setTaskPriorityFilters} 
                 />
                 
                 <span className="text-xs text-gray-500 font-medium ml-2">Group by:</span>
                 <select 
                   className="text-sm border-gray-200 rounded-lg p-2 bg-white shadow-sm"
                   value={taskGroupBy}
                   onChange={(e) => setTaskGroupBy(e.target.value as any)}
                 >
                   <option value="status">Status</option>
                   <option value="priority">Priority</option>
                   <option value="area">Area</option>
                 </select>
             </div>
          )}

          {mode === 'proposals' && viewMode === 'board' && (
             <div className="flex items-center gap-2">
                 <span className="text-xs text-gray-500 font-medium">Kanban View:</span>
                 <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                    <button 
                        onClick={() => setKanbanGroupBy('status')} 
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${kanbanGroupBy === 'status' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Status
                    </button>
                    <button 
                        onClick={() => setKanbanGroupBy('stage')} 
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${kanbanGroupBy === 'stage' ? 'bg-[#3DCD58] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Process
                    </button>
                 </div>
             </div>
          )}

          {mode !== 'general' && (
              <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                <button onClick={() => setViewMode('board')} className={`p-2 rounded ${viewMode === 'board' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`} title="Board View"><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('table')} className={`p-2 rounded ${viewMode === 'table' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`} title="Table View"><TableIcon className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('calendar')} className={`p-2 rounded ${viewMode === 'calendar' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`} title="Calendar View"><CalendarIcon className="w-4 h-4" /></button>
              </div>
          )}

          {mode === 'tasks' && (
            <>
             <button 
                onClick={() => setShowNextSteps(!showNextSteps)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors ${showNextSteps ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
             >
               <ListChecks className="w-4 h-4" /> Next steps
             </button>
             <button onClick={handleCreateTask} className="flex items-center gap-2 bg-[#3DCD58] hover:bg-[#2db64a] text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors">
               <Plus className="w-4 h-4" /> Add Task
             </button>
             <button onClick={exportTasksToCSV} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
               <Download className="w-4 h-4" /> CSV
             </button>
            </>
          )}

          {mode === 'proposals' && (
            <button 
                onClick={() => onCreate()}
                className="flex items-center gap-2 bg-[#3DCD58] hover:bg-[#2db64a] text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
            >
                <Plus className="w-4 h-4" /> New
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0">
        
        {/* ... General View and Tasks View unchanged ... */}
        {mode === 'general' && (
            /* ... existing General View ... */
            <div className="flex flex-col gap-6 h-full overflow-y-auto pr-2 pb-4">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Filtered Amount</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">${kpiTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><DollarSign className="w-6 h-6"/></div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Won Amount (Filtered)</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">${kpiWonAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><Trophy className="w-6 h-6"/></div>
                    </div>
                     <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Count</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">{filteredOpps.filter(o => o.statusLabel === 'In Progress').length}</p>
                        </div>
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Briefcase className="w-6 h-6"/></div>
                    </div>
                </div>

                {/* NEW KPI SECTION */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[#3DCD58]"/> Performance KPIs</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setKpiSoldFilter('all')} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${kpiSoldFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>All</button>
                            <button onClick={() => setKpiSoldFilter('sold')} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${kpiSoldFilter === 'sold' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-gray-600 border-gray-200'}`}>Sold Only</button>
                            <button onClick={() => setKpiSoldFilter('not-sold')} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${kpiSoldFilter === 'not-sold' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-gray-600 border-gray-200'}`}>Not Sold</button>
                        </div>
                    </div>
                    {kpiData ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                            <div className="p-3 bg-gray-50 rounded-lg text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Win Rate</p>
                                <p className="text-lg font-black text-gray-800">{kpiData.winRate}%</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Language</p>
                                <p className="text-lg font-black text-gray-800">{kpiData.avgLang}%</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Tech</p>
                                <p className="text-lg font-black text-gray-800">{kpiData.avgTech}%</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Deal Prob</p>
                                <p className="text-lg font-black text-gray-800">{kpiData.avgDeal}%</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Amount</p>
                                <p className="text-lg font-black text-gray-800">${kpiData.avgAmount}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg Delivery</p>
                                <p className="text-lg font-black text-gray-800">{kpiData.avgDeliveryDays} d</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Avg My Work</p>
                                <p className="text-lg font-black text-gray-800">{kpiData.avgWorkDays} d</p>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400 italic text-sm">No KPI data available for current filters.</div>
                    )}
                </div>

                {/* List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
                    <div className="overflow-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
                        <tr>
                            <th className="px-6 py-3 w-32">ID</th>
                            <th className="px-6 py-3">Title</th>
                            <th className="px-6 py-3">Customer</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Stage</th>
                            <th className="px-6 py-3">Expected Date</th>
                            <th className="px-6 py-3 text-right">Amount</th>
                            <th className="px-6 py-3">Waiting On</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {filteredOpps.map(opp => {
                            const waitingOn = getWaitingOnAreas(opp);
                            const amount = getSellPrice(opp);
                            return (
                                <tr key={opp.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-3 font-mono text-xs text-gray-500 whitespace-nowrap cursor-pointer hover:text-[#3DCD58] hover:underline" onClick={() => onSelect(opp.id)}>{opp.id}</td>
                                    <td className="px-6 py-3 font-medium text-gray-900">{opp.title}</td>
                                    <td className="px-6 py-3 text-gray-600">{opp.customer}</td>
                                    <td className="px-6 py-3">
                                        <select 
                                            value={opp.statusLabel}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => handleInlineEdit(opp, 'statusLabel', e.target.value)}
                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase border cursor-pointer ${STATUS_COLORS[opp.statusLabel]}`}
                                        >
                                            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STAGE_COLORS[opp.stage as ProcessStage]}`}>{opp.stage.split('.')[0]}</span></td>
                                    <td className="px-6 py-3 text-xs text-gray-600 font-mono">
                                        <input 
                                            type="date" 
                                            value={opp.dates?.expected} 
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => handleInlineEdit(opp, 'dates.expected', e.target.value)}
                                            className="bg-transparent border-none p-0 text-xs text-gray-600 focus:ring-0" 
                                        />
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono font-medium">${amount.toLocaleString()}</td>
                                    <td className="px-6 py-3">
                                        {waitingOn ? <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100">{waitingOn}</span> : <span className="text-xs text-gray-400">-</span>}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>
        )}

        {/* === PROPOSALS MODE === */}
        {mode === 'proposals' && (
            <>
                {viewMode === 'board' && (
                <div className="flex h-full pb-4 px-2 min-w-max items-stretch gap-6">
                    {Object.entries(groupedOpps).map(([columnKey, opps]: [string, Opportunity[]], index, arr) => (
                    <div 
                        key={columnKey} 
                        className="w-80 flex flex-col h-full relative group select-none"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, columnKey, 'column')}
                    >
                        {kanbanGroupBy === 'status' ? (
                            <div className={`flex items-center justify-between mb-4 p-3 rounded-lg border-t-4 shadow-sm bg-white ${STATUS_COLORS[columnKey as OpportunityStatus]}`}>
                                <div className="flex flex-col">
                                    <h3 className="text-sm font-bold uppercase tracking-wider">{columnKey}</h3>
                                </div>
                                <span className="bg-white/50 px-2 py-0.5 rounded-full text-xs font-bold">{opps.length}</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between mb-4 bg-white/50 backdrop-blur-sm p-2 rounded-lg border border-gray-200/50">
                                <div className="flex flex-col">
                                    <h3 className="text-xs font-bold uppercase text-gray-600 tracking-wider truncate w-48" title={columnKey}>{columnKey.split('.')[0]}. {columnKey.split('.')[1]}</h3>
                                    <div className="h-1 w-24 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                        <div className="h-full bg-[#3DCD58]" style={{ width: `${calculateProgress(columnKey as ProcessStage)}%` }}></div>
                                    </div>
                                </div>
                                <span className="bg-[#3DCD58]/10 text-[#2b9342] text-xs px-2 py-1 rounded-full font-bold shadow-sm">{opps.length}</span>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-10 cursor-default">
                        {opps.map(opp => {
                            const badge = getBadgeInfo(opp);
                            return (
                                <div 
                                key={opp.id} 
                                onClick={(e) => { e.stopPropagation(); onSelect(opp.id); }}
                                draggable
                                onDragStart={(e) => handleDragStart(e, opp.id, 'opp')}
                                className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-[#3DCD58] cursor-grab active:cursor-grabbing transition-all group relative flex flex-col gap-2 relative overflow-hidden"
                                >
                                <div className={`absolute top-0 left-0 right-0 h-1 ${opp.statusLabel === 'Won' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                                {badge && (
                                    <div className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm ${badge.color}`}>
                                        {badge.text}
                                    </div>
                                )}
                                <div className="flex flex-col gap-1 mt-2">
                                    <span className="text-[10px] font-mono text-gray-400 w-fit">{opp.id}</span>
                                    <h4 className="font-bold text-gray-800 text-sm leading-snug pr-12">{opp.title}</h4>
                                    <p className="text-xs text-gray-500 font-medium">{opp.customer}</p>
                                    
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        {kanbanGroupBy === 'status' && (
                                            <div 
                                                className={`text-[10px] px-2 py-0.5 rounded-full border border-transparent font-medium truncate max-w-[120px] ${STAGE_COLORS[opp.stage]}`}
                                                title="Technical Stage"
                                            >
                                                {opp.stage.split('.')[0]}. {opp.stage.split('.')[1]}
                                            </div>
                                        )}
                                        {kanbanGroupBy === 'stage' && (
                                            <div className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${STATUS_COLORS[opp.statusLabel]}`}>
                                                {opp.statusLabel}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-gray-100">
                                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                        <Clock className="w-3 h-3" />
                                        <input 
                                            type="date" 
                                            value={opp.dates?.expected} 
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => handleInlineEdit(opp, 'dates.expected', e.target.value)}
                                            className="bg-transparent border-none p-0 text-[10px] text-gray-500 focus:ring-0 w-20"
                                        />
                                    </div>
                                    <div className="flex gap-1">
                                        {opp.tasks.length > 0 && (
                                            <div className="flex items-center gap-1 text-[10px] bg-gray-50 px-1.5 py-0.5 rounded text-gray-500" title="Tasks Completed">
                                                <CheckSquare className="w-3 h-3" />
                                                {opp.tasks.filter(t=>t.status==='Done').length}/{opp.tasks.length}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                </div>
                            );
                        })}
                        </div>
                    </div>
                    ))}
                </div>
                )}

                {/* Table View and Calendar View can remain unchanged */}
                {viewMode === 'table' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                        <div className="overflow-auto flex-1">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
                            <tr>
                                <th className="px-4 py-3 w-10">
                                  <input type="checkbox" onChange={(e) => e.target.checked ? setSelectedForExport(filteredOpps.map(o => o.id)) : setSelectedForExport([])} checked={filteredOpps.length > 0 && selectedForExport.length === filteredOpps.length} className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-300" />
                                </th>
                                <th className="px-6 py-3 w-32">ID</th>
                                <th className="px-6 py-3">Title</th>
                                <th className="px-6 py-3">Customer</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Stage</th>
                                <th className="px-6 py-3">Assigned</th>
                                <th className="px-6 py-3">Expected</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                            {filteredOpps.map(opp => (
                                <tr key={opp.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">
                                      <input type="checkbox" checked={selectedForExport.includes(opp.id)} onChange={() => toggleSelectExport(opp.id)} className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-300" />
                                    </td>
                                    <td className="px-6 py-3 font-mono text-xs text-gray-500 whitespace-nowrap cursor-pointer hover:text-[#3DCD58] hover:underline" onClick={() => onSelect(opp.id)}>{opp.id}</td>
                                    <td className="px-6 py-3"><input value={opp.title} onChange={(e) => handleInlineEdit(opp, 'title', e.target.value)} className="bg-transparent border-none p-0 w-full focus:ring-0 font-medium text-gray-900" /></td>
                                    <td className="px-6 py-3"><input value={opp.customer} onChange={(e) => handleInlineEdit(opp, 'customer', e.target.value)} className="bg-transparent border-none p-0 w-full focus:ring-0 text-gray-600" /></td>
                                    <td className="px-6 py-3">
                                        <select 
                                                value={opp.statusLabel}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => handleInlineEdit(opp, 'statusLabel', e.target.value)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase border cursor-pointer ${STATUS_COLORS[opp.statusLabel]}`}
                                            >
                                                {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STAGE_COLORS[opp.stage as ProcessStage]}`}>{opp.stage.split('.')[0]}</span></td>
                                    <td className="px-6 py-3 text-xs text-gray-600">{opp.dates.assigned}</td>
                                    <td className="px-6 py-3"><input type="date" value={opp.dates?.expected} onChange={(e) => handleInlineEdit(opp, 'dates.expected', e.target.value)} className="border-none bg-transparent p-0 text-xs text-gray-600" /></td>
                                </tr>
                            ))}
                            <tr className="bg-gray-50 border-t-2 border-gray-100 hover:bg-gray-100 cursor-pointer" onClick={() => onCreate()}>
                                <td className="px-6 py-4 text-[#3DCD58] font-bold flex items-center gap-2" colSpan={8}>
                                    <Plus className="w-4 h-4" /> New Opportunity
                                </td>
                            </tr>
                            </tbody>
                        </table>
                        </div>
                    </div>
                )}

                {viewMode === 'calendar' && (
                  /* Explicitly passing Opportunity generic to fix Property 'dates', 'stage', 'title' missing on {id: string} */
                  <CalendarView<Opportunity>
                    items={filteredOpps}
                    getDate={(o) => o.dates.expected}
                    onDateDrop={handleCalendarDrop}
                    renderItem={(o) => (
                      <div 
                        draggable 
                        onDragStart={(e) => handleDragStart(e, o.id, 'opp')}
                        onClick={() => onSelect(o.id)}
                        className={`text-[10px] p-1 rounded border border-gray-100 truncate cursor-pointer shadow-sm active:scale-95 transition-transform ${STAGE_COLORS[o.stage]}`}
                        title={o.title}
                      >
                        <span className="font-bold">{o.id}</span>
                      </div>
                    )}
                  />
                )}
            </>
        )}

        {/* ... Tasks Mode ... */}
        {mode === 'tasks' && (
            <>
                 {showNextSteps ? (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
                            {['Overdue', 'Today', 'No Date'].map(key => {
                                const groupTasks = key === 'Overdue' ? nextStepsData.overdue 
                                                 : key === 'Today' ? nextStepsData.dueToday 
                                                 : nextStepsData.noDate;
                                
                                if (groupTasks.length === 0) return null;

                                return (
                                    <div key={key}>
                                        <h3 className={`text-xs font-bold uppercase tracking-widest mb-3 px-1 ${key === 'Overdue' ? 'text-red-500' : key === 'Today' ? 'text-orange-500' : 'text-gray-400'}`}>
                                            {key} <span className="ml-1 opacity-50">({groupTasks.length})</span>
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {groupTasks.map((item: any) => renderTaskCard(item))}
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {nextStepsData.overdue.length === 0 && nextStepsData.dueToday.length === 0 && nextStepsData.noDate.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-300">
                                    <CheckSquare className="w-12 h-12 mb-2 opacity-20" />
                                    <p className="font-bold">No next steps found</p>
                                    <p className="text-xs">All caught up!</p>
                                </div>
                            )}
                        </div>
                    </div>
                 ) : (
                 <>
                 {viewMode === 'board' && (
                    <div className="flex gap-4 h-full pb-2 min-w-max">
                        {Object.entries(groupedTasks).map(([group, tasks]) => (
                        <div key={group} className="w-72 flex flex-col h-full" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, group, 'taskGroup')}>
                            <div className="flex items-center justify-between mb-3 px-1">
                                <h3 className={`text-xs font-semibold uppercase tracking-wider text-gray-600`}>{group}</h3>
                                <span className="text-gray-400 text-xs">{tasks.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-3 pr-2 bg-gray-100/50 p-2 rounded-xl">
                                {tasks.map((item: any) => renderTaskCard(item))}
                            </div>
                        </div>
                        ))}
                    </div>
                 )}

                 {viewMode === 'table' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
                        <div className="overflow-auto flex-1 p-4">
                            <div className="space-y-2">
                                {filteredTasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map((item) => (
                                <div key={item.id} className="border border-gray-100 rounded-lg hover:bg-gray-50 bg-white flex items-center gap-4 p-3 cursor-pointer group" onClick={() => setSelectedTask({ task: item, oppId: item.opp.id })}>
                                        <div className={`w-1 h-10 rounded-full ${STAGE_COLORS[item.stageContext] || 'bg-gray-300'}`}></div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-mono px-1.5 rounded bg-gray-100 text-gray-500`}>{item.opp.id}</span>
                                                {item.order && <span className="text-xs font-bold text-gray-400">#{item.order}</span>}
                                                <span className="text-sm font-medium text-gray-900">{item.title}</span>
                                                {(item.externalAreas || []).length > 0 && <span className="text-xs bg-[#3DCD58]/10 text-[#3DCD58] px-1.5 py-0.5 rounded flex items-center gap-1"><User className="w-3 h-3"/> {(item.externalAreas || []).join(', ')}</span>}
                                                {item.blockDoneUntilDependenciesDone && <span title="Blocking dependencies"><Lock className="w-3 h-3 text-gray-400" /></span>}
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-3">
                                            <select 
                                                value={item.priority}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => onTaskUpdate(item.opp.id, item.id, { priority: e.target.value as TaskPriority })}
                                                className={`text-[10px] px-2 py-0.5 rounded mr-2 border-none cursor-pointer ${PRIORITY_COLORS[item.priority as TaskPriority]}`}
                                            >
                                                {Object.keys(PRIORITY_COLORS).map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                            
                                             <select 
                                                value={item.status}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => handleTaskStatusChange(item.opp.id, item.id, e.target.value as TaskStatus)}
                                                className={`text-[10px] px-2 py-0.5 rounded-full border-none cursor-pointer ${TASK_STATUS_COLORS[item.status as TaskStatus]}`}
                                            >
                                                {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>

                                            <button onClick={(e) => handleDeleteTask(e, item.opp.id, item.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                </div>
                                ))}
                            </div>
                        </div>
                    </div>
                 )}

                 {viewMode === 'calendar' && (
                    <CalendarView<any>
                      items={filteredTasks}
                      getDate={(t) => t.dueDate}
                      onDateDrop={handleCalendarDrop}
                      renderItem={(t) => (
                        <div 
                          draggable 
                          onDragStart={(e) => handleDragStart(e, t.id, 'task', t.opp.id)}
                          onClick={() => setSelectedTask({ task: t, oppId: t.opp.id })}
                          className="text-[10px] p-1 rounded border border-gray-100 truncate cursor-pointer shadow-sm active:scale-95 transition-transform bg-blue-50 text-blue-700 font-medium"
                          title={`${t.opp.id}: ${t.title}`}
                        >
                          {t.title}
                        </div>
                      )}
                    />
                 )}
                 </>
                 )}
            </>
        )}
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !splitViewNoteId && setSelectedTask(null)}>
           <div 
             className={`bg-white shadow-2xl rounded-2xl flex flex-col animate-slide-in-right relative transition-all duration-300 ${splitViewNoteId ? 'w-[95vw] h-[90vh] grid grid-cols-2 gap-8 overflow-hidden' : 'w-[90%] max-w-3xl h-[85vh] overflow-hidden'}`} 
             onClick={(e) => e.stopPropagation()}
            >
              {/* Left Column (Task Details) */}
              <div className="flex flex-col h-full overflow-y-auto">
                  <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
                     <button onClick={deleteTaskInModal} className="p-2 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"><Trash2 className="w-5 h-5" /></button>
                     <div className="text-center">
                        <h2 className="text-lg font-bold text-gray-900">Task Details</h2>
                        <div className="text-[10px] text-gray-500 font-medium flex items-center justify-center gap-1">
                           {selectedTask.oppId}
                           <button onClick={() => onSelect(selectedTask.oppId)} className="text-[#3DCD58] hover:underline ml-2 uppercase font-bold">Open opportunity</button>
                        </div>
                     </div>
                     <div className="flex gap-2">
                        <button onClick={copyTaskSummary} className="flex items-center gap-1 text-xs font-medium bg-[#3DCD58]/10 text-[#3DCD58] px-3 py-1.5 rounded-lg hover:bg-[#3DCD58]/20 transition-colors">
                            <Copy className="w-3 h-3" /> Summary
                        </button>
                        {!splitViewNoteId && <button onClick={() => setSelectedTask(null)} className="p-2 text-gray-500 hover:bg-gray-200 rounded transition-colors"><X className="w-6 h-6"/></button>}
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-8">
                     {/* ... Task details form ... */}
                     <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Title</label>
                            <input className="w-full text-2xl font-bold text-gray-900 border-b border-gray-200 focus:border-[#3DCD58] focus:ring-0 px-0 py-2 placeholder-gray-300" value={selectedTask.task.title} onChange={(e) => updateSelectedTask('title', e.target.value)} />
                        </div>
                        {selectedTask.task.order && (
                            <div className="w-20">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Order</label>
                                <div className="text-xl font-bold text-gray-500 py-2 border-b border-gray-200 text-center">#{selectedTask.task.order}</div>
                            </div>
                        )}
                     </div>

                     <div className="grid grid-cols-3 gap-6">
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Status</label>
                           <select className="w-full border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.status} onChange={(e) => updateSelectedTask('status', e.target.value)}>
                              {Object.keys(TASK_STATUS_COLORS).map(s => <option key={s}>{s}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Priority</label>
                           <select className="w-full border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.priority || 'Medium'} onChange={(e) => updateSelectedTask('priority', e.target.value)}>
                              <option>High</option><option>Medium</option><option>Low</option>
                           </select>
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Due Date</label>
                           <input type="date" className="w-full border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.dueDate} onChange={(e) => updateSelectedTask('dueDate', e.target.value)} />
                        </div>
                     </div>

                     <div className="p-4 border border-gray-100 rounded-xl bg-gray-50/50">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Assignment</label>
                        <div className="flex gap-4 items-center">
                           <select 
                              className="border-gray-200 rounded-lg text-sm bg-white"
                              value={selectedTask.task.owner}
                              onChange={(e) => updateSelectedTask('owner', e.target.value)}
                           >
                              <option>Me</option>
                              <option>External Area</option>
                           </select>
                           
                           {selectedTask.task.owner === 'External Area' && (
                              <div className="flex gap-2 flex-1 relative flex-col">
                                 <MultiSelectDropdown 
                                    label="Select Areas"
                                    options={['Delivery', 'SCM', 'Sales', 'Legal', 'Finance', 'TSC', 'Other']}
                                    selected={selectedTask.task.externalAreas || []}
                                    onChange={(vals) => updateSelectedTask('externalAreas', vals)}
                                 />
                                 <input placeholder="Person Name" className="border-gray-200 rounded-lg text-sm flex-1 bg-white mt-2" value={selectedTask.task.responsible || ''} onChange={(e) => updateSelectedTask('responsible', e.target.value)} />
                              </div>
                           )}
                        </div>
                     </div>

                     {/* Dependency Status Preview */}
                     {(selectedTask.task.dependsOnTaskIds || []).length > 0 && (
                         <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl">
                             <div className="flex items-center gap-2 mb-2">
                                 <Lock className="w-4 h-4 text-orange-500" />
                                 <label className="text-xs font-bold text-orange-700 uppercase tracking-wider">
                                     Dependencies {selectedTask.task.blockDoneUntilDependenciesDone && "(Blocking)"}
                                 </label>
                             </div>
                             <div className="flex flex-col gap-1">
                                 {(selectedTask.task.dependsOnTaskIds || []).map((depId: string) => {
                                     const depTask = opportunities.find(o => o.id === selectedTask.oppId)?.tasks.find(t => t.id === depId);
                                     return depTask ? (
                                         <div key={depId} className="flex items-center gap-2 text-xs">
                                             <div className={`w-2 h-2 rounded-full ${depTask.status === 'Done' ? 'bg-green-500' : 'bg-gray-300'}`} />
                                             <span className={depTask.status === 'Done' ? 'text-gray-500 line-through' : 'text-gray-800'}>{depTask.title}</span>
                                         </div>
                                     ) : null;
                                 })}
                             </div>
                         </div>
                     )}

                     <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Linked Documents</label>
                            <button className="text-[10px] font-bold text-[#3DCD58] uppercase hover:underline" onClick={() => setShowDocPicker(true)}>+ Link Doc</button>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-2xl">
                           <LinkedDocsList key={refreshKey} opportunityId={selectedTask.oppId} taskId={selectedTask.task.id} />
                        </div>
                     </div>

                     {/* NOTE LINKS - Added for General Dashboard */}
                     <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Linked Notes</label>
                        </div>
                        <div className="space-y-2">
                            {(selectedTask.task.linkedNoteIds || [selectedTask.task.linkedNoteId]).filter(Boolean).map((nid) => {
                                const opp = opportunities.find(o => o.id === selectedTask.oppId);
                                const note = opp?.notes.find(n => n.id === nid);
                                if (!note) return null;
                                return (
                                <div key={nid} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-[#3DCD58] transition-all bg-white group">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-400 group-hover:text-[#3DCD58]" />
                                        <span className="text-sm font-medium">{note.title}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => onSelect(selectedTask.oppId)}
                                            className="text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] uppercase px-2 py-1 bg-gray-50 rounded"
                                        >
                                            Open Note
                                        </button>
                                        <button 
                                            onClick={() => setSplitViewNoteId(note.id)}
                                            className="text-[10px] font-bold text-gray-500 hover:text-[#3DCD58] uppercase px-2 py-1 bg-gray-50 rounded flex items-center gap-1"
                                        >
                                            <Columns className="w-3 h-3" /> Split View
                                        </button>
                                        <button
                                            onClick={() => unlinkNote(note.id)}
                                            className="text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase px-2 py-1 bg-gray-50 rounded"
                                            title="Unlink"
                                        >
                                            <Unlink className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                                );
                            })}
                            {!selectedTask.task.linkedNoteIds?.length && !selectedTask.task.linkedNoteId && (
                                <div className="text-center py-4 text-gray-300 text-xs italic">No notes linked</div>
                            )}
                        </div>
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</label>
                        <textarea className="w-full border-gray-200 rounded-lg text-sm h-32 resize-none bg-gray-50 focus:bg-white transition-colors" value={selectedTask.task.description} onChange={(e) => updateSelectedTask('description', e.target.value)} />
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Subtasks</label>
                        <div className="space-y-2">
                           {/* Simplified rendering of subtasks to avoid typing issues */}
                           {(selectedTask.task.subtasks || []).map((sub: Subtask) => (
                              <div key={sub.id} className="flex items-center gap-2 group">
                                 <input 
                                    type="checkbox" 
                                    className="rounded text-[#3DCD58] focus:ring-[#3DCD58] border-gray-300" 
                                    checked={sub.completed} 
                                    onChange={() => { 
                                        if (!selectedTask) return;
                                        const currentSubs = selectedTask.task.subtasks || [];
                                        const updatedSubs = currentSubs.map(s => s.id === sub.id ? {...s, completed: !s.completed} : s); 
                                        updateSelectedTask('subtasks', updatedSubs); 
                                    }} 
                                 />
                                 <input 
                                    className={`flex-1 border-none focus:ring-0 py-1 text-sm ${sub.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`} 
                                    value={sub.title} 
                                    onChange={(e) => { 
                                        if (!selectedTask) return;
                                        const currentSubs = selectedTask.task.subtasks || [];
                                        const updatedSubs = currentSubs.map(s => s.id === sub.id ? {...s, title: e.target.value} : s); 
                                        updateSelectedTask('subtasks', updatedSubs); 
                                    }} 
                                 />
                              </div>
                           ))}
                           <button 
                             className="text-xs text-[#3DCD58] font-medium mt-2 flex items-center gap-1 hover:underline" 
                             onClick={() => { 
                                if (!selectedTask) return; 
                                const newSub: Subtask = { id: crypto.randomUUID(), title: 'New Subtask', completed: false }; 
                                const currentSubs = selectedTask.task.subtasks || [];
                                updateSelectedTask('subtasks', [...currentSubs, newSub]); 
                             }}
                            >
                               <Plus className="w-3 h-3" /> Add Subtask
                           </button>
                        </div>
                     </div>
                  </div>
              </div>

              {/* Right Column (Split View Note Editor) */}
              {splitViewNoteId && (
                <div className="flex flex-col h-full border-l border-gray-100 pl-8 overflow-hidden">
                    <div className="flex justify-between items-center mb-4 shrink-0 pt-4 pr-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                           <FileText className="w-5 h-5 text-[#3DCD58]"/> 
                           {opportunities.find(o => o.id === selectedTask.oppId)?.notes.find(n => n.id === splitViewNoteId)?.title}
                        </h3>
                        <button 
                           onClick={() => setSplitViewNoteId(null)}
                           className="text-xs font-bold uppercase bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                        >
                           Close Split View
                        </button>
                    </div>
                    <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col mb-4 mr-4">
                        <RichTextEditor 
                           key={splitViewNoteId}
                           content={opportunities.find(o => o.id === selectedTask.oppId)?.notes.find(n => n.id === splitViewNoteId)?.content || ''}
                           onChange={(val) => {
                               const opp = opportunities.find(o => o.id === selectedTask.oppId);
                               if(opp) {
                                   const updatedNotes = opp.notes.map(n => n.id === splitViewNoteId ? { ...n, content: val } : n);
                                   onOppUpdate({...opp, notes: updatedNotes});
                               }
                           }}
                        />
                    </div>
                </div>
              )}
           </div>
        </div>
      )}

      {showDocPicker && selectedTask && (
        <DocumentPickerModal 
          opportunityId={selectedTask.oppId} 
          multi={true}
          onSelect={handleDocLink}
          onClose={() => setShowDocPicker(false)}
          title="Link documents to task"
        />
      )}
    </div>
  );
};

export default Dashboard;
