import { describe, expect, it } from 'vitest';
import { findMantleLedge } from '../src/player/Player';

// Minimal AABB world: boxes as [minX,minY,minZ,maxX,maxY,maxZ]; capsule approximated as an AABB.
function world(boxes: number[][]) {
  return {
    overlaps(x: number, y: number, z: number, r: number, h: number) {
      return boxes.some((b) => x + r > b[0] && x - r < b[3] && y + h > b[1] && y < b[4] && z + r > b[2] && z - r < b[5]);
    },
  };
}

describe('mantle ledge probe', () => {
  it('finds the top of a waist-high crate in front', () => {
    const w = world([[-1, 0, -2, 1, 1.2, -1]]);
    const top = findMantleLedge(w, 0, 0, -0.5, 0, -1);
    expect(top).not.toBeNull();
    expect(top!).toBeGreaterThanOrEqual(1.2);
    expect(top!).toBeLessThan(1.3);
  });
  it('ignores walls that are too tall', () => {
    expect(findMantleLedge(world([[-1, 0, -2, 1, 4, -1]]), 0, 0, -0.5, 0, -1)).toBeNull();
  });
  it('ignores empty space and knee-high steps', () => {
    expect(findMantleLedge(world([]), 0, 0, -0.5, 0, -1)).toBeNull();
    expect(findMantleLedge(world([[-1, 0, -2, 1, 0.3, -1]]), 0, 0, -0.5, 0, -1)).toBeNull();
  });
  it('refuses when there is a ceiling above the player', () => {
    expect(findMantleLedge(world([[-1, 0, -2, 1, 1.2, -1], [-2, 2.0, -0.8, 2, 2.3, 0]]), 0, 0, -0.5, 0, -1)).toBeNull();
  });
});
