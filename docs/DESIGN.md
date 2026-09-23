# DESIGN — working title "Dead Signal: Rounds"

A free, in-browser, online-first FPS. Round-based Zombies co-op and fast arena PvP on multi-level maps set in real
world capitals and odd corners of the globe. Its feel draws on late-2000s console shooters (Black Ops 1 zombies, MW2
online). All names, characters, weapons, maps and art are our own.

## 1. Pillars

1. **Movement that feels good in the first 5 seconds.** Snappy acceleration, sprint, slide, mantle, and short ADS
   times. We aim to match the snappiness of the games we draw on and then go further: no animation lock on
   mantle, jumping cancels a slide, and ADS stays readable.
2. **Hitscan gunplay you can learn.** Recoil has a fixed pattern you can learn, plus a small random component. Hip
   spread blooms as you fire. Damage falls off with range, headshots get multipliers, and bullets penetrate thin
   surfaces.
3. **One sim, three contexts.** The same deterministic 60 Hz simulation runs offline (solo), on the client (prediction)
   and on the server (authority). Game rules are pure TypeScript that never imports three.js or the DOM.
4. **Maps with a vertical story.** Every map has at least 3 play heights, plus a route between the rooftops and the
   underground. You should be able to recognise the place from the skyline.
5. **Faction-neutral.** Players are masked operators and agents with no flags, no real armies and no religious
   iconography. Zombies are "the Afflicted": a mystery with no politics.
6. **Degraded graphics are fine, and hitches are not.** Target 60 fps on a 2020 laptop iGPU. Scene budget: ~150 draw
   calls and ~300k triangles. Every in-game asset is a GLB under 1.5 MB (meshopt/quantized).

## 2. Movement spec (numbers live in `src/config.ts` `PLAYER`)

| Parameter | Value | Notes |
|---|---|---|
| Walk | 4.6 m/s | full accel in ~0.08 s (groundAccel 55) |
| Sprint | 7.1 m/s | stamina-gated tactical sprint later (8.4 m/s for 3 s) |
| Crouch | 2.3 m/s | height 1.75 → 1.10 m |
| ADS move | 2.9 m/s | |
| Jump | 5.4 m/s up, g = 17 | ~0.86 m apex |
| Air accel | 9 | limited air strafe; no bhop chaining (landing friction) |
| **Slide** | 9.4 m/s boost (or 1.15× current), 0.75 s, friction 2.2/s, 0.6 s cooldown | sprint + crouch; no steering; jump-cancel keeps momentum |
| **Mantle** | ledges 0.55–1.9 m, reach 0.55 m, 0.32 s | jump into a ledge, or hold forward while airborne; rise-then-forward tween |
| Step height | 0.45 m | |
| ADS time | 0.15–0.26 s per weapon | FOV × 0.72–0.85 |
| Recoil | per-shot pitch/yaw deg + recovery deg/s | pattern table per weapon (phase 2) |

## 3. Gunplay spec

- **Hitscan** for bullets. Rays go through `CollisionWorld.raycast` and then the zombie/player hitboxes (head, body, limbs).
- **Penetration** (phase 2): each surface has a penetration cost (`glass 0.1, wood 0.3, metal 0.7, concrete ∞`).
  Each weapon has a penetration budget (SMG 0.4, rifle 0.8, LMG/sniper 1.2), and damage is scaled by the budget left.
- **Damage falloff**: full damage up to `rangeNear`, falling linearly to `minDamageMult` at `rangeFar` (already implemented).
- **Head multiplier** is 1.6–2.4 depending on the weapon. Limbs take 0.8.
- **Recoil**: a deterministic per-weapon pattern (seeded) plus ±15% jitter. Recovery happens only when not firing.
- **Weapon classes (planned roster, all original names)**: pistol, heavy pistol, SMG ×2, AR ×3, battle rifle, LMG,
  shotgun (pump + auto), marksman, sniper, launcher, plus 2–3 zombies-only "wonder" weapons.
  The current build has 3 weapons: KR-7 Kestrel AR, P-19 Warden pistol, HB-12 Hullbreaker shotgun.

## 4. Modes

### Zombies (co-op 1–4, solo offline)
Full pacing design and per-map values: `docs/PACING.md`.
- **Rounds.** Solo counts 6, 8, 13, 18, 24 for rounds 1-5, then +4 a round, ×(1 + 0.5 per extra player), cap 120.
  HP is +10% per round to round 9, then ×1.1 compounding. Runners start at round 3, and armored brutes at round 6.
  Special (Scuttler) rounds come every 5th round by default; a map can randomise them in windows like the classic hound
  rounds. At most 24 zombies are alive at once, and there is a 10 s break between rounds. (`src/zombies/rules.ts`)
- **Points.** Start 500; hit 10, kill 60, headshot kill 100, melee kill 130, trap kill 50; round bonus 50 + 10n.
  After round 1 a pistol player can afford a starter gun or the first door, not both.
- **Wall-buys.** Chalk outlines, tiered: starter guns (500-1000) are the only guns in the spawn zone, standard guns hang
  one door in, heavy guns (marksman, LMG, Moraine) two doors in. Wonder weapons are box-only. Ammo is half price;
  reforged ammo costs 3000 / 4500 / 6000 by tier.
- **Mystery box ("the Cache").** Hidden at the start: it surfaces in a deeper zone once enough doors are open (with a
  round safety net) under a column of light. Costs 950, spins for 4 s, and the offer stays up for 12 s. Only the player
  who paid can take it. It never offers a weapon you already hold. After 4 safe pulls there is an 18% chance per pull of
  **the Moth**: the pull is refunded and the Cache flies to another spot.
- **Pack-a-punch ("the Reforger").** Needs power. Three passes: 5000, 7000, 9000; each adds damage, magazine and
  reserve and a new camo; from tier II the gun's hits can proc its element (fire, shock or freeze).
- **Perks (original names), limit 4** (+1 slot from each map's main quest, up to 6). You lose them when you go down.
  - **Bulwark Brew** (2500): max health ×2.5
  - **Quickhands Fizz** (3000): reload ×2 speed
  - **Hammerfall Root** (2000): +33% fire rate, +20% damage
  - **Lifeline Soda** (500, works without power): self-revive in solo (3 buys) and faster regen. In co-op it becomes faster revives.
  - **Strider Tonic** (2000): faster sprint, 3× stamina, faster aim
  - **Hawkeye Draught** (1500): aim snaps to heads, tighter spread, +25% headshots
  - **Packmule Malt** (4000): a third weapon
  - **Nova Nectar** (2000): immune to your own blasts; a slide sets off a blast
- **Doors / power.** A debris or door price opens each zone (`tryOpenDoor`). A power switch enables perks and the Reforger.
- **Quests.** Every map has a main quest (multi-step, +1 perk slot), a side quest (collectibles → a free perk and a
  hidden song), a buildable (parts across zones, assembled at a bench: a back shield or a trap) and at least one trap.

### PvP
- **Team Deathmatch**: 6v6, first to 75 kills or 10 min.
- **Free-for-all Deathmatch**: 8 players, first to 30.
- **Domination**: 3 flags.
- **Kill Confirmed**: collect tags.
- **Gun Game**: 20 weapons in sequence, and a melee kill demotes the victim.
- **Search & Destroy** (later): one life per round.
- **Custom games**: any mode, any map, private room code. Rules can be edited: score limit, time, HP, headshots only,
  weapon pool, and the zombies starting round.
- **Progression**: account XP plus weapon XP that unlocks attachments. Everything that affects gameplay unlocks through play, never through payment.

## 5. Netcode plan

**Stack:** Cloudflare Workers + **Durable Objects**. Each match room is one DO. Clients connect over WebSocket
(hibernation API). Static client files are served from Workers Assets, and D1 stores accounts and stats.

- **Room lifecycle.** `POST /api/rooms` returns a 6-character room code. `GET /play?room=ABC123` is a shareable link.
  **Quick-play** goes through a matchmaker DO that fills open rooms by mode and region, or creates a new one. The DO is
  pinned to the first player's location (`locationHint`).
- **Tick model.** The server simulates at 60 Hz and sends snapshots at 20 Hz: delta-compressed binary with quantized
  position (1 cm), yaw/pitch (u16) and a per-entity bitmask. The client sends input commands at 60 Hz, each with a
  sequence number, buttons and view angles, and several are sent per packet so losing one doesn't lose input.
- **Client prediction + reconciliation.** The local player runs the same `Player.update`. When a snapshot arrives,
  the client rewinds to the acknowledged input and replays the inputs still pending. Remote players are drawn 100 ms
  in the past with interpolation.
- **Server-authoritative hit validation with lag compensation.** The client reports "I fired at tick T with ray R"
  for feedback only. The server keeps a 1 s ring buffer of hitbox poses, rewinds the targets to
  `T − interp_delay`, and re-casts the ray against the world plus the rewound hitboxes. Rewind is capped at 200 ms.
  Only hits confirmed by the server deal damage. Zombies AI runs only on the server.
- **Economy authority.** All purchases (box rolls, perks, the Reforger) run on the server, using the pure `rules.ts`
  with a server RNG. That is why the box roll is decided when you pay.
- **Offline.** A `LocalTransport` runs the room loop in the same tab (or in a Worker), so solo play uses the same code
  path with zero latency.
- **Anti-cheat baseline.** The server rejects impossible movement (speed/teleport), rate-limits fire (rpm
  validation), clamps the view delta, and never trusts client hits.
- **Capacity.** One DO handles about 12 players at 60 Hz for TDM, or 4 players plus 24 zombies. Idle rooms
  hibernate, and a room is closed 60 s after it empties.

## 6. Map pitch list

Legend: **Z** = good for Zombies, **DM** = good for PvP. Each map has 3+ heights: **U** underground, **G** street, **R** rooftops/upper.

1. **Lisbon: Tram Hill** (Z ★★★, DM ★★). A steep switchback street with a tram line. U: a cistern under the
   miradouro. G: the tiled stair-street and a stalled tram you can walk through. R: terracotta roofs joined by
   laundry-line zip crossings. In Zombies the power sits in the cistern, the Reforger in the funicular engine room,
   and the tram is a moving trap.
2. **Hong Kong: Kowloon Stacks** (Z ★★★, DM ★★★). A dense vertical block. U: a wet market. G: a neon alley.
   Middle: a walkway web between towers. R: a rooftop water tower with an antenna forest (the Meshy sample). Close
   lanes suit SMGs, and the rooftops give long sightlines. The zombies loop runs up the stairwells.
3. **Reykjavík: Geothermal Plant** (Z ★★★, DM ★). Pipe racks, steam vents that block sight, and a lava-rock
   canyon. U: turbine hall. G: pipe yard. R: cooling towers. The Reforger is fed by a lava vent.
4. **Cairo: Necropolis Market** (Z ★★, DM ★★★). The City of the Dead is lived-in, with markets. U: tomb galleries.
   G: souq lanes. R: minaret-free rooftops of the market halls; we keep it secular and do not use mosques. There are
   3 clear lanes for TDM.
5. **Ulaanbaatar: Winter Gers** (Z ★★, DM ★★). A ger district beside Soviet blocks, with snow. U: heating tunnels
   (the famous warm utilidors). G: felt-tent streets. R: rooftops of the 9-storey blocks. The heating tunnels are a
   zombies highway.
6. **Singapore: Supertree Grove** (Z ★★, DM ★★★). A futuristic garden. U: cooling-plant tunnels. G: paths through
   the gardens. R: a skyway between the steel trees. There are jump pads, and it works well for Gun Game.
7. **La Paz: Cable Car Line** (Z ★★★, DM ★). Three cable-car stations at different heights, joined by moving
   gondolas. U: a market under the station. G: a steep cholet street. R: the station decks. The gondolas are the
   zombies transit trap.
8. **Svalbard: Seed Vault Approach** (Z ★★★, DM ★). An arctic research outpost. U: a vault tunnel into the
   mountain, which holds the round-30 quest. G: a snowfield with a polar-night aurora. R: a radar dome. This is the
   bleak, eerie one.
9. **Rio: Favela Ridge** (Z ★★, DM ★★★). Stacked houses on a slope. U: a storm drain. G: stair-alleys. R: slab
   rooftops you can chain with mantles. It is the best test of the movement kit.
10. **Dubai: Unfinished Tower** (Z ★★, DM ★★★). The first 12 floors of a construction site. U: parking levels.
    G: the lobby. R: open concrete floors, crane jibs and elevator cages. Vertical rotations work well for
    Domination.
11. **Venice: Flooded Arsenal** (Z ★★★, DM ★★). Canals at high water. U: waist-deep water that slows you. G: fondamenta
    walkways. R: arsenale gantries. There are gondola chokepoints.

Recommended first three: **Kowloon Stacks** (the flagship for both modes), **Lisbon Tram Hill** (the flagship for
Zombies), and **Rio Favela Ridge** (the flagship for PvP and the movement kit).

## 7. Art direction (to confirm from the samples)

Stylised-realistic PBR in muted palettes with one strong accent per map, such as Kowloon neon or Svalbard aurora.
Characters are operators wearing balaclavas or visors in greys and tans. The Meshy samples in `assets/samples/` are the
proposed baseline. Viewmodels stay procedural until the weapon roster is final, because the reload animations
depend on named parts.
