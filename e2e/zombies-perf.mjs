// Frame-time benchmark: all doors open, a full horde (24) chasing, five viewpoints x 5 s each.
// Usage: BASE=http://127.0.0.1:5180 [GPU=1] [MAP=id] node e2e/zombies-perf.mjs
// GPU=1 uses the real GPU through ANGLE/Vulkan; otherwise SwiftShader (CPU rendering, far slower).
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const gpu = process.env.GPU === '1' ? ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-frame-rate-limit', '--disable-gpu-vsync', ...gpu] });
const W = +(process.env.W ?? 1280), H = +(process.env.H ?? 720);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5173'}/?mode=zombies${process.env.MAP ? '&map=' + process.env.MAP : ''}&dev`);
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
console.log('renderer', await page.evaluate(() => { const gl = window.__DS.game.renderer.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }));
await ds('lock', true);
await page.click('#btn-zombies');
await page.waitForTimeout(4000);
await ds('godMode', true);
// Older builds (before the map API) have no def: fall back to Nightfall's layout.
const def = (await page.evaluate(() => window.__DS.game.zm.def)) ?? {
  doors: ['lobby_dock', 'lobby_hall', 'dock_hall', 'dock_vault', 'hall_power'].map((id) => ({ id })), playerSpawn: { x: 0, z: 13 },
  rooms: [['CHECKPOINT LOBBY', -7, 4, 7, 18, 0], ['LOADING DOCK', -12, -14, 12, 4, 0], ['GENERATOR HALL', 7, 4, 24, 18, 0], ['POWER ROOM', 12, -14, 24, 4, 2.4], ['REFORGE VAULT', -22, 4, -7, 18, 0]]
    .map(([name, x0, z0, x1, z1, floor]) => ({ name, rect: { x0, z0, x1, z1 }, floor })),
};
for (const d of def.doors) await ds('zOpen', d.id);
await ds('zPower');
const sp = def.playerSpawn;
for (let i = 0; i < 24; i++) await ds('zSpawn', ['shambler', 'runner', 'brute', 'crawler'][i % 4], sp.x + Math.cos(i) * 6, sp.z + Math.sin(i) * 6, sp.y ?? 0);
const rooms = def.rooms.slice(0, 5);
const results = [];
for (const r of rooms) {
  const cx = (r.rect.x0 + r.rect.x1) / 2, cz = (r.rect.z0 + r.rect.z1) / 2;
  await ds('teleport', cx, cz, 0, r.floor);
  await page.waitForTimeout(800);
  const m = await page.evaluate(async () => {
    const t = []; let last = performance.now();
    await new Promise((res) => { const f = (now) => { t.push(now - last); last = now; if (t.length < 240) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    t.shift();
    const s = [...t].sort((a, b) => a - b);
    const info = window.__DS.game.renderer.renderer.info.render;
    return { avg: t.reduce((a, b) => a + b, 0) / t.length, p95: s[Math.floor(s.length * 0.95)], p99: s[Math.floor(s.length * 0.99)], calls: info.calls, tris: info.triangles };
  });
  results.push({ room: r.name ?? r.zone, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +(+v).toFixed(2)])) });
}
console.table(results);
const all = results.reduce((a, r) => a + r.avg, 0) / results.length;
console.log('mean frame ms', all.toFixed(2), 'fps', (1000 / all).toFixed(0), 'alive', (await ds('zm')).alive);
console.log('errors', errors.slice(0, 5));
await browser.close();
