// Pure trap rules (electric fences, fire pits). No three.js / DOM.
// Pay at the switch; the area kills for `seconds`, then the trap cools down before it can be bought again.
import type { TrapDef } from './mapdef';
import { trySpend, type SpendResult, type ZPlayer } from './rules';

export const TRAP_DEFAULTS = { cost: 1000, seconds: 20, cooldown: 45 } as const;
/** Damage per second to the player standing in a live trap, and the share of max health elites lose per second. */
export const TRAP_PLAYER_DPS = 35;
export const TRAP_ELITE_FRAC = 0.08;

export interface TrapState { phase: 'ready' | 'active' | 'cooldown'; t: number; uses: number; kills: number }

export function createTrapState(): TrapState {
  return { phase: 'ready', t: 0, uses: 0, kills: 0 };
}

export type TrapBlock = 'power' | 'build' | 'active' | 'cooldown' | null;
export function trapBlock(def: TrapDef, st: TrapState, power: boolean, built: boolean): TrapBlock {
  if (def.requiresPower && !power) return 'power';
  if (def.requiresBuild && !built) return 'build';
  if (st.phase === 'active') return 'active';
  if (st.phase === 'cooldown') return 'cooldown';
  return null;
}

/** Pay and switch the trap on. */
export function activateTrap(def: TrapDef, st: TrapState, p: ZPlayer, power: boolean, built: boolean): SpendResult {
  const price = def.cost ?? TRAP_DEFAULTS.cost;
  const b = trapBlock(def, st, power, built);
  if (b === 'power') return { ok: false, reason: 'power', price };
  if (b) return { ok: false, reason: 'busy', price };
  const s = trySpend(p, price);
  if (!s.ok) return s;
  st.phase = 'active';
  st.t = def.seconds ?? TRAP_DEFAULTS.seconds;
  st.uses++;
  return s;
}

/** Advance the trap. Returns 'off' when it stops killing, 'ready' when it can be bought again. */
export function stepTrap(def: TrapDef, st: TrapState, dt: number): 'off' | 'ready' | null {
  if (st.phase === 'ready') return null;
  st.t -= dt;
  if (st.t > 0) return null;
  if (st.phase === 'active') { st.phase = 'cooldown'; st.t = def.cooldown ?? TRAP_DEFAULTS.cooldown; return 'off'; }
  st.phase = 'ready'; st.t = 0;
  return 'ready';
}

/** Is a point (feet position) inside the trap's killing floor? */
export function inTrap(def: TrapDef, x: number, y: number, z: number): boolean {
  const a = def.area;
  return x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1 && y >= a.y - 1.5 && y <= a.y + 2.6;
}
