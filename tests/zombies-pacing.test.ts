// Pacing: the Cache reveal, wall-buy tiers, the three-tier Reforger with elemental rounds, the extra perks and perk
// slots, buildables, traps, side eggs, round cadence and the early-round economy. Pure rules plus every registered map.
import { describe, expect, it } from 'vitest';
import { WEAPONS, ZOMBIES, type WeaponId } from '../src/config';
import { SHIELD, benchBlock, build, createBuildState, pickPart, shieldAbsorb, shieldBlock, shieldLost, stepBuild, takeShield } from '../src/zombies/buildables';
import { createEggRun, eggCollect, eggInteract, eggKill } from '../src/zombies/egg';
import { allEggs, doorDepths, frontOf, zoneAt, type BuildableDef, type TrapDef, type ZombiesMapDef } from '../src/zombies/mapdef';
import { MAPS, getMap } from '../src/zombies/maps';
import { NIGHTFALL } from '../src/zombies/maps/nightfall/def';
import { AIM_ASSIST, aimAssistTarget, lookAngles, muleRotate, novaDamage } from '../src/zombies/perkfx';
import { pickRevealSpot, revealDue } from '../src/zombies/progression';
import {
  BOX_POOL, DEFAULT_SCHEDULE, ELEMENT_CHANCE, PAP_ELEMENT, PAP_MAX_TIER, PAP_TIER_PRICES, PERKS, PERK_LIMIT, PERK_LIMIT_MAX, POINTS, WALL_BUYS,
  WEAPON_TIER, WONDER_WEAPONS, addPerkSlots, createBox, createRoundState, createZPlayer, goDown, grantPerk, isBlackoutRound, isBossRound,
  isSpecialRound, makeSchedule, papName, papPrice, perkMods, pullBox, revealBox, roundBonus, rollElement, stepBox, stepRounds, tryBuyPerk,
  wallBuyPrice, zombieCountForRound, zombieHpMultForRound, type PerkId,
} from '../src/zombies/rules';
import { TRAP_DEFAULTS, activateTrap, createTrapState, inTrap, stepTrap, trapBlock } from '../src/zombies/traps';
import { validateMapDef } from '../src/zombies/validate';
import { unlockedZones, createZoneState, buyDoor } from '../src/zombies/zones';
import { topologyOf } from '../src/zombies/mapdef';

const PLAYABLE = MAPS.filter((m) => !m.hidden).map((m) => m.def);
const lcg = (seed = 7) => { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; };
const clone = (d: ZombiesMapDef): ZombiesMapDef => structuredClone(d);
const codes = (d: ZombiesMapDef) => validateMapDef(d).issues.map((i) => i.code);

describe('round cadence', () => {
  it('the default schedule is the classic fixed one', () => {
    expect([5, 10, 15, 20].every((n) => isSpecialRound(n))).toBe(true);
    expect(isSpecialRound(6)).toBe(false);
    expect(isBossRound(8) && isBossRound(16) && !isBossRound(40)).toBe(true);
    expect(isBlackoutRound(13) && isBlackoutRound(23) && !isBlackoutRound(15)).toBe(true);
    expect(DEFAULT_SCHEDULE.specials.slice(0, 3)).toEqual([5, 10, 15]);
  });
  it('a map cadence lands specials a little unpredictably but inside its windows, deterministically per seed', () => {
    const def = { special: { first: [5, 7] as [number, number], every: [4, 6] as [number, number] }, bossEvery: 9 };
    for (let seed = 1; seed < 40; seed++) {
      const s = makeSchedule(def, lcg(seed));
      expect(s.specials[0]).toBeGreaterThanOrEqual(5);
      expect(s.specials[0]).toBeLessThanOrEqual(7);
      for (let i = 1; i < 20; i++) {
        const gap = s.specials[i] - s.specials[i - 1];
        expect(gap).toBeGreaterThanOrEqual(4);
        expect(gap).toBeLessThanOrEqual(6);
      }
      for (let n = 1; n < 80; n++) if (isBossRound(n, s)) expect(isSpecialRound(n, s)).toBe(false);
      expect(makeSchedule(def, lcg(seed)).specials).toEqual(s.specials);
    }
    expect(makeSchedule({ special: null }).specials).toEqual([]);
  });
  it('the round director follows the schedule it was given', () => {
    const sched = makeSchedule({ special: { first: [3, 3], every: [4, 4] } });
    const s = createRoundState(1, sched);
    const specials: number[] = [];
    for (let i = 0; i < 8; i++) { s.phase = 'break'; s.timer = 0; stepRounds(s, 0.01, 0); if (s.spec.special) specials.push(s.round); }
    expect(specials).toEqual([3, 7]);
  });
  it('rounds 1-5 follow the classic solo counts and never more than 24 are alive', () => {
    expect([1, 2, 3, 4, 5].map((n) => zombieCountForRound(n))).toEqual([6, 8, 13, 18, 24]);
    const s = createRoundState();
    s.timer = 0; stepRounds(s, 0.01, 0); s.toSpawn = 500;
    expect(stepRounds(s, 999, 0).spawn).toBe(24);
  });
  it('every playable map declares its cadence', () => {
    for (const d of PLAYABLE) expect(d.rounds?.special, d.id).toBeTruthy();
  });
});

describe('early economy (round 1-5 feel)', () => {
  // A player with the starting pistol shooting centre mass: every non-lethal hit pays 10, the kill pays 60.
  const pointsForRound = (n: number) => {
    const hp = ZOMBIES.shambler.hp * zombieHpMultForRound(n);
    const hits = Math.ceil(hp / WEAPONS.pi_warden.damage);
    return zombieCountForRound(n) * ((hits - 1) * POINTS.hit + POINTS.kill) + roundBonus(n);
  };
  const cheapestStarter = (d: ZombiesMapDef) => Math.min(...d.wallBuys.filter((w) => zoneAt(d, ...(((p) => [p.x, p.z, p.y] as const)(frontOf({ ...w }, 0.8)))) === d.startZone).map((w) => WALL_BUYS[w.key].price));
  const firstDoor = (d: ZombiesMapDef) => Math.min(...d.doors.filter((x) => x.a === d.startZone || x.b === d.startZone).map((x) => x.cost));
  it('knife and pistol through round 1: a wall gun OR a door, not both; the first door by round 2-3 even after a wall gun', () => {
    for (const d of PLAYABLE) {
      const after1 = POINTS.start + pointsForRound(1);
      expect(after1, d.id).toBeLessThan(firstDoor(d) + cheapestStarter(d));
      expect(after1, d.id).toBeGreaterThanOrEqual(firstDoor(d));
      const after3 = after1 + pointsForRound(2) + pointsForRound(3);
      expect(after3, d.id).toBeGreaterThanOrEqual(firstDoor(d) + cheapestStarter(d));
    }
  });
  it('the starter guns are the cheap ones', () => {
    const byTier = (t: string) => Object.values(WALL_BUYS).filter((w) => w.tier === t).map((w) => w.price);
    expect(Math.max(...byTier('starter'))).toBeLessThanOrEqual(1000);
    expect(Math.min(...byTier('standard'))).toBeGreaterThan(Math.max(...byTier('starter')));
    expect(Math.min(...byTier('heavy'))).toBeGreaterThan(Math.max(...byTier('standard')));
  });
});

describe('the Cache reveal', () => {
  it('conditions: any of doors / zones / round / power', () => {
    const c = { doorsOpened: 0, unlocked: new Set([0]), round: 1, power: false };
    expect(revealDue(undefined, c)).toBe(true);
    expect(revealDue({ doors: 2 }, c)).toBe(false);
    expect(revealDue({ doors: 2 }, { ...c, doorsOpened: 2 })).toBe(true);
    expect(revealDue({ zones: [3] }, { ...c, unlocked: new Set([0, 3]) })).toBe(true);
    expect(revealDue({ doors: 5, round: 4 }, { ...c, round: 4 })).toBe(true);
    expect(revealDue({ power: true }, { ...c, power: true })).toBe(true);
  });
  it('lands at the designated spot when open, else the first open spot outside the start zone', () => {
    expect(pickRevealSpot({ spot: 2 }, [0, 1, 2], 0, new Set([0, 2]))).toBe(2);
    expect(pickRevealSpot({ spot: 2 }, [0, 1, 2], 0, new Set([0, 1]))).toBe(1);
    expect(pickRevealSpot({ spot: 2 }, [0, 1, 2], 0, new Set([0]))).toBe(2);
  });
  it('a hidden Cache cannot be pulled and does not tick until it surfaces', () => {
    const b = createBox(0, true);
    const p = createZPlayer(); p.points = 5000;
    expect(pullBox(b, p, [], lcg())).toMatchObject({ ok: false, reason: 'busy' });
    expect(stepBox(b, 99, 4, lcg())).toBeNull();
    expect(revealBox(b, 2)).toBe(true);
    expect(b).toMatchObject({ phase: 'idle', location: 2 });
    expect(revealBox(b, 1)).toBe(false);
    expect(pullBox(b, p, [], lcg()).ok).toBe(true);
  });
  it('every playable map hides it at the start and surfaces it outside the start zone as doors open', () => {
    for (const d of PLAYABLE) {
      const r = d.box.reveal!;
      expect(r, d.id).toBeTruthy();
      const topo = topologyOf(d);
      const zs = createZoneState(topo);
      const p = createZPlayer(); p.points = 1e6;
      const spotZones = d.box.spots.map((s) => zoneAt(d, s.x, s.z, s.y ?? 0));
      expect(revealDue(r, { doorsOpened: 0, unlocked: unlockedZones(topo, zs), round: 1, power: false }), d.id).toBe(false);
      // Open doors cheapest-first from the start (the way a player pushes out) until it surfaces.
      let opened = 0;
      for (let guard = 0; guard < d.doors.length; guard++) {
        const open = unlockedZones(topo, zs);
        if (revealDue(r, { doorsOpened: opened, unlocked: open, round: 1, power: false })) break;
        const next = topo.doors.filter((x) => !zs.opened.has(x.id) && !x.requiresPower && (open.has(x.a) || open.has(x.b))).sort((a, b) => a.cost - b.cost)[0];
        expect(buyDoor(topo, zs, p, next.id, false).ok).toBe(true);
        opened++;
      }
      const open = unlockedZones(topo, zs);
      expect(revealDue(r, { doorsOpened: opened, unlocked: open, round: 1, power: false }), d.id).toBe(true);
      const at = pickRevealSpot(r, spotZones, d.startZone, open, d.box.start ?? 0);
      expect(spotZones[at], d.id).not.toBe(d.startZone);
      expect(open.has(spotZones[at]), `${d.id} lands in an open zone`).toBe(true);
      // The safety net: a player who never opens a door still sees it by the reveal round.
      expect(revealDue(r, { doorsOpened: 0, unlocked: new Set([d.startZone]), round: r.round!, power: false })).toBe(true);
    }
  });
});

describe('wall-buy tiers', () => {
  it('every zombies weapon has a tier; wonder weapons are box-only and never on a wall', () => {
    for (const id of Object.keys(WEAPON_TIER) as WeaponId[]) expect(WEAPONS[id], id).toBeTruthy();
    for (const w of WONDER_WEAPONS) { expect(WEAPON_TIER[w]).toBe('wonder'); expect(Object.values(WALL_BUYS).some((b) => b.weapon === w)).toBe(false); }
    for (const b of Object.values(WALL_BUYS)) expect(WEAPON_TIER[b.weapon]).toBe(b.tier);
    for (const e of BOX_POOL) expect(WEAPON_TIER[e.weapon] === 'starter', e.weapon).toBe(false);
  });
  it('ammo is half price; reforged ammo costs more on better guns', () => {
    for (const b of Object.values(WALL_BUYS)) expect(wallBuyPrice(b, 0).price).toBe(b.price / 2);
    expect(wallBuyPrice(WALL_BUYS.pi_magnus, 1).price).toBeLessThan(wallBuyPrice(WALL_BUYS.ar_corvid, 1).price);
    expect(wallBuyPrice(WALL_BUYS.ar_corvid, 1).price).toBeLessThan(wallBuyPrice(WALL_BUYS.lmg_bastion, 1).price);
  });
  it('on every map: spawn zone has only starters (at least one), standard at least one door in, heavy at least two', () => {
    for (const d of PLAYABLE) {
      const depth = doorDepths(d);
      let starters = 0;
      for (const w of d.wallBuys) {
        const f = frontOf({ ...w }, 0.8);
        const z = zoneAt(d, f.x, f.z, f.y);
        const t = WALL_BUYS[w.key].tier;
        if (z === d.startZone) { expect(t, `${d.id} ${w.key}`).toBe('starter'); starters++; }
        if (t === 'standard') expect(depth.get(z)!, `${d.id} ${w.key}`).toBeGreaterThanOrEqual(1);
        if (t === 'heavy') expect(depth.get(z)!, `${d.id} ${w.key}`).toBeGreaterThanOrEqual(2);
      }
      expect(starters, d.id).toBeGreaterThanOrEqual(3);
      expect(d.wallBuys.some((w) => WALL_BUYS[w.key].tier === 'heavy'), d.id).toBe(true);
    }
  });
});

describe('the Reforger', () => {
  it('three passes at rising cost, each with a new name', () => {
    expect(PAP_MAX_TIER).toBe(3);
    expect([0, 1, 2].map((t) => papPrice(t))).toEqual([...PAP_TIER_PRICES]);
    expect(PAP_TIER_PRICES[0] < PAP_TIER_PRICES[1] && PAP_TIER_PRICES[1] < PAP_TIER_PRICES[2]).toBe(true);
    expect(papPrice(3)).toBeNull();
    expect(['KR-7 KESTREL', 'SKYRENDER', 'SKYRENDER II', 'SKYRENDER III'].map((n, t) => papName('ar_kestrel', 'KR-7 KESTREL', t) === n)).toEqual([true, true, true, true]);
  });
  it('elemental rounds proc from tier II only, at the tier chance, with the gun\'s own element', () => {
    expect(rollElement('smg_wren', 1, () => 0)).toBeNull();
    expect(rollElement('smg_wren', 2, () => 0)).toBe('shock');
    expect(rollElement('sg_hullbreaker', 3, () => 0.01)).toBe('fire');
    expect(rollElement('ar_corvid', 2, () => ELEMENT_CHANCE[2] + 0.001)).toBeNull();
    expect(rollElement('ww_arc', 3, () => 0)).toBeNull();
    const n = 20000, r = lcg(3);
    let hits = 0;
    for (let i = 0; i < n; i++) if (rollElement('dmr_sentry', 3, r) === 'freeze') hits++;
    expect(hits / n).toBeCloseTo(ELEMENT_CHANCE[3], 1);
    for (const b of Object.values(WALL_BUYS)) expect(PAP_ELEMENT[b.weapon], b.weapon).toBeTruthy();
  });
});

describe('perks', () => {
  it('eight original perks; the new ones change how you play', () => {
    expect(Object.keys(PERKS)).toHaveLength(8);
    for (const d of Object.values(PERKS)) expect(d.name).not.toMatch(/jugg|cola|double tap|quick revive|stamin-up|deadshot|mule kick|phd|flopper/i);
    const m = perkMods(['strider', 'hawkeye', 'packmule', 'nova']);
    expect(m.sprintMult).toBeGreaterThan(1);
    expect(m.staminaDrainMult).toBeLessThan(1);
    expect(m.adsMult).toBeLessThan(1);
    expect(m.spreadMult).toBeLessThan(1);
    expect(m.headMult).toBeGreaterThan(1);
    expect(m.aimAssist && m.blastImmune && m.slideNova).toBe(true);
    expect(m.extraSlots).toBe(1);
  });
  it('limit 4, raised by an egg (capped), kept through going down; free perks ignore the limit', () => {
    const p = createZPlayer(); p.points = 1e6;
    const ids: PerkId[] = ['bulwark', 'quickhands', 'hammerfall', 'strider', 'hawkeye'];
    for (const id of ids.slice(0, 4)) expect(tryBuyPerk(p, id, true).ok).toBe(true);
    expect(tryBuyPerk(p, 'hawkeye', true)).toMatchObject({ ok: false, reason: 'limit' });
    expect(addPerkSlots(p)).toBe(PERK_LIMIT + 1);
    expect(tryBuyPerk(p, 'hawkeye', true).ok).toBe(true);
    expect(addPerkSlots(p, 10)).toBe(PERK_LIMIT_MAX);
    goDown(p);
    expect(p.perks).toEqual([]);
    expect(p.perkLimit).toBe(PERK_LIMIT_MAX);
    const q = createZPlayer();
    for (const id of ['bulwark', 'quickhands', 'hammerfall', 'strider'] as const) grantPerk(q, id);
    expect(grantPerk(q, 'nova')).toBe(true);
    expect(grantPerk(q, 'nova')).toBe(false);
    expect(q.perks).toHaveLength(5);
  });
  it('every playable map offers at least three of the new perks, each a separate machine', () => {
    for (const d of PLAYABLE) {
      const extra = (['strider', 'hawkeye', 'packmule', 'nova'] as const).filter((k) => d.perks[k]);
      expect(extra.length, d.id).toBeGreaterThanOrEqual(3);
    }
  });
  it('Packmule cycles three guns through two slots; Hawkeye snaps to the nearest head in the cone; Nova scales', () => {
    let st = { slots: ['A', 'B'] as [string | null, string | null], stash: 'C' as string | null };
    let active: 0 | 1 = 0;
    const seen: string[] = [st.slots[active]!];
    for (let i = 0; i < 3; i++) { const to: 0 | 1 = active === 0 ? 1 : 0; st = muleRotate(st.slots, to, st.stash); active = to; seen.push(st.slots[active]!); }
    expect(seen).toEqual(['A', 'C', 'B', 'A']);
    expect(muleRotate(['A', 'B'], 1, null)).toEqual({ slots: ['A', 'B'], stash: null });
    const eye = { x: 0, y: 1.6, z: 0 };
    const near = { x: 0.4, y: 1.8, z: -10 }, far = { x: 0, y: 1.8, z: -30 }, wide = { x: 10, y: 1.8, z: -2 };
    const t = aimAssistTarget(eye, 0, 0, [wide, far, near]);
    expect(t).toEqual(lookAngles(eye, far)); // closest to the view centre wins, not the closest in distance
    expect(aimAssistTarget(eye, 0, 0, [wide])).toBeNull();
    expect(aimAssistTarget(eye, Math.PI, 0, [far])).toBeNull();
    expect(AIM_ASSIST.cone).toBeLessThan(0.3);
    expect(novaDamage(10)).toBeGreaterThan(novaDamage(1));
  });
});

describe('buildables', () => {
  const shield: BuildableDef = { id: 's', name: 'Shield', bench: { x: 0, z: 0, face: 0 }, parts: [{ name: 'a', x: 0, y: 1, z: 0 }, { name: 'b', x: 1, y: 1, z: 0 }], result: { kind: 'shield', hp: 1000 }, requiresPower: true };
  it('pick up every part, then build at the bench (with power), then take the shield', () => {
    const st = createBuildState(shield);
    expect(benchBlock(shield, st, true)).toBe('missing');
    expect(pickPart(st, 0)).toBe('picked');
    expect(pickPart(st, 0)).toBe('none');
    expect(pickPart(st, 1)).toBe('all');
    expect(benchBlock(shield, st, false)).toBe('power');
    expect(build(shield, st, false)).toBe(false);
    expect(build(shield, st, true)).toBe(true);
    expect(benchBlock(shield, st, true)).toBe('built');
    expect(takeShield(shield, st)).toBe(1000);
    expect(shieldBlock(shield, st)).toBe('carrying');
    expect(takeShield(shield, st)).toBe(0);
    shieldLost(st);
    expect(shieldBlock(shield, st)).toBe('cooldown');
    stepBuild(st, SHIELD.reissue - 1);
    expect(takeShield(shield, st)).toBe(0);
    stepBuild(st, 1.01);
    expect(takeShield(shield, st)).toBe(1000);
  });
  it('the shield takes every hit from behind and part of a hit from the front, then breaks', () => {
    const fwd = { x: 0, z: -1 };
    expect(shieldAbsorb(100, 30, fwd, { x: 0, z: 1 })).toMatchObject({ absorbed: 30, through: 0, broke: false, hp: 70 });
    const f = shieldAbsorb(100, 30, fwd, { x: 0, z: -1 });
    expect(f.absorbed).toBeCloseTo(30 * SHIELD.frontShare);
    expect(shieldAbsorb(10, 30, fwd, { x: 0, z: 1 })).toMatchObject({ absorbed: 10, through: 20, broke: true, hp: 0 });
    expect(shieldAbsorb(0, 30, fwd, { x: 0, z: 1 }).through).toBe(30);
  });
  it('every playable map has a buildable with parts in at least two zones and a bench outside the start zone', () => {
    for (const d of PLAYABLE) {
      expect(d.buildables?.length, d.id).toBeGreaterThanOrEqual(1);
      for (const b of d.buildables!) {
        expect(new Set(b.parts.map((p) => zoneAt(d, p.x, p.z, p.y - 0.5))).size, `${d.id} ${b.id}`).toBeGreaterThanOrEqual(2);
        expect(zoneAt(d, b.bench.x, b.bench.z, b.bench.y ?? 0), d.id).not.toBe(d.startZone);
      }
    }
  });
});

describe('traps', () => {
  const trap: TrapDef = { id: 't', name: 'T', kind: 'electric', switch: { x: 0, z: 0, face: 0 }, area: { x0: 0, z0: 0, x1: 4, z1: 2, y: 3 }, requiresPower: true, requiresBuild: 'b' };
  it('costs, gates, runs, cools down, is ready again', () => {
    const st = createTrapState();
    const p = createZPlayer(); p.points = 2500;
    expect(trapBlock(trap, st, false, true)).toBe('power');
    expect(trapBlock(trap, st, true, false)).toBe('build');
    expect(activateTrap(trap, st, p, false, true)).toMatchObject({ ok: false, reason: 'power' });
    expect(activateTrap(trap, st, p, true, true)).toMatchObject({ ok: true, price: TRAP_DEFAULTS.cost });
    expect(p.points).toBe(2500 - TRAP_DEFAULTS.cost);
    expect(activateTrap(trap, st, p, true, true)).toMatchObject({ ok: false, reason: 'busy' });
    expect(stepTrap(trap, st, TRAP_DEFAULTS.seconds - 0.1)).toBeNull();
    expect(stepTrap(trap, st, 0.2)).toBe('off');
    expect(trapBlock(trap, st, true, true)).toBe('cooldown');
    expect(stepTrap(trap, st, TRAP_DEFAULTS.cooldown)).toBe('ready');
    expect(activateTrap(trap, st, p, true, true).ok).toBe(true);
    expect(p.points).toBe(500);
    expect(activateTrap(trap, createTrapState(), p, true, true)).toMatchObject({ ok: false, reason: 'funds' });
  });
  it('the killing floor is the rect near its floor height', () => {
    expect(inTrap(trap, 2, 3, 1)).toBe(true);
    expect(inTrap(trap, 5, 3, 1)).toBe(false);
    expect(inTrap(trap, 2, 9, 1)).toBe(false);
  });
  it('every playable map has at least one trap, and a trap-building buildable arms a real trap', () => {
    for (const d of PLAYABLE) {
      expect(d.traps?.length, d.id).toBeGreaterThanOrEqual(1);
      for (const b of d.buildables ?? []) if (b.result.kind === 'trap') { const id = b.result.trap; expect(d.traps!.some((t) => t.id === id && t.requiresBuild === b.id)).toBe(true); }
    }
  });
});

describe('easter eggs', () => {
  /** Drive an egg to completion through the pure step machine. */
  const finish = (egg: NonNullable<ZombiesMapDef['egg']>) => {
    const run = createEggRun(egg);
    let last = 'none';
    for (const s of egg.steps) {
      if (s.kind === 'kill') for (let i = 0; i < s.count; i++) last = eggKill(egg, run, s.zone, true);
      else s.objects.forEach((_, i) => { last = s.kind === 'collect' ? eggCollect(egg, run, i, true) : eggInteract(egg, run, i, true); });
    }
    return { run, last };
  };
  it('every playable map has a multi-step main quest and a side quest; both complete, rewards are valid', () => {
    for (const d of PLAYABLE) {
      expect(d.egg!.steps.length, d.id).toBeGreaterThanOrEqual(3);
      expect(d.egg!.reward.perkSlot, d.id).toBe(1);
      expect(d.sideEggs?.length, d.id).toBeGreaterThanOrEqual(1);
      for (const e of allEggs(d)) {
        const { run, last } = finish(e);
        expect(run.complete, `${d.id} ${e.name}`).toBe(true);
        expect(last).toBe('complete');
      }
      const side = d.sideEggs![0].reward;
      expect(side.music && side.perk && PERKS[side.perk]).toBeTruthy();
    }
  });
  it('Nightfall\'s quest keeps the radios as step one (mapdata RELICS) and ends at the transmitter', () => {
    expect(NIGHTFALL.egg!.steps[0].kind).toBe('interact');
    expect(NIGHTFALL.egg!.steps.map((s) => s.kind)).toEqual(['interact', 'collect', 'kill', 'interact']);
  });
});

describe('validator: pacing checks', () => {
  it('flags a Cache that first surfaces in the start zone, or never', () => {
    const d = clone(NIGHTFALL);
    d.box.reveal = { doors: 1, spot: 0 };
    expect(codes(d)).toContain('box-reveal-start');
    d.box.reveal = { spot: 1 };
    expect(codes(d)).toContain('box-reveal-never');
    d.box.reveal = { doors: 99, spot: 1 };
    expect(codes(d)).toContain('box-reveal-doors');
  });
  it('flags a non-starter gun in the spawn room and a spawn room with no starter', () => {
    const d = clone(NIGHTFALL);
    d.wallBuys = d.wallBuys.map((w) => (w.key === 'smg_wren' ? { ...w, key: 'ar_kestrel' } : w));
    expect(codes(d)).toContain('wallbuy-tier');
    d.wallBuys = d.wallBuys.filter((w) => zoneAt(d, ...(((p) => [p.x, p.z, p.y] as const)(frontOf({ ...w }, 0.8)))) !== d.startZone);
    expect(codes(d)).toContain('wallbuy-starter');
  });
  it('flags unreachable parts/benches/switches and dangling trap/build references', () => {
    const d = clone(NIGHTFALL);
    d.buildables![0].parts[0] = { ...d.buildables![0].parts[0], x: 30, z: 30 };
    d.buildables![0].bench = { x: 35, z: 35, face: 0 };
    d.traps![0].switch = { x: 36, z: -36, face: 0 };
    d.traps![0].requiresBuild = 'nope';
    const c = codes(d);
    expect(c).toContain('part-unreachable');
    expect(c).toContain('bench-unreachable');
    expect(c).toContain('trap-unreachable');
    expect(c).toContain('trap-build');
  });
  it('registered maps raise no pacing warnings (tier depth, spread)', () => {
    for (const m of MAPS) {
      const warns = validateMapDef(m.def).issues.filter((i) => ['wallbuy-depth', 'build-spread', 'box-reveal-ahead', 'trap-spawn'].includes(i.code));
      expect(warns, m.def.id).toEqual([]);
    }
    expect(getMap('lahore-darbar').def.box.reveal).toBeTruthy();
  });
});
