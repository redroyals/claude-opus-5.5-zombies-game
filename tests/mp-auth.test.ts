import { describe, expect, it } from 'vitest';
import { signToken, verifySso, mintSession, verifySession, playerIdForEmail, cleanName } from '../server/src/auth';
import { camoPayouts } from '../server/src/db';

const SECRET = 'a'.repeat(64), OTHER = 'b'.repeat(64);

describe('auth', () => {
  it('verifies sikhi.io SSO handoff tokens (sig, expiry, issuer)', async () => {
    const good = await signToken({ email: 'x@y.z', name: 'X', iat: Date.now(), exp: Date.now() + 60_000, iss: 'sikhi.io' }, SECRET);
    expect((await verifySso(good, SECRET))?.email).toBe('x@y.z');
    expect(await verifySso(good, OTHER)).toBeNull();
    const expired = await signToken({ email: 'x@y.z', name: 'X', iat: 0, exp: Date.now() - 1, iss: 'sikhi.io' }, SECRET);
    expect(await verifySso(expired, SECRET)).toBeNull();
    const wrongIss = await signToken({ email: 'x@y.z', name: 'X', iat: 0, exp: Date.now() + 60_000, iss: 'evil' }, SECRET);
    expect(await verifySso(wrongIss, SECRET)).toBeNull();
    const [body, sig] = good.split('.');
    expect(await verifySso(`${body}x.${sig}`, SECRET)).toBeNull();
  });
  it('game sessions round-trip and ids are stable per email', async () => {
    const t = await mintSession('u_1', 'Op', SECRET);
    expect((await verifySession(t, SECRET))?.sub).toBe('u_1');
    expect(await verifySession(t, OTHER)).toBeNull();
    expect((await playerIdForEmail('A@B.com ')).id).toBe((await playerIdForEmail('a@b.com')).id);
    expect(cleanName('<script>', 'Guest')).toBe('script');
    expect(cleanName('a', 'Guest')).toBe('Guest');
  });
});

describe('camo payouts', () => {
  it('pays once per newly unlocked camo', () => {
    const before = { ar_kestrel: { xp: 0, kills: 24, headshots: 0, longshots: 0, hipKills: 0, doubleKills: 0, noDeathTriples: 0, adsKills: 0, pointBlank: 0 } };
    const delta = { ar_kestrel: { xp: 100, kills: 1, headshots: 0, longshots: 0, hipKills: 0, doubleKills: 0, noDeathTriples: 0, adsKills: 1, pointBlank: 0 } };
    expect(camoPayouts(before, delta)).toEqual([{ weapon: 'ar_kestrel', camo: 'woodland', dollars: 100 }]);
    expect(camoPayouts(before, {})).toEqual([]);
  });
});
