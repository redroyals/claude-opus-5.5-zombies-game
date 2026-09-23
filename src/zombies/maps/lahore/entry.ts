// Registry entry for the Lahore Darbar map: the def, its bespoke material library and the decorate hooks.
import type * as THREE from 'three';
import type { ZombiesMapEntry } from '../types';
import { LAHORE } from './def';
import { lahoreMaterials } from './materials';
import { decorateLahore, updateLahore } from './decorate';

export const LAHORE_ENTRY: ZombiesMapEntry = {
  def: LAHORE,
  materials: () => {
    const M = lahoreMaterials();
    const out: Record<string, THREE.Material> = {};
    for (const [k, m] of Object.entries(M.surf)) out[`lh:${k}`] = m;
    return out;
  },
  decorate: decorateLahore,
  update: updateLahore,
};
