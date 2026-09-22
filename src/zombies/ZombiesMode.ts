// Round-based Zombies mode runtime on the purpose-built map "Nightfall Relay". Owns the round director,
// points, zones/doors/barricades, machines, power-ups, wonder-weapon effects and the easter egg.
// All rules live in pure modules (./rules, ./zones, ./powerups, ./summary); this file is the glue.
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
  BOX_PRICE, PAP_SECONDS, PERKS, WALL_BUYS, awardHit, awardKill, bossHpForRound, boxReel, createBox, createRoundState, createZPlayer, goDown,
  papName, papPrice, perkMods, pickZombieType, pullBox, roundBonus, stepBox, stepRounds, takeBoxOffer, tryBuyPerk, tryPap, trySpend, wallBuyPrice,
  wonderBonus, type BoxState, type PerkId, type RoundState, type SpendResult, type WallBuyKey, type ZPlayer,
} from './rules';
import {
  PLANKS, REPAIR_SECONDS, activateRelic, activeWindows, buyDoor, canOpenDoor, createEgg, createZoneState, onRoundStartZones, rebuildAll, repairPlank,
  tearPlank, type EggState, type ZoneState,
} from './zones';
import {
  POWERUP, POWERUP_INFO, activate, createPowerUps, isActive, onRoundStart, pointsMult, rollDrop, stepPowerUps, type PowerUpKind, type PowerUpState,
} from './powerups';
import { BOX_SPOTS, PAP_SPOT, PERK_SPOTS, PLAYER_SPAWN, POWER_SWITCH, RELICS, START_WEAPON, TOPOLOGY, WALL_BUY_SPOTS, zoneAt } from './mapdata';
import { ZombiesMap } from './ZombiesMap';
import { CacheView, PerkViews, PowerSwitchView, ReforgerView, buildChalk, buildPickup, updatePickup, type PickupView } from './Machines';
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
  | { kind: 'relic'; i: number };

export interface ZHost {
  enemies: EnemyManager;
  audio: AudioEngine;
  fx: Effects;
  loadout: () => Loadout;
  vitals: () => Vitals;
  syncWeapons: () => void;
  toast: (t: string, kind?: '' | 'big' | 'good' | 'bad', small?: string, dur?: number) => void;
  sound: (k: 'buy' | 'deny' | 'upgrade' | 'alert' | 'complete' | 'loot' | 'radio') => void;
}

const REASON: Record<string, string> = { funds: 'NOT ENOUGH POINTS', owned: 'ALREADY OWNED', max: 'MAXED', limit: 'PERK LIMIT (4)', busy: 'NOT YET', power: 'REQUIRES POWER' };

interface Vortex { x: number; y: number; z: number; t: number; radius: number; dmg: number; mesh: THREE.Group }

export class ZombiesMode {
  readonly group = new THREE.Group();
  readonly map: ZombiesMap;
  zp: ZPlayer = createZPlayer();
  rounds: RoundState = createRoundState();
  box: BoxState = createBox(0);
  zones: ZoneState = createZoneState(TOPOLOGY);
  pu: PowerUpState = createPowerUps();
  egg: EggState = createEgg(RELICS.length);
  power = false;
  lifelineBuys = 0;
  stats: ZRunStats = { round: 0, kills: 0, headshots: 0, points: 0, doors: 0, time: 0, downs: 0 };
  /** Points earned this run (not spent). */
  private earned = 0;
  private cache: CacheView;
  private reforger: ReforgerView;
  private perks: PerkViews;
  private powerSwitch: PowerSwitchView;
  private pickups: PickupView[] = [];
  private vortices: Vortex[] = [];
  private repairT = 0;
  private papPending: { slot: 0 | 1; t: number } | null = null;
  private jingleT = 4;
  private time = 0;
  private rnd = Math.random;
  private boxSpinSounded = false;

  constructor(private host: ZHost, M: Materials) {
    this.map = new ZombiesMap(M);
    this.group.add(this.map.root);
    this.group.visible = false;
    const ground = (x: number, z: number, y = 0) => this.map.world.groundHeight(x, z, 0.3, y + 3.2);
    this.cache = new CacheView(BOX_SPOTS, (x, z) => ground(x, z));
    this.group.add(this.cache.group);
    this.reforger = new ReforgerView(PAP_SPOT, 0);
    this.group.add(this.reforger.root);
    this.perks = new PerkViews(PERK_SPOTS, (x, z) => ground(x, z));
    this.group.add(this.perks.group);
    this.powerSwitch = new PowerSwitchView(POWER_SWITCH);
    this.group.add(this.powerSwitch.root);
    for (const s of WALL_BUY_SPOTS) this.group.add(buildChalk(s.key, s.x, (s.y ?? 0) + 1.7, s.z, s.face));
    // Machine footprints are solid
    const w = this.map.world;
    for (const s of BOX_SPOTS) w.add(s.x - 0.7, 0, s.z - 0.7, s.x + 0.7, 0.62, s.z + 0.7, { surface: 'wood' });
    // Footprints (width along the machine's X, depth along its Z) match the authored models.
    const FOOT: Record<PerkId, [number, number]> = { bulwark: [1.0, 0.85], quickhands: [0.8, 0.75], hammerfall: [1.9, 1.9], lifeline: [1.75, 1.2] };
    for (const id of Object.keys(PERK_SPOTS) as PerkId[]) {
      const s = PERK_SPOTS[id]; const y = s.y ?? 0;
      const [fw, fd] = FOOT[id];
      const side = Math.abs(Math.sin(s.face)) > 0.5;
      const hx = (side ? fd : fw) / 2, hz = (side ? fw : fd) / 2;
      w.add(s.x - hx, y, s.z - hz, s.x + hx, y + 2.2, s.z + hz, { surface: 'metal' });
    }
    w.add(PAP_SPOT.x - 1.15, 0, PAP_SPOT.z - 0.65, PAP_SPOT.x + 1.15, 3.2, PAP_SPOT.z + 0.65, { surface: 'metal' });
    w.add(POWER_SWITCH.x - 0.6, POWER_SWITCH.y!, POWER_SWITCH.z - 0.2, POWER_SWITCH.x + 0.6, POWER_SWITCH.y! + 2.1, POWER_SWITCH.z + 0.2, { surface: 'metal' });
    this.map.nav.build(w);
  }

  get spawn() { return PLAYER_SPAWN; }

  reset(): void {
    this.zp = createZPlayer();
    this.rounds = createRoundState();
    this.box = createBox(0);
    this.zones = createZoneState(TOPOLOGY);
    this.pu = createPowerUps();
    this.egg = createEgg(RELICS.length);
    this.power = false;
    this.lifelineBuys = 0;
    this.stats = { round: 0, kills: 0, headshots: 0, points: 0, doors: 0, time: 0, downs: 0 };
    this.earned = 0;
    this.papPending = null;
    for (const p of this.pickups) p.root.removeFromParent();
    this.pickups = [];
    for (const v of this.vortices) v.mesh.removeFromParent();
    this.vortices = [];
    this.map.resetDoors();
    this.map.windows.forEach((_w, i) => this.map.setPlanks(i, PLANKS, false));
    this.map.relics.forEach((r) => { r.visible = true; });
    this.powerSwitch.set(false, true);
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
    WEAPON_MODS.damageMult = WEAPON_MODS.rpmMult = WEAPON_MODS.reloadMult = 1;
    PLAYER.maxHealth = 100;
    const e = this.host.enemies;
    e.instaKill = false;
    e.allowCrawlers = false;
    e.barricades = null;
  }

  startLoadout(l: Loadout): void {
    l.slots = [createWeapon(START_WEAPON), null];
    l.slots[0]!.reserve = WEAPONS[START_WEAPON].startReserve;
    l.active = 0;
    l.grenades = 2;
  }

  private applyMods(): void {
    const m = perkMods(this.zp.perks);
    WEAPON_MODS.damageMult = m.damageMult;
    WEAPON_MODS.rpmMult = m.rpmMult;
    WEAPON_MODS.reloadMult = m.reloadMult;
    PLAYER.maxHealth = 100 * m.maxHealthMult;
  }

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
      this.host.toast(`ROUND ${ev.started}`, 'big', sp.special ? 'THE SCUTTLERS ARE COMING · FAST AND HUNGRY' : ev.boss ? 'THE WARDEN WALKS TONIGHT' : '', 3.5);
      this.host.audio.roundSting(true);
      if (ev.boss) this.spawnBoss(player);
    }
    if (ev.ended) {
      const b = roundBonus(ev.ended);
      this.addPoints(b);
      this.host.toast(`ROUND ${ev.ended} SURVIVED`, 'good', `+${b}`, 2.5);
      this.host.audio.roundSting(false);
      if (this.rounds.spec.special) this.dropPowerUp('max_ammo', player.x, player.y, player.z - 1.5);
    }
    for (let i = 0; i < ev.spawn; i++) this.spawnOne(player);

    // The Cache
    const be = stepBox(this.box, dt, BOX_SPOTS.length, this.rnd);
    if (this.box.phase === 'spinning' && !this.boxSpinSounded) { this.boxSpinSounded = true; this.host.audio.boxJingle(BOX_SPOTS[this.box.location]); }
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
    this.reforger.update(dt, this.time, this.power, (x, y, z) => this.host.fx.sparkBurst(x, y, z, 18, [1.4, 0.6, 2]));
    this.perks.update(this.time, this.power);
    this.powerSwitch.update(dt);
    this.map.update(this.time, dt, this.power);

    // Perk jingles when standing near a lit machine
    this.jingleT -= dt;
    if (this.jingleT <= 0) {
      this.jingleT = 12 + this.rnd() * 10;
      const near = this.perks.litNear(player.x, player.z, 7);
      if (near) this.host.audio.perkJingle(PERK_SPOTS[near], (Object.keys(PERK_SPOTS) as PerkId[]).indexOf(near));
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
    const wins = activeWindows(TOPOLOGY, this.zones);
    if (wins.length === 0) return;
    const spec = this.rounds.spec;
    const type = pickZombieType(spec, this.rnd);
    // Prefer windows near the player (weighted by 1/distance), like the classic spawners.
    const ws = wins.map((w) => { const r = this.map.windows[w.id]; const d = Math.hypot(r.spawn.x - player.x, r.spawn.z - player.z); return { id: w.id, wgt: 1 / Math.max(6, d) ** 1.5 }; });
    const tot = ws.reduce((a, b) => a + b.wgt, 0);
    let r = this.rnd() * tot;
    let id = ws[ws.length - 1].id;
    for (const w of ws) { r -= w.wgt; if (r < 0) { id = w.id; break; } }
    const win = this.map.windows[id];
    let z: Zombie;
    if (type === 'fast') {
      // Scuttlers arrive in a crack of lightning just inside the window.
      const x = win.inside.x + (this.rnd() - 0.5) * 1.5, zz = win.inside.z + (this.rnd() - 0.5) * 1.5;
      z = this.host.enemies.spawn('fast', 'low', x, zz, 'chase');
      this.host.fx.sparkBurst(x, win.geom.floor + 1, zz, 30, [0.6, 0.8, 2.5]);
      this.host.fx.explosion(x, win.geom.floor, zz, true);
    } else {
      z = this.host.enemies.spawn(type, 'low', win.spawn.x + (this.rnd() - 0.5) * 1.2, win.spawn.z + (this.rnd() - 0.5) * 0.6, 'chase');
      z.entry = id;
      z.entryPhase = 'approach';
    }
    z.maxHp *= spec.hpMult;
    z.hp = z.maxHp;
    z.reward = 0;
  }

  private spawnBoss(player: P3): void {
    const wins = activeWindows(TOPOLOGY, this.zones);
    const w = this.map.windows[wins[Math.floor(this.rnd() * wins.length)].id];
    const z = this.host.enemies.spawn('boss', 'low', w.spawn.x, w.spawn.z, 'chase');
    z.maxHp = bossHpForRound(this.rounds.round);
    z.hp = z.maxHp;
    z.helmetHp = 400 + this.rounds.round * 20;
    z.entry = w.geom.id;
    z.entryPhase = 'approach';
    this.host.toast('THE WARDEN HAS BREACHED THE RELAY', 'bad', 'Break its helmet · it smashes barricades', 4);
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
    if (head) this.stats.headshots++;
    const before = this.zp.points;
    awardKill(this.zp, head, melee);
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
    const k = rollDrop(this.pu, base, this.rnd, exclude);
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

  /** Returns true if the player was saved by Lifeline. Perks are lost either way. */
  onDowned(v: Vitals): boolean {
    this.stats.downs++;
    const saved = goDown(this.zp);
    this.applyMods();
    if (saved) {
      v.alive = true;
      v.health = PLAYER.maxHealth;
      v.sinceDamage = 0;
      this.host.toast('LIFELINE · SELF-REVIVED', 'big', 'Perks lost', 3);
      // Knock back nearby zombies so the revive is not instantly undone.
      for (const z of this.host.enemies.zombies) if (z.alive && !z.elite && z.entry < 0) z.setState('stagger');
    }
    return saved;
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
    const bs = BOX_SPOTS[this.box.location];
    if (this.box.phase !== 'moving' && near(bs.x, bs.z, 2)) return { kind: 'box' };
    if (near(PAP_SPOT.x, PAP_SPOT.z, 2.4)) return { kind: 'pap' };
    if (near(POWER_SWITCH.x, POWER_SWITCH.z, 1.8, POWER_SWITCH.y)) return { kind: 'power' };
    for (const id of Object.keys(PERK_SPOTS) as PerkId[]) { const s = PERK_SPOTS[id]; if (near(s.x, s.z, 1.7, s.y ?? 0)) return { kind: 'perk', id }; }
    for (const s of WALL_BUY_SPOTS) if (near(s.x, s.z, 1.6, s.y ?? 0)) return { kind: 'wall', key: s.key };
    for (const d of this.map.doors) {
      if (d.open) continue;
      const g = d.geom;
      const mid = (g.a0 + g.a1) / 2;
      const [dx, dz] = g.axis === 'x' ? [mid, g.at] : [g.at, mid];
      if (near(dx, dz, 2.3, g.y0)) return { kind: 'door', id: g.id };
    }
    for (let i = 0; i < RELICS.length; i++) { const r = RELICS[i]; if (!this.egg.found[i] && near(r.x, r.z, 1.3, r.y - 0.35)) return { kind: 'relic', i }; }
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
        return price === null ? 'Reforger <span class="denied">WEAPON MAXED</span>' : `<kbd>E</kbd> Reforge ${w ? WEAPONS[w.id].shortName : ''} → ${w ? papName(w.id, WEAPONS[w.id].name, w.tier + 1) : ''} <span class="cost">${price}</span>`;
      }
      case 'power': return this.power ? 'Power is on' : '<kbd>E</kbd> Throw the main breaker';
      case 'perk': {
        const d = PERKS[it.id];
        if (this.zp.perks.includes(it.id)) return `${d.name} <span class="denied">OWNED</span>`;
        if (d.needsPower && !this.power) return `${d.name} <span class="denied">REQUIRES POWER</span>`;
        return `<kbd>E</kbd> ${d.name} · ${d.desc} <span class="cost">${d.price}</span>`;
      }
      case 'wall': {
        const def = WALL_BUYS[it.key];
        const owned = l.slots.find((s) => s?.id === def.weapon);
        const p = wallBuyPrice(def, owned ? owned.tier : null);
        return `<kbd>E</kbd> ${p.action === 'weapon' ? 'Buy' : 'Ammo for'} ${WEAPONS[def.weapon].name} <span class="cost">${p.price}</span>`;
      }
      case 'door': {
        const d = TOPOLOGY.doors.find((x) => x.id === it.id)!;
        if (!canOpenDoor(TOPOLOGY, this.zones, it.id)) return `${d.label} <span class="denied">OTHER SIDE</span>`;
        return `<kbd>E</kbd> ${d.label} <span class="cost">${d.cost}</span>`;
      }
      case 'window': return `Hold <kbd>E</kbd> to rebuild barrier <span class="cost">+10</span>`;
      case 'relic': return '<kbd>E</kbd> Tune the strange radio';
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
        this.powerSwitch.set(true);
        this.host.toast('POWER RESTORED', 'big', 'Perks and the Reforger are live', 3);
        this.host.audio.powerOn();
        return;
      case 'relic': {
        const r = activateRelic(this.egg, it.i);
        if (r === 'none') return;
        this.map.relics[it.i].visible = false;
        this.host.audio.chime();
        const found = this.egg.found.filter(Boolean).length;
        if (r === 'progress') this.host.toast('A VOICE IN THE STATIC', '', `${found} / ${RELICS.length} signal fragments`, 3);
        else this.eggReward();
        return;
      }
      case 'door': {
        const r = buyDoor(TOPOLOGY, this.zones, this.zp, it.id);
        if (deny(r)) return;
        this.map.openDoor(it.id);
        this.stats.doors++;
        this.host.audio.doorOpen(!!TOPOLOGY.doors.find((d) => d.id === it.id)?.debris);
        return;
      }
      case 'box': {
        if (this.box.phase === 'offer') {
          const w = takeBoxOffer(this.box, 0);
          if (w) this.giveWeapon(w);
          return;
        }
        const r = pullBox(this.box, this.zp, l.slots.filter(Boolean).map((s) => s!.id), this.rnd, 0, BOX_SPOTS.length);
        if (deny(r)) return;
        this.cache.reel = boxReel(this.rnd, 24);
        this.host.sound('buy');
        return;
      }
      case 'pap': {
        const w = l.slots[l.active];
        if (!w || this.papPending) return;
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
        this.applyMods();
        if (it.id === 'bulwark') this.host.vitals().health = PLAYER.maxHealth;
        this.host.toast(PERKS[it.id].name, 'good', PERKS[it.id].desc, 2.5);
        this.host.audio.perkJingle(PERK_SPOTS[it.id], (Object.keys(PERK_SPOTS) as PerkId[]).indexOf(it.id));
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

  /** True while a gun is inside the Reforger (the player holds only the knife). */
  get papBusySlot(): 0 | 1 | null { return this.papPending ? this.papPending.slot : null; }

  private finishPap(): void {
    const p = this.papPending!;
    this.papPending = null;
    const w = this.host.loadout().slots[p.slot];
    if (!w) return;
    applyUpgrade(w);
    this.host.syncWeapons();
    this.host.toast(papName(w.id, WEAPONS[w.id].name, w.tier), 'big', `REFORGED · ${UPGRADE_TIERS[w.tier].name}`, 3);
    this.host.sound('upgrade');
  }

  private eggReward(): void {
    this.host.toast('THE RELAY ANSWERS', 'big', 'Signal restored · your weapon is reforged for free', 5);
    this.host.sound('complete');
    const l = this.host.loadout();
    const w = l.slots[l.active];
    if (w && w.tier < UPGRADE_TIERS.length - 1) { applyUpgrade(w); this.host.syncWeapons(); }
    for (const s of l.slots) if (s) refillAmmo(s);
    this.addPoints(2500);
    this.dropPowerUp('double_points', ...this.eggDropPos());
  }

  private eggDropPos(): [number, number, number] { return [PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z]; }

  private giveWeapon(id: WeaponId): void {
    const l = this.host.loadout();
    const existing = l.slots.find((s) => s?.id === id);
    if (existing) { refillAmmo(existing); this.host.syncWeapons(); return; }
    const free = l.slots.findIndex((s) => !s);
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
    const z = zoneAt(p.x, p.z, p.y);
    return TOPOLOGY.zones.find((x) => x.id === z)?.name ?? '';
  }
}

function isFull(w: { id: WeaponId; tier: number; reserve: number }): boolean {
  return w.reserve >= effectiveStats(w.id, w.tier).reserveMax;
}
