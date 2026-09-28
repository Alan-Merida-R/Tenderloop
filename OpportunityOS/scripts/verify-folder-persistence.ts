/**
 * Executable checks for the folder-link persistence rules.
 *
 * Run with:  npx tsx scripts/verify-folder-persistence.ts
 *
 * These cover the behaviour that was actually broken and reported:
 *   - a folder link must survive a new revision and a different browser
 *   - quick-access pins must not be dropped
 *   - an attachment must follow a rename, come back after a restore, and never be
 *     deleted just because the file went missing
 *
 * No test runner is used on purpose — the project has none, and these need nothing
 * beyond plain assertions against pure functions plus a stub bridge.
 */

import assert from 'node:assert/strict';
import type { Opportunity, FolderDocRecord } from '../src/types';
import { resolveFolderPathFromDb, listInheritableFolderPaths } from '../src/services/opportunityFolderLink';
import {
  reconcileDirectory,
  registerOpportunityFolderBridge,
  listPins,
  addPinRecord,
  removePinRecord,
  inheritPins,
  upsertDoc,
  getDoc,
  rebindDoc,
  deleteDoc,
  listDocsForTask,
  setFolderPath,
  mergeFolderPaths,
} from '../src/services/opportunityFolderStore';
import { buildAbsolutePath, normalizeWindowsPath, relativeFromAbsolute } from '../src/features/opportunity-folder/fileOps';
import { computeExplorerSelection } from '../src/features/opportunity-folder/selectionUtils';

let passed = 0;
const results: string[] = [];

const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed += 1;
    results.push(`  PASS  ${name}`);
  } catch (err: any) {
    results.push(`  FAIL  ${name}\n        ${err?.message?.split('\n').join('\n        ')}`);
    process.exitCode = 1;
  }
};

// ---------------------------------------------------------------------------
// Path resolution / inheritance
// ---------------------------------------------------------------------------

test('path: exact revision wins', () => {
  assert.equal(resolveFolderPathFromDb({ R0: 'C:\\a', R1: 'C:\\b' }, 'R1'), 'C:\\b');
});

test('path: legacy unkeyed path is used when NO revision owns a folder', () => {
  assert.equal(resolveFolderPathFromDb({ '': 'C:\\legacy' }, 'R2'), 'C:\\legacy');
});

// The unkeyed entry means "this opportunity has one folder". Once a revision owns a
// folder of its own that is no longer true, and treating the unkeyed path as a
// fallback would auto-link every later revision to the oldest folder.
test('path: the legacy unkeyed path stops being inherited once a revision owns a folder', () => {
  assert.equal(resolveFolderPathFromDb({ '': 'C:\\legacy', R0: 'C:\\a' }, 'R2'), '');
  assert.equal(resolveFolderPathFromDb({ '': 'C:\\legacy', R0: 'C:\\a' }, 'R0'), 'C:\\a');
});

// Previously a new revision silently adopted the most recently recorded path. That is
// what linked a brand-new revision — and an SR import landing on an existing
// opportunity — to the wrong folder before the user had chosen between a template and
// an existing folder. Reuse is now offered explicitly instead of guessed.
test('path: a NEW revision does NOT inherit another revision path', () => {
  assert.equal(resolveFolderPathFromDb({ R0: 'C:\\a', R1: 'C:\\b' }, 'R2'), '');
});

test('path: an unrevisioned opportunity does not adopt a revision folder either', () => {
  assert.equal(resolveFolderPathFromDb({ R0: 'C:\\a' }, ''), '');
});

test('path: reuse candidates are offered, newest first, excluding the current revision', () => {
  assert.deepEqual(
    listInheritableFolderPaths({ R0: 'C:\\a', R1: 'C:\\b', R2: 'C:\\c' }, 'R2'),
    [{ revision: 'R1', path: 'C:\\b' }, { revision: 'R0', path: 'C:\\a' }],
  );
});

test('path: reuse candidates ignore the legacy unkeyed entry and empty values', () => {
  assert.deepEqual(listInheritableFolderPaths({ '': 'C:\\legacy', R0: '' }, 'R1'), []);
  assert.deepEqual(listInheritableFolderPaths(undefined, 'R1'), []);
});

test('path: empty input resolves to empty, never throws', () => {
  assert.equal(resolveFolderPathFromDb(undefined, 'R0'), '');
  assert.equal(resolveFolderPathFromDb({}, 'R0'), '');
});

// ---------------------------------------------------------------------------
// Explorer-style Ctrl/Shift selection
// ---------------------------------------------------------------------------

const selection = (
  selected: string[],
  clickedKey: string,
  options: { active?: string | null; anchor?: string | null; ctrl?: boolean; shift?: boolean } = {},
) => computeExplorerSelection({
  orderedKeys: ['A', 'B', 'C', 'D', 'E'],
  selectedKeys: new Set(selected),
  activeKey: options.active ?? selected.at(-1) ?? null,
  anchorKey: options.anchor ?? selected[0] ?? null,
  clickedKey,
  ctrlOrMeta: !!options.ctrl,
  shift: !!options.shift,
});

test('selection: Ctrl+click adds a file and makes it active', () => {
  const result = selection(['A'], 'C', { active: 'A', anchor: 'A', ctrl: true });
  assert.deepEqual([...result.selectedKeys], ['A', 'C']);
  assert.equal(result.activeKey, 'C');
  assert.equal(result.anchorKey, 'C');
});

test('selection: Ctrl+click removes the active file and activates a remaining selection', () => {
  const result = selection(['A', 'C'], 'C', { active: 'C', anchor: 'C', ctrl: true });
  assert.deepEqual([...result.selectedKeys], ['A']);
  assert.equal(result.activeKey, 'A');
});

test('selection: Ctrl+click removes a non-active file without changing the active file', () => {
  const result = selection(['A', 'C'], 'A', { active: 'C', anchor: 'C', ctrl: true });
  assert.deepEqual([...result.selectedKeys], ['C']);
  assert.equal(result.activeKey, 'C');
});

test('selection: Ctrl+click on the last file leaves no ghost active selection', () => {
  const result = selection(['B'], 'B', { active: 'B', anchor: 'B', ctrl: true });
  assert.equal(result.selectedKeys.size, 0);
  assert.equal(result.activeKey, null);
  assert.equal(result.anchorKey, 'B');
});

test('selection: plain click replaces a previous multi-selection', () => {
  const result = selection(['A', 'C'], 'E');
  assert.deepEqual([...result.selectedKeys], ['E']);
  assert.equal(result.activeKey, 'E');
  assert.equal(result.anchorKey, 'E');
});

test('selection: Shift+click selects the contiguous anchor range', () => {
  const result = selection(['B'], 'E', { active: 'B', anchor: 'B', shift: true });
  assert.deepEqual([...result.selectedKeys], ['B', 'C', 'D', 'E']);
  assert.equal(result.activeKey, 'E');
  assert.equal(result.anchorKey, 'B');
});

test('selection: Ctrl+Shift+click adds a range without dropping prior selections', () => {
  const result = selection(['A', 'C'], 'E', { active: 'A', anchor: 'C', ctrl: true, shift: true });
  assert.deepEqual([...result.selectedKeys], ['A', 'C', 'D', 'E']);
  assert.equal(result.activeKey, 'E');
});

test('selection: stale keys from another folder are pruned before Ctrl+click', () => {
  const result = selection(['OLD/FOLDER', 'B'], 'D', { active: 'OLD/FOLDER', anchor: 'OLD/FOLDER', ctrl: true });
  assert.deepEqual([...result.selectedKeys], ['B', 'D']);
  assert.equal(result.activeKey, 'D');
  assert.equal(result.anchorKey, 'D');
});

// ---------------------------------------------------------------------------
// Document reconciliation
// ---------------------------------------------------------------------------

const doc = (over: Partial<FolderDocRecord> = {}): FolderDocRecord => ({
  id: 'doc-1',
  fileKey: 'Proposal.docx',
  name: 'Proposal.docx',
  linkedTaskIds: ['task-1'],
  linkedNoteIds: [],
  size: 1024,
  mtime: 1_700_000_000_000,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

test('reconcile: a present file clears a stale missing flag', () => {
  const before = [doc({ missingSince: '2026-02-01T00:00:00.000Z' })];
  const { docs, changed } = reconcileDirectory(before, '', [
    { fileKey: 'Proposal.docx', name: 'Proposal.docx', size: 1024, mtime: 1_700_000_000_000 },
  ]);
  assert.equal(changed, true);
  assert.equal(docs[0].missingSince, null);
  assert.deepEqual(docs[0].linkedTaskIds, ['task-1']);
});

test('reconcile: an unchanged listing is a no-op (no pointless DB write)', () => {
  const before = [doc({ missingSince: null })];
  const { changed } = reconcileDirectory(before, '', [
    { fileKey: 'Proposal.docx', name: 'Proposal.docx', size: 1024, mtime: 1_700_000_000_000 },
  ]);
  assert.equal(changed, false);
});

test('reconcile: a RENAMED file is followed and keeps its links', () => {
  const { docs, changed } = reconcileDirectory([doc()], '', [
    { fileKey: 'Proposal FINAL.docx', name: 'Proposal FINAL.docx', size: 1024, mtime: 1_700_000_000_000 },
  ]);
  assert.equal(changed, true);
  assert.equal(docs[0].fileKey, 'Proposal FINAL.docx');
  assert.equal(docs[0].name, 'Proposal FINAL.docx');
  assert.deepEqual(docs[0].previousKeys, ['Proposal.docx']);
  assert.deepEqual(docs[0].linkedTaskIds, ['task-1'], 'links must survive a rename');
  assert.equal(docs[0].missingSince, null);
});

test('reconcile: a DELETED file is flagged, never removed, and keeps its links', () => {
  const { docs, changed } = reconcileDirectory([doc()], '', []);
  assert.equal(changed, true);
  assert.equal(docs.length, 1, 'the record must not be deleted');
  assert.ok(docs[0].missingSince, 'it must be flagged as missing');
  assert.deepEqual(docs[0].linkedTaskIds, ['task-1'], 'links must survive the file disappearing');
});

test('reconcile: the missing timestamp is not rewritten on every listing', () => {
  const stamp = '2026-02-01T00:00:00.000Z';
  const { docs, changed } = reconcileDirectory([doc({ missingSince: stamp })], '', []);
  assert.equal(changed, false);
  assert.equal(docs[0].missingSince, stamp);
});

test('reconcile: a file RESTORED under an old name is re-attached', () => {
  // Renamed away earlier, then the original name comes back with different content.
  const gone = doc({
    fileKey: 'Proposal v2.docx',
    previousKeys: ['Proposal.docx'],
    missingSince: '2026-02-01T00:00:00.000Z',
  });
  const { docs, changed } = reconcileDirectory([gone], '', [
    { fileKey: 'Proposal.docx', name: 'Proposal.docx', size: 4096, mtime: 1_800_000_000_000 },
  ]);
  assert.equal(changed, true);
  assert.equal(docs[0].fileKey, 'Proposal.docx');
  assert.equal(docs[0].missingSince, null);
  assert.deepEqual(docs[0].linkedTaskIds, ['task-1']);
});

test('reconcile: records in OTHER directories are left alone', () => {
  const elsewhere = doc({ id: 'doc-2', fileKey: 'Costing/Sheet.xlsx', name: 'Sheet.xlsx' });
  const { docs } = reconcileDirectory([doc(), elsewhere], '', []);
  const untouched = docs.find(d => d.id === 'doc-2');
  assert.equal(untouched?.missingSince, undefined, 'a listing of "" must not judge Costing/');
});

test('reconcile: two files cannot both claim the same record', () => {
  const a = doc({ id: 'a', fileKey: 'A.docx', name: 'A.docx' });
  const b = doc({ id: 'b', fileKey: 'B.docx', name: 'B.docx', size: 2048, mtime: 1_700_000_000_001 });
  const { docs } = reconcileDirectory([a, b], '', [
    { fileKey: 'A renamed.docx', name: 'A renamed.docx', size: 1024, mtime: 1_700_000_000_000 },
    { fileKey: 'B renamed.docx', name: 'B renamed.docx', size: 2048, mtime: 1_700_000_000_001 },
  ]);
  assert.equal(docs.find(d => d.id === 'a')?.fileKey, 'A renamed.docx');
  assert.equal(docs.find(d => d.id === 'b')?.fileKey, 'B renamed.docx');
});

// ---------------------------------------------------------------------------
// Shared-DB store through a stub bridge
// ---------------------------------------------------------------------------

const baseOpp = (): Opportunity =>
  ({
    id: 'opp-1',
    revision: 'R1',
    folderDataMigrated: true, // skip the IndexedDB sweep; there is none in Node
  } as unknown as Opportunity);

/**
 * `commitMode: 'deferred'` mimics React: the mutation is queued and the bridge keeps
 * returning the OLD object until flush(). That is the case the write-through projection
 * exists for.
 */
const makeBridge = (commitMode: 'sync' | 'deferred') => {
  let opp = baseOpp();
  const queue: ((o: Opportunity) => Opportunity)[] = [];
  registerOpportunityFolderBridge({
    read: id => (id === opp.id ? opp : undefined),
    mutate: (id, mutator) => {
      if (id !== opp.id) return;
      if (commitMode === 'sync') opp = mutator(opp);
      else queue.push(mutator);
    },
  });
  return {
    flush: () => {
      while (queue.length) opp = queue.shift()!(opp);
    },
    current: () => opp,
  };
};

test('store: a saved doc is readable immediately, before React commits', () => {
  const bridge = makeBridge('deferred');
  upsertDoc('opp-1', 'Costing/Sheet.xlsx', { docType: 'Editable', linkedTaskIds: ['t1'] });
  const read = getDoc('opp-1', 'Costing/Sheet.xlsx');
  assert.equal(read?.docType, 'Editable', 'read-after-write must not return the pre-write value');
  bridge.flush();
  assert.equal(bridge.current().folderDocs?.length, 1, 'and it must still reach the database');
});

test('store: two writes in the same tick both survive', () => {
  const bridge = makeBridge('deferred');
  upsertDoc('opp-1', 'A.docx', { docType: 'Editable' });
  upsertDoc('opp-1', 'B.docx', { docType: 'Reference' });
  bridge.flush();
  assert.equal(bridge.current().folderDocs?.length, 2);
});

test('store: linking is per task and only an explicit delete removes a record', () => {
  const bridge = makeBridge('sync');
  upsertDoc('opp-1', 'A.docx', { linkedTaskIds: ['t1'] });
  assert.equal(listDocsForTask('opp-1', 't1').length, 1);
  const id = getDoc('opp-1', 'A.docx')!.id;
  deleteDoc('opp-1', id);
  assert.equal(bridge.current().folderDocs?.length, 0);
});

test('store: rebinding keeps one record and remembers the old path', () => {
  makeBridge('sync');
  upsertDoc('opp-1', 'A.docx', { linkedTaskIds: ['t1'] });
  const id = getDoc('opp-1', 'A.docx')!.id;
  rebindDoc('opp-1', id, 'A renamed.docx');
  assert.equal(getDoc('opp-1', 'A renamed.docx')?.id, id);
  assert.equal(getDoc('opp-1', 'A.docx')?.id, id, 'the old key must still resolve to it');
  assert.deepEqual(getDoc('opp-1', 'A renamed.docx')?.linkedTaskIds, ['t1']);
});

test('store: recording a path marks the folder linked and never blanks it', () => {
  const bridge = makeBridge('sync');
  setFolderPath('opp-1', 'R1', 'C:\\Projects\\Opp');
  assert.equal(bridge.current().folderPaths?.R1, 'C:\\Projects\\Opp');
  assert.equal(bridge.current().folderLinked, true);
  setFolderPath('opp-1', 'R1', '   '); // a failed auto-detect must be ignored
  assert.equal(bridge.current().folderPaths?.R1, 'C:\\Projects\\Opp');
});

test('store: changing the linked folder replaces the old path for that revision', () => {
  const bridge = makeBridge('sync');
  setFolderPath('opp-1', 'R1', 'C:\\Old Project\\R1');
  setFolderPath('opp-1', 'R1', 'G:\\Mi unidad\\New Project\\R1');
  assert.deepEqual(bridge.current().folderPaths, { R1: 'G:\\Mi unidad\\New Project\\R1' });
  assert.equal(resolveFolderPathFromDb(bridge.current().folderPaths, 'R1'), 'G:\\Mi unidad\\New Project\\R1');
});

test('store: changing one revision never changes another revision folder', () => {
  const bridge = makeBridge('sync');
  setFolderPath('opp-1', 'R0', 'C:\\Project\\R0');
  setFolderPath('opp-1', 'R1', 'C:\\Project\\R1-old');
  setFolderPath('opp-1', 'R1', 'D:\\Project Copy\\R1');
  assert.equal(bridge.current().folderPaths?.R0, 'C:\\Project\\R0');
  assert.equal(bridge.current().folderPaths?.R1, 'D:\\Project Copy\\R1');
});

test('store: template root and template revision paths persist exactly as selected', () => {
  const bridge = makeBridge('sync');
  setFolderPath('opp-1', 'R0', 'G:\\Bids\\Opportunity Alpha');
  setFolderPath('opp-1', 'R0.1', 'G:\\Bids\\Opportunity Alpha\\R0.1');
  assert.equal(resolveFolderPathFromDb(bridge.current().folderPaths, 'R0'), 'G:\\Bids\\Opportunity Alpha');
  assert.equal(resolveFolderPathFromDb(bridge.current().folderPaths, 'R0.1'), 'G:\\Bids\\Opportunity Alpha\\R0.1');
});

test('store: a path write does not clobber a pin written in the same tick', () => {
  const bridge = makeBridge('deferred');
  setFolderPath('opp-1', 'R1', 'C:\\Projects\\Opp');
  addPinRecord('opp-1', 'opp-1::R1', { key: 'Costing', name: 'Costing', kind: 'directory', relativePath: ['Costing'] });
  bridge.flush();
  assert.equal(bridge.current().folderPaths?.R1, 'C:\\Projects\\Opp');
  assert.equal(bridge.current().folderPins?.['opp-1::R1']?.length, 1);
});

test('store: legacy paths are imported additively into the shared database', () => {
  const bridge = makeBridge('sync');
  mergeFolderPaths('opp-1', { '': 'C:\\Legacy\\Opp', R0: 'C:\\Legacy\\Opp\\R0' });
  assert.equal(bridge.current().folderPaths?.[''], 'C:\\Legacy\\Opp');
  assert.equal(bridge.current().folderPaths?.R0, 'C:\\Legacy\\Opp\\R0');
  assert.equal(bridge.current().folderLinked, true);
});

test('store: legacy recovery never overwrites a newer database path', () => {
  const bridge = makeBridge('sync');
  setFolderPath('opp-1', 'R1', 'D:\\Current\\R1');
  mergeFolderPaths('opp-1', { R1: 'C:\\Old\\R1', R0: 'C:\\Old\\R0', R2: '   ' });
  assert.equal(bridge.current().folderPaths?.R1, 'D:\\Current\\R1');
  assert.equal(bridge.current().folderPaths?.R0, 'C:\\Old\\R0');
  assert.equal(bridge.current().folderPaths?.R2, undefined);
});

test('pins: add/remove round-trip and no duplicates', () => {
  makeBridge('sync');
  const key = 'opp-1::R1';
  addPinRecord('opp-1', key, { key: 'Costing', name: 'Costing', kind: 'directory', relativePath: ['Costing'] });
  addPinRecord('opp-1', key, { key: 'Costing', name: 'Costing', kind: 'directory', relativePath: ['Costing'] });
  assert.equal(listPins('opp-1', key).length, 1);
  removePinRecord('opp-1', key, 'Costing');
  assert.equal(listPins('opp-1', key).length, 0);
});

test('pins: a new revision inherits the previous revision pins', () => {
  makeBridge('sync');
  addPinRecord('opp-1', 'opp-1::R0', { key: 'Costing', name: 'Costing', kind: 'directory', relativePath: ['Costing'] });
  inheritPins('opp-1', 'opp-1::R0', 'opp-1::R1');
  assert.equal(listPins('opp-1', 'opp-1::R1').length, 1, 'quick links must not disappear on a new revision');
});

test('pins: inheriting never overwrites pins the revision already has', () => {
  makeBridge('sync');
  addPinRecord('opp-1', 'opp-1::R0', { key: 'Old', name: 'Old', kind: 'directory', relativePath: ['Old'] });
  addPinRecord('opp-1', 'opp-1::R1', { key: 'Mine', name: 'Mine', kind: 'directory', relativePath: ['Mine'] });
  inheritPins('opp-1', 'opp-1::R0', 'opp-1::R1');
  assert.deepEqual(listPins('opp-1', 'opp-1::R1').map(p => p.key), ['Mine']);
});

// ---------------------------------------------------------------------------
// Absolute paths of files selected in the Folder tab
// ---------------------------------------------------------------------------

test('paths: a selected file joins to exactly one backslash-separated path', () => {
  assert.equal(buildAbsolutePath('C:\\Bids\\ACME\\R1', ['Docs', 'Offer.docx']), 'C:\\Bids\\ACME\\R1\\Docs\\Offer.docx');
  assert.equal(buildAbsolutePath('C:\\Bids\\ACME\\R1\\', ['Offer.docx']), 'C:\\Bids\\ACME\\R1\\Offer.docx');
  assert.equal(buildAbsolutePath('C:/Bids/ACME/R1/', ['Offer.docx']), 'C:\\Bids\\ACME\\R1\\Offer.docx');
  assert.equal(buildAbsolutePath('  "C:\\Bids\\R1"  ', ['a.pdf']), 'C:\\Bids\\R1\\a.pdf');
  assert.equal(buildAbsolutePath('C:\\Bids\\\\R1', ['a.pdf']), 'C:\\Bids\\R1\\a.pdf');
});

test('paths: drive roots, Google Drive letters and UNC shares keep their shape', () => {
  assert.equal(buildAbsolutePath('G:', ['Mi unidad', 'a.xlsx']), 'G:\\Mi unidad\\a.xlsx');
  assert.equal(buildAbsolutePath('G:\\', ['a.xlsx']), 'G:\\a.xlsx');
  assert.equal(buildAbsolutePath('\\\\server\\share\\Bids', ['a.pdf']), '\\\\server\\share\\Bids\\a.pdf');
  assert.equal(normalizeWindowsPath('//server/share/Bids/'), '\\\\server\\share\\Bids');
});

test('paths: the folder itself has no trailing separator and a missing base is an error', () => {
  assert.equal(buildAbsolutePath('C:\\Bids\\R1\\', []), 'C:\\Bids\\R1');
  assert.throws(() => buildAbsolutePath('', ['a.pdf']), /Base path is not set/);
  assert.throws(() => buildAbsolutePath('   ', ['a.pdf']), /Base path is not set/);
});

test('paths: Go to path maps back to segments only inside the linked folder', () => {
  assert.deepEqual(relativeFromAbsolute('C:\\Bids\\R1', 'c:/bids/r1/Docs/Offer.docx'), ['Docs', 'Offer.docx']);
  assert.deepEqual(relativeFromAbsolute('C:\\Bids\\R1\\', 'C:\\Bids\\R1'), []);
  assert.deepEqual(relativeFromAbsolute('G:', 'G:\\Mi unidad\\x'), ['Mi unidad', 'x']);
  assert.equal(relativeFromAbsolute('C:\\Bids\\R1', 'C:\\Bids\\R10\\Offer.docx'), null, 'R10 is not inside R1');
  assert.equal(relativeFromAbsolute('C:\\Bids\\R1', 'D:\\Other'), null);
  assert.equal(relativeFromAbsolute('', 'C:\\Bids'), null);
});

test('paths: every selected path round-trips through build -> relative', () => {
  const bases = ['C:\\Bids\\ACME\\R1', 'G:\\', '\\\\srv\\share\\x', 'D:/tmp/'];
  const rels = [['a.pdf'], ['Sub dir', 'b (1).docx'], ['Ñandú', 'Año 2026', 'c.xlsx']];
  for (const base of bases) for (const rel of rels) {
    assert.deepEqual(relativeFromAbsolute(base, buildAbsolutePath(base, rel)), rel, `${base} + ${rel.join('/')}`);
  }
});

registerOpportunityFolderBridge(null);

console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} checks passed`);
