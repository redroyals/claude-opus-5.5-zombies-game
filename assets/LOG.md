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
