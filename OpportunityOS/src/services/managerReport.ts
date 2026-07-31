import { DatabaseSchema, Opportunity } from '../types';

export const MANAGER_REPORT_SCHEMA_VERSION = 1;

export interface ManagerReport {
  schemaVersion: number;
  kind: 'opportunityos-manager-report';
  tender: string;
  exportedAt: string;
  source: { app: 'OpportunityOS'; databaseUpdatedAt?: string; opportunityCount: number };
  opportunities: Opportunity[];
}

/** Manager Tool is deliberately read-only. Folder handles, local paths and file references never leave OpportunityOS. */
const withoutFolders = (opportunity: Opportunity): Opportunity => {
  const { folderLinked: _folderLinked, folderPaths: _folderPaths, ...safe } = opportunity;
  const commercial = safe.commercial ? {
    ...safe.commercial,
    quickRefs: (safe.commercial.quickRefs || []).filter(ref => ref.type !== 'file'),
  } : safe.commercial;
  const links = Array.isArray(safe.links)
    ? safe.links.filter(link => link.type !== 'link' || !/folder/i.test(link.label || ''))
    : Object.fromEntries(Object.entries(safe.links || {}).filter(([key]) => !/folder/i.test(key)));
  return { ...safe, commercial, links } as Opportunity;
};

export const buildManagerReport = (db: DatabaseSchema, tenderName?: string): ManagerReport => ({
  schemaVersion: MANAGER_REPORT_SCHEMA_VERSION,
  kind: 'opportunityos-manager-report',
  tender: tenderName?.trim() || 'Unnamed tender',
  exportedAt: new Date().toISOString(),
  source: {
    app: 'OpportunityOS',
    databaseUpdatedAt: db.meta?.lastUpdated,
    opportunityCount: db.opportunities.length,
  },
  opportunities: db.opportunities.map(withoutFolders),
});

export const downloadManagerReport = async (report: ManagerReport): Promise<void> => {
  const safeTender = report.tender.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'tender';
  const filename = `${safeTender}_manager-report.json`;
  const content = JSON.stringify(report, null, 2);
  // Chromium gives the tender a normal Save dialog; no folder permission is retained or requested.
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Manager Tool report', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
    }
  }
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
