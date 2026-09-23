// Pure gunplay rules: learnable per-weapon recoil patterns, ADS sway and bullet penetration.
// No three.js. Deterministic given the weapon id (plus an rng for the small jitter).
import { WEAPONS, weaponArch, type WeaponClass, type WeaponId } from '../config';
import type { Surface } from '../world/Collision';

// ---- Recoil patterns --------------------------------------------------------------------------------
const PATTERN_LEN = 30;
const patternCache = new Map<string, { yaw: number[]; pitch: number[] }>();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed: number): () => number {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * A weapon's fixed spray pattern: per-shot yaw (in units of the weapon's recoilYaw, sign = direction) and a
 * pitch multiplier. The first shots climb straight up, then the gun drifts to its own side with a slow wobble,
 * so a player can learn to pull against it.
 */
export function recoilPattern(id: string): { yaw: number[]; pitch: number[] } {
  let p = patternCache.get(id);
  if (p) return p;
  const r = mulberry(hash(id));
  const side = r() < 0.5 ? -1 : 1;
  const wobbleF = 0.35 + r() * 0.4, wobbleA = 0.6 + r() * 0.6, drift = 0.35 + r() * 0.5;
  const yaw: number[] = [], pitch: number[] = [];
  for (let i = 0; i < PATTERN_LEN; i++) {
    const settle = Math.min(1, i / 4);
    yaw.push(settle * (side * drift + Math.sin(i * wobbleF + r() * 0.3) * wobbleA));
    // Kick builds over the first few shots then eases to a steady climb.
    pitch.push(i < 3 ? 0.8 + i * 0.15 : 1.1 - Math.min(0.35, (i - 3) * 0.03));
  }
  patternCache.set(id, (p = { yaw, pitch }));
  return p;
}

export const RECOIL_JITTER = 0.15;

/** View kick (degrees) for shot `index` of a spray; ±15% random jitter on top of the fixed pattern. */
export function recoilKick(id: WeaponId, index: number, rnd: () => number = Math.random): { pitch: number; yaw: number } {
  const def = WEAPONS[id];
  const pat = recoilPattern(id);
  const i = Math.min(index, PATTERN_LEN - 1);
  const j = () => 1 + (rnd() * 2 - 1) * RECOIL_JITTER;
  return { pitch: def.recoilPitch * pat.pitch[i] * j(), yaw: def.recoilYaw * pat.yaw[i] * j() };
}

/** A spray resets once the trigger has been off for a couple of shot intervals. */
export function sprayReset(sinceShotS: number, rpm: number): boolean {
  return sinceShotS > Math.max(0.22, (60 / rpm) * 2.5);
}

// ---- ADS sway -------------------------------------------------------------------------------------------
const SWAY_AMP: Partial<Record<WeaponClass, number>> = { sniper: 0.0045, dmr: 0.0026, launcher: 0.0016, lmg: 0.0014 };

/**
 * Aim sway (radians of yaw/pitch) while aiming: a slow figure-eight scaled by class, reduced when crouched
 * and nearly removed while holding breath (which runs out).
 */
export function adsSway(cls: WeaponClass | undefined, t: number, ads: number, opts: { crouched?: boolean; holdingBreath?: boolean } = {}): { yaw: number; pitch: number } {
  const a = (SWAY_AMP[cls ?? 'ar'] ?? 0.0007) * ads * (opts.crouched ? 0.6 : 1) * (opts.holdingBreath ? 0.12 : 1);
  return { yaw: Math.sin(t * 0.9) * a, pitch: Math.sin(t * 1.8) * a * 0.55 };
}

/** Breath: seconds you can hold it and how fast it recovers. */
export const BREATH = { hold: 4, recover: 0.8 };

// ---- Penetration -----------------------------------------------------------------------------------------
/** Penetration cost per surface (per ~0.3 m of material). Concrete stops everything. */
export const PEN_COST: Record<Surface, number> = { glass: 0.1, wood: 0.3, dirt: 0.6, metal: 0.7, concrete: Infinity };
export const PEN_BUDGET: Record<WeaponClass, number> = {
  pistol: 0.3, smg: 0.4, shotgun: 0.25, ar: 0.8, dmr: 1.0, lmg: 1.2, sniper: 1.2, launcher: 0, wonder: 0,
};
/** Anything thicker than this is not a "thin surface". */
export const PEN_MAX_THICKNESS = 0.45;

/**
 * Try to push a bullet through `thickness` metres of `surface` with `budget` left. Returns the remaining
 * budget (the caller scales damage by remaining / initial) or null when it stops.
 */
export function penetrate(surface: Surface, thickness: number, budget: number): number | null {
  if (thickness > PEN_MAX_THICKNESS || budget <= 0) return null;
  const cost = PEN_COST[surface] * Math.max(0.6, thickness / 0.3);
  if (!(cost < budget)) return null;
  return budget - cost;
}

export function penBudget(id: WeaponId): number {
  const d = WEAPONS[id];
  const a = weaponArch(id);
  return d.special === 'explosive' ? 0 : PEN_BUDGET[d.cls ?? (a === 'pistol' ? 'pistol' : a === 'shotgun' ? 'shotgun' : 'ar')];
}
