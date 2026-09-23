// Pure helpers for the perks that change how you play rather than your numbers: Packmule's third weapon,
// Hawkeye's aim snap and Nova's slide blast. No three.js / DOM.

/**
 * Packmule: a third weapon rides in a stash. Switching to the other slot swaps the stash into that slot first,
 * so repeated switches cycle through all three guns (A -> C -> B -> A ...). Returns the new slots and stash.
 */
export function muleRotate<T>(slots: [T | null, T | null], to: 0 | 1, stash: T | null): { slots: [T | null, T | null]; stash: T | null } {
  if (stash === null || slots[to] === null) return { slots, stash };
  const next: [T | null, T | null] = [...slots] as [T | null, T | null];
  const out = next[to];
  next[to] = stash;
  return { slots: next, stash: out };
}

export const AIM_ASSIST = {
  /** Heads within this angle (radians) of the view centre are snapped to when you aim down sights. */
  cone: 0.14,
  maxRange: 40,
} as const;

/** Camera yaw (0 looks down -Z) and pitch (up positive) from an eye to a point. */
export function lookAngles(eye: { x: number; y: number; z: number }, t: { x: number; y: number; z: number }): { yaw: number; pitch: number } {
  const dx = t.x - eye.x, dz = t.z - eye.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(t.y - eye.y, Math.hypot(dx, dz)) };
}

function angDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Hawkeye: the head nearest the view centre inside the assist cone (or null). */
export function aimAssistTarget(eye: { x: number; y: number; z: number }, yaw: number, pitch: number, heads: { x: number; y: number; z: number }[],
  cone: number = AIM_ASSIST.cone): { yaw: number; pitch: number } | null {
  let best: { yaw: number; pitch: number } | null = null;
  let bd = cone;
  for (const h of heads) {
    if (Math.hypot(h.x - eye.x, h.z - eye.z) > AIM_ASSIST.maxRange) continue;
    const a = lookAngles(eye, h);
    const d = Math.hypot(angDiff(a.yaw, yaw), a.pitch - pitch);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

export const NOVA = { radius: 3.8, cooldown: 2.5 } as const;
/** Nova's slide blast damage: enough to clear walkers early and dent them late. */
export function novaDamage(round: number): number {
  return 600 + 100 * Math.max(1, round);
}
