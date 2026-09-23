import { describe, expect, it } from 'vitest';
import { SEG, rayCapsule, rayCapsules } from '../src/enemies/hitbox';

describe('ray vs capsule', () => {
  it('hits the side of a vertical capsule at the surface', () => {
    const t = rayCapsule(-5, 1, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0.5);
    expect(t).toBeCloseTo(4.5, 5);
  });
  it('hits the rounded cap above the segment and misses beside it', () => {
    expect(rayCapsule(-5, 2.3, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0.5)).toBeCloseTo(5 - Math.sqrt(0.25 - 0.09), 5);
    expect(rayCapsule(-5, 2.6, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0.5)).toBeNull();
    expect(rayCapsule(-5, 1, 0.6, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0.5)).toBeNull();
  });
  it('handles a ray along the axis and a ray starting inside', () => {
    expect(rayCapsule(0, -5, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0.5)).toBeCloseTo(4.5, 5);
    expect(rayCapsule(0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0.5)).toBe(0);
    expect(rayCapsule(5, 1, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0.5)).toBeNull(); // pointing away
  });
  it('a lying (crawling) body is hit low where a standing box would miss', () => {
    // Torso capsule along the floor from x=0 to x=1.2 at y=0.25.
    const segs = new Float32Array(SEG * 2);
    segs.set([0, 0.25, 0, 1.2, 0.25, 0, 0.2], 0);
    segs.set([1.2, 0.3, 0, 1.45, 0.35, 0, 0.12], SEG);
    const hit = rayCapsules(segs, 2, 1.0, 1.6, -3, 0, -0.39, 0.92, 10);
    expect(hit?.index).toBe(0);
  });
});
