// Writes public/models/manifest.json describing every GLB under public/models.
//   node scripts/build-manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { ALL } from './asset-manifest.mjs';

await MeshoptDecoder.ready;
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DIR = path.join(ROOT, 'public/models');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const byId = Object.fromEntries(ALL.map((a) => [a.id, a]));
const NOTE = /^(lid|body|lever|door|frame|panel|plank_\d|mount_\w+|socket_grip)$/;
const kindOf = (id, dir) => dir === 'weapons' ? (id.startsWith('ww_') ? 'wonder_weapon' : id === 'sp_knife' ? 'melee' : 'weapon')
  : id.startsWith('z_') ? 'zombie' : id.startsWith('kit_') ? 'kit' : dir === 'lahore' ? 'lahore_prop' : id.startsWith('perk_') ? 'perk_machine'
  : ['mystery_box', 'reforger', 'power_switch'].includes(id) ? 'machine' : 'prop';
const out = [];
for (const dir of ['weapons', 'zombies', 'lahore']) {
  for (const f of fs.readdirSync(path.join(DIR, dir)).filter((f) => f.endsWith('.glb')).sort()) {
    const id = f.slice(0, -4); const doc = await io.read(path.join(DIR, dir, f)); const r = doc.getRoot();
    const skinned = r.listSkins().length > 0;
    const b = getBounds(r.listScenes()[0]);
    const size = skinned ? null : b.max.map((v, i) => Math.round((v - b.min[i]) * 1000) / 1000);
    out.push({
      id, path: `/models/${dir}/${f}`, kind: kindOf(id, dir),
      size_m: size ?? { height: byId[id]?.size, note: 'skinned: height from Meshy rig height_meters (bind-pose bounds not meaningful)' },
      bytes: fs.statSync(path.join(DIR, dir, f)).size,
      animations: r.listAnimations().map((a) => a.getName()),
      skinned,
      nodes: r.listNodes().map((n) => n.getName()).filter((n) => NOTE.test(n)),
      ...(byId[id]?.name ? { name: byId[id].name } : {}),
    });
  }
}
fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify({
  convention: 'metres, +Y up. Weapons: barrel -Z, origin at grip (see weapons/frames.json). Props/machines/kits: base y=0, centred XZ, front +Z. Zombies: skinned, feet y=0, face +Z.',
  assets: out,
}, null, 1));
console.log(out.length, 'assets');
