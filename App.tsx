
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DatabaseSchema, Opportunity, INITIAL_DB, ProcessStage, Task, CommercialRow, Commercial, ExternalArea, TaskStatus, TaskOwner, TaskPriority, PrdPresentation, OpportunityStatus, KPIs, DeepLink, FloatingTab, DetailedStatus } from './types';
import { openDatabaseFile, createDatabaseFile, saveToDisk } from './services/fileSystem';
import { rememberDb, getLastDb, getRecentDbs, getRecentDbHandle, removeRecentDb, RecentDbEntry } from './services/recentDbHandles';
import Dashboard from './components/Dashboard';
import OpportunityDetail from './components/OpportunityDetail';
import { SettingsModal, DEFAULT_SETTINGS, AppSettings } from './components/SettingsModal';
import { FolderOpen, Save, HardDrive, PlusCircle, AlertCircle, FileJson, Layout, CheckSquare, BarChart3, X, Settings as SettingsIcon, History, ChevronDown, Trash2, CalendarDays, Maximize2, Columns, Palette, FileText, Activity, GripVertical, Minus, ExternalLink } from 'lucide-react';
import { TimerProvider } from './contexts/TimerContext';
import { TimerWidget } from './components/TimerWidget';
import { StickyNotesWidget } from './components/StickyNotesWidget';
import { QuickNavDock } from './components/QuickNavDock';
import { assignMissingOrders } from './services/taskUtils';


type AppStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
type AppView = 'general-dashboard' | 'proposals-dashboard' | 'tasks-dashboard';

const SCHNEIDER_GREEN = '#3DCD58'; // Corporate Green

// --- Local Error Boundary (fail-open: shows error instead of blank screen) ---
interface EBProps { children: React.ReactNode; fallbackLabel?: string; }
interface EBState { error: Error | null; }
class LocalErrorBoundary extends React.Component {
  declare props: EBProps;
  declare state: EBState;
  constructor(props: EBProps) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[LocalErrorBoundary]', (this.props as EBProps).fallbackLabel || '', error, info);
  }
  render() {
    const { error } = this.state as EBState;
    const { fallbackLabel, children } = this.props as EBProps;
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-red-600 font-bold text-lg">
            {fallbackLabel || 'Component'} encountered an error.
          </p>
          <p className="text-gray-500 text-sm font-mono max-w-xl break-all">
            {error.message}
          </p>
          <button
            className="mt-2 px-4 py-2 bg-[#3DCD58] text-white rounded-lg text-sm font-bold hover:bg-green-600 transition-colors"
            onClick={() => (this as any).setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return children;
  }
}

/**
 * Main Application component for TenderLoop.
 * Manages global state, database migrations, autosave, and cross-tab synchronization.
 */
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
  const [isPending, startTransition] = React.useTransition();

  // Detail Overlay State (Notion-like)
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [activeDeepLink, setActiveDeepLink] = useState<DeepLink | null>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Quick Nav State
  const [floatingTabs, setFloatingTabs] = useState<FloatingTab[]>([]);
  const [splitTab, setSplitTab] = useState<FloatingTab | null>(null);

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
      // NEW: Restore minimized records
      // Restore Session State (Tab Independent)
      const savedTabs = sessionStorage.getItem('TenderLoop_FloatingTabs_V1');
      if (savedTabs) {
        try { setFloatingTabs(JSON.parse(savedTabs)); } catch (e) { }
      }

      // Restore Navigation State
      const savedNav = sessionStorage.getItem('TenderLoop_Navigation_V1');
      if (savedNav) {
        try {
          const nav = JSON.parse(savedNav);
          if (nav.currentView) setCurrentView(nav.currentView);
          if (nav.selectedOppId) setSelectedOppId(nav.selectedOppId);
          if (nav.activeDeepLink) setActiveDeepLink(nav.activeDeepLink);
        } catch (e) { }
      }
    } catch (e) {
      console.error("Failed to load settings or tabs", e);
    }
  }, []);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    localStorage.setItem('TenderLoop_Settings_V1', JSON.stringify(newSettings));
  };

  // NEW: Save minimized records whenever they change
  useEffect(() => {
    sessionStorage.setItem('TenderLoop_FloatingTabs_V1', JSON.stringify(floatingTabs));
  }, [floatingTabs]);

  // NEW: Save navigation state whenever it changes
  useEffect(() => {
    const navState = {
      currentView,
      selectedOppId,
      activeDeepLink
    };
    sessionStorage.setItem('TenderLoop_Navigation_V1', JSON.stringify(navState));
  }, [currentView, selectedOppId, activeDeepLink]);

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

  // Tab Synchronization State
  const tabId = useRef(crypto.randomUUID()).current;
  const isBroadcastingRef = useRef(false);
  const syncChannel = useRef<BroadcastChannel | null>(null);

  // Data Synchronization (Database only, not UI state/navigation)
  useEffect(() => {
    const initSync = () => {
      syncChannel.current = new BroadcastChannel('tenderloop_db_sync');
      syncChannel.current.onmessage = (event) => {
        if (event.data.type === 'DB_UPDATE' && event.data.originTabId !== tabId) {
          console.debug("[Sync] Received DB update from another tab");
          isBroadcastingRef.current = true; // Mark as remote change to avoid re-broadcast
          setDb(event.data.db);
          setStatus('saved');
        }
      };
    };
    initSync();
    return () => syncChannel.current?.close();
  }, [tabId]);

  // Auto-save Effect
  useEffect(() => {
    if (!db || !fileHandle || status === 'loading') return;

    // HOTFIX PERFORMANCE: Handle remote changes vs local changes
    if (isBroadcastingRef.current) {
      isBroadcastingRef.current = false; // Reset for next local change
      return; // DO NOT save or re-broadcast if change came from other tab
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // Debounce BroadcastChannel separately from Disk Save
    // Sending 5MB+ over postMessage on every keystroke freezes the UI.
    const broadcastTimeoutKey = 'tenderloop_broadcast_timeout';
    // @ts-ignore
    if (window[broadcastTimeoutKey]) clearTimeout(window[broadcastTimeoutKey]);
    // @ts-ignore
    window[broadcastTimeoutKey] = setTimeout(() => {
      if (syncChannel.current) {
        console.debug("[Sync] Broadcasting update (debounced)");
        syncChannel.current.postMessage({ type: 'DB_UPDATE', db, originTabId: tabId });
      }
    }, 2000); // 2s debounce for cross-tab sync

    // CRITICAL PERFORMANCE: Tiered Autosave
    // With 50MB+ databases, structured cloning to the worker blocks the main thread.
    // 10s gives enough breathing room for typing/photos without frequent disk UI locks.
    const delay = 10000; 

    console.debug(`[Autosave] Change detected. Enqueueing save in ${delay}ms.`);

    // @ts-ignore
    saveTimeoutRef.current = window.setTimeout(async () => {
      if (isSavingRef.current) {
        console.debug("[Autosave] Concurrency: Save already in progress, deferred.");
        return;
      }

      try {
        isSavingRef.current = true;
        console.debug("[Autosave] Flush started...");
        setStatus('saving');

        // Final sanity check for permission before writing
        // @ts-ignore
        const permission = await fileHandle.queryPermission({ mode: 'readwrite' });

        if (permission !== 'granted') {
          console.warn("[Autosave] Write permission not granted:", permission);
          setStatus('error');
          setErrorMessage("Database is read-only. Please use Change DB to re-authenticate.");
          return;
        }

        console.debug("[Autosave] Executing saveToDisk...");
        const success = await saveToDisk(fileHandle, db);

        if (success) {
          console.debug("[Autosave] Save success.");
          setStatus('saved');
          if (errorMessage?.includes("read-only") || errorMessage?.includes("Failed to save changes")) {
            setErrorMessage(null);
          }
        } else {
          console.error("[Autosave] Save failure.");
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
    }, delay);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [db, fileHandle]);

  // Handle Page Exit / Unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveTimeoutRef.current) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes.';
        return 'You have unsaved changes.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Helper: Basic structural validation
  const verifyDatabaseStructure = (data: any): boolean => {
    if (!data || typeof data !== 'object') return false;
    // Check for essential keys that define our DB
    const hasOpps = Array.isArray(data.opportunities);
    // Relaxed validation: meta is optional for older DBs, warn but allow
    if (data.meta && typeof data.meta !== 'object') {
      console.warn("DB has invalid meta structure, but proceeding.");
    }
    return hasOpps; // Only block if opportunities array is missing
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

  // --- Dock Helpers ---
  const minimizeToDock = (tab: FloatingTab) => {
    setFloatingTabs(prev => {
      // Unique check by ID - our callers will provide unique IDs for different views
      if (prev.find(t => t.id === tab.id)) return prev;
      return [...prev, tab];
    });

    // Handle "Full Expediente" minimization
    // User wants that if we minimize the expediente, it closes the whole modal/overlay
    if (tab.type === 'opportunity' || tab.type === 'tracking') {
      setSelectedOppId(null);
      setActiveDeepLink(null);
      setSplitTab(null); // Ensure split tab is also closed
    }
  };

  const handleTimerTaskClick = (taskId: string, oppId: string) => {
    const opp = db.opportunities.find(o => o.id === oppId);
    if (!opp) return;
    const task = opp.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Create or show floating tab
    const tabId = task.id;
    const existing = floatingTabs.find(t => t.id === tabId);

    if (existing) {
      setSplitTab({ ...existing, data: { ...existing.data, isSubView: true } });
    } else {
      const newTab: FloatingTab = {
        id: tabId,
        type: 'task',
        title: `TSK: ${task.title.slice(0, 15)}`,
        color: '#3B82F6',
        data: { oppId, isSubView: true, deepLink: { tab: 'tasks', taskId: task.id } }
      };
      setFloatingTabs(prev => [...prev, newTab]);
      setSplitTab(newTab);
    }
  };

  const removeTab = (tabId: string) => {
    setFloatingTabs(prev => prev.filter(t => t.id !== tabId));
    if (splitTab?.id === tabId) {
      setSplitTab(null);
    }
  };

  const updateTabColor = (tabId: string, color: string) => {
    setFloatingTabs(prev => prev.map(t => t.id === tabId ? { ...t, color } : t));
  };

  const updateTabTitle = (tabId: string, title: string) => {
    setFloatingTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t));
  };

  const restoreFromDock = (tabId: string) => {
    const tab = floatingTabs.find(t => t.id === tabId);
    if (!tab) return;

    // Toggle logic: If clicking the same tab that is already open in sub-view, minimize it
    if (splitTab && splitTab.id === tabId) {
      setSplitTab(null);
      return;
    }

    // Always open in sub-view (overlay right) as requested "sub vista"
    setSplitTab({ ...tab, data: { ...tab.data, isSubView: true } });
  };

  const renderSplitTabContent = (tab: FloatingTab) => {
    const oppId = tab.data.oppId || (tab.type === 'opportunity' ? tab.id : null);
    if (!oppId) return null;
    const opp = db.opportunities.find(o => o.id === oppId);
    if (!opp) return null;

    return (
      <OpportunityDetail
        opportunity={opp}
        opportunities={db.opportunities}
        onBack={() => setSplitTab(null)}
        onUpdate={updateOpportunity}
        onDelete={() => { deleteOpportunity(opp.id); setSplitTab(null); }}
        onSelectOpp={(id, dl) => {
          if (tab.data.isSubView && !dl?.fullView) {
            setSplitTab({ ...tab, data: { ...tab.data, oppId: id, deepLink: dl } });
          } else {
            setSelectedOppId(id);
            setActiveDeepLink(dl || null);
            setSplitTab(null); // Close subview when jumping to full view
          }
        }}
        noteTemplates={appSettings.noteTemplates}
        holidays={appSettings.holidays || []}
        trackedAreas={appSettings.trackedAreas || []}
        globalLabels={appSettings.globalLabels || []}
        deepLink={tab.data.deepLink}
        onMinimize={(payload?: FloatingTab) => {
          if (payload) minimizeToDock(payload);
          else minimizeToDock(tab);
          setSplitTab(null);
        }}
        onCloseTab={() => removeTab(tab.id)}
        isSubView={tab.data.isSubView}
      />
    );
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
          let detailedStatus: DetailedStatus | undefined = (o as any).detailedStatus;

          const oldStatus = (o as any).statusLabel;
          const spanishDetailedMapping: Record<string, DetailedStatus> = {
            'Sin status': 'Review',      // No Status → Review
            'Espera': 'Info Needed',     // Waiting → Info Needed
            'Falta informacion': 'Info Needed',
            'En pausa por prioridades': 'Paused',
            'En aprobacion': 'Approval',
            'Junta': 'Meeting',
            'Completada': 'Completed',
            'Cancelada': 'Canceled'
          };

          if (spanishDetailedMapping[oldStatus]) {
            detailedStatus = spanishDetailedMapping[oldStatus];
            newStatus = 'In Progress';
          } else if (oldStatus === 'Active') {
            newStatus = 'In Progress';
          } else if (oldStatus === 'Approved') {
            newStatus = 'Won';
          } else if (oldStatus === 'Rejected') {
            newStatus = 'Lost';
          } else if (oldStatus === 'Canceled' || oldStatus === 'Cancelled') {
            newStatus = 'Canceled';
          } else if (['In Progress', 'On Hold', 'Submitted', 'Won', 'Lost', 'Canceled'].includes(oldStatus)) {
            newStatus = oldStatus as OpportunityStatus;
          }

          // Commercial Migration: Map legacy fields to customSections
          let customSections: any[] = [];
          if (o.commercial) {
            const oldComm = o.commercial as any;
            if (oldComm.customSections) {
              customSections = oldComm.customSections;
            } else {
              // Convert legacy rows
              if (oldComm.hardware || oldComm.software) {
                const hw = oldComm.hardware || { cost: 0, margin: 0, sellPrice: 0, discount: 0 };
                const sw = oldComm.software || { cost: 0, margin: 0, sellPrice: 0, discount: 0 };
                customSections.push({
                  id: 'legacy-swhw',
                  name: 'Software & Hardware',
                  cost: (hw.cost || 0) + (sw.cost || 0),
                  margin: hw.margin || sw.margin || 0,
                  sellPrice: (hw.sellPrice || 0) + (sw.sellPrice || 0),
                  discount: hw.discount || sw.discount || 0
                });
              } else if (oldComm.swHw) {
                customSections.push({ id: 'legacy-swhw-merged', name: 'Software & Hardware', ...oldComm.swHw });
              }

              if (oldComm.services && (oldComm.services.cost > 0 || oldComm.services.sellPrice > 0)) {
                customSections.push({ id: 'legacy-services', name: 'Services', ...oldComm.services });
              }
              if (oldComm.resale && (oldComm.resale.cost > 0 || oldComm.resale.sellPrice > 0)) {
                customSections.push({ id: 'legacy-resale', name: 'Resale / 3rd Party', ...oldComm.resale });
              }
            }
          }

          const newCommercial: Commercial = {
            currency: (o.commercial as any)?.currency || 'USD',
            customSections: customSections,
            agreementsLink: (o.commercial as any)?.agreementsLink || '',
            cfLink: (o.commercial as any)?.cfLink || '',
            discountsAndNotes: (o.commercial as any)?.discountsAndNotes || '',
            cqaOfficialSellPrice: (o.commercial as any)?.cqaOfficialSellPrice || 0,
            cqaOfficialMargin: (o.commercial as any)?.cqaOfficialMargin || 0
          };

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
            detailedStatus: detailedStatus,
            qlk: o.qlk || '',
            revision: o.revision || 'R0',
            priorityOrder: (o as any).priorityOrder ?? null,
            alias: (o as any).alias || '',
            presentation: o.presentation || emptyPrd,
            dates: {
              requested: o.dates?.requested || '',
              expected: o.dates?.expected || '',
              assigned: (o.dates as any)?.assigned || new Date().toISOString().split('T')[0]
            },
            links: Array.isArray(o.links)
              ? o.links
              : {
                ...o.links,
                ba: (o.links as any)?.ba || '',
                srLink: (o.links as any)?.srLink || '',
                geet: (o.links as any)?.geet || ''
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

    // Reset state before loading new DB to avoid stale data conflicts
    setDb(INITIAL_DB);
    setIsDbLoaded(false);
    setFileHandle(null);

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
          // @ts-ignore
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
        await saveToDisk(result.handle, result.data); // Force immediate save
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
  const createOpportunity = (stage: ProcessStage = '1. Intake') => {
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
        description: '', // Reset description
        status: 'Pending',
        priority: (t.priority || 'Medium') as TaskPriority,
        owner: (t.owner || 'Me') as TaskOwner,
        responsible: '',
        dueDate: '',
        stageContext: stage,
        subtasks: (t.subtasks || []).map(st => ({ ...st, id: crypto.randomUUID(), completed: false })),
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
          status: 'Pending',
          priority: tmpl.priority || 'Medium',
          owner: tmpl.owner || 'Me',
          externalAreas: tmpl.externalAreas || [],
          responsible: '',
          dueDate: '',
          stageContext: stage,
          subtasks: (tmpl.subtasks || []).map(st => ({ ...st, id: crypto.randomUUID(), completed: false })),
          order: tmpl.order,
          dependsOnTaskIds: mappedDependencies,
          blockDoneUntilDependenciesDone: tmpl.blockDoneUntilDependenciesDone || false,
          calendarized: tmpl.calendarized || false
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
      detailedStatus: 'Working on it',
      dates: { requested: new Date().toISOString().split('T')[0], expected: '', assigned: new Date().toISOString().split('T')[0] },
      priority: 'Medium',
      priorityOrder: null,
      alias: '',
      description: '',
      tags: [],
      labels: [],
      commercial: {
        currency: 'USD',
        customSections: [],
        agreementsLink: '',
        cfLink: '',
        discountsAndNotes: '',
        cqaOfficialSellPrice: 0,
        cqaOfficialMargin: 0
      },
      links: { bfo: '', internalFolder: '', officialFolder: '', cqaLink: '', ba: '', srLink: '', geet: '' },
      notes: initialNotes,
      tasks: assignMissingOrders(defaultTasks),
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
      kanbanNote: '',
      lastUpdated: new Date().toISOString()
    };

    const initialOpps = [newOpp, ...db.opportunities];
    const rebalanced = rebalancePriorities(initialOpps, newOpp.id, 1, true);
    setDb(prev => ({ ...prev, opportunities: rebalanced }));
    setSelectedOppId(newId);
  };

  const rebalancePriorities = (opps: Opportunity[], changedId?: string, newOrder?: number | null, statusChanged: boolean = false) => {
    // Optimization: If no priority or status change, return early (or just basic sort)
    // But for safety and to keep the 1..N property, we'll run an O(N) version.
    
    const statuses: OpportunityStatus[] = ['In Progress', 'On Hold', 'Submitted', 'Won', 'Lost', 'Canceled'];
    
    // 1. Group by status - O(N)
    const groups: Record<string, Opportunity[]> = {};
    statuses.forEach(s => groups[s] = []);
    opps.forEach(o => {
        if (groups[o.statusLabel]) groups[o.statusLabel].push(o);
        else (groups['In Progress'] as Opportunity[]).push(o); // Fallback
    });

    const resultOpps: Opportunity[] = [];

    // 2. Process each group
    statuses.forEach(status => {
      let group = groups[status];
      if (group.length === 0) return;

      const targetInGroup = changedId ? group.find(o => o.id === changedId) : null;

      if (targetInGroup && statusChanged) {
        // Change of status/new: Shift to 2nd position (UX requirement)
        const others = group.filter(o => o.id !== changedId).sort((a, b) => (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999));
        if (others.length > 0) {
          group = [others[0], targetInGroup, ...others.slice(1)];
        } else {
          group = [targetInGroup];
        }
      } else if (targetInGroup && newOrder !== undefined && newOrder !== null) {
        // Manual reorder (Drag & Drop or direct edit)
        const others = group.filter(o => o.id !== changedId).sort((a, b) => (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999));
        const newGroup: Opportunity[] = [];
        let inserted = false;
        const targetPos = Math.max(1, newOrder);

        others.forEach((o, idx) => {
          if (idx + 1 === targetPos) {
            newGroup.push(targetInGroup);
            inserted = true;
          }
          newGroup.push(o);
        });
        if (!inserted) newGroup.push(targetInGroup);
        group = newGroup;
      } else {
        // Stable sort to maintain 1..N even if some gaps exist
        group.sort((a, b) => (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999));
      }

      // 3. Re-index 1..N and collect into results (returning new objects only if needed for immutability)
      group.forEach((o, idx) => {
        const order = idx + 1;
        if (o.priorityOrder !== order) {
            resultOpps.push({ ...o, priorityOrder: order });
        } else {
            resultOpps.push(o);
        }
      });
    });
    
    return resultOpps;
  };

  const updateOpportunity = (updatedOpp: Opportunity, id?: string) => {
    // Auto-assign any missing task orders before saving globally
    if (updatedOpp.tasks) {
        updatedOpp.tasks = assignMissingOrders(updatedOpp.tasks);
    }
    
    // HOTFIX PERFORMANCE: Trim history and old versions globally to prevent DB bloat
    if (updatedOpp.history && updatedOpp.history.length > 300) updatedOpp.history = updatedOpp.history.slice(0, 300);
    if (updatedOpp.versions && updatedOpp.versions.length > 20) updatedOpp.versions = updatedOpp.versions.slice(-20);
    
    if (id && id !== updatedOpp.id) {
      if (id === selectedOppId) setSelectedOppId(updatedOpp.id);
    }
    // Use startTransition so React treats this as a non-blocking background update
    // This keeps the UI responsive (inputs, buttons) while the state is being processed
    React.startTransition(() => {
      setDb(prev => {
        const oldOpp = prev.opportunities.find(o => o.id === (id || updatedOpp.id));
        const orderChanged = oldOpp?.priorityOrder !== updatedOpp.priorityOrder;
        const statusChanged = oldOpp?.statusLabel !== updatedOpp.statusLabel;

        const initialMap = prev.opportunities.map(o => o.id === (id || updatedOpp.id) ? { ...o, ...updatedOpp } : o);

        // OPTIMIZATION: Only run the expensive rebalance if order or status actually changed.
        // For field edits (title, date, description, tasks) just replace the opp directly.
        const rebalanced = (orderChanged || statusChanged)
          ? rebalancePriorities(initialMap, updatedOpp.id, orderChanged ? updatedOpp.priorityOrder : undefined, statusChanged)
          : initialMap;

        return {
          ...prev,
          opportunities: rebalanced
        };
      });
    });
  };

  const moveOpportunityStage = useCallback((id: string, newStage: ProcessStage) => {
    React.startTransition(() => {
      setDb(prev => ({
        ...prev,
        opportunities: prev.opportunities.map(o => o.id === id ? { ...o, stage: newStage, lastUpdated: new Date().toISOString() } : o)
      }));
    });
  }, []);

  const changeOpportunityDate = useCallback((id: string, type: 'expected' | 'dueDate', newDate: string) => {
    if (type === 'expected') {
      React.startTransition(() => {
        setDb(prev => ({
          ...prev,
          opportunities: prev.opportunities.map(o => o.id === id ? { ...o, dates: { ...o.dates, expected: newDate }, lastUpdated: new Date().toISOString() } : o)
        }));
      });
    }
  }, []);

  const updateTaskDetails = useCallback((oppId: string, taskId: string, updates: Partial<Task>) => {
    React.startTransition(() => {
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
    });
  }, []);

  const handleTimerLog = (taskId: string, oppId: string, seconds: number, status?: TaskStatus) => {
    React.startTransition(() => {
      setDb(prev => {
        const newOpps = prev.opportunities.map(o => {
          if (o.id !== oppId) return o;

          const taskIndex = o.tasks.findIndex(t => t.id === taskId);
          if (taskIndex === -1) return o;

          const updatedTasks = [...o.tasks];
          const task = { ...updatedTasks[taskIndex] };

          const now = new Date();
          const nowIso = now.toISOString();
          const dateStr = now.toLocaleDateString('en-CA');
          const start = new Date(Date.now() - seconds * 1000).toISOString();

          const newLog: any = {
            id: crypto.randomUUID(),
            startTime: start,
            endTime: nowIso,
            durationSeconds: seconds,
            description: 'Timer Log'
          };

          task.timeLogs = [...(task.timeLogs || []), newLog];

          if (status) {
            task.status = status;
          } else if (task.status === 'Pending') {
            task.status = 'In Progress';
          }

          updatedTasks[taskIndex] = task;

          // --- Link to Tracker (KPI Areas) ---
          let updatedAreas = [...(o.kpis.areasInvolved || [])];

          // Determine Target Area
          let targetAreaName = 'General';
          if (task.owner === 'Me') {
            targetAreaName = 'Tendering';
          } else if (task.externalAreas && task.externalAreas.length > 0) {
            targetAreaName = task.externalAreas[0];
          } else if (task.owner === 'External Area') {
            targetAreaName = 'External';
          }

          // Find or Create Area
          let areaIndex = updatedAreas.findIndex(a => a.area === targetAreaName);
          if (areaIndex === -1) {
            updatedAreas.push({
              id: crypto.randomUUID(),
              area: targetAreaName,
              daysSpent: 0,
              waitingDays: 0,
              calendar: {}
            });
            areaIndex = updatedAreas.length - 1;
          }

          // Update Calendar for Date
          const area = { ...updatedAreas[areaIndex] };
          const calendar = { ...(area.calendar || {}) };
          const existingRecord = calendar[dateStr] || { type: 'Worked', hours: 0, minutes: 0 };

          // Calculate total seconds to ensure precision when adding
          const existingTotalSeconds = ((existingRecord.hours || 0) * 3600) + ((existingRecord.minutes || 0) * 60);
          const totalSeconds = existingTotalSeconds + seconds;

          calendar[dateStr] = {
            ...existingRecord,
            type: 'Worked',
            hours: Math.floor(totalSeconds / 3600),
            minutes: Math.floor((totalSeconds % 3600) / 60)
          };

          area.calendar = calendar;
          updatedAreas[areaIndex] = area;

          return {
            ...o,
            tasks: updatedTasks,
            kpis: { ...o.kpis, areasInvolved: updatedAreas },
            lastUpdated: new Date().toISOString()
          };
        });

        return { ...prev, opportunities: newOpps };
      });
    });
  };
  // Stabilize opportunities reference so React.memo on Dashboard actually works.
  // Without this, db.opportunities is always a new array, defeating the memo.
  const stableOpportunities = useMemo(() => db.opportunities, [db.opportunities]);

  // HOTFIX PERFORMANCE: Persistent Cache for Light Opportunities (v5000)
  // Stripping thousands of 1MB HTML notes on every keystroke/drag kills the UI thread.
  // This cache ensures we only map the changed objects, keeping the drag & drop buttery smooth.
  const lightCacheRef = useRef<Map<string, any>>(new Map());
  const lightOpportunities = useMemo(() => {
    if (!stableOpportunities) return [];
    
    return stableOpportunities.map(opp => {
      const existing = lightCacheRef.current.get(opp.id);
      // If the reference to the full object hasn't changed, reuse the light reference.
      // This is extremely important for React.memo performance in Dashboard.OpportunityCard.
      if (existing && existing._originalRef === opp) return existing;

      const light = {
        ...opp,
        notes: (opp.notes || []).map(n => ({ ...n, content: '' })), // Content metadata only
        versions: [], // Strip heavy snapshots
        _originalRef: opp, // Tag for cache-busting
        // PRE-CALCULATE Search Index: This prevents millions of string concatenations in Dashboard/v5000 filter.
        _searchIndex: (
          `${opp.title} ${opp.id} ${opp.customer} ${opp.statusLabel} ${opp.quoteType || ''} ` +
          `${opp.srId || ''} ${(opp.versions || []).map(v => v.srId || '').filter(Boolean).join(' ')} ` +
          `${opp.alias || ''} ${(opp.labels || []).map(l => l.text).join(' ')} ` +
          `${(opp.commercial.customSections || []).map(sec => sec.name).join(' ')}`
        ).toLowerCase()
      };
      lightCacheRef.current.set(opp.id, light);
      return light;
    });
  }, [stableOpportunities]);

  const selectedOppForDetail = useMemo(() => {
    if (!selectedOppId) return null;
    return stableOpportunities.find(o => o.id === selectedOppId);
  }, [stableOpportunities, selectedOppId]);

  const handleSelectOpp = useCallback((id: string, dl?: DeepLink) => {
    setSelectedOppId(id);
    setActiveDeepLink(dl || null);
  }, []);

  const handleCreateOppAtRoot = useCallback((stage?: ProcessStage) => {
    createOpportunity(stage || '1. Intake');
  }, [createOpportunity]);

  return (
    <TimerProvider onLogTime={handleTimerLog} opportunities={stableOpportunities}>
      <div className="h-screen flex flex-col bg-white text-gray-900 font-sans overflow-hidden relative">
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
            <div className={`flex gap-1 bg-gray-50 p-1 rounded-lg ${isPending ? 'opacity-70 pointer-events-none' : ''}`}>
              <button
                onClick={() => { startTransition(() => setCurrentView('general-dashboard')); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'general-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <BarChart3 className="w-4 h-4" /> General
              </button>
              <button
                onClick={() => { startTransition(() => setCurrentView('proposals-dashboard')); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'proposals-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Layout className="w-4 h-4" /> Proposals
              </button>
              <button
                onClick={() => { startTransition(() => setCurrentView('tasks-dashboard')); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'tasks-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <CheckSquare className="w-4 h-4" /> Tasks
              </button>
              <div className="w-px h-4 bg-gray-200 mx-1 self-center"></div>
              <button
                onClick={() => window.open(`${window.location.origin}/index_flow.html`, '_blank')}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-bold rounded-md transition-all text-blue-600 hover:bg-blue-50 border border-blue-100"
                title="Open executive questions and decision map"
              >
                <ExternalLink className="w-4 h-4" /> Executive Flow
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
                        className="px-2 py-1.5 hover:bg-gray-50 rounded-r-lg h-full flex items-center justify-center text-gray-500 border-l border-gray-200"
                        title="Switch Database"
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
              <div className="flex items-center gap-3 animate-fade-in">
                <span className="text-xs text-gray-400 font-mono hidden sm:inline-block border border-gray-100 px-2 py-1 rounded bg-gray-50 flex items-center gap-1">
                  <FileJson className="w-3 h-3" />
                  {fileHandle ? fileHandle.name : fallbackFileName}
                </span>

                {/* Always allow switching DB even when loaded */}
                <div className="relative">
                  <button
                    onClick={() => setShowRecents(!showRecents)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 rounded-lg transition-colors shadow-sm"
                    title="Switch Database"
                  >
                    <FolderOpen className="w-4 h-4" /> Switch
                  </button>
                  {showRecents && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowRecents(false)} />
                      <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden animate-fade-in">
                        <div className="p-2 border-b border-gray-100">
                          <button onClick={() => { setShowRecents(false); handleOpenDB(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded text-left">
                            <FolderOpen className="w-4 h-4 text-[#3DCD58]" /> Open another file...
                          </button>
                        </div>
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

                <div className="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 flex items-center">
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

        <div className="flex-1 overflow-hidden relative flex min-h-0">
          {/* Main Content Area */}
          <div className={`flex-1 flex min-h-0 overflow-hidden transition-all duration-300`}>
            {/* Dashboard / Primary Content */}
            <div className={`h-full overflow-hidden transition-all duration-300 ${splitTab ? 'w-1/2 border-r border-gray-100' : 'w-full'}`}>
              <LocalErrorBoundary fallbackLabel="Dashboard">
                <Dashboard
                  key={fileHandle?.name || 'sandbox'}
                  mode={currentView === 'proposals-dashboard' ? 'proposals' : currentView === 'tasks-dashboard' ? 'tasks' : 'general'}
                  opportunities={lightOpportunities}
                  onSelect={handleSelectOpp}
                  onCreate={handleCreateOppAtRoot}
                  onStageChange={moveOpportunityStage}
                  onDateChange={changeOpportunityDate}
                  onOppUpdate={updateOpportunity}
                  onTaskUpdate={updateTaskDetails}
                  holidays={appSettings.holidays || []}
                  globalLabels={appSettings.globalLabels || []}
                  onMinimize={minimizeToDock}
                />
              </LocalErrorBoundary>
            </div>

            {/* Sub-View Overlay Panel (Full Screen) */}
            {splitTab && (
              <div className="fixed inset-0 bg-white z-[150] animate-in slide-in-from-right duration-300 flex flex-col">
                <div className="flex-1 overflow-hidden">
                  {renderSplitTabContent(splitTab)}
                </div>
              </div>
            )}
          </div>

          {/* Right Navigation Dock */}
          <QuickNavDock
            tabs={floatingTabs}
            onRestore={restoreFromDock}
            onRemove={removeTab}
            onUpdateColor={updateTabColor}
            onUpdateTitle={updateTabTitle}
            onReorder={setFloatingTabs}
            activeTabId={splitTab?.id || (selectedOppId && !activeDeepLink ? selectedOppId : null)}
          />

          {/* Opportunity Detail Overlay */}
          {selectedOppForDetail && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-6 animate-in fade-in duration-200" onClick={() => { setSelectedOppId(null); setActiveDeepLink(null); }}>
              <div className="bg-white w-full h-full rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
                <LocalErrorBoundary fallbackLabel="Opportunity Detail">
                  <OpportunityDetail
                    opportunity={selectedOppForDetail}
                    opportunities={stableOpportunities}
                    onBack={() => { setSelectedOppId(null); setActiveDeepLink(null); }}
                    onUpdate={updateOpportunity}
                    onDelete={() => deleteOpportunity(selectedOppForDetail.id)}
                    onSelectOpp={handleSelectOpp}
                    noteTemplates={appSettings.noteTemplates}
                    holidays={appSettings.holidays || []}
                    trackedAreas={appSettings.trackedAreas || []}
                    globalLabels={appSettings.globalLabels || []}
                    deepLink={activeDeepLink || undefined}
                    onMinimize={minimizeToDock}
                  />
                </LocalErrorBoundary>
              </div>
            </div>
          )}
        </div>

        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          initialSettings={appSettings}
          opportunities={stableOpportunities}
        />
        <StickyNotesWidget />
        <TimerWidget onTaskClick={handleTimerTaskClick} />

      </div>
    </TimerProvider >
  );
}

export default App;
