// Single source of truth for every generated MP asset: id, category, Meshy prompt, target size, optional
// GPT reference folder (/home/workstation/pi5-1tb/meshy-refs/<refCat>/<refId>/{front,side,back,three_quarter}.png).
// Consumed by scripts/meshy-gen.mjs, scripts/optimize-assets.mjs and (as assets/manifest.json) gallery/maps viewers.
const W = 'original video game firearm design, not a copy of any real model, no text, no logos, no markings, matte polymer and anodised metal, subtle edge wear, stylised realistic, isolated, side profile silhouette readable';
const w = (id, cls, name, len, desc, ref) => ({ id, cat: 'weapons', cls, name, size: len, prompt: `${desc}, ${W}`, ref: ref ? ['weapons', ref] : null, polycount: 8000 });

export const WEAPONS = [
  w('ar_kestrel', 'ar', 'KR-7 Kestrel', 0.84, 'modern modular carbine assault rifle, flat-top rail, slim ribbed handguard, collapsible stock, curved magazine, black', 'ar-standard'),
  w('ar_vanta', 'ar', 'Vanta 556', 0.76, 'bullpup assault rifle with a long integrated carry handle over the receiver, magazine behind the pistol grip, dark grey'),
  w('ar_halden', 'ar', 'Halden AR', 0.95, 'polymer assault rifle with a tall integrated carry handle optic, skeletonised folding stock, translucent magazine, dark green-grey'),
  w('ar_corvid', 'ar', 'Corvid-47', 0.88, 'heavy-calibre assault rifle, long ribbed handguard, steel curved banana magazine, wood-look polymer stock and handguard, gas tube over barrel', 'ar-heavy'),
  w('ar_tern', 'ar', 'Tern Compact', 0.72, 'compact bullpup assault rifle, rounded smooth shell, magazine behind the grip, integrated optic tube, sand-coloured polymer', 'ar-bullpup'),
  w('ar_moraine', 'ar', 'Moraine SCR', 0.98, 'battle rifle, angular upper receiver with long top rail, folding side stock, straight 20-round magazine, long free-float handguard, tan and black', 'br-marksman'),
  w('ar_ashlar', 'ar', 'Ashlar Burst', 1.0, 'classic long burst-fire rifle, triangular handguard, fixed full stock, carry handle rear sight, black'),
  w('ar_quill', 'ar', 'Quill 300', 0.74, 'short carbine with a fat integrally suppressed barrel shroud, folding stock, short magazine, charcoal'),
  w('smg_wren', 'smg', 'Wren 9', 0.66, 'compact boxy submachine gun, straight magazine, extended folding wire stock, short barrel shroud, black', 'smg-compact'),
  w('smg_skiff', 'smg', 'Skiff MX', 0.54, 'tiny personal defence weapon, long grip-inserted magazine, retractable stock extended, top rail, angular polymer body'),
  w('smg_pallas', 'smg', 'Pallas V', 0.62, 'futuristic submachine gun with a drop-down angled lower receiver and offset recoil block, straight magazine, folding stock, grey'),
  w('smg_ledger', 'smg', 'Ledger 45', 0.69, 'boxy polymer submachine gun, straight wide magazine, side folding stock, short rail, black'),
  w('smg_bramble', 'smg', 'Bramble', 0.47, 'compact stamped-steel machine pistol, magazine through the pistol grip, folded stock, blued metal'),
  w('smg_fennec', 'smg', 'Fennec PDW', 0.51, 'futuristic bullpup PDW with a top-mounted horizontal translucent magazine along the receiver, thumbhole grip, smooth rounded shell, olive', 'smg-bullpup'),
  w('smg_drum', 'smg', 'Drummond 1928', 0.85, 'vintage submachine gun, finned barrel, front vertical wooden grip, round drum magazine, wooden stock, blued steel'),
  w('lmg_bastion', 'lmg', 'Bastion 249', 1.04, 'belt-fed light machine gun, box magazine under the receiver, carry handle, folded bipod, ribbed stock', 'lmg-belt'),
  w('lmg_ironclad', 'lmg', 'Ironclad 60', 1.1, 'heavy belt-fed general purpose machine gun, long barrel with bipod, ammo belt, fixed stock, olive and black'),
  w('lmg_hauler', 'lmg', 'Hauler RPD', 1.03, 'drum-fed light machine gun, round drum under the receiver, wooden stock and handguard, long barrel, bipod'),
  w('lmg_grist', 'lmg', 'Grist MG', 1.2, 'vintage belt-fed machine gun with a perforated cooling barrel jacket, slim stock, bipod, dark steel'),
  w('sg_hullbreaker', 'shotgun', 'HB-12 Hullbreaker', 1.0, 'pump-action shotgun, tube magazine, ribbed pump forend, pistol-grip stock, black', 'shotgun-pump'),
  w('sg_tidal', 'shotgun', 'Tidal Auto', 1.01, 'semi-auto combat shotgun with a box magazine, top rail, angular modern receiver, collapsible stock', 'shotgun-auto'),
  w('sg_twinbore', 'shotgun', 'Twinbore', 1.05, 'double-barrel side-by-side shotgun, walnut wooden stock and forend, blued steel barrels'),
  w('sg_striker', 'shotgun', 'Striker Drum', 0.79, 'compact combat shotgun with a large rotary drum cylinder, folding stock, front grip, black'),
  w('sg_lever', 'shotgun', 'Ranger Lever', 0.98, 'lever-action shotgun, large loop lever, wooden stock, long tube magazine, blued steel'),
  w('dmr_sentry', 'marksman', 'Sentry 14', 1.12, 'semi-auto designated marksman rifle in a modern aluminium chassis, long fluted barrel, adjustable cheek riser, 10-round magazine', 'marksman-dmr'),
  w('dmr_lancet', 'marksman', 'Lancet SVD', 1.22, 'long slim marksman rifle, skeleton thumbhole wooden stock, long barrel with slotted flash hider, short magazine'),
  w('dmr_heron', 'marksman', 'Heron Semi', 0.94, 'light semi-auto ranch carbine, wooden stock, short straight magazine, exposed receiver, stainless'),
  w('dmr_ember', 'marksman', 'Ember Lever', 0.96, 'lever-action rifle, octagonal barrel, tube magazine, walnut stock, brass receiver'),
  w('sr_longwatch', 'sniper', 'Longwatch .308', 1.12, 'bolt-action sniper rifle, chassis stock, long fluted barrel with a muzzle brake, bare top rail no scope', 'sniper-bolt'),
  w('sr_farcry', 'sniper', 'Farcall .50', 1.45, 'huge anti-materiel semi-auto rifle, large rectangular muzzle brake, heavy barrel, bipod, box magazine, no scope'),
  w('sr_quietus', 'sniper', 'Quietus', 0.9, 'compact bullpup semi-auto sniper rifle, wooden thumbhole stock, integrated rail, heavy barrel'),
  w('sr_aurochs', 'sniper', 'Aurochs AX', 1.25, 'modern bolt-action long-range rifle, folding skeleton chassis stock, long handguard, big muzzle brake, dark earth'),
  w('pi_warden', 'pistol', 'P-19 Warden', 0.19, 'compact striker-fired service pistol, slab-sided slide with angled serrations, black polymer frame', 'pistol-standard'),
  w('pi_magnus', 'pistol', 'Magnus .44', 0.3, 'heavy six-shot revolver, long barrel with top rib, rubber grip, stainless steel'),
  w('pi_basalt', 'pistol', 'Basalt .50', 0.27, 'large-bore heavy semi-auto hand cannon, long squared slide, chunky profile, gunmetal', 'pistol-heavy'),
  w('pi_flicker', 'pistol', 'Flicker MP', 0.2, 'full-auto machine pistol with an extended magazine and compensator, polymer frame'),
  w('pi_spur', 'pistol', 'Spur 1911', 0.22, 'classic single-stack steel pistol with hammer, grip safety and wooden grip panels'),
  w('pi_duet', 'pistol', 'Duet Burst', 0.24, 'burst pistol with folding front grip under the frame, extended magazine, compensator, black'),
  w('ln_lotus', 'launcher', 'Lotus RL', 0.95, 'shoulder-fired rocket launcher tube with a loaded pointed warhead, front grip, flip-up iron sight, olive drab', 'launcher-rocket'),
  w('ln_mallard', 'launcher', 'Mallard 40', 0.64, 'break-open single-shot grenade launcher, fat short barrel, folding stock, black'),
  w('ln_tracer', 'launcher', 'Tracer AA', 1.5, 'long shoulder-fired guided missile tube with a boxy seeker sight unit and grip, olive'),
  { ...w('sp_kukri', 'melee', 'Field Kukri', 0.45, 'forward-curved kukri machete knife, black blade, wooden handle, no text'), prompt: 'forward-curved kukri machete knife, black coated blade, textured wooden handle, original game prop, no text, no logos' },
  { ...w('sp_hatchet', 'melee', 'Breach Hatchet', 0.4, ''), prompt: 'tactical breaching hatchet axe, black steel head with spike, wrapped polymer handle, original game prop, no text, no logos' },
  w('sp_crossbow', 'special', 'Quarrel Crossbow', 0.8, 'compact modern crossbow, recurve limbs, rail, loaded bolt, black and olive'),
  { ...w('sp_riot', 'special', 'Aegis Shield', 1.0, ''), prompt: 'handheld ballistic riot shield, curved dark grey panel with a small rectangular viewport window, no text no markings, game prop', polycount: 5000 },
  { ...w('sp_knife', 'melee', 'Combat Knife', 0.3, '', 'melee-knife'), prompt: 'tactical combat knife, black clip-point blade, textured rubber handle, original game prop, no text, no logos' },
];

const A = 'original firearm attachment, isolated, not mounted, matte black anodised aluminium and polymer, no text, no markings, game asset';
const att = (id, len, desc, ref) => ({ id, cat: 'attachments', size: len, prompt: `${desc}, ${A}`, ref: ['attachments', ref], polycount: 4000 });
export const ATTACHMENTS = [
  att('att_red_dot', 0.07, 'small open reflex red-dot sight on a low rail mount', 'red-dot'),
  att('att_holo', 0.1, 'boxy holographic sight with a rectangular window and a hood', 'holo'),
  att('att_scope_4x', 0.27, 'mid-length 4x rifle scope on a one-piece cantilever mount', 'scope-4x'),
  att('att_suppressor', 0.18, 'cylindrical subtly faceted suppressor', 'suppressor'),
  att('att_foregrip', 0.1, 'vertical foregrip with finger grooves and a rail clamp', 'foregrip'),
  att('att_ext_mag', 0.3, 'extended curved rifle magazine with a translucent polymer window', 'ext-mag'),
  att('att_laser', 0.09, 'compact rail-mounted laser and light module', 'laser'),
  att('att_bipod', 0.25, 'folding bipod with legs deployed downward and rail clamp on top', 'bipod'),
];
const E = 'original game prop, stylised realistic, no text, no markings';
export const EQUIPMENT = [
  { id: 'eq_frag', cat: 'equipment', size: 0.11, prompt: `round fragmentation hand grenade with pull ring and spoon lever, olive, ${E}`, polycount: 3000 },
  { id: 'eq_flash', cat: 'equipment', size: 0.14, prompt: `cylindrical flashbang stun grenade with perforated body and pull ring, black, ${E}`, polycount: 3000 },
  { id: 'eq_smoke', cat: 'equipment', size: 0.15, prompt: `cylindrical smoke grenade canister with pull ring, grey with a teal band, ${E}`, polycount: 3000 },
  { id: 'eq_semtex', cat: 'equipment', size: 0.12, prompt: `sticky plastic explosive charge puck with a small timer module, ${E}`, polycount: 3000 },
  { id: 'eq_claymore', cat: 'equipment', size: 0.23, prompt: `curved directional anti-personnel mine on folding scissor legs, olive, ${E}`, polycount: 3000 },
  { id: 'eq_throwing_knife', cat: 'equipment', size: 0.24, prompt: `black balanced throwing knife, skeletonised handle, ${E}`, polycount: 2000 },
  { id: 'eq_medkit', cat: 'equipment', size: 0.3, prompt: `compact soft trauma medical pouch kit, grey with a teal zip, no cross symbol, ${E}`, polycount: 3000 },
  { id: 'eq_ammo_box', cat: 'equipment', size: 0.35, prompt: `metal ammunition can with latch lid, olive drab, ${E}`, polycount: 3000 },
];

const OP = 'full-body original tactical operator game character, completely faceless full-face matte ballistic mask with smooth dark visor band, balaclava hood, no skin visible, modern plate carrier, pouches, gloves, knee pads, boots, holding nothing, strict A-pose, no insignia, no flags, no logos, no text';
const op = (id, name, desc, ref) => ({ id, cat: 'characters', name, size: 1.8, prompt: `${OP}, ${desc}`, ref: ['operators', ref], polycount: 20000, rig: true });
export const CHARACTERS = [
  op('op_team_a', 'Team A (teal)', 'cool slate-grey and black kit with small teal accent strips on the shoulders and visor edge', 'team-a-base'),
  op('op_team_b', 'Team B (orange)', 'sand and tan kit with brown webbing, small signal orange accents on the shoulders and visor edge', 'team-b-base'),
  op('op_urban', 'Cosmetic: Urban', 'charcoal hoodie under a slim carrier, cargo trousers, streetwear tactical, grey mask', 'cosmetic-urban'),
  op('op_arctic', 'Cosmetic: Arctic', 'white and light grey cold-weather parka shell, hood, frosted visor', 'cosmetic-arctic'),
  op('op_heavy', 'Cosmetic: Heavy', 'bulky heavy armour, thick ceramic plates, helmet with full visor, very broad silhouette', 'cosmetic-heavy'),
  op('op_recon', 'Cosmetic: Recon', 'lightweight ghillie-style shoulder wrap in muted green, minimal gear, lean silhouette', 'cosmetic-recon'),
];

const K = 'single isolated environment prop for a multiplayer game map, game-ready, stylised realistic PBR, believable wear, no text, no signage lettering, no logos, no people, no ground';
const kp = (map, id, size, desc, ref) => ({ id, cat: 'kits', map, size, prompt: `${desc}, ${K}`, ref: ref ? ['maps', ref] : null, polycount: 6000 });
export const KITS = [
  // Kowloon Stacks — muted concrete + neon magenta accent
  kp('kowloon', 'k-water-tank', 5, 'rooftop cylindrical steel water tank on a raised steel frame with a ladder, rust streaks', 'kowloon-water-tank'),
  kp('kowloon', 'k-ac-unit', 0.9, 'single wall-mounted air conditioner outdoor unit on a steel bracket, grimy white'),
  kp('kowloon', 'k-ac-cluster', 2.4, 'wall-mounted cluster of six stacked air-conditioner units with pipes and brackets', 'kowloon-ac-cluster'),
  kp('kowloon', 'k-balcony-cage', 2.2, 'steel window security cage balcony enclosure with plant pots and hanging laundry, Hong Kong tenement style'),
  kp('kowloon', 'k-stair-metal', 5, 'two-storey steel fire-escape stair section with landing and railing', 'kowloon-fire-escape'),
  kp('kowloon', 'k-storefront-shutter', 4, 'narrow shop front with a half-open corrugated roller shutter, tiled pillars, blank awning with no letters'),
  kp('kowloon', 'k-market-stall', 3, 'street market stall with a folding metal table, tarp canopy and plastic crates', 'kowloon-market-stall'),
  kp('kowloon', 'k-fish-tank-stall', 2.4, 'wet market seafood stall with glass fish tanks, aerator hoses and styrofoam boxes'),
  kp('kowloon', 'k-neon-frame', 3, 'empty neon sign frame with magenta and cyan tube outlines forming abstract shapes only, no letters', 'kowloon-neon-frame'),
  kp('kowloon', 'k-walkway-bridge', 8, 'narrow steel footbridge walkway section with mesh floor and railings and hanging cables'),
  kp('kowloon', 'k-pipe-bundle', 6, 'vertical bundle of drain pipes and electrical conduits with brackets running up a wall'),
  kp('kowloon', 'k-laundry-pole', 4, 'bamboo laundry drying poles sticking out from a window with hanging clothes'),
  kp('kowloon', 'k-antenna-mast', 5, 'rooftop TV antenna mast cluster with guy wires'),
  kp('kowloon', 'k-crate-stack', 1.6, 'stack of wooden shipping crates strapped together'),
  kp('kowloon', 'k-plastic-crates', 1.2, 'stack of colourful plastic market crates, faded red and blue'),
  kp('kowloon', 'k-dumpster', 2, 'dented green metal dumpster bin with lid'),
  kp('kowloon', 'k-ladder', 3, 'steel caged rooftop access ladder section'),
  kp('kowloon', 'k-rooftop-shack', 3.2, 'small corrugated metal rooftop shack with door and window'),
  kp('kowloon', 'k-scaffold-bamboo', 6, 'bamboo scaffolding section lashed with ties and green netting'),
  kp('kowloon', 'k-gas-cylinders', 1.2, 'group of three steel gas cylinders chained to a rack'),
  // Lisbon Tram Hill — warm stone, terracotta, azulejo blue; accent tram yellow
  kp('lisbon', 'l-tram', 11, 'vintage yellow single-car hillside tram with wooden window frames, no text or numbers', 'lisbon-tram'),
  kp('lisbon', 'l-tram-stop-shelter', 3, 'small wrought-iron tram stop shelter with a glass roof'),
  kp('lisbon', 'l-facade', 8, 'three-storey building facade section with blue and white patterned azulejo tiles and wrought-iron balconies', 'lisbon-facade'),
  kp('lisbon', 'l-balcony-iron', 2, 'small wrought-iron balcony with plant pots and a louvered wooden door'),
  kp('lisbon', 'l-kiosk', 3, 'green ornate street kiosk with a small awning', 'lisbon-kiosk'),
  kp('lisbon', 'l-stairs', 5, 'steep cobbled stone staircase section with an iron handrail', 'lisbon-stairs'),
  kp('lisbon', 'l-terracotta-roof', 7, 'pitched terracotta tile roof section with gutters'),
  kp('lisbon', 'l-chimney', 1.8, 'whitewashed rooftop chimney with a small tiled cap'),
  kp('lisbon', 'l-water-tank', 1.4, 'small rooftop water tank on a metal stand'),
  kp('lisbon', 'l-ac-unit', 0.9, 'wall-mounted air conditioner unit on a bracket, beige'),
  kp('lisbon', 'l-laundry-line', 4, 'laundry line strung between two iron brackets with hanging colourful clothes'),
  kp('lisbon', 'l-street-lamp', 3.5, 'ornate cast iron street lamp post with a lantern'),
  kp('lisbon', 'l-bench', 2, 'wooden slat park bench with cast iron legs'),
  kp('lisbon', 'l-cafe-table-set', 1.4, 'small round cafe table with two metal chairs and a parasol'),
  kp('lisbon', 'l-planter', 1.8, 'long stone planter box with bougainvillea flowers'),
  kp('lisbon', 'l-crates', 1.6, 'stack of wooden fruit crates with oranges'),
  kp('lisbon', 'l-wooden-door-arch', 3, 'old arched wooden double door set in a limestone frame'),
  kp('lisbon', 'l-cistern-column', 8.7, 'stone vaulted cistern column with arch springers, damp limestone'),
  kp('lisbon', 'l-funicular-winch', 3, 'old funicular winch engine with large cable drum, gears and iron frame'),
  kp('lisbon', 'l-miradouro-railing', 8, 'viewpoint stone balustrade railing section with iron lamp'),
  // Rio Favela Ridge — exposed brick, grey concrete; accent teal paint
  kp('rio', 'r-house-block', 8, 'stacked three-level brick and concrete favela house block, exposed brick, one wall painted teal, flat roof', 'rio-house-block'),
  kp('rio', 'r-water-tank', 1.6, 'blue plastic rooftop water tank on a small concrete stand', 'rio-water-tank'),
  kp('rio', 'r-satellite', 1.5, 'rooftop satellite dish on a pole mount with cable', 'rio-satellite'),
  kp('rio', 'r-concrete-stairs', 4, 'hillside concrete stair and landing section with a painted metal railing', 'rio-concrete-stairs'),
  kp('rio', 'r-slab-roof', 6, 'flat concrete roof slab section with protruding rebar, parapet and a drain spout'),
  kp('rio', 'r-rebar-column', 2.5, 'unfinished concrete column stub with rusty rebar sticking out'),
  kp('rio', 'r-ac-unit', 0.9, 'window air conditioner unit, dirty white, on a bracket'),
  kp('rio', 'r-storefront-roller', 3.5, 'small shop front with a painted metal roller door, blank, no letters'),
  kp('rio', 'r-power-pole-tangle', 8, 'concrete utility pole with a messy tangle of electrical wires and transformer'),
  kp('rio', 'r-laundry-line', 4, 'clothes line with colourful hanging laundry between two metal poles'),
  kp('rio', 'r-corrugated-shack', 3, 'small shack of corrugated metal sheets and plywood with a door'),
  kp('rio', 'r-crates', 1.4, 'stack of plastic beverage crates, weathered'),
  kp('rio', 'r-motorbike', 2, 'small commuter motorbike, dusty, no logos, no number plate'),
  kp('rio', 'r-drain-grate-tunnel', 4, 'concrete storm drain tunnel entrance with a rusty broken grate'),
  kp('rio', 'r-plastic-chairs', 1.2, 'stack of white plastic chairs next to a plastic table'),
  kp('rio', 'r-barrel', 1, 'rusty blue steel oil drum barrel'),
  kp('rio', 'r-gas-cylinder', 0.8, 'orange domestic gas cylinder'),
  kp('rio', 'r-cinderblock-wall', 5, 'low cinderblock wall section with exposed mortar and graffiti-free grey paint'),
];

export const ALL = [...WEAPONS, ...ATTACHMENTS, ...EQUIPMENT, ...CHARACTERS, ...KITS];
