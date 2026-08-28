/**
 * A per-user execution model, computed from the user's own history.
 *
 * Deliberately NOT AI and deliberately offline: every number here comes from data already in the
 * database (completed tasks, time logs, execution blocks, external-area turnaround) and is produced
 * by plain arithmetic. Nothing is sent anywhere. The model exists so date estimates stop being a
 * guess — the app can say "a Costing & Commercial task has taken you 6 working days, median, over
 * 14 samples", and the Quick Organizer prompt can carry both the numbers AND the formula the
 * assistant must apply, instead of inventing its own optimism.
 *
 * The model is recomputed from scratch each time rather than incrementally updated: the inputs are
 * small (hundreds of tasks), and a pure function of the database can never drift out of sync with
 * it. It gets better on its own as the user closes more tasks and applies more agendas.
 */

import { Opportunity, Task } from '../types';
import { PROCESS_SECTIONS, ProcessSection } from './processSections';

/** Bucket key for tasks with no process section set. */
export const UNASSIGNED_SECTION = 'Unassigned' as const;
export type ModelSection = ProcessSection | typeof UNASSIGNED_SECTION;

export interface SectionStats {
    section: ModelSection;
    /** Completed tasks that fed this bucket. */
    samples: number;
    /** Median calendar days from first recorded work to completion. */
    medianLeadDays: number | null;
    /** Median hours actually logged on the timer. */
    medianActiveHours: number | null;
    /** Median (completionDate − dueDate) in days. Positive = delivered late. */
    medianSlipDays: number | null;
    /** Conservative slip: the 80th percentile, used to size buffers. */
    p80SlipDays: number | null;
    /** Share of these tasks delivered on or before their due date. */
    onTimeRate: number | null;
}

export interface AreaStats {
    area: string;
    samples: number;
    /** Median calendar days from "requested" to "delivered" for this external area. */
    medianTurnaroundDays: number;
    p80TurnaroundDays: number;
}

export interface ExecutionModel {
    version: number;
    computedAt: string;
    /** Completed tasks used across every bucket. */
    totalSamples: number;
    /** 0–1. How much any estimate derived from this model should be trusted. */
    confidence: number;
    /** Median hours actually logged on a day where the user logged anything. */
    dailyThroughputHours: number | null;
    /** Share of planned execution blocks that ended up with real logged time. */
    planAdherence: number | null;
    /** Median (completionDate − dueDate) across every completed task with a due date. */
    globalMedianSlipDays: number | null;
    sections: SectionStats[];
    areas: AreaStats[];
    /** Plain-language reasons the model is weak. Shown to the user and sent in the prompt. */
    gaps: string[];
}

const DAY_MS = 86_400_000;

const toDate = (value?: string | null): Date | null => {
    if (!value) return null;
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return isNaN(date.getTime()) ? null : date;
};

const daysBetween = (from?: string | null, to?: string | null): number | null => {
    const a = toDate(from);
    const b = toDate(to);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
};

const median = (values: number[]): number | null => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Nearest-rank percentile — no interpolation, so a 2-sample bucket still returns a real observation. */
const percentile = (values: number[], p: number): number | null => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
    return sorted[Math.min(rank, sorted.length) - 1];
};

const round1 = (value: number | null): number | null => (value === null ? null : Math.round(value * 10) / 10);

/** The day a task was finished, preferring the day the user confirmed over the click timestamp. */
export const taskCompletionDay = (task: Task): string | null => {
    if (task.completionDate) return task.completionDate;
    if (task.completedAt) return task.completedAt.slice(0, 10);
    return null;
};

/** Earliest evidence that work on the task actually started. */
const taskStartDay = (task: Task): string | null => {
    const candidates: string[] = [];
    (task.timeLogs || []).forEach(log => { if (log.start) candidates.push(log.start.slice(0, 10)); });
    (task.executionBlocks || []).forEach(block => { if (block.date) candidates.push(block.date); });
    if (task.responsibleRequestedDate) candidates.push(task.responsibleRequestedDate);
    return candidates.sort()[0] || null;
};

const loggedHours = (task: Task): number =>
    (task.timeLogs || []).reduce((total, log) => total + (log.durationSeconds || 0), 0) / 3600;

/**
 * Builds the model from every opportunity in the database.
 *
 * Only completed tasks contribute: an open task has no outcome to learn from, and counting it
 * would bias every estimate optimistic.
 */
export const buildExecutionModel = (opportunities: Opportunity[]): ExecutionModel => {
    const completed: Task[] = [];
    const allTasks: Task[] = [];
    for (const opp of opportunities) {
        for (const task of opp.tasks || []) {
            allTasks.push(task);
            if (task.status === 'Done' && taskCompletionDay(task)) completed.push(task);
        }
    }

    // --- per process section -------------------------------------------------------------------
    const buckets = new Map<ModelSection, Task[]>();
    for (const task of completed) {
        const key = (task.processSection || UNASSIGNED_SECTION) as ModelSection;
        buckets.set(key, [...(buckets.get(key) || []), task]);
    }
    const sectionOrder: ModelSection[] = [...PROCESS_SECTIONS, UNASSIGNED_SECTION];
    const sections: SectionStats[] = sectionOrder
        .filter(section => (buckets.get(section) || []).length > 0)
        .map(section => {
            const tasks = buckets.get(section) || [];
            const leadDays: number[] = [];
            const activeHours: number[] = [];
            const slipDays: number[] = [];
            let onTime = 0;
            let withDueDate = 0;
            for (const task of tasks) {
                const done = taskCompletionDay(task)!;
                const start = taskStartDay(task);
                const lead = daysBetween(start, done);
                if (lead !== null && lead >= 0) leadDays.push(lead);
                const hours = loggedHours(task);
                if (hours > 0) activeHours.push(hours);
                if (task.dueDate) {
                    withDueDate++;
                    const slip = daysBetween(task.dueDate, done);
                    if (slip !== null) {
                        slipDays.push(slip);
                        if (slip <= 0) onTime++;
                    }
                }
            }
            return {
                section,
                samples: tasks.length,
                medianLeadDays: round1(median(leadDays)),
                medianActiveHours: round1(median(activeHours)),
                medianSlipDays: round1(median(slipDays)),
                p80SlipDays: round1(percentile(slipDays, 80)),
                onTimeRate: withDueDate ? Math.round((onTime / withDueDate) * 100) / 100 : null,
            };
        });

    // --- per external area ---------------------------------------------------------------------
    const areaTurnarounds = new Map<string, number[]>();
    for (const task of allTasks) {
        const turnaround = daysBetween(task.responsibleRequestedDate, task.responsibleDeliveredDate);
        if (turnaround === null || turnaround < 0) continue;
        const areas = (task.externalAreas || []).filter(Boolean);
        for (const area of areas.length ? areas : ['Unspecified area']) {
            areaTurnarounds.set(area, [...(areaTurnarounds.get(area) || []), turnaround]);
        }
    }
    const areas: AreaStats[] = [...areaTurnarounds.entries()]
        .map(([area, values]) => ({
            area,
            samples: values.length,
            medianTurnaroundDays: round1(median(values)) ?? 0,
            p80TurnaroundDays: round1(percentile(values, 80)) ?? 0,
        }))
        .sort((a, b) => b.samples - a.samples);

    // --- capacity ------------------------------------------------------------------------------
    const hoursByDay = new Map<string, number>();
    for (const task of allTasks) {
        for (const log of task.timeLogs || []) {
            const day = (log.start || '').slice(0, 10);
            if (!day) continue;
            hoursByDay.set(day, (hoursByDay.get(day) || 0) + (log.durationSeconds || 0) / 3600);
        }
    }
    const dailyThroughputHours = round1(median([...hoursByDay.values()].filter(hours => hours > 0)));

    // Adherence: of the blocks the user planned in the past, how many got real logged time that day.
    const todayStr = new Date().toLocaleDateString('en-CA');
    let pastBlocks = 0;
    let honouredBlocks = 0;
    for (const task of allTasks) {
        for (const block of task.executionBlocks || []) {
            if (!block.date || block.date >= todayStr) continue;
            pastBlocks++;
            const workedThatDay = (task.timeLogs || []).some(log => (log.start || '').slice(0, 10) === block.date);
            if (workedThatDay) honouredBlocks++;
        }
    }
    const planAdherence = pastBlocks ? Math.round((honouredBlocks / pastBlocks) * 100) / 100 : null;

    const globalSlips = completed
        .filter(task => task.dueDate)
        .map(task => daysBetween(task.dueDate, taskCompletionDay(task)!))
        .filter((value): value is number => value !== null);

    // --- confidence ----------------------------------------------------------------------------
    // Three things must be true for an estimate to mean anything: enough finished tasks, tasks
    // classified into sections, and some real time logged. Each is capped at 1 and averaged, so one
    // strong signal cannot hide two missing ones.
    const sampleScore = Math.min(1, completed.length / 30);
    const sectionScore = Math.min(1, sections.filter(s => s.section !== UNASSIGNED_SECTION).length / 4);
    const timeScore = Math.min(1, hoursByDay.size / 15);
    const confidence = Math.round(((sampleScore + sectionScore + timeScore) / 3) * 100) / 100;

    const gaps: string[] = [];
    if (completed.length < 10) gaps.push(`Only ${completed.length} completed task(s) recorded — close tasks as you finish them so durations can be measured.`);
    if (!sections.some(s => s.section !== UNASSIGNED_SECTION)) gaps.push('No completed task has a Process Section — without it, estimates cannot be specialized per kind of work.');
    if (hoursByDay.size < 5) gaps.push(`Time was logged on only ${hoursByDay.size} day(s) — use the task timer so real capacity can be measured instead of assumed.`);
    if (!globalSlips.length) gaps.push('No completed task had a due date — set due dates so the model can learn how much they typically slip.');
    if (!areas.length) gaps.push('No external assignment has both a request and a delivery date — fill them so waiting time on other areas can be predicted.');
    if (planAdherence === null) gaps.push('No past scheduled block to compare against logged time — apply an agenda and work from it so plan adherence becomes measurable.');

    return {
        version: 1,
        computedAt: new Date().toISOString(),
        totalSamples: completed.length,
        confidence,
        dailyThroughputHours,
        planAdherence,
        globalMedianSlipDays: round1(median(globalSlips)),
        sections,
        areas,
        gaps,
    };
};

export interface TaskForecast {
    taskId: string;
    /** Hours the model expects the task still needs. */
    expectedHours: number;
    /** Calendar days the model expects it to take from today, at the given daily capacity. */
    expectedDays: number;
    /** The date the model expects it to be finished. */
    expectedFinish: string;
    /** True when the current due date is earlier than the expected finish. */
    willMissDueDate: boolean;
    /** The date the model would commit to instead. Equal to expectedFinish when it will slip. */
    suggestedDueDate: string;
    /** 0–1, inherited from the model and reduced when the bucket itself is thin. */
    confidence: number;
    /** One line explaining the numbers, shown to the user and sent to the assistant. */
    basis: string;
}

const addWorkingDays = (fromIso: string, days: number): string => {
    const date = toDate(fromIso) || new Date();
    let remaining = Math.max(0, Math.ceil(days));
    while (remaining > 0) {
        date.setDate(date.getDate() + 1);
        const weekday = date.getDay();
        if (weekday !== 0 && weekday !== 6) remaining--;
    }
    return date.toLocaleDateString('en-CA');
};

/**
 * Projects when a task will realistically be finished.
 *
 * The estimate is intentionally simple and explainable: take the median effort observed for this
 * kind of work, add the buffer the user's own history says this kind of work needs (the p80 slip),
 * divide by the capacity actually available per day, and walk forward over working days. When the
 * model has no data for the section it falls back to the global numbers, and when it has neither it
 * says so instead of inventing a date.
 */
export const forecastTask = (
    task: Task,
    model: ExecutionModel,
    options: { todayStr?: string; dailyCapacityHours?: number } = {}
): TaskForecast => {
    const todayStr = options.todayStr || new Date().toLocaleDateString('en-CA');
    const sectionKey = (task.processSection || UNASSIGNED_SECTION) as ModelSection;
    const stats = model.sections.find(section => section.section === sectionKey);

    // Effort: what this kind of work usually costs, minus what has already been logged.
    const fallbackHours = round1(median(model.sections.map(s => s.medianActiveHours).filter((v): v is number => v !== null))) ?? 4;
    const typicalHours = stats?.medianActiveHours ?? fallbackHours;
    const alreadyLogged = loggedHours(task);
    const expectedHours = Math.max(0.5, round1(typicalHours - alreadyLogged) ?? 0.5);

    // Capacity: what the user can really give it per day. The focus policy's ceiling is an upper
    // bound; measured throughput is the honest number when it is lower.
    const capacityCandidates = [options.dailyCapacityHours, model.dailyThroughputHours].filter(
        (value): value is number => typeof value === 'number' && value > 0
    );
    const dailyCapacity = capacityCandidates.length ? Math.min(...capacityCandidates) : 4;

    // Buffer: this kind of work's own track record of slipping, not a flat safety margin.
    const bufferDays = Math.max(0, stats?.p80SlipDays ?? model.globalMedianSlipDays ?? 0);
    const workDays = expectedHours / dailyCapacity;
    const expectedDays = Math.ceil(workDays + bufferDays);
    const expectedFinish = addWorkingDays(todayStr, expectedDays);

    const willMissDueDate = !!task.dueDate && task.dueDate < expectedFinish;
    const sampleConfidence = stats ? Math.min(1, stats.samples / 8) : 0.3;
    const confidence = Math.round(model.confidence * sampleConfidence * 100) / 100;

    const basisParts = [
        `${expectedHours}h remaining at ${dailyCapacity}h/day`,
        bufferDays > 0 ? `+${bufferDays}d historical slip` : 'no historical slip',
        stats ? `${stats.samples} sample(s) for ${sectionKey}` : 'no samples for this section — global fallback',
    ];

    return {
        taskId: task.id,
        expectedHours,
        expectedDays,
        expectedFinish,
        willMissDueDate,
        suggestedDueDate: willMissDueDate ? expectedFinish : (task.dueDate || expectedFinish),
        confidence,
        basis: basisParts.join('; '),
    };
};

/**
 * Renders the model as prompt text: the measured numbers, then the exact arithmetic to apply.
 *
 * The assistant is told to compute, not to feel. Handing it the formula plus the user's own
 * constants is what keeps proposed dates reproducible and anchored to this user's real pace rather
 * than to a generic idea of how long tendering work takes.
 */
export const renderExecutionModelForPrompt = (model: ExecutionModel): string[] => {
    const lines: string[] = [];
    lines.push('EXECUTION MODEL (USER-CALIBRATED, DETERMINISTIC — APPLY IT, DO NOT OVERRIDE IT):');
    lines.push(`Measured from ${model.totalSamples} completed task(s). Model confidence: ${Math.round(model.confidence * 100)}%.`);
    if (model.dailyThroughputHours !== null) lines.push(`- Measured throughput: ${model.dailyThroughputHours} h logged on a day the user works at all.`);
    if (model.planAdherence !== null) lines.push(`- Plan adherence: ${Math.round(model.planAdherence * 100)}% of past planned blocks had real work logged. Treat planned capacity above this share as optimistic.`);
    if (model.globalMedianSlipDays !== null) lines.push(`- Global slip: tasks finish ${model.globalMedianSlipDays} day(s) after their due date, median.`);

    if (model.sections.length) {
        lines.push('- Per process section — samples | median active hours | median lead days | median slip days | p80 slip days | on-time rate:');
        model.sections.forEach(section => {
            lines.push(`  - ${section.section}: ${section.samples} | ${section.medianActiveHours ?? '?'}h | ${section.medianLeadDays ?? '?'}d | ${section.medianSlipDays ?? '?'}d | ${section.p80SlipDays ?? '?'}d | ${section.onTimeRate === null ? '?' : `${Math.round(section.onTimeRate * 100)}%`}`);
        });
    }
    if (model.areas.length) {
        lines.push('- External area turnaround (request to delivery) — samples | median | p80:');
        model.areas.slice(0, 8).forEach(area => {
            lines.push(`  - ${area.area}: ${area.samples} | ${area.medianTurnaroundDays}d | ${area.p80TurnaroundDays}d`);
        });
    }

    lines.push('HOW TO USE IT (mandatory arithmetic for every date you propose):');
    lines.push('1. Effort = median active hours of the task\'s process section, minus hours already logged on that task. Floor at 0.5h. If the section has no samples, use the median across all sections.');
    lines.push('2. Capacity = the smaller of the daily focus ceiling and the measured throughput above. Never assume more.');
    lines.push('3. Working days = Effort / Capacity, rounded up, then add the p80 slip days of that section (global slip if the section has none).');
    lines.push('4. Expected finish = today plus that many WORKING days (skip weekends and any day outside the allowed windows).');
    lines.push('5. If the current due date is earlier than the expected finish, the task WILL slip: report it in PROPOSED_DUE_DATES with the expected finish as the new date, and state the arithmetic in Rationale (effort, capacity, buffer, samples).');
    lines.push('6. For a task waiting on an external area, add that area\'s p80 turnaround instead of doing the effort math; waiting is not work.');
    lines.push('7. Never propose a date more optimistic than this arithmetic gives. If a delivery date is impossible under it, say so plainly and give the earliest credible date.');

    if (model.gaps.length) {
        lines.push(`DATA GAPS (confidence ${Math.round(model.confidence * 100)}%) — the estimates above are weak because:`);
        model.gaps.forEach(gap => lines.push(`- ${gap}`));
        lines.push('Because the numeric history is thin, lean harder on the opportunity notes, history events and scope text supplied below: infer effort and risk from what was actually written there, state every assumption you make in one short line, and mark low-confidence dates explicitly. Still produce a usable plan — do not refuse or return empty sections for lack of data.');
    }
    return lines;
};
