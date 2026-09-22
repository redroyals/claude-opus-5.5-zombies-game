// Mode rules. Pure; the MatchRoom drives them.
export type ModeId = 'tdm' | 'ffa' | 'dom' | 'kc';

export interface ModeDef { id: ModeId; name: string; teams: boolean; maxPlayers: number; scoreLimit: number; timeLimitSec: number; desc: string }
export const MODES: Record<ModeId, ModeDef> = {
  tdm: { id: 'tdm', name: 'Team Deathmatch', teams: true, maxPlayers: 12, scoreLimit: 75, timeLimitSec: 600, desc: '6v6. First team to 75 kills.' },
  ffa: { id: 'ffa', name: 'Free-for-all', teams: false, maxPlayers: 8, scoreLimit: 30, timeLimitSec: 600, desc: 'Everyone for themselves. First to 30.' },
  dom: { id: 'dom', name: 'Domination', teams: true, maxPlayers: 12, scoreLimit: 200, timeLimitSec: 600, desc: 'Hold flags A, B, C. 1 point per flag every 5s.' },
  kc: { id: 'kc', name: 'Kill Confirmed', teams: true, maxPlayers: 12, scoreLimit: 65, timeLimitSec: 600, desc: 'Collect enemy tags to score; deny theirs.' },
};
export const MODE_IDS = Object.keys(MODES) as ModeId[];

/** Team with fewer players (ties -> lower score). */
export function pickTeam(counts: [number, number], scores: [number, number]): 0 | 1 {
  if (counts[0] !== counts[1]) return counts[0] < counts[1] ? 0 : 1;
  return scores[0] <= scores[1] ? 0 : 1;
}

/** Domination flag capture: returns new owner and progress (-1..1; + = team 0) after dt. */
export function stepFlag(progress: number, t0: number, t1: number, dt: number): number {
  if (t0 > 0 && t1 > 0) return progress; // contested
  const rate = 0.25 * Math.min(3, Math.max(t0, t1)); // 4s solo, faster with more
  if (t0 > 0) return Math.min(1, progress + rate * dt);
  if (t1 > 0) return Math.max(-1, progress - rate * dt);
  return progress;
}
export const flagOwner = (p: number): -1 | 0 | 1 => (p >= 1 ? 0 : p <= -1 ? 1 : -1);

/** Pick the spawn furthest from living enemies (and not on top of anyone). */
export function chooseSpawn<S extends { x: number; z: number; team: number }>(spawns: S[], team: number, enemies: { x: number; z: number }[], teams: boolean, rnd: () => number): S {
  const pool = teams ? spawns.filter((s) => s.team === team || s.team === -1) : spawns;
  let best = pool[0], bestScore = -Infinity;
  for (const s of pool) {
    let near = Infinity;
    for (const e of enemies) near = Math.min(near, Math.hypot(e.x - s.x, e.z - s.z));
    const score = (enemies.length ? Math.min(near, 60) : 0) + (s.team === team ? 10 : 0) + rnd() * 6;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}
