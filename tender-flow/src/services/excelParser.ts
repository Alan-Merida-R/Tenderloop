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

    questions.push({
      id, active: true, stage, area, priority, itemType: type, content, description,
      responseType: row.ResponseType || (type === 'decision' ? 'select' : 'any'),
      dependencyOperator: parsedOperator, logicString, dependencyRules: extractedRules,
      deliverableTarget: (row.Entregable || row.Deliverables || row.Entregables) ? String(row.Entregable || row.Deliverables || row.Entregables).split(',').map(t => t.trim()) : [],
      allowedValues: options ? String(options).split(',').map(v => v.trim()) : undefined,
      isMultipleSelection: row.IsMultiple === true || String(row.IsMultiple).toLowerCase() === 'yes' || String(row.IsMultiple).toLowerCase() === 'si',
      mandatory: priority === 'mandatory' || !!row.Mandatory || !!row.mandatory || row.Obligatorio === 'SI' || row.Obligatorio === true,
      tags: row.Tags || row.tags ? String(row.Tags || row.tags).split(',').map(t => t.trim()) : [],
      order: row.Order || row.order ? Number(row.Order || row.order) : index,
      visualPosition: (row.PosX !== undefined && row.PosY !== undefined) ? { x: Number(row.PosX), y: Number(row.PosY) } : undefined
    });
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

  return { questions, stages, areas, responses, metadata: { name: 'Imported Project', customer: '', loopId: '' } };
};

/**
 * Genera un template estándar v3.5 con 4 hojas
 */
export const generateTemplateExcel = () => {
  const wb = XLSX.utils.book_new();

  const qData = [
    { ID: 'Q1', Stage: 'Intake', Area: 'Sales', ItemType: 'decision', Content: 'Is it a firm OP?', Options: 'Yes,No', Priority: 'mandatory' }
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
