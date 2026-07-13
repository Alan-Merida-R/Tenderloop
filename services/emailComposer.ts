/**
 * Pure email-draft engine: builds the variable context from an Opportunity,
 * renders {variable} templates and validates the composed draft.
 * No React, no network — the Outlook opening lives in emailDraftService.ts.
 */
import type { Opportunity, Task, Person, GlobalContact, HistoryEntry, QuickLinkItem, GeneratedEmailKind } from '../types';
import type { EmailTemplate, EmailComposeSettings } from './emailTemplates';

export interface EmailRecipient {
  name: string;
  email: string;
}

export interface ComposeManualFields {
  reviewPoints?: string;
  infoNeededBullets?: string;
  taskDeliverable?: string;
  paCost?: string;
  /** Proposal Approval: what changed in this document version. Manual only, never auto-filled. */
  changeNotes?: string;
  /** Proposal Approval: whether this is a final revision (approve & close) or a draft (please review). */
  revisionType?: 'draft' | 'final';
  /** Proposal Approval: include a tagged price-approval section in the same email. */
  includePriceApproval?: boolean;
  /** Proposal Approval: who the price-approval section is addressed to (CSE/Seller), manually chosen. */
  sellerName?: string;
  /** First request vs. follow-up — changes the opening/closing sentences and the subject topic. */
  requestStage?: 'first' | 'followup';
  /** ISO date the first request was sent (auto-detected from generated emails, editable). */
  firstRequestDate?: string;
  /** ISO date the ask is due back ("by Wednesday, Jul 16"). */
  dueDate?: string;
  /** Info Request: items being requested, as selectable chips (e.g. "BOM", "Updated SLD"). */
  requestItems?: string[];
  /** Info Request / Proposal: ids of the opportunity questions to include. */
  selectedQuestionIds?: string[];
  /** Price Approval: request approval of the price, or ask the seller to verify/adjust it. */
  priceMode?: 'approve' | 'verify';
  /** Status Report: id of the history entry to quote (defaults to the latest). */
  historyEntryId?: string;
  /** Meeting Recap: agreements, one per line. */
  agreements?: string;
  /** Meeting Recap: ISO date of the meeting (defaults to today). */
  meetingDate?: string;
  /** Meeting Recap: ISO date of the next meeting, if scheduled. */
  nextMeetingDate?: string;
  /** Greeting style index — cycles Hi/Hello/name (friendly) or Dear/name (executive). */
  greetingStyle?: number;
  /** Per-section on/off switches driven by the modal checkboxes; unset keys use per-kind defaults. */
  sections?: Record<string, boolean>;
}

export interface ComposeContextOptions {
  userName?: string;
  /** Template kind — drives tone (executive vs. friendly) and the stage-aware sentences. */
  kind?: GeneratedEmailKind;
  /** Primary task (assignment emails). */
  task?: Task;
  /** Tasks selected for reminder / info emails. Defaults to overdue+pending for reminders. */
  selectedTasks?: Task[];
  /** Display names of files attached in the modal (for {proposalDocList}). */
  attachmentNames?: string[];
  /** Names of documents linked to the primary task (deliverable fallback). */
  taskLinkedDocNames?: string[];
  manual?: ComposeManualFields;
  stakeholders?: Person[];
  globalContacts?: GlobalContact[];
  /** Current "To" recipients, used to compute {greeting}. CC/BCC do not affect the greeting. */
  toEmails?: string[];
}

export interface EmailDraft {
  subject: string;
  bodyHtml: string;
  /** Variables present in the template that the engine does not know. */
  unknownVariables: string[];
  /** Known variables that resolved to an empty value. */
  emptyVariables: string[];
}

export const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VAR_TOKEN = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

export const escapeHtml = (value: string): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const nl2br = (value: string): string => escapeHtml(value).replace(/\r?\n/g, '<br/>');

const fmtMoney = (value: number | null | undefined): string =>
  (typeof value === 'number' && !Number.isNaN(value))
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

const fmtDate = (value: string | null | undefined): string => (value || '').trim();

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** "2026-07-16" -> "Wednesday, Jul 16" (falls back to the raw value if unparseable). */
export const fmtFriendlyDate = (value: string | null | undefined): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const d = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

// ---------------------------------------------------------------------------
// Tone & optional sections
// ---------------------------------------------------------------------------

/** Approvals are executive/formal; everything else is friendly peer-to-peer. */
export const toneForKind = (kind?: GeneratedEmailKind): 'executive' | 'friendly' =>
  kind === 'price_approval' || kind === 'proposal_approval' ? 'executive' : 'friendly';

/** Kinds that distinguish a first request from a follow-up. */
export const kindHasStage = (kind?: GeneratedEmailKind): boolean =>
  kind === 'task_assignment' || kind === 'info_request' || kind === 'price_approval' || kind === 'proposal_approval';

/**
 * Default on/off state of the optional content sections per kind. The modal
 * checkboxes write into manual.sections; unset keys fall back to these.
 */
const DEFAULT_SECTIONS: Partial<Record<GeneratedEmailKind, Record<string, boolean>>> = {
  status_report: { progress: false, nextTask: true, missingInfo: true, history: true, expectedDate: true, links: false },
  info_request: { openQuestions: true, missingInfo: true, wellWish: true, callOffer: false, links: false },
  task_assignment: { description: true, deliverable: true, subtasks: true, wellWish: true, callOffer: true, links: false },
  reminder: { expectedDate: true, wellWish: true, callOffer: false, links: false },
  price_approval: { summary: true, commercialTable: false, links: false },
  proposal_approval: { meta: true, docs: true, links: false },
  meeting_recap: { agreements: true, nextSteps: true, nextMeeting: true, wellWish: false, callOffer: false, links: false },
};

export const sectionOn = (kind: GeneratedEmailKind | undefined, manual: ComposeManualFields, key: string, fallback = true): boolean => {
  if (manual.sections && key in manual.sections) return !!manual.sections[key];
  const defaults = kind ? DEFAULT_SECTIONS[kind] : undefined;
  return defaults && key in defaults ? !!defaults[key] : fallback;
};

// ---------------------------------------------------------------------------
// Task classification
// ---------------------------------------------------------------------------

const isClosed = (t: Task) => t.status === 'Done' || t.status === 'Canceled';

export const getCompletedTasks = (opp: Opportunity): Task[] =>
  (opp.tasks || []).filter(t => t.status === 'Done');

export const getPendingTasks = (opp: Opportunity): Task[] =>
  (opp.tasks || []).filter(t => t.status === 'Pending' || t.status === 'In Progress' || t.status === 'Approval');

/** Blocked = On Hold, Missing Info, or waiting on unmet dependencies. */
export const getBlockedTasks = (opp: Opportunity): Task[] => {
  const byId = new Map((opp.tasks || []).map(t => [t.id, t]));
  return (opp.tasks || []).filter(t => {
    if (isClosed(t)) return false;
    if (t.status === 'On Hold' || t.status === 'Missing Info') return true;
    const deps = t.dependsOnTaskIds || [];
    return deps.length > 0 && deps.some(id => {
      const dep = byId.get(id);
      return dep ? dep.status !== 'Done' : false;
    });
  });
};

export const getOverdueTasks = (opp: Opportunity): Task[] => {
  const today = todayIso();
  return (opp.tasks || []).filter(t => !isClosed(t) && !!t.dueDate && t.dueDate < today);
};

export const getMissingInfoTasks = (opp: Opportunity): Task[] =>
  (opp.tasks || []).filter(t => t.status === 'Missing Info');

/** The last (highest order) task that hasn't been finished yet, excluding ones already tracked as Missing Info. */
export const getLastPendingTask = (opp: Opportunity): Task | undefined => {
  const candidates = (opp.tasks || []).filter(t => t.status !== 'Done' && t.status !== 'Canceled' && t.status !== 'Missing Info');
  return [...candidates].sort((a, b) => (b.order ?? -Infinity) - (a.order ?? -Infinity))[0];
};

const daysLate = (dueDate: string): number => {
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000));
};

const LIST_STYLE = 'style="margin:0 0 10px 0;padding-left:20px;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222"';
const P_STYLE = 'style="margin:0 0 10px 0;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222"';

const taskLine = (t: Task, extra?: string): string => {
  const parts = [
    `<b>${escapeHtml(t.title)}</b>`,
    t.responsible ? escapeHtml(t.responsible) : '',
    t.dueDate ? `due ${escapeHtml(t.dueDate)}` : '',
    extra || '',
  ].filter(Boolean);
  return `<li>${parts.join(' &mdash; ')}</li>`;
};

// Empty lists render as '' (not "None") so {?...} conditional blocks can hide the whole section.
const taskListHtml = (tasks: Task[], extraFor?: (t: Task) => string): string =>
  tasks.length
    ? `<ul ${LIST_STYLE}>${tasks.map(t => taskLine(t, extraFor?.(t))).join('')}</ul>`
    : '';

/** Like taskLine, but never shows status/stage and appends the task description (if any) on its own line. */
const taskLineNoStage = (t: Task): string => {
  const parts = [
    `<b>${escapeHtml(t.title)}</b>`,
    t.responsible ? escapeHtml(t.responsible) : '',
    t.dueDate ? `due ${escapeHtml(t.dueDate)}` : '',
  ].filter(Boolean);
  const desc = t.description?.trim() ? `<br/><span style="color:#666">${escapeHtml(t.description)}</span>` : '';
  return `<li>${parts.join(' &mdash; ')}${desc}</li>`;
};

const taskListHtmlNoStage = (tasks: Task[]): string =>
  tasks.length ? `<ul ${LIST_STYLE}>${tasks.map(taskLineNoStage).join('')}</ul>` : '';

/** Clickable link, shown as its URL (Outlook-friendly); '' when there is no URL. */
const linkAnchor = (url: string): string =>
  url ? `<a href="${escapeHtml(url)}" style="color:#2563eb">${escapeHtml(url)}</a>` : '';

const bulletListHtml = (items: string[]): string =>
  items.length ? `<ul ${LIST_STYLE}>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';

// ---------------------------------------------------------------------------
// Recipients: resolve team-member ids / names to stakeholder or directory emails
// ---------------------------------------------------------------------------

const matchByName = (name: string, stakeholders: Person[], globalContacts: GlobalContact[]): EmailRecipient | null => {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const person = stakeholders.find(p => p.name.trim().toLowerCase() === needle);
  if (person?.email) return { name: person.name, email: person.email };
  const contact = globalContacts.find(c => c.name.trim().toLowerCase() === needle);
  if (contact?.email) return { name: contact.name, email: contact.email };
  return null;
};

/**
 * Team-member ids can be a stakeholder Person.id, a GlobalContact.id, or a
 * legacy "name|area" key from the SOW Team Involved section.
 */
export const resolveTeamMemberRecipients = (
  ids: string[] | undefined,
  stakeholders: Person[] = [],
  globalContacts: GlobalContact[] = []
): EmailRecipient[] => {
  const out: EmailRecipient[] = [];
  for (const id of ids || []) {
    const person = stakeholders.find(p => p.id === id);
    if (person?.email) { out.push({ name: person.name, email: person.email }); continue; }
    const contact = globalContacts.find(c => c.id === id);
    if (contact?.email) { out.push({ name: contact.name, email: contact.email }); continue; }
    const name = id.includes('|') ? id.split('|')[0] : (person?.name || id);
    const match = matchByName(name, stakeholders, globalContacts);
    if (match) out.push(match);
  }
  const seen = new Set<string>();
  return out.filter(r => {
    const key = r.email.toLowerCase();
    return seen.has(key) ? false : !!seen.add(key);
  });
};

/** Best-effort recipient for the person responsible for a task. */
export const resolveTaskResponsibleRecipients = (
  task: Task,
  stakeholders: Person[] = [],
  globalContacts: GlobalContact[] = []
): EmailRecipient[] => {
  const fromIds = resolveTeamMemberRecipients(task.responsibleTeamMemberIds, stakeholders, globalContacts);
  if (fromIds.length) return fromIds;
  const match = task.responsible ? matchByName(task.responsible, stakeholders, globalContacts) : null;
  return match ? [match] : [];
};

/**
 * The seller/CSE always approves price approvals. Resolve them from opp.seller (matched
 * against stakeholders/directory to get an email) or, failing that, from a stakeholder
 * whose role(s) mention "CSE" or "Seller".
 */
export const resolveSellerRecipient = (
  opp: Opportunity,
  stakeholders: Person[] = [],
  globalContacts: GlobalContact[] = []
): EmailRecipient | null => {
  if (opp.seller) {
    const match = matchByName(opp.seller, stakeholders, globalContacts);
    if (match) return match;
  }
  const bySellerRole = stakeholders.find(p => {
    const roles = p.roles?.length ? p.roles : (p.role ? [p.role] : []);
    return roles.some(r => /cse|seller/i.test(r));
  });
  if (bySellerRole?.email) return { name: bySellerRole.name, email: bySellerRole.email };
  if (opp.seller) return { name: opp.seller, email: '' };
  return null;
};

const teamMemberNames = (
  ids: string[] | undefined,
  stakeholders: Person[] = [],
  globalContacts: GlobalContact[] = []
): string[] =>
  (ids || []).map(id => {
    const person = stakeholders.find(p => p.id === id);
    if (person) return person.name;
    const contact = globalContacts.find(c => c.id === id);
    if (contact) return contact.name;
    return id.includes('|') ? id.split('|')[0] : id;
  }).filter(Boolean);

// ---------------------------------------------------------------------------
// Quick links (legacy object form and QuickLinkItem[] form)
// ---------------------------------------------------------------------------

const QUICK_LINK_ALIASES: Record<string, string[]> = {
  srLink: ['srlink', 'sr', 'supportrequest', 'supportrequestlink'],
  bfo: ['bfo', 'bfolink'],
  cqaLink: ['cqa', 'cqalink', 'cqa20', 'cqa20link'],
  folder: ['folder', 'internalfolder', 'officialfolder', 'folderlink'],
  ba: ['ba', 'balink', 'basket', 'basketlink'],
  geet: ['geet', 'geetlink'],
};

const normKey = (value: string | undefined) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const resolveQuickLinkUrls = (links: Opportunity['links']): Record<string, string> => {
  const urls: Record<string, string> = { srLink: '', bfo: '', cqaLink: '', folder: '', ba: '', geet: '' };
  const items: { key: string; url: string }[] = Array.isArray(links)
    ? (links as QuickLinkItem[]).filter(l => l.type === 'link' || !l.type).flatMap(l => [
        { key: normKey(l.id), url: l.url || '' },
        { key: normKey(l.label), url: l.url || '' },
      ])
    : Object.entries(links || {}).map(([k, v]) => ({ key: normKey(k), url: typeof v === 'string' ? v : '' }));

  for (const [id, aliases] of Object.entries(QUICK_LINK_ALIASES)) {
    const all = [normKey(id), ...aliases];
    const hit = items.find(item => item.url && all.includes(item.key));
    if (hit) urls[id] = hit.url;
  }
  return urls;
};

// ---------------------------------------------------------------------------
// Commercial helpers
// ---------------------------------------------------------------------------

const commercialTableHtml = (opp: Opportunity): string => {
  const sections = opp.commercial?.customSections || [];
  if (!sections.length) return '';
  const td = 'style="border:1px solid #d1d5db;padding:4px 10px;font-family:Calibri,Arial,sans-serif;font-size:10.5pt"';
  const th = 'style="border:1px solid #d1d5db;padding:4px 10px;font-family:Calibri,Arial,sans-serif;font-size:10.5pt;background:#f3f4f6;text-align:left"';
  const rows = sections.map(s =>
    `<tr><td ${td}>${escapeHtml(s.name)}</td><td ${td} align="right">${fmtMoney(s.cost)}</td><td ${td} align="right">${fmtMoney(s.margin)}%</td><td ${td} align="right">${fmtMoney(s.sellPrice)}</td></tr>`
  ).join('');
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 10px 0"><tr><th ${th}>Section</th><th ${th}>Cost</th><th ${th}>Margin</th><th ${th}>Sell price</th></tr>${rows}</table>`;
};

const SUMMARY_H = 'style="margin:14px 0 4px 0;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#3DCD58;font-weight:bold"';

/** Mirrors the "Copy Summary" executive summary (OpportunityDetail.generateExecutiveSummary), formatted as HTML for email. */
const buildExecutiveSummaryHtml = (opp: Opportunity, paCost: string): string => {
  const links = resolveQuickLinkUrls(opp.links);
  const cqaSellPrice = typeof opp.commercial?.cqaOfficialSellPrice === 'number' && opp.commercial.cqaOfficialSellPrice
    ? `$${opp.commercial.cqaOfficialSellPrice.toLocaleString()}`
    : '-';
  const cqaMargin = typeof opp.commercial?.cqaOfficialMargin === 'number' && opp.commercial.cqaOfficialMargin
    ? `${opp.commercial.cqaOfficialMargin}%`
    : '-';
  return [
    `<p ${P_STYLE}><b>Requested Date:</b> ${escapeHtml(opp.dates?.requested || '-')} &nbsp;|&nbsp; <b>Expected Completion Date:</b> ${escapeHtml(opp.dates?.expected || '-')}</p>`,
    `<p ${SUMMARY_H}>Executive Notes</p>`,
    `<p ${P_STYLE}>${nl2br(opp.presentation?.executiveSummary || '-')}</p>`,
    `<p ${SUMMARY_H}>Commercial Information</p>`,
    `<p ${P_STYLE}>CQA Sell Price: ${cqaSellPrice}<br/>GM CCO: ${cqaMargin}<br/>Notes / Discounts Logic: ${escapeHtml(opp.commercial?.discountsAndNotes || '-')}${paCost ? `<br/>PA Cost: ${escapeHtml(paCost)}` : ''}</p>`,
    `<p ${SUMMARY_H}>Required Links</p>`,
    `<p ${P_STYLE}>SR Link: ${linkAnchor(links.srLink) || '-'}<br/>CQA 2.0 Link: ${linkAnchor(links.cqaLink) || '-'}</p>`,
  ].join('');
};

/** First token of a full name (e.g. "Alan Merida" -> "Alan"). Falls back to the raw value if there's no space. */
const firstNameOf = (fullName: string): string => (fullName.trim().split(/\s+/)[0] || fullName).trim();

/** Resolve a To-recipient email back to a display name via stakeholders/directory; falls back to the email's local part. */
const nameForEmail = (email: string, stakeholders: Person[], globalContacts: GlobalContact[]): string => {
  const needle = email.trim().toLowerCase();
  const person = stakeholders.find(p => p.email?.toLowerCase() === needle);
  if (person?.name) return person.name;
  const contact = globalContacts.find(c => c.email?.toLowerCase() === needle);
  if (contact?.name) return contact.name;
  const local = email.split('@')[0] || email;
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

/** Salutation words per tone; '' means "name only" ("Luis," / "Team,"). */
export const GREETING_STYLES: Record<'friendly' | 'executive', string[]> = {
  friendly: ['Hi', 'Hello', ''],
  executive: ['Dear', ''],
};

/** First names of the To recipients, resolved via stakeholders/directory (for greetings & history events). */
export const recipientFirstNames = (toEmails: string[], stakeholders: Person[] = [], globalContacts: GlobalContact[] = []): string[] =>
  toEmails.map(e => firstNameOf(nameForEmail(e, stakeholders, globalContacts))).filter(Boolean);

/**
 * Greeting based on the "To" recipients only (CC does not count).
 * The salutation word rotates (Hi/Hello/name for friendly, Dear/name for executive)
 * so daily emails don't all read identical; styleIndex picks the variant.
 * 1 -> "Hi Luis,"  2 -> "Hi Luis and María,"  3+ -> "Hi team,"
 */
export const buildGreeting = (
  toEmails: string[],
  stakeholders: Person[] = [],
  globalContacts: GlobalContact[] = [],
  tone: 'friendly' | 'executive' = 'friendly',
  styleIndex = 0
): string => {
  const styles = GREETING_STYLES[tone];
  const word = styles[((styleIndex % styles.length) + styles.length) % styles.length];
  const names = recipientFirstNames(toEmails, stakeholders, globalContacts);
  const who = names.length === 0 ? (tone === 'executive' ? 'all' : '')
    : names.length === 1 ? escapeHtml(names[0])
    : names.length === 2 ? `${escapeHtml(names[0])} and ${escapeHtml(names[1])}`
    : 'team';
  if (!who) return `${word || 'Hello'},`;
  const label = word ? `${word} ${who}` : who.charAt(0).toUpperCase() + who.slice(1);
  return `${label},`;
};

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

const lastHistoryEntry = (opp: Opportunity): HistoryEntry | undefined => {
  const entries = [...(opp.history || [])].filter(h => (h.content || '').trim());
  entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return entries[0];
};

/** Build {fullOpportunityName} with the configurable format. */
export const buildFullOpportunityName = (opp: Opportunity, fullNameFormat: string): string =>
  fullNameFormat
    .replace(/\{opId\}/g, opp.id || '')
    .replace(/\{customer\}/g, opp.customer || '')
    .replace(/\{projectTitle\}/g, opp.title || '')
    .replace(/\{alias\}/g, opp.alias || '')
    .replace(/\{srId\}/g, opp.srId || '')
    .replace(/\{revision\}/g, opp.revision || '')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .trim();

export const buildEmailContext = (
  opp: Opportunity,
  settings: EmailComposeSettings,
  opts: ComposeContextOptions = {}
): Record<string, string> => {
  const stakeholders = opts.stakeholders ?? (opp.stakeholders || []);
  const globalContacts = opts.globalContacts || [];
  const links = resolveQuickLinkUrls(opp.links);
  const completed = getCompletedTasks(opp);
  const pending = getPendingTasks(opp);
  const blocked = getBlockedTasks(opp);
  const overdue = getOverdueTasks(opp);
  const last = lastHistoryEntry(opp);
  const sections = opp.commercial?.customSections || [];
  const totalCost = sections.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
  const totalSell = sections.reduce((sum, s) => sum + (Number(s.sellPrice) || 0), 0);
  const versions = opp.versions || [];
  const lastVersion = versions[versions.length - 1];
  const task = opts.task;
  const reminderTasks = opts.selectedTasks && opts.selectedTasks.length
    ? opts.selectedTasks
    : [...overdue, ...pending.filter(t => !overdue.includes(t))];
  const missingInfo = getMissingInfoTasks(opp);
  const lastPendingTask = getLastPendingTask(opp);
  const openQuestions = (opp.questions || []).filter(q => !q.isResolved);
  const manual = opts.manual || {};
  const deliverable = manual.taskDeliverable
    || task?.deliverable
    || (opts.taskLinkedDocNames || []).join(', ');
  const paCost = manual.paCost || (typeof opp.commercial?.paCost === 'number' ? fmtMoney(opp.commercial.paCost) : '');
  const revisionType = manual.revisionType || 'draft';
  const revisionNotice = revisionType === 'final'
    ? "This is the <b>FINAL</b> revision. Unless there are further changes, we will proceed to close the SR."
    : "This is a <b>DRAFT</b> revision — I would appreciate your comments and feedback.";
  const priceApprovalBlock = manual.includePriceApproval
    ? `<p ${SUMMARY_H}>Price Approval — @${escapeHtml(manual.sellerName || 'CSE/Seller')}</p>${buildExecutiveSummaryHtml(opp, paCost)}`
    : '';

  // --- Tone, stage and section switches -----------------------------------
  const kind = opts.kind;
  const tone = toneForKind(kind);
  const stage: 'first' | 'followup' = kindHasStage(kind) ? (manual.requestStage || 'first') : 'first';
  const on = (key: string, fallback = true) => sectionOn(kind, manual, key, fallback);
  const full = `<b>${escapeHtml(buildFullOpportunityName(opp, settings.fullNameFormat))}</b>`;
  const dueF = fmtFriendlyDate(manual.dueDate);
  const firstF = fmtFriendlyDate(manual.firstRequestDate);
  const onDate = firstF ? ` on <b>${escapeHtml(firstF)}</b>` : '';
  const dueB = dueF ? `<b>${escapeHtml(dueF)}</b>` : '';

  // What is being requested (Info Request): inline mention for one item, list for several.
  const items = (manual.requestItems || []).map(s => s.trim()).filter(Boolean);
  const itemsInline = items.length === 1 ? `the <b>${escapeHtml(items[0])}</b>`
    : items.length ? 'the following information' : 'the information below';
  const requestItemsList = items.length > 1 ? bulletListHtml(items) : '';

  // Opening sentence per kind and stage.
  let requestOpening = '';
  if (kind === 'info_request') {
    requestOpening = stage === 'first'
      ? `To keep ${full} moving, could you please help us with ${itemsInline}${items.length > 1 ? ':' : '?'}`
      : `Just checking in on ${items.length === 1 ? itemsInline : 'the information'} I requested${onDate} for ${full} — could you share a quick status update?`;
  } else if (kind === 'task_assignment') {
    const taskRef = task?.title ? `<b>${escapeHtml(task.title)}</b>` : 'the item below';
    requestOpening = stage === 'first'
      ? `To keep ${full} moving, I'd like to ask for your support with ${taskRef}. Your input here is key to getting this proposal out on time.`
      : `Just checking in on ${taskRef} for ${full}${firstF ? `, which I reached out about on <b>${escapeHtml(firstF)}</b>` : ''} — could you share a quick status update?`;
  } else if (kind === 'price_approval') {
    const priceMode = manual.priceMode || 'approve';
    const sell = typeof opp.commercial?.cqaOfficialSellPrice === 'number' && opp.commercial.cqaOfficialSellPrice
      ? `$${opp.commercial.cqaOfficialSellPrice.toLocaleString()}` : '';
    const margin = typeof opp.commercial?.cqaOfficialMargin === 'number' && opp.commercial.cqaOfficialMargin
      ? ` (GM ${opp.commercial.cqaOfficialMargin}%)` : '';
    const priceInline = sell ? ` of <b>${escapeHtml(sell)}${escapeHtml(margin)}</b>` : '';
    if (stage === 'first') {
      requestOpening = priceMode === 'verify'
        ? `Before finalizing ${full}, I would like to request your validation of the current sell price${priceInline}.`
        : `I would like to request your approval of the sell price for ${full}.`;
    } else {
      requestOpening = priceMode === 'verify'
        ? `I would like to follow up on the sell-price validation for ${full} requested${onDate}.`
        : `I would like to follow up on the price approval for ${full} requested${onDate}.`;
    }
  } else if (kind === 'proposal_approval') {
    requestOpening = stage === 'first'
      ? `Please find attached the proposal for ${full} for your review.`
      : `I would like to follow up on the proposal for ${full} shared${onDate}.`;
  } else if (kind === 'reminder') {
    requestOpening = `Just a friendly reminder on the items below for ${full} — could you share a quick status update?`;
  } else if (kind === 'status_report') {
    requestOpening = `Please find below a quick status of ${full} as of ${escapeHtml(fmtFriendlyDate(todayIso()))}.`;
  }

  // Closing ask (date-bound when a due date was picked) per kind, stage and tone.
  let requestClosing = '';
  if (kind === 'info_request' || kind === 'task_assignment') {
    if (stage === 'first') {
      const share = kind === 'task_assignment' ? 'have it ready' : 'share this';
      requestClosing = dueB
        ? `Would you be able to ${share} by ${dueB}? Thank you in advance!`
        : `Could you ${kind === 'task_assignment' ? 'let me know when you would be able to have it ready' : 'please share it when you have a chance'}? Thank you in advance!`;
    } else {
      requestClosing = dueB
        ? `We'd need it by ${dueB} to stay on schedule — thanks so much for your help!`
        : `Thanks so much for your help!`;
    }
  } else if (kind === 'reminder') {
    requestClosing = dueB
      ? `We'd need these by ${dueB} to stay on schedule — thanks so much for your help!`
      : `Thanks so much for your help!`;
  } else if (kind === 'price_approval') {
    const priceMode = manual.priceMode || 'approve';
    if (priceMode === 'verify') {
      requestClosing = `Please confirm whether this price stands, or advise the adjustment you consider appropriate, ${dueB ? `by ${dueB}` : 'at your earliest convenience'}.`;
    } else {
      requestClosing = stage === 'first'
        ? `Kindly confirm your approval ${dueB ? `by ${dueB}` : 'at your earliest convenience'} so we can proceed with the submission.`
        : `Kindly advise ${dueB ? `by ${dueB}` : 'at your earliest convenience'} so we can proceed with the submission.`;
    }
  } else if (kind === 'proposal_approval') {
    requestClosing = stage === 'first'
      ? (dueB ? `I would appreciate your comments by ${dueB}; otherwise we will proceed as presented.` : `I would appreciate your comments at your earliest convenience.`)
      : `Kindly share your comments ${dueB ? `by ${dueB}` : 'at your earliest convenience'} so we can move forward.`;
  }

  // Optional courtesy lines (friendly tone only).
  const wellWishLine = tone === 'friendly' && on('wellWish') ? " I hope you're doing well." : '';
  const callOfferLine = on('callOffer', false) ? 'Happy to jump on a call if anything needs clarification.' : '';

  // Links block: every quick link with a URL, as clickable anchors.
  const availableLinks: [string, string][] = [
    ['SR', links.srLink], ['CQA 2.0', links.cqaLink], ['bFO', links.bfo],
  ];
  const linksBlock = on('links', false)
    ? (() => {
        const parts = availableLinks.filter(([, url]) => url).map(([label, url]) => `${label}: ${linkAnchor(url)}`);
        return parts.length ? `<p ${P_STYLE}><b>Links:</b><br/>${parts.join('<br/>')}</p>` : '';
      })()
    : '';

  // Status report extras: progress counters + a chosen history entry (defaults to the latest).
  const progressLine = on('progress', false)
    ? `Progress so far: <b>${completed.length} done</b> · ${pending.length} in progress · ${blocked.length} blocked.`
    : '';
  const historyEntries = (opp.history || []).filter(h => (h.content || '').trim());
  const selectedHistory = (manual.historyEntryId && historyEntries.find(h => h.id === manual.historyEntryId)) || last;
  const selectedHistoryComment = on('history') ? nl2br(selectedHistory?.content || '') : '';
  const selectedHistoryDate = on('history') ? fmtDate(selectedHistory?.date) : '';

  const expectedF = fmtFriendlyDate(opp.dates?.expected);
  const expectedDateLine = on('expectedDate') && expectedF
    ? (kind === 'reminder'
        ? `To stay on schedule, we're aiming to close everything by <b>${escapeHtml(expectedF)}</b>.`
        : `Expected delivery of this opportunity: <b>${escapeHtml(expectedF)}</b>.`)
    : '';

  // Selected open questions (Info Request / Proposal review points).
  const selectedQuestions = manual.selectedQuestionIds
    ? openQuestions.filter(q => manual.selectedQuestionIds!.includes(q.id))
    : openQuestions;
  const openQuestionsSelList = on('openQuestions') && selectedQuestions.length
    ? `<ul ${LIST_STYLE}>${selectedQuestions.map(q => `<li>${escapeHtml(q.question || q.quote)}</li>`).join('')}</ul>`
    : '';

  // Meeting recap: agreements bullets + next steps built from the selected tasks.
  const meetingF = fmtFriendlyDate(manual.meetingDate);
  const recapIntro = kind === 'meeting_recap'
    ? `Thank you for your time ${manual.meetingDate && manual.meetingDate !== todayIso() ? `on <b>${escapeHtml(meetingF)}</b>` : 'today'} — here's a quick recap of what we agreed for ${full}:`
    : '';
  const agreementsList = on('agreements')
    ? bulletListHtml((manual.agreements || '').split('\n').map(l => l.trim()).filter(Boolean))
    : '';
  const recapTasks = opts.selectedTasks || [];
  const nextStepsList = on('nextSteps') && kind === 'meeting_recap' && recapTasks.length
    ? `<ul ${LIST_STYLE}>${recapTasks.map(t => {
        const owner = t.responsible ? ` — ${escapeHtml(t.responsible)}` : '';
        const due = t.responsibleDueDate || t.dueDate;
        return `<li><b>${escapeHtml(t.title)}</b>${owner}${due ? ` — due <b>${escapeHtml(fmtFriendlyDate(due))}</b>` : ''}</li>`;
      }).join('')}</ul>`
    : '';
  const nextMeetingLine = on('nextMeeting') && manual.nextMeetingDate
    ? `Next meeting: <b>${escapeHtml(fmtFriendlyDate(manual.nextMeetingDate))}</b>.`
    : '';

  // Proposal approval meta line (revision / version / needed-by).
  const proposalMetaBlock = on('meta')
    ? `<p ${P_STYLE}><b>Revision:</b> ${escapeHtml(opp.revision || '-')}` +
      (lastVersion ? `<br/><b>Version:</b> ${escapeHtml(`${lastVersion.commitMessage || lastVersion.srId || ''} (${(lastVersion.createdAt || '').slice(0, 10)})`)}` : '') +
      (dueF ? `<br/><b>Needed by:</b> ${escapeHtml(dueF)}` : (opp.dates?.requested ? `<br/><b>Required date:</b> ${escapeHtml(opp.dates.requested)}` : '')) +
      `</p>`
    : '';

  const ctx: Record<string, string> = {
    // General
    opId: opp.id || '',
    srId: opp.srId || '',
    quoteLink: opp.qlk || '',
    customer: escapeHtml(opp.customer || ''),
    projectTitle: escapeHtml(opp.title || ''),
    alias: escapeHtml(opp.alias || ''),
    fullOpportunityName: escapeHtml(buildFullOpportunityName(opp, settings.fullNameFormat)),
    seller: escapeHtml(opp.seller || ''),
    revision: escapeHtml(opp.revision || ''),
    stage: escapeHtml(opp.stage || ''),
    status: escapeHtml(opp.statusLabel || ''),
    userName: escapeHtml(opts.userName || ''),
    greeting: buildGreeting(opts.toEmails || [], stakeholders, globalContacts, tone, manual.greetingStyle ?? 0),
    wellWishLine,
    callOfferLine,
    requestOpening,
    requestClosing,
    requestItemsList,
    linksBlock,
    stakeholdersList: bulletListHtml(stakeholders.map(p => {
      const roles = p.roles?.length ? p.roles : (p.role ? [p.role] : []);
      return `${p.name}${roles.length ? ` (${roles.join(', ')})` : ''}${p.email ? ` — ${p.email}` : ''}`;
    })),
    // Dates
    requestedDate: fmtDate(opp.dates?.requested),
    expectedDate: fmtDate(opp.dates?.expected),
    assignedDate: fmtDate(opp.dates?.assigned),
    today: todayIso(),
    todayFriendly: escapeHtml(fmtFriendlyDate(todayIso())),
    dueDateFriendly: escapeHtml(dueF),
    firstRequestDateFriendly: escapeHtml(firstF),
    expectedDateLine,
    // Links (clickable anchors; empty string when the link is not set)
    bfoLink: linkAnchor(links.bfo),
    cqaLink: linkAnchor(links.cqaLink),
    srLink: linkAnchor(links.srLink),
    folderLink: linkAnchor(links.folder),
    baLink: linkAnchor(links.ba),
    geetLink: linkAnchor(links.geet),
    // Status report
    tasksCompletedList: taskListHtml(completed),
    tasksPendingList: taskListHtml(pending, t => escapeHtml(t.status)),
    tasksBlockedList: taskListHtml(blocked, t => escapeHtml(t.status === 'On Hold' || t.status === 'Missing Info' ? t.status : 'Waiting on dependencies')),
    tasksCompletedCount: String(completed.length),
    tasksPendingCount: String(pending.length),
    tasksBlockedCount: String(blocked.length),
    progressLine,
    lastPendingTaskList: on('nextTask') ? taskListHtmlNoStage(lastPendingTask ? [lastPendingTask] : []) : '',
    lastHistoryComment: nl2br(last?.content || ''),
    lastHistoryDate: fmtDate(last?.date),
    selectedHistoryComment,
    selectedHistoryDate,
    // Commercial
    commercialTable: on('commercialTable') ? commercialTableHtml(opp) : '',
    totalCost: fmtMoney(totalCost),
    totalSellPrice: fmtMoney(totalSell),
    cqaOfficialSellPrice: fmtMoney(opp.commercial?.cqaOfficialSellPrice),
    cqaOfficialMargin: fmtMoney(opp.commercial?.cqaOfficialMargin),
    currency: opp.commercial?.currency || '',
    paCost,
    executiveSummaryBlock: on('summary') ? buildExecutiveSummaryHtml(opp, paCost) : '',
    // Proposal
    versionInfo: lastVersion ? escapeHtml(`${lastVersion.commitMessage || lastVersion.srId || ''} (${(lastVersion.createdAt || '').slice(0, 10)})`) : '',
    proposalDocList: on('docs') ? bulletListHtml(opts.attachmentNames || []) : '',
    proposalMetaBlock,
    requiredDate: fmtDate(opp.dates?.requested),
    reviewPoints: nl2br(manual.reviewPoints || ''),
    changeNotes: nl2br(manual.changeNotes || ''),
    revisionNotice,
    priceApprovalBlock,
    // Task
    taskTitle: escapeHtml(task?.title || ''),
    taskDescription: on('description') ? nl2br(task?.description || '') : '',
    taskResponsible: escapeHtml(task?.responsible || teamMemberNames(task?.responsibleTeamMemberIds, stakeholders, globalContacts).join(', ')),
    taskAssignedDate: fmtDate(task?.responsibleRequestedDate) || todayIso(),
    taskDueDate: fmtDate(task?.responsibleDueDate) || fmtDate(task?.dueDate),
    taskPriority: escapeHtml(task?.priority || ''),
    taskDeliverable: on('deliverable') ? nl2br(deliverable) : '',
    taskSubtasksList: on('subtasks') && task?.subtasks?.length
      ? `<ul ${LIST_STYLE}>${task.subtasks.map(s => `<li>${s.completed ? '&#9745;' : '&#9744;'} ${escapeHtml(s.title)}</li>`).join('')}</ul>`
      : '',
    taskApprovers: escapeHtml(teamMemberNames(task?.approverTeamMemberIds, stakeholders, globalContacts).join(', ')),
    taskInformed: escapeHtml(teamMemberNames(task?.informedTeamMemberIds, stakeholders, globalContacts).join(', ')),
    approvalRequiredDate: fmtDate(task?.approvalDueDate),
    // Reminder
    overdueTasksList: taskListHtml(overdue, t => `<span style="color:#dc2626">${daysLate(t.dueDate)} day(s) late</span>`),
    pendingTasksList: taskListHtml(pending, t => escapeHtml(t.status)),
    reminderTasksList: taskListHtml(reminderTasks, t => t.dueDate && t.dueDate < todayIso()
      ? `<span style="color:#dc2626">${daysLate(t.dueDate)} day(s) late</span>`
      : escapeHtml(t.status)),
    // Info request
    missingInfoTasksList: on('missingInfo') ? taskListHtmlNoStage(missingInfo) : '',
    openQuestionsList: openQuestions.length
      ? `<ul ${LIST_STYLE}>${openQuestions.map(q => `<li>${escapeHtml(q.question || q.quote)}</li>`).join('')}</ul>`
      : '',
    openQuestionsSelList,
    infoNeededBullets: manual.infoNeededBullets
      ? bulletListHtml(manual.infoNeededBullets.split('\n').map(l => l.trim()).filter(Boolean))
      : '',
    // Meeting recap
    recapIntro,
    agreementsList,
    nextStepsList,
    nextMeetingLine,
  };
  return ctx;
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const MISSING_VAR_STYLE = 'background:#fef3c7;color:#92400e;padding:0 3px;border-radius:3px';

/** {?var}...{/?} — the block only renders when var resolves to non-empty content. Not nestable. */
const COND_TOKEN = /\{\?([a-zA-Z][a-zA-Z0-9_]*)\}([\s\S]*?)\{\/\?\}/g;

const resolveConditionals = (template: string, ctx: Record<string, string>): string =>
  template.replace(COND_TOKEN, (raw, name: string, content: string) =>
    name in ctx ? (String(ctx[name]).trim() ? content : '') : raw);

/** Template with every conditional block stripped — what always renders regardless of data. */
export const stripConditionalBlocks = (template: string): string => template.replace(COND_TOKEN, '');

/** Render an HTML template; unknown variables get a highlighted marker. */
export const renderTemplate = (template: string, ctx: Record<string, string>): string =>
  resolveConditionals(template, ctx).replace(VAR_TOKEN, (raw, name: string) =>
    name in ctx ? ctx[name] : `<span data-missing-var="${name}" style="${MISSING_VAR_STYLE}">{${name}}</span>`);

/** Render plain text (subjects): unknown variables stay as-is. */
export const renderPlainTemplate = (template: string, ctx: Record<string, string>): string =>
  resolveConditionals(template, ctx).replace(VAR_TOKEN, (raw, name: string) => (name in ctx ? stripHtml(ctx[name]) : raw));

const stripHtml = (value: string): string =>
  value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ');

export const findTemplateVariables = (template: string): string[] => {
  const names = new Set<string>();
  for (const match of template.matchAll(VAR_TOKEN)) names.add(match[1]);
  return [...names];
};

export const buildEmailDraft = (
  template: EmailTemplate,
  opp: Opportunity,
  settings: EmailComposeSettings,
  opts: ComposeContextOptions = {}
): EmailDraft => {
  const ctx = buildEmailContext(opp, settings, { ...opts, kind: opts.kind || template.kind });
  let topic = template.topicLabel;
  if (template.kind === 'price_approval' && opts.manual?.priceMode === 'verify') topic = 'Price Verification';
  if (kindHasStage(template.kind) && opts.manual?.requestStage === 'followup') topic = `Follow-up: ${topic}`;
  ctx.topic = escapeHtml(topic);
  const subjectFormat = template.subjectFormat || settings.subjectFormat;
  const subject = renderPlainTemplate(subjectFormat, ctx);
  const bodyHtml = renderTemplate(template.bodyHtml, ctx);
  const used = [...findTemplateVariables(subjectFormat), ...findTemplateVariables(template.bodyHtml)];
  const unknownVariables = used.filter(name => !(name in ctx));
  // Variables that only appear inside {?...} conditional blocks are intentionally
  // optional — don't nag about them being empty.
  const alwaysUsed = [...findTemplateVariables(subjectFormat), ...findTemplateVariables(stripConditionalBlocks(template.bodyHtml))];
  const emptyVariables = alwaysUsed.filter(name => name in ctx && !String(ctx[name]).trim());
  return { subject, bodyHtml, unknownVariables, emptyVariables };
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ComposedEmailInput {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  unknownVariables?: string[];
  emptyVariables?: string[];
  outlookMode?: 'auto' | 'com' | 'eml';
}

export interface EmailValidationResult {
  errors: string[];
  warnings: string[];
}

export const validateComposedEmail = (input: ComposedEmailInput): EmailValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.to.length) errors.push('Add at least one recipient in "To".');
  for (const [label, list] of [['To', input.to], ['CC', input.cc], ['BCC', input.bcc]] as const) {
    const bad = list.filter(e => !EMAIL_ADDRESS_REGEX.test(e));
    if (bad.length) errors.push(`Invalid ${label} address: ${bad.join(', ')}`);
  }
  if (!input.subject.trim()) errors.push('Subject is empty.');

  const unknown = input.unknownVariables || [];
  if (unknown.length) warnings.push(`Unknown variables (left as-is): ${unknown.map(v => `{${v}}`).join(', ')}`);
  const empty = input.emptyVariables || [];
  if (empty.length) warnings.push(`Variables without value: ${empty.map(v => `{${v}}`).join(', ')}`);
  if (/\b(undefined|NaN)\b/.test(input.bodyHtml)) warnings.push('The body contains "undefined" or "NaN" — check the data.');
  if (input.bcc.length && input.outlookMode === 'eml') warnings.push('BCC is not reliable when opening drafts as .eml (new Outlook).');

  return { errors, warnings };
};
