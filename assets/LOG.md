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
