// Deterministic player movement shared by client prediction and server authority.
// Pure: no three.js / DOM. Fixed timestep (TICK_DT). Same inputs + same map => same result.
import type { Box } from './maps';

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

export const MOVE = {
  radius: 0.3, stand: 1.75, crouch: 1.1, eye: 0.12,
  walk: 4.6, sprint: 7.1, crouchSpeed: 2.3, ads: 2.9,
  groundAccel: 55, airAccel: 9, friction: 10, gravity: 17, jump: 5.4, step: 0.55,
  slideSpeed: 9.4, slideTime: 0.75, slideFriction: 2.2, slideCooldown: 0.6,
  tacSprint: 8.4, tacTime: 3, tacRecharge: 4,
  mantleMin: 0.55, mantleMax: 1.9, mantleReach: 0.55, mantleTime: 0.32,
  stunSpeedMult: 0.55,
};

/** Perk/weapon/status modifiers to movement (see perks.ts). */
export interface MoveMods {
  speedMult: number;
  tacSprintMult: number;
  tacRechargeMult: number;
  mantleTimeMult: number;
  slideCooldownMult: number;
  slideSpeedMult: number;
}
export const NO_MODS: MoveMods = { speedMult: 1, tacSprintMult: 1, tacRechargeMult: 1, mantleTimeMult: 1, slideCooldownMult: 1, slideSpeedMult: 1 };

/** Buttons bitfield (u8 on the wire). */
export const BTN = { jump: 1, crouch: 2, sprint: 4, ads: 8, fire: 16, reload: 32, swap: 64, use: 128, lethal: 256, tactical: 512, melee: 1024 } as const;

export interface MoveInput {
  seq: number;
  /** -127..127 each. */
  fwd: number;
  strafe: number;
  yaw: number;
  pitch: number;
  buttons: number;
}

export interface MoveState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  grounded: boolean;
  crouched: boolean;
  slideT: number;
  slideCd: number;
  sdx: number; sdz: number;
  /** Tactical sprint seconds remaining / seconds until it recharges. */
  tacT: number;
  tacRecharge: number;
  sprinting: boolean;
  /** Mantle tween progress 0..1 (<0 = not mantling) and endpoints. */
  mantleT: number;
  mfx: number; mfy: number; mfz: number;
  mtx: number; mty: number; mtz: number;
  /** Seconds of concussion slow remaining. */
  stunT: number;
  /** Downward speed at the moment of landing this tick (0 if no landing). */
  landImpact: number;
}

export function newMoveState(x = 0, y = 0, z = 0): MoveState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, crouched: false, slideT: 0, slideCd: 0, sdx: 0, sdz: 0, tacT: MOVE.tacTime, tacRecharge: 0, sprinting: false, mantleT: -1, mfx: 0, mfy: 0, mfz: 0, mtx: 0, mty: 0, mtz: 0, stunT: 0, landImpact: 0 };
}

export function height(s: MoveState): number { return s.crouched || s.slideT > 0 ? MOVE.crouch : MOVE.stand; }

/** Broadphase: uniform XZ grid over boxes so collision cost is O(nearby). */
export class BoxWorld {
  private cells = new Map<number, number[]>();
  constructor(public boxes: Box[], private cell = 8) {
    boxes.forEach((b, i) => {
      for (let cx = Math.floor(b[0] / cell); cx <= Math.floor(b[3] / cell); cx++)
        for (let cz = Math.floor(b[2] / cell); cz <= Math.floor(b[5] / cell); cz++) {
          const k = key(cx, cz);
          let arr = this.cells.get(k);
          if (!arr) this.cells.set(k, (arr = []));
          arr.push(i);
        }
    });
  }
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: Set<number>): Set<number> {
    out.clear();
    const c = this.cell;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++)
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const arr = this.cells.get(key(cx, cz));
        if (arr) for (const i of arr) out.add(i);
      }
    return out;
  }
  overlaps(x: number, y: number, z: number, r: number, h: number): boolean {
    for (const i of this.query(x - r, z - r, x + r, z + r, scratch)) {
      const b = this.boxes[i];
      if (x + r > b[0] && x - r < b[3] && y + h > b[1] && y < b[4] && z + r > b[2] && z - r < b[5]) return true;
    }
    return false;
  }
  /** Ray vs boxes: distance to nearest hit or Infinity. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
    let best = maxDist;
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    for (const i of this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), scratch)) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, this.boxes[i]);
      if (t >= 0 && t < best) best = t;
    }
    return best < maxDist ? best : Infinity;
  }
}
const scratch = new Set<number>();
const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < b[a] || o[a] > b[a + 3]) return -1; continue; }
    let t1 = (b[a] - o[a]) / d[a], t2 = (b[a + 3] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}

/** Advance one fixed tick. Mutates and returns s. `speedMult` = weapon mobility. */
export function stepMove(s: MoveState, inp: MoveInput, world: BoxWorld, mods: MoveMods = NO_MODS): MoveState {
  const dt = TICK_DT;
  s.landImpact = 0;
  s.stunT = Math.max(0, s.stunT - dt);
  if (s.mantleT >= 0) {
    // Rise, then move forward. No animation lock beyond the tween; ends grounded.
    s.mantleT = Math.min(1, s.mantleT + dt / (MOVE.mantleTime * mods.mantleTimeMult));
    const k = s.mantleT, rise = Math.min(1, k / 0.6), fwdK = Math.max(0, (k - 0.35) / 0.65);
    s.y = s.mfy + (s.mty - s.mfy) * rise;
    s.x = s.mfx + (s.mtx - s.mfx) * fwdK;
    s.z = s.mfz + (s.mtz - s.mfz) * fwdK;
    s.vx = s.vy = s.vz = 0;
    if (s.mantleT >= 1) { s.mantleT = -1; s.grounded = true; }
    return s;
  }
  const speedMult = mods.speedMult * (s.stunT > 0 ? MOVE.stunSpeedMult : 1);
  const fwd = clamp(inp.fwd, -127, 127) / 127, str = clamp(inp.strafe, -127, 127) / 127;
  const b = inp.buttons;
  const sinY = Math.sin(inp.yaw), cosY = Math.cos(inp.yaw);
  // Forward is -z at yaw 0 (three.js camera convention).
  let wx = -sinY * fwd + cosY * str, wz = -cosY * fwd - sinY * str;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }

  const wantCrouch = (b & BTN.crouch) !== 0;
  const sprinting = (b & BTN.sprint) !== 0 && fwd > 0.5 && !(b & BTN.ads) && !s.crouched && s.stunT <= 0;
  s.sprinting = sprinting && s.slideT <= 0;
  s.slideCd = Math.max(0, s.slideCd - dt);
  // Tactical sprint: the first tacTime seconds of a sprint are faster; recharges while not sprinting.
  const tacMax = MOVE.tacTime * mods.tacSprintMult;
  let tac = false;
  if (s.sprinting && s.grounded) {
    if (s.tacT > 0) { tac = true; s.tacT = Math.max(0, s.tacT - dt); }
    s.tacRecharge = MOVE.tacRecharge * mods.tacRechargeMult;
  } else if (!s.sprinting) {
    s.tacRecharge = Math.max(0, s.tacRecharge - dt);
    if (s.tacRecharge <= 0) s.tacT = tacMax;
  }
  // Slide start
  if (wantCrouch && sprinting && s.grounded && s.slideT <= 0 && s.slideCd <= 0 && !s.crouched) {
    const sp = Math.max(MOVE.slideSpeed * mods.slideSpeedMult, Math.hypot(s.vx, s.vz) * 1.15);
    const l = Math.hypot(wx, wz) || 1;
    s.sdx = wx / l; s.sdz = wz / l;
    s.vx = s.sdx * sp; s.vz = s.sdz * sp;
    s.slideT = MOVE.slideTime;
  }
  if (s.slideT > 0) {
    s.slideT -= dt;
    const decay = Math.max(0, 1 - MOVE.slideFriction * dt);
    s.vx *= decay; s.vz *= decay;
    if (s.slideT <= 0 || !wantCrouch) { s.slideT = 0; s.slideCd = MOVE.slideCooldown * mods.slideCooldownMult; }
  } else {
    // Crouch with clearance check
    if (wantCrouch) s.crouched = true;
    else if (s.crouched && !world.overlaps(s.x, s.y + 0.05, s.z, MOVE.radius, MOVE.stand - 0.05)) s.crouched = false;
    const max = (s.crouched ? MOVE.crouchSpeed : b & BTN.ads ? MOVE.ads : sprinting ? (tac ? MOVE.tacSprint : MOVE.sprint) : MOVE.walk) * speedMult;
    const tx = wx * max, tz = wz * max;
    const acc = s.grounded ? MOVE.groundAccel : MOVE.airAccel;
    if (s.grounded && wl < 0.01) {
      const f = Math.max(0, 1 - MOVE.friction * dt);
      s.vx *= f; s.vz *= f;
    } else {
      s.vx = approach(s.vx, tx, acc * dt);
      s.vz = approach(s.vz, tz, acc * dt);
    }
  }
  // Mantle: jump into a ledge, or hold forward while airborne against one.
  if (fwd > 0.3 && s.slideT <= 0 && (!s.grounded || b & BTN.jump) && (b & BTN.jump || s.vy < 1)) {
    const l = Math.hypot(wx, wz) || 1;
    const top = findLedge(world, s.x, s.y, s.z, wx / l, wz / l);
    if (top !== null) {
      s.mantleT = 0; s.mfx = s.x; s.mfy = s.y; s.mfz = s.z;
      s.mtx = s.x + (wx / l) * (MOVE.mantleReach + MOVE.radius * 0.5); s.mty = top; s.mtz = s.z + (wz / l) * (MOVE.mantleReach + MOVE.radius * 0.5);
      s.crouched = false; s.slideT = 0;
      return s;
    }
  }
  // Jump (cancels slide, keeps momentum)
  if (b & BTN.jump && s.grounded) {
    s.vy = MOVE.jump; s.grounded = false;
    if (s.slideT > 0) { s.slideT = 0; s.slideCd = MOVE.slideCooldown; }
  }
  s.vy -= MOVE.gravity * dt;

  const h = height(s);
  // Horizontal moves, per-axis, with step-up.
  moveAxis(s, world, h, s.vx * dt, 0);
  moveAxis(s, world, h, 0, s.vz * dt);
  // Vertical
  const ny = s.y + s.vy * dt;
  if (!world.overlaps(s.x, ny, s.z, MOVE.radius, h)) { s.y = ny; s.grounded = false; }
  else {
    if (s.vy < 0) { if (!s.grounded) s.landImpact = -s.vy; s.y = snapDown(s, world, h, ny); s.grounded = true; }
    s.vy = 0;
  }
  if (s.vy <= 0 && !s.grounded && world.overlaps(s.x, s.y - 0.02, s.z, MOVE.radius, 0.02)) s.grounded = true;
  if (s.y < -20) { s.y = 0; s.vy = 0; } // safety
  return s;
}

/** Ledge probe for mantling: the first height in [mantleMin, mantleMax] where a standing capsule fits. */
export function findLedge(w: BoxWorld, x: number, y: number, z: number, dx: number, dz: number): number | null {
  const ax = x + dx * MOVE.mantleReach, az = z + dz * MOVE.mantleReach;
  if (!w.overlaps(ax, y + MOVE.mantleMin - 0.05, az, MOVE.radius * 0.8, 0.1)) return null;
  for (let hh = MOVE.mantleMin; hh <= MOVE.mantleMax + 1e-6; hh += 0.05) {
    if (w.overlaps(ax, y + hh, az, MOVE.radius, MOVE.crouch)) continue;
    if (w.overlaps(x, y + 0.05, z, MOVE.radius * 0.9, hh + MOVE.crouch)) return null;
    return y + hh;
  }
  return null;
}

function moveAxis(s: MoveState, w: BoxWorld, h: number, dx: number, dz: number) {
  if (dx === 0 && dz === 0) return;
  // Sub-step so fast slides can't tunnel through thin walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (MOVE.radius * 0.9)));
  const sx = dx / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    const nx = s.x + sx, nz = s.z + sz;
    if (!w.overlaps(nx, s.y + 0.01, nz, MOVE.radius, h - 0.01)) { s.x = nx; s.z = nz; continue; }
    if (s.grounded && !w.overlaps(nx, s.y + MOVE.step, nz, MOVE.radius, h) && !w.overlaps(s.x, s.y + 0.01, s.z, MOVE.radius, h + MOVE.step)) {
      // step up then settle
      s.x = nx; s.z = nz; s.y = snapDown(s, w, h, s.y + MOVE.step) ; continue;
    }
    if (dx !== 0) s.vx = 0; else s.vz = 0;
    return;
  }
}

/** Find the lowest free y in [target, from] (binary search) — used for landing and step settle. */
function snapDown(s: MoveState, w: BoxWorld, h: number, from: number): number {
  let lo = Math.min(from, s.y) - 0.6, hi = Math.max(from, s.y);
  if (w.overlaps(s.x, hi, s.z, MOVE.radius, h)) return s.y;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (w.overlaps(s.x, mid, s.z, MOVE.radius, h)) lo = mid; else hi = mid;
  }
  return hi;
}

const approach = (v: number, t: number, d: number) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
