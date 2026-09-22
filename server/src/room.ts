// MatchRoom Durable Object: one live match (≤18 players). Uses the WebSocket Hibernation API so an
// idle/empty room costs nothing; while players are connected a 30 Hz loop drives the MatchSim.
import { DurableObject } from 'cloudflare:workers';
import { MatchSim } from './sim';
import { Reader, C2S, decodeInputs, encodeSnapshot, encodePong, type EntityState, type ServerEvent, PROTOCOL_VERSION } from '../../src/shared/protocol';
import { TICK_RATE } from '../../src/shared/movement';
import type { ModeId } from '../../src/shared/modes';
import { MAPS } from '../../src/shared/maps';
import type { Loadout } from '../../src/shared/loadout';
import { verifySession, cleanName } from './auth';
import { loadProfile, unlocksOf, writeMatch, type Profile, type MatchResultPlayer } from './db';
import type { Env } from './env';

interface RoomMeta { name: string; mode: ModeId; map: string; private: boolean; cap: number; shard?: string | null; scoreLimit?: number; timeLimitSec?: number }
interface Attachment { pid: number; userId: string | null; name: string; guest: boolean; classIndex: number }
interface Conn { ws: WebSocket; att: Attachment; sent: Map<number, EntityState>; msgs: number; windowStart: number; profile: Profile | null }

const MAX_MSGS_PER_SEC = 90; // inputs arrive at ~30/s; allow bursts, kick floods
const MAX_TEXT = 4096;

export class MatchRoom extends DurableObject<Env> {
  private meta: RoomMeta | null = null;
  private sim: MatchSim | null = null;
  private conns = new Map<WebSocket, Conn>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private restartAt = 0;
  private matchSeq = 0;

  private async getMeta(): Promise<RoomMeta | null> {
    if (!this.meta) this.meta = (await this.ctx.storage.get<RoomMeta>('meta')) ?? null;
    return this.meta;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      const m = (await req.json()) as RoomMeta;
      if (!(await this.getMeta())) { this.meta = m; await this.ctx.storage.put('meta', m); }
      return Response.json(this.meta);
    }
    if (url.pathname === '/info') return Response.json({ meta: await this.getMeta(), players: this.ctx.getWebSockets().length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const meta = await this.getMeta();
    if (!meta) return new Response('no such room', { status: 404 });
    if (this.ctx.getWebSockets().length >= meta.cap) return new Response('room full', { status: 409 });

    const session = await verifySession(url.searchParams.get('token'), this.env.GAME_SESSION_SECRET);
    const guestName = cleanName(url.searchParams.get('name'), `Guest${Math.floor(Math.random() * 9000 + 1000)}`);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const profile = session ? await loadProfile(this.env.GAME_DB, session.sub).catch(() => null) : null;
    const att: Attachment = { pid: -1, userId: session?.sub ?? null, name: profile?.name ?? session?.name ?? guestName, guest: !session, classIndex: Math.max(0, Math.min(9, Number(url.searchParams.get('class') ?? 0) | 0)) };
    this.join(server, att, profile);
    return new Response(null, { status: 101, webSocket: client });
  }

  private ensureSim(meta: RoomMeta) {
    if (this.sim) return this.sim;
    this.sim = new MatchSim({ mode: meta.mode, map: meta.map, seed: Date.now() & 0xffffffff, scoreLimit: meta.scoreLimit, timeLimitSec: meta.timeLimitSec });
    this.matchSeq++;
    return this.sim;
  }

  private join(ws: WebSocket, att: Attachment, profile: Profile | null) {
    const meta = this.meta!;
    const sim = this.ensureSim(meta);
    const loadout: Loadout | undefined = profile?.classes[att.classIndex];
    const p = sim.addPlayer({ name: att.name, userId: att.userId, level: profile?.level ?? 1, prestige: profile?.prestige ?? 0, loadout, unlocks: profile ? unlocksOf(profile) : undefined });
    if (!p) { ws.close(1013, 'room full'); return; }
    att.pid = p.id;
    ws.serializeAttachment(att);
    this.conns.set(ws, { ws, att, sent: new Map(), msgs: 0, windowStart: Date.now(), profile });
    this.send(ws, { t: 'welcome', you: p.id, room: meta.name, mode: meta.mode, map: sim.map.id, tick: sim.tick, tickRate: TICK_RATE, private: meta.private, guest: att.guest, name: att.name, protocol: PROTOCOL_VERSION });
    this.startLoop();
    void this.report();
  }

  private send(ws: WebSocket, ev: ServerEvent) { try { ws.send(JSON.stringify(ev)); } catch { /* closed */ } }

  private startLoop() {
    if (this.loop) return;
    this.loop = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  private tick() {
    if (!this.sim || !this.meta) return;
    if (this.conns.size === 0) { clearInterval(this.loop!); this.loop = null; this.sim = null; return; } // empty: allow hibernation
    const sim = this.sim;
    if (sim.ended) {
      if (Date.now() >= this.restartAt) this.newMatch();
      return;
    }
    sim.step();
    const events = sim.drainEvents();
    const direct = sim.drainDirect();
    const eventText = events.map((e) => JSON.stringify(e));
    for (const c of this.conns.values()) {
      const p = sim.players.get(c.att.pid);
      if (!p) continue;
      const visible = sim.visibleTo(p);
      const ids = new Set(visible.map((e) => e.id));
      const removed = [...c.sent.keys()].filter((id) => !ids.has(id) && !sim.players.has(id));
      try {
        c.ws.send(encodeSnapshot({ tick: sim.tick, ackSeq: p.lastSeq, self: sim.selfState(p), entities: visible, removed }, c.sent));
        for (const t of eventText) c.ws.send(t);
      } catch { /* socket closing */ }
    }
    for (const d of direct) for (const c of this.conns.values()) if (c.att.pid === d.to) this.send(c.ws, d.ev);
    const end = events.find((e) => e.t === 'end');
    if (end && end.t === 'end') { this.restartAt = Date.now() + 15_000; void this.persist(end); }
  }

  private newMatch() {
    const meta = this.meta!;
    const idx = MAPS.findIndex((m) => m.id === (this.sim?.map.id ?? meta.map));
    const next = meta.private ? this.sim!.map.id : MAPS[(idx + 1) % MAPS.length].id;
    this.sim = new MatchSim({ mode: meta.mode, map: next, seed: Date.now() & 0xffffffff, scoreLimit: meta.scoreLimit, timeLimitSec: meta.timeLimitSec });
    this.matchSeq++;
    for (const c of this.conns.values()) {
      const pr = c.profile;
      const p = this.sim.addPlayer({ name: c.att.name, userId: c.att.userId, level: pr?.level, prestige: pr?.prestige, loadout: pr?.classes[c.att.classIndex], unlocks: pr ? unlocksOf(pr) : undefined });
      if (!p) { c.ws.close(1013, 'full'); continue; }
      c.att.pid = p.id; c.ws.serializeAttachment(c.att); c.sent.clear();
      this.send(c.ws, { t: 'welcome', you: p.id, room: meta.name, mode: meta.mode, map: next, tick: 0, tickRate: TICK_RATE, private: meta.private, guest: c.att.guest, name: c.att.name, protocol: PROTOCOL_VERSION });
    }
  }

  /** One D1 batch per match; guests are never written. */
  private async persist(end: Extract<ServerEvent, { t: 'end' }>) {
    const sim = this.sim!, meta = this.meta!;
    const matchId = `${meta.name}:${this.ctx.id.toString().slice(0, 8)}:${this.matchSeq}:${Date.now()}`;
    const rows: MatchResultPlayer[] = [];
    for (const c of this.conns.values()) {
      const p = sim.players.get(c.att.pid);
      if (!p || !p.userId || !c.profile) continue;
      rows.push({ playerId: p.userId, team: p.team, kills: p.stats.kills, deaths: p.stats.deaths, score: p.stats.score, won: p.stats.won, xp: end.xp[p.id] ?? 0, dollars: end.dollars[p.id] ?? 0, xpBefore: c.profile.xp, weaponDelta: p.weaponDelta, weaponBefore: c.profile.weaponProgress });
    }
    if (!rows.length) return;
    try {
      const camos = await writeMatch(this.env.GAME_DB, { id: matchId, mode: meta.mode, map: sim.map.id, room: meta.name, winner: end.winner, reason: end.reason }, rows);
      for (const c of this.conns.values()) {
        for (const g of camos) if (g.playerId === c.att.userId) this.send(c.ws, { t: 'camo', weapon: g.weapon, camo: g.camo });
        if (c.att.userId) c.profile = await loadProfile(this.env.GAME_DB, c.att.userId).catch(() => c.profile);
      }
    } catch (e) {
      console.error('match persist failed', matchId, e);
    }
  }

  async webSocketMessage(ws: WebSocket, msg: ArrayBuffer | string) {
    let c = this.conns.get(ws);
    if (!c) { c = await this.rehydrate(ws); if (!c) return; }
    const t = Date.now();
    if (t - c.windowStart > 1000) { c.windowStart = t; c.msgs = 0; }
    if (++c.msgs > MAX_MSGS_PER_SEC) { ws.close(1008, 'rate limit'); return; }
    if (!this.sim) return;
    if (typeof msg === 'string') {
      if (msg.length > MAX_TEXT) return;
      let ev: { t?: string; loadout?: Loadout; slot?: number; classIndex?: number };
      try { ev = JSON.parse(msg); } catch { return; }
      if (ev.t === 'class' && typeof ev.classIndex === 'number' && c.profile) {
        c.att.classIndex = Math.max(0, Math.min(9, ev.classIndex | 0));
        const errs = this.sim.setLoadout(c.att.pid, c.profile.classes[c.att.classIndex], unlocksOf(c.profile));
        if (errs.length) this.send(ws, { t: 'error', msg: errs.join('; ') });
      } else if (ev.t === 'streak' && typeof ev.slot === 'number') {
        const p = this.sim.players.get(c.att.pid);
        const id = p?.loadout.streaks[ev.slot | 0];
        if (id) this.sim.useStreak(c.att.pid, id);
      }
      return;
    }
    if (msg.byteLength < 1 || msg.byteLength > 256) return;
    const r = new Reader(msg);
    const type = r.u8();
    if (type === C2S.Input) {
      try { const b = decodeInputs(r); this.sim.enqueue(c.att.pid, b.viewTick, b.inputs); } catch { /* malformed */ }
    } else if (type === C2S.Ping && r.left >= 4) {
      ws.send(encodePong(r.u32()));
    }
  }

  /** After hibernation the in-memory maps are gone; the empty-room case simply re-creates state. */
  private async rehydrate(ws: WebSocket): Promise<Conn | undefined> {
    const meta = await this.getMeta();
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!meta || !att) { ws.close(1011, 'lost state'); return; }
    const profile = att.userId ? await loadProfile(this.env.GAME_DB, att.userId).catch(() => null) : null;
    this.join(ws, att, profile);
    return this.conns.get(ws);
  }

  async webSocketClose(ws: WebSocket) { this.drop(ws); }
  async webSocketError(ws: WebSocket) { this.drop(ws); }

  private drop(ws: WebSocket) {
    const c = this.conns.get(ws);
    this.conns.delete(ws);
    if (c && this.sim) this.sim.removePlayer(c.att.pid);
    void this.report();
  }

  private async report() {
    const meta = this.meta;
    if (!meta || meta.private || !meta.shard) return;
    const stub = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName(meta.shard));
    await stub.fetch('https://mm/report', { method: 'POST', body: JSON.stringify({ name: meta.name, count: this.conns.size, cap: meta.cap, open: true }) }).catch(() => {});
  }
}
