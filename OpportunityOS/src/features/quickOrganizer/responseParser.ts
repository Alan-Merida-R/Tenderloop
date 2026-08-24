import { Opportunity, Task } from '../../types';
import { timeToMinutes } from '../schedule/executionBlockUtils';

export interface ParsedScheduleRow {
    id: string; // local row id, for React keys / edits
    key: string; // "oppId|taskId" as echoed by the AI
    oppId: string;
    taskId: string;
    oppLabel: string;
    taskLabel: string;
    date: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    note: string;
}

export interface ParsedReminderRow {
    id: string;
    key: string;
    oppId: string;
    taskId: string;
    oppLabel: string;
    taskLabel: string;
    remindAt: string; // YYYY-MM-DDTHH:mm
    title: string;
}

export interface ParsedDueDateRow {
    id: string;
    key: string;
    oppId: string;
    taskId: string;
    oppLabel: string;
    taskLabel: string;
    date: string;
    rationale: string;
}

export interface ParsedOpportunityAssessment {
    id: string; oppId: string; oppLabel: string; health: number;
    requiredHours: number; availableHours: number;
    feasible: 'YES' | 'NO' | 'AT RISK'; suggestedDelivery: string;
    reason: string; blocker: string; nextAction: string; summary: string;
}

export interface ParseError {
    section: 'SCHEDULE' | 'REMINDERS';
    line: string;
    reason: string;
}

export interface ParseResult {
    scheduleRows: ParsedScheduleRow[];
    reminderRows: ParsedReminderRow[];
    recommendations: string[];
    paretoInsights: string[];
    blockerInsights: string[];
    deliveryInsights: string[];
    missingTaskInsights: string[];
    dueDateRows: ParsedDueDateRow[];
    opportunityAssessments: ParsedOpportunityAssessment[];
    errors: ParseError[];
}

export interface OrganizerParseOptions {
    /** When present and non-empty, schedule blocks must fit fully inside one listed window. */
    dayWindows?: Record<string, Array<{ start: string; end: string }>>;
}

/**
 * Splits a table row on '|' or, failing that, tab — Excel round-trips often swap one for the
 * other. Also tolerates markdown-style rows ("| a | b | c |") by dropping empty edge cells left
 * behind by a leading/trailing pipe, in case the AI ignores the "no markdown table syntax" rule.
 */
const splitCells = (line: string): string[] => {
    const source = line.includes('|') ? line.split('|') : line.split('\t');
    const cells = source.map(c => c.trim().replace(/^([*_`]){1,3}|([*_`]){1,3}$/g, '').trim());
    if (cells.length > 1 && cells[0] === '') cells.shift();
    if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
    return cells;
};

const isDateValid = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d);
const isTimeValid = (t: string): boolean => /^\d{2}:\d{2}$/.test(t) && !isNaN(timeToMinutes(t));
const isDateTimeValid = (dt: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt);

/** Copilot frequently emits "9:00", "09:00:00", "9.00" or "5:00 PM" despite instructions — normalize to strict 24h HH:mm. */
const normalizeTime = (raw: string): string => {
    const value = raw.trim().replace(/\u00a0/g, ' ');
    const ampm = value.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap])\.?\s*m\.?$/i);
    if (ampm) {
        let hours = parseInt(ampm[1], 10) % 12;
        if (ampm[3].toLowerCase() === 'p') hours += 12;
        return `${String(hours).padStart(2, '0')}:${ampm[2]}`;
    }
    const plain = value.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
    if (plain) return `${plain[1].padStart(2, '0')}:${plain[2]}`;
    return value;
};
/** "2026/07/18" → "2026-07-18". Other shapes pass through and fail validation with a clear error. */
const normalizeDate = (raw: string): string => raw.trim().replace(/\//g, '-');
/** Accepts "YYYY-MM-DD HH:mm" (space instead of T), seconds, single-digit hours, AM/PM, or a bare date (defaults to 09:00). */
const normalizeDateTime = (raw: string): string => {
    const value = normalizeDate(raw).replace(/\u00a0/g, ' ');
    const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]\s*(.+))?$/);
    if (!match) return value;
    return `${match[1]}T${match[2] ? normalizeTime(match[2].trim()) : '09:00'}`;
};
/** Strip Markdown emphasis/heading leftovers so narrative bullets render clean in the review UI. */
const cleanNarrative = (value: string): string => value.replace(/\*\*|__|`/g, '').replace(/^#+\s*/, '').trim();
const splitTimeRange = (value: string): [string, string] | null => {
    const match = value.match(/^(\d{1,2}[:.]\d{2})\s*(?:-|–|—|to|a)\s*(\d{1,2}[:.]\d{2})$/i);
    return match ? [normalizeTime(match[1]), normalizeTime(match[2])] : null;
};
const normalizeHeading = (value: string): string => value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`#]/g, ' ')
    // External AIs sometimes prefix headings with emoji/icons even when explicitly forbidden.
    // Strip every decorative character before the first ASCII letter or number so headings such
    // as "📅 ### SCHEDULE" and "✅ 7. REMINDERS" still activate their structured parser.
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/^\s*\d+[.)-]?\s*/, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();

/** Index of every active task by "oppId::taskId" and by a normalized "alias::title" fallback key.
 *  Uses "::" (not "|") because "|" is also the cell delimiter — a key containing "|" would get
 *  split into two cells by splitCells() and never match. */
const buildTaskIndex = (opportunities: Opportunity[]) => {
    const byKey = new Map<string, { opp: Opportunity; task: Task }>();
    const byLabel = new Map<string, { opp: Opportunity; task: Task }>();
    const byOppId = new Map<string, Array<{ opp: Opportunity; task: Task }>>();
    for (const opp of opportunities) {
        for (const task of opp.tasks || []) {
            const item = { opp, task };
            byKey.set(`${opp.id}::${task.id}`, item);
            const label = `${(opp.alias || opp.title).trim().toLowerCase()}::${task.title.trim().toLowerCase()}`;
            byLabel.set(label, item);
            byOppId.set(opp.id.toLowerCase(), [...(byOppId.get(opp.id.toLowerCase()) || []), item]);
        }
    }
    return { byKey, byLabel, byOppId };
};

/**
 * Some chat UIs flatten a visually rendered table into one physical line when it is copied.
 * Recover those rows by inserting a newline before every known full task key followed by a
 * column delimiter. Using only known keys keeps narrative text and abbreviated/ambiguous keys
 * untouched.
 */
const unfoldCollapsedRows = (text: string, index: ReturnType<typeof buildTaskIndex>): string => {
    const keys = [...index.byKey.keys()].sort((a, b) => b.length - a.length);
    if (!keys.length) return text;
    const escapedKeys = keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const rowStart = new RegExp(`(^|[ \\t]+)(${escapedKeys.join('|')})(?=\\s*\\|)`, 'gm');
    return text.replace(rowStart, (_match, prefix: string, key: string) => prefix ? `\n${key}` : key);
};

const titleTokens = (value: string): Set<string> => new Set(value.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !['the', 'and', 'for', 'with', 'from', 'para', 'con', 'del', 'las', 'los'].includes(token)));

const titleSimilarity = (a: string, b: string): number => {
    const left = titleTokens(a), right = titleTokens(b);
    if (!left.size || !right.size) return 0;
    const shared = [...left].filter(token => right.has(token)).length;
    return shared / Math.min(left.size, right.size);
};

const resolveTask = (
    key: string,
    oppLabel: string,
    taskLabel: string,
    index: ReturnType<typeof buildTaskIndex>
): { opp: Opportunity; task: Task } | null => {
    // List bullets and Markdown emphasis are frequent harmless deviations in otherwise valid
    // AI tables. Normalize them here without weakening task identity matching.
    const normalizedKey = key.trim().replace(/^[-*+]\s+/, '').replace(/^[`"']+|[`"']+$/g, '').trim();
    const direct = index.byKey.get(normalizedKey);
    if (direct) return direct;
    const fallbackKey = `${oppLabel.trim().toLowerCase()}::${taskLabel.trim().toLowerCase()}`;
    const exactLabel = index.byLabel.get(fallbackKey);
    if (exactLabel) return exactLabel;

    // Some AIs incorrectly echo only the opportunity id as Key and paraphrase the task title.
    // Recover only when one task inside that opportunity is a clear, unique title match.
    const candidates = index.byOppId.get(normalizedKey.toLowerCase()) || [];
    const ranked = candidates
        .map(item => ({ item, score: titleSimilarity(taskLabel, item.task.title) }))
        .sort((a, b) => b.score - a.score);
    if (ranked[0]?.score >= 0.6 && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.15)) return ranked[0].item;
    return null;
};

let rowCounter = 0;
const nextId = () => `row-${Date.now()}-${rowCounter++}`;

/**
 * Parses a pasted AI response containing the "### SCHEDULE" and "### REMINDERS"
 * sections requested by buildOrganizerPrompt. Malformed or unresolvable rows are
 * reported in `errors` instead of being silently dropped.
 */
export const parseOrganizerResponse = (text: string, opportunities: Opportunity[], options: OrganizerParseOptions = {}): ParseResult => {
    const index = buildTaskIndex(opportunities);
    const scheduleRows: ParsedScheduleRow[] = [];
    const reminderRows: ParsedReminderRow[] = [];
    const recommendations: string[] = [];
    const paretoInsights: string[] = [];
    const blockerInsights: string[] = [];
    const deliveryInsights: string[] = [];
    const missingTaskInsights: string[] = [];
    const dueDateRows: ParsedDueDateRow[] = [];
    const opportunityAssessments: ParsedOpportunityAssessment[] = [];
    const errors: ParseError[] = [];

    const lines = unfoldCollapsedRows(text, index).split(/\r?\n/);
    let section: 'RECOMMENDATIONS' | 'PARETO' | 'BLOCKERS' | 'DELIVERY' | 'MISSING_TASKS' | 'DUE_DATES' | 'SCHEDULE' | 'REMINDERS' | 'OP_ASSESSMENT' | null = null;

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const heading = normalizeHeading(line);
        if (/^(RECOMMENDATIONS|RECOMENDACIONES)\b/.test(heading)) { section = 'RECOMMENDATIONS'; continue; }
        if (/^(PARETO|20\/80)\b/.test(heading)) { section = 'PARETO'; continue; }
        if (/^(BLOCKERS|BLOCKAGES|BLOQUEOS)\b/.test(heading)) { section = 'BLOCKERS'; continue; }
        if (/^(DELIVERY OUTLOOK|DELIVERY ANALYSIS|PANORAMA DE ENTREGA|ENTREGA)\b/.test(heading)) { section = 'DELIVERY'; continue; }
        if (/^(MISSING TASKS|SUGGESTED MISSING TASKS|TAREAS FALTANTES)\b/.test(heading)) { section = 'MISSING_TASKS'; continue; }
        if (/^(PROPOSED DUE DATES|DUE DATES|FECHAS LIMITE PROPUESTAS|FECHAS PROPUESTAS)\b/.test(heading)) { section = 'DUE_DATES'; continue; }
        if (/^(SCHEDULE|AGENDA|CRONOGRAMA)\b/.test(heading)) { section = 'SCHEDULE'; continue; }
        if (/^(REMINDERS|RECORDATORIOS)\b/.test(heading)) { section = 'REMINDERS'; continue; }
        if (/^(OPPORTUNITY ASSESSMENT|OP ASSESSMENT|EVALUACION DE OPORTUNIDADES)\b/.test(heading)) { section = 'OP_ASSESSMENT'; continue; }
        if (!section) continue;
        if (section === 'RECOMMENDATIONS' || section === 'PARETO' || section === 'BLOCKERS' || section === 'DELIVERY' || section === 'MISSING_TASKS') {
            if (!/^```/.test(line)) {
                const value = cleanNarrative(line.replace(/^[-*]\s*/, ''));
                if (!value) continue;
                // Copilot habitually closes with an offer/question despite instructions; that line
                // lands inside whatever section came last and pollutes it — drop it.
                if (/^(would you like|do you want|let me know|shall i|i can also|¿(quieres|te gustaría|deseas)|si (quieres|gustas|deseas))/i.test(value)) continue;
                if (section === 'RECOMMENDATIONS') recommendations.push(value);
                else if (section === 'PARETO') paretoInsights.push(value);
                else if (section === 'BLOCKERS') blockerInsights.push(value);
                else if (section === 'DELIVERY') deliveryInsights.push(value);
                else missingTaskInsights.push(value);
            }
            continue;
        }
        // Skip code fences, header rows and separator rows (e.g. "Key | Opportunity | ..." or "---|---"
        // or their markdown-wrapped equivalents "| Key | ... |" / "|---|---|") in case the AI ignored
        // the "no markdown fences/table syntax" instruction.
        const bareLine = line.replace(/^\|+\s*/, '').replace(/\s*\|+$/, '');
        if (/^```/.test(line) || /^key\b/i.test(bareLine) || /^[-|:\s]+$/.test(line)) continue;

        const cells = splitCells(line);
        // A line with no delimiter at all is stray prose (e.g. "Let me know if you want changes!"),
        // not a malformed row — skip it silently instead of reporting a confusing error.
        if (cells.length < 2) continue;
        if (section === 'OP_ASSESSMENT') {
            if (cells.length < 11) continue;
            const [oppId, oppLabel, healthRaw, requiredRaw, availableRaw, feasibleRaw, suggestedRaw, reason, blocker, nextAction, summary] = cells;
            const opp = opportunities.find(item => item.id === oppId.trim());
            if (!opp) continue;
            const health = Math.max(0, Math.min(100, Number(healthRaw.replace('%', ''))));
            const requiredHours = Math.max(0, Number(requiredRaw.replace(/[^0-9.]/g, '')));
            const availableHours = Math.max(0, Number(availableRaw.replace(/[^0-9.]/g, '')));
            if (![health, requiredHours, availableHours].every(Number.isFinite)) continue;
            const feasibility = feasibleRaw.trim().toUpperCase();
            const feasible: ParsedOpportunityAssessment['feasible'] = /^(YES|SI|SÍ)$/.test(feasibility) ? 'YES' : feasibility === 'NO' ? 'NO' : 'AT RISK';
            const suggestedDelivery = normalizeDate(suggestedRaw);
            opportunityAssessments.push({ id: nextId(), oppId: opp.id, oppLabel: opp.alias || opp.title || oppLabel, health, requiredHours, availableHours, feasible, suggestedDelivery: isDateValid(suggestedDelivery) ? suggestedDelivery : '', reason, blocker, nextAction, summary });
        } else if (section === 'DUE_DATES') {
            if (cells.length < 4) { errors.push({ section: 'SCHEDULE', line, reason: 'Expected Key, Task, DueDate and Rationale.' }); continue; }
            const compactRow = cells.length === 4;
            const [key, oppLabel, taskLabel, rawDueDate, rationale = ''] = compactRow
                ? [cells[0], '', cells[1], cells[2], cells[3]]
                : cells;
            const date = normalizeDate(rawDueDate);
            const resolved = resolveTask(key, oppLabel, taskLabel, index);
            if (!resolved) { errors.push({ section: 'SCHEDULE', line, reason: `Could not match due-date task "${key}".` }); continue; }
            if (!isDateValid(date)) { errors.push({ section: 'SCHEDULE', line, reason: `Invalid proposed due date "${date}".` }); continue; }
            dueDateRows.push({ id: nextId(), key: `${resolved.opp.id}::${resolved.task.id}`, oppId: resolved.opp.id, taskId: resolved.task.id, oppLabel: resolved.opp.alias || resolved.opp.title, taskLabel: resolved.task.title, date, rationale });
        } else if (section === 'SCHEDULE') {
            let key: string, oppLabel: string, taskLabel: string, date: string, startTime: string, endTime: string, note: string;
            if (cells.length >= 7) {
                [key, oppLabel, taskLabel, date, startTime, endTime, note = ''] = cells;
            } else if (cells.length === 6 && splitTimeRange(cells[4])) {
                const range = splitTimeRange(cells[4])!;
                [key, oppLabel, taskLabel, date, note] = [cells[0], cells[1], cells[2], cells[3], cells[5]];
                [startTime, endTime] = range;
            } else if (cells.length === 5 && splitTimeRange(cells[3])) {
                const range = splitTimeRange(cells[3])!;
                [key, oppLabel, taskLabel, date, note] = [cells[0], '', cells[1], cells[2], cells[4]];
                [startTime, endTime] = range;
            } else if (cells.length === 6) {
                [key, oppLabel, taskLabel, date, startTime, endTime] = cells;
                note = '';
            } else {
                errors.push({ section, line, reason: 'Expected Key, Task, Date and either separate Start/End times or one HH:mm-HH:mm range.' });
                continue;
            }
            date = normalizeDate(date);
            startTime = normalizeTime(startTime);
            endTime = normalizeTime(endTime);
            const resolved = resolveTask(key, oppLabel, taskLabel, index);
            if (!resolved) { errors.push({ section, line, reason: `Could not match task (key "${key}" / "${oppLabel} :: ${taskLabel}").` }); continue; }
            if (!isDateValid(date)) { errors.push({ section, line, reason: `Invalid date "${date}", expected YYYY-MM-DD.` }); continue; }
            if (!isTimeValid(startTime) || !isTimeValid(endTime)) { errors.push({ section, line, reason: `Invalid time "${startTime}"/"${endTime}", expected HH:mm.` }); continue; }
            if (timeToMinutes(endTime) <= timeToMinutes(startTime)) { errors.push({ section, line, reason: 'End time must be after start time.' }); continue; }
            const restrictedDays = options.dayWindows && Object.keys(options.dayWindows).length > 0;
            if (restrictedDays) {
                const windows = options.dayWindows?.[date];
                if (!windows) {
                    errors.push({ section, line, reason: `Date "${date}" was not selected in the allowed schedule days.` });
                    continue;
                }
                const startMinutes = timeToMinutes(startTime);
                const endMinutes = timeToMinutes(endTime);
                const fitsWindow = (windows.length ? windows : [{ start: '08:00', end: '17:00' }]).some(window =>
                    isTimeValid(window.start) && isTimeValid(window.end)
                    && startMinutes >= timeToMinutes(window.start)
                    && endMinutes <= timeToMinutes(window.end)
                );
                if (!fitsWindow) {
                    const allowed = (windows.length ? windows : [{ start: '08:00', end: '17:00' }]).map(window => `${window.start}-${window.end}`).join(', ');
                    errors.push({ section, line, reason: `Block ${startTime}-${endTime} is outside the selected window(s) for ${date}: ${allowed}.` });
                    continue;
                }
            }
            scheduleRows.push({
                id: nextId(),
                key: `${resolved.opp.id}::${resolved.task.id}`,
                oppId: resolved.opp.id,
                taskId: resolved.task.id,
                oppLabel: resolved.opp.alias || resolved.opp.title,
                taskLabel: resolved.task.title,
                date, startTime, endTime, note,
            });
        } else {
            if (cells.length < 4) { errors.push({ section, line, reason: 'Expected Key, Task, RemindAt and Title.' }); continue; }
            const compactRow = cells.length === 4;
            const [key, oppLabel, taskLabel, rawRemindAt, title] = compactRow
                ? [cells[0], '', cells[1], cells[2], cells[3]]
                : cells;
            const remindAt = normalizeDateTime(rawRemindAt);
            const resolved = resolveTask(key, oppLabel, taskLabel, index);
            if (!resolved) { errors.push({ section, line, reason: `Could not match task (key "${key}" / "${oppLabel} :: ${taskLabel}").` }); continue; }
            if (!isDateTimeValid(remindAt)) { errors.push({ section, line, reason: `Invalid datetime "${rawRemindAt}", expected YYYY-MM-DDTHH:mm.` }); continue; }
            reminderRows.push({
                id: nextId(),
                key: `${resolved.opp.id}::${resolved.task.id}`,
                oppId: resolved.opp.id,
                taskId: resolved.task.id,
                oppLabel: resolved.opp.alias || resolved.opp.title,
                taskLabel: resolved.task.title,
                remindAt,
                title: title || `Prep for: ${resolved.task.title}`,
            });
        }
    }

    return { scheduleRows, reminderRows, recommendations, paretoInsights, blockerInsights, deliveryInsights, missingTaskInsights, dueDateRows, opportunityAssessments, errors };
};
