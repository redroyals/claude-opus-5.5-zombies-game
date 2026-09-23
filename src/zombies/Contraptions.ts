// Visuals for the pacing contraptions: workbench buildables (scattered parts, the bench, the finished build) and
// traps (switch panel + a killing floor that sparks or burns while live). Procedural placeholders that upgrade to a
// GLB when the map names one (`model`), so map artists can swap them without touching gameplay.
import * as THREE from 'three';
import { models, placeModel } from '../render/ModelRegistry';
import type { BuildState } from './buildables';
import type { BuildableDef, TrapDef } from './mapdef';
import type { TrapState } from './traps';

function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a0a0c';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(4, 4, 248, 56);
  g.fillStyle = color;
  g.font = 'bold 24px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase().slice(0, 18), 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A small glowing pickup: gear, plate, orb/relic, radio, or a GLB path. */
function partMesh(model: string | undefined, mat: THREE.Material, metal: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const m = model ?? 'gear';
  if (m === 'gear') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 12), mat);
    for (let i = 0; i < 8; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), metal);
      const a = (i / 8) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0);
      ring.add(tooth);
    }
    g.add(ring);
    g.userData.spin = ring;
  } else if (m === 'plate') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.04), metal);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.045), mat);
    plate.add(stripe);
    g.add(plate);
    g.userData.spin = plate;
  } else if (m === 'radio') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.12), metal);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), mat);
    dial.rotation.x = Math.PI / 2; dial.position.set(0.07, 0, 0.07);
    box.add(dial);
    g.add(box);
    g.userData.spin = box;
  } else if (m === 'orb' || m === 'relic') {
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(m === 'orb' ? 0.14 : 0.1, 1), mat);
    g.add(orb);
    g.userData.spin = orb;
  } else {
    void models.load(m).then((lm) => { if (lm) g.add(models.instance(lm)); });
  }
  return g;
}

interface BuildView { root: THREE.Group; parts: THREE.Group[]; onBench: THREE.Group[]; result: THREE.Group; glow: THREE.MeshStandardMaterial }

export class BuildViews {
  readonly group = new THREE.Group();
  private views: BuildView[] = [];

  constructor(private defs: BuildableDef[]) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.85 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x5a5e64, roughness: 0.45, metalness: 0.8 });
    for (const d of defs) {
      const glow = new THREE.MeshStandardMaterial({ color: 0x102030, emissive: 0x50c8ff, emissiveIntensity: 1.5, roughness: 0.4, metalness: 0.5 });
      const root = new THREE.Group();
      root.position.set(d.bench.x, d.bench.y ?? 0, d.bench.z);
      root.rotation.y = d.bench.face;
      const table = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), wood);
      top.position.y = 0.92;
      top.castShadow = true;
      table.add(top);
      for (const [x, z] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood);
        leg.position.set(x, 0.45, z);
        table.add(leg);
      }
      const vise = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.18), metal);
      vise.position.set(0.58, 1.04, -0.2);
      table.add(vise);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: labelTexture(d.name, '#6fd8ff') }));
      sign.position.set(0, 1.55, -0.38);
      table.add(sign);
      root.add(table);
      if (d.model) watchSwap(d.model, table, root, 1.2);
      // Found parts lie on the bench top; the finished build stands on it.
      const onBench = d.parts.map((p, i) => {
        const g = partMesh(p.model, glow, metal);
        g.scale.setScalar(0.7);
        g.position.set(-0.55 + (i * 1.1) / Math.max(1, d.parts.length - 1), 1.05, 0.1);
        g.visible = false;
        root.add(g);
        return g;
      });
      const result = new THREE.Group();
      if (d.result.kind === 'shield') {
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.06), metal);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.07), glow);
        band.position.y = 0.2;
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.07), glow);
        port.position.y = 0.32;
        shield.add(band, port);
        shield.rotation.x = -0.25;
        result.add(shield);
        result.position.set(0, 1.42, 0);
      } else {
        const kit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.36), metal);
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 14), glow);
        coil.position.y = 0.2; coil.rotation.x = Math.PI / 2;
        kit.add(coil);
        result.add(kit);
        result.position.set(0, 1.12, 0);
      }
      result.visible = false;
      root.add(result);
      this.group.add(root);
      const parts = d.parts.map((p) => {
        const g = partMesh(p.model, glow, metal);
        g.position.set(p.x, p.y - 0.25, p.z);
        this.group.add(g);
        return g;
      });
      this.views.push({ root, parts, onBench, result, glow });
    }
  }

  reset(): void {
    for (const v of this.views) { v.parts.forEach((p) => { p.visible = true; }); v.onBench.forEach((p) => { p.visible = false; }); v.result.visible = false; }
  }

  update(time: number, states: BuildState[]): void {
    this.views.forEach((v, i) => {
      const st = states[i];
      if (!st) return;
      v.parts.forEach((p, k) => {
        p.visible = !st.found[k] && !st.built;
        if (!p.visible) return;
        const s = p.userData.spin as THREE.Object3D | undefined;
        if (s) s.rotation.y = time * 1.8 + k;
        p.position.y = this.defs[i].parts[k].y - 0.25 + Math.sin(time * 2.4 + k) * 0.05;
      });
      v.onBench.forEach((p, k) => { p.visible = st.found[k] && !st.built; });
      v.result.visible = st.built && !st.shieldOut && st.reissueT <= 0;
      v.glow.emissiveIntensity = 1.2 + Math.sin(time * 3) * 0.4;
    });
  }
}

/** Replace a procedural stand-in with a GLB once it loads. */
function watchSwap(model: string, standIn: THREE.Object3D, root: THREE.Group, height: number): void {
  void models.load(model).then((m) => {
    if (!m) return;
    const inst = models.instance(m);
    placeModel(inst, height);
    standIn.visible = false;
    root.add(inst);
  });
}

interface TrapView { root: THREE.Group; lamp: THREE.MeshBasicMaterial; lever: THREE.Object3D; live: THREE.MeshStandardMaterial; liveMeshes: THREE.Object3D[]; def: TrapDef }

export class TrapViews {
  readonly group = new THREE.Group();
  private views: TrapView[] = [];

  constructor(defs: TrapDef[]) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.6 });
    const post = new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 0.5, metalness: 0.7 });
    for (const d of defs) {
      const col = d.kind === 'fire' ? 0xff6a18 : 0x60a0ff;
      const hex = '#' + col.toString(16).padStart(6, '0');
      const root = new THREE.Group();
      root.position.set(d.switch.x, d.switch.y ?? 0, d.switch.z);
      root.rotation.y = d.switch.face;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.25), dark);
      box.position.y = 1.1;
      box.castShadow = true;
      root.add(box);
      const lamp = new THREE.MeshBasicMaterial({ color: 0x30ff50 });
      const lampM = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lamp);
      lampM.position.set(0.28, 1.6, 0.14);
      root.add(lampM);
      const lever = new THREE.Group();
      lever.position.set(0, 1.05, 0.14);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.07), post);
      arm.position.y = 0.22;
      lever.add(arm);
      lever.rotation.x = 0.8;
      root.add(lever);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: labelTexture(d.name, hex) }));
      sign.position.set(0, 1.92, 0.13);
      root.add(sign);
      if (d.model) watchSwap(d.model, box, root, 1.9);
      this.group.add(root);
      // The killing floor: corner posts and wires (electric) or a grate over a fire pit.
      const live = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: col, emissiveIntensity: 0, roughness: 0.4, transparent: true, opacity: 0.9 });
      const a = d.area;
      const liveMeshes: THREE.Object3D[] = [];
      if (d.kind === 'electric') {
        for (const [x, z] of [[a.x0, a.z0], [a.x1, a.z0], [a.x0, a.z1], [a.x1, a.z1]]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8), post);
          p.position.set(x, a.y + 1.1, z);
          this.group.add(p);
        }
        for (const h of [0.6, 1.3, 2.0]) {
          for (const [x0, z0, x1, z1] of [[a.x0, a.z0, a.x1, a.z0], [a.x0, a.z1, a.x1, a.z1], [a.x0, a.z0, a.x0, a.z1], [a.x1, a.z0, a.x1, a.z1]]) {
            const len = Math.hypot(x1 - x0, z1 - z0);
            const w = new THREE.Mesh(new THREE.BoxGeometry(x1 === x0 ? 0.03 : len, 0.03, z1 === z0 ? 0.03 : len), live);
            w.position.set((x0 + x1) / 2, a.y + h, (z0 + z1) / 2);
            this.group.add(w);
            liveMeshes.push(w);
          }
        }
      } else {
        const grate = new THREE.Mesh(new THREE.PlaneGeometry(a.x1 - a.x0, a.z1 - a.z0), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.6 }));
        grate.rotation.x = -Math.PI / 2;
        grate.position.set((a.x0 + a.x1) / 2, a.y + 0.02, (a.z0 + a.z1) / 2);
        this.group.add(grate);
        const fire = new THREE.Mesh(new THREE.PlaneGeometry(a.x1 - a.x0, a.z1 - a.z0), live);
        fire.rotation.x = -Math.PI / 2;
        fire.position.set((a.x0 + a.x1) / 2, a.y + 0.04, (a.z0 + a.z1) / 2);
        this.group.add(fire);
        liveMeshes.push(fire);
      }
      this.views.push({ root, lamp, lever, live, liveMeshes, def: d });
    }
  }

  reset(): void {
    for (const v of this.views) { v.live.emissiveIntensity = 0; v.lever.rotation.x = 0.8; }
  }

  /** Drive the lamps and the live floor; `spark` is called for FX at random points of live traps. */
  update(time: number, states: TrapState[], spark: (x: number, y: number, z: number, kind: 'electric' | 'fire') => void): void {
    this.views.forEach((v, i) => {
      const st = states[i];
      if (!st) return;
      const on = st.phase === 'active';
      v.lamp.color.setHex(on ? 0xffd030 : st.phase === 'cooldown' ? 0xff2010 : 0x30ff50);
      v.lever.rotation.x += ((on ? -0.8 : 0.8) - v.lever.rotation.x) * 0.2;
      const flick = on ? (v.def.kind === 'electric' ? (Math.sin(time * 53) > 0 ? 3 : 0.6) : 1.6 + Math.sin(time * 11) * 0.6) : 0;
      v.live.emissiveIntensity = flick;
      if (on && Math.random() < 0.35) {
        const a = v.def.area;
        spark(a.x0 + Math.random() * (a.x1 - a.x0), a.y + (v.def.kind === 'fire' ? 0.3 : 0.4 + Math.random() * 1.8), a.z0 + Math.random() * (a.z1 - a.z0), v.def.kind);
      }
    });
  }
}
