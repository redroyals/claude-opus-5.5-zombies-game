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
- Favela ledger after stage 2 + retextures: **710 / 1,200**. public/models/favela = 11 MB.
