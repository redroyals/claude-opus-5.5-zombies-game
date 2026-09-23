// Geometry, colliders and navigation for a Zombies map, built from a ZombiesMapDef (see ./mapdef and
// docs/MAP_API.md). Owns its own CollisionWorld + NavGrid so extraction's district is untouched. Doors and
// debris are removable colliders; barricaded windows block movement but not bullets.
import * as THREE from 'three';
import { StaticBatch, worldBox, worldQuad } from '../render/geom';
import { models } from '../render/ModelRegistry';
import type { Materials } from '../render/materials';
import { signTexture } from '../render/textures';
import type { Box, CollisionWorld } from '../world/Collision';
import { NavGrid } from '../world/NavGrid';
import { buildColliders, closeDoorBox, compileMap, openDoorBox, WIN, type CLadder, type CompiledMap } from './mapcompile';
import { doorLabel, type DoorDef, type LampDef, type LightState, type MatRef, type MatSpec, type WindowDef, type ZombiesMapDef } from './mapdef';
import type { ZombiesMapEntry } from './maps/types';

export interface DoorRuntime { geom: DoorDef; box: Box; mesh: THREE.Group; openT: number; open: boolean; cost: number; label: string }
export interface WindowRuntime {
  geom: WindowDef;
  box: Box;
  planks: THREE.Mesh[];
  plankHome: THREE.Matrix4[];
  flying: { m: THREE.Mesh; t: number; v: THREE.Vector3; spin: THREE.Vector3 }[];
  /** Outside approach point, inside landing point and pocket spawn point. */
  outside: { x: number; z: number };
  inside: { x: number; z: number };
  spawn: { x: number; z: number };
}
interface RoomLight { light: THREE.PointLight; bulb: THREE.Mesh | null; phase: number; def: LampDef }

const specCache = new Map<string, THREE.Material>();

/** Resolve a MatRef against the shared material library (inline specs are cached by value). */
export function resolveMat(M: Materials, m: MatRef): THREE.Material {
  if (typeof m !== 'string') return specMat(M, m);
  if (m === 'glassPane') {
    let g = specCache.get('glassPane');
    if (!g) specCache.set('glassPane', (g = new THREE.MeshStandardMaterial({ color: 0x405060, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false })));
    return g;
  }
  const c = /^container(\d)$/.exec(m);
  if (c) return M.containers[+c[1]] ?? M.containers[0];
  const v = (M as unknown as Record<string, unknown>)[m];
  return v instanceof THREE.Material ? v : M.concrete;
}

function specMat(M: Materials, s: MatSpec): THREE.Material {
  const key = JSON.stringify(s);
  let mat = specCache.get(key);
  if (mat) return mat;
  const set = s.texture ? (M.tex as unknown as Record<string, { map?: THREE.Texture; normal?: THREE.Texture; rough?: THREE.Texture }>)[s.texture] : undefined;
  const m = new THREE.MeshStandardMaterial({
    color: s.color, roughness: s.roughness ?? 0.85, metalness: s.metalness ?? 0,
    emissive: s.emissive ?? 0x000000, emissiveIntensity: s.emissiveIntensity ?? 1,
    transparent: s.opacity !== undefined && s.opacity < 1, opacity: s.opacity ?? 1, side: s.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (set?.map) m.map = set.map;
  if (set?.normal) m.normalMap = set.normal;
  if (set?.rough) m.roughnessMap = set.rough;
  specCache.set(key, (mat = m));
  return mat;
}

export class ZombiesMap {
  readonly root = new THREE.Group();
  readonly def: ZombiesMapDef;
  readonly compiled: CompiledMap;
  readonly world: CollisionWorld;
  readonly nav: NavGrid;
  readonly doors: DoorRuntime[] = [];
  readonly windows: WindowRuntime[] = [];
  /** Easter-egg objects per step (index-aligned with the step's objects). */
  readonly eggObjects: THREE.Group[][] = [];
  readonly ladders: CLadder[];
  private batch = new StaticBatch();
  private lights: RoomLight[] = [];
  private bulbOn: THREE.MeshBasicMaterial;
  private bulbOff: THREE.MeshBasicMaterial;
  private plankMat: THREE.MeshStandardMaterial;
  private chalk = new Map<string, THREE.Mesh>();

  constructor(private M: Materials, readonly entry: ZombiesMapEntry) {
    const def = (this.def = entry.def);
    this.root.visible = false;
    this.bulbOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd29a).multiplyScalar(3) });
    this.bulbOff = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x802010).multiplyScalar(1.5) });
    this.plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9, map: M.tex.wood.map });
    const cm = (this.compiled = compileMap(def));
    const col = buildColliders(def, cm);
    this.world = col.world;
    const { minX, minZ, maxX, maxZ } = def.bounds;
    this.nav = new NavGrid(minX, minZ, maxX, maxZ);
    this.nav.setLinks(cm.links);
    this.ladders = cm.ladders;
    this.buildGround();
    this.buildStatic();
    this.buildWindows(col.windows);
    this.buildDoors(col.doors);
    this.buildLadders();
    this.buildDressing();
    this.buildLights();
    this.buildEggObjects();
    this.buildSky();
    entry.decorate?.({ def, root: this.root, M, batch: this.batch, world: this.world, mat: (m) => this.mat(m) });
    this.batch.build(this.root, { castShadow: true, receiveShadow: true });
    this.nav.build(this.world);
    for (const a of def.assets ?? []) void models.load(a);
  }

  mat(m: MatRef): THREE.Material { return resolveMat(this.M, m); }

  // ------------------------------------------------------------------------------------------
  private buildGround(): void {
    const g = this.def.ground;
    if (!g) return;
    const { minX, minZ, maxX, maxZ } = this.def.bounds;
    const yard = new THREE.Mesh(worldQuad(minX, minZ, maxX, maxZ, -0.02, g.tile ?? 6), this.mat(g.mat));
    yard.receiveShadow = true;
    this.root.add(yard);
  }

  private buildStatic(): void {
    for (const b of this.compiled.boxes) {
      if (!b.mat) continue;
      const [x0, y0, z0, x1, y1, z1] = b.box;
      const mat = this.mat(b.mat);
      if ((mat as THREE.MeshStandardMaterial).transparent || !b.shadow) {
        const m = new THREE.Mesh(worldBox(x0, y0, z0, x1, y1, z1, b.tile), mat);
        m.castShadow = false;
        m.receiveShadow = !(mat as THREE.MeshStandardMaterial).transparent;
        this.root.add(m);
      } else this.batch.add(mat, worldBox(x0, y0, z0, x1, y1, z1, b.tile));
    }
    for (const q of this.compiled.quads) {
      const { x0, z0, x1, z1 } = q.rect;
      this.batch.add(this.mat(q.mat), worldQuad(x0, z0, x1, z1, q.y, q.tile));
    }
    for (const s of this.compiled.slopes) {
      // Sloped deck over the stepped ramp collider.
      const { x0, z0, x1, z1 } = s.rect;
      const alongX = s.dir === '+x' || s.dir === '-x';
      const len = alongX ? x1 - x0 : z1 - z0, wid = alongX ? z1 - z0 : x1 - x0;
      const rise = s.y1 - s.y0;
      const geo = new THREE.BoxGeometry(alongX ? Math.hypot(len, rise) : wid, 0.12, alongX ? wid : Math.hypot(len, rise));
      const m = new THREE.Mesh(geo, this.mat(s.mat));
      m.position.set((x0 + x1) / 2, (s.y0 + s.y1) / 2 - 0.04, (z0 + z1) / 2);
      const ang = Math.atan2(rise, len);
      if (s.dir === '+x') m.rotation.z = ang; else if (s.dir === '-x') m.rotation.z = -ang;
      else if (s.dir === '+z') m.rotation.x = -ang; else m.rotation.x = ang;
      m.castShadow = m.receiveShadow = true;
      this.root.add(m);
    }
    for (const c of this.def.cylinders ?? []) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.h, c.segments ?? 12), this.mat(c.mat));
      d.position.set(c.x, (c.y ?? 0) + c.h / 2, c.z);
      d.castShadow = true;
      this.root.add(d);
    }
    for (const p of this.def.props ?? []) {
      const holder = new THREE.Group();
      holder.position.set(p.x, p.y ?? 0, p.z);
      holder.rotation.y = p.yaw ?? 0;
      this.root.add(holder);
      if (p.collider && p.fallback !== false) {
        const fb = new THREE.Mesh(new THREE.BoxGeometry(p.collider.w, p.collider.h, p.collider.d), this.mat(p.fallback ?? 'metalDark'));
        fb.position.y = p.collider.h / 2;
        fb.castShadow = true;
        holder.add(fb);
      }
      void models.load(p.model).then((lm) => {
        if (!lm) return;
        const inst = models.instance(lm);
        if (p.fit) {
          const box = new THREE.Box3().setFromObject(inst);
          const size = box.getSize(new THREE.Vector3());
          const s = p.fit.height ? p.fit.height / Math.max(1e-3, size.y) : p.fit.width ? p.fit.width / Math.max(1e-3, Math.max(size.x, size.z)) : 1;
          inst.scale.multiplyScalar(s);
        } else if (p.scale) inst.scale.multiplyScalar(p.scale);
        holder.clear();
        holder.add(inst);
      });
    }
  }

  private buildWindows(boxes: Box[]): void {
    const plankGeo = new THREE.BoxGeometry(1.75, 0.2, 0.06);
    this.compiled.windows.forEach((cw, wi) => {
      const w = cw.def;
      const alongX = w.nz !== 0;
      const cx = w.x, cz = w.z;
      const y0 = w.floor + WIN.y0, y1 = w.floor + WIN.y1;
      // Rotted frame
      const fr = (a0: number, a1: number, b0: number, b1: number) => {
        if (alongX) this.batch.add(this.M.wood, worldBox(cx + a0, b0, cz - 0.2, cx + a1, b1, cz + 0.2, 1));
        else this.batch.add(this.M.wood, worldBox(cx - 0.2, b0, cz + a0, cx + 0.2, b1, cz + a1, 1));
      };
      fr(-WIN.half - 0.1, -WIN.half, y0, y1); fr(WIN.half, WIN.half + 0.1, y0, y1); fr(-WIN.half - 0.1, WIN.half + 0.1, y0 - 0.1, y0); fr(-WIN.half - 0.1, WIN.half + 0.1, y1, y1 + 0.1);
      // Planks nailed on the inside face at jaunty angles
      const planks: THREE.Mesh[] = [];
      const homes: THREE.Matrix4[] = [];
      const yaw = Math.atan2(w.nx, w.nz);
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(plankGeo, this.plankMat);
        const y = y0 + 0.15 + i * ((y1 - y0 - 0.3) / 5);
        const inset = -0.25; // inside the wall
        m.position.set(cx + w.nx * inset, y, cz + w.nz * inset);
        m.rotation.set(0, yaw, ((i * 37) % 7 - 3) * 0.06 + (i % 2 ? 0.12 : -0.1));
        m.castShadow = true;
        this.root.add(m);
        m.updateMatrix();
        planks.push(m);
        homes.push(m.matrix.clone());
      }
      this.windows.push({ geom: w, box: boxes[wi], planks, plankHome: homes, flying: [], outside: cw.outside, inside: cw.inside, spawn: cw.spawn });
    });
  }

  private buildDoors(boxes: Map<string, Box>): void {
    for (const g of this.def.doors) {
      const mesh = new THREE.Group();
      const len = g.a1 - g.a0, h = g.y1 - g.y0;
      const mid = (g.a0 + g.a1) / 2;
      const debris = g.kind === 'debris';
      if (debris) {
        // Rubble heap: crates, planks, a toppled cabinet
        const mats = [this.M.wood, this.M.rust, this.M.concreteDark, this.M.metalDark];
        for (let i = 0; i < 14; i++) {
          const w = 0.4 + ((i * 13) % 7) * 0.12, hh = 0.3 + ((i * 7) % 5) * 0.18, d = 0.4 + ((i * 11) % 5) * 0.1;
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mats[i % 4]);
          const t = (i % 5) / 4 - 0.5;
          m.position.set(t * len * 0.9, Math.min(h - 0.2, (Math.floor(i / 5) * 0.55) + hh / 2), ((i * 5) % 3 - 1) * 0.25);
          m.rotation.set(Math.sin(i) * 0.4, i * 0.7, Math.cos(i * 2) * 0.3);
          m.castShadow = true;
          mesh.add(m);
        }
      } else {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.12), this.M.metalDark);
        slab.position.y = h / 2;
        slab.castShadow = true;
        mesh.add(slab);
        for (let i = 0; i < 3; i++) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.16), this.M.rust);
          band.position.y = 0.4 + i * (h - 0.8) / 2;
          mesh.add(band);
        }
      }
      const tag = g.requiresPower ? 'NEEDS POWER' : debris ? 'DEBRIS' : 'SEALED';
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.45), new THREE.MeshBasicMaterial({ map: signTexture([tag, `${g.cost}`], { bg: '#161410', fg: '#e8dcc0', border: '#8a6a3a' }), transparent: true }));
      sign.position.set(0, Math.min(h - 0.4, 2.2), 0.1);
      const signB = sign.clone();
      signB.rotation.y = Math.PI;
      signB.position.z = -0.1;
      mesh.add(sign, signB);
      const swap = (lm: Parameters<Parameters<typeof models.whenNamed>[1]>[0], fit: (o: THREE.Object3D) => void) => {
        const inst = models.instance(lm);
        for (const c of mesh.children) if (c !== sign && c !== signB) c.visible = false;
        fit(inst);
        mesh.add(inst);
      };
      if (g.model) void models.load(g.model).then((lm) => { if (lm) swap(lm, (o) => { const b = new THREE.Box3().setFromObject(o); const s = b.getSize(new THREE.Vector3()); o.scale.set(len / Math.max(1e-3, s.x), h / Math.max(1e-3, s.y), 1); }); });
      else if (debris) models.whenNamed('kit_debris.glb', (lm) => swap(lm, (o) => o.scale.setScalar(len / 3.056)));
      else models.whenNamed('kit_door.glb', (lm) => swap(lm, (o) => o.scale.set(len / 4, h / 3.3, 1)));
      if (g.axis === 'x') mesh.position.set(mid, g.y0, g.at);
      else { mesh.position.set(g.at, g.y0, mid); mesh.rotation.y = Math.PI / 2; }
      this.root.add(mesh);
      this.doors.push({ geom: g, box: boxes.get(g.id)!, mesh, openT: 0, open: false, cost: g.cost, label: doorLabel(g) });
    }
  }

  private buildLadders(): void {
    for (const l of this.ladders) {
      const g = new THREE.Group();
      const h = l.y1 - l.y0 + 1.0;
      for (const s of [-0.22, 0.22]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), this.M.steel);
        rail.position.set(s, h / 2, 0);
        g.add(rail);
      }
      for (let y = 0.3; y < h - 0.2; y += 0.3) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.44, 6), this.M.steel);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, y, 0);
        g.add(rung);
      }
      g.position.set(l.x, l.y0, l.z);
      g.rotation.y = l.yaw;
      this.root.add(g);
    }
  }

  private buildDressing(): void {
    for (const s of this.def.signs ?? []) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w ?? 2.2, s.h ?? 0.7), new THREE.MeshStandardMaterial({ map: signTexture(s.lines, { bg: s.bg ?? '#1c1a16', fg: s.fg ?? '#d8d0b8', border: s.border ?? '#6a5a3a', hazard: false }), roughness: 0.8 }));
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.ry;
      this.root.add(m);
    }
    const blood = new THREE.MeshBasicMaterial({ map: this.M.tex.blood, transparent: true, depthWrite: false, color: 0x5a1010, polygonOffset: true, polygonOffsetFactor: -4 });
    const grime = this.M.grimeDecal;
    for (const dc of this.def.decals ?? []) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(dc.size, dc.size), dc.kind === 'grime' ? grime : blood);
      d.rotation.set(-Math.PI / 2, 0, dc.rot ?? 0);
      d.position.set(dc.x, dc.y ?? 0.02, dc.z);
      this.root.add(d);
    }
  }

  private buildLights(): void {
    const bulbGeo = new THREE.SphereGeometry(0.14, 10, 8);
    const shade = new THREE.ConeGeometry(0.45, 0.3, 12, 1, true);
    const cord = new THREE.CylinderGeometry(0.01, 0.01, 0.4);
    this.def.lighting.lamps.forEach((d, i) => {
      const l = new THREE.PointLight(d.pre.color, 0, d.range ?? 16, d.decay ?? 1.6);
      l.position.set(d.x, d.y - 0.35, d.z);
      this.root.add(l);
      let bulb: THREE.Mesh | null = null;
      if ((d.fixture ?? 'pendant') === 'pendant') {
        bulb = new THREE.Mesh(bulbGeo, this.bulbOff);
        bulb.position.set(d.x, d.y - 0.3, d.z);
        const sh = new THREE.Mesh(shade, this.M.metalDark);
        sh.position.set(d.x, d.y - 0.12, d.z);
        const c = new THREE.Mesh(cord, this.M.rubber);
        c.position.set(d.x, d.y + 0.1, d.z);
        this.root.add(bulb, sh, c);
      }
      this.lights.push({ light: l, bulb, phase: i * 1.7, def: d });
    });
    for (const p of this.def.lighting.lights ?? []) {
      const l = new THREE.PointLight(p.color, p.intensity, p.range, p.decay ?? 1.8);
      l.position.set(p.x, p.y, p.z);
      this.root.add(l);
    }
  }

  private buildEggObjects(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x202018, emissive: 0x40ffb0, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.6 });
    for (const step of this.def.egg?.steps ?? []) {
      const list: THREE.Group[] = [];
      if (step.kind !== 'kill') {
        for (const o of step.objects) {
          const g = new THREE.Group();
          const model = o.model ?? 'relic';
          if (model === 'radio') {
            const radio = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.12), this.M.metalDark);
            const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), mat);
            dial.rotation.x = Math.PI / 2;
            dial.position.set(0.07, 0, 0.07);
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.3), this.M.steel);
            ant.position.set(-0.1, 0.2, 0);
            ant.rotation.z = 0.3;
            g.add(radio, dial, ant);
            g.userData.spin = dial;
          } else if (model === 'orb' || model === 'relic') {
            const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(model === 'orb' ? 0.14 : 0.1, 1), mat);
            g.add(orb);
            g.userData.spin = orb;
          } else {
            void models.load(model).then((lm) => { if (lm) g.add(models.instance(lm)); });
          }
          g.position.set(o.x, o.y - 0.25, o.z);
          this.root.add(g);
          list.push(g);
        }
      }
      this.eggObjects.push(list);
    }
  }

  private buildSky(): void {
    const sky = this.def.lighting.sky;
    if (!sky) return;
    const geo = new THREE.SphereGeometry(400, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(sky.top) }, horizon: { value: new THREE.Color(sky.horizon) }, stars: { value: sky.stars ? 1 : 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform float stars; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){ float t = clamp(vDir.y * 1.6, 0.0, 1.0); vec3 c = mix(horizon, top, t);
          if (stars > 0.5 && vDir.y > 0.05) { vec3 q = floor(vDir * 300.0); float s = step(0.9975, h(q)); c += s * vec3(0.8) * t; }
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    dome.userData.sky = true;
    this.root.add(dome);
  }

  // ------------------------------------------------------------------------------------------
  /** Chalk outline placeholder registry: machines module draws the actual chalk. */
  registerChalk(key: string, m: THREE.Mesh): void { this.chalk.set(key, m); }

  openDoor(id: string, instant = false): void {
    const d = this.doors.find((x) => x.geom.id === id);
    if (!d || d.open) return;
    d.open = true;
    d.openT = instant ? 1 : 0.0001;
    openDoorBox(d.box);
    this.nav.build(this.world);
  }

  resetDoors(): void {
    for (const d of this.doors) {
      if (!d.open) continue;
      d.open = false;
      d.openT = 0;
      closeDoorBox(d.box, d.geom);
      d.mesh.visible = true;
      d.mesh.position.y = d.geom.y0;
      d.mesh.scale.set(1, 1, 1);
    }
    this.nav.build(this.world);
  }

  /** Show `n` planks (0..6) on window `w`; newly removed planks fly off. */
  setPlanks(w: number, n: number, animate: boolean): void {
    const win = this.windows[w];
    win.planks.forEach((p, i) => {
      const show = i < n;
      if (show && !p.visible) {
        p.visible = true;
        p.matrix.copy(win.plankHome[i]);
        p.matrix.decompose(p.position, p.quaternion, p.scale);
      } else if (!show && p.visible) {
        p.visible = false;
        if (animate) {
          const fly = p.clone();
          fly.visible = true;
          this.root.add(fly);
          const g = win.geom;
          win.flying.push({ m: fly, t: 0, v: new THREE.Vector3(g.nx * 3 + (Math.random() - 0.5), 2.5, g.nz * 3 + (Math.random() - 0.5)), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
        }
      }
    });
  }

  update(time: number, dt: number, power: boolean, extra: { ride?: { id: string; t: number } | null; egg?: boolean } = {}): void {
    for (const d of this.doors) {
      if (!d.open || d.openT >= 1) { if (d.open) d.mesh.visible = false; continue; }
      d.openT = Math.min(1, d.openT + dt / 1.1);
      const e = d.openT * d.openT;
      if (d.geom.kind === 'debris') { d.mesh.position.y = d.geom.y0 - e * 2.5; d.mesh.scale.setScalar(1 - e * 0.5); }
      else d.mesh.position.y = d.geom.y0 + e * 3.2;
      if (d.openT >= 1) d.mesh.visible = false;
    }
    for (const w of this.windows) {
      for (let i = w.flying.length - 1; i >= 0; i--) {
        const f = w.flying[i];
        f.t += dt;
        f.v.y -= 12 * dt;
        f.m.position.addScaledVector(f.v, dt);
        f.m.rotation.x += f.spin.x * dt; f.m.rotation.y += f.spin.y * dt; f.m.rotation.z += f.spin.z * dt;
        const floorY = w.geom.floor + 0.05;
        if (f.m.position.y < floorY && f.t > 0.2) { f.m.position.y = Math.max(0.05, Math.min(f.m.position.y, floorY)); f.v.set(0, 0, 0); f.spin.set(0, 0, 0); }
        if (f.t > 3) { this.root.remove(f.m); w.flying.splice(i, 1); }
      }
    }
    for (const l of this.lights) {
      const st = power ? l.def.post : l.def.pre;
      const { intensity, lit } = lampLevel(st, time, l.phase);
      l.light.color.setHex(st.color);
      l.light.intensity = intensity;
      if (l.bulb) l.bulb.material = lit ? this.bulbOn : this.bulbOff;
    }
    for (const step of this.eggObjects) for (const r of step) {
      if (!r.visible) continue;
      const s = r.userData.spin as THREE.Object3D | undefined;
      if (s) s.rotation.y = time * 2;
    }
    this.entry.update?.({ time, dt, power, ride: extra.ride ?? null, egg: extra.egg ?? false });
  }

  groundHeight(x: number, z: number): number {
    return this.world.groundHeight(x, z, 0.3, 3.2);
  }
}

/** Light level for a lamp state at a time (pure; flicker patterns shared by every map). */
export function lampLevel(st: LightState, time: number, phase: number): { intensity: number; lit: boolean } {
  const I = st.intensity;
  switch (st.flicker ?? 'none') {
    case 'faulty': {
      const f = Math.sin(time * 3.1 + phase) * Math.sin(time * 17 + phase * 3);
      return { intensity: f > 0.6 ? I * 0.1 : I + Math.sin(time * 1.3 + phase) * I * 0.3, lit: false };
    }
    case 'buzz': {
      const f = Math.sin(time * 31 + phase) * Math.sin(time * 2.3 + phase);
      return f > 0.93 ? { intensity: I * 0.27, lit: false } : { intensity: I, lit: true };
    }
    default:
      return { intensity: I, lit: I > 0 };
  }
}
