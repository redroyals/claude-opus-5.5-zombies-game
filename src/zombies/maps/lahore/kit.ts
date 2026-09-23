// Kit placement for the Lahore Darbar: every static GLB placement (Blender kit + Meshy props) and every procedural
// moulding is baked into world space and merged per material / detail tier / cell by ./merge (one draw per
// material per visible cell, one shadow proxy per cell).
import * as THREE from 'three';
import { models, type LoadedModel } from '../../../render/ModelRegistry';
import type { Surf } from './layout';
import { kitSlot, type LahoreMaterials } from './materials';
import { ChunkMerger, type Tier } from './merge';

export interface KitOpts {
  stone?: Surf; trim?: Surf;
  /** Meshy props: cap metalness (Meshy ships metallic 1) and optionally brighten. */
  matte?: boolean; bright?: number;
  /** Merge into the cell's shadow proxy. */
  cast?: boolean;
  tier?: Tier;
}
interface Placement { m: THREE.Matrix4; o: KitOpts }

const placements = new Map<string, Placement[]>();
let merger: ChunkMerger | null = null;
let LM: LahoreMaterials;
const matteCache = new Map<string, THREE.Material>();

export function kitBegin(M: LahoreMaterials): ChunkMerger {
  LM = M;
  placements.clear();
  matteCache.clear();
  merger = new ChunkMerger((m) => { const l = M.layerOf(m); return l === undefined ? null : { mat: M.arch, layer: l }; });
  return merger;
}
export const kitMerger = (): ChunkMerger => merger!;

export const HP = Math.PI / 2;
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
export function mat4(x: number, y: number, z: number, yaw = 0, scale: number | [number, number, number] = 1): THREE.Matrix4 {
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromAxisAngle(_up, yaw).clone(), new THREE.Vector3(s[0], s[1], s[2]));
}

/** Place a GLB (path under /models) at a transform. */
export function put(path: string, x: number, y: number, z: number, yaw = 0, scale: number | [number, number, number] = 1, o: KitOpts = {}): void {
  putM(path, mat4(x, y, z, yaw, scale), o);
}
export function putM(path: string, m: THREE.Matrix4, o: KitOpts = {}): void {
  let arr = placements.get(path);
  if (!arr) placements.set(path, (arr = []));
  arr.push({ m, o });
}

function resolve(mat: THREE.Material, o: KitOpts): THREE.Material {
  const slot = kitSlot(LM, mat.name, o.stone, o.trim);
  if (slot) return slot;
  if (o.matte && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const key = `${mat.uuid}|${o.bright ?? 1}`;
    let m = matteCache.get(key);
    if (!m) {
      const c = (mat as THREE.MeshStandardMaterial).clone();
      if (!c.metalnessMap) c.metalness = Math.min(c.metalness, 0.15);
      else c.metalness = Math.min(c.metalness, 0.6);
      if (o.bright) c.color.multiplyScalar(o.bright);
      matteCache.set(key, (m = c));
    }
    return m;
  }
  return mat;
}

/** The props atlas: every static Meshy/reused prop in one file sharing one material (scripts/lahore-atlas.mjs). */
export const ATLAS = 'lahore/props_atlas.glb';
export const atlasProp = (id: string) => `${ATLAS}#${id}`;

/** Load every placed model, bake the placements into the merger and build it. Resolves when built.
 *  `before` runs after every model has loaded and before the merge is built (the engine's own static geometry
 *  is folded in there, see decorate). */
export async function kitFlush(parent: THREE.Object3D, before?: () => void): Promise<void> {
  const tmp = new THREE.Matrix4();
  await Promise.all([...placements.entries()].map(async ([key, list]) => {
    // 'file.glb#node' places one named node of a multi-prop file (the props atlas); its material is shared as is.
    const [path, nodeName] = key.split('#');
    const lm: LoadedModel | null = await models.load(path);
    if (!lm) return;
    lm.scene.updateMatrixWorld(true);
    const src = nodeName ? lm.scene.getObjectByName(nodeName) : lm.scene;
    if (!src) { console.warn('[lahore] missing atlas prop', key); return; }
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (nodeName) {
        for (const p of list) merger!.addPlaced(mesh.material as THREE.Material, mesh.geometry, tmp.multiplyMatrices(p.m, mesh.matrixWorld), { tier: p.o.tier, cast: p.o.cast });
        return;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = Array.isArray(mesh.material) && mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      for (const g of groups) {
        const sub = groups.length > 1 ? subGeometry(mesh.geometry, g.start, g.count) : mesh.geometry;
        for (const p of list) {
          merger!.addPlaced(resolve(mats[g.materialIndex ?? 0], p.o), sub, tmp.multiplyMatrices(p.m, mesh.matrixWorld), { tier: p.o.tier, cast: p.o.cast });
        }
      }
    });
  }));
  if (import.meta.env?.DEV) {
    const rows = [...placements.entries()].map(([k, l]) => `${k.replace(/^lahore\/(kit_)?/, '')}:${l.length}`);
    console.info('[lahore] placements', rows.join(' '));
  }
  placements.clear();
  before?.();
  merger!.build(parent);
}

function subGeometry(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = g.clone();
  if (out.index) {
    const end = Math.min(out.index.count, start + count);
    out.setIndex(Array.from(out.index.array as ArrayLike<number>).slice(start, end));
  }
  out.clearGroups();
  return out;
}
