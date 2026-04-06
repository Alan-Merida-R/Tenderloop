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

  const questions: StandardItem[] = qRows.map((row, index) => {
    // Normalización de IDs y limpieza profunda (Punto 28 & 30 Fix)
    const rawId = row.ID || row.Id || row.id || row['ID de Item'] || row.Identificador || `Q_${index}`;
    const id = String(rawId).trim().replace(/[\u2013\u2014]/g, '-'); // Tratar guiones largos

    const stage = (row.Stage || row.stage || row.Etapa || row.etapa || row.Fase || 'Unassigned').toString().trim();
    const area = (row.Area || row.area || row.Área || row.área || row.Departamento || 'Common').toString().split(',')[0].trim();
    const type = (row.Type || row.type || row.Tipo || row.tipo || row.ItemType || row.itemType || 'question').toLowerCase().trim() as ItemType;
    const priority = (row.Priority || row.priority || row.Prioridad || row.prioridad || 'medium').toLowerCase().trim() as Priority;
    const content = (row.Content || row.content || row.Contenido || row.contenido || row.Pregunta || 'Missing Content').toString().trim();
    const description = (row.Description || row.description || row.Descripción || row.descripción || row.Instrucciones || '').toString().trim();
    
    // Soporte extendido para lógica (Punto 24/25)
    const options = (row.Options || row.options || row.Opciones || row.opciones || row.AllowedValues || row.allowedValues || row.Valores);
    const logicString = (row.LogicString || row.logicString || row.Logic || row.logic || row.Dependency || row.Dependencies || row.Dependencia || '').toString().trim();

    const parsedOperator = (row.LogicOperator || row.logicOperator || row.Operador || 'AND').toString().toUpperCase() as any;
    
    // Convert LogicString back into visual dependencyRules to preserve flowchart links
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
         } else {
           op = 'any_value';
         }
         if (targetId) {
           extractedRules.push({ targetId, operator: op, value });
         }
       });
    }

    return {
      id,
      active: true,
      stage,
      area,
      priority,
      itemType: type,
      content,
      description,
      responseType: row.ResponseType || (type === 'decision' ? 'select' : 'any'),
      dependencyOperator: parsedOperator,
      logicString,
      dependencyRules: extractedRules,
      deliverableTarget: (row.Entregable || row.Deliverables || row.Entregables) ? String(row.Entregable || row.Deliverables || row.Entregables).split(',').map(t => t.trim()) : [],
      allowedValues: options ? String(options).split(',').map(v => v.trim()) : undefined,
      isMultipleSelection: row.IsMultiple === true || String(row.IsMultiple).toLowerCase() === 'yes' || String(row.IsMultiple).toLowerCase() === 'si',
      mandatory: priority === 'mandatory' || !!row.Mandatory || !!row.mandatory || row.Obligatorio === 'SI' || row.Obligatorio === true,
      tags: row.Tags || row.tags ? String(row.Tags || row.tags).split(',').map(t => t.trim()) : [],
      order: row.Order || row.order ? Number(row.Order || row.order) : index,
    };
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

  return { questions, stages, areas };
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
  
  // 1. Parse Structure using the same logic
  const { questions, stages, areas } = parseExcelSheet(buffer);

  // 2. Extract Responses from the Questions Sheet
  const qSheetName = workbook.SheetNames.includes('Questions') ? 'Questions' : workbook.SheetNames[0];
  const qSheet = workbook.Sheets[qSheetName];
  const qRows: any[] = XLSX.utils.sheet_to_json(qSheet);

  const responses: Record<string, any> = {};
  let customer = '';
  let loopId = '';
  let name = 'Imported Project';

  qRows.forEach(row => {
    const id = String(row.ID || row.id || row['ID de Item'] || '').trim();
    if (id && (row.Answer || row.Status || row.Notes)) {
      responses[id] = {
        itemId: id,
        value: row.Answer || '',
        status: (row.Status || 'pending').toLowerCase(),
        isFlagged: row['Is Flagged'] === 'YES' || row['Is Flagged'] === true,
        isLocked: row['Is Locked'] === 'YES' || row['Is Locked'] === true,
        note: row.Notes || '',
        updatedAt: new Date().toISOString()
      };
    }
  });

  // Try to find metadata if it was added to some specific place, otherwise use defaults from the first rows
  // In our exporter, we don't save metadata in a separate sheet, so we just infer from filename or first row if possible
  // For now let's assume standard import
  
  return { questions, stages, areas, responses, metadata: { name, customer, loopId } };
};

/**
 * Genera un template estándar v3.0 con 3 hojas
 */
export const generateTemplateExcel = () => {
  const wb = XLSX.utils.book_new();

  const qData = [
    { 
      ID: 'OP-001', 
      Stage: 'Pre-Assessment', 
      Area: 'Sales', 
      ItemType: 'decision', 
      Content: 'Is this a firm opportunity?', 
      Options: 'Yes,No,TBD', 
      IsMultiple: 'No',
      Priority: 'mandatory', 
      LogicString: '' 
    }
  ];

  const sData = [
    { ID: 'S1', Name: 'Pre-Assessment', Order: 1, Active: 'YES' },
    { ID: 'S2', Name: 'Clarification', Order: 2, Active: 'YES' }
  ];

  const aData = [
    { ID: 'A1', Name: 'Sales', Order: 1, Active: 'YES', Color: '#3b82f6' },
    { ID: 'A2', Name: 'TSC', Order: 2, Active: 'YES', Color: '#10b981' }
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qData), 'Questions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sData), 'Stages');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aData), 'Areas');

  XLSX.writeFile(wb, 'Tender_Standard_Template.xlsx');
};
