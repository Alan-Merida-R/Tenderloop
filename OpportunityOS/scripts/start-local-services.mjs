import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const fail = message => { throw new Error(message); };

const waitForSpawn = (child, label) => new Promise((resolve, reject) => {
  child.once('spawn', resolve);
  child.once('error', error => reject(new Error(`${label} could not start: ${error.message}`)));
});

const stopStartedChild = child => {
  if (child?.pid && child.exitCode === null) {
    try { process.kill(child.pid); } catch { /* The process already stopped. */ }
  }
};

let backend;
let frontend;
let backendLog;
let frontendLog;

try {
  const requestedRoot = process.argv[2];
  const requestedNode = process.argv[3];
  if (!requestedRoot) fail('ProjectRoot was not supplied by engine_opportunityos.bat.');
  if (!requestedNode) fail('NodeExecutable was not supplied by engine_opportunityos.bat.');

  const root = fs.realpathSync(requestedRoot);
  const nodeExecutable = requestedNode.toLowerCase() === 'node.exe'
    ? process.execPath
    : fs.realpathSync(requestedNode);
  const appData = process.env.APPDATA;
  if (!appData) fail('Windows APPDATA is not available for process state and logs.');

  const requiredFiles = [
    path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    path.join(root, 'server', 'index.ts'),
    path.join(root, 'dist', 'index.html'),
  ];
  for (const required of requiredFiles) {
    if (!fs.statSync(required, { throwIfNoEntry: false })?.isFile()) {
      fail(`Required service file is missing: ${path.relative(root, required)}`);
    }
  }

  const stateDirectory = path.join(appData, 'OpportunityOS');
  const logDirectory = path.join(stateDirectory, 'logs');
  const statePath = path.join(stateDirectory, 'engine-processes.json');
  fs.mkdirSync(logDirectory, { recursive: true });

  const backendLogPath = path.join(logDirectory, 'backend.log');
  const frontendLogPath = path.join(logDirectory, 'frontend.log');
  backendLog = fs.openSync(backendLogPath, 'a');
  frontendLog = fs.openSync(frontendLogPath, 'a');
  const timestamp = new Date().toISOString();
  fs.writeSync(backendLog, `\n[${timestamp}] Starting Tender Control backend.\n`);
  fs.writeSync(frontendLog, `\n[${timestamp}] Starting Tender Control frontend.\n`);

  const commonOptions = {
    cwd: root,
    detached: true,
    windowsHide: true,
    env: { ...process.env, OPPORTUNITYOS_INSTALL_ROOT: root },
  };
  backend = spawn(nodeExecutable, ['--import', 'tsx', path.join(root, 'server', 'index.ts')], {
    ...commonOptions,
    stdio: ['ignore', backendLog, backendLog],
  });
  await waitForSpawn(backend, 'Backend');

  frontend = spawn(nodeExecutable, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview', '--host', '127.0.0.1', '--port', '3000', '--strictPort',
  ], {
    ...commonOptions,
    stdio: ['ignore', frontendLog, frontendLog],
  });
  await waitForSpawn(frontend, 'Frontend');

  const state = {
    schema: 1,
    root,
    startedAt: timestamp,
    backendPid: backend.pid,
    frontendPid: frontend.pid,
    backendLog: backendLogPath,
    frontendLog: frontendLogPath,
  };
  const temporaryStatePath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryStatePath, statePath);

  backend.unref();
  frontend.unref();
  console.log(`[OK] Local services started in the background. Logs: ${logDirectory}`);
} catch (error) {
  stopStartedChild(frontend);
  stopStartedChild(backend);
  console.error(`[ERROR] Local services could not be started: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (backendLog !== undefined) fs.closeSync(backendLog);
  if (frontendLog !== undefined) fs.closeSync(frontendLog);
}
