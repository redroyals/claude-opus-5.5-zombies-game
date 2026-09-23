// Layered, height-aware navigation grid with a shared flow field toward the player.
//
// Every 1 m column can hold several walkable surfaces ("nodes") stacked on top of each other, so maps can
// have floors above floors. Neighbouring nodes connect when their heights differ by at most CLIMB (steps,
// stairs, ramps). Authored links (ladders, drops, jumps) add extra directed edges between nodes.
// One Dijkstra pass from the target over the reverse graph serves the whole horde (O(1) per zombie).
//
// Legacy per-column arrays (`height`, `walk`) describe the primary surface (the highest one at or below
// 3 m) so the extraction district and its spawner behave exactly as before.
import type { CollisionWorld } from './Collision';

export const CLIMB = 0.5; // max step between neighbouring cells
const STAIR_MAX = 1.1;
const SWEEP_R = 0.2; // body radius used when sweeping between cell centres // max height difference between neighbouring cells along a staircase
const AGENT_R = 0.32;
const BODY = 1.7; // clearance needed above a surface
const LEGACY_MAX = 3; // legacy primary-surface cap

export interface NavLink {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  kind: 'drop' | 'jump' | 'vault' | 'ladder';
  cost?: number;
  twoWay?: boolean;
}

/** Output of flowDir. `link` >= 0 when the best next step is an authored link (traverse from its start). */
export interface FlowOut { x: number; z: number; link?: number }

export class NavGrid {
  readonly w: number;
  readonly h: number;
  readonly size = 1;
  /** Legacy primary surface height per column. */
  readonly height: Float32Array;
  /** Legacy primary surface walkable flag per column. */
  readonly walk: Uint8Array;
  /** Flow distance per node. */
  dist: Float32Array = new Float32Array(0);
  /** Nodes: column start offsets (length w*h+1), heights and owning columns. */
  colStart: Int32Array;
  nodeH: Float32Array = new Float32Array(0);
  nodeCol: Int32Array = new Int32Array(0);
  /** Authored links (world coordinates) and their resolved node endpoints. */
  links: NavLink[] = [];
  /** Resolved start/end node per link (-1 = the endpoint is not on walkable nav). */
  linkA: Int32Array = new Int32Array(0);
  linkB: Int32Array = new Int32Array(0);
  // Forward edges (i -> j) and reverse edges (j <- i) in CSR form. `eLink` = link index or -1.
  private fStart = new Int32Array(0); private fTo = new Int32Array(0); private fLink = new Int32Array(0);
  private rStart = new Int32Array(0); private rTo = new Int32Array(0); private rCost = new Float32Array(0);
  private heap: Int32Array = new Int32Array(0);
  private heapKey: Float32Array = new Float32Array(0);
  private heapLen = 0;
  /** Node the current flow field targets. */
  targetCell = -1;

  constructor(public ox: number, public oz: number, maxX: number, maxZ: number) {
    this.w = Math.ceil(maxX - ox);
    this.h = Math.ceil(maxZ - oz);
    const n = this.w * this.h;
    this.height = new Float32Array(n);
    this.walk = new Uint8Array(n);
    this.colStart = new Int32Array(n + 1);
  }

  get nodeCount(): number { return this.nodeH.length; }

  setLinks(links: NavLink[]): void { this.links = links; }

  build(world: CollisionWorld): void {
    const W = this.w, H = this.h, n = W * H;
    const hs: number[] = [];
    const colStart = this.colStart;
    const tmp: number[] = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        colStart[i] = hs.length;
        const edge = r === 0 || c === 0 || r === H - 1 || c === W - 1;
        const cx = this.ox + c + 0.5, cz = this.oz + r + 0.5;
        const list = world.query(cx - AGENT_R, cz - AGENT_R, cx + AGENT_R, cz + AGENT_R);
        // Candidate floor surfaces: the ground and every floor top containing the column centre.
        tmp.length = 0;
        tmp.push(0);
        for (const b of list) {
          if (b.floor && cx >= b.minX && cx <= b.maxX && cz >= b.minZ && cz <= b.maxZ) tmp.push(b.maxY);
        }
        tmp.sort((a, b) => a - b);
        // Merge surfaces closer than CLIMB (a step on the ground is one surface): keep the highest.
        const surf: number[] = [];
        for (let k = 0; k < tmp.length; k++) {
          if (k + 1 < tmp.length && tmp[k + 1] - tmp[k] <= CLIMB) continue;
          surf.push(tmp[k]);
        }
        let legacyH = 0, legacyWalk = 0, haveLegacy = false;
        for (const floor of surf) {
          let blocked = edge;
          if (!blocked) {
            for (const b of list) {
              if (b.floor && b.maxY <= floor + 0.01) continue;
              // Obstacle intersecting the body volume above the floor (small steps are allowed).
              if (b.maxY > floor + 0.46 && b.minY < floor + BODY) { blocked = true; break; }
            }
          }
          if (floor <= LEGACY_MAX + 1e-6) { legacyH = floor; legacyWalk = blocked ? 0 : 1; haveLegacy = true; }
          if (!blocked) hs.push(floor);
        }
        this.height[i] = haveLegacy ? legacyH : 0;
        this.walk[i] = haveLegacy ? legacyWalk : 0;
      }
    }
    colStart[n] = hs.length;
    const N = hs.length;
    this.nodeH = Float32Array.from(hs);
    this.nodeCol = new Int32Array(N);
    for (let i = 0; i < n; i++) for (let k = colStart[i]; k < colStart[i + 1]; k++) this.nodeCol[k] = i;
    this.dist = new Float32Array(N).fill(Infinity);
    this.buildEdges(world);
    this.heap = new Int32Array(Math.max(16, this.fTo.length + N + 16));
    this.heapKey = new Float32Array(this.heap.length);
    this.targetCell = -1;
  }

  /** Node in column `col` whose height is within CLIMB of `y` (closest), or -1. */
  private nodeNear(col: number, y: number): number {
    let best = -1, bd = CLIMB + 1e-4;
    for (let k = this.colStart[col]; k < this.colStart[col + 1]; k++) {
      const d = Math.abs(this.nodeH[k] - y);
      if (d <= bd) { bd = d; best = k; }
    }
    return best;
  }

  /**
   * Neighbour node in `col` reachable from height `ha`. Differences up to CLIMB always connect; up to
   * STAIR_MAX they connect when the floor between the two centres rises in steps no taller than CLIMB
   * (steep stairs whose treads are shorter than a nav cell).
   */
  private stepNeighbour(world: CollisionWorld, col: number, ha: number, ax: number, az: number, dx: number, dz: number): number {
    const near = this.nodeNear(col, ha);
    if (near >= 0) return near;
    let best = -1, bd = STAIR_MAX + 1e-4;
    for (let k = this.colStart[col]; k < this.colStart[col + 1]; k++) {
      const d = Math.abs(this.nodeH[k] - ha);
      if (d <= bd) { bd = d; best = k; }
    }
    if (best < 0) return -1;
    const hb = this.nodeH[best];
    let h = ha;
    for (let s = 1; s <= 8; s++) {
      const t = s / 8;
      const g = world.groundHeight(ax + dx * t, az + dz * t, 0.05, h + CLIMB);
      if (g < h - CLIMB) return -1; // a drop larger than a step
      h = g;
    }
    return Math.abs(h - hb) < 0.05 ? best : -1;
  }

  /**
   * True when something solid sits between two neighbouring column centres at body height. Thin walls can
   * fall in the gap between two 1 m cells whose own footprints are clear; this stops the flow field leaking
   * through them.
   */
  private crossBlocked(world: CollisionWorld, ax: number, az: number, bx: number, bz: number, h0: number, h1: number): boolean {
    const lo = Math.max(h0, h1) + 0.46, hi = Math.min(h0, h1) + BODY;
    const R = SWEEP_R;
    const list = world.query(Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R);
    for (const b of list) {
      if (b.maxY <= lo || b.minY >= hi) continue;
      // Boxes are inflated by the body radius so a path cannot hug a post or rail end the body won't clear.
      if (segHitsRect(ax, az, bx, bz, b.minX - R, b.minZ - R, b.maxX + R, b.maxZ + R)) return true;
    }
    return false;
  }

  private buildEdges(world: CollisionWorld): void {
    const W = this.w, H = this.h, N = this.nodeH.length;
    const from: number[] = [], to: number[] = [], cost: number[] = [], link: number[] = [];
    for (let a = 0; a < N; a++) {
      const col = this.nodeCol[a];
      const c = col % W, r = (col - c) / W;
      const ha = this.nodeH[a];
      for (let k = 0; k < 8; k++) {
        const nc = c + DC[k], nr = r + DR[k];
        if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
        const b = this.stepNeighbour(world, nr * W + nc, ha, this.ox + c + 0.5, this.oz + r + 0.5, DC[k], DR[k]);
        if (b < 0) continue;
        if (DC[k] !== 0 && DR[k] !== 0) {
          // No diagonal squeezing past corners.
          if (this.nodeNear(r * W + nc, ha) < 0 || this.nodeNear(nr * W + c, ha) < 0) continue;
        }
        const ax = this.ox + c + 0.5, az = this.oz + r + 0.5;
        if (this.crossBlocked(world, ax, az, ax + DC[k], az + DR[k], ha, this.nodeH[b])) continue;
        from.push(a); to.push(b); cost.push(COST[k]); link.push(-1);
      }
    }
    const la: number[] = [], lb: number[] = [];
    this.links.forEach((l, li) => {
      const a = this.nodeAt(l.ax, l.az, l.ay), b = this.nodeAt(l.bx, l.bz, l.by);
      la.push(a); lb.push(b);
      if (a < 0 || b < 0 || a === b) return;
      const c = l.cost ?? Math.hypot(l.bx - l.ax, l.bz - l.az) + Math.abs(l.by - l.ay) * (l.kind === 'ladder' ? 1.5 : 0.5) + 1;
      from.push(a); to.push(b); cost.push(c); link.push(li);
      if (l.twoWay) { from.push(b); to.push(a); cost.push(c); link.push(li + 1e6); }
    });
    this.linkA = Int32Array.from(la);
    this.linkB = Int32Array.from(lb);
    const E = from.length;
    const csr = (src: number[], dst: number[]) => {
      const start = new Int32Array(N + 1);
      for (let e = 0; e < E; e++) start[src[e] + 1]++;
      for (let i = 0; i < N; i++) start[i + 1] += start[i];
      const fill = start.slice(0, N);
      const t = new Int32Array(E), cs = new Float32Array(E), lk = new Int32Array(E);
      for (let e = 0; e < E; e++) { const s = fill[src[e]]++; t[s] = dst[e]; cs[s] = cost[e]; lk[s] = link[e]; }
      return { start, t, cs, lk };
    };
    const f = csr(from, to);
    this.fStart = f.start; this.fTo = f.t; this.fLink = f.lk;
    const rv = csr(to, from);
    this.rStart = rv.start; this.rTo = rv.t; this.rCost = rv.cs;
  }

  cellOf(x: number, z: number): number {
    const c = Math.floor(x - this.ox), r = Math.floor(z - this.oz);
    if (c < 0 || r < 0 || c >= this.w || r >= this.h) return -1;
    return r * this.w + c;
  }

  cellCenter(i: number, out: { x: number; z: number }): void {
    out.x = this.ox + (i % this.w) + 0.5;
    out.z = this.oz + Math.floor(i / this.w) + 0.5;
  }

  /**
   * Node for a position. With `y` omitted the legacy primary layer is used (highest surface <= ~3 m).
   * Picks the highest surface at or below the feet (+0.6), else the closest one.
   */
  nodeAt(x: number, z: number, y = LEGACY_MAX): number {
    const col = this.cellOf(x, z);
    if (col < 0) return -1;
    let best = -1, bc = Infinity;
    for (let k = this.colStart[col]; k < this.colStart[col + 1]; k++) {
      const h = this.nodeH[k];
      const c = h <= y + 0.6 ? y - h : (h - y) * 10;
      if (c < bc) { bc = c; best = k; }
    }
    return best;
  }

  isWalkable(x: number, z: number, y?: number): boolean {
    if (y === undefined) {
      const i = this.cellOf(x, z);
      return i >= 0 && this.walk[i] === 1;
    }
    const k = this.nodeAt(x, z, y);
    return k >= 0 && Math.abs(this.nodeH[k] - y) < 1.0;
  }

  /** Closest walkable column (legacy layer) to a position. Returns a column index. */
  nearestWalkable(x: number, z: number, maxR = 6): number {
    const c0 = Math.floor(x - this.ox), r0 = Math.floor(z - this.oz);
    for (let rad = 0; rad <= maxR; rad++) {
      let best = -1, bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.w || r >= this.h) continue;
          const i = r * this.w + c;
          if (!this.walk[i]) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Closest node to a 3D position within `maxR` columns, preferring surfaces near `y`. */
  nearestNode(x: number, z: number, y: number, maxR = 6, needFinite = false): number {
    const c0 = Math.floor(x - this.ox), r0 = Math.floor(z - this.oz);
    for (let rad = 0; rad <= maxR; rad++) {
      let best = -1, bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.w || r >= this.h) continue;
          const col = r * this.w + c;
          for (let k = this.colStart[col]; k < this.colStart[col + 1]; k++) {
            const dy = Math.abs(this.nodeH[k] - y);
            if (dy > 1.2) continue;
            if (needFinite && !isFinite(this.dist[k])) continue;
            const d = dc * dc + dr * dr + dy * dy * 4;
            if (d < bestD) { bestD = d; best = k; }
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Dijkstra from the target outward over walkable nodes (8-connected, no corner cutting, plus links). */
  computeFlow(tx: number, tz: number, ty?: number): void {
    let target = this.nodeAt(tx, tz, ty);
    if (target < 0 || Math.abs(this.nodeH[target] - (ty ?? this.nodeH[target])) > 1.2) target = this.nearestNode(tx, tz, ty ?? this.nodeH[Math.max(0, target)] ?? 0);
    if (target < 0 && ty === undefined) { const col = this.nearestWalkable(tx, tz); if (col >= 0) { const cc = { x: 0, z: 0 }; this.cellCenter(col, cc); target = this.nodeAt(cc.x, cc.z); } }
    this.targetCell = target;
    this.dist.fill(Infinity);
    if (target < 0) return;
    this.heapLen = 0;
    this.dist[target] = 0;
    this.push(target, 0);
    while (this.heapLen > 0) {
      const key = this.heapKey[0];
      const i = this.pop();
      if (key > this.dist[i]) continue;
      for (let e = this.rStart[i]; e < this.rStart[i + 1]; e++) {
        const j = this.rTo[e];
        const nd = key + this.rCost[e];
        if (nd < this.dist[j]) {
          this.dist[j] = nd;
          this.push(j, nd);
        }
      }
    }
  }

  /** Direction (unit XZ) along the flow field from a world position. Returns false if unreachable. */
  flowDir(x: number, z: number, out: FlowOut, y?: number): boolean {
    out.link = -1;
    let i = this.nodeAt(x, z, y);
    if (i < 0 || !isFinite(this.dist[i])) {
      // Agent slightly overlapping a blocked cell - head for the best adjacent node.
      const n = this.nearestNode(x, z, y ?? (i >= 0 ? this.nodeH[i] : 0), 2, true);
      if (n < 0) return false;
      const cc = { x: 0, z: 0 };
      this.cellCenter(this.nodeCol[n], cc);
      const dx = cc.x - x, dz = cc.z - z;
      const l = Math.hypot(dx, dz) || 1;
      out.x = dx / l; out.z = dz / l;
      return true;
    }
    let best = this.dist[i], bj = -1, bl = -1;
    for (let e = this.fStart[i]; e < this.fStart[i + 1]; e++) {
      const j = this.fTo[e];
      const d = this.dist[j];
      if (d < best) { best = d; bj = j; bl = this.fLink[e]; }
    }
    if (bj < 0) return false;
    let tx: number, tz: number;
    if (bl >= 0) {
      const li = bl >= 1e6 ? bl - 1e6 : bl;
      const l = this.links[li];
      out.link = bl;
      tx = bl >= 1e6 ? l.bx : l.ax; tz = bl >= 1e6 ? l.bz : l.az;
      const dx0 = tx - x, dz0 = tz - z;
      if (Math.hypot(dx0, dz0) < 0.05) { tx = bl >= 1e6 ? l.ax : l.bx; tz = bl >= 1e6 ? l.az : l.bz; }
    } else {
      const col = this.nodeCol[bj];
      tx = this.ox + (col % this.w) + 0.5; tz = this.oz + Math.floor(col / this.w) + 0.5;
    }
    const dx = tx - x, dz = tz - z;
    const l = Math.hypot(dx, dz) || 1;
    out.x = dx / l;
    out.z = dz / l;
    return true;
  }

  /** Endpoints of a link as returned in FlowOut.link (handles the reversed direction of two-way links). */
  linkEnds(code: number): { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; kind: NavLink['kind'] } | null {
    const rev = code >= 1e6;
    const l = this.links[rev ? code - 1e6 : code];
    if (!l) return null;
    const a = { x: l.ax, y: l.ay, z: l.az }, b = { x: l.bx, y: l.by, z: l.bz };
    return rev ? { from: b, to: a, kind: l.kind } : { from: a, to: b, kind: l.kind };
  }

  pathDist(x: number, z: number, y?: number): number {
    const i = this.nodeAt(x, z, y);
    return i < 0 ? Infinity : this.dist[i];
  }

  /** Grid line-of-walk: can an agent walk straight between two points (same connected surface)? */
  walkLine(ax: number, az: number, bx: number, bz: number, ay?: number): boolean {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / 0.5);
    let prevH = NaN;
    for (let s = 0; s <= n; s++) {
      const t = n === 0 ? 0 : s / n;
      const col = this.cellOf(ax + dx * t, az + dz * t);
      if (col < 0) return false;
      let k: number;
      if (s === 0) {
        k = this.nodeAt(ax, az, ay);
        if (k < 0 || (ay !== undefined && Math.abs(this.nodeH[k] - ay) > 1.0)) return false;
        if (ay === undefined && !this.walk[col]) return false;
      } else k = this.nodeNear(col, prevH);
      if (k < 0) return false;
      prevH = this.nodeH[k];
    }
    return true;
  }

  private push(i: number, key: number): void {
    if (this.heapLen >= this.heap.length) {
      const h2 = new Int32Array(this.heap.length * 2); h2.set(this.heap); this.heap = h2;
      const k2 = new Float32Array(this.heapKey.length * 2); k2.set(this.heapKey); this.heapKey = k2;
    }
    let n = this.heapLen++;
    const heap = this.heap, keys = this.heapKey;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (keys[p] <= key) break;
      heap[n] = heap[p]; keys[n] = keys[p];
      n = p;
    }
    heap[n] = i; keys[n] = key;
  }

  private pop(): number {
    const heap = this.heap, keys = this.heapKey;
    const top = heap[0];
    const last = --this.heapLen;
    if (last > 0) {
      const li = heap[last], lk = keys[last];
      let n = 0;
      for (;;) {
        let ch = n * 2 + 1;
        if (ch >= last) break;
        if (ch + 1 < last && keys[ch + 1] < keys[ch]) ch++;
        if (keys[ch] >= lk) break;
        heap[n] = heap[ch]; keys[n] = keys[ch];
        n = ch;
      }
      heap[n] = li; keys[n] = lk;
    }
    return top;
  }
}

/** 2D segment vs axis-aligned rectangle (slab test). */
function segHitsRect(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [o, d, lo, hi] of [[ax, dx, x0, x1], [az, dz, z0, z1]] as const) {
    if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) return false; continue; }
    let u0 = (lo - o) / d, u1 = (hi - o) / d;
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 >= t1) return false;
  }
  return true;
}

const DC = [1, -1, 0, 0, 1, 1, -1, -1];
const DR = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
