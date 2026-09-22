// Pure round-based Zombies rules: rounds, points, wall-buys, mystery box, pack-a-punch, perks.
// No three.js / DOM. Ported (and retuned) from the UNDEAD SIEGE VR rules in sikhi.io.
// Everything here is deterministic given an rng, so the same code can run on a server (online) or locally (offline).
import type { WeaponId } from '../config';

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

/** Armored brutes appear from round 6, capped. */
export function armoredFractionForRound(n: number): number {
  return n < 6 ? 0 : Math.min(0.18, (n - 5) * 0.02);
}

/** Crawlers (spawned legless) trickle in from round 4. More are made mid-fight by leg damage. */
export function crawlerFractionForRound(n: number): number {
  return n < 4 ? 0 : Math.min(0.08, (n - 3) * 0.01);
}

/** A boss ("the Warden") joins every 8th round (8, 16, 24 ...). Not on special rounds. */
export const BOSS_ROUND_EVERY = 8;
export function isBossRound(n: number): boolean {
  return n >= BOSS_ROUND_EVERY && n % BOSS_ROUND_EVERY === 0 && !isSpecialRound(n);
}
/** Boss HP scales with the round; brutal but finite. */
export function bossHpForRound(n: number): number {
  return 4000 + n * 350;
}

/** Every 5th round from 5 is a "hound" style special round: fewer, fast, fragile ("the Scuttlers"). */
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
  crawlerFrac: number;
  boss: boolean;
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
    crawlerFrac: special ? 0 : crawlerFractionForRound(n),
    boss: isBossRound(n),
    interval: special ? 0.6 : spawnIntervalForRound(n),
  };
}

export type ZRoundType = 'shambler' | 'runner' | 'brute' | 'crawler' | 'fast';

/** Type for one regular spawn in the round. Special rounds are all 'fast'. The boss is spawned separately. */
export function pickZombieType(spec: RoundSpec, rnd: () => number): ZRoundType {
  if (spec.special) return 'fast';
  const r = rnd();
  if (r < spec.armoredFrac) return 'brute';
  if (r < spec.armoredFrac + spec.crawlerFrac) return 'crawler';
  if (r < spec.armoredFrac + spec.crawlerFrac + spec.runnerFrac) return 'runner';
  return 'shambler';
}

/** Chance that a heavy leg hit turns a walker into a crawler instead of killing/staggering it. */
export function crawlerFromLegHit(type: string, legDamage: number, maxHp: number, rnd: () => number): boolean {
  if (type !== 'shambler' && type !== 'runner') return false;
  if (legDamage < maxHp * 0.35) return false;
  return rnd() < 0.3;
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

export interface RoundEvents { started?: number; ended?: number; spawn: number; boss?: boolean }

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
      if (s.spec.boss) ev.boss = true;
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

/** Classic wall-buys (chalk outlines). Ammo is half price; reforged ammo is flat 4500. Box-only guns are never here. */
function wb(weapon: WeaponId, price: number): WallBuyDef { return { weapon, price, ammoPrice: Math.round(price / 2), upgradedAmmoPrice: 4500 }; }
export const WALL_BUYS = {
  pi_warden: wb('pi_warden', 500),
  smg_wren: wb('smg_wren', 1000),
  ar_kestrel: wb('ar_kestrel', 1200),
  sg_hullbreaker: wb('sg_hullbreaker', 1500),
  smg_skiff: wb('smg_skiff', 1300),
  ar_corvid: wb('ar_corvid', 1400),
  dmr_sentry: wb('dmr_sentry', 1600),
  pi_magnus: wb('pi_magnus', 900),
} satisfies Record<string, WallBuyDef>;
export type WallBuyKey = keyof typeof WALL_BUYS;

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
/** Moth departure: box rises, hovers, vanishes, then lands elsewhere. */
export const BOX_MOVE_SECONDS = 5;

export interface BoxEntry { weapon: WeaponId; weight: number }
/** The Cache pool. Wonder weapons are rare and box-only; wall weapons are excluded (BO rule of thumb). */
export const BOX_POOL: BoxEntry[] = [
  { weapon: 'ar_moraine', weight: 4 }, { weapon: 'ar_tern', weight: 4 }, { weapon: 'smg_fennec', weight: 4 },
  { weapon: 'sg_tidal', weight: 4 }, { weapon: 'lmg_bastion', weight: 3 }, { weapon: 'sr_longwatch', weight: 3 },
  { weapon: 'pi_basalt', weight: 3 }, { weapon: 'ln_lotus', weight: 3 }, { weapon: 'ar_kestrel', weight: 2 },
  { weapon: 'ww_arc', weight: 1 }, { weapon: 'ww_singularity', weight: 1 }, { weapon: 'ww_cryo', weight: 1 },
];
export const WONDER_WEAPONS: WeaponId[] = ['ww_arc', 'ww_singularity', 'ww_cryo'];
export function isBoxOnly(id: WeaponId): boolean {
  return BOX_POOL.some((e) => e.weapon === id) && !Object.values(WALL_BUYS).some((w) => w.weapon === id);
}

/** Weapons shown flicking past during the spin: a deterministic reel from the pool (never the final twice in a row). */
export function boxReel(rnd: () => number, count: number, pool: BoxEntry[] = BOX_POOL): WeaponId[] {
  const out: WeaponId[] = [];
  for (let i = 0; i < count; i++) {
    let w = pool[Math.floor(rnd() * pool.length)].weapon;
    if (out.length && out[out.length - 1] === w) w = pool[(pool.findIndex((e) => e.weapon === w) + 1) % pool.length].weapon;
    out.push(w);
  }
  return out;
}

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
export function rollBox(box: BoxState, owned: WeaponId[], rnd: () => number, basePool: BoxEntry[] = BOX_POOL, spotCount = 2): BoxRoll {
  if (spotCount > 1 && box.pullsHere >= BOX_SAFE_PULLS && rnd() < BOX_MOVE_CHANCE) return { kind: 'moth' };
  // Only one wonder weapon at a time (the classic limit).
  const holdsWonder = owned.some((w) => WONDER_WEAPONS.includes(w));
  let pool = basePool.filter((e) => !owned.includes(e.weapon) && !(holdsWonder && WONDER_WEAPONS.includes(e.weapon)));
  if (pool.length === 0) pool = basePool; // everything owned: allow a duplicate (refills ammo)
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let r = rnd() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r < 0) return { kind: 'weapon', weapon: e.weapon };
  }
  return { kind: 'weapon', weapon: pool[pool.length - 1].weapon };
}

/** Pay and start a spin. The roll is decided up-front (server-authoritative friendly). */
export function pullBox(box: BoxState, p: ZPlayer, owned: WeaponId[], rnd: () => number, playerIndex = 0, spotCount = 2): SpendResult & { roll?: BoxRoll } {
  if (box.phase !== 'idle') return { ok: false, reason: 'busy', price: BOX_PRICE };
  const s = trySpend(p, BOX_PRICE);
  if (!s.ok) return s;
  p.boxPulls++;
  const roll = rollBox(box, owned, rnd, BOX_POOL, spotCount);
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
  if (box.phase === 'moving' && box.t >= BOX_MOVE_SECONDS) {
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

/** Reforged names (original). Tier 2 ("repack") appends a mark. */
export const PAP_NAMES: Partial<Record<WeaponId, string>> = {
  ar_kestrel: 'SKYRENDER', ar_corvid: 'MURDER OF CROWS', ar_moraine: 'GLACIAL TILL', ar_tern: 'ARCTIC TERNADO',
  smg_wren: 'WRENCH OF RUIN', smg_fennec: 'DESERT GHOST', smg_skiff: 'DREADNOUGHT', sg_hullbreaker: 'KEELHAULER',
  sg_tidal: 'RIPTIDE', lmg_bastion: 'CITADEL', dmr_sentry: 'OVERWATCH', sr_longwatch: 'NEVERSLEEP',
  pi_warden: 'JAILER\'S MERCY', pi_basalt: 'OBSIDIAN OATH', pi_magnus: 'MAGNUS OPUS', ln_lotus: 'BLOOMING HELL',
  ww_arc: 'STORMBRINGER', ww_singularity: 'EVENT HORIZON', ww_cryo: 'ABSOLUTE ZERO',
  rifle: 'SKYRENDER', pistol: 'JAILER\'S MERCY', shotgun: 'KEELHAULER',
};

/** Display name of a weapon at a Reforger tier. */
export function papName(id: WeaponId, baseName: string, tier: number): string {
  if (tier <= 0) return baseName;
  const n = PAP_NAMES[id] ?? `${baseName} REFORGED`;
  return tier >= 2 ? `${n} II` : n;
}

/** Wonder weapons get special reforge bonuses on top of the normal tier multipliers. */
export interface WonderBonus { chains: number; radius: number; freeze: number }
export function wonderBonus(id: WeaponId, tier: number): WonderBonus {
  const t = Math.max(0, tier);
  switch (id) {
    case 'ww_arc': return { chains: 5 + t * 4, radius: 7 + t * 2, freeze: 0 };
    case 'ww_singularity': return { chains: 0, radius: 6 + t * 2.5, freeze: 0 };
    case 'ww_cryo': return { chains: 0, radius: 2.5 + t, freeze: 2.5 + t * 1.5 };
    default: return { chains: 0, radius: 0, freeze: 0 };
  }
}

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
