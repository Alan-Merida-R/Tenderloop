import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();

try {
  const requestedRoot = process.argv[2];
  if (!requestedRoot) throw new Error('ProjectRoot was not supplied by CLOSE_OPPORTUNITYOS.bat.');
  if (!process.env.APPDATA) throw new Error('Windows APPDATA is not available.');

  const statePath = path.join(process.env.APPDATA, 'OpportunityOS', 'engine-processes.json');
  if (!fs.statSync(statePath, { throwIfNoEntry: false })?.isFile()) process.exit(0);

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
  if (state.schema !== 1 || typeof state.root !== 'string' || !state.root || normalize(state.root) !== normalize(requestedRoot)) {
    console.warn('[WARN] The saved Tender Control process record belongs to another folder and was not used.');
    process.exit(0);
  }

  const netstat = execFileSync('netstat.exe', ['-aon'], { encoding: 'utf8', windowsHide: true });
  const listeners = new Map();
  for (const line of netstat.split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+\S+:(3000|3099)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (match) listeners.set(Number(match[2]), Number(match[1]));
  }

  const recordedServices = [
    { pid: Number(state.frontendPid), expectedPort: 3000 },
    { pid: Number(state.backendPid), expectedPort: 3099 },
  ];
  for (const { pid, expectedPort } of recordedServices) {
    if (!Number.isSafeInteger(pid) || pid <= 0 || listeners.get(pid) !== expectedPort) continue;
    try {
      process.kill(pid);
      console.log(`[OK] Closed Tender Control local process ${pid} on port ${expectedPort}.`);
    } catch (error) {
      console.warn(`[WARN] Could not close Tender Control process ${pid}: ${error.message}`);
    }
  }

  fs.rmSync(statePath, { force: true });
} catch (error) {
  console.warn(`[WARN] Saved Tender Control processes could not be closed: ${error.message}`);
  process.exitCode = 1;
}
