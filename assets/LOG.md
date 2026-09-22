# MP asset generation log (branch mp-assets)

Hard budget: **9000 Meshy credits** (raised from 6000 by the user; balance at start 10960 → hard floor 1960, script floor 2960 to keep 1000 headroom, enforced in `scripts/meshy-gen.mjs`).
Pipeline: `scripts/asset-manifest.mjs` (ids/prompts/sizes/refs) → `scripts/meshy-gen.mjs` (Meshy) → `assets/raw/` (gitignored)
→ `scripts/optimize-assets.mjs` (orient, scale, simplify, WebP, meshopt, LOD) → `assets/<cat>/`.

## Batches (balance before -> after)

- 2026-09-22T19:30:09.241Z batch `--ids k-ac-unit,k-dumpster,l-bench,smg_skiff,pi_magnus,eq_frag`: 6 assets, balance 10960 -> 10810 (spent 150)

- 2026-09-22T19:48:47.424Z batch `--ids r-barrel,r-gas-cylinder --model meshy-5 --conc 2`: 2 assets, balance 10810 -> 10380 (spent 430)
