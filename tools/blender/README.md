# Blender tooling (headless)

Blender is not packaged for linux-arm64 by blender.org, so it is installed user-locally from the Ubuntu noble
`blender` 4.0.2 arm64 .deb (+ its runtime libs) extracted into `~/opt/blender-deb/root`, with a wrapper at
`~/opt/blender/blender` (sets LD_LIBRARY_PATH, script/datafile paths and a numpy<2 PYTHONPATH). No sudo needed.
Rebuild steps are in `install-blender-arm64.sh`.

All scripts run as `~/opt/blender/blender -b --factory-startup -P tools/blender/<script>.py -- <args>`
(or via `BLENDER=... node scripts/...`). Coordinates: Blender Z-up is exported by the glTF exporter as +Y up.

| script | purpose |
|---|---|
| `kit_modular.py` | Grid-snapped modular structure kit per map (walls, door/window walls, floors, stairs, ramps, ladders, door/window frames, railings, pillars, parapets, awnings, vents...). Box-projected world-scale UVs (1 UV = 1 m), per-map palette materials, collision proxy boxes in glTF `extras.colliders` + `assets/kits/<map>/colliders.json`. |
| `lahore_kit.py` | Modular architecture kit for the 1830s Lahore Fort / old-Lahore-haveli map (Mughal/Sikh-era): cusped-arch bays, chamfered columns + spans, chhatris, an onion dome, a curved bangla roof, a jharokha balcony, a pierced jaali screen, kangura battlements, an octagonal burj bastion, door/window frames, a carved wood balcony/rails/pillar, a fountain, a stepped cistern, a ladder, a Basant kite, Sheesh Mahal mirror-work (panel + medallion), and a baradari roof with corner chhatris -- 23 pieces total, `public/models/lahore/kit_*.glb`. No textures: 10 named material slots (`stone`/`trim`/`plaster`/`wood`/`woodPaint`/`metal`/`iron`/`mirror`/`cloth`/`paper`) the game re-textures at runtime. Box-projected world-scale UVs at 1 UV = 2 m (`Piece(..., uv_scale=0.5)`, a `lib.py` addition, default 1.0 elsewhere). Compress with `scripts/compress-lahore-kit.mjs`. `lib.py` gained two generic primitives for this kit -- `Piece.lathe()` (surface of revolution around +Y, for domes/columns/finials) and `Piece.obox()` (an arbitrary-oriented box, for radially-placed panels) -- plus a hand-rolled `annulus()` helper local to this script for true 360 degree rings (mirror-work), since `Piece.prism()`'s single-polygon technique only closes correctly on an *open* arc, not a full circle. |
| `turnaround.py` | Parametric blockouts (weapons/props) and orthographic silhouette renders (side/front/top/three_quarter, white bg) for Meshy image-to-3d. |
| `postprocess.py` | Meshy GLB → apply transforms, orient (weapons: barrel -Z, origin at grip; props: base at y=0 centred), scale to manifest size, merge-by-distance, decimate to a triangle budget, named material slots (`body` = camo-able), attachment mount empties (`mount_optic`, `mount_muzzle`, `mount_under`, `mount_mag`, `mount_stock`, `socket_grip`), LOD1, GLB export. Texture compression (WebP) + meshopt runs afterwards in `scripts/optimize-assets.mjs` (gltf-transform). |
| `lib.py` | shared helpers (scene reset, box/prism builders, UV box projection, materials, export). |
