// Real-GPU art tour of the Lahore Darbar: screenshots a fixed set of views pre/post power, records the
// draw calls / triangles of each frame, and writes contact sheets.
//   BASE=http://127.0.0.1:5232 node scripts/lahore-art-tour.mjs /tmp/lahore-art/after [--only=z05,wide] [--phase=pre|post|both] [--swift]
// Output: <out>/<view>-<phase>.png, <out>/stats.json, <out>/sheet-<phase>-<n>.png (3x3 per sheet).
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const out = process.argv[2] ?? '/tmp/lahore-art/shots';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',') ?? null;
const phase = process.argv.find((a) => a.startsWith('--phase='))?.slice(8) ?? 'both';
const swift = process.argv.includes('--swift');
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const gl = swift ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'];
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-frame-rate-limit', '--disable-gpu-vsync', ...gl] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5232'}/?mode=zombies&map=lahore-darbar&dev`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DS, null, { timeout: 180000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
const wait = (ms) => page.waitForTimeout(ms);
console.log('renderer', await page.evaluate(() => { const g = window.__DS.game.renderer.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }));
await ds('lock', true);
await page.click('#btn-zombies');
await wait(4000);
await ds('godMode', true);
// Hide the HUD so the sheets show the art.
await page.addStyleTag({ content: '#hud, .hud, #ui, #hud-root { opacity: 0 !important; }' });

// [name, x, y, z, yaw, pitch]  yaw 0 looks +Z (south), PI looks -Z (north); +PI/2 looks +X (east)
const VIEWS = [
  ['z00-bagh', -2, 3, 18, Math.PI, 0.05],
  ['z00-baradari', 10, 3, 18, Math.PI * 0.8, 0.02],
  ['z01-topkhana', -22, 3, 16, -Math.PI * 0.7, 0.0],
  ['z02-aam-quad', -2, 3, -12, Math.PI, 0.05],
  ['z02-hall', 6, 4.2, -32, Math.PI * 1.3, 0.05],
  ['z03-vault', 28, 0, -34, Math.PI * 1.2, -0.05],
  ['z04-shah-burj', 12, 7.2, -41, -Math.PI * 0.75, 0.0],
  ['z05-sheesh', -20, 7.2, -59, Math.PI, 0.1],
  ['z05-sheesh-b', -30, 7.2, -60, -Math.PI * 0.62, 0.15],
  ['z06-ramparts', -55, 7.2, 15, Math.PI, -0.05],
  ['z07-silah', -22, 3, -8, -Math.PI * 0.6, 0.0],
  ['z08-galli', 35.5, 3, 30, Math.PI, 0.05],
  ['z09-wazir', 53, 3, 0, -Math.PI * 0.8, 0.12],
  ['z10-chowk', 64, 3, 10, -Math.PI * 0.7, 0.0],
  ['z11-naqqar', 78, 3, 8, -Math.PI * 0.8, 0.1],
  ['z12-kothay', 40, 10.2, 31, Math.PI * 0.75, -0.05],
  ['z13-tehkhana', 46, 0, -33, -Math.PI * 0.6, 0.0],
  ['wide-burj-top', -55, 10.2, 34, Math.PI * 0.8, -0.1],
  // machines, close up
  ['m-lifeline', -14.2, 3, 2, -Math.PI / 2, -0.12],
  ['m-quickhands', 10.6, 3, -14, Math.PI / 2, -0.12],
  ['m-bulwark', 50, 3, -2.4, 0, -0.12],
  ['m-hammerfall', -20, 7.2, -66, Math.PI, -0.12],
  ['m-power', 73, 4.2, -6.2, 0, -0.25],
  ['m-forge', -40.2, 3, -18, -Math.PI / 2, -0.12],
  ['m-box', -2, 4.2, 10.8, Math.PI, -0.3],
  ['m-vault', 18, 0, -41.2, Math.PI, -0.2],
];
const DOORS = ['bagh_topkhana', 'bagh_alamgiri', 'bagh_roshnai', 'topkhana_armoury', 'topkhana_hathipol', 'aam_khas', 'aam_toshakhana', 'burj_sheesh', 'burj_ramparts',
  'roshnai_wazir', 'roshnai_kucha_n', 'roshnai_kucha_s', 'wazir_kucha', 'wazir_kothay', 'kucha_naqqar', 'naqqar_kothay', 'kucha_tehkhana', 'tehkhana_vault'];
await ds('zPoints', 100000);
for (const d of DOORS) await ds('zOpen', d);
await wait(1500);
const stats = {};
async function tour(tag) {
  for (const [n, x, y, z, yaw, pitch] of VIEWS) {
    if (only && !only.some((o) => n.startsWith(o))) continue;
    await ds('teleport', x, z, yaw + Math.PI, y);
    await ds('look', yaw + Math.PI, pitch);
    await ds('clearZombies', true);
    await wait(1400); // streamed props + light pool settle
    const f = await page.evaluate(async () => {
      const t = []; let last = performance.now();
      await new Promise((res) => { const fn = (now) => { t.push(now - last); last = now; if (t.length < 60) requestAnimationFrame(fn); else res(); }; requestAnimationFrame(fn); });
      t.shift();
      const info = window.__DS.game.renderer.renderer.info.render;
      return { ms: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2), calls: info.calls, tris: info.triangles };
    });
    await page.screenshot({ path: `${out}/${n}-${tag}.png` });
    stats[`${n}-${tag}`] = f;
    console.log(n, tag, JSON.stringify(f));
  }
}
if (phase !== 'post') await tour('pre');
if (phase !== 'pre') { await ds('zPower'); await wait(2000); await tour('post'); }
fs.writeFileSync(`${out}/stats.json`, JSON.stringify(stats, null, 1));
console.log('errors', errors.slice(0, 10));
await browser.close();

// Contact sheets: 3 columns x 3 rows of 640x360 thumbs with the view name.
for (const tag of ['pre', 'post']) {
  const files = Object.keys(stats).filter((k) => k.endsWith(`-${tag}`));
  for (let s = 0; s * 9 < files.length; s++) {
    const part = files.slice(s * 9, s * 9 + 9);
    const tiles = await Promise.all(part.map(async (k, i) => {
      const label = Buffer.from(`<svg width="640" height="360"><rect x="0" y="0" width="${Math.max(160, k.length * 11 + 110)}" height="26" fill="rgba(0,0,0,0.6)"/><text x="8" y="19" font-family="monospace" font-size="16" fill="#fff">${k}  ${stats[k].calls}dc ${stats[k].ms}ms</text></svg>`);
      const img = await sharp(path.join(out, `${k}.png`)).resize(640, 360).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer();
      return { input: img, top: Math.floor(i / 3) * 360, left: (i % 3) * 640 };
    }));
    const rows = Math.ceil(part.length / 3);
    await sharp({ create: { width: 1920, height: rows * 360, channels: 3, background: '#000' } }).composite(tiles).png().toFile(`${out}/sheet-${tag}-${s}.png`);
  }
}
