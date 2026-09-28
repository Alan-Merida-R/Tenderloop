import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyFileVerified, findDirByMarkerCandidates, findDirByMarkerScan, locateByMarker, recyclePath } from '../server/os/shell';

const root = mkdtempSync(path.join(os.tmpdir(), 'opportunityos-long-path-'));
try {
  let deep = root;
  while (deep.length < 280) deep = path.join(deep, 'revision-folder-1234567890');
  mkdirSync(deep, { recursive: true });
  const source = path.join(deep, 'template-source.docx');
  const target = path.join(deep, 'template-copy-R1.docx');
  const payload = Buffer.from('PK\u0003\u0004OpportunityOS long-path copy verification', 'utf8');
  writeFileSync(source, payload);
  copyFileVerified(source, target);
  assert.deepEqual(readFileSync(target), payload);
  console.log(`PASS long-path copy preserved ${payload.length} bytes at ${target.length} characters`);

  const marker = '.tenderloop_marker_test.tmp';
  const selected = path.join(root, 'selected', 'R1');
  const identical = path.join(root, 'identical-copy', 'R1');
  mkdirSync(selected, { recursive: true });
  mkdirSync(identical, { recursive: true });
  writeFileSync(path.join(selected, 'proposal.docx'), payload);
  writeFileSync(path.join(identical, 'proposal.docx'), payload);
  writeFileSync(path.join(selected, marker), 'marker');

  assert.equal(findDirByMarkerCandidates(marker, 'R1', [identical, selected]), selected);
  assert.equal(findDirByMarkerCandidates(marker, 'R0', [selected]), null);
  writeFileSync(path.join(identical, marker), 'stale duplicate');
  assert.equal(findDirByMarkerCandidates(marker, 'R1', [identical, selected]), null);
  console.log('PASS marker identity selects only the exact folder and rejects ambiguity');

  // A folder picked after one was already linked can have the same revision name,
  // be empty, be newly created (not indexed), and live several levels deeper.
  const scanRoot = path.join(root, 'scan-cases');
  const oldRoot = path.join(scanRoot, 'old-project', 'R0');
  const newRoot = path.join(scanRoot, 'new-project', 'level-1', 'level-2', 'R0');
  mkdirSync(oldRoot, { recursive: true });
  mkdirSync(newRoot, { recursive: true });
  const scanMarker = '.tenderloop_marker_empty_folder.tmp';
  writeFileSync(path.join(newRoot, scanMarker), 'marker');

  assert.equal(
    findDirByMarkerScan(scanMarker, 'R0', [scanRoot], 2000, 8),
    newRoot,
    'changing an existing R0 link must resolve the newly selected R0 folder',
  );
  assert.equal(
    findDirByMarkerScan(scanMarker, 'R0', [newRoot], 2000, 1),
    newRoot,
    'a selected root is itself a valid candidate',
  );
  assert.equal(findDirByMarkerScan(scanMarker, 'R1', [scanRoot], 2000, 8), null, 'folder name must match');
  assert.equal(findDirByMarkerScan('.missing-marker.tmp', 'R0', [scanRoot], 2000, 8), null, 'missing marker must not guess');
  assert.equal(findDirByMarkerScan('bad/marker', 'R0', [scanRoot], 2000, 8), null, 'invalid marker is rejected');
  console.log('PASS marker scan resolves empty, new, nested and replacement folders without retaining the old path');

  const integrated = await locateByMarker(scanMarker, 'R0', [scanRoot]);
  assert.equal(integrated?.path, newRoot, 'the complete locator must reach the marker-scan fallback');
  assert.ok(integrated?.searchedRoot, 'the complete locator reports how it found the folder');
  console.log(`PASS complete locator resolves an unindexed replacement folder via ${integrated?.searchedRoot}`);

  // Template creation can link either the whole generated folder or a revision
  // subfolder. Both must resolve before Windows Search has indexed them.
  const templateRoot = path.join(scanRoot, 'template-output', 'Opportunity Alpha');
  const revisionRoot = path.join(templateRoot, 'R0.1');
  mkdirSync(revisionRoot, { recursive: true });
  const templateMarker = '.tenderloop_marker_template.tmp';
  writeFileSync(path.join(templateRoot, templateMarker), 'marker');
  assert.equal(findDirByMarkerScan(templateMarker, 'Opportunity Alpha', [scanRoot], 2000, 8), templateRoot);
  rmSync(path.join(templateRoot, templateMarker));
  writeFileSync(path.join(revisionRoot, templateMarker), 'marker');
  assert.equal(findDirByMarkerScan(templateMarker, 'R0.1', [scanRoot], 2000, 8), revisionRoot);
  console.log('PASS marker scan resolves whole-template roots and revision subfolders');

  // Defensive ambiguity check: even an impossible duplicate marker must never make
  // the helper choose one folder arbitrarily.
  const duplicateRoot = path.join(scanRoot, 'duplicate-marker', 'R0');
  mkdirSync(duplicateRoot, { recursive: true });
  writeFileSync(path.join(duplicateRoot, scanMarker), 'duplicate');
  assert.equal(
    findDirByMarkerScan(scanMarker, 'R0', [scanRoot], 2000, 8),
    null,
    'ambiguous marker copies must never select a folder',
  );
  console.log('PASS marker scan rejects ambiguous duplicates instead of choosing the wrong folder');

  await assert.rejects(
    recyclePath(path.parse(process.cwd()).root),
    /drive root/i,
    'the Recycle Bin helper must never accept a drive root',
  );
  await assert.rejects(
    recyclePath(path.join(root, 'does-not-exist.txt')),
    /does not exist/i,
    'a missing path must fail without attempting another deletion method',
  );
  console.log('PASS Recycle Bin safety rejects drive roots and missing paths without a permanent-delete fallback');
} finally {
  rmSync(root, { recursive: true, force: true });
}
