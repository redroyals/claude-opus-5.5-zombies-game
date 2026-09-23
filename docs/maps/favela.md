# RIO · RIDGELIGHT — Zombies map design (`favela`)

A round-based Zombies map on a Rio de Janeiro hillside at dusk. The idea is **elevation as a maze**: six terrace
tiers stacked up one hill, joined by stair alleys, room-to-room house interiors, rooftop slabs, a plank bridge
over a ravine, a zipline, a tin-roof slide and a cable car. Players start in a small snack bar on the bottom
street and fight their way up to the power substation at the crest. Once the power is on, the cable car runs, and
the Reforger at its bottom station pulls them back down. The last glow of the sun sits over the sea behind them.

The neighbourhood is portrayed as what it is: a lively, dense, self-built community space (the snack bar, a
five-a-side pitch, a samba school's rehearsal hall, washing on the lines, kites caught on the wires, water tanks
and satellite dishes on every slab) that the undead have overrun. There are **no gangs, drugs, police raids,
weapons caches or poverty caricature**. There are **no real brand names**, no written text in any language (all
signage is abstract shapes and colour blocks), and **no religious symbols**. The landmark tower is a water tower.

Coordinates in this document are design-level. The authoritative numbers live in `src/zombies/maps/favela.ts`
and are checked by `tests/maps/favela.test.ts`. North is **−Z and uphill**. `y` is the walkable floor height.

---

## 1. What made the classic maps work, and how this map applies it

| Principle (BO1-era maps) | What it means here |
|---|---|
| **Loops, not dead ends.** Every area you open reconnects to one you already have, so you can train a horde in a circle. | Four nested loops at different heights (§4). Dead ends are **deliberate and risky**: the Reforger room, two Cache spots, and the water-tower perch. |
| **A readable maze.** Landmarks can be seen from anywhere, and each area has its own light. | The cable-car station and its red beacons at the crest, the cable itself slicing diagonally across the whole map, the blue water tower on the big laje, the floodlit pitch, the mural wall of the samba hall, and the sea at your back. Each tier has its own light colour (§7). |
| **Choice in how to open the map.** | You pick a branch at the first door (stair alley or houses), again for the laje (house hatch or ravine bridge), and again for the climb to power (samba hall and station stair, or the long escadaria to the lookout). |
| **Chokepoints against open ground.** | The narrow becos, house doorways and the 2.4 m station stair are chokepoints. The pitch (26 × 22 m) and the big laje (36 × 30 m) are open training ground. |
| **Pacing.** Start tight, get bigger higher up, keep power far away, and put the Reforger somewhere that needs a trip after power. | Round 1 is fought in an 8 m street and a bar. The spaces widen with every tier. Power sits at the crest (T5). The Reforger is in the **bottom** cable-car station beside the pitch, so turning on the power sends you back down: ride the car (250) or run the escadaria. |
| **The zombies share your map.** | Zombies break through **windows** (with planks you can repair), **climb** retaining walls from the slope below, and **drop** off roof edges above. Walls and roofs spawn zombies, not just windows. |
| **A quest that uses the map's big toy.** | The easter egg restores a third cable line from the station to a **hidden peak** (§9). |
| *Pushing past them* | Traversal verbs the classics never combined in one map: a **one-way zipline** across the ravine, a **tin-roof slide** from the laje to the street, **rooftop jumps** that only players can take, and a **cable car** that is transport, the power payoff and the quest all at once. |

---

## 2. Height tiers

The whole hill sits 4 m above the engine's solid ground plane (`y = 0`). That leaves room for the hidden yards
that zombies climb up from, below the parapets.

| Tier | Floor y | Areas | Mood / light |
|---|---|---|---|
| **T0** | 4 | Bottom street, the Lanchonete (snack bar), house row A | Sodium streetlights (deep orange, buzzing), the bar's fluorescent tube, a lit fridge |
| **T1** | 8 | Beco landing, house row B (kitchen, workshop) | Bare bulbs that flicker, warm tungsten |
| **T2** | 12 | Beco top, house row C, **the quadra** (the pitch), the bottom cable-car station (Reforger) | The pitch is dusk-dark until power, then **floodlit cold-white**. Tungsten in the houses. |
| **T3** | 16 | **Big laje** (roof slabs, water tower), the stands walkway, the ravine bridge, **samba hall** | Dusk sky, then chasing festoon strings after power. The hall's neon is magenta, cyan and yellow. |
| **T4** | 20 | Mid-flights of the station stair and the escadaria | Transition tier |
| **T5** | 24 | **Top cable-car station**, **substation** (power), **the mirante** (lookout) | Red beacons before power, cold blue after. The city glows below the lookout. |
| *Peak* | 44 | Hidden summit (easter-egg reward only) | Moonlight |

Height stays legible: the higher you go, the cooler the light and the more of the bay you see.

---

## 3. Plan and side elevation

**`docs/maps/favela-layout.svg` is generated from the def** (`node scripts/map-svg.mjs src/zombies/maps/favela/def.ts FAVELA docs/maps/favela-layout.svg`),
so it is the authoritative drawing. It shows rooms coloured by height, walls (dashed = parapets), doors and debris
with prices, windows, spawn points, climb and drop links, the four ride lines, machines, and a side elevation.

![Rio · Ridgelight plan and side elevation](favela-layout.svg)

Side elevation (looking west; north and uphill on the left, the street and the sea on the right):

```
 y
 44 |  * PEAK .                                                         (peak line, EE only)
    |         `.
 28 |           `-.  ....cable car.........
 24 |T5 [MIRANTE][SUBSTATION][TOP STATION]    `......
    |      \ escadaria            \ station stair      `.....
 16 |T3     \   [stands walkway]=bridge=[BIG LAJE ~water tower~][SAMBA HALL]   `....
 12 |T2      [ QUADRA / Reforger station ]   [row C]                           ....`[bottom station]
  8 |T1                              [row B][beco landing]      \ tin-roof slide
  4 |T0                                        [row A][BOTTOM STREET][LANCHONETE] -> slope, city, sea
  0 |  (climb yards)                                         ^ zombies climb from here
    +--------------------------------------------------------------------------------------> z (south)
```

Top-down schematic (north and uphill at the top; the SVG has the exact geometry):

```
            x -48          -16  -12      4          34
   z -60  +---------------------+--------+-----------+
          |  MIRANTE (T5)  BOX6 | SUB-   | STATION   |   top tier: power, lookout, cable-car station
          |  zipline start >    |STATION |  Hammerfall
   z -35  +--+ lookout rail ....+--d11---+--d10----+ |
          |E |  ravine (trees, pylon)     SAMBA HALL |S   T3: stage (BOX5), Quickhands, mural
          |S |   ~~~ cable car ~~~        (T3)     d8|T   station stair up the east side
   z -22  |C +==stands walkway==d6=bridge=+---d7---+ |A
          |A |  STANDS  (BOX4, Bulwark)   | BIG LAJE (T3)   water tower, BOX3, rooftop jumps
    z -8  +d9+----------------------------+  climb up the east parapet, drops off the hall roof
          | QUADRA (T2) pitch + floodlights| zipline lands here     tin-roof slide starts SE
          | REFORGER in the bottom station |         +-----d5 hatch-----+
    z 16  +-- climb yard below ------d4--+  beco   | ROW C (T2) Hullbreaker
                                        |  | d3   | ROW B (T1) BOX2
    z 30  +-----------------------------+d1+------d2-------------------+  slide lands here
          |      BOTTOM STREET (T0)  BOX1 · Warden · roof drops · climb yard below  |
    z 46                  +---- LANCHONETE: Lifeline fridge, Magnus ----+
```

---

## 4. Door graph

Eleven purchases (the number is the price). Yellow means a door or gate, orange means debris:

| Door | Links | Price | Where |
|---|---|---|---|
| `street_beco` (debris: collapsed shutter) | street → stair alley | 750 | beco mouth, T0 |
| `street_houses` | street → stacked houses | 750 | row A front door, T0 |
| `beco_houses` | stair alley → houses | 1000 | beco T1 landing |
| `beco_quadra` (gate) | stair alley → quadra | 1250 | beco top landing, T2 |
| `houses_laje` (roof hatch) | houses → big laje | 1250 | top of row C's stairwell, T3 |
| `quadra_bridge` (debris) | quadra → big laje | 1000 | west end of the ravine bridge, T3 |
| `laje_samba` | big laje → samba hall | 1500 | hall south wall, T3 |
| `samba_station` (debris) | samba hall → station stair | 1500 | hall east wall, T3 |
| `quadra_mirante` (gate) | quadra → escadaria/mirante | 1500 | escadaria foot, T2 |
| `station_power` (debris) | station → substation | 1250 | T5 |
| `mirante_power` (gate) | mirante → substation | 1250 | T5 |

The graph is **2-edge-connected**: cutting any single door never isolates a zone, and every zone except the
street can be opened from two neighbours (`tests/maps-favela.test.ts` asserts both). No wall-buy, machine or
ride sits close enough to a door to steal its E prompt. The test also checks this; it caught two real cases during development.

## 5. Zones and unlock order

| # | Zone (HUD name) | Tier | Size / character | Opens via |
|---|---|---|---|---|
| 0 | **BOTTOM STREET** (+ Lanchonete) | T0 | An 8 m street and a snack bar. Tight start. | start |
| 1 | **STAIR ALLEY** (beco) | T0→T2 | A 2.4 m stair alley with a landing at T1. The purest chokepoint. | d1 750 |
| 2 | **STACKED HOUSES** | T0→T2 | Three rows of rooms up the slope, joined by inside stairs. You fight room to room. | d2 750 / d3 1000 |
| 3 | **BIG LAJE** | T3 | 36 × 30 m of rooftop slabs, water tower, tanks, dishes and washing. Rooftop jumps. | d5 1250 / d6 1000 |
| 4 | **THE QUADRA** | T2→T3 | Five-a-side pitch, stands, bottom cable-car station (Reforger) | d4 1250 |
| 5 | **SAMBA HALL** | T3→T4 | A big rehearsal hall with a stage and a mural wall | d7 1500 |
| 6 | **CABLE-CAR STATION** | T3→T5 | The station stair (a chokepoint) and the top station | d8 1500 |
| 7 | **MIRANTE** | T2→T5 | The long escadaria and the lookout over the city and the sea | d9 1500 |
| 8 | **SUBSTATION** | T5 | Transformers and the power switch | d10 1250 / d11 1250 |

**Typical opening orders** (all valid; the validator tests that every zone is reachable and that every door has
a reachable side):

- *Beco-first (fast power)*: d1 → d4 → d9 → d11 → **power** (4,750). Then take the gondola down to the Reforger.
- *Houses-first (perk + box value)*: d2 → d5 → d7 → d8 → d10 → **power** (6,250). You pass three perks and
  three Cache spots on the way.
- *The full ring*: d1 → d3 closes the low loop early (1,750). Then d4 → d6 closes the mid loop.

---

## 6. Loops, routes and traversal

**Loops (all zombie-walkable):**

1. **Low loop (T0–T2), tight.** Street → beco flight 1 → T1 landing → d3 → row B → inside stair down → row A →
   d2 → street. About 60 m around. It is good for rounds 1–5 but punishing later.
2. **Mid loop (T2–T3), the big one.** Beco top → d4 quadra → the stands → bridge (d6) → big laje → hatch (d5) →
   row C → row B → d3 → beco landing → beco top. About 180 m around. It crosses the ravine twice by height.
3. **Pitch loop (T2).** Run circles around the pitch. The stands let you bail upward.
4. **High loop (T3–T5).** Laje → d7 samba hall → d8 station stair → top station → d10 substation → d11 mirante →
   escadaria down → quadra → stands → bridge → laje. About 320 m around. This is the late-game marathon.
   The laje water tower sits at its centre.

**Player-only verbs (zombies go round the long way, and this is where you make space):**

| Verb | From → To | Notes |
|---|---|---|
| **Cable car** | Bottom station (T2) ⇄ top station (T5) | Works after power. Costs 250 and the ride takes 14 s over the stands and the ravine, via a pylon. Two cabins run in counter-motion. It is the natural trip to the Reforger after power. |
| **Zipline** | Mirante (T5) → big laje (T3), across the ravine | One way and free. 3.4 s. Needs both ends unlocked. |
| **Tin-roof slide** | Laje SE corner (T3) → street east end (T0) | One way and free. 2.6 s down a cascade of corrugated roofs. It is the emergency exit from the laje. |
| **Roof slabs** | Raised units on the laje (0.8 m and 1.6 m) | Players mantle up. Zombies vault via authored nav links. |
| **Ladder** | Laje → water-tower roof (y 24.35) | A dead-end sniper perch and an EE step. Zombies climb it too. |

**Zombie verticality.** Every zone mixes three entry kinds:

- **window**: a barricade with 6 planks and a rebuild prompt (bar back windows, house rooms, samba hall, station).
- **climb**: zombies scale a retaining wall or parapet from the slope below. The quadra's south wall, the laje's
  east parapet and the street's south edge have these. There are no planks, but there is a short, readable climb.
- **drop**: zombies step off a roof edge above the zone and fall in (above the street and beco, off the samba
  roof onto the laje, off the station roof). There is a tell before each one: dust falls and the zombie groans overhead.

---

## 7. Lighting (dusk)

- **Sky:** a warm band of orange and rose over the sea to the south, fading through violet to deep blue at the zenith. There
  are a few early stars and a low sun disc just set. Fog is warm-grey near the ground, and it thins with height, so the
  crest is sharper.
- **City below and the sea:** several thousand instanced window lights on the downhill slope and the city beyond, a
  line of streetlights along the shore, and a sea plane with a sunset streak.
- **Before power:** sodium streetlights on T0 and T1 (they buzz and flicker), bare bulbs in the houses (random
  flicker), and a dim pitch lit only by the dusk sky. The station beacons blink slowly on backup power, so you can see
  the goal from the start.
- **After power:** the pitch floodlights slam on, one mast at a time, and the laje festoon lights run in a chase.
  Neon comes on in the samba hall (magenta and cyan abstract shapes) and on the bar front. The cars and the station
  light up, and the Reforger's graffiti glows under UV.
- Light budget: ≤ 12 real shadowless point lights, placed near the player per zone. The rest is emissive
  sprites and light-pool decals, the same as the existing maps.

---

## 8. Machines, perks and the Cache (all reimagined, no text, no brands)

| Thing | Where | Look |
|---|---|---|
| **Lifeline Soda** (500, works without power) | Lanchonete, T0 | The bar's glass-door drinks fridge, painted with pale-blue street-art waves |
| **Bulwark Brew** (2500) | Under the stands, quadra T2 | A red drinks cooler with a street-art shield-shape mural |
| **Quickhands Fizz** (3000) | Samba hall, T3 | A lime-green vending machine covered in lightning-shape graffiti |
| **Hammerfall Root** (2000) | Top station, T5 | An orange machine with bold hammer-shape stencils |
| **The Reforger** (PaP) | Bottom cable-car station (quadra, dead end) | A cable-winch motor covered in street art and driven by the station's bull wheel. It starts spinning when the power comes on. |
| **The Cache** (box) | 6 spots on five floors: street (start), row B kitchen, laje by the water tower, the stands corner, the samba stage, the mirante | A wooden crate painted with abstract waves, a sun and triangles (Meshy, retextured) |
| **Power switch** | Substation, T5 | The stock breaker between two Meshy transformers |

Wall-buys are chalk outlines as usual. The early guns sit low and the rifles sit high: Warden (street), Magnus (bar),
Wren (row A), Hullbreaker (row C), Kestrel (the laje face of the samba hall), Skiff (quadra), Corvid (samba hall),
and Sentry DMR (mirante, for the long view).

---

## 9. Easter egg — "Last Ride to the Peak"

This runs on the generic egg step machine plus the ride API:

1. **Find the three cable grips** (collect, needs power). They are in the beco drain at the T1 landing, beside the big drum
   on the samba stage, and on the water-tower roof (up the ladder).
2. **Refit the peak line** (interact) at the station's third bull wheel, NE corner of the top station.
3. **Hold the station** (kill step: 24 kills inside the station zone). Zombies drop off the canopy while the car
   comes down from the peak.
4. The peak line opens (`requiresEggStep: 3`). **Ride it to the summit** (y 44, above the lit city) and **take what
   the peak keeps** (interact). The reward is the Arc Projector (wonder weapon), +5000, a free reforge of the held
   gun, full ammo and a Max Ammo drop. The ride back down is next to the pedestal.

## 10. Assets (as built)

Everything lives in `public/models/favela/`: **7 MB for 48 GLBs**. The map geometry itself is procedural data, so the
map is playable before any GLB arrives, and models stream in and replace their stand-ins. The whole download is
far under the 40 MB target.

**Blender kit, 23 pieces, 0 credits** (`tools/blender/favela_kit.py`, meshopt via `scripts/compress-kit.mjs --dir public/models/favela`):
- six background houses (`fv_house_a`–`f`, 1 to 4 storeys) with a concrete frame, clay-brick or painted-plaster
  infill, windows (dark or lit), grilles, sills, rebar stubs, parapets, balconies, an outside stair and small water tanks;
- a utility pole, sodium street lamp, wall lamp, floodlight mast, cable-line pylon, ladder, railing, tin roof,
  rebar cluster, window grille, kite, laundry line, three **murals as geometry** (layered suns, waves, leaf fans,
  zigzags and confetti; no text, no symbols), the station canopy and a goal-frame fallback.

Materials are named `fv_*`. The decorate hook maps them onto the game's shared textured materials, and
`fv_plaster` is tinted per house from a pastel palette through vertex colours.

**Meshy, 710 of the 1,200-credit cap** (ledger in `assets/gen-state.json`, batches in `assets/LOG.md`):

| Batch | Credits | What |
|---|---|---|
| reuse from mp-assets | 20 | house block, barrel and gas cylinder fetched by finished task id (0); water tank and satellite previews refined (2 × 10) |
| stage 1 | 390 | gondola cabin, bull wheel, transformer, bar counter, fridge, motorbike, wire bundle, goal, samba drums, speakers, costume rack, table + chairs, water tower |
| stage 2 | 180 | perk machines ×4, Reforger, Cache |
| retexture | 120 (logged at 20 each) | The "graffiti" prompts produced lettering ("PBR", tags), so all six machines were retextured with letter-free abstract-shapes prompts (`scripts/meshy-retexture.mjs`) |

The gondola cabin's texture carried pseudo-lettering and is cleaned by `scripts/scrub-text.mjs` (a median filter on
base colour, manifest field `scrub`). Lesson: never write "graffiti" or "tag" in a prompt. Per-asset triangle and
texture budgets (1.5k–6k triangles, 512 px for small props) live in the manifest.

**What the remaining 490 credits would buy** (not spent; the map does not need them): themed zombies
(local-looking residents, 6 × ~50 with rigging), a hero samba float and costume mannequins, a real gondola top
station structure instead of box and canopy, and a Meshy mural relief for the samba hall.

## 11. Implementation notes

- **Def**: `src/zombies/maps/favela/def.ts`, pure data plus two helpers (`cablePath`, `becoY`). Staging rooms
  (`name: 'STAGING'`) give the off-map roofs and yards that zombies drop or climb from a zone, so the validator and
  the director treat them properly.
- **Decorate**: `src/zombies/maps/favela/decorate.ts`. It builds a visual hillside terrain (kept below every play
  floor), about 300 kit houses **merged per material** into roughly 10 meshes, about 1,500 instanced far houses and
  city blocks, 5,200 city lights as one `Points`, the sea and sunset, the cable line and cabins, the wire tangle as
  one merged tube mesh, festoon strings as 3 instanced meshes, floodlights, murals, neon and **invisible fall guards**
  (movement-only colliders above every parapet and across climb gaps).
- **Update**: animates the cabins from the ride state, festoons chasing after power, neon flicker, sodium buzz
  and the floodlight heads.
- **Additive API extensions** (documented in `docs/MAP_API.md`): `machines` (per-map machine GLBs and perk
  footprints), `rides` (+ `src/zombies/rides.ts`), `BoxDef.mat: null` (invisible colliders), `EggReward.weapon`,
  `RideDef.requiresEggStep`, and `ride`/`egg` passed to the map update hook.
- **Tests**: `tests/maps-favela.test.ts` covers the validator, the 2-edge-connected door graph, tiers, the power
  cost, Reforger placement, box floors, spawn kinds, doors that must not be shadowed by other prompts, ride
  clearance against compiled colliders and the egg gating. `tests/zombies-rides.test.ts` covers the pure ride logic.
- **Play-through**: `e2e/favela-play.mjs` (headless, real E presses): rounds, all 11 doors in order, pre/post-power
  zone shots, power, perks, Cache, cable car, Reforger, zipline, slide and the full egg. `e2e/favela-look.mjs` is a
  quick camera tour.
