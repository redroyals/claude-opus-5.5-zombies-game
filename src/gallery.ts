// Asset gallery for the MP asset set: single-asset orbit view or a per-category contact sheet.
// URL: /gallery.html?id=<id>  |  ?sheet=<cat>[&map=<map>]  |  add &shot=1 to hide UI (used by scripts/render-check.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface Entry { id: string; cat: string; map?: string; name: string; size: number; url: string; lod1: string | null; stats: { tris: number; kb: number; tex: number } | null; method: string | null }
const q = new URLSearchParams(location.search);
if (q.get('shot')) document.body.classList.add('shot');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2d33);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 6, 4); scene.add(sun);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 500);
const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const info = document.getElementById('info')!;
const side = document.getElementById('side')!;
const root = new THREE.Group(); scene.add(root);
let labels: { el: HTMLElement; p: THREE.Vector3 }[] = [];

function clear(): void { root.clear(); for (const l of labels) l.el.remove(); labels = []; }
const load = (url: string) => new Promise<THREE.Object3D>((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej));
function fit(size: number, target: THREE.Vector3, dir = new THREE.Vector3(1, 0.45, 1)): void {
  cam.position.copy(target).addScaledVector(dir.normalize(), size * 1.9); ctl.target.copy(target); ctl.update();
}
function tris(o: THREE.Object3D): number { let t = 0; o.traverse((m) => { const g = (m as THREE.Mesh).geometry; if (g) t += (g.index?.count ?? g.attributes.position.count) / 3; }); return t; }

async function showOne(e: Entry): Promise<void> {
  clear(); info.textContent = `loading ${e.id}…`;
  const o = await load(e.url); root.add(o);
  const box = new THREE.Box3().setFromObject(o); const s = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  root.add(new THREE.AxesHelper(Math.max(s.x, s.y, s.z) * 0.3));
  const grid = new THREE.GridHelper(Math.max(4, Math.ceil(Math.max(s.x, s.z) * 2)), 20, 0x555555, 0x3a3a3a); grid.position.y = box.min.y; root.add(grid);
  const isWeapon = e.cat === 'weapons' || e.cat === 'attachments';
  fit(Math.max(s.x, s.y, s.z), c, isWeapon ? new THREE.Vector3(1, 0.15, 0.05) : undefined);
  info.textContent = `${e.name} [${e.cat}${e.map ? '/' + e.map : ''}]\n${Math.round(tris(o))} tris · ${e.stats?.kb ?? '?'} KB · tex ${e.stats?.tex ?? '?'} · ${e.method ?? ''}\nsize ${s.x.toFixed(2)} x ${s.y.toFixed(2)} x ${s.z.toFixed(2)} m${isWeapon ? '  (barrel -Z = blue axis reversed, origin = grip)' : ''}`;
  (window as unknown as { __ready: boolean }).__ready = true;
}

async function showSheet(list: Entry[]): Promise<void> {
  clear(); info.textContent = `loading ${list.length}…`;
  const cols = Math.ceil(Math.sqrt(list.length * 1.6)); const cell = 1.25;
  const objs = await Promise.all(list.map((e) => load(e.url).catch(() => new THREE.Object3D())));
  objs.forEach((o, i) => {
    const e = list[i]; const bs = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); const s = cell * 0.85 / Math.max(bs.x, bs.y, bs.z, 1e-3); o.scale.setScalar(s);
    const ax = new THREE.AxesHelper(0.25 / s); o.add(ax); (ax.material as THREE.LineBasicMaterial).depthTest = false; ax.renderOrder = 9;
    const x = (i % cols) * cell, z = Math.floor(i / cols) * cell; o.position.set(x, 0, z);
    if (e.cat === 'weapons' || e.cat === 'attachments') o.rotation.y = Math.PI / 2; // barrel -Z -> +X... readable side-on
    root.add(o);
    const el = document.createElement('div'); el.className = 'lbl'; el.textContent = e.id; document.body.appendChild(el);
    labels.push({ el, p: new THREE.Vector3(x, -0.05 * cell, z + cell * 0.35) });
  });
  const w = cols * cell, d = Math.ceil(list.length / cols) * cell;
  const side = list.every((e) => e.cat === 'weapons' || e.cat === 'attachments');
  cam.fov = 12; cam.updateProjectionMatrix();
  const span = Math.max(w / cam.aspect, d) * 1.05; const dist = span / (2 * Math.tan((cam.fov * Math.PI) / 360));
  const tgt = new THREE.Vector3(w / 2 - cell / 2, 0.2, d / 2 - cell / 2);
  const dir = side ? new THREE.Vector3(0, 0.35, 1) : new THREE.Vector3(0, 1.1, 1);
  if (side) root.children.forEach((o, i) => { o.position.set((i % cols) * cell, -Math.floor(i / cols) * cell * 0.7, 0); labels[i].p.set(o.position.x, o.position.y - 0.3, 0.3); });
  if (side) tgt.set(w / 2 - cell / 2, -(Math.ceil(list.length / cols) - 1) * cell * 0.35, 0);
  cam.position.copy(tgt).addScaledVector(dir.normalize(), side ? Math.max(w / cam.aspect, Math.ceil(list.length / cols) * cell * 0.7) * 1.1 / (2 * Math.tan((cam.fov * Math.PI) / 360)) : dist);
  ctl.target.copy(tgt); ctl.update();
  info.textContent = `${list.length} assets`;
  setTimeout(() => { (window as unknown as { __ready: boolean }).__ready = true; }, 300);
}

const man: Entry[] = await (await fetch('./assets/manifest.json')).json();
const cats = [...new Set(man.map((e) => (e.cat === 'kits' ? `kits/${e.map}` : e.cat)))];
for (const c of cats) {
  const items = man.filter((e) => (e.cat === 'kits' ? `kits/${e.map}` : e.cat) === c);
  const h = document.createElement('h3'); h.textContent = `${c} (${items.length})`; h.onclick = () => void showSheet(items); side.appendChild(h);
  for (const e of items) { const b = document.createElement('button'); b.textContent = e.name; b.onclick = () => { for (const x of side.querySelectorAll('button')) x.classList.remove('on'); b.classList.add('on'); void showOne(e); }; side.appendChild(b); }
}
const sheet = q.get('sheet'); const id = q.get('id');
const urls = q.get('urls');
if (urls) void showSheet(urls.split(',').map((u) => ({ id: u.split('/').pop()!, cat: 'weapons', name: u, size: 1, url: u, lod1: null, stats: null, method: null })));
else if (sheet) void showSheet(man.filter((e) => e.cat === sheet && (!q.get('map') || e.map === q.get('map')) && (!q.get('ids') || q.get('ids')!.split(',').includes(e.id))));
else if (id) void showOne(man.find((e) => e.id === id)!);
else if (man[0]) void showOne(man[0]);
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const v = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  ctl.update(); renderer.render(scene, cam);
  for (const l of labels) { v.copy(l.p).project(cam); l.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; l.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`; }
});
