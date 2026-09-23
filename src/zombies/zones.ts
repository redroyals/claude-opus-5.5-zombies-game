// Pure map-topology rules for Zombies: zones gated by purchasable doors/debris, barricaded windows that
// zombies tear down and players rebuild, and the easter-egg hook. No three.js / DOM.
import { trySpend, type SpendResult, type ZPlayer } from './rules';

export interface ZoneDef { id: number; name: string }
export interface DoorDef { id: string; cost: number; a: number; b: number; label: string; debris?: boolean; requiresPower?: boolean }
export interface WindowDef { id: number; zone: number }
export interface MapTopology { zones: ZoneDef[]; doors: DoorDef[]; windows: WindowDef[]; startZone: number }

export const PLANKS = 6;
export const REPAIR_POINTS = 10;
/** Classic per-round cap on repair points (planks still get rebuilt, you just stop earning). */
export const REPAIR_POINTS_CAP_PER_ROUND = 500;
export const REPAIR_SECONDS = 0.55;
export const TEAR_SECONDS = 1.35;

export interface ZoneState {
  opened: Set<string>;
  planks: number[]; // per window
  repairEarned: number;
}

export function createZoneState(t: MapTopology): ZoneState {
  return { opened: new Set(), planks: t.windows.map(() => PLANKS), repairEarned: 0 };
}

/** Zones reachable from the start zone through opened doors. */
export function unlockedZones(t: MapTopology, s: ZoneState): Set<number> {
  const out = new Set<number>([t.startZone]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of t.doors) {
      if (!s.opened.has(d.id)) continue;
      const ha = out.has(d.a), hb = out.has(d.b);
      if (ha && !hb) { out.add(d.b); grew = true; }
      if (hb && !ha) { out.add(d.a); grew = true; }
    }
  }
  return out;
}

/** Windows whose zone is unlocked: the only places zombies may spawn from. */
export function activeWindows(t: MapTopology, s: ZoneState): WindowDef[] {
  const z = unlockedZones(t, s);
  return t.windows.filter((w) => z.has(w.zone));
}

/** A door can be bought only if one side is already reachable. */
export function canOpenDoor(t: MapTopology, s: ZoneState, id: string): boolean {
  const d = t.doors.find((x) => x.id === id);
  if (!d || s.opened.has(id)) return false;
  const z = unlockedZones(t, s);
  return z.has(d.a) || z.has(d.b);
}

export function buyDoor(t: MapTopology, s: ZoneState, p: ZPlayer, id: string, power = true): SpendResult {
  const d = t.doors.find((x) => x.id === id);
  if (!d) return { ok: false, reason: 'busy', price: 0 };
  if (s.opened.has(id)) return { ok: false, reason: 'owned', price: d.cost };
  if (d.requiresPower && !power) return { ok: false, reason: 'power', price: d.cost };
  if (!canOpenDoor(t, s, id)) return { ok: false, reason: 'busy', price: d.cost };
  const r = trySpend(p, d.cost);
  if (r.ok) s.opened.add(id);
  return r;
}

/** A zombie rips a plank off. Returns planks remaining. */
export function tearPlank(s: ZoneState, w: number): number {
  if (s.planks[w] > 0) s.planks[w]--;
  return s.planks[w];
}

/** Player rebuilds one plank. Returns the points earned (0 when full or capped). */
export function repairPlank(s: ZoneState, w: number, p: ZPlayer, mult = 1): { rebuilt: boolean; points: number } {
  if (s.planks[w] >= PLANKS) return { rebuilt: false, points: 0 };
  s.planks[w]++;
  const room = Math.max(0, REPAIR_POINTS_CAP_PER_ROUND - s.repairEarned);
  const pts = Math.min(room, REPAIR_POINTS * mult);
  s.repairEarned += pts;
  p.points += pts;
  return { rebuilt: true, points: pts };
}

export function onRoundStartZones(s: ZoneState): void {
  s.repairEarned = 0;
}

/** Carpenter: every window fully boarded. */
export function rebuildAll(s: ZoneState): void {
  for (let i = 0; i < s.planks.length; i++) s.planks[i] = PLANKS;
}

// ------------------------------------------------------------------------------------------
// Easter egg: find and activate N hidden relics in any order. Reward fires exactly once.
// ------------------------------------------------------------------------------------------
export interface EggState { found: boolean[]; rewarded: boolean }
export function createEgg(n: number): EggState { return { found: Array.from({ length: n }, () => false), rewarded: false }; }
export type EggResult = 'none' | 'progress' | 'complete';
export function activateRelic(e: EggState, i: number): EggResult {
  if (i < 0 || i >= e.found.length || e.found[i]) return 'none';
  e.found[i] = true;
  if (e.found.every(Boolean) && !e.rewarded) { e.rewarded = true; return 'complete'; }
  return 'progress';
}
