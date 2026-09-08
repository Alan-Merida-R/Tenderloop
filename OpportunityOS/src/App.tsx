
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DatabaseSchema, Opportunity, INITIAL_DB, ProcessStage, Task, Commercial, TaskStatus, TaskOwner, TaskPriority, PrdPresentation, OpportunityStatus, KPIs, DeepLink, FloatingTab, DetailedStatus, GlobalContact, OpportunityLabel, Reminder, StickyNote, GeneralQuickLink, QuickOrganizerRun } from './types';
import { openDatabaseFile, createDatabaseFile, saveToDisk } from './services/fileSystem';
import { rememberDb, getLastDb, getRecentDbs, getRecentDbHandle, removeRecentDb, RecentDbEntry } from './services/recentDbHandles';
import { archiveRecoveryBackup, getBackendDbStatus, isBackendAvailable, openDefaultBackendDb, resolveNativeDbPath, revealCurrentBackendDb, revealNativePath, saveBackendDb } from './services/backendDb';
import { mergeFolderPaths, registerOpportunityFolderBridge } from './services/opportunityFolderStore';
import { getStoredFolderPaths } from './services/opportunityFolderLink';
import Dashboard from './components/Dashboard';
import { IndicatorsDashboard } from './components/IndicatorsDashboard';
import OpportunityDetail from './components/OpportunityDetail';
import { SettingsModal, DEFAULT_SETTINGS, AppSettings, AppViewKey, APP_VIEWS, normalizeTaskStandards, visibleTaskStandards } from './components/SettingsModal';
import { DEFAULT_SCOPE_CATALOG, normalizeScopeCatalog, catalogContainsLabel, ScopeCatalog, ensureScopeCatalogMigrated, SCOPE_CATALOG_MIGRATION_VERSION } from './components/scopeCatalog';
import { readScopeGlance } from './services/scopeSummary';
import { FolderOpen, Save, PlusCircle, AlertCircle, FileJson, Layout, CheckSquare, BarChart3, Settings as SettingsIcon, History, ChevronDown, Trash2, Activity, ExternalLink } from 'lucide-react';
import { TimerProvider } from './contexts/TimerContext';
import { TimerWidget } from './components/TimerWidget';
import { ProcessRadialWidget } from './components/ProcessRadialWidget';
import { StickyNotesWidget, GeneralQuickLinksWidget } from './components/StickyNotesWidget';
import { QuickNavDock } from './components/QuickNavDock';
import { assignMissingOrders, normalizeTaskStatus, syncAssignmentSubtasks } from './services/taskUtils';
import { useScheduleNotifications } from './features/schedule/useScheduleNotifications';
import { useReminderNotifications } from './features/reminders/useReminderNotifications';
import { RemindersBell } from './components/RemindersBell';
import { QuickOrganizerView } from './features/quickOrganizer/QuickOrganizerView';
import { InteractiveTutorial } from './components/InteractiveTutorial';
import { buildManagerReport, downloadManagerReport } from './services/managerReport';
import { deriveReporterId, runDailyExportIfDue, writeManagerReportToFolder } from './services/managerReportSync';
import { normalizeSearchText } from './components/OpportunitySearchInput';

/** Keeps only reminders whose opportunity/task is still actionable. */
const filterActionableReminders = (reminders: Reminder[], opportunities: Opportunity[]): Reminder[] => {
  if (reminders.length === 0) return reminders;
  const oppById = new Map(opportunities.map(opportunity => [opportunity.id, opportunity]));
  const filtered = reminders.filter(reminder => {
    const opportunity = oppById.get(reminder.opportunityId);
    if (!opportunity) return true;
    if (opportunity.detailedStatus === 'Completed' || opportunity.detailedStatus === 'Canceled' || opportunity.statusLabel === 'Canceled') return false;
    if (!reminder.taskId) return true;
    const task = opportunity.tasks.find(candidate => candidate.id === reminder.taskId);
    return !task || (task.status !== 'Done' && task.status !== 'Canceled');
  });
  return filtered.length === reminders.length ? reminders : filtered;
};


type AppStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
type AppView = AppViewKey;
type StorageMode = 'backend' | 'file' | null;

const getTodayStr = () => new Date().toLocaleDateString('en-CA');

const mergeGlobalLabels = (...sources: Array<OpportunityLabel[] | undefined>): OpportunityLabel[] => {
  const labels = new Map<string, OpportunityLabel>();
  sources.flatMap(source => source || []).forEach(label => {
    if (!label?.id || !label.text?.trim()) return;
    labels.set(label.id, { ...label, text: label.text.trim() });
  });
  return [...labels.values()];
};

const labelsAreEqual = (left: OpportunityLabel[] = [], right: OpportunityLabel[] = []) => (
  left.length === right.length && left.every((label, index) => label.id === right[index]?.id && label.text === right[index]?.text && label.color === right[index]?.color)
);

const mergeGlobalContacts = (...sources: Array<GlobalContact[] | undefined>): GlobalContact[] => {
  const contacts = new Map<string, GlobalContact>();
  sources.flatMap(source => source || []).forEach(contact => {
    const name = contact?.name?.trim();
    if (!contact?.id || !name) return;
    const email = contact.email?.trim() || '';
    const identity = email ? `email:${email.toLowerCase()}` : `name:${name.toLowerCase()}`;
    const previous = contacts.get(identity);
    contacts.set(identity, {
      ...previous,
      ...contact,
      name,
      email,
      availableRoles: Array.from(new Set([...(previous?.availableRoles || []), ...(contact.availableRoles || [])])),
      aliases: Array.from(new Set([...(previous?.aliases || []), ...(contact.aliases || [])])),
    });
  });
  return [...contacts.values()];
};

const contactsAreEqual = (left: GlobalContact[] = [], right: GlobalContact[] = []) => (
  JSON.stringify(left) === JSON.stringify(right)
);

/** Adds the configured assignment window to the KPI area timeline. */
const syncTaskAssignmentTimeline = (opp: Opportunity, task: Task, holidays: string[]): Opportunity => {
  const hasAssignee = (task.responsibleTeamMemberIds || []).length > 0 || !!task.responsible?.trim();
  if (!task.isAssignment && !hasAssignee) return opp;
  const people = opp.stakeholders || [];
  const assigneeAreas = people
    .filter(person => (task.responsibleTeamMemberIds || []).includes(person.id))
    .flatMap(person => person.roles?.length ? person.roles : (person.role ? [person.role] : []));
  const areas = Array.from(new Set([...(task.externalAreas || []), ...assigneeAreas].filter(Boolean)));
  const start = task.responsibleRequestedDate;
  const end = task.responsibleDeliveredDate || task.responsibleDueDate || task.dueDate;
  if (!areas.length || !start || !end) return opp;

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
  const areaEntries = [...(baseKpis.areasInvolved || [])];
  [...areas, 'Tendering'].forEach(area => {
    if (!areaEntries.some(entry => entry.area === area)) areaEntries.push({ id: crypto.randomUUID(), area, daysSpent: 0, waitingDays: 0, calendar: {} });
  });
  const dates: string[] = [];
  for (let date = new Date(`${start}T00:00:00`), last = new Date(`${end}T00:00:00`); date <= last; date.setDate(date.getDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    if (date.getDay() !== 0 && date.getDay() !== 6 && !holidays.includes(key)) dates.push(key);
  }
  const nextAreas = areaEntries.map(area => {
    const worked = areas.includes(area.area);
    const waiting = area.area === 'Tendering';
    if (!worked && !waiting) return area;
    const calendar = { ...(area.calendar || {}) };
    dates.forEach(date => {
      const current = calendar[date];
      if (worked) {
        calendar[date] = {
          ...(current || {}),
          type: 'Worked',
          workedTaskIds: Array.from(new Set([...(current?.workedTaskIds || []), task.id])),
        };
      }
      if (waiting) {
        const afterWork = calendar[date] || current;
        calendar[date] = {
          ...(afterWork || {}),
          type: afterWork?.type === 'Worked' ? 'Worked' : 'Waiting',
          waitingTaskIds: Array.from(new Set([...(afterWork?.waitingTaskIds || []), task.id])),
        };
      }
    });
    return {
      ...area,
      calendar,
      daysSpent: Object.values(calendar).filter((record: any) => record.type === 'Worked').length,
      waitingDays: Object.values(calendar).filter((record: any) => record.type === 'Waiting' || (record.waitingTaskIds || []).length > 0).length,
    };
  });
  return { ...opp, kpis: { ...baseKpis, areasInvolved: nextAreas } };
};

/**
 * Creates one compact, lower-cased text index for dashboard searches. It is
 * calculated only when an opportunity changes, so searching never has to
 * traverse the complete opportunity object while typing.
 *
 * Deliberately narrow: OP number, alias, overview description, client,
 * vendor, and the scope/systems/labels read off the SOW (via
 * `readScopeGlance`, the same source the Scope filter uses). Earlier this
 * walked the entire opportunity object (tasks, notes, history, commercial
 * data...), which made every search return far too many unrelated matches.
 */
const buildOpportunitySearchIndex = (opportunity: Opportunity, scopeCatalog: ScopeCatalog): string => {
  const glance = readScopeGlance(opportunity.notes, scopeCatalog, opportunity.labels || []);
  const values = [
    opportunity.id,
    opportunity.alias,
    opportunity.description,
    opportunity.customer,
    opportunity.seller,
    ...glance.scope,
    ...glance.systems,
    ...glance.quickNotes,
    ...glance.extras,
  ].filter(Boolean) as string[];

  return normalizeSearchText(values.join(' '));
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


// --- Local Error Boundary (fail-open: shows error instead of blank screen) ---
interface EBProps { children: React.ReactNode; fallbackLabel?: string; key?: React.Key; }
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
    const isDashboard = (this.props as EBProps).fallbackLabel === 'Dashboard';
    const isIterableFailure = /not iterable|Symbol\(Symbol\.iterator\)/i.test(error.message || '');
    const recoveryKey = 'tl.dashboard.iterableRecovery.v1';
    if (isDashboard && isIterableFailure && sessionStorage.getItem(recoveryKey) !== 'done') {
      sessionStorage.setItem(recoveryKey, 'done');
      // Keep a diagnostic backup, then remove only Dashboard filter state. The
      // database connection and every opportunity remain untouched.
      ['general', 'proposals', 'tasks'].forEach(mode => {
        const key = `tl.dashboardFilters.${mode}.v1`;
        const saved = localStorage.getItem(key);
        if (saved) localStorage.setItem(`${key}.recoveryBackup`, saved);
        localStorage.removeItem(key);
      });
      (this as any).setState({ error: null });
    }
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
            onClick={() => {
              sessionStorage.removeItem('tl.dashboard.iterableRecovery.v1');
              ['general', 'proposals', 'tasks'].forEach(mode => localStorage.removeItem(`tl.dashboardFilters.${mode}.v1`));
              (this as any).setState({ error: null });
            }}
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
const EMPTY_SOW_FORM = Object.freeze({ sections: EMPTY_ARR, questions: EMPTY_ARR }) as { sections: any[]; questions: any[] };

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
  // Prevent the database picker from flashing while the last database is still
  // being recovered after an involuntary reload.
  const [isStartupChecking, setIsStartupChecking] = useState(true);
  const [fallbackFileName, setFallbackFileName] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>(null);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [backendRevision, setBackendRevision] = useState<number>(0);
  const [backendName, setBackendName] = useState<string | null>(null);
  const [currentDbNativePath, setCurrentDbNativePath] = useState<string | null>(null);

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
  const [showQuickOrganizer, setShowQuickOrganizer] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // While the tutorial runs, each step activation dispatches this event so any
  // open overlay (including the Settings modal) closes and the step's target is
  // actually visible. Steps that need Settings reopen it right after.
  useEffect(() => {
    if (!showTutorial) return;
    const closeForTutorial = () => setShowSettings(false);
    window.addEventListener('oos-tutorial-prepare', closeForTutorial);
    return () => window.removeEventListener('oos-tutorial-prepare', closeForTutorial);
  }, [showTutorial]);
  // Bumped when the Quick Organizer applies a plan, forcing the Tasks dashboard into Agenda mode.
  const [agendaFocusNonce, setAgendaFocusNonce] = useState(0);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => normalizeTaskStandards(DEFAULT_SETTINGS));
  const [pendingOpportunityCreation, setPendingOpportunityCreation] = useState<{ stage: ProcessStage; standardId: string } | null>(null);
  const [showHiddenTaskStandards, setShowHiddenTaskStandards] = useState(false);

  const getDbUiPreferences = (settings: AppSettings): NonNullable<DatabaseSchema['userSettings']['uiPreferences']> => ({
    hiddenOpportunityDetailSections: settings.hiddenOpportunityDetailSections,
    opportunityDetailSectionOrder: settings.opportunityDetailSectionOrder,
    hiddenOpportunityHeaderFields: settings.hiddenOpportunityHeaderFields,
    hiddenViews: settings.hiddenViews,
    hiddenIndicatorSections: settings.hiddenIndicatorSections,
    hiddenProposalProcessColumns: settings.hiddenProposalProcessColumns,
    processBoardColors: settings.processBoardColors,
  });

  const applyDbUiPreferences = (settings: AppSettings, preferences?: DatabaseSchema['userSettings']['uiPreferences']): AppSettings => {
    if (!preferences) return settings;
    return {
      ...settings,
      ...(preferences.hiddenOpportunityDetailSections !== undefined && { hiddenOpportunityDetailSections: preferences.hiddenOpportunityDetailSections as AppSettings['hiddenOpportunityDetailSections'] }),
      ...(preferences.opportunityDetailSectionOrder !== undefined && { opportunityDetailSectionOrder: preferences.opportunityDetailSectionOrder as AppSettings['opportunityDetailSectionOrder'] }),
      ...(preferences.hiddenOpportunityHeaderFields !== undefined && { hiddenOpportunityHeaderFields: preferences.hiddenOpportunityHeaderFields as AppSettings['hiddenOpportunityHeaderFields'] }),
      ...(preferences.hiddenViews !== undefined && { hiddenViews: preferences.hiddenViews as AppSettings['hiddenViews'] }),
      ...(preferences.hiddenIndicatorSections !== undefined && { hiddenIndicatorSections: preferences.hiddenIndicatorSections as AppSettings['hiddenIndicatorSections'] }),
      ...(preferences.hiddenProposalProcessColumns !== undefined && { hiddenProposalProcessColumns: preferences.hiddenProposalProcessColumns }),
      ...(preferences.processBoardColors !== undefined && { processBoardColors: preferences.processBoardColors }),
    };
  };

  // Quick Nav State
  const [floatingTabs, setFloatingTabs] = useState<FloatingTab[]>([]);
  const [splitTab, setSplitTab] = useState<FloatingTab | null>(null);

  // Debounce saving
  const saveTimeoutRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const recoveryBackupTimerRef = useRef<number | null>(null);
  const recoveryBackupInFlightRef = useRef(false);
  const lastRecoveryBackupAtRef = useRef(0);
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
  // PERF FIX: Debounce refs for persistent navigation-state writes.
  // localStorage.setItem is synchronous and runs on the main thread.
  // On low-RAM machines it can spike for 5-15ms per call.
  // Rapid state changes (e.g. typing + navigation) queued multiple writes per second.
  // 300ms debounce batches bursts of changes into a single write.
  const sessionTabsTimerRef = useRef<number | null>(null);
  const sessionNavTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (recoveryBackupTimerRef.current) clearTimeout(recoveryBackupTimerRef.current);
  }, []);

  // Apply new built-in Scope migrations to an already-open app as well as on startup.
  // This matters during local Vite updates: React preserves component state across HMR, so a
  // mount-only migration would leave legacy users looking at the previous catalog until a full
  // process restart. Persist the migrated result so the correction survives every later launch.
  useEffect(() => {
    if ((appSettings.scopeCatalogMigrationVersion || 0) >= SCOPE_CATALOG_MIGRATION_VERSION) return;
    const migrated = ensureScopeCatalogMigrated(appSettings);
    setAppSettings(migrated);
    localStorage.setItem('TenderLoop_Settings_V1', JSON.stringify(migrated));
  }, [appSettings, SCOPE_CATALOG_MIGRATION_VERSION]);

  // Redirect legacy tracking view
  useEffect(() => {
    // @ts-ignore
    if (currentView === 'tracking-dashboard') {
      setCurrentView('tasks-dashboard');
    }
  }, [currentView]);

  useEffect(() => {
    const hiddenViews = appSettings.hiddenViews || [];
    if (hiddenViews.includes(currentView)) {
      const fallback = APP_VIEWS.find(v => !hiddenViews.includes(v.key))?.key || 'general-dashboard';
      setCurrentView(fallback);
    }
  }, [appSettings.hiddenViews, currentView]);

  // Load Settings from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('TenderLoop_Settings_V1');
      const mergedSettings = ensureScopeCatalogMigrated(normalizeTaskStandards(saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS));
      if (saved) {
        setAppSettings(mergedSettings);
        localStorage.setItem('TenderLoop_Settings_V1', JSON.stringify(mergedSettings));
      }
      // NEW: Restore minimized records
      // Restore Session State (Tab Independent)
      const savedTabs = localStorage.getItem('TenderLoop_FloatingTabs_V1') || sessionStorage.getItem('TenderLoop_FloatingTabs_V1');
      if (savedTabs) {
        try { setFloatingTabs(JSON.parse(savedTabs)); } catch (e) { }
      }

      // Restore Navigation State. If there's no in-session nav to restore, open
      // on the user's configured startup view instead of the hardcoded default.
      const savedNav = localStorage.getItem('TenderLoop_Navigation_V1') || sessionStorage.getItem('TenderLoop_Navigation_V1');
      let restoredView = false;
      if (savedNav) {
        try {
          const nav = JSON.parse(savedNav);
          if (nav.currentView) { setCurrentView(nav.currentView); restoredView = true; }
          if (nav.selectedOppId) setSelectedOppId(nav.selectedOppId);
          if (nav.activeDeepLink) setActiveDeepLink(nav.activeDeepLink);
        } catch (e) { }
      }
      if (!restoredView) {
        const hiddenViews = mergedSettings.hiddenViews || [];
        const desired = mergedSettings.defaultStartView || 'general-dashboard';
        setCurrentView(hiddenViews.includes(desired) ? (APP_VIEWS.find(v => !hiddenViews.includes(v.key))?.key || 'general-dashboard') : desired);
      }
    } catch (e) {
      console.error("Failed to load settings or tabs", e);
    }
  }, []);

  const handleSaveSettings = useCallback((newSettings: AppSettings) => {
    setAppSettings(newSettings);
    localStorage.setItem('TenderLoop_Settings_V1', JSON.stringify(newSettings));
    const syncFullName = (newSettings.dailyManagerReportFullName || '').trim();
    const syncReporterId = deriveReporterId(syncFullName) || '';
    const syncFolder = (newSettings.dailyManagerReportFolder || '').trim();
    setDb(prev => ({
      ...prev,
      userSettings: {
        ...prev.userSettings,
        managerReportSync: {
          // The daily update can only stay enabled with a valid identity and folder.
          enabled: newSettings.dailyManagerReportEnabled === true && !!syncReporterId && !!syncFolder,
          folderPath: syncFolder,
          fullName: syncFullName,
          reporterId: syncReporterId,
          lastExportDay: prev.userSettings?.managerReportSync?.lastExportDay,
          lastExportedAt: prev.userSettings?.managerReportSync?.lastExportedAt,
        },
        uiPreferences: getDbUiPreferences(newSettings),
        ...(newSettings.globalContacts && {
          globalContacts: mergeGlobalContacts(newSettings.globalContacts),
          globalContactsMigrated: true,
          globalContactsMigrationVersion: 1,
        }),
        ...(newSettings.globalLabels && { globalLabels: mergeGlobalLabels(newSettings.globalLabels), globalLabelsMigrated: true }),
        generalQuickLinks: newSettings.generalQuickLinks || [],
        generalQuickLinksMigrated: true,
      }
    }));
  }, []);

  // Visibility preferences are database-owned so the same configuration is
  // restored when this database is opened from another browser or computer.
  // Existing databases receive the current browser preferences once, then the
  // database becomes the source of truth.
  useEffect(() => {
    if (!isDbLoaded) return;
    const preferences = db.userSettings?.uiPreferences;
    if (preferences) {
      setAppSettings(prev => applyDbUiPreferences(prev, preferences));
      return;
    }
    setDb(prev => ({
      ...prev,
      userSettings: { ...prev.userSettings, uiPreferences: getDbUiPreferences(appSettingsRef.current) }
    }));
  }, [isDbLoaded, db.userSettings?.uiPreferences]);

  // The daily manager-report configuration is database-owned: a fresh browser
  // profile (cleared localStorage) restores it from the DB the moment it loads.
  useEffect(() => {
    if (!isDbLoaded) return;
    const sync = db.userSettings?.managerReportSync;
    if (!sync) return;
    setAppSettings(prev => {
      if (prev.dailyManagerReportEnabled === sync.enabled
        && (prev.dailyManagerReportFolder || '') === sync.folderPath
        && (prev.dailyManagerReportFullName || '') === sync.fullName) return prev;
      return {
        ...prev,
        dailyManagerReportEnabled: sync.enabled,
        dailyManagerReportFolder: sync.folderPath,
        dailyManagerReportFullName: sync.fullName,
      };
    });
  }, [isDbLoaded, db.userSettings?.managerReportSync]);

  // Daily manager-report export: runs once per local day while the app is open.
  // The deterministic per-user filename means the shared file is overwritten,
  // never accumulated. Failures are surfaced in Settings and retried each tick.
  const [managerSyncError, setManagerSyncError] = useState<string | null>(null);
  const managerSyncWarnedRef = useRef(false);
  const stampManagerExport = useCallback((day: string, exportedAt: string) => {
    setDb(prev => prev.userSettings?.managerReportSync ? {
      ...prev,
      userSettings: {
        ...prev.userSettings,
        managerReportSync: { ...prev.userSettings.managerReportSync, lastExportDay: day, lastExportedAt: exportedAt },
      },
    } : prev);
  }, []);

  useEffect(() => {
    if (!isDbLoaded) return;
    const sync = db.userSettings?.managerReportSync;
    if (!sync?.enabled || !sync.folderPath || !sync.reporterId) return;
    let cancelled = false;
    const tick = async () => {
      const currentSync = dbRef.current.userSettings?.managerReportSync;
      if (!currentSync?.enabled) return;
      const result = await runDailyExportIfDue(dbRef.current, currentSync);
      if (cancelled) return;
      if (result.status === 'written') {
        setManagerSyncError(null);
        stampManagerExport(result.day, result.exportedAt);
      } else if (result.status === 'failed') {
        setManagerSyncError(result.error);
        if (!managerSyncWarnedRef.current) {
          managerSyncWarnedRef.current = true;
          console.warn('[Manager report] Daily export failed:', result.error);
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, 15 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isDbLoaded, db.userSettings?.managerReportSync?.enabled, db.userSettings?.managerReportSync?.folderPath, db.userSettings?.managerReportSync?.reporterId, stampManagerExport]);

  const handleRunDailyExportNow = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const sync = dbRef.current.userSettings?.managerReportSync;
    if (!sync?.enabled || !sync.folderPath || !sync.reporterId) {
      return { ok: false, error: 'Enable the daily update and press Save first.' };
    }
    const result = await writeManagerReportToFolder(dbRef.current, sync);
    if (result.status === 'written') {
      setManagerSyncError(null);
      stampManagerExport(result.day, result.exportedAt);
      return { ok: true };
    }
    return { ok: false, error: result.status === 'failed' ? result.error : 'Export skipped.' };
  }, [stampManagerExport]);

  // One-time, safe migration: import legacy browser settings and all labels already
  // assigned to opportunities into the current database. This lets old files retain
  // their labels and makes them portable from now on.
  useEffect(() => {
    if (!isDbLoaded || db.userSettings?.globalLabelsMigrated) return;
    const migratedLabels = mergeGlobalLabels(
      db.userSettings?.globalLabels,
      appSettings.globalLabels,
      ...db.opportunities.map(opportunity => opportunity.labels || [])
    );
    setDb(prev => ({ ...prev, userSettings: { ...prev.userSettings, globalLabels: migratedLabels, globalLabelsMigrated: true } }));
    if (!labelsAreEqual(appSettings.globalLabels || [], migratedLabels)) {
      setAppSettings(prev => ({ ...prev, globalLabels: migratedLabels }));
      localStorage.setItem('TenderLoop_Settings_V1', JSON.stringify({ ...appSettings, globalLabels: migratedLabels }));
    }
  }, [isDbLoaded, db.userSettings?.globalLabels, db.opportunities, appSettings.globalLabels]);

  // One-time migration from the historical browser-only directory. Afterwards
  // the database is authoritative, so contacts travel with the DB and survive
  // browser resets or opening the file on another computer.
  useEffect(() => {
    if (!isDbLoaded) return;
    // Version 1 always merges both sources. This deliberately re-runs for DBs
    // touched by the earlier boolean-only migration, which could be marked as
    // migrated before the browser settings had finished loading.
    if (db.userSettings?.globalContactsMigrationVersion !== 1) {
      let legacyBrowserContacts: GlobalContact[] = [];
      try {
        const rawSettings = localStorage.getItem('TenderLoop_Settings_V1');
        const parsedSettings = rawSettings ? JSON.parse(rawSettings) : null;
        if (Array.isArray(parsedSettings?.globalContacts)) legacyBrowserContacts = parsedSettings.globalContacts;
      } catch {
        // A malformed legacy settings value must not block opening or saving the DB.
      }
      const migratedContacts = mergeGlobalContacts(
        db.userSettings?.globalContacts,
        legacyBrowserContacts,
        appSettingsRef.current.globalContacts,
      );
      setDb(prev => ({
        ...prev,
        userSettings: {
          ...prev.userSettings,
          globalContacts: migratedContacts,
          globalContactsMigrated: true,
          globalContactsMigrationVersion: 1,
        },
      }));
      if (!contactsAreEqual(appSettingsRef.current.globalContacts || [], migratedContacts)) {
        const nextSettings = { ...appSettingsRef.current, globalContacts: migratedContacts };
        setAppSettings(nextSettings);
        localStorage.setItem('TenderLoop_Settings_V1', JSON.stringify(nextSettings));
      }
      return;
    }
    const databaseContacts = mergeGlobalContacts(db.userSettings.globalContacts);
    if (!contactsAreEqual(appSettingsRef.current.globalContacts || [], databaseContacts)) {
      const nextSettings = { ...appSettingsRef.current, globalContacts: databaseContacts };
      setAppSettings(nextSettings);
      localStorage.setItem('TenderLoop_Settings_V1', JSON.stringify(nextSettings));
    }
  }, [isDbLoaded, db.userSettings?.globalContacts, db.userSettings?.globalContactsMigrated, db.userSettings?.globalContactsMigrationVersion]);

  // Sticky notes used to live only in localStorage. Import every valid legacy note
  // exactly once, then keep the database as the sole source of truth.
  useEffect(() => {
    if (!isDbLoaded || db.userSettings?.stickyNotesMigrated) return;
    let legacyNotes: StickyNote[] = [];
    try {
      const raw = localStorage.getItem('tenderloop.stickynotes.v1');
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) legacyNotes = parsed.filter(note => note && typeof note.content === 'string' && typeof note.id === 'string' && typeof note.createdAt === 'string');
    } catch { /* A malformed legacy value must never block the database. */ }
    const byId = new Map<string, StickyNote>();
    [...(db.userSettings?.stickyNotes || []), ...legacyNotes].forEach(note => byId.set(note.id, note));
    const stickyNotes = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setDb(prev => ({ ...prev, userSettings: { ...prev.userSettings, stickyNotes, stickyNotesMigrated: true } }));
  }, [isDbLoaded, db.userSettings?.stickyNotesMigrated]);

  // General quick links are database-owned too. This initial migration preserves
  // any links that were saved in a browser setting during an early rollout.
  useEffect(() => {
    if (!isDbLoaded || db.userSettings?.generalQuickLinksMigrated) return;
    const fromSettings = appSettingsRef.current.generalQuickLinks || [];
    const byId = new Map<string, GeneralQuickLink>();
    [...(db.userSettings?.generalQuickLinks || []), ...fromSettings].forEach(link => byId.set(link.id, link));
    const generalQuickLinks = [...byId.values()];
    setDb(prev => ({ ...prev, userSettings: { ...prev.userSettings, generalQuickLinks, generalQuickLinksMigrated: true } }));
    if (generalQuickLinks.length) setAppSettings(prev => ({ ...prev, generalQuickLinks }));
  }, [isDbLoaded, db.userSettings?.generalQuickLinksMigrated]);

  useEffect(() => {
    if (!isDbLoaded || !db.userSettings?.generalQuickLinksMigrated) return;
    const databaseLinks = db.userSettings.generalQuickLinks || [];
    setAppSettings(prev => ({ ...prev, generalQuickLinks: databaseLinks }));
  }, [isDbLoaded, db.userSettings?.generalQuickLinks, db.userSettings?.generalQuickLinksMigrated]);

  // PERF FIX: Debounced persistent-state writes (was synchronous on every render).
  // localStorage.setItem blocks the main thread. On low-RAM machines this
  // contributes visible jank when the user types or changes tabs frequently.
  useEffect(() => {
    if (sessionTabsTimerRef.current) clearTimeout(sessionTabsTimerRef.current);
    sessionTabsTimerRef.current = window.setTimeout(() => {
      localStorage.setItem('TenderLoop_FloatingTabs_V1', JSON.stringify(floatingTabs));
    }, 300);
    return () => { if (sessionTabsTimerRef.current) clearTimeout(sessionTabsTimerRef.current); };
  }, [floatingTabs]);

  useEffect(() => {
    if (sessionNavTimerRef.current) clearTimeout(sessionNavTimerRef.current);
    sessionNavTimerRef.current = window.setTimeout(() => {
      const navState = { currentView, selectedOppId, activeDeepLink };
      localStorage.setItem('TenderLoop_Navigation_V1', JSON.stringify(navState));
    }, 300);
    return () => { if (sessionNavTimerRef.current) clearTimeout(sessionNavTimerRef.current); };
  }, [currentView, selectedOppId, activeDeepLink]);

  // Load Recents & Auto-open last DB
  useEffect(() => {
    const init = async () => {
      const hasBackend = await isBackendAvailable();
      setBackendAvailable(hasBackend);

      // A file explicitly selected by the user is always the source of truth.
      // Reopen it before the legacy internal DB so restarts keep saving to the
      // same visible JSON file.
      const selectedRecents = await getRecentDbs();
      setRecentDbs(selectedRecents);
      const selectedLastHandle = await getLastDb();
      if (selectedLastHandle) {
        // @ts-ignore File System Access API permissions are Chromium-specific.
        const perm = await selectedLastHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          setStatus('loading');
          await loadDbFromHandle(selectedLastHandle);
          return;
        }
        if (perm === 'prompt') {
          setPendingHandle(selectedLastHandle);
          setStartupHint('__reopen__');
          return;
        }
      }

      // Compatibility for existing installations: use the internal backend DB
      // only when there is no user-selected file available.
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
          setBackendName(snapshot.status.name || 'Tender Control backend DB');
          setCurrentDbNativePath(snapshot.status.path);
          setFallbackFileName(snapshot.status.name || 'Tender Control backend DB');
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
    void init().finally(() => setIsStartupChecking(false));
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
   * Folder metadata (document attachments, quick-access pins, file revision history)
   * is stored on the opportunity itself so it lives in the shared database instead of
   * per-browser IndexedDB. The services that own that data are plain modules with no
   * access to React state, so App hands them a bridge here.
   *
   * `mutate` deliberately takes a mutator and runs it inside setDb's functional update:
   * folder reconciliation, pin toggles and link edits routinely fire within one tick,
   * and a read-modify-write against a captured snapshot would drop all but the last.
   */
  useEffect(() => {
    registerOpportunityFolderBridge({
      read: (opportunityId: string) => dbRef.current.opportunities.find(o => o.id === opportunityId),
      mutate: (opportunityId: string, mutator: (opp: Opportunity) => Opportunity) => {
        setDb(prev => {
          const index = prev.opportunities.find(o => o.id === opportunityId);
          if (!index) return prev;
          const next = mutator(index);
          if (next === index) return prev; // mutator decided nothing changed
          const opportunities = prev.opportunities.map(o =>
            o.id === opportunityId ? { ...next, lastUpdated: new Date().toISOString() } : o,
          );
          return { ...prev, opportunities };
        });
      },
    });
    return () => registerOpportunityFolderBridge(null);
  }, []);

  // Recover every folder path stored by older releases in this browser and copy it
  // into the shared JSON database. This deliberately runs independently from the old
  // folderDataMigrated flag: earlier migrations covered documents/pins/history but did
  // not copy paths, so trusting that flag would strand already-linked users.
  const recoveredFolderPathsRef = useRef(new Set<string>());
  const folderPathDbIdentityRef = useRef('');
  useEffect(() => {
    if (!isDbLoaded || !storageMode) return;
    const dbIdentity = storageMode === 'backend'
      ? `backend:${currentDbNativePath || backendName || 'default'}`
      : `file:${fileHandle?.name || fallbackFileName || 'selected'}`;
    if (folderPathDbIdentityRef.current !== dbIdentity) {
      folderPathDbIdentityRef.current = dbIdentity;
      recoveredFolderPathsRef.current.clear();
    }

    for (const opportunity of db.opportunities) {
      const migrationKey = `${dbIdentity}::${opportunity.id}`;
      if (recoveredFolderPathsRef.current.has(migrationKey)) continue;
      recoveredFolderPathsRef.current.add(migrationKey);
      getStoredFolderPaths(opportunity.id)
        .then(paths => {
          if (folderPathDbIdentityRef.current === dbIdentity) mergeFolderPaths(opportunity.id, paths);
        })
        .catch(err => {
          if (folderPathDbIdentityRef.current === dbIdentity) recoveredFolderPathsRef.current.delete(migrationKey);
          console.warn('[Folder paths] Legacy path recovery failed', err);
        });
    }
  }, [isDbLoaded, storageMode, currentDbNativePath, backendName, fileHandle, fallbackFileName, db.opportunities]);

  /**
   * Always resolves against the latest globalContacts, not whatever a given
   * OpportunityDetail render closed over — otherwise two directory saves fired
   * close together (or from two mounted instances of the same opportunity)
   * can race and the second silently overwrites the first.
   */
  const applyGlobalContactsUpdate = useCallback((update: GlobalContact[] | ((prev: GlobalContact[]) => GlobalContact[])) => {
    const prev = appSettingsRef.current.globalContacts || [];
    const next = typeof update === 'function' ? (update as (prev: GlobalContact[]) => GlobalContact[])(prev) : update;
    handleSaveSettings({ ...appSettingsRef.current, globalContacts: next });
  }, [handleSaveSettings]);
  const selectedOppIdRef = useRef(selectedOppId);
  selectedOppIdRef.current = selectedOppId;

  // PERF: Stable references for settings-derived arrays. Expressions like
  // `appSettings.holidays || []` allocate a new empty array on every App
  // render, busting React.memo on Dashboard/OpportunityDetail and forcing
  // their multi-thousand-line trees to reconcile each time App state moves.
  const stableHolidays = useMemo(() => appSettings.holidays || EMPTY_ARR, [appSettings.holidays]);
  // Global labels live in the database so they travel with the user's TenderLoop file.
  const stableGlobalLabels = useMemo(() => db.userSettings?.globalLabels || appSettings.globalLabels || EMPTY_ARR, [db.userSettings?.globalLabels, appSettings.globalLabels]);
  const stableTrackedAreas = useMemo(() => appSettings.trackedAreas || EMPTY_ARR, [appSettings.trackedAreas]);
  const stableGlobalContacts = useMemo(
    () => db.userSettings?.globalContactsMigrated ? (db.userSettings.globalContacts || EMPTY_ARR) : (appSettings.globalContacts || EMPTY_ARR),
    [db.userSettings?.globalContacts, db.userSettings?.globalContactsMigrated, appSettings.globalContacts],
  );
  const stableHiddenOpportunityDetailSections = useMemo(() => appSettings.hiddenOpportunityDetailSections || EMPTY_ARR, [appSettings.hiddenOpportunityDetailSections]);
  const stableOpportunityDetailSectionOrder = useMemo(() => appSettings.opportunityDetailSectionOrder || EMPTY_ARR, [appSettings.opportunityDetailSectionOrder]);
  const stableHiddenOpportunityHeaderFields = useMemo(() => appSettings.hiddenOpportunityHeaderFields || EMPTY_ARR, [appSettings.hiddenOpportunityHeaderFields]);
  const stableAlarms = useMemo(() => appSettings.alarms || EMPTY_ARR, [appSettings.alarms]);
  const stableGlobalSowForm = useMemo(() => appSettings.globalSowForm || EMPTY_SOW_FORM, [appSettings.globalSowForm]);
  // Normalized once here: the SOW iframe re-renders its option lists whenever this identity
  // changes, so handing it a fresh object every render would rebuild the form on every keystroke.
  const stableScopeCatalog = useMemo(() => {
    const catalog = normalizeScopeCatalog(appSettings.scopeCatalog) || DEFAULT_SCOPE_CATALOG;
    const extras = new Map(catalog.extras.map(option => [option.id, option]));
    stableGlobalLabels.forEach(label => {
      if (!catalogContainsLabel(catalog, label.text)) extras.set(label.id, { id: label.id, label: label.text, color: label.color });
    });
    return { ...catalog, extras: [...extras.values()].filter(option => !catalogContainsLabel(catalog, option.label)) };
  }, [appSettings.scopeCatalog, stableGlobalLabels]);
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
          setBackendName(snapshot.status.name || 'Tender Control backend DB');
          setFallbackFileName(snapshot.status.name || 'Tender Control backend DB');
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
          // Recovery backups never participate in or delay the primary save.
          // At most one is prepared every five minutes, after 15 seconds of
          // idle time, and a second job cannot start while one is still running.
          if (
            success && backendAvailable &&
            !recoveryBackupInFlightRef.current &&
            !recoveryBackupTimerRef.current &&
            Date.now() - lastRecoveryBackupAtRef.current >= 5 * 60_000
          ) {
            const recoveryName = fileHandle.name;
            recoveryBackupTimerRef.current = window.setTimeout(() => {
              recoveryBackupTimerRef.current = null;
              if (recoveryBackupInFlightRef.current) return;
              recoveryBackupInFlightRef.current = true;
              archiveRecoveryBackup(dbRef.current, recoveryName)
                .then(() => { lastRecoveryBackupAtRef.current = Date.now(); })
                .catch(err => {
                  console.warn('[Backup] Recovery snapshot failed; original DB was saved successfully.', err);
                })
                .finally(() => { recoveryBackupInFlightRef.current = false; });
            }, 15_000);
          }
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
          setErrorMessage("Backend database changed elsewhere. Your last edit will be saved on the next change.");
          // Without this, every future autosave keeps sending the same stale
          // revision and keeps failing with 409 until the user manually
          // reloads the whole app. Re-sync the revision counter now (not the
          // data — the in-memory `db` still holds the user's edits) so the
          // very next autosave tick succeeds instead of looping forever.
          try {
            const current = await getBackendDbStatus();
            backendRevisionRef.current = current.status.revision;
            setBackendRevision(current.status.revision);
          } catch {
            // Backend still unreachable — next autosave attempt will retry this same recovery.
          }
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
      setCurrentDbNativePath(await resolveNativeDbPath(file));
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
        taskStandards={appSettings.taskStandards}
        holidays={stableHolidays}
        trackedAreas={stableTrackedAreas}
        globalContacts={stableGlobalContacts}
        onGlobalContactsChange={applyGlobalContactsUpdate}
        onTrackedAreasChange={handleTrackedAreasChange}
        globalLabels={stableGlobalLabels}
        emailIntegrationEnabled={appSettings.emailIntegrationEnabled || false}
        sowSectionEnabled={appSettings.sowSectionEnabled || false}
        stakeholdersSectionEnabled={appSettings.stakeholdersSectionEnabled || false}
        commercialCqaLinkVisible={appSettings.commercialCqaLinkVisible !== false}
        onHideCommercialCqaLink={hideCommercialCqaLink}
        onShowCommercialCqaLink={showCommercialCqaLink}
        commercialOppLinesLinkVisible={appSettings.commercialOppLinesLinkVisible !== false}
        onHideCommercialOppLinesLink={hideCommercialOppLinesLink}
        onShowCommercialOppLinesLink={showCommercialOppLinesLink}
        remindersEnabled={appSettings.remindersEnabled || false}
        onAddReminder={handleAddReminder}
        hiddenOpportunityHeaderFields={stableHiddenOpportunityHeaderFields}
        hiddenOpportunityDetailSections={stableHiddenOpportunityDetailSections}
        opportunityDetailSectionOrder={stableOpportunityDetailSectionOrder}
        alarms={stableAlarms}
        confirmExpectedDateChanges={appSettings.confirmExpectedDateChanges === true}
        userName={appSettings.userName || 'User'}
        emailComposeSettings={appSettings.emailCompose || null}
        globalSowForm={stableGlobalSowForm}
        onGlobalSowFormChange={handleGlobalSowFormChange}
        scopeCatalog={stableScopeCatalog}
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

          // These labels existed in earlier releases only. Keep old records usable,
          // but migrate them into the current set of selectable process statuses.
          if ((detailedStatus as string) === 'Waiting') detailedStatus = 'Info Needed';
          if ((detailedStatus as string) === 'No Status' || !detailedStatus) detailedStatus = 'Working on it';

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

          // Very old databases used one string instead of the per-revision map.
          // Keep every modern entry and add the legacy value only as the unkeyed
          // fallback, which all revisions can inherit without overwriting newer paths.
          const existingFolderPaths = Object.fromEntries(
            Object.entries((o as any).folderPaths || {})
              .filter(([, value]) => typeof value === 'string' && !!value.trim())
              .map(([key, value]) => [key, (value as string).trim()]),
          ) as Record<string, string>;
          const legacyFolderPath = [
            (o as any).folderPath,
            (o as any).folderBasePath,
            (o as any).rootFolderPath,
          ].find(value => typeof value === 'string' && !!value.trim()) as string | undefined;
          if (legacyFolderPath && !existingFolderPaths['']) existingFolderPaths[''] = legacyFolderPath.trim();

          return {
            ...o,
            statusLabel: newStatus,
            detailedStatus: detailedStatus,
            qlk: o.qlk || '',
            revision: o.revision || 'R0',
            folderPaths: existingFolderPaths,
            folderLinked: Boolean((o as any).folderLinked || Object.keys(existingFolderPaths).length),
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
                status: normalizeTaskStatus(t.status),
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
      // Keep ranks unique without collapsing deliberate gaps. Users may assign
      // any positive rank (for example 2 even when 1 is currently unused).
      const active = migratedOpps
        .filter(o => !['Submitted', 'Won', 'Lost', 'Canceled'].includes(o.statusLabel) && o.detailedStatus !== 'Completed' && o.detailedStatus !== 'Canceled')
        .sort((a, b) => {
          const aRank = Number(a.priorityOrder) || Number.MAX_SAFE_INTEGER;
          const bRank = Number(b.priorityOrder) || Number.MAX_SAFE_INTEGER;
          if (aRank !== bRank) return aRank - bRank;
          const aDate = a.kpis?.timeline?.receivedAt || a.dates?.requested || '';
          const bDate = b.kpis?.timeline?.receivedAt || b.dates?.requested || '';
          return aDate.localeCompare(bDate) || a.id.localeCompare(b.id);
        });
      const usedRanks = new Set<number>();
      let nextFreeRank = 1;
      const rankById = new Map(active.map(opp => {
        const requested = Number(opp.priorityOrder);
        let rank = Number.isInteger(requested) && requested > 0 ? requested : nextFreeRank;
        while (usedRanks.has(rank)) rank += 1;
        usedRanks.add(rank);
        while (usedRanks.has(nextFreeRank)) nextFreeRank += 1;
        return [opp.id, rank];
      }));
      const normalizedRanks = migratedOpps.map(opp => ({ ...opp, priorityOrder: rankById.get(opp.id) || null }));
      return { ...data, opportunities: normalizedRanks };
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
        if (result.error !== 'Selection cancelled.') {
          setErrorMessage(result.error);
          setStatus('error');
        } else {
          setStatus('idle');
        }
        return;
      }

      if (result.data) {
        if (!verifyDatabaseStructure(result.data)) {
          setErrorMessage("The selected file is not a valid Tender Control database.");
          setStatus('error');
          return;
        }

        if (!result.handle) {
          setErrorMessage('This browser can read the database but cannot save changes back to it. Open Tender Control in Chrome or Edge and select the file again.');
          setStatus('error');
          return;
        }

        console.debug("[App] Migrating and setting state...");
        const migratedData = migrateData(result.data);
        mergeNoteCrashBackups(migratedData);

        // The selected file remains the source of truth. Every autosave writes
        // directly through this handle instead of updating an internal copy.
        // @ts-ignore File System Access API permissions are Chromium-specific.
        const perm = await result.handle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          setErrorMessage('Write permission is required so Tender Control can update the selected database.');
          setStatus('error');
          return;
        }

        setIsDbLoaded(false);
        setFileHandle(result.handle);
        setStorageMode('file');
        setBackendRevision(0);
        backendRevisionRef.current = 0;
        setBackendName(null);
        setFallbackFileName(null);
        setCurrentDbNativePath(await resolveNativeDbPath(await result.handle.getFile()));
        await rememberDb(result.handle, { name: result.handle.name });

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
        if (result.error !== 'Creation cancelled.') {
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

  const handleOpenCurrentDbFolder = async () => {
    setShowRecents(false);
    try {
      if (storageMode === 'backend') await revealCurrentBackendDb();
      else if (currentDbNativePath) await revealNativePath(currentDbNativePath);
      else throw new Error('The native path is not available yet. Reopen the database once after restarting Tender Control.');
    } catch (err: any) {
      console.error('[Backend DB] Could not reveal current database:', err);
      setErrorMessage('Could not open the current database folder: ' + (err?.message || String(err)));
      setStatus('error');
    }
  };

  const handleSaveCurrentDbToFile = async () => {
    setShowRecents(false);
    try {
      if (typeof window.showSaveFilePicker !== 'function') {
        throw new Error('Saving directly to a selected file requires Chrome or Edge.');
      }
      const handle = await window.showSaveFilePicker({
        suggestedName: backendName || 'tendering_db.json',
        types: [{
          description: 'Tender Control JSON Database',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const saved = await saveToDisk(handle, dbRef.current);
      if (!saved) throw new Error('The database could not be written to the selected file.');

      setFileHandle(handle);
      setStorageMode('file');
      setBackendRevision(0);
      backendRevisionRef.current = 0;
      setBackendName(null);
      setFallbackFileName(null);
      setCurrentDbNativePath(await resolveNativeDbPath(await handle.getFile()));
      await rememberDb(handle, { name: handle.name });
      setRecentDbs(await getRecentDbs());
      setErrorMessage(null);
      setStatus('saved');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('[Database] Could not move current DB to selected file:', err);
      setErrorMessage('Could not save the current database to the selected file: ' + (err?.message || String(err)));
      setStatus('error');
    }
  };

  const deleteOpportunity = useCallback((id: string) => {
    if (!isDbLoaded) return;
    setSelectedOppId(null);
    setDb(current => ({ ...current, opportunities: current.opportunities.filter(o => o.id !== id) }));
    // Auto-save effect will handle persistence
  }, [isDbLoaded]);

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
  const createOpportunity = useCallback((stage: ProcessStage = '1. Intake', taskStandardId?: string) => {
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

    const selectableStandards = visibleTaskStandards(settings.taskStandards);
    const selectedNamedStandard = settings.taskStandards?.find(standard => standard.id === taskStandardId)
      || (selectableStandards.length === 1 ? selectableStandards[0] : undefined);

    // --- CASE A: Named task standard selected by the user ---
    if (selectedNamedStandard) {
      const taskIdMap = new Map<string, string>();
      selectedNamedStandard.tasks.forEach(t => taskIdMap.set(t.id, crypto.randomUUID()));
      defaultTasks = selectedNamedStandard.tasks.map(tmpl => ({
        id: taskIdMap.get(tmpl.id)!,
        title: tmpl.title,
        description: tmpl.description || '',
        processSection: tmpl.processSection,
        status: 'Pending',
        priority: tmpl.priority || 'Medium',
        owner: tmpl.owner || 'Me',
        externalAreas: tmpl.externalAreas || [],
        responsible: '',
        dueDate: '',
        stageContext: stage,
        subtasks: (tmpl.subtasks || []).map(st => ({ ...st, id: crypto.randomUUID(), completed: false })),
        order: tmpl.order,
        dependsOnTaskIds: (tmpl.dependsOnTaskIds || []).map(depId => taskIdMap.get(depId)).filter(Boolean) as string[],
        blockDoneUntilDependenciesDone: tmpl.blockDoneUntilDependenciesDone || false,
        subtasksPerSystem: tmpl.subtasksPerSystem || false
      }));
    }
    // --- CASE B: Legacy default tasks ---
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
          description: tmpl.description || '',
          processSection: tmpl.processSection,
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
          subtasksPerSystem: tmpl.subtasksPerSystem || false
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
      links: { bfo: '', oppLines: '', internalFolder: '', officialFolder: '', cqaLink: '', ba: '', srLink: '', geet: '' },
      notes: initialNotes,
      emails: {
        folders: [],
        labels: [],
        conversations: [],
        selectedOutlookFolderIds: []
      },
      tasks: assignMissingOrders(defaultTasks),
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
      // Arrival order is the default rank. Calculate against the latest state so
      // two fast creations cannot receive the same number.
      const activeOpportunities = prev.opportunities.filter(o =>
        !['Submitted', 'Won', 'Lost', 'Canceled'].includes(o.statusLabel)
        && o.detailedStatus !== 'Completed' && o.detailedStatus !== 'Canceled'
      );
      const arrivalRank = Math.max(0, ...activeOpportunities.map(o => Number(o.priorityOrder) || 0)) + 1;
      return { ...prev, opportunities: [{ ...newOpp, priorityOrder: arrivalRank }, ...prev.opportunities] };
    });
    setSelectedOppId(newId);
  }, []);

  const rebalancePriorities = useCallback((opps: Opportunity[], changedId?: string, newOrder?: number | null, _statusChanged: boolean = false) => {
    // Rank is global and independent from status. Manual values are preserved,
    // including gaps; only collisions are shifted upward.
    const isRankedActive = (opp: Opportunity) =>
      !['Submitted', 'Won', 'Lost', 'Canceled'].includes(opp.statusLabel)
      && opp.detailedStatus !== 'Completed' && opp.detailedStatus !== 'Canceled';
    const activeOpps = opps.filter(isRankedActive);
    const requestedRank = changedId && newOrder != null ? Math.max(1, Math.trunc(newOrder)) : null;
    const usedRanks = new Set<number>();
    if (requestedRank !== null) usedRanks.add(requestedRank);
    const rankById = new Map<string, number>();
    if (changedId && requestedRank !== null && activeOpps.some(opp => opp.id === changedId)) rankById.set(changedId, requestedRank);
    activeOpps
      .filter(opp => opp.id !== changedId)
      .sort((a, b) => (Number(a.priorityOrder) || Number.MAX_SAFE_INTEGER) - (Number(b.priorityOrder) || Number.MAX_SAFE_INTEGER))
      .forEach(opp => {
        let rank = Math.max(1, Math.trunc(Number(opp.priorityOrder) || 1));
        while (usedRanks.has(rank)) rank += 1;
        usedRanks.add(rank);
        rankById.set(opp.id, rank);
      });
    return opps.map(opp => {
      const nextRank = isRankedActive(opp) ? (rankById.get(opp.id) || null) : null;
      return opp.priorityOrder === nextRank ? opp : { ...opp, priorityOrder: nextRank };
    });
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
              cancelledAt: cleanedUpdate.statusLabel === 'Canceled'
                ? (currentTimeline.cancelledAt || new Date().toISOString().split('T')[0])
                : oldOpp.statusLabel === 'Canceled'
                  ? null
                  : currentTimeline.cancelledAt,
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

        const currentReminders = prev.userSettings?.reminders || [];
        const reminders = filterActionableReminders(currentReminders, rebalanced);
        return {
          ...prev,
          opportunities: rebalanced,
          ...(reminders === currentReminders ? {} : {
            userSettings: { ...prev.userSettings, reminders }
          })
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
    const currentTask = dbRef.current.opportunities.find(o => o.id === oppId)?.tasks.find(t => t.id === taskId);
    if (currentTask?.status === 'Approval' && updates.status === 'Done') {
      alert('Open the task and use the Approve button to complete this approval.');
      return;
    }
    if (currentTask?.status === 'Changes Requested / Rework' && updates.status === 'Done') {
      alert('Complete the linked corrective task first.');
      return;
    }
    React.startTransition(() => {
      setDb(prev => ({
        ...prev,
        opportunities: prev.opportunities.map(o => {
          if (o.id !== oppId) return o;
          const existingTask = o.tasks.find(t => t.id === taskId);
          let taskUpdates = { ...updates };
          if (existingTask?.isAssignment && taskUpdates.status === 'Done') {
            const today = getTodayStr();
            if (existingTask.status === 'Missing Info' && (existingTask.approverTeamMemberIds || []).length > 0) {
              taskUpdates = {
                ...taskUpdates,
                status: 'Approval',
                responsibleDeliveredDate: existingTask.responsibleDeliveredDate || today,
                approvalRequestedDate: existingTask.approvalRequestedDate || today,
              };
            } else if (existingTask.status === 'Missing Info') {
              taskUpdates.responsibleDeliveredDate = existingTask.responsibleDeliveredDate || today;
            }
          }
          const isMarkingDone = existingTask
            && taskUpdates.status === 'Done'
            && existingTask.status !== 'Done';
          const isUnmarkingDone = existingTask
            && taskUpdates.status
            && taskUpdates.status !== 'Done'
            && existingTask.status === 'Done';
          const doneDate = isMarkingDone
            ? (existingTask.dueDate || getTodayStr())
            : '';
          let updatedTask: Task | undefined;
          let updatedOpp = {
            ...o,
            tasks: o.tasks.map(t => {
              if (t.id !== taskId) return t;
              updatedTask = syncAssignmentSubtasks({
                ...t,
                ...taskUpdates,
                ...(isMarkingDone && !t.dueDate ? { dueDate: doneDate } : {}),
                ...(isMarkingDone ? { completedAt: new Date().toISOString() } : {}),
                ...(isUnmarkingDone ? { completedAt: undefined } : {}),
              });
              return updatedTask;
            }),
            lastUpdated: new Date().toISOString()
          };
          if (updatedTask) {
            updatedOpp = syncTaskAssignmentTimeline(updatedOpp, updatedTask, appSettingsRef.current.holidays || []);
          }
          return isMarkingDone && updatedTask?.owner === 'Me' ? markTenderingWorkedDay(updatedOpp, doneDate) : updatedOpp;
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
            const wasDone = task.status === 'Done';
            task.status = status;
            if (status === 'Done') {
              if (!task.dueDate) task.dueDate = dateStr;
              if (!wasDone) task.completedAt = nowIso;
            } else if (wasDone) {
              task.completedAt = undefined;
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

  // The dashboard is completely covered while either detail view is open. Keep
  // its expensive search/index projection frozen until it becomes visible again.
  const isOverlayOpen = !!selectedOppId || !!splitTab;

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
      if (existing && (existing._originalRef === opp || isOverlayOpen)) return existing;

      const light = {
        ...opp,
        // Content metadata only — EXCEPT the SOW note. What makes a note heavy is
        // rich-text HTML; a SOW note is a small JSON answer sheet, and keeping the
        // existing string reference costs nothing (strings are shared, not copied).
        // Blanking it meant the dashboard could not read the Scope answers at all, so
        // the cards had nothing to show and collectSowTeamMembers came back empty.
        notes: (opp.notes || []).map(n => (n.format === 'sow' ? n : { ...n, content: '' })),
        versions: [], // Strip heavy snapshots
        versionsCount: (opp.versions || []).length, // Preserve the count for list/dashboard display
        versionsCreatedAt: (opp.versions || []).map(v => v.createdAt), // Preserve dates for monthly revision charts
        versionsExpectedDates: (opp.versions || []).map(v => v.snapshot?.dates?.expected || ''), // Preserve each revision's own "Expected" date for monthly revision charts
        _originalRef: opp, // Tag for cache-busting
        _isLight: true, // Safety tag to prevent overwriting full records in updateOpportunity
        // Includes every stored field (including rich-text notes) before the
        // light object removes note content for rendering performance.
        _searchIndex: buildOpportunitySearchIndex(opp, stableScopeCatalog)
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
  }, [stableOpportunities, isOverlayOpen, stableScopeCatalog]);

  // CRITICAL PERF: Freeze Dashboard inputs while a full-screen overlay is open.
  // The detail overlay and split-view both cover the entire viewport with opaque/semi-opaque
  // layers, so updating Dashboard's props while typing in the expediente burns CPU on
  // invisible work (filteredOpps, kpiData, taskData, groupedOpps all recompute).
  // We keep the last visible snapshot and swap back to live data when the overlay closes.
  const frozenDashboardOppsRef = useRef(lightOpportunities);
  if (!isOverlayOpen) frozenDashboardOppsRef.current = lightOpportunities;
  const dashboardOpportunities = isOverlayOpen ? frozenDashboardOppsRef.current : lightOpportunities;

  const selectedOppForDetail = useMemo(() => {
    if (!selectedOppId) return null;
    return stableOpportunities.find(o => o.id === selectedOppId);
  }, [stableOpportunities, selectedOppId]);

  const handleSelectOpp = useCallback((id: string, dl?: DeepLink) => {
    // startTransition lets React yield while it mounts the (large) OpportunityDetail
    // tree, instead of blocking the main thread in one long synchronous commit — that
    // block is what made the overlay's fade-in/zoom-in feel like it skipped frames.
    React.startTransition(() => {
      setSelectedOppId(id);
      setActiveDeepLink(dl ? { ...dl, _nonce: ++deepLinkNonceRef.current } : null);
    });
  }, []);

  const handleCloseSelectedOpportunity = useCallback(() => {
    setSelectedOppId(null);
    setActiveDeepLink(null);
  }, []);
  const handleDeleteSelectedOpportunity = useCallback(() => {
    const id = selectedOppIdRef.current;
    if (id) deleteOpportunity(id);
  }, [deleteOpportunity]);
  const handleTrackedAreasChange = useCallback((areas: string[]) => {
    handleSaveSettings({ ...appSettingsRef.current, trackedAreas: areas });
  }, [handleSaveSettings]);
  const hideCommercialCqaLink = useCallback(() => {
    handleSaveSettings({ ...appSettingsRef.current, commercialCqaLinkVisible: false });
  }, [handleSaveSettings]);
  const showCommercialCqaLink = useCallback(() => {
    handleSaveSettings({ ...appSettingsRef.current, commercialCqaLinkVisible: true });
  }, [handleSaveSettings]);
  const hideCommercialOppLinesLink = useCallback(() => {
    handleSaveSettings({ ...appSettingsRef.current, commercialOppLinesLinkVisible: false });
  }, [handleSaveSettings]);
  const showCommercialOppLinesLink = useCallback(() => {
    handleSaveSettings({ ...appSettingsRef.current, commercialOppLinesLinkVisible: true });
  }, [handleSaveSettings]);
  const handleGlobalSowFormChange = useCallback((form: { sections: any[]; questions: any[] }) => {
    handleSaveSettings({ ...appSettingsRef.current, globalSowForm: form });
  }, [handleSaveSettings]);

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
    const creationStage = stage || '1. Intake';
    const standards = appSettingsRef.current.taskStandards || [];
    const selectable = visibleTaskStandards(standards);
    // Every list hidden? Still ask, but start with the hidden ones revealed.
    if (selectable.length > 1 || (selectable.length === 0 && standards.length > 1)) {
      setShowHiddenTaskStandards(selectable.length === 0);
      setPendingOpportunityCreation({ stage: creationStage, standardId: (selectable[0] || standards[0])?.id || '' });
      return;
    }
    createOpportunity(creationStage, (selectable[0] || standards[0])?.id);
  }, [createOpportunity]);

  // Schedule notifications: fire 10 min before each block's start time.
  // Click opens the opportunity and focuses the related task.
  useScheduleNotifications(stableOpportunities, handleSelectOpp, appSettings.notificationSound);

  const stableReminders = useMemo(() => db.userSettings?.reminders || EMPTY_ARR, [db.userSettings?.reminders]);

  const handleAddReminder = useCallback((reminder: Omit<Reminder, 'id' | 'createdAt'>) => {
    setDb(prev => {
      const current = prev.userSettings?.reminders || [];
      const dueDate = new Date(reminder.dueAt);
      if (isNaN(dueDate.getTime())) return prev;
      const dueMinute = dueDate.toISOString().slice(0, 16);
      const normalizedTitle = reminder.title.trim().toLocaleLowerCase();
      const duplicate = current.some(item =>
        item.opportunityId === reminder.opportunityId
        && (item.taskId || '') === (reminder.taskId || '')
        && (item.noteId || '') === (reminder.noteId || '')
        && !isNaN(new Date(item.dueAt).getTime())
        && new Date(item.dueAt).toISOString().slice(0, 16) === dueMinute
        && item.title.trim().toLocaleLowerCase() === normalizedTitle
      );
      if (duplicate) return prev;
      const newReminder: Reminder = { ...reminder, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      return { ...prev, userSettings: { ...prev.userSettings, reminders: [...current, newReminder] } };
    });
  }, []);

  // Avoid rebuilding the enormous split-detail React tree for unrelated App
  // state such as the autosave badge changing from "Saving" to "Saved".
  const splitTabContent = useMemo(
    () => splitTab ? renderSplitTabContent(splitTab) : null,
    [
      splitTab,
      db.opportunities,
      appSettings,
      stableHolidays,
      stableTrackedAreas,
      stableGlobalContacts,
      stableGlobalLabels,
      stableHiddenOpportunityDetailSections,
      stableOpportunityDetailSectionOrder,
      stableScopeCatalog,
      applyGlobalContactsUpdate,
      handleAddReminder,
      updateOpportunity,
      deleteOpportunity,
    ],
  );

  const handleExportManagerReport = useCallback(async (userName?: string) => {
    try {
      // The report's "tender" field is Manager Tool's per-user dedup key —
      // prefer the stable reporterId over the free-text user name.
      const reporterId = db.userSettings?.managerReportSync?.reporterId;
      await downloadManagerReport(buildManagerReport(db, reporterId || userName || appSettings.userName));
    } catch (error) {
      console.error('[Manager report] Export failed', error);
      alert('Could not export the Manager Tool report. Please try again.');
    }
  }, [db, appSettings.userName]);

  const handleReminderNotified = useCallback((id: string) => {
    setDb(prev => ({
      ...prev,
      userSettings: { ...prev.userSettings, reminders: (prev.userSettings?.reminders || []).map(r => r.id === id ? { ...r, notifiedAt: new Date().toISOString() } : r) }
    }));
  }, []);

  const handleUpdateReminder = useCallback((id: string, changes: Partial<Reminder>) => {
    setDb(prev => ({
      ...prev,
      userSettings: { ...prev.userSettings, reminders: (prev.userSettings?.reminders || []).map(r => r.id === id ? { ...r, ...changes } : r) }
    }));
  }, []);

  const handleDeleteReminder = useCallback((id: string) => {
    setDb(prev => ({
      ...prev,
      userSettings: { ...prev.userSettings, reminders: (prev.userSettings?.reminders || []).filter(r => r.id !== id) }
    }));
  }, []);

  // Reminders are only actionable while their target is still open: once the
  // linked task closes (Done/Canceled) or the opportunity itself is
  // Completed/Canceled, the reminder auto-completes — same effect as pressing
  // its Done button, no matter which view changed the status.
  useEffect(() => {
    setDb(prev => {
      const reminders = prev.userSettings?.reminders;
      if (!reminders || reminders.length === 0) return prev;
      const kept = filterActionableReminders(reminders, prev.opportunities);
      if (kept.length === reminders.length) return prev;
      return { ...prev, userSettings: { ...prev.userSettings, reminders: kept } };
    });
  }, [db.opportunities]);

  // Opens whatever the reminder is linked to: both a task and a note opens the
  // task's split view (task + note side by side); just a task focuses it in the
  // Tasks tab; just a note opens it in the Notes tab; neither falls back to the
  // opportunity overview.
  const handleOpenReminder = useCallback((oppId: string, taskId?: string, noteId?: string) => {
    if (taskId && noteId) handleSelectOpp(oppId, { tab: 'tasks', taskId, noteId, fullView: true });
    else if (taskId) handleSelectOpp(oppId, { tab: 'tasks', taskId, fullView: true });
    else if (noteId) handleSelectOpp(oppId, { tab: 'notes', noteId, fullView: true });
    else handleSelectOpp(oppId);
  }, [handleSelectOpp]);

  useReminderNotifications(stableReminders, handleReminderNotified, handleOpenReminder, appSettings.notificationSound, appSettings.remindersEnabled);

  // Floating timer-only window mode: opened by TimerWidget.popOut() with ?window=timer.
  // Shares the same BroadcastChannel + localStorage so the widget stays in sync with the main app.
  const isTimerOnlyWindow = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('window') === 'timer';
  if (isTimerOnlyWindow) {
    return (
        <TimerProvider onLogTime={handleTimerLog} opportunities={stableOpportunities} timerSound={appSettings.timerSound} notificationSound={appSettings.notificationSound} primary={false}>
          <div className="h-screen w-screen min-h-0 bg-transparent p-0 flex overflow-hidden items-center justify-center">
          {appSettings.timerEnabled !== false && <TimerWidget floating />}
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
              Tender Control
            </div>
            <div data-tutorial="nav-tabs" className={`flex gap-1 bg-gray-50 p-1 rounded-lg ${isPending ? 'opacity-70 pointer-events-none' : ''}`}>
              {!(appSettings.hiddenViews || []).includes('general-dashboard') && <button
                onClick={() => { startTransition(() => setCurrentView('general-dashboard')); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'general-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <BarChart3 className="w-4 h-4" /> General
              </button>}
              {!(appSettings.hiddenViews || []).includes('proposals-dashboard') && <button
                onClick={() => { startTransition(() => setCurrentView('proposals-dashboard')); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'proposals-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Layout className="w-4 h-4" /> Proposals
              </button>}
              {!(appSettings.hiddenViews || []).includes('tasks-dashboard') && <button
                onClick={() => { startTransition(() => setCurrentView('tasks-dashboard')); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'tasks-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <CheckSquare className="w-4 h-4" /> Tasks
              </button>}
              {!(appSettings.hiddenViews || []).includes('indicators-dashboard') && <button
                onClick={() => { startTransition(() => setCurrentView('indicators-dashboard')); }}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${currentView === 'indicators-dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Activity className="w-4 h-4" /> Indicators
              </button>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {appSettings.remindersEnabled && (
              <RemindersBell
                reminders={stableReminders}
                opportunities={stableOpportunities}
                onAdd={handleAddReminder}
                onUpdate={handleUpdateReminder}
                onDelete={handleDeleteReminder}
                onOpenReminder={handleOpenReminder}
              />
            )}
            <button
              data-tutorial="settings-button"
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
                            <FolderOpen className="w-4 h-4 text-[#3DCD58]" /> Open another file...
                          </button>
                          {storageMode === 'backend' && (
                            <button onClick={handleSaveCurrentDbToFile} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded text-left">
                              <Save className="w-4 h-4 text-[#3DCD58]" /> Save current DB to file...
                            </button>
                          )}
                          <button onClick={handleOpenCurrentDbFolder} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded text-left">
                            <ExternalLink className="w-4 h-4 text-blue-500" /> Open current DB folder
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
            <div className="absolute inset-0 bg-white z-[10000] flex flex-col items-center justify-center gap-6 p-8">
              <img src="/icon.png?v=opportunityos-planner-2" className="w-20 h-20 rounded-2xl shadow-xl" alt="Tender Control" />
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900">Tender Control</h2>
                <p className="text-gray-500 text-sm mt-1">
                  {isStartupChecking
                    ? 'Restoring your last workspace…'
                    : pendingHandle
                    ? `Your database "${(pendingHandle as any).name}" needs permission to reopen.`
                    : backendAvailable
                      ? 'Create a backend database or import an existing JSON database.'
                      : 'Open or create a database to get started.'}
                </p>
              </div>
              {isStartupChecking ? (
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-5 py-3 text-sm font-medium text-gray-500" role="status" aria-live="polite">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#3DCD58]" />
                  Restoring database and filters
                </div>
              ) : pendingHandle && startupHint === '__reopen__' ? (
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
                  Reopen: {(pendingHandle as any).name}
                </button>
              ) : (
                <div className="flex gap-4 flex-wrap justify-center">
                  <button onClick={handleOpenDB} className="flex items-center gap-2 px-6 py-3 bg-[#3DCD58] hover:bg-[#2db64a] text-white rounded-xl font-bold shadow-md transition-all">
                    <FolderOpen className="w-5 h-5" /> Open Database
                  </button>
                  <button onClick={handleCreateDB} className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-bold shadow-sm hover:bg-gray-50 transition-all">
                    <PlusCircle className="w-5 h-5" /> New Database
                  </button>
                </div>
              )}
              {!isStartupChecking && recentDbs.length > 0 && (
                <div className="w-full max-w-sm">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 text-center">Recent Databases</p>
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
            <div className="h-full w-full overflow-hidden">
              <LocalErrorBoundary key="dashboard-boundary-recovery-v3" fallbackLabel="Dashboard">
                {currentView === 'indicators-dashboard' ? <IndicatorsDashboard
                  opportunities={dashboardOpportunities}
                  hiddenSections={appSettings.hiddenIndicatorSections}
                  timerEnabled={appSettings.timerEnabled !== false}
                  onSelectOpportunity={handleSelectOpp}
                /> : <Dashboard
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
                  processBoardColors={appSettings.processBoardColors}
                  onMinimize={minimizeToDock}
                  onOpenTaskSubView={openTaskSubView}
                  remindersEnabled={appSettings.remindersEnabled || false}
                  onAddReminder={handleAddReminder}
                  agendaFocusNonce={agendaFocusNonce}
                  scopeCatalog={stableScopeCatalog}
                />}
              </LocalErrorBoundary>
            </div>

            {/* Sub-View Overlay Panel (Full Screen) */}
            {splitTab && (
              <div className="fixed inset-0 bg-white z-[150] animate-in fade-in duration-150 flex flex-col">
                <div className="flex-1 overflow-hidden">
                  {splitTabContent}
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
            <div data-opportunity-detail-overlay="true" className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-2 md:p-6 animate-in fade-in duration-150" onClick={() => { if (!detailMouseDownInsideRef.current) handleCloseSelectedOpportunity(); detailMouseDownInsideRef.current = false; }}>
              <div className="bg-white w-full h-full rounded-2xl shadow-2xl overflow-hidden flex flex-col ring-1 ring-white/10" onMouseDown={() => { detailMouseDownInsideRef.current = true; }} onClick={(e) => e.stopPropagation()}>
                <LocalErrorBoundary fallbackLabel="Opportunity Detail">
                  <OpportunityDetail
                    opportunity={selectedOppForDetail}
                    opportunities={stableOpportunities}
                    onBack={handleCloseSelectedOpportunity}
                    onUpdate={updateOpportunity}
                    onDelete={handleDeleteSelectedOpportunity}
                    onSelectOpp={handleSelectOpp}
                    noteTemplates={appSettings.noteTemplates}
                    taskStandards={appSettings.taskStandards}
                    holidays={stableHolidays}
                    trackedAreas={stableTrackedAreas}
                    globalContacts={stableGlobalContacts}
                    onGlobalContactsChange={applyGlobalContactsUpdate}
                    onTrackedAreasChange={handleTrackedAreasChange}
                    globalLabels={stableGlobalLabels}
                    emailIntegrationEnabled={appSettings.emailIntegrationEnabled || false}
                    sowSectionEnabled={appSettings.sowSectionEnabled || false}
                    stakeholdersSectionEnabled={appSettings.stakeholdersSectionEnabled || false}
                    commercialCqaLinkVisible={appSettings.commercialCqaLinkVisible !== false}
                    onHideCommercialCqaLink={hideCommercialCqaLink}
                    onShowCommercialCqaLink={showCommercialCqaLink}
                    commercialOppLinesLinkVisible={appSettings.commercialOppLinesLinkVisible !== false}
                    onHideCommercialOppLinesLink={hideCommercialOppLinesLink}
                    onShowCommercialOppLinesLink={showCommercialOppLinesLink}
                    remindersEnabled={appSettings.remindersEnabled || false}
                    timerEnabled={appSettings.timerEnabled !== false}
                    onAddReminder={handleAddReminder}
                    hiddenOpportunityHeaderFields={stableHiddenOpportunityHeaderFields}
                    hiddenOpportunityDetailSections={stableHiddenOpportunityDetailSections}
                    opportunityDetailSectionOrder={stableOpportunityDetailSectionOrder}
                    alarms={stableAlarms}
                    confirmExpectedDateChanges={appSettings.confirmExpectedDateChanges === true}
                    userName={appSettings.userName || 'User'}
                    emailComposeSettings={appSettings.emailCompose || null}
                    globalSowForm={stableGlobalSowForm}
                    onGlobalSowFormChange={handleGlobalSowFormChange}
                    scopeCatalog={stableScopeCatalog}
                    deepLink={activeDeepLink || undefined}
                    onMinimize={minimizeToDock}
                  />
                </LocalErrorBoundary>
              </div>
            </div>
          )}

          {pendingOpportunityCreation && (
            <div className="fixed inset-0 z-[160] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold text-gray-900">New opportunity</h3>
                <p className="text-sm text-gray-500 mt-1 mb-5">Pick the task list that will be loaded into this opportunity.</p>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Task list</label>
                <select
                  autoFocus
                  value={pendingOpportunityCreation.standardId}
                  onChange={e => setPendingOpportunityCreation(current => current ? { ...current, standardId: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">Select…</option>
                  {(showHiddenTaskStandards ? (appSettings.taskStandards || []) : visibleTaskStandards(appSettings.taskStandards)).map(standard => (
                    <option key={standard.id} value={standard.id}>{standard.name} ({standard.tasks.length} tasks){standard.hidden ? ' — hidden' : ''}</option>
                  ))}
                </select>
                {(appSettings.taskStandards || []).some(standard => standard.hidden) && (
                  <label className="flex items-center gap-2 mt-2 text-xs text-gray-500 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      checked={showHiddenTaskStandards}
                      onChange={e => {
                        setShowHiddenTaskStandards(e.target.checked);
                        if (!e.target.checked) {
                          // Drop a hidden selection when the hidden lists are collapsed again.
                          setPendingOpportunityCreation(current => {
                            if (!current) return null;
                            const stillVisible = visibleTaskStandards(appSettingsRef.current.taskStandards)
                              .some(standard => standard.id === current.standardId);
                            return stillVisible ? current : { ...current, standardId: '' };
                          });
                        }
                      }}
                      className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                    />
                    Show hidden lists
                  </label>
                )}
                <div className="flex justify-end gap-2 mt-6">
                  <button onClick={() => setPendingOpportunityCreation(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600">Cancel</button>
                  <button
                    disabled={!pendingOpportunityCreation.standardId}
                    onClick={() => {
                      createOpportunity(pendingOpportunityCreation.stage, pendingOpportunityCreation.standardId);
                      setPendingOpportunityCreation(null);
                    }}
                    className="px-4 py-2 bg-[#3DCD58] hover:bg-green-600 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                  >
                    Create opportunity
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          initialSettings={{ ...appSettings, globalLabels: stableGlobalLabels }}
          opportunities={stableOpportunities}
          onOpenQuickOrganizer={() => { setShowSettings(false); setShowQuickOrganizer(true); }}
          onExportManagerReport={handleExportManagerReport}
          onRunDailyExportNow={handleRunDailyExportNow}
          managerSyncStatus={{
            lastExportDay: db.userSettings?.managerReportSync?.lastExportDay,
            lastExportedAt: db.userSettings?.managerReportSync?.lastExportedAt,
            lastError: managerSyncError,
          }}
          onStartTutorial={() => { setShowSettings(false); setShowTutorial(true); }}
        />
        {showTutorial && (
          <InteractiveTutorial
            opportunities={stableOpportunities}
            onClose={() => setShowTutorial(false)}
            onNavigate={(view) => {
              setSelectedOppId(null);
              setActiveDeepLink(null);
              startTransition(() => setCurrentView(view));
            }}
            onOpenLatestOpportunity={() => {
              const latest = stableOpportunities[0];
              if (latest) handleSelectOpp(latest.id);
            }}
            onOpenSettings={() => setShowSettings(true)}
            quickLinksCount={(appSettings.generalQuickLinks || []).length}
          />
        )}
        {showQuickOrganizer && (
          <QuickOrganizerView
            opportunities={stableOpportunities}
            reminders={stableReminders}
            userName={appSettings.userName || 'User'}
            organizerHistory={db.userSettings?.quickOrganizerHistory || []}
            organizerPreferences={db.userSettings?.quickOrganizerPreferences || { theme: 'light', displayLanguage: 'es' }}
            onOrganizerPreferencesChange={(preferences) => setDb(prev => ({ ...prev, userSettings: { ...prev.userSettings, quickOrganizerPreferences: preferences } }))}
            onSaveOrganizerRun={(run: QuickOrganizerRun) => setDb(prev => {
              const history = prev.userSettings?.quickOrganizerHistory || [];
              const next = [run, ...history.filter(item => item.id !== run.id)]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 20);
              return { ...prev, userSettings: { ...prev.userSettings, quickOrganizerHistory: next } };
            })}
            onDeleteOrganizerRun={(id) => setDb(prev => ({ ...prev, userSettings: { ...prev.userSettings, quickOrganizerHistory: (prev.userSettings?.quickOrganizerHistory || []).filter(run => run.id !== id) } }))}
            onOppUpdate={updateOpportunity}
            onAddReminder={handleAddReminder}
            onDeleteReminder={handleDeleteReminder}
            onClose={() => setShowQuickOrganizer(false)}
            onPlanAccepted={() => {
              // Land the user directly on the accepted plan: Tasks view, Agenda mode.
              setShowQuickOrganizer(false);
              setCurrentView('tasks-dashboard');
              setAgendaFocusNonce(n => n + 1);
            }}
          />
        )}
        {isDbLoaded && (
          <>
            <GeneralQuickLinksWidget
              links={db.userSettings?.generalQuickLinks || appSettings.generalQuickLinks || []}
              timerVisible={appSettings.timerEnabled !== false}
            />
            <StickyNotesWidget
              notes={db.userSettings?.stickyNotes || []}
              timerVisible={appSettings.timerEnabled !== false}
              onNotesChange={(updater) => setDb(prev => ({
                ...prev,
                userSettings: { ...prev.userSettings, stickyNotes: updater(prev.userSettings?.stickyNotes || []), stickyNotesMigrated: true },
              }))}
            />
          </>
        )}
        {appSettings.processRadialWidgetEnabled && (
          <ProcessRadialWidget
            opportunities={stableOpportunities}
            onSelectOpportunity={handleSelectOpp}
          />
        )}
        {appSettings.timerEnabled !== false && <TimerWidget onTaskClick={handleTimerTaskClick} />}

      </div>
    </TimerProvider >
  );
}

export default App;
