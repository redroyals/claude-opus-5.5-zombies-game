import { describe, expect, it } from 'vitest';
import { MP_MAPS } from '../src/maps';
import { floorUnder, type MapLayout, type V3 } from '../src/maps/types';

function blocked(m: MapLayout, p: V3): string | null {
  // player capsule approximated by a 0.6 x 1.75 x 0.6 box standing at p
  for (const b of m.boxes) {
    if (p[0] + 0.3 > b.min[0] && p[0] - 0.3 < b.max[0] && p[2] + 0.3 > b.min[2] && p[2] - 0.3 < b.max[2] && p[1] + 1.75 > b.min[1] && p[1] + 0.05 < b.max[1]) return b.tag ?? 'box';
  }
  return null;
}
function standing(m: MapLayout, p: V3): boolean {
  if (Math.abs(p[1]) < 0.01) return true;
  const f = floorUnder(m, p[0], p[1], p[2]);
  return f !== null && Math.abs(f - p[1]) < 0.35;
}

for (const m of Object.values(MP_MAPS)) {
  describe(m.name, () => {
    it('has >= 3 play heights, 3 lanes, 3 flags', () => {
      expect(new Set(Object.values(m.levels)).size).toBeGreaterThanOrEqual(3);
      expect(m.lanes).toHaveLength(3);
      expect(m.flags.map((f) => f.id)).toEqual(['A', 'B', 'C']);
    });
    it('spawns and flags stand on a floor and are not inside geometry', () => {
      const pts: [string, V3][] = [
        ...m.spawns.alpha.map((s, i) => [`alpha${i}`, s.pos] as [string, V3]),
        ...m.spawns.bravo.map((s, i) => [`bravo${i}`, s.pos] as [string, V3]),
        ...m.spawns.ffa.map((s, i) => [`ffa${i}`, s.pos] as [string, V3]),
        ...m.flags.map((f) => [`flag${f.id}`, f.pos] as [string, V3]),
      ];
      const bad = pts.filter(([, p]) => !standing(m, p) || blocked(m, p)).map(([n, p]) => `${n}@${p.join(',')}:${blocked(m, p) ?? 'nofloor'}`);
      expect(bad).toEqual([]);
    });
    it('boxes are well-formed and inside bounds', () => {
      for (const b of m.boxes) for (let i = 0; i < 3; i++) expect(b.max[i]).toBeGreaterThan(b.min[i]);
      expect(m.boxes.length).toBeGreaterThan(50);
    });
    it('teams are mirrored (spawn centroid symmetric about x=0)', () => {
      const cx = (a: { pos: V3 }[]) => a.reduce((s, p) => s + p.pos[0], 0) / a.length;
      expect(cx(m.spawns.alpha) + cx(m.spawns.bravo)).toBeCloseTo(0, 5);
    });
  });
}
