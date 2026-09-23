import { describe, expect, it } from 'vitest';
import { canAttackThroughWindow, laneAngle, steerLane, surroundSlot, windowQueueSpot } from '../src/enemies/horde';
import { MAX_ACTIVE_ZOMBIES, isBlackoutRound, isBossRound, isSpecialRound, pickZombieType, roundSpec, sprinterFractionForRound } from '../src/zombies/rules';

describe('horde steering', () => {
  it('lanes spread a crowd across angles and vanish close to the player', () => {
    const angles = Array.from({ length: 40 }, (_, i) => laneAngle(i * 0.6180339 + 0.3));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.6);
    expect(Math.max(...angles.map(Math.abs))).toBeLessThanOrEqual(0.45);
    expect(steerLane(0, -1, 0.4, 2, () => true)).toEqual({ x: 0, z: -1 });
    const far = steerLane(0, -1, 0.4, 12, () => true);
    expect(Math.hypot(far.x, far.z)).toBeCloseTo(1, 6);
    expect(Math.abs(far.x)).toBeGreaterThan(0.3);
    expect(steerLane(0, -1, 0.4, 12, () => false)).toEqual({ x: 0, z: -1 }); // blocked lane: keep the flow
  });
  it('surround slots fan attackers around the player', () => {
    const a = surroundSlot(0, 0, 0, -5, 0.3, 1.2), b = surroundSlot(0, 0, 0, -5, -0.3, 1.2);
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(1.2, 6);
    expect(Math.sign(a.x)).not.toBe(Math.sign(b.x));
  });
  it('window queues step back and alternate sides', () => {
    expect(windowQueueSpot(0, 5, 0, 1, 0)).toEqual({ x: 0, z: 5 });
    const q1 = windowQueueSpot(0, 5, 0, 1, 1), q2 = windowQueueSpot(0, 5, 0, 1, 2);
    expect(q1.z).toBeGreaterThan(5);
    expect(q2.z).toBeGreaterThan(q1.z);
    expect(Math.sign(q1.x)).not.toBe(Math.sign(q2.x));
    expect(canAttackThroughWindow(0, 0, 4.2, 0, 4, 0)).toBe(true);
    expect(canAttackThroughWindow(0, 0, 7, 0, 4, 0)).toBe(false);
  });
});

describe('late-round variety', () => {
  it('sprinters appear from round 10 and grow', () => {
    expect(sprinterFractionForRound(9)).toBe(0);
    expect(sprinterFractionForRound(10)).toBeGreaterThan(0);
    expect(sprinterFractionForRound(20)).toBeGreaterThan(sprinterFractionForRound(12));
    expect(roundSpec(14).sprinterFrac).toBeGreaterThan(0);
  });
  it('blackout rounds (13, 23, ...) are runners in the dark, never bosses or scuttlers', () => {
    expect(isBlackoutRound(13)).toBe(true);
    expect(isBlackoutRound(3)).toBe(false);
    expect(isSpecialRound(13)).toBe(false);
    const s = roundSpec(23);
    expect(s.blackout).toBe(true);
    expect(s.runnerFrac).toBe(1);
    expect(isBossRound(23)).toBe(false);
    const r = () => 0.99;
    expect(pickZombieType(s, r)).toBe('runner');
    expect(s.total).toBeLessThanOrEqual(120);
    expect(MAX_ACTIVE_ZOMBIES).toBeGreaterThan(0);
  });
});
