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
| `turnaround.py` | Parametric blockouts (weapons/props) and orthographic silhouette renders (side/front/top/three_quarter, white bg) for Meshy image-to-3d. |
| `postprocess.py` | Meshy GLB → apply transforms, orient (weapons: barrel -Z, origin at grip; props: base at y=0 centred), scale to manifest size, merge-by-distance, decimate to a triangle budget, named material slots (`body` = camo-able), attachment mount empties (`mount_optic`, `mount_muzzle`, `mount_under`, `mount_mag`, `mount_stock`, `socket_grip`), LOD1, GLB export. Texture compression (WebP) + meshopt runs afterwards in `scripts/optimize-assets.mjs` (gltf-transform). |
| `lib.py` | shared helpers (scene reset, box/prism builders, UV box projection, materials, export). |
