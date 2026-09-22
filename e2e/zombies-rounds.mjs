// Round-progression soak: nukes each round via the dev API to verify round flow, special/boss rounds and no errors.
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';
const exe = fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
p.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERR', String(e).slice(0, 300)); });
b.on('disconnected', () => console.log('BROWSER DISCONNECTED'));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await p.goto('http://127.0.0.1:5173/?mode=zombies&dev');
await p.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => p.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
await ds('lock', true); await p.click('#btn-zombies'); await p.waitForTimeout(2000);
await ds('godMode', true);
for (const d of ['lobby_dock', 'lobby_hall', 'dock_hall', 'dock_vault', 'hall_power']) await ds('zOpen', d);
await ds('timeScale', +(process.env.TS ?? 2));
p.on('crash', () => console.log('PAGE CRASHED'));
const seen = new Set();
let bossSeen = false;
for (let i = 0; i < 400 && (await ds('zm')).round < 9; i++) {
  await p.waitForTimeout(300);
  const z = await ds('zm');
  if (i % 10 === 0) console.log('i', i, z.round, z.phase, z.alive);
  const types = (await ds('zombies')).map((q) => q.type);
  types.forEach((t) => seen.add(`${z.round}:${t}`));
  if (z.boss) bossSeen = true;
  if (z.phase === 'active' && i % 3 === 0) {
    await p.evaluate(() => { const e = window.__DS.game.enemies; for (const q of e.zombies) if (q.alive) e.damage(q, 1e6, false, q.pos.x, q.pos.y + 1, q.pos.z, 0, 1); });
  }
  if (z.round === 6 && !seen.has('jump')) { seen.add('jump'); await ds('zRound', 8); }
}
const z = await ds('zm');
console.log('round', z.round, 'kills', z.stats.kills, 'points', z.stats.points, 'bossSeen', bossSeen);
console.log([...seen].sort().join(' '));
await p.screenshot({ path: '/tmp/zshots/rounds.png' });
console.log('errors', errors.slice(0, 8));
await b.close();
