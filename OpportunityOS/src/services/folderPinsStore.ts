/**
 * "Quick access" pins for the opportunity folder — files and folders the user pins for
 * fast access, keyed per folder storage key (`opportunityId` or `opportunityId::revision`).
 *
 * STORAGE CHANGED — these used to live in IndexedDB (`TenderLoopFolderPins`) and so were
 * lost whenever the user opened the app in another browser. They now live on the
 * opportunity in the shared JSON DB (see opportunityFolderStore.ts).
 *
 * Pins store a path RELATIVE to the folder root, which is why moving or re-linking the
 * folder never invalidates them: only the root path changes, the structure underneath
 * does not.
 */

import type { FolderPinRecord } from '../types';
import {
  addPinRecord,
  listPins,
  migrateLegacyFolderData,
  isFolderStoreReady,
  removePinRecord,
  movePinRecord,
} from './opportunityFolderStore';

export type FolderPin = FolderPinRecord;

/**
 * Storage keys embed the opportunity id (`oppId` or `oppId::revision`), so the owning
 * opportunity can be recovered from the key alone — that keeps this module's original
 * single-argument signatures intact for every existing call site.
 */
const oppIdFromStorageKey = (storageKey: string): string => storageKey.split('::')[0];

const migrations = new Map<string, Promise<void>>();

const ensureMigrated = async (opportunityId: string): Promise<void> => {
  if (!isFolderStoreReady()) return;
  let pending = migrations.get(opportunityId);
  if (!pending) {
    pending = migrateLegacyFolderData(opportunityId).catch(err => {
      console.warn('Folder pin migration failed', err);
      migrations.delete(opportunityId);
    });
    migrations.set(opportunityId, pending);
  }
  await pending;
};

export const getPins = async (storageKey: string): Promise<FolderPin[]> => {
  const opportunityId = oppIdFromStorageKey(storageKey);
  await ensureMigrated(opportunityId);
  return listPins(opportunityId, storageKey);
};

export const addPin = async (storageKey: string, pin: Omit<FolderPin, 'addedAt'>): Promise<FolderPin[]> => {
  const opportunityId = oppIdFromStorageKey(storageKey);
  await ensureMigrated(opportunityId);
  addPinRecord(opportunityId, storageKey, pin);
  return listPins(opportunityId, storageKey);
};

export const removePin = async (storageKey: string, key: string): Promise<FolderPin[]> => {
  const opportunityId = oppIdFromStorageKey(storageKey);
  await ensureMigrated(opportunityId);
  removePinRecord(opportunityId, storageKey, key);
  return listPins(opportunityId, storageKey);
};

export const movePin = async (storageKey: string, key: string, direction: -1 | 1): Promise<FolderPin[]> => {
  const opportunityId = oppIdFromStorageKey(storageKey);
  await ensureMigrated(opportunityId);
  movePinRecord(opportunityId, storageKey, key, direction);
  return listPins(opportunityId, storageKey);
};

export const isPinned = (pins: FolderPin[], key: string): boolean => pins.some(p => p.key === key);
