// D1 access. Reads per request/join; writes batched once per match end.
import { levelForXp, levelUpDollars, DOLLARS, canPrestige } from '../../src/shared/progression';
import { computeCamos, EMPTY_PROGRESS, type WeaponProgress } from '../../src/shared/camos';
import { DEFAULT_LOADOUTS, MAX_CLASSES, validateLoadout, type Loadout, type Unlocks } from '../../src/shared/loadout';
import { COSMETIC_BY_ID } from '../../src/data/cosmetics';
import { isUnlocked, type UnlockKind } from '../../src/shared/unlocks';

export interface Profile {
  id: string; name: string; xp: number; prestige: number; level: number;
  kills: number; deaths: number; wins: number; matches: number;
  balance: number;
  weaponProgress: Record<string, WeaponProgress & { xp: number }>;
  camos: Record<string, string[]>;
  classes: Loadout[];
  inventory: Record<string, number>;
  tokenUnlocks: string[];
}

const now = () => Date.now();

export async function upsertPlayer(db: D1Database, id: string, emailHash: string, name: string) {
  await db.prepare(`INSERT INTO players (id, email_hash, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)
    ON CONFLICT(id) DO UPDATE SET updated_at = ?4`).bind(id, emailHash, name, now()).run();
}

const WP_COLS = 'weapon_id, xp, kills, headshots, longshots, hip_kills, double_kills, no_death_triples, ads_kills, point_blank';
function rowToWp(r: Record<string, number>): WeaponProgress & { xp: number } {
  return { xp: r.xp, kills: r.kills, headshots: r.headshots, longshots: r.longshots, hipKills: r.hip_kills, doubleKills: r.double_kills, noDeathTriples: r.no_death_triples, adsKills: r.ads_kills, pointBlank: r.point_blank };
}

export async function loadProfile(db: D1Database, id: string): Promise<Profile | null> {
  const [p, wp, cls, bal, inv, tok] = await db.batch([
    db.prepare('SELECT * FROM players WHERE id = ?1').bind(id),
    db.prepare(`SELECT ${WP_COLS} FROM weapon_progress WHERE player_id = ?1`).bind(id),
    db.prepare('SELECT slot, json FROM classes WHERE player_id = ?1 ORDER BY slot').bind(id),
    db.prepare('SELECT COALESCE(SUM(delta), 0) AS b FROM ledger WHERE player_id = ?1').bind(id),
    db.prepare('SELECT item_id, qty FROM inventory WHERE player_id = ?1').bind(id),
    db.prepare('SELECT unlock_key FROM token_unlocks WHERE player_id = ?1').bind(id),
  ]);
  const row = p.results[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const weaponProgress: Profile['weaponProgress'] = {};
  for (const r of wp.results as Record<string, number & string>[]) weaponProgress[r.weapon_id as unknown as string] = rowToWp(r);
  const classes = DEFAULT_LOADOUTS.map((l) => ({ ...l }));
  for (const r of cls.results as { slot: number; json: string }[]) {
    try { if (r.slot >= 0 && r.slot < MAX_CLASSES) classes[r.slot] = JSON.parse(r.json); } catch { /* keep default */ }
  }
  return {
    id, name: String(row.name), xp: Number(row.xp), prestige: Number(row.prestige), level: levelForXp(Number(row.xp)),
    kills: Number(row.kills), deaths: Number(row.deaths), wins: Number(row.wins), matches: Number(row.matches),
    balance: Number((bal.results[0] as { b: number }).b),
    weaponProgress, camos: computeCamos(weaponProgress), classes,
    inventory: Object.fromEntries((inv.results as { item_id: string; qty: number }[]).map((r) => [r.item_id, r.qty])),
    tokenUnlocks: (tok.results as { unlock_key: string }[]).map((r) => r.unlock_key),
  };
}

export function unlocksOf(p: Profile): Unlocks {
  return { level: p.level, prestige: p.prestige, tokenUnlocks: p.tokenUnlocks, weaponXp: Object.fromEntries(Object.entries(p.weaponProgress).map(([k, v]) => [k, v.xp])) };
}

export async function saveClass(db: D1Database, p: Profile, slot: number, l: Loadout): Promise<string[]> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_CLASSES) return ['bad slot'];
  const errs = validateLoadout(l, unlocksOf(p));
  if (errs.length) return errs;
  const clean: Loadout = { name: String(l.name ?? `Class ${slot + 1}`).slice(0, 24), primary: l.primary, primaryAttachments: l.primaryAttachments, secondary: l.secondary, secondaryAttachments: l.secondaryAttachments, lethal: l.lethal, tactical: l.tactical, perks: l.perks, streaks: l.streaks, camos: sanitizeCamos(l.camos, p.camos) };
  await db.prepare('INSERT INTO classes (player_id, slot, json) VALUES (?1, ?2, ?3) ON CONFLICT(player_id, slot) DO UPDATE SET json = ?3').bind(p.id, slot, JSON.stringify(clean)).run();
  return [];
}

function sanitizeCamos(c: unknown, owned: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  if (c && typeof c === 'object') for (const [w, camo] of Object.entries(c as Record<string, string>)) if (owned[w]?.includes(camo)) out[w] = camo;
  return out;
}

/** Atomic purchase: the ledger insert only happens if the balance covers the price. */
export async function buy(db: D1Database, playerId: string, itemId: string, nonce: string): Promise<{ ok: boolean; error?: string }> {
  const item = COSMETIC_BY_ID[itemId];
  if (!item || item.price === undefined) return { ok: false, error: 'not for sale' };
  if (item.kind !== 'token') {
    const owned = await db.prepare('SELECT 1 FROM inventory WHERE player_id = ?1 AND item_id = ?2').bind(playerId, itemId).first();
    if (owned) return { ok: false, error: 'already owned' };
  }
  const ref = `buy:${playerId}:${itemId}:${nonce.slice(0, 40)}`;
  const res = await db.prepare(`INSERT OR IGNORE INTO ledger (player_id, delta, reason, ref, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT COALESCE(SUM(delta), 0) FROM ledger WHERE player_id = ?1) >= ?6`)
    .bind(playerId, -item.price, `buy:${itemId}`, ref, now(), item.price).run();
  if (!res.meta.changes) return { ok: false, error: 'insufficient dollars (or duplicate request)' };
  await db.prepare('INSERT INTO inventory (player_id, item_id, qty) VALUES (?1, ?2, 1) ON CONFLICT(player_id, item_id) DO UPDATE SET qty = qty + 1').bind(playerId, itemId).run();
  return { ok: true };
}

export async function useUnlockToken(db: D1Database, p: Profile, kind: UnlockKind, id: string): Promise<{ ok: boolean; error?: string }> {
  if (isUnlocked(unlocksOf(p), kind, id)) return { ok: false, error: 'already unlocked' };
  const r = await db.prepare("UPDATE inventory SET qty = qty - 1 WHERE player_id = ?1 AND item_id = 'unlock_token' AND qty > 0").bind(p.id).run();
  if (!r.meta.changes) return { ok: false, error: 'no unlock tokens' };
  await db.prepare('INSERT OR IGNORE INTO token_unlocks (player_id, unlock_key) VALUES (?1, ?2)').bind(p.id, `${kind}:${id}`).run();
  return { ok: true };
}

export async function doPrestige(db: D1Database, p: Profile): Promise<{ ok: boolean; error?: string }> {
  if (!canPrestige(p)) return { ok: false, error: 'reach max level first' };
  const next = p.prestige + 1;
  await db.batch([
    db.prepare('UPDATE players SET xp = 0, prestige = ?2, updated_at = ?3 WHERE id = ?1 AND prestige = ?4').bind(p.id, next, now(), p.prestige),
    db.prepare('INSERT OR IGNORE INTO ledger (player_id, delta, reason, ref, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(p.id, DOLLARS.perPrestige, 'prestige', `prestige:${p.id}:${next}`, now()),
    db.prepare("INSERT INTO inventory (player_id, item_id, qty) VALUES (?1, 'unlock_token', 1) ON CONFLICT(player_id, item_id) DO UPDATE SET qty = qty + 1").bind(p.id),
  ]);
  return { ok: true };
}

export interface MatchResultPlayer {
  playerId: string; team: number; kills: number; deaths: number; score: number; won: boolean;
  xp: number; dollars: number; xpBefore: number;
  weaponDelta: Record<string, WeaponProgress & { xp: number }>;
  weaponBefore: Record<string, WeaponProgress & { xp: number }>;
}

/** Everything for one match in ONE D1 batch. Credits are idempotent via ledger.ref. */
export function camoPayouts(before: Record<string, WeaponProgress & { xp: number }>, delta: Record<string, WeaponProgress & { xp: number }>) {
  const after: Record<string, WeaponProgress> = {};
  for (const [w, b] of Object.entries(before)) after[w] = { ...b };
  for (const [w, d] of Object.entries(delta)) {
    const b = after[w] ?? { ...EMPTY_PROGRESS };
    after[w] = { kills: b.kills + d.kills, headshots: b.headshots + d.headshots, longshots: b.longshots + d.longshots, hipKills: b.hipKills + d.hipKills, doubleKills: b.doubleKills + d.doubleKills, noDeathTriples: b.noDeathTriples + d.noDeathTriples, adsKills: b.adsKills + d.adsKills, pointBlank: b.pointBlank + d.pointBlank };
  }
  const c0 = computeCamos(before), c1 = computeCamos(after);
  const gained: { weapon: string; camo: string; dollars: number }[] = [];
  for (const [w, list] of Object.entries(c1)) for (const camo of list) if (!c0[w]?.includes(camo)) {
    const dollars = camo === 'gilded' ? DOLLARS.perGilded : camo === 'argent' ? DOLLARS.perArgent : camo === 'prism' ? DOLLARS.perPrism : camo === 'void' ? DOLLARS.perVoid : DOLLARS.perCamo;
    gained.push({ weapon: w, camo, dollars });
  }
  return gained;
}

export async function writeMatch(db: D1Database, m: { id: string; mode: string; map: string; room: string; winner: number; reason: string }, players: MatchResultPlayer[]) {
  const t = now();
  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT OR IGNORE INTO matches (id, mode, map, room, ended_at, winner, reason, players) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)').bind(m.id, m.mode, m.map, m.room, t, m.winner, m.reason, players.length),
  ];
  const gainedAll: { playerId: string; weapon: string; camo: string }[] = [];
  for (const p of players) {
    stmts.push(db.prepare('INSERT OR IGNORE INTO match_players (match_id, player_id, team, kills, deaths, score, xp, dollars) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)').bind(m.id, p.playerId, p.team, p.kills, p.deaths, p.score, p.xp, p.dollars));
    stmts.push(db.prepare('UPDATE players SET xp = xp + ?2, kills = kills + ?3, deaths = deaths + ?4, wins = wins + ?5, matches = matches + 1, updated_at = ?6 WHERE id = ?1').bind(p.playerId, p.xp, p.kills, p.deaths, p.won ? 1 : 0, t));
    const credit = (delta: number, reason: string, ref: string) => { if (delta > 0) stmts.push(db.prepare('INSERT OR IGNORE INTO ledger (player_id, delta, reason, ref, created_at) VALUES (?1,?2,?3,?4,?5)').bind(p.playerId, delta, reason, ref, t)); };
    credit(p.dollars, 'match', `match:${m.id}:${p.playerId}`);
    credit(levelUpDollars(p.xpBefore, p.xpBefore + p.xp), 'levelup', `levelup:${m.id}:${p.playerId}`);
    for (const g of camoPayouts(p.weaponBefore, p.weaponDelta)) { credit(g.dollars, `camo:${g.weapon}:${g.camo}`, `camo:${p.playerId}:${g.weapon}:${g.camo}`); gainedAll.push({ playerId: p.playerId, weapon: g.weapon, camo: g.camo }); }
    for (const [w, d] of Object.entries(p.weaponDelta)) {
      stmts.push(db.prepare(`INSERT INTO weapon_progress (player_id, ${WP_COLS}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
        ON CONFLICT(player_id, weapon_id) DO UPDATE SET xp = xp + ?3, kills = kills + ?4, headshots = headshots + ?5, longshots = longshots + ?6, hip_kills = hip_kills + ?7,
        double_kills = double_kills + ?8, no_death_triples = no_death_triples + ?9, ads_kills = ads_kills + ?10, point_blank = point_blank + ?11`)
        .bind(p.playerId, w, d.xp, d.kills, d.headshots, d.longshots, d.hipKills, d.doubleKills, d.noDeathTriples, d.adsKills, d.pointBlank));
    }
  }
  await db.batch(stmts);
  return gainedAll;
}
