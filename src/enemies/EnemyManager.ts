// Owns all zombies: pooling, behaviour updates, navigation, separation, hit tests and damage.
import * as THREE from 'three';
import { ENEMIES, type RegionId, type ZombieType } from '../config';
import type { AudioEngine } from '../audio/Audio';
import type { Effects } from '../fx/Effects';
import type { Level } from '../world/Level';
import { Zombie } from './Zombie';
import { BONE, ZombieModels } from './ZombieModel';
import type { TextureLib } from '../render/textures';
import type { CollisionWorld } from '../world/Collision';
import type { FlowOut, NavGrid, NavLink } from '../world/NavGrid';
import { models, findNode, type LoadedModel } from '../render/ModelRegistry';
import { crawlerFromLegHit } from '../zombies/rules';
import { TEAR_SECONDS } from '../zombies/zones';
import { canAttackThroughWindow, laneAngle, steerLane, surroundSlot, windowQueueSpot } from './horde';
import { GLB_CAPSULES, HIT_PARTS, rayCapsules, type HitPart } from './hitbox';

/** Zombies-mode barricade hooks: zombies spawned outside walk to a window, tear planks, then climb in. */
export interface BarricadeHost {
  planks(w: number): number;
  tear(w: number, z: Zombie): void;
  win(w: number): { outside: { x: number; z: number }; inside: { x: number; z: number }; floor: number };
}

/** The level a manager operates in (extraction district or a Zombies map). */
export interface Arena { world: CollisionWorld; nav: NavGrid }

const GLB_FOR: Partial<Record<ZombieType, string>> = {
  shambler: 'z_shambler', runner: 'z_runner', brute: 'z_brute', armored: 'z_brute', crawler: 'z_crawler', fast: 'z_fast', boss: 'z_boss', elite: 'z_boss',
};

export interface ZombieHit { z: Zombie; dist: number; head: boolean; x: number; y: number; z_: number; part: HitPart }

export interface DamageOutcome { killed: boolean; head: boolean; armor: boolean; dealt: number }

export interface PlayerTarget {
  x: number; y: number; z: number; eyeY: number; alive: boolean;
}

export interface EnemyEvents {
  onKill(z: Zombie, head: boolean): void;
  onPlayerHit(dmg: number, fromX: number, fromZ: number, heavy: boolean): void;
}

export class EnemyManager {
  readonly group = new THREE.Group();
  readonly models: ZombieModels;
  readonly zombies: Zombie[] = [];
  private pool = new Map<string, Zombie[]>();
  private flowT = 0;
  private lastFlowCell = -1;
  private hash = new Map<number, Zombie[]>();
  private seedCounter = 1;
  private time = 0;
  private dir: FlowOut = { x: 0, z: 0 };
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  elite: Zombie | null = null;
  boss: Zombie | null = null;
  eliteAggro = false;
  alertLevel = 0;
  /** Zombies-mode switches. */
  instaKill = false;
  allowCrawlers = false;
  barricades: BarricadeHost | null = null;
  private arena: Arena;
  private glbModels = new Map<string, LoadedModel>();
  /** Simplified geometry per zombie model (scripts/zombie-lods.mjs), bound to the full model's skeleton. */
  private lodGeos = new Map<string, THREE.BufferGeometry[]>();
  private rnd = Math.random;

  constructor(tex: TextureLib, level: Level, private fx: Effects, private audio: AudioEngine, private events: EnemyEvents) {
    this.models = new ZombieModels(tex);
    this.arena = { world: level.world, nav: level.nav };
    // Skinned GLB zombies upgrade the procedural ones when (if) the files appear.
    for (const name of new Set(Object.values(GLB_FOR))) {
      models.whenNamed(`${name}.glb`, (m) => {
        if (!m.skinned && m.animations.length === 0) { console.info('[models] static zombie model ignored (needs a skin/clips):', name); return; }
        this.glbModels.set(name, m);
        // Distance LOD is optional: only fetched once the full model exists.
        void models.load(`zombies/${name}_lod1.glb`).then((lm) => {
          if (!lm) return;
          const geos: THREE.BufferGeometry[] = [];
          lm.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) geos.push((o as THREE.SkinnedMesh).geometry); });
          if (geos.length) this.lodGeos.set(name, geos);
        });
      });
    }
  }

  setArena(a: Arena): void {
    this.arena = a;
    this.lastFlowCell = -1;
    this.flowT = 0;
  }

  private get level(): Arena { return this.arena; }

  private attachGlb(z: Zombie): void {
    const name = GLB_FOR[z.type];
    const m = name ? this.glbModels.get(name) : undefined;
    if (z.glb && z.glb.root.userData.model === name) return;
    if (z.glb) { this.group.remove(z.glb.root); z.glb = null; }
    if (!m) { z.mesh.visible = true; return; }
    const inst = models.instance(m);
    // Skinned bind-pose bounds are unreliable: measure the top of the head bone instead (feet are at y=0).
    inst.updateMatrixWorld(true);
    const top = findNode(inst, 'head_end') ?? findNode(inst, 'headtop') ?? findNode(inst, 'head');
    let h = top ? top.getWorldPosition(new THREE.Vector3()).y + (top.name.toLowerCase().includes('end') ? 0.05 : 0.2) : 0;
    if (!(h > 0.2)) { const box = new THREE.Box3().setFromObject(inst); h = Math.max(0.01, box.max.y - box.min.y); }
    const holder = new THREE.Group();
    inst.scale.multiplyScalar(1.78 / h);
    holder.add(inst);
    holder.scale.setScalar(z.scale);
    holder.userData.model = name;
    const mixer = new THREE.AnimationMixer(inst);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const clip of m.animations) {
      const n = clip.name.toLowerCase();
      const key = /crawl/.test(n) ? 'crawl' : /death|die|dying/.test(n) ? 'death' : /attack|hit|swipe|bite/.test(n) ? 'attack' : /run|sprint/.test(n) ? 'run' : /walk/.test(n) ? 'walk' : /idle/.test(n) ? 'idle' : null;
      if (key && !actions[key]) actions[key] = mixer.clipAction(clip);
    }
    if (Object.keys(actions).length === 0 && m.animations[0]) actions.walk = mixer.clipAction(m.animations[0]);
    inst.traverse((o) => { o.frustumCulled = false; });
    // LOD: a low-poly skin driven by the same skeleton (swapped by distance in animate()).
    const lodGeos = name ? this.lodGeos.get(name) : undefined;
    const lodPairs: [THREE.SkinnedMesh, THREE.SkinnedMesh][] = [];
    if (lodGeos) {
      const hi: THREE.SkinnedMesh[] = [];
      inst.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) hi.push(o as THREE.SkinnedMesh); });
      if (hi.length === lodGeos.length) hi.forEach((h, i) => {
        const lo = new THREE.SkinnedMesh(lodGeos[i], h.material);
        lo.position.copy(h.position); lo.quaternion.copy(h.quaternion); lo.scale.copy(h.scale);
        lo.bind(h.skeleton, h.bindMatrix);
        lo.frustumCulled = false;
        lo.visible = false;
        lo.castShadow = h.castShadow;
        h.parent!.add(lo);
        lodPairs.push([h, lo]);
      });
    }
    const head = findNode(inst, 'head') ?? findNode(inst, 'mixamorig:head') ?? findNode(inst, 'Head');
    const byName = (n: string) => { let f: THREE.Object3D | null = null; inst.traverse((o) => { if (!f && o.name === n) f = o; }); return f as THREE.Object3D | null; };
    const capBones = GLB_CAPSULES.map((c) => [byName(c.a), byName(c.b)]);
    const legs = ['LeftUpLeg', 'RightUpLeg'].map(byName).filter((o): o is THREE.Object3D => !!o);
    z.lod = 0;
    z.glb = { root: holder, mixer, actions, current: '', head, lodPairs, capBones: capBones.every(([a, b]) => a && b) ? capBones : undefined, legs };
    this.group.add(holder);
  }

  get aliveCount(): number {
    let n = 0;
    for (const z of this.zombies) if (z.alive && !z.elite) n++;
    return n;
  }

  countInRegion(r: RegionId): number {
    let n = 0;
    for (const z of this.zombies) if (z.alive && !z.elite && z.region === r) n++;
    return n;
  }

  reset(): void {
    for (const z of this.zombies) this.release(z);
    this.zombies.length = 0;
    this.elite = null;
    this.boss = null;
    this.eliteAggro = false;
    this.lastFlowCell = -1;
    this.flowT = 0;
  }

  private acquire(type: ZombieType): Zombie {
    const variants = this.models.variants[type];
    const v = variants[Math.floor(Math.random() * variants.length)];
    const list = this.pool.get(v.key);
    let z = list?.pop();
    if (!z) {
      z = new Zombie();
      const inst = this.models.instantiate(v);
      z.variant = v;
      z.mesh = inst.mesh;
      z.bones = inst.bones;
      z.helmet = inst.helmet;
    }
    this.group.add(z.mesh);
    return z;
  }

  private release(z: Zombie): void {
    z.active = false;
    z.alive = false;
    z.mesh.visible = false;
    this.group.remove(z.mesh);
    if (z.glb) z.glb.root.visible = false;
    let list = this.pool.get(z.variant.key);
    if (!list) this.pool.set(z.variant.key, (list = []));
    list.push(z);
  }

  /** Spawn a zombie. `atY` picks the floor on multi-level maps (the highest floor at or below atY + 0.5). */
  spawn(type: ZombieType, region: RegionId, x: number, z: number, state: 'idle' | 'chase' = 'chase', atY?: number): Zombie {
    const zb = this.acquire(type);
    const y = this.level.world.groundHeight(x, z, 0.3, atY === undefined ? 3 : atY + 0.5);
    zb.spawn(type, region, x, z, y, this.seedCounter++ * 0.6180339 + Math.random());
    zb.lane = laneAngle(zb.seed);
    if (state === 'chase') zb.setState('chase');
    this.attachGlb(zb);
    this.zombies.push(zb);
    if (type === 'elite') this.elite = zb;
    if (type === 'boss') this.boss = zb;
    return zb;
  }

  /** Alerts zombies within `radius` of a noise (gunfire, explosions). */
  noise(x: number, z: number, radius: number): void {
    const r2 = radius * radius;
    for (const zb of this.zombies) {
      if (!zb.alive || zb.state !== 'idle') continue;
      const dx = zb.pos.x - x, dz = zb.pos.z - z;
      if (dx * dx + dz * dz < r2) zb.setState(zb.type === 'runner' || zb.elite ? 'alert' : 'chase');
    }
  }

  // --------------------------------------------------------------------------------------------
  update(dt: number, p: PlayerTarget): void {
    this.time += dt;
    const nav = this.level.nav;
    const world = this.level.world;
    // Shared flow field toward the player, refreshed on a timer or when the player changes cell.
    this.flowT -= dt;
    const cell = nav.nodeAt(p.x, p.z, p.y);
    if (this.flowT <= 0 || (cell !== this.lastFlowCell && this.flowT < ENEMIES.flowFieldInterval * 0.5)) {
      nav.computeFlow(p.x, p.z, p.y);
      this.lastFlowCell = cell;
      this.flowT = ENEMIES.flowFieldInterval;
    }
    // Spatial hash for separation
    this.hash.clear();
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const k = hashKey(z.pos.x, z.pos.z);
      let arr = this.hash.get(k);
      if (!arr) this.hash.set(k, (arr = []));
      arr.push(z);
    }
    let alertCount = 0;
    let corpses = 0;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.alive) {
        corpses++;
        if (z.deathT > ENEMIES.corpseLifetime + 1.8 || (corpses > ENEMIES.maxCorpses && z.deathT > 1)) {
          this.release(z);
          this.zombies.splice(i, 1);
        }
        continue;
      }
      if (z.riseT > 0) { z.riseT = Math.max(0, z.riseT - dt); z.vel.x = z.vel.z = 0; continue; } // clawing out of the ground
      if (z.link >= 0) { this.stepLink(z, dt); continue; } // on a ladder / mid-drop
      this.think(z, dt, p);
      if (z.state === 'chase' || z.state === 'attack') alertCount++;
      if (z.link >= 0) continue;
      if (z.entry >= 0 && z.entryPhase !== 'approach') continue; // positioned by the barricade logic
      this.moveZombie(z, dt, world);
    }
    this.alertLevel = alertCount;
  }

  private think(z: Zombie, dt: number, p: PlayerTarget): void {
    z.stateT += dt;
    z.attackCD = Math.max(0, z.attackCD - dt);
    if (z.frozenT > 0) {
      z.frozenT -= dt;
      z.vel.x = z.vel.z = 0;
      return;
    }
    if (z.entry >= 0 && this.barricades) { this.thinkEntry(z, dt, p); return; }
    const dx = p.x - z.pos.x, dz = p.z - z.pos.z;
    const dist = Math.hypot(dx, dz);
    const world = this.level.world;
    const nav = this.level.nav;
    let desiredSpeed = 0;
    let dirX = 0, dirZ = 0;
    // Staggered line-of-sight evaluation
    z.losT -= dt;
    if (z.losT <= 0) {
      z.losT = ENEMIES.losCheckInterval + Math.random() * 0.1;
      const eyeY = z.pos.y + 1.55 * z.scale;
      z.hasLOS = dist < 60 && !world.segmentBlocked(z.pos.x, eyeY, z.pos.z, p.x, p.eyeY, p.z);
    }
    z.voiceT -= dt;
    if (z.voiceT <= 0) {
      z.voiceT = 3 + Math.random() * 6;
      if (dist < 35) this.audio.zombieVoice(z.pos, z.elite ? 'elite' : 'groan', z.type === 'runner' ? 1.3 : z.type === 'armored' ? 0.8 : 1);
    }

    switch (z.state) {
      case 'idle': {
        // Wander a little around the spawn position.
        z.wanderT -= dt;
        if (z.wanderT <= 0) {
          z.wanderT = 3 + Math.random() * 5;
          const a = Math.random() * Math.PI * 2;
          z.wanderX = z.pos.x + Math.cos(a) * 4;
          z.wanderZ = z.pos.z + Math.sin(a) * 4;
          if (!nav.isWalkable(z.wanderX, z.wanderZ, z.pos.y) || Math.random() < 0.4) { z.wanderX = z.pos.x; z.wanderZ = z.pos.z; }
        }
        const wx = z.wanderX - z.pos.x, wz = z.wanderZ - z.pos.z;
        const wl = Math.hypot(wx, wz);
        if (wl > 0.5) { dirX = wx / wl; dirZ = wz / wl; desiredSpeed = 0.5; }
        const sight = z.elite ? 30 : ENEMIES.sightRange;
        if (p.alive && (dist < 6 || (dist < sight && z.hasLOS))) {
          z.setState(z.type === 'runner' || z.elite ? 'alert' : 'chase');
          if (z.elite) { this.eliteAggro = true; this.audio.zombieVoice(z.pos, 'elite'); }
        }
        break;
      }
      case 'alert': {
        dirX = dx / (dist || 1); dirZ = dz / (dist || 1);
        if (z.stateT === dt || z.stateT < dt * 1.5) this.audio.zombieVoice(z.pos, z.elite ? 'elite' : 'scream', z.type === 'runner' ? 1.2 : 1);
        if (z.stateT > (z.elite ? 1.1 : 0.55)) z.setState('chase');
        break;
      }
      case 'chase': {
        if (!p.alive) { z.setState('idle'); break; }
        const range = z.def.attackRange;
        const dy = Math.abs(p.y - z.pos.y);
        if (dist < range && dy < 1.9 && z.attackCD <= 0 && z.hasLOS) {
          z.setState('attack');
          this.audio.zombieVoice(z.pos, z.elite ? 'elite' : 'attack', z.type === 'runner' ? 1.2 : 1);
          break;
        }
        // Direct pursuit when there's a clear walkable line, otherwise follow the flow field.
        const sameLevel = Math.abs(p.y - z.pos.y) < 1.2;
        if (dist < 28 && z.hasLOS && sameLevel && (dist < 3 || nav.walkLine(z.pos.x, z.pos.z, p.x, p.z, z.pos.y))) {
          dirX = dx / (dist || 1); dirZ = dz / (dist || 1);
          // Close in on a slot around the player so attackers fan out instead of stacking.
          if (dist < 5 && dist > range * 0.9 && !z.elite) {
            const slot = surroundSlot(p.x, p.z, z.pos.x, z.pos.z, z.lane, range * 0.85);
            const sx = slot.x - z.pos.x, sz = slot.z - z.pos.z, sl = Math.hypot(sx, sz);
            if (sl > 0.2 && nav.isWalkable(slot.x, slot.z, z.pos.y)) { dirX = sx / sl; dirZ = sz / sl; }
          }
        } else if (nav.flowDir(z.pos.x, z.pos.z, this.dir, z.pos.y)) {
          dirX = this.dir.x; dirZ = this.dir.z;
          if ((this.dir.link ?? -1) < 0) {
            // Lanes: bias the shared flow sideways per zombie so the horde spreads across corridors.
            const zy = z.pos.y;
            const l = steerLane(dirX, dirZ, z.lane, dist, (ddx, ddz) => nav.isWalkable(z.pos.x + ddx * 1.2, z.pos.z + ddz * 1.2, zy));
            dirX = l.x; dirZ = l.z;
          }
          if ((this.dir.link ?? -1) >= 0 && z.grounded) {
            const ends = nav.linkEnds(this.dir.link!);
            if (ends && Math.hypot(ends.from.x - z.pos.x, ends.from.z - z.pos.z) < 0.7 && Math.abs(ends.from.y - z.pos.y) < 0.8) { this.beginLink(z, ends); break; }
          }
        } else {
          dirX = dx / (dist || 1); dirZ = dz / (dist || 1);
        }
        // Stuck detection -> brief sidestep
        z.stuckT += dt;
        if (z.stuckT > 1.2) {
          const moved = Math.hypot(z.pos.x - z.lastX, z.pos.z - z.lastZ);
          if (moved < 0.35 && dist > range + 0.5) { z.sideStepT = 0.6; z.sideSign = Math.random() < 0.5 ? -1 : 1; }
          z.lastX = z.pos.x; z.lastZ = z.pos.z; z.stuckT = 0;
        }
        if (z.sideStepT > 0) {
          z.sideStepT -= dt;
          const sx = -dirZ * z.sideSign, sz = dirX * z.sideSign;
          dirX = dirX * 0.3 + sx; dirZ = dirZ * 0.3 + sz;
          const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l;
        }
        desiredSpeed = z.speed * (dist < range + 0.3 ? 0.2 : 1);
        // Elite charges when it has a clear line at mid range
        if (z.elite && z.hasLOS && dist > 6 && dist < 16) desiredSpeed = 5.2;
        break;
      }
      case 'attack': {
        const wind = z.def.windup;
        if (z.stateT < wind) {
          dirX = dx / (dist || 1); dirZ = dz / (dist || 1);
          desiredSpeed = z.type === 'runner' ? 1.5 : 0.4; // slight lunge
        }
        if (!z.attackResolved && z.stateT >= wind) {
          z.attackResolved = true;
          this.resolveAttack(z, p);
        }
        if (z.stateT >= wind + 0.4) {
          z.attackCD = z.def.attackCooldown * (0.85 + Math.random() * 0.3);
          z.setState('chase');
        }
        break;
      }
      case 'stagger': {
        desiredSpeed = 0;
        if (z.stateT > 0.45) z.setState('chase');
        break;
      }
    }
    // Smooth turning toward movement direction
    if (dirX !== 0 || dirZ !== 0) {
      const targetYaw = Math.atan2(dirX, dirZ);
      let d = targetYaw - z.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      z.yaw += d * Math.min(1, dt * (z.state === 'attack' ? 5 : 8));
    }
    // Acceleration toward desired velocity
    const tvx = dirX * desiredSpeed, tvz = dirZ * desiredSpeed;
    const acc = Math.min(1, dt * (z.type === 'runner' ? 8 : 5));
    z.vel.x += (tvx - z.vel.x) * acc;
    z.vel.z += (tvz - z.vel.z) * acc;
  }


  /** Outside → window → tear planks → climb through → normal pursuit. */
  private thinkEntry(z: Zombie, dt: number, p: PlayerTarget): void {
    const b = this.barricades!;
    const w = b.win(z.entry);
    z.voiceT -= dt;
    if (z.voiceT <= 0) {
      z.voiceT = 2.5 + Math.random() * 5;
      if (Math.hypot(p.x - z.pos.x, p.z - z.pos.z) < 30) this.audio.zombieVoice(z.pos, 'groan', z.type === 'fast' ? 1.4 : 1);
    }
    if (z.entryPhase === 'approach') {
      // Queue behind whoever is already working this window.
      let q = 0;
      for (const o of this.zombies) if (o !== z && o.alive && o.entry === z.entry && o.entryPhase !== 'approach') q++;
      const nl = Math.hypot(w.outside.x - w.inside.x, w.outside.z - w.inside.z) || 1;
      const tgt = q > 0 ? windowQueueSpot(w.outside.x, w.outside.z, (w.outside.x - w.inside.x) / nl, (w.outside.z - w.inside.z) / nl, q) : w.outside;
      const dx = tgt.x - z.pos.x, dz = tgt.z - z.pos.z;
      const d = Math.hypot(dx, dz);
      if (q > 0 && d < 0.35) { z.vel.x = z.vel.z = 0; z.yaw = Math.atan2(w.inside.x - w.outside.x, w.inside.z - w.outside.z); return; }
      if (d < 0.4) {
        z.entryPhase = 'tear';
        z.entryT = TEAR_SECONDS * (0.6 + Math.random() * 0.5);
        z.vel.x = z.vel.z = 0;
        z.yaw = Math.atan2(w.inside.x - w.outside.x, w.inside.z - w.outside.z);
        return;
      }
      const sp = Math.min(z.speed, 2.2 + (z.type === 'fast' ? 2 : 0));
      z.yaw = Math.atan2(dx, dz);
      z.vel.x = (dx / d) * sp;
      z.vel.z = (dz / d) * sp;
      return;
    }
    if (z.entryPhase === 'tear') {
      z.yaw = Math.atan2(w.inside.x - w.outside.x, w.inside.z - w.outside.z);
      // Stand too close to the barricade and you get swiped through the gaps.
      if (p.alive && z.attackCD <= 0 && b.planks(z.entry) < 6 && canAttackThroughWindow(p.x, p.y, p.z, w.inside.x, w.inside.z, w.floor)) {
        z.attackCD = z.def.attackCooldown * 1.2;
        this.audio.zombieSwipe(z.pos);
        this.events.onPlayerHit(z.def.damage * z.damageMult * 0.75, z.pos.x, z.pos.z, false);
      }
      if (b.planks(z.entry) <= 0) {
        z.entryPhase = 'climb';
        z.entryT = 0;
        z.climbFrom = { ...z.pos };
        return;
      }
      z.entryT -= dt * (z.type === 'boss' || z.type === 'brute' ? 3 : z.type === 'fast' ? 1.8 : 1);
      if (z.entryT <= 0) {
        z.entryT = TEAR_SECONDS * (0.8 + Math.random() * 0.4);
        b.tear(z.entry, z);
        if (Math.random() < 0.5) this.audio.zombieVoice(z.pos, 'attack', 0.9);
      }
      return;
    }
    // climb
    z.entryT += dt;
    const t = Math.min(1, z.entryT / (z.type === 'fast' ? 0.5 : 0.9));
    const fx = z.climbFrom.x + (w.inside.x - z.climbFrom.x) * t;
    const fz = z.climbFrom.z + (w.inside.z - z.climbFrom.z) * t;
    z.pos.x = fx; z.pos.z = fz;
    z.pos.y = w.floor + Math.sin(t * Math.PI) * 0.9;
    if (t >= 1) {
      z.entry = -1;
      z.pos.y = this.level.world.groundHeight(z.pos.x, z.pos.z, 0.3, w.floor + 1);
      z.vy = 0;
      z.setState('chase');
      z.lastX = z.pos.x; z.lastZ = z.pos.z;
    }
  }

  /** Start traversing an authored nav link (ladder, drop, jump, vault). */
  private beginLink(z: Zombie, ends: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; kind: NavLink['kind'] }): void {
    const dy = ends.to.y - ends.from.y;
    const h = Math.hypot(ends.to.x - ends.from.x, ends.to.z - ends.from.z);
    const speed = z.type === 'fast' || z.type === 'runner' ? 1.5 : 1;
    const dur = ends.kind === 'ladder' ? (Math.abs(dy) / 1.5 + 0.5) / speed
      : ends.kind === 'drop' ? 0.35 + Math.sqrt(Math.max(0, -dy)) * 0.22 + h * 0.08
      : (0.45 + h * 0.12) / speed;
    z.link = 1;
    z.linkKind = ends.kind;
    z.linkT = 0;
    z.linkDur = Math.max(0.25, dur);
    z.linkFrom = { ...z.pos };
    z.linkTo = { ...ends.to };
    z.vel.x = z.vel.z = 0;
    z.yaw = Math.atan2(ends.to.x - z.pos.x, ends.to.z - z.pos.z);
  }

  private stepLink(z: Zombie, dt: number): void {
    z.linkT += dt;
    const t = Math.min(1, z.linkT / z.linkDur);
    const a = z.linkFrom, b = z.linkTo;
    if (z.linkKind === 'ladder') {
      // Climb vertically first, then step off onto the landing.
      const up = b.y >= a.y;
      const tv = up ? Math.min(1, t / 0.8) : Math.max(0, (t - 0.2) / 0.8);
      const th = up ? Math.max(0, (t - 0.8) / 0.2) : Math.min(1, t / 0.2);
      z.pos.y = a.y + (b.y - a.y) * tv;
      z.pos.x = a.x + (b.x - a.x) * th;
      z.pos.z = a.z + (b.z - a.z) * th;
    } else {
      // Ballistic-looking arc: drops fall, jumps and vaults hop.
      z.pos.x = a.x + (b.x - a.x) * t;
      z.pos.z = a.z + (b.z - a.z) * t;
      const hop = z.linkKind === 'drop' ? 0.35 : z.linkKind === 'vault' ? 0.6 : 0.9;
      const base = z.linkKind === 'drop' ? a.y + (b.y - a.y) * t * t : a.y + (b.y - a.y) * t;
      z.pos.y = base + Math.sin(t * Math.PI) * hop;
    }
    if (t >= 1) {
      z.link = -1;
      z.pos.y = this.level.world.groundHeight(z.pos.x, z.pos.z, 0.3, b.y + 0.5);
      z.vy = 0;
      z.grounded = true;
      z.lastX = z.pos.x; z.lastZ = z.pos.z;
      z.stuckT = 0;
    }
  }

  private resolveAttack(z: Zombie, p: PlayerTarget): void {
    if (!p.alive) return;
    const world = this.level.world;
    const dx = p.x - z.pos.x, dz = p.z - z.pos.z;
    const dist = Math.hypot(dx, dz);
    const reach = z.def.attackRange + (z.elite ? 1.0 : 0.45);
    const dy = Math.abs(p.y - z.pos.y);
    this.audio.zombieSwipe(z.pos);
    if (z.elite) {
      this.audio.eliteSlam(z.pos);
      this.fx.explosion(z.pos.x + Math.sin(z.yaw) * 1.2, 0, z.pos.z + Math.cos(z.yaw) * 1.2, true);
    }
    if (dist > reach || dy > 1.9) return;
    // Facing check (within ~70 degrees) except for the elite's area slam.
    if (!z.elite) {
      const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
      if ((dx * fx + dz * fz) / (dist || 1) < 0.35) return;
    }
    // No hits through walls: chest-to-chest segment must be clear.
    const zy = z.pos.y + 1.2 * z.scale;
    if (world.segmentBlocked(z.pos.x, zy, z.pos.z, p.x, p.y + 1.2, p.z)) return;
    this.events.onPlayerHit(z.def.damage * z.damageMult, z.pos.x, z.pos.z, z.elite || z.type === 'armored');
  }

  private moveZombie(z: Zombie, dt: number, world: Level['world']): void {
    // Separation from neighbours
    let sx = 0, sz = 0;
    const cx = Math.floor(z.pos.x / 2), cz = Math.floor(z.pos.z / 2);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const arr = this.hash.get(((cx + ox) & 0xffff) | (((cz + oz) & 0xffff) << 16));
        if (!arr) continue;
        for (const o of arr) {
          if (o === z) continue;
          const dx = z.pos.x - o.pos.x, dz = z.pos.z - o.pos.z;
          const min = z.radius + o.radius + 0.15;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const push = (min - d) / min;
            sx += (dx / d) * push;
            sz += (dz / d) * push;
          }
        }
      }
    }
    const sep = 3.2;
    const vx = z.vel.x + sx * sep, vz = z.vel.z + sz * sep;
    z.vy -= 20 * dt;
    const res = world.move(z.pos, z.radius, z.height * 0.95, vx * dt, z.vy * dt, vz * dt, 0.5, z.grounded);
    if (res.grounded) z.vy = 0;
    z.grounded = res.grounded;
    if (res.blockedX) z.vel.x *= 0.5;
    if (res.blockedZ) z.vel.z *= 0.5;
  }

  /** Render-rate animation for all visible zombies (skinning happens on the GPU). */
  animate(dt: number, camX: number, camZ: number, cam?: THREE.Camera): void {
    if (cam) {
      cam.updateMatrixWorld();
      this.projView.multiplyMatrices((cam as THREE.PerspectiveCamera).projectionMatrix, cam.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projView);
    }
    for (const z of this.zombies) {
      const d = Math.hypot(z.pos.x - camX, z.pos.z - camZ);
      const far = d > 70;
      if (far && z.alive) { z.mesh.position.set(z.pos.x, z.pos.y, z.pos.z); z.mesh.rotation.set(0, z.yaw, 0); z.hitValid = false; continue; }
      z.animate(dt, this.time);
      if (!cam) continue;
      // Skinned bounds are unreliable, so skinned meshes never self-cull: cull the whole body here instead,
      // and only zombies near the camera cast shadows.
      this.sphere.center.set(z.pos.x, z.pos.y + 0.9 * z.scale, z.pos.z);
      this.sphere.radius = 1.7 * z.scale;
      const inView = this.frustum.intersectsSphere(this.sphere);
      const body = z.glb ? z.glb.root : z.mesh;
      if (!inView) body.visible = false;
      // Distance LOD with hysteresis.
      const want = z.lod === 0 ? (d > 15 ? 1 : 0) : (d < 12 ? 0 : 1);
      if (z.glb?.lodPairs?.length && want !== z.lod) {
        z.lod = want;
        for (const [hi, lo] of z.glb.lodPairs) { hi.visible = want === 0; lo.visible = want === 1; }
      }
      const shadow = d < 16;
      if (z.castsShadow !== shadow) {
        z.castsShadow = shadow;
        body.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = shadow; });
      }
    }
    this.group.updateMatrixWorld(true);
    for (const z of this.zombies) if (z.alive) { z.updateHeadPos(); if (z.hitValid || Math.hypot(z.pos.x - camX, z.pos.z - camZ) <= 70) z.updateHitboxes(); }
  }

  // --------------------------------------------------------------------------------------------
  /** Nearest zombie hit along a ray, up to maxDist. Head sphere is tested before the body box. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): ZombieHit | null {
    let best: ZombieHit | null = null;
    let bestD = maxDist;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      // Broad reject: distance from ray to zombie centre
      const cx = z.pos.x - ox, cz = z.pos.z - oz;
      const along = cx * dx + cz * dz;
      if (along < -1 || along > bestD + 1.5) continue;
      if (z.hitValid) {
        // Bone-attached capsules: head first (index 0), then torso and limbs.
        const h = rayCapsules(z.hitSegs, z.hitCount, ox, oy, oz, dx, dy, dz, bestD);
        if (h) {
          bestD = h.dist;
          const part = HIT_PARTS[h.index];
          best = { z, dist: h.dist, head: part === 'head', x: ox + dx * h.dist, y: oy + dy * h.dist, z_: oz + dz * h.dist, part };
        }
        continue;
      }
      const hr = 0.14 * z.scale;
      const hp = z.headPos;
      const t = raySphere(ox, oy, oz, dx, dy, dz, hp.x, hp.y, hp.z, hr);
      if (t !== null && t < bestD) {
        bestD = t;
        best = { z, dist: t, head: true, x: ox + dx * t, y: oy + dy * t, z_: oz + dz * t, part: 'head' };
      }
      const r = z.elite ? 0.42 : 0.27 * z.scale;
      const top = z.pos.y + (hp.y - z.pos.y) - hr * 0.9;
      const tb = rayAABB(ox, oy, oz, dx, dy, dz, z.pos.x - r, z.pos.y, z.pos.z - r, z.pos.x + r, top, z.pos.z + r);
      if (tb !== null && tb < bestD - 1e-4) {
        bestD = tb;
        best = { z, dist: tb, head: false, x: ox + dx * tb, y: oy + dy * tb, z_: oz + dz * tb, part: 'body' };
      }
    }
    return best;
  }

  /** Applies damage. Returns what happened (for hitmarkers / stats). */
  damage(z: Zombie, amount: number, head: boolean, hx: number, hy: number, hz: number, dirX: number, dirZ: number): DamageOutcome {
    const out: DamageOutcome = { killed: false, head, armor: false, dealt: 0 };
    if (!z.alive) return out;
    let dmg = amount;
    if (z.frozenT > 0) {
      // Frozen zombies shatter from any hit.
      this.fx.sparkBurst(z.pos.x, z.pos.y + 1, z.pos.z, 30, [0.6, 0.9, 1.6]);
      this.audio.impact('glass', { x: z.pos.x, z: z.pos.z });
      z.hp = 0;
      out.dealt = amount;
      out.killed = true;
      this.kill(z, dirX, dirZ, head);
      return out;
    }
    if (this.instaKill && !z.elite) {
      z.helmetHp = 0;
      amount = Math.max(amount, z.hp * 4 + 1);
      dmg = amount;
    }
    if (head) {
      if (z.helmetHp > 0) {
        // Helmet absorbs most of the damage until it breaks
        z.helmetHp -= amount;
        dmg = amount * 0.3;
        out.armor = true;
        if (z.helmetHp <= 0 && z.helmet) {
          z.helmet.visible = false;
          this.fx.sparkBurst(hx, hy, hz, 16, [1, 0.8, 0.4]);
          this.audio.impact('metal', { x: hx, z: hz });
        } else this.fx.sparkBurst(hx, hy, hz, 5, [1, 0.85, 0.5]);
      } else {
        dmg = amount * this.headMultFor();
      }
    } else {
      dmg = amount * z.def.bodyArmorMult;
      if (z.def.bodyArmorMult < 1 && Math.random() < 0.4) this.fx.sparkBurst(hx, hy, hz, 3, [1, 0.8, 0.5]);
    }
    z.hp -= dmg;
    out.dealt = dmg;
    this.fx.bloodHit(hx, hy, hz, dirX, dirZ, head && !out.armor);
    // Being shot always wakes a zombie up
    if (z.state === 'idle') {
      z.setState(z.type === 'runner' || z.elite ? 'alert' : 'chase');
      if (z.elite) this.eliteAggro = true;
    }
    z.flinchV += Math.min(6, dmg / 25) * (z.elite ? 0.3 : 1);
    z.staggerDir = Math.random() < 0.5 ? -1 : 1;
    z.hitReactT = z.elite ? 0.08 : 0.25;
    if (z.hp <= 0) {
      if (head && !out.armor && !z.elite) this.popHead(z, dirX, dirZ);
      this.kill(z, dirX, dirZ, head && !out.armor);
      out.killed = true;
    } else if (this.allowCrawlers && !head && !z.legless && hy < z.pos.y + 0.75 * z.scale && crawlerFromLegHit(z.type, dmg, z.maxHp, this.rnd)) {
      // Legs blown off: drops to the floor and keeps coming.
      z.legless = true;
      z.bones[BONE.thighL].scale.setScalar(0.001);
      z.bones[BONE.thighR].scale.setScalar(0.001);
      z.speed = 0.9;
      this.fx.bloodHit(hx, z.pos.y + 0.4, hz, dirX, dirZ, true);
      this.fx.bloodPool(z.pos.x, z.pos.z, 0.8);
    } else if (dmg >= z.def.staggerThreshold && z.state !== 'attack') {
      z.setState('stagger');
    } else if (dmg >= z.def.staggerThreshold && z.state === 'attack' && z.type !== 'armored' && !z.elite) {
      z.setState('stagger'); // heavy hits interrupt attack windups
    }
    return out;
  }

  /** Headshot multiplier is weapon-specific; the weapon system scales damage before calling. */
  private headMultFor(): number {
    return 1;
  }

  /** Headshot kill: the head bursts. */
  private popHead(z: Zombie, dirX: number, dirZ: number): void {
    z.headless = true;
    z.bones[BONE.head].scale.setScalar(0.001);
    const h = z.headPos;
    for (let i = 0; i < 3; i++) this.fx.bloodHit(h.x, h.y, h.z, dirX + (Math.random() - 0.5), dirZ + (Math.random() - 0.5), true);
    this.fx.sparkBurst(h.x, h.y, h.z, 24, [0.7, 0.05, 0.03]);
    this.audio.impact('flesh', { x: h.x, z: h.z });
  }

  private kill(z: Zombie, dirX: number, dirZ: number, head: boolean): void {
    z.alive = false;
    z.state = 'dead';
    z.deathT = 0;
    // Fall away from the shot direction
    const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
    z.fallDir = dirX * fx + dirZ * fz > 0 ? 1 : -1;
    z.vel.x = z.vel.z = 0;
    this.audio.zombieVoice(z.pos, 'death', z.elite ? 0.5 : 1);
    this.fx.deathPuff(z.pos.x, z.pos.y + 0.8, z.pos.z);
    this.fx.bloodPool(z.pos.x + dirX * 0.8, z.pos.z + dirZ * 0.8, z.elite ? 2 : 1);
    this.events.onKill(z, head);
  }

  /** Explosion damage with falloff; solid geometry between blast and target blocks it. */
  radiusDamage(x: number, y: number, zc: number, radius: number, maxDmg: number): { kills: number; hits: number } {
    const world = this.level.world;
    let kills = 0, hits = 0;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const dx = z.pos.x - x, dz = z.pos.z - zc;
      const d = Math.hypot(dx, dz, z.pos.y + 0.9 - y);
      if (d > radius) continue;
      const blockedChest = world.segmentBlocked(x, y + 0.3, zc, z.pos.x, z.pos.y + 1.0, z.pos.z);
      const blockedHead = world.segmentBlocked(x, y + 0.3, zc, z.headPos.x, z.headPos.y, z.headPos.z);
      if (blockedChest && blockedHead) continue;
      const falloff = 1 - Math.pow(d / radius, 1.4);
      const dmg = maxDmg * falloff * (z.elite ? 0.6 : 1);
      const len = Math.hypot(dx, dz) || 1;
      const r = this.damage(z, dmg, false, z.pos.x, z.pos.y + 1, z.pos.z, dx / len, dz / len);
      hits++;
      if (r.killed) kills++;
      else if (!z.elite && dmg > 40) z.setState('stagger');
    }
    return { kills, hits };
  }

  nearestAlive(x: number, z: number): number {
    let best = Infinity;
    for (const zb of this.zombies) if (zb.alive) best = Math.min(best, Math.hypot(zb.pos.x - x, zb.pos.z - z));
    return best;
  }
}

function hashKey(x: number, z: number): number {
  return (Math.floor(x / 2) & 0xffff) | ((Math.floor(z / 2) & 0xffff) << 16);
}

function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number | null {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return null;
  return tca - Math.sqrt(r * r - d2);
}

function rayAABB(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number | null {
  let tmin = 0, tmax = Infinity;
  const ax = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (const [o, d, a, b] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return null; continue; }
    let t1 = (a - o) / d, t2 = (b - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
