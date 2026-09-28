import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const fail = message => { throw new Error(message); };
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

try {
  const requestedRoot = process.argv[2];
  if (!requestedRoot) fail('ProjectRoot was not supplied by engine_opportunityos.bat.');
  const root = fs.realpathSync(requestedRoot);
  const manifestPath = path.join(root, 'offline-runtime.json');
  const releaseManifestPath = path.join(root, 'release-manifest.json');
  if (!fs.statSync(manifestPath, { throwIfNoEntry: false })?.isFile()) fail('offline-runtime.json is missing.');
  if (!fs.statSync(releaseManifestPath, { throwIfNoEntry: false })?.isFile()) fail('release-manifest.json is missing.');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  if (manifest.schema !== 1 || manifest.noNetworkInstallation !== true) fail('The offline runtime manifest is invalid.');
  if (manifest.nodeArchitecture !== 'x64') fail('This Tender Control package does not contain the required x64 runtime.');
  if (manifest.frontendHost !== '127.0.0.1' || manifest.backendHost !== '127.0.0.1') fail('The package is not restricted to the local computer.');

  const release = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8').replace(/^\uFEFF/, ''));
  if (release.schema !== 2 || String(release.version) !== String(manifest.releaseVersion)) fail('The release integrity manifest is invalid.');
  if (!Array.isArray(release.fileHashes) || !release.fileHashes.length || release.fileHashes.length !== release.managedFiles?.length) fail('The release integrity manifest is incomplete.');

  let checked = 0;
  const rootPrefix = `${path.resolve(root).toLowerCase()}${path.sep}`;
  for (const entry of release.fileHashes) {
    const relative = String(entry.path || '');
    const expected = String(entry.sha256 || '');
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..') || !/^[0-9a-f]{64}$/i.test(expected)) fail('The release integrity manifest contains an unsafe entry.');
    const candidate = path.resolve(root, relative);
    if (!candidate.toLowerCase().startsWith(rootPrefix) || !fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) fail(`The offline package is missing a managed file: ${relative}`);
    if (hashFile(candidate).toLowerCase() !== expected.toLowerCase()) fail(`A packaged file failed its SHA-256 integrity check: ${relative}`);
    checked += 1;
    if (checked % 1000 === 0) console.log(`[INFO] Verified ${checked} packaged files...`);
  }

  const requiredFiles = [
    'engine_opportunityos.bat', '_open_browser.bat', 'CLOSE_OPPORTUNITYOS.bat',
    'DESINSTALAR_OPPORTUNITYOS.bat', 'runtime\\node.exe', 'package-lock.json',
    'dist\\index.html', 'server\\index.ts', 'node_modules\\tsx\\dist\\cli.mjs',
    'node_modules\\vite\\bin\\vite.js', 'scripts\\uninstall-opportunityos.ps1',
  ];
  for (const relative of requiredFiles) {
    if (!fs.statSync(path.join(root, relative), { throwIfNoEntry: false })?.isFile()) fail(`The offline package is incomplete: ${relative}`);
  }

  const runtimePath = path.join(root, 'runtime', 'node.exe');
  if (hashFile(runtimePath).toLowerCase() !== String(manifest.nodeSha256).toLowerCase()) fail('The packaged Node.js runtime failed its SHA-256 integrity check.');
  if (hashFile(path.join(root, 'package-lock.json')).toLowerCase() !== String(manifest.packageLockSha256).toLowerCase()) fail('package-lock.json failed its SHA-256 integrity check.');
  const versionResult = spawnSync(runtimePath, ['--version'], { encoding: 'utf8' });
  if (versionResult.error || versionResult.status !== 0 || !versionResult.stdout.trim()) fail('The packaged Node.js runtime could not start.');

  console.log(`[OK] Offline runtime ${manifest.nodeVersion} verified.`);
  console.log(`[OK] ${checked} packaged files passed SHA-256 integrity checks.`);
  console.log('[OK] Installation requires no npm access and both services are restricted to 127.0.0.1.');
} catch (error) {
  console.error(`[ERROR] Offline package verification failed: ${error.message}`);
  process.exit(1);
}
