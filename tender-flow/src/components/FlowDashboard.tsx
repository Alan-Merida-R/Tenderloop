import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { StandardItem, ExecutiveFlowCase, Priority, ResponseStatus, ItemResponse, ItemType } from '../types';
import { getVisibleItems, getAreaStatus, getStageStatus, isStageLocked, isItemLocked, evaluateStatus } from '../engine/evaluator';
import { MOCK_STANDARD, getSystemItems, SYSTEM_QUESTIONS_AREA } from '../engine/mockStandard';
import { parseExcelSheet, generateTemplateExcel, parseProjectExcel, parseLoopDatabase, parseLoopJsonDatabase } from '../services/excelParser';
import { workspaceManager } from '../services/storage';
import { exportToWord, exportToExcel } from '../services/exporter';
import { ChecklistWizard } from './ChecklistWizard';
import { QuestionDetailPanel } from './QuestionDetailPanel';
import * as XLSX from 'xlsx';
import { DecisionMap } from './DecisionMap';
import { StructureEditor } from './StructureEditor';
import { ExecutiveDecisionMap } from './ExecutiveDecisionMap';
import { EnginePanel, ZeroStateOverlay } from './WorkspaceEngines';
import { WorkspaceStatus, TenderFlowWorkspace, RecentDB } from '../types';
import { 
  ChevronRight, Search, Filter, Map as MapIcon, Users, ClipboardCheck, 
  AlertCircle, ExternalLink, MessageSquare, Flag, MoreHorizontal, CheckCircle2, 
  Clock, ShieldAlert, FileUp, FileDown, LayoutList, GitBranch, Save, Plus, 
  FolderOpen, ArrowUpRight, Download, X, Briefcase, RefreshCw, Edit2, Lock, 
  Link as LinkIcon, Database, Eye, EyeOff, ChevronDown, AlertTriangle, Trash2, Zap,
  FileText, FileSpreadsheet, Sun, Moon, PieChart, Activity, Unlock, Terminal
} from 'lucide-react';

export const FlowDashboard: React.FC = () => {
  // --- CORE WORKSPACE STATE ---
  const [workspace, setWorkspace] = useState<TenderFlowWorkspace | null>(workspaceManager.getWorkspace());
  const [wsStatus, setWsStatus] = useState<WorkspaceStatus>(workspaceManager.getStatus());
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  // --- UI STATE ---
  const [isDarkMode, setIsDarkMode] = useState(workspace?.settings?.theme !== 'light');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'checklist' | 'map' | 'executive_map'>('checklist');
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedTextId, setExpandedTextId] = useState<string | null>(null);
  const [hideCommon, setHideCommon] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // --- SYNC STATE (TenderLoop) ---
  const [loopDb, setLoopDb] = useState<any[]>(() => {
    const cached = localStorage.getItem('te_loop_db_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [loopDbName, setLoopDbName] = useState<string | null>(localStorage.getItem('te_loop_db_name'));

  // --- COMPUTED SYNC ---
  const currentCase = useMemo(() => {
    if (!workspace) return null;
    if (activeCaseId) return workspace.cases.find(c => c.id === activeCaseId) || workspace.cases[0] || null;
    return workspace.cases.find(c => c.metadata.status === 'active') || workspace.cases[0] || null;
  }, [workspace, activeCaseId]);

  const standardItems = useMemo(() => workspace?.standard.questions || [], [workspace]);
  const stagesData = useMemo(() => workspace?.standard.stages || [], [workspace]);
  const areasData = useMemo(() => workspace?.standard.areas || [], [workspace]);

  const activeBackboneItems = useMemo(() => currentCase?.snapshot?.questions || standardItems, [currentCase, standardItems]);
  const activeBackboneStages = useMemo(() => currentCase?.snapshot?.stages || stagesData, [currentCase, stagesData]);
  const activeBackboneAreas = useMemo(() => currentCase?.snapshot?.areas || areasData, [currentCase, areasData]);

  const visibleItems = useMemo(() => {
    if (!currentCase) return [];
    let items = isEditMode ? activeBackboneItems : getVisibleItems(activeBackboneItems, currentCase.responses);
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => 
        i.content.toLowerCase().includes(q) || 
        i.area.toLowerCase().includes(q) || 
        i.stage.toLowerCase().includes(q) ||
        (i.tags && i.tags.some(t => t.toLowerCase().includes(q)))
      );
    }
    if (selectedAreas.length > 0) items = items.filter(i => selectedAreas.includes(i.area));
    if (selectedStages.length > 0) items = items.filter(i => selectedStages.includes(i.stage));
    if (hideCommon) items = items.filter(i => i.stage.toLowerCase() !== 'intake' && i.stage.toLowerCase() !== 'common');
    
    return items;
  }, [activeBackboneItems, currentCase, searchQuery, selectedAreas, selectedStages, hideCommon, isEditMode]);

  const areaStatuses = useMemo(() => getAreaStatus(activeBackboneItems, currentCase?.responses || {}), [activeBackboneItems, currentCase]);
  const stagesList = useMemo(() => activeBackboneStages.filter(s => s.active !== false).sort((a,b) => a.order - b.order).map(s => s.name), [activeBackboneStages]);

  const answeredResponses = useMemo(() => {
    if (!currentCase) return [];
    const visibleIds = new Set(visibleItems.map(i => i.id));
    const resps = Object.values(currentCase.responses) as ItemResponse[];
    return resps
      .filter(r => (r.status === 'answered' || r.status === 'confirmed') && visibleIds.has(r.itemId))
      .sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [currentCase, visibleItems]);

  // --- STARTUP ---
  useEffect(() => {
    workspaceManager.setCallbacks(
      (s) => setWsStatus(s),
      (ws) => setWorkspace(ws)
    );
    const initialWS = workspaceManager.getWorkspace();
    if (initialWS) setWorkspace(initialWS);
    else workspaceManager.tryAutoReopen();
    handleAutoLoadLoopDb();
  }, []);

  const handleAutoLoadLoopDb = async () => {
    const handle = await workspaceManager.getLoopDbHandle();
    if (handle) {
      try {
        const file = await handle.getFile();
        let data: any[] = [];
        if (file.name.endsWith('.json')) {
          const text = await file.text();
          data = parseLoopJsonDatabase(text);
        } else {
          const buffer = await file.arrayBuffer();
          data = parseLoopDatabase(buffer);
        }
        setLoopDb(data);
        setLoopDbName(handle.name);
        localStorage.setItem('te_loop_db_cache', JSON.stringify(data));
        localStorage.setItem('te_loop_db_name', handle.name);
      } catch (e) {
        console.warn('Loop DB handle expired or inaccessible');
      }
    }
  };

  // NEW: Auto-refresh data when user refocuses the tab
  useEffect(() => {
    const handleFocus = () => {
      console.log("[SYNC] Tab focused, checking for Loop DB updates...");
      handleAutoLoadLoopDb();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // SYNC CORE
  const syncWithLoop = useCallback(() => {
    if (!currentCase || !loopDb || loopDb.length === 0) return;
    let hasChanges = false;
    const nextResponses = { ...currentCase.responses };
    activeBackboneItems.forEach(item => {
      if (item.linkedTaskId) {
        let loopTask: any = null;
        for (const op of (loopDb as any[])) {
            const rawId = String(item.linkedTaskId || '').trim().toUpperCase();
            if (op.tasks && Array.isArray(op.tasks)) {
               loopTask = op.tasks.find((t: any) => {
                 const tId = String(t.id || t.Task_ID || t.TaskID || t.taskId || t._id || t.Index || t.order || '').trim().toUpperCase();
                 const tName = String(t.name || t.content || t.Task || t.Name || '').trim().toUpperCase();
                 return tId === rawId || tName === rawId;
               });
               if (loopTask) break;
            } 
            const opId = String(op.id || op.Task_ID || op.TaskID || op.taskId || op._id || op.ID || op['#'] || '').trim().toUpperCase();
            const opName = String(op.name || op.content || op.Task || op.keyName || '').trim().toUpperCase();
            if (opId === rawId || opName === rawId) {
               loopTask = op;
               break;
            }
        }
        if (loopTask) {
           const rawStatus = (loopTask.status || loopTask.Status || loopTask.taskStatus || loopTask.state || loopTask.isDone || loopTask.completed || loopTask.done || '').toString();
           const loopStatus = rawStatus.trim().toUpperCase();
           const currentResp = nextResponses[item.id];
           const isDoneVariations = ['DONE', 'TERMINADO', 'COMPLETADO', 'COMPLETED', 'FINALIZADO', 'LISTO', 'TRUE', '1', 'FINISHED', 'CONCLUDED', 'OK', 'READY', 'YES'];
           const isDoneInLoop = isDoneVariations.includes(loopStatus) || loopTask.completed === true || loopTask.isDone === true || loopTask.done === true;
           const targetStatus = isDoneInLoop ? 'answered' : 'not_started';
           const targetValue = isDoneInLoop ? 'COMPLETED (LOOP)' : 'PENDING (LOOP)';
           if (!currentResp || currentResp.status !== targetStatus || currentResp.value !== targetValue || !currentResp.isSynced) {
              nextResponses[item.id] = {
                ...(currentResp || { itemId: item.id, isFlagged: false, isLocked: false, note: '' }),
                status: targetStatus, value: targetValue, isSynced: true, updatedAt: new Date().toISOString()
              };
              hasChanges = true;
           }
        }
      }
    });
    if (hasChanges && workspace) {
       const nextCase = { ...currentCase, responses: nextResponses };
       const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c) };
       setWorkspace(updatedWs);
       workspaceManager.markDirty(updatedWs);
    }
  }, [currentCase, loopDb, activeBackboneItems, workspace]);

  useEffect(() => {
    if (loopDb.length > 0) syncWithLoop();
  }, [loopDb, activeCaseId, activeBackboneItems]); // Added items for instant reaction when linking

  const handleSaveStandard = useCallback((data: { questions: StandardItem[], stages: any[], areas: any[] }) => {
    if (!workspace) return;
    if (currentCase && currentCase.snapshot) {
       const updatedCase = { ...currentCase, snapshot: data };
       const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? updatedCase : c) };
       setWorkspace(updatedWs);
       workspaceManager.markDirty(updatedWs);
    } else {
       const updated = { ...workspace, standard: data };
       setWorkspace(updated);
       workspaceManager.markDirty(updated);
    }
    setIsEditorOpen(false);
  }, [workspace, currentCase]);

  const handleUpdateStandardItem = useCallback((itemId: string, updates: Partial<StandardItem>) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    const updatedSnapshot = { ...currentCase.snapshot, questions: currentCase.snapshot.questions.map(q => q.id === itemId ? { ...q, ...updates } : q) };
    handleSaveStandard(updatedSnapshot);
  }, [currentCase, handleSaveStandard]);

  const handleToggleTheme = useCallback(() => {
    if (!workspace) return;
    const nextTheme = isDarkMode ? 'light' : 'dark';
    const updated = { ...workspace, settings: { ...workspace.settings, theme: nextTheme as any } };
    setIsDarkMode(!isDarkMode);
    setWorkspace(updated);
    workspaceManager.markDirty(updated);
  }, [workspace, isDarkMode]);

  const handleDeleteStandardItem = useCallback((itemId: string) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    if (!window.confirm("Are you sure?")) return;
    const updatedSnapshot = { ...currentCase.snapshot, questions: currentCase.snapshot.questions.filter(q => q.id !== itemId) };
    handleSaveStandard(updatedSnapshot);
    if (selectedItemId === itemId) setSelectedItemId(null);
  }, [currentCase, handleSaveStandard, selectedItemId]);

  const handleDuplicateTask = useCallback((taskId: string) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    const target = currentCase.snapshot.questions.find(q => q.id === taskId);
    if (!target) return;
    const clone = { ...target, id: `Q_CLONE_${Date.now()}`, content: `${target.content} (OR Branch)`, visualPosition: { x: (target.visualPosition?.x || 0) + 100, y: (target.visualPosition?.y || 0) + 100 } };
    handleSaveStandard({ ...currentCase.snapshot, questions: [...currentCase.snapshot.questions, clone] });
  }, [currentCase, handleSaveStandard]);

  const handleResetChecklist = useCallback(() => {
    if (!workspace || !currentCase) return;
    if (!window.confirm("ARE YOU SURE?")) return;
    const nextCase = { ...currentCase, responses: {} };
    const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c) };
    setWorkspace(updatedWs);
    workspaceManager.markDirty(updatedWs);
  }, [workspace, currentCase]);

  const handleAddDependency = useCallback((sourceId: string, targetId: string) => {
    if (!currentCase?.snapshot) return;
    const updatedItems = currentCase.snapshot.questions.map(item => {
      if (item.id === targetId) {
        const rules = item.dependencyRules || [];
        if (!rules.some(r => r.targetId === sourceId)) return { ...item, dependencyRules: [...rules, { targetId: sourceId, operator: 'any_value' }] };
      }
      return item;
    });
    handleSaveStandard({ ...currentCase.snapshot, questions: updatedItems });
  }, [currentCase, handleSaveStandard]);

  const handleUpdateDependency = useCallback((targetItemId: string, sourceItemId: string, newValue: string) => {
    if (!currentCase?.snapshot) return;
    const updatedItems = currentCase.snapshot.questions.map(item => {
      if (item.id === targetItemId) {
        const rules = (item.dependencyRules || []).map(rule => rule.targetId === sourceItemId ? { ...rule, operator: 'equals', value: newValue } : rule);
        return { ...item, dependencyRules: rules };
      }
      return item;
    });
    handleSaveStandard({ ...currentCase.snapshot, questions: updatedItems });
  }, [currentCase, handleSaveStandard]);

  const handleDetailUpdate = (itemId: string, updates: Partial<ItemResponse> | null) => {
    if (!currentCase || !workspace) return;
    let nextResponses = { ...currentCase.responses };
    if (updates === null) { delete nextResponses[itemId]; }
    else {
      const trimmed = String(updates.value || '').trim();
      if (updates.value !== undefined) updates.status = trimmed === '' ? 'not_started' : 'answered';
      nextResponses[itemId] = {
        ...(nextResponses[itemId] || { itemId, value: '', status: 'not_started', isFlagged: false, isLocked: false, updatedAt: new Date().toISOString() }),
        ...updates, updatedAt: new Date().toISOString()
      };
    }
    const nextCase = { ...currentCase, responses: nextResponses };
    const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c) };
    setWorkspace(updatedWs);
    workspaceManager.markDirty(updatedWs);

    // TWO-WAY SYNC: If this is an action and has a linkedTaskId, update Loop DB too
    const item = activeBackboneItems.find(i => i.id === itemId);
    if (item?.linkedTaskId && loopDb.length > 0) {
       handleUpdateLoopTask(item.linkedTaskId, String(updates.value));
    }
  };

  const handleUpdateLoopTask = async (taskId: string, newStatus: string) => {
    let hasChanges = false;
    const nextLoopDb = (loopDb as any[]).map(op => {
        let opTasks = op.tasks || [];
        let tasksChanged = false;
        const nextTasks = opTasks.map((t: any) => {
            const tId = String(t.id || t.Task_ID || t.TaskID || t.taskId || t._id || t.Index || t.order || '').trim().toUpperCase();
            if (tId === taskId.trim().toUpperCase()) {
                tasksChanged = true;
                return { ...t, status: newStatus, completed: newStatus.toUpperCase() === 'DONE' };
            }
            return t;
        });
        
        // Also check if op itself is the task
        const opId = String(op.id || op.Task_ID || op.TaskID || op.taskId || op._id || op.ID || op['#'] || '').trim().toUpperCase();
        if (opId === taskId.trim().toUpperCase()) {
            hasChanges = true;
            return { ...op, status: newStatus, completed: newStatus.toUpperCase() === 'DONE' };
        }

        if (tasksChanged) {
            hasChanges = true;
            return { ...op, tasks: nextTasks };
        }
        return op;
    });

    if (hasChanges) {
        setLoopDb(nextLoopDb);
        // Persist back to the Loop JSON if possible
        const handle = await workspaceManager.getLoopDbHandle();
        if (handle && handle.name.endsWith('.json')) {
            try {
               const writable = await handle.createWritable();
               await writable.write(JSON.stringify({ ...JSON.parse(await (await handle.getFile()).text()), opportunities: nextLoopDb }, null, 2));
               await writable.close();
            } catch (e) { console.warn("Could not write back to Loop JSON file.", e); }
        }
    }
  };

  const handleExportWordAction = () => exportToWord(currentCase!, activeBackboneItems);
  const handleExportExcelAction = () => exportToExcel(currentCase!, activeBackboneItems, activeBackboneStages, activeBackboneAreas);

  const handleCreateNew = (newCase: ExecutiveFlowCase, sourceId?: string, excelBackbone?: any) => {
    if (!workspace) return;
    let sourceSnapshot = workspace.standard;
    if (excelBackbone) sourceSnapshot = excelBackbone;
    else if (sourceId) {
      const source = workspace.cases.find(c => c.id === sourceId);
      if (source?.snapshot) sourceSnapshot = source.snapshot;
    }
    const createRes = (id: string, val: any) => ({ 
      itemId: id, 
      value: val, 
      status: (String(val||'').trim()===''?'not_started':'answered') as ResponseStatus, 
      updatedAt: new Date().toISOString(), 
      isFlagged: false, 
      isLocked: false 
    });
    const initialResponses: Record<string, ItemResponse> = {
      'SYS_ALIAS': createRes('SYS_ALIAS', newCase.metadata.name), 'SYS_OPID': createRes('SYS_OPID', newCase.loopId),
      'SYS_COMPANY': createRes('SYS_COMPANY', newCase.metadata.customer), 'SYS_AMOUNT': createRes('SYS_AMOUNT', newCase.initialWizData.estimatedAmount),
      'SYS_ADDRESS': createRes('SYS_ADDRESS', newCase.initialWizData.customerAddress), 'SYS_DUEDATE': createRes('SYS_DUEDATE', newCase.initialWizData.dueDate),
      'SYS_SELLER': createRes('SYS_SELLER', newCase.initialWizData.sellerName)
    };
    const withSnapshot = { 
      ...newCase, responses: initialResponses,
      snapshot: { 
        questions: [...getSystemItems(), ...sourceSnapshot.questions].map(q => ({...q, active: true})), 
        stages: [{ id: 'STG_INTAKE', name: 'Intake', order: 0, active: true }, ...sourceSnapshot.stages.filter(s => s.name !== 'Intake')], 
        areas: [{ id: 'AREA_GENERAL', name: 'General', order: 0, active: true, color: '#3b82f6' }, ...sourceSnapshot.areas.filter(a => a.name !== 'General')] 
      } 
    };
    const updated = { ...workspace, cases: [...workspace.cases, withSnapshot] };
    setWorkspace(updated); setActiveCaseId(withSnapshot.id); workspaceManager.markDirty(updated); setIsWizardOpen(false);
  };

  const handleImportExcelAction = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspace) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const { questions, stages, areas, responses, metadata } = parseProjectExcel(buffer);
        const nc: ExecutiveFlowCase = { id: `CASE_${Date.now()}`, keyName: metadata.name||'', loopId: metadata.loopId||'TF-IMP', metadata: { name: metadata.name||'', customer: metadata.customer||'Imported', status: 'active', createdAt: new Date().toISOString(), lastModified: new Date().toISOString(), standardVersion: '3.1', isArchived: false }, responses: responses||{}, snapshot: { questions, stages, areas }, initialWizData: { proposalType: 'Standard', scopeTags: [], estimatedAmount: 0, dueDate: '', state: '', city: '', customerAddress: '', salesOwner: '', sellerName: '' }, activeFilters: { areas: [], stages: [], priorities: [], deliverables: [] } };
        const updated = { ...workspace, cases: [...workspace.cases, nc] };
        setWorkspace(updated); setActiveCaseId(nc.id); workspaceManager.markDirty(updated);
      } catch (err) { alert("Excel Import failed."); }
      finally { setIsImporting(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className={`te-app-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`} style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--te-bg-app)', color: 'var(--te-text-main)', overflow: 'hidden' }}>
      {!workspace && <ZeroStateOverlay onOpenDB={() => workspaceManager.openWorkspace()} onNewDB={() => workspaceManager.newWorkspace()} />}
      
      <aside className="te-sidebar" style={{ width: '260px', background: 'var(--te-primary-900)', color: 'white', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--te-border)', zIndex: 100 }}>
        <div style={{ padding: '2rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 950, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><div style={{ width: 14, height: 14, background: 'var(--te-accent-500)', borderRadius: '3px', rotate: '45deg' }} />Tender Flow</h1>
          <p style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Strategic Matrix v3.1</p>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
          <button onClick={() => setIsWizardOpen(true)} className="te-btn te-btn-primary" style={{ width: '100%', marginBottom: '1.5rem', background: 'var(--te-emerald-500)' }}><Plus size={16} /> NEW CHECKLIST</button>
          <div onClick={() => setIsProjectsCollapsed(!isProjectsCollapsed)} style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.4, padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>PROJECTS <ChevronDown size={12} style={{ transform: isProjectsCollapsed ? 'rotate(-90deg)' : '' }} /></div>
          {!isProjectsCollapsed && workspace?.cases.map(c => (
            <div key={c.id} onClick={() => setActiveCaseId(c.id)} style={{ padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: currentCase?.id === c.id ? 'rgba(59,130,246,0.15)' : 'transparent', color: currentCase?.id === c.id ? 'var(--te-accent-500)' : 'rgba(255,255,255,0.6)', fontWeight: currentCase?.id === c.id ? 800 : 500, overflow: 'hidden' }}><Database size={14} style={{ flexShrink: 0 }} /> <span>{c.metadata.name}</span></div>
          ))}
          <div style={{ padding: '1.5rem 1rem 0.5rem 1rem', fontSize: '0.65rem', fontWeight: 900, opacity: 0.4 }}>STATEMENTS</div>
          {stagesList.map(stg => {
            const isSelected = selectedStages.includes(stg);
            return (
              <div key={stg} onClick={() => setSelectedStages(isSelected ? selectedStages.filter(s => s !== stg) : [...selectedStages, stg])} style={{ padding: '0.6rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: isSelected ? 'var(--te-emerald-400)' : 'rgba(255,255,255,0.4)', background: isSelected ? 'rgba(16,185,129,0.1)' : 'transparent', fontWeight: isSelected ? 900 : 500, opacity: selectedStages.length > 0 && !isSelected ? 0.3 : 1 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid currentColor', background: isSelected ? 'currentColor' : 'transparent' }} /><span>{stg.toUpperCase()}</span>
              </div>
            );
          })}
          <div onClick={() => setIsEditorOpen(true)} style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'rgba(255,255,255,0.7)' }}><LayoutList size={14} /> STRUCTURE EDITOR</div>
        </nav>
        <div style={{ padding: '1.5rem' }}>
           <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>WORKSPACE_DB.sys</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--te-accent-500)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspace?.metadata.name || 'Disconnected'}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                   <button title="Refresh Data" onClick={() => handleAutoLoadLoopDb()} style={{ background: 'var(--te-primary-700)', border: 'none', padding: '6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><RefreshCw size={14} className={wsStatus === 'Saving' ? 'spin-slow' : ''} /></button>
                   <button title="Open DB" onClick={() => workspaceManager.openWorkspace()} style={{ background: 'var(--te-primary-700)', border: 'none', padding: '6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><FolderOpen size={14} /></button>
                </div>
              </div>
              
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className={wsStatus === 'Synced' ? '' : 'spin-slow'} style={{ width: 8, height: 8, borderRadius: '50%', background: wsStatus === 'Synced' ? 'var(--te-emerald-500)' : (wsStatus === 'Save pending' || wsStatus === 'Saving' ? 'var(--te-amber-500)' : 'var(--te-rose-500)') }} />
                    <span style={{ fontSize: '0.55rem', fontWeight: 950, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{wsStatus}</span>
                 </div>
                 {wsStatus === 'Save pending' && (
                   <button 
                     onClick={() => workspaceManager.forceSave()}
                     style={{ background: 'var(--te-accent-500)', border: 'none', padding: '2px 8px', borderRadius: '4px', color: 'white', fontSize: '0.5rem', fontWeight: 950, cursor: 'pointer' }}
                   >
                     SAVE NOW
                   </button>
                 )}
              </div>
           </div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {!currentCase ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><button onClick={() => setIsWizardOpen(true)} className="te-btn te-btn-primary" style={{ padding: '1.2rem 3rem' }}><Plus size={24} /> START NEW CHECKLIST</button></div> : (
          <>
            <header style={{ padding: '1rem 2.5rem', borderBottom: '1px solid var(--te-border)', background: 'var(--te-bg-app)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '2rem' }}>
                  <div style={{ flexShrink: 0 }}><div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--te-accent-500)', marginBottom: '0.1rem' }}>Strategic Project</div><h2 style={{ fontSize: '1.4rem', fontWeight: 950, margin: 0 }}>{currentCase.metadata.name}</h2></div>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <button onClick={handleExportExcelAction} className="te-btn te-btn-outline"><FileSpreadsheet size={13} /> EXCEL</button>
                    <button onClick={handleExportWordAction} className="te-btn te-btn-outline"><FileText size={13} /> WORD</button>
                    <div style={{ width: '1px', height: '20px', background: 'var(--te-border)', margin: '0 0.5rem' }} />
                    <button onClick={() => setHideCommon(!hideCommon)} className={`te-btn te-btn-outline ${hideCommon ? 'active' : ''}`}><EyeOff size={13} /> COMMON</button>
                    <button onClick={() => setShowActions(!showActions)} className={`te-btn te-btn-outline ${showActions ? 'active' : ''}`}><Zap size={13} /> ACTIONS</button>
                    <button onClick={() => setIsEditMode(!isEditMode)} className={`te-btn te-btn-outline ${isEditMode ? 'active' : ''}`}>{isEditMode ? <Lock size={13} /> : <Unlock size={13} />} {isEditMode ? 'SAVE' : 'ENGINE'}</button>
                    <button onClick={handleToggleTheme} className="te-btn te-btn-outline" style={{ padding: '6px' }}>{isDarkMode ? <Sun size={14} /> : <Moon size={14} />}</button>
                  </div>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.8rem', width: '100%', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flex: 1 }}>
                    <div style={{ display: 'flex', background: 'var(--te-bg-card-alt)', padding: '3px', borderRadius: '12px', border: '1px solid var(--te-border)' }}>
                        <button onClick={() => setViewMode('checklist')} className={`te-btn ${viewMode === 'checklist' ? 'te-btn-primary' : ''}`}>ROADMAP</button>
                        <button onClick={() => setViewMode('map')} className={`te-btn ${viewMode === 'map' ? 'te-btn-primary' : ''}`}>FLOW</button>
                        <button onClick={() => setViewMode('executive_map')} className={`te-btn ${viewMode === 'executive_map' ? 'te-btn-primary' : ''}`}>STRATEGIST</button>
                    </div>
                    <div className="te-search-bar" style={{ position: 'relative', flex: '1', maxWidth: '450px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                        <input style={{ width: '100%', background: 'var(--te-bg-card-alt)', border: '1px solid var(--te-border)', borderRadius: '50px', padding: '0.5rem 1rem 0.5rem 2.4rem', outline: 'none', fontSize: '0.8rem', color: 'white' }} placeholder="Search questions or tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                  </div>
                  <button onClick={() => setIsAuditLogOpen(!isAuditLogOpen)} className={`te-btn ${isAuditLogOpen ? 'te-btn-primary' : 'te-btn-outline'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1.25rem', borderRadius: '12px' }}><Terminal size={14} /> OVERVIEW</button>
               </div>
               <div style={{ display: 'flex', gap: '0.8rem', overflowX: 'auto', paddingBottom: '0.5rem' }} className="hide-scrollbar">
                   {areaStatuses.map(status => {
                     const areaDef = activeBackboneAreas.find(a => a.name === status.area); const areaColor = areaDef?.color || 'var(--te-accent-500)'; const isFullyAnswered = status.percentage === 100; const isSelected = selectedAreas.includes(status.area);
                     return (
                       <div key={status.area} onClick={() => setSelectedAreas(isSelected ? selectedAreas.filter(a => a !== status.area) : [...selectedAreas, status.area])} style={{ minWidth: '180px', padding: '1rem', borderRadius: '16px', background: 'var(--te-bg-card)', border: `1px solid ${isSelected ? areaColor : 'var(--te-border)'}`, borderLeft: `4px solid ${areaColor}`, cursor: 'pointer', transition: 'all 0.2s', opacity: selectedAreas.length > 0 && !isSelected ? 0.4 : 1 }}>
                         <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--te-text-muted)', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>DEPARTMENT <div style={{ width: 6, height: 6, borderRadius: '50%', background: isFullyAnswered ? areaColor : 'transparent', border: `1px solid ${areaColor}` }} /></div>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.85rem', fontWeight: 900 }}>{status.area}</span><span style={{ fontSize: '0.85rem', fontWeight: 900, color: areaColor }}>{status.percentage}%</span></div>
                       </div>
                     );
                   })}
                </div>
            </header>

            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
               {viewMode === 'checklist' && (
                 <div style={{ height: '100%', overflowY: 'auto', padding: '2rem' }}>
                    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                       {visibleItems.filter(it => showActions || (String(it.itemType || '').toLowerCase() !== 'action')).map(item => {
                         const resp = currentCase.responses[item.id]; const { locked } = isItemLocked(item, currentCase.responses); const currentStatus = evaluateStatus(resp); const isDone = currentStatus === 'answered' || currentStatus === 'confirmed'; const areaColor = activeBackboneAreas.find(a => a.name === item.area)?.color || 'var(--te-accent-500)';
                         return (
                            <div key={item.id} onClick={() => setSelectedItemId(item.id)} style={{ padding: '1rem 1.25rem', borderRadius: '12px', background: 'var(--te-bg-card)', border: `1px solid ${selectedItemId === item.id ? areaColor : 'var(--te-border)'}`, borderLeft: `4px solid ${locked ? '#475569' : areaColor}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', opacity: locked ? 0.5 : 1 }}>
                              <div style={{ width: 10, height: 10, borderRadius: '50%', background: isDone ? areaColor : 'transparent', border: `2px solid ${areaColor}` }} />
                              <div style={{ flex: 1 }}><div style={{ fontSize: '0.6rem', color: areaColor, fontWeight: 900 }}>{item.area} / {item.stage}</div><h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>{item.content}</h4></div>
                              {resp?.isSynced && <div style={{ fontSize: '0.5rem', color: 'var(--te-emerald-500)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>SYNCED</div>}
                            </div>
                         );
                       })}
                    </div>
                 </div>
               )}
               {viewMode === 'map' && <DecisionMap items={visibleItems.filter(it => showActions || (String(it.itemType || '').toLowerCase() !== 'action'))} allItems={activeBackboneItems} responses={currentCase.responses} stagesList={stagesList} onNodeClick={setSelectedItemId} isEditMode={isEditMode} isDarkMode={isDarkMode} onSaveStandard={handleSaveStandard} stagesData={activeBackboneStages} areas={activeBackboneAreas} onAddDependency={handleAddDependency} onUpdateDependency={handleUpdateDependency} onDeleteNode={handleDeleteStandardItem} />}
               {viewMode === 'executive_map' && <ExecutiveDecisionMap items={visibleItems} responses={currentCase.responses} stages={stagesList} areas={activeBackboneAreas} onNodeClick={setSelectedItemId} />}

               {isAuditLogOpen && (
                  <div className="te-glass" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '450px', background: 'var(--te-bg-card)', borderLeft: '1px solid var(--te-border)', zIndex: 110, display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)' }}>
                     <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--te-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--te-text-main)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategic Overview</h3>
                        <button onClick={() => setIsAuditLogOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--te-text-muted)', cursor: 'pointer' }}>
                           <X size={20} />
                        </button>
                     </div>
                     <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#090a10', color: '#00ff41', fontFamily: 'monospace' }}>
                        {answeredResponses.map((r, idx) => {
                          const item = activeBackboneItems.find(i => i.id === r.itemId); if (!item) return null;
                          return (
                            <div key={r.itemId} style={{ marginBottom: '1.5rem', paddingLeft: '0.75rem', borderLeft: '1px solid #00ff4133' }}>
                               <div style={{ fontSize: '0.75rem', color: '#00ff41', fontWeight: 950, letterSpacing: '0.02em', marginBottom: '0.3rem' }}>{item.content.toUpperCase()}</div>
                               <div style={{ fontSize: '0.8rem', color: 'white', marginTop: '0.25rem', lineHeight: '1.4' }}>{String(r.value)}</div>
                            </div>
                          );
                        })}
                     </div>
                  </div>
               )}
            </div>
          </>
        )}
      </main>

      {selectedItemId && (
        <>
          <div onClick={() => setSelectedItemId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 200 }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '500px', zIndex: 210, background: 'var(--te-bg-card)', borderLeft: '1px solid var(--te-border)' }}>
            <QuestionDetailPanel item={activeBackboneItems.find(i => i.id === selectedItemId) || null} response={currentCase?.responses[selectedItemId!] || null} onClose={() => setSelectedItemId(null)} onResponseChange={handleDetailUpdate} allResponses={currentCase?.responses || {}} allItems={activeBackboneItems} isEditMode={isEditMode} onEditModeToggle={() => setIsEditMode(!isEditMode)} onItemUpdate={handleUpdateStandardItem} onItemDelete={handleDeleteStandardItem} onItemDuplicate={handleDuplicateTask} availableAreas={activeBackboneAreas} availableStages={activeBackboneStages} loopDb={loopDb} dbName={loopDbName} onLoopDbChange={(db, name) => { setLoopDb(db); setLoopDbName(name); }} />
          </div>
        </>
      )}

      {isWizardOpen && <ChecklistWizard existingCases={workspace?.cases || []} onCancel={() => setIsWizardOpen(false)} onComplete={(newCase, sourceId, excelBackbone) => handleCreateNew(newCase, sourceId, excelBackbone)} />}
      {isEditorOpen && <StructureEditor questions={activeBackboneItems} stages={activeBackboneStages} areas={activeBackboneAreas} onSave={handleSaveStandard} onClose={() => setIsEditorOpen(false)} responses={currentCase?.responses} onResponseUpdate={handleDetailUpdate} />}
    </div>
  );
};
