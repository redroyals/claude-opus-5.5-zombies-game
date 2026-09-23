// Pure round-based Zombies rules: rounds, points, wall-buys, mystery box, pack-a-punch, perks.
// No three.js / DOM. Ported (and retuned) from the UNDEAD SIEGE VR rules in sikhi.io.
// Everything here is deterministic given an rng, so the same code can run on a server (online) or locally (offline).
import type { WeaponId } from '../config';

// ------------------------------------------------------------------------------------------
// Rounds
// ------------------------------------------------------------------------------------------
export const MAX_ACTIVE_ZOMBIES = 24;
export const ROUND_BREAK_SECONDS = 10;

/** Solo zombie counts for rounds 1-5, straight from the classic table (6, 8, 13, 18, 24). */
export const EARLY_ROUND_COUNTS = [6, 8, 13, 18, 24] as const;

/** Total zombies in a round, scaled for co-op (1-4 players). */
export function zombieCountForRound(n: number, players = 1): number {
  const p = Math.max(1, Math.min(4, players));
  const base = n <= 5 ? EARLY_ROUND_COUNTS[Math.max(1, n) - 1] : 24 + (n - 5) * 4;
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

// ------------------------------------------------------------------------------------------
// Round schedule: when the special (Scuttler) rounds, the Warden and the blackouts come. A map may
// set its own cadence (MapDef.rounds); like the classic hound rounds the specials land a little
// unpredictably: the first in [first[0], first[1]], then every [every[0], every[1]] rounds.
// ------------------------------------------------------------------------------------------
export interface RoundScheduleDef {
  /** Special-round cadence (null = no special rounds on this map). */
  special?: { first: [number, number]; every: [number, number] } | null;
  /** A Warden joins every Nth round (default 8). */
  bossEvery?: number;
  /** First blackout round and the gap between them (default 13, every 10). */
  blackoutFirst?: number;
  blackoutEvery?: number;
}
export interface RoundSchedule { specials: number[]; bossEvery: number; blackoutFirst: number; blackoutEvery: number }

/** Plan the schedule once per game (deterministic given `rnd`). Specials are listed up to `horizon`. */
export function makeSchedule(def: RoundScheduleDef = {}, rnd: () => number = Math.random, horizon = 300): RoundSchedule {
  const sp = def.special === undefined ? { first: [5, 5] as [number, number], every: [5, 5] as [number, number] } : def.special;
  const pick = ([a, b]: [number, number]) => a + Math.floor(rnd() * (Math.max(a, b) - a + 1));
  const specials: number[] = [];
  if (sp) for (let n = Math.max(2, pick(sp.first)); n <= horizon; n += Math.max(2, pick(sp.every))) specials.push(n);
  return { specials, bossEvery: def.bossEvery ?? 8, blackoutFirst: def.blackoutFirst ?? 13, blackoutEvery: def.blackoutEvery ?? 10 };
}
/** The classic fixed cadence: specials every 5th round from 5, Warden every 8th, blackouts 13, 23, 33 ... */
export const DEFAULT_SCHEDULE: RoundSchedule = makeSchedule();

/** A boss ("the Warden") joins every 8th round (8, 16, 24 ...) by default. Not on special rounds. */
export const BOSS_ROUND_EVERY = 8;
export function isBossRound(n: number, sched: RoundSchedule = DEFAULT_SCHEDULE): boolean {
  return n >= sched.bossEvery && n % sched.bossEvery === 0 && !isSpecialRound(n, sched) && !isBlackoutRound(n, sched);
}
/** Boss HP scales with the round; brutal but finite. */
export function bossHpForRound(n: number): number {
  return 4000 + n * 350;
}

/** A "hound" style special round: fewer, fast, fragile ("the Scuttlers"). Every 5th from 5 by default. */
export function isSpecialRound(n: number, sched: RoundSchedule = DEFAULT_SCHEDULE): boolean {
  return sched.specials.includes(n);
}

/** Sprinters: a share of the runners go flat out from round 10 (speed x1.3). */
export function sprinterFractionForRound(n: number): number {
  return n < 10 ? 0 : Math.min(0.6, 0.12 + (n - 10) * 0.05);
}
export const SPRINTER_SPEED_MULT = 1.3;

/**
 * Blackout rounds (13, 23, 33 ...): the lights die, the fog rolls in and every zombie runs. Weaker than a
 * normal round per zombie; ends with a Max Ammo like the Scuttler rounds.
 */
export function isBlackoutRound(n: number, sched: RoundSchedule = DEFAULT_SCHEDULE): boolean {
  return n >= sched.blackoutFirst && (n - sched.blackoutFirst) % sched.blackoutEvery === 0 && !isSpecialRound(n, sched);
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
  /** Share of runners that sprint. */
  sprinterFrac: number;
  /** Lights-out round. */
  blackout: boolean;
}

export function roundSpec(n: number, players = 1, sched: RoundSchedule = DEFAULT_SCHEDULE): RoundSpec {
  const special = isSpecialRound(n, sched);
  const blackout = isBlackoutRound(n, sched);
  return {
    round: n,
    special,
    total: special ? Math.min(6 + n, 24) * Math.max(1, Math.min(4, players)) : zombieCountForRound(n, players),
    hpMult: special ? zombieHpMultForRound(n) * 0.45 : blackout ? zombieHpMultForRound(n) * 0.8 : zombieHpMultForRound(n),
    runnerFrac: special || blackout ? 1 : runnerFractionForRound(n),
    armoredFrac: special || blackout ? 0 : armoredFractionForRound(n),
    crawlerFrac: special || blackout ? 0 : crawlerFractionForRound(n),
    boss: isBossRound(n, sched),
    interval: special ? 0.6 : spawnIntervalForRound(n),
    sprinterFrac: special ? 0 : blackout ? Math.max(0.35, sprinterFractionForRound(n)) : sprinterFractionForRound(n),
    blackout,
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
  /** When the special rounds, bosses and blackouts fall (planned once per game). */
  sched: RoundSchedule;
}

export function createRoundState(players = 1, sched: RoundSchedule = DEFAULT_SCHEDULE): RoundState {
  return { round: 0, phase: 'break', timer: 5, spec: roundSpec(1, players, sched), toSpawn: 0, killed: 0, sched };
}

export interface RoundEvents { started?: number; ended?: number; spawn: number; boss?: boolean }

/** Advance the round director. `alive` = zombies currently alive. Returns how many to spawn this step. */
export function stepRounds(s: RoundState, dt: number, alive: number, players = 1): RoundEvents {
  const ev: RoundEvents = { spawn: 0 };
  if (s.phase === 'break') {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.round += 1;
      s.spec = roundSpec(s.round, players, s.sched);
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
  /** A kill made by a trap (the trap paid for itself; you get a little for the lure). */
  trapKill: 50,
  roundBonusBase: 50,
  roundBonusPer: 10,
} as const;

export interface ZPlayer {
  points: number;
  perks: PerkId[];
  boxPulls: number;
  /** Perk slots (PERK_LIMIT, raised by an easter egg up to PERK_LIMIT_MAX). Kept when you go down. */
  perkLimit: number;
}

export function createZPlayer(): ZPlayer {
  return { points: POINTS.start, perks: [], boxPulls: 0, perkLimit: PERK_LIMIT };
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
/**
 * Weapon tiers drive where a gun may hang and what it costs:
 * - `starter`: cheap, low damage-per-second guns for the spawn room (the only tier allowed there);
 * - `standard`: SMGs and assault rifles one or two doors in;
 * - `heavy`: marksman rifles, LMGs and the hard-hitting ARs, deep in the map at a premium;
 * - `box`: only the Cache hands these out; `wonder`: box-only (or quest reward), one at a time.
 */
export type GunTier = 'starter' | 'standard' | 'heavy' | 'box' | 'wonder';
export const WEAPON_TIER: Partial<Record<WeaponId, GunTier>> = {
  pi_warden: 'starter', pi_magnus: 'starter', br_drover: 'starter', sg_hullbreaker: 'starter', smg_wren: 'starter',
  smg_skiff: 'standard', ar_kestrel: 'standard', ar_corvid: 'standard',
  dmr_sentry: 'heavy', lmg_bastion: 'heavy', ar_moraine: 'heavy',
  ar_tern: 'box', smg_fennec: 'box', sg_tidal: 'box', sr_longwatch: 'box', pi_basalt: 'box', ln_lotus: 'box',
  ww_arc: 'wonder', ww_singularity: 'wonder', ww_cryo: 'wonder',
};
/** Minimum door depth (doors from the start zone) at which each wall tier may hang. */
export const TIER_MIN_DEPTH: Record<'starter' | 'standard' | 'heavy', number> = { starter: 0, standard: 1, heavy: 2 };

export interface WallBuyDef { weapon: WeaponId; price: number; ammoPrice: number; upgradedAmmoPrice: number; tier: 'starter' | 'standard' | 'heavy' }

/** Reforged ammo costs more the better the gun: starters 3000, standard 4500, heavy 6000. */
export const UPGRADED_AMMO: Record<WallBuyDef['tier'], number> = { starter: 3000, standard: 4500, heavy: 6000 };
/** Chalk outlines. Ammo is half the gun's price; ammo for a reforged gun is tier-priced (UPGRADED_AMMO). */
function wb(weapon: WeaponId, price: number, tier: WallBuyDef['tier']): WallBuyDef {
  return { weapon, price, ammoPrice: Math.round(price / 2), upgradedAmmoPrice: UPGRADED_AMMO[tier], tier };
}
export const WALL_BUYS = {
  // starter tier (spawn room): the classic "knife + pistol early, a cheap wall gun by round 2" economy
  pi_warden: wb('pi_warden', 500, 'starter'),
  pi_magnus: wb('pi_magnus', 500, 'starter'),
  br_drover: wb('br_drover', 500, 'starter'),
  sg_hullbreaker: wb('sg_hullbreaker', 750, 'starter'),
  smg_wren: wb('smg_wren', 1000, 'starter'),
  // standard tier (one door in)
  smg_skiff: wb('smg_skiff', 1200, 'standard'),
  ar_kestrel: wb('ar_kestrel', 1400, 'standard'),
  ar_corvid: wb('ar_corvid', 1500, 'standard'),
  // heavy tier (deep in the map)
  dmr_sentry: wb('dmr_sentry', 1750, 'heavy'),
  ar_moraine: wb('ar_moraine', 2000, 'heavy'),
  lmg_bastion: wb('lmg_bastion', 2500, 'heavy'),
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
  { weapon: 'ar_tern', weight: 4 }, { weapon: 'smg_fennec', weight: 4 }, { weapon: 'sg_tidal', weight: 4 },
  { weapon: 'sr_longwatch', weight: 3 }, { weapon: 'pi_basalt', weight: 3 }, { weapon: 'ln_lotus', weight: 3 },
  { weapon: 'ar_moraine', weight: 3 }, { weapon: 'lmg_bastion', weight: 2 },
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
  /** 'hidden': the Cache has not surfaced yet (maps with `box.reveal`). */
  phase: 'hidden' | 'idle' | 'spinning' | 'offer' | 'moving';
  t: number;
  offer: WeaponId | null;
  owner: number; // player index who paid (co-op)
}

export function createBox(location = 0, hidden = false): BoxState {
  return { location, pullsHere: 0, phase: hidden ? 'hidden' : 'idle', t: 0, offer: null, owner: -1 };
}

/** Surface a hidden Cache at `location`. Returns false if it was already out. */
export function revealBox(box: BoxState, location: number): boolean {
  if (box.phase !== 'hidden') return false;
  box.location = location;
  box.pullsHere = 0;
  box.phase = 'idle';
  box.t = 0;
  return true;
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
  if (box.phase === 'idle' || box.phase === 'hidden') return null;
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
/** Reforger passes: tier I 5000, tier II 7000, tier III 9000 (each adds damage, magazine, reserve and a new camo). */
export const PAP_TIER_PRICES = [5000, 7000, 9000] as const;
export const PAP_MAX_TIER = PAP_TIER_PRICES.length;
export const PAP_PRICE = PAP_TIER_PRICES[0];
export const PAP_REPACK_PRICE = PAP_TIER_PRICES[1];
export const PAP_SECONDS = 3.5;
/** Camo names shown on the reforge toast per tier. */
export const PAP_CAMOS = ['', 'EMBERGLASS', 'VOIDSTEEL', 'SUNFORGE'] as const;

/** Reforged names (original). Tier 2 ("repack") appends a mark. */
export const PAP_NAMES: Partial<Record<WeaponId, string>> = {
  ar_kestrel: 'SKYRENDER', ar_corvid: 'MURDER OF CROWS', ar_moraine: 'GLACIAL TILL', ar_tern: 'ARCTIC TERNADO',
  smg_wren: 'WRENCH OF RUIN', smg_fennec: 'DESERT GHOST', smg_skiff: 'DREADNOUGHT', sg_hullbreaker: 'KEELHAULER',
  sg_tidal: 'RIPTIDE', lmg_bastion: 'CITADEL', dmr_sentry: 'OVERWATCH', sr_longwatch: 'NEVERSLEEP',
  pi_warden: 'JAILER\'S MERCY', pi_basalt: 'OBSIDIAN OATH', pi_magnus: 'MAGNUS OPUS', ln_lotus: 'BLOOMING HELL',
  br_drover: 'CATTLE BARON',
  ww_arc: 'STORMBRINGER', ww_singularity: 'EVENT HORIZON', ww_cryo: 'ABSOLUTE ZERO',
  rifle: 'SKYRENDER', pistol: 'JAILER\'S MERCY', shotgun: 'KEELHAULER',
};

/** Display name of a weapon at a Reforger tier (tier II and III append a mark). */
export function papName(id: WeaponId, baseName: string, tier: number): string {
  if (tier <= 0) return baseName;
  const n = PAP_NAMES[id] ?? `${baseName} REFORGED`;
  return tier >= 3 ? `${n} III` : tier === 2 ? `${n} II` : n;
}

// ------------------------------------------------------------------------------------------
// Elemental rounds: from tier II a reforged gun's hits can proc its element.
// ------------------------------------------------------------------------------------------
export type Element = 'fire' | 'shock' | 'freeze';
/** Which element each gun's reforged rounds carry (launchers and wonder weapons have their own effects). */
export const PAP_ELEMENT: Partial<Record<WeaponId, Element>> = {
  sg_hullbreaker: 'fire', sg_tidal: 'fire', lmg_bastion: 'fire', pi_basalt: 'fire', pi_warden: 'fire', shotgun: 'fire',
  smg_wren: 'shock', smg_skiff: 'shock', ar_tern: 'shock', ar_kestrel: 'shock', pi_magnus: 'shock', rifle: 'shock',
  ar_corvid: 'freeze', ar_moraine: 'freeze', smg_fennec: 'freeze', dmr_sentry: 'freeze', br_drover: 'freeze', sr_longwatch: 'freeze', pistol: 'freeze',
};
/** Proc chance per hit event by tier (tier 0-1 none, II 10%, III 18%). Shotguns roll once per shot, not per pellet. */
export const ELEMENT_CHANCE = [0, 0, 0.1, 0.18] as const;
/** Effect sizes. Damage is a fraction of the target's max health so procs stay relevant as health scales. */
export const ELEMENT_FX = {
  fire: { seconds: 3, hpFracPerSec: 0.3, spreadRadius: 2.2, spreadCount: 2 },
  shock: { chains: 3, radius: 6, hpFrac: 0.45 },
  freeze: { seconds: 2.2, radius: 2.5, count: 3 },
  /** Elites (brutes aside, the Warden) take this share of any element's damage and are never frozen. */
  eliteMult: 0.1,
} as const;

/** The element a hit procs (or null). */
export function rollElement(id: WeaponId, tier: number, rnd: () => number): Element | null {
  const el = PAP_ELEMENT[id];
  if (!el) return null;
  const c = ELEMENT_CHANCE[Math.max(0, Math.min(ELEMENT_CHANCE.length - 1, tier))];
  return c > 0 && rnd() < c ? el : null;
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

/** Price of the next Reforger pass from `tier`, or null at `maxTier`. */
export function papPrice(tier: number, maxTier: number = PAP_MAX_TIER): number | null {
  if (tier >= maxTier) return null;
  return PAP_TIER_PRICES[Math.max(0, Math.min(PAP_TIER_PRICES.length - 1, tier))];
}

export function tryPap(p: ZPlayer, tier: number, maxTier: number, powerOn: boolean): SpendResult {
  if (!powerOn) return { ok: false, reason: 'power', price: papPrice(tier, maxTier) ?? 0 };
  const price = papPrice(tier, maxTier);
  if (price === null) return { ok: false, reason: 'max', price: 0 };
  return trySpend(p, price);
}

// ------------------------------------------------------------------------------------------
// Perks (original names)
// ------------------------------------------------------------------------------------------
export type PerkId = 'bulwark' | 'quickhands' | 'hammerfall' | 'lifeline' | 'strider' | 'hawkeye' | 'packmule' | 'nova';

export interface PerkMods {
  maxHealthMult: number;
  reloadMult: number;
  rpmMult: number;
  damageMult: number;
  selfRevives: number;
  regenDelayMult: number;
  /** Strider: sprint speed and stamina (drain) multipliers, faster aim-down-sights. */
  sprintMult: number;
  staminaDrainMult: number;
  adsMult: number;
  /** Hawkeye: spread and headshot damage multipliers, plus the aim-snap-to-head assist. */
  spreadMult: number;
  headMult: number;
  aimAssist: boolean;
  /** Packmule: extra weapon slots. */
  extraSlots: number;
  /** Nova: immune to your own explosions; a slide sets off a blast. */
  blastImmune: boolean;
  slideNova: boolean;
}

export const BASE_MODS: PerkMods = {
  maxHealthMult: 1, reloadMult: 1, rpmMult: 1, damageMult: 1, selfRevives: 0, regenDelayMult: 1,
  sprintMult: 1, staminaDrainMult: 1, adsMult: 1, spreadMult: 1, headMult: 1, aimAssist: false, extraSlots: 0, blastImmune: false, slideNova: false,
};

export interface PerkDef {
  id: PerkId; name: string; price: number; desc: string; color: number; needsPower: boolean;
  /** Stock machine this perk borrows (model, silhouette, footprint) until it has bespoke art; tinted `color`. */
  base: 'bulwark' | 'quickhands' | 'hammerfall' | 'lifeline';
  apply(m: PerkMods): PerkMods;
}

export const PERKS: Record<PerkId, PerkDef> = {
  bulwark: { id: 'bulwark', name: 'BULWARK BREW', price: 2500, desc: 'Max health x2.5', color: 0xd03030, needsPower: true, base: 'bulwark',
    apply: (m) => ({ ...m, maxHealthMult: 2.5 }) },
  quickhands: { id: 'quickhands', name: 'QUICKHANDS FIZZ', price: 3000, desc: 'Reload 2x faster', color: 0x30c050, needsPower: true, base: 'quickhands',
    apply: (m) => ({ ...m, reloadMult: 0.5 }) },
  hammerfall: { id: 'hammerfall', name: 'HAMMERFALL ROOT', price: 2000, desc: 'Fire rate +33%, damage +20%', color: 0xe0a020, needsPower: true, base: 'hammerfall',
    apply: (m) => ({ ...m, rpmMult: 1.33, damageMult: 1.2 }) },
  lifeline: { id: 'lifeline', name: 'LIFELINE SODA', price: 500, desc: 'Solo: self-revive (3 uses) · faster regen', color: 0x3080e0, needsPower: false, base: 'lifeline',
    apply: (m) => ({ ...m, selfRevives: m.selfRevives + 1, regenDelayMult: 0.5 }) },
  strider: { id: 'strider', name: 'STRIDER TONIC', price: 2000, desc: 'Sprint +12% · stamina lasts 3x · aim 35% faster', color: 0xf0e040, needsPower: true, base: 'quickhands',
    apply: (m) => ({ ...m, sprintMult: 1.12, staminaDrainMult: 1 / 3, adsMult: 0.65 }) },
  hawkeye: { id: 'hawkeye', name: 'HAWKEYE DRAUGHT', price: 1500, desc: 'Aim snaps to heads · tighter spread · headshots +25%', color: 0x607890, needsPower: true, base: 'bulwark',
    apply: (m) => ({ ...m, spreadMult: 0.6, headMult: 1.25, aimAssist: true }) },
  packmule: { id: 'packmule', name: 'PACKMULE MALT', price: 4000, desc: 'Carry a third weapon (lost when you go down)', color: 0x3a8a4a, needsPower: true, base: 'hammerfall',
    apply: (m) => ({ ...m, extraSlots: 1 }) },
  nova: { id: 'nova', name: 'NOVA NECTAR', price: 2000, desc: 'Immune to your own blasts · a slide ends in a blast', color: 0xb040e0, needsPower: true, base: 'lifeline',
    apply: (m) => ({ ...m, blastImmune: true, slideNova: true }) },
};

/** Default perk slots; an easter egg can raise a player's limit up to PERK_LIMIT_MAX. */
export const PERK_LIMIT = 4;
export const PERK_LIMIT_MAX = 6;
export const LIFELINE_SOLO_MAX_BUYS = 3;

export function perkMods(perks: PerkId[]): PerkMods {
  return perks.reduce((m, id) => PERKS[id].apply(m), { ...BASE_MODS });
}

export function tryBuyPerk(p: ZPlayer, id: PerkId, powerOn: boolean, lifelineBuys = 0): SpendResult {
  const def = PERKS[id];
  if (p.perks.includes(id)) return { ok: false, reason: 'owned', price: def.price };
  if (p.perks.length >= (p.perkLimit ?? PERK_LIMIT)) return { ok: false, reason: 'limit', price: def.price };
  if (def.needsPower && !powerOn) return { ok: false, reason: 'power', price: def.price };
  if (id === 'lifeline' && lifelineBuys >= LIFELINE_SOLO_MAX_BUYS) return { ok: false, reason: 'max', price: def.price };
  const s = trySpend(p, def.price);
  if (s.ok) p.perks.push(id);
  return s;
}

/** A free perk (easter-egg reward, perk bottle): ignores price, power and the slot limit. False if already owned. */
export function grantPerk(p: ZPlayer, id: PerkId): boolean {
  if (p.perks.includes(id)) return false;
  p.perks.push(id);
  return true;
}

/** Raise the player's perk limit by `n` (capped at PERK_LIMIT_MAX). Returns the new limit. */
export function addPerkSlots(p: ZPlayer, n = 1): number {
  p.perkLimit = Math.min(PERK_LIMIT_MAX, (p.perkLimit ?? PERK_LIMIT) + n);
  return p.perkLimit;
}

/** On going down: lose all perks (the slots stay). Returns true if a self-revive (Lifeline) saved the player. */
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
