// Procedural PBR surface library for the Lahore Darbar (canvas-generated at load: zero download).
// Tileable 512 px sets at the engine's world-UV convention (1 UV = 2 m, see render/geom.worldBox).
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

interface Gen { rgb: (u: number, v: number) => RGB; h: (u: number, v: number) => number; rough: (u: number, v: number, h: number) => number; normal: number }

function bake(g: Gen): { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } {
  const n = SIZE;
  const buf = () => new Uint8ClampedArray(new ArrayBuffer(n * n * 4));
  const col = buf(), rgh = buf(), nor = buf();
  const hgt = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const h = g.h(u, v);
    hgt[i] = h;
    const [r, gg, b] = g.rgb(u, v);
    col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = 255;
    const ro = Math.max(0, Math.min(1, g.rough(u, v, h))) * 255;
    rgh[i * 4] = ro; rgh[i * 4 + 1] = ro; rgh[i * 4 + 2] = ro; rgh[i * 4 + 3] = 255;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    const l = hgt[y * n + ((x - 1 + n) % n)], r = hgt[y * n + ((x + 1) % n)], u = hgt[((y - 1 + n) % n) * n + x], d = hgt[((y + 1) % n) * n + x];
    let nx = (l - r) * g.normal, ny = (u - d) * g.normal;
    const len = Math.hypot(nx, ny, 1);
    nx /= len; ny /= len;
    nor[i * 4] = (nx * 0.5 + 0.5) * 255; nor[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nor[i * 4 + 2] = (0.5 / len + 0.5) * 255; nor[i * 4 + 3] = 255;
  }
  const tex = (data: Uint8ClampedArray<ArrayBuffer>, srgb: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    c.getContext('2d')!.putImageData(new ImageData(data, n, n), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(col, true), normal: tex(nor, false), rough: tex(rgh, false) };
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const frac = (x: number) => x - Math.floor(x);

/** Running-bond block pattern: returns [mortar 0..1, block id hash, local u, local v]. */
function blocks(u: number, v: number, cols: number, rows: number, mortar: number): [number, number, number, number] {
  const row = Math.floor(v * rows);
  const off = row % 2 ? 0.5 : 0;
  const cu = u * cols + off, col = Math.floor(cu);
  const lu = frac(cu), lv = frac(v * rows);
  const mu = mortar * cols, mv = mortar * rows;
  const m = Math.max(1 - Math.min(lu, 1 - lu) / mu, 1 - Math.min(lv, 1 - lv) / mv, 0);
  const id = frac(Math.sin((col % cols) * 12.9898 + row * 78.233) * 43758.5453);
  return [Math.min(1, m), id, lu, lv];
}

function gens(): Record<string, Gen> {
  const N = makeNoise(7), N2 = makeNoise(19), N3 = makeNoise(31);
  // 1 texture tile = 2 m.
  return {
    sandstone: { // red sandstone ashlar: 4 courses x 2 blocks per 2 m
      rgb: (u, v) => {
        const [m, id] = blocks(u, v, 2, 4, 0.012);
        const g = N(u, v, 8, 5), s = N2(u * 0.2 + v, v * 3, 4, 3);
        let c = mix([158, 72, 50], [186, 96, 66], id * 0.6 + g * 0.5);
        c = mix(c, [120, 52, 38], s * 0.3);
        return mix(c, [96, 70, 60], m * 0.85);
      },
      h: (u, v) => 1 - blocks(u, v, 2, 4, 0.012)[0] * 0.8 + N(u, v, 16, 3) * 0.2,
      rough: (u, v) => 0.78 + N3(u, v, 8, 2) * 0.15, normal: 2.5,
    },
    marble: { // white Makrana-style marble, soft grey veining, large slabs
      rgb: (u, v) => {
        const w = N(u, v, 3, 5), vein = Math.abs(Math.sin((u * 3 + v * 2 + w * 3.5) * Math.PI * 2));
        const vn = Math.pow(1 - vein, 14);
        const [m] = blocks(u, v, 1, 2, 0.004);
        let c = mix([232, 227, 216], [244, 241, 234], N2(u, v, 6, 3));
        c = mix(c, [150, 150, 158], vn * 0.55);
        return mix(c, [185, 180, 170], m * 0.6);
      },
      h: (u, v) => 1 - blocks(u, v, 1, 2, 0.004)[0] * 0.6, rough: () => 0.2, normal: 1.2,
    },
    inlay: { // marble floor with pietra-dura star/octagon inlay (1 tile = 2 m = 2x2 panels)
      rgb: (u, v) => {
        const pu = frac(u * 2) - 0.5, pv = frac(v * 2) - 0.5;
        const r = Math.max(Math.abs(pu), Math.abs(pv)), d = Math.abs(pu) + Math.abs(pv);
        const star = Math.min(r * 1.0, d * 0.72);
        let c: RGB = mix([232, 226, 214], [240, 236, 228], N(u, v, 8, 3));
        if (r > 0.46) c = [120, 30, 34]; // carnelian border band
        else if (r > 0.44) c = [196, 160, 80];
        else if (star < 0.2) c = star < 0.12 ? [40, 90, 70] : [196, 160, 80]; // green jade star, gold outline
        else if (Math.abs(star - 0.3) < 0.012) c = [60, 60, 70];
        const vein = Math.pow(1 - Math.abs(Math.sin((u * 5 + N2(u, v, 4, 4) * 3) * 6.28)), 18);
        return mix(c, [160, 160, 168], vein * 0.25);
      },
      h: (u, v) => { const pu = frac(u * 2) - 0.5, pv = frac(v * 2) - 0.5; return Math.max(Math.abs(pu), Math.abs(pv)) > 0.46 ? 0.6 : 1; },
      rough: () => 0.18, normal: 0.8,
    },
    brick: { // Nanakshahi: thin small bricks, lime mortar. 2 m = 36 courses x 9 bricks
      rgb: (u, v) => {
        const [m, id] = blocks(u, v, 9, 36, 0.004);
        let c = mix([150, 78, 56], [178, 104, 72], id);
        c = mix(c, [110, 60, 46], N(u, v, 16, 3) * 0.4);
        return mix(c, [196, 184, 160], m * 0.9);
      },
      h: (u, v) => 1 - blocks(u, v, 9, 36, 0.004)[0], rough: () => 0.9, normal: 3,
    },
    plasterOchre: { // lime plaster, ochre wash, water stains
      rgb: (u, v) => {
        const g = N(u, v, 4, 5), st = Math.max(0, N2(u * 1.5, v * 0.5, 3, 4) - 0.55) * 2.2;
        const c = mix([214, 176, 110], [226, 196, 138], g);
        return mix(c, [150, 120, 84], Math.min(1, st + Math.max(0, v - 0.85) * 1.2 * N3(u, v, 12, 2)));
      },
      h: (u, v) => N(u, v, 16, 4), rough: () => 0.92, normal: 1.5,
    },
    plasterBlue: {
      rgb: (u, v) => { const g = N(u, v, 4, 5), st = Math.max(0, N2(u, v * 0.6, 3, 4) - 0.55) * 2; return mix(mix([92, 118, 150], [120, 146, 176], g), [70, 80, 96], Math.min(1, st)); },
      h: (u, v) => N(u, v, 16, 4), rough: () => 0.92, normal: 1.5,
    },
    plaster: {
      rgb: (u, v) => mix([222, 214, 196], [236, 230, 216], N(u, v, 4, 5)),
      h: (u, v) => N(u, v, 16, 4), rough: () => 0.9, normal: 1.2,
    },
    garden: { // dry lawn with faint path texture
      rgb: (u, v) => { const g = N(u, v, 10, 5), p = N2(u, v, 3, 3); return mix(mix([62, 84, 40], [96, 112, 56], g), [120, 104, 76], Math.max(0, p - 0.6) * 2); },
      h: (u, v) => N(u, v, 32, 3), rough: () => 0.95, normal: 2,
    },
    paving: { // large sandstone flags
      rgb: (u, v) => { const [m, id] = blocks(u, v, 2, 2, 0.008); return mix(mix([172, 96, 70], [196, 128, 96], id * 0.7 + N(u, v, 8, 4) * 0.3), [90, 64, 54], m); },
      h: (u, v) => 1 - blocks(u, v, 2, 2, 0.008)[0], rough: () => 0.8, normal: 2,
    },
    cobble: { // brick-on-edge herringbone-ish lane paving
      rgb: (u, v) => {
        const [m, id] = blocks(u, v, 6, 12, 0.02);
        return mix(mix([118, 70, 54], [150, 96, 70], id), [70, 58, 48], m * 0.9);
      },
      h: (u, v) => 1 - blocks(u, v, 6, 12, 0.02)[0] * 0.9, rough: () => 0.88, normal: 3,
    },
    dirt: { rgb: (u, v) => mix([96, 80, 60], [128, 108, 82], N(u, v, 8, 5)), h: (u, v) => N(u, v, 24, 4), rough: () => 1, normal: 2 },
    stoneDark: {
      rgb: (u, v) => { const [m, id] = blocks(u, v, 3, 5, 0.01); return mix(mix([70, 64, 62], [96, 88, 80], id * 0.6 + N(u, v, 8, 4) * 0.4), [40, 38, 36], m); },
      h: (u, v) => 1 - blocks(u, v, 3, 5, 0.01)[0], rough: () => 0.75, normal: 2.5,
    },
    terrace: { // lime-washed roof terrace with square tiles
      rgb: (u, v) => { const [m, id] = blocks(u, v, 5, 5, 0.01); return mix(mix([190, 170, 140], [210, 192, 160], id * 0.5 + N(u, v, 8, 3) * 0.5), [130, 116, 96], m); },
      h: (u, v) => 1 - blocks(u, v, 5, 5, 0.01)[0], rough: () => 0.9, normal: 2,
    },
    wood: { // teak planks
      rgb: (u, v) => { const pl = Math.floor(u * 8), gr = N(u * 8, v * 0.5, 4, 4); const c = mix([74, 46, 28], [104, 68, 40], frac(Math.sin(pl * 9.1) * 99) * 0.5 + gr * 0.5); return frac(u * 8) < 0.03 ? mul(c, 0.5) : c; },
      h: (u, v) => (frac(u * 8) < 0.03 ? 0 : 1) * 0.6 + N(u * 8, v * 0.5, 4, 3) * 0.4, rough: () => 0.7, normal: 2,
    },
    mirror: { // Sheesh Mahal mosaic: gilt plaster ground with a dense field of small mirror chips
      rgb: (u, v) => {
        const cu = frac(u * 24), cv = frac(v * 24), id = frac(Math.sin(Math.floor(u * 24) * 17.1 + Math.floor(v * 24) * 31.7) * 9301.3);
        const chip = Math.abs(cu - 0.5) < 0.38 && Math.abs(cv - 0.5) < 0.38;
        if (chip) return mix([200, 214, 226], [255, 255, 255], id);
        return mix([176, 132, 60], [210, 170, 90], N(u, v, 12, 3));
      },
      h: (u, v) => { const cu = frac(u * 24), cv = frac(v * 24); return Math.abs(cu - 0.5) < 0.38 && Math.abs(cv - 0.5) < 0.38 ? 1 : 0.3; },
      rough: (u, v) => { const cu = frac(u * 24), cv = frac(v * 24); return Math.abs(cu - 0.5) < 0.38 && Math.abs(cv - 0.5) < 0.38 ? 0.04 : 0.6; },
      normal: 4,
    },
  };
}

export interface LahoreMaterials {
  surf: Record<Surf, THREE.MeshStandardMaterial>;
  /** Kit slot materials (GLB material names -> shared materials). */
  brass: THREE.MeshStandardMaterial; iron: THREE.MeshStandardMaterial; woodPaint: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial; paper: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial;
  /** Emissive glitter on the mirror mosaic once the power is on. */
  setPower(on: boolean): void;
}

let cached: LahoreMaterials | null = null;
export function lahoreMaterials(): LahoreMaterials {
  if (cached) return cached;
  const G = gens();
  const sets: Record<string, ReturnType<typeof bake>> = {};
  const set = (k: string) => (sets[k] ??= bake(G[k]));
  const std = (k: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const s = set(k);
    const m = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normal, roughnessMap: s.rough, roughness: 1, ...extra });
    m.name = `lh:${k}`;
    return m;
  };
  const mirror = std('mirror', { metalness: 0.9, emissive: 0xffffff, emissiveMap: set('mirror').map, emissiveIntensity: 0.02, envMapIntensity: 2 });
  const surf: Record<Surf, THREE.MeshStandardMaterial> = {
    sandstone: std('sandstone'), marble: std('marble', { envMapIntensity: 1.2 }), inlay: std('inlay', { envMapIntensity: 1.3 }),
    brick: std('brick'), plaster: std('plaster'), plasterOchre: std('plasterOchre'), plasterBlue: std('plasterBlue'),
    garden: std('garden'), paving: std('paving'), cobble: std('cobble'), dirt: std('dirt'), stoneDark: std('stoneDark'),
    terrace: std('terrace'), wood: std('wood'), mirror,
  };
  cached = {
    surf,
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.32, name: 'lh:brass' }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3634, metalness: 0.8, roughness: 0.55, name: 'lh:iron' }),
    woodPaint: new THREE.MeshStandardMaterial({ color: 0x4f8a64, roughness: 0.7, name: 'lh:woodPaint' }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x8a1f24, roughness: 0.95, name: 'lh:cloth' }),
    paper: new THREE.MeshStandardMaterial({ color: 0xe8d8a0, roughness: 0.9, side: THREE.DoubleSide, name: 'lh:paper' }),
    water: new THREE.MeshStandardMaterial({ color: 0x1c3a40, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.85, name: 'lh:water' }),
    setPower(on) { mirror.emissiveIntensity = on ? 0.22 : 0.02; },
  };
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
    default: return null;
  }
}
