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
];
