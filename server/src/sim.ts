// Authoritative match simulation. Pure TypeScript (no Workers APIs) so it is unit-testable and could
// run anywhere. The MatchRoom Durable Object feeds it inputs and ships its snapshots/events.
import { BoxWorld, newMoveState, stepMove, height, BTN, MOVE, TICK_DT, TICK_RATE, type MoveInput, type MoveState } from '../../src/shared/movement';
import { MAP_BY_ID, type MapDef } from '../../src/shared/maps';
import { History, clampRewind, rayPlayer, type Zone } from '../../src/shared/lagcomp';
import { EF, type EntityState, type SelfState, type ServerEvent } from '../../src/shared/protocol';
import { MODES, chooseSpawn, pickTeam, stepFlag, flagOwner, type ModeId } from '../../src/shared/modes';
import { WEAPONS, WEAPON_INDEX, WEAPON_LIST, applyAttachments, damageAt, fireInterval, type WeaponStats } from '../../src/data/weapons';
import { DEFAULT_LOADOUTS, validateLoadout, streakCost, STREAK_BY_ID, type Loadout, type Unlocks } from '../../src/shared/loadout';
import { matchXp, type MatchStats } from '../../src/shared/progression';

export interface Gun { id: string; stats: WeaponStats; ammo: number; reserve: number }

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
  burstLeft: number;
  prevButtons: number;
  ads: boolean;
  firingUntil: number;
  /** Sim clock in seconds advanced per processed input. */
  clock: number;
  queue: MoveInput[];
  lastSeq: number;
  bucket: number;
  viewTick: number;
  lastInput: MoveInput | null;
  loadout: Loadout;
  streak: number;
  earnedStreaks: string[];
  stats: MatchStats & { deaths: number; score: number };
  weaponKills: Record<string, number>;
  damagers: Map<number, number>;
  hist: History;
  /** Anti-cheat counters (dropped inputs / impossible fire). */
  flags: { droppedInputs: number; badFire: number };
}

export interface SimOptions { mode: ModeId; map: string; seed?: number }

const RESPAWN_S = 3;
const REGEN_DELAY = 4.5, REGEN_RATE = 25;
const BUCKET_MAX = 6;
const MAX_ID = 250;

export class MatchSim {
  tick = 0;
  mode: ModeId;
  map: MapDef;
  world: BoxWorld;
  players = new Map<number, SimPlayer>();
  events: ServerEvent[] = [];
  teamScore: [number, number] = [0, 0];
  ffaScore = new Map<number, number>();
  flags: number[] = [0, 0, 0];
  tags = new Map<number, { x: number; y: number; z: number; team: number; victim: number; expires: number }>();
  timeLeft: number;
  ended = false;
  private nextTagId = 1;
  private rngState: number;
  private strikes: { at: number; x: number; y: number; z: number; owner: number; radius: number; dmg: number; weapon: string }[] = [];

  constructor(opts: SimOptions) {
    this.mode = opts.mode;
    this.map = MAP_BY_ID[opts.map] ?? MAP_BY_ID.kowloon;
    this.world = new BoxWorld(this.map.boxes);
    this.timeLeft = MODES[this.mode].timeLimitSec;
    this.rngState = (opts.seed ?? 12345) >>> 0;
  }

  rnd(): number {
    let t = (this.rngState = (this.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get time() { return this.tick * TICK_DT; }

  freeId(): number {
    for (let i = 1; i < MAX_ID; i++) if (!this.players.has(i)) return i;
    return -1;
  }

  addPlayer(p: { name: string; userId: string | null; level?: number; prestige?: number; loadout?: Loadout; unlocks?: Unlocks }): SimPlayer | null {
    const id = this.freeId();
    if (id < 0) return null;
    const counts: [number, number] = [0, 0];
    for (const q of this.players.values()) counts[q.team]++;
    const team = MODES[this.mode].teams ? pickTeam(counts, this.teamScore) : ((id % 2) as 0 | 1);
    const unlocks = p.unlocks ?? { level: p.level ?? 1, prestige: p.prestige ?? 0, weaponKills: {} };
    const loadout = p.loadout && validateLoadout(p.loadout, unlocks).length === 0 ? p.loadout : DEFAULT_LOADOUTS[0];
    const sp: SimPlayer = {
      id, name: p.name.slice(0, 20), userId: p.userId, team, level: p.level ?? 1, prestige: p.prestige ?? 0,
      move: newMoveState(), yaw: 0, pitch: 0, health: 100, alive: false, respawnAt: this.time, lastHurt: -99,
      guns: this.makeGuns(loadout), active: 0, nextFire: 0, reloadEnd: 0, burstLeft: 0, prevButtons: 0, ads: false, firingUntil: 0,
      clock: 0, queue: [], lastSeq: 0, bucket: BUCKET_MAX, viewTick: 0, lastInput: null, loadout, streak: 0, earnedStreaks: [],
      stats: { kills: 0, headshots: 0, assists: 0, confirms: 0, denies: 0, captures: 0, defends: 0, bestStreak: 0, won: false, completed: false, deaths: 0, score: 0 },
      weaponKills: {}, damagers: new Map(), hist: new History(), flags: { droppedInputs: 0, badFire: 0 },
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
      return { id: w.id, stats, ammo: stats.magSize, reserve: stats.reserve };
    };
    return [mk(l.primary, l.primaryAttachments), mk(l.secondary, l.secondaryAttachments)];
  }

  spawn(p: SimPlayer) {
    const enemies = [...this.players.values()].filter((q) => q !== p && q.alive && (!MODES[this.mode].teams || q.team !== p.team)).map((q) => q.move);
    const s = chooseSpawn(this.map.spawns, p.team, enemies, MODES[this.mode].teams, () => this.rnd());
    p.move = newMoveState(s.x, s.y, s.z);
    p.yaw = s.yaw; p.pitch = 0;
    p.health = 100; p.alive = true;
    p.guns = this.makeGuns(p.loadout); p.active = 0;
    p.reloadEnd = 0; p.nextFire = 0; p.burstLeft = 0;
    p.streak = 0; p.damagers.clear();
    p.hist.clear();
  }

  /** Queue client inputs; seq must increase. Returns number accepted. */
  enqueue(id: number, viewTick: number, inputs: MoveInput[]): number {
    const p = this.players.get(id);
    if (!p) return 0;
    let n = 0;
    for (const i of inputs) {
      if (i.seq <= p.lastSeq) continue; // duplicate/resend
      if (p.queue.length >= 16) { p.flags.droppedInputs++; continue; }
      p.queue.push(i); p.lastSeq = i.seq; n++;
    }
    p.viewTick = viewTick;
    return n;
  }

  step() {
    if (this.ended) return;
    this.tick++;
    const now = this.time;
    for (const p of this.players.values()) {
      p.bucket = Math.min(BUCKET_MAX, p.bucket + 1);
      if (!p.alive) {
        p.queue.length = 0; // inputs while dead are ignored but still acked
        if (now >= p.respawnAt) this.spawn(p);
        continue;
      }
      let processed = 0;
      // Anti speed-hack: one input costs one bucket token; tokens refill 1/tick.
      while (p.queue.length && p.bucket >= 1) {
        const inp = p.queue.shift()!;
        p.bucket -= 1;
        this.applyInput(p, inp);
        processed++;
        if (!p.alive) break;
      }
      if (p.queue.length > 8) { p.flags.droppedInputs += p.queue.length - 8; p.queue.splice(0, p.queue.length - 8); }
      if (!processed && p.lastInput) {
        // Starved: extrapolate gravity only (no free movement) so players can't hang in the air.
        this.applyInput(p, { ...p.lastInput, fwd: 0, strafe: 0, buttons: 0, seq: p.lastInput.seq }, false);
      }
      if (p.alive && now - p.lastHurt > REGEN_DELAY && p.health < 100) p.health = Math.min(100, p.health + REGEN_RATE * TICK_DT);
      p.hist.push({ tick: this.tick, x: p.move.x, y: p.move.y, z: p.move.z, h: height(p.move), alive: p.alive });
    }
    this.stepStrikes(now);
    this.stepMode();
    this.timeLeft -= TICK_DT;
    if (this.tick % TICK_RATE === 0) this.events.push({ t: 'score', teams: this.teamScore, flags: this.mode === 'dom' ? this.flags.map((f) => +f.toFixed(2)) : undefined, timeLeft: Math.max(0, Math.round(this.timeLeft)) });
    this.checkEnd();
  }

  private applyInput(p: SimPlayer, inp: MoveInput, real = true) {
    const gun = p.guns[p.active];
    stepMove(p.move, inp, this.world, gun.stats.mobility);
    p.clock += TICK_DT;
    if (!real) return;
    p.yaw = inp.yaw; p.pitch = Math.max(-1.5, Math.min(1.5, inp.pitch));
    p.lastInput = inp;
    const b = inp.buttons, pressed = b & ~p.prevButtons;
    p.prevButtons = b;
    p.ads = (b & BTN.ads) !== 0;
    if (pressed & BTN.swap && p.reloadEnd <= p.clock) { p.active = p.active ? 0 : 1; p.nextFire = p.clock + 0.35; p.burstLeft = 0; }
    const g = p.guns[p.active];
    if (p.reloadEnd && p.clock >= p.reloadEnd) {
      const take = Math.min(g.stats.magSize - g.ammo, g.reserve);
      g.ammo += take; g.reserve -= take; p.reloadEnd = 0;
    }
    if ((pressed & BTN.reload || (g.ammo === 0 && b & BTN.fire)) && !p.reloadEnd && g.ammo < g.stats.magSize && g.reserve > 0) {
      p.reloadEnd = p.clock + g.stats.reloadTime; p.burstLeft = 0;
    }
    const wantFire = g.stats.auto ? (b & BTN.fire) !== 0 : (pressed & BTN.fire) !== 0;
    if (wantFire && g.stats.burst && !p.burstLeft) p.burstLeft = g.stats.burst;
    const firing = g.stats.burst ? p.burstLeft > 0 : wantFire;
    if (firing && !p.reloadEnd && p.clock >= p.nextFire && g.ammo > 0 && p.move.slideT <= 0) {
      p.nextFire = Math.max(p.nextFire, p.clock - TICK_DT) + fireInterval(g.stats);
      g.ammo--;
      if (p.burstLeft) p.burstLeft--;
      p.firingUntil = this.time + 0.1;
      this.fire(p, g);
    } else if (wantFire && p.clock < p.nextFire - fireInterval(g.stats) * 1.5) p.flags.badFire++;
  }

  /** Server-authoritative hitscan with lag compensation. */
  private fire(p: SimPlayer, g: Gun) {
    const s = g.stats;
    const eyeY = p.move.y + height(p.move) - MOVE.eye;
    const rewindTick = clampRewind(this.tick, p.viewTick);
    const spreadDeg = (p.ads ? s.adsSpread : s.hipSpread) * (Math.hypot(p.move.vx, p.move.vz) > 3 ? 1.4 : 1);
    if (s.splash > 0) {
      // Launcher: simplified instant rocket to first world/player hit, splash damage.
      const d = dirFrom(p.yaw, p.pitch);
      const tw = this.world.raycast(p.move.x, eyeY, p.move.z, d[0], d[1], d[2], 150);
      const t = Number.isFinite(tw) ? tw : 150;
      this.explode(p.move.x + d[0] * t, eyeY + d[1] * t, p.move.z + d[2] * t, s.splash, s.damage, p.id, g.id);
      return;
    }
    for (let k = 0; k < s.pellets; k++) {
      const sy = (this.rnd() * 2 - 1) * spreadDeg * (Math.PI / 180), sp = (this.rnd() * 2 - 1) * spreadDeg * (Math.PI / 180);
      const d = dirFrom(p.yaw + sy, p.pitch + sp);
      const maxRange = s.splash === 0 && s.rangeFar < 5 ? s.rangeFar : 200;
      const wallT = this.world.raycast(p.move.x, eyeY, p.move.z, d[0], d[1], d[2], maxRange);
      let best: { t: number; zone: Zone; q: SimPlayer } | null = null;
      for (const q of this.players.values()) {
        if (q === p || !q.alive || !this.isEnemy(p, q)) continue;
        const h = q.hist.at(rewindTick);
        if (!h || !h.alive) continue;
        const hit = rayPlayer(p.move.x, eyeY, p.move.z, d[0], d[1], d[2], h);
        if (hit && hit.t < wallT && hit.t <= maxRange && (!best || hit.t < best.t)) best = { ...hit, q };
      }
      if (best) this.damage(best.q, damageAt(s, best.t, best.zone), p, g.id, best.zone === 'head');
    }
  }

  isEnemy(a: SimPlayer, b: SimPlayer) { return !MODES[this.mode].teams || a.team !== b.team; }

  private explode(x: number, y: number, z: number, radius: number, dmg: number, owner: number, weapon: string) {
    const src = this.players.get(owner);
    for (const q of this.players.values()) {
      if (!q.alive) continue;
      if (src && q !== src && !this.isEnemy(src, q)) continue;
      const d = Math.hypot(q.move.x - x, q.move.y + 0.9 - y, q.move.z - z);
      if (d > radius) continue;
      const amt = dmg * (1 - d / radius) * (q === src ? 0.5 : 1);
      if (src) this.damage(q, amt, src, weapon, false); else this.damage(q, amt, null, weapon, false);
    }
  }

  damage(q: SimPlayer, amount: number, by: SimPlayer | null, weapon: string, head: boolean) {
    if (!q.alive || amount <= 0) return;
    q.health -= amount;
    q.lastHurt = this.time;
    if (by) { q.damagers.set(by.id, (q.damagers.get(by.id) ?? 0) + amount); this.events.push({ t: 'hit', victim: q.id, dmg: Math.round(amount), head }); }
    if (q.health <= 0) this.kill(q, by, weapon, head);
  }

  private kill(q: SimPlayer, by: SimPlayer | null, weapon: string, head: boolean) {
    q.alive = false; q.health = 0;
    q.respawnAt = this.time + RESPAWN_S;
    q.stats.deaths++;
    this.events.push({ t: 'kill', killer: by?.id ?? -1, victim: q.id, weapon, head, tick: this.tick });
    for (const [aid] of q.damagers) {
      const a = this.players.get(aid);
      if (a && a !== by) a.stats.assists++;
    }
    if (by && by !== q) {
      by.stats.kills++;
      if (head) by.stats.headshots++;
      by.streak++;
      by.stats.bestStreak = Math.max(by.stats.bestStreak, by.streak);
      by.weaponKills[weapon] = (by.weaponKills[weapon] ?? 0) + 1;
      by.stats.score += 100;
      for (const id of by.loadout.streaks) {
        if (streakCost(id, by.loadout.perks) === by.streak) { by.earnedStreaks.push(id); this.events.push({ t: 'streak', id: by.id, streak: `earned:${id}` }); }
      }
      if (this.mode === 'tdm') this.teamScore[by.team]++;
      if (this.mode === 'ffa') this.ffaScore.set(by.id, (this.ffaScore.get(by.id) ?? 0) + 1);
      if (this.mode === 'kc') {
        const id = this.nextTagId++;
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
    const enemies = [...this.players.values()].filter((q) => q.alive && this.isEnemy(p, q));
    const now = this.time;
    if (streakId === 'mortar') {
      for (let k = 0; k < 3; k++) {
        const e = enemies[Math.floor(this.rnd() * enemies.length)];
        if (!e) break;
        this.strikes.push({ at: now + 1.5 + k * 0.8, x: e.move.x + (this.rnd() - 0.5) * 4, y: e.move.y, z: e.move.z + (this.rnd() - 0.5) * 4, owner: id, radius: 6, dmg: 140, weapon: 'streak_mortar' });
      }
    } else if (streakId === 'gunship' || streakId === 'dogs') {
      for (let k = 0; k < 12; k++) this.strikes.push({ at: now + 1 + k * 1.5, x: NaN, y: 0, z: 0, owner: id, radius: 2.5, dmg: 70, weapon: `streak_${streakId}` });
    } else if (streakId === 'supply') {
      p.guns.forEach((g) => (g.reserve = g.stats.reserve));
    }
    return true;
  }

  private stepStrikes(now: number) {
    this.strikes = this.strikes.filter((s) => {
      if (now < s.at) return true;
      const owner = this.players.get(s.owner);
      if (!owner) return false;
      if (Number.isNaN(s.x)) {
        // Gunship: pick a random enemy that is outdoors (clear sky above).
        const targets = [...this.players.values()].filter((q) => q.alive && this.isEnemy(owner, q) && !Number.isFinite(this.world.raycast(q.move.x, q.move.y + 1.8, q.move.z, 0, 1, 0, 40)));
        const t = targets[Math.floor(this.rnd() * targets.length)];
        if (t) this.explode(t.move.x, t.move.y + 0.5, t.move.z, s.radius, s.dmg, s.owner, s.weapon);
      } else this.explode(s.x, s.y + 0.5, s.z, s.radius, s.dmg, s.owner, s.weapon);
      return false;
    });
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
        if (after !== before && after >= 0) for (const p of this.players.values()) if (p.alive && p.team === after && Math.hypot(p.move.x - f.x, p.move.z - f.z) < 4) { p.stats.captures++; p.stats.score += 150; }
      });
      if (this.tick % (TICK_RATE * 5) === 0) for (const f of this.flags) { const o = flagOwner(f); if (o >= 0) this.teamScore[o]++; }
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
    const limit = MODES[this.mode].scoreLimit;
    let reason = '';
    if (this.timeLeft <= 0) reason = 'time';
    if (MODES[this.mode].teams && Math.max(...this.teamScore) >= limit) reason = 'score';
    if (!MODES[this.mode].teams && Math.max(0, ...this.ffaScore.values()) >= limit) reason = 'score';
    if (reason) this.endMatch(reason);
  }

  winner(): number {
    if (MODES[this.mode].teams) return this.teamScore[0] === this.teamScore[1] ? -1 : this.teamScore[0] > this.teamScore[1] ? 0 : 1;
    let best = -1, bs = -1;
    for (const [id, s] of this.ffaScore) if (s > bs) { bs = s; best = id; }
    return best;
  }

  endMatch(reason: string) {
    if (this.ended) return;
    this.ended = true;
    const w = this.winner();
    const xp: Record<number, number> = {};
    for (const p of this.players.values()) {
      p.stats.completed = true;
      p.stats.won = MODES[this.mode].teams ? p.team === w : p.id === w;
      xp[p.id] = matchXp(p.stats);
    }
    this.events.push({ t: 'end', winner: w, xp, reason });
  }

  emitRoster() {
    this.events.push({ t: 'roster', players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, level: p.level, prestige: p.prestige, kills: p.stats.kills, deaths: p.stats.deaths, score: p.stats.score })) });
  }

  drainEvents(): ServerEvent[] { const e = this.events; this.events = []; return e; }

  entityState(p: SimPlayer): EntityState {
    let flags = 0;
    if (p.move.crouched) flags |= EF.crouch;
    if (p.move.slideT > 0) flags |= EF.slide;
    if (!p.alive) flags |= EF.dead;
    if (p.ads) flags |= EF.ads;
    if (this.time < p.firingUntil) flags |= EF.firing;
    if (p.team === 1) flags |= EF.team1;
    if (p.move.grounded) flags |= EF.grounded;
    return { id: p.id, x: p.move.x, y: p.move.y, z: p.move.z, yaw: p.yaw, pitch: p.pitch, flags, health: p.health, weapon: WEAPON_INDEX[p.guns[p.active].id] ?? 0 };
  }

  selfState(p: SimPlayer): SelfState {
    const g = p.guns[p.active];
    return { x: p.move.x, y: p.move.y, z: p.move.z, vx: p.move.vx, vy: p.move.vy, vz: p.move.vz, moveFlags: (p.move.grounded ? 1 : 0) | (p.move.crouched ? 2 : 0), slideT: Math.max(0, p.move.slideT), slideCd: p.move.slideCd, health: p.health, ammo: g.ammo, reserve: g.reserve, weapon: WEAPON_INDEX[g.id] ?? 0 };
  }

  /**
   * Interest management: which entities to send to `viewer` this tick. Near players every tick;
   * far ones (> 45 m and not a teammate) every other tick. Dead-and-far are skipped.
   */
  visibleTo(viewer: SimPlayer): EntityState[] {
    const out: EntityState[] = [];
    for (const q of this.players.values()) {
      if (q === viewer) continue;
      const d = Math.hypot(q.move.x - viewer.move.x, q.move.z - viewer.move.z);
      const mate = MODES[this.mode].teams && q.team === viewer.team;
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
