import { Task } from '../types';

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

/**
 * Assigns an order to any task missing one, sequentially continuing from the highest existing order.
 */
export function assignMissingOrders(tasks: Task[]): Task[] {
    const existingOrders = tasks.filter(t => t.order != null).map(t => t.order as number);
    let nextOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 1;
    
    return tasks.map(t => {
        if (t.order == null) {
            return { ...t, order: nextOrder++ };
        }
        return t;
    });
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
