import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/config';
import { PEN_MAX_THICKNESS, RECOIL_JITTER, adsSway, penBudget, penetrate, recoilKick, recoilPattern, sprayReset } from '../src/weapons/gunplay';

const fixed = () => 0.5; // rng midpoint = no jitter

describe('recoil patterns', () => {
  it('are deterministic per weapon and differ between weapons', () => {
    expect(recoilPattern('ar_kestrel')).toEqual(recoilPattern('ar_kestrel'));
    expect(recoilPattern('ar_kestrel').yaw).not.toEqual(recoilPattern('ar_corvid').yaw);
  });
  it('first shots climb nearly straight, later shots drift to one side', () => {
    const k0 = recoilKick('ar_kestrel', 0, fixed);
    expect(k0.yaw).toBeCloseTo(0, 9);
    expect(k0.pitch).toBeCloseTo(WEAPONS.ar_kestrel.recoilPitch * 0.8, 6);
    const later = Array.from({ length: 12 }, (_, i) => recoilKick('ar_kestrel', 6 + i, fixed).yaw);
    const mean = later.reduce((a, b) => a + b, 0) / later.length;
    expect(Math.abs(mean)).toBeGreaterThan(0.05 * WEAPONS.ar_kestrel.recoilYaw);
  });
  it('jitter stays within ±15% of the pattern', () => {
    const base = recoilKick('smg_wren', 8, fixed);
    for (const r of [0, 0.999]) {
      const k = recoilKick('smg_wren', 8, () => r);
      expect(Math.abs(k.pitch / base.pitch - 1)).toBeLessThanOrEqual(RECOIL_JITTER + 1e-9);
    }
  });
  it('a spray resets after the trigger rests', () => {
    expect(sprayReset(0.05, 900)).toBe(false);
    expect(sprayReset(0.4, 900)).toBe(true);
    expect(sprayReset(0.4, 60)).toBe(false); // slow guns need longer
  });
});

describe('ADS sway', () => {
  it('is zero at the hip, bigger on snipers, and steadied by holding breath', () => {
    expect(adsSway('sniper', 1.3, 0).yaw).toBe(0);
    const t = 1.1;
    const sn = Math.abs(adsSway('sniper', t, 1).yaw), ar = Math.abs(adsSway('ar', t, 1).yaw);
    expect(sn).toBeGreaterThan(ar * 3);
    expect(Math.abs(adsSway('sniper', t, 1, { holdingBreath: true }).yaw)).toBeLessThan(sn * 0.2);
  });
});

describe('penetration', () => {
  it('rifles punch through thin wood, pistols through glass only, nothing through concrete', () => {
    expect(penetrate('wood', 0.1, penBudget('ar_kestrel'))).not.toBeNull();
    expect(penetrate('wood', 0.3, penBudget('pi_warden'))).toBeNull();
    expect(penetrate('glass', 0.05, penBudget('pi_warden'))).not.toBeNull();
    expect(penetrate('concrete', 0.1, penBudget('sr_longwatch'))).toBeNull();
    expect(penetrate('wood', PEN_MAX_THICKNESS + 0.1, 99)).toBeNull();
  });
  it('snipers and LMGs go through thin metal; the budget shrinks', () => {
    const left = penetrate('metal', 0.1, penBudget('sr_longwatch'))!;
    expect(left).toBeLessThan(penBudget('sr_longwatch'));
    expect(penetrate('metal', 0.1, penBudget('smg_wren'))).toBeNull();
    expect(penBudget('ln_lotus')).toBe(0);
  });
});
