// "Rio · Ridgelight" — a vertical favela Zombies map at dusk (design: docs/maps/favela.md).
// Six terrace tiers climb one hillside toward -Z (north). Everything sits 4 m above the implicit ground
// plane so zombies can climb up from hidden yards below the parapets. Tier heights:
//   T0 4 (street, bar)  T1 8  T2 12 (quadra)  T3 16 (laje, samba hall)  T4 20  T5 24 (station, power, lookout)
import type { BoxDef, DoorDef, LampDef, MatSpec, NavLinkDef, P3, PropDef, RideDef, RoomDef, SpawnPointDef, StairDef, WallDef, WindowDef, ZombiesMapDef } from '../../mapdef';

export const T = [4, 8, 12, 16, 20, 24] as const;
export const PEAK_Y = 44;
const [T0, T1, T2, T3, T4, T5] = T;

export const Z = { street: 0, beco: 1, houses: 2, laje: 3, quadra: 4, samba: 5, station: 6, mirante: 7, power: 8 } as const;

// ---- Materials ------------------------------------------------------------------------------------
const paint = (color: number): MatSpec => ({ color, texture: 'plaster', roughness: 0.93 });
export const PAINT = {
  terracotta: paint(0xc9785a), teal: paint(0x5fa39a), yellow: paint(0xd9b653), pink: paint(0xc47a92),
  green: paint(0x86a860), blue: paint(0x6f8fbf), cream: paint(0xd8cfbd), lilac: paint(0x9a86b8),
};
const ASPHALT = 'asphalt' as const;
const SLAB: MatSpec = { color: 0x9a968e, texture: 'concrete', roughness: 0.95 };
const TILE_FLOOR: MatSpec = { color: 0xb5a58a, texture: 'sidewalk', roughness: 0.8 };
const CEIL: MatSpec = { color: 0x57514a, texture: 'plaster', roughness: 0.97 };
const COURT: MatSpec = { color: 0x3f6f78, texture: 'concrete', roughness: 0.85 };

// ---- Helpers --------------------------------------------------------------------------------------
const room = (zone: number, name: string, x0: number, z0: number, x1: number, z1: number, floor: number, ceiling: number | null = null, extra: Partial<RoomDef> = {}): RoomDef =>
  ({ zone, name, rect: { x0, z0, x1, z1 }, floor, ceiling, skirting: false, beams: false, floorMat: SLAB, ceilingMat: SLAB, ...extra });
const wall = (axis: 'x' | 'z', at: number, a0: number, a1: number, y0: number, y1: number, mat: WallDef['mat'] = 'brick', extra: Partial<WallDef> = {}): WallDef =>
  ({ axis, at, a0, a1, y0, y1, mat, ...extra });
/** Low parapet (1.1 m) over a drop. */
const parapet = (axis: 'x' | 'z', at: number, a0: number, a1: number, y: number, extra: Partial<WallDef> = {}): WallDef =>
  wall(axis, at, a0, a1, y, y + 1.1, 'concrete', { thickness: 0.25, ...extra });
const floorBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: BoxDef['mat'] = SLAB): BoxDef =>
  ({ box: [x0, y0, z0, x1, y1, z1], mat, tile: 2, collide: 'floor' });
const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: BoxDef['mat'] = 'brick', tile = 2): BoxDef =>
  ({ box: [x0, y0, z0, x1, y1, z1], mat, tile });
const vis = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: BoxDef['mat'], tile = 1): BoxDef =>
  ({ box: [x0, y0, z0, x1, y1, z1], mat, tile, collide: 'none' });
/** Walled yard on the ground (y 0) where climbing zombies spawn, open on the side facing the map. */
function yard(x0: number, z0: number, x1: number, z1: number, open: '+x' | '-x' | '+z' | '-z', h: number): BoxDef[] {
  const t = 0.3, out: BoxDef[] = [];
  if (open !== '-x') out.push(solid(x0 - t, 0, z0 - t, x0, h, z1 + t, 'brickDark'));
  if (open !== '+x') out.push(solid(x1, 0, z0 - t, x1 + t, h, z1 + t, 'brickDark'));
  if (open !== '-z') out.push(solid(x0 - t, 0, z0 - t, x1 + t, h, z0, 'brickDark'));
  if (open !== '+z') out.push(solid(x0 - t, 0, z1, x1 + t, h, z1 + t, 'brickDark'));
  return out;
}
/** Beco flight 1 height at z (rises from T0 at z 30 to T1 at z 21). */
export const becoY = (z: number): number => (z >= 30 ? T0 : z <= 21 ? T1 : T0 + ((30 - z) / 9) * (T1 - T0));

/** Water tower on the big laje (landmark, ladder perch, EE grip). */
export const TOWER = { x: 16, z: -6, top: T3 + 8.35 };

// ---- Cable car, zipline, slide, peak line ---------------------------------------------------------------
const v = (x: number, y: number, z: number): P3 => ({ x, y, z });
/** Feet -> cable grip height for the cabin model. */
export const CABIN_H = 2.8;
/** Hidden summit (easter-egg ride). */
export const PEAK = { x0: 19, z0: -87, x1: 29, z1: -77, y: PEAK_Y };
/** Cable grip points of the main line: bottom dock, station exit, ravine pylon, over-the-gap, station approach, top dock. */
export const CABLE: P3[] = [v(-44, 12.05 + CABIN_H, 11.2), v(-44, 12.8 + CABIN_H, 6.2), v(-8, 27.4, -27), v(1.5, 28.7 + CABIN_H, -40.5), v(8, 27.9 + CABIN_H, -47), v(10, 24.05 + CABIN_H, -51.5)];
export const PYLON = { x: -8, z: -27, top: 27 };
/** Samples a cable (grip points) into feet positions, with a catenary-ish sag on each span. */
export function cablePath(grips: P3[], sags: number[], feetOff = CABIN_H, per = 6): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < grips.length - 1; i++) {
    const a = grips[i], b = grips[i + 1];
    const n = Math.max(1, Math.round((Math.hypot(b.x - a.x, b.z - a.z) / per)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push(v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - (sags[i] ?? 0) * 4 * t * (1 - t) - feetOff, a.z + (b.z - a.z) * t));
    }
  }
  const e = grips[grips.length - 1];
  out.push(v(e.x, e.y - feetOff, e.z));
  return out;
}
const CABLE_SAGS = [0, 0, 1.6, 0.3, 0.2];
export const GONDOLA_UP = cablePath(CABLE, CABLE_SAGS);
export const GONDOLA_DOWN = [...GONDOLA_UP].reverse();
/** Peak line: from the station's third wheel up to the summit. */
export const PEAK_CABLE: P3[] = [v(30, T5 + 0.05 + CABIN_H, -56.5), v(30, 25.2 + CABIN_H, -57.4), v(30, 28.7 + CABIN_H, -59.4), v(25.6, PEAK_Y + 1.6 + CABIN_H, -77.2), v(25, PEAK_Y + 0.05 + CABIN_H, -80.5)];
export const PEAK_UP = cablePath(PEAK_CABLE, [0, 0, 0.8, 0]);
/** Zipline: mirante (T5) over the ravine to the big laje (T3). Feet 1.9 m below the pulley. */
export const ZIP = { a: v(-14.3, T5, -37.2), b: v(3, T3, -17.5) };
const ZIP_PATH: P3[] = [ZIP.a, v(-13.2, T5 + 1.5, -36.2), ...cablePath([v(-12.4, T5 + 3.6, -35.4), v(2, T3 + 2.6, -18.6)], [0.9], 1.9, 3), ZIP.b];
/** Tin-roof slide: laje SE corner down a cascade of corrugated roofs to the street's east end. */
export const SLIDE_PATH: P3[] = [v(31, T3, 7.1), v(31, T3 + 1.4, 8.1), v(31, 15.3, 9.6), v(31, 12.2, 15.5), v(31, 10.6, 19.5), v(31, 8.4, 25.5), v(31, 8.1, 29.9), v(31, 8.1, 30.6), v(31, T0, 32.6)];
const RIDES: RideDef[] = [
  { id: 'gondola_up', label: 'Ride the cable car up', at: GONDOLA_UP[0], radius: 1.8, path: GONDOLA_UP, seconds: 14, cost: 250, requiresPower: true, cooldown: 4 },
  { id: 'gondola_down', label: 'Ride the cable car down', at: GONDOLA_DOWN[0], radius: 1.8, path: GONDOLA_DOWN, seconds: 14, cost: 250, requiresPower: true, cooldown: 4 },
  { id: 'zipline', label: 'Take the zipline across the ravine', at: ZIP.a, radius: 1.4, path: ZIP_PATH, seconds: 3.4, requiresZones: [3, 7] },
  { id: 'slide', label: 'Slide down the tin roofs', at: SLIDE_PATH[0], radius: 1.4, path: SLIDE_PATH, seconds: 2.6 },
  { id: 'peak_up', label: 'Ride the peak line', at: PEAK_UP[0], radius: 1.8, path: PEAK_UP, seconds: 12, requiresEggStep: 3 },
  { id: 'peak_down', label: 'Ride back down to the station', at: PEAK_UP[PEAK_UP.length - 1], radius: 2.2, path: [...PEAK_UP].reverse(), seconds: 12, requiresEggStep: 3 },
];

// ---- Rooms ----------------------------------------------------------------------------------------
const ROOMS: RoomDef[] = [
  // Z0 bottom street + the lanchonete
  room(Z.street, 'BOTTOM STREET', -18, 30, 36, 38, T0, null, { floorMat: ASPHALT }),
  room(Z.street, 'LANCHONETE', -4, 38, 10, 46, T0, T0 + 3.4, { floorMat: TILE_FLOOR, ceilingMat: CEIL }),
  // Z1 stair alley (two flights, a T1 landing and a top landing)
  room(Z.beco, 'STAIR ALLEY', -16, 21, -13.6, 30, T0),
  room(Z.beco, 'STAIR ALLEY', -16, 17, -13.6, 21, T1),
  room(Z.beco, 'STAIR ALLEY', -16, 8, -13.6, 17, T1),
  room(Z.beco, 'STAIR ALLEY', -16, 3, -13.6, 8, T2),
  // Z2 stacked houses: row A (T0), row B (T1), row C (T2), each with a stairwell to the next row
  room(Z.houses, 'STACKED HOUSES', -13.6, 24, 0, 30, T0, T0 + 3.4, { floorMat: TILE_FLOOR, ceilingMat: CEIL }),
  room(Z.houses, 'STACKED HOUSES', 0, 26.4, 14, 30, T0, T0 + 3.4, { floorMat: TILE_FLOOR, ceilingMat: CEIL }),
  room(Z.houses, 'STACKED HOUSES', 0, 24, 14, 26.4, T0, T1 + 3.4, { floorMat: TILE_FLOOR }),
  room(Z.houses, 'STACKED HOUSES', -13.6, 16, -3, 24, T1, T1 + 3.4, { floorMat: TILE_FLOOR, ceilingMat: CEIL }),
  room(Z.houses, 'STACKED HOUSES', -3, 18.6, 14, 24, T1, T1 + 3.4, { floorMat: TILE_FLOOR, ceilingMat: CEIL }),
  room(Z.houses, 'STACKED HOUSES', -3, 16, 14, 18.6, T1, T2 + 3.4, { floorMat: TILE_FLOOR }),
  room(Z.houses, 'STACKED HOUSES', -13.6, 10.6, 14, 16, T2, T2 + 3.4, { floorMat: TILE_FLOOR, ceilingMat: CEIL }),
  room(Z.houses, 'STACKED HOUSES', -13.6, 8, 1, 10.6, T2, T2 + 3.4, { floorMat: TILE_FLOOR, ceilingMat: CEIL }),
  room(Z.houses, 'STACKED HOUSES', 1, 8, 14, 10.6, T2, T3 + 3.4, { floorMat: TILE_FLOOR }),
  // Z3 big laje + the plank bridge over the ravine
  room(Z.laje, 'BIG LAJE', -2, -24, 34, 8, T3),
  room(Z.laje, 'BIG LAJE', -16, -22, -2, -19, T3, null, { support: 'none', floorMat: 'wood' }),
  // Z4 the quadra: pitch, west strip, bottom cable-car station, stands, the stands-top walkway
  room(Z.quadra, 'THE QUADRA', -40, -8, -16, 16, T2, null, { floorMat: COURT }),
  room(Z.quadra, 'THE QUADRA', -48, -8, -40, 8, T2, null, { floorMat: COURT }),
  room(Z.quadra, 'CABLE-CAR BASE', -48, 8, -40, 16, T2, T2 + 6, { floorMat: SLAB, ceilingMat: 'metalDark', beams: 'steel' }),
  room(Z.quadra, 'THE QUADRA', -40, -18, -16, -8, T2),
  room(Z.quadra, 'THE QUADRA', -45.3, -18, -40, -8, T2, null, { floorMat: COURT }),
  room(Z.quadra, 'THE QUADRA', -44, -22, -16, -18, T3),
  // Z5 samba hall
  room(Z.samba, 'SAMBA HALL', 2, -40, 30, -24, T3, T5, { floorMat: { color: 0x8a6a4a, texture: 'wood', roughness: 0.7 }, ceilingMat: 'metalDark', beams: 'steel' }),
  // Z6 station stair + the top cable-car station
  room(Z.station, 'CABLE-CAR STATION', 30, -44, 32.4, -24, T3),
  room(Z.station, 'CABLE-CAR STATION', 4, -60, 34, -44, T5),
  // Z7 the escadaria and the mirante
  room(Z.mirante, 'THE MIRANTE', -48, -35, -45.6, -8, T2),
  room(Z.mirante, 'THE MIRANTE', -48, -60, -12, -35, T5, null, { floorMat: TILE_FLOOR }),
  // Z8 substation
  room(Z.power, 'SUBSTATION', -12, -60, 4, -44, T5),
  // Staging rooms: the off-map roofs and yards zombies drop or climb in from. Never player-reachable; they exist so
  // every spawn point sits in a room of its zone (validator) and the director counts them for that zone.
  ...([
    [Z.street, 22.6, 38.3, 25, 41, 0], [Z.street, 18, 26, 30, 29.7, T0 + 6], [Z.beco, -20.5, 22, -16.15, 28, 11],
    [Z.laje, 34.15, -10, 38.5, -4, 11], [Z.laje, 4, -38, 28, -25, T5 + 0.4], [Z.quadra, -34, 16.3, -24, 20, T2 - 5],
    [Z.quadra, -54, -2, -48.15, 8, T2 + 6], [Z.station, 10.5, -57.8, 25.5, -46.2, T5 + 7.7], [Z.mirante, -46, -63.9, -36, -60.15, T5 - 3],
  ] as const).map(([zone, x0, z0, x1, z1, y]) => room(zone, 'STAGING', x0, z0, x1, z1, y, null, { support: 'none', floorMat: SLAB })),
];

// ---- Doors (price, kind and where) ------------------------------------------------------------------
const DOORS: DoorDef[] = [
  { id: 'street_beco', a: Z.street, b: Z.beco, cost: 750, kind: 'debris', label: 'Clear the Collapsed Shutter', axis: 'x', at: 30, a0: -16, a1: -13.6, y0: T0, y1: T0 + 3 },
  { id: 'street_houses', a: Z.street, b: Z.houses, cost: 750, kind: 'door', axis: 'x', at: 30, a0: 3.6, a1: 5.8, y0: T0, y1: T0 + 2.6 },
  { id: 'beco_houses', a: Z.beco, b: Z.houses, cost: 1000, kind: 'door', axis: 'z', at: -13.6, a0: 18.2, a1: 20.4, y0: T1, y1: T1 + 2.6 },
  { id: 'beco_quadra', a: Z.beco, b: Z.quadra, cost: 1250, kind: 'door', label: 'Open the Gate', axis: 'z', at: -16, a0: 4, a1: 6.6, y0: T2, y1: T2 + 2.6 },
  { id: 'houses_laje', a: Z.houses, b: Z.laje, cost: 1250, kind: 'door', label: 'Open the Roof Hatch', axis: 'x', at: 8, a0: 11.2, a1: 13.6, y0: T3, y1: T3 + 2.6 },
  { id: 'quadra_bridge', a: Z.quadra, b: Z.laje, cost: 1000, kind: 'debris', label: 'Clear the Bridge', axis: 'z', at: -16, a0: -22, a1: -19, y0: T3, y1: T3 + 2.6 },
  { id: 'laje_samba', a: Z.laje, b: Z.samba, cost: 1500, kind: 'door', axis: 'x', at: -24, a0: 14, a1: 16.4, y0: T3, y1: T3 + 2.6 },
  { id: 'samba_station', a: Z.samba, b: Z.station, cost: 1500, kind: 'debris', axis: 'z', at: 30, a0: -26.4, a1: -24.2, y0: T3, y1: T3 + 2.6 },
  { id: 'quadra_mirante', a: Z.quadra, b: Z.mirante, cost: 1500, kind: 'door', label: 'Open the Gate', axis: 'x', at: -8, a0: -48, a1: -45.6, y0: T2, y1: T2 + 2.6 },
  { id: 'station_power', a: Z.station, b: Z.power, cost: 1250, kind: 'debris', axis: 'z', at: 4, a0: -54, a1: -51.6, y0: T5, y1: T5 + 2.8 },
  { id: 'mirante_power', a: Z.mirante, b: Z.power, cost: 1250, kind: 'door', label: 'Open the Gate', axis: 'z', at: -12, a0: -50, a1: -47.6, y0: T5, y1: T5 + 2.6 },
];

// ---- Windows (barricades) ---------------------------------------------------------------------------
const WINDOWS: WindowDef[] = [
  { id: 0, zone: Z.street, x: -18, z: 34, nx: -1, nz: 0, floor: T0 },
  { id: 1, zone: Z.street, x: 36, z: 34, nx: 1, nz: 0, floor: T0 },
  { id: 2, zone: Z.street, x: 0, z: 46, nx: 0, nz: 1, floor: T0 },
  { id: 3, zone: Z.street, x: 6, z: 46, nx: 0, nz: 1, floor: T0 },
  { id: 4, zone: Z.street, x: 10, z: 42, nx: 1, nz: 0, floor: T0 },
  { id: 5, zone: Z.beco, x: -16, z: 19, nx: -1, nz: 0, floor: T1 },
  { id: 6, zone: Z.houses, x: 14, z: 13, nx: 1, nz: 0, floor: T2 },
  { id: 7, zone: Z.houses, x: 14, z: 21, nx: 1, nz: 0, floor: T1 },
  { id: 8, zone: Z.houses, x: 14, z: 28.2, nx: 1, nz: 0, floor: T0 },
  { id: 9, zone: Z.samba, x: 2, z: -32, nx: -1, nz: 0, floor: T3 },
  { id: 10, zone: Z.samba, x: 4.2, z: -40, nx: 0, nz: -1, floor: T3 },
  { id: 11, zone: Z.station, x: 24, z: -60, nx: 0, nz: -1, floor: T5 },
  { id: 12, zone: Z.power, x: -4, z: -60, nx: 0, nz: -1, floor: T5 },
  { id: 13, zone: Z.mirante, x: -48, z: -48, nx: -1, nz: 0, floor: T5 },
  { id: 14, zone: Z.quadra, x: -48, z: 12, nx: -1, nz: 0, floor: T2 },
];

// ---- Walls ------------------------------------------------------------------------------------------
const WALLS: WallDef[] = [
  // Street: house fronts to the north (with the beco mouth and the house door cut out), end walls, south parapets
  wall('x', 30, -18, 36, T0, T0 + 3.7, PAINT.terracotta),
  wall('z', -18, 30, 38, T0, T0 + 5, 'brick'),
  wall('z', 36, 30, 38, T0, T0 + 5, 'brick'),
  parapet('x', 38, -18, -4, T0),
  parapet('x', 38, 10, 23, T0), parapet('x', 38, 24.6, 36, T0),
  // Lanchonete: open shop front on the street, back windows over the slope
  wall('x', 38, -4, 10, T0, T0 + 3.7, PAINT.yellow, { openings: [{ a: -2.6, b: 8.6, y0: T0, y1: T0 + 2.9 }] }),
  wall('x', 46, -4, 10, T0, T0 + 3.7, PAINT.yellow),
  wall('z', -4, 38, 46, T0, T0 + 3.7, PAINT.yellow),
  wall('z', 10, 38, 46, T0, T0 + 3.7, PAINT.yellow),
  // Beco: west wall (low along flight 1 so roof zombies can drop in), tall where it faces the quadra; east = house rows
  wall('z', -16, 21, 30, T0, T0 + 6.6, 'brick'),
  wall('z', -16, 3, 21, T0, T3, 'brick'),
  wall('z', -13.6, 3, 30, T0, T3, PAINT.pink),
  wall('x', 3, -16, -13.6, T2, T3, 'brick'),
  // Row A (T0): A1 | A2 divider, east wall, stairwell enclosure
  wall('z', 0, 24, 30, T0, T0 + 3.4, PAINT.cream, { openings: [{ a: 26.8, b: 29, y0: T0, y1: T0 + 2.4 }] }),
  wall('z', 0, 24, 26.4, T0 + 3.4, T1 + 3.7, PAINT.cream),
  wall('z', 14, 24, 30, T0, T1 + 3.7, PAINT.terracotta),
  wall('x', 26.4, 0, 14, T0 + 3.4, T1 + 3.7, PAINT.cream),
  // Row B (T1): south wall with the stairwell exit, divider, east wall, B->C stairwell enclosure
  wall('x', 24, -13.6, 14, T1, T1 + 3.7, PAINT.teal, { openings: [{ a: 11.4, b: 13.6, y0: T1, y1: T1 + 2.4 }] }),
  wall('z', -3, 16, 24, T1, T1 + 3.4, PAINT.teal, { openings: [{ a: 20, b: 22.2, y0: T1, y1: T1 + 2.4 }] }),
  wall('z', 14, 16, 24, T1, T2 + 3.7, PAINT.teal),
  wall('x', 18.6, -3, 14, T1 + 3.4, T2 + 3.7, PAINT.teal),
  // Row C (T2): south wall with the B->C stair exit, east wall, north wall to the laje with the roof hatch
  wall('x', 16, -13.6, 14, T2, T2 + 3.7, PAINT.green, { openings: [{ a: -3, b: -1, y0: T2, y1: T2 + 2.4 }] }),
  wall('z', 14, 8, 16, T2, T3 + 3.7, PAINT.green),
  wall('x', 8, -13.6, 1, T2, T2 + 3.7, PAINT.green),
  wall('x', 8, 1, 14, T2, T3 + 3.7, PAINT.green),
  wall('z', 1, 8, 10.6, T2, T3 + 3.7, PAINT.green),
  wall('x', 10.6, 1, 14, T2 + 3.4, T3 + 3.7, PAINT.green),
  // Laje edges: west parapet (bridge gap), south parapets, east parapet (climb gap), NE corner wall
  parapet('z', -2, -24, 8, T3, { openings: [{ a: -22, b: -19, y0: T3, y1: T3 + 1.2 }] }),
  parapet('x', 8, -2, 1, T3), parapet('x', 8, 14, 34, T3),
  parapet('z', 34, -24, -7.7, T3), parapet('z', 34, -6.3, 8, T3),
  parapet('x', -24, -2, 2, T3),
  wall('x', -24, 30, 34, T3, T4, 'brick'),
  // Bridge rails
  parapet('x', -22.1, -16, -2, T3, { thickness: 0.12, mat: 'steel' }), parapet('x', -18.9, -16, -2, T3, { thickness: 0.12, mat: 'steel' }),
  // Samba hall shell
  wall('x', -24, 2, 30, T3, T5 + 0.3, PAINT.lilac),
  wall('x', -40, 2, 30, T3, T5 + 0.3, PAINT.lilac),
  wall('z', 2, -40, -24, T3, T5 + 0.3, PAINT.lilac),
  wall('z', 30, -40, -24, T3, T5 + 0.3, PAINT.lilac),
  // Station stair enclosure
  wall('z', 32.4, -44, -24, T3, T5 + 1.1, 'brick'),
  wall('z', 30, -44, -40, T3, T5 + 1.1, 'brick'),
  // Quadra: east over the ravine / beco, south retaining parapet (climb gap), west retaining wall, base station
  parapet('z', -16, -8, 3, T2),
  parapet('x', 16, -48, -30, T2), parapet('x', 16, -28.6, -16, T2),
  wall('z', -48, -8, 8, T2, T2 + 6, 'concrete'),
  wall('z', -48, 8, 16, T2, T2 + 6, 'brickDark'),
  wall('x', 8, -48, -40, T2, T2 + 6, 'brickDark', { openings: [{ a: -46.6, b: -41.4, y0: T2 + 0.6, y1: T2 + 5.8 }] }),
  wall('z', -40, 8, 16, T2, T2 + 6, 'brickDark', { openings: [{ a: 8.6, b: 15.4, y0: T2, y1: T2 + 4.2 }] }),
  // Stands: sides, the corner pocket's north face, the walkway's north/west walls, the bridge end
  wall('z', -40, -18, -8, T2, T3 + 1.1, 'concrete', { thickness: 0.25 }),
  parapet('z', -16, -18, -8, T2, { y1: T3 + 1.1 } as Partial<WallDef>),
  wall('x', -18, -45.6, -40, T2, T3, 'concrete'),
  wall('x', -22, -44, -16, T3, T3 + 3, 'brick'),
  wall('z', -44, -22, -18, T3, T3 + 3, 'brick'),
  wall('z', -16, -22, -18, T3, T3 + 3, 'brick'),
  // Escadaria walls
  wall('z', -48, -35, -8, T2, T5 + 1.5, 'concrete'),
  wall('z', -45.6, -35, -8, T2, T5 + 1.1, PAINT.blue, { thickness: 0.25 }),
  // Mirante: west/north walls, east wall shared with the substation, lookout railing to the south
  wall('z', -48, -60, -35, T5, T5 + 4, 'brick'),
  wall('x', -60, -48, -12, T5, T5 + 4, 'brick', { openings: [{ a: -41.8, b: -40.2, y0: T5, y1: T5 + 4 }] }),
  wall('z', -12, -60, -44, T5, T5 + 4, 'concrete'),
  parapet('z', -12, -44, -35, T5),
  parapet('x', -35, -45.6, -12, T5, { mat: 'steel', thickness: 0.12 }),
  // Substation: ravine-edge fence, north wall, east wall to the station (debris gap)
  parapet('x', -44, -12, 4, T5),
  wall('x', -60, -12, 4, T5, T5 + 4, 'concrete'),
  wall('z', 4, -60, -44, T5, T5 + 4, 'concrete'),
  // Station: south parapet (stair arrives at x 30..32.4), east + north walls
  parapet('x', -44, 4, 30, T5), parapet('x', -44, 32.4, 34, T5),
  wall('z', 34, -60, -44, T5, T5 + 4, 'brick'),
  wall('x', -60, 4, 34, T5, T5 + 4, 'brick'),
];

// ---- Stairs ------------------------------------------------------------------------------------------
const STAIRS: StairDef[] = [
  { rect: { x0: -16, z0: 21, x1: -13.6, z1: 30 }, dir: '-z', y0: T0, y1: T1, steps: 12, mat: SLAB, nosing: null },
  { rect: { x0: -16, z0: 8, x1: -13.6, z1: 17 }, dir: '-z', y0: T1, y1: T2, steps: 12, mat: SLAB, nosing: null },
  { rect: { x0: 2, z0: 24.2, x1: 11, z1: 26.2 }, dir: '+x', y0: T0, y1: T1, steps: 12, mat: 'concrete', nosing: null, rail: 'right' },
  { rect: { x0: -1, z0: 16.2, x1: 8, z1: 18.4 }, dir: '-x', y0: T1, y1: T2, steps: 12, mat: 'concrete', nosing: null, rail: 'left' },
  { rect: { x0: 2, z0: 8.2, x1: 11, z1: 10.4 }, dir: '+x', y0: T2, y1: T3, steps: 12, mat: 'concrete', nosing: null, rail: 'right' },
  { rect: { x0: -40, z0: -18, x1: -16, z1: -8 }, dir: '-z', y0: T2, y1: T3, steps: 10, mat: PAINT.blue, nosing: 'white' },
  { rect: { x0: -48, z0: -35, x1: -45.6, z1: -8 }, dir: '-z', y0: T2, y1: T5, steps: 36, mat: PAINT.yellow, nosing: 'white' },
  { rect: { x0: 30, z0: -44, x1: 32.4, z1: -26 }, dir: '-z', y0: T3, y1: T5, steps: 24, mat: SLAB, nosing: 'hazardYellow' },
  { rect: { x0: 14, z0: -36, x1: 18, z1: -34.6 }, dir: '-z', y0: T3, y1: T3 + 1.2, steps: 4, mat: 'wood', nosing: null },
];

// ---- Raised floors, landings, the bridge deck, spawn ledges and the water tower --------------------
const BOXES: BoxDef[] = [
  // Stairwell top landings
  floorBox(11, T0, 24, 14, T1, 26.4, 'concrete'),
  floorBox(-3, T1, 16, -1, T2, 18.6, 'concrete'),
  floorBox(11, T2, 8, 14, T3, 10.6, 'concrete'),
  // Samba stage
  floorBox(6, T3, -40, 26, T3 + 1.2, -36, { color: 0x6a4a34, texture: 'wood', roughness: 0.7 }),
  // Bridge deck and trestles down into the ravine
  floorBox(-16, T3 - 0.3, -22, -2, T3, -19, 'wood'),
  ...[-12.5, -9, -5.5].map((x) => vis(x - 0.2, 0, -21.2, x + 0.2, T3 - 0.3, -19.8, 'wood')),
  // Laje: raised roof units (rooftop jumps / mantles)
  floorBox(22, T3, -20, 30, T3 + 0.8, -12, PAINT.cream),
  floorBox(24, T3, -3, 31, T3 + 1.6, 4, PAINT.terracotta),
  floorBox(4, T3, -20, 9, T3 + 0.8, -14, PAINT.teal),
  // Water tower: solid shaft + walkable tank top reached by the ladder
  { box: [TOWER.x - 1.95, T3, TOWER.z - 1.95, TOWER.x + 1.95, TOWER.top - 0.2, TOWER.z + 1.95], mat: null, surface: 'metal' },
  { box: [TOWER.x - 1.7, TOWER.top - 0.2, TOWER.z - 1.7, TOWER.x + 1.7, TOWER.top, TOWER.z + 1.7], mat: null, collide: 'floor', surface: 'metal' },
  // Top station canopy columns (the canopy GLB draws them)
  ...[10.5, 18, 25.5].flatMap((x) => [-57.5, -46.5].map((z): BoxDef => ({ box: [x - 0.22, T5, z - 0.22, x + 0.22, T5 + 7, z + 0.22], mat: null, surface: 'metal' }))),
  // Spawn ledges: rooftops above the street, beco and quadra, a background roof east of the laje,
  // the samba roof, the station canopy top and a hillside shelf above the mirante
  floorBox(18, 0, 26, 30, T0 + 6, 29.7, PAINT.teal),
  floorBox(-20.5, 0, 22, -16.15, 11, 28, PAINT.pink),
  floorBox(34.15, 0, -10, 38.5, 11, -4, PAINT.yellow),
  floorBox(-54, 0, -2, -48.15, T2 + 6, 8, 'dirt'),
  floorBox(4, T5 + 0.3, -38, 28, T5 + 0.4, -25, 'corrugated'),
  { box: [10.5, T5 + 7.0, -57.8, 25.5, T5 + 7.7, -46.2], mat: null, collide: 'floor', surface: 'metal' },
  floorBox(-46, 0, -63.9, -36, T5 - 3, -60.15, 'dirt'),
  // Climb yards on the ground below the street and quadra parapets
  ...yard(22.6, 38.3, 25, 41, '-z', T0),
  ...yard(-34, 16.3, -24, 20, '-z', T2 - 5),
  floorBox(-34, 0, 16.3, -24, T2 - 5, 20, 'dirt'),
  // Lanchonete counter collider (the counter model sits on it)
  { box: [0.3, T0, 43.4, 3.5, T0 + 1.05, 45.2], mat: 'white', tile: 1, collide: 'solid' },
  // The summit (easter-egg ride destination) and the ravine pylon's pier
  floorBox(PEAK.x0, PEAK.y - 6, PEAK.z0, PEAK.x1, PEAK.y, PEAK.z1, 'dirt'),
  solid(PYLON.x - 1.6, 0, PYLON.z - 1.6, PYLON.x + 1.6, PYLON.top - 16, PYLON.z + 1.6, 'concrete'),
];

// ---- Nav links: climbs (ladder kind, one way up), drops off roofs and laje vaults ------------------
const climb = (from: [number, number, number], to: [number, number, number]): NavLinkDef =>
  ({ from: { x: from[0], y: from[1], z: from[2] }, to: { x: to[0], y: to[1], z: to[2] }, kind: 'ladder' });
const drop = (from: [number, number, number], to: [number, number, number]): NavLinkDef =>
  ({ from: { x: from[0], y: from[1], z: from[2] }, to: { x: to[0], y: to[1], z: to[2] }, kind: 'drop' });
const vault = (from: [number, number, number], to: [number, number, number]): NavLinkDef =>
  ({ from: { x: from[0], y: from[1], z: from[2] }, to: { x: to[0], y: to[1], z: to[2] }, kind: 'vault', twoWay: true });
const LINKS: NavLinkDef[] = [
  climb([23.8, 0, 39.2], [23.8, T0, 37.2]),
  climb([-29.3, T2 - 5, 17.2], [-29.3, T2, 15.0]),
  climb([35.2, 11, -7], [33.2, T3, -7]),
  climb([-41, T5 - 3, -61], [-41, T5, -58.8]),
  drop([24, T0 + 6, 29.4], [24, T0, 31.4]),
  drop([-16.5, 11, 25], [-14.8, becoY(25), 25]),
  drop([-48.5, T2 + 6, 3], [-46.4, T2, 3]),
  drop([20, T5 + 0.4, -25.3], [20, T3, -22.6]),
  drop([8, T5 + 0.4, -25.3], [8, T3, -22.6]),
  drop([18, T5 + 7.7, -46.5], [18, T5, -45.2]),
  vault([26, T3, -11.4], [26, T3 + 0.8, -12.6]),
  vault([21.4, T3, -16], [22.6, T3 + 0.8, -16]),
  vault([27.5, T3, 4.6], [27.5, T3 + 1.6, 3.4]),
  vault([6.5, T3, -13.4], [6.5, T3 + 0.8, -14.6]),
];

// Climb yards and roof ledges sit off the play floor, and the director counts height difference 3x as distance,
// so their weights compensate: vertical entries should be a regular part of every zone, not a rarity.
const SPAWNS: SpawnPointDef[] = [
  { zone: Z.street, x: 23.8, y: 0, z: 40.2, kind: 'point', weight: 4 },
  { zone: Z.street, x: 24, y: T0 + 6, z: 27.8, kind: 'point', weight: 4 },
  { zone: Z.beco, x: -18.4, y: 11, z: 25, kind: 'point', weight: 2.5 },
  { zone: Z.houses, x: -8, y: T0, z: 27.5, kind: 'ground' },
  { zone: Z.houses, x: -8, y: T2, z: 13, kind: 'ground' },
  { zone: Z.laje, x: 36.5, y: 11, z: -7, kind: 'point', weight: 3 },
  { zone: Z.laje, x: 20, y: T5 + 0.4, z: -31, kind: 'point', weight: 3.5 },
  { zone: Z.laje, x: 8, y: T5 + 0.4, z: -31, kind: 'point', weight: 3 },
  { zone: Z.quadra, x: -29, y: T2 - 5, z: 18.6, kind: 'point', weight: 3 },
  { zone: Z.quadra, x: -51, y: T2 + 6, z: 3, kind: 'point', weight: 3 },
  { zone: Z.samba, x: 20, y: T3, z: -30, kind: 'ground' },
  { zone: Z.station, x: 18, y: T5 + 7.7, z: -52, kind: 'point', weight: 3.5 },
  { zone: Z.mirante, x: -41, y: T5 - 3, z: -62.3, kind: 'point', weight: 2 },
  { zone: Z.power, x: -4, y: T5, z: -52, kind: 'ground' },
];

// ---- Lighting (dusk) ----------------------------------------------------------------------------------
const SODIUM = 0xff9a3a;
const BULB = 0xffc27a;
const LAMPS: LampDef[] = [
  // T0 sodium street lamps + the bar tube
  { x: -8, y: T0 + 5.9, z: 32.3, range: 22, pre: { color: SODIUM, intensity: 55, flicker: 'buzz' }, post: { color: SODIUM, intensity: 70, flicker: 'none' }, fixture: 'none' },
  { x: 22, y: T0 + 5.9, z: 32.3, range: 22, pre: { color: SODIUM, intensity: 50, flicker: 'faulty' }, post: { color: SODIUM, intensity: 70, flicker: 'none' }, fixture: 'none' },
  { x: 3, y: T0 + 3.0, z: 41.5, range: 11, pre: { color: 0xdfffe8, intensity: 5, flicker: 'faulty' }, post: { color: 0xe8fff0, intensity: 10, flicker: 'none' }, fixture: 'pendant' },
  // T1-T2 house bulbs + beco landing
  { x: -6, y: T0 + 3.0, z: 27, range: 9, pre: { color: BULB, intensity: 4.5, flicker: 'faulty' }, post: { color: BULB, intensity: 8, flicker: 'none' }, fixture: 'pendant' },
  { x: 4, y: T1 + 3.0, z: 21, range: 10, pre: { color: BULB, intensity: 4.5, flicker: 'faulty' }, post: { color: BULB, intensity: 8, flicker: 'none' }, fixture: 'pendant' },
  { x: -5, y: T2 + 3.0, z: 13, range: 10, pre: { color: BULB, intensity: 4.5, flicker: 'faulty' }, post: { color: BULB, intensity: 8, flicker: 'none' }, fixture: 'pendant' },
  { x: -14.8, y: T1 + 4.5, z: 19, range: 14, pre: { color: SODIUM, intensity: 26, flicker: 'buzz' }, post: { color: SODIUM, intensity: 34, flicker: 'none' }, fixture: 'none' },
  // T2 quadra floodlights (dark before power) + the cable-car base
  { x: -28, y: T2 + 10.5, z: 4, range: 42, pre: { color: 0x8090b0, intensity: 0, flicker: 'none' }, post: { color: 0xe8f0ff, intensity: 260, flicker: 'none' }, fixture: 'none' },
  { x: -44, y: T2 + 4.6, z: 12, range: 12, pre: { color: 0xff5030, intensity: 8, flicker: 'faulty' }, post: { color: 0xb0d0ff, intensity: 30, flicker: 'none' }, fixture: 'pendant' },
  // T3 laje festoon glow + samba hall neon
  { x: 14, y: T3 + 4, z: -8, range: 26, pre: { color: 0xffb070, intensity: 0, flicker: 'none' }, post: { color: 0xffc080, intensity: 60, flicker: 'none' }, fixture: 'none' },
  { x: 16, y: T3 + 5, z: -32, range: 26, pre: { color: 0xd09060, intensity: 40, flicker: 'faulty' }, post: { color: 0xff40c0, intensity: 70, flicker: 'none' }, fixture: 'none' },
  // T5 station / substation / mirante
  { x: 18, y: T5 + 4.2, z: -51, range: 24, pre: { color: 0xff3020, intensity: 9, flicker: 'faulty' }, post: { color: 0xa8c8ff, intensity: 70, flicker: 'none' }, fixture: 'none' },
  { x: -4, y: T5 + 3.5, z: -54, range: 14, pre: { color: 0xff3020, intensity: 10, flicker: 'faulty' }, post: { color: 0xa0ffd0, intensity: 30, flicker: 'buzz' }, fixture: 'none' },
  { x: -30, y: T5 + 5, z: -46, range: 30, pre: { color: 0x8aa0d8, intensity: 34, flicker: 'none' }, post: { color: 0xc0d0ff, intensity: 34, flicker: 'none' }, fixture: 'none' },
];

// ---- Props (GLBs; colliders authored here) -------------------------------------------------------------
const F = (m: string) => `favela/${m}.glb`;
/** Props with a generated LOD1 twin (`<id>.lod1.glb`, a quarter of the triangles) swap to it beyond 28 m. */
const HAS_LOD = new Set(['fv_water_tower', 'fv_motorbike', 'fv_bullwheel', 'fv_transformer', 'fv_bar_counter', 'fv_goal', 'fv_costume_rack', 'fv_drums', 'fv_fridge', 'fv_wires', 'fv_speakers', 'fv_table_chairs']);
const prop = (model: string, x: number, y: number, z: number, yaw = 0, collider?: PropDef['collider'], extra: Partial<PropDef> = {}): PropDef =>
  ({ model: F(model), x, y, z, yaw, collider, fallback: false, ...(HAS_LOD.has(model) ? { lod: { model: F(`${model}.lod1`), distance: 28 } } : {}), ...extra });
const PROPS: PropDef[] = [
  // Street + lanchonete
  prop('fv_bar_counter', 1.9, T0, 44.3, Math.PI, undefined),
  prop('fv_motorbike', 12.5, T0, 32.2, 0.35, { w: 0.8, d: 2.0, h: 1.2 }),
  prop('fv_table_chairs', -10.5, T0, 36.3, 0.4, { w: 1.3, d: 1.3, h: 0.9 }),
  prop('fv_table_chairs', 26.5, T0, 36.4, 1.9, { w: 1.3, d: 1.3, h: 0.9 }),
  prop('fv_barrel', -16.9, T0, 31.1, 0, { w: 0.6, d: 0.6, h: 0.9 }),
  prop('fv_gas_cylinder', -3.3, T0, 45.3, 0, { w: 0.45, d: 0.45, h: 0.85 }),
  prop('fv_gas_cylinder', 34.8, T0, 31.0, 0, { w: 0.45, d: 0.45, h: 0.85 }),
  prop('fv_fridge', -12.9, T0, 25.0, 0, { w: 0.85, d: 0.8, h: 2.0 }),
  // Houses
  prop('fv_table_chairs', 7, T1, 21.8, 0.7, { w: 1.3, d: 1.3, h: 0.9 }),
  prop('fv_barrel', 12.9, T2, 15.2, 0, { w: 0.6, d: 0.6, h: 0.9 }),
  // Laje: the water tower landmark, tanks, dishes, a table
  prop('fv_water_tower', TOWER.x, T3, TOWER.z, 0, undefined, { fit: { height: 9 } }),
  prop('fv_water_tank', 28, T3 + 0.8, -18, 0, { w: 1.6, d: 1.6, h: 1.05 }),
  prop('fv_water_tank', 7.5, T3 + 0.8, -17.5, 0, { w: 1.6, d: 1.6, h: 1.05 }),
  prop('fv_water_tank', 32.2, T3, -22.4, 0, { w: 1.6, d: 1.6, h: 1.05 }),
  prop('fv_satellite', 29.5, T3 + 1.6, 2.5, 2.4, { w: 0.7, d: 0.5, h: 1.2 }),
  prop('fv_satellite', 0.6, T3, -10, 1.2, { w: 0.7, d: 0.5, h: 1.2 }),
  prop('fv_satellite', 24.4, T3 + 0.8, -13.2, -0.6, { w: 0.7, d: 0.5, h: 1.2 }),
  prop('fv_table_chairs', 20.5, T3, 3.5, 0.3, { w: 1.3, d: 1.3, h: 0.9 }),
  prop('fv_barrel', 1.2, T3, 6.9, 0, { w: 0.6, d: 0.6, h: 0.9 }),
  prop('fv_gas_cylinder', 33.1, T3, 6.8, 0, { w: 0.45, d: 0.45, h: 0.85 }),
  // Quadra: goals, bench, the bottom station wheel
  prop('fv_goal', -41.6, T2, 4, Math.PI / 2, undefined),
  prop('fv_goal', -22.4, T2, 4, -Math.PI / 2, undefined),
  prop('fv_bullwheel', -44.2, T2 + 3.9, 14.3, 0, undefined),
  prop('fv_barrel', -39.2, T2, -17.2, 0, { w: 0.6, d: 0.6, h: 0.9 }),
  // Samba hall: drums on the stage, the sound system, the costume rail
  prop('fv_drums', 11.5, T3 + 1.2, -38.2, 0.2, { w: 1.4, d: 1.0, h: 0.9 }),
  prop('fv_drums', 15.8, T3 + 1.2, -39.0, -0.3, { w: 1.4, d: 1.0, h: 0.9 }),
  prop('fv_speakers', 24.5, T3 + 1.2, -38.9, 0, { w: 1.8, d: 0.7, h: 1.3 }),
  prop('fv_speakers', 7.2, T3 + 1.2, -38.9, 0, { w: 1.8, d: 0.7, h: 1.3 }),
  prop('fv_costume_rack', 27.8, T3, -29.5, -Math.PI / 2, { w: 1.9, d: 0.9, h: 1.45 }),
  prop('fv_costume_rack', 27.8, T3, -33.8, -Math.PI / 2, { w: 1.9, d: 0.9, h: 1.45 }),
  prop('fv_table_chairs', 8, T3, -27, 0.2, { w: 1.3, d: 1.3, h: 0.9 }),
  // Top station: canopy, drive wheel, the peak line's third wheel
  prop('fv_canopy', 18, T5, -52, 0, undefined),
  prop('fv_bullwheel', 18, T5, -57.4, 0, { w: 5.0, d: 2.5, h: 2.5 }),
  prop('fv_bullwheel', 30.3, T5, -58.6, Math.PI / 2, undefined, { scale: 0.55 }),
  // Substation: transformers flanking the switch
  prop('fv_transformer', -9, T5, -57.8, 0, { w: 2.6, d: 1.55, h: 2.1 }),
  prop('fv_transformer', 1, T5, -57.8, 0, { w: 2.6, d: 1.55, h: 2.1 }),
  // Mirante: benches (tables) at the lookout rail
  prop('fv_table_chairs', -22, T5, -38.5, 0.8, { w: 1.3, d: 1.3, h: 0.9 }),
  prop('fv_table_chairs', -35, T5, -38.8, -0.4, { w: 1.3, d: 1.3, h: 0.9 }),
];

export const FAVELA: ZombiesMapDef = {
  id: 'favela',
  name: 'Rio · Ridgelight',
  blurb: 'A hillside favela at dusk, overrun. Fight up six terraces of stair alleys, stacked houses and rooftop slabs to the power at the crest. The cable car brings you back down.',
  bounds: { minX: -60, minZ: -94, maxX: 46, maxZ: 58 },
  wallHeight: 3.4,
  zones: [
    { id: Z.street, name: 'BOTTOM STREET' }, { id: Z.beco, name: 'STAIR ALLEY' }, { id: Z.houses, name: 'STACKED HOUSES' },
    { id: Z.laje, name: 'BIG LAJE' }, { id: Z.quadra, name: 'THE QUADRA' }, { id: Z.samba, name: 'SAMBA HALL' },
    { id: Z.station, name: 'CABLE-CAR STATION' }, { id: Z.mirante, name: 'THE MIRANTE' }, { id: Z.power, name: 'SUBSTATION' },
  ],
  startZone: Z.street,
  rooms: ROOMS,
  walls: WALLS,
  boxes: BOXES,
  stairs: STAIRS,
  ladders: [{ bottom: { x: TOWER.x, y: T3, z: TOWER.z + 2.9 }, top: { x: TOWER.x, y: TOWER.top, z: TOWER.z + 1.2 }, mat: 'steel' }],
  links: LINKS,
  doors: DOORS,
  windows: WINDOWS,
  spawnPoints: SPAWNS,
  ground: null,
  props: PROPS,
  rides: RIDES,
  machines: {
    box: F('fv_mystery_box'),
    pap: F('fv_reforger'),
    perks: {
      lifeline: { model: F('perk_fv_lifeline'), foot: [0.72, 0.75] },
      bulwark: { model: F('perk_fv_bulwark'), foot: [0.88, 0.84] },
      quickhands: { model: F('perk_fv_quickhands'), foot: [1.2, 0.85] },
      hammerfall: { model: F('perk_fv_hammerfall'), foot: [1.32, 1.4] },
    },
  },
  playerSpawn: { x: 4, y: T0, z: 34.5, yaw: Math.PI / 2 + 0.25 },
  coopSpawns: [{ x: 1, y: T0, z: 34.5, yaw: Math.PI / 2 }, { x: 7, y: T0, z: 34.5, yaw: Math.PI / 2 }, { x: 4, y: T0, z: 36.5, yaw: Math.PI / 2 }],
  box: {
    start: 0,
    spots: [
      { x: 16, z: 30.75, face: 0, y: T0 },
      { x: -8, z: 23.25, face: Math.PI, y: T1 },
      { x: 24, z: -7, face: 0, y: T3 },
      { x: -42.6, z: -17.25, face: 0, y: T2 },
      { x: 20, z: -38.2, face: 0, y: T3 + 1.2 },
      { x: -20, z: -59.25, face: 0, y: T5 },
    ],
  },
  perks: {
    lifeline: { x: 8.8, z: 44, face: -Math.PI / 2, y: T0 },
    bulwark: { x: -44.8, z: -12, face: Math.PI / 2, y: T2 },
    quickhands: { x: 3.0, z: -28, face: Math.PI / 2, y: T3 },
    hammerfall: { x: 8, z: -58.8, face: 0, y: T5 },
  },
  pap: { x: -46.8, z: 12, face: Math.PI / 2, y: T2 },
  power: { x: -4, z: -59.6, face: 0, y: T5 },
  wallBuys: [
    { key: 'pi_warden', x: -6, z: 30.17, face: 0, y: T0 },
    { key: 'pi_magnus', x: -3.83, z: 42, face: Math.PI / 2, y: T0 },
    { key: 'smg_wren', x: -8, z: 24.17, face: 0, y: T0 },
    { key: 'sg_hullbreaker', x: -8, z: 8.17, face: 0, y: T2 },
    { key: 'ar_kestrel', x: 6, z: -23.83, face: 0, y: T3 },
    { key: 'smg_skiff', x: -47.83, z: -2.5, face: Math.PI / 2, y: T2 },
    { key: 'ar_corvid', x: 24, z: -24.17, face: Math.PI, y: T3 },
    { key: 'dmr_sentry', x: -30, z: -59.83, face: 0, y: T5 },
  ],
  startWeapon: 'pi_warden',
  egg: {
    name: 'Last Ride to the Peak',
    steps: [
      {
        kind: 'collect', requiresPower: true, toast: 'A CABLE GRIP · THE PEAK LINE NEEDS THREE',
        objects: [
          { x: -15.2, y: T1 + 0.3, z: 20.4, model: 'relic' },
          { x: 10, y: T3 + 1.5, z: -38.4, model: 'relic' },
          { x: TOWER.x, y: TOWER.top + 0.3, z: TOWER.z, model: 'relic' },
        ],
      },
      { kind: 'interact', requiresPower: true, prompt: 'Refit the peak line', toast: 'THE PEAK LINE GROANS AWAKE · HOLD THE STATION', objects: [{ x: 30.5, y: T5 + 1, z: -57.5, model: 'relic', radius: 1.8 }] },
      { kind: 'kill', zone: Z.station, count: 24, requiresPower: true, toast: 'THE CAR IS COMING DOWN FROM THE PEAK' },
      { kind: 'interact', prompt: 'Take what the peak keeps', toast: 'THE PEAK LINE RUNS · RIDE IT FROM THE STATION', objects: [{ x: 24, y: PEAK_Y + 1.1, z: -84.2, model: 'orb', radius: 1.8 }] },
    ],
    reward: { title: 'LAST RIDE TO THE PEAK', sub: 'The Arc Projector is yours · +5000 · max ammo', points: 5000, reforge: true, refillAmmo: true, powerup: 'max_ammo', weapon: 'ww_arc' },
  },
  powerups: { dropChanceMult: 1 },
  lighting: {
    background: 0x2a2140,
    sky: { top: 0x121638, horizon: 0xf0884a, stars: true, moon: false },
    fogColor: 0x6b5060,
    fogDensity: 0.011,
    hemi: 0.7,
    sun: 1.0,
    sunColor: 0xff9a5a,
    sunDir: [-0.35, 0.18, 0.92],
    postPower: { hemi: 0.6 },
    lamps: LAMPS,
  },
  audio: { ambience: 'relay' },
  assets: [
    'favela/perk_fv_lifeline.glb', 'favela/perk_fv_bulwark.glb', 'favela/perk_fv_quickhands.glb', 'favela/perk_fv_hammerfall.glb',
    'favela/fv_reforger.glb', 'favela/fv_mystery_box.glb', 'zombies/power_switch.glb', 'zombies/kit_door.glb', 'zombies/kit_debris.glb',
  ],
};
