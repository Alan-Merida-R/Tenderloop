/**
 * Checks for the Scope at-a-glance readers (services/scopeSummary.ts).
 *
 * These rules are shared by the Scope quick view and the proposal cards, so a change that
 * makes one of them read a SOW differently is a change to BOTH surfaces. The legacy cases
 * matter most: SOWs filled in before the Scope catalog existed only ever set platform_* /
 * flow_B008, and a card that showed nothing for them would look like lost data.
 *
 * No test runner on purpose — same plain-assertion style as verify-folder-persistence.ts.
 */

import assert from 'node:assert/strict';
import type { MeetingNote } from '../src/types';
import { readScopeGlance, formatScopeGlance, matchesScopeGlanceFilters } from '../src/services/scopeSummary';
import { DEFAULT_SCOPE_CATALOG, catalogContainsLabel, migrateLegacyScopeCatalog } from '../src/components/scopeCatalog';

let passed = 0;
const test = (name: string, fn: () => void) => {
    try { fn(); passed += 1; console.log('  PASS ', name); }
    catch (err: any) { console.log('  FAIL ', name, '\n        ', err.message.split('\n')[0]); }
};

const sow = (fields: Record<string, any>): MeetingNote[] => ([{
    id: 'n1', title: 'SOW', date: '2026-08-23', type: 'General',
    content: JSON.stringify({ fields }), attendees: '', format: 'sow',
} as any]);

test('modern answers: scope + systems, Safety products and applications', () => {
    const glance = readScopeGlance(sow({
        scope_types: ['Upgrade', 'Migration', 'CF'],
        sow_systems: ['EAE', 'Safety'],
        triconex_products: ['Tricon CX'],
        safety_applications: ['SIS/ESD'],
    }));
    assert.deepEqual(glance.scope, ['Upgrade', 'Migration', 'CF']);
    assert.deepEqual(glance.systems, ['EAE', 'Safety', 'Tricon CX']);
    assert.deepEqual(glance.applications, ['SIS/ESD']);
    assert.equal(formatScopeGlance(glance), 'Upgrade, Migration and CF - EAE, Safety, Tricon CX, SIS/ESD');
});

test("the user's short example reads as expected", () => {
    const glance = readScopeGlance(sow({ scope_types: ['Green field'], sow_systems: ['Safety'] }));
    assert.equal(formatScopeGlance(glance), 'Green field - Safety');
});

test('sub-modules of an UNSELECTED system are not shown', () => {
    const glance = readScopeGlance(sow({
        scope_types: ['Upgrade'],
        sow_systems: ['EAE'],
        safety_applications: ['SIS'],
    }));
    assert.deepEqual(glance.systems, ['EAE']);
});

test('legacy SOW (platform_* / flow_B008) still reads, never blank', () => {
    const glance = readScopeGlance(sow({ platform_triconex: true, flow_B008: ['Greenfield'] }));
    assert.deepEqual(glance.scope, ['Green field']);
    assert.deepEqual(glance.systems, ['Safety']);
});

test('legacy opp_type is used when flow_B008 is empty', () => {
    const glance = readScopeGlance(sow({ opp_type: 'Migration', platform_foxboro: true }));
    assert.deepEqual(glance.scope, ['Migration']);
    assert.deepEqual(glance.systems, ['Foxboro']);
});

test('options the user deleted from the catalog are ignored, not rendered', () => {
    const glance = readScopeGlance(sow({ scope_types: ['Upgrade', 'Something Removed'] }));
    assert.deepEqual(glance.scope, ['Upgrade']);
});

test('no SOW note, empty SOW and malformed JSON all render nothing', () => {
    assert.equal(readScopeGlance(undefined).hasAny, false);
    assert.equal(readScopeGlance([]).hasAny, false);
    assert.equal(readScopeGlance(sow({})).hasAny, false);
    assert.equal(readScopeGlance([{ id: 'x', content: 'not json', format: 'sow' } as any]).hasAny, false);
});

test('a custom catalog drives the labels, not the defaults', () => {
    const catalog = {
        scope: [{ id: 'retrofit', label: 'Retrofit' }],
        systems: [{ id: 'custom', label: 'Custom PLC', children: [{ id: 'io', label: 'Remote IO' }] }],
        applications: [],
        quickNotes: [],
        extras: [],
    };
    const glance = readScopeGlance(
        sow({ scope_types: ['Retrofit', 'Upgrade'], sow_systems: ['Custom PLC'], sysmod_custom: ['Remote IO'] }),
        catalog,
    );
    assert.deepEqual(glance.scope, ['Retrofit']);          // 'Upgrade' is not in this catalog
    assert.deepEqual(glance.systems, ['Custom PLC', 'Remote IO']);
});

test('the SOW note holding answers wins over an empty duplicate', () => {
    const notes = [
        { id: 'empty', content: JSON.stringify({ fields: {} }), format: 'sow' },
        { id: 'filled', content: JSON.stringify({ fields: { scope_types: ['Parts'] } }), format: 'sow' },
    ] as any;
    assert.deepEqual(readScopeGlance(notes).scope, ['Parts']);
});

test('Extra Scope sub-modules saved by the SOW are included in the live scope', () => {
    const glance = readScopeGlance(sow({
        quick_notes: ['New Cabinets'],
        'qnmod_new-cabinets': ['Regional Integration', 'India Cabinets'],
    }));
    assert.deepEqual(glance.quickNotes, ['New Cabinets', 'Regional Integration', 'India Cabinets']);
});

test('legacy Triconex system name is presented as Safety', () => {
    const glance = readScopeGlance(sow({ sow_systems: ['Triconex'], triconex_products: ['Tricon CX'] }));
    assert.deepEqual(glance.systems, ['Safety', 'Tricon CX']);
});

test('legacy Modicon 580 Safety moves below Safety as M580 S', () => {
    const glance = readScopeGlance(sow({ sow_systems: ['Modicon 580 Safety'] }));
    assert.deepEqual(glance.systems, ['Safety', 'M580 S']);
});

test('legacy cached Dashboard glance without applications remains renderable', () => {
    const legacyGlance = { scope: ['Upgrade'], systems: ['Foxboro'], quickNotes: [], extras: [], hasAny: true } as any;
    assert.equal(formatScopeGlance(legacyGlance), 'Upgrade - Foxboro');
});

test('migration replaces every legacy Triconex child with the exact technology list', () => {
    const catalog = structuredClone(DEFAULT_SCOPE_CATALOG);
    const safety = catalog.systems.find(option => option.id === 'triconex')!;
    safety.label = 'Triconex';
    safety.children = [
        { id: 'legacy-cx', label: 'Tricon CX' },
        { id: 'legacy-sis', label: 'SIS' },
        { id: 'legacy-spe', label: 'SPE' },
        { id: 'legacy-runtime', label: 'Run time' },
    ];
    const migrated = migrateLegacyScopeCatalog(catalog);
    const migratedSafety = migrated.systems.find(option => option.id === 'triconex')!;
    assert.equal(migratedSafety.label, 'Safety');
    assert.deepEqual(migratedSafety.children?.map(child => child.label), ['Tricon CX', 'Tricon', 'Trident', 'TriGP', 'M580 S']);
});

test('migration recognizes edited Safety ids and removes duplicate legacy rows', () => {
    const catalog = structuredClone(DEFAULT_SCOPE_CATALOG);
    const safetyIndex = catalog.systems.findIndex(option => option.id === 'triconex');
    catalog.systems[safetyIndex] = {
        id: 'opt-user-generated', label: 'Safety', children: [{ id: 'old-sis', label: 'SIS' }],
    };
    catalog.systems.push({ id: 'old-triconex-copy', label: 'Triconex', children: [{ id: 'old-spe', label: 'SPE' }] });
    const migrated = migrateLegacyScopeCatalog(catalog);
    const safetyRows = migrated.systems.filter(option => option.id === 'triconex' || /^(safety|triconex)$/i.test(option.label));
    assert.equal(safetyRows.length, 1);
    assert.equal(safetyRows[0].id, 'triconex');
    assert.equal(safetyRows[0].label, 'Safety');
    assert.deepEqual(safetyRows[0].children?.map(child => child.label), ['Tricon CX', 'Tricon', 'Trident', 'TriGP', 'M580 S']);
});

test('migration adds HIPPS to existing Safety application catalogs', () => {
    const catalog = structuredClone(DEFAULT_SCOPE_CATALOG);
    catalog.applications = catalog.applications.filter(option => option.id !== 'hipps');
    const migrated = migrateLegacyScopeCatalog(catalog);
    assert.deepEqual(migrated.applications.map(option => option.label), ['SIS/ESD', 'BMS', 'TMC', 'SF&G', 'HIPPS']);
});

test('legacy Triconex labels are catalog aliases instead of unmatched extras', () => {
    assert.equal(catalogContainsLabel(DEFAULT_SCOPE_CATALOG, 'Triconex'), true);
    const glance = readScopeGlance(sow({}), DEFAULT_SCOPE_CATALOG, [{ id: 'legacy', text: 'Triconex', color: '#000000' }]);
    assert.deepEqual(glance.systems, ['Safety']);
    assert.deepEqual(glance.extras, []);
});

test('current SOW system overrides a contradictory historical opportunity label', () => {
    const glance = readScopeGlance(
        sow({ sow_systems: ['Safety'] }),
        DEFAULT_SCOPE_CATALOG,
        [{ id: 'legacy-foxboro', text: 'Foxboro', color: '#000000' }],
    );
    assert.deepEqual(glance.systems, ['Safety']);
    assert.equal(glance.systems.includes('Foxboro'), false);
});

test('scope filters use OR inside categories and AND between categories', () => {
    const migrationSafety = readScopeGlance(sow({ scope_types: ['Migration'], sow_systems: ['Safety'], execution_center: 'Mexico' }));
    const upgradeFoxboro = readScopeGlance(sow({ scope_types: ['Upgrade'], sow_systems: ['Foxboro'], execution_center: 'Mexico' }));
    const partsSafety = readScopeGlance(sow({ scope_types: ['Parts'], sow_systems: ['Safety'], execution_center: 'Mexico' }));
    const usaMigration = readScopeGlance(sow({ scope_types: ['Migration'], sow_systems: ['Safety'], execution_center: 'USA' }));
    const filters = { scope: ['Migration', 'Upgrade'], systems: ['Foxboro', 'Safety'], executionCenters: ['Mexico'] };
    assert.equal(matchesScopeGlanceFilters(migrationSafety, filters), true);
    assert.equal(matchesScopeGlanceFilters(upgradeFoxboro, filters), true);
    assert.equal(matchesScopeGlanceFilters(partsSafety, filters), false);
    assert.equal(matchesScopeGlanceFilters(usaMigration, filters), false);
});

test('every Scope filter section is independently required', () => {
    const glance = readScopeGlance(sow({
        scope_types: ['Migration'],
        sow_systems: ['Safety'],
        safety_applications: ['SIS/ESD'],
        execution_center: 'Mexico',
        quick_notes: ['New Cabinets'],
        scope_extras: ['Similar/Copy'],
    }));
    const filters = {
        scope: ['Upgrade', 'Migration'],
        systems: ['Foxboro', 'Safety'],
        applications: ['BMS', 'SIS/ESD'],
        executionCenters: ['Canada', 'Mexico'],
        quickNotes: ['Resales <20%', 'New Cabinets'],
        extras: ['Split', 'Similar/Copy'],
    };
    assert.equal(matchesScopeGlanceFilters(glance, filters), true);
    (Object.keys(filters) as Array<keyof typeof filters>).forEach(category => {
        assert.equal(matchesScopeGlanceFilters({ ...glance, [category]: [] }, filters), false, `${category} must be required`);
    });
});

console.log(`\n${passed}/20 scope checks passed`);
if (passed !== 20) process.exit(1);
