// "Nightfall Relay" — the first purpose-built Zombies map. Pure layout data (no three.js), shared by the
// geometry builder (ZombiesMap) and the rules/tests. North is -Z. Floors are y=0 except the Power Room (2.4).
import type { WeaponId } from '../config';
import type { PerkId, WallBuyKey } from './rules';
import type { MapTopology } from './zones';

export interface P2 { x: number; z: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export const WALL_H = 5.4;
export const POWER_FLOOR = 2.4;

export const ZONES = {
  lobby: 0, dock: 1, hall: 2, power: 3, vault: 4,
} as const;

export const ROOMS: { zone: number; name: string; rect: Rect; floor: number }[] = [
  { zone: ZONES.lobby, name: 'CHECKPOINT LOBBY', rect: { x0: -7, z0: 4, x1: 7, z1: 18 }, floor: 0 },
  { zone: ZONES.dock, name: 'LOADING DOCK', rect: { x0: -12, z0: -14, x1: 12, z1: 4 }, floor: 0 },
  { zone: ZONES.hall, name: 'GENERATOR HALL', rect: { x0: 7, z0: 4, x1: 24, z1: 18 }, floor: 0 },
  { zone: ZONES.power, name: 'POWER ROOM', rect: { x0: 12, z0: -14, x1: 24, z1: 4 }, floor: POWER_FLOOR },
  { zone: ZONES.vault, name: 'REFORGE VAULT', rect: { x0: -22, z0: 4, x1: -7, z1: 18 }, floor: 0 },
];

/** Door / debris openings. `span` is along the wall axis; `axis` 'x' means the wall runs along X at z=`at`. */
export interface DoorGeom { id: string; axis: 'x' | 'z'; at: number; a0: number; a1: number; y0: number; y1: number; debris: boolean }
export const DOOR_GEOM: DoorGeom[] = [
  { id: 'lobby_dock', axis: 'x', at: 4, a0: -1.6, a1: 1.6, y0: 0, y1: 3.0, debris: false },
  { id: 'lobby_hall', axis: 'z', at: 7, a0: 10, a1: 13.2, y0: 0, y1: 3.0, debris: true },
  { id: 'dock_hall', axis: 'x', at: 4, a0: 8.4, a1: 10.8, y0: 0, y1: 3.0, debris: false },
  { id: 'dock_vault', axis: 'x', at: 4, a0: -10.6, a1: -8.4, y0: 0, y1: 3.0, debris: false },
  { id: 'hall_power', axis: 'x', at: 4, a0: 20.6, a1: 23.4, y0: POWER_FLOOR, y1: POWER_FLOOR + 2.4, debris: true },
];

export const TOPOLOGY: MapTopology = {
  startZone: ZONES.lobby,
  zones: ROOMS.map((r) => ({ id: r.zone, name: r.name })),
  doors: [
    { id: 'lobby_dock', cost: 750, a: ZONES.lobby, b: ZONES.dock, label: 'Open Door' },
    { id: 'lobby_hall', cost: 1000, a: ZONES.lobby, b: ZONES.hall, label: 'Clear Debris', debris: true },
    { id: 'dock_hall', cost: 1250, a: ZONES.dock, b: ZONES.hall, label: 'Open Door' },
    { id: 'dock_vault', cost: 1250, a: ZONES.dock, b: ZONES.vault, label: 'Open Door' },
    { id: 'hall_power', cost: 1500, a: ZONES.hall, b: ZONES.power, label: 'Clear Debris', debris: true },
  ],
  windows: [],
};

/** Barricaded windows. `n` = outward normal (unit, axis aligned). Elevated windows sit on the Power Room floor. */
export interface WindowGeom { id: number; zone: number; x: number; z: number; nx: number; nz: number; floor: number }
export const WINDOWS: WindowGeom[] = [
  { id: 0, zone: ZONES.lobby, x: -3.6, z: 18, nx: 0, nz: 1, floor: 0 },
  { id: 1, zone: ZONES.lobby, x: 3.6, z: 18, nx: 0, nz: 1, floor: 0 },
  { id: 2, zone: ZONES.dock, x: -6, z: -14, nx: 0, nz: -1, floor: 0 },
  { id: 3, zone: ZONES.dock, x: 6, z: -14, nx: 0, nz: -1, floor: 0 },
  { id: 4, zone: ZONES.dock, x: -12, z: -7, nx: -1, nz: 0, floor: 0 },
  { id: 5, zone: ZONES.hall, x: 24, z: 11, nx: 1, nz: 0, floor: 0 },
  { id: 6, zone: ZONES.hall, x: 15.5, z: 18, nx: 0, nz: 1, floor: 0 },
  { id: 7, zone: ZONES.vault, x: -22, z: 11, nx: -1, nz: 0, floor: 0 },
  { id: 8, zone: ZONES.vault, x: -14.5, z: 18, nx: 0, nz: 1, floor: 0 },
  { id: 9, zone: ZONES.power, x: 18, z: -14, nx: 0, nz: -1, floor: POWER_FLOOR },
];
TOPOLOGY.windows = WINDOWS.map((w) => ({ id: w.id, zone: w.zone }));

/** Where things stand; `face` is the yaw the front faces (0 = +Z/south, PI = -Z/north). */
export interface Spot extends P2 { face: number; y?: number }
export const PLAYER_SPAWN = { x: 0, z: 13, yaw: 0 };
export const BOX_SPOTS: Spot[] = [
  { x: -6.35, z: 8, face: Math.PI / 2 },
  { x: 0, z: -13.35, face: 0 },
  { x: 23.35, z: 16, face: -Math.PI / 2 },
  { x: -21.35, z: 6.5, face: Math.PI / 2 },
];
export const PERK_SPOTS: Record<PerkId, Spot> = {
  lifeline: { x: 6.3, z: 6, face: -Math.PI / 2 },
  bulwark: { x: -11.3, z: 0.5, face: Math.PI / 2 },
  quickhands: { x: 15.5, z: 4.75, face: 0 },
  hammerfall: { x: 15, z: -12.7, face: 0, y: POWER_FLOOR },
};
export const PAP_SPOT: Spot = { x: -19, z: 16.9, face: Math.PI };
export const POWER_SWITCH: Spot = { x: 20.5, z: -13.6, face: 0, y: POWER_FLOOR };

/** Chalk wall-buys: position is on the wall face; `face` is the direction the chalk faces. */
export const WALL_BUY_SPOTS: { key: WallBuyKey; x: number; z: number; face: number; y?: number }[] = [
  { key: 'smg_wren', x: -6.83, z: 13, face: Math.PI / 2 },
  { key: 'pi_magnus', x: -4.5, z: 4.17, face: 0 },
  { key: 'sg_hullbreaker', x: -11.83, z: -2.5, face: Math.PI / 2 },
  { key: 'ar_kestrel', x: 11.83, z: -7, face: -Math.PI / 2 },
  { key: 'smg_skiff', x: 23.83, z: 15.5, face: -Math.PI / 2 },
  { key: 'ar_corvid', x: -21.83, z: 15, face: Math.PI / 2 },
  { key: 'dmr_sentry', x: 23.83, z: -4, face: -Math.PI / 2, y: POWER_FLOOR },
];

/** Hidden easter-egg relics ("signal fragments"). */
export const RELICS: (P2 & { y: number })[] = [
  { x: -11.4, z: -13.4, y: 0.35 },
  { x: 8.3, z: 17.3, y: 0.35 },
  { x: 23.4, z: -13.3, y: POWER_FLOOR + 0.35 },
];

/** Stairs from the Generator Hall up to the Power Room: steps rising toward -Z. */
export const STAIRS = { x0: 20.6, x1: 23.4, zTop: 4, steps: 7, depth: 1.03 };

export function zoneAt(x: number, z: number, y = 0): number {
  for (const r of ROOMS) {
    const { x0, z0, x1, z1 } = r.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && (r.floor === 0 || y >= r.floor - 0.6)) return r.zone;
  }
  return -1;
}

export const START_WEAPON: WeaponId = 'pi_warden';
