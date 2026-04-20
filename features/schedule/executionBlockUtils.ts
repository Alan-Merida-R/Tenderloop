import { ExecutionBlock, Task } from '../../types';

export const SNAP_MINUTES = 15;
export const DEFAULT_BLOCK_MINUTES = 60;
export const MIN_BLOCK_MINUTES = 15;

/**
 * Convert "HH:mm" → minutes since midnight. Returns NaN if malformed.
 */
export const timeToMinutes = (hhmm: string): number => {
    if (!hhmm) return NaN;
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return NaN;
    return h * 60 + m;
};

/**
 * Convert minutes since midnight → "HH:mm". Clamps to [0, 1439].
 */
export const minutesToTime = (mins: number): string => {
    const clamped = Math.max(0, Math.min(1439, Math.round(mins)));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Round minutes to nearest SNAP_MINUTES step.
 */
export const snapMinutes = (mins: number, snap = SNAP_MINUTES): number => {
    return Math.round(mins / snap) * snap;
};

export const getBlockDurationMinutes = (block: ExecutionBlock): number => {
    const s = timeToMinutes(block.startTime);
    const e = timeToMinutes(block.endTime);
    if (isNaN(s) || isNaN(e)) return 0;
    return Math.max(0, e - s);
};

/**
 * Create a new block with validated times snapped to grid.
 * If endTime is not provided, defaults to startTime + DEFAULT_BLOCK_MINUTES.
 */
export const createBlock = (
    date: string,
    startTime: string,
    endTime?: string
): ExecutionBlock => {
    const start = snapMinutes(timeToMinutes(startTime));
    const end = endTime
        ? snapMinutes(timeToMinutes(endTime))
        : start + DEFAULT_BLOCK_MINUTES;
    const finalEnd = Math.max(start + MIN_BLOCK_MINUTES, end);
    return {
        id: crypto.randomUUID(),
        date,
        startTime: minutesToTime(start),
        endTime: minutesToTime(finalEnd),
        createdAt: new Date().toISOString(),
    };
};

/**
 * Two blocks overlap if they're on the same date and their time intervals overlap.
 * Used only for visual warnings — overlaps are allowed.
 */
export const doBlocksOverlap = (a: ExecutionBlock, b: ExecutionBlock): boolean => {
    if (a.date !== b.date) return false;
    const as = timeToMinutes(a.startTime);
    const ae = timeToMinutes(a.endTime);
    const bs = timeToMinutes(b.startTime);
    const be = timeToMinutes(b.endTime);
    return as < be && bs < ae;
};

/**
 * Warning check: is the block scheduled after the task's due date?
 * Compares by calendar date only (times ignored).
 */
export const isBlockAfterDueDate = (block: ExecutionBlock, dueDate: string): boolean => {
    if (!dueDate || !block.date) return false;
    return block.date > dueDate;
};

/**
 * Immutably add a block to a task.
 */
export const addBlockToTask = (task: Task, block: ExecutionBlock): Task => {
    return { ...task, executionBlocks: [...(task.executionBlocks || []), block] };
};

/**
 * Immutably update a block inside a task.
 */
export const updateBlockInTask = (
    task: Task,
    blockId: string,
    updates: Partial<Omit<ExecutionBlock, 'id' | 'createdAt'>>
): Task => {
    const existing = task.executionBlocks || [];
    return {
        ...task,
        executionBlocks: existing.map(b => (b.id === blockId ? { ...b, ...updates } : b)),
    };
};

/**
 * Immutably remove a block from a task.
 */
export const removeBlockFromTask = (task: Task, blockId: string): Task => {
    return {
        ...task,
        executionBlocks: (task.executionBlocks || []).filter(b => b.id !== blockId),
    };
};

export const isTaskScheduled = (task: Task): boolean => {
    return (task.executionBlocks?.length ?? 0) > 0;
};

/**
 * Parse "#RRGGBB" or CSS color names into [r,g,b] (0-255). Falls back to a neutral gray.
 */
const parseHexColor = (hex: string): [number, number, number] => {
    const m = /^#?([a-f\d]{6})$/i.exec((hex || '').trim());
    if (!m) return [156, 163, 175]; // gray-400 fallback
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Generate a pastel shade of the opportunity color for calendar blocks.
 * Returns an object with background (light) and border (darker) CSS colors.
 */
export const getPastelBlockStyle = (baseColor: string): { bg: string; border: string; text: string } => {
    const [r, g, b] = parseHexColor(baseColor);
    // Blend toward white for pastel background
    const blend = (c: number, t = 0.72) => Math.round(c + (255 - c) * t);
    const bg = `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
    const border = `rgb(${Math.round(r * 0.85)}, ${Math.round(g * 0.85)}, ${Math.round(b * 0.85)})`;
    // Text: darker shade of the base for contrast
    const text = `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)})`;
    return { bg, border, text };
};

/**
 * Format a block as "09:00 – 10:30" for UI chips.
 */
export const formatBlockTimeRange = (block: ExecutionBlock): string => {
    return `${block.startTime} – ${block.endTime}`;
};

/**
 * Sort blocks chronologically.
 */
export const sortBlocks = (blocks: ExecutionBlock[]): ExecutionBlock[] => {
    return [...blocks].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0;
    });
};
