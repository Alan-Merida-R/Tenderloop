/**
 * Document metadata for files inside the opportunity folder: classification, alias,
 * internal notes and the task/note links the user created.
 *
 * STORAGE CHANGED — this module used to own an IndexedDB database (`TenderLoopDocMeta`).
 * IndexedDB is per browser profile, so every link the user made vanished when they
 * opened the app in a different browser. The records now live on the opportunity in the
 * shared JSON DB (see opportunityFolderStore.ts); this module keeps its original async
 * API so every existing call site works unchanged, and transparently migrates the legacy
 * IndexedDB rows the first time an opportunity is touched.
 */

import type { FolderDocRecord } from '../types';
import {
  getDoc,
  listDocs,
  listDocsForNote,
  listDocsForTask,
  isFolderStoreReady,
  migrateLegacyFolderData,
  upsertDoc,
} from './opportunityFolderStore';

export interface DocMeta {
  docType: string;
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  revisionFamilyId?: string;
  alias?: string;
  editableStatus?: string;
  internalNotes?: string;
  updatedAt: string;
  /** ISO timestamp since when the file is missing from disk. Absent/null = present. */
  missingSince?: string | null;
}

const toMeta = (doc: FolderDocRecord): DocMeta => ({
  docType: doc.docType ?? '',
  linkedTaskIds: doc.linkedTaskIds ?? [],
  linkedNoteIds: doc.linkedNoteIds ?? [],
  revisionFamilyId: doc.revisionFamilyId ?? '',
  alias: doc.alias ?? '',
  editableStatus: doc.editableStatus ?? 'Not started',
  internalNotes: doc.internalNotes ?? '',
  updatedAt: doc.updatedAt,
  missingSince: doc.missingSince ?? null,
});

/**
 * The migration is idempotent and guarded inside the store, but it is async and can be
 * triggered from several components at once on first render. Collapsing concurrent calls
 * per opportunity keeps it to a single IndexedDB sweep.
 */
const migrations = new Map<string, Promise<void>>();

const ensureMigrated = async (opportunityId: string): Promise<void> => {
  if (!isFolderStoreReady()) return;
  let pending = migrations.get(opportunityId);
  if (!pending) {
    pending = migrateLegacyFolderData(opportunityId).catch(err => {
      // A failed migration must never break the UI — the legacy rows stay in
      // IndexedDB and the next call retries.
      console.warn('Folder metadata migration failed', err);
      migrations.delete(opportunityId);
    });
    migrations.set(opportunityId, pending);
  }
  await pending;
};

export const getMeta = async (opportunityId: string, fileKey: string): Promise<DocMeta | null> => {
  await ensureMigrated(opportunityId);
  const doc = getDoc(opportunityId, fileKey);
  return doc ? toMeta(doc) : null;
};

export const saveMeta = async (opportunityId: string, fileKey: string, meta: Partial<DocMeta>): Promise<void> => {
  await ensureMigrated(opportunityId);
  const patch: Partial<FolderDocRecord> = {};
  if (meta.docType !== undefined) patch.docType = meta.docType;
  if (meta.linkedTaskIds !== undefined) patch.linkedTaskIds = meta.linkedTaskIds;
  if (meta.linkedNoteIds !== undefined) patch.linkedNoteIds = meta.linkedNoteIds;
  if (meta.revisionFamilyId !== undefined) patch.revisionFamilyId = meta.revisionFamilyId;
  if (meta.alias !== undefined) patch.alias = meta.alias;
  if (meta.editableStatus !== undefined) patch.editableStatus = meta.editableStatus;
  if (meta.internalNotes !== undefined) patch.internalNotes = meta.internalNotes;
  upsertDoc(opportunityId, fileKey, patch);
};

export const listLinkedForTask = async (
  opportunityId: string,
  taskId: string,
): Promise<{ fileKey: string; meta: DocMeta }[]> => {
  await ensureMigrated(opportunityId);
  return listDocsForTask(opportunityId, taskId).map(doc => ({ fileKey: doc.fileKey, meta: toMeta(doc) }));
};

export const listLinkedForNote = async (
  opportunityId: string,
  noteId: string,
): Promise<{ fileKey: string; meta: DocMeta }[]> => {
  await ensureMigrated(opportunityId);
  return listDocsForNote(opportunityId, noteId).map(doc => ({ fileKey: doc.fileKey, meta: toMeta(doc) }));
};

/** Every tracked document for an opportunity, including ones currently missing from disk. */
export const listAllDocs = async (opportunityId: string): Promise<FolderDocRecord[]> => {
  await ensureMigrated(opportunityId);
  return listDocs(opportunityId);
};
