import type { GeneratedEmailKind } from '../types';

/**
 * A single email template. Built-in templates use their kind as id;
 * user-created templates get a uuid and kind 'custom'.
 */
export interface EmailTemplate {
  id: string;
  kind: GeneratedEmailKind;
  /** Shown as {topic} in the subject format, e.g. "Status Report". */
  topicLabel: string;
  /** Optional per-template subject override; falls back to the global format. */
  subjectFormat?: string;
  /** HTML body with {variable} placeholders. */
  bodyHtml: string;
  isCustom?: boolean;
}

export interface EmailComposeSettings {
  /** Global subject format, e.g. '({topic}) - {fullOpportunityName}'. */
  subjectFormat: string;
  /** How {fullOpportunityName} is built, e.g. '{opId} - {customer} - {projectTitle}'. */
  fullNameFormat: string;
  /** How drafts are opened: COM (classic Outlook), .eml (works in new Outlook too) or auto-detect. */
  outlookMode: 'auto' | 'com' | 'eml';
  /** Saved templates: overrides of built-ins (matched by id) plus user-created customs. */
  templates: EmailTemplate[];
}

export const DEFAULT_SUBJECT_FORMAT = '({topic}) - {fullOpportunityName}';
/**
 * The opportunity Title already follows the "OP-xxxxx - SR - Project - Customer" convention,
 * so the default just uses it as-is — combining it with {opId}/{customer} would duplicate them.
 */
export const DEFAULT_FULLNAME_FORMAT = '{projectTitle}';

export interface EmailVariableDef {
  name: string;
  description: string;
  group: 'General' | 'Dates' | 'Links' | 'Status Report' | 'Commercial' | 'Proposal' | 'Task' | 'Reminder' | 'Info Request' | 'Meeting Recap' | 'Change Revision';
}

/** Catalog of every variable the composer can resolve, for the Settings "insert variable" dropdown. */
export const EMAIL_VARIABLES: EmailVariableDef[] = [
  { name: 'opId', description: 'Opportunity ID (OP-...)', group: 'General' },
  { name: 'srId', description: 'Support Request ID (SR-...)', group: 'General' },
  { name: 'quoteLink', description: 'QuoteLink (QLK)', group: 'General' },
  { name: 'customer', description: 'Customer name', group: 'General' },
  { name: 'projectTitle', description: 'Project / opportunity title', group: 'General' },
  { name: 'alias', description: 'Opportunity alias', group: 'General' },
  { name: 'fullOpportunityName', description: 'Full name built from the configurable format', group: 'General' },
  { name: 'topic', description: 'Topic label of the template (subject only)', group: 'General' },
  { name: 'seller', description: 'Seller / CSE', group: 'General' },
  { name: 'revision', description: 'Current revision', group: 'General' },
  { name: 'stage', description: 'Process stage', group: 'General' },
  { name: 'status', description: 'Opportunity status', group: 'General' },
  { name: 'userName', description: 'Your name (Settings > General)', group: 'General' },
  { name: 'greeting', description: "Auto greeting based on 'To' recipients (name / two names / 'team'); style rotates Hi/Hello/Dear", group: 'General' },
  { name: 'wellWishLine', description: '"I hope you\'re doing well." — optional courtesy line (friendly emails only)', group: 'General' },
  { name: 'callOfferLine', description: '"Happy to jump on a call..." — optional closing courtesy line', group: 'General' },
  { name: 'requestOpening', description: 'Opening sentence — adapts to first request vs. follow-up and the email type', group: 'General' },
  { name: 'requestClosing', description: 'Closing ask with the due date ("Would you be able to share this by Wednesday, Jul 16?")', group: 'General' },
  { name: 'emailNotes', description: 'Notes or changes entered when composing the email', group: 'General' },
  { name: 'linksBlock', description: 'Block with the available SR / CQA / bFO links as clickable anchors', group: 'Links' },
  { name: 'stakeholdersList', description: 'List of opportunity stakeholders with roles', group: 'General' },
  { name: 'requestedDate', description: 'Requested date', group: 'Dates' },
  { name: 'expectedDate', description: 'Expected date', group: 'Dates' },
  { name: 'expectedDateLine', description: 'Sentence with the expected delivery date (hidden when not set)', group: 'Dates' },
  { name: 'assignedDate', description: 'Assigned date', group: 'Dates' },
  { name: 'today', description: "Today's date", group: 'Dates' },
  { name: 'todayFriendly', description: 'Today as "Monday, Jul 13"', group: 'Dates' },
  { name: 'dueDateFriendly', description: 'Due date picked in the modal, as "Wednesday, Jul 16"', group: 'Dates' },
  { name: 'firstRequestDateFriendly', description: 'Date of the first request (follow-ups), as "Wednesday, Jul 16"', group: 'Dates' },
  { name: 'bfoLink', description: 'bFO link', group: 'Links' },
  { name: 'cqaLink', description: 'CQA link', group: 'Links' },
  { name: 'srLink', description: 'Support Request link', group: 'Links' },
  { name: 'folderLink', description: 'Internal folder link/path', group: 'Links' },
  { name: 'baLink', description: 'Basket link', group: 'Links' },
  { name: 'geetLink', description: 'GEET link', group: 'Links' },
  { name: 'tasksCompletedList', description: 'Completed tasks (Done)', group: 'Status Report' },
  { name: 'tasksPendingList', description: 'Pending / in-progress tasks', group: 'Status Report' },
  { name: 'tasksBlockedList', description: 'Blocked tasks (On Hold, Missing Info, Changes Requested / Rework or unmet dependencies)', group: 'Status Report' },
  { name: 'tasksCompletedCount', description: 'Number of completed tasks', group: 'Status Report' },
  { name: 'tasksPendingCount', description: 'Number of pending tasks', group: 'Status Report' },
  { name: 'tasksBlockedCount', description: 'Number of blocked tasks', group: 'Status Report' },
  { name: 'lastPendingTaskList', description: 'Last (highest order) task not yet done', group: 'Status Report' },
  { name: 'lastHistoryComment', description: 'Latest history entry content', group: 'Status Report' },
  { name: 'lastHistoryDate', description: 'Latest history entry date', group: 'Status Report' },
  { name: 'progressLine', description: 'One-line progress counters (done / in progress / blocked)', group: 'Status Report' },
  { name: 'selectedHistoryComment', description: 'History entry chosen in the modal (defaults to the latest)', group: 'Status Report' },
  { name: 'selectedHistoryDate', description: 'Date of the chosen history entry', group: 'Status Report' },
  { name: 'commercialTable', description: 'Table of commercial sections (cost/margin/sell price)', group: 'Commercial' },
  { name: 'totalCost', description: 'Sum of section costs', group: 'Commercial' },
  { name: 'totalSellPrice', description: 'Sum of section sell prices', group: 'Commercial' },
  { name: 'cqaOfficialSellPrice', description: 'CQA official sell price', group: 'Commercial' },
  { name: 'cqaOfficialMargin', description: 'CQA official margin %', group: 'Commercial' },
  { name: 'currency', description: 'Commercial currency', group: 'Commercial' },
  { name: 'paCost', description: 'PA Cost (Commercial tab or filled in the modal)', group: 'Commercial' },
  { name: 'executiveSummaryBlock', description: 'Executive summary block (same content as "Copy Summary": dates, notes, CQA price/margin, SR/CQA links)', group: 'Commercial' },
  { name: 'versionInfo', description: 'Latest saved version (message + date)', group: 'Proposal' },
  { name: 'proposalMetaBlock', description: 'Revision / version / needed-by block', group: 'Proposal' },
  { name: 'proposalDocList', description: 'Attached documents selected in the modal', group: 'Proposal' },
  { name: 'requiredDate', description: 'Required (requested) date', group: 'Proposal' },
  { name: 'reviewPoints', description: 'Points / questions to review (filled in the modal)', group: 'Proposal' },
  { name: 'changeNotes', description: 'What changed in this document version (filled in the modal)', group: 'Proposal' },
  { name: 'revisionNotice', description: "Draft vs. final revision notice, based on the modal toggle", group: 'Proposal' },
  { name: 'approvalQuestionsBlock', description: 'Questions or important notes for the team, shown as a highlighted section in draft approvals', group: 'Proposal' },
  { name: 'priceApprovalBlock', description: 'Optional tagged price-approval section, if enabled in the modal', group: 'Proposal' },
  { name: 'taskTitle', description: 'Task title', group: 'Task' },
  { name: 'taskDescription', description: 'Task description', group: 'Task' },
  { name: 'taskResponsible', description: 'Task responsible', group: 'Task' },
  { name: 'taskAssignedDate', description: 'Assignment date (requested to responsible, or today)', group: 'Task' },
  { name: 'taskDueDate', description: 'Date the task is due back', group: 'Task' },
  { name: 'taskPriority', description: 'Task priority', group: 'Task' },
  { name: 'taskDeliverable', description: 'Expected deliverable (linked docs or manual)', group: 'Task' },
  { name: 'taskSubtasksList', description: 'Subtask checklist', group: 'Task' },
  { name: 'taskApprovers', description: 'Approvers of the assignment', group: 'Task' },
  { name: 'taskInformed', description: 'People informed (CC) of the assignment', group: 'Task' },
  { name: 'approvalRequiredDate', description: 'Date the approval is required', group: 'Task' },
  { name: 'overdueTasksList', description: 'Overdue tasks with days late', group: 'Reminder' },
  { name: 'reminderTasksList', description: 'Tasks selected for the reminder', group: 'Reminder' },
  { name: 'missingInfoTasksList', description: "Tasks in 'Missing Info'", group: 'Info Request' },
  { name: 'infoNeededBullets', description: 'Information needed (filled in the modal)', group: 'Info Request' },
  { name: 'requestItemsList', description: 'Items requested via the modal chips (when more than one)', group: 'Info Request' },
  { name: 'recapIntro', description: 'Opening line thanking for the meeting (uses the meeting date)', group: 'Meeting Recap' },
  { name: 'agreementsList', description: 'Agreements typed in the modal, as bullets', group: 'Meeting Recap' },
  { name: 'nextStepsList', description: 'Next steps from the selected tasks: action — owner — due date', group: 'Meeting Recap' },
  { name: 'nextMeetingLine', description: 'Next meeting date line (hidden when not set)', group: 'Meeting Recap' },
  { name: 'changeRequired', description: 'Required corrections from the active change revision', group: 'Change Revision' },
  { name: 'changeReason', description: 'Reason for the requested corrections', group: 'Change Revision' },
  { name: 'changeRequestedBy', description: 'Stakeholders who requested the corrections', group: 'Change Revision' },
  { name: 'changeInformed', description: 'Optional informed stakeholders', group: 'Change Revision' },
  { name: 'changeFilesList', description: 'Files revised in the correction cycle', group: 'Change Revision' },
  { name: 'originalApprovalTask', description: 'Original approval task title', group: 'Change Revision' },
  { name: 'changeRevisionBlock', description: 'Structured summary of the active change revision', group: 'Change Revision' },
];

/** Which variable groups make sense for each built-in kind (customs see everything). */
export const VARIABLE_GROUPS_BY_KIND: Record<GeneratedEmailKind, EmailVariableDef['group'][]> = {
  status_report: ['General', 'Dates', 'Links', 'Status Report', 'Info Request'],
  price_approval: ['General', 'Dates', 'Links', 'Commercial'],
  proposal_approval: ['General', 'Dates', 'Links', 'Proposal', 'Commercial', 'Info Request'],
  task_assignment: ['General', 'Dates', 'Links', 'Task'],
  reminder: ['General', 'Dates', 'Links', 'Reminder', 'Task'],
  info_request: ['General', 'Dates', 'Links', 'Info Request'],
  meeting_recap: ['General', 'Dates', 'Links', 'Meeting Recap', 'Task'],
  change_revision: ['General', 'Dates', 'Links', 'Task', 'Change Revision'],
  approval_resubmission: ['General', 'Dates', 'Links', 'Task', 'Change Revision'],
  approval_confirmation: ['General', 'Dates', 'Links', 'Task', 'Change Revision'],
  custom: ['General', 'Dates', 'Links', 'Status Report', 'Commercial', 'Proposal', 'Task', 'Reminder', 'Info Request', 'Meeting Recap', 'Change Revision'],
};

export const variablesForKind = (kind: GeneratedEmailKind): EmailVariableDef[] => {
  const groups = VARIABLE_GROUPS_BY_KIND[kind] || VARIABLE_GROUPS_BY_KIND.custom;
  return EMAIL_VARIABLES.filter(v => groups.includes(v.group));
};

const P = 'style="margin:0 0 10px 0;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222"';
const H = 'style="margin:14px 0 6px 0;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#3DCD58;font-weight:bold"';

/**
 * Default bodies are built from optional blocks: each section lives inside a
 * {?variable}...{/?} conditional (hidden when its data/checkbox is off) and is
 * wrapped in <div data-tl-block="..."> so the composer can surgically add or
 * remove sections in the editable preview without losing the user's edits.
 */
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'status_report',
    kind: 'status_report',
    topicLabel: 'Status Report',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}{wellWishLine}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `{?progressLine}<div data-tl-block="progress"><p ${P}>{progressLine}</p></div>{/?}`,
      `{?lastPendingTaskList}<div data-tl-block="nextTask"><p ${H}>Next step</p>{lastPendingTaskList}</div>{/?}`,
      `{?missingInfoTasksList}<div data-tl-block="missingInfo"><p ${H}>Waiting on information</p>{missingInfoTasksList}</div>{/?}`,
      `{?selectedHistoryComment}<div data-tl-block="history"><p ${H}>Latest update ({selectedHistoryDate})</p><p ${P}>{selectedHistoryComment}</p></div>{/?}`,
      `{?expectedDateLine}<div data-tl-block="expectedDate"><p ${P}>{expectedDateLine}</p></div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `<div data-tl-block="preSign"><p ${P}>Please let me know if you have any questions.</p></div>`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'price_approval',
    kind: 'price_approval',
    topicLabel: 'Price Approval',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}{wellWishLine}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `{?executiveSummaryBlock}<div data-tl-block="summary">{executiveSummaryBlock}</div>{/?}`,
      `{?commercialTable}<div data-tl-block="commercialTable"><p ${H}>Commercial breakdown</p>{commercialTable}</div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `{?requestClosing}<div data-tl-block="closing"><p ${P}>{requestClosing}</p></div>{/?}`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'proposal_approval',
    kind: 'proposal_approval',
    topicLabel: 'Proposal Approval',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}{wellWishLine}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `<div data-tl-block="revisionNotice"><p ${P}>{revisionNotice}</p></div>`,
      `{?proposalMetaBlock}<div data-tl-block="meta">{proposalMetaBlock}</div>{/?}`,
      `{?changeNotes}<div data-tl-block="changes"><p ${H}>What changed in this version</p><p ${P}>{changeNotes}</p></div>{/?}`,
      `{?proposalDocList}<div data-tl-block="docs"><p ${H}>Documents</p>{proposalDocList}</div>{/?}`,
      `{?reviewPoints}<div data-tl-block="reviewPoints"><p ${H}>Points to review</p><p ${P}>{reviewPoints}</p></div>{/?}`,
      `{?approvalQuestionsBlock}<div data-tl-block="approvalQuestions">{approvalQuestionsBlock}</div>{/?}`,
      `{?priceApprovalBlock}<div data-tl-block="priceApproval">{priceApprovalBlock}</div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `{?requestClosing}<div data-tl-block="closing"><p ${P}>{requestClosing}</p></div>{/?}`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'task_assignment',
    kind: 'task_assignment',
    topicLabel: 'Support Request',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}{wellWishLine}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `{?taskDescription}<div data-tl-block="description"><p ${H}>Details</p><p ${P}>{taskDescription}</p></div>{/?}`,
      `{?taskDeliverable}<div data-tl-block="deliverable"><p ${H}>What would help us</p><p ${P}>{taskDeliverable}</p></div>{/?}`,
      `{?taskSubtasksList}<div data-tl-block="subtasks"><p ${H}>Checklist</p>{taskSubtasksList}</div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `{?requestClosing}<div data-tl-block="closing"><p ${P}>{requestClosing}</p></div>{/?}`,
      `{?callOfferLine}<div data-tl-block="callOffer"><p ${P}>{callOfferLine}</p></div>{/?}`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'reminder',
    kind: 'reminder',
    topicLabel: 'Reminder',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}{wellWishLine}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `{?reminderTasksList}<div data-tl-block="tasks">{reminderTasksList}</div>{/?}`,
      `{?expectedDateLine}<div data-tl-block="expectedDate"><p ${P}>{expectedDateLine}</p></div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `{?requestClosing}<div data-tl-block="closing"><p ${P}>{requestClosing}</p></div>{/?}`,
      `{?callOfferLine}<div data-tl-block="callOffer"><p ${P}>{callOfferLine}</p></div>{/?}`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'info_request',
    kind: 'info_request',
    topicLabel: 'Information Request',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}{wellWishLine}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `{?requestItemsList}<div data-tl-block="items">{requestItemsList}</div>{/?}`,
      `{?infoNeededBullets}<div data-tl-block="bullets">{infoNeededBullets}</div>{/?}`,
      `{?missingInfoTasksList}<div data-tl-block="missingInfo"><p ${H}>Also waiting on</p>{missingInfoTasksList}</div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `{?requestClosing}<div data-tl-block="closing"><p ${P}>{requestClosing}</p></div>{/?}`,
      `{?callOfferLine}<div data-tl-block="callOffer"><p ${P}>{callOfferLine}</p></div>{/?}`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'meeting_recap',
    kind: 'meeting_recap',
    topicLabel: 'Meeting Recap',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}{wellWishLine}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{recapIntro}</p></div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `{?agreementsList}<div data-tl-block="agreements"><p ${H}>Agreements</p>{agreementsList}</div>{/?}`,
      `{?nextStepsList}<div data-tl-block="nextSteps"><p ${H}>Next steps</p>{nextStepsList}</div>{/?}`,
      `{?nextMeetingLine}<div data-tl-block="nextMeeting"><p ${P}>{nextMeetingLine}</p></div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `<div data-tl-block="preSign"><p ${P}>Please let me know if I missed anything or if you see it differently.</p></div>`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'change_revision',
    kind: 'change_revision',
    topicLabel: 'Change Revision Request',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}{wellWishLine}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `<div data-tl-block="changeRevision">{changeRevisionBlock}</div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Additional notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `<div data-tl-block="closing"><p ${P}>{requestClosing}</p></div>`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'approval_resubmission',
    kind: 'approval_resubmission',
    topicLabel: 'Revised Deliverable for Approval',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `<div data-tl-block="changeRevision">{changeRevisionBlock}</div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Additional notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `{?linksBlock}<div data-tl-block="links">{linksBlock}</div>{/?}`,
      `<div data-tl-block="closing"><p ${P}>{requestClosing}</p></div>`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
  {
    id: 'approval_confirmation',
    kind: 'approval_confirmation',
    topicLabel: 'Approval Confirmation',
    bodyHtml: [
      `<div data-tl-block="greeting"><p ${P}>{greeting}</p></div>`,
      `<div data-tl-block="opening"><p ${P}>{requestOpening}</p></div>`,
      `<div data-tl-block="changeRevision">{changeRevisionBlock}</div>`,
      `{?emailNotes}<div data-tl-block="notes"><p ${H}>Additional notes</p><p ${P}>{emailNotes}</p></div>{/?}`,
      `<div data-tl-block="closing"><p ${P}>{requestClosing}</p></div>`,
      `<div data-tl-block="signature"><p ${P}>Best regards,<br/>{userName}</p></div>`,
    ].join(''),
  },
];

export const DEFAULT_EMAIL_COMPOSE_SETTINGS: EmailComposeSettings = {
  subjectFormat: DEFAULT_SUBJECT_FORMAT,
  fullNameFormat: DEFAULT_FULLNAME_FORMAT,
  outlookMode: 'auto',
  templates: [],
};

/**
 * Resolve the effective template list: built-in defaults, overridden by any
 * saved template with the same id, plus user-created custom templates.
 */
export const resolveTemplates = (settings?: Partial<EmailComposeSettings> | null): EmailTemplate[] => {
  const saved = settings?.templates || [];
  const builtIns = DEFAULT_EMAIL_TEMPLATES.map(def => saved.find(t => t.id === def.id) || def);
  const customs = saved.filter(t => t.isCustom && !DEFAULT_EMAIL_TEMPLATES.some(def => def.id === t.id));
  return [...builtIns, ...customs];
};

/** Merge saved settings with defaults so older installs need no migration. */
export const mergeEmailComposeSettings = (settings?: Partial<EmailComposeSettings> | null): EmailComposeSettings => ({
  subjectFormat: settings?.subjectFormat || DEFAULT_SUBJECT_FORMAT,
  fullNameFormat: settings?.fullNameFormat || DEFAULT_FULLNAME_FORMAT,
  outlookMode: settings?.outlookMode || 'auto',
  templates: settings?.templates || [],
});
