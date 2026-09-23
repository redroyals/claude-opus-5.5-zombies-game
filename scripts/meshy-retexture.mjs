// Retexture finished Meshy models with a new style prompt (keeps geometry + UVs, ~10 credits each).
// Used when a texture came back with lettering (the maps must carry no text).
//   node scripts/meshy-retexture.mjs --ids perk_fv_bulwark,... [--dry]
// Reads `retexture` prompts from the manifest; state -> assets/gen-state.json (<id>.retexture), raw -> assets/raw/<cat>/<id>.glb.
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from './asset-manifest.mjs';

const KEY = fs.readFileSync(process.env.MESHY_KEY_FILE ?? '/home/workstation/pi5-1tb/keys/MESHY-API.txt', 'utf8').trim();
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const BASE = 'https://api.meshy.ai/openapi';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const STATE_F = path.join(ROOT, 'assets/gen-state.json');
const FLOOR = Number(process.env.MESHY_FLOOR ?? 5400);
const CAP = Number(process.env.MESHY_CAP_FAVELA ?? 1200);
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]] : null).filter(Boolean));
const state = JSON.parse(fs.readFileSync(STATE_F, 'utf8'));
const save = () => fs.writeFileSync(STATE_F, JSON.stringify(state, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => { for (let i = 0; ; i++) { try { const r = await fetch(`${BASE}${p}`, { headers: H }); return await r.json(); } catch (e) { if (i > 8) throw e; await sleep(5000); } } };
const balance = async () => (await get('/v1/balance')).balance;
const spent = () => Object.values(state).filter((s) => s.cat === 'favela').reduce((n, s) => n + (s.spent ?? 0), 0);

const ids = String(args.ids ?? '').split(',').filter(Boolean);
const list = ALL.filter((a) => ids.includes(a.id));
const b0 = await balance();
console.log(`balance ${b0} floor ${FLOOR} favela spent ${spent()}/${CAP}: ${list.map((a) => a.id).join(' ')}`);
if (args.dry) process.exit(0);
await Promise.all(list.map(async (a) => {
  const st = state[a.id];
  if (!st?.task) { console.log(a.id, 'no source task'); return; }
  st.retexture ??= {};
  if (!st.retexture.task) {
    if (b0 < FLOOR + 50 || (await balance()) < FLOOR + 50) { console.log('BUDGET STOP'); return; }
    if (spent() + 10 > CAP) { console.log('CAP STOP'); return; }
    const r = await fetch(`${BASE}/v1/retexture`, { method: 'POST', headers: H, body: JSON.stringify({ input_task_id: st.task, text_style_prompt: a.retexture, enable_original_uv: true, enable_pbr: true }) });
    const j = await r.json();
    if (!r.ok) { console.log(a.id, 'retexture failed', r.status, JSON.stringify(j).slice(0, 200)); return; }
    st.retexture.task = j.result; st.spent = (st.spent ?? 0) + 20; save();
  }
  let j;
  for (;;) { j = await get(`/v1/retexture/${st.retexture.task}`); if (j.status === 'SUCCEEDED' || j.status === 'FAILED' || j.status === 'CANCELED') break; await sleep(8000); }
  if (j.status !== 'SUCCEEDED') { st.retexture.status = 'failed'; st.retexture.error = JSON.stringify(j.task_error).slice(0, 200); save(); console.log(a.id, j.status); return; }
  const out = path.join(ROOT, 'assets/raw', a.cat, `${a.id}.glb`);
  fs.copyFileSync(out, out.replace(/\.glb$/, '.orig.glb'));
  fs.writeFileSync(out, Buffer.from(await (await fetch(j.model_urls.glb)).arrayBuffer()));
  st.retexture.status = 'ok'; save(); console.log(a.id, 'retextured');
}));
const b1 = await balance();
fs.appendFileSync(path.join(ROOT, 'assets/LOG.md'), `\n- ${new Date().toISOString()} retexture \`${ids.join(',')}\`: balance ${b0} -> ${b1} (shared account; favela ledger now ${spent()}); tasks: ${list.map((a) => `${a.id}=${state[a.id]?.retexture?.task}:${state[a.id]?.retexture?.status}`).join(', ')}\n`);
