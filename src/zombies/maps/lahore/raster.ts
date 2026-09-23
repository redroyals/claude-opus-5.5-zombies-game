// Rasterising compiler for the Lahore Darbar layout (pure, no three.js).
// Areas are painted onto a 1 m grid per layer. Everything inside a REGION that is not an area becomes solid
// "mass" (the fort's masonry, the haveli blocks) whose top is the next walkable floor or the region skyline.
// Every grid edge is then classified once: open (same zone), wall (different zones / enclosure), rail
// (a drop), parapet (roof edge) or nothing (a mass face already closes it). Walls are merged into long runs.
import { AREAS, DOORS, DOOR_H, JAALIS, JUMPS, REGIONS, WINDOWS, type AreaDef, type Layer, type Side, type Surf } from './layout';

export const GRID = { minX: -64, minZ: -76, maxX: 94, maxZ: 42 };
const W = GRID.maxX - GRID.minX, H = GRID.maxZ - GRID.minZ;
const LAYERS: Layer[] = ['B', 'G', 'U', 'R'];
const EPS = 1e-6;

export type WallKind = 'wall' | 'rail' | 'low' | 'parapet' | 'invisible' | 'jaali';
export interface WallRun { axis: 'x' | 'z'; at: number; a0: number; a1: number; y0: number; y1: number; surf: Surf; kind: WallKind }
export interface MassBox { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; surf: Surf; floor: boolean }
export interface RoomRect { area: AreaDef; x0: number; z0: number; x1: number; z1: number }
export interface LinkSpec { from: [number, number, number]; to: [number, number, number]; kind: 'drop' | 'jump'; twoWay?: boolean }
export interface Raster {
  masses: MassBox[];
  walls: WallRun[];
  rooms: RoomRect[];
  links: LinkSpec[];
  /** Per-layer cell -> area index (for tests, the plan renderer and zone queries). */
  grid: Record<Layer, Int16Array>;
  problems: string[];
}

const idx = (i: number, j: number) => j * W + i;
const cellX = (i: number) => GRID.minX + i;
const cellZ = (j: number) => GRID.minZ + j;

/** Height of an area's walking surface at world point (x, z). Stairs rise linearly along `dir`. */
export function floorAt(a: AreaDef, x: number, z: number): number {
  if (!a.stair) return a.floor;
  const [x0, z0, x1, z1] = a.rects[0];
  const { dir, y0, y1 } = a.stair;
  const t = dir === '+x' ? (x - x0) / (x1 - x0) : dir === '-x' ? (x1 - x) / (x1 - x0) : dir === '+z' ? (z - z0) / (z1 - z0) : (z1 - z) / (z1 - z0);
  return y0 + (y1 - y0) * Math.min(1, Math.max(0, t));
}

/** Top of the airspace an area encloses (its ceiling, or a nominal height when open). */
function areaTop(a: AreaDef): number {
  if (a.ceiling !== null) return a.ceiling;
  const top = a.stair ? a.stair.y1 : a.floor;
  return top + (a.layer === 'G' ? 6 : 4.5);
}

export function rasterize(): Raster {
  const problems: string[] = [];
  const grid = {} as Record<Layer, Int16Array>;
  const forcedMass = {} as Record<Layer, Uint8Array>;
  for (const L of LAYERS) { grid[L] = new Int16Array(W * H).fill(-1); forcedMass[L] = new Uint8Array(W * H); }
  AREAS.forEach((a, k) => {
    for (const [x0, z0, x1, z1] of a.rects) {
      for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
        const i = x - GRID.minX, j = z - GRID.minZ;
        if (i < 0 || j < 0 || i >= W || j >= H) { problems.push(`${a.id} outside grid`); continue; }
        if (a.mass) { forcedMass[a.layer][idx(i, j)] = 1; grid[a.layer][idx(i, j)] = -1; } else grid[a.layer][idx(i, j)] = k;
      }
    }
  });
  const areaAt = (L: Layer, i: number, j: number): number => (i < 0 || j < 0 || i >= W || j >= H ? -1 : grid[L][idx(i, j)]);

  // ---- Regions (skyline per cell) ----
  const regionTop = new Float32Array(W * H).fill(-1);
  const regionSurf: Surf[] = new Array(W * H);
  for (const r of REGIONS) {
    const [x0, z0, x1, z1] = r.rect;
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
      const i = x - GRID.minX, j = z - GRID.minZ;
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      regionTop[idx(i, j)] = r.top; regionSurf[idx(i, j)] = r.surf;
    }
  }

  // ---- Window pockets: carve the mass behind each window (their back yards are built by the map compiler) ----
  const pocketLo = new Float32Array(W * H).fill(Infinity), pocketHi = new Float32Array(W * H).fill(-Infinity);
  for (const w of WINDOWS) {
    for (let d = 0.5; d < 3.6; d += 1) for (let s = -1.5; s <= 1.5; s += 1) {
      const x = w.x + w.nx * d + (w.nz !== 0 ? s : 0), z = w.z + w.nz * d + (w.nx !== 0 ? s : 0);
      const i = Math.floor(x - GRID.minX), j = Math.floor(z - GRID.minZ);
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      pocketLo[idx(i, j)] = Math.min(pocketLo[idx(i, j)], w.floor);
      pocketHi[idx(i, j)] = Math.max(pocketHi[idx(i, j)], w.floor + 3.6);
      for (const L of LAYERS) {
        const k = grid[L][idx(i, j)];
        if (k < 0) continue;
        const ar = AREAS[k], lo = ar.stair ? ar.stair.y0 : ar.floor, hi = ar.ceiling ?? Infinity;
        if (lo < w.floor + 3.9 && hi > w.floor) problems.push(`window at ${w.x},${w.z}: pocket overlaps area ${ar.id}`);
      }
    }
  }

  // ---- Mass columns ----
  // Each cell: solid intervals (bottom, top, floorFlag) between the areas stacked in it.
  type Iv = [number, number, boolean];
  const cols: Iv[][] = new Array(W * H);
  const surfOf = (i: number, j: number): Surf => {
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const L of LAYERS) {
      const k = areaAt(L, i + di, j + dj);
      if (k >= 0) return AREAS[k].wallSurf;
    }
    return regionSurf[idx(i, j)] ?? 'sandstone';
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = idx(i, j);
    const top = regionTop[c];
    const stack = LAYERS.map((L) => grid[L][c]).filter((k) => k >= 0).map((k) => AREAS[k])
      .map((a) => ({ a, lo: a.stair ? a.stair.y0 : a.floor, hi: a.ceiling ?? Infinity }))
      .sort((p, q) => p.lo - q.lo);
    const out: Iv[] = [];
    if (top < 0) {
      // Outside the built footprint: only supports under areas (should not happen; flagged by tests).
      if (stack.length) problems.push(`area ${stack[0].a.id} outside regions at ${cellX(i)},${cellZ(j)}`);
      cols[c] = out; continue;
    }
    let cur = 0;
    let last: (typeof stack)[number] | null = null;
    for (const s of stack) {
      if (s.lo > cur + EPS) out.push([cur, s.lo, true]);
      if (s.lo < cur - EPS) problems.push(`overlapping areas ${last?.a.id} / ${s.a.id} at ${cellX(i)},${cellZ(j)}`);
      cur = s.hi; last = s;
    }
    if (cur !== Infinity) {
      if (last && last.a.roof === 'slab') out.push([cur, cur + 0.45, false]);
      else out.push([cur, Math.max(top, cur + 0.6), false]);
    }
    // Carve window pockets.
    if (pocketHi[c] > pocketLo[c]) {
      const lo = pocketLo[c], hi = pocketHi[c];
      const carved: Iv[] = [];
      for (const [a, b, f] of out) {
        if (b <= lo || a >= hi) { carved.push([a, b, f]); continue; }
        if (a < lo) carved.push([a, lo, true]);
        if (b > hi) carved.push([hi, b, f]);
      }
      cols[c] = carved;
    } else cols[c] = out;
  }
  const massTopAt = (i: number, j: number, y: number): { covered: boolean; void: boolean } => {
    // Is there solid mass covering [y, y+2.4] in this column?
    if (i < 0 || j < 0 || i >= W || j >= H) return { covered: false, void: true };
    const c = cols[idx(i, j)];
    if (regionTop[idx(i, j)] < 0) return { covered: false, void: true };
    return { covered: c.some(([a, b]) => a <= y + 0.05 && b >= y + 2.4), void: false };
  };

  // Greedy-merge mass cells with identical interval lists into boxes.
  const masses: MassBox[] = [];
  const used = new Uint8Array(W * H);
  const keyOf = (c: number) => cols[c].map(([a, b, f]) => `${a.toFixed(2)}:${b.toFixed(2)}:${f ? 1 : 0}`).join('|');
  const keys = new Array<string>(W * H);
  const surfs = new Array<Surf>(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = idx(i, j); keys[c] = keyOf(c); surfs[c] = cols[c].length ? surfOf(i, j) : 'sandstone'; }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = idx(i, j);
    if (used[c] || !cols[c].length) continue;
    const k = keys[c], sf = surfs[c];
    let w = 1;
    while (i + w < W && !used[idx(i + w, j)] && keys[idx(i + w, j)] === k && surfs[idx(i + w, j)] === sf) w++;
    let h = 1;
    outer: while (j + h < H) {
      for (let q = 0; q < w; q++) { const cc = idx(i + q, j + h); if (used[cc] || keys[cc] !== k || surfs[cc] !== sf) break outer; }
      h++;
    }
    for (let dj = 0; dj < h; dj++) for (let q = 0; q < w; q++) used[idx(i + q, j + dj)] = 1;
    for (const [a, b, f] of cols[c]) masses.push({ x0: cellX(i), z0: cellZ(j), x1: cellX(i + w), z1: cellZ(j + h), y0: a, y1: b, surf: sf, floor: f });
  }

  // ---- Edges ----
  // Unit wall pieces keyed by edge; merged afterwards.
  interface Piece { y0: number; y1: number; surf: Surf; kind: WallKind }
  const edges = new Map<string, { axis: 'x' | 'z'; at: number; a: number; pieces: Piece[] }>();
  const addPiece = (axis: 'x' | 'z', at: number, a: number, p: Piece) => {
    if (p.y1 - p.y0 < 0.01) return;
    const key = `${axis}:${at}:${a}`;
    let e = edges.get(key);
    if (!e) { e = { axis, at, a, pieces: [] }; edges.set(key, e); }
    e.pieces.push(p);
  };
  const links: LinkSpec[] = [];
  const seenLinks = new Set<string>();
  const dropFor = (a: AreaDef, side: Side, at: number, along: number) =>
    a.drops?.find((d) => d.side === side && Math.abs(d.at - at) < 0.01 && along + 0.5 >= d.a0 - EPS && along + 0.5 <= d.a1 + EPS);

  const DIRS: { side: Side; di: number; dj: number }[] = [{ side: '+x', di: 1, dj: 0 }, { side: '-x', di: -1, dj: 0 }, { side: '+z', di: 0, dj: 1 }, { side: '-z', di: 0, dj: -1 }];
  for (const L of LAYERS) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = grid[L][idx(i, j)];
      if (k < 0) continue;
      const a = AREAS[k];
      for (const { side, di, dj } of DIRS) {
        const ni = i + di, nj = j + dj;
        // Edge line + along coordinate (cell start along the wall).
        const axis: 'x' | 'z' = dj !== 0 ? 'x' : 'z';
        const at = axis === 'x' ? cellZ(dj > 0 ? j + 1 : j) : cellX(di > 0 ? i + 1 : i);
        const along = axis === 'x' ? cellX(i) : cellZ(j);
        const ex = axis === 'x' ? cellX(i) + 0.5 : at, ez = axis === 'x' ? at : cellZ(j) + 0.5;
        const f = floorAt(a, ex, ez);
        const myTop = areaTop(a);
        // Neighbour on the same layer, or an area on another layer meeting this one at about the same height.
        let nk = areaAt(L, ni, nj);
        if (nk < 0) {
          for (const L2 of LAYERS) {
            const k2 = areaAt(L2, ni, nj);
            if (k2 >= 0 && Math.abs(floorAt(AREAS[k2], ex, ez) - f) < 0.6) { nk = k2; break; }
          }
        }
        if (nk === k) continue;
        if (nk >= 0) {
          const b = AREAS[nk];
          if (b.zone === a.zone) continue; // open
          // Different zones: a wall between. Both sides generate it; the merge dedupes.
          const fb = floorAt(b, ex, ez);
          addPiece(axis, at, along, { y0: Math.min(f, fb), y1: Math.max(myTop, areaTop(b)), surf: a.wallSurf, kind: 'wall' });
          continue;
        }
        // Lower area below this edge that is open above our floor (an overlook)?
        let lower: AreaDef | null = null;
        for (const L2 of LAYERS) {
          const k2 = areaAt(L2, ni, nj);
          if (k2 < 0) continue;
          const b = AREAS[k2];
          if (floorAt(b, ex, ez) < f - 0.6 && (b.ceiling === null || b.ceiling > f + 0.3)) lower = b;
        }
        if (lower) {
          const d = dropFor(a, side, at, along);
          if (lower.ceiling !== null) {
            // The lower area is an enclosed hall: wall us off from its airspace (unless it is a declared drop).
            if (d) { addPiece(axis, at, along, { y0: f, y1: f + 1.0, surf: a.wallSurf, kind: 'rail' }); addDropLink(a, lower, ex, ez, di, dj, f); continue; }
            addPiece(axis, at, along, { y0: f, y1: Math.max(myTop, lower.ceiling + 0.3), surf: a.wallSurf, kind: 'wall' });
            continue;
          }
          if (d) {
            const kind = d.kind ?? 'rail';
            addPiece(axis, at, along, { y0: f, y1: f + (kind === 'low' ? 0.5 : kind === 'parapet' ? 1.1 : 1.0), surf: a.wallSurf, kind });
            addDropLink(a, lower, ex, ez, di, dj, f);
          } else if (a.parapet) {
            addPiece(axis, at, along, { y0: f, y1: f + 1.1, surf: a.wallSurf, kind: 'parapet' });
            addPiece(axis, at, along, { y0: f + 1.1, y1: f + 3.5, surf: a.wallSurf, kind: 'invisible' });
          } else addPiece(axis, at, along, { y0: f, y1: Math.max(f + 3.5, myTop), surf: a.wallSurf, kind: 'wall' });
          continue;
        }
        const m = massTopAt(ni, nj, f);
        if (m.covered) continue; // a mass face closes it
        if (a.parapet) {
          addPiece(axis, at, along, { y0: f, y1: f + 1.1, surf: a.wallSurf, kind: 'parapet' });
          addPiece(axis, at, along, { y0: f + 1.1, y1: f + 3.5, surf: a.wallSurf, kind: 'invisible' });
        } else addPiece(axis, at, along, { y0: f, y1: Math.max(myTop, f + 3.5), surf: a.wallSurf, kind: 'wall' });
      }
    }
  }
  function addDropLink(a: AreaDef, lower: AreaDef, ex: number, ez: number, di: number, dj: number, f: number): void {
    // One drop link every 3 m along a rail (the merge pass thins them).
    const from: [number, number, number] = [ex - di * 0.6, f, ez - dj * 0.6];
    const to: [number, number, number] = [ex + di * 1.0, floorAt(lower, ex + di, ez + dj), ez + dj * 1.0];
    const cellKey = Math.round(axisAlong(di, ex, ez) / 3);
    const tag = `${a.id}:${lower.id}:${di}:${dj}:${cellKey}`;
    if (!seenLinks.has(tag)) { seenLinks.add(tag); links.push({ from, to, kind: 'drop' }); }
  }
  for (const jmp of JUMPS) links.push({ from: jmp.from, to: jmp.to, kind: 'jump', twoWay: true });

  // Windows sit in a short wall across their pocket mouth (the map compiler cuts the opening).
  for (const w of WINDOWS) {
    const axis: 'x' | 'z' = w.nz !== 0 ? 'x' : 'z';
    const at = axis === 'x' ? w.z : w.x, c = axis === 'x' ? w.x : w.z;
    const surf = regionSurf[idx(Math.floor(w.x - GRID.minX - w.nx * 0.5), Math.floor(w.z - GRID.minZ - w.nz * 0.5))] ?? 'brick';
    for (let a = Math.floor(c - 2); a < Math.ceil(c + 2); a++) addPiece(axis, at, a, { y0: w.floor, y1: w.floor + 3.6, surf, kind: 'wall' });
  }

  // Jaali screens replace the walls along their lines.
  for (const s of JAALIS) {
    for (let a = s.a0; a < s.a1; a++) {
      const key = `${s.axis}:${s.at}:${a}`;
      const e = edges.get(key);
      if (!e) { problems.push(`jaali ${s.axis}=${s.at} ${a}: no wall`); continue; }
      e.pieces = e.pieces.map((p) => (p.kind === 'wall' && p.y0 < s.y1 && p.y1 > s.y0 ? { ...p, kind: 'jaali' as WallKind } : p));
    }
  }

  // ---- Merge pieces per edge (solid union wins) and then along runs ----
  const PRI: Record<WallKind, number> = { wall: 5, jaali: 4, parapet: 3, rail: 2, low: 1, invisible: 0 };
  const flat: WallRun[] = [];
  for (const e of edges.values()) {
    const ps = [...e.pieces].sort((p, q) => PRI[q.kind] - PRI[p.kind] || p.y0 - q.y0);
    const taken: [number, number][] = [];
    for (const p of ps) {
      // Subtract already-taken intervals.
      let segs: [number, number][] = [[p.y0, p.y1]];
      for (const [t0, t1] of taken) segs = segs.flatMap(([s0, s1]) => (t1 <= s0 || t0 >= s1 ? [[s0, s1]] : [[s0, t0], [t1, s1]].filter(([x, y]) => y - x > 0.01) as [number, number][]));
      for (const [s0, s1] of segs) {
        flat.push({ axis: e.axis, at: e.at, a0: e.a, a1: e.a + 1, y0: s0, y1: s1, surf: p.surf, kind: p.kind });
        taken.push([s0, s1]);
      }
    }
  }
  flat.sort((p, q) => (p.axis < q.axis ? -1 : p.axis > q.axis ? 1 : p.at - q.at || p.kind.localeCompare(q.kind) || p.y0 - q.y0 || p.y1 - q.y1 || p.surf.localeCompare(q.surf) || p.a0 - q.a0));
  const walls: WallRun[] = [];
  for (const w of flat) {
    const last = walls[walls.length - 1];
    if (last && last.axis === w.axis && last.at === w.at && last.kind === w.kind && last.surf === w.surf && Math.abs(last.y0 - w.y0) < 0.01 && Math.abs(last.y1 - w.y1) < 0.01 && Math.abs(last.a1 - w.a0) < 0.01) last.a1 = w.a1;
    else walls.push({ ...w });
  }

  // ---- Rooms: each area's own cells, greedy rectangles (no overlapping floor quads) ----
  const rooms: RoomRect[] = [];
  for (const L of LAYERS) {
    const g = grid[L];
    const done = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = idx(i, j), k = g[c];
      if (k < 0 || done[c]) continue;
      let w = 1;
      while (i + w < W && g[idx(i + w, j)] === k && !done[idx(i + w, j)]) w++;
      let h = 1;
      outer2: while (j + h < H) { for (let q = 0; q < w; q++) { const cc = idx(i + q, j + h); if (g[cc] !== k || done[cc]) break outer2; } h++; }
      for (let dj = 0; dj < h; dj++) for (let q = 0; q < w; q++) done[idx(i + q, j + dj)] = 1;
      rooms.push({ area: AREAS[k], x0: cellX(i), z0: cellZ(j), x1: cellX(i + w), z1: cellZ(j + h) });
    }
  }

  // ---- Checks: doors and windows must sit on generated walls ----
  const wallCovers = (axis: 'x' | 'z', at: number, a0: number, a1: number, y0: number, y1: number) =>
    walls.filter((w) => w.axis === axis && Math.abs(w.at - at) < 0.01 && w.kind === 'wall' && w.y0 <= y0 + 0.01 && w.y1 >= y1 - 0.01 && w.a0 < a1 && w.a1 > a0)
      .reduce((s, w) => s + Math.min(w.a1, a1) - Math.max(w.a0, a0), 0) >= a1 - a0 - 0.01;
  for (const d of DOORS) if (!wallCovers(d.axis, d.at, d.a0, d.a1, d.y0, d.y0 + DOOR_H)) problems.push(`door ${d.id} not on a full wall`);

  return { masses, walls, rooms, links, grid, problems };

  function axisAlong(di: number, ex: number, ez: number): number { return di !== 0 ? ez : ex; }
}
/** Zone of a world point by the rasterised grid (the highest area at or below y). */
export function zoneAtRaster(r: Raster, x: number, y: number, z: number): number {
  const i = Math.floor(x - GRID.minX), j = Math.floor(z - GRID.minZ);
  if (i < 0 || j < 0 || i >= W || j >= H) return -1;
  let best = -1, bf = -Infinity;
  for (const L of LAYERS) {
    const k = r.grid[L][idx(i, j)];
    if (k < 0) continue;
    const f = floorAt(AREAS[k], x, z);
    if (f <= y + 0.6 && f > bf) { bf = f; best = AREAS[k].zone; }
  }
  return best;
}

export const GRID_W = W, GRID_H = H;
