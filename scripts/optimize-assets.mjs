// Normalise + shrink raw Meshy GLBs into browser-ready assets.
//   node scripts/optimize-assets.mjs [--cat weapons] [--ids a,b]
// Per asset: bake node transforms, orient (see conventions), scale to manifest `size`, weld/simplify
// (meshoptimizer), WebP textures (resized), quantize + EXT_meshopt_compression, optional LOD1 (<id>.lod1.glb).
// KTX2 is not used: no toktx/basisu binary on this machine; WebP is the fallback (documented in assets/LOG.md).
// Conventions (metres, +Y up):
//   weapons/attachments: barrel/front along -Z, origin at the (heuristic) grip hand point; frames.json holds
//     grip/muzzle offsets relative to the ORIGINAL bbox so they can be hand-corrected.
//   characters: feet at y=0, centred on XZ, facing +Z, height = size.
//   kits/equipment: base at y=0, centred on XZ, longest dimension = size (kits: largest horizontal or height).
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, textureCompress, prune, flatten, join, quantize, meshopt, getBounds, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
const BLENDER = process.env.BLENDER ?? path.join(os.homedir(), 'opt/blender/blender');
const OVR = JSON.parse(fs.readFileSync(new URL('../assets/weapons/frames.override.json', import.meta.url), 'utf8'));
import { ALL } from './asset-manifest.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : null).filter(Boolean));
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const PPCAT = { machines: 'equipment', props: 'equipment', zombies: 'characters', lahore: 'equipment' };
const OUTDIR = { weapons: 'public/models/weapons', machines: 'public/models/zombies', props: 'public/models/zombies', zombies: 'public/models/zombies', lahore: 'public/models/lahore' };
const BUDGET = { lahore: [700e3, 10000, 1024], machines: [800e3, 14000, 1024], props: [500e3, 8000, 1024], zombies: [1500e3, 18000, 2048], weapons: [600e3, 7000, 1024], attachments: [250e3, 3000, 512], equipment: [250e3, 2500, 512], characters: [1500e3, 18000, 2048], kits: [1000e3, 6000, 1024] };
const framesF = path.join(ROOT, 'public/models/weapons/frames.json');
const frames = fs.existsSync(framesF) ? JSON.parse(fs.readFileSync(framesF, 'utf8')) : { convention: '', weapons: {} };

function positions(doc) {
  const pts = [];
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const a = p.getAttribute('POSITION'); const v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); pts.push([...v]); }
  }
  return pts;
}
function applyToAll(doc, fn) { // fn([x,y,z]) -> [x,y,z], also rotates normals via fnN
  const done = new Set();
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    for (const [sem, isN] of [['POSITION', false], ['NORMAL', true], ['TANGENT', true]]) {
      const a = p.getAttribute(sem); if (!a || done.has(a)) continue; done.add(a);
      const v = new Array(a.getElementSize()).fill(0);
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const r = fn(v.slice(0, 3), isN); v[0] = r[0]; v[1] = r[1]; v[2] = r[2]; a.setElement(i, v); }
    }
  }
}
const bbox = (pts) => pts.reduce((b, p) => { for (let i = 0; i < 3; i++) { b[0][i] = Math.min(b[0][i], p[i]); b[1][i] = Math.max(b[1][i], p[i]); } return b; }, [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]]);

function orientWeapon(doc, a) {
  const pts = positions(doc); const [mn, mx] = bbox(pts);
  const ext = [0, 1, 2].map((i) => mx[i] - mn[i]);
  const L = ext[0] >= ext[2] ? 0 : 2; // long horizontal axis (Meshy keeps +Y up)
  // muzzle end = end whose 10% slice has the smaller vertical extent (barrels are thin, stocks/grips tall)
  const slice = (lo, hi) => { const s = pts.filter((p) => p[L] >= lo && p[L] <= hi); const b = bbox(s.length ? s : pts); return { n: s.length, h: b[1][1] - b[0][1], b }; };
  const len = ext[L]; const eLo = slice(mn[L], mn[L] + 0.1 * len), eHi = slice(mx[L] - 0.1 * len, mx[L]);
  const muzzleHigh = eHi.h <= eLo.h; // true -> muzzle at +L
  const sgn = muzzleHigh ? 1 : -1;
  // map: along-axis t (0 stock .. 1 muzzle) -> -Z; up stays +Y; lateral keeps handedness
  const toLocal = (v) => { const t = v[L] * sgn; const lat = L === 0 ? v[2] * sgn : -v[0] * sgn; return [lat, v[1], -t]; };
  applyToAll(doc, (v) => toLocal(v));
  // grip: lowest protrusion in the rear 20%..65% of the length (pistol grip) -> origin at its upper third
  const p2 = positions(doc); const [m2, M2] = bbox(p2); const zLen = M2[2] - m2[2];
  let best = null;
  for (let k = 0; k < 18; k++) {
    const z0 = M2[2] - (0.2 + k * 0.025) * zLen, z1 = z0 - 0.025 * zLen; // from the stock (max z) toward muzzle (min z)
    const s = p2.filter((p) => p[2] <= z0 && p[2] >= z1); if (!s.length) continue;
    const yMin = Math.min(...s.map((p) => p[1])); if (!best || yMin < best.yMin) best = { z: (z0 + z1) / 2, yMin };
  }
  const isMelee = a.cls === 'melee' || a.cat !== 'weapons';
  const grip = isMelee ? [0, (m2[1] + M2[1]) / 2, M2[2] - 0.15 * zLen] : [0, best.yMin + 0.3 * (M2[1] - best.yMin), best.z];
  const muz = p2.filter((p) => p[2] <= m2[2] + 0.03 * zLen); const mb = bbox(muz);
  const muzzle = [(mb[0][0] + mb[1][0]) / 2, (mb[0][1] + mb[1][1]) / 2, m2[2]];
  const s = a.size / zLen;
  applyToAll(doc, (v, isN) => isN ? v : [(v[0] - grip[0]) * s, (v[1] - grip[1]) * s, (v[2] - grip[2]) * s]);
  const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);
  return { grip: [0, 0, 0], muzzle: r3(muzzle.map((x, i) => (x - grip[i]) * s)), length: a.size, sourceAxis: L === 0 ? 'x' : 'z', muzzleAtPositive: muzzleHigh, confidence: Math.abs(eHi.h - eLo.h) / Math.max(eHi.h, eLo.h) > 0.25 ? 'high' : 'low' };
}
function normaliseProp(doc, a) {
  const pts = positions(doc); const [mn, mx] = bbox(pts); const ext = mx.map((x, i) => x - mn[i]);
  const s = a.cat === 'characters' ? a.size / ext[1] : a.size / Math.max(...ext);
  const c = [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2];
  applyToAll(doc, (v, isN) => isN ? v : [(v[0] - c[0]) * s, (v[1] - c[1]) * s, (v[2] - c[2]) * s]);
}

const BULLPUP = new Set(['ar_vanta', 'ar_tern', 'smg_fennec', 'sr_quietus', 'ar_kite', 'sg_hound']);
async function compress(src, out, maxBytes, tex) {
  let texSize = tex;
  for (;;) {
    const d = await io.read(src);
    await d.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [texSize, texSize] }), prune({ keepLeaves: true }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const buf = await io.writeBinary(d);
    if (buf.byteLength <= maxBytes || texSize <= 256) { fs.writeFileSync(out, buf); return texSize; }
    texSize /= 2;
  }
}
async function one(a) {
  const src = path.join(ROOT, 'assets/raw', a.cat, `${a.id}.glb`);
  if (!fs.existsSync(src)) return null;
  const [maxBytes, tris, tex] = BUDGET[a.cat];
  const outDir = path.join(ROOT, OUTDIR[a.cat]); fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${a.id}.glb`);
  const work = path.join(ROOT, 'assets/work', a.cat); fs.mkdirSync(work, { recursive: true });
  const wGlb = path.join(work, `${a.id}.glb`), wLod = path.join(work, `${a.id}.lod1.glb`), wFrame = path.join(work, `${a.id}.json`);
  const ov = OVR.weapons?.[a.id] ?? OVR.attachments?.[a.id] ?? {};
  const bargs = ['-b', '--factory-startup', '-P', path.join(ROOT, 'tools/blender/postprocess.py'), '--', '--in', src, '--out', wGlb, '--cat', PPCAT[a.cat] ?? a.cat, '--size', String(a.size), '--tris', String(tris), '--frame', wFrame, '--name', a.id];
  if (a.cls && a.cls !== 'wonder') bargs.push('--cls', a.cls);
  if (BULLPUP.has(a.id)) bargs.push('--bullpup', '1');
  if (ov.grip !== undefined) bargs.push('--grip', String(ov.grip));
  if (ov.flip) bargs.push('--flip', '1');
  
  execFileSync(BLENDER, bargs, { stdio: 'pipe', maxBuffer: 64e6 });
  if (a.split) execFileSync(BLENDER, ['-b', '--factory-startup', '-P', path.join(ROOT, 'tools/blender/split_lid.py'), '--', '--in', wGlb, '--out', wGlb, '--frac', String(a.splitFrac ?? 0.74)], { stdio: 'pipe' });
  const frame = JSON.parse(fs.readFileSync(wFrame, 'utf8'));
  const texSize = await compress(wGlb, out, maxBytes, tex);
  if (fs.existsSync(wLod)) await compress(wLod, out.replace(/\.glb$/, '.lod1.glb'), maxBytes / 3, Math.min(512, texSize));
  if (a.cat === 'weapons') frames.weapons[a.id] = frame;
  if (a.cat === 'attachments') (frames.attachments ??= {})[a.id] = frame;
  return { id: a.id, tris: frame.tris, kb: Math.round(fs.statSync(out).size / 1024), tex: texSize, confidence: frame.confidence, gripRule: frame.gripRule };
}

const list = ALL.filter((a) => (!args.cat || a.cat === args.cat) && (!args.ids || String(args.ids).split(',').includes(a.id)));
const rows = [];
for (const a of list) { try { const r = await one(a); if (r) { rows.push(r); console.log(JSON.stringify(r)); } } catch (e) { console.log(a.id, 'ERR', e.message); } }
frames.convention = 'Game space: metres, +Y up. Weapons: barrel along -Z, origin = grip hand point (socket_grip). mounts.* are offsets from the origin and also exist as named empty nodes in each GLB (mount_optic top rail, mount_muzzle muzzle centre, mount_under under-barrel, mount_mag magazine well bottom, mount_stock stock butt). Measured by tools/blender/postprocess.py: muzzle end = end with the smaller cross-section, grip = hanging spike right behind the magazine (bullpups: frontmost spike; pistols: deepest rear slice); manual corrections live in assets/weapons/frames.override.json (grip = fraction of length from the stock end, flip = swap ends). Attachments: origin = mount_base (bottom centre of the rail clamp), front along -Z, mount_front = front face. Standard rail: attachments snap mount_base onto a weapon mount_* node.';
fs.mkdirSync(path.dirname(framesF), { recursive: true }); fs.writeFileSync(framesF, JSON.stringify(frames, null, 1));
const statsF = path.join(ROOT, 'assets/stats.json'); const stats = fs.existsSync(statsF) ? JSON.parse(fs.readFileSync(statsF, 'utf8')) : {};
for (const r of rows) stats[r.id] = r; fs.writeFileSync(statsF, JSON.stringify(stats, null, 1));
