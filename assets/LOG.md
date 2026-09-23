# Zombies asset log

Meshy start balance 9570 (2026-09-22). Budget: spend <= 4000, script floor 5800 (hard floor 5590).

- 2026-09-22T20:02:47.837Z batch `--ids ww_arc,perk_bulwark,z_shambler --conc 3`: 3 assets, balance 9570 -> 9480 (spent 90); tasks: ww_arc=01a0cab4-aaad-775b-a9a6-1cdf9beab1de/01a0cab5-7dc1-7403-9c05-eaa50c702a30:ok, perk_bulwark=01a0cab4-aaa5-702f-8d50-b6facacd4f23/01a0cab5-c267-71ca-aaf3-5f1f49f6e618:ok, z_shambler=01a0cab4-ab20-74de-9766-4fdd7662f44d/01a0cab5-9fe5-719f-a711-df254547f17f:ok

- 2026-09-22T20:11:21.570Z batch `--conc 6`: 15 assets, balance 9480 -> 9030 (spent 450); tasks: ww_singularity=01a0cab8-6c78-734a-b704-e469bd27fd17/01a0cab9-60e6-7780-a2eb-7e0f1b32daa6:ok, ww_cryo=01a0cab8-6c79-746f-995b-677e01922efc/01a0cab9-6130-728a-a449-4fad675e3fa1:ok, perk_quickhands=01a0cab8-6cfb-74f8-99f2-d1de3e5b87aa/01a0cab9-3fcf-74bb-a45f-8153a3310924:ok, perk_hammerfall=01a0cab8-6cf2-776a-9d9a-82a29dab53da/01a0cab9-a3c4-76ca-9bd7-517b51791a85:ok, perk_lifeline=01a0cab8-6d5f-71b5-b72b-1a700609a480/01a0cab9-c722-773c-8f45-fd9da4613c87:ok, reforger=01a0cab8-6d69-72b8-9ad7-f167edf1edbe/01a0cab9-8293-747c-9616-fa033f31681d:ok, generator=01a0caba-356f-7584-8587-47fa3b0eb60f/01a0cabb-8c69-7473-9fb8-ac241b8fa5af:ok, lab_table=01a0caba-5868-746f-9c62-463fd6e96ffe/01a0cabb-2750-75b9-8319-7307cc2f0430:ok, filing_cabinets=01a0caba-7818-7362-b844-9bd6cadb9689/01a0cabb-af6a-75b7-a422-af79e99bb511:ok, lamp=01a0caba-b736-7171-8b83-453572f3c976/01a0cabb-adcd-748c-9f6e-59f650ecfad8:ok, z_runner=01a0caba-b611-72f7-a609-4b3639f57e86/01a0cabb-ae3f-7445-9fee-64a6b7a10d0f:ok, z_brute=01a0caba-b7fb-7142-84ca-f0211b1b027d/01a0cabb-aed1-759f-999c-35abfd424ec1:ok, z_crawler=01a0cabb-d972-7237-ae07-62a825905918/01a0cabc-cda2-723a-86f2-6443d75058d6:ok, z_fast=01a0cabc-5a8a-7225-a816-1311ae781bd7/01a0cabd-54b6-726a-b8da-958688b5b74f:ok, z_boss=01a0cabc-5d53-755c-9da2-47b76d3facac/01a0cabd-b9db-71b9-bf91-ceef95e75e83:ok

- 2026-09-22T20:13:46.830Z rig+animate z_shambler(rig 01a0cabf-7dd7-736f-827f-a29b58f493ba, anim 01a0cac0-374f-70f0-b04c-227e474f4f71: ok); balance 9030 -> 9010 (spent 20)

- 2026-09-22T20:16:52.089Z rig+animate z_runner(rig 01a0cac0-e4c1-7526-8adb-d3cd70d37fa2, anim 01a0cac1-fe2e-7224-a8fd-42df97083dc7: ok), z_brute(rig 01a0cac0-e4cc-7585-a1d9-29810252e930, anim 01a0cac2-830f-7350-b44e-778bfe1d7e06: ok), z_crawler(rig 01a0cac0-e537-74ba-acee-42bcc032c092, anim 01a0cac1-975c-77c5-a9c1-c6a2dcf06df2: ok), z_fast(rig 01a0cac0-e537-74bc-bb09-37b18dbbc1da, anim 01a0cac1-b5b3-70fa-a247-94604a4210f1: ok), z_boss(rig 01a0cac0-e5bc-71da-a397-5f131a412c1f, anim 01a0cac3-0a72-73f9-b56b-558cb18ee150: ok); balance 9010 -> 8913 (spent 97)

- 2026-09-22T20:17:52.338Z batch `--ids lab_table --force 1 --conc 1`: 1 assets, balance 8913 -> 8913 (spent 0); tasks: lab_table=01a0caba-5868-746f-9c62-463fd6e96ffe/01a0cabb-2750-75b9-8319-7307cc2f0430:ok

- 2026-09-22T20:19:48.896Z batch `--ids lab_table --conc 1`: 1 assets, balance 8913 -> 8883 (spent 30); tasks: lab_table=01a0cac4-a3db-7131-909d-9889054723b2/01a0cac5-787d-72e1-bdc5-0054375c116a:ok

## Summary
- Balance 9570 -> 8883 (spent 687 of 4000). Text-to-3d = 30/asset; rig + multi-action animation ~20/zombie.
- lab_table v1 was a bare pipe frame (Meshy failure, kept in gen-state as lab_table_v1); regenerated once.
- 17 guns+knife reused from mp-assets raw; pi_basalt needed flip (assets/weapons/frames.override.json).
- Zombies: /v1/rigging + /v1/animations action_ids (scripts/clips.mjs); renamed in scripts/optimize-zombies.mjs.
- Kit + power switch: tools/blender/zombies_kit.py. Mystery box = sample split into body+lid (tools/blender/split_lid.py).
- Review renders: scripts/review-sheet.mjs (Blender workbench).

- 2026-09-23T11:31:33.974Z batch `--cat favela --ids fv_house_block,fv_barrel,fv_gas_cylinder,fv_water_tank,fv_satellite --conc 5`: 5 assets, balance 8883 -> 8863 (spent 20); tasks: fv_house_block=/01a0cab1-351e-71e9-8cf1-b3199353de10:ok, fv_barrel=/01a0caa8-ce3a-73e2-8e74-6848b20c9fa6:ok, fv_gas_cylinder=/01a0caa8-abe7-77d9-82db-bf56726335d5:ok, fv_water_tank=01a0cab0-6522-721c-a328-c3a21dbe00fb/01a0ce07-a952-74a2-b476-546740705352:ok, fv_satellite=01a0cab1-3f10-71ed-81b1-93cd006e4377/01a0ce07-a94e-75cc-bcc2-cb1aee645a9a:ok

- 2026-09-23T11:38:05.626Z batch `--cat favela --ids fv_gondola_cabin,fv_bullwheel,fv_transformer,fv_bar_counter,fv_fridge,fv_motorbike,fv_wires,fv_goal,fv_drums,fv_speakers,fv_costume_rack,fv_table_chairs,fv_water_tower --conc 7`: 13 assets, balance 8863 -> 8193 (spent 670); tasks: fv_gondola_cabin=01a0ce09-1e71-73b1-98e9-d8ff40072783/01a0ce0a-502e-7579-aee7-abbcd450b703:ok, fv_bullwheel=01a0ce09-1f85-707a-a3a5-d82d591387c2/01a0ce0a-70d7-7410-8430-da4c832759da:ok, fv_transformer=01a0ce09-1e71-77b0-912b-073d1942b876/01a0ce0a-f47e-7541-8a6e-35521449f019:ok, fv_bar_counter=01a0ce09-1e73-718b-b601-6ddaeb5eb053/01a0ce0a-7166-771b-b1a5-475af192f283:ok, fv_fridge=01a0ce09-1f84-7629-a659-0a789451872d/01a0ce0a-7114-7087-a429-be1f63eb78da:ok, fv_motorbike=01a0ce09-1e72-734f-a647-a8fe2321703f/01a0ce0a-4fa9-745b-8be2-ca1cad6ff225:ok, fv_wires=01a0ce09-1e75-74b8-96ae-1b167c77dff2/01a0ce0a-4ee5-745f-b9d6-cafdcdd18bc7:ok, fv_goal=01a0ce0b-3991-7157-836a-cdd571b76b97/01a0ce0c-870c-71af-8a20-b6635d6c65d6:ok, fv_drums=01a0ce0b-3995-741a-8f5c-b561536de528/01a0ce0c-42bf-7604-8d8f-5c0ce9a346de:ok, fv_speakers=01a0ce0b-3a81-7002-bd58-a4eb3ef809bc/01a0ce0c-641b-7114-a036-accd58996edf:ok, fv_costume_rack=01a0ce0b-599e-76e7-9f4e-42886f4f3d97/01a0ce0d-e2c3-7782-abbf-b0d778243e9d:ok, fv_table_chairs=01a0ce0b-790d-73fe-b22f-7845ae6af3a2/01a0ce0c-85f2-7772-a00d-90ee360b55bb:ok, fv_water_tower=01a0ce0b-7b55-71ad-a7ac-bd2ffc337448/01a0ce0c-8590-72fd-af81-add5be1607dd:ok

- 2026-09-23T11:47:52.689Z retexture `perk_fv_bulwark`: balance 7683 -> 7623 (shared account; favela ledger now 600); tasks: perk_fv_bulwark=01a0ce17-4018-7473-b646-b447ae75c243:ok

- 2026-09-23T11:49:13.767Z retexture `perk_fv_lifeline,perk_fv_quickhands,perk_fv_hammerfall,fv_reforger,fv_mystery_box`: balance 7613 -> 7503 (shared account; favela ledger now 710); tasks: perk_fv_lifeline=01a0ce18-4180-74a9-8727-64a6cb96e1b1:ok, perk_fv_quickhands=01a0ce18-4075-7034-9e5b-7cd893e915ca:ok, perk_fv_hammerfall=01a0ce18-4072-72b4-9d4d-44dec22b97d1:ok, fv_reforger=01a0ce18-4070-7242-959d-c528698c605c:ok, fv_mystery_box=01a0ce18-4072-74bc-9215-8c15e7d3b506:ok

- 2026-09-23T11:43Z batch `--cat favela --ids perk_fv_lifeline,...,fv_mystery_box --conc 6` (stage 2, favela machines; the runner's final balance call hit a DNS blip so this line is written by hand): 6 assets, 180 credits; tasks: perk_fv_lifeline=01a0ce0f-0eda-70dd-b8b0-e976cbd0de9e/01a0ce10-1dc4-767d-ae3f-fa7ffb55c9aa:ok, perk_fv_bulwark=01a0ce0f-0dcb-71b3-90d0-b5f4b91db258/01a0ce11-0518-749c-ab91-1a354e503639:ok, perk_fv_quickhands=01a0ce0f-0dce-7685-963a-e00703b89831/01a0ce10-e321-767f-89c6-2815c2dc1091:ok, perk_fv_hammerfall=01a0ce0f-0dce-7687-8b89-6c5b374f0625/01a0ce10-1da9-739c-a788-82e498285179:ok, fv_reforger=01a0ce0f-0edd-7695-807a-dc55e55a43f2/01a0ce10-a13b-71aa-b269-db8c8e4ab98c:ok, fv_mystery_box=01a0ce0f-0dce-7673-a687-131f69fdc3a7/01a0ce10-3ebd-7737-8964-f448d05584a1:ok

## Map: Rio · Ridgelight (favela, branch map-favela)
- Cap 1,200 credits for this map (global floor: no new task below 5,400). Ledger = sum of `spent` for cat=favela in gen-state.json
  (preview 20 + refine 10 per text asset, refine-only 10, retexture logged at 20). Account balance is shared with other map agents,
  so the balance deltas above over-count this map.
- Reused from mp-assets (fetched by finished task id, 0 credits): r-house-block, r-barrel, r-gas-cylinder. Refined the finished
  r-water-tank / r-satellite previews (10 each).
- Stage 1 (13 heroes, 390): gondola cabin, bull wheel, transformer, bar counter, fridge, motorbike, wire bundle, goal, drums,
  speakers, costume rack, table+chairs, water tower. Gondola cabin texture had Meshy pseudo-lettering -> `scripts/scrub-text.mjs`
  (median filter on base colour, manifest `scrub`).
- Stage 2 (6 machines, 180): "graffiti" prompts came back with lettering ("PBR", tags) -> all six retextured
  (`scripts/meshy-retexture.mjs`, letter-free abstract-shapes prompts, 6 x 20 logged). Lesson: never say graffiti/tag in a prompt.
- Blender kit (0 credits): `tools/blender/favela_kit.py` -> 23 pieces (6 background houses, pole, lamps, floodlight, pylon, ladder,
  railing, tin roof, rebar, grille, kite, laundry, 3 murals-as-geometry, station canopy, goal frame), meshopt via
  `node scripts/compress-kit.mjs --dir public/models/favela`.
- Favela ledger after stage 2 + retextures: **710 / 1,200**. public/models/favela = 9.1 MB (48 GLBs incl. 12 LOD1 twins).

- 2026-09-23 (zcore) no Meshy spend. Crawler legless variant = collapse the GLB leg chains at runtime (LeftUpLeg/RightUpLeg
  scale 0) instead of a new asset. Zombie distance LODs generated locally: `node scripts/zombie-lods.mjs` ->
  public/models/zombies/z_*_lod1.glb (geometry-only, meshopt simplify error 0.06: ~14.5k -> ~6.2k tris; boss 11.2k).

- 2026-09-23T11:34:46.173Z batch `--map lahore --ids box_casket,perk_bulwark_lh,chandelier,armour_stand --conc 4`: 4 assets, balance 8723 -> 8413 (spent 310); tasks: box_casket=01a0ce09-383e-7398-97da-54b0fa068419/01a0ce0a-abc9-718e-85ee-ce1723945a52:ok, perk_bulwark_lh=01a0ce09-3841-76ff-a84e-32631052ddf8/01a0ce0a-48b5-7629-bd8c-ea0ced8f7a6a:ok, chandelier=01a0ce09-3953-7618-bddc-3cd6c42109f3/01a0ce0a-492e-7714-b4fe-5c5554176ffa:ok, armour_stand=01a0ce09-3842-7061-90b6-b1bdf68791b0/01a0ce0b-0e4f-7512-864b-20378b76da1c:ok

- 2026-09-23T11:50:27.260Z batch `--map lahore --conc 6`: 14 assets, balance 7823 -> 7483 (spent 340); tasks: weapon_rack=01a0ce0f-402a-7578-bcd9-a9d31bc74f36/01a0ce11-06e2-71bc-ac7e-e9179de0283b:ok, chest_gold=01a0ce0f-966e-76f3-aff3-f00f61d9160a/01a0ce11-6a26-7777-bf44-68b3bcc60379:ok, strongboxes=01a0ce0f-c312-74e7-a7c0-462ee32a97fc/01a0ce11-6a7a-75e1-9e1b-b049e5cbfef8:ok, pedestal=01a0ce10-7aba-72ae-91d4-42640a944470/01a0ce11-48b7-764c-a940-d7d5d484400d:ok, great_gun=01a0ce11-af7e-710a-8a35-44a62e5b9fcc/01a0ce15-e27d-734f-8553-6bf4cf02a441:ok, cannonballs=01a0ce15-e165-706d-abb9-c03025b3f4dc/01a0ce18-182a-7299-804b-96dea4df1792:ok, pipal_tree=01a0ce15-fb92-76bf-a8bf-be7a049c0664/01a0ce18-dd8e-7624-83d1-11a98d000a94:ok, charpai=01a0ce15-fc81-713d-89b3-2556b5e7c54a/01a0ce17-f74b-73e4-ad2f-dcdf9b4ca1ab:ok, matka_pots=01a0ce15-fb81-728e-8a5a-bfdfa1e99804/01a0ce16-fd70-77b5-abd9-0fdcf2970c13:ok, well=01a0ce15-fd9e-758b-8be1-395629b4c841/01a0ce17-73a5-7272-94df-78f76b6bf57f:ok, haveli_door=01a0ce16-b5b0-7353-bfce-406c768f9894/01a0ce17-b56b-77e4-9f4e-137de3e05528:ok, palki=01a0ce17-ce04-75d3-97e3-b6344fe79b72/01a0ce19-11f7-74de-8444-e3aa59347cf0:ok, chai_stall=01a0ce18-3c6d-779c-9896-5dae2e3ed62e/01a0ce19-53ce-72c4-83cd-133a266586e7:ok, spice_stall=01a0ce18-7df1-7486-ac85-424f90493b61/01a0ce19-9591-7507-905e-abcbc0031749:ok

- 2026-09-23 batch `--map lahore --conc 6` (first run, crashed on a DNS error after 7 assets; resumed by the batch above, no task was re-bought): perk_quickhands_lh, perk_hammerfall_lh, perk_lifeline_lh, forge_pap, naqqara, torch_bracket, throne_dais, all ok.

## Lahore Darbar (map-lahore branch)
- Cap 1,800 credits, own floor 7,083 (start 8,883), global hard floor 5,400.
- 25 text-to-3d assets x 30 = **750 credits** (stage 1: 4 test assets, render-checked; stage 2: 21). The balance deltas in the
  lines above are larger because other agents were generating in parallel against the same account.
- Reused from sikhi.io (copied): brass-vase, hanging-lantern, area-rug, sikh-cannon, kohinoor-gem (an armlet), flag-ranjit-singh.
  Skipped: flag-khalsa (religious standard), burj-tower (a pole), candle-holder, lotus-blossom.
- Review sheets: /tmp/lahore-shots/assets/{reuse,s1,s2a,s2b,kit}.png (Blender workbench).
- Notes: torch_bracket came out as a wall lantern (kept); charpai is a carved takht (kept); pedestal reads Greco-Roman,
  and naqqara reads as dhol barrels. Both are candidates for a re-roll if the budget allows. The pipal tree renders dark in workbench (metallic).

## Rio · Ridgelight art pass (branch favela-art, 2026-09-23)
- **Meshy: 0 credits spent.** Balance read-only check 7,483 at start (above the 5,000 floor; this pass had a 900 cap).
  The first generation call (`node scripts/meshy-gen.mjs --cat favela --ids fv_hh_brick,fv_hill_cluster,fv_granite_peak,fv_banana --conc 4`,
  4 x 30 = 120 credits, stage-1 render check) was refused by the session's permission policy before any task was
  created, so nothing was bought and the whole pass is procedural (Blender + canvas textures). The queued prompts, if
  the spend is approved later (add them to the FAVELA list with `art: 1`, run with MESHY_CAP_FAVELA=1610):
  - fv_hh_brick (9.5 m): three-storey self-built hillside house, exposed orange clay brick with thick grey mortar,
    concrete columns and slab edges, unfinished top floor with rusty rebar, ground floor partly rendered turquoise,
    iron window grilles, a balcony with a steel railing, a blue water tank, facade facing forward.
  - fv_hill_cluster (24 m): dense cluster of ~20 small colourful stacked houses up a steep hillside, flat roofs with
    blue tanks, brick and pastel render, many small dark windows, compact wide block.
  - fv_granite_peak (backdrop): a single rounded granite dome rising from the sea, bare cliffs with dark water streaks,
    forest on the lower slopes (generic, not a landmark copy).
  - fv_banana (4 m), then stage 2: painted two-storey shopfront house, narrow four-storey house with peeling render,
    samba carnival float (feathers/sequins, no symbols), market fruit stall, snack cart with umbrella, substation
    gantry, station hall, bougainvillea planter, potted plants, palm, mango tree, scooter.
- Instead, 0 credits: Blender kit v2 (`tools/blender/favela_houses.py`, `favela_dress.py`): 14 houses + 14 LOD1 shells,
  16 dressing pieces, new pole and street lamp; `scripts/compress-kit.mjs --keep-uv` (the kit had shipped with its UVs
  pruned). Reused (copied, no API) nothing: mp-assets `k-ac-cluster` / `l-bench` were considered but the procedural
  bench and per-window AC units read better at this scale.
- Deleted from public: fv_house_a..f (v1 houses) and fv_house_block (unused Meshy reuse). public/models/favela: 9.1 MB -> 10.3 MB.
