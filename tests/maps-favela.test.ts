// Rio · Ridgelight (favela) map-def tests: validator clean, the "loops, not dead ends" door graph, tiers, the
// cheapest route to power, rides that clear the map's colliders, per-map machines and the easter-egg wiring.
import { describe, expect, it } from 'vitest';
import { compileMap } from '../src/zombies/mapcompile';
import { topologyOf, zoneAt, type P3 } from '../src/zombies/mapdef';
import { MAPS } from '../src/zombies/maps';
import { FAVELA, GONDOLA_UP, PEAK, PEAK_UP, SLIDE_PATH, T, Z } from '../src/zombies/maps/favela/def';
import { pathLength, pointAt, rideBlock } from '../src/zombies/rides';
import { validateMapDef } from '../src/zombies/validate';

const def = FAVELA;
const topo = topologyOf(def);

/** Zones reachable from the start with an optional door removed from the graph (all others open). */
function reach(without?: string): Set<number> {
  const out = new Set([def.startZone]);
  for (let grew = true; grew;) {
    grew = false;
    for (const d of topo.doors) {
      if (d.id === without) continue;
      if (out.has(d.a) !== out.has(d.b)) { out.add(d.a); out.add(d.b); grew = true; }
    }
  }
  return out;
}

describe('favela: registry + validator', () => {
  it('is registered with decorate + update hooks', () => {
    const e = MAPS.find((m) => m.def.id === 'favela');
    expect(e).toBeDefined();
    expect(e!.decorate).toBeTypeOf('function');
    expect(e!.update).toBeTypeOf('function');
    expect(e!.hidden).toBeFalsy();
  });
  it('validates with no errors; the only warning is the peak pedestal (reached by ride, not on foot)', () => {
    const r = validateMapDef(def);
    expect(r.errors.map((e) => e.msg)).toEqual([]);
    expect(r.issues.filter((i) => i.severity === 'warn').map((i) => i.code)).toEqual(['egg-unreachable']);
  });
});

describe('favela: layout', () => {
  it('has 9 zones, 11 doors and spans six terrace tiers plus the hidden peak', () => {
    expect(def.zones).toHaveLength(9);
    expect(def.doors).toHaveLength(11);
    const floors = new Set(def.rooms.filter((r) => r.name !== 'STAGING').map((r) => r.floor));
    for (const t of T) expect(floors.has(t) || def.stairs!.some((s) => s.y0 <= t && s.y1 >= t)).toBe(true);
    expect(PEAK.y).toBeGreaterThan(T[5] + 10);
  });
  it('loops, not dead ends: removing any single door never cuts a zone off', () => {
    expect(reach().size).toBe(def.zones.length);
    for (const d of topo.doors) expect(reach(d.id).size, `cutting ${d.id}`).toBe(def.zones.length);
  });
  it('every non-start zone can be opened from two different neighbours (branching unlock order)', () => {
    for (const z of def.zones) {
      if (z.id === def.startZone) continue;
      const nbrs = new Set(topo.doors.filter((d) => d.a === z.id || d.b === z.id).map((d) => (d.a === z.id ? d.b : d.a)));
      expect(nbrs.size, z.name).toBeGreaterThanOrEqual(2);
    }
  });
  it('the start is a choice: two doors leave the bottom street', () => {
    expect(topo.doors.filter((d) => d.a === Z.street || d.b === Z.street)).toHaveLength(2);
  });
  it('power sits at the top tier and the cheapest route to it costs 4,750 (beco -> quadra -> mirante -> substation)', () => {
    expect(def.power!.y).toBe(T[5]);
    const cost = new Map<number, number>([[def.startZone, 0]]);
    const q = [def.startZone];
    while (q.length) {
      const z = q.shift()!;
      for (const d of topo.doors) {
        const o = d.a === z ? d.b : d.b === z ? d.a : -1;
        if (o < 0) continue;
        const c = cost.get(z)! + d.cost;
        if (c < (cost.get(o) ?? Infinity)) { cost.set(o, c); q.push(o); }
      }
    }
    expect(cost.get(Z.power)).toBe(4750);
  });
  it('the Reforger needs a trip back down after power (bottom cable-car station, 12 m below the switch)', () => {
    expect(zoneAt(def, def.pap!.x, def.pap!.z, def.pap!.y)).toBe(Z.quadra);
    expect(def.power!.y! - def.pap!.y!).toBeGreaterThanOrEqual(12);
  });
  it('the Cache moves between tiers (spots on at least five different floors)', () => {
    expect(new Set(def.box.spots.map((s) => s.y)).size).toBeGreaterThanOrEqual(5);
  });
  it('zombies arrive three ways: windows, climbs (ladder links up) and drops (off roofs)', () => {
    expect(def.windows.length).toBeGreaterThanOrEqual(12);
    expect(def.links!.filter((l) => l.kind === 'ladder' && l.to.y > l.from.y)).toHaveLength(4);
    expect(def.links!.filter((l) => l.kind === 'drop').length).toBeGreaterThanOrEqual(5);
    for (const z of def.zones) {
      const n = def.windows.filter((w) => w.zone === z.id).length + (def.spawnPoints ?? []).filter((s) => s.zone === z.id).length;
      expect(n, z.name).toBeGreaterThan(0);
    }
  });
  it('no wall-buy, machine or ride steals a door\'s E prompt (interaction radii from ZombiesMode.find)', () => {
    const near = (p: { x: number; z: number; y: number }, x: number, z: number, r: number, y = 0) => Math.hypot(x - p.x, z - p.z) < r && Math.abs(p.y - y) < 1.4;
    for (const d of def.doors) {
      const mid = (d.a0 + d.a1) / 2;
      const c = d.axis === 'x' ? { x: mid, z: d.at } : { x: d.at, z: mid };
      for (const off of [-1.3, 1.3]) {
        const p = d.axis === 'x' ? { x: c.x, z: c.z + off, y: d.y0 } : { x: c.x + off, z: c.z, y: d.y0 };
        const thieves = [
          ...def.wallBuys.filter((w) => near(p, w.x, w.z, 1.6, w.y)).map((w) => w.key),
          ...Object.entries(def.perks).filter(([, s]) => near(p, s.x, s.z, 1.7, s.y)).map(([k]) => k),
          ...def.box.spots.filter((s) => near(p, s.x, s.z, 2, s.y)).map(() => 'box'),
          ...(def.pap && near(p, def.pap.x, def.pap.z, 2.4, def.pap.y) ? ['pap'] : []),
          ...(def.power && near(p, def.power.x, def.power.z, 1.8, def.power.y) ? ['power'] : []),
        ];
        expect(thieves, `${d.id} at ${off}`).toEqual([]);
      }
    }
  });
  it('uses the street-art machines with footprints that match the models', () => {
    for (const id of ['lifeline', 'bulwark', 'quickhands', 'hammerfall'] as const) {
      expect(def.machines!.perks![id]!.model).toMatch(/^favela\/perk_fv_/);
      expect(def.machines!.perks![id]!.foot).toHaveLength(2);
    }
    expect(def.machines!.box).toBe('favela/fv_mystery_box.glb');
  });
});

describe('favela: rides', () => {
  const cm = compileMap(def);
  const solids = cm.boxes.filter((b) => b.collide === 'solid' || b.collide === 'floor');
  /** Does a body of (w x h) at feet p overlap any solid/floor box? */
  const blocked = (p: P3, half: number, h: number) => solids.some(({ box: [x0, y0, z0, x1, y1, z1] }) =>
    p.x + half > x0 && p.x - half < x1 && p.z + half > z0 && p.z - half < z1 && p.y + 0.15 < y1 && p.y + h > y0);
  const clear = (path: P3[], half: number, h: number, skip = 3) => {
    const L = pathLength(path);
    const bad: string[] = [];
    for (let d = skip; d < L - skip; d += 0.5) {
      const p = pointAt(path, d / L);
      if (blocked(p, half, h)) bad.push(`${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
    }
    return bad;
  };
  it('every ride starts and ends in a room and takes a sensible time', () => {
    for (const r of def.rides!) {
      const a = r.path[0], b = r.path[r.path.length - 1];
      expect(Math.hypot(a.x - r.at.x, a.z - r.at.z), r.id).toBeLessThan(2);
      if (!r.id.startsWith('peak')) {
        expect(zoneAt(def, a.x, a.z, a.y), `${r.id} start`).toBeGreaterThanOrEqual(0);
        expect(zoneAt(def, b.x, b.z, b.y), `${r.id} end`).toBeGreaterThanOrEqual(0);
      }
      expect(r.seconds).toBeGreaterThan(1);
    }
  });
  it('the cable car links the Reforger station (T2) and the top station (T5) and its cabin clears the map', () => {
    expect(zoneAt(def, GONDOLA_UP[0].x, GONDOLA_UP[0].z, GONDOLA_UP[0].y)).toBe(Z.quadra);
    const e = GONDOLA_UP[GONDOLA_UP.length - 1];
    expect(zoneAt(def, e.x, e.z, e.y)).toBe(Z.station);
    expect(clear(GONDOLA_UP, 0.9, 2.5, 5)).toEqual([]);
  });
  it('the peak line clears the station and ends on the summit', () => {
    expect(clear(PEAK_UP, 0.9, 2.5, 4)).toEqual([]);
    const e = PEAK_UP[PEAK_UP.length - 1];
    expect(e.x > PEAK.x0 && e.x < PEAK.x1 && e.z > PEAK.z0 && e.z < PEAK.z1).toBe(true);
  });
  it('the zipline and the tin-roof slide carry a player body clear of walls', () => {
    const zip = def.rides!.find((r) => r.id === 'zipline')!;
    expect(clear(zip.path, 0.3, 1.7, 1.5)).toEqual([]);
    expect(clear(SLIDE_PATH, 0.3, 1.7, 1.5)).toEqual([]);
    expect(zoneAt(def, zip.path[zip.path.length - 1].x, zip.path[zip.path.length - 1].z, T[3])).toBe(Z.laje);
    const s = SLIDE_PATH[SLIDE_PATH.length - 1];
    expect(zoneAt(def, s.x, s.z, s.y)).toBe(Z.street);
  });
  it('the cable car needs power and costs 250; the peak line opens at easter-egg step 3', () => {
    const up = def.rides!.find((r) => r.id === 'gondola_up')!;
    const base = { power: false, egg: false, unlocked: new Set([0, 4, 6]), points: 1000, cooldown: 0, eggStep: 0 };
    expect(rideBlock(up, base)).toBe('power');
    expect(rideBlock(up, { ...base, power: true })).toBeNull();
    expect(rideBlock(up, { ...base, power: true, points: 100 })).toBe('funds');
    const peak = def.rides!.find((r) => r.id === 'peak_up')!;
    expect(rideBlock(peak, { ...base, power: true, eggStep: 2 })).toBe('egg');
    expect(rideBlock(peak, { ...base, power: true, eggStep: 3 })).toBeNull();
    expect(def.egg!.steps[3].kind).toBe('interact');
  });
});
