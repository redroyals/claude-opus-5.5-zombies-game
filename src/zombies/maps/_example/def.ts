// Minimal example map for docs/MAP_API.md (not registered in the menu; validated by the tests).
// A two-storey house: the ground floor is the start zone, a debris pile at the top of the stairs opens the
// upper floor. Shows stacked rooms (slab support), stairs, windows on two floors and non-window spawns.
import type { ZombiesMapDef } from '../../mapdef';

const UP = 3.5; // upper floor height
const TOP = 6.5; // roof underside

export const EXAMPLE_HOUSE: ZombiesMapDef = {
  id: 'example-house',
  name: 'Example House',
  blurb: 'Two storeys, one staircase, one debris pile. The smallest complete map.',
  bounds: { minX: -12, minZ: -12, maxX: 26, maxZ: 22 },
  wallHeight: 3.2,
  zones: [{ id: 0, name: 'GROUND FLOOR' }, { id: 1, name: 'UPSTAIRS' }],
  startZone: 0,
  rooms: [
    // The ground floor has no ceiling of its own: the upstairs slabs are its ceiling (the stairwell stays open).
    { zone: 0, name: 'GROUND FLOOR', rect: { x0: 0, z0: 0, x1: 14, z1: 10 }, floor: 0, ceiling: null },
    { zone: 1, name: 'BEDROOM', rect: { x0: 0, z0: 0, x1: 10, z1: 10 }, floor: UP, ceiling: TOP, support: 'slab' },
    { zone: 1, name: 'LANDING', rect: { x0: 10, z0: 0, x1: 14, z1: 2 }, floor: UP, ceiling: TOP, support: 'slab' },
  ],
  walls: [
    // Exterior, full height (windows are cut in automatically).
    { axis: 'x', at: 0, a0: 0, a1: 14, y0: 0, y1: TOP, mat: 'brick' },
    { axis: 'x', at: 10, a0: 0, a1: 14, y0: 0, y1: TOP, mat: 'brick' },
    { axis: 'z', at: 0, a0: 0, a1: 10, y0: 0, y1: TOP, mat: 'brick' },
    { axis: 'z', at: 14, a0: 0, a1: 10, y0: 0, y1: TOP, mat: 'brick' },
    // Upstairs: walls around the stairwell (the debris door is cut into the first one).
    { axis: 'x', at: 2, a0: 10, a1: 14, y0: UP, y1: TOP, mat: 'plaster' },
    { axis: 'z', at: 10, a0: 2, a1: 10, y0: UP, y1: TOP, mat: 'plaster' },
  ],
  stairs: [{ rect: { x0: 11, z0: 2.3, x1: 13, z1: 9.5 }, dir: '-z', y0: 0, y1: UP, steps: 11, rail: 'left' }],
  doors: [{ id: 'stairs_debris', a: 0, b: 1, cost: 750, kind: 'debris', axis: 'x', at: 2, a0: 11, a1: 13, y0: UP, y1: UP + 2.4 }],
  windows: [
    { id: 0, zone: 0, x: 3, z: 10, nx: 0, nz: 1, floor: 0 },
    { id: 1, zone: 0, x: 7, z: 10, nx: 0, nz: 1, floor: 0 },
    { id: 2, zone: 1, x: 8, z: 0, nx: 0, nz: -1, floor: UP },
  ],
  spawnPoints: [
    { zone: 0, kind: 'ground', x: 8.5, y: 0, z: 6 },
    { zone: 1, kind: 'drop', x: 5, y: UP, z: 7 },
  ],
  boxes: [
    { box: [4, 0, 4.5, 6, 0.9, 5.5], mat: 'wood', surface: 'wood' }, // a table
    { box: [10, TOP, 2, 14, TOP + 0.3, 10], mat: 'concreteDark' }, // roof over the stairwell
  ],
  playerSpawn: { x: 3, z: 7, yaw: 0 },
  box: { spots: [{ x: 2, z: 1.2, face: 0 }] },
  perks: { quickhands: { x: 7, z: 1, face: 0 } },
  pap: { x: 3, z: 1.4, face: 0, y: UP },
  power: null, // power is on from the start
  wallBuys: [{ key: 'smg_wren', x: 0.17, z: 5, face: Math.PI / 2 }],
  lighting: {
    background: 0x0a0d14, fogColor: 0x0c0f16, fogDensity: 0.03, hemi: 0.4, sun: 0.3,
    lamps: [
      { x: 5, y: UP - 0.4, z: 5, pre: { color: 0xffb070, intensity: 30 }, post: { color: 0xffb070, intensity: 30 } },
      { x: 5, y: TOP - 0.4, z: 5, pre: { color: 0xffb070, intensity: 30 }, post: { color: 0xffb070, intensity: 30 } },
    ],
  },
};
