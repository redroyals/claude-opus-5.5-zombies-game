// Visual showcase shots (viewmodels, ADS, reforged camo, reforger, roster, Moth). Usage: node e2e/zombies-showcase.mjs [outDir]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';
const out = process.argv[2] ?? '/tmp/zshots';
fs.mkdirSync(out, { recursive: true });
const exe = fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/?mode=zombies&dev');
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (n) => { await wait(500); await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
await ds('lock', true);
await page.click('#btn-zombies');
await wait(3000);
await ds('godMode', true);
await ds('zPoints', 50000);
for (const d of ['lobby_dock', 'lobby_hall', 'dock_hall', 'dock_vault', 'hall_power']) await ds('zOpen', d);
const guns = (process.env.GUNS ?? 'ar_kestrel,smg_wren,sg_hullbreaker,lmg_bastion,ww_arc,ww_cryo').split(',');
await ds('teleport', 0, 0, Math.PI);
for (const g of guns) {
  await ds('zGive', g);
  await wait(1500);
  await ds('look', Math.PI, 0);
  await shot(`vm-${g}`);
  await ds('mouse', 2, true); await wait(1200);
  await shot(`vm-${g}-ads`);
  await ds('mouse', 2, false);
}
await ds('zTier', 1);
await wait(800);
await shot('vm-camo');
await ds('mouse', 0, true); await wait(400); await ds('mouse', 0, false);
await shot('vm-fire');
// Reforger in action
await ds('zPower');
await ds('teleport', -19, 13.8, Math.PI);
await ds('look', Math.PI, -0.05);
await ds('zUse', { kind: 'pap' });
await wait(1600);
await shot('reforger-working');
// Roster lineup in the dock
await ds('teleport', 0, -2, Math.PI);
await ds('look', 0, -0.05);
await ds('zRound', 1);
for (const [t, x] of [['shambler', -4], ['runner', -2], ['brute', 0], ['crawler', 2], ['fast', 4]]) await ds('zSpawn', t, x, -9);
await wait(600);
await shot('roster');
await ds('zSpawn', 'boss', 0, -10);
await wait(1500);
await shot('boss');
// Moth leaving the box
await ds('clearZombies');
await ds('teleport', -3.5, 8, Math.PI / 2);
await ds('look', Math.PI / 2, 0.15);
await ds('zMoth');
await wait(1500);
await shot('moth-1');
await wait(1500);
await shot('moth-2');
console.log('errors', errors.slice(0, 8));
await browser.close();
