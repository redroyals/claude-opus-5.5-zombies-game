// Pure pacing rules for when the Cache (mystery box) first surfaces. No three.js / DOM.
// The Cache is hidden at the start of a map that declares `box.reveal`; it surfaces the moment ANY of the
// reveal conditions holds (doors opened, a zone unlocked, a round reached, the power on).
import type { BoxRevealDef } from './mapdef';

export interface RevealCtx {
  /** Doors/debris opened so far. */
  doorsOpened: number;
  unlocked: Set<number>;
  /** Current round (0 before round 1 starts). */
  round: number;
  power: boolean;
}

/** True when a hidden Cache should surface now. A map without `reveal` never hides it. */
export function revealDue(r: BoxRevealDef | undefined, c: RevealCtx): boolean {
  if (!r) return true;
  if (r.doors !== undefined && c.doorsOpened >= r.doors) return true;
  if (r.zones?.some((z) => c.unlocked.has(z))) return true;
  if (r.round !== undefined && c.round >= r.round) return true;
  if (r.power && c.power) return true;
  return false;
}

/**
 * Where the Cache first lands: the designated spot when its zone is open, else the first spot (list order) in an
 * unlocked zone other than the start zone, else the designated spot anyway (the toast names the zone to reach).
 */
export function pickRevealSpot(r: BoxRevealDef | undefined, spotZones: number[], startZone: number, unlocked: Set<number>, fallback = 0): number {
  const want = r?.spot ?? fallback;
  if (unlocked.has(spotZones[want])) return want;
  const open = spotZones.findIndex((z) => z !== startZone && unlocked.has(z));
  return open >= 0 ? open : want;
}
