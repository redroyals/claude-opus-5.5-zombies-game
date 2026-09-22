import { describe, expect, it } from 'vitest';
import { encodeInputs, decodeInputs, encodeSnapshot, decodeSnapshot, Reader, qYaw, dqYaw, qPos, dqPos, type EntityState } from '../src/shared/protocol';
import { History, rayPlayer, clampRewind, MAX_REWIND_TICKS } from '../src/shared/lagcomp';
import { xpForLevel, levelForXp, MAX_LEVEL, prestige, canPrestige, matchXp, MATCH_XP_CAP, weaponLevelForKills } from '../src/shared/progression';
import { validateLoadout, DEFAULT_LOADOUTS, streakCost, type Loadout } from '../src/shared/loadout';
import { BoxWorld, newMoveState, stepMove, BTN, TICK_DT } from '../src/shared/movement';
import { MAPS } from '../src/shared/maps';
import { WEAPON_LIST, applyAttachments, damageAt, WEAPONS } from '../src/data/weapons';
import { stepFlag, flagOwner, pickTeam } from '../src/shared/modes';

describe('protocol', () => {
  it('round-trips an input batch with quantized angles', () => {
    const buf = encodeInputs({ viewTick: 1234.5, inputs: [{ seq: 77, fwd: 127, strafe: -64, yaw: 1.2345, pitch: -0.4, buttons: BTN.fire | BTN.jump }, { seq: 78, fwd: 0, strafe: 0, yaw: -2, pitch: 0.2, buttons: 0 }] });
    const r = new Reader(buf); expect(r.u8()).toBe(1);
    const b = decodeInputs(r);
    expect(b.viewTick).toBeCloseTo(1234.5);
    expect(b.inputs).toHaveLength(2);
    expect(b.inputs[1].seq).toBe(78);
    expect(b.inputs[0].strafe).toBe(-64);
    expect(b.inputs[0].yaw).toBeCloseTo(1.2345, 3);
    expect(b.inputs[1].yaw).toBeCloseTo(-2 + Math.PI * 2, 3);
    expect(b.inputs[0].pitch).toBeCloseTo(-0.4, 3);
    expect(b.inputs[0].buttons).toBe(BTN.fire | BTN.jump);
    expect(buf.byteLength).toBe(1 + 4 + 1 + 4 + 2 * 7);
  });
  it('quantizes positions to 1/64 m and yaw wraps', () => {
    expect(Math.abs(dqPos(qPos(12.3456)) - 12.3456)).toBeLessThan(1 / 64);
    expect(dqYaw(qYaw(Math.PI * 2 + 0.5))).toBeCloseTo(0.5, 3);
  });
  it('delta-encodes snapshots: unchanged entities cost 0 bytes, removals propagate', () => {
    const sent = new Map<number, EntityState>(), known = new Map<number, EntityState>();
    const e: EntityState = { id: 3, x: 10, y: 2, z: -5, yaw: 1, pitch: 0.1, flags: 0, health: 100, weapon: 4 };
    const s1 = encodeSnapshot({ tick: 1, ackSeq: 9, self: { x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, moveFlags: 1, slideT: 0, slideCd: 0, health: 100, ammo: 30, reserve: 90, weapon: 0 }, entities: [e], removed: [] }, sent);
    const r1 = new Reader(s1); r1.u8();
    const d1 = decodeSnapshot(r1, known);
    expect(d1.self?.ammo).toBe(30);
    expect(known.get(3)?.x).toBeCloseTo(10, 1);
    const s2 = encodeSnapshot({ tick: 2, ackSeq: 10, self: null, entities: [e], removed: [] }, sent);
    const s3 = encodeSnapshot({ tick: 3, ackSeq: 11, self: null, entities: [{ ...e, health: 60 }], removed: [] }, sent);
    expect(s3.byteLength).toBe(s2.byteLength + 3); // id + mask + hp
    const r2 = new Reader(s2); r2.u8(); expect(decodeSnapshot(r2, known).entities).toHaveLength(0);
    const r3 = new Reader(s3); r3.u8(); expect(decodeSnapshot(r3, known).entities[0].health).toBe(60);
    const s4 = encodeSnapshot({ tick: 4, ackSeq: 12, self: null, entities: [], removed: [3] }, sent);
    const r4 = new Reader(s4); r4.u8(); decodeSnapshot(r4, known);
    expect(known.has(3)).toBe(false);
    expect(sent.has(3)).toBe(false);
  });
});

describe('lag compensation', () => {
  it('interpolates history and hits the rewound position, not the current one', () => {
    const h = new History();
    for (let t = 0; t <= 20; t++) h.push({ tick: t, x: t * 0.25, y: 0, z: -10, h: 1.75, alive: true }); // strafing +x
    const past = h.at(10.5)!;
    expect(past.x).toBeCloseTo(2.625);
    // Shooter at origin aims straight at where target WAS at tick 10.5 (chest height).
    const dir = norm(past.x, 1.2 - 1.6, -10);
    expect(rayPlayer(0, 1.6, 0, dir[0], dir[1], dir[2], past)).not.toBeNull();
    expect(rayPlayer(0, 1.6, 0, dir[0], dir[1], dir[2], h.latest!)).toBeNull();
  });
  it('headshots register as head', () => {
    const p = { x: 0, y: 0, z: -10, h: 1.75 };
    const d = norm(0, 1.61 - 1.6, -10);
    expect(rayPlayer(0, 1.6, 0, d[0], d[1], d[2], p)?.zone).toBe('head');
  });
  it('clamps rewind to MAX_REWIND_TICKS', () => {
    expect(clampRewind(100, 10)).toBe(100 - MAX_REWIND_TICKS);
    expect(clampRewind(100, 150)).toBe(100);
    expect(clampRewind(100, 97.5)).toBe(97.5);
  });
});

describe('progression', () => {
  it('level curve is monotonic, levelForXp inverts xpForLevel', () => {
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      if (l > 1) expect(levelForXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
    expect(levelForXp(1e12)).toBe(MAX_LEVEL);
    expect(xpForLevel(MAX_LEVEL)).toBeGreaterThan(1_000_000);
  });
  it('prestige only at max level, resets xp', () => {
    expect(canPrestige({ xp: 10, prestige: 0 })).toBe(false);
    const p = prestige({ xp: xpForLevel(MAX_LEVEL), prestige: 0 });
    expect(p).toEqual({ xp: 0, prestige: 1 });
  });
  it('match xp is capped', () => {
    expect(matchXp({ kills: 10, headshots: 2, assists: 1, confirms: 0, denies: 0, captures: 0, defends: 0, bestStreak: 5, won: true, completed: true })).toBe(1000 + 100 + 50 + 50 + 500);
    expect(matchXp({ kills: 10000, headshots: 0, assists: 0, confirms: 0, denies: 0, captures: 0, defends: 0, bestStreak: 0, won: true, completed: true })).toBe(MATCH_XP_CAP);
    expect(weaponLevelForKills(0)).toBe(1);
  });
});

describe('create-a-class', () => {
  const lvl1 = { level: 1, prestige: 0, weaponKills: {} };
  it('default classes are valid at level 1', () => {
    for (const l of DEFAULT_LOADOUTS) expect(validateLoadout(l, lvl1)).toEqual([]);
  });
  it('rejects locked weapons, wrong perk tiers, bad attachments, duplicate streaks', () => {
    const bad: Loadout = { ...DEFAULT_LOADOUTS[0], primary: 'ar_quill', perks: ['steady', 'fleet', 'deadsilence'], primaryAttachments: ['acog', 'holo'], streaks: ['scout', 'scout', 'gunship'] };
    const e = validateLoadout(bad, lvl1);
    expect(e.some((m) => m.includes('locked until level 36'))).toBe(true);
    expect(e.some((m) => m.includes('tier 1'))).toBe(true);
    expect(e.some((m) => m.includes('two optic'))).toBe(true);
    expect(e.some((m) => m.includes('3 different'))).toBe(true);
  });
  it('secondary slot needs Double Carry for a primary', () => {
    const l = { ...DEFAULT_LOADOUTS[0], secondary: 'smg_wren' };
    expect(validateLoadout(l, lvl1).join()).toContain('Double Carry');
    const ok = { ...l, perks: ['fleet', 'overkill', 'deadsilence'] as [string, string, string] };
    expect(validateLoadout(ok, { level: 20, prestige: 0, weaponKills: {} })).toEqual([]);
  });
  it('hardline reduces streak cost', () => { expect(streakCost('gunship', ['hardline'])).toBe(6); });
});

describe('weapons data', () => {
  it('ships 45 unique weapons with sane stats', () => {
    expect(WEAPON_LIST).toHaveLength(45);
    expect(new Set(WEAPON_LIST.map((w) => w.id)).size).toBe(45);
    for (const w of WEAPON_LIST) { expect(w.stats.rpm).toBeGreaterThan(0); expect(w.stats.recoil.length).toBeGreaterThan(0); }
  });
  it('falloff and attachments', () => {
    const k = WEAPONS.ar_kestrel.stats;
    expect(damageAt(k, 5, 'body')).toBe(30);
    expect(damageAt(k, 200, 'body')).toBeCloseTo(21);
    expect(damageAt(k, 5, 'head')).toBe(45);
    const s = applyAttachments(WEAPONS.ar_kestrel, ['ext_mag', 'grip', 'bogus']);
    expect(s.magSize).toBe(45);
    expect(s.recoil[0].pitch).toBeCloseTo(0.4);
    expect(WEAPONS.ar_kestrel.stats.magSize).toBe(30); // not mutated
  });
});

describe('shared movement', () => {
  const world = new BoxWorld([[-50, -1, -50, 50, 0, 50], [5, 0, -1, 6, 3, 1], [-3, 0, -10, 3, 0.4, -8]]);
  const run = (buttons = 0, n = 30, yaw = 0) => { const s = newMoveState(0, 0, 0); for (let i = 0; i < n; i++) stepMove(s, { seq: i, fwd: 127, strafe: 0, yaw, pitch: 0, buttons }, world); return s; };
  it('is deterministic', () => { expect(run(BTN.sprint)).toEqual(run(BTN.sprint)); });
  it('walks at walk speed and sprints faster', () => {
    expect(-run(0).vz).toBeCloseTo(4.6, 1);
    expect(-run(BTN.sprint).vz).toBeCloseTo(7.1, 1);
  });
  it('walls block and steps are climbed', () => {
    const s = run(0, 60, -Math.PI / 2); // facing +x into wall at x=5
    expect(s.x).toBeLessThan(5 - 0.29);
    const t = run(0, 60); // walks over the 0.4 m step at z -8..-10
    expect(t.z).toBeLessThan(-8);
  });
  it('jumps and lands', () => {
    const s = newMoveState();
    stepMove(s, { seq: 0, fwd: 0, strafe: 0, yaw: 0, pitch: 0, buttons: BTN.jump }, world);
    expect(s.grounded).toBe(false);
    for (let i = 0; i < 60; i++) stepMove(s, { seq: i, fwd: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0 }, world);
    expect(s.grounded).toBe(true);
    expect(s.y).toBeCloseTo(0, 2);
  });
  it('spawns on every MP map are standable and not inside geometry', () => {
    for (const m of MAPS) {
      const w = new BoxWorld(m.boxes);
      for (const sp of m.spawns) {
        const s = newMoveState(sp.x, sp.y + 0.5, sp.z);
        for (let i = 0; i < 40; i++) stepMove(s, { seq: i, fwd: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0 }, w);
        expect(s.grounded, `${m.id} spawn ${sp.x},${sp.z}`).toBe(true);
        expect(w.overlaps(s.x, s.y + 0.01, s.z, 0.3, 1.7), `${m.id} spawn ${sp.x},${sp.z} inside`).toBe(false);
        expect(Math.abs(s.y - sp.y)).toBeLessThan(0.6);
      }
    }
  });
  it('TICK_DT is 1/30', () => expect(TICK_DT).toBeCloseTo(1 / 30));
});

describe('modes', () => {
  it('flag capture takes ~4 s solo and stalls when contested', () => {
    let p = 0; for (let i = 0; i < 125; i++) p = stepFlag(p, 1, 0, TICK_DT);
    expect(flagOwner(p)).toBe(0);
    expect(stepFlag(0.3, 1, 1, 1)).toBe(0.3);
    expect(pickTeam([3, 2], [0, 0])).toBe(1);
  });
});

function norm(x: number, y: number, z: number) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }
