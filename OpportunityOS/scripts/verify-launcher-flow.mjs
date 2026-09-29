import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const excludedNames = new Set(['node_modules', 'dist', '.git']);

const walk = directory => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (excludedNames.has(entry.name) || entry.name.startsWith('.tmp'))) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else files.push(absolute);
  }
  return files;
};

const files = walk(root);
const legacyFiles = files.filter(file => ['.vbs', '.hta'].includes(path.extname(file).toLowerCase()));
if (legacyFiles.length) errors.push(`Legacy HTA/VBS files remain: ${legacyFiles.map(file => path.relative(root, file)).join(', ')}`);

for (const file of files.filter(file => file !== fileURLToPath(import.meta.url) && ['.bat', '.cmd', '.ps1', '.mjs'].includes(path.extname(file).toLowerCase()))) {
  const text = fs.readFileSync(file, 'utf8');
  if (/\bwscript(?:\.exe)?\b|\bcscript(?:\.exe)?\b|\bmshta(?:\.exe)?\b|New-Object\s+-ComObject\s+WScript\.Shell/i.test(text)) {
    errors.push(`Windows Script Host reference remains in ${path.relative(root, file)}.`);
  }
  if (/-ExecutionPolicy\s+Bypass/i.test(text)) {
    errors.push(`ExecutionPolicy bypass remains in ${path.relative(root, file)}.`);
  }
}

const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const engine = read('engine_opportunityos.bat');
const closer = read('CLOSE_OPPORTUNITYOS.bat');
const sourceHelper = read(path.join('scripts', 'install-source-mode.mjs'));
const serviceStarter = read(path.join('scripts', 'start-local-services.mjs'));
const serviceStopper = read(path.join('scripts', 'stop-local-services.mjs'));
const publisher = read(path.join('scripts', 'publish-update.ps1'));
const automaticUpdater = read(path.join('scripts', 'check-for-update.ps1'));
const manualUpdater = read(path.join('scripts', 'install-update-v2.ps1'));
const vite = read('vite.config.ts');
const server = read(path.join('server', 'config.ts'));
const requireCheck = (condition, message) => { if (!condition) errors.push(message); };

requireCheck(/install-source-mode\.mjs" "%PROJECT_ROOT%"/i.test(engine), 'Engine does not pass a normalized source root.');
requireCheck(!/install-source-mode\.mjs[^\r\n]*-Phase/i.test(engine), 'Engine still passes the removed Phase parameter.');
requireCheck(/if exist "%PROJECT_ROOT%\\scripts\\install-source-mode\.mjs" set "SOURCE_MODE=1"/i.test(engine), 'Engine does not identify a new source copy before inspecting old offline metadata.');
requireCheck(/--allow-stale-offline-manifest/i.test(engine) && /allowStaleOfflineManifest/.test(sourceHelper), 'Mixed old-package/source-copy migration is not enabled.');
requireCheck(/INSTALAR_OPPORTUNITYOS\.hta[\s\S]*OPEN_OPPORTUNITYOS\.vbs[\s\S]*scripts\\toggle-app-window\.ps1/i.test(engine), 'Known legacy Windows Script Host launchers are not cleaned from source overlays.');
requireCheck(engine.indexOf('set "SOURCE_MODE=1"') < engine.indexOf('scripts\\check-for-update.ps1'), 'Source-copy detection does not take precedence over stale update metadata.');
requireCheck(/excludedReleaseNames[^\r\n]*install-source-mode\.mjs/i.test(publisher), 'Official packages do not exclude the source-only preparation helper.');
requireCheck(/Remove-ObsoleteManagedFiles/.test(automaticUpdater) && /Remove-ObsoleteManagedFiles/.test(manualUpdater), 'An updater cannot remove managed files left by an older release.');
requireCheck(!/\[ValidateSet\([^\]]*Validate[^\]]*Dependencies/i.test(sourceHelper), 'Source helper still exposes the old Phase API.');
requireCheck(/\['ci', '--include=dev', '--no-audit', '--no-fund'\]/.test(sourceHelper), 'Source helper does not use deterministic npm ci arguments.');
requireCheck(/http:\/\/127\.0\.0\.1:3000/.test(engine) && /http:\/\/127\.0\.0\.1:3099\/health/.test(engine), 'Engine does not health-check both loopback services.');
requireCheck(/if not defined BROWSER_MODE set "BROWSER_MODE=TAB"/i.test(engine), 'Engine does not default to the reliable browser-tab mode.');
requireCheck(/Closing the previous Tender Control instance before restarting[^\r\n]*\r?\n\s*call "%PROJECT_ROOT%\\CLOSE_OPPORTUNITYOS\.bat" SILENT/i.test(engine), 'Healthy existing services are not closed before restart.');
requireCheck(/scripts\\start-local-services\.mjs" "%PROJECT_ROOT%" "%NODE_EXE%"/i.test(engine), 'Engine does not use the background service launcher.');
requireCheck(!/start "Tender Control (?:backend|frontend)" \/B/i.test(engine) && !/:monitor_services/i.test(engine), 'Engine still owns the service console lifetime.');
requireCheck(/detached:\s*true/.test(serviceStarter) && /windowsHide:\s*true/.test(serviceStarter) && /\.unref\(\)/.test(serviceStarter), 'Background services are not detached and hidden.');
requireCheck(/'--host',\s*'127\.0\.0\.1'/.test(serviceStarter) && /'--port',\s*'3000'/.test(serviceStarter), 'Background frontend launch is not restricted to 127.0.0.1:3000.');
requireCheck(/engine-processes\.json/.test(serviceStarter) && /backendPid/.test(serviceStarter) && /frontendPid/.test(serviceStarter), 'Background launcher does not persist scoped service PIDs.');
requireCheck(/scripts\\stop-local-services\.mjs/i.test(closer) && /engine-processes\.json/.test(serviceStopper), 'Safe close flow does not use the scoped background process record.');
requireCheck(/listeners\.get\(pid\)\s*!==\s*expectedPort/.test(serviceStopper) && !/taskkill[^\r\n]*\/IM\s+node/i.test(serviceStopper), 'Background close flow can terminate unscoped Node processes.');
requireCheck(/host:\s*'127\.0\.0\.1'/.test(vite) && /HOST\s*=\s*'127\.0\.0\.1'/.test(server), 'Frontend or backend binding is not restricted to 127.0.0.1.');

const lock = JSON.parse(read('package-lock.json'));
requireCheck(lock.lockfileVersion >= 2 && Boolean(lock.packages?.['']), 'package-lock.json is not suitable for npm ci.');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('[OK] Launcher flow is free of HTA/VBS/Windows Script Host dependencies.');
console.log('[OK] Source preparation is automatic and lockfile-driven.');
console.log('[OK] Old source overlays and managed offline updates have migration paths.');
console.log('[OK] Local services detach into hidden processes with scoped PID-based shutdown.');
console.log('[OK] Frontend and backend remain restricted to 127.0.0.1.');
