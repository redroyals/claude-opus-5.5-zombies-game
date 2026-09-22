// Writes assets/manifest.json (browser-side list of built assets) from the manifest + what exists on disk.
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from './asset-manifest.mjs';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const stats = fs.existsSync(`${ROOT}/assets/stats.json`) ? JSON.parse(fs.readFileSync(`${ROOT}/assets/stats.json`, 'utf8')) : {};
const gen = fs.existsSync(`${ROOT}/assets/gen-state.json`) ? JSON.parse(fs.readFileSync(`${ROOT}/assets/gen-state.json`, 'utf8')) : {};
const out = [];
for (const a of ALL) {
  const rel = `assets/${a.cat === 'kits' ? `kits/${a.map}` : a.cat}/${a.id}.glb`;
  const extra = a.src ? { src: a.src } : {};
  if (!fs.existsSync(path.join(ROOT, rel))) continue;
  out.push({ id: a.id, cat: a.cat, map: a.map, name: a.name ?? a.id, size: a.size, url: rel, lod1: fs.existsSync(path.join(ROOT, rel.replace('.glb', '.lod1.glb'))) ? rel.replace('.glb', '.lod1.glb') : null, stats: stats[a.id] ?? null, method: gen[a.id]?.method ?? a.src ?? null, ...extra });
}
// Blender-built kit pieces (no Meshy): assets/kits/<map|common>/*.glb listed in assets/blender-kit.json
const bk = `${ROOT}/assets/blender-kit.json`;
if (fs.existsSync(bk)) for (const p of JSON.parse(fs.readFileSync(bk, 'utf8'))) out.push(p);
fs.writeFileSync(`${ROOT}/assets/manifest.json`, JSON.stringify(out, null, 1));
console.log('manifest', out.length);
