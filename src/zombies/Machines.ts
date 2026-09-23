// Visuals for the Zombies machines: the Cache (mystery box) with its reveal reel and Moth departure, the
// Reforger, four perk machines, the power switch, chalk wall-buys and power-up pickups.
// Everything is procedural first and upgrades to GLBs from public/models/ when they exist.
import * as THREE from 'three';
import { WEAPONS, type WeaponId } from '../config';
import { findNode, fitModel, models, placeModel, type LoadedModel } from '../render/ModelRegistry';
import { BOX_MOVE_SECONDS, BOX_OFFER_SECONDS, BOX_SPIN_SECONDS, PERKS, WALL_BUYS, type BoxState, type PerkId, type WallBuyKey } from './rules';
import { POWERUP_INFO, pickupVisible, type PowerUpKind } from './powerups';
import type { Spot } from './mapdef';

/** Try `zombies/<name>` then `<name>` under public/models/. */
function watchModel(name: string, cb: (m: LoadedModel) => void): void {
  models.whenNamed(name, cb);
}

function glowTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = glowTex();

function neonTexture(lines: string[], color: string, sub?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#060608';
  g.fillRect(0, 0, 512, 192);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.strokeRect(10, 10, 492, 172);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 58px "Arial Black", Impact, sans-serif';
  lines.forEach((l, i) => g.fillText(l, 256, 70 + i * 62 - (lines.length - 1) * 18));
  if (sub) { g.shadowBlur = 6; g.font = 'bold 30px monospace'; g.fillStyle = '#ffffff'; g.fillText(sub, 256, 160); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ----------------------------------------------------------------------------------------------
// Display guns (box reel, reforger): GLB if present, else a lit procedural silhouette per class.
// ----------------------------------------------------------------------------------------------
const displayCache = new Map<WeaponId, THREE.Group>();
export function displayGun(id: WeaponId): THREE.Group {
  const cached = displayCache.get(id);
  if (cached) return cached.clone(true);
  const def = WEAPONS[id];
  const L = (def.lengthScale ?? 1) * (def.cls === 'pistol' ? 0.35 : def.cls === 'shotgun' ? 1.05 : 0.9);
  const g = new THREE.Group();
  const col = new THREE.Color(def.tint ?? 0x3a3e44);
  const body = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.6, emissive: 0x203040, emissiveIntensity: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8e94, roughness: 0.3, metalness: 0.9, emissive: 0x202830, emissiveIntensity: 0.5 });
  const b = (w: number, h: number, d: number, x: number, y: number, z: number, m = body, rx = 0) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.rotation.x = rx; g.add(me); };
  b(0.06, 0.08, 0.35 * L, 0, 0, 0);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.4 * L, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.35 * L);
  g.add(barrel);
  if (def.cls !== 'pistol') b(0.045, 0.07, 0.22 * L, 0, -0.01, 0.26 * L);
  b(0.035, 0.1, 0.045, 0, -0.08, 0.06, body, -0.3);
  if (def.cls !== 'shotgun' && def.cls !== 'launcher') b(0.03, def.cls === 'lmg' ? 0.14 : 0.12, 0.05, 0, -0.1, -0.06, metal, 0.15);
  if (def.cls === 'sniper' || def.cls === 'dmr') { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 10), metal); sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.075, -0.04); g.add(sc); }
  if (def.cls === 'launcher') { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 12), body); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.06, -0.15); g.add(tube); }
  if (def.cls === 'wonder') {
    const c = def.special === 'arc' ? 0x40a0ff : def.special === 'singularity' ? 0xa040ff : 0x80e0ff;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3) }));
    orb.position.set(0, 0.02, -0.25);
    g.add(orb);
  }
  displayCache.set(id, g);
  // Upgrade the cached template once the GLB exists; later clones pick it up.
  void models.load(`weapons/${def.modelId ?? id}.glb`).then((m) => {
    if (!m) return;
    const inst = models.instance(m);
    const box = new THREE.Box3().setFromObject(inst);
    const s = box.getSize(new THREE.Vector3());
    if (s.x > s.z) inst.rotation.y = Math.PI / 2;
    fitModel(inst, 0.8 * L + 0.2, { base: false });
    const t = new THREE.Group();
    t.add(inst);
    displayCache.set(id, t);
  });
  return g.clone(true);
}

// ----------------------------------------------------------------------------------------------
// The Cache (mystery box)
// ----------------------------------------------------------------------------------------------
interface BoxView { root: THREE.Group; body: THREE.Group; lid: THREE.Object3D; light: THREE.PointLight; beam: THREE.Mesh; glow: THREE.Sprite; spot: Spot }

export class CacheView {
  readonly group = new THREE.Group();
  private views: BoxView[] = [];
  private shown: THREE.Group | null = null;
  private shownId: WeaponId | null = null;
  private moth: THREE.Group;
  private lastLoc = -1;
  private arriveT = 0;
  private reelT = 0;
  private reelIdx = 0;
  private spinSeen = false;

  constructor(spots: Spot[], ground: (x: number, z: number) => number, model = 'mystery_box.glb') {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.8 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.4, metalness: 0.7 });
    const qMat = new THREE.MeshBasicMaterial({ map: this.questionTex(), transparent: true, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x70d8ff), transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (const sp of spots) {
      const root = new THREE.Group();
      root.position.set(sp.x, ground(sp.x, sp.z), sp.z);
      root.rotation.y = sp.face;
      const body = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.7), wood);
      crate.position.y = 0.275;
      crate.castShadow = true;
      body.add(crate);
      for (const x of [-0.66, 0.66]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.58, 0.74), trim); t.position.set(x, 0.29, 0); body.add(t); }
      for (const [sx, face] of [[0.36, 1], [-0.36, -1]] as const) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), qMat);
        q.position.set(sx * 1.5, 0.3, face * 0.352);
        if (face < 0) q.rotation.y = Math.PI;
        body.add(q);
      }
      const lid = new THREE.Group();
      lid.position.set(0, 0.55, -0.35); // hinge at the back
      const lm = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.1, 0.72), wood);
      lm.position.set(0, 0.05, 0.35);
      lm.castShadow = true;
      lid.add(lm);
      const lq = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), qMat);
      lq.rotation.x = -Math.PI / 2;
      lq.position.set(0, 0.101, 0.35);
      lid.add(lq);
      body.add(lid);
      root.add(body);
      const light = new THREE.PointLight(0x80d0ff, 0, 5, 1.5);
      light.position.set(0, 1.1, 0);
      root.add(light);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 3.6, 16, 1, true), beamMat);
      beam.position.y = 3.4;
      root.add(beam);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x80d0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(1.6, 0.7, 1);
      glow.position.y = 0.7;
      (glow.material as THREE.SpriteMaterial).opacity = 0.45;
      root.add(glow);
      this.group.add(root);
      this.views.push({ root, body, lid, light, beam, glow, spot: sp });
    }
    this.moth = this.buildMoth();
    this.group.add(this.moth);
    watchModel(model, (m) => {
      for (const v of this.views) {
        const inst = models.instance(m);
        placeModel(inst, 1.0);
        const lid = findNode(inst, 'lid');
        v.body.clear();
        v.body.add(inst);
        if (lid) v.lid = lid;
        else v.lid = new THREE.Object3D();
      }
    });
  }

  private questionTex(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.shadowColor = '#7fe0ff'; g.shadowBlur = 12;
    g.fillStyle = '#bff0ff';
    g.font = 'bold 110px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildMoth(): THREE.Group {
    const g = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.9 });
    const wingM = new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x201810, emissiveIntensity: 0.4 });
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), bodyM);
    b.rotation.x = Math.PI / 2;
    g.add(b);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), wingM);
      w.scale.set(1, 0.7, 1);
      w.position.set(s * 0.15, 0, 0);
      w.rotation.x = -Math.PI / 2;
      w.userData.side = s;
      g.add(w);
    }
    g.visible = false;
    g.scale.setScalar(1.6);
    return g;
  }

  /** Weapon ids shown during the spin (decided by the rules module). */
  reel: WeaponId[] = [];

  update(dt: number, time: number, box: BoxState): void {
    const v = this.views[box.location];
    for (const o of this.views) {
      const here = o === v;
      o.body.visible = here && box.phase !== 'moving' ? true : here && box.phase === 'moving';
      o.beam.visible = here && box.phase !== 'moving';
      o.glow.visible = here;
      if (!here) { o.light.intensity = 0; o.body.visible = false; }
    }
    // Arrival flash when the box lands in a new spot
    if (this.lastLoc !== box.location) {
      if (this.lastLoc >= 0) this.arriveT = 1;
      this.lastLoc = box.location;
    }
    if (this.arriveT > 0) {
      this.arriveT = Math.max(0, this.arriveT - dt * 1.4);
      const k = 1 - this.arriveT;
      v.body.position.y = (1 - k) * 3;
      v.body.scale.setScalar(Math.max(0.01, k));
      v.light.intensity = 30 * this.arriveT;
    }
    (v.beam.material as THREE.MeshBasicMaterial).opacity = 0.07 + Math.sin(time * 2) * 0.03;
    const open = box.phase === 'spinning' || box.phase === 'offer';
    const lidTarget = open ? -1.9 : 0;
    v.lid.rotation.x += (lidTarget - v.lid.rotation.x) * Math.min(1, dt * 8);
    if (this.arriveT <= 0) v.light.intensity = open ? 9 + Math.sin(time * 20) * 3 : 2 + Math.sin(time * 2) * 0.8;

    // Reveal reel
    if (box.phase === 'spinning') {
      if (!this.spinSeen) { this.spinSeen = true; this.reelT = 0; this.reelIdx = 0; }
      const t = box.t;
      const final = box.offer;
      // Flick faster at first then slow down; last 0.6 s holds the result (or the moth).
      this.reelT -= dt;
      if (this.reelT <= 0 && t < BOX_SPIN_SECONDS - 0.6) {
        this.reelIdx++;
        this.reelT = 0.07 + (t / BOX_SPIN_SECONDS) * 0.3;
        const id = this.reel.length ? this.reel[this.reelIdx % this.reel.length] : 'ar_tern';
        this.show(v, id);
      } else if (t >= BOX_SPIN_SECONDS - 0.6) {
        if (final) this.show(v, final);
        else this.hideShown();
      }
      if (this.shown) {
        const rise = Math.min(1, t / 1.2);
        this.shown.position.set(0, 0.35 + rise * 0.85, 0);
        this.shown.rotation.y = Math.PI / 2 + time * 1.5;
      }
      if (!final && t >= BOX_SPIN_SECONDS - 0.6) this.showMoth(v, t - (BOX_SPIN_SECONDS - 0.6), time);
    } else if (box.phase === 'offer') {
      this.spinSeen = false;
      if (box.offer && this.shownId !== box.offer) this.show(v, box.offer);
      if (this.shown) {
        const k = box.t / BOX_OFFER_SECONDS;
        this.shown.position.set(0, 1.2 - k * 0.7, 0);
        this.shown.rotation.y = Math.PI / 2 + Math.sin(time * 0.8) * 0.5;
        this.shown.visible = k < 0.75 || Math.floor(time * 8) % 2 === 0;
      }
    } else if (box.phase === 'moving') {
      this.spinSeen = false;
      this.hideShown();
      const t = box.t;
      this.showMoth(v, t + 0.6, time);
      // Box lifts, wobbles, spins and vanishes
      const lift = Math.max(0, Math.min(1, (t - 0.8) / 2));
      v.body.position.y = lift * 2.6 + Math.sin(time * 9) * 0.05 * lift;
      v.body.rotation.y = lift * lift * 12;
      const vanish = Math.max(0, Math.min(1, (t - 2.9) / 0.7));
      v.body.scale.setScalar(Math.max(0.01, 1 - vanish));
      v.light.intensity = 10 + vanish * 40;
      v.beam.visible = false;
      if (t > BOX_MOVE_SECONDS - 0.2) v.body.visible = false;
    } else {
      this.spinSeen = false;
      this.hideShown();
      this.moth.visible = false;
      if (this.arriveT <= 0) { v.body.position.y = 0; v.body.rotation.y = 0; v.body.scale.setScalar(1); }
    }
  }

  private showMoth(v: BoxView, t: number, time: number): void {
    this.moth.visible = t < 3.2;
    const p = v.root.position;
    this.moth.position.set(p.x + Math.sin(time * 3) * 0.3 * t, p.y + 0.7 + t * 0.9, p.z + Math.cos(time * 2.3) * 0.3 * t);
    this.moth.rotation.y = time * 2;
    for (const w of this.moth.children) if (w.userData.side) w.rotation.z = Math.sin(time * 30) * 0.9 * w.userData.side;
  }

  private show(v: BoxView, id: WeaponId): void {
    if (this.shownId === id && this.shown) return;
    this.hideShown();
    const g = displayGun(id);
    v.root.add(g);
    this.shown = g;
    this.shownId = id;
  }

  private hideShown(): void {
    if (this.shown) this.shown.removeFromParent();
    this.shown = null;
    this.shownId = null;
  }
}

// ----------------------------------------------------------------------------------------------
// The Reforger
// ----------------------------------------------------------------------------------------------
export class ReforgerView {
  readonly root = new THREE.Group();
  private press: THREE.Object3D;
  private core: THREE.MeshStandardMaterial;
  private light: THREE.PointLight;
  private gun: THREE.Group | null = null;
  private t = 0;
  private dur = 1;
  private glb: THREE.Object3D | null = null;

  constructor(spot: Spot, y: number, model = 'reforger.glb') {
    this.root.position.set(spot.x, y, spot.z);
    this.root.rotation.y = spot.face;
    const dark = new THREE.MeshStandardMaterial({ color: 0x24222a, roughness: 0.5, metalness: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.35, metalness: 0.85 });
    this.core = new THREE.MeshStandardMaterial({ color: 0x100818, emissive: 0x9040ff, emissiveIntensity: 1.2 });
    const add = (m: THREE.Mesh, x: number, y2: number, z: number) => { m.position.set(x, y2, z); m.castShadow = true; this.root.add(m); return m; };
    add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.2), dark), 0, 0.45, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 1.3), brass), 0, 0.92, 0);
    for (const x of [-0.9, 0.9]) add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.9), dark), x, 1.95, -0.1);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 1.0), dark), 0, 3.1, -0.1);
    const window = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.05), this.core), 0, 0.55, 0.61);
    void window;
    // Conveyor slot + rollers
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), brass); r.rotation.z = Math.PI / 2; add(r, -0.75 + i * 0.3, 0.98, 0.1); }
    // Press head
    this.press = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.8), brass);
    head.castShadow = true;
    const glowPlate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.7), this.core);
    glowPlate.position.y = -0.22;
    this.press.add(head, glowPlate);
    this.press.position.set(0, 2.5, -0.05);
    this.root.add(this.press);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.55), new THREE.MeshBasicMaterial({ map: neonTexture(['REFORGER'], '#b070ff', '5000 · REPACK 2500') }));
    sign.position.set(0, 3.1, 0.41);
    this.root.add(sign);
    this.light = new THREE.PointLight(0xa060ff, 0, 6, 1.6);
    this.light.position.set(0, 1.6, 0.9);
    this.root.add(this.light);
    watchModel(model, (m) => {
      const inst = models.instance(m);
      placeModel(inst, 1.75);
      for (const c of [...this.root.children]) if (c !== this.light && c !== sign) c.visible = false;
      this.root.add(inst);
      this.glb = inst;
      this.press = findNode(inst, 'press') ?? findNode(inst, 'piston') ?? findNode(inst, 'arm') ?? inst;
    });
  }

  /** Start the forging animation with the gun being reforged. */
  start(id: WeaponId, dur: number): void {
    this.t = dur;
    this.dur = dur;
    if (this.gun) this.gun.removeFromParent();
    this.gun = displayGun(id);
    this.root.add(this.gun);
  }

  get busy(): boolean { return this.t > 0; }

  update(dt: number, time: number, power: boolean, sparks: (x: number, y: number, z: number) => void): void {
    this.core.emissiveIntensity = power ? 1.4 + Math.sin(time * 3) * 0.5 : 0.15;
    this.light.intensity = power ? 6 + Math.sin(time * 3) * 2 : 0;
    const pressHome = this.glb && this.press !== this.glb ? this.press.position.y : 2.5;
    if (this.t <= 0) { if (!this.glb) this.press.position.y = 2.5; return; }
    this.t = Math.max(0, this.t - dt);
    const p = 1 - this.t / this.dur;
    // Gun slides in, gets hammered three times in a flash of light, slides back out
    if (this.gun) {
      const slide = p < 0.2 ? p / 0.2 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      this.gun.position.set(-1.2 + slide * 1.2, 1.12, 0.1);
      this.gun.rotation.set(0, Math.PI / 2, 0);
      if (this.t <= 0) { this.gun.removeFromParent(); this.gun = null; }
    }
    const strike = p > 0.25 && p < 0.75 ? Math.abs(Math.sin((p - 0.25) * Math.PI * 6)) : 0;
    if (!this.glb) this.press.position.y = 2.5 - strike * 1.2;
    else if (this.press !== this.glb) this.press.position.y = pressHome;
    else this.glb.position.x = Math.sin(time * 60) * 0.01 * strike;
    this.light.intensity = 10 + strike * 60;
    this.core.emissiveIntensity = 2 + strike * 6;
    if (strike > 0.97) {
      const w = this.root.localToWorld(new THREE.Vector3(0, 1.2, 0.2));
      sparks(w.x, w.y, w.z);
    }
  }
}

// ----------------------------------------------------------------------------------------------
// Perk machines: four distinct silhouettes, neon signs lit only with power.
// ----------------------------------------------------------------------------------------------
interface PerkView { id: PerkId; root: THREE.Group; neon: THREE.MeshBasicMaterial; glass: THREE.MeshStandardMaterial; light: THREE.PointLight; lit: boolean }

export class PerkViews {
  readonly group = new THREE.Group();
  private views: PerkView[] = [];

  constructor(spots: Partial<Record<PerkId, Spot>>, ground: (x: number, z: number, y?: number) => number, modelNames: Partial<Record<PerkId, string>> = {}) {
    for (const id of Object.keys(spots) as PerkId[]) {
      const sp = spots[id]!;
      const def = PERKS[id];
      const hex = '#' + def.color.toString(16).padStart(6, '0');
      const root = new THREE.Group();
      root.position.set(sp.x, sp.y ?? ground(sp.x, sp.z), sp.z);
      root.rotation.y = sp.face;
      const paint = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.45, metalness: 0.35 });
      const chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.2, metalness: 0.95 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x101418, emissive: def.color, emissiveIntensity: 0.05, roughness: 0.1, transparent: true, opacity: 0.85 });
      const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; root.add(me); return me; };
      let signY = 2.2;
      if (id === 'bulwark') {
        // Squat, armoured fridge with riveted bands and a shield emblem
        add(new THREE.BoxGeometry(1.35, 1.9, 0.85), paint, 0, 0.95, 0);
        for (const y of [0.3, 1.0, 1.7]) add(new THREE.BoxGeometry(1.4, 0.08, 0.9), chrome, 0, y, 0);
        const shield = add(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 6), glass, 0, 1.15, 0.45);
        shield.rotation.x = Math.PI / 2;
        signY = 2.15;
      } else if (id === 'quickhands') {
        // Tall slim vending column with a lightning stripe and a cooler window
        add(new THREE.BoxGeometry(0.8, 2.4, 0.75), paint, 0, 1.2, 0);
        add(new THREE.BoxGeometry(0.55, 1.1, 0.05), glass, 0, 1.3, 0.39);
        const bolt = add(new THREE.BoxGeometry(0.08, 1.8, 0.02), chrome, 0.3, 1.2, 0.39);
        bolt.rotation.z = 0.35;
        signY = 2.65;
      } else if (id === 'hammerfall') {
        // Barrel-shaped keg dispenser with a hammer on top
        add(new THREE.CylinderGeometry(0.55, 0.6, 1.6, 16), paint, 0, 0.8, 0);
        for (const y of [0.25, 0.8, 1.35]) add(new THREE.TorusGeometry(0.58, 0.035, 6, 20), chrome, 0, y, 0).rotation.x = Math.PI / 2;
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), chrome, 0.1, 1.95, 0).rotation.z = 0.6;
        add(new THREE.BoxGeometry(0.35, 0.18, 0.18), chrome, -0.1, 2.2, 0);
        add(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), glass, 0, 1.0, 0.56).rotation.x = Math.PI / 2;
        signY = 2.5;
      } else {
        // Lifeline: rounded blue kiosk with a big medical cross
        add(new THREE.CapsuleGeometry(0.5, 1.1, 6, 16), paint, 0, 1.05, 0);
        const c1 = add(new THREE.BoxGeometry(0.42, 0.12, 0.05), glass, 0, 1.2, 0.5);
        const c2 = add(new THREE.BoxGeometry(0.12, 0.42, 0.05), glass, 0, 1.2, 0.5);
        void c1; void c2;
        add(new THREE.BoxGeometry(0.9, 0.12, 0.7), chrome, 0, 0.06, 0);
        signY = 2.35;
      }
      // Bottles lined up on the machine front
      for (let i = 0; i < 3; i++) {
        const bt = add(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 8), glass, -0.15 + i * 0.15, id === 'bulwark' ? 1.98 : id === 'hammerfall' ? 1.72 : id === 'quickhands' ? 2.5 : 2.2, 0.1);
        void bt;
      }
      const neon = new THREE.MeshBasicMaterial({ map: neonTexture([def.name.split(' ')[0]], hex, `${def.price}`), color: 0x303030 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), neon);
      sign.position.set(0, signY, 0.46);
      root.add(sign);
      const light = new THREE.PointLight(def.color, 0, 4.5, 1.6);
      light.position.set(0, 1.6, 1.0);
      root.add(light);
      this.group.add(root);
      const view: PerkView = { id, root, neon, glass, light, lit: false };
      this.views.push(view);
      watchModel(modelNames[id] ?? `perk_${id}.glb`, (m) => {
        const inst = models.instance(m);
        placeModel(inst, 2.1);
        for (const c of [...root.children]) if (c !== light && c !== sign) c.visible = false;
        root.add(inst);
      });
    }
  }

  update(time: number, power: boolean): void {
    for (const v of this.views) {
      const on = power || !PERKS[v.id].needsPower;
      const flick = on && Math.sin(time * 13 + v.id.length) > 0.97 ? 0.4 : 1;
      v.neon.color.setScalar(on ? 1.8 * flick : 0.18);
      v.glass.emissiveIntensity = on ? 1.4 * flick : 0.05;
      v.light.intensity = on ? 7 * flick : 0;
      v.lit = on;
    }
  }

  litNear(x: number, z: number, r: number): PerkId | null {
    for (const v of this.views) if (v.lit && Math.hypot(v.root.position.x - x, v.root.position.z - z) < r) return v.id;
    return null;
  }
}

// ----------------------------------------------------------------------------------------------
// Power switch
// ----------------------------------------------------------------------------------------------
export class PowerSwitchView {
  readonly root = new THREE.Group();
  private lever: THREE.Object3D;
  private lamp: THREE.MeshBasicMaterial;
  private t = 0;
  private on = false;

  constructor(spot: Spot, model = 'power_switch.glb') {
    this.root.position.set(spot.x, spot.y ?? 0, spot.z);
    this.root.rotation.y = spot.face;
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.6, metalness: 0.6 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.35), dark);
    panel.position.set(0, 1.3, 0);
    panel.castShadow = true;
    this.root.add(panel);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 0.37), new THREE.MeshStandardMaterial({ color: 0xc9a227 }));
    stripe.position.set(0, 0.55, 0);
    this.root.add(stripe);
    this.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2010).multiplyScalar(2) });
    const lampM = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), this.lamp);
    lampM.position.set(0.4, 1.9, 0.2);
    this.root.add(lampM);
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.3, 0.2);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), new THREE.MeshStandardMaterial({ color: 0x9a9ea4, metalness: 0.9, roughness: 0.3 }));
    arm.position.y = 0.3;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.4 }));
    knob.position.y = 0.62;
    pivot.add(arm, knob);
    pivot.rotation.x = 0.9;
    this.root.add(pivot);
    this.lever = pivot;
    watchModel(model, (m) => {
      const inst = models.instance(m);
      placeModel(inst, 2.1);
      for (const c of [...this.root.children]) if (c !== lampM) c.visible = false;
      this.root.add(inst);
      this.lever = findNode(inst, 'lever') ?? new THREE.Object3D();
      this.lever.userData.base = this.lever.rotation.x;
    });
  }

  set(on: boolean, instant = false): void {
    this.on = on;
    this.t = instant ? 1 : 0;
    if (!on) this.lever.rotation.x = (this.lever.userData.base as number | undefined) ?? 0.9;
  }

  update(dt: number): void {
    if (this.on && this.t < 1) {
      this.t = Math.min(1, this.t + dt / 0.6);
      const e = 1 - (1 - this.t) * (1 - this.t);
      const base = (this.lever.userData.base as number | undefined);
      this.lever.rotation.x = base !== undefined ? base - e * 1.8 : 0.9 - e * 1.8;
    }
    this.lamp.color.setHex(this.on ? 0x30ff50 : 0xff2010).multiplyScalar(2);
  }
}

// ----------------------------------------------------------------------------------------------
// Chalk wall-buys
// ----------------------------------------------------------------------------------------------
function chalkTexture(key: WallBuyKey): THREE.CanvasTexture {
  const def = WALL_BUYS[key];
  const w = WEAPONS[def.weapon];
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  const chalk = (x0: number, y0: number, x1: number, y1: number) => {
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = `rgba(235,235,225,${0.35 + Math.random() * 0.35})`;
      g.lineWidth = 4 + Math.random() * 3;
      g.beginPath();
      g.moveTo(x0 + (Math.random() - 0.5) * 3, y0 + (Math.random() - 0.5) * 3);
      g.lineTo(x1 + (Math.random() - 0.5) * 3, y1 + (Math.random() - 0.5) * 3);
      g.stroke();
    }
  };
  const poly = (pts: number[][]) => { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; chalk(a[0], a[1], b[0], b[1]); } };
  const L = w.cls === 'pistol' ? 0.45 : w.cls === 'smg' ? 0.75 : w.cls === 'shotgun' ? 1.05 : 1;
  const ox = 256 - 200 * L, span = 400 * L;
  const X = (f: number) => ox + f * span;
  // Receiver + barrel
  poly([[X(0.25), 80], [X(0.72), 80], [X(0.72), 120], [X(0.25), 120]]);
  poly([[X(0.72), 92], [X(1), 92], [X(1), 104], [X(0.72), 104]]);
  if (w.cls !== 'pistol') poly([[X(0), 90], [X(0.25), 86], [X(0.25), 118], [X(0.02), 140]]); // stock
  poly([[X(0.3), 120], [X(0.38), 120], [X(0.34), 170], [X(0.26), 168]]); // grip
  if (w.cls !== 'shotgun') poly([[X(0.44), 120], [X(0.52), 120], [X(0.54), 175], [X(0.46), 177]]); // magazine
  else poly([[X(0.62), 104], [X(0.84), 104], [X(0.84), 116], [X(0.62), 116]]); // pump
  if (w.cls === 'dmr') poly([[X(0.35), 64], [X(0.62), 64], [X(0.62), 78], [X(0.35), 78]]);
  // Hand-lettered name and price
  g.fillStyle = 'rgba(240,238,228,0.85)';
  g.font = 'bold 44px "Comic Sans MS", "Segoe Print", cursive';
  g.textAlign = 'center';
  g.fillText(w.shortName, 256, 222);
  g.font = 'bold 40px "Comic Sans MS", cursive';
  g.fillText(`${def.price}`, 256, 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChalk(key: WallBuyKey, x: number, y: number, z: number, face: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshBasicMaterial({ map: chalkTexture(key), transparent: true, depthWrite: false, color: 0xd8d8d0 }));
  m.position.set(x, y, z);
  m.rotation.y = face;
  return m;
}

// ----------------------------------------------------------------------------------------------
// Power-up pickups
// ----------------------------------------------------------------------------------------------
function iconTexture(k: PowerUpKind): THREE.CanvasTexture {
  const info = POWERUP_INFO[k];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const hex = '#' + info.color.toString(16).padStart(6, '0');
  g.fillStyle = 'rgba(10,10,10,0.6)';
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hex; g.lineWidth = 6; g.shadowColor = hex; g.shadowBlur = 14;
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff';
  g.font = `bold ${info.icon.length > 1 ? 50 : 64}px Georgia, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(info.icon, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const iconCache = new Map<PowerUpKind, THREE.Texture>();

export interface PickupView { kind: PowerUpKind; root: THREE.Group; x: number; z: number; y: number; age: number }

export function buildPickup(kind: PowerUpKind, x: number, y: number, z: number): PickupView {
  let tex = iconCache.get(kind);
  if (!tex) { tex = iconTexture(kind); iconCache.set(kind, tex); }
  const root = new THREE.Group();
  root.position.set(x, y + 1, z);
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  icon.scale.set(0.7, 0.7, 1);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: POWERUP_INFO[kind].color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(1.9, 1.9, 1);
  const light = new THREE.PointLight(POWERUP_INFO[kind].color, 6, 4, 1.5);
  root.add(glow, icon, light);
  return { kind, root, x, z, y, age: 0 };
}

export function updatePickup(p: PickupView, dt: number, time: number): void {
  p.age += dt;
  p.root.position.y = p.y + 1 + Math.sin(time * 2.5 + p.x) * 0.12;
  p.root.rotation.y += dt;
  p.root.visible = pickupVisible(p.age, time);
}
