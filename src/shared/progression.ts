// Progression math: XP -> level (1..100), prestige (0..10), XP + dollar awards. Pure.
export const MAX_LEVEL = 100;
export const MAX_PRESTIGE = 10;

/** XP needed to go from level l to l+1 (~3M XP total to reach 100). */
export function xpToNext(level: number): number {
  return Math.round(1000 + 180 * level + 6 * level * level);
}

/** Total XP required to *reach* level L (L=1 => 0). */
export function xpForLevel(level: number): number {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  let total = 0;
  for (let i = 1; i < L; i++) total += xpToNext(i);
  return total;
}

export function levelForXp(xp: number): number {
  let lvl = 1, need = 0;
  while (lvl < MAX_LEVEL) {
    need += xpToNext(lvl);
    if (xp < need) break;
    lvl++;
  }
  return lvl;
}

export interface Progress { xp: number; prestige: number }

export function canPrestige(p: Progress): boolean {
  return levelForXp(p.xp) >= MAX_LEVEL && p.prestige < MAX_PRESTIGE;
}

/** Prestige resets level; base unlocks are kept (see unlocks.ts) and a prestige token is granted. */
export function prestige(p: Progress): Progress {
  if (!canPrestige(p)) return p;
  return { xp: 0, prestige: p.prestige + 1 };
}

export const XP = {
  kill: 100, headshotBonus: 50, assist: 50, confirm: 50, deny: 25, capture: 150, defend: 75,
  win: 500, loss: 200, streakBonus: 25,
};

/** Match XP cap per match (anti-farm). */
export const MATCH_XP_CAP = 25000;

export interface MatchStats { kills: number; headshots: number; assists: number; confirms: number; denies: number; captures: number; defends: number; bestStreak: number; won: boolean; completed: boolean }

export function matchXp(s: MatchStats): number {
  let xp = s.kills * XP.kill + s.headshots * XP.headshotBonus + s.assists * XP.assist + s.confirms * XP.confirm + s.denies * XP.deny
    + s.captures * XP.capture + s.defends * XP.defend + Math.max(0, s.bestStreak - 3) * XP.streakBonus;
  if (s.completed) xp += s.won ? XP.win : XP.loss;
  return Math.max(0, Math.min(MATCH_XP_CAP, Math.round(xp)));
}

// ---- weapon levels (attachment unlocks) --------------------------------------------------------
export const WEAPON_MAX_LEVEL = 30;
export function weaponXpToNext(level: number): number { return 600 + 150 * level; }
export function weaponLevelForXp(xp: number): number {
  let lvl = 1, need = 0;
  while (lvl < WEAPON_MAX_LEVEL) { need += weaponXpToNext(lvl); if (xp < need) break; lvl++; }
  return lvl;
}
/** Weapon XP per kill with that weapon (headshots worth more). */
export const WEAPON_XP = { kill: 100, headshot: 40 };

// ---- in-game dollars (no real money; server-side ledger only) -----------------------------------
export const DOLLARS = {
  /** Match payout = xp / 20, capped. */
  perMatchXpDivisor: 20,
  matchCap: 1500,
  perLevel: 250,
  perPrestige: 5000,
  perCamo: 100,
  perGilded: 1000,
  perArgent: 2500,
  perPrism: 5000,
  perVoid: 25000,
};

export function matchDollars(xp: number): number {
  return Math.min(DOLLARS.matchCap, Math.floor(Math.max(0, xp) / DOLLARS.perMatchXpDivisor));
}

/** Dollars from levelling from xpBefore to xpAfter (same prestige). */
export function levelUpDollars(xpBefore: number, xpAfter: number): number {
  return Math.max(0, levelForXp(xpAfter) - levelForXp(xpBefore)) * DOLLARS.perLevel;
}
