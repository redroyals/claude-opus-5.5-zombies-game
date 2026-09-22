// Matchmaker Durable Object. One instance per shard `${region}:${mode}:${n}`. Holds a small table of
// public rooms and their live counts (rooms report on every join/leave). Quick play picks the fullest
// room that still has space (reserving a slot for 15 s), or spins up a new MatchRoom. Rooms are
// separate DOs, so capacity scales horizontally: more players => more rooms => more DO instances,
// spread by Cloudflare across machines. A hot shard is split by raising MM_SHARDS.
import { DurableObject } from 'cloudflare:workers';
import { MODES, type ModeId } from '../../src/shared/modes';
import { MAPS } from '../../src/shared/maps';
import type { Env } from './env';

interface RoomInfo { name: string; count: number; cap: number; open: boolean; reserved: number[]; updated: number }

const RESERVE_MS = 15_000, STALE_MS = 120_000;

export class Matchmaker extends DurableObject<Env> {
  private rooms = new Map<string, RoomInfo>();
  private loaded = false;

  private async load() {
    if (this.loaded) return;
    const saved = await this.ctx.storage.get<RoomInfo[]>('rooms');
    for (const r of saved ?? []) this.rooms.set(r.name, r);
    this.loaded = true;
  }
  private async save() { await this.ctx.storage.put('rooms', [...this.rooms.values()]); }

  async fetch(req: Request): Promise<Response> {
    await this.load();
    const url = new URL(req.url);
    const t = Date.now();
    if (url.pathname === '/report') {
      const r = (await req.json()) as { name: string; count: number; cap: number; open: boolean };
      const cur = this.rooms.get(r.name);
      if (r.count <= 0 && !r.open) this.rooms.delete(r.name);
      else this.rooms.set(r.name, { ...r, reserved: (cur?.reserved ?? []).filter((x) => x > t).slice(r.count > (cur?.count ?? 0) ? 1 : 0), updated: t });
      await this.save();
      return new Response('ok');
    }
    if (url.pathname === '/quick') {
      const mode = (url.searchParams.get('mode') ?? 'tdm') as ModeId;
      if (!MODES[mode]) return Response.json({ error: 'bad mode' }, { status: 400 });
      let best: RoomInfo | null = null;
      for (const r of this.rooms.values()) {
        r.reserved = r.reserved.filter((x) => x > t);
        if (t - r.updated > STALE_MS && r.count === 0) { this.rooms.delete(r.name); continue; }
        const load = r.count + r.reserved.length;
        if (!r.open || load >= r.cap) continue;
        if (!best || load > best.count + best.reserved.length) best = r;
      }
      if (!best) {
        const name = `q-${mode}-${crypto.randomUUID().slice(0, 8)}`;
        const map = MAPS[Math.floor(Math.random() * MAPS.length)].id;
        const stub = this.env.MATCH_ROOM.get(this.env.MATCH_ROOM.idFromName(name));
        await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ name, mode, map, private: false, cap: MODES[mode].maxPlayers, shard: this.ctx.id.name ?? url.searchParams.get('shard') }) });
        best = { name, count: 0, cap: MODES[mode].maxPlayers, open: true, reserved: [], updated: t };
        this.rooms.set(name, best);
      }
      best.reserved.push(t + RESERVE_MS);
      await this.save();
      return Response.json({ room: best.name });
    }
    if (url.pathname === '/stats') {
      let players = 0;
      for (const r of this.rooms.values()) players += r.count;
      return Response.json({ rooms: this.rooms.size, players });
    }
    return new Response('not found', { status: 404 });
  }
}
