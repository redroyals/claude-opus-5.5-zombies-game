// "Lahore Darbar" layout: pure data (no three.js). North is -Z. All rects are integer metres.
// The level is authored as AREAS (walkable volumes on four layers) plus stairs, doors, windows and spots.
// `raster.ts` turns it into masses, walls, rails and nav links; `def.ts` turns that into a ZombiesMapDef.
// See docs/maps/lahore-darbar.md for the design and the respect rules.

export const B = 0; // basements (the engine ground plane is y = 0, so the street is raised)
export const G = 3; // ground: courts, lanes, haveli courtyards
export const P = 4.2; // plinths (baradari, halls, drum pavilion)
export const U = 7.2; // upper: Shah Burj, ramparts, galleries
export const U2 = 8.4; // upper plinths (Naulakha, Diwan-e-Khas)
export const R = 10.2; // rooftops

export type Layer = 'B' | 'G' | 'U' | 'R';
export type Side = '+x' | '-x' | '+z' | '-z';
export type Rect4 = [number, number, number, number]; // x0, z0, x1, z1

export const Z = {
  bagh: 0, topkhana: 1, aam: 2, tosha: 3, burj: 4, sheesh: 5, ramparts: 6, armoury: 7,
  roshnai: 8, wazir: 9, kucha: 10, naqqar: 11, kothay: 12, tehkhana: 13,
} as const;

export const ZONE_NAMES: Record<number, string> = {
  0: 'HAZURI BAGH', 1: 'TOP KHANA', 2: 'DIWAN-E-AAM', 3: 'TOSHAKHANA', 4: 'SHAH BURJ', 5: 'SHEESH MAHAL', 6: 'RAMPARTS',
  7: 'SILAH KHANA', 8: 'ROSHNAI GATE', 9: 'HAVELI-E-WAZIR', 10: 'KUCHA', 11: 'NAQQAR KHANA', 12: 'KOTHAY', 13: 'TEHKHANA',
};

/** Surface palettes; `def.ts` maps them to materials. */
export type Surf = 'marble' | 'inlay' | 'sandstone' | 'brick' | 'plaster' | 'plasterOchre' | 'plasterBlue' | 'garden' | 'paving'
  | 'cobble' | 'dirt' | 'wood' | 'mirror' | 'stoneDark' | 'terrace';

/** An overlook edge on line `at` (x for ±x sides, z for ±z sides), spanning a0..a1 along it, that gets a rail instead of a wall. */
export interface Drop { side: Side; at: number; a0: number; a1: number; kind?: 'rail' | 'parapet' | 'low' }

export interface AreaDef {
  id: string;
  zone: number;
  layer: Layer;
  rects: Rect4[];
  floor: number;
  /** Absolute ceiling underside, or null for open sky. */
  ceiling: number | null;
  /** What sits above a covered area when nothing walkable does: a slab roof (kit on top) or solid mass. */
  roof?: 'slab' | 'mass';
  floorSurf: Surf;
  wallSurf: Surf;
  /** Edges that overlook a lower area and get a rail (one-way drop) instead of a wall. */
  drops?: Drop[];
  /** Solid mass pseudo-area: cells are forced solid on this layer (e.g. the throne base under the jharokha). */
  mass?: boolean;
  /** A stair: bottom layer is `layer`; ascends toward `dir` from y0 to y1, one metre per step. */
  stair?: { dir: Side; y0: number; y1: number };
  /** Walls toward the outside of the map are low parapets + invisible colliders (roofs, ramparts). */
  parapet?: boolean;
}

const A = (id: string, zone: number, layer: Layer, rects: Rect4[], floor: number, ceiling: number | null, floorSurf: Surf, wallSurf: Surf, extra: Partial<AreaDef> = {}): AreaDef =>
  ({ id, zone, layer, rects, floor, ceiling, floorSurf, wallSurf, ...extra });
const S = (id: string, zone: number, layer: Layer, rect: Rect4, dir: Side, y0: number, y1: number, surf: Surf, ceiling: number | null = null): AreaDef =>
  ({ id, zone, layer, rects: [rect], floor: y0, ceiling, floorSurf: surf, wallSurf: surf === 'marble' ? 'marble' : 'sandstone', stair: { dir, y0, y1 } });

// Later entries override earlier ones on the same layer (plinths inside courts, stairs inside courtyards).
export const AREAS: AreaDef[] = [
  // ---------------------------------------------------------------- COURT (Qila)
  A('bagh', Z.bagh, 'G', [[-18, -6, 14, 20]], G, null, 'garden', 'brick'),
  A('bar_plinth', Z.bagh, 'G', [[-8, 2, 4, 14]], P, null, 'marble', 'marble'),
  A('baradari', Z.bagh, 'G', [[-6, 4, 2, 12]], P, 8.6, 'inlay', 'marble', { roof: 'slab' }),
  S('bar_s', Z.bagh, 'G', [-4, 14, 0, 17], '-z', G, P, 'marble'),
  S('bar_n', Z.bagh, 'G', [-4, -1, 0, 2], '+z', G, P, 'marble'),
  S('bar_e', Z.bagh, 'G', [4, 6, 7, 10], '-x', G, P, 'marble'),
  S('bar_w', Z.bagh, 'G', [-11, 6, -8, 10], '+x', G, P, 'marble'),

  A('topkhana', Z.topkhana, 'G', [[-52, -6, -18, 20]], G, null, 'cobble', 'brick'),
  A('gun_plinth', Z.topkhana, 'G', [[-39, 3, -31, 10]], G + 0.4, null, 'sandstone', 'sandstone'),
  S('hathi_ramp', Z.topkhana, 'G', [-52, -40, -46, -6], '-z', G, U, 'sandstone'),
  A('hathi_landing', Z.topkhana, 'U', [[-52, -48, -44, -40]], U, null, 'sandstone', 'sandstone'),

  A('armoury', Z.armoury, 'G', [[-44, -30, -18, -6]], G, 9.0, 'stoneDark', 'brick', { roof: 'mass' }),

  A('aam_quad', Z.aam, 'G', [[-18, -30, 14, -10]], G, null, 'paving', 'sandstone'),
  S('aam_steps', Z.aam, 'G', [-6, -30, 2, -27], '-z', G, P, 'sandstone'),
  A('aam_hall', Z.aam, 'G', [[-18, -40, 10, -30]], P, 11.0, 'inlay', 'sandstone', { roof: 'mass' }),
  A('throne_base', Z.aam, 'G', [[-5, -40, 1, -37]], P, null, 'marble', 'marble', { mass: true }),
  A('gate_alamgiri', Z.aam, 'G', [[-4, -10, 2, -6]], G, 7.8, 'paving', 'sandstone', { roof: 'mass' }),

  A('tosha_hall', Z.tosha, 'G', [[14, -24, 30, -10]], G, 9.0, 'inlay', 'sandstone', { roof: 'mass' }),
  S('tosha_stair', Z.tosha, 'B', [22, -32, 28, -24], '+z', B, G, 'stoneDark', 5.8),
  A('vault', Z.tosha, 'B', [[14, -46, 30, -32]], B, 4.5, 'stoneDark', 'brick', { roof: 'mass' }),

  S('khas_stair', Z.burj, 'G', [10, -40, 14, -30], '-z', G, U, 'marble'),
  A('burj_quad', Z.burj, 'U', [[-44, -58, 14, -40]], U, null, 'marble', 'sandstone'),
  A('jharokha', Z.burj, 'U', [[-5, -40, 1, -37]], U, null, 'marble', 'marble',
    { ceiling: 11.0, roof: 'mass', drops: [{ side: '+z', at: -37, a0: -5, a1: 1 }, { side: '-x', at: -5, a0: -40, a1: -37 }, { side: '+x', at: 1, a0: -40, a1: -37 }] }),
  A('naulakha', Z.burj, 'U', [[-42, -56, -34, -48]], U2, 12.2, 'inlay', 'marble', { roof: 'slab' }),
  S('naulakha_steps', Z.burj, 'U', [-40, -48, -36, -45], '-z', U, U2, 'marble'),
  A('khas_pav', Z.burj, 'U', [[0, -54, 12, -44]], U2, 13.0, 'inlay', 'marble', { roof: 'slab' }),
  S('khas_steps', Z.burj, 'U', [4, -44, 8, -41], '-z', U, U2, 'marble'),

  A('sheesh', Z.sheesh, 'U', [[-34, -70, -6, -58]], U, 14.0, 'inlay', 'mirror', { roof: 'mass' }),

  A('burj_conn', Z.ramparts, 'U', [[-52, -58, -44, -52]], U, null, 'sandstone', 'sandstone', { parapet: true }),
  A('rampart_w', Z.ramparts, 'U', [[-58, -58, -52, 20]], U, null, 'sandstone', 'sandstone',
    { parapet: true, drops: [{ side: '+x', at: -52, a0: -6, a1: 20, kind: 'parapet' }] }),
  S('burj_stair', Z.ramparts, 'U', [-58, 20, -54, 27], '+z', U, R, 'sandstone'),
  A('burj_top', Z.ramparts, 'R', [[-60, 27, -50, 37]], R, null, 'sandstone', 'sandstone', { parapet: true }),

  // ---------------------------------------------------------------- HAVELI (Andrun Shehr)
  A('roshnai_gate', Z.roshnai, 'G', [[14, 8, 34, 14]], G, 8.0, 'cobble', 'brick', { roof: 'mass' }),
  A('lane_a', Z.roshnai, 'G', [[34, -21, 37, 33]], G, null, 'cobble', 'plasterOchre'),

  A('lanes', Z.kucha, 'G', [[34, -24, 87, -21], [34, 33, 87, 36], [84, -21, 87, 33], [59, -21, 62, 33], [41, 6, 59, 9]], G, null, 'cobble', 'plasterOchre'),
  A('chowk', Z.kucha, 'G', [[59, 3, 66, 12]], G, null, 'brick', 'plasterOchre'),

  A('wazir_court', Z.wazir, 'G', [[42, -16, 54, 1]], G, null, 'brick', 'plasterOchre'),
  A('wazir_deorhi', Z.wazir, 'G', [[37, -10, 42, -6]], G, 6.6, 'brick', 'plasterOchre'),
  A('wazir_exit', Z.wazir, 'G', [[54, -12, 59, -8]], G, 6.6, 'brick', 'plasterOchre'),
  S('wazir_stair', Z.wazir, 'G', [44, -16, 54, -13], '+x', G, U, 'wood'),
  A('wazir_gal', Z.wazir, 'U', [[37, -21, 59, -16], [37, -16, 42, 1], [54, -16, 59, -4]], U, 10.4, 'wood', 'plasterOchre', {
    roof: 'mass',
    drops: [{ side: '+z', at: -16, a0: 42, a1: 54 }, { side: '+x', at: 42, a0: -16, a1: 1 }, { side: '-x', at: 54, a0: -13, a1: -4 }],
  }),
  S('wazir_roofstair', Z.kothay, 'U', [54, -4, 59, 3], '+z', U, R, 'wood'),

  A('naqqar_court', Z.naqqar, 'G', [[66, -16, 80, 10]], G, null, 'brick', 'plasterBlue'),
  A('drum_plinth', Z.naqqar, 'G', [[70, -6, 76, 0]], P, 9.0, 'inlay', 'marble', { roof: 'slab' }),
  S('drum_s', Z.naqqar, 'G', [71, 0, 75, 3], '-z', G, P, 'marble'),
  S('drum_n', Z.naqqar, 'G', [71, -9, 75, -6], '+z', G, P, 'marble'),
  S('naqqar_stair', Z.naqqar, 'G', [66, -16, 69, -6], '-z', G, U, 'wood'),
  A('naqqar_gal', Z.naqqar, 'U', [[62, -21, 84, -16], [62, -16, 66, 3], [80, -16, 84, 13], [66, 10, 80, 13]], U, 10.4, 'wood', 'plasterBlue', {
    roof: 'mass',
    drops: [{ side: '+z', at: -16, a0: 66, a1: 80 }, { side: '+x', at: 66, a0: -16, a1: 3 }, { side: '-x', at: 80, a0: -16, a1: 10 }, { side: '-z', at: 10, a0: 66, a1: 80 }],
  }),
  S('naqqar_roofstair', Z.kothay, 'U', [80, 13, 84, 20], '+z', U, R, 'wood'),

  A('roofs', Z.kothay, 'R', [[37, 1, 54, 6], [54, 3, 59, 6], [37, 9, 59, 33], [62, 13, 80, 33], [80, 20, 84, 33]], R, null, 'terrace', 'plasterOchre', {
    parapet: true,
    drops: [
      { side: '-z', at: 1, a0: 42, a1: 54 }, // into the Wazir courtyard
      { side: '+z', at: 6, a0: 41, a1: 59, kind: 'low' }, { side: '-z', at: 9, a0: 41, a1: 59, kind: 'low' }, // middle-lane jump gap
      { side: '+x', at: 59, a0: 9, a1: 33, kind: 'low' }, { side: '-x', at: 62, a0: 13, a1: 33, kind: 'low' }, // lane-B jump gap
      { side: '-x', at: 37, a0: 9, a1: 33, kind: 'low' }, // down into lane A
      { side: '+z', at: 33, a0: 37, a1: 84, kind: 'low' }, // down into the south lane
      { side: '+x', at: 84, a0: 20, a1: 33, kind: 'low' }, // down into the east lane
    ],
  }),

  A('tehkhana', Z.tehkhana, 'B', [[30, -46, 48, -31]], B, 3.4, 'stoneDark', 'stoneDark', { roof: 'mass' }),
  S('teh_stair', Z.tehkhana, 'B', [44, -31, 48, -24], '+z', B, G, 'stoneDark', 5.6),
];

/** Built footprint (everything inside is solid mass unless an area carves it) and its skyline height. */
export const REGIONS: { rect: Rect4; top: number; surf: Surf }[] = [
  { rect: [-58, -74, 34, 38], top: 13, surf: 'sandstone' },
  { rect: [-62, 20, -48, 38], top: 13, surf: 'sandstone' },
  { rect: [-20, -8, 16, 22], top: 9, surf: 'brick' },
  { rect: [-36, -72, -4, -56], top: 16, surf: 'sandstone' },
  { rect: [34, -50, 92, 40], top: 13.4, surf: 'plasterOchre' },
];

export interface DoorSpec { id: string; a: number; b: number; cost: number; kind: 'door' | 'debris'; axis: 'x' | 'z'; at: number; a0: number; a1: number; y0: number; label?: string }
const D = (id: string, a: number, b: number, cost: number, kind: 'door' | 'debris', axis: 'x' | 'z', at: number, a0: number, a1: number, y0: number, label?: string): DoorSpec =>
  ({ id, a, b, cost, kind, axis, at, a0, a1, y0, label });
export const DOOR_H = 3.3;
export const DOORS: DoorSpec[] = [
  D('bagh_topkhana', Z.bagh, Z.topkhana, 750, 'door', 'z', -18, 12, 15, G, 'Open the Sher Darwaza'),
  D('bagh_alamgiri', Z.bagh, Z.aam, 1000, 'debris', 'x', -6, -3, 1, G, 'Clear the Alamgiri Gate'),
  D('bagh_roshnai', Z.bagh, Z.roshnai, 1250, 'door', 'z', 14, 9, 13, G, 'Open the Roshnai Gate'),
  D('topkhana_armoury', Z.topkhana, Z.armoury, 1500, 'door', 'x', -6, -33, -29, G, 'Open the Silah Khana'),
  D('topkhana_hathipol', Z.topkhana, Z.burj, 1250, 'door', 'z', -44, -47, -43, U, 'Open the Hathi Pol'),
  D('aam_khas', Z.aam, Z.burj, 1000, 'debris', 'x', -30, 10, 14, G, 'Clear the Diwan-e-Khas stair'),
  D('aam_toshakhana', Z.aam, Z.tosha, 1250, 'door', 'z', 14, -19, -15, G, 'Open the Toshakhana'),
  D('burj_sheesh', Z.burj, Z.sheesh, 1500, 'door', 'x', -58, -22, -18, U, 'Open the Sheesh Mahal'),
  D('burj_ramparts', Z.burj, Z.ramparts, 1000, 'debris', 'z', -44, -57, -53, U, 'Clear the way to the ramparts'),
  D('roshnai_wazir', Z.roshnai, Z.wazir, 1000, 'door', 'z', 37, -9.5, -6.5, G, "Open the Wazir's haveli"),
  D('roshnai_kucha_n', Z.roshnai, Z.kucha, 1250, 'debris', 'x', -21, 34, 37, G, 'Clear the galli'),
  D('roshnai_kucha_s', Z.roshnai, Z.kucha, 1000, 'debris', 'x', 33, 34, 37, G, 'Clear the galli'),
  D('wazir_kucha', Z.wazir, Z.kucha, 750, 'door', 'z', 59, -11.5, -8.5, G, 'Open the back door'),
  D('wazir_kothay', Z.wazir, Z.kothay, 1500, 'door', 'x', -4, 54, 59, U, 'Open the roof stair'),
  D('kucha_naqqar', Z.kucha, Z.naqqar, 1500, 'door', 'z', 66, 5, 8, G, 'Open the Naqqar Khana'),
  D('naqqar_kothay', Z.naqqar, Z.kothay, 1250, 'debris', 'x', 13, 80, 84, U, 'Clear the roof stair'),
  D('kucha_tehkhana', Z.kucha, Z.tehkhana, 1250, 'debris', 'x', -24, 44, 48, G, 'Clear the tehkhana steps'),
  D('tehkhana_vault', Z.tehkhana, Z.tosha, 2000, 'door', 'z', 30, -41, -37, B, 'Clear the old tunnel'),
];

/** Walls between different zones that are see-through screens (block movement, not bullets or sight). */
export const JAALIS: { axis: 'x' | 'z'; at: number; a0: number; a1: number; y0: number; y1: number }[] = [
  { axis: 'z', at: -18, a0: -30, a1: -10, y0: G, y1: G + 5.2 },
];

export interface WindowSpec { zone: number; x: number; z: number; nx: number; nz: number; floor: number }
const W = (zone: number, x: number, z: number, side: Side, floor: number): WindowSpec =>
  ({ zone, x, z, nx: side === '+x' ? 1 : side === '-x' ? -1 : 0, nz: side === '+z' ? 1 : side === '-z' ? -1 : 0, floor });
export const WINDOWS: WindowSpec[] = [
  W(Z.bagh, -10, 20, '+z', G), W(Z.bagh, 6, 20, '+z', G), W(Z.bagh, -12, -6, '-z', G), W(Z.bagh, 10, -6, '-z', G),
  W(Z.topkhana, -44, 20, '+z', G), W(Z.topkhana, -26, 20, '+z', G), W(Z.topkhana, -52, 2, '-x', G), W(Z.topkhana, -52, 14, '-x', G),
  W(Z.armoury, -38, -30, '-z', G), W(Z.armoury, -26, -30, '-z', G),
  W(Z.aam, 14, -27, '+x', G), W(Z.aam, -18, -35, '-x', P),
  W(Z.tosha, 30, -17, '+x', G), W(Z.tosha, 14, -43, '-x', B), W(Z.tosha, 17, -32, '+z', B),
  W(Z.burj, -38, -58, '-z', U), W(Z.burj, 14, -52, '+x', U),
  W(Z.sheesh, -24, -70, '-z', U), W(Z.sheesh, -34, -64, '-x', U),
  W(Z.ramparts, -58, -30, '-x', U), W(Z.ramparts, -58, 5, '-x', U),
  W(Z.roshnai, 24, 14, '+z', G), W(Z.roshnai, 34, -2, '-x', G), W(Z.roshnai, 34, 24, '-x', G),
  W(Z.wazir, 43, -16, '-z', G), W(Z.wazir, 54, -2, '+x', G),
  W(Z.kucha, 60, -24, '-z', G), W(Z.kucha, 78, -24, '-z', G), W(Z.kucha, 87, 0, '+x', G), W(Z.kucha, 87, 25, '+x', G),
  W(Z.kucha, 50, 36, '+z', G), W(Z.kucha, 75, 36, '+z', G), W(Z.kucha, 41, 7.5, '-x', G),
  W(Z.naqqar, 80, 5, '+x', G), W(Z.naqqar, 74, -16, '-z', G), W(Z.naqqar, 72, 10, '+z', G),
  W(Z.tehkhana, 36, -46, '-z', B), W(Z.tehkhana, 48, -40, '+x', B),
];

/** Extra (non-window) spawns: zombies clamber over roof parapets and claw out of the basement floor. */
export const SPAWN_POINTS: { zone: number; x: number; y: number; z: number; kind: 'ground' | 'drop' | 'point' }[] = [
  { zone: Z.kothay, x: 40, y: R, z: 31, kind: 'drop' }, { zone: Z.kothay, x: 82, y: R, z: 31, kind: 'drop' }, { zone: Z.kothay, x: 56, y: R, z: 12, kind: 'drop' },
  { zone: Z.tehkhana, x: 33, y: B, z: -34, kind: 'ground' }, { zone: Z.tehkhana, x: 41, y: B, z: -44, kind: 'ground' },
  { zone: Z.tosha, x: 27, y: B, z: -44, kind: 'ground' },
  { zone: Z.kucha, x: 85.5, y: G, z: 12, kind: 'point' }, { zone: Z.kucha, x: 45, y: G, z: 34.5, kind: 'point' },
];

/** Jump gaps between roofs (players jump them; zombies use a two-way jump link). */
export const JUMPS: { from: [number, number, number]; to: [number, number, number] }[] = [
  { from: [48, R, 5.4], to: [48, R, 9.6] }, // H1 south roof <-> H3 roof, over the middle lane
  { from: [58.4, R, 20], to: [62.6, R, 20] }, // H3 roof <-> H2 roof, over lane B
];

/** Ladders (bottom stand point -> top landing). */
export const LADDERS: { bottom: [number, number, number]; top: [number, number, number] }[] = [
  { bottom: [46, G, 34.2], top: [46, R, 32.2] }, // south lane -> H3 roof
];

// Player yaw uses the camera convention (0 looks north, -Z).
export const PLAYER_SPAWN = { x: -2, y: G, z: 18.5, yaw: 0 };
export const COOP_SPAWNS = [{ x: -6, y: G, z: 18.5, yaw: 0 }, { x: 2, y: G, z: 18.5, yaw: 0 }, { x: -2, y: G, z: -3, yaw: Math.PI }];

export interface SpotSpec { x: number; y: number; z: number; face: number }
const HP = Math.PI / 2;
export const BOX_SPOTS: SpotSpec[] = [
  { x: -2, y: P, z: 8, face: Math.PI }, // baradari (start)
  { x: 6, y: P, z: -38.6, face: 0 }, // Diwan-e-Aam hall, beside the jharokha
  { x: 22, y: B, z: -45.2, face: 0 }, // Toshakhana vault
  { x: 62.5, y: G, z: 11.2, face: Math.PI }, // chowk
  { x: 48, y: R, z: 31.2, face: Math.PI }, // Kothay (H3 roof)
];
export const PERK_SPOTS = {
  lifeline: { x: -17.25, y: G, z: 2, face: HP },
  quickhands: { x: 13.45, y: G, z: -14, face: -HP },
  bulwark: { x: 50, y: G, z: 0.42, face: Math.PI },
  hammerfall: { x: -20, y: U, z: -68.9, face: 0 },
};
export const PAP_SPOT: SpotSpec = { x: -43.2, y: G, z: -18, face: HP };
export const POWER_SPOT: SpotSpec = { x: 73, y: P, z: -3, face: Math.PI };
export const WALL_BUY_SPOTS: { key: string; x: number; y: number; z: number; face: number }[] = [
  { key: 'pi_magnus', x: -2.5, y: G, z: 19.83, face: Math.PI },
  { key: 'smg_wren', x: 13.83, y: G, z: 3, face: -HP },
  { key: 'sg_hullbreaker', x: -36, y: G, z: 19.83, face: Math.PI },
  { key: 'ar_kestrel', x: -51.83, y: G, z: 8, face: HP },
  { key: 'ar_corvid', x: -12, y: P, z: -39.83, face: 0 },
  { key: 'smg_skiff', x: 17, y: G, z: -23.83, face: 0 },
  { key: 'dmr_sentry', x: -30, y: U, z: -40.17, face: Math.PI },
  { key: 'smg_skiff', x: -52.17, y: U, z: -30, face: -HP },
  { key: 'smg_wren', x: 24, y: G, z: 8.17, face: 0 },
  { key: 'ar_corvid', x: 45.5, y: G, z: 0.83, face: Math.PI },
  { key: 'sg_hullbreaker', x: 70, y: G, z: -23.83, face: 0 },
  { key: 'pi_magnus', x: 44, y: G, z: 6.17, face: 0 },
  { key: 'ar_kestrel', x: 66.17, y: G, z: -2, face: HP },
  { key: 'smg_skiff', x: 36, y: B, z: -31.17, face: Math.PI },
];

/** Easter egg objects ("The Mountain of Light"). */
export const EGG = {
  mirrors: [{ x: -33.6, y: U + 1.5, z: -66 }, { x: -6.4, y: U + 1.5, z: -62 }, { x: -28, y: U + 1.5, z: -69.6 }],
  keys: [{ x: 40, y: B + 0.35, z: -44.5 }, { x: 40.5, y: R + 0.35, z: 29.5 }, { x: 39, y: U + 0.35, z: -19 }],
  pedestal: { x: 18, y: B, z: -44.4 },
};
