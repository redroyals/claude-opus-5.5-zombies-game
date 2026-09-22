// Progression math: XP -> level (1..55), prestige (0..10), XP awards. Pure.
export const MAX_LEVEL = 55;
export const MAX_PRESTIGE = 10;

/** Total XP required to *reach* level L (L=1 => 0). Gently rising curve: ~1.25M XP to hit 55. */
export function xpForLevel(level: number): number {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  let total = 0;
  for (let i = 1; i < L; i++) total += xpToNext(i);
  return total;
}

/** XP needed to go from level l to l+1. */
export function xpToNext(level: number): number {
  return Math.round(800 + 250 * level + 18 * level * level);
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

export function prestige(p: Progress): Progress {
  if (!canPrestige(p)) return p;
  return { xp: 0, prestige: p.prestige + 1 };
}

export const XP = {
  kill: 100,
  headshotBonus: 50,
  assist: 50,
  confirm: 50, // kill confirmed tag
  deny: 25,
  capture: 150,
  defend: 75,
  win: 500,
  loss: 200, // completion bonus
  streakBonus: 25, // per kill in a streak beyond 3
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

/** Weapon level from kills with it (for attachment unlocks). */
export function weaponLevelForKills(kills: number): number {
  return Math.min(15, 1 + Math.floor(Math.sqrt(Math.max(0, kills) / 4)));
}
