// Client netcode: connection, input send, client-side prediction + reconciliation, server clock
// estimation and interpolation of remote players. No three.js / DOM rendering here.
import { Reader, S2C, decodeSnapshot, encodeInputs, encodePing, type EntityState, type SelfState, type ServerEvent } from '../shared/protocol';
import { BoxWorld, newMoveState, stepMove, TICK_DT, NO_MODS, type MoveInput, type MoveState, type MoveMods } from '../shared/movement';

/** Render remote players this many ticks behind the newest server tick (smooths loss/jitter). */
export const INTERP_TICKS = 3;

interface Sample { tick: number; e: EntityState }

export class Interpolator {
  private buf = new Map<number, Sample[]>();
  push(tick: number, e: EntityState) {
    let b = this.buf.get(e.id);
    if (!b) this.buf.set(e.id, (b = []));
    if (b.length && b[b.length - 1].tick >= tick) return;
    b.push({ tick, e: { ...e } });
    if (b.length > 40) b.shift();
  }
  remove(id: number) { this.buf.delete(id); }
  ids() { return [...this.buf.keys()]; }
  /** State at fractional tick t (linear pos, shortest-arc yaw). Holds the last sample (no extrapolation beyond 2 ticks). */
  at(id: number, t: number): EntityState | null {
    const b = this.buf.get(id);
    if (!b || !b.length) return null;
    if (t <= b[0].tick) return b[0].e;
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (t >= a.tick && t <= c.tick) {
        const k = (t - a.tick) / Math.max(1e-6, c.tick - a.tick);
        let dy = c.e.yaw - a.e.yaw;
        if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
        return { ...c.e, x: a.e.x + (c.e.x - a.e.x) * k, y: a.e.y + (c.e.y - a.e.y) * k, z: a.e.z + (c.e.z - a.e.z) * k, yaw: a.e.yaw + dy * k, pitch: a.e.pitch + (c.e.pitch - a.e.pitch) * k };
      }
    }
    return b[b.length - 1].e;
  }
}

/** Server-tick clock estimate from snapshot arrival times (smoothed, never runs backwards much). */
export class ServerClock {
  private offset = 0; // serverTick - localTime*rate
  private ready = false;
  constructor(private rate = 1 / TICK_DT) {}
  observe(tick: number, nowMs: number) {
    const o = tick - (nowMs / 1000) * this.rate;
    if (!this.ready) { this.offset = o; this.ready = true; return; }
    // Take newer (later-arriving packets are delayed; the max offset is the least-delayed estimate), decay slowly.
    this.offset = o > this.offset ? this.offset + (o - this.offset) * 0.5 : this.offset + (o - this.offset) * 0.02;
  }
  tick(nowMs: number) { return (nowMs / 1000) * this.rate + this.offset; }
  get isReady() { return this.ready; }
}

/** Prediction: apply local inputs immediately, reconcile against authoritative self state. */
export class Predictor {
  state: MoveState = newMoveState();
  pending: MoveInput[] = [];
  lastError = 0;
  constructor(public world: BoxWorld, public mods: () => MoveMods = () => NO_MODS) {}
  apply(inp: MoveInput) {
    this.pending.push(inp);
    if (this.pending.length > 120) this.pending.shift();
    stepMove(this.state, inp, this.world, this.mods());
  }
  reconcile(ackSeq: number, s: SelfState) {
    this.pending = this.pending.filter((i) => i.seq > ackSeq);
    const before = { x: this.state.x, y: this.state.y, z: this.state.z };
    const m = this.state;
    Object.assign(m, { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, grounded: !!(s.moveFlags & 1), crouched: !!(s.moveFlags & 2), slideT: s.slideT, slideCd: s.slideCd, tacT: s.tacT, tacRecharge: s.tacRecharge, stunT: s.stunT, sprinting: !!(s.moveFlags & 8) });
    if (s.moveFlags & 4) Object.assign(m, { mantleT: s.mantleT, mfx: s.mfx, mfy: s.mfy, mfz: s.mfz, mtx: s.mtx, mty: s.mty, mtz: s.mtz }); else m.mantleT = -1;
    for (const i of this.pending) stepMove(m, i, this.world, this.mods());
    this.lastError = Math.hypot(m.x - before.x, m.y - before.y, m.z - before.z);
    return this.lastError;
  }
}

export interface NetHandlers {
  onEvent(ev: ServerEvent): void;
  onSnapshot(tick: number, ackSeq: number, self: SelfState | null, entities: EntityState[], removed: number[]): void;
  onClose(reason: string): void;
}

export class NetClient {
  ws: WebSocket | null = null;
  known = new Map<number, EntityState>();
  clock = new ServerClock();
  interp = new Interpolator();
  rtt = 0;
  latestTick = 0;
  bytesIn = 0;
  private pingTimer = 0;
  constructor(private h: NetHandlers) {}

  connect(url: string) {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onmessage = (m) => {
      if (typeof m.data === 'string') { try { this.h.onEvent(JSON.parse(m.data)); } catch { /* ignore */ } return; }
      const buf = m.data as ArrayBuffer;
      this.bytesIn += buf.byteLength;
      const r = new Reader(buf);
      const t = r.u8();
      if (t === S2C.Snapshot) {
        const s = decodeSnapshot(r, this.known);
        this.latestTick = Math.max(this.latestTick, s.tick);
        this.clock.observe(s.tick, performance.now());
        // Entities not included this tick are unchanged: push them too so interpolation keeps a timeline.
        for (const e of this.known.values()) this.interp.push(s.tick, e);
        for (const id of s.removed) this.interp.remove(id);
        this.h.onSnapshot(s.tick, s.ackSeq, s.self, s.entities, s.removed);
      } else if (t === S2C.Pong) {
        this.rtt = performance.now() - r.u32();
      }
    };
    ws.onclose = (e) => { clearInterval(this.pingTimer); this.h.onClose(e.reason || `closed (${e.code})`); };
    ws.onopen = () => { this.pingTimer = window.setInterval(() => this.send(encodePing(Math.floor(performance.now()) >>> 0)), 2000); };
  }

  /** Remote players are rendered INTERP_TICKS behind; this is also the viewTick sent for lag compensation. */
  renderTick(nowMs = performance.now()) { return this.clock.tick(nowMs) - INTERP_TICKS; }

  sendInputs(inputs: MoveInput[]) { this.send(encodeInputs({ viewTick: this.renderTick(), inputs })); }
  sendEvent(ev: object) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(ev)); }
  send(buf: ArrayBuffer) { if (this.ws?.readyState === 1) this.ws.send(buf); }
  close() { this.ws?.close(); this.ws = null; }
}
