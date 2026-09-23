// Zombies-mode asset manifest (single source of truth): id, category, target size (m), Meshy prompt.
// Consumed by scripts/meshy-gen.mjs, scripts/optimize-assets.mjs, scripts/build-manifest.mjs.
// Reused guns come from the mp-assets branch raw Meshy GLBs (no prompt needed, never regenerated).
const w = (id, cls, name, size) => ({ id, cat: 'weapons', cls, name, size, reused: true });
const WW = 'original sci-fi prototype wonder weapon for a video game, hand-built experimental look, exposed wiring and glowing parts, no text, no logos, stylised realistic, isolated, side profile silhouette readable';
export const WEAPONS = [
  w('ar_kestrel', 'ar', 'KR-7 Kestrel', 0.84), w('ar_corvid', 'ar', 'Corvid-47', 0.88), w('ar_tern', 'ar', 'Tern Compact', 0.72),
  w('ar_moraine', 'ar', 'Moraine SCR', 0.98), w('smg_wren', 'smg', 'Wren 9', 0.66), w('smg_skiff', 'smg', 'Skiff MX', 0.54),
  w('smg_fennec', 'smg', 'Fennec PDW', 0.51), w('lmg_bastion', 'lmg', 'Bastion 249', 1.04), w('sg_hullbreaker', 'shotgun', 'HB-12 Hullbreaker', 1.0),
  w('sg_tidal', 'shotgun', 'Tidal Auto', 1.01), w('dmr_sentry', 'marksman', 'Sentry 14', 1.12), w('sr_longwatch', 'sniper', 'Longwatch .308', 1.12),
  w('pi_warden', 'pistol', 'P-19 Warden', 0.19), w('pi_magnus', 'pistol', 'Magnus .44', 0.3), w('pi_basalt', 'pistol', 'Basalt .50', 0.27),
  w('ln_lotus', 'launcher', 'Lotus RL', 0.95), w('sp_knife', 'melee', 'Combat Knife', 0.3),
  { id: 'ww_arc', cat: 'weapons', cls: 'wonder', name: 'Arc Projector', size: 0.9, polycount: 10000, prompt: `handheld rifle-sized tesla coil arc projector gun, copper coil spire at the front, glass capacitor tubes glowing electric blue, brass and dark iron frame, pistol grip and shoulder stock, ${WW}` },
  { id: 'ww_singularity', cat: 'weapons', cls: 'wonder', name: 'Singularity Launcher', size: 0.95, polycount: 10000, prompt: `gravity well launcher gun with a large open ring emitter at the muzzle containing a small black sphere, purple glowing energy vents, heavy gunmetal body, pistol grip and shoulder stock, ${WW}` },
  { id: 'ww_cryo', cat: 'weapons', cls: 'wonder', name: 'Cryo Lance', size: 1.0, polycount: 10000, prompt: `freeze ray lance rifle with a long pointed crystalline emitter barrel, frosted pale blue coolant canisters on the sides, white and steel body, pistol grip, ${WW}` },
];
const M = 'original video game prop, no text, no logos, no letters, stylised realistic, clean silhouette, isolated, PBR';
const m = (id, size, prompt, cat = 'machines') => ({ id, cat, size, polycount: 12000, prompt: `${prompt}, ${M}` });
export const MACHINES = [
  { id: 'mystery_box', cat: 'machines', size: 1.3, reused: true, split: 'lid', note: 'from assets/samples/mystery-box.glb' },
  m('perk_bulwark', 2.2, 'tall retro 1960s vending machine, glossy deep red enamel, big glass front with rows of red glass soda bottles, heavy rounded chrome trim, shield emblem shape on top, bulky armored look'),
  m('perk_quickhands', 2.0, 'slim retro soda vending machine, bright lime green enamel with white stripes, tall narrow glass window showing green bottles, rounded top with a lightning bolt shape, chrome coin slot'),
  m('perk_hammerfall', 2.1, 'wide retro drink dispenser machine, amber orange and cream enamel, twin round portholes showing orange glass bottles, stepped art deco top, brass trim'),
  m('perk_lifeline', 2.1, 'retro medical drink vending machine, pale blue and white enamel, glass front with blue bottles, a white cross shape on top, rounded corners, chrome dispenser tray'),
  m('reforger', 2.3, 'large industrial weapon upgrade machine, heavy riveted steel press with rollers and a glowing furnace slot in the middle, conveyor tray in front, pipes and gauges, dark iron with red glow'),
  m('generator', 1.6, 'old industrial diesel generator on a steel skid frame, olive green, exhaust pipe, cables, dials', 'props'),
  m('lab_table', 1.8, 'solid heavy grey steel laboratory workbench table with four legs, a thick flat worktop, a lower shelf, a few glass beakers and a microscope on top', 'props'),
  m('filing_cabinets', 1.4, 'row of three dented grey metal filing cabinets, one drawer open with papers', 'props'),
  m('lamp', 1.8, 'industrial caged floor work lamp on a tripod stand with a cable, yellow', 'props'),
];
const Z = 'original video game zombie character, full body, standing in A-pose arms slightly away from body, feet flat, facing forward, rotting grey-green skin, stylised realistic, isolated, no weapons';
const z = (id, size, prompt) => ({ id, cat: 'zombies', size, polycount: 14000, prompt: `${prompt}, ${Z}` });
export const ZOMBIES = [
  z('z_shambler', 1.8, 'shambling zombie in a torn grey facility technician jumpsuit, gaunt'),
  z('z_runner', 1.78, 'lean zombie in ripped soldier fatigues and tank top, wiry'),
  z('z_brute', 2.3, 'huge hulking muscular zombie in torn work overalls, massive arms, hunched'),
  z('z_crawler', 1.7, 'emaciated zombie in a torn lab coat, skinny, ragged trousers'),
  z('z_fast', 1.75, 'skeletal feral zombie with glowing orange eyes, charred black cracked skin with ember glow, very thin'),
  z('z_boss', 2.8, 'giant armored zombie boss wearing welded scrap metal plates and a riveted iron helmet, chains, glowing blue eyes'),
];

// ---- Map: RIO · RIDGELIGHT (favela). Map-specific props/machines -> public/models/favela/ (docs/maps/favela.md §10).
// `reuse` = finished Meshy task ids from the paused mp-assets branch (fetched, never regenerated).
const FV = 'original video game environment prop, no text, no logos, no letters, no numbers, no brand, stylised realistic, clean readable silhouette, isolated, PBR';
const f = (id, size, prompt, extra = {}) => ({ id, cat: 'favela', size, polycount: 10000, prompt: `${prompt}, ${FV}`, ...extra });
export const FAVELA = [
  // reused mp-assets Rio kit (task ids, see ../zombies-mp-assets/assets/LOG.md)
  { id: 'fv_house_block', cat: 'favela', size: 9, tris: 4000, tex: 1024, reuse: { task: '01a0cab1-351e-71e9-8cf1-b3199353de10' } },
  { id: 'fv_barrel', cat: 'favela', size: 0.9, tris: 1500, tex: 512, reuse: { task: '01a0caa8-ce3a-73e2-8e74-6848b20c9fa6' } },
  { id: 'fv_gas_cylinder', cat: 'favela', size: 0.85, tris: 1500, tex: 512, reuse: { task: '01a0caa8-abe7-77d9-82db-bf56726335d5' } },
  { id: 'fv_water_tank', cat: 'favela', size: 1.6, tris: 1500, tex: 512, reuse: { preview: '01a0cab0-6522-721c-a328-c3a21dbe00fb' } },
  { id: 'fv_satellite', cat: 'favela', size: 1.2, tris: 1500, tex: 512, reuse: { preview: '01a0cab1-3f10-71ed-81b1-93cd006e4377' } },
  // stage 1: heroes
  f('fv_gondola_cabin', 2.8, 'small aerial cable car gondola cabin, boxy cabin with rounded corners and large windows on all sides, red and white painted metal body, curved hanger arm rising from the roof to a steel cable grip clamp, sliding doors, weathered paint', { scrub: 19 , tris: 4000, tex: 1024 }),
  f('fv_bullwheel', 5.0, 'cable car station drive machinery, a large horizontal steel bull wheel on a heavy steel frame, electric motor and gearbox underneath, yellow safety railings, grey and yellow industrial, weathered', { tris: 4000, tex: 1024 }),
  f('fv_transformer', 2.6, 'electrical substation power transformer, grey steel tank with rows of cooling radiator fins on the sides, three tall brown ceramic insulator bushings on top, yellow and black warning stripes on the base, rust streaks', { tris: 3500, tex: 1024 }),
  f('fv_bar_counter', 3.2, 'small neighbourhood snack bar counter, front clad in small blue and white square tiles, stainless steel top, glass display case with pastries, three tall metal bar stools in front, worn and lived in', { tris: 4000, tex: 1024 }),
  f('fv_fridge', 2.0, 'tall single glass-door drinks cooler fridge, white metal body, lit interior with shelves of colourful unlabeled glass bottles, chrome handle', { tris: 3000, tex: 512 }),
  f('fv_motorbike', 2.0, 'small 125cc street motorcycle parked on its side stand, red fuel tank, worn black seat, round headlight, chrome exhaust, mud splashes', { tris: 4000, tex: 1024 }),
  f('fv_wires', 3.0, 'dense tangled bundle of black electrical cables and wires hanging in sagging loops from a wooden crossarm, messy wire tangle with small junction boxes', { tris: 3000, tex: 512 }),
  f('fv_goal', 3.0, 'five-a-side football goal, white painted steel tube frame with a sagging torn white net, weathered paint, standing on the ground', { tris: 3000, tex: 512 }),
  f('fv_drums', 1.4, 'set of samba percussion drums, two large bass drums with polished metal shells and shoulder straps, a snare drum and a tambourine on the ground, colourful shells', { tris: 3000, tex: 512 }),
  f('fv_speakers', 1.8, 'stack of big black loudspeaker cabinets for an outdoor street party sound system, an amplifier on top, cables, worn corners', { tris: 1400, tex: 512 }),
  f('fv_costume_rack', 1.9, 'rolling metal clothes rail with colourful feathered carnival costumes and sequined fabric hanging from it, plumes and ribbons', { tris: 3000, tex: 512 }),
  f('fv_table_chairs', 1.4, 'white plastic outdoor table with four white plastic chairs stacked beside it, weathered', { tris: 1400, tex: 512 }),
  f('fv_water_tower', 9.0, 'tall neighbourhood water tower, a large blue cylindrical water tank on top of a concrete frame tower with four columns and cross beams, steel ladder up one side, rust and water stains', { tris: 5000, tex: 1024 }),
  // stage 2: themed machines (street-art reimaginings of the stock machines)
  f('perk_fv_lifeline', 2.0, 'tall glass-door drinks cooler fridge painted all over with pale blue and white abstract street art waves and bubbles, lit interior with blue glass bottles, chrome handle', { cat: 'favela', machine: 'lifeline' , retexture: 'white drinks fridge body hand-painted with pale blue and white abstract waves, bubbles and circles, glass door, clean chrome, no letters, no words, no text, no numbers, no logos, no signatures' , tris: 6000, tex: 1024 }),
  f('perk_fv_bulwark', 2.1, 'tall red drinks vending cooler covered in bold colourful street art graffiti shapes, a big shield shape painted on the front, glass window with rows of red bottles, chunky chrome trim', { machine: 'bulwark' , retexture: 'glossy red enamel vending cooler hand-painted with bold abstract street-art shapes, a big shield outline, circles, triangles and stripes in yellow, green and white, no letters, no words, no text, no numbers, no logos, no signatures' , tris: 6000, tex: 1024 }),
  f('perk_fv_quickhands', 2.0, 'slim lime green vending machine covered in colourful graffiti, zigzag lightning bolt shapes spray painted on it, narrow glass window with green bottles', { machine: 'quickhands' , retexture: 'lime green enamel vending machine hand-painted with abstract zigzag lightning shapes, stripes and dots in yellow, white and black, no letters, no words, no text, no numbers, no logos, no signatures' , tris: 6000, tex: 1024 }),
  f('perk_fv_hammerfall', 2.1, 'wide orange drink dispenser machine covered in bold stencil graffiti of hammer shapes, two round amber glass portholes showing orange bottles, stepped top', { machine: 'hammerfall' , retexture: 'orange enamel drink dispenser hand-painted with bold abstract stencil shapes of hammers, chevrons and dots in black and cream, brass trim, no letters, no words, no text, no numbers, no logos, no signatures' , tris: 6000, tex: 1024 }),
  f('fv_reforger', 2.4, 'large industrial cable winch machine converted into a weapon forge, heavy steel drum winch and a big gear wheel, glowing orange furnace slot in the middle, pipes and gauges, covered in colourful street art graffiti shapes', { machine: 'reforger' , retexture: 'heavy steel winch machine hand-painted with colourful abstract street-art shapes, circles, waves and stripes in magenta, cyan and yellow over dark steel, glowing orange furnace slot, no letters, no words, no text, no numbers, no logos, no signatures' , tris: 6000, tex: 1024 }),
  f('fv_mystery_box', 1.3, 'long closed wooden crate painted with colourful abstract street art shapes and stripes, glowing cyan seams along the lid, brass corner brackets', { machine: 'box', split: 'lid' , retexture: 'wooden crate hand-painted with colourful abstract geometric shapes, circles, triangles, stripes and waves in bright colours, brass corners, glowing cyan seams, no letters, no words, no text, no numbers, no logos, no signatures' , tris: 5000, tex: 1024 }),
];
export const ALL = [...WEAPONS, ...MACHINES, ...ZOMBIES, ...FAVELA];
