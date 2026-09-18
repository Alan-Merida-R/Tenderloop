import { AlarmConfig, DEFAULT_FOCUS_POLICY, DEFAULT_PERSONAL_CONSTRAINTS, FocusPolicy, MeetingNote, Opportunity, PersonalConstraints, Person, Reminder, Task } from '../../types';
import { FixedCommitment } from '../../services/commitmentExtractor';
import { getExpectedProposalDays, getProposalAgeTargets } from '../../services/proposalAlarmPolicy';
import { readScopeGlance } from '../../services/scopeSummary';
import type { ScopeCatalog } from '../../components/scopeCatalog';
import { isOpportunitySchedulable, isTaskActive } from '../schedule/scheduleHelpers';
import { getNextTask } from '../../services/taskUtils';
import { PROCESS_SECTIONS } from '../../services/processSections';
import { ExecutionModel, forecastTask, renderExecutionModelForPrompt } from '../../services/executionModel';

export interface OrganizerChip {
    id: string;
    label: string;
    /** Text appended to the prompt's "Extra instructions" section when this chip is active. */
    text: string;
}

/** Built-in quick-toggle chips offered in the UI (selectable, not exhaustive). */
export const ORGANIZER_CHIPS: OrganizerChip[] = [
    { id: 'work-hours', label: 'Work hours 8:00–17:00', text: 'Only schedule work blocks between 08:00 and 17:00, Monday to Friday.' },
    { id: 'skip-fridays', label: 'Skip Fridays', text: 'Do not schedule any work blocks on Fridays.' },
    { id: 'reschedule-all', label: 'Reschedule everything from scratch', text: 'Ignore any previously scheduled blocks and produce a brand-new schedule for every task listed below.' },
    { id: 'short-sessions', label: 'Prefer short sessions (<= 90 min)', text: 'Prefer work sessions of 90 minutes or less; split larger tasks into multiple sessions across the week.' },
    { id: 'mornings', label: 'Deep work in the mornings', text: 'Prefer scheduling the highest-priority / longest-pending tasks in the morning.' },
];

export interface TimeRange {
    start: string; // HH:mm
    end: string; // HH:mm
}

export interface BuildPromptOptions {
    userName: string;
    extraInstructions: string;
    activeChipIds: string[];
    /** ISO date (YYYY-MM-DD) used as "today" for pending-duration math. Defaults to now. */
    todayStr?: string;
    /**
     * Dates (YYYY-MM-DD) the AI is restricted to scheduling into, each with the specific time
     * window(s) the user is available that day. A date present as a key (even with an empty
     * array) restricts scheduling to that date; an empty/omitted map = no restriction at all.
     */
    dayWindows?: Record<string, TimeRange[]>;
    /** Opportunity ids to include. Empty/omitted = include every eligible opportunity. */
    oppIds?: string[];
    recommendationLanguage?: 'en' | 'es';
    /** Existing reminders are included so the AI does not propose the same follow-up again. */
    reminders?: Reminder[];
    /** Focus/recovery limits the schedule must respect. Omitted = DEFAULT_FOCUS_POLICY. */
    focusPolicy?: FocusPolicy;
    /** The user-calibrated execution model. Supplied so proposed dates are computed, not guessed. */
    executionModel?: ExecutionModel;
    /**
     * [TA6] Dates (YYYY-MM-DD) that must never receive a proposed/scheduled date, even when they
     * fall inside the allowed windows. The caller passes the user's real holiday list from
     * Settings → Holidays (the same list the KPI business-day math already uses), which is why
     * this is the authoritative source. Only when that list is empty does the built-in fixed-date
     * MX/US approximation below stand in, and the prompt says so explicitly.
     */
    holidays?: string[];
    /** IANA timezone used for every time in the prompt. Defaults to the browser's timezone. */
    timezone?: string;
    /**
     * [TA6] Meetings read out of the user's own notes, history events and reminders. They are
     * occupied time exactly like a scheduled block and are subtracted from capacity. Extracted by
     * services/commitmentExtractor.ts; the user can untick a wrong detection before generating.
     */
    fixedCommitments?: FixedCommitment[];
    /** [TA6] The user's own working shape (sleep, meals, deep-work window). */
    personalConstraints?: PersonalConstraints;
    /**
     * [TA6] Timezone assumed for stakeholders that have none recorded — in this workflow the
     * external counterparts are usually in Texas, so US Central is the honest default and is
     * always reported as an assumption.
     */
    stakeholderTimezone?: string;
    /**
     * [TA6 / audit O8, O9, F3] The proposal alarm policy. Its scope+amount day calculation is
     * already the app's measure of how big a proposal is, so it replaces the invented
     * `opportunityKind` / `customerDeadlineType` fields the audit asked for.
     */
    alarms?: AlarmConfig[];
    /** Scope catalog, needed to read the structured Scope selection rather than free text. */
    scopeCatalog?: ScopeCatalog;
}

/**
 * [TA6] Best-effort fixed-date holidays (MX + US) for the two years spanning "today", used only
 * until Settings grows a real holiday-list editor (see the audit's B-G4 item). Deliberately
 * limited to fixed-date holidays — floating ones (e.g. US Thanksgiving) need a rule, not a
 * literal date, so they are intentionally left out rather than risk a wrong date.
 */
const DEFAULT_HOLIDAYS_BY_YEAR = (year: number): string[] => [
    `${year}-01-01`, // Año Nuevo / New Year's Day
    `${year}-02-05`, // Día de la Constitución (MX, observed date varies; fixed approximation)
    `${year}-05-01`, // Día del Trabajo (MX)
    `${year}-07-04`, // Independence Day (US)
    `${year}-09-16`, // Día de la Independencia (MX)
    `${year}-11-11`, // Veterans Day (US)
    `${year}-11-20`, // Revolución Mexicana (MX, fixed approximation)
    `${year}-12-25`, // Navidad / Christmas
];

const weekdayName = (iso: string): string => {
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'long' });
};

const daysBetween = (fromIso: string, todayStr: string): number | null => {
    if (!fromIso) return null;
    const from = new Date(fromIso).getTime();
    const today = new Date(todayStr).getTime();
    if (isNaN(from) || isNaN(today)) return null;
    return Math.max(0, Math.round((today - from) / (1000 * 60 * 60 * 24)));
};

const findScopeText = (notes: MeetingNote[] | undefined): string => {
    const sowNote = (notes || []).find(n => n.format === 'sow' || n.type === 'Scope');
    if (!sowNote?.content) return '';
    try {
        const parsed = JSON.parse(sowNote.content);
        const fields = parsed && typeof parsed === 'object' && parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
        const included = typeof fields.included_scope === 'string' ? fields.included_scope : '';
        const summary = typeof fields.scope_summary === 'string' ? fields.scope_summary : '';
        const text = included.trim() ? included : summary;
        return text.replace(/\s+/g, ' ').trim();
    } catch {
        return sowNote.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
};

/**
 * [TA6 / audit T2, O1, O13] Truncation used to cut mid-word at ~120 characters, producing
 * unusable fragments ("refined as BOM, servi"). Values are now cut far later AND on a word
 * boundary, with an explicit marker so the assistant knows the text is incomplete instead of
 * silently reasoning over half a sentence. A cap still exists because the prompt must stay
 * pasteable into Copilot; it is a budget, not a default.
 */
const clip = (value: string, max: number): string => {
    const text = (value || '').trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const boundary = cut.lastIndexOf(' ');
    return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trim()} […truncated]`;
};

const compact = (value: string | undefined, max = 800): string => clip((value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), max);

const lastHistoryLines = (opp: Opportunity, n = 5): string[] => {
    return [...(opp.history || [])]
        .filter(h => h?.content?.trim())
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, n)
        .map(h => `  - [${h.date}] ${compact(h.content, 600)}`);
};

const missingFieldsFor = (task: Task): string[] => {
    const missing: string[] = [];
    if (!task.dueDate) missing.push('due date');
    if (!task.owner) missing.push('owner');
    if (!task.priority) missing.push('priority');
    return missing;
};

const taskAssignee = (task: Task): string => {
    if (task.owner === 'External Area') return task.externalAreas?.length ? task.externalAreas.join('/') : (task.responsible || 'External area (unspecified)');
    return task.responsible || 'Me';
};

/**
 * [TA6 / audit T6] The day the ball left the user's court.
 *
 * The p80 turnaround of an external area must be counted from the day the request was made, not
 * from today — counting it from today is what made an approval that was already 7 days overdue
 * look like it still had a week to run.
 */
const waitingSince = (task: Task): string | null => {
    if (task.status === 'Approval' || task.status === 'Changes Requested / Rework') {
        return task.approvalRequestedDate || task.responsibleRequestedDate || null;
    }
    if (task.status === 'Missing Info' || task.owner === 'External Area') {
        return task.responsibleRequestedDate || task.approvalRequestedDate || null;
    }
    return null;
};

/** [TA6 / audit T10] How many other tasks are waiting on this one — real leverage, not inferred. */
const blockingOthersCount = (task: Task, allTasks: Task[]): number =>
    allTasks.filter(other => other.id !== task.id && (other.dependsOnTaskIds || []).includes(task.id)).length;

/**
 * [TA6 / audit T11] Names the approver so an escalation can be addressed to a person.
 * Ids are either a stakeholder id or a "Name|Area" key, matching resolveTeamMemberRecipients.
 */
const resolveMemberNames = (ids: string[] | undefined, stakeholders: Person[]): string[] =>
    (ids || []).map(id => {
        const person = stakeholders.find(candidate => candidate.id === id);
        if (person) return person.email ? `${person.name} <${person.email}>` : person.name;
        return id.includes('|') ? id.split('|')[0] : id;
    }).filter(Boolean);

/** [TA6 / audit T15] How many times the task came back rejected. Predicts slip better than a median. */
const reworkCount = (task: Task): number =>
    (task.assignmentCycles || []).filter(cycle => cycle.reviewOutcome === 'changes_requested' || cycle.changesRequestedAt).length
    + (task.reworkForTaskId ? 1 : 0);

/**
 * [TA6 / audit A6, B18] Each planned block with what really happened on it, so "plan adherence"
 * can distinguish "I did not work" from "I did not log it", and a past block that was already
 * honoured is never rescheduled.
 */
const describeBlocks = (task: Task, todayStr: string): string => {
    const blocks = task.executionBlocks || [];
    if (!blocks.length) return 'none';
    const loggedDays = new Set((task.timeLogs || []).map(log => (log.start || '').slice(0, 10)).filter(Boolean));
    return blocks
        .map(block => {
            const outcome = block.date >= todayStr ? 'planned' : loggedDays.has(block.date) ? 'worked' : 'skipped';
            return `${block.date} ${block.startTime}-${block.endTime} (${outcome})`;
        })
        .join(', ');
};

/** [TA6 / audit T1] The subtasks the EXECUTION QUEUE is supposed to be built from. */
const describeSubtasks = (task: Task): string => {
    const subtasks = (task.subtasks || []).filter(sub => sub.title?.trim());
    if (!subtasks.length) return 'none';
    return subtasks
        .slice(0, 12)
        .map(sub => `${sub.title.replace(/\|/g, '/')}:${sub.completed ? 'done' : 'open'}${sub.assignmentPhase ? `/${sub.assignmentPhase}` : ''}`)
        .join('; ');
};

/**
 * [TA6 / audit T13, T14, T12] Shape of a task, inferred instead of captured.
 *
 * The audit asked for `splittable`, `minBlockMinutes` and `earliestStart` as new per-task fields.
 * Adding three more boxes to every task would cost more than it returns, and the answer is already
 * implicit in what the task IS: uploading a BOM cannot be done in two halves, writing a proposal
 * can, and a phone call cannot happen at 05:00. These are heuristics and the prompt labels them as
 * such, so the assistant treats them as defaults it may override with a stated reason — never as
 * facts the user asserted.
 */
const inferTaskShape = (task: Task): { splittable: boolean; minBlockMinutes: number; earliestStart: string | null } => {
    const title = stripAccents(`${task.title} ${task.description || ''}`.toLowerCase());
    const section = task.processSection || '';

    // Atomic actions: one sitting or nothing. Splitting them in half just loses the context twice.
    const atomic = /\b(cargar|subir|upload|load|enviar|send|submit|firmar|sign|aprobar|approve|cerrar|close|archivar|archive|agendar|schedule|copiar|copy|descargar|download)\b/.test(title);
    // Conversations happen at a time, with someone else, and cannot be sliced either.
    const conversational = /\b(llamada|llamar|call|junta|reunion|meeting|entrevista|visita|demo|presentacion|presentar)\b/.test(title);
    // Portals, calls and anything involving another person do not start before business hours.
    const needsBusinessHours = conversational || /\b(portal|bfo|cqa|basket|salesforce|geet|cliente|customer|proveedor|supplier)\b/.test(title);

    const deepWork = /Costing|Proposal Development|Scope Definition/i.test(section)
        || /\b(cotiz|costeo|costing|price|precio|propuesta|proposal|scope|alcance|bom|dise|design|calcul)\w*/.test(title);
    const admin = /\b(correo|email|mail|seguimiento|follow|actualizar|update|revisar lista|carpeta|folder|organizar)\b/.test(title);

    return {
        splittable: !(atomic || conversational),
        minBlockMinutes: conversational ? 30 : deepWork ? 60 : admin ? 15 : 30,
        earliestStart: needsBusinessHours ? '09:00' : null,
    };
};

const stripAccents = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * [TA6 / audit T7, error A3] Tasks that get resolved in the same event.
 *
 * Two approval tasks with the same approvers, in the same process section, both waiting, are one
 * meeting — the audit's A3 was splitting the two COTEMAR CQAs into separate blocks. Derived from
 * the approver set that is already stored, so nothing new has to be tagged by hand. Groups are
 * computed across ALL supplied opportunities, because the shared event usually spans them.
 */
const buildEventGroups = (entries: Array<{ opp: Opportunity; tasks: Task[] }>): Map<string, string> => {
    const bySignature = new Map<string, string[]>();
    for (const { opp, tasks } of entries) {
        for (const task of tasks) {
            const approvers = [...(task.approverTeamMemberIds || [])].sort();
            const waiting = task.status === 'Approval' || task.status === 'Missing Info' || task.status === 'Changes Requested / Rework';
            if (!approvers.length || !waiting) continue;
            const signature = `${task.processSection || 'none'}::${approvers.join(',')}`;
            bySignature.set(signature, [...(bySignature.get(signature) || []), `${opp.id}::${task.id}`]);
        }
    }
    const groupByTaskKey = new Map<string, string>();
    let groupIndex = 0;
    for (const [, keys] of bySignature) {
        // A signature matched by a single task is not a shared event, it is just a task.
        if (keys.length < 2) continue;
        groupIndex += 1;
        keys.forEach(key => groupByTaskKey.set(key, `EVT-${groupIndex}`));
    }
    return groupByTaskKey;
};

const taskPlanningScore = (task: Task, todayStr: string, deliveryDate?: string): number => {
    const dueDays = task.dueDate
        ? Math.ceil((new Date(task.dueDate).getTime() - new Date(todayStr).getTime()) / 86400000)
        : null;
    const deliveryDays = deliveryDate ? Math.ceil((new Date(deliveryDate).getTime() - new Date(todayStr).getTime()) / 86400000) : null;
    const title = task.title.toLowerCase();
    let score = task.priority === 'High' ? 35 : task.priority === 'Medium' ? 18 : 5;
    if ((task.dependsOnTaskIds || []).length) score += 24;
    if (task.isAssignment || (task.approverTeamMemberIds || []).length) score += 22;
    if (task.responsibleDueDate || task.approvalDueDate) score += 18;
    if (task.dueDate && task.dueDate <= todayStr) score += 40;
    else if (dueDays !== null && dueDays <= 7) score += 25;
    if (/scope|cqa|bom|price|approv|technical|proposal|quote|submit|deliver|review/i.test(title)) score += 18;
    if (/close sr|archive|close opportunity|cleanup|set up folder|setup folder/i.test(title) && (deliveryDays === null || deliveryDays > 5)) score -= 35;
    return score;
};

/**
 * Builds the full English prompt handed to an external AI chat. The AI is expected to
 * return the two literal section markers this same module's parser looks for
 * (see responseParser.ts) — the `Key` column (oppId|taskId) is what makes the round
 * trip reliable regardless of how the AI reformats the human-readable columns.
 */
export const buildOrganizerPrompt = (opportunities: Opportunity[], options: BuildPromptOptions): string => {
    const todayStr = options.todayStr || new Date().toLocaleDateString('en-CA');

    const oppIdFilter = new Set(options.oppIds || []);
    const hasExplicitOppSelection = options.oppIds !== undefined;
    const userOrder = new Map((options.oppIds || []).map((id, index) => [id, index]));
    const eligibleOpps = opportunities
        .filter(isOpportunitySchedulable)
        .filter(opp => !hasExplicitOppSelection || oppIdFilter.has(opp.id))
        .map(opp => {
            const deliveryDays = opp.dates?.expected
                ? Math.ceil((new Date(opp.dates.expected).getTime() - new Date(todayStr).getTime()) / 86400000)
                : null;
            const taskLimit = deliveryDays !== null && deliveryDays <= 7 ? 12 : 10;
            const activeTasks = (opp.tasks || []).filter(isTaskActive);
            const nextStep = getNextTask(activeTasks);
            // Match the same order used by the Opportunity Detail "Next Step" indicator. The
            // organizer must not replace the user's workflow order with its own priority score.
            const rankedTasks = [...activeTasks]
                .sort((a, b) => {
                    const orderDelta = (a.order ?? 999999) - (b.order ?? 999999);
                    if (orderDelta !== 0) return orderDelta;
                    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                    if (a.dueDate) return -1;
                    if (b.dueDate) return 1;
                    return taskPlanningScore(b, todayStr, opp.dates?.expected) - taskPlanningScore(a, todayStr, opp.dates?.expected);
                });
            // Existing calendar blocks must always reach the AI; otherwise it cannot truly
            // reorganize the user's current agenda. Fill the remaining prompt budget with the
            // highest-value unscheduled work.
            const scheduledIds = new Set(rankedTasks.filter(task => (task.executionBlocks || []).length > 0).map(task => task.id));
            const topIds = new Set(rankedTasks.slice(0, taskLimit).map(task => task.id));
            const tasks = rankedTasks.filter(task => scheduledIds.has(task.id) || topIds.has(task.id));
            return { opp, tasks, nextStep, pendingDays: daysBetween(opp.dates?.requested, todayStr) };
        })
        .filter(o => o.tasks.length > 0)
        // An explicit user order is authoritative. Automatic priority is only the fallback.
        .sort((a, b) => {
            if (userOrder.size) return (userOrder.get(a.opp.id) ?? 9999) - (userOrder.get(b.opp.id) ?? 9999);
            const pd = (b.pendingDays ?? 0) - (a.pendingDays ?? 0);
            if (pd !== 0) return pd;
            const ea = a.opp.dates?.expected || '9999-99-99';
            const eb = b.opp.dates?.expected || '9999-99-99';
            return ea < eb ? -1 : ea > eb ? 1 : 0;
        });

    const stakeholderTimezone = options.stakeholderTimezone || 'America/Chicago';

    const eventGroups = buildEventGroups(eligibleOpps.map(({ opp, tasks }) => ({ opp, tasks })));

    const lines: string[] = [];

    // [TA6] Derived context the audit flagged as missing: timezone, holidays and the planning
    // horizon (the span of dates the AI is actually authorized to write into). None of these
    // require new stored data — they are computed from what buildOrganizerPrompt already
    // receives (dayWindows) plus environment info, per the "Semana 1" implementation order.
    const timezone = options.timezone || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City');
    const windowDates = Object.keys(options.dayWindows || {}).sort();
    const horizonStart = windowDates[0] || todayStr;
    const horizonEnd = windowDates[windowDates.length - 1] || todayStr;
    const todayYear = Number(todayStr.slice(0, 4)) || new Date().getFullYear();
    const configuredHolidays = (options.holidays || []).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
    const usingFallbackHolidays = configuredHolidays.length === 0;
    const holidays = usingFallbackHolidays
        ? [...DEFAULT_HOLIDAYS_BY_YEAR(todayYear), ...DEFAULT_HOLIDAYS_BY_YEAR(todayYear + 1)]
        : [...configuredHolidays].sort();

    lines.push('Return one machine-importable plain-text answer. Use only this message; no web, files, citations, preamble, closing, code fences or extra headings. Be exhaustive in the structured sections and concise in the prose sections.');
    lines.push('Exact section order: ### META; ### PRIORITY RANKING; ### SCHEDULE; ### SUGGESTED_MOVES; ### EXECUTION QUEUE; ### CONTINGENT; ### EXTERNAL PUSH; ### PROPOSED_DUE_DATES; ### PROPOSED_DELIVERY_DATES; ### OUT_OF_SCOPE_ADVICE; ### REMINDERS; ### OPPORTUNITY ASSESSMENT; ### RECOMMENDATIONS; ### PARETO 20/80; ### BLOCKERS; ### DELIVERY OUTLOOK; ### MISSING TASKS; ### QUESTIONS; ### ASSUMPTIONS.');
    lines.push('Each section below is printed with its exact column header. Copy that header verbatim as the first line of the section, then the data rows. [TA6/E6] The headers are defined in exactly one place — under their own section — so they can never drift out of sync.');
    lines.push('Copy the full supplied Key (oppId::taskId) and exact task title. Never invent or combine tasks. Replace any "|" inside a value with "/" — never escape it — because "|" is the column separator.');
    lines.push('QUESTIONS is the one section where you may ask me something. Everything else must be a decision you already made under a stated assumption — never a question, never a blank, never "needs confirmation".');
    lines.push('IMPORTED vs ADVISORY: the app imports SCHEDULE, PROPOSED_DUE_DATES, PROPOSED_DELIVERY_DATES, REMINDERS, OPPORTUNITY ASSESSMENT and MISSING TASKS. PRIORITY RANKING, SUGGESTED_MOVES, EXECUTION QUEUE, CONTINGENT, EXTERNAL PUSH, OUT_OF_SCOPE_ADVICE and ASSUMPTIONS are shown to me for review and are never applied automatically — so they must still be complete and specific enough to act on by hand.');
    lines.push('');
    lines.push('Act as a rigorous, concise PM and workload assistant. Prevent overload: expose capacity gaps honestly and give only the few actions that materially improve delivery. Waiting is not work, but waiting must always produce an action (see EXTERNAL/waiting handling below).');
    lines.push('');
    lines.push(`Today's date: ${todayStr}. My name: ${options.userName}. Timezone: ${timezone}. All times are in this timezone.`);
    lines.push(`Holidays (never propose or schedule a block, a due date or a delivery date on these): ${holidays.join(', ')}`);
    if (usingFallbackHolidays) lines.push('Note: that holiday list is a built-in fixed-date MX/US approximation because no holidays are configured in the app yet. Moving-date holidays are NOT in it — if a date you propose looks like a public holiday, say so in ASSUMPTIONS instead of assuming it is a working day.');
    lines.push('');

    lines.push('=== PRIORITIZATION MODEL (YOU COMPUTE IT — replaces any fixed execution order) ===');
    lines.push('Do not expect a fixed task order from me. Score every opportunity/task instead:');
    lines.push('SCORE = CLOSE + URG + LEV + VAL (max 90, ties broken by opportunity/task age).');
    lines.push('  CLOSE (0-30): 30 if less than 1h of my own work leaves it deliverable; 20 if it fits in one day; 10 if 2-3 days; 0 if it is blocked on an external input that has not arrived.');
    lines.push('  URG (0-25): overdue=25, due today=22, due in 1 day=18, 2-3 days=12, 4-5 days=6, more=2.');
    lines.push('  LEV (0-20): +10 if it blocks another task/opportunity from moving forward; +10 if it has a fixed commitment already agendado in the windows below.');
    lines.push('  VAL (0-15): value x probability, normalized within this batch. Unknown probability counts as 50% and must be recorded in ASSUMPTIONS/RECOMMENDATIONS.');
    lines.push('HARD RULE over the score: if the owner of the next action is not me (status Missing Info / Approval / Changes Requested / Rework), that task never receives a SCHEDULE block — see the state handling rule below — and the opportunity is still ranked in PRIORITY RANKING so I see where it stands.');
    lines.push('Buckets: A = cheap close (<1h, leaves it deliverable) — schedule first regardless of value. B = unblocker (a few minutes that puts someone else to work) — prefer sending before 10:00 local time. C = build (60-90 min blocks) — largest gap of the day, one opportunity at a time.');
    lines.push('Respect my explicit opportunity order below as a signal into VAL/LEV, not as a fixed sequence that skips the score.');
    eligibleOpps.forEach(({ opp }, index) => lines.push(`User priority signal ${index + 1}: ${opp.alias || opp.title} (id: ${opp.id})`));
    lines.push('SYSTEM NEXT STEP is a strong signal for CLOSE/LEV on that task, not an automatic first slot: a task in Missing Info, Approval or Changes Requested / Rework still follows the state-handling rule below regardless of being the next step.');
    lines.push('');
    lines.push(`TASK DATE RULE: today is ${todayStr}. In PROPOSED_DUE_DATES, return a row whenever moving a task earlier or later creates a more efficient, dependency-safe and realistic sequence AND the new date falls inside the planning horizon below. Fix past and missing dates that fall inside the horizon. Do not preserve a date merely because it already exists, and do not move one merely because the arithmetic allows it.`);
    lines.push('AGENDA REORGANIZATION RULE: every supplied existing work block belonging to an in-scope task (see SELECTION SCOPE) is editable. Move, split, shorten or consolidate it when that improves flow, protects urgent delivery, respects dependencies or reduces overload. For every in-scope task that currently has blocks, return its complete replacement block set in SCHEDULE, even when unchanged. Returned blocks replace the old blocks; they are never appended. Never touch a block outside SELECTION SCOPE directly — propose it in SUGGESTED_MOVES instead.');
    lines.push('Create a reminder only for a concrete external follow-up or critical checkpoint. Maximum 3 total and one per task. Prefer zero reminders when the schedule is enough.');
    lines.push('STATE HANDLING (BINDING): a task in Missing Info, Approval or Changes Requested / Rework receives no SCHEDULE block, but it MUST appear in EXTERNAL PUSH, and also in CONTINGENT when less than 1h of my own work remains once it unblocks. It never disappears from the day for being in a waiting state. Waiting is not work, but waiting must always produce an action.');
    lines.push('WAITING ARITHMETIC: remaining wait = the external area p80 turnaround MINUS the working days elapsed since the waitingSince field of that task (NOT since today). If the result is <= 0 the answer is already overdue: emit an Escalation in EXTERNAL PUSH naming the approver and the days overdue, never a later date that hides the delay.');
    lines.push('');

    lines.push('=== SELECTION SCOPE (BINDING) ===');
    lines.push(`selectionScope: ${eligibleOpps.length ? eligibleOpps.map(({ opp }) => opp.id).join(', ') : 'none'}`);
    lines.push(`selectionMode: ${!hasExplicitOppSelection ? 'all' : (options.oppIds || []).length <= 1 ? 'single' : 'multi'}`);
    lines.push('Replacement is scoped: return the complete replacement SCHEDULE block set ONLY for tasks belonging to selectionScope. Blocks belonging to opportunities outside selectionScope are context in CURRENT AGENDA below — they are read, they consume capacity, they are never emitted in SCHEDULE, and their absence from SCHEDULE must never be treated as a deletion of that work.');
    lines.push('When selectionMode is single, adaptation outranks optimization: fit the selected opportunity into the gaps that already exist in CURRENT AGENDA instead of rebuilding the whole day.');
    lines.push('');

    lines.push('=== PLANNING HORIZON (BINDING FOR EVERY DATE CHANGE) ===');
    lines.push(`horizonStart: ${horizonStart}   horizonEnd: ${horizonEnd}`);
    lines.push('A date may be changed (in SCHEDULE, PROPOSED_DUE_DATES) only when the new value falls inside this horizon, is a working day, and is not a holiday. A correct date that falls OUTSIDE the horizon is never written: leave the current value untouched and report it instead in OUT_OF_SCOPE_ADVICE, with the date you would have proposed in AdvisedDate. Never emit the same task/opportunity in both a change section and OUT_OF_SCOPE_ADVICE. This rule overrides urgency, slip arithmetic, dependencies and every other planning preference — a date that cannot be fixed inside the horizon is reported, not rewritten.');
    lines.push('');

    if (options.extraInstructions.trim()) {
        lines.push('USER EXTRA INSTRUCTIONS (BINDING):');
        lines.push(options.extraInstructions.trim());
        lines.push('Keep requested free/meal periods empty. Answer requested OP analysis in RECOMMENDATIONS. If ambiguous, use a practical assumption and state it.');
        lines.push('');
    }
    const activeChipTexts = ORGANIZER_CHIPS.filter(c => options.activeChipIds.includes(c.id)).map(c => c.text);
    if (activeChipTexts.length) {
        lines.push('Additional constraints:');
        activeChipTexts.forEach(t => lines.push(`- ${t}`));
        lines.push('');
    }

    // [TA6 / audit C4, B-G1] Meetings the user wrote as prose in a note, a history event or a
    // reminder. They are read-only: the assistant subtracts them from capacity and never emits a
    // SCHEDULE row for one, because a meeting is not work and cannot be moved by the planner.
    const commitments = (options.fixedCommitments || [])
        .filter(item => !windowDates.length || windowDates.includes(item.date))
        .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
    lines.push('=== FIXED COMMITMENTS (NOT WORK — NEVER EMIT A SCHEDULE ROW FOR ONE) ===');
    lines.push('Date | Start | End | Title | Opportunity | Source');
    if (commitments.length) {
        commitments.forEach(item => lines.push(`${item.date} | ${item.startTime} | ${item.endTime} | ${item.title.replace(/\|/g, '/')} | ${item.opportunityLabel} | ${item.sourceLabel}${item.durationStated ? '' : ' (duration not stated, 1h assumed)'}`));
        lines.push('These intervals are subtracted from capacity before anything is planned. Never schedule work inside one and never overlap one. They were read automatically from my notes, history events and reminders, so if one looks wrong or duplicated, still respect it but say so in ASSUMPTIONS. If a commitment resolves a task (an approval granted in a meeting), reflect that in PROPOSED_DUE_DATES, never as a SCHEDULE row.');
    } else {
        lines.push('(none detected inside the horizon)');
    }
    lines.push('');

    // [TA6 / audit B-G2, error A8] The day's real shape, as parameters instead of free text.
    const personal = options.personalConstraints;
    if (personal?.enabled) {
        lines.push('=== PERSONAL CONSTRAINTS (BINDING) ===');
        lines.push(`earliestStart: ${personal.earliestStart} | latestEnd: ${personal.latestEnd} | targetSleepHours: ${personal.targetSleepHours}`);
        if (personal.meals.length) {
            lines.push(`Daily periods that must stay empty every single day: ${personal.meals.map(meal => `${meal.label} ${meal.start}-${meal.end}`).join('; ')}`);
        }
        lines.push(`energyProfile: deep work ${personal.deepWorkStart}-${personal.deepWorkEnd}, administrative work ${personal.adminStart}-${personal.adminEnd}.`);
        lines.push('Never schedule anything before earliestStart or after latestEnd, and never inside a listed empty period, even when the availability window below is wider — the window says when I COULD work, this says when I actually will. Put costing, pricing, scope and proposal writing inside the deep-work range and emails, follow-ups and closures inside the administrative range; when that is impossible, say which one you had to break and why in ASSUMPTIONS. Never build a plan that only fits by shortening my sleep below targetSleepHours: defer the work instead and say so.');
        lines.push('');
    }

    const dayEntries = Object.entries(options.dayWindows || {}).sort(([a], [b]) => a.localeCompare(b));
    if (dayEntries.length) {
        lines.push('HARD CALENDAR BOUNDARY — ALLOWED SCHEDULE WINDOWS ONLY:');
        lines.push('Every SCHEDULE row MUST use one of the dates below and its entire Start–End interval MUST fit inside one listed window. Forbidden: any unlisted date, starting before a window, ending after a window, crossing a gap, using weekends unless listed, or assuming additional availability. These boundaries override urgency, due dates and all planning preferences. If work does not fit, defer it; never expand the calendar.');
        dayEntries.forEach(([date, windows]) => {
            const ranges = (windows && windows.length ? windows : [{ start: '08:00', end: '17:00' }])
                .map(w => `${w.start}–${w.end}`)
                .join(', ');
            lines.push(`- ${date} (${weekdayName(date)}): ${ranges}`);
        });
        lines.push('');
    }

    // [TA6 / D14, "urgent" in the audit] Every block on the calendar — not just the selected
    // opportunities' — so a single-opportunity selection never reads as an empty day and the
    // AI never proposes work on top of something already scheduled. Built from the full
    // `opportunities` argument (not eligibleOpps), independent of oppIdFilter.
    lines.push('=== CURRENT AGENDA (READ-ONLY CONTEXT, COVERS THE WHOLE HORIZON) ===');
    lines.push('BlockId | Date | Start | End | Scope | Status | OppId | Task');
    let agendaRowCount = 0;
    for (const opp of opportunities) {
        const inScope = !hasExplicitOppSelection || oppIdFilter.has(opp.id);
        for (const task of opp.tasks || []) {
            // [TA6 / audit A6] A block's status is about the BLOCK, not the task: a past block that
            // already had real work logged on it is done and must never be rescheduled, and one that
            // went by with nothing logged is a skipped block, not a pending plan.
            const loggedDays = new Set((task.timeLogs || []).map(log => (log.start || '').slice(0, 10)).filter(Boolean));
            (task.executionBlocks || []).forEach((block, blockIndex) => {
                if (!block.date || !block.startTime || !block.endTime) return;
                if (windowDates.length && !windowDates.includes(block.date)) return; // outside the horizon: irrelevant to this run
                agendaRowCount += 1;
                const status = task.status === 'Done' || task.status === 'Canceled'
                    ? 'done'
                    : block.date >= todayStr
                        ? 'planned'
                        : loggedDays.has(block.date) ? 'done' : 'skipped';
                lines.push(`${opp.id}::${task.id}::${blockIndex} | ${block.date} | ${block.startTime} | ${block.endTime} | ${inScope ? 'in-scope' : 'out-of-scope'} | ${status} | ${opp.id} | ${task.title}`);
            });
        }
    }
    if (!agendaRowCount) lines.push('(no existing blocks inside the horizon)');
    lines.push('Every listed block still "planned" is occupied time, exactly like a meeting: never schedule new work that overlaps it. Never re-emit a SCHEDULE row for a block whose Status is done. A block whose Status is "skipped" is a past plan that was never honoured: do not silently repeat it, either reschedule it deliberately inside the horizon or say in RECOMMENDATIONS why it keeps being skipped. When higher-priority in-scope work can only fit where an out-of-scope block sits, do NOT overwrite it — put a row in SUGGESTED_MOVES with a concrete alternative slot and let me decide.');
    lines.push('');

    // Breaks are gaps, never rows: a break is not a task and cannot be an execution block, so the
    // policy is expressed as the empty space the scheduler must leave between blocks.
    const focus = options.focusPolicy || DEFAULT_FOCUS_POLICY;
    if (focus.enabled) {
        lines.push('FOCUS & RECOVERY POLICY (BINDING) — protect sustained output, do not maximize occupancy:');
        lines.push(`- Maximum uninterrupted block: ${focus.sessionMinutes} minutes. Split longer work into several blocks on the same or different days.`);
        lines.push(`- Leave at least ${focus.breakMinutes} minutes of empty time between two consecutive blocks on the same day. Never emit a SCHEDULE row for a break; the break IS the gap.`);
        lines.push(`- After ${focus.longBreakAfterSessions} consecutive blocks in a day, leave at least ${focus.longBreakMinutes} minutes before the next one.`);
        lines.push(`- Never schedule more than ${focus.maxDailyFocusHours} hours of work in one day, even when the availability window is longer. The unused part of a window is deliberate recovery, not spare capacity.`);
        lines.push('- If the work does not fit under this policy, defer it and say so in RECOMMENDATIONS. Never shorten or drop the breaks to make it fit.');
        lines.push('');
    }

    // The model is the anchor for every date the assistant proposes: measured constants plus the
    // arithmetic to apply them, so estimates are reproducible instead of optimistic.
    if (options.executionModel) {
        renderExecutionModelForPrompt(options.executionModel).forEach(line => lines.push(line));
        lines.push('');
    }

    const currentReminders = (options.reminders || [])
        .filter(reminder => !reminder.seenAt)
        .filter(reminder => !oppIdFilter.size || oppIdFilter.has(reminder.opportunityId))
        .slice(0, 12);
    lines.push('CURRENT REMINDERS (do not duplicate these tasks/checkpoints):');
    if (currentReminders.length) {
        currentReminders.forEach(reminder => lines.push(`- ${reminder.opportunityId}::${reminder.taskId || 'general'} | ${reminder.dueAt.slice(0, 16)} | ${compact(reminder.title, 90)}`));
    } else {
        lines.push('- none');
    }
    lines.push('');

    lines.push('=== OPPORTUNITIES & TASKS ===');
    for (const { opp, tasks, nextStep, pendingDays } of eligibleOpps) {
        const scope = findScopeText(opp.notes);
        // [TA6 / audit O8, O9, F3] The app already knows how big a proposal is: the alarm policy
        // computes the expected days from the Scope type, the selected systems, the amount tier,
        // the quote type and the revision. That calculation is a far better complexity signal than
        // the `opportunityKind` / `customerDeadlineType` fields the audit proposed capturing by
        // hand, and it is already maintained in Settings.
        const ageTargets = getProposalAgeTargets(opp, options.alarms || [], options.scopeCatalog);
        const glance = readScopeGlance(opp.notes, options.scopeCatalog, opp.labels || []);
        lines.push('');
        lines.push(`User priority #${userOrder.get(opp.id) !== undefined ? userOrder.get(opp.id)! + 1 : 'auto'} — Opportunity: ${opp.alias || opp.title} (id: ${opp.id})`);
        // [TA6 / audit O3] deliveryCommitted is what makes PROPOSED_DELIVERY_DATES usable at all:
        // without it every delivery date looks equally immovable. Unset defaults to 'soft'
        // and the assistant is told to record that as an assumption.
        const deliveryCommitted = opp.commercial?.deliveryCommitted || 'soft (assumed — not set by the user)';
        lines.push(`  Type:${opp.quoteType || '?'} | Delivery:${opp.dates?.expected || 'none'} | deliveryCommitted:${deliveryCommitted} | Status:${opp.statusLabel}/${opp.detailedStatus || 'N/A'} | Age:${pendingDays ?? '?'}d | Customer:${opp.customer || '?'} | Owner:${opp.seller || '?'} | Value:${opp.commercial?.currency || 'USD'} ${opp.commercial?.cqaOfficialSellPrice || opp.kpis?.proposalAmountUSD || '?'} | Probability:${opp.kpis?.dealProbability ?? '?'}%`);
        lines.push(`  Sizing (computed by my own scope/amount policy, not guessed): expectedProposalDays:${ageTargets.expectedDays} | warningAtDay:${ageTargets.warningDays} | criticalAtDay:${ageTargets.criticalDays} | currentAge:${pendingDays ?? '?'}d${pendingDays !== null && pendingDays >= ageTargets.criticalDays ? ' — ALREADY PAST THE CRITICAL AGE' : pendingDays !== null && pendingDays >= ageTargets.warningDays ? ' — past the warning age' : ''}`);
        lines.push('  Read expectedProposalDays as how much work this proposal is worth in total: a 30-day proposal is a different animal from a 12-day one, and two tasks with the same title do not cost the same in each. Use it to scale effort and to judge how much of the remaining time is already spent, never as a deadline.');
        if (glance.hasAny) {
            const parts = [
                glance.scope.length ? `type:${glance.scope.join('/')}` : '',
                glance.systems.length ? `systems:${glance.systems.join('/')}` : '',
                glance.applications.length ? `applications:${glance.applications.join('/')}` : '',
                glance.executionCenters.length ? `executionCenter:${glance.executionCenters.join('/')}` : '',
                glance.quickNotes.length ? `notes:${glance.quickNotes.join('/')}` : '',
                glance.extras.length ? `extras:${glance.extras.join('/')}` : '',
            ].filter(Boolean);
            lines.push(`  Scope selection (structured): ${parts.join(' | ')}`);
        }
        if (nextStep) lines.push(`  SYSTEM NEXT STEP (MUST BE FIRST unless status is Missing Info, Approval, or Changes Requested / Rework): ${opp.id}::${nextStep.id} | ${nextStep.title} | status:${nextStep.status}`);
        if (compact(opp.description)) lines.push(`  Overview: ${compact(opp.description, 2000)}`);
        if ((opp.labels || []).length) lines.push(`  Labels: ${opp.labels.map(label => label.text).join(', ')}`);
        // [TA6 / audit B-S1] The email is what turns "ping the approver" into an action I can take
        // without opening another screen. Timezone/contactWindow/responsiveness are still not stored
        // per person anywhere in the app, so they are deliberately absent rather than invented.
        const stakeholders = (opp.stakeholders || []).map(person => `${person.name}${person.role ? ` (${person.role})` : ''}${person.roles?.length ? ` [${person.roles.join(', ')}]` : ''}${person.email ? ` <${person.email}>` : ''}`);
        lines.push(`  Stakeholders: ${stakeholders.length ? stakeholders.join('; ') : 'none recorded'}`);
        if (stakeholders.length) lines.push(`  No timezone is recorded for any of them. Assume ${stakeholderTimezone} and a ${'08:00-17:00'} contact window in THEIR zone unless a name, area or history event says otherwise, and record that assumption once in ASSUMPTIONS. Convert every SendBy time in EXTERNAL PUSH into my own zone (${timezone}) before writing it, and never tell me to send something that would land outside their working hours.`);
        if (scope) lines.push(`  Scope: ${compact(scope, 2500)}`);
        const history = lastHistoryLines(opp);
        if (history.length) {
            lines.push('  Last history events:');
            history.forEach(h => lines.push(h));
        }
        // [TA6 / audit O12] The prompt admits it omits tasks; say how many, so a plan built on a
        // partial list is never mistaken for a plan built on all of it.
        const activeTaskCount = (opp.tasks || []).filter(isTaskActive).length;
        const omitted = Math.max(0, activeTaskCount - tasks.length);
        lines.push(`  Tasks in binding execution order (${tasks.length} of ${activeTaskCount} active shown; omittedTaskCount:${omitted}${omitted ? ' — lower-value tasks beyond the planning limit' : ''}):`);
        const allOppTasks = opp.tasks || [];
        for (const [taskIndex, task] of tasks.entries()) {
            const missing = missingFieldsFor(task);
            const existingBlocks = describeBlocks(task, todayStr);
            const loggedSeconds = (task.timeLogs || []).reduce((total, log) => total + (log.durationSeconds || 0), 0);
            const lastWorkAt = (task.timeLogs || []).map(log => log.start).filter(Boolean).sort().at(-1) || 'none';
            const waiting = waitingSince(task);
            const approvers = resolveMemberNames(task.approverTeamMemberIds, opp.stakeholders || []);
            const responsibles = resolveMemberNames(task.responsibleTeamMemberIds, opp.stakeholders || []);
            const rework = reworkCount(task);
            const shape = inferTaskShape(task);
            const eventGroup = eventGroups.get(`${opp.id}::${task.id}`);
            // Pre-computed with the same arithmetic the assistant is told to apply, so it has the
            // answer to check itself against rather than a formula it might shortcut.
            const forecast = options.executionModel
                ? forecastTask(task, options.executionModel, { todayStr, dailyCapacityHours: focus.enabled ? focus.maxDailyFocusHours : undefined })
                : null;
            const forecastCell = forecast
                ? ` | forecast:${forecast.expectedFinish}${forecast.willMissDueDate ? ' WILL-SLIP' : ''} (${forecast.basis}; confidence ${Math.round(forecast.confidence * 100)}%)`
                : '';
            lines.push(
                `    Task #${taskIndex + 1}: ${opp.id}::${task.id} | ${task.title} | status:${task.status} | priority:${task.priority || '?'} | owner:${taskAssignee(task)} | due:${task.dueDate || 'none'} | depends:${(task.dependsOnTaskIds || []).join(',') || 'none'} | blockingOthers:${blockingOthersCount(task, allOppTasks)} | responsibleDue:${task.responsibleDueDate || '-'} | responsibleName:${responsibles.join('/') || '-'} | approvalDue:${task.approvalDueDate || '-'} | approverName:${approvers.join('/') || '-'} | waitingSince:${waiting || '-'} | reworkCount:${rework} | inferredSplittable:${shape.splittable ? 'yes' : 'no'} | inferredMinBlockMinutes:${shape.minBlockMinutes}${shape.earliestStart ? ` | inferredEarliestStart:${shape.earliestStart}` : ''}${eventGroup ? ` | eventGroup:${eventGroup}` : ''} | blocks:${existingBlocks} | loggedHours:${(loggedSeconds / 3600).toFixed(2)} | userEstimateHours:${typeof task.userEstimateHours === 'number' && task.userEstimateHours > 0 ? task.userEstimateHours : '-'} | lastWorked:${lastWorkAt} | section:${task.processSection || 'none'} | subtasks:${describeSubtasks(task)} | description:${compact(task.description, 700) || 'none'} | deliverable:${compact(task.deliverable, 300) || 'none'} | missing:${missing.join(',') || 'none'}${forecastCell}`
            );
        }
    }

    lines.push('');
    lines.push('=== WHAT TO RETURN ===');
    if (options.recommendationLanguage === 'es') {
        lines.push('LANGUAGE: Keep headings, table headers, CATEGORY tokens, Keys, dates/times and every supplied existing task title exactly as written. Write ALL user-facing analysis in Spanish: recommendations, reminders, schedule notes, due-date rationale, assessment Why/MainBlocker/NextAction/Summary, Pareto, blockers, delivery outlook and missing-task reasons. New missing-task titles must be concise professional English so they can be saved as application tasks. Never translate an existing task title.');
    } else {
        lines.push('LANGUAGE: Write the entire response in English, including every heading, header and CATEGORY token exactly as printed below.');
    }
    lines.push('');
    lines.push('STRICT FORMAT RULES:');
    lines.push('1. Copy every heading exactly once, in the required order, each followed by its column header from the HEADERS block above, copied verbatim. No translation, numbering, decoration or extra text.');
    lines.push('2. Structured rows use exactly " | ", one row per line, no leading/trailing pipes or separator rows. Copy full Keys and exact task titles.');
    lines.push('3. Use YYYY-MM-DD, HH:mm and YYYY-MM-DDTHH:mm. Sort chronologically, never overlap, and keep every block inside one allowed window.');
    lines.push('4. If actionable in-scope work and time exist, return at least one SCHEDULE row. Do not create a reminder for every unscheduled task.');
    lines.push('5. Under PRIORITY RANKING, SCHEDULE, SUGGESTED_MOVES, PROPOSED_DUE_DATES, OUT_OF_SCOPE_ADVICE, REMINDERS and MISSING TASKS, write only the exact header followed by data rows. Do not put bullets, explanations, placeholders, "none", or instructions inside these sections. If an optional structured section has no rows, leave only its header.');
    lines.push(`6. REMINDERS: maximum 3 total and one per task. Use only for a critical alert or specific external follow-up; never duplicate CURRENT REMINDERS. Title must be a concrete action in ${options.recommendationLanguage === 'es' ? 'Spanish' : 'English'}, maximum 10 words.`);
    lines.push('7. No emojis/icons anywhere. No text before ### META or after the last ASSUMPTIONS bullet.');
    lines.push('8. A structured section with no rows shows its heading and header only. A bullet section with no content shows the heading alone. Never write "none", "N/A" or a placeholder row.');
    lines.push('');
    lines.push('### META');
    lines.push('schemaVersion | generatedAt | opportunityCount | taskCount | overallConfidence');
    lines.push(`One row. schemaVersion is exactly "ta6.1". generatedAt is the timestamp you produced the answer (YYYY-MM-DDTHH:mm). opportunityCount is ${eligibleOpps.length} and taskCount is ${eligibleOpps.reduce((total, item) => total + item.tasks.length, 0)} — copy those two numbers so I can detect a truncated answer. overallConfidence is 0-100, your own confidence in this plan given the data gaps stated above.`);
    lines.push('');
    lines.push('### PRIORITY RANKING');
    lines.push('Rank | OppId | Opportunity | Score | Bucket | Why');
    lines.push('One row per opportunity supplied above, score descending; an opportunity outside SELECTION SCOPE still gets a row with "OUT-OF-SCOPE" appended to Bucket. Why <=14 words naming the decisive factor.');
    lines.push('');
    lines.push('### SCHEDULE');
    lines.push('Key | Opportunity | Task | Date(YYYY-MM-DD) | Start(HH:mm) | End(HH:mm) | Note');
    lines.push('Only tasks inside SELECTION SCOPE. No overlap with CURRENT AGENDA, fixed windows or each other.');
    lines.push('');
    lines.push('### SUGGESTED_MOVES');
    lines.push('BlockId | Scope | Name | Action | CurrentDate | CurrentStart | CurrentEnd | NewDate | NewStart | NewEnd | Reason');
    lines.push('Max 5 rows, only when moving an existing out-of-scope/personal block would let higher-priority in-scope work fit. Action is Move, Shorten, Split or Cancel. Never suggest moving a block whose Status is done. Reason <=20 words. Advisory only — never applied automatically.');
    lines.push('');
    lines.push('### EXECUTION QUEUE');
    lines.push('Pos | Key | Task | Subtask | EstMin | DependsOn | DoneWhen');
    lines.push('Strictly sequential: I must be able to follow it top to bottom without making another decision. One row per actionable subtask when the task supplied subtasks, otherwise one row per task. Copy the subtask text verbatim when it was supplied; write "-" when there are none. EstMin is an integer number of minutes consistent with the effort arithmetic. DoneWhen is a verifiable finish criterion in at most 10 words. Must be consistent with SCHEDULE: never queue work that has no block and no trigger.');
    lines.push('');
    lines.push('### CONTINGENT');
    lines.push('Key | Opportunity | Task | Trigger | EstMin | Action');
    lines.push('Short work that is NOT scheduled because it depends on someone else answering, but that I can finish in under an hour the moment they do. Trigger is one concrete observable event inside the windows ("the CSE approves the CQA"), never a date. Every task in Approval / Missing Info / Changes Requested with under 1h of my own work left must appear here. Max 6 rows.');
    lines.push('');
    lines.push('### EXTERNAL PUSH');
    lines.push('Key | Opportunity | Type | To | SendBy(HH:mm) | Message');
    lines.push('Every task whose next action belongs to someone else. Type is exactly Ping, Question or Escalation. To is the name and email of the person when one was supplied above, otherwise the area. SendBy is a time inside the allowed window for today — prefer before 10:00, since a message sent early and one sent late cost the same and pay differently. Message is a one-line instruction I can copy, naming the person, at most 20 words; for an Escalation state how many days overdue it is, computed from waitingSince. Max 8 rows. This section is why a waiting opportunity never vanishes from the day.');
    lines.push('');
    lines.push('### PROPOSED_DUE_DATES');
    lines.push('Key | Opportunity | Task | DueDate(YYYY-MM-DD) | Rationale');
    lines.push('Only dates that fall inside the planning horizon. Rationale states the arithmetic and which estimation level (0.1 to 0.4) produced it. Change budget: do not move more than 8 due dates in one run unless the calendar forces it; prioritize moves that change a delivery outcome.');
    lines.push('');
    lines.push('### PROPOSED_DELIVERY_DATES');
    lines.push('OppId | Opportunity | CurrentDelivery | ProposedDelivery(YYYY-MM-DD) | Rationale');
    lines.push('One row per opportunity whose DELIVERY date (not a task date) should move and can move: only when deliveryCommitted is soft or internal, and only when the new date falls inside the planning horizon. Never propose a new delivery date for a hard commitment — report that one in OUT_OF_SCOPE_ADVICE and say renegotiating with the customer is required. Rationale <=20 words naming what makes the current date infeasible. The app writes this date into the opportunity, so it must be a real working day, not a holiday.');
    lines.push('');
    lines.push('### OUT_OF_SCOPE_ADVICE');
    lines.push('Scope | Key | Name | CurrentDate | AdvisedDate | Reason');
    lines.push('Every task or opportunity whose correct date falls outside the planning horizon. Scope is Task or Opportunity. The current value in the system is left untouched; AdvisedDate is advice only. Reason <=20 words. If this section has rows, add one RECOMMENDATIONS bullet stating the horizon is too short for the pending workload.');
    lines.push('');
    lines.push('### REMINDERS');
    lines.push('Key | Opportunity | Task | RemindAt(YYYY-MM-DDTHH:mm) | Title');
    lines.push('');
    lines.push('### OPPORTUNITY ASSESSMENT');
    lines.push('OppId | Opportunity | Progress(0-100) | RequiredHours | AvailableHours | Feasible(YES/NO/AT RISK) | SuggestedDelivery(YYYY-MM-DD) | Why | MainBlocker | NextAction | Summary');
    lines.push('');
    lines.push('### RECOMMENDATIONS');
    lines.push(`- Max 5 bullets, one per line, formatted "CATEGORY: text". CATEGORY: FOCUS, RISK, WAITING or TIP${options.recommendationLanguage === 'es' ? '; keep the token in English and the text in Spanish' : ''}. Start with one FOCUS. Max 18 words each.`);
    lines.push('');
    lines.push('### PARETO 20/80');
    lines.push('- Max 3 bullets: smallest task set producing the most progress.');
    lines.push('');
    lines.push('### BLOCKERS');
    lines.push('- Max 3 bullets: blocker — unblock action — owner.');
    lines.push('');
    lines.push('### DELIVERY OUTLOOK');
    lines.push('- One short bullet per OP: delivery date, risk and assumption.');
    lines.push('');
    lines.push('### MISSING TASKS');
    lines.push('OppId | Opportunity | TaskTitleEnglish | ReasonLocalized | SuggestedDueDate(YYYY-MM-DD) | ProcessSection');
    lines.push('');
    lines.push('OPPORTUNITY ASSESSMENT: exactly one row per selected OP. Progress is the AI\'s evidence-based estimate of real operational advancement toward a deliverable proposal: consider completed deliverables, remaining work, dependencies, approvals, missing information, rework and scope readiness. It is NOT the percentage of tasks marked Done and must not be optimistic. 100 means realistically ready to deliver now. Estimate RequiredHours conservatively from all remaining work, statuses, dependencies, scope and existing blocks. AvailableHours is that OP\'s fair share of supplied windows before delivery. If no windows were supplied, use 0 and AT RISK; never invent capacity. Keep the current delivery date only if feasible; otherwise give the earliest credible workday. Why, MainBlocker, NextAction and Summary must be specific and at most 14 words each. Missing data must reduce confidence and progress.');
    lines.push(`MISSING TASKS: maximum 3 rows. Suggest only a genuinely absent execution step. TaskTitleEnglish must be an actionable English task title; ReasonLocalized must use the selected user-facing language. Use the selected opportunity id and a realistic future due date. ProcessSection MUST be copied verbatim from this list so the task can be inserted at the right point of the plan instead of at the end: ${PROCESS_SECTIONS.join(' | ')}.`);
    lines.push('### QUESTIONS');
    lines.push('Num | Question | WhyItMatters | AssumedMeanwhile');
    lines.push('Max 6 rows, ordered by how much the answer would change the plan, most decisive first. Ask ONLY what you cannot infer from the data above and what would actually move a date, a priority or an action if answered — never a question whose answer is already somewhere in this message, and never a pleasantry. Question is one sentence in Spanish, at most 20 words, answerable in a line. WhyItMatters names the concrete thing that would change (a date, a block, a ranking position). AssumedMeanwhile is what you assumed in THIS answer so the plan still stands without me replying. I will answer these and send the same prompt back with my answers appended, so write them to be worth a second round.');
    lines.push('');
    lines.push('### ASSUMPTIONS');
    lines.push('- Max 6 bullets, one per line. Every inference you made, every unknown probability you counted as 50%, every user signal that overrode the computed score, every contradiction between two supplied fields (say which one you used), and every date you marked LOW-CONFIDENCE. If a field was missing and you filled it with a default, it belongs here.');
    lines.push('');
    lines.push('SILENT CHECK: exact headings/order; valid full Keys; one assessment per selected OP; valid dates/times; blocks inside allowed windows with no overlap; max one reminder per task and no duplicates; concise text; no extra text.');
    lines.push('SCOPE CHECK: every SCHEDULE row belongs to SELECTION SCOPE; no row overlaps a CURRENT AGENDA block, fixed window gap or holiday; no out-of-scope block was implicitly deleted by its absence from SCHEDULE.');
    lines.push('WAITING CHECK: every task in Approval, Missing Info or Changes Requested / Rework appears in EXTERNAL PUSH; none of them received a SCHEDULE block; every one of them with under 1h of my own work left also appears in CONTINGENT; every Escalation states the days overdue counted from waitingSince.');
    lines.push('DELIVERY CHECK: no opportunity with deliveryCommitted "hard" appears in PROPOSED_DELIVERY_DATES; every row there falls inside the horizon on a working day that is not a holiday; nothing appears in both PROPOSED_DELIVERY_DATES and OUT_OF_SCOPE_ADVICE.');
    lines.push('HORIZON CHECK: every date in PROPOSED_DUE_DATES falls inside horizonStart..horizonEnd on a working day that is not a holiday; nothing appears in both PROPOSED_DUE_DATES and OUT_OF_SCOPE_ADVICE; every item whose correct date falls outside the horizon appears in OUT_OF_SCOPE_ADVICE rather than being silently dropped.');

    return lines.join('\n');
};
