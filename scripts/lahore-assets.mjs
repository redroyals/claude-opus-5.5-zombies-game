// Lahore Darbar map assets (Meshy hero props). cat 'lahore' -> public/models/lahore/<id>.glb.
// Respect rules (docs/maps/lahore-darbar.md §0): no people, no religious objects or symbols, no text.
const S = 'original video game prop, 1830s Lahore royal court style, no people, no text, no letters, no religious symbols, stylised realistic, clean silhouette, isolated, PBR';
const l = (id, size, prompt, extra = {}) => ({ id, cat: 'lahore', map: 'lahore', size, polycount: 10000, prompt: `${prompt}, ${S}`, ...extra });
const perk = (id, colour, glow) => l(id, 2.1, `tall carved teak wood drink dispenser cabinet with a big polished brass urn and spigot on top, glass front showing rows of ${colour} glass bottles glowing ${glow}, arched carved crest panel, brass corner trim, sturdy base`);
export const LAHORE = [
  l('box_casket', 1.3, 'ornate royal treasure casket chest, carved dark rosewood with gilded brass corner fittings and a domed hinged lid, small mirror and ivory floral inlay panels, closed', { split: 'lid', splitFrac: 0.62 }),
  perk('perk_bulwark_lh', 'deep red', 'red'),
  perk('perk_quickhands_lh', 'emerald green', 'green'),
  perk('perk_hammerfall_lh', 'amber orange', 'orange'),
  perk('perk_lifeline_lh', 'sky blue', 'blue'),
  l('forge_pap', 2.3, 'blacksmith armourer forge: brick furnace hearth with glowing orange coals and a chimney hood, large leather bellows, iron anvil on a tree stump, tongs and hammers, quench water trough', { polycount: 14000 }),
  l('naqqara', 1.7, 'pair of huge copper kettle drums with stretched leather heads on a low carved wooden stand, red and gold embroidered cloth skirts with tassels, two curved drumsticks resting on top'),
  l('chandelier', 1.5, 'large antique crystal glass chandelier with a gilded brass frame, three tiers of candle cups and hanging crystal drops, short chain at the top', { tris: 3500 }),
  l('torch_bracket', 1.0, 'wall-mounted wrought iron torch bracket holding a cloth-wrapped wooden torch, flat back plate', { tris: 1500 }),
  l('throne_dais', 2.6, 'royal octagonal raised platform dais covered in gold leaf carved floral panels, low gilded railing on three sides, plump red velvet cushions and round bolsters on top, three small steps at the front, no chair', { polycount: 12000 }),
  l('armour_stand', 1.95, 'wooden display stand shaped like a headless torso wearing 19th century Indo-Persian armour: chainmail shirt with four polished steel plates, pointed steel helmet with chainmail aventail on the top post, round steel shield leaning on the base', { tris: 5000 }),
  l('weapon_rack', 2.0, 'carved wooden weapon rack holding curved sabres in scabbards, long spears and two round steel shields', { tris: 4000 }),
  l('chest_gold', 1.2, 'open wooden treasure chest with iron bands overflowing with gold coins, pearl strings and coloured gemstones', { tris: 5000 }),
  l('strongboxes', 1.3, 'stack of three iron-bound wooden strongboxes with heavy padlocks', { tris: 3000 }),
  l('pedestal', 1.4, 'white marble pedestal column with pietra dura coloured stone floral inlay, square base and capital, flat top', { tris: 2500 }),
  l('great_gun', 7.5, 'enormous long ornate bronze cannon barrel with floral engravings and a flared muzzle, mounted on a heavy wooden gun carriage with four large spoked iron-rimmed wheels', { polycount: 14000 }),
  l('cannonballs', 1.1, 'pyramid stack of black iron cannonballs on a square wooden pallet', { tris: 2500 }),
  l('pipal_tree', 13, 'huge old pipal tree with a thick twisted multi-root trunk and a very wide dense canopy of heart-shaped leaves', { polycount: 16000 }),
  l('charpai', 2.0, 'traditional wooden rope-woven charpai cot with turned wooden legs', { tris: 3000 }),
  l('matka_pots', 1.0, 'cluster of three red clay water pots on a small wooden stand, with a brass cup', { tris: 2500 }),
  l('well', 3.0, 'old round brick water well with a raised rim and a wooden pulley frame, rope and wooden bucket'),
  l('haveli_door', 3.4, 'massive carved dark wooden double door with brass studs and iron rings, arched carved wooden frame, closed', { polycount: 12000 }),
  l('palki', 2.4, 'ornate wooden palanquin with a curved roof, red cloth curtains and two long carrying poles'),
  l('chai_stall', 1.8, 'street tea stall: wooden table with a big brass samovar kettle, clay cups and a small clay stove'),
  l('spice_stall', 2.2, 'market stall with woven baskets of colourful spices and grains, brass pots and a faded canvas awning on poles'),
  // ---- art pass 2 (branch lahore-art, ids la_*, cap 1,200 credits; ledger = sum of gen-state `spent` for la_*) ----
  // Re-rolls of props that read wrong (naqqara = dhol barrels, pedestal = Greco-Roman, torch = lantern) + new heroes.
  l('la_naqqara', 1.6, 'pair of naqqara kettle drums: two wide hemispherical hammered copper bowl drums with taut cream leather drumheads laced down the sides with leather thongs, one drum larger than the other, set side by side on a low round carved wooden ring stand, two short curved wooden beaters resting across them, 1830s Punjab royal war drums', { tris: 6000, tex: 1024 }),
  l('la_pedestal', 1.25, 'short octagonal jewel display pedestal of white marble richly inlaid with coloured semi-precious stone flowers and vines, carved scalloped base, gilded brass rim and a small crimson velvet cushion on the flat top, Mughal court style', { tris: 5000, tex: 1024 }),
  l('la_mashaal', 1.1, 'wall-mounted iron fire torch holder: flat wrought iron back plate with a curved scrolled bracket arm holding an open brass cup packed with oil-soaked cloth rags, flame not included, open top, no glass, no lantern, no cage', { tris: 2500, tex: 512 }),
  l('la_facade_bay', 4.6, 'single modular facade bay of red sandstone Mughal architecture: a tall recessed cusped multifoil arch niche framed by two carved pilasters with lotus capitals, carved floral relief panels in the spandrels, white marble inlay borders, a thin projecting chhajja eave on carved stone brackets across the top, flat back, flat sides for tiling', { tris: 6000, tex: 1024 }),
  // stage 2 (after the stage-1 review: la_naqqara, la_pedestal, la_facade_bay rejected; kettle drums + pedestal are built in Blender)
  l('la_fruit_cart', 2.2, 'wooden street vendor handcart with two large spoked wooden wheels, piled with woven baskets of mangoes, pomegranates, oranges and melons, a faded cloth sunshade on two sticks', { tris: 5000, tex: 1024 }),
  l('la_pottery_stall', 2.0, 'street pottery stall: low wooden platform stacked with terracotta clay water pots, jars, bowls and oil lamps in rows, a jute sack canopy on bamboo poles', { tris: 5000, tex: 1024 }),
  l('la_cloth_stall', 2.2, 'textile market stall: wooden counter piled with folded bolts of brightly coloured patterned cloth and silk, more cloth hanging from a bamboo frame above, striped canvas awning', { tris: 5000, tex: 1024 }),
  l('la_brass_vessels', 0.9, 'group of polished engraved brass vessels on the floor: a tall long-necked water flask, a round squat water pot with a spout, a lidded round box and a large flat engraved tray leaning behind them', { tris: 3500, tex: 1024 }),
  l('la_divan', 2.2, 'low wide carved wooden platform divan for a royal court, covered with a thick crimson and gold brocade mattress, two long round bolster pillows and three square embroidered cushions', { tris: 5000, tex: 1024 }),
  l('la_pigeon', 0.32, 'single grey rock pigeon bird standing, iridescent green and purple neck, dark wing bars, realistic', { tris: 1500, tex: 512 }),
  l('la_charpai', 2.0, 'traditional Punjabi charpai cot: simple rectangular wooden frame with four turned wooden legs and a seat woven from natural jute rope in a diagonal lattice pattern, empty, no cushions', { tris: 3000, tex: 1024 }),
  l('la_perk_test', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass: a large glowing sky blue glass flask sits inside a cusped arched niche, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
  // stage 3 (after review: cloth_stall rejected; la_perk_test accepted as the Lifeline skin -> three more colours)
  l('la_perk_bulwark', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass: a large glowing deep ruby red glass flask sits inside a cusped arched niche, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
  l('la_perk_quickhands', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass: a large glowing emerald green glass flask sits inside a cusped arched niche, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
  l('la_perk_hammerfall', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass: a large glowing amber orange glass flask sits inside a cusped arched niche, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
  l('la_lantern', 0.8, 'hanging Mughal lantern: pierced brass lantern with a domed top, star and floral cut-outs and coloured glass panels in amber and red, a brass ring and short chain at the top', { tris: 3000, tex: 512 }),
  l('la_lamp_stand', 1.7, 'tall standing brass oil lamp stand for a royal hall: a turned brass column on a wide round foot, a tiered tray of small oil cups near the top and a peacock-free plain finial', { tris: 3000, tex: 512 }),
  l('la_planter_tree', 2.4, 'large round terracotta garden planter pot with painted bands holding a small clipped orange tree with a dense round canopy of dark green leaves and a few orange fruits', { tris: 5000, tex: 1024 }),
  l('la_sacks', 1.4, 'market goods pile: three plump burlap grain sacks, one open showing yellow lentils, two woven wicker baskets of red chillies and onions, a brass measuring bowl', { tris: 4000, tex: 1024 }),
  l('la_cloth_stall2', 2.0, 'textile seller low wooden bench stall with neat stacks of folded brightly coloured cotton and silk cloth bolts and two rolled carpets leaning against it, clean simple shapes', { tris: 5000, tex: 1024 }),
  l('la_pigeon_loft', 2.2, 'rooftop wooden pigeon coop: a raised wooden box cage on four legs with a slatted front, small arched openings, a perch ladder and a sloped tin roof, weathered', { tris: 4000, tex: 1024 }),
  l('la_degh', 1.0, 'huge copper cooking cauldron pot with a wide rim and two ring handles on a brick hearth ring, soot marks, a long wooden ladle resting in it', { tris: 3500, tex: 1024 }),
  l('la_chowki', 0.9, 'low square carved wooden table with short turned legs and a large engraved brass tray on top holding small brass cups and a water jug', { tris: 3500, tex: 1024 }),
  // stage 4: la_perk_bulwark read too dark (a dim red flask behind black glass) -> re-roll with a lit flask
  l('la_perk_bulwark2', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass, open arched front niche with no glass door, inside it a large bright glowing crimson red glass flask lit from within, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
  // stage 5: skins for the pacing branch's new machines (model paths only, see src/zombies/maps/lahore/models.ts)
  l('la_perk_nova', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass, open arched front niche with no glass door, inside it a large bright glowing violet purple glass flask lit from within, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
  l('la_perk_strider', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass, open arched front niche with no glass door, inside it a large bright glowing golden yellow glass flask lit from within, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
  l('la_perk_hawkeye', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass, open arched front niche with no glass door, inside it a large bright glowing steel blue grey glass flask lit from within, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
  l('la_bench', 1.8, 'sturdy old armourer workbench: heavy scarred wooden table with a small iron anvil, a vice, hammers, tongs and files laid out, a leather apron hanging on the side, a clay oil lamp', { tris: 5000, tex: 1024 }),
  l('la_fire_pit', 2.6, 'wide square sunken fire pit trough of blackened stone blocks with a heavy iron grate on top, charred wood and embers inside, a copper oil pipe running into it with a brass valve wheel', { tris: 5000, tex: 1024 }),
  l('la_part_bowl', 0.5, 'wide shallow hammered bronze bowl with a thick rolled rim and engraved band', { tris: 1500, tex: 512 }),
  l('la_part_bellows', 0.6, 'small leather hand bellows with two carved wooden paddles and a brass nozzle', { tris: 1500, tex: 512 }),
  l('la_part_naft_jar', 0.45, 'round clay jar with a narrow neck sealed with a cloth rag tied with string, dark oil stains running down its side', { tris: 1500, tex: 512 }),
  // stage 6: la_perk_strider's flask came back grey -> re-roll
  l('la_perk_strider2', 2.1, 'tall ornate Mughal style sharbat drinks fountain cabinet of carved red sandstone and brass, open arched front niche with no glass door, inside it a large bright glowing lemon yellow glass flask shining with yellow light, a polished brass spigot and basin below, a small gilded dome on top, sturdy square base', { tris: 6000, tex: 1024 }),
];
