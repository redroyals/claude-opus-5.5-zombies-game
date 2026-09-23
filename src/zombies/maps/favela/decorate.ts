// Bespoke dressing for "Rio · Ridgelight": the hillside itself (terrain + a few hundred stacked houses), the city
// and the sea at dusk below, the cable-car line (pylon, cables, two cabins, peak line), the wire tangle with kites,
// festoon strings, floodlights, street lamps, murals, post-power neon and invisible fall guards on every parapet.
// Everything repeated is merged per material or instanced, so the whole hillside costs a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { models, type LoadedModel } from '../../../render/ModelRegistry';
import type { MapDecorateContext, MapUpdateContext } from '../types';
import type { P3 } from '../../mapdef';
import {
  CABIN_H, CABLE, DRESS_PROPS, FAVELA, GONDOLA_UP, PEAK, PEAK_CABLE, PEAK_UP, PYLON, SLIDE_PATH, T, TOWER, ZIP, becoY,
} from './def';
import type { DressProp } from './def';
import { pointAt, rideEase } from '../../rides';
import { worldBox } from '../../../render/geom';
import { favelaSurfaces, fvDetail } from './materials';

const [T0, T1, T2, T3, , T5] = T;

// ------------------------------------------------------------------------------------------------------
// Deterministic noise + the hillside height (visual terrain only; gameplay floors are the def's boxes)
// ------------------------------------------------------------------------------------------------------
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const n2 = (x: number, z: number) => Math.sin(x * 0.11 + z * 0.07) * 1.1 + Math.sin(x * 0.037 - z * 0.051) * 1.6 + Math.sin(x * 0.23 + z * 0.19) * 0.35;

/** Visual hillside: climbs north (-Z), falls away south of the street to the city and the sea. */
export function hill(x: number, z: number): number {
  let y: number;
  if (z > 40) y = Math.max(-44, 3 - (z - 40) * 0.42);
  else if (z > -60) y = 3 + (40 - z) * 0.19;
  else y = 22 + Math.min(20, (-60 - z) * 0.55);
  y += Math.min(10, Math.abs(x) * 0.045) * (z < 40 ? 1 : 0.3) + n2(x, z) * (z > 60 ? 2.2 : 1);
  // The ravine between the quadra and the laje
  if (x > -18 && x < 2 && z > -46 && z < 5) {
    const u = Math.sin(((x + 18) / 20) * Math.PI) * Math.min(1, (z + 46) / 8) * Math.min(1, (5 - z) / 6);
    y -= u * 5;
  }
  return y;
}

// ------------------------------------------------------------------------------------------------------
// Where the playable map is (houses and trees stay out of it). Built from the def so it can't drift.
// ------------------------------------------------------------------------------------------------------
type R = { x0: number; z0: number; x1: number; z1: number };
function playRects(): R[] {
  const out: R[] = FAVELA.rooms.map((r) => ({ ...r.rect }));
  out.push({ x0: -18.2, z0: 29.7, x1: 36.2, z1: 38.3 }, { x0: -18, z0: -46, x1: 2.5, z1: 5 }, { x0: 28.5, z0: 7, x1: 33.5, z1: 30 }); // street parapets, ravine, slide corridor
  for (const w of FAVELA.windows) out.push({ x0: w.x - 2.2 + Math.min(0, w.nx) * 3.6, z0: w.z - 2.2 + Math.min(0, w.nz) * 3.6, x1: w.x + 2.2 + Math.max(0, w.nx) * 3.6, z1: w.z + 2.2 + Math.max(0, w.nz) * 3.6 });
  for (const b of FAVELA.boxes ?? []) if (b.collide === 'floor' && b.box[1] <= 0.01) out.push({ x0: b.box[0], z0: b.box[2], x1: b.box[3], z1: b.box[5] });
  return out;
}
const hits = (rs: R[], x0: number, z0: number, x1: number, z1: number, m = 0) => rs.some((r) => x1 > r.x0 - m && x0 < r.x1 + m && z1 > r.z0 - m && z0 < r.z1 + m);

// ------------------------------------------------------------------------------------------------------
// Shared favela materials. The Blender kit's fv_* slots fold into a handful of POOLS so the whole hillside
// (houses, plants, stalls, fences) costs about ten draw calls: textured surfaces (brick, render, concrete,
// corrugated sheet) plus one vertex-coloured "flat" pool for every small painted part, and the window glass.
// ------------------------------------------------------------------------------------------------------
interface FvMats { byName: Map<string, THREE.Material>; plasterVC: THREE.MeshStandardMaterial; festoon: THREE.MeshBasicMaterial; neon: THREE.MeshBasicMaterial[]; floodHead: THREE.MeshBasicMaterial; sodium: THREE.MeshBasicMaterial; cable: THREE.MeshStandardMaterial; winLit: THREE.MeshBasicMaterial }

/** Single-colour kit slots that share the vertex-coloured flat material (colour = the slot's paint). */
const FLAT: Record<string, number> = {
  fv_steel: 0x4a4f54, fv_rust: 0x7a4a2e, fv_wood: 0x7a5a3a, fv_tank_blue: 0x2c74b8, fv_paint_white: 0xe8e6e0, fv_paint_red: 0xb3261e,
  fv_paint_yellow: 0xe2b21c, fv_rubber: 0x1a1a1a, fv_pvc: 0x9c9c98, fv_ac: 0xdcd8cf, fv_alum: 0xb4b8bb, fv_door_teal: 0x2f8a86,
  fv_door_red: 0x9a2a26, fv_door_blue: 0x2e5aa8, fv_door_green: 0x2f7a4a, fv_door_yellow: 0xd8a820, fv_trunk_green: 0x6f7a3a,
  fv_leaf: 0x3f8a32, fv_leaf2: 0x6aa83a, fv_leaf_dark: 0x2f5e28, fv_fruit_green: 0x8aa43a, fv_fruit_brown: 0x6a5030, fv_bark: 0x6a5a44,
  fv_flower: 0xd8308a, fv_flower2: 0xf05aa8, fv_pot: 0xb5603a, fv_soil: 0x3a2a1e, fv_tin_can: 0xa8adb0, fv_insulator: 0x8a4a2a,
  fv_m_orange: 0xf26a1b, fv_m_pink: 0xe8327a, fv_m_teal: 0x12a89a, fv_m_yellow: 0xf5c518, fv_m_blue: 0x1f5fc8, fv_m_green: 0x3cb043,
  fv_m_purple: 0x7b3fa0, fv_m_white: 0xf2efe8, fv_m_black: 0x1a1a1a, fv_m_sky: 0x56c2e6,
};
/** Corrugated sheet slots (galvanised tin, fibre-cement, rusted tin, roll-up shutters). */
const SHEET: Record<string, number> = { fv_tin: 0xb8bcc0, fv_sheet_tin: 0xb8bcc0, fv_sheet_fibro: 0x8e908a, fv_sheet_rust: 0x8a5436, fv_shutter: 0x9aa0a4 };
/** Lit-window colours: warm tungsten, pale LED, cool fluorescent, TV blue. */
const LIT = [0xffb060, 0xffc880, 0xffe2b0, 0xffb060, 0xbfe0ff, 0x8aa8ff];

function favelaMats(ctx: MapDecorateContext): FvMats {
  const S = favelaSurfaces();
  const winDark = new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.18, metalness: 0.4, envMapIntensity: 1.4 });
  const winLit = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(1.15), vertexColors: true });
  const sheet = fvDetail((ctx.M.corrugated as THREE.MeshStandardMaterial).clone(), { macro: 0.3, streaks: 0 });
  sheet.color.setHex(0xffffff); sheet.vertexColors = true;
  const flat = fvDetail(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.05, vertexColors: true, side: THREE.DoubleSide }), { macro: 0.1, streaks: 0 });
  const link = new THREE.MeshStandardMaterial({ color: 0xb0b6ba, roughness: 0.5, metalness: 0.6, map: chainLinkTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  const sodium = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a3a).multiplyScalar(2.6) });
  const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd28a).multiplyScalar(2.2) });
  bulb.name = 'fv_bulb';
  const byName = new Map<string, THREE.Material>([
    ['fv_brick', S.brick], ['fv_concrete', S.concrete], ['fv_concrete_dark', S.concreteDark], ['fv_plaster', S.renderVC], ['fv_plaster2', S.renderVC],
    ['fv_window_dark', winDark], ['fv_window_lit', winLit], ['fv_sheet', sheet], ['fv_flat', flat], ['fv_chainlink', link],
    ['fv_bulb', bulb], ['fv_sodium', sodium], ['fv_mural', muralPool()],
    // single placed GLBs (placeKit) keep plain shared materials
    ['fv_steel', ctx.mat('steel')], ['fv_rust', ctx.mat('rust')], ['fv_tin', ctx.mat('corrugated')], ['fv_wood', ctx.mat('wood')],
    ['fv_tank_blue', new THREE.MeshStandardMaterial({ color: 0x2a6fb0, roughness: 0.55 })], ['fv_paint_white', ctx.mat('white')],
    ['fv_paint_red', ctx.mat('red')], ['fv_paint_yellow', ctx.mat('hazardYellow')], ['fv_rubber', ctx.mat('rubber')],
  ]);
  const festoon = new THREE.MeshBasicMaterial({ color: 0x2a2420 });
  const neon = [new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true })];
  const floodHead = new THREE.MeshBasicMaterial({ color: 0x40464c });
  const cable = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.6, metalness: 0.5 });
  byName.set('fv_floodhead', floodHead);
  return { byName, plasterVC: S.renderVC, festoon, neon, floodHead, sodium, cable, winLit };
}

function chainLinkTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.beginPath();
  for (let k = -64; k <= 64; k += 32) { g.moveTo(k, 0); g.lineTo(k + 64, 64); g.moveTo(k + 64, 0); g.lineTo(k, 64); }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 12); // kit UVs are 2 m per unit here: one diamond every ~8 cm
  t.anisotropy = 4;
  return t;
}

/** Walks a loaded kit piece and yields (geometry in model space, material name). */
function kitParts(m: LoadedModel): { geo: THREE.BufferGeometry; mat: string }[] {
  const out: { geo: THREE.BufferGeometry; mat: string }[] = [];
  m.scene.updateMatrixWorld(true);
  m.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const src = mesh.geometry;
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.index ? src.index.count : src.attributes.position.count, materialIndex: 0 }];
    for (const g of groups) {
      const sub = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv'] as const) {
        const a = src.getAttribute(k) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
        if (!a) continue;
        // Quantized (meshopt) GLBs store normalized int attributes: expand to float before transforming.
        const n = a.count, sz = a.itemSize, f = new Float32Array(n * sz);
        for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) f[i * sz + c] = a.getComponent(i, c);
        sub.setAttribute(k, new THREE.Float32BufferAttribute(f, sz));
      }
      if (!sub.getAttribute('uv')) sub.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(sub.attributes.position.count * 2), 2));
      const idx = src.index ? Array.from(src.index.array).slice(g.start, g.start + g.count) : Array.from({ length: g.count }, (_, i) => g.start + i);
      sub.setIndex(idx);
      const nonIdx = sub.toNonIndexed();
      nonIdx.applyMatrix4(mesh.matrixWorld);
      // Kit UVs are 1 unit per metre; the game's tiling textures are authored for 2 m repeats.
      const uv = nonIdx.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
      out.push({ geo: nonIdx, mat: (mats[g.materialIndex ?? 0] as THREE.Material).name });
    }
  });
  return out;
}

/** Placement job: model matrix, render tint (for fv_plaster), a seed for per-instance choices (lit windows). */
interface Job { m: THREE.Matrix4; tint: THREE.Color; remap?: Record<string, string>; seed: number; litRate: number }
const hash1 = (a: number) => { const s = Math.sin(a * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Collects kit placements, then merges every placed part into one mesh per material POOL when the GLBs arrive. */
class KitMerger {
  private jobs = new Map<string, Job[]>();
  private n = 0;
  add(model: string, x: number, y: number, z: number, yaw: number, tint = new THREE.Color(1, 1, 1), scale = 1, remap?: Record<string, string>, mirror = false, litRate = 0.24): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(mirror ? -scale : scale, scale, scale));
    this.addM(model, m, tint, remap, litRate);
  }
  addM(model: string, m: THREE.Matrix4, tint = new THREE.Color(1, 1, 1), remap?: Record<string, string>, litRate = 0.24): void {
    let a = this.jobs.get(model);
    if (!a) this.jobs.set(model, (a = []));
    a.push({ m, tint, remap, seed: ++this.n * 7.31, litRate });
  }
  get count(): number { let n = 0; for (const a of this.jobs.values()) n += a.length; return n; }
  build(root: THREE.Object3D, mats: FvMats, name: string, onDone?: () => void): void {
    const names = [...this.jobs.keys()];
    (globalThis as unknown as { __fvJobs: unknown }).__fvJobs = names.map((k) => [k, this.jobs.get(k)!.length]);
    void Promise.all(names.map((n) => models.load(n))).then((loaded) => {
      const byMat = new Map<string, THREE.BufferGeometry[]>();
      const push = (key: string, g: THREE.BufferGeometry) => { let arr = byMat.get(key); if (!arr) byMat.set(key, (arr = [])); arr.push(g); };
      const col = new THREE.Color();
      loaded.forEach((lm, i) => {
        if (!lm) return;
        const parts = kitParts(lm);
        const isMural = names[i].includes('fv_mural');
        for (const job of this.jobs.get(names[i])!) {
          const mirrored = job.m.determinant() < 0;
          for (const p of parts) {
            const src = job.remap?.[p.mat] ?? p.mat;
            const g = p.geo.clone().applyMatrix4(job.m);
            if (mirrored) flipWinding(g);
            const n = g.attributes.position.count;
            const c = new Float32Array(n * 3);
            const fill = (cc: THREE.Color, from = 0, to = n) => { for (let k = from; k < to; k++) { c[k * 3] = cc.r; c[k * 3 + 1] = cc.g; c[k * 3 + 2] = cc.b; } };
            g.setAttribute('color', new THREE.BufferAttribute(c, 3)); // no copy: fill() below writes into it
            if (src === 'fv_window_dark' || src === 'fv_window_lit') {
              // Glass: every quad (2 triangles) of every placed house is lit or dark on its own.
              const lit: THREE.BufferGeometry[] = [], dark: number[] = [];
              for (let q = 0; q * 6 < n; q++) {
                const h = hash1(job.seed + q * 1.618);
                if (h < job.litRate) { fill(col.setHex(LIT[Math.floor(hash1(h * 91 + q) * LIT.length)]).multiplyScalar(0.7 + hash1(q + job.seed) * 0.5), q * 6, Math.min(n, q * 6 + 6)); lit.push(sliceTris(g, q * 6, Math.min(n, q * 6 + 6))); }
                else dark.push(q);
              }
              if (lit.length) { const lg = mergeGeometries(lit, false); if (lg) push('fv_window_lit', lg); }
              if (dark.length) { fill(col.setRGB(1, 1, 1)); push('fv_window_dark', dark.length * 6 === n ? g : mergeGeometries(dark.map((q) => sliceTris(g, q * 6, Math.min(n, q * 6 + 6))), false)!); }
              continue;
            }
            let key = src;
            if (src.startsWith('fv_plaster')) { fill(job.tint); key = 'fv_plaster'; }
            else if (isMural && src.startsWith('fv_m_')) { fill(col.setHex(FLAT[src] ?? 0xffffff)); key = 'fv_mural'; }
            else if (FLAT[src] !== undefined) { fill(col.setHex(FLAT[src])); key = 'fv_flat'; }
            else if (SHEET[src] !== undefined) { fill(col.setHex(SHEET[src]).multiplyScalar(0.85 + hash1(job.seed) * 0.3)); key = 'fv_sheet'; }
            else fill(col.setRGB(1, 1, 1));
            push(key, g);
          }
        }
      });
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        const material = mats.byName.get(mat) ?? muralMat(mat) ?? mats.byName.get('fv_concrete')!;
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = `${name}:${mat}`;
        mesh.receiveShadow = false;
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        root.add(mesh);
      }
      onDone?.();
    });
  }
}

/** Mirrored placements turn triangles inside out: swap the 2nd and 3rd vertex of every triangle. */
function flipWinding(g: THREE.BufferGeometry): void {
  for (const k of Object.keys(g.attributes)) {
    const a = g.getAttribute(k) as THREE.BufferAttribute;
    const s = a.itemSize, arr = a.array as Float32Array;
    for (let t = 0; t + 2 < a.count; t += 3) for (let c = 0; c < s; c++) { const i1 = (t + 1) * s + c, i2 = (t + 2) * s + c; const v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v; }
  }
}
/** Copies vertices [a, b) of a non-indexed geometry. */
function sliceTris(g: THREE.BufferGeometry, a: number, b: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) {
    const at = g.getAttribute(k) as THREE.BufferAttribute;
    out.setAttribute(k, new THREE.Float32BufferAttribute((at.array as Float32Array).slice(a * at.itemSize, b * at.itemSize), at.itemSize));
  }
  return out;
}

const MURAL_COLORS: Record<string, number> = { fv_m_orange: 0xf26a1b, fv_m_pink: 0xe8327a, fv_m_teal: 0x12a89a, fv_m_yellow: 0xf5c518, fv_m_blue: 0x1f5fc8, fv_m_green: 0x3cb043, fv_m_purple: 0x7b3fa0, fv_m_white: 0xf2efe8, fv_m_black: 0x1a1a1a, fv_m_sky: 0x56c2e6 };
const muralCache = new Map<string, THREE.Material>();
/** Flat street-art colours with a touch of self-light so murals read at dusk. */
function muralMat(name: string): THREE.Material | undefined {
  const c = MURAL_COLORS[name];
  if (c === undefined) return undefined;
  let m = muralCache.get(name);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, emissive: c, emissiveIntensity: 0.18, side: THREE.DoubleSide }); muralCache.set(name, m); }
  return m;
}

/** Murals: vertex-coloured street-art paint with a touch of self-light so they read at dusk (one draw for all). */
function muralPool(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.2;'); };
  m.customProgramCacheKey = () => 'fv-mural';
  return m;
}

/** Places a single GLB with its fv_* materials swapped for the shared ones. */
function placeKit(root: THREE.Object3D, mats: FvMats, model: string, x: number, y: number, z: number, yaw = 0, scale = 1, cb?: (o: THREE.Object3D) => void): void {
  void models.load(model).then((lm) => {
    if (!lm) return;
    const inst = models.instance(lm);
    inst.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => mats.byName.get(m.name) ?? m;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      mesh.castShadow = false;
    });
    inst.position.set(x, y, z);
    inst.rotation.y = yaw;
    inst.scale.setScalar(scale);
    root.add(inst);
    cb?.(inst);
  });
}

// ------------------------------------------------------------------------------------------------------
// Pieces
// ------------------------------------------------------------------------------------------------------
/** House render colours: pastels, the odd strong colour, and white. */
const PASTEL = [0xe89a78, 0x7cc4b8, 0xf0d070, 0xe898b4, 0xa6cc78, 0x8cb0e6, 0xf4ecd8, 0xb8a0dc, 0xf6f4ee, 0xf2b068, 0x98dcc0, 0x88c8e8, 0xf0a890, 0xd8e878, 0xffffff, 0xf6f4ee];
/** Blender kit houses v2 (tools/blender/favela_houses.py): footprint, slab-top height h, visual top (tanks, roofs). */
const HOUSES = [
  { id: 'fv_h01', w: 4.2, d: 4.2, h: 5.8, top: 7.7 }, { id: 'fv_h02', w: 5.0, d: 4.6, h: 8.7, top: 10.6 }, { id: 'fv_h03', w: 3.6, d: 4.0, h: 2.9, top: 4.45 },
  { id: 'fv_h04', w: 6.2, d: 5.0, h: 5.8, top: 7.35 }, { id: 'fv_h05', w: 4.0, d: 5.4, h: 11.6, top: 14.4 }, { id: 'fv_h06', w: 5.2, d: 5.0, h: 5.8, top: 7.7 },
  { id: 'fv_h07', w: 4.6, d: 4.4, h: 8.7, top: 11.5 }, { id: 'fv_h08', w: 3.4, d: 4.2, h: 8.7, top: 10.6 }, { id: 'fv_h09', w: 5.6, d: 4.8, h: 2.9, top: 4.8 },
  { id: 'fv_h10', w: 4.4, d: 5.0, h: 5.8, top: 7.35 }, { id: 'fv_h11', w: 6.0, d: 5.2, h: 8.7, top: 10.6 }, { id: 'fv_h12', w: 3.8, d: 4.4, h: 5.8, top: 7.35 },
  { id: 'fv_h13', w: 4.8, d: 5.6, h: 11.6, top: 13.5 }, { id: 'fv_h14', w: 5.4, d: 4.6, h: 5.8, top: 8.6 },
];
type House = (typeof HOUSES)[number];

function buildTerrain(ctx: MapDecorateContext): void {
  const W = 460, D = 560, sx = 84, sz = 104;
  const g = new THREE.PlaneGeometry(W, D, sx, sz);
  g.rotateX(-Math.PI / 2);
  g.translate(-10, 0, 60);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const dry = new THREE.Color(0x8a6a48), green = new THREE.Color(0x4f7a38), dark = new THREE.Color(0x3a4a2e), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = hill(x, z);
    for (const r of FAVELA.rooms) if (x > r.rect.x0 - 1.2 && x < r.rect.x1 + 1.2 && z > r.rect.z0 - 1.2 && z < r.rect.z1 + 1.2) y = Math.min(y, r.floor - 0.35);
    pos.setY(i, y);
    const t = 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.04) * Math.cos(z * 0.03);
    c.copy(dry).lerp(green, t).lerp(dark, Math.min(1, Math.max(0, (-z - 60) / 60)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = (ctx.M.dirt as THREE.MeshStandardMaterial).clone();
  m.vertexColors = true;
  m.color.setHex(0xffffff);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'fv:terrain';
  ctx.root.add(mesh);
}

/** Near houses: detailed kit pieces (LOD0) close to the play space, the ~100-triangle shells (LOD1) further out,
 *  instanced facade boxes beyond that; everything merged per material pool. */
function buildHouses(ctx: MapDecorateContext, merger: KitMerger): void {
  const rs = playRects();
  const r = rng(7);
  const SLOPED = new Set(['fv_h03', 'fv_h04', 'fv_h10', 'fv_h12']);
  const tint = () => new THREE.Color(PASTEL[Math.floor(r() * PASTEL.length)]);
  const place = (h: House, x: number, y: number, z: number, yaw: number, lod: boolean, lit = 0.24) =>
    merger.add(`favela/${h.id}${lod ? '.lod1' : ''}.glb`, x, y, z, yaw, tint(), 1, undefined, r() < 0.5, lit);
  // 1) Skins: stacked houses in front of the big exposed terrace faces (the favela "wall" you see from every tier).
  const skin = (axis: 'x' | 'z', at: number, a0: number, a1: number, top: number, out: 1 | -1) => {
    for (let a = a0 + 2.2; a < a1 - 1.5;) {
      let y = hill(axis === 'x' ? a : at, axis === 'x' ? at : a) - 0.6;
      const yaw = axis === 'x' ? (out > 0 ? 0 : Math.PI) : (out > 0 ? Math.PI / 2 : -Math.PI / 2);
      let wBay = 4;
      let prevW = 0;
      while (y < top - 2) {
        // A skin must never rise above the floor it dresses (it would block the view from that floor).
        let fits = HOUSES.filter((c) => y + c.top <= top + 0.3 && (!prevW || c.w >= prevW - 0.6));
        if (!fits.length) fits = HOUSES.filter((c) => y + c.top <= top + 0.3);
        if (!fits.length) break;
        const h = fits[Math.floor(r() * fits.length)];
        if (!prevW) wBay = h.w;
        const off = at + out * (h.d / 2 - 0.4 + r() * 0.3);
        const [x, z] = axis === 'x' ? [a + (r() - 0.5) * 0.6, off] : [off, a + (r() - 0.5) * 0.6];
        place(h, x, y, z, yaw, false, 0.3);
        prevW = h.w;
        if (SLOPED.has(h.id)) break;
        y += h.h + 0.02;
      }
      a += wBay + 0.3 + r() * 1.0;
    }
  };
  skin('z', -2, -24, 8, T3, -1);        // laje west face, over the ravine
  skin('z', 34, -24, 8, T3, 1);         // laje east face
  skin('x', 8, 14.5, 34, T3, 1);        // laje south face (seen from the street)
  skin('x', 16, -48, -16, T2, 1);       // quadra south face
  skin('x', -35, -45, -12, T5, 1);      // mirante south face (seen from the quadra and the stands)
  skin('x', -44, -12, 4, T5, 1);        // substation south face over the ravine head
  skin('z', 36, 30, 38, T0 + 3, 1);     // street east end
  skin('x', 38, 10.5, 36, T0 - 0.2, 1); // under the street's south parapet
  // 2) Scatter: the rest of the hillside, avoiding the play space. Detailed near the play space, shells beyond.
  const farBoxes: THREE.Matrix4[] = [];
  const farCols: THREE.Color[] = [];
  for (let gz = -104; gz < 70; gz += 6.2) {
    for (let gx = -118; gx < 104; gx += 6.2) {
      const x = gx + (r() - 0.5) * 2.2, z = gz + (r() - 0.5) * 2.2;
      const h = HOUSES[Math.floor(r() * HOUSES.length)];
      const hw = h.w / 2 + 0.2, hd = h.d / 2 + 0.2;
      if (hits(rs, x - hw, z - hd, x + hw, z + hd, 1.2)) continue;
      if (z > PEAK.z0 - 6 && z < PEAK.z1 + 8 && x > PEAK.x0 - 6 && x < PEAK.x1 + 6) continue;
      if (x > 2 && x < 28 && z < -60 && z > -80) continue; // the station hall on the crest
      const y = hill(x, z) - 0.8;
      const near = Math.abs(x) < 64 && z > -84 && z < 60;
      const yaw = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(r() * 4)] * (r() < 0.65 ? 0 : 1);
      // Houses step down the hill: a roof may not rise more than 1.5 m above the ground 10 m uphill, so the
      // views downhill (street -> sea, laje -> city, mirante -> bay) stay open.
      // (below the street, where the sea view is, the rule is strict; uphill of the play space houses may stand taller)
      const maxTop = hill(x, z - 10) + (z > 36 ? 1.5 : 4.8);
      // A house beside a terrace never rises above that terrace's floor (keeps every lookout's view open).
      let cap = Infinity;
      for (const rm of FAVELA.rooms) {
        if (rm.floor <= y + 1) continue;
        const dx = Math.max(rm.rect.x0 - x, 0, x - rm.rect.x1), dz = Math.max(rm.rect.z0 - z, 0, z - rm.rect.z1);
        if (Math.hypot(dx, dz) < 14) cap = Math.min(cap, rm.floor + 0.3);
      }
      if (near) {
        const fits = HOUSES.filter((c) => y + c.h <= maxTop + 0.3 && y + c.top <= cap);
        if (!fits.length) continue;
        const hh = fits.includes(h) ? h : fits[Math.floor(r() * fits.length)];
        const detailed = hits(rs, x - hw, z - hd, x + hw, z + hd, 9);
        place(hh, x, y, z, yaw, !detailed);
        if (r() < 0.25 && !SLOPED.has(hh.id)) {
          const up = HOUSES.filter((c) => c.w <= hh.w + 0.2 && y + hh.h + c.h <= maxTop + 0.3 && y + hh.h + c.top <= cap);
          if (up.length) place(up[Math.floor(r() * up.length)], x, y + hh.h + 0.02, z, yaw, !detailed);
        }
      } else {
        const bh = 3 + Math.floor(r() * 4) * 3;
        farBoxes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + bh / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(h.w, bh, h.d)));
        farCols.push(new THREE.Color(PASTEL[Math.floor(r() * PASTEL.length)]).lerp(new THREE.Color(0xc0643a), r() * 0.7));
      }
    }
  }
  // Low roofs under the tin-roof slide (their tops sit just under the slide path)
  for (let z = 10.5; z < 29; z += 4.8) {
    let y = hill(31, z) - 0.6;
    const top = pointAtZ(SLIDE_PATH, z) - 0.9;
    while (y + 3 < top) {
      const fits = HOUSES.filter((c) => c.w <= 5.2 && y + c.top <= top + 0.2 && !SLOPED.has(c.id));
      if (!fits.length) break;
      const h = fits[Math.floor(r() * fits.length)];
      place(h, 31, y, z, Math.PI, false);
      y += h.h + 0.02;
    }
  }
  // Far hillside + the city below: one instanced box with a procedural lit-window facade.
  for (let i = 0; i < 2600; i++) {
    const x = (r() - 0.5) * 620, z = 70 + r() * 360;
    const y = hill(x, z);
    if (z < 90 && Math.abs(x) < 60) continue;
    const w = 6 + r() * 14, d = 6 + r() * 14, bh = 4 + r() * r() * (z > 200 ? 60 : 22);
    farBoxes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + bh / 2 - 1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI), new THREE.Vector3(w, bh, d)));
    farCols.push(new THREE.Color(0xd8d0c4).lerp(new THREE.Color(0x8a90a0), r()));
  }
  const tex = facadeTexture();
  const farMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: false });
  farMat.color.setHex(0xffffff);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(box, farMat, farBoxes.length);
  farBoxes.forEach((m, i) => { inst.setMatrixAt(i, m); inst.setColorAt(i, farCols[i].multiplyScalar(0.62)); });
  inst.frustumCulled = false;
  inst.name = 'fv:far-houses';
  ctx.root.add(inst);
}

/** Slide path height at z (the path runs along z at x 31). */
function pointAtZ(path: P3[], z: number): number {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if ((z - a.z) * (z - b.z) <= 0 && a.z !== b.z) return a.y + ((b.y - a.y) * (z - a.z)) / (b.z - a.z);
  }
  return path[path.length - 1].y;
}

function facadeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(99);
  g.fillStyle = '#2c2a2e';
  g.fillRect(0, 0, 128, 128);
  for (let y = 6; y < 128; y += 16) for (let x = 5; x < 128; x += 14) {
    const lit = r();
    g.fillStyle = lit < 0.22 ? '#ffc070' : lit < 0.3 ? '#9fd4ff' : lit < 0.36 ? '#ffe6a8' : '#16181c';
    g.fillRect(x, y, 7, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  return t;
}

/** City lights below, the shore road, the sea with a sunset streak, mountains, the low sun. */
function buildVista(ctx: MapDecorateContext): void {
  const r = rng(31);
  const N = 5200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const warm = new THREE.Color(0xffa04a), white = new THREE.Color(0xfff0d8), cool = new THREE.Color(0x9cc8ff), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x: number, z: number;
    if (i < 700) { x = -300 + (i / 700) * 600; z = 318 + Math.sin(x * 0.02) * 8; } // the shore road
    else { x = (r() - 0.5) * 640; z = 64 + Math.pow(r(), 0.8) * 250; }
    pos[i * 3] = x; pos[i * 3 + 1] = hill(x, z) + 0.6 + r() * 3; pos[i * 3 + 2] = z;
    const k = r();
    c.copy(i < 700 ? warm : k < 0.55 ? warm : k < 0.85 ? white : cool);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.95, depthWrite: false }));
  pts.frustumCulled = false;
  pts.name = 'fv:city-lights';
  ctx.root.add(pts);
  // Sea: a vast plane below the city with a warm streak toward the setting sun.
  const sc = document.createElement('canvas');
  sc.width = 64; sc.height = 256;
  const sg = sc.getContext('2d')!;
  const grd = sg.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#f08a4b'); grd.addColorStop(0.18, '#a05a6a'); grd.addColorStop(0.55, '#2c2a4a'); grd.addColorStop(1, '#141a30');
  sg.fillStyle = grd; sg.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 180; i++) { sg.fillStyle = `rgba(255,190,120,${0.08 + r() * 0.2})`; sg.fillRect(24 + r() * 16, r() * 120, 2 + r() * 10, 1); }
  const seaTex = new THREE.CanvasTexture(sc);
  seaTex.colorSpace = THREE.SRGBColorSpace;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1600), new THREE.MeshBasicMaterial({ map: seaTex, fog: false }));
  sea.rotation.x = -Math.PI / 2;
  sea.rotation.z = Math.PI;
  sea.position.set(0, -44.5, 1130);
  sea.name = 'fv:sea';
  ctx.root.add(sea);
  // Mountains: granite domes and forested ridges around the bay (one merged, unfogged, vertex-coloured mesh).
  // The big dome at the water's edge is a generic granite peak, not a copy of any real landmark.
  const hz = new THREE.Color(0x6a4a5a);
  // Layered ridges wrapping the bay (far = hazier), and one generic bare-granite peak near the water's edge.
  const geos: THREE.BufferGeometry[] = [
    ridgeBand(560, 150, 0.85, 11, hz), ridgeBand(460, 100, 0.7, 12, hz), ridgeBand(380, 62, 0.55, 13, hz),
    ridgeBand(560, 150, 0.85, 21, hz, 0.64 * Math.PI, 1.15 * Math.PI), ridgeBand(460, 100, 0.7, 22, hz, 0.66 * Math.PI, 1.15 * Math.PI), ridgeBand(380, 62, 0.55, 23, hz, 0.7 * Math.PI, 1.15 * Math.PI),
    mountain(175, 470, 112, 58, 'dome', 901, hz), mountain(-250, 560, 90, 70, 'dome', 905, hz),
  ];
  const mg = mergeGeometries(geos, false);
  if (mg) {
    const mm = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); // colours carry their own dusk light + haze
    mm.name = 'fv:mountains';
    mm.frustumCulled = false;
    ctx.root.add(mm);
  }
  // The low sun, just set, glowing on the horizon behind the bay.
  const sunC = document.createElement('canvas');
  sunC.width = sunC.height = 128;
  const sgc = sunC.getContext('2d')!;
  const rg = sgc.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,220,160,1)'); rg.addColorStop(0.12, 'rgba(255,170,90,0.9)'); rg.addColorStop(0.4, 'rgba(255,120,70,0.25)'); rg.addColorStop(1, 'rgba(255,90,60,0)');
  sgc.fillStyle = rg; sgc.fillRect(0, 0, 128, 128);
  const sunTex = new THREE.CanvasTexture(sunC);
  sunTex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sun.position.set(-260, 10, 780);
  sun.scale.set(420, 420, 1);
  ctx.root.add(sun);
}

/** Thin catenary cables merged into one mesh. */
function cables(spans: [P3, P3, number][], radius: number, mat: THREE.Material): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const [a, b, sag] of spans) {
    const pts: THREE.Vector3[] = [];
    const n = Math.max(4, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
    for (let k = 0; k <= n; k++) { const t = k / n; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, radius, 4, false);
    tube.deleteAttribute('uv');
    geos.push(tube);
  }
  if (!geos.length) return null;
  const g = mergeGeometries(geos, false);
  if (g && cableBin) { cableBin.push(g); return null; } // decorate merges every cable into one draw at the end
  return g ? new THREE.Mesh(g, mat) : null;
}
let cableBin: THREE.BufferGeometry[] | null = null;

interface Festoon { bulbs: THREE.InstancedMesh; mat: THREE.MeshBasicMaterial; phase: number; base: THREE.Color[] }

// ------------------------------------------------------------------------------------------------------
// Animated state shared between decorate and update (a map is built once and cached by the runtime)
// ------------------------------------------------------------------------------------------------------
interface Anim {
  cabins: THREE.Group[];
  peakCab: THREE.Group | null;
  wheels: THREE.Object3D[];
  festoons: Festoon[];
  neon: THREE.MeshBasicMaterial[];
  floodHead: THREE.MeshBasicMaterial;
  floodPools: THREE.Mesh[];
  sodium: THREE.MeshBasicMaterial;
  sodiumGlow: THREE.PointsMaterial[];
  kites: THREE.Object3D[];
  upDone: boolean; // which end each cabin sits at (swaps after every ride)
  lastRide: string | null;
  power: boolean;
}
const anim: Anim = { cabins: [], peakCab: null, wheels: [], festoons: [], neon: [], floodHead: new THREE.MeshBasicMaterial(), floodPools: [], sodium: new THREE.MeshBasicMaterial(), sodiumGlow: [], kites: [], upDone: false, lastRide: null, power: false };

function glowSprite(color: number, size: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.4)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

// ------------------------------------------------------------------------------------------------------
// Art pass: greenery, street life, fences, the station hall, light fixtures with glow + pools, backdrop
// ------------------------------------------------------------------------------------------------------
/** Small procedural painted parts (bunting, facade AC units, pipes) merged into ONE vertex-coloured mesh. */
let flatBin: FlatBits | null = null;
class FlatBits {
  private geos: THREE.BufferGeometry[] = [];
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    const g = boxGeo(x0, y0, z0, x1, y1, z1).toNonIndexed();
    this.tint(g, color);
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
    this.tint(g, color);
  }
  private tint(g: THREE.BufferGeometry, color: number): void {
    const n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    this.geos.push(g);
  }
  build(root: THREE.Object3D, mat: THREE.Material): void {
    const g = this.geos.length ? mergeGeometries(this.geos, false) : null;
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.name = 'fv:flat-bits';
    m.matrixAutoUpdate = false;
    root.add(m);
  }
}

/** Trees, banana plants and palms: kit pieces, merged into the flat pool (zero extra draw calls). */
function buildGreenery(merger: KitMerger): void {
  const r = rng(61);
  const rs = playRects();
  // The ravine: broad trees and bananas (keeps the cable, bridge and zipline sightlines clear)
  for (let i = 0; i < 28; i++) {
    const x = -16 + r() * 16, z = -32 + r() * 34; // south of the mirante/substation edge so no crown pokes above T5
    if (Math.abs(x - PYLON.x) < 3 && Math.abs(z - PYLON.z) < 3) continue;
    if (z > -22.5 && z < -18.5) continue; // under the bridge
    const sc = 0.75 + r() * 0.5;
    merger.add(`favela/${r() < 0.5 ? 'fv_tree' : 'fv_tree_b'}.glb`, x, hill(x, z) - 0.3, z, r() * 6.28, undefined, sc);
  }
  for (let i = 0; i < 18; i++) {
    const x = -15 + r() * 14, z = -30 + r() * 32;
    merger.add('favela/fv_banana.glb', x, hill(x, z) - 0.1, z, r() * 6.28, undefined, 0.9 + r() * 0.5);
  }
  // Hillside pockets between the houses: trees, bananas, the odd palm (only where nothing else stands)
  for (let i = 0; i < 90; i++) {
    const x = (r() - 0.5) * 200, z = -100 + r() * 170;
    if (hits(rs, x - 3, z - 3, x + 3, z + 3, 2)) continue;
    if (z > PEAK.z0 - 8 && z < PEAK.z1 + 8 && x > PEAK.x0 - 8 && x < PEAK.x1 + 8) continue;
    const y = hill(x, z);
    if (y + 5 > hill(x, z - 10) + 4.5) continue; // keep the downhill views open
    const k = r();
    merger.add(`favela/${k < 0.4 ? 'fv_tree' : k < 0.7 ? 'fv_tree_b' : k < 0.93 ? 'fv_banana' : 'fv_palm'}.glb`, x, y - 0.4, z, r() * 6.28, undefined, 0.8 + r() * 0.4);
  }
  // Below the street: palms and bananas in the yards down the slope toward the sea
  for (const [x, z, k] of [[-14, 44, 'fv_palm'], [15, 47, 'fv_palm'], [27, 44, 'fv_banana'], [-8, 50, 'fv_banana'], [33, 50, 'fv_palm'], [-20, 52, 'fv_tree']] as const) {
    merger.add(`favela/${k}.glb`, x, hill(x, z) - 0.3, z, r() * 6.28, undefined, 1);
  }
}

/** Street stall, snack kiosk, planters, benches, a lookout viewer, fences, the gantry and the station hall/cap. */
function buildStreetLife(ctx: MapDecorateContext, merger: KitMerger): void {
  const solid = (x: number, y: number, z: number, hw: number, hd: number, h: number, yaw = 0, surface: 'wood' | 'metal' | 'concrete' = 'wood') => {
    const q = Math.abs(Math.sin(yaw)) > 0.7;
    const [ax, az] = q ? [hd, hw] : [hw, hd];
    ctx.world.add(x - ax, y, z - az, x + ax, y + h, z + az, { surface });
  };
  // Bottom street: fruit stall against the south parapet, snack kiosk at the west end
  merger.add('favela/fv_stall.glb', 19, T0, 36.9, Math.PI);
  solid(19.3, T0, 36.95, 1.8, 0.95, 2.4, 0);
  merger.add('favela/fv_kiosk.glb', -14.6, T0, 36.8, Math.PI);
  solid(-14.8, T0, 36.8, 1.3, 0.8, 2.3, 0);
  merger.add('favela/fv_awning.glb', 3, T0 + 2.7, 38.05, Math.PI);
  merger.add('favela/fv_pots.glb', 33.8, T0, 31.0, 0);
  solid(33.8, T0, 31.0, 0.75, 0.4, 0.6);
  merger.add('favela/fv_bush.glb', -16.8, T0, 32.2, 0.4);
  solid(-16.8, T0, 32.2, 0.5, 0.5, 1.4);
  // Big laje: planters, a banana plant in the corner, pots by the tanks
  for (const [m, x, z, s] of [['fv_bush', -0.9, 0.4, 0.5], ['fv_shrub', -0.9, 3.6, 0.5], ['fv_pots', 33, -15.5, 0.75], ['fv_banana', 32.8, -0.6, 0.6], ['fv_pots', 9.5, 6.9, 0.75], ['fv_bush', 12.8, -22.9, 0.5]] as const) {
    merger.add(`favela/${m}.glb`, x, T3, z, 0);
    solid(x, T3, z, s, m === 'fv_pots' ? 0.4 : s, 1.5);
  }
  // Mirante: benches, the lookout viewer, planters and a palm at the rail
  merger.add('favela/fv_viewer.glb', -28.5, T5, -35.7, 0);
  solid(-28.5, T5, -35.7, 0.25, 0.3, 1.5, 0, 'metal');
  for (const x of [-41, -17.8]) { merger.add('favela/fv_bench.glb', x, T5, -36.1, 0); solid(x, T5, -36.1, 0.95, 0.25, 0.5, 0, 'concrete'); }
  for (const [m, x, z] of [['fv_bush', -46.9, -36.2], ['fv_bush', -46.9, -58.9], ['fv_shrub', -13.1, -58.9], ['fv_palm', -46.6, -41.5]] as const) {
    merger.add(`favela/${m}.glb`, x, T5, z, 0);
    solid(x, T5, z, 0.5, 0.5, 1.5);
  }
  // Quadra: chain-link on the south retaining parapet (not over the climb gap) and along the ravine side
  for (let x = -46.5; x < -16; x += 3) if (x < -32 || x > -26.5) merger.add('favela/fv_fence.glb', x, T2 + 1.1, 16, 0);
  for (let z = -6.5; z < 3; z += 3) merger.add('favela/fv_fence.glb', -16, T2 + 1.1, z, Math.PI / 2);
  // Substation: fence on the ravine-edge parapet, the gantry behind the north wall
  for (let x = -10.5; x < 4; x += 3) merger.add('favela/fv_fence.glb', x, T5 + 1.1, -44, 0);
  merger.add('favela/fv_gantry.glb', -4, T5 - 0.5, -63.5, 0);
  merger.add('favela/fv_gantry.glb', -4, T5 - 0.5, -68.5, 0, undefined, 0.9);
  // The cable-car station hall on the crest (receives the line behind the top station), the bottom station's cap
  merger.add('favela/fv_station_hall.glb', 13, T5 - 0.4, -70.5, 0.12);
  merger.add('favela/fv_station_cap.glb', -44, T2 + 6, 12, 0);
}

/** Glow halos (one Points draw per colour) and light pools (one instanced draw) for every lamp fixture. */
function glowPoints(ctx: MapDecorateContext, pts: THREE.Vector3[], color: number, size: number): THREE.Points | null {
  if (!pts.length) return null;
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.PointsMaterial({ map: ctx.M.tex.glow, color, size, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.name = 'fv:glow';
  ctx.root.add(p);
  return p;
}
function poolMesh(ctx: MapDecorateContext, pools: [number, number, number, number][], mat: THREE.Material): THREE.InstancedMesh | null {
  if (!pools.length) return null;
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(g, mat, pools.length);
  const m4 = new THREE.Matrix4();
  pools.forEach(([x, y, z, s], i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y + 0.03, z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s))));
  im.name = 'fv:light-pools';
  im.frustumCulled = false;
  ctx.root.add(im);
  return im;
}

/** A ridge line around the bay: a curved strip (radius `R` around the map) whose crest is layered noise, forested
 *  low, bare rock on the steep high points, blended toward the horizon haze by `haze`. */
function ridgeBand(R: number, H: number, haze: number, seed: number, horizon: THREE.Color, a0 = -0.15 * Math.PI, a1 = 0.36 * Math.PI): THREE.BufferGeometry {
  const r = rng(seed);
  const n = 90; // an arc (angles around the map, 0 = +X, PI/2 = the open sea to the south)
  const ph = Array.from({ length: 6 }, () => r() * 10);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const forest = new THREE.Color(0x2c4430), rock = new THREE.Color(0x585460), c = new THREE.Color();
  const rows = [0, 0.45, 0.8, 1];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const u = i / n;
    let h = 0.35 + 0.25 * Math.sin(u * 9 + ph[0]) + 0.18 * Math.sin(u * 23 + ph[1]) + 0.1 * Math.sin(u * 51 + ph[2]) + 0.05 * Math.sin(u * 113 + ph[3]);
    h += 0.5 * Math.pow(Math.max(0, Math.sin(u * 4.3 + ph[4])), 6); // the odd taller summit
    h = Math.max(0.12, h) * H * (0.6 + 0.4 * Math.sin(u * Math.PI));
    const x = Math.cos(a) * R, z = 40 + Math.sin(a) * R; // (inside the camera's 700 m far plane)
    for (const t of rows) {
      const rr = 1 + (1 - t) * 0.06; // the base spreads outward a little: the silhouette leans back
      pos.push(x * rr, -44 + h * t, (z - 40) * rr + 40);
      c.copy(forest).lerp(rock, t > 0.7 && h > H * 0.45 ? (t - 0.7) * 2.5 : 0).lerp(horizon, haze);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < rows.length - 1; k++) {
    const p0 = i * rows.length + k, p1 = (i + 1) * rows.length + k;
    idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Procedural granite dome / ridge for the bay (a generic peak, not a landmark copy). Vertex-coloured, unfogged. */
function mountain(x: number, z: number, h: number, rad: number, kind: 'dome' | 'ridge', seed: number, horizon: THREE.Color): THREE.BufferGeometry {
  const r = rng(seed);
  const rings = 22, segs = 40;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const granite = new THREE.Color(0x46424e), streak = new THREE.Color(0x2c2a34), forest = new THREE.Color(0x2e4630), rim = new THREE.Color(0xd08a6a), c = new THREE.Color();
  const ph = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings; // 0 base .. 1 top
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const lump = 1 + 0.12 * Math.sin(a * 3 + ph[0] + t * 2) + 0.07 * Math.sin(a * 7 + ph[1]) + 0.05 * Math.sin(a * 13 + ph[2] + t * 6) + 0.03 * Math.sin(a * 29 + t * 9);
      // dome: a steep bare face, the crown off-centre, a long forested shoulder on one side; ridge: broad and low
      const prof = kind === 'dome' ? Math.pow(Math.max(0, 1 - Math.pow(t, 1.7)), 0.62) * (1 - 0.2 * t) * (1 + 0.5 * (1 - t) * Math.max(0, Math.cos(a - 0.6))) : Math.pow(1 - t, 0.8);
      const rr = rad * prof * lump * (kind === 'ridge' ? (1 + 0.9 * Math.abs(Math.cos(a))) : 1 + 0.25 * Math.max(0, Math.cos(a)));
      const y = -44 + h * t;
      pos.push(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr);
      const s = Math.pow(Math.abs(Math.sin(a * 23 + ph[1])), 6);
      c.copy(granite).lerp(streak, s * 0.7);
      if (t < 0.3 + 0.1 * Math.sin(a * 5)) c.copy(forest);
      if (Math.sin(a) < -0.3 && t > 0.3) c.lerp(rim, 0.25 * (t - 0.3)); // warm edge facing the sunset
      c.lerp(horizon, 0.3);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a0 = i * (segs + 1) + j, b0 = a0 + segs + 1;
    idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Facade detail on the def's long walls (the street front, the beco side, the samba hall) and the hall's bunting:
 *  concrete columns and slab bands (merged into the map's concrete batch), AC units, pipes and meter boxes and
 *  pennant strings (one vertex-coloured mesh). */
function buildFacades(ctx: MapDecorateContext): void {
  const S = favelaSurfaces();
  const B = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material = S.concrete) => ctx.batch.add(m, worldBox(x0, y0, z0, x1, y1, z1));
  const bits = flatBin!;
  const r = rng(77);
  // Bottom street, north side (house fronts at z 30, facing +Z): a column at every change of house, the first-floor
  // slab edge running along the whole row, and the clutter of self-built fronts.
  const zf = 30.15;
  for (const x of [-11, -3, 2, 9, 16.5, 24, 30]) B(x - 0.16, T0, zf - 0.02, x + 0.16, T0 + 3.7, zf + 0.1);
  B(-18, T0 + 3.42, zf - 0.02, 36, T0 + 3.7, zf + 0.26);
  for (const [x, y] of [[-9.4, T0 + 2.5], [-1.2, T0 + 2.6], [11.4, T0 + 2.55], [19.6, T0 + 2.5], [27.6, T0 + 2.6], [33.2, T0 + 2.5]] as const) {
    bits.box(x - 0.36, y, zf, x + 0.36, y + 0.46, zf + 0.3, 0xdcd8cf); // AC unit
    bits.box(x - 0.2, y + 0.1, zf + 0.3, x + 0.2, y + 0.36, zf + 0.31, 0x3a3a38);
    bits.box(x + 0.3, T0, zf + 0.02, x + 0.33, y, zf + 0.05, 0x9c9c98); // drain line
  }
  for (const x of [-17.2, -4.2, 7.8, 15.8, 29.2, 35.2]) bits.box(x, T0, zf, x + 0.1, T0 + 3.7, zf + 0.1, 0x9c9c98); // downpipes
  for (const x of [-12.4, 1.2, 10.2, 23.2]) { bits.box(x, T0 + 1.3, zf, x + 0.34, T0 + 1.8, zf + 0.14, 0xe8e6e0); bits.box(x + 0.15, T0 + 1.8, zf + 0.05, x + 0.18, T0 + 3.4, zf + 0.08, 0x2a2a2a); }
  // Beco east side (the house rows' west walls at x -13.6, facing -X): columns + slab bands at each row's floor.
  const xb = -13.75;
  for (const z of [8, 16, 24, 30]) B(xb - 0.1, T0, z - 0.16, xb + 0.02, T3, z + 0.16);
  for (const y of [T1 + 3.5, T2 + 3.5]) B(xb - 0.22, y - 0.25, 3, xb + 0.02, y, 30);
  for (const [z, y] of [[26.5, T0 + 2.4], [12.5, T2 + 2.2], [20.5, T1 + 2.6]] as const) bits.box(xb - 0.3, y, z - 0.36, xb, y + 0.46, z + 0.36, 0xdcd8cf);
  // Samba hall: columns and a ring beam outside on the laje face, bunting strings under the roof inside.
  for (const x of [2.15, 9, 16, 23, 29.85]) B(x - 0.18, T3, -23.85, x + 0.18, T5 + 0.3, -23.6);
  B(2, T5 - 0.3, -23.85, 30, T5 + 0.3, -23.55);
  const pennant = [0xe8327a, 0xf5c518, 0x12a89a, 0x1f5fc8, 0xf26a1b, 0x3cb043, 0xf2efe8];
  for (let k = 0; k < 6; k++) {
    const z0 = -38.5 + k * 2.6;
    const a = new THREE.Vector3(2.3, T5 - 0.4, z0 + (r() - 0.5)), b = new THREE.Vector3(29.7, T5 - 0.4, z0 + 1.5 + (r() - 0.5));
    const n = 44;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 0.8) / n, sag = (t: number) => 1.1 * 4 * t * (1 - t);
      const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
      p0.y -= sag(t0); p1.y -= sag(t1);
      const tip = p0.clone().lerp(p1, 0.5); tip.y -= 0.32;
      bits.tri(p0, p1, tip, pennant[(i + k) % pennant.length]);
    }
  }
}

/** The def's dressing props (DRESS_PROPS): one InstancedMesh per model mesh, so seven tables cost one draw call. */
const SHADOW_PROPS = new Set(['fv_water_tower', 'fv_canopy', 'fv_transformer']);
function buildDressProps(ctx: MapDecorateContext, mats: FvMats): void {
  const byModel = new Map<string, DressProp[]>();
  for (const p of DRESS_PROPS) { let a = byModel.get(p.model); if (!a) byModel.set(p.model, (a = [])); a.push(p); }
  for (const [model, list] of byModel) {
    void models.load(model).then((lm) => {
      if (!lm) return;
      const scene = lm.scene;
      scene.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
      const id = model.replace(/^.*\//, '').replace(/\.glb$/, '');
      const place = list.map((p) => {
        const s = p.fitHeight ? p.fitHeight / Math.max(1e-3, size.y) : p.scale ?? 1;
        return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(s, s, s));
      });
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const swap = (m: THREE.Material) => mats.byName.get(m.name) ?? m;
        const mat = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
        const im = new THREE.InstancedMesh(mesh.geometry, mat, place.length);
        const m4 = new THREE.Matrix4();
        place.forEach((pm, i) => im.setMatrixAt(i, m4.multiplyMatrices(pm, mesh.matrixWorld)));
        im.computeBoundingSphere();
        im.castShadow = SHADOW_PROPS.has(id);
        im.receiveShadow = true;
        im.name = `fv:prop:${id}`;
        ctx.root.add(im);
      });
    });
  }
}

export function decorateFavela(ctx: MapDecorateContext): void {
  const mats = favelaMats(ctx);
  const root = ctx.root;
  Object.assign(anim, { cabins: [], peakCab: null, wheels: [], festoons: [], neon: mats.neon, floodHead: mats.floodHead, floodPools: [], sodium: mats.sodium, sodiumGlow: [], kites: [], upDone: false, lastRide: null, power: false });
  cableBin = [];
  flatBin = new FlatBits();
  buildTerrain(ctx);
  const dress = new KitMerger();
  buildHouses(ctx, dress);
  buildVista(ctx);

  // ---- Fall guards: invisible, movement-only walls above every parapet so nobody mantles off a terrace ----
  for (const w of FAVELA.walls) {
    if (w.y1 - w.y0 > 1.3 || (w.thickness ?? 0.3) > 0.26) continue;
    const t = (w.thickness ?? 0.25) / 2;
    const [x0, z0, x1, z1] = w.axis === 'x' ? [w.a0, w.at - t, w.a1, w.at + t] : [w.at - t, w.a0, w.at + t, w.a1];
    const ops = (w.openings ?? []).map((o) => [o.a, o.b]);
    // Split around openings (the bridge gap on the laje stays open).
    let cur = w.a0;
    for (const [a, b] of [...ops, [w.a1, w.a1]].sort((p, q) => p[0] - q[0])) {
      if (a - cur > 0.05) {
        if (w.axis === 'x') ctx.world.add(cur, w.y1, z0, a, w.y0 + 3.2, z1, { solid: false });
        else ctx.world.add(x0, w.y1, cur, x1, w.y0 + 3.2, a, { solid: false });
      }
      cur = Math.max(cur, b);
    }
    void x1; void z1;
  }
  // Climb gaps in the parapets (zombies come up through them on nav links; players must not fall down them),
  // the stands' ravine side and the mirante's hillside gap.
  ctx.world.add(23, T0, 37.85, 24.6, T0 + 3.2, 38.15, { solid: false });
  ctx.world.add(-30, T2, 15.85, -28.6, T2 + 3.2, 16.15, { solid: false });
  ctx.world.add(33.85, T3, -7.7, 34.15, T3 + 3.2, -6.3, { solid: false });
  ctx.world.add(-41.8, T5, -60.15, -40.2, T5 + 4, -59.85, { solid: false });
  ctx.world.add(-16.15, T3 + 1.1, -18, -15.85, T3 + 3.2, -8, { solid: false });
  // Fall guards over the see-through railings (bridge, lookout) and the railings themselves.
  ctx.world.add(-16, T3 + 1.1, -22.16, -2, T3 + 3.2, -22.04, { solid: false });
  ctx.world.add(-16, T3 + 1.1, -18.96, -2, T3 + 3.2, -18.84, { solid: false });
  ctx.world.add(-45.6, T5 + 1.1, -35.06, -12, T5 + 3.2, -34.94, { solid: false });
  const rails = flatBin!;
  const railing = (x0: number, x1: number, z: number, y: number) => {
    const n = Math.max(1, Math.round((x1 - x0) / 1.4));
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; rails.box(x - 0.03, y, z - 0.03, x + 0.03, y + 1.08, z + 0.03, 0x3c4246); }
    rails.box(x0, y + 1.04, z - 0.035, x1, y + 1.1, z + 0.035, 0x2f8a86);
    rails.box(x0, y + 0.55, z - 0.02, x1, y + 0.59, z + 0.02, 0x3c4246);
    rails.box(x0, y + 0.1, z - 0.02, x1, y + 0.14, z + 0.02, 0x3c4246);
  };
  railing(-16, -2, -22.1, T3); railing(-16, -2, -18.9, T3); railing(-45.6, -12, -35, T5);
  // Pipe handrails up the stair alleys: the beco's two flights, the long escadaria and the station stair (wall-mounted).
  const handSpans: [P3, P3, number][] = [];
  const handrail = (x: number, z0: number, y0: number, z1: number, y1: number, dx: number) => {
    handSpans.push([{ x, y: y0 + 0.95, z: z0 }, { x, y: y1 + 0.95, z: z1 }, 0]);
    const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 1.6));
    for (let i = 0; i <= n; i++) { const t = i / n, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t; rails.box(x - 0.02, y + 0.78, z - 0.02, x + 0.02, y + 0.95, z + 0.02, 0x3c4246); rails.box(Math.min(x, x + dx), y + 0.8, z - 0.015, Math.max(x, x + dx), y + 0.83, z + 0.015, 0x3c4246); }
  };
  handrail(-15.75, 30, T0, 21, T1, -0.12); handrail(-15.75, 17, T1, 8, T2, -0.12); handrail(-13.85, 30, T0, 21, T1, 0.12);
  handrail(-47.75, -8, T2, -35, T5, -0.12); handrail(32.15, -26, T3, -44, T5, 0.12);
  const hr = cables(handSpans, 0.025, mats.cable);
  if (hr) root.add(hr);

  // ---- Cable car: pier + pylon in the ravine, cables, two cabins, drive wheels, the peak line ----
  dress.add('favela/fv_pylon.glb', PYLON.x, PYLON.top - 16, PYLON.z, Math.atan2(CABLE[3].x - CABLE[1].x, CABLE[3].z - CABLE[1].z) + Math.PI / 2);
  const lineA = CABLE.slice(1), lineB = CABLE.slice(1).map((p) => ({ x: p.x + 1.1, y: p.y + 0.15, z: p.z + 0.9 }));
  const spans: [P3, P3, number][] = [];
  for (const line of [lineA, lineB]) for (let i = 0; i < line.length - 1; i++) spans.push([line[i], line[i + 1], i === 1 ? 1.6 : 0.3]);
  // The line runs on past the top station into the hillside anchor, and the peak line climbs to the summit.
  spans.push([CABLE[CABLE.length - 1], { x: 12, y: 30.5, z: -64 }, 0.2]);
  for (let i = 0; i < PEAK_CABLE.length - 1; i++) spans.push([PEAK_CABLE[i], PEAK_CABLE[i + 1], i === 2 ? 0.8 : 0]);
  const cm = cables(spans, 0.045, mats.cable);
  if (cm) { cm.name = 'fv:cables'; root.add(cm); }
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    g.name = `fv:cabin${i}`;
    root.add(g);
    anim.cabins.push(g);
    placeKit(g, mats, 'favela/fv_gondola_cabin.glb', 0, 0, 0, 0);
  }
  const pc = new THREE.Group();
  pc.name = 'fv:peak-cabin';
  root.add(pc);
  anim.peakCab = pc;
  placeKit(pc, mats, 'favela/fv_gondola_cabin.glb', 0, 0, 0, 0);
  // Summit: rocks, a railing, a pedestal glow
  const rockM = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1, flatShading: true });
  const rr = rng(5);
  // Rock outcrop under the summit platform: every rock's top stays below the walkable top (y = PEAK.y).
  const rockGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const rad = 2.5 + rr() * 3.5;
    const a = (i / 9) * Math.PI * 2;
    const cx = (PEAK.x0 + PEAK.x1) / 2 + Math.cos(a) * 3.5, cz = (PEAK.z0 + PEAK.z1) / 2 + Math.sin(a) * 3.5;
    rockGeos.push(new THREE.DodecahedronGeometry(rad, 0).scale(1, 2.2, 1).translate(cx, PEAK.y - 0.4 - rad * 2.2, cz).toNonIndexed());
  }
  const rocks = mergeGeometries(rockGeos, false);
  if (rocks) { rocks.computeVertexNormals(); root.add(new THREE.Mesh(rocks, rockM)); }
  // Summit railing so the view reads as a lookout
  const prGeos: THREE.BufferGeometry[] = [];
  for (const [x0, z0, x1, z1] of [[PEAK.x0, PEAK.z0, PEAK.x1, PEAK.z0], [PEAK.x0, PEAK.z1, PEAK.x1, PEAK.z1], [PEAK.x0, PEAK.z0, PEAK.x0, PEAK.z1], [PEAK.x1, PEAK.z0, PEAK.x1, PEAK.z1]]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    prGeos.push(new THREE.BoxGeometry(x1 === x0 ? 0.06 : len, 0.06, z1 === z0 ? 0.06 : len).translate((x0 + x1) / 2, PEAK.y + 1.05, (z0 + z1) / 2));
  }
  const pr = mergeGeometries(prGeos, false);
  if (pr) root.add(new THREE.Mesh(pr, ctx.mat('steel')));
  const ped = glowSprite(0x80f0ff, 3.5);
  ped.position.set(24, PEAK.y + 1.3, -84.2);
  root.add(ped);

  // ---- Wire tangle: poles along the street, beco, laje and quadra; spans between poles and house walls ----
  const polesAt: [number, number, number, number][] = [
    [-12, T0, 30.45, 0], [2, T0, 30.45, 0], [16.5, T0, 30.45, 0], [30, T0, 30.45, 0], [-5, T0, 37.7, 0], [18, T0, 37.7, 0],
    [3, T3, 6.9, 0], [21, T3, -22.6, 0], [33.4, T3, -9, 0], [-1.5, T3, -2, 0],
    [-39.5, T2, 15.6, 0], [-17, T2, -7.6, 0], [-44.5, T5, -35.6, 0], [-13, T5, -36.2, 0],
  ];
  const polePts: P3[] = [];
  for (const [x, y, z, yaw] of polesAt) { dress.add('favela/fv_pole.glb', x, y, z, yaw); polePts.push({ x, y: y + 7.8, z }); ctx.world.add(x - 0.14, y, z - 0.14, x + 0.14, y + 8.5, z + 0.14, { surface: 'concrete' }); }
  const wr = rng(17);
  const wireSpans: [P3, P3, number][] = [];
  const near = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.z - b.z);
  for (let i = 0; i < polePts.length; i++) for (let j = i + 1; j < polePts.length; j++) {
    const d = near(polePts[i], polePts[j]);
    if (d < 26 && Math.abs(polePts[i].y - polePts[j].y) < 9) for (let k = 0; k < 3; k++) wireSpans.push([{ ...polePts[i], y: polePts[i].y - k * 0.25 }, { ...polePts[j], y: polePts[j].y - k * 0.3 }, 0.6 + wr() * 1.4]);
  }
  // Random drops from each pole to nearby house walls (the tangle)
  for (const p of polePts) for (let k = 0; k < 6; k++) {
    const a = wr() * Math.PI * 2, d = 4 + wr() * 9;
    wireSpans.push([p, { x: p.x + Math.cos(a) * d, y: p.y - 1.5 - wr() * 3.5, z: p.z + Math.sin(a) * d }, 0.3 + wr() * 0.8]);
  }
  // Over the beco: house to house at several heights
  for (let z = 10; z < 30; z += 2.2) wireSpans.push([{ x: -16.1, y: 10.5 + wr() * 3 + (30 - z) * 0.15, z }, { x: -13.5, y: 10.5 + wr() * 3 + (30 - z) * 0.15, z: z + (wr() - 0.5) * 2 }, 0.3]);
  const wm = cables(wireSpans, 0.018, mats.cable);
  if (wm) { wm.name = 'fv:wires'; root.add(wm); }
  // Kites snagged on the wires (they sway)
  for (let k = 0; k < 7; k++) {
    const s = wireSpans[Math.floor(wr() * Math.min(wireSpans.length, 60))];
    const t = 0.3 + wr() * 0.4;
    const kp = { x: s[0].x + (s[1].x - s[0].x) * t, y: s[0].y + (s[1].y - s[0].y) * t - s[2] * 4 * t * (1 - t) - 0.4, z: s[0].z + (s[1].z - s[0].z) * t };
    dress.add('favela/fv_kite.glb', kp.x, kp.y - 0.4, kp.z, wr() * Math.PI, undefined, 1.3);
  }
  // Hanging wire bundles (Meshy) on a few poles
  for (const i of [1, 3, 7]) { const p = polesAt[i]; placeKit(root, mats, 'favela/fv_wires.glb', p[0], p[1] + 5.8, p[2] + 0.3, 0.4, 0.8); }

  // ---- Festoon strings (post-power chase lights) over the laje, the street and the stands ----
  const fr = rng(23);
  const festoonSpans: [P3, P3, number][] = [
    [{ x: 1, y: 20.5, z: 6 }, { x: 14, y: 22.5, z: -5 }, 1.2], [{ x: 14, y: 22.5, z: -5 }, { x: 32, y: 20.2, z: 5 }, 1.4], [{ x: 3, y: 20, z: -20 }, { x: 14, y: 22.5, z: -7 }, 1.1],
    [{ x: 14, y: 22.5, z: -7 }, { x: 31, y: 20.5, z: -21 }, 1.3], [{ x: -12, y: 10.8, z: 30.3 }, { x: 16, y: 10.6, z: 37.8 }, 1.1], [{ x: 16, y: 10.6, z: 30.3 }, { x: 34, y: 10.4, z: 37.8 }, 0.9],
    [{ x: -44, y: 21, z: -21.8 }, { x: -17, y: 20.6, z: -21.8 }, 1.4],
    // samba hall: criss-cross strings under the roof
    [{ x: 2.4, y: T5 - 0.7, z: -39 }, { x: 29.6, y: T5 - 0.7, z: -25 }, 1.0], [{ x: 2.4, y: T5 - 0.7, z: -25 }, { x: 29.6, y: T5 - 0.7, z: -39 }, 1.0],
    [{ x: 2.4, y: T5 - 0.9, z: -32 }, { x: 29.6, y: T5 - 0.9, z: -32 }, 0.8],
    // the escadaria (strung from lamp post to lamp post up the long stair) and across the mirante
    [{ x: -46.8, y: T2 + 3.2, z: -9 }, { x: -46.8, y: 18.6, z: -18 }, 0.5], [{ x: -46.8, y: 18.6, z: -18 }, { x: -46.8, y: 22.6, z: -27 }, 0.5],
    [{ x: -46.8, y: 22.6, z: -27 }, { x: -46.8, y: T5 + 3.3, z: -34.5 }, 0.4],
    [{ x: -47.5, y: T5 + 3.6, z: -41 }, { x: -13, y: T5 + 3.4, z: -41 }, 1.4], [{ x: -47.5, y: T5 + 3.6, z: -53 }, { x: -13, y: T5 + 3.4, z: -53 }, 1.4],
  ];
  const fwire = cables(festoonSpans, 0.012, mats.cable);
  if (fwire) root.add(fwire);
  const bulbPts: THREE.Vector3[] = [];
  for (const [a, b, sag] of festoonSpans) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0.6; d < len; d += 0.9) { const t = d / len; bulbPts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t) - 0.08, a.z + (b.z - a.z) * t)); }
  }
  const palette = [0xffd28a, 0xff6a8a, 0x7ad8ff, 0xffe066, 0x9dff8a];
  {
    // One instanced draw for every bulb; the chase is written into the instance colours each frame.
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), mat, bulbPts.length);
    const m4 = new THREE.Matrix4();
    const base: THREE.Color[] = [];
    bulbPts.forEach((v3, i) => { im.setMatrixAt(i, m4.makeTranslation(v3.x, v3.y, v3.z)); const c = new THREE.Color(palette[Math.floor(fr() * palette.length)]); base.push(c); im.setColorAt(i, c); });
    im.name = 'fv:festoon';
    im.computeBoundingSphere();
    root.add(im);
    anim.festoons.push({ bulbs: im, mat, phase: 0, base });
  }

  // ---- Quadra floodlight masts (dark until the power comes on) + light pools on the pitch ----
  const masts: [number, number, number][] = [[-45.5, -7.2, 0], [-17.5, -7.2, 0], [-39, 15.4, Math.PI], [-17.5, 15.4, Math.PI]];
  for (const [x, z, yaw0] of masts) {
    const yaw = Math.atan2(-30 - x, 4 - z);
    dress.add('favela/fv_floodlight.glb', x, T2, z, yaw, undefined, 1, { fv_bulb: 'fv_floodhead' });
    ctx.world.add(x - 0.18, T2, z - 0.18, x + 0.18, T2 + 11, z + 0.18, { surface: 'metal' });
    void yaw0;
  }
  for (const [x, z, s] of [[-36, 0, 16], [-24, 8, 16], [-30, -2, 12]] as const) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(s, s), ctx.M.lightPoolCold.clone());
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, T2 + 0.03, z);
    pool.visible = false;
    root.add(pool);
    anim.floodPools.push(pool);
  }
  // Pitch markings
  const line = ctx.mat({ color: 0xe8e4d8, roughness: 0.8 });
  const L = (x0: number, z0: number, x1: number, z1: number) => ctx.batch.add(line, boxGeo(x0, T2 + 0.012, z0, x1, T2 + 0.022, z1));
  L(-42, -4, -22, -3.9); L(-42, 11.9, -22, 12); L(-42, -4, -41.9, 12); L(-22.1, -4, -22, 12); L(-32.05, -4, -31.95, 12);
  for (const sx of [-42, -22]) { const d = sx < -30 ? 1 : -1; L(Math.min(sx, sx + d * 4), 0, Math.max(sx, sx + d * 4), 0.1); L(Math.min(sx, sx + d * 4), 8, Math.max(sx, sx + d * 4), 8.1); L(sx + d * 4 - 0.05, 0, sx + d * 4 + 0.05, 8.1); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.0, 40), line);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(-32, T2 + 0.02, 4);
  root.add(ring);

  // ---- Lamp fixtures: sodium street lamps and wall lamps on every tier, each with a glow halo and a light pool
  // on the ground (no real lights: the def's 12 point lights carry the actual illumination).
  const sodiumPts: THREE.Vector3[] = [], lampPts: THREE.Vector3[] = [], sodiumPools: [number, number, number, number][] = [];
  const streetLamp = (x: number, y: number, z: number, yaw: number) => {
    dress.add('favela/fv_streetlamp.glb', x, y, z, yaw);
    ctx.world.add(x - 0.1, y, z - 0.1, x + 0.1, y + 6.4, z + 0.1, { surface: 'metal' });
    const hx = x + Math.sin(yaw) * 1.62, hz = z + Math.cos(yaw) * 1.62;
    sodiumPts.push(new THREE.Vector3(hx, y + 6.18, hz));
    sodiumPools.push([hx, y, hz, 9]);
  };
  streetLamp(-8, T0, 30.6, 0); streetLamp(22, T0, 30.6, 0); streetLamp(8.2, T0, 37.7, Math.PI); streetLamp(31, T0, 37.7, Math.PI); streetLamp(-12.5, T0, 37.7, Math.PI);
  streetLamp(-17, T2, 14.6, Math.PI * 0.75); streetLamp(33.4, T3, -21, -Math.PI / 2); streetLamp(-1.6, T3, -12, Math.PI / 2); streetLamp(-13.4, T5, -43.4, Math.PI * 0.6);
  // wall lamps: [x, y, z, yaw (bulb direction), sodium?, floor under it for the light pool (null: none)]
  const wallLamps: [number, number, number, number, boolean, number | null][] = [
    [-15.85, 12.6, 19, Math.PI / 2, true, T1], [-15.85, T0 + 3.6, 27.5, Math.PI / 2, false, becoY(27.5)], [-15.85, T2 + 2.8, 5.5, Math.PI / 2, false, T2],
    [8, T3 + 3.1, -23.85, 0, true, T3], [25.5, T3 + 3.1, -23.85, 0, false, T3], [31.5, T3 + 2.6, -23.85, 0, false, T3],
    [-47.85, 17.3, -14, Math.PI / 2, true, null], [-47.85, 20.8, -22, Math.PI / 2, false, null], [-47.85, 24.4, -30, Math.PI / 2, true, null],
    [-40, T5 + 2.8, -59.85, 0, true, T5], [-26, T5 + 2.8, -59.85, 0, false, T5], [32.25, 20.3, -30, -Math.PI / 2, false, null], [32.25, 24.7, -40, -Math.PI / 2, true, null],
    [26, T5 + 3, -59.85, 0, false, T5], [-8, T5 + 3, -59.85, 0, true, T5], [-39.85, T2 + 4.5, 15.7, Math.PI / 2, false, T2], [9.85, T0 + 2.6, 39.2, -Math.PI / 2, false, T0],
  ];
  for (const [x, y, z, yaw, sod, floorY] of wallLamps) {
    dress.add('favela/fv_walllamp.glb', x, y, z, yaw);
    const bx = x + Math.sin(yaw) * 0.45, bz = z + Math.cos(yaw) * 0.45;
    (sod ? sodiumPts : lampPts).push(new THREE.Vector3(bx, y - 0.1, bz));
    if (floorY !== null) sodiumPools.push([bx + Math.sin(yaw) * 0.9, floorY, bz + Math.cos(yaw) * 0.9, sod ? 6 : 4.5]);
  }
  for (const [p, c, sz] of [[glowPoints(ctx, sodiumPts, 0xff9a3a, 3.2), 0, 0], [glowPoints(ctx, lampPts, 0xffd08a, 2.0), 0, 0]] as const) {
    void c; void sz;
    if (p) anim.sodiumGlow.push(p.material as THREE.PointsMaterial);
  }
  poolMesh(ctx, sodiumPools, ctx.M.lightPoolWarm);

  // ---- Murals (as geometry): the samba hall's face over the laje, the quadra wall, the beco ----
  dress.add('favela/fv_mural_b.glb', 22.2, T3 + 1.3, -23.82, 0, undefined, 1);
  dress.add('favela/fv_mural_a.glb', 16, T3 + 2.7, -39.82, 0, undefined, 1); // the samba stage backdrop (inside)
  dress.add('favela/fv_mural_c.glb', 29.82, T3 + 1.6, -34.5, -Math.PI / 2, undefined, 0.9); // hall east wall, behind the rails
  dress.add('favela/fv_mural_a.glb', -47.82, T2 + 0.9, 3.5, Math.PI / 2, undefined, 1);
  dress.add('favela/fv_mural_c.glb', -15.82, T0 + 3.2, 25.6, Math.PI / 2, undefined, 0.9);
  dress.add('favela/fv_mural_b.glb', -24, T5 + 0.2, -59.82, 0, undefined, 0.8);
  dress.add('favela/fv_mural_c.glb', 8.4, T0 + 0.5, 45.82, Math.PI, undefined, 0.7);

  // ---- Neon (post-power): abstract loops over the samba mural and on the lanchonete front ----
  const neonGeos: THREE.BufferGeometry[][] = [[], [], []];
  const loop = (cx: number, cy: number, z: number, rx: number, ry: number, k: number, dir = 1) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(new THREE.Vector3(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z + dir * 0.05)); }
    neonGeos[k].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 60, 0.045, 5, true));
  };
  const wave = (x0: number, x1: number, y: number, z: number, amp: number, k: number, dir = 1) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) { const x = x0 + ((x1 - x0) * i) / 30; pts.push(new THREE.Vector3(x, y + Math.sin(i * 0.9) * amp, z + dir * 0.05)); }
    neonGeos[k].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.045, 5, false));
  };
  loop(22.2, T3 + 6.6, -23.8, 1.1, 1.1, 1); loop(22.2, T3 + 6.6, -23.8, 1.5, 1.5, 0); wave(17.5, 27, T3 + 6.9, -23.8, 0.25, 2); wave(8, 13.2, T3 + 4.4, -23.8, 0.3, 0);
  loop(3, T0 + 3.45, 37.8, 0.5, 0.2, 0); wave(-3.4, 1.6, T0 + 3.47, 37.8, 0.1, 1); wave(4.4, 9.4, T0 + 3.47, 37.8, 0.1, 2); // above the awning
  {
    const all: THREE.BufferGeometry[] = [];
    neonGeos.forEach((gs, k) => gs.forEach((g) => {
      const c = new THREE.Color([0xff3fbf, 0x2ef2ff, 0xffd23a][k]), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      all.push(g);
    }));
    const g = all.length ? mergeGeometries(all, false) : null;
    if (g) { const m = new THREE.Mesh(g, mats.neon[0]); m.name = 'fv:neon'; root.add(m); }
  }

  // ---- Laundry lines, rebar stubs, grilles ----
  for (const [x, y, z, yaw] of [[8, T3, -3, 0.2], [26, T3 + 1.6, 0.5, 1.4], [-14.8, T1 + 1.6, 26, Math.PI / 2], [4, T0 + 1.9, 36.8, 0], [-30, T3 + 0.2, -20.4, 0], [-30, T5, -41, 0]] as const) dress.add('favela/fv_laundry.glb', x, y, z, yaw);
  for (const [x, y, z] of [[-1.8, T3 + 1.1, 7.8], [33.8, T3 + 1.1, 7.8], [33.8, T3 + 1.1, -23.8], [-45.4, T2 + 1.1, -7.9], [-12.2, T5 + 1.1, -35.2], [4, T5 + 1.1, -44]] as const) dress.add('favela/fv_rebar.glb', x, y, z, 0);
  for (const [x, y, z, yaw] of [[14.02, T1 + 1.0, 21, Math.PI / 2], [14.02, T2 + 1.0, 13, Math.PI / 2], [-4.02, T0 + 1.0, 42, -Math.PI / 2], [10.02, T0 + 1.0, 40, Math.PI / 2]] as const) dress.add('favela/fv_grille.glb', x, y, z, yaw);

  // ---- The zipline's cable and anchor poles, the tin-roof slide's corrugated cascade ----
  const zipSpan: [P3, P3, number][] = [[{ x: ZIP.a.x + 1.9, y: T5 + 3.8, z: ZIP.a.z + 1.8 }, { x: ZIP.b.x - 1, y: T3 + 2.7, z: ZIP.b.z - 1.1 }, 0.9]];
  const zm = cables(zipSpan, 0.03, mats.cable);
  if (zm) root.add(zm);
  dress.add('favela/fv_pole.glb', ZIP.a.x + 2, T5, ZIP.a.z + 1.9, 0, undefined, 0.55);
  dress.add('favela/fv_pole.glb', ZIP.b.x - 1.1, T3, ZIP.b.z - 1.2, 0, undefined, 0.4);
  for (let i = 1; i < SLIDE_PATH.length - 1; i++) {
    const a = SLIDE_PATH[i], b = SLIDE_PATH[i + 1];
    const yaw = Math.PI;
    const drop = a.y - b.y;
    dress.addM('favela/fv_tinroof.glb', new THREE.Matrix4().compose(new THREE.Vector3(31, b.y - 0.35, (a.z + b.z) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(drop - 0.5, Math.max(1, b.z - a.z)) * 0.6, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
  }
  // Water tower ladder is drawn by the runtime from def.ladders; the tank top gets a railing ring for readability.
  const railGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    railGeos.push(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4).translate(TOWER.x + Math.cos(a) * 1.75, TOWER.top + 0.5, TOWER.z + Math.sin(a) * 1.75));
  }
  railGeos.push(new THREE.TorusGeometry(1.75, 0.025, 4, 32).rotateX(Math.PI / 2).translate(TOWER.x, TOWER.top + 1.0, TOWER.z));
  const rail = mergeGeometries(railGeos.map((g) => g.toNonIndexed()), false);
  if (rail) root.add(new THREE.Mesh(rail, ctx.mat('steel')));
  // Row A's street front: window panes with grilles, sills, a painted base band (the wall itself is data)
  const paneDark = mats.byName.get('fv_window_dark')!, paneLit = mats.byName.get('fv_window_lit')!;
  const paneGeosD: THREE.BufferGeometry[] = [], paneGeosL: THREE.BufferGeometry[] = [];
  for (const [x, lit] of [[-11.2, false], [-2.6, true], [9.5, true], [12.6, false], [21, false], [26.5, true]] as const) {
    (lit ? paneGeosL : paneGeosD).push(new THREE.PlaneGeometry(1.1, 1.0).translate(x, T0 + 1.95, 30.17));
    dress.add('favela/fv_grille.glb', x, T0 + 1.4, 30.16, 0);
  }
  for (const [gs, m] of [[paneGeosD, paneDark], [paneGeosL, paneLit]] as const) { const g = mergeGeometries(gs, false); if (g) root.add(new THREE.Mesh(g, m)); }
  // Stacked houses on the roofs of the house rows (visual only: the rows' interiors are the playable rooms),
  // so the bottom street reads as a canyon of self-built houses climbing the hill.
  const sr = rng(41);
  const rowRoofs: [number, number, number, number][] = [[-13.2, 13.8, 27.2, T0 + 3.7], [-13.2, 13.8, 20.2, T1 + 3.7]];
  for (const [x0, x1, zc, y] of rowRoofs) {
    for (let x = x0 + 2.2; x < x1 - 2;) {
      const lim = zc > 24 ? T1 + 7 : T2 + 5.5;
      const fits = HOUSES.filter((c) => y + c.top <= lim && c.d <= 5.4);
      if (!fits.length) break;
      const h = fits[Math.floor(sr() * fits.length)];
      dress.add(`favela/${h.id}.glb`, x + h.w / 2 - 1.1, y, zc + (sr() - 0.5) * 0.6, 0, new THREE.Color(PASTEL[Math.floor(sr() * PASTEL.length)]), 1, undefined, sr() < 0.5, 0.35);
      x += h.w + 0.2 + sr() * 0.6;
    }
  }
  buildGreenery(dress);
  buildStreetLife(ctx, dress);
  buildFacades(ctx);
  buildDressProps(ctx, mats);
  flatBin.build(root, mats.byName.get('fv_flat')!);
  flatBin = null;
  const cg = cableBin.length ? mergeGeometries(cableBin, false) : null;
  if (cg) { const cm2 = new THREE.Mesh(cg, mats.cable); cm2.name = 'fv:cables'; cm2.matrixAutoUpdate = false; root.add(cm2); }
  cableBin = null;
  dress.build(root, mats, 'fv:dress');
}

function boxGeo(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

// ------------------------------------------------------------------------------------------------------
// Per-frame: cabins (idle sway, rides), festoon chase, neon + floodlights on power, sodium buzz, kites
// ------------------------------------------------------------------------------------------------------
const tmp: P3 = { x: 0, y: 0, z: 0 }, tmp2: P3 = { x: 0, y: 0, z: 0 };
const tmpC = new THREE.Color();
function placeCabin(g: THREE.Group, path: P3[], u: number, time: number, sway = 0.02): void {
  pointAt(path, u, tmp);
  pointAt(path, Math.min(1, u + 0.01), tmp2);
  if (u >= 0.999) { pointAt(path, 0.99, tmp2); tmp2.x = tmp.x * 2 - tmp2.x; tmp2.z = tmp.z * 2 - tmp2.z; }
  g.position.set(tmp.x, tmp.y - 0.05, tmp.z);
  const yaw = Math.atan2(tmp2.x - tmp.x, tmp2.z - tmp.z);
  if (Math.hypot(tmp2.x - tmp.x, tmp2.z - tmp.z) > 1e-3) g.rotation.y = yaw + Math.PI / 2;
  g.rotation.z = Math.sin(time * 1.3) * sway;
}

export function updateFavela(ctx: MapUpdateContext): void {
  const { time, power } = ctx;
  const ride = ctx.ride ?? null;
  // Cabins: cabin 0 carries riders; cabin 1 counter-moves. Idle cabins wait at their ends.
  if (anim.cabins.length === 2) {
    const [c0, c1] = anim.cabins;
    if (ride && (ride.id === 'gondola_up' || ride.id === 'gondola_down')) {
      const u = rideEase(ride.t);
      const upU = ride.id === 'gondola_up' ? u : 1 - u;
      placeCabin(c0, GONDOLA_UP, upU, time, 0.01);
      placeCabin(c1, GONDOLA_UP, 1 - upU, time, 0.03);
      c0.visible = false; // the rider's camera is inside this cabin: hide it so the ride shows the view
      anim.lastRide = ride.id;
    } else {
      const atTop = anim.lastRide === 'gondola_up';
      c0.visible = true;
      placeCabin(c0, GONDOLA_UP, atTop ? 1 : 0, time, 0.008);
      placeCabin(c1, GONDOLA_UP, atTop ? 0 : 1, time, 0.008);
    }
  }
  if (anim.peakCab) {
    if (ride && (ride.id === 'peak_up' || ride.id === 'peak_down')) {
      const u = rideEase(ride.t);
      placeCabin(anim.peakCab, PEAK_UP, ride.id === 'peak_up' ? u : 1 - u, time, 0.02);
      anim.peakCab.visible = false;
    } else {
      // The peak car waits at the summit until the station is held, then waits at the station for you.
      placeCabin(anim.peakCab, PEAK_UP, ctx.egg || (ctx.eggStep ?? 0) >= 3 ? 0 : 1, time, 0.02);
      anim.peakCab.visible = true;
    }
  }
  // Power: floodlights slam on, festoons chase, neon comes alive.
  const flood = power ? 3.2 : 0.18;
  anim.floodHead.color.setScalar(flood);
  for (const p of anim.floodPools) p.visible = power;
  for (const f of anim.festoons) {
    const k = [0, 1, 2].map((p) => (power && Math.sin(time * 3 - p * 2.1) > -0.4 ? 2.2 : 0.12));
    if (f.phase === (k[0] * 4 + k[1] * 2 + k[2]) && f.bulbs.instanceColor) continue; // unchanged since last frame
    f.phase = k[0] * 4 + k[1] * 2 + k[2];
    for (let i = 0; i < f.base.length; i++) { tmpC.copy(f.base[i]).multiplyScalar(k[i % 3]); f.bulbs.setColorAt(i, tmpC); }
    if (f.bulbs.instanceColor) f.bulbs.instanceColor.needsUpdate = true;
  }
  anim.neon.forEach((m) => {
    const flick = Math.sin(time * 23) > 0.96 ? 0.35 : 1;
    m.color.setScalar(power ? 2.4 * flick : 0.1);
  });
  const buzz = Math.sin(time * 41) * Math.sin(time * 3.3) > 0.9 ? 0.45 : 1;
  anim.sodium.color.setHex(0xff9a3a).multiplyScalar(2.6 * buzz);
  for (const m of anim.sodiumGlow) m.opacity = 0.8 * buzz;
  anim.kites.forEach((k, i) => { k.rotation.z = Math.sin(time * 1.7 + i) * 0.25; k.rotation.x = Math.sin(time * 1.1 + i * 2) * 0.12; });
  void CABIN_H; void T0;
}
