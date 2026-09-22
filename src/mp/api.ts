// Thin HTTP client for the MP Worker (same origin; vite proxies /api and /ws in dev).
import type { Loadout, Unlocks } from '../shared/loadout';
import type { WeaponProgress } from '../shared/camos';

export interface Profile {
  id: string; name: string; xp: number; prestige: number; level: number; kills: number; deaths: number; wins: number; matches: number; balance: number;
  weaponProgress: Record<string, WeaponProgress & { xp: number }>; camos: Record<string, string[]>; classes: Loadout[]; inventory: Record<string, number>; tokenUnlocks: string[];
}

const KEY = 'ds_session';
export const session = { get: () => localStorage.getItem(KEY), set: (s: string | null) => (s ? localStorage.setItem(KEY, s) : localStorage.removeItem(KEY)) };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = session.get();
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s}` } : {}), ...(init.headers ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${r.status}`), { body, status: r.status });
  return body as T;
}

export const api = {
  config: () => call<{ modes: Record<string, { id: string; name: string; desc: string; maxPlayers: number }>; maps: { id: string; name: string; city: string }[]; ssoIssuer: string; devAuth: boolean }>('/api/config'),
  sso: (token: string) => call<{ session: string; profile: Profile }>('/api/auth/sso', { method: 'POST', body: JSON.stringify({ token }) }),
  dev: (name: string) => call<{ session: string; profile: Profile }>('/api/auth/dev', { method: 'POST', body: JSON.stringify({ name }) }),
  me: () => call<{ profile: Profile; unlocks: Unlocks }>('/api/me'),
  saveClass: (slot: number, l: Loadout) => call<{ ok: boolean }>(`/api/me/classes/${slot}`, { method: 'PUT', body: JSON.stringify(l) }),
  buy: (item: string) => call<{ ok: boolean }>('/api/me/buy', { method: 'POST', body: JSON.stringify({ item, nonce: crypto.randomUUID() }) }),
  unlock: (kind: string, id: string) => call<{ ok: boolean }>('/api/me/unlock', { method: 'POST', body: JSON.stringify({ kind, id }) }),
  prestige: () => call<{ ok: boolean }>('/api/me/prestige', { method: 'POST' }),
  quick: (mode: string) => call<{ room: string }>(`/api/quickplay?mode=${mode}`),
  createPrivate: (o: { mode: string; map: string; scoreLimit?: number }) => call<{ code: string; room: string }>('/api/private', { method: 'POST', body: JSON.stringify(o) }),
};
