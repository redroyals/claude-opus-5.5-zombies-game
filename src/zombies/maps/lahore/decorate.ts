// Bespoke dressing for the Lahore Darbar: instanced kit architecture (arcades, domes, jharokhas, mirror panels,
// parapets), Meshy hero props, a pooled light rig for hundreds of lamp anchors, flame/diya glow points, kites,
// a dusk skyline and the post-power transformation. Everything solid also gets a collider in ctx.world.
import * as THREE from 'three';
import { models, type LoadedModel } from '../../../render/ModelRegistry';
import type { MapDecorateContext, MapUpdateContext } from '../types';
import { BOX_SPOTS, B, DOORS, G, P, PAP_SPOT, PERK_SPOTS, R, U, U2, WALL_BUY_SPOTS, WINDOWS, type Side, type Surf } from './layout';
import { LAHORE_RASTER } from './def';
import { AREAS, type AreaDef } from './layout';
import { GRID, GRID_W } from './raster';
import { kitSlot, lahoreMaterials, type LahoreMaterials } from './materials';

// ------------------------------------------------------------------------------------------------
// Instanced placement: every (model, material-remap) pair becomes one InstancedMesh per primitive.
// ------------------------------------------------------------------------------------------------
interface KitOpts { stone?: Surf; trim?: Surf; matte?: boolean; shadow?: boolean; bright?: number }
interface Batch { path: string; opts: KitOpts; mats: THREE.Matrix4[] }
const batches = new Map<string, Batch>();
let root: THREE.Group | null = null;
let world: MapDecorateContext['world'] | null = null;
let LM: LahoreMaterials;

function put(path: string, x: number, y: number, z: number, yaw = 0, scale: number | [number, number, number] = 1, opts: KitOpts = {}): void {
  // Spatial cells (40 m) keep each InstancedMesh's bounds small enough for frustum/shadow culling.
  const cell = `${Math.floor(x / 40)},${Math.floor(z / 40)}`;
  const key = `${path}|${opts.stone ?? ''}|${opts.trim ?? ''}|${opts.matte ? 1 : 0}|${opts.bright ?? 1}|${cell}`;
  let b = batches.get(key);
  if (!b) batches.set(key, (b = { path, opts, mats: [] }));
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  b.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s[0], s[1], s[2])));
}

/** Axis-aligned collider for a footprint w (local x) x d (local z) rotated by a multiple of 90 degrees. */
function col(x: number, y: number, z: number, w: number, d: number, h: number, yaw = 0, solid = true): void {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
  world!.add(x - hx, y, z - hz, x + hx, y + h, z + hz, { surface: 'concrete', solid });
}

function remap(mat: THREE.Material, o: KitOpts): THREE.Material {
  const slot = kitSlot(LM, mat.name, o.stone, o.trim);
  if (slot) return slot;
  if (o.matte && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const m = (mat as THREE.MeshStandardMaterial).clone();
    if (!m.metalnessMap) m.metalness = Math.min(m.metalness, 0.15);
    if (o.bright) m.color.multiplyScalar(o.bright);
    return m;
  }
  return mat;
}

function realise(b: Batch, lm: LoadedModel): void {
  const scene = lm.scene;
  scene.updateMatrixWorld(true);
  const tmp = new THREE.Matrix4();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats.length === 1 ? remap(mats[0], b.opts) : mats.map((m) => remap(m, b.opts));
    const im = new THREE.InstancedMesh(mesh.geometry, mat, b.mats.length);
    b.mats.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, mesh.matrixWorld)));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = b.opts.shadow ?? SHADOW_CASTERS.test(b.path);
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.frustumCulled = true;
    im.userData.center = cellCenter(b.mats);
    instanced.push(im);
    root!.add(im);
  });
}

const instanced: THREE.InstancedMesh[] = [];
let cullT = 0;
function cellCenter(ms: THREE.Matrix4[]): THREE.Vector3 {
  const c = new THREE.Vector3(), p = new THREE.Vector3();
  for (const m of ms) c.add(p.setFromMatrixPosition(m));
  return c.multiplyScalar(1 / Math.max(1, ms.length));
}

/** Only big silhouettes cast sun shadows (the shadow pass is the expensive half of the frame). */
const SHADOW_CASTERS = /kit_(column|arch_span|chhatri|burj|bangla_roof|baradari_roof|jharokha)|great_gun/;

function flushBatches(): void {
  for (const b of batches.values()) void models.load(b.path).then((lm) => { if (lm) realise(b, lm); });
}

// ------------------------------------------------------------------------------------------------
// Light anchors: a flame/glow point for every lamp; a small pool of real point lights follows the player.
// ------------------------------------------------------------------------------------------------
type LampKind = 'torch' | 'lantern' | 'chandelier' | 'diya' | 'forge' | 'mirror';
interface Anchor { x: number; y: number; z: number; kind: LampKind }
const anchors: Anchor[] = [];
const LAMP: Record<LampKind, { color: number; pre: number; post: number; range: number; glow: number }> = {
  torch: { color: 0xff8a3a, pre: 40, post: 45, range: 15, glow: 1.6 },
  lantern: { color: 0xffb060, pre: 18, post: 28, range: 12, glow: 1.2 },
  chandelier: { color: 0xffd9a0, pre: 0, post: 38, range: 18, glow: 2.0 },
  diya: { color: 0xffa040, pre: 0, post: 0, range: 0, glow: 0.9 },
  forge: { color: 0xff5a1a, pre: 14, post: 26, range: 9, glow: 2 },
  mirror: { color: 0xcfe6ff, pre: 0, post: 10, range: 10, glow: 0 },
};
const lamp = (x: number, y: number, z: number, kind: LampKind) => anchors.push({ x, y, z, kind });

const POOL = 8;
const pool: { light: THREE.PointLight; a: Anchor | null; phase: number }[] = [];
let glowPre: THREE.Points | null = null, glowPost: THREE.Points | null = null;
let preAnchors: Anchor[] = [], postAnchors: Anchor[] = [];
let lastPower = false, poolT = 0;
const kites: { m: THREE.Object3D; x: number; y: number; z: number; ph: number }[] = [];
let drumSticks: THREE.Group | null = null;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,230,180,0.8)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowPoints(list: Anchor[], tex: THREE.Texture): THREE.Points {
  const pos = new Float32Array(list.length * 3), colr = new Float32Array(list.length * 3);
  list.forEach((a, i) => {
    pos.set([a.x, a.y, a.z], i * 3);
    const c = new THREE.Color(LAMP[a.kind].color).multiplyScalar(LAMP[a.kind].glow);
    colr.set([c.r, c.g, c.b], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.userData.base = colr.slice();
  const m = new THREE.PointsMaterial({ size: 0.42, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// ------------------------------------------------------------------------------------------------
// Placement helpers
// ------------------------------------------------------------------------------------------------
const K = (n: string) => `lahore/kit_${n}.glb`;
const PR = (n: string) => `lahore/${n}.glb`;
const HP = Math.PI / 2;

/** A row of columns + arch spans between them (an arcade). `s` scales the kit (native height 4.8). */
function arcade(x0: number, z0: number, x1: number, z1: number, n: number, y: number, s: number, stone: Surf, trim: Surf, colliders = true): void {
  const dx = (x1 - x0) / n, dz = (z1 - z0) / n;
  const span = Math.hypot(dx, dz), yaw = Math.abs(dx) > Math.abs(dz) ? 0 : HP;
  for (let i = 0; i <= n; i++) {
    const x = x0 + dx * i, z = z0 + dz * i;
    put(K('column'), x, y, z, 0, s, { stone, trim });
    if (colliders) col(x, y, z, 0.62 * s, 0.62 * s, 4.2 * s);
    if (i < n) put(K('arch_span'), x + dx / 2, y, z + dz / 2, yaw, [span / 3, s, s], { stone, trim });
  }
}

/** Kangura merlons along a line (3 m modules). */
function kanguras(axis: 'x' | 'z', at: number, a0: number, a1: number, y: number, yaw: number, stone: Surf = 'sandstone'): void {
  const n = Math.max(1, Math.round((a1 - a0) / 3));
  const len = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const c = a0 + len * (i + 0.5);
    put(K('kangura'), axis === 'x' ? c : at, y, axis === 'x' ? at : c, yaw, [len / 3, 1, 1], { stone });
  }
}

function torchesOnWall(axis: 'x' | 'z', at: number, a0: number, a1: number, y: number, yaw: number, every = 8): void {
  for (let a = a0 + every / 2; a < a1; a += every) {
    const x = axis === 'x' ? a : at, z = axis === 'x' ? at : a;
    put(PR('torch_bracket'), x, y + 1.9, z, yaw, 0.9, { matte: true, shadow: false });
    const fx = Math.sin(yaw) * 0.25, fz = Math.cos(yaw) * 0.25;
    lamp(x + fx, y + 2.4, z + fz, 'torch');
  }
}

function diyaRow(x0: number, z0: number, x1: number, z1: number, y: number, every = 1.2): void {
  const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, z1 - z0) / every));
  for (let i = 0; i <= n; i++) lamp(x0 + ((x1 - x0) * i) / n, y + 0.08, z0 + ((z1 - z0) * i) / n, 'diya');
}

function prop(name: string, x: number, y: number, z: number, yaw = 0, s = 1, collider?: [number, number, number]): void {
  put(PR(name), x, y, z, yaw, s, { matte: true, shadow: s * 2 > 3 });
  if (collider) col(x, y, z, collider[0] * s, collider[1] * s, collider[2] * s, yaw);
}
function reuse(name: string, x: number, y: number, z: number, yaw = 0, s = 1, collider?: [number, number, number]): void {
  put(`lahore/reuse/${name}.glb`, x, y, z, yaw, s, { matte: true, shadow: false });
  if (collider) col(x, y, z, collider[0] * s, collider[1] * s, collider[2] * s, yaw);
}

// ------------------------------------------------------------------------------------------------
export function decorateLahore(ctx: MapDecorateContext): void {
  root = ctx.root;
  world = ctx.world;
  LM = lahoreMaterials();
  batches.clear();
  instanced.length = 0;
  anchors.length = 0;
  kites.length = 0;
  pool.length = 0;

  // ================= HAZURI BAGH =================
  // Baradari: 12 columns, arched openings, marble roof with corner chhatris.
  {
    const xs = [-6, -3.33, -0.67, 2], zs = [4, 6.67, 9.33, 12], s = 0.917;
    for (const z of [4, 12]) arcade(-6, z, 2, z, 3, P, s, 'marble', 'inlay');
    for (const x of [-6, 2]) arcade(x, 4, x, 12, 3, P, s, 'marble', 'inlay');
    void xs; void zs;
    put(K('baradari_roof'), -2, 8.6, 8, 0, 1, { stone: 'marble', trim: 'inlay' });
    put(PR('chandelier'), -2, 7.1, 8, 0, 0.9);
    lamp(-2, 7.3, 8, 'chandelier');
    for (const [x, z] of [[-7.6, 2.4], [3.6, 2.4], [-7.6, 13.6], [3.6, 13.6]]) lamp(x, P + 0.15, z, 'diya');
    diyaRow(-8, 14, 4, 14, P); diyaRow(-8, 2, 4, 2, P);
  }
  // Charbagh beds, cypresses and fountains
  for (const [x0, z0, x1, z1] of [[-16, -4, -11, 0], [7, -4, 12, 0], [-16, 14, -11, 17], [7, 14, 12, 17]]) {
    ctx.batch.add(LM.surf.garden, boxGeo(x0, G, z0, x1, G + 0.75, z1));
    world.add(x0, G, z0, x1, G + 0.75, z1, { surface: 'dirt' });
    cypress(ctx, (x0 + x1) / 2, G + 0.75, (z0 + z1) / 2);
  }
  for (const x of [-13.5, 9.5]) { put(K('fountain'), x, G, 8, 0, 1, { stone: 'marble', trim: 'inlay' }); col(x, G, 8, 4, 4, 0.55); }
  // Alamgiri Gate: grand arch and two bastion towers on the garden side
  put(K('arch_bay'), -1, G, -6.2, 0, [1.6, 1.4, 1.6], { stone: 'sandstone', trim: 'marble' });
  for (const x of [-8, 6]) { put(K('burj'), x, G, -7.5, 0, [0.42, 0.9, 0.42], { stone: 'sandstone', trim: 'marble' }); col(x, G, -7.3, 4.4, 3.2, 9.2); put(K('chhatri'), x, G + 9.2, -7.5, 0, 0.9, { stone: 'marble', trim: 'sandstone' }); lamp(x, G + 10.5, -7.5, 'lantern'); }
  put(K('door_frame'), 14.2, G, 11, HP, [1.1, 1.0, 1.0], { stone: 'sandstone', trim: 'marble' }); // Roshnai Gate
  put(K('door_frame'), -18.2, G, 13.5, -HP, [0.85, 1.0, 1.0], { stone: 'sandstone', trim: 'marble' }); // Sher Darwaza
  torchesOnWall('x', 19.8, -16, 12, G, Math.PI, 7);
  torchesOnWall('z', 13.8, -4, 8, G, -HP, 6);
  torchesOnWall('z', -17.8, -4, 10, G, HP, 7);
  reuse('area-rug', -2, P + 0.01, 10.2, 0, 1.4);

  // ================= TOP KHANA (cannon yard) =================
  prop('great_gun', -35, G + 0.4, 6.5, HP, 1, [3.0, 7.5, 2.6]);
  for (const [x, z] of [[-40.5, 4], [-29.5, 9], [-40.5, 9.5]]) prop('cannonballs', x, G, z, 0, 1, [1.1, 1.1, 0.8]);
  for (const [x, z, yaw] of [[-45, 16, 0.4], [-26, 16, -0.3], [-47, -2, 1.2]]) reuse('sikh-cannon', x, G, z, yaw, 1.8, [1.3, 1.1, 0.9]);
  for (const x of [-48, -40, -24]) prop('strongboxes', x, G, 18.6, 0, 0.8, [1.1, 0.8, 1.3]);
  torchesOnWall('x', 19.8, -50, -20, G, Math.PI, 7);
  // Hathi Pol: elephant-stair side walls get torches; the gate at the top is a big arch.
  torchesOnWall('z', -46.2, -38, -8, G + 2, -HP, 9);
  put(K('arch_bay'), -44.2, U, -45, HP, [1.4, 1.2, 1.4], { stone: 'sandstone', trim: 'marble' });
  put(K('arch_bay'), -30.6 + 0, G, -6.2, 0, [1.4, 1.2, 1.4], { stone: 'sandstone', trim: 'sandstone' }); // armoury gate

  // ================= SILAH KHANA (armoury, PaP) =================
  arcade(-40, -26, -22, -26, 6, G, 1.25, 'sandstone', 'sandstone');
  arcade(-40, -16, -22, -16, 6, G, 1.25, 'sandstone', 'sandstone');
  for (let x = -41; x <= -23; x += 4.5) { prop('armour_stand', x, G, -29.2, 0, 1, [1.0, 0.8, 1.9]); prop('weapon_rack', x + 2.2, G, -29.3, 0, 1, [2.0, 0.5, 2.0]); }
  for (const x of [-40, -23]) prop('weapon_rack', x, G, -6.8, Math.PI, 1, [2.0, 0.5, 2.0]);
  for (let i = 0; i < 7; i++) put(K('jaali'), -18, G, -30 + (20 / 7) * (i + 0.5), HP, [20 / 7 / 2, 2.0, 1.5], { stone: 'sandstone' });
  lamp(-43.2, G + 1.2, -16.2, 'forge');
  lamp(-31, G + 5.5, -21, 'lantern');
  put(PR('chandelier'), -31, G + 4.6, -21, 0, 1.1);
  torchesOnWall('x', -29.8, -42, -20, G, 0, 7);

  // ================= DIWAN-E-AAM =================
  // The 40-pillared hall: two rows of red sandstone arcades on the plinth.
  arcade(-18, -30.5, 10, -30.5, 7, P, 1.42, 'sandstone', 'marble');
  arcade(-18, -35, -6, -35, 3, P, 1.42, 'sandstone', 'marble');
  arcade(2, -35, 10, -35, 2, P, 1.42, 'sandstone', 'marble');
  put(K('jharokha'), -2, U - 0.9, -39.9, 0, 1.5, { stone: 'marble', trim: 'inlay' }); // the royal balcony
  put(PR('throne_dais'), -2, P, -35.6, 0, 0.9);
  col(-2, P, -35.6, 2.4, 2.2, 1.3);
  put(PR('chandelier'), -9, 9.4, -35, 0, 1.2); put(PR('chandelier'), 5, 9.4, -35, 0, 1.2);
  lamp(-9, 9.6, -35, 'chandelier'); lamp(5, 9.6, -35, 'chandelier');
  torchesOnWall('z', -17.8, -28, -12, G, HP, 8);
  torchesOnWall('x', -10.2, -16, 12, G, Math.PI, 8);
  reuse('area-rug', -2, P + 0.01, -33, 0, 2.2);
  for (const x of [-14, 6]) { put(PR('pedestal'), x, G, -12.5, 0, 0.9); reuse('brass-vase', x, G + 1.26, -12.5, 0, 2.2); col(x, G, -12.5, 0.5, 0.5, 1.8); }
  diyaRow(-18, -30.2, 10, -30.2, P);

  // ================= TOSHAKHANA + vault =================
  arcade(16, -17, 28, -17, 4, G, 1.2, 'sandstone', 'marble');
  put(PR('pedestal'), 18, B, -44.4, 0, 1.0);
  reuse('kohinoor-gem', 18, B + 1.42, -44.4, 0, 0.18);
  lamp(18, B + 2.2, -44.4, 'lantern');
  for (const [x, z, yaw] of [[15.2, -34, HP], [15.2, -38, HP], [28.8, -44, -HP], [28.8, -36, -HP]]) prop('chest_gold', x, B, z, yaw, 1, [1.2, 1.0, 1.2]);
  for (const [x, z] of [[25.5, -45.2], [26.8, -45.2], [15.4, -41]]) prop('strongboxes', x, B, z, 0, 0.9, [1.1, 0.8, 1.3]);
  for (const [x, z] of [[21, -33], [21, -40], [27, -40]]) lamp(x, B + 3.2, z, 'lantern');
  torchesOnWall('x', -23.8, 15, 30, G, 0, 5);
  put(PR('chandelier'), 22, 7.4, -17, 0, 1); lamp(22, 7.6, -17, 'chandelier');

  // ================= SHAH BURJ =================
  put(K('fountain'), -18, U, -49, 0, 1.3, { stone: 'marble', trim: 'inlay' }); col(-18, U, -49, 5.2, 5.2, 0.6);
  // Naulakha: marble pavilion with the curved bangla roof
  for (const [a, b] of [[[-42, -56], [-34, -56]], [[-42, -48], [-34, -48]]] as const) arcade(a[0], a[1], b[0], b[1], 3, U2, 0.8, 'marble', 'inlay');
  put(K('bangla_roof'), -38, 12.2, -52, 0, 1, { stone: 'marble', trim: 'inlay' });
  // Diwan-e-Khas: open marble pavilion (4x3 bays) with chhatris on the corners
  arcade(0, -54, 12, -54, 4, U2, 0.95, 'marble', 'inlay'); arcade(0, -44, 12, -44, 4, U2, 0.95, 'marble', 'inlay');
  arcade(0, -54, 0, -44, 3, U2, 0.95, 'marble', 'inlay'); arcade(12, -54, 12, -44, 3, U2, 0.95, 'marble', 'inlay');
  for (const [x, z] of [[0, -54], [12, -54], [0, -44], [12, -44]]) put(K('chhatri'), x, 13.45, z, 0, 0.8, { stone: 'marble', trim: 'inlay' });
  lamp(6, 11.5, -49, 'chandelier'); put(PR('chandelier'), 6, 11.3, -49, 0, 1);
  reuse('area-rug', 6, U2 + 0.01, -49, 0, 2.4);
  torchesOnWall('x', -57.8, -44, 14, U, 0, 8);
  torchesOnWall('x', -40.2, -44, 14, U, Math.PI, 9);
  kanguras('x', -58.2, -44, 14, 13, 0);
  // Flags of the Sikh Empire on the high walls (decor only, never on a target)
  for (const [x, z] of [[-30, -58.4], [-10, -58.4], [13.6, -52]]) reuse('flag-ranjit-singh', x, 13, z, 0, 1.2);

  // ================= SHEESH MAHAL =================
  for (let x = -32.5; x < -6; x += 3) put(K('mirror_panel'), x, U, -69.85, 0, 1, { stone: 'sandstone' });
  for (let z = -68.5; z < -58; z += 3) { put(K('mirror_panel'), -33.85, U, z, HP, 1); put(K('mirror_panel'), -6.15, U, z, -HP, 1); }
  for (const x of [-32.5, -29.5, -26.5, -14, -11, -8]) put(K('mirror_panel'), x, U, -58.15, Math.PI, 1);
  for (const x of [-32.5, -26.5, -20.5, -14.5, -8.5]) for (const z of [-69.85]) put(K('mirror_panel'), x, U + 4, z, 0, 1);
  arcade(-28, -64.5, -12, -64.5, 4, U, 1.1, 'marble', 'mirror');
  arcade(-28, -61, -12, -61, 4, U, 1.1, 'marble', 'mirror');
  for (const x of [-26, -20, -14]) { put(PR('chandelier'), x, 12.4, -64, 0, 1.3); lamp(x, 12.6, -64, 'chandelier'); }
  for (let x = -32; x < -7; x += 4) lamp(x, U + 2.2, -69.3, 'mirror');
  put(PR('throne_dais'), -29, U, -67.6, 0, 0.9); col(-29, U, -67.6, 2.4, 2.2, 1.3);
  for (const [x, z, yaw] of [[-33.85, -66, HP], [-6.15, -62.5, -HP], [-28, -69.85, 0]] as const) put(K('mirror_medallion'), x, U + 1.0, z, yaw, 1.3, { shadow: false });
  for (const [x, z, yaw] of [[-33.85, -61, HP], [-6.15, -67, -HP], [-14, -69.85, 0]] as const) put(K('mirror_medallion'), x, U + 2.6, z, yaw, 1.1, { shadow: false });
  lamp(-20, U + 1.5, -64, 'lantern');

  // ================= RAMPARTS =================
  kanguras('z', -58.2, -58, 20, U, HP);
  kanguras('z', -51.9, -6, 20, U, -HP);
  torchesOnWall('z', -57.8, -54, 18, U, HP, 10);
  put(K('burj'), -55, U - 7.2 + 3.1, 32, 0, [1, 0.7, 1], { stone: 'sandstone', trim: 'marble' });
  put(K('chhatri'), -55, R, 32, 0, 1.3, { stone: 'marble', trim: 'sandstone' }); col(-55, R, 32, 2.6 * 1.3, 2.6 * 1.3, 0.35);
  lamp(-55, R + 3, 32, 'torch');
  for (const [x, z] of [[-57, -20], [-57, 5]]) reuse('flag-ranjit-singh', x, U + 1.1, z, HP, 1.4);

  // ================= ROSHNAI GATE + GALLI =================
  arcade(16, 8.2, 32, 8.2, 4, G, 1.05, 'brick', 'sandstone', false);
  torchesOnWall('x', 8.2, 15, 33, G, 0, 6);
  hav(ctx);

  // ================= light rig =================
  const tex = glowTexture();
  preAnchors = anchors.filter((a) => LAMP[a.kind].pre > 0 || a.kind === 'torch' || a.kind === 'forge');
  postAnchors = anchors.filter((a) => !preAnchors.includes(a) && a.kind !== 'mirror');
  glowPre = glowPoints(preAnchors, tex);
  glowPost = glowPoints(postAnchors, tex);
  glowPost.visible = false;
  root.add(glowPre, glowPost);
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xffa050, 0, 14, 1.6);
    l.castShadow = false;
    root.add(l);
    pool.push({ light: l, a: null, phase: i * 1.37 });
  }
  skyline(ctx);
  flushBatches();
  // Barricade planks are many small meshes: keep them out of the sun's shadow pass.
  ctx.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry?.type === 'BoxGeometry' && (m.material as THREE.Material).type === 'MeshStandardMaterial') m.castShadow = false; });
  lastPower = false;
}

// ================= HAVELI DISTRICT =================
function hav(ctx: MapDecorateContext): void {
  facades();
  wallDressing();
  torchesOnWall('x', -23.8, 40, 86, G, 0, 11);
  // Wazir courtyard: the giant pipal (landmark), charpai, pots, galleries with wooden pillars
  pipal(ctx, 50, G, -6); col(50, G, -6, 1.4, 1.4, 6);
  prop('charpai', 46.5, G, -1.2, 0, 1, [2.0, 1.0, 0.6]);
  prop('matka_pots', 52.8, G, -14.8, 0, 1, [1.0, 1.0, 1.0]);
  for (let x = 45; x <= 54; x += 3) put(K('pillar_wood'), x, U, -16.15, 0, 0.8, {});
  for (let z = -13; z <= 1; z += 3) put(K('pillar_wood'), 41.85, U, z, 0, 0.8, {});
  for (let z = -13; z <= -4; z += 3) put(K('pillar_wood'), 54.15, U, z, 0, 0.8, {});
  lamp(48, U + 2.4, -17, 'lantern'); lamp(40, U + 2.4, -6, 'lantern'); lamp(44, G + 2.2, -1, 'lantern');
  diyaRow(42.3, -16.1, 54, -16.1, U + 1.0); diyaRow(42.1, -15.8, 42.1, 1, U + 1.0);
  // Chowk: the well, tea stall, spice stall
  prop('well', 62.5, G, 7, 0, 1, [2.5, 2.5, 1.0]);
  prop('chai_stall', 60.5, G, 4.4, 0, 1, [1.8, 0.9, 1.0]);
  prop('spice_stall', 64.6, G, 3.9, 0, 1, [2.2, 0.9, 1.4]);
  prop('palki', 44, G, 7.5, HP, 1, [2.4, 0.9, 1.4]);
  lamp(62.5, G + 3.4, 7, 'lantern');
  // Naqqar Khana: the drum pavilion (POWER) under a great chhatri, galleries and hanging lanterns
  put(K('chhatri'), 73, P - 0.69, -3, 0, 2.3, { stone: 'marble', trim: 'inlay' });
  for (const [x, z] of [[70.5, -5.5], [75.5, -5.5], [70.5, -0.5], [75.5, -0.5]]) col(x, P, z, 0.5, 0.5, 4.5);
  for (let x = 69; x <= 80; x += 3) put(K('pillar_wood'), x, U, -16.15, 0, 0.8, {});
  for (let z = -13; z <= 10; z += 3) { put(K('pillar_wood'), 65.85, U, z, 0, 0.8, {}); put(K('pillar_wood'), 80.15, U, z, 0, 0.8, {}); }
  for (const [x, z] of [[68, -12], [78, -12], [68, 7], [78, 7], [73, -10], [73, 5]]) lamp(x, G + 4.8, z, 'lantern');
  for (const [x, z] of [[67.5, -14.5], [78.5, 8.5]]) prop('matka_pots', x, G, z, 0, 1, [1.0, 1.0, 1.0]);
  diyaRow(66.2, -15.8, 80, -15.8, U + 1.0); diyaRow(66, 10.2, 80, 10.2, U + 1.0); diyaRow(79.8, -16, 79.8, 10, U + 1.0);
  drumSticks = new THREE.Group();
  drumSticks.position.set(73, P, -3);
  root!.add(drumSticks);
  // Kothay: kite terraces, charpais, water pots, parapet lanterns, kites overhead
  for (const [x, z] of [[40, 30], [55, 14], [70, 30], [82, 24]]) prop('charpai', x, R, z, 0.3, 1, [2.0, 1.0, 0.6]);
  for (const [x, z] of [[38.6, 12], [57, 31], [64, 15]]) prop('matka_pots', x, R, z, 0, 1, [1.0, 1.0, 1.0]);
  for (const [x, z] of [[48, 20], [72, 22], [44, 3.5]]) put(K('chhatri'), x, R, z, 0, 0.9, { stone: 'plasterOchre', trim: 'marble' });
  for (const [x, z] of [[48, 20], [72, 22], [44, 3.5]]) col(x, R, z, 2.34, 2.34, 0.3);
  diyaRow(37.3, 9.3, 37.3, 32.7, R + 0.5); diyaRow(37.5, 32.7, 58.7, 32.7, R + 0.5); diyaRow(62.3, 32.7, 83.7, 32.7, R + 0.5);
  for (const [x, z] of [[40.5, 29.5], [47, 10.5], [66, 30]]) lamp(x, R + 1.2, z, 'lantern');
  for (let i = 0; i < 9; i++) {
    const k = new THREE.Group();
    const x = 40 + ((i * 17) % 46), z = -10 + ((i * 23) % 44), y = R + 14 + (i % 4) * 3;
    k.position.set(x, y, z);
    root!.add(k);
    kites.push({ m: k, x, y, z, ph: i * 1.7 });
  }
  void models.load(K('kite')).then((lm) => {
    if (!lm) return;
    for (const k of kites) {
      const inst = models.instance(lm);
      inst.scale.setScalar(2.2);
      inst.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mt = kitSlot(LM, (m.material as THREE.Material).name); if (mt) m.material = mt; m.castShadow = false; } });
      k.m.add(inst);
    }
  });
  // Tehkhana: cistern, strongboxes, candles
  put(K('cistern'), 38, 2.5, -40, 0, 0.8, { stone: 'stoneDark' });
  col(38, B, -40, 5.6, 5.6, 2.5);
  for (const [x, z] of [[31.5, -45], [46.5, -45], [31.2, -33]]) prop('strongboxes', x, B, z, 0, 0.9, [1.1, 0.8, 1.3]);
  for (const [x, z] of [[33, -36], [44, -36], [41, -44], [33, -44]]) lamp(x, B + 1.2, z, 'torch');
  // Haveli doors get carved frames
  for (const [x, z, yaw] of [[36.8, -8, -HP], [59.2, -10, HP], [66.2, 6.5, HP]] as const) put(K('door_frame'), x, G, z, yaw, [0.85, 1, 1], { stone: 'plasterOchre', trim: 'wood' });
  void ctx;
}

let cypressMat: THREE.Material | null = null;
/** Is a point on a wall line too close to something mounted on or standing against it? */
function busy(x: number, y: number, z: number, r: number): boolean {
  for (const d of DOORS) {
    const mid = (d.a0 + d.a1) / 2, half = (d.a1 - d.a0) / 2;
    const [dx, dz] = d.axis === 'x' ? [mid, d.at] : [d.at, mid];
    if (Math.abs(d.y0 - y) < 1 && Math.hypot(dx - x, dz - z) < half + r) return true;
  }
  for (const w of WINDOWS) if (Math.abs(w.floor - y) < 1 && Math.hypot(w.x - x, w.z - z) < 1.2 + r) return true;
  for (const w of WALL_BUY_SPOTS) if (Math.abs(w.y - y) < 1 && Math.hypot(w.x - x, w.z - z) < 1 + r) return true;
  for (const s of [...Object.values(PERK_SPOTS), PAP_SPOT, ...BOX_SPOTS]) if (Math.abs(s.y - y) < 1 && Math.hypot(s.x - x, s.z - z) < 1.6 + r) return true;
  return false;
}

const FORT_COURTS = new Set(['bagh', 'topkhana', 'aam_quad', 'burj_quad', 'tosha_hall', 'armoury', 'vault', 'hathi_landing', 'gate_alamgiri']);
const HAVELI_LANES = new Set(['lane_a', 'lanes', 'chowk', 'roshnai_gate']);
const HAVELI_COURTS = new Set(['wazir_court', 'naqqar_court']);
const sideVec = (s: Side): [number, number] => (s === '+x' ? [1, 0] : s === '-x' ? [-1, 0] : s === '+z' ? [0, 1] : [0, -1]);

/** Dress every mass face that bounds a court or lane: blind cusped arcades in the fort, windows and balconies in the havelis. */
function facades(): void {
  for (const f of LAHORE_RASTER.faces) {
    const [sx, sz] = sideVec(f.side);
    const yaw = Math.atan2(-sx, -sz); // face the area
    const len = f.a1 - f.a0;
    const fort = FORT_COURTS.has(f.area), lane = HAVELI_LANES.has(f.area), court = HAVELI_COURTS.has(f.area);
    if (!fort && !lane && !court) continue;
    const step = fort ? 3.6 : 4;
    const n = Math.floor(len / step);
    if (n < 1) continue;
    const pad = (len - n * step) / 2;
    for (let i = 0; i < n; i++) {
      const a = f.a0 + pad + step * (i + 0.5);
      const x = f.axis === 'x' ? a : f.at - sx * 0.02, z = f.axis === 'x' ? f.at - sz * 0.02 : a;
      if (busy(x, f.y, z, step / 2)) continue;
      if (fort) {
        const stone: Surf = f.area === 'bagh' ? 'brick' : f.area === 'burj_quad' ? 'marble' : 'sandstone';
        put(K('arch_bay'), x, f.y, z, yaw, [1.2, f.area === 'vault' ? 0.85 : 1.2, 0.8], { stone, trim: stone === 'marble' ? 'inlay' : 'marble', shadow: false });
      } else {
        put(K('shutter_window'), x, f.y + 1.1, z, yaw, 1, { shadow: false });
        if (lane) {
          if (i % 3 === 1) put(K('wood_balcony'), x, U - 0.3, z, yaw, 1);
          else put(K('shutter_window'), x, U + 0.5, z, yaw, 1, { shadow: false });
          if (i % 4 === 2) lamp(x - sx * 0.45, f.y + 3.0, z - sz * 0.45, 'lantern');
        }
      }
    }
  }
}

/** Tall zone-boundary walls get the same court dressing on whichever side faces a fort court. */
function wallDressing(): void {
  const R = LAHORE_RASTER;
  for (const w of R.walls) {
    if (w.kind !== 'wall' || w.y1 - w.y0 < 4 || w.a1 - w.a0 < 3.6) continue;
    for (const sgn of [-1, 1]) {
      const mid = (w.a0 + w.a1) / 2;
      const px = w.axis === 'x' ? mid : w.at + sgn * 0.5, pz = w.axis === 'x' ? w.at + sgn * 0.5 : mid;
      const i = Math.floor(px - GRID.minX), j = Math.floor(pz - GRID.minZ);
      let area: AreaDef | null = null;
      for (const L of ['G', 'U'] as const) {
        const k = R.grid[L][j * GRID_W + i];
        if (k >= 0 && Math.abs(AREAS[k].floor - w.y0) < 1.3 && !AREAS[k].stair) area = AREAS[k];
      }
      if (!area || !FORT_COURTS.has(area.id) || area.ceiling !== null) continue;
      const yaw = w.axis === 'x' ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? HP : -HP);
      const n = Math.floor((w.a1 - w.a0) / 3.6), pad = (w.a1 - w.a0 - n * 3.6) / 2;
      for (let q = 0; q < n; q++) {
        const a = w.a0 + pad + 3.6 * (q + 0.5);
        const x = w.axis === 'x' ? a : w.at + sgn * 0.17, z = w.axis === 'x' ? w.at + sgn * 0.17 : a;
        if (busy(x, area.floor, z, 1.8)) continue;
        const stone: Surf = area.id === 'bagh' ? 'brick' : area.id === 'burj_quad' ? 'marble' : 'sandstone';
        put(K('arch_bay'), x, area.floor, z, yaw, [1.2, 1.2, 0.8], { stone, trim: stone === 'marble' ? 'inlay' : 'marble', shadow: false });
      }
    }
  }
}

/** Procedural pipal (sacred fig look-alike without religious framing): flared trunk, limbs and a broad canopy of leaf clumps. */
function pipal(ctx: MapDecorateContext, x: number, y: number, z: number): void {
  const bark = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.95 });
  const leafA = new THREE.MeshStandardMaterial({ color: 0x3f6a2c, roughness: 0.85, flatShading: true });
  const leafB = new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 0.85, flatShading: true });
  const trunk = new THREE.CylinderGeometry(0.55, 1.1, 5.5, 10, 4);
  trunk.translate(x, y + 2.75, z);
  ctx.batch.add(bark, trunk);
  let s = 5;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5, L = 3.5 + rnd() * 2;
    const limb = new THREE.CylinderGeometry(0.16, 0.34, L, 6);
    limb.translate(0, L / 2, 0);
    limb.rotateZ(-0.9 - rnd() * 0.3);
    limb.rotateY(a);
    limb.translate(x, y + 4.4 + rnd() * 0.8, z);
    ctx.batch.add(bark, limb);
    for (let r = 0; r < 3; r++) { // aerial roots
      const root = new THREE.CylinderGeometry(0.04, 0.06, 4 + rnd() * 2, 4);
      const rr = 2.2 + rnd() * 2.5, ra = a + (rnd() - 0.5) * 0.6;
      root.translate(x + Math.cos(ra) * rr, y + 3.2 + rnd(), z + Math.sin(ra) * rr);
      ctx.batch.add(bark, root);
    }
  }
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 6.2;
    const blob = new THREE.IcosahedronGeometry(1.4 + rnd() * 1.3, 0);
    blob.scale(1, 0.7, 1);
    blob.translate(x + Math.cos(a) * r, y + 7 + rnd() * 2.6 - r * 0.18, z + Math.sin(a) * r);
    ctx.batch.add(i % 3 ? leafA : leafB, blob);
  }
}

function cypress(ctx: MapDecorateContext, x: number, y: number, z: number): void {
  const g = new THREE.ConeGeometry(0.8, 6, 8);
  g.translate(x, y + 3, z);
  ctx.batch.add((cypressMat ??= new THREE.MeshStandardMaterial({ color: 0x1f3a24, roughness: 0.9 })), g);
  world!.add(x - 0.5, y, z - 0.5, x + 0.5, y + 6, z + 0.5, { surface: 'wood' });
}

function boxGeo(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** A dusk skyline around the fort (low merged silhouettes + a setting-sun glow). Visual only. */
function skyline(ctx: MapDecorateContext): void {
  const geos: THREE.BufferGeometry[] = [];
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2, r = 150 + rnd() * 90;
    const x = 15 + Math.cos(a) * r, z = -15 + Math.sin(a) * r;
    const w = 8 + rnd() * 18, h = 6 + rnd() * 16;
    const b = new THREE.BoxGeometry(w, h, 8 + rnd() * 10);
    b.rotateY(-a);
    b.translate(x, h / 2, z);
    geos.push(b);
    if (rnd() < 0.3) {
      const d = new THREE.SphereGeometry(2 + rnd() * 3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      d.translate(x, h, z);
      geos.push(d);
    }
    if (rnd() < 0.25) {
      const t = new THREE.SphereGeometry(4 + rnd() * 4, 8, 6);
      t.translate(x + 6, 5, z + 4);
      geos.push(t);
    }
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1426, fog: true });
  for (const g of geos) ctx.batch.add(mat, g.index ? g.toNonIndexed() : g);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a50, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sun.position.set(-0.85 * 330, 0.28 * 330 - 30, 0.25 * 330);
  sun.scale.set(160, 160, 1);
  sun.renderOrder = -5;
  ctx.root.add(sun);
}

// ------------------------------------------------------------------------------------------------
export function updateLahore(u: MapUpdateContext): void {
  if (!root) return;
  const { time, power } = u;
  if (power !== lastPower) {
    lastPower = power;
    LM.setPower(power);
    if (glowPost) glowPost.visible = power;
    poolT = 0;
  }
  // Flicker the glow points (cheap: a few hundred colour writes).
  for (const [pts, list] of [[glowPre, preAnchors], [glowPost, postAnchors]] as const) {
    if (!pts || !pts.visible) continue;
    const c = pts.geometry.getAttribute('color') as THREE.BufferAttribute, base = pts.geometry.userData.base as Float32Array;
    for (let i = 0; i < list.length; i++) {
      const f = (list[i].kind === 'chandelier' ? 1 : 0.8 + 0.2 * Math.sin(time * 9 + i * 2.3) * Math.sin(time * 3.7 + i)) * (u.blackout ? 0.2 : 1);
      c.setXYZ(i, base[i * 3] * f, base[i * 3 + 1] * f, base[i * 3 + 2] * f);
    }
    c.needsUpdate = true;
  }
  // Re-assign the light pool to the nearest active anchors.
  poolT -= u.dt;
  const p = u.player;
  if (p && poolT <= 0) {
    poolT = 0.25;
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
  // Distance cull the instanced dressing (the fog hides it anyway).
  cullT -= u.dt;
  if (p && cullT <= 0) {
    cullT = 0.5;
    for (const im of instanced) {
      const c = im.userData.center as THREE.Vector3;
      im.visible = Math.hypot(c.x - p.x, c.z - p.z) < 105;
    }
  }
  for (const k of kites) {
    k.m.position.set(k.x + Math.sin(time * 0.4 + k.ph) * 3, k.y + Math.sin(time * 0.9 + k.ph) * 1.2, k.z + Math.cos(time * 0.3 + k.ph) * 2);
    k.m.rotation.set(Math.sin(time * 1.3 + k.ph) * 0.3, time * 0.2 + k.ph, Math.sin(time * 1.7 + k.ph) * 0.4);
  }
}
