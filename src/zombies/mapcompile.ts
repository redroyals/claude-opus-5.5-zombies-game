// Compiles a ZombiesMapDef into primitive boxes, quads, windows, door colliders and nav links.
// Pure (no three.js): the renderer (ZombiesMap), the runtime and the validator all use the same output,
// so what you see, what you collide with and what the validator checks can never drift apart.
import type { Box, Surface } from '../world/Collision';
import { CollisionWorld } from '../world/Collision';
import type { NavLink } from '../world/NavGrid';
import {
  dirVec, perkEntries, roomCeiling, type BoxTuple, type Collide, type DoorDef, type MatRef, type OpeningDef, type P2, type P3,
  type Rect, type WindowDef, type ZombiesMapDef,
} from './mapdef';
import type { PerkId } from './rules';

export const WALL_T = 0.3;
export const WIN = { half: 0.75, y0: 0.85, y1: 2.25 };
/** Pocket depth behind a window (spawn yard). */
const POCKET = 3.3;

export interface CBox { box: BoxTuple; mat: MatRef | null; tile: number; collide: Collide; surface: Surface; shadow: boolean }
export interface CQuad { rect: Rect; y: number; mat: MatRef; tile: number }
export interface CSlope { rect: Rect; dir: '+x' | '-x' | '+z' | '-z'; y0: number; y1: number; mat: MatRef }
export interface CWindow {
  def: WindowDef;
  /** Blocking frame collider (does not stop bullets). */
  frame: BoxTuple;
  outside: P2; inside: P2; spawn: P2;
}
export interface CLadder { x: number; z: number; y0: number; y1: number; yaw: number; bottom: P3; top: P3 }
export interface CompiledMap {
  boxes: CBox[];
  quads: CQuad[];
  slopes: CSlope[];
  windows: CWindow[];
  doors: { def: DoorDef; box: BoxTuple }[];
  /** Mystery box / perk / Reforger / power-switch footprints. */
  machines: CBox[];
  links: NavLink[];
  ladders: CLadder[];
}

/** Perk machine footprints [width along its X, depth along its Z], matching the authored models. */
export const PERK_FOOT: Record<PerkId, [number, number]> = { bulwark: [1.0, 0.85], quickhands: [0.8, 0.75], hammerfall: [1.9, 1.9], lifeline: [1.75, 1.2] };

function tuple(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BoxTuple {
  return [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
}

/** Footprint AABB of a (w x d) rectangle rotated by yaw (exact for multiples of 90 degrees). */
export function yawFootprint(yaw: number, w: number, d: number): [number, number] {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  return [(w * c + d * s) / 2, (w * s + d * c) / 2];
}

export function compileMap(def: ZombiesMapDef): CompiledMap {
  const out: CompiledMap = { boxes: [], quads: [], slopes: [], windows: [], doors: [], machines: [], links: [], ladders: [] };
  const add = (b: BoxTuple, mat: MatRef | null, tile = 2, collide: Collide = 'solid', surface: Surface = 'concrete', shadow = true) =>
    out.boxes.push({ box: b, mat, tile, collide, surface, shadow });

  // ---- Rooms: floors, ceilings, beams, skirting ----
  for (const r of def.rooms) {
    const { x0, z0, x1, z1 } = r.rect;
    const fm = r.floorMat ?? 'concreteDark';
    if (r.floor > 0) {
      const support = r.support ?? 'plinth';
      if (support === 'plinth') add(tuple(x0, 0, z0, x1, r.floor, z1), 'concrete', 2, 'floor');
      else if (support === 'slab') add(tuple(x0, r.floor - 0.3, z0, x1, r.floor, z1), 'concreteDark', 2, 'floor');
      out.quads.push({ rect: r.rect, y: r.floor + 0.005, mat: fm, tile: 2 });
    } else out.quads.push({ rect: r.rect, y: 0.005, mat: fm, tile: 3 });
    const ceil = roomCeiling(def, r);
    if (ceil !== null) {
      add(tuple(x0, ceil, z0, x1, ceil + 0.3, z1), r.ceilingMat ?? 'concreteDark', 3);
      if (r.beams !== false) for (let x = x0 + 3; x < x1 - 1; x += 4) add(tuple(x - 0.15, ceil - 0.35, z0, x + 0.15, ceil, z1), r.beams ?? 'rust', 2, 'none');
    }
  }

  // ---- Walls with automatic door/window openings ----
  for (const w of def.walls) {
    const T = w.thickness ?? WALL_T;
    const openings: OpeningDef[] = [...(w.openings ?? [])];
    for (const win of def.windows) {
      const onLine = w.axis === 'x' ? win.nz !== 0 && Math.abs(win.z - w.at) < 0.01 : win.nx !== 0 && Math.abs(win.x - w.at) < 0.01;
      if (!onLine) continue;
      const along = w.axis === 'x' ? win.x : win.z;
      const o = { a: along - WIN.half, b: along + WIN.half, y0: win.floor + WIN.y0, y1: win.floor + WIN.y1 };
      if (along < w.a0 || along > w.a1 || o.y1 <= w.y0 || o.y0 >= w.y1) continue;
      openings.push(o);
    }
    for (const d of def.doors) {
      if (d.axis !== w.axis || Math.abs(d.at - w.at) > 0.01 || d.a0 < w.a0 - 1e-6 || d.a1 > w.a1 + 1e-6) continue;
      if (d.y1 <= w.y0 || d.y0 >= w.y1) continue;
      openings.push({ a: d.a0, b: d.a1, y0: d.y0, y1: d.y1 });
    }
    const seg = (b0: number, b1: number, c0: number, c1: number) => {
      if (b1 - b0 < 1e-3 || c1 - c0 < 1e-3) return;
      if (w.axis === 'x') add(tuple(b0, c0, w.at - T / 2, b1, c1, w.at + T / 2), w.mat ?? 'plaster', 2, w.collide ?? 'solid');
      else add(tuple(w.at - T / 2, c0, b0, w.at + T / 2, c1, b1), w.mat ?? 'plaster', 2, w.collide ?? 'solid');
    };
    let cur = w.a0;
    for (const o of openings.sort((p, q) => p.a - q.a)) {
      seg(cur, o.a, w.y0, w.y1);
      seg(o.a, o.b, w.y0, Math.max(w.y0, o.y0)); // sill
      seg(o.a, o.b, Math.min(w.y1, o.y1), w.y1); // lintel
      cur = o.b;
    }
    seg(cur, w.a1, w.y0, w.y1);
  }

  // ---- Skirting trims ----
  for (const r of def.rooms) {
    if (r.skirting === false) continue;
    const { x0, z0, x1, z1 } = r.rect, y = r.floor;
    add(tuple(x0 + 0.15, y, z0 + 0.15, x1 - 0.15, y + 0.12, z0 + 0.2), 'metalDark', 1, 'none');
    add(tuple(x0 + 0.15, y, z1 - 0.2, x1 - 0.15, y + 0.12, z1 - 0.15), 'metalDark', 1, 'none');
  }

  // ---- Stairs, ramps, ladders ----
  for (const s of def.stairs ?? []) {
    const steps = s.steps ?? Math.max(2, Math.ceil((s.y1 - s.y0) / 0.34));
    const dv = dirVec(s.dir);
    const { x0, z0, x1, z1 } = s.rect;
    const along = dv.x !== 0 ? x1 - x0 : z1 - z0;
    const depth = along / steps;
    for (let k = 1; k <= steps; k++) {
      const top = s.y0 + ((s.y1 - s.y0) * k) / steps;
      // Step k spans [k-1, k] * depth from the low end; the low end is opposite to `dir`.
      const lo = (k - 1) * depth, hi = k * depth;
      let b: BoxTuple;
      let nose: BoxTuple;
      if (s.dir === '+x') { b = tuple(x0 + lo, s.y0, z0, x0 + hi, top, z1); nose = tuple(x0 + lo, top, z0, x0 + lo + 0.08, top + 0.02, z1); }
      else if (s.dir === '-x') { b = tuple(x1 - hi, s.y0, z0, x1 - lo, top, z1); nose = tuple(x1 - lo - 0.08, top, z0, x1 - lo, top + 0.02, z1); }
      else if (s.dir === '+z') { b = tuple(x0, s.y0, z0 + lo, x1, top, z0 + hi); nose = tuple(x0, top, z0 + lo, x1, top + 0.02, z0 + lo + 0.08); }
      else { b = tuple(x0, s.y0, z1 - hi, x1, top, z1 - lo); nose = tuple(x0, top, z1 - lo - 0.08, x1, top + 0.02, z1 - lo); }
      add(b, s.mat ?? 'metalDark', 1, 'floor', 'metal');
      if (s.nosing !== null) add(nose, s.nosing ?? 'hazardYellow', 1, 'none');
    }
    const rail = s.rail === undefined ? null : s.rail;
    if (rail) {
      // Left/right relative to someone walking up the stairs.
      const left = { x: dv.z, z: -dv.x }; // rotate dir 90 degrees counter-clockwise (viewed from above, -Z north)
      const sides: (1 | -1)[] = rail === 'both' ? [1, -1] : rail === 'left' ? [1] : [-1];
      for (const sd of sides) {
        const nx = left.x * sd, nz = left.z * sd;
        const rx0 = nx < 0 ? x0 - 0.12 : nx > 0 ? x1 : x0, rx1 = nx < 0 ? x0 : nx > 0 ? x1 + 0.12 : x1;
        const rz0 = nz < 0 ? z0 - 0.12 : nz > 0 ? z1 : z0, rz1 = nz < 0 ? z0 : nz > 0 ? z1 + 0.12 : z1;
        add(tuple(rx0, s.y0, rz0, rx1, s.y1 + 1.0, rz1), 'steel', 1, 'solid', 'metal');
      }
    }
  }
  for (const r of def.ramps ?? []) {
    const { x0, z0, x1, z1 } = r.rect;
    const n = Math.max(2, Math.ceil((r.y1 - r.y0) / 0.12));
    const alongX = r.dir === '+x' || r.dir === '-x';
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let k = 1; k <= n; k++) {
      const top = r.y0 + ((r.y1 - r.y0) * k) / n;
      const lo = ((k - 1) * len) / n;
      const b = r.dir === '+x' ? tuple(x0 + lo, r.y0, z0, x1, top, z1) : r.dir === '-x' ? tuple(x0, r.y0, z0, x1 - lo, top, z1)
        : r.dir === '+z' ? tuple(x0, r.y0, z0 + lo, x1, top, z1) : tuple(x0, r.y0, z0, x1, top, z1 - lo);
      add(b, null, 1, 'floor', 'concrete', false);
    }
    out.slopes.push({ rect: r.rect, dir: r.dir, y0: r.y0, y1: r.y1, mat: r.mat ?? 'concreteDark' });
  }
  for (const l of def.ladders ?? []) {
    const dx = l.top.x - l.bottom.x, dz = l.top.z - l.bottom.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    const x = l.bottom.x + ux * 0.45, z = l.bottom.z + uz * 0.45;
    out.ladders.push({ x, z, y0: l.bottom.y, y1: l.top.y, yaw: Math.atan2(-ux, -uz), bottom: l.bottom, top: l.top });
    out.links.push({ ax: l.bottom.x, ay: l.bottom.y, az: l.bottom.z, bx: l.top.x, by: l.top.y, bz: l.top.z, kind: 'ladder', twoWay: true });
  }
  for (const k of def.links ?? []) {
    out.links.push({ ax: k.from.x, ay: k.from.y, az: k.from.z, bx: k.to.x, by: k.to.y, bz: k.to.z, kind: k.kind, twoWay: k.twoWay, cost: k.cost });
  }

  // ---- Windows: frame collider + outside pocket ----
  for (const w of def.windows) {
    const alongX = w.nz !== 0;
    const cx = w.x, cz = w.z;
    const y1 = w.floor + WIN.y1;
    const hx = alongX ? WIN.half : WALL_T / 2 + 0.05, hz = alongX ? WALL_T / 2 + 0.05 : WIN.half;
    const o = (d: number): P2 => ({ x: cx + w.nx * d, z: cz + w.nz * d });
    out.windows.push({ def: w, frame: tuple(cx - hx, w.floor, cz - hz, cx + hx, y1 + 0.2, cz + hz), outside: o(0.75), inside: o(-0.95), spawn: o(2.5) });
    if (w.pocket === false) continue;
    if (w.floor > 0) {
      const p0 = o(0.2), p1 = o(3.2);
      add(tuple(Math.min(p0.x, p1.x) - (alongX ? 1.6 : 0), 0, Math.min(p0.z, p1.z) - (alongX ? 0 : 1.6),
        Math.max(p0.x, p1.x) + (alongX ? 1.6 : 0), w.floor, Math.max(p0.z, p1.z) + (alongX ? 0 : 1.6)), 'concreteDark', 2, 'floor');
    }
    const a = o(0.15), b = o(POCKET);
    for (const sd of [-1, 1]) {
      if (alongX) add(tuple(cx + sd * 1.6 - 0.15, 0, Math.min(a.z, b.z), cx + sd * 1.6 + 0.15, w.floor + 3.2, Math.max(a.z, b.z)), 'brickDark', 2);
      else add(tuple(Math.min(a.x, b.x), 0, cz + sd * 1.6 - 0.15, Math.max(a.x, b.x), w.floor + 3.2, cz + sd * 1.6 + 0.15), 'brickDark', 2);
    }
    if (alongX) add(tuple(cx - 1.75, 0, b.z - 0.15, cx + 1.75, w.floor + 3.2, b.z + 0.15), 'brickDark', 2);
    else add(tuple(b.x - 0.15, 0, cz - 1.75, b.x + 0.15, w.floor + 3.2, cz + 1.75), 'brickDark', 2);
  }

  // ---- Doors (removable colliders) ----
  for (const d of def.doors) {
    const box = d.axis === 'x' ? tuple(d.a0, d.y0, d.at - 0.25, d.a1, d.y1, d.at + 0.25) : tuple(d.at - 0.25, d.y0, d.a0, d.at + 0.25, d.y1, d.a1);
    out.doors.push({ def: d, box });
  }

  // ---- Authored static geometry ----
  for (const b of def.boxes ?? []) add(b.box, b.mat === null ? null : b.mat ?? 'concrete', b.tile ?? 2, b.collide ?? 'solid', b.surface ?? 'concrete', b.shadow ?? true);
  for (const c of def.cylinders ?? []) {
    const y = c.y ?? 0;
    if ((c.collide ?? 'solid') !== 'none') add(tuple(c.x - c.r, y, c.z - c.r, c.x + c.r, y + c.h, c.z + c.r), null, 1, c.collide ?? 'solid', c.surface ?? 'metal');
  }
  for (const p of def.props ?? []) {
    if (!p.collider) continue;
    const [hx, hz] = yawFootprint(p.yaw ?? 0, p.collider.w, p.collider.d);
    const y = p.y ?? 0;
    add(tuple(p.x - hx, y, p.z - hz, p.x + hx, y + p.collider.h, p.z + hz), null, 1, p.collider.collide ?? 'solid', p.collider.surface ?? 'metal');
  }
  for (const q of def.quads ?? []) out.quads.push({ rect: q.rect, y: q.y, mat: q.mat, tile: q.tile ?? 2 });

  // ---- Machine footprints ----
  const mach = (b: BoxTuple, surface: Surface) => out.machines.push({ box: b, mat: null, tile: 1, collide: 'solid', surface, shadow: false });
  for (const s of def.box.spots) { const y = s.y ?? 0; mach(tuple(s.x - 0.7, y, s.z - 0.7, s.x + 0.7, y + 0.62, s.z + 0.7), 'wood'); }
  for (const [id, s] of perkEntries(def)) {
    const y = s.y ?? 0;
    const [fw, fd] = def.machines?.perks?.[id]?.foot ?? PERK_FOOT[id];
    const side = Math.abs(Math.sin(s.face)) > 0.5;
    const hx = (side ? fd : fw) / 2, hz = (side ? fw : fd) / 2;
    mach(tuple(s.x - hx, y, s.z - hz, s.x + hx, y + 2.2, s.z + hz), 'metal');
  }
  if (def.pap) {
    const s = def.pap, y = s.y ?? 0;
    const side = Math.abs(Math.sin(s.face)) > 0.5;
    const hx = side ? 0.65 : 1.15, hz = side ? 1.15 : 0.65;
    mach(tuple(s.x - hx, y, s.z - hz, s.x + hx, y + 3.2, s.z + hz), 'metal');
  }
  if (def.power) {
    const s = def.power, y = s.y ?? 0;
    const side = Math.abs(Math.sin(s.face)) > 0.5;
    const hx = side ? 0.2 : 0.6, hz = side ? 0.6 : 0.2;
    mach(tuple(s.x - hx, y, s.z - hz, s.x + hx, y + 2.1, s.z + hz), 'metal');
  }
  return out;
}

export interface MapColliders { world: CollisionWorld; doors: Map<string, Box>; windows: Box[] }

/** Adds every collider of a compiled map to a fresh CollisionWorld. */
export function buildColliders(def: ZombiesMapDef, cm: CompiledMap): MapColliders {
  const { minX, minZ, maxX, maxZ } = def.bounds;
  const world = new CollisionWorld(minX, minZ, maxX, maxZ);
  const put = (b: CBox) => {
    if (b.collide === 'none') return null;
    const [x0, y0, z0, x1, y1, z1] = b.box;
    return world.add(x0, y0, z0, x1, y1, z1, { surface: b.surface, floor: b.collide === 'floor', solid: b.collide !== 'nonsolid' });
  };
  for (const b of cm.boxes) put(b);
  const windows = cm.windows.map((w) => { const [x0, y0, z0, x1, y1, z1] = w.frame; return world.add(x0, y0, z0, x1, y1, z1, { solid: false, surface: 'wood' }); });
  const doors = new Map<string, Box>();
  for (const d of cm.doors) {
    const [x0, y0, z0, x1, y1, z1] = d.box;
    doors.set(d.def.id, world.add(x0, y0, z0, x1, y1, z1, { surface: d.def.kind === 'debris' ? 'wood' : 'metal' }));
  }
  for (const m of cm.machines) put(m);
  return { world, doors, windows };
}

/** Collapse a door collider (the broadphase references boxes, so we move it out of the way). */
export function openDoorBox(b: Box): void { b.minY = b.maxY = -100; }
export function closeDoorBox(b: Box, d: DoorDef): void { b.minY = d.y0; b.maxY = d.y1; }
