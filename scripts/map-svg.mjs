// Renders a Zombies map def as an SVG sheet: a top-down plan (rooms coloured by floor height, walls, doors with
// prices, windows, stairs, spawn points, nav links, rides, machines) and a side elevation (z vs height).
//   node scripts/map-svg.mjs src/zombies/maps/favela/def.ts FAVELA docs/maps/favela-layout.svg
// Node >= 23 strips TypeScript types, so the def is imported directly (it must only `import type` at runtime).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, name, outFile] = process.argv.slice(2);
const def = (await import(pathToFileURL(path.resolve(file)).href))[name];
const S = 7; // px per metre (plan)
const b = def.bounds;
const W = (b.maxX - b.minX) * S, H = (b.maxZ - b.minZ) * S;
const px = (x) => (x - b.minX) * S, pz = (z) => (z - b.minZ) * S;
const floors = [...new Set(def.rooms.map((r) => r.floor))].sort((a, c) => a - c);
const maxY = Math.max(...floors, 1);
const tint = (y) => { const t = Math.min(1, Math.max(0, y / maxY)); const h = 30 + t * 200; return `hsl(${h},55%,${62 - t * 18}%)`; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const el = [];
el.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#1b1a22"/>`);
// Rooms (staging rooms hatched grey: zombie-only roofs and yards)
for (const r of [...def.rooms].sort((a, c) => a.floor - c.floor)) {
  const { x0, z0, x1, z1 } = r.rect;
  const staging = r.name === 'STAGING';
  el.push(`<rect x="${px(x0)}" y="${pz(z0)}" width="${(x1 - x0) * S}" height="${(z1 - z0) * S}" fill="${staging ? '#44424c' : tint(r.floor)}" fill-opacity="${staging ? 0.55 : 0.9}" stroke="#111" stroke-width="0.6"/>`);
}
// Stairs (arrow up the flight)
for (const s of def.stairs ?? []) {
  const { x0, z0, x1, z1 } = s.rect;
  el.push(`<rect x="${px(x0)}" y="${pz(z0)}" width="${(x1 - x0) * S}" height="${(z1 - z0) * S}" fill="url(#steps)" stroke="#222" stroke-width="0.5"/>`);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[s.dir];
  const L = (s.dir.endsWith('x') ? x1 - x0 : z1 - z0) * 0.35;
  el.push(`<line x1="${px(cx - d[0] * L)}" y1="${pz(cz - d[1] * L)}" x2="${px(cx + d[0] * L)}" y2="${pz(cz + d[1] * L)}" stroke="#111" stroke-width="1.4" marker-end="url(#arrow)"/>`);
}
// Walls
for (const w of def.walls) {
  const t = Math.max(1.2, (w.thickness ?? 0.3) * S);
  const low = w.y1 - w.y0 < 1.3;
  const [xa, za, xb, zb] = w.axis === 'x' ? [w.a0, w.at, w.a1, w.at] : [w.at, w.a0, w.at, w.a1];
  el.push(`<line x1="${px(xa)}" y1="${pz(za)}" x2="${px(xb)}" y2="${pz(zb)}" stroke="${low ? '#9a9a9a' : '#f4efe4'}" stroke-width="${low ? 1.2 : t}" ${low ? 'stroke-dasharray="3 2"' : ''}/>`);
}
// Doors with prices
for (const d of def.doors) {
  const [xa, za, xb, zb] = d.axis === 'x' ? [d.a0, d.at, d.a1, d.at] : [d.at, d.a0, d.at, d.a1];
  el.push(`<line x1="${px(xa)}" y1="${pz(za)}" x2="${px(xb)}" y2="${pz(zb)}" stroke="${d.kind === 'debris' ? '#e08a2a' : '#e8c83a'}" stroke-width="5"/>`);
  el.push(`<text x="${px((xa + xb) / 2) + 5}" y="${pz((za + zb) / 2) - 5}" class="door">${d.cost}</text>`);
}
// Windows
for (const w of def.windows) el.push(`<circle cx="${px(w.x)}" cy="${pz(w.z)}" r="3.4" fill="#fff" stroke="#b01818" stroke-width="2"/>`);
// Spawn points and nav links (climbs up = cyan, drops = magenta)
for (const s of def.spawnPoints ?? []) el.push(`<path d="M${px(s.x) - 4},${pz(s.z) - 4}L${px(s.x) + 4},${pz(s.z) + 4}M${px(s.x) + 4},${pz(s.z) - 4}L${px(s.x) - 4},${pz(s.z) + 4}" stroke="#ff3b3b" stroke-width="2"/>`);
for (const l of def.links ?? []) {
  const col = l.kind === 'drop' ? '#ff4fd8' : l.kind === 'ladder' ? '#35e0ff' : '#a0ff60';
  el.push(`<line x1="${px(l.from.x)}" y1="${pz(l.from.z)}" x2="${px(l.to.x)}" y2="${pz(l.to.z)}" stroke="${col}" stroke-width="2.4" marker-end="url(#arrow2)"/>`);
}
for (const l of def.ladders ?? []) el.push(`<rect x="${px(l.bottom.x) - 3}" y="${pz(l.bottom.z) - 3}" width="6" height="6" fill="#35e0ff"/>`);
// Rides
const rideCol = { gondola_up: '#ffffff', gondola_down: '#ffffff', zipline: '#7df9ff', slide: '#ffb347', peak_up: '#c9a0ff', peak_down: '#c9a0ff' };
for (const r of def.rides ?? []) {
  if (r.id.endsWith('_down')) continue;
  el.push(`<polyline points="${r.path.map((p) => `${px(p.x)},${pz(p.z)}`).join(' ')}" fill="none" stroke="${rideCol[r.id] ?? '#fff'}" stroke-width="2" stroke-dasharray="7 4"/>`);
}
// Machines
const mark = (s, label, col) => { el.push(`<rect x="${px(s.x) - 5}" y="${pz(s.z) - 5}" width="10" height="10" fill="${col}" stroke="#000"/>`); el.push(`<text x="${px(s.x) + 7}" y="${pz(s.z) + 4}" class="m">${esc(label)}</text>`); };
def.box.spots.forEach((s, i) => mark(s, `BOX${i + 1}`, '#57c2ff'));
for (const [id, s] of Object.entries(def.perks)) mark(s, id, '#ff7ab6');
if (def.pap) mark(def.pap, 'REFORGER', '#b070ff');
if (def.power) mark(def.power, 'POWER', '#ffe14a');
mark({ x: def.playerSpawn.x, z: def.playerSpawn.z }, 'SPAWN', '#7dff7a');
// Zone labels at the biggest room of each zone
for (const z of def.zones) {
  const rs = def.rooms.filter((r) => r.zone === z.id && r.name !== 'STAGING');
  const r = rs.sort((a, c) => (c.rect.x1 - c.rect.x0) * (c.rect.z1 - c.rect.z0) - (a.rect.x1 - a.rect.x0) * (a.rect.z1 - a.rect.z0))[0];
  if (!r) continue;
  el.push(`<text x="${px((r.rect.x0 + r.rect.x1) / 2)}" y="${pz((r.rect.z0 + r.rect.z1) / 2)}" class="z" text-anchor="middle">${z.id} ${esc(z.name)} · y${r.floor}</text>`);
}
// Side elevation: rooms projected onto (z, height), looking west (south on the right)
const E = 5, eH = (maxY + 30) * E, eW = (b.maxZ - b.minZ) * E;
const ex = (z) => (z - b.minZ) * E, ey = (y) => eH - (y + 6) * E;
const side = [];
side.push(`<rect x="0" y="0" width="${eW}" height="${eH}" fill="#1b1a22"/>`);
for (let y = 0; y <= maxY + 20; y += 4) side.push(`<line x1="0" y1="${ey(y)}" x2="${eW}" y2="${ey(y)}" stroke="#2c2a36"/><text x="4" y="${ey(y) - 2}" class="g">y${y}</text>`);
for (const r of [...def.rooms].sort((a, c) => a.floor - c.floor)) {
  if (r.name === 'STAGING') continue;
  const top = r.ceiling === null || r.ceiling === undefined ? r.floor + 0.6 : r.ceiling;
  side.push(`<rect x="${ex(r.rect.z0)}" y="${ey(Math.max(top, r.floor + 0.6))}" width="${(r.rect.z1 - r.rect.z0) * E}" height="${(Math.max(top, r.floor + 0.6) - r.floor) * E}" fill="${tint(r.floor)}" fill-opacity="0.75" stroke="#111"/>`);
}
for (const s of def.stairs ?? []) {
  const z0 = s.rect.z0, z1 = s.rect.z1;
  const up = s.dir === '-z' ? [z1, z0] : s.dir === '+z' ? [z0, z1] : [z0, z1];
  if (s.dir.endsWith('z')) side.push(`<line x1="${ex(up[0])}" y1="${ey(s.y0)}" x2="${ex(up[1])}" y2="${ey(s.y1)}" stroke="#f4efe4" stroke-width="2"/>`);
}
for (const r of def.rides ?? []) {
  if (r.id.endsWith('_down')) continue;
  side.push(`<polyline points="${r.path.map((p) => `${ex(p.z)},${ey(p.y)}`).join(' ')}" fill="none" stroke="${rideCol[r.id] ?? '#fff'}" stroke-width="1.8" stroke-dasharray="6 3"/>`);
}
for (const l of def.links ?? []) side.push(`<line x1="${ex(l.from.z)}" y1="${ey(l.from.y)}" x2="${ex(l.to.z)}" y2="${ey(l.to.y)}" stroke="${l.kind === 'drop' ? '#ff4fd8' : '#35e0ff'}" stroke-width="2" marker-end="url(#arrow2)"/>`);
if (def.power) side.push(`<circle cx="${ex(def.power.z)}" cy="${ey(def.power.y ?? 0) - 6}" r="5" fill="#ffe14a"/>`);
if (def.pap) side.push(`<circle cx="${ex(def.pap.z)}" cy="${ey(def.pap.y ?? 0) - 6}" r="5" fill="#b070ff"/>`);
side.push(`<text x="${eW - 8}" y="16" class="g" text-anchor="end">side elevation · north (uphill) left, south (street, sea) right</text>`);

const legend = [
  ['#e8c83a', 'door (price)'], ['#e08a2a', 'debris (price)'], ['#fff', 'window (barricade)'], ['#ff3b3b', 'spawn point (x)'],
  ['#35e0ff', 'climb link (zombies up)'], ['#ff4fd8', 'drop link (off a roof)'], ['#ffffff', 'cable car'], ['#7df9ff', 'zipline'], ['#ffb347', 'tin-roof slide'], ['#c9a0ff', 'peak line (EE)'],
];
const lg = legend.map(([c, t], i) => `<rect x="${10}" y="${10 + i * 16}" width="12" height="10" fill="${c}"/><text x="28" y="${19 + i * 16}" class="g">${esc(t)}</text>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(W, eW)}" height="${H + eH + 30}" font-family="monospace">
<defs>
<pattern id="steps" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#cfc8b8"/><line x1="0" y1="0" x2="4" y2="0" stroke="#7a7466"/></pattern>
<marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0L6,3L0,6Z" fill="#111"/></marker>
<marker id="arrow2" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0L6,3L0,6Z" fill="#fff"/></marker>
<style>.z{font-size:11px;fill:#101010;font-weight:bold}.door{font-size:10px;fill:#ffe98a;font-weight:bold}.m{font-size:9px;fill:#fff}.g{font-size:10px;fill:#bdb8c8}</style>
</defs>
<g>${el.join('\n')}${lg}<text x="${W - 8}" y="16" class="g" text-anchor="end">${esc(def.name)} · plan · north (uphill) up · ${S} px = 1 m · colour = floor height</text></g>
<g transform="translate(0,${H + 30})">${side.join('\n')}</g>
</svg>`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, svg);
console.log('wrote', outFile, `${Math.round(svg.length / 1024)} KB`);
