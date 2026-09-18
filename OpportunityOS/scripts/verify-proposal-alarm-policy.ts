import assert from 'node:assert/strict';
import { calculateProposalAlarm, DEFAULT_PROPOSAL_ALARM_POLICY, getProposalAgeTargets, syncProposalPolicyWithScopeCatalog } from '../src/services/proposalAlarmPolicy';
import { buildProposalScopeTimeRows } from '../src/services/proposalScopeCatalog';
import { DEFAULT_SCOPE_CATALOG } from '../src/components/scopeCatalog';
import type { Opportunity } from '../src/types';

let passed = 0;
const test = (name: string, run: () => void) => {
    try { run(); passed += 1; console.log('  PASS ', name); }
    catch (error: any) { console.error('  FAIL ', name, error.message); process.exitCode = 1; }
};

test('Green field starts from its configured base time', () => {
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Green field'] }, DEFAULT_PROPOSAL_ALARM_POLICY).expectedDays, 30);
});

test('Firm adds its own configured validation time', () => {
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Green field'], quoteType: 'Firm' }, DEFAULT_PROPOSAL_ALARM_POLICY).expectedDays, 35);
});

test('New Cabinets adds its configured individual Scope time', () => {
    assert.equal(calculateProposalAlarm({ scopeTypes: ['Green field'], quickNotes: ['New Cabinets'] }, DEFAULT_PROPOSAL_ALARM_POLICY).expectedDays, 35);
});

test('one selected amount tier scales cabinets and resales', () => {
    const result = calculateProposalAlarm({ scopeTypes: ['Green field'], amount: 1_000_000, quickNotes: ['New Cabinets', 'Resales >50%'] }, DEFAULT_PROPOSAL_ALARM_POLICY);
    // 30 base + 8 amount + ((5 cabinets + 4 resale) * 1.5) = 51.5 -> 52
    assert.equal(result.expectedDays, 52);
    assert.equal(result.complexityMultiplier, 1.5);
});

test('R1 defaults to light changes and major changes use 85%', () => {
    const light = calculateProposalAlarm({ scopeTypes: ['Green field'], revision: 'R1' }, DEFAULT_PROPOSAL_ALARM_POLICY);
    const major = calculateProposalAlarm({ scopeTypes: ['Green field'], revision: 'R1', revisionChangeImpact: 'major' }, DEFAULT_PROPOSAL_ALARM_POLICY);
    assert.equal(light.expectedDays, 15);
    assert.equal(major.expectedDays, 26);
});

test('editable Commitment percentages drive revision calculations', () => {
    const policy = { ...DEFAULT_PROPOSAL_ALARM_POLICY, revisionPercent: { light: 40, major: 90 } };
    const light = calculateProposalAlarm({ scopeTypes: ['Green field'], revision: 'R2', revisionChangeImpact: 'light' }, policy);
    const major = calculateProposalAlarm({ scopeTypes: ['Green field'], revision: 'R2', revisionChangeImpact: 'major' }, policy);
    assert.equal(light.expectedDays, 12);
    assert.equal(major.expectedDays, 27);
});

test('every newly created Scope entry receives an editable alarm configuration', () => {
    const catalog = structuredClone(DEFAULT_SCOPE_CATALOG);
    catalog.scope.push({ id: 'custom-type', label: 'Custom proposal type' });
    catalog.systems.push({ id: 'custom-system', label: 'Custom system', children: [{ id: 'custom-module', label: 'Custom module' }] });
    catalog.quickNotes.push({ id: 'custom-extra', label: 'Custom extra' });
    const policy = syncProposalPolicyWithScopeCatalog(DEFAULT_PROPOSAL_ALARM_POLICY, catalog);
    const rows = buildProposalScopeTimeRows(catalog);
    assert.equal(policy.scopeDays['Custom proposal type'], policy.defaultDays);
    assert.equal(policy.scopeItemDays['Custom system'], 0);
    assert.equal(policy.scopeItemDays['Custom module'], 0);
    assert.equal(policy.scopeItemDays['Custom extra'], 0);
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
    assert.equal(targets.expectedDays, 39); // 30 + New Cabinets 5 + Regional Integration 4
});

test('KPI/card targets use the same policy engine', () => {
    const opportunity = {
        id: 'test', quoteType: 'Firm', labels: [],
        notes: [{ id: 'sow', format: 'sow', content: JSON.stringify({ fields: { scope_types: ['Green field'], quick_notes: ['New Cabinets'] } }) }],
        commercial: { cqaOfficialSellPrice: 1_000_000, customSections: [] },
        kpis: { proposalAmountUSD: 0 },
    } as Opportunity;
    const targets = getProposalAgeTargets(opportunity, []);
    assert.equal(targets.expectedDays, 51); // 30 + 8 + (5 * 1.5) + 5
    assert.equal(targets.warningDays, 36);
    assert.equal(targets.criticalDays, 51);
});

console.log(`\n${passed}/9 proposal alarm checks passed`);
if (passed !== 9) process.exit(1);
