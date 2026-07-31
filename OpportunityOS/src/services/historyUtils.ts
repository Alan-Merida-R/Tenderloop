import { HistoryEntry } from '../types';

const dateTime = (value?: string) => {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

/** Newest event first; creation time resolves multiple events on the same history date. */
export const sortHistoryEntriesNewestFirst = (history: HistoryEntry[]): HistoryEntry[] =>
  history
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const byDate = dateTime(b.event.date) - dateTime(a.event.date);
      if (byDate) return byDate;
      const byCreation = dateTime(b.event.createdAt) - dateTime(a.event.createdAt);
      if (byCreation) return byCreation;
      return b.index - a.index;
    })
    .map(({ event }) => event);

export const getLatestHistoryEntry = (history?: HistoryEntry[]): HistoryEntry | null =>
  sortHistoryEntriesNewestFirst((history || []).filter(event => event.content?.trim()))[0] || null;
