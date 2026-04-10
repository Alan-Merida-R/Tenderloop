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
  FileText, FileSpreadsheet, Sun, Moon, PieChart, Activity, Unlock, Terminal, Check
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
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>([]);
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
  const [isMeetingMode, setIsMeetingMode] = useState(false);
  const [hideAnswered, setHideAnswered] = useState(false);
  const [hideLocked, setHideLocked] = useState(false);
  const [expandedInlineId, setExpandedInlineId] = useState<string | null>(null);
  const [isDelivDropdownOpen, setIsDelivDropdownOpen] = useState(false);

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
  const deliverablesData = useMemo(() => workspace?.standard.deliverables || [], [workspace]);

  const activeBackboneItems = useMemo(() => currentCase?.snapshot?.questions || standardItems, [currentCase, standardItems]);
  const activeBackboneStages = useMemo(() => currentCase?.snapshot?.stages || stagesData, [currentCase, stagesData]);
  const activeBackboneAreas = useMemo(() => currentCase?.snapshot?.areas || areasData, [currentCase, areasData]);
  const activeBackboneDeliverables = useMemo(() => currentCase?.snapshot?.deliverables || deliverablesData, [currentCase, deliverablesData]);

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
    if (selectedDeliverables.length > 0) items = items.filter(i => i.deliverableTarget && i.deliverableTarget.some(d => selectedDeliverables.includes(d)));
    if (hideCommon) items = items.filter(i => i.stage.toLowerCase() !== 'intake' && i.stage.toLowerCase() !== 'common');
    
    // User Roadmap Deduplication: Only show one mirror point
    if (viewMode === 'checklist') {
       const seenSyncIds = new Set<string>();
       items = items.filter(item => {
         if (item.syncId) {
           if (seenSyncIds.has(item.syncId)) return false;
           seenSyncIds.add(item.syncId);
         }
         return true;
       });
    }

    if (isMeetingMode) {
       if (hideAnswered) {
          items = items.filter(item => {
            const resp = currentCase.responses[item.id];
            return !resp || (resp.status !== 'answered' && resp.status !== 'confirmed');
          });
       }
       if (hideLocked) {
          items = items.filter(item => !isItemLocked(item, currentCase.responses).locked);
       }
       return items;
    }

    if (hideAnswered) {
       items = items.filter(item => {
         const resp = currentCase.responses[item.id];
         return !resp || (resp.status !== 'answered' && resp.status !== 'confirmed');
       });
    }

    if (hideLocked) {
       items = items.filter(item => !isItemLocked(item, currentCase.responses).locked);
    }

    return items;
  }, [activeBackboneItems, currentCase, searchQuery, selectedAreas, selectedStages, hideCommon, isEditMode, viewMode, isMeetingMode, hideAnswered, hideLocked, selectedDeliverables]);

  const areaStatuses = useMemo(() => getAreaStatus(activeBackboneItems, currentCase?.responses || {}), [activeBackboneItems, currentCase]);
  const stagesList = useMemo(() => activeBackboneStages.filter(s => s.active !== false).sort((a,b) => a.order - b.order).map(s => s.name), [activeBackboneStages]);

  const answeredResponses = useMemo(() => {
    if (!currentCase) return [];
    const visibleIds = new Set(visibleItems.map(i => i.id));
    const resps = Object.values(currentCase.responses) as ItemResponse[];
    
    const seenSyncIds = new Set<string>();
    const uniqueResps: ItemResponse[] = [];

    resps
      .filter(r => (r.status === 'answered' || r.status === 'confirmed') && visibleIds.has(r.itemId))
      .sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .forEach(r => {
        const item = activeBackboneItems.find(i => i.id === r.itemId);
        const sId = item?.syncId;
        if (sId) {
          if (!seenSyncIds.has(sId)) {
            seenSyncIds.add(sId);
            uniqueResps.push(r);
          }
        } else {
          uniqueResps.push(r);
        }
      });

    return uniqueResps;
  }, [currentCase, visibleItems, activeBackboneItems]);

  const hasPendingActions = useMemo(() => {
    if (!currentCase) return false;
    // Only glow for actions that are logic-unlocked (visible in flow)
    const logicVisibleItems = getVisibleItems(activeBackboneItems, currentCase.responses);
    return logicVisibleItems.some(i => 
      i.itemType === 'action' && 
      (!currentCase.responses[i.id] || 
       currentCase.responses[i.id].status === 'not_started' || 
       currentCase.responses[i.id].status === 'pending')
    );
  }, [currentCase, activeBackboneItems]);

  const handleDeleteCase = useCallback((caseId: string) => {
    if (!workspace) return;
    if (workspace.cases.length <= 1) {
       alert("Cannot delete the last remaining project.");
       return;
    }
    if (!window.confirm("ARE YOU SURE YOU WANT TO DELETE THIS PROJECT? This action cannot be undone.")) return;
    
    const updated = { ...workspace, cases: workspace.cases.filter(c => c.id !== caseId) };
    setWorkspace(updated);
    if (activeCaseId === caseId) setActiveCaseId(updated.cases[0].id);
    workspaceManager.markDirty(updated);
  }, [workspace, activeCaseId]);

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

  const handleSaveStandard = useCallback((data: any) => {
    if (!workspace) return;
    if (currentCase && currentCase.snapshot) {
       const updatedCase = { ...currentCase, snapshot: { ...currentCase.snapshot, ...data } };
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
    
    const targetItem = currentCase.snapshot.questions.find(q => q.id === itemId);
    const syncableFields: (keyof StandardItem)[] = ['content', 'itemType', 'responseType', 'allowedValues', 'priority', 'mandatory', 'tags', 'deliverableTarget'];
    const hasSyncableChanges = Object.keys(updates).some(k => syncableFields.includes(k as any));

    const updatedSnapshot = { 
      ...currentCase.snapshot, 
      questions: currentCase.snapshot.questions.map(q => {
        const isTarget = q.id === itemId;
        const isMirror = targetItem?.syncId && q.syncId === targetItem.syncId;
        
        if (isTarget) return { ...q, ...updates };
        if (isMirror && hasSyncableChanges) {
          const syncUpdates: any = {};
          Object.keys(updates).forEach(k => {
            if (syncableFields.includes(k as any)) syncUpdates[k] = (updates as any)[k];
          });
          return { ...q, ...syncUpdates };
        }
        return q;
      }) 
    };
    handleSaveStandard(updatedSnapshot);
  }, [currentCase, handleSaveStandard, workspace]);

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
    
    // Ensure both items share a syncId to keep responses in sync
    const syncId = target.syncId || target.id;
    let baseQuestions = currentCase.snapshot.questions;

    if (!target.syncId) {
       // Update original to have the syncId too in the same snapshot update
       baseQuestions = baseQuestions.map(q => q.id === taskId ? { ...q, syncId } : q);
    }

    const clone = { 
      ...target, 
      id: `Q_CLONE_${Date.now()}`, 
      syncId,
      content: `${target.content} (Copy)`, 
      visualPosition: { x: (target.visualPosition?.x || 0) + 100, y: (target.visualPosition?.y || 0) + 100 } 
    };
    handleSaveStandard({ ...currentCase.snapshot, questions: [...baseQuestions, clone] });
  }, [currentCase, handleSaveStandard, workspace]);

  const handleCloneTask = useCallback((taskId: string) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    const target = currentCase.snapshot.questions.find(q => q.id === taskId);
    if (!target) return;

    const clone = { 
      ...target, 
      id: `Q_CLONE_${Date.now()}`, 
      syncId: undefined, // CLONE is independent
      content: `${target.content} (Copy)`, 
      visualPosition: { x: (target.visualPosition?.x || 0) + 100, y: (target.visualPosition?.y || 0) + 100 } 
    };
    handleSaveStandard({ ...currentCase.snapshot, questions: [...currentCase.snapshot.questions, clone] });
  }, [currentCase, handleSaveStandard, workspace]);

  const handleAddGlobalDeliverable = useCallback((name: string) => {
    if (!workspace || !currentCase || !currentCase.snapshot) return;
    const exists = (currentCase.snapshot.deliverables || []).some(d => d.name.toLowerCase() === name.toLowerCase());
    if (exists) return;

    const newDeliv = { id: `D_${Date.now()}`, name, order: (currentCase.snapshot.deliverables || []).length + 1, active: true };
    const updated = { ...currentCase.snapshot, deliverables: [...(currentCase.snapshot.deliverables || []), newDeliv] };
    handleSaveStandard(updated);
  }, [currentCase, handleSaveStandard, workspace]);

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
      
      const newResponse = {
        ...(nextResponses[itemId] || { itemId, value: '', status: 'not_started', isFlagged: false, isLocked: false, updatedAt: new Date().toISOString() }),
        ...updates, updatedAt: new Date().toISOString()
      };
      nextResponses[itemId] = newResponse;

      // MIRROR SYNC: Update all other items with the same syncId
      const item = activeBackboneItems.find(i => i.id === itemId);
      if (item?.syncId) {
        activeBackboneItems.forEach(other => {
          if (other.syncId === item.syncId && other.id !== itemId) {
            if (updates === null) {
              delete nextResponses[other.id];
            } else {
              nextResponses[other.id] = {
                ...(nextResponses[other.id] || { itemId: other.id, value: '', status: 'not_started', isFlagged: false, isLocked: false, updatedAt: new Date().toISOString() }),
                ...updates, 
                itemId: other.id,
                updatedAt: new Date().toISOString()
              };
            }
          }
        });
      }
    }
    const nextCase = { ...currentCase, responses: nextResponses };
    const updatedWs = { ...workspace, cases: workspace.cases.map(c => c.id === currentCase.id ? nextCase : c) };
    setWorkspace(updatedWs);
    workspaceManager.markDirty(updatedWs);

    // TWO-WAY SYNC: If this is an action and has a linkedTaskId, update Loop DB too
    const item = activeBackboneItems.find(i => i.id === itemId);
    if (item?.linkedTaskId && loopDb.length > 0 && updates?.value !== undefined) {
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
  const handleExportExcelAction = () => exportToExcel(currentCase!, activeBackboneItems, activeBackboneStages, activeBackboneAreas, activeBackboneDeliverables);

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
        areas: [{ id: 'AREA_GENERAL', name: 'General', order: 0, active: true, color: '#3b82f6' }, ...sourceSnapshot.areas.filter(a => a.name !== 'General')],
        deliverables: (sourceSnapshot as any).deliverables || []
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
          <h1 style={{ fontSize: '1.25rem', fontWeight: 950, display: 'flex', alignItems: 'center', gap: '0.3rem' }}><div style={{ width: 14, height: 14, background: 'var(--te-accent-500)', borderRadius: '3px', rotate: '45deg' }} />Tender Flow</h1>
          <p style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Strategic Matrix v3.1</p>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
          <button onClick={() => setIsWizardOpen(true)} className="te-btn te-btn-primary" style={{ width: '100%', marginBottom: '1.5rem', background: 'var(--te-emerald-500)' }}><Plus size={16} /> NEW CHECKLIST</button>
          <div onClick={() => setIsProjectsCollapsed(!isProjectsCollapsed)} style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.4, padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>PROJECTS <ChevronDown size={12} style={{ transform: isProjectsCollapsed ? 'rotate(-90deg)' : '' }} /></div>
          {!isProjectsCollapsed && workspace?.cases.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.1rem 1rem 0.1rem 0.5rem', marginBottom: '4px' }}>
                <div onClick={() => setActiveCaseId(c.id)} style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: currentCase?.id === c.id ? 'rgba(59,130,246,0.15)' : 'transparent', color: currentCase?.id === c.id ? 'var(--te-accent-500)' : 'rgba(255,255,255,0.6)', fontWeight: currentCase?.id === c.id ? 900 : 500, overflow: 'hidden', flex: 1, border: currentCase?.id === c.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent' }}><Database size={14} style={{ flexShrink: 0 }} /> <span>{c.metadata.name}</span></div>
                {workspace.cases.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteCase(c.id); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.15)', cursor: 'pointer', padding: '6px', borderRadius: '6px' }} title="Delete Project"><Trash2 size={12} /></button>
                )}
            </div>
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
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <button onClick={handleExportExcelAction} className="te-btn te-btn-outline"><FileSpreadsheet size={13} /> EXCEL</button>
                    <button onClick={handleExportWordAction} className="te-btn te-btn-outline"><FileText size={13} /> WORD</button>
                    <div style={{ width: '1px', height: '20px', background: 'var(--te-border)', margin: '0 0.5rem' }} />
                    <button onClick={() => setHideCommon(!hideCommon)} className={`te-btn te-btn-outline ${hideCommon ? 'active' : ''}`}><EyeOff size={13} /> COMMON</button>
                    <button 
                       onClick={() => setShowActions(!showActions)} 
                       className={`te-btn te-btn-outline ${showActions ? 'active' : ''}`}
                       style={{
                          boxShadow: (!showActions && hasPendingActions) ? '0 0 15px var(--te-amber-500)' : 'none',
                          borderColor: (!showActions && hasPendingActions) ? 'var(--te-amber-500)' : 'var(--te-border)',
                          animation: (!showActions && hasPendingActions) ? 'pulse-amber 2s infinite' : 'none'
                       }}
                    >
                       <Zap size={13} color={(!showActions && hasPendingActions) ? 'var(--te-amber-500)' : 'currentColor'} /> ACTIONS
                    </button>
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
                        <input style={{ width: '100%', background: 'var(--te-bg-card-alt)', border: '1px solid var(--te-border)', borderRadius: '50px', padding: '0.5rem 2.4rem 0.5rem 2.4rem', outline: 'none', fontSize: '0.8rem', color: 'white' }} placeholder="Search questions or tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery('')}
                            style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--te-text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                          >
                            <X size={14} />
                          </button>
                        )}
                    </div>
                  </div>
                   <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {viewMode === 'checklist' && (
                        <button 
                          onClick={() => setIsMeetingMode(!isMeetingMode)} 
                          className={`te-btn ${isMeetingMode ? 'te-btn-primary' : 'te-btn-outline'}`} 
                          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1rem', borderRadius: '12px', background: isMeetingMode ? 'var(--te-emerald-500)' : 'transparent', color: isMeetingMode ? 'white' : 'var(--te-text-muted)', border: isMeetingMode ? 'none' : '1px solid var(--te-border)' }}
                        >
                          <MessageSquare size={14} /> RESPONSE
                        </button>
                      )}
                      <button 
                        onClick={() => setHideLocked(!hideLocked)} 
                        className={`te-btn ${hideLocked ? 'active' : 'te-btn-outline'}`} 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1rem', borderRadius: '12px', background: hideLocked ? 'var(--te-rose-600)' : 'transparent', color: hideLocked ? 'white' : 'var(--te-text-muted)', border: hideLocked ? 'none' : '1px solid var(--te-border)' }}
                      >
                        <ShieldAlert size={14} /> MEETING
                      </button>
                      <button onClick={() => setIsAuditLogOpen(!isAuditLogOpen)} className={`te-btn ${isAuditLogOpen ? 'te-btn-primary' : 'te-btn-outline'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 950, padding: '0.6rem 1.25rem', borderRadius: '12px' }}><Terminal size={14} /> OVERVIEW</button>
                   </div>
               </div>
               <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.6rem 0', borderTop: '1px solid rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={() => setIsDelivDropdownOpen(!isDelivDropdownOpen)} 
                      className="te-btn te-btn-outline" 
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem', fontWeight: 950, background: selectedDeliverables.length > 0 ? 'rgba(16, 185, 129, 0.1)' : 'var(--te-bg-card)', padding: '0.4rem 0.8rem', borderRadius: '10px', border: `1px solid ${selectedDeliverables.length > 0 ? 'var(--te-emerald-500)' : 'var(--te-border)'}`, color: selectedDeliverables.length > 0 ? 'var(--te-emerald-500)' : 'var(--te-text-main)' }}
                    >
                      <Filter size={12} color={selectedDeliverables.length > 0 ? 'var(--te-emerald-500)' : 'var(--te-text-muted)'} />
                      {selectedDeliverables.length > 0 ? `${selectedDeliverables.length} SELECTED` : 'ALL DELIVERABLES'}
                      <ChevronDown size={12} style={{ transform: isDelivDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>
                    {isDelivDropdownOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setIsDelivDropdownOpen(false)} />
                        <div className="te-glass" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '0.5rem', minWidth: '280px', zIndex: 120, padding: '0.8rem', borderRadius: '16px', background: 'var(--te-bg-card)', border: '1px solid var(--te-border)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', animation: 'slideInDown 0.2s ease-out' }}>
                           <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--te-border)', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 950, color: 'var(--te-text-muted)', letterSpacing: '0.1em' }}>STRATEGIC_DELIVERABLES</span>
                              {selectedDeliverables.length > 0 && <button onClick={() => setSelectedDeliverables([])} style={{ background: 'transparent', border: 'none', color: 'var(--te-rose-500)', fontSize: '0.65rem', fontWeight: 950, cursor: 'pointer' }}>RESET</button>}
                           </div>
                           <div style={{ maxHeight: '350px', overflowY: 'auto' }} className="hide-scrollbar">
                              {activeBackboneDeliverables.filter(d => d.active).map(deliv => {
                                const isSelected = selectedDeliverables.includes(deliv.name);
                                return (
                                  <div key={deliv.id} onClick={() => setSelectedDeliverables(isSelected ? selectedDeliverables.filter(d => d !== deliv.name) : [...selectedDeliverables, deliv.name])} style={{ padding: '0.7rem 0.9rem', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'transparent', transition: 'all 0.2s', margin: '2px 0' }}>
                                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1px solid ${isSelected ? 'var(--te-emerald-500)' : 'var(--te-border)'}`, background: isSelected ? 'var(--te-emerald-500)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                       {isSelected && <Check size={10} color="white" strokeWidth={4} />}
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 900, color: isSelected ? 'var(--te-emerald-500)' : 'var(--te-text-main)' }}>{deliv.name.toUpperCase()}</span>
                                  </div>
                                );
                              })}
                           </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ width: '1px', height: '16px', background: 'var(--te-border)' }} />
                  <div style={{ display: 'flex', gap: '0.3rem', overflowX: 'auto', flex: 1, paddingBottom: '0.2rem' }} className="hide-scrollbar">
                    {areaStatuses.map(status => {
                      const areaDef = activeBackboneAreas.find(a => a.name === status.area); const areaColor = areaDef?.color || 'var(--te-accent-500)'; const isFullyAnswered = status.percentage === 100; const isSelected = selectedAreas.includes(status.area);
                      return (
                        <div key={status.area} onClick={() => setSelectedAreas(isSelected ? selectedAreas.filter(a => a !== status.area) : [...selectedAreas, status.area])} style={{ minWidth: '150px', padding: '0.6rem 0.8rem', borderRadius: '12px', background: 'var(--te-bg-card)', border: `1px solid ${isSelected ? areaColor : 'var(--te-border)'}`, borderLeft: `3px solid ${areaColor}`, cursor: 'pointer', transition: 'all 0.2s', opacity: selectedAreas.length > 0 && !isSelected ? 0.4 : 1 }}>
                          <div style={{ fontSize: '0.55rem', fontWeight: 900, color: 'var(--te-text-muted)', marginBottom: '0.1rem', display: 'flex', justifyContent: 'space-between' }}>DEPARTMENT <div style={{ width: 5, height: 5, borderRadius: '50%', background: isFullyAnswered ? areaColor : 'transparent', border: `1px solid ${areaColor}` }} /></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.75rem', fontWeight: 900 }}>{status.area}</span><span style={{ fontSize: '0.75rem', fontWeight: 900, color: areaColor }}>{status.percentage}%</span></div>
                        </div>
                      );
                    })}
                  </div>
               </div>
            </header>

            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
               {viewMode === 'checklist' && (
                 <div style={{ height: '100%', overflowY: 'auto', padding: '2rem' }}>
                    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                       {visibleItems.filter(it => showActions || (String(it.itemType || '').toLowerCase() !== 'action')).map(item => {
                         const resp = currentCase.responses[item.id]; const { locked } = isItemLocked(item, currentCase.responses); const currentStatus = evaluateStatus(resp); const isDone = currentStatus === 'answered' || currentStatus === 'confirmed'; const areaColor = activeBackboneAreas.find(a => a.name === item.area)?.color || 'var(--te-accent-500)';
                         return (
                            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', opacity: locked ? 0.6 : 1 }}>
                              <div 
                                onClick={isMeetingMode ? undefined : () => setSelectedItemId(item.id)} 
                                style={{ 
                                  padding: isMeetingMode ? '0.6rem 1rem' : '1rem 1.25rem', 
                                  borderRadius: '12px', 
                                  background: 'var(--te-bg-card)', 
                                  border: `1px solid ${selectedItemId === item.id ? areaColor : 'var(--te-border)'}`, 
                                  borderLeft: `4px solid ${locked ? 'var(--te-text-muted)' : areaColor}`, 
                                  cursor: isMeetingMode ? 'default' : 'pointer', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '1rem', 
                                  opacity: locked && !isMeetingMode ? 0.5 : 1,
                                  filter: locked && isMeetingMode ? 'grayscale(0.8)' : 'none'
                                }}
                              >
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isDone ? areaColor : 'transparent', border: `2px solid ${areaColor}`, opacity: locked ? 0.4 : 1 }} />
                                <div style={{ flex: 1 }}>
                                   <div style={{ fontSize: '0.55rem', color: locked ? 'var(--te-text-muted)' : areaColor, fontWeight: 900, opacity: 0.8 }}>{item.area} / {item.stage}</div>
                                   <h4 style={{ fontSize: isMeetingMode ? '0.9rem' : '1rem', fontWeight: 800, margin: 0, color: locked ? 'var(--te-text-muted)' : 'var(--te-text-main)' }}>{item.content}</h4>
                                </div>
                                {item.syncId && <div style={{ fontSize: '0.45rem', color: 'var(--te-emerald-500)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 5px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px', opacity: locked ? 0.3 : 1 }}><LinkIcon size={7} /> MIRROR</div>}
                                {locked && isMeetingMode && <Lock size={12} color="var(--te-text-muted)" style={{ opacity: 0.5 }} />}
                              </div>
                               {isMeetingMode && (
                                  <div style={{ 
                                    padding: '0.8rem 1rem', 
                                    background: 'rgba(255,255,255,0.03)', 
                                    borderRadius: '16px', 
                                    border: '1px solid var(--te-border)', 
                                    backdropFilter: 'blur(10px)',
                                    marginLeft: '1.5rem', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '0.75rem',
                                    position: 'relative',
                                    pointerEvents: locked ? 'none' : 'auto',
                                    filter: locked ? 'blur(0.8px) grayscale(0.5)' : 'none',
                                    opacity: locked ? 0.6 : 1,
                                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                                  }}>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <div style={{ fontSize: '0.55rem', fontWeight: 950, color: 'var(--te-text-muted)', opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                          BOARD :: {
                                            (item.itemType === 'question' && (!item.allowedValues || item.allowedValues.length === 0)) ? 'OPEN QUESTION' :
                                            item.responseType === 'boolean' ? 'DECISION' : 
                                            item.responseType === 'text' ? 'OPEN QUESTION' : 
                                            item.responseType === 'date' ? 'TARGET DATE' : 
                                            item.responseType === 'link' ? 'RESOURCE / LINK' : 
                                            item.responseType === 'select' ? 'SELECTION' : 
                                            item.responseType === 'number' ? 'NUMERIC VALUE' : 
                                            item.responseType.toUpperCase()
                                          }
                                       </div>
                                       {!locked && resp?.value && (
                                         <button 
                                           onClick={(e) => { e.stopPropagation(); handleDetailUpdate(item.id, { value: '', status: 'not_started' }); }}
                                           style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--te-text-muted)', opacity: 0.5, transition: 'all 0.2s' }}
                                           title="Reset Response"
                                         >
                                           <X size={10} />
                                         </button>
                                       )}
                                     </div>

                                     {/* MAIN INPUT AREA (DYNAMIC PER TYPE) */}
                                     {item.responseType === 'text' ? (
                                       <textarea 
                                          value={resp?.value || ''} 
                                          onChange={(e) => handleDetailUpdate(item.id, { value: e.target.value, status: e.target.value ? 'answered' : 'not_started' })}
                                          placeholder={locked ? "Prerequisites pending..." : "Execution notes or outcomes..."}
                                          disabled={locked}
                                          style={{ 
                                            width: '100%', 
                                            minHeight: '60px', 
                                            maxHeight: '150px',
                                            background: 'rgba(0,0,0,0.3)', 
                                            border: '1px solid rgba(255,255,255,0.1)', 
                                            borderRadius: '10px', 
                                            padding: '0.6rem', 
                                            color: locked ? 'var(--te-text-muted)' : 'white', 
                                            resize: 'vertical', 
                                            fontSize: '0.8rem',
                                            outline: 'none',
                                            transition: 'all 0.3s ease'
                                          }}
                                       />
                                     ) : (
                                       <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                          {/* SPECIALIZED VALUE FIELDS */}
                                          {item.responseType === 'link' && (
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                              <div style={{ flex: 1, position: 'relative' }}>
                                                 <LinkIcon size={12} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                                 <input 
                                                   type="text"
                                                   value={resp?.value || ''}
                                                   onChange={(e) => handleDetailUpdate(item.id, { value: e.target.value, status: e.target.value ? 'answered' : 'not_started' })}
                                                   placeholder="Paste resource URL here..."
                                                   style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.75rem', outline: 'none' }}
                                                 />
                                              </div>
                                              {resp?.value && (
                                                <button onClick={() => window.open(resp.value.startsWith('http') ? resp.value : `https://${resp.value}`, '_blank')} style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--te-accent-600)', border: 'none', color: 'white', cursor: 'pointer' }}><ExternalLink size={12} /></button>
                                              )}
                                            </div>
                                          )}
                                          
                                          {item.responseType === 'date' && (
                                            <div style={{ position: 'relative' }}>
                                               <Clock size={12} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                               <input 
                                                 type="date"
                                                 value={resp?.value || ''}
                                                 onChange={(e) => handleDetailUpdate(item.id, { value: e.target.value, status: e.target.value ? 'answered' : 'not_started' })}
                                                 style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.75rem', outline: 'none', colorScheme: 'dark' }}
                                               />
                                            </div>
                                          )}

                                          {item.responseType === 'number' && (
                                            <input 
                                              type="number"
                                              value={resp?.value || ''}
                                              onChange={(e) => handleDetailUpdate(item.id, { value: e.target.value, status: e.target.value ? 'answered' : 'not_started' })}
                                              placeholder="Enter numeric value..."
                                              style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.75rem', outline: 'none' }}
                                            />
                                          )}

                                          {/* SHARED NOTES FIELD */}
                                          <textarea 
                                             value={resp?.note || ''} 
                                             onChange={(e) => handleDetailUpdate(item.id, { note: e.target.value })}
                                             placeholder="Execution notes or outcomes..."
                                             style={{ 
                                               width: '100%', 
                                               minHeight: '35px', 
                                               maxHeight: '100px',
                                               background: 'rgba(0,0,0,0.2)', 
                                               border: '1px solid rgba(255,255,255,0.05)', 
                                               borderRadius: '8px', 
                                               padding: '0.4rem', 
                                               color: 'var(--te-text-muted)', 
                                               resize: 'vertical', 
                                               fontSize: '0.75rem',
                                               outline: 'none'
                                             }}
                                          />
                                       </div>
                                     )}

                                     {/* DYNAMIC ACTION BUTTONS (ONLY BOO/SEL, but hide YES/NO for 'question' labels to keep them open) */}
                                     {((item.responseType === 'boolean' || item.responseType === 'select') && !locked && (item.itemType !== 'question' || (item.allowedValues && item.allowedValues.length > 0))) && (
                                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                          {(item.allowedValues && item.allowedValues.length > 0) ? (
                                            item.allowedValues.map(val => (
                                              <button 
                                                key={val}
                                                onClick={() => handleDetailUpdate(item.id, { value: val, status: 'answered' })} 
                                                style={{ 
                                                  padding: '0.4rem 0.8rem', 
                                                  borderRadius: '8px', 
                                                  background: resp?.value === val ? 'var(--te-accent-600)' : 'rgba(255,255,255,0.05)', 
                                                  border: `1px solid ${resp?.value === val ? 'var(--te-accent-400)' : 'rgba(255,255,255,0.1)'}`, 
                                                  color: 'white', 
                                                  fontSize: '0.65rem', 
                                                  fontWeight: 800, 
                                                  cursor: 'pointer',
                                                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }}
                                              >
                                                {val.toUpperCase()}
                                              </button>
                                            ))
                                          ) : item.responseType === 'boolean' && (
                                            <>
                                              <button onClick={() => handleDetailUpdate(item.id, { value: 'YES', status: 'answered' })} style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', background: resp?.value === 'YES' ? 'var(--te-emerald-600)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.65rem', fontWeight: 900, cursor: 'pointer' }}>YES</button>
                                              <button onClick={() => handleDetailUpdate(item.id, { value: 'NO', status: 'answered' })} style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', background: resp?.value === 'NO' ? 'var(--te-rose-600)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.65rem', fontWeight: 900, cursor: 'pointer' }}>NO</button>
                                            </>
                                          )}
                                       </div>
                                     )}
                                  </div>
                               )}
                            </div>
                         );
                       })}
                    </div>
                 </div>
               )}
               {viewMode === 'map' && <DecisionMap items={visibleItems.filter(it => showActions || (String(it.itemType || '').toLowerCase() !== 'action'))} allItems={activeBackboneItems} responses={currentCase.responses} stagesList={stagesList} onNodeClick={setSelectedItemId} isEditMode={isEditMode} isDarkMode={isDarkMode} onSaveStandard={handleSaveStandard} stagesData={activeBackboneStages} areas={activeBackboneAreas} onAddDependency={handleAddDependency} onUpdateDependency={handleUpdateDependency} onDeleteNode={handleDeleteStandardItem} onMirrorFilter={(text) => { if (searchQuery === text) setSearchQuery(''); else { setSearchQuery(text); } }} />}
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
                               {item.syncId && <div style={{ fontSize: '0.55rem', opacity: 0.5, marginBottom: '0.3rem', letterSpacing: '0.1em', fontWeight: 900 }}>MIRRORED_POINT::SYNCHRONIZED</div>}
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
            <QuestionDetailPanel item={activeBackboneItems.find(i => i.id === selectedItemId) || null} response={currentCase?.responses[selectedItemId!] || null} onClose={() => setSelectedItemId(null)} onResponseChange={handleDetailUpdate} allResponses={currentCase?.responses || {}} allItems={activeBackboneItems} isEditMode={isEditMode} onEditModeToggle={() => setIsEditMode(!isEditMode)} onItemUpdate={handleUpdateStandardItem} onItemDelete={handleDeleteStandardItem} onItemDuplicate={handleDuplicateTask} onItemClone={handleCloneTask} onAddDeliverable={handleAddGlobalDeliverable} availableAreas={activeBackboneAreas} availableStages={activeBackboneStages} availableDeliverables={activeBackboneDeliverables} loopDb={loopDb} dbName={loopDbName} onLoopDbChange={(db, name) => { setLoopDb(db); setLoopDbName(name); }} />
          </div>
        </>
      )}

      {isWizardOpen && <ChecklistWizard existingCases={workspace?.cases || []} onCancel={() => setIsWizardOpen(false)} onComplete={(newCase, sourceId, excelBackbone) => handleCreateNew(newCase, sourceId, excelBackbone)} />}
      {isEditorOpen && <StructureEditor questions={activeBackboneItems} stages={activeBackboneStages} areas={activeBackboneAreas} deliverables={activeBackboneDeliverables} onSave={handleSaveStandard} onClose={() => setIsEditorOpen(false)} responses={currentCase?.responses} onResponseUpdate={handleDetailUpdate} />}
    </div>
  );
};
