// Perks: ALL available from level 1. Each perk has precise mechanical effects consumed by the shared
// sim (server authority) and the client (prediction/presentation). Pure data + merge helper.

export interface PerkEffects {
  adsTimeMult: number;       // weapon ADS time multiplier
  sprintToFireMult: number;  // sprint-out delay multiplier
  flinchMult: number;        // view kick when hit
  reloadMult: number;        // reload time multiplier
  swapMult: number;          // weapon swap time multiplier
  hipSpreadMult: number;
  radarHidden: boolean;      // hidden from Scout Drone sweeps and fire pings
  footstepVolume: number;    // 0..1 (client audio, broadcast in roster)
  extraLethal: number;       // additional lethal count
  mantleTimeMult: number;
  slideCooldownMult: number;
  slideSpeedMult: number;
  explosiveDamageMult: number;
  fallDamage: boolean;
  seeEquipment: boolean;     // enemy equipment always visible (outlined)
  tacSprintMult: number;     // tactical sprint duration multiplier
  tacRechargeMult: number;   // tactical sprint recharge time multiplier
  streakDiscount: number;    // kills removed from each killstreak cost
  scavenger: boolean;        // resupply reserve ammo from kills
  twoPrimaries: boolean;
  hideNameplate: boolean;
  stunResist: number;        // multiplier on flash/stun duration
}

export const BASE_EFFECTS: PerkEffects = {
  adsTimeMult: 1, sprintToFireMult: 1, flinchMult: 1, reloadMult: 1, swapMult: 1, hipSpreadMult: 1, radarHidden: false, footstepVolume: 1,
  extraLethal: 0, mantleTimeMult: 1, slideCooldownMult: 1, slideSpeedMult: 1, explosiveDamageMult: 1, fallDamage: true, seeEquipment: false,
  tacSprintMult: 1, tacRechargeMult: 1, streakDiscount: 0, scavenger: false, twoPrimaries: false, hideNameplate: false, stunResist: 1,
};

export interface PerkDef { id: string; tier: 1 | 2 | 3; name: string; desc: string; fx: Partial<PerkEffects> }

// Balance rule: each perk trades roughly one "slot" of value. Tier 1 = survivability/mobility,
// tier 2 = weapon handling, tier 3 = stealth/awareness.
export const PERKS: PerkDef[] = [
  { id: 'fleet', tier: 1, name: 'Fleetfoot', desc: 'Tactical sprint lasts 2x longer; slide cooldown -40%; slides 8% faster', fx: { tacSprintMult: 2, slideCooldownMult: 0.6, slideSpeedMult: 1.08 } },
  { id: 'ghostwire', tier: 1, name: 'Ghostwire', desc: 'Hidden from Scout Drones and fire pings on the radar', fx: { radarHidden: true } },
  { id: 'kevlar', tier: 1, name: 'Layered Vest', desc: 'Explosive damage -40%; stun/flash duration -30%', fx: { explosiveDamageMult: 0.6, stunResist: 0.7 } },
  { id: 'scavenge', tier: 1, name: 'Scavenger', desc: 'Kills refill 1 magazine of reserve ammo', fx: { scavenger: true } },
  { id: 'double_lethal', tier: 1, name: 'Bandolier', desc: 'Carry one extra lethal', fx: { extraLethal: 1 } },
  { id: 'hardline', tier: 1, name: 'Hardline', desc: 'Killstreaks cost 1 fewer kill', fx: { streakDiscount: 1 } },
  { id: 'quickdraw', tier: 2, name: 'Quickdraw', desc: 'ADS 20% faster; sprint-to-fire 30% faster', fx: { adsTimeMult: 0.8, sprintToFireMult: 0.7 } },
  { id: 'fasthands', tier: 2, name: 'Fast Hands', desc: 'Reload 25% faster; weapon swap 40% faster', fx: { reloadMult: 0.75, swapMult: 0.6 } },
  { id: 'steady', tier: 2, name: 'Steady Hands', desc: 'Hip spread -25%; flinch -50%', fx: { hipSpreadMult: 0.75, flinchMult: 0.5 } },
  { id: 'overkill', tier: 2, name: 'Double Carry', desc: 'Carry two primary weapons', fx: { twoPrimaries: true } },
  { id: 'engineer', tier: 2, name: 'Engineer', desc: 'See enemy equipment through walls', fx: { seeEquipment: true } },
  { id: 'deadsilence', tier: 3, name: 'Hushed Step', desc: 'Footsteps 75% quieter', fx: { footstepVolume: 0.25 } },
  { id: 'marathon', tier: 3, name: 'Endurance', desc: 'Tactical sprint recharges 3x faster and lasts 1.5x', fx: { tacRechargeMult: 1 / 3, tacSprintMult: 1.5 } },
  { id: 'softland', tier: 3, name: 'Soft Landing', desc: 'No fall damage; mantle 30% faster', fx: { fallDamage: false, mantleTimeMult: 0.7 } },
  { id: 'coldblood', tier: 3, name: 'Cold Nerve', desc: 'No nameplate when aimed at; hidden from Scout Drones', fx: { hideNameplate: true, radarHidden: true } },
  { id: 'tuned', tier: 3, name: 'Tuned Reflexes', desc: 'Flinch -30%; stun/flash duration -40%', fx: { flinchMult: 0.7, stunResist: 0.6 } },
];
export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));

/** Merge perk effects (multiplicative for multipliers, additive/OR otherwise). */
export function perkEffects(ids: readonly string[]): PerkEffects {
  const e: PerkEffects = { ...BASE_EFFECTS };
  for (const id of ids) {
    const p = PERK_BY_ID[id];
    if (!p) continue;
    for (const [k, v] of Object.entries(p.fx) as [keyof PerkEffects, PerkEffects[keyof PerkEffects]][]) {
      if (typeof v === 'boolean') (e as unknown as Record<string, unknown>)[k] = k === 'fallDamage' ? (e.fallDamage && v) : ((e[k] as boolean) || v);
      else if (k === 'extraLethal' || k === 'streakDiscount') (e[k] as number) += v as number;
      else if (k === 'footstepVolume') e.footstepVolume = Math.min(e.footstepVolume, v as number);
      else (e[k] as number) *= v as number;
    }
  }
  return e;
}

/** View flinch (degrees of pitch kick) when hit for `damage`. Used by the client on 'hit' events. */
export function flinchDegrees(damage: number, fx: PerkEffects): number {
  return Math.min(4, damage * 0.06) * fx.flinchMult;
}

/** Fall damage from landing speed (m/s). */
export function fallDamage(impactSpeed: number, fx: PerkEffects): number {
  if (!fx.fallDamage || impactSpeed <= 11) return 0;
  return Math.round((impactSpeed - 11) * 14);
}
