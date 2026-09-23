// Central balancing and tuning values. Gameplay code reads from here rather than hard-coding numbers.

export type RegionId = 'low' | 'medium' | 'high';
export type ZombieType = 'shambler' | 'runner' | 'armored' | 'elite' | 'brute' | 'crawler' | 'fast' | 'boss';
/** Extraction-mode weapons (kept stable) plus the Zombies roster. Zombies ids match the GLB file names in public/models/weapons/. */
export type WeaponId = 'rifle' | 'pistol' | 'shotgun'
  | 'ar_kestrel' | 'ar_corvid' | 'ar_moraine' | 'ar_tern' | 'smg_wren' | 'smg_fennec' | 'smg_skiff' | 'sg_hullbreaker' | 'sg_tidal'
  | 'lmg_bastion' | 'dmr_sentry' | 'sr_longwatch' | 'br_drover' | 'pi_warden' | 'pi_basalt' | 'pi_magnus' | 'ln_lotus'
  | 'ww_arc' | 'ww_singularity' | 'ww_cryo';
/** Procedural viewmodel / audio archetype a weapon borrows when no GLB exists. */
export type WeaponArch = 'rifle' | 'pistol' | 'shotgun';
export type WeaponClass = 'ar' | 'smg' | 'shotgun' | 'lmg' | 'dmr' | 'sniper' | 'pistol' | 'launcher' | 'wonder';
export type WeaponSpecial = 'explosive' | 'arc' | 'singularity' | 'cryo';

export const SIM_DT = 1 / 60;
export const MAX_FRAME_DT = 0.1;

export const WORLD = {
  minX: -70,
  maxX: 70,
  minZ: -110,
  maxZ: 100,
  gravity: 17,
};

export const PLAYER = {
  radius: 0.3,
  standHeight: 1.75,
  crouchHeight: 1.1,
  eyeOffset: 0.12,
  walkSpeed: 4.6,
  sprintSpeed: 7.1,
  crouchSpeed: 2.3,
  adsSpeed: 2.9,
  groundAccel: 55,
  airAccel: 9,
  friction: 10,
  jumpVelocity: 5.4,
  stepHeight: 0.45,
  maxHealth: 100,
  healthRegenDelay: 4.5,
  healthRegenRate: 22,
  maxStamina: 100,
  staminaDrain: 17,
  staminaRegen: 26,
  staminaRegenDelay: 1.0,
  staminaMinToSprint: 22,
  plateArmor: 50,
  maxArmorPlates: 3, // plates slotted into the vest (3 x 50 = 150 armor)
  maxPlateInventory: 5,
  plateApplyTime: 1.25,
  maxGrenades: 4,
  startPlatesInVest: 2,
  startPlateInventory: 2,
  startGrenades: 2,
  startCash: 500,
  // Slide: sprint + crouch. Boost, then low-friction decay; no steering.
  slideSpeed: 9.4,
  slideTime: 0.75,
  slideFriction: 2.2,
  slideCooldown: 0.6,
  // Mantle: jump into a ledge between these heights (relative to feet) to climb it.
  mantleMin: 0.55,
  mantleMax: 1.9,
  mantleReach: 0.55,
  mantleTime: 0.32,
};

export interface WeaponDef {
  id: WeaponId;
  name: string;
  shortName: string;
  auto: boolean;
  damage: number;
  headMult: number;
  pellets: number;
  rpm: number;
  magSize: number;
  reserveMax: number;
  startReserve: number;
  reloadTime: number;
  /** Shell-by-shell reload timing (shotgun). */
  shellReload?: { start: number; perShell: number; end: number };
  hipSpread: number; // degrees (cone half-angle)
  adsSpread: number;
  moveSpread: number;
  rangeNear: number;
  rangeFar: number;
  minDamageMult: number;
  recoilPitch: number; // degrees per shot
  recoilYaw: number;
  recoilRecover: number; // degrees/s
  adsTime: number;
  adsZoom: number; // FOV multiplier while aiming
  switchTime: number;
  cost: number;
  /** Procedural fallback archetype (viewmodel + sound). Defaults to the id for the extraction guns. */
  arch?: WeaponArch;
  cls?: WeaponClass;
  special?: WeaponSpecial;
  /** GLB model id (public/models/weapons/<modelId>.glb). Extraction guns alias the zombies ids. */
  modelId?: string;
  /** Tint of the procedural body so classes read differently without a GLB. */
  tint?: number;
  /** Procedural length scale (smg short, lmg/sniper long). */
  lengthScale?: number;
}

export const WEAPONS = {
  rifle: {
    id: 'rifle',
    name: 'KR-7 KESTREL',
    shortName: 'KESTREL',
    auto: true,
    damage: 32,
    headMult: 2.2,
    pellets: 1,
    rpm: 720,
    magSize: 30,
    reserveMax: 210,
    startReserve: 150,
    reloadTime: 2.1,
    hipSpread: 2.4,
    adsSpread: 0.35,
    moveSpread: 1.8,
    rangeNear: 30,
    rangeFar: 75,
    minDamageMult: 0.65,
    recoilPitch: 0.55,
    recoilYaw: 0.28,
    recoilRecover: 9,
    adsTime: 0.22,
    adsZoom: 0.72,
    switchTime: 0.45,
    cost: 0,
  },
  pistol: {
    id: 'pistol',
    name: 'P-19 WARDEN',
    shortName: 'WARDEN',
    auto: false,
    damage: 44,
    headMult: 2.4,
    pellets: 1,
    rpm: 420,
    magSize: 12,
    reserveMax: 96,
    startReserve: 60,
    reloadTime: 1.35,
    hipSpread: 1.5,
    adsSpread: 0.4,
    moveSpread: 1.0,
    rangeNear: 18,
    rangeFar: 45,
    minDamageMult: 0.6,
    recoilPitch: 1.3,
    recoilYaw: 0.35,
    recoilRecover: 12,
    adsTime: 0.15,
    adsZoom: 0.82,
    switchTime: 0.3,
    cost: 0,
  },
  shotgun: {
    id: 'shotgun',
    name: 'HB-12 HULLBREAKER',
    shortName: 'HULLBREAKER',
    auto: false,
    damage: 21,
    headMult: 1.6,
    pellets: 9,
    rpm: 72,
    magSize: 6,
    reserveMax: 42,
    startReserve: 30,
    reloadTime: 0, // unused - shell reload
    shellReload: { start: 0.35, perShell: 0.48, end: 0.4 },
    hipSpread: 5.2,
    adsSpread: 3.6,
    moveSpread: 0.8,
    rangeNear: 7,
    rangeFar: 22,
    minDamageMult: 0.3,
    recoilPitch: 4.2,
    recoilYaw: 0.8,
    recoilRecover: 14,
    adsTime: 0.26,
    adsZoom: 0.85,
    switchTime: 0.5,
    cost: 1500,
  },
} as Record<WeaponId, WeaponDef>;

// ---------------------------------------------------------------------------------------------
// Zombies roster (original names). Stats are tuned for round-based play, not extraction.
// ---------------------------------------------------------------------------------------------
type Base = Omit<WeaponDef, 'id' | 'name' | 'shortName'>;
const AR: Base = { ...WEAPONS.rifle, arch: 'rifle', cls: 'ar', cost: 0 };
const PI: Base = { ...WEAPONS.pistol, arch: 'pistol', cls: 'pistol', cost: 0 };
const SG: Base = { ...WEAPONS.shotgun, arch: 'shotgun', cls: 'shotgun', cost: 0 };
function zw(id: WeaponId, name: string, shortName: string, base: Base, o: Partial<WeaponDef>): WeaponDef {
  return { ...base, ...o, id, name, shortName, modelId: o.modelId ?? id };
}


export const ZOMBIE_WEAPONS: Record<string, WeaponDef> = {
  ar_kestrel: zw('ar_kestrel', 'KR-7 KESTREL', 'KESTREL', AR, {}),
  ar_corvid: zw('ar_corvid', 'CV-4 CORVID', 'CORVID', AR, { damage: 40, rpm: 560, magSize: 25, reserveMax: 200, startReserve: 150, recoilPitch: 0.7, tint: 0x3a3226 }),
  ar_moraine: zw('ar_moraine', 'MR-9 MORAINE', 'MORAINE', AR, { damage: 46, rpm: 520, magSize: 30, reserveMax: 240, startReserve: 180, recoilPitch: 0.85, recoilYaw: 0.4, tint: 0x2e3a2c, lengthScale: 1.08 }),
  ar_tern: zw('ar_tern', 'TN-2 TERN', 'TERN', AR, { damage: 29, rpm: 820, magSize: 35, reserveMax: 280, startReserve: 210, recoilPitch: 0.45, tint: 0x40444c }),
  smg_wren: zw('smg_wren', 'W-9 WREN', 'WREN', AR, { cls: 'smg', damage: 21, rpm: 900, magSize: 32, reserveMax: 256, startReserve: 192, hipSpread: 1.9, rangeNear: 12, rangeFar: 35, reloadTime: 1.8, adsTime: 0.17, tint: 0x2a2a30, lengthScale: 0.7 }),
  smg_fennec: zw('smg_fennec', 'FX-45 FENNEC', 'FENNEC', AR, { cls: 'smg', damage: 20, rpm: 1100, magSize: 25, reserveMax: 250, startReserve: 175, hipSpread: 1.7, rangeNear: 10, rangeFar: 30, reloadTime: 1.6, recoilPitch: 0.35, tint: 0x8a7a5a, lengthScale: 0.65 }),
  smg_skiff: zw('smg_skiff', 'SK-5 SKIFF', 'SKIFF', AR, { cls: 'smg', damage: 27, rpm: 760, magSize: 40, reserveMax: 280, startReserve: 200, hipSpread: 2, rangeNear: 14, rangeFar: 38, reloadTime: 2.0, tint: 0x3c4450, lengthScale: 0.75 }),
  sg_hullbreaker: zw('sg_hullbreaker', 'HB-12 HULLBREAKER', 'HULLBREAKER', SG, {}),
  sg_tidal: zw('sg_tidal', 'TD-8 TIDAL', 'TIDAL', SG, { damage: 18, rpm: 210, magSize: 8, reserveMax: 64, startReserve: 40, pellets: 8, recoilPitch: 3.2, tint: 0x2c3a44 }),
  lmg_bastion: zw('lmg_bastion', 'BX-100 BASTION', 'BASTION', AR, { cls: 'lmg', damage: 38, rpm: 640, magSize: 100, reserveMax: 400, startReserve: 300, reloadTime: 4.8, hipSpread: 3.4, adsTime: 0.34, switchTime: 0.8, recoilPitch: 0.6, tint: 0x3a3c30, lengthScale: 1.22 }),
  dmr_sentry: zw('dmr_sentry', 'SN-14 SENTRY', 'SENTRY', AR, { cls: 'dmr', auto: false, damage: 95, headMult: 2.6, rpm: 330, magSize: 15, reserveMax: 120, startReserve: 90, rangeNear: 60, rangeFar: 120, minDamageMult: 0.8, recoilPitch: 1.8, adsZoom: 0.55, tint: 0x4a4436, lengthScale: 1.15 }),
  sr_longwatch: zw('sr_longwatch', 'LW-50 LONGWATCH', 'LONGWATCH', AR, { cls: 'sniper', auto: false, damage: 320, headMult: 3, rpm: 48, magSize: 5, reserveMax: 40, startReserve: 30, reloadTime: 3.2, hipSpread: 6, adsSpread: 0.05, rangeNear: 100, rangeFar: 200, minDamageMult: 0.9, recoilPitch: 5, adsTime: 0.38, adsZoom: 0.35, tint: 0x3a4232, lengthScale: 1.3 }),
  // Starter bolt-action: one body shot drops an early-round walker, but it cycles slowly (low DPS). Borrows the
  // Longwatch model until it gets its own.
  br_drover: zw('br_drover', 'BR-7 DROVER', 'DROVER', AR, { cls: 'dmr', modelId: 'sr_longwatch', auto: false, damage: 135, headMult: 2.5, rpm: 52, magSize: 5, reserveMax: 50, startReserve: 35, reloadTime: 2.6, hipSpread: 3.2, adsSpread: 0.12, rangeNear: 60, rangeFar: 120, minDamageMult: 0.85, recoilPitch: 3.2, adsTime: 0.28, adsZoom: 0.7, tint: 0x5a4630, lengthScale: 1.2 }),
  pi_warden: zw('pi_warden', 'P-19 WARDEN', 'WARDEN', PI, {}),
  pi_basalt: zw('pi_basalt', 'BS-1 BASALT', 'BASALT', PI, { damage: 115, headMult: 2.5, rpm: 170, magSize: 6, reserveMax: 48, startReserve: 36, reloadTime: 2.4, recoilPitch: 4, tint: 0x5a5048 }),
  pi_magnus: zw('pi_magnus', 'MG-2 MAGNUS', 'MAGNUS', PI, { auto: true, damage: 24, rpm: 720, magSize: 20, reserveMax: 160, startReserve: 120, hipSpread: 2.2, recoilPitch: 0.9, tint: 0x26282c }),
  ln_lotus: zw('ln_lotus', 'LT-6 LOTUS', 'LOTUS', AR, { cls: 'launcher', special: 'explosive', auto: false, damage: 420, headMult: 1, rpm: 55, magSize: 1, reserveMax: 16, startReserve: 12, reloadTime: 2.6, hipSpread: 0.6, adsSpread: 0.2, rangeNear: 999, rangeFar: 1000, minDamageMult: 1, recoilPitch: 4, adsZoom: 0.8, tint: 0x3c4a2a, lengthScale: 1.05 }),
  ww_arc: zw('ww_arc', 'ARC LANCE', 'ARC LANCE', AR, { cls: 'wonder', special: 'arc', auto: false, damage: 900, headMult: 1, rpm: 110, magSize: 6, reserveMax: 30, startReserve: 30, reloadTime: 2.4, hipSpread: 0.4, adsSpread: 0.2, rangeNear: 60, rangeFar: 80, minDamageMult: 0.8, recoilPitch: 1.6, tint: 0x1a3a6a, lengthScale: 0.95 }),
  ww_singularity: zw('ww_singularity', 'VOID ANCHOR', 'VOID ANCHOR', AR, { cls: 'wonder', special: 'singularity', auto: false, damage: 250, headMult: 1, rpm: 50, magSize: 3, reserveMax: 12, startReserve: 12, reloadTime: 3.0, hipSpread: 0.4, adsSpread: 0.2, rangeNear: 999, rangeFar: 1000, minDamageMult: 1, recoilPitch: 3, tint: 0x3a1a5a }),
  ww_cryo: zw('ww_cryo', 'RIME PROJECTOR', 'RIME', AR, { cls: 'wonder', special: 'cryo', auto: true, damage: 60, headMult: 1, rpm: 600, magSize: 40, reserveMax: 200, startReserve: 200, hipSpread: 3, adsSpread: 2, rangeNear: 14, rangeFar: 18, minDamageMult: 0.2, recoilPitch: 0.2, tint: 0x5a8aa8, lengthScale: 0.9 }),
};
Object.assign(WEAPONS, ZOMBIE_WEAPONS);
WEAPONS.rifle.modelId = 'ar_kestrel';
WEAPONS.pistol.modelId = 'pi_warden';
WEAPONS.shotgun.modelId = 'sg_hullbreaker';

/** Procedural archetype for a weapon id. */
export function weaponArch(id: WeaponId): WeaponArch {
  return WEAPONS[id].arch ?? (id as WeaponArch);
}

/** Upgrade tiers: index 0 = base. */
export const UPGRADE_TIERS = [
  { name: 'STOCK', damageMult: 1, magMult: 1, reloadMult: 1, rpmMult: 1, spreadMult: 1, cost: 0 },
  { name: 'TIER I', damageMult: 1.65, magMult: 1.25, reloadMult: 0.85, rpmMult: 1.08, spreadMult: 0.85, cost: 2500 },
  { name: 'TIER II', damageMult: 2.5, magMult: 1.5, reloadMult: 0.7, rpmMult: 1.15, spreadMult: 0.7, cost: 5000 },
  // Zombies-only (the Reforger's third pass); the extraction bench stops at EXTRACTION_MAX_TIER.
  { name: 'TIER III', damageMult: 3.4, magMult: 1.75, reloadMult: 0.6, rpmMult: 1.22, spreadMult: 0.6, cost: 9000 },
];
/** The extraction upgrade bench tops out here; the Zombies Reforger goes to UPGRADE_TIERS.length - 1. */
export const EXTRACTION_MAX_TIER = 2;

export interface ZombieDef {
  hp: number;
  speed: [number, number];
  damage: number;
  attackRange: number;
  windup: number;
  attackCooldown: number;
  reward: number;
  scale: number;
  helmetHp: number;
  bodyArmorMult: number; // multiplier applied to body damage
  staggerThreshold: number; // damage in one hit that causes stagger
}

export const ZOMBIES: Record<ZombieType, ZombieDef> = {
  shambler: { hp: 110, speed: [1.35, 2.0], damage: 20, attackRange: 1.45, windup: 0.5, attackCooldown: 1.2, reward: 40, scale: 1, helmetHp: 0, bodyArmorMult: 1, staggerThreshold: 60 },
  runner: { hp: 85, speed: [4.3, 5.1], damage: 14, attackRange: 1.4, windup: 0.34, attackCooldown: 0.95, reward: 55, scale: 0.97, helmetHp: 0, bodyArmorMult: 1, staggerThreshold: 50 },
  armored: { hp: 300, speed: [1.8, 2.2], damage: 30, attackRange: 1.55, windup: 0.6, attackCooldown: 1.4, reward: 130, scale: 1.08, helmetHp: 140, bodyArmorMult: 0.55, staggerThreshold: 140 },
  elite: { hp: 3400, speed: [2.7, 2.9], damage: 42, attackRange: 2.3, windup: 0.8, attackCooldown: 1.7, reward: 0, scale: 1.4, helmetHp: 400, bodyArmorMult: 0.7, staggerThreshold: 99999 },
  // Zombies-mode roster
  brute: { hp: 420, speed: [1.6, 1.9], damage: 38, attackRange: 1.7, windup: 0.7, attackCooldown: 1.5, reward: 0, scale: 1.22, helmetHp: 120, bodyArmorMult: 0.6, staggerThreshold: 200 },
  crawler: { hp: 90, speed: [0.8, 1.1], damage: 12, attackRange: 1.2, windup: 0.45, attackCooldown: 1.1, reward: 0, scale: 1, helmetHp: 0, bodyArmorMult: 1, staggerThreshold: 80 },
  fast: { hp: 70, speed: [5.6, 6.3], damage: 10, attackRange: 1.35, windup: 0.25, attackCooldown: 0.8, reward: 0, scale: 0.92, helmetHp: 0, bodyArmorMult: 1, staggerThreshold: 60 },
  boss: { hp: 6000, speed: [2.4, 2.6], damage: 55, attackRange: 2.4, windup: 0.85, attackCooldown: 1.8, reward: 0, scale: 1.6, helmetHp: 600, bodyArmorMult: 0.75, staggerThreshold: 99999 },
};

export interface RegionDef {
  id: RegionId;
  label: string;
  threat: string;
  hpMult: number;
  damageMult: number;
  rewardMult: number;
  maxAlive: number;
  spawnInterval: number;
  weights: Record<'shambler' | 'runner' | 'armored', number>;
  initialPopulation: number;
  color: string;
}

export const REGIONS: Record<RegionId, RegionDef> = {
  low: {
    id: 'low', label: 'CHECKPOINT DISTRICT', threat: 'LOW THREAT', hpMult: 1, damageMult: 1, rewardMult: 1,
    maxAlive: 10, spawnInterval: 3.2, weights: { shambler: 0.82, runner: 0.18, armored: 0 },
    initialPopulation: 7, color: '#8fb573',
  },
  medium: {
    id: 'medium', label: 'KESSLER FREIGHT DEPOT', threat: 'MEDIUM THREAT', hpMult: 1.35, damageMult: 1.25, rewardMult: 1.6,
    maxAlive: 18, spawnInterval: 1.9, weights: { shambler: 0.52, runner: 0.36, armored: 0.12 },
    initialPopulation: 11, color: '#d8a64a',
  },
  high: {
    id: 'high', label: 'HALCYON RESEARCH COMPOUND', threat: 'HIGH THREAT', hpMult: 1.8, damageMult: 1.5, rewardMult: 2.4,
    maxAlive: 26, spawnInterval: 1.15, weights: { shambler: 0.3, runner: 0.42, armored: 0.28 },
    initialPopulation: 13, color: '#d0473c',
  },
};

/** z boundaries between threat regions (north is -Z). */
export const REGION_BOUNDS = { lowMinZ: 50, mediumMinZ: -26 };

export function regionAt(z: number): RegionId {
  if (z > REGION_BOUNDS.lowMinZ) return 'low';
  if (z > REGION_BOUNDS.mediumMinZ) return 'medium';
  return 'high';
}

export const ENEMIES = {
  globalCap: 38,
  hordeCap: 28,
  spawnMinDist: 22,
  spawnMaxDist: 58,
  corpseLifetime: 7,
  maxCorpses: 14,
  separationRadius: 0.75,
  sightRange: 26,
  hearingRange: 48,
  flowFieldInterval: 0.2,
  losCheckInterval: 0.3,
  ammoDropChance: 0.07,
  headshotBonus: 20,
};

export const ECONOMY = {
  ammoCost: 400,
  plateCost: 250,
  grenadeCost: 250,
  shotgunCost: WEAPONS.shotgun.cost,
  plateOverflowCash: 100,
};

export const MISSION = {
  deadline: 900, // 15:00 total mission clock
  finalPhaseWindow: 330, // once both contracts complete, the remaining window is clamped to this
  forcedFinalPhaseAt: 600, // contamination starts at 10:00 regardless
  defenseHoldTime: 60,
  defenseRadius: 9,
  defenseDecay: 0.004, // progress fraction lost per second when outside the zone
  defenseReward: 1500,
  huntReward: 2000,
  extractionCountdown: 75,
  heliVisibleAt: 28, // seconds before landing that the helicopter becomes visible
  boardRadius: 3.2,
  radioRadius: 2.6,
  contaminationDps: 9,
  contaminationStartRadius: 22,
};

export const GRENADE = {
  fuse: 2.4,
  throwSpeed: 14,
  radius: 7.5,
  maxDamage: 380,
  playerDamageMult: 0.35,
  bounce: 0.38,
};

export const PERF = {
  maxDecals: 90,
  maxParticles: 900,
  maxTracers: 24,
  maxAudioVoices: 36,
};
