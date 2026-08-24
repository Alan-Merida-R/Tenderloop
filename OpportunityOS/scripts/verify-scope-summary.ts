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
import { readScopeGlance, formatScopeGlance } from '../src/services/scopeSummary';

let passed = 0;
const test = (name: string, fn: () => void) => {
    try { fn(); passed += 1; console.log('  PASS ', name); }
    catch (err: any) { console.log('  FAIL ', name, '\n        ', err.message.split('\n')[0]); }
};

const sow = (fields: Record<string, any>): MeetingNote[] => ([{
    id: 'n1', title: 'SOW', date: '2026-08-23', type: 'General',
    content: JSON.stringify({ fields }), attendees: '', format: 'sow',
} as any]);

test('modern answers: scope + systems with sub-modules flattened after their parent', () => {
    const glance = readScopeGlance(sow({
        scope_types: ['Upgrade', 'Migration', 'CF'],
        sow_systems: ['EAE', 'Triconex'],
        triconex_products: ['SIS', 'Tricon CX'],
    }));
    assert.deepEqual(glance.scope, ['Upgrade', 'Migration', 'CF']);
    // Sub-modules come out in CATALOG order (Tricon CX before SIS), which is the order the
    // Scope quick view lists them in — card and modal must read the same way.
    assert.deepEqual(glance.systems, ['EAE', 'Triconex', 'Tricon CX', 'SIS']);
    assert.equal(formatScopeGlance(glance), 'Upgrade, Migration and CF - EAE, Triconex, Tricon CX, SIS');
});

test("the user's short example reads as expected", () => {
    const glance = readScopeGlance(sow({ scope_types: ['Green field'], sow_systems: ['Triconex'] }));
    assert.equal(formatScopeGlance(glance), 'Green field - Triconex');
});

test('sub-modules of an UNSELECTED system are not shown', () => {
    const glance = readScopeGlance(sow({
        scope_types: ['Upgrade'],
        sow_systems: ['EAE'],
        triconex_products: ['SIS'],
    }));
    assert.deepEqual(glance.systems, ['EAE']);
});

test('legacy SOW (platform_* / flow_B008) still reads, never blank', () => {
    const glance = readScopeGlance(sow({ platform_triconex: true, flow_B008: ['Greenfield'] }));
    assert.deepEqual(glance.scope, ['Green field']);
    assert.deepEqual(glance.systems, ['Triconex']);
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

console.log(`\n${passed}/9 scope checks passed`);
if (passed !== 9) process.exit(1);
