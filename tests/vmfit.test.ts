import { describe, expect, it } from 'vitest';
import { VM_TARGET_LEN, viewmodelFit } from '../src/weapons/vmfit';

describe('viewmodel fit', () => {
  it('draws long guns at their class length and leaves pistols at real size', () => {
    const ar = viewmodelFit({ length: 0.84, mounts: { mount_under: [0, 0.08, -0.29], mount_muzzle: [0, 0.11, -0.45] } }, 'ar');
    expect(0.84 * ar.scale).toBeCloseTo(VM_TARGET_LEN.ar, 3);
    expect(viewmodelFit({ length: 0.19 }, 'pistol').scale).toBe(1);
    expect(viewmodelFit({ length: 3 }, 'lmg').scale).toBe(0.5); // clamped
  });
  it('puts the support hand ahead of the grip but never past the muzzle', () => {
    const ar = viewmodelFit({ length: 0.84, mounts: { mount_under: [0, 0.08, -0.29], mount_muzzle: [0, 0.11, -0.45] } }, 'ar');
    expect(ar.support![2]).toBeLessThan(-0.15);
    const smg = viewmodelFit({ length: 0.66, mounts: { mount_under: [0, 0.11, -0.11], mount_muzzle: [0, 0.12, -0.17] } }, 'smg');
    expect(smg.support![2]).toBeGreaterThan(-0.17 * smg.scale);
    expect(viewmodelFit({ length: 0.2, mounts: { mount_under: [0, 0, -0.1] } }, 'pistol').support).toBeNull();
  });
  it('keeps the gun in the lower-right quadrant at the hip', () => {
    const f = viewmodelFit({ length: 1.04 }, 'lmg');
    expect(f.hip[0]).toBeGreaterThan(0);
    expect(f.hip[1]).toBeLessThan(0);
    expect(f.hip[2]).toBeLessThan(-0.35);
    expect(viewmodelFit({ length: 1, vm: { hip: [0.2, -0.2, -0.5] } }, 'ar').hip).toEqual([0.2, -0.2, -0.5]);
  });
});
