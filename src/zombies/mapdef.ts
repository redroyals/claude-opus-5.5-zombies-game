// Data-driven Zombies map definition. A map is a plain object (no three.js, no DOM) that the geometry
// builder (ZombiesMap), the runtime (ZombiesMode), the validator and the tests all read. See docs/MAP_API.md.
//
// Conventions: metres, +Y up, north is -Z. The implicit ground plane is y = 0 (nothing can go below it),
// so "underground" levels are built by raising the street. Yaw 0 faces +Z (south), PI faces -Z.
import type { WeaponId } from '../config';
import type { Surface } from '../world/Collision';
import type { PowerUpKind } from './powerups';
import type { PerkId, WallBuyKey } from './rules';
import type { MapTopology } from './zones';

export interface P2 { x: number; z: number }
export interface P3 { x: number; y: number; z: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }
export type Axis = 'x' | 'z';
export type Dir4 = '+x' | '-x' | '+z' | '-z';

/** Shared materials from src/render/materials.ts, plus `glassPane` (thin transparent glazing). */
export const MATERIAL_NAMES = [
  'asphalt', 'concrete', 'concreteDark', 'sidewalk', 'brick', 'brickDark', 'plaster', 'plasterBlue', 'corrugated',
  'corrugatedGreen', 'metal', 'metalDark', 'steel', 'rust', 'dirt', 'wood', 'olive', 'oliveDark', 'tarp', 'sandbag',
  'rubber', 'glass', 'windowFacade', 'windowLit', 'hazardYellow', 'hazardStripe', 'white', 'red', 'fence', 'burnt',
  'container0', 'container1', 'container2', 'container3', 'container4', 'container5', 'glassPane',
] as const;
export type MatName = (typeof MATERIAL_NAMES)[number];
/** Tileable procedural texture sets usable by inline materials. */
export type TexName = 'concrete' | 'brick' | 'plaster' | 'wood' | 'metalPanel' | 'corrugated' | 'dirt' | 'asphalt' | 'sidewalk';
/** Inline PBR material (cached by value). */
export interface MatSpec {
  color: number; roughness?: number; metalness?: number; texture?: TexName;
  emissive?: number; emissiveIntensity?: number; opacity?: number; doubleSided?: boolean;
}
export type MatRef = MatName | MatSpec;

/**
 * How a piece of geometry collides.
 * - `solid`: blocks movement, bullets and sight (walls, crates).
 * - `floor`: solid whose top is walkable floor for the nav grid (slabs, stairs, platforms).
 * - `nonsolid`: blocks movement but not bullets/sight (glass rails, chain-link, barricade frames).
 * - `none`: visual only.
 */
export type Collide = 'solid' | 'floor' | 'nonsolid' | 'none';

/** Axis-aligned box: [x0, y0, z0, x1, y1, z1]. */
export type BoxTuple = [number, number, number, number, number, number];
export interface BoxDef { box: BoxTuple; mat?: MatRef; tile?: number; collide?: Collide; surface?: Surface; shadow?: boolean }
/** Horizontal quad (visual floor/decal plane, no collider). */
export interface QuadDef { rect: Rect; y: number; mat: MatRef; tile?: number }
/** Vertical cylinder (drums, pillars). Collider is its bounding box. */
export interface CylDef { x: number; y?: number; z: number; r: number; h: number; mat: MatRef; collide?: Collide; surface?: Surface; segments?: number }

/** A zone is the unit of the progressive unlock graph. Rooms belong to zones. */
export interface ZoneMeta { id: number; name: string }

/**
 * A room volume. Rooms give zones their shape (zoneAt), and are built with a floor, an optional ceiling
 * and optional beams/skirting. Rooms may stack (a second storey sits on `support: 'slab'`).
 */
export interface RoomDef {
  zone: number;
  name?: string;
  rect: Rect;
  /** Walkable floor height. */
  floor: number;
  /** Absolute y of the ceiling underside; `null` = open to the sky. Default: floor + map.wallHeight. */
  ceiling?: number | null;
  floorMat?: MatRef;
  ceilingMat?: MatRef;
  /** Ceiling beams every 4 m (default true when there is a ceiling). */
  beams?: MatRef | false;
  /** What holds a raised floor up: a solid block to the ground (default), a 0.3 m slab, or nothing (floor mesh only). */
  support?: 'plinth' | 'slab' | 'none';
  /** Low trims along the two X-running walls (default true). */
  skirting?: boolean;
}

/** An opening cut into a wall (archways, holes). Doors and windows cut their own openings automatically. */
export interface OpeningDef { a: number; b: number; y0: number; y1: number }
/**
 * A straight wall. `axis: 'x'` runs along X at z = `at` (from a0 to a1); `axis: 'z'` runs along Z at x = `at`.
 * Doors and windows lying on the wall line inside [a0, a1] and overlapping [y0, y1] are cut out automatically.
 */
export interface WallDef { axis: Axis; at: number; a0: number; a1: number; y0: number; y1: number; mat?: MatRef; thickness?: number; openings?: OpeningDef[]; collide?: Collide }

/** A purchasable door or debris pile linking zones `a` and `b` (the progressive unlock graph). */
export interface DoorDef {
  id: string;
  a: number;
  b: number;
  cost: number;
  kind: 'door' | 'debris';
  /** Prompt label (default 'Open Door' / 'Clear Debris'). */
  label?: string;
  /** Door is locked until the power is on. */
  requiresPower?: boolean;
  /** Placement: along the wall line (see WallDef). */
  axis: Axis; at: number; a0: number; a1: number; y0: number; y1: number;
  /** Optional GLB (path under /models) replacing the procedural door/debris. */
  model?: string;
}

/**
 * A barricaded window: zombies spawn outside, tear planks and climb in. `nx/nz` is the unit outward normal
 * (axis aligned). `floor` is the floor height inside. `pocket: true` (default) builds a small walled yard
 * outside so spawns are hidden; set false when the outside is real, enclosed map geometry.
 */
export interface WindowDef { id: number; zone: number; x: number; z: number; nx: number; nz: number; floor: number; pocket?: boolean }

/**
 * A non-window zombie spawn: `ground` (claws up out of the floor), `drop` (falls from above, e.g. a roof
 * edge or skylight) or `point` (appears in place, e.g. a dark alcove). Active once `zone` is unlocked.
 */
export interface SpawnPointDef { zone: number; x: number; y: number; z: number; kind: 'ground' | 'drop' | 'point'; weight?: number }

/** Straight stair flight over a footprint rect, ascending toward `dir` from y0 to y1. */
export interface StairDef { rect: Rect; dir: Dir4; y0: number; y1: number; steps?: number; mat?: MatRef; nosing?: MatRef | null; rail?: 'left' | 'right' | 'both' | null }
/** Straight ramp over a footprint rect, ascending toward `dir` (collision is fine 0.12 m steps). */
export interface RampDef { rect: Rect; dir: Dir4; y0: number; y1: number; mat?: MatRef }
/**
 * A ladder between a bottom stand point and a top landing. Players climb by walking into it; zombies
 * traverse it as a nav link. The ladder is drawn just in front of `bottom`, toward `top`.
 */
export interface LadderDef { bottom: P3; top: P3; mat?: MatRef }
/** An explicit one-way (or two-way) zombie nav link: drops off ledges, jumps across gaps, vaults. */
export interface NavLinkDef { from: P3; to: P3; kind: 'drop' | 'jump' | 'vault' | 'ladder'; twoWay?: boolean; cost?: number }

/** GLB kit/prop placement. The collider is authored in data (the model loads asynchronously). */
export interface PropDef {
  /** Path under /models, e.g. 'zombies/generator.glb'. */
  model: string;
  x: number; y?: number; z: number;
  yaw?: number;
  /** Uniform scale, or fit the model's height/width (metres). */
  scale?: number;
  fit?: { height?: number; width?: number };
  /** Local footprint (w along local X, d along local Z, h tall). Rotated to an AABB. Omit for no collider. */
  collider?: { w: number; d: number; h: number; collide?: Collide; surface?: Surface };
  /** Procedural stand-in shown until (or if never) the model loads. Default: a box of the collider size. */
  fallback?: MatRef | false;
}

export interface SignDef { lines: string[]; x: number; y: number; z: number; ry: number; w?: number; h?: number; bg?: string; fg?: string; border?: string }
export interface DecalDef { x: number; y?: number; z: number; size: number; kind?: 'blood' | 'grime'; rot?: number }

/** Where something stands; `face` is the yaw the front faces (0 = +Z, PI = -Z). */
export interface Spot { x: number; z: number; face: number; y?: number }
export interface WallBuySpot { key: WallBuyKey; x: number; z: number; face: number; y?: number }

export interface LightState { color: number; intensity: number; flicker?: 'none' | 'faulty' | 'buzz' }
/** A ceiling lamp that changes with the power. */
export interface LampDef { x: number; y: number; z: number; range?: number; decay?: number; pre: LightState; post: LightState; fixture?: 'pendant' | 'none' }
/** A constant point light (moonlight through a window, a fire). */
export interface PointLightDef { x: number; y: number; z: number; color: number; intensity: number; range: number; decay?: number }
export interface LightingDef {
  /** Sky: a flat colour (`background`) or a gradient dome. */
  background: number;
  sky?: { top: number; horizon: number; stars?: boolean; moon?: boolean };
  fogColor: number;
  fogDensity: number;
  hemi: number;
  sun: number;
  sunColor?: number;
  /** Direction the sun light comes FROM (normalised internally). */
  sunDir?: [number, number, number];
  /** Global light changes once the power is on. */
  postPower?: { hemi?: number; sun?: number; fogDensity?: number };
  lamps: LampDef[];
  lights?: PointLightDef[];
}

// ---- Easter egg: a generic step machine ------------------------------------------------------------
export interface EggObjectDef { x: number; y: number; z: number; model?: 'radio' | 'relic' | 'orb' | string; radius?: number }
export type EggStepDef =
  /** Interact (E) with every object, in any order unless `ordered`. */
  | { kind: 'interact'; objects: EggObjectDef[]; ordered?: boolean; prompt?: string; toast?: string; requiresPower?: boolean }
  /** Kill `count` zombies while they stand inside `zone`. */
  | { kind: 'kill'; zone: number; count: number; toast?: string; requiresPower?: boolean }
  /** Walk over every object to pick it up. */
  | { kind: 'collect'; objects: EggObjectDef[]; toast?: string; requiresPower?: boolean };
export interface EggReward {
  title: string; sub?: string;
  points?: number;
  /** Reforge the held weapon one tier for free. */
  reforge?: boolean;
  refillAmmo?: boolean;
  /** Drop a power-up at the player spawn. */
  powerup?: PowerUpKind;
}
export interface EggDef { name: string; steps: EggStepDef[]; reward: EggReward }

export interface PowerUpRules {
  /** Kinds that never drop on this map. */
  exclude?: PowerUpKind[];
  maxPerRound?: number;
  dropChanceMult?: number;
}

export interface ZombiesMapDef {
  id: string;
  name: string;
  blurb: string;
  /** Image under /public (e.g. '/maps/nightfall.jpg'); the menu shows a generated card when absent. */
  thumbnail?: string;
  /** Collision/nav extent. Everything must sit inside it. */
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  /** Default ceiling height above a room floor. */
  wallHeight: number;
  zones: ZoneMeta[];
  startZone: number;
  rooms: RoomDef[];
  walls: WallDef[];
  boxes?: BoxDef[];
  quads?: QuadDef[];
  cylinders?: CylDef[];
  props?: PropDef[];
  signs?: SignDef[];
  decals?: DecalDef[];
  /** Outdoor ground plane (visual). */
  ground?: { mat: MatRef; tile?: number } | null;
  stairs?: StairDef[];
  ramps?: RampDef[];
  ladders?: LadderDef[];
  links?: NavLinkDef[];
  doors: DoorDef[];
  windows: WindowDef[];
  spawnPoints?: SpawnPointDef[];
  playerSpawn: { x: number; y?: number; z: number; yaw: number };
  /** Extra co-op spawns (players 2-4). */
  coopSpawns?: { x: number; y?: number; z: number; yaw: number }[];
  box: { spots: Spot[]; start?: number };
  perks: Partial<Record<PerkId, Spot>>;
  pap: Spot | null;
  /** Null = the power is on from the start. */
  power: Spot | null;
  wallBuys: WallBuySpot[];
  startWeapon?: WeaponId;
  powerups?: PowerUpRules;
  egg?: EggDef;
  lighting: LightingDef;
  audio?: { ambience?: string };
  /** HUD/flavour strings. */
  flavor?: { powerHint?: string; bossTitle?: string; gameOverSub?: string };
  /** Model paths (under /models) to preload when the map is selected. */
  assets?: string[];
}

// ------------------------------------------------------------------------------------------------------
// Pure helpers over a def
// ------------------------------------------------------------------------------------------------------
export function roomCeiling(def: ZombiesMapDef, r: RoomDef): number | null {
  return r.ceiling === undefined ? r.floor + def.wallHeight : r.ceiling;
}

/** Zone containing a point, or -1. With stacked rooms the highest floor at or below the feet wins. */
export function zoneAt(def: ZombiesMapDef, x: number, z: number, y = 0): number {
  let best = -1, bestFloor = -Infinity;
  for (const r of def.rooms) {
    const { x0, z0, x1, z1 } = r.rect;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    if (r.floor > 0 && y < r.floor - 0.6) continue;
    const c = roomCeiling(def, r);
    if (c !== null && y > c + 0.2) continue;
    if (r.floor > bestFloor) { bestFloor = r.floor; best = r.zone; }
  }
  return best;
}

export function zoneName(def: ZombiesMapDef, zone: number): string {
  return def.zones.find((z) => z.id === zone)?.name ?? '';
}

/** Door topology for the pure unlock rules (./zones). */
export function topologyOf(def: ZombiesMapDef): MapTopology {
  return {
    startZone: def.startZone,
    zones: def.zones.map((z) => ({ id: z.id, name: z.name })),
    doors: def.doors.map((d) => ({ id: d.id, cost: d.cost, a: d.a, b: d.b, label: doorLabel(d), debris: d.kind === 'debris', requiresPower: d.requiresPower })),
    windows: def.windows.map((w) => ({ id: w.id, zone: w.zone })),
  };
}

export function doorLabel(d: DoorDef): string {
  return d.label ?? (d.kind === 'debris' ? 'Clear Debris' : 'Open Door');
}

/** Door midpoint on its wall line. */
export function doorCenter(d: DoorDef): P3 {
  const mid = (d.a0 + d.a1) / 2;
  return d.axis === 'x' ? { x: mid, y: d.y0, z: d.at } : { x: d.at, y: d.y0, z: mid };
}

/** Unit vector for a Dir4. */
export function dirVec(d: Dir4): P2 {
  return d === '+x' ? { x: 1, z: 0 } : d === '-x' ? { x: -1, z: 0 } : d === '+z' ? { x: 0, z: 1 } : { x: 0, z: -1 };
}

/** The point a player stands on to use something at `s` (1 m in front of its face). */
export function frontOf(s: Spot, dist = 1.0): P3 {
  return { x: s.x + Math.sin(s.face) * dist, y: s.y ?? 0, z: s.z + Math.cos(s.face) * dist };
}

export const PERK_ORDER: PerkId[] = ['lifeline', 'bulwark', 'quickhands', 'hammerfall'];
export function perkEntries(def: ZombiesMapDef): [PerkId, Spot][] {
  return PERK_ORDER.filter((id) => def.perks[id]).map((id) => [id, def.perks[id]!]);
}
