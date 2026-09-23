// Compatibility view of "Nightfall Relay" in the pre-multi-map constant shape. New code should use the
// map definition (./maps/nightfall/def) through the registry (./maps) instead of these constants.
import type { WeaponId } from '../config';
import { NIGHTFALL, Z } from './maps/nightfall/def';
import { perkEntries, topologyOf, zoneAt as defZoneAt, type Spot as DefSpot, type WindowDef } from './mapdef';
import type { PerkId } from './rules';
import type { MapTopology } from './zones';

export type { P2, Rect, Spot } from './mapdef';

const D = NIGHTFALL;
export const WALL_H = D.wallHeight;
export const POWER_FLOOR = D.rooms.find((r) => r.zone === Z.power)!.floor;
export const ZONES = Z;
export const ROOMS = D.rooms.map((r) => ({ zone: r.zone, name: r.name ?? '', rect: r.rect, floor: r.floor }));

export interface DoorGeom { id: string; axis: 'x' | 'z'; at: number; a0: number; a1: number; y0: number; y1: number; debris: boolean }
export const DOOR_GEOM: DoorGeom[] = D.doors.map((d) => ({ id: d.id, axis: d.axis, at: d.at, a0: d.a0, a1: d.a1, y0: d.y0, y1: d.y1, debris: d.kind === 'debris' }));
export const TOPOLOGY: MapTopology = topologyOf(D);
export type WindowGeom = WindowDef;
export const WINDOWS: WindowGeom[] = D.windows;
export const PLAYER_SPAWN = { x: D.playerSpawn.x, z: D.playerSpawn.z, yaw: D.playerSpawn.yaw };
export const BOX_SPOTS: DefSpot[] = D.box.spots;
export const PERK_SPOTS = Object.fromEntries(perkEntries(D)) as Record<PerkId, DefSpot>;
export const PAP_SPOT: DefSpot = D.pap!;
export const POWER_SWITCH: DefSpot = D.power!;
export const WALL_BUY_SPOTS = D.wallBuys;
const eggStep = D.egg!.steps[0];
export const RELICS = eggStep.kind === 'kill' ? [] : eggStep.objects.map((o) => ({ x: o.x, z: o.z, y: o.y }));
export const STAIRS = { x0: 20.6, x1: 23.4, zTop: 4, steps: 7, depth: 1.03 };
export function zoneAt(x: number, z: number, y = 0): number { return defZoneAt(D, x, z, y); }
export const START_WEAPON: WeaponId = D.startWeapon ?? 'pi_warden';
