// Bespoke dressing for Nightfall Relay: a ring of dead trees silhouetted beyond the windows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDecorateContext } from '../types';

export function decorateNightfall(ctx: MapDecorateContext): void {
  const trunk = new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 1 });
  // Built as individual meshes, then merged into one draw call.
  const tmp = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, r = 29 + (i % 3);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 7 + (i % 4), 5), trunk);
    t.position.set(Math.cos(a) * r, 3.5, Math.sin(a) * r);
    t.rotation.z = Math.sin(i * 7.1) * 0.15;
    tmp.add(t);
    for (let b = 0; b < 3; b++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 2.4, 4), trunk);
      br.position.set(t.position.x, 4 + b * 1.2, t.position.z);
      br.rotation.set(0.9 * Math.sin(i + b), i + b * 2, 0.9 * Math.cos(i * 3 + b));
      tmp.add(br);
    }
  }
  tmp.updateMatrixWorld(true);
  const geos = tmp.children.map((m) => (m as THREE.Mesh).geometry.clone().applyMatrix4(m.matrixWorld));
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (merged) {
    const mesh = new THREE.Mesh(merged, trunk);
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    ctx.root.add(mesh);
  }
}
