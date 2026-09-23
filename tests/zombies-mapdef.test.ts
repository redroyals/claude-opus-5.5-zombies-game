import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../src/world/Collision';
import { NavGrid, type FlowOut } from '../src/world/NavGrid';
import { createEggRun, eggCollect, eggInteract, eggKill, pendingObjects, stepProgress } from '../src/zombies/egg';
import { buildColliders, compileMap, openDoorBox } from '../src/zombies/mapcompile';
import { topologyOf, zoneAt, type EggDef, type ZombiesMapDef } from '../src/zombies/mapdef';
import { DEFAULT_MAP_ID, MAPS, getMap, mapFromUrl } from '../src/zombies/maps';
import { EXAMPLE_HOUSE } from '../src/zombies/maps/_example/def';
import { NIGHTFALL } from '../src/zombies/maps/nightfall/def';
import { validateMapDef } from '../src/zombies/validate';
import { buyDoor, createZoneState } from '../src/zombies/zones';
import { createZPlayer } from '../src/zombies/rules';

const clone = (d: ZombiesMapDef): ZombiesMapDef => structuredClone(d);
const codes = (d: ZombiesMapDef) => validateMapDef(d).errors.map((e) => e.code);

describe('map registry', () => {
  it('every registered map validates with no errors', () => {
    for (const m of MAPS) {
      const r = validateMapDef(m.def);
      expect(r.errors, `${m.def.id}: ${r.errors.map((e) => e.msg).join('; ')}`).toEqual([]);
    }
  });
  it('ids are unique and the default resolves; unknown ids fall back', () => {
    expect(new Set(MAPS.map((m) => m.def.id)).size).toBe(MAPS.length);
    expect(getMap(null).def.id).toBe(DEFAULT_MAP_ID);
    expect(getMap('no-such-map').def.id).toBe(DEFAULT_MAP_ID);
    expect(mapFromUrl('?mode=zombies&map=nightfall')).toBe('nightfall');
    expect(mapFromUrl('?mode=zombies&map=bogus')).toBeNull();
  });
});

describe('Nightfall Relay def', () => {
  it('validates, and its topology matches the original hardcoded map', () => {
    expect(validateMapDef(NIGHTFALL).ok).toBe(true);
    const t = topologyOf(NIGHTFALL);
    expect(t.doors.map((d) => [d.id, d.cost, d.debris ?? false])).toEqual([
      ['lobby_dock', 750, false], ['lobby_hall', 1000, true], ['dock_hall', 1250, false], ['dock_vault', 1250, false], ['hall_power', 1500, true],
    ]);
    expect(t.windows.length).toBe(10);
  });
  it('the power room stairs rise to the raised floor and the nav reaches it through the debris', () => {
    const cm = compileMap(NIGHTFALL);
    const { world, doors } = buildColliders(NIGHTFALL, cm);
    const nav = new NavGrid(-40, -40, 40, 40);
    for (const d of NIGHTFALL.doors) openDoorBox(doors.get(d.id)!);
    nav.build(world);
    nav.computeFlow(0, 13, 0);
    expect(isFinite(nav.pathDist(18, -8, 2.4))).toBe(true);
    expect(world.groundHeight(22, 4.5, 0.1, 5)).toBeCloseTo(2.4, 1);
  });
});

describe('validator catches broken maps', () => {
  it('an unreachable zone (door removed)', () => {
    const d = clone(NIGHTFALL);
    d.doors = d.doors.filter((x) => x.id !== 'dock_vault');
    expect(codes(d)).toContain('zone-unreachable');
  });
  it('a player spawn inside a collider', () => {
    const d = clone(NIGHTFALL);
    d.playerSpawn = { x: 0, z: 7.9, yaw: 0 }; // inside the checkpoint desk
    expect(codes(d)).toContain('spawn-blocked');
  });
  it('a leak: a missing wall lets zombies walk into a locked zone', () => {
    const d = clone(NIGHTFALL);
    d.walls = d.walls.filter((w) => !(w.axis === 'z' && w.at === -7));
    expect(codes(d)).toContain('zone-leak');
  });
  it('a perk walled into nowhere and a window with the wrong id', () => {
    const d = clone(NIGHTFALL);
    d.perks.bulwark = { x: 30, z: 30, face: 0 };
    d.windows[3] = { ...d.windows[3], id: 7 };
    const c = codes(d);
    expect(c).toContain('outside');
    expect(c).toContain('perk-unreachable');
    expect(c).toContain('window-id');
  });
  it('a start zone with no spawns', () => {
    const d = clone(NIGHTFALL);
    d.windows = d.windows.map((w) => (w.zone === 0 ? { ...w, zone: 1 } : w));
    expect(codes(d)).toContain('start-spawns');
  });
});

describe('multi-level: the example house', () => {
  it('validates (stacked rooms, stairs, debris at the top, windows on both floors)', () => {
    const r = validateMapDef(EXAMPLE_HOUSE);
    expect(r.errors.map((e) => e.msg)).toEqual([]);
  });
  it('zoneAt picks the storey by height', () => {
    expect(zoneAt(EXAMPLE_HOUSE, 5, 5, 0)).toBe(0);
    expect(zoneAt(EXAMPLE_HOUSE, 5, 5, 3.5)).toBe(1);
    expect(zoneAt(EXAMPLE_HOUSE, 12, 5, 1.5)).toBe(0); // on the stairs
  });
  it('nav has two stacked nodes under the bedroom and paths up the stairs to the player', () => {
    const cm = compileMap(EXAMPLE_HOUSE);
    const { world, doors } = buildColliders(EXAMPLE_HOUSE, cm);
    openDoorBox(doors.get('stairs_debris')!);
    const nav = new NavGrid(-12, -12, 26, 22);
    nav.build(world);
    const col = nav.cellOf(5.5, 7.5);
    const hs = Array.from(nav.nodeH.slice(nav.colStart[col], nav.colStart[col + 1]));
    expect(hs).toEqual([0, 3.5]);
    // Player upstairs in the bedroom; a zombie on the ground floor directly below must head for the stairs.
    nav.computeFlow(5, 7, 3.5);
    expect(isFinite(nav.pathDist(5, 7, 0))).toBe(true);
    expect(nav.pathDist(5, 7, 0)).toBeGreaterThan(8); // not "0 metres away" through the ceiling
    const out: FlowOut = { x: 0, z: 0 };
    const p = { x: 5.5, y: 0, z: 7.5 };
    for (let i = 0; i < 80; i++) {
      if (!nav.flowDir(p.x, p.z, out, p.y)) break;
      p.x += out.x * 0.5; p.z += out.z * 0.5;
      p.y = world.groundHeight(p.x, p.z, 0.2, p.y + 0.5);
    }
    expect(p.y).toBeCloseTo(3.5, 1);
    expect(Math.hypot(p.x - 5, p.z - 7)).toBeLessThan(1.5);
  });
});

describe('nav links', () => {
  it('a ladder is the only route to a roof and zombies take it; a drop is one-way', () => {
    const w = new CollisionWorld(-10, -10, 10, 10);
    w.add(0, 0, -3, 4, 3, 3, { floor: true }); // a 3 m block with a flat roof
    const nav = new NavGrid(-10, -10, 10, 10);
    nav.setLinks([{ ax: -0.6, ay: 0, az: 0, bx: 0.6, by: 3, bz: 0, kind: 'ladder', twoWay: true }]);
    nav.build(w);
    nav.computeFlow(2, 0, 3); // player on the roof
    expect(isFinite(nav.pathDist(-5, 0, 0))).toBe(true);
    const out: FlowOut = { x: 0, z: 0 };
    nav.flowDir(-0.6, 0, out, 0);
    expect(out.link).toBe(0);
    // Without the ladder the roof is unreachable.
    nav.setLinks([]);
    nav.build(w);
    nav.computeFlow(2, 0, 3);
    expect(nav.pathDist(-5, 0, 0)).toBe(Infinity);
    // A one-way drop lets roof zombies come down but not go up.
    nav.setLinks([{ ax: 3.5, ay: 3, az: 0, bx: 5, by: 0, bz: 0, kind: 'drop' }]);
    nav.build(w);
    nav.computeFlow(-5, 0, 0);
    expect(isFinite(nav.pathDist(2, 0, 3))).toBe(true);
    nav.computeFlow(2, 0, 3);
    expect(nav.pathDist(-5, 0, 0)).toBe(Infinity);
  });
  it('thin walls between cells do not leak the flow field', () => {
    const w = new CollisionWorld(-10, -10, 10, 10);
    w.add(-0.15, 0, -8, 0.15, 3, 8); // wall exactly on a cell boundary
    const nav = new NavGrid(-10, -10, 10, 10);
    nav.build(w);
    nav.computeFlow(-3, 0);
    const d = nav.pathDist(3, 0);
    expect(d).toBeGreaterThan(14); // must go around the wall end (x=0, z=±8)
  });
});

describe('power-gated doors', () => {
  it('cannot be bought without power', () => {
    const d = clone(NIGHTFALL);
    d.doors[0].requiresPower = true;
    const t = topologyOf(d);
    const s = createZoneState(t);
    const p = createZPlayer(); p.points = 5000;
    expect(buyDoor(t, s, p, 'lobby_dock', false)).toMatchObject({ ok: false, reason: 'power' });
    expect(buyDoor(t, s, p, 'lobby_dock', true).ok).toBe(true);
  });
});

describe('easter egg step machine', () => {
  const egg: EggDef = {
    name: 'Test',
    steps: [
      { kind: 'interact', ordered: true, objects: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] },
      { kind: 'kill', zone: 2, count: 3 },
      { kind: 'collect', objects: [{ x: 0, y: 0, z: 0 }], requiresPower: true },
    ],
    reward: { title: 'DONE', points: 100 },
  };
  it('runs ordered interact -> kill-in-zone -> collect, then completes once', () => {
    const r = createEggRun(egg);
    expect(eggInteract(egg, r, 1)).toBe('wrong-order');
    expect(eggInteract(egg, r, 0)).toBe('progress');
    expect(eggInteract(egg, r, 0)).toBe('none');
    expect(eggInteract(egg, r, 1)).toBe('step');
    expect(eggKill(egg, r, 1)).toBe('none'); // wrong zone
    expect(eggKill(egg, r, 2)).toBe('progress');
    expect(stepProgress(egg, r)).toEqual([1, 3]);
    eggKill(egg, r, 2);
    expect(eggKill(egg, r, 2)).toBe('step');
    expect(pendingObjects(egg, r).map((e) => e.kind)).toEqual(['collect']);
    expect(eggCollect(egg, r, 0, false)).toBe('power');
    expect(eggCollect(egg, r, 0, true)).toBe('complete');
    expect(r.complete).toBe(true);
    expect(eggInteract(egg, r, 0)).toBe('none');
  });
  it('a map without an egg is inert', () => {
    const r = createEggRun(undefined);
    expect(r.complete).toBe(true);
    expect(eggKill(undefined, r, 0)).toBe('none');
  });
});

describe('compile', () => {
  it('cuts door and window openings out of walls', () => {
    const cm = compileMap(NIGHTFALL);
    // Wall x@z=18 (lobby south) has two windows at x=-3.6 and 3.6: a sill below and lintel above each.
    const onLine = cm.boxes.filter((b) => b.box[2] === 18 - 0.15 && b.box[5] === 18 + 0.15);
    const sills = onLine.filter((b) => b.box[4] === 0.85);
    expect(sills.length).toBe(4); // two lobby windows, the Generator Hall and the Vault ones
  });
});
