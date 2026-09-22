// Headless screenshots of gallery/maps pages for review (arm64 Playwright Chromium + SwiftShader).
//   node scripts/render-check.mjs <outDir> "<query>" ["<query>" ...]   e.g. "gallery.html?sheet=weapons&shot=1"
// Needs vite running: `npx vite --port 5190 --strictPort` (PORT env overrides).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [out, ...queries] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const chrome = execFileSync('sh', ['-c', 'ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | head -1']).toString().trim();
const { chromium } = await import('playwright-core').catch(() => import('/home/workstation/.local/node/lib/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
for (const [i, qq] of queries.entries()) {
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5190}/${qq}`);
  await page.waitForFunction(() => (window).__ready === true, null, { timeout: 180000 }).catch(() => console.log('timeout', qq));
  await page.waitForTimeout(1500);
  const f = `${out}/${String(i).padStart(2, '0')}-${qq.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`;
  await page.screenshot({ path: f }); console.log(f);
}
await browser.close();
