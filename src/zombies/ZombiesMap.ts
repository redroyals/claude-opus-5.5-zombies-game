// Geometry, colliders and navigation for the Zombies map "Nightfall Relay" (layout in ./mapdata).
// Owns its own CollisionWorld + NavGrid so extraction's district is untouched. Doors and debris are
// removable colliders; barricaded windows block movement but not bullets.
import * as THREE from 'three';
import { StaticBatch, worldBox, worldQuad } from '../render/geom';
import { models } from '../render/ModelRegistry';
import type { Materials } from '../render/materials';
import { signTexture } from '../render/textures';
import { CollisionWorld, type Box } from '../world/Collision';
import { NavGrid } from '../world/NavGrid';
import {
  DOOR_GEOM, POWER_FLOOR, RELICS, ROOMS, STAIRS, TOPOLOGY, WALL_H, WINDOWS, type DoorGeom, type WindowGeom,
} from './mapdata';

const BOUNDS = { minX: -40, minZ: -40, maxX: 40, maxZ: 40 };
const T = 0.3; // wall thickness
const WIN = { half: 0.75, y0: 0.85, y1: 2.25 };

interface Opening { a: number; b: number; y0: number; y1: number }
export interface DoorRuntime { geom: DoorGeom; box: Box; mesh: THREE.Group; openT: number; open: boolean; cost: number; label: string }
export interface WindowRuntime {
  geom: WindowGeom;
  box: Box;
  planks: THREE.Mesh[];
  plankHome: THREE.Matrix4[];
  flying: { m: THREE.Mesh; t: number; v: THREE.Vector3; spin: THREE.Vector3 }[];
  /** Outside approach point, inside landing point and pocket spawn point. */
  outside: { x: number; z: number };
  inside: { x: number; z: number };
  spawn: { x: number; z: number };
}
interface RoomLight { light: THREE.PointLight; bulb: THREE.Mesh; phase: number; power: boolean }

export class ZombiesMap {
  readonly root = new THREE.Group();
  readonly world = new CollisionWorld(BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.maxZ);
  readonly nav = new NavGrid(BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.maxZ);
  readonly doors: DoorRuntime[] = [];
  readonly windows: WindowRuntime[] = [];
  readonly relics: THREE.Group[] = [];
  private batch = new StaticBatch();
  private lights: RoomLight[] = [];
  private bulbOn: THREE.MeshBasicMaterial;
  private bulbOff: THREE.MeshBasicMaterial;
  private plankMat: THREE.MeshStandardMaterial;
  private chalk = new Map<string, THREE.Mesh>();
  private moon: THREE.PointLight[] = [];

  constructor(private M: Materials) {
    this.root.visible = false;
    this.bulbOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd29a).multiplyScalar(3) });
    this.bulbOff = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x802010).multiplyScalar(1.5) });
    this.plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9, map: M.tex.wood.map });
    this.buildGround();
    this.buildRooms();
    this.buildWalls();
    this.buildStairs();
    this.buildWindows();
    this.buildDoors();
    this.buildDressing();
    this.buildLights();
    this.buildRelics();
    this.batch.build(this.root, { castShadow: true, receiveShadow: true });
    this.nav.build(this.world);
  }

  // ------------------------------------------------------------------------------------------
  private solid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, tile = 2,
    opts: { floor?: boolean; solid?: boolean; surface?: 'concrete' | 'metal' | 'wood' | 'dirt' | 'glass' } = {}): Box {
    this.batch.add(mat, worldBox(x0, y0, z0, x1, y1, z1, tile));
    return this.world.add(x0, y0, z0, x1, y1, z1, { surface: opts.surface ?? 'concrete', floor: opts.floor, solid: opts.solid });
  }

  private vis(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, tile = 2): void {
    this.batch.add(mat, worldBox(x0, y0, z0, x1, y1, z1, tile));
  }

  /** Wall along X (at z) or Z (at x) from a0..a1 with rectangular openings. */
  private wall(axis: 'x' | 'z', at: number, a0: number, a1: number, y0: number, y1: number, mat: THREE.Material, openings: Opening[] = []): void {
    const seg = (b0: number, b1: number, c0: number, c1: number) => {
      if (b1 - b0 < 1e-3 || c1 - c0 < 1e-3) return;
      if (axis === 'x') this.solid(b0, c0, at - T / 2, b1, c1, at + T / 2, mat, 2);
      else this.solid(at - T / 2, c0, b0, at + T / 2, c1, b1, mat, 2);
    };
    const sorted = [...openings].sort((p, q) => p.a - q.a);
    let cur = a0;
    for (const o of sorted) {
      seg(cur, o.a, y0, y1);
      seg(o.a, o.b, y0, o.y0); // sill
      seg(o.a, o.b, o.y1, y1); // lintel
      cur = o.b;
    }
    seg(cur, a1, y0, y1);
  }

  private buildGround(): void {
    const M = this.M;
    // Moonlit yard outside the windows
    const yard = new THREE.Mesh(worldQuad(-40, -40, 40, 40, -0.02, 6), M.dirt);
    yard.receiveShadow = true;
    this.root.add(yard);
    // Distant perimeter wall + dead trees for silhouettes through the windows
    for (const [x0, z0, x1, z1] of [[-34, -34, 34, -33], [-34, 33, 34, 34], [-34, -34, -33, 34], [33, -34, 34, 34]]) this.vis(x0, 0, z0, x1, 3.2, z1, M.brickDark, 3);
    const trunk = new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, r = 29 + (i % 3);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 7 + (i % 4), 5), trunk);
      t.position.set(Math.cos(a) * r, 3.5, Math.sin(a) * r);
      t.rotation.z = Math.sin(i * 7.1) * 0.15;
      this.root.add(t);
      for (let b = 0; b < 3; b++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 2.4, 4), trunk);
        br.position.set(t.position.x, 4 + b * 1.2, t.position.z);
        br.rotation.set(0.9 * Math.sin(i + b), i + b * 2, 0.9 * Math.cos(i * 3 + b));
        this.root.add(br);
      }
    }
  }

  private buildRooms(): void {
    const M = this.M;
    for (const r of ROOMS) {
      const { x0, z0, x1, z1 } = r.rect;
      const floorMat = r.zone === 1 ? M.concreteDark : r.zone === 3 ? M.metalDark : r.zone === 4 ? M.concrete : M.concreteDark;
      if (r.floor > 0) {
        // Raised room on a solid plinth (nothing walkable underneath: the nav grid is 2.5D).
        this.solid(x0, 0, z0, x1, r.floor, z1, M.concrete, 2, { floor: true });
        this.batch.add(M.metalDark, worldQuad(x0, z0, x1, z1, r.floor + 0.005, 2));
      } else {
        this.batch.add(floorMat, worldQuad(x0, z0, x1, z1, 0.005, 3));
      }
      // Ceiling
      this.vis(x0, WALL_H, z0, x1, WALL_H + 0.3, z1, M.concreteDark, 3);
      this.world.add(x0, WALL_H, z0, x1, WALL_H + 0.3, z1);
      // Ceiling beams
      for (let x = x0 + 3; x < x1 - 1; x += 4) this.vis(x - 0.15, WALL_H - 0.35, z0, x + 0.15, WALL_H, z1, M.rust, 2);
    }
  }

  private buildWalls(): void {
    const M = this.M;
    const H = WALL_H;
    const win = (w: WindowGeom): Opening => {
      const along = w.nz !== 0 ? w.x : w.z;
      return { a: along - WIN.half, b: along + WIN.half, y0: w.floor + WIN.y0, y1: w.floor + WIN.y1 };
    };
    const winsOn = (axis: 'x' | 'z', at: number) => WINDOWS.filter((w) => (axis === 'x' ? w.nz !== 0 && Math.abs(w.z - at) < 0.01 : w.nx !== 0 && Math.abs(w.x - at) < 0.01)).map(win);
    const doorsOn = (axis: 'x' | 'z', at: number, lo: number, hi: number) => DOOR_GEOM.filter((d) => d.axis === axis && Math.abs(d.at - at) < 0.01 && d.a0 >= lo && d.a1 <= hi)
      .map((d) => ({ a: d.a0, b: d.a1, y0: d.y0, y1: d.y1 }));
    // Exterior
    this.wall('x', 18, -22, 24, 0, H, M.brick, winsOn('x', 18));
    this.wall('x', -14, -12, 12, 0, H, M.brick, winsOn('x', -14).filter((o) => o.a < 12));
    this.wall('x', -14, 12, 24, POWER_FLOOR, H, M.brick, winsOn('x', -14).filter((o) => o.a > 12));
    this.wall('z', -12, -14, 4, 0, H, M.brick, winsOn('z', -12));
    this.wall('z', -22, 4, 18, 0, H, M.brick, winsOn('z', -22));
    this.wall('x', 4, -22, -12, 0, H, M.brick);
    this.wall('z', 24, 4, 18, 0, H, M.brick, winsOn('z', 24));
    this.wall('z', 24, -14, 4, POWER_FLOOR, H, M.brick);
    // Interior
    this.wall('x', 4, -12, 12, 0, H, M.plaster, doorsOn('x', 4, -12, 12));
    this.wall('x', 4, 12, 24, POWER_FLOOR, H, M.plaster, doorsOn('x', 4, 12, 24));
    this.wall('z', 7, 4, 18, 0, H, M.plaster, doorsOn('z', 7, 4, 18));
    this.wall('z', -7, 4, 18, 0, H, M.plasterBlue);
    // Dock / Power Room overlook: plinth face below, railing + glass, wall above.
    this.wall('z', 12, -14, 4, POWER_FLOOR + 3.2, H, M.plaster);
    this.solid(12 - 0.15, POWER_FLOOR, -14, 12 + 0.15, POWER_FLOOR + 1.0, 4, M.metalDark, 2, { surface: 'metal' });
    this.world.add(12 - 0.1, POWER_FLOOR + 1.0, -14, 12 + 0.1, POWER_FLOOR + 3.2, 4, { solid: false, surface: 'glass' });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.2), new THREE.MeshStandardMaterial({ color: 0x405060, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    glass.rotation.y = Math.PI / 2;
    glass.position.set(12, POWER_FLOOR + 2.1, -5);
    this.root.add(glass);
    for (let z = -13; z < 4; z += 2.2) this.vis(11.9, POWER_FLOOR + 1.0, z - 0.05, 12.1, POWER_FLOOR + 3.2, z + 0.05, M.steel, 1);
    // Skirting trims give the rooms a finished edge
    for (const r of ROOMS) {
      const { x0, z0, x1, z1 } = r.rect, y = r.floor;
      this.vis(x0 + 0.15, y, z0 + 0.15, x1 - 0.15, y + 0.12, z0 + 0.2, M.metalDark, 1);
      this.vis(x0 + 0.15, y, z1 - 0.2, x1 - 0.15, y + 0.12, z1 - 0.15, M.metalDark, 1);
    }
  }

  private buildStairs(): void {
    const s = STAIRS;
    for (let k = 1; k <= s.steps; k++) {
      const z0 = s.zTop + (s.steps - k) * s.depth, z1 = z0 + s.depth;
      const top = (k * POWER_FLOOR) / s.steps;
      this.solid(s.x0, 0, z0, s.x1, top, z1, this.M.metalDark, 1, { floor: true, surface: 'metal' });
      this.vis(s.x0, top, z0, s.x1, top + 0.02, z0 + 0.08, this.M.hazardYellow, 1);
    }
    // Hand rail on the open side
    this.solid(s.x0 - 0.12, 0, s.zTop, s.x0, POWER_FLOOR + 1.0, s.zTop + s.steps * s.depth, this.M.steel, 1, { surface: 'metal' });
  }

  private buildWindows(): void {
    const plankGeo = new THREE.BoxGeometry(1.75, 0.2, 0.06);
    for (const w of WINDOWS) {
      const along = w.nz !== 0 ? 'x' : 'z';
      const cx = w.x, cz = w.z;
      // Frame + blocking collider (does not block bullets or sight: zombies can be shot through the gaps)
      const y0 = w.floor + WIN.y0, y1 = w.floor + WIN.y1;
      const hx = along === 'x' ? WIN.half : T / 2 + 0.05, hz = along === 'x' ? T / 2 + 0.05 : WIN.half;
      const box = this.world.add(cx - hx, w.floor, cz - hz, cx + hx, y1 + 0.2, cz + hz, { solid: false, surface: 'wood' });
      // Rotted frame
      const fr = (a0: number, a1: number, b0: number, b1: number) => {
        if (along === 'x') this.vis(cx + a0, b0, cz - 0.2, cx + a1, b1, cz + 0.2, this.M.wood, 1);
        else this.vis(cx - 0.2, b0, cz + a0, cx + 0.2, b1, cz + a1, this.M.wood, 1);
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
      // Outside pocket: a small walled yard behind the window so spawns are hidden and contained.
      const out = (d: number) => ({ x: cx + w.nx * d, z: cz + w.nz * d });
      if (w.floor > 0) {
        const p0 = out(0.2), p1 = out(3.2);
        this.solid(Math.min(p0.x, p1.x) - (along === 'x' ? 1.6 : 0), 0, Math.min(p0.z, p1.z) - (along === 'x' ? 0 : 1.6),
          Math.max(p0.x, p1.x) + (along === 'x' ? 1.6 : 0), w.floor, Math.max(p0.z, p1.z) + (along === 'x' ? 0 : 1.6), this.M.concreteDark, 2, { floor: true });
      }
      const pd = 3.3;
      const side = (s: number) => {
        const a = out(0.15), b = out(pd);
        if (along === 'x') this.solid(cx + s * 1.6 - 0.15, 0, Math.min(a.z, b.z), cx + s * 1.6 + 0.15, w.floor + 3.2, Math.max(a.z, b.z), this.M.brickDark, 2);
        else this.solid(Math.min(a.x, b.x), 0, cz + s * 1.6 - 0.15, Math.max(a.x, b.x), w.floor + 3.2, cz + s * 1.6 + 0.15, this.M.brickDark, 2);
      };
      side(-1); side(1);
      const back = out(pd);
      if (along === 'x') this.solid(cx - 1.75, 0, back.z - 0.15, cx + 1.75, w.floor + 3.2, back.z + 0.15, this.M.brickDark, 2);
      else this.solid(back.x - 0.15, 0, cz - 1.75, back.x + 0.15, w.floor + 3.2, cz + 1.75, this.M.brickDark, 2);
      this.windows.push({ geom: w, box, planks, plankHome: homes, flying: [], outside: out(0.75), inside: out(-0.95), spawn: out(2.5) });
    }
  }

  private buildDoors(): void {
    for (const g of DOOR_GEOM) {
      const def = TOPOLOGY.doors.find((d) => d.id === g.id)!;
      const mesh = new THREE.Group();
      const len = g.a1 - g.a0, h = g.y1 - g.y0;
      const mid = (g.a0 + g.a1) / 2;
      if (g.debris) {
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
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.45), new THREE.MeshBasicMaterial({ map: signTexture([def.debris ? 'DEBRIS' : 'SEALED', `${def.cost}`], { bg: '#161410', fg: '#e8dcc0', border: '#8a6a3a' }), transparent: true }));
      sign.position.set(0, Math.min(h - 0.4, 2.2), 0.1);
      const signB = sign.clone();
      signB.rotation.y = Math.PI;
      signB.position.z = -0.1;
      mesh.add(sign, signB);
      if (g.debris) {
        // Authored debris pile replaces the procedural crates when available.
        models.whenNamed('kit_debris.glb', (lm) => {
          const inst = models.instance(lm);
          for (const c of mesh.children) if (c !== sign && c !== signB) c.visible = false;
          inst.scale.setScalar(len / 3.056);
          mesh.add(inst);
        });
      } else {
        models.whenNamed('kit_door.glb', (lm) => {
          const inst = models.instance(lm);
          for (const c of mesh.children) if (c !== sign && c !== signB) c.visible = false;
          inst.scale.set(len / 4, h / 3.3, 1);
          mesh.add(inst);
        });
      }
      if (g.axis === 'x') mesh.position.set(mid, g.y0, g.at);
      else { mesh.position.set(g.at, g.y0, mid); mesh.rotation.y = Math.PI / 2; }
      this.root.add(mesh);
      const box = g.axis === 'x'
        ? this.world.add(g.a0, g.y0, g.at - 0.25, g.a1, g.y1, g.at + 0.25, { surface: g.debris ? 'wood' : 'metal' })
        : this.world.add(g.at - 0.25, g.y0, g.a0, g.at + 0.25, g.y1, g.a1, { surface: g.debris ? 'wood' : 'metal' });
      this.doors.push({ geom: g, box, mesh, openT: 0, open: false, cost: def.cost, label: def.label });
    }
  }

  private buildDressing(): void {
    const M = this.M;
    // Dock: crates, pallets, a parked truck bed, hanging chains
    const crate = (x: number, z: number, s = 1, y = 0) => this.solid(x - 0.5 * s, y, z - 0.5 * s, x + 0.5 * s, y + s, z + 0.5 * s, M.wood, 1, { surface: 'wood' });
    crate(-8, -5); crate(-8, -3.9, 0.9); crate(-7.95, -4.5, 0.7, 1); crate(7.5, -2.5); crate(8.6, -2.3, 0.8);
    this.solid(-3, 0, -6, 3, 1.1, -3.8, M.containers[1], 2, { surface: 'metal' }); // loading platform
    this.vis(-3, 1.1, -6, 3, 1.15, -3.8, M.hazardYellow, 1);
    // Hall: two dead generators and fuel drums
    for (const [x, z] of [[11, 14.5], [17, 14.5]]) {
      this.solid(x - 1.3, 0, z - 0.9, x + 1.3, 1.7, z + 0.9, M.olive, 2, { surface: 'metal' });
      this.vis(x - 1.35, 1.7, z - 0.6, x + 1.35, 1.9, z + 0.6, M.metalDark, 1);
    }
    for (const [x, z] of [[9, 6], [9.8, 6.3], [9.3, 7]]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), M.red);
      d.position.set(x, 0.45, z);
      d.castShadow = true;
      this.root.add(d);
      this.world.add(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, { surface: 'metal' });
    }
    // Lobby: checkpoint desk, sandbags, torn posters
    this.solid(-2.5, 0, 7.5, 2.5, 1.05, 8.3, M.metalDark, 1, { surface: 'metal' });
    this.vis(-2.6, 1.05, 7.4, 2.6, 1.1, 8.4, M.steel, 1);
    for (let i = 0; i < 4; i++) this.solid(-6.6 + i * 0.7, 0, 16.6, -6 + i * 0.7, 0.5, 17.4, M.sandbag, 1, { surface: 'dirt' });
    // Vault: vault door frame decoration + shelving
    this.vis(-21.8, 0, 12.5, -21.5, 3.2, 13.5, M.steel, 1);
    for (const z of [5.5, 7.5]) this.solid(-16, 0, z - 0.3, -12, 2.2, z + 0.3, M.metal, 1, { surface: 'metal' });
    // Power room: transformer banks with warning stripes
    for (const x of [15, 17.5]) {
      this.solid(x - 0.9, POWER_FLOOR, -3.5, x + 0.9, POWER_FLOOR + 2.0, -1.5, M.metalDark, 1, { surface: 'metal' });
      this.vis(x - 0.92, POWER_FLOOR + 1.2, -3.52, x + 0.92, POWER_FLOOR + 1.4, -1.48, M.hazardYellow, 1);
    }
    // Wall signage
    const addSign = (lines: string[], x: number, y: number, z: number, ry: number, w = 2.2, h = 0.7) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTexture(lines, { bg: '#1c1a16', fg: '#d8d0b8', border: '#6a5a3a', hazard: false }), roughness: 0.8 }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      this.root.add(m);
    };
    addSign(['NIGHTFALL RELAY', 'CHECKPOINT 3'], 0, 4.2, 17.83, Math.PI);
    addSign(['LOADING DOCK', 'NO ENTRY AFTER DARK'], 0, 4.2, 4.17 - 0.34, Math.PI);
    addSign(['GENERATOR HALL'], 15.5, 4.3, 17.83, Math.PI, 2.2, 0.5);
    addSign(['REFORGE VAULT', 'AUTHORISED ONLY'], -14.5, 4.3, 4.17, 0);
    addSign(['⚡ MAIN POWER ⚡'], 18, POWER_FLOOR + 2.6, -13.83, 0, 2.2, 0.5);
    // Blood smears on floors (decals)
    const blood = new THREE.MeshBasicMaterial({ map: M.tex.blood, transparent: true, depthWrite: false, color: 0x5a1010, polygonOffset: true, polygonOffsetFactor: -4 });
    for (const [x, z, s] of [[-3, 16, 2], [3.5, 16.5, 1.4], [-6, -12, 2.2], [0, 0, 1.8], [15, 16, 2.4], [-14, 16.5, 1.6], [18, -12, 1.5]]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(s, s), blood);
      d.rotation.set(-Math.PI / 2, 0, x * z);
      d.position.set(x, z < 4 && x > 12 ? POWER_FLOOR + 0.02 : 0.02, z);
      this.root.add(d);
    }
  }

  private buildLights(): void {
    const spots: [number, number, number][] = [
      [0, WALL_H - 0.4, 11], [-6, WALL_H - 0.4, -6], [6, WALL_H - 0.4, -6], [15.5, WALL_H - 0.4, 11], [18, WALL_H - 0.4, -6], [-14.5, WALL_H - 0.4, 11],
    ];
    const bulbGeo = new THREE.SphereGeometry(0.14, 10, 8);
    const shade = new THREE.ConeGeometry(0.45, 0.3, 12, 1, true);
    spots.forEach(([x, y, z], i) => {
      const l = new THREE.PointLight(0xffb070, 0, 16, 1.6);
      l.position.set(x, y - 0.35, z);
      this.root.add(l);
      const bulb = new THREE.Mesh(bulbGeo, this.bulbOff);
      bulb.position.set(x, y - 0.3, z);
      const sh = new THREE.Mesh(shade, this.M.metalDark);
      sh.position.set(x, y - 0.12, z);
      this.root.add(bulb, sh);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4), this.M.rubber);
      cord.position.set(x, y + 0.1, z);
      this.root.add(cord);
      this.lights.push({ light: l, bulb, phase: i * 1.7, power: false });
    });
    // Cold moonlight spilling through the windows
    for (const w of WINDOWS) {
      if (w.id % 2 === 1) continue;
      const l = new THREE.PointLight(0x7890c0, 10, 7, 1.8);
      l.position.set(w.x - w.nx * 1.2, w.floor + 1.8, w.z - w.nz * 1.2);
      this.root.add(l);
      this.moon.push(l);
    }
  }

  private buildRelics(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x202018, emissive: 0x40ffb0, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.6 });
    for (const r of RELICS) {
      const g = new THREE.Group();
      const radio = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.12), this.M.metalDark);
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), mat);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(0.07, 0, 0.07);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.3), this.M.steel);
      ant.position.set(-0.1, 0.2, 0);
      ant.rotation.z = 0.3;
      g.add(radio, dial, ant);
      g.position.set(r.x, r.y - 0.25, r.z);
      g.userData.dial = dial;
      this.root.add(g);
      this.relics.push(g);
    }
  }

  // ------------------------------------------------------------------------------------------
  /** Chalk outline placeholder registry: machines module draws the actual chalk. */
  registerChalk(key: string, m: THREE.Mesh): void { this.chalk.set(key, m); }

  openDoor(id: string, instant = false): void {
    const d = this.doors.find((x) => x.geom.id === id);
    if (!d || d.open) return;
    d.open = true;
    d.openT = instant ? 1 : 0.0001;
    // Disable the collider (boxes are referenced by the broadphase, so collapse it rather than removing).
    const b = d.box;
    b.minY = b.maxY = -100;
    this.nav.build(this.world);
  }

  resetDoors(): void {
    for (const d of this.doors) {
      if (!d.open) continue;
      d.open = false;
      d.openT = 0;
      const g = d.geom;
      const b = d.box;
      b.minY = g.y0; b.maxY = g.y1;
      d.mesh.visible = true;
      d.mesh.position.y = g.y0;
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

  update(time: number, dt: number, power: boolean): void {
    for (const d of this.doors) {
      if (!d.open || d.openT >= 1) { if (d.open) d.mesh.visible = false; continue; }
      d.openT = Math.min(1, d.openT + dt / 1.1);
      const e = d.openT * d.openT;
      if (d.geom.debris) { d.mesh.position.y = d.geom.y0 - e * 2.5; d.mesh.scale.setScalar(1 - e * 0.5); }
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
        if (f.m.position.y < 0.05) { f.m.position.y = 0.05; f.v.set(0, 0, 0); f.spin.set(0, 0, 0); }
        if (f.t > 3) { this.root.remove(f.m); w.flying.splice(i, 1); }
      }
    }
    for (const l of this.lights) {
      if (power) {
        const f = Math.sin(time * 31 + l.phase) * Math.sin(time * 2.3 + l.phase);
        l.light.color.setHex(0xffc080);
        l.light.intensity = (f > 0.93 ? 12 : 45);
        l.bulb.material = f > 0.93 ? this.bulbOff : this.bulbOn;
      } else {
        const f = Math.sin(time * 3.1 + l.phase) * Math.sin(time * 17 + l.phase * 3);
        l.light.color.setHex(0xff3018);
        l.light.intensity = f > 0.6 ? 0.5 : 5 + Math.sin(time * 1.3 + l.phase) * 1.5;
        l.bulb.material = this.bulbOff;
      }
    }
    for (const r of this.relics) {
      if (!r.visible) continue;
      (r.userData.dial as THREE.Mesh).rotation.y = time * 2;
    }
  }

  groundHeight(x: number, z: number): number {
    return this.world.groundHeight(x, z, 0.3, 3.2);
  }
}
