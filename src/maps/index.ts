import { KOWLOON } from './kowloon';
import { LISBON } from './lisbon';
import { RIO } from './rio';
import type { MapLayout } from './types';
export const MP_MAPS: Record<string, MapLayout> = { kowloon: KOWLOON, lisbon: LISBON, rio: RIO };
export type { MapLayout } from './types';
