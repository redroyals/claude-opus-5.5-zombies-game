// Packs the Lahore Darbar's static props (Meshy + reused GLBs) into ONE GLB that shares ONE material: a 4096 px
// texture atlas (base colour, metal-rough, normal). Every prop keeps its own node (named by id) and mesh, with
// UVs remapped into its atlas slot, and per-prop PBR factors are baked into the textures, so the runtime can merge
// all props of a cell into a single draw.
//   node scripts/lahore-atlas.mjs            -> public/models/lahore/props_atlas.glb (+ assets/work/lahore-atlas/*.png)
// Sources: public/models/lahore/src/*.glb (optimised single props, kept for rebuilds; the game never loads them).
// Machines (box, perks, forge, power) and door models stay separate: the engine loads them by path.
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, quantize, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DIR = path.join(ROOT, 'public/models/lahore');
// Atlas sources: public/models/lahore/src/ (never loaded by the game); a freshly optimised prop (scripts/optimize-assets.mjs
// writes to public/models/lahore/) is picked up from there until it is moved into src/.
const SRC = path.join(DIR, 'src');
const srcOf = (f) => (fs.existsSync(path.join(SRC, f)) ? path.join(SRC, f) : path.join(DIR, f));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// [id, file (relative to public/models/lahore), slot px, metal cap]
export const ATLAS_PROPS = [
  ['great_gun', 'great_gun.glb', 1024, 0.6], ['throne_dais', 'throne_dais.glb', 1024, 0.4], ['well', 'well.glb', 1024, 0.05],
  ['chai_stall', 'chai_stall.glb', 1024, 0.3], ['spice_stall', 'spice_stall.glb', 1024, 0.05], ['palki', 'palki.glb', 1024, 0.2],
  ['la_divan', 'la_divan.glb', 1024, 0.2], ['la_fruit_cart', 'la_fruit_cart.glb', 1024, 0.1], ['la_pottery_stall', 'la_pottery_stall.glb', 1024, 0.05],
  ['la_cloth_stall2', 'la_cloth_stall2.glb', 1024, 0.05], ['sikh-cannon', 'reuse/sikh-cannon.glb', 1024, 0.3],
  ['armour_stand', 'armour_stand.glb', 512, 0.6], ['weapon_rack', 'weapon_rack.glb', 512, 0.35], ['chest_gold', 'chest_gold.glb', 512, 0.5],
  ['strongboxes', 'strongboxes.glb', 512, 0.3], ['chandelier', 'chandelier.glb', 512, 0.8], ['la_brass_vessels', 'la_brass_vessels.glb', 512, 0.9],
  ['la_charpai', 'la_charpai.glb', 512, 0.05], ['la_planter_tree', 'la_planter_tree.glb', 512, 0.05], ['la_sacks', 'la_sacks.glb', 512, 0.05],
  ['la_pigeon_loft', 'la_pigeon_loft.glb', 512, 0.1], ['la_degh', 'la_degh.glb', 512, 0.8], ['la_chowki', 'la_chowki.glb', 512, 0.6],
  ['la_lantern', 'la_lantern.glb', 512, 0.9],
  ['cannonballs', 'cannonballs.glb', 256, 0.5], ['matka_pots', 'matka_pots.glb', 256, 0.1], ['brass-vase', 'reuse/brass-vase.glb', 256, 0.7],
  ['hanging-lantern', 'reuse/hanging-lantern.glb', 256, 0.4], ['kohinoor-gem', 'reuse/kohinoor-gem.glb', 256, 0.6], ['la_pigeon', 'la_pigeon.glb', 256, 0.05],
];
const SIZE = 4096, PAD = 8;
// Triangle budgets (the props are merged per cell, so their triangles are paid in every frame they are near).
const BUDGET = { 'kohinoor-gem': 1200, 'sikh-cannon': 5000, great_gun: 7000, la_pigeon: 450, la_lantern: 1100, 'hanging-lantern': 1500, 'brass-vase': 1500,
  chandelier: 2200, strongboxes: 1500, cannonballs: 1200, la_brass_vessels: 2000, armour_stand: 3500, weapon_rack: 2500, chest_gold: 3000, matka_pots: 1500,
  la_chowki: 2000, la_sacks: 2500, la_degh: 2000, well: 6000, chai_stall: 6000, spice_stall: 6000, palki: 6000, throne_dais: 7000 };

/** meshoptimizer simplification to a triangle budget, UV/normal aware, then drop unused vertices. */
function simplifyTo(I, P, N, U, targetTris) {
  if (I.length / 3 <= targetTris) return { I, P, N, U };
  const attrs = new Float32Array((P.length / 3) * 5);
  for (let v = 0; v < P.length / 3; v++) { attrs[v * 5] = U[v * 2]; attrs[v * 5 + 1] = U[v * 2 + 1]; attrs[v * 5 + 2] = N[v * 3]; attrs[v * 5 + 3] = N[v * 3 + 1]; attrs[v * 5 + 4] = N[v * 3 + 2]; }
  const [out] = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, attrs, 5, [1, 1, 0.3, 0.3, 0.3], null, Math.floor(targetTris) * 3, 0.12, ['Permissive']);
  const remap = new Int32Array(P.length / 3).fill(-1);
  let n = 0;
  const I2 = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) { const v = out[i]; if (remap[v] < 0) remap[v] = n++; I2[i] = remap[v]; }
  const P2 = new Float32Array(n * 3), N2 = new Float32Array(n * 3), U2 = new Float32Array(n * 2);
  for (let v = 0; v < remap.length; v++) { const r = remap[v]; if (r < 0) continue; P2.set(P.subarray(v * 3, v * 3 + 3), r * 3); N2.set(N.subarray(v * 3, v * 3 + 3), r * 3); U2.set(U.subarray(v * 2, v * 2 + 2), r * 2); }
  return { I: I2, P: P2, N: N2, U: U2 };
}

async function raw(tex, size, fallback) {
  if (!tex) return sharp({ create: { width: size, height: size, channels: 4, background: fallback } }).raw().toBuffer();
  return sharp(Buffer.from(tex.getImage())).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const items = ATLAS_PROPS.filter(([, f]) => fs.existsSync(srcOf(f)));
  // Shelf-pack power-of-two squares, largest first.
  const order = [...items].sort((a, b) => b[2] - a[2]);
  const slots = new Map();
  let x = 0, y = 0, rowH = 0;
  for (const it of order) {
    const s = it[2];
    if (x + s > SIZE) { x = 0; y += rowH; rowH = 0; }
    if (y + s > SIZE) throw new Error(`atlas full at ${it[0]}`);
    slots.set(it[0], { x, y, s });
    x += s; rowH = Math.max(rowH, s);
  }
  const col = Buffer.alloc(SIZE * SIZE * 4), mr = Buffer.alloc(SIZE * SIZE * 4), nor = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) { nor[i * 4] = 128; nor[i * 4 + 1] = 128; nor[i * 4 + 2] = 255; nor[i * 4 + 3] = 255; mr[i * 4 + 1] = 230; mr[i * 4 + 3] = 255; col[i * 4 + 3] = 255; }
  const out = new Document();
  const buf = out.createBuffer();
  const scene = out.createScene('props');
  const mat = out.createMaterial('lh:props').setMetallicFactor(1).setRoughnessFactor(1);
  const blit = (dst, src, s, sx, sy) => {
    // src is s x s; copy into the slot with PAD px of edge extension (mip-safe borders).
    const inner = s;
    for (let j = -PAD; j < inner + PAD; j++) for (let i = -PAD; i < inner + PAD; i++) {
      const dx = sx + i, dy = sy + j;
      if (dx < 0 || dy < 0 || dx >= SIZE || dy >= SIZE) continue;
      const si = Math.min(inner - 1, Math.max(0, i)), sj = Math.min(inner - 1, Math.max(0, j));
      src.copy(dst, (dy * SIZE + dx) * 4, (sj * inner + si) * 4, (sj * inner + si) * 4 + 4);
    }
  };
  const report = [];
  for (const [id, file, , metalCap] of items) {
    const doc = await io.read(srcOf(file));
    const root = doc.getRoot();
    const slot = slots.get(id);
    const inner = slot.s - 2 * PAD;
    // All primitives of a prop share its slot; props with several textured materials are rare (first one wins).
    const prims = [];
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const wm = node.getWorldMatrix();
      for (const p of mesh.listPrimitives()) prims.push({ p, wm });
    }
    const m0 = prims.find((q) => q.p.getMaterial()?.getBaseColorTexture())?.p.getMaterial() ?? prims[0].p.getMaterial();
    const bcf = m0?.getBaseColorFactor() ?? [1, 1, 1, 1];
    const mf = Math.min(metalCap, m0?.getMetallicFactor() ?? 0), rf = m0?.getRoughnessFactor() ?? 1;
    const c = await raw(m0?.getBaseColorTexture(), inner, { r: Math.round(bcf[0] * 255), g: Math.round(bcf[1] * 255), b: Math.round(bcf[2] * 255), alpha: 1 });
    const t = m0?.getBaseColorTexture() ? bcf : [1, 1, 1];
    for (let i = 0; i < inner * inner; i++) for (let k = 0; k < 3; k++) c[i * 4 + k] = Math.min(255, c[i * 4 + k] * t[k]);
    const r = await raw(m0?.getMetallicRoughnessTexture(), inner, { r: 0, g: 255, b: 255, alpha: 1 });
    for (let i = 0; i < inner * inner; i++) { r[i * 4 + 1] = Math.min(255, r[i * 4 + 1] * rf); r[i * 4 + 2] = Math.min(255, r[i * 4 + 2] * mf); r[i * 4] = 255; }
    const n = await raw(m0?.getNormalTexture(), inner, { r: 128, g: 128, b: 255, alpha: 1 });
    blit(col, c, inner, slot.x + PAD, slot.y + PAD); blit(mr, r, inner, slot.x + PAD, slot.y + PAD); blit(nor, n, inner, slot.x + PAD, slot.y + PAD);
    // Geometry: bake world transforms, remap UVs into the slot.
    const node = out.createNode(id);
    const mesh = out.createMesh(id);
    let clamped = 0, tris = 0;
    for (const { p, wm } of prims) {
      const pos = p.getAttribute('POSITION'), nrm = p.getAttribute('NORMAL'), uv = p.getAttribute('TEXCOORD_0'), idx = p.getIndices();
      const count = pos.getCount();
      const P = new Float32Array(count * 3), N = new Float32Array(count * 3), U = new Float32Array(count * 2);
      const v = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        pos.getElement(i, v);
        P[i * 3] = wm[0] * v[0] + wm[4] * v[1] + wm[8] * v[2] + wm[12];
        P[i * 3 + 1] = wm[1] * v[0] + wm[5] * v[1] + wm[9] * v[2] + wm[13];
        P[i * 3 + 2] = wm[2] * v[0] + wm[6] * v[1] + wm[10] * v[2] + wm[14];
        if (nrm) {
          nrm.getElement(i, v);
          const nx = wm[0] * v[0] + wm[4] * v[1] + wm[8] * v[2], ny = wm[1] * v[0] + wm[5] * v[1] + wm[9] * v[2], nz = wm[2] * v[0] + wm[6] * v[1] + wm[10] * v[2];
          const l = Math.hypot(nx, ny, nz) || 1;
          N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l;
        }
        let u = 0.5, w = 0.5;
        if (uv) { uv.getElement(i, v); u = v[0]; w = v[1]; }
        if (u < 0 || u > 1 || w < 0 || w > 1) clamped++;
        u = Math.min(1, Math.max(0, u)); w = Math.min(1, Math.max(0, w));
        U[i * 2] = (slot.x + PAD + u * inner) / SIZE;
        U[i * 2 + 1] = (slot.y + PAD + w * inner) / SIZE;
      }
      let I;
      if (idx) { I = new Uint32Array(idx.getCount()); for (let i = 0; i < I.length; i++) I[i] = idx.getScalar(i); }
      else I = Uint32Array.from({ length: count }, (_, i) => i);
      const total = prims.reduce((n, q) => n + (q.p.getIndices()?.getCount() ?? q.p.getAttribute('POSITION').getCount()) / 3, 0);
      const g = BUDGET[id] ? simplifyTo(I, P, N, U, (BUDGET[id] * (I.length / 3)) / total) : { I, P, N, U };
      const prim = out.createPrimitive().setMaterial(mat)
        .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(g.P).setBuffer(buf))
        .setAttribute('TEXCOORD_0', out.createAccessor().setType('VEC2').setArray(g.U).setBuffer(buf));
      if (nrm) prim.setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(g.N).setBuffer(buf));
      prim.setIndices(out.createAccessor().setType('SCALAR').setArray(g.I).setBuffer(buf));
      tris += g.I.length / 3;
      mesh.addPrimitive(prim);
    }
    node.setMesh(mesh);
    scene.addChild(node);
    report.push(`${id} slot ${slot.s} tris ${tris}${clamped ? ` (${clamped} uv clamped)` : ''}`);
  }
  const work = path.join(ROOT, 'assets/work/lahore-atlas');
  fs.mkdirSync(work, { recursive: true });
  const png = async (b, f) => { await sharp(b, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(path.join(work, f)); return fs.readFileSync(path.join(work, f)); };
  const tex = async (b, f, name) => out.createTexture(name).setImage(await png(b, f)).setMimeType('image/png');
  mat.setBaseColorTexture(await tex(col, 'color.png', 'props_color'))
    .setMetallicRoughnessTexture(await tex(mr, 'mr.png', 'props_mr'))
    .setNormalTexture(await tex(nor, 'normal.png', 'props_normal'));
  await out.transform(dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82 }), prune({ keepLeaves: true }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const dst = path.join(DIR, 'props_atlas.glb');
  fs.writeFileSync(dst, await io.writeBinary(out));
  console.log(report.join('\n'));
  console.log('props_atlas.glb', (fs.statSync(dst).size / 1048576).toFixed(2), 'MB,', items.length, 'props');
}
