# Zombies pacing

How a Zombies game unfolds from round 1 to the late game, and the per-map values. The rules are pure TypeScript
(`src/zombies/rules.ts`, `progression.ts`, `buildables.ts`, `traps.ts`, `perkfx.ts`), unit-tested in
`tests/zombies-pacing.test.ts`, and each map declares its values as data (`box.reveal`, `wallBuys`, `perks`,
`egg`, `sideEggs`, `buildables`, `traps`, `rounds`, `powerups`; see `docs/MAP_API.md`).

## The arc

| Phase | What the player has | What the map offers |
|---|---|---|
| Rounds 1-2 | Knife (one-shots a round-1 walker) and the starting pistol, 500 points | Starter wall guns in the spawn zone only. After round 1 you can afford a wall gun **or** the first door, not both |
| Rounds 2-4 | A starter gun; the first doors | Standard guns one door in. **The Cache is not on the map yet** |
| Two doors open (or round 5-6) | | **The Cache surfaces** in a deeper zone: a column of light, a sting, "THE CACHE HAS SURFACED · find it in the …" |
| Mid game | Power on | Perks, the Reforger, traps, buildable parts, the heavy guns deep in the map |
| Late game | Reforged guns (tiers I-III, elemental rounds), 4+ perks | Main quest (+1 perk slot), side quest (free perk + a hidden song) |

The early economy is checked by a test that plays a pistol-only player through rounds 1-3 on every map: after round 1
they can buy a starter gun or open a door (not both); by the end of round 3 they can have done both.

## Rounds

- Solo counts for rounds 1-5 are the classic table **6, 8, 13, 18, 24**, then +4 a round (co-op x1.5 per extra
  player, cap 120). At most **24** zombies are alive at once.
- Health: +10 %/round to round 9, then x1.1 compounding (a round-1 walker has 110 hp: the 150-damage knife one-shots it).
- **Special (Scuttler) rounds** land a little unpredictably, like the classic hound rounds: the first somewhere in
  `rounds.special.first`, then every `rounds.special.every` rounds (planned once per game). The Warden joins every
  `bossEvery`th round (not on a special), and blackouts come at 13, 23, 33 … (all overridable).
- Power-ups: 2 % per kill plus a guaranteed drop every time kill points pass a threshold (2000, growing x1.14),
  capped per round; a map scales it with `powerups.dropChanceMult` / `maxPerRound`.

## Weapons and wall-buys

Tiers are data (`WEAPON_TIER` and `WALL_BUYS[key].tier`):

| Tier | Guns | Price | Where | Reforged ammo |
|---|---|---|---|---|
| starter | P-19 Warden, MG-2 Magnus, **BR-7 Drover** (bolt-action), HB-12 Hullbreaker, W-9 Wren | 500-1000 | the only tier allowed in the spawn zone | 3000 |
| standard | SK-5 Skiff, KR-7 Kestrel, CV-4 Corvid | 1200-1500 | at least one door in | 4500 |
| heavy | SN-14 Sentry, MR-9 Moraine, BX-100 Bastion | 1750-2500 | at least two doors in | 6000 |
| box | Tern, Fennec, Tidal, Longwatch, Basalt, Lotus (+ Moraine, Bastion) | the Cache (950) | | |
| wonder | Arc Lance, Void Anchor, Rime Projector | Cache only (one at a time), or a quest reward | | |

Ammo off a wall costs half the gun's price. The validator enforces the spawn-zone and depth rules.

## The Cache (mystery box)

Hidden at the start on maps with `box.reveal`; it surfaces the moment **any** reveal condition holds (`doors`,
`zones`, `round`, `power`) at `reveal.spot` (or the first open spot outside the start zone). From then on it is the
classic Cache: 950 a pull, the Moth moves it after 4 safe pulls (18 % a pull), and it can move back to the spawn.

## The Reforger (Pack-a-Punch)

| Pass | Price | Damage | Magazine / reserve | Camo | Extra |
|---|---|---|---|---|---|
| I | 5000 | x1.65 | x1.25 | Emberglass | new name |
| II | 7000 | x2.5 | x1.5 | Voidsteel | "… II", elemental rounds 10 % a hit |
| III | 9000 | x3.4 | x1.75 | Sunforge (gold) | "… III", elemental rounds 18 % a hit |

Elements per gun (`PAP_ELEMENT`): **fire** (shotguns, Bastion, Basalt, Warden: burns for 3 s at 30 % max health a
second and spreads to two neighbours), **shock** (SMGs, Kestrel, Tern, Magnus: chains to three zombies within 6 m
for 45 % max health and staggers them), **freeze** (Corvid, Moraine, Fennec, Sentry, Drover, Longwatch: freezes the
target and three neighbours for 2.2 s; frozen zombies shatter). Elites take 10 %.

## Perks

Limit **4**; each main quest grants **+1 slot** (up to 6), kept when you go down (the perks are lost).

| Perk | Price | Effect | Placeholder machine |
|---|---|---|---|
| Lifeline Soda | 500 | self-revive (solo, 3 buys), faster regen | stock |
| Hammerfall Root | 2000 | fire rate +33 %, damage +20 % | stock |
| Bulwark Brew | 2500 | max health x2.5 | stock |
| Quickhands Fizz | 3000 | reload x2 | stock |
| **Strider Tonic** | 2000 | sprint +12 %, stamina lasts 3x, aim 35 % faster | Quickhands, repainted yellow |
| **Hawkeye Draught** | 1500 | aiming down sights snaps to the nearest visible head in a ~8° cone; spread -40 %; headshots +25 % | Bulwark, repainted steel blue |
| **Packmule Malt** | 4000 | a third gun: switching rotates it through your two slots; lost when you go down | Hammerfall, repainted green |
| **Nova Nectar** | 2000 | immune to your own explosions; starting a slide sets off a blast (600 + 100/round, 3.8 m, 2.5 s cooldown) | Lifeline, repainted violet |

New perks borrow a stock machine (model, silhouette, footprint) painted in their colour until a map supplies
`machines.perks.<id>`.

## Quests, buildables, traps

- **Main quest** (`egg`): multi-step (interact / collect / kill-in-zone), reward includes `perkSlot: 1`.
- **Side quest** (`sideEggs`): collectibles picked up by walking over them; reward is a free perk, a hidden
  procedural song (`music`) and a few points.
- **Buildables**: parts in at least two zones, picked up with E, assembled at a bench (E). A shield goes on your back:
  it soaks every hit from behind and 35 % of hits from the front, 1500 hp, and the bench makes a new one 60 s after it
  breaks. A trap build arms its trap.
- **Traps**: pay at the switch (1000), the area kills for 20 s (50 points a kill, elites lose 8 % max health a
  second, it hurts you too), then cools down for 45 s.

## Per-map values

| | Nightfall Relay | Lahore Darbar | Rio · Ridgelight |
|---|---|---|---|
| Cache reveal | 2 doors or round 6 → Loading Dock | 2 doors or round 5 → Diwan-e-Aam (beside the jharokha) | 2 doors or round 5 → Stacked Houses |
| Spawn-zone wall guns | Wren, Magnus, Drover | Magnus, Wren, Drover | Warden, Magnus, Drover |
| Heavy wall guns | Bastion (Vault), Sentry (Power Room) | Sentry (Shah Burj), Moraine (Kucha), Bastion (Ramparts) | Sentry (Mirante), Bastion (Station), Moraine (Substation) |
| New perks | Hawkeye (Dock), Strider (Hall), Nova (Power Room), Packmule (Vault) | Nova (Top Khana), Strider (Ramparts), Hawkeye (Shah Burj) | Strider (Quadra), Nova (Big Laje), Packmule (Samba Hall), Hawkeye (Station) |
| Main quest | Signal Fragments: 3 radios → 3 signal cores → 20 kills in the Power Room → key the transmitter | The Mountain of Light (5 steps) | Last Ride to the Peak (4 steps) |
| Side quest | Lost Tapes (3) → Strider + song | The Lamplighter (3 lamps) → Hawkeye + song | Baile Records (3) → Strider + song |
| Buildable | Riot Shield (Dock, Vault, Power Room → bench in the Generator Hall) | Naft Cauldron (Top Khana, Silah Khana, Roshnai → bench in the Diwan-e-Aam) | Car-Door Shield (Houses, Quadra, Samba → bench on the Big Laje) |
| Trap | Arc Fence, in front of the lobby door (power) | Naft Fire Pit in the Diwan-e-Aam quad (needs the cauldron) | Gato Wires across the Quadra pitch (power) |
| Specials | first 5-6, every 4-6 | first 6-7, every 5-6 | first 5-6, every 4-5 |
| Power-ups | x1, max 4 | x1.15, max 4 | x1, max 4 |

## Verifying

- `corepack pnpm test` — rules, per-map data and the validator (`tests/zombies-pacing.test.ts`).
- `BASE=http://127.0.0.1:<port> MAP=<id> node e2e/zombies-pacing.mjs /tmp/pacing-<id>` — a headless play-through with
  real E presses: no Cache at the start, starter guns in the spawn zone (one bought), doors until the Cache surfaces
  (flare) and a pull, a new perk, the Reforger three times, every buildable part and the build, a trap killing
  zombies, the side quest. Uses the real GPU (`--use-gl=angle --use-angle=gl-egl`); `SWIFTSHADER=1` for software GL.
