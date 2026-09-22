// Asset review page: orbit around the Meshy sample GLBs in assets/samples/. Dev-only tool (pnpm dev -> /samples.html).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const NAMES = ['operator', 'zombie-shambler', 'zombie-brute', 'mystery-box', 'upgrade-machine', 'perk-machine', 'rifle', 'water-tower'];
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c20);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 2);
scene.add(sun, new THREE.GridHelper(10, 20, 0x444444, 0x2a2a2a));
const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
cam.position.set(2.5, 1.6, 2.5);
const ctl = new OrbitControls(cam, renderer.domElement);
ctl.enableDamping = true;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const bar = document.getElementById('bar')!;
const info = document.getElementById('info')!;
let current: THREE.Object3D | null = null;

function show(name: string): void {
  for (const b of bar.querySelectorAll('button')) b.classList.toggle('on', b.textContent === name);
  info.textContent = `loading ${name}…`;
  loader.load(`./assets/samples/${name}.glb`, (g) => {
    if (current) scene.remove(current);
    current = g.scene;
    const box = new THREE.Box3().setFromObject(current);
    const size = box.getSize(new THREE.Vector3());
    const s = 2 / Math.max(size.x, size.y, size.z);
    current.scale.setScalar(s);
    const b2 = new THREE.Box3().setFromObject(current);
    current.position.y -= b2.min.y;
    current.position.x -= (b2.min.x + b2.max.x) / 2;
    current.position.z -= (b2.min.z + b2.max.z) / 2;
    scene.add(current);
    ctl.target.set(0, 1, 0);
    let tris = 0;
    current.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; });
    info.textContent = `${name} · ${Math.round(tris)} tris · drag to orbit, wheel to zoom`;
  }, undefined, (e) => { info.textContent = `failed: ${String(e)}`; });
}
for (const n of NAMES) {
  const b = document.createElement('button');
  b.textContent = n;
  b.onclick = () => show(n);
  bar.appendChild(b);
}
show(NAMES[0]);
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => { ctl.update(); renderer.render(scene, cam); });
