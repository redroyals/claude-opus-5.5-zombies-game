// Async GLB registry. Models are optional: every visual has a procedural fallback, and when a file appears
// later (models are produced separately into public/models/) the registry picks it up and notifies listeners.
// A missing file (404, or the dev server's HTML fallback) resolves to null, never throws.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  skinned: boolean;
}

const BASE = `${import.meta.env.BASE_URL ?? './'}models/`.replace(/\/\/+/g, '/');
const GLB_MAGIC = 0x46546c67; // 'glTF'

class Registry {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<LoadedModel | null>>();
  private jsonCache = new Map<string, Promise<unknown | null>>();
  private watchers = new Map<string, { cbs: ((m: LoadedModel) => void)[]; timer: number; delay: number }>();
  /** Set false to stop polling for files that do not exist yet. */
  poll = true;

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  private async fetchBuffer(path: string): Promise<ArrayBuffer | null> {
    try {
      const res = await fetch(BASE + path, { cache: 'no-cache' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 20) return null;
      const magic = new DataView(buf).getUint32(0, true);
      if (magic === GLB_MAGIC) return buf;
      // Plain .gltf JSON is also accepted; HTML (SPA fallback) is rejected.
      const head = new TextDecoder().decode(buf.slice(0, 64)).trimStart();
      if (head.startsWith('{') && head.includes('"asset"')) return buf;
      return null;
    } catch {
      return null;
    }
  }

  private async parse(path: string): Promise<LoadedModel | null> {
    const buf = await this.fetchBuffer(path);
    if (!buf) return null;
    try {
      const dir = BASE + path.slice(0, path.lastIndexOf('/') + 1);
      const gltf: GLTF = await this.loader.parseAsync(buf, dir);
      let skinned = false;
      gltf.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
      return { scene: gltf.scene, animations: gltf.animations, skinned };
    } catch (e) {
      console.warn('[models] failed to parse', path, e);
      return null;
    }
  }

  /** Load a model by path relative to public/models/ (e.g. 'zombies/mystery_box.glb'). Resolves null if absent. */
  load(path: string): Promise<LoadedModel | null> {
    let p = this.cache.get(path);
    if (!p) {
      p = this.parse(path);
      this.cache.set(path, p);
      // Absent files are retried later (see whenAvailable), so do not cache the miss forever.
      void p.then((m) => { if (!m) this.cache.delete(path); });
    }
    return p;
  }

  /** Independent copy (skeleton-aware) of a loaded model's scene. */
  instance(m: LoadedModel): THREE.Group {
    return (m.skinned ? cloneSkinned(m.scene) : m.scene.clone(true)) as THREE.Group;
  }

  json<T>(path: string): Promise<T | null> {
    let p = this.jsonCache.get(path);
    if (!p) {
      p = fetch(BASE + path, { cache: 'no-cache' })
        .then(async (r) => (r.ok ? await r.json() : null))
        .catch(() => null);
      this.jsonCache.set(path, p);
      void p.then((v) => { if (v === null) this.jsonCache.delete(path); });
    }
    return p as Promise<T | null>;
  }

  /**
   * Calls `cb` once the model exists: immediately if it is already there, otherwise after polling
   * with backoff (15 s → 60 s). This is how procedural placeholders upgrade to GLBs mid-session.
   */
  whenAvailable(path: string, cb: (m: LoadedModel) => void): void {
    const w = this.watchers.get(path);
    if (w) { w.cbs.push(cb); return; }
    const entry = { cbs: [cb], timer: 0, delay: 15000 };
    this.watchers.set(path, entry);
    const attempt = async () => {
      const m = await this.load(path);
      if (m) {
        this.watchers.delete(path);
        for (const f of entry.cbs) { try { f(m); } catch (e) { console.warn('[models] upgrade failed', path, e); } }
        return;
      }
      if (!this.poll) return;
      entry.timer = window.setTimeout(attempt, entry.delay);
      entry.delay = Math.min(60000, entry.delay * 1.6);
    };
    void attempt();
  }
}

export const models = new Registry();

/** Uniformly scale + recentre a model so its bounding box fits `size` (longest axis) with its base at y=0. */
export function fitModel(obj: THREE.Object3D, size: number, opts: { base?: boolean; axis?: 'x' | 'y' | 'z' | 'max' } = {}): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const s = box.getSize(new THREE.Vector3());
  const ref = opts.axis === 'x' ? s.x : opts.axis === 'y' ? s.y : opts.axis === 'z' ? s.z : Math.max(s.x, s.y, s.z);
  if (ref > 1e-6) obj.scale.multiplyScalar(size / ref);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= opts.base === false ? c.y : b2.min.y;
  return b2;
}

/** Find a descendant by exact name, falling back to a case-insensitive prefix match. */
export function findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let exact: THREE.Object3D | null = null;
  let loose: THREE.Object3D | null = null;
  const n = name.toLowerCase();
  root.traverse((o) => {
    if (exact) return;
    if (o.name === name) exact = o;
    else if (!loose && o.name.toLowerCase().startsWith(n)) loose = o;
  });
  return exact ?? loose;
}
