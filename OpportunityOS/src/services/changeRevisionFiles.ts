import type { FileRevisionRecord } from '../types';
import { copyFileAs } from '../features/opportunity-folder/fileOps';
import { getFolderHandleForRevision, verifyPermission } from './opportunityFolderLink';
import { getMeta, saveMeta } from './opportunityDocMetaStore';
import { getFileRevisionHistory, saveFileRevisionEntry } from './fileRevisionHistoryStore';

const REVISION_RE = /\bR(\d+)(?:\.(\d+))?\b/i;

const splitFileName = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? { base: name, ext: '' } : { base: name.slice(0, dot), ext: name.slice(dot) };
};
export const normalizeDocumentRevision = (value: string): string => {
  const bare = value.trim().toUpperCase().replace(/^R/, '');
  const match = bare.match(/^(\d+)\.(\d+)$/);
  return match ? `R${Number(match[1])}.${Number(match[2])}` : '';
};

export const documentRevisionFromName = (name: string): string => {
  const match = name.match(REVISION_RE);
  return match ? `R${Number(match[1])}.${Number(match[2] || 0)}` : '';
};

export const suggestSharedDocumentRevision = (fileKeys: string[]): string => {
  let bestMajor = -1;
  let bestMinor = -1;
  fileKeys.forEach(key => {
    const revision = documentRevisionFromName(key.split('/').pop() || '');
    const match = revision.match(REVISION_RE);
    if (!match) return;
    const major = Number(match[1]);
    const minor = Number(match[2] || 0);
    if (major > bestMajor || (major === bestMajor && minor > bestMinor)) {
      bestMajor = major;
      bestMinor = minor;
    }
  });
  return bestMajor < 0 ? 'R0.1' : `R${bestMajor}.${bestMinor + 1}`;
};

export const buildDocumentRevisionName = (sourceName: string, revision: string): string => {
  const { base, ext } = splitFileName(sourceName);
  const cleanBase = base.replace(/\s*[-_ ]?\bR\d+(?:\.\d+)?\b\s*$/i, '').trim() || base;
  return `${cleanBase} ${revision}${ext}`;
};

const familyKeyFor = (parts: string[]): string => {
  const sourceName = parts[parts.length - 1] || '';
  const { base, ext } = splitFileName(sourceName);
  const cleanBase = base.replace(/\s*[-_ ]?\bR\d+\.\d+\b\s*$/i, '').trim();
  return [...parts.slice(0, -1), `${cleanBase}${ext}`].join('/');
};

const resolveParent = async (root: FileSystemDirectoryHandle, parts: string[]) => {
  let parent = root;
  for (const segment of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(segment);
  return parent;
};

const exists = async (parent: FileSystemDirectoryHandle, name: string) => {
  try { await parent.getFileHandle(name); return true; } catch { return false; }
};

export interface ChangeRevisionFileRequest {
  sourceFileKey: string;
  newRevision: string;
}

export interface CreatedChangeRevisionFile {
  sourceFileKey: string;
  newFileKey: string;
  sourceRevision: string;
  newRevision: string;
  history: FileRevisionRecord;
}

/** Creates formal document revisions in place while preserving every source file. */
export const createChangeRevisionFiles = async (args: {
  opportunityId: string;
  opportunityRevision?: string;
  correctionTaskId: string;
  changeRevisionId: string;
  changes: string;
  reason: string;
  files: ChangeRevisionFileRequest[];
}): Promise<CreatedChangeRevisionFile[]> => {
  if (!args.files.length) return [];
  const root = await getFolderHandleForRevision(args.opportunityId, args.opportunityRevision);
  if (!root) throw new Error('Link the opportunity folder before creating file revisions.');
  if (!(await verifyPermission(root, true))) throw new Error('Write permission is required on the opportunity folder.');

  const prepared = await Promise.all(args.files.map(async request => {
    const parts = request.sourceFileKey.split('/').filter(Boolean);
    const sourceName = parts[parts.length - 1];
    const revision = normalizeDocumentRevision(request.newRevision);
    if (!sourceName || !revision) throw new Error(`Invalid revision for "${sourceName || request.sourceFileKey}".`);
    const parent = await resolveParent(root, parts);
    const source = await parent.getFileHandle(sourceName);
    const newName = buildDocumentRevisionName(sourceName, revision);
    if (await exists(parent, newName)) throw new Error(`A file named "${newName}" already exists.`);
    return { request, parts, sourceName, revision, parent, source, newName };
  }));

  const results: CreatedChangeRevisionFile[] = [];
  for (const item of prepared) {
    const sourceMeta = await getMeta(args.opportunityId, item.request.sourceFileKey);
    const familyKey = familyKeyFor(item.parts);
    const familyHistory = await getFileRevisionHistory(args.opportunityId, sourceMeta?.revisionFamilyId || familyKey);
    const familyId = sourceMeta?.revisionFamilyId || familyHistory.find(entry => entry.familyId)?.familyId || crypto.randomUUID();
    const newParts = [...item.parts.slice(0, -1), item.newName];
    const newFileKey = newParts.join('/');

    await copyFileAs(item.source, item.parent, item.newName);
    await saveMeta(args.opportunityId, item.request.sourceFileKey, { revisionFamilyId: familyId });
    await saveMeta(args.opportunityId, newFileKey, {
      ...(sourceMeta || {}),
      revisionFamilyId: familyId,
      linkedTaskIds: [args.correctionTaskId],
    });
    const history = await saveFileRevisionEntry({
      opportunityId: args.opportunityId,
      familyId,
      familyKey,
      sourceFileKey: item.request.sourceFileKey,
      newFileKey,
      sourceFileName: item.sourceName,
      newFileName: item.newName,
      sourceRevision: documentRevisionFromName(item.sourceName) || 'No revision',
      newRevision: item.revision,
      contains: '',
      changes: args.changes,
      reason: args.reason,
      changeRevisionId: args.changeRevisionId,
      correctionTaskId: args.correctionTaskId,
    });
    results.push({
      sourceFileKey: item.request.sourceFileKey,
      newFileKey,
      sourceRevision: documentRevisionFromName(item.sourceName) || 'No revision',
      newRevision: item.revision,
      history,
    });
  }
  return results;
};
