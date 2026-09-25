import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyFileVerified } from '../server/os/shell';

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
} finally {
  rmSync(root, { recursive: true, force: true });
}
