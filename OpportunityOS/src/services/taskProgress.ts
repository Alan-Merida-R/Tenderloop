import type { Task } from '../types';

export interface WeightedTaskProgress {
  /** Progress percentage rounded to one decimal place. */
  percent: number;
  /** Tasks that count as fully complete regardless of their subtasks. */
  terminalTasks: number;
  totalTasks: number;
  sectionCount: number;
}

const UNCLASSIFIED_SECTION = '__unclassified__';

/**
 * Returns the completed share of a task (0..1).
 *
 * Done and Canceled always contribute their complete task weight. Pending has
 * no status credit. Every other status contributes half of the task weight.
 * When subtasks exist, their completion ratio can raise that status credit,
 * without counting the same work twice.
 */
export const taskCompletionShare = (task: Task): number => {
  if (task.status === 'Done' || task.status === 'Canceled') return 1;

  const statusShare = task.status === 'Pending' ? 0 : 0.5;
  const subtasks = task.subtasks || [];
  if (subtasks.length === 0) return statusShare;

  const subtaskShare = subtasks.filter(subtask => subtask.completed).length / subtasks.length;
  return Math.max(statusShare, subtaskShare);
};

/**
 * Calculates hierarchical progress:
 * 1. Every represented Process Section has the same weight.
 * 2. Tasks divide their section's weight equally.
 * 3. Subtasks divide their task's weight equally.
 *
 * Tasks without a Process Section are kept together in an unclassified section
 * so legacy work is never omitted from the total.
 */
export const calculateWeightedTaskProgress = (tasks: Task[] = []): WeightedTaskProgress => {
  if (tasks.length === 0) {
    return { percent: 0, terminalTasks: 0, totalTasks: 0, sectionCount: 0 };
  }

  const tasksBySection = new Map<string, Task[]>();
  tasks.forEach(task => {
    const section = task.processSection?.trim() || UNCLASSIFIED_SECTION;
    const sectionTasks = tasksBySection.get(section) || [];
    sectionTasks.push(task);
    tasksBySection.set(section, sectionTasks);
  });

  const sectionProgress = Array.from(tasksBySection.values()).map(sectionTasks =>
    sectionTasks.reduce((sum, task) => sum + taskCompletionShare(task), 0) / sectionTasks.length
  );
  const rawPercent = (sectionProgress.reduce((sum, progress) => sum + progress, 0) / sectionProgress.length) * 100;

  return {
    percent: Math.round(rawPercent * 10) / 10,
    terminalTasks: tasks.filter(task => task.status === 'Done' || task.status === 'Canceled').length,
    totalTasks: tasks.length,
    sectionCount: tasksBySection.size,
  };
};
