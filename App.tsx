
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DatabaseSchema, Opportunity, INITIAL_DB, ProcessStage, Task, CommercialRow, Commercial, ExternalArea, TaskStatus, TaskOwner, TaskPriority, PrdPresentation, OpportunityStatus, KPIs, DeepLink, FloatingTab, DetailedStatus, GlobalContact } from './types';
import { openDatabaseFile, createDatabaseFile, saveToDisk } from './services/fileSystem';
import { rememberDb, getLastDb, getRecentDbs, getRecentDbHandle, removeRecentDb, RecentDbEntry } from './services/recentDbHandles';
import { importBackendDb, isBackendAvailable, openDefaultBackendDb, saveBackendDb } from './services/backendDb';
import Dashboard from './components/Dashboard';
import OpportunityDetail from './components/OpportunityDetail';
import { SettingsModal, DEFAULT_SETTINGS, AppSettings } from './components/SettingsModal';
import { FolderOpen, Save, HardDrive, PlusCircle, AlertCircle, FileJson, Layout, CheckSquare, BarChart3, X, Settings as SettingsIcon, History, ChevronDown, Trash2, CalendarDays, Maximize2, Columns, Palette, FileText, Activity, GripVertical, Minus, ExternalLink } from 'lucide-react';
import { TimerProvider } from './contexts/TimerContext';
import { TimerWidget } from './components/TimerWidget';
import { ProcessRadialWidget } from './components/ProcessRadialWidget';
import { StickyNotesWidget } from './components/StickyNotesWidget';
import { QuickNavDock } from './components/QuickNavDock';
import { assignMissingOrders } from './services/taskUtils';
import { useScheduleNotifications } from './features/schedule/useScheduleNotifications';


type AppStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
type AppView = 'general-dashboard' | 'proposals-dashboard' | 'tasks-dashboard';
type StorageMode = 'backend' | 'file' | null;

const getTodayStr = () => new Date().toLocaleDateString('en-CA');

/**
 * Creates one compact, lower-cased text index for dashboard searches.  It is
 * calculated only when an opportunity changes, so searching long rich-text
 * notes never has to traverse the complete opportunity object while typing.
 */
const buildOpportunitySearchIndex = (opportunity: Opportunity): string => {
  const values: string[] = [];
  const visited = new WeakSet<object>();

  const collect = (value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      values.push(String(value));
      return;
    }
    if (typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach(item => collect(item));
      return;
    }

    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      // Internal cache data is not user-searchable. Version snapshots repeat
      // the entire opportunity and would needlessly inflate the search index.
      if (childKey.startsWith('_') || childKey === 'snapshot') return;
      collect(childValue);
    });
  };

  collect(opportunity);
  return values.join(' ').toLowerCase();
};

const normalizeHistoryDate = (value?: string | null) => {
  if (!value) return getTodayStr();
  const raw = value.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? getTodayStr() : parsed.toLocaleDateString('en-CA');
};

const sortHistoryEntries = <T extends { date: string }>(history: T[]) =>
  [...history]
    .map(entry => ({ ...entry, date: normalizeHistoryDate(entry.date) }))
    .sort((a, b) => b.date.localeCompare(a.date));

const markTenderingWorkedDay = (opp: Opportunity, date: string): Opportunity => {
  const baseKpis = opp.kpis || {
    languageSkill: 0,
    technicalUnderstanding: 0,
    dealProbability: 0,
    effortContribution: 0,
    sold: null,
    proposalAmountUSD: 0,
    timeline: { receivedAt: opp.dates?.requested || getTodayStr(), deliveredAt: null, cancelledAt: null, cancelledReason: null },
    execution: { myWorkDays: 0, waitingOnOthersDays: 0 },
    areasInvolved: [],
  };
  const areas = baseKpis.areasInvolved || [];
  const tendering = areas.find(a => a.area === 'Tendering') || {
    id: crypto.randomUUID(),
    area: 'Tendering',
    daysSpent: 0,
    waitingDays: 0,
    calendar: {},
  };
  const calendar = {
    ...(tendering.calendar || {}),
    [date]: {
      ...(tendering.calendar?.[date] || {}),
      type: 'Worked' as const,
      hours: tendering.calendar?.[date]?.hours || 1,
    },
  };

  let worked = 0;
  let waiting = 0;
  Object.values(calendar).forEach(record => {
    if (record.type === 'Worked') {
      const totalHours = (record.hours || 0) + (record.minutes || 0) / 60;
      if (totalHours >= 1) worked++;
    } else if (record.type === 'Waiting') {
      waiting++;
    }
  });

  const nextTendering = { ...tendering, calendar, daysSpent: worked, waitingDays: waiting };
  const nextAreas = areas.some(a => a.area === 'Tendering')
    ? areas.map(a => a.area === 'Tendering' ? nextTendering : a)
    : [...areas, nextTendering];

  return {
    ...opp,
    kpis: {
      ...baseKpis,
      areasInvolved: nextAreas,
    },
  };
};

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

// PERF: single shared empty array so every `x || EMPTY_ARR` fallback points at
// the same reference — keeps React.memo equality stable when settings keys are
// undefined.
const EMPTY_ARR: any[] = Object.freeze([]) as any[];

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
  const [pendingHandle, setPendingHandle] = useState<FileSystemFileHandle | null>(null);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [fallbackFileName, setFallbackFileName] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>(null);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [backendRevision, setBackendRevision] = useState<number>(0);
  const [backendName, setBackendName] = useState<string | null>(null);

  // Navigation
  const [currentView, setCurrentView] = useState<AppView>('general-dashboard');
  const [isPending, startTransition] = React.useTransition();

  // Detail Overlay State (Notion-like)
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [activeDeepLink, setActiveDeepLink] = useState<DeepLink | null>(null);
  const pendingOpenOpportunityRef = useRef<string | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('openOpportunity') : null
  );

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Quick Nav State
  const [floatingTabs, setFloatingTabs] = useState<FloatingTab[]>([]);
  const [splitTab, setSplitTab] = useState<FloatingTab | null>(null);

  // Debounce saving
  const saveTimeoutRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  // E1 FIX: Track whether a mousedown started inside the detail overlay so that
  // text-selection drags that leave the inner container don't trigger the backdrop click.
  const detailMouseDownInsideRef = useRef(false);
  // TA2 FIX: Monotonically increasing counter added to each deepLink so repeated
  // navigations to the same task always re-fire the scroll/highlight effect.
  const deepLinkNonceRef = useRef(0);
  // DATA-LOSS FIX: when a critical mutation (e.g. a note content flush on
  // expediente close) arrives, we want the autosave to fire almost immediately
  // instead of waiting the normal 3-second debounce. Setting this ref to true
  // is consumed by the next autosave effect tick.
  const immediateFlushRef = useRef(false);
  const backendRevisionRef = useRef(0);
  // PERF FIX: Debounce refs for sessionStorage writes.
  // sessionStorage.setItem is synchronous and runs on the main thread.
  // On low-RAM machines it can spike for 5-15ms per call.
  // Rapid state changes (e.g. typing + navigation) queued multiple writes per second.
  // 300ms debounce batches bursts of changes into a single write.
  const sessionTabsTimerRef = useRef<number | null>(null);
  const sessionNavTimerRef = useRef<number | null>(null);

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
        setAppSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
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

  // PERF FIX: Debounced sessionStorage writes (was synchronous on every render).
  // sessionStorage.setItem blocks the main thread. On low-RAM machines this
  // contributes visible jank when the user types or changes tabs frequently.
  useEffect(() => {
    if (sessionTabsTimerRef.current) clearTimeout(sessionTabsTimerRef.current);
    sessionTabsTimerRef.current = window.setTimeout(() => {
      sessionStorage.setItem('TenderLoop_FloatingTabs_V1', JSON.stringify(floatingTabs));
    }, 300);
    return () => { if (sessionTabsTimerRef.current) clearTimeout(sessionTabsTimerRef.current); };
  }, [floatingTabs]);

  useEffect(() => {
    if (sessionNavTimerRef.current) clearTimeout(sessionNavTimerRef.current);
    sessionNavTimerRef.current = window.setTimeout(() => {
      const navState = { currentView, selectedOppId, activeDeepLink };
      sessionStorage.setItem('TenderLoop_Navigation_V1', JSON.stringify(navState));
    }, 300);
    return () => { if (sessionNavTimerRef.current) clearTimeout(sessionNavTimerRef.current); };
  }, [currentView, selectedOppId, activeDeepLink]);

  // Load Recents & Auto-open last DB
  useEffect(() => {
    const init = async () => {
      const hasBackend = await isBackendAvailable();
      setBackendAvailable(hasBackend);
      if (hasBackend) {
        try {
          setStatus('loading');
          const snapshot = await openDefaultBackendDb();
          const migratedData = migrateData(snapshot.data);
          mergeNoteCrashBackups(migratedData);
          setDb(migratedData);
          setFileHandle(null);
          setStorageMode('backend');
          backendRevisionRef.current = snapshot.status.revision;
          setBackendRevision(snapshot.status.revision);
          setBackendName(snapshot.status.name || 'TenderLoop backend DB');
          setFallbackFileName(snapshot.status.name || 'TenderLoop backend DB');
          setIsDbLoaded(true);
          setStartupHint(null);
          setErrorMessage(null);
          setStatus('idle');
          return;
        } catch (err: any) {
          if (err?.status !== 404) {
            console.warn('[Backend DB] Auto-open failed, falling back to file picker flow.', err);
            setErrorMessage('Backend DB unavailable: ' + err.message);
          }
          setStatus('idle');
        }
      }

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
        } else if (perm === 'prompt') {
          // Handle found but permission expired — show a one-click reopen button
          setPendingHandle(lastHandle);
          setStartupHint('__reopen__');
        } else {
          setStartupHint("Open or create a database file to get started.");
        }
      } else {
        setStartupHint("Open or create a database file to get started.");
      }
    };
    init();
  }, []);

  // Tab Synchronization State
  const tabId = useRef(crypto.randomUUID()).current;
  const isBroadcastingRef = useRef(false);
  const syncChannel = useRef<BroadcastChannel | null>(null);

  // Latest-value refs keep callbacks that depend on db / settings / rebalance
  // stable (useCallback with empty deps) without going stale — avoids cascading
  // re-renders through Dashboard / OpportunityDetail when unrelated state changes.
  const dbRef = useRef(db);
  dbRef.current = db;
  backendRevisionRef.current = backendRevision;
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  /**
   * Always resolves against the latest globalContacts, not whatever a given
   * OpportunityDetail render closed over — otherwise two directory saves fired
   * close together (or from two mounted instances of the same opportunity)
   * can race and the second silently overwrites the first.
   */
  const applyGlobalContactsUpdate = (update: GlobalContact[] | ((prev: GlobalContact[]) => GlobalContact[])) => {
    const prev = appSettingsRef.current.globalContacts || [];
    const next = typeof update === 'function' ? (update as (prev: GlobalContact[]) => GlobalContact[])(prev) : update;
    handleSaveSettings({ ...appSettingsRef.current, globalContacts: next });
  };
  const selectedOppIdRef = useRef(selectedOppId);
  selectedOppIdRef.current = selectedOppId;

  // PERF: Stable references for settings-derived arrays. Expressions like
  // `appSettings.holidays || []` allocate a new empty array on every App
  // render, busting React.memo on Dashboard/OpportunityDetail and forcing
  // their multi-thousand-line trees to reconcile each time App state moves.
  const stableHolidays = useMemo(() => appSettings.holidays || EMPTY_ARR, [appSettings.holidays]);
  const stableGlobalLabels = useMemo(() => appSettings.globalLabels || EMPTY_ARR, [appSettings.globalLabels]);
  const stableTrackedAreas = useMemo(() => appSettings.trackedAreas || EMPTY_ARR, [appSettings.trackedAreas]);
  const stableGlobalContacts = useMemo(() => appSettings.globalContacts || EMPTY_ARR, [appSettings.globalContacts]);
  const stableHiddenOpportunityDetailSections = useMemo(() => appSettings.hiddenOpportunityDetailSections || EMPTY_ARR, [appSettings.hiddenOpportunityDetailSections]);
  const stableOpportunityDetailSectionOrder = useMemo(() => appSettings.opportunityDetailSectionOrder || EMPTY_ARR, [appSettings.opportunityDetailSectionOrder]);
  const rebalancePrioritiesRef = useRef<(opps: Opportunity[], changedId?: string, newOrder?: number | null, statusChanged?: boolean) => Opportunity[]>(() => []);

  useEffect(() => {
    const handleGlobalEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;

      window.setTimeout(() => {
        if (e.defaultPrevented) return;

        if (showSettings) {
          e.preventDefault();
          setShowSettings(false);
          return;
        }

        if (splitTab) {
          e.preventDefault();
          setSplitTab(null);
          return;
        }

        if (selectedOppId) {
          e.preventDefault();
          setSelectedOppId(null);
          setActiveDeepLink(null);
        }
      }, 0);
    };

    document.addEventListener('keydown', handleGlobalEscape);
    return () => document.removeEventListener('keydown', handleGlobalEscape);
  }, [showSettings, splitTab, selectedOppId]);

  // Data Synchronization (Database only, not UI state/navigation)
  useEffect(() => {
    const initSync = () => {
      syncChannel.current = new BroadcastChannel('tenderloop_db_sync');
      syncChannel.current.onmessage = (event) => {
        if (event.data.originTabId === tabId) return;

        if (event.data.type === 'OPP_UPDATE') {
          const { oppId, oppData } = event.data;
          console.debug("[Sync] Received OPP update delta from another tab:", oppId);
          isBroadcastingRef.current = true;
          setDb(prev => ({
            ...prev,
            opportunities: prev.opportunities.map(o => o.id === oppId ? { ...o, ...oppData } : o)
          }));
          setStatus('saved');
        } else if (event.data.type === 'DB_UPDATE') {
          console.debug("[Sync] Received FULL DB update from another tab");
          isBroadcastingRef.current = true; // Mark as remote change to avoid re-broadcast
          setDb(event.data.db);
          setStatus('saved');
        } else if (event.data.type === 'BACKEND_REVISION') {
          const revision = Number(event.data.revision || 0);
          if (revision > 0) {
            backendRevisionRef.current = revision;
            setBackendRevision(revision);
            setStatus('saved');
          }
        }
      };
    };
    initSync();
    return () => syncChannel.current?.close();
  }, [tabId]);

  // Auto-save Effect
  useEffect(() => {
    if (!db || !isDbLoaded || status === 'loading') return;
    if (storageMode === 'file' && !fileHandle) return;
    if (storageMode !== 'backend' && storageMode !== 'file') return;

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
        console.debug("[Sync] Broadcasting OPPORTUNITY update (debounced)");
        // ALGORITHM: Only send the ID of the changed item + its content if small.
        // For large DBs, sending the whole array freezes the UI due to structural clone.
        const lastDetailId = selectedOppId;
        const currentOpp = db.opportunities.find(o => o.id === lastDetailId);
        
        syncChannel.current.postMessage({ 
          type: 'OPP_UPDATE', 
          oppId: lastDetailId, 
          oppData: currentOpp,
          originTabId: tabId 
        });
      }
    }, 2000); // 2s debounce for cross-tab sync

    // Autosave debounce: 3s balances UI responsiveness against data-loss window.
    // The earlier 10s setting meant a user who types in the commercial/notes tab and
    // closes the window within 10s could lose the entire edit. Serialization runs in
    // a web worker, so the main thread is not blocked even with large DBs.
    // DATA-LOSS FIX: when immediateFlushRef is set (e.g. note flush on close),
    // shrink the debounce to 120ms so closing the app right after a note edit
    // still persists to disk.
    const immediate = immediateFlushRef.current;
    if (immediate) immediateFlushRef.current = false; // consume
    const delay = immediate ? 120 : 3000;

    console.debug(`[Autosave] Change detected. Enqueueing save in ${delay}ms${immediate ? ' (immediate)' : ''}.`);

    const runSave = async () => {
      if (isSavingRef.current) {
        // DATA-LOSS FIX: don't just return — retry shortly. Before, deferring
        // meant losing the change if no further setDb followed.
        console.debug("[Autosave] Concurrency: save already running, retrying in 250ms.");
        // @ts-ignore
        saveTimeoutRef.current = window.setTimeout(runSave, 250);
        return;
      }

      // DATA-LOSS FIX: snapshot backup keys BEFORE the async write begins.
      // Anything written during the save must survive — those edits may not
      // be included in the `db` snapshot we're about to persist.
      const backupsAtSaveStart: string[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('tl-note-backup-')) backupsAtSaveStart.push(k);
        }
      } catch {}

      try {
        isSavingRef.current = true;
        console.debug("[Autosave] Flush started...");
        setStatus('saving');

        let success = false;
        if (storageMode === 'backend') {
          console.debug("[Autosave] Executing saveBackendDb...");
          const snapshot = await saveBackendDb(db, backendRevisionRef.current || undefined);
          backendRevisionRef.current = snapshot.status.revision;
          setBackendRevision(snapshot.status.revision);
          setBackendName(snapshot.status.name || 'TenderLoop backend DB');
          setFallbackFileName(snapshot.status.name || 'TenderLoop backend DB');
          syncChannel.current?.postMessage({
            type: 'BACKEND_REVISION',
            revision: snapshot.status.revision,
            originTabId: tabId
          });
          success = true;
        } else {
          if (!fileHandle) return;
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
          success = await saveToDisk(fileHandle, db);
        }

        if (success) {
          console.debug("[Autosave] Save success.");
          setStatus('saved');
          // DATA-LOSS FIX: only clear backups that already existed when we
          // started this write — newer backups belong to edits that aren't
          // in the `db` snapshot we just serialized.
          try {
            backupsAtSaveStart.forEach(k => localStorage.removeItem(k));
          } catch {}
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
        if (err?.status === 409) {
          setErrorMessage("Backend database changed elsewhere. Reload the database before saving more changes.");
        } else {
          setErrorMessage(storageMode === 'backend' ? "Failed to save changes through backend." : "Failed to save changes. Check file permissions.");
        }
      } finally {
        isSavingRef.current = false;
      }
    };

    // @ts-ignore
    saveTimeoutRef.current = window.setTimeout(runSave, delay);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [db, fileHandle, isDbLoaded, storageMode]);

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

  // DATA-LOSS FIX: Merge any crash-recovery note backups left in localStorage
  // from a previous session where the app closed before autosave could land
  // the latest note edit. Mutates migratedData in place.
  const mergeNoteCrashBackups = (migratedData: any) => {
    try {
      const keysToClear: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('tl-note-backup-')) continue;
        const rest = k.slice('tl-note-backup-'.length);
        const dash = rest.indexOf('-');
        if (dash < 1) { keysToClear.push(k); continue; }
        const oppId = rest.slice(0, dash);
        const noteId = rest.slice(dash + 1);
        let payload: any;
        try { payload = JSON.parse(localStorage.getItem(k) || 'null'); } catch { payload = null; }
        if (!payload || typeof payload.content !== 'string') { keysToClear.push(k); continue; }
        const opp = migratedData.opportunities.find((o: any) => o.id === oppId);
        const note = opp?.notes?.find((n: any) => n.id === noteId);
        if (opp && note && note.content !== payload.content) {
          note.content = payload.content;
          opp.lastUpdated = new Date().toISOString();
          console.warn(`[Note Recovery] Restored note ${noteId} of opp ${oppId} from crash backup.`);
        }
        keysToClear.push(k);
      }
      keysToClear.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('[Note Recovery] Backup merge skipped:', e);
    }
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
      mergeNoteCrashBackups(migratedData);

      setDb(migratedData);
      setFileHandle(handle);
      setStorageMode('file');
      setBackendRevision(0);
      backendRevisionRef.current = 0;
      setBackendName(null);
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
  // Stable callbacks — without useCallback, each render creates a new function
  // reference and invalidates React.memo on Dashboard / OpportunityDetail, causing
  // them to re-render on every keystroke somewhere else in the app.
  const minimizeToDock = useCallback((tab: FloatingTab) => {
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
  }, []);

  // PERF: wrap in useCallback with refs so identity stays stable — TimerWidget
  // is React.memo'd and was re-rendering on every App render because this
  // prop had a new identity each time. dbRef is declared earlier in the file.
  const handleTimerTaskClick = useCallback((taskId: string, oppId: string) => {
    const opp = dbRef.current.opportunities.find(o => o.id === oppId);
    if (!opp) return;
    const task = opp.tasks.find(t => t.id === taskId);
    if (!task) return;

    const tabId = task.id;
    const existing = floatingTabsRef.current.find(t => t.id === tabId);

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
  }, []);

  const removeTab = useCallback((tabId: string) => {
    setFloatingTabs(prev => prev.filter(t => t.id !== tabId));
    setSplitTab(prev => (prev?.id === tabId ? null : prev));
  }, []);

  const updateTabColor = useCallback((tabId: string, color: string) => {
    setFloatingTabs(prev => prev.map(t => t.id === tabId ? { ...t, color } : t));
  }, []);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setFloatingTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t));
  }, []);

  // Refs track the latest state without requiring the callback to close over it.
  // Keeps the function identity stable (useCallback([], ...)) so memoized children
  // don't re-render every time floatingTabs / splitTab change.
  const floatingTabsRef = useRef(floatingTabs);
  floatingTabsRef.current = floatingTabs;
  const splitTabRef = useRef(splitTab);
  splitTabRef.current = splitTab;

  const restoreFromDock = useCallback((tabId: string) => {
    if (splitTabRef.current && splitTabRef.current.id === tabId) {
      setSplitTab(null); // Toggle off
      return;
    }
    const tab = floatingTabsRef.current.find(t => t.id === tabId);
    if (!tab) return;
    setSplitTab({ ...tab, data: { ...tab.data, isSubView: true } });
  }, []);

  // Opens a task in the split sub-view (not full expediente). Used by the
  // schedule grid's double-click so scheduled blocks open a focused side panel.
  const openTaskSubView = useCallback((oppId: string, taskId: string) => {
    const opp = dbRef.current.opportunities.find(o => o.id === oppId);
    if (!opp) return;
    const task = opp.tasks?.find(t => t.id === taskId);
    if (!task) return;
    const tabId = task.id;
    const existing = floatingTabsRef.current.find(t => t.id === tabId);
    if (existing) {
      setSplitTab({ ...existing, data: { ...existing.data, isSubView: true } });
      return;
    }
    const newTab: FloatingTab = {
      id: tabId,
      type: 'task',
      title: `TSK: ${task.title.slice(0, 15)}`,
      color: '#3B82F6',
      data: { oppId, isSubView: true, deepLink: { tab: 'tasks', taskId: task.id } }
    };
    setFloatingTabs(prev => (prev.find(t => t.id === tabId) ? prev : [...prev, newTab]));
    setSplitTab(newTab);
  }, []);

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
        holidays={stableHolidays}
        trackedAreas={stableTrackedAreas}
        globalContacts={stableGlobalContacts}
        onGlobalContactsChange={applyGlobalContactsUpdate}
        onTrackedAreasChange={(areas) => handleSaveSettings({ ...appSettingsRef.current, trackedAreas: areas })}
        globalLabels={stableGlobalLabels}
        emailIntegrationEnabled={appSettings.emailIntegrationEnabled || false}
        sowSectionEnabled={appSettings.sowSectionEnabled || false}
        hiddenOpportunityDetailSections={stableHiddenOpportunityDetailSections}
        opportunityDetailSectionOrder={stableOpportunityDetailSectionOrder}
        userName={appSettings.userName || 'User'}
        emailComposeSettings={appSettings.emailCompose || null}
        globalSowForm={appSettings.globalSowForm || { sections: [], questions: [] }}
        onGlobalSowFormChange={(form) => handleSaveSettings({ ...appSettingsRef.current, globalSowForm: form })}
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

          // Preserve ALL existing commercial fields (including future/optional ones like
          // quickRefs) by spreading the original first and only overriding legacy-known keys.
          // The previous version whitelisted 7 fields and silently dropped anything else on
          // every load, wiping the quick-references panel on the commercial tab.
          const existingCommercial = (o.commercial as any) || {};
          const newCommercial: Commercial = {
            ...existingCommercial,
            currency: existingCommercial.currency || 'USD',
            customSections: customSections,
            agreementsLink: existingCommercial.agreementsLink || '',
            cfLink: existingCommercial.cfLink || '',
            discountsAndNotes: existingCommercial.discountsAndNotes || '',
            cqaOfficialSellPrice: existingCommercial.cqaOfficialSellPrice || 0,
            cqaOfficialMargin: existingCommercial.cqaOfficialMargin || 0,
            quickRefs: Array.isArray(existingCommercial.quickRefs) ? existingCommercial.quickRefs : [],
            internalRevisions: Array.isArray(existingCommercial.internalRevisions) ? existingCommercial.internalRevisions : []
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
    setStorageMode(null);
    setBackendRevision(0);
    backendRevisionRef.current = 0;
    setBackendName(null);

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

        console.debug("[App] Migrating and setting state...");
        const migratedData = migrateData(result.data);
        mergeNoteCrashBackups(migratedData);

        if (backendAvailable) {
          const snapshot = await importBackendDb(migratedData);
          setDb(migrateData(snapshot.data));
          setFileHandle(null);
          setStorageMode('backend');
          backendRevisionRef.current = snapshot.status.revision;
          setBackendRevision(snapshot.status.revision);
          setBackendName(snapshot.status.name || 'TenderLoop backend DB');
          setFallbackFileName(snapshot.status.name || 'TenderLoop backend DB');
          setIsDbLoaded(true);
          setRecentDbs(await getRecentDbs());
          setStartupHint(null);
          setStatus('idle');
          return;
        }

        // Legacy file mode (backend unavailable)
        if (result.handle) {
          try {
            // @ts-ignore
            const perm = await result.handle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') console.warn("Write permission not granted.");
          } catch (e) {
            console.error("Failed to request write permission", e);
          }
          setFileHandle(result.handle);
          setStorageMode('file');
          setFallbackFileName(null);
          await rememberDb(result.handle, { name: result.handle.name });
        } else {
          setFileHandle(null);
          setStorageMode('file');
          // @ts-ignore
          setFallbackFileName(result.name || "Offline DB");
        }

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
        setStorageMode('file');
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
    if (!db || !isDbLoaded) return;
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
  const createOpportunity = useCallback((stage: ProcessStage = '1. Intake') => {
    const currentOpps = dbRef.current.opportunities;
    const settings = appSettingsRef.current;
    // 1. Generate Unique OP ID
    let maxNum = 1000;
    currentOpps.forEach(o => {
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
    if (settings.taskStandardTemplate && settings.taskStandardTemplate.tasks.length > 0) {
      const templateTasks = settings.taskStandardTemplate.tasks;
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
      settings.defaultTasks.forEach(tmpl => {
        taskIdMap.set(tmpl.id, crypto.randomUUID());
      });

      defaultTasks = settings.defaultTasks.map(tmpl => {
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

    const initialNotes = settings.noteTemplates
      .filter(tmpl => tmpl.autoCreate)
      .map(tmpl => ({
        id: crypto.randomUUID(),
        title: tmpl.title,
        date: new Date().toISOString().split('T')[0],
        type: 'General',
        content: tmpl.content,
        attendees: ''
      })) as any[];

    // Every opportunity gets a built-in SOW (Scope of Work) note by default.
    // Its content is empty JSON state (filled in by the embedded form on first edit).
    initialNotes.push({
      id: crypto.randomUUID(),
      title: 'SOW - Scope of Work',
      date: new Date().toISOString().split('T')[0],
      type: 'Scope',
      content: '',
      attendees: '',
      format: 'sow',
    } as any);

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
        cqaOfficialMargin: 0,
        internalRevisions: []
      },
      links: { bfo: '', internalFolder: '', officialFolder: '', cqaLink: '', ba: '', srLink: '', geet: '' },
      notes: initialNotes,
      emails: {
        folders: [],
        labels: [],
        conversations: [],
        selectedOutlookFolderIds: []
      },
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

    setDb(prev => {
      const initialOpps = [newOpp, ...prev.opportunities];
      const rebalanced = rebalancePrioritiesRef.current(initialOpps, newOpp.id, 1, true);
      return { ...prev, opportunities: rebalanced };
    });
    setSelectedOppId(newId);
  }, []);

  const rebalancePriorities = useCallback((opps: Opportunity[], changedId?: string, newOrder?: number | null, statusChanged: boolean = false) => {
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
  }, []);
  rebalancePrioritiesRef.current = rebalancePriorities;

  const updateOpportunity = useCallback((updatedOpp: Opportunity, id?: string, immediate?: boolean) => {
    // Auto-assign any missing task orders before saving globally
    if (updatedOpp.tasks) {
        updatedOpp.tasks = assignMissingOrders(updatedOpp.tasks);
    }
    if (updatedOpp.history) {
      updatedOpp.history = sortHistoryEntries(updatedOpp.history);
    }

    // HOTFIX PERFORMANCE: Trim history and old versions globally to prevent DB bloat
    if (updatedOpp.history && updatedOpp.history.length > 300) updatedOpp.history = updatedOpp.history.slice(0, 300);
    if (updatedOpp.versions && updatedOpp.versions.length > 20) updatedOpp.versions = updatedOpp.versions.slice(-20);

    if (id && id !== updatedOpp.id) {
      if (id === selectedOppIdRef.current) setSelectedOppId(updatedOpp.id);
    }
    // DATA-LOSS FIX: note flushes and critical-field blurs pass immediate=true
    // so the next autosave tick skips the 3s debounce. Otherwise, closing the
    // app within 3s of an edit drops the change on the floor.
    if (immediate) immediateFlushRef.current = true;
    // Use startTransition so React treats this as a non-blocking background update
    // This keeps the UI responsive (inputs, buttons) while the state is being processed
    // EXCEPTION: immediate=true bypasses startTransition too, so the setDb commits
    // in the current tick and the autosave effect sees the new db before the
    // window can close.
    const apply = () => {
      setDb(prev => {
        const oldOpp = prev.opportunities.find(o => o.id === (id || updatedOpp.id));
        if (!oldOpp) return prev; // Should not happen

        // PROTECTION: If the incoming object is "light" (strips notes/versions for speed),
        // we must preserve the full record's heavy content.
        let cleanedUpdate = { ...updatedOpp };
        if (updatedOpp._isLight) {
          const { _isLight, _originalRef, _searchIndex, notes, versions, ...rest } = updatedOpp;
          cleanedUpdate = {
            ...rest,
            notes: oldOpp.notes,
            versions: oldOpp.versions
          };
        }

        // IMMUTABLE SNAPSHOTS: When versions are updated, protect existing snapshot content.
        // A stale localOpp sent via race condition could carry outdated snapshot data that
        // would silently overwrite a version the user just created.
        if (!updatedOpp._isLight && cleanedUpdate.versions && oldOpp.versions?.length) {
          const existingById = new Map(oldOpp.versions.map(v => [v.id, v]));
          cleanedUpdate = {
            ...cleanedUpdate,
            versions: cleanedUpdate.versions.map((v: any) => {
              const existing = existingById.get(v.id);
              return existing ? { ...v, snapshot: (existing as any).snapshot } : v;
            })
          };
        }

        const incomingStatusChanged = oldOpp.statusLabel !== cleanedUpdate.statusLabel;
        const incomingDetailedStatusChanged = oldOpp.detailedStatus !== cleanedUpdate.detailedStatus;

        if (incomingStatusChanged && !incomingDetailedStatusChanged) {
          if (cleanedUpdate.statusLabel === 'Canceled') {
            cleanedUpdate.detailedStatus = 'Canceled';
          } else if (['Submitted', 'Won', 'Lost'].includes(cleanedUpdate.statusLabel)) {
            cleanedUpdate.detailedStatus = 'Completed';
          } else if (cleanedUpdate.statusLabel === 'On Hold') {
            cleanedUpdate.detailedStatus = 'Paused';
          } else {
            cleanedUpdate.detailedStatus = 'Review';
          }
        }

        if (incomingDetailedStatusChanged && !incomingStatusChanged) {
          if (cleanedUpdate.detailedStatus === 'Canceled') {
            cleanedUpdate.statusLabel = 'Canceled';
          } else if (cleanedUpdate.detailedStatus === 'Completed') {
            cleanedUpdate.statusLabel = 'Submitted';
          } else if (cleanedUpdate.detailedStatus === 'Paused') {
            cleanedUpdate.statusLabel = 'On Hold';
          } else {
            cleanedUpdate.statusLabel = 'In Progress';
          }
        }

        if (oldOpp.statusLabel !== cleanedUpdate.statusLabel) {
          const currentKpis = cleanedUpdate.kpis || oldOpp.kpis || {};
          const currentTimeline = (currentKpis as any).timeline || {};
          cleanedUpdate.kpis = {
            ...currentKpis,
            ...(cleanedUpdate.statusLabel === 'Won'
              ? { sold: true }
              : cleanedUpdate.statusLabel === 'Lost'
                ? { sold: false }
                : { sold: null }),
            timeline: {
              ...currentTimeline,
              deliveredAt: ['Submitted', 'Won', 'Lost'].includes(cleanedUpdate.statusLabel)
                ? (currentTimeline.deliveredAt || new Date().toISOString().split('T')[0])
                : ['Submitted', 'Won', 'Lost'].includes(oldOpp.statusLabel)
                  ? null
                  : currentTimeline.deliveredAt,
            },
          } as KPIs;
        }

        const orderChanged = oldOpp.priorityOrder !== cleanedUpdate.priorityOrder;
        const statusChanged = oldOpp.statusLabel !== cleanedUpdate.statusLabel;

        const initialMap = prev.opportunities.map(o => o.id === (id || updatedOpp.id) ? { ...o, ...cleanedUpdate } : o);

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
    };
    if (immediate) {
      apply();
    } else {
      React.startTransition(apply);
    }
  }, []);

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
          const existingTask = o.tasks.find(t => t.id === taskId);
          const isMarkingDone = existingTask
            && updates.status === 'Done'
            && existingTask.status !== 'Done';
          const doneDate = isMarkingDone
            ? (existingTask.dueDate || getTodayStr())
            : '';
          const updatedOpp = {
            ...o,
            tasks: o.tasks.map(t => {
              if (t.id !== taskId) return t;
              return {
                ...t,
                ...updates,
                ...(isMarkingDone && !t.dueDate ? { dueDate: doneDate } : {}),
              };
            }),
            lastUpdated: new Date().toISOString()
          };
          return isMarkingDone ? markTenderingWorkedDay(updatedOpp, doneDate) : updatedOpp;
        })
      }));
    });
  }, []);

  const handleTimerLog = (taskId: string, oppId: string, seconds: number, status?: TaskStatus) => {
    React.startTransition(() => {
      setDb(prev => {
        let updatedOpp: Opportunity | undefined;
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
            if (status === 'Done' && !task.dueDate) {
              task.dueDate = dateStr;
            }
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

          let result = {
            ...o,
            tasks: updatedTasks,
            kpis: { ...o.kpis, areasInvolved: updatedAreas },
            lastUpdated: new Date().toISOString()
          };
          if (status === 'Done') {
            result = markTenderingWorkedDay(result, task.dueDate || dateStr);
          }
          updatedOpp = result;
          return result;
        });

        // Broadcast immediately so the floating timer window propagates status/log
        // changes to the main window (the auto-save debounce uses selectedOppId which
        // is null in the floating window, so it never broadcasts otherwise).
        if (updatedOpp) {
          setTimeout(() => {
            syncChannel.current?.postMessage({
              type: 'OPP_UPDATE',
              oppId,
              oppData: updatedOpp,
              originTabId: tabId,
            });
          }, 0);
        }

        return { ...prev, opportunities: newOpps };
      });
    });
  };
  // db.opportunities is already stable between renders when the array reference
  // hasn't actually changed — no extra memo needed.
  const stableOpportunities = db.opportunities;

  // HOTFIX PERFORMANCE: Persistent Cache for Light Opportunities (v5000)
  // Stripping thousands of 1MB HTML notes on every keystroke/drag kills the UI thread.
  // This cache ensures we only map the changed objects, keeping the drag & drop buttery smooth.
  const lightCacheRef = useRef<Map<string, any>>(new Map());
  const lightOpportunities = useMemo(() => {
    if (!stableOpportunities) return [];

    const liveIds = new Set<string>();
    const result = stableOpportunities.map(opp => {
      liveIds.add(opp.id);
      const existing = lightCacheRef.current.get(opp.id);
      // If the reference to the full object hasn't changed, reuse the light reference.
      // This is extremely important for React.memo performance in Dashboard.OpportunityCard.
      if (existing && existing._originalRef === opp) return existing;

      const light = {
        ...opp,
        notes: (opp.notes || []).map(n => ({ ...n, content: '' })), // Content metadata only
        versions: [], // Strip heavy snapshots
        _originalRef: opp, // Tag for cache-busting
        _isLight: true, // Safety tag to prevent overwriting full records in updateOpportunity
        // Includes every stored field (including rich-text notes) before the
        // light object removes note content for rendering performance.
        _searchIndex: buildOpportunitySearchIndex(opp)
      };
      lightCacheRef.current.set(opp.id, light);
      return light;
    });

    // Prevent the light cache from leaking memory when opportunities are deleted.
    if (lightCacheRef.current.size > liveIds.size) {
      const keys: string[] = [];
      lightCacheRef.current.forEach((_v, k) => { keys.push(k); });
      for (const id of keys) {
        if (!liveIds.has(id)) lightCacheRef.current.delete(id);
      }
    }
    return result;
  }, [stableOpportunities]);

  // CRITICAL PERF: Freeze Dashboard inputs while a full-screen overlay is open.
  // The detail overlay and split-view both cover the entire viewport with opaque/semi-opaque
  // layers, so updating Dashboard's props while typing in the expediente burns CPU on
  // invisible work (filteredOpps, kpiData, taskData, groupedOpps all recompute).
  // We keep the last visible snapshot and swap back to live data when the overlay closes.
  const frozenDashboardOppsRef = useRef(lightOpportunities);
  const isOverlayOpen = !!selectedOppId || !!splitTab;
  if (!isOverlayOpen) frozenDashboardOppsRef.current = lightOpportunities;
  const dashboardOpportunities = isOverlayOpen ? frozenDashboardOppsRef.current : lightOpportunities;

  const selectedOppForDetail = useMemo(() => {
    if (!selectedOppId) return null;
    return stableOpportunities.find(o => o.id === selectedOppId);
  }, [stableOpportunities, selectedOppId]);

  const handleSelectOpp = useCallback((id: string, dl?: DeepLink) => {
    setSelectedOppId(id);
    setActiveDeepLink(dl ? { ...dl, _nonce: ++deepLinkNonceRef.current } : null);
  }, []);

  useEffect(() => {
    const pendingId = pendingOpenOpportunityRef.current;
    if (!pendingId || !isDbLoaded) return;
    if (stableOpportunities.some(opp => opp.id === pendingId)) {
      pendingOpenOpportunityRef.current = null;
      handleSelectOpp(pendingId);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('openOpportunity');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // Ignore URL cleanup failures.
      }
    }
  }, [handleSelectOpp, isDbLoaded, stableOpportunities]);

  const handleCreateOppAtRoot = useCallback((stage?: ProcessStage) => {
    createOpportunity(stage || '1. Intake');
  }, [createOpportunity]);

  // Schedule notifications: fire 10 min before each block's start time.
  // Click opens the opportunity and focuses the related task.
  useScheduleNotifications(stableOpportunities, handleSelectOpp, appSettings.notificationSound);

  // Floating timer-only window mode: opened by TimerWidget.popOut() with ?window=timer.
  // Shares the same BroadcastChannel + localStorage so the widget stays in sync with the main app.
  const isTimerOnlyWindow = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('window') === 'timer';
  if (isTimerOnlyWindow) {
    return (
      <TimerProvider onLogTime={handleTimerLog} opportunities={stableOpportunities} timerSound={appSettings.timerSound} notificationSound={appSettings.notificationSound} primary={false}>
        <div className="h-screen w-screen min-h-0 bg-transparent p-0 flex overflow-hidden items-center justify-center">
          <TimerWidget floating />
        </div>
      </TimerProvider>
    );
  }

  const isProcessRadialOnlyWindow = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('window') === 'process-radial';
  if (isProcessRadialOnlyWindow) {
    return (
      <div className="h-screen w-screen min-h-0 bg-transparent p-0 overflow-hidden">
        <ProcessRadialWidget
          floating
          opportunities={stableOpportunities}
          onSelectOpportunity={handleSelectOpp}
        />
      </div>
    );
  }

  return (
    <TimerProvider onLogTime={handleTimerLog} opportunities={stableOpportunities} timerSound={appSettings.timerSound} notificationSound={appSettings.notificationSound}>
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
                    <FolderOpen className="w-4 h-4" /> {backendAvailable ? 'Import JSON' : 'Open DB'}
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
                {startupHint === '__reopen__' && pendingHandle ? (
                  <button
                    onClick={async () => {
                      try {
                        // @ts-ignore
                        const perm = await pendingHandle.requestPermission({ mode: 'readwrite' });
                        if (perm === 'granted') {
                          setStatus('loading');
                          const h = pendingHandle;
                          setPendingHandle(null);
                          setStartupHint(null);
                          await loadDbFromHandle(h);
                        }
                      } catch (e) { console.error('Permission request failed', e); }
                    }}
                    className="flex items-center gap-1 text-xs text-[#3DCD58] font-bold hover:underline animate-pulse"
                  >
                    <FolderOpen className="w-3 h-3" />
                    Reopen: {(pendingHandle as any).name || 'last database'}
                  </button>
                ) : startupHint && startupHint !== '__reopen__' ? (
                  <span className="text-xs text-gray-400 animate-pulse">{startupHint}</span>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-3 animate-fade-in">
                <span className="text-xs text-gray-400 font-mono hidden sm:inline-block border border-gray-100 px-2 py-1 rounded bg-gray-50 flex items-center gap-1">
                  <FileJson className="w-3 h-3" />
                  {storageMode === 'backend' ? (backendName || 'Backend DB') : (fileHandle ? fileHandle.name : fallbackFileName)}
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
                            <FolderOpen className="w-4 h-4 text-[#3DCD58]" /> {backendAvailable ? 'Import another JSON...' : 'Open another file...'}
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
          {/* Startup Screen Overlay — shown when no DB is loaded */}
          {!isDbLoaded && (
            <div className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center gap-6 p-8">
              <HardDrive className="w-14 h-14 text-[#3DCD58]" />
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900">Tender Loop</h2>
                <p className="text-gray-500 text-sm mt-1">
                  {pendingHandle
                    ? `Tu base de datos "${(pendingHandle as any).name}" necesita permiso para reabrirse.`
                    : backendAvailable
                      ? 'Crea una base backend o importa una base JSON existente.'
                      : 'Abre o crea una base de datos para comenzar.'}
                </p>
              </div>
              {pendingHandle && startupHint === '__reopen__' ? (
                <button
                  onClick={async () => {
                    try {
                      const perm = await (pendingHandle as any).requestPermission({ mode: 'readwrite' });
                      if (perm === 'granted') {
                        setStatus('loading');
                        const h = pendingHandle;
                        setPendingHandle(null);
                        setStartupHint(null);
                        await loadDbFromHandle(h);
                      }
                    } catch (e) { console.error('Permission request failed', e); }
                  }}
                  className="flex items-center gap-3 px-8 py-4 bg-[#3DCD58] hover:bg-[#2db64a] text-white rounded-2xl text-lg font-bold shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  <FolderOpen className="w-6 h-6" />
                  Reabrir: {(pendingHandle as any).name}
                </button>
              ) : (
                <div className="flex gap-4 flex-wrap justify-center">
                  <button onClick={handleOpenDB} className="flex items-center gap-2 px-6 py-3 bg-[#3DCD58] hover:bg-[#2db64a] text-white rounded-xl font-bold shadow-md transition-all">
                    <FolderOpen className="w-5 h-5" /> {backendAvailable ? 'Importar JSON' : 'Abrir Base de Datos'}
                  </button>
                  <button onClick={handleCreateDB} className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-bold shadow-sm hover:bg-gray-50 transition-all">
                    <PlusCircle className="w-5 h-5" /> Nueva Base de Datos
                  </button>
                </div>
              )}
              {recentDbs.length > 0 && (
                <div className="w-full max-w-sm">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 text-center">Bases de Datos Recientes</p>
                  <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                    {recentDbs.slice(0, 5).map(entry => (
                      <button key={entry.id} onClick={() => handleRecentClick(entry)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 text-left border-b last:border-b-0 border-gray-200 transition-colors">
                        <History className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-700 truncate">{entry.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Main Content Area */}
          <div className={`flex-1 flex min-h-0 overflow-hidden transition-all duration-300`}>
            {/* Dashboard / Primary Content */}
            <div className={`h-full overflow-hidden transition-all duration-300 ${splitTab ? 'w-1/2 border-r border-gray-100' : 'w-full'}`}>
              <LocalErrorBoundary fallbackLabel="Dashboard">
                <Dashboard
                  key={storageMode === 'backend' ? (backendName || 'backend') : (fileHandle?.name || 'sandbox')}
                  mode={currentView === 'proposals-dashboard' ? 'proposals' : currentView === 'tasks-dashboard' ? 'tasks' : 'general'}
                  opportunities={dashboardOpportunities}
                  onSelect={handleSelectOpp}
                  onCreate={handleCreateOppAtRoot}
                  onStageChange={moveOpportunityStage}
                  onDateChange={changeOpportunityDate}
                  onOppUpdate={updateOpportunity}
                  onTaskUpdate={updateTaskDetails}
                  holidays={stableHolidays}
                  globalLabels={stableGlobalLabels}
                  alarms={appSettings.alarms}
                  hiddenProposalProcessColumns={appSettings.hiddenProposalProcessColumns}
                  onMinimize={minimizeToDock}
                  onOpenTaskSubView={openTaskSubView}
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
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-6 animate-in fade-in duration-200" onClick={() => { if (!detailMouseDownInsideRef.current) { setSelectedOppId(null); setActiveDeepLink(null); } detailMouseDownInsideRef.current = false; }}>
              <div className="bg-white w-full h-full rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 ring-1 ring-white/10" onMouseDown={() => { detailMouseDownInsideRef.current = true; }} onClick={(e) => e.stopPropagation()}>
                <LocalErrorBoundary fallbackLabel="Opportunity Detail">
                  <OpportunityDetail
                    opportunity={selectedOppForDetail}
                    opportunities={stableOpportunities}
                    onBack={() => { setSelectedOppId(null); setActiveDeepLink(null); }}
                    onUpdate={updateOpportunity}
                    onDelete={() => deleteOpportunity(selectedOppForDetail.id)}
                    onSelectOpp={handleSelectOpp}
                    noteTemplates={appSettings.noteTemplates}
                    holidays={stableHolidays}
                    trackedAreas={stableTrackedAreas}
                    globalContacts={stableGlobalContacts}
                    onGlobalContactsChange={applyGlobalContactsUpdate}
                    onTrackedAreasChange={(areas) => handleSaveSettings({ ...appSettingsRef.current, trackedAreas: areas })}
                    globalLabels={stableGlobalLabels}
                    emailIntegrationEnabled={appSettings.emailIntegrationEnabled || false}
        sowSectionEnabled={appSettings.sowSectionEnabled || false}
                    hiddenOpportunityDetailSections={stableHiddenOpportunityDetailSections}
                    opportunityDetailSectionOrder={stableOpportunityDetailSectionOrder}
                    userName={appSettings.userName || 'User'}
                    emailComposeSettings={appSettings.emailCompose || null}
                    globalSowForm={appSettings.globalSowForm || { sections: [], questions: [] }}
                    onGlobalSowFormChange={(form) => handleSaveSettings({ ...appSettingsRef.current, globalSowForm: form })}
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
        {appSettings.processRadialWidgetEnabled && (
          <ProcessRadialWidget
            opportunities={stableOpportunities}
            onSelectOpportunity={handleSelectOpp}
          />
        )}
        <TimerWidget onTaskClick={handleTimerTaskClick} />

      </div>
    </TimerProvider >
  );
}

export default App;
