// Bespoke dressing for Nightfall Relay: a ring of dead trees silhouetted beyond the windows.
import * as THREE from 'three';
import type { MapDecorateContext } from '../types';

export function decorateNightfall(ctx: MapDecorateContext): void {
  const trunk = new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, r = 29 + (i % 3);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 7 + (i % 4), 5), trunk);
    t.position.set(Math.cos(a) * r, 3.5, Math.sin(a) * r);
    t.rotation.z = Math.sin(i * 7.1) * 0.15;
    ctx.root.add(t);
    for (let b = 0; b < 3; b++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 2.4, 4), trunk);
      br.position.set(t.position.x, 4 + b * 1.2, t.position.z);
      br.rotation.set(0.9 * Math.sin(i + b), i + b * 2, 0.9 * Math.cos(i * 3 + b));
      ctx.root.add(br);
    }
  }
}
