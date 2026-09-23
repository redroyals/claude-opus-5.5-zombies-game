// Round-based Zombies mode runtime on a data-driven map (./maps, docs/MAP_API.md). Owns the round director,
// points, zones/doors/barricades, machines, power-ups, wonder-weapon effects and the easter egg.
// All rules live in pure modules (./rules, ./zones, ./powerups, ./egg, ./summary); this file is the glue.
import * as THREE from 'three';
import { PLAYER, UPGRADE_TIERS, WEAPONS, type WeaponId } from '../config';
import type { AudioEngine } from '../audio/Audio';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { Zombie } from '../enemies/Zombie';
import type { Effects } from '../fx/Effects';
import type { Loadout } from '../mission/Economy';
import type { Materials } from '../render/materials';
import type { Vitals } from '../player/Vitals';
import { WEAPON_MODS, applyUpgrade, createWeapon, effectiveStats, refillAmmo } from '../weapons/WeaponState';
import {
  SPRINTER_SPEED_MULT, BOX_PRICE, ELEMENT_FX, PAP_CAMOS, PAP_ELEMENT, PAP_SECONDS, PERKS, POINTS, WALL_BUYS, addPerkSlots, awardHit, awardKill,
  bossHpForRound, boxReel, createBox, createRoundState, createZPlayer, grantPerk, makeSchedule, papName, papPrice, perkMods, pickZombieType, pullBox,
  revealBox, rollElement, roundBonus, stepBox, stepRounds, takeBoxOffer, tryBuyPerk, tryPap, trySpend, wallBuyPrice, wonderBonus,
  type BoxState, type Element, type PerkId, type PerkMods, type RoundState, type SpendResult, type WallBuyKey, type ZPlayer,
} from './rules';
import { pickRevealSpot, revealDue } from './progression';
import {
  benchBlock, build, createBuildState, pickPart, shieldAbsorb, shieldBlock, shieldLost, stepBuild, takeShield, type BuildState,
} from './buildables';
import { TRAP_DEFAULTS, TRAP_ELITE_FRAC, TRAP_PLAYER_DPS, activateTrap, createTrapState, inTrap, stepTrap, trapBlock, type TrapState } from './traps';
import { NOVA, muleRotate, novaDamage } from './perkfx';
import {
  PLANKS, REPAIR_SECONDS, activeWindows, buyDoor, canOpenDoor, createZoneState, onRoundStartZones, rebuildAll, repairPlank,
  tearPlank, unlockedZones, type MapTopology, type ZoneState,
} from './zones';
import {
  POWERUP, POWERUP_INFO, activate, createPowerUps, isActive, onRoundStart, pointsMult, rollDrop, stepPowerUps, type PowerUpKind, type PowerUpState,
} from './powerups';
import { PERK_ORDER, allEggs, frontOf, perkEntries, topologyOf, zoneAt, zoneName, type EggDef, type RideDef, type Spot, type ZombiesMapDef } from './mapdef';
import { rideBlock, ridePosition, type RideCtx } from './rides';
import { DOWN, beginDown, downStatus, hitWhileDown, lastStandPick, stepDown, type DownState } from './down';
import { createEggRun, currentStep, eggCollect, eggInteract, eggKill, pendingObjects, stepProgress, type EggEvent, type EggRun } from './egg';
import { getMap, type ZombiesMapEntry } from './maps';
import { ZombiesMap } from './ZombiesMap';
import { CacheView, PerkViews, PowerSwitchView, ReforgerView, buildChalk, buildPickup, updatePickup, type PickupView } from './Machines';
import { BuildViews, TrapViews } from './Contraptions';
import type { WeaponState } from '../weapons/WeaponState';
import type { ZRunStats } from './summary';

type P3 = { x: number; y: number; z: number };
export type ZInteraction =
  | { kind: 'wall'; key: WallBuyKey }
  | { kind: 'box' }
  | { kind: 'pap' }
  | { kind: 'perk'; id: PerkId }
  | { kind: 'power' }
  | { kind: 'door'; id: string }
  | { kind: 'window'; w: number }
  | { kind: 'relic'; i: number; egg?: number }
  | { kind: 'ride'; id: string }
  | { kind: 'part'; b: number; i: number }
  | { kind: 'bench'; b: number }
  | { kind: 'trap'; t: number };

/** Everything built for one map (cached so switching maps back and forth is instant). */
interface BuiltMap {
  map: ZombiesMap;
  root: THREE.Group;
  cache: CacheView;
  reforger: ReforgerView | null;
  perks: PerkViews;
  powerSwitch: PowerSwitchView | null;
  builds: BuildViews;
  traps: TrapViews;
}

export interface ZHost {
  enemies: EnemyManager;
  audio: AudioEngine;
  fx: Effects;
  loadout: () => Loadout;
  vitals: () => Vitals;
  syncWeapons: () => void;
  toast: (t: string, kind?: '' | 'big' | 'good' | 'bad', small?: string, dur?: number) => void;
  sound: (k: 'buy' | 'deny' | 'upgrade' | 'alert' | 'complete' | 'loot' | 'radio') => void;
  /** Blast at a point that hurts zombies only (Nova's slide). */
  blast?: (x: number, y: number, z: number, dmg: number, radius: number) => void;
  /** Damage the player (traps); `x/z` is where it comes from. */
  hurt?: (dmg: number, x: number, z: number) => void;
}

const REASON: Record<string, string> = { funds: 'NOT ENOUGH POINTS', owned: 'ALREADY OWNED', max: 'MAXED', limit: 'PERK LIMIT', busy: 'NOT YET', power: 'REQUIRES POWER' };

/** Player stats the perks scale (captured once so leaving Zombies restores them). */
const BASE_PLAYER = { sprintSpeed: PLAYER.sprintSpeed, staminaDrain: PLAYER.staminaDrain };
/** A burning zombie (fire rounds). */
interface Burn { z: Zombie; t: number; dps: number; tick: number }

interface Vortex { x: number; y: number; z: number; t: number; radius: number; dmg: number; mesh: THREE.Group }

export class ZombiesMode {
  readonly group = new THREE.Group();
  map!: ZombiesMap;
  def!: ZombiesMapDef;
  topo!: MapTopology;
  zp: ZPlayer = createZPlayer();
  rounds: RoundState = createRoundState();
  box: BoxState = createBox(0);
  zones!: ZoneState;
  pu: PowerUpState = createPowerUps();
  /** Main quest run (alias of eggRuns[0] when the map has a main egg). */
  egg!: EggRun;
  /** Every egg run: the main quest first (if any), then the side eggs (same order as allEggs(def)). */
  eggRuns: EggRun[] = [];
  eggDefs: EggDef[] = [];
  builds: BuildState[] = [];
  traps: TrapState[] = [];
  /** Hit points of the shield on your back (0 = none) and which buildable it came from. */
  shieldHp = 0;
  shieldMax = 0;
  private shieldFrom = -1;
  /** Packmule: the third weapon. */
  mule: WeaponState | null = null;
  /** Perk effects currently applied. */
  mods: PerkMods = perkMods([]);
  private burns: Burn[] = [];
  private novaCd = 0;
  private trapKilling = false;
  private trapTick = 0;
  /** Seconds the reveal flare still shows (HUD hint). */
  revealT = 0;
  power = false;
  /** Lights-out round in progress. */
  blackout = false;
  lifelineBuys = 0;
  /** Non-null while the player is downed (last stand). */
  down: DownState | null = null;
  private lastStand: { slots: Loadout['slots']; active: 0 | 1 } | null = null;
  stats: ZRunStats = { round: 0, kills: 0, headshots: 0, points: 0, doors: 0, time: 0, downs: 0 };
  /** Points earned this run (not spent). */
  private earned = 0;
  private cache!: CacheView;
  private reforger!: ReforgerView | null;
  private perks!: PerkViews;
  private powerSwitch!: PowerSwitchView | null;
  private built = new Map<string, BuiltMap>();
  private perkSpots!: Partial<Record<PerkId, Spot>>;
  private pickups: PickupView[] = [];
  private vortices: Vortex[] = [];
  private repairT = 0;
  private papPending: { slot: 0 | 1; t: number } | null = null;
  private jingleT = 4;
  private time = 0;
  private rnd = Math.random;
  private boxSpinSounded = false;
  /** Current ride (cable car / zipline / slide) and per-ride cooldowns. */
  private ride: { def: RideDef; t: number } | null = null;
  private rideCool = new Map<string, number>();
  private ridePt: P3 = { x: 0, y: 0, z: 0 };

  constructor(private host: ZHost, private M: Materials, mapId?: string) {
    this.group.visible = false;
    this.setMap(getMap(mapId));
  }

  /** Switch to a registered map (builds it on first use, then reuses it). Call reset() afterwards. */
  setMap(entry: ZombiesMapEntry): void {
    if (this.def?.id === entry.def.id) return;
    let b = this.built.get(entry.def.id);
    if (!b) {
      const map = new ZombiesMap(this.M, entry);
      const def = entry.def;
      const root = new THREE.Group();
      root.add(map.root);
      // Machines stand on the floor their spot names (the world already contains their own colliders).
      const ground = () => 0;
      const mm = def.machines ?? {};
      const perkModels = Object.fromEntries(Object.entries(mm.perks ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : v!.model]));
      const cache = new CacheView(def.box.spots, ground, mm.box);
      root.add(cache.group);
      const reforger = def.pap ? new ReforgerView(def.pap, def.pap.y ?? 0, mm.pap) : null;
      if (reforger) root.add(reforger.root);
      const perks = new PerkViews(Object.fromEntries(perkEntries(def)), ground, perkModels);
      root.add(perks.group);
      const powerSwitch = def.power ? new PowerSwitchView(def.power, mm.power) : null;
      if (powerSwitch) root.add(powerSwitch.root);
      for (const s of def.wallBuys) root.add(buildChalk(s.key, s.x, (s.y ?? 0) + 1.7, s.z, s.face));
      const builds = new BuildViews(def.buildables ?? []);
      root.add(builds.group);
      const traps = new TrapViews(def.traps ?? []);
      root.add(traps.group);
      b = { map, root, cache, reforger, perks, powerSwitch, builds, traps };
      this.built.set(def.id, b);
    }
    this.group.clear();
    this.group.add(b.root);
    this.map = b.map;
    this.def = entry.def;
    this.topo = topologyOf(entry.def);
    this.cache = b.cache;
    this.reforger = b.reforger;
    this.perks = b.perks;
    this.powerSwitch = b.powerSwitch;
    this.buildViews = b.builds;
    this.trapViews = b.traps;
    this.perkSpots = Object.fromEntries(perkEntries(entry.def));
    this.zones = createZoneState(this.topo);
    this.resetEggs();
  }

  private buildViews!: BuildViews;
  private trapViews!: TrapViews;

  private resetEggs(): void {
    this.eggDefs = allEggs(this.def);
    this.eggRuns = this.eggDefs.map((e) => createEggRun(e));
    this.egg = this.def.egg ? this.eggRuns[0] : createEggRun(undefined);
  }

  get spawn() { const s = this.def.playerSpawn; return { x: s.x, y: s.y ?? 0, z: s.z, yaw: s.yaw }; }

  reset(): void {
    this.host.audio.setMapAmbience(this.def.audio?.ambience ?? null);
    this.zp = createZPlayer();
    this.rounds = createRoundState(1, makeSchedule(this.def.rounds, this.rnd));
    this.box = createBox(this.def.box.start ?? 0, !!this.def.box.reveal);
    this.zones = createZoneState(this.topo);
    this.pu = createPowerUps();
    this.resetEggs();
    this.builds = (this.def.buildables ?? []).map((b) => createBuildState(b));
    this.traps = (this.def.traps ?? []).map(() => createTrapState());
    this.shieldHp = this.shieldMax = 0;
    this.shieldFrom = -1;
    this.mule = null;
    this.burns = [];
    this.novaCd = 0;
    this.revealT = 0;
    this.power = !this.def.power;
    this.blackout = false;
    this.lifelineBuys = 0;
    this.stats = { round: 0, kills: 0, headshots: 0, points: 0, doors: 0, time: 0, downs: 0 };
    this.earned = 0;
    this.papPending = null;
    this.ride = null;
    this.rideCool.clear();
    this.down = null;
    this.lastStand = null;
    for (const p of this.pickups) p.root.removeFromParent();
    this.pickups = [];
    for (const v of this.vortices) v.mesh.removeFromParent();
    this.vortices = [];
    this.map.resetDoors();
    this.map.windows.forEach((_w, i) => this.map.setPlanks(i, PLANKS, false));
    this.map.eggObjectsAll.forEach((eg) => eg.forEach((step, si) => step.forEach((r) => { r.visible = si === 0; })));
    this.buildViews.reset();
    this.trapViews.reset();
    this.powerSwitch?.set(false, true);
    const e = this.host.enemies;
    e.instaKill = false;
    e.allowCrawlers = true;
    e.barricades = {
      planks: (i) => this.zones.planks[i],
      tear: (i, z) => this.onTear(i, z),
      win: (i) => { const w = this.map.windows[i]; return { outside: w.outside, inside: w.inside, floor: w.geom.floor }; },
    };
    this.applyMods();
  }

  /** Called when leaving Zombies so extraction runs with stock stats. */
  clearMods(): void {
    this.host.audio.setMapAmbience(null);
    WEAPON_MODS.damageMult = WEAPON_MODS.rpmMult = WEAPON_MODS.reloadMult = 1;
    WEAPON_MODS.adsMult = WEAPON_MODS.spreadMult = WEAPON_MODS.headMult = 1;
    PLAYER.maxHealth = 100;
    PLAYER.sprintSpeed = BASE_PLAYER.sprintSpeed;
    PLAYER.staminaDrain = BASE_PLAYER.staminaDrain;
    const e = this.host.enemies;
    e.instaKill = false;
    e.allowCrawlers = false;
    e.barricades = null;
  }

  startLoadout(l: Loadout): void {
    const w = this.def.startWeapon ?? 'pi_warden';
    l.slots = [createWeapon(w), null];
    l.slots[0]!.reserve = WEAPONS[w].startReserve;
    l.active = 0;
    l.grenades = 2;
  }

  private applyMods(): void {
    const m = (this.mods = perkMods(this.zp.perks));
    WEAPON_MODS.damageMult = m.damageMult;
    WEAPON_MODS.rpmMult = m.rpmMult;
    WEAPON_MODS.reloadMult = m.reloadMult;
    WEAPON_MODS.adsMult = m.adsMult;
    WEAPON_MODS.spreadMult = m.spreadMult;
    WEAPON_MODS.headMult = m.headMult;
    PLAYER.maxHealth = 100 * m.maxHealthMult;
    PLAYER.sprintSpeed = BASE_PLAYER.sprintSpeed * m.sprintMult;
    PLAYER.staminaDrain = BASE_PLAYER.staminaDrain * m.staminaDrainMult;
    // Losing Packmule loses the third gun.
    if (m.extraSlots <= 0 && this.mule) { this.mule = null; this.host.toast('PACKMULE LOST', 'bad', 'Your third weapon is gone', 2); }
  }

  /** Nova: your own blasts do not hurt you. */
  get blastImmune(): boolean { return this.mods.blastImmune; }

  private addPoints(n: number): void {
    this.zp.points += n;
    this.earned += n;
    this.stats.points = this.earned;
  }

  /** Alive count used by the round director (the boss counts even though it is flagged elite). */
  private alive(): number {
    const b = this.host.enemies.boss;
    return this.host.enemies.aliveCount + (b && b.alive ? 1 : 0);
  }

  // --------------------------------------------------------------------------------------
  update(dt: number, player: P3, interactHeld: boolean): void {
    this.time += dt;
    this.stats.time += dt;
    const ev = stepRounds(this.rounds, dt, this.alive());
    if (ev.started) {
      this.stats.round = ev.started;
      onRoundStart(this.pu);
      onRoundStartZones(this.zones);
      const sp = this.rounds.spec;
      this.blackout = sp.blackout;
      this.host.toast(`ROUND ${ev.started}`, 'big', sp.special ? 'THE SCUTTLERS ARE COMING · FAST AND HUNGRY' : sp.blackout ? 'BLACKOUT · THE LIGHTS ARE GONE' : ev.boss ? 'THE WARDEN WALKS TONIGHT' : '', 3.5);
      this.host.audio.roundSting(true);
      if (ev.boss) this.spawnBoss(player);
    }
    if (ev.ended) {
      const b = roundBonus(ev.ended);
      this.addPoints(b);
      this.host.toast(`ROUND ${ev.ended} SURVIVED`, 'good', `+${b}`, 2.5);
      this.host.audio.roundSting(false);
      if (this.rounds.spec.special || this.rounds.spec.blackout) this.dropPowerUp('max_ammo', player.x, player.y, player.z - 1.5);
      this.blackout = false;
    }
    for (let i = 0; i < ev.spawn; i++) this.spawnOne(player);

    // The Cache: hidden until the map's reveal condition, then it surfaces in a later zone.
    if (this.box.phase === 'hidden') this.checkReveal();
    this.revealT = Math.max(0, this.revealT - dt);
    const spots = this.def.box.spots;
    const be = stepBox(this.box, dt, spots.length, this.rnd);
    if (this.box.phase === 'spinning' && !this.boxSpinSounded) { this.boxSpinSounded = true; this.host.audio.boxJingle(spots[this.box.location]); }
    if (this.box.phase !== 'spinning') this.boxSpinSounded = false;
    if (be === 'moth') { this.host.toast('THE MOTH TAKES THE CACHE', 'bad', 'It will land somewhere else · pull refunded', 3); this.host.sound('deny'); }
    if (be === 'arrived') this.host.toast('THE CACHE HAS MOVED', '', 'Follow the light', 2.5);
    if (be === 'offer') this.host.sound('loot');
    this.cache.update(dt, this.time, this.box);

    // Reforger
    if (this.papPending) {
      this.papPending.t -= dt;
      if (this.papPending.t <= 0) this.finishPap();
    }
    this.reforger?.update(dt, this.time, this.power, (x, y, z) => this.host.fx.sparkBurst(x, y, z, 18, [1.4, 0.6, 2]));
    this.perks.update(this.time, this.power);
    this.powerSwitch?.update(dt);
    // Rides
    for (const [k, v] of this.rideCool) this.rideCool.set(k, Math.max(0, v - dt));
    if (this.ride) {
      this.ride.t += dt;
      ridePosition(this.ride.def, this.ride.t, this.ridePt);
      if (this.ride.t >= this.ride.def.seconds) {
        this.rideCool.set(this.ride.def.id, this.ride.def.cooldown ?? 0);
        this.ride = null;
      }
    }
    this.map.update(this.time, dt, this.power, this.blackout, { player, ride: this.ride ? { id: this.ride.def.id, t: Math.min(1, this.ride.t / this.ride.def.seconds) } : null, egg: this.egg.complete, eggStep: this.egg.step });
    this.host.audio.updateMapAmbience(dt, this.power);

    // Perk jingles when standing near a lit machine
    this.jingleT -= dt;
    if (this.jingleT <= 0) {
      this.jingleT = 12 + this.rnd() * 10;
      const near = this.perks.litNear(player.x, player.z, 7);
      if (near) this.host.audio.perkJingle(this.perkSpots[near]!, PERK_ORDER.indexOf(near));
    }

    // Barricade repair (hold E)
    this.repairT = Math.max(0, this.repairT - dt);
    if (interactHeld && this.repairT <= 0) {
      const w = this.windowNear(player);
      if (w >= 0 && this.zones.planks[w] < PLANKS) {
        const r = repairPlank(this.zones, w, this.zp, pointsMult(this.pu));
        if (r.rebuilt) {
          this.earned += r.points;
          this.stats.points = this.earned;
          this.map.setPlanks(w, this.zones.planks[w], false);
          this.host.audio.plank('repair', this.map.windows[w].inside);
          this.repairT = REPAIR_SECONDS;
        }
      }
    }

    // Power-ups
    for (const k of stepPowerUps(this.pu, dt)) this.host.toast(`${POWERUP_INFO[k].name} ENDED`, '', '', 1.4);
    this.host.enemies.instaKill = isActive(this.pu, 'insta_kill');
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      updatePickup(p, dt, this.time);
      if (p.age > POWERUP.pickupLifetime) { p.root.removeFromParent(); this.pickups.splice(i, 1); continue; }
      if (Math.hypot(p.x - player.x, p.z - player.z) < 1.4 && Math.abs(p.y - player.y) < 2) {
        p.root.removeFromParent();
        this.pickups.splice(i, 1);
        this.collect(p.kind);
      }
    }
    this.updateVortices(dt);
    this.updateBurns(dt);
    this.updateTraps(dt, player);
    this.novaCd = Math.max(0, this.novaCd - dt);
    for (let b = 0; b < this.builds.length; b++) {
      const st = this.builds[b];
      const was = st.reissueT;
      stepBuild(st, dt);
      if (was > 0 && st.reissueT <= 0) this.host.toast(`${this.def.buildables![b].name.toUpperCase()} READY`, 'good', 'The bench has made a new one', 2);
    }
    this.buildViews.update(this.time, this.builds);
    // Easter eggs: collect-step items are picked up by walking over them.
    this.eggDefs.forEach((egg, k) => {
      for (const e of pendingObjects(egg, this.eggRuns[k])) {
        if (e.kind !== 'collect') continue;
        if (Math.hypot(e.o.x - player.x, e.o.z - player.z) < (e.o.radius ?? 1.0) && Math.abs(player.y - (e.o.y - 0.35)) < 1.6) this.useEgg(e.i, 'collect', k);
      }
    });
  }

  // --------------------------------------------------------------------------------------
  // Pacing: the Cache reveal, traps, buildables, elemental rounds, perk effects
  // --------------------------------------------------------------------------------------
  private checkReveal(): void {
    const r = this.def.box.reveal;
    const unlocked = unlockedZones(this.topo, this.zones);
    if (!revealDue(r, { doorsOpened: this.zones.opened.size, unlocked, round: this.rounds.round, power: this.power })) return;
    const spotZones = this.def.box.spots.map((s) => zoneAt(this.def, s.x, s.z, s.y ?? 0));
    const at = pickRevealSpot(r, spotZones, this.def.startZone, unlocked, this.def.box.start ?? 0);
    if (!revealBox(this.box, at)) return;
    this.revealT = 8;
    this.cache.reveal();
    this.host.toast('THE CACHE HAS SURFACED', 'big', r?.hint ?? `Find it in the ${zoneName(this.def, spotZones[at]) || 'dark'} · follow the light`, 4.5);
    this.host.audio.cacheReveal(this.def.box.spots[at]);
  }

  /** Where the Cache is (HUD): null while it is hidden. */
  get cacheZone(): string | null {
    if (this.box.phase === 'hidden') return null;
    const s = this.def.box.spots[this.box.location];
    return zoneName(this.def, zoneAt(this.def, s.x, s.z, s.y ?? 0));
  }

  private updateTraps(dt: number, player: P3): void {
    const traps = this.def.traps ?? [];
    this.trapTick -= dt;
    const tick = this.trapTick <= 0;
    if (tick) this.trapTick = 0.15;
    traps.forEach((t, i) => {
      const st = this.traps[i];
      const ev = stepTrap(t, st, dt);
      if (ev === 'off') this.host.toast(`${t.name.toUpperCase()} COOLING DOWN`, '', `${t.cooldown ?? TRAP_DEFAULTS.cooldown} seconds`, 1.6);
      if (st.phase !== 'active') return;
      if (inTrap(t, player.x, player.y, player.z)) this.host.hurt?.(TRAP_PLAYER_DPS * dt, (t.area.x0 + t.area.x1) / 2, (t.area.z0 + t.area.z1) / 2);
      if (!tick) return;
      const e = this.host.enemies;
      for (const z of e.zombies) {
        if (!z.alive || !inTrap(t, z.pos.x, z.pos.y, z.pos.z)) continue;
        this.trapKilling = true;
        const dmg = z.elite ? z.maxHp * TRAP_ELITE_FRAC * 0.15 : z.hp * 10 + 1;
        const out = e.damage(z, dmg, false, z.pos.x, z.pos.y + 1, z.pos.z, 0, 1);
        this.trapKilling = false;
        if (out.killed) st.kills++;
        this.host.fx.sparkBurst(z.pos.x, z.pos.y + 1, z.pos.z, 12, t.kind === 'fire' ? [2.2, 0.9, 0.2] : [0.6, 0.9, 2.6]);
      }
    });
    this.trapViews.update(this.time, this.traps, (x, y, z, k) => {
      if (Math.random() < 0.5) this.host.fx.sparkBurst(x, y, z, 5, k === 'fire' ? [2.4, 1.0, 0.25] : [0.6, 0.9, 2.8]);
    });
  }

  /** Fire rounds: burning zombies take damage in ticks until the flames die. */
  private updateBurns(dt: number): void {
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.t -= dt;
      b.tick -= dt;
      if (!b.z.alive || b.t <= 0) { this.burns.splice(i, 1); continue; }
      if (b.tick > 0) continue;
      b.tick = 0.3;
      const z = b.z;
      this.host.enemies.damage(z, b.dps * 0.3, false, z.pos.x, z.pos.y + 1, z.pos.z, 0, 1);
      this.host.fx.sparkBurst(z.pos.x, z.pos.y + 1.1, z.pos.z, 6, [2.4, 0.9, 0.2]);
    }
  }

  private ignite(z: Zombie): void {
    if (this.burns.some((b) => b.z === z)) return;
    const fx = ELEMENT_FX.fire;
    this.burns.push({ z, t: fx.seconds, dps: z.maxHp * fx.hpFracPerSec * (z.elite ? ELEMENT_FX.eliteMult : 1), tick: 0 });
  }

  /** Reforged rounds: from tier II a hit may proc the gun's element (fire, shock, freeze). */
  onBulletHit(z: Zombie, id: WeaponId, tier: number, killed: boolean): Element | null {
    const el = rollElement(id, tier, this.rnd);
    if (!el) return null;
    this.applyElement(el, z, killed);
    return el;
  }

  /** Apply an elemental effect at a zombie (exposed for tests/dev). */
  applyElement(el: Element, z: Zombie, killed = false): void {
    const e = this.host.enemies;
    const near = (r: number, n: number) => e.zombies.filter((o) => o.alive && o !== z && Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z) < r && Math.abs(o.pos.y - z.pos.y) < 2.5)
      .sort((a, b) => Math.hypot(a.pos.x - z.pos.x, a.pos.z - z.pos.z) - Math.hypot(b.pos.x - z.pos.x, b.pos.z - z.pos.z)).slice(0, n);
    if (el === 'fire') {
      if (!killed) this.ignite(z);
      for (const o of near(ELEMENT_FX.fire.spreadRadius, ELEMENT_FX.fire.spreadCount)) this.ignite(o);
      this.host.fx.sparkBurst(z.pos.x, z.pos.y + 1, z.pos.z, 18, [2.4, 0.9, 0.2]);
    } else if (el === 'shock') {
      let from = { x: z.pos.x, y: z.pos.y + 1.2, z: z.pos.z };
      const col = new THREE.Color(0.6, 0.85, 3);
      for (const o of near(ELEMENT_FX.shock.radius, ELEMENT_FX.shock.chains)) {
        const to = { x: o.pos.x, y: o.pos.y + 1.2, z: o.pos.z };
        this.host.fx.tracer(from.x, from.y, from.z, to.x, to.y, to.z, col);
        this.host.fx.sparkBurst(to.x, to.y, to.z, 10, [0.6, 0.9, 3]);
        e.damage(o, o.maxHp * ELEMENT_FX.shock.hpFrac * (o.elite ? ELEMENT_FX.eliteMult : 1), false, to.x, to.y, to.z, 0, 1);
        if (o.alive && !o.elite) o.setState('stagger');
        from = to;
      }
    } else {
      for (const o of [z, ...near(ELEMENT_FX.freeze.radius, ELEMENT_FX.freeze.count)]) {
        if (!o.alive || o.elite) continue;
        o.frozenT = Math.max(o.frozenT, ELEMENT_FX.freeze.seconds);
        this.host.fx.sparkBurst(o.pos.x, o.pos.y + 1, o.pos.z, 12, [0.7, 1.2, 2.2]);
      }
    }
  }

  /** A slide started: Nova sets off a blast around you. */
  onSlide(p: P3): boolean {
    if (!this.mods.slideNova || this.novaCd > 0 || !this.host.blast) return false;
    this.novaCd = NOVA.cooldown;
    this.host.blast(p.x, p.y + 0.3, p.z, novaDamage(this.rounds.round), NOVA.radius);
    this.host.fx.sparkBurst(p.x, p.y + 0.5, p.z, 40, [1.6, 0.5, 2.4]);
    return true;
  }

  /** Packmule: switching to `to` rotates the third gun into that slot. */
  onSwitch(to: 0 | 1): void {
    if (this.mods.extraSlots <= 0 || !this.mule) return;
    const l = this.host.loadout();
    const r = muleRotate(l.slots, to, this.mule);
    l.slots = r.slots;
    this.mule = r.stash;
  }

  /** The shield on your back soaks part of a hit. Returns the damage that gets through. */
  absorbHit(dmg: number, from: { x: number; z: number }, player: P3, yaw: number): number {
    if (this.shieldHp <= 0) return dmg;
    const dx = from.x - player.x, dz = from.z - player.z, l = Math.hypot(dx, dz) || 1;
    const r = shieldAbsorb(this.shieldHp, dmg, { x: -Math.sin(yaw), z: -Math.cos(yaw) }, { x: dx / l, z: dz / l });
    this.shieldHp = r.hp;
    if (r.broke) {
      this.shieldHp = this.shieldMax = 0;
      if (this.shieldFrom >= 0) shieldLost(this.builds[this.shieldFrom]);
      this.host.toast('SHIELD BROKEN', 'bad', 'The bench will make another', 2);
      this.host.sound('deny');
    }
    return r.through;
  }

  private windowNear(p: P3): number {
    let best = -1, bd = 1.9;
    this.map.windows.forEach((w, i) => {
      const d = Math.hypot(w.inside.x - p.x, w.inside.z - p.z);
      if (d < bd && Math.abs(p.y - w.geom.floor) < 1.2) { bd = d; best = i; }
    });
    return best;
  }

  private spawnOne(player: P3): void {
    const wins = activeWindows(this.topo, this.zones);
    const open = unlockedZones(this.topo, this.zones);
    const points = (this.def.spawnPoints ?? []).map((sp, i) => ({ sp, i })).filter((e) => open.has(e.sp.zone));
    if (wins.length === 0 && points.length === 0) return;
    const spec = this.rounds.spec;
    const type = pickZombieType(spec, this.rnd);
    // Prefer spawns near the player (weighted by 1/distance), like the classic spawners. Spawns on another
    // floor count as further away so a horde does not appear straight above or below you.
    const cands = [
      ...wins.map((w) => { const r = this.map.windows[w.id]; return { win: w.id, pt: -1, x: r.spawn.x, y: r.geom.floor, z: r.spawn.z, wt: 1 }; }),
      ...points.map((e) => ({ win: -1, pt: e.i, x: e.sp.x, y: e.sp.y, z: e.sp.z, wt: e.sp.weight ?? 1 })),
    ].map((c) => { const d = Math.hypot(c.x - player.x, c.z - player.z) + Math.abs(c.y - player.y) * 3; return { c, wgt: c.wt / Math.max(6, d) ** 1.5 }; });
    const tot = cands.reduce((a, b) => a + b.wgt, 0);
    let r = this.rnd() * tot;
    let pick = cands[cands.length - 1].c;
    for (const w of cands) { r -= w.wgt; if (r < 0) { pick = w.c; break; } }
    let z: Zombie;
    if (pick.pt >= 0) {
      const sp = this.def.spawnPoints![pick.pt];
      const x = sp.x + (this.rnd() - 0.5) * 1.0, zz = sp.z + (this.rnd() - 0.5) * 1.0;
      z = this.host.enemies.spawn(type === 'fast' ? 'fast' : type, 'low', x, zz, 'chase', sp.y + (sp.kind === 'drop' ? 0.2 : 0));
      if (sp.kind === 'ground') { z.riseT = 1.2; this.host.fx.bloodPool(x, zz, 0.6); }
      if (sp.kind === 'drop') z.pos.y = sp.y;
    } else {
      const win = this.map.windows[pick.win];
      if (type === 'fast') {
        // Scuttlers arrive in a crack of lightning just inside the window.
        const x = win.inside.x + (this.rnd() - 0.5) * 1.5, zz = win.inside.z + (this.rnd() - 0.5) * 1.5;
        z = this.host.enemies.spawn('fast', 'low', x, zz, 'chase', win.geom.floor);
        this.host.fx.sparkBurst(x, win.geom.floor + 1, zz, 30, [0.6, 0.8, 2.5]);
        this.host.fx.explosion(x, win.geom.floor, zz, true);
      } else {
        z = this.host.enemies.spawn(type, 'low', win.spawn.x + (this.rnd() - 0.5) * 1.2, win.spawn.z + (this.rnd() - 0.5) * 0.6, 'chase', win.geom.floor);
        z.entry = pick.win;
        z.entryPhase = 'approach';
      }
    }
    if (type === 'runner' && this.rnd() < spec.sprinterFrac) { z.speed *= SPRINTER_SPEED_MULT; z.sprinter = true; }
    z.maxHp *= spec.hpMult;
    z.hp = z.maxHp;
    z.reward = 0;
  }

  private spawnBoss(player: P3): void {
    const wins = activeWindows(this.topo, this.zones);
    if (wins.length === 0) {
      const sp = (this.def.spawnPoints ?? [])[0];
      if (!sp) return;
      const z = this.host.enemies.spawn('boss', 'low', sp.x, sp.z, 'chase', sp.y);
      z.maxHp = bossHpForRound(this.rounds.round);
      z.hp = z.maxHp;
      z.helmetHp = 400 + this.rounds.round * 20;
      return;
    }
    const w = this.map.windows[wins[Math.floor(this.rnd() * wins.length)].id];
    const z = this.host.enemies.spawn('boss', 'low', w.spawn.x, w.spawn.z, 'chase', w.geom.floor);
    z.maxHp = bossHpForRound(this.rounds.round);
    z.hp = z.maxHp;
    z.helmetHp = 400 + this.rounds.round * 20;
    z.entry = w.geom.id;
    z.entryPhase = 'approach';
    this.host.toast(`THE WARDEN HAS BREACHED ${this.def.name.toUpperCase()}`, 'bad', 'Break its helmet · it smashes barricades', 4);
    this.host.audio.zombieVoice({ x: player.x + 10, z: player.z }, 'elite');
  }

  private onTear(i: number, z: Zombie): void {
    const n = z.type === 'boss' ? (this.zones.planks[i] = 0) : tearPlank(this.zones, i);
    this.map.setPlanks(i, n, true);
    this.host.audio.plank('tear', this.map.windows[i].outside);
  }

  onHit(kind: 'body' | 'head' | 'kill' | 'armor'): void {
    if (kind === 'kill') return;
    const amt = awardHit(this.zp) * (pointsMult(this.pu) - 1);
    this.zp.points += amt;
    this.earned += 10 + amt;
    this.stats.points = this.earned;
  }

  onKill(z: Zombie, head: boolean, melee = false): void {
    this.stats.kills++;
    const kz = zoneAt(this.def, z.pos.x, z.pos.z, z.pos.y);
    this.eggDefs.forEach((egg, k) => {
      const ek = eggKill(egg, this.eggRuns[k], kz, this.power);
      if (ek !== 'none') this.onEggEvent(ek, k);
    });
    if (head) this.stats.headshots++;
    const before = this.zp.points;
    if (this.trapKilling) this.zp.points += POINTS.trapKill;
    else awardKill(this.zp, head, melee);
    const base = this.zp.points - before;
    const extra = base * (pointsMult(this.pu) - 1);
    this.zp.points += extra;
    this.earned += base + extra;
    this.stats.points = this.earned;
    if (z.type === 'boss') {
      this.addPoints(2000);
      this.host.toast('THE WARDEN FALLS', 'big', '+2000 · a gift drops', 4);
      this.dropPowerUp(this.rnd() < 0.5 ? 'max_ammo' : 'insta_kill', z.pos.x, z.pos.y, z.pos.z);
      return;
    }
    if (this.rounds.spec.special) return; // Scuttler rounds drop only the final Max Ammo
    const exclude: PowerUpKind[] = this.zones.planks.every((n) => n === PLANKS) ? ['carpenter'] : [];
    const pr = this.def.powerups;
    const k = rollDrop(this.pu, base, this.rnd, [...exclude, ...(pr?.exclude ?? [])], { maxPerRound: pr?.maxPerRound, chanceMult: pr?.dropChanceMult });
    if (k) this.dropPowerUp(k, z.pos.x, z.pos.y, z.pos.z);
  }

  private dropPowerUp(k: PowerUpKind, x: number, y: number, z: number): void {
    const p = buildPickup(k, x, y, z);
    this.group.add(p.root);
    this.pickups.push(p);
    this.host.audio.powerupSpawn({ x, z });
  }

  private collect(k: PowerUpKind): void {
    activate(this.pu, k);
    this.host.audio.powerupVoice(k);
    const info = POWERUP_INFO[k];
    switch (k) {
      case 'max_ammo':
        for (const s of this.host.loadout().slots) if (s) refillAmmo(s);
        this.host.loadout().grenades = 4;
        break;
      case 'nuke': {
        let n = 0;
        for (const z of this.host.enemies.zombies) {
          if (!z.alive || z.elite) continue;
          this.host.enemies.damage(z, z.hp * 10 + 1, false, z.pos.x, z.pos.y + 1, z.pos.z, 0, 1);
          n++;
        }
        this.addPoints(POWERUP.nukePoints);
        this.host.fx.shake = Math.max(this.host.fx.shake, 0.5);
        this.host.toast(info.name, 'big', `${n} obliterated · +${POWERUP.nukePoints}`, 2.5);
        return;
      }
      case 'carpenter':
        rebuildAll(this.zones);
        this.map.windows.forEach((_w, i) => this.map.setPlanks(i, PLANKS, false));
        this.addPoints(POWERUP.carpenterPoints);
        break;
      default:
        break;
    }
    this.host.toast(info.name, 'big', info.timed ? `${POWERUP.duration} seconds` : '', 2.2);
  }

  /** Nuke/bonus kills credit points but not headshots; exposed for the HUD. */
  get activePowerUps(): { kind: PowerUpKind; t: number }[] {
    return (Object.keys(this.pu.timers) as PowerUpKind[]).map((k) => ({ kind: k, t: this.pu.timers[k] ?? 0 }));
  }

  /** Health reached zero: go down into last stand (perks are lost). */
  beginDown(v: Vitals): void {
    this.stats.downs++;
    this.down = beginDown(this.zp, 1);
    this.applyMods();
    this.burns = [];
    v.alive = true;
    v.health = 1;
    v.sinceDamage = 0;
    // Last stand: the best pistol you carry, else a stock sidearm.
    const l = this.host.loadout();
    this.lastStand = { slots: [...l.slots] as Loadout['slots'], active: l.active };
    const pick = lastStandPick(l.slots.map((w) => w?.id ?? null));
    if (pick.slot >= 0) l.slots = [l.slots[pick.slot], null];
    else { const w = createWeapon(pick.weapon); w.reserve = WEAPONS[pick.weapon].magSize * 3; l.slots = [w, null]; }
    l.active = 0;
    this.host.syncWeapons();
    this.host.toast(this.down.selfRevive !== null ? 'DOWN · LIFELINE KICKS IN' : 'YOU ARE DOWN', 'bad', this.down.selfRevive !== null ? 'Hold on…' : 'Last stand · perks lost', 2.5);
    this.host.sound('alert');
  }

  /** A zombie landed a hit while you are down. */
  hitDown(): void { if (this.down) hitWhileDown(this.down); }

  /** Tick the downed state. Returns 'bledout' when the run is over. */
  updateDown(dt: number, v: Vitals): 'revived' | 'bledout' | null {
    if (!this.down) return null;
    const e = stepDown(this.down, dt);
    if (e === 'revived') {
      this.down = null;
      this.restoreLastStand();
      v.health = PLAYER.maxHealth * DOWN.reviveHealth;
      v.sinceDamage = 0;
      this.host.toast('LIFELINE · SELF-REVIVED', 'big', 'Perks lost', 3);
      // Knock back nearby zombies so the revive is not instantly undone.
      for (const z of this.host.enemies.zombies) if (z.alive && !z.elite && z.entry < 0) z.setState('stagger');
    } else if (e === 'bledout') {
      this.down = null;
      this.restoreLastStand();
    }
    return e;
  }

  /** HUD countdown while down. */
  get downInfo(): { label: string; left: number; frac: number } | null { return this.down ? downStatus(this.down) : null; }

  private restoreLastStand(): void {
    const ls = this.lastStand;
    if (!ls) return;
    this.lastStand = null;
    const l = this.host.loadout();
    l.slots = ls.slots;
    l.active = ls.active;
    this.host.syncWeapons();
  }

  // --------------------------------------------------------------------------------------
  // Wonder weapons and launcher
  // --------------------------------------------------------------------------------------
  onSpecial(kind: 'explosive' | 'arc' | 'singularity' | 'cryo', id: WeaponId, tier: number, hit: { z: Zombie | null; x: number; y: number; zz: number }, explode: (x: number, y: number, z: number, dmg: number, r: number) => void): void {
    const wb = wonderBonus(id, tier);
    const dmgT = UPGRADE_TIERS[Math.min(UPGRADE_TIERS.length - 1, tier)].damageMult;
    const e = this.host.enemies;
    if (kind === 'explosive') { explode(hit.x, hit.y, hit.zz, WEAPONS[id].damage * dmgT, 5 + tier); return; }
    if (kind === 'arc') {
      // Chain lightning: jump to the nearest un-hit zombie within range, N times.
      let from = hit.z ? { x: hit.z.pos.x, y: hit.z.pos.y + 1.2, z: hit.z.pos.z } : { x: hit.x, y: hit.y, z: hit.zz };
      const done = new Set<Zombie>();
      if (hit.z) done.add(hit.z);
      const col = new THREE.Color(0.6, 0.85, 3);
      for (let i = 0; i < wb.chains; i++) {
        let best: Zombie | null = null, bd = wb.radius;
        for (const z of e.zombies) {
          if (!z.alive || done.has(z)) continue;
          const d = Math.hypot(z.pos.x - from.x, z.pos.z - from.z);
          if (d < bd) { bd = d; best = z; }
        }
        if (!best) break;
        done.add(best);
        const to = { x: best.pos.x, y: best.pos.y + 1.2, z: best.pos.z };
        this.host.fx.tracer(from.x, from.y, from.z, (from.x + to.x) / 2 + (Math.random() - 0.5) * 0.6, (from.y + to.y) / 2 + 0.3, (from.z + to.z) / 2 + (Math.random() - 0.5) * 0.6, col);
        this.host.fx.tracer((from.x + to.x) / 2, (from.y + to.y) / 2 + 0.3, (from.z + to.z) / 2, to.x, to.y, to.z, col);
        this.host.fx.sparkBurst(to.x, to.y, to.z, 10, [0.6, 0.9, 3]);
        e.damage(best, WEAPONS[id].damage * dmgT * 0.8, false, to.x, to.y, to.z, 0, 1);
        from = to;
      }
      return;
    }
    if (kind === 'singularity') {
      const mesh = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 14), new THREE.MeshBasicMaterial({ color: 0x050008 }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.2, 1.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      const light = new THREE.PointLight(0xa040ff, 20, 10, 1.5);
      mesh.add(core, halo, light);
      mesh.position.set(hit.x, hit.y + 0.6, hit.zz);
      this.group.add(mesh);
      this.vortices.push({ x: hit.x, y: hit.y, z: hit.zz, t: 2.2, radius: wb.radius, dmg: 5000 * dmgT, mesh });
      return;
    }
    // cryo: freeze in a small cone around the hit; frozen zombies shatter from any hit
    const cx = hit.z ? hit.z.pos.x : hit.x, cz = hit.z ? hit.z.pos.z : hit.zz;
    for (const z of e.zombies) {
      if (!z.alive || z.elite) continue;
      if (Math.hypot(z.pos.x - cx, z.pos.z - cz) < wb.radius && z.frozenT <= 0 && Math.random() < 0.35 + tier * 0.2) {
        z.frozenT = wb.freeze;
        this.host.fx.sparkBurst(z.pos.x, z.pos.y + 1, z.pos.z, 14, [0.7, 1.2, 2]);
      }
    }
  }

  private updateVortices(dt: number): void {
    const e = this.host.enemies;
    const w = this.map.world;
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.t -= dt;
      const s = 1 + Math.sin(this.time * 20) * 0.1;
      v.mesh.scale.setScalar(v.t > 0.3 ? s : Math.max(0.05, v.t / 0.3) * 2.5);
      v.mesh.rotation.y += dt * 6;
      for (const z of e.zombies) {
        if (!z.alive || z.entry >= 0) continue;
        const dx = v.x - z.pos.x, dz = v.z - z.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > v.radius || d < 0.2) continue;
        const pull = Math.min(d, (z.elite ? 1.2 : 5.5) * dt);
        w.move(z.pos, z.radius, z.height * 0.95, (dx / d) * pull, 0, (dz / d) * pull, 0.5, true);
        z.vel.x = z.vel.z = 0;
        if (z.state !== 'stagger' && !z.elite) z.setState('stagger');
      }
      if (v.t <= 0) {
        // Implode
        this.host.fx.explosion(v.x, v.y, v.z, true);
        this.host.fx.sparkBurst(v.x, v.y + 1, v.z, 40, [1.2, 0.3, 2.5]);
        e.radiusDamage(v.x, v.y + 0.5, v.z, v.radius * 0.8, v.dmg);
        this.host.audio.explosion({ x: v.x, z: v.z });
        v.mesh.removeFromParent();
        this.vortices.splice(i, 1);
      }
    }
  }

  // --------------------------------------------------------------------------------------
  // Interaction
  // --------------------------------------------------------------------------------------
  find(p: P3): ZInteraction | null {
    const near = (x: number, z: number, r: number, y = 0) => Math.hypot(x - p.x, z - p.z) < r && Math.abs(p.y - y) < 1.4;
    const d = this.def;
    const bs = d.box.spots[this.box.location];
    if (this.box.phase !== 'moving' && this.box.phase !== 'hidden' && near(bs.x, bs.z, 2, bs.y ?? 0)) return { kind: 'box' };
    for (const [ti, t] of (d.traps ?? []).entries()) if (near(t.switch.x, t.switch.z, 1.6, t.switch.y ?? 0)) return { kind: 'trap', t: ti };
    for (const [bi, b] of (d.buildables ?? []).entries()) {
      if (near(b.bench.x, b.bench.z, 1.9, b.bench.y ?? 0)) return { kind: 'bench', b: bi };
      const st = this.builds[bi];
      if (st && !st.built) for (const [pi, pt] of b.parts.entries()) if (!st.found[pi] && near(pt.x, pt.z, 1.4, pt.y - 0.35)) return { kind: 'part', b: bi, i: pi };
    }
    if (d.pap && near(d.pap.x, d.pap.z, 2.4, d.pap.y ?? 0)) return { kind: 'pap' };
    if (d.power && near(d.power.x, d.power.z, 1.8, d.power.y ?? 0)) return { kind: 'power' };
    for (const [id, s] of perkEntries(d)) if (near(s.x, s.z, 1.7, s.y ?? 0)) return { kind: 'perk', id };
    for (const s of d.wallBuys) if (near(s.x, s.z, 1.6, s.y ?? 0)) return { kind: 'wall', key: s.key };
    for (const d of this.map.doors) {
      if (d.open) continue;
      const g = d.geom;
      const mid = (g.a0 + g.a1) / 2;
      const [dx, dz] = g.axis === 'x' ? [mid, g.at] : [g.at, mid];
      if (near(dx, dz, 2.3, g.y0)) return { kind: 'door', id: g.id };
    }
    for (const [k, egg] of this.eggDefs.entries()) {
      for (const e of pendingObjects(egg, this.eggRuns[k])) if (e.kind === 'interact' && near(e.o.x, e.o.z, e.o.radius ?? 1.3, e.o.y - 0.35)) return { kind: 'relic', i: e.i, egg: k };
    }
    for (const r of d.rides ?? []) if (near(r.at.x, r.at.z, r.radius ?? 1.6, r.at.y)) return { kind: 'ride', id: r.id };
    const w = this.windowNear(p);
    if (w >= 0 && this.zones.planks[w] < PLANKS) return { kind: 'window', w };
    return null;
  }

  prompt(it: ZInteraction): string {
    const l = this.host.loadout();
    switch (it.kind) {
      case 'box':
        if (this.box.phase === 'offer') return this.box.owner === 0 ? `<kbd>E</kbd> Take ${WEAPONS[this.box.offer!].name}` : '';
        if (this.box.phase !== 'idle') return 'The Cache is deciding…';
        return `<kbd>E</kbd> Open the Cache <span class="cost">${BOX_PRICE}</span>`;
      case 'pap': {
        if (!this.power) return 'Reforger <span class="denied">REQUIRES POWER</span>';
        if (this.papPending) return 'The Reforger is working…';
        const w = l.slots[l.active];
        const price = w ? papPrice(w.tier, UPGRADE_TIERS.length - 1) : null;
        if (price === null) return 'Reforger <span class="denied">WEAPON MAXED</span>';
        const el = w && w.tier + 1 >= 2 ? PAP_ELEMENT[w.id] : undefined;
        return `<kbd>E</kbd> Reforge ${w ? WEAPONS[w.id].shortName : ''} → ${w ? papName(w.id, WEAPONS[w.id].name, w.tier + 1) : ''} · TIER ${'I'.repeat(w!.tier + 1)}${el ? ` · ${el.toUpperCase()} ROUNDS` : ''} <span class="cost">${price}</span>`;
      }
      case 'power': return this.power ? 'Power is on' : `<kbd>E</kbd> ${this.def.flavor?.powerPrompt ?? 'Throw the main breaker'}`;
      case 'perk': {
        const d = PERKS[it.id];
        if (this.zp.perks.includes(it.id)) return `${d.name} <span class="denied">OWNED</span>`;
        if (d.needsPower && !this.power) return `${d.name} <span class="denied">REQUIRES POWER</span>`;
        if (this.zp.perks.length >= this.zp.perkLimit) return `${d.name} <span class="denied">PERK LIMIT (${this.zp.perkLimit})</span>`;
        return `<kbd>E</kbd> ${d.name} · ${d.desc} <span class="cost">${d.price}</span>`;
      }
      case 'wall': {
        const def = WALL_BUYS[it.key];
        const owned = l.slots.find((s) => s?.id === def.weapon);
        const p = wallBuyPrice(def, owned ? owned.tier : null);
        return `<kbd>E</kbd> ${p.action === 'weapon' ? 'Buy' : 'Ammo for'} ${WEAPONS[def.weapon].name} <span class="cost">${p.price}</span>`;
      }
      case 'door': {
        const d = this.topo.doors.find((x) => x.id === it.id)!;
        if (!canOpenDoor(this.topo, this.zones, it.id)) return `${d.label} <span class="denied">OTHER SIDE</span>`;
        if (d.requiresPower && !this.power) return `${d.label} <span class="denied">REQUIRES POWER</span>`;
        return `<kbd>E</kbd> ${d.label} <span class="cost">${d.cost}</span>`;
      }
      case 'window': return `Hold <kbd>E</kbd> to rebuild barrier <span class="cost">+10</span>`;
      case 'relic': { const k = it.egg ?? 0; const st = currentStep(this.eggDefs[k], this.eggRuns[k]); return `<kbd>E</kbd> ${st && st.kind === 'interact' ? st.prompt ?? 'Examine' : 'Examine'}`; }
      case 'part': { const b = this.def.buildables![it.b]; return `<kbd>E</kbd> Pick up ${b.parts[it.i].name} <span class="cost">${b.name}</span>`; }
      case 'bench': {
        const b = this.def.buildables![it.b];
        const st = this.builds[it.b];
        const blk = benchBlock(b, st, this.power);
        if (blk === 'missing') return `${b.name} <span class="denied">${st.found.filter(Boolean).length}/${b.parts.length} PARTS</span>`;
        if (blk === 'power') return `${b.name} <span class="denied">REQUIRES POWER</span>`;
        if (blk === null) return `<kbd>E</kbd> Build the ${b.name}`;
        if (b.result.kind === 'trap') return `${b.name} <span class="cost">BUILT</span>`;
        const sb = shieldBlock(b, st);
        if (sb === 'carrying') return `${b.name} <span class="denied">ON YOUR BACK</span>`;
        if (sb === 'cooldown') return `${b.name} <span class="denied">READY IN ${Math.ceil(st.reissueT)}s</span>`;
        return `<kbd>E</kbd> Take the ${b.name}`;
      }
      case 'trap': {
        const t = this.def.traps![it.t];
        const st = this.traps[it.t];
        const blk = trapBlock(t, st, this.power, this.trapBuilt(t.requiresBuild));
        if (blk === 'power') return `${t.name} <span class="denied">REQUIRES POWER</span>`;
        if (blk === 'build') return `${t.name} <span class="denied">NEEDS THE ${this.def.buildables?.find((b) => b.id === t.requiresBuild)?.name.toUpperCase() ?? 'PARTS'}</span>`;
        if (blk === 'active') return `${t.name} <span class="denied">LIVE</span>`;
        if (blk === 'cooldown') return `${t.name} <span class="denied">COOLING ${Math.ceil(st.t)}s</span>`;
        return `<kbd>E</kbd> ${t.name} <span class="cost">${t.cost ?? TRAP_DEFAULTS.cost}</span>`;
      }
      case 'ride': {
        const r = this.rideDef(it.id);
        if (!r) return '';
        if (this.ride) return '';
        const b = rideBlock(r, this.rideCtx(r));
        if (b === 'egg') return '';
        if (b === 'power') return `${r.label} <span class="denied">REQUIRES POWER</span>`;
        if (b === 'zone') return `${r.label} <span class="denied">OTHER END LOCKED</span>`;
        if (b === 'cooldown') return `${r.label} <span class="denied">ON ITS WAY</span>`;
        return `<kbd>E</kbd> ${r.label}${r.cost ? ` <span class="cost">${r.cost}</span>` : ''}`;
      }
    }
  }

  use(it: ZInteraction): void {
    const l = this.host.loadout();
    const deny = (r: SpendResult) => { if (!r.ok) { this.host.toast(REASON[r.reason] ?? 'DENIED', 'bad', '', 1.4); this.host.sound('deny'); } return !r.ok; };
    switch (it.kind) {
      case 'window': return; // handled by hold-to-repair
      case 'power':
        if (this.power) return;
        this.power = true;
        this.powerSwitch?.set(true);
        this.host.toast('POWER RESTORED', 'big', 'Perks and the Reforger are live', 3);
        this.host.audio.powerOn();
        return;
      case 'relic':
        this.useEgg(it.i, 'interact', it.egg ?? 0);
        return;
      case 'part': {
        const b = this.def.buildables![it.b];
        const ev = pickPart(this.builds[it.b], it.i);
        if (ev === 'none') return;
        const n = this.builds[it.b].found.filter(Boolean).length;
        const bz = zoneName(this.def, zoneAt(this.def, b.bench.x, b.bench.z, b.bench.y ?? 0));
        this.host.toast(`${b.parts[it.i].name.toUpperCase()}`, 'good', ev === 'all' ? `All parts found · build the ${b.name} at the bench in the ${bz}` : `${b.name} · ${n}/${b.parts.length} parts`, 2.6);
        this.host.sound('loot');
        return;
      }
      case 'bench': {
        const b = this.def.buildables![it.b];
        const st = this.builds[it.b];
        if (!st.built) {
          const blk = benchBlock(b, st, this.power);
          if (blk) { this.host.toast(blk === 'power' ? REASON.power : `${st.found.filter(Boolean).length}/${b.parts.length} PARTS`, 'bad', blk === 'missing' ? 'Find the rest of the parts' : '', 1.6); this.host.sound('deny'); return; }
          build(b, st, this.power);
          this.stats.builds = (this.stats.builds ?? 0) + 1;
          this.host.toast(`${b.name.toUpperCase()} BUILT`, 'big', b.result.kind === 'shield' ? 'Take it from the bench · it guards your back' : `The ${this.def.traps?.find((t) => b.result.kind === 'trap' && t.id === b.result.trap)?.name ?? 'trap'} is armed`, 3);
          this.host.sound('upgrade');
          return;
        }
        const hp = takeShield(b, st);
        if (hp <= 0) return;
        this.shieldHp = this.shieldMax = hp;
        this.shieldFrom = it.b;
        this.host.toast(b.name.toUpperCase(), 'good', 'On your back · it soaks hits from behind', 2);
        this.host.sound('buy');
        return;
      }
      case 'trap': {
        const t = this.def.traps![it.t];
        const r = activateTrap(t, this.traps[it.t], this.zp, this.power, this.trapBuilt(t.requiresBuild));
        if (deny(r)) return;
        this.host.audio.trapStart({ x: t.switch.x, z: t.switch.z }, t.kind);
        this.host.toast(t.name.toUpperCase(), 'good', `${t.seconds ?? TRAP_DEFAULTS.seconds} seconds · stay out of it`, 2);
        return;
      }
      case 'ride': {
        const r = this.rideDef(it.id);
        if (!r || this.ride) return;
        const b = rideBlock(r, this.rideCtx(r));
        if (b === 'egg') return;
        if (b === 'funds') { this.host.toast(REASON.funds, 'bad', '', 1.4); this.host.sound('deny'); return; }
        if (b) { this.host.toast(b === 'power' ? REASON.power : b === 'cooldown' ? 'NOT YET' : 'THE OTHER END IS LOCKED', 'bad', '', 1.4); this.host.sound('deny'); return; }
        if (r.cost) this.zp.points -= r.cost;
        this.ride = { def: r, t: 0 };
        ridePosition(r, 0, this.ridePt);
        this.host.sound('buy');
        return;
      }
      case 'door': {
        const r = buyDoor(this.topo, this.zones, this.zp, it.id, this.power);
        if (deny(r)) return;
        this.map.openDoor(it.id);
        this.stats.doors++;
        this.host.audio.doorOpen(!!this.topo.doors.find((d) => d.id === it.id)?.debris);
        return;
      }
      case 'box': {
        if (this.box.phase === 'offer') {
          const w = takeBoxOffer(this.box, 0);
          if (w) this.giveWeapon(w);
          return;
        }
        const owned = [...l.slots, this.mule].filter(Boolean).map((s) => s!.id);
        const r = pullBox(this.box, this.zp, owned, this.rnd, 0, this.def.box.spots.length);
        if (deny(r)) return;
        this.cache.reel = boxReel(this.rnd, 24);
        this.host.sound('buy');
        return;
      }
      case 'pap': {
        const w = l.slots[l.active];
        if (!w || this.papPending || !this.reforger) return;
        const r = tryPap(this.zp, w.tier, UPGRADE_TIERS.length - 1, this.power);
        if (deny(r)) return;
        // The gun goes in; you are unarmed (knife) until it comes out.
        this.papPending = { slot: l.active, t: PAP_SECONDS };
        this.reforger.start(w.id, PAP_SECONDS);
        this.host.sound('upgrade');
        return;
      }
      case 'perk': {
        const r = tryBuyPerk(this.zp, it.id, this.power, this.lifelineBuys);
        if (deny(r)) return;
        if (it.id === 'lifeline') this.lifelineBuys++;
        this.onPerkGained(it.id);
        return;
      }
      case 'wall': {
        const def = WALL_BUYS[it.key];
        const owned = l.slots.find((s) => s?.id === def.weapon) ?? null;
        const p = wallBuyPrice(def, owned ? owned.tier : null);
        if (owned && owned.reserve >= 0 && isFull(owned)) { this.host.toast('AMMO FULL', 'bad', '', 1.2); return; }
        if (deny(trySpend(this.zp, p.price))) return;
        if (owned) refillAmmo(owned);
        else this.giveWeapon(def.weapon);
        this.host.sound('buy');
        return;
      }
    }
  }

  private onPerkGained(id: PerkId): void {
    this.applyMods();
    if (id === 'bulwark') this.host.vitals().health = PLAYER.maxHealth;
    this.host.toast(PERKS[id].name, 'good', PERKS[id].desc, 2.5);
    const at = this.perkSpots[id] ?? this.spawn;
    this.host.audio.perkJingle(at, PERK_ORDER.indexOf(id));
  }

  private trapBuilt(id: string | undefined): boolean {
    if (!id) return true;
    const i = (this.def.buildables ?? []).findIndex((b) => b.id === id);
    return i >= 0 && !!this.builds[i]?.built;
  }

  private rideDef(id: string): RideDef | undefined { return this.def.rides?.find((r) => r.id === id); }

  private rideCtx(r: RideDef): RideCtx {
    return { power: this.power, egg: this.egg.complete, eggStep: this.egg.step, unlocked: unlockedZones(this.topo, this.zones), points: this.zp.points, cooldown: this.rideCool.get(r.id) ?? 0 };
  }

  /** Feet position while the player is being carried by a ride (Game pins the player there), else null. */
  get ridePos(): P3 | null { return this.ride ? this.ridePt : null; }

  /** True while a gun is inside the Reforger (the player holds only the knife). */
  get papBusySlot(): 0 | 1 | null { return this.papPending ? this.papPending.slot : null; }

  private finishPap(): void {
    const p = this.papPending!;
    this.papPending = null;
    const w = this.host.loadout().slots[p.slot];
    if (!w) return;
    applyUpgrade(w);
    this.host.syncWeapons();
    const el = w.tier >= 2 ? PAP_ELEMENT[w.id] : undefined;
    this.host.toast(papName(w.id, WEAPONS[w.id].name, w.tier), 'big', `REFORGED · ${UPGRADE_TIERS[w.tier].name} · ${PAP_CAMOS[w.tier] ?? ''} CAMO${el ? ` · ${el.toUpperCase()} ROUNDS` : ''}`, 3);
    this.host.sound('upgrade');
  }

  /** Use (interact) or pick up (collect) object `i` of the current step of egg `k` (0 = first in allEggs). */
  private useEgg(i: number, kind: 'interact' | 'collect', k = 0): void {
    const egg = this.eggDefs[k], run = this.eggRuns[k];
    if (!egg || !run) return;
    const step = run.step;
    const ev = kind === 'interact' ? eggInteract(egg, run, i, this.power) : eggCollect(egg, run, i, this.power);
    if (ev === 'none') return;
    if (ev === 'power') { this.host.toast('NOTHING HAPPENS', 'bad', 'It needs power', 1.6); return; }
    const objs = this.map.eggObjectsAll[k];
    if (ev === 'wrong-order') {
      this.host.toast('THE SEQUENCE BREAKS', 'bad', 'Start again', 2);
      objs?.[step]?.forEach((o) => { o.visible = true; });
      this.host.sound('deny');
      return;
    }
    const obj = objs?.[step]?.[i];
    if (obj) obj.visible = false;
    this.host.audio.chime();
    this.onEggEvent(ev, k);
  }

  private onEggEvent(ev: EggEvent, k = 0): void {
    const egg = this.eggDefs[k], run = this.eggRuns[k];
    if (!egg || !run) return;
    if (ev === 'progress') {
      const st = egg.steps[run.step];
      const [n, t] = stepProgress(egg, run);
      this.host.toast(st?.toast ?? egg.name.toUpperCase(), '', `${n} / ${t}`, 3);
      return;
    }
    if (ev === 'step') {
      // Reveal the next step's objects.
      this.map.eggObjectsAll[k]?.forEach((objs, si) => objs.forEach((o) => { o.visible = si === run.step; }));
      const st = egg.steps[run.step];
      this.host.toast(egg.name.toUpperCase(), 'good', st?.toast ?? 'Something stirs', 3);
      this.host.sound('radio');
      return;
    }
    if (ev === 'complete') this.eggReward(egg);
  }

  private eggReward(egg: EggDef): void {
    const rw = egg.reward;
    this.host.toast(rw.title, 'big', rw.sub ?? '', 5);
    this.host.sound('complete');
    const l = this.host.loadout();
    const w = l.slots[l.active];
    if (rw.reforge && w && w.tier < UPGRADE_TIERS.length - 1) { applyUpgrade(w); this.host.syncWeapons(); }
    if (rw.refillAmmo) for (const s of l.slots) if (s) refillAmmo(s);
    if (rw.points) this.addPoints(rw.points);
    if (rw.powerup) this.dropPowerUp(rw.powerup, ...this.eggDropPos());
    if (rw.perkSlot) addPerkSlots(this.zp, rw.perkSlot);
    if (rw.allPerks) {
      for (const [id] of perkEntries(this.def)) grantPerk(this.zp, id);
      this.applyMods();
    }
    if (rw.perk && grantPerk(this.zp, rw.perk)) this.onPerkGained(rw.perk);
    if (rw.music) this.host.audio.easterTrack(rw.music);
    if (rw.weapon) this.giveWeapon(rw.weapon);
  }

  private eggDropPos(): [number, number, number] { const s = this.spawn; return [s.x, s.y, s.z]; }

  private giveWeapon(id: WeaponId): void {
    const l = this.host.loadout();
    const existing = l.slots.find((s) => s?.id === id);
    if (existing) { refillAmmo(existing); this.host.syncWeapons(); return; }
    if (this.mule?.id === id) { refillAmmo(this.mule); return; }
    const free = l.slots.findIndex((s) => !s);
    // Packmule: the gun you hold goes into the third slot instead of being dropped.
    if (free < 0 && this.mods.extraSlots > 0 && !this.mule) this.mule = l.slots[l.active];
    const slot = free >= 0 ? free : l.active; // two-weapon limit: replace what you hold
    l.slots[slot] = createWeapon(id);
    l.slots[slot]!.reserve = WEAPONS[id].reserveMax;
    l.active = slot as 0 | 1;
    this.host.syncWeapons();
    this.host.toast(WEAPONS[id].name, 'good', WEAPONS[id].cls === 'wonder' ? 'WONDER WEAPON' : '', 1.8);
  }

  /** Name for the HUD (reforged guns get their new names). */
  weaponName(id: WeaponId, tier: number): string { return papName(id, WEAPONS[id].name, tier); }

  zoneName(p: P3): string {
    const z = zoneAt(this.def, p.x, p.z, p.y);
    return this.topo.zones.find((x) => x.id === z)?.name ?? '';
  }

  /** Stand point in front of a spot (used by tools and tests). */
  front(s: Spot, d = 1): { x: number; y: number; z: number } { return frontOf(s, d); }
}

function isFull(w: { id: WeaponId; tier: number; reserve: number }): boolean {
  return w.reserve >= effectiveStats(w.id, w.tier).reserveMax;
}
