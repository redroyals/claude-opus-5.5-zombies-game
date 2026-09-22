// Compact binary wire protocol (ArrayBuffer, little-endian). Pure; used by client, server and tests.
// Hot path (inputs, snapshots) is binary. Rare control messages (roster, killfeed, match end) are JSON
// text frames — they are <1% of traffic and keep the schema easy to evolve.
import type { MoveInput } from './movement';

export const PROTOCOL_VERSION = 1;

export const enum C2S { Input = 1, Ping = 2 }
export const enum S2C { Snapshot = 10, Pong = 11 }

// ---- quantization ----------------------------------------------------------------------------
/** Positions: 1/64 m in i16 => ±512 m range, 1.6 cm precision. */
export const POS_Q = 64;
export const qPos = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * POS_Q)));
export const dqPos = (q: number) => q / POS_Q;
/** Yaw: full circle in u16. */
export const qYaw = (a: number) => { const t = (a / (Math.PI * 2)) % 1; return Math.round((t < 0 ? t + 1 : t) * 65536) & 0xffff; };
export const dqYaw = (q: number) => (q / 65536) * Math.PI * 2;
/** Pitch: ±π/2 in i16. */
export const qPitch = (a: number) => Math.max(-32767, Math.min(32767, Math.round((a / (Math.PI / 2)) * 32767)));
export const dqPitch = (q: number) => (q / 32767) * (Math.PI / 2);

export class Writer {
  private buf: ArrayBuffer;
  private dv: DataView;
  o = 0;
  constructor(size = 1024) { this.buf = new ArrayBuffer(size); this.dv = new DataView(this.buf); }
  private need(n: number) {
    if (this.o + n <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(new Uint8Array(this.buf));
    this.buf = nb; this.dv = new DataView(nb);
  }
  u8(v: number) { this.need(1); this.dv.setUint8(this.o, v); this.o += 1; return this; }
  i8(v: number) { this.need(1); this.dv.setInt8(this.o, v); this.o += 1; return this; }
  u16(v: number) { this.need(2); this.dv.setUint16(this.o, v, true); this.o += 2; return this; }
  i16(v: number) { this.need(2); this.dv.setInt16(this.o, v, true); this.o += 2; return this; }
  u32(v: number) { this.need(4); this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; return this; }
  f32(v: number) { this.need(4); this.dv.setFloat32(this.o, v, true); this.o += 4; return this; }
  done(): ArrayBuffer { return this.buf.slice(0, this.o); }
}

export class Reader {
  private dv: DataView;
  o = 0;
  constructor(buf: ArrayBuffer) { this.dv = new DataView(buf); }
  get left() { return this.dv.byteLength - this.o; }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  i8() { const v = this.dv.getInt8(this.o); this.o += 1; return v; }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  i16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
}

// ---- client -> server: input batch -----------------------------------------------------------
export interface InputBatch {
  /** Client's interpolated view of server time in ticks (fractional), used for lag compensation. */
  viewTick: number;
  inputs: MoveInput[];
}

/** Max inputs per batch (client normally sends 1-2; resends after hiccups are capped). */
export const MAX_BATCH = 8;

export function encodeInputs(b: InputBatch): ArrayBuffer {
  const w = new Writer(10 + b.inputs.length * 8).u8(C2S.Input).f32(b.viewTick).u8(Math.min(MAX_BATCH, b.inputs.length));
  const list = b.inputs.slice(-MAX_BATCH);
  w.u32(list.length ? list[0].seq : 0);
  for (const i of list) w.i8(i.fwd).i8(i.strafe).u16(qYaw(i.yaw)).i16(qPitch(i.pitch)).u16(i.buttons);
  return w.done();
}

export function decodeInputs(r: Reader): InputBatch {
  const viewTick = r.f32();
  const n = Math.min(MAX_BATCH, r.u8());
  const first = r.u32();
  const inputs: MoveInput[] = [];
  for (let k = 0; k < n; k++) {
    if (r.left < 8) break;
    inputs.push({ seq: first + k, fwd: r.i8(), strafe: r.i8(), yaw: dqYaw(r.u16()), pitch: dqPitch(r.i16()), buttons: r.u16() });
  }
  return { viewTick: Number.isFinite(viewTick) ? viewTick : 0, inputs };
}

// ---- server -> client: snapshots ---------------------------------------------------------------
/** Entity flags byte. */
export const EF = { crouch: 1, slide: 2, dead: 4, ads: 8, firing: 16, team1: 32, grounded: 64, spawnProtect: 128 } as const;

export interface EntityState {
  id: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  flags: number;
  health: number;
  weapon: number;
}

export interface SelfState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** MoveState extras needed for exact reconciliation. */
  moveFlags: number; // 1 grounded, 2 crouched, 4 mantling, 8 sprinting
  slideT: number; slideCd: number;
  tacT: number; tacRecharge: number; stunT: number;
  mantleT: number; mfx: number; mfy: number; mfz: number; mtx: number; mty: number; mtz: number;
  lethals: number; tacticals: number;
  /** Earned but unused killstreak ids (indices into the player's 3 streak slots bitmask). */
  streakMask: number;
  /** Kills this life. */
  streak: number;
  health: number;
  ammo: number;
  reserve: number;
  weapon: number;
}

export interface Snapshot {
  tick: number;
  ackSeq: number;
  self: SelfState | null;
  /** Entities changed since the last snapshot sent to this client (full replace for new ones). */
  entities: EntityState[];
  removed: number[];
}

const M_POS = 1, M_ANG = 2, M_FLAGS = 4, M_HP = 8, M_WPN = 16;

/**
 * Delta encode against `prev` (what this client last received for that id). WebSockets are reliable
 * and ordered, so "last sent" == "last received" and no ack bookkeeping is needed for baselines.
 */
export function encodeSnapshot(s: Snapshot, prev: Map<number, EntityState>): ArrayBuffer {
  const w = new Writer(64 + s.entities.length * 16).u8(S2C.Snapshot).u32(s.tick).u32(s.ackSeq);
  if (s.self) {
    const m = s.self;
    w.u8(1).f32(m.x).f32(m.y).f32(m.z).f32(m.vx).f32(m.vy).f32(m.vz).u8(m.moveFlags)
      .u16(Math.round(m.slideT * 1000)).u16(Math.round(m.slideCd * 1000))
      .u16(Math.round(m.tacT * 1000)).u16(Math.round(m.tacRecharge * 1000)).u16(Math.round(m.stunT * 1000))
      .u8(Math.max(0, Math.min(255, Math.round(m.health)))).u16(m.ammo).u16(m.reserve).u8(m.weapon)
      .u8(m.lethals).u8(m.tacticals).u8(m.streakMask).u8(Math.min(255, m.streak));
    if (m.moveFlags & 4) w.u16(Math.round(m.mantleT * 65535)).f32(m.mfx).f32(m.mfy).f32(m.mfz).f32(m.mtx).f32(m.mty).f32(m.mtz);
  } else w.u8(0);
  const countAt = w.o;
  w.u8(0);
  let count = 0;
  for (const e of s.entities) {
    const p = prev.get(e.id);
    let mask = 0;
    const qx = qPos(e.x), qy = qPos(e.y), qz = qPos(e.z), qyw = qYaw(e.yaw), qp = qPitch(e.pitch);
    if (!p || qPos(p.x) !== qx || qPos(p.y) !== qy || qPos(p.z) !== qz) mask |= M_POS;
    if (!p || qYaw(p.yaw) !== qyw || qPitch(p.pitch) >> 8 !== qp >> 8) mask |= M_ANG;
    if (!p || p.flags !== e.flags) mask |= M_FLAGS;
    if (!p || Math.round(p.health) !== Math.round(e.health)) mask |= M_HP;
    if (!p || p.weapon !== e.weapon) mask |= M_WPN;
    if (!mask) continue;
    w.u8(e.id).u8(mask);
    if (mask & M_POS) w.i16(qx).i16(qy).i16(qz);
    if (mask & M_ANG) w.u16(qyw).i8(qp >> 8);
    if (mask & M_FLAGS) w.u8(e.flags);
    if (mask & M_HP) w.u8(Math.max(0, Math.min(255, Math.round(e.health))));
    if (mask & M_WPN) w.u8(e.weapon);
    prev.set(e.id, { ...e });
    count++;
  }
  const end = w.o;
  w.o = countAt; w.u8(count); w.o = end;
  w.u8(s.removed.length);
  for (const id of s.removed) { w.u8(id); prev.delete(id); }
  return w.done();
}

/** Decode, applying deltas onto `known` (the client's entity table). Returns full states for changed ids. */
export function decodeSnapshot(r: Reader, known: Map<number, EntityState>): Snapshot {
  const tick = r.u32(), ackSeq = r.u32();
  let self: SelfState | null = null;
  if (r.u8()) {
    const x = r.f32(), y = r.f32(), z = r.f32(), vx = r.f32(), vy = r.f32(), vz = r.f32(), moveFlags = r.u8();
    const slideT = r.u16() / 1000, slideCd = r.u16() / 1000, tacT = r.u16() / 1000, tacRecharge = r.u16() / 1000, stunT = r.u16() / 1000;
    const health = r.u8(), ammo = r.u16(), reserve = r.u16(), weapon = r.u8(), lethals = r.u8(), tacticals = r.u8(), streakMask = r.u8(), streak = r.u8();
    let mantleT = -1, mfx = 0, mfy = 0, mfz = 0, mtx = 0, mty = 0, mtz = 0;
    if (moveFlags & 4) { mantleT = r.u16() / 65535; mfx = r.f32(); mfy = r.f32(); mfz = r.f32(); mtx = r.f32(); mty = r.f32(); mtz = r.f32(); }
    self = { x, y, z, vx, vy, vz, moveFlags, slideT, slideCd, tacT, tacRecharge, stunT, mantleT, mfx, mfy, mfz, mtx, mty, mtz, health, ammo, reserve, weapon, lethals, tacticals, streakMask, streak };
  }
  const n = r.u8();
  const entities: EntityState[] = [];
  for (let k = 0; k < n; k++) {
    const id = r.u8(), mask = r.u8();
    const e: EntityState = { ...(known.get(id) ?? { id, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, health: 100, weapon: 0 }) };
    if (mask & M_POS) { e.x = dqPos(r.i16()); e.y = dqPos(r.i16()); e.z = dqPos(r.i16()); }
    if (mask & M_ANG) { e.yaw = dqYaw(r.u16()); e.pitch = dqPitch(r.i8() << 8); }
    if (mask & M_FLAGS) e.flags = r.u8();
    if (mask & M_HP) e.health = r.u8();
    if (mask & M_WPN) e.weapon = r.u8();
    known.set(id, e);
    entities.push(e);
  }
  const removed: number[] = [];
  const rn = r.u8();
  for (let k = 0; k < rn; k++) { const id = r.u8(); removed.push(id); known.delete(id); }
  return { tick, ackSeq, self, entities, removed };
}

export function encodePing(t: number): ArrayBuffer { return new Writer(5).u8(C2S.Ping).u32(t).done(); }
export function encodePong(t: number): ArrayBuffer { return new Writer(5).u8(S2C.Pong).u32(t).done(); }

// ---- JSON control messages -------------------------------------------------------------------
export type ServerEvent =
  | { t: 'welcome'; you: number; room: string; mode: string; map: string; tick: number; tickRate: number; private: boolean; guest: boolean; name: string; protocol: number }
  | { t: 'roster'; players: { id: number; name: string; team: number; level: number; prestige: number; kills: number; deaths: number; score: number; quiet: boolean; noPlate: boolean }[] }
  | { t: 'kill'; killer: number; victim: number; weapon: string; head: boolean; tick: number }
  | { t: 'hit'; victim: number; dmg: number; head: boolean }
  | { t: 'streak'; id: number; streak: string }
  | { t: 'score'; teams: number[]; flags?: number[]; timeLeft: number }
  | { t: 'tag'; id: number; x: number; y: number; z: number; team: number } // kill confirmed dog tag
  | { t: 'tagGone'; id: number }
  | { t: 'end'; winner: number; xp: Record<number, number>; dollars: Record<number, number>; reason: string }
  | { t: 'proj'; id: number; kind: string; owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  | { t: 'boom'; id: number; kind: string; x: number; y: number; z: number; r: number }
  | { t: 'equip'; id: number; kind: string; owner: number; team: number; x: number; y: number; z: number; yaw: number }
  | { t: 'equipGone'; id: number }
  | { t: 'flash'; strength: number; dur: number }
  | { t: 'stun'; dur: number }
  | { t: 'smoke'; x: number; y: number; z: number; dur: number }
  | { t: 'radar'; pts: { x: number; z: number; id: number }[]; jammed: boolean }
  | { t: 'camo'; weapon: string; camo: string }
  | { t: 'error'; msg: string };

export type ClientEvent =
  | { t: 'hello'; name?: string; classIndex?: number; loadout?: unknown }
  | { t: 'class'; loadout: unknown }
  | { t: 'streak'; slot: number };
