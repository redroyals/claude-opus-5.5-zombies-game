// "Nightfall Relay" — the first purpose-built Zombies map, as a data definition (see docs/MAP_API.md).
// Five zones behind doors/debris, a raised Power Room reached by stairs with an overlook onto the dock.
import type { BoxDef, CylDef, DecalDef, LampDef, PointLightDef, SignDef, WindowDef, ZombiesMapDef } from '../../mapdef';

const H = 5.4; // wall/ceiling height
const PF = 2.4; // Power Room floor

export const Z = { lobby: 0, dock: 1, hall: 2, power: 3, vault: 4 } as const;

const WINDOWS: WindowDef[] = [
  { id: 0, zone: Z.lobby, x: -3.6, z: 18, nx: 0, nz: 1, floor: 0 },
  { id: 1, zone: Z.lobby, x: 3.6, z: 18, nx: 0, nz: 1, floor: 0 },
  { id: 2, zone: Z.dock, x: -6, z: -14, nx: 0, nz: -1, floor: 0 },
  { id: 3, zone: Z.dock, x: 6, z: -14, nx: 0, nz: -1, floor: 0 },
  { id: 4, zone: Z.dock, x: -12, z: -7, nx: -1, nz: 0, floor: 0 },
  { id: 5, zone: Z.hall, x: 24, z: 11, nx: 1, nz: 0, floor: 0 },
  { id: 6, zone: Z.hall, x: 15.5, z: 18, nx: 0, nz: 1, floor: 0 },
  { id: 7, zone: Z.vault, x: -22, z: 11, nx: -1, nz: 0, floor: 0 },
  { id: 8, zone: Z.vault, x: -14.5, z: 18, nx: 0, nz: 1, floor: 0 },
  { id: 9, zone: Z.power, x: 18, z: -14, nx: 0, nz: -1, floor: PF },
];

// ---- Dressing ------------------------------------------------------------------------------------
const crate = (x: number, z: number, s = 1, y = 0): BoxDef => ({ box: [x - 0.5 * s, y, z - 0.5 * s, x + 0.5 * s, y + s, z + 0.5 * s], mat: 'wood', tile: 1, surface: 'wood' });
const vis = (box: BoxDef['box'], mat: BoxDef['mat'], tile = 1): BoxDef => ({ box, mat, tile, collide: 'none' });
const BOXES: BoxDef[] = [
  // Dock / Power Room overlook: plinth face rail, glazing, mullions
  { box: [12 - 0.15, PF, -14, 12 + 0.15, PF + 1.0, 4], mat: 'metalDark', tile: 2, surface: 'metal' },
  { box: [11.9, PF + 1.0, -14, 12.1, PF + 3.2, 4], mat: 'glassPane', collide: 'nonsolid', surface: 'glass', shadow: false },
  ...Array.from({ length: 8 }, (_, i): BoxDef => { const z = -13 + i * 2.2; return vis([11.9, PF + 1.0, z - 0.05, 12.1, PF + 3.2, z + 0.05], 'steel'); }),
  // Dock: crates, loading platform
  crate(-8, -5), crate(-8, -3.9, 0.9), crate(-7.95, -4.5, 0.7, 1), crate(7.5, -2.5), crate(8.6, -2.3, 0.8),
  { box: [-3, 0, -6, 3, 1.1, -3.8], mat: 'container1', tile: 2, surface: 'metal' },
  vis([-3, 1.1, -6, 3, 1.15, -3.8], 'hazardYellow'),
  // Hall: two dead generators
  ...[11, 17].flatMap((x): BoxDef[] => [
    { box: [x - 1.3, 0, 14.5 - 0.9, x + 1.3, 1.7, 14.5 + 0.9], mat: 'olive', tile: 2, surface: 'metal' },
    vis([x - 1.35, 1.7, 14.5 - 0.6, x + 1.35, 1.9, 14.5 + 0.6], 'metalDark'),
  ]),
  // Lobby: checkpoint desk and sandbags
  { box: [-2.5, 0, 7.5, 2.5, 1.05, 8.3], mat: 'metalDark', tile: 1, surface: 'metal' },
  vis([-2.6, 1.05, 7.4, 2.6, 1.1, 8.4], 'steel'),
  ...Array.from({ length: 4 }, (_, i): BoxDef => ({ box: [-6.6 + i * 0.7, 0, 16.6, -6 + i * 0.7, 0.5, 17.4], mat: 'sandbag', tile: 1, surface: 'dirt' })),
  // Vault: door frame + shelving
  vis([-21.8, 0, 12.5, -21.5, 3.2, 13.5], 'steel'),
  ...[5.5, 7.5].map((z): BoxDef => ({ box: [-16, 0, z - 0.3, -12, 2.2, z + 0.3], mat: 'metal', tile: 1, surface: 'metal' })),
  // Power room: transformer banks with warning stripes
  ...[15, 17.5].flatMap((x): BoxDef[] => [
    { box: [x - 0.9, PF, -3.5, x + 0.9, PF + 2.0, -1.5], mat: 'metalDark', tile: 1, surface: 'metal' },
    vis([x - 0.92, PF + 1.2, -3.52, x + 0.92, PF + 1.4, -1.48], 'hazardYellow'),
  ]),
  // Distant perimeter wall (silhouette through the windows; visual only)
  ...([[-34, -34, 34, -33], [-34, 33, 34, 34], [-34, -34, -33, 34], [33, -34, 34, 34]] as const).map(([x0, z0, x1, z1]): BoxDef => vis([x0, 0, z0, x1, 3.2, z1], 'brickDark', 3)),
];

const CYLS: CylDef[] = [[9, 6], [9.8, 6.3], [9.3, 7]].map(([x, z]) => ({ x, z, r: 0.3, h: 0.9, mat: 'red', segments: 12, surface: 'metal' }));

const SIGNS: SignDef[] = [
  { lines: ['NIGHTFALL RELAY', 'CHECKPOINT 3'], x: 0, y: 4.2, z: 17.83, ry: Math.PI },
  { lines: ['LOADING DOCK', 'NO ENTRY AFTER DARK'], x: 0, y: 4.2, z: 4.17 - 0.34, ry: Math.PI },
  { lines: ['GENERATOR HALL'], x: 15.5, y: 4.3, z: 17.83, ry: Math.PI, h: 0.5 },
  { lines: ['REFORGE VAULT', 'AUTHORISED ONLY'], x: -14.5, y: 4.3, z: 4.17, ry: 0 },
  { lines: ['⚡ MAIN POWER ⚡'], x: 18, y: PF + 2.6, z: -13.83, ry: 0, h: 0.5 },
];

const DECALS: DecalDef[] = ([[-3, 16, 2], [3.5, 16.5, 1.4], [-6, -12, 2.2], [0, 0, 1.8], [15, 16, 2.4], [-14, 16.5, 1.6], [18, -12, 1.5]] as const)
  .map(([x, z, s]) => ({ x, z, size: s, y: z < 4 && x > 12 ? PF + 0.02 : 0.02, rot: x * z, kind: 'blood' as const }));

const LAMPS: LampDef[] = ([[0, 11], [-6, -6], [6, -6], [15.5, 11], [18, -6], [-14.5, 11]] as const).map(([x, z]) => ({
  x, y: H - 0.4, z, range: 16, decay: 1.6,
  pre: { color: 0xff3018, intensity: 5, flicker: 'faulty' },
  post: { color: 0xffc080, intensity: 45, flicker: 'buzz' },
}));
// Cold moonlight spilling through every other window.
const MOON: PointLightDef[] = WINDOWS.filter((w) => w.id % 2 === 0).map((w) => ({
  x: w.x - w.nx * 1.2, y: w.floor + 1.8, z: w.z - w.nz * 1.2, color: 0x7890c0, intensity: 10, range: 7, decay: 1.8,
}));

export const NIGHTFALL: ZombiesMapDef = {
  id: 'nightfall',
  name: 'Nightfall Relay',
  blurb: 'A blacked-out border relay station. Five zones, a raised power room and a radio that will not stop whispering.',
  bounds: { minX: -40, minZ: -40, maxX: 40, maxZ: 40 },
  wallHeight: H,
  zones: [
    { id: Z.lobby, name: 'CHECKPOINT LOBBY' },
    { id: Z.dock, name: 'LOADING DOCK' },
    { id: Z.hall, name: 'GENERATOR HALL' },
    { id: Z.power, name: 'POWER ROOM' },
    { id: Z.vault, name: 'REFORGE VAULT' },
  ],
  startZone: Z.lobby,
  rooms: [
    { zone: Z.lobby, name: 'CHECKPOINT LOBBY', rect: { x0: -7, z0: 4, x1: 7, z1: 18 }, floor: 0 },
    { zone: Z.dock, name: 'LOADING DOCK', rect: { x0: -12, z0: -14, x1: 12, z1: 4 }, floor: 0 },
    { zone: Z.hall, name: 'GENERATOR HALL', rect: { x0: 7, z0: 4, x1: 24, z1: 18 }, floor: 0 },
    { zone: Z.power, name: 'POWER ROOM', rect: { x0: 12, z0: -14, x1: 24, z1: 4 }, floor: PF, ceiling: H, floorMat: 'metalDark' },
    { zone: Z.vault, name: 'REFORGE VAULT', rect: { x0: -22, z0: 4, x1: -7, z1: 18 }, floor: 0, floorMat: 'concrete' },
  ],
  walls: [
    // Exterior
    { axis: 'x', at: 18, a0: -22, a1: 24, y0: 0, y1: H, mat: 'brick' },
    { axis: 'x', at: -14, a0: -12, a1: 12, y0: 0, y1: H, mat: 'brick' },
    { axis: 'x', at: -14, a0: 12, a1: 24, y0: PF, y1: H, mat: 'brick' },
    { axis: 'z', at: -12, a0: -14, a1: 4, y0: 0, y1: H, mat: 'brick' },
    { axis: 'z', at: -22, a0: 4, a1: 18, y0: 0, y1: H, mat: 'brick' },
    { axis: 'x', at: 4, a0: -22, a1: -12, y0: 0, y1: H, mat: 'brick' },
    { axis: 'z', at: 24, a0: 4, a1: 18, y0: 0, y1: H, mat: 'brick' },
    { axis: 'z', at: 24, a0: -14, a1: 4, y0: PF, y1: H, mat: 'brick' },
    // Interior
    { axis: 'x', at: 4, a0: -12, a1: 12, y0: 0, y1: H, mat: 'plaster' },
    { axis: 'x', at: 4, a0: 12, a1: 24, y0: PF, y1: H, mat: 'plaster' },
    { axis: 'z', at: 7, a0: 4, a1: 18, y0: 0, y1: H, mat: 'plaster' },
    { axis: 'z', at: -7, a0: 4, a1: 18, y0: 0, y1: H, mat: 'plasterBlue' },
    // Wall above the Power Room overlook glazing
    { axis: 'z', at: 12, a0: -14, a1: 4, y0: PF + 3.2, y1: H, mat: 'plaster' },
  ],
  boxes: BOXES,
  cylinders: CYLS,
  signs: SIGNS,
  decals: DECALS,
  ground: { mat: 'dirt', tile: 6 },
  // Stairs from the Generator Hall up to the Power Room, rising toward -Z.
  stairs: [{ rect: { x0: 20.6, z0: 4, x1: 23.4, z1: 4 + 7 * 1.03 }, dir: '-z', y0: 0, y1: PF, steps: 7, mat: 'metalDark', rail: 'left' }],
  doors: [
    { id: 'lobby_dock', a: Z.lobby, b: Z.dock, cost: 750, kind: 'door', axis: 'x', at: 4, a0: -1.6, a1: 1.6, y0: 0, y1: 3.0 },
    { id: 'lobby_hall', a: Z.lobby, b: Z.hall, cost: 1000, kind: 'debris', axis: 'z', at: 7, a0: 10, a1: 13.2, y0: 0, y1: 3.0 },
    { id: 'dock_hall', a: Z.dock, b: Z.hall, cost: 1250, kind: 'door', axis: 'x', at: 4, a0: 8.4, a1: 10.8, y0: 0, y1: 3.0 },
    { id: 'dock_vault', a: Z.dock, b: Z.vault, cost: 1250, kind: 'door', axis: 'x', at: 4, a0: -10.6, a1: -8.4, y0: 0, y1: 3.0 },
    { id: 'hall_power', a: Z.hall, b: Z.power, cost: 1500, kind: 'debris', axis: 'x', at: 4, a0: 20.6, a1: 23.4, y0: PF, y1: PF + 2.4 },
  ],
  windows: WINDOWS,
  playerSpawn: { x: 0, z: 13, yaw: 0 },
  box: {
    spots: [
      { x: -6.35, z: 8, face: Math.PI / 2 },
      { x: 0, z: -13.35, face: 0 },
      { x: 23.35, z: 16, face: -Math.PI / 2 },
      { x: -21.35, z: 6.5, face: Math.PI / 2 },
    ],
    // No Cache in the lobby at the start: it surfaces on the dock once two doors are open (round 6 at the latest).
    reveal: { doors: 2, round: 6, spot: 1 },
  },
  perks: {
    lifeline: { x: 6.2, z: 6.2, face: -Math.PI / 2 },
    bulwark: { x: -11.3, z: 0.5, face: Math.PI / 2 },
    quickhands: { x: 15.5, z: 4.75, face: 0 },
    hammerfall: { x: 15, z: -12.6, face: 0, y: PF },
    hawkeye: { x: 11.5, z: -12.5, face: -Math.PI / 2 },
    strider: { x: 18, z: 13, face: Math.PI },
    nova: { x: 14.5, z: 3, face: Math.PI, y: PF },
    packmule: { x: -14.5, z: 9, face: 0 },
  },
  pap: { x: -19, z: 16.9, face: Math.PI },
  power: { x: 20.5, z: -13.6, face: 0, y: PF },
  // Starter tier in the lobby only; standard guns one door in; heavy guns in the vault and the power room.
  wallBuys: [
    { key: 'smg_wren', x: -6.83, z: 13, face: Math.PI / 2 },
    { key: 'pi_magnus', x: -4.5, z: 4.17, face: 0 },
    { key: 'br_drover', x: 0, z: 17.83, face: Math.PI },
    { key: 'sg_hullbreaker', x: -11.83, z: -2.5, face: Math.PI / 2 },
    { key: 'ar_kestrel', x: 11.83, z: -7, face: -Math.PI / 2 },
    { key: 'smg_skiff', x: 23.83, z: 15.5, face: -Math.PI / 2 },
    { key: 'ar_corvid', x: -21.83, z: 15, face: Math.PI / 2 },
    { key: 'lmg_bastion', x: -16.5, z: 4.17, face: 0 },
    { key: 'dmr_sentry', x: 23.83, z: -4, face: -Math.PI / 2, y: PF },
  ],
  startWeapon: 'pi_warden',
  // Main quest: tune the radios, recover the relay's signal cores, feed the power room, then key the transmitter.
  egg: {
    name: 'Signal Fragments',
    steps: [
      {
        kind: 'interact',
        prompt: 'Tune the strange radio',
        toast: 'A VOICE IN THE STATIC',
        objects: [
          { x: -11.4, z: -13.4, y: 0.35, model: 'radio' },
          { x: 8.3, z: 17.3, y: 0.35, model: 'radio' },
          { x: 23.4, z: -13.3, y: PF + 0.35, model: 'radio' },
        ],
      },
      {
        kind: 'collect', requiresPower: true, toast: 'THE VOICE WANTS ITS SIGNAL CORES · THREE, SCATTERED',
        objects: [
          { x: -20.5, y: 0.9, z: 12.5, model: 'orb' },
          { x: 21.5, y: 0.9, z: 16.8, model: 'orb' },
          { x: 23, y: PF + 0.9, z: -6, model: 'orb' },
        ],
      },
      { kind: 'kill', zone: Z.power, count: 20, requiresPower: true, toast: 'FEED THE BREAKERS · KILL IN THE POWER ROOM' },
      { kind: 'interact', prompt: 'Key the checkpoint transmitter', toast: 'THE TRANSMITTER IS WARM · KEY IT AT THE CHECKPOINT DESK', objects: [{ x: 0, y: 1.3, z: 7.9, model: 'radio', radius: 1.6 }] },
    ],
    reward: { title: 'THE RELAY ANSWERS', sub: 'Signal restored · +1 perk slot · your weapon is reforged for free', points: 5000, reforge: true, refillAmmo: true, powerup: 'double_points', perkSlot: 1 },
  },
  // Side quest: three lost cassette tapes, picked up by walking over them.
  sideEggs: [{
    name: 'Lost Tapes',
    steps: [{
      kind: 'collect', toast: 'A CASSETTE · SOMEONE WAS RECORDING THE NIGHTS',
      objects: [
        { x: -6.3, y: 0.6, z: 4.7, model: 'relic' },
        { x: -11.3, y: 0.6, z: -13.3, model: 'relic' },
        { x: 7.7, y: 0.6, z: 17.3, model: 'relic' },
      ],
    }],
    reward: { title: 'LOST TAPES', sub: 'The relay plays them back · a free Strider Tonic', music: 'nightfall', perk: 'strider', points: 500 },
  }],
  // Buildable: a riot shield from three parts, assembled on the bench in the Generator Hall.
  buildables: [{
    id: 'riot_shield', name: 'Riot Shield',
    bench: { x: 12, z: 13, face: Math.PI },
    parts: [
      { name: 'Shield plate', x: 7, y: 0.9, z: -11, model: 'plate' },
      { name: 'Viewport glass', x: -9.5, y: 0.9, z: 12, model: 'orb' },
      { name: 'Grip strap', x: 12.5, y: PF + 0.9, z: -2, model: 'gear' },
    ],
    result: { kind: 'shield', hp: 1500 },
  }],
  // Trap: the dock's arc fence in front of the lobby door (needs power).
  traps: [{
    id: 'dock_arc', name: 'Arc Fence', kind: 'electric', requiresPower: true, cost: 1000, seconds: 20, cooldown: 45,
    switch: { x: 11.5, z: 1, face: -Math.PI / 2 },
    area: { x0: -3, z0: -2.5, x1: 3, z1: 2.5, y: 0 },
  }],
  rounds: { special: { first: [5, 6], every: [4, 6] }, bossEvery: 8 },
  powerups: { maxPerRound: 4, dropChanceMult: 1 },
  lighting: {
    background: 0x05060a,
    fogColor: 0x0a0c12,
    fogDensity: 0.042,
    hemi: 0.35,
    sun: 0.35,
    lamps: LAMPS,
    lights: MOON,
  },
  audio: { ambience: 'relay' },
  flavor: { powerHint: 'The breaker is in the Power Room', bossTitle: 'THE WARDEN · RELAY GUARDIAN', gameOverSub: 'NIGHTFALL RELAY · SIGNAL LOST' },
  assets: [
    'zombies/kit_door.glb', 'zombies/kit_debris.glb', 'zombies/mystery_box.glb', 'zombies/reforger.glb', 'zombies/power_switch.glb',
    'zombies/perk_lifeline.glb', 'zombies/perk_bulwark.glb', 'zombies/perk_quickhands.glb', 'zombies/perk_hammerfall.glb',
  ],
};
