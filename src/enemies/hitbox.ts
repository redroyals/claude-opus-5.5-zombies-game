// Pure bone-attached hit capsules for zombies. No three.js.
// A zombie's hitbox is a list of capsules (segment a-b + radius) rebuilt each render frame from its
// skeleton, so crawlers dragging along the floor and the 2.8 m Warden are hit where they are drawn.

export const SEG = 7; // floats per capsule: ax ay az bx by bz r
export type HitPart = 'head' | 'body' | 'limb';

/** Capsule layout: index 0 is always the head. Parts per slot. */
export const HIT_PARTS: HitPart[] = ['head', 'body', 'limb', 'limb', 'limb', 'limb', 'limb', 'limb', 'limb', 'limb'];
export const MAX_CAPSULES = HIT_PARTS.length;

/** Bone pairs per capsule slot (GLB rig names) and base radii at scale 1. `legs` marks capsules dropped when legless. */
export const GLB_CAPSULES: { a: string; b: string; r: number; legs?: boolean }[] = [
  { a: 'Head', b: 'head_end', r: 0.13 },
  { a: 'Hips', b: 'neck', r: 0.19 },
  { a: 'LeftArm', b: 'LeftForeArm', r: 0.065 },
  { a: 'LeftForeArm', b: 'LeftHand', r: 0.055 },
  { a: 'RightArm', b: 'RightForeArm', r: 0.065 },
  { a: 'RightForeArm', b: 'RightHand', r: 0.055 },
  { a: 'LeftUpLeg', b: 'LeftLeg', r: 0.085, legs: true },
  { a: 'LeftLeg', b: 'LeftFoot', r: 0.065, legs: true },
  { a: 'RightUpLeg', b: 'RightLeg', r: 0.085, legs: true },
  { a: 'RightLeg', b: 'RightFoot', r: 0.065, legs: true },
];

/**
 * Ray vs capsule (origin o, unit direction d). Returns the entry distance, or null. From Inigo Quilez's
 * capsule intersector; rays starting inside a capsule count as a hit at 0.
 */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): number | null {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * dx + bay * dy + baz * dz;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  let b = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - r * r * baba;
  let h = b * b - a * c;
  if (baba > 1e-12 && Math.abs(a) > 1e-12 && h >= 0) {
    const t = (-b - Math.sqrt(h)) / a;
    const y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 ? t : insideCyl(oax, oay, oaz, bax, bay, baz, baba, r) ? 0 : null;
  }
  // Caps (also handles degenerate / parallel cases)
  let best: number | null = null;
  for (const [cx, cy, cz] of [[ax, ay, az], [bx, by, bz]] as const) {
    const ocx = ox - cx, ocy = oy - cy, ocz = oz - cz;
    b = dx * ocx + dy * ocy + dz * ocz;
    c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
    if (c <= 0) return 0;
    h = b * b - c;
    if (h < 0) continue;
    const t = -b - Math.sqrt(h);
    if (t >= 0 && (best === null || t < best)) best = t;
  }
  if (best !== null) return best;
  if (baba > 1e-12 && h >= 0 && insideCyl(oax, oay, oaz, bax, bay, baz, baba, r)) return 0;
  return null;
}

function insideCyl(oax: number, oay: number, oaz: number, bax: number, bay: number, baz: number, baba: number, r: number): boolean {
  const k = (oax * bax + oay * bay + oaz * baz) / baba;
  if (k < 0 || k > 1) return false;
  const px = oax - bax * k, py = oay - bay * k, pz = oaz - baz * k;
  return px * px + py * py + pz * pz <= r * r;
}

/** Nearest capsule hit in a packed capsule array. */
export function rayCapsules(segs: Float32Array, count: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): { dist: number; index: number } | null {
  let best: { dist: number; index: number } | null = null;
  for (let i = 0; i < count; i++) {
    const k = i * SEG;
    if (segs[k + 6] <= 0) continue;
    const t = rayCapsule(ox, oy, oz, dx, dy, dz, segs[k], segs[k + 1], segs[k + 2], segs[k + 3], segs[k + 4], segs[k + 5], segs[k + 6]);
    if (t !== null && t < maxDist && (best === null || t < best.dist)) best = { dist: t, index: i };
  }
  return best;
}

/** Damage multiplier per part (head multiplier is applied by the weapon). */
export const LIMB_MULT = 0.8;
