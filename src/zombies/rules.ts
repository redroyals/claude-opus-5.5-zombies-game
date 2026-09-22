// Pure round-based Zombies rules: rounds, points, wall-buys, mystery box, pack-a-punch, perks.
// No three.js / DOM. Ported (and retuned) from the UNDEAD SIEGE VR rules in sikhi.io.
// Everything here is deterministic given an rng, so the same code can run on a server (online) or locally (offline).
import type { WeaponId, ZombieType } from '../config';

// ------------------------------------------------------------------------------------------
// Rounds
// ------------------------------------------------------------------------------------------
export const MAX_ACTIVE_ZOMBIES = 24;
export const ROUND_BREAK_SECONDS = 10;

/** Total zombies in a round, scaled for co-op (1-4 players). */
export function zombieCountForRound(n: number, players = 1): number {
  const p = Math.max(1, Math.min(4, players));
  const base = n <= 5 ? 6 + (n - 1) * 3 : 18 + (n - 5) * 4;
  return Math.min(Math.round(base * (1 + (p - 1) * 0.5)), 120);
}

/** Zombie HP multiplier: +10%/round linear to r9, then compounding 1.1x (the classic curve). */
export function zombieHpMultForRound(n: number): number {
  if (n <= 9) return 1 + (n - 1) * 0.1;
  return 1.8 * Math.pow(1.1, n - 9);
}

/** Fraction of the round spawned as runners. Walkers early, mostly runners from r10. */
export function runnerFractionForRound(n: number): number {
  if (n < 3) return 0;
  return Math.min(0.85, (n - 2) * 0.1);
}

/** Armored brutes appear from round 8, capped. */
export function armoredFractionForRound(n: number): number {
  return n < 8 ? 0 : Math.min(0.2, (n - 7) * 0.025);
}

/** Every 5th round from 5 is a "hound" style special round: fewer, fast, fragile. */
export function isSpecialRound(n: number): boolean {
  return n >= 5 && n % 5 === 0;
}

/** Seconds between spawns inside a round. */
export function spawnIntervalForRound(n: number): number {
  return Math.max(0.35, 2.0 - n * 0.08);
}

export interface RoundSpec {
  round: number;
  special: boolean;
  total: number;
  hpMult: number;
  runnerFrac: number;
  armoredFrac: number;
  interval: number;
}

export function roundSpec(n: number, players = 1): RoundSpec {
  const special = isSpecialRound(n);
  return {
    round: n,
    special,
    total: special ? Math.min(6 + n, 24) * Math.max(1, Math.min(4, players)) : zombieCountForRound(n, players),
    hpMult: special ? zombieHpMultForRound(n) * 0.45 : zombieHpMultForRound(n),
    runnerFrac: special ? 1 : runnerFractionForRound(n),
    armoredFrac: special ? 0 : armoredFractionForRound(n),
    interval: special ? 0.6 : spawnIntervalForRound(n),
  };
}

export function pickZombieType(spec: RoundSpec, rnd: () => number): Exclude<ZombieType, 'elite'> {
  const r = rnd();
  if (r < spec.armoredFrac) return 'armored';
  if (r < spec.armoredFrac + spec.runnerFrac) return 'runner';
  return 'shambler';
}

export type RoundPhase = 'break' | 'active';

export interface RoundState {
  round: number;
  phase: RoundPhase;
  timer: number; // break countdown, or time to next spawn while active
  spec: RoundSpec;
  toSpawn: number;
  killed: number;
}

export function createRoundState(players = 1): RoundState {
  return { round: 0, phase: 'break', timer: 5, spec: roundSpec(1, players), toSpawn: 0, killed: 0 };
}

export interface RoundEvents { started?: number; ended?: number; spawn: number }

/** Advance the round director. `alive` = zombies currently alive. Returns how many to spawn this step. */
export function stepRounds(s: RoundState, dt: number, alive: number, players = 1): RoundEvents {
  const ev: RoundEvents = { spawn: 0 };
  if (s.phase === 'break') {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.round += 1;
      s.spec = roundSpec(s.round, players);
      s.toSpawn = s.spec.total;
      s.killed = 0;
      s.phase = 'active';
      s.timer = 1.5;
      ev.started = s.round;
    }
    return ev;
  }
  s.timer -= dt;
  while (s.timer <= 0 && s.toSpawn > 0 && alive + ev.spawn < MAX_ACTIVE_ZOMBIES) {
    ev.spawn++;
    s.toSpawn--;
    s.timer += s.spec.interval;
  }
  if (s.timer < 0) s.timer = 0;
  if (s.toSpawn === 0 && alive === 0 && ev.spawn === 0) {
    s.phase = 'break';
    s.timer = ROUND_BREAK_SECONDS;
    ev.ended = s.round;
  }
  return ev;
}

// ------------------------------------------------------------------------------------------
// Points economy
// ------------------------------------------------------------------------------------------
export const POINTS = {
  start: 500,
  hit: 10,
  kill: 60,
  headKill: 100,
  meleeKill: 130,
  roundBonusBase: 50,
  roundBonusPer: 10,
} as const;

export interface ZPlayer {
  points: number;
  perks: PerkId[];
  boxPulls: number;
}

export function createZPlayer(): ZPlayer {
  return { points: POINTS.start, perks: [], boxPulls: 0 };
}

export function awardHit(p: ZPlayer): number { p.points += POINTS.hit; return POINTS.hit; }
export function awardKill(p: ZPlayer, head: boolean, melee = false): number {
  const amt = melee ? POINTS.meleeKill : head ? POINTS.headKill : POINTS.kill;
  p.points += amt;
  return amt;
}
export function roundBonus(round: number): number { return POINTS.roundBonusBase + round * POINTS.roundBonusPer; }

export type SpendResult = { ok: true; price: number } | { ok: false; reason: 'funds' | 'owned' | 'max' | 'limit' | 'busy' | 'power'; price: number };

export function trySpend(p: ZPlayer, price: number): SpendResult {
  if (p.points < price) return { ok: false, reason: 'funds', price };
  p.points -= price;
  return { ok: true, price };
}

// ------------------------------------------------------------------------------------------
// Wall-buys
// ------------------------------------------------------------------------------------------
export interface WallBuyDef { weapon: WeaponId; price: number; ammoPrice: number; upgradedAmmoPrice: number }

export const WALL_BUYS: Record<'pistol' | 'shotgun' | 'rifle', WallBuyDef> = {
  pistol: { weapon: 'pistol', price: 500, ammoPrice: 250, upgradedAmmoPrice: 4500 },
  shotgun: { weapon: 'shotgun', price: 1500, ammoPrice: 750, upgradedAmmoPrice: 4500 },
  rifle: { weapon: 'rifle', price: 1200, ammoPrice: 600, upgradedAmmoPrice: 4500 },
};

/** What a wall-buy costs given what the player holds. `ownedTier` = null when not owned. */
export function wallBuyPrice(def: WallBuyDef, ownedTier: number | null): { action: 'weapon' | 'ammo'; price: number } {
  if (ownedTier === null) return { action: 'weapon', price: def.price };
  return { action: 'ammo', price: ownedTier > 0 ? def.upgradedAmmoPrice : def.ammoPrice };
}

// ------------------------------------------------------------------------------------------
// Mystery box ("the Cache") with teddy-bear-equivalent move ("the Moth")
// ------------------------------------------------------------------------------------------
export const BOX_PRICE = 950;
export const BOX_SPIN_SECONDS = 4;
export const BOX_OFFER_SECONDS = 12;
/** Guaranteed pulls before the box may move; chance per pull after that. */
export const BOX_SAFE_PULLS = 4;
export const BOX_MOVE_CHANCE = 0.18;

export const BOX_POOL: { weapon: WeaponId; weight: number }[] = [
  { weapon: 'shotgun', weight: 3 },
  { weapon: 'rifle', weight: 3 },
  { weapon: 'pistol', weight: 1 },
];

export interface BoxState {
  location: number; // index into the map's box spots
  pullsHere: number;
  phase: 'idle' | 'spinning' | 'offer' | 'moving';
  t: number;
  offer: WeaponId | null;
  owner: number; // player index who paid (co-op)
}

export function createBox(location = 0): BoxState {
  return { location, pullsHere: 0, phase: 'idle', t: 0, offer: null, owner: -1 };
}

export type BoxRoll = { kind: 'weapon'; weapon: WeaponId } | { kind: 'moth' };

/** Roll a box pull. Never offers a weapon the player already holds. */
export function rollBox(box: BoxState, owned: WeaponId[], rnd: () => number): BoxRoll {
  if (box.pullsHere >= BOX_SAFE_PULLS && rnd() < BOX_MOVE_CHANCE) return { kind: 'moth' };
  let pool = BOX_POOL.filter((e) => !owned.includes(e.weapon));
  if (pool.length === 0) pool = BOX_POOL; // everything owned: allow a duplicate (refills ammo)
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let r = rnd() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r < 0) return { kind: 'weapon', weapon: e.weapon };
  }
  return { kind: 'weapon', weapon: pool[pool.length - 1].weapon };
}

/** Pay and start a spin. The roll is decided up-front (server-authoritative friendly). */
export function pullBox(box: BoxState, p: ZPlayer, owned: WeaponId[], rnd: () => number, playerIndex = 0): SpendResult & { roll?: BoxRoll } {
  if (box.phase !== 'idle') return { ok: false, reason: 'busy', price: BOX_PRICE };
  const s = trySpend(p, BOX_PRICE);
  if (!s.ok) return s;
  p.boxPulls++;
  const roll = rollBox(box, owned, rnd);
  box.pullsHere++;
  box.phase = 'spinning';
  box.t = 0;
  box.owner = playerIndex;
  box.offer = roll.kind === 'weapon' ? roll.weapon : null;
  if (roll.kind === 'moth') p.points += BOX_PRICE; // the moth refunds the pull
  return { ...s, roll };
}

export type BoxEvent = 'offer' | 'moth' | 'expired' | 'arrived' | null;

/** Advance the box. On 'moth' the box goes to 'moving' then arrives at `nextLocation(rnd)`. */
export function stepBox(box: BoxState, dt: number, spotCount: number, rnd: () => number): BoxEvent {
  if (box.phase === 'idle') return null;
  box.t += dt;
  if (box.phase === 'spinning' && box.t >= BOX_SPIN_SECONDS) {
    box.t = 0;
    if (box.offer) { box.phase = 'offer'; return 'offer'; }
    box.phase = 'moving';
    return 'moth';
  }
  if (box.phase === 'offer' && box.t >= BOX_OFFER_SECONDS) {
    box.phase = 'idle'; box.offer = null; box.t = 0;
    return 'expired';
  }
  if (box.phase === 'moving' && box.t >= 3) {
    box.location = pickNewBoxLocation(box.location, spotCount, rnd);
    box.pullsHere = 0; box.phase = 'idle'; box.t = 0; box.offer = null;
    return 'arrived';
  }
  return null;
}

export function pickNewBoxLocation(current: number, spotCount: number, rnd: () => number): number {
  if (spotCount <= 1) return current;
  const k = Math.floor(rnd() * (spotCount - 1));
  return k >= current ? k + 1 : k;
}

/** Take the offered weapon (only the payer, only once revealed). */
export function takeBoxOffer(box: BoxState, playerIndex = 0): WeaponId | null {
  if (box.phase !== 'offer' || !box.offer || box.owner !== playerIndex) return null;
  const w = box.offer;
  box.phase = 'idle'; box.offer = null; box.t = 0;
  return w;
}

// ------------------------------------------------------------------------------------------
// Pack-a-Punch ("the Reforger")
// ------------------------------------------------------------------------------------------
export const PAP_PRICE = 5000;
export const PAP_REPACK_PRICE = 2500;
export const PAP_SECONDS = 3.5;

export function papPrice(tier: number, maxTier: number): number | null {
  if (tier >= maxTier) return null;
  return tier === 0 ? PAP_PRICE : PAP_REPACK_PRICE;
}

export function tryPap(p: ZPlayer, tier: number, maxTier: number, powerOn: boolean): SpendResult {
  if (!powerOn) return { ok: false, reason: 'power', price: PAP_PRICE };
  const price = papPrice(tier, maxTier);
  if (price === null) return { ok: false, reason: 'max', price: 0 };
  return trySpend(p, price);
}

// ------------------------------------------------------------------------------------------
// Perks (original names)
// ------------------------------------------------------------------------------------------
export type PerkId = 'bulwark' | 'quickhands' | 'hammerfall' | 'lifeline';

export interface PerkMods {
  maxHealthMult: number;
  reloadMult: number;
  rpmMult: number;
  damageMult: number;
  selfRevives: number;
  regenDelayMult: number;
}

export const BASE_MODS: PerkMods = { maxHealthMult: 1, reloadMult: 1, rpmMult: 1, damageMult: 1, selfRevives: 0, regenDelayMult: 1 };

export interface PerkDef { id: PerkId; name: string; price: number; desc: string; color: number; needsPower: boolean; apply(m: PerkMods): PerkMods }

export const PERKS: Record<PerkId, PerkDef> = {
  bulwark: { id: 'bulwark', name: 'BULWARK BREW', price: 2500, desc: 'Max health x2.5', color: 0xd03030, needsPower: true,
    apply: (m) => ({ ...m, maxHealthMult: 2.5 }) },
  quickhands: { id: 'quickhands', name: 'QUICKHANDS FIZZ', price: 3000, desc: 'Reload 2x faster', color: 0x30c050, needsPower: true,
    apply: (m) => ({ ...m, reloadMult: 0.5 }) },
  hammerfall: { id: 'hammerfall', name: 'HAMMERFALL ROOT', price: 2000, desc: 'Fire rate +33%, damage +20%', color: 0xe0a020, needsPower: true,
    apply: (m) => ({ ...m, rpmMult: 1.33, damageMult: 1.2 }) },
  lifeline: { id: 'lifeline', name: 'LIFELINE SODA', price: 500, desc: 'Solo: self-revive (3 uses) · faster regen', color: 0x3080e0, needsPower: false,
    apply: (m) => ({ ...m, selfRevives: m.selfRevives + 1, regenDelayMult: 0.5 }) },
};

export const PERK_LIMIT = 4;
export const LIFELINE_SOLO_MAX_BUYS = 3;

export function perkMods(perks: PerkId[]): PerkMods {
  return perks.reduce((m, id) => PERKS[id].apply(m), { ...BASE_MODS });
}

export function tryBuyPerk(p: ZPlayer, id: PerkId, powerOn: boolean, lifelineBuys = 0): SpendResult {
  const def = PERKS[id];
  if (p.perks.includes(id)) return { ok: false, reason: 'owned', price: def.price };
  if (p.perks.length >= PERK_LIMIT) return { ok: false, reason: 'limit', price: def.price };
  if (def.needsPower && !powerOn) return { ok: false, reason: 'power', price: def.price };
  if (id === 'lifeline' && lifelineBuys >= LIFELINE_SOLO_MAX_BUYS) return { ok: false, reason: 'max', price: def.price };
  const s = trySpend(p, def.price);
  if (s.ok) p.perks.push(id);
  return s;
}

/** On going down: lose all perks. Returns true if a self-revive (Lifeline) saved the player. */
export function goDown(p: ZPlayer): boolean {
  const saved = p.perks.includes('lifeline');
  p.perks = [];
  return saved;
}

// ------------------------------------------------------------------------------------------
// Doors / power
// ------------------------------------------------------------------------------------------
export const POWER_PRICE = 0; // the switch is free; getting to it costs doors
export function tryOpenDoor(p: ZPlayer, price: number, opened: boolean): SpendResult {
  if (opened) return { ok: false, reason: 'owned', price };
  return trySpend(p, price);
}
