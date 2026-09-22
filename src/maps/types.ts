// Multiplayer map layout data. Pure data + helpers: no three.js, no DOM, so the sim/server can import it.
// Units: metres. +Y up. Boxes are axis-aligned and map 1:1 onto world/Collision.ts `Box` (minus `stamp`).
import type { Surface } from '../world/Collision';

export type V3 = [number, number, number];

export interface MapBox {
  min: V3;
  max: V3;
  surface: Surface;
  /** Top face is walkable (slabs, stairs, walkways). */
  floor: boolean;
  /** Blocks bullets and sight (railings / laundry lines do not). */
  solid: boolean;
  /** Free-form tag for the viewer / debugging ("stairs", "walkway", "tower-3F"...). */
  tag?: string;
}

/** A kit piece (assets/kits/<map>/<piece>.glb) placed in the world. Visual only; collision comes from `boxes`. */
export interface KitPlacement { piece: string; pos: V3; yaw: number; scale?: number }

export interface SpawnPoint { pos: V3; yaw: number }

export interface FlagPoint { id: 'A' | 'B' | 'C'; pos: V3; radius: number; note: string }

export interface Sightline { from: V3; to: V3; note: string }

export interface MapLayout {
  id: string;
  name: string;
  accent: string; // hex, the one strong colour per map
  palette: string[];
  bounds: { min: V3; max: V3 };
  /** Named play heights (ground, walkway, roof...). At least 3 per DESIGN.md pillar 4. */
  levels: Record<string, number>;
  lanes: { id: string; note: string }[];
  boxes: MapBox[];
  kit: KitPlacement[];
  spawns: { alpha: SpawnPoint[]; bravo: SpawnPoint[]; ffa: SpawnPoint[] };
  flags: FlagPoint[];
  sightlines: Sightline[];
}

// ---------- builder helpers ----------
export class MapBuilder {
  boxes: MapBox[] = [];
  kit: KitPlacement[] = [];

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, surface: Surface = 'concrete', o: Partial<Pick<MapBox, 'floor' | 'solid' | 'tag'>> = {}): this {
    this.boxes.push({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      surface, floor: o.floor ?? true, solid: o.solid ?? true, tag: o.tag,
    });
    return this;
  }

  /** Slab (walkable floor) of thickness t whose TOP is at y. */
  slab(x0: number, z0: number, x1: number, z1: number, y: number, surface: Surface = 'concrete', tag = 'slab', t = 0.3): this {
    return this.box(x0, y - t, z0, x1, y, z1, surface, { tag });
  }

  /** Rectangle minus holes -> list of rects (grid decomposition on hole edges, merged along z). */
  static rectsMinus(x0: number, z0: number, x1: number, z1: number, holes: [number, number, number, number][]): [number, number, number, number][] {
    const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[2]])])].filter((v) => v >= x0 && v <= x1).sort((a, c) => a - c);
    const zs = [...new Set([z0, z1, ...holes.flatMap((h) => [h[1], h[3]])])].filter((v) => v >= z0 && v <= z1).sort((a, c) => a - c);
    const out: [number, number, number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      let start: number | null = null;
      for (let j = 0; j + 1 < zs.length; j++) {
        const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
        const hole = holes.some((h) => cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3]);
        if (!hole && start === null) start = zs[j];
        if (start !== null && (hole || j + 2 === zs.length)) { out.push([xs[i], start, xs[i + 1], hole ? zs[j] : zs[j + 1]]); start = null; }
      }
    }
    return out;
  }

  /** Slab (top at y) with rectangular holes cut out. */
  slabHoles(x0: number, z0: number, x1: number, z1: number, y: number, holes: [number, number, number, number][], surface: Surface = 'concrete', tag = 'slab'): this {
    for (const r of MapBuilder.rectsMinus(x0, z0, x1, z1, holes)) this.slab(r[0], r[1], r[2], r[3], y, surface, tag);
    return this;
  }

  /** Solid terrain fill from y0 to y1 with holes (stairwells, tunnels). */
  fill(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, holes: [number, number, number, number][] = [], surface: Surface = 'concrete', tag = 'terrain'): this {
    for (const r of MapBuilder.rectsMinus(x0, z0, x1, z1, holes)) this.box(r[0], y0, r[1], r[2], y1, r[3], surface, { tag });
    return this;
  }

  /** Thin wall between (x0,z0)-(x1,z1) (axis aligned), from y0 up h. */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, h: number, surface: Surface = 'concrete', t = 0.3, tag = 'wall'): this {
    const cx0 = x0 === x1 ? x0 - t / 2 : x0, cx1 = x0 === x1 ? x0 + t / 2 : x1;
    const cz0 = z0 === z1 ? z0 - t / 2 : z0, cz1 = z0 === z1 ? z0 + t / 2 : z1;
    return this.box(cx0, y0, cz0, cx1, y0 + h, cz1, surface, { floor: false, tag });
  }

  /** Railing: bullets pass, players don't. */
  rail(x0: number, z0: number, x1: number, z1: number, y: number, h = 1.05): this {
    return this.wall(x0, z0, x1, z1, y, h, 'metal', 0.08, 'rail').markLast({ solid: false });
  }

  markLast(o: Partial<MapBox>): this { Object.assign(this.boxes[this.boxes.length - 1], o); return this; }

  /**
   * Straight stair run from (x,z) at height y0 to y1 going along dir ('+x','-x','+z','-z'), width w.
   * Steps rise ≤ 0.3 (under the 0.45 step height) so no mantle is needed.
   */
  stairs(x: number, z: number, y0: number, y1: number, dir: '+x' | '-x' | '+z' | '-z', w = 2, surface: Surface = 'concrete'): this {
    const rise = y1 - y0; const n = Math.max(1, Math.ceil(Math.abs(rise) / 0.28)); const run = 0.32;
    const sx = dir === '+x' ? 1 : dir === '-x' ? -1 : 0, sz = dir === '+z' ? 1 : dir === '-z' ? -1 : 0;
    for (let i = 0; i < n; i++) {
      const top = y0 + (rise * (i + 1)) / n;
      const a = i * run, b = (i + 1) * run;
      if (sx) this.box(x + sx * a, Math.min(y0, top) - 0.3, z - w / 2, x + sx * b, top, z + w / 2, surface, { tag: 'stairs' });
      else this.box(x - w / 2, Math.min(y0, top) - 0.3, z + sz * a, x + w / 2, top, z + sz * b, surface, { tag: 'stairs' });
    }
    return this;
  }

  /** Length of a stair run for a rise (for layout maths). */
  static stairLen(rise: number): number { return Math.max(1, Math.ceil(Math.abs(rise) / 0.28)) * 0.32; }

  /**
   * Hollow multi-storey block: perimeter walls with door gaps on each face at ground,
   * a floor slab per storey and a roof slab. Interior is open-plan (props give cover).
   */
  block(x0: number, z0: number, x1: number, z1: number, y0: number, storeys: number, storeyH = 3.2, surface: Surface = 'concrete', tag = 'block', doors = true): this {
    const top = y0 + storeys * storeyH;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, d = 1.1; // door half-width
    for (let s = 0; s < storeys; s++) {
      const fy = y0 + s * storeyH;
      if (s > 0) this.slab(x0, z0, x1, z1, fy, surface, `${tag}-${s}F`);
      const h = storeyH - 0.3; const lvlDoor = doors && (s === 0 || s % 2 === 1);
      for (const [ax, az, bx, bz, alongX] of [[x0, z0, x1, z0, true], [x0, z1, x1, z1, true], [x0, z0, x0, z1, false], [x1, z0, x1, z1, false]] as const) {
        if (!lvlDoor) { this.wall(ax, az, bx, bz, fy, h, surface, 0.3, tag); continue; }
        if (alongX) { this.wall(ax, az, mx - d, bz, fy, h, surface, 0.3, tag); this.wall(mx + d, az, bx, bz, fy, h, surface, 0.3, tag); this.wall(mx - d, az, mx + d, bz, fy + 2.3, h - 2.3, surface, 0.3, tag); }
        else { this.wall(ax, az, bx, mz - d, fy, h, surface, 0.3, tag); this.wall(ax, mz + d, bx, bz, fy, h, surface, 0.3, tag); this.wall(ax, mz - d, bx, mz + d, fy + 2.3, h - 2.3, surface, 0.3, tag); }
      }
    }
    this.slab(x0, z0, x1, z1, top, surface, `${tag}-roof`);
    return this;
  }

  place(piece: string, x: number, y: number, z: number, yaw = 0, scale?: number): this {
    this.kit.push(scale ? { piece, pos: [x, y, z], yaw, scale } : { piece, pos: [x, y, z], yaw });
    return this;
  }

  /** Cover crate that is also collision. */
  cover(piece: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, surface: Surface = 'wood'): this {
    this.box(x - sx / 2, y, z - sz / 2, x + sx / 2, y + sy, z + sz / 2, surface, { tag: piece });
    return this.place(piece, x, y, z, yaw);
  }
}

/** Point-in-box helper used by tests/validation. */
export function inside(p: V3, b: MapBox, pad = 0): boolean {
  return p[0] > b.min[0] - pad && p[0] < b.max[0] + pad && p[1] > b.min[1] - pad && p[1] < b.max[1] + pad && p[2] > b.min[2] - pad && p[2] < b.max[2] + pad;
}

/** Height of the highest walkable top under (x,z) at or below y+0.5 (null if only the ground plane). */
export function floorUnder(layout: MapLayout, x: number, y: number, z: number): number | null {
  let best: number | null = null;
  for (const b of layout.boxes) {
    if (!b.floor) continue;
    if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
    if (b.max[1] <= y + 0.5 && (best === null || b.max[1] > best)) best = b.max[1];
  }
  return best;
}
