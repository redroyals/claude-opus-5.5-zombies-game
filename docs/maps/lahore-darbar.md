# MAP — "Lahore Darbar" (Zombies)

*The court of the Sikh Empire at dusk, c. 1830s: Lahore Fort, then through the Roshnai Gate into the haveli maze of the
walled city.* Map id `lahore_darbar`. Code in `src/zombies/maps/lahore/`, assets in `public/models/lahore/`.

> Status: design v2 (court + haveli). The generated top-down plan is `docs/maps/lahore-darbar.svg`. It is rebuilt
> from the map data by `node scripts/lahore-plan.mjs`, so it cannot drift from the code.

## 0. Respect rules (non-negotiable, and enforced by the validator where possible)

- This is a **secular royal court and a civic neighbourhood**. There are no gurdwaras or mosques, no Guru Granth Sahib, no
  depiction of any Guru, and no Sikh relics. sikhi.io's `relics/` and seated historical-figure models are never used.
- No named historical person is shown as a zombie, enemy or target. Maharaja Ranjit Singh does not appear in the
  map at all, not even as a portrait. The court is "his court" only in the loading blurb.
- The zombies are the game's generic undead "Afflicted" invaders. They carry no uniforms, turbans, kesh, kara or
  religious symbols. The existing roster is reused unchanged.
- Decor may include architecture, textiles, armour, cannons, jewels and the Sikh Empire's state standard. Flags
  stay on high rampart poles, and no flag, symbol or text sits on a target, spawn or enemy. The Khalsa flag
  model is not used, because it is a religious standard.
- The Koh-i-Noor appears as a jewel in the treasury. The quest is "reclaim it from the undead", not a claim about any
  real-world dispute.

## 1. Pitch

Dusk falls on Lahore Fort. The court is empty, the oil lamps are guttering, and something is climbing the Hathi Pol.
You start in the **Hazuri Bagh** garden around the white marble baradari. From there you buy your way through the fort:
the red sandstone **Diwan-e-Aam**, the **Shah Burj** quadrangle, the glittering **Sheesh Mahal**, the ramparts and the
**Toshakhana**, the treasury vault where the **Koh-i-Noor** waits. Then the **Roshnai Gate** ("Gate of Lights")
opens onto the **walled city**. Its gallis are three metres wide, its havelis turn inward around courtyards, and
the rooftops are kite terraces you can run and jump across. The **power** sits at the heart of that maze: the
great **naqqara** war drums of the Naqqar Khana haveli. Beat them and every lamp, chandelier and mirror in both
halves blazes into life. The armourer's forge (Pack-a-Punch) then wakes back in the fort.

## 2. Levels (vertical story)

The engine's ground plane is y = 0, so the street is raised and the basements sit beneath it:

| Level | y (m) | What lives there |
|---|---|---|
| **B** basement | 0.0 | Toshakhana vault, the haveli tehkhana and cistern, the old tunnel between them |
| **G** ground | 3.0 | Hazuri Bagh, Top Khana cannon yard, Diwan-e-Aam quad, armoury, gallis, haveli courtyards (vehras) |
| **P** plinths | G+1.2 = 4.2 | baradari, Diwan-e-Aam hall, drum pavilion (stepped plinths make mini training islands) |
| **U** upper | 7.2 | Shah Burj quad, Sheesh Mahal, ramparts, haveli galleries and balconies, the royal jharokha |
| **R** roofs | 10.2 | haveli roof terraces (kothay), Musamman Burj top |

Stairs rise at no more than 0.42 m per metre (the nav climb limit is 0.5 per 1 m cell). This makes G→U flights 10 m long,
so the stairs themselves become loop segments.

## 3. Zones and unlock graph

| # | Zone | Level | Role |
|---|---|---|---|
| 0 | **HAZURI BAGH** (start) | G/P | Tight start garden. A loop around the baradari plinth (you can mantle onto it; zombies take the stairs). **Box (start)** in the baradari. **Lifeline** perk. Wall-buys: Magnus, Wren |
| 1 | **TOP KHANA** · Cannon Yard | G→U | Wide open training yard around the Zamzama-style great gun. The **Hathi Pol** elephant stair (34 m, G→U) runs along its west side. Wall-buys: Hullbreaker, Kestrel |
| 2 | **DIWAN-E-AAM** | G/P | Arcaded red-sandstone hall on a plinth over a big quad, a kill pit overlooked by the royal jharokha. **Box**. **Quickhands** perk. Wall-buy: Corvid |
| 3 | **TOSHAKHANA** | G→B | Treasury hall, then stairs down into the vault. Risk/reward: a dead end until the tunnel opens. **Box**, the Koh-i-Noor pedestal, treasure chests. Wall-buy: Skiff |
| 4 | **SHAH BURJ** | U | The upper quadrangle: the Naulakha pavilion (curved bangla roof), the Diwan-e-Khas pavilion, and the jharokha balcony (a one-way drop into the Diwan-e-Aam hall). Wall-buy: Sentry |
| 5 | **SHEESH MAHAL** | U | The mirror palace: a pillared hall to circle, mirror-mosaic walls that sparkle once the power is on. **Hammerfall** perk. An egg step |
| 6 | **RAMPARTS** | U/R | The west wall walk. Its inner rail is a one-way drop into the Top Khana. The stair up to the Musamman Burj top (sniper perch, landmark). Wall-buy: Sentry |
| 7 | **SILAH KHANA** · Royal Armoury | G | A deliberate dead end off the cannon yard: armour stands, racks, and the **Armourer's Forge (Pack-a-Punch, needs power)**. Jaali screens into the Diwan-e-Aam let you shoot through but not walk through |
| 8 | **ROSHNAI GATE** · Galli | G | The covered gate tunnel, then Galli Roshnai, a 3 m spine lane. Shuttered shop windows are the spawns. Wall-buy: Wren |
| 9 | **HAVELI-E-WAZIR** | G/U | Courtyard house with a giant pipal tree (landmark). Upper gallery ring with balconies (one-way drops). **Bulwark** perk. Wall-buy: Corvid |
| 10 | **KUCHA** · The Lanes | G | A ring of gallis around the havelis, with a chowk (well, tea stall). **Box**. Wall-buys: Hullbreaker, Magnus |
| 11 | **NAQQAR KHANA HAVELI** | G/P/U | The heart of the maze: a large courtyard with the drum pavilion on its plinth (**POWER**) and galleries all round. Wall-buy: Kestrel |
| 12 | **KOTHAY** · Rooftops | R | Kite terraces across the house tops. You can jump the 3 m gaps over the lanes (a two-way nav link for zombies), drop into the lanes, and climb a ladder up from the south lane. **Box**. Wall-buy: Sentry |
| 13 | **TEHKHANA** | B | The haveli basement and a stepped cistern. It is tense and dark with low ceilings. The old tunnel door leads to the Toshakhana vault and closes the big basement loop. Wall-buy: Skiff |

Doors (cost, kind):

```
                 [7 SILAH KHANA]*PaP (dead end)
                        | 1500
[6 RAMPARTS]--1000d--[4 SHAH BURJ]--1500--[5 SHEESH MAHAL]
    |  (drop)           |    \ 1250 (Hathi Pol, top of ramp)
    v                   |     \
[1 TOP KHANA]--750--[0 HAZURI BAGH]--1000d--[2 DIWAN-E-AAM]--1250--[3 TOSHAKHANA]
    |  (topkhana_armoury 1500 → 7)   |             | 1000d (Khas stair → 4)     | 2000 (old tunnel)
                                     | 1250                                      |
                               [8 ROSHNAI]--1000--[9 WAZIR]--1500--[12 KOTHAY]    |
                                     | 1250d        | 750            | 1250d     |
                                     +-------[10 KUCHA]--1500--[11 NAQQAR]*POWER  |
                                              | 1250d          | 1500            |
                                              +---------[13 TEHKHANA]------------+
```
(`d` = debris; every other entry is a carved door.)

Three alternative routes lead into the haveli half: Roshnai, Wazir → lanes, and the basement tunnel. Two routes lead up into the
fort's upper level: the Hathi Pol, and the Diwan-e-Khas stair. Every zone except the armoury and (until the tunnel) the
vault sits on at least one loop.

## 4. Top-down plan (coarse ASCII; the exact SVG is generated)

```
 z     x: -60      -44        -18   0    14    30         60         90
 -70        +------- SHEESH MAHAL (U) -------+
 -58   RAMP |  Naulakha   SHAH BURJ QUAD (U)  Diwan-e-Khas |
 -46   PARTS|[Hathi Pol  |______jharokha________|           | VAULT(B)|TEHKHANA(B)
 -40   (U)  | landing U] |   DIWAN-E-AAM HALL (P)          |  ↑stair |   ↑ stair
       |    |  ramp      |                      |Khas stair| TOSHA-  |  north lane ───────────────┐
 -24   |    |  G→U  SILAH KHANA (G)  D-E-A QUAD (G)         | KHANA   |A │ H1 WAZIR   │B│ H2 NAQQAR │E│
 -10   |    |        |  (jaali) |      gate      |         |  hall   |  │ (pipal)    │ │ KHANA     │ │
  -6   |    +--------+---------+-------[]-------+---------+         |  │            │ │  drum(P)  │ │
       | drop  TOP KHANA (G)      HAZURI BAGH (G)                     |  ├─mid lane───┼chowk        │ │
  8    |       great gun           baradari (P)   ==ROSHNAI GATE==== A|  │ H3 roofs(R)│ │ roofs (R) │ │
  20   +---- Musamman Burj (R) ---------------------------+            |  └────── south lane ──────────┘
  36                                                                     (ladder south lane → roofs)
```

## 5. Why it plays well (design rationale)

**Loops, not dead ends.**
- Hazuri Bagh has a tight baradari circuit, good for rounds 1–5.
- The Top Khana is a big open yard for a training circle around the great gun.
- The Diwan-e-Aam quad is a second training space.
- The biggest loop runs Bagh → Top Khana → Hathi Pol → Shah Burj → Khas stair → Diwan-e-Aam → Alamgiri gate → Bagh.
  Its two one-way shortcuts (the jharokha drop and the rampart drop) let a team shorten it when under pressure.
- The haveli half is a ring of lanes (A, north, B, east, south) around three blocks. Each lane is a narrow
  chokepoint. Trains run around it, and the chowk is where the rings cross.
- The basement loop is Toshakhana → vault → tunnel → tehkhana → north lane → Roshnai → Bagh → Diwan-e-Aam.
- There are two deliberate dead ends. The armoury holds the Pack-a-Punch, so you go in with a plan. The vault holds a box and the
  final egg step, so it is high reward with one way out until 2000 points open the tunnel.

**A readable maze.** Each zone has its own light and colour identity, plus a landmark you can see from far away:

| Zone | Palette / light | Landmark |
|---|---|---|
| Hazuri Bagh | cool dusk blue + white marble | baradari (lit chhatris) |
| Top Khana | torch orange, smoke | the great gun + Musamman Burj |
| Diwan-e-Aam | red sandstone, warm lamps | 40-pillar arcade |
| Shah Burj / Sheesh Mahal | gold + silver glitter | mirror hall glow through the arches |
| Ramparts | cold wind, torches | tower beacon |
| Havelis | ochre lime-plaster, green shutters | giant pipal tree (Wazir), the drum pavilion lanterns (Naqqar), kites on the roofs |
| Tehkhana | blue-black, dripping, candle pools | stepped cistern |

**Multiple routes, player choice.** The 17 doors form a graph, not a line. Each half has two entry routes, and the basement tunnel
opens late to join them. One-way drops (jharokha, rampart, balconies, roof edges) and rooftop jumps give escape
options that zombies have to path around.

**Verticality as gameplay.**
- The courtyards (Diwan-e-Aam quad, the Naqqar vehra) are kill pits overlooked by galleries.
- The rooftops are for escape and repositioning.
- The basement is tension: a low ceiling, dark, and the spawns are close.

**Chokepoints balanced with open space.** Tight gallis and gate tunnels alternate with the three big open spaces (the
Top Khana yard, the Diwan-e-Aam quad and the Naqqar vehra).

**Risk and reward placement.**
- The start box is safe. Later boxes sit in the vault (a dead end), on the roofs (exposed) and in the chowk (a lane crossing).
- Quickhands is in the first big room. Bulwark is in the haveli half, which pulls players across. Hammerfall is deep in the Sheesh Mahal.
- The Pack-a-Punch is in the court but needs the power from the far end of the haveli maze.

**Pacing.** Early rooms are tight (the Bagh, the gate tunnels). Later areas are bigger (the quads, the Naqqar vehra, the
rooftops). The power is about 5 doors deep along either route.

## 6. Machines, perks and wall-buys

- **The Cache (mystery box)** is re-skinned as a gilded treasure casket (`lahore/box_casket.glb`). It has 5 spots: the baradari (start), the Diwan-e-Aam
  hall, the Toshakhana vault, the chowk and the Kothay roof.
- **Perks** keep their gameplay colours and readable glowing signboards. Each is dressed as an 1830s sharbat
  dispenser cabinet (brass urn, coloured glass bottles):
  - **Lifeline** (Bagh): blue
  - **Quickhands** (Diwan-e-Aam): green
  - **Bulwark** (Wazir haveli): red
  - **Hammerfall** (Sheesh Mahal): amber
- **Pack-a-Punch = the Armourer's Forge** (Silah Khana): a brick furnace, bellows and an anvil. It runs on the
  generic Reforger logic.
- **Power = the great naqqara drums** in the Naqqar Khana drum pavilion. Striking them sounds a deep double boom across the map.
- **Wall-buys** are chalk-on-plaster outlines. There are 12 across the two halves.

## 7. Easter egg — "The Mountain of Light" (both halves)

1. **The Mirror Speaks** (court, needs power): find and use the three dim mirror medallions hidden in the Sheesh Mahal's
   mosaic.
2. **The Treasurer's Keys** (haveli): collect the three keys of the Toshakhana:
   - the seal-ring in the tehkhana cistern,
   - the brass key tangled in a fallen kite on the Kothay,
   - the ledger in the Wazir's haveli.
3. **Wake the Drums** (haveli heart): kill 24 zombies inside the Naqqar Khana while the drums beat.
4. **Reclaim the Mountain of Light** (court, dead end): place the keys at the vault pedestal, then survive 30 kills in the
   Toshakhana.

**Reward:** all four perks, a free Pack-a-Punch of the held weapon, max ammo, and 5000 points.
Implemented with the generic egg step machine (interact / collect / kill), extended with an `allPerks` reward flag if the map API
has one.

## 8. Lighting and atmosphere

- **Pre-power:** a deep dusk sky (indigo above an ember horizon) and thinner fog than Nightfall, so the landmarks read.
  Light comes from torches (mashaal) and a few oil lamps, flickering and warm. There are cold rim lights in the basements.
- **Post-power:**
  - the chandeliers light up;
  - rows of diya lamps along the parapets and galleries glow (instanced emissive sprites, cheap);
  - the Sheesh Mahal mirror material switches to a high-emissive glitter;
  - the drum pavilion lanterns light;
  - the hemisphere light lifts a little.
- Real point lights are budgeted to a small pool, and the emissive glow and sprites do most of the work.

## 9. Audio

Procedural WebAudio in the game's style:
- A **drone bed** of tanpura-like filtered saws with slow beating.
- Distant **naqqara** hits every 20–40 s before the power (a low sine drop plus noise), which turn into a regular slow march
  rhythm after it.
- Dusk birds and wind on the ramparts. Water drips in the tehkhana.
- The round start stinger keeps the game's own sting.

## 10. Assets

- **Blender** (`tools/blender/lahore_kit.py`): the modular architecture, all grid-snapped and UV'd in world
  metres. Pieces:
  - cusped (multifoil) arch bays and arcades
  - baradari and Diwan-e-Aam columns
  - chhatris and onion domes, a bangla roof, jharokha balconies, jaali screens
  - kangura merlon parapets, stair nosings, a carved door frame, haveli shutters and balconies, the octagonal burj
  - a stepped cistern, a fountain tank, a ladder and a kite
- **Meshy** (cap 1,800 credits, log in `assets/LOG.md`): the hero props:
  - the throne dais (original design) and a crystal chandelier
  - an oil lamp stand and a torch bracket
  - the gun carriage and cannonball pyramid
  - two armour stands and two treasure chests
  - the Koh-i-Noor pedestal
  - the casket box, four themed perk cabinets and the armourer's forge
  - the naqqara drums
  - the pipal tree, charpai, matka pots, a well, a carved haveli door and a palki
- **Reused from sikhi.io** (copied, metallic fixed): brass-vase, hanging-lantern, area-rug, sikh-cannon (field gun), kohinoor-gem
  (used as a jewelled armlet in the treasury), flag-ranjit-singh (rampart poles only).
  - Not used: flag-khalsa (religious), burj-tower (it is a pole, not a tower), lotus-blossom (1.4 MB, reads black) and candle-holder.
- **Budget:** at most 40 MB total for the map. It is loaded progressively: the shell geometry is procedural (it costs nothing
  to download), then the props stream in by zone distance.
