// Architectural dressing of every exposed masonry face of the Lahore Darbar.
//
// The rasteriser builds the level as solid "mass" boxes. Here every vertical face of that mass that is not buried
// against more mass is found (per 1 m grid edge, merged into runs), classified by its surface and by what stands in
// front of it (a court, a lane, a covered hall, or nothing = the skyline), and dressed:
//   fort  (sandstone / brick / marble / dark stone): moulded plinth, pilasters with vase bases and bell capitals,
//         blind cusped-arch niches, string courses, a chhajja eave on carved brackets, kangura merlons on the roof edge
//   haveli (lime plaster): brick plinth, arched shuttered windows, jharokhas and wooden balconies on the upper storey,
//         painted fresco bands, a wooden chhajja per storey and a plaster parapet
//   Sheesh Mahal (mirror): mirror-mosaic niches between gilded pilasters
// Zone walls, parapets and rails from the raster get the same treatment on both sides.
// All of it is visual only (the colliders are the raster's), merged per material and cell by ./merge.
import * as THREE from 'three';
import { AREAS, BOX_SPOTS, DOORS, PAP_SPOT, PERK_SPOTS, POWER_SPOT, WALL_BUY_SPOTS, WINDOWS, type AreaDef, type Surf } from './layout';
import { GRID, GRID_H, GRID_W, floorAt, type Raster, type WallRun } from './raster';
import { put, putM, mat4, kitMerger, type KitOpts } from './kit';
import type { LahoreMaterials } from './materials';
import type { Tier } from './merge';

const K = (n: string) => `lahore/kit_${n}.glb`;
const LAYERS = ['B', 'G', 'U', 'R'] as const;

export interface ExposedFace {
  axis: 'x' | 'z'; at: number; a0: number; a1: number; y0: number; y1: number;
  /** Outward normal (from the mass toward the viewer). */
  nx: number; nz: number;
  surf: Surf;
  /** Area in front at the base of the face (null = open air / outside the level). */
  front: AreaDef | null;
  /** Something walkable sits on top of the mass at y1 (a terrace, a quad): no merlons, the raster rails it. */
  terraceTop: boolean;
  /** The cells in front are empty (outside the built regions): skyline face. */
  outside: boolean;
}

interface Iv { y0: number; y1: number; surf: Surf }

/** Pure: exposed vertical faces of the raster's mass (exported for tests). */
export function exposedFaces(R: Raster): ExposedFace[] {
  const W = GRID_W, H = GRID_H;
  const cols: Iv[][] = Array.from({ length: W * H }, () => []);
  for (const m of R.masses) {
    for (let x = m.x0; x < m.x1; x++) for (let z = m.z0; z < m.z1; z++) {
      const i = x - GRID.minX, j = z - GRID.minZ;
      if (i >= 0 && j >= 0 && i < W && j < H) cols[j * W + i].push({ y0: m.y0, y1: m.y1, surf: m.surf });
    }
  }
  for (const c of cols) c.sort((a, b) => a.y0 - b.y0);
  const areaIn = (i: number, j: number, y0: number): AreaDef | null => {
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    let best: AreaDef | null = null, bf = -Infinity;
    for (const L of LAYERS) {
      const k = R.grid[L][j * W + i];
      if (k < 0) continue;
      const a = AREAS[k];
      const f = a.stair ? a.stair.y0 : a.floor;
      if (f <= y0 + 0.7 && (a.ceiling ?? Infinity) > y0 + 0.5 && f > bf) { bf = f; best = a; }
    }
    return best;
  };
  const areaOnTop = (i: number, j: number, y: number): boolean => {
    for (const L of LAYERS) {
      const k = R.grid[L][j * W + i];
      if (k >= 0 && Math.abs(floorAt(AREAS[k], GRID.minX + i + 0.5, GRID.minZ + j + 0.5) - y) < 0.7) return true;
    }
    return false;
  };
  interface Cell { axis: 'x' | 'z'; at: number; a: number; y0: number; y1: number; nx: number; nz: number; surf: Surf; front: AreaDef | null; terraceTop: boolean; outside: boolean }
  const cells: Cell[] = [];
  const DIRS = [{ di: 1, dj: 0 }, { di: -1, dj: 0 }, { di: 0, dj: 1 }, { di: 0, dj: -1 }];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const own = cols[j * W + i];
    if (!own.length) continue;
    for (const { di, dj } of DIRS) {
      const ni = i + di, nj = j + dj;
      const inside = ni >= 0 && nj >= 0 && ni < W && nj < H;
      const nb = inside ? cols[nj * W + ni] : [];
      for (const iv of own) {
        let segs: [number, number][] = [[iv.y0, iv.y1]];
        for (const b of nb) segs = segs.flatMap(([s0, s1]) => (b.y1 <= s0 || b.y0 >= s1 ? [[s0, s1]] : [[s0, b.y0], [b.y1, s1]].filter(([p, q]) => q - p > 0.05) as [number, number][]));
        for (const [s0, s1] of segs) {
          if (s1 - s0 < 0.3) continue;
          const axis: 'x' | 'z' = dj !== 0 ? 'x' : 'z';
          const at = axis === 'x' ? GRID.minZ + (dj > 0 ? j + 1 : j) : GRID.minX + (di > 0 ? i + 1 : i);
          const a = axis === 'x' ? GRID.minX + i : GRID.minZ + j;
          cells.push({ axis, at, a, y0: s0, y1: s1, nx: di, nz: dj, surf: iv.surf, front: areaIn(ni, nj, s0), terraceTop: areaOnTop(i, j, s1), outside: !nb.length && !areaIn(ni, nj, s0) });
        }
      }
    }
  }
  cells.sort((p, q) => (p.axis < q.axis ? -1 : p.axis > q.axis ? 1 : p.at - q.at || p.nx - q.nx || p.nz - q.nz || p.y0 - q.y0 || p.y1 - q.y1 || (p.front?.id ?? '').localeCompare(q.front?.id ?? '') || p.a - q.a));
  const out: ExposedFace[] = [];
  for (const c of cells) {
    const l = out[out.length - 1];
    if (l && l.axis === c.axis && l.at === c.at && l.nx === c.nx && l.nz === c.nz && Math.abs(l.y0 - c.y0) < 0.01 && Math.abs(l.y1 - c.y1) < 0.01
      && l.front === c.front && l.surf === c.surf && l.terraceTop === c.terraceTop && l.outside === c.outside && Math.abs(l.a1 - c.a) < 0.01) l.a1 = c.a + 1;
    else out.push({ axis: c.axis, at: c.at, a0: c.a, a1: c.a + 1, y0: c.y0, y1: c.y1, nx: c.nx, nz: c.nz, surf: c.surf, front: c.front, terraceTop: c.terraceTop, outside: c.outside });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Keep-out: doors, windows (and their spawn pockets), wall-buy chalk, machines.
// ------------------------------------------------------------------------------------------------
/** Machines and pickups the pacing layer adds in def.ts (new perks, the naft-cauldron bench and parts, the fire-pit
 *  switch, side-quest lamps). Kept clear of dressing here so art and gameplay data can merge independently. */
export const EXTRA_KEEPOUT: { x: number; y: number; z: number; r: number }[] = [
  { x: -42.5, y: 3, z: -5, r: 1.7 }, { x: -53, y: 7.2, z: 19.5, r: 1.7 }, { x: -0.5, y: 7.2, z: -44, r: 1.7 },
  { x: -12, y: 3, z: -29.5, r: 1.8 }, { x: -8, y: 3, z: -29.5, r: 1.2 },
  { x: -30.5, y: 3, z: 7.5, r: 1.0 }, { x: -20, y: 3, z: -16.5, r: 1.0 }, { x: 34.5, y: 3, z: 14, r: 1.2 },
  { x: 4.5, y: 3, z: 1.5, r: 1.0 }, { x: 61.5, y: 3, z: 26.5, r: 1.0 }, { x: 45.5, y: 0, z: -31.5, r: 1.0 },
];
export function busy(x: number, y: number, z: number, r: number, yTop = y + 3): boolean {
  const near = (py: number) => py > y - 1 && py < yTop;
  for (const d of DOORS) {
    const mid = (d.a0 + d.a1) / 2, half = (d.a1 - d.a0) / 2;
    const [dx, dz] = d.axis === 'x' ? [mid, d.at] : [d.at, mid];
    if (near(d.y0) && Math.hypot(dx - x, dz - z) < half + r + 0.4) return true;
  }
  for (const w of WINDOWS) if (near(w.floor) && Math.hypot(w.x - x, w.z - z) < 1.4 + r) return true;
  for (const w of WALL_BUY_SPOTS) if (near(w.y) && Math.hypot(w.x - x, w.z - z) < 1.3 + r) return true;
  for (const s of [...Object.values(PERK_SPOTS), PAP_SPOT, POWER_SPOT, ...BOX_SPOTS]) if (near(s.y) && Math.hypot(s.x - x, s.z - z) < 1.7 + r) return true;
  for (const s of EXTRA_KEEPOUT) if (near(s.y) && Math.hypot(s.x - x, s.z - z) < s.r + r) return true;
  return false;
}
/** Window spawn pockets: the carved yard behind each window. Faces inside it are never dressed. */
function inPocket(x: number, z: number, y: number): boolean {
  for (const w of WINDOWS) {
    if (y < w.floor - 0.5 || y > w.floor + 4) continue;
    const d = (x - w.x) * w.nx + (z - w.z) * w.nz, s = Math.abs((x - w.x) * w.nz - (z - w.z) * w.nx);
    if (d > 0.05 && d < 4 && s < 2.2) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------
// Procedural sweeps (world-space, world UVs): mouldings, string courses, chhajjas, copings
// ------------------------------------------------------------------------------------------------
type Profile = [number, number][]; // (outward offset, height) from the wall foot, bottom to top

interface FaceFrame { axis: 'x' | 'z'; at: number; nx: number; nz: number }
const P3 = (f: FaceFrame, a: number, y: number, d: number): [number, number, number] =>
  (f.axis === 'x' ? [a, y, f.at + f.nz * d] : [f.at + f.nx * d, y, a]);

/** Sweep a closed profile along a run of a face (a0..a1 along the axis), base at y. */
export function sweep(f: FaceFrame, a0: number, a1: number, y: number, prof: Profile, mat: THREE.Material, o: { tier?: Tier; cast?: boolean; caps?: boolean } = {}): void {
  if (a1 - a0 < 0.05) return;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  // Profiles must wind counter-clockwise in (out, up) so edge normals point out of the solid.
  let area = 0;
  for (let k = 0; k < prof.length; k++) { const [a, b] = prof[k], [c, d] = prof[(k + 1) % prof.length]; area += a * d - c * b; }
  const pts = area < 0 ? [...prof].reverse() : prof;
  let acc = y;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[(k + 1) % pts.length];
    const [d0, h0] = p, [d1, h1] = q;
    const len = Math.hypot(d1 - d0, h1 - h0);
    if (len < 1e-4) continue;
    // Normal of the profile edge in (outward, up) space, rotated into world.
    let en = (h1 - h0) / len, eh = -(d1 - d0) / len;
    const base = pos.length / 3;
    const quad = [P3(f, a0, y + h0, d0), P3(f, a1, y + h0, d0), P3(f, a1, y + h1, d1), P3(f, a0, y + h1, d1)];
    // Winding: make the face point along (en, eh).
    const wn = f.axis === 'x' ? [0, eh, f.nz * en] : [f.nx * en, eh, 0];
    const e1 = [quad[1][0] - quad[0][0], quad[1][1] - quad[0][1], quad[1][2] - quad[0][2]], e2 = [quad[3][0] - quad[0][0], quad[3][1] - quad[0][1], quad[3][2] - quad[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * wn[0] + cy * wn[1] + cz * wn[2] < 0;
    if (Math.abs(en) + Math.abs(eh) < 1e-6) { en = 0; eh = 1; }
    for (const v of quad) { pos.push(...v); nor.push(wn[0], wn[1], wn[2]); }
    uv.push(a0 / 2, acc / 2, a1 / 2, acc / 2, a1 / 2, (acc + len) / 2, a0 / 2, (acc + len) / 2);
    acc += len;
    if (flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (o.caps !== false) {
    const contour = pts.map(([d, h]) => new THREE.Vector2(d, h));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [end, sgn] of [[a0, -1], [a1, 1]] as const) {
      const base = pos.length / 3;
      const n = f.axis === 'x' ? [sgn, 0, 0] : [0, 0, sgn];
      for (const [d, h] of pts) { pos.push(...P3(f, end, y + h, d)); nor.push(n[0], n[1], n[2]); uv.push(d / 2, (y + h) / 2); }
      for (const t of tris) {
        const [i0, i1, i2] = t.map((q) => base + q);
        const A = new THREE.Vector3(...pos.slice(i0 * 3, i0 * 3 + 3) as [number, number, number]);
        const Bv = new THREE.Vector3(...pos.slice(i1 * 3, i1 * 3 + 3) as [number, number, number]);
        const C = new THREE.Vector3(...pos.slice(i2 * 3, i2 * 3 + 3) as [number, number, number]);
        const cr = Bv.sub(A).cross(C.sub(A));
        if (cr.x * n[0] + cr.y * n[1] + cr.z * n[2] < 0) idx.push(i0, i2, i1); else idx.push(i0, i1, i2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  kitMerger().add(mat, g, { tier: o.tier, cast: o.cast });
}

/** A flat quad on a face (fresco panels, painted bands) with explicit UV rectangle [u0, v0, u1, v1]. */
export function panel(f: FaceFrame, a0: number, a1: number, y0: number, y1: number, d: number, mat: THREE.Material, uvr: [number, number, number, number], tier: Tier = 'near'): void {
  const q = [P3(f, a0, y0, d), P3(f, a1, y0, d), P3(f, a1, y1, d), P3(f, a0, y1, d)];
  // Keep the texture upright and un-mirrored when seen from the front.
  const flipU = f.axis === 'x' ? f.nz < 0 : f.nx > 0;
  const [u0, v0, u1, v1] = uvr, ua = flipU ? u1 : u0, ub = flipU ? u0 : u1;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(q.flat(), 3));
  const n = f.axis === 'x' ? [0, 0, f.nz] : [f.nx, 0, 0];
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...n, ...n, ...n, ...n], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([ua, v0, ub, v0, ub, v1, ua, v1], 2));
  const e1 = new THREE.Vector3(...q[1]).sub(new THREE.Vector3(...q[0])), e2 = new THREE.Vector3(...q[3]).sub(new THREE.Vector3(...q[0]));
  const c = e1.cross(e2);
  g.setIndex(c.x * n[0] + c.z * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  kitMerger().add(mat, g, { tier });
}

// Profiles (outward, up), metres.
const PLINTH: Profile = [[0, 0], [0.18, 0], [0.18, 0.3], [0.12, 0.36], [0.12, 0.44], [0.05, 0.5], [0, 0.52]];
const STRING: Profile = [[0, 0], [0.05, 0.02], [0.1, 0.08], [0.1, 0.15], [0.04, 0.2], [0, 0.22]];
const CORNICE: Profile = [[0, 0], [0.07, 0.03], [0.13, 0.14], [0.2, 0.22], [0.22, 0.3], [0.22, 0.38], [0, 0.38]];
const CHHAJJA: Profile = [[0, -0.1], [0.96, -0.3], [0.98, -0.36], [0.9, -0.36], [0, -0.2]];
const HOOD_WOOD: Profile = [[0, 0], [0.7, -0.24], [0.72, -0.3], [0.66, -0.3], [0, -0.12]];
const COPING = (t: number): Profile => [[-0.06, 0], [t + 0.06, 0], [t + 0.06, 0.08], [t / 2 + 0.05, 0.16], [t / 2, 0.2], [t / 2 - 0.05, 0.16], [-0.06, 0.08]];

// ------------------------------------------------------------------------------------------------
interface Palette { wall: Surf; frame: Surf; trim: Surf }
const PAL: Partial<Record<Surf, Palette>> = {
  sandstone: { wall: 'sandstone', frame: 'sandstone', trim: 'marble' },
  brick: { wall: 'brick', frame: 'sandstone', trim: 'marble' },
  marble: { wall: 'marble', frame: 'marble', trim: 'stoneDark' },
  inlay: { wall: 'marble', frame: 'marble', trim: 'stoneDark' },
  mirror: { wall: 'mirror', frame: 'mirror', trim: 'marble' },
  stoneDark: { wall: 'stoneDark', frame: 'stoneDark', trim: 'sandstone' },
  paving: { wall: 'sandstone', frame: 'sandstone', trim: 'marble' },
  terrace: { wall: 'plasterOchre', frame: 'plasterOchre', trim: 'plaster' },
  cobble: { wall: 'brick', frame: 'sandstone', trim: 'marble' },
};
const HAVELI = new Set<Surf>(['plasterOchre', 'plasterBlue', 'plaster', 'wood']);

let LM: LahoreMaterials;
let lamps: (x: number, y: number, z: number, kind: 'lantern' | 'torch') => void = () => {};
const along = (f: FaceFrame, a: number, d = 0): [number, number] => (f.axis === 'x' ? [a, f.at + f.nz * d] : [f.at + f.nx * d, a]);
const yawOf = (f: FaceFrame) => Math.atan2(f.nx, f.nz);
let seed = 17;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Fresco atlas quadrants [u0, v0, u1, v1] (canvas y grows down; texture v grows up: flipY default).
const FRESCO = { vase: [0, 0.5, 0.5, 1], tree: [0.5, 0.5, 1, 1], vine: [0, 0, 0.5, 0.5], star: [0.5, 0, 1, 0.5] } as const;

export function dressFacades(R: Raster, M: LahoreMaterials, lamp: typeof lamps): { faces: number } {
  LM = M; lamps = lamp; seed = 17;
  const faces = exposedFaces(R);
  for (const f of faces) {
    const [mx, mz] = along(f, (f.a0 + f.a1) / 2);
    if (!f.front && inPocket(mx - f.nx * 0.5, mz - f.nz * 0.5, f.y0)) continue;
    if (!f.front && f.y1 - f.y0 < 1) continue; // plinth undersides / slivers against the void
    if (HAVELI.has(f.surf)) haveliFace(f); else fortFace(f);
  }
  for (const w of R.walls) dressWall(w);
  return { faces: faces.length };
}

// ------------------------------------------------------------------------------------------------
function pilaster(f: FaceFrame, a: number, yb: number, h: number, pal: Palette, tier: Tier, d = 0): void {
  if (h < 1.6) return;
  const [x, z] = along(f, a, d);
  const yaw = yawOf(f), o: KitOpts = { stone: pal.frame, trim: pal.trim, tier };
  put(K('pilaster_base'), x, yb, z, yaw, 1, o);
  const sh = h - 0.62 - 0.72;
  put(K('pilaster_shaft'), x, yb + 0.62, z, yaw, [1, sh, 1], o);
  put(K('pilaster_cap'), x, yb + 0.62 + sh, z, yaw, 1, o);
}

function chhajja(f: FaceFrame, a0: number, a1: number, y: number, mat: THREE.Material, bracketStone: Surf, trim: Surf, tier: Tier = 'far'): void {
  sweep(f, a0 - 0.1, a1 + 0.1, y, CHHAJJA, mat, { tier, cast: true });
  const n = Math.max(1, Math.round((a1 - a0) / 1.8));
  const step = (a1 - a0) / n;
  for (let k = 0; k <= n; k++) {
    const [x, z] = along(f, a0 + step * k);
    put(K('bracket'), x, y - 0.18, z, yawOf(f), 1, { stone: bracketStone, trim, tier: 'near' });
  }
}

function merlons(f: FaceFrame, a0: number, a1: number, y: number, pal: Palette, inset: number, scale = 1, spacing = 1.2 * scale): void {
  const n = Math.max(1, Math.floor((a1 - a0) / spacing));
  const step = (a1 - a0) / n;
  for (let k = 0; k < n; k++) {
    const [x, z] = along(f, a0 + step * (k + 0.5), -inset);
    put(K('merlon'), x, y, z, yawOf(f), [Math.min(step / 1.2, scale * 1.6), scale, scale], { stone: pal.frame, trim: pal.trim, tier: 'far', cast: true });
  }
}

/** Fort-style court facade: plinth, pilaster rhythm, blind niches, string courses, chhajja, merlons. */
function fortFace(f: ExposedFace): void {
  const pal = PAL[f.surf] ?? PAL.sandstone!;
  const S = LM.surf;
  const L = f.a1 - f.a0;
  const front = f.front;
  const stairFront = !!front?.stair;
  const covered = front ? front.ceiling !== null : false;
  const skyline = !front;
  const h = f.y1 - f.y0;
  const tier: Tier = skyline ? 'far' : 'near';
  const baseAtFloor = front && Math.abs((front.stair ? front.stair.y0 : front.floor) - f.y0) < 0.35;

  // Short faces (plinths of pavilions, terrace edges): a dado with a moulded cap and an inlay band.
  if (h < 2.2) {
    if (h >= 0.9 && !skyline) {
      sweep(f, f.a0, f.a1, f.y0, [[0, 0], [0.1, 0], [0.1, 0.16], [0.04, 0.2], [0, 0.2]], S[pal.frame], { tier });
      sweep(f, f.a0, f.a1, f.y1 - 0.2, [[0, 0], [0.12, 0.06], [0.14, 0.14], [0.08, 0.2], [0, 0.2]], S[pal.trim === 'stoneDark' ? 'marble' : pal.trim], { tier });
      panel(f, f.a0 + 0.1, f.a1 - 0.1, f.y0 + 0.3, Math.min(f.y1 - 0.3, f.y0 + 0.62), 0.012, LM.pdura, [0, 0, (f.a1 - f.a0) / 2, 0.16], tier);
    }
    return;
  }
  if (baseAtFloor && !stairFront) sweep(f, f.a0, f.a1, f.y0, PLINTH, S[pal.frame], { tier: 'near' });

  const topBand = covered ? 0.45 : 1.2;
  const bay = f.surf === 'mirror' ? 3.0 : 3.6;
  const nb = Math.max(1, Math.round(L / bay)), bw = L / nb;
  if (!stairFront && !skyline && L >= 1.8) {
    let yb = baseAtFloor ? f.y0 + 0.52 : f.y0 + 0.1;
    for (let row = 0; row < 3; row++) {
      const rh = Math.min(f.surf === 'mirror' ? 3.4 : 4.3, f.y1 - topBand - yb);
      if (rh < 2.0) break;
      for (let k = 0; k <= nb; k++) {
        const a = f.a0 + bw * k;
        const [x, z] = along(f, a);
        if (k === 0 || k === nb) { if (L < 3) continue; } // keep corners clean on very short runs
        if (!busy(x, yb, z, 0.4, yb + rh)) pilaster(f, a + (k === 0 ? 0.32 : k === nb ? -0.32 : 0), yb, rh, pal, tier);
      }
      for (let k = 0; k < nb; k++) {
        const a = f.a0 + bw * (k + 0.5);
        const [x, z] = along(f, a);
        if (bw < 1.9 || busy(x, yb, z, bw / 2 - 0.3, yb + rh)) continue;
        const sx = Math.min(1.25, (bw - 0.66) / 3.0), sy = rh / 3.6;
        put(K('niche'), x, yb, z, yawOf(f), [sx, sy, 1], { stone: pal.frame, trim: pal.trim, tier });
      }
      yb += rh;
      if (yb + 0.4 < f.y1 - topBand) { sweep(f, f.a0, f.a1, yb, STRING, S[pal.trim === 'stoneDark' ? 'marble' : pal.trim], { tier }); yb += 0.22; }
    }
  } else if (skyline && h > 5) {
    // Skyline wall: string courses every 4 m and a band of shallow niches at the top storey (cheap, far tier).
    for (let y = f.y0 + 4; y < f.y1 - 1.6; y += 4) sweep(f, f.a0, f.a1, y, STRING, S[pal.trim === 'stoneDark' ? 'marble' : pal.trim], { tier: 'far' });
  }
  if (covered) {
    sweep(f, f.a0, f.a1, f.y1 - 0.38, CORNICE, S[pal.trim === 'stoneDark' ? 'marble' : pal.trim], { tier });
    return;
  }
  // Open sky above: cornice + chhajja just under the top, merlons on the roof edge (unless a terrace is there).
  const yc = f.y1 - 0.05;
  sweep(f, f.a0, f.a1, yc - 0.38, CORNICE, S[pal.frame], { tier: 'far' });
  if (L >= 1.5) chhajja(f, f.a0, f.a1, yc - 0.42, S[pal.frame], pal.frame, pal.trim);
  if (!f.terraceTop && (pal.wall === 'sandstone' || pal.wall === 'brick' || pal.wall === 'marble')) merlons(f, f.a0, f.a1, f.y1, pal, 0.25);
}

/** Haveli-style facade: brick plinth, arched windows, jharokhas and balconies, fresco bands, wooden chhajjas. */
function haveliFace(f: ExposedFace): void {
  const S = LM.surf;
  const L = f.a1 - f.a0;
  const front = f.front;
  const skyline = !front;
  const tier: Tier = skyline ? 'far' : 'near';
  const h = f.y1 - f.y0;
  if (h < 1.2) return;
  const lane = !!front && front.ceiling === null && !front.stair;
  const covered = !!front && front.ceiling !== null;
  if (front && Math.abs(front.floor - f.y0) < 0.35 && !front.stair) sweep(f, f.a0, f.a1, f.y0, [[0, 0], [0.12, 0], [0.12, 0.5], [0.06, 0.56], [0, 0.58]], S.brick, { tier: 'near' });
  const nb = Math.max(1, Math.round(L / 3.4)), bw = L / nb;
  // Storeys: 4.2 m, from the face base.
  let yb = f.y0;
  let storey = 0;
  while (yb + 3.0 <= f.y1 - (covered ? 0.3 : 0.6)) {
    const top = Math.min(yb + 4.2, f.y1);
    const upper = yb >= 6.5; // above the street storey
    for (let k = 0; k < nb; k++) {
      if (front?.stair) break;
      const a = f.a0 + bw * (k + 0.5);
      const [x, z] = along(f, a);
      if (bw < 1.9 || busy(x, yb, z, 1.0, top)) continue;
      const r = rnd();
      if (upper && lane && r < 0.28 && top - yb > 3.6 && bw >= 2.9) {
        put(K('jharokha2'), x, yb + 0.1, z, yawOf(f), 1, { stone: 'sandstone', trim: 'marble', tier: 'far', cast: true });
        if (r < 0.1) lamps(x + f.nx * 1.0, yb + 2.4, z + f.nz * 1.0, 'lantern');
      } else if (upper && lane && r < 0.42 && bw >= 3.2) {
        put(K('wood_balcony'), x, yb - 1.1, z, yawOf(f), 1, { tier: 'near', cast: true });
      } else if (skyline && r < 0.45) {
        continue; // blank stretch
      } else {
        put(K('window_arched'), x, yb + (upper || storey > 0 ? 0.8 : 1.15), z, yawOf(f), upper || storey > 0 ? 1 : 0.82, { tier });
      }
    }
    // Storey line: fresco band + string course + wooden hood (not on the top storey of a covered room)
    if (top < f.y1 - 0.5) {
      if (!skyline) for (let a = f.a0 + 0.2; a + 1.0 <= f.a1 - 0.2; a += 1.2) panel(f, a, a + 1.0, top - 0.95, top - 0.35, 0.015, LM.fresco, FRESCO.vine as unknown as [number, number, number, number], 'near');
      sweep(f, f.a0, f.a1, top - 0.3, STRING, S.plaster, { tier });
      if (lane || skyline) sweep(f, f.a0 - 0.1, f.a1 + 0.1, top + 0.12, HOOD_WOOD, S.wood, { tier: 'far', cast: true });
    }
    yb = top;
    storey++;
    if (storey > 3) break;
  }
  if (covered) { sweep(f, f.a0, f.a1, f.y1 - 0.3, [[0, 0], [0.1, 0.05], [0.16, 0.18], [0.16, 0.3], [0, 0.3]], S.plaster, { tier }); return; }
  // Roof edge: cornice + plaster parapet with small crenels (terraces are railed by the raster instead).
  sweep(f, f.a0, f.a1, f.y1 - 0.34, CORNICE, S.plaster, { tier: 'far' });
  if (!f.terraceTop) {
    sweep(f, f.a0, f.a1, f.y1, [[-0.25, 0], [0.02, 0], [0.02, 0.5], [0.06, 0.56], [-0.29, 0.56], [-0.25, 0.5]], S[f.surf === 'plasterBlue' ? 'plasterBlue' : 'plasterOchre'], { tier: 'far', cast: true });
    merlons(f, f.a0, f.a1, f.y1 + 0.56, { wall: 'plasterOchre', frame: f.surf === 'plasterBlue' ? 'plasterBlue' : 'plasterOchre', trim: 'plaster' }, 0.12, 0.42, 1.1);
  }
}

// ------------------------------------------------------------------------------------------------
/** Area on one side of a wall run (sampled at its midpoint). */
function areaBeside(w: WallRun, sgn: number, R?: Raster): AreaDef | null {
  void R;
  const mid = (w.a0 + w.a1) / 2;
  const x = w.axis === 'x' ? mid : w.at + sgn * 0.5, z = w.axis === 'x' ? w.at + sgn * 0.5 : mid;
  let best: AreaDef | null = null, bf = -Infinity;
  for (const a of AREAS) {
    if (a.mass) continue;
    for (const [x0, z0, x1, z1] of a.rects) {
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const fl = a.stair ? a.stair.y0 : a.floor;
      if (fl <= w.y0 + 0.7 && (a.ceiling ?? Infinity) > w.y0 + 0.5 && fl > bf) { bf = fl; best = a; }
    }
  }
  return best;
}

function dressWall(w: WallRun): void {
  const S = LM.surf;
  const L = w.a1 - w.a0;
  if (L < 0.9) return;
  const hav = HAVELI.has(w.surf);
  const pal = PAL[w.surf] ?? PAL.sandstone!;
  if (w.kind === 'parapet') {
    // Coping + (fort) merlons along the top; the raster's invisible wall above keeps players in.
    const f: FaceFrame = { axis: w.axis, at: w.at, nx: w.axis === 'z' ? 1 : 0, nz: w.axis === 'x' ? 1 : 0 };
    sweep(f, w.a0, w.a1, w.y1 - 0.01, COPING(0.45).map(([d, hh]) => [d - 0.225, hh] as [number, number]), S[hav ? 'plaster' : pal.trim === 'stoneDark' ? 'marble' : 'sandstone'], { tier: 'far' });
    if (!hav) merlons(f, w.a0, w.a1, w.y1 + 0.15, pal, 0, 0.7);
    return;
  }
  if (w.kind !== 'wall') return;
  const h = w.y1 - w.y0;
  for (const sgn of [-1, 1]) {
    const front = areaBeside(w, sgn);
    if (!front) continue;
    const f: ExposedFace = {
      axis: w.axis, at: w.at + sgn * 0.15, a0: w.a0, a1: w.a1, y0: w.y0, y1: w.y1, nx: w.axis === 'z' ? sgn : 0, nz: w.axis === 'x' ? sgn : 0,
      surf: w.surf, front, terraceTop: true, outside: false,
    };
    if (h < 2) {
      sweep(f, w.a0, w.a1, w.y1 - 0.12, [[0, 0], [0.06, 0.04], [0.06, 0.12], [0, 0.12]], S[hav ? 'plaster' : 'sandstone'], { tier: 'near' });
      continue;
    }
    if (hav) haveliFace(f); else fortFace(f);
  }
  // Coping on the wall top (seen from above and from the far side).
  const f0: FaceFrame = { axis: w.axis, at: w.at, nx: w.axis === 'z' ? 1 : 0, nz: w.axis === 'x' ? 1 : 0 };
  sweep(f0, w.a0, w.a1, w.y1, COPING(0.3).map(([d, hh]) => [d - 0.15, hh] as [number, number]), S[hav ? 'plaster' : 'sandstone'], { tier: 'far' });
}

// ------------------------------------------------------------------------------------------------
/** Balustrades for rails and low edges (the raster's rails become collider-only in def.ts). */
export function dressRails(R: Raster): void {
  for (const w of R.walls) {
    if (w.kind !== 'rail' && w.kind !== 'low') continue;
    const L = w.a1 - w.a0;
    const n = Math.max(1, Math.round(L / 3));
    const wood = HAVELI.has(w.surf) || w.surf === 'wood';
    const h = w.y1 - w.y0;
    for (let k = 0; k < n; k++) {
      const c = w.a0 + (L / n) * (k + 0.5);
      const x = w.axis === 'x' ? c : w.at, z = w.axis === 'x' ? w.at : c;
      put(K(wood ? 'rail_wood' : 'rail_marble'), x, w.y0, z, w.axis === 'x' ? 0 : Math.PI / 2, [L / n / 3, h, 1], { stone: wood ? 'wood' : 'marble', tier: 'near' });
    }
  }
}

/** Pierced jaali screens (alpha-tested) with a stone frame, for the raster's jaali runs. */
export function dressJaalis(R: Raster): void {
  for (const w of R.walls) {
    if (w.kind !== 'jaali') continue;
    for (const sgn of [-1, 1]) {
      const f: FaceFrame = { axis: w.axis, at: w.at, nx: w.axis === 'z' ? sgn : 0, nz: w.axis === 'x' ? sgn : 0 };
      const L = w.a1 - w.a0;
      panel(f, w.a0, w.a1, w.y0, w.y1, 0.0 + sgn * 0.0, LM.jaaliStone, [0, 0, L, w.y1 - w.y0], 'far');
      if (sgn > 0) break; // double-sided material: one panel
    }
    const f: FaceFrame = { axis: w.axis, at: w.at, nx: w.axis === 'z' ? 1 : 0, nz: w.axis === 'x' ? 1 : 0 };
    const n = Math.max(1, Math.round((w.a1 - w.a0) / 2.2));
    for (let k = 0; k <= n; k++) {
      const a = w.a0 + ((w.a1 - w.a0) / n) * k;
      const [x, z] = along(f, a);
      putM(K('pilaster_shaft'), mat4(x, w.y0, z, 0, [1.2, w.y1 - w.y0, 3]), { stone: 'sandstone', tier: 'near' });
    }
    sweep({ ...f, at: w.at - 0.15 }, w.a0, w.a1, w.y1, COPING(0.3), LM.surf.sandstone, { tier: 'near' });
  }
}
