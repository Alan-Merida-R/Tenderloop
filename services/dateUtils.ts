
export const getLocalMidnight = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const isBusinessDay = (date: Date, holidays: string[] = []): boolean => {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // 0=Sun, 6=Sat
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const iso = `${y}-${m}-${d}`;
  
  if (holidays.includes(iso)) return false;
  return true;
};

/**
 * Counts business days between start (exclusive) and end (inclusive).
 * If start > end, returns negative count (counting backwards).
 */
export const countBusinessDays = (startStr: string, endStr: string, holidays: string[] = []): number => {
  const start = getLocalMidnight(startStr);
  const end = getLocalMidnight(endStr);
  
  if (start.getTime() === end.getTime()) return 0;

  const isForward = end > start;
  let count = 0;
  const cur = new Date(start);

  // If calculating forward: start+1 to end
  // If calculating backward: start-1 to end
  
  while (isForward ? cur < end : cur > end) {
    cur.setDate(cur.getDate() + (isForward ? 1 : -1));
    if (isBusinessDay(cur, holidays)) {
      count++;
    }
  }
  
  return isForward ? count : -count;
};

/**
 * Counts calendar days between two ISO dates.
 */
export const countCalendarDays = (startStr: string, endStr: string): number => {
  const start = getLocalMidnight(startStr);
  const end = getLocalMidnight(endStr);
  const diffTime = end.getTime() - start.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
