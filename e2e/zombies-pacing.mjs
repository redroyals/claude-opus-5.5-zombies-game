// Headless pacing play-through for one map, driven through the dev API with real E presses at the real positions:
//   1. no Cache at the start (hidden state, no E prompt at its old spot, nothing drawn);
//   2. only starter-tier guns in the spawn zone, and one bought off the wall;
//   3. doors opened until the Cache surfaces (the reveal flare), then pulled at its new spot;
//   4. a new perk bought from its machine;
//   5. the Reforger three times: tier I -> II -> III;
//   6. every buildable part picked up, the build assembled at the bench (and the shield taken);
//   7. a trap bought and zombies walked into it;
//   8. the side quest collected by walking over its objects.
// Usage: BASE=http://127.0.0.1:5231 MAP=nightfall node e2e/zombies-pacing.mjs /tmp/pacing-nightfall
import { chromium } from 'playwright-core';
import os from 'node:os';
import fs from 'node:fs';

const MAP = process.env.MAP ?? 'nightfall';
const out = process.argv[2] ?? `/tmp/pacing-${MAP}`;
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? fs.readdirSync(`${os.homedir()}/.cache/ms-playwright`).filter((d) => d.startsWith('chromium-')).map((d) => `${os.homedir()}/.cache/ms-playwright/${d}/chrome-linux-arm64/chrome`).find((p) => fs.existsSync(p));
const gpu = process.env.SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'];
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', ...gpu, '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5231'}/?mode=zombies&map=${MAP}&dev`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__DS, null, { timeout: 120000 });
const ds = (fn, ...a) => page.evaluate(([f, args]) => window.__DS[f](...args), [fn, a]);
const wait = (ms) => page.waitForTimeout(ms);
const log = (...a) => console.log(...a);
const results = {};
const check = (name, ok, info = '') => { results[name] = !!ok; log(ok ? 'PASS' : 'FAIL', name, info); };
const shot = async (n) => { await wait(400); await page.screenshot({ path: `${out}/${n}.png` }); log('shot', n); };
const press = async (code = 'KeyE') => { await ds('key', code, true); await wait(160); await ds('key', code, false); await wait(150); };
const pace = () => ds('zPace');
const find = () => ds('zFind');
const yawTo = (px, pz, tx, tz) => Math.atan2(-(tx - px), -(tz - pz));
const front = (s, d) => ({ x: s.x + Math.sin(s.face) * d, z: s.z + Math.cos(s.face) * d, y: s.y ?? 0 });
/** Stand at (x,z) on the floor near y, looking at (tx,tz). */
const stand = async (x, z, y, tx, tz, pitch = -0.1) => { const yaw = yawTo(x, z, tx, tz); await ds('teleport', x, z, yaw, y); await ds('look', yaw, pitch); await wait(300); };
/** Poll game state (the headless sim can run slower than wall time). */
const until = async (pred, maxMs = 60000, every = 250) => { const t0 = Date.now(); for (;;) { const v = await pred(); if (v) return v; if (Date.now() - t0 > maxMs) return null; await wait(every); } };
const def = await page.evaluate(() => JSON.parse(JSON.stringify(window.__DS.game.zm.def)));

await ds('lock', true);
await page.click('#btn-zombies').catch(() => {});
await wait(2500);
if ((await ds('zMap')) !== MAP) { await ds('zMap', MAP); await wait(2500); }
await ds('godMode', true);
await wait(4000);
// Keep the horde small while we test machines: freeze the round director on a long break.
const holdRounds = () => page.evaluate(() => { const r = window.__DS.game.zm.rounds; r.phase = 'break'; r.timer = 9999; });
await holdRounds();
await ds('clearZombies', true);

// ---- 1. No Cache at the start --------------------------------------------------------------------
let p = await pace();
check('cache hidden at start', p.box.phase === 'hidden' && p.box.zone === null, JSON.stringify(p.box));
const s0 = def.box.spots[def.box.start ?? 0];
const f0 = front(s0, 1.1);
await stand(f0.x, f0.z, f0.y, s0.x, s0.z, -0.3);
const visibleBoxes = await page.evaluate(() => window.__DS.game.zm.cache.views.filter((v) => v.body.visible || v.beam.visible).length);
const f0k = await find();
check('no Cache at its start spot (nothing drawn, no E prompt)', visibleBoxes === 0 && f0k?.kind !== 'box', `visible=${visibleBoxes} find=${JSON.stringify(f0k)}`);
await shot('01-no-cache-at-start');

// ---- 2. Starter guns only in the spawn zone ------------------------------------------------------
const walls = await ds('zWalls');
const startWalls = walls.filter((w) => w.start);
check('spawn zone has only starter wall-buys', startWalls.length >= 3 && startWalls.every((w) => w.tier === 'starter'), startWalls.map((w) => `${w.key}:${w.tier}`).join(' '));
check('heavy guns hang outside the spawn zone', walls.some((w) => w.tier === 'heavy' && !w.start), walls.filter((w) => w.tier === 'heavy').map((w) => w.key).join(' '));
const drover = startWalls.find((w) => w.key === 'br_drover');
if (drover) {
  const f = front(drover, 0.8);
  await stand(f.x, f.z, f.y, drover.x, drover.z, 0.05);
  const k = await find();
  const before = (await ds('zm')).points;
  await press();
  await wait(600);
  const st = await ds('state');
  check('bought the starter bolt-action off the spawn wall', k?.kind === 'wall' && st.slots.some((s) => s?.id === 'br_drover') && (await ds('zm')).points === before - drover.price, `find=${JSON.stringify(k)}`);
  await shot('02-starter-wall');
}

// ---- 3. Open doors until the Cache surfaces ------------------------------------------------------
await ds('zPoints', 50000);
const opened = new Set();
const openable = () => { const zones = new Set([def.startZone]); for (const d of def.doors) if (opened.has(d.id)) { zones.add(d.a); zones.add(d.b); } return def.doors.filter((d) => !opened.has(d.id) && !d.requiresPower && (zones.has(d.a) || zones.has(d.b))).sort((a, b) => a.cost - b.cost); };
let revealedAfter = -1;
for (let i = 0; i < def.doors.length; i++) {
  if ((await pace()).box.phase !== 'hidden') break;
  const d = openable()[0];
  if (!d) break;
  // Walk to the door and press E on it (the real interaction path).
  const mid = (d.a0 + d.a1) / 2;
  const c = d.axis === 'x' ? { x: mid, z: d.at } : { x: d.at, z: mid };
  const sides = d.axis === 'x' ? [{ x: c.x, z: c.z - 1.3 }, { x: c.x, z: c.z + 1.3 }] : [{ x: c.x - 1.3, z: c.z }, { x: c.x + 1.3, z: c.z }];
  let done = false;
  for (const sd of sides) {
    await stand(sd.x, sd.z, d.y0, c.x, c.z, 0);
    const k = await find();
    if (k?.kind === 'door' && k.id === d.id) { await press(); done = (await ds('zm')).doors.includes(d.id); if (done) break; }
  }
  if (!done) { log('  (door by dev use)', d.id); await ds('zOpen', d.id); }
  opened.add(d.id);
  await wait(500);
  if ((await pace()).box.phase !== 'hidden' && revealedAfter < 0) revealedAfter = opened.size;
}
p = await until(async () => { const q = await pace(); return q.box.phase !== 'hidden' ? q : null; }, 15000);
check('the Cache surfaces after doors open', !!p && revealedAfter === (def.box.reveal?.doors ?? 0), `after ${revealedAfter} doors · ${JSON.stringify(p?.box)}`);
if (p) {
  const zones = await page.evaluate(() => window.__DS.game.zm.zoneName(window.__DS.game.zm.def.box.spots[window.__DS.game.zm.box.location]));
  const startName = def.zones.find((z) => z.id === def.startZone).name;
  check('it surfaces outside the spawn zone', p.box.zone && p.box.zone !== startName, `${p.box.zone} (start ${startName}) ${zones}`);
  const sp = def.box.spots[p.box.location];
  const f = front(sp, 2.6);
  await stand(f.x, f.z, f.y, sp.x, sp.z, 0.15);
  const flare = await page.evaluate(() => window.__DS.game.zm.cache.flareT);
  check('reveal flare is up', flare > 0, `flareT=${flare.toFixed?.(2)}`);
  await shot('03-cache-surfaced');
  const fc = front(sp, 1.1);
  await stand(fc.x, fc.z, fc.y, sp.x, sp.z, -0.2);
  const k = await find();
  await press();
  const spun = await until(async () => { const q = await ds('zm'); return q.box.phase === 'spinning' || q.box.phase === 'offer' ? q : null; }, 8000);
  check('the surfaced Cache can be pulled', k?.kind === 'box' && !!spun, JSON.stringify(k));
  await until(async () => { const q = await ds('zm'); return q.box.phase === 'offer' || q.box.phase === 'moving' ? q : null; }, 30000);
  await shot('04-cache-offer');
  await press();
}

// ---- Power (maps that need it) ---------------------------------------------------------------------
if (def.power) {
  for (const d of def.doors) if (!opened.has(d.id)) { await ds('zOpen', d.id); opened.add(d.id); }
  await ds('zPower');
  await wait(800);
}
check('power on', (await ds('zm')).power);
await ds('zPoints', 100000);

// ---- 4. A new perk from its machine ------------------------------------------------------------------
const newPerk = ['hawkeye', 'strider', 'nova', 'packmule'].find((k) => def.perks[k]);
if (newPerk) {
  const s = def.perks[newPerk];
  const f = front(s, 1.3);
  await stand(f.x, f.z, f.y, s.x, s.z, 0.1);
  const k = await find();
  await press();
  await wait(600);
  check(`bought ${newPerk} from its machine`, k?.kind === 'perk' && (await pace()).perks.includes(newPerk), JSON.stringify(k));
  await shot('05-new-perk');
}

// ---- 5. The Reforger, three passes ----------------------------------------------------------------
{
  const s = def.pap;
  const f = front(s, 1.4);
  const tiers = [];
  for (let i = 0; i < 3; i++) {
    await stand(f.x, f.z, f.y, s.x, s.z, 0.05);
    const k = await find();
    const prompt = await page.evaluate(() => document.querySelector('#prompt, .prompt')?.textContent ?? '');
    await press();
    const t0 = (await pace()).slots[(await pace()).active]?.tier ?? 0;
    const q = await until(async () => { const z = await pace(); const w = z.slots[z.active]; return w && w.tier > t0 ? z : null; }, 30000);
    tiers.push(q ? q.slots[q.active].tier : -1);
    log('  reforge', i + 1, JSON.stringify(k), prompt.slice(0, 90));
    if (i === 0) await shot('06-reforger-tier1');
  }
  const name = await page.evaluate(() => { const g = window.__DS.game; const w = g.weapons.active; return w ? g.zm.weaponName(w.id, w.tier) : ''; });
  check('Reforger tier I -> II -> III', tiers.join(',') === '1,2,3', `${tiers.join(',')} · ${name}`);
  await stand(f.x, f.z, f.y, s.x, s.z, 0.05);
  await shot('07-reforger-tier3');
}

// ---- 6. Buildables: pick up every part, build at the bench -------------------------------------------
for (const [bi, b] of (def.buildables ?? []).entries()) {
  let picked = 0;
  for (const [pi, part] of b.parts.entries()) {
    // Stand next to the part and face it.
    const cands = [[0, 0.9], [0.9, 0], [0, -0.9], [-0.9, 0]].map(([dx, dz]) => ({ x: part.x + dx, z: part.z + dz }));
    let got = false;
    for (const c of cands) {
      await stand(c.x, c.z, part.y - 0.9, part.x, part.z, -0.3);
      const k = await find();
      if (k?.kind === 'part' && k.b === bi && k.i === pi) { await press(); got = (await pace()).builds[bi].found[pi]; if (got) break; }
    }
    if (got) picked++;
    else log('  part not reachable by E:', part.name, JSON.stringify(await find()));
    if (pi === 0) await shot(`08-part-${bi}`);
  }
  check(`${b.name}: every part picked up with E`, picked === b.parts.length, `${picked}/${b.parts.length}`);
  const f = front(b.bench, 1.2);
  await stand(f.x, f.z, f.y, b.bench.x, b.bench.z, -0.15);
  const k = await find();
  await press();
  await wait(500);
  const built = (await pace()).builds[bi].built;
  check(`${b.name} built at the bench`, k?.kind === 'bench' && built, JSON.stringify(k));
  if (b.result.kind === 'shield') {
    await press();
    await wait(400);
    check(`${b.name} taken`, (await pace()).shield > 0, `hp=${(await pace()).shield}`);
  }
  await shot(`09-built-${bi}`);
}

// ---- 7. A trap: buy it, then walk zombies into it --------------------------------------------------
for (const [ti, t] of (def.traps ?? []).entries()) {
  const f = front(t.switch, 0.9);
  await stand(f.x, f.z, f.y, t.switch.x, t.switch.z, 0);
  const k = await find();
  await press();
  await wait(300);
  const st = (await pace()).traps[ti];
  check(`${t.name}: switched on at its panel`, k?.kind === 'trap' && st.phase === 'active', `${JSON.stringify(k)} ${JSON.stringify(st)}`);
  const a = t.area;
  const cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
  for (let i = 0; i < 4; i++) await ds('zSpawn', 'shambler', cx + (i - 1.5) * 0.8, cz, a.y);
  const lookFrom = { x: f.x, z: f.z };
  await ds('look', yawTo(lookFrom.x, lookFrom.z, cx, cz), -0.15);
  await wait(900);
  await shot(`10-trap-live-${ti}`);
  const q = await until(async () => { const z = await pace(); return z.traps[ti].kills >= 3 ? z : null; }, 20000);
  check(`${t.name}: killed zombies in its area`, !!q, `kills=${(await pace()).traps[ti].kills}`);
}

// ---- 8. The side quest: walk over its objects --------------------------------------------------------
for (const [k, egg] of (def.sideEggs ?? []).entries()) {
  const idx = (def.egg ? 1 : 0) + k;
  for (const o of egg.steps[0].objects) {
    await ds('teleport', o.x, o.z, 0, o.y - 0.6);
    await wait(500);
  }
  const done = await until(async () => (await pace()).eggs[idx]?.complete, 8000);
  const pk = await pace();
  check(`side quest "${egg.name}" collected`, !!done && pk.perks.includes(egg.reward.perk), JSON.stringify(pk.eggs[idx]));
}

// ---- Elemental rounds and a round of play ---------------------------------------------------------
await ds('zSpawn', 'shambler', def.playerSpawn.x + 2, def.playerSpawn.z + 2, def.playerSpawn.y ?? 0);
await wait(300);
const el = await ds('zElement', 'fire');
check('elemental proc applies (fire)', el);
const perkLimit = (await pace()).perkLimit;
log('perk limit', perkLimit, 'specials', JSON.stringify((await pace()).specials));

const fails = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
log('RESULT', MAP, fails.length ? `FAIL ${fails.join(' | ')}` : 'ALL PASS', `${Object.keys(results).length} checks`);
log('errors', JSON.stringify(errors.slice(0, 8)));
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ map: MAP, results, errors }, null, 2));
await browser.close();
process.exit(fails.length ? 1 : 0);
