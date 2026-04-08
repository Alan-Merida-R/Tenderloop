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
  FileText, FileSpreadsheet, Sun, Moon, PieChart, Activity, Unlock
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
    // 1. Base filter by logic
    let items = getVisibleItems(activeBackboneItems, currentCase.responses);
    
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
    
    if (selectedStages.length > 0) items = items.filter(i => selectedStages.includes(i.stage));
    if (hideCommon) items = items.filter(i => i.stage.toLowerCase() !== 'intake' && i.stage.toLowerCase() !== 'common');
    
    return items;
  }, [activeBackboneItems, currentCase, searchQuery, selectedAreas, selectedStages, hideCommon]);

  const areaStatuses = useMemo(() => getAreaStatus(activeBackboneItems, currentCase?.responses || {}), [activeBackboneItems, currentCase]);
  const stagesList = useMemo(() => activeBackboneStages.filter(s => s.active !== false).sort((a,b) => a.order - b.order).map(s => s.name), [activeBackboneStages]);

  const answeredResponses = useMemo(() => {
    if (!currentCase) return [];
    const resps = Object.values(currentCase.responses) as ItemResponse[];
    return resps
      .filter(r => r.status === 'answered' || r.status === 'confirmed')
      .sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [currentCase]);

  // --- STARTUP ---
  useEffect(() => {
    // Suscribirse antes de re-abrir
    workspaceManager.setCallbacks(
      (s) => setWsStatus(s),
      (ws) => setWorkspace(ws)
    );
    
    // Forzar lectura inicial si ya existe en memoria el workspace
    const initialWS = workspaceManager.getWorkspace();
    if (initialWS) {
       setWorkspace(initialWS);
    } else {
       workspaceManager.tryAutoReopen();
    }
    
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

  // --- AUTOMATIC SYNCHRONIZATION ---
  const syncWithLoop = useCallback(() => {
    if (!currentCase || !loopDb || loopDb.length === 0) return;
    
    let hasChanges = false;
    const nextResponses = { ...currentCase.responses };
    
    activeBackboneItems.forEach(item => {
      if (item.linkedTaskId) {
        let loopTask: any = null;
        // Search inside opportunities if it's the JSON structure
        for (const op of (loopDb as any[])) {
           // 1. Check nested tasks (JSON format)
           if (op.tasks && Array.isArray(op.tasks)) {
              loopTask = op.tasks.find((t: any) => {
                const searchId = item.linkedTaskId;
                return String(t.id || '') === searchId || 
                       String(t.Task_ID || '') === searchId ||
                       String(t.TaskID || '') === searchId ||
                       String(t.taskId || '') === searchId ||
                       String(t._id || '') === searchId;
              });
              if (loopTask) break;
           } 
           
           // 2. Check flat rows (Excel format)
           const opId = String(op.id || op.Task_ID || op.TaskID || op.taskId || op._id || '');
           if (opId === item.linkedTaskId) {
              loopTask = op;
              break;
           }
        }

        if (loopTask) {
           const rawStatus = (loopTask.status || loopTask.Status || loopTask.isDone || loopTask.completed || '').toString();
           const loopStatus = rawStatus.trim().toUpperCase();
           const currentResp = nextResponses[item.id];
           
           // SYNC LOGIC: Map many variations of success (Boolean 'true', '1', or Done strings)
           const isDoneVariations = ['DONE', 'TERMINADO', 'COMPLETADO', 'COMPLETED', 'FINALIZADO', 'LISTO', 'TRUE', '1', 'FINISHED', 'CONCLUDED'];
           const isDoneInLoop = isDoneVariations.includes(loopStatus) || loopTask.completed === true || loopTask.isDone === true;
           
           const targetStatus = isDoneInLoop ? 'answered' : 'not_started';
           const targetValue = isDoneInLoop ? 'COMPLETED (LOOP)' : 'PENDING (LOOP)';

           if (!currentResp || currentResp.status !== targetStatus || currentResp.value !== targetValue || !currentResp.isSynced) {
              nextResponses[item.id] = {
                ...(currentResp || { itemId: item.id, isFlagged: false, isLocked: false, note: '' }),
                status: targetStatus,
                value: targetValue,
                isSynced: true,
                updatedAt: new Date().toISOString()
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

  // Trigger sync on Load/Change
  useEffect(() => {
    if (loopDb.length > 0) syncWithLoop();
  }, [loopDb, activeCaseId]);

  // --- ACTIONS --- (Moved up to avoid TDZ)
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
    if (!window.confirm("ARE YOU SURE? This will delete ALL current responses and notes for this project.")) return;
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
      if (updates.value !== undefined && trimmed === '') {
         updates.status = 'not_started';
      } else if (updates.value !== undefined) {
         updates.status = 'answered';
      }
      
      nextResponses[itemId] = {
        ...(nextResponses[itemId] || { itemId, value: '', status: 'not_started', isFlagged: false, isLocked: false, updatedAt: new Date().toISOString() }),
        ...updates,
        updatedAt: new Date().toISOString()
      };
    }
    const nextCase = { ...currentCase, responses: nextResponses };
    const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c) };
    setWorkspace(updatedWs);
    workspaceManager.markDirty(updatedWs);
  };

  const handleExportWordAction = () => exportToWord(currentCase!, activeBackboneItems);
  const handleExportExcelAction = () => exportToExcel(currentCase!, activeBackboneItems, activeBackboneStages, activeBackboneAreas);

  const handleCreateNew = (newCase: ExecutiveFlowCase, sourceId?: string, excelBackbone?: any) => {
    if (!workspace) return;
    
    let sourceSnapshot = workspace.standard;
    if (excelBackbone) {
      sourceSnapshot = excelBackbone;
    } else if (sourceId) {
      const source = workspace.cases.find(c => c.id === sourceId);
      if (source?.snapshot) {
        sourceSnapshot = source.snapshot;
      }
    }

    const createRes = (id: string, val: any) => {
       const trimmed = String(val || '').trim();
       return { 
          itemId: id, 
          value: val, 
          status: trimmed === '' ? 'not_started' : 'answered', 
          updatedAt: new Date().toISOString(), 
          isFlagged: false, 
          isLocked: false 
       } as ItemResponse;
    };

    const initialResponses: Record<string, ItemResponse> = {
      'SYS_ALIAS': createRes('SYS_ALIAS', newCase.metadata.name),
      'SYS_OPID': createRes('SYS_OPID', newCase.loopId),
      'SYS_COMPANY': createRes('SYS_COMPANY', newCase.metadata.customer),
      'SYS_AMOUNT': createRes('SYS_AMOUNT', newCase.initialWizData.estimatedAmount),
      'SYS_ADDRESS': createRes('SYS_ADDRESS', newCase.initialWizData.customerAddress),
      'SYS_DUEDATE': createRes('SYS_DUEDATE', newCase.initialWizData.dueDate),
      'SYS_SELLER': createRes('SYS_SELLER', newCase.initialWizData.sellerName)
    };

    const baseStage = { id: 'STG_INTAKE', name: 'Intake', order: 0, active: true };
    const baseArea = { id: 'AREA_GENERAL', name: 'General', order: 0, active: true, color: '#3b82f6' };

    const withSnapshot = { 
      ...newCase, 
      responses: initialResponses,
      snapshot: { 
        questions: [...getSystemItems(), ...sourceSnapshot.questions].map(q => ({...q, active: true})), 
        stages: [baseStage, ...sourceSnapshot.stages.filter(s => s.name !== 'Intake')], 
        areas: [baseArea, ...sourceSnapshot.areas.filter(a => a.name !== 'General')] 
      } 
    };
    const updated = { ...workspace, cases: [...workspace.cases, withSnapshot] };
    setWorkspace(updated);
    setActiveCaseId(withSnapshot.id);
    workspaceManager.markDirty(updated);
    setIsWizardOpen(false);
  };

  const handleExcelBackboneImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const structure = parseExcelSheet(buffer);
        // ... rest of logic
      } catch (err) {
        alert("Failed to parse Excel Backbone.");
      }
    };
    reader.readAsArrayBuffer(file);
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
        setWorkspace(updated);
        setActiveCaseId(nc.id);
        workspaceManager.markDirty(updated);
      } catch (err) { alert("Excel Import failed."); }
      finally { setIsImporting(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className={`te-app-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`} style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--te-bg-app)', color: 'var(--te-text-main)', overflow: 'hidden' }}>
      {!workspace && <ZeroStateOverlay onOpenDB={() => workspaceManager.openWorkspace()} onNewDB={() => workspaceManager.newWorkspace()} />}
      
      {/* SIDEBAR */}
      <aside className="te-sidebar" style={{ width: '260px', background: 'var(--te-primary-900)', color: 'white', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--te-border)', zIndex: 100 }}>
        <div style={{ padding: '2rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 950, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: 14, height: 14, background: 'var(--te-accent-500)', borderRadius: '3px', rotate: '45deg' }} />
            Tender Flow
          </h1>
          <p style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Strategic Matrix v3.1</p>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
          <button onClick={() => setIsWizardOpen(true)} className="te-btn te-btn-primary" style={{ width: '100%', marginBottom: '1.5rem', background: 'var(--te-emerald-500)' }}><Plus size={16} /> NEW CHECKLIST</button>
          
          <div onClick={() => setIsProjectsCollapsed(!isProjectsCollapsed)} style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.4, padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
            PROJECTS <ChevronDown size={12} style={{ transform: isProjectsCollapsed ? 'rotate(-90deg)' : '' }} />
          </div>
          {!isProjectsCollapsed && workspace?.cases.map(c => (
            <div key={c.id} onClick={() => setActiveCaseId(c.id)} style={{ padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: currentCase?.id === c.id ? 'rgba(59,130,246,0.15)' : 'transparent', color: currentCase?.id === c.id ? 'var(--te-accent-500)' : 'rgba(255,255,255,0.6)', fontWeight: currentCase?.id === c.id ? 800 : 500, overflow: 'hidden' }}>
               <Database size={14} style={{ flexShrink: 0 }} /> 
               <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.metadata.name}</span>
            </div>
          ))}

          <div style={{ padding: '1.5rem 1rem 0.5rem 1rem', fontSize: '0.65rem', fontWeight: 900, opacity: 0.4 }}>STATEMENTS</div>
          {stagesList.map(stg => {
            const isSelected = selectedStages.includes(stg);
            return (
              <div key={stg} onClick={() => {
                const newList = isSelected ? selectedStages.filter(s => s !== stg) : [...selectedStages, stg];
                setSelectedStages(newList);
              }} style={{ 
                padding: '0.6rem 1rem', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontSize: '0.75rem', 
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: isSelected ? 'var(--te-emerald-400)' : 'rgba(255,255,255,0.4)', 
                background: isSelected ? 'rgba(16,185,129,0.1)' : 'transparent',
                fontWeight: isSelected ? 900 : 500,
                opacity: selectedStages.length > 0 && !isSelected ? 0.3 : 1,
                transition: 'all 0.2s'
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid currentColor', background: isSelected ? 'currentColor' : 'transparent' }} />
                <span style={{ letterSpacing: '0.02em' }}>{stg.toUpperCase()}</span>
              </div>
            );
          })}
          
          <div style={{ padding: '1.5rem 1rem 0.5rem 1rem', fontSize: '0.65rem', fontWeight: 900, opacity: 0.4 }}>BACKBONE</div>
          <div onClick={() => setIsEditorOpen(true)} style={{ padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
            <LayoutList size={14} /> STRUCTURE EDITOR
          </div>
        </nav>

        <div style={{ padding: '1.5rem' }}>
           <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                 <div>
                   <div style={{ fontSize: '0.6rem', fontWeight: 900, opacity: 0.5 }}>WORKSPACE BD</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--te-accent-500)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspace?.metadata.name || 'No DB'}</div>
                 </div>
                 <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => workspaceManager.openWorkspace()} title="Open DB" style={{ background: 'var(--te-primary-700)', border: 'none', padding: '6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><FolderOpen size={14} /></button>
                    <button onClick={() => workspaceManager.newWorkspace()} title="New DB" style={{ background: 'var(--te-primary-700)', border: 'none', padding: '6px', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><Plus size={14} /></button>
                 </div>
              </div>
              <div style={{ fontSize: '0.6rem', color: wsStatus === 'Synced' ? 'var(--te-emerald-500)' : 'var(--te-amber-500)' }}>● {wsStatus.toUpperCase()}</div>
           </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {!currentCase ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <button onClick={() => setIsWizardOpen(true)} className="te-btn te-btn-primary" style={{ padding: '1.2rem 3rem' }}><Plus size={24} /> START NEW CHECKLIST</button>
          </div>
        ) : (
          <>
            <header style={{ padding: '1.5rem 2.5rem', borderBottom: '1px solid var(--te-border)', background: 'var(--te-bg-app)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1.5rem', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0, flex: '1 1 auto' }}>
                     <div style={{ minWidth: 'fit-content', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--te-accent-500)', marginBottom: '0.1rem' }}>STRATEGIC PROJECT</div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 950, letterSpacing: '-0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentCase.metadata.name}</h2>
                     </div>
                     <div className="te-search-bar" style={{ position: 'relative', width: '200px', flex: '0 1 200px', minWidth: '100px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                        <input 
                          style={{ 
                            width: '100%', 
                            background: 'var(--te-bg-card-alt)', 
                            border: '1px solid var(--te-border)', 
                            borderRadius: '50px', 
                            padding: '0.35rem 0.8rem 0.35rem 2.2rem', 
                            outline: 'none', 
                            fontSize: '0.75rem',
                            color: 'white' 
                          }} 
                          placeholder="Search..." 
                          value={searchQuery} 
                          onChange={e => setSearchQuery(e.target.value)} 
                        />
                     </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', background: 'var(--te-bg-card-alt)', padding: '3px', borderRadius: '10px', border: '1px solid var(--te-border)', marginRight: '0.25rem' }}>
                       <button onClick={() => setViewMode('checklist')} className={`te-btn ${viewMode === 'checklist' ? 'te-btn-primary' : ''}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem', fontWeight: 950 }}>ROADMAP</button>
                       <button onClick={() => setViewMode('map')} className={`te-btn ${viewMode === 'map' ? 'te-btn-primary' : ''}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem', fontWeight: 950 }}>FLOW</button>
                       <button onClick={() => setViewMode('executive_map')} className={`te-btn ${viewMode === 'executive_map' ? 'te-btn-primary' : ''}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem', fontWeight: 950 }}>STRATEGIST</button>
                    </div>
                    
                    <button onClick={handleExportExcelAction} className="te-btn te-btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', fontWeight: 900 }}><FileSpreadsheet size={13} /> EXCEL</button>
                    <button onClick={handleExportWordAction} className="te-btn te-btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', fontWeight: 900 }}><FileText size={13} /> WORD</button>
                    <button onClick={() => setHideCommon(!hideCommon)} className={`te-btn te-btn-outline ${hideCommon ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', fontWeight: 900 }}>{hideCommon ? <EyeOff size={13} /> : <Eye size={13} />} COMMON</button>
                    <button onClick={() => setShowActions(!showActions)} className={`te-btn te-btn-outline ${showActions ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', fontWeight: 900, border: showActions ? '1px solid var(--te-emerald-500)' : '1px solid var(--te-border)', color: showActions ? 'var(--te-emerald-500)' : 'inherit' }}>{showActions ? <Zap size={13} /> : <Zap size={13} style={{ opacity: 0.5 }} />} ACTIONS</button>
                    <button onClick={() => setIsEditMode(!isEditMode)} className={`te-btn te-btn-outline ${isEditMode ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', fontWeight: 900 }}>{isEditMode ? <Lock size={13} /> : <Unlock size={13} />} {isEditMode ? 'SAVE' : 'ENGINE'}</button>
                    <button onClick={handleToggleTheme} className="te-btn te-btn-outline" style={{ padding: '6px' }}>{isDarkMode ? <Sun size={14} /> : <Moon size={14} />}</button>
                  </div>
               </div>

               {/* DEPARTMENTS CARD LIST */}
               <div style={{ display: 'flex', gap: '0.8rem', overflowX: 'auto', paddingBottom: '0.5rem' }} className="hide-scrollbar">
                   {areaStatuses.map(status => {
                     const areaDef = activeBackboneAreas.find(a => a.name === status.area);
                     const areaColor = areaDef?.color || 'var(--te-accent-500)';
                     const isFullyAnswered = status.percentage === 100;
                     const isSelected = selectedAreas.includes(status.area);
                     
                     return (
                       <div 
                         key={status.area} 
                         onClick={() => {
                            const newList = isSelected ? selectedAreas.filter(a => a !== status.area) : [...selectedAreas, status.area];
                            setSelectedAreas(newList);
                         }} 
                         style={{ 
                           minWidth: '180px', 
                           padding: '1.2rem', 
                           borderRadius: '16px', 
                           background: 'var(--te-bg-card)', 
                           border: `1px solid ${isSelected ? areaColor : 'var(--te-border)'}`, 
                           borderLeft: `4px solid ${areaColor}`,
                           cursor: 'pointer',
                           boxShadow: isSelected ? `0 0 15px ${areaColor}33` : 'none',
                           transition: 'all 0.2s',
                           opacity: selectedAreas.length > 0 && !isSelected ? 0.4 : 1
                         }}
                       >
                         <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--te-text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            DEPARTMENT
                            <div style={{ 
                               width: '8px', 
                               height: '8px', 
                               borderRadius: '50%', 
                               border: `1.5px solid ${isFullyAnswered ? areaColor : 'var(--te-text-muted)'}`,
                               background: isFullyAnswered ? areaColor : 'transparent',
                               boxShadow: isFullyAnswered ? `0 0 8px ${areaColor}` : 'none'
                             }} />
                         </div>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <span style={{ fontSize: '0.9rem', fontWeight: 950, color: isSelected ? areaColor : 'var(--te-text-main)' }}>{status.area}</span>
                           <span style={{ fontSize: '0.9rem', fontWeight: 950, color: isFullyAnswered ? 'var(--te-emerald-500)' : areaColor }}>{status.percentage}%</span>
                         </div>
                         <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', marginTop: '0.75rem', borderRadius: 10, overflow: 'hidden' }}>
                           <div style={{ height: '100%', width: `${status.percentage}%`, background: isFullyAnswered ? 'var(--te-emerald-500)' : areaColor }} />
                         </div>
                       </div>
                     );
                   })}
                </div>
            </header>

            {/* CONTENT AREA */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
               {viewMode === 'checklist' && (
                 <div style={{ height: '100%', overflowY: 'auto', padding: '2rem 2.5rem' }}>
                    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                       {visibleItems
                         .filter(it => showActions || (String(it.itemType || '').toLowerCase() !== 'action'))
                         .map(item => {
                         const resp = currentCase.responses[item.id];
                         const { locked } = isItemLocked(item, currentCase.responses);
                         const currentStatus = evaluateStatus(resp);
                         const isDone = currentStatus === 'answered' || currentStatus === 'confirmed';
                         const areaDef = activeBackboneAreas.find(a => a.name === item.area);
                         const areaColor = areaDef?.color || 'var(--te-accent-500)';
                         
                         return (
                            <div key={item.id} onClick={() => setSelectedItemId(item.id)} style={{ 
                               padding: '1.2rem', 
                               borderRadius: '16px', 
                               background: locked ? 'rgba(0,0,0,0.4)' : 'var(--te-bg-card)', 
                               border: `1px solid ${selectedItemId === item.id ? areaColor : (locked ? 'rgba(255,255,255,0.05)' : 'var(--te-border)')}`, 
                               borderLeft: `5px solid ${locked ? '#475569' : areaColor}`,
                               cursor: 'pointer', 
                               display: 'flex', 
                               alignItems: 'center', 
                               gap: '1.25rem',
                               transition: 'all 0.3s ease'
                             }}>
                              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                 {locked ? (
                                   <Lock size={16} color="#64748b" style={{ minWidth: '12px' }} />
                                 ) : (
                                   <div style={{ 
                                      width: '12px', 
                                      height: '12px', 
                                      borderRadius: '50%', 
                                      border: `2.5px solid ${areaColor}`,
                                      background: isDone ? areaColor : 'transparent',
                                      boxShadow: isDone ? `0 0 10px ${areaColor}` : 'none'
                                   }} />
                                 )}
                                 {resp?.isFlagged && <div style={{ position: 'absolute', top: -10, right: -10, color: 'var(--te-rose-500)' }}><Flag size={12} fill="currentColor" /></div>}
                              </div>
                              <div style={{ flex: 1 }}>
                                 <div style={{ fontSize: '0.7rem', color: locked ? '#64748b' : areaColor, fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>{item.area.toUpperCase()} / {item.stage.toUpperCase()}</span>
                                    {resp?.isSynced && (
                                       <span style={{ 
                                         display: 'inline-flex', 
                                         alignItems: 'center', 
                                         gap: '3px', 
                                         color: 'var(--te-emerald-500)', 
                                         fontSize: '0.55rem', 
                                         background: 'rgba(16, 185, 129, 0.1)', 
                                         padding: '2px 6px', 
                                         borderRadius: '4px',
                                         fontWeight: 900,
                                         letterSpacing: '0.05em'
                                       }}>
                                          <RefreshCw size={8} className="spin-slow" /> SYNCED
                                       </span>
                                    )}
                                 </div>
                                 <h4 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: locked ? '#475569' : 'var(--te-text-main)' }}>{item.content}</h4>
                              </div>
                            </div>
                         );
                       })}
                    </div>
                 </div>
               )}

               {viewMode === 'map' && (
                 <div style={{ height: '100%', width: '100%' }}>
                    <DecisionMap 
                      items={visibleItems} 
                      allItems={activeBackboneItems} 
                      responses={currentCase.responses} 
                      stagesList={stagesList} 
                      onNodeClick={setSelectedItemId} 
                      isEditMode={isEditMode} 
                      isDarkMode={isDarkMode} 
                      onSaveStandard={handleSaveStandard}
                      stagesData={activeBackboneStages}
                      areas={activeBackboneAreas}
                      onAddDependency={handleAddDependency}
                      onUpdateDependency={handleUpdateDependency}
                      onDeleteNode={handleDeleteStandardItem}
                      minZoom={0.1}
                      controlsStyle={{ background: 'var(--te-primary-900)', border: '1px solid var(--te-border)', borderRadius: '8px' }}
                    />
                 </div>
               )}

               {viewMode === 'executive_map' && (
                 <div style={{ height: '100%', width: '100%' }}>
                    <ExecutiveDecisionMap items={visibleItems} responses={currentCase.responses} stages={stagesList} areas={activeBackboneAreas} onNodeClick={setSelectedItemId} />
                 </div>
               )}

               {/* COMPACT AUDIT LOG SIDEBAR */}
               {isAuditLogOpen && (
                 <div className="te-glass" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '400px', background: 'rgba(10, 12, 16, 0.95)', borderLeft: '1px solid var(--te-border)', zIndex: 110, display: 'flex', flexDirection: 'column', color: 'var(--te-text-main)' }}>
                    <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--te-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--te-primary-900)' }}>
                       <span style={{ fontWeight: 950, letterSpacing: '0.1em', color: 'var(--te-accent-500)', fontSize: '0.8rem' }}>AUDIT LOG</span>
                       <button onClick={() => setIsAuditLogOpen(false)} style={{ background: 'var(--te-bg-card)', border: '1px solid var(--te-border)', padding: '6px', borderRadius: '8px', color: 'var(--te-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 900 }}>CLOSE</span>
                          <X size={14} />
                       </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                        {answeredResponses
                          .filter(r => {
                            const item = activeBackboneItems.find(i => i.id === r.itemId);
                            if (!item) return false;
                            const isCommon = item.stage.toLowerCase() === 'common' || item.stage.toLowerCase() === 'intake';
                            if (hideCommon && isCommon) return false;
                            const val = String(r.value || '').trim();
                            if (val === '') return false;
                            if (r.status === 'not_started') return false;
                            return true;
                          })
                          .map(r => {
                           const item = activeBackboneItems.find(i => i.id === r.itemId);
                           if (!item) return null;
                           return (
                              <div key={r.itemId} style={{ padding: '0.75rem 1rem', borderLeft: '2px solid var(--te-accent-500)', background: 'rgba(255,255,255,0.02)', marginBottom: '1rem' }}>
                                 <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--te-text-main)', marginBottom: '0.2rem' }}>{item.content}</div>
                                 <div style={{ fontSize: '0.85rem', color: 'var(--te-emerald-500)', fontWeight: 600 }}>{String(r.value)}</div>
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

      {/* OVERLAYS */}
      {selectedItemId && (
        <>
          <div onClick={() => setSelectedItemId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 200 }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '500px', zIndex: 210, background: 'var(--te-bg-card)', borderLeft: '1px solid var(--te-border)' }}>
            <QuestionDetailPanel 
              item={activeBackboneItems.find(i => i.id === selectedItemId) || null} response={currentCase?.responses[selectedItemId!] || null}
              onClose={() => setSelectedItemId(null)} onResponseChange={handleDetailUpdate}
              allResponses={currentCase?.responses || {}} allItems={activeBackboneItems}
              isEditMode={isEditMode} onEditModeToggle={() => setIsEditMode(!isEditMode)}
              onItemUpdate={handleUpdateStandardItem} onItemDelete={handleDeleteStandardItem} onItemDuplicate={handleDuplicateTask} availableAreas={activeBackboneAreas}
              availableStages={activeBackboneStages}
              loopDb={loopDb}
              dbName={loopDbName}
              onLoopDbChange={(db, name) => {
                setLoopDb(db);
                setLoopDbName(name);
              }}
            />
          </div>
        </>
      )}

      {isWizardOpen && (
        <ChecklistWizard 
          existingCases={workspace?.cases || []}
          onCancel={() => setIsWizardOpen(false)} 
          onComplete={(newCase, sourceId, excelBackbone) => handleCreateNew(newCase, sourceId, excelBackbone)} 
        />
      )}
      {isEditorOpen && (
        <StructureEditor 
          questions={activeBackboneItems} stages={activeBackboneStages} areas={activeBackboneAreas}
          onSave={handleSaveStandard} onClose={() => setIsEditorOpen(false)}
          responses={currentCase?.responses}
          onResponseUpdate={handleDetailUpdate}
        />
      )}
    </div>
  );
};
