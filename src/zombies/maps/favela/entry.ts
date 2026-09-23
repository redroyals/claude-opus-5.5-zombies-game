// Registry entry for Rio · Ridgelight: the def, its procedural surface library and the decorate hooks.
import type { ZombiesMapEntry } from '../types';
import { FAVELA } from './def';
import { decorateFavela, updateFavela } from './decorate';
import { favelaMaterialLibrary } from './materials';

export const FAVELA_ENTRY: ZombiesMapEntry = { def: FAVELA, materials: favelaMaterialLibrary, decorate: decorateFavela, update: updateFavela };
