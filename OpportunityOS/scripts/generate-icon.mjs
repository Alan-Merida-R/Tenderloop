// Regenerates the app icon from the single vector source of truth
// (public/icon.svg) into every raster form the app needs:
//   - public/icon.png      1024x1024, used by the PWA manifest
//   - opportunityos.ico    multi-resolution .ico for shortcuts/taskbar/installer
// Run with: node scripts/generate-icon.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(import.meta.dirname, '..');
const svgPath = path.join(root, 'public', 'icon.svg');
const pngOutPath = path.join(root, 'public', 'icon.png');
const icoOutPath = path.join(root, 'opportunityos.ico');

// Windows Explorer/taskbar picks the closest of these instead of scaling
// a single large PNG, which is what kept the old icon blurry at small sizes.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const svg = await readFile(svgPath);

const pngBuffers = await Promise.all(
  ICO_SIZES.map(size => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer())
);
const icoBuffer = await pngToIco(pngBuffers);
await writeFile(icoOutPath, icoBuffer);
console.log(`[icon] Wrote ${icoOutPath} (${ICO_SIZES.join(', ')}px)`);

const manifestPng = await sharp(svg, { density: 384 }).resize(1024, 1024).png().toBuffer();
await writeFile(pngOutPath, manifestPng);
console.log(`[icon] Wrote ${pngOutPath} (1024x1024)`);
