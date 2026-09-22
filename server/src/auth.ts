// Identity. sikhi.io moved off Clerk to its own auth (2026-09-05) and exposes a cross-site SSO
// handoff: GET https://sikhi.io/api/sso/issue?return=<our url> redirects back with ?sso_token=…
// (HMAC-SHA256 over base64url JSON {email,name,iat,exp,iss:"sikhi.io"}, 60 s TTL, shared secret
// SSO_SHARED_SECRET). We verify that, key the player by a hash of the email, and mint our own
// longer-lived game session token signed with GAME_SESSION_SECRET. Guests need neither.

export interface SsoPayload { email: string; name: string | null; iat: number; exp: number; iss: string }
export interface GameSession { sub: string; name: string; exp: number }

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secretHex: string): Promise<CryptoKey> {
  if (!/^[0-9a-f]{64}$/i.test(secretHex)) throw new Error('secret must be 32-byte hex');
  const bytes = new Uint8Array(secretHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(payload: object, secretHex: string): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secretHex), enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function verifyRaw<T>(token: string, secretHex: string): Promise<T | null> {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secretHex), b64urlDecode(sig) as BufferSource, enc.encode(body) as BufferSource);
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as T;
  } catch {
    return null;
  }
}

/** Verify a sikhi.io SSO handoff token (signature, expiry, issuer). */
export async function verifySso(token: string, secretHex: string): Promise<SsoPayload | null> {
  const p = await verifyRaw<SsoPayload>(token, secretHex);
  if (!p || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
  if (p.iss !== 'sikhi.io' || typeof p.email !== 'string' || !p.email.includes('@')) return null;
  return p;
}

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export async function mintSession(sub: string, name: string, secretHex: string): Promise<string> {
  return signToken({ sub, name, exp: Date.now() + SESSION_TTL_MS } satisfies GameSession, secretHex);
}

export async function verifySession(token: string | null | undefined, secretHex: string): Promise<GameSession | null> {
  if (!token) return null;
  const s = await verifyRaw<GameSession>(token, secretHex);
  if (!s || typeof s.sub !== 'string' || typeof s.exp !== 'number' || s.exp < Date.now()) return null;
  return s;
}

export async function playerIdForEmail(email: string): Promise<{ id: string; emailHash: string }> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(email.trim().toLowerCase())));
  const hex = [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { id: `u_${hex.slice(0, 24)}`, emailHash: hex };
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Public display name: letters/digits/space/_- only, 3..20 chars. */
export function cleanName(n: unknown, fallback: string): string {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20);
  return s.length >= 3 ? s : fallback;
}
