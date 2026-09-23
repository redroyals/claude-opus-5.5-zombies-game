// Headless play-through of "Rio · Ridgelight" (favela) driven through the dev API with real interactions (E presses):
// rounds in the street, every door in unlock order, zone screenshots before/after power, power, perks, the Cache,
// the cable car down to the Reforger, the zipline, the tin-roof slide and the full easter egg up to the peak.
//   BASE=http://127.0.0.1:5182 node e2e/favela-play.mjs /tmp/favela-shots
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/favela-shots';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5182'}/?mode=zombies&map=favela&dev`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
const wait = (ms) => page.waitForTimeout(ms);
const log = (...a) => console.log(...a);
const results = { checks: {}, spawns: { climb: 0, drop: 0, window: 0, ground: 0, other: 0 }, frames: [] };
const check = (name, ok, info = '') => { results.checks[name] = ok; log(ok ? 'PASS' : 'FAIL', name, info); };
const shot = async (n) => { await wait(500); await page.screenshot({ path: `${out}/${n}.png` }); log('shot', n); };
const press = async (code = 'KeyE') => { await ds('key', code, true); await wait(160); await ds('key', code, false); await wait(120); };
const zm = () => ds('zm');
const state = () => ds('state');
const def = await page.evaluate(() => { const d = window.__DS.game.zm.def; return JSON.parse(JSON.stringify({ doors: d.doors, zones: d.zones, perks: d.perks, pap: d.pap, power: d.power, box: d.box, rides: d.rides, egg: d.egg })); });
/** Camera yaw that looks from (px,pz) at (tx,tz): yaw 0 faces -Z. */
const yawTo = (px, pz, tx, tz) => Math.atan2(-(tx - px), -(tz - pz));
const stand = async (x, z, y, tx, tz, pitch = 0) => { await ds('teleport', x, z, yawTo(x, z, tx, tz), y); await ds('look', yawTo(x, z, tx, tz), pitch); await wait(250); };
const front = (s, d) => ({ x: s.x + Math.sin(s.face) * d, z: s.z + Math.cos(s.face) * d, y: s.y ?? 0 });
/** What E would do right now (ZombiesMode.find at the player's feet). */
const target = () => page.evaluate(() => { const g = window.__DS.game; const f = g.zm.find(g.player.pos); return f ? f.kind : null; });
const frame = async (tag) => { const f = await ds('frameStats'); results.frames.push({ tag, ...f }); };
/** Headless swiftshader runs the sim far slower than wall time: poll game state instead of sleeping. */
const until = async (pred, maxMs = 240000, every = 500) => { const t0 = Date.now(); for (;;) { const v = await pred(); if (v) return v; if (Date.now() - t0 > maxMs) return null; await wait(every); } };
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r && Math.abs(p.y - q.y) < 1.5;
/** A ride pins the player until it has fully ended (the last metre eases out); wait for that before doing anything else. */
const rideOver = () => until(() => page.evaluate(() => window.__DS.game.zm.ridePos === null), 300000, 300);

await ds('lock', true);
await page.click('#btn-zombies').catch(() => {});
await wait(3000);
if ((await ds('zMap')) !== 'favela') { await ds('zMap', 'favela'); await wait(3000); }
await ds('godMode', true);
await wait(6000); // let the hillside stream in
const s0 = await state();
check('spawn in the bottom street', (await zm()).zone === 'BOTTOM STREET', JSON.stringify(s0.pos));
await shot('00-spawn');

// ---- Rounds 1-3 in the street: auto-aim at the nearest zombie; classify where each zombie first appears ----
const classify = (z) => {
  if (z.y < 1) return 'climb';
  if (z.y > 9.5 && z.y < 11 && Math.abs(z.x - 24) < 7) return 'drop';
  if (z.y > 3.5 && z.y < 4.6 && (z.z > 45.5 || z.x < -18.5 || z.x > 36.5 || (z.x > 10.2 && z.z > 39))) return 'window';
  return 'other';
};
const fight = async (secs, tag) => {
  for (let i = 0; i < secs * 2; i++) {
    await wait(500);
    const zs = await ds('zombies');
    const s = await state();
    if (zs.length) {
      const t = zs.reduce((a, b) => (Math.hypot(a.x - s.pos.x, a.z - s.pos.z) < Math.hypot(b.x - s.pos.x, b.z - s.pos.z) ? a : b));
      const pitch = Math.atan2(t.y + 1.2 - (s.pos.y + 1.6), Math.hypot(t.x - s.pos.x, t.z - s.pos.z));
      await ds('look', yawTo(s.pos.x, s.pos.z, t.x, t.z), pitch);
      await ds('mouse', 0, true); await wait(180); await ds('mouse', 0, false);
    }
    if (tag && i === 8) await shot(tag);
  }
};
// Watch spawns: sample often during round 1-2 and classify fresh zombies (not seen near this spot before).
const watchSpawns = async (maxMs) => {
  const known = [];
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs && !(results.spawns.climb > 0 && results.spawns.drop > 0)) {
    await wait(250);
    const zs = await ds('zombies');
    for (const z of zs) {
      if (known.some((k) => Math.hypot(k.x - z.x, k.z - z.z) < 1.2 && Math.abs(k.y - z.y) < 1)) continue;
      const fresh = !known.some((k) => Math.hypot(k.x - z.x, k.z - z.z) < 6);
      known.push({ x: z.x, y: z.y, z: z.z });
      if (fresh) results.spawns[classify(z)]++;
    }
    if (known.length > 400) known.splice(0, 200);
  }
};
await stand(4, 35, 4, 4, 42);
await ds('zRound', 1);
await watchSpawns(150000);
await shot('01-round1-street');
log('spawn origins (street):', JSON.stringify(results.spawns));
// Deterministic vertical-entry checks (the director's own picks are logged above): a zombie placed in the street's
// climb yard (y 0) must scale the wall into the street; one on the roof ledge (y 10) must drop into it.
{
  await ds('clearZombies');
  await stand(21.5, 35.5, 4, 23.8, 39, 0.05);
  await ds('zSpawn', 'shambler', 23.8, 40.4, 0);
  await until(async () => (await ds('zombies')).some((z) => z.y > 3.3 && z.z > 37.6), 60000, 120); // head above the parapet
  await shot('01b-zombie-climbing');
  const up = await until(async () => (await ds('zombies')).some((z) => z.y > 3.9 && z.z < 37.9), 90000);
  check('zombies climb up from below the street (yard y0 -> street y4)', !!up || results.spawns.climb > 0);
  await ds('clearZombies');
  await stand(20, 33, 4, 24, 28.5, 0.35);
  await ds('zSpawn', 'shambler', 24, 27.8, 10);
  await until(async () => (await ds('zombies')).some((z) => z.y > 4.6 && z.y < 9.4), 60000, 150);
  await shot('01c-zombie-dropping');
  const down = await until(async () => (await ds('zombies')).some((z) => z.y < 4.2 && z.z > 30), 90000);
  check('zombies drop off the roofs (ledge y10 -> street y4)', !!down || results.spawns.drop > 0);
  await ds('clearZombies');
}
{
  const t0 = Date.now();
  let shotDone = false;
  while (Date.now() - t0 < 420000 && (await zm()).round < 3) { await fight(6, shotDone ? null : '02-fight'); shotDone = true; }
}
const r1 = await zm();
check('rounds progress (round 1 cleared in the street)', r1.round >= 2, `round ${r1.round} kills ${r1.stats.kills}`);
await frame('street-fight');

// ---- Doors in unlock order with real E presses from the unlocked side ----
await ds('zPoints', 60000);
const order = ['street_beco', 'street_houses', 'beco_houses', 'beco_quadra', 'houses_laje', 'quadra_bridge', 'laje_samba', 'samba_station', 'quadra_mirante', 'mirante_power', 'station_power'];
const zoneName = (id) => def.zones.find((z) => z.id === id).name;
const views = {
  'BOTTOM STREET': [[8, 33.5, 4, -12, 36], [30, 34, 4, 20, 33]],
  'STAIR ALLEY': [[-14.8, 29.5, 4, -14.8, 20, 0.25]],
  'STACKED HOUSES': [[10, 22, 8, -10, 20]],
  'BIG LAJE': [[28, 6, 16, 10, -18, 0.08]],
  'THE QUADRA': [[-18, 13, 12, -40, -10, 0.1]],
  'SAMBA HALL': [[16, -25, 16, 16, -40, 0.05]],
  'CABLE-CAR STATION': [[28, -46, 24, 12, -56, 0.05]],
  'THE MIRANTE': [[-20, -56, 24, -30, -30, -0.1]],
  'SUBSTATION': [[-4, -46, 24, -4, -60, 0]],
};
const zoneShots = async (prefix) => {
  const opened = new Set((await zm()).doors);
  let i = 0;
  for (const [name, vs] of Object.entries(views)) {
    for (const v of vs) {
      await stand(v[0], v[1], v[2], v[3], v[4], v[5] ?? 0.05);
      await wait(600);
      await shot(`${prefix}-${String(i++).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`);
    }
  }
  void opened;
};
for (const id of order) {
  const d = def.doors.find((x) => x.id === id);
  const mid = (d.a0 + d.a1) / 2;
  const c = d.axis === 'x' ? { x: mid, z: d.at } : { x: d.at, z: mid };
  const sides = d.axis === 'x' ? [{ x: c.x, z: c.z - 1.3 }, { x: c.x, z: c.z + 1.3 }] : [{ x: c.x - 1.3, z: c.z }, { x: c.x + 1.3, z: c.z }];
  const st = await zm();
  const open = new Set([0]);
  for (const od of def.doors) if (st.doors.includes(od.id)) { open.add(od.a); open.add(od.b); }
  let done = false;
  for (const sd of sides) {
    await stand(sd.x, sd.z, d.y0, c.x, c.z);
    const here = (await zm()).zone;
    if (![...open].some((z) => zoneName(z) === here)) continue;
    await press();
    await wait(400);
    done = (await zm()).doors.includes(id);
    if (done) break;
  }
  check(`door ${id} opens with E from the ${[...open].map(zoneName).join('/')} side`, done);
  if (id === 'street_beco') await shot('03-beco-open');
}

// ---- Pre-power tour of every zone ----
await ds('clearZombies');
await zoneShots('pre');
await frame('pre-power-tour');

// ---- Power at the crest ----
const pw = front(def.power, 1.0);
await stand(pw.x, pw.z, pw.y, def.power.x, def.power.z, -0.1);
await press();
await wait(1500);
check('power switch at the substation turns the power on', (await zm()).power);
await shot('10-power-on');

// ---- Post-power tour ----
await ds('clearZombies');
await zoneShots('post');
await frame('post-power-tour');

// ---- Perks (all four) ----
// The stock four fill the perk limit (4); the extra perks are covered by e2e/zombies-pacing.mjs.
for (const [id, s] of Object.entries(def.perks).filter(([k]) => ['lifeline', 'bulwark', 'quickhands', 'hammerfall'].includes(k))) {
  await ds('clearZombies');
  const f = front(s, 1.3);
  await stand(f.x, f.z, f.y, s.x, s.z, -0.05);
  await until(async () => (await target()) === 'perk', 20000, 200);
  await press();
  await wait(700);
  const has = (await zm()).perks.includes(id);
  check(`perk ${id} bought`, has);
  if (id === 'hammerfall' || id === 'lifeline') await shot(`11-perk-${id}`);
}

// ---- The Cache wherever it currently is ----
{
  await ds('clearZombies');
  const loc = (await zm()).box.location;
  const s = def.box.spots[loc];
  const f = front(s, 1.2);
  await stand(f.x, f.z, s.y ?? 0, s.x, s.z, -0.35);
  await until(async () => (await target()) === 'box', 20000, 200);
  await press();
  let z = await zm();
  z = (await until(async () => { const q = await zm(); return q.box.phase === 'offer' || q.box.phase === 'moving' ? q : null; }, 120000)) ?? await zm();
  await shot('12-cache-offer');
  const before = (await state()).slots.map((w) => w && w.id);
  await press();
  await wait(700);
  const after = (await state()).slots.map((w) => w && w.id);
  check('the Cache hands out a weapon (or the Moth flies it)', JSON.stringify(before) !== JSON.stringify(after) || z.box.phase === 'moving', `${before} -> ${after}`);
}

// ---- Cable car: ride down from the top station to the Reforger ----
{
  const r = def.rides.find((x) => x.id === 'gondola_down');
  await stand(r.at.x + 0.6, r.at.z + 0.6, r.at.y, r.at.x, r.at.z - 5);
  await ds('teleport', r.at.x, r.at.z, 0, r.at.y);
  await press();
  const last = r.path[r.path.length - 1];
  const midPt = r.path[Math.floor(r.path.length * 0.45)];
  await until(async () => near((await state()).pos, midPt, 6), 200000);
  const mid = await state();
  await ds('look', Math.PI * 0.9, -0.2);
  await shot('13-cable-car-ride');
  await rideOver();
  const end = await state();
  check('cable car carries the player down to the bottom station', Math.hypot(end.pos.x - last.x, end.pos.z - last.z) < 2 && Math.abs(end.pos.y - last.y) < 1.2, `mid y ${mid.pos.y.toFixed(1)} end ${JSON.stringify(end.pos)}`);
}

// ---- Reforger (PaP) at the bottom station ----
{
  await ds('clearZombies');
  const f = front(def.pap, 1.4);
  await stand(f.x, f.z, f.y, def.pap.x, def.pap.z, 0.05);
  await until(async () => (await target()) === 'pap', 20000, 200);
  const before = (await state()).weapon;
  await press();
  await wait(1500);
  await shot('14-reforger');
  await until(async () => ((await state()).slots.find((w) => w && w.id === before.id)?.tier ?? 0) > before.tier, 120000);
  const after = (await state()).slots.find((w) => w && w.id === before.id);
  check('the Reforger upgrades the held weapon', after && after.tier > before.tier, `${before.id} tier ${before.tier} -> ${after?.tier}`);
}

// ---- Zipline (mirante -> laje) and tin-roof slide (laje -> street) ----
for (const id of ['zipline', 'slide']) {
  const r = def.rides.find((x) => x.id === id);
  await ds('teleport', r.at.x, r.at.z, 0, r.at.y);
  await ds('look', yawTo(r.path[0].x, r.path[0].z, r.path[r.path.length - 1].x, r.path[r.path.length - 1].z), -0.15);
  await press();
  const last = r.path[r.path.length - 1];
  await until(async () => near((await state()).pos, r.path[Math.floor(r.path.length / 2)], 4), 60000, 200);
  await shot(`15-${id}`);
  await rideOver();
  const e = await state();
  check(`${id} carries the player to its end`, Math.hypot(e.pos.x - last.x, e.pos.z - last.z) < 1.5, JSON.stringify(e.pos));
}

// ---- Easter egg: grips, refit, hold the station, ride to the peak, take the reward ----
{
  const egg = def.egg;
  for (const o of egg.steps[0].objects) { await ds('teleport', o.x, o.z, 0, o.y - 0.3); await until(async () => false, 2500); }
  let z = await zm();
  const stepOf = () => page.evaluate(() => window.__DS.game.zm.egg.step);
  check('EE step 1: three cable grips collected', (await stepOf()) === 1);
  const refit = egg.steps[1].objects[0];
  await stand(refit.x - 1.2, refit.z + 0.6, 24, refit.x, refit.z);
  await press();
  await wait(600);
  check('EE step 2: peak line refitted', (await stepOf()) === 2);
  // Hold the station: 24 kills inside it (runners spawned on the platform, a big gun, insta-kill)
  await ds('zGive', 'lmg_bastion');
  await ds('zDrop', 'insta_kill');
  await stand(18, -46, 24, 18, -56);
  const tHold = Date.now();
  for (let wave = 0; Date.now() - tHold < 900000 && (await stepOf()) === 2; wave++) {
    for (let k = 0; k < 4; k++) await ds('zSpawn', 'shambler', 12 + k * 3.5, -56, 24);
    await fight(8, wave === 1 ? '16-hold-the-station' : null);
    await ds('zDrop', 'insta_kill');
  }
  check('EE step 3: the station held (24 kills)', (await stepOf()) === 3);
  const peakRide = def.rides.find((x) => x.id === 'peak_up');
  await ds('clearZombies');
  await ds('teleport', peakRide.at.x, peakRide.at.z, Math.PI, peakRide.at.y);
  await press();
  const pLast = peakRide.path[peakRide.path.length - 1];
  await until(async () => (await state()).pos.y > 34, 200000);
  await ds('look', Math.PI, -0.35);
  await shot('17-peak-line');
  await rideOver();
  const atPeak = await state();
  void pLast;
  check('peak line carries the player to the summit', atPeak.pos.y > 43, JSON.stringify(atPeak.pos));
  const ped = egg.steps[3].objects[0];
  await stand(ped.x, ped.z + 1.2, 44, ped.x, ped.z);
  await press();
  await wait(1500);
  z = await zm();
  const slots = (await state()).slots.map((w) => w && w.id);
  check('EE complete: the peak hands over the Arc Projector', slots.includes('ww_arc'), JSON.stringify(slots));
  await ds('look', 0, -0.25);
  await stand(24, -78.5, 44, 0, 40, -0.28);
  await shot('18-peak-view');
}
await frame('end');
console.log('frames', JSON.stringify(results.frames));
console.log('spawns', JSON.stringify(results.spawns));
console.log('errors', errors.slice(0, 10));
const failed = Object.entries(results.checks).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? `FAILED: ${failed.join(' | ')}` : 'ALL CHECKS PASSED');
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
