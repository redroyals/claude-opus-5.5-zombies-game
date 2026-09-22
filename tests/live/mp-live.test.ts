// Live end-to-end test against `wrangler dev` (run: MP_URL=http://127.0.0.1:8787 pnpm vitest run tests/live).
// Two authenticated clients join a private TDM room on the firing range, see each other in snapshots,
// one shoots the other, the kill registers, the match ends (score limit 1) and XP/dollars persist in D1.
import { describe, expect, it } from 'vitest';
import { Reader, S2C, decodeSnapshot, encodeInputs, type EntityState, type SelfState, type ServerEvent } from '../../src/shared/protocol';
import { BTN, MOVE } from '../../src/shared/movement';

const URL_ = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MP_URL;

class Bot {
  ws!: WebSocket;
  you = -1;
  known = new Map<number, EntityState>();
  self: SelfState | null = null;
  tick = 0;
  events: ServerEvent[] = [];
  seq = 1;
  constructor(public name: string, public token: string) {}
  connect(room: string) {
    return new Promise<void>((res, rej) => {
      this.ws = new WebSocket(`${URL_!.replace('http', 'ws')}/ws/${room}?token=${encodeURIComponent(this.token)}`);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onerror = (e) => rej(e);
      this.ws.onmessage = (m) => {
        if (typeof m.data === 'string') { const ev = JSON.parse(m.data) as ServerEvent; this.events.push(ev); if (ev.t === 'welcome') { this.you = ev.you; res(); } return; }
        const r = new Reader(m.data as ArrayBuffer);
        if (r.u8() !== S2C.Snapshot) return;
        const s = decodeSnapshot(r, this.known);
        this.tick = s.tick; if (s.self) this.self = s.self;
      };
    });
  }
  input(yaw: number, pitch: number, buttons: number) {
    this.ws.send(encodeInputs({ viewTick: this.tick, inputs: [{ seq: this.seq++, fwd: 0, strafe: 0, yaw, pitch, buttons }] }));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function auth(name: string) {
  const r = await fetch(`${URL_}/api/auth/dev`, { method: 'POST', body: JSON.stringify({ name }) });
  return (await r.json()) as { session: string; profile: { xp: number; balance: number } };
}

describe.skipIf(!URL_)('live multiplayer (wrangler dev)', () => {
  it('two clients see each other, a kill registers, results persist', async () => {
    const tag = Date.now().toString(36).slice(-5);
    const a = await auth(`Alpha${tag}`), b = await auth(`Bravo${tag}`);
    const { code } = (await (await fetch(`${URL_}/api/private`, { method: 'POST', body: JSON.stringify({ mode: 'tdm', map: 'range', scoreLimit: 1 }) })).json()) as { code: string };
    const A = new Bot('A', a.session), B = new Bot('B', b.session);
    await A.connect(`p-${code}`); await B.connect(`p-${code}`);
    for (let i = 0; i < 40 && (!A.known.has(B.you) || !B.known.has(A.you)); i++) { A.input(0, 0, 0); B.input(Math.PI, 0, 0); await sleep(33); }
    expect(A.known.has(B.you)).toBe(true);
    expect(B.known.has(A.you)).toBe(true);
    // A shoots at B's chest until the kill event arrives.
    let killed = false;
    for (let i = 0; i < 300 && !killed; i++) {
      const me = A.self!, t = A.known.get(B.you)!;
      const dx = t.x - me.x, dz = t.z - me.z, dy = t.y + 1.2 - (me.y + MOVE.stand - MOVE.eye);
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      A.input(yaw, pitch, BTN.fire | BTN.ads);
      B.input(Math.PI, 0, 0);
      await sleep(33);
      killed = A.events.some((e) => e.t === 'kill' && e.killer === A.you && e.victim === B.you);
    }
    expect(killed).toBe(true);
    for (let i = 0; i < 60 && !A.events.some((e) => e.t === 'end'); i++) await sleep(50);
    expect(A.events.some((e) => e.t === 'end')).toBe(true);
    await sleep(1500); // persistence is async after the end event
    const me = (await (await fetch(`${URL_}/api/me`, { headers: { authorization: `Bearer ${a.session}` } })).json()) as { profile: { xp: number; balance: number; kills: number; weaponProgress: Record<string, { kills: number }> } };
    expect(me.profile.kills).toBe(1);
    expect(me.profile.xp).toBeGreaterThan(500);
    expect(me.profile.balance).toBeGreaterThan(0);
    expect(me.profile.weaponProgress.ar_kestrel.kills).toBe(1);
    A.ws.close(); B.ws.close();
  }, 30_000);

  it('quick play puts two players in the same room; guests allowed', async () => {
    const r1 = (await (await fetch(`${URL_}/api/quickplay?mode=ffa`)).json()) as { room: string };
    const r2 = (await (await fetch(`${URL_}/api/quickplay?mode=ffa`)).json()) as { room: string };
    expect(r1.room).toBe(r2.room);
    const g = new Bot('G', '');
    await g.connect(r1.room);
    expect(g.events.find((e) => e.t === 'welcome' && e.guest)).toBeTruthy();
    g.ws.close();
  });

  it('rejects forged purchases (no dollars)', async () => {
    const c = await auth(`Charlie${Date.now().toString(36).slice(-5)}`);
    const r = await fetch(`${URL_}/api/me/buy`, { method: 'POST', headers: { authorization: `Bearer ${c.session}` }, body: JSON.stringify({ item: 'unlock_token' }) });
    expect(r.status).toBe(400);
  });
});
