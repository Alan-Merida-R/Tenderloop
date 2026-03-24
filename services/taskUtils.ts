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
