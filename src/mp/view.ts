// three.js presentation for the MP client: map blockout, masked-operator remote players, first-person
// viewmodel with camo, tracers/explosions/smoke/tags. Reads state only; never simulates.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDef } from '../shared/maps';
import { EF, type EntityState } from '../shared/protocol';
import { MOVE } from '../shared/movement';
import { WEAPON_LIST } from '../data/weapons';
import { camoMaterial, tickCamos } from './camo';
import { CAMO_BY_ID } from '../shared/camos';

const operatorUrl = new URL('../../assets/samples/operator.glb', import.meta.url).href;
const weaponUrls = import.meta.glob('../../assets/weapons/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const TINTS = [0x8a8580, 0x9a7b62, 0x6f7d8c, 0xa39473, 0x6b6f5a, 0x7e7a72, 0x5d6670, 0x4a4f55, 0x3a3d42, 0x55524a];

export interface RemoteView { root: THREE.Group; body: THREE.Object3D; plate: THREE.Sprite | null; team: number; flashT: number }

export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
  private mapGroup = new THREE.Group();
  private remotes = new Map<number, RemoteView>();
  private operatorProto: THREE.Object3D | null = null;
  private viewModel = new THREE.Group();
  private vmWeapon: THREE.Object3D | null = null;
  private vmKey = '';
  private fx: { obj: THREE.Object3D; life: number; max: number; grow?: number }[] = [];
  private tags = new Map<number, THREE.Mesh>();
  private equips = new Map<number, THREE.Mesh>();
  private projs = new Map<number, { mesh: THREE.Mesh; v: THREE.Vector3 }>();
  baseFov = 78;
  adsT = 0;
  recoilKick = 0;

  constructor(canvasParent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasParent.appendChild(this.renderer.domElement);
    this.scene.add(this.mapGroup);
    this.camera.add(this.viewModel);
    this.scene.add(this.camera);
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3228, 1.4);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(40, 80, 25);
    this.scene.add(hemi, sun);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    new GLTFLoader().load(operatorUrl, (g) => {
      const o = g.scene;
      const box = new THREE.Box3().setFromObject(o);
      const h = box.max.y - box.min.y || 1;
      o.scale.setScalar(MOVE.stand / h);
      o.position.y = -box.min.y * (MOVE.stand / h);
      o.rotation.y = Math.PI; // model faces +z; our forward is -z
      this.operatorProto = o;
      for (const [id, r] of this.remotes) { this.remotes.delete(id); this.scene.remove(r.root); }
    }, undefined, () => { /* procedural fallback stays */ });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loadMap(m: MapDef) {
    this.mapGroup.clear();
    this.scene.background = new THREE.Color(m.sky);
    this.scene.fog = new THREE.Fog(m.fog, 40, 160);
    // Merge boxes per tint => ~10 draw calls per map.
    const byTint = new Map<number, THREE.BufferGeometry[]>();
    m.boxes.forEach((b, i) => {
      const g = new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
      g.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      const t = m.tints[i] ?? 0;
      (byTint.get(t) ?? byTint.set(t, []).get(t)!).push(g);
    });
    for (const [t, geoms] of byTint) {
      const mesh = new THREE.Mesh(mergeGeometries(geoms), new THREE.MeshStandardMaterial({ color: TINTS[t % TINTS.length], roughness: 0.9 }));
      this.mapGroup.add(mesh);
    }
    m.flags.forEach((f, i) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
      pole.position.set(f.x, f.y + 1.5, f.z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      flag.position.set(f.x + 0.45, f.y + 2.7, f.z);
      flag.name = `flag${i}`;
      this.mapGroup.add(pole, flag);
    });
  }

  setFlagColors(owners: number[]) {
    owners.forEach((p, i) => {
      const f = this.mapGroup.getObjectByName(`flag${i}`) as THREE.Mesh | undefined;
      if (f) (f.material as THREE.MeshBasicMaterial).color.setHex(p >= 1 ? 0x3aa0ff : p <= -1 ? 0xff5a3a : 0xffffff);
    });
  }

  private makeRemote(team: number, name: string, showPlate: boolean): RemoteView {
    const root = new THREE.Group();
    let body: THREE.Object3D;
    const tint = team === 1 ? 0x2c4f7a : 0x7a3a2c;
    if (this.operatorProto) {
      body = this.operatorProto.clone(true);
    } else {
      // Procedural masked operator: torso, head with visor, legs.
      body = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x3b3f3a, roughness: 0.8 });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 4, 8), mat); torso.position.y = 1.15;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); head.position.y = 1.62;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x224466 })); visor.position.set(0, 1.64, -0.15);
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 8), mat); legs.position.y = 0.45;
      (body as THREE.Group).add(torso, head, visor, legs);
    }
    // Team armband (faction-neutral colour only)
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 16), new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.4 }));
    band.rotation.x = Math.PI / 2; band.position.y = 1.35;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    gun.position.set(0.22, 1.25, -0.35); gun.name = 'gun';
    root.add(body, band, gun);
    let plate: THREE.Sprite | null = null;
    if (showPlate) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 48;
      const x = c.getContext('2d')!;
      x.font = 'bold 28px system-ui'; x.textAlign = 'center'; x.fillStyle = team === 1 ? '#8fc8ff' : '#ff9f8a';
      x.fillText(name, 128, 34);
      plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true, transparent: true }));
      plate.scale.set(1.2, 0.22, 1); plate.position.y = 2.1;
      root.add(plate);
    }
    this.scene.add(root);
    return { root, body, plate, team, flashT: 0 };
  }

  updateRemotes(states: EntityState[], names: Map<number, { name: string; team: number; noPlate: boolean }>, myTeam: number, teams: boolean) {
    const seen = new Set<number>();
    for (const e of states) {
      seen.add(e.id);
      const team = e.flags & EF.team1 ? 1 : 0;
      let r = this.remotes.get(e.id);
      if (!r || r.team !== team) {
        if (r) this.scene.remove(r.root);
        const info = names.get(e.id);
        const friendly = teams && team === myTeam;
        r = this.makeRemote(team, info?.name ?? `#${e.id}`, friendly || !info?.noPlate);
        this.remotes.set(e.id, r);
      }
      const dead = (e.flags & EF.dead) !== 0;
      r.root.position.set(e.x, e.y, e.z);
      r.root.rotation.set(0, e.yaw, dead ? Math.PI / 2 : 0);
      const crouch = e.flags & (EF.crouch | EF.slide) ? MOVE.crouch / MOVE.stand : 1;
      r.body.scale.y = (r.body.userData.baseY ??= r.body.scale.y) * crouch;
      if (e.flags & EF.firing && !dead) this.muzzleFlash(r.root);
    }
    for (const [id, r] of this.remotes) if (!seen.has(id)) { this.scene.remove(r.root); this.remotes.delete(id); }
  }

  private muzzleFlash(root: THREE.Object3D) {
    const g = root.getObjectByName('gun');
    if (!g) return;
    const p = new THREE.Vector3(0, 0, -0.4);
    g.localToWorld(p);
    const s = new THREE.PointLight(0xffc070, 3, 6);
    s.position.copy(p);
    this.addFx(s, 0.05);
  }

  setCamera(x: number, y: number, z: number, yaw: number, pitch: number, eye: number) {
    this.camera.position.set(x, y + eye, z);
    this.camera.rotation.set(pitch + this.recoilKick, yaw, 0, 'YXZ');
  }

  setViewWeapon(weaponIndex: number, camoId: string | undefined) {
    const w = WEAPON_LIST[weaponIndex];
    const key = `${w?.id}:${camoId}`;
    if (key === this.vmKey || !w) return;
    this.vmKey = key;
    if (this.vmWeapon) this.viewModel.remove(this.vmWeapon);
    const camo = camoId ? CAMO_BY_ID[camoId] : undefined;
    const mat = camo ? camoMaterial(camo.pattern, 5) : new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.6 });
    const url = weaponUrls[`../../assets/weapons/${w.id}.glb`];
    const g = new THREE.Group();
    const len = w.cls === 'pistol' ? 0.28 : w.cls === 'sniper' || w.cls === 'marksman' ? 0.95 : w.cls === 'smg' ? 0.5 : w.cls === 'special' ? 0.35 : 0.75;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, len), mat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len * 0.5, 8), mat);
    barrel.rotation.x = Math.PI / 2; barrel.position.z = -len * 0.7;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), mat); grip.position.set(0, -0.1, len * 0.15);
    g.add(receiver, barrel, grip);
    if (url) new GLTFLoader().load(url, (gl) => {
      const box = new THREE.Box3().setFromObject(gl.scene), size = box.getSize(new THREE.Vector3());
      gl.scene.scale.setScalar(len * 1.3 / Math.max(size.x, size.y, size.z, 0.01));
      gl.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && camo) (o as THREE.Mesh).material = mat; });
      g.clear(); g.add(gl.scene);
    });
    g.scale.setScalar(0.55);
    g.position.set(0.18, -0.17, -0.45);
    this.vmWeapon = g;
    this.viewModel.add(g);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe4a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    this.addFx(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true })), 0.06);
  }

  explosion(x: number, y: number, z: number, r: number, kind: string) {
    const color = kind === 'flash' ? 0xffffff : kind === 'smoke' ? 0x999999 : 0xff8a3a;
    const m = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.5, r * 0.4), 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    m.position.set(x, y, z);
    this.addFx(m, 0.4, 2.2);
    const l = new THREE.PointLight(color, 20, r * 3 + 4);
    l.position.set(x, y + 0.5, z);
    this.addFx(l, 0.25);
  }

  smoke(x: number, y: number, z: number, dur: number) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshLambertMaterial({ color: 0xb8b8b8, transparent: true, opacity: 0.85, depthWrite: false }));
      m.position.set(x + (Math.random() - 0.5) * 4, y + 1 + Math.random() * 1.5, z + (Math.random() - 0.5) * 4);
      this.addFx(m, dur);
    }
  }

  addTag(id: number, x: number, y: number, z: number, enemy: boolean) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: enemy ? 0xffd24a : 0x6ad1ff, emissive: enemy ? 0x6a5000 : 0x104a6a }));
    m.position.set(x, y + 0.6, z);
    this.scene.add(m); this.tags.set(id, m);
  }
  removeTag(id: number) { const m = this.tags.get(id); if (m) { this.scene.remove(m); this.tags.delete(id); } }

  addEquip(id: number, x: number, y: number, z: number, yaw: number, enemy: boolean) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, emissive: enemy ? 0xff2020 : 0x20ff60, emissiveIntensity: 0.6 }));
    m.position.set(x, y + 0.1, z); m.rotation.y = yaw;
    if (enemy) (m.material as THREE.MeshStandardMaterial).depthTest = false; // Engineer: visible through walls
    m.renderOrder = enemy ? 10 : 0;
    this.scene.add(m); this.equips.set(id, m);
  }
  removeEquip(id: number) { const m = this.equips.get(id); if (m) { this.scene.remove(m); this.equips.delete(id); } }

  addProjectile(id: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0x334422 }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.projs.set(id, { mesh, v: new THREE.Vector3(vx, vy, vz) });
  }
  removeProjectile(id: number) { const p = this.projs.get(id); if (p) { this.scene.remove(p.mesh); this.projs.delete(id); } }

  private addFx(obj: THREE.Object3D, life: number, grow = 0) { this.scene.add(obj); this.fx.push({ obj, life, max: life, grow }); }

  render(dt: number, ads: number, adsZoom: number) {
    tickCamos(dt);
    for (const p of this.projs.values()) { p.v.y -= 17 * dt; p.mesh.position.addScaledVector(p.v, dt); if (p.mesh.position.y < -5) p.v.set(0, 0, 0); }
    this.fx = this.fx.filter((f) => {
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      const m = (f.obj as THREE.Mesh).material as THREE.Material & { opacity?: number };
      if (m && 'opacity' in m && m.transparent) m.opacity = k * 0.85;
      if (f.grow) f.obj.scale.setScalar(1 + (1 - k) * f.grow);
      if (f.life <= 0) { this.scene.remove(f.obj); return false; }
      return true;
    });
    this.recoilKick *= Math.exp(-dt * 12);
    this.camera.fov = this.baseFov * (1 + (adsZoom - 1) * ads);
    this.camera.updateProjectionMatrix();
    if (this.vmWeapon) { this.vmWeapon.position.x = 0.18 * (1 - ads); this.vmWeapon.position.y = -0.17 + 0.08 * ads; this.vmWeapon.position.z = -0.45 + this.recoilKick * 0.3; }
    this.renderer.render(this.scene, this.camera);
  }
}
