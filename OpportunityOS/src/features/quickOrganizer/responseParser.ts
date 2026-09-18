import { Opportunity, Task } from '../../types';
import { timeToMinutes } from '../schedule/executionBlockUtils';
import { PROCESS_SECTIONS, ProcessSection } from '../../services/processSections';

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

/** A new task proposed by the AI. The saved task title stays in English; the reason is localized. */
export interface ParsedMissingTaskSuggestion {
    id: string;
    oppId: string;
    oppLabel: string;
    titleEnglish: string;
    reason: string;
    dueDate: string;
    /** Process section the task belongs to, used to place it in the plan instead of appending it. */
    processSection?: ProcessSection;
}

/**
 * [TA6] Sections the app shows but never writes back.
 *
 * They exist because the audit's core complaint was that anything which is not a calendar block
 * disappeared from the plan: a five-minute ping that unblocks someone else, an escalation that is
 * already overdue, a date that is correct but falls outside the horizon the user authorized.
 * They are parsed so the review screen can show them, and deliberately not applied — the user
 * decides what to do with each one.
 */
export interface ParsedRankingRow {
    id: string; rank: number; oppId: string; oppLabel: string; score: number;
    bucket: string; outOfScope: boolean; why: string;
}

export interface ParsedExternalPushRow {
    id: string; key: string; oppId: string; taskId: string; oppLabel: string;
    type: 'Ping' | 'Question' | 'Escalation'; to: string; sendBy: string; message: string;
}

export interface ParsedContingentRow {
    id: string; key: string; oppId: string; taskId: string; oppLabel: string;
    taskLabel: string; trigger: string; estMinutes: number | null; action: string;
}

export interface ParsedQueueRow {
    id: string; position: number; key: string; oppId: string; taskId: string;
    taskLabel: string; subtask: string; estMinutes: number | null; dependsOn: string; doneWhen: string;
}

export interface ParsedSuggestedMoveRow {
    id: string; blockId: string; scope: string; name: string; action: string;
    currentDate: string; currentStart: string; currentEnd: string;
    newDate: string; newStart: string; newEnd: string; reason: string;
}

export interface ParsedOutOfScopeRow {
    id: string; scope: 'Task' | 'Opportunity'; key: string; name: string;
    currentDate: string; advisedDate: string; reason: string;
}

/** Delivery-date change for the whole opportunity. Unlike the rows above, this one IS applied. */
export interface ParsedDeliveryDateRow {
    id: string; oppId: string; oppLabel: string;
    currentDelivery: string; date: string; rationale: string;
}

/**
 * [TA6] A question the AI needs answered to do better next round.
 *
 * The point of the section is a second pass: the user answers in the review screen, the answers are
 * appended to the prompt, and the same analysis runs again with the gaps closed. `assumed` is what
 * the AI used in the meantime, so an unanswered question never blocks the plan.
 */
export interface ParsedQuestionRow {
    id: string;
    num: number;
    question: string;
    whyItMatters: string;
    assumed: string;
    /** Filled in by the user in the review screen. */
    answer: string;
}

/** Answer-level metadata, used to detect a truncated or reformatted reply. */
export interface ParsedMeta {
    schemaVersion: string; generatedAt: string;
    opportunityCount: number | null; taskCount: number | null; overallConfidence: number | null;
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
    missingTaskSuggestions: ParsedMissingTaskSuggestion[];
    dueDateRows: ParsedDueDateRow[];
    opportunityAssessments: ParsedOpportunityAssessment[];
    /** [TA6] Applied on accept, like dueDateRows. */
    deliveryDateRows: ParsedDeliveryDateRow[];
    /** [TA6] Advisory: displayed for the user to act on manually, never written to the database. */
    rankingRows: ParsedRankingRow[];
    externalPushRows: ParsedExternalPushRow[];
    contingentRows: ParsedContingentRow[];
    queueRows: ParsedQueueRow[];
    suggestedMoveRows: ParsedSuggestedMoveRow[];
    outOfScopeRows: ParsedOutOfScopeRow[];
    questionRows: ParsedQuestionRow[];
    assumptions: string[];
    meta: ParsedMeta | null;
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
    // The whitespace before the key must NOT follow a column separator. Sections such as
    // EXECUTION QUEUE ("Pos | Key | …") and OUT_OF_SCOPE_ADVICE ("Scope | Key | …") carry the key
    // in a later column, and without this guard a perfectly well-formed row was split in two at
    // its own key, losing every column before it.
    const rowStart = new RegExp(`(^|(?<=[^|\\s])[ \\t]+)(${escapedKeys.join('|')})(?=\\s*\\|)`, 'gm');
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
    const missingTaskSuggestions: ParsedMissingTaskSuggestion[] = [];
    const dueDateRows: ParsedDueDateRow[] = [];
    const opportunityAssessments: ParsedOpportunityAssessment[] = [];
    const deliveryDateRows: ParsedDeliveryDateRow[] = [];
    const rankingRows: ParsedRankingRow[] = [];
    const externalPushRows: ParsedExternalPushRow[] = [];
    const contingentRows: ParsedContingentRow[] = [];
    const queueRows: ParsedQueueRow[] = [];
    const suggestedMoveRows: ParsedSuggestedMoveRow[] = [];
    const outOfScopeRows: ParsedOutOfScopeRow[] = [];
    const questionRows: ParsedQuestionRow[] = [];
    const assumptions: string[] = [];
    let meta: ParsedMeta | null = null;
    const errors: ParseError[] = [];

    const lines = unfoldCollapsedRows(text, index).split(/\r?\n/);
    let section:
        | 'RECOMMENDATIONS' | 'PARETO' | 'BLOCKERS' | 'DELIVERY' | 'MISSING_TASKS' | 'DUE_DATES'
        | 'SCHEDULE' | 'REMINDERS' | 'OP_ASSESSMENT'
        | 'META' | 'RANKING' | 'MOVES' | 'QUEUE' | 'CONTINGENT' | 'EXTERNAL_PUSH'
        | 'DELIVERY_DATES' | 'OUT_OF_SCOPE' | 'ASSUMPTIONS' | 'QUESTIONS'
        | null = null;

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const heading = normalizeHeading(line);
        if (/^(RECOMMENDATIONS|RECOMENDACIONES)\b/.test(heading)) { section = 'RECOMMENDATIONS'; continue; }
        if (/^(PARETO|20\/80)\b/.test(heading)) { section = 'PARETO'; continue; }
        if (/^(BLOCKERS|BLOCKAGES|BLOQUEOS)\b/.test(heading)) { section = 'BLOCKERS'; continue; }
        // [TA6] Tested before the looser DELIVERY / DUE DATES patterns: "PROPOSED DELIVERY DATES"
        // also matches both of them, so a later test would swallow the section.
        if (/^(PROPOSED[_ ]DELIVERY[_ ]DATES|FECHAS DE ENTREGA PROPUESTAS)\b/.test(heading)) { section = 'DELIVERY_DATES'; continue; }
        if (/^(OUT[_ ]OF[_ ]SCOPE[_ ]ADVICE|FUERA DE ALCANCE)\b/.test(heading)) { section = 'OUT_OF_SCOPE'; continue; }
        if (/^(SUGGESTED[_ ]MOVES|MOVIMIENTOS SUGERIDOS)\b/.test(heading)) { section = 'MOVES'; continue; }
        if (/^(EXTERNAL[_ ]PUSH|EMPUJE EXTERNO|SEGUIMIENTO EXTERNO)\b/.test(heading)) { section = 'EXTERNAL_PUSH'; continue; }
        if (/^(EXECUTION[_ ]QUEUE|COLA DE EJECUCION|FILA DE EJECUCION)\b/.test(heading)) { section = 'QUEUE'; continue; }
        if (/^(CONTINGENT|CONTINGENTE|TRABAJO CONTINGENTE)\b/.test(heading)) { section = 'CONTINGENT'; continue; }
        if (/^(PRIORITY[_ ]RANKING|RANKING|PRIORIDAD)\b/.test(heading)) { section = 'RANKING'; continue; }
        if (/^(QUESTIONS|PREGUNTAS)\b/.test(heading)) { section = 'QUESTIONS'; continue; }
        if (/^(ASSUMPTIONS|SUPUESTOS)\b/.test(heading)) { section = 'ASSUMPTIONS'; continue; }
        if (/^META\b/.test(heading)) { section = 'META'; continue; }
        if (/^(DELIVERY OUTLOOK|DELIVERY ANALYSIS|PANORAMA DE ENTREGA|ENTREGA)\b/.test(heading)) { section = 'DELIVERY'; continue; }
        if (/^(MISSING TASKS|SUGGESTED MISSING TASKS|TAREAS FALTANTES)\b/.test(heading)) { section = 'MISSING_TASKS'; continue; }
        if (/^(PROPOSED DUE DATES|DUE DATES|FECHAS LIMITE PROPUESTAS|FECHAS PROPUESTAS)\b/.test(heading)) { section = 'DUE_DATES'; continue; }
        if (/^(SCHEDULE|AGENDA|CRONOGRAMA)\b/.test(heading)) { section = 'SCHEDULE'; continue; }
        if (/^(REMINDERS|RECORDATORIOS)\b/.test(heading)) { section = 'REMINDERS'; continue; }
        if (/^(OPPORTUNITY ASSESSMENT|OP ASSESSMENT|EVALUACION DE OPORTUNIDADES)\b/.test(heading)) { section = 'OP_ASSESSMENT'; continue; }
        if (!section) continue;
        if (section === 'MISSING_TASKS' && line.includes('|')) {
            const cells = splitCells(line);
            if (/^oppid$/i.test(cells[0] || '') || /^[-:\s]+$/.test(cells[0] || '')) continue;
            if (cells.length >= 5) {
                const [oppId, oppLabel, titleEnglish, reason, rawDueDate, rawSection] = cells;
                // Only a section the app actually knows is honoured; anything else leaves the task unplaced.
                const processSection = PROCESS_SECTIONS.find(section => section.toLowerCase() === (rawSection || '').trim().toLowerCase());
                const opp = opportunities.find(item => item.id === oppId.trim());
                const dueDate = normalizeDate(rawDueDate);
                if (opp && titleEnglish.trim()) {
                    missingTaskSuggestions.push({
                        id: nextId(), oppId: opp.id, oppLabel: opp.alias || opp.title || oppLabel,
                        titleEnglish: titleEnglish.trim(), reason: reason.trim(),
                        dueDate: isDateValid(dueDate) ? dueDate : '',
                        processSection,
                    });
                }
            }
            continue;
        }
        if (section === 'RECOMMENDATIONS' || section === 'PARETO' || section === 'BLOCKERS' || section === 'DELIVERY' || section === 'MISSING_TASKS' || section === 'ASSUMPTIONS') {
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
                else if (section === 'ASSUMPTIONS') assumptions.push(value);
                else missingTaskInsights.push(value);
            }
            continue;
        }
        // Skip code fences, header rows and separator rows (e.g. "Key | Opportunity | ..." or "---|---"
        // or their markdown-wrapped equivalents "| Key | ... |" / "|---|---|") in case the AI ignored
        // the "no markdown fences/table syntax" instruction.
        const bareLine = line.replace(/^\|+\s*/, '').replace(/\s*\|+$/, '');
        if (/^```/.test(line) || /^(key|rank|blockid|pos|scope|oppid|schemaversion|num)\b/i.test(bareLine) || /^[-|:\s]+$/.test(line)) continue;

        const cells = splitCells(line);
        // A line with no delimiter at all is stray prose (e.g. "Let me know if you want changes!"),
        // not a malformed row — skip it silently instead of reporting a confusing error.
        if (cells.length < 2) continue;
        // [TA6] Advisory sections. They are parsed defensively: a malformed advisory row is
        // dropped instead of reported, because none of them writes to the database and a noisy
        // error list would bury the errors that actually block accepting the plan.
        if (section === 'META') {
            if (cells.length < 4) continue;
            const [schemaVersion, generatedAt, oppCount, taskCount, confidence = ''] = cells;
            const toNumber = (value: string) => {
                const parsed = Number(String(value).replace(/[^0-9.]/g, ''));
                return Number.isFinite(parsed) ? parsed : null;
            };
            meta = {
                schemaVersion: schemaVersion.trim(),
                generatedAt: normalizeDateTime(generatedAt),
                opportunityCount: toNumber(oppCount),
                taskCount: toNumber(taskCount),
                overallConfidence: toNumber(confidence),
            };
            continue;
        }
        if (section === 'QUESTIONS') {
            if (cells.length < 2) continue;
            const [numRaw, question, whyItMatters = '', assumed = ''] = cells;
            if (!question.trim()) continue;
            questionRows.push({
                id: nextId(),
                num: Number(String(numRaw).replace(/[^0-9]/g, '')) || questionRows.length + 1,
                question: question.trim(),
                whyItMatters: whyItMatters.trim(),
                assumed: assumed.trim(),
                answer: '',
            });
            continue;
        }
        if (section === 'RANKING') {
            if (cells.length < 5) continue;
            const [rankRaw, oppId, oppLabel, scoreRaw, bucketRaw, why = ''] = cells;
            const opp = opportunities.find(item => item.id === oppId.trim());
            const bucket = (bucketRaw || '').trim();
            rankingRows.push({
                id: nextId(),
                rank: Number(String(rankRaw).replace(/[^0-9]/g, '')) || rankingRows.length + 1,
                oppId: opp?.id || oppId.trim(),
                oppLabel: opp ? (opp.alias || opp.title) : oppLabel.trim(),
                score: Number(String(scoreRaw).replace(/[^0-9.]/g, '')) || 0,
                // The prompt asks for "OUT-OF-SCOPE" appended to the bucket rather than given a
                // column of its own, so the flag is recovered here and stripped from the label.
                bucket: bucket.replace(/[\s/-]*OUT[\s_-]*OF[\s_-]*SCOPE/i, '').trim() || bucket,
                outOfScope: /OUT[\s_-]*OF[\s_-]*SCOPE/i.test(bucket),
                why: why.trim(),
            });
            continue;
        }
        if (section === 'MOVES') {
            if (cells.length < 11) continue;
            const [blockId, scope, name, action, currentDate, currentStart, currentEnd, newDate, newStart, newEnd, reason = ''] = cells;
            suggestedMoveRows.push({
                id: nextId(), blockId: blockId.trim(), scope: scope.trim(), name: name.trim(), action: action.trim(),
                currentDate: normalizeDate(currentDate), currentStart: normalizeTime(currentStart), currentEnd: normalizeTime(currentEnd),
                newDate: normalizeDate(newDate), newStart: normalizeTime(newStart), newEnd: normalizeTime(newEnd),
                reason: reason.trim(),
            });
            continue;
        }
        if (section === 'QUEUE') {
            if (cells.length < 5) continue;
            const [posRaw, key, taskLabel, subtask, estRaw, dependsOn = '', doneWhen = ''] = cells;
            const resolved = resolveTask(key, '', taskLabel, index);
            const estMinutes = Number(String(estRaw).replace(/[^0-9.]/g, ''));
            queueRows.push({
                id: nextId(),
                position: Number(String(posRaw).replace(/[^0-9]/g, '')) || queueRows.length + 1,
                key: resolved ? resolved.opp.id + '::' + resolved.task.id : key.trim(),
                oppId: resolved?.opp.id || '', taskId: resolved?.task.id || '',
                taskLabel: resolved?.task.title || taskLabel.trim(),
                subtask: subtask.trim() === '-' ? '' : subtask.trim(),
                estMinutes: Number.isFinite(estMinutes) && estMinutes > 0 ? estMinutes : null,
                dependsOn: dependsOn.trim(), doneWhen: doneWhen.trim(),
            });
            continue;
        }
        if (section === 'CONTINGENT') {
            if (cells.length < 5) continue;
            const [key, oppLabel, taskLabel, trigger, estRaw, action = ''] = cells;
            const resolved = resolveTask(key, oppLabel, taskLabel, index);
            const estMinutes = Number(String(estRaw).replace(/[^0-9.]/g, ''));
            contingentRows.push({
                id: nextId(),
                key: resolved ? resolved.opp.id + '::' + resolved.task.id : key.trim(),
                oppId: resolved?.opp.id || '', taskId: resolved?.task.id || '',
                oppLabel: resolved ? (resolved.opp.alias || resolved.opp.title) : oppLabel.trim(),
                taskLabel: resolved?.task.title || taskLabel.trim(),
                trigger: trigger.trim(),
                estMinutes: Number.isFinite(estMinutes) && estMinutes > 0 ? estMinutes : null,
                action: action.trim(),
            });
            continue;
        }
        if (section === 'EXTERNAL_PUSH') {
            if (cells.length < 5) continue;
            const [key, oppLabel, typeRaw, to, sendBy, message = ''] = cells;
            const resolved = resolveTask(key, oppLabel, '', index);
            const normalizedType = (typeRaw || '').trim().toLowerCase();
            const type: ParsedExternalPushRow['type'] = normalizedType.startsWith('escal')
                ? 'Escalation'
                : normalizedType.startsWith('quest') || normalizedType.startsWith('pregunt') ? 'Question' : 'Ping';
            externalPushRows.push({
                id: nextId(),
                key: resolved ? resolved.opp.id + '::' + resolved.task.id : key.trim(),
                oppId: resolved?.opp.id || '', taskId: resolved?.task.id || '',
                oppLabel: resolved ? (resolved.opp.alias || resolved.opp.title) : oppLabel.trim(),
                type, to: to.trim(), sendBy: normalizeTime(sendBy), message: message.trim(),
            });
            continue;
        }
        if (section === 'OUT_OF_SCOPE') {
            if (cells.length < 6) continue;
            const [scopeRaw, key, name, currentDate, advisedDate, reason = ''] = cells;
            outOfScopeRows.push({
                id: nextId(),
                scope: /^opp/i.test(scopeRaw.trim()) ? 'Opportunity' : 'Task',
                key: key.trim(), name: name.trim(),
                currentDate: normalizeDate(currentDate), advisedDate: normalizeDate(advisedDate),
                reason: reason.trim(),
            });
            continue;
        }
        if (section === 'DELIVERY_DATES') {
            if (cells.length < 4) continue;
            const [oppId, oppLabel, currentDelivery, proposed, rationale = ''] = cells;
            const opp = opportunities.find(item => item.id === oppId.trim());
            const date = normalizeDate(proposed);
            // This section IS applied to the database, so an unmatched opportunity or an invalid
            // date is a real error the user must see, not a silently dropped advisory row.
            if (!opp) { errors.push({ section: 'SCHEDULE', line, reason: 'Could not match opportunity "' + oppId + '" for a proposed delivery date.' }); continue; }
            if (!isDateValid(date)) { errors.push({ section: 'SCHEDULE', line, reason: 'Invalid proposed delivery date "' + proposed + '".' }); continue; }
            deliveryDateRows.push({
                id: nextId(), oppId: opp.id, oppLabel: opp.alias || opp.title || oppLabel.trim(),
                currentDelivery: normalizeDate(currentDelivery), date, rationale: rationale.trim(),
            });
            continue;
        }
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

    return { scheduleRows, reminderRows, recommendations, paretoInsights, blockerInsights, deliveryInsights, missingTaskInsights, missingTaskSuggestions, dueDateRows, opportunityAssessments, deliveryDateRows, rankingRows, externalPushRows, contingentRows, queueRows, suggestedMoveRows, outOfScopeRows, questionRows, assumptions, meta, errors };
};
