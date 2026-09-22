// Round-based Zombies mode runtime: owns the round director, points, and the machines placed on the level.
// All rules live in ./rules (pure, tested); this file is the thin three.js + game glue.
import * as THREE from 'three';
import { PLAYER, WEAPONS, type WeaponId } from '../config';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { Zombie } from '../enemies/Zombie';
import type { Loadout } from '../mission/Economy';
import type { Vitals } from '../player/Vitals';
import { signTexture } from '../render/textures';
import { UPGRADE_TIERS } from '../config';
import { createWeapon, refillAmmo, WEAPON_MODS, applyUpgrade } from '../weapons/WeaponState';
import type { Level } from '../world/Level';
import {
  BOX_PRICE, PERKS, WALL_BUYS, awardHit, awardKill, createBox, createRoundState, createZPlayer, goDown, papPrice, perkMods, pickZombieType,
  pullBox, roundBonus, stepBox, stepRounds, takeBoxOffer, tryBuyPerk, tryPap, trySpend, wallBuyPrice, type BoxState, type PerkId,
  type RoundState, type SpendResult, type ZPlayer,
} from './rules';

type P2 = { x: number; z: number };
export type ZInteraction =
  | { kind: 'wall'; key: keyof typeof WALL_BUYS }
  | { kind: 'box' }
  | { kind: 'pap' }
  | { kind: 'perk'; id: PerkId }
  | { kind: 'power' };

export interface ZHost {
  level: Level;
  enemies: EnemyManager;
  loadout: () => Loadout;
  vitals: () => Vitals;
  syncWeapons: () => void;
  toast: (t: string, kind?: '' | 'big' | 'good' | 'bad', small?: string, dur?: number) => void;
  sound: (k: 'buy' | 'deny' | 'upgrade' | 'alert' | 'complete' | 'loot' | 'radio') => void;
}

// Layout on the existing district (low region, around the insertion point). Crate spots are reused so every
// machine sits on floor that already has a collider footprint.
const BOX_SPOTS: P2[] = [{ x: -25.5, z: 90.5 }, { x: 27, z: 90.6 }, { x: -39, z: 47.5 }];
const PERK_SPOTS: Record<PerkId, P2> = {
  bulwark: { x: -30, z: 97.3 }, quickhands: { x: 33, z: 96.5 }, hammerfall: { x: -66.5, z: 44 }, lifeline: { x: 6, z: 97 },
};
const PAP_SPOT: P2 = { x: 9.3, z: 88 };
const POWER_SPOT: P2 = { x: -6, z: 80 };
const WALL_SPOTS: Partial<Record<keyof typeof WALL_BUYS, P2>> = { pi_warden: { x: -4, z: 97 }, sg_hullbreaker: { x: 14, z: 76 }, ar_kestrel: { x: -16, z: 78 } };

const REASON: Record<string, string> = { funds: 'NOT ENOUGH POINTS', owned: 'ALREADY OWNED', max: 'MAXED', limit: 'PERK LIMIT (4)', busy: 'BUSY', power: 'REQUIRES POWER' };

export class ZombiesMode {
  readonly group = new THREE.Group();
  zp: ZPlayer = createZPlayer();
  rounds: RoundState = createRoundState();
  box: BoxState = createBox(0);
  power = false;
  lifelineBuys = 0;
  kills = 0;
  private boxMeshes: THREE.Group[] = [];
  private boxGlow: THREE.Mesh[] = [];
  private offerMesh: THREE.Mesh;
  private papMesh!: THREE.Group;
  private papT = 0;
  private powerLight!: THREE.Mesh;
  private rnd = Math.random;

  constructor(private host: ZHost) {
    this.group.visible = false;
    for (const s of BOX_SPOTS) this.boxMeshes.push(this.buildBox(s));
    for (const id of Object.keys(PERK_SPOTS) as PerkId[]) this.buildMachine(PERK_SPOTS[id], PERKS[id].color, [PERKS[id].name, `${PERKS[id].price}`], 2.1);
    this.papMesh = this.buildMachine(PAP_SPOT, 0x9040ff, ['REFORGER', '5000 / 2500'], 2.4);
    const pw = this.buildMachine(POWER_SPOT, 0x404040, ['POWER', 'THROW SWITCH'], 1.6);
    this.powerLight = pw.userData.panel as THREE.Mesh;
    for (const k of Object.keys(WALL_SPOTS) as (keyof typeof WALL_BUYS)[]) this.buildWallBuy(WALL_SPOTS[k]!, k);
    this.offerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60f0ff).multiplyScalar(2) }));
    this.offerMesh.visible = false;
    this.group.add(this.offerMesh);
  }

  reset(): void {
    this.zp = createZPlayer();
    this.rounds = createRoundState();
    this.box = createBox(0);
    this.power = false;
    this.lifelineBuys = 0;
    this.kills = 0;
    this.papT = 0;
    this.applyMods();
    this.refreshVisuals();
  }

  /** Called when leaving Zombies so extraction runs with stock stats. */
  clearMods(): void {
    WEAPON_MODS.damageMult = WEAPON_MODS.rpmMult = WEAPON_MODS.reloadMult = 1;
    PLAYER.maxHealth = 100;
  }

  private applyMods(): void {
    const m = perkMods(this.zp.perks);
    WEAPON_MODS.damageMult = m.damageMult;
    WEAPON_MODS.rpmMult = m.rpmMult;
    WEAPON_MODS.reloadMult = m.reloadMult;
    PLAYER.maxHealth = 100 * m.maxHealthMult;
  }

  // --------------------------------------------------------------------------------------
  update(dt: number, player: { x: number; z: number }): void {
    const alive = this.host.enemies.aliveCount;
    const ev = stepRounds(this.rounds, dt, alive);
    if (ev.started) {
      this.host.toast(`ROUND ${ev.started}`, 'big', this.rounds.spec.special ? 'SPECIAL ROUND · THEY ARE FAST' : '', 3);
      this.host.sound('alert');
    }
    if (ev.ended) {
      const b = roundBonus(ev.ended);
      this.zp.points += b;
      this.host.toast(`ROUND ${ev.ended} SURVIVED`, 'good', `+${b}`, 2.5);
      this.host.sound('complete');
    }
    for (let i = 0; i < ev.spawn; i++) this.spawnOne(player);

    const be = stepBox(this.box, dt, BOX_SPOTS.length, this.rnd);
    if (be === 'moth') { this.host.toast('THE MOTH TAKES THE CACHE', 'bad', 'It will land somewhere else · pull refunded', 3); this.host.sound('deny'); }
    if (be === 'arrived') { this.host.toast('THE CACHE HAS MOVED', '', '', 2); this.refreshVisuals(); }
    if (be === 'expired') this.refreshVisuals();
    if (be === 'offer') this.host.sound('loot');
    if (this.papT > 0) this.papT -= dt;
    this.animate(dt);
  }

  private spawnOne(player: P2): void {
    const pts = [...this.host.level.poi.spawns.low, ...this.host.level.poi.spawns.medium];
    const ok = pts.filter((p) => { const d = Math.hypot(p.x - player.x, p.z - player.z); return d > 16 && d < 70; });
    const list = ok.length ? ok : pts;
    const s = list[Math.floor(this.rnd() * list.length)];
    const type = pickZombieType(this.rounds.spec, this.rnd);
    const z: Zombie = this.host.enemies.spawn(type, 'low', s.x + (this.rnd() - 0.5) * 3, s.z + (this.rnd() - 0.5) * 3, 'chase');
    z.maxHp *= this.rounds.spec.hpMult;
    z.hp = z.maxHp;
    z.reward = 0; // points come from the Zombies economy, not extraction salvage
  }

  onHit(kind: 'body' | 'head' | 'kill' | 'armor'): void {
    if (kind !== 'kill') awardHit(this.zp);
  }

  onKill(head: boolean): void {
    this.kills++;
    awardKill(this.zp, head);
  }

  /** Returns true if the player was saved by Lifeline. Perks are lost either way. */
  onDowned(v: Vitals): boolean {
    const saved = goDown(this.zp);
    this.applyMods();
    if (saved) {
      v.alive = true;
      v.health = PLAYER.maxHealth;
      v.sinceDamage = 0;
      this.host.toast('LIFELINE · SELF-REVIVED', 'big', 'Perks lost', 3);
    }
    return saved;
  }

  // --------------------------------------------------------------------------------------
  find(px: number, pz: number): ZInteraction | null {
    const near = (p: P2, r = 2.2) => Math.hypot(p.x - px, p.z - pz) < r;
    if (near(BOX_SPOTS[this.box.location])) return { kind: 'box' };
    if (near(PAP_SPOT, 2.6)) return { kind: 'pap' };
    if (near(POWER_SPOT)) return { kind: 'power' };
    for (const id of Object.keys(PERK_SPOTS) as PerkId[]) if (near(PERK_SPOTS[id])) return { kind: 'perk', id };
    for (const k of Object.keys(WALL_SPOTS) as (keyof typeof WALL_BUYS)[]) if (near(WALL_SPOTS[k]!, 1.8)) return { kind: 'wall', key: k };
    return null;
  }

  prompt(it: ZInteraction): string {
    const l = this.host.loadout();
    switch (it.kind) {
      case 'box':
        if (this.box.phase === 'offer') return `<kbd>E</kbd> Take ${WEAPONS[this.box.offer!].name}`;
        if (this.box.phase !== 'idle') return 'The Cache is deciding…';
        return `<kbd>E</kbd> Open the Cache <span class="cost">${BOX_PRICE}</span>`;
      case 'pap': {
        if (!this.power) return 'Reforger <span class="denied">REQUIRES POWER</span>';
        const w = l.slots[l.active];
        const price = w ? papPrice(w.tier, UPGRADE_TIERS.length - 1) : null;
        return price === null ? 'Reforger <span class="denied">WEAPON MAXED</span>' : `<kbd>E</kbd> Reforge ${w ? WEAPONS[w.id].shortName : ''} <span class="cost">${price}</span>`;
      }
      case 'power': return this.power ? 'Power is on' : '<kbd>E</kbd> Turn on the power';
      case 'perk': {
        const d = PERKS[it.id];
        if (this.zp.perks.includes(it.id)) return `${d.name} <span class="denied">OWNED</span>`;
        if (d.needsPower && !this.power) return `${d.name} <span class="denied">REQUIRES POWER</span>`;
        return `<kbd>E</kbd> ${d.name} · ${d.desc} <span class="cost">${d.price}</span>`;
      }
      case 'wall': {
        const def = WALL_BUYS[it.key];
        const owned = l.slots.find((s) => s?.id === def.weapon);
        const p = wallBuyPrice(def, owned ? owned.tier : null);
        return `<kbd>E</kbd> ${p.action === 'weapon' ? 'Buy' : 'Ammo for'} ${WEAPONS[def.weapon].name} <span class="cost">${p.price}</span>`;
      }
    }
  }

  use(it: ZInteraction): void {
    const l = this.host.loadout();
    const deny = (r: SpendResult) => { if (!r.ok) { this.host.toast(REASON[r.reason] ?? 'DENIED', 'bad', '', 1.4); this.host.sound('deny'); } return !r.ok; };
    switch (it.kind) {
      case 'power':
        if (this.power) return;
        this.power = true;
        this.host.toast('POWER ON', 'big', 'Perks and the Reforger are live', 3);
        this.host.sound('radio');
        this.refreshVisuals();
        return;
      case 'box': {
        if (this.box.phase === 'offer') {
          const w = takeBoxOffer(this.box, 0);
          if (w) { this.giveWeapon(w); this.refreshVisuals(); }
          return;
        }
        const r = pullBox(this.box, this.zp, l.slots.filter(Boolean).map((s) => s!.id), this.rnd);
        if (deny(r)) return;
        this.host.sound('buy');
        return;
      }
      case 'pap': {
        const w = l.slots[l.active];
        if (!w || this.papT > 0) return;
        const r = tryPap(this.zp, w.tier, UPGRADE_TIERS.length - 1, this.power);
        if (deny(r)) return;
        applyUpgrade(w);
        this.papT = 1.2;
        this.host.syncWeapons();
        this.host.toast(`${WEAPONS[w.id].shortName} REFORGED`, 'good', UPGRADE_TIERS[w.tier].name, 2.5);
        this.host.sound('upgrade');
        return;
      }
      case 'perk': {
        const r = tryBuyPerk(this.zp, it.id, this.power, this.lifelineBuys);
        if (deny(r)) return;
        if (it.id === 'lifeline') this.lifelineBuys++;
        this.applyMods();
        if (it.id === 'bulwark') this.host.vitals().health = PLAYER.maxHealth;
        this.host.toast(PERKS[it.id].name, 'good', PERKS[it.id].desc, 2.5);
        this.host.sound('buy');
        return;
      }
      case 'wall': {
        const def = WALL_BUYS[it.key];
        const owned = l.slots.find((s) => s?.id === def.weapon) ?? null;
        const p = wallBuyPrice(def, owned ? owned.tier : null);
        if (deny(trySpend(this.zp, p.price))) return;
        if (owned) refillAmmo(owned), (owned.mag = Math.max(owned.mag, 0));
        else this.giveWeapon(def.weapon);
        this.host.sound('buy');
        return;
      }
    }
  }

  private giveWeapon(id: WeaponId): void {
    const l = this.host.loadout();
    const existing = l.slots.find((s) => s?.id === id);
    if (existing) { refillAmmo(existing); return; }
    const free = l.slots.findIndex((s) => !s);
    const slot = free >= 0 ? free : l.active; // two-weapon limit: replace what you hold
    l.slots[slot] = createWeapon(id);
    l.slots[slot]!.reserve = WEAPONS[id].reserveMax;
    l.active = slot as 0 | 1;
    this.host.syncWeapons();
    this.host.toast(WEAPONS[id].name, 'good', '', 1.8);
  }

  // --------------------------------------------------------------------------------------
  // Visuals (placeholder procedural art until the Meshy assets are approved)
  // --------------------------------------------------------------------------------------
  private ground(p: P2): number { return this.host.level.world.groundHeight(p.x, p.z, 0.3, 0.3); }

  private buildBox(s: P2): THREE.Group {
    const g = new THREE.Group();
    g.position.set(s.x, this.ground(s), s.z);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.75), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.8 }));
    crate.position.y = 0.3;
    g.add(crate);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60e0ff).multiplyScalar(1.5), transparent: true, opacity: 0.35, depthWrite: false }));
    glow.position.y = 2.4;
    g.add(glow);
    this.boxGlow.push(glow);
    this.group.add(g);
    return g;
  }

  private buildMachine(s: P2, color: number, lines: string[], h: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(s.x, this.ground(s), s.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, h, 0.8), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 }));
    body.position.y = h / 2;
    g.add(body);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: signTexture(lines, { bg: '#111', fg: '#fff', border: '#' + color.toString(16).padStart(6, '0') }) }));
    panel.position.set(0, h - 0.35, 0.41);
    const back = panel.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.41;
    g.add(panel, back);
    g.userData.panel = panel;
    this.group.add(g);
    return g;
  }

  private buildWallBuy(s: P2, key: keyof typeof WALL_BUYS): void {
    const def = WALL_BUYS[key];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({
      map: signTexture([WEAPONS[def.weapon].shortName, `${def.price}`], { bg: '#1a1a14', fg: '#f0e0b0', border: '#c9a24a' }),
    }));
    m.position.set(s.x, this.ground(s) + 1.6, s.z);
    const back = m.clone();
    back.rotation.y = Math.PI;
    this.group.add(m, back);
  }

  private refreshVisuals(): void {
    this.boxMeshes.forEach((_m, i) => { this.boxGlow[i].visible = i === this.box.location; });
    (this.powerLight.material as THREE.MeshBasicMaterial).color.set(this.power ? 0x60ff80 : 0xffffff);
    this.offerMesh.visible = false;
  }

  private animate(dt: number): void {
    const b = this.boxMeshes[this.box.location];
    const show = this.box.phase === 'spinning' || this.box.phase === 'offer';
    this.offerMesh.visible = show;
    if (show) {
      this.offerMesh.position.set(b.position.x, b.position.y + 0.9 + Math.min(1, this.box.t) * 0.3, b.position.z);
      this.offerMesh.rotation.y += dt * (this.box.phase === 'spinning' ? 12 : 1.5);
    }
    this.boxGlow[this.box.location].visible = this.box.phase !== 'moving';
    this.papMesh.rotation.y = this.papT > 0 ? Math.sin(this.papT * 40) * 0.03 : 0;
  }
}
