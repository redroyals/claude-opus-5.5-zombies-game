// Headless tour of the Lahore Darbar map: screenshots every zone (pre/post power), doors, machines.
//   BASE=http://127.0.0.1:5181 node e2e/lahore-tour.mjs [/tmp/lahore-shots] [--quick]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/lahore-shots';
const quick = process.argv.includes('--quick');
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5181'}/?mode=zombies&map=lahore-darbar&dev`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DS, null, { timeout: 180000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (n) => { await wait(quick ? 300 : 900); await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const press = async (code = 'KeyE') => { await ds('key', code, true); await wait(150); await ds('key', code, false); await wait(100); };
await ds('lock', true);
await page.click('#btn-zombies');
await wait(4000);
await ds('godMode', true);
await ds('timeScale', 0.0001);
// [name, x, y, z, yaw, pitch]  (yaw 0 looks +Z/south, PI looks -Z/north)
const VIEWS = [
  ['z00-hazuri-bagh', -2, 3, 18, Math.PI, 0.05],
  ['z00-baradari', 10, 3, 18, Math.PI * 0.8, 0.02],
  ['z01-top-khana', -22, 3, 16, -Math.PI * 0.7, 0.0],
  ['z01-hathi-pol', -49, 3, 0, Math.PI, 0.1],
  ['z02-diwan-e-aam', -2, 3, -12, Math.PI, 0.05],
  ['z02-hall', 6, 4.2, -32, Math.PI * 1.3, 0.05],
  ['z03-toshakhana', 16, 3, -12, Math.PI * 0.8, -0.05],
  ['z03-vault', 28, 0, -34, Math.PI * 1.2, -0.05],
  ['z04-shah-burj', 12, 7.2, -41, -Math.PI * 0.75, 0.0],
  ['z04-jharokha', -2, 7.2, -41, 0, -0.25],
  ['z05-sheesh-mahal', -20, 7.2, -59, Math.PI, 0.1],
  ['z06-ramparts', -55, 7.2, 15, Math.PI, -0.05],
  ['z06-burj-top', -55, 10.2, 34, Math.PI * 0.8, -0.1],
  ['z07-silah-khana', -22, 3, -8, -Math.PI * 0.6, 0.0],
  ['z08-roshnai-gate', 16, 3, 11, Math.PI / 2, 0.0],
  ['z08-galli', 35.5, 3, 30, Math.PI, 0.05],
  ['z09-haveli-wazir', 53, 3, 0, -Math.PI * 0.8, 0.12],
  ['z09-gallery', 40, 7.2, -18.5, Math.PI * 0.6, -0.2],
  ['z10-kucha', 60.5, 3, 30, Math.PI, 0.05],
  ['z10-chowk', 64, 3, 10, -Math.PI * 0.7, 0.0],
  ['z11-naqqar-khana', 78, 3, 8, -Math.PI * 0.8, 0.1],
  ['z12-kothay', 40, 10.2, 31, Math.PI * 0.75, -0.05],
  ['z13-tehkhana', 46, 0, -33, -Math.PI * 0.6, 0.0],
];
async function tour(tag) {
  for (const [n, x, y, z, yaw, pitch] of VIEWS) {
    await ds('teleport', x, z, yaw + Math.PI, y);
    await ds('look', yaw + Math.PI, pitch);
    await shot(`${n}-${tag}`);
  }
}
await ds('zPoints', 100000);
const DOORS = ['bagh_topkhana', 'bagh_alamgiri', 'bagh_roshnai', 'topkhana_armoury', 'topkhana_hathipol', 'aam_khas', 'aam_toshakhana', 'burj_sheesh', 'burj_ramparts',
  'roshnai_wazir', 'roshnai_kucha_n', 'roshnai_kucha_s', 'wazir_kucha', 'wazir_kothay', 'kucha_naqqar', 'naqqar_kothay', 'kucha_tehkhana', 'tehkhana_vault'];
if (process.argv.includes('--closed')) await tour('closed');
for (const d of DOORS) await ds('zOpen', d);
console.log(JSON.stringify(await ds('zm')));
await tour('pre');
await ds('zPower');
await wait(1500);
await tour('post');
console.log('frame', JSON.stringify(await ds('frameStats')));
console.log('errors', errors.slice(0, 10));
await browser.close();
