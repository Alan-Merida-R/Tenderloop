import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyFileVerified, findDirByMarkerCandidates } from '../server/os/shell';

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
} finally {
  rmSync(root, { recursive: true, force: true });
}
