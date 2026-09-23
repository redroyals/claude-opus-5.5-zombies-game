// Headless Zombies smoke/play-through driven by the dev API (window.__DS). Usage: node e2e/zombies-play.mjs [outDir]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/zshots';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5173'}/?mode=zombies${process.env.MAP ? '&map=' + process.env.MAP : ''}&dev`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
const ev = (code) => page.evaluate(code);
const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const wait = (ms) => page.waitForTimeout(ms);
const until = async (pred, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const z = await ds('zm'); if (pred(z)) return z; await wait(250); } console.log('timeout waiting'); return ds('zm'); };
const press = async (code = 'KeyE') => { await ds('key', code, true); await wait(150); await ds('key', code, false); await wait(100); };
await shot('00-title');
await ds('lock', true);
await page.click('#btn-zombies');
await wait(2500);
await ds('godMode', true);
await shot('01-spawn');
console.log(JSON.stringify(await ds('zm')));
// Look at the dock door and buy it
await ds('look', 0, 0);
await shot('02-door-closed');
await ds('zPoints', 20000);
await ds('teleport', 0, 5.6, 0);
await wait(300);
await press();
await wait(1500);
await shot('03-door-open');
// Mystery box in the lobby (spot 0 faces +X)
await ds('teleport', -4.6, 8, Math.PI / 2);
await ds('look', Math.PI / 2, -0.25);
await wait(300);
await press();
await until((z) => z.box.phase === 'spinning' && z.box.t > 1.5);
await shot('04-box-spin');
await until((z) => z.box.phase === 'offer' || z.box.phase === 'moving');
await shot('05-box-offer');
await press();
await wait(800);
await shot('06-box-weapon');
console.log(JSON.stringify(await ds('state')).slice(0, 400));
// Open everything, power on
for (const d of ['lobby_hall', 'dock_hall', 'dock_vault', 'hall_power']) await ds('zOpen', d);
await ds('teleport', 20.5, -11.8, 0);
await ds('look', 0, 0);
await wait(400);
await shot('07-power-room');
await press();
await wait(1500);
await shot('08-power-on');
// Perk machine (quickhands, faces +Z)
await ds('teleport', 15.5, 6.1, 0);
await ds('look', 0, 0.05);
await wait(500);
await shot('09-perk');
await press();
await wait(600);
// Reforger
await ds('teleport', -19, 14.6, 0);
await ds('look', 0, 0.2);
await press();
await wait(2500);
await shot('10-reforger');
await wait(4000);
console.log(JSON.stringify(await ds('state')).slice(0, 300));
// Fight a few rounds from the lobby: aim at the window and shoot
await ds('teleport', 0, 12, Math.PI);
await ds('look', Math.PI, 0);
await ds('zRound', 3);
for (let i = 0; i < 40; i++) {
  await wait(500);
  const zs = await ds('zombies');
  const s = await ds('state');
  if (zs.length) {
    const t = zs.reduce((a, b) => (Math.hypot(a.x - s.pos.x, a.z - s.pos.z) < Math.hypot(b.x - s.pos.x, b.z - s.pos.z) ? a : b));
    const yaw = Math.atan2(-(t.x - s.pos.x), -(t.z - s.pos.z));
    await ds('look', yaw, -0.08);
    await ds('mouse', 0, true); await wait(250); await ds('mouse', 0, false);
  }
  if (i === 6) await shot('11-fight');
  if (i === 14) { await ds('zDrop', 'double_points'); await wait(200); await shot('12-powerup'); }
}
console.log(JSON.stringify(await ds('zm')));
await ds('zSpawn', 'crawler', 2, 6);
await ds('zSpawn', 'brute', -2, 6);
await ds('look', Math.PI, 0.05);
await wait(1500);
await shot('13-roster');
// Go down: last stand, then bleed out into the results screen
await ds('godMode', false);
await ds('damagePlayer', 9999);
await wait(1500);
await shot('14-downed');
console.log('down', JSON.stringify(await ds('state')).slice(0, 160));
await page.waitForFunction(() => document.getElementById('zover')?.classList.contains('on'), null, { timeout: 60000 }).catch(() => console.log('no game-over screen'));
await shot('15-gameover');
console.log('errors', errors.slice(0, 10));
await browser.close();
