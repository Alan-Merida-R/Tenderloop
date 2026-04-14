import * as XLSX from 'xlsx';
import { StandardItem, Priority, ItemType } from '../types';

/**
 * Servicio de procesamiento de Excel v3.0
 * Soporta decisiones cerradas, multi-selección y dependencias complejas.
 */

export const parseExcelSheet = (buffer: ArrayBuffer): { 
  questions: StandardItem[], 
  stages: any[], 
  areas: any[] 
} => {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  
  // 1. Hoja de Preguntas
  const qSheetName = workbook.SheetNames.includes('Questions') ? 'Questions' : workbook.SheetNames[0];
  const qSheet = workbook.Sheets[qSheetName];
  const qRows: any[] = XLSX.utils.sheet_to_json(qSheet);

  const questions: StandardItem[] = [];
  const seenIds = new Set<string>();

  qRows.forEach((row, index) => {
    const rawId = row.ID || row.Id || row.id || row['ID de Item'] || row.Identificador || row['#'] || `Q_IDX_${index}`;
    const id = String(rawId).trim().replace(/[\u2013\u2014]/g, '-'); 
    
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const stage = (row.Stage || row.stage || row.Etapa || row.etapa || row.Fase || 'Unassigned').toString().trim();
    const area = (row.Area || row.area || row.Área || row.área || row.Departamento || 'Common').toString().split(',')[0].trim();
    const rawType = (row.Type || row.type || row.Tipo || row.tipo || row.ItemType || row.itemType || 'question').toString().toLowerCase().trim();
    const type = (rawType === 'pregunta' ? 'question' : (rawType === 'decision' || rawType === 'decisión' ? 'decision' : (rawType === 'tarea' || rawType === 'action' ? 'action' : rawType))) as ItemType;
    const priority = (row.Priority || row.priority || row.Prioridad || row.prioridad || 'medium').toString().toLowerCase().trim() as Priority;
    const content = (row.Content || row.content || row.Contenido || row.contenido || row.Pregunta || row.Question || row.Task || 'Missing Content').toString().trim();
    const description = (row.Description || row.description || row.Descripción || row.descripción || row.Instrucciones || '').toString().trim();
    const options = (row.Options || row.options || row.Opciones || row.opciones || row.AllowedValues || row.allowedValues || row.Valores);
    const logicString = (row.LogicString || row.logicString || row.Logic || row.logic || row.Dependency || row.Dependencies || row.Dependencia || '').toString().trim();
    const parsedOperator = (row.LogicOperator || row.logicOperator || row.Operador || 'AND').toString().toUpperCase() as any;
    
    const extractedRules: any[] = [];
    // Detect if this is old-format logic (ID:VALUE pairs) vs numbered logic ((1 AND 2) OR 3)
    // Old format always contains ':' separating the targetId from the expected value.
    // Numbered format only has digits, AND, OR, NOT, parentheses.
    const isOldFormatLogic = logicString.includes(':');
    if (logicString) {
       const chunks = logicString.split(parsedOperator === 'OR' ? ' OR ' : ' AND ');
       chunks.forEach(chunk => {
         let targetId = chunk.trim();
         let value = '';
         let op = 'equals';
         if (chunk.includes(':')) {
           const parts = chunk.split(':');
           targetId = parts[0].trim();
           value = parts.slice(1).join(':').trim();
           if (value === 'ANY') op = 'any_value';
         } else { op = 'any_value'; }
         if (targetId) extractedRules.push({ targetId, operator: op, value });
       });
    }

    // CRITICAL FIX: When we successfully extracted rules from an old-format logicString,
    // clear the logicString field. The evaluator interprets a non-empty logicString as a
    // "numbered logic" expression (e.g. "((1 AND 2) OR 3)") and will corrupt old-format
    // strings (e.g. "Q1:ANY AND Q2:Yes") by replacing digit substrings with booleans,
    // causing questions to appear locked when they should be unlocked.
    // With logicString cleared, the evaluator uses dependencyRules + dependencyOperator
    // directly, which evaluates correctly.
    const finalLogicString = (isOldFormatLogic && extractedRules.length > 0) ? '' : logicString;

    // MIRROR: respect the SyncId column if the Excel came from a previous export
    // (or the user authored it intentionally). Items sharing a SyncId stay in
    // lock-step. Empty cell → standalone. We normalize to string+trim so that
    // numeric group IDs (1, 2, 3) and alphanumerics all work the same way.
    const rawSyncId = row.SyncId ?? row.syncId ?? row.SyncID ?? row['Sync Id'] ?? row.MirrorId ?? row.mirrorId ?? row.Grupo ?? row.Mirror ?? '';
    const syncIdCell = String(rawSyncId).trim();

    questions.push({
      id, active: true, stage, area, priority, itemType: type, content, description,
      responseType: row.ResponseType || (type === 'decision' ? 'select' : 'any'),
      dependencyOperator: parsedOperator, logicString: finalLogicString, dependencyRules: extractedRules,
      deliverableTarget: (row.Entregable || row.Deliverables || row.Entregables) ? String(row.Entregable || row.Deliverables || row.Entregables).split(',').map(t => t.trim()) : [],
      allowedValues: options ? String(options).split(',').map(v => v.trim()) : undefined,
      isMultipleSelection: row.IsMultiple === true || String(row.IsMultiple).toLowerCase() === 'yes' || String(row.IsMultiple).toLowerCase() === 'si',
      mandatory: priority === 'mandatory' || !!row.Mandatory || !!row.mandatory || row.Obligatorio === 'SI' || row.Obligatorio === true,
      tags: row.Tags || row.tags ? String(row.Tags || row.tags).split(',').map(t => t.trim()) : [],
      order: row.Order || row.order ? Number(row.Order || row.order) : index,
      visualPosition: (row.PosX !== undefined && row.PosY !== undefined) ? { x: Number(row.PosX), y: Number(row.PosY) } : undefined,
      syncId: syncIdCell || undefined
    });
  });

  // MIRROR NORMALIZATION (two passes):
  //
  // Pass A — resolve explicit SyncId groups. Any group with ≥2 members becomes
  // a real mirror set; singletons get their syncId cleared (a group of one is
  // not a mirror). We also remap arbitrary user labels ("A", "grupo-1") to a
  // canonical SYNC_* id so downstream code has a single predictable format.
  //
  // Pass B — auto-detect mirrors for imports that do NOT carry a SyncId column
  // (hand-authored Excels, legacy exports). Two or more questions with the
  // exact same normalized content are treated as mirrors — this matches the
  // in-app behavior where "duplicate" creates identical copies that share a
  // syncId. Items already in an explicit group from Pass A are skipped.
  const explicitGroups = new Map<string, string[]>(); // rawLabel → ids
  questions.forEach(q => {
    if (!q.syncId) return;
    const key = q.syncId;
    if (!explicitGroups.has(key)) explicitGroups.set(key, []);
    explicitGroups.get(key)!.push(q.id);
  });
  const labelToCanonical = new Map<string, string>();
  explicitGroups.forEach((ids, label) => {
    if (ids.length >= 2) {
      labelToCanonical.set(label, `SYNC_${label.replace(/[^a-z0-9]/gi, '_')}`);
    }
  });
  questions.forEach(q => {
    if (!q.syncId) return;
    const canonical = labelToCanonical.get(q.syncId);
    q.syncId = canonical; // undefined if the group had only 1 member → cleared
  });

  // Pass B — content-based auto-mirror for rows without an explicit SyncId.
  const normalizeContent = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const contentBuckets = new Map<string, typeof questions>();
  questions.forEach(q => {
    if (q.syncId) return; // already grouped explicitly
    if (!q.content || q.content === 'Missing Content') return;
    const key = `${q.itemType}::${normalizeContent(q.content)}`;
    if (!contentBuckets.has(key)) contentBuckets.set(key, []);
    contentBuckets.get(key)!.push(q);
  });
  contentBuckets.forEach(bucket => {
    if (bucket.length < 2) return;
    const canonical = `SYNC_AUTO_${bucket[0].id.replace(/[^a-z0-9]/gi, '_')}`;
    bucket.forEach(q => { q.syncId = canonical; });
  });

  // 2. Hoja de Etapas
  const sSheet = workbook.Sheets['Stages'];
  const sRows: any[] = sSheet ? XLSX.utils.sheet_to_json(sSheet) : [];
  const stages = sRows.map((row, i) => ({
    id: row.ID || row.id || `S_${i}`,
    name: row.Name || row.name || 'Unnamed Stage',
    order: row.Order !== undefined ? Number(row.Order) : (row.order !== undefined ? Number(row.order) : i),
    active: row.Active === 'YES' || row.Active === true || row.active === true || row.active === 'YES'
  }));

  // 3. Hoja de Áreas
  const aSheet = workbook.Sheets['Areas'];
  const aRows: any[] = aSheet ? XLSX.utils.sheet_to_json(aSheet) : [];
  const areas = aRows.map((row, i) => ({
    id: row.ID || row.id || `A_${i}`,
    name: row.Name || row.name || 'Unnamed Area',
    order: row.Order !== undefined ? Number(row.Order) : (row.order !== undefined ? Number(row.order) : i),
    active: row.Active === 'YES' || row.Active === true || row.active === true || row.active === 'YES',
    color: row.Color || row.color || undefined
  }));

  // 4. Hoja de Acciones (Sincronizadas)
  const aActionsSheet = workbook.Sheets['Actions'];
  const aActionsRows: any[] = aActionsSheet ? XLSX.utils.sheet_to_json(aActionsSheet) : [];
  const actionItems: StandardItem[] = [];
  aActionsRows.forEach((row, i) => {
    const id = (row.ID || row.id || `ACT_${i}`).toString().trim();
    if (seenIds.has(id)) return;
    seenIds.add(id);

    actionItems.push({
       id, active: true,
       stage: (row.Stage || 'Unassigned').toString(),
       area: (row.Area || 'Common').toString(),
       priority: 'medium', itemType: 'action',
       content: (row.Content || row.Task || 'Untitled Action').toString(),
       linkedTaskId: row.LinkedTaskId || undefined,
       responseType: 'select', mandatory: false, tags: [], logicString: '', deliverableTarget: [], order: 100 + i
    });
  });

  return { questions: [...questions, ...actionItems], stages, areas };
};

export const parseProjectExcel = (buffer: ArrayBuffer): { 
  questions: StandardItem[], 
  stages: any[], 
  areas: any[],
  responses: Record<string, any>,
  metadata: { name: string; customer: string; loopId: string }
} => {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  
  // 1. Parse Structure using the same logic (questions will include Actions now)
  const { questions, stages, areas } = parseExcelSheet(buffer);

  // 2. Extract Responses from BOTH Questions and Actions sheets
  const responses: Record<string, any> = {};
  
  const processSheet = (name: string) => {
    const s = workbook.Sheets[name];
    if (!s) return;
    const rows: any[] = XLSX.utils.sheet_to_json(s);
    rows.forEach(row => {
      const id = String(row.ID || row.id || '').trim();
      if (id && (row.Answer || row.Status || row.Notes || row.Status_Loop)) {
        responses[id] = {
          itemId: id,
          value: row.Answer || row.Status_Loop || '',
          status: (row.Status || (row.Status_Loop === 'Done' ? 'answered' : 'pending')).toLowerCase(),
          isFlagged: row['Is Flagged'] === 'YES' || row['Is Flagged'] === true,
          note: row.Notes || '',
          updatedAt: new Date().toISOString()
        };
      }
    });
  };

  processSheet('Questions');
  processSheet('Actions');

  // MIRROR RESPONSE PROPAGATION: if any member of a mirror group has an
  // answer but its siblings don't (common when the Excel was hand-edited
  // and only one row was filled in), copy the answer across the group so
  // the in-app invariant "mirror items share one response" holds from
  // the moment of import — mirroring handleDetailUpdate's behavior.
  const bySyncId = new Map<string, StandardItem[]>();
  questions.forEach(q => {
    if (!q.syncId) return;
    if (!bySyncId.has(q.syncId)) bySyncId.set(q.syncId, []);
    bySyncId.get(q.syncId)!.push(q);
  });
  bySyncId.forEach(group => {
    const sourceResp = group.map(g => responses[g.id]).find(r => r && String(r.value || '').trim() !== '');
    if (!sourceResp) return;
    group.forEach(member => {
      const existing = responses[member.id];
      if (!existing || String(existing.value || '').trim() === '') {
        responses[member.id] = {
          ...sourceResp,
          itemId: member.id,
          updatedAt: new Date().toISOString()
        };
      }
    });
  });

  return { questions, stages, areas, responses, metadata: { name: 'Imported Project', customer: '', loopId: '' } };
};

/**
 * Genera un template estándar v3.5 con 4 hojas
 */
export const generateTemplateExcel = () => {
  const wb = XLSX.utils.book_new();

  const qData = [
    { ID: 'Q1', Stage: 'Intake', Area: 'Sales', ItemType: 'decision', Content: 'Is it a firm OP?', Options: 'Yes,No', Priority: 'mandatory', SyncId: '' },
    // Example of a mirror group: two questions sharing SyncId="GRP_BUDGET"
    // will stay in lock-step (same answer across all copies).
    { ID: 'Q2A', Stage: 'Intake', Area: 'Sales', ItemType: 'question', Content: 'What is the budget?', Priority: 'high', SyncId: 'GRP_BUDGET' },
    { ID: 'Q2B', Stage: 'Commercial Proposal', Area: 'Sales', ItemType: 'question', Content: 'What is the budget?', Priority: 'high', SyncId: 'GRP_BUDGET' }
  ];

  const sData = [
    { ID: 'S1', Name: 'Intake', Order: 1, Active: 'YES' }
  ];

  const aData = [
    { ID: 'A1', Name: 'Sales', Order: 1, Active: 'YES', Color: '#3b82f6' }
  ];

  const actData = [
    { ID: 'ACT1', Stage: 'Intake', Area: 'Sales', Content: 'Sync with Loop Task', LinkedTaskId: 'T-001' }
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qData), 'Questions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sData), 'Stages');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aData), 'Areas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actData), 'Actions');

  XLSX.writeFile(wb, 'Tender_Standard_Template_v3.5.xlsx');
};

/**
 * PARSE LOOP DATABASE (EXTERNAL)
 * Lectura genérica de cualquier libro de Excel para búsqueda de tareas/ops.
 */
export const parseLoopDatabase = (buffer: ArrayBuffer): any[] => {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet);
};

/**
 * PARSE LOOP JSON DATABASE
 * Procesa el archivo nativo de TenderLoop (.json)
 */
export const parseLoopJsonDatabase = (content: string): any[] => {
  try {
    const data = JSON.parse(content);
    if (!data.opportunities) return [];
    
    // Devolvemos el array de oportunidades directamente
    // El modal se encargará de buscar en las tareas internas
    return data.opportunities;
  } catch (e) {
    console.error("Invalid Loop JSON", e);
    return [];
  }
};
