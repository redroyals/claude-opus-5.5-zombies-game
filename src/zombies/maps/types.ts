// Registry entry types for Zombies maps. Type-only imports keep map defs free of three.js at runtime.
import type * as THREE from 'three';
import type { StaticBatch } from '../../render/geom';
import type { Materials } from '../../render/materials';
import type { CollisionWorld } from '../../world/Collision';
import type { ZombiesMapDef } from '../mapdef';

/** Handed to a map's optional `decorate` hook for bespoke procedural dressing (trees, skylines, FX). */
export interface MapDecorateContext {
  def: ZombiesMapDef;
  /** Scene root of the map (add meshes here). */
  root: THREE.Group;
  M: Materials;
  /** Static batch merged into a few meshes after decorate returns (use for lots of small static boxes). */
  batch: StaticBatch;
  /** Collision world (add colliders for anything solid you build here, then the nav is rebuilt). */
  world: CollisionWorld;
  /** Resolve a MatRef to a shared material. */
  mat: (m: import('../mapdef').MatRef) => THREE.Material;
}

export interface MapUpdateContext { time: number; dt: number; power: boolean; /** Player feet position (for proximity effects, light pools). */ player?: { x: number; y: number; z: number } }

export interface ZombiesMapEntry {
  def: ZombiesMapDef;
  /** Optional procedural dressing, run once when the map is built. */
  decorate?: (ctx: MapDecorateContext) => void;
  /** Optional bespoke material library, built before the geometry; MatSpec `custom` keys resolve here. */
  materials?: () => Record<string, THREE.Material>;
  /** Optional per-frame hook (animated set dressing). Keep it cheap. */
  update?: (ctx: MapUpdateContext) => void;
  /** Loadable via ?map=<id> but not shown on the title screen (examples, test maps). */
  hidden?: boolean;
}
