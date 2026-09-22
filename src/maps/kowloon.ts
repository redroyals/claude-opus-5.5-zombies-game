// Hong Kong: Kowloon Stacks — flagship for both modes. 120 x 90 m, teams on the X axis.
// Levels: wet market (U, y 0) · neon street (G, 4.5) · walkway web (11.1) · rooftops (17.7).
// Lanes: NORTH tower row (walkways/roofs, long sightlines) · MID neon alley over the wet market (SMG range) · SOUTH tower row.
import { MapBuilder, type MapLayout, type SpawnPoint } from './types';

const G = 4.5, S = 3.3, W = G + 2 * S, R = G + 4 * S; // 4.5, 11.1, 17.7
const b = new MapBuilder();

// --- boundary (tall walls, not climbable) ---
b.box(-62, 0, -47, 62, 30, -45, 'concrete', { floor: false, tag: 'bound' }).box(-62, 0, 45, 62, 30, 47, 'concrete', { floor: false, tag: 'bound' })
  .box(-62, 0, -47, -60, 30, 47, 'concrete', { floor: false, tag: 'bound' }).box(60, 0, -47, 62, 30, 47, 'concrete', { floor: false, tag: 'bound' });

// --- street deck at G: solid fill, with the wet market carved out beneath x -26..26, z -10..10 ---
b.box(-60, 0, -45, -26, G, 45, 'concrete', { tag: 'street' }).box(26, 0, -45, 60, G, 45, 'concrete', { tag: 'street' })
  .box(-26, 0, -45, 26, G, -10, 'concrete', { tag: 'street' }).box(-26, 0, 10, 26, G, 45, 'concrete', { tag: 'street' });
// market ceiling = alley floor, with two stairwell openings (x ±19..±23) and a central grate hole (x -3..3, z -2..2)
b.slab(-19, -10, -3, 10, G, 'metal', 'alley-deck').slab(3, -10, 19, 10, G, 'metal', 'alley-deck')
  .slab(-3, -10, 3, -2, G, 'metal', 'alley-deck').slab(-3, 2, 3, 10, G, 'metal', 'alley-deck')
  .slab(-26, -10, -23, 10, G, 'concrete', 'alley-deck').slab(23, -10, 26, 10, G, 'concrete', 'alley-deck')
  .slab(-23, -10, -19, -2, G, 'concrete', 'alley-deck').slab(-23, 2, -19, 10, G, 'concrete', 'alley-deck')
  .slab(19, -10, 23, -2, G, 'concrete', 'alley-deck').slab(19, 2, 23, 10, G, 'concrete', 'alley-deck');
// stairs street -> market (both sides, down toward centre)
b.stairs(-23, 0, G, 0, '+x', 3.6, 'metal').stairs(23, 0, G, 0, '-x', 3.6, 'metal');
// market pillars + stalls (cover)
for (const x of [-14, -7, 7, 14]) for (const z of [-5, 5]) b.box(x - 0.4, 0, z - 0.4, x + 0.4, G - 0.3, z + 0.4, 'concrete', { floor: false, tag: 'pillar' });
for (const [x, z, yaw] of [[-11, -7, 0], [-11, 7, Math.PI], [11, -7, 0], [11, 7, Math.PI], [-4, -7, 0], [4, 7, Math.PI]] as const)
  b.cover('k-market-stall', x, 0, z, 3, 1.1, 1.4, yaw, 'wood');
b.cover('k-fish-tank-stall', 0, 0, -6, 2.4, 1.2, 1.2, 0, 'glass').cover('k-fish-tank-stall', 0, 0, 6, 2.4, 1.2, 1.2, Math.PI, 'glass');
b.place('k-plastic-crates', -17, 0, -8.5).place('k-plastic-crates', 17, 0, 8.5, Math.PI);

// --- neon alley at G (mid lane): storefronts line both sides, cover down the middle ---
for (const x of [-18, -9, 9, 18]) { b.place('k-storefront-shutter', x, G, -10.2, 0); b.place('k-storefront-shutter', x, G, 10.2, Math.PI); }
for (const x of [-30, -16, 16, 30]) b.place('k-neon-frame', x, G + 3.5, 0, Math.PI / 2);
b.cover('k-crate-stack', -12, G, 1.5, 1.6, 1.3, 1.6).cover('k-crate-stack', 12, G, -1.5, 1.6, 1.3, 1.6)
  .cover('k-dumpster', -34, G, -6, 2, 1.4, 1.2, 0, 'metal').cover('k-dumpster', 34, G, 6, 2, 1.4, 1.2, Math.PI, 'metal')
  .cover('k-gas-cylinders', -6, G, -8.5, 1.2, 1.2, 0.8, 0, 'metal').cover('k-gas-cylinders', 6, G, 8.5, 1.2, 1.2, 0.8, Math.PI, 'metal');

// --- tower rows (north z 16..40, south z -40..-16), 4 storeys, door gaps each face each storey ---
const towers: [number, number, string][] = [[-47, -31, 'T1'], [-11, 11, 'T2'], [31, 47, 'T3']];
for (const [x0, x1, t] of towers) {
  b.block(x0, 16, x1, 40, G, 4, S, 'concrete', `N${t}`);
  b.block(x0, -40, x1, -16, G, 4, S, 'concrete', `S${t}`);
}
// walkway web at W: bridges between towers in each row (z 26..29) and cross-alley bridges (x -8..-5 and 5..8)
for (const zc of [27.5, -27.5]) {
  b.slab(-31, zc - 1.5, -11, zc + 1.5, W, 'metal', 'walkway').rail(-31, zc - 1.5, -11, zc - 1.5, W).rail(-31, zc + 1.5, -11, zc + 1.5, W);
  b.slab(11, zc - 1.5, 31, zc + 1.5, W, 'metal', 'walkway').rail(11, zc - 1.5, 31, zc - 1.5, W).rail(11, zc + 1.5, 31, zc + 1.5, W);
  b.place('k-walkway-bridge', -21, W, zc, 0).place('k-walkway-bridge', 21, W, zc, 0);
}
for (const xc of [-6.5, 6.5]) {
  b.slab(xc - 1.5, -16, xc + 1.5, 16, W, 'metal', 'walkway').rail(xc - 1.5, -16, xc - 1.5, 16, W).rail(xc + 1.5, -16, xc + 1.5, 16, W);
  b.place('k-walkway-bridge', xc, W, 0, Math.PI / 2, 1.6);
}
// exterior stair runs G->W on the alley face of every tower, W->R on the outer face; ladders to the T2 roofs' water tower deck
const L = MapBuilder.stairLen(W - G);
for (const [x0, x1] of towers) {
  const mx = (x0 + x1) / 2;
  b.stairs(mx - L / 2, 14.5, G, W, '+x', 2).slab(mx + L / 2, 13.2, mx + L / 2 + 2, 15.8, W, 'metal', 'landing');
  b.stairs(mx + L / 2, -14.5, G, W, '-x', 2).slab(mx - L / 2 - 2, -15.8, mx - L / 2, -13.2, W, 'metal', 'landing');
  b.place('k-stair-metal', mx, G, 14.5, 0).place('k-stair-metal', mx, G, -14.5, Math.PI);
  b.stairs(x0 - 1.5, 30 - L, W, R, '+z', 2).stairs(x0 - 1.5, -30 + L, W, R, '-z', 2);
  b.slab(x0 - 2.5, 30, x0, 34, R, 'metal', 'landing').slab(x0 - 2.5, -34, x0, -30, R, 'metal', 'landing');
  b.slab(x0 - 2.5, 30 - L - 3, x0, 30 - L, W, 'metal', 'landing').slab(x0 - 2.5, -30 + L, x0, -30 + L + 3, W, 'metal', 'landing');
}
// roofs: antenna forest, AC units, water tanks, rooftop shacks (cover + long sightlines along the rows)
for (const [x0, x1, t] of towers) for (const zs of [1, -1]) {
  const mx = (x0 + x1) / 2, z = 28 * zs;
  b.cover('k-rooftop-shack', mx + 3, R, z - 4 * zs, 3, 2.6, 3, zs > 0 ? 0 : Math.PI, 'metal');
  b.cover('k-ac-cluster', mx - 4, R, z + 5 * zs, 2.2, 1.4, 1.2, 0, 'metal');
  b.place('k-antenna-mast', mx - 5, R, z - 6 * zs).place('k-antenna-mast', mx + 6, R, z + 7 * zs, 1);
  b.place('k-pipe-bundle', x1 - 0.5, G, z, Math.PI / 2);
  for (let s = 1; s < 4; s++) { b.place('k-balcony-cage', x1 + 0.2, G + s * S, z - 6, -Math.PI / 2); b.place('k-ac-unit', x0 - 0.2, G + s * S + 1.2, z + 5, Math.PI / 2); }
  if (t === 'T2') { b.cover('k-water-tank', 0, R, z, 4, 5, 4, 0, 'metal'); b.place('k-ladder', 2.2, R, z, 0); }
}
b.place('k-laundry-pole', -24, G + 6, 12, 0).place('k-laundry-pole', 24, G + 6, -12, Math.PI).place('k-scaffold-bamboo', 48.5, G, 28, Math.PI / 2).place('k-scaffold-bamboo', -48.5, G, -28, -Math.PI / 2);

// --- spawn plazas (street level, behind cover walls) ---
const sp = (x: number, yaw: number): SpawnPoint[] => [-10, -6, -2, 2, 6, 10].map((z) => ({ pos: [x, G, z], yaw }));
b.wall(-52, -14, -52, -4, G, 1.2, 'concrete', 0.4, 'spawn-cover').wall(-52, 4, -52, 14, G, 1.2, 'concrete', 0.4, 'spawn-cover')
  .wall(52, -14, 52, -4, G, 1.2, 'concrete', 0.4, 'spawn-cover').wall(52, 4, 52, 14, G, 1.2, 'concrete', 0.4, 'spawn-cover');

export const KOWLOON: MapLayout = {
  id: 'kowloon', name: 'Kowloon Stacks', accent: '#ff2e88',
  palette: ['#3a3d42', '#5b5f63', '#7a6f62', '#2a2f36', '#ff2e88'],
  bounds: { min: [-60, 0, -45], max: [60, 30, 45] },
  levels: { market: 0, street: G, walkway: W, roof: R },
  lanes: [
    { id: 'north', note: 'Tower row N: interiors at 4 storeys, walkway at 11.1 links T1-T2-T3, roofs at 17.7 with a 60 m sightline end to end.' },
    { id: 'mid', note: 'Neon alley over the wet market: short SMG lane at street level, market beneath joins via stairwells at x=±21 and a drop grate at the centre.' },
    { id: 'south', note: 'Tower row S mirrors N. Cross-alley bridges at x=±6.5 (y 11.1) tie the two rows together above mid.' },
  ],
  boxes: b.boxes, kit: b.kit,
  spawns: { alpha: sp(-56, -Math.PI / 2), bravo: sp(56, Math.PI / 2),
    ffa: [[-40, G, 0], [40, G, 0], [0, 0, 0], [-39, W, 20], [39, W, -20], [0, R, 22], [0, R, -22], [-20, G, 40], [20, G, -40], [-15, 0, 8], [15, 0, -8], [0, W, 27.5]]
      .map(([x, y, z]) => ({ pos: [x, y, z] as [number, number, number], yaw: 0 })) },
  flags: [
    { id: 'A', pos: [-38, G, 0], radius: 5, note: 'Alpha-side alley mouth under T1 bridge stairs.' },
    { id: 'B', pos: [0, 0, 0], radius: 5, note: 'Wet market centre, under the drop grate: contested from 3 heights.' },
    { id: 'C', pos: [38, G, 0], radius: 5, note: 'Bravo-side alley mouth, mirrors A.' },
  ],
  sightlines: [
    { from: [-39, R + 1.6, 28], to: [39, R + 1.6, 28], note: 'North roof line: sniper duel over the walkways; broken by shacks + water tower at T2.' },
    { from: [-56, G + 1.6, 0], to: [56, G + 1.6, 0], note: 'Spawn-to-spawn down the alley, deliberately broken by neon frames, crates and the grate hole.' },
    { from: [-6.5, W + 1.6, -16], to: [-6.5, W + 1.6, 16], note: 'Cross-alley bridge: exposed 32 m crossing, overwatched from both tower rows.' },
  ],
};
