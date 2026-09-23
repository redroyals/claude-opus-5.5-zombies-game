// Pure ride logic (cable cars, ziplines, slides): arc-length positions, easing and availability rules.
import { describe, expect, it } from 'vitest';
import type { P3 } from '../src/zombies/mapdef';
import { pathLength, pointAt, rideBlock, rideEase, ridePosition } from '../src/zombies/rides';

describe('rides (pure)', () => {
  const path: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }];
  it('pointAt walks the polyline by arc length', () => {
    expect(pathLength(path)).toBe(20);
    expect(pointAt(path, 0)).toEqual({ x: 0, y: 0, z: 0 });
    expect(pointAt(path, 0.25)).toEqual({ x: 5, y: 0, z: 0 });
    expect(pointAt(path, 0.75)).toEqual({ x: 10, y: 5, z: 0 });
    expect(pointAt(path, 1)).toEqual({ x: 10, y: 10, z: 0 });
  });
  it('eases in and out and ends exactly at the destination', () => {
    expect(rideEase(0)).toBe(0);
    expect(rideEase(0.5)).toBe(0.5);
    expect(rideEase(1)).toBe(1);
    expect(rideEase(0.1)).toBeLessThan(0.1);
    const r = { id: 'x', label: 'x', at: path[0], path, seconds: 4 };
    expect(ridePosition(r, 4)).toEqual({ x: 10, y: 10, z: 0 });
    expect(ridePosition(r, 99)).toEqual({ x: 10, y: 10, z: 0 });
  });
  it('rideBlock checks egg, power, zones, cooldown and funds in that order', () => {
    const r = { id: 'x', label: 'x', at: path[0], path, seconds: 1, cost: 50, requiresPower: true, requiresZones: [2] };
    const c = { power: true, egg: true, unlocked: new Set([0, 2]), points: 100, cooldown: 0 };
    expect(rideBlock(r, c)).toBeNull();
    expect(rideBlock(r, { ...c, power: false })).toBe('power');
    expect(rideBlock(r, { ...c, unlocked: new Set([0]) })).toBe('zone');
    expect(rideBlock(r, { ...c, cooldown: 1 })).toBe('cooldown');
    expect(rideBlock(r, { ...c, points: 10 })).toBe('funds');
    expect(rideBlock({ ...r, requiresEgg: true }, { ...c, egg: false })).toBe('egg');
  });
});
