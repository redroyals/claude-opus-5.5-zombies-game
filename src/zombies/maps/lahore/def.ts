// "Lahore Darbar" as a ZombiesMapDef (see docs/MAP_API.md and docs/maps/lahore-darbar.md).
// Geometry comes from the rasterised layout (./raster); props, lights and FX are added by ./decorate.
import type { BoxDef, DoorDef, LadderDef, MatSpec, NavLinkDef, RoomDef, StairDef, WallBuySpot, WallDef, WindowDef, ZombiesMapDef } from '../../mapdef';
import type { WallBuyKey } from '../../rules';
import {
  AREAS, B, BOX_SPOTS, COOP_SPAWNS, DOORS, DOOR_H, EGG, G, LADDERS, PAP_SPOT, PERK_SPOTS, PLAYER_SPAWN, POWER_SPOT, SPAWN_POINTS, U, WALL_BUY_SPOTS, WINDOWS,
  ZONE_NAMES, Z, type Surf,
} from './layout';
import { GRID, rasterize } from './raster';

/** Fallback colours per surface (used by the validator/minimap and if the custom library is absent). */
const FALLBACK: Record<Surf, number> = {
  marble: 0xe8e2d6, inlay: 0xe0d8c8, sandstone: 0xb4553a, brick: 0xa45a40, plaster: 0xdcd4c0, plasterOchre: 0xd9b478, plasterBlue: 0x6c86a8,
  garden: 0x4e6a34, paving: 0xb87052, cobble: 0x8a5a44, dirt: 0x7a6448, wood: 0x5a3a22, mirror: 0xd8e2ea, stoneDark: 0x5a5450, terrace: 0xc8b490,
};
export const surfMat = (s: Surf): MatSpec => ({ color: FALLBACK[s], roughness: 0.85, custom: `lh:${s}` });

const R = rasterize();
export const LAHORE_RASTER = R;

const rooms: RoomDef[] = R.rooms.map((rm) => ({
  zone: rm.area.zone,
  name: ZONE_NAMES[rm.area.zone],
  rect: { x0: rm.x0, z0: rm.z0, x1: rm.x1, z1: rm.z1 },
  floor: rm.area.stair ? rm.area.stair.y0 : rm.area.floor,
  ceiling: null,
  floorMat: surfMat(rm.area.floorSurf),
  beams: false,
  support: 'none',
  skirting: false,
}));

const walls: WallDef[] = [];
const boxes: BoxDef[] = [];
for (const w of R.walls) {
  if (w.kind === 'invisible' || w.kind === 'jaali') {
    const t = w.kind === 'jaali' ? 0.12 : 0.1;
    boxes.push({ box: w.axis === 'x' ? [w.a0, w.y0, w.at - t, w.a1, w.y1, w.at + t] : [w.at - t, w.y0, w.a0, w.at + t, w.y1, w.a1], mat: null, collide: 'nonsolid', surface: 'wood', shadow: false });
    continue;
  }
  const thick = w.kind === 'wall' ? 0.3 : w.kind === 'parapet' ? 0.45 : 0.25;
  const mat = w.kind === 'rail' || w.kind === 'low' ? surfMat(w.surf === 'wood' || w.surf.startsWith('plaster') ? 'wood' : 'marble') : surfMat(w.surf);
  walls.push({ axis: w.axis, at: w.at, a0: w.a0, a1: w.a1, y0: w.y0, y1: w.y1, mat, thickness: thick });
}
for (const m of R.masses) {
  boxes.push({ box: [m.x0, m.y0, m.z0, m.x1, m.y1, m.z1], mat: surfMat(m.surf), collide: m.floor ? 'floor' : 'solid', tile: 2, surface: 'concrete' });
}

const stairs: StairDef[] = AREAS.filter((a) => a.stair).map((a) => {
  const [x0, z0, x1, z1] = a.rects[0];
  const s = a.stair!;
  const run = s.dir === '+x' || s.dir === '-x' ? x1 - x0 : z1 - z0;
  const rise = s.y1 - s.y0;
  return { rect: { x0, z0, x1, z1 }, dir: s.dir, y0: s.y0, y1: s.y1, steps: Math.max(Math.ceil(rise / 0.45), Math.min(run, Math.round(rise / 0.3))), mat: surfMat(a.floorSurf), nosing: null, rail: null };
});

const links: NavLinkDef[] = R.links.map((l) => ({ from: { x: l.from[0], y: l.from[1], z: l.from[2] }, to: { x: l.to[0], y: l.to[1], z: l.to[2] }, kind: l.kind, twoWay: l.twoWay }));
const ladders: LadderDef[] = LADDERS.map((l) => ({ bottom: { x: l.bottom[0], y: l.bottom[1], z: l.bottom[2] }, top: { x: l.top[0], y: l.top[1], z: l.top[2] } }));

const doors: DoorDef[] = DOORS.map((d) => ({
  id: d.id, a: d.a, b: d.b, cost: d.cost, kind: d.kind, label: d.label, axis: d.axis, at: d.at, a0: d.a0, a1: d.a1, y0: d.y0, y1: d.y0 + DOOR_H,
  ...(d.kind === 'door' ? { model: 'lahore/haveli_door.glb' } : {}),
}));
const windows: WindowDef[] = WINDOWS.map((w, id) => ({ id, zone: w.zone, x: w.x, z: w.z, nx: w.nx, nz: w.nz, floor: w.floor }));

// ---- Pacing (gameplay data layered over the layout; the layout's spots stay untouched) -----------------
const HP = Math.PI / 2;
/** Wall-buy re-tiering by index into WALL_BUY_SPOTS: the heavy guns hang deep in the map. */
const WALL_RETIER: Record<number, WallBuyKey> = { 7: 'lmg_bastion', 11: 'ar_moraine' };
/** Extra wall-buys: the starter bolt-action in the Hazuri Bagh. */
const WALL_EXTRA: WallBuySpot[] = [{ key: 'br_drover', x: 13.98, y: G, z: 18, face: -HP }];

export const LAHORE: ZombiesMapDef = {
  id: 'lahore-darbar',
  name: 'Lahore Darbar',
  blurb: 'Dusk over the court of the Sikh Empire. Fight from the Hazuri Bagh through Lahore Fort, then into the haveli maze of the walled city.',
  bounds: { minX: GRID.minX, minZ: GRID.minZ, maxX: GRID.maxX, maxZ: GRID.maxZ },
  wallHeight: 6,
  zones: Object.entries(ZONE_NAMES).map(([id, name]) => ({ id: +id, name })),
  startZone: Z.bagh,
  rooms,
  walls,
  boxes,
  stairs,
  ladders,
  links,
  doors,
  windows,
  spawnPoints: SPAWN_POINTS.map((s) => ({ ...s })),
  ground: { mat: surfMat('dirt'), tile: 6 },
  playerSpawn: { ...PLAYER_SPAWN },
  coopSpawns: COOP_SPAWNS.map((s) => ({ ...s })),
  // The Cache is not in the baradari at the start: it surfaces beside the jharokha in the Diwan-e-Aam once two gates are
  // open (round 5 at the latest).
  box: { spots: BOX_SPOTS.map((s) => ({ ...s })), start: 0, reveal: { doors: 2, round: 5, spot: 1 } },
  perks: {
    lifeline: { ...PERK_SPOTS.lifeline }, quickhands: { ...PERK_SPOTS.quickhands },
    bulwark: { ...PERK_SPOTS.bulwark }, hammerfall: { ...PERK_SPOTS.hammerfall },
    nova: { x: -42.5, y: G, z: -5, face: 0 },
    strider: { x: -53, y: U, z: 19.5, face: Math.PI },
    hawkeye: { x: -0.5, y: U, z: -44, face: -HP },
  },
  pap: { ...PAP_SPOT },
  power: { ...POWER_SPOT },
  wallBuys: [...WALL_BUY_SPOTS.map((w, i) => ({ ...w, key: WALL_RETIER[i] ?? (w.key as WallBuyKey) })), ...WALL_EXTRA],
  startWeapon: 'pi_warden',
  egg: {
    name: 'The Mountain of Light',
    steps: [
      { kind: 'interact', objects: EGG.mirrors.map((m) => ({ ...m, model: 'orb' })), requiresPower: true, prompt: 'Polish the mirror', toast: 'The mirrors remember a jewel' },
      { kind: 'collect', objects: EGG.keys.map((k) => ({ ...k, model: 'relic' })), toast: 'The treasurer left three keys in the walled city' },
      { kind: 'kill', zone: Z.naqqar, count: 24, toast: 'Wake the drums: feed the Naqqar Khana' },
      { kind: 'interact', objects: [{ ...EGG.pedestal, y: EGG.pedestal.y + 1.2, model: 'orb' }], prompt: 'Set the keys at the pedestal', toast: 'The vault answers. Hold the Toshakhana' },
      { kind: 'kill', zone: Z.tosha, count: 30, toast: 'Defend the Toshakhana' },
    ],
    reward: {
      title: 'THE MOUNTAIN OF LIGHT', sub: 'Reclaimed from the dead · every perk · +1 perk slot · the forge answers',
      points: 5000, reforge: true, refillAmmo: true, allPerks: true, powerup: 'max_ammo', perkSlot: 1,
    },
  },
  // Side quest: three brass lamps left burning in the walled city and under it.
  sideEggs: [{
    name: 'The Lamplighter',
    steps: [{
      kind: 'collect', toast: 'A BRASS LAMP, STILL WARM',
      objects: [
        { x: 4.5, y: G + 0.6, z: 1.5, model: 'relic' },
        { x: 61.5, y: G + 0.6, z: 26.5, model: 'relic' },
        { x: 45.5, y: B + 0.6, z: -31.5, model: 'relic' },
      ],
    }],
    reward: { title: 'THE LAMPLIGHTER', sub: 'The court remembers a song · a free Hawkeye Draught', music: 'lahore', perk: 'hawkeye', points: 500 },
  }],
  // Buildable: the naft cauldron, pieced together from the gun park, the armoury and the Roshnai Gate, arms the fire
  // trap in front of the Diwan-e-Aam steps.
  buildables: [{
    id: 'naft_cauldron', name: 'Naft Cauldron',
    bench: { x: -12, y: G, z: -29.5, face: 0 },
    parts: [
      { name: 'Bronze bowl', x: -30.5, y: G + 0.9, z: 7.5, model: 'plate' },
      { name: 'Bellows', x: -20, y: G + 0.9, z: -16.5, model: 'gear' },
      { name: 'Jar of naft', x: 34.5, y: G + 0.9, z: 14, model: 'orb' },
    ],
    result: { kind: 'trap', trap: 'aam_fire' },
  }],
  traps: [{
    id: 'aam_fire', name: 'Naft Fire Pit', kind: 'fire', requiresBuild: 'naft_cauldron', cost: 1000, seconds: 20, cooldown: 45,
    switch: { x: -8, y: G, z: -29.5, face: 0 },
    area: { x0: -6, z0: -24, x1: 2, z1: -13, y: G },
  }],
  rounds: { special: { first: [6, 7], every: [5, 6] }, bossEvery: 8 },
  powerups: { maxPerRound: 4, dropChanceMult: 1.15 },
  lighting: {
    background: 0x1a1830,
    sky: { top: 0x121634, horizon: 0x9a5038, stars: true },
    fogColor: 0x2c2334,
    fogDensity: 0.014,
    hemi: 0.95,
    sun: 1.1,
    sunColor: 0xff9a5a,
    sunDir: [-0.85, 0.28, 0.25],
    postPower: { hemi: 1.0, sun: 1.0, fogDensity: 0.012 },
    lamps: [],
  },
  audio: { ambience: 'lahore' },
  flavor: {
    powerHint: 'The naqqara drums wait in the Naqqar Khana haveli',
    powerPrompt: 'Beat the naqqara drums',
    powerOnHint: "The court is lit · the armourer's forge is hot",
    bossTitle: 'THE WARDEN · BREAKER OF GATES',
    gameOverSub: 'LAHORE DARBAR · THE LAMPS GO OUT',
  },
  machines: {
    box: 'lahore/box_casket.glb', pap: 'lahore/forge_pap.glb', power: 'lahore/naqqara.glb',
    perks: { bulwark: 'lahore/perk_bulwark_lh.glb', quickhands: 'lahore/perk_quickhands_lh.glb', hammerfall: 'lahore/perk_hammerfall_lh.glb', lifeline: 'lahore/perk_lifeline_lh.glb' },
  },
  assets: ['lahore/haveli_door.glb', 'lahore/box_casket.glb'],
};
