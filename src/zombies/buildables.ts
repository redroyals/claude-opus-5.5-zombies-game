// Pure workbench buildables and the back-mounted shield. No three.js / DOM.
// Parts are scattered across zones; the player picks each up (E) and assembles the build at the bench (E).
// A shield build hands out a shield that soaks hits (all from behind, part from the front) until it breaks;
// the bench re-issues one after SHIELD.reissue seconds.
import type { BuildableDef } from './mapdef';

export const SHIELD = {
  /** Default shield health. */
  hp: 1500,
  /** Share of a hit the shield takes when it comes from the front or the side (it is carried on the back). */
  frontShare: 0.35,
  /** Dot product of (facing, direction to the attacker) below which a hit counts as from behind. */
  behindDot: -0.2,
  /** Seconds the bench needs to make a new shield after one breaks. */
  reissue: 60,
} as const;

export interface BuildState {
  found: boolean[];
  built: boolean;
  /** Shield builds: a shield is being carried. */
  shieldOut: boolean;
  /** Seconds until the bench can hand out another shield. */
  reissueT: number;
}

export function createBuildState(def: BuildableDef): BuildState {
  return { found: def.parts.map(() => false), built: false, shieldOut: false, reissueT: 0 };
}

export type PartEvent = 'none' | 'picked' | 'all';
/** Pick up part `i`. 'all' when this was the last missing part. */
export function pickPart(st: BuildState, i: number): PartEvent {
  if (st.built || i < 0 || i >= st.found.length || st.found[i]) return 'none';
  st.found[i] = true;
  return st.found.every(Boolean) ? 'all' : 'picked';
}

export type BenchBlock = 'missing' | 'power' | 'built' | null;
/** Why the bench cannot build right now (null = it can). */
export function benchBlock(def: BuildableDef, st: BuildState, power: boolean): BenchBlock {
  if (st.built) return 'built';
  if (def.requiresPower && !power) return 'power';
  if (!st.found.every(Boolean)) return 'missing';
  return null;
}

/** Assemble at the bench. Returns true when it was built now. */
export function build(def: BuildableDef, st: BuildState, power: boolean): boolean {
  if (benchBlock(def, st, power) !== null) return false;
  st.built = true;
  return true;
}

export type ShieldBlock = 'notbuilt' | 'carrying' | 'cooldown' | 'notshield' | null;
export function shieldBlock(def: BuildableDef, st: BuildState): ShieldBlock {
  if (def.result.kind !== 'shield') return 'notshield';
  if (!st.built) return 'notbuilt';
  if (st.shieldOut) return 'carrying';
  if (st.reissueT > 0) return 'cooldown';
  return null;
}

/** Take a shield from a finished bench. Returns its hit points, or 0 if the bench cannot hand one out. */
export function takeShield(def: BuildableDef, st: BuildState): number {
  if (shieldBlock(def, st) !== null || def.result.kind !== 'shield') return 0;
  st.shieldOut = true;
  return def.result.hp ?? SHIELD.hp;
}

/** The carried shield broke (or the player lost it): the bench starts making another. */
export function shieldLost(st: BuildState): void {
  st.shieldOut = false;
  st.reissueT = SHIELD.reissue;
}

export function stepBuild(st: BuildState, dt: number): void {
  if (st.reissueT > 0) st.reissueT = Math.max(0, st.reissueT - dt);
}

export interface ShieldHit { absorbed: number; through: number; broke: boolean; hp: number }
/**
 * Split a hit between the shield and the player. `facing`/`toAttacker` are unit XZ vectors (player facing and
 * direction from the player to the attacker).
 */
export function shieldAbsorb(hp: number, dmg: number, facing: { x: number; z: number }, toAttacker: { x: number; z: number }): ShieldHit {
  if (hp <= 0) return { absorbed: 0, through: dmg, broke: false, hp: 0 };
  const dot = facing.x * toAttacker.x + facing.z * toAttacker.z;
  const share = dot < SHIELD.behindDot ? 1 : SHIELD.frontShare;
  const want = dmg * share;
  const absorbed = Math.min(hp, want);
  const left = hp - absorbed;
  return { absorbed, through: dmg - absorbed, broke: left <= 0, hp: Math.max(0, left) };
}
