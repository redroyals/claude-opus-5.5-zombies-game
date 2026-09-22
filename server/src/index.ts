// Worker entry: HTTP API (auth, profile, classes, shop, matchmaking) + WebSocket routing to rooms.
import { Matchmaker } from './matchmaker';
import { MatchRoom } from './room';
import { bearer, cleanName, mintSession, playerIdForEmail, verifySession, verifySso } from './auth';
import { buy, doPrestige, loadProfile, saveClass, upsertPlayer, useUnlockToken, unlocksOf } from './db';
import { MODES, MODE_IDS, type ModeId } from '../../src/shared/modes';
import { MAP_BY_ID, MAPS } from '../../src/shared/maps';
import { UNLOCK_TABLE, type UnlockKind } from '../../src/shared/unlocks';
import { COSMETICS } from '../../src/data/cosmetics';
import type { Env } from './env';

export { Matchmaker, MatchRoom };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clampOpt = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);
const json = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'cache-control': 'no-store' } });

function region(req: Request): string {
  const c = (req as Request & { cf?: { continent?: string } }).cf?.continent;
  return typeof c === 'string' ? c : 'XX';
}

async function hashShard(s: string, n: number): Promise<number> {
  if (n <= 1) return 0;
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return (d[0] | (d[1] << 8)) % n;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (env.API_LIMIT && path.startsWith('/api/')) {
        const { success } = await env.API_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') ?? 'local' });
        if (!success) return json({ error: 'slow down' }, 429);
      }
      if (path === '/api/config') return json({ modes: MODES, maps: MAPS.map((m) => ({ id: m.id, name: m.name, city: m.city })), ssoIssuer: env.SSO_ISSUER_URL, devAuth: env.DEV_AUTH === '1' });

      // --- auth --------------------------------------------------------------------------------
      if (path === '/api/auth/sso' && req.method === 'POST') {
        const { token } = (await req.json()) as { token?: string };
        const sso = token ? await verifySso(token, env.SSO_SHARED_SECRET) : null;
        if (!sso) return json({ error: 'invalid or expired sign-in' }, 401);
        const { id, emailHash } = await playerIdForEmail(sso.email);
        const name = cleanName(sso.name ?? sso.email.split('@')[0], `Operator${emailHash.slice(0, 4)}`);
        await upsertPlayer(env.GAME_DB, id, emailHash, name);
        return json({ session: await mintSession(id, name, env.GAME_SESSION_SECRET), profile: await loadProfile(env.GAME_DB, id) });
      }
      if (path === '/api/auth/dev' && req.method === 'POST') {
        if (env.DEV_AUTH !== '1') return json({ error: 'disabled' }, 404);
        const { name } = (await req.json()) as { name?: string };
        const n = cleanName(name, 'DevPlayer');
        const { id, emailHash } = await playerIdForEmail(`${n.toLowerCase()}@dev.local`);
        await upsertPlayer(env.GAME_DB, id, emailHash, n);
        return json({ session: await mintSession(id, n, env.GAME_SESSION_SECRET), profile: await loadProfile(env.GAME_DB, id) });
      }

      // --- profile / progression (auth required) ----------------------------------------------
      if (path.startsWith('/api/me')) {
        const s = await verifySession(bearer(req), env.GAME_SESSION_SECRET);
        if (!s) return json({ error: 'sign in required' }, 401);
        const profile = await loadProfile(env.GAME_DB, s.sub);
        if (!profile) return json({ error: 'no profile' }, 404);
        if (path === '/api/me' && req.method === 'GET') return json({ profile, unlocks: unlocksOf(profile) });
        const m = path.match(/^\/api\/me\/classes\/(\d+)$/);
        if (m && req.method === 'PUT') {
          const errs = await saveClass(env.GAME_DB, profile, Number(m[1]), await req.json());
          return errs.length ? json({ errors: errs }, 400) : json({ ok: true });
        }
        if (path === '/api/me/buy' && req.method === 'POST') {
          const { item, nonce } = (await req.json()) as { item?: string; nonce?: string };
          const r = await buy(env.GAME_DB, profile.id, String(item), String(nonce ?? crypto.randomUUID()));
          return json(r, r.ok ? 200 : 400);
        }
        if (path === '/api/me/unlock' && req.method === 'POST') {
          const { kind, id } = (await req.json()) as { kind?: UnlockKind; id?: string };
          const r = await useUnlockToken(env.GAME_DB, profile, kind as UnlockKind, String(id));
          return json(r, r.ok ? 200 : 400);
        }
        if (path === '/api/me/prestige' && req.method === 'POST') { const r = await doPrestige(env.GAME_DB, profile); return json(r, r.ok ? 200 : 400); }
      }
      if (path === '/api/catalog') return json({ unlocks: UNLOCK_TABLE, cosmetics: COSMETICS });

      // --- matchmaking --------------------------------------------------------------------------
      if (path === '/api/quickplay') {
        const mode = (url.searchParams.get('mode') ?? 'tdm') as ModeId;
        if (!MODE_IDS.includes(mode)) return json({ error: 'bad mode' }, 400);
        const n = Math.max(1, Number(env.MM_SHARDS ?? 1) | 0);
        const shard = `${region(req)}:${mode}:${await hashShard(req.headers.get('cf-connecting-ip') ?? String(Math.random()), n)}`;
        const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName(shard));
        return mm.fetch(`https://mm/quick?mode=${mode}&shard=${encodeURIComponent(shard)}`);
      }
      if (path === '/api/private' && req.method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as { mode?: ModeId; map?: string; cap?: number; scoreLimit?: number; timeLimitSec?: number };
        const mode = MODE_IDS.includes(body.mode as ModeId) ? (body.mode as ModeId) : 'tdm';
        const map = body.map && MAP_BY_ID[body.map] ? body.map : MAPS[0].id;
        const cap = Math.max(2, Math.min(Number(env.ROOM_CAP_MAX ?? 18), Number(body.cap ?? MODES[mode].maxPlayers) | 0));
        let code = '';
        const rnd = crypto.getRandomValues(new Uint8Array(6));
        for (const b of rnd) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
        const name = `p-${code}`;
        const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName(name));
        await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ name, mode, map, private: true, cap, scoreLimit: clampOpt(body.scoreLimit, 1, 500), timeLimitSec: clampOpt(body.timeLimitSec, 60, 3600) }) });
        return json({ code, room: name });
      }
      const ws = path.match(/^\/ws\/((?:q|p)-[A-Za-z0-9-]{3,40})$/);
      if (ws) {
        if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
        const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName(ws[1]));
        return stub.fetch(req);
      }
      if (path.startsWith('/api/') || path.startsWith('/ws/')) return json({ error: 'not found' }, 404);
      return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Dead Signal MP server', { status: 200 });
    } catch (e) {
      console.error(e);
      return json({ error: 'server error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
