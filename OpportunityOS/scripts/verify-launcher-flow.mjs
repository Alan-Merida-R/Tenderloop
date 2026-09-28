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
const sourceHelper = read(path.join('scripts', 'install-source-mode.mjs'));
const vite = read('vite.config.ts');
const server = read(path.join('server', 'config.ts'));
const requireCheck = (condition, message) => { if (!condition) errors.push(message); };

requireCheck(/install-source-mode\.mjs" "%PROJECT_ROOT%"/i.test(engine), 'Engine does not pass a normalized source root.');
requireCheck(!/install-source-mode\.mjs[^\r\n]*-Phase/i.test(engine), 'Engine still passes the removed Phase parameter.');
requireCheck(!/\[ValidateSet\([^\]]*Validate[^\]]*Dependencies/i.test(sourceHelper), 'Source helper still exposes the old Phase API.');
requireCheck(/\['ci', '--include=dev', '--no-audit', '--no-fund'\]/.test(sourceHelper), 'Source helper does not use deterministic npm ci arguments.');
requireCheck(/http:\/\/127\.0\.0\.1:3000/.test(engine) && /http:\/\/127\.0\.0\.1:3099\/health/.test(engine), 'Engine does not health-check both loopback services.');
requireCheck(/host:\s*'127\.0\.0\.1'/.test(vite) && /HOST\s*=\s*'127\.0\.0\.1'/.test(server), 'Frontend or backend binding is not restricted to 127.0.0.1.');

const lock = JSON.parse(read('package-lock.json'));
requireCheck(lock.lockfileVersion >= 2 && Boolean(lock.packages?.['']), 'package-lock.json is not suitable for npm ci.');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('[OK] Launcher flow is free of HTA/VBS/Windows Script Host dependencies.');
console.log('[OK] Source preparation is automatic and lockfile-driven.');
console.log('[OK] Frontend and backend remain restricted to 127.0.0.1.');
