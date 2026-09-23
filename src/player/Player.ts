// First-person player movement: acceleration-based walking, sprint, crouch with clearance checks,
// jumping, gravity and collision sliding. Pure simulation - the camera reads from it.
import { PLAYER, WORLD } from '../config';
import type { CollisionWorld } from '../world/Collision';
import type { Input } from '../core/Input';
import { canSprint, createVitals, type Vitals } from './Vitals';

export interface MoveEvents {
  footstep: boolean;
  landed: number; // impact speed on landing (0 = none)
  jumped: boolean;
  slid: boolean;
  mantled: boolean;
}

/**
 * Pure ledge probe for mantling. Scans upward in front of the player for the first height where a
 * standing capsule fits on top of an obstacle. Returns the ledge top (world y) or null.
 */
export function findMantleLedge(world: Pick<CollisionWorld, 'overlaps'>, x: number, y: number, z: number, dirX: number, dirZ: number): number | null {
  const ax = x + dirX * PLAYER.mantleReach, az = z + dirZ * PLAYER.mantleReach;
  // Something must actually be in front at knee/chest height.
  if (!world.overlaps(ax, y + PLAYER.mantleMin - 0.05, az, PLAYER.radius * 0.8, 0.1)) return null;
  for (let h = PLAYER.mantleMin; h <= PLAYER.mantleMax + 1e-6; h += 0.05) {
    if (world.overlaps(ax, y + h, az, PLAYER.radius, PLAYER.crouchHeight)) continue;
    // Free on top: the column above the player must be clear too so we can lift into it.
    if (world.overlaps(x, y + 0.05, z, PLAYER.radius * 0.9, h + PLAYER.crouchHeight)) return null;
    return y + h;
  }
  return null;
}

/** A climbable ladder column (see zombies mapcompile CLadder). */
export interface LadderVolume { x: number; z: number; y0: number; y1: number; top: { x: number; y: number; z: number } }

/** Pure ladder check: the ladder the player is on (within reach and height range), or null. */
export function ladderAt(ladders: LadderVolume[], x: number, y: number, z: number): LadderVolume | null {
  for (const l of ladders) if (Math.hypot(x - l.x, z - l.z) < 0.75 && y >= l.y0 - 0.3 && y <= l.y1 + 0.2) return l;
  return null;
}

export class Player {
  pos = { x: 0, y: 0, z: 0 };
  /** Climbable ladders in the current arena. */
  ladders: LadderVolume[] = [];
  /** Playable bounds override (null = the extraction WORLD bounds). */
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number } | null = null;
  climbing = false;
  vel = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  height: number = PLAYER.standHeight;
  crouched = false;
  grounded = true;
  sprinting = false;
  moving = false;
  speed2d = 0;
  vitals: Vitals = createVitals();
  stepPhase = 0;
  /** Accumulated view recoil in radians (applied to pitch/yaw, recovers over time). */
  recoilPitch = 0;
  recoilYaw = 0;
  aiming = false;
  /** 0..1 aim transition, driven by weapon system. */
  adsT = 0;
  /** >0 while sliding (seconds left). */
  slideT = 0;
  private slideCd = 0;
  private slideDir = { x: 0, z: 0 };
  /** Mantle tween state; active while mantleT < 1. */
  mantling = false;
  private mantleT = 0;
  private mantleFrom = { x: 0, y: 0, z: 0 };
  private mantleTo = { x: 0, y: 0, z: 0 };
  private stepDist = 0;
  private airTime = 0;

  reset(x: number, z: number, yaw: number, y = 0): void {
    this.pos = { x, y, z };
    this.climbing = false;
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = yaw;
    this.pitch = 0;
    this.height = PLAYER.standHeight;
    this.crouched = false;
    this.grounded = true;
    this.sprinting = false;
    this.vitals = createVitals();
    this.recoilPitch = this.recoilYaw = 0;
    this.stepDist = 0;
    this.adsT = 0;
    this.slideT = 0;
    this.slideCd = 0;
    this.mantling = false;
  }

  get eyeY(): number {
    return this.pos.y + this.height - PLAYER.eyeOffset;
  }

  look(dx: number, dy: number, sensitivity: number): void {
    const k = 0.0022 * sensitivity * (1 - this.adsT * 0.35);
    this.yaw -= dx * k;
    this.pitch -= dy * k;
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  update(dt: number, input: Input, world: CollisionWorld, opts: { canSprintExtra: boolean; speedMult: number }): MoveEvents {
    const ev: MoveEvents = { footstep: false, landed: 0, jumped: false, slid: false, mantled: false };
    const v = this.vitals;
    if (this.mantling) { this.updateMantle(dt); return ev; }
    this.slideCd = Math.max(0, this.slideCd - dt);
    // --- Slide: crouch while sprinting on the ground ---
    if (this.sprinting && this.grounded && this.slideCd <= 0 && this.slideT <= 0 && input.consume('crouch')) {
      const sp = Math.max(PLAYER.slideSpeed, Math.hypot(this.vel.x, this.vel.z) * 1.15);
      const l = Math.hypot(this.vel.x, this.vel.z) || 1;
      this.slideDir = { x: this.vel.x / l, z: this.vel.z / l };
      this.vel.x = this.slideDir.x * sp;
      this.vel.z = this.slideDir.z * sp;
      this.slideT = PLAYER.slideTime;
      this.crouched = true;
      this.sprinting = false;
      ev.slid = true;
    }
    if (this.slideT > 0) return this.updateSlide(dt, input, world, ev);
    // --- Crouch toggle with ceiling clearance check ---
    if (input.consume('crouch')) {
      if (this.crouched) {
        if (!world.overlaps(this.pos.x, this.pos.y + 0.02, this.pos.z, PLAYER.radius, PLAYER.standHeight - 0.02)) this.crouched = false;
      } else this.crouched = true;
    }
    // Sprinting while crouched stands up if there is room.
    let fwd = 0, strafe = 0;
    if (input.isHeld('forward')) fwd += 1;
    if (input.isHeld('back')) fwd -= 1;
    if (input.isHeld('right')) strafe += 1;
    if (input.isHeld('left')) strafe -= 1;
    const wantSprint = input.isHeld('sprint') && fwd > 0 && opts.canSprintExtra;
    if (wantSprint && this.crouched && !world.overlaps(this.pos.x, this.pos.y + 0.02, this.pos.z, PLAYER.radius, PLAYER.standHeight - 0.02)) this.crouched = false;
    this.sprinting = wantSprint && !this.crouched && this.grounded && canSprint(v) && !this.aiming;
    if (this.sprinting && !canSprint(v)) this.sprinting = false;

    // Smooth height change; never grow into a ceiling.
    const targetH = this.crouched ? PLAYER.crouchHeight : PLAYER.standHeight;
    if (targetH > this.height) {
      const nh = Math.min(targetH, this.height + dt * 6);
      if (!world.overlaps(this.pos.x, this.pos.y + 0.02, this.pos.z, PLAYER.radius, nh - 0.02)) this.height = nh;
      else this.crouched = true;
    } else this.height = Math.max(targetH, this.height - dt * 7);

    // --- Horizontal velocity ---
    let maxSpeed = PLAYER.walkSpeed;
    if (this.crouched) maxSpeed = PLAYER.crouchSpeed;
    else if (this.sprinting) maxSpeed = PLAYER.sprintSpeed;
    if (this.aiming) maxSpeed = Math.min(maxSpeed, PLAYER.adsSpeed);
    if (fwd < 0) maxSpeed *= 0.85;
    maxSpeed *= opts.speedMult;
    const len = Math.hypot(fwd, strafe);
    let wx = 0, wz = 0;
    if (len > 0) {
      // Normalised so diagonals are not faster.
      const f = fwd / len, s = strafe / len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // Forward is -Z at yaw 0.
      wx = -sin * f + cos * s;
      wz = -cos * f - sin * s;
    }
    const accel = this.grounded ? PLAYER.groundAccel : PLAYER.airAccel;
    const tx = wx * maxSpeed, tz = wz * maxSpeed;
    if (this.grounded && len === 0) {
      const drop = Math.max(0, 1 - PLAYER.friction * dt);
      this.vel.x *= drop;
      this.vel.z *= drop;
    }
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    if (dl > 0 && (len > 0 || this.grounded)) {
      const step = Math.min(dl, accel * dt);
      this.vel.x += (dvx / dl) * step;
      this.vel.z += (dvz / dl) * step;
    }

    // --- Ladders: walk into one to climb it (forward = up, back = down, jump = let go) ---
    const lad = this.ladders.length ? ladderAt(this.ladders, this.pos.x, this.pos.y, this.pos.z) : null;
    if (lad && (fwd !== 0 || this.climbing) && !input.isHeld('jump')) {
      this.climbing = true;
      const toX = lad.x - this.pos.x, toZ = lad.z - this.pos.z;
      const facing = -Math.sin(this.yaw) * toX - Math.cos(this.yaw) * toZ >= -0.2;
      const climb = fwd === 0 ? 0 : (fwd > 0) === facing || this.pitch > 0.35 ? 3.2 : -3.2;
      this.vel.x *= 0.2; this.vel.z *= 0.2;
      this.vel.y = climb;
      let ny = this.pos.y + climb * dt;
      if (ny >= lad.y1 - 0.05 && climb > 0) {
        // Step off onto the landing.
        this.pos.x += (lad.top.x - this.pos.x) * Math.min(1, dt * 8);
        this.pos.z += (lad.top.z - this.pos.z) * Math.min(1, dt * 8);
        ny = Math.min(ny, lad.y1 + 0.05);
        if (Math.hypot(lad.top.x - this.pos.x, lad.top.z - this.pos.z) < 0.25) { this.climbing = false; this.pos.y = lad.top.y; this.grounded = true; this.vel.y = 0; return ev; }
      }
      const res = world.move(this.pos, PLAYER.radius, this.height, 0, ny - this.pos.y, 0, 0, false);
      if (res.grounded && climb < 0) this.climbing = false;
      this.grounded = res.grounded;
      this.moving = false;
      return ev;
    }
    this.climbing = false;
    // --- Mantle / jump / gravity ---
    const wantJump = input.consume('jump');
    if ((wantJump || (!this.grounded && fwd > 0 && this.vel.y < 1.5)) && !this.crouched) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const top = fwd > 0 || wantJump ? findMantleLedge(world, this.pos.x, this.pos.y, this.pos.z, -sin, -cos) : null;
      if (top !== null && (wantJump || !this.grounded)) {
        this.mantling = true;
        this.mantleT = 0;
        this.mantleFrom = { ...this.pos };
        this.mantleTo = { x: this.pos.x - sin * PLAYER.mantleReach, y: top, z: this.pos.z - cos * PLAYER.mantleReach };
        this.vel = { x: 0, y: 0, z: 0 };
        this.sprinting = false;
        ev.mantled = true;
        return ev;
      }
    }
    if (wantJump && this.grounded && !this.crouched) {
      this.vel.y = PLAYER.jumpVelocity;
      this.grounded = false;
      ev.jumped = true;
    }
    this.vel.y -= WORLD.gravity * dt;
    if (this.vel.y < -30) this.vel.y = -30;

    const prevVy = this.vel.y;
    const px = this.pos.x, pz = this.pos.z;
    const res = world.move(this.pos, PLAYER.radius, this.height, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt,
      this.grounded ? PLAYER.stepHeight : 0.05, this.grounded);
    if (res.blockedX) this.vel.x = 0;
    if (res.blockedZ) this.vel.z = 0;
    if (res.hitCeiling && this.vel.y > 0) this.vel.y = 0;
    if (res.grounded) {
      if (!this.grounded && this.airTime > 0.15) ev.landed = -prevVy;
      this.vel.y = 0;
      this.airTime = 0;
    } else this.airTime += dt;
    this.grounded = res.grounded;

    // Hard clamp to playable bounds (walls already block, this is a safety net).
    const B = this.bounds ?? WORLD;
    this.pos.x = Math.max(B.minX + 1, Math.min(B.maxX - 1, this.pos.x));
    this.pos.z = Math.max(B.minZ + 1, Math.min(B.maxZ - 1, this.pos.z));

    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    this.speed2d = moved / dt;
    this.moving = this.speed2d > 0.5 && this.grounded;
    if (this.moving) {
      this.stepDist += moved;
      this.stepPhase += moved * (this.sprinting ? 1.25 : 1.6);
      const stride = this.sprinting ? 2.3 : this.crouched ? 1.3 : 1.85;
      if (this.stepDist >= stride) {
        this.stepDist -= stride;
        ev.footstep = !this.crouched || this.stepDist > 0; // crouch steps are quieter but still audible
      }
    }
    return ev;
  }

  private updateMantle(dt: number): void {
    this.mantleT = Math.min(1, this.mantleT + dt / PLAYER.mantleTime);
    const t = this.mantleT;
    // Rise first, then move forward over the lip.
    const ty = Math.min(1, t / 0.6), txz = Math.max(0, (t - 0.35) / 0.65);
    const e = (k: number) => k * k * (3 - 2 * k);
    this.pos.y = this.mantleFrom.y + (this.mantleTo.y - this.mantleFrom.y) * e(ty);
    this.pos.x = this.mantleFrom.x + (this.mantleTo.x - this.mantleFrom.x) * e(txz);
    this.pos.z = this.mantleFrom.z + (this.mantleTo.z - this.mantleFrom.z) * e(txz);
    if (t >= 1) { this.mantling = false; this.grounded = true; this.airTime = 0; }
  }

  private updateSlide(dt: number, input: Input, world: CollisionWorld, ev: MoveEvents): MoveEvents {
    this.slideT -= dt;
    this.height = Math.max(PLAYER.crouchHeight, this.height - dt * 9);
    const decay = Math.max(0, 1 - PLAYER.slideFriction * dt);
    this.vel.x *= decay;
    this.vel.z *= decay;
    // Jumping out of a slide keeps momentum (slide-cancel jump).
    if (input.consume('jump') && !world.overlaps(this.pos.x, this.pos.y + 0.02, this.pos.z, PLAYER.radius, PLAYER.standHeight - 0.02)) {
      this.crouched = false;
      this.slideT = 0;
      this.vel.y = PLAYER.jumpVelocity;
      this.grounded = false;
      ev.jumped = true;
    }
    this.vel.y -= WORLD.gravity * dt;
    const px = this.pos.x, pz = this.pos.z;
    const res = world.move(this.pos, PLAYER.radius, this.height, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, PLAYER.stepHeight, this.grounded);
    if (res.blockedX) this.vel.x = 0;
    if (res.blockedZ) this.vel.z = 0;
    if (res.grounded) this.vel.y = 0;
    this.grounded = res.grounded;
    if (this.slideT <= 0 || Math.hypot(this.vel.x, this.vel.z) < PLAYER.crouchSpeed) {
      this.slideT = 0;
      this.slideCd = PLAYER.slideCooldown;
    }
    this.speed2d = Math.hypot(this.pos.x - px, this.pos.z - pz) / dt;
    this.moving = false;
    return ev;
  }

  /** Pushes the player out of zombie bodies horizontally (zombies body-block). */
  pushOut(x: number, z: number, r: number, world: CollisionWorld): void {
    const dx = this.pos.x - x, dz = this.pos.z - z;
    const d = Math.hypot(dx, dz);
    const min = r + PLAYER.radius;
    if (d >= min || d < 1e-4) return;
    const push = (min - d) * 0.5;
    world.move(this.pos, PLAYER.radius, this.height, (dx / d) * push, 0, (dz / d) * push, 0, false);
  }

  applyRecoil(pitchDeg: number, yawDeg: number): void {
    this.recoilPitch += (pitchDeg * Math.PI) / 180;
    this.recoilYaw += (yawDeg * Math.PI) / 180;
  }

  recoverRecoil(dt: number, rateDeg: number): void {
    const r = (rateDeg * Math.PI) / 180 * dt;
    // Recoil is applied directly to aim, then partially recovered back down.
    const rp = Math.min(this.recoilPitch, r);
    this.recoilPitch -= rp;
    this.pitch -= rp * 0.6;
    const ry = Math.sign(this.recoilYaw) * Math.min(Math.abs(this.recoilYaw), r * 0.5);
    this.recoilYaw -= ry;
  }

  kickView(pitchRad: number, yawRad: number): void {
    this.pitch = Math.min(Math.PI / 2 - 0.02, this.pitch + pitchRad);
    this.yaw += yawRad;
  }
}
