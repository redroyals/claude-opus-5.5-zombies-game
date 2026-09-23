// A single infected: behaviour state, physical body and procedural animation.
import * as THREE from 'three';
import { REGIONS, ZOMBIES, type RegionId, type ZombieDef, type ZombieType } from '../config';
import { BONE, type ZombieVariant } from './ZombieModel';
import { GLB_CAPSULES, MAX_CAPSULES, SEG } from './hitbox';

export type ZState = 'idle' | 'alert' | 'chase' | 'attack' | 'stagger' | 'dead';

export class Zombie {
  type: ZombieType = 'shambler';
  def: ZombieDef = ZOMBIES.shambler;
  region: RegionId = 'low';
  variant!: ZombieVariant;
  mesh!: THREE.SkinnedMesh;
  bones!: THREE.Bone[];
  helmet: THREE.Mesh | null = null;
  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, z: 0 };
  vy = 0;
  yaw = 0;
  hp = 100;
  maxHp = 100;
  helmetHp = 0;
  state: ZState = 'idle';
  stateT = 0;
  speed = 1.5;
  scale = 1;
  attackCD = 0;
  attackResolved = false;
  losT = 0;
  hasLOS = false;
  navT = 0;
  dirX = 0;
  dirZ = 0;
  wanderX = 0;
  wanderZ = 0;
  wanderT = 0;
  phase = 0;
  seed = 0;
  gait = 0; // 0 normal, 1 limp, 2 one arm dangling
  staggerDir = 0;
  flinch = 0;
  flinchV = 0;
  deathT = 0;
  fallDir = 1;
  voiceT = 0;
  stuckT = 0;
  lastX = 0;
  lastZ = 0;
  sideStepT = 0;
  sideSign = 1;
  alive = false;
  active = false;
  elite = false;
  headPos = new THREE.Vector3();
  damageMult = 1;
  reward = 0;
  grounded = true;
  lastDamageFromPlayer = false;
  // Zombies-mode extras
  /** Barricade window this zombie is entering through (-1 = already inside / free roaming). */
  entry = -1;
  entryPhase: 'approach' | 'tear' | 'climb' = 'approach';
  entryT = 0;
  climbFrom = { x: 0, y: 0, z: 0 };
  frozenT = 0;
  headless = false;
  legless = false;
  hitReactT = 0;
  /** Current shadow-casting state of the drawn body (toggled by distance). */
  castsShadow = true;
  /** Lane bias for horde steering (radians). */
  lane = 0;
  /** Sprinter (late-round runner at x1.3 speed). */
  sprinter = false;
  /** >0 while clawing up out of the ground (non-window 'ground' spawns). */
  riseT = 0;
  /** Nav-link traversal (ladders, drops, jumps); link >= 0 while traversing. */
  link = -1;
  linkKind: 'drop' | 'jump' | 'vault' | 'ladder' = 'drop';
  linkT = 0;
  linkDur = 1;
  linkFrom = { x: 0, y: 0, z: 0 };
  linkTo = { x: 0, y: 0, z: 0 };
  /** Skinned GLB instance (when a model exists); the procedural mesh is hidden then. */
  glb: { root: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>; current: string; head: THREE.Object3D | null;
    /** Rig bones per hit capsule endpoint (see GLB_CAPSULES) and the thigh bones hidden when legless. */
    capBones?: (THREE.Object3D | null)[][]; legs?: THREE.Object3D[]; lodPairs?: [THREE.SkinnedMesh, THREE.SkinnedMesh][] } | null = null;
  /** Current distance LOD (0 = full, 1 = simplified). */
  lod = 0;
  /** Bone-attached hit capsules (world space), rebuilt every render frame. */
  readonly hitSegs = new Float32Array(SEG * MAX_CAPSULES);
  hitCount = 0;
  /** False when the capsules are stale (culled far away); the manager falls back to a box. */
  hitValid = false;

  spawn(type: ZombieType, region: RegionId, x: number, z: number, y: number, rngSeed: number): void {
    this.type = type;
    this.def = ZOMBIES[type];
    this.region = region;
    const reg = REGIONS[region];
    this.elite = type === 'elite' || type === 'boss';
    this.entry = -1;
    this.entryPhase = 'approach';
    this.entryT = 0;
    this.frozenT = 0;
    this.headless = false;
    this.legless = type === 'crawler';
    this.hitReactT = 0;
    this.riseT = 0;
    this.link = -1;
    this.hitValid = false;
    this.sprinter = false;
    if (this.bones) {
      this.bones[BONE.head].scale.setScalar(1);
      const ls = this.legless ? 0.001 : 1;
      this.bones[BONE.thighL].scale.setScalar(ls);
      this.bones[BONE.thighR].scale.setScalar(ls);
    }
    this.maxHp = this.def.hp * (this.elite ? 1 : reg.hpMult);
    this.hp = this.maxHp;
    this.helmetHp = this.def.helmetHp * (this.elite ? 1 : reg.hpMult);
    this.damageMult = this.elite ? 1 : reg.damageMult;
    this.reward = this.def.reward * reg.rewardMult;
    this.pos = { x, y, z };
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
    this.seed = rngSeed;
    const r = frac(rngSeed * 12.9898);
    this.speed = this.def.speed[0] + (this.def.speed[1] - this.def.speed[0]) * r;
    this.scale = this.def.scale * (0.95 + frac(rngSeed * 7.13) * 0.1);
    this.gait = type === 'shambler' ? Math.floor(frac(rngSeed * 3.7) * 3) : 0;
    this.phase = frac(rngSeed * 5.1) * Math.PI * 2;
    this.state = 'idle';
    this.stateT = 0;
    this.attackCD = 0;
    this.losT = frac(rngSeed * 2.3) * 0.3;
    this.navT = 0;
    this.hasLOS = false;
    this.deathT = 0;
    this.flinch = this.flinchV = 0;
    this.voiceT = 2 + frac(rngSeed * 9.1) * 6;
    this.stuckT = 0;
    this.sideStepT = 0;
    this.wanderT = 0;
    this.yaw = frac(rngSeed * 1.7) * Math.PI * 2;
    this.alive = true;
    this.active = true;
    this.lastX = x; this.lastZ = z;
    if (this.helmet) this.helmet.visible = true;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.mesh.scale.setScalar(this.scale);
    this.mesh.position.set(x, y, z);
  }

  setState(s: ZState): void {
    if (this.state === 'dead') return;
    this.state = s;
    this.stateT = 0;
    if (s === 'attack') this.attackResolved = false;
  }

  get height(): number {
    return 1.75 * this.scale;
  }

  get radius(): number {
    return (this.elite ? 0.45 : 0.28) * Math.min(1.2, this.scale);
  }

  /** Render-rate animation: procedural skeleton always (it drives hitboxes), plus the skinned GLB when present. */
  animate(dt: number, time: number): void {
    this.animateBody(dt, time);
    if (this.riseT > 0) this.mesh.position.y -= (this.riseT / 1.2) * 1.8 * this.scale;
    if (this.glb) this.animateGlb(dt);
  }

  private animateGlb(dt: number): void {
    const g = this.glb!;
    this.mesh.visible = false;
    g.root.visible = this.active;
    g.root.position.copy(this.mesh.position);
    g.root.rotation.set(0, this.yaw, 0);
    if (this.state === 'dead') g.root.position.y = this.pos.y - (this.deathT > 7 ? (this.deathT - 7) * 0.35 : 0);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let want = 'idle';
    if (this.state === 'dead') want = 'death';
    else if (this.legless) want = 'crawl';
    else if (this.state === 'attack' || (this.entry >= 0 && this.entryPhase === 'tear')) want = 'attack';
    else if (speed > 3) want = 'run';
    else if (speed > 0.2) want = 'walk';
    const pick = g.actions[want] ? want : want === 'run' && g.actions.walk ? 'walk' : want === 'crawl' && g.actions.walk ? 'walk' : g.actions.walk ? 'walk' : Object.keys(g.actions)[0];
    if (pick && pick !== g.current) {
      const next = g.actions[pick];
      next.reset();
      next.setLoop(pick === 'death' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = pick === 'death';
      if (g.current && g.actions[g.current]) g.actions[g.current].crossFadeTo(next, 0.2, false);
      next.play();
      g.current = pick;
    }
    const a = g.actions[g.current];
    if (a && (g.current === 'walk' || g.current === 'run')) a.timeScale = Math.max(0.5, speed / (g.current === 'run' ? 4 : 1.4));
    g.mixer.update(this.frozenT > 0 ? 0 : dt);
    if (g.head) g.head.scale.setScalar(this.headless ? 0.001 : 1);
    // Legless crawlers (spawned or shot off) drag a torso: collapse the leg chains.
    if (g.legs) for (const l of g.legs) l.scale.setScalar(this.legless ? 0.001 : 1);
  }

  /** Rebuild the hit capsules from the drawn skeleton (GLB rig if present, else the procedural one). */
  updateHitboxes(): void {
    const segs = this.hitSegs;
    const s = this.scale;
    const g = this.glb;
    const va = new THREE.Vector3(), vb = new THREE.Vector3();
    let n = 0;
    const put = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const k = n * SEG;
      segs[k] = a.x; segs[k + 1] = a.y; segs[k + 2] = a.z; segs[k + 3] = b.x; segs[k + 4] = b.y; segs[k + 5] = b.z; segs[k + 6] = r;
      n++;
    };
    if (g && g.capBones && g.root.visible) {
      GLB_CAPSULES.forEach((c, i) => {
        const [ba, bb] = g.capBones![i];
        if (!ba || !bb || (c.legs && this.legless) || (i === 0 && this.headless)) { put(va.set(0, -999, 0), vb.set(0, -999, 0), 0); return; }
        ba.getWorldPosition(va); bb.getWorldPosition(vb);
        put(va, vb, c.r * s);
      });
    } else {
      const b = this.bones;
      const p = (i: number, v: THREE.Vector3) => b[i].getWorldPosition(v);
      const ext = (i: number, j: number, len: number, out: THREE.Vector3) => { const a = p(i, new THREE.Vector3()), c = p(j, new THREE.Vector3()); return out.copy(c).sub(a).setLength(len * s).add(c); };
      p(BONE.head, va); vb.copy(va).y += 0.2 * s;
      put(va, vb, this.headless ? 0 : 0.13 * s);
      put(p(BONE.hips, va), p(BONE.neck, vb), 0.19 * s);
      for (const [arm, fore] of [[BONE.armL, BONE.foreL], [BONE.armR, BONE.foreR]]) {
        put(p(arm, va), p(fore, vb), 0.065 * s);
        put(p(fore, va), ext(arm, fore, 0.26, vb), 0.055 * s);
      }
      for (const [th, sh] of [[BONE.thighL, BONE.shinL], [BONE.thighR, BONE.shinR]]) {
        const r = this.legless ? 0 : 1;
        put(p(th, va), p(sh, vb), 0.085 * s * r);
        put(p(sh, va), ext(th, sh, 0.43, vb), 0.065 * s * r);
      }
    }
    this.hitCount = n;
    this.hitValid = true;
    // The head target follows the drawn head.
    if (segs[6] > 0) this.headPos.set((segs[0] + segs[3]) / 2, (segs[1] + segs[4]) / 2, (segs[2] + segs[5]) / 2);
  }

  /** Procedural animation. Runs at render rate with the frame delta. */
  private animateBody(dt: number, time: number): void {
    const b = this.bones;
    const s = this.seed;
    const moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    const runner = this.type === 'runner' || this.type === 'fast';
    const heavy = this.type === 'armored' || this.type === 'brute' || this.elite;
    // Gait frequency tied to actual ground speed so feet don't skate.
    const stride = runner ? 2.0 : heavy ? 1.35 : 1.1;
    this.phase += (moveSpeed / stride) * Math.PI * dt + dt * 0.3;
    const ph = this.phase;
    const amp = Math.min(1, moveSpeed / (runner ? 4 : 1.6));
    this.flinchV += (-120 * this.flinch - 14 * this.flinchV) * dt;
    this.flinch += this.flinchV * dt;

    // Reset
    for (const bone of b) bone.rotation.set(0, 0, 0);
    b[BONE.hips].position.y = 0.95;

    if (this.state === 'dead') {
      this.animateDeath(dt);
      return;
    }
    if (this.frozenT > 0) {
      // Frozen solid mid-stride: hold the pose, slight shiver.
      this.mesh.position.set(this.pos.x + Math.sin(time * 60) * 0.004, this.pos.y, this.pos.z);
      this.mesh.rotation.set(0, this.yaw, 0);
      return;
    }
    if (this.legless) {
      // Crawler: torso dragged along the floor by the arms, head craned up at the player.
      const crawl = time * (2 + moveSpeed * 3) + s;
      b[BONE.hips].position.y = 0.22;
      b[BONE.hips].rotation.x = 1.35;
      b[BONE.spine].rotation.x = 0.1 + this.flinch * -0.4;
      b[BONE.head].rotation.x = -1.1;
      b[BONE.jaw].rotation.x = 0.25 + Math.max(0, Math.sin(time * 3 + s)) * 0.3;
      b[BONE.armL].rotation.x = -2.2 + Math.sin(crawl) * 0.7;
      b[BONE.armR].rotation.x = -2.2 - Math.sin(crawl) * 0.7;
      b[BONE.foreL].rotation.x = -0.3 - Math.max(0, Math.cos(crawl)) * 0.6;
      b[BONE.foreR].rotation.x = -0.3 - Math.max(0, -Math.cos(crawl)) * 0.6;
      b[BONE.armL].rotation.z = 0.35; b[BONE.armR].rotation.z = -0.35;
      if (this.state === 'attack') { b[BONE.armL].rotation.x = -2.9; b[BONE.armR].rotation.x = -2.7; }
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.rotation.set(0, this.yaw, 0);
      return;
    }
    const limp = this.gait === 1 ? 0.45 : 1;
    const legA = (runner ? 0.85 : heavy ? 0.5 : 0.42) * amp;
    b[BONE.thighL].rotation.x = -Math.sin(ph) * legA * limp;
    b[BONE.thighR].rotation.x = Math.sin(ph) * legA;
    b[BONE.shinL].rotation.x = Math.max(0, Math.sin(ph + 1.3)) * legA * 1.5 * limp + 0.05;
    b[BONE.shinR].rotation.x = Math.max(0, Math.sin(ph + 1.3 + Math.PI)) * legA * 1.5 + 0.05;
    b[BONE.hips].position.y = 0.95 - Math.abs(Math.sin(ph)) * 0.035 * amp - (runner ? 0.04 * amp : 0);
    b[BONE.hips].rotation.y = Math.sin(ph) * 0.12 * amp;
    b[BONE.hips].rotation.z = this.gait === 1 ? Math.sin(ph) * 0.12 * amp + 0.05 : Math.sin(ph) * 0.04 * amp;

    const lean = runner ? 0.42 : heavy ? 0.12 : 0.22 + frac(s * 3.3) * 0.12;
    b[BONE.spine].rotation.x = lean * (0.5 + amp * 0.5) + this.flinch * -0.6;
    b[BONE.spine].rotation.y = this.flinch * 0.4 * this.staggerDir;
    b[BONE.chest].rotation.y = -Math.sin(ph) * (runner ? 0.2 : 0.1) * amp;
    b[BONE.chest].rotation.z = Math.sin(time * 0.7 + s) * 0.04;
    b[BONE.head].rotation.x = -lean * 0.6 + Math.sin(time * 1.3 + s * 4) * 0.08 + frac(s * 7.7) * 0.2 - 0.1;
    b[BONE.head].rotation.z = (frac(s * 5.5) - 0.5) * 0.5 + Math.sin(time * 0.9 + s) * 0.06;
    b[BONE.jaw].rotation.x = 0.1 + Math.max(0, Math.sin(time * 2.1 + s * 3)) * 0.15;

    // Arms by archetype
    if (runner) {
      b[BONE.armL].rotation.x = Math.sin(ph) * 1.0 * amp - 0.4;
      b[BONE.armR].rotation.x = -Math.sin(ph) * 1.0 * amp - 0.4;
      b[BONE.foreL].rotation.x = -1.3;
      b[BONE.foreR].rotation.x = -1.3;
      b[BONE.armL].rotation.z = 0.25;
      b[BONE.armR].rotation.z = -0.25;
    } else if (heavy) {
      b[BONE.armL].rotation.x = -0.35 + Math.sin(ph) * 0.35 * amp;
      b[BONE.armR].rotation.x = -0.35 - Math.sin(ph) * 0.35 * amp;
      b[BONE.foreL].rotation.x = -0.6;
      b[BONE.foreR].rotation.x = -0.6;
      b[BONE.armL].rotation.z = 0.3;
      b[BONE.armR].rotation.z = -0.3;
    } else {
      const reach = -1.25 - frac(s * 2.1) * 0.25;
      const wob = Math.sin(time * 1.7 + s) * 0.1;
      b[BONE.armL].rotation.x = reach + wob + Math.sin(ph) * 0.1;
      b[BONE.armR].rotation.x = this.gait === 2 ? 0.1 + Math.sin(ph) * 0.15 : reach - wob - Math.sin(ph) * 0.1;
      b[BONE.foreL].rotation.x = -0.25;
      b[BONE.foreR].rotation.x = this.gait === 2 ? 0 : -0.3;
      b[BONE.armL].rotation.z = 0.12;
      b[BONE.armR].rotation.z = -0.12;
    }
    if (this.state === 'idle') {
      // Swaying, head lolling, arms low
      const sway = Math.sin(time * 0.8 + s * 2);
      b[BONE.spine].rotation.x = 0.3;
      b[BONE.spine].rotation.z = sway * 0.08;
      b[BONE.head].rotation.x = 0.35;
      if (!runner && !heavy && amp < 0.3) {
        b[BONE.armL].rotation.x = -0.3 + sway * 0.1;
        b[BONE.armR].rotation.x = -0.2 - sway * 0.1;
      }
    } else if (this.state === 'alert') {
      const w = Math.min(1, this.stateT / 0.25);
      b[BONE.spine].rotation.x = -0.2 * w;
      b[BONE.head].rotation.x = -0.4 * w;
      b[BONE.jaw].rotation.x = 0.55 * w;
      b[BONE.armL].rotation.x = -0.6; b[BONE.armL].rotation.z = 0.8 * w;
      b[BONE.armR].rotation.x = -0.6; b[BONE.armR].rotation.z = -0.8 * w;
    } else if (this.state === 'attack') {
      const wind = this.def.windup;
      const t = this.stateT;
      const up = Math.min(1, t / wind);
      const strike = t > wind ? Math.min(1, (t - wind) / 0.14) : 0;
      const armUp = -2.7 * easeOut(up) + (2.7 - 0.5) * easeOut(strike);
      b[BONE.armL].rotation.x = armUp;
      b[BONE.armR].rotation.x = this.gait === 2 && !this.elite ? 0 : armUp + (this.elite ? 0 : 0.25);
      b[BONE.foreL].rotation.x = -0.4 * (1 - strike);
      b[BONE.foreR].rotation.x = -0.4 * (1 - strike);
      b[BONE.armL].rotation.z = 0.25; b[BONE.armR].rotation.z = -0.25;
      b[BONE.spine].rotation.x = -0.25 * up + 0.75 * strike;
      b[BONE.head].rotation.x = -0.3 * up + 0.2 * strike;
      b[BONE.jaw].rotation.x = 0.6;
    } else if (this.state === 'stagger') {
      b[BONE.spine].rotation.x = -0.5 * Math.max(0, 1 - this.stateT / 0.45);
      b[BONE.armL].rotation.x = -0.4; b[BONE.armR].rotation.x = 0.1;
    }
    if (this.entry >= 0 && this.entryPhase === 'tear') {
      // Ripping boards off: alternating two-handed clawing at the window.
      const k = time * 7 + s;
      b[BONE.armL].rotation.x = -1.7 + Math.sin(k) * 0.6;
      b[BONE.armR].rotation.x = -1.7 - Math.sin(k) * 0.6;
      b[BONE.foreL].rotation.x = -0.6 + Math.cos(k) * 0.4;
      b[BONE.foreR].rotation.x = -0.6 - Math.cos(k) * 0.4;
      b[BONE.spine].rotation.x = 0.35;
      b[BONE.jaw].rotation.x = 0.5;
    } else if (this.entry >= 0 && this.entryPhase === 'climb') {
      const t = Math.min(1, this.entryT / 0.9);
      b[BONE.spine].rotation.x = 0.9 * Math.sin(t * Math.PI);
      b[BONE.thighL].rotation.x = -1.2 * Math.sin(t * Math.PI);
      b[BONE.thighR].rotation.x = -0.6 * Math.sin(t * Math.PI);
      b[BONE.armL].rotation.x = -2.2; b[BONE.armR].rotation.x = -2.0;
    }
    // Hit reaction: a sharp flinch of the torso/head on top of whatever the body is doing.
    if (this.hitReactT > 0) {
      this.hitReactT = Math.max(0, this.hitReactT - dt);
      const k = this.hitReactT / 0.25;
      b[BONE.chest].rotation.x -= 0.5 * k;
      b[BONE.head].rotation.x -= 0.4 * k;
      b[BONE.chest].rotation.y += 0.3 * k * this.staggerDir;
    }
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.set(0, this.yaw, 0);
  }

  private animateDeath(dt: number): void {
    this.deathT += dt;
    const b = this.bones;
    const t = Math.min(1, this.deathT / 0.75);
    const e = t * t;
    b[BONE.shinL].rotation.x = 0.8 * (1 - e) + 0.1;
    b[BONE.shinR].rotation.x = 0.4 * (1 - e) + 0.15;
    b[BONE.thighL].rotation.x = -0.4 * Math.sin(t * Math.PI);
    b[BONE.armL].rotation.x = -1.2 * (1 - t) - 2.6 * e * (this.fallDir < 0 ? 1 : 0.3);
    b[BONE.armR].rotation.x = -0.6 * (1 - t) - 2.4 * e * (this.fallDir < 0 ? 0.6 : 0.2);
    b[BONE.armL].rotation.z = 0.8 * e; b[BONE.armR].rotation.z = -0.9 * e;
    b[BONE.head].rotation.x = 0.5 * this.fallDir * e;
    b[BONE.head].rotation.z = 0.6 * e * (frac(this.seed) > 0.5 ? 1 : -1);
    b[BONE.jaw].rotation.x = 0.5;
    b[BONE.spine].rotation.x = 0.3 * this.fallDir * e;
    const ang = (Math.PI / 2) * this.fallDir * e;
    const sink = this.deathT > 7 ? (this.deathT - 7) * 0.35 : 0;
    this.mesh.position.set(this.pos.x, this.pos.y + Math.abs(Math.sin(ang)) * 0.14 * this.scale - sink, this.pos.z);
    this.mesh.rotation.set(0, this.yaw, 0);
    this.mesh.rotateX(ang);
  }

  updateHeadPos(): void {
    this.bones[BONE.head].getWorldPosition(this.headPos);
    this.headPos.y += 0.07 * this.scale;
  }
}

function frac(x: number): number {
  return x - Math.floor(x) ? Math.abs(Math.sin(x * 43758.5453)) % 1 : 0.5;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
