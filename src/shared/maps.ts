// Multiplayer map definitions as axis-aligned boxes (collision + blockout render). Pure data.
// Each map has >= 3 play heights. Coordinates in metres, y up. Box = [minX,minY,minZ,maxX,maxY,maxZ].

export type Box = [number, number, number, number, number, number];
export interface Spawn { x: number; y: number; z: number; yaw: number; team: 0 | 1 | -1 }
export interface MapDef {
  id: string;
  name: string;
  city: string;
  bounds: Box;
  boxes: Box[];
  /** Palette index per box for the blockout renderer (parallel to boxes). */
  tints: number[];
  spawns: Spawn[];
  /** Domination flag points A, B, C. */
  flags: { x: number; y: number; z: number }[];
  sky: number;
  fog: number;
}

function builder() {
  const boxes: Box[] = [];
  const tints: number[] = [];
  const add = (b: Box, t = 0) => { boxes.push(b); tints.push(t); };
  /** Hollow building shell with a doorway gap on each side and a roof/floor slabs every `storey` metres. */
  const block = (x: number, z: number, w: number, d: number, h: number, t: number, roofWalk = true) => {
    add([x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2], t);
    if (roofWalk) add([x - w / 2 - 0.1, h, z - d / 2 - 0.1, x + w / 2 + 0.1, h + 0.9, z - d / 2 + 0.1], t + 1); // parapet
  };
  const stairs = (x: number, z: number, dx: number, dz: number, steps: number, rise: number, run: number, width: number, t = 5) => {
    for (let i = 0; i < steps; i++) {
      const cx = x + dx * run * i, cz = z + dz * run * i, top = rise * (i + 1);
      const hw = dx !== 0 ? run / 2 : width / 2, hd = dz !== 0 ? run / 2 : width / 2;
      add([cx - hw, 0, cz - hd, cx + hw, top, cz + hd], t);
    }
  };
  return { boxes, tints, add, block, stairs };
}

function perimeter(add: (b: Box, t?: number) => void, s: number, h = 14) {
  add([-s - 1, -1, -s - 1, s + 1, 0, s + 1], 9); // ground
  add([-s - 1, 0, -s - 1, s + 1, h, -s], 8);
  add([-s - 1, 0, s, s + 1, h, s + 1], 8);
  add([-s - 1, 0, -s, -s, h, s], 8);
  add([s, 0, -s, s + 1, h, s], 8);
}

function kowloon(): MapDef {
  const b = builder();
  perimeter(b.add, 40, 30);
  // Dense towers around a central sunken market; walkways at 6 m and 12 m.
  const towers: [number, number, number, number, number][] = [[-28, -28, 14, 14, 18], [0, -30, 12, 10, 24], [28, -28, 14, 14, 12], [-30, 0, 10, 16, 12], [30, 2, 10, 14, 18], [-26, 28, 16, 12, 24], [2, 30, 12, 10, 12], [28, 28, 14, 14, 18]];
  towers.forEach(([x, z, w, d, h], i) => b.block(x, z, w, d, h, (i % 3) + 1));
  b.add([-12, 0, -12, 12, -0.01, 12], 9);
  // Mid-level walkways (6 m)
  b.add([-21, 6, -2, 25, 6.5, 2], 6);
  b.add([-2, 6, -25, 2, 6.5, 25], 6);
  // High bridges (12 m) between tower roofs
  b.add([-21, 12, -30, -7, 12.5, -27], 7);
  b.add([23, 12, -1, 35, 12.5, 3], 7);
  // Market stalls (cover)
  for (let i = -2; i <= 2; i++) b.add([i * 5 - 1, 0, -6, i * 5 + 1, 1.1, -4], 4), b.add([i * 5 - 1, 0, 4, i * 5 + 1, 1.1, 6], 4);
  // Stair towers up to walkways
  b.stairs(-8, -14, 0, 1, 12, 0.5, 0.55, 2.4);
  b.stairs(8, 14, 0, -1, 12, 0.5, 0.55, 2.4);
  b.stairs(-16, 8, 1, 0, 12, 0.5, 0.55, 2.4);
  return {
    id: 'kowloon', name: 'Kowloon Stacks', city: 'Hong Kong', bounds: [-40, -1, -40, 40, 40, 40], ...b, sky: 0x2a3140, fog: 0x2a3140,
    spawns: [
      { x: -34, y: 0, z: -12, yaw: -Math.PI / 2, team: 0 }, { x: -34, y: 0, z: 12, yaw: -Math.PI / 2, team: 0 }, { x: -20, y: 0, z: -18, yaw: -Math.PI / 2, team: 0 },
      { x: 34, y: 0, z: -12, yaw: Math.PI / 2, team: 1 }, { x: 34, y: 0, z: 14, yaw: Math.PI / 2, team: 1 }, { x: 20, y: 0, z: 18, yaw: Math.PI / 2, team: 1 },
      { x: 0, y: 0, z: 0, yaw: 0, team: -1 }, { x: -14, y: 0, z: 34, yaw: Math.PI, team: -1 }, { x: 14, y: 0, z: -35, yaw: 0, team: -1 },
    ],
    flags: [{ x: -34, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 34, y: 0, z: 0 }].map((f, i) => (i === 1 ? f : { ...f, x: f.x * 0.55 })),
  };
}

function lisbon(): MapDef {
  const b = builder();
  perimeter(b.add, 45, 26);
  // A hill: terraced street rising 0 -> 4 -> 8 m along +z, tram line down the middle.
  b.add([-45, 0, 5, 45, 4, 45], 9);
  b.add([-45, 4, 25, 45, 8, 45], 9);
  // Steps between terraces
  b.stairs(-3, -2, 0, 1, 8, 0.5, 0.9, 6);
  b.stairs(-3, 18, 0, 1, 8, 0.5, 0.9, 6);
  for (let i = 0; i < 8; i++) b.add([-3, 4, 18 + i * 0.9 - 0.45, 3, 4 + (i + 1) * 0.5, 18 + i * 0.9 + 0.45], 5);
  // Tram car (cover) on each level
  b.add([10, 0, -20, 12.4, 3, -10], 3);
  b.add([-12, 4, 10, -9.6, 7, 20], 3);
  // Row houses with rooftop routes
  const houses: [number, number, number, number, number][] = [[-30, -25, 12, 10, 9], [30, -25, 12, 10, 7], [-30, 15, 12, 8, 12], [30, 15, 12, 8, 10], [-28, 36, 14, 8, 16], [26, 36, 14, 8, 14]];
  houses.forEach(([x, z, w, d, h], i) => b.block(x, z, w, d, h, (i % 3) + 1));
  b.add([-24, 9, -30, -22, 9.3, -20], 6);
  // Miradouro (viewpoint) platform high up
  b.add([-8, 8, 38, 8, 12, 44], 7);
  b.stairs(0, 26, 0, 1, 8, 0.5, 1.4, 4, 5);
  return {
    id: 'lisbon', name: 'Lisbon Tram Hill', city: 'Lisbon', bounds: [-45, -1, -45, 45, 40, 45], ...b, sky: 0x8fb6d9, fog: 0xb9cde0,
    spawns: [
      { x: 0, y: 0, z: -40, yaw: Math.PI, team: 0 }, { x: -20, y: 0, z: -38, yaw: Math.PI, team: 0 }, { x: 20, y: 0, z: -38, yaw: Math.PI, team: 0 },
      { x: 0, y: 8, z: 32, yaw: 0, team: 1 }, { x: -20, y: 8, z: 30, yaw: 0, team: 1 }, { x: 20, y: 8, z: 30, yaw: 0, team: 1 },
      { x: -38, y: 4, z: 0 + 10, yaw: -Math.PI / 2, team: -1 }, { x: 38, y: 4, z: 10, yaw: Math.PI / 2, team: -1 }, { x: 0, y: 0, z: -10, yaw: 0, team: -1 },
    ],
    flags: [{ x: 0, y: 0, z: -25 }, { x: 0, y: 4, z: 12 }, { x: 0, y: 8, z: 34 }],
  };
}

function rio(): MapDef {
  const b = builder();
  perimeter(b.add, 42, 30);
  // Favela ridge: stacked shacks climbing a slope, alleys between; the ridge top at 12 m.
  b.add([-42, 0, 0, 42, 3, 42], 9);
  b.add([-42, 3, 14, 42, 6, 42], 9);
  b.add([-42, 6, 26, 42, 9, 42], 9);
  b.add([-20, 9, 34, 20, 12, 42], 9);
  for (let row = 0; row < 4; row++) {
    const baseY = [0, 3, 6, 9][row], z = [-12, 8, 20, 30][row];
    for (let col = -3; col <= 3; col++) {
      if ((col + row) % 2 === 0) continue;
      const x = col * 11, h = 3 + ((col * 7 + row * 3) & 3);
      b.add([x - 3, baseY, z - 2.5, x + 3, baseY + h, z + 2.5], (row + col + 6) % 3 + 1);
    }
  }
  // Ramps/stairs up each tier through alleys
  for (const x of [-16, 16]) {
    b.stairs(x, -2, 0, 1, 6, 0.5, 0.6, 2.5);
    for (let i = 0; i < 6; i++) b.add([x - 1.25, 3, 10.4 + i * 0.6, x + 1.25, 3 + (i + 1) * 0.5, 11 + i * 0.6], 5);
    for (let i = 0; i < 6; i++) b.add([x - 1.25, 6, 22.4 + i * 0.6, x + 1.25, 6 + (i + 1) * 0.5, 23 + i * 0.6], 5);
  }
  for (let i = 0; i < 6; i++) b.add([-1.25, 9, 30.4 + i * 0.6, 1.25, 9 + (i + 1) * 0.5, 31 + i * 0.6], 5);
  // Water tanks on roofs (cover up high)
  b.add([-3, 12, 37, -1, 13.5, 39], 4);
  b.add([1, 12, 37, 3, 13.5, 39], 4);
  // Football pitch at the bottom (open lane) with goals as cover
  b.add([-6, 0, -34, 6, 2, -33], 4);
  return {
    id: 'rio', name: 'Rio Favela Ridge', city: 'Rio de Janeiro', bounds: [-42, -1, -42, 42, 40, 42], ...b, sky: 0xe7b37b, fog: 0xe0b58a,
    spawns: [
      { x: -30, y: 0, z: -36, yaw: Math.PI, team: 0 }, { x: 0, y: 0, z: -38, yaw: Math.PI, team: 0 }, { x: 30, y: 0, z: -36, yaw: Math.PI, team: 0 },
      { x: -12, y: 12, z: 38, yaw: 0, team: 1 }, { x: 12, y: 12, z: 38, yaw: 0, team: 1 }, { x: 30, y: 9, z: 38, yaw: 0, team: 1 },
      { x: -38, y: 3, z: 6, yaw: -Math.PI / 2, team: -1 }, { x: 38, y: 6, z: 18, yaw: Math.PI / 2, team: -1 }, { x: 0, y: 3, z: 4, yaw: 0, team: -1 },
    ],
    flags: [{ x: 0, y: 0, z: -25 }, { x: 0, y: 3, z: 4 }, { x: 0, y: 12, z: 36 }],
  };
}

export const MAPS: MapDef[] = [kowloon(), lisbon(), rio()];
export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));
