// Headless 2-client browser test: needs `cd server && pnpm dev` (8787) and `PORT=5174 pnpm dev` (vite).
// Usage: node scripts/mp-browser-test.mjs [http://127.0.0.1:5174]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_PATH ?? 'puppeteer-core');
const BASE = process.argv[2] ?? 'http://127.0.0.1:5174';
const exe = process.env.CHROME ?? [`${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome`, `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux/chrome`, `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const launch = () => puppeteer.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
// Separate browsers so both clients are "foreground" (rAF is paused in background tabs).
const browser = await launch(), browser2 = await launch();
try {
  const setup = await browser.newPage();
  await setup.goto(`${BASE}/mp.html`);
  const tag = Date.now().toString(36).slice(-4);
  const sess = await setup.evaluate(async (tag) => {
    const a = await (await fetch('/api/auth/dev', { method: 'POST', body: JSON.stringify({ name: `Ava${tag}` }) })).json();
    const room = await (await fetch('/api/private', { method: 'POST', body: JSON.stringify({ mode: 'tdm', map: 'range', scoreLimit: 2 }) })).json();
    return { a: a.session, code: room.code };
  }, tag);
  console.log('private room', sess.code);
  const pa = await browser.newPage(), pb = await browser2.newPage();
  for (const p of [pa, pb]) { await p.setViewport({ width: 960, height: 540 }); p.on('pageerror', (e) => console.error('pageerror', e.message)); }
  await pa.goto(`${BASE}/mp.html`); await pa.evaluate((s) => localStorage.setItem('ds_session', s), sess.a);
  await pb.goto(`${BASE}/mp.html`); await pb.evaluate(() => localStorage.setItem('ds_guest', 'GuestBee'));
  await pa.goto(`${BASE}/mp.html?room=${sess.code}&autotest=1`);
  await pb.goto(`${BASE}/mp.html?room=${sess.code}&autotest=1`);
  const st = (p) => p.evaluate(() => window.__mp?.state());
  let A, B;
  for (let i = 0; i < 100; i++) { A = await st(pa); B = await st(pb); if (A?.remotes?.length && B?.remotes?.length && A.self && B.self) break; await sleep(100); }
  console.log('A sees', A?.remotes?.map((r) => r.id), 'B sees', B?.remotes?.map((r) => r.id), 'rtt', A?.rtt);
  if (!A?.remotes?.some((r) => r.id === B.you) || !B?.remotes?.some((r) => r.id === A.you)) throw new Error('clients do not see each other');
  // Move B a little (prediction path), then A aims and fires.
  await pb.evaluate(() => window.__mp.key('KeyD', true)); await sleep(400); await pb.evaluate(() => window.__mp.key('KeyD', false));
  let killed = false;
  for (let i = 0; i < 150 && !killed; i++) {
    A = await st(pa);
    const t = A.remotes.find((r) => r.id === B.you);
    const me = A.pos;
    const dx = t.x - me.x, dz = t.z - me.z, dy = t.y + 1.2 - (me.y + 1.63);
    await pa.evaluate((y, p) => { window.__mp.aim(y, p); window.__mp.fire(true); }, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await sleep(60);
    killed = A.feed.some((f) => f.includes('GuestBee'));
  }
  await pa.evaluate(() => window.__mp.fire(false));
  await pa.screenshot({ path: '/tmp/mp-A.png' }); await pb.screenshot({ path: '/tmp/mp-B.png' });
  console.log('A feed', A.feed, 'pred err', A.err);
  if (!killed) throw new Error('kill did not register');
  console.log('OK: two browser clients saw each other and a kill registered');
} finally { await browser.close(); await browser2.close(); }
