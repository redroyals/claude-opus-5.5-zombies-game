// Data-driven unlock table: what unlocks at which player level (1..100). Pure.
import { WEAPON_LIST } from '../data/weapons';
import { COSMETICS } from '../data/cosmetics';

export type UnlockKind = 'weapon' | 'lethal' | 'tactical' | 'streak' | 'cosmetic' | 'feature';
export interface UnlockEntry { kind: UnlockKind; id: string; level: number }

export interface UnlockState {
  level: number;
  prestige: number;
  /** Items unlocked early with unlock tokens ("kind:id"). */
  tokenUnlocks?: string[];
}

// Equipment/streak unlock levels live next to their definitions; duplicated here as a literal table to
// avoid an import cycle with loadout.ts (tests assert they agree).
export const EQUIP_UNLOCKS: UnlockEntry[] = [
  { kind: 'lethal', id: 'frag', level: 1 }, { kind: 'lethal', id: 'semtex', level: 8 }, { kind: 'lethal', id: 'hatchet', level: 16 }, { kind: 'lethal', id: 'claymore', level: 28 },
  { kind: 'tactical', id: 'flash', level: 1 }, { kind: 'tactical', id: 'smoke', level: 4 }, { kind: 'tactical', id: 'stun', level: 12 }, { kind: 'tactical', id: 'decoy', level: 33 },
  { kind: 'streak', id: 'scout', level: 1 }, { kind: 'streak', id: 'supply', level: 6 }, { kind: 'streak', id: 'mortar', level: 1 }, { kind: 'streak', id: 'counter', level: 18 },
  { kind: 'streak', id: 'gunship', level: 1 }, { kind: 'streak', id: 'dogs', level: 42 }, { kind: 'streak', id: 'emp', level: 60 },
  { kind: 'feature', id: 'create_a_class', level: 3 }, { kind: 'feature', id: 'gunsmith', level: 5 }, { kind: 'feature', id: 'ranked_play', level: 25 },
];

export const UNLOCK_TABLE: UnlockEntry[] = [
  ...WEAPON_LIST.map((w) => ({ kind: 'weapon' as const, id: w.id, level: w.unlockLevel })),
  ...EQUIP_UNLOCKS,
  ...COSMETICS.filter((c) => c.unlockLevel !== undefined).map((c) => ({ kind: 'cosmetic' as const, id: c.id, level: c.unlockLevel! })),
].sort((a, b) => a.level - b.level);

const LEVEL_OF = new Map(UNLOCK_TABLE.map((e) => [`${e.kind}:${e.id}`, e.level]));

export function unlockLevel(kind: UnlockKind, id: string): number | undefined { return LEVEL_OF.get(`${kind}:${id}`); }

/** Prestiged players keep every level-gated unlock (modern prestige rules). */
export function isUnlocked(s: UnlockState, kind: UnlockKind, id: string): boolean {
  const lvl = LEVEL_OF.get(`${kind}:${id}`);
  if (lvl === undefined) return false;
  if (s.prestige > 0 || s.level >= lvl) return true;
  return s.tokenUnlocks?.includes(`${kind}:${id}`) ?? false;
}

export function unlocksAtLevel(level: number): UnlockEntry[] { return UNLOCK_TABLE.filter((e) => e.level === level); }
