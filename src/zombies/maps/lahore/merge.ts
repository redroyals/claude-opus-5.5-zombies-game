// Spatially chunked static merging for the Lahore Darbar dressing, plus merged shadow proxies.
//
// Every static piece of dressing (procedural mouldings and every Blender kit instance) is baked into world space
// and merged into one mesh per (material, detail tier, 28 m cell). A wide view then costs one draw per material per
// visible cell instead of one per kit primitive per cell, and the cells still frustum-cull.
//
// Shadows: colour meshes never cast. Instead every caster in a cell is merged (positions only) into a single
// depth-only proxy per cell, so the sun's shadow pass is one draw per cell. Proxies must not appear in the colour
// pass, so they live in a group that is hidden while three.js builds the render list and revealed (by a LOD-typed
// trigger visited right after it) before the shadow pass, then hidden again by the map's per-frame update.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Cell sizes per tier: fine detail in small cells (tight distance culling), big forms in large ones (fewer draws). */
export const CELL = 48;
export const NEAR_CELL = 24;
/** Shadow proxies use coarser cells: the shadow pass is vertex-bound, not fill-bound. */
export const SHADOW_CELL = 48;
/** Detail tiers: `near` (fine trims, small props) hides beyond NEAR_FAR metres; `far` always draws. */
export type Tier = 'far' | 'near';
export const NEAR_FAR = 44;

interface Group { mat: THREE.Material; tier: Tier; cell: string; geos: THREE.BufferGeometry[]; verts: number }
const cellKey = (x: number, z: number, tier: Tier = 'far') => { const c = tier === 'near' ? NEAR_CELL : CELL; return `${Math.floor(x / c)},${Math.floor(z / c)}`; };
const shadowKey = (x: number, z: number) => `${Math.floor(x / SHADOW_CELL)},${Math.floor(z / SHADOW_CELL)}`;

/** Float32 position/normal/uv copy of any geometry (GLTF quantized attributes are normalised ints). */
export function floatGeo(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const copy = (name: string, size: number) => {
    const a = src.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) return;
    const out = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) {
      out[i * size] = a.getX(i);
      if (size > 1) out[i * size + 1] = a.getY(i);
      if (size > 2) out[i * size + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  };
  copy('position', 3); copy('normal', 3); copy('uv', 2);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>));
  else g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
  return g;
}

/** Maps a fixed-layer material to the shared per-vertex-layer material (texture-array architecture). */
export type ArchResolver = (m: THREE.Material) => { mat: THREE.Material; layer: number } | null;

export class ChunkMerger {
  private groups = new Map<string, Group>();
  constructor(private arch: ArchResolver | null = null) {}
  private shadow = new Map<string, number[]>();
  private cellCentres = new Map<string, THREE.Vector3>();
  readonly meshes: THREE.Mesh[] = [];
  readonly proxies: THREE.Mesh[] = [];
  readonly proxyRoot = new THREE.Group();

  /** Add a world-space geometry (it is consumed). `cast` also merges it into the cell's shadow proxy. */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, opts: { tier?: Tier; cast?: boolean; at?: [number, number] } = {}): void {
    if (!geo.index || geo.getAttribute('position').itemSize !== 3 || (geo.getAttribute('position') as THREE.BufferAttribute).array.constructor !== Float32Array) geo = floatGeo(geo);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    const a = this.arch?.(mat);
    if (a) {
      mat = a.mat;
      geo.setAttribute('layer', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count).fill(a.layer), 1));
    }
    let at = opts.at;
    if (!at) { geo.computeBoundingBox(); const c = geo.boundingBox!.getCenter(new THREE.Vector3()); at = [c.x, c.z]; }
    const tier = opts.tier ?? 'far';
    const cell = cellKey(at[0], at[1], tier);
    const key = `${mat.uuid}|${tier}|${cell}`;
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = { mat, tier, cell, geos: [], verts: 0 }));
    g.geos.push(geo);
    g.verts += geo.getAttribute('position').count;
    if (opts.cast) this.addShadow(geo, at);
  }

  /** Add a geometry in local space placed by a matrix (the source is not modified). */
  addPlaced(mat: THREE.Material, src: THREE.BufferGeometry, m: THREE.Matrix4, opts: { tier?: Tier; cast?: boolean } = {}): void {
    const g = floatGeo(src);
    g.applyMatrix4(m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    this.add(mat, g, { ...opts, at: [p.x, p.z] });
  }

  /** Positions only, triangle soup, into the shadow proxy of the cell. */
  addShadow(geo: THREE.BufferGeometry, at?: [number, number]): void {
    const pos = geo.getAttribute('position');
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    if (!at) { geo.computeBoundingBox(); const c = geo.boundingBox!.getCenter(new THREE.Vector3()); at = [c.x, c.z]; }
    const key = shadowKey(at[0], at[1]);
    let arr = this.shadow.get(key);
    if (!arr) this.shadow.set(key, (arr = []));
    for (let i = 0; i < n; i++) { const v = idx ? idx.getX(i) : i; arr.push(pos.getX(v), pos.getY(v), pos.getZ(v)); }
  }

  /** Triangle-wise: split a (possibly map-spanning) geometry into per-cell pieces of the colour chunks. */
  addSplit(mat: THREE.Material, src: THREE.BufferGeometry, matrix: THREE.Matrix4, opts: { tier?: Tier; cast?: boolean } = {}): void {
    const geo = floatGeo(src);
    geo.applyMatrix4(matrix);
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
    const idx = geo.index!;
    const cells = new Map<string, { p: number[]; n: number[]; u: number[] }>();
    for (let t = 0; t + 2 < idx.count; t += 3) {
      const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
      const cx = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3, cz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
      const key = cellKey(cx, cz);
      let c = cells.get(key);
      if (!c) cells.set(key, (c = { p: [], n: [], u: [] }));
      for (const i of [i0, i1, i2]) { c.p.push(pos.getX(i), pos.getY(i), pos.getZ(i)); c.n.push(nor.getX(i), nor.getY(i), nor.getZ(i)); c.u.push(uv.getX(i), uv.getY(i)); }
    }
    for (const c of cells.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(c.u, 2));
      g.setIndex(Array.from({ length: c.p.length / 3 }, (_, i) => i));
      this.add(mat, g, opts);
    }
  }

  /** Triangle-wise: split an existing (non-indexed or indexed) world-space geometry into per-cell shadow proxies. */
  addShadowSplit(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4): void {
    const pos = geo.getAttribute('position');
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) { const i = idx ? idx.getX(t + k) : t + k; v[k].fromBufferAttribute(pos, i); if (matrix) v[k].applyMatrix4(matrix); }
      const key = shadowKey((v[0].x + v[1].x + v[2].x) / 3, (v[0].z + v[1].z + v[2].z) / 3);
      let arr = this.shadow.get(key);
      if (!arr) this.shadow.set(key, (arr = []));
      for (const p of v) arr.push(p.x, p.y, p.z);
    }
  }

  build(parent: THREE.Object3D): void {
    for (const g of this.groups.values()) {
      // Keep each draw under ~500k vertices (Uint32 indices are fine, but huge buffers stall uploads).
      let batch: THREE.BufferGeometry[] = [], verts = 0;
      const flush = () => {
        if (!batch.length) return;
        const merged = mergeGeometries(batch, false);
        for (const b of batch) b.dispose();
        batch = []; verts = 0;
        if (!merged) return;
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const mesh = new THREE.Mesh(merged, g.mat);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData.tier = g.tier;
        mesh.userData.lh = true;
        mesh.userData.center = merged.boundingBox!.getCenter(new THREE.Vector3());
        parent.add(mesh);
        this.meshes.push(mesh);
      };
      for (const geo of g.geos) {
        batch.push(geo);
        verts += geo.getAttribute('position').count;
        if (verts > 500_000) flush();
      }
      flush();
    }
    this.groups.clear();
    const depth = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    for (const [key, arr] of this.shadow) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, depth);
      m.castShadow = true;
      m.receiveShadow = false;
      m.matrixAutoUpdate = false;
      m.name = `lh-shadow-${key}`;
      m.userData.lh = true;
      this.proxyRoot.add(m);
      this.proxies.push(m);
    }
    this.shadow.clear();
    this.proxyRoot.visible = false;
    parent.add(this.proxyRoot);
    parent.add(new ShadowReveal(this.proxyRoot));
    void this.cellCentres;
  }

  /** Called every frame from the map update, before rendering: hide proxies from the colour render list. */
  hideProxies(): void { this.proxyRoot.visible = false; }

  /** Distance-tier culling of the fine-detail chunks. */
  cull(px: number, pz: number): void {
    for (const m of this.meshes) {
      if (m.userData.tier !== 'near') continue;
      const c = m.userData.center as THREE.Vector3;
      m.visible = Math.hypot(c.x - px, c.z - pz) < NEAR_FAR + NEAR_CELL * 0.7;
    }
  }
}

/**
 * Visited by three.js' render-list build (as a LOD) right after the proxy group, which was hidden at that moment:
 * it reveals the proxies so the shadow pass that follows draws them.
 */
class ShadowReveal extends THREE.LOD {
  constructor(private target: THREE.Object3D) { super(); this.autoUpdate = true; this.frustumCulled = false; }
  override update(): void { this.target.visible = true; }
}
