// Rigged+animated Meshy zombies -> public/models/zombies/<id>.glb (skinned, clips renamed walk/run/attack/death/crawl/scream).
//   node scripts/optimize-zombies.mjs [--ids z_shambler,...]
// Keeps the skeleton untouched (no Blender pass: joining/applying transforms breaks skinning). No rescale: Meshy rigging
// already sizes the skin to height_meters (= manifest size), feet at y=0, facing +Z. (getBounds ignores skinning - don't use it.)
// Falls back to the static postprocessed mesh (optimize-assets) when no .anim.glb exists.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { ZOMBIES } from './asset-manifest.mjs';
import { CLIPS } from './clips.mjs';

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : null).filter(Boolean));
const MAX = 1500e3;
for (const z of ZOMBIES.filter((z) => !args.ids || String(args.ids).split(',').includes(z.id))) {
  const src = path.join(ROOT, 'assets/raw/zombies', `${z.id}.anim.glb`);
  if (!fs.existsSync(src)) { console.log(z.id, 'no anim glb'); continue; }
  let tex = 2048, buf;
  for (;;) {
    const d = await io.read(src); const r = d.getRoot();
    r.listAnimations().forEach((a, i) => a.setName(CLIPS[z.id][i]?.[0] ?? a.getName()));
    for (const n of r.listNodes()) if (n.getMesh() && !n.getSkin()) { n.getMesh().dispose(); n.dispose(); } // Meshy ships a stray unit 'Icosphere' helper
    await d.transform(dedup(), resample(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [tex, tex] }), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    buf = await io.writeBinary(d);
    if (buf.byteLength <= MAX || tex <= 512) break;
    tex /= 2;
  }
  fs.writeFileSync(path.join(ROOT, 'public/models/zombies', `${z.id}.glb`), buf);
  console.log(z.id, Math.round(buf.byteLength / 1024) + 'KB', 'tex', tex, CLIPS[z.id].map((c) => c[0]).join(','));
}
