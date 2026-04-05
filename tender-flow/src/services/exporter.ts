import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } from "docx";
import * as XLSX from 'xlsx';
import { ExecutiveFlowCase, StandardItem } from '../types';

/**
 * Servicio de exportación v3.0
 * Soporta Decisiones Cerradas, Multi-Selección y 3 Hojas (Questions, Stages, Areas)
 */

export const exportToExcel = (
  flowCase: ExecutiveFlowCase, 
  items: StandardItem[], 
  stages: any[] = [], 
  areas: any[] = []
) => {
  try {
    console.log("Exporting to Excel (v3.0 Strategic Protocol)...", { questions: items.length, stages: stages.length, areas: areas.length });
    
    // 1. Data Mapping
    const responses = flowCase.responses || {};
    const qData = items.map(item => {
      const response = responses[item.id];
      let computedLogicString = item.logicString || '';
      if (item.dependencyRules && item.dependencyRules.length > 0) {
        computedLogicString = item.dependencyRules.map(r => {
           if (r.operator === 'any_value') return `${r.targetId}:ANY`;
           return `${r.targetId}:${r.value !== undefined ? r.value : 'YES'}`;
        }).join(item.dependencyOperator === 'OR' ? ' OR ' : ' AND ');
      }

      return {
        ID: item.id,
        Stage: item.stage,
        Area: item.area, 
        Type: item.itemType,
        Priority: item.priority || (item.mandatory ? 'mandatory' : 'medium'),
        Content: item.content,
        Options: (item.allowedValues || []).join(','), // Nuevo: Opciones cerradas
        IsMultiple: item.isMultipleSelection ? 'YES' : 'NO', // Nuevo: Multi-selección
        Answer: response?.value ?? '',
        Status: response?.status ?? 'pending',
        Entregable: (item.deliverableTarget || []).join(', '),
        LogicOperator: item.dependencyOperator || 'AND',
        LogicString: computedLogicString,
        'Is Flagged': response?.isFlagged ? 'YES' : 'NO',
        'Is Locked': response?.isLocked ? 'YES' : 'NO',
        'Notes': response?.note || ''
      };
    });

    const sData = stages.map(s => ({
      ID: s.id,
      Name: s.name,
      Order: s.order,
      Active: s.active ? 'YES' : 'NO'
    }));

    const aData = areas.map(a => ({
      ID: a.id,
      Name: a.name,
      Order: a.order,
      Active: a.active ? 'YES' : 'NO',
      Color: a.color || '#3b82f6'
    }));

    // 2. Workbook Construction
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Questions
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qData), 'Questions');

    // Sheet 2: Stages
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sData.length > 0 ? sData : [{ Name: 'No Stages Defined' }]), 'Stages');

    // Sheet 3: Areas
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aData.length > 0 ? aData : [{ Name: 'No Areas Defined' }]), 'Areas');

    // 3. Robust Physical Download - Multi-Sheet Strategic Logic
    const prefix = String(flowCase.loopId || 'NEW_PROJECT').replace(/[^a-z0-9]/gi, '_');
    const suffix = String(flowCase.keyName || flowCase.metadata?.name || 'export').replace(/[^a-z0-9]/gi, '_');
    const fileName = `tf_export_${prefix}_${suffix}.xlsx`.toLowerCase();
    
    // Most robust browser-safe writeFile with no extra type flags
    XLSX.writeFile(wb, fileName);
    console.log("Strategic Export Successful:", fileName);
  } catch (err) {
    console.error("Critical: Excel Export Failed", err);
    alert("Excel Export Failed: See console for details.");
  }
};

export const exportToWord = async (flowCase: ExecutiveFlowCase, items: StandardItem[]) => {
  try {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
             text: "EXECUTIVE TENDER SUMMARY",
             heading: HeadingLevel.HEADING_1,
             alignment: AlignmentType.CENTER
          }),
          new Paragraph({
             children: [
                new TextRun({ text: `Customer: ${flowCase.metadata?.customer || 'N/A'}`, bold: true, size: 28 }),
                new TextRun({ text: `\rOP ID: ${flowCase.loopId || 'N/A'}`, size: 24, break: 1 }),
                new TextRun({ text: `\rProject: ${flowCase.metadata?.name || 'Unnamed'}`, size: 24, break: 1 }),
                new TextRun({ text: `\rDate: ${new Date().toLocaleDateString()}`, size: 24, break: 1 }),
             ],
             spacing: { after: 400 }
          }),

          new Paragraph({ 
             text: "DETAILED EXECUTIVE LOG",
             heading: HeadingLevel.HEADING_2,
             spacing: { before: 400, after: 200 }
          }),

          ...items
             .filter(i => !!(flowCase.responses || {})[i.id])
             .flatMap(i => {
                const resp = (flowCase.responses || {})[i.id];
                return [
                   new Paragraph({
                      children: [new TextRun({ text: i.content.toUpperCase(), bold: true, size: 24, color: "2c3e50" })],
                      spacing: { before: 400, after: 100 }
                   }),
                   new Paragraph({
                      children: [
                         new TextRun({ text: "RESPONSE: ", bold: true, size: 20 }),
                         new TextRun({ text: String(resp.value), size: 20, bold: true, color: "10b981" })
                      ],
                      indent: { left: 400 }
                   }),
                   new Paragraph({
                      children: [
                         new TextRun({ text: "APPLIES TO: ", bold: true, size: 18, color: "64748b" }),
                         new TextRun({ text: `${i.area} / ${i.stage}`, size: 18, color: "64748b" })
                      ],
                      indent: { left: 400 }
                   }),
                   ...(resp.note ? [
                      new Paragraph({
                         children: [
                            new TextRun({ text: "EXECUTIVE NOTES: ", bold: true, size: 18, color: "10b981" }),
                            new TextRun({ text: resp.note, size: 18, italics: true })
                         ],
                         indent: { left: 400 },
                         spacing: { before: 100 }
                      })
                   ] : []),
                   new Paragraph({ text: "", spacing: { after: 200 } })
                ];
             }),

          new Paragraph({ 
             text: "PENDING STRATEGIC GATES",
             heading: HeadingLevel.HEADING_2,
             spacing: { before: 600, after: 200 }
          }),

          ...items
             .filter(i => !(flowCase.responses || {})[i.id] && (i.priority === 'mandatory' || i.mandatory))
             .map(i => new Paragraph({
                children: [
                   new TextRun({ text: "REQUIRES ACTION: ", bold: true, color: "f43f5e", size: 18 }),
                   new TextRun({ text: `[${i.area}] `, bold: true, size: 18 }),
                   new TextRun({ text: i.content, size: 18 }),
                ],
                spacing: { before: 100 }
             })),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const rawFileName = `${flowCase.loopId || 'NEW'}_${flowCase.keyName || flowCase.metadata?.name || 'project'}`;
    const safeFileName = rawFileName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.docx';
    
    a.download = safeFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Critical: Word Export Failed", err);
  }
};
