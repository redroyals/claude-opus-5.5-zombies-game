// Headless review contact sheet via Blender workbench renders (no browser needed).
//   node scripts/review-sheet.mjs out.png [--view 34|side|front] [--action walk --frame 0.5] a.glb b.glb ...
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
async function plain(f, dst) { // strip meshopt (Blender 4.0 importer can't read it)
  const d = await io.read(f);
  for (const e of d.getRoot().listExtensionsUsed()) if (/meshopt/.test(e.extensionName)) e.dispose();
  await d.transform(dequantize());
  fs.writeFileSync(dst, await io.writeBinary(d)); return dst;
}
const BLENDER = process.env.BLENDER ?? path.join(os.homedir(), 'opt/blender/blender');
const argv = process.argv.slice(2); const out = argv.shift();
const opts = []; const files = [];
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opts.push(argv[i], argv[++i]); else files.push(argv[i]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
const tiles = [];
for (const f of files) {
  const png = path.join(tmp, path.basename(f) + '.png');
  const log = execFileSync(BLENDER, ['-b', '--factory-startup', '-P', path.resolve('tools/blender/thumb.py'), '--', '--in', await plain(f, png.replace(/png$/, 'glb')), '--out', png, ...opts], { maxBuffer: 64e6 }).toString();
  const size = (log.match(/SIZE (\[.*?\])/) || [])[1] ?? '';
  const label = `${path.basename(f)} ${size} ${Math.round(fs.statSync(f).size / 1024)}KB`;
  const svg = Buffer.from(`<svg width="640" height="28"><rect width="640" height="28" fill="#000a"/><text x="6" y="20" font-size="16" fill="#fff" font-family="sans-serif">${label}</text></svg>`);
  tiles.push(await sharp(png).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer());
  console.log(label);
}
const cols = Math.min(4, tiles.length), rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: cols * 640, height: rows * 480, channels: 3, background: '#888' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 640, top: Math.floor(i / cols) * 480 }))).png().toFile(out);
console.log(out);
