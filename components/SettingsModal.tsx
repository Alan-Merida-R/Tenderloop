
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, GripVertical, CheckSquare, FileText, ChevronUp, ChevronDown, RotateCcw, ArrowUpDown, Lock, Calendar, Settings, User, Search, Tag, Bell, Play, LayoutList, Copy, Activity, Mail, Sparkles } from 'lucide-react';
import { TaskStatus, TaskPriority, TaskOwner, TASK_STATUS_COLORS, PRIORITY_COLORS, OpportunityLabel, DETAILED_STATUS_COLORS, GlobalContact } from '../types';
import { MEETING_TEMPLATES } from './MeetingTemplates';
import { STANDARD_TASKS } from './StandardTasks';
import { playSound } from '../services/soundService';
import { sanitizeHtml } from '../services/sanitizeHtml';
import { SOW_TEMPLATE_HTML } from '../services/sowTemplate';
import {
  mergeEmailComposeSettings, resolveTemplates, variablesForKind,
  DEFAULT_EMAIL_TEMPLATES, DEFAULT_SUBJECT_FORMAT, DEFAULT_FULLNAME_FORMAT,
  type EmailComposeSettings, type EmailTemplate,
} from '../services/emailTemplates';

const DEFAULT_SOW_FLOW: { steps: any[]; questions: any[] } = (() => {
  try {
    const match = SOW_TEMPLATE_HTML.match(/const FLOW_DATA = (\{[\s\S]*?\});\s*\n\s*const STORAGE_KEY/);
    return match ? JSON.parse(match[1]) : { steps: [], questions: [] };
  } catch { return { steps: [], questions: [] }; }
})();

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

export type OpportunityDetailSectionKey = 'kpi' | 'history' | 'tasks' | 'commercial' | 'notes' | 'emails' | 'folder';

export const OPPORTUNITY_DETAIL_SECTIONS: { key: OpportunityDetailSectionKey; label: string; description: string }[] = [
  { key: 'kpi', label: 'KPI', description: 'Shows performance metrics, delivery dates, work calendars and area tracking for each opportunity.' },
  { key: 'history', label: 'History', description: 'Shows the chronological event log, milestones and important changes registered during the tender.' },
  { key: 'tasks', label: 'Tasks', description: 'Shows the action plan, task details, owners, dependencies, subtasks and execution schedule.' },
  { key: 'commercial', label: 'Commercial', description: 'Shows commercial sections, CQA target sell price, margins, discounts and commercial quick references.' },
  { key: 'notes', label: 'Notes', description: 'Shows meeting notes, note folders, templates, inline tasks and linked notes.' },
  { key: 'emails', label: 'Emails', description: 'Shows the email workspace for Outlook conversations, folders, labels and email links to tasks or notes.' },
  { key: 'folder', label: 'Opportunity Folder', description: 'Shows the local opportunity folder browser, linked files and document preview tools.' },
];

export const normalizeOpportunityDetailSectionOrder = (order?: OpportunityDetailSectionKey[]) => {
  const validKeys = new Set(OPPORTUNITY_DETAIL_SECTIONS.map(section => section.key));
  const ordered = (order || []).filter((key): key is OpportunityDetailSectionKey => validKeys.has(key));
  const missing = OPPORTUNITY_DETAIL_SECTIONS.map(section => section.key).filter(key => !ordered.includes(key));
  return [...ordered, ...missing];
};

export type AppViewKey = 'general-dashboard' | 'proposals-dashboard' | 'tasks-dashboard' | 'indicators-dashboard';

export const APP_VIEWS: { key: AppViewKey; label: string }[] = [
  { key: 'general-dashboard', label: 'General' },
  { key: 'proposals-dashboard', label: 'Proposals' },
  { key: 'tasks-dashboard', label: 'Tasks' },
  { key: 'indicators-dashboard', label: 'Indicators' },
];

export type OpportunityHeaderFieldKey =
  | 'address' | 'seller' | 'nextStep' | 'quoteType' | 'alias' | 'labels'
  | 'emailButton' | 'exportImport' | 'revisions' | 'exportPdf' | 'copySummary' | 'autoFillEmail' | 'delete'
  | 'principalStatus' | 'processStatus' | 'priority';

export const OPPORTUNITY_HEADER_FIELDS: { key: OpportunityHeaderFieldKey; label: string }[] = [
  { key: 'address', label: 'Address' },
  { key: 'seller', label: 'Seller' },
  { key: 'nextStep', label: 'Next Step badge' },
  { key: 'quoteType', label: 'Quote type badge' },
  { key: 'alias', label: 'Alias badge' },
  { key: 'labels', label: 'Labels' },
  { key: 'emailButton', label: 'Email button' },
  { key: 'exportImport', label: 'Export / Import buttons' },
  { key: 'revisions', label: 'Revisions button' },
  { key: 'exportPdf', label: 'Export PDF button' },
  { key: 'copySummary', label: 'Copy Summary button' },
  { key: 'autoFillEmail', label: 'Auto-fill from Email button' },
  { key: 'delete', label: 'Delete button' },
  { key: 'principalStatus', label: 'Principal Status' },
  { key: 'processStatus', label: 'Process Status' },
  { key: 'priority', label: 'Priority' },
];

export type SoundType =
  | 'beep'
  | 'chime'
  | 'bell'
  | 'alarm'
  | 'ding'
  | 'triad'
  | 'none';

export const SOUND_OPTIONS: { value: SoundType; label: string; hint: string }[] = [
  { value: 'beep', label: 'Beep (default)', hint: 'Two-tone short beep' },
  { value: 'chime', label: 'Soft chime', hint: 'Gentle C-E chord' },
  { value: 'bell', label: 'Bell', hint: 'Bright bell-like tone' },
  { value: 'alarm', label: 'Alarm', hint: 'Repeating high-pitch pulses' },
  { value: 'ding', label: 'Ding', hint: 'Single crisp ding' },
  { value: 'triad', label: 'Triad up', hint: 'C-E-G ascending' },
  { value: 'none', label: 'Silent', hint: 'No sound — notifications only' },
];

export interface AppSettings {
  defaultTasks: TaskTemplate[];
  noteTemplates: NoteTemplate[];
  holidays?: string[]; // ISO date strings YYYY-MM-DD
  trackedAreas?: string[]; // New: Areas for KPIs
  taskStandardTemplate?: import('../types').TaskStandardTemplate | null;
  globalLabels?: OpportunityLabel[];
  notificationSound?: SoundType;
  timerSound?: SoundType;
  alarms?: import('../types').AlarmConfig[];
  emailIntegrationEnabled?: boolean;
  /** Whether the "+ SOW" note-template button is available in the Notes tab. Off by default. */
  sowSectionEnabled?: boolean;
  hiddenOpportunityDetailSections?: OpportunityDetailSectionKey[];
  opportunityDetailSectionOrder?: OpportunityDetailSectionKey[];
  processRadialWidgetEnabled?: boolean;
  /** Whether the reminders bell is shown next to Settings in the top bar. Off by default. */
  remindersEnabled?: boolean;
  /** The top-level view shown when the app opens. */
  defaultStartView?: AppViewKey;
  /** Top-level views hidden from the main navigation. At least one view must stay visible. */
  hiddenViews?: AppViewKey[];
  /** Sections hidden within the Indicators view. */
  hiddenIndicatorSections?: Array<'financial' | 'monthly' | 'duration' | 'productivity' | 'longestTasks'>;
  /** Header fields hidden from the top of every opportunity detail. */
  hiddenOpportunityHeaderFields?: OpportunityHeaderFieldKey[];
  /** Whether the "Stakeholders" team button is available in the Notes tab. Off by default. */
  stakeholdersSectionEnabled?: boolean;
  /** Process board buckets hidden from the dashboard. Temporary minimization stays local to the board. */
  hiddenProposalProcessColumns?: string[];
  /** Custom colors for Process board buckets, keyed by detailed status. */
  processBoardColors?: Record<string, string>;
  /** Global variables usable across the app (e.g. the user name stamped when copying History). */
  userName?: string;
  globalContacts?: GlobalContact[];
  /** Email composer configuration: subject format, Outlook mode and template overrides/customs. */
  emailCompose?: EmailComposeSettings;
  /** Reusable SOW sections/questions shared by every opportunity. */
  globalSowForm?: { sections: any[]; questions: any[]; flowOverrides?: Record<string, any> };
}
export const DEFAULT_STAKEHOLDER_ROLES = ['CSE', 'Tender Engineer', 'TSC', 'Delivery', 'Field Services', 'FoxMass', 'Supply Chain', 'Other'];
export const DEFAULT_TRACKED_AREAS = [
  "Tendering", "Sales CSE", "TSC", "Manager", "Supply Chain", "Delivery", "Engineering of Site"
];
const DEFAULT_PROCESS_BOARD_COLORS: Record<string, string> = {
  'Working on it': '#3DCD58', 'Review': '#4D61FF', 'Info Needed': '#FF4D4D', 'Paused': '#FF8A00',
  'Approval': '#8B5CF6', 'Meeting': '#06B6D4', 'Completed': '#10B981', 'Canceled': '#6B7280',
};


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
  ],
  notificationSound: 'beep',
  timerSound: 'beep',
  emailIntegrationEnabled: false,
  sowSectionEnabled: false,
  remindersEnabled: false,
  stakeholdersSectionEnabled: false,
  hiddenOpportunityDetailSections: [],
  opportunityDetailSectionOrder: OPPORTUNITY_DETAIL_SECTIONS.map(section => section.key),
  processRadialWidgetEnabled: false,
  defaultStartView: 'general-dashboard',
  hiddenViews: ['indicators-dashboard'],
  hiddenIndicatorSections: [],
  hiddenOpportunityHeaderFields: [],
  hiddenProposalProcessColumns: [],
  processBoardColors: {},
  userName: 'User',
  globalContacts: [],
  globalSowForm: { sections: [], questions: [] },
  alarms: [
    { id: 'a1', daysThreshold: -11, color: 'bg-[repeating-linear-gradient(45deg,#ffffff,#ffffff_10px,#fecaca_10px,#fecaca_20px)] text-[#991b1b] border border-[#f87171]' },
    { id: 'a2', daysThreshold: -6, color: 'bg-purple-600 text-white shadow-md shadow-purple-200' },
    { id: 'a3', daysThreshold: -1, color: 'bg-red-500 text-white shadow-sm' },
    { id: 'a4', daysThreshold: 2, color: 'bg-orange-500 text-white shadow-sm' },
    { id: 'a5', daysThreshold: 5, color: 'bg-yellow-400 text-gray-900 shadow-sm' },
    { id: 'a6', daysThreshold: 9999, color: 'bg-[#3DCD58] text-white shadow-sm' }
  ],
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  initialSettings: AppSettings;
  opportunities: import('../types').Opportunity[];
  onOpenQuickOrganizer?: () => void;
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

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialSettings, opportunities, onOpenQuickOrganizer }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'contacts' | 'expediente' | 'tasks' | 'notes' | 'sow' | 'labels' | 'taskview' | 'alarms' | 'emailTemplates'>('general');
  const [emailTplSelectedId, setEmailTplSelectedId] = useState<string>('status_report');
  const emailBodyRef = React.useRef<HTMLTextAreaElement>(null);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [sowEditorText, setSowEditorText] = useState(() => JSON.stringify(initialSettings.globalSowForm || { sections: [], questions: [] }, null, 2));
  const [holidaysText, setHolidaysText] = useState('');
  const [trackedAreasText, setTrackedAreasText] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateMsg, setTemplateMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  // Reset internal state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSettings(initialSettings);
      setSowEditorText(JSON.stringify(initialSettings.globalSowForm || { sections: [], questions: [] }, null, 2));
      setHolidaysText((initialSettings.holidays || []).join('\n'));
      setTrackedAreasText((initialSettings.trackedAreas || DEFAULT_TRACKED_AREAS).join('\n'));
    }
  }, [isOpen, initialSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    const holidays = holidaysText.split('\n').map(l => l.trim()).filter(l => /^\d{4}-\d{2}-\d{2}$/.test(l));
    const trackedAreas = trackedAreasText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const contacts = (settings.globalContacts || []).filter(c => c.name.trim()).map(c => ({ ...c, name: c.name.trim(), email: c.email.trim(), availableRoles: c.availableRoles || [] }));
    const duplicate = contacts.find((c, index) => contacts.findIndex(other => (!!c.email && other.email.toLowerCase() === c.email.toLowerCase()) || other.name.toLowerCase() === c.name.toLowerCase()) !== index);
    if (duplicate) { alert(`Duplicate contact: ${duplicate.name}. Select the existing person instead of creating another one.`); return; }
    onSave({ ...settings, globalContacts: contacts, holidays, trackedAreas, opportunityDetailSectionOrder: normalizeOpportunityDetailSectionOrder(settings.opportunityDetailSectionOrder) });
    onClose();
  };

  const updateGlobalSowForm = (updater: (form: { sections: any[]; questions: any[]; flowOverrides?: Record<string, any> }) => { sections: any[]; questions: any[]; flowOverrides?: Record<string, any> }) => {
    setSettings(prev => ({ ...prev, globalSowForm: updater(prev.globalSowForm || { sections: [], questions: [] }) }));
  };
  const sowStepOptions = [
    ['flow_base-data', 'Step 1 — Base Data'], ['flow_commercial', 'Step 2 — Commercial'], ['flow_technical-scope', 'Step 3 — Technical Scope'], ['flow_hardware-cabinets', 'Step 4 — Hardware & Cabinets'], ['flow_services-execution', 'Step 5 — Services & Execution'], ['flow_tests-site-activities', 'Step 6 — Tests & Site Activities'], ['flow_training', 'Step 7 — Training'], ['flow_documentation-deliverables', 'Step 8 — Documentation & Deliverables'],
  ];

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

  // --- Email templates tab helpers ---
  const emailCfg = mergeEmailComposeSettings(settings.emailCompose);
  const effectiveEmailTemplates = resolveTemplates(settings.emailCompose);
  const selectedEmailTemplate = effectiveEmailTemplates.find(t => t.id === emailTplSelectedId) || effectiveEmailTemplates[0];

  const updateEmailCfg = (patch: Partial<EmailComposeSettings>) => {
    setSettings(prev => ({ ...prev, emailCompose: { ...mergeEmailComposeSettings(prev.emailCompose), ...patch } }));
  };

  const upsertEmailTemplate = (tpl: EmailTemplate) => {
    setSettings(prev => {
      const cfg = mergeEmailComposeSettings(prev.emailCompose);
      return { ...prev, emailCompose: { ...cfg, templates: [...cfg.templates.filter(t => t.id !== tpl.id), tpl] } };
    });
  };

  const patchSelectedEmailTemplate = (patch: Partial<EmailTemplate>) => {
    if (!selectedEmailTemplate) return;
    upsertEmailTemplate({ ...selectedEmailTemplate, ...patch });
  };

  /** Built-ins: drop the override so the default applies again. Customs: delete entirely. */
  const resetOrDeleteEmailTemplate = (id: string) => {
    const isBuiltIn = DEFAULT_EMAIL_TEMPLATES.some(d => d.id === id);
    if (!isBuiltIn && !confirm('Delete this custom template?')) return;
    setSettings(prev => {
      const cfg = mergeEmailComposeSettings(prev.emailCompose);
      return { ...prev, emailCompose: { ...cfg, templates: cfg.templates.filter(t => t.id !== id) } };
    });
    if (!isBuiltIn) setEmailTplSelectedId('status_report');
  };

  const addCustomEmailTemplate = () => {
    const tpl: EmailTemplate = {
      id: crypto.randomUUID(),
      kind: 'custom',
      topicLabel: 'New Template',
      bodyHtml: '<p>Hello,</p><p>Regarding <b>{fullOpportunityName}</b>...</p><p>Best regards,<br/>{userName}</p>',
      isCustom: true,
    };
    upsertEmailTemplate(tpl);
    setEmailTplSelectedId(tpl.id);
  };

  const duplicateEmailTemplate = (src: EmailTemplate) => {
    const tpl: EmailTemplate = { ...src, id: crypto.randomUUID(), kind: 'custom', topicLabel: `${src.topicLabel} (copy)`, isCustom: true };
    upsertEmailTemplate(tpl);
    setEmailTplSelectedId(tpl.id);
  };

  const insertEmailVariable = (name: string) => {
    if (!name || !selectedEmailTemplate) return;
    const token = `{${name}}`;
    const el = emailBodyRef.current;
    if (el && document.activeElement !== null) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + token + el.value.slice(end);
      patchSelectedEmailTemplate({ bodyHtml: next });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
    } else {
      patchSelectedEmailTemplate({ bodyHtml: (selectedEmailTemplate.bodyHtml || '') + token });
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
            onClick={() => setActiveTab('contacts')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'contacts' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <User className="w-4 h-4" /> Contacts
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'tasks' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <CheckSquare className="w-4 h-4" /> Default Tasks
          </button>
          <button
            onClick={() => setActiveTab('expediente')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'expediente' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutList className="w-4 h-4" /> Opportunity Detail
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'notes' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <FileText className="w-4 h-4" /> Note Templates
          </button>
          <button
            onClick={() => setActiveTab('sow')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'sow' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutList className="w-4 h-4" /> SOW Library
          </button>
          <button
            onClick={() => setActiveTab('labels')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'labels' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Tag className="w-4 h-4" /> Labels
          </button>
          <button
            onClick={() => setActiveTab('taskview')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'taskview' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutList className="w-4 h-4" /> Task Quick View
          </button>
          <button
            onClick={() => setActiveTab('alarms')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'alarms' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Bell className="w-4 h-4" /> Alarms
          </button>
          <button
            onClick={() => setActiveTab('emailTemplates')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'emailTemplates' ? 'border-[#3DCD58] text-[#3DCD58]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Mail className="w-4 h-4" /> Emails
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">

          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Global Variables</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Values reused across the app. The <b>User name</b> is stamped in brackets when you copy the History for bFO
                  (e.g. <span className="font-mono">07/02: [{(settings.userName || '').trim() || 'User'}] Comment</span>).
                </p>
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">User name</label>
                <input
                  type="text"
                  value={settings.userName ?? ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, userName: e.target.value }))}
                  className="w-full mt-1 border-gray-200 rounded-lg text-sm p-2.5 focus:border-[#3DCD58] focus:ring-0"
                  placeholder="User"
                />
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2 flex items-center gap-2"><LayoutList className="w-4 h-4 text-[#3DCD58]" /> Views</h3>
                <p className="text-xs text-gray-500 max-w-2xl mb-4">Choose which top-level views appear in the main navigation and which one opens by default when the app starts. At least one view must stay visible.</p>

                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Startup view</label>
                <select
                  value={(settings.hiddenViews || []).includes(settings.defaultStartView || 'general-dashboard') ? (APP_VIEWS.find(v => !(settings.hiddenViews || []).includes(v.key))?.key || 'general-dashboard') : (settings.defaultStartView || 'general-dashboard')}
                  onChange={(e) => setSettings(prev => ({ ...prev, defaultStartView: e.target.value as AppViewKey }))}
                  className="w-full mt-1 mb-4 border-gray-200 rounded-lg text-sm p-2.5 focus:border-[#3DCD58] focus:ring-0"
                >
                  {APP_VIEWS.filter(v => !(settings.hiddenViews || []).includes(v.key)).map(v => (
                    <option key={v.key} value={v.key}>{v.label}</option>
                  ))}
                </select>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {APP_VIEWS.map(v => {
                    const hiddenViews = settings.hiddenViews || [];
                    const isHidden = hiddenViews.includes(v.key);
                    const isLastVisible = !isHidden && hiddenViews.length === APP_VIEWS.length - 1;
                    return (
                      <label key={v.key} className={`flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 ${isLastVisible ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`} title={isLastVisible ? 'At least one view must stay visible' : undefined}>
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          disabled={isLastVisible}
                          onChange={() => setSettings(prev => {
                            const hidden = new Set(prev.hiddenViews || []);
                            if (hidden.has(v.key)) hidden.delete(v.key); else hidden.add(v.key);
                            const nextHidden = [...hidden];
                            const nextDefault = nextHidden.includes(prev.defaultStartView || 'general-dashboard')
                              ? APP_VIEWS.find(view => !nextHidden.includes(view.key))?.key
                              : prev.defaultStartView;
                            return { ...prev, hiddenViews: nextHidden, defaultStartView: nextDefault };
                          })}
                          className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                        />
                        <span>{v.label}</span>
                      </label>
                    );
                  })}
                </div>

                {!(settings.hiddenViews || []).includes('indicators-dashboard') && (
                  <>
                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mt-5 mb-2">Indicators sections</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        ['financial', 'Financial summary'], ['monthly', 'Monthly SRs'], ['duration', 'Opportunity duration'], ['productivity', 'Productivity'], ['longestTasks', 'Longest timer tasks'],
                      ].map(([key, label]) => {
                        const isHidden = (settings.hiddenIndicatorSections || []).includes(key as any);
                        return <label key={key} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50"><input type="checkbox" checked={!isHidden} onChange={() => setSettings(prev => { const hidden = new Set(prev.hiddenIndicatorSections || []); if (hidden.has(key as any)) hidden.delete(key as any); else hidden.add(key as any); return { ...prev, hiddenIndicatorSections: [...hidden] as AppSettings['hiddenIndicatorSections'] }; })} className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"/><span>{label}</span></label>;
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[#3DCD58]" /> Process Radial Widget
                    </h3>
                    <p className="text-xs text-gray-500 max-w-2xl">
                      Shows In Progress and On Hold opportunities as radial time indicators. The widget can stay inside the app or open as a small floating browser window.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, processRadialWidgetEnabled: !prev.processRadialWidgetEnabled }))}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${settings.processRadialWidgetEnabled ? 'bg-[#3DCD58]' : 'bg-gray-300'}`}
                    title="Toggle process radial widget"
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.processRadialWidgetEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className={`mt-4 rounded-lg border px-3 py-2 text-xs font-medium ${settings.processRadialWidgetEnabled ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                  {settings.processRadialWidgetEnabled
                    ? 'Enabled. The radial widget appears in the app with a pop-out control.'
                    : 'Disabled. Turn it on to monitor active opportunity timelines.'}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#3DCD58]" /> Reminders
                    </h3>
                    <p className="text-xs text-gray-500 max-w-2xl">
                      Show a bell in the top bar to schedule reminders, standalone or linked to a task.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, remindersEnabled: !prev.remindersEnabled }))}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${settings.remindersEnabled ? 'bg-[#3DCD58]' : 'bg-gray-300'}`}
                    title="Toggle reminders bell"
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.remindersEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className={`mt-4 rounded-lg border px-3 py-2 text-xs font-medium ${settings.remindersEnabled ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                  {settings.remindersEnabled
                    ? 'Enabled. The reminders bell appears next to Settings in the top bar.'
                    : 'Disabled. Turn it on to schedule reminders.'}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2 flex items-center gap-2"><LayoutList className="w-4 h-4 text-[#3DCD58]" /> Process Board Columns</h3>
                <p className="text-xs text-gray-500 mb-4">Choose the process buckets to hide and customize their header colors in the Proposals dashboard. Hidden buckets remain available in the data and can be restored here.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.keys(DETAILED_STATUS_COLORS).filter(status => !['No Status', 'Waiting'].includes(status)).map(status => {
                    const isHidden = (settings.hiddenProposalProcessColumns || []).includes(status);
                    return (
                      <label key={status} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={isHidden}
                          onChange={() => setSettings(prev => {
                            const hidden = new Set(prev.hiddenProposalProcessColumns || []);
                            if (hidden.has(status)) hidden.delete(status);
                            else hidden.add(status);
                            return { ...prev, hiddenProposalProcessColumns: [...hidden] };
                          })}
                          className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                        />
                        <span className="flex-1">Hide {status}</span>
                        <input
                          type="color"
                          value={(settings.processBoardColors || {})[status] || DEFAULT_PROCESS_BOARD_COLORS[status] || '#6B7280'}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setSettings(prev => ({ ...prev, processBoardColors: { ...(prev.processBoardColors || {}), [status]: event.target.value } }))}
                          className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                          title={`Color for ${status}`}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

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

              {/* SOUNDS */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                  <Bell className="w-4 h-4" /> Sounds
                </h3>
                <p className="text-xs text-gray-500">
                  Choose the audible cue used for browser notifications and for timer / pomodoro phase changes. Click <b>Preview</b> to hear each option.
                </p>
                {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    <span className="font-bold">⚠ Browser notifications are BLOCKED.</span>
                    <span>Go to your browser settings → Site permissions → Notifications → allow this site.</span>
                  </div>
                )}
                {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
                  <button
                    type="button"
                    onClick={() => Notification.requestPermission()}
                    className="w-full py-1.5 bg-[#3DCD58]/10 border border-[#3DCD58]/30 text-[#3DCD58] text-xs font-bold rounded-lg hover:bg-[#3DCD58]/20 transition-colors"
                  >
                    Enable browser notifications for schedule alerts
                  </button>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Notification sound</label>
                    <div className="flex gap-2">
                      <select
                        value={settings.notificationSound || 'ding'}
                        onChange={(e) => setSettings(prev => ({ ...prev, notificationSound: e.target.value as SoundType }))}
                        className="flex-1 border border-gray-200 rounded-lg text-sm p-2 focus:border-[#3DCD58] focus:ring-0"
                      >
                        {SOUND_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => playSound(settings.notificationSound || 'ding')}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1"
                        title="Preview"
                      >
                        <Play className="w-3 h-3" /> Preview
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {SOUND_OPTIONS.find(o => o.value === (settings.notificationSound || 'ding'))?.hint}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Timer sound</label>
                    <div className="flex gap-2">
                      <select
                        value={settings.timerSound || 'beep'}
                        onChange={(e) => setSettings(prev => ({ ...prev, timerSound: e.target.value as SoundType }))}
                        className="flex-1 border border-gray-200 rounded-lg text-sm p-2 focus:border-[#3DCD58] focus:ring-0"
                      >
                        {SOUND_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => playSound(settings.timerSound || 'beep')}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1"
                        title="Preview"
                      >
                        <Play className="w-3 h-3" /> Preview
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {SOUND_OPTIONS.find(o => o.value === (settings.timerSound || 'beep'))?.hint}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contacts' && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div><h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Global Contact Directory</h3><p className="text-xs text-gray-500 mt-1">Used for autocomplete. Opportunity roles are selected independently.</p></div>
                <button type="button" onClick={() => setSettings(prev => ({ ...prev, globalContacts: [...(prev.globalContacts || []), { id: crypto.randomUUID(), name: '', email: '', availableRoles: [] }] }))} className="px-3 py-2 rounded-lg bg-[#3DCD58] text-white text-xs font-bold flex items-center gap-1"><Plus className="w-3 h-3" /> Add contact</button>
              </div>
              <datalist id="global-contact-name-options">{(settings.globalContacts || []).filter(c => c.name).map(c => <option key={c.id} value={c.name}>{c.email}</option>)}</datalist>
              {(settings.globalContacts || []).map(contact => (
                <div key={contact.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr_auto] gap-2 items-start p-3 rounded-xl border border-gray-200 bg-gray-50">
                  <input list="global-contact-name-options" value={contact.name} onChange={e => setSettings(prev => ({ ...prev, globalContacts: (prev.globalContacts || []).map(c => c.id === contact.id ? { ...c, name: e.target.value } : c) }))} placeholder="Search or enter name" className="border-gray-200 rounded-lg text-sm" />
                  <input type="email" value={contact.email} onChange={e => setSettings(prev => ({ ...prev, globalContacts: (prev.globalContacts || []).map(c => c.id === contact.id ? { ...c, email: e.target.value } : c) }))} placeholder="Email (unique)" className="border-gray-200 rounded-lg text-sm" />
                  <div className="flex gap-1"><div className="flex-1"><SimpleMultiSelect options={trackedAreasText.split('\n').map(v => v.trim()).filter(Boolean).map(area => ({ id: area, label: area }))} selected={contact.availableRoles || []} onChange={roles => setSettings(prev => ({ ...prev, globalContacts: (prev.globalContacts || []).map(c => c.id === contact.id ? { ...c, availableRoles: roles } : c) }))} placeholder="Select roles / areas" /></div><button type="button" onClick={() => { const area = prompt('New tracked area / role:')?.trim(); if (!area) return; const current = trackedAreasText.split('\n').map(v => v.trim()).filter(Boolean); if (!current.some(v => v.toLowerCase() === area.toLowerCase())) setTrackedAreasText([...current, area].join('\n')); setSettings(prev => ({ ...prev, globalContacts: (prev.globalContacts || []).map(c => c.id === contact.id ? { ...c, availableRoles: Array.from(new Set([...(c.availableRoles || []), area])) } : c) })); }} className="px-2 rounded border border-gray-200 bg-white text-blue-600 font-bold" title="Create tracked area">+</button></div>
                  <button type="button" onClick={() => setSettings(prev => ({ ...prev, globalContacts: (prev.globalContacts || []).filter(c => c.id !== contact.id) }))} className="p-2 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  <input key={`aliases-${contact.id}`} defaultValue={(contact.aliases || []).join('; ')} onBlur={e => { const aliases = e.target.value.split(';').map(v => v.trim()).filter(Boolean); setSettings(prev => ({ ...prev, globalContacts: (prev.globalContacts || []).map(c => c.id === contact.id ? { ...c, aliases } : c) })); }} placeholder="Aliases (semicolon-separated), e.g. Bob; Roberto GM" className="border-gray-200 rounded-lg text-xs md:col-span-4" />
                </div>
              ))}
              {(settings.globalContacts || []).length === 0 && <div className="text-center text-xs text-gray-400 py-8">No contacts yet.</div>}
            </div>
          )}

          {/* OPPORTUNITY DETAIL TAB */}
          {activeTab === 'expediente' && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <LayoutList className="w-4 h-4 text-[#3DCD58]" /> Opportunity Detail Sections
                    </h3>
                    <p className="text-xs text-gray-500 max-w-2xl">
                      Choose which sheets appear inside every opportunity detail. These settings apply to every opportunity and stay saved after reloading the page.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      hiddenOpportunityDetailSections: [],
                      emailIntegrationEnabled: true,
                      opportunityDetailSectionOrder: OPPORTUNITY_DETAIL_SECTIONS.map(section => section.key)
                    }))}
                    className="text-[10px] font-bold text-gray-400 hover:text-[#3DCD58] uppercase flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50"
                  >
                    <RotateCcw className="w-3 h-3" /> Show all
                  </button>
                </div>

                <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-gray-800">Overview</p>
                      <p className="text-xs text-gray-500 max-w-2xl">
                        Main opportunity sheet with title, customer, status, quick links, key dates and the high-level opportunity summary.
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase text-[#3DCD58] bg-white border border-emerald-100 px-2 py-1 rounded-lg shrink-0">Always visible</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {normalizeOpportunityDetailSectionOrder(settings.opportunityDetailSectionOrder).map((sectionKey, index, orderedKeys) => {
                    const section = OPPORTUNITY_DETAIL_SECTIONS.find(item => item.key === sectionKey);
                    if (!section) return null;
                    const sectionHidden = (settings.hiddenOpportunityDetailSections || []).includes(section.key);
                    const enabled = section.key === 'emails'
                      ? !!settings.emailIntegrationEnabled && !sectionHidden
                      : !sectionHidden;
                    return (
                      <div key={section.key} className={`rounded-xl border p-4 transition-all ${enabled ? 'bg-white border-emerald-100 shadow-sm' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="flex flex-col gap-1 pt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (index === 0) return;
                                  const next = [...orderedKeys];
                                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                  setSettings({ ...settings, opportunityDetailSectionOrder: next });
                                }}
                                disabled={index === 0}
                                className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:hover:text-gray-300"
                                title="Move up"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (index === orderedKeys.length - 1) return;
                                  const next = [...orderedKeys];
                                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                  setSettings({ ...settings, opportunityDetailSectionOrder: next });
                                }}
                                disabled={index === orderedKeys.length - 1}
                                className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:hover:text-gray-300"
                                title="Move down"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-gray-400 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">#{index + 2}</span>
                                <p className="text-sm font-black text-gray-800">{section.label}</p>
                              </div>
                              <p className="text-xs text-gray-500 leading-snug max-w-2xl mt-1">{section.description}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                            const current = settings.hiddenOpportunityDetailSections || [];
                              const next = enabled
                                ? Array.from(new Set([...current, section.key]))
                                : current.filter(key => key !== section.key);
                              setSettings({
                                ...settings,
                                hiddenOpportunityDetailSections: next,
                                ...(section.key === 'emails' ? { emailIntegrationEnabled: !enabled } : {})
                              });
                            }}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-[#3DCD58]' : 'bg-gray-300'}`}
                            title={`Toggle ${section.label}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <div className={`mt-4 rounded-lg border px-3 py-2 text-xs font-medium ${enabled ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                          {enabled
                            ? `${section.label} is visible in every opportunity detail.`
                            : `${section.label} is hidden in every opportunity detail.`}
                          {section.key === 'emails' && (
                            <span> Email folders, labels, conversation references and linked emails remain saved while hidden.</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <LayoutList className="w-4 h-4 text-[#3DCD58]" /> Header Fields
                    </h3>
                    <p className="text-xs text-gray-500 max-w-2xl">
                      Choose which fields and buttons appear at the top of every opportunity (Overview header). Hidden fields free up space and the remaining ones re-flow automatically.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, hiddenOpportunityHeaderFields: [] }))}
                    className="text-[10px] font-bold text-gray-400 hover:text-[#3DCD58] uppercase flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" /> Show all
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {OPPORTUNITY_HEADER_FIELDS.map(field => {
                    const isHidden = (settings.hiddenOpportunityHeaderFields || []).includes(field.key);
                    return (
                      <label key={field.key} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() => setSettings(prev => {
                            const hidden = new Set(prev.hiddenOpportunityHeaderFields || []);
                            if (hidden.has(field.key)) hidden.delete(field.key); else hidden.add(field.key);
                            return { ...prev, hiddenOpportunityHeaderFields: [...hidden] };
                          })}
                          className="rounded border-gray-300 text-[#3DCD58] focus:ring-[#3DCD58]"
                        />
                        <span>{field.label}</span>
                      </label>
                    );
                  })}
                </div>
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

              <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-4">
                <div>
                  <p className="text-sm font-bold text-gray-800">SOW Section</p>
                  <p className="text-xs text-gray-500">Show the "+ SOW" button next to the note templates so users can add the Scope of Work guided form.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.sowSectionEnabled || false}
                    onChange={e => setSettings(prev => ({ ...prev, sowSectionEnabled: e.target.checked }))}
                    className="rounded text-[#3DCD58] focus:ring-[#3DCD58]"
                  />
                  <span className="text-xs font-medium text-gray-600">Enabled</span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-4">
                <div>
                  <p className="text-sm font-bold text-gray-800">Stakeholders</p>
                  <p className="text-xs text-gray-500">Show the "Stakeholders" button next to the note templates so users can open the opportunity team panel.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.stakeholdersSectionEnabled || false}
                    onChange={e => setSettings(prev => ({ ...prev, stakeholdersSectionEnabled: e.target.checked }))}
                    className="rounded text-[#3DCD58] focus:ring-[#3DCD58]"
                  />
                  <span className="text-xs font-medium text-gray-600">Enabled</span>
                </label>
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

          {activeTab === 'sow' && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2"><LayoutList className="w-4 h-4" /> Global SOW question library</h3>
                  <p className="text-xs text-gray-500 mt-1">Create reusable questions once and use them in every SOW. Pick the Step where it belongs, its answer type, responsible area, and whether it is mandatory.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className="px-3 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 rounded-lg" onClick={() => {
                    const question = { id: `GQ-${Date.now()}`, key: `global_q_${Date.now()}`, sectionId: 'flow_commercial', label: 'New question', type: 'text', options: [], required: false, subsection: '', owner: '', help: '', output: '', logic: null };
                    updateGlobalSowForm(form => ({ ...form, questions: [...form.questions, question] }));
                  }}><Plus className="w-3.5 h-3.5 inline mr-1" /> Add question</button>
                  <button type="button" className="px-3 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 rounded-lg" onClick={() => updateGlobalSowForm(form => ({ ...form, sections: [...form.sections, { id: `global_section_${Date.now()}`, title: 'New section', color: '#2c7be5', description: '', logic: null }] }))}><Plus className="w-3.5 h-3.5 inline mr-1" /> Add section</button>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                  <h4 className="text-sm font-bold text-emerald-900">Default Steps and questions</h4>
                  <p className="text-xs text-emerald-800">These are the built-in questions. Any edit below becomes a global override and is applied in every SOW. You can change the wording, answer type, options, required status, owner, subsection and visibility relationship.</p>
                </div>
                <div className="space-y-2">
                  {DEFAULT_SOW_FLOW.steps.map(step => <details key={step.Section} className="border border-gray-200 rounded-xl bg-white" open={false}>
                    <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-gray-800">Step {step.Step} — {step.Section} <span className="ml-2 text-xs font-normal text-gray-500">({DEFAULT_SOW_FLOW.questions.filter(q => q.section === step.Section).length} questions)</span></summary>
                    <div className="p-3 pt-0 space-y-3">{DEFAULT_SOW_FLOW.questions.filter(q => q.section === step.Section).map(base => {
                      const question = { ...base, ...((settings.globalSowForm as any)?.flowOverrides?.[base.key] || {}) };
                      const saveOverride = (patch: any) => updateGlobalSowForm(form => ({ ...form, flowOverrides: { ...(form.flowOverrides || {}), [base.key]: { ...base, ...((form.flowOverrides || {})[base.key] || {}), ...patch } } }));
                      const logic = question.logic || null;
                      return <div key={base.key} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
                        <div className="flex items-center gap-2"><span className="text-[10px] font-mono font-bold text-gray-400">{base.id}</span><input value={question.label || ''} onChange={e => saveOverride({ label: e.target.value })} className="flex-1 text-sm font-semibold border-gray-200 rounded-lg" /><button type="button" className="text-[10px] text-gray-500 hover:text-red-600" onClick={() => updateGlobalSowForm(form => { const overrides = { ...(form.flowOverrides || {}) }; delete overrides[base.key]; return { ...form, flowOverrides: overrides }; })}>Reset</button></div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2"><select value={question.type || 'text'} onChange={e => saveOverride({ type: e.target.value })} className="text-xs border-gray-200 rounded-lg">{['text','long_text','number','currency','date','boolean','single_select','multi_select','checkbox','link'].map(type => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select><select value={question.owner || ''} onChange={e => saveOverride({ owner: e.target.value })} className="text-xs border-gray-200 rounded-lg"><option value="">Responsible area</option>{(settings.trackedAreas || DEFAULT_TRACKED_AREAS).map(area => <option key={area}>{area}</option>)}</select><input value={question.subsection || ''} onChange={e => saveOverride({ subsection: e.target.value })} className="text-xs border-gray-200 rounded-lg" placeholder="Subsection" /><label className="flex items-center gap-2 text-xs px-2"><input type="checkbox" checked={!!question.required} onChange={e => saveOverride({ required: e.target.checked })} /> Required</label></div>
                        {['single_select','multi_select'].includes(question.type) && <textarea value={(question.options || []).join('\n')} onChange={e => saveOverride({ options: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) })} className="w-full text-xs border-gray-200 rounded-lg" placeholder="Options — one per line" />}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border-t border-gray-200 pt-2"><select value={logic?.source || ''} onChange={e => saveOverride({ logic: e.target.value ? { op: logic?.op || 'equals', source: e.target.value, value: logic?.value || '' } : null })} className="text-xs border-gray-200 rounded-lg"><option value="">Always visible (no relationship)</option>{DEFAULT_SOW_FLOW.questions.filter(q => q.key !== base.key).map(q => <option key={q.key} value={q.key}>{q.id} — {q.label}</option>)}</select><select disabled={!logic} value={logic?.op || 'equals'} onChange={e => saveOverride({ logic: { ...(logic || {}), op: e.target.value } })} className="text-xs border-gray-200 rounded-lg"><option value="equals">Equals</option><option value="includes">Includes</option><option value="includes_any">Includes any</option><option value="has_value">Has any answer</option><option value="is_empty">Is empty</option></select><input disabled={!logic || ['has_value','is_empty'].includes(logic?.op)} value={Array.isArray(logic?.value) ? logic.value.join(', ') : logic?.value || ''} onChange={e => saveOverride({ logic: { ...(logic || {}), value: logic?.op === 'includes_any' ? e.target.value.split(',').map(v => v.trim()).filter(Boolean) : e.target.value } })} className="text-xs border-gray-200 rounded-lg" placeholder="Expected answer, e.g. Modicon" /></div>
                      </div>;
                    })}</div>
                  </details>)}
                </div>
                <div className="space-y-3">
                  {(settings.globalSowForm?.sections || []).map(section => <div key={section.id} className="border border-blue-100 bg-blue-50/40 rounded-xl p-4 grid gap-3">
                    <div className="flex gap-2"><input value={section.title} onChange={e => updateGlobalSowForm(form => ({ ...form, sections: form.sections.map(s => s.id === section.id ? { ...s, title: e.target.value } : s) }))} className="flex-1 text-sm font-bold border-gray-200 rounded-lg" placeholder="Section title" /><button type="button" onClick={() => updateGlobalSowForm(form => ({ ...form, sections: form.sections.filter(s => s.id !== section.id), questions: form.questions.filter(q => q.sectionId !== section.id) }))} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div>
                    <input value={section.description || ''} onChange={e => updateGlobalSowForm(form => ({ ...form, sections: form.sections.map(s => s.id === section.id ? { ...s, description: e.target.value } : s) }))} className="text-xs border-gray-200 rounded-lg" placeholder="Short instructions for this section" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2"><select value={section.logic?.source || ''} onChange={e => updateGlobalSowForm(form => ({ ...form, sections: form.sections.map(s => s.id === section.id ? { ...s, logic: e.target.value ? { op: 'includes', source: e.target.value, value: s.logic?.value || 'Modicon' } : null } : s) }))} className="text-xs border-gray-200 rounded-lg"><option value="">Always show this section</option><option value="flow_T001">Show when a system is selected</option><option value="flow_B008">Show when opportunity type is selected</option></select><select value={section.logic?.op || 'includes'} disabled={!section.logic} onChange={e => updateGlobalSowForm(form => ({ ...form, sections: form.sections.map(s => s.id === section.id && s.logic ? { ...s, logic: { ...s.logic, op: e.target.value } } : s) }))} className="text-xs border-gray-200 rounded-lg"><option value="includes">Includes</option><option value="equals">Equals</option><option value="has_value">Has any answer</option></select><input disabled={!section.logic || section.logic?.op === 'has_value'} value={section.logic?.value || ''} onChange={e => updateGlobalSowForm(form => ({ ...form, sections: form.sections.map(s => s.id === section.id && s.logic ? { ...s, logic: { ...s.logic, value: e.target.value } } : s) }))} className="text-xs border-gray-200 rounded-lg" placeholder="Example: Modicon" /></div>
                    <p className="text-[11px] text-blue-700">Example: select “Show when a system is selected” + Includes + Modicon to hide the whole section until Modicon is selected.</p>
                  </div>)}
                  {(settings.globalSowForm?.questions || []).map(question => <div key={question.key} className="border border-gray-200 rounded-xl p-4 space-y-3">
                    <div className="flex gap-2"><input value={question.label} onChange={e => updateGlobalSowForm(form => ({ ...form, questions: form.questions.map(q => q.key === question.key ? { ...q, label: e.target.value } : q) }))} className="flex-1 text-sm font-semibold border-gray-200 rounded-lg" placeholder="Question" /><button type="button" onClick={() => updateGlobalSowForm(form => ({ ...form, questions: form.questions.filter(q => q.key !== question.key) }))} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2"><select value={question.sectionId} onChange={e => updateGlobalSowForm(form => ({ ...form, questions: form.questions.map(q => q.key === question.key ? { ...q, sectionId: e.target.value } : q) }))} className="text-xs border-gray-200 rounded-lg"><optgroup label="Steps">{sowStepOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup><optgroup label="Custom sections">{(settings.globalSowForm?.sections || []).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</optgroup></select><select value={question.type} onChange={e => updateGlobalSowForm(form => ({ ...form, questions: form.questions.map(q => q.key === question.key ? { ...q, type: e.target.value } : q) }))} className="text-xs border-gray-200 rounded-lg">{['text','long_text','number','currency','date','boolean','single_select','multi_select','checkbox','link'].map(type => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select><select value={question.owner || ''} onChange={e => updateGlobalSowForm(form => ({ ...form, questions: form.questions.map(q => q.key === question.key ? { ...q, owner: e.target.value } : q) }))} className="text-xs border-gray-200 rounded-lg"><option value="">Responsible area</option>{(settings.trackedAreas || DEFAULT_TRACKED_AREAS).map(area => <option key={area}>{area}</option>)}</select></div>
                    {['single_select', 'multi_select'].includes(question.type) && <textarea value={(question.options || []).join('\n')} onChange={e => updateGlobalSowForm(form => ({ ...form, questions: form.questions.map(q => q.key === question.key ? { ...q, options: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) } : q) }))} className="w-full text-xs border-gray-200 rounded-lg" placeholder="Options — one per line" />}
                    <div className="flex flex-wrap items-center gap-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={!!question.required} onChange={e => updateGlobalSowForm(form => ({ ...form, questions: form.questions.map(q => q.key === question.key ? { ...q, required: e.target.checked } : q) }))} /> Required answer</label><input value={question.subsection || ''} onChange={e => updateGlobalSowForm(form => ({ ...form, questions: form.questions.map(q => q.key === question.key ? { ...q, subsection: e.target.value } : q) }))} className="text-xs border-gray-200 rounded-lg" placeholder="Subsection (optional)" /></div>
                    <p className="text-[11px] text-gray-500">To add a dependency: open any SOW → Design questions → Edit this question → add “Show this question when”. You can use answers such as System offered = Modicon.</p>
                  </div>)}
                </div>
                {!settings.globalSowForm?.questions?.length && !settings.globalSowForm?.sections?.length && <p className="text-xs text-gray-500 text-center py-8">Start with “Add question”. Use a custom section when the question group does not belong to one of the eight Steps.</p>}
              </div>
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

          {/* TASK QUICK VIEW TAB */}
          {activeTab === 'taskview' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="w-14 h-14 rounded-2xl bg-[#3DCD58] flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <LayoutList className="w-7 h-7 text-white" />
              </div>
              <div className="text-center max-w-sm">
                <h3 className="text-sm font-black text-gray-800">Quick Organizer</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Opens a full-screen assistant that builds an AI-ready prompt from your pending
                  tasks, then applies the AI's scheduling reply straight into your Schedule and
                  Reminders.
                </p>
              </div>
              <button
                onClick={() => onOpenQuickOrganizer?.()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-[#3DCD58] text-white rounded-xl hover:bg-[#34b34c] transition-colors"
              >
                <Sparkles className="w-4 h-4" /> Open Quick Organizer
              </button>
            </div>
          )}

          {/* ALARMS TAB */}
          {activeTab === 'alarms' && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2"><Bell className="w-4 h-4" /> Expected Date Alarms</h3>
                    <p className="text-xs text-gray-500">Configure the threshold days and colors for opportunity expected dates. Ordered automatically by threshold.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(() => {
                    const activeAlarms = settings.alarms && settings.alarms.length > 0 ? settings.alarms : DEFAULT_SETTINGS.alarms;
                    return ([...activeAlarms].sort((a, b) => a.daysThreshold - b.daysThreshold)).map((alarm) => (
                    <div key={alarm.id} className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg hover:bg-gray-50">
                      <div className="flex flex-col w-32">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Days Left</label>
                        <input
                          type="number"
                          value={alarm.daysThreshold}
                          onChange={(e) => {
                            const newAlarms = activeAlarms.map(a => 
                              a.id === alarm.id ? { ...a, daysThreshold: parseInt(e.target.value) || 0 } : a
                            );
                            setSettings({ ...settings, alarms: newAlarms });
                          }}
                          className="w-full text-sm font-bold text-gray-700 border border-gray-200 rounded p-1.5 focus:border-[#3DCD58] focus:ring-0"
                          title="If days left is less than or equal to this value, this alarm applies."
                        />
                      </div>
                      <div className="flex-1 flex flex-col min-w-[200px]">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">CSS Classes (Legacy)</label>
                        <input
                          type="text"
                          value={alarm.color}
                          onChange={(e) => {
                            const newAlarms = activeAlarms.map(a => 
                              a.id === alarm.id ? { ...a, color: e.target.value } : a
                            );
                            setSettings({ ...settings, alarms: newAlarms });
                          }}
                          className="w-full text-sm font-medium text-gray-700 border border-gray-200 rounded p-1.5 focus:border-[#3DCD58] focus:ring-0"
                          placeholder="bg-red-500 text-white"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Bg Color</label>
                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200 mt-1 cursor-pointer">
                          <input
                            type="color"
                            value={alarm.backgroundColor || '#ffffff'}
                            onChange={(e) => {
                              const newAlarms = activeAlarms.map(a => 
                                a.id === alarm.id ? { ...a, backgroundColor: e.target.value } : a
                              );
                              setSettings({ ...settings, alarms: newAlarms });
                            }}
                            className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Text Color</label>
                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200 mt-1 cursor-pointer">
                          <input
                            type="color"
                            value={alarm.textColor || '#ffffff'}
                            onChange={(e) => {
                              const newAlarms = activeAlarms.map(a => 
                                a.id === alarm.id ? { ...a, textColor: e.target.value } : a
                              );
                              setSettings({ ...settings, alarms: newAlarms });
                            }}
                            className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-end h-full pt-4">
                        <button
                          onClick={() => {
                            const newAlarms = activeAlarms.filter(a => a.id !== alarm.id);
                            setSettings({ ...settings, alarms: newAlarms });
                          }}
                          className="p-2 text-gray-300 hover:text-red-500 rounded hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ));
                  })()}
                </div>

                <button
                  onClick={() => {
                    const activeAlarms = settings.alarms && settings.alarms.length > 0 ? settings.alarms : DEFAULT_SETTINGS.alarms;
                    const newAlarm = { id: crypto.randomUUID(), daysThreshold: 0, color: 'bg-gray-100 text-gray-800' };
                    setSettings({ ...settings, alarms: [...activeAlarms, newAlarm] });
                  }}
                  className="w-full mt-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold hover:border-[#3DCD58] hover:text-[#3DCD58] transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Alarm
                </button>
              </div>
            </div>
          )}

          {activeTab === 'emailTemplates' && (
            <div className="space-y-6">
              {/* Formats & mode */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2"><Mail className="w-4 h-4" /> Email Composer</h3>
                  <p className="text-xs text-gray-500">Drafts always open in Outlook for you to review — nothing is sent automatically.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase">Subject format</label>
                    <input
                      value={emailCfg.subjectFormat}
                      onChange={e => updateEmailCfg({ subjectFormat: e.target.value })}
                      placeholder={DEFAULT_SUBJECT_FORMAT}
                      className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1 font-mono"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Use {'{topic}'} and {'{fullOpportunityName}'}.</p>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase">Full opportunity name format</label>
                    <input
                      value={emailCfg.fullNameFormat}
                      onChange={e => updateEmailCfg({ fullNameFormat: e.target.value })}
                      placeholder={DEFAULT_FULLNAME_FORMAT}
                      className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1 font-mono"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Use {'{opId}'}, {'{customer}'}, {'{projectTitle}'}, {'{alias}'}, {'{srId}'}, {'{revision}'}.</p>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase">Outlook mode</label>
                    <select
                      value={emailCfg.outlookMode}
                      onChange={e => updateEmailCfg({ outlookMode: e.target.value as EmailComposeSettings['outlookMode'] })}
                      className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1"
                    >
                      <option value="auto">Auto (recommended — detects classic vs. new Outlook)</option>
                      <option value="com">Force Classic Outlook (COM)</option>
                      <option value="eml">Force .eml file (new Outlook compatible)</option>
                    </select>
                    <p className="text-[10px] text-gray-400 mt-0.5">"Auto" automatically uses full COM functionality on classic Outlook, and the safe .eml method on the new Outlook — no sign-in prompts either way.</p>
                  </div>
                </div>
              </div>

              {/* Template manager */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Templates</h3>
                    <p className="text-xs text-gray-500">Edit any template or create your own — changes apply the next time you compose an email.</p>
                  </div>
                  <button onClick={addCustomEmailTemplate} className="text-xs font-bold bg-[#3DCD58] text-white px-3 py-1.5 rounded-lg hover:bg-[#2db64a] flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add template</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {effectiveEmailTemplates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setEmailTplSelectedId(t.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${selectedEmailTemplate?.id === t.id ? 'bg-[#3DCD58] border-[#3DCD58] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-[#3DCD58]'}`}
                    >
                      {t.topicLabel}{t.isCustom ? ' ✳' : ''}
                    </button>
                  ))}
                </div>

                {selectedEmailTemplate && (
                  <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Topic label ({'{topic}'} in the subject)</label>
                        <input
                          value={selectedEmailTemplate.topicLabel}
                          onChange={e => patchSelectedEmailTemplate({ topicLabel: e.target.value })}
                          className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Subject override (optional)</label>
                        <input
                          value={selectedEmailTemplate.subjectFormat || ''}
                          onChange={e => patchSelectedEmailTemplate({ subjectFormat: e.target.value || undefined })}
                          placeholder={`Global: ${emailCfg.subjectFormat}`}
                          className="w-full text-xs border-gray-200 rounded-lg bg-white mt-1 font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Body (HTML with {'{variables}'})</label>
                        <select
                          value=""
                          onChange={e => { insertEmailVariable(e.target.value); e.currentTarget.value = ''; }}
                          className="text-[10px] border-gray-200 rounded bg-white max-w-[260px]"
                        >
                          <option value="">Insert variable...</option>
                          {variablesForKind(selectedEmailTemplate.kind).map(v => (
                            <option key={v.name} value={v.name}>{`{${v.name}} — ${v.description}`}</option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        ref={emailBodyRef}
                        value={selectedEmailTemplate.bodyHtml}
                        onChange={e => patchSelectedEmailTemplate({ bodyHtml: e.target.value })}
                        rows={10}
                        spellCheck={false}
                        className="w-full text-[11px] font-mono border-gray-200 rounded-lg bg-white leading-relaxed"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <button onClick={() => duplicateEmailTemplate(selectedEmailTemplate)} className="text-xs font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Duplicate</button>
                        {selectedEmailTemplate.isCustom ? (
                          <button onClick={() => resetOrDeleteEmailTemplate(selectedEmailTemplate.id)} className="text-xs font-bold text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                        ) : (
                          <button onClick={() => resetOrDeleteEmailTemplate(selectedEmailTemplate.id)} className="text-xs font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Reset to default</button>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400">{selectedEmailTemplate.isCustom ? 'Custom template' : 'Built-in template'}</span>
                    </div>
                    {/* Static preview */}
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Preview (raw variables)</label>
                      <div
                        className="mt-1 bg-white border border-gray-200 rounded-lg p-3 text-xs max-h-48 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEmailTemplate.bodyHtml) }}
                      />
                    </div>
                  </div>
                )}
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
