
import { Opportunity, Task, MeetingNote, Question, HistoryEntry, INITIAL_DB } from '../types';
import { getMeta, saveMeta, DocMeta } from './opportunityDocMetaStore';
import { OpportunityExportPackage, CURRENT_SCHEMA_VERSION } from '../features/opportunity-export/schema';

// Helper to generate UUID
const generateId = () => crypto.randomUUID();

export const exportOpportunity = async (opp: Opportunity): Promise<OpportunityExportPackage> => {
  // 1. Gather all document metadata linked to this opportunity
  const docMetas: { relativePath: string; meta: DocMeta }[] = [];
  
  // Open DB to scan keys
  const dbName = 'TenderLoopDocMeta';
  const storeName = 'docMeta';
  
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(storeName)) {
        resolve();
        return;
      }
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const cursorRequest = store.openCursor();
      
      cursorRequest.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith(`${opp.id}||`)) {
            const relativePath = key.split('||')[1];
            docMetas.push({ relativePath, meta: cursor.value });
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    };
    request.onerror = () => reject(request.error);
  });

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

  // Questions
  const newQuestions = (oldOpp.questions || []).map(q => {
    const newId = generateId();
    idMap[q.id] = newId;
    return { ...q, id: newId };
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
  });

  // Questions -> Source links
  newQuestions.forEach(q => {
    if (q.sourceId && idMap[q.sourceId]) {
      q.sourceId = idMap[q.sourceId];
    }
  });

  // 3. Construct New Opportunity
  const newOpp: Opportunity = {
    ...oldOpp,
    id: newOppId,
    title: targetId ? oldOpp.title : `${oldOpp.title} (Imported)`,
    tasks: newTasks,
    notes: newNotes,
    questions: newQuestions,
    history: newHistory,
    folderLinked: false, // Reset folder link
    lastUpdated: new Date().toISOString()
  };

  // 4. Restore Document Metadata with Remapped IDs
  for (const item of packageData.docMetas) {
    const newMeta: DocMeta = {
      ...item.meta,
      linkedTaskIds: item.meta.linkedTaskIds.map(tid => idMap[tid] || tid).filter(tid => Object.values(idMap).includes(tid)), 
      linkedNoteIds: item.meta.linkedNoteIds.map(nid => idMap[nid] || nid).filter(nid => Object.values(idMap).includes(nid)),
      updatedAt: new Date().toISOString()
    };
    
    // Save to store with new key
    await saveMeta(newOppId, item.relativePath, newMeta);
  }

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
