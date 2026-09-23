# ROADMAP

## M1 — Phase 1 slice (this branch: `phase1`) ✅
- [x] DESIGN.md: pillars, movement/gunplay numbers, modes, netcode plan, 11 map pitches
- [x] Pure Zombies rules (`src/zombies/rules.ts`) + 16 vitest tests: rounds, points, wall-buys, Cache + Moth, Reforger, 4 perks, doors
- [x] Zombies mode on the existing district (`?mode=zombies` or the title-screen button): rounds, points HUD, 3 wall-buys, Cache (3 spots), Reforger, power switch, 4 perk machines, Lifeline self-revive
- [x] Slide (sprint+crouch, jump-cancel) and mantle (0.55–1.9 m ledges) + ledge-probe tests
- [x] 8 Meshy sample assets (240 credits) + `samples.html` review page

## M2 — Zombies vertical slice on a real map (~3 weeks)
- [x] First purpose-built map "Nightfall Relay" (`src/zombies/mapdata.ts` + `ZombiesMap.ts`): 5 zones behind doors/debris, raised Power Room with stairs + overlook, own collision world/nav grid
- [x] Doors/debris zones gate window spawns; barricades (tear/climb, hold-E repair +10, 500/round cap); power-ups (max ammo, insta-kill, double points, nuke, carpenter) with the classic drop cycle
- [x] Weapon roster to 20 + knife (`ZOMBIE_WEAPONS` in config), wall-buys (chalk) vs Cache pool, reforged names/camo, 3 wonder weapons
- [x] Zombie roster: shambler/runner/brute/crawler/Scuttler (special rounds)/Warden boss every 8th round; head pops, leg-loss crawlers, hit reactions
- [x] Results screen ("YOU SURVIVED N ROUNDS"); easter egg (3 relics)
- [x] Machines/zombies/weapons use the authored GLBs from `public/models/` when present (procedural fallbacks otherwise)
- [x] Second map "Rio · Ridgelight" (`src/zombies/maps/favela/`, design `docs/maps/favela.md`): vertical favela at dusk, 9 zones on six terrace tiers, 2-edge-connected door graph, climb/drop/window spawns, cable car + zipline + tin-roof slide (map `rides` API), street-art machines (map `machines` API), peak-line easter egg
- [ ] Down/bleed-out state + spectate (co-op), recoil patterns, wall penetration
- [ ] Use `kit_barricade_window` / wall kit pieces for the map shell (currently procedural boxes)

## M3 — Netcode foundation (~3 weeks)
- Extract sim into a transport-agnostic `Room` (inputs in, snapshots out); `LocalTransport` for offline
- Cloudflare Worker + Durable Object room; room codes, `?room=` links, quick-play matchmaker DO
- Prediction/reconciliation, interpolation, lag-compensated hit validation, server-side zombies AI
- Online co-op Zombies (2–4)

## M4 — PvP (~3 weeks)
- Operator third-person models (rigged Meshy operator + animation set), hitboxes
- TDM, FFA, Domination, Kill Confirmed, Gun Game; custom games UI
- 2 PvP maps (Kowloon Stacks, Rio Favela Ridge); spawn logic

## M5 — Launch polish
- Accounts (optional), stats in D1, weapon XP/attachments, settings, perf pass (iGPU 60 fps), audio pass
- Link from sikhi.io (external link card only; no sikhi.io code changes needed beyond the link)
- Downloadable build (Tauri/Electron wrapper) — evaluate after launch
