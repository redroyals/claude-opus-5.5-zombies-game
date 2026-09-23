import { describe, expect, it } from 'vitest';
import {
  BOX_MOVE_SECONDS, BOX_PRICE, BOX_SAFE_PULLS, BOX_SPIN_SECONDS, BOX_OFFER_SECONDS, MAX_ACTIVE_ZOMBIES, PAP_PRICE, PAP_REPACK_PRICE, PERKS, PERK_LIMIT, POINTS,
  ROUND_BREAK_SECONDS, WALL_BUYS, awardHit, awardKill, createBox, createRoundState, createZPlayer, goDown, isSpecialRound, perkMods,
  pickNewBoxLocation, pickZombieType, pullBox, roundBonus, roundSpec, rollBox, stepBox, stepRounds, takeBoxOffer, tryBuyPerk, tryOpenDoor,
  tryPap, wallBuyPrice, zombieCountForRound, zombieHpMultForRound,
} from '../src/zombies/rules';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('rounds', () => {
  it('count grows and scales with players', () => {
    expect([1, 2, 3, 4, 5].map((n) => zombieCountForRound(n))).toEqual([6, 8, 13, 18, 24]); // the classic solo table
    expect(zombieCountForRound(6)).toBeGreaterThan(zombieCountForRound(5));
    expect(zombieCountForRound(10)).toBeGreaterThan(zombieCountForRound(9));
    expect(zombieCountForRound(5, 4)).toBeGreaterThan(zombieCountForRound(5, 1));
    expect(zombieCountForRound(999, 4)).toBe(120);
  });
  it('hp curve is linear then compounding', () => {
    expect(zombieHpMultForRound(1)).toBe(1);
    expect(zombieHpMultForRound(9)).toBeCloseTo(1.8);
    expect(zombieHpMultForRound(10)).toBeCloseTo(1.98);
    expect(zombieHpMultForRound(30)).toBeGreaterThan(10);
  });
  it('special rounds every 5th from 5, all runners, weaker', () => {
    expect(isSpecialRound(4)).toBe(false);
    expect(isSpecialRound(5)).toBe(true);
    const s = roundSpec(5);
    expect(s.runnerFrac).toBe(1);
    expect(s.hpMult).toBeLessThan(zombieHpMultForRound(5));
  });
  it('picks types by fractions', () => {
    const s = roundSpec(12);
    expect(pickZombieType(s, () => 0)).toBe('brute');
    expect(pickZombieType(roundSpec(7), () => 0.99)).toBe('shambler');
    expect(pickZombieType(roundSpec(1), () => 0)).toBe('shambler');
  });
  it('director: break -> active -> spawns capped -> ends when all dead', () => {
    const s = createRoundState();
    let ev = stepRounds(s, 5.01, 0);
    expect(ev.started).toBe(1);
    expect(s.toSpawn).toBe(6);
    ev = stepRounds(s, 100, 0);
    expect(ev.spawn).toBe(6);
    ev = stepRounds(s, 0.1, 6);
    expect(ev.ended).toBeUndefined();
    ev = stepRounds(s, 0.1, 0);
    expect(ev.ended).toBe(1);
    expect(s.phase).toBe('break');
    expect(s.timer).toBe(ROUND_BREAK_SECONDS);
  });
  it('never exceeds the active cap', () => {
    const s = createRoundState();
    s.timer = 0;
    stepRounds(s, 0.01, 0);
    s.toSpawn = 100;
    const ev = stepRounds(s, 1000, MAX_ACTIVE_ZOMBIES - 3);
    expect(ev.spawn).toBe(3);
  });
});

describe('points', () => {
  it('awards hits, kills, headshots, melee and round bonus', () => {
    const p = createZPlayer();
    expect(p.points).toBe(POINTS.start);
    awardHit(p); awardKill(p, false); awardKill(p, true); awardKill(p, false, true);
    expect(p.points).toBe(500 + 10 + 60 + 100 + 130);
    expect(roundBonus(3)).toBe(80);
  });
});

describe('wall-buys', () => {
  it('weapon price when unowned, ammo price when owned, upgraded ammo when packed', () => {
    expect(wallBuyPrice(WALL_BUYS.ar_kestrel, null)).toEqual({ action: 'weapon', price: 1400 });
    expect(wallBuyPrice(WALL_BUYS.ar_kestrel, 0)).toEqual({ action: 'ammo', price: 700 });
    expect(wallBuyPrice(WALL_BUYS.ar_kestrel, 1).price).toBe(4500);
    // Reforged ammo is tier-priced: starters are cheaper to keep fed than the heavy guns.
    expect(wallBuyPrice(WALL_BUYS.sg_hullbreaker, 2).price).toBeLessThan(wallBuyPrice(WALL_BUYS.lmg_bastion, 2).price);
  });
});

describe('mystery box', () => {
  it('never offers an owned weapon while alternatives exist', () => {
    const b = createBox();
    for (let i = 0; i < 50; i++) {
      const pool = [{ weapon: 'ar_tern' as const, weight: 1 }, { weapon: 'sg_tidal' as const, weight: 1 }, { weapon: 'pi_basalt' as const, weight: 1 }];
      const r = rollBox(b, ['ar_tern', 'pi_basalt'], Math.random, pool);
      expect(r).toEqual({ kind: 'weapon', weapon: 'sg_tidal' });
    }
  });
  it('cannot move during the safe pulls, then moth refunds and relocates', () => {
    const b = createBox(0);
    const p = createZPlayer();
    p.points = 100000;
    for (let i = 0; i < BOX_SAFE_PULLS; i++) {
      const r = pullBox(b, p, [], () => 0);
      expect(r.ok && r.roll?.kind).toBe('weapon');
      stepBox(b, BOX_SPIN_SECONDS, 3, () => 0);
      expect(takeBoxOffer(b)).not.toBeNull();
    }
    const before = p.points;
    const r = pullBox(b, p, [], () => 0);
    expect(r.ok && r.roll?.kind).toBe('moth');
    expect(p.points).toBe(before); // refunded
    expect(stepBox(b, BOX_SPIN_SECONDS, 3, () => 0)).toBe('moth');
    expect(stepBox(b, BOX_MOVE_SECONDS, 3, () => 0)).toBe('arrived');
    expect(b.location).toBe(1);
    expect(b.pullsHere).toBe(0);
  });
  it('rejects when busy or broke; offer expires; only payer can take', () => {
    const b = createBox();
    const p = createZPlayer();
    expect(pullBox(b, p, [], seq(0.5), 2).ok).toBe(false); // 500 < 950
    p.points = BOX_PRICE * 2;
    expect(pullBox(b, p, [], seq(0.5), 2).ok).toBe(true);
    expect(pullBox(b, p, [], seq(0.5)).ok).toBe(false);
    expect(takeBoxOffer(b, 2)).toBeNull(); // still spinning
    stepBox(b, BOX_SPIN_SECONDS, 2, Math.random);
    expect(takeBoxOffer(b, 0)).toBeNull();
    expect(stepBox(b, BOX_OFFER_SECONDS, 2, Math.random)).toBe('expired');
    expect(b.phase).toBe('idle');
  });
  it('new location is never the current one', () => {
    for (let c = 0; c < 4; c++) for (const r of [0, 0.3, 0.99]) expect(pickNewBoxLocation(c, 4, () => r)).not.toBe(c);
  });
});

describe('pack-a-punch', () => {
  it('needs power, charges first-pack then repack, stops at max', () => {
    const p = createZPlayer();
    p.points = 20000;
    expect(tryPap(p, 0, 2, false)).toMatchObject({ ok: false, reason: 'power' });
    expect(tryPap(p, 0, 2, true)).toEqual({ ok: true, price: PAP_PRICE });
    expect(tryPap(p, 1, 2, true)).toEqual({ ok: true, price: PAP_REPACK_PRICE });
    expect(tryPap(p, 2, 2, true)).toMatchObject({ ok: false, reason: 'max' });
    expect(p.points).toBe(20000 - PAP_PRICE - PAP_REPACK_PRICE);
  });
});

describe('perks', () => {
  it('buys, refuses duplicates/power/limit, stacks mods', () => {
    const p = createZPlayer();
    p.points = 100000;
    expect(tryBuyPerk(p, 'bulwark', false)).toMatchObject({ ok: false, reason: 'power' });
    expect(tryBuyPerk(p, 'lifeline', false).ok).toBe(true); // no power needed
    expect(tryBuyPerk(p, 'lifeline', true)).toMatchObject({ ok: false, reason: 'owned' });
    for (const id of ['bulwark', 'quickhands', 'hammerfall'] as const) expect(tryBuyPerk(p, id, true).ok).toBe(true);
    expect(p.perks.length).toBe(PERK_LIMIT);
    const m = perkMods(p.perks);
    expect(m.maxHealthMult).toBe(2.5);
    expect(m.reloadMult).toBe(0.5);
    expect(m.rpmMult).toBeCloseTo(1.33);
    expect(m.selfRevives).toBe(1);
    expect(p.points).toBe(100000 - 500 - 2500 - 3000 - 2000);
  });
  it('lifeline solo cap and going down loses perks', () => {
    const p = createZPlayer();
    p.points = 10000;
    expect(tryBuyPerk(p, 'lifeline', true, 3)).toMatchObject({ ok: false, reason: 'max' });
    tryBuyPerk(p, 'lifeline', true, 0);
    expect(goDown(p)).toBe(true);
    expect(p.perks).toEqual([]);
    expect(goDown(p)).toBe(false);
  });
  it('perk names are original', () => {
    for (const d of Object.values(PERKS)) expect(d.name).not.toMatch(/jugg|cola|double tap|quick revive/i);
  });
  it('doors cost once', () => {
    const p = createZPlayer();
    expect(tryOpenDoor(p, 750, false).ok).toBe(false);
    p.points = 1000;
    expect(tryOpenDoor(p, 750, false).ok).toBe(true);
    expect(tryOpenDoor(p, 750, true)).toMatchObject({ ok: false, reason: 'owned' });
  });
});
