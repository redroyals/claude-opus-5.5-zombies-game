// Meshopt-compress the Blender-generated kit pieces in place (node names preserved).
//   ~/opt/blender/blender -b --factory-startup -P tools/blender/zombies_kit.py -- --out public/models/zombies && node scripts/compress-kit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
// Default: the zombies bunker kit. `--dir public/models/favela` compresses the favela Blender kit (fv_* pieces
// listed in its colliders.json, i.e. only the Blender-made ones, never the Meshy props).
const dirArg = process.argv.indexOf('--dir');
const DIR = dirArg > 0 ? path.resolve(process.argv[dirArg + 1]) : path.resolve(new URL('../public/models/zombies', import.meta.url).pathname);
const kitNames = fs.existsSync(path.join(DIR, 'colliders.json')) ? new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, 'colliders.json'), 'utf8')))) : null;
const pick = (f) => dirArg > 0 ? kitNames?.has(f.slice(0, -4)) : /^(kit_.*|power_switch)\.glb$/.test(f);
for (const f of fs.readdirSync(DIR).filter(pick)) {
  const d = await io.read(path.join(DIR, f));
  if (d.getRoot().listExtensionsUsed().some((e) => /meshopt/.test(e.extensionName))) continue;
  // --keep-uv: keep world-space UVs on untextured kit slots (the game maps tiling textures onto them at runtime);
  // plain prune() drops TEXCOORD_0 from materials without textures, and quantize() would normalise UVs past 1.
  const keepUv = process.argv.includes('--keep-uv');
  await d.transform(prune({ keepLeaves: true, keepAttributes: keepUv }), quantize(keepUv ? { pattern: /^(POSITION|NORMAL)/ } : {}), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  fs.writeFileSync(path.join(DIR, f), await io.writeBinary(d)); console.log(f);
}
