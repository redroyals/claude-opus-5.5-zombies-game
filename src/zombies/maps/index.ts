// Zombies map registry. Adding a map is one import + one line in MAPS.
import { EXAMPLE_HOUSE } from './_example/def';
import { NIGHTFALL } from './nightfall/def';
import { decorateNightfall } from './nightfall/decorate';
import type { ZombiesMapEntry } from './types';

export type { ZombiesMapEntry } from './types';

export const MAPS: ZombiesMapEntry[] = [
  { def: NIGHTFALL, decorate: decorateNightfall },
  { def: EXAMPLE_HOUSE, hidden: true },
];

export const DEFAULT_MAP_ID = NIGHTFALL.id;

export function getMap(id: string | null | undefined): ZombiesMapEntry {
  return MAPS.find((m) => m.def.id === id) ?? MAPS.find((m) => m.def.id === DEFAULT_MAP_ID)!;
}

/** Map id requested by the URL (?map=<id>), if it is registered. */
export function mapFromUrl(search: string): string | null {
  const id = new URLSearchParams(search).get('map');
  return id && MAPS.some((m) => m.def.id === id) ? id : null;
}
