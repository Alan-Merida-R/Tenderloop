import type { ProposalAlarmPolicy } from '../types';
import { EXECUTION_CENTERS, type ScopeCatalog } from '../components/scopeCatalog';
import { buildProposalScopeTimeRows } from './proposalScopeCatalog';
import { ALARM_FORMULA_FUNCTIONS, ALARM_FORMULA_VARIABLES, alarmFormulaVariableName, DEFAULT_ALARM_TARGET_FORMULA, validateAlarmFormula } from './alarmFormula';
import { getAlarmFormulaVariableNames, PROPOSAL_ALARM_FORMULA_VERSION } from './proposalAlarmPolicy';

/**
 * Round-trip of the Proposal Age policy through an .xlsx so the weights can be edited in Excel.
 *
 * Sheet "Pesos" is keyed by the Clave column (not by the visible Sección/Elemento text), so the
 * user can reorder rows or rename a section without breaking the import. New rows are allowed
 * for the map sections (e.g. a new Scope label): Clave = scopeItemDays, Elemento = the label.
 */

type XlsxModule = typeof import('xlsx');

export const ALARM_SHEET_WEIGHTS = 'Pesos';
export const ALARM_SHEET_AMOUNTS = 'Montos';
export const ALARM_SHEET_FORMULA = 'Fórmula';
const FORMULA_LABEL = 'Fórmula del target';

const CONFIG_FIELDS: Array<{ key: 'defaultDays' | 'warningPercent' | 'warningOffsetDays' | 'criticalPercent' | 'criticalOffsetDays'; label: string; unit: string }> = [
    { key: 'defaultDays', label: 'Base (días mínimos)', unit: 'días' },
    { key: 'warningPercent', label: 'Warning: % del target', unit: '%' },
    { key: 'warningOffsetDays', label: 'Warning: ajuste de días', unit: 'días' },
    { key: 'criticalPercent', label: 'Critical: % del target', unit: '%' },
    { key: 'criticalOffsetDays', label: 'Critical: ajuste de días', unit: 'días' },
];

type MapKey = 'quoteTypeDays' | 'revisionPercent' | 'scopeDays' | 'scopeItemDays' | 'scopeMultiplierPercent' | 'executionCenterDays';
const MAP_KEYS: MapKey[] = ['quoteTypeDays', 'revisionPercent', 'scopeDays', 'scopeItemDays', 'scopeMultiplierPercent', 'executionCenterDays'];

export const buildProposalAlarmWorkbook = (XLSX: XlsxModule, policy: ProposalAlarmPolicy, catalog: ScopeCatalog) => {
    const header = ['Sección', 'Elemento', 'Valor', 'Unidad', 'Clave'];
    const rows: Array<[string, string, number, string, string]> = [];
    CONFIG_FIELDS.forEach(field => rows.push(['Configuración', field.label, Number(policy[field.key]) || 0, field.unit, `config.${field.key}`]));
    (['Budgetary', 'Firm'] as const).forEach(type => rows.push(['Cotización', type, Number(policy.quoteTypeDays[type]) || 0, 'días', 'quoteTypeDays']));
    (['light', 'major'] as const).forEach(type => rows.push(['Revisión (multiplicador)', type, Number(policy.revisionPercent[type]) || 0, '%', 'revisionPercent']));

    const multipliers = policy.scopeMultiplierPercent || {};
    const seen = new Set<string>();
    buildProposalScopeTimeRows(catalog).forEach(row => {
        const key: MapKey = row.mode === 'base' ? 'scopeDays' : multipliers[row.label] !== undefined ? 'scopeMultiplierPercent' : 'scopeItemDays';
        const value = key === 'scopeDays' ? policy.scopeDays[row.label] : key === 'scopeMultiplierPercent' ? multipliers[row.label] : policy.scopeItemDays[row.label];
        const id = `${key}|${row.label}`;
        if (seen.has(id)) return;
        seen.add(id);
        rows.push([key === 'scopeMultiplierPercent' ? `${row.category} (multiplicador)` : row.category, row.label, Number(value) || 0, key === 'scopeMultiplierPercent' ? '%' : 'días', key]);
    });
    // Values configured for labels that are no longer in the catalog stay editable instead of vanishing.
    (['scopeDays', 'scopeItemDays', 'scopeMultiplierPercent'] as const).forEach(key => {
        Object.entries(policy[key] || {}).forEach(([label, value]) => {
            if (seen.has(`${key}|${label}`) || (key === 'scopeItemDays' && multipliers[label] !== undefined)) return;
            seen.add(`${key}|${label}`);
            rows.push(['Otros', label, Number(value) || 0, key === 'scopeMultiplierPercent' ? '%' : 'días', key]);
        });
    });
    Array.from(new Set([...EXECUTION_CENTERS, ...Object.keys(policy.executionCenterDays || {})])).forEach(center => rows.push(['Execution Center (opcional)', center, Number(policy.executionCenterDays?.[center]) || 0, 'días', 'executionCenterDays']));

    const weights = XLSX.utils.aoa_to_sheet([header, ...rows]);
    weights['!cols'] = [{ wch: 30 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 24 }];
    weights['!autofilter'] = { ref: `A1:E${rows.length + 1}` };

    const amounts = XLSX.utils.aoa_to_sheet([
        ['Desde USD', 'Días'],
        ...[...policy.amountTiers].sort((a, b) => a.minAmount - b.minAmount).map(tier => [Number(tier.minAmount) || 0, Number(tier.extraDays) || 0]),
    ]);
    amounts['!cols'] = [{ wch: 14 }, { wch: 8 }];

    const formula = XLSX.utils.aoa_to_sheet([
        [FORMULA_LABEL, (policy.targetFormula || '').trim() || DEFAULT_ALARM_TARGET_FORMULA],
        ['Default', DEFAULT_ALARM_TARGET_FORMULA],
        [],
        ['Escribe la fórmula en B1 SIN el signo "=". Se evalúa en la app, no en Excel.'],
        ['Funciones', ALARM_FORMULA_FUNCTIONS],
        ['Ejemplo: multiplicadores multiplicados', 'ROUND(MAX(BASE, DIAS * MULT_PRODUCTO))'],
        ['Ejemplo: +2 días extra si es Firm', 'ROUND(MAX(BASE, DIAS * MULT + IF(ES_FIRM, 2, 0)))'],
        [],
        ['Variable', 'Descripción'],
        ...ALARM_FORMULA_VARIABLES.map(item => [item.name, item.description]),
        ...Object.keys(policy.scopeMultiplierPercent || {}).map(label => [alarmFormulaVariableName(label), `Factor de "${label}" si está seleccionado, 0 si no`]).filter(row => row[0]),
    ]);
    formula['!cols'] = [{ wch: 36 }, { wch: 90 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, weights, ALARM_SHEET_WEIGHTS);
    XLSX.utils.book_append_sheet(workbook, amounts, ALARM_SHEET_AMOUNTS);
    XLSX.utils.book_append_sheet(workbook, formula, ALARM_SHEET_FORMULA);
    return workbook;
};

export const exportProposalAlarmPolicy = async (policy: ProposalAlarmPolicy, catalog: ScopeCatalog) => {
    const XLSX = await import('xlsx');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(buildProposalAlarmWorkbook(XLSX, policy, catalog), `Alarmas_OpportunityOS_${date}.xlsx`);
};

/** Accepts 2, "2", "2,5", "60%" — anything else is null. */
const readNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value ?? '').trim().replace('%', '').replace(',', '.');
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
};

export interface ProposalAlarmImportResult {
    policy: ProposalAlarmPolicy;
    changedCount: number;
    errors: string[];
}

export const readProposalAlarmWorkbook = (XLSX: XlsxModule, workbook: import('xlsx').WorkBook, current: ProposalAlarmPolicy): ProposalAlarmImportResult => {
    const errors: string[] = [];
    const next: ProposalAlarmPolicy = {
        ...current,
        formulaVersion: PROPOSAL_ALARM_FORMULA_VERSION,
        quoteTypeDays: { ...current.quoteTypeDays },
        revisionPercent: { ...current.revisionPercent },
        scopeDays: { ...current.scopeDays },
        scopeItemDays: { ...current.scopeItemDays },
        scopeMultiplierPercent: { ...(current.scopeMultiplierPercent || {}) },
        executionCenterDays: { ...(current.executionCenterDays || {}) },
    };
    let changedCount = 0;
    const set = (apply: () => void, before: unknown, after: unknown) => { if (before !== after) changedCount += 1; apply(); };

    const weights = workbook.Sheets[ALARM_SHEET_WEIGHTS];
    if (!weights) errors.push(`No encontré la hoja "${ALARM_SHEET_WEIGHTS}".`);
    else {
        const table = XLSX.utils.sheet_to_json<unknown[]>(weights, { header: 1, blankrows: false });
        const headerIndex = table.findIndex(row => row.some(cell => String(cell).trim().toLowerCase() === 'clave'));
        const headerRow = (table[headerIndex] || []).map(cell => String(cell ?? '').trim().toLowerCase());
        const col = (name: string) => headerRow.indexOf(name);
        const [elementCol, valueCol, keyCol] = [col('elemento'), col('valor'), col('clave')];
        if (headerIndex < 0 || elementCol < 0 || valueCol < 0) errors.push(`La hoja "${ALARM_SHEET_WEIGHTS}" necesita las columnas Elemento, Valor y Clave.`);
        else table.slice(headerIndex + 1).forEach((row, index) => {
            const excelRow = headerIndex + index + 2;
            const rawKey = String(row[keyCol] ?? '').trim();
            // Files exported before the rename used countryDays for the same values.
            const key = rawKey === 'countryDays' ? 'executionCenterDays' : rawKey;
            const label = String(row[elementCol] ?? '').trim();
            if (!key && !label) return;
            const value = readNumber(row[valueCol]);
            if (value === null) { errors.push(`Fila ${excelRow} (${label || key}): el valor no es un número.`); return; }
            if (key.startsWith('config.')) {
                const field = CONFIG_FIELDS.find(item => `config.${item.key}` === key);
                if (!field) { errors.push(`Fila ${excelRow}: clave desconocida "${key}".`); return; }
                set(() => { next[field.key] = value; }, current[field.key], value);
                return;
            }
            if (!MAP_KEYS.includes(key as MapKey)) { errors.push(`Fila ${excelRow}: clave desconocida "${key}".`); return; }
            if (!label) { errors.push(`Fila ${excelRow}: falta el Elemento.`); return; }
            if (key === 'quoteTypeDays' && label !== 'Budgetary' && label !== 'Firm') { errors.push(`Fila ${excelRow}: cotización debe ser Budgetary o Firm.`); return; }
            if (key === 'revisionPercent' && label !== 'light' && label !== 'major') { errors.push(`Fila ${excelRow}: revisión debe ser light o major.`); return; }
            const map = next[key as MapKey] as Record<string, number>;
            set(() => { map[label] = value; }, (current[key as MapKey] as Record<string, number> | undefined)?.[label], value);
            // An item moved to the multiplier section stops adding days (and vice versa).
            if (key === 'scopeMultiplierPercent' && next.scopeItemDays[label]) next.scopeItemDays[label] = 0;
        });
    }

    const amounts = workbook.Sheets[ALARM_SHEET_AMOUNTS];
    if (amounts) {
        const tiers: ProposalAlarmPolicy['amountTiers'] = [];
        XLSX.utils.sheet_to_json<unknown[]>(amounts, { header: 1, blankrows: false }).slice(1).forEach((row, index) => {
            if (row.every(cell => String(cell ?? '').trim() === '')) return;
            const minAmount = readNumber(row[0]);
            const extraDays = readNumber(row[1]);
            if (minAmount === null || extraDays === null) { errors.push(`${ALARM_SHEET_AMOUNTS} fila ${index + 2}: "Desde USD" y "Días" deben ser números.`); return; }
            tiers.push({ minAmount: Math.max(0, minAmount), extraDays });
        });
        if (tiers.length) {
            const sorted = tiers.sort((a, b) => a.minAmount - b.minAmount);
            if (JSON.stringify(sorted) !== JSON.stringify([...current.amountTiers].map(tier => ({ minAmount: tier.minAmount, extraDays: tier.extraDays })).sort((a, b) => a.minAmount - b.minAmount))) changedCount += 1;
            next.amountTiers = sorted;
        }
    }

    const formulaSheet = workbook.Sheets[ALARM_SHEET_FORMULA];
    if (formulaSheet) {
        const range = XLSX.utils.decode_range(formulaSheet['!ref'] || 'A1:B1');
        for (let r = range.s.r; r <= range.e.r; r += 1) {
            const labelCell = formulaSheet[XLSX.utils.encode_cell({ r, c: 0 })];
            if (String(labelCell?.v ?? '').trim() !== FORMULA_LABEL) continue;
            const cell = formulaSheet[XLSX.utils.encode_cell({ r, c: 1 })];
            // If the user typed "=..." Excel stored it as a real formula; its text is in `f`.
            const text = String(cell?.f ?? cell?.v ?? '').trim().replace(/^=/, '');
            if (!text) break;
            const error = validateAlarmFormula(text, getAlarmFormulaVariableNames(next));
            if (error) errors.push(`Fórmula no importada: ${error}.`);
            else set(() => { next.targetFormula = text; }, (current.targetFormula || DEFAULT_ALARM_TARGET_FORMULA).trim(), text);
            break;
        }
    }

    return { policy: next, changedCount, errors };
};

export const importProposalAlarmPolicy = async (file: File, current: ProposalAlarmPolicy): Promise<ProposalAlarmImportResult> => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true });
    return readProposalAlarmWorkbook(XLSX, workbook, current);
};
