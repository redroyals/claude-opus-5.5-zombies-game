import { describe, expect, it } from 'vitest';
import { BOX_SPOTS, DOOR_GEOM, PERK_SPOTS, PLAYER_SPAWN, RELICS, ROOMS, TOPOLOGY, WALL_BUY_SPOTS, WINDOWS, ZONES, zoneAt } from '../src/zombies/mapdata';
import { WALL_BUYS } from '../src/zombies/rules';
import { activeWindows, createZoneState, unlockedZones } from '../src/zombies/zones';

describe('Nightfall Relay layout', () => {
  it('every zone has windows and is reachable once all doors open', () => {
    for (const r of ROOMS) expect(WINDOWS.some((w) => w.zone === r.zone)).toBe(true);
    const s = createZoneState(TOPOLOGY);
    for (const d of TOPOLOGY.doors) s.opened.add(d.id);
    expect(unlockedZones(TOPOLOGY, s).size).toBe(ROOMS.length);
    expect(activeWindows(TOPOLOGY, s).length).toBe(WINDOWS.length);
  });
  it('doors have geometry and connect distinct zones; the power room is behind a door', () => {
    for (const d of TOPOLOGY.doors) {
      expect(DOOR_GEOM.some((g) => g.id === d.id)).toBe(true);
      expect(d.a).not.toBe(d.b);
    }
    expect(TOPOLOGY.doors.some((d) => d.b === ZONES.power || d.a === ZONES.power)).toBe(true);
  });
  it('spawn is in the lobby, and only lobby windows are live at the start', () => {
    expect(zoneAt(PLAYER_SPAWN.x, PLAYER_SPAWN.z)).toBe(ZONES.lobby);
    const s = createZoneState(TOPOLOGY);
    expect(activeWindows(TOPOLOGY, s).every((w) => w.zone === ZONES.lobby)).toBe(true);
  });
  it('machines and wall-buys sit inside rooms; wall-buys reference real buys', () => {
    for (const b of BOX_SPOTS) expect(zoneAt(b.x, b.z)).toBeGreaterThanOrEqual(0);
    for (const p of Object.values(PERK_SPOTS)) expect(zoneAt(p.x, p.z, p.y ?? 0)).toBeGreaterThanOrEqual(0);
    for (const w of WALL_BUY_SPOTS) { expect(WALL_BUYS[w.key]).toBeTruthy(); }
    expect(RELICS.length).toBe(3);
    expect(BOX_SPOTS.length).toBeGreaterThanOrEqual(3);
  });
  it('has two floors (power room raised)', () => {
    expect(new Set(ROOMS.map((r) => r.floor)).size).toBe(2);
    expect(zoneAt(18, -6, 2.4)).toBe(ZONES.power);
  });
});
