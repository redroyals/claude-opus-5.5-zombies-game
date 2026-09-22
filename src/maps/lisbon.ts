// Lisbon: Tram Hill — Zombies flagship, symmetric PvP variant. 130 x 80 m, teams on the X axis.
// The hill crests at a central miradouro (y 9) over a cistern (U, y 0). Each team starts at a low praça (y 0)
// and climbs terraces. Levels: praça/cistern 0 · tram street 4.5 · stair-street landings 6.75 · miradouro 9 · roofs 11-13.
// Lanes: NORTH tram switchback (stalled tram you can walk through) · MID tiled stair-street straight up to the
//        miradouro · SOUTH terracotta roofs joined by laundry-line crossings (planks).
import { MapBuilder, type MapLayout, type SpawnPoint } from './types';

const T = 4.5, M = 9, b = new MapBuilder();
b.box(-67, 0, -42, 67, 25, -40, 'concrete', { floor: false, tag: 'bound' }).box(-67, 0, 40, 67, 25, 42, 'concrete', { floor: false, tag: 'bound' })
  .box(-67, 0, -42, -65, 25, 42, 'concrete', { floor: false, tag: 'bound' }).box(65, 0, -42, 67, 25, 42, 'concrete', { floor: false, tag: 'bound' });

for (const s of [-1, 1]) {
  const X = (a: number) => a * s; // mirror helper: build the alpha half with s=-1, bravo half with s=1
  const band = (a: number, c: number, y: number, z0: number, z1: number, tag: string) => b.box(Math.min(X(a), X(c)), 0, z0, Math.max(X(a), X(c)), y, z1, 'concrete', { tag });
  // terraces (solid fill): praça 0 at |x| 50..65; tram street terrace 4.5 at |x| 26..44 north; miradouro 9 at |x| < 14
  band(26, 44, T, 8, 40, 'tram-terrace');
  band(14, 26, 6.75, 8, 40, 'tram-upper');
  band(14, 44, T, -12, 8, 'stair-street-mid');
  band(26, 44, T, -40, -12, 'roof-quarter-base');
  // tram switchback: ramp-stairs praça -> tram street (north), then tram street -> upper -> miradouro
  b.stairs(X(50), 24, 0, T, s > 0 ? '-x' : '+x', 5, 'concrete');
  b.stairs(X(26 + MapBuilder.stairLen(2.25)), 24, T, 6.75, s > 0 ? '-x' : '+x', 5, 'concrete');
  b.stairs(X(14 + MapBuilder.stairLen(2.25)), 24, 6.75, M, s > 0 ? '-x' : '+x', 5, 'concrete');
  // stalled tram on the tram street: walk-through box = floor + two side walls with door gaps, roof
  const tx = X(35);
  b.slab(tx - 5.5, 20.6, tx + 5.5, 23.4, T + 0.6, 'metal', 'tram-floor')
    .wall(tx - 5.5, 20.6, tx - 1, 20.6, T + 0.6, 2.4, 'metal', 0.1, 'tram').wall(tx + 1, 20.6, tx + 5.5, 20.6, T + 0.6, 2.4, 'metal', 0.1, 'tram')
    .wall(tx - 5.5, 23.4, tx - 1, 23.4, T + 0.6, 2.4, 'metal', 0.1, 'tram').wall(tx + 1, 23.4, tx + 5.5, 23.4, T + 0.6, 2.4, 'metal', 0.1, 'tram')
    .slab(tx - 5.5, 20.6, tx + 5.5, 23.4, T + 3.2, 'metal', 'tram-roof', 0.2)
    .place('l-tram', tx, T, 22, Math.PI / 2).place('l-tram-stop-shelter', X(40), T, 29, s > 0 ? Math.PI : 0);
  // mid stair-street: tiled stairs praça -> 4.5 (at |x| 44..), landing, then 4.5 -> 9 into the miradouro
  b.stairs(X(50), -7, 0, T, s > 0 ? '-x' : '+x', 6, 'concrete').place('l-stairs', X(47.5), 0, -7, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.stairs(X(19.5), -2, T, M, s > 0 ? '-x' : '+x', 6, 'concrete').place('l-stairs', X(17), T, -2, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.box(Math.min(X(14), X(19.5)), 0, -12, Math.max(X(14), X(19.5)), T, 8, 'concrete', { tag: 'stair-base' });
  // facades lining the mid stair-street with balconies (tall walls = sight blockers between mid and north/south)
  b.wall(X(20), 8, X(44), 8, T, 8, 'concrete', 0.5, 'facade').wall(X(20), -12, X(44), -12, T, 8, 'concrete', 0.5, 'facade');
  for (const x of [24, 32, 40]) { b.place('l-facade', X(x), T, 8.3, 0).place('l-balcony-iron', X(x), T + 4, 7.8, Math.PI).place('l-facade', X(x), T, -12.3, Math.PI); }
  b.cover('l-kiosk', X(31), T, -3, 2.4, 2.8, 2.4, 0, 'wood').cover('l-cafe-table-set', X(38), T, 2, 1.4, 0.8, 1.4).cover('l-planter', X(25), T, 3.5, 1.8, 0.9, 0.8, 0, 'concrete');
  // south roof quarter: 3 house blocks (hollow, 2 storeys on the 4.5 terrace), roofs 11.1, planks between (laundry-line crossings)
  const houses: [number, number][] = [[28, 34], [36, 42]];
  for (const [a, c] of houses) b.block(Math.min(X(a), X(c)), -36, Math.max(X(a), X(c)), -16, T, 2, 3.3, 'concrete', `house${a}`);
  b.slab(Math.min(X(34), X(36)), -27, Math.max(X(34), X(36)), -25, T + 6.6, 'wood', 'plank').place('l-laundry-line', X(35), T + 7.5, -26, 0);
  b.stairs(X(44 + MapBuilder.stairLen(T)), -30, 0, T, s > 0 ? '-x' : '+x', 3, 'concrete'); // praça -> roof quarter street
  b.stairs(X(27), -20, T, T + 6.6, '-z', 2, 'concrete');
  b.slab(Math.min(X(14), X(28)), -27, Math.max(X(14), X(28)), -25, T + 6.6, 'wood', 'plank').place('l-laundry-line', X(21), T + 7.5, -26, 0);
  for (const [a, c] of houses) { b.place('l-terracotta-roof', X((a + c) / 2), T + 6.6, -26, 0).place('l-chimney', X(a + 1), T + 6.6, -20).place('l-water-tank', X(c - 1.5), T + 6.6, -33).place('l-ac-unit', X(a), T + 3, -16.2, 0); }
  // praça (spawn) dressing
  b.cover('l-crates', X(56), 0, 14, 1.6, 1.2, 1.6).cover('l-crates', X(56), 0, -16, 1.6, 1.2, 1.6).cover('l-bench', X(60), 0, 0, 2, 0.9, 0.7, Math.PI / 2, 'wood');
  b.place('l-street-lamp', X(52), 0, 8).place('l-street-lamp', X(52), 0, -12).place('l-wooden-door-arch', X(44.2), 0, -5, s > 0 ? -Math.PI / 2 : Math.PI / 2);
}
// miradouro (y 9) with a cistern hall carved beneath: roof slab over a hollow box x -14..14, z -12..12
b.box(-14, 0, 12, 14, M, 40, 'concrete', { tag: 'miradouro-north' }).box(-14, 0, -40, 14, M, -12, 'concrete', { tag: 'miradouro-south' });
b.slabHoles(-14, -12, 14, 12, M, [[-2, -2, 2, 2], [-10.5, 0, -7.5, 12], [7.5, -12, 10.5, 0]], 'concrete', 'miradouro');
b.wall(-14, -12, -14, 12, 0, M - 0.3, 'concrete', 0.6, 'cistern').wall(14, -12, 14, 12, 0, M - 0.3, 'concrete', 0.6, 'cistern');
// cistern: stair down from the miradouro (north side, inside), well hole at centre (drop), columns, flooded floor = dirt
b.stairs(-9, 11, M, 0, '-z', 3, 'concrete').box(-10.5, 0, 11, -7.5, M - 0.3, 12, 'concrete', { floor: false, tag: 'stair-wall' });
b.stairs(9, -11, M, 0, '+z', 3, 'concrete');
for (const x of [-8, 0, 8]) for (const z of [-6, 6]) { b.box(x - 0.6, 0, z - 0.6, x + 0.6, M - 0.3, z + 0.6, 'concrete', { floor: false, tag: 'column' }); b.place('l-cistern-column', x, 0, z); }
b.place('l-funicular-winch', 0, 0, -9);
// cistern side doors: tunnels from the praça-level (y 0) at x ±14 (gaps in the cistern wall) — walls rebuilt with gaps
b.boxes = b.boxes.filter((x) => x.tag !== 'cistern');
for (const xw of [-14, 14]) { b.wall(xw, -12, xw, -1.2, 0, M - 0.3, 'concrete', 0.6, 'cistern').wall(xw, 1.2, xw, 12, 0, M - 0.3, 'concrete', 0.6, 'cistern').wall(xw, -1.2, xw, 1.2, 2.4, M - 2.7, 'concrete', 0.6, 'cistern'); }
// short tunnel x 14..19.5 under the mid stair base (keep floor 0, ceiling 2.6)
b.boxes = b.boxes.filter((x) => x.tag !== 'stair-base');
for (const s of [-1, 1]) {
  const x0 = Math.min(14 * s, 19.5 * s), x1 = Math.max(14 * s, 19.5 * s);
  b.box(x0, 0, -12, x1, T, -1.2, 'concrete', { tag: 'stair-base' }).box(x0, 0, 1.2, x1, T, 8, 'concrete', { tag: 'stair-base' }).box(x0, 2.6, -1.2, x1, T, 1.2, 'concrete', { tag: 'tunnel-roof' });
  // and the stair-street mid band must leave the tunnel mouth open: carve by replacing 'stair-street-mid'
}
b.boxes = b.boxes.filter((x) => x.tag !== 'stair-street-mid');
for (const s of [-1, 1]) {
  const x0 = Math.min(19.5 * s, 44 * s), x1 = Math.max(19.5 * s, 44 * s);
  b.box(x0, 0, -12, x1, T, -1.2, 'concrete', { tag: 'stair-street-mid' }).box(x0, 0, 1.2, x1, T, 8, 'concrete', { tag: 'stair-street-mid' }).box(x0, 2.6, -1.2, x1, T, 1.2, 'concrete', { tag: 'tunnel-roof' });
}
// miradouro dressing: railing along the view edge, benches, lamps
b.rail(-14, -12, 7.5, -12, M).rail(-14, 12, -9, 12, M).rail(-6, 12, 14, 12, M);
b.cover('l-bench', -6, M, 4, 2, 0.9, 0.7, 0, 'wood').cover('l-bench', 6, M, -4, 2, 0.9, 0.7, Math.PI, 'wood');
b.place('l-miradouro-railing', 0, M, -12, 0).place('l-street-lamp', -12, M, 0).place('l-street-lamp', 12, M, 0);

const sp = (x: number, yaw: number): SpawnPoint[] => [-10, -6, -2, 2, 6, 10].map((z) => ({ pos: [x, 0, z], yaw }));
export const LISBON: MapLayout = {
  id: 'lisbon', name: 'Lisbon Tram Hill', accent: '#f2b400',
  palette: ['#d9c9a8', '#b5653d', '#3f6fa8', '#efe6d4', '#f2b400'],
  bounds: { min: [-65, 0, -40], max: [65, 25, 40] },
  levels: { praca_cistern: 0, tram_street: T, upper: 6.75, miradouro: M, roofs: T + 6.6 },
  lanes: [
    { id: 'north', note: 'Tram switchback: praça -> tram street (walk-through tram, 11 m long) -> upper street -> miradouro. Mid-range.' },
    { id: 'mid', note: 'Tiled stair-street straight up the hill; tunnels at y 0 run beneath it into the cistern (U route between both praças).' },
    { id: 'south', note: 'Roof quarter: two-storey houses, terracotta roofs at 11.1 linked by plank/laundry-line crossings up to the miradouro edge.' },
  ],
  boxes: b.boxes, kit: b.kit,
  spawns: { alpha: sp(-61, -Math.PI / 2), bravo: sp(61, Math.PI / 2),
    ffa: [[-35, T + 0.6, 22], [35, T + 0.6, 22], [4, M, -5], [0, 0, 0], [-29, T, -8], [29, T, -8], [-31, T + 6.6, -26], [31, T + 6.6, -26], [-20, 6.75, 24], [20, 6.75, 24], [-56, 0, -20], [56, 0, 20]]
      .map(([x, y, z]) => ({ pos: [x, y, z] as [number, number, number], yaw: 0 })) },
  flags: [
    { id: 'A', pos: [-35, T, 30], radius: 5, note: 'Alpha tram stop: fight around the stalled tram.' },
    { id: 'B', pos: [0, M, -5], radius: 6, note: 'Miradouro crest over the well hole; cistern below gives a flank from U.' },
    { id: 'C', pos: [35, T, 30], radius: 5, note: 'Bravo tram stop (mirror of A).' },
  ],
  sightlines: [
    { from: [-14, M + 1.6, 0], to: [14, M + 1.6, 0], note: 'Across the miradouro: benches + well hole break it.' },
    { from: [-50, 1.6, -2], to: [-14, M + 1.6, -2], note: 'Up the stair-street from the praça to the crest: uphill duel, defender advantage.' },
    { from: [-44, T + 1.6, 22], to: [44, T + 1.6, 22], note: 'Tram street end-to-end is BROKEN by the miradouro mass (rises to 9), so north never becomes a sniper lane.' },
  ],
};
