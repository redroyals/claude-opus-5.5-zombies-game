// Pure horde steering helpers: lanes, surround slots and window queues so a crowd spreads out instead of
// collapsing into one conga line down the flow field. No three.js.

/** Per-zombie lane bias (radians), stable for its lifetime: roughly ±26 degrees. */
export function laneAngle(seed: number): number {
  const f = Math.abs(Math.sin(seed * 91.7)) % 1;
  return (f * 2 - 1) * 0.45;
}

/**
 * Bias a flow direction sideways by the zombie's lane angle. Full effect far from the target, none within
 * 3 m (close in, zombies go straight for you). `open(dx, dz)` reports whether the biased direction is walkable;
 * when it is not, the unbiased flow is returned.
 */
export function steerLane(fx: number, fz: number, angle: number, dist: number, open: (dx: number, dz: number) => boolean): { x: number; z: number } {
  const w = Math.max(0, Math.min(1, (dist - 3) / 6));
  if (w <= 0 || angle === 0) return { x: fx, z: fz };
  const a = angle * w, c = Math.cos(a), s = Math.sin(a);
  const x = fx * c - fz * s, z = fx * s + fz * c;
  return open(x, z) ? { x, z } : { x: fx, z: fz };
}

/**
 * Surround slot: a point on a ring around the player, at the zombie's own bearing nudged by its lane, so
 * attackers fan out around you rather than stacking on one side.
 */
export function surroundSlot(px: number, pz: number, zx: number, zz: number, angle: number, ring: number): { x: number; z: number } {
  const bearing = Math.atan2(zx - px, zz - pz) + angle * 0.8;
  return { x: px + Math.sin(bearing) * ring, z: pz + Math.cos(bearing) * ring };
}

/** Where the n-th zombie in a window queue waits (0 = at the window). Queues step back along the outward normal. */
export function windowQueueSpot(outX: number, outZ: number, nx: number, nz: number, index: number): { x: number; z: number } {
  const back = index * 0.85, side = index === 0 ? 0 : (index % 2 ? 0.45 : -0.45);
  return { x: outX + nx * back - nz * side, z: outZ + nz * back + nx * side };
}

/** A zombie at the barricade swipes through the opening when the player is this close to the inside point. */
export const WINDOW_REACH = 1.7;
export function canAttackThroughWindow(px: number, py: number, pz: number, insideX: number, insideZ: number, floor: number): boolean {
  return Math.hypot(px - insideX, pz - insideZ) < WINDOW_REACH && Math.abs(py - floor) < 1.2;
}
