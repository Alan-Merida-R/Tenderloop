import { Opportunity, Task } from '../../types';

/** Stable hash → 0..359 hue for a given opportunity id. */
const hashToHue = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h) % 360;
};

/**
 * Pick a stable hex color per opportunity.
 * Priority: first label color > hash of id → HSL → hex.
 * Opportunity has no persisted color field in the schema.
 */
export const getOpportunityColor = (opp: Opportunity): string => {
    const labelColor = opp.labels?.[0]?.color;
    if (labelColor && /^#[0-9a-f]{6}$/i.test(labelColor)) return labelColor;

    const hue = hashToHue(opp.id || opp.alias || opp.title || 'x');
    return hslToHex(hue, 55, 50);
};

const hslToHex = (h: number, s: number, l: number): string => {
    s /= 100; l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
};

/** Distinct, deterministic agenda palette. The golden-angle step keeps adjacent
 * opportunities visually separated even when the list grows. */
export const getOpportunityPaletteColor = (index: number): string =>
    hslToHex((index * 137.508 + 212) % 360, 62, index % 2 === 0 ? 43 : 52);

export const isTaskActive = (task: Task): boolean => {
    return task.status !== 'Done' && task.status !== 'Canceled';
};

/**
 * Whether an opportunity should appear in the Schedule at all.
 * Closed opportunities (process status Completed/Canceled, or a terminal
 * Won/Lost/Canceled status) are excluded so their leftover open tasks don't
 * keep showing up as schedulable once the opportunity is finished.
 */
export const isOpportunitySchedulable = (opp: Opportunity): boolean => {
    if (opp.detailedStatus === 'Completed' || opp.detailedStatus === 'Canceled') return false;
    if (opp.statusLabel === 'Won' || opp.statusLabel === 'Lost' || opp.statusLabel === 'Canceled') return false;
    return true;
};

export interface ScheduleFilters {
    oppIds: string[];
    statuses: string[];
    priorities: string[];
    owners: string[];
}

export const EMPTY_FILTERS: ScheduleFilters = {
    oppIds: [],
    statuses: [],
    priorities: [],
    owners: [],
};

export const taskMatchesFilters = (
    task: Task,
    oppId: string,
    f: ScheduleFilters
): boolean => {
    if (f.oppIds.length && !f.oppIds.includes(oppId)) return false;
    if (f.statuses.length && !f.statuses.includes(task.status)) return false;
    if (f.priorities.length && !f.priorities.includes(task.priority || 'Medium')) return false;
    if (f.owners.length && !f.owners.includes(task.owner)) return false;
    return true;
};
