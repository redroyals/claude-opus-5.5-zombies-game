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
import { LAHORE } from './lahore-assets.mjs';
export const ALL = [...WEAPONS, ...MACHINES, ...ZOMBIES, ...LAHORE];
