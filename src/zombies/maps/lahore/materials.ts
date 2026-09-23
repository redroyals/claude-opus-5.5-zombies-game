// Procedural PBR surface library for the Lahore Darbar (canvas-generated at load: zero download).
// Tileable 512 px sets at the engine's world-UV convention (1 UV = 2 m, see render/geom.worldBox), plus a few
// UV-mapped atlases (fresco panels, textiles, foliage, jaali lattice) used by the dressing.
//
// Albedo discipline: nothing is whiter than ~0.72 linear (marble ~0.62), so lit marble stays under the bloom
// threshold and the post-power lamps cannot blow the court out to white.
import * as THREE from 'three';
import type { Surf } from './layout';

type RGB = [number, number, number];
const SIZE = 512;

/** Small tileable value noise (hash lattice). */
function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = (x: number, y: number, per: number) => perm[(perm[((x % per) + per) % per & 255] + (((y % per) + per) % per & 255)) & 511] / 255;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const n2 = (x: number, y: number, per: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    const a = val(xi, yi, per), b = val(xi + 1, yi, per), c = val(xi, yi + 1, per), d = val(xi + 1, yi + 1, per);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  /** fbm over [0,1)^2 with `f` base cells, tileable. */
  return (u: number, v: number, f: number, oct = 4) => {
    let amp = 0.5, sum = 0, norm = 0, fr = f;
    for (let o = 0; o < oct; o++) { sum += amp * n2(u * fr, v * fr, fr); norm += amp; amp *= 0.5; fr *= 2; }
    return sum / norm;
  };
}

interface Gen {
  rgb: (u: number, v: number) => RGB; h: (u: number, v: number) => number; rough: (u: number, v: number, h: number) => number; normal: number;
  metal?: (u: number, v: number) => number; alpha?: (u: number, v: number) => number; emit?: (u: number, v: number) => number; size?: number;
}
interface Raw { col: Uint8Array; rgh: Uint8Array; nor: Uint8Array; n: number }

/** Bake a generator into raw RGBA arrays: albedo (+alpha), rough(G)/metal(B)/emissive-mask(R), tangent normal. */
function bake(g: Gen): Raw {
  const n = g.size ?? SIZE;
  const col = new Uint8Array(n * n * 4), rgh = new Uint8Array(n * n * 4), nor = new Uint8Array(n * n * 4);
  const hgt = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const h = g.h(u, v);
    hgt[i] = h;
    const [r, gg, b] = g.rgb(u, v);
    col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = g.alpha ? g.alpha(u, v) * 255 : 255;
    const ro = Math.max(0, Math.min(1, g.rough(u, v, h))) * 255;
    const me = g.metal ? Math.max(0, Math.min(1, g.metal(u, v))) * 255 : 0;
    const em = g.emit ? Math.max(0, Math.min(1, g.emit(u, v))) * 255 : 0;
    rgh[i * 4] = em; rgh[i * 4 + 1] = ro; rgh[i * 4 + 2] = me; rgh[i * 4 + 3] = 255;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    const l = hgt[y * n + ((x - 1 + n) % n)], r = hgt[y * n + ((x + 1) % n)], u = hgt[((y - 1 + n) % n) * n + x], d = hgt[((y + 1) % n) * n + x];
    let nx = (l - r) * g.normal, ny = (u - d) * g.normal;
    const len = Math.hypot(nx, ny, 1);
    nx /= len; ny /= len;
    nor[i * 4] = (nx * 0.5 + 0.5) * 255; nor[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nor[i * 4 + 2] = (0.5 / len + 0.5) * 255; nor[i * 4 + 3] = 255;
  }
  return { col, rgh, nor, n };
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const frac = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => frac(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);

/** Running-bond block pattern: returns [mortar 0..1, block id hash, local u, local v]. */
function blocks(u: number, v: number, cols: number, rows: number, mortar: number): [number, number, number, number] {
  const row = Math.floor(v * rows);
  const off = row % 2 ? 0.5 : 0;
  const cu = u * cols + off, col = Math.floor(cu);
  const lu = frac(cu), lv = frac(v * rows);
  const mu = mortar * cols, mv = mortar * rows;
  const m = Math.max(1 - Math.min(lu, 1 - lu) / mu, 1 - Math.min(lv, 1 - lv) / mv, 0);
  const id = hash(((col % cols) + cols) % cols, row);
  return [Math.min(1, m), id, lu, lv];
}

/** Stylised 8-petal flower (pietra dura / fresco motif) at local coords centred on 0 (radius ~1). */
function flower(x: number, y: number): number {
  const r = Math.hypot(x, y), a = Math.atan2(y, x);
  const petal = 0.55 + 0.45 * Math.abs(Math.cos(a * 4));
  return r < petal ? (r < 0.22 ? 2 : 1) : 0;
}

function gens(): Record<string, Gen> {
  const N = makeNoise(7), N2 = makeNoise(19), N3 = makeNoise(31);
  // 1 texture tile = 2 m.
  return {
    sandstone: { // Lahore red sandstone ashlar: 5 courses x 2 blocks per 2 m, tooled faces, soft weathering
      rgb: (u, v) => {
        const [m, id, lu, lv] = blocks(u, v, 2, 5, 0.01);
        const g = N(u, v, 8, 5), s = N2(u * 0.3 + v, v * 3, 4, 3), tool = N3(u * 6, lv * 2, 16, 2);
        let c = mix([128, 64, 48], [158, 86, 64], id * 0.55 + g * 0.45);
        c = mix(c, [96, 50, 40], s * 0.35);
        c = mix(c, [172, 118, 92], Math.max(0, tool - 0.6) * 0.8); // pale tooling streaks
        const edge = Math.min(lu, 1 - lu, lv * 2.5, (1 - lv) * 2.5);
        c = mul(c, 0.9 + 0.1 * Math.min(1, edge * 12));
        return mix(c, [150, 128, 110], m * 0.85); // lime pointing
      },
      h: (u, v) => { const [m, , lu, lv] = blocks(u, v, 2, 5, 0.01); const e = Math.min(lu, 1 - lu, lv * 2.5, (1 - lv) * 2.5); return 1 - m * 0.9 - (1 - Math.min(1, e * 10)) * 0.15 + N(u, v, 24, 3) * 0.15; },
      rough: (u, v) => 0.8 + N3(u, v, 8, 2) * 0.12, normal: 3,
    },
    marble: { // Makrana marble, ivory with soft grey veins (kept below ~0.62 linear)
      rgb: (u, v) => {
        const w = N(u, v, 3, 5), vein = Math.abs(Math.sin((u * 3 + v * 2 + w * 3.5) * Math.PI * 2));
        const vn = Math.pow(1 - vein, 14);
        const [m] = blocks(u, v, 1, 2, 0.004);
        let c = mix([196, 188, 172], [212, 205, 190], N2(u, v, 6, 3));
        c = mix(c, [130, 128, 132], vn * 0.5);
        c = mix(c, [176, 160, 136], Math.max(0, N3(u, v, 4, 3) - 0.55) * 0.9); // age patina
        return mix(c, [150, 142, 130], m * 0.6);
      },
      h: (u, v) => 1 - blocks(u, v, 1, 2, 0.004)[0] * 0.6, rough: (u, v) => 0.28 + N3(u, v, 6, 2) * 0.15, normal: 1.2,
    },
    inlay: { // marble floor with pietra-dura star/octagon inlay (1 tile = 2 m = 2x2 panels)
      rgb: (u, v) => {
        const pu = frac(u * 2) - 0.5, pv = frac(v * 2) - 0.5;
        const r = Math.max(Math.abs(pu), Math.abs(pv)), d = Math.abs(pu) + Math.abs(pv);
        const star = Math.min(r * 1.0, d * 0.72);
        let c: RGB = mix([194, 186, 170], [206, 198, 184], N(u, v, 8, 3));
        if (r > 0.46) c = [104, 34, 32]; // carnelian border band
        else if (r > 0.44) c = [168, 136, 70];
        else if (star < 0.2) c = star < 0.12 ? [40, 78, 62] : [168, 136, 70]; // jade star, gold outline
        else if (Math.abs(star - 0.3) < 0.012) c = [60, 58, 66];
        const vein = Math.pow(1 - Math.abs(Math.sin((u * 5 + N2(u, v, 4, 4) * 3) * 6.28)), 18);
        return mix(mix(c, [140, 140, 146], vein * 0.2), [150, 132, 110], Math.max(0, N3(u, v, 4, 3) - 0.6) * 0.8);
      },
      h: (u, v) => { const pu = frac(u * 2) - 0.5, pv = frac(v * 2) - 0.5; return Math.max(Math.abs(pu), Math.abs(pv)) > 0.46 ? 0.6 : 1; },
      rough: () => 0.24, normal: 0.8,
    },
    pdura: { // trim: white marble with a close field of pietra-dura flowers (carnelian, jade, lapis, gold)
      rgb: (u, v) => {
        const k = 8, cu = frac(u * k) * 2 - 1, cv = frac(v * k) * 2 - 1, id = hash(Math.floor(u * k), Math.floor(v * k));
        const f = flower(cu * 1.25, cv * 1.25);
        let c: RGB = mix([196, 188, 172], [208, 200, 186], N(u, v, 8, 3));
        if (f === 2) c = [176, 140, 60];
        else if (f === 1) c = id < 0.33 ? [118, 36, 32] : id < 0.66 ? [44, 84, 64] : [44, 58, 104];
        else if (Math.abs(Math.abs(cu) - Math.abs(cv)) < 0.05 && Math.hypot(cu, cv) > 0.8) c = [60, 90, 60]; // leaves
        return c;
      },
      h: (u, v) => { const k = 8; return flower((frac(u * k) * 2 - 1) * 1.25, (frac(v * k) * 2 - 1) * 1.25) ? 0.9 : 1; },
      rough: () => 0.25, normal: 0.6,
    },
    brick: { // Nanakshahi: thin small bricks, lime mortar. 2 m = 36 courses x 9 bricks
      rgb: (u, v) => {
        const [m, id] = blocks(u, v, 9, 36, 0.006);
        let c = mix([128, 66, 48], [156, 90, 64], id);
        if (id > 0.9) c = [96, 52, 42]; // over-burnt headers
        c = mix(c, [96, 56, 44], N(u, v, 16, 3) * 0.4);
        c = mix(c, [150, 138, 118], Math.max(0, N2(u, v, 3, 4) - 0.62) * 1.4); // lime bloom
        return mix(c, [168, 156, 132], m * 0.9);
      },
      h: (u, v) => 1 - blocks(u, v, 9, 36, 0.006)[0] + N(u, v, 32, 2) * 0.15, rough: () => 0.9, normal: 3,
    },
    plasterOchre: { // lime plaster, ochre wash, water stains, patches of exposed brick
      rgb: (u, v) => {
        const g = N(u, v, 4, 5), st = Math.max(0, N2(u * 1.5, v * 0.5, 3, 4) - 0.55) * 2.2;
        let c = mix([190, 150, 96], [206, 170, 116], g);
        c = mix(c, [130, 100, 72], Math.min(1, st + Math.max(0, v - 0.85) * 1.2 * N3(u, v, 12, 2)));
        const spall = N3(u, v, 5, 4);
        if (spall > 0.72) { const [m, id] = blocks(u, v, 9, 36, 0.006); c = mix(mix([128, 66, 48], [150, 86, 60], id), [150, 136, 116], m); }
        return c;
      },
      h: (u, v) => N(u, v, 16, 4) * 0.5 + (N3(u, v, 5, 4) > 0.72 ? 0.2 : 0.5), rough: () => 0.92, normal: 1.6,
    },
    plasterBlue: { // indigo lime wash (the Naqqar Khana)
      rgb: (u, v) => { const g = N(u, v, 4, 5), st = Math.max(0, N2(u, v * 0.6, 3, 4) - 0.55) * 2; return mix(mix([70, 92, 124], [92, 116, 146], g), [60, 66, 80], Math.min(1, st)); },
      h: (u, v) => N(u, v, 16, 4), rough: () => 0.92, normal: 1.5,
    },
    plaster: {
      rgb: (u, v) => mix([190, 180, 160], [204, 196, 178], N(u, v, 4, 5)),
      h: (u, v) => N(u, v, 16, 4), rough: () => 0.9, normal: 1.2,
    },
    garden: { // clipped lawn with faint mowing bands
      rgb: (u, v) => { const g = N(u, v, 10, 5), p = N2(u, v, 3, 3); return mix(mix([46, 66, 32], [74, 94, 44], g), [96, 88, 60], Math.max(0, p - 0.66) * 2); },
      h: (u, v) => N(u, v, 32, 3), rough: () => 0.95, normal: 2,
    },
    paving: { // large sandstone flags
      rgb: (u, v) => { const [m, id] = blocks(u, v, 2, 2, 0.008); return mix(mix([140, 80, 60], [164, 104, 80], id * 0.7 + N(u, v, 8, 4) * 0.3), [76, 58, 50], m); },
      h: (u, v) => 1 - blocks(u, v, 2, 2, 0.008)[0], rough: () => 0.8, normal: 2,
    },
    cobble: { // brick-on-edge lane paving, worn
      rgb: (u, v) => {
        const [m, id] = blocks(u, v, 6, 12, 0.02);
        return mix(mix(mix([104, 64, 50], [132, 86, 64], id), [80, 70, 60], N(u, v, 6, 3) * 0.5), [58, 50, 44], m * 0.9);
      },
      h: (u, v) => 1 - blocks(u, v, 6, 12, 0.02)[0] * 0.9, rough: () => 0.88, normal: 3,
    },
    dirt: { rgb: (u, v) => mix([84, 70, 54], [112, 94, 72], N(u, v, 8, 5)), h: (u, v) => N(u, v, 24, 4), rough: () => 1, normal: 2 },
    stoneDark: {
      rgb: (u, v) => { const [m, id] = blocks(u, v, 3, 5, 0.01); return mix(mix([62, 58, 56], [86, 78, 72], id * 0.6 + N(u, v, 8, 4) * 0.4), [36, 34, 32], m); },
      h: (u, v) => 1 - blocks(u, v, 3, 5, 0.01)[0], rough: () => 0.75, normal: 2.5,
    },
    terrace: { // lime-washed roof terrace with square tiles
      rgb: (u, v) => { const [m, id] = blocks(u, v, 5, 5, 0.01); return mix(mix([164, 146, 120], [182, 166, 138], id * 0.5 + N(u, v, 8, 3) * 0.5), [110, 98, 82], m); },
      h: (u, v) => 1 - blocks(u, v, 5, 5, 0.01)[0], rough: () => 0.9, normal: 2,
    },
    wood: { // weathered deodar/teak planks
      rgb: (u, v) => { const pl = Math.floor(u * 8), gr = N(u * 8, v * 0.5, 4, 4); const c = mix([66, 42, 26], [96, 64, 38], hash(pl, 3) * 0.5 + gr * 0.5); return frac(u * 8) < 0.03 ? mul(c, 0.5) : c; },
      h: (u, v) => (frac(u * 8) < 0.03 ? 0 : 1) * 0.6 + N(u * 8, v * 0.5, 4, 3) * 0.4, rough: () => 0.72, normal: 2,
    },
    mirror: { // Sheesh Mahal ayina-kari: gilded stucco ground with convex mirror chips in rosettes, diamonds and borders
      rgb: (u, v) => { const c = mirrorCell(u, v); return c > 0 ? mix([206, 204, 196], [240, 236, 222], hash(Math.floor(u * 64), Math.floor(v * 64))) : mix([160, 112, 44], [188, 136, 58], N(u, v, 12, 3)); },
      h: (u, v) => (mirrorCell(u, v) > 0 ? 1 : 0.25) + N(u * 3, v * 3, 16, 2) * 0.1,
      rough: (u, v) => (mirrorCell(u, v) > 0 ? 0.22 + hash(Math.floor(u * 64), Math.floor(v * 64)) * 0.14 : 0.55),
      metal: (u, v) => (mirrorCell(u, v) > 0 ? 0.45 : 0.3),
      emit: (u, v) => (mirrorCell(u, v) > 0 ? 0.3 + 0.7 * hash(Math.floor(u * 64) + 3, Math.floor(v * 64)) : 0),
      normal: 5,
    },
    shade: { // dark recess field (niches, window reveals)
      rgb: (u, v) => mix([86, 62, 50], [104, 78, 62], N(u, v, 6, 3)), h: (u, v) => N(u, v, 16, 3), rough: () => 0.95, normal: 1,
    },
    brass: { rgb: (u, v) => mix([150, 112, 52], [176, 136, 66], N(u, v, 8, 3)), h: (u, v) => N(u, v, 32, 2), rough: (u, v) => 0.3 + N2(u, v, 8, 2) * 0.2, metal: () => 1, normal: 0.6 },
    iron: { rgb: (u, v) => mix([40, 36, 34], [64, 56, 50], N(u, v, 8, 4)), h: (u, v) => N(u, v, 24, 3), rough: () => 0.62, metal: () => 0.8, normal: 1 },
    woodPaint: { // green-painted shutters, worn through to wood at the edges of the planks
      rgb: (u, v) => { const wear = Math.max(0, N(u * 3, v, 8, 4) - 0.62) * 2.5; return mix(mix([56, 96, 74], [70, 112, 86], N2(u, v, 6, 3)), [92, 62, 38], Math.min(1, wear)); },
      h: (u, v) => (frac(u * 8) < 0.03 ? 0.2 : 1) - Math.max(0, N(u * 3, v, 8, 4) - 0.62), rough: () => 0.7, normal: 1.5,
    },
    cloth: { rgb: (u, v) => mix([110, 26, 30], [132, 36, 36], N(u * 4, v * 4, 16, 3)), h: (u, v) => (frac(u * 64) < 0.5 ? 1 : 0.8) * (frac(v * 64) < 0.5 ? 1 : 0.9), rough: () => 0.95, normal: 0.8 },
    bark: { rgb: (u, v) => mix([70, 58, 46], [104, 92, 76], N(u * 2, v * 0.4, 8, 5)), h: (u, v) => N(u * 6, v * 0.8, 8, 4), rough: () => 0.95, normal: 3 },
  };
}

/** Sheesh Mahal mosaic layout: > 0 on a mirror chip. 1 tile = 2 m; 4 rosettes per tile with diamonds between. */
function mirrorCell(u: number, v: number): number {
  const k = 2, cu = frac(u * k) - 0.5, cv = frac(v * k) - 0.5; // rosette cell, 1 m
  const r = Math.hypot(cu, cv), a = Math.atan2(cv, cu);
  // concentric petal rings of chips
  for (const [r0, n] of [[0.06, 6], [0.13, 12], [0.21, 18], [0.3, 24]] as const) {
    if (Math.abs(r - r0) < 0.028) { const t = frac((a / (2 * Math.PI)) * n); if (t > 0.12 && t < 0.88) return 1; }
  }
  if (r < 0.03) return 1;
  // diamond chips on the lattice between rosettes
  const du = Math.abs(cu) - 0.5, dv = Math.abs(cv) - 0.5;
  if (Math.abs(du) + Math.abs(dv) < 0.08) return 1;
  // border lines of tiny square chips
  if (Math.abs(Math.abs(cu) - 0.44) < 0.012 || Math.abs(Math.abs(cv) - 0.44) < 0.012) { if (frac((cu + cv) * 40) > 0.4) return 1; }
  return 0;
}

// ------------------------------------------------------------------------------------------------
// UV atlases (0..1 per panel): frescoes, textiles, foliage, jaali
// ------------------------------------------------------------------------------------------------
function canvasTex(n: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Cusped arch path in a w x h box (0,0 top-left). */
function archPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const spring = y + h * 0.42;
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, spring);
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n, uu = 2 * t - 1;
    const by = spring - (spring - y) * Math.cos((Math.PI / 2) * Math.abs(uu) ** 1.7);
    const bump = 0.06 * h * Math.sin(Math.PI * t) ** 0.6 * Math.sin(7 * Math.PI * t);
    g.lineTo(x + w * t, by + bump);
  }
  g.lineTo(x + w, y + h);
  g.closePath();
}

/** Four 512 px fresco panels: vase of flowers in a cusped niche, flowering tree, vine scroll, geometric star. */
function frescoAtlas(): THREE.CanvasTexture {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return canvasTex(1024, (g) => {
    const lime = '#c9b894', ochre = '#a4642e', red = '#8a2e24', green = '#3e5a36', indigo = '#2e3e62', black = '#2a221c', gold = '#b08a3c';
    const panel = (px: number, py: number, fn: () => void) => {
      g.save(); g.translate(px, py);
      g.fillStyle = lime; g.fillRect(0, 0, 512, 512);
      // aged speckle
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(90,70,50,${rnd() * 0.08})`; g.fillRect(rnd() * 512, rnd() * 512, 2 + rnd() * 6, 2 + rnd() * 6); }
      g.strokeStyle = red; g.lineWidth = 14; g.strokeRect(12, 12, 488, 488);
      g.strokeStyle = gold; g.lineWidth = 4; g.strokeRect(26, 26, 460, 460);
      fn();
      g.restore();
    };
    const bloom = (x: number, y: number, r: number, c: string) => {
      g.fillStyle = c;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.45, r * 0.3, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = gold; g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill();
    };
    const leaf = (x: number, y: number, a: number, s: number) => { g.fillStyle = green; g.beginPath(); g.ellipse(x, y, s, s * 0.35, a, 0, Math.PI * 2); g.fill(); };
    // 1: vase of flowers in a cusped niche
    panel(0, 0, () => {
      g.fillStyle = '#b8a47c'; archPath(g, 90, 60, 332, 400); g.fill();
      g.strokeStyle = red; g.lineWidth = 6; archPath(g, 90, 60, 332, 400); g.stroke();
      g.fillStyle = indigo; g.beginPath(); g.moveTo(206, 440); g.bezierCurveTo(160, 380, 196, 330, 230, 320); g.lineTo(282, 320); g.bezierCurveTo(316, 330, 352, 380, 306, 440); g.closePath(); g.fill();
      g.strokeStyle = green; g.lineWidth = 5;
      for (let i = 0; i < 9; i++) { const ex = 256 + (i - 4) * 32, ey = 150 + Math.abs(i - 4) * 22; g.beginPath(); g.moveTo(256, 320); g.quadraticCurveTo(256 + (i - 4) * 10, 240, ex, ey); g.stroke(); leaf((256 + ex) / 2 + 10, (320 + ey) / 2, 0.8 * (i - 4) / 4, 18); bloom(ex, ey, 20, i % 3 === 0 ? red : i % 3 === 1 ? ochre : '#c05a3a'); }
    });
    // 2: flowering tree
    panel(512, 0, () => {
      g.fillStyle = '#5a3a24'; g.fillRect(244, 250, 24, 220);
      for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 150; leaf(256 + Math.cos(a) * r, 190 + Math.sin(a) * r * 0.75, a, 16); }
      for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 140; bloom(256 + Math.cos(a) * r, 190 + Math.sin(a) * r * 0.75, 11, rnd() > 0.5 ? red : '#d0a050'); }
      g.fillStyle = green; g.fillRect(60, 468, 392, 14);
    });
    // 3: vine scroll
    panel(0, 512, () => {
      g.strokeStyle = green; g.lineWidth = 7;
      for (let row = 0; row < 3; row++) {
        g.beginPath();
        for (let x = 40; x <= 472; x += 4) { const y = 110 + row * 145 + Math.sin(x / 42) * 38; if (x === 40) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
        for (let x = 60; x < 470; x += 64) { const y = 110 + row * 145 + Math.sin(x / 42) * 38; leaf(x + 12, y - 20, -0.6, 16); leaf(x + 26, y + 18, 0.6, 14); bloom(x + 32, y - 4, 13, row === 1 ? indigo : red); }
      }
    });
    // 4: geometric star lattice
    panel(512, 512, () => {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const cx = 88 + i * 112, cy = 88 + j * 112;
        g.fillStyle = (i + j) % 2 ? indigo : red;
        g.beginPath();
        for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, r = k % 2 ? 22 : 48; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        g.closePath(); g.fill();
        g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = black; g.lineWidth = 2;
      for (let k = 32; k < 512; k += 56) { g.beginPath(); g.moveTo(k, 32); g.lineTo(k, 480); g.stroke(); }
    });
  });
}

/** Four 512 px textiles: red/cream awning stripes, indigo block print, embroidered geometric, a carpet. */
function textileAtlas(): THREE.CanvasTexture {
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return canvasTex(1024, (g) => {
    // 1 stripes
    for (let x = 0; x < 512; x += 32) { g.fillStyle = (x / 32) % 2 ? '#d8c8a0' : '#9a2a22'; g.fillRect(x, 0, 32, 512); }
    for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(40,20,10,${rnd() * 0.06})`; g.fillRect(rnd() * 512, rnd() * 512, 3, 3); }
    // 2 indigo block print
    g.fillStyle = '#2a3a64'; g.fillRect(512, 0, 512, 512);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const cx = 512 + 32 + i * 64 + (j % 2) * 32, cy = 32 + j * 64;
      g.fillStyle = '#d8d0b8';
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 8, 4, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#b8402a'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
    }
    // 3 embroidered geometric (bright silk on madder red)
    g.fillStyle = '#7a1e1c'; g.fillRect(0, 512, 512, 512);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const cx = 43 + i * 85, cy = 512 + 43 + j * 85;
      g.fillStyle = (i + j) % 2 ? '#e0a030' : '#e8c060';
      g.beginPath(); g.moveTo(cx, cy - 36); g.lineTo(cx + 36, cy); g.lineTo(cx, cy + 36); g.lineTo(cx - 36, cy); g.closePath(); g.fill();
      g.fillStyle = '#2e6a4a'; g.fillRect(cx - 8, cy - 8, 16, 16);
    }
    // 4 carpet: madder field, indigo border, central medallion
    g.fillStyle = '#6a1c1a'; g.fillRect(512, 512, 512, 512);
    g.fillStyle = '#1e2a4a'; g.fillRect(512, 512, 512, 56); g.fillRect(512, 968, 512, 56); g.fillRect(512, 512, 56, 512); g.fillRect(968, 512, 56, 512);
    g.strokeStyle = '#c89a4a'; g.lineWidth = 6; g.strokeRect(572, 572, 392, 392);
    for (let k = 0; k < 24; k++) { const x = 512 + 28 + (k % 12) * 42, yy = k < 12 ? 540 : 996; g.fillStyle = '#c89a4a'; g.beginPath(); g.arc(x, yy, 8, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#1e2a4a'; g.beginPath(); g.ellipse(768, 768, 130, 170, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c89a4a'; g.beginPath(); g.ellipse(768, 768, 70, 96, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6a1c1a'; g.beginPath(); g.ellipse(768, 768, 36, 50, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 90; i++) { g.fillStyle = rnd() > 0.5 ? '#2e5a3a' : '#c89a4a'; const x = 600 + rnd() * 336, y = 600 + rnd() * 336; if (Math.hypot((x - 768) / 140, (y - 768) / 180) > 1) g.fillRect(x, y, 8, 8); }
  });
}

/** Leaf-cluster cards (alpha) for cypress (left half) and chinar/plane canopy (right half). */
function foliageAtlas(): THREE.CanvasTexture {
  let seed = 21;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const t = canvasTex(512, (g) => {
    g.clearRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) { // cypress: dense scale-leaf sprays in a flame outline
      const y = rnd() * 512, w = 110 * Math.sin(Math.PI * Math.min(1, y / 512 * 1.05)) ** 0.8, x = 128 + (rnd() * 2 - 1) * w;
      const c = 30 + rnd() * 40;
      g.fillStyle = `rgb(${c * 0.55},${c + 18},${c * 0.6})`;
      g.beginPath(); g.ellipse(x, y, 5 + rnd() * 6, 3 + rnd() * 4, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 260; i++) { // chinar: big palmate leaves in a rounded clump
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 110, x = 384 + Math.cos(a) * r, y = 256 + Math.sin(a) * r * 0.9;
      const c = 50 + rnd() * 50;
      g.fillStyle = `rgb(${c * 0.7},${c + 30},${c * 0.45})`;
      g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI * 2);
      g.beginPath();
      for (let k = 0; k < 10; k++) { const aa = (k / 10) * Math.PI * 2, rr = k % 2 ? 7 : 14; g.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
      g.closePath(); g.fill(); g.restore();
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Pierced marble jaali: interlocking 8-point stars (alpha), 1 tile = 1 m. */
function jaaliAlpha(): THREE.CanvasTexture {
  const t = canvasTex(256, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#000';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const cx = 32 + i * 64, cy = 32 + j * 64;
      g.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, r = k % 2 ? 13 : 24; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fill();
      g.beginPath(); g.arc(cx + 32, cy + 32, 7, 0, Math.PI * 2); g.fill();
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Every tiling surface of the map lives in one set of texture arrays (albedo / rough-metal-emit / normal), sampled
 * by layer. One shader, one material for all merged architecture: a whole cell of masonry, woodwork and metal
 * is a single draw. `surf[k]` are clones with a fixed layer (the engine's own walls and floors use them; they
 * carry no `layer` attribute); the merged dressing uses `arch` with a per-vertex `layer` attribute.
 */
export const LAYERS = ['sandstone', 'marble', 'inlay', 'pdura', 'brick', 'plaster', 'plasterOchre', 'plasterBlue', 'garden', 'paving', 'cobble', 'dirt',
  'stoneDark', 'terrace', 'wood', 'mirror', 'shade', 'brass', 'iron', 'woodPaint', 'cloth', 'bark'] as const;
export type Layer = (typeof LAYERS)[number];
/** Layers that are metals: their metalness comes from the texture's B channel. */
const METAL_LAYERS = new Set<Layer>(['mirror', 'brass', 'iron']);

export interface LahoreMaterials {
  /** Fixed-layer materials, one per surface (engine-facing, also the merge keys of the dressing). */
  surf: Record<Surf, THREE.MeshStandardMaterial>;
  brass: THREE.MeshStandardMaterial; iron: THREE.MeshStandardMaterial; woodPaint: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial; bark: THREE.MeshStandardMaterial; shade: THREE.MeshStandardMaterial; pdura: THREE.MeshStandardMaterial;
  /** The per-vertex-layer material used by merged chunks. */
  arch: THREE.MeshStandardMaterial;
  /** Layer index of a fixed-layer material (undefined if it is not an arch material). */
  layerOf(m: THREE.Material): number | undefined;
  paper: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial;
  /** UV-atlas materials: 2x2 panels each. */
  fresco: THREE.MeshStandardMaterial; textile: THREE.MeshStandardMaterial; foliage: THREE.MeshStandardMaterial;
  jaaliMarble: THREE.MeshStandardMaterial; jaaliStone: THREE.MeshStandardMaterial;
  /** Mirror-chip sparkle after power (emissive only on the chips, capped). */
  setPower(on: boolean): void;
}

function arrayTex(raws: Raw[], key: 'col' | 'rgh' | 'nor', srgb: boolean): THREE.DataArrayTexture {
  const n = raws[0].n;
  const data = new Uint8Array(n * n * 4 * raws.length);
  raws.forEach((r, i) => data.set(r[key], i * n * n * 4));
  const t = new THREE.DataArrayTexture(data, n, n, raws.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

let cached: LahoreMaterials | null = null;
export function lahoreMaterials(): LahoreMaterials {
  if (cached) return cached;
  const G = gens();
  const raws = LAYERS.map((k) => bake(G[k]));
  const shared = {
    tAlb: { value: arrayTex(raws, 'col', true) },
    tRgh: { value: arrayTex(raws, 'rgh', false) },
    tNrm: { value: arrayTex(raws, 'nor', false) },
    uMetal: { value: LAYERS.map((k) => (METAL_LAYERS.has(k) ? 1 : 0)) },
    uGlow: { value: 0.0 },
    uGlowColor: { value: new THREE.Color(0xffe2b8) },
  };
  const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummy.needsUpdate = true;
  const MIRROR = LAYERS.indexOf('mirror');
  const make = (layer: number, name: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ map: dummy, normalMap: dummy, roughnessMap: dummy, roughness: 1, metalness: 1, name, ...extra });
    const uLayer = { value: layer };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, shared, { uLayer });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float layer;\nvarying float vLayer;\nuniform float uLayer;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLayer = uLayer >= 0.0 ? uLayer : layer;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform highp sampler2DArray tAlb, tRgh, tNrm;
uniform float uMetal[${LAYERS.length}];
uniform float uGlow;
uniform vec3 uGlowColor;
varying float vLayer;`)
        .replace('#include <map_fragment>', 'float lay = floor(vLayer + 0.5);\ndiffuseColor *= texture(tAlb, vec3(vMapUv, lay));')
        .replace('#include <roughnessmap_fragment>', 'vec4 texRMA = texture(tRgh, vec3(vRoughnessMapUv, lay));\nfloat roughnessFactor = roughness * texRMA.g;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = uMetal[int(lay)] * texRMA.b;')
        .replace(/texture2D\( normalMap, vNormalMapUv \)/g, 'texture(tNrm, vec3(vNormalMapUv, lay))')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uGlowColor * uGlow * texRMA.r * (abs(lay - ${MIRROR}.0) < 0.5 ? 1.0 : 0.0);`);
    };
    m.customProgramCacheKey = () => 'lahore-arch-v1';
    return m;
  };
  const surf = {} as Record<Surf, THREE.MeshStandardMaterial>;
  const byLayer = new Map<THREE.Material, number>();
  const fixed = (k: Layer) => { const m = make(LAYERS.indexOf(k), `lh:${k}`, { envMapIntensity: k === 'mirror' ? 1.5 : k === 'marble' || k === 'inlay' || k === 'pdura' ? 0.8 : 1 }); byLayer.set(m, LAYERS.indexOf(k)); return m; };
  for (const k of ['sandstone', 'marble', 'inlay', 'brick', 'plaster', 'plasterOchre', 'plasterBlue', 'garden', 'paving', 'cobble', 'dirt', 'stoneDark', 'terrace', 'wood', 'mirror'] as const) surf[k] = fixed(k);
  const arch = make(-1, 'lh:arch');
  const jaali = (color: number, name: string) => new THREE.MeshStandardMaterial({ color, alphaMap: jaaliAlpha(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, name });
  cached = {
    surf, arch,
    brass: fixed('brass'), iron: fixed('iron'), woodPaint: fixed('woodPaint'), cloth: fixed('cloth'), bark: fixed('bark'), shade: fixed('shade'), pdura: fixed('pdura'),
    layerOf: (m) => byLayer.get(m),
    paper: new THREE.MeshStandardMaterial({ color: 0xd8c890, roughness: 0.9, side: THREE.DoubleSide, name: 'lh:paper' }),
    water: new THREE.MeshStandardMaterial({ color: 0x1a3036, metalness: 0.3, roughness: 0.06, transparent: true, opacity: 0.88, name: 'lh:water' }),
    fresco: new THREE.MeshStandardMaterial({ map: frescoAtlas(), roughness: 0.9, name: 'lh:fresco' }),
    textile: new THREE.MeshStandardMaterial({ map: textileAtlas(), roughness: 0.95, side: THREE.DoubleSide, name: 'lh:textile' }),
    foliage: new THREE.MeshStandardMaterial({ map: foliageAtlas(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, name: 'lh:foliage' }),
    jaaliMarble: jaali(0xc8bfae, 'lh:jaaliMarble'), jaaliStone: jaali(0x9a5a44, 'lh:jaaliStone'),
    setPower(on) { shared.uGlow.value = on ? 0.7 : 0.12; },
  };
  shared.uGlow.value = 0.12;
  return cached;
}

/** Resolve a kit GLB material slot name ('stone', 'trim', 'plaster', ...) to a shared material. */
export function kitSlot(M: LahoreMaterials, slot: string, stone: Surf = 'sandstone', trim: Surf = 'marble'): THREE.Material | null {
  const base = slot.replace(/\.\d+$/, '');
  switch (base) {
    case 'stone': return M.surf[stone];
    case 'trim': return M.surf[trim];
    case 'plaster': return M.surf.plasterOchre;
    case 'wood': return M.surf.wood;
    case 'woodPaint': return M.woodPaint;
    case 'metal': return M.brass;
    case 'iron': return M.iron;
    case 'mirror': return M.surf.mirror;
    case 'cloth': return M.cloth;
    case 'paper': return M.paper;
    case 'shade': return M.shade;
    case 'inlay': return M.pdura;
    default: return null;
  }
}
