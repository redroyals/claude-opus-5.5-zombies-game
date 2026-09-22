// Meshy generation runner for the MP asset set (resumable, budget-guarded).
//   node scripts/meshy-gen.mjs --cat kits [--ids a,b] [--limit N] [--conc 6] [--dry]
// Uses GPT reference images when /home/workstation/pi5-1tb/meshy-refs/<refCat>/<refId>/*.png exist:
//   >=2 views -> multi-image-to-3d, 1 view -> image-to-3d, none -> text-to-3d (preview -> refine PBR).
// Raw GLBs -> assets/raw/<cat>/<id>.glb (gitignored). State -> assets/gen-state.json. Key never logged.
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from './asset-manifest.mjs';

const KEY = fs.readFileSync(process.env.MESHY_KEY_FILE ?? '/home/workstation/pi5-1tb/keys/MESHY-API.txt', 'utf8').trim();
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const BASE = 'https://api.meshy.ai/openapi';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const REFS = '/home/workstation/pi5-1tb/meshy-refs';
const STATE_F = path.join(ROOT, 'assets/gen-state.json');
const FLOOR = Number(process.env.MESHY_FLOOR ?? 5800); // zombies budget: start 9570, cap 4000 spend, hard floor 5590 -> stop at 5800
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]] : null).filter(Boolean));
const state = fs.existsSync(STATE_F) ? JSON.parse(fs.readFileSync(STATE_F, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE_F, JSON.stringify(state, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function balance() { const r = await fetch(`${BASE}/v1/balance`, { headers: H }); return (await r.json()).balance; }
async function post(ep, body) {
  for (let i = 0; ; i++) {
    const r = await fetch(`${BASE}${ep}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j.result;
    if (r.status === 429 && i < 20) { await sleep(15000); continue; }
    throw new Error(`${ep} ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  }
}
async function wait(ep, id) {
  for (;;) {
    const r = await fetch(`${BASE}${ep}/${id}`, { headers: H }); const j = await r.json().catch(() => ({}));
    if (j.status === 'SUCCEEDED') return j;
    if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(`${id} ${j.status} ${JSON.stringify(j.task_error)}`);
    await sleep(8000);
  }
}
export function refImages(a) {
  if (!a.ref) return [];
  const dir = path.join(REFS, a.ref[0], a.ref[1]);
  if (!fs.existsSync(dir)) return [];
  const order = ['front', 'side', 'three_quarter', 'back'];
  return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort((x, y) => (order.indexOf(x.split('.')[0]) + 99) % 103 - (order.indexOf(y.split('.')[0]) + 99) % 103)
    .slice(0, 4).map((f) => path.join(dir, f));
}
const dataUri = (f) => `data:image/${f.endsWith('png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(f).toString('base64')}`;

async function gen(a) {
  const st = (state[a.id] ??= { cat: a.cat });
  if (st.status === 'ok' && !args.force) return;
  const imgs = refImages(a);
  const topo = { topology: 'triangle', target_polycount: a.polycount ?? 8000, should_remesh: true };
  try {
    let result;
    if (imgs.length >= 2) {
      st.method = `multi-image(${imgs.map((f) => path.basename(f)).join(',')})`;
      st.task ??= await post('/v1/multi-image-to-3d', { image_urls: imgs.map(dataUri), should_texture: true, enable_pbr: true, ...topo }); save();
      result = await wait('/v1/multi-image-to-3d', st.task);
    } else if (imgs.length === 1) {
      st.method = `image(${path.basename(imgs[0])})`;
      st.task ??= await post('/v1/image-to-3d', { image_url: dataUri(imgs[0]), should_texture: true, enable_pbr: true, ...topo }); save();
      result = await wait('/v1/image-to-3d', st.task);
    } else {
      st.method = 'text';
      st.preview ??= await post('/v2/text-to-3d', { mode: 'preview', prompt: a.prompt, art_style: 'realistic', ...(a.model || args.model ? { ai_model: a.model ?? args.model } : {}), ...topo }); save();
      await wait('/v2/text-to-3d', st.preview);
      st.task ??= await post('/v2/text-to-3d', { mode: 'refine', preview_task_id: st.preview, enable_pbr: true }); save();
      result = await wait('/v2/text-to-3d', st.task);
    }
    const out = path.join(ROOT, 'assets/raw', a.cat, `${a.id}.glb`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(await (await fetch(result.model_urls.glb)).arrayBuffer()));
    if (result.thumbnail_url) fs.writeFileSync(out.replace(/\.glb$/, '.png'), Buffer.from(await (await fetch(result.thumbnail_url)).arrayBuffer()));
    st.status = 'ok'; st.at = new Date().toISOString(); delete st.error;
  } catch (e) { st.status = 'failed'; st.error = String(e.message).slice(0, 300); }
  save(); console.log(a.id, st.status, st.method, st.error ?? '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let list = ALL.filter((a) => !a.reused && (!args.cat || a.cat === args.cat) && (!args.ids || String(args.ids).split(',').includes(a.id)) && (!args.map || a.map === args.map));
  if (args['refs-only']) list = list.filter((a) => refImages(a).length);
  if (args['no-refs']) list = list.filter((a) => !a.ref);
  list = list.filter((a) => state[a.id]?.status !== 'ok' || args.force);
  if (args.limit) list = list.slice(0, Number(args.limit));
  const b0 = await balance();
  console.log(`balance ${b0} floor ${FLOOR} todo ${list.length}: ${list.map((a) => a.id + (refImages(a).length ? '*' : '')).join(' ')}`);
  if (args.dry) process.exit(0);
  const conc = Number(args.conc ?? 6); let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < list.length) {
      const a = list[i++];
      if (!state[a.id]?.task && !state[a.id]?.preview) { const bal = await balance(); if (bal - 60 * conc < FLOOR) { console.log('BUDGET STOP at', bal); i = list.length; return; } }
      await gen(a);
    }
  }));
  const b1 = await balance();
  fs.appendFileSync(path.join(ROOT, 'assets/LOG.md'), `\n- ${new Date().toISOString()} batch \`${process.argv.slice(2).join(' ')}\`: ${list.length} assets, balance ${b0} -> ${b1} (spent ${b0 - b1}); tasks: ${list.map((a) => `${a.id}=${state[a.id]?.preview ?? ''}/${state[a.id]?.task ?? ''}:${state[a.id]?.status}`).join(', ')}\n`);
  console.log('balance', b0, '->', b1);
}
