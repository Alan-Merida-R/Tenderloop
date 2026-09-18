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

/** "HH:mm" → minutes. Local to this module so it stays free of UI/feature imports. */
const timeToMinutes = (value: string): number => {
    const match = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};

/** Titles are compared case/accent/punctuation-insensitively so "Prepare CQA" groups with "prepare cqa.". */
const normalizeTitle = (value: string): string => (value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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

/**
 * [TA6] How far past agendas drifted from what actually happened.
 *
 * This is the answer to "cuánto se tardan las tareas y cuánto se ha desviado respecto a las
 * agendas anteriores": every execution block already in the database whose date is in the past is
 * compared against the time really logged on that task that day. The resulting ratio is the honest
 * correction factor for every future estimate — if a planned hour has historically cost 1.4 real
 * hours, saying "one hour" again is a known lie.
 */
export interface AgendaAccuracy {
    /** Past blocks considered (date strictly before today). */
    blocksPlanned: number;
    /** Past blocks that ended up with real logged time on the same task and day. */
    blocksWorked: number;
    /** Past blocks with zero logged time on that task and day. */
    blocksSkipped: number;
    /** Total hours planned by those blocks (end - start). */
    plannedHours: number;
    /** Total hours actually logged on those same task/day pairs. */
    loggedHours: number;
    /**
     * Median of (logged hours / planned hours) across the days where both exist.
     * >1 = the work systematically takes longer than planned; <1 = the block was oversized.
     * null when nothing was ever both planned and logged.
     */
    effortRatio: number | null;
    /** Median days between the FIRST date a task was planned for and the day it was really finished. */
    medianPlanToDoneDays: number | null;
    /** Median days between a task's first planned date and the first day work was really logged on it. */
    medianStartDelayDays: number | null;
    /** Same ratio as `effortRatio`, per process section, so the correction is specialized. */
    bySection: Array<{ section: ModelSection; blocksPlanned: number; blocksWorked: number; effortRatio: number | null }>;
}

/**
 * [TA6] What a task costs when the timer says nothing.
 *
 * Two independent sources, both already in the database and neither requiring the user to fill in
 * anything new:
 *
 *  - `standardDays` comes from the task standards in Settings: the gap between one template's
 *    dueDateOffset and the previous one IS the time that task is expected to take. It is the
 *    user's own declared standard, so it outranks any statistic derived from a handful of samples.
 *  - `elapsedDays` is measured: the calendar distance between finishing the previous task of the
 *    opportunity and finishing this one. It answers "how long did this actually occupy me",
 *    including the waiting, which is precisely what the timer cannot see.
 *
 * `pausedDays` is the difference between the two kinds of truth — elapsed days minus the days
 * work was really logged — and it is the honest measure of how long a task sits idle.
 */
export interface TitleDurationStats {
    title: string;
    samples: number;
    /** Median calendar days from the previous task's completion to this one's. */
    medianElapsedDays: number | null;
    /** Median days inside that span where time was actually logged. */
    medianActiveDays: number | null;
    /** medianElapsedDays - medianActiveDays: how long it typically sits idle. */
    medianPausedDays: number | null;
    /** Days this title is expected to take according to the Settings task standards. */
    standardDays: number | null;
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
    /** [TA6] Deviation of past agendas against reality — the correction factor for new estimates. */
    agendaAccuracy: AgendaAccuracy;
    /**
     * [TA6] Duration per task title measured in DAYS rather than hours, so estimates survive the
     * absence of the timer. Includes the user's declared standard from Settings when the title
     * matches a template there.
     */
    durationsByTitle: TitleDurationStats[];
    /** Median idle share across every measured task: elapsed days that had no logged work. */
    medianPausedDays: number | null;
    /**
     * [TA6] Median hours really logged, keyed by normalized task title. Level 2 of the estimation
     * hierarchy: the same task title repeated across opportunities is a far better predictor than
     * the section median, because tendering work is highly repetitive.
     */
    hoursByTaskTitle: Array<{ title: string; samples: number; medianHours: number }>;
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
/** The shape `buildExecutionModel` needs out of a Settings task standard, kept structural so this
 *  service does not import from the components layer. */
export interface TaskStandardLike {
    name: string;
    tasks: Array<{ title: string; order: number | null; dueDateOffset?: number }>;
}

export interface BuildModelOptions {
    /** Settings -> task standards. Supplies the user's own declared duration per task title. */
    taskStandards?: TaskStandardLike[];
}

export const buildExecutionModel = (opportunities: Opportunity[], options: BuildModelOptions = {}): ExecutionModel => {
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

    // --- [TA6] agenda accuracy: planned vs. reality -------------------------------------------
    // Compared per (task, day): a block says "this task, this day, this many hours"; the timer says
    // what really happened. Everything else in this section is derived from those two facts.
    const ratios: number[] = [];
    const ratiosBySection = new Map<ModelSection, number[]>();
    const blocksBySection = new Map<ModelSection, { planned: number; worked: number }>();
    const planToDone: number[] = [];
    const startDelay: number[] = [];
    let accPlannedHours = 0;
    let accLoggedHours = 0;
    let accBlocksPlanned = 0;
    let accBlocksWorked = 0;
    for (const task of allTasks) {
        const sectionKey = (task.processSection || UNASSIGNED_SECTION) as ModelSection;
        const pastTaskBlocks = (task.executionBlocks || []).filter(block => block.date && block.date < todayStr);
        if (!pastTaskBlocks.length) continue;

        // Hours logged per day on this task, so a day with several blocks is not counted twice.
        const loggedByDay = new Map<string, number>();
        for (const log of task.timeLogs || []) {
            const day = (log.start || '').slice(0, 10);
            if (!day) continue;
            loggedByDay.set(day, (loggedByDay.get(day) || 0) + (log.durationSeconds || 0) / 3600);
        }
        const plannedByDay = new Map<string, number>();
        for (const block of pastTaskBlocks) {
            const minutes = timeToMinutes(block.endTime) - timeToMinutes(block.startTime);
            if (!isFinite(minutes) || minutes <= 0) continue;
            plannedByDay.set(block.date, (plannedByDay.get(block.date) || 0) + minutes / 60);
        }

        const counters = blocksBySection.get(sectionKey) || { planned: 0, worked: 0 };
        for (const [day, planned] of plannedByDay.entries()) {
            const logged = loggedByDay.get(day) || 0;
            accBlocksPlanned++;
            counters.planned++;
            accPlannedHours += planned;
            accLoggedHours += logged;
            if (logged > 0) {
                accBlocksWorked++;
                counters.worked++;
                const ratio = logged / planned;
                ratios.push(ratio);
                ratiosBySection.set(sectionKey, [...(ratiosBySection.get(sectionKey) || []), ratio]);
            }
        }
        blocksBySection.set(sectionKey, counters);

        const firstPlanned = [...plannedByDay.keys()].sort()[0];
        const firstLogged = [...loggedByDay.keys()].sort()[0];
        if (firstPlanned && firstLogged) {
            const delay = daysBetween(firstPlanned, firstLogged);
            if (delay !== null) startDelay.push(delay);
        }
        const done = taskCompletionDay(task);
        if (firstPlanned && done && task.status === 'Done') {
            const span = daysBetween(firstPlanned, done);
            if (span !== null) planToDone.push(span);
        }
    }
    const agendaAccuracy: AgendaAccuracy = {
        blocksPlanned: accBlocksPlanned,
        blocksWorked: accBlocksWorked,
        blocksSkipped: accBlocksPlanned - accBlocksWorked,
        plannedHours: round1(accPlannedHours) ?? 0,
        loggedHours: round1(accLoggedHours) ?? 0,
        effortRatio: ratios.length ? Math.round((median(ratios) ?? 1) * 100) / 100 : null,
        medianPlanToDoneDays: round1(median(planToDone)),
        medianStartDelayDays: round1(median(startDelay)),
        bySection: [...blocksBySection.entries()]
            .map(([section, counters]) => ({
                section,
                blocksPlanned: counters.planned,
                blocksWorked: counters.worked,
                effortRatio: (ratiosBySection.get(section) || []).length
                    ? Math.round((median(ratiosBySection.get(section)!) ?? 1) * 100) / 100
                    : null,
            }))
            .sort((a, b) => b.blocksPlanned - a.blocksPlanned),
    };

    // --- [TA6] per-title medians (level 2 of the estimation hierarchy) --------------------------
    // Tendering repeats the same titles across opportunities ("Prepare CQA and Winning price"),
    // so the same title's own history beats the section median whenever it exists.
    const hoursByTitle = new Map<string, { display: string; values: number[] }>();
    for (const task of completed) {
        const hours = loggedHours(task);
        if (hours <= 0) continue;
        const key = normalizeTitle(task.title);
        if (!key) continue;
        const entry = hoursByTitle.get(key) || { display: task.title.trim(), values: [] };
        entry.values.push(hours);
        hoursByTitle.set(key, entry);
    }
    const hoursByTaskTitle = [...hoursByTitle.values()]
        .filter(entry => entry.values.length >= 2)
        .map(entry => ({ title: entry.display, samples: entry.values.length, medianHours: round1(median(entry.values)) ?? 0 }))
        .sort((a, b) => b.samples - a.samples)
        .slice(0, 12);

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

    // --- [TA6] duration in DAYS, for when the timer says nothing --------------------------------
    // The user's declared standard first: in a task standard the tasks are ordered and each carries
    // a dueDateOffset in days from the start, so the delta against the previous template is the
    // duration that template is expected to take.
    const standardDaysByTitle = new Map<string, number>();
    for (const standard of options.taskStandards || []) {
        const ordered = [...(standard.tasks || [])]
            .filter(template => template.title?.trim())
            .sort((a, b) => {
                const offsetDelta = (a.dueDateOffset ?? Number.MAX_SAFE_INTEGER) - (b.dueDateOffset ?? Number.MAX_SAFE_INTEGER);
                if (offsetDelta !== 0) return offsetDelta;
                return (a.order ?? 999999) - (b.order ?? 999999);
            });
        let previousOffset = 0;
        for (const template of ordered) {
            const offset = template.dueDateOffset;
            if (typeof offset !== 'number') continue;
            const span = Math.max(1, offset - previousOffset);
            previousOffset = offset;
            const key = normalizeTitle(template.title);
            if (!key) continue;
            // Several standards can define the same title; the longest declared span wins, because
            // under-promising a duration is what produces a plan that cannot hold.
            standardDaysByTitle.set(key, Math.max(standardDaysByTitle.get(key) ?? 0, span));
        }
    }

    // Measured elapsed time: from the completion of the previous task in the opportunity's own
    // order to the completion of this one. This is the only signal that includes the waiting.
    const elapsedByTitle = new Map<string, { display: string; elapsed: number[]; active: number[] }>();
    const allPaused: number[] = [];
    for (const opp of opportunities) {
        const done = (opp.tasks || [])
            .filter(task => task.status === 'Done' && taskCompletionDay(task))
            .sort((a, b) => {
                const day = taskCompletionDay(a)!.localeCompare(taskCompletionDay(b)!);
                if (day !== 0) return day;
                return (a.order ?? 999999) - (b.order ?? 999999);
            });
        for (let index = 0; index < done.length; index++) {
            const task = done[index];
            const finishedOn = taskCompletionDay(task)!;
            // The first completed task of an opportunity has no predecessor to measure from; its
            // span would be the age of the whole opportunity, which is a different question.
            const previousFinish = index > 0 ? taskCompletionDay(done[index - 1]) : null;
            if (!previousFinish) continue;
            const elapsed = daysBetween(previousFinish, finishedOn);
            if (elapsed === null || elapsed < 0 || elapsed > 180) continue; // a 6-month gap is a dormant file, not a duration
            const activeDays = new Set((task.timeLogs || [])
                .map(log => (log.start || '').slice(0, 10))
                .filter(Boolean)).size;
            allPaused.push(Math.max(0, elapsed - activeDays));
            const key = normalizeTitle(task.title);
            if (!key) continue;
            const entry = elapsedByTitle.get(key) || { display: task.title.trim(), elapsed: [], active: [] };
            entry.elapsed.push(elapsed);
            entry.active.push(activeDays);
            elapsedByTitle.set(key, entry);
        }
    }

    const durationTitleKeys = new Set([...elapsedByTitle.keys(), ...standardDaysByTitle.keys()]);
    const durationsByTitle: TitleDurationStats[] = [...durationTitleKeys]
        .map(key => {
            const measured = elapsedByTitle.get(key);
            const medianElapsedDays = measured ? round1(median(measured.elapsed)) : null;
            const medianActiveDays = measured ? round1(median(measured.active)) : null;
            return {
                title: measured?.display || key,
                samples: measured?.elapsed.length ?? 0,
                medianElapsedDays,
                medianActiveDays,
                medianPausedDays: medianElapsedDays !== null && medianActiveDays !== null
                    ? round1(Math.max(0, medianElapsedDays - medianActiveDays))
                    : null,
                standardDays: standardDaysByTitle.get(key) ?? null,
            };
        })
        // A title with neither a standard nor a sample carries no information.
        .filter(entry => entry.standardDays !== null || entry.samples > 0)
        .sort((a, b) => b.samples - a.samples || (b.standardDays ?? 0) - (a.standardDays ?? 0))
        .slice(0, 20);
    const medianPausedDays = round1(median(allPaused));

    const gaps: string[] = [];
    if (completed.length < 10) gaps.push(`Only ${completed.length} completed task(s) recorded — close tasks as you finish them so durations can be measured.`);
    if (!sections.some(s => s.section !== UNASSIGNED_SECTION)) gaps.push('No completed task has a Process Section — without it, estimates cannot be specialized per kind of work.');
    if (hoursByDay.size < 5) gaps.push(`Time was logged on only ${hoursByDay.size} day(s) — the timer is the most accurate source, but while it is empty the model falls back to your declared task standards and to the measured days between one task finishing and the next.`);
    if (!globalSlips.length) gaps.push('No completed task had a due date — set due dates so the model can learn how much they typically slip.');
    if (!areas.length) gaps.push('No external assignment has both a request and a delivery date — fill them so waiting time on other areas can be predicted.');
    if (planAdherence === null) gaps.push('No past scheduled block to compare against logged time — apply an agenda and work from it so plan adherence becomes measurable.');
    if (agendaAccuracy.effortRatio === null && agendaAccuracy.blocksPlanned > 0) gaps.push(`${agendaAccuracy.blocksPlanned} past block(s) were planned but none has logged time — the agenda cannot be compared against reality, so estimates stay uncorrected.`);

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
        agendaAccuracy,
        durationsByTitle,
        medianPausedDays,
        hoursByTaskTitle,
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
    // [TA6] Explicit estimation hierarchy, in the exact order the prompt states it, so the number
    // shown in the app and the number the assistant is told to compute are the same number.
    const fallbackHours = round1(median(model.sections.map(s => s.medianActiveHours).filter((v): v is number => v !== null))) ?? 4;
    const titleMatch = model.hoursByTaskTitle.find(entry => normalizeTitle(entry.title) === normalizeTitle(task.title));
    const estimateLevel = typeof task.userEstimateHours === 'number' && task.userEstimateHours > 0
        ? 'your own estimate'
        : titleMatch
            ? `median of ${titleMatch.samples} past task(s) with this same title`
            : stats
                ? `${sectionKey} section median`
                : 'global median across sections';
    const typicalHours = (typeof task.userEstimateHours === 'number' && task.userEstimateHours > 0)
        ? task.userEstimateHours
        : titleMatch?.medianHours ?? stats?.medianActiveHours ?? fallbackHours;
    const alreadyLogged = loggedHours(task);
    // [TA6] Correct the estimate by how much past agendas actually drifted. A planned hour that has
    // historically cost 1.4 real hours must not be sold as an hour again. Only a measured ratio is
    // applied, and never one the user set by hand.
    const sectionBias = model.agendaAccuracy.bySection.find(entry => entry.section === sectionKey)?.effortRatio;
    const rawBias = (typeof task.userEstimateHours === 'number' && task.userEstimateHours > 0)
        ? null
        : (sectionBias ?? model.agendaAccuracy.effortRatio);
    // Clamped: a handful of samples can produce an absurd ratio, and an estimate multiplied by 6
    // is no more honest than one divided by 6.
    const biasFactor = rawBias === null ? 1 : Math.min(3, Math.max(0.5, rawBias));
    const expectedHours = Math.max(0.5, round1(Math.max(0, typicalHours - alreadyLogged) * biasFactor) ?? 0.5);

    // Capacity: what the user can really give it per day. The focus policy's ceiling is an upper
    // bound; measured throughput is the honest number when it is lower.
    const capacityCandidates = [options.dailyCapacityHours, model.dailyThroughputHours].filter(
        (value): value is number => typeof value === 'number' && value > 0
    );
    const dailyCapacity = capacityCandidates.length ? Math.min(...capacityCandidates) : 4;

    // Buffer: this kind of work's own track record of slipping, not a flat safety margin.
    const bufferDays = Math.max(0, stats?.p80SlipDays ?? model.globalMedianSlipDays ?? 0);
    const workDays = expectedHours / dailyCapacity;

    // [TA6] When no hour was ever logged for this kind of work, hour arithmetic is theatre: it
    // always lands on the 0.5h floor and every task forecasts the same date. In that case the
    // duration measured in DAYS is the honest answer — the user's declared standard from Settings,
    // or the measured span from the previous task finishing to this one finishing, which is the
    // only number that already contains the waiting.
    const durationStats = model.durationsByTitle.find(entry => normalizeTitle(entry.title) === normalizeTitle(task.title));
    const hasHourEvidence = (stats?.medianActiveHours ?? 0) > 0
        || alreadyLogged > 0
        || (typeof task.userEstimateHours === 'number' && task.userEstimateHours > 0);
    const dayEstimate = durationStats
        ? (durationStats.standardDays ?? durationStats.medianElapsedDays)
        : null;
    const useDayEstimate = !hasHourEvidence && dayEstimate !== null;

    const expectedDays = useDayEstimate
        ? Math.ceil(dayEstimate! + bufferDays)
        : Math.ceil(workDays + bufferDays);
    const expectedFinish = addWorkingDays(todayStr, expectedDays);

    const willMissDueDate = !!task.dueDate && task.dueDate < expectedFinish;
    const sampleConfidence = stats ? Math.min(1, stats.samples / 8) : 0.3;
    const confidence = Math.round(model.confidence * sampleConfidence * 100) / 100;

    const basisParts = [
        useDayEstimate
            ? `${dayEstimate}d from ${durationStats?.standardDays !== null && durationStats?.standardDays !== undefined ? 'your task standard' : `${durationStats?.samples} measured span(s) between tasks`} (no hours ever logged for this work)`
            : `${expectedHours}h remaining at ${dailyCapacity}h/day`,
        `estimate from ${useDayEstimate ? 'task duration in days' : estimateLevel}`,
        biasFactor !== 1 ? `x${biasFactor} agenda deviation factor` : 'no measured agenda deviation',
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

    // [TA6] The deviation report the user asked for: not decoration, it is the correction factor the
    // assistant is required to multiply its estimates by, stated together with the evidence for it.
    const acc = model.agendaAccuracy;
    lines.push('AGENDA ACCURACY (how much past agendas deviated from what really happened):');
    if (acc.blocksPlanned === 0) {
        lines.push('- No past planned block exists yet, so there is no measured deviation. Treat every estimate below as unverified and say so.');
    } else {
        lines.push(`- Past planned blocks: ${acc.blocksPlanned}. Worked: ${acc.blocksWorked}. Never worked: ${acc.blocksSkipped} (${Math.round((acc.blocksSkipped / acc.blocksPlanned) * 100)}% of the agenda was not honoured).`);
        lines.push(`- Planned ${acc.plannedHours}h in total, really logged ${acc.loggedHours}h on those same task/day pairs.`);
        if (acc.effortRatio !== null) {
            lines.push(`- DEVIATION FACTOR: ${acc.effortRatio}. One planned hour has really cost ${acc.effortRatio}h, median. Multiply every effort estimate by this factor (or by the section factor below when it exists) before converting it into days. ${acc.effortRatio > 1 ? 'Planning at face value is optimistic and has failed before.' : 'Blocks have been sized larger than the work needed.'}`);
        } else {
            lines.push('- No past block has logged time against it, so no deviation factor can be measured. Do not pretend the estimates below are calibrated.');
        }
        if (acc.medianStartDelayDays !== null) lines.push(`- Median delay between the first day a task was planned and the first day it was really worked: ${acc.medianStartDelayDays} day(s).`);
        if (acc.medianPlanToDoneDays !== null) lines.push(`- Median days from the first planned day to real completion: ${acc.medianPlanToDoneDays}.`);
        const measured = acc.bySection.filter(entry => entry.effortRatio !== null);
        if (measured.length) {
            lines.push('- Deviation per process section - planned blocks | worked | factor:');
            measured.forEach(entry => lines.push(`  - ${entry.section}: ${entry.blocksPlanned} | ${entry.blocksWorked} | x${entry.effortRatio}`));
        }
    }
    if (model.hoursByTaskTitle.length) {
        lines.push('- Repeated task titles - samples | median real hours (use this before the section median when the title matches):');
        model.hoursByTaskTitle.forEach(entry => lines.push(`  - ${entry.title}: ${entry.samples} | ${entry.medianHours}h`));
    }

    // [TA6] The answer to "what does a task cost when I do not use the timer". Two sources, both
    // already in the database: the user's declared standard, and the measured calendar span from
    // the previous task finishing to this one finishing (which already contains the waiting).
    if (model.durationsByTitle.length) {
        lines.push('TASK DURATION IN DAYS (use this whenever the hour columns above say "?" for this kind of work):');
        lines.push('- Per task title - standard days declared by me | measured median elapsed days | of which really worked | typically idle:');
        model.durationsByTitle.forEach(entry => {
            lines.push(`  - ${entry.title}: ${entry.standardDays ?? '-'}d declared | ${entry.medianElapsedDays ?? '?'}d elapsed (${entry.samples} sample(s)) | ${entry.medianActiveDays ?? '?'}d worked | ${entry.medianPausedDays ?? '?'}d idle`);
        });
        lines.push('- "Elapsed" is measured from the day I finished the PREVIOUS task of that opportunity to the day I finished this one, so it already includes every pause and every wait. Never add a waiting buffer on top of an elapsed figure: that would count the same delay twice.');
        lines.push('- "Standard days" is my own declared expectation for that task, taken from my task standards. It OUTRANKS the measured median: when both exist and they disagree, use the standard and note the disagreement in ASSUMPTIONS.');
    }
    if (model.medianPausedDays !== null) {
        lines.push(`- Across every measured task, ${model.medianPausedDays} day(s) of each task's span had no work logged at all. Assume a task will sit idle about that long unless a fixed date forces otherwise, and prefer closing something already started over opening something new.`);
    }

    lines.push('HOW TO USE IT (mandatory arithmetic for every date you propose):');
    lines.push('0. Estimation hierarchy, in this order, and always state which level you used: (1) the task\'s own userEstimateHours when supplied; (2) the median of the same task title in the repeated-titles list above; (3) the section median minus hours already logged; (4) the global median across sections. Floor at 0.5h. If levels 2-4 all report "?" because no hour was ever logged for that kind of work, DO NOT fall back to the 0.5h floor — that is what makes every task forecast the same date. Switch to TASK DURATION IN DAYS below and reason in days instead, saying so explicitly.');
    lines.push('1. Effort = the value from step 0 minus hours already logged on that task, MULTIPLIED by the deviation factor above (the section factor when it exists, otherwise the global one). Skip the multiplication only when the estimate came from userEstimateHours - that number is the user\'s own commitment, not a historical average. Floor at 0.5h.');
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
