// Bot play-through: aims at the nearest zombie (its torso capsule) and fires, round after round, with
// screenshots of the round flow, a blackout round and a Scuttler round, plus frame-time stats.
// Usage: BASE=http://127.0.0.1:5180 [MAP=id] [ROUNDS=4] [GOD=1] node e2e/zombies-bot.mjs [outDir]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/zbot';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5173'}/?mode=zombies${process.env.MAP ? '&map=' + process.env.MAP : ''}&dev`);
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
await ds('lock', true);
await page.click('#btn-zombies');
await page.waitForTimeout(2000);
if (process.env.GOD !== '0') await ds('godMode', true);
await ds('zGive', 'ar_kestrel');
const rounds = +(process.env.ROUNDS ?? 4);
const shots = new Set();
const t0 = Date.now();
let lastRound = 0;
// Bot loop: aim + burst every ~0.4 s of wall time.
const aimFire = async () => {
  const st = await ds('state');
  const zs = (await ds('zombies')).filter((z) => Math.abs(z.y - st.pos.y) < 2.5);
  if (!zs.length) return 0;
  const near = zs.reduce((a, b) => (Math.hypot(a.x - st.pos.x, a.z - st.pos.z) < Math.hypot(b.x - st.pos.x, b.z - st.pos.z) ? a : b));
  const c = near.caps;
  const tx = c ? (c[7] + c[10]) / 2 : near.x, ty = c ? (c[8] + c[11]) / 2 : near.y + 1.1, tz = c ? (c[9] + c[12]) / 2 : near.z;
  const dx = tx - st.pos.x, dz = tz - st.pos.z, d = Math.hypot(dx, dz);
  await ds('look', Math.atan2(-dx, -dz), Math.atan2(ty - (st.pos.y + 1.63), d));
  await ds('mouse', 0, true); await page.waitForTimeout(220); await ds('mouse', 0, false);
  if (st.weapon && st.weapon.mag === 0) { await ds('key', 'KeyR', true); await ds('key', 'KeyR', false); }
  return zs.length;
};
while (Date.now() - t0 < 420000) {
  const z = await ds('zm');
  if (z.round !== lastRound) { lastRound = z.round; console.log('round', z.round, 'kills', z.stats.kills, 'alive', z.alive, 'downs', z.stats.downs); }
  if (z.round > rounds) break;
  if (z.phase === 'active') {
    const n = await aimFire();
    if (n && !shots.has(`r${z.round}`)) { shots.add(`r${z.round}`); await page.screenshot({ path: `${out}/round-${z.round}.png` }); }
  } else {
    // Refill between rounds so the bot never runs dry.
    await ds('zDrop', 'max_ammo');
    await page.waitForTimeout(400);
  }
}
const fs1 = await ds('frameStats');
console.log('frame', JSON.stringify(fs1));
// Jump to a blackout round and a Scuttler round for screenshots.
for (const [n, name] of [[13, 'blackout'], [15, 'scuttlers']]) {
  await ds('clearZombies', true);
  await ds('zRound', n);
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(300); if ((await ds('zm')).alive > 2) break; }
  await page.waitForTimeout(1500);
  await aimFire();
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify((await ds('zm')).round));
}
console.log('errors', errors.slice(0, 6));
await browser.close();
