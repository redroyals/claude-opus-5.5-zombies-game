import { describe, expect, it } from 'vitest';
import {
  POWERUP, POWERUP_KINDS, activate, createPowerUps, isActive, nextPowerUp, onRoundStart, pickupVisible, pointsMult, rollDrop, stepPowerUps,
} from '../src/zombies/powerups';
import {
  PLANKS, REPAIR_POINTS, REPAIR_POINTS_CAP_PER_ROUND, activateRelic, activeWindows, buyDoor, canOpenDoor, createEgg, createZoneState,
  onRoundStartZones, rebuildAll, repairPlank, tearPlank, unlockedZones, type MapTopology,
} from '../src/zombies/zones';
import { createZPlayer } from '../src/zombies/rules';
import { summaryCells, survivedTitle, fmtTime } from '../src/zombies/summary';

const never = () => 0.99;

describe('power-ups', () => {
  it('cycles through every kind before repeating', () => {
    const s = createPowerUps();
    const got = new Set(Array.from({ length: POWERUP_KINDS.length }, () => nextPowerUp(s, Math.random)));
    expect(got.size).toBe(POWERUP_KINDS.length);
  });
  it('guaranteed drop at the points threshold, growing; capped per round', () => {
    const s = createPowerUps();
    expect(rollDrop(s, POWERUP.firstThreshold - 1, never)).toBeNull();
    expect(rollDrop(s, 1, never)).not.toBeNull();
    expect(s.nextThreshold).toBeGreaterThan(POWERUP.firstThreshold);
    for (let i = 0; i < 10; i++) rollDrop(s, 0, () => 0);
    expect(s.dropsThisRound).toBe(POWERUP.maxDropsPerRound);
    expect(rollDrop(s, 99999, () => 0)).toBeNull();
    onRoundStart(s);
    expect(rollDrop(s, 0, () => 0)).not.toBeNull();
  });
  it('random drop chance', () => {
    const s = createPowerUps();
    expect(rollDrop(s, 60, () => 0.001)).not.toBeNull();
    expect(rollDrop(s, 60, never)).toBeNull();
  });
  it('can exclude kinds (e.g. carpenter with nothing to fix)', () => {
    const s = createPowerUps();
    for (let i = 0; i < 20; i++) expect(nextPowerUp(s, Math.random, ['carpenter'])).not.toBe('carpenter');
  });
  it('timed effects run for the duration and restart on re-pickup', () => {
    const s = createPowerUps();
    activate(s, 'double_points');
    expect(pointsMult(s)).toBe(2);
    stepPowerUps(s, 20);
    activate(s, 'double_points');
    expect(stepPowerUps(s, 20)).toEqual([]);
    expect(stepPowerUps(s, 11)).toEqual(['double_points']);
    expect(isActive(s, 'double_points')).toBe(false);
    activate(s, 'nuke');
    expect(isActive(s, 'nuke')).toBe(false);
  });
  it('pickups blink near expiry and vanish', () => {
    expect(pickupVisible(1, 0.13)).toBe(true);
    const blinks = new Set(Array.from({ length: 20 }, (_, i) => pickupVisible(POWERUP.pickupLifetime - 5, i * 0.07)));
    expect(blinks.size).toBe(2);
    expect(pickupVisible(POWERUP.pickupLifetime + 1, 0)).toBe(false);
  });
});

const topo: MapTopology = {
  startZone: 0,
  zones: [{ id: 0, name: 'Lobby' }, { id: 1, name: 'Dock' }, { id: 2, name: 'Hall' }, { id: 3, name: 'Vault' }],
  doors: [{ id: 'a', cost: 750, a: 0, b: 1, label: '' }, { id: 'b', cost: 1000, a: 0, b: 2, label: '' }, { id: 'c', cost: 1250, a: 1, b: 3, label: '' }],
  windows: [{ id: 0, zone: 0 }, { id: 1, zone: 1 }, { id: 2, zone: 3 }],
};

describe('zones & doors', () => {
  it('only the start zone and its windows are live initially', () => {
    const s = createZoneState(topo);
    expect([...unlockedZones(topo, s)]).toEqual([0]);
    expect(activeWindows(topo, s).map((w) => w.id)).toEqual([0]);
  });
  it('doors must be adjacent to reachable zones and cost points once', () => {
    const s = createZoneState(topo);
    const p = createZPlayer();
    p.points = 5000;
    expect(canOpenDoor(topo, s, 'c')).toBe(false);
    expect(buyDoor(topo, s, p, 'c').ok).toBe(false);
    expect(buyDoor(topo, s, p, 'a').ok).toBe(true);
    expect(buyDoor(topo, s, p, 'a')).toMatchObject({ ok: false, reason: 'owned' });
    expect(buyDoor(topo, s, p, 'c').ok).toBe(true);
    expect(p.points).toBe(5000 - 750 - 1250);
    expect([...unlockedZones(topo, s)].sort()).toEqual([0, 1, 3]);
    expect(activeWindows(topo, s).map((w) => w.id)).toEqual([0, 1, 2]);
  });
  it('refuses when broke', () => {
    const s = createZoneState(topo);
    const p = createZPlayer();
    expect(buyDoor(topo, s, p, 'b')).toMatchObject({ ok: false, reason: 'funds' });
  });
});

describe('barricades', () => {
  it('zombies tear planks down to zero; players rebuild for points with a per-round cap', () => {
    const s = createZoneState(topo);
    const p = createZPlayer();
    for (let i = 0; i < PLANKS + 2; i++) tearPlank(s, 0);
    expect(s.planks[0]).toBe(0);
    const start = p.points;
    const r = repairPlank(s, 0, p);
    expect(r).toEqual({ rebuilt: true, points: REPAIR_POINTS });
    expect(p.points).toBe(start + REPAIR_POINTS);
    // exhaust cap
    let earned = REPAIR_POINTS;
    for (let k = 0; k < 200; k++) { tearPlank(s, 0); earned += repairPlank(s, 0, p).points; }
    expect(earned).toBe(REPAIR_POINTS_CAP_PER_ROUND);
    onRoundStartZones(s);
    s.planks[0] = PLANKS - 1;
    expect(repairPlank(s, 0, p).points).toBe(REPAIR_POINTS);
    expect(repairPlank(s, 0, p)).toEqual({ rebuilt: false, points: 0 });
  });
  it('double points doubles repair points; carpenter rebuilds all', () => {
    const s = createZoneState(topo);
    const p = createZPlayer();
    tearPlank(s, 1); tearPlank(s, 2);
    expect(repairPlank(s, 1, p, 2).points).toBe(REPAIR_POINTS * 2);
    rebuildAll(s);
    expect(s.planks.every((n) => n === PLANKS)).toBe(true);
  });
});

describe('easter egg', () => {
  it('rewards once after all relics in any order', () => {
    const e = createEgg(3);
    expect(activateRelic(e, 2)).toBe('progress');
    expect(activateRelic(e, 2)).toBe('none');
    expect(activateRelic(e, 0)).toBe('progress');
    expect(activateRelic(e, 1)).toBe('complete');
    expect(activateRelic(e, 1)).toBe('none');
    expect(activateRelic(e, 9)).toBe('none');
  });
});

describe('game over summary', () => {
  it('pluralises rounds and formats stats', () => {
    expect(survivedTitle(1)).toBe('YOU SURVIVED 1 ROUND');
    expect(survivedTitle(12)).toBe('YOU SURVIVED 12 ROUNDS');
    expect(fmtTime(75)).toBe('1:15');
    expect(fmtTime(3725)).toBe('1:02:05');
    const cells = summaryCells({ round: 7, kills: 120, headshots: 40, points: 12345, doors: 3, time: 600, downs: 1 });
    expect(cells.find(([k]) => k === 'POINTS EARNED')?.[1]).toBe('12,345');
    expect(cells.map(([k]) => k)).toContain('DOORS OPENED');
  });
});
