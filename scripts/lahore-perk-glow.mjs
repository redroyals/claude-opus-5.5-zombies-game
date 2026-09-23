// Gives the Lahore sharbat-cabinet perk skins a glowing flask: an emissive texture is derived from each model's
// base colour, keeping only texels near the perk's hue (the glass flask), so the engine's power-driven emissive
// (Machines.ts PERK_GLOW.glbEmissive) lights the flask and nothing else.
//   node scripts/lahore-perk-glow.mjs      (idempotent: rebuilds the emissive from the base colour every run)
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const DIR = path.resolve(new URL('../public/models/lahore', import.meta.url).pathname);
// perk skin -> target hue (degrees) and hue tolerance
// [hue, tolerance, min saturation, min value]: the red/amber flasks sit close to the red sandstone body in hue, so
// they also need to be clearly brighter and more saturated than the stone.
const PERKS = { la_perk_test: [190, 28, 0.45, 0.25], la_perk_quickhands: [130, 35, 0.45, 0.25], la_perk_hammerfall: [26, 16, 0.55, 0.4], la_perk_bulwark2: [356, 14, 0.62, 0.38],
  la_perk_nova: [320, 28, 0.3, 0.2], la_perk_strider: [57, 10, 0.4, 0.35], la_perk_strider2: [55, 14, 0.45, 0.4], la_perk_hawkeye: [200, 25, 0.35, 0.25] };

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
}
for (const [id, [hue, tol, smin, vmin]] of Object.entries(PERKS)) {
  const f = path.join(DIR, `${id}.glb`);
  if (!fs.existsSync(f)) { console.log(id, 'missing'); continue; }
  const doc = await io.read(f);
  for (const mat of doc.getRoot().listMaterials()) {
    const bc = mat.getBaseColorTexture();
    if (!bc) continue;
    const img = sharp(Buffer.from(bc.getImage()));
    const { width, height } = await img.metadata();
    const px = await img.ensureAlpha().raw().toBuffer();
    const out = Buffer.alloc(width * height * 4);
    let lit = 0;
    for (let i = 0; i < width * height; i++) {
      const [h, s, v] = hsv(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      const dh = Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue));
      const k = s > smin && v > vmin && dh < tol ? Math.min(1, (s - smin) * 3) * (1 - dh / tol) : 0;
      if (k > 0.2) lit++;
      // push the flask colour to full value so the (dim) engine emissive reads as a lit glass
      const m = k / Math.max(1e-3, Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255);
      out[i * 4] = Math.min(255, px[i * 4] * m); out[i * 4 + 1] = Math.min(255, px[i * 4 + 1] * m); out[i * 4 + 2] = Math.min(255, px[i * 4 + 2] * m); out[i * 4 + 3] = 255;
    }
    const tex = doc.createTexture(`${id}_glow`).setMimeType('image/webp').setImage(await sharp(out, { raw: { width, height, channels: 4 } }).webp({ quality: 80 }).toBuffer());
    mat.setEmissiveTexture(tex).setEmissiveFactor([1, 1, 1]);
    console.log(id, `glow texels ${(100 * lit / (width * height)).toFixed(1)}%`);
  }
  await doc.transform(prune());
  fs.writeFileSync(f, await io.writeBinary(doc));
}
