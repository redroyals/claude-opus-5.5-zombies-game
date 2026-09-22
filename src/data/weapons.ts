// Data-driven multiplayer weapon catalogue. Pure data + pure helpers: no three.js, no DOM.
// Shared by client (HUD, create-a-class, viewmodels) and server (authoritative damage, fire-rate checks).
// Model files: assets/weapons/<id>.glb (see docs/WEAPON_IDS.md).

export type WeaponClass =
  | 'ar' | 'smg' | 'lmg' | 'shotgun' | 'marksman' | 'sniper' | 'pistol' | 'launcher' | 'special';

export type AttachmentSlot = 'optic' | 'muzzle' | 'barrel' | 'underbarrel' | 'magazine' | 'reargrip' | 'stock' | 'laser' | 'ammo';

/** Gunsmith rule: at most this many attachments per weapon. */
export const MAX_ATTACHMENTS = 5;

export interface RecoilStep { pitch: number; yaw: number } // degrees per shot

export interface WeaponStats {
  /** Damage per bullet (per pellet for shotguns) inside rangeNear. */
  damage: number;
  /** Damage multiplier reached at rangeFar (linear falloff between). */
  minDamageMult: number;
  rangeNear: number;
  rangeFar: number;
  headMult: number;
  pellets: number;
  rpm: number;
  auto: boolean;
  /** Burst size; 0 = not burst. */
  burst: number;
  magSize: number;
  reserve: number;
  reloadTime: number;
  adsTime: number;
  adsZoom: number;
  hipSpread: number;
  adsSpread: number;
  /** Movement speed multiplier (1 = base walk speed). */
  mobility: number;
  /** Repeating recoil pattern (degrees); index = shot % length. */
  recoil: RecoilStep[];
  recoilRecover: number;
  /** Penetration budget (see DESIGN §3). */
  penetration: number;
  /** Launcher projectiles: splash radius in metres (0 = hitscan). */
  splash: number;
  /** Muzzle velocity m/s (hitscan inside 40 m; beyond that the server adds travel-time lead check). */
  bulletVelocity: number;
  /** Idle ADS sway in degrees (lower = steadier). */
  aimStability: number;
  /** Seconds after sprinting before the weapon can fire. */
  sprintToFire: number;
  /** Seconds to swap to this weapon. */
  swapTime: number;
}

export interface WeaponDef {
  id: string;
  cls: WeaponClass;
  name: string;
  /** Loose real-world inspiration, for the modelling brief only. */
  inspiration: string;
  /** Player level that unlocks the weapon. */
  unlockLevel: number;
  /** Primary (true) or secondary slot. */
  primary: boolean;
  slots: AttachmentSlot[];
  stats: WeaponStats;
}

const P = (pitch: number, yaw: number): RecoilStep => ({ pitch, yaw });

const ALL_SLOTS: AttachmentSlot[] = ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'reargrip', 'stock', 'laser', 'ammo'];

const BASE: Record<WeaponClass, { stats: WeaponStats; slots: AttachmentSlot[]; primary: boolean }> = {
  ar: { primary: true, slots: ALL_SLOTS, stats: { damage: 30, minDamageMult: 0.7, rangeNear: 30, rangeFar: 70, headMult: 1.5, pellets: 1, rpm: 700, auto: true, burst: 0, magSize: 30, reserve: 150, reloadTime: 2.1, adsTime: 0.24, adsZoom: 0.75, hipSpread: 2.6, adsSpread: 0.3, mobility: 0.93, recoil: [P(0.5, 0.15), P(0.55, -0.2), P(0.5, 0.25), P(0.6, -0.1)], recoilRecover: 9, penetration: 0.8, splash: 0, bulletVelocity: 820, aimStability: 0.35, sprintToFire: 0.22, swapTime: 0.45 } },
  smg: { primary: true, slots: ALL_SLOTS, stats: { damage: 25, minDamageMult: 0.6, rangeNear: 12, rangeFar: 35, headMult: 1.4, pellets: 1, rpm: 850, auto: true, burst: 0, magSize: 32, reserve: 192, reloadTime: 1.8, adsTime: 0.17, adsZoom: 0.82, hipSpread: 2.0, adsSpread: 0.5, mobility: 1.0, recoil: [P(0.35, 0.2), P(0.4, -0.25), P(0.35, 0.3)], recoilRecover: 11, penetration: 0.4, splash: 0, bulletVelocity: 420, aimStability: 0.3, sprintToFire: 0.14, swapTime: 0.4 } },
  lmg: { primary: true, slots: ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'reargrip', 'laser', 'ammo'], stats: { damage: 32, minDamageMult: 0.75, rangeNear: 35, rangeFar: 80, headMult: 1.4, pellets: 1, rpm: 650, auto: true, burst: 0, magSize: 100, reserve: 200, reloadTime: 5.2, adsTime: 0.38, adsZoom: 0.72, hipSpread: 3.8, adsSpread: 0.4, mobility: 0.84, recoil: [P(0.55, 0.3), P(0.5, -0.3)], recoilRecover: 7, penetration: 1.2, splash: 0, bulletVelocity: 850, aimStability: 0.45, sprintToFire: 0.36, swapTime: 0.6 } },
  shotgun: { primary: true, slots: ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'reargrip', 'stock', 'laser', 'ammo'], stats: { damage: 14, minDamageMult: 0.2, rangeNear: 7, rangeFar: 20, headMult: 1.2, pellets: 8, rpm: 75, auto: false, burst: 0, magSize: 6, reserve: 36, reloadTime: 3.6, adsTime: 0.2, adsZoom: 0.85, hipSpread: 5.5, adsSpread: 4.2, mobility: 0.95, recoil: [P(3.2, 0.5)], recoilRecover: 6, penetration: 0.3, splash: 0, bulletVelocity: 400, aimStability: 0.3, sprintToFire: 0.2, swapTime: 0.45 } },
  marksman: { primary: true, slots: ALL_SLOTS, stats: { damage: 55, minDamageMult: 0.8, rangeNear: 45, rangeFar: 90, headMult: 1.8, pellets: 1, rpm: 300, auto: false, burst: 0, magSize: 15, reserve: 60, reloadTime: 2.4, adsTime: 0.3, adsZoom: 0.55, hipSpread: 3.5, adsSpread: 0.1, mobility: 0.9, recoil: [P(1.3, 0.2)], recoilRecover: 8, penetration: 1.0, splash: 0, bulletVelocity: 880, aimStability: 0.4, sprintToFire: 0.26, swapTime: 0.5 } },
  sniper: { primary: true, slots: ['optic', 'muzzle', 'barrel', 'magazine', 'reargrip', 'stock', 'laser', 'ammo'], stats: { damage: 110, minDamageMult: 0.9, rangeNear: 80, rangeFar: 150, headMult: 2.0, pellets: 1, rpm: 50, auto: false, burst: 0, magSize: 5, reserve: 25, reloadTime: 3.4, adsTime: 0.42, adsZoom: 0.3, hipSpread: 7, adsSpread: 0, mobility: 0.87, recoil: [P(4, 0.6)], recoilRecover: 5, penetration: 1.2, splash: 0, bulletVelocity: 900, aimStability: 0.55, sprintToFire: 0.32, swapTime: 0.6 } },
  pistol: { primary: false, slots: ['optic', 'muzzle', 'barrel', 'magazine', 'reargrip', 'laser', 'ammo'], stats: { damage: 28, minDamageMult: 0.55, rangeNear: 10, rangeFar: 28, headMult: 1.5, pellets: 1, rpm: 420, auto: false, burst: 0, magSize: 12, reserve: 48, reloadTime: 1.5, adsTime: 0.14, adsZoom: 0.85, hipSpread: 1.8, adsSpread: 0.6, mobility: 1.05, recoil: [P(0.9, 0.25), P(0.9, -0.25)], recoilRecover: 12, penetration: 0.3, splash: 0, bulletVelocity: 360, aimStability: 0.25, sprintToFire: 0.1, swapTime: 0.3 } },
  launcher: { primary: false, slots: ['optic', 'laser'], stats: { damage: 150, minDamageMult: 1, rangeNear: 100, rangeFar: 150, headMult: 1, pellets: 1, rpm: 30, auto: false, burst: 0, magSize: 1, reserve: 2, reloadTime: 3.5, adsTime: 0.45, adsZoom: 0.7, hipSpread: 3, adsSpread: 0.3, mobility: 0.9, recoil: [P(3, 0.4)], recoilRecover: 5, penetration: 0, splash: 4.5, bulletVelocity: 120, aimStability: 0.5, sprintToFire: 0.35, swapTime: 0.6 } },
  special: { primary: false, slots: [], stats: { damage: 100, minDamageMult: 1, rangeNear: 2, rangeFar: 2.5, headMult: 1, pellets: 1, rpm: 90, auto: false, burst: 0, magSize: 1, reserve: 0, reloadTime: 0, adsTime: 0.2, adsZoom: 1, hipSpread: 0, adsSpread: 0, mobility: 1.08, recoil: [P(0, 0)], recoilRecover: 10, penetration: 0, splash: 0, bulletVelocity: 60, aimStability: 0.2, sprintToFire: 0.08, swapTime: 0.3 } },
};

type Row = [id: string, cls: WeaponClass, name: string, inspiration: string, unlock: number, over?: Partial<WeaponStats>];

// 90 weapons (ids are frozen once published in docs/WEAPON_IDS.md). Names are original; inspiration is a loose silhouette brief for the modelling agent.
const ROWS: Row[] = [
  // Assault rifles (8)
  ['ar_kestrel', 'ar', 'KR-7 Kestrel', 'M4-style carbine', 1],
  ['ar_vanta', 'ar', 'Vanta 556', 'Famas-style bullpup', 4, { burst: 3, auto: false, rpm: 900, damage: 32 }],
  ['ar_halden', 'ar', 'Halden AR', 'G36-style polymer rifle', 8, { rpm: 750, damage: 28 }],
  ['ar_corvid', 'ar', 'Corvid-47', 'AK-style rifle', 12, { damage: 36, rpm: 600, recoil: [P(0.7, 0.3), P(0.7, -0.35), P(0.75, 0.2)] }],
  ['ar_tern', 'ar', 'Tern Compact', 'AUG-style bullpup', 16, { rpm: 680, adsSpread: 0.25 }],
  ['ar_moraine', 'ar', 'Moraine SCR', 'SCAR-style rifle', 22, { damage: 34, rpm: 620 }],
  ['ar_ashlar', 'ar', 'Ashlar Burst', 'M16-style burst rifle', 28, { burst: 3, auto: false, rpm: 820, damage: 33 }],
  ['ar_quill', 'ar', 'Quill 300', 'Honey-badger-style suppressed carbine', 36, { damage: 27, rpm: 780, rangeFar: 55 }],
  // SMGs (7)
  ['smg_wren', 'smg', 'Wren 9', 'MP5-style SMG', 1],
  ['smg_skiff', 'smg', 'Skiff MX', 'MP7-style PDW', 6, { rpm: 950, damage: 22 }],
  ['smg_pallas', 'smg', 'Pallas V', 'Vector-style SMG', 14, { rpm: 1100, damage: 21, magSize: 25 }],
  ['smg_ledger', 'smg', 'Ledger 45', 'UMP-style SMG', 20, { rpm: 650, damage: 30, magSize: 25 }],
  ['smg_bramble', 'smg', 'Bramble', 'Uzi-style machine pistol', 26, { rpm: 1000, damage: 23, mobility: 1.03 }],
  ['smg_fennec', 'smg', 'Fennec PDW', 'P90-style top-feed PDW', 32, { magSize: 50, rpm: 900, damage: 22 }],
  ['smg_drum', 'smg', 'Drummond 1928', 'Tommy-style drum SMG', 44, { magSize: 50, rpm: 720, damage: 28, mobility: 0.97 }],
  // LMGs (4)
  ['lmg_bastion', 'lmg', 'Bastion 249', 'M249-style LMG', 10],
  ['lmg_ironclad', 'lmg', 'Ironclad 60', 'M60-style belt-fed', 24, { damage: 38, rpm: 560 }],
  ['lmg_hauler', 'lmg', 'Hauler RPD', 'RPD-style drum LMG', 34, { rpm: 700, magSize: 100 }],
  ['lmg_grist', 'lmg', 'Grist MG', 'MG42-style gpmg', 48, { rpm: 1000, damage: 30, mobility: 0.8 }],
  // Shotguns (5)
  ['sg_hullbreaker', 'shotgun', 'HB-12 Hullbreaker', 'Pump shotgun (870-style)', 1],
  ['sg_tidal', 'shotgun', 'Tidal Auto', 'Semi-auto (M1014-style)', 12, { rpm: 200, damage: 11, magSize: 7 }],
  ['sg_twinbore', 'shotgun', 'Twinbore', 'Double-barrel side-by-side', 18, { rpm: 240, magSize: 2, damage: 16, reloadTime: 2.4 }],
  ['sg_striker', 'shotgun', 'Striker Drum', 'Striker-style drum shotgun', 30, { rpm: 160, magSize: 12, damage: 10 }],
  ['sg_lever', 'shotgun', 'Ranger Lever', 'Lever-action shotgun', 40, { rpm: 90, damage: 15, rangeNear: 9 }],
  // Marksman (4)
  ['dmr_sentry', 'marksman', 'Sentry 14', 'M14 EBR-style DMR', 9],
  ['dmr_lancet', 'marksman', 'Lancet SVD', 'SVD-style DMR', 21, { damage: 62, rpm: 240 }],
  ['dmr_heron', 'marksman', 'Heron Semi', 'Mini-14-style carbine', 30, { damage: 48, rpm: 360, magSize: 20 }],
  ['dmr_ember', 'marksman', 'Ember Lever', 'Lever-action rifle', 42, { damage: 70, rpm: 160, magSize: 8 }],
  // Snipers (4)
  ['sr_longwatch', 'sniper', 'Longwatch .308', 'Bolt-action (R700-style)', 7],
  ['sr_farcry', 'sniper', 'Farcall .50', 'Barrett-style anti-materiel', 25, { damage: 140, rpm: 70, magSize: 8, mobility: 0.82, adsTime: 0.5 }],
  ['sr_quietus', 'sniper', 'Quietus', 'WA2000-style semi sniper', 33, { damage: 95, rpm: 110, magSize: 6 }],
  ['sr_aurochs', 'sniper', 'Aurochs AX', 'AX-338-style bolt', 46, { damage: 125, rpm: 45 }],
  // Pistols (6)
  ['pi_warden', 'pistol', 'P-19 Warden', 'Glock-style service pistol', 1],
  ['pi_magnus', 'pistol', 'Magnus .44', 'Revolver', 11, { damage: 55, rpm: 180, magSize: 6, headMult: 1.8 }],
  ['pi_basalt', 'pistol', 'Basalt .50', 'Desert-eagle-style hand cannon', 19, { damage: 50, rpm: 220, magSize: 7 }],
  ['pi_flicker', 'pistol', 'Flicker MP', 'Glock-18-style auto pistol', 27, { auto: true, rpm: 1100, damage: 20, magSize: 20 }],
  ['pi_spur', 'pistol', 'Spur 1911', '1911-style pistol', 37, { damage: 34, rpm: 380, magSize: 8 }],
  ['pi_duet', 'pistol', 'Duet Burst', 'Beretta-93R-style burst pistol', 50, { burst: 3, rpm: 1000, damage: 22, magSize: 18 }],
  // Launchers (3)
  ['ln_lotus', 'launcher', 'Lotus RL', 'RPG-style rocket launcher', 5],
  ['ln_mallard', 'launcher', 'Mallard 40', 'Break-open grenade launcher', 17, { damage: 130, splash: 4, reloadTime: 2.6 }],
  ['ln_tracer', 'launcher', 'Tracer AA', 'Tube lock-on launcher', 29, { damage: 160, splash: 5, adsTime: 0.6 }],
  // Specials (4)
  ['sp_kukri', 'special', 'Field Kukri', 'Kukri knife (melee)', 1],
  ['sp_hatchet', 'special', 'Breach Hatchet', 'Tactical axe (melee)', 15, { rpm: 70, mobility: 1.05 }],
  ['sp_crossbow', 'special', 'Quarrel Crossbow', 'Compact crossbow', 23, { damage: 120, rangeNear: 40, rangeFar: 80, magSize: 1, reserve: 6, reloadTime: 1.6, adsTime: 0.28, adsZoom: 0.6, splash: 0 }],
  ['sp_riot', 'special', 'Aegis Shield', 'Ballistic riot shield', 39, { damage: 60, mobility: 0.85 }],
  // --- Roster expansion (45 more) ---
  ['ar_sable', 'ar', 'Sable 762', 'Galil-style rifle', 40, { damage: 35, rpm: 630 }],
  ['ar_kite', 'ar', 'Kite TX', 'Tavor-style bullpup', 45, { rpm: 760, damage: 29, mobility: 0.95 }],
  ['ar_brine', 'ar', 'Brine BR', 'FAL-style battle rifle', 52, { auto: false, damage: 48, rpm: 420, magSize: 20 }],
  ['ar_osprey', 'ar', 'Osprey 55', 'SG-552-style carbine', 58, { rpm: 740, damage: 29 }],
  ['ar_marlin', 'ar', 'Marlin 10', 'AR-10-style rifle', 64, { damage: 38, rpm: 560, magSize: 25 }],
  ['ar_gale', 'ar', 'Gale ACR', 'ACR-style modular rifle', 70, { rpm: 690, recoil: [P(0.42, 0.12), P(0.45, -0.14)] }],
  ['smg_pike', 'smg', 'Pike 40', 'MP40-style SMG', 38, { rpm: 550, damage: 31 }],
  ['smg_thistle', 'smg', 'Thistle 61', 'Skorpion-style machine pistol', 47, { rpm: 1000, damage: 21, magSize: 20, mobility: 1.04 }],
  ['smg_glint', 'smg', 'Glint MPX', 'MPX-style SMG', 55, { rpm: 850, damage: 25, adsTime: 0.16 }],
  ['smg_rook', 'smg', 'Rook Helix', 'Bizon-style helical mag SMG', 62, { magSize: 64, rpm: 700, damage: 24 }],
  ['smg_sten', 'smg', 'Wicket Mk2', 'Sten-style side-mag SMG', 74, { rpm: 560, damage: 30 }],
  ['smg_spindle', 'smg', 'Spindle 10', 'MAC-10-style SMG', 80, { rpm: 1150, damage: 20, magSize: 30 }],
  ['lmg_anvil', 'lmg', 'Anvil PK', 'PKM-style gpmg', 57, { damage: 36, rpm: 650 }],
  ['lmg_millstone', 'lmg', 'Millstone Mk1', 'Bren-style top-mag LMG', 66, { magSize: 30, rpm: 520, damage: 40, reloadTime: 3.2 }],
  ['lmg_rampart', 'lmg', 'Rampart 4', 'MG4-style LMG', 76, { rpm: 790, damage: 30 }],
  ['lmg_talus', 'lmg', 'Talus 63', 'Stoner-63-style LMG', 86, { rpm: 720, damage: 31, mobility: 0.88 }],
  ['sg_breaker', 'shotgun', 'Breaker 12', 'SPAS-12-style pump/auto', 49, { rpm: 110, damage: 14, magSize: 8 }],
  ['sg_hound', 'shotgun', 'Hound KS', 'KSG-style bullpup pump', 59, { magSize: 12, rpm: 80, damage: 13 }],
  ['sg_sawn', 'shotgun', 'Sawn Coach', 'Sawn-off double barrel (secondary)', 68, { rpm: 300, magSize: 2, damage: 17, rangeNear: 5, rangeFar: 12, mobility: 1.02 }],
  ['sg_cairn', 'shotgun', 'Cairn A12', 'AA-12-style full-auto shotgun', 84, { auto: true, rpm: 300, magSize: 8, damage: 9 }],
  ['dmr_brigand', 'marksman', 'Brigand 3', 'G3-marksman-style rifle', 53, { damage: 58, rpm: 280, magSize: 20 }],
  ['dmr_needle', 'marksman', 'Needle 45', 'SKS-style carbine', 61, { damage: 50, rpm: 330, magSize: 10 }],
  ['dmr_sparrow', 'marksman', 'Sparrow M1', 'Garand-style semi rifle', 71, { damage: 60, rpm: 260, magSize: 8 }],
  ['dmr_umber', 'marksman', 'Umber DMR', 'FAL-DMR-style rifle', 82, { damage: 57, rpm: 300 }],
  ['sr_harrow', 'sniper', 'Harrow 91', 'Mosin-style bolt rifle', 43, { damage: 115, rpm: 45, magSize: 5 }],
  ['sr_hush', 'sniper', 'Hush VS', 'VSS-style integrally suppressed', 63, { damage: 60, rpm: 500, auto: true, magSize: 20, rangeNear: 30, rangeFar: 70 }],
  ['sr_rampike', 'sniper', 'Rampike 98', 'Kar98-style bolt rifle', 73, { damage: 120, rpm: 52, adsTime: 0.36 }],
  ['sr_gantry', 'sniper', 'Gantry L9', 'L96-style bolt rifle', 88, { damage: 118, rpm: 48, magSize: 10 }],
  ['pi_mote', 'pistol', 'Mote 22', 'Suppressed .22 pistol', 31, { damage: 22, rpm: 480, magSize: 10 }],
  ['pi_ridge', 'pistol', 'Ridge 26', 'P226-style pistol', 44, { damage: 30, rpm: 400, magSize: 15 }],
  ['pi_brass', 'pistol', 'Brass PM', 'Makarov-style compact', 54, { damage: 26, rpm: 450, magSize: 8, mobility: 1.07 }],
  ['pi_lug', 'pistol', 'Lugwrench P8', 'Toggle-lock pistol', 67, { damage: 32, rpm: 360 }],
  ['pi_shard', 'pistol', 'Shard 57', 'FN-57-style PDW pistol', 78, { damage: 25, rpm: 480, magSize: 20 }],
  ['ln_bolt', 'launcher', 'Bolt RR', 'Recoilless rifle', 51, { damage: 170, splash: 5, reloadTime: 4.2 }],
  ['ln_hail', 'launcher', 'Hail 6', 'Revolver grenade launcher', 69, { magSize: 6, reserve: 6, rpm: 90, damage: 110, splash: 3.5 }],
  ['ln_harpoon', 'launcher', 'Harpoon LW', 'Disposable light AT tube', 90, { damage: 180, splash: 5, reserve: 0 }],
  ['sp_machete', 'special', 'Brush Machete', 'Machete (melee)', 35, { rpm: 80 }],
  ['sp_baton', 'special', 'Riot Baton', 'Telescopic baton (melee)', 48, { rpm: 110, damage: 55 }],
  ['sp_shovel', 'special', 'Trench Spade', 'Entrenching tool (melee)', 58, { rpm: 75 }],
  ['sp_trench', 'special', 'Knuckle Blade', 'Trench knife (melee)', 72, { rpm: 100, mobility: 1.1 }],
  ['sp_bow', 'special', 'Recurve Hunter', 'Compound bow', 60, { damage: 150, rangeNear: 30, rangeFar: 60, magSize: 1, reserve: 8, reloadTime: 0.9, adsTime: 0.25 }],
  ['sp_nailer', 'special', 'Nailer 9', 'Pneumatic nail gun', 65, { damage: 30, rangeNear: 8, rangeFar: 20, magSize: 40, reserve: 120, rpm: 700, auto: true, reloadTime: 2 }],
  ['sp_flare', 'special', 'Signal Flare', 'Flare pistol', 81, { damage: 90, rangeNear: 40, rangeFar: 60, magSize: 1, reserve: 4, reloadTime: 1.8, splash: 1.5 }],
  ['sp_ballistic', 'special', 'Spring Blade', 'Ballistic knife', 93, { damage: 100, rangeNear: 15, rangeFar: 20, magSize: 1, reserve: 3, reloadTime: 1.4 }],
  ['sp_grapple', 'special', 'Hookline', 'Grapple launcher (utility)', 97, { damage: 20 }],
];

export const WEAPON_LIST: WeaponDef[] = ROWS.map(([id, cls, name, inspiration, unlockLevel, over]) => {
  const base = BASE[cls];
  return { id, cls, name, inspiration, unlockLevel, primary: base.primary, slots: base.slots, stats: { ...base.stats, ...over } };
});

export const WEAPONS: Record<string, WeaponDef> = Object.fromEntries(WEAPON_LIST.map((w) => [w.id, w]));
/** Compact numeric index used on the wire. */
export const WEAPON_INDEX: Record<string, number> = Object.fromEntries(WEAPON_LIST.map((w, i) => [w.id, i]));

// ---------------------------------------------------------------------------------------------
// Attachments — 9 slots, several options each, all with real tradeoffs. Unlocked by weapon level.
export type ModKey = 'damage' | 'rangeNear' | 'rangeFar' | 'rpm' | 'magSize' | 'reloadTime' | 'adsTime' | 'adsZoom' | 'hipSpread' | 'adsSpread'
  | 'mobility' | 'recoilV' | 'recoilH' | 'bulletVelocity' | 'aimStability' | 'sprintToFire' | 'penetration' | 'headMult' | 'swapTime';

export interface AttachmentDef {
  id: string;
  slot: AttachmentSlot;
  name: string;
  /** Weapon level (1..WEAPON_MAX_LEVEL) that unlocks it on each weapon. */
  weaponLevel: number;
  /** Multiplicative modifiers (1 = unchanged). */
  mod: Partial<Record<ModKey, number>>;
  /** Restrict to these weapon classes (default: any weapon with the slot). */
  classes?: WeaponClass[];
  /** Hides the shooter from radar when firing. */
  suppressed?: boolean;
}

const A = (id: string, slot: AttachmentSlot, name: string, weaponLevel: number, mod: AttachmentDef['mod'], extra: Partial<AttachmentDef> = {}): AttachmentDef => ({ id, slot, name, weaponLevel, mod, ...extra });

export const ATTACHMENTS: AttachmentDef[] = [
  // Optics: zoom vs ADS speed
  A('red_dot', 'optic', 'Pinpoint Reflex', 2, { adsTime: 1.02 }),
  A('holo', 'optic', 'Halo Holographic', 5, { adsZoom: 0.95, adsTime: 1.03 }),
  A('mini_prism', 'optic', '2.5x Mini Prism', 9, { adsZoom: 0.82, adsTime: 1.07, aimStability: 1.05 }),
  A('acog', 'optic', '4x Prism', 14, { adsZoom: 0.7, adsTime: 1.12, aimStability: 1.1 }),
  A('thermal', 'optic', 'Heatline Thermal', 22, { adsZoom: 0.75, adsTime: 1.15 }),
  A('var_scope', 'optic', '8x Variable Scope', 18, { adsZoom: 0.4, adsTime: 1.2, aimStability: 1.25 }, { classes: ['marksman', 'sniper', 'ar'] }),
  // Muzzles: recoil / radar vs range / ADS
  A('suppressor', 'muzzle', 'Hush Suppressor', 4, { rangeFar: 0.9, recoilV: 0.96, adsTime: 1.04 }, { suppressed: true }),
  A('heavy_supp', 'muzzle', 'Monolith Suppressor', 20, { rangeNear: 1.05, rangeFar: 1.05, adsTime: 1.1, mobility: 0.98 }, { suppressed: true }),
  A('comp', 'muzzle', 'Flat Compensator', 7, { recoilV: 0.85, recoilH: 1.05 }),
  A('brake', 'muzzle', 'Split Muzzle Brake', 12, { recoilH: 0.82, adsTime: 1.03 }),
  A('flash_hider', 'muzzle', 'Flash Guard', 3, { recoilV: 0.95 }),
  A('choke', 'muzzle', 'Tight Choke', 6, { hipSpread: 0.75, adsSpread: 0.75, rangeNear: 1.2 }, { classes: ['shotgun'] }),
  // Barrels: range/velocity vs handling
  A('long_barrel', 'barrel', 'Extended Barrel', 3, { rangeNear: 1.2, rangeFar: 1.15, bulletVelocity: 1.2, adsTime: 1.08, mobility: 0.98 }),
  A('heavy_barrel', 'barrel', 'Fluted Heavy Barrel', 16, { rangeNear: 1.12, recoilV: 0.92, adsTime: 1.1, mobility: 0.97 }),
  A('short_barrel', 'barrel', 'Snub Barrel', 8, { hipSpread: 0.85, rangeFar: 0.85, bulletVelocity: 0.85, mobility: 1.03, adsTime: 0.95 }),
  A('rapid_barrel', 'barrel', 'Rapid-Fire Barrel', 24, { rpm: 1.1, rangeNear: 0.9, recoilV: 1.08 }, { classes: ['ar', 'smg', 'lmg'] }),
  // Underbarrel: recoil vs ADS/mobility
  A('grip', 'underbarrel', 'Vertical Grip', 6, { recoilV: 0.82, adsTime: 1.05 }),
  A('angled', 'underbarrel', 'Angled Grip', 10, { adsTime: 0.93, recoilV: 0.95 }),
  A('bipod', 'underbarrel', 'Folding Bipod', 15, { recoilV: 0.88, recoilH: 0.88, mobility: 0.96 }),
  A('stub_grip', 'underbarrel', 'Stubby Grip', 19, { recoilH: 0.8, hipSpread: 0.95, adsTime: 1.04 }),
  // Magazines: capacity vs reload/mobility
  A('ext_mag', 'magazine', 'Extended Mag', 4, { magSize: 1.5, reloadTime: 1.1, mobility: 0.99, adsTime: 1.03 }),
  A('drum_mag', 'magazine', 'Drum Mag', 21, { magSize: 2.0, reloadTime: 1.35, mobility: 0.96, adsTime: 1.08 }, { classes: ['ar', 'smg', 'lmg', 'shotgun'] }),
  A('fast_mag', 'magazine', 'Quick Mag', 11, { reloadTime: 0.7 }),
  A('light_mag', 'magazine', 'Polymer Mag', 25, { mobility: 1.02, magSize: 0.85, reloadTime: 0.9 }),
  // Rear grips: stability/ADS
  A('stipple', 'reargrip', 'Stippled Grip', 5, { adsTime: 0.96, aimStability: 0.9 }),
  A('rubber', 'reargrip', 'Rubberised Grip', 13, { recoilH: 0.9, sprintToFire: 1.05 }),
  A('slick', 'reargrip', 'Slick Grip', 23, { sprintToFire: 0.85, swapTime: 0.9, recoilV: 1.04 }),
  // Stocks: recoil vs mobility
  A('light_stock', 'stock', 'Skeleton Stock', 5, { mobility: 1.04, adsTime: 0.92, recoilV: 1.1 }),
  A('heavy_stock', 'stock', 'Padded Stock', 12, { recoilV: 0.85, recoilH: 0.9, mobility: 0.97, adsTime: 1.05 }),
  A('no_stock', 'stock', 'Stock Removed', 17, { mobility: 1.07, adsTime: 0.85, recoilV: 1.25, aimStability: 1.3 }),
  // Lasers: hip vs visibility
  A('laser', 'laser', 'Tac Laser', 10, { hipSpread: 0.7 }),
  A('ads_laser', 'laser', 'Aim Laser', 14, { adsTime: 0.9, sprintToFire: 0.9 }),
  A('ir_laser', 'laser', 'IR Laser', 26, { hipSpread: 0.85, adsTime: 0.95 }),
  // Ammunition types
  A('fmj', 'ammo', 'Full Metal Jacket', 9, { penetration: 1.6, damage: 0.97 }),
  A('hollow', 'ammo', 'Hollow Point', 20, { damage: 1.08, rangeFar: 0.9, penetration: 0.5 }),
  A('subsonic', 'ammo', 'Subsonic Rounds', 15, { bulletVelocity: 0.7 }, { suppressed: true }),
  A('hv_rounds', 'ammo', 'High-Velocity Rounds', 27, { bulletVelocity: 1.35, recoilV: 1.05 }),
  A('slugs', 'ammo', 'Slug Rounds', 18, { damage: 5.5, rangeNear: 3, rangeFar: 3 }, { classes: ['shotgun'] }),
];
export const ATTACHMENT_BY_ID: Record<string, AttachmentDef> = Object.fromEntries(ATTACHMENTS.map((a) => [a.id, a]));

export const WEAPON_MAX_LEVEL = 30;

/** Attachments that fit a weapon. */
export function attachmentsFor(w: WeaponDef): AttachmentDef[] {
  return ATTACHMENTS.filter((a) => w.slots.includes(a.slot) && (!a.classes || a.classes.includes(w.cls)));
}

/** Validate an attachment set against slots, the 5-attachment limit and (optionally) weapon level. */
export function attachmentErrors(w: WeaponDef, ids: string[], weaponLevel = WEAPON_MAX_LEVEL): string[] {
  const errs: string[] = [];
  if (ids.length > MAX_ATTACHMENTS) errs.push(`max ${MAX_ATTACHMENTS} attachments`);
  const slots = new Set<AttachmentSlot>();
  for (const id of ids) {
    const a = ATTACHMENT_BY_ID[id];
    if (!a) { errs.push(`unknown attachment ${id}`); continue; }
    if (!w.slots.includes(a.slot) || (a.classes && !a.classes.includes(w.cls))) errs.push(`${a.name} does not fit ${w.name}`);
    if (slots.has(a.slot)) errs.push(`two ${a.slot} attachments`);
    slots.add(a.slot);
    if (a.weaponLevel > weaponLevel) errs.push(`${a.name} unlocks at ${w.name} level ${a.weaponLevel}`);
  }
  return errs;
}

/** Apply attachments to a weapon's stats. Invalid/incompatible attachments are ignored. */
export function applyAttachments(w: WeaponDef, attachmentIds: string[]): WeaponStats {
  const s: WeaponStats = { ...w.stats, recoil: w.stats.recoil.map((r) => ({ ...r })) };
  const seen = new Set<AttachmentSlot>();
  for (const id of attachmentIds.slice(0, MAX_ATTACHMENTS)) {
    const a = ATTACHMENT_BY_ID[id];
    if (!a || !w.slots.includes(a.slot) || (a.classes && !a.classes.includes(w.cls)) || seen.has(a.slot)) continue;
    seen.add(a.slot);
    for (const [k, m] of Object.entries(a.mod) as [ModKey, number][]) {
      if (k === 'recoilV') s.recoil = s.recoil.map((r) => ({ pitch: r.pitch * m, yaw: r.yaw }));
      else if (k === 'recoilH') s.recoil = s.recoil.map((r) => ({ pitch: r.pitch, yaw: r.yaw * m }));
      else if (k === 'magSize') s.magSize = Math.max(1, Math.round(s.magSize * m));
      else (s[k] as number) *= m;
    }
  }
  return s;
}

/** Damage for one bullet at a given distance, with falloff and hit zone. */
export function damageAt(s: WeaponStats, dist: number, zone: 'head' | 'body' | 'limb'): number {
  let mult = 1;
  if (dist > s.rangeNear) {
    const t = Math.min(1, (dist - s.rangeNear) / Math.max(0.001, s.rangeFar - s.rangeNear));
    mult = 1 + (s.minDamageMult - 1) * t;
  }
  const zm = zone === 'head' ? s.headMult : zone === 'limb' ? 0.85 : 1;
  return s.damage * mult * zm;
}

/** Minimum seconds between shots (burst weapons fire their burst at rpm). */
export function fireInterval(s: WeaponStats): number {
  return 60 / s.rpm;
}
