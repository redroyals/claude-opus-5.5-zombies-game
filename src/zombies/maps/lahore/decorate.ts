// Bespoke dressing for the Lahore Darbar (art pass 2).
//  - ./facades dresses every exposed masonry face (plinths, pilasters, niches, windows, jharokhas, chhajjas, merlons)
//  - set pieces: the baradari, the 40-pillared hall, the Shah Burj pavilions, the Sheesh Mahal (mirror niches and a
//    coffered mirror ceiling), ramparts, the armoury, the haveli courts, lanes (awnings, laundry, lanterns, stalls)
//  - procedural trees (cypress, chinar, the Wazir's great tree) from alpha foliage cards
//  - a pooled light rig: hundreds of lamp anchors (flame + glow sprites), eight real point lights follow the player
//  - a dusk skyline with distant lit windows
// Everything static is merged per material / cell by ./merge (see ./kit); colliders go to ctx.world.
import * as THREE from 'three';
import { models } from '../../../render/ModelRegistry';
import type { MapDecorateContext, MapUpdateContext } from '../types';
import { AREAS, B, G, LADDERS, P, R, U, U2, type Surf } from './layout';
import { LAHORE_RASTER } from './def';
import { lahoreMaterials, type LahoreMaterials } from './materials';
import { HP, atlasProp, kitBegin, kitFlush, kitMerger, mat4, put } from './kit';
import { busy, dressFacades, dressJaalis, dressRails } from './facades';

let root: THREE.Group | null = null;
let world: MapDecorateContext['world'] | null = null;
let LM: LahoreMaterials;

/** Axis-aligned collider for a footprint w (local x) x d (local z) rotated by a multiple of 90 degrees. */
function col(x: number, y: number, z: number, w: number, d: number, h: number, yaw = 0, solid = true): void {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
  world!.add(x - hx, y, z - hz, x + hx, y + h, z + hz, { surface: 'concrete', solid });
}

// ------------------------------------------------------------------------------------------------
// Light anchors: a flame/glow point for every lamp; a small pool of real point lights follows the player.
// ------------------------------------------------------------------------------------------------
type LampKind = 'torch' | 'lantern' | 'chandelier' | 'diya' | 'forge' | 'mirror';
interface Anchor { x: number; y: number; z: number; kind: LampKind }
const anchors: Anchor[] = [];
// Intensities are candela (three r155+) with decay 2: ~1 lux-equivalent a couple of metres out, so lit stone stays
// under the bloom threshold. `glow` scales the additive sprite.
const LAMP: Record<LampKind, { color: number; pre: number; post: number; range: number; glow: number; flame: boolean }> = {
  torch: { color: 0xff8030, pre: 7, post: 7, range: 11, glow: 0.55, flame: true },
  lantern: { color: 0xffa050, pre: 4.5, post: 6, range: 9, glow: 0.5, flame: false },
  chandelier: { color: 0xffc890, pre: 0, post: 9, range: 14, glow: 0.7, flame: false },
  diya: { color: 0xff9a40, pre: 0, post: 0, range: 0, glow: 0.45, flame: true },
  forge: { color: 0xff5a1a, pre: 8, post: 12, range: 8, glow: 0.8, flame: false },
  mirror: { color: 0xffe6c8, pre: 0, post: 2, range: 8, glow: 0, flame: false },
};
const lamp = (x: number, y: number, z: number, kind: LampKind) => anchors.push({ x, y, z, kind });

const POOL = 8;
const pool: { light: THREE.PointLight; a: Anchor | null; phase: number }[] = [];
let glowPre: THREE.Points | null = null, glowPost: THREE.Points | null = null, flamePre: THREE.Points | null = null, flamePost: THREE.Points | null = null;
let preAnchors: Anchor[] = [], postAnchors: Anchor[] = [];
let lastPower = false, poolT = 0, cullT = 0;
const poolAt = { x: 1e9, y: 0, z: 0 };
const kites: { m: THREE.Object3D; x: number; y: number; z: number; ph: number }[] = [];
const kiteMeshes: THREE.InstancedMesh[] = [];
let birdMesh: THREE.InstancedMesh | null = null;
const birds: { m: THREE.Object3D; cx: number; cz: number; y: number; r: number; ph: number; sp: number }[] = [];

function spriteTex(kind: 'glow' | 'flame'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  if (kind === 'glow') {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,210,0.9)'); gr.addColorStop(0.2, 'rgba(255,200,130,0.45)'); gr.addColorStop(1, 'rgba(255,140,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  } else {
    // teardrop flame: white-yellow core, orange edge
    const gr = g.createRadialGradient(32, 42, 0, 32, 42, 22);
    gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,200,90,0.95)'); gr.addColorStop(0.75, 'rgba(255,110,30,0.5)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(46, 22, 54, 40, 32, 62); g.bezierCurveTo(10, 40, 18, 22, 32, 4); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function points(list: Anchor[], tex: THREE.Texture, size: number, flame: boolean): THREE.Points {
  const pos = new Float32Array(list.length * 3), colr = new Float32Array(list.length * 3);
  list.forEach((a, i) => {
    pos.set([a.x, a.y + (flame ? 0.06 : 0), a.z], i * 3);
    const c = flame ? new THREE.Color(0xffd8a0).multiplyScalar(0.9) : new THREE.Color(LAMP[a.kind].color).multiplyScalar(LAMP[a.kind].glow);
    colr.set([c.r, c.g, c.b], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.userData.base = colr.slice();
  const m = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// ------------------------------------------------------------------------------------------------
// Placement helpers
// ------------------------------------------------------------------------------------------------
const K = (n: string) => `lahore/kit_${n}.glb`;

/** A row of columns + cusped arch spans between them (an arcade). `s` scales the kit (native height 4.95). */
function arcade(x0: number, z0: number, x1: number, z1: number, n: number, y: number, s: number, stone: Surf, trim: Surf, colliders = true): void {
  const dx = (x1 - x0) / n, dz = (z1 - z0) / n;
  const span = Math.hypot(dx, dz), yaw = Math.abs(dx) > Math.abs(dz) ? 0 : HP;
  for (let i = 0; i <= n; i++) {
    const x = x0 + dx * i, z = z0 + dz * i;
    put(K('column2'), x, y, z, 0, s, { stone, trim, cast: true, tier: 'far' });
    if (colliders) col(x, y, z, 0.62 * s, 0.62 * s, 4.2 * s);
    if (i < n) put(K('arch_span2'), x + dx / 2, y, z + dz / 2, yaw, [span / 3 / s * s, s, s], { stone, trim, cast: true, tier: 'far' });
  }
}

function torchesOnWall(axis: 'x' | 'z', at: number, a0: number, a1: number, y: number, yaw: number, every = 8): void {
  for (let a = a0 + every / 2; a < a1; a += every) {
    const x = axis === 'x' ? a : at, z = axis === 'x' ? at : a;
    if (busy(x, y, z, 0.3)) continue;
    put(K('mashaal'), x, y + 2.0, z, yaw, 1.15, { tier: 'near' });
    const fx = Math.sin(yaw) * 0.39, fz = Math.cos(yaw) * 0.39;
    lamp(x + fx, y + 2.0 + 0.62, z + fz, 'torch');
  }
}

function diyaRow(x0: number, z0: number, x1: number, z1: number, y: number, every = 1.2): void {
  const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, z1 - z0) / every));
  for (let i = 0; i <= n; i++) lamp(x0 + ((x1 - x0) * i) / n, y + 0.08, z0 + ((z1 - z0) * i) / n, 'diya');
}

function prop(name: string, x: number, y: number, z: number, yaw = 0, s = 1, collider?: [number, number, number]): void {
  put(atlasProp(name), x, y, z, yaw, s, { cast: s * 2 > 3 || /gun|well|stall|palki|throne|cart|divan/.test(name), tier: /gun|throne|well|palki/.test(name) ? 'far' : 'near' });
  if (collider) col(x, y, z, collider[0] * s, collider[1] * s, collider[2] * s, yaw);
}
function reuse(name: string, x: number, y: number, z: number, yaw = 0, s = 1, collider?: [number, number, number]): void {
  if (name.startsWith('flag')) put(`lahore/reuse/${name}.glb`, x, y, z, yaw, s, { matte: true, tier: 'far' });
  else put(atlasProp(name), x, y, z, yaw, s, { tier: 'near' });
  if (collider) col(x, y, z, collider[0] * s, collider[1] * s, collider[2] * s, yaw);
}

/** A flat textile quad on the floor (carpet) or hanging, from the 2x2 textile atlas (q = 0 stripes, 1 indigo, 2 embroidered, 3 carpet). */
function rug(x: number, y: number, z: number, w: number, d: number, yaw = 0, q = 3): void {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const [u0, v0] = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]][q];
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  g.applyMatrix4(mat4(x, y + 0.012, z, yaw));
  kitMerger().add(LM.textile, g, { tier: 'near' });
}

/** Two-point slanted textile quad (awnings, hanging cloth). Corners a (top edge from p0 to p1) and a drop. */
function cloth(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, q: number): void {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p0.toArray(), ...p1.toArray(), ...p2.toArray(), ...p3.toArray()], 3));
  const [u0, v0] = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]][q];
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0 + 0.5, u0 + 0.5, v0 + 0.5, u0 + 0.5, v0, u0, v0], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  kitMerger().add(LM.textile, g, { tier: 'near' });
}

function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): void {
  const L = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, L, 5, 1, true);
  g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  kitMerger().add(mat, g, { tier: 'near' });
}

// ------------------------------------------------------------------------------------------------
export function decorateLahore(ctx: MapDecorateContext): void {
  root = ctx.root;
  world = ctx.world;
  LM = lahoreMaterials();
  kitBegin(LM);
  anchors.length = 0; kites.length = 0; birds.length = 0; pool.length = 0; kiteMeshes.length = 0; birdMesh = null;

  // ================= every masonry face, wall, rail and jaali =================
  dressFacades(LAHORE_RASTER, LM, (x, y, z, k) => lamp(x, y, z, k));
  dressRails(LAHORE_RASTER);
  dressJaalis(LAHORE_RASTER);

  // ================= HAZURI BAGH =================
  // Baradari: 12 columns, cusped arches, marble roof with corner chhatris.
  {
    const s = 0.917;
    for (const z of [4, 12]) arcade(-6, z, 2, z, 3, P, s, 'marble', 'inlay');
    for (const x of [-6, 2]) arcade(x, 4, x, 12, 3, P, s, 'marble', 'inlay');
    put(K('baradari_roof'), -2, 8.6, 8, 0, 1, { stone: 'marble', trim: 'inlay', cast: true, tier: 'far' });
    for (const [x, z] of [[-7, 3], [3, 3], [-7, 13], [3, 13]]) put(K('chhatri2'), x, 9.0, z, 0, 0.62, { stone: 'marble', trim: 'marble', cast: true, tier: 'far' });
    put(atlasProp('chandelier'), -2, 7.3, 8, 0, 0.85, { matte: true, tier: 'near' });
    lamp(-2, 7.5, 8, 'chandelier');
    for (const [x, z] of [[-7.6, 2.4], [3.6, 2.4], [-7.6, 13.6], [3.6, 13.6]]) lamp(x, P + 0.15, z, 'diya');
    diyaRow(-8, 14, 4, 14, P); diyaRow(-8, 2, 4, 2, P);
    rug(-2, P, 8.9, 5.2, 3.6, 0, 3);
  }
  // Charbagh beds, cypresses, chinars and fountains
  for (const [x0, z0, x1, z1] of [[-16, -4, -11, 0], [7, -4, 12, 0], [-16, 14, -11, 17], [7, 14, 12, 17]]) {
    addBox(LM.surf.garden, x0, G, z0, x1, G + 0.55, z1);
    // sandstone kerb
    addBox(LM.surf.sandstone, x0 - 0.2, G, z0 - 0.2, x1 + 0.2, G + 0.6, z0);
    addBox(LM.surf.sandstone, x0 - 0.2, G, z1, x1 + 0.2, G + 0.6, z1 + 0.2);
    addBox(LM.surf.sandstone, x0 - 0.2, G, z0, x0, G + 0.6, z1);
    addBox(LM.surf.sandstone, x1, G, z0, x1 + 0.2, G + 0.6, z1);
    world.add(x0 - 0.2, G, z0 - 0.2, x1 + 0.2, G + 0.6, z1 + 0.2, { surface: 'dirt' });
    cypress((x0 + x1) / 2 - 1.4, G + 0.55, (z0 + z1) / 2, 5.6);
    cypress((x0 + x1) / 2 + 1.4, G + 0.55, (z0 + z1) / 2, 6.2);
  }
  for (const x of [-13.5, 9.5]) { put(K('fountain'), x, G, 8, 0, 1, { stone: 'marble', trim: 'inlay', tier: 'near' }); col(x, G, 8, 4, 4, 0.55); }
  chinar(-15.5, G, 18.2, 1.0); chinar(11.5, G, 18.5, 0.9);
  // Alamgiri Gate: grand arch and two bastion towers on the garden side
  put(K('arch_bay'), -1, G, -6.2, 0, [1.6, 1.4, 1.6], { stone: 'sandstone', trim: 'marble', cast: true, tier: 'far' });
  for (const x of [-8, 6]) {
    put(K('burj'), x, G, -7.5, 0, [0.42, 0.9, 0.42], { stone: 'sandstone', trim: 'marble', cast: true, tier: 'far' });
    col(x, G, -7.3, 4.4, 3.2, 9.2);
    put(K('chhatri2'), x, G + 9.2, -7.5, 0, 0.85, { stone: 'marble', trim: 'sandstone', cast: true, tier: 'far' });
    lamp(x, G + 10.8, -7.5, 'lantern');
  }
  put(K('door_frame'), 14.2, G, 11, HP, [1.1, 1.0, 1.0], { stone: 'sandstone', trim: 'marble', tier: 'far' }); // Roshnai Gate
  put(K('door_frame'), -18.2, G, 13.5, -HP, [0.85, 1.0, 1.0], { stone: 'sandstone', trim: 'marble', tier: 'far' }); // Sher Darwaza
  torchesOnWall('x', 19.8, -16, 12, G, Math.PI, 7);
  torchesOnWall('z', 13.8, -4, 8, G, -HP, 6);
  torchesOnWall('z', -17.8, -4, 10, G, HP, 7);

  // ================= TOP KHANA (cannon yard) =================
  prop('great_gun', -35, G + 0.4, 6.5, HP, 1, [3.0, 7.5, 2.6]);
  for (const [x, z] of [[-40.5, 4], [-29.5, 9], [-40.5, 9.5]]) prop('cannonballs', x, G, z, 0, 1, [1.1, 1.1, 0.8]);
  for (const [x, z, yaw] of [[-45, 16, 0.4], [-26, 16, -0.3], [-47, -2, 1.2]]) reuse('sikh-cannon', x, G, z, yaw, 1.8, [1.3, 1.1, 0.9]);
  for (const x of [-48, -40, -24]) prop('strongboxes', x, G, 18.6, 0, 0.8, [1.1, 0.8, 1.3]);
  torchesOnWall('x', 19.8, -50, -20, G, Math.PI, 7);
  torchesOnWall('z', -46.2, -38, -8, G + 2, -HP, 9);
  put(K('arch_bay'), -44.2, U, -45, HP, [1.4, 1.2, 1.4], { stone: 'sandstone', trim: 'marble', cast: true, tier: 'far' });
  put(K('arch_bay'), -30.6, G, -6.2, 0, [1.4, 1.2, 1.4], { stone: 'sandstone', trim: 'sandstone', cast: true, tier: 'far' }); // armoury gate
  chinar(-21, G, -2.5, 0.85);

  // ================= SILAH KHANA (armoury, PaP) =================
  arcade(-40, -26, -22, -26, 6, G, 1.25, 'sandstone', 'sandstone');
  arcade(-40, -16, -22, -16, 6, G, 1.25, 'sandstone', 'sandstone');
  for (let x = -41; x <= -23; x += 4.5) { prop('armour_stand', x, G, -29.2, 0, 1, [1.0, 0.8, 1.9]); prop('weapon_rack', x + 2.2, G, -29.3, 0, 1, [2.0, 0.5, 2.0]); }
  for (const x of [-40, -23]) prop('weapon_rack', x, G, -6.8, Math.PI, 1, [2.0, 0.5, 2.0]);
  lamp(-43.2, G + 1.2, -16.2, 'forge');
  lamp(-31, G + 5.2, -21, 'lantern');
  for (const x of [-38, -24]) { prop('la_lantern', x, G + 3.9, -21, 0, 1.1); lamp(x, G + 4.2, -21, 'lantern'); }
  put(atlasProp('chandelier'), -31, G + 4.9, -21, 0, 1.0, { matte: true, tier: 'near' });
  torchesOnWall('x', -29.8, -42, -20, G, 0, 7);

  // ================= DIWAN-E-AAM =================
  arcade(-18, -30.5, 10, -30.5, 7, P, 1.42, 'sandstone', 'marble');
  arcade(-18, -35, -6, -35, 3, P, 1.42, 'sandstone', 'marble');
  arcade(2, -35, 10, -35, 2, P, 1.42, 'sandstone', 'marble');
  put(K('jharokha2'), -2, U - 1.95, -39.95, 0, 1.45, { stone: 'marble', trim: 'marble', cast: true, tier: 'far' }); // the royal balcony
  put(atlasProp('throne_dais'), -2, P, -35.6, 0, 0.9, { matte: true, tier: 'near' });
  col(-2, P, -35.6, 2.4, 2.2, 1.3);
  for (const x of [-9, 5]) { put(atlasProp('chandelier'), x, 9.6, -35, 0, 1.1, { matte: true, tier: 'near' }); lamp(x, 9.8, -35, 'chandelier'); }
  torchesOnWall('z', -17.8, -28, -12, G, HP, 8);
  torchesOnWall('x', -10.2, -16, 12, G, Math.PI, 8);
  rug(-2, P, -33, 9, 4.2, 0, 3);
  for (const x of [-14, 6]) { put(K('pedestal2'), x, G, -12.5, 0, 0.85, { stone: 'marble', trim: 'marble', tier: 'near' }); reuse('brass-vase', x, G + 1.06, -12.5, 0, 2.0); col(x, G, -12.5, 0.8, 0.8, 1.8); }
  diyaRow(-18, -30.2, 10, -30.2, P);
  for (const [x, z] of [[-14, -38.4], [9, -38.4]]) prop('la_brass_vessels', x, P, z, 0.3, 1, [0.9, 0.6, 0.8]);

  // ================= TOSHAKHANA + vault =================
  arcade(16, -17, 28, -17, 4, G, 1.2, 'sandstone', 'marble');
  put(K('pedestal2'), 18, B, -44.4, 0, 1.0, { stone: 'marble', trim: 'marble', tier: 'near' });
  reuse('kohinoor-gem', 18, B + 1.28, -44.4, 0, 0.18);
  lamp(18, B + 2.4, -44.4, 'lantern');
  for (const [x, z, yaw] of [[15.2, -34, HP], [15.2, -38, HP], [28.8, -44, -HP], [28.8, -36, -HP]]) prop('chest_gold', x, B, z, yaw, 1, [1.2, 1.0, 1.2]);
  for (const [x, z] of [[25.5, -45.2], [26.8, -45.2], [15.4, -41]]) prop('strongboxes', x, B, z, 0, 0.9, [1.1, 0.8, 1.3]);
  for (const [x, z] of [[21, -33], [21, -40], [27, -40]]) lamp(x, B + 3.2, z, 'lantern');
  torchesOnWall('x', -23.8, 15, 30, G, 0, 5);
  put(atlasProp('chandelier'), 22, 7.6, -17, 0, 1, { matte: true, tier: 'near' }); lamp(22, 7.8, -17, 'chandelier');
  rug(22, G, -20.5, 8, 3.2, 0, 2);

  // ================= SHAH BURJ =================
  put(K('fountain'), -18, U, -49, 0, 1.3, { stone: 'marble', trim: 'inlay', tier: 'near' }); col(-18, U, -49, 5.2, 5.2, 0.6);
  for (const [a, b] of [[[-42, -56], [-34, -56]], [[-42, -48], [-34, -48]]] as const) arcade(a[0], a[1], b[0], b[1], 3, U2, 0.8, 'marble', 'inlay');
  put(K('bangla_roof'), -38, 12.2, -52, 0, 1, { stone: 'marble', trim: 'inlay', cast: true, tier: 'far' });
  arcade(0, -54, 12, -54, 4, U2, 0.95, 'marble', 'inlay'); arcade(0, -44, 12, -44, 4, U2, 0.95, 'marble', 'inlay');
  arcade(0, -54, 0, -44, 3, U2, 0.95, 'marble', 'inlay'); arcade(12, -54, 12, -44, 3, U2, 0.95, 'marble', 'inlay');
  for (const [x, z] of [[0, -54], [12, -54], [0, -44], [12, -44]]) put(K('chhatri2'), x, 13.2, z, 0, 0.75, { stone: 'marble', trim: 'marble', cast: true, tier: 'far' });
  lamp(6, 11.6, -49, 'chandelier'); put(atlasProp('chandelier'), 6, 11.4, -49, 0, 1, { matte: true, tier: 'near' });
  rug(6, U2, -49, 9, 6, 0, 3);
  prop('la_divan', 6, U2, -52.2, 0, 1, [2.2, 1.3, 0.8]);
  prop('la_chowki', 6, U2, -50.2, 0.2, 0.9, [0.9, 0.9, 0.9]);
  for (const [x, z] of [[-28, -42.6], [-8, -42.6], [-26, -56.2], [-10, -56.2]]) prop('la_planter_tree', x, U, z, x * 0.3, 1, [1.3, 1.3, 2.3]);
  for (const x of [2.2, 9.8]) prop('la_brass_vessels', x, U2, -52.6, x > 6 ? -0.4 : 0.4, 0.9);
  rug(-38, U2, -52, 5.5, 5, HP, 2);
  torchesOnWall('x', -57.8, -44, 14, U, 0, 8);
  torchesOnWall('x', -40.2, -44, 14, U, Math.PI, 9);
  for (const [x, z] of [[-30, -58.4], [-10, -58.4], [13.6, -52]]) reuse('flag-ranjit-singh', x, 13, z, 0, 1.2); // state standard, decor only

  // ================= SHEESH MAHAL =================
  // Walls are mirror-mosaic niches (./facades); here: the coffered mirror ceiling, pillared hall, chandeliers.
  for (let x = -33; x < -6.5; x += 2) for (let z = -69; z < -58.5; z += 2) put(K('coffer'), x, 13.99, z, 0, 1, { stone: 'mirror', trim: 'marble', tier: 'near' });
  arcade(-28, -64.5, -12, -64.5, 4, U, 1.1, 'marble', 'marble');
  arcade(-28, -61, -12, -61, 4, U, 1.1, 'marble', 'marble');
  for (const x of [-26, -20, -14]) { put(atlasProp('chandelier'), x, 12.6, -64, 0, 1.2, { matte: true, tier: 'near' }); lamp(x, 12.8, -64, 'chandelier'); }
  for (let x = -31; x < -7; x += 6) lamp(x, U + 3.2, -66.5, 'mirror');
  put(atlasProp('throne_dais'), -29, U, -67.6, 0, 0.9, { matte: true, tier: 'near' }); col(-29, U, -67.6, 2.4, 2.2, 1.3);
  for (const [x, z, yaw] of [[-33.85, -66, HP], [-6.15, -62.5, -HP], [-28, -69.85, 0]] as const) put(K('mirror_medallion'), x, U + 1.0, z, yaw, 1.3, { tier: 'near' });
  rug(-20, U, -62.8, 14, 5, 0, 3);
  prop('la_divan', -12, U, -68.4, 0, 1, [2.2, 1.3, 0.8]);
  for (const x of [-24, -16]) { prop('la_lantern', x, 10.9, -59.6, 0, 1.2); lamp(x, 11.2, -59.6, 'lantern'); }

  // ================= RAMPARTS =================
  torchesOnWall('z', -57.8, -54, 18, U, HP, 10);
  put(K('burj'), -55, U - 7.2 + 3.1, 32, 0, [1, 0.7, 1], { stone: 'sandstone', trim: 'marble', cast: true, tier: 'far' });
  put(K('chhatri2'), -55, R, 32, 0, 1.3, { stone: 'marble', trim: 'sandstone', cast: true, tier: 'far' }); col(-55, R, 32, 2.6 * 1.3, 2.6 * 1.3, 0.35);
  lamp(-55, R + 3.2, 32, 'lantern');
  for (const [x, z] of [[-57, -20], [-57, 5]]) reuse('flag-ranjit-singh', x, U + 1.1, z, HP, 1.4); // state standard, decor only

  // ================= ROSHNAI GATE + GALLI =================
  arcade(16, 8.2, 32, 8.2, 4, G, 1.05, 'brick', 'sandstone', false);
  torchesOnWall('x', 8.2, 15, 33, G, 0, 6);
  hav();

  // ================= light rig =================
  const glowT = spriteTex('glow'), flameT = spriteTex('flame');
  preAnchors = anchors.filter((a) => LAMP[a.kind].pre > 0 || a.kind === 'torch' || a.kind === 'forge');
  postAnchors = anchors.filter((a) => !preAnchors.includes(a) && a.kind !== 'mirror');
  glowPre = points(preAnchors, glowT, 0.9, false);
  glowPost = points(postAnchors, glowT, 0.8, false);
  flamePre = points(preAnchors.filter((a) => LAMP[a.kind].flame), flameT, 0.26, true);
  flamePost = points(postAnchors.filter((a) => LAMP[a.kind].flame), flameT, 0.16, true);
  glowPost.visible = flamePost.visible = false;
  root.add(glowPre, glowPost, flamePre, flamePost);
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xffa050, 0, 12, 2);
    l.castShadow = false;
    root.add(l);
    pool.push({ light: l, a: null, phase: i * 1.37 });
  }
  // Warm dusk fill owned by the map (the engine's hemisphere light is a cold blue-hour rig; def.lighting.hemi
  // turns that down, these add the ember bounce from the sky and the warm lime-washed ground).
  const warm = new THREE.HemisphereLight(0xffa878, 0x5a3422, 0.95);
  warm.name = 'lh-warm-fill';
  const amb = new THREE.AmbientLight(0xffc8a0, 0.22);
  root.add(warm, amb);
  skyline(ctx);
  void kitFlush(ctx.root, () => takeOverEngineGeometry(ctx.root));
  lastPower = false;
}

function addBox(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  // world UVs (1 UV = 2 m) like the engine's boxes
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv');
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, x / 2, z / 2); else if (nx > 0.5) uv.setXY(i, z / 2, y / 2); else uv.setXY(i, x / 2, y / 2);
  }
  kitMerger().add(mat, g, { tier: 'near', cast: true });
}

// ================= HAVELI DISTRICT =================
function hav(): void {
  torchesOnWall('x', -23.8, 40, 86, G, 0, 11);
  // Wazir courtyard: the great tree (landmark), charpai, pots, galleries with wooden pillars
  greatTree(50, G, -6); col(50, G, -6, 1.4, 1.4, 6);
  prop('la_charpai', 46.5, G, -1.2, 0, 1, [2.0, 1.0, 0.6]);
  prop('matka_pots', 52.8, G, -14.8, 0, 1, [1.0, 1.0, 1.0]);
  for (let x = 45; x <= 54; x += 3) put(K('pillar_wood'), x, U, -16.15, 0, 0.8, { tier: 'near', cast: true });
  for (let z = -13; z <= 1; z += 3) put(K('pillar_wood'), 41.85, U, z, 0, 0.8, { tier: 'near', cast: true });
  for (let z = -13; z <= -4; z += 3) put(K('pillar_wood'), 54.15, U, z, 0, 0.8, { tier: 'near', cast: true });
  lamp(48, U + 2.4, -17, 'lantern'); lamp(40, U + 2.4, -6, 'lantern'); lamp(44, G + 2.2, -1, 'lantern');
  diyaRow(42.3, -16.1, 54, -16.1, U + 1.0); diyaRow(42.1, -15.8, 42.1, 1, U + 1.0);
  rug(47, G, -9, 4, 2.6, 0.2, 3);
  prop('la_divan', 45.5, G, -12.6, 0, 1, [2.2, 1.3, 0.8]);
  prop('la_chowki', 47.5, G, -10.3, 0.4, 0.85, [0.9, 0.9, 0.9]);
  prop('la_degh', 53.2, G, -12.4, 0, 1, [1.0, 1.0, 0.7]);
  // Chowk: the well, tea stall, spice stall, fruit and cloth sellers
  prop('well', 62.5, G, 7, 0, 1, [2.5, 2.5, 1.0]);
  prop('chai_stall', 60.5, G, 4.4, 0, 1, [1.8, 0.9, 1.0]);
  prop('spice_stall', 64.6, G, 3.9, 0, 1, [2.2, 0.9, 1.4]);
  prop('palki', 44, G, 7.5, HP, 1, [2.4, 0.9, 1.4]);
  prop('la_fruit_cart', 64.6, G, 11.0, -0.3, 1, [2.1, 1.2, 1.3]);
  prop('la_pottery_stall', 60.2, G, 10.6, 0.2, 1, [1.8, 1.0, 1.1]);
  prop('la_cloth_stall2', 22, G, 8.95, 0, 1, [2.0, 1.0, 1.3]);
  prop('la_sacks', 27.5, G, 8.9, 0, 1, [1.3, 1.0, 0.6]);
  for (const [x, z] of [[52, 31.2], [74, 31.2]]) prop('la_pigeon_loft', x, R, z, Math.PI, 1, [1.9, 1.9, 2.2]);
  prop('la_brass_vessels', 65.4, G, 7.2, -HP, 0.9);
  lamp(62.5, G + 3.4, 7, 'lantern');
  // Naqqar Khana: the drum pavilion (POWER) under a great chhatri, galleries and hanging lanterns
  put(K('chhatri2'), 73, P - 0.3, -3, 0, 2.25, { stone: 'marble', trim: 'marble', cast: true, tier: 'far' });
  for (const [x, z] of [[70.5, -5.5], [75.5, -5.5], [70.5, -0.5], [75.5, -0.5]]) col(x, P, z, 0.5, 0.5, 4.5);
  for (let x = 69; x <= 80; x += 3) put(K('pillar_wood'), x, U, -16.15, 0, 0.8, { tier: 'near', cast: true });
  for (let z = -13; z <= 10; z += 3) { put(K('pillar_wood'), 65.85, U, z, 0, 0.8, { tier: 'near', cast: true }); put(K('pillar_wood'), 80.15, U, z, 0, 0.8, { tier: 'near', cast: true }); }
  for (const [x, z] of [[68, -12], [78, -12], [68, 7], [78, 7], [73, -10], [73, 5]]) { lamp(x, G + 4.8, z, 'lantern'); reuse('hanging-lantern', x, G + 4.3, z, 0, 1.2); }
  for (const [x, z] of [[67.5, -14.5], [78.5, 8.5]]) prop('matka_pots', x, G, z, 0, 1, [1.0, 1.0, 1.0]);
  diyaRow(66.2, -15.8, 80, -15.8, U + 1.0); diyaRow(66, 10.2, 80, 10.2, U + 1.0); diyaRow(79.8, -16, 79.8, 10, U + 1.0);
  rug(73, P, -3, 5, 5, 0, 3);
  // Kothay: kite terraces, charpais, water pots, parapet lanterns, kites overhead
  for (const [x, z] of [[40, 30], [55, 14], [70, 30], [82, 24]]) prop('la_charpai', x, R, z, 0.3, 1, [2.0, 1.0, 0.6]);
  for (const [x, z] of [[38.6, 12], [57, 31], [64, 15]]) prop('matka_pots', x, R, z, 0, 1, [1.0, 1.0, 1.0]);
  for (const [x, z] of [[48, 20], [72, 22], [44, 3.5]]) { put(K('chhatri2'), x, R, z, 0, 0.9, { stone: 'plasterOchre', trim: 'plaster', cast: true, tier: 'far' }); col(x, R, z, 2.34, 2.34, 0.3); }
  diyaRow(37.3, 9.3, 37.3, 32.7, R + 0.5); diyaRow(37.5, 32.7, 58.7, 32.7, R + 0.5); diyaRow(62.3, 32.7, 83.7, 32.7, R + 0.5);
  for (const [x, z] of [[40.5, 29.5], [47, 10.5], [66, 30]]) lamp(x, R + 1.2, z, 'lantern');
  for (let i = 0; i < 9; i++) {
    const x = 40 + ((i * 17) % 46), z = -10 + ((i * 23) % 44), y = R + 14 + (i % 4) * 3;
    kites.push({ m: new THREE.Object3D(), x, y, z, ph: i * 1.7 });
  }
  void models.load(K('kite')).then((lm) => {
    if (!lm) return;
    lm.scene.updateMatrixWorld(true);
    lm.scene.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      const n = (me.material as THREE.Material).name;
      const g = me.geometry.clone();
      g.applyMatrix4(me.matrixWorld);
      g.scale(2.2, 2.2, 2.2);
      const im = new THREE.InstancedMesh(g, n.startsWith('paper') ? LM.paper : n.startsWith('cloth') ? LM.cloth : LM.surf.wood, kites.length);
      im.frustumCulled = false;
      im.castShadow = false;
      root!.add(im);
      kiteMeshes.push(im);
    });
  });
  // Tehkhana: cistern, strongboxes, torches
  put(K('cistern'), 38, 2.5, -40, 0, 0.8, { stone: 'stoneDark', tier: 'near' });
  col(38, B, -40, 5.6, 5.6, 2.5);
  for (const [x, z] of [[31.5, -45], [46.5, -45], [31.2, -33]]) prop('strongboxes', x, B, z, 0, 0.9, [1.1, 0.8, 1.3]);
  for (const [x, z] of [[36, -34.5], [42, -45]]) { prop('la_lantern', x, B + 2.2, z, 0, 0.9); lamp(x, B + 2.5, z, 'lantern'); }
  for (const [x, z] of [[33, -36], [44, -36], [41, -44], [33, -44]]) lamp(x, B + 1.4, z, 'torch');
  for (const [x, z] of [[31, -38.5], [47, -42.5]]) prop('la_sacks', x, B, z, x > 40 ? -HP : HP, 1, [1.3, 1.0, 0.6]);
  // Haveli doors get carved frames
  for (const [x, z, yaw] of [[36.8, -8, -HP], [59.2, -10, HP], [66.2, 6.5, HP]] as const) put(K('door_frame'), x, G, z, yaw, [0.85, 1, 1], { stone: 'plasterOchre', trim: 'wood', tier: 'near' });
  lanes();
  pigeons();
  // Wooden ladders (the engine's steel-rung ladder groups are hidden in takeOverEngineGeometry: 28 draws each).
  for (const l of LADDERS) {
    const [x, z, yaw, y0, y1] = ladderPose(l);
    put(K('ladder'), x, y0, z, yaw, [1.1, (y1 - y0 + 0.9) / 3, 1.2], { stone: 'wood', tier: 'near' });
  }
}

/** Where the engine stands a ladder (mapcompile: 0.45 m from the bottom point toward the top, facing it). */
function ladderPose(l: (typeof LADDERS)[number]): [number, number, number, number, number] {
  const dx = l.top[0] - l.bottom[0], dz = l.top[2] - l.bottom[2];
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  return [l.bottom[0] + ux * 0.45, l.bottom[2] + uz * 0.45, Math.atan2(-ux, -uz), l.bottom[1], l.top[1]];
}

/** Pigeons: perched groups on roof parapets and courtyard edges (static), and a few flocks wheeling over the havelis. */
function pigeons(): void {
  let s = 77;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const perches: [number, number, number][] = [[38, R + 0.6, 9.4], [58.6, R + 0.6, 20], [62.4, R + 0.6, 25], [70, R + 0.6, 32.6], [42, R + 0.6, 32.6],
    [48, U + 1.05, -16.2], [66.3, U + 1.05, -4], [79.7, U + 1.05, 2], [-30, 13.3, -58.2], [-57.8, U + 1.4, -10]];
  for (const [x, y, z] of perches) for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) prop('la_pigeon', x + (rnd() - 0.5) * 1.6, y, z + (rnd() - 0.5) * 1.6, rnd() * Math.PI * 2, 0.9 + rnd() * 0.2);
  void models.load('lahore/props_atlas.glb').then((lm) => {
    const src = lm?.scene.getObjectByName('la_pigeon');
    if (!src) return;
    src.updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    src.traverse((o) => { if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh; });
    if (!mesh) return;
    const m = mesh as THREE.Mesh;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const flocks = [[52, 8, 16], [72, 4, 12], [-20, -40, 20]];
    const im = new THREE.InstancedMesh(g, m.material as THREE.Material, flocks.length * 7);
    im.frustumCulled = false;
    im.castShadow = false;
    flocks.forEach(([cx, cz, r], f) => { for (let k = 0; k < 7; k++) birds.push({ m: new THREE.Object3D(), cx: cx + (rnd() - 0.5) * 5, cz: cz + (rnd() - 0.5) * 5, y: R + 9 + rnd() * 5, r: r + rnd() * 4, ph: f * 2 + k * 0.35, sp: 0.45 + rnd() * 0.1 }); });
    root!.add(im);
    birdMesh = im;
  });
}

/** Life in the gallis: awnings over shopfronts, laundry lines strung across, hanging lanterns, pigeons. */
function lanes(): void {
  let s = 41;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rope = LM.iron;
  const laneRects = AREAS.filter((a) => a.id === 'lanes' || a.id === 'lane_a').flatMap((a) => a.rects);
  for (const [x0, z0, x1, z1] of laneRects) {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const w0 = alongX ? z0 : x0, w1 = alongX ? z1 : x1;
    for (let t = 3; t < len - 2; t += 6 + rnd() * 5) {
      const a = (alongX ? x0 : z0) + t;
      const P0 = (w: number, y: number) => (alongX ? new THREE.Vector3(a, y, w) : new THREE.Vector3(w, y, a));
      if (busy(alongX ? a : (w0 + w1) / 2, G, alongX ? (w0 + w1) / 2 : a, 1.5, G + 7)) continue;
      const r = rnd();
      if (r < 0.45) {
        // laundry line across the lane at the upper storey, with 3-5 cloths
        const y = U + 1.6 + rnd() * 0.8;
        const A = P0(w0 + 0.05, y), Bv = P0(w1 - 0.05, y);
        const sag = 0.35;
        const mid = A.clone().lerp(Bv, 0.5); mid.y -= sag;
        bar(A, mid, 0.012, rope); bar(mid, Bv, 0.012, rope);
        const n = 3 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const u0 = 0.12 + (k / n) * 0.76, u1 = u0 + 0.5 / n + 0.06;
          const at = (u: number) => { const p = A.clone().lerp(Bv, u); p.y -= sag * 4 * u * (1 - u); return p; };
          const pa = at(u0), pb = at(Math.min(0.92, u1)), drop = 0.7 + rnd() * 0.5;
          cloth(pa, pb, pb.clone().setY(pb.y - drop), pa.clone().setY(pa.y - drop * 0.95), Math.floor(rnd() * 3));
        }
      } else if (r < 0.75) {
        // a string of paper lanterns / a single hanging lantern with a real anchor
        const y = U + 0.9;
        const A = P0(w0 + 0.05, y + 0.4), Bv = P0(w1 - 0.05, y + 0.4);
        const mid = A.clone().lerp(Bv, 0.5); mid.y -= 0.25;
        bar(A, mid, 0.01, rope); bar(mid, Bv, 0.01, rope);
        prop('la_lantern', mid.x, y - 0.75, mid.z, 0, 1);
        lamp(mid.x, y - 0.35, mid.z, 'lantern');
      }
    }
    // awnings over the street storey on both sides, now and then
    for (const side of [w0, w1]) {
      const sgn = side === w0 ? 1 : -1;
      for (let t = 2; t < len - 3; t += 4 + rnd() * 6) {
        if (rnd() < 0.55) continue;
        const a = (alongX ? x0 : z0) + t, wlen = 2 + rnd() * 1.2;
        const cx = alongX ? a + wlen / 2 : side, cz = alongX ? side : a + wlen / 2;
        if (busy(cx, G, cz, 1.6, G + 3.5)) continue;
        const y0 = G + 2.95, depth = 0.9;
        const q = Math.floor(rnd() * 3);
        const W = (along: number, out: number, y: number) => (alongX ? new THREE.Vector3(along, y, side + sgn * out) : new THREE.Vector3(side + sgn * out, y, along));
        cloth(W(a, 0.02, y0 + 0.35), W(a + wlen, 0.02, y0 + 0.35), W(a + wlen, depth, y0 - 0.1), W(a, depth, y0 - 0.1), q);
        for (const e of [a + 0.05, a + wlen - 0.05]) bar(W(e, depth, y0 - 0.1), W(e, 0.02, y0 + 0.35), 0.02, LM.surf.wood);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Trees: alpha foliage cards (foliage atlas: left half cypress, right half chinar leaves).
// ------------------------------------------------------------------------------------------------
const barkMat = () => LM.bark;

function card(x: number, y: number, z: number, w: number, h: number, yaw: number, half: 0 | 1, tilt = 0): void {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, half * 0.5 + uv.getX(i) * 0.5);
  g.rotateX(tilt);
  g.applyMatrix4(mat4(x, y + h / 2, z, yaw));
  kitMerger().add(LM.foliage, g, { tier: 'far', cast: true });
}

function cypress(x: number, y: number, z: number, h: number): void {
  const t = new THREE.CylinderGeometry(0.08, 0.14, 1.0, 6);
  t.translate(x, y + 0.5, z);
  kitMerger().add(barkMat(), t, { tier: 'near' });
  for (let k = 0; k < 4; k++) card(x, y + 0.5, z, 1.7, h, (k / 4) * Math.PI, 0);
  col(x, y, z, 0.8, 0.8, h);
}

/** Chinar (oriental plane): a pale trunk, forked limbs and a broad rounded canopy of leaf cards. */
function chinar(x: number, y: number, z: number, sc: number): void {
  let s = (Math.abs(Math.floor(x * 31 + z * 17)) % 2147483646) + 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bark = barkMat();
  const trunk = new THREE.CylinderGeometry(0.28 * sc, 0.5 * sc, 4.2 * sc, 8);
  trunk.translate(x, y + 2.1 * sc, z);
  kitMerger().add(bark, trunk, { tier: 'far', cast: true });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd(), L = (2.6 + rnd()) * sc;
    const limb = new THREE.CylinderGeometry(0.08 * sc, 0.18 * sc, L, 5);
    limb.translate(0, L / 2, 0); limb.rotateZ(-0.7 - rnd() * 0.3); limb.rotateY(a); limb.translate(x, y + 3.6 * sc, z);
    kitMerger().add(bark, limb, { tier: 'far', cast: true });
  }
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 4.2 * sc;
    const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r, cy = y + (5 + rnd() * 2.6 - r * 0.25) * sc;
    const w = (2.6 + rnd() * 1.4) * sc;
    card(cx, cy - w / 2, cz, w, w, rnd() * Math.PI, 1, -0.4 + rnd() * 0.8);
    card(cx, cy - w / 2, cz, w, w, rnd() * Math.PI + HP, 1, -0.4 + rnd() * 0.8);
  }
  col(x, y, z, 1.0 * sc, 1.0 * sc, 4 * sc);
}

/** The Wazir's great tree: a flared multi-stem trunk with hanging aerial roots and a very wide canopy. */
function greatTree(x: number, y: number, z: number): void {
  let s = 5;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bark = barkMat();
  const trunk = new THREE.CylinderGeometry(0.55, 1.15, 5.5, 10, 4);
  trunk.translate(x, y + 2.75, z);
  kitMerger().add(bark, trunk, { tier: 'far', cast: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5, L = 3.5 + rnd() * 2;
    const limb = new THREE.CylinderGeometry(0.16, 0.34, L, 6);
    limb.translate(0, L / 2, 0); limb.rotateZ(-0.9 - rnd() * 0.3); limb.rotateY(a); limb.translate(x, y + 4.4 + rnd() * 0.8, z);
    kitMerger().add(bark, limb, { tier: 'far', cast: true });
    for (let r = 0; r < 3; r++) {
      const root = new THREE.CylinderGeometry(0.04, 0.06, 4 + rnd() * 2, 4);
      const rr = 2.2 + rnd() * 2.5, ra = a + (rnd() - 0.5) * 0.6;
      root.translate(x + Math.cos(ra) * rr, y + 3.2 + rnd(), z + Math.sin(ra) * rr);
      kitMerger().add(bark, root, { tier: 'near' });
    }
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 6.2;
    const w = 3 + rnd() * 1.6, cy = y + 7 + rnd() * 2.4 - r * 0.2;
    card(x + Math.cos(a) * r, cy - w / 2, z + Math.sin(a) * r, w, w, rnd() * Math.PI, 1, -0.5 + rnd());
    card(x + Math.cos(a) * r, cy - w / 2, z + Math.sin(a) * r, w, w, rnd() * Math.PI + HP, 1, -0.5 + rnd());
  }
}

/** A dusk skyline around the fort: haveli blocks with parapets and small chhatris, distant lit windows, sun glow. */
function skyline(ctx: MapDecorateContext): void {
  const geos: THREE.BufferGeometry[] = [];
  const lit: THREE.BufferGeometry[] = [];
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 110; i++) {
    const a = (i / 110) * Math.PI * 2, r = 150 + rnd() * 90;
    const x = 15 + Math.cos(a) * r, z = -15 + Math.sin(a) * r;
    const w = 8 + rnd() * 16, h = 7 + rnd() * 14, d = 8 + rnd() * 10;
    const b = new THREE.BoxGeometry(w, h, d);
    b.rotateY(-a + HP); b.translate(x, h / 2, z);
    geos.push(b);
    // crenellated parapet
    for (let k = 0; k < Math.floor(w / 1.6); k++) {
      const m = new THREE.BoxGeometry(0.8, 0.9, d + 0.2);
      m.translate(-w / 2 + 0.8 + k * 1.6, h + 0.45, 0); m.rotateY(-a + HP); m.translate(x, 0, z);
      geos.push(m);
    }
    if (rnd() < 0.3) { // a rooftop chhatri
      const c = new THREE.CylinderGeometry(1.4, 1.4, 2.2, 8); c.translate(x, h + 1.1, z); geos.push(c);
      const d2 = new THREE.SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); d2.translate(x, h + 2.2, z); geos.push(d2);
    }
    if (rnd() < 0.3) { const t = new THREE.SphereGeometry(4 + rnd() * 4, 8, 6); t.translate(x + 6, 5, z + 4); geos.push(t); }
    // a few lit windows facing the fort
    for (let k = 0; k < 3; k++) if (rnd() < 0.45) {
      const wq = new THREE.PlaneGeometry(0.9, 1.3);
      const off = -w / 2 + 1.5 + rnd() * (w - 3), yy = 2 + rnd() * (h - 4);
      wq.translate(off, yy, d / 2 + 0.05); wq.rotateY(-a + HP + Math.PI); wq.translate(x, 0, z);
      lit.push(wq);
    }
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0x1c1524, fog: true });
  const merged = new THREE.Mesh(mergeAll(geos), mat);
  merged.matrixAutoUpdate = false;
  ctx.root.add(merged);
  if (lit.length) {
    const lm = new THREE.Mesh(mergeAll(lit), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a40).multiplyScalar(0.55), fog: true, side: THREE.DoubleSide }));
    lm.matrixAutoUpdate = false;
    ctx.root.add(lm);
  }
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('glow'), color: 0xff8a50, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.8 }));
  sun.position.set(-0.85 * 330, 0.28 * 330 - 40, 0.25 * 330);
  sun.scale.set(150, 150, 1);
  sun.renderOrder = -5;
  ctx.root.add(sun);
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIdx = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; });
  const pos: number[] = [];
  for (const g of nonIdx) pos.push(...(g.getAttribute('position').array as Float32Array));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

/**
 * The engine batches the map's walls, masses, floors and stairs per material with no spatial locality, and every
 * one of those meshes casts. Fold them into our cells instead (one arch draw per cell, one shadow proxy per cell)
 * and hide the originals. Only meshes built from this map's arch materials are touched (doors, windows, machines
 * and props keep their own meshes).
 */
function takeOverEngineGeometry(parent: THREE.Object3D): void {
  const m = kitMerger();
  const victims: THREE.Mesh[] = [];
  parent.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || me.userData.lh || (me as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(me.material)) return;
    if (LM.layerOf(me.material) === undefined || !me.visible) return;
    victims.push(me);
  });
  for (const l of LADDERS) {
    const [x, z, , y0] = ladderPose(l);
    for (const c of parent.children) if ((c as THREE.Group).isGroup && Math.hypot(c.position.x - x, c.position.y - y0, c.position.z - z) < 0.01) c.visible = false;
  }
  for (const me of victims) {
    me.updateMatrixWorld();
    m.addSplit(me.material as THREE.Material, me.geometry, me.matrixWorld, { tier: 'far' });
    if (me.castShadow) m.addShadowSplit(me.geometry, me.matrixWorld);
    me.visible = false;
  }
}

// ------------------------------------------------------------------------------------------------
export function updateLahore(u: MapUpdateContext): void {
  if (!root) return;
  const m = kitMerger();
  m.hideProxies();
  const { time, power } = u;
  if (power !== lastPower) {
    lastPower = power;
    LM.setPower(power);
    if (glowPost) glowPost.visible = power;
    if (flamePost) flamePost.visible = power;
    poolT = 0;
  }
  // Flicker the glow and flame points (cheap: a few hundred colour writes).
  for (const [pts, list] of [[glowPre, preAnchors], [glowPost, postAnchors]] as const) {
    if (!pts || !pts.visible) continue;
    const c = pts.geometry.getAttribute('color') as THREE.BufferAttribute, base = pts.geometry.userData.base as Float32Array;
    for (let i = 0; i < list.length; i++) {
      const f = (list[i].kind === 'chandelier' ? 1 : 0.8 + 0.2 * Math.sin(time * 9 + i * 2.3) * Math.sin(time * 3.7 + i)) * (u.blackout ? 0.2 : 1);
      c.setXYZ(i, base[i * 3] * f, base[i * 3 + 1] * f, base[i * 3 + 2] * f);
    }
    c.needsUpdate = true;
  }
  for (const pts of [flamePre, flamePost]) {
    if (!pts || !pts.visible) continue;
    (pts.material as THREE.PointsMaterial).size = (pts === flamePre ? 0.26 : 0.16) * (0.9 + 0.12 * Math.sin(time * 13) * Math.sin(time * 5.1));
    (pts.material as THREE.PointsMaterial).opacity = u.blackout ? 0.25 : 1;
  }
  // Re-assign the light pool to the nearest active anchors.
  poolT -= u.dt;
  const p = u.player;
  const moved = p && Math.hypot(p.x - poolAt.x, p.y - poolAt.y, p.z - poolAt.z) > 3;
  if (p && (poolT <= 0 || moved)) {
    poolT = 0.25;
    poolAt.x = p.x; poolAt.y = p.y; poolAt.z = p.z;
    const active = anchors.filter((a) => (power ? LAMP[a.kind].post : LAMP[a.kind].pre) > 0);
    const scored = active.map((a) => ({ a, d: Math.hypot(a.x - p.x, (a.y - p.y - 1.5) * 2.2, a.z - p.z) })).filter((s) => s.d < 40).sort((x, y) => x.d - y.d).slice(0, POOL);
    pool.forEach((sl, i) => { sl.a = scored[i]?.a ?? null; if (sl.a) sl.light.position.set(sl.a.x, sl.a.y, sl.a.z); });
  }
  for (const sl of pool) {
    if (!sl.a) { sl.light.intensity = 0; continue; }
    const L = LAMP[sl.a.kind];
    const flick = sl.a.kind === 'torch' || sl.a.kind === 'forge' ? 0.82 + 0.18 * Math.sin(time * 11 + sl.phase) * Math.sin(time * 4.3 + sl.phase * 2) : 1;
    sl.light.color.setHex(u.blackout ? 0xff3010 : L.color);
    sl.light.distance = L.range;
    sl.light.intensity = (power ? L.post : L.pre) * flick * (u.blackout ? (Math.sin(time * 5 + sl.phase) > 0.7 ? 0.05 : 0.22) : 1);
  }
  // Distance-cull the fine-detail tier (the fog hides it anyway).
  cullT -= u.dt;
  if (p && cullT <= 0) { cullT = 0.4; m.cull(p.x, p.z); }
  kites.forEach((k, i) => {
    k.m.position.set(k.x + Math.sin(time * 0.4 + k.ph) * 3, k.y + Math.sin(time * 0.9 + k.ph) * 1.2, k.z + Math.cos(time * 0.3 + k.ph) * 2);
    k.m.rotation.set(Math.sin(time * 1.3 + k.ph) * 0.3, time * 0.2 + k.ph, Math.sin(time * 1.7 + k.ph) * 0.4);
    k.m.updateMatrix();
    for (const im of kiteMeshes) im.setMatrixAt(i, k.m.matrix);
  });
  for (const im of kiteMeshes) im.instanceMatrix.needsUpdate = true;
  if (birdMesh) {
    birds.forEach((b, i) => {
      const a = time * b.sp + b.ph;
      b.m.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(a * 2.3) * 0.8, b.cz + Math.sin(a) * b.r);
      b.m.rotation.set(0.25, -a + Math.PI, Math.sin(time * 14 + b.ph) * 0.25);
      b.m.scale.setScalar(1.3);
      b.m.updateMatrix();
      birdMesh!.setMatrixAt(i, b.m.matrix);
    });
    birdMesh.instanceMatrix.needsUpdate = true;
  }
}
