// Map validator: static checks on a ZombiesMapDef plus nav-based reachability using the same compiled
// colliders the game uses. Pure (no three.js). Returns a list of human-readable problems.
import { PLAYER, WEAPONS } from '../config';
import { NavGrid } from '../world/NavGrid';
import { buildColliders, compileMap, openDoorBox, type CompiledMap } from './mapcompile';
import { doorCenter, frontOf, perkEntries, roomCeiling, zoneAt, type P3, type ZombiesMapDef } from './mapdef';
import { WALL_BUYS } from './rules';

export interface MapIssue { severity: 'error' | 'warn'; code: string; msg: string }
export interface ValidateResult { ok: boolean; issues: MapIssue[]; errors: MapIssue[] }

export interface ValidateOptions {
  /** Skip the nav reachability pass (fast structural checks only). */
  skipNav?: boolean;
}

export function validateMapDef(def: ZombiesMapDef, opts: ValidateOptions = {}): ValidateResult {
  const issues: MapIssue[] = [];
  const err = (code: string, msg: string) => issues.push({ severity: 'error', code, msg });
  const warn = (code: string, msg: string) => issues.push({ severity: 'warn', code, msg });
  const { minX, minZ, maxX, maxZ } = def.bounds;
  const inBounds = (x: number, z: number) => x > minX + 1 && x < maxX - 1 && z > minZ + 1 && z < maxZ - 1;

  // ---- Identity ----
  if (!/^[a-z0-9][a-z0-9-]*$/.test(def.id)) err('id', `map id "${def.id}" must be lowercase kebab-case`);
  if (!def.name) err('name', 'map needs a name');
  if (maxX <= minX || maxZ <= minZ) err('bounds', 'bounds are empty');

  // ---- Zones ----
  const zoneIds = new Set(def.zones.map((z) => z.id));
  if (zoneIds.size !== def.zones.length) err('zones', 'duplicate zone ids');
  if (!zoneIds.has(def.startZone)) err('startZone', `start zone ${def.startZone} is not a zone`);
  for (const z of def.zones) if (!def.rooms.some((r) => r.zone === z.id)) err('zone-rooms', `zone ${z.id} "${z.name}" has no rooms`);
  for (const r of def.rooms) {
    if (!zoneIds.has(r.zone)) err('room-zone', `room ${r.name ?? '?'} references unknown zone ${r.zone}`);
    if (r.rect.x1 <= r.rect.x0 || r.rect.z1 <= r.rect.z0) err('room-rect', `room ${r.name ?? r.zone} has an empty rect`);
    if (!inBounds(r.rect.x0, r.rect.z0) || !inBounds(r.rect.x1, r.rect.z1)) err('room-bounds', `room ${r.name ?? r.zone} leaves the map bounds`);
    const c = roomCeiling(def, r);
    if (c !== null && c - r.floor < 2.2) err('room-headroom', `room ${r.name ?? r.zone} has less than 2.2 m headroom`);
  }

  // ---- Door graph ----
  const doorIds = new Set<string>();
  for (const d of def.doors) {
    if (doorIds.has(d.id)) err('door-dup', `duplicate door id ${d.id}`);
    doorIds.add(d.id);
    if (!zoneIds.has(d.a) || !zoneIds.has(d.b)) err('door-zone', `door ${d.id} links unknown zones`);
    if (d.a === d.b) err('door-self', `door ${d.id} links a zone to itself`);
    if (d.cost < 0) err('door-cost', `door ${d.id} has a negative cost`);
    if (d.a1 <= d.a0 || d.y1 <= d.y0) err('door-geom', `door ${d.id} has an empty opening`);
  }
  const reach = new Set([def.startZone]);
  const order: string[] = [];
  for (let grew = true; grew;) {
    grew = false;
    for (const d of def.doors) {
      if (order.includes(d.id)) continue;
      if (reach.has(d.a) || reach.has(d.b)) { reach.add(d.a); reach.add(d.b); order.push(d.id); grew = true; }
    }
  }
  for (const z of def.zones) if (!reach.has(z.id)) err('zone-unreachable', `zone ${z.id} "${z.name}" cannot be unlocked from the start zone`);

  // ---- Windows / spawns ----
  def.windows.forEach((w, i) => {
    if (w.id !== i) err('window-id', `window at index ${i} has id ${w.id} (ids must equal their index)`);
    if (!zoneIds.has(w.zone)) err('window-zone', `window ${w.id} references unknown zone ${w.zone}`);
    if (Math.abs(Math.hypot(w.nx, w.nz) - 1) > 1e-6 || (w.nx !== 0 && w.nz !== 0)) err('window-normal', `window ${w.id} normal must be a unit axis vector`);
  });
  const startSpawns = def.windows.filter((w) => w.zone === def.startZone).length + (def.spawnPoints ?? []).filter((s) => s.zone === def.startZone).length;
  if (startSpawns === 0) err('start-spawns', 'the start zone has no windows or spawn points: round 1 cannot spawn');
  for (const z of def.zones) {
    const n = def.windows.filter((w) => w.zone === z.id).length + (def.spawnPoints ?? []).filter((s) => s.zone === z.id).length;
    if (n === 0) warn('zone-spawns', `zone ${z.id} "${z.name}" has no spawns (zombies only walk in)`);
  }
  for (const s of def.spawnPoints ?? []) {
    if (!zoneIds.has(s.zone)) err('spawn-zone', `spawn point references unknown zone ${s.zone}`);
    if (!inBounds(s.x, s.z)) err('spawn-bounds', `spawn point ${s.x},${s.z} is out of bounds`);
  }

  // ---- Machines ----
  if (def.box.spots.length === 0) err('box', 'map needs at least one mystery box spot');
  if ((def.box.start ?? 0) >= def.box.spots.length) err('box-start', 'box.start is out of range');
  for (const w of def.wallBuys) if (!WALL_BUYS[w.key]) err('wallbuy', `unknown wall-buy ${w.key}`);
  if (def.startWeapon && !WEAPONS[def.startWeapon]) err('start-weapon', `unknown start weapon ${def.startWeapon}`);
  if (perkEntries(def).length === 0) warn('perks', 'map has no perk machines');
  if (!def.pap) warn('pap', 'map has no Reforger');
  if (def.egg) {
    if (def.egg.steps.length === 0) err('egg', 'easter egg has no steps');
    for (const s of def.egg.steps) {
      if (s.kind === 'kill' && !zoneIds.has(s.zone)) err('egg-zone', `egg kill step references unknown zone ${s.zone}`);
      if (s.kind !== 'kill' && s.objects.length === 0) err('egg-objects', `egg ${s.kind} step has no objects`);
    }
  }

  const cm = compileMap(def);
  // ---- Placement inside zones ----
  const inZone = (p: P3, what: string, zone?: number) => {
    const z = zoneAt(def, p.x, p.z, p.y);
    if (z < 0) err('outside', `${what} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) is outside every room`);
    else if (zone !== undefined && z !== zone) err('wrong-zone', `${what} is in zone ${z}, expected ${zone}`);
  };
  const ps = { x: def.playerSpawn.x, y: def.playerSpawn.y ?? 0, z: def.playerSpawn.z };
  inZone(ps, 'player spawn', def.startZone);
  cm.windows.forEach((w) => inZone({ x: w.inside.x, y: w.def.floor, z: w.inside.z }, `window ${w.def.id} inside point`, w.def.zone));
  for (const s of def.spawnPoints ?? []) inZone(s, `spawn point (${s.kind})`, s.zone);
  def.box.spots.forEach((s, i) => inZone({ x: s.x, y: s.y ?? 0, z: s.z }, `box spot ${i}`));
  for (const [id, s] of perkEntries(def)) inZone({ x: s.x, y: s.y ?? 0, z: s.z }, `perk ${id}`);
  if (def.pap) inZone({ x: def.pap.x, y: def.pap.y ?? 0, z: def.pap.z }, 'Reforger');
  if (def.power) inZone({ x: def.power.x, y: def.power.y ?? 0, z: def.power.z }, 'power switch');

  const { world, doors } = buildColliders(def, cm);
  // ---- Player spawn must be clear ----
  if (world.overlaps(ps.x, ps.y + 0.05, ps.z, PLAYER.radius, PLAYER.standHeight - 0.1)) err('spawn-blocked', 'player spawn overlaps a collider');
  for (const [i, s] of (def.coopSpawns ?? []).entries()) {
    if (world.overlaps(s.x, (s.y ?? 0) + 0.05, s.z, PLAYER.radius, PLAYER.standHeight - 0.1)) err('coop-spawn-blocked', `co-op spawn ${i} overlaps a collider`);
  }

  if (!opts.skipNav && issues.every((i) => i.severity !== 'error' || !['bounds', 'startZone'].includes(i.code))) {
    navChecks(def, cm, world, doors, order, err, warn);
  }
  const errors = issues.filter((i) => i.severity === 'error');
  return { ok: errors.length === 0, issues, errors };
}

function navChecks(def: ZombiesMapDef, cm: CompiledMap, world: ReturnType<typeof buildColliders>['world'], doors: ReturnType<typeof buildColliders>['doors'],
  order: string[], err: (c: string, m: string) => void, warn: (c: string, m: string) => void): void {
  const { minX, minZ, maxX, maxZ } = def.bounds;
  const nav = new NavGrid(minX, minZ, maxX, maxZ);
  nav.setLinks(cm.links);
  const ps = { x: def.playerSpawn.x, y: def.playerSpawn.y ?? 0, z: def.playerSpawn.z };
  const reachable = (p: P3, r = 1.6) => {
    // Any node within r metres of p (horizontally) at about p.y with a finite flow distance.
    const k = nav.nearestNode(p.x, p.z, p.y, Math.ceil(r), true);
    if (k < 0) return false;
    return Math.abs(nav.nodeH[k] - p.y) < 1.0;
  };
  // 1. With every door closed, locked zones must not leak.
  nav.build(world);
  nav.computeFlow(ps.x, ps.z, ps.y);
  if (!isFinite(nav.pathDist(ps.x, ps.z, ps.y))) { err('spawn-nav', 'player spawn is not on walkable nav'); return; }
  for (const r of def.rooms) {
    if (r.zone === def.startZone) continue;
    const cx = (r.rect.x0 + r.rect.x1) / 2, cz = (r.rect.z0 + r.rect.z1) / 2;
    const k = nav.nodeAt(cx, cz, r.floor);
    if (k >= 0 && Math.abs(nav.nodeH[k] - r.floor) < 0.6 && isFinite(nav.dist[k])) err('zone-leak', `room "${r.name ?? r.zone}" (zone ${r.zone}) is reachable before its door is bought`);
  }
  // 2. Open doors in unlock order; each door must be reachable from the side already open.
  const opened = new Set<number>([def.startZone]);
  for (const id of order) {
    const d = def.doors.find((x) => x.id === id)!;
    const c = doorCenter(d);
    const off = d.axis === 'x' ? [{ x: c.x, z: c.z - 1.2 }, { x: c.x, z: c.z + 1.2 }] : [{ x: c.x - 1.2, z: c.z }, { x: c.x + 1.2, z: c.z }];
    const ok = off.some((o) => opened.has(zoneAt(def, o.x, o.z, d.y0)) && reachable({ x: o.x, y: d.y0, z: o.z }, 1.2));
    if (!ok) err('door-unreachable', `door ${d.id} cannot be reached from an unlocked zone`);
    openDoorBox(doors.get(d.id)!);
    opened.add(d.a); opened.add(d.b);
    nav.build(world);
    nav.computeFlow(ps.x, ps.z, ps.y);
  }
  // 3. Everything open: every room, machine, wall-buy, window and spawn must be reachable.
  for (const r of def.rooms) {
    const cx = (r.rect.x0 + r.rect.x1) / 2, cz = (r.rect.z0 + r.rect.z1) / 2;
    // Rooms can be furnished in the middle: accept any reachable node inside the rect at that floor.
    let found = false;
    for (let x = r.rect.x0 + 0.5; x < r.rect.x1 && !found; x += 1) for (let z = r.rect.z0 + 0.5; z < r.rect.z1 && !found; z += 1) {
      const k = nav.nodeAt(x, z, r.floor);
      if (k >= 0 && Math.abs(nav.nodeH[k] - r.floor) < 0.6 && isFinite(nav.dist[k])) found = true;
    }
    if (!found) err('room-unreachable', `room "${r.name ?? r.zone}" (${cx.toFixed(0)}, ${cz.toFixed(0)}) is not walkable-reachable with all doors open`);
  }
  def.box.spots.forEach((s, i) => { if (!reachable(frontOf(s, 1.1))) err('box-unreachable', `box spot ${i} cannot be reached`); });
  for (const [id, s] of perkEntries(def)) if (!reachable(frontOf(s, 1.3))) err('perk-unreachable', `perk ${id} cannot be reached`);
  if (def.pap && !reachable(frontOf(def.pap, 1.4))) err('pap-unreachable', 'the Reforger cannot be reached');
  if (def.power && !reachable(frontOf(def.power, 1.0))) err('power-unreachable', 'the power switch cannot be reached');
  for (const w of def.wallBuys) if (!reachable(frontOf({ x: w.x, z: w.z, face: w.face, y: w.y }, 0.8))) err('wallbuy-unreachable', `wall-buy ${w.key} cannot be reached`);
  for (const w of cm.windows) if (!reachable({ x: w.inside.x, y: w.def.floor, z: w.inside.z })) err('window-unreachable', `window ${w.def.id} inside point is not reachable`);
  for (const s of def.spawnPoints ?? []) if (!reachable(s)) err('spawnpoint-unreachable', `spawn point (${s.x}, ${s.y}, ${s.z}) cannot reach the player`);
  for (const s of def.egg?.steps ?? []) {
    if (s.kind === 'kill') continue;
    for (const o of s.objects) if (!reachable({ x: o.x, y: o.y - 0.35, z: o.z }, 1.6) && !reachable({ x: o.x, y: 0, z: o.z }, 1.6)) warn('egg-unreachable', `egg object at (${o.x}, ${o.y}, ${o.z}) may be out of reach`);
  }
  // Window outsides: zombies must be able to walk from the spawn pocket to the window.
  for (const w of cm.windows) {
    const k = nav.nodeAt(w.spawn.x, w.spawn.z, w.def.floor);
    if (k < 0) warn('window-pocket', `window ${w.def.id} spawn point is not on walkable ground`);
  }
}
