// Pure downed / last-stand / bleed-out rules. No three.js / DOM.
// Going down strips perks. With Lifeline Soda (solo) you self-revive after a short last stand; otherwise you
// bleed out (a teammate can revive you in co-op, which has a longer timer). Zombie hits while down shorten it.
import { WEAPONS, type WeaponId } from '../config';
import { goDown, type ZPlayer } from './rules';

export const DOWN = {
  soloBleedOut: 12,
  coopBleedOut: 30,
  selfRevive: 4.5,
  /** Seconds of bleed-out lost per zombie hit while down. */
  hitPenalty: 2.5,
  /** Health you come back with, as a fraction of max. */
  reviveHealth: 1,
  lastStandWeapon: 'pi_warden' as WeaponId,
  /** Last-stand move speed multiplier (crawl). */
  crawlSpeed: 0.32,
} as const;

export interface DownState {
  /** Seconds spent down. */
  t: number;
  bleedOut: number;
  /** Seconds until a Lifeline self-revive, or null. */
  selfRevive: number | null;
}

export type DownEvent = 'revived' | 'bledout' | null;

export function beginDown(p: ZPlayer, players = 1): DownState {
  const saved = goDown(p);
  return { t: 0, bleedOut: players > 1 ? DOWN.coopBleedOut : DOWN.soloBleedOut, selfRevive: saved ? DOWN.selfRevive : null };
}

export function stepDown(d: DownState, dt: number): DownEvent {
  d.t += dt;
  if (d.selfRevive !== null && d.t >= d.selfRevive) return 'revived';
  if (d.t >= d.bleedOut) return 'bledout';
  return null;
}

/** A zombie hit while down eats into the bleed-out timer (a self-revive still lands first if it is due). */
export function hitWhileDown(d: DownState): void {
  d.bleedOut -= DOWN.hitPenalty;
}

/** Seconds left and what the countdown means, for the HUD. */
export function downStatus(d: DownState): { label: string; left: number; frac: number } {
  if (d.selfRevive !== null) {
    const left = Math.max(0, d.selfRevive - d.t);
    return { label: 'LIFELINE · REVIVING', left, frac: 1 - left / d.selfRevive };
  }
  const left = Math.max(0, d.bleedOut - d.t);
  return { label: 'DOWN · BLEEDING OUT', left, frac: left / Math.max(1e-3, d.bleedOut) };
}

/** Last-stand sidearm: the best pistol you already carry, else the default one. */
export function lastStandPick(owned: (WeaponId | null)[]): { weapon: WeaponId; slot: number } {
  let best = -1;
  owned.forEach((id, i) => {
    if (!id || WEAPONS[id].cls !== 'pistol') return;
    if (best < 0 || WEAPONS[id].damage > WEAPONS[owned[best]!].damage) best = i;
  });
  return best >= 0 ? { weapon: owned[best]!, slot: best } : { weapon: DOWN.lastStandWeapon, slot: -1 };
}
