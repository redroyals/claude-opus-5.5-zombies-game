// First-person weapon + gloved hands, rendered in an overlay scene so it never clips into walls.
// All animation is procedural: bob, sway, ADS alignment, recoil springs, reloads, switching, plates.
import * as THREE from 'three';
import { WEAPONS, weaponArch, type WeaponDef, type WeaponId } from '../config';
import { models, findNode } from '../render/ModelRegistry';
import type { TextureLib } from '../render/textures';
import type { ReloadPhase } from './WeaponState';
import { viewmodelFit } from './vmfit';

interface WeaponModel {
  id: WeaponId;
  root: THREE.Group;
  mag: THREE.Object3D;
  magHome: THREE.Vector3;
  mover: THREE.Object3D; // slide / pump / charging handle
  moverHome: THREE.Vector3;
  muzzle: THREE.Object3D;
  sight: THREE.Vector3;
  adsDist: number;
  hip: THREE.Vector3;
  leftHand: THREE.Group;
  leftHome: THREE.Vector3;
  leftHomeRot: THREE.Euler;
  flash: THREE.Sprite;
  accents: THREE.MeshStandardMaterial;
  body: THREE.MeshStandardMaterial;
  shell?: THREE.Object3D;
  /** Emissive parts that pulse (wonder weapons). */
  glow?: THREE.MeshStandardMaterial;
  /** GLB replacing the procedural gun body (hands stay procedural). */
  glb?: THREE.Object3D;
  tier?: number;
}

/** Optional per-weapon placement data from public/models/weapons/frames.json (all in viewmodel metres, gun forward = -Z). */
interface FrameData { scale?: number; position?: number[]; rotation?: number[]; muzzle?: number[]; sight?: number[]; length?: number; mounts?: Record<string, number[]>; vm?: { scale?: number; hip?: number[] } }

export interface ViewState {
  id: WeaponId;
  tier: number;
  adsT: number;
  speed: number;
  sprinting: boolean;
  grounded: boolean;
  crouched: boolean;
  bobPhase: number;
  lookDX: number;
  lookDY: number;
  reloadPhase: ReloadPhase;
  reloadP: number; // magazine reload progress 0..1
  shellT: number; // shell reload local timer
  shellPer: number;
  switchT: number; // 0 = fully up, 1 = fully lowered
  plateT: number; // 0..1 plate application progress (0 = none)
  sinceShot: number;
  reducedMotion: boolean;
  jumpOffset: number;
}

const TIER_COLORS = [
  { accent: 0x2a2c2e, emissive: 0x000000, ei: 0, body: 0x4a4e52 },
  { accent: 0x1c5a8a, emissive: 0x2aa8ff, ei: 1.6, body: 0x3a4a5c },
  { accent: 0x8a3a1c, emissive: 0xff5a1a, ei: 2.2, body: 0x4a3432 },
];

export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private rig = new THREE.Group();
  private models = new Map<WeaponId, WeaponModel>();
  private current: WeaponModel | null = null;
  private plate: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  // Springs
  private kick = 0;
  private kickV = 0;
  private kickRot = 0;
  private kickRotV = 0;
  private swayX = 0;
  private swayY = 0;
  private tiltZ = 0;
  private gloveMat: THREE.MeshStandardMaterial;
  private sleeveMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private metal: THREE.MeshStandardMaterial;
  private polymer: THREE.MeshStandardMaterial;
  private wood: THREE.MeshStandardMaterial;
  private tex: TextureLib;
  private tmp = new THREE.Vector3();
  private knife: THREE.Group;
  private knifeT = 0;
  private camoTex: THREE.CanvasTexture;
  private time = 0;
  private frames: Record<string, FrameData> = {};

  constructor(tex: TextureLib) {
    this.tex = tex;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.camera.add(this.rig);
    // Lighting that roughly matches the blue-hour world.
    this.scene.add(new THREE.HemisphereLight(0x9fb3d4, 0x3a3632, 2.0));
    const key = new THREE.DirectionalLight(0xc8d6f0, 2.2);
    key.position.set(-1, 2, 1);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffb070, 0.6);
    rim.position.set(2, 0.5, -1);
    this.scene.add(rim);
    this.flashLight = new THREE.PointLight(0xffb45a, 0, 2, 1.5);
    this.camera.add(this.flashLight);
    this.flashLight.position.set(0.1, -0.05, -0.7);

    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x4a4a42, roughness: 0.85, map: tex.grime });
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: 0x6f7850, roughness: 0.95, map: tex.grime });
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0x9b7a62, roughness: 0.7 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x6a6e72, roughness: 0.38, metalness: 0.7, map: tex.grime });
    this.polymer = new THREE.MeshStandardMaterial({ color: 0x34373a, roughness: 0.7, metalness: 0.1, map: tex.grime });
    this.wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.6, map: tex.wood.map });

    this.camoTex = this.buildCamo();
    for (const id of ['rifle', 'pistol', 'shotgun'] as WeaponId[]) this.ensure(id);
    this.knife = this.buildKnife();
    this.camera.add(this.knife);
    void models.json<{ weapons?: Record<string, FrameData> }>('weapons/frames.json').then((f) => { if (f?.weapons) this.frames = f.weapons; });

    this.plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.025), new THREE.MeshStandardMaterial({ color: 0x3d4238, roughness: 0.6, metalness: 0.4, map: tex.grime }));
    this.plate.visible = false;
    this.camera.add(this.plate);
    this.traverseNoCull();
  }

  /** Build (once) the viewmodel for any weapon id: procedural from its archetype, upgraded to a GLB if one exists. */
  private ensure(id: WeaponId): WeaponModel {
    let m = this.models.get(id);
    if (m) return m;
    const def = WEAPONS[id];
    const arch = weaponArch(id);
    m = arch === 'pistol' ? this.buildPistol() : arch === 'shotgun' ? this.buildShotgun() : this.buildRifle(def);
    m.id = id;
    this.models.set(id, m);
    if (def.tint !== undefined) m.body.color.setHex(def.tint);
    m.root.visible = false;
    this.rig.add(m.root);
    m.root.traverse((o) => { o.frustumCulled = false; });
    this.setTier(id, 0);
    const mid = def.modelId ?? id;
    const model = m;
    models.whenAvailable(`weapons/${mid}.glb`, (lm) => this.attachGlb(model, models.instance(lm), mid));
    return m;
  }

  /**
   * Replace the procedural gun body with a GLB, keeping procedural gloved hands and animation anchors.
   * Convention (public/models/weapons/frames.json): metres, barrel along -Z, origin = grip hand point, with
   * mount_muzzle / mount_optic / mount_under / mount_mag empties. Unknown GLBs fall back to a bbox fit.
   */
  private attachGlb(m: WeaponModel, obj: THREE.Object3D, mid: string): void {
    const f = this.frames[mid] ?? {};
    const holder = new THREE.Group();
    holder.add(obj);
    const grip = findNode(obj, 'socket_grip');
    const arch = weaponArch(m.id);
    // Right-hand grip point on the procedural rig (the glove wraps around this).
    const gripAt = arch === 'pistol' ? new THREE.Vector3(0, -0.035, 0.03) : arch === 'shotgun' ? new THREE.Vector3(0, -0.02, 0.085) : new THREE.Vector3(0, -0.025, 0.045);
    const fit = f.length ? viewmodelFit(f, WEAPONS[m.id].cls ?? (arch === 'pistol' ? 'pistol' : arch === 'shotgun' ? 'shotgun' : 'ar'), mid) : null;
    if (grip || f.length) {
      holder.position.copy(gripAt);
      obj.scale.setScalar(fit ? fit.scale : f.scale ?? 1);
      if (fit) m.hip.set(fit.hip[0], fit.hip[1], fit.hip[2]);
    } else {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      if (size.x > size.z) obj.rotation.y = Math.PI / 2;
      const procLen = arch === 'pistol' ? 0.22 : arch === 'shotgun' ? 1.1 : 0.95 * (WEAPONS[m.id].lengthScale ?? 1);
      obj.scale.multiplyScalar(f.scale ?? procLen / Math.max(size.x, size.z, 1e-4));
      obj.updateMatrixWorld(true);
      const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      obj.position.sub(c);
      obj.position.z += arch === 'pistol' ? -0.05 : -0.2;
    }
    if (f.position) holder.position.fromArray(f.position);
    if (f.rotation) holder.rotation.set(f.rotation[0] ?? 0, f.rotation[1] ?? 0, f.rotation[2] ?? 0);
    // Hide procedural gun meshes but keep the gloved hands (which may be nested under the pump, etc.).
    m.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let p: THREE.Object3D | null = o;
      while (p && p !== m.root) { if (p.userData.hand) return; p = p.parent; }
      mesh.visible = false;
    });
    m.root.add(holder);
    holder.traverse((o) => {
      o.frustumCulled = false;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = false; mesh.receiveShadow = false; }
    });
    m.root.updateMatrixWorld(true);
    const local = (n: THREE.Object3D) => m.root.worldToLocal(n.getWorldPosition(new THREE.Vector3()));
    const mz = findNode(obj, 'mount_muzzle') ?? findNode(obj, 'muzzle');
    if (f.muzzle) m.muzzle.position.fromArray(f.muzzle);
    else if (mz) m.muzzle.position.copy(local(mz));
    else { const bb = new THREE.Box3().setFromObject(holder); m.muzzle.position.set(0, (bb.max.y + bb.min.y) / 2, m.root.worldToLocal(new THREE.Vector3(0, 0, bb.min.z)).z); }
    // Iron-sight line: just above the top rail so ADS looks down the gun.
    const optic = findNode(obj, 'mount_optic');
    if (f.sight) m.sight.fromArray(f.sight);
    else if (optic) { const o = local(optic); m.sight.set(0, o.y + (arch === 'pistol' ? 0.012 : 0.025), o.z + 0.1); }
    if (fit) m.sight.y += fit.adsLift;
    // Support hand under the handguard / on the pump.
    const under = findNode(obj, 'mount_under');
    if (under && arch !== 'pistol') {
      const u = local(under);
      const target = new THREE.Vector3(0, u.y - 0.055, fit?.support ? holder.position.z + fit.support[2] : u.z + 0.05);
      if (m.leftHand.parent === m.root) {
        m.leftHand.position.copy(target);
        m.leftHome.copy(target);
      } else if (m.leftHand.parent === m.mover) {
        // Hand rides on the pump: move the pump so the hand lands on the handguard.
        m.mover.position.copy(target).sub(m.leftHand.position);
        m.moverHome.copy(m.mover.position);
      }
    }
    // Authored GLB materials are tuned for daylight; keep metals from going black in dark interiors.
    holder.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((mt) => {
        const sm = mt as THREE.MeshStandardMaterial;
        if (!sm.isMeshStandardMaterial) return mt;
        const c = sm.clone();
        c.metalness = Math.min(c.metalness, 0.55);
        c.roughness = Math.max(c.roughness, 0.32);
        c.envMapIntensity = 1.3;
        return c;
      }) as unknown as THREE.Material;
      if (mats.length === 1) mesh.material = (mesh.material as unknown as THREE.Material[])[0];
    });
    const mag = findNode(obj, 'mount_mag');
    if (mag) { const g = local(mag); m.magHome.set(g.x, g.y + 0.02, g.z); m.mag.position.copy(m.magHome); }
    m.glb = holder;
    if (m.tier) this.setTier(m.id, m.tier);
  }

  private buildCamo(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#101018';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 70; i++) {
      const hue = 260 + Math.random() * 80;
      g.fillStyle = `hsla(${hue % 360}, 90%, ${35 + Math.random() * 35}%, 0.8)`;
      g.beginPath();
      g.ellipse(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 14, 3 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 25; i++) {
      g.strokeStyle = 'rgba(120,220,255,0.7)';
      g.lineWidth = 1;
      g.beginPath();
      let x = Math.random() * 128, y = Math.random() * 128;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }

  private buildKnife(): THREE.Group {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.2), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.25 }));
    blade.position.z = -0.14;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), blade.material);
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.26;
    tip.scale.set(0.35, 1, 1);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.012), this.metal);
    guard.position.z = -0.035;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.1, 8), this.polymer);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.02;
    g.add(blade, tip, guard, grip);
    const hand = this.hand(g, new THREE.Vector3(0, -0.01, 0.02), new THREE.Vector3(0.1, -0.2, 0.36), 1, 'pistol');
    hand.userData.hand = true;
    g.visible = false;
    g.traverse((o) => { o.frustumCulled = false; });
    models.whenAvailable('weapons/sp_knife.glb', (lm) => {
      const inst = models.instance(lm);
      for (const c of [blade, tip, guard, grip]) c.visible = false;
      inst.position.set(0, 0, 0.02);
      inst.traverse((o) => { o.frustumCulled = false; });
      g.add(inst);
    });
    return g;
  }

  /** Melee: play the knife slash for `dur` seconds. */
  melee(dur = 0.45): void {
    this.knifeT = dur;
    this.knife.userData.dur = dur;
  }

  get meleeActive(): boolean { return this.knifeT > 0; }

  private traverseNoCull(): void {
    this.scene.traverse((o) => { o.frustumCulled = false; });
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // --------------------------------------------------------------------------------------------
  // Model construction helpers
  // --------------------------------------------------------------------------------------------
  private box(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  private cyl(parent: THREE.Object3D, mat: THREE.Material, r: number, len: number, x: number, y: number, z: number, seg = 12, r2 = r): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, seg), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** Gloved hand gripping around the given point, with forearm extending toward `elbow`. */
  private hand(parent: THREE.Object3D, at: THREE.Vector3, elbow: THREE.Vector3, side: 1 | -1, grip: 'vertical' | 'under' | 'pistol'): THREE.Group {
    const g = new THREE.Group();
    g.userData.hand = true;
    g.position.copy(at);
    parent.add(g);
    // Palm
    this.box(g, this.gloveMat, 0.05, 0.075, 0.085, side * 0.028, -0.005, 0.0);
    // Fingers wrapping around the grip (four segments)
    for (let i = 0; i < 4; i++) {
      const y = grip === 'under' ? -0.02 : 0.025 - i * 0.021;
      const z = grip === 'under' ? -0.03 + i * 0.021 : -0.03;
      const f = this.box(g, this.gloveMat, 0.056, 0.018, 0.02, -side * 0.006, y, z);
      if (grip === 'under') { f.position.y = -0.03; f.position.x = -side * 0.018; f.rotation.z = side * 0.4; }
    }
    // Knuckle pads
    this.box(g, this.polymer, 0.02, 0.07, 0.03, side * 0.05, 0.0, -0.02);
    // Thumb
    const th = this.box(g, this.gloveMat, 0.018, 0.018, 0.06, -side * 0.02, 0.035, -0.02, 0.2, side * 0.3, 0);
    if (grip === 'pistol') th.position.set(-side * 0.03, 0.03, -0.02);
    // Cuff + forearm
    const wrist = new THREE.Vector3(side * 0.035, -0.02, 0.05);
    const dir = elbow.clone().sub(at).sub(wrist);
    const len = dir.length();
    const arm = new THREE.Group();
    arm.position.copy(wrist);
    g.add(arm);
    // Align the forearm's +Z with the direction toward the elbow.
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.05, 10), this.gloveMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.02;
    arm.add(cuff);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.05, len, 10), this.sleeveMat);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = len / 2 + 0.03;
    arm.add(fore);
    // Rolled sleeve band + watch on the left wrist for character
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 10), this.sleeveMat);
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.09;
    arm.add(band);
    if (side < 0) {
      const watch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03), this.polymer);
      watch.position.set(0, 0.04, 0.05);
      arm.add(watch);
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.002, 0.016), new THREE.MeshBasicMaterial({ color: 0x1a6a3a }));
      face.position.set(0, 0.047, 0.05);
      arm.add(face);
    }
    void this.skinMat;
    return g;
  }

  private flashSprite(parent: THREE.Object3D): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.flash, color: 0xffd8a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.set(0.2, 0.2, 1);
    s.visible = false;
    parent.add(s);
    return s;
  }

  private tierMats(): { accents: THREE.MeshStandardMaterial; body: THREE.MeshStandardMaterial } {
    return {
      accents: new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.4, metalness: 0.6 }),
      body: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.5, map: this.tex.grime }),
    };
  }

  private buildRifle(def: WeaponDef = WEAPONS.rifle): WeaponModel {
    const root = new THREE.Group();
    const { accents, body } = this.tierMats();
    const L = def.lengthScale ?? 1;
    const cls = def.cls ?? 'ar';
    const fz = (z: number) => (z < -0.2 ? -0.2 + (z + 0.2) * L : z); // stretch everything ahead of the receiver
    const scoped = cls === 'sniper' || cls === 'dmr';
    // Receiver & upper
    this.box(root, body, 0.058, 0.07, 0.3, 0, 0.02, -0.07);
    this.box(root, body, 0.052, 0.035, 0.34, 0, 0.068, -0.09);
    this.box(root, this.metal, 0.03, 0.012, 0.36, 0, 0.09, -0.1); // top rail
    for (let i = 0; i < 12; i++) this.box(root, this.metal, 0.034, 0.006, 0.012, 0, 0.098, -0.26 + i * 0.03);
    this.box(root, this.metal, 0.004, 0.022, 0.05, 0.03, 0.045, -0.04); // ejection port
    this.box(root, this.metal, 0.02, 0.012, 0.03, 0.03, 0.07, 0.05); // charging handle
    // Handguard with vents
    this.box(root, this.polymer, 0.064, 0.066, 0.3 * L, 0, 0.035, fz(-0.4));
    for (let i = 0; i < 5; i++) {
      this.box(root, accents, 0.066, 0.012, 0.035, 0, 0.035, fz(-0.3 - i * 0.05));
    }
    this.box(root, this.metal, 0.028, 0.01, 0.28 * L, 0, 0.073, fz(-0.4));
    // Barrel + muzzle device
    this.cyl(root, this.metal, 0.012, 0.2 * L, 0, 0.035, fz(-0.62));
    this.cyl(root, this.metal, 0.02, 0.075, 0, 0.035, fz(-0.745), 8);
    for (let i = 0; i < 3; i++) this.box(root, this.polymer, 0.042, 0.004, 0.008, 0, 0.035, fz(-0.73 - i * 0.015));
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.035, fz(-0.8)); root.add(muzzle);
    // Magazine (curved: two segments)
    const mag = new THREE.Group(); mag.position.set(0, -0.02, -0.12); root.add(mag);
    this.box(mag, this.polymer, 0.032, 0.1, 0.07, 0, -0.05, 0, 0.12);
    this.box(mag, this.polymer, 0.032, 0.08, 0.066, 0, -0.13, 0.018, 0.32);
    this.box(mag, accents, 0.034, 0.012, 0.072, 0, -0.17, 0.03, 0.32);
    this.box(root, body, 0.05, 0.03, 0.09, 0, -0.01, -0.12); // mag well
    // Pistol grip + trigger guard
    this.box(root, this.polymer, 0.034, 0.11, 0.045, 0, -0.05, 0.035, -0.32);
    this.box(root, this.metal, 0.008, 0.004, 0.06, 0, -0.03, -0.02);
    // Stock
    this.box(root, this.polymer, 0.04, 0.05, 0.16, 0, 0.03, 0.16);
    this.box(root, this.polymer, 0.046, 0.075, 0.1, 0, 0.018, 0.27);
    this.box(root, this.gloveMat, 0.05, 0.115, 0.025, 0, 0.01, 0.33);
    // Red dot optic (scoped classes get a long scope from classExtras instead)
    const optic = new THREE.Group(); root.add(optic); optic.visible = !scoped;
    this.box(optic, this.metal, 0.03, 0.018, 0.05, 0, 0.105, -0.07);
    // Open-ended housing so the shooter can see through it when aiming.
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.06, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }));
    housing.rotation.x = Math.PI / 2;
    housing.position.set(0, 0.13, -0.07);
    optic.add(housing);
    for (const z of [-0.1, -0.04]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 20), this.metal);
      ring.position.set(0, 0.13, z);
      optic.add(ring);
    }
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), new THREE.MeshStandardMaterial({ color: 0x5a8a7a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.12, depthWrite: false }));
    lens.position.set(0, 0.13, -0.1);
    optic.add(lens);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) }));
    dot.position.set(0, 0.13, -0.104);
    optic.add(dot);
    // Vertical foregrip
    if (cls !== 'lmg') this.box(root, this.polymer, 0.03, 0.075, 0.035, 0, -0.03, fz(-0.42));
    // Charging-handle "mover" used for reload rack
    const mover = this.box(root, this.metal, 0.024, 0.012, 0.02, -0.03, 0.07, 0.04);
    // Hands
    this.hand(root, new THREE.Vector3(0.0, -0.045, 0.045), new THREE.Vector3(0.14, -0.2, 0.38), 1, 'pistol');
    const left = this.hand(root, new THREE.Vector3(0.0, -0.035, fz(-0.42)), new THREE.Vector3(-0.17, -0.22, -0.08), -1, 'vertical');
    const glow = this.classExtras(root, def, fz, mag, muzzle);
    const sightY = scoped ? 0.155 : 0.13;
    return {
      id: def.id, root, mag, magHome: mag.position.clone(), mover, moverHome: mover.position.clone(), muzzle,
      sight: new THREE.Vector3(0, sightY, -0.03), adsDist: scoped ? 0.22 : 0.3, hip: new THREE.Vector3(0.13, -0.165, -0.44),
      leftHand: left, leftHome: left.position.clone(), leftHomeRot: left.rotation.clone(), flash: this.flashSprite(muzzle), accents, body, glow,
    };
  }

  private buildPistol(): WeaponModel {
    const root = new THREE.Group();
    const { accents, body } = this.tierMats();
    const slide = new THREE.Group(); root.add(slide);
    this.box(slide, body, 0.03, 0.034, 0.19, 0, 0.035, -0.06);
    for (let i = 0; i < 6; i++) this.box(slide, this.metal, 0.032, 0.026, 0.004, 0, 0.035, 0.0 + i * 0.008);
    this.box(slide, this.metal, 0.006, 0.01, 0.006, 0, 0.056, -0.145); // front sight
    this.box(slide, this.metal, 0.024, 0.01, 0.006, 0, 0.056, 0.02); // rear sight
    this.box(slide, new THREE.MeshBasicMaterial({ color: 0x9aff9a }), 0.003, 0.003, 0.002, 0, 0.058, -0.149);
    this.box(slide, accents, 0.031, 0.006, 0.12, 0, 0.051, -0.07);
    this.box(root, this.polymer, 0.028, 0.024, 0.16, 0, 0.008, -0.05); // frame
    this.box(root, this.metal, 0.024, 0.004, 0.05, 0, -0.012, -0.03); // trigger guard
    this.box(root, this.polymer, 0.03, 0.115, 0.048, 0, -0.05, 0.02, -0.25); // grip
    this.cyl(root, this.metal, 0.009, 0.02, 0, 0.035, -0.158);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.035, -0.17); root.add(muzzle);
    const mag = new THREE.Group(); mag.position.set(0, -0.06, 0.03); mag.rotation.x = -0.25; root.add(mag);
    this.box(mag, this.metal, 0.024, 0.1, 0.036, 0, -0.02, 0);
    this.box(mag, accents, 0.028, 0.012, 0.042, 0, -0.07, 0);
    this.hand(root, new THREE.Vector3(0.0, -0.05, 0.03), new THREE.Vector3(0.12, -0.22, 0.34), 1, 'pistol');
    const left = this.hand(root, new THREE.Vector3(-0.022, -0.065, 0.02), new THREE.Vector3(-0.15, -0.24, 0.3), -1, 'under');
    return {
      id: 'pistol', root, mag, magHome: mag.position.clone(), mover: slide, moverHome: slide.position.clone(), muzzle,
      sight: new THREE.Vector3(0, 0.058, 0.03), adsDist: 0.44, hip: new THREE.Vector3(0.11, -0.13, -0.47),
      leftHand: left, leftHome: left.position.clone(), leftHomeRot: left.rotation.clone(), flash: this.flashSprite(muzzle), accents, body,
    };
  }

  private buildShotgun(): WeaponModel {
    const root = new THREE.Group();
    const { accents, body } = this.tierMats();
    this.box(root, body, 0.056, 0.08, 0.26, 0, 0.02, -0.06);
    this.box(root, this.metal, 0.004, 0.03, 0.08, 0.029, 0.03, -0.06); // ejection port
    this.cyl(root, this.metal, 0.015, 0.56, 0, 0.045, -0.47);
    this.cyl(root, this.metal, 0.015, 0.46, 0, 0.012, -0.42);
    this.cyl(root, this.metal, 0.018, 0.03, 0, 0.012, -0.66);
    this.box(root, this.metal, 0.012, 0.012, 0.44, 0, 0.068, -0.4); // vent rib
    this.box(root, new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), 0.005, 0.005, 0.005, 0, 0.078, -0.74); // bead
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.045, -0.76); root.add(muzzle);
    // Pump
    const pump = new THREE.Group(); pump.position.set(0, 0.012, -0.36); root.add(pump);
    this.cyl(pump, this.wood, 0.032, 0.17, 0, 0, 0, 12, 0.03);
    for (let i = 0; i < 5; i++) this.cyl(pump, accents, 0.0335, 0.008, 0, 0, -0.06 + i * 0.03, 12);
    // Stock + grip
    this.box(root, this.wood, 0.036, 0.1, 0.05, 0, -0.04, 0.09, -0.4);
    this.box(root, this.wood, 0.044, 0.07, 0.2, 0, 0.0, 0.2, 0.1);
    this.box(root, this.wood, 0.048, 0.12, 0.08, 0, -0.02, 0.33, 0.1);
    this.box(root, this.gloveMat, 0.05, 0.13, 0.025, 0, -0.03, 0.38, 0.1);
    this.box(root, this.metal, 0.008, 0.004, 0.07, 0, -0.025, 0.0);
    // Side shell carrier
    for (let i = 0; i < 4; i++) {
      const sh = this.cyl(root, new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5 }), 0.008, 0.045, -0.034, 0.0 + i * 0.018, -0.07, 8);
      sh.rotation.set(0, 0, Math.PI / 2);
    }
    const mag = new THREE.Object3D(); root.add(mag); // shotgun has no detachable magazine
    const shell = new THREE.Group();
    this.cyl(shell, new THREE.MeshStandardMaterial({ color: 0x9a1a14, roughness: 0.5 }), 0.01, 0.055, 0, 0, 0, 8);
    this.cyl(shell, new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.8, roughness: 0.3 }), 0.0105, 0.012, 0, 0, 0.03, 8);
    this.hand(root, new THREE.Vector3(0.0, -0.04, 0.085), new THREE.Vector3(0.14, -0.21, 0.4), 1, 'pistol');
    const left = this.hand(pump, new THREE.Vector3(0, -0.025, 0), new THREE.Vector3(-0.17, -0.22, 0.28), -1, 'under');
    left.add(shell);
    shell.position.set(0.0, 0.04, -0.03);
    shell.visible = false;
    return {
      id: 'shotgun', root, mag, magHome: mag.position.clone(), mover: pump, moverHome: pump.position.clone(), muzzle,
      sight: new THREE.Vector3(0, 0.078, 0.0), adsDist: 0.26, hip: new THREE.Vector3(0.13, -0.165, -0.42),
      leftHand: left, leftHome: left.position.clone(), leftHomeRot: left.rotation.clone(), flash: this.flashSprite(muzzle), accents, body, shell,
    };
  }


  /** Class/wonder-weapon silhouette details on top of the rifle archetype. Returns a pulsing emissive material if any. */
  private classExtras(root: THREE.Group, def: WeaponDef, fz: (z: number) => number, mag: THREE.Group, muzzle: THREE.Object3D): THREE.MeshStandardMaterial | undefined {
    const cls = def.cls ?? 'ar';
    if (cls === 'smg') {
      mag.scale.set(0.9, 0.75, 0.9);
    }
    if (cls === 'lmg') {
      this.box(mag, this.polymer, 0.09, 0.11, 0.11, -0.02, -0.06, 0.0); // box magazine
      this.box(root, this.metal, 0.015, 0.2, 0.015, 0.03, -0.08, fz(-0.6), 0.5, 0, 0.3); // bipod legs (folded)
      this.box(root, this.metal, 0.015, 0.2, 0.015, -0.03, -0.08, fz(-0.6), 0.5, 0, -0.3);
    }
    if (cls === 'sniper' || cls === 'dmr') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.26, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.155, -0.07);
      root.add(scope);
      for (const z of [-0.2, 0.06]) this.cyl(root, this.metal, 0.028, 0.03, 0, 0.155, z, 16);
      this.box(root, this.metal, 0.02, 0.03, 0.03, 0, 0.125, -0.12);
      this.box(root, this.metal, 0.02, 0.03, 0.03, 0, 0.125, 0.0);
      const reticle = new THREE.Mesh(new THREE.RingGeometry(0.0006, 0.0012, 12), new THREE.MeshBasicMaterial({ color: 0x101010 }));
      reticle.position.set(0, 0.155, -0.19);
      root.add(reticle);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.0005), new THREE.MeshBasicMaterial({ color: 0x101010 }));
      bar.position.copy(reticle.position);
      const bar2 = bar.clone(); bar2.rotation.z = Math.PI / 2;
      root.add(bar, bar2);
    }
    if (cls === 'launcher') {
      mag.visible = false;
      this.cyl(root, this.olive(), 0.045, 0.62 * (def.lengthScale ?? 1), 0, 0.09, fz(-0.3), 14);
      this.cyl(root, this.metal, 0.05, 0.04, 0, 0.09, fz(-0.62), 14);
      const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x5a6a3a, roughness: 0.6 }));
      warhead.rotation.x = -Math.PI / 2;
      warhead.position.set(0, 0.09, fz(-0.68));
      root.add(warhead);
      muzzle.position.set(0, 0.09, fz(-0.72));
    }
    if (cls === 'wonder') {
      const col = def.special === 'arc' ? 0x40a0ff : def.special === 'singularity' ? 0xa040ff : 0x80e0ff;
      const glow = new THREE.MeshStandardMaterial({ color: 0x101018, emissive: col, emissiveIntensity: 2.5, roughness: 0.3, metalness: 0.5 });
      if (def.special === 'arc') {
        for (let i = 0; i < 5; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), glow);
          ring.position.set(0, 0.035, fz(-0.36 - i * 0.07));
          root.add(ring);
        }
        this.cyl(root, glow, 0.008, 0.4, 0, 0.035, fz(-0.52), 8);
      } else if (def.special === 'singularity') {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), glow);
        orb.position.set(0, 0.05, fz(-0.62));
        root.add(orb);
        for (let i = 0; i < 4; i++) {
          const prong = this.box(root, this.metal, 0.008, 0.008, 0.14, Math.cos(i * Math.PI / 2) * 0.05, 0.05 + Math.sin(i * Math.PI / 2) * 0.05, fz(-0.6));
          prong.rotation.set(0, 0, i * Math.PI / 2);
        }
        muzzle.position.set(0, 0.05, fz(-0.7));
      } else {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 14), glow);
        tank.position.set(0, -0.06, -0.2);
        root.add(tank);
        this.cyl(root, this.metal, 0.03, 0.12, 0, 0.035, fz(-0.72), 10, 0.045);
      }
      return glow;
    }
    return undefined;
  }

  private oliveMat: THREE.MeshStandardMaterial | null = null;
  private olive(): THREE.MeshStandardMaterial {
    return (this.oliveMat ??= new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.75, map: this.tex.grime }));
  }
  // --------------------------------------------------------------------------------------------
  setWeapon(id: WeaponId | null): void {
    if (id) this.ensure(id);
    for (const m of this.models.values()) m.root.visible = false;
    this.current = id ? this.models.get(id)! : null;
    if (this.current) this.current.root.visible = true;
  }

  /** Reforged guns get an animated camo with emissive veins (procedural body and GLB alike). */
  setTier(id: WeaponId, tier: number): void {
    const m = this.ensure(id);
    m.tier = tier;
    const c = TIER_COLORS[Math.min(2, tier)];
    m.accents.color.setHex(c.accent);
    m.accents.emissive.setHex(c.emissive);
    m.accents.emissiveIntensity = c.ei;
    const tint = WEAPONS[id].tint;
    if (tier > 0) {
      m.body.color.setHex(0xffffff);
      m.body.map = this.camoTex;
      m.body.emissiveMap = this.camoTex;
      m.body.emissive.setHex(c.emissive);
      m.body.emissiveIntensity = 0.55;
    } else {
      m.body.color.setHex(tint ?? c.body);
      m.body.map = this.tex.grime;
      m.body.emissiveMap = null;
      m.body.emissive.setHex(0);
      m.body.emissiveIntensity = 0;
    }
    m.body.needsUpdate = true;
    if (m.glb) {
      m.glb.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const orig = (mesh.userData.origMat ??= mesh.material) as THREE.Material;
        if (tier <= 0) { mesh.material = orig; return; }
        const src = orig as THREE.MeshStandardMaterial;
        const mat = src.clone();
        mat.emissive = new THREE.Color(c.emissive);
        mat.emissiveMap = this.camoTex;
        mat.emissiveIntensity = 0.9;
        mat.color = new THREE.Color(0xb0a0d0);
        mesh.material = mat;
        (mesh.userData.camoMats ??= []).push(mat);
      });
    }
  }

  fire(strength: number): void {
    if (!this.current) return;
    this.kickV += 0.9 * strength;
    this.kickRotV += 1.6 * strength;
    const f = this.current.flash;
    f.visible = true;
    f.material.rotation = Math.random() * Math.PI * 2;
    const arch = weaponArch(this.current.id);
    const s = (arch === 'shotgun' ? 0.32 : arch === 'pistol' ? 0.16 : 0.22) * (0.8 + Math.random() * 0.4);
    f.scale.set(s, s, 1);
    this.flashT = 0.045;
    this.flashLight.intensity = 3;
  }

  /** Debug: camera-space positions of the rig, support hand and muzzle, plus the camera FOV. */
  debugInfo(): Record<string, number[] | number | string> {
    const m = this.current;
    if (!m) return {};
    this.camera.updateMatrixWorld(true);
    const cs = (o: THREE.Object3D) => this.camera.worldToLocal(o.getWorldPosition(new THREE.Vector3())).toArray().map((v) => +v.toFixed(3));
    return { id: m.id, fov: this.camera.fov, rig: this.rig.position.toArray().map((v) => +v.toFixed(3)), left: cs(m.leftHand), muzzle: cs(m.muzzle), hip: m.hip.toArray() };
  }

  /** Muzzle position in camera space (used to place world-space tracers). */
  muzzleCameraSpace(out: THREE.Vector3): THREE.Vector3 {
    if (!this.current) return out.set(0.1, -0.1, -0.6);
    this.rig.updateMatrixWorld(true);
    this.current.muzzle.getWorldPosition(out);
    // Camera sits at the origin of its own scene with identity rotation when copying pose; convert explicitly.
    this.camera.worldToLocal(out);
    return out;
  }

  update(dt: number, s: ViewState): void {
    this.time += dt;
    this.camoTex.offset.set(this.time * 0.05, this.time * 0.11);
    const m = this.current;
    if (!m) return;
    if (m.glow) m.glow.emissiveIntensity = 2 + Math.sin(this.time * 7) * 0.8 + (s.sinceShot < 0.15 ? 3 : 0);
    if (m.tier && m.tier > 0) m.body.emissiveIntensity = 0.45 + Math.sin(this.time * 3) * 0.25;
    // Knife slash overrides the gun pose
    if (this.knifeT > 0) {
      this.knifeT = Math.max(0, this.knifeT - dt);
      const dur = (this.knife.userData.dur as number) || 0.45;
      const p = 1 - this.knifeT / dur;
      this.knife.visible = true;
      const sw = Math.sin(Math.min(1, p / 0.55) * Math.PI);
      this.knife.position.set(0.22 - 0.3 * sw, -0.2 + 0.06 * sw, -0.3 - 0.12 * sw);
      this.knife.rotation.set(-0.3 + 0.2 * sw, 0.4 + 0.9 * sw, -0.9 + 1.2 * sw);
      m.root.visible = false;
      if (this.knifeT <= 0) { this.knife.visible = false; m.root.visible = true; }
      return;
    }
    m.root.visible = true;
    // Springs (critically-damped-ish)
    const k = 170, d = 20;
    this.kickV += (-k * this.kick - d * this.kickV) * dt;
    this.kick += this.kickV * dt;
    this.kickRotV += (-k * this.kickRot - d * this.kickRotV) * dt;
    this.kickRot += this.kickRotV * dt;
    const motion = s.reducedMotion ? 0.35 : 1;
    // Sway from look input (lagging)
    const tx = THREE.MathUtils.clamp(-s.lookDX * 0.0009, -0.06, 0.06) * motion;
    const ty = THREE.MathUtils.clamp(-s.lookDY * 0.0009, -0.06, 0.06) * motion;
    this.swayX += (tx - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (ty - this.swayY) * Math.min(1, dt * 8);

    const ads = s.adsT;
    const hip = m.hip;
    const adsPos = this.tmp.set(-m.sight.x, -m.sight.y, -m.sight.z - m.adsDist);
    const pos = new THREE.Vector3().lerpVectors(hip, adsPos, easeInOut(ads));
    const rot = new THREE.Euler(0, 0, 0);
    // Bob
    const bobAmt = Math.min(1, s.speed / 5) * (1 - ads * 0.85) * motion * (s.grounded ? 1 : 0.2);
    const ph = s.bobPhase;
    pos.x += Math.sin(ph) * 0.011 * bobAmt;
    pos.y += -Math.abs(Math.cos(ph)) * 0.011 * bobAmt + s.jumpOffset * 0.02 * motion;
    rot.z += Math.sin(ph) * 0.02 * bobAmt;
    // Idle breathing
    const t = performance.now() / 1000;
    pos.y += Math.sin(t * 1.6) * 0.0022 * (1 - ads * 0.8);
    pos.x += Math.cos(t * 0.8) * 0.0012 * (1 - ads * 0.8);
    // Sprint pose
    const sprintW = s.sprinting ? 1 : 0;
    this.tiltZ += (sprintW - this.tiltZ) * Math.min(1, dt * 9);
    pos.x += -0.04 * this.tiltZ;
    pos.y += -0.05 * this.tiltZ;
    rot.y += 0.75 * this.tiltZ;
    rot.x += -0.25 * this.tiltZ;
    rot.z += 0.2 * this.tiltZ;
    if (s.crouched) { pos.y -= 0.006; rot.z -= 0.04 * (1 - ads); }
    // Sway
    rot.y += this.swayX * (1 - ads * 0.6);
    rot.x += this.swayY * (1 - ads * 0.6);
    pos.x += this.swayX * 0.12 * (1 - ads * 0.7);
    // Recoil
    pos.z += this.kick * 0.045 * (1 - ads * 0.4);
    rot.x += this.kickRot * 0.06 * (1 - ads * 0.5);
    pos.y += this.kickRot * 0.004;

    // Reset animated parts
    m.mag.position.copy(m.magHome);
    m.mag.visible = true;
    m.mover.position.copy(m.moverHome);
    m.leftHand.position.copy(m.leftHome);
    m.leftHand.rotation.copy(m.leftHomeRot);
    if (m.shell) m.shell.visible = false;

    // Magazine reload timeline
    if (s.reloadPhase === 'mag') {
      const p = s.reloadP;
      const inW = smooth(p, 0, 0.15) * (1 - smooth(p, 0.85, 1));
      rot.z += 0.55 * inW;
      rot.x += 0.18 * inW;
      pos.y -= 0.02 * inW;
      pos.x -= 0.02 * inW;
      // Mag out
      const out = smooth(p, 0.15, 0.32);
      const back = smooth(p, 0.45, 0.66);
      const magDrop = out * (1 - back);
      m.mag.position.y = m.magHome.y - 0.28 * magDrop;
      m.mag.position.z = m.magHome.z + 0.05 * magDrop;
      m.mag.visible = !(out > 0.95 && back < 0.05);
      // Left hand travels down to fetch a fresh mag and back
      const lh = smooth(p, 0.12, 0.3) * (1 - smooth(p, 0.62, 0.75));
      m.leftHand.position.lerp(new THREE.Vector3(m.magHome.x - 0.02, m.magHome.y - 0.12, m.magHome.z + 0.02), lh);
      m.leftHand.rotation.x += lh * 0.5;
      if (p > 0.66 && p < 0.72) this.kickRotV -= 0.4 * dt * 60; // mag seat bump
      // Rack / slide release
      const rack = smooth(p, 0.72, 0.8) * (1 - smooth(p, 0.8, 0.86));
      m.mover.position.z = m.moverHome.z + (weaponArch(m.id) === 'pistol' ? 0.03 : 0.07) * rack;
    }
    // Shell-by-shell reload
    if (s.reloadPhase === 'shellStart' || s.reloadPhase === 'shellLoop' || s.reloadPhase === 'shellEnd') {
      const w = s.reloadPhase === 'shellStart' ? smooth(s.shellT, 0, s.shellPer * 0.7) : s.reloadPhase === 'shellEnd' ? 1 - smooth(s.shellT, 0, s.shellPer * 0.8) : 1;
      rot.z -= 0.5 * w;
      rot.x += 0.22 * w;
      pos.x -= 0.03 * w;
      pos.y -= 0.01 * w;
      if (s.reloadPhase === 'shellLoop') {
        const lp = (s.shellT / s.shellPer) % 1;
        const push = Math.sin(lp * Math.PI);
        m.leftHand.position.y += -0.06 + 0.04 * push;
        m.leftHand.position.z += 0.24 - 0.03 * push;
        m.leftHand.position.x += 0.02;
        if (m.shell) m.shell.visible = lp < 0.75;
        rot.z -= push * 0.03;
      }
    }
    // Shotgun pump after firing
    if (weaponArch(m.id) === 'shotgun' && WEAPONS[m.id].rpm < 120 && s.sinceShot < 0.7) {
      const pump = smooth(s.sinceShot, 0.28, 0.42) * (1 - smooth(s.sinceShot, 0.46, 0.6));
      m.mover.position.z = m.moverHome.z + 0.09 * pump;
      rot.x -= pump * 0.05;
    }
    // Pistol slide blowback
    if (weaponArch(m.id) === 'pistol' && s.sinceShot < 0.1) {
      m.mover.position.z = m.moverHome.z + 0.03 * (1 - s.sinceShot / 0.1);
    }
    // Weapon switch (lower / raise)
    if (s.switchT > 0) {
      const w = easeInOut(s.switchT);
      pos.y -= 0.28 * w;
      rot.x -= 0.9 * w;
      rot.z += 0.2 * w;
    }
    // Armor plate: lower weapon, bring plate up to chest
    if (s.plateT > 0) {
      const w = smooth(s.plateT, 0, 0.2) * (1 - smooth(s.plateT, 0.85, 1));
      pos.y -= 0.22 * w;
      rot.x -= 0.6 * w;
      this.plate.visible = true;
      const pp = s.plateT;
      const rise = smooth(pp, 0.05, 0.35);
      const slam = smooth(pp, 0.55, 0.7);
      this.plate.position.set(-0.05 + 0.03 * slam, -0.45 + 0.2 * rise - 0.12 * slam, -0.42 + 0.1 * slam);
      this.plate.rotation.set(-0.9 + 0.5 * rise - 0.9 * slam, 0.2, 0.1);
    } else this.plate.visible = false;

    this.rig.position.copy(pos);
    this.rig.rotation.copy(rot);
    // Muzzle flash decay
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { m.flash.visible = false; this.flashLight.intensity = 0; }
    }
  }
}

function smooth(x: number, a: number, b: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
