
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

export type TaskStatus = 'Pending' | 'In Progress' | 'Done' | 'On Hold' | 'Approval' | 'Missing Info' | 'Changes Requested / Rework' | 'Canceled';
export type TaskOwner = 'Me' | 'External Area';
export type ExternalArea = 'Delivery' | 'SCM' | 'Sales' | 'Legal' | 'Finance' | 'TSC' | 'Other' | string;
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type OpportunityStatus = 'In Progress' | 'On Hold' | 'Submitted' | 'Won' | 'Lost' | 'Canceled';
export type DetailedStatus = 'Working on it' | 'Review' | 'Info Needed' | 'Paused' | 'Approval' | 'Meeting' | 'Completed' | 'Canceled';

/** Valid choices for an opportunity's detailed status. Legacy labels are display-only. */
export const DETAILED_STATUS_ORDER: DetailedStatus[] = [
  'Working on it', 'Review', 'Info Needed', 'Paused', 'Approval', 'Meeting', 'Completed', 'Canceled'
];

/** Labels shown in the UI; persisted database keys intentionally remain unchanged. */
export const DETAILED_STATUS_LABELS: Record<DetailedStatus, string> = {
  'Working on it': 'In progress',
  'Review': 'Schedule',
  'Info Needed': 'In progress - Info needed',
  'Paused': 'On hold',
  'Approval': 'Approval',
  'Meeting': 'In progress - Meeting',
  'Completed': 'Completed',
  'Canceled': 'Canceled',
};

export interface DeepLink {
  tab: string;
  taskId?: string;
  noteId?: string;
  eventId?: string;
  path?: string;
  focusDate?: string;
  fullView?: boolean;
  /** Monotonically-increasing counter so repeated clicks to the same target always re-fire the navigation effect. */
  _nonce?: number;
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

export interface CommercialQuickRef {
  id: string;
  name: string;
  type: 'file' | 'link';
  fileKey?: string;
  url?: string;
}

export interface CommercialInternalRevision {
  id: string;
  revision: string;
  createdAt: string;
  createdBy?: string;
  note: string;
  customSections: { id: string; name: string; cost: number; margin: number; sellPrice: number; discount: number }[];
  discountsAndNotes: string;
  cqaOfficialSellPrice: number;
  cqaOfficialMargin: number;
  calculatedFinalPrice: number;
  calculatedMargin: string;
}

export interface AlarmConfig {
  id: string;
  daysThreshold: number; // Days remaining
  color: string; // Tailwind class (legacy / complex default)
  backgroundColor?: string; // Hex color for color picker
  textColor?: string; // Hex color for text
}


/**
 * Commercial data for an opportunity, including dynamic cost/sell sections.
 */
export interface Commercial {
  currency: 'USD' | 'MXN' | 'EUR';

  /**
   * Dynamic list of commercial items (Software, Services, etc.) defined by the user.
   */
  customSections?: { id: string; name: string; cost: number; margin: number; sellPrice: number; discount: number }[];

  // Links (Kept)
  agreementsLink: string;
  cfLink: string;

  discountsAndNotes: string;

  /**
   * User-defined quick references to files in the opportunity folder or external URLs.
   */
  quickRefs?: CommercialQuickRef[];

  /**
   * Internal commercial snapshots (R0.1, R0.2, ...). These track pricing
   * changes without creating a full opportunity revision.
   */
  internalRevisions?: CommercialInternalRevision[];

  /**
   * Manual override for the total sell price used in KPI calculations.
   */
  cqaOfficialSellPrice: number;
  /**
   * Manual override for the total margin used in KPI calculations.
   */
  cqaOfficialMargin: number;

  /** PA Cost used in Price Approval emails. */
  paCost?: number;
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
  /** System-managed phase for assignment tasks. */
  assignmentPhase?: 'execution' | 'approval';
}

export interface InlineTask {
  id: string;
  text: string;
  isDone: boolean;
  linkedTaskId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * ExecutionBlock — a planned work-time slot for a task.
 * Separate from dueDate: dueDate = when it must be delivered,
 * executionBlocks = when the user actually plans to work on it.
 * A single task can have multiple blocks across different days/hours.
 */
export interface ExecutionBlock {
  id: string;
  date: string;       // "YYYY-MM-DD" (local)
  startTime: string;  // "HH:mm" 24h
  endTime: string;    // "HH:mm" 24h
  createdAt: string;  // ISO
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
  /** ids (name|area keys) of the SOW "Team Involved" members assigned as responsible for this task. */
  responsibleTeamMemberIds?: string[];
  isAssignment?: boolean;
  approverTeamMemberIds?: string[];
  informedTeamMemberIds?: string[];
  /** When responsibleTeamMemberIds is non-empty: when the request was made to that responsible / when it's due back. */
  responsibleRequestedDate?: string;
  responsibleDueDate?: string;
  responsibleDeliveredDate?: string;
  approvalRequestedDate?: string;
  approvalDueDate?: string;
  approvalDeliveredDate?: string;
  assignmentCycles?: Array<{
    id: string;
    executionRequested?: string;
    executionRequired?: string;
    executionDelivered?: string;
    approvalRequested?: string;
    approvalRequired?: string;
    approved?: string;
    changesRequestedAt?: string;
    reviewOutcome?: 'approved' | 'changes_requested';
    changeRequest?: string;
    reworkTaskId?: string;
  }>;
  /** Set on a correction task created from a rejected approval. */
  reworkForTaskId?: string;
  /** Human-readable changes requested by the reviewer. */
  changeRequest?: string;
  /** Stable id of the post-approval change revision that created this correction task. */
  changeRevisionId?: string;
  /** Why the requested correction is necessary. */
  changeReason?: string;
  /** Opportunity stakeholder ids that requested the correction. */
  changeRequestedByIds?: string[];
  /** Opportunity stakeholder ids that should remain informed. */
  changeInformedIds?: string[];
  /** New physical file revisions created for this correction task. */
  changeRevisionFileKeys?: string[];
  /** Original attachment keys superseded when this correction is sent for approval. */
  previousApprovalAttachmentKeys?: string[];
  /** Set after the explicit "Send Back for Approval" action. */
  sentBackForApprovalAt?: string;
  dueDate: string;
  stageContext: ProcessStage;
  subtasks: Subtask[];
  linkedNoteId?: string; // Legacy: Link to a note
  linkedNoteIds?: string[]; // New: Link to multiple notes
  linkedEmailConversationIds?: string[];

  // New Scheduling & Dependency Fields
  order: number | null;
  dependsOnTaskIds: string[]; // Array of Task IDs that must be completed before this one
  blockDoneUntilDependenciesDone: boolean; // If true, prevents marking as Done until dependencies are met

  // Timer & Tracking
  calendarized?: boolean; // New flag for specific calendar tracking
  timeLogs?: TimeLog[];

  /**
   * Planned work-time blocks (Execution Schedule). Optional — only tasks
   * the user explicitly schedules will have blocks.
   */
  executionBlocks?: ExecutionBlock[];

  /** Expected deliverable of the task, used in assignment emails. */
  deliverable?: string;

  /** ISO timestamp of when the task was last marked Done. Cleared if moved out of Done. */
  completedAt?: string;
}

export interface TimeLog {
  id: string;
  start: string; // ISO
  end?: string; // ISO
  durationSeconds: number; // Accumulated
  note?: string;
}

export interface NoteFolder {
  id: string;
  name: string;
  parentFolderId?: string; // nested folder: id of the parent folder
  order?: number;
}

export interface EmailLabel {
  id: string;
  text: string;
  color: string;
}

export interface EmailGhostFolder {
  id: string;
  name: string;
  parentFolderId?: string;
  order?: number;
}

export interface EmailMessage {
  id: string;
  outlookId?: string;
  internetMessageId?: string;
  subject: string;
  from: string;
  to?: string;
  receivedAt: string;
  bodyPreview?: string;
  webLink?: string;
}

export interface EmailConversation {
  id: string;
  outlookConversationId?: string;
  subject: string;
  participants: string[];
  summary: string;
  folderId?: string;
  labelIds?: string[];
  linkedTaskIds?: string[];
  linkedNoteIds?: string[];
  messages: EmailMessage[];
  order?: number;
  lastReceivedAt?: string;
  webLink?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityEmailsData {
  folders: EmailGhostFolder[];
  labels: EmailLabel[];
  conversations: EmailConversation[];
  selectedOutlookFolderIds?: string[];
  /** Drafts generated by the email composer (opened in Outlook, never auto-sent). */
  generatedEmails?: GeneratedEmailRecord[];
}

/** Built-in email template kinds. Custom user templates use kind 'custom'. */
export type GeneratedEmailKind =
  | 'status_report'
  | 'price_approval'
  | 'proposal_approval'
  | 'task_assignment'
  | 'reminder'
  | 'info_request'
  | 'meeting_recap'
  | 'change_revision'
  | 'approval_resubmission'
  | 'approval_confirmation'
  | 'custom';

/** Snapshot of an email draft generated from an opportunity and opened in Outlook. */
export interface GeneratedEmailRecord {
  id: string;
  kind: GeneratedEmailKind;
  /** Template used to build the draft (built-in kind id or a custom template id). */
  templateId: string;
  subject: string;
  to: string[];
  cc: string[];
  bcc: string[];
  /** Snapshot of the HTML body as it was opened in Outlook. */
  bodyHtml: string;
  attachments: { name: string; fileKey: string; absolutePath: string }[];
  relatedTaskIds?: string[];
  relatedDocKeys?: string[];
  /** Opportunity revision at generation time (price/proposal approvals). */
  relatedRevision?: string;
  openedWith: 'com' | 'eml';
  createdAt: string;
  createdBy?: string;
  /** Display first names of the To recipients at generation time (for the History event). */
  toNames?: string[];
  /** Whether this was the first request or a follow-up (kinds that track it). */
  requestStage?: 'first' | 'followup';
  /** Items requested in an info request (e.g. "BOM", "Updated SLD"). */
  requestItems?: string[];
  /** Notes or changes that accompanied this generated email. */
  emailNotes?: string;
}

export interface MeetingNote {
  id: string;
  title: string;
  date: string;
  type: 'General' | 'Kick-off' | 'Scope' | 'Review';
  content: string; // HTML, or serialized JSON when format === 'sow'
  attendees: string;
  inlineTasks?: InlineTask[];
  parentId?: string;  // sub-note: id of the parent note
  folderId?: string;  // folder this note belongs to
  linkedEmailConversationIds?: string[];
  /** Stable post-approval revision represented by this note. */
  changeRevisionId?: string;
  /** Tasks participating in the revision cycle (original approval + correction). */
  linkedTaskIds?: string[];
  order?: number; // manual sort position within its list (folder/root)
  /** When 'sow', this note renders the embedded Scope of Work builder instead of the rich text editor. */
  format?: 'sow';
}

/** A reusable, globally-stored stakeholder/contact (name + email), shared across all opportunities. */
export interface Person {
  id: string;
  name: string;
  email: string;
  role?: string;
  directoryContactId?: string;
  roles?: string[];
  roleContexts?: Record<string, string>;
  /** Alternate names/nicknames for this person, searchable and used to match against the directory. */
  aliases?: string[];
}

export interface GlobalContact {
  id: string;
  name: string;
  email: string;
  availableRoles: string[];
  /** Alternate names/nicknames for this person, searchable and used to match against the directory. */
  aliases?: string[];
}

export interface HistoryEntry {
  id: string;
  date: string;
  content: string;
  /** Exact creation time used when several events share the same date. */
  createdAt?: string;
  /** Optional metadata for an approval-related event in the regular history. */
  approval?: ApprovalEvent;
}

/** Metadata kept on a normal history event so approval workflows and emails retain their context. */
export interface ApprovalEvent {
  taskId: string;
  correctionTaskId?: string;
  changeRevisionId?: string;
  cycle: number;
  outcome: 'changes_requested' | 'resubmitted' | 'approved';
  requiredChanges?: string;
  reason?: string;
  requestedByIds?: string[];
  informedIds?: string[];
  assignedTo: 'Me' | 'External Area';
  responsibleTeamMemberIds?: string[];
  requestedAt: string;
  committedAt?: string;
  deliveredAt?: string;
  sentBackAt?: string;
  approvedAt?: string;
  previousAttachmentKeys: string[];
  activeAttachmentKeys: string[];
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
  /** Assignment ids that automatically contributed this waiting day. */
  waitingTaskIds?: string[];
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

/**
 * The core entity representing a project or proposal.
 */
export interface Opportunity {
  id: string;
  title: string;
  customer: string;
  customerAddress?: string;
  seller?: string;
  qlk: string;
  revision: string;
  stage: ProcessStage;
  statusLabel: OpportunityStatus;
  detailedStatus?: DetailedStatus;

  /**
   * Project timeline dates (Requested, Expected, Assigned).
   */
  dates: OpportunityDates;
  priority: 'High' | 'Medium' | 'Low';
  priorityOrder: number | null; // 1-N rank
  /**
   * A short nickname for quick reference.
   */
  alias?: string; 
  /**
   * Indicates if the proposal is final (Firm) or a high-level estimate (Budgetary).
   */
  quoteType?: 'Firm' | 'Budgetary';

  // Details
  description: string;
  commercial: Commercial;
  links: QuickLinks | QuickLinkItem[]; // Supported legacy object or new array
  /** Manual display order (list of ids) for the unlocked default quick links (e.g. Folder, BA, GEET). Locked ones (SRLink, BFO, CQA) are never reorderable. */
  quickLinksOrder?: string[];
  /** Per-opportunity display-name overrides for the unlocked default quick links (Folder, BA, GEET). Keyed by link id; absent id = use the built-in label. */
  quickLinkLabels?: Record<string, string>;
  /** Per-opportunity icon overrides for the unlocked default quick links. Keyed by link id; value is an icon name from the quick-link icon palette. */
  quickLinkIcons?: Record<string, string>;
  /** Ids of default quick links (e.g. locked SRLink/BFO/CQA) hidden on this opportunity's overview when unused. */
  hiddenQuickLinks?: string[];

  // Lists
  notes: MeetingNote[];
  notesFolders?: NoteFolder[];
  emails?: OpportunityEmailsData;
  /** Stakeholders/contacts involved in this specific opportunity — who's involved changes per opportunity, so this is not a global list. Used to suggest who a task is waiting on. */
  stakeholders?: Person[];
  tasks: Task[];
  history: HistoryEntry[];
  /** Optional override for the "Last History Event" dashboard card field — when unset, the card shows the most recent history entry's content verbatim. */
  lastHistoryEventOverride?: string;
  presentation: PrdPresentation;
  tags: string[]; // Keep for legacy
  labels: OpportunityLabel[]; // New colored labels

  // Version Control
  srId?: string; // Support Request ID (Logical Branch)
  versions?: OpportunityVersion[];
  /** Count of saved revisions, preserved on "light" opportunity objects that strip the heavy `versions` snapshots for list/dashboard rendering. Falls back to `versions.length` when absent. */
  versionsCount?: number;
  /** Creation date (ISO) of each saved revision, preserved on "light" opportunity objects for monthly chart aggregation without the heavy snapshot payload. Falls back to `versions.map(v => v.createdAt)` when absent. */
  versionsCreatedAt?: string[];
  /** "Expected" date (from each revision's own `snapshot.dates.expected`) of each saved revision, preserved on "light" opportunity objects for monthly chart aggregation without the heavy snapshot payload. Falls back to `versions.map(v => v.snapshot?.dates?.expected)` when absent. */
  versionsExpectedDates?: string[];

  /**
   * Calculated or raw KPI measurements for performance tracking.
   */
  kpis: KPIs;

  folderLinked?: boolean;
  /**
   * Absolute OS path of the linked folder, keyed by revision ('' = legacy/no revision).
   * Persisted in the shared JSON DB so any browser/machine with the local helper can
   * browse and operate by path, even without a FileSystemDirectoryHandle.
   */
  folderPaths?: Record<string, string>;
  /**
   * Attachment records for files inside the linked folder: document classification,
   * aliases, internal notes and the task/note links the user made in the app.
   *
   * Lives in the SHARED DB (not IndexedDB) because everything a user builds inside
   * the app must survive changing browser, machine or app version. A record is
   * never removed automatically — a file that disappears is flagged with
   * `missingSince` and keeps its links, so only the user can delete the record.
   */
  folderDocs?: FolderDocRecord[];
  /** Quick-access pins keyed by folder storage key (`opportunityId` or `opportunityId::revision`). */
  folderPins?: Record<string, FolderPinRecord[]>;
  /** Manual revision history entries created from the Folder tab, one list per opportunity. */
  fileRevisionHistory?: FileRevisionRecord[];
  /**
   * Set once this opportunity's legacy per-browser IndexedDB folder metadata has been
   * copied into the fields above. Guards the one-time migration from running again.
   */
  folderDataMigrated?: boolean;

  // Deprecated
  kanbanNote?: string;

  lastUpdated: string;

  // Internal Performance Tags (Not persisted, used for caching)
  _isLight?: boolean;
  _originalRef?: Opportunity;
  _searchIndex?: string;
}

/**
 * One attached document inside the opportunity folder, tracked by IDENTITY rather
 * than by path so the user's work survives file renames and moves.
 *
 * `fileKey` is where the file lives right now (relative to the folder root, '/'
 * separated). `previousKeys` remembers every location it has had, which is what
 * lets a file that was renamed — or deleted and later restored under an old name —
 * be recognised as the same document and keep its links.
 */
export interface FolderDocRecord {
  id: string;
  /** Current relative path from the folder root, joined with '/'. */
  fileKey: string;
  /** Every previous fileKey, most recent last. Used to re-attach a returning file. */
  previousKeys?: string[];
  name: string;
  docType?: string;
  alias?: string;
  editableStatus?: string;
  internalNotes?: string;
  revisionFamilyId?: string;
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  /** Last known size/mtime on disk — the fingerprint used to detect a rename. */
  size?: number;
  mtime?: number;
  firstSeenAt: string;
  /** Last time the file was actually found on disk. */
  lastSeenAt?: string;
  /** ISO timestamp since when the file could not be found. Null/absent = present. */
  missingSince?: string | null;
  updatedAt: string;
}

/** A pinned file/folder in the Folder tab's quick-access strip. */
export interface FolderPinRecord {
  /** relativePath joined with '/'. */
  key: string;
  name: string;
  kind: 'file' | 'directory';
  /**
   * Path relative to the folder ROOT. Deliberately relative: moving the whole
   * opportunity folder changes only the root path, so pins stay valid.
   */
  relativePath: string[];
  addedAt: string;
  /** ISO timestamp since when the target could not be found. Null/absent = present. */
  missingSince?: string | null;
}

/** One entry of the manual "file revision" log kept per document family. */
export interface FileRevisionRecord {
  id: string;
  opportunityId: string;
  familyId?: string;
  familyKey: string;
  sourceFileKey: string;
  newFileKey: string;
  sourceFileName: string;
  newFileName: string;
  sourceRevision: string;
  newRevision: string;
  contains: string;
  changes: string;
  reason: string;
  /** Post-approval change revision that generated this physical file revision. */
  changeRevisionId?: string;
  correctionTaskId?: string;
  createdAt: string;
  updatedAt?: string;
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

export interface Reminder {
  id: string;
  title: string;
  /** ISO datetime (local) at which the reminder should fire. */
  dueAt: string;
  createdAt: string;
  /** Every reminder is linked to an opportunity. */
  opportunityId: string;
  /** Optional: narrows the reminder to a specific task within the opportunity. */
  taskId?: string;
  /** Optional: links the reminder to a specific note within the opportunity. Can be combined with taskId. */
  noteId?: string;
  /** Set once the browser Notification has fired for this reminder. */
  notifiedAt?: string;
  /** Set once the user marks the reminder as seen — removes it from the bell badge count. */
  seenAt?: string;
}

export interface UserSettings {
  theme: 'light' | 'dark';
  userName: string;
  /** Labels shared by every opportunity. Stored in the database, not browser-only settings. */
  globalLabels?: OpportunityLabel[];
  globalLabelsMigrated?: boolean;
  /** User-scheduled reminders, standalone or linked to a task. Stored in the database. */
  reminders?: Reminder[];
  /** Shared contact directory. Stored in the database so it travels with the opportunity file. */
  globalContacts?: GlobalContact[];
  /** Marks completion of the one-time migration from browser-only settings. */
  globalContactsMigrated?: boolean;
  /** Versioned migration guard so older/partial migrations can be repaired safely. */
  globalContactsMigrationVersion?: number;
  /** Visibility and layout choices that must travel with the TenderLoop database. */
  uiPreferences?: {
    hiddenOpportunityDetailSections?: string[];
    opportunityDetailSectionOrder?: string[];
    hiddenOpportunityHeaderFields?: string[];
    hiddenViews?: string[];
    hiddenIndicatorSections?: string[];
    hiddenProposalProcessColumns?: string[];
    processBoardColors?: Record<string, string>;
  };
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
  userSettings: { theme: "light", userName: "Engineer", globalLabels: [], globalLabelsMigrated: false },
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
  'Working on it': 'bg-[#2F6B4F] text-white border-[#285B43] shadow-sm',
  'Review': 'bg-[#315C8C] text-white border-[#294E77] shadow-sm',
  'Info Needed': 'bg-[#A33A3A] text-white border-[#8B3131] shadow-sm',
  'Paused': 'bg-[#B06A2B] text-white border-[#965A25] shadow-sm',
  'Approval': 'bg-[#67558C] text-white border-[#584877] shadow-sm',
  'Meeting': 'bg-[#2F7C86] text-white border-[#286A72] shadow-sm',
  'Completed': 'bg-[#39745A] text-white border-[#30634D] shadow-sm',
  'Canceled': 'bg-[#68717D] text-white border-[#59616B] shadow-sm',
  // Legacy fallbacks
  'No Status': 'bg-[#4D61FF] text-white border-[#4557E6] shadow-sm',   // → Review color
  'Waiting': 'bg-[#FFB800] text-white border-[#E6A600] shadow-sm',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  'Pending': 'bg-slate-100 text-slate-500',
  'In Progress': 'bg-blue-50 text-blue-600 font-bold',
  'Done': 'bg-emerald-100 text-emerald-700 font-black',
  'On Hold': 'bg-amber-100 text-amber-700',
  'Approval': 'bg-purple-100 text-purple-700 font-bold',
  'Missing Info': 'bg-rose-100 text-rose-700',
  'Changes Requested / Rework': 'bg-orange-100 text-orange-800 font-bold',
  'Canceled': 'bg-gray-100 text-gray-400 line-through',
};

/** Shared display order for every task status selector, filter and board. */
export const TASK_STATUS_ORDER: TaskStatus[] = ['Pending', 'In Progress', 'On Hold', 'Approval', 'Missing Info', 'Changes Requested / Rework', 'Done', 'Canceled'];

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  'High': 'text-red-600 bg-red-50 border-red-100',
  'Medium': 'text-yellow-600 bg-yellow-50 border-yellow-100',
  'Low': 'text-green-600 bg-green-50 border-green-100',
};
