// Generates Phase-1 sample assets via Meshy text-to-3d (preview -> refine, PBR).
// Key read from MESHY_KEY_FILE (never logged). Hard cap: 8 assets. Log -> assets/samples/LOG.md
import fs from 'node:fs';
const KEY = fs.readFileSync(process.env.MESHY_KEY_FILE ?? '/home/workstation/pi5-1tb/keys/MESHY-API.txt', 'utf8').trim();
const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const OUT = new URL('../assets/samples/', import.meta.url).pathname;
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const ASSETS = [
  ['operator', 'full body game character, faction-neutral masked tactical operator, matte black balaclava with smooth grey visor mask, generic dark grey tactical jacket and cargo trousers, no flags no insignia no logos, standing A-pose', 'realistic'],
  ['zombie-shambler', 'full body game character, gaunt shambling zombie in torn office clothes, grey-green rotting skin, hunched posture, arms reaching forward', 'realistic'],
  ['zombie-brute', 'full body game character, huge armored brute zombie wearing cracked riot gear plates, swollen muscles, glowing orange eyes', 'realistic'],
  ['mystery-box', 'weathered wooden supply crate with glowing cyan question-mark glyphs and brass corner brackets, game prop', 'realistic'],
  ['upgrade-machine', 'large retro-futuristic weapon upgrade machine, industrial press with glowing violet core, pipes and levers, game prop', 'realistic'],
  ['perk-machine', 'vintage soda vending machine with glowing red bottle display, dented metal, neon sign, game prop', 'realistic'],
  ['rifle', 'original modern assault rifle game weapon, boxy polymer receiver, short suppressor, holographic sight, dark grey and tan, no brand markings', 'realistic'],
  ['water-tower', 'rooftop water tower on steel stilts with radio antenna mast and ladder, rusty, city rooftop game set piece', 'realistic'],
].slice(0, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(body) { const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j.result; }
async function wait(id) { for (;;) { const r = await fetch(`${API}/${id}`, { headers: H }); const j = await r.json(); if (j.status === 'SUCCEEDED') return j; if (j.status === 'FAILED' || j.status === 'CANCELED') throw new Error(`${id} ${j.status} ${JSON.stringify(j.task_error)}`); await sleep(10000); } }
async function balance() { const r = await fetch('https://api.meshy.ai/openapi/v1/balance', { headers: H }); return (await r.json()).balance; }
const start = await balance();
const rows = [];
async function one([name, prompt, art_style]) {
  try {
    const pid = await post({ mode: 'preview', prompt, art_style, should_remesh: true, target_polycount: 20000 });
    await wait(pid);
    const rid = await post({ mode: 'refine', preview_task_id: pid, enable_pbr: true });
    const t = await wait(rid);
    const glb = await fetch(t.model_urls.glb); fs.writeFileSync(`${OUT}${name}.glb`, Buffer.from(await glb.arrayBuffer()));
    if (t.thumbnail_url) { const th = await fetch(t.thumbnail_url); fs.writeFileSync(`${OUT}${name}.png`, Buffer.from(await th.arrayBuffer())); }
    rows.push(`| ${name} | ${pid} | ${rid} | ok |`);
  } catch (e) { rows.push(`| ${name} | - | - | FAILED: ${String(e.message).slice(0, 120)} |`); }
  console.log('done', name);
}
await Promise.all(ASSETS.map(one));
const end = await balance();
fs.writeFileSync(`${OUT}LOG.md`, `# Meshy sample generation log\n\nDate: ${new Date().toISOString()}\nAPI: text-to-3d v2, preview (remesh, 20k polys) -> refine (enable_pbr)\n\nCredits: start ${start}, end ${end}, spent **${start - end}**\n\n| asset | preview task | refine task | status |\n|---|---|---|---|\n${rows.sort().join('\n')}\n\nPrompts: see scripts/meshy-samples.mjs\n`);
console.log('spent', start - end);
