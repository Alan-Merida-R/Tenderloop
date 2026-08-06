import { DatabaseSchema, ManagerReportSyncSettings } from '../types';
import { buildManagerReport, managerReportFilename } from './managerReport';

const API_BASE = 'http://127.0.0.1:3099/api';

/**
 * "Alan Merida Rodriguez" -> "Alan Me" (first name + first 2 letters of the second token).
 * Returns null when the name cannot produce a stable id — Settings uses that to block enabling.
 */
export const deriveReporterId = (fullName: string): string | null => {
  const tokens = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const last = tokens[1];
  if (last.length < 2) return null;
  return `${tokens[0]} ${last.slice(0, 2)}`;
};

export const reportFilename = (reporterId: string): string => managerReportFilename(reporterId);

export const localToday = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export type DailyExportResult =
  | { status: 'written'; day: string; exportedAt: string; path?: string }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

export const writeManagerReportToFolder = async (
  db: DatabaseSchema,
  sync: Pick<ManagerReportSyncSettings, 'folderPath' | 'reporterId'>
): Promise<DailyExportResult> => {
  const report = buildManagerReport(db, sync.reporterId);
  try {
    const response = await fetch(`${API_BASE}/os/write-manager-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dirPath: sync.folderPath,
        filename: reportFilename(sync.reporterId),
        content: JSON.stringify(report, null, 2),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: 'failed', error: payload?.error || `Export failed (HTTP ${response.status})` };
    }
    return { status: 'written', day: localToday(), exportedAt: report.exportedAt, path: payload?.path };
  } catch (error: any) {
    return { status: 'failed', error: error?.message || 'The local helper is not running.' };
  }
};

/** Once-per-day rule: exports only when today differs from the stamped lastExportDay (or when forced). */
export const runDailyExportIfDue = async (
  db: DatabaseSchema,
  sync: ManagerReportSyncSettings,
  options?: { force?: boolean }
): Promise<DailyExportResult> => {
  if (!sync.enabled || !sync.folderPath || !sync.reporterId) return { status: 'skipped' };
  if (!options?.force && sync.lastExportDay === localToday()) return { status: 'skipped' };
  return writeManagerReportToFolder(db, sync);
};

export const checkFolderPath = async (folderPath: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE}/os/check-path?path=${encodeURIComponent(folderPath)}`);
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.exists === true && payload?.kind === 'directory';
  } catch {
    return false;
  }
};
