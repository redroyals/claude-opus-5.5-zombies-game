# MULTIPLAYER — architecture, local dev, deploy

Online PvP for sikhi.io players: public quick play and private rooms (6-char code / `?room=CODE` link),
progress saved to the player's sikhi.io account. Modes: TDM, FFA, Domination, Kill Confirmed.
(Online Zombies co-op is out of scope for now.)

## Layout
```
src/data/weapons.ts     90 weapons (ids frozen: docs/WEAPON_IDS.md), 9-slot gunsmith, 5-attachment limit
src/data/cosmetics.ts   cosmetics + unlock tokens (in-game dollars only; no real money)
src/shared/             pure TS shared by client + server (no three.js/DOM)
  movement.ts           deterministic 30 Hz movement: walk/sprint/tactical sprint/crouch/slide/jump/mantle, AABB broadphase
  protocol.ts           binary wire format (quantized, delta-encoded snapshots) + JSON control events
  lagcomp.ts            position history ring buffer, rewind clamp (8 ticks ≈ 267 ms), head/body/limb hit tests
  perks.ts              16 perks, 3 tiers, all unlocked from level 1, precise mechanical effects
  loadout.ts            create-a-class, equipment, killstreaks, validation
  progression.ts        levels 1-100, prestige 0-10, match XP, weapon levels 1-30, dollar payouts
  unlocks.ts            data-driven unlock table (weapons/equipment/streaks/cosmetics/features by level)
  camos.ts              8-step base ladder -> Gilded -> Argent -> Prism (class) -> Void Matter (all classes)
  modes.ts, maps.ts     mode rules, spawns; Kowloon Stacks, Lisbon Tram Hill, Rio Favela Ridge (+ Firing Range)
server/                 Cloudflare Worker (wrangler)
  src/index.ts          HTTP API + WS routing
  src/matchmaker.ts     Matchmaker DO, sharded `${continent}:${mode}:${n}`
  src/room.ts           MatchRoom DO (WebSocket Hibernation API, 30 Hz loop while occupied)
  src/sim.ts            authoritative MatchSim (pure; unit-tested)
  src/auth.ts, db.ts    sikhi.io SSO + game sessions; D1 access (batched match writes, dollar ledger)
  migrations/           D1 schema
src/mp/                 browser client (mp.html): lobby, class editor, progression/armory/shop, net, view, camo shaders
```

## Netcode
- **Tick 30 Hz.** Client samples input every tick, predicts with the same `stepMove`, sends one input per
  tick (`seq`, i8 move axes, u16 yaw, i16 pitch, u16 buttons = 8 bytes + 10 header).
- **Server authority.** Each input costs a token from a per-player bucket that refills 1/tick (max 6):
  sending inputs faster than real time (speed hack) just gets them dropped. Movement is only ever the
  server's own simulation of inputs, so teleports/fly/speed are impossible by construction. Fire rate,
  ammo, reload/swap/ADS/sprint-to-fire timing and equipment counts are enforced server-side. Rooms kick
  sockets exceeding 90 msgs/s; binary >256 B and JSON >4 KB are dropped.
- **Snapshots** per client per tick: authoritative self state (full precision, for exact reconciliation)
  + entities delta-encoded against what that client last received (WebSocket is reliable+ordered, so no
  ack bookkeeping). Positions 1/64 m i16, yaw u16, pitch i8. An unchanged player costs 0 bytes.
- **Interest management:** enemies >45 m sent every other tick; far dead players skipped.
- **Reconciliation:** drop acked inputs, reset to server state, replay pending inputs.
- **Interpolation:** remote players rendered 3 ticks (100 ms) behind the estimated server tick.
- **Lag compensation:** the client sends its render tick (`viewTick`); the server rewinds targets'
  hitboxes to that tick (clamped to 8 ticks) and ray-tests head sphere / body / leg capsules, occluded by
  map boxes. Launchers/grenades/claymores/killstreaks are server-side explosions with cover checks.

## Scale ("no limit")
Every match is its own Durable Object (cap 12-18); matchmaker shards hand out rooms and create new ones
when full, so concurrent players scale horizontally with room count. Empty rooms stop their loop and
hibernate (no cost). Matchmaker shards: continent × mode × `MM_SHARDS` (hash of client IP) — raise
`MM_SHARDS` if a shard gets hot. Rooms report counts on join/leave only. D1 sees reads on join/profile
and **one batch per match end** (never per event).

## Identity
**Correction to the brief:** sikhi.io no longer uses Clerk (removed 2026-09-05; see its
`lib/auth/session.ts`). It exposes an HMAC-signed SSO handoff: `GET https://sikhi.io/api/sso/issue?return=<url>`
redirects back with `?sso_token=` (60 s TTL, `SSO_SHARED_SECRET`). The game verifies it
(`POST /api/auth/sso`), keys the player by `sha256(email)`, and mints its own 30-day session token
(`GAME_SESSION_SECRET`) used as `Bearer` on the API and `?token=` on the WebSocket. Guests play with no
token and nothing is persisted. Email verification is already enforced by sikhi.io's issuer.

## In-game dollars (no real money)
Append-only `ledger` table; balance = `SUM(delta)`. Credits are computed only on the server (match
payout xp/20 capped, +250/level, camo payouts, +5000/prestige) and every credit has a UNIQUE `ref`, so
retries can't double-pay. Purchases are one conditional INSERT (`… WHERE balance >= price`), prices from
the server-side catalogue. The client never sends an amount.

## Run locally
```bash
corepack pnpm install
cd server && corepack pnpm install && cp .dev.vars.example .dev.vars   # fill two 32-byte hex secrets; DEV_AUTH=1
corepack pnpm db:migrate:local
corepack pnpm dev                     # wrangler dev on :8787 (local D1 + DOs, no Cloudflare account needed)
# second terminal, repo root
PORT=5174 corepack pnpm dev           # vite; open http://127.0.0.1:5174/mp.html (proxies /api and /ws to :8787)
```
Tests: `corepack pnpm test` (unit), `corepack pnpm mp:test:live` (2 WS clients vs wrangler dev: see each
other, kill, match end, D1 persistence, quick-play grouping, forged purchase rejected),
`PUPPETEER_PATH=<puppeteer-core> corepack pnpm mp:test:browser` (two headless Chromium clients).

## Deploying (NOT done — requires the owner)
1. `cd server && npx wrangler login` with the Cloudflare account that owns sikhi.io.
2. `npx wrangler d1 create dead-signal-mp` → put the id in `wrangler.toml`; `npx wrangler d1 migrations apply GAME_DB --remote`.
3. Secrets: `npx wrangler secret put SSO_SHARED_SECRET` (the same value sikhi.io uses) and
   `npx wrangler secret put GAME_SESSION_SECRET` (`openssl rand -hex 32`). Do NOT set `DEV_AUTH`.
4. Build the client at the repo root (`corepack pnpm build`, assets land in `dist/`), then `cd server && npx wrangler deploy`.
5. Custom domain: add `routes = [{ pattern = "play.sikhi.io", custom_domain = true }]` (zone sikhi.io) and deploy.
6. **sikhi.io change needed:** add `https://play.sikhi.io` to `ALLOWED_RETURN_ORIGINS` in
   `pages/api/sso/issue.ts`, and deploy sikhi.io. Optionally point `/` at `mp.html`.
7. Optional: a Workers Rate Limiting binding named `API_LIMIT` (the code already honours it).
Resources created: 1 Worker, 2 Durable Object classes (SQLite-backed), 1 D1 database. Durable Objects
require the Workers Paid plan.
