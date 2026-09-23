import { describe, expect, it } from 'vitest';
import { rasterize } from '../src/zombies/maps/lahore/raster';

describe('Lahore Darbar raster', () => {
  const r = rasterize();
  it('compiles without layout problems', () => {
    if (r.problems.length) console.log(r.problems.slice(0, 40).join('\n'));
    expect(r.problems).toEqual([]);
  });
  it('stats', () => {
    console.log('masses', r.masses.length, 'walls', r.walls.length, 'rooms', r.rooms.length, 'links', r.links.length);
  });
});

describe('Lahore plan', () => {
  it('writes the SVG plan when LAHORE_PLAN=1', async () => {
    const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env;
    if (!env?.LAHORE_PLAN) return;
    const { planSvg } = await import('../src/zombies/maps/lahore/plan');
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(p: string, d: string): void };
    fs.writeFileSync('docs/maps/lahore-darbar.svg', planSvg(rasterize()));
  });
});
