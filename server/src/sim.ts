// Authoritative match simulation. Pure TypeScript (no Workers APIs) so it is unit-testable.
// The MatchRoom Durable Object feeds it inputs and ships its snapshots/events.
import { BoxWorld, newMoveState, stepMove, height, BTN, MOVE, TICK_DT, TICK_RATE, type MoveInput, type MoveState, type MoveMods } from '../../src/shared/movement';
import { MAP_BY_ID, type MapDef } from '../../src/shared/maps';
import { History, clampRewind, rayPlayer, type Zone } from '../../src/shared/lagcomp';
import { EF, type EntityState, type SelfState, type ServerEvent } from '../../src/shared/protocol';
import { MODES, chooseSpawn, pickTeam, stepFlag, flagOwner, type ModeId } from '../../src/shared/modes';
import { WEAPONS, WEAPON_INDEX, WEAPON_LIST, ATTACHMENT_BY_ID, applyAttachments, damageAt, fireInterval, type WeaponStats } from '../../src/data/weapons';
import { DEFAULT_LOADOUTS, validateLoadout, streakCost, type Loadout, type Unlocks } from '../../src/shared/loadout';
import { perkEffects, fallDamage, type PerkEffects } from '../../src/shared/perks';
import { matchXp, matchDollars, WEAPON_XP, type MatchStats } from '../../src/shared/progression';
import { EMPTY_PROGRESS, recordKill, type WeaponProgress } from '../../src/shared/camos';

export interface Gun { id: string; stats: WeaponStats; ammo: number; reserve: number; suppressed: boolean }

export interface SimPlayer {
  id: number;
  name: string;
  userId: string | null;
  team: 0 | 1;
  level: number;
  prestige: number;
  move: MoveState;
  yaw: number;
  pitch: number;
  health: number;
  alive: boolean;
  respawnAt: number;
  lastHurt: number;
  guns: [Gun, Gun];
  active: 0 | 1;
  nextFire: number;
  reloadEnd: number;
  swapEnd: number;
  burstLeft: number;
  prevButtons: number;
  /** 0..1 aim-down-sights progress (server-side, drives spread). */
  adsT: number;
  lastSprintClock: number;
  firingUntil: number;
  lastFireUnsuppressed: number;
  clock: number;
  queue: MoveInput[];
  lastSeq: number;
  bucket: number;
  viewTick: number;
  lastInput: MoveInput | null;
  loadout: Loadout;
  fx: PerkEffects;
  lethals: number;
  tacticals: number;
  streak: number;
  earnedStreaks: string[];
  lastKillTime: number;
  stats: MatchStats & { deaths: number; score: number };
  /** Per-weapon progress deltas this match (persisted at match end). */
  weaponDelta: Record<string, WeaponProgress & { xp: number }>;
  damagers: Map<number, number>;
  hist: History;
  flags: { droppedInputs: number; badFire: number };
}

export interface SimOptions { mode: ModeId; map: string; seed?: number; scoreLimit?: number; timeLimitSec?: number }

interface Projectile { id: number; kind: string; owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number; stuck: boolean }
interface Equipment { id: number; kind: string; owner: number; team: number; x: number; y: number; z: number; yaw: number; armed: number }

const RESPAWN_S = 3;
const REGEN_DELAY = 4.5, REGEN_RATE = 25;
const BUCKET_MAX = 6;
const MAX_ID = 250;
const MELEE_RANGE = 2.2;
export const LETHAL_DEF: Record<string, { speed: number; fuse: number; radius: number; dmg: number; stick?: boolean; impactKill?: boolean }> = {
  frag: { speed: 16, fuse: 2.5, radius: 6, dmg: 150 },
  semtex: { speed: 15, fuse: 2.0, radius: 5, dmg: 170, stick: true },
  hatchet: { speed: 24, fuse: 4, radius: 0, dmg: 200, impactKill: true },
};
export const TACTICAL_DEF: Record<string, { speed: number; fuse: number; radius: number }> = {
  flash: { speed: 16, fuse: 1.3, radius: 12 },
  stun: { speed: 16, fuse: 1.3, radius: 9 },
  smoke: { speed: 14, fuse: 1.0, radius: 6 },
  decoy: { speed: 12, fuse: 1.0, radius: 0 },
};

export class MatchSim {
  tick = 0;
  mode: ModeId;
  map: MapDef;
  world: BoxWorld;
  players = new Map<number, SimPlayer>();
  /** Broadcast events. */
  events: ServerEvent[] = [];
  /** Per-player events (radar, flash, stun, private equipment reveals). */
  direct: { to: number; ev: ServerEvent }[] = [];
  teamScore: [number, number] = [0, 0];
  ffaScore = new Map<number, number>();
  flags: number[] = [0, 0, 0];
  tags = new Map<number, { x: number; y: number; z: number; team: number; victim: number; expires: number }>();
  projectiles: Projectile[] = [];
  equipment = new Map<number, Equipment>();
  timeLeft: number;
  scoreLimit: number;
  ended = false;
  private nextObjId = 1;
  private rngState: number;
  private strikes: { at: number; x: number; y: number; z: number; owner: number; radius: number; dmg: number; weapon: string }[] = [];
  /** Radar state per team (index 0/1; FFA uses player id keyed map). */
  private scoutUntil = new Map<number, number>(); // key: team (teams) or player id (ffa)
  private jamUntil = new Map<number, number>();
  private decoys: { x: number; z: number; team: number; until: number; owner: number }[] = [];

  constructor(opts: SimOptions) {
    this.mode = opts.mode;
    this.map = MAP_BY_ID[opts.map] ?? MAP_BY_ID.kowloon;
    this.world = new BoxWorld(this.map.boxes);
    this.timeLeft = opts.timeLimitSec ?? MODES[this.mode].timeLimitSec;
    this.scoreLimit = opts.scoreLimit ?? MODES[this.mode].scoreLimit;
    this.rngState = (opts.seed ?? 12345) >>> 0;
  }

  rnd(): number {
    let t = (this.rngState = (this.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get time() { return this.tick * TICK_DT; }
  private get teams() { return MODES[this.mode].teams; }

  freeId(): number {
    for (let i = 1; i < MAX_ID; i++) if (!this.players.has(i)) return i;
    return -1;
  }

  addPlayer(p: { name: string; userId: string | null; level?: number; prestige?: number; loadout?: Loadout; unlocks?: Unlocks }): SimPlayer | null {
    const id = this.freeId();
    if (id < 0) return null;
    const counts: [number, number] = [0, 0];
    for (const q of this.players.values()) counts[q.team]++;
    const team = this.teams ? pickTeam(counts, this.teamScore) : ((id % 2) as 0 | 1);
    const unlocks: Unlocks = p.unlocks ?? { level: p.level ?? 1, prestige: p.prestige ?? 0, weaponXp: {} };
    const loadout = p.loadout && validateLoadout(p.loadout, unlocks).length === 0 ? p.loadout : DEFAULT_LOADOUTS[0];
    const sp: SimPlayer = {
      id, name: String(p.name).slice(0, 20), userId: p.userId, team, level: p.level ?? 1, prestige: p.prestige ?? 0,
      move: newMoveState(), yaw: 0, pitch: 0, health: 100, alive: false, respawnAt: this.time, lastHurt: -99,
      guns: this.makeGuns(loadout), active: 0, nextFire: 0, reloadEnd: 0, swapEnd: 0, burstLeft: 0, prevButtons: 0, adsT: 0, lastSprintClock: -99, firingUntil: 0, lastFireUnsuppressed: -99,
      clock: 0, queue: [], lastSeq: 0, bucket: BUCKET_MAX, viewTick: 0, lastInput: null, loadout, fx: perkEffects(loadout.perks), lethals: 1, tacticals: 1,
      streak: 0, earnedStreaks: [], lastKillTime: -99,
      stats: { kills: 0, headshots: 0, assists: 0, confirms: 0, denies: 0, captures: 0, defends: 0, bestStreak: 0, won: false, completed: false, deaths: 0, score: 0 },
      weaponDelta: {}, damagers: new Map(), hist: new History(), flags: { droppedInputs: 0, badFire: 0 },
    };
    this.players.set(id, sp);
    this.spawn(sp);
    this.emitRoster();
    return sp;
  }

  removePlayer(id: number) {
    if (this.players.delete(id)) this.emitRoster();
  }

  setLoadout(id: number, l: Loadout, unlocks: Unlocks): string[] {
    const p = this.players.get(id);
    if (!p) return ['no player'];
    const errs = validateLoadout(l, unlocks);
    if (!errs.length) p.loadout = l; // applied on next spawn
    return errs;
  }

  private makeGuns(l: Loadout): [Gun, Gun] {
    const mk = (id: string, atts: string[]): Gun => {
      const w = WEAPONS[id] ?? WEAPON_LIST[0];
      const stats = applyAttachments(w, atts);
      return { id: w.id, stats, ammo: stats.magSize, reserve: stats.reserve, suppressed: atts.some((a) => ATTACHMENT_BY_ID[a]?.suppressed) || w.id === 'pi_mote' || w.id === 'sr_hush' };
    };
    return [mk(l.primary, l.primaryAttachments), mk(l.secondary, l.secondaryAttachments)];
  }

  spawn(p: SimPlayer) {
    const enemies = [...this.players.values()].filter((q) => q !== p && q.alive && (!this.teams || q.team !== p.team)).map((q) => q.move);
    const s = chooseSpawn(this.map.spawns, p.team, enemies, this.teams, () => this.rnd());
    p.move = newMoveState(s.x, s.y, s.z);
    p.yaw = s.yaw; p.pitch = 0;
    p.health = 100; p.alive = true;
    p.fx = perkEffects(p.loadout.perks);
    p.guns = this.makeGuns(p.loadout); p.active = 0;
    p.lethals = 1 + p.fx.extraLethal; p.tacticals = 1;
    p.reloadEnd = 0; p.swapEnd = 0; p.nextFire = 0; p.burstLeft = 0; p.adsT = 0;
    p.streak = 0; p.damagers.clear();
    p.hist.clear();
  }

  private mods(p: SimPlayer): MoveMods {
    return { speedMult: p.guns[p.active].stats.mobility, tacSprintMult: p.fx.tacSprintMult, tacRechargeMult: p.fx.tacRechargeMult, mantleTimeMult: p.fx.mantleTimeMult, slideCooldownMult: p.fx.slideCooldownMult, slideSpeedMult: p.fx.slideSpeedMult };
  }

  /** Queue client inputs; seq must increase. Returns number accepted. */
  enqueue(id: number, viewTick: number, inputs: MoveInput[]): number {
    const p = this.players.get(id);
    if (!p) return 0;
    let n = 0;
    for (const i of inputs) {
      if (!(i.seq > p.lastSeq)) continue; // duplicate/resend
      if (p.queue.length >= 16) { p.flags.droppedInputs++; continue; }
      p.queue.push(i); p.lastSeq = i.seq; n++;
    }
    if (Number.isFinite(viewTick)) p.viewTick = viewTick;
    return n;
  }

  step() {
    if (this.ended) return;
    this.tick++;
    const now = this.time;
    for (const p of this.players.values()) {
      p.bucket = Math.min(BUCKET_MAX, p.bucket + 1);
      if (!p.alive) {
        p.queue.length = 0;
        if (now >= p.respawnAt) this.spawn(p);
        continue;
      }
      let processed = 0;
      // Anti speed-hack: each input costs one token; tokens refill one per server tick.
      while (p.queue.length && p.bucket >= 1) {
        const inp = p.queue.shift()!;
        p.bucket -= 1;
        this.applyInput(p, inp);
        processed++;
        if (!p.alive) break;
      }
      if (p.queue.length > 8) { p.flags.droppedInputs += p.queue.length - 8; p.queue.splice(0, p.queue.length - 8); }
      if (!processed && p.lastInput && p.alive) this.applyInput(p, { ...p.lastInput, fwd: 0, strafe: 0, buttons: 0 }, false);
      if (p.alive && now - p.lastHurt > REGEN_DELAY && p.health < 100) p.health = Math.min(100, p.health + REGEN_RATE * TICK_DT);
      p.hist.push({ tick: this.tick, x: p.move.x, y: p.move.y, z: p.move.z, h: height(p.move), alive: p.alive });
    }
    this.stepProjectiles();
    this.stepEquipment();
    this.stepStrikes(now);
    this.stepMode();
    if (this.tick % TICK_RATE === 0) this.radarSweep();
    this.timeLeft -= TICK_DT;
    if (this.tick % TICK_RATE === 0) this.events.push({ t: 'score', teams: this.teamScore, flags: this.mode === 'dom' ? this.flags.map((f) => +f.toFixed(2)) : undefined, timeLeft: Math.max(0, Math.round(this.timeLeft)) });
    this.checkEnd();
  }

  private applyInput(p: SimPlayer, inp: MoveInput, real = true) {
    stepMove(p.move, inp, this.world, this.mods(p));
    p.clock += TICK_DT;
    if (p.move.landImpact) {
      const fd = fallDamage(p.move.landImpact, p.fx);
      if (fd) this.damage(p, fd, null, 'fall', false);
      if (!p.alive) return;
    }
    if (p.move.sprinting) p.lastSprintClock = p.clock;
    if (!real) return;
    p.yaw = inp.yaw; p.pitch = Math.max(-1.5, Math.min(1.5, inp.pitch));
    p.lastInput = inp;
    const b = inp.buttons, pressed = b & ~p.prevButtons;
    p.prevButtons = b;
    let g = p.guns[p.active];
    // ADS progress (perk-scaled). Can't aim while sprinting/mantling.
    const wantAds = (b & BTN.ads) !== 0 && !p.move.sprinting && p.move.mantleT < 0;
    const adsRate = TICK_DT / Math.max(0.05, g.stats.adsTime * p.fx.adsTimeMult);
    p.adsT = Math.max(0, Math.min(1, p.adsT + (wantAds ? adsRate : -adsRate * 1.5)));
    if (pressed & BTN.swap && p.clock >= p.swapEnd) {
      p.active = p.active ? 0 : 1; p.reloadEnd = 0; p.burstLeft = 0;
      p.swapEnd = p.clock + p.guns[p.active].stats.swapTime * p.fx.swapMult;
      g = p.guns[p.active];
    }
    if (p.reloadEnd && p.clock >= p.reloadEnd) {
      const take = Math.min(g.stats.magSize - g.ammo, g.reserve);
      g.ammo += take; g.reserve -= take; p.reloadEnd = 0;
    }
    if ((pressed & BTN.reload || (g.ammo === 0 && b & BTN.fire)) && !p.reloadEnd && g.ammo < g.stats.magSize && g.reserve > 0 && p.clock >= p.swapEnd) {
      p.reloadEnd = p.clock + g.stats.reloadTime * p.fx.reloadMult; p.burstLeft = 0;
    }
    if (pressed & BTN.melee) this.melee(p);
    if (pressed & BTN.lethal && p.lethals > 0) { p.lethals--; this.throwEquipment(p, p.loadout.lethal, true); }
    if (pressed & BTN.tactical && p.tacticals > 0) { p.tacticals--; this.throwEquipment(p, p.loadout.tactical, false); }
    const wantFire = g.stats.auto ? (b & BTN.fire) !== 0 : (pressed & BTN.fire) !== 0;
    if (wantFire && g.stats.burst && !p.burstLeft) p.burstLeft = g.stats.burst;
    const firing = g.stats.burst ? p.burstLeft > 0 : wantFire;
    const sprintReady = p.clock - p.lastSprintClock >= g.stats.sprintToFire * p.fx.sprintToFireMult;
    if (firing && !p.reloadEnd && p.clock >= p.swapEnd && p.clock >= p.nextFire && g.ammo > 0 && p.move.slideT <= 0 && p.move.mantleT < 0 && !p.move.sprinting && sprintReady) {
      p.nextFire = Math.max(p.nextFire, p.clock - TICK_DT) + fireInterval(g.stats);
      if (g.stats.magSize > 0 && g.stats.reserve + g.stats.magSize > 0) g.ammo--;
      if (p.burstLeft) p.burstLeft--;
      p.firingUntil = this.time + 0.1;
      if (!g.suppressed) p.lastFireUnsuppressed = this.time;
      this.fire(p, g);
    } else if (wantFire && p.clock < p.nextFire - fireInterval(g.stats) * 1.5) p.flags.badFire++;
  }

  private eye(p: SimPlayer): [number, number, number] { return [p.move.x, p.move.y + height(p.move) - MOVE.eye, p.move.z]; }

  /** Server-authoritative hitscan with lag compensation. */
  private fire(p: SimPlayer, g: Gun) {
    const s = g.stats;
    const [ex, ey, ez] = this.eye(p);
    const rewindTick = clampRewind(this.tick, p.viewTick);
    if (s.splash > 0 && s.bulletVelocity < 200) {
      const d = dirFrom(p.yaw, p.pitch);
      const tw = this.world.raycast(ex, ey, ez, d[0], d[1], d[2], 150);
      let t = Number.isFinite(tw) ? tw : 150;
      for (const q of this.players.values()) {
        if (q === p || !q.alive || !this.isEnemy(p, q)) continue;
        const h = q.hist.at(rewindTick);
        const hit = h && rayPlayer(ex, ey, ez, d[0], d[1], d[2], h);
        if (hit && hit.t < t) t = hit.t;
      }
      this.explode(ex + d[0] * t, ey + d[1] * t, ez + d[2] * t, s.splash, s.damage, p.id, g.id);
      return;
    }
    const moving = Math.hypot(p.move.vx, p.move.vz) > 3;
    const hip = s.hipSpread * p.fx.hipSpreadMult * (moving ? 1.4 : 1) * (p.move.grounded ? 1 : 1.8);
    const spreadDeg = hip + (s.adsSpread - hip) * p.adsT;
    const maxRange = s.rangeFar < 5 ? s.rangeFar : 250;
    for (let k = 0; k < s.pellets; k++) {
      const sy = (this.rnd() * 2 - 1) * spreadDeg * (Math.PI / 180), sp = (this.rnd() * 2 - 1) * spreadDeg * (Math.PI / 180);
      const d = dirFrom(p.yaw + sy, p.pitch + sp);
      const wallT = this.world.raycast(ex, ey, ez, d[0], d[1], d[2], maxRange);
      let best: { t: number; zone: Zone; q: SimPlayer } | null = null;
      for (const q of this.players.values()) {
        if (q === p || !q.alive || !this.isEnemy(p, q)) continue;
        const h = q.hist.at(rewindTick);
        if (!h || !h.alive) continue;
        const hit = rayPlayer(ex, ey, ez, d[0], d[1], d[2], h);
        if (hit && hit.t < wallT && hit.t <= maxRange && (!best || hit.t < best.t)) best = { ...hit, q };
      }
      if (best) this.damage(best.q, damageAt(s, best.t, best.zone), p, g.id, best.zone === 'head', best.t);
    }
  }

  private melee(p: SimPlayer) {
    const [ex, ey, ez] = this.eye(p);
    const d = dirFrom(p.yaw, p.pitch);
    for (const q of this.players.values()) {
      if (q === p || !q.alive || !this.isEnemy(p, q)) continue;
      const h = q.hist.at(clampRewind(this.tick, p.viewTick)) ?? q.hist.latest;
      if (!h) continue;
      const hit = rayPlayer(ex, ey, ez, d[0], d[1], d[2], { ...h, x: h.x, z: h.z });
      if (hit && hit.t <= MELEE_RANGE && hit.t < this.world.raycast(ex, ey, ez, d[0], d[1], d[2], MELEE_RANGE)) {
        this.damage(q, 135, p, 'melee', false, hit.t);
        return;
      }
    }
  }

  private throwEquipment(p: SimPlayer, kind: string, lethal: boolean) {
    const [ex, ey, ez] = this.eye(p);
    if (kind === 'claymore') {
      const id = this.nextObjId++;
      const e: Equipment = { id, kind, owner: p.id, team: p.team, x: p.move.x - Math.sin(p.yaw) * 0.6, y: p.move.y, z: p.move.z - Math.cos(p.yaw) * 0.6, yaw: p.yaw, armed: this.time + 1 };
      this.equipment.set(id, e);
      this.announceEquip(e);
      return;
    }
    const def = lethal ? LETHAL_DEF[kind] : TACTICAL_DEF[kind];
    if (!def) return;
    const d = dirFrom(p.yaw, p.pitch + 0.12);
    const pr: Projectile = { id: this.nextObjId++, kind, owner: p.id, x: ex + d[0] * 0.5, y: ey + d[1] * 0.5, z: ez + d[2] * 0.5, vx: d[0] * def.speed + p.move.vx * 0.5, vy: d[1] * def.speed + 1.5, vz: d[2] * def.speed + p.move.vz * 0.5, fuse: def.fuse, stuck: false };
    this.projectiles.push(pr);
    this.events.push({ t: 'proj', id: pr.id, kind, owner: p.id, x: pr.x, y: pr.y, z: pr.z, vx: pr.vx, vy: pr.vy, vz: pr.vz });
  }

  private stepProjectiles() {
    const dt = TICK_DT;
    this.projectiles = this.projectiles.filter((pr) => {
      pr.fuse -= dt;
      const owner = this.players.get(pr.owner);
      if (!pr.stuck) {
        pr.vy -= MOVE.gravity * dt;
        const sp = Math.hypot(pr.vx, pr.vy, pr.vz), step = sp * dt;
        if (step > 0) {
          const dx = pr.vx / sp, dy = pr.vy / sp, dz = pr.vz / sp;
          const t = this.world.raycast(pr.x, pr.y, pr.z, dx, dy, dz, step);
          const def = LETHAL_DEF[pr.kind];
          if (def?.impactKill && owner) {
            for (const q of this.players.values()) {
              if (q === owner || !q.alive || !this.isEnemy(owner, q)) continue;
              const hit = rayPlayer(pr.x, pr.y, pr.z, dx, dy, dz, { x: q.move.x, y: q.move.y, z: q.move.z, h: height(q.move) });
              if (hit && hit.t <= Math.min(step, t)) { this.damage(q, def.dmg, owner, pr.kind, hit.zone === 'head', 0); this.events.push({ t: 'boom', id: pr.id, kind: pr.kind, x: pr.x, y: pr.y, z: pr.z, r: 0 }); return false; }
            }
          }
          if (Number.isFinite(t)) {
            pr.x += dx * Math.max(0, t - 0.05); pr.y += dy * Math.max(0, t - 0.05); pr.z += dz * Math.max(0, t - 0.05);
            if (def?.stick) { pr.stuck = true; pr.vx = pr.vy = pr.vz = 0; }
            else if (def?.impactKill) { this.events.push({ t: 'boom', id: pr.id, kind: pr.kind, x: pr.x, y: pr.y, z: pr.z, r: 0 }); return false; }
            else { pr.vx *= 0.35; pr.vz *= 0.35; pr.vy = Math.abs(pr.vy) > 2 && dy < 0 ? -pr.vy * 0.3 : 0; if (dy >= 0) { pr.vx = -pr.vx; pr.vz = -pr.vz; } }
          } else { pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt; }
        }
      }
      if (pr.fuse > 0) return true;
      this.detonate(pr);
      return false;
    });
  }

  private detonate(pr: Projectile) {
    const owner = this.players.get(pr.owner);
    const lethal = LETHAL_DEF[pr.kind], tac = TACTICAL_DEF[pr.kind];
    this.events.push({ t: 'boom', id: pr.id, kind: pr.kind, x: pr.x, y: pr.y, z: pr.z, r: lethal?.radius ?? tac?.radius ?? 0 });
    if (lethal && lethal.radius > 0) { this.explode(pr.x, pr.y, pr.z, lethal.radius, lethal.dmg, pr.owner, pr.kind); return; }
    if (!tac || !owner) return;
    if (pr.kind === 'smoke') { this.events.push({ t: 'smoke', x: pr.x, y: pr.y, z: pr.z, dur: 12 }); return; }
    if (pr.kind === 'decoy') { this.decoys.push({ x: pr.x, z: pr.z, team: owner.team, until: this.time + 15, owner: owner.id }); return; }
    for (const q of this.players.values()) {
      if (!q.alive || (q !== owner && !this.isEnemy(owner, q))) continue;
      const [ex, ey, ez] = this.eye(q);
      const dist = Math.hypot(ex - pr.x, ey - pr.y, ez - pr.z);
      if (dist > tac.radius) continue;
      const dx = (pr.x - ex) / dist, dy = (pr.y - ey) / dist, dz = (pr.z - ez) / dist;
      if (Number.isFinite(this.world.raycast(ex, ey, ez, dx, dy, dz, dist - 0.1))) continue; // occluded
      const k = (1 - dist / tac.radius) * q.fx.stunResist * (q === owner ? 0.5 : 1);
      if (pr.kind === 'flash') {
        const facing = Math.max(0, dx * dirFrom(q.yaw, q.pitch)[0] + dy * dirFrom(q.yaw, q.pitch)[1] + dz * dirFrom(q.yaw, q.pitch)[2]);
        const strength = Math.min(1, k * (0.5 + 0.5 * facing) * 1.6);
        this.direct.push({ to: q.id, ev: { t: 'flash', strength: +strength.toFixed(2), dur: +(3.5 * strength).toFixed(2) } });
      } else {
        const dur = +(4 * k).toFixed(2);
        q.move.stunT = Math.max(q.move.stunT, dur);
        this.direct.push({ to: q.id, ev: { t: 'stun', dur } });
      }
    }
  }

  private announceEquip(e: Equipment) {
    // Owners' team always sees it; enemies only with Engineer (seeEquipment) or when within 12 m.
    for (const q of this.players.values()) {
      const friendly = this.teams ? q.team === e.team : q.id === e.owner;
      if (friendly || q.fx.seeEquipment || Math.hypot(q.move.x - e.x, q.move.z - e.z) < 12) {
        this.direct.push({ to: q.id, ev: { t: 'equip', id: e.id, kind: e.kind, owner: e.owner, team: e.team, x: e.x, y: e.y, z: e.z, yaw: e.yaw } });
      }
    }
  }

  private stepEquipment() {
    for (const [id, e] of this.equipment) {
      const owner = this.players.get(e.owner);
      if (!owner) { this.equipment.delete(id); this.events.push({ t: 'equipGone', id }); continue; }
      if (this.time < e.armed) continue;
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
      for (const q of this.players.values()) {
        if (!q.alive || !this.isEnemy(owner, q)) continue;
        const dx = q.move.x - e.x, dz = q.move.z - e.z, dist = Math.hypot(dx, dz);
        if (dist > 2.5 || Math.abs(q.move.y - e.y) > 1.5) continue;
        if ((dx * fx + dz * fz) / Math.max(0.01, dist) < 0.3) continue; // only the front arc
        this.equipment.delete(id);
        this.events.push({ t: 'equipGone', id });
        this.events.push({ t: 'boom', id, kind: e.kind, x: e.x, y: e.y + 0.3, z: e.z, r: 4 });
        this.explode(e.x, e.y + 0.3, e.z, 4, 160, e.owner, 'claymore');
        break;
      }
    }
  }

  isEnemy(a: SimPlayer, b: SimPlayer) { return !this.teams || a.team !== b.team; }

  private explode(x: number, y: number, z: number, radius: number, dmg: number, owner: number, weapon: string) {
    const src = this.players.get(owner);
    for (const q of this.players.values()) {
      if (!q.alive) continue;
      if (src && q !== src && !this.isEnemy(src, q)) continue;
      const cy = q.move.y + 0.9;
      const d = Math.hypot(q.move.x - x, cy - y, q.move.z - z);
      if (d > radius) continue;
      if (d > 0.3 && Number.isFinite(this.world.raycast(x, y, z, (q.move.x - x) / d, (cy - y) / d, (q.move.z - z) / d, d - 0.2))) continue; // cover blocks blast
      const amt = dmg * (1 - (d / radius) * 0.8) * (q === src ? 0.5 : 1) * q.fx.explosiveDamageMult;
      this.damage(q, amt, src ?? null, weapon, false, d);
    }
  }

  damage(q: SimPlayer, amount: number, by: SimPlayer | null, weapon: string, head: boolean, dist = 0) {
    if (!q.alive || amount <= 0) return;
    q.health -= amount;
    q.lastHurt = this.time;
    if (by && by !== q) { q.damagers.set(by.id, (q.damagers.get(by.id) ?? 0) + amount); this.events.push({ t: 'hit', victim: q.id, dmg: Math.round(amount), head }); }
    if (q.health <= 0) this.kill(q, by, weapon, head, dist);
  }

  private kill(q: SimPlayer, by: SimPlayer | null, weapon: string, head: boolean, dist: number) {
    q.alive = false; q.health = 0;
    q.respawnAt = this.time + RESPAWN_S;
    q.stats.deaths++;
    this.events.push({ t: 'kill', killer: by?.id ?? -1, victim: q.id, weapon, head, tick: this.tick });
    for (const [aid] of q.damagers) {
      const a = this.players.get(aid);
      if (a && a !== by) { a.stats.assists++; a.stats.score += 50; }
    }
    if (by && by !== q) {
      by.stats.kills++;
      if (head) by.stats.headshots++;
      by.streak++;
      by.stats.bestStreak = Math.max(by.stats.bestStreak, by.streak);
      by.stats.score += 100;
      const w = WEAPONS[weapon];
      if (w) {
        const prev = by.weaponDelta[weapon] ?? { ...EMPTY_PROGRESS, xp: 0 };
        const double = this.time - by.lastKillTime < 1.5;
        by.weaponDelta[weapon] = { ...recordKill(prev, { cls: w.cls, dist, head, ads: by.adsT > 0.5, double, streakNoDeath: by.streak }), xp: prev.xp + WEAPON_XP.kill + (head ? WEAPON_XP.headshot : 0) };
        if (by.fx.scavenger) { const g = by.guns.find((x) => x.id === weapon); if (g) g.reserve = Math.min(g.stats.reserve * 2, g.reserve + g.stats.magSize); }
      }
      by.lastKillTime = this.time;
      for (const id of by.loadout.streaks) {
        if (streakCost(id, by.loadout.perks) === by.streak) { by.earnedStreaks.push(id); this.events.push({ t: 'streak', id: by.id, streak: `earned:${id}` }); }
      }
      if (this.mode === 'tdm') this.teamScore[by.team]++;
      if (this.mode === 'ffa') this.ffaScore.set(by.id, (this.ffaScore.get(by.id) ?? 0) + 1);
      if (this.mode === 'kc') {
        const id = this.nextObjId++;
        this.tags.set(id, { x: q.move.x, y: q.move.y, z: q.move.z, team: q.team, victim: q.id, expires: this.time + 30 });
        this.events.push({ t: 'tag', id, x: q.move.x, y: q.move.y, z: q.move.z, team: q.team });
      }
    }
    this.emitRoster();
  }

  /** Client asks to use an earned killstreak. */
  useStreak(id: number, streakId: string): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive) return false;
    const i = p.earnedStreaks.indexOf(streakId);
    if (i < 0) return false;
    p.earnedStreaks.splice(i, 1);
    this.events.push({ t: 'streak', id, streak: `used:${streakId}` });
    const now = this.time;
    const radarKey = this.teams ? p.team : p.id;
    const enemies = [...this.players.values()].filter((q) => q.alive && this.isEnemy(p, q));
    switch (streakId) {
      case 'scout': this.scoutUntil.set(radarKey, now + 20); break;
      case 'counter': for (const q of enemies) this.jamUntil.set(this.teams ? q.team : q.id, now + 20); break;
      case 'supply': p.guns.forEach((g) => (g.reserve = g.stats.reserve)); p.lethals = 1 + p.fx.extraLethal; p.tacticals = 1; break;
      case 'mortar':
        for (let k = 0; k < 3; k++) {
          const e = enemies[Math.floor(this.rnd() * enemies.length)];
          if (!e) break;
          this.strikes.push({ at: now + 1.5 + k * 0.8, x: e.move.x + (this.rnd() - 0.5) * 4, y: e.move.y, z: e.move.z + (this.rnd() - 0.5) * 4, owner: id, radius: 6, dmg: 140, weapon: 'streak_mortar' });
        }
        break;
      case 'gunship': case 'dogs':
        for (let k = 0; k < (streakId === 'dogs' ? 20 : 12); k++) this.strikes.push({ at: now + 1 + k * 1.5, x: NaN, y: streakId === 'dogs' ? 1 : 0, z: 0, owner: id, radius: 2.5, dmg: streakId === 'dogs' ? 110 : 70, weapon: `streak_${streakId}` });
        break;
      case 'emp': for (const q of enemies) { this.jamUntil.set(this.teams ? q.team : q.id, now + 30); q.earnedStreaks.length = 0; } break;
    }
    return true;
  }

  private stepStrikes(now: number) {
    this.strikes = this.strikes.filter((s) => {
      if (now < s.at) return true;
      const owner = this.players.get(s.owner);
      if (!owner) return false;
      if (Number.isNaN(s.x)) {
        const dogs = s.y === 1;
        const targets = [...this.players.values()].filter((q) => q.alive && this.isEnemy(owner, q) && (dogs || !Number.isFinite(this.world.raycast(q.move.x, q.move.y + 1.8, q.move.z, 0, 1, 0, 40))));
        const t = targets[Math.floor(this.rnd() * targets.length)];
        if (t) { this.events.push({ t: 'boom', id: 0, kind: s.weapon, x: t.move.x, y: t.move.y, z: t.move.z, r: s.radius }); this.explode(t.move.x, t.move.y + 0.5, t.move.z, s.radius, s.dmg, s.owner, s.weapon); }
      } else { this.events.push({ t: 'boom', id: 0, kind: s.weapon, x: s.x, y: s.y, z: s.z, r: s.radius }); this.explode(s.x, s.y + 0.5, s.z, s.radius, s.dmg, s.owner, s.weapon); }
      return false;
    });
  }

  /**
   * Radar (1 Hz): each viewer sees enemies that fired an unsuppressed weapon in the last 1.5 s, plus
   * every enemy while their side's Scout Drone is up — except Ghostwire/Cold Nerve users — plus decoys.
   * Jammed viewers get nothing.
   */
  private radarSweep() {
    const now = this.time;
    this.decoys = this.decoys.filter((d) => d.until > now);
    for (const v of this.players.values()) {
      const key = this.teams ? v.team : v.id;
      const jammed = (this.jamUntil.get(key) ?? 0) > now;
      const pts: { x: number; z: number; id: number }[] = [];
      if (!jammed) {
        const scout = (this.scoutUntil.get(key) ?? 0) > now;
        for (const q of this.players.values()) {
          if (q === v || !q.alive || !this.isEnemy(v, q)) continue;
          if ((scout && !q.fx.radarHidden) || now - q.lastFireUnsuppressed < 1.5) pts.push({ x: Math.round(q.move.x), z: Math.round(q.move.z), id: q.id });
        }
        for (const d of this.decoys) if (this.teams ? d.team !== v.team : d.owner !== v.id) pts.push({ x: Math.round(d.x + (this.rnd() - 0.5) * 6), z: Math.round(d.z + (this.rnd() - 0.5) * 6), id: 0 });
      }
      this.direct.push({ to: v.id, ev: { t: 'radar', pts, jammed } });
    }
  }

  private stepMode() {
    const now = this.time;
    if (this.mode === 'dom') {
      this.map.flags.forEach((f, i) => {
        const c: [number, number] = [0, 0];
        for (const p of this.players.values()) if (p.alive && Math.hypot(p.move.x - f.x, p.move.z - f.z) < 4 && Math.abs(p.move.y - f.y) < 3) c[p.team]++;
        const before = flagOwner(this.flags[i]);
        this.flags[i] = stepFlag(this.flags[i], c[0], c[1], TICK_DT);
        const after = flagOwner(this.flags[i]);
        if (after !== before && after !== -1) for (const p of this.players.values()) if (p.alive && p.team === after && Math.hypot(p.move.x - f.x, p.move.z - f.z) < 4) { p.stats.captures++; p.stats.score += 150; }
      });
      if (this.tick % (TICK_RATE * 5) === 0) for (const f of this.flags) { const o = flagOwner(f); if (o !== -1) this.teamScore[o]++; }
    }
    if (this.mode === 'kc') {
      for (const [id, t] of this.tags) {
        if (now > t.expires) { this.tags.delete(id); this.events.push({ t: 'tagGone', id }); continue; }
        for (const p of this.players.values()) {
          if (!p.alive || Math.hypot(p.move.x - t.x, p.move.z - t.z) > 1.5 || Math.abs(p.move.y - t.y) > 2) continue;
          if (p.team !== t.team) { this.teamScore[p.team]++; p.stats.confirms++; p.stats.score += 50; }
          else { p.stats.denies++; p.stats.score += 25; }
          this.tags.delete(id); this.events.push({ t: 'tagGone', id });
          break;
        }
      }
    }
  }

  private checkEnd() {
    const limit = this.scoreLimit;
    let reason = '';
    if (this.timeLeft <= 0) reason = 'time';
    if (this.teams && Math.max(...this.teamScore) >= limit) reason = 'score';
    if (!this.teams && Math.max(0, ...this.ffaScore.values()) >= limit) reason = 'score';
    if (reason) this.endMatch(reason);
  }

  winner(): number {
    if (this.teams) return this.teamScore[0] === this.teamScore[1] ? -1 : this.teamScore[0] > this.teamScore[1] ? 0 : 1;
    let best = -1, bs = -1;
    for (const [id, s] of this.ffaScore) if (s > bs) { bs = s; best = id; }
    return best;
  }

  endMatch(reason: string) {
    if (this.ended) return;
    this.ended = true;
    const w = this.winner();
    const xp: Record<number, number> = {}, dollars: Record<number, number> = {};
    for (const p of this.players.values()) {
      p.stats.completed = true;
      p.stats.won = this.teams ? p.team === w : p.id === w;
      xp[p.id] = matchXp(p.stats);
      dollars[p.id] = matchDollars(xp[p.id]);
    }
    this.events.push({ t: 'end', winner: w, xp, dollars, reason });
  }

  emitRoster() {
    this.events.push({ t: 'roster', players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, level: p.level, prestige: p.prestige, kills: p.stats.kills, deaths: p.stats.deaths, score: p.stats.score, quiet: p.fx.footstepVolume < 1, noPlate: p.fx.hideNameplate })) });
  }

  drainEvents(): ServerEvent[] { const e = this.events; this.events = []; return e; }
  drainDirect() { const d = this.direct; this.direct = []; return d; }

  entityState(p: SimPlayer): EntityState {
    let flags = 0;
    if (p.move.crouched) flags |= EF.crouch;
    if (p.move.slideT > 0) flags |= EF.slide;
    if (!p.alive) flags |= EF.dead;
    if (p.adsT > 0.5) flags |= EF.ads;
    if (this.time < p.firingUntil) flags |= EF.firing;
    if (p.team === 1) flags |= EF.team1;
    if (p.move.grounded) flags |= EF.grounded;
    return { id: p.id, x: p.move.x, y: p.move.y, z: p.move.z, yaw: p.yaw, pitch: p.pitch, flags, health: p.health, weapon: WEAPON_INDEX[p.guns[p.active].id] ?? 0 };
  }

  selfState(p: SimPlayer): SelfState {
    const g = p.guns[p.active], m = p.move;
    let mask = 0;
    p.loadout.streaks.forEach((s, i) => { if (p.earnedStreaks.includes(s)) mask |= 1 << i; });
    return {
      x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz,
      moveFlags: (m.grounded ? 1 : 0) | (m.crouched ? 2 : 0) | (m.mantleT >= 0 ? 4 : 0) | (m.sprinting ? 8 : 0),
      slideT: Math.max(0, m.slideT), slideCd: m.slideCd, tacT: m.tacT, tacRecharge: m.tacRecharge, stunT: m.stunT,
      mantleT: m.mantleT, mfx: m.mfx, mfy: m.mfy, mfz: m.mfz, mtx: m.mtx, mty: m.mty, mtz: m.mtz,
      health: p.health, ammo: g.ammo, reserve: g.reserve, weapon: WEAPON_INDEX[g.id] ?? 0, lethals: p.lethals, tacticals: p.tacticals, streakMask: mask, streak: p.streak,
    };
  }

  /**
   * Interest management: entities to send to `viewer` this tick. Near players every tick;
   * far (> 45 m, not teammates) every other tick; far dead players skipped.
   */
  visibleTo(viewer: SimPlayer): EntityState[] {
    const out: EntityState[] = [];
    for (const q of this.players.values()) {
      if (q === viewer) continue;
      const d = Math.hypot(q.move.x - viewer.move.x, q.move.z - viewer.move.z);
      const mate = this.teams && q.team === viewer.team;
      if (!mate && d > 45 && (this.tick + q.id) % 2) continue;
      if (!q.alive && d > 60) continue;
      out.push(this.entityState(q));
    }
    return out;
  }
}

export function dirFrom(yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
