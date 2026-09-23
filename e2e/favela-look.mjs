// Quick camera tour of the favela map for visual review (no gameplay).
//   BASE=http://127.0.0.1:5182 node e2e/favela-look.mjs /tmp/favela-look [power]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/favela-look';
const power = process.argv[3] === 'power';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5182'}/?mode=zombies&map=favela&dev`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
await ds('lock', true);
await page.click('#btn-zombies').catch(() => {});
await page.waitForTimeout(4000);
await ds('godMode', true);
await ds('zMap', 'favela');
await page.waitForTimeout(3000);
const doors = ['street_beco', 'street_houses', 'beco_houses', 'beco_quadra', 'houses_laje', 'quadra_bridge', 'laje_samba', 'samba_station', 'quadra_mirante', 'station_power', 'mirante_power'];
if (process.env.OPEN) for (const d of doors) await ds('zOpen', d);
if (power) await ds('zPower');
await page.waitForTimeout(8000); // let models stream in
// Camera yaw: 0 looks north (-Z, uphill), PI looks south (+Z, toward the sea); +PI/2 looks west.
const N = 0, S = Math.PI, W = Math.PI / 2, E = -Math.PI / 2;
const views = JSON.parse(process.env.VIEWS ?? 'null') ?? [
  ['street', 4, 34.5, N, 4, 0.12], ['street-south', 4, 31, S, 4, 0], ['bar', 3, 39.5, S, 4, -0.1],
  ['beco', -14.8, 29, N, 4, 0.25], ['houses-b', 6, 21, W, 8, 0], ['laje', 10, 5, N, 16, 0.05],
  ['quadra', -20, 14, N + 0.6, 12, 0.08], ['samba', 16, -26, N, 16, 0.05], ['station', 18, -45.5, N, 24, 0.05],
  ['mirante', -30, -37, S, 24, -0.08], ['substation', -4, -46, N, 24, 0],
];
for (const [name, x, z, yaw, y, pitch] of views) {
  await ds('teleport', x, z, yaw, y);
  await ds('look', yaw, pitch);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}${power ? '-power' : ''}.png` });
  const st = await ds('zm');
  console.log(name, st.zone, JSON.stringify(await ds('frameStats')));
}
console.log('errors', errors.slice(0, 10));
await browser.close();
