// Lahore-themed model paths for machines that the pacing layer adds to the map def (branch zpacing): extra perk
// cabinets, the naft-cauldron workbench and its parts, and the fire-pit trap. Art only: positions, costs and rules
// live in def.ts. Wire them in as `machines.perks[id] = { model, foot }`, `buildables[i].model`,
// `buildables[i].parts[j].model` and `traps[i].model`.
export const LAHORE_MODELS = {
  perks: {
    nova: { model: 'lahore/la_perk_nova.glb', foot: [0.75, 0.6] as [number, number] },
    strider: { model: 'lahore/la_perk_strider.glb', foot: [0.75, 0.6] as [number, number] },
    hawkeye: { model: 'lahore/la_perk_hawkeye.glb', foot: [0.85, 0.85] as [number, number] },
  },
  /** Armourer's workbench (1.8 x 1.0 m, 1.1 m tall). */
  bench: 'lahore/la_bench.glb',
  /** Naft-cauldron parts: bronze bowl, leather bellows, sealed jar of naft. */
  parts: { bowl: 'lahore/la_part_bowl.glb', bellows: 'lahore/la_part_bellows.glb', naftJar: 'lahore/la_part_naft_jar.glb' },
  /** Stone fire-pit trough with an iron grate and a brass valve wheel (2.3 x 2.6 m). */
  firePit: 'lahore/la_fire_pit.glb',
} as const;
