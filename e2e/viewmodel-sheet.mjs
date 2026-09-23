// Viewmodel review: screenshots every Zombies weapon at hip and ADS against the lobby wall.
// Usage: BASE=http://127.0.0.1:5180 node e2e/viewmodel-sheet.mjs [outDir] [ids,comma,separated]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/zvm';
fs.mkdirSync(out, { recursive: true });
const ids = (process.argv[3] ?? 'pi_warden,pi_magnus,pi_basalt,smg_wren,smg_fennec,smg_skiff,ar_kestrel,ar_corvid,ar_moraine,ar_tern,sg_hullbreaker,sg_tidal,lmg_bastion,dmr_sentry,sr_longwatch,ln_lotus,ww_arc,ww_singularity,ww_cryo').split(',');
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5173'}/?mode=zombies&dev`);
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
await ds('lock', true);
await page.click('#btn-zombies');
await page.waitForTimeout(2000);
await ds('godMode', true);
await ds('zPower');
await ds('teleport', 0, 12, 0);
await ds('look', 0, 0);
for (const id of ids) {
  await ds('zGive', id);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}/${id}-hip.png` });
  await ds('mouse', 2, true);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${id}-ads.png` });
  await ds('mouse', 2, false);
  console.log('shot', id);
}
console.log('errors', errors.slice(0, 5));
await browser.close();
