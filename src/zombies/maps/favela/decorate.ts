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
  CABIN_H, CABLE, FAVELA, GONDOLA_UP, PEAK, PEAK_CABLE, PEAK_UP, PYLON, SLIDE_PATH, T, TOWER, ZIP,
} from './def';
import { pointAt, rideEase } from '../../rides';

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
// Shared favela materials (the Blender kit's fv_* slots map onto these)
// ------------------------------------------------------------------------------------------------------
interface FvMats { byName: Map<string, THREE.Material>; plasterVC: THREE.MeshStandardMaterial; festoon: THREE.MeshBasicMaterial; neon: THREE.MeshBasicMaterial[]; floodHead: THREE.MeshBasicMaterial; sodium: THREE.MeshBasicMaterial; cable: THREE.MeshStandardMaterial }
function favelaMats(ctx: MapDecorateContext): FvMats {
  const M = ctx.M;
  const std = (base: THREE.MeshStandardMaterial, color: number) => { const m = base.clone(); m.color.setHex(color); return m; };
  const brick = std(M.brick, 0xe8a47c);
  const plasterVC = std(M.plaster, 0xffffff);
  plasterVC.vertexColors = true;
  const winDark = new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.25, metalness: 0.3, envMapIntensity: 1.2 });
  const winLit = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb366).multiplyScalar(1.25) });
  const tank = new THREE.MeshStandardMaterial({ color: 0x2a6fb0, roughness: 0.55 });
  const sodium = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a3a).multiplyScalar(2.6) });
  const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd28a).multiplyScalar(2.2) });
  bulb.name = 'fv_bulb';
  const byName = new Map<string, THREE.Material>([
    ['fv_brick', brick], ['fv_concrete', ctx.mat('concrete')], ['fv_concrete_dark', ctx.mat('concreteDark')],
    ['fv_plaster', plasterVC], ['fv_plaster2', plasterVC], ['fv_window_dark', winDark], ['fv_window_lit', winLit],
    ['fv_steel', ctx.mat('steel')], ['fv_rust', ctx.mat('rust')], ['fv_tin', ctx.mat('corrugated')], ['fv_wood', ctx.mat('wood')],
    ['fv_tank_blue', tank], ['fv_paint_white', ctx.mat('white')], ['fv_bulb', bulb], ['fv_sodium', sodium],
    ['fv_paint_red', ctx.mat('red')], ['fv_paint_yellow', ctx.mat('hazardYellow')], ['fv_rubber', ctx.mat('rubber')],
  ]);
  const festoon = new THREE.MeshBasicMaterial({ color: 0x2a2420 });
  const neon = [0xff3fbf, 0x2ef2ff, 0xffd23a].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const floodHead = new THREE.MeshBasicMaterial({ color: 0x40464c });
  const cable = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.6, metalness: 0.5 });
  byName.set('fv_floodhead', floodHead);
  return { byName, plasterVC, festoon, neon, floodHead, sodium, cable };
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

/** Collects kit placements, then merges every placed part into one mesh per material when the GLBs arrive. */
class KitMerger {
  private jobs = new Map<string, { m: THREE.Matrix4; tint: THREE.Color; remap?: Record<string, string> }[]>();
  add(model: string, x: number, y: number, z: number, yaw: number, tint = new THREE.Color(1, 1, 1), scale = 1, remap?: Record<string, string>): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(scale, scale, scale));
    this.addM(model, m, tint, remap);
  }
  addM(model: string, m: THREE.Matrix4, tint = new THREE.Color(1, 1, 1), remap?: Record<string, string>): void {
    let a = this.jobs.get(model);
    if (!a) this.jobs.set(model, (a = []));
    a.push({ m, tint, remap });
  }
  get count(): number { let n = 0; for (const a of this.jobs.values()) n += a.length; return n; }
  build(root: THREE.Object3D, mats: FvMats, name: string): void {
    const names = [...this.jobs.keys()];
    void Promise.all(names.map((n) => models.load(n))).then((loaded) => {
      const byMat = new Map<string, THREE.BufferGeometry[]>();
      loaded.forEach((lm, i) => {
        if (!lm) return;
        const parts = kitParts(lm);
        for (const job of this.jobs.get(names[i])!) {
          for (const p of parts) {
            const g = p.geo.clone().applyMatrix4(job.m);
            const n = g.attributes.position.count;
            const col = new Float32Array(n * 3);
            const c = p.mat.startsWith('fv_plaster') ? job.tint : new THREE.Color(1, 1, 1);
            for (let k = 0; k < n; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
            g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            const key = job.remap?.[p.mat] ?? p.mat;
            let arr = byMat.get(key);
            if (!arr) byMat.set(key, (arr = []));
            arr.push(g);
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
    });
  }
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
const PASTEL = [0xd9906e, 0x6fb0a6, 0xe2c25e, 0xcf86a0, 0x94b86a, 0x7e9ccc, 0xe9dfcf, 0xa78fc4, 0xf0f0e8, 0xe7a35a];
const HOUSES = [
  { id: 'fv_house_a', w: 4.2, d: 4.0, h: 6 }, { id: 'fv_house_b', w: 5.0, d: 4.5, h: 9 }, { id: 'fv_house_c', w: 3.6, d: 4.0, h: 3.5 },
  { id: 'fv_house_d', w: 6.0, d: 5.0, h: 6 }, { id: 'fv_house_e', w: 4.0, d: 5.5, h: 12 }, { id: 'fv_house_f', w: 5.2, d: 5.0, h: 6 },
];

function buildTerrain(ctx: MapDecorateContext): void {
  const W = 460, D = 560, sx = 84, sz = 104;
  const g = new THREE.PlaneGeometry(W, D, sx, sz);
  g.rotateX(-Math.PI / 2);
  g.translate(-10, 0, 60);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const dry = new THREE.Color(0x6a5238), green = new THREE.Color(0x3c5a30), dark = new THREE.Color(0x2e3a26), c = new THREE.Color();
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

/** Near houses: detailed kit pieces, merged. Far houses: instanced boxes with a lit-window facade texture. */
function buildHouses(ctx: MapDecorateContext, merger: KitMerger): void {
  const rs = playRects();
  const r = rng(7);
  // 1) Skins: stacked houses in front of the big exposed terrace faces (the favela "wall" you see from every tier).
  const skin = (axis: 'x' | 'z', at: number, a0: number, a1: number, top: number, out: 1 | -1) => {
    for (let a = a0 + 2.2; a < a1 - 1.5;) {
      const hv = HOUSES[Math.floor(r() * HOUSES.length)];
      const w = hv.w;
      let y = hill(axis === 'x' ? a : at, axis === 'x' ? at : a) - 0.6;
      const yaw = axis === 'x' ? (out > 0 ? 0 : Math.PI) : (out > 0 ? Math.PI / 2 : -Math.PI / 2);
      while (y < top - 2) {
        const h = HOUSES[Math.floor(r() * HOUSES.length)];
        const d = h.d;
        const off = at + out * (d / 2 - 0.4 + r() * 0.3);
        const [x, z] = axis === 'x' ? [a + (r() - 0.5) * 0.6, off] : [off, a + (r() - 0.5) * 0.6];
        merger.add(`favela/${h.id}.glb`, x, y, z, yaw, new THREE.Color(PASTEL[Math.floor(r() * PASTEL.length)]));
        y += h.h + (h.id === 'fv_house_c' ? 0.6 : 0.1);
      }
      a += w + 0.4 + r() * 1.2;
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
  // 2) Scatter: the rest of the hillside, avoiding the play space.
  let far = 0;
  const farBoxes: THREE.Matrix4[] = [];
  const farCols: THREE.Color[] = [];
  for (let gz = -104; gz < 70; gz += 6.5) {
    for (let gx = -118; gx < 104; gx += 6.5) {
      const x = gx + (r() - 0.5) * 2.4, z = gz + (r() - 0.5) * 2.4;
      const h = HOUSES[Math.floor(r() * HOUSES.length)];
      const hw = h.w / 2 + 0.2, hd = h.d / 2 + 0.2;
      if (hits(rs, x - hw, z - hd, x + hw, z + hd, 1.2)) continue;
      if (z > PEAK.z0 - 6 && z < PEAK.z1 + 8 && x > PEAK.x0 - 6 && x < PEAK.x1 + 6) continue;
      const y = hill(x, z) - 0.8;
      const near = Math.abs(x) < 58 && z > -78 && z < 56;
      const yaw = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(r() * 4)] * (r() < 0.6 ? 0 : 1);
      if (near) {
        merger.add(`favela/${h.id}.glb`, x, y, z, yaw, new THREE.Color(PASTEL[Math.floor(r() * PASTEL.length)]));
        if (r() < 0.2) { const h2 = HOUSES[Math.floor(r() * 3)]; merger.add(`favela/${h2.id}.glb`, x, y + h.h + 0.1, z, yaw, new THREE.Color(PASTEL[Math.floor(r() * PASTEL.length)])); }
      } else {
        const bh = 3 + Math.floor(r() * 4) * 3;
        farBoxes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + bh / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(h.w, bh, h.d)));
        farCols.push(new THREE.Color(PASTEL[Math.floor(r() * PASTEL.length)]).lerp(new THREE.Color(0xb5643c), r() * 0.6));
        far++;
      }
    }
  }
  // Low roofs under the tin-roof slide (their tops sit just under the slide path)
  for (let z = 10.5; z < 29; z += 4.6) {
    let y = hill(31, z) - 0.6;
    const top = pointAtZ(SLIDE_PATH, z) - 0.9;
    while (y + 3 < top) { const h = HOUSES[[0, 3, 5][Math.floor(r() * 3)]]; if (y + h.h > top + 0.2) break; merger.add(`favela/${h.id}.glb`, 31, y, z, Math.PI, new THREE.Color(PASTEL[Math.floor(r() * PASTEL.length)])); y += h.h + 0.1; }
  }
  // The ravine: trees and scrub instead of houses (it keeps the cable, bridge and zipline sightlines clear)
  const trunkG = new THREE.CylinderGeometry(0.12, 0.2, 3, 5); trunkG.translate(0, 1.5, 0);
  const crownG = new THREE.IcosahedronGeometry(1.7, 0); crownG.scale(1, 0.8, 1); crownG.translate(0, 3.8, 0);
  const trees: THREE.Matrix4[] = [];
  for (let i = 0; i < 46; i++) {
    const x = -17 + r() * 18, z = -44 + r() * 47;
    if (Math.abs(x - PYLON.x) < 2.5 && Math.abs(z - PYLON.z) < 2.5) continue;
    const sc = 0.7 + r() * 0.9;
    trees.push(new THREE.Matrix4().compose(new THREE.Vector3(x, hill(x, z) - 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(sc, sc * (0.8 + r() * 0.5), sc)));
  }
  for (const [g, c] of [[trunkG, 0x4a3828], [crownG, 0x4f7a3c]] as const) {
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }), trees.length);
    trees.forEach((m, i) => im.setMatrixAt(i, m));
    im.name = 'fv:ravine-trees';
    ctx.root.add(im);
  }
  // Far hillside + the city below: one instanced box with a procedural lit-window facade.
  for (let i = 0; i < 2600; i++) {
    const x = (r() - 0.5) * 620, z = 70 + r() * 360;
    const y = hill(x, z);
    if (z < 90 && Math.abs(x) < 60) continue;
    const w = 6 + r() * 14, d = 6 + r() * 14, bh = 4 + r() * r() * (z > 200 ? 60 : 22);
    farBoxes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + bh / 2 - 1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI), new THREE.Vector3(w, bh, d)));
    farCols.push(new THREE.Color(0xc8c0b8).lerp(new THREE.Color(0x8a8f9a), r()));
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
  void far;
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
  // Mountains: dark silhouettes on both sides of the bay, one steep dome at the water's edge.
  const mtn = new THREE.MeshBasicMaterial({ color: 0x2a2640, fog: false });
  const peaks: [number, number, number, number][] = [[-520, 520, 150, 190], [-360, 650, 95, 140], [460, 560, 170, 220], [300, 700, 70, 120], [140, 470, 88, 38], [-700, 200, 220, 320], [720, 180, 240, 330]];
  for (const [x, z, h, rad] of peaks) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7, 1), mtn);
    m.position.set(x, -44 + h / 2, z);
    m.rotation.y = x * 0.01;
    ctx.root.add(m);
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
  return g ? new THREE.Mesh(g, mat) : null;
}

interface Festoon { bulbs: THREE.InstancedMesh; mat: THREE.MeshBasicMaterial; phase: number }

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
  sodiumGlow: THREE.Sprite[];
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

export function decorateFavela(ctx: MapDecorateContext): void {
  const mats = favelaMats(ctx);
  const root = ctx.root;
  Object.assign(anim, { cabins: [], peakCab: null, wheels: [], festoons: [], neon: mats.neon, floodHead: mats.floodHead, floodPools: [], sodium: mats.sodium, sodiumGlow: [], kites: [], upDone: false, lastRide: null, power: false });
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
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5 + rr() * 4, 0), rockM);
    m.position.set(PEAK.x0 + rr() * (PEAK.x1 - PEAK.x0), PEAK.y - 6 - rr() * 8, PEAK.z0 + rr() * (PEAK.z1 - PEAK.z0));
    m.scale.y = 2.2;
    root.add(m);
  }
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
  ];
  const fwire = cables(festoonSpans, 0.012, mats.cable);
  if (fwire) root.add(fwire);
  const bulbPts: THREE.Vector3[] = [];
  for (const [a, b, sag] of festoonSpans) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0.6; d < len; d += 0.9) { const t = d / len; bulbPts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t) - 0.08, a.z + (b.z - a.z) * t)); }
  }
  const palette = [0xffd28a, 0xff6a8a, 0x7ad8ff, 0xffe066, 0x9dff8a];
  for (let p = 0; p < 3; p++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a2420 });
    const pts = bulbPts.filter((_, i) => i % 3 === p);
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), mat, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach((v3, i) => { im.setMatrixAt(i, m4.makeTranslation(v3.x, v3.y, v3.z)); im.setColorAt(i, new THREE.Color(palette[Math.floor(fr() * palette.length)])); });
    im.name = 'fv:festoon';
    root.add(im);
    anim.festoons.push({ bulbs: im, mat, phase: p });
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

  // ---- Street lamps (sodium) and the beco wall lamp ----
  for (const [x, z] of [[-8, 30.6], [22, 30.6]] as const) {
    dress.add('favela/fv_streetlamp.glb', x, T0, z, 0);
    ctx.world.add(x - 0.1, T0, z - 0.1, x + 0.1, T0 + 6.4, z + 0.1, { surface: 'metal' });
    const s = glowSprite(0xff9a3a, 2.6);
    s.position.set(x, T0 + 6.1, z + 1.6);
    root.add(s);
    anim.sodiumGlow.push(s);
  }
  dress.add('favela/fv_walllamp.glb', -15.85, 12.6, 19, Math.PI / 2);
  { const s = glowSprite(0xff9a3a, 1.6); s.position.set(-15.4, 12.5, 19); root.add(s); anim.sodiumGlow.push(s); }

  // ---- Murals (as geometry): the samba hall's face over the laje, the quadra wall, the beco ----
  dress.add('favela/fv_mural_b.glb', 22.2, T3 + 1.3, -23.82, 0, undefined, 1);
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
  loop(3, T0 + 3.2, 37.8, 0.6, 0.35, 0); wave(-3.4, 1.6, T0 + 3.25, 37.8, 0.12, 1); wave(4.4, 9.4, T0 + 3.25, 37.8, 0.12, 2);
  neonGeos.forEach((gs, k) => { const g = gs.length ? mergeGeometries(gs, false) : null; if (g) { const m = new THREE.Mesh(g, mats.neon[k]); m.name = 'fv:neon'; root.add(m); } });

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
      const h = HOUSES[[0, 2, 3, 5][Math.floor(sr() * 4)]];
      if (y + h.h > (zc > 24 ? T1 + 7 : T2 + 5.5)) { x += 2; continue; }
      dress.add(`favela/${h.id}.glb`, x, y, zc + (sr() - 0.5), sr() < 0.5 ? 0 : Math.PI, new THREE.Color(PASTEL[Math.floor(sr() * PASTEL.length)]));
      x += h.w + 0.3 + sr() * 0.8;
    }
  }
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
      anim.lastRide = ride.id;
    } else {
      const atTop = anim.lastRide === 'gondola_up';
      placeCabin(c0, GONDOLA_UP, atTop ? 1 : 0, time, 0.008);
      placeCabin(c1, GONDOLA_UP, atTop ? 0 : 1, time, 0.008);
    }
  }
  if (anim.peakCab) {
    if (ride && (ride.id === 'peak_up' || ride.id === 'peak_down')) {
      const u = rideEase(ride.t);
      placeCabin(anim.peakCab, PEAK_UP, ride.id === 'peak_up' ? u : 1 - u, time, 0.02);
    } else placeCabin(anim.peakCab, PEAK_UP, ctx.egg ? 0 : 1, time, 0.02);
    anim.peakCab.visible = true;
  }
  // Power: floodlights slam on, festoons chase, neon comes alive.
  const flood = power ? 3.2 : 0.18;
  anim.floodHead.color.setScalar(flood);
  for (const p of anim.floodPools) p.visible = power;
  anim.festoons.forEach((f, i) => {
    const on = power && Math.sin(time * 3 - i * 2.1) > -0.4;
    f.mat.color.setScalar(on ? 2.2 : 0.12);
  });
  anim.neon.forEach((m, i) => {
    const flick = Math.sin(time * 23 + i * 5) > 0.96 ? 0.35 : 1;
    const base = [0xff3fbf, 0x2ef2ff, 0xffd23a][i];
    m.color.setHex(base).multiplyScalar(power ? 2.4 * flick : 0.1);
  });
  const buzz = Math.sin(time * 41) * Math.sin(time * 3.3) > 0.9 ? 0.45 : 1;
  anim.sodium.color.setHex(0xff9a3a).multiplyScalar(2.6 * buzz);
  for (const s of anim.sodiumGlow) (s.material as THREE.SpriteMaterial).opacity = 0.75 * buzz;
  anim.kites.forEach((k, i) => { k.rotation.z = Math.sin(time * 1.7 + i) * 0.25; k.rotation.x = Math.sin(time * 1.1 + i * 2) * 0.12; });
  void CABIN_H; void T0;
}
