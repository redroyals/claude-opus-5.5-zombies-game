// Pure viewmodel fitting: how big a GLB gun is drawn and where it sits at the hip, derived from its real
// length and mount points (public/models/weapons/frames.json). Real-scale rifles fill half the screen and
// push the support hand out of view, so each class is drawn at a target on-screen length instead.
import type { WeaponClass } from '../config';

/** Target drawn length (viewmodel metres) per class. */
export const VM_TARGET_LEN: Record<WeaponClass, number> = {
  pistol: 0.24, smg: 0.46, ar: 0.56, shotgun: 0.6, lmg: 0.66, dmr: 0.64, sniper: 0.66, launcher: 0.62, wonder: 0.58,
};

/** Hand-tuned exceptions: `adsLift` raises the sight line (drops the gun) when aiming, for bulky tops. */
export const VM_OVERRIDES: Record<string, { scale?: number; adsLift?: number }> = {
  ln_lotus: { adsLift: 0.07 },
  ww_singularity: { adsLift: 0.03, scale: 0.55 },
};

export interface VmFit {
  /** Uniform scale applied to the GLB. */
  scale: number;
  /** Hip position of the grip point in camera space. */
  hip: [number, number, number];
  /** Support-hand point in gun space (after scaling), or null to keep the procedural hand. */
  support: [number, number, number] | null;
  adsLift: number;
}

export interface FrameLike { length?: number; scale?: number; mounts?: Record<string, number[]>; vm?: { scale?: number; hip?: number[] } }

export function viewmodelFit(f: FrameLike, cls: WeaponClass, id = ''): VmFit {
  const ov = VM_OVERRIDES[id] ?? {};
  const len = f.length ?? 0.8;
  const base = f.scale ?? 1;
  const auto = Math.max(0.5, Math.min(1, VM_TARGET_LEN[cls] / Math.max(0.05, len * base)));
  const scale = base * (f.vm?.scale ?? ov.scale ?? auto);
  const pistol = cls === 'pistol';
  // Grip sits low and right; longer guns sit a little further out so the stock tucks under the frame edge.
  const hip: [number, number, number] = f.vm?.hip && f.vm.hip.length === 3
    ? [f.vm.hip[0], f.vm.hip[1], f.vm.hip[2]]
    : pistol ? [0.1, -0.11, -0.4] : [0.12, -0.108, -0.42 - Math.min(0.05, Math.max(0, len * scale - 0.55) * 0.3)];
  const u = f.mounts?.mount_under;
  // Support hand wraps the handguard just below and ahead of the under-barrel mount, at least 16 cm ahead of
  // the grip so the two hands never overlap on short guns.
  // Never past the muzzle, though.
  const mz = f.mounts?.mount_muzzle?.[2];
  const zs = u ? Math.min(u[2] * scale - 0.03, -0.16) : 0;
  const support: [number, number, number] | null = !pistol && u ? [0, u[1] * scale - 0.055, mz !== undefined ? Math.max(zs, mz * scale + 0.06) : zs] : null;
  return { scale, hip, support, adsLift: ov.adsLift ?? 0 };
}
