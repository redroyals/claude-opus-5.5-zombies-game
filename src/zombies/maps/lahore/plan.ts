// Top-down SVG plan of the Lahore Darbar map, generated from the same data the game uses.
// `LAHORE_PLAN=1 npx vitest run tests/lahore-map.test.ts` writes docs/maps/lahore-darbar.svg.
import { AREAS, BOX_SPOTS, DOORS, EGG, JUMPS, LADDERS, PAP_SPOT, PERK_SPOTS, PLAYER_SPAWN, POWER_SPOT, REGIONS, WALL_BUY_SPOTS, WINDOWS, ZONE_NAMES } from './layout';
import { GRID, type Raster } from './raster';

const ZC = ['#7fb3d5', '#e59866', '#cd6155', '#d4ac0d', '#bb8fce', '#aed6f1', '#85929e', '#a04000', '#f5cba7', '#f0b27a', '#d7bde2', '#76d7c4', '#f7dc6f', '#5d6d7e'];

export function planSvg(r: Raster): string {
  const S = 7, pad = 30;
  const w = (GRID.maxX - GRID.minX) * S + pad * 2, h = (GRID.maxZ - GRID.minZ) * S + pad * 2 + 140;
  const X = (x: number) => ((x - GRID.minX) * S + pad).toFixed(1), Y = (z: number) => ((z - GRID.minZ) * S + pad).toFixed(1);
  const o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="sans-serif">`);
  o.push(`<rect width="${w}" height="${h}" fill="#141218"/>`);
  o.push('<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-width="1.4" stroke-opacity="0.35"/></pattern>'
    + '<pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.2" fill="#fff" fill-opacity="0.5"/></pattern></defs>');
  for (const g of REGIONS) {
    const [x0, z0, x1, z1] = g.rect;
    o.push(`<rect x="${X(x0)}" y="${Y(z0)}" width="${(x1 - x0) * S}" height="${(z1 - z0) * S}" fill="#2c2621"/>`);
  }
  const layerOrder = ['B', 'G', 'U', 'R'] as const;
  for (const L of layerOrder) {
    for (const rm of r.rooms.filter((q) => q.area.layer === L)) {
      const a = rm.area, col = ZC[a.zone % ZC.length];
      const x = X(rm.x0), y = Y(rm.z0), ww = (rm.x1 - rm.x0) * S, hh = (rm.z1 - rm.z0) * S;
      if (L === 'B') o.push(`<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${col}" fill-opacity="0.25" stroke="${col}" stroke-dasharray="4 3"/>`);
      else {
        o.push(`<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${col}" fill-opacity="${L === 'G' ? 0.85 : 0.7}"/>`);
        if (L === 'U') o.push(`<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="url(#hatch)"/>`);
        if (L === 'R') o.push(`<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="url(#dots)"/>`);
      }
      if (a.ceiling !== null && L !== 'B') o.push(`<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="#000" fill-opacity="0.18"/>`);
    }
  }
  // Stairs arrows
  for (const a of AREAS.filter((q) => q.stair)) {
    const [x0, z0, x1, z1] = a.rects[0], d = a.stair!.dir;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const [ax, az, bx, bz] = d === '+x' ? [x0 + 0.3, cz, x1 - 0.3, cz] : d === '-x' ? [x1 - 0.3, cz, x0 + 0.3, cz] : d === '+z' ? [cx, z0 + 0.3, cx, z1 - 0.3] : [cx, z1 - 0.3, cx, z0 + 0.3];
    o.push(`<line x1="${X(ax)}" y1="${Y(az)}" x2="${X(bx)}" y2="${Y(bz)}" stroke="#fff" stroke-width="2" marker-end="url(#)"/>`);
    o.push(`<circle cx="${X(bx)}" cy="${Y(bz)}" r="3" fill="#fff"/>`);
  }
  // Walls
  const WCOL: Record<string, string> = { wall: '#f4ecd8', rail: '#58d68d', low: '#58d68d', parapet: '#f8c471', invisible: 'none', jaali: '#5dade2' };
  for (const wl of r.walls) {
    if (wl.kind === 'invisible') continue;
    const [x1, z1, x2, z2] = wl.axis === 'x' ? [wl.a0, wl.at, wl.a1, wl.at] : [wl.at, wl.a0, wl.at, wl.a1];
    o.push(`<line x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}" stroke="${WCOL[wl.kind]}" stroke-width="${wl.kind === 'wall' ? 2 : 1.6}"${wl.kind === 'rail' || wl.kind === 'low' ? ' stroke-dasharray="3 2"' : ''}/>`);
  }
  // Drops / jumps / ladders
  for (const l of r.links) {
    if (l.kind === 'drop') o.push(`<line x1="${X(l.from[0])}" y1="${Y(l.from[2])}" x2="${X(l.to[0])}" y2="${Y(l.to[2])}" stroke="#58d68d" stroke-width="1"/>`);
  }
  for (const jp of JUMPS) o.push(`<path d="M${X(jp.from[0])},${Y(jp.from[2])} Q${X((jp.from[0] + jp.to[0]) / 2 + 2)},${Y((jp.from[2] + jp.to[2]) / 2 - 2)} ${X(jp.to[0])},${Y(jp.to[2])}" stroke="#ff5dd8" stroke-width="2.5" fill="none"/>`);
  for (const ld of LADDERS) o.push(`<line x1="${X(ld.bottom[0])}" y1="${Y(ld.bottom[2])}" x2="${X(ld.top[0])}" y2="${Y(ld.top[2])}" stroke="#ff5dd8" stroke-width="4" stroke-dasharray="1 2"/>`);
  // Doors
  for (const d of DOORS) {
    const [x1, z1, x2, z2] = d.axis === 'x' ? [d.a0, d.at, d.a1, d.at] : [d.at, d.a0, d.at, d.a1];
    o.push(`<line x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}" stroke="${d.kind === 'debris' ? '#a0522d' : '#ff9f1a'}" stroke-width="6"/>`);
    o.push(`<text x="${X((x1 + x2) / 2)}" y="${(Number(Y((z1 + z2) / 2)) - 5).toFixed(1)}" fill="#ffd27f" font-size="11" text-anchor="middle" stroke="#000" stroke-width="3" paint-order="stroke">${d.cost}${d.kind === 'debris' ? 'd' : ''}</text>`);
  }
  for (const wn of WINDOWS) {
    const [x1, z1, x2, z2] = wn.nz !== 0 ? [wn.x - 0.75, wn.z, wn.x + 0.75, wn.z] : [wn.x, wn.z - 0.75, wn.x, wn.z + 0.75];
    o.push(`<line x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}" stroke="#e74c3c" stroke-width="5"/>`);
  }
  const icon = (x: number, z: number, txt: string, fill: string) =>
    o.push(`<circle cx="${X(x)}" cy="${Y(z)}" r="8" fill="${fill}" stroke="#000"/><text x="${X(x)}" y="${(Number(Y(z)) + 4).toFixed(1)}" font-size="10" font-weight="bold" text-anchor="middle" fill="#000">${txt}</text>`);
  BOX_SPOTS.forEach((b) => icon(b.x, b.z, '?', '#7fe0ff'));
  const PC: Record<string, string> = { lifeline: '#5dade2', quickhands: '#58d68d', bulwark: '#e74c3c', hammerfall: '#f39c12' };
  for (const [id, s] of Object.entries(PERK_SPOTS)) icon(s.x, s.z, id[0].toUpperCase(), PC[id]);
  icon(PAP_SPOT.x, PAP_SPOT.z, 'PaP', '#c39bd3');
  icon(POWER_SPOT.x, POWER_SPOT.z, '⚡', '#f7dc6f');
  icon(PLAYER_SPAWN.x, PLAYER_SPAWN.z, 'S', '#ffffff');
  for (const wb of WALL_BUY_SPOTS) o.push(`<rect x="${(Number(X(wb.x)) - 3).toFixed(1)}" y="${(Number(Y(wb.z)) - 3).toFixed(1)}" width="6" height="6" fill="#fdfefe" stroke="#000"/>`);
  for (const e of [...EGG.mirrors, ...EGG.keys, EGG.pedestal]) o.push(`<path d="M${X(e.x)},${(Number(Y(e.z)) - 6).toFixed(1)} l5,6 l-5,6 l-5,-6z" fill="#ff5dd8" stroke="#000"/>`);
  // Zone labels at the centroid of their largest room
  const byZone = new Map<number, { x: number; z: number; a: number }>();
  for (const rm of r.rooms) {
    if (rm.area.stair) continue;
    const ar = (rm.x1 - rm.x0) * (rm.z1 - rm.z0);
    const cur = byZone.get(rm.area.zone);
    if (!cur || ar > cur.a) byZone.set(rm.area.zone, { x: (rm.x0 + rm.x1) / 2, z: (rm.z0 + rm.z1) / 2, a: ar });
  }
  for (const [zn, c] of byZone) o.push(`<text x="${X(c.x)}" y="${Y(c.z)}" fill="#fff" font-size="13" font-weight="bold" text-anchor="middle" stroke="#000" stroke-width="3" paint-order="stroke">${zn} ${ZONE_NAMES[zn]}</text>`);
  // Legend
  const ly = (GRID.maxZ - GRID.minZ) * S + pad * 2 + 10;
  const leg = [
    ['#f4ecd8', 'wall'], ['#58d68d', 'rail / drop (one-way)'], ['#f8c471', 'parapet'], ['#5dade2', 'jaali (shoot-through)'], ['#ff9f1a', 'door (cost)'], ['#a0522d', 'debris'],
    ['#e74c3c', 'barricade window'], ['#ff5dd8', 'jump / ladder / egg'], ['#7fe0ff', '? box spot'],
  ];
  leg.forEach(([c, t], i) => { o.push(`<rect x="${pad + (i % 5) * 230}" y="${ly + Math.floor(i / 5) * 22}" width="18" height="10" fill="${c}"/><text x="${pad + (i % 5) * 230 + 24}" y="${ly + 10 + Math.floor(i / 5) * 22}" fill="#ddd" font-size="12">${t}</text>`); });
  o.push(`<text x="${pad}" y="${ly + 62}" fill="#ddd" font-size="12">Fill = ground (y 3); hatched = upper (y 7.2); dotted = rooftops (y 10.2); dashed outline = basements (y 0); darker = covered. Arrows = stairs (uphill). Perks: L Lifeline, Q Quickhands, B Bulwark, H Hammerfall. North is up.</text>`);
  o.push(`<text x="${pad}" y="${ly + 84}" fill="#ddd" font-size="12">Generated from src/zombies/maps/lahore/layout.ts by plan.ts — do not edit by hand.</text>`);
  o.push('</svg>');
  return o.join('\n');
}
