import { MeetingNote, Opportunity, Reminder, Task } from '../../types';
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
    /** Existing reminders are included so the AI does not propose the same follow-up again. */
    reminders?: Reminder[];
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

const lastHistoryLines = (opp: Opportunity, n = 3): string[] => {
    return [...(opp.history || [])]
        .filter(h => h?.content?.trim())
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, n)
        .map(h => `  - [${h.date}] ${h.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}`);
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
        })
        .slice(0, 8);

    const lines: string[] = [];

    lines.push('Return one short, machine-importable plain-text answer. Use only this message; no web, files, citations, preamble, closing, code fences or extra headings.');
    lines.push('Exact section order: ### SCHEDULE; ### PROPOSED_DUE_DATES; ### REMINDERS; ### OPPORTUNITY ASSESSMENT; ### RECOMMENDATIONS; ### PARETO 20/80; ### BLOCKERS; ### DELIVERY OUTLOOK; ### MISSING TASKS.');
    lines.push('SCHEDULE header: Key | Opportunity | Task | Date(YYYY-MM-DD) | Start(HH:mm) | End(HH:mm) | Note');
    lines.push('PROPOSED_DUE_DATES header: Key | Opportunity | Task | DueDate(YYYY-MM-DD) | Rationale');
    lines.push('REMINDERS header: Key | Opportunity | Task | RemindAt(YYYY-MM-DDTHH:mm) | Title');
    lines.push('Copy the full supplied Key (oppId::taskId) and exact task title. Never invent or combine tasks.');
    lines.push('');
    lines.push('Act as a rigorous, concise PM and workload assistant. Prevent overload: expose capacity gaps honestly and give only the few actions that materially improve delivery.');
    lines.push('');
    lines.push('Rebuild the agenda for maximum realistic throughput. Prioritize by user opportunity order, proposal delivery date, dependencies, urgency, impact and context-switch reduction. Work backward from delivery, leave review/approval buffer, never overlap blocks, and schedule only what fits. Waiting is not work.');
    lines.push('');
    lines.push(`Today's date: ${todayStr}. My name: ${options.userName}.`);
    lines.push('');

    lines.push('HARD EXECUTION ORDER (BINDING):');
    eligibleOpps.forEach(({ opp }, index) => lines.push(`${index + 1}. ${opp.alias || opp.title} (id: ${opp.id})`));
    lines.push('Respect task order and schedule SYSTEM NEXT STEP first unless its explicit status is Missing Info, Approval, or Changes Requested / Rework. Then continue with the next actionable task.');
    lines.push(`TASK DATE RULE: today is ${todayStr}. Every current task due date is editable, including future dates. In PROPOSED_DUE_DATES, return a row whenever moving a task earlier or later creates a more efficient, dependency-safe and realistic sequence. Fix past and missing dates. A task date cannot be after proposal delivery unless that delivery is impossible; then propose the earliest credible delivery and explain the capacity gap. Do not preserve a date merely because it already exists.`);
    lines.push('AGENDA REORGANIZATION RULE: every supplied existing work block is editable. Move, split, shorten or consolidate it when that improves flow, protects urgent delivery, respects dependencies or reduces overload. For every task that currently has blocks, return its complete replacement block set in SCHEDULE, even when unchanged. Returned blocks replace the old blocks; they are never appended. Do not create overlapping work or retain inefficient gaps while higher-priority actionable work is pending.');
    lines.push('Create a reminder only for a concrete external follow-up or critical checkpoint. Maximum 3 total and one per task. Prefer zero reminders when the schedule is enough.');
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
                `    Task #${taskIndex + 1}: ${opp.id}::${task.id} | ${task.title} | status:${task.status} | priority:${task.priority || '?'} | owner:${taskAssignee(task)} | due:${task.dueDate || 'none'} | depends:${(task.dependsOnTaskIds || []).join(',') || 'none'} | responsibleDue:${task.responsibleDueDate || '-'} | approvalDue:${task.approvalDueDate || '-'} | blocks:${existingBlocks} | description:${compact(task.description, 120) || 'none'} | deliverable:${compact(task.deliverable, 80) || 'none'} | missing:${missing.join(',') || 'none'}`
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
    lines.push('2. Structured rows use exactly " | ", one row per line, no leading/trailing pipes or separator rows. Copy full Keys and exact task titles.');
    lines.push('3. Use YYYY-MM-DD, HH:mm and YYYY-MM-DDTHH:mm. Sort chronologically, never overlap, and keep every block inside one allowed window.');
    lines.push('4. If actionable work and time exist, return at least one SCHEDULE row. Do not create a reminder for every unscheduled task.');
    lines.push('5. Under SCHEDULE, PROPOSED_DUE_DATES and REMINDERS, write only the exact header followed by data rows. Do not put bullets, explanations, placeholders, "none", or instructions inside these three sections. If optional sections have no rows, leave only their header.');
    lines.push(`6. REMINDERS: maximum 3 total and one per task. Use only for a critical alert or specific external follow-up; never duplicate CURRENT REMINDERS. Title must be a concrete action in ${options.recommendationLanguage === 'es' ? 'Spanish' : 'English'}, maximum 10 words.`);
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
    lines.push('### OPPORTUNITY ASSESSMENT');
    lines.push('OppId | Opportunity | Health(0-100) | RequiredHours | AvailableHours | Feasible(YES/NO/AT RISK) | SuggestedDelivery(YYYY-MM-DD) | Why | MainBlocker | NextAction | Summary');
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
    lines.push('- Max 3 bullets: opportunity — missing task — reason. Otherwise: No missing tasks detected.');
    lines.push('');
    lines.push('OPPORTUNITY ASSESSMENT: exactly one row per selected OP. Health is evidence-based readiness: 100 means realistically ready to deliver, not optimism. Estimate RequiredHours conservatively from all remaining work, statuses, dependencies, scope and existing blocks. AvailableHours is that OP\'s fair share of supplied windows before delivery. If no windows were supplied, use 0 and AT RISK; never invent capacity. Keep the current delivery date only if feasible; otherwise give the earliest credible workday. Why, MainBlocker, NextAction and Summary must be specific and at most 14 words each. Missing data must reduce confidence and health.');
    lines.push('SILENT CHECK: exact headings/order; valid full Keys; one assessment per selected OP; valid dates/times; blocks inside allowed windows with no overlap; max one reminder per task and no duplicates; concise text; no extra text.');

    return lines.join('\n');
};
