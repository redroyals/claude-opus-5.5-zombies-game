// Meshy auto-rig + multi-action animation for the zombie roster (resumable, budget-guarded).
//   node scripts/meshy-rig.mjs [--ids z_shambler,...]
// Needs the zombie's text-to-3d refine task in assets/gen-state.json. Output: assets/raw/zombies/<id>.anim.glb
// (one clip per action, in CLIPS order; scripts/optimize-zombies.mjs renames them). Key never logged.
import fs from 'node:fs';
import path from 'node:path';
import { ZOMBIES } from './asset-manifest.mjs';

const KEY = fs.readFileSync(process.env.MESHY_KEY_FILE ?? '/home/workstation/pi5-1tb/keys/MESHY-API.txt', 'utf8').trim();
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const BASE = 'https://api.meshy.ai/openapi';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const STATE_F = path.join(ROOT, 'assets/gen-state.json');
const FLOOR = 5800;
import { CLIPS } from './clips.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : null).filter(Boolean));
const state = JSON.parse(fs.readFileSync(STATE_F, 'utf8'));
const save = () => fs.writeFileSync(STATE_F, JSON.stringify(state, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const balance = async () => (await (await fetch(`${BASE}/v1/balance`, { headers: H })).json()).balance;
async function post(ep, body) {
  const r = await fetch(`${BASE}${ep}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${ep} ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.result;
}
async function wait(ep, id) {
  for (;;) {
    const j = await (await fetch(`${BASE}${ep}/${id}`, { headers: H })).json().catch(() => ({}));
    if (j.status === 'SUCCEEDED') return j;
    if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(`${id} ${j.status} ${JSON.stringify(j.task_error)}`);
    await sleep(8000);
  }
}
async function one(z) {
  const st = state[z.id];
  if (!st?.task || st.status !== 'ok') return console.log(z.id, 'no model yet');
  if (st.anim === 'ok') return;
  try {
    if (!st.rig) { if ((await balance()) < FLOOR + 50) throw new Error('budget floor'); st.rig = await post('/v1/rigging', { input_task_id: st.task, height_meters: z.size }); save(); }
    await wait('/v1/rigging', st.rig);
    if (!st.animTask) { if ((await balance()) < FLOOR + 50) throw new Error('budget floor'); st.animTask = await post('/v1/animations', { rig_task_id: st.rig, action_ids: CLIPS[z.id].map((c) => c[1]) }); save(); }
    const res = await wait('/v1/animations', st.animTask);
    const out = path.join(ROOT, 'assets/raw/zombies', `${z.id}.anim.glb`);
    fs.writeFileSync(out, Buffer.from(await (await fetch(res.result.animation_glb_url)).arrayBuffer()));
    st.anim = 'ok'; delete st.animError;
  } catch (e) { st.anim = 'failed'; st.animError = String(e.message).slice(0, 300); }
  save(); console.log(z.id, st.anim, st.rig ?? '', st.animTask ?? '', st.animError ?? '');
}
const b0 = await balance();
const list = ZOMBIES.filter((z) => !args.ids || String(args.ids).split(',').includes(z.id));
await Promise.all(list.map(one));
const b1 = await balance();
fs.appendFileSync(path.join(ROOT, 'assets/LOG.md'), `\n- ${new Date().toISOString()} rig+animate ${list.map((z) => `${z.id}(rig ${state[z.id]?.rig ?? '-'}, anim ${state[z.id]?.animTask ?? '-'}: ${state[z.id]?.anim})`).join(', ')}; balance ${b0} -> ${b1} (spent ${b0 - b1})\n`);
console.log('balance', b0, '->', b1);
