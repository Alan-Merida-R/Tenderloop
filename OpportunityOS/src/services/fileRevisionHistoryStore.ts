/**
 * The manual "file revision" log the user writes when creating a new revision of a
 * document (what changed and why). Legacy `contains` values remain in stored
 * records for backward compatibility but are no longer collected or displayed.
 *
 * STORAGE CHANGED — this used to be an IndexedDB database
 * (`TenderLoopFileRevisionHistory`) and therefore disappeared whenever the app was
 * opened in a different browser. The entries now live on the opportunity in the shared
 * JSON DB (see opportunityFolderStore.ts). The API is unchanged so existing call sites
 * keep working, and legacy IndexedDB rows are migrated in on first use.
 */

import type { FileRevisionRecord } from '../types';
import {
  addRevisionRecord,
  assignRevisionFamilyId,
  isFolderStoreReady,
  listAllRevisionHistory,
  listRevisionHistory,
  migrateLegacyFolderData,
  deleteRevisionRecord,
  updateRevisionRecord,
} from './opportunityFolderStore';

export type FileRevisionEntry = FileRevisionRecord;

const migrations = new Map<string, Promise<void>>();

const ensureMigrated = async (opportunityId: string): Promise<void> => {
  if (!isFolderStoreReady()) return;
  let pending = migrations.get(opportunityId);
  if (!pending) {
    pending = migrateLegacyFolderData(opportunityId).catch(err => {
      console.warn('File revision history migration failed', err);
      migrations.delete(opportunityId);
    });
    migrations.set(opportunityId, pending);
  }
  await pending;
};

export const saveFileRevisionEntry = async (
  entry: Omit<FileRevisionEntry, 'id' | 'createdAt'>,
): Promise<FileRevisionEntry> => {
  await ensureMigrated(entry.opportunityId);
  return addRevisionRecord(entry.opportunityId, entry);
};

export const getFileRevisionHistory = async (
  opportunityId: string,
  familyIdOrKey: string,
): Promise<FileRevisionEntry[]> => {
  await ensureMigrated(opportunityId);
  return listRevisionHistory(opportunityId, familyIdOrKey);
};

export const getAllFileRevisionHistory = async (
  opportunityId: string,
): Promise<FileRevisionEntry[]> => {
  await ensureMigrated(opportunityId);
  return listAllRevisionHistory(opportunityId);
};

export const assignFileRevisionFamilyId = async (
  opportunityId: string,
  legacyFamilyKey: string,
  familyId: string,
): Promise<void> => {
  await ensureMigrated(opportunityId);
  assignRevisionFamilyId(opportunityId, legacyFamilyKey, familyId);
};

export const updateFileRevisionEntry = async (
  opportunityId: string,
  entryId: string,
  updates: Pick<FileRevisionEntry, 'changes' | 'reason'>,
): Promise<void> => {
  await ensureMigrated(opportunityId);
  updateRevisionRecord(opportunityId, entryId, updates);
};

export const deleteFileRevisionEntry = async (
  opportunityId: string,
  entryId: string,
): Promise<void> => {
  await ensureMigrated(opportunityId);
  deleteRevisionRecord(opportunityId, entryId);
};
