// Pure easter-egg step machine driven by a map's EggDef. No three.js / DOM.
// Steps run in order; each step is interact-with-objects, kill-in-zone or collect-items.
import type { EggDef, EggObjectDef, EggStepDef } from './mapdef';

export interface EggRun {
  step: number;
  /** Per-object completion for the current interact/collect step. */
  done: boolean[];
  kills: number;
  complete: boolean;
}

export type EggEvent = 'none' | 'progress' | 'step' | 'complete' | 'wrong-order' | 'power';

export function createEggRun(def: EggDef | undefined): EggRun {
  const run: EggRun = { step: 0, done: [], kills: 0, complete: !def || def.steps.length === 0 };
  if (def && def.steps.length) resetStep(def, run);
  return run;
}

function resetStep(def: EggDef, run: EggRun): void {
  const s = def.steps[run.step];
  run.done = s && s.kind !== 'kill' ? s.objects.map(() => false) : [];
  run.kills = 0;
}

export function currentStep(def: EggDef | undefined, run: EggRun): EggStepDef | null {
  if (!def || run.complete) return null;
  return def.steps[run.step] ?? null;
}

/** Objects of the current step that are still to be used (index, def). */
export function pendingObjects(def: EggDef | undefined, run: EggRun): { i: number; o: EggObjectDef; kind: 'interact' | 'collect' }[] {
  const s = currentStep(def, run);
  if (!s || s.kind === 'kill') return [];
  return s.objects.map((o, i) => ({ i, o, kind: s.kind })).filter((e) => !run.done[e.i]);
}

function advance(def: EggDef, run: EggRun): EggEvent {
  run.step++;
  if (run.step >= def.steps.length) { run.complete = true; run.done = []; return 'complete'; }
  resetStep(def, run);
  return 'step';
}

function useObject(def: EggDef, run: EggRun, kind: 'interact' | 'collect', i: number, power: boolean): EggEvent {
  const s = currentStep(def, run);
  if (!s || s.kind !== kind) return 'none';
  if (i < 0 || i >= s.objects.length || run.done[i]) return 'none';
  if (s.requiresPower && !power) return 'power';
  if (s.kind === 'interact' && s.ordered && run.done.findIndex((d) => !d) !== i) {
    // Wrong order resets the sequence.
    run.done = run.done.map(() => false);
    return 'wrong-order';
  }
  run.done[i] = true;
  if (run.done.every(Boolean)) return advance(def, run);
  return 'progress';
}

export function eggInteract(def: EggDef | undefined, run: EggRun, i: number, power = true): EggEvent {
  return def ? useObject(def, run, 'interact', i, power) : 'none';
}

export function eggCollect(def: EggDef | undefined, run: EggRun, i: number, power = true): EggEvent {
  return def ? useObject(def, run, 'collect', i, power) : 'none';
}

/** Report a zombie kill in `zone`. */
export function eggKill(def: EggDef | undefined, run: EggRun, zone: number, power = true): EggEvent {
  const s = currentStep(def, run);
  if (!def || !s || s.kind !== 'kill' || s.zone !== zone) return 'none';
  if (s.requiresPower && !power) return 'none';
  run.kills++;
  if (run.kills >= s.count) return advance(def, run);
  return 'progress';
}

/** (done, total) of the current step for HUD text. */
export function stepProgress(def: EggDef | undefined, run: EggRun): [number, number] {
  const s = currentStep(def, run);
  if (!s) return [0, 0];
  if (s.kind === 'kill') return [run.kills, s.count];
  return [run.done.filter(Boolean).length, s.objects.length];
}
