// Meshopt-compress the Blender-generated Lahore kit pieces in place (node/material names preserved).
//   ~/opt/blender/blender -b --factory-startup -P tools/blender/lahore_kit.py -- --out public/models/lahore && node scripts/compress-lahore-kit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const DIR = path.resolve(new URL('../public/models/lahore', import.meta.url).pathname);
for (const f of fs.readdirSync(DIR).filter((f) => /^kit_.*\.glb$/.test(f))) {
  const d = await io.read(path.join(DIR, f));
  if (d.getRoot().listExtensionsUsed().some((e) => /meshopt/.test(e.extensionName))) continue;
  await d.transform(prune({ keepLeaves: true }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  fs.writeFileSync(path.join(DIR, f), await io.writeBinary(d));
  const kb = (fs.statSync(path.join(DIR, f)).size / 1024).toFixed(1);
  console.log(f, kb + 'KB');
}
