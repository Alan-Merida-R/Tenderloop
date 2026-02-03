
import React, { useState, useEffect, useRef } from 'react';
import { DatabaseSchema, Opportunity, INITIAL_DB, ProcessStage, Task, CommercialRow, ExternalArea, TaskStatus, TaskOwner, TaskPriority, PrdPresentation, OpportunityStatus, KPIs, DeepLink } from './types';
import { openDatabaseFile, createDatabaseFile, saveToDisk } from './services/fileSystem';
import { rememberDb, getLastDb, getRecentDbs, getRecentDbHandle, removeRecentDb, RecentDbEntry } from './services/recentDbHandles';
import Dashboard from './components/Dashboard';
import OpportunityDetail from './components/OpportunityDetail';
import { SettingsModal, DEFAULT_SETTINGS, AppSettings } from './components/SettingsModal';
import { FolderOpen, Save, HardDrive, PlusCircle, AlertCircle, FileJson, Layout, CheckSquare, BarChart3, X, Settings as SettingsIcon, History, ChevronDown, Trash2, CalendarDays } from 'lucide-react';

type AppStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
type AppView = 'general-dashboard' | 'proposals-dashboard' | 'tasks-dashboard';

const SCHNEIDER_GREEN = '#3DCD58'; // Corporate Green

function App() {
  const [db, setDb] = useState<DatabaseSchema>(INITIAL_DB);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recents State
  const [recentDbs, setRecentDbs] = useState<RecentDbEntry[]>([]);
  const [showRecents, setShowRecents] = useState(false);
  const [startupHint, setStartupHint] = useState<string | null>(null);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [fallbackFileName, setFallbackFileName] = useState<string | null>(null);

  // Navigation
  const [currentView, setCurrentView] = useState<AppView>('general-dashboard');

  // Detail Overlay State (Notion-like)
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [activeDeepLink, setActiveDeepLink] = useState<DeepLink | null>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Debounce saving
  const saveTimeoutRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);

  // Redirect legacy tracking view
  useEffect(() => {
    // @ts-ignore
    if (currentView === 'tracking-dashboard') {
      setCurrentView('tasks-dashboard');
    }
  }, [currentView]);

  // Load Settings from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('TenderLoop_Settings_V1');
      if (saved) {
        setAppSettings(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }, []);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    localStorage.setItem('TenderLoop_Settings_V1', JSON.stringify(newSettings));
  };

  // Load Recents & Auto-open last DB
  useEffect(() => {
    const init = async () => {
      // Load recents list
      const recents = await getRecentDbs();
      setRecentDbs(recents);

      // Attempt auto-load last DB
      const lastHandle = await getLastDb();
      if (lastHandle) {
        // Check permission without prompting (non-blocking)
        // @ts-ignore
        const perm = await lastHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          setStatus('loading');
          await loadDbFromHandle(lastHandle);
        } else {
          setStartupHint("Please open a database file.");
        }
      } else {
        setStartupHint("Please open a database file.");
      }
    };
    init();
  }, []);

  // Auto-save Effect
  useEffect(() => {
    if (!db || !fileHandle || status === 'loading') return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // @ts-ignore
    saveTimeoutRef.current = window.setTimeout(async () => {
      if (isSavingRef.current) {
        console.debug("[Autosave] Concurrency: Save already in progress, deferred.");
        return;
      }

      try {
        isSavingRef.current = true;
        console.debug("[Autosave] Verifying permissions for save...");

        // Final sanity check for permission before writing
        // @ts-ignore
        const permission = await fileHandle.queryPermission({ mode: 'readwrite' });

        if (permission !== 'granted') {
          console.warn("[Autosave] Write permission not granted:", permission);
          if (status !== 'error') {
            setStatus('error');
            setErrorMessage("Database is read-only. Please use Change DB to re-authenticate.");
          }
          return;
        }

        console.debug("[Autosave] Executing saveToDisk...");
        const success = await saveToDisk(fileHandle, db);

        if (success) {
          console.debug("[Autosave] Save completed successfully.");
          setStatus('saved');
          if (errorMessage === "Database is read-only. Please use Change DB to re-authenticate." || errorMessage?.includes("Failed to save changes")) {
            setErrorMessage(null);
          }
        } else {
          console.error("[Autosave] saveToDisk failed.");
          setStatus('error');
          setErrorMessage("Failed to save changes. Please check DB permissions.");
        }
      } catch (err: any) {
        console.error("[Autosave] Critical error:", err);
        setStatus('error');
        setErrorMessage("Failed to save changes. Check file permissions.");
      } finally {
        isSavingRef.current = false;
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [db, fileHandle]);

  // Helper: Basic structural validation
  const verifyDatabaseStructure = (data: any): boolean => {
    if (!data || typeof data !== 'object') return false;
    // Check for essential keys that define our DB
    const hasOpps = Array.isArray(data.opportunities);
    const hasMeta = data.meta && typeof data.meta === 'object';
    return hasOpps && hasMeta;
  };

  // Shared DB Loader
  const loadDbFromHandle = async (handle: FileSystemFileHandle) => {
    console.debug("[App] Loading DB from handle:", handle.name);
    try {
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);

      if (!verifyDatabaseStructure(data)) {
        throw new Error("Invalid database structure. Missing 'opportunities' or 'meta'.");
      }

      console.debug("[App] Data read and verified. Starting migration...");
      const migratedData = migrateData(data);

      setDb(migratedData);
      setFileHandle(handle);
      setIsDbLoaded(true);
      setFallbackFileName(null);
      setStatus('idle');
      setStartupHint(null);
      setErrorMessage(null);

      // Remember successfully loaded DB
      await rememberDb(handle, { name: handle.name });
      setRecentDbs(await getRecentDbs()); // Refresh list
      console.debug("[App] DB loaded successfully.");
    } catch (err: any) {
      console.error("[App] Failed to load DB from handle", err);
      // If error is specific to migration, we still mark as failed to prevent corrupted state
      setErrorMessage("Failed to load database: " + err.message);
      setStatus('error');
    }
  };

  // Migration Helper (Extracted to reuse)
  const migrateData = (data: DatabaseSchema): DatabaseSchema => {
    console.debug("[Migration] Starting data migration for", data.opportunities?.length || 0, "opportunities");
    try {
      const emptyRow: CommercialRow = { cost: 0, margin: 0, sellPrice: 0, discount: 0, finalPrice: 0 };
      const emptyPrd: PrdPresentation = { executiveSummary: '', issues: '', kpis: '', requirements: '' };

      const migratedOpps: Opportunity[] = data.opportunities.map((o, idx) => {
        try {
          // Status Migration
          let newStatus: OpportunityStatus = 'In Progress';
          const oldStatus = (o as any).statusLabel;
          if (oldStatus === 'Active') newStatus = 'In Progress';
          else if (oldStatus === 'Approved') newStatus = 'Won';
          else if (oldStatus === 'Rejected') newStatus = 'Lost';
          else if (oldStatus === 'On Hold') newStatus = 'On Hold';
          else if (['In Progress', 'On Hold', 'Canceled', 'Submitted', 'Won', 'Lost'].includes(oldStatus)) {
            newStatus = oldStatus;
          }

          // Commercial Migration (Merging HW/SW)
          let newCommercial = {
            currency: 'USD',
            swHw: emptyRow, services: emptyRow, resale: emptyRow,
            risk: 0, contingency: 0,
            escalations: { swHw: 0, services: 0, resale: 0 },
            agreementsLink: '', cfLink: '',
            discountsAndNotes: '', cqaOfficialSellPrice: 0, cqaOfficialMargin: 0
          };

          if (o.commercial) {
            const oldComm = o.commercial as any;
            if (oldComm.hardware && oldComm.software) {
              newCommercial.swHw = {
                cost: oldComm.hardware.cost + oldComm.software.cost,
                sellPrice: oldComm.hardware.sellPrice + oldComm.software.sellPrice,
                finalPrice: oldComm.hardware.finalPrice + oldComm.software.finalPrice,
                margin: 0,
                discount: 0
              };
              if (newCommercial.swHw.sellPrice > 0) {
                newCommercial.swHw.margin = Number(((1 - (newCommercial.swHw.cost / newCommercial.swHw.sellPrice)) * 100).toFixed(2));
              }
            } else if (oldComm.swHw) {
              newCommercial.swHw = oldComm.swHw;
            }

            newCommercial.services = oldComm.services || emptyRow;
            newCommercial.resale = oldComm.resale || emptyRow;
            newCommercial.risk = oldComm.risk || 0;
            newCommercial.contingency = oldComm.contingency || 0;
            newCommercial.discountsAndNotes = oldComm.discountsAndNotes || '';
            newCommercial.cqaOfficialSellPrice = oldComm.cqaOfficialSellPrice || 0;
            newCommercial.cqaOfficialMargin = oldComm.cqaOfficialMargin || 0;

            if (typeof oldComm.escalationPerYear === 'number') {
              newCommercial.escalations = { swHw: oldComm.escalationPerYear, services: oldComm.escalationPerYear, resale: oldComm.escalationPerYear };
            } else {
              newCommercial.escalations = oldComm.escalations || { swHw: 0, services: 0, resale: 0 };
            }

            newCommercial.agreementsLink = oldComm.agreementsLink || '';
            newCommercial.cfLink = oldComm.cfLink || '';
            // @ts-ignore
            newCommercial.currency = oldComm.currency || 'USD';
          }

          // KPI Initialization
          const kpis: KPIs = o.kpis || {
            languageSkill: null,
            technicalUnderstanding: null,
            dealProbability: null,
            sold: null,
            proposalAmountUSD: null,
            timeline: {
              receivedAt: o.dates?.requested || (o.dates as any)?.assigned || new Date().toISOString().split('T')[0],
              deliveredAt: null,
              cancelledAt: null,
              cancelledReason: null
            },
            execution: {
              myWorkDays: null,
              waitingOnOthersDays: null
            },
            areasInvolved: [],
            effortContribution: null
          };

          // Sync Proposal Amount from Commercial if present
          if (newCommercial.cqaOfficialSellPrice) {
            kpis.proposalAmountUSD = newCommercial.cqaOfficialSellPrice;
          }

          return {
            ...o,
            statusLabel: newStatus,
            qlk: o.qlk || '',
            revision: o.revision || 'R0',
            presentation: o.presentation || emptyPrd,
            dates: {
              requested: o.dates?.requested || '',
              expected: o.dates?.expected || '',
              assigned: (o.dates as any)?.assigned || new Date().toISOString().split('T')[0]
            },
            links: {
              ...o.links,
              ba: (o.links as any).ba || '',
              srLink: (o.links as any).srLink || '',
              geet: (o.links as any).geet || ''
            },
            commercial: newCommercial as any,
            kpis: kpis,
            history: o.history || [],
            questions: (o as any).questions || [],
            tasks: (o.tasks || []).map(t => {
              const oldT = t as any;
              let areas: string[] = [];
              if (oldT.externalArea && !Array.isArray(oldT.externalArea)) {
                if (oldT.externalArea) areas = [oldT.externalArea];
              } else if (Array.isArray(oldT.externalArea)) {
                areas = oldT.externalArea;
              } else if (oldT.externalAreas) {
                areas = oldT.externalAreas;
              }

              return {
                ...t,
                status: (t.status || 'Pending') as TaskStatus,
                owner: (t.owner || 'Me') as TaskOwner,
                externalAreas: areas,
                priority: (t.priority || 'Medium') as TaskPriority,
                responsible: t.responsible || '',
                order: t.order ?? null,
                dependsOnTaskIds: t.dependsOnTaskIds || [],
                blockDoneUntilDependenciesDone: t.blockDoneUntilDependenciesDone || false
              };
            })
          };
        } catch (e: any) {
          console.error(`[Migration] Failed on item index ${idx}, ID: ${o.id}`, e);
          // Return original item if migration fails to prevent data loss in the array
          return o;
        }
      });
      return { ...data, opportunities: migratedOpps };
    } catch (err: any) {
      console.error("[Migration] Critical error during migration:", err);
      throw err;
    }
  };

  // Handlers
  const handleOpenDB = async () => {
    console.debug("[App] handleOpenDB triggered.");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setStatus('loading');
    setErrorMessage(null);

    try {
      const result = await openDatabaseFile();
      console.debug("[App] openDatabaseFile result:", !!result.data, !!result.handle, result.error);

      if (result.error) {
        if (result.error !== 'Selección cancelada.') {
          setErrorMessage(result.error);
          setStatus('error');
        } else {
          setStatus('idle');
        }
        return;
      }

      if (result.data) {
        if (!verifyDatabaseStructure(result.data)) {
          setErrorMessage("The selected file is not a valid TenderLoop database.");
          setStatus('error');
          return;
        }

        // Logic for handle (autosave enabled)
        if (result.handle) {
          try {
            // @ts-ignore
            const perm = await result.handle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') console.warn("Write permission not granted.");
          } catch (e) {
            console.error("Failed to request write permission", e);
          }
          setFileHandle(result.handle);
          setFallbackFileName(null);
          await rememberDb(result.handle, { name: result.handle.name });
        } else {
          setFileHandle(null);
          setFallbackFileName(result.name || "Offline DB");
        }

        console.debug("[App] Migrating and setting state...");
        const migratedData = migrateData(result.data);
        setDb(migratedData);
        setIsDbLoaded(true);
        setRecentDbs(await getRecentDbs());
        setStartupHint(null);
        setStatus('idle');
      } else {
        console.warn("[App] No data received from picker.");
        setStatus('idle');
      }
    } catch (err: any) {
      console.error("[App] Unexpected error in handleOpenDB:", err);
      setErrorMessage("An unexpected error occurred: " + err.message);
      setStatus('error');
    }
  };

  const handleCreateDB = async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const result = await createDatabaseFile();
      if (result.error) {
        if (result.error !== 'Creación cancelada.') {
          setErrorMessage(result.error);
          setStatus('error');
        } else {
          setStatus('idle');
        }
        return;
      }

      if (result.data && result.handle) {
        setDb(result.data);
        setFileHandle(result.handle);
        setIsDbLoaded(true);
        await rememberDb(result.handle, { name: result.handle.name });
        setRecentDbs(await getRecentDbs());
        setStartupHint(null);
      }
      setStatus('idle');
    } catch (err: any) {
      console.error("[App] Error creating DB:", err);
      setErrorMessage("Failed to create database: " + err.message);
      setStatus('error');
    }
  };

  const handleRecentClick = async (entry: RecentDbEntry) => {
    setShowRecents(false);
    const handle = await getRecentDbHandle(entry.id);

    if (!handle) {
      setErrorMessage("Recent database is no longer available.");
      await removeRecentDb(entry.id);
      setRecentDbs(await getRecentDbs());
      return;
    }

    try {
      // Explicitly request permission if needed since this is a user gesture
      // @ts-ignore
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        // @ts-ignore
        const request = await handle.requestPermission({ mode: 'readwrite' });
        if (request !== 'granted') {
          setErrorMessage("Permission required to reopen this database.");
          return;
        }
      }
      await loadDbFromHandle(handle);
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Error opening recent DB: " + err.message);
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await removeRecentDb(id);
    setRecentDbs(await getRecentDbs());
  };

  const deleteOpportunity = async (id: string) => {
    if (!db || !fileHandle) return;
    setSelectedOppId(null);
    const newOpps = db.opportunities.filter(o => o.id !== id);
    const newDb = { ...db, opportunities: newOpps };
    setDb(newDb);
    // Auto-save effect will handle persistence
  };

  const renderStatusBadge = () => {
    switch (status) {
      case 'idle': return <span className="text-gray-400 text-xs flex items-center gap-1">Ready</span>;
      case 'loading': return <span className="text-blue-500 text-xs flex items-center gap-1">Loading...</span>;
      case 'saving': return <span className="text-orange-500 text-xs flex items-center gap-1">Saving...</span>;
      case 'saved': return <span className="text-green-600 text-xs flex items-center gap-1"><Save className="w-3 h-3" /> Saved</span>;
      case 'error': return <span className="text-red-500 text-xs flex items-center gap-1">Error</span>;
    }
  };

  /**
   * Create New Opportunity with Configurable Defaults
   */
  const createOpportunity = (stage: ProcessStage = '1. Recepción') => {
    // 1. Generate Unique OP ID
    let maxNum = 1000;
    db.opportunities.forEach(o => {
      const match = o.id.match(/\d+/);
      if (match) {
        const num = parseInt(match[0]);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    const newId = `OP-${nextNum}`;

    let defaultTasks: Task[] = [];

    // --- CASE A: Task Standard Template (Opportunity Snapshot) ---
    if (appSettings.taskStandardTemplate && appSettings.taskStandardTemplate.tasks.length > 0) {
      const templateTasks = appSettings.taskStandardTemplate.tasks;
      const taskIdMap = new Map<string, string>();

      // 1. Generate new IDs for tasks to avoid collisions
      templateTasks.forEach(t => {
        taskIdMap.set(t.id, crypto.randomUUID());
      });

      // 2. Map and Instantiate with new IDs
      defaultTasks = templateTasks.map(t => ({
        ...t,
        id: taskIdMap.get(t.id)!,
        description: t.description || '',
        status: 'Pending',
        priority: (t.priority || 'Medium') as TaskPriority,
        owner: (t.owner || 'Me') as TaskOwner,
        responsible: '',
        dueDate: new Date().toISOString().split('T')[0],
        stageContext: stage,
        subtasks: (t.subtasks || []).map(st => ({ ...st, id: crypto.randomUUID(), status: 'Pending' })),
        order: t.order,
        dependsOnTaskIds: (t.dependsOnTaskIds || []).map(depId => taskIdMap.get(depId)).filter(Boolean) as string[],
        blockDoneUntilDependenciesDone: t.blockDoneUntilDependenciesDone || false
      }));
    }
    // --- CASE B: Default Hardcoded Tasks ---
    else {
      const taskIdMap = new Map<string, string>();
      appSettings.defaultTasks.forEach(tmpl => {
        taskIdMap.set(tmpl.id, crypto.randomUUID());
      });

      defaultTasks = appSettings.defaultTasks.map(tmpl => {
        const newTaskId = taskIdMap.get(tmpl.id)!;
        const mappedDependencies = tmpl.dependsOnTaskIds?.map(depId => taskIdMap.get(depId)).filter(Boolean) as string[] || [];

        return {
          id: newTaskId,
          title: tmpl.title,
          description: '',
          status: tmpl.status || 'Pending',
          priority: tmpl.priority || 'Medium',
          owner: tmpl.owner || 'Me',
          externalAreas: [],
          responsible: '',
          dueDate: new Date().toISOString().split('T')[0],
          stageContext: stage,
          subtasks: [],
          order: tmpl.order,
          dependsOnTaskIds: mappedDependencies,
          blockDoneUntilDependenciesDone: tmpl.blockDoneUntilDependenciesDone || false
        };
      });
    }

    const initialNotes = appSettings.noteTemplates
      .filter(tmpl => tmpl.autoCreate)
      .map(tmpl => ({
        id: crypto.randomUUID(),
        title: tmpl.title,
        date: new Date().toISOString().split('T')[0],
        type: 'General',
        content: tmpl.content,
        attendees: ''
      })) as any[];

    const newOpp: Opportunity = {
      id: newId,
      title: 'New Opportunity',
      customer: 'New Customer',
      qlk: '',
      revision: 'R0',
      stage: stage,
      statusLabel: 'In Progress',
      dates: { requested: new Date().toISOString().split('T')[0], expected: '', assigned: new Date().toISOString().split('T')[0] },
      priority: 'Medium',
      description: '',
      commercial: {
        currency: 'USD',
        swHw: { cost: 0, margin: 0, sellPrice: 0, discount: 0, finalPrice: 0 },
        services: { cost: 0, margin: 0, sellPrice: 0, discount: 0, finalPrice: 0 },
        resale: { cost: 0, margin: 0, sellPrice: 0, discount: 0, finalPrice: 0 },
        risk: 0,
        contingency: 0,
        escalations: { swHw: 0, services: 0, resale: 0 },
        agreementsLink: '',
        cfLink: '',
        discountsAndNotes: '',
        cqaOfficialSellPrice: 0,
        cqaOfficialMargin: 0
      },
      links: { bfo: '', internalFolder: '', officialFolder: '', cqaLink: '', ba: '', srLink: '', geet: '' },
      notes: initialNotes,
      tasks: defaultTasks,
      questions: [],
      history: [],
      presentation: { executiveSummary: '', issues: '', kpis: '', requirements: '' },
      kpis: {
        languageSkill: null,
        technicalUnderstanding: null,
        dealProbability: null,
        sold: null,
        proposalAmountUSD: null,
        timeline: {
          receivedAt: new Date().toISOString().split('T')[0],
          deliveredAt: null,
          cancelledAt: null,
          cancelledReason: null
        },
        execution: { myWorkDays: null, waitingOnOthersDays: null },
        areasInvolved: [],
        effortContribution: null
      },
      tags: [],
      pendingActions: [],
      lastUpdated: new Date().toISOString()
    };

    setDb(prev => ({ ...prev, opportunities: [newOpp, ...prev.opportunities] }));
    setSelectedOppId(newId);
  };

  const updateOpportunity = (updatedOpp: Opportunity, id?: string) => {
    if (id && id !== updatedOpp.id) {
      if (id === selectedOppId) setSelectedOppId(updatedOpp.id);
    }
    setDb(prev => ({
      ...prev,
      opportunities: prev.opportunities.map(o => o.id === (id || updatedOpp.id) ? updatedOpp : o)
    }));
  };

  const moveOpportunityStage = (id: string, newStage: ProcessStage) => {
    setDb(prev => ({
      ...prev,
      opportunities: prev.opportunities.map(o => o.id === id ? { ...o, stage: newStage, lastUpdated: new Date().toISOString() } : o)
    }));
  };

  const changeOpportunityDate = (id: string, type: 'expected' | 'dueDate', newDate: string) => {
    if (type === 'expected') {
      setDb(prev => ({
        ...prev,
        opportunities: prev.opportunities.map(o => o.id === id ? { ...o, dates: { ...o.dates, expected: newDate }, lastUpdated: new Date().toISOString() } : o)
      }));
    }
  };

  const updateTaskDetails = (oppId: string, taskId: string, updates: Partial<Task>) => {
    setDb(prev => ({
      ...prev,
      opportunities: prev.opportunities.map(o => {
        if (o.id !== oppId) return o;
        return {
          ...o,
          tasks: o.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t),
          lastUpdated: new Date().toISOString()
        };
      })
    }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f1f3f4] overflow-hidden">
      {/* Top Navigation */}
      <div className="bg-white border-b border-gray-200 h-14 px-4 flex justify-between items-center select-none sticky top-0 z-40 shadow-sm shrink-0">
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2 font-bold text-gray-800 tracking-tight cursor-pointer hover:text-[#3DCD58] text-lg transition-colors"
            onClick={() => { setSelectedOppId(null); setActiveDeepLink(null); setCurrentView('general-dashboard'); }}
          >
            <HardDrive className="w-5 h-5 text-[#3DCD58]" />
            TenderLoop
          </div>
          <div className="flex gap-1 bg-gray-50 p-1 rounded-lg">
            <button
              onClick={() => { setCurrentView('general-dashboard'); }}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'general-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <BarChart3 className="w-4 h-4" /> General
            </button>
            <button
              onClick={() => { setCurrentView('proposals-dashboard'); }}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'proposals-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Layout className="w-4 h-4" /> Proposals
            </button>
            <button
              onClick={() => { setCurrentView('tasks-dashboard'); }}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'tasks-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <CheckSquare className="w-4 h-4" /> Tasks
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors"
            title="Configure Defaults"
          >
            <SettingsIcon className="w-4 h-4" /> Settings
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1"></div>
          {!isDbLoaded ? (
            <div className="flex items-center gap-2 relative">
              <div className="flex bg-white border border-gray-300 rounded-lg shadow-sm">
                <button onClick={handleOpenDB} className="flex items-center gap-2 px-3 py-1.5 text-gray-700 text-sm font-medium hover:bg-gray-50 rounded-l-lg transition-colors border-r border-gray-200">
                  <FolderOpen className="w-4 h-4" /> Open DB
                </button>
                {recentDbs.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowRecents(!showRecents)}
                      className="px-2 py-1.5 hover:bg-gray-50 rounded-r-lg h-full flex items-center justify-center text-gray-500"
                      title="Recent Databases"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showRecents && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowRecents(false)} />
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden animate-fade-in">
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase">Recent Databases</div>
                          <div className="max-h-64 overflow-y-auto">
                            {recentDbs.map(entry => (
                              <div key={entry.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer group" onClick={() => handleRecentClick(entry)}>
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <History className="w-3 h-3 text-gray-400 shrink-0" />
                                  <span className="text-xs font-medium text-gray-700 truncate">{entry.name}</span>
                                </div>
                                <button
                                  onClick={(e) => handleRemoveRecent(e, entry.id)}
                                  className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Remove from recents"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <button onClick={handleCreateDB} className="flex items-center gap-2 px-3 py-1.5 bg-[#3DCD58] hover:bg-[#2db64a] text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                <PlusCircle className="w-4 h-4" /> New DB
              </button>
              {startupHint && <span className="text-xs text-gray-400 animate-pulse">{startupHint}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2 animate-fade-in">
              <span
                className={`text-xs font-mono hidden lg:inline-flex border px-2 py-1.5 rounded items-center gap-1.5 transition-colors ${status === 'error' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                title={status === 'error' ? errorMessage || 'Database error' : (fileHandle?.name || fallbackFileName || 'Loaded Database')}
              >
                <FileJson className="w-3.5 h-3.5" />
                {fileHandle?.name || fallbackFileName || 'Loaded Database'}
                {!fileHandle && <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 px-1 rounded font-bold uppercase tracking-tighter">Sandbox</span>}
              </span>
              <button
                onClick={handleOpenDB}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
              >
                <FolderOpen className="w-3.5 h-3.5" /> Change DB
              </button>
              <div className="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 flex items-center h-[34px]">
                {renderStatusBadge()}
              </div>
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex justify-between items-center shrink-0">
          <span className="text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {errorMessage}
          </span>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600 text-sm">Dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative flex">
        {/* Main Dashboard Area */}
        <div className={`flex-1 h-full overflow-hidden transition-all duration-300`}>
          <Dashboard
            mode={currentView === 'proposals-dashboard' ? 'proposals' : currentView === 'tasks-dashboard' ? 'tasks' : 'general'}
            opportunities={db.opportunities}
            onSelect={(id, dl) => {
              setSelectedOppId(id);
              setActiveDeepLink(dl || null);
            }}
            onCreate={() => createOpportunity('1. Recepción')}
            onStageChange={moveOpportunityStage}
            onDateChange={changeOpportunityDate}
            onOppUpdate={updateOpportunity}
            onTaskUpdate={updateTaskDetails}
            holidays={appSettings.holidays || []}
          />
        </div>

        {/* Opportunity Detail Overlay */}
        {selectedOppId && (() => {
          const opp = db.opportunities.find(o => o.id === selectedOppId);
          if (!opp) return null;
          return (
            <div className="absolute inset-0 z-50 bg-white animate-slide-in-right overflow-hidden">
              <OpportunityDetail
                opportunity={opp}
                onBack={() => { setSelectedOppId(null); setActiveDeepLink(null); }}
                onUpdate={updateOpportunity}
                onDelete={() => deleteOpportunity(opp.id)}
                noteTemplates={appSettings.noteTemplates}
                holidays={appSettings.holidays || []}
                trackedAreas={appSettings.trackedAreas || []}
                deepLink={activeDeepLink || undefined}
              />
            </div>
          );
        })()}
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveSettings}
        initialSettings={appSettings}
        opportunities={db.opportunities}
      />
    </div>
  );
}

export default App;
