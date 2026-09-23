// Pure game-over summary for Zombies (formatting only).
export interface ZRunStats { round: number; kills: number; headshots: number; points: number; doors: number; time: number; downs: number; builds?: number }

export function survivedTitle(round: number): string {
  const n = Math.max(0, round);
  return `YOU SURVIVED ${n} ROUND${n === 1 ? '' : 'S'}`;
}

export function fmtTime(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}

export function summaryCells(s: ZRunStats): [string, string][] {
  return [
    ['ROUNDS', String(s.round)],
    ['KILLS', String(s.kills)],
    ['HEADSHOTS', String(s.headshots)],
    ['POINTS EARNED', s.points.toLocaleString('en-US')],
    ['DOORS OPENED', String(s.doors)],
    ['TIME', fmtTime(s.time)],
  ];
}
