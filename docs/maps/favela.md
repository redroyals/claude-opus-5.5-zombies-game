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

| Tier | Floor y | Areas | Mood / light |
|---|---|---|---|
| **T0** | 0 | Bottom street, the Lanchonete (snack bar), ground-floor rooms | Sodium streetlights (deep orange), bar fluorescent tube, lit fridge |
| **T1** | 4 | Beco landing, house row B (kitchen, workshop) | Bare bulbs that flicker, warm tungsten |
| **T2** | 8 | Beco top, house row C, **Quadra** (the pitch), bottom cable-car station | The pitch is dim before power and **floodlit cold-white** after. Tungsten in the houses. |
| **T3** | 12 | **Big Laje** (roof slabs), stands walkway, ravine bridge, **Samba hall** | Dusk sky and festoon string lights (after power). The hall has magenta and cyan neon after power. |
| **T4** | 16 | Samba stage catwalk, the middle of the station stair and escadaria landings | A transition tier with the escadaria's tiled landings under blue lamps |
| **T5** | 20 | **Top cable-car station**, **Substation** (power), **Mirante** (lookout) | Red aviation beacons, cold blue station light, and the city glowing below the lookout |
| *Peak* | 40 | Hidden summit (easter-egg reward only) | Moonlight above the clouds |

Height is always legible: the higher you are, the cooler the light and the more of the sea you see.

---

## 3. Side elevation (looking west, south = downhill on the right)

```
 y
 40 |                                                                    * PEAK (hidden; EE cable line)
    |                                                                  .´
 32 |                                                               .´
    |                                                            .´
 24 |    [==TOP STATION==]~~~~~~~ main cable ~~~~~~~~~~~~~~~~~~~.
 20 |T5  [ SUBSTATION  ]  +  [ MIRANTE ]   (bridge of wires)       ~~~~~.
    |         \  station stair (2.4 m, chokepoint)                           ~~~~.
 16 |T4        \_______ [ SAMBA HALL ]stage                                     ~~~~.
 12 |T3                 [ SAMBA HALL ][====== BIG LAJE (water tower) ======]         ~~~ [LOWER STATION]
    |                                    \   tin-roof slide (one way)  \               (Reforger)
  8 |T2      (ravine)                     [row C rooms]                  \  QUADRA / beco top  ---^
  4 |T1                                          [row B rooms] [beco landing]   \
  0 |T0                                                  [row A]  BOTTOM STREET  [LANCHONETE] -> slope, city, sea
    +-------------------------------------------------------------------------------------------------> z (+)
      z=-56        -40         -24          -8           8          16    24     30   38   46      90
```

The cable runs diagonally from the bottom station on the pitch (x −42, z 10, y 8) to the top station
(x 18, z −50, y 20). It hangs above the stands, the bridge and the samba roof, so you can see it from every
tier. It is the map's compass.

---

## 4. Top-down layout (1 char ≈ 2 m, north/uphill at the top)

```
x:  -46        -30        -16  -12    -2         10        22        34
z
-56 +----------------------+ +------+ +------------------------------+
    |       MIRANTE (T5)   | | SUB- | |    TOP CABLE-CAR STATION     |
    |  lookout rail  [Box6]|=|STATN |=|  wheel  [PERK Hammerfall]    |
    |     zipline >----.   |d11 PWR d10  (EE peak line ^)            |
-36 +---+ .............. `-.+-+------+ +-------------------------+ S |
    | E |                    `-.  R A V I N E        SAMBA HALL   | T |
    | S |                       `-. (no floor)     (T3, stage T4) | A |
    | C |   STANDS TOP WALKWAY (T3)  `-.     [Box5 stage] [PERK   | I |
-22 | A +==========================[BRIDGE d6]=*    Quickhands]  | R |
    | D |  STANDS  (T2 -> T3 rows)     |     `d7`-----------------+ d8|
-18 | A |  [PERK Bulwark] [Box4]       |  *land   BIG LAJE (T3)       |
    | R |                              |  zip    (water tower O)     |
 -8 +d9-+------------------------------+          [Box3] ladder^     |
    |  QUADRA (T2)  pitch 22 x 16      | R      satellite  tanks     |
    |   goal |                | goal   | A     jumps  = =  laundry   |
    |        |     (centre)   |        | V                     slide>|
  3 | [LOWER |                |        |d4 +-------------d5 hatch---+ |
    | STATION]                         | B | ROW C rooms (T2) [PERK  | |
 14 | Reforger  (dead end)             | E |  Box2 ...]              | v
    +------------------retaining wall--+ C +--+ ROW B rooms (T1)     | v
 17                                      | O d3                      | v
 24                                      |   | ROW A rooms (T0) d2   | v
 30 +------------------------------------+d1-+------------------------+-v------+
    |   BOTTOM STREET (T0)    [Box1]   street lamps     slide lands here -> *  |
 38 +------------------+ LANCHONETE (bar) [PERK Lifeline fridge] +-------------+
 46                    +------------------------------------------+
                  downhill: roofs, city lights, the sea at dusk
```

Door key (the number is the price): **d1** street→beco 750 (debris: collapsed shutter), **d2** street→houses 750
(door), **d3** beco landing→row B 1000, **d4** beco top→quadra 1250 (gate), **d5** row C→laje hatch 1250,
**d6** stands→bridge→laje 1000, **d7** laje→samba hall 1500, **d8** samba hall→station stair 1500 (debris),
**d9** quadra→escadaria→mirante 1500 (gate), **d10** station→substation 1250 (debris), **d11**
mirante→substation 1250 (gate).

---

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
| **Cable car** | Bottom station (T2) ⇄ top station (T5) | Works after power. Costs 250 and the ride takes about 9 s. Two cars run in counter-motion. It is the natural trip to the Reforger after power. |
| **Zipline** | Mirante (T5) → big laje (T3), across the ravine | One way and free. About 3 s. |
| **Tin-roof slide** | Laje SE corner (T3) → street east end (T0) | One way and free. You slide down a cascade of corrugated roofs. It is the emergency exit from the laje. |
| **Rooftop jumps** | Between laje slabs (gaps 1.2–1.6 m, up to 0.8 m of step) | Real jumps and mantles. Zombies take the plank walkways. |
| **Ladder** | Laje → water-tower top (y 19) | A dead-end sniper perch and an EE step |
| **Drops** | Escadaria landing (T4) → stands top (T3). Stands → pitch. | One-way shortcuts down |

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
| **The Cache** (box) | 6 spots, one per tier: street (start), row B kitchen, laje by the water tower, under the stands, the samba stage, the mirante | A wooden crate painted with colourful abstract shapes |
| **Power switch** | Substation, T5 | A big knife switch between two transformers |

Wall-buys are chalk outlines as usual. The early guns sit low and the rifles sit high: Warden (street), Magnus (bar),
Wren (beco landing), Hullbreaker (row C), Kestrel (laje), Skiff (quadra), Corvid (samba hall), and Sentry DMR
(mirante, for the long view).

---

## 9. Easter egg — "Last Ride to the Peak"

1. **Turn on the power.** The main cable line wakes up. The third line from the station to the peak stays dead
   because its grips are missing.
2. **Find the three cable grips** (glowing clamp relics): one in the beco drain at the T1 landing, one inside the
   big surdo drum on the samba stage, and one on top of the laje water tower (ladder).
3. **Refit the peak line** at the station's third bull wheel. The line groans into life.
4. **Hold the station.** Zombies pour off the station roof while the car comes down from the peak. You survive until it docks.
5. **Ride to the peak** (y 40, above the clouds). The reward waits on a pedestal: a wonder weapon, a max ammo and
   +5000. The car brings you back to the station.

---

## 10. Asset plan

**Blender (procedural, `tools/blender/favela_kit.py`, no credits):** background house blocks A–F (exposed brick,
painted plaster patches, window grilles, dark or lit window panes, rebar stubs, a slab parapet, small water tanks),
rebar column stubs, parapet caps, window grille, door frame, tin roof, utility pole with crossarm and insulators,
street lamp (sodium), floodlight mast, cable-line pylon, railing, festoon string, kite, laundry line, abstract mural
panels (extruded colour shapes), a water tower landmark, the pitch goal frame and a ladder. Each piece exports
collider proxies in `extras.colliders`.

**Reused (no new credits):** `r-house-block`, `r-barrel` and `r-gas-cylinder` (finished mp-assets Meshy tasks,
fetched by id), `k-neon-frame` (abstract neon), `k-ac-cluster`, `k-water-tank`, `k-market-stall`, `l-bench` and
`k-dumpster`. We also refine the finished `r-water-tank` and `r-satellite` previews (+10 credits each). The existing
zombies, weapons, box and machines stay available as fallbacks.

**Meshy heroes (cap 1,200 credits, about 30 each, in two render-checked stages):** gondola cabin, station bull-wheel
drive, ground transformer, bar counter and stools, drinks fridge, motorbike, hanging wire bundle, futsal goal,
plastic table and chairs, samba surdo drums, costume rack, speaker stack, and the themed perk machines ×4, Reforger
and Cache.

**Web budget:** meshopt plus quantized GLBs and WebP textures (≤ 1024 px, heroes ≤ 1.5 MB each). Background houses
are instanced (5 variants give a few hundred instances in about 20 draw calls). The map geometry is procedural, so
it is playable immediately, and the models stream in progressively. The download target is **≤ 40 MB**.
