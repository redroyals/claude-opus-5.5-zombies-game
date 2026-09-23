// Low-detail zombie meshes for distance LOD: public/models/zombies/z_<id>.glb -> z_<id>_lod1.glb.
//   node scripts/zombie-lods.mjs [--ratio 0.25]
// Geometry only (animations, textures and materials are dropped): at runtime the LOD geometry is bound to
// the full model's skeleton and material, so it animates with the same mixer at no extra CPU cost.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, simplify, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const dir = path.join(ROOT, 'public/models/zombies');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : null).filter(Boolean));
const ratio = +(args.ratio ?? 0.25);
const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
for (const f of fs.readdirSync(dir).filter((f) => /^z_[a-z]+\.glb$/.test(f))) {
  const doc = await io.read(path.join(dir, f));
  const root = doc.getRoot();
  const before = tris(doc);
  for (const a of root.listAnimations()) a.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.06, lockBorder: false }), prune({ keepLeaves: true }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(dir, f.replace('.glb', '_lod1.glb'));
  const buf = await io.writeBinary(doc);
  fs.writeFileSync(out, buf);
  console.log(f, Math.round(before), '->', Math.round(tris(doc)), 'tris', Math.round(buf.byteLength / 1024) + 'KB');
}
