// Rio: Favela Ridge — PvP + movement-kit flagship. 120 x 90 m, teams on the X axis, the ridge crests at x=0.
// Terraces step 3 m per tier: 0 (spawn street) · 3 · 6 · 9 · 12 (crest). U: storm drain along z=0 at y 0 under the
// whole ridge. Lanes: NORTH narrow stair-alley between house rows · MID main stair spine over the drain ·
// SOUTH slab rooftops you chain with mantles (roof -> water-tank stand -> next roof, 1.5 m steps).
import { MapBuilder, type MapLayout, type SpawnPoint } from './types';

const b = new MapBuilder();
b.box(-62, 0, -47, 62, 28, -45, 'concrete', { floor: false, tag: 'bound' }).box(-62, 0, 45, 62, 28, 47, 'concrete', { floor: false, tag: 'bound' })
  .box(-62, 0, -47, -60, 28, 47, 'concrete', { floor: false, tag: 'bound' }).box(60, 0, -47, 62, 28, 47, 'concrete', { floor: false, tag: 'bound' });

const TIERS: [number, number, number][] = [[33, 45, 3], [21, 33, 6], [9, 21, 9], [0, 9, 12]]; // |x| from..to, height
const DRAIN_TOP = 2.8;
for (const s of [-1, 1]) {
  const X = (a: number) => a * s;
  const span = (a: number, c: number): [number, number] => [Math.min(X(a), X(c)), Math.max(X(a), X(c))];
  for (const [a, c, y] of TIERS) {
    const [x0, x1] = span(a, c);
    const holes: [number, number, number, number][] = [[x0, -2, x1, 2]];
    if (a === 21) { const [h0, h1] = span(26, 28); holes.push([h0, 2, h1, 2 + MapBuilder.stairLen(6) + 0.1]); } // drain stairwell
    b.fill(x0, -45, x1, 45, 0, y, holes, 'concrete', `tier${y}`);
    b.fill(x0, -2, x1, 2, DRAIN_TOP, y, [], 'concrete', 'drain-roof');
    if (a === 21) b.stairs(X(27), 2, 0, 6, '+z', 2, 'concrete').place('r-concrete-stairs', X(27), 0, 5, 0);
  }
  // spine + alley stairs between tiers, rising toward the crest
  for (const [edge, lo, hi] of [[45, 0, 3], [33, 3, 6], [21, 6, 9], [9, 9, 12]] as const) {
    const L = MapBuilder.stairLen(hi - lo);
    b.stairs(X(edge + L), -6, lo, hi, s > 0 ? '-x' : '+x', 5).stairs(X(edge + L), 28, lo, hi, s > 0 ? '-x' : '+x', 2.5);
    b.place('r-concrete-stairs', X(edge + L / 2), lo, 28, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  // NORTH lane: house rows either side of the alley (z 30.5..42 and 14..25.5), 2 storeys, doors -> interior flanks
  for (const [a, c, y] of TIERS) {
    const [x0, x1] = span(a + 1, c - 1);
    b.block(x0, 30.5, x1, 42, y, 2, 3, 'concrete', `nA${y}`);
    if (a !== 0) b.block(x0, 12, x1, 25.5, y, 1, 3, 'concrete', `nB${y}`);
    b.place('r-house-block', (x0 + x1) / 2, y, 36, 0).place('r-power-pole-tangle', X(c - 0.5), y, 27, 0).place('r-laundry-line', (x0 + x1) / 2, y + 3.3, 28, 0);
    b.place('r-satellite', x0 + 1.5, y + 6, 40).place('r-ac-unit', x1 - 1, y + 1.8, 30.3, Math.PI);
  }
  // SOUTH lane: 1-storey houses per tier (roof = tier+2.8) and a water-tank stand at each tier edge (lower tier + 4.3)
  for (const [a, c, y] of TIERS) {
    const [x0, x1] = a === 0 ? span(0.5, 6) : span(a + 3.5, c - 1);
    b.block(x0, -38, x1, -16, y, 1, 3.1, 'concrete', `sH${y}`).place('r-house-block', (x0 + x1) / 2, y, -27, Math.PI, 0.9);
    b.place('r-slab-roof', (x0 + x1) / 2, y + 2.8, -27, 0).place('r-rebar-column', x0 + 0.5, y + 2.8, -17, 0);
  }
  for (const [edge, lo] of [[33, 3], [21, 6], [9, 9], [45, 0]] as const) {
    const [x0, x1] = span(edge + 0.5, edge + 3);
    b.box(x0, lo, -30, x1, lo + 4.3, -24, 'concrete', { tag: 'tank-stand' }).place('r-water-tank', (x0 + x1) / 2, lo + 4.3, -27, 0);
  }
  // mid-lane dressing and spawn street
  b.cover('r-barrel', X(40), 3, 4.5, 0.8, 1.1, 0.8, 0, 'metal').cover('r-crates', X(28), 6, -10, 1.6, 1.2, 1.6).cover('r-motorbike', X(15), 9, 5, 2, 1.1, 0.8, 0.3, 'metal')
    .cover('r-gas-cylinder', X(38), 3, -10, 0.8, 1.2, 0.8, 0, 'metal').cover('r-cinderblock-wall', X(51), 0, 8, 0.5, 1.3, 5, 0, 'concrete').cover('r-cinderblock-wall', X(51), 0, -8, 0.5, 1.3, 5, 0, 'concrete')
    .place('r-drain-grate-tunnel', X(45.2), 0, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2).place('r-corrugated-shack', X(57), 0, 30, 0).place('r-plastic-chairs', X(24), 6, 8, 0).place('r-storefront-roller', X(34), 3, 11.9, Math.PI);
}
// crest plaza (y 12, |x| < 9): tanks + a low wall as cover, satellite dishes; drain junction below at x 0
b.cover('r-water-tank', 0, 12, 8, 2.2, 2, 2.2, 0, 'wood').cover('r-water-tank', 0, 12, -8, 2.2, 2, 2.2, 0, 'wood').cover('r-cinderblock-wall', 0, 12, 0, 4, 1.1, 0.5, 0, 'concrete')
  .place('r-satellite', -5, 12, 12).place('r-satellite', 5, 12, -12, Math.PI);

const sp = (x: number, yaw: number): SpawnPoint[] => [-12, -7, -2.5, 2.5, 7, 12].map((z) => ({ pos: [x, 0, z + (z > 0 ? 3 : -3)], yaw }));
export const RIO: MapLayout = {
  id: 'rio', name: 'Rio Favela Ridge', accent: '#18b8a8',
  palette: ['#b0674a', '#8c8c86', '#d8cfc0', '#4b4f52', '#18b8a8'],
  bounds: { min: [-60, 0, -45], max: [60, 28, 45] },
  levels: { drain: 0, t3: 3, t6: 6, t9: 9, crest: 12, roofs: 14.8 },
  lanes: [
    { id: 'north', note: 'Stair-alley z 28 between two house rows; door gaps every storey turn it into a room-clearing lane.' },
    { id: 'mid', note: 'Main stair spine z -6 over the storm drain. Drain (y 0) runs spawn-to-spawn; stairwells at x=±27 pop up on tier 6.' },
    { id: 'south', note: 'Rooftop chain: roof (tier+2.8) -> tank stand (+1.5) -> next roof (+1.5). Pure movement lane, exposed to the crest.' },
  ],
  boxes: b.boxes, kit: b.kit,
  spawns: { alpha: sp(-55, -Math.PI / 2), bravo: sp(55, Math.PI / 2),
    ffa: [[-39, 3, 0], [39, 3, 0], [0, 12, 3], [0, 0, 0], [-27, 6, 20], [27, 6, -20], [-15, 12.1, -27], [15, 12.1, -27], [-30, 0, 0], [30, 0, 0], [-39, 3, 28], [39, 3, 28]]
      .map(([x, y, z]) => ({ pos: [x, y, z] as [number, number, number], yaw: 0 })) },
  flags: [
    { id: 'A', pos: [-39, 3, -4], radius: 5, note: 'Alpha tier-3 landing on the spine, above the drain mouth.' },
    { id: 'B', pos: [0, 12, 3], radius: 6, note: 'Crest plaza; attacked from the spine, the alley, the roof chain and (blind) from the drain junction below.' },
    { id: 'C', pos: [39, 3, -4], radius: 5, note: 'Bravo tier-3 landing (mirror of A).' },
  ],
  sightlines: [
    { from: [-55, 1.6, -6], to: [0, 13.6, -6], note: 'Spine: uphill line from spawn to crest, broken per tier by stair landings + cover.' },
    { from: [-40, 7.5, -27], to: [40, 7.5, -27], note: 'South roof chain end-to-end is blocked by the crest house (roof 14.8).' },
    { from: [-45, 1.6, 0], to: [45, 1.6, 0], note: 'Storm drain: 90 m straight tube, deliberately a shotgun/sniper gamble; exits at x=±27 break it.' },
  ],
};
