// Lahore Darbar: layout compiler, map-def validation, design invariants (loops, routes, pacing), the egg, and the
// respect rules from docs/maps/lahore-darbar.md §0.
import { describe, expect, it } from 'vitest';
import { createEggRun, eggCollect, eggInteract, eggKill } from '../src/zombies/egg';
import { topologyOf, zoneAt } from '../src/zombies/mapdef';
import { MAPS } from '../src/zombies/maps';
import { LAHORE } from '../src/zombies/maps/lahore/def';
import { AREAS, DOORS, Z } from '../src/zombies/maps/lahore/layout';
import { rasterize, zoneAtRaster } from '../src/zombies/maps/lahore/raster';
import { validateMapDef } from '../src/zombies/validate';
import decorateSrc from '../src/zombies/maps/lahore/decorate.ts?raw';
import defSrc from '../src/zombies/maps/lahore/def.ts?raw';
import layoutSrc from '../src/zombies/maps/lahore/layout.ts?raw';
import assetsSrc from '../scripts/lahore-assets.mjs?raw';
import reuseSrc from '../scripts/lahore-reuse.mjs?raw';

const R = rasterize();
const topo = topologyOf(LAHORE);

/** Zones reachable from the start using only the given doors. */
function reach(doors: { a: number; b: number }[], start = LAHORE.startZone): Set<number> {
  const s = new Set([start]);
  for (let grew = true; grew;) {
    grew = false;
    for (const d of doors) {
      if (s.has(d.a) && !s.has(d.b)) { s.add(d.b); grew = true; }
      if (s.has(d.b) && !s.has(d.a)) { s.add(d.a); grew = true; }
    }
  }
  return s;
}

describe('Lahore Darbar raster', () => {
  it('compiles without layout problems', () => {
    expect(R.problems, R.problems.slice(0, 20).join('\n')).toEqual([]);
  });
  it('produces a closed, merged shell', () => {
    expect(R.masses.length).toBeGreaterThan(100);
    expect(R.walls.length).toBeGreaterThan(50);
    expect(R.walls.every((w) => w.a1 > w.a0 && w.y1 > w.y0)).toBe(true);
    // Every door sits on a generated wall of the right height (checked inside rasterize, surfaced as problems).
    expect(R.problems.filter((p) => p.startsWith('door'))).toEqual([]);
  });
  it('the raster zone query agrees with the map-def zone query on every area centre', () => {
    for (const a of AREAS.filter((q) => !q.mass && !q.stair)) {
      const [x0, z0, x1, z1] = a.rects[0];
      const x = (x0 + x1) / 2 + 0.25, z = (z0 + z1) / 2 + 0.25;
      if (zoneAtRaster(R, x, a.floor, z) !== a.zone) continue; // overridden by a later area (plinths in courts)
      expect(zoneAt(LAHORE, x, z, a.floor + 0.1), a.id).toBe(a.zone);
    }
  });
});

describe('Lahore Darbar map def', () => {
  const v = validateMapDef(LAHORE);
  it('is registered and validates with no errors', () => {
    expect(MAPS.some((m) => m.def.id === 'lahore-darbar')).toBe(true);
    expect(v.errors, v.errors.map((e) => e.msg).join('; ')).toEqual([]);
    expect(v.issues.filter((i) => i.severity === 'warn').map((i) => i.code)).toEqual([]);
  });
  it('has 14 zones, 18 doors and a spawn source in every zone', () => {
    expect(LAHORE.zones.length).toBe(14);
    expect(LAHORE.doors.length).toBe(18);
    for (const zn of LAHORE.zones) {
      const n = LAHORE.windows.filter((w) => w.zone === zn.id).length + (LAHORE.spawnPoints ?? []).filter((s) => s.zone === zn.id).length;
      expect(n, zn.name).toBeGreaterThan(0);
    }
    LAHORE.windows.forEach((w, i) => expect(w.id).toBe(i));
  });
  it('is multi-level: basement, ground, plinths, upper and roofs', () => {
    const floors = new Set(LAHORE.rooms.map((r) => Math.round(r.floor * 10) / 10));
    for (const y of [0, 3, 4.2, 7.2, 8.4, 10.2]) expect(floors.has(y), `floor ${y}`).toBe(true);
    expect(LAHORE.ladders?.length).toBeGreaterThan(0);
    expect(LAHORE.links?.some((l) => l.kind === 'jump' && l.twoWay)).toBe(true);
    expect(LAHORE.links?.filter((l) => l.kind === 'drop').length).toBeGreaterThan(10);
  });
});

describe('Lahore Darbar design invariants', () => {
  it('every zone can be unlocked from the Hazuri Bagh', () => {
    expect(reach(topo.doors).size).toBe(14);
  });
  it('dead ends are deliberate: only the armoury (Pack-a-Punch), the Sheesh Mahal (perk) and the ramparts (drop exit)', () => {
    const degree = new Map<number, number>();
    for (const d of topo.doors) for (const z of [d.a, d.b]) degree.set(z, (degree.get(z) ?? 0) + 1);
    const dead = [...degree].filter(([, n]) => n === 1).map(([z]) => z).sort((a, b) => a - b);
    expect(dead).toEqual([Z.sheesh, Z.ramparts, Z.armoury].sort((a, b) => a - b));
  });
  it('offers alternative routes: each half has two ways in, and the basement tunnel joins them', () => {
    const without = (...ids: string[]) => reach(topo.doors.filter((d) => !ids.includes(d.id)));
    expect(without('bagh_roshnai').has(Z.kucha)).toBe(true); // haveli via the basement tunnel
    expect(without('topkhana_hathipol').has(Z.burj)).toBe(true); // upper court via the Diwan-e-Khas stair
    expect(without('aam_khas').has(Z.burj)).toBe(true); // ...or via the Hathi Pol
    expect(without('roshnai_kucha_n', 'roshnai_kucha_s').has(Z.kucha)).toBe(true); // lanes via the Wazir haveli
    expect(without('kucha_naqqar').has(Z.naqqar)).toBe(true); // Naqqar Khana via the rooftops
  });
  it('power is deep in the haveli maze and Pack-a-Punch is back in the court', () => {
    expect(zoneAt(LAHORE, LAHORE.power!.x, LAHORE.power!.z, LAHORE.power!.y ?? 0)).toBe(Z.naqqar);
    expect(zoneAt(LAHORE, LAHORE.pap!.x, LAHORE.pap!.z, LAHORE.pap!.y ?? 0)).toBe(Z.armoury);
    // Shortest door path from the start to the power room is at least 3 doors.
    const depth = (target: number) => {
      const dist = new Map([[LAHORE.startZone, 0]]);
      const q = [LAHORE.startZone];
      while (q.length) { const z = q.shift()!; for (const d of topo.doors) { const o = d.a === z ? d.b : d.b === z ? d.a : -1; if (o >= 0 && !dist.has(o)) { dist.set(o, dist.get(z)! + 1); q.push(o); } } }
      return dist.get(target)!;
    };
    expect(depth(Z.naqqar)).toBeGreaterThanOrEqual(3);
  });
  it('spreads machines across both halves and several levels', () => {
    const perkZones = Object.values(LAHORE.perks).map((s) => zoneAt(LAHORE, s!.x, s!.z, s!.y ?? 0));
    expect(new Set(perkZones)).toEqual(new Set([Z.bagh, Z.aam, Z.wazir, Z.sheesh]));
    const boxZones = LAHORE.box.spots.map((s) => zoneAt(LAHORE, s.x, s.z, s.y ?? 0));
    expect(new Set(boxZones).size).toBe(LAHORE.box.spots.length);
    expect(new Set(LAHORE.box.spots.map((s) => s.y)).size).toBeGreaterThanOrEqual(4);
    expect(LAHORE.wallBuys.length).toBeGreaterThanOrEqual(12);
  });
  it('doors and costs rise from the start outward', () => {
    const first = DOORS.filter((d) => d.a === Z.bagh || d.b === Z.bagh).map((d) => d.cost);
    expect(Math.max(...first)).toBeLessThanOrEqual(1250);
    expect(DOORS.find((d) => d.id === 'tehkhana_vault')!.cost).toBe(Math.max(...DOORS.map((d) => d.cost)));
  });
});

describe('Lahore Darbar easter egg', () => {
  it('runs start to finish across both halves', () => {
    const egg = LAHORE.egg!;
    const run = createEggRun(egg);
    expect(eggInteract(egg, run, 0, false)).toBe('power'); // the mirrors need the power
    egg.steps[0].kind === 'interact' && egg.steps[0].objects.forEach((_, i) => eggInteract(egg, run, i, true));
    expect(run.step).toBe(1);
    egg.steps[1].kind === 'collect' && egg.steps[1].objects.forEach((_, i) => eggCollect(egg, run, i, true));
    expect(run.step).toBe(2);
    for (let i = 0; i < 24; i++) eggKill(egg, run, Z.naqqar, true);
    expect(run.step).toBe(3);
    expect(eggInteract(egg, run, 0, true)).toBe('step');
    let last = '';
    for (let i = 0; i < 30; i++) last = eggKill(egg, run, Z.tosha, true);
    expect(last).toBe('complete');
    expect(egg.reward.allPerks).toBe(true);
  });
  it('places egg objects in the court and the haveli', () => {
    const objs = LAHORE.egg!.steps.flatMap((s) => (s.kind === 'kill' ? [] : s.objects));
    const zones = new Set(objs.map((o) => zoneAt(LAHORE, o.x, o.z, o.y - 0.4)));
    for (const z of [Z.sheesh, Z.tehkhana, Z.kothay, Z.wazir, Z.tosha]) expect(zones.has(z), `zone ${z}`).toBe(true);
  });
});

describe('Lahore Darbar respect rules', () => {
  const sources = [decorateSrc, defSrc, layoutSrc, assetsSrc, reuseSrc].join('\n');
  it('never uses sikhi.io relics, the Khalsa flag or figure models', () => {
    expect(sources).not.toMatch(/\/relics\//);
    expect(sources).not.toMatch(/flag-khalsa['"]:|reuse\/flag-khalsa|'flag-khalsa'/);
    expect(sources).not.toMatch(/seated|figure\.glb/i);
  });
  it('depicts no religious sites, scripture or named people', () => {
    for (const bad of [/gurdwara/i, /granth/i, /\bguru\b/i, /mosque|temple|masjid|mandir/i]) {
      const hits = sources.split('\n').filter((l) => bad.test(l) && !/respect|never|no gurdwaras|not use|avoid/i.test(l));
      expect(hits, String(bad)).toEqual([]);
    }
    // The Maharaja appears only as the name on his state standard (a flag model), never as a figure.
    expect(sources.split('\n').filter((l) => /ranjit/i.test(l) && !/flag|standard/i.test(l))).toEqual([]);
  });
  it('the zombie roster is the generic one (no map-specific enemy models)', () => {
    expect(assetsSrc).not.toMatch(/cat: 'zombies'/);
    expect(JSON.stringify(LAHORE)).not.toMatch(/z_[a-z]+\.glb/);
  });
});

describe('Lahore Darbar plan', () => {
  it('writes the SVG plan when LAHORE_PLAN=1', async () => {
    const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env;
    if (!env?.LAHORE_PLAN) return;
    const { planSvg } = await import('../src/zombies/maps/lahore/plan');
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(p: string, d: string): void };
    fs.writeFileSync('docs/maps/lahore-darbar.svg', planSvg(R));
  });
});
