import { describe, expect, it } from 'vitest';
import { WEAPONS, ZOMBIE_WEAPONS, weaponArch, type WeaponId } from '../src/config';
import {
  BOX_POOL, PAP_NAMES, WALL_BUYS, WONDER_WEAPONS, bossHpForRound, boxReel, createBox, crawlerFromLegHit, isBossRound, isBoxOnly, isSpecialRound,
  papName, pickZombieType, rollBox, roundSpec, stepRounds, createRoundState, wonderBonus,
} from '../src/zombies/rules';
import { UPGRADE_TIERS } from '../src/config';
import { effectiveStats } from '../src/weapons/WeaponState';

const count = (spec: ReturnType<typeof roundSpec>, n = 4000) => {
  const c: Record<string, number> = {};
  let x = 12345;
  const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  for (let i = 0; i < n; i++) { const t = pickZombieType(spec, rnd); c[t] = (c[t] ?? 0) + 1; }
  return c;
};

describe('zombie roster mix', () => {
  it('round 1-2 are pure shamblers', () => {
    expect(count(roundSpec(1))).toEqual({ shambler: 4000 });
    expect(count(roundSpec(2))).toEqual({ shambler: 4000 });
  });
  it('runners from 3, crawlers from 4, brutes from 6', () => {
    expect(count(roundSpec(3)).runner).toBeGreaterThan(0);
    expect(count(roundSpec(3)).crawler).toBeUndefined();
    expect(count(roundSpec(4)).crawler).toBeGreaterThan(0);
    expect(count(roundSpec(4)).brute).toBeUndefined();
    expect(count(roundSpec(7)).brute).toBeGreaterThan(0);
  });
  it('special rounds are all fast', () => {
    expect(isSpecialRound(10)).toBe(true);
    expect(count(roundSpec(10))).toEqual({ fast: 4000 });
  });
  it('late rounds are mostly runners', () => {
    const c = count(roundSpec(21));
    expect(c.runner).toBeGreaterThan(c.shambler ?? 0);
  });
  it('boss every 8th round, never on specials', () => {
    expect(isBossRound(7)).toBe(false);
    expect(isBossRound(8)).toBe(true);
    expect(isBossRound(16)).toBe(true);
    expect(isBossRound(40)).toBe(false); // 40 is a special round
    expect(roundSpec(8).boss).toBe(true);
    expect(bossHpForRound(16)).toBeGreaterThan(bossHpForRound(8));
    const s = createRoundState();
    s.round = 7;
    const ev = stepRounds(s, 999, 0);
    expect(ev.started).toBe(8);
    expect(ev.boss).toBe(true);
  });
  it('leg hits can make crawlers only from walkers', () => {
    expect(crawlerFromLegHit('shambler', 100, 110, () => 0)).toBe(true);
    expect(crawlerFromLegHit('shambler', 10, 110, () => 0)).toBe(false);
    expect(crawlerFromLegHit('brute', 400, 420, () => 0)).toBe(false);
    expect(crawlerFromLegHit('runner', 100, 110, () => 0.9)).toBe(false);
  });
});

describe('weapon roster', () => {
  const ids = Object.keys(ZOMBIE_WEAPONS) as WeaponId[];
  it('has ~20 weapons with model ids equal to their id (re-skins alias an existing model)', () => {
    expect(ids.length).toBeGreaterThanOrEqual(19);
    for (const id of ids) {
      expect(WEAPONS[id].id).toBe(id);
      const mid = WEAPONS[id].modelId!;
      expect(mid === id || ids.includes(mid as WeaponId), `${id} -> ${mid}`).toBe(true);
      expect(['rifle', 'pistol', 'shotgun']).toContain(weaponArch(id));
    }
  });
  it('extraction ids still exist and alias zombie models', () => {
    expect(WEAPONS.rifle.modelId).toBe('ar_kestrel');
    expect(WEAPONS.shotgun.shellReload).toBeTruthy();
    expect(weaponArch('rifle')).toBe('rifle');
  });
  it('wall-buys and box pool are disjoint for wonder weapons; wonder weapons are box-only', () => {
    for (const w of WONDER_WEAPONS) {
      expect(isBoxOnly(w)).toBe(true);
      expect(Object.values(WALL_BUYS).some((b) => b.weapon === w)).toBe(false);
    }
    expect(isBoxOnly('smg_wren')).toBe(false);
    for (const b of Object.values(WALL_BUYS)) expect(b.ammoPrice).toBe(b.price / 2);
  });
  it('only one wonder weapon can be held', () => {
    const b = createBox();
    for (let i = 0; i < 200; i++) {
      const r = rollBox(b, ['ww_arc'], Math.random);
      if (r.kind === 'weapon') expect(WONDER_WEAPONS).not.toContain(r.weapon);
    }
  });
  it('box reel never repeats back-to-back and only shows pool weapons', () => {
    const reel = boxReel(() => 0.3, 12);
    for (let i = 1; i < reel.length; i++) expect(reel[i]).not.toBe(reel[i - 1]);
    for (const w of reel) expect(BOX_POOL.some((e) => e.weapon === w)).toBe(true);
  });
  it('reforged variants get new names and better stats', () => {
    for (const id of ids) expect(PAP_NAMES[id]).toBeTruthy();
    expect(papName('ar_kestrel', 'KR-7 KESTREL', 0)).toBe('KR-7 KESTREL');
    expect(papName('ar_kestrel', 'KR-7 KESTREL', 1)).toBe('SKYRENDER');
    expect(papName('ar_kestrel', 'KR-7 KESTREL', 2)).toBe('SKYRENDER II');
    const a = effectiveStats('smg_wren', 0), b = effectiveStats('smg_wren', 1), c = effectiveStats('smg_wren', UPGRADE_TIERS.length - 1);
    expect(b.damage).toBeGreaterThan(a.damage);
    expect(c.magSize).toBeGreaterThan(b.magSize);
    expect(wonderBonus('ww_arc', 1).chains).toBeGreaterThan(wonderBonus('ww_arc', 0).chains);
    expect(wonderBonus('ww_cryo', 2).freeze).toBeGreaterThan(wonderBonus('ww_cryo', 0).freeze);
  });
});
