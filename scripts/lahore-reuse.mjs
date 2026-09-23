// Copies the reusable generic sikhi.io props into public/models/lahore/reuse/ with fixed materials and web compression.
// The sources omit metallicFactor (glTF default 1.0 = black metal), so it is set explicitly.
//   node scripts/lahore-reuse.mjs   (sources: assets/raw/lahore-reuse/, copied from sikhi.io public/vr/models/meditation/)
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, quantize, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const USE = { 'brass-vase': 0.7, 'hanging-lantern': 0.4, 'area-rug': 0, 'sikh-cannon': 0.3, 'kohinoor-gem': 0.6, 'flag-ranjit-singh': 0 };
const out = path.join(ROOT, 'public/models/lahore/reuse');
fs.mkdirSync(out, { recursive: true });
for (const [id, metal] of Object.entries(USE)) {
  const d = await io.read(path.join(ROOT, 'assets/raw/lahore-reuse', `${id}.glb`));
  for (const m of d.getRoot().listMaterials()) { m.setMetallicFactor(metal); if (m.getRoughnessFactor() === 1 && metal > 0) m.setRoughnessFactor(0.45); }
  await d.transform(dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [1024, 1024] }), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const buf = await io.writeBinary(d);
  fs.writeFileSync(path.join(out, `${id}.glb`), buf);
  console.log(id, Math.round(buf.byteLength / 1024) + 'KB');
}
