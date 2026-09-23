// Pure ride logic (cable cars, ziplines, slides): availability rules and positions along a path.
// No three.js / DOM. The runtime (ZombiesMode) carries the player; the map's update hook animates the vehicle.
import type { P3, RideDef } from './mapdef';

export type RideBlock = 'power' | 'egg' | 'zone' | 'cooldown' | 'funds' | null;

export interface RideCtx { power: boolean; egg: boolean; unlocked: Set<number>; points: number; cooldown: number; eggStep?: number }

/** Why a ride cannot be taken right now (null = it can). Checks run in the order players care about. */
export function rideBlock(r: RideDef, c: RideCtx): RideBlock {
  if (r.requiresEgg && !c.egg) return 'egg';
  if (r.requiresEggStep !== undefined && !c.egg && (c.eggStep ?? 0) < r.requiresEggStep) return 'egg';
  if (r.requiresPower && !c.power) return 'power';
  if (r.requiresZones && r.requiresZones.some((z) => !c.unlocked.has(z))) return 'zone';
  if (c.cooldown > 0) return 'cooldown';
  if ((r.cost ?? 0) > c.points) return 'funds';
  return null;
}

/** Total polyline length. */
export function pathLength(path: P3[]): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z);
  return L;
}

/** Smooth start/stop (cable cars ease in and out; ziplines and slides use it too, it reads well). */
export function rideEase(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** Point at arc-length fraction u (0..1) along the path. */
export function pointAt(path: P3[], u: number, out: P3 = { x: 0, y: 0, z: 0 }): P3 {
  if (path.length === 0) return out;
  if (path.length === 1 || u <= 0) { out.x = path[0].x; out.y = path[0].y; out.z = path[0].z; return out; }
  const target = Math.min(1, u) * pathLength(path);
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (acc + seg >= target || i === path.length - 1) {
      const f = seg > 0 ? Math.min(1, (target - acc) / seg) : 1;
      out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f; out.z = a.z + (b.z - a.z) * f;
      return out;
    }
    acc += seg;
  }
  return out;
}

/** Player feet position `t` seconds into a ride. */
export function ridePosition(r: RideDef, t: number, out: P3 = { x: 0, y: 0, z: 0 }): P3 {
  return pointAt(r.path, rideEase(t / Math.max(0.01, r.seconds)), out);
}
