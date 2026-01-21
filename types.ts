
export type ProcessStage =
  | '1. Recepción'
  | '2. Análisis Técnico'
  | '3. Arquitectura'
  | '4. Basket/BOM'
  | '5. Costeo'
  | '6. Propuesta'
  | '7. Validación'
  | '8. Entrega/Soporte'
  | '9. Won/Lost';

export type TaskStatus = 'Pending' | 'In Progress' | 'Done' | 'On Hold' | 'Missing Info' | 'Canceled';
export type TaskOwner = 'Me' | 'External Area';
export type ExternalArea = 'Delivery' | 'SCM' | 'Sales' | 'Legal' | 'Finance' | 'TSC' | 'Other' | string;
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type OpportunityStatus = 'In Progress' | 'On Hold' | 'Canceled' | 'Submitted' | 'Won' | 'Lost';

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

  // Table Rows (Updated: SW/HW merged)
  swHw: CommercialRow; // Merged
  services: CommercialRow;
  resale: CommercialRow;

  // Global Fields
  risk: number;
  contingency: number;
  escalations: Escalations; // Split escalations

  // Links
  agreementsLink: string; // Acuerdos Comerciales
  cfLink: string; // Customer First

  discountsAndNotes: string; // Kept for notes

  // Official CQA Reference Values
  cqaOfficialSellPrice: number;
  cqaOfficialMargin: number;
}

export interface QuickLinks {
  bfo: string;
  internalFolder: string;
  officialFolder: string;
  cqaLink: string;
  ba: string;      // Basket Link
  srLink: string;  // Support Request Link
  geet: string;    // GEET Link
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
  sold: boolean | null;
  proposalAmountUSD: number | null;

  timeline: KPITimeline;
  execution: KPIExecution;
  areasInvolved: KPIArea[];
}

export interface Opportunity {
  id: string;
  title: string;
  customer: string;
  qlk: string;
  revision: string;
  stage: ProcessStage;
  statusLabel: OpportunityStatus;

  dates: OpportunityDates;
  priority: 'High' | 'Medium' | 'Low';

  // Details
  description: string;
  commercial: Commercial;
  links: QuickLinks;

  // Lists
  notes: MeetingNote[];
  tasks: Task[];
  questions: Question[]; // New module
  history: HistoryEntry[];
  presentation: PrdPresentation;
  tags: string[];

  // Analytics
  kpis: KPIs;

  // Folder Manager Link
  folderLinked?: boolean;

  // Deprecated 
  pendingActions: any;

  lastUpdated: string;
}

export interface UserSettings {
  theme: 'light' | 'dark';
  userName: string;
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
  '1. Recepción': 'bg-gray-100 text-gray-700',
  '2. Análisis Técnico': 'bg-blue-100 text-blue-700',
  '3. Arquitectura': 'bg-indigo-100 text-indigo-700',
  '4. Basket/BOM': 'bg-purple-100 text-purple-700',
  '5. Costeo': 'bg-pink-100 text-pink-700',
  '6. Propuesta': 'bg-orange-100 text-orange-700',
  '7. Validación': 'bg-yellow-100 text-yellow-800',
  '8. Entrega/Soporte': 'bg-green-100 text-green-700',
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

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  'Pending': 'bg-gray-100 text-gray-600',
  'In Progress': 'bg-blue-50 text-blue-600',
  'Done': 'bg-green-100 text-green-700',
  'On Hold': 'bg-yellow-100 text-yellow-700',
  'Missing Info': 'bg-red-100 text-red-700',
  'Canceled': 'bg-gray-100 text-gray-400 line-through'
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  'High': 'text-red-600 bg-red-50 border-red-100',
  'Medium': 'text-yellow-600 bg-yellow-50 border-yellow-100',
  'Low': 'text-green-600 bg-green-50 border-green-100',
};
