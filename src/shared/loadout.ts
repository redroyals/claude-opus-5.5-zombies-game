// Create-a-class: equipment, killstreaks, validation against player progress. Pure.
import { WEAPONS, attachmentErrors } from '../data/weapons';
import { weaponLevelForXp } from './progression';
import { PERK_BY_ID, perkEffects } from './perks';
import { isUnlocked, type UnlockState } from './unlocks';
export { PERKS, PERK_BY_ID } from './perks';

export interface EquipDef { id: string; name: string; unlockLevel: number; desc: string }
export const LETHALS: EquipDef[] = [
  { id: 'frag', name: 'Frag Grenade', unlockLevel: 1, desc: 'Cookable, 2.5 s fuse, bounces' },
  { id: 'semtex', name: 'Sticky Charge', unlockLevel: 8, desc: 'Sticks to surfaces, 2 s fuse' },
  { id: 'hatchet', name: 'Throwing Hatchet', unlockLevel: 16, desc: 'One-hit kill on direct impact' },
  { id: 'claymore', name: 'Tripwire Mine', unlockLevel: 28, desc: 'Proximity mine facing where placed' },
];
export const TACTICALS: EquipDef[] = [
  { id: 'flash', name: 'Flash Charge', unlockLevel: 1, desc: 'Blinds players with line of sight' },
  { id: 'smoke', name: 'Smoke Canister', unlockLevel: 4, desc: 'Vision-blocking cloud for 12 s' },
  { id: 'stun', name: 'Concussion', unlockLevel: 12, desc: 'Slows movement and aim' },
  { id: 'decoy', name: 'Decoy Emitter', unlockLevel: 33, desc: 'Fakes gunfire pings on enemy radar' },
];

export interface StreakDef { id: string; kills: number; name: string; unlockLevel: number; desc: string }
export const KILLSTREAKS: StreakDef[] = [
  { id: 'scout', kills: 3, name: 'Scout Drone', unlockLevel: 1, desc: 'Reveals enemies on radar for 20 s' },
  { id: 'supply', kills: 4, name: 'Supply Drop', unlockLevel: 6, desc: 'Refills your ammo and equipment' },
  { id: 'mortar', kills: 5, name: 'Mortar Barrage', unlockLevel: 1, desc: 'Three shells on enemy positions' },
  { id: 'counter', kills: 5, name: 'Jammer', unlockLevel: 18, desc: 'Blocks enemy radar for 20 s' },
  { id: 'gunship', kills: 7, name: 'Gunship', unlockLevel: 1, desc: 'Circling support fire on exposed enemies' },
  { id: 'dogs', kills: 9, name: 'K9 Unit', unlockLevel: 42, desc: 'Hunts enemies for 30 s' },
  { id: 'emp', kills: 11, name: 'Blackout Pulse', unlockLevel: 60, desc: 'Disables enemy HUD and streaks' },
];
export const STREAK_BY_ID: Record<string, StreakDef> = Object.fromEntries(KILLSTREAKS.map((s) => [s.id, s]));

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
  camos?: Record<string, string>;
}

export interface Unlocks extends UnlockState {
  /** Weapon XP per weapon id (weapon level -> attachments). */
  weaponXp: Record<string, number>;
}

export const DEFAULT_LOADOUTS: Loadout[] = [
  { name: 'Assault', primary: 'ar_kestrel', primaryAttachments: [], secondary: 'pi_warden', secondaryAttachments: [], lethal: 'frag', tactical: 'flash', perks: ['fleet', 'quickdraw', 'deadsilence'], streaks: ['scout', 'mortar', 'gunship'] },
  { name: 'Close Quarters', primary: 'smg_wren', primaryAttachments: [], secondary: 'pi_warden', secondaryAttachments: [], lethal: 'frag', tactical: 'flash', perks: ['fleet', 'fasthands', 'deadsilence'], streaks: ['scout', 'mortar', 'gunship'] },
  { name: 'Breacher', primary: 'sg_hullbreaker', primaryAttachments: [], secondary: 'pi_warden', secondaryAttachments: [], lethal: 'frag', tactical: 'flash', perks: ['kevlar', 'steady', 'softland'], streaks: ['scout', 'mortar', 'gunship'] },
];

export const MAX_CLASSES = 10;

/** Returns a list of problems (empty = valid). The server re-validates every class it receives. */
export function validateLoadout(l: Loadout, u: Unlocks): string[] {
  const errs: string[] = [];
  if (!l || typeof l !== 'object') return ['bad loadout'];
  const perks = Array.isArray(l.perks) ? l.perks : [];
  const fx = perkEffects(perks);
  const pri = WEAPONS[l.primary], sec = WEAPONS[l.secondary];
  if (!pri) errs.push('unknown primary');
  else {
    if (!pri.primary) errs.push('primary slot needs a primary weapon');
    if (!isUnlocked(u, 'weapon', pri.id)) errs.push(`${pri.name} locked until level ${pri.unlockLevel}`);
  }
  if (!sec) errs.push('unknown secondary');
  else {
    if (sec.primary && !fx.twoPrimaries) errs.push('secondary slot needs a secondary weapon (or Double Carry)');
    if (!isUnlocked(u, 'weapon', sec.id)) errs.push(`${sec.name} locked until level ${sec.unlockLevel}`);
  }
  for (const [w, atts] of [[pri, l.primaryAttachments], [sec, l.secondaryAttachments]] as const) {
    if (!w) continue;
    if (!Array.isArray(atts)) { errs.push('bad attachments'); continue; }
    errs.push(...attachmentErrors(w, atts, weaponLevelForXp(u.weaponXp?.[w.id] ?? 0)));
  }
  const lethal = LETHALS.find((x) => x.id === l.lethal), tac = TACTICALS.find((x) => x.id === l.tactical);
  if (!lethal) errs.push('unknown lethal'); else if (!isUnlocked(u, 'lethal', lethal.id)) errs.push(`${lethal.name} locked`);
  if (!tac) errs.push('unknown tactical'); else if (!isUnlocked(u, 'tactical', tac.id)) errs.push(`${tac.name} locked`);
  if (perks.length !== 3) errs.push('need exactly 3 perks');
  else perks.forEach((id, i) => {
    const p = PERK_BY_ID[id];
    if (!p) errs.push(`unknown perk ${id}`);
    else if (p.tier !== i + 1) errs.push(`${p.name} is not a tier ${i + 1} perk`);
  });
  if (!Array.isArray(l.streaks) || l.streaks.length !== 3 || new Set(l.streaks).size !== 3) errs.push('need 3 different killstreaks');
  else for (const id of l.streaks) {
    const s = STREAK_BY_ID[id];
    if (!s) errs.push(`unknown killstreak ${id}`); else if (!isUnlocked(u, 'streak', id)) errs.push(`${s.name} locked`);
  }
  return errs;
}

/** Kills needed for a streak given perks (Hardline -1). */
export function streakCost(id: string, perks: readonly string[]): number {
  const s = STREAK_BY_ID[id];
  return s ? Math.max(2, s.kills - perkEffects(perks).streakDiscount) : Infinity;
}
