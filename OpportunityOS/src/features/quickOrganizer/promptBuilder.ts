import { MeetingNote, Opportunity, Task } from '../../types';
import { isOpportunitySchedulable, isTaskActive } from '../schedule/scheduleHelpers';
import { getNextTask } from '../../services/taskUtils';

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
}

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
        return text.replace(/\s+/g, ' ').trim().slice(0, 1200);
    } catch {
        return sowNote.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
    }
};

const compact = (value: string | undefined, max = 800): string => (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const lastHistoryLines = (opp: Opportunity, n = 5): string[] => {
    return [...(opp.history || [])]
        .filter(h => h?.content?.trim())
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, n)
        .map(h => `  - [${h.date}] ${h.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260)}`);
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

const taskPlanningScore = (task: Task, todayStr: string, deliveryDate?: string): number => {
    const dueDays = task.dueDate ? daysBetween(todayStr, task.dueDate) : null;
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
            const taskLimit = deliveryDays !== null && deliveryDays <= 7 ? 10 : deliveryDays !== null && deliveryDays <= 14 ? 7 : 5;
            const activeTasks = (opp.tasks || []).filter(isTaskActive);
            const nextStep = getNextTask(activeTasks);
            // Match the same order used by the Opportunity Detail "Next Step" indicator. The
            // organizer must not replace the user's workflow order with its own priority score.
            const tasks = [...activeTasks]
                .sort((a, b) => {
                    const orderDelta = (a.order ?? 999999) - (b.order ?? 999999);
                    if (orderDelta !== 0) return orderDelta;
                    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                    if (a.dueDate) return -1;
                    if (b.dueDate) return 1;
                    return taskPlanningScore(b, todayStr, opp.dates?.expected) - taskPlanningScore(a, todayStr, opp.dates?.expected);
                })
                .slice(0, taskLimit);
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
        })
        .slice(0, 14);

    const lines: string[] = [];

    lines.push('OUTPUT CONTRACT (HIGHEST PRIORITY): This response is machine-imported, not just read by a person. Reply entirely inside this chat as plain text. Do NOT search the web, add citations, create documents/pages/files, offer downloads, or ask me follow-up questions — use only the data in this message and answer in one single response.');
    lines.push('Start with ### SCHEDULE. No preamble, closing, extra headings, code fences, Markdown separators, emojis/icons, or translated headings.');
    lines.push('Required order: ### SCHEDULE; ### PROPOSED_DUE_DATES; ### REMINDERS; ### RECOMMENDATIONS; ### PARETO 20/80; ### BLOCKERS; ### DELIVERY OUTLOOK; ### MISSING TASKS. The three tables come FIRST so they are never lost: if you approach your response length limit, shorten or drop narrative bullets — never omit or truncate a table row.');
    lines.push('SCHEDULE header: Key | Opportunity | Task | Date(YYYY-MM-DD) | Start(HH:mm) | End(HH:mm) | Note');
    lines.push('PROPOSED_DUE_DATES header: Key | Opportunity | Task | DueDate(YYYY-MM-DD) | Rationale');
    lines.push('REMINDERS header: Key | Opportunity | Task | RemindAt(YYYY-MM-DDTHH:mm) | Title');
    lines.push('A heading and header are NOT data. If tasks and time exist, output at least one real SCHEDULE data row immediately below its header. In every structured row copy the FULL supplied Key (oppId::taskId), never only the OP id. Copy one existing task title exactly; never combine, rename or invent scheduled tasks. Put new-task ideas only in MISSING TASKS.');
    lines.push('');
    lines.push('You are acting as a proactive professional PM / executive assistant helping me plan my working week.');
    lines.push('Analyze each proposal (opportunity) and its pending tasks below, then build me a work schedule and give me practical personal-assistant advice.');
    lines.push('');
    lines.push('PLANNING LOGIC: Respect the user opportunity order. Within each opportunity rank by delivery impact, dependencies, urgency, scope, value and risk. Capacity is hard: schedule only what realistically fits; defer the rest. Estimate honest durations with context-switching and review/rework time. Never overlap blocks.');
    lines.push('Dependencies: request information/approval first, allow realistic elapsed response time, then schedule review/rework. Waiting is not work. Split one task into multiple blocks across days when useful. Work backward from delivery dates with integration/approval buffer; if late or impossible, give the earliest credible date and assumptions. Identify the true 20% highest-leverage work and blockers using all supplied context, not stored priority alone.');
    lines.push('');
    lines.push(`Today's date: ${todayStr}. My name: ${options.userName}.`);
    lines.push('');

    lines.push('HARD EXECUTION ORDER (BINDING):');
    eligibleOpps.forEach(({ opp }, index) => lines.push(`${index + 1}. ${opp.alias || opp.title} (id: ${opp.id})`));
    lines.push('Build SCHEDULE in chronological Date/Start order and work through this opportunity queue from top to bottom. Finish opportunity #1 before scheduling #2, then finish #2 before #3, and so on. Do not interleave opportunities merely to diversify the day.');
    lines.push('The task order printed inside each opportunity is ALSO BINDING. Complete task #1 before task #2, task #2 before task #3, and so on. Do not reorder tasks by preference after reading the list.');
    lines.push('NEXT STEP OVERRIDES ALL AI PRIORITIZATION: for each opportunity, the task explicitly labeled SYSTEM NEXT STEP below is the first task to schedule and execute. Do not choose a different first task because it is more urgent, valuable, short, efficient, or interesting.');
    lines.push('The SYSTEM NEXT STEP may be skipped ONLY when its supplied status is exactly "Missing Info", "Approval", or "Changes Requested / Rework", meaning work is waiting on external information, explicit approval, or its linked corrective task. Do not infer that it is blocked from age, due date, description, owner, difficulty, dependencies, or your own judgment when its supplied status does not use one of those statuses.');
    lines.push('Use the recent HISTORY events to understand what changed, what information arrived, who owes the next response, current risks, and realistic task duration. History refines the plan but NEVER replaces SYSTEM NEXT STEP or the supplied task/status/order fields. If History conflicts with structured fields, mention the inconsistency in RECOMMENDATIONS and follow the structured fields.');
    lines.push(`TASK DATE RULE: compare every task due date with today (${todayStr}). A due date on or after today is a current user commitment: schedule enough work on or before it whenever allowed windows permit, and do not propose changing it. A due date before today is expired historical guidance, NOT a valid current constraint and never a reason to schedule in the past; use it as an overdue-risk signal and propose a new realistic date in PROPOSED_DUE_DATES. Tasks with due:none may also receive a proposed date. Assignment responsible/approval dates on or after today are hard intermediate milestones; expired ones are historical risk signals.`);
    lines.push('EXISTING SCHEDULES ARE EDITABLE: existingBlocks below describe the old agenda, not fixed appointments. For every active (not Done/Canceled) task, freely move, split, shorten or replace old future blocks to optimize the new plan and current instructions. Do not preserve an old block merely because it already exists. Return the complete NEW set of desired blocks for every task you reschedule; TenderLoop will replace that task\'s prior blocks instead of appending duplicates.');
    lines.push('The ONLY reason to skip any later task or opportunity is likewise a real external block recorded in the supplied data: missing external information or an external approval. Internal convenience, urgency elsewhere, task duration, variety, efficiency, low priority, or lack of enthusiasm are NOT valid reasons to skip.');
    lines.push('For every skipped task: do not schedule fake waiting work; add a REMINDERS row using that exact task Key, document the dependency in BLOCKERS, and start the Note of the last row before switching with "BLOCKED:" plus the exact external dependency. Then continue with the next unblocked task/opportunity and return to the skipped item as soon as it becomes actionable.');
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

    lines.push('=== OPPORTUNITIES & TASKS ===');
    for (const { opp, tasks, nextStep, pendingDays } of eligibleOpps) {
        const scope = findScopeText(opp.notes);
        lines.push('');
        lines.push(`User priority #${userOrder.get(opp.id) !== undefined ? userOrder.get(opp.id)! + 1 : 'auto'} — Opportunity: ${opp.alias || opp.title} (id: ${opp.id})`);
        lines.push(`  Type:${opp.quoteType || '?'} | Delivery:${opp.dates?.expected || 'none'} | Status:${opp.statusLabel}/${opp.detailedStatus || 'N/A'} | Age:${pendingDays ?? '?'}d | Customer:${opp.customer || '?'} | Owner:${opp.seller || '?'} | Value:${opp.commercial?.currency || 'USD'} ${opp.commercial?.cqaOfficialSellPrice || opp.kpis?.proposalAmountUSD || '?'} | Probability:${opp.kpis?.dealProbability ?? '?'}%`);
        if (nextStep) lines.push(`  SYSTEM NEXT STEP (MUST BE FIRST unless status is Missing Info, Approval, or Changes Requested / Rework): ${opp.id}::${nextStep.id} | ${nextStep.title} | status:${nextStep.status}`);
        if (compact(opp.description)) lines.push(`  Overview: ${compact(opp.description, 500)}`);
        if ((opp.labels || []).length) lines.push(`  Labels: ${opp.labels.map(label => label.text).join(', ')}`);
        const stakeholders = (opp.stakeholders || []).map(person => `${person.name}${person.role ? ` (${person.role})` : ''}${person.roles?.length ? ` [${person.roles.join(', ')}]` : ''}`);
        lines.push(`  Stakeholders: ${stakeholders.length ? stakeholders.join('; ') : 'none recorded'}`);
        if (scope) lines.push(`  Scope: ${compact(scope, 500)}`);
        const history = lastHistoryLines(opp);
        if (history.length) {
            lines.push('  Last history events:');
            history.forEach(h => lines.push(h));
        }
        lines.push('  Tasks in binding execution order (lower-value tasks beyond the planning limit may be omitted):');
        for (const [taskIndex, task] of tasks.entries()) {
            const missing = missingFieldsFor(task);
            const existingBlocks = (task.executionBlocks || [])
                .map(block => `${block.date} ${block.startTime}-${block.endTime}`)
                .join(', ') || 'none';
            lines.push(
                `    Task #${taskIndex + 1}: ${opp.id}::${task.id} | ${task.title} | status:${task.status} | priority:${task.priority || '?'} | owner:${taskAssignee(task)} | due:${task.dueDate || 'none'} | missing:${missing.join(',') || 'none'} | depends:${(task.dependsOnTaskIds || []).join(',') || 'none'} | assignment:${task.isAssignment ? 'yes' : 'no'} | approvers:${(task.approverTeamMemberIds || []).join(',') || 'none'} | responsible:${task.responsibleRequestedDate || '-'}/${task.responsibleDueDate || '-'}/${task.responsibleDeliveredDate || '-'} | approval:${task.approvalRequestedDate || '-'}/${task.approvalDueDate || '-'}/${task.approvalDeliveredDate || '-'} | existingBlocks:${existingBlocks} | description:${compact(task.description, 220) || 'none'} | deliverable:${compact(task.deliverable, 140) || 'none'}`
            );
        }
    }

    lines.push('');
    lines.push('=== WHAT TO RETURN ===');
    if (options.recommendationLanguage === 'es') {
        lines.push('LANGUAGE: Write the RECOMMENDATIONS bullet text and the REMINDERS Title column in Spanish — these are read directly by the user. EVERYTHING else stays in English, never translated: headings, table headers, CATEGORY tokens, Keys, dates/times, the SCHEDULE Note column, and the PARETO 20/80, BLOCKERS, DELIVERY OUTLOOK and MISSING TASKS sections.');
    } else {
        lines.push('LANGUAGE: Write the entire response in English, including every heading, header and CATEGORY token exactly as printed below.');
    }
    lines.push('');
    lines.push('STRICT FORMAT RULES:');
    lines.push('1. Copy every heading/header exactly once, in the required order. No translation, numbering, decoration or extra text.');
    lines.push('2. Structured rows use exactly " | " between columns. Put EACH data row on its own physical line: after the final column, insert a newline before the next Key. Never append a data row to the header or another row. No leading/trailing pipes or separator rows. Copy each full oppId::taskId Key and exact task title; never use only oppId or combine tasks.');
    lines.push('3. Dates: YYYY-MM-DD (never with slashes). Times: 24h two-digit HH:mm (write 09:00, never 9:00 or 9:00 AM). RemindAt: YYYY-MM-DDTHH:mm with a literal T. Sort rows chronologically. No overlaps. Re-check every row against the HARD CALENDAR BOUNDARY; a block must be fully contained in one allowed window. Multiple blocks per task are allowed.');
    lines.push('4. If at least one task and a usable time window exist, SCHEDULE MUST contain at least one valid data row. Never return analysis only. Schedule feasible actionable work; deferred/critical work gets REMINDERS.');
    lines.push('5. Under SCHEDULE, PROPOSED_DUE_DATES and REMINDERS, write only the exact header followed by data rows. Do not put bullets, explanations, placeholders, "none", or instructions inside these three sections. If optional sections have no rows, leave only their header.');
    lines.push(`6. REMINDERS must cover every critical checkpoint: any task due within 3 days of today, any opportunity delivery within 7 days, every external dependency to chase (name the owner in Title), every skipped/deferred task, and the first session of any task starting more than 5 days out. RemindAt = one working day before the checkpoint at 09:00, or today at 09:00 if that moment already passed. Write each Title in ${options.recommendationLanguage === 'es' ? 'Spanish' : 'English'}: short, actionable, naming who/what to chase.`);
    lines.push('7. No emojis/icons anywhere. No text before SCHEDULE or after MISSING TASKS.');
    lines.push('');
    lines.push('### SCHEDULE');
    lines.push('Key | Opportunity | Task | Date(YYYY-MM-DD) | Start(HH:mm) | End(HH:mm) | Note');
    lines.push('');
    lines.push('### PROPOSED_DUE_DATES');
    lines.push('Key | Opportunity | Task | DueDate(YYYY-MM-DD) | Rationale');
    lines.push('');
    lines.push('### REMINDERS');
    lines.push('Key | Opportunity | Task | RemindAt(YYYY-MM-DDTHH:mm) | Title');
    lines.push('');
    lines.push('### RECOMMENDATIONS');
    lines.push(`- Max 8 bullets, one per line, each formatted "CATEGORY: text". CATEGORY is exactly one of FOCUS, RISK, WAITING, TIP${options.recommendationLanguage === 'es' ? ' (keep the English token; write the text itself in Spanish)' : ''}. Start with one FOCUS bullet = the single most important next move. Each bullet ≤25 words and names the opportunity alias it refers to.`);
    lines.push('');
    lines.push('### PARETO 20/80');
    lines.push('- Rank the smallest task set producing most meaningful progress; explain leverage.');
    lines.push('');
    lines.push('### BLOCKERS');
    lines.push('- Dependency/blocker — unblock action — owner — timing assumption.');
    lines.push('');
    lines.push('### DELIVERY OUTLOOK');
    lines.push('- For each OP: credible requested date or earliest realistic date with assumptions.');
    lines.push('');
    lines.push('### MISSING TASKS');
    lines.push('- Opportunity — missing task — reason — owner. Use scope/context; no duplicates. Otherwise: No missing tasks detected.');
    lines.push('');
    lines.push('FINAL SILENT CHECK BEFORE ANSWERING — verify every point and fix silently before sending: exact headings in the required order with the tables first; SCHEDULE has at least one pipe-delimited 7-column data row; every structured Key contains "::" and exactly matches a supplied Key; every block lies on an allowed date fully inside one allowed window, chronological, no overlaps; opportunity AND task-number order respected, every skipped item justified by an external dependency in BLOCKERS plus a REMINDERS row and a "BLOCKED:" Note before switching; two-digit dates/times exactly matching the headers; no leading/trailing pipes, no --- separators, no emojis, no extra text; RECOMMENDATIONS bullets follow the CATEGORY format.');

    return lines.join('\n');
};
