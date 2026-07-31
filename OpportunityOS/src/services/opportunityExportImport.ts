
import { Opportunity, Task, MeetingNote, HistoryEntry, FolderDocRecord, INITIAL_DB } from '../types';
import { listAllDocs, DocMeta } from './opportunityDocMetaStore';
import { OpportunityExportPackage, CURRENT_SCHEMA_VERSION } from '../features/opportunity-export/schema';

// Helper to generate UUID
const generateId = () => crypto.randomUUID();

export const exportOpportunity = async (opp: Opportunity): Promise<OpportunityExportPackage> => {
  // Document metadata now lives on the opportunity in the shared DB, so it travels with
  // `opportunity` automatically. `docMetas` is still emitted so packages stay readable
  // by older builds that only know about that field — listAllDocs also pulls in any
  // metadata still sitting in this browser's legacy IndexedDB.
  const docs = await listAllDocs(opp.id);
  const docMetas: { relativePath: string; meta: DocMeta }[] = docs.map(doc => ({
    relativePath: doc.fileKey,
    meta: {
      docType: doc.docType ?? '',
      linkedTaskIds: doc.linkedTaskIds ?? [],
      linkedNoteIds: doc.linkedNoteIds ?? [],
      revisionFamilyId: doc.revisionFamilyId ?? '',
      alias: doc.alias ?? '',
      editableStatus: doc.editableStatus ?? '',
      internalNotes: doc.internalNotes ?? '',
      updatedAt: doc.updatedAt,
      missingSince: doc.missingSince ?? null,
    },
  }));

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: '1.0',
    opportunity: opp,
    docMetas
  };
};

export const importOpportunity = async (pkg: any, existingOpps: Opportunity[], targetId?: string): Promise<Opportunity> => {
  if (!pkg || typeof pkg !== 'object') {
      throw new Error("Invalid import package: Content is not an object.");
  }

  // Handle array input (bulk export format) - legacy support or direct fix
  if (Array.isArray(pkg)) {
      throw new Error("Invalid format: Received an array. Please use Bulk Import feature or select a single opportunity file.");
  }

  if (pkg.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${pkg.schemaVersion || 'undefined'}. Expected ${CURRENT_SCHEMA_VERSION}.`);
  }

  const packageData = pkg as OpportunityExportPackage;
  if (!packageData.opportunity) {
      throw new Error("Invalid file format: Missing opportunity data.");
  }
  const oldOpp = packageData.opportunity;

  // 1. Generate New IDs (or use Target ID)
  const newOppId = targetId || `OP-${Date.now().toString().slice(-6)}`; // Use target if provided (overwrite), else new ID

  // Map old IDs to new IDs to preserve relationships
  const idMap: Record<string, string> = {};

  // Tasks
  const newTasks = oldOpp.tasks.map(t => {
    const newId = generateId();
    idMap[t.id] = newId;
    return { ...t, id: newId, subtasks: t.subtasks.map(s => ({ ...s, id: generateId() })) };
  });

  // Notes
  const newNotes = oldOpp.notes.map(n => {
    const newId = generateId();
    idMap[n.id] = newId;
    return { ...n, id: newId };
  });

  // History
  const newHistory = (oldOpp.history || []).map(h => {
    const newId = generateId();
    idMap[h.id] = newId;
    return { ...h, id: newId };
  });

  // 2. Rewire Internal Links in Data

  // Tasks -> Notes links (if any)
  newTasks.forEach(t => {
    if (t.linkedNoteId && idMap[t.linkedNoteId]) {
      t.linkedNoteId = idMap[t.linkedNoteId];
    }
    if (t.linkedNoteIds) {
      t.linkedNoteIds = t.linkedNoteIds.map(nid => idMap[nid] || nid).filter(nid => Object.values(idMap).includes(nid));
    }
    t.dependsOnTaskIds = (t.dependsOnTaskIds || []).map(id => idMap[id]).filter((id): id is string => !!id);
    if (t.reworkForTaskId) t.reworkForTaskId = idMap[t.reworkForTaskId];
    if (t.assignmentCycles) t.assignmentCycles = t.assignmentCycles.map(cycle => ({ ...cycle, reworkTaskId: cycle.reworkTaskId ? idMap[cycle.reworkTaskId] : undefined }));
  });

  newNotes.forEach(note => {
    note.inlineTasks = (note.inlineTasks || []).map(inline => ({
      ...inline,
      id: generateId(),
      linkedTaskId: inline.linkedTaskId ? idMap[inline.linkedTaskId] : undefined,
    }));
    if (note.linkedTaskIds) note.linkedTaskIds = note.linkedTaskIds.map(id => idMap[id]).filter((id): id is string => !!id);
    if (note.parentId && idMap[note.parentId]) note.parentId = idMap[note.parentId];
  });

  // 3. Rewire the folder metadata that now travels inside the opportunity itself.
  // Task/note ids were all regenerated above, so document links, pin storage keys and
  // revision-history rows have to be remapped or they would point at the source
  // opportunity. The folder PATHS are kept on purpose: an import on the same team share
  // usually points at a folder that really does exist, and a stale one is handled by the
  // "path no longer valid" flow rather than by throwing the link away.
  const remapIds = (ids: string[] | undefined) =>
    (ids || []).map(id => idMap[id]).filter((id): id is string => !!id);

  const stamp = new Date().toISOString();
  // Packages written before folder metadata moved into the opportunity only carry
  // `docMetas`, so fall back to rebuilding the records from that.
  const newFolderDocs: FolderDocRecord[] = (oldOpp.folderDocs || []).length
    ? (oldOpp.folderDocs || []).map(doc => ({
        ...doc,
        id: generateId(),
        linkedTaskIds: remapIds(doc.linkedTaskIds),
        linkedNoteIds: remapIds(doc.linkedNoteIds),
      }))
    : (packageData.docMetas || []).map(item => ({
        id: generateId(),
        fileKey: item.relativePath,
        name: item.relativePath.split('/').pop() || item.relativePath,
        docType: item.meta.docType ?? '',
        alias: item.meta.alias ?? '',
        editableStatus: item.meta.editableStatus ?? '',
        internalNotes: item.meta.internalNotes ?? '',
        revisionFamilyId: item.meta.revisionFamilyId ?? '',
        linkedTaskIds: remapIds(item.meta.linkedTaskIds),
        linkedNoteIds: remapIds(item.meta.linkedNoteIds),
        firstSeenAt: item.meta.updatedAt || stamp,
        updatedAt: stamp,
      }));

  const newFolderPins = Object.fromEntries(
    Object.entries(oldOpp.folderPins || {}).map(([key, pins]) => {
      const suffix = key.startsWith(`${oldOpp.id}::`) ? key.slice(oldOpp.id.length) : '';
      return [`${newOppId}${suffix}`, pins];
    }),
  );

  const newRevisionHistory = (oldOpp.fileRevisionHistory || []).map(entry => ({
    ...entry,
    id: generateId(),
    opportunityId: newOppId,
    correctionTaskId: entry.correctionTaskId ? idMap[entry.correctionTaskId] : undefined,
  }));
  const newEmails = oldOpp.emails ? {
    ...oldOpp.emails,
    conversations: (oldOpp.emails.conversations || []).map(conversation => ({
      ...conversation,
      id: generateId(),
      linkedTaskIds: remapIds(conversation.linkedTaskIds),
      linkedNoteIds: remapIds(conversation.linkedNoteIds),
      messages: (conversation.messages || []).map(message => ({ ...message, id: generateId() })),
    })),
    generatedEmails: (oldOpp.emails.generatedEmails || []).map(record => ({
      ...record,
      id: generateId(),
      relatedTaskIds: remapIds(record.relatedTaskIds),
    })),
  } : undefined;

  // 4. Construct New Opportunity
  const newOpp: Opportunity = {
    ...oldOpp,
    id: newOppId,
    title: targetId ? oldOpp.title : `${oldOpp.title} (Imported)`,
    tasks: newTasks,
    notes: newNotes,
    history: newHistory.map(entry => entry.approval ? ({
      ...entry,
      approval: {
        ...entry.approval,
        taskId: idMap[entry.approval.taskId] || entry.approval.taskId,
        correctionTaskId: entry.approval.correctionTaskId ? idMap[entry.approval.correctionTaskId] : undefined,
      },
    }) : entry),
    folderDocs: newFolderDocs,
    folderPins: newFolderPins,
    fileRevisionHistory: newRevisionHistory,
    emails: newEmails,
    // Nothing legacy to sweep in for an id that has never existed in this browser.
    folderDataMigrated: true,
    folderLinked: false, // Reset folder link
    lastUpdated: new Date().toISOString()
  };

  // Document metadata is carried on `newOpp` above rather than written through
  // saveMeta: the imported opportunity does not exist in the database yet at this point
  // (the caller inserts what we return), so a store write here would have nowhere to land.
  return newOpp;
};

export const downloadJSON = (data: any, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
