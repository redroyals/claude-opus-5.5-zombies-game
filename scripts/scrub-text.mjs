// Removes Meshy's hallucinated pseudo-lettering from base-colour textures (the maps must carry no text).
// A median filter wipes thin glyph strokes while keeping the large colour blocks of the texture atlas.
//   node scripts/scrub-text.mjs public/models/favela/fv_gondola_cabin.glb [--radius 9]
import fs from 'node:fs';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const argv = process.argv.slice(2);
const ri = argv.indexOf('--radius'); const radius = ri >= 0 ? Number(argv.splice(ri, 2)[1]) : 9;
for (const f of argv) {
  const d = await io.read(f);
  const base = new Set(d.getRoot().listMaterials().map((m) => m.getBaseColorTexture()).filter(Boolean));
  for (const t of base) {
    const img = await sharp(Buffer.from(t.getImage())).median(radius).webp({ quality: 82 }).toBuffer();
    t.setImage(new Uint8Array(img)).setMimeType('image/webp');
  }
  fs.writeFileSync(f, await io.writeBinary(d));
  console.log('scrubbed', f, base.size, 'base textures');
}
