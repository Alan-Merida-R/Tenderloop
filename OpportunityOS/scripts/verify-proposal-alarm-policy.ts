import assert from 'node:assert/strict';
import { calculateProposalAlarm, DEFAULT_PROPOSAL_ALARM_POLICY, getProposalAgeTargets, getProposalAlarmPolicy, syncProposalPolicyWithScopeCatalog } from '../src/services/proposalAlarmPolicy';
import { buildProposalScopeTimeRows } from '../src/services/proposalScopeCatalog';
import { DEFAULT_SCOPE_CATALOG } from '../src/components/scopeCatalog';
import type { AlarmConfig, Opportunity } from '../src/types';
import * as XLSX from 'xlsx';
import { evaluateAlarmFormula } from '../src/services/alarmFormula';
import { buildProposalAlarmWorkbook, readProposalAlarmWorkbook } from '../src/services/proposalAlarmExcel';

// Every expected value below is what Alarmas.xlsx (Sheet1!G8) returns for the same selection:
// ROUND(IF(SUM(days) * multiplier < Base, Base, SUM(days) * multiplier), 0)
// multiplier = light + major + (1 - similar) + (1 - split), or 1 when none is active.

let passed = 0;
const test = (name: string, run: () => void) => {
    try { run(); passed += 1; console.log('  PASS ', name); }
    catch (error: any) { console.error('  FAIL ', name, error.message); process.exitCode = 1; }
};
const policy = DEFAULT_PROPOSAL_ALARM_POLICY;

test('nothing selected falls back to the 5-day Base', () => {
    const result = calculateProposalAlarm({}, policy);
    assert.equal(result.sumDays, 1); // Budgetary
    assert.equal(result.expectedDays, 5);
    assert.equal(result.isMinimumApplied, true);
});

test('every selected row adds its days (proposal types are summed, not max)', () => {
    // Firm 2 + Green field 6 + Migration 6 + Foxboro 2 + Safety 2 + SIS 1 = 19
    const result = calculateProposalAlarm({ quoteType: 'Firm', scopeTypes: ['Green field', 'Migration'], systems: ['Foxboro', 'Safety'], applications: ['SIS/ESD'] }, policy);
    assert.equal(result.sumDays, 19);
    assert.equal(result.multiplier, 1);
    assert.equal(result.expectedDays, 19);
});

test('only the highest amount tier reached adds its days', () => {
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Upgrade'], amount: 200_000 }, policy).expectedDays, 6);   // 1 + 5
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Upgrade'], amount: 1_500_000 }, policy).expectedDays, 12); // 1 + 5 + 6
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Upgrade'], amount: 3_000_000 }, policy).expectedDays, 17); // 1 + 5 + 11
});

test('cabinets and resale bands add their Excel days', () => {
    // Budgetary 1 + Green field 6 + New Cabinets 1 + India 6 + Resales >50% 7 = 21
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Green field'], quickNotes: ['New Cabinets', 'India Cabinets', 'Resales >50%'] }, policy).expectedDays, 21);
});

test('revision multiplies the sum: light 30%, major 85%', () => {
    const input = { quoteType: 'Firm' as const, scopeTypes: ['Green field', 'Migration'], systems: ['Foxboro', 'Safety'], applications: ['SIS/ESD'], revision: 'R1' };
    assert.equal(calculateProposalAlarm(input, policy).expectedDays, 6);                                        // 19 * 0.3 = 5.7
    assert.equal(calculateProposalAlarm({ ...input, revisionChangeImpact: 'major' }, policy).expectedDays, 16); // 19 * 0.85 = 16.15
});

test('R0 ignores the revision multiplier', () => {
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Green field'], revision: 'R0', revisionChangeImpact: 'major' }, policy).expectedDays, 7);
});

test('Similar/Copy and Split multiply instead of adding days', () => {
    const base = { quoteType: 'Firm' as const, scopeTypes: ['Green field', 'Migration'], systems: ['Foxboro', 'Safety'], applications: ['SIS/ESD'] };
    assert.equal(calculateProposalAlarm({ ...base, extras: ['Similar/Copy'] }, policy).expectedDays, 11); // 19 * 0.6 = 11.4
    assert.equal(calculateProposalAlarm({ ...base, extras: ['Split'] }, policy).expectedDays, 17);        // 19 * 0.9 = 17.1
});

test('active multipliers are summed like the Excel', () => {
    // 19 * (0.3 light + 0.6 similar) = 17.1
    const result = calculateProposalAlarm({ quoteType: 'Firm', scopeTypes: ['Green field', 'Migration'], systems: ['Foxboro', 'Safety'], applications: ['SIS/ESD'], extras: ['Similar/Copy'], revision: 'R2' }, policy);
    assert.equal(Number(result.multiplier.toFixed(2)), 0.9);
    assert.equal(result.expectedDays, 17);
});

test('the Base floor applies after the multiplier', () => {
    // 1 + 5 = 6 days * 0.3 = 1.8 -> Base 5
    const result = calculateProposalAlarm({ scopeTypes: ['Upgrade'], revision: 'R1' }, policy);
    assert.equal(result.expectedDays, 5);
    assert.equal(result.isMinimumApplied, true);
});

test('a policy saved under the old formula restarts from the Excel values but keeps alert thresholds', () => {
    const legacy = { ...DEFAULT_PROPOSAL_ALARM_POLICY, formulaVersion: undefined, defaultDays: 20, warningPercent: 60, scopeDays: { 'Green field': 30, 'Custom type': 9 }, quoteTypeDays: { Budgetary: 0, Firm: 5 } };
    const alarms = [{ id: 'proposal-scope-policy', daysThreshold: 0, color: '', proposalPolicy: legacy }] as AlarmConfig[];
    const migrated = getProposalAlarmPolicy(alarms);
    assert.equal(migrated.defaultDays, 5);
    assert.equal(migrated.scopeDays['Green field'], 6);
    assert.equal(migrated.scopeDays['Custom type'], 9);
    assert.equal(migrated.quoteTypeDays.Firm, 2);
    assert.equal(migrated.warningPercent, 60);
});

test('every newly created Scope entry receives an editable alarm configuration', () => {
    const catalog = structuredClone(DEFAULT_SCOPE_CATALOG);
    catalog.scope.push({ id: 'custom-type', label: 'Custom proposal type' });
    catalog.systems.push({ id: 'custom-system', label: 'Custom system', children: [{ id: 'custom-module', label: 'Custom module' }] });
    catalog.quickNotes.push({ id: 'custom-extra', label: 'Custom extra' });
    const synced = syncProposalPolicyWithScopeCatalog(DEFAULT_PROPOSAL_ALARM_POLICY, catalog);
    const rows = buildProposalScopeTimeRows(catalog);
    assert.equal(synced.scopeDays['Custom proposal type'], 0);
    assert.equal(synced.scopeItemDays['Custom system'], 0);
    assert.equal(synced.scopeItemDays['Custom module'], 0);
    assert.equal(synced.scopeItemDays['Custom extra'], 0);
    assert.ok(rows.some(row => row.label === 'Custom proposal type' && row.mode === 'base'));
    assert.ok(rows.some(row => row.label === 'Custom module' && row.category === 'Custom system sub-modules'));
});

test('SOW Extra Scope sub-modules reach KPI and alarm calculations', () => {
    const opportunity = {
        id: 'sow-child', quoteType: 'Budgetary', labels: [], revision: 'R0',
        notes: [{ id: 'sow', format: 'sow', content: JSON.stringify({ fields: { scope_types: ['Green field'], quick_notes: ['New Cabinets'], 'qnmod_new-cabinets': ['Regional Integration'] } }) }],
        commercial: { cqaOfficialSellPrice: 0, customSections: [] },
        kpis: { proposalAmountUSD: 0 },
    } as Opportunity;
    const targets = getProposalAgeTargets(opportunity, [], DEFAULT_SCOPE_CATALOG);
    assert.equal(targets.expectedDays, 11); // Budgetary 1 + Green field 6 + New Cabinets 1 + Regional Integration 3
});

test('KPI/card targets use the same policy engine', () => {
    const opportunity = {
        id: 'test', quoteType: 'Firm', labels: [],
        notes: [{ id: 'sow', format: 'sow', content: JSON.stringify({ fields: { scope_types: ['Green field'], quick_notes: ['New Cabinets'] } }) }],
        commercial: { cqaOfficialSellPrice: 1_000_000, customSections: [] },
        kpis: { proposalAmountUSD: 0 },
    } as Opportunity;
    const targets = getProposalAgeTargets(opportunity, []);
    assert.equal(targets.expectedDays, 15); // Firm 2 + Green field 6 + New Cabinets 1 + 1M 6
    assert.equal(targets.warningDays, 11);
    assert.equal(targets.criticalDays, 15);
});

test('Execution Center adjustments support positive, negative and no center', () => {
    const withCenters = { ...policy, executionCenterDays: { Mexico: 3, USA: 0, Canada: -2 } };
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Green field'], executionCenter: 'Mexico' }, withCenters).expectedDays, 10);
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Green field'], executionCenter: 'Canada' }, withCenters).expectedDays, 5);
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Green field'] }, withCenters).expectedDays, 7); // optional: empty adds nothing
});

test('the Execution Center chosen in the SOW Scope reaches the card target', () => {
    const opportunity = {
        id: 'center', quoteType: 'Budgetary', labels: [], revision: 'R0',
        notes: [{ id: 'sow', format: 'sow', content: JSON.stringify({ fields: { scope_types: ['Green field'], execution_center: 'USA' } }) }],
        commercial: { cqaOfficialSellPrice: 0, customSections: [] },
        kpis: { proposalAmountUSD: 0 },
    } as Opportunity;
    const policyRecord = { ...policy, executionCenterDays: { Mexico: 0, USA: 4, Canada: 0 } };
    const alarms = [{ id: 'proposal-scope-policy', daysThreshold: 0, color: '', proposalPolicy: policyRecord }] as AlarmConfig[];
    assert.equal(getProposalAgeTargets(opportunity, alarms, DEFAULT_SCOPE_CATALOG).expectedDays, 11); // 1 + 6 + USA 4
});

test('the short-lived countryDays setting migrates into Execution Center days', () => {
    const legacy = { ...policy, executionCenterDays: undefined, countryDays: { Mexico: 2, Peru: 9 } };
    const migrated = getProposalAlarmPolicy([{ id: 'proposal-scope-policy', daysThreshold: 0, color: '', proposalPolicy: legacy }] as AlarmConfig[]);
    assert.deepEqual(migrated.executionCenterDays, { Mexico: 2, USA: 0, Canada: 0 });
});

test('negative day adjustments are accepted while the Base remains the floor', () => {
    const adjusted = { ...policy, scopeItemDays: { ...policy.scopeItemDays, 'Customer credit': -4 } };
    const result = calculateProposalAlarm({ scopeTypes: ['Green field'], extras: ['Customer credit'] }, adjusted);
    assert.equal(result.sumDays, 3); // Budgetary 1 + Green field 6 - 4
    assert.equal(result.expectedDays, 5);
});

test('formula language: Excel rounding, Spanish names, ; separators and IF', () => {
    assert.equal(evaluateAlarmFormula('ROUND(2.5)', {}), 3);
    assert.equal(evaluateAlarmFormula('=REDONDEAR(MAX(BASE; DIAS * MULT); 0)', { BASE: 5, DIAS: 19, MULT: 0.85 }), 16);
    assert.equal(evaluateAlarmFormula('SI(DIAS > 10, 1, 2) + 2 ^ 3', { DIAS: 11 }), 9);
    assert.equal(evaluateAlarmFormula('IF(MULT_SUMA = 0, DIAS, DIAS / MULT_SUMA)', { DIAS: 8, MULT_SUMA: 0 }), 8);
    assert.throws(() => evaluateAlarmFormula('DIAS * FOO', { DIAS: 1 }), /Variable desconocida: FOO/);
    assert.throws(() => evaluateAlarmFormula('MAX(1, 2', {}), /Se esperaba/);
});

test('a custom target formula drives the target (multipliers multiplied instead of summed)', () => {
    const custom = { ...policy, targetFormula: 'ROUND(MAX(BASE, DIAS * MULT_PRODUCTO))' };
    // 19 * (0.3 light * 0.6 similar) = 3.42 -> Base 5  (the Excel sum would give 17)
    const input = { quoteType: 'Firm' as const, scopeTypes: ['Green field', 'Migration'], systems: ['Foxboro', 'Safety'], applications: ['SIS/ESD'], extras: ['Similar/Copy'], revision: 'R2' };
    assert.equal(calculateProposalAlarm(input, custom).expectedDays, 5);
    assert.equal(calculateProposalAlarm(input, { ...policy, targetFormula: 'DIAS + SIMILAR_COPY * 10' }).expectedDays, 25); // 19 + 0.6*10
});

test('an invalid custom formula falls back to the default and reports the error', () => {
    const result = calculateProposalAlarm({ scopeTypes: ['Green field'] }, { ...policy, targetFormula: 'DIAS *' });
    assert.equal(result.expectedDays, 7);
    assert.ok(result.formulaError);
});

test('Excel export -> edit -> import round-trips weights, amount tiers and formula', () => {
    const workbook = buildProposalAlarmWorkbook(XLSX, policy, DEFAULT_SCOPE_CATALOG);
    const reread = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellFormula: true });
    const unchanged = readProposalAlarmWorkbook(XLSX, reread, policy);
    assert.deepEqual(unchanged.errors, []);
    assert.equal(unchanged.changedCount, 0);

    const weights = reread.Sheets['Pesos'];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(weights, { header: 1 });
    const eaeRow = rows.findIndex(row => row[1] === 'EAE' && row[4] === 'scopeItemDays');
    weights[XLSX.utils.encode_cell({ r: eaeRow, c: 2 })] = { t: 'n', v: 4 };
    XLSX.utils.sheet_add_aoa(weights, [['Execution Center', 'Mexico', 3, 'días', 'countryDays'], ['Configuración', 'Base', 'abc', 'días', 'config.defaultDays']], { origin: -1 });
    XLSX.utils.sheet_add_aoa(reread.Sheets['Montos'], [[5_000_000, 15]], { origin: -1 });
    reread.Sheets['Fórmula']['B1'] = { t: 'n', v: 0, f: 'ROUND(MAX(BASE, DIAS * MULT_PRODUCTO))' }; // typed with "=" in Excel

    const imported = readProposalAlarmWorkbook(XLSX, reread, policy);
    assert.equal(imported.policy.scopeItemDays.EAE, 4);
    assert.equal(imported.policy.executionCenterDays?.Mexico, 3);
    assert.equal(imported.policy.amountTiers.at(-1)?.extraDays, 15);
    assert.equal(imported.policy.targetFormula, 'ROUND(MAX(BASE, DIAS * MULT_PRODUCTO))');
    assert.equal(imported.policy.defaultDays, policy.defaultDays); // bad value ignored...
    assert.equal(imported.errors.length, 1);                        // ...and reported
    assert.equal(imported.changedCount, 4);
});

const TOTAL = 21;
console.log(`\n${passed}/${TOTAL} proposal alarm checks passed`);
if (passed !== TOTAL) process.exit(1);
