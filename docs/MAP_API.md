# Zombies Map API

A Zombies map is **one plain data object** (`ZombiesMapDef`, `src/zombies/mapdef.ts`) plus an optional
`decorate` hook for bespoke three.js dressing. The same definition drives:

| Consumer | File | Uses the def for |
|---|---|---|
| Compiler (pure) | `src/zombies/mapcompile.ts` | walls with cut openings, floors, stairs, ramps, ladders, window pockets, door + machine colliders, nav links |
| Renderer | `src/zombies/ZombiesMap.ts` | batched static meshes, props (GLB), doors/debris, planks, lamps, sky, egg objects |
| Runtime | `src/zombies/ZombiesMode.ts` | zones/doors unlock graph, spawns, machines, wall-buys, power-ups, easter egg |
| Validator (pure) | `src/zombies/validate.ts` | structural checks + nav reachability using the *same* colliders |
| Nav | `src/world/NavGrid.ts` | layered (multi-floor) flow field with ladder/drop/jump links |

Because the renderer, the game and the validator all read the compiled output, what you see, what you
collide with and what the validator checks cannot drift apart.

## Adding a map (checklist)

1. Create `src/zombies/maps/<your-map>/def.ts` exporting a `ZombiesMapDef`.
2. (Optional) `src/zombies/maps/<your-map>/decorate.ts` exporting `(ctx: MapDecorateContext) => void`.
3. Register it in `src/zombies/maps/index.ts` — **one import, one line**:
   ```ts
   import { LAHORE } from './lahore/def';
   export const MAPS: ZombiesMapEntry[] = [
     { def: NIGHTFALL, decorate: decorateNightfall },
     { def: LAHORE },                       // <- new map
   ];
   ```
4. `corepack pnpm test` — `tests/zombies-mapdef.test.ts` runs `validateMapDef` on **every registered map**
   and fails with readable messages (unreachable perk, zone leak, spawn inside a crate, ...).
5. Play it: `/?mode=zombies&map=<id>` (add `&dev` for the `window.__DS` automation API), or pick the card on
   the title screen. `e2e/zombies-play.mjs` accepts `BASE=http://127.0.0.1:<port> MAP=<id>`.

Checking a def by hand (e.g. in a scratch test):

```ts
import { validateMapDef } from '../src/zombies/validate';
const r = validateMapDef(MY_MAP);
console.log(r.issues);          // [{ severity: 'error' | 'warn', code, msg }]
```

## Conventions

- Metres, **+Y up, north is −Z**. Yaw `0` faces **+Z** (south), `Math.PI` faces −Z.
- The ground plane `y = 0` is implicit and solid: nothing can go below it. Build "underground" levels by
  raising the street (e.g. street at `y = 4`, sewer at `y = 0`).
- Everything must sit inside `bounds` (collision + nav extent). Nav cells are 1 m; walls may be any
  thickness (thin walls that fall between two cells are handled).
- A zombie steps up at most **0.5 m** between cells. Stairs with shallow treads are fine (the nav follows
  the treads); anything taller needs stairs, a ramp, a ladder or a nav link.
- Headroom for walkable floor is **1.7 m**.

## The definition

Every field is documented in `src/zombies/mapdef.ts`; this is the tour.

### Identity and extent
```ts
id: 'lahore',                    // lowercase kebab-case; used in ?map=
name: 'Lahore Darbar',
blurb: 'One sentence for the map card.',
thumbnail?: '/maps/lahore.jpg',  // optional; the menu generates a card otherwise
bounds: { minX, minZ, maxX, maxZ },
wallHeight: 5.4,                 // default ceiling height above a room floor
```

### Zones and rooms (any number of floors)
Zones are the unlock graph; **rooms** give them shape and height. `zoneAt(def, x, z, y)` picks the room with
the highest floor at or below the feet, so rooms can stack.

```ts
zones: [{ id: 0, name: 'COURTYARD' }, { id: 1, name: 'HALL OF MIRRORS' }],
startZone: 0,
rooms: [
  { zone: 0, rect: { x0, z0, x1, z1 }, floor: 0, ceiling: null },           // open sky
  { zone: 1, rect: {...}, floor: 4, ceiling: 8, support: 'slab' },          // upper storey on a 0.3 m slab
  { zone: 1, rect: {...}, floor: 2.4 },                                      // raised dais on a solid plinth (default)
]
```
Room options: `floorMat`, `ceilingMat`, `beams` (material or `false`), `support: 'plinth' | 'slab' | 'none'`,
`skirting`.

### Walls, static geometry
```ts
walls: [{ axis: 'x', at: 18, a0: -22, a1: 24, y0: 0, y1: 5.4, mat: 'brick' }],  // along X at z = 18
boxes: [{ box: [x0, y0, z0, x1, y1, z1], mat: 'wood', collide: 'solid', surface: 'wood' }],  // mat: null = invisible collider
quads: [{ rect, y, mat }],                 // flat visual planes (rugs, water, paint)
cylinders: [{ x, z, r, h, mat }],          // drums, columns (box collider)
props: [{ model: 'zombies/generator.glb', x, z, yaw, fit: { height: 1.8 }, collider: { w, d, h },
          lod?: { model: 'favela/fv_water_tower.lod1.glb', distance: 28 } }],   // far-away low-detail twin
signs: [{ lines: ['DARBAR HALL'], x, y, z, ry }],
decals: [{ x, z, size, kind: 'blood' }],
ground: { mat: 'dirt', tile: 6 },          // outdoor ground plane (visual)
```
- **Doors and windows cut their own openings** in any wall they lie on (same line, inside `a0..a1`,
  overlapping `y0..y1`). Use `openings` for extra archways.
- `collide`: `'solid'` (default; blocks movement, bullets and sight), `'floor'` (solid **and** walkable top —
  use for platforms, slabs, roofs, balconies), `'nonsolid'` (blocks movement only: glass rails, fences),
  `'none'` (visual only).
- Materials: any name in `MATERIAL_NAMES` (`'brick'`, `'plaster'`, `'metalDark'`, `'container0..5'`,
  `'glassPane'`, ...) or an inline spec `{ color: 0xc8a060, roughness: 0.6, texture: 'plaster', emissive }`.
  Bespoke textured materials: add `materials: () => ({ marble: new THREE.MeshStandardMaterial(...) })` to the
  registry entry and reference them as `{ custom: 'marble', color: 0xeeeeee }` (the other fields are the fallback).
- `mat: null` on a box gives a collider with no mesh — use it for the solid core of a GLB prop that draws itself.
- Props load asynchronously; their **collider is authored in data** (`w` along local X, `d` along local Z),
  and a box stand-in shows until (or if never) the GLB loads. Use GLBs from `public/models/` (see
  `public/models/manifest.json`), e.g. the kit pieces `zombies/kit_wall.glb`, `kit_floor.glb`, `kit_stairs.glb`,
  `kit_catwalk.glb`, `kit_barricade_window.glb`.

### Moving between floors
```ts
stairs:  [{ rect, dir: '-z', y0: 0, y1: 2.4, steps: 7, rail: 'left' }],   // ascends toward dir
ramps:   [{ rect, dir: '+x', y0: 0, y1: 1.5 }],
ladders: [{ bottom: { x, y: 0, z }, top: { x, y: 6, z } }],               // players + zombies
links:   [{ from: { x, y: 6, z }, to: { x, y: 0, z }, kind: 'drop' }],    // one-way unless twoWay
```
- **Stairs** and **ramps** are real colliders; zombies path over them automatically.
- **Ladders**: players climb by walking into them (forward = up, back = down, jump = let go). Zombies treat a
  ladder as a two-way nav link and climb it.
- **Links** are zombie-only shortcuts: `drop` off a roof edge, `jump` a gap, `vault` a wall. The flow field
  prices them, and zombies within 0.7 m of a link's start traverse it with an animation.

### Progression: doors, windows, spawns
```ts
doors: [{ id: 'gate', a: 0, b: 1, cost: 750, kind: 'door' | 'debris', axis: 'x', at: 4, a0: -1.6, a1: 1.6,
          y0: 0, y1: 3, requiresPower?: true, label?: 'Raise the Portcullis', model?: 'zombies/kit_door.glb' }],
windows: [{ id: 0, zone: 0, x: -3.6, z: 18, nx: 0, nz: 1, floor: 0, pocket?: true }],
spawnPoints: [{ zone: 2, kind: 'ground' | 'drop' | 'point', x, y, z, weight?: 1 }],
```
- A door can be bought once either side is reachable. `requiresPower` locks it until the power is on.
- **Windows**: `id` must equal the array index; `nx/nz` is the unit outward normal. Zombies spawn in a small
  walled pocket outside (`pocket: false` when the outside is real, enclosed geometry), tear the planks and
  climb in. Windows on upper floors get a raised pocket automatically.
- **Spawn points** (no barricade): `ground` zombies claw up out of the floor, `drop` zombies fall from where
  they are placed (rooftops, skylights), `point` just appear (dark alcoves). All spawns are active once their
  zone is unlocked; the director weights them by distance to the player, counting other floors as further.

### Player, machines, buys
```ts
playerSpawn: { x, y?, z, yaw },  coopSpawns?: [...],
box:   { spots: [{ x, z, face, y? }], start?: 0,
         reveal?: { doors?: 2, zones?: [3], round?: 5, power?: true, spot?: 1, hint?: '...' } },  // hidden until ANY holds
perks: { lifeline: { x, z, face }, bulwark: {...}, quickhands: {...}, hammerfall: {...},
         strider, hawkeye, packmule, nova },     // any subset; the last four borrow a stock machine, repainted
pap:   { x, z, face, y? } | null,
power: { x, z, face, y? } | null,        // null = power on from the start
wallBuys: [{ key: 'smg_wren', x, z, face, y? }],   // key from WALL_BUYS (src/zombies/rules.ts); starter tier only in the start zone
startWeapon?: 'pi_warden',
machines?: { box: 'lahore/box.glb', pap, power, perks: { bulwark: 'x.glb' | { model: 'x.glb', foot: [w, d] } } },
powerups?: { exclude?: ['carpenter'], maxPerRound?: 4, dropChanceMult?: 1 },
rounds?: { special?: { first: [5, 6], every: [4, 6] } | null, bossEvery?: 8, blackoutFirst?: 13, blackoutEvery?: 10 },
```
`machines` reskins the machines per map (gameplay unchanged); `foot` resizes a perk's collider to its model.
`face` is the direction the front of the machine faces; the player stands in front of it. Machine
footprints come from the models (`PERK_FOOT` in `mapcompile.ts`), so the validator checks the spot in front is
reachable. **Give `y` for anything on an upper floor.**

### Pacing: the Cache reveal, wall-buy tiers, buildables, traps
See `docs/PACING.md` for the design and every map's values.
- `box.reveal` hides the Cache at the start; it surfaces (light column, sting, HUD line) as soon as any condition
  holds, at `reveal.spot` if that zone is open, else the first open spot outside the start zone. Pick a spot outside
  the start zone and add a `round` safety net.
- Wall-buy tiers live in `WALL_BUYS` (`starter`/`standard`/`heavy`): the start zone must carry starters only (and at
  least one); standard guns belong one door in, heavy guns two (the validator warns otherwise).

```ts
buildables: [{
  id: 'riot_shield', name: 'Riot Shield',
  bench: { x, z, face, y? },                               // 1.6 x 0.8 m footprint, stand 1.2 m in front
  parts: [{ name: 'Shield plate', x, y, z, model?: 'plate' | 'gear' | 'orb' | 'relic' | 'radio' | 'x.glb' }],  // y = floor + 0.9
  result: { kind: 'shield', hp: 1500 } | { kind: 'trap', trap: 'aam_fire' },
  requiresPower?, model?: 'map/bench.glb',
}],
traps: [{
  id: 'dock_arc', name: 'Arc Fence', kind: 'electric' | 'fire',
  switch: { x, z, face, y? },                              // 0.9 x 0.35 m panel, stand 0.9 m in front
  area: { x0, z0, x1, z1, y },                             // killing floor
  cost?: 1000, seconds?: 20, cooldown?: 45, requiresPower?, requiresBuild?: 'buildable id', model?,
}],
sideEggs: [{ name, steps: [...], reward: { title, perk?: 'strider', music?: 'nightfall', perkSlot?: 1, ... } }],
```
Parts are picked up with E; spread them over at least two zones. Traps kill non-elites in the area (50 points each)
and hurt players standing in it.

### Rides (cable cars, ziplines, slides)
```ts
rides: [{
  id: 'gondola_up', label: 'Ride the cable car up', at: { x, y, z }, radius?: 1.6,
  path: [{ x, y, z }, ...],          // feet positions; the first point sits at `at`
  seconds: 14, cost?: 250, cooldown?: 4,
  requiresPower?: true, requiresZones?: [3, 7], requiresEgg?: true, requiresEggStep?: 3,
}],
```
Press E at `at` to be carried along `path` (arc-length, eased in and out). Rides are one-way; add a second
ride for the way back. Pure rules live in `src/zombies/rides.ts` (`rideBlock`, `ridePosition`). The map's
`update(ctx)` hook receives `ctx.ride = { id, t }` (progress 0..1) to animate the vehicle, plus `ctx.egg` (complete) and `ctx.eggStep`.
Test ride clearance against the compiled colliders (see `tests/maps-favela.test.ts`).

### Easter egg (generic step machine)
```ts
egg: {
  name: 'The Koh-i-Noor',
  steps: [
    { kind: 'interact', objects: [{ x, y, z, model: 'orb' }, ...], ordered?: true, prompt: 'Touch the mirror' },
    { kind: 'kill', zone: 3, count: 12, requiresPower: true, toast: 'Feed the sanctum' },
    { kind: 'collect', objects: [{ x, y, z, model: 'zombies/relic.glb' }] },   // walk over to pick up
  ],
  reward: { title: 'THE DIAMOND WAKES', sub: '...', points: 2500, reforge: true, refillAmmo: true, powerup: 'double_points',
            allPerks: true, weapon: 'ww_arc' },
}
```
Steps run in order; only the current step's objects are visible. `ordered` interact steps reset on a wrong
press. Object `model` is `'radio' | 'relic' | 'orb'` (procedural) or a GLB path. Pure logic lives in
`src/zombies/egg.ts`.

### Lighting, audio, flavour, preload
```ts
lighting: {
  background: 0x05060a, sky?: { top: 0x0a1030, horizon: 0x40506a, stars: true },
  fogColor: 0x0a0c12, fogDensity: 0.042,
  hemi: 0.35, sun: 0.35, sunColor?: 0xffd0a0, sunDir?: [0.4, 0.8, 0.3],
  postPower?: { hemi: 0.6, fogDensity: 0.03 },           // global change when the power comes on
  lamps: [{ x, y, z, range: 16, pre: { color: 0xff3018, intensity: 5, flicker: 'faulty' },
                              post: { color: 0xffc080, intensity: 45, flicker: 'buzz' } }],
  lights?: [{ x, y, z, color, intensity, range }],       // constant lights (moonlight, fire)
},
audio?: { ambience: 'relay' },                           // reserved: every map uses the relay bed for now
flavor?: { powerHint: 'The breaker is in the Power Room', powerPrompt: 'Throw the main breaker', powerOnHint: 'Reforger + perks live',
           bossTitle: 'THE WARDEN · RELAY GUARDIAN', gameOverSub: '...' },
assets?: ['zombies/kit_door.glb', ...],                   // preloaded when the map is built
```
Flicker styles: `'none'`, `'faulty'` (dim, stuttering, bulb dark), `'buzz'` (mostly on, occasional dips).
Keep the real light count low (every lamp is a point light; aim for ≤ 12 lamps + lights).

### The decorate hook
```ts
export function decorateLahore(ctx: MapDecorateContext): void {
  // ctx.root: add meshes · ctx.batch: merge lots of small static boxes · ctx.world: add colliders
  // ctx.mat('brick') resolves a MatRef · ctx.M is the shared material library
}
```
Anything solid you add in `decorate` must also get a collider in `ctx.world` (the nav is built after the hook
runs, but the **validator only sees the def**, so prefer data for anything gameplay-relevant).
An `update(ctx)` hook can animate set dressing (keep it cheap). `ctx` carries `time`, `dt`, `power`, `blackout`
(lights-out round), `player` (feet position) and `egg` (easter egg complete).

## What the validator checks

| Code | Meaning |
|---|---|
| `zone-unreachable` | a zone can never be unlocked from the start zone through the door graph |
| `zone-leak` | a locked zone's room is walkable-reachable before its door is bought (missing wall) |
| `door-unreachable` | a door cannot be reached from the zone that should open it |
| `room-unreachable` | a room has no reachable floor with every door open |
| `spawn-blocked` | the player (or a co-op) spawn overlaps a collider |
| `start-spawns` | the start zone has no windows or spawn points (round 1 cannot spawn) |
| `outside`, `wrong-zone` | a spawn/machine/window is outside every room or in the wrong zone |
| `box-/perk-/pap-/power-/wallbuy-/window-/spawnpoint-unreachable` | the stand point in front is not reachable |
| `window-id`, `window-normal`, `door-*`, `room-*`, `id`, ... | structural errors |
| `box-reveal-never`, `-start`, `-reach`, `-spot`, `-doors`, `-zone`, `-round` | the Cache reveal can never fire, surfaces in the start zone or somewhere no door reaches |
| `wallbuy-tier`, `wallbuy-starter` | a non-starter gun in the start zone; a start zone without a starter gun |
| `part-unreachable`, `bench-unreachable`, `trap-unreachable`, `trap-area-unreachable` | a buildable part, bench, trap switch or killing floor cannot be reached |
| `build-trap`, `trap-build`, `build-parts`, `build-dup`, `trap-area`, `perk-id`, `egg-perk` | dangling references and empty definitions |

Warnings (non-fatal): zones without spawns, maps without perks/Reforger, egg objects that may be out of reach,
`wallbuy-depth` (a standard/heavy gun too close to the start), `build-spread` (all parts in one zone),
`box-spots-start`, `trap-spawn`.

## Minimal example

`src/zombies/maps/_example/def.ts` (registered `hidden`: not on the menu, but playable at
`/?mode=zombies&map=example-house`, and validated by the tests) — a two-storey house with
stacked rooms, stairs, a debris pile at the top of the stairs, windows on both floors and non-window spawns:

```ts
import type { ZombiesMapDef } from '../../mapdef';
const UP = 3.5, TOP = 6.5;

export const EXAMPLE_HOUSE: ZombiesMapDef = {
  id: 'example-house', name: 'Example House', blurb: 'Two storeys, one staircase, one debris pile.',
  bounds: { minX: -12, minZ: -12, maxX: 26, maxZ: 22 },
  wallHeight: 3.2,
  zones: [{ id: 0, name: 'GROUND FLOOR' }, { id: 1, name: 'UPSTAIRS' }],
  startZone: 0,
  rooms: [
    { zone: 0, name: 'GROUND FLOOR', rect: { x0: 0, z0: 0, x1: 14, z1: 10 }, floor: 0, ceiling: null },
    { zone: 1, name: 'BEDROOM', rect: { x0: 0, z0: 0, x1: 10, z1: 10 }, floor: UP, ceiling: TOP, support: 'slab' },
    { zone: 1, name: 'LANDING', rect: { x0: 10, z0: 0, x1: 14, z1: 2 }, floor: UP, ceiling: TOP, support: 'slab' },
  ],
  walls: [
    { axis: 'x', at: 0, a0: 0, a1: 14, y0: 0, y1: TOP, mat: 'brick' },
    { axis: 'x', at: 10, a0: 0, a1: 14, y0: 0, y1: TOP, mat: 'brick' },
    { axis: 'z', at: 0, a0: 0, a1: 10, y0: 0, y1: TOP, mat: 'brick' },
    { axis: 'z', at: 14, a0: 0, a1: 10, y0: 0, y1: TOP, mat: 'brick' },
    { axis: 'x', at: 2, a0: 10, a1: 14, y0: UP, y1: TOP, mat: 'plaster' },   // stairwell walls upstairs
    { axis: 'z', at: 10, a0: 2, a1: 10, y0: UP, y1: TOP, mat: 'plaster' },
  ],
  stairs: [{ rect: { x0: 11, z0: 2.3, x1: 13, z1: 9.5 }, dir: '-z', y0: 0, y1: UP, steps: 11, rail: 'left' }],
  doors: [{ id: 'stairs_debris', a: 0, b: 1, cost: 750, kind: 'debris', axis: 'x', at: 2, a0: 11, a1: 13, y0: UP, y1: UP + 2.4 }],
  windows: [
    { id: 0, zone: 0, x: 3, z: 10, nx: 0, nz: 1, floor: 0 },
    { id: 1, zone: 0, x: 7, z: 10, nx: 0, nz: 1, floor: 0 },
    { id: 2, zone: 1, x: 8, z: 0, nx: 0, nz: -1, floor: UP },
  ],
  spawnPoints: [{ zone: 0, kind: 'ground', x: 8.5, y: 0, z: 6 }, { zone: 1, kind: 'drop', x: 5, y: UP, z: 7 }],
  boxes: [
    { box: [4, 0, 4.5, 6, 0.9, 5.5], mat: 'wood', surface: 'wood' },        // a table
    { box: [10, TOP, 2, 14, TOP + 0.3, 10], mat: 'concreteDark' },          // roof over the stairwell
  ],
  playerSpawn: { x: 3, z: 7, yaw: 0 },
  box: { spots: [{ x: 2, z: 1.2, face: 0 }] },
  perks: { quickhands: { x: 7, z: 1, face: 0 } },
  pap: { x: 3, z: 1.4, face: 0, y: UP },
  power: null,
  wallBuys: [{ key: 'smg_wren', x: 0.17, z: 5, face: Math.PI / 2 }],
  lighting: {
    background: 0x0a0d14, fogColor: 0x0c0f16, fogDensity: 0.03, hemi: 0.4, sun: 0.3,
    lamps: [{ x: 5, y: UP - 0.4, z: 5, pre: { color: 0xffb070, intensity: 30 }, post: { color: 0xffb070, intensity: 30 } }],
  },
};
```

The full-size references are `src/zombies/maps/nightfall/def.ts` (Nightfall Relay: five zones, a raised power
room with stairs and an overlook, ten windows, a three-radio easter egg) and the vertical `src/zombies/maps/favela/`
(Rio · Ridgelight: six terrace tiers, staging rooms for climb and drop spawns, rides, per-map machines, and a hillside
`decorate` that merges every static kit piece per material). `node scripts/map-svg.mjs <def.ts> <EXPORT> out.svg`
draws any def as a plan and a side elevation.

## Rounds a map should expect

By default every 5th round is a Scuttler round (fast, fragile; a map may randomise the cadence with `rounds`), every 8th a Warden round (boss spawns from a window, or the
first spawn point if the map has no windows), and rounds 13, 23, 33 ... are **blackouts**: every lamp drops to
a dim red flicker (`lamps[].pre` at 25 %), the fog thickens and the hemisphere light dims, so make sure a map is
still readable at that level. From round 10 a share of runners sprint (x1.3).

## Runtime API notes

- `game.setZombiesMap(id)` switches maps (the title-screen cards call it); built maps are cached.
- Dev API (`?dev`): `__DS.zMap(id?)` gets/sets the map; `__DS.zSpawn(type, x, z, y?)` spawns on a floor.
- `NavGrid.nodeAt(x, z, y)`, `computeFlow(x, z, y)`, `flowDir(x, z, out, y)` take a height on multi-level maps;
  omitting `y` keeps the old single-layer behaviour.
- `mapdata.ts` is a compatibility view of Nightfall in the old constant shape; do not add to it.
