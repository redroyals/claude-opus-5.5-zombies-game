// Procedural surface library for "Rio · Ridgelight" (canvas-generated at load: zero download).
// Tileable 512 px PBR sets at the engine's world-UV convention (1 UV = 2 m, see render/geom.worldBox), plus a small
// shader patch (`fvDetail`) that breaks tiling with world-space noise: macro colour drift, rain streaks under every
// slab edge, and (on painted render) patches where the render has fallen off and the brick shows through.
// Both the def (MatSpec `custom: 'fv:*'` keys via the map entry) and the decorate hook use the same instances.
import * as THREE from 'three';

type RGB = [number, number, number];
const SIZE = 512;

function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = (x: number, y: number, per: number) => perm[(perm[(((x % per) + per) % per) & 255] + ((((y % per) + per) % per) & 255)) & 511] / 255;
  const sm = (t: number) => t * t * (3 - 2 * t);
  const n2 = (x: number, y: number, per: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = val(xi, yi, per), b = val(xi + 1, yi, per), c = val(xi, yi + 1, per), d = val(xi + 1, yi + 1, per);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (u: number, v: number, f: number, oct = 4) => {
    let amp = 0.5, sum = 0, norm = 0, fr = f;
    for (let o = 0; o < oct; o++) { sum += amp * n2(u * fr, v * fr, fr); norm += amp; amp *= 0.5; fr *= 2; }
    return sum / norm;
  };
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const frac = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => frac(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);

interface Gen { rgb: (u: number, v: number) => RGB; h: (u: number, v: number) => number; rough: (u: number, v: number, h: number) => number; normal: number }
export interface SurfSet { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture }

function bake(g: Gen): SurfSet {
  const n = SIZE;
  const col = new Uint8ClampedArray(n * n * 4), rgh = new Uint8ClampedArray(n * n * 4), nor = new Uint8ClampedArray(n * n * 4);
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
  const tex = (data: Uint8ClampedArray, srgb: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    c.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, n, n), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(col, true), normal: tex(nor, false), rough: tex(rgh, false) };
}

/** Hollow ceramic block wall (the favela "tijolo"): 10 courses x 7 blocks per 2 m, thick sloppy grey mortar. */
function brickCell(u: number, v: number, N: (u: number, v: number, f: number, o?: number) => number): { m: number; id: number; row: number; col: number } {
  const rows = 10, cols = 7;
  const w = (N(u, v, 16, 2) - 0.5) * 0.012; // wobbly courses
  const vv = v + w;
  const row = Math.floor(frac(vv) * rows);
  const off = row % 2 ? 0.5 : 0.08 * hash(row, 3);
  const cu = u * cols + off, col = Math.floor(cu);
  const lu = frac(cu), lv = frac(frac(vv) * rows);
  const mw = 0.075 + (N(u * 2, v * 2, 24, 2) - 0.5) * 0.06; // mortar joint width (fraction of a block), uneven
  const mu = 1 - Math.min(lu, 1 - lu) / (mw * 0.62), mv = 1 - Math.min(lv, 1 - lv) / mw;
  return { m: Math.max(0, Math.min(1, Math.max(mu, mv))), id: hash(((col % cols) + cols) % cols, row), row, col };
}

function gens(): Record<'brick' | 'render' | 'concrete' | 'slab', Gen> {
  const N = makeNoise(11), N2 = makeNoise(23), N3 = makeNoise(37);
  return {
    brick: {
      rgb: (u, v) => {
        const { m, id } = brickCell(u, v, N);
        const g = N2(u, v, 12, 4), sp = N3(u, v, 64, 2);
        let c: RGB = id < 0.12 ? [176, 92, 58] : id < 0.3 ? [214, 124, 76] : id < 0.8 ? [198, 108, 64] : [226, 146, 96];
        c = mix(c, [150, 70, 44], g * 0.45);
        c = mix(c, [240, 180, 130], Math.max(0, sp - 0.6) * 0.8);
        // mortar: grey cement, squeezed out and smeared onto the block faces
        const smear = Math.max(0, N(u * 1.3, v * 1.3, 20, 3) - 0.62) * 2.5;
        const mort: RGB = mix([150, 146, 138], [118, 114, 108], N3(u, v, 40, 2));
        return mix(c, mort, Math.min(1, m * 1.2 + smear * 0.5));
      },
      h: (u, v) => { const { m } = brickCell(u, v, N); return 1 - m * 0.85 + N2(u, v, 48, 2) * 0.12; },
      rough: (_u, _v, h) => 0.82 + (1 - h) * 0.15, normal: 3.2,
    },
    render: { // painted cement render (white base: tinted per wall / per house): roller marks, trowel swirls, hairline cracks
      rgb: (u, v) => {
        const g = N(u, v, 6, 5), roll = N2(u * 0.3, v * 4, 8, 3), sp = N3(u, v, 96, 1);
        const crack = Math.pow(1 - Math.abs(N2(u, v, 9, 3) * 2 - 1), 160) * (N3(u, v, 3, 2) > 0.6 ? 1 : 0);
        let c: RGB = mix([226, 222, 214], [246, 244, 238], g);
        c = mix(c, [210, 206, 198], roll * 0.35);
        c = mix(c, [196, 192, 184], (sp > 0.8 ? 0.3 : 0) + crack * 0.45);
        return c;
      },
      h: (u, v) => N(u, v, 24, 3) * 0.6 + N2(u, v, 6, 2) * 0.4,
      rough: (u, v) => 0.86 + N3(u, v, 16, 2) * 0.1, normal: 1.4,
    },
    concrete: { // raw cast concrete: formwork board lines, pores, grey-brown
      rgb: (u, v) => {
        const board = Math.pow(Math.abs(Math.sin(v * Math.PI * 10)), 30);
        const g = N(u, v, 8, 5), pore = N2(u, v, 80, 1) > 0.78 ? 1 : 0;
        let c: RGB = mix([150, 146, 138], [178, 174, 166], g);
        c = mix(c, [122, 118, 110], board * 0.5 + pore * 0.35);
        return c;
      },
      h: (u, v) => N(u, v, 32, 3) - Math.pow(Math.abs(Math.sin(v * Math.PI * 10)), 30) * 0.3, rough: () => 0.92, normal: 1.6,
    },
    slab: { // walked-on concrete slab / steps: worn, soft patches of newer concrete, a few thin cracks
      rgb: (u, v) => {
        const g = N(u, v, 5, 5), patch = Math.max(0, Math.min(1, (N3(u, v, 3, 3) - 0.58) * 6));
        const crack = Math.pow(1 - Math.abs(N2(u, v, 7, 3) * 2 - 1), 180) * (N(u * 2, v * 2, 2, 2) > 0.55 ? 1 : 0);
        let c: RGB = mix([146, 142, 134], [170, 166, 158], g);
        c = mix(c, [158, 160, 156], patch * 0.4);
        return mix(c, [80, 78, 74], crack * 0.6);
      },
      h: (u, v) => N(u, v, 40, 2) * 0.5, rough: () => 0.9, normal: 2,
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Shader patch: world-space detail that no tiling texture can give
// ---------------------------------------------------------------------------------------------------
const NOISE_GLSL = /* glsl */ `
float fvH3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fvN3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fvH3(i), fvH3(i + vec3(1,0,0)), f.x), mix(fvH3(i + vec3(0,1,0)), fvH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fvH3(i + vec3(0,0,1)), fvH3(i + vec3(1,0,1)), f.x), mix(fvH3(i + vec3(0,1,1)), fvH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fvF3(vec3 x){ return fvN3(x) * 0.55 + fvN3(x * 2.03 + 7.1) * 0.3 + fvN3(x * 4.11 + 3.3) * 0.15; }
`;

export interface DetailOpts {
  /** Macro colour drift amplitude (0..0.4). */
  macro?: number;
  /** Rain streaks darkening down from every storey line (3 m) and slab edge. */
  streaks?: number;
  /** Brick set shown through holes in the render (painted surfaces). */
  patch?: SurfSet | null;
  /** 0..1: how much of the surface has lost its render. */
  patchAmount?: number;
}

/** Adds world-space detail to a MeshStandardMaterial (works with instancing, vertex colours and merged meshes). */
export function fvDetail<T extends THREE.MeshStandardMaterial>(m: T, o: DetailOpts): T {
  const macro = o.macro ?? 0.18, streaks = o.streaks ?? 0.3, patch = o.patch ?? null, amt = o.patchAmount ?? 0.28;
  const key = `fv-detail-${macro}-${streaks}-${patch ? 'p' + amt : 'n'}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.fvBrick = { value: patch?.map ?? null };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFvW;\nvarying vec3 vFvN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 fvWp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          fvWp = instanceMatrix * fvWp;
          #endif
          vec3 fvNo = objectNormal;
          #ifdef USE_INSTANCING
          fvNo = mat3(instanceMatrix) * fvNo;
          #endif
          vFvW = (modelMatrix * fvWp).xyz; vFvN = normalize(mat3(modelMatrix) * fvNo); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFvW;\nvarying vec3 vFvN;\n${patch ? 'uniform sampler2D fvBrick;' : ''}\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 w = vFvW;
          float mac = fvF3(w * 0.09);
          diffuseColor.rgb *= 1.0 + ${macro.toFixed(3)} * (mac * 2.0 - 1.0);
          ${patch ? `
          float vert = 1.0 - abs(vFvN.y);
          // render falls off in ragged patches, mostly low on the wall (rising damp) and under each slab line
          float storey = fract(w.y / 2.9);
          float bias = (1.0 - smoothstep(0.0, 0.35, storey)) * 0.1 + smoothstep(0.8, 1.0, storey) * 0.05;
          float pn = fvF3(w * vec3(1.1, 1.6, 1.1) + 11.0) + (fvN3(w * 4.7) - 0.5) * 0.07 + bias;
          float th = 0.76 - ${amt.toFixed(3)} * 0.45;
          float hole = smoothstep(th, th + 0.015, pn) * vert;
          float rim = (smoothstep(th - 0.035, th - 0.01, pn) - hole) * vert;
          vec3 br = texture2D(fvBrick, vMapUv).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7 + vec3(0.04), max(rim, 0.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(br, vec3(dot(br, vec3(0.33))), 0.25) * 0.85, hole);` : ''}
          ${streaks > 0 ? `
          float st = fvN3(vec3((w.x + w.z) * 2.3, w.y * 0.22, (w.x - w.z) * 0.4));
          float band = smoothstep(0.35, 1.0, fract(w.y / 3.0 + 0.02));
          float drip = smoothstep(0.45, 0.85, st) * band * (1.0 - abs(vFvN.y));
          diffuseColor.rgb *= 1.0 - ${streaks.toFixed(3)} * drip;` : ''}
        }`);
  };
  m.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------------------------------
export const FV_PAINT: Record<string, number> = {
  terracotta: 0xe8a07c, teal: 0x68c0b4, yellow: 0xf0cc62, pink: 0xe98fae, green: 0x9cc46e, blue: 0x7fa6de, cream: 0xf0e4cc, lilac: 0xb7a0dc,
  white: 0xf4f1ea, orange: 0xf2a25a, mint: 0xa9e0c4, sky: 0x8fd0ec, salmon: 0xf0a08c, lime: 0xc8e070,
};

export interface FvSurfaces {
  sets: { brick: SurfSet; render: SurfSet; concrete: SurfSet; slab: SurfSet };
  /** Exposed ceramic brick with its mortar. */
  brick: THREE.MeshStandardMaterial;
  brickDark: THREE.MeshStandardMaterial;
  /** White painted render with brick patches; tint through vertex colours (kit houses). */
  renderVC: THREE.MeshStandardMaterial;
  /** Painted render per named colour (def walls). */
  paint: Record<string, THREE.MeshStandardMaterial>;
  concrete: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  slab: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
}

let cache: FvSurfaces | null = null;

export function favelaSurfaces(): FvSurfaces {
  if (cache) return cache;
  const G = gens();
  const sets = { brick: bake(G.brick), render: bake(G.render), concrete: bake(G.concrete), slab: bake(G.slab) };
  const std = (set: SurfSet, color: number, rough = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, map: set.map, normalMap: set.normal, roughnessMap: set.rough, ...extra });
    m.normalScale.set(0.9, 0.9);
    return m;
  };
  const brick = fvDetail(std(sets.brick, 0xffffff, 0.9), { macro: 0.2, streaks: 0.35 });
  const brickDark = fvDetail(std(sets.brick, 0xa89890, 0.95), { macro: 0.2, streaks: 0.35 });
  const renderVC = fvDetail(std(sets.render, 0xffffff, 0.92, { vertexColors: true }), { macro: 0.14, streaks: 0.32, patch: sets.brick, patchAmount: 0.22 });
  const paint: Record<string, THREE.MeshStandardMaterial> = {};
  for (const [k, c] of Object.entries(FV_PAINT)) paint[k] = fvDetail(std(sets.render, c, 0.92), { macro: 0.12, streaks: 0.3, patch: sets.brick, patchAmount: 0.1 });
  const concrete = fvDetail(std(sets.concrete, 0xe0dcd4, 0.93), { macro: 0.16, streaks: 0.4 });
  const concreteDark = fvDetail(std(sets.concrete, 0x9a968e, 0.95), { macro: 0.16, streaks: 0.4 });
  const slab = fvDetail(std(sets.slab, 0xfff0e2, 0.9), { macro: 0.2, streaks: 0 });
  const ceiling = fvDetail(std(sets.render, 0xc9c2b4, 0.95), { macro: 0.2, streaks: 0 });
  cache = { sets, brick, brickDark, renderVC, paint, concrete, concreteDark, slab, ceiling };
  return cache;
}

/** Custom material keys for the def (MatSpec `custom`). */
export function favelaMaterialLibrary(): Record<string, THREE.Material> {
  const S = favelaSurfaces();
  const out: Record<string, THREE.Material> = {
    'fv:brick': S.brick, 'fv:brickDark': S.brickDark, 'fv:concrete': S.concrete, 'fv:concreteDark': S.concreteDark, 'fv:slab': S.slab, 'fv:ceiling': S.ceiling,
  };
  for (const [k, m] of Object.entries(S.paint)) out[`fv:paint:${k}`] = m;
  return out;
}
