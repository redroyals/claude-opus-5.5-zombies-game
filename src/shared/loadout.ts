// Create-a-class: perks, equipment, killstreaks and validation against player progress. Pure.
import { WEAPONS, ATTACHMENT_BY_ID } from '../data/weapons';
import { weaponLevelForKills } from './progression';

export interface PerkDef { id: string; tier: 1 | 2 | 3; name: string; desc: string; unlockLevel: number }
export const PERKS: PerkDef[] = [
  { id: 'fleet', tier: 1, name: 'Fleetfoot', desc: 'Longer sprint, faster slide recovery', unlockLevel: 1 },
  { id: 'ghostwire', tier: 1, name: 'Ghostwire', desc: 'Hidden from enemy scout drones', unlockLevel: 4 },
  { id: 'kevlar', tier: 1, name: 'Layered Vest', desc: '+20% explosive resistance', unlockLevel: 9 },
  { id: 'scavenge', tier: 1, name: 'Scavenger', desc: 'Resupply ammo from fallen players', unlockLevel: 13 },
  { id: 'steady', tier: 2, name: 'Steady Hands', desc: 'Less hip spread', unlockLevel: 1 },
  { id: 'quickdraw', tier: 2, name: 'Quickdraw', desc: 'Faster aim down sights', unlockLevel: 6 },
  { id: 'overkill', tier: 2, name: 'Double Carry', desc: 'Two primary weapons', unlockLevel: 16 },
  { id: 'hardline', tier: 2, name: 'Hardline', desc: 'Killstreaks need one fewer kill', unlockLevel: 20 },
  { id: 'deadsilence', tier: 3, name: 'Hushed Step', desc: 'Silent footsteps', unlockLevel: 1 },
  { id: 'tracker', tier: 3, name: 'Tracker', desc: 'See enemy footprints', unlockLevel: 8 },
  { id: 'marathon', tier: 3, name: 'Endurance', desc: 'Unlimited sprint', unlockLevel: 18 },
  { id: 'coldblood', tier: 3, name: 'Cold Nerve', desc: 'No name tag on aim', unlockLevel: 26 },
];
export const PERK_BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p]));

export const LETHALS = [
  { id: 'frag', name: 'Frag Grenade', unlockLevel: 1 },
  { id: 'semtex', name: 'Sticky Charge', unlockLevel: 7 },
  { id: 'hatchet', name: 'Throwing Hatchet', unlockLevel: 14 },
  { id: 'claymore', name: 'Tripwire Mine', unlockLevel: 22 },
];
export const TACTICALS = [
  { id: 'flash', name: 'Flash Charge', unlockLevel: 1 },
  { id: 'smoke', name: 'Smoke Canister', unlockLevel: 3 },
  { id: 'stun', name: 'Concussion', unlockLevel: 10 },
  { id: 'decoy', name: 'Decoy Emitter', unlockLevel: 24 },
];

export interface StreakDef { id: string; kills: number; name: string; unlockLevel: number }
export const KILLSTREAKS: StreakDef[] = [
  { id: 'scout', kills: 3, name: 'Scout Drone', unlockLevel: 1 },
  { id: 'supply', kills: 4, name: 'Supply Drop', unlockLevel: 5 },
  { id: 'mortar', kills: 5, name: 'Mortar Barrage', unlockLevel: 1 },
  { id: 'counter', kills: 5, name: 'Jammer', unlockLevel: 12 },
  { id: 'gunship', kills: 7, name: 'Gunship', unlockLevel: 1 },
  { id: 'dogs', kills: 9, name: 'K9 Unit', unlockLevel: 30 },
  { id: 'emp', kills: 11, name: 'Blackout Pulse', unlockLevel: 40 },
];
export const STREAK_BY_ID = Object.fromEntries(KILLSTREAKS.map((s) => [s.id, s]));

export interface Loadout {
  name: string;
  primary: string;
  primaryAttachments: string[];
  secondary: string;
  secondaryAttachments: string[];
  lethal: string;
  tactical: string;
  perks: [string, string, string];
  streaks: [string, string, string];
}

export interface Unlocks { level: number; prestige: number; weaponKills: Record<string, number> }

export const DEFAULT_LOADOUTS: Loadout[] = [
  { name: 'Assault', primary: 'ar_kestrel', primaryAttachments: [], secondary: 'pi_warden', secondaryAttachments: [], lethal: 'frag', tactical: 'flash', perks: ['fleet', 'steady', 'deadsilence'], streaks: ['scout', 'mortar', 'gunship'] },
  { name: 'Close Quarters', primary: 'smg_wren', primaryAttachments: [], secondary: 'pi_warden', secondaryAttachments: [], lethal: 'frag', tactical: 'flash', perks: ['fleet', 'steady', 'deadsilence'], streaks: ['scout', 'mortar', 'gunship'] },
  { name: 'Breacher', primary: 'sg_hullbreaker', primaryAttachments: [], secondary: 'pi_warden', secondaryAttachments: [], lethal: 'frag', tactical: 'flash', perks: ['fleet', 'steady', 'deadsilence'], streaks: ['scout', 'mortar', 'gunship'] },
];

/** Returns a list of problems (empty = valid). Server re-validates every class it receives. */
export function validateLoadout(l: Loadout, u: Unlocks): string[] {
  const errs: string[] = [];
  const unlockedAtLevel = (need: number) => u.prestige > 0 || u.level >= need;
  const pri = WEAPONS[l.primary], sec = WEAPONS[l.secondary];
  const overkill = l.perks?.includes('overkill');
  if (!pri) errs.push('unknown primary');
  else {
    if (!pri.primary) errs.push('primary slot needs a primary weapon');
    if (!unlockedAtLevel(pri.unlockLevel)) errs.push(`${pri.name} locked until level ${pri.unlockLevel}`);
  }
  if (!sec) errs.push('unknown secondary');
  else {
    if (sec.primary && !overkill) errs.push('secondary slot needs a secondary weapon (or Double Carry)');
    if (!unlockedAtLevel(sec.unlockLevel)) errs.push(`${sec.name} locked until level ${sec.unlockLevel}`);
  }
  for (const [w, atts] of [[pri, l.primaryAttachments], [sec, l.secondaryAttachments]] as const) {
    if (!w) continue;
    if (!Array.isArray(atts) || atts.length > 2) { errs.push('max 2 attachments per weapon'); continue; }
    const slots = new Set<string>();
    for (const id of atts) {
      const a = ATTACHMENT_BY_ID[id];
      if (!a) { errs.push(`unknown attachment ${id}`); continue; }
      if (!w.slots.includes(a.slot)) errs.push(`${a.name} does not fit ${w.name}`);
      if (slots.has(a.slot)) errs.push(`two ${a.slot} attachments`);
      slots.add(a.slot);
      if (weaponLevelForKills(u.weaponKills[w.id] ?? 0) < a.weaponLevel) errs.push(`${a.name} locked on ${w.name}`);
    }
  }
  const lethal = LETHALS.find((x) => x.id === l.lethal), tac = TACTICALS.find((x) => x.id === l.tactical);
  if (!lethal) errs.push('unknown lethal'); else if (!unlockedAtLevel(lethal.unlockLevel)) errs.push(`${lethal.name} locked`);
  if (!tac) errs.push('unknown tactical'); else if (!unlockedAtLevel(tac.unlockLevel)) errs.push(`${tac.name} locked`);
  if (!Array.isArray(l.perks) || l.perks.length !== 3) errs.push('need exactly 3 perks');
  else l.perks.forEach((id, i) => {
    const p = PERK_BY_ID[id];
    if (!p) errs.push(`unknown perk ${id}`);
    else if (p.tier !== i + 1) errs.push(`${p.name} is not a tier ${i + 1} perk`);
    else if (!unlockedAtLevel(p.unlockLevel)) errs.push(`${p.name} locked`);
  });
  if (!Array.isArray(l.streaks) || l.streaks.length !== 3 || new Set(l.streaks).size !== 3) errs.push('need 3 different killstreaks');
  else for (const id of l.streaks) {
    const s = STREAK_BY_ID[id];
    if (!s) errs.push(`unknown killstreak ${id}`); else if (!unlockedAtLevel(s.unlockLevel)) errs.push(`${s.name} locked`);
  }
  return errs;
}

/** Kills needed for a streak given perks (Hardline -1). */
export function streakCost(id: string, perks: string[]): number {
  const s = STREAK_BY_ID[id];
  return s ? Math.max(2, s.kills - (perks.includes('hardline') ? 1 : 0)) : Infinity;
}
