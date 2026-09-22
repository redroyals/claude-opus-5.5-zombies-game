# ROADMAP

## M1 — Phase 1 slice (this branch: `phase1`) ✅
- [x] DESIGN.md: pillars, movement/gunplay numbers, modes, netcode plan, 11 map pitches
- [x] Pure Zombies rules (`src/zombies/rules.ts`) + 16 vitest tests: rounds, points, wall-buys, Cache + Moth, Reforger, 4 perks, doors
- [x] Zombies mode on the existing district (`?mode=zombies` or the title-screen button): rounds, points HUD, 3 wall-buys, Cache (3 spots), Reforger, power switch, 4 perk machines, Lifeline self-revive
- [x] Slide (sprint+crouch, jump-cancel) and mantle (0.55–1.9 m ledges) + ledge-probe tests
- [x] 8 Meshy sample assets (240 credits) + `samples.html` review page

## M2 — Zombies vertical slice on a real map (~3 weeks)
- First purpose-built map (pick from DESIGN §6): 3 heights, 4–6 zones behind doors, power in the lowest level
- Doors/debris zones, barricades + repair, power-ups (max ammo, insta-kill, double points, nuke)
- Weapon roster to ~10 (procedural viewmodels), recoil patterns, wall penetration
- Down/bleed-out state, spectate; results screen per round
- Replace placeholder machines with approved Meshy art (optimized GLBs)

## M3 — Online PvP foundation (branch `mp-core`) — see docs/MULTIPLAYER.md
- [x] Shared deterministic 30 Hz movement (tactical sprint, slide, mantle), binary delta protocol, lag compensation
- [x] Cloudflare Worker: Matchmaker DO shards + MatchRoom DOs (hibernation WS), quick play + private room codes / `?room=` links
- [x] Authoritative MatchSim: TDM/FFA/Dom/KC, perks with mechanical effects, lethals/tacticals, killstreaks, radar, anti-cheat buckets
- [x] Progression: levels 1-100 + 10 prestiges, data-driven unlock table, weapon levels 1-30, 9-slot gunsmith (5 max), camo mastery ladders
- [x] D1 persistence (one batch per match), server-side dollar ledger (no real money), sikhi.io SSO + guests
- [x] Client: lobby, create-a-class, progression/armory/shop, prediction/reconciliation/interpolation, procedural camo shaders, HUD
- [ ] Deploy (play.sikhi.io) — owner steps in MULTIPLAYER.md
- [ ] Real maps art pass, weapon GLBs from `mp-assets`, animated operators, audio, bots for low population
- Online Zombies co-op: dropped from scope for now (multiplayer PvP only).

## M4 — PvP (~3 weeks)
- Operator third-person models (rigged Meshy operator + animation set), hitboxes
- TDM, FFA, Domination, Kill Confirmed, Gun Game; custom games UI
- 2 PvP maps (Kowloon Stacks, Rio Favela Ridge); spawn logic

## M5 — Launch polish
- Accounts (optional), stats in D1, weapon XP/attachments, settings, perf pass (iGPU 60 fps), audio pass
- Link from sikhi.io (external link card only; no sikhi.io code changes needed beyond the link)
- Downloadable build (Tauri/Electron wrapper) — evaluate after launch
