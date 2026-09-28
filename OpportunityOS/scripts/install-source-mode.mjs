import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let phase = 'validation';
let commandDescription = 'Node.js validation';

const fail = message => {
  const error = new Error(message);
  error.isExpected = true;
  throw error;
};

const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const walkFiles = directory => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolute) : [absolute];
  });
};

const inputFingerprint = root => {
  const candidates = [
    'package.json', 'package-lock.json', 'index.html', 'vite.config.ts',
    'tsconfig.json', 'tsconfig.node.json',
  ].map(relative => path.join(root, relative));
  candidates.push(...walkFiles(path.join(root, 'src')), ...walkFiles(path.join(root, 'public')));
  const lines = candidates.filter(fs.existsSync).map(file => {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    return `${relative}|${hashFile(file)}`;
  }).sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
};

const npmProcess = (args, root, stdio = 'inherit') => {
  const command = `npm.cmd ${args.join(' ')}`;
  commandDescription = command;
  if (process.platform !== 'win32') return spawnSync('npm', args, { cwd: root, stdio, encoding: 'utf8' });
  const commandShell = process.env.ComSpec || 'cmd.exe';
  return spawnSync(commandShell, ['/d', '/s', '/c', command], { cwd: root, stdio, encoding: 'utf8' });
};

const runNpm = (description, args, root) => {
  console.log(`[INFO] ${description}`);
  const result = npmProcess(args, root);
  if (result.error || result.status !== 0) {
    const exitCode = result.status ?? 'not started';
    fail(`${description} failed. Command: ${commandDescription}. Exit code: ${exitCode}. Check npm access and the messages above, then retry.`);
  }
};

try {
  const requestedRoot = process.argv[2];
  const allowStaleOfflineManifest = process.argv.includes('--allow-stale-offline-manifest');
  if (!requestedRoot) fail('ProjectRoot was not supplied by engine_opportunityos.bat.');
  const root = fs.realpathSync(requestedRoot);
  if (fs.existsSync(path.join(root, 'offline-runtime.json')) && !allowStaleOfflineManifest) fail('Source-copy setup is disabled for official offline packages.');
  if (allowStaleOfflineManifest) console.log('[INFO] Ignoring stale offline metadata because the source-only preparation helper is present.');
  for (const required of ['package.json', 'package-lock.json', 'engine_opportunityos.bat']) {
    if (!fs.statSync(path.join(root, required), { throwIfNoEntry: false })?.isFile()) fail(`The source copy is incomplete: ${required} is missing.`);
  }

  console.log(`[OK] Node.js ${process.version} detected.`);
  const npmVersionResult = npmProcess(['--version'], root, 'pipe');
  if (npmVersionResult.error || npmVersionResult.status !== 0) fail('npm.cmd was not found or could not start.');
  console.log(`[OK] npm ${npmVersionResult.stdout.trim()} detected.`);

  const lockPath = path.join(root, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (Number(lock.lockfileVersion) < 2 || !lock.packages?.['']) fail('package-lock.json is not a valid npm lockfile with a root package entry.');
  const lockHash = hashFile(lockPath);
  const dependencyStamp = path.join(root, 'node_modules', '.opportunityos-lock.sha256');
  let dependenciesReady = fs.existsSync(path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'))
    && fs.existsSync(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'))
    && fs.existsSync(dependencyStamp)
    && fs.readFileSync(dependencyStamp, 'utf8').trim() === lockHash;
  if (dependenciesReady) dependenciesReady = npmProcess(['ls', '--depth=0', '--include=dev'], root, 'ignore').status === 0;

  if (!dependenciesReady) {
    phase = 'dependency installation';
    runNpm('Installing exact application dependencies from package-lock.json...', ['ci', '--include=dev', '--no-audit', '--no-fund'], root);
    for (const required of [path.join('node_modules', 'tsx', 'dist', 'cli.mjs'), path.join('node_modules', 'vite', 'bin', 'vite.js')]) {
      if (!fs.existsSync(path.join(root, required))) fail(`Dependency installation completed but ${required} is missing.`);
    }
    fs.writeFileSync(dependencyStamp, `${lockHash}\n`, 'ascii');
    console.log('[OK] Dependencies installed reproducibly with npm ci.');
  } else {
    console.log('[OK] Dependencies match package-lock.json; npm ci is not needed.');
  }

  phase = 'production build';
  const buildHash = inputFingerprint(root);
  const buildStamp = path.join(root, 'dist', '.opportunityos-build.sha256');
  const buildReady = fs.existsSync(path.join(root, 'dist', 'index.html'))
    && fs.existsSync(buildStamp)
    && fs.readFileSync(buildStamp, 'utf8').trim() === buildHash;
  if (!buildReady) {
    runNpm('Building Tender Control production files...', ['run', 'build'], root);
    if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) fail('npm run build finished without creating dist\\index.html.');
    fs.writeFileSync(buildStamp, `${buildHash}\n`, 'ascii');
    console.log('[OK] Production build completed.');
  } else {
    console.log('[OK] Production build matches the current source; rebuild is not needed.');
  }
} catch (error) {
  console.error(`[ERROR] Source preparation failed during ${phase}.`);
  console.error(`[ERROR] Command: ${commandDescription}`);
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
}
