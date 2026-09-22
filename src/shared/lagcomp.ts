// Server-side lag compensation: per-player position history + rewound hitbox tests. Pure.
import { MOVE } from './movement';

export interface HistSample { tick: number; x: number; y: number; z: number; h: number; alive: boolean }

/** Ring buffer of past positions for one entity. */
export class History {
  private buf: HistSample[] = [];
  constructor(private cap = 32) {}
  push(s: HistSample) { this.buf.push(s); if (this.buf.length > this.cap) this.buf.shift(); }
  clear() { this.buf.length = 0; }
  get latest(): HistSample | undefined { return this.buf[this.buf.length - 1]; }
  /** Interpolated sample at fractional tick `t` (clamped to the stored range). */
  at(t: number): HistSample | undefined {
    const b = this.buf;
    if (!b.length) return undefined;
    if (t <= b[0].tick) return b[0];
    if (t >= b[b.length - 1].tick) return b[b.length - 1];
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (t >= a.tick && t <= c.tick) {
        const k = c.tick === a.tick ? 0 : (t - a.tick) / (c.tick - a.tick);
        return { tick: t, x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k, h: a.h + (c.h - a.h) * k, alive: a.alive && c.alive };
      }
    }
    return b[b.length - 1];
  }
}

/** Max rewind the server will honour (anti-abuse). ~250 ms at 30 Hz. */
export const MAX_REWIND_TICKS = 8;

export function clampRewind(serverTick: number, viewTick: number): number {
  return Math.max(serverTick - MAX_REWIND_TICKS, Math.min(serverTick, viewTick));
}

export type Zone = 'head' | 'body' | 'limb';

/** Ray vs player hitboxes (head sphere, body capsule, legs capsule). Returns distance+zone or null. */
export function rayPlayer(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, p: { x: number; y: number; z: number; h: number }): { t: number; zone: Zone } | null {
  const headR = 0.16, bodyR = MOVE.radius + 0.05;
  const headY = p.y + p.h - 0.14;
  let best: { t: number; zone: Zone } | null = null;
  const th = raySphere(ox, oy, oz, dx, dy, dz, p.x, headY, p.z, headR);
  if (th >= 0) best = { t: th, zone: 'head' };
  const tb = rayCapsule(ox, oy, oz, dx, dy, dz, p.x, p.y + p.h * 0.45, p.z, p.x, headY - headR - 0.02, p.z, bodyR);
  if (tb >= 0 && (!best || tb < best.t)) best = { t: tb, zone: 'body' };
  const tl = rayCapsule(ox, oy, oz, dx, dy, dz, p.x, p.y + 0.1, p.z, p.x, p.y + p.h * 0.45, p.z, bodyR * 0.8);
  if (tl >= 0 && (!best || tl < best.t)) best = { t: tl, zone: 'limb' };
  return best;
}

export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = -b - s;
  if (t >= 0) return t;
  return -b + s >= 0 ? 0 : -1;
}

/** Ray vs capsule by sampling the closest point on the segment (robust enough for hit tests). */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): number {
  // Closest approach between ray and segment.
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = ox - ax, wy = oy - ay, wz = oz - az;
  const a = ux * ux + uy * uy + uz * uz, b = ux * dx + uy * dy + uz * dz, c = 1;
  const d = ux * wx + uy * wy + uz * wz, e = dx * wx + dy * wy + dz * wz;
  const den = a * c - b * b;
  let s = den > 1e-9 ? (c * d - b * e) / den : 0; // w = o - a
  s = Math.max(0, Math.min(1, s));
  const px = ax + ux * s, py = ay + uy * s, pz = az + uz * s;
  return raySphere(ox, oy, oz, dx, dy, dz, px, py, pz, r);
}
