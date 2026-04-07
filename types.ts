
export type ProcessStage =
  | '1. Intake'
  | '2. Technical Analysis'
  | '3. Architecture'
  | '4. Basket/BOM'
  | '5. Costing'
  | '6. Proposal'
  | '7. Validation'
  | '8. Delivery/Support'
  | '9. Won/Lost';

export type TaskStatus = 'Pending' | 'In Progress' | 'Done' | 'On Hold' | 'Missing Info' | 'Canceled';
export type TaskOwner = 'Me' | 'External Area';
export type ExternalArea = 'Delivery' | 'SCM' | 'Sales' | 'Legal' | 'Finance' | 'TSC' | 'Other' | string;
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type OpportunityStatus = 'In Progress' | 'On Hold' | 'Submitted' | 'Won' | 'Lost' | 'Canceled';
export type DetailedStatus = 'Working on it' | 'Review' | 'Info Needed' | 'Paused' | 'Approval' | 'Meeting' | 'Completed' | 'Canceled';

export interface DeepLink {
  tab: string;
  taskId?: string;
  noteId?: string;
  eventId?: string;
  path?: string;
  focusDate?: string;
  fullView?: boolean;
}

export type FloatingTabType = 'task' | 'note' | 'opportunity' | 'tracking';

export interface FloatingTab {
  id: string;
  type: FloatingTabType;
  title: string;
  color: string;
  data: any;
}

export interface CommercialRow {
  cost: number;
  margin: number; // %
  sellPrice: number; // Calculated or Manual
  discount: number; // %
  finalPrice: number; // Calculated
}

export interface Escalations {
  swHw: number;
  services: number;
  resale: number;
}

export interface Commercial {
  currency: 'USD' | 'MXN' | 'EUR';

  // Dynamic Sections
  customSections?: { id: string; name: string; cost: number; margin: number; sellPrice: number; discount: number }[];

  // Links (Kept)
  agreementsLink: string;
  cfLink: string;

  discountsAndNotes: string;

  // Official CQA Reference Values
  cqaOfficialSellPrice: number;
  cqaOfficialMargin: number;
}

export interface QuickLinkItem {
  id: string;
  type: 'link' | 'separator' | 'heading' | 'view'; // Added 'view' for internal tabs
  label: string;
  url?: string;
  order?: number; // Maintained for legacy, array index is preferred
}

export interface QuickLinks {
  bfo: string;
  internalFolder: string;
  officialFolder: string;
  cqaLink: string;
  ba: string;      // Basket Link
  srLink: string;  // Support Request Link
  geet: string;    // GEET Link
  [key: string]: string; // Allow custom links
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface InlineTask {
  id: string;
  text: string;
  isDone: boolean;
  linkedTaskId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  owner: TaskOwner;
  externalAreas: string[]; // Changed to array for multiple areas
  responsible: string;
  dueDate: string;
  stageContext: ProcessStage;
  subtasks: Subtask[];
  linkedNoteId?: string; // Legacy: Link to a note
  linkedNoteIds?: string[]; // New: Link to multiple notes

  // New Scheduling & Dependency Fields
  order: number | null;
  dependsOnTaskIds: string[]; // Array of Task IDs that must be completed before this one
  blockDoneUntilDependenciesDone: boolean; // If true, prevents marking as Done until dependencies are met

  // Timer & Tracking
  calendarized?: boolean; // New flag for specific calendar tracking
  timeLogs?: TimeLog[];
}

export interface TimeLog {
  id: string;
  start: string; // ISO
  end?: string; // ISO
  durationSeconds: number; // Accumulated
  note?: string;
}

export interface MeetingNote {
  id: string;
  title: string;
  date: string;
  type: 'General' | 'Kick-off' | 'Scope' | 'Review';
  content: string; // HTML
  attendees: string;
  inlineTasks?: InlineTask[];
}

export interface Question {
  id: string;
  sourceId: string; // ID of Note or Task where it originated
  sourceType: 'note' | 'task';
  quote: string; // The text selected
  question: string;
  answer: string;
  isResolved: boolean;
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  date: string;
  content: string;
}

export interface PrdPresentation {
  executiveSummary: string;
  issues: string;
  kpis: string;
  requirements: string;
  proposalAnalysis?: {
    trigger: string;
    missingInfo: string;
    risks: string;
    competition: string;
    strategy: string;
    checklist: Record<string, boolean>;
  };
}

export interface OpportunityDates {
  requested: string;
  expected: string;
  assigned: string;
}

// --- KPI Interfaces ---

export type DayType = 'Worked' | 'Waiting' | 'Inactive';

export interface AreaDayRecord {
  type: DayType;
  hours?: number; // Only for Tendering
  minutes?: number; // Extra precision for Tendering
}

export interface KPIArea {
  id: string;
  area: string;
  daysSpent: number;
  waitingDays: number;
  calendar?: Record<string, AreaDayRecord>; // date string "YYYY-MM-DD" -> record
}

export interface KPITimeline {
  receivedAt: string; // ISO date
  deliveredAt: string | null; // ISO date or null
  cancelledAt: string | null; // ISO date or null
  cancelledReason: string | null;
}

export interface KPIExecution {
  myWorkDays: number | null;
  waitingOnOthersDays: number | null;
}

export interface KPIs {
  languageSkill: number | null;       // 0–100
  technicalUnderstanding: number | null;  // 0–100
  dealProbability: number | null;     // 0–100
  effortContribution: number | null;  // 0–100
  sold: boolean | null;
  proposalAmountUSD: number | null;

  timeline: KPITimeline;
  execution: KPIExecution;
  areasInvolved: KPIArea[];
}

export interface OpportunityLabel {
  id: string;
  text: string;
  color: string;
}

export interface Opportunity {
  id: string;
  title: string;
  customer: string;
  qlk: string;
  revision: string;
  stage: ProcessStage;
  statusLabel: OpportunityStatus;
  detailedStatus?: DetailedStatus;

  dates: OpportunityDates;
  priority: 'High' | 'Medium' | 'Low';
  priorityOrder: number | null; // 1-N rank
  alias?: string; // Quick identification nickname (1-2 words)
  quoteType?: 'Firm' | 'Budgetary';

  // Details
  description: string;
  commercial: Commercial;
  links: QuickLinks | QuickLinkItem[]; // Supported legacy object or new array

  // Lists
  notes: MeetingNote[];
  tasks: Task[];
  questions: Question[]; // New module
  history: HistoryEntry[];
  presentation: PrdPresentation;
  tags: string[]; // Keep for legacy
  labels: OpportunityLabel[]; // New colored labels

  // Version Control
  srId?: string; // Support Request ID (Logical Branch)
  versions?: OpportunityVersion[];

  // Analytics
  kpis: KPIs;

  // Folder Manager Link
  folderLinked?: boolean;

  // Deprecated 
  kanbanNote?: string;

  lastUpdated: string;
}

export interface OpportunityVersion {
  id: string;
  opportunityId: string;
  srId: string;
  commitMessage: string;
  tags: string[];
  createdAt: string;
  createdBy: string;
  source: string;
  snapshot: Omit<Opportunity, 'versions'>;
}

export interface UserSettings {
  theme: 'light' | 'dark';
  userName: string;
}

export interface TaskStandardTemplate {
  sourceOpportunityId: string;
  sourceOpportunityName: string;
  createdAt: string;
  tasks: Task[];
}

export interface DatabaseSchema {
  meta: {
    version: string;
    lastUpdated: string;
  };
  userSettings: UserSettings;
  opportunities: Opportunity[];
}

export const INITIAL_DB: DatabaseSchema = {
  meta: { version: "1.9", lastUpdated: new Date().toISOString() },
  userSettings: { theme: "light", userName: "Engineer" },
  opportunities: []
};

export const STAGE_COLORS: Record<ProcessStage, string> = {
  '1. Intake': 'bg-gray-100 text-gray-700',
  '2. Technical Analysis': 'bg-blue-100 text-blue-700',
  '3. Architecture': 'bg-indigo-100 text-indigo-700',
  '4. Basket/BOM': 'bg-purple-100 text-purple-700',
  '5. Costing': 'bg-pink-100 text-pink-700',
  '6. Proposal': 'bg-orange-100 text-orange-700',
  '7. Validation': 'bg-yellow-100 text-yellow-800',
  '8. Delivery/Support': 'bg-green-100 text-green-700',
  '9. Won/Lost': 'bg-emerald-100 text-emerald-800'
};

export const STATUS_COLORS: Record<OpportunityStatus, string> = {
  'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
  'On Hold': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Submitted': 'bg-purple-100 text-purple-700 border-purple-200',
  'Won': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Lost': 'bg-red-100 text-red-700 border-red-200',
  'Canceled': 'bg-gray-100 text-gray-600 border-gray-200',
};

export const DETAILED_STATUS_COLORS: Record<string, string> = {
  'Working on it': 'bg-[#3DCD58] text-white border-[#2db64a] shadow-sm',   // Green
  'Review': 'bg-[#4D61FF] text-white border-[#4557E6] shadow-sm',   // Blue/Indigo
  'Info Needed': 'bg-[#FF4D4D] text-white border-[#E64545] shadow-sm',   // Red
  'Paused': 'bg-[#FF8A00] text-white border-[#E67C00] shadow-sm',   // Orange
  'Approval': 'bg-[#B84DFF] text-white border-[#A645E6] shadow-sm',   // Purple
  'Meeting': 'bg-[#00D1FF] text-white border-[#00BCE6] shadow-sm',   // Cyan
  'Completed': 'bg-emerald-500 text-white border-emerald-600 shadow-sm',
  'Canceled': 'bg-gray-400 text-white border-gray-500 shadow-sm',
  // Legacy fallbacks
  'No Status': 'bg-[#4D61FF] text-white border-[#4557E6] shadow-sm',   // → Review color
  'Waiting': 'bg-[#FFB800] text-white border-[#E6A600] shadow-sm',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  'Pending': 'bg-slate-100 text-slate-500',
  'In Progress': 'bg-blue-50 text-blue-600 font-bold',
  'Done': 'bg-emerald-100 text-emerald-700 font-black',
  'On Hold': 'bg-amber-100 text-amber-700',
  'Missing Info': 'bg-rose-100 text-rose-700',
  'Canceled': 'bg-gray-100 text-gray-400 line-through',
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  'High': 'text-red-600 bg-red-50 border-red-100',
  'Medium': 'text-yellow-600 bg-yellow-50 border-yellow-100',
  'Low': 'text-green-600 bg-green-50 border-green-100',
};
