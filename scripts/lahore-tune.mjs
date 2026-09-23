// Post-optimisation material tuning for Lahore Meshy props (idempotent: sets absolute factors).
// Meshy ships metallicFactor 1.0 x a metallic/roughness texture, which renders dusky props (wood, cloth) as dark metal.
//   node scripts/lahore-tune.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const DIR = path.resolve(new URL('../public/models/lahore/src', import.meta.url).pathname); // atlas sources (then run lahore-atlas.mjs)
// metallic factor per asset (anything not listed keeps Meshy's value)
const METAL = { haveli_door: 0.15, charpai: 0.1, palki: 0.2, well: 0.05, spice_stall: 0.05, chai_stall: 0.3, matka_pots: 0.1, weapon_rack: 0.35, strongboxes: 0.3,
  chest_gold: 0.5, throne_dais: 0.4, naqqara: 0.25, forge_pap: 0.2, armour_stand: 0.6, pedestal: 0.05, great_gun: 0.6, cannonballs: 0.5, torch_bracket: 0.5 };
for (const [id, m] of Object.entries(METAL)) {
  const f = path.join(DIR, `${id}.glb`);
  if (!fs.existsSync(f)) continue;
  const d = await io.read(f);
  for (const mat of d.getRoot().listMaterials()) mat.setMetallicFactor(m);
  fs.writeFileSync(f, await io.writeBinary(d));
  console.log(id, m);
}
