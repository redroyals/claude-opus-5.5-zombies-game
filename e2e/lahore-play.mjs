// Headless play-through of the Lahore Darbar: rounds and spawns, every door bought in sequence by walking to it and
// pressing E, the power (naqqara), box, perks, Pack-a-Punch (the armourer's forge) and the first egg steps.
//   BASE=http://127.0.0.1:5181 node e2e/lahore-play.mjs [/tmp/lahore-shots/play]
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/lahore-shots/play';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
// Low quality (no shadow maps) so SwiftShader keeps the fixed-step sim near real time.
await page.addInitScript(() => localStorage.setItem('deadsignal.settings.v1', JSON.stringify({ quality: 'low' })));
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5181'}/?mode=zombies&map=lahore-darbar&dev`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DS, null, { timeout: 180000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (n) => { await wait(500); await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const press = async (code = 'KeyE') => { await ds('key', code, true); await wait(180); await ds('key', code, false); await wait(150); };
const until = async (pred, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const z = await ds('zm'); if (pred(z)) return z; await wait(250); } return null; };
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) fails.push(msg); };
/** Camera yaw that looks along (dx, dz). */
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const stand = async (x, y, z, lookX, lookZ, pitch = 0) => { const yaw = yawTo(lookX - x, lookZ - z); await ds('teleport', x, z, yaw, y); await ds('look', yaw, pitch); await wait(250); };
/** Stand in front of a machine spot (face = the way its front faces, 0 = +Z). */
const front = async (s, dist = 1.1, pitch = 0) => stand(s.x + Math.sin(s.face) * dist, s.y ?? 0, s.z + Math.cos(s.face) * dist, s.x, s.z, pitch);

await ds('lock', true);
await page.click('#btn-zombies');
await wait(5000);
await ds('godMode', true);
const def = await ds('zDef');
const zoneAt = (x, z, y) => { let best = -1, bf = -1e9; for (const r of def.rooms) { const q = r.rect; if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue; if (r.floor > 0 && y < r.floor - 0.6) continue; if (r.floor > bf) { bf = r.floor; best = r.zone; } } return best; };
await shot('00-spawn');

// ---- Round 1: zombies come through the garden windows ----
await ds('zRound', 1);
const r1 = await until((z) => z.round === 1 && z.alive > 0, 180000);
check(!!r1, 'round 1 started and zombies spawned');
await wait(8000);
const zs = await ds('zombies');
check(zs.length > 0 && zs.every((q) => zoneAt(q.x, q.z, 3) === 0 || zoneAt(q.x, q.z, 3) === -1), `round-1 zombies are in/outside the Hazuri Bagh (${zs.length})`);
await stand(-2, 3, 12, -10, 20, -0.05);
await shot('01-round1');
await ds('clearZombies');

// ---- Doors, in a player's order ----
await ds('zPoints', 60000);
const ORDER = ['bagh_topkhana', 'bagh_alamgiri', 'topkhana_armoury', 'topkhana_hathipol', 'aam_toshakhana', 'aam_khas', 'burj_sheesh', 'burj_ramparts',
  'bagh_roshnai', 'roshnai_wazir', 'roshnai_kucha_n', 'roshnai_kucha_s', 'wazir_kucha', 'kucha_naqqar', 'wazir_kothay', 'naqqar_kothay', 'kucha_tehkhana', 'tehkhana_vault'];
for (const id of ORDER) {
  const d = def.doors.find((q) => q.id === id);
  const mid = (d.a0 + d.a1) / 2;
  const opened = (await ds('zm')).doors;
  // Stand on whichever side is already unlocked.
  let best = null;
  for (const s of [-1.3, 1.3]) {
    const x = d.axis === 'x' ? mid : d.at + s, z = d.axis === 'x' ? d.at + s : mid;
    const zn = zoneAt(x, z, d.y0 + 0.1);
    const unlocked = zn === def.startZone || def.doors.some((q) => opened.includes(q.id) && (q.a === zn || q.b === zn));
    if (unlocked) best = { x, z };
  }
  if (!best) { check(false, `door ${id}: no unlocked side`); continue; }
  const pts = (await ds('zm')).points;
  await stand(best.x, d.y0, best.z, d.axis === 'x' ? mid : d.at, d.axis === 'x' ? d.at : mid, 0.05);
  await press();
  await wait(1300);
  const after = await ds('zm');
  check(after.doors.includes(id) && pts - after.points === d.cost, `door ${id} bought by walking up (${d.cost})`);
  if (['bagh_alamgiri', 'topkhana_hathipol', 'burj_sheesh', 'bagh_roshnai', 'kucha_naqqar', 'tehkhana_vault'].includes(id)) await shot(`door-${id}`);
}
check((await ds('zm')).doors.length === 18, 'all 18 doors open');

// ---- Perk without power: Lifeline ----
await front(def.perks.lifeline); await press(); await wait(600);
check((await ds('zm')).perks.includes('lifeline'), 'Lifeline bought without power');
// Pack-a-Punch refuses before the power
await front(def.pap, 1.3, -0.1); await shot('pap-no-power');

// ---- Power: the naqqara in the Naqqar Khana ----
await front(def.power, 1.1, -0.2);
await shot('power-before');
await press(); await wait(2000);
check((await ds('zm')).power === true, 'power on by beating the naqqara');
await shot('power-after');

// ---- Perks after power ----
for (const id of ['quickhands', 'bulwark', 'hammerfall']) {
  await front(def.perks[id], 1.6, -0.05); await wait(400);
  const it = (await ds('state')).interaction;
  await press(); await wait(900);
  if (!(await ds('zm')).perks.includes(id)) console.log('perk debug', id, it, JSON.stringify((await ds('state')).pos));
  check((await ds('zm')).perks.includes(id), `perk ${id}`);
  await shot(`perk-${id}`);
}

// ---- Box: the casket in the baradari ----
await front(def.box.spots[0], 1.2, -0.3);
await press();
const spun = await until((z) => z.box.phase === 'spinning', 20000);
check(!!spun, 'box spins');
await wait(1500); await shot('box-spin');
await until((z) => z.box.phase === 'offer' || z.box.phase === 'moving', 120000);
await shot('box-offer');
await press(); await wait(800);
const st = await ds('state');
check(st.slots.filter(Boolean).length === 2, `box weapon taken (${st.slots.map((s) => s && s.id).join(',')})`);

// ---- Pack-a-Punch: the armourer's forge ----
const tier0 = (await ds('state')).weapon.tier;
await front(def.pap, 1.3, -0.1);
await press(); await wait(1500); await shot('pap-forging');
await until(() => true, 1); for (let i = 0; i < 60 && (await ds('state')).weapon.tier === tier0; i++) await wait(1000);
check((await ds('state')).weapon.tier === tier0 + 1, 'weapon reforged at the forge');
await shot('pap-done');

// ---- Egg step 1 (mirrors) and step 2 (keys) ----
const egg0 = await ds('zEgg');
for (const m of def.egg.steps[0].objects) { await stand(m.x + (m.x < -30 ? 1 : m.x > -7 ? -1 : 0), 7.2, m.z + (m.z < -69 ? 1 : 0), m.x, m.z, 0.1); await press(); await wait(400); }
const egg1 = await ds('zEgg');
check(egg1.step === 1, `egg step 1 (mirrors) done: ${JSON.stringify(egg0)} -> ${JSON.stringify(egg1)}`);
await shot('egg-mirrors');
for (const k of def.egg.steps[1].objects) { await ds('teleport', k.x, k.z, 0, k.y - 0.35); await wait(700); }
const egg2 = await ds('zEgg');
check(egg2.step === 2, `egg step 2 (keys) done: ${JSON.stringify(egg2)}`);

// ---- A few rounds of fighting on the Diwan-e-Aam quad ----
await ds('zRound', 4);
await stand(-2, 3, -14, -2, -20, 0);
for (let i = 0; i < 80; i++) {
  await wait(600);
  const zz = await ds('zombies');
  const s = await ds('state');
  if (zz.length) {
    const t = zz.reduce((a, b) => (Math.hypot(a.x - s.pos.x, a.z - s.pos.z) < Math.hypot(b.x - s.pos.x, b.z - s.pos.z) ? a : b));
    await ds('look', yawTo(t.x - s.pos.x, t.z - s.pos.z), -0.08);
    await ds('mouse', 0, true); await wait(300); await ds('mouse', 0, false);
  }
  if (i === 12) await shot('fight');
}
const zmEnd = await ds('zm');
check(zmEnd.stats.kills > 0, `kills during the fight: ${zmEnd.stats.kills} (round ${zmEnd.round})`);
console.log(JSON.stringify(zmEnd).slice(0, 600));
console.log('frame', JSON.stringify(await ds('frameStats')));
console.log('errors', errors.slice(0, 10));
console.log(fails.length ? `FAILED: ${fails.length}\n - ${fails.join('\n - ')}` : 'ALL PASSED');
await browser.close();
process.exit(fails.length ? 1 : 0);
