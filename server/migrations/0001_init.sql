-- Dead Signal MP persistence. Written at match end in one batch; never per event.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,               -- 'u_' + sha256(email) prefix; guests never get a row
  email_hash TEXT UNIQUE,
  name TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  prestige INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS weapon_progress (
  player_id TEXT NOT NULL,
  weapon_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  headshots INTEGER NOT NULL DEFAULT 0,
  longshots INTEGER NOT NULL DEFAULT 0,
  hip_kills INTEGER NOT NULL DEFAULT 0,
  double_kills INTEGER NOT NULL DEFAULT 0,
  no_death_triples INTEGER NOT NULL DEFAULT 0,
  ads_kills INTEGER NOT NULL DEFAULT 0,
  point_blank INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, weapon_id)
);

CREATE TABLE IF NOT EXISTS classes (
  player_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (player_id, slot)
);

-- In-game dollars. Append-only; balance = SUM(delta). `ref` makes every credit idempotent.
-- No real money ever enters this table: credits come only from server-computed match/level/camo payouts.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_player ON ledger(player_id);

CREATE TABLE IF NOT EXISTS inventory (
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, item_id)
);

CREATE TABLE IF NOT EXISTS token_unlocks (
  player_id TEXT NOT NULL,
  unlock_key TEXT NOT NULL,          -- "kind:id"
  PRIMARY KEY (player_id, unlock_key)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  map TEXT NOT NULL,
  room TEXT NOT NULL,
  ended_at INTEGER NOT NULL,
  winner INTEGER NOT NULL,
  reason TEXT NOT NULL,
  players INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  team INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  deaths INTEGER NOT NULL,
  score INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  dollars INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
