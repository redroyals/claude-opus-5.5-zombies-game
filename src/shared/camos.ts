// Camo challenge ladders and mastery rules. Pure; the server evaluates, the client renders.
//   base ladder (per weapon) -> Gilded (weapon) -> Argent (weapon mastery challenges)
//   -> Prism (every weapon in the class is Argent) -> Void Matter (every class Prism).
import { WEAPON_LIST, type WeaponClass } from '../data/weapons';

export type CamoStat = 'kills' | 'headshots' | 'longshots' | 'hipKills' | 'doubleKills' | 'noDeathTriples' | 'adsKills' | 'pointBlank';
export interface WeaponProgress { kills: number; headshots: number; longshots: number; hipKills: number; doubleKills: number; noDeathTriples: number; adsKills: number; pointBlank: number }
export const EMPTY_PROGRESS: WeaponProgress = { kills: 0, headshots: 0, longshots: 0, hipKills: 0, doubleKills: 0, noDeathTriples: 0, adsKills: 0, pointBlank: 0 };

export interface CamoDef { id: string; name: string; stat?: CamoStat; count?: number; pattern: CamoPattern; tier: 'base' | 'gilded' | 'argent' | 'prism' | 'void' }
export type CamoPattern = 'woodland' | 'digital' | 'tiger' | 'hex' | 'splinter' | 'topo' | 'glacier' | 'ember' | 'gold' | 'chrome' | 'prism' | 'void';

/** Longshot distance threshold by class (m). */
export const LONGSHOT_M: Record<WeaponClass, number> = { ar: 40, smg: 25, lmg: 40, shotgun: 12, marksman: 55, sniper: 70, pistol: 20, launcher: 40, special: 15 };
export const POINT_BLANK_M = 4;

export const BASE_CAMOS: CamoDef[] = [
  { id: 'woodland', name: 'Canopy', stat: 'kills', count: 25, pattern: 'woodland', tier: 'base' },
  { id: 'digital', name: 'Pixel Drift', stat: 'kills', count: 75, pattern: 'digital', tier: 'base' },
  { id: 'tiger', name: 'Reed Stripe', stat: 'headshots', count: 25, pattern: 'tiger', tier: 'base' },
  { id: 'hex', name: 'Honeycomb', stat: 'headshots', count: 60, pattern: 'hex', tier: 'base' },
  { id: 'splinter', name: 'Shatterline', stat: 'longshots', count: 15, pattern: 'splinter', tier: 'base' },
  { id: 'topo', name: 'Contour', stat: 'hipKills', count: 30, pattern: 'topo', tier: 'base' },
  { id: 'glacier', name: 'Glacier', stat: 'doubleKills', count: 10, pattern: 'glacier', tier: 'base' },
  { id: 'ember', name: 'Emberline', stat: 'kills', count: 150, pattern: 'ember', tier: 'base' },
];
export const GILDED: CamoDef = { id: 'gilded', name: 'Gilded', pattern: 'gold', tier: 'gilded' };
export const ARGENT: CamoDef = { id: 'argent', name: 'Argent', pattern: 'chrome', tier: 'argent' };
export const PRISM: CamoDef = { id: 'prism', name: 'Prism', pattern: 'prism', tier: 'prism' };
export const VOID: CamoDef = { id: 'void', name: 'Void Matter', pattern: 'void', tier: 'void' };
/** Weapon mastery challenges required for Argent (after Gilded). */
export const ARGENT_REQ: Partial<WeaponProgress> = { noDeathTriples: 10, pointBlank: 20, adsKills: 100 };
export const ALL_CAMOS: CamoDef[] = [...BASE_CAMOS, GILDED, ARGENT, PRISM, VOID];
export const CAMO_BY_ID: Record<string, CamoDef> = Object.fromEntries(ALL_CAMOS.map((c) => [c.id, c]));

const meets = (p: WeaponProgress, req: Partial<WeaponProgress>) => (Object.entries(req) as [CamoStat, number][]).every(([k, v]) => p[k] >= v);

/** Classes that count toward Void Matter (special/launcher excluded, as in the genre). */
export const MASTERY_CLASSES: WeaponClass[] = ['ar', 'smg', 'lmg', 'shotgun', 'marksman', 'sniper', 'pistol'];

export function computeCamos(progress: Record<string, WeaponProgress>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const gilded = new Set<string>(), argent = new Set<string>();
  for (const w of WEAPON_LIST) {
    const p = progress[w.id] ?? EMPTY_PROGRESS;
    const list = BASE_CAMOS.filter((c) => p[c.stat!] >= c.count!).map((c) => c.id);
    if (list.length === BASE_CAMOS.length) { list.push(GILDED.id); gilded.add(w.id); if (meets(p, ARGENT_REQ)) { list.push(ARGENT.id); argent.add(w.id); } }
    out[w.id] = list;
  }
  const prismClasses = new Set<WeaponClass>();
  for (const cls of new Set(WEAPON_LIST.map((w) => w.cls))) {
    const ws = WEAPON_LIST.filter((w) => w.cls === cls);
    if (ws.every((w) => argent.has(w.id))) { prismClasses.add(cls); ws.forEach((w) => out[w.id].push(PRISM.id)); }
  }
  if (MASTERY_CLASSES.every((c) => prismClasses.has(c))) for (const w of WEAPON_LIST) if (MASTERY_CLASSES.includes(w.cls)) out[w.id].push(VOID.id);
  return out;
}

/** Add one kill's worth of stats to a weapon progress record (server calls this per kill). */
export function recordKill(p: WeaponProgress, k: { cls: WeaponClass; dist: number; head: boolean; ads: boolean; double: boolean; streakNoDeath: number }): WeaponProgress {
  return {
    kills: p.kills + 1,
    headshots: p.headshots + (k.head ? 1 : 0),
    longshots: p.longshots + (k.dist >= LONGSHOT_M[k.cls] ? 1 : 0),
    hipKills: p.hipKills + (k.ads ? 0 : 1),
    adsKills: p.adsKills + (k.ads ? 1 : 0),
    doubleKills: p.doubleKills + (k.double ? 1 : 0),
    noDeathTriples: p.noDeathTriples + (k.streakNoDeath > 0 && k.streakNoDeath % 3 === 0 ? 1 : 0),
    pointBlank: p.pointBlank + (k.dist <= POINT_BLANK_M ? 1 : 0),
  };
}
