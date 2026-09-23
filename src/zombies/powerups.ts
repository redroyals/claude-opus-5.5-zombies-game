// Pure power-up rules: drop decisions, the shuffled drop cycle, active timers and pickup lifetimes.
// No three.js / DOM. Deterministic given an rng.

export type PowerUpKind = 'max_ammo' | 'insta_kill' | 'double_points' | 'nuke' | 'carpenter';
export const POWERUP_KINDS: PowerUpKind[] = ['max_ammo', 'insta_kill', 'double_points', 'nuke', 'carpenter'];

export const POWERUP_INFO: Record<PowerUpKind, { name: string; icon: string; color: number; timed: boolean }> = {
  max_ammo: { name: 'MAX AMMO', icon: '▮▮', color: 0x60ff60, timed: false },
  insta_kill: { name: 'INSTA-KILL', icon: '☠', color: 0xff4040, timed: true },
  double_points: { name: 'DOUBLE POINTS', icon: 'x2', color: 0xffd040, timed: true },
  nuke: { name: 'KABOOM', icon: '✺', color: 0xff9020, timed: false },
  carpenter: { name: 'CARPENTER', icon: '⚒', color: 0x60c0ff, timed: false },
};

export const POWERUP = {
  /** Base chance per kill (on top of the points-threshold guarantee). */
  dropChance: 0.02,
  maxDropsPerRound: 4,
  /** A drop is guaranteed each time accumulated kill-points pass the next threshold. */
  firstThreshold: 2000,
  thresholdGrowth: 1.14,
  duration: 30,
  pickupLifetime: 26,
  blinkAt: 8,
  nukePoints: 400,
  carpenterPoints: 200,
} as const;

export interface PowerUpState {
  bag: PowerUpKind[];
  dropsThisRound: number;
  pointsTowardDrop: number;
  nextThreshold: number;
  timers: Partial<Record<PowerUpKind, number>>;
}

export function createPowerUps(): PowerUpState {
  return { bag: [], dropsThisRound: 0, pointsTowardDrop: 0, nextThreshold: POWERUP.firstThreshold, timers: {} };
}

/** Draw the next kind from a shuffled bag so every kind appears once per cycle (the classic cycle). */
export function nextPowerUp(s: PowerUpState, rnd: () => number, exclude: PowerUpKind[] = []): PowerUpKind {
  const refill = () => {
    const b = [...POWERUP_KINDS];
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    s.bag.push(...b);
  };
  if (s.bag.length === 0) refill();
  let idx = s.bag.findIndex((k) => !exclude.includes(k));
  if (idx < 0) { refill(); idx = s.bag.findIndex((k) => !exclude.includes(k)); }
  return s.bag.splice(Math.max(0, idx), 1)[0];
}

/** Called on every zombie kill with the points it earned. Returns a kind if something drops. */
export function rollDrop(s: PowerUpState, killPoints: number, rnd: () => number, exclude: PowerUpKind[] = [],
  opts: { maxPerRound?: number; chanceMult?: number } = {}): PowerUpKind | null {
  if (s.dropsThisRound >= (opts.maxPerRound ?? POWERUP.maxDropsPerRound)) return null;
  s.pointsTowardDrop += killPoints;
  let drop = false;
  if (s.pointsTowardDrop >= s.nextThreshold) {
    s.pointsTowardDrop -= s.nextThreshold;
    s.nextThreshold = Math.round(s.nextThreshold * POWERUP.thresholdGrowth);
    drop = true;
  } else if (rnd() < POWERUP.dropChance * (opts.chanceMult ?? 1)) drop = true;
  if (!drop) return null;
  s.dropsThisRound++;
  return nextPowerUp(s, rnd, exclude);
}

export function onRoundStart(s: PowerUpState): void {
  s.dropsThisRound = 0;
}

/** Activate a collected power-up. Timed ones (re)start at full duration. */
export function activate(s: PowerUpState, k: PowerUpKind): void {
  if (POWERUP_INFO[k].timed) s.timers[k] = POWERUP.duration;
}

/** Tick timers; returns kinds that just expired. */
export function stepPowerUps(s: PowerUpState, dt: number): PowerUpKind[] {
  const out: PowerUpKind[] = [];
  for (const k of Object.keys(s.timers) as PowerUpKind[]) {
    const t = (s.timers[k] ?? 0) - dt;
    if (t <= 0) { delete s.timers[k]; out.push(k); } else s.timers[k] = t;
  }
  return out;
}

export function isActive(s: PowerUpState, k: PowerUpKind): boolean {
  return (s.timers[k] ?? 0) > 0;
}

/** Points multiplier from power-ups. */
export function pointsMult(s: PowerUpState): number {
  return isActive(s, 'double_points') ? 2 : 1;
}

/** Pickup on the floor: visible flag given its age (blinks faster near expiry). */
export function pickupVisible(age: number, time: number): boolean {
  const left = POWERUP.pickupLifetime - age;
  if (left <= 0) return false;
  if (left > POWERUP.blinkAt) return true;
  const rate = left < 3 ? 10 : 4;
  return Math.floor(time * rate) % 2 === 0;
}
