import { describe, expect, it } from 'vitest';
import { DOWN, beginDown, downStatus, hitWhileDown, lastStandPick, stepDown } from '../src/zombies/down';
import { createZPlayer } from '../src/zombies/rules';

describe('downed / last stand', () => {
  it('without Lifeline you bleed out after the solo timer, losing perks', () => {
    const p = createZPlayer(); p.perks = ['bulwark', 'quickhands'];
    const d = beginDown(p);
    expect(p.perks).toEqual([]);
    expect(d.selfRevive).toBeNull();
    let e = null;
    for (let t = 0; t < DOWN.soloBleedOut - 0.1; t += 0.1) e = stepDown(d, 0.1) ?? e;
    expect(e).toBeNull();
    expect(stepDown(d, 0.2)).toBe('bledout');
  });
  it('Lifeline self-revives before the bleed-out even if you are hit', () => {
    const p = createZPlayer(); p.perks = ['lifeline'];
    const d = beginDown(p);
    expect(d.selfRevive).toBe(DOWN.selfRevive);
    hitWhileDown(d); hitWhileDown(d);
    let e = null;
    for (let i = 0; i < 100 && !e; i++) e = stepDown(d, 0.05);
    expect(e).toBe('revived');
    expect(d.t).toBeCloseTo(DOWN.selfRevive, 1);
  });
  it('hits shorten the bleed-out; co-op waits longer', () => {
    const d = beginDown(createZPlayer());
    hitWhileDown(d);
    expect(d.bleedOut).toBe(DOWN.soloBleedOut - DOWN.hitPenalty);
    expect(beginDown(createZPlayer(), 2).bleedOut).toBe(DOWN.coopBleedOut);
    expect(downStatus(d).label).toMatch(/BLEEDING/);
  });
  it('last stand keeps your best pistol, else hands you a sidearm', () => {
    expect(lastStandPick(['ar_kestrel', 'pi_basalt'])).toEqual({ weapon: 'pi_basalt', slot: 1 });
    expect(lastStandPick(['ar_kestrel', 'sg_tidal'])).toEqual({ weapon: DOWN.lastStandWeapon, slot: -1 });
    expect(lastStandPick(['pi_warden', 'pi_basalt']).weapon).toBe('pi_basalt');
  });
});
