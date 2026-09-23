// Multi-level nav smoke test on the hidden example map: a zombie spawned on the ground floor must climb the
// stairs to a player standing upstairs. Usage: BASE=http://127.0.0.1:5180 node e2e/zombies-multilevel.mjs [outDir]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/zml';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5173'}/?mode=zombies&map=${process.env.MAP ?? 'example-house'}&dev`);
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
await ds('lock', true);
await page.click('#btn-zombies');
await page.waitForTimeout(2000);
await ds('godMode', true);
await ds('zOpen', 'stairs_debris');
await ds('teleport', 4, 8, Math.PI, 3.5);
await ds('clearZombies');
await ds('zSpawn', 'runner', 8.5, 7.5, 0);
let z = null;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(500);
  const zs = await ds('zombies');
  const s = await ds('state');
  z = zs[0];
  if (i % 10 === 0) console.log('t', i / 2, 'zombie', JSON.stringify(z), 'player', JSON.stringify(s.pos));
  if (z && z.y > 3 && Math.hypot(z.x - s.pos.x, z.z - s.pos.z) < 2.5) { console.log('REACHED upstairs after', i / 2, 's'); break; }
}
await ds('look', 0, -0.2);
await page.screenshot({ path: `${out}/upstairs.png` });
console.log('errors', errors.slice(0, 5));
await browser.close();
