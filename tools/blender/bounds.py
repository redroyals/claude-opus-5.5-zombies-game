"""Print skinned (evaluated) world bounds per object: blender -b --factory-startup -P tools/blender/bounds.py -- file.glb"""
import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.context.scene.objects:
    print('OBJ', o.name, o.type, tuple(round(x, 3) for x in o.matrix_world.to_scale()))
    if o.type == 'MESH':
        e = o.evaluated_get(dg); m = e.to_mesh(); zs = sorted((e.matrix_world @ v.co).z for v in m.vertices); n = len(zs)
        print('OBJ  z pct', [round(zs[int(n * q)], 3) for q in (0, 0.01, 0.5, 0.99)], round(zs[-1], 3), n)
