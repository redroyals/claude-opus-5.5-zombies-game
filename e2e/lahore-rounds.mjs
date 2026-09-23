// Lahore Darbar round soak: all doors open, the player relocates each round (court, lanes, roofs, basement, upper court)
// and the horde is killed as it arrives. Checks round flow (special round 5, boss round 8), that spawns come from the
// zone the player is in (windows, roof drops, basement claws) and that zombies reach the player on every level.
//   BASE=http://127.0.0.1:5181 node e2e/lahore-rounds.mjs
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';
const exe = fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
await p.addInitScript(() => localStorage.setItem('deadsignal.settings.v1', JSON.stringify({ quality: 'low' })));
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await p.goto(`${process.env.BASE ?? 'http://127.0.0.1:5181'}/?mode=zombies&map=lahore-darbar&dev`);
await p.waitForFunction(() => window.__DS, null, { timeout: 180000 });
const ds = (fn, ...a) => p.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
await ds('lock', true); await p.click('#btn-zombies'); await p.waitForTimeout(4000);
await ds('godMode', true);
const def = await ds('zDef');
for (const d of def.doors) await ds('zOpen', d.id);
const zoneAt = (x, z, y) => { let best = -1, bf = -1e9; for (const r of def.rooms) { const q = r.rect; if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue; if (r.floor > 0 && y < r.floor - 0.6) continue; if (r.floor > bf) { bf = r.floor; best = r.zone; } } return best; };
// Where the player stands for each round (x, y, z) and a label.
const POS = { 1: [-2, 3, 12, 'Hazuri Bagh'], 2: [60.5, 3, 20, 'Kucha lane B'], 3: [48, 10.2, 22, 'Kothay roof'], 4: [40, 0, -38, 'Tehkhana'],
  5: [-30, 3, 8, 'Top Khana'], 6: [-18, 7.2, -48, 'Shah Burj'], 7: [72, 3, 6, 'Naqqar Khana'], 8: [-2, 3, -20, 'Diwan-e-Aam'], 9: [-20, 7.2, -63, 'Sheesh Mahal'] };
await ds('timeScale', 3);
const spawnZones = {}; const reached = {}; let bossSeen = false; let lastRound = -1;
const t0 = Date.now();
while (Date.now() - t0 < 30 * 60e3) {
  await p.waitForTimeout(400);
  const z = await ds('zm');
  if (z.round !== lastRound) {
    lastRound = z.round;
    const pos = POS[z.round] ?? POS[1];
    await ds('teleport', pos[0], pos[2], 0, pos[1]);
    console.log('round', z.round, z.phase, 'player at', pos[3], 'zone', z.zone);
  }
  if (z.round >= +(process.env.UNTIL ?? 9)) break;
  if (z.boss) bossSeen = true;
  const zs = await ds('zombies');
  const st = await ds('state');
  for (const q of zs) {
    const zn = zoneAt(q.x, q.z, st.pos.y);
    const k = `${z.round}`;
    (spawnZones[k] ??= {})[zn] = ((spawnZones[k] ?? {})[zn] ?? 0) + 0; // touch
    if (Math.hypot(q.x - st.pos.x, q.z - st.pos.z) < 2.5) reached[z.round] = (reached[z.round] ?? 0) + 1;
  }
  // Kill anything that has reached the player (or everything, every few seconds) so rounds advance.
  await p.evaluate(([px, pz, all]) => { const e = window.__DS.game.enemies; for (const q of e.zombies) if (q.alive && (all || Math.hypot(q.pos.x - px, q.pos.z - pz) < 3)) e.damage(q, 1e6, false, q.pos.x, q.pos.y + 1, q.pos.z, 0, 1); }, [st.pos.x, st.pos.z, (Date.now() / 1000 | 0) % 12 === 0]);
  for (const q of zs) { const zn = zoneAt(q.x, q.z, 99); spawnZones[z.round] ??= {}; spawnZones[z.round][zn] = (spawnZones[z.round][zn] ?? 0) + 1; }
  if (z.round === 6 && !reached.jumped && z.phase === 'break') { reached.jumped = 1; await ds('zRound', 8); }
}
const z = await ds('zm');
console.log('final round', z.round, 'kills', z.stats.kills, 'bossSeen', bossSeen);
console.log('zombie-zone samples per round', JSON.stringify(spawnZones));
console.log('zombies that reached the player per round', JSON.stringify(reached));
await p.screenshot({ path: '/tmp/lahore-shots/rounds-end.png' });
console.log('errors', errors.slice(0, 8));
await b.close();
