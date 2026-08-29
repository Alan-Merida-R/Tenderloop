import { Task } from '../types';
import { PROCESS_SECTIONS, ProcessSection } from './processSections';

/**
 * Keeps the system-managed assignment subtasks aligned with the selected
 * participants and the dates produced by assignment status transitions.
 * User-created subtasks are preserved untouched.
 */
export function syncAssignmentSubtasks(task: Task): Task {
    const manualSubtasks = (task.subtasks || []).filter(subtask => !subtask.assignmentPhase);
    if (!task.isAssignment) {
        return { ...task, subtasks: manualSubtasks };
    }

    const existingExecution = (task.subtasks || []).find(subtask => subtask.assignmentPhase === 'execution');
    const existingApproval = (task.subtasks || []).find(subtask => subtask.assignmentPhase === 'approval');
    const hasExecution = (task.responsibleTeamMemberIds || []).length > 0 || !!task.responsible?.trim();
    const hasApproval = (task.approverTeamMemberIds || []).length > 0;
    const automatic: Task['subtasks'] = [];

    if (hasExecution) {
        automatic.push({
            id: existingExecution?.id || crypto.randomUUID(),
            title: 'Execution',
            completed: !!task.responsibleDeliveredDate || task.status === 'Approval' || task.status === 'Done',
            assignmentPhase: 'execution' as const,
        });
    }
    if (hasApproval) {
        automatic.push({
            id: existingApproval?.id || crypto.randomUUID(),
            title: 'Approval',
            completed: !!task.approvalDeliveredDate || task.status === 'Done',
            assignmentPhase: 'approval' as const,
        });
    }

    return { ...task, subtasks: [...automatic, ...manualSubtasks] };
}

/**
 * Single source of truth for computing the "Next Step" task of an opportunity.
 * Rules:
 *  1. Exclude tasks with status 'Done' or 'Canceled'
 *  2. Sort by `order` ascending (null → 999999)
 *  3. Tie-break by `dueDate` ascending (task with date wins over task without date)
 *  4. Return the first candidate, or undefined if none
 */
export function getNextTask(tasks: Task[]): Task | undefined {
    return [...tasks]
        .filter(t => !['Done', 'Canceled'].includes(t.status))
        .sort((a, b) => {
            const ao = a.order ?? 999999;
            const bo = b.order ?? 999999;
            if (ao !== bo) return ao - bo;
            // Tie-break: task with a date wins (comes first)
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return 0;
        })[0];
}

/** Normalize task statuses found in databases created by older UI versions. */
export function normalizeTaskStatus(status?: string): Task['status'] {
    const normalized = (status || '').trim().toLowerCase();
    const legacy: Record<string, Task['status']> = {
        'missing information': 'Missing Info',
        'missing info': 'Missing Info',
        'falta informacion': 'Missing Info',
        'falta información': 'Missing Info',
        'waiting': 'Missing Info',
        'approval': 'Approval',
        'in approval': 'Approval',
        'changes requested': 'Changes Requested / Rework',
        'changes requested / rework': 'Changes Requested / Rework',
        'rework': 'Changes Requested / Rework',
        'cambios solicitados': 'Changes Requested / Rework',
        'en aprobacion': 'Approval',
        'en aprobación': 'Approval',
        'completada': 'Done',
        'cancelada': 'Canceled',
    };
    return legacy[normalized] || (status as Task['status']) || 'Pending';
}

/**
 * Assigns an order to any task missing one and strictly RE-INDEXES all tasks from 1 to N, 
 * eliminating duplicates or gaps.
 */
export function assignMissingOrders(tasks: Task[]): Task[] {
    let nextAvailable = tasks.filter(t => t.order != null).reduce((max, t) => Math.max(max, t.order!), 0) + 1;
    let mapped = tasks.map(t => ({
        ...t,
        tempOrder: t.order ?? nextAvailable++
    }));

    mapped.sort((a, b) => a.tempOrder - b.tempOrder);

    return mapped.map((t, idx) => {
        const { tempOrder, ...rest } = t;
        return { ...rest, order: idx + 1 } as Task;
    });
}

/**
 * Reorders a task and strictly re-indexes all tasks from 1 to N, so there are no duplicates.
 */
export function reorderTaskStrict(tasks: Task[], targetTaskId: string, newPosition: number): Task[] {
    const sorted = [...tasks].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    const targetTask = sorted.find(t => t.id === targetTaskId);
    if (!targetTask) return tasks;

    const others = sorted.filter(t => t.id !== targetTaskId);
    
    // Insert at newPosition (1-indexed)
    const posIndex = Math.max(0, newPosition - 1);
    others.splice(posIndex, 0, targetTask);

    // Reindex
    return others.map((t, idx) => ({ ...t, order: idx + 1 }));
}
/** Helper to rank Opportunity Status */
export function getOppStatusWeight(status?: string): number {
    if (!status) return 99;
    const s = status.toLowerCase();
    if (s === 'in progress') return 1;
    if (s === 'on hold') return 2;
    if (s === 'submitted') return 3;
    if (s === 'won') return 4;
    if (s === 'lost') return 5;
    if (s === 'canceled' || s === 'cancelled') return 6;
    return 99;
}

/**
 * Unified global compare function for Tasks and Tracker items.
 * Rules:
 * 1) Opp Status: In Progress > On Hold > Submitted/Won/Lost
 * 2) Date closest (ascending)
 * 3) Standard Order (task.order)
 * 4) Priority Rank (opp.priorityOrder 1-N)
 * 5) Task ID / Title fallback
 */
export function getTaskPriorityWeight(priority?: string): number {
    if (!priority) return 2; // Default Medium
    const p = priority.toLowerCase();
    if (p === 'low') return 3;
    if (p === 'high') return 1;
    return 2; // Medium
}

export function compareTasksGlobal(
    a: { task: Partial<Task>; oppStatus?: string; oppPriorityRank?: number | null },
    b: { task: Partial<Task>; oppStatus?: string; oppPriorityRank?: number | null }
): number {
    // 1. Opportunity Status
    const weightA = getOppStatusWeight(a.oppStatus);
    const weightB = getOppStatusWeight(b.oppStatus);
    if (weightA !== weightB) return weightA - weightB;

    // 2. Due Date
    const d1 = a.task.dueDate;
    const d2 = b.task.dueDate;
    if (d1 && d2) {
        if (d1 !== d2) return d1.localeCompare(d2);
    } else if (d1) {
        return -1;
    } else if (d2) {
        return 1;
    }

    // 3. Standard Order (task.order)
    const o1 = a.task.order ?? 999999;
    const o2 = b.task.order ?? 999999;
    if (o1 !== o2) return o1 - o2;

    // 4. Task Priority (High = 1, Medium = 2, Low = 3)
    const taskPA = getTaskPriorityWeight(a.task.priority);
    const taskPB = getTaskPriorityWeight(b.task.priority);
    if (taskPA !== taskPB) return taskPA - taskPB;

    // 5. Opp Priority Rank (1-N)
    const p1 = a.oppPriorityRank ?? 999;
    const p2 = b.oppPriorityRank ?? 999;
    if (p1 !== p2) return p1 - p2;

    // Default fallback
    return (a.task.title || '').localeCompare(b.task.title || '');
}

/**
 * Places newly created tasks where they belong in the plan instead of appending them to the end.
 *
 * A task proposed by the Quick Organizer is almost never the last thing to do — "chase the missing
 * BOM" belongs next to the costing, not after submission. Position is decided from the process
 * section first (the canonical PROCESS_SECTIONS order is the workflow order), and from the due date
 * inside that section. A task with no section falls back to due date alone, and only a task with
 * neither lands at the end.
 *
 * Every `order` is renumbered afterwards so the sequence stays contiguous; relative order of the
 * existing tasks is preserved.
 */
export function insertTasksInPlan(existing: Task[], created: Task[]): Task[] {
    if (!created.length) return existing;

    const sectionRank = (task: Task): number => {
        const index = PROCESS_SECTIONS.indexOf(task.processSection as ProcessSection);
        return index >= 0 ? index : -1;
    };

    const plan = [...existing].sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));

    for (const task of created) {
        const rank = sectionRank(task);
        let insertAt: number;

        if (rank >= 0) {
            // Last task of the same section wins; otherwise sit after the last earlier section, so a
            // task for a section nobody has started yet still lands before the later work.
            const sameSection = plan.map((item, index) => ({ item, index })).filter(({ item }) => sectionRank(item) === rank);
            if (sameSection.length) {
                // Inside the section, respect the due date when both tasks have one.
                const laterDue = task.dueDate
                    ? sameSection.find(({ item }) => !!item.dueDate && item.dueDate > task.dueDate)
                    : undefined;
                insertAt = laterDue ? laterDue.index : sameSection[sameSection.length - 1].index + 1;
            } else {
                const earlier = plan.map((item, index) => ({ item, index })).filter(({ item }) => {
                    const itemRank = sectionRank(item);
                    return itemRank >= 0 && itemRank < rank;
                });
                insertAt = earlier.length ? earlier[earlier.length - 1].index + 1 : 0;
            }
        } else if (task.dueDate) {
            const laterDue = plan.findIndex(item => !!item.dueDate && item.dueDate > task.dueDate!);
            insertAt = laterDue >= 0 ? laterDue : plan.length;
        } else {
            insertAt = plan.length;
        }

        plan.splice(insertAt, 0, task);
    }

    return plan.map((task, index) => ({ ...task, order: index + 1 }));
}
