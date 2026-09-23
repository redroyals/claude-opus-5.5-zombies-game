// Draw-call breakdown for one Lahore Darbar viewpoint (real GPU): which objects issue the calls, colour vs shadow pass.
//   BASE=http://127.0.0.1:5232 node scripts/lahore-drawcalls.mjs x y z yaw pitch [--post]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const [x, y, z, yaw, pitch] = process.argv.slice(2, 7).map(Number);
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5232'}/?mode=zombies&map=lahore-darbar&dev`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DS, null, { timeout: 180000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
await ds('lock', true);
await page.click('#btn-zombies');
await page.waitForTimeout(4000);
await ds('godMode', true);
await ds('zPoints', 100000);
for (const d of (await ds('zDef')).doors) await ds('zOpen', d.id);
if (process.argv.includes('--post')) await ds('zPower');
await ds('teleport', x, z, yaw + Math.PI, y);
await ds('look', yaw + Math.PI, pitch);
await ds('clearZombies', true);
await page.waitForTimeout(5000);
const res = await page.evaluate(async () => {
  const r = window.__DS.game.renderer.renderer;
  const counts = {}; const samples = {}; const tris = {};
  const orig = r.renderBufferDirect.bind(r);
  let pass = 'colour';
  r.renderBufferDirect = (cam, scene, geo, mat, obj, group) => {
    pass = cam.isOrthographicCamera ? 'shadow' : 'colour';
    const k = `${pass} | ${obj.isInstancedMesh ? 'inst' : obj.isBatchedMesh ? 'batch' : obj.isPoints ? 'points' : obj.isSkinnedMesh ? 'skin' : 'mesh'} | ${(mat.name || mat.type)}${obj.name ? ' ' + obj.name.replace(/[-\d,]+$/, '') : ''}`;
    counts[k] = (counts[k] ?? 0) + 1;
    const tri = (group ? group.count : geo.index ? geo.index.count : geo.attributes.position.count) / 3 * (obj.isInstancedMesh ? obj.count : 1);
    tris[k] = (tris[k] ?? 0) + (Number.isFinite(tri) ? tri : (geo.index ? geo.index.count : geo.attributes.position.count) / 3);
    if (!mat.name && pass === 'colour') { const chain = []; let o = obj; for (let i = 0; i < 6 && o; i++, o = o.parent) chain.push((o.name || o.type) + (i === 1 ? '@' + o.position.toArray().map((n) => Math.round(n)).join(',') : '')); const kk = `  ${mat.type} geo=${geo.type} ${chain.join('<')}`; samples[kk] = (samples[kk] ?? 0) + 1; }
    return orig(cam, scene, geo, mat, obj, group);
  };
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const snapshot = { ...counts };
  for (const k of Object.keys(counts)) delete counts[k];
  for (const k of Object.keys(tris)) delete tris[k];
  await new Promise((res) => requestAnimationFrame(res));
  r.renderBufferDirect = orig;
  return { counts, total: r.info.render.calls, snapshot, samples, tris, rtris: r.info.render.triangles };
});
const lh = await page.evaluate(() => {
  const by = {};
  window.__DS.game.renderer.scene.traverse((o) => { if (o.isMesh && o.userData.lh) { const k = `${o.material.name}|${o.userData.tier ?? 'proxy'}`; const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; by[k] = (by[k] ?? [0, 0]); by[k][0]++; by[k][1] += t; } });
  return by;
});
for (const [k, [n, t]] of Object.entries(lh)) console.log('LH', k, n, 'meshes', Math.round(t / 1000) + 'k tris');
const rows = Object.entries(res.counts).sort((a, b) => b[1] - a[1]);
let colour = 0, shadow = 0;
for (const [k, n] of rows) { if (k.startsWith('shadow')) shadow += n; else colour += n; }
console.log('total', res.total, 'colour', colour, 'shadow', shadow);
for (const [k, n] of rows.slice(0, 45)) console.log(String(n).padStart(4), String(Math.round(res.tris[k] / 1000)).padStart(6) + 'k', k);
console.log('render.triangles', res.rtris);
for (const [k, n] of Object.entries(res.samples).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(n).padStart(4), k);
await browser.close();
