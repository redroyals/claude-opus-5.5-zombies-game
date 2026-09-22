"""Headless review render: one GLB -> PNG (3/4 view + side view, workbench, textured).
  blender -b --factory-startup -P tools/blender/thumb.py -- --in a.glb --out a.png [--frame 0.5]
--frame N: for animated GLBs, set every action to that fraction of its length (the first action is used)."""
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from lib import args, reset

A = args(); reset()
bpy.ops.import_scene.gltf(filepath=os.path.abspath(A['in']))
sc = bpy.context.scene
if A.get('action'):
    act = next((a for a in bpy.data.actions if a.name.startswith(A['action'])), None)
    print('ACTIONS', [a.name for a in bpy.data.actions])
    for o in sc.objects:
        if act and o.type == 'ARMATURE':
            o.animation_data_create(); o.animation_data.action = act
            r = act.frame_range
            sc.frame_set(int(r[0] + (r[1] - r[0]) * float(A.get('frame', 0.5))))
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); pts = []
for o in sc.objects:
    if o.type == 'MESH':
        e = o.evaluated_get(dg); me = e.to_mesh()
        pts += [e.matrix_world @ v.co for v in list(me.vertices)[::7]]; e.to_mesh_clear()
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
c = (mn + mx) / 2; r = (mx - mn).length / 2
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
sc.display.shading.show_cavity = True
sc.render.resolution_x, sc.render.resolution_y = 640, 480
sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.8, 0.8, 0.8)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = r * 2.3
view = A.get('view', '34')
d = {'34': Vector((1, -1.3, 0.6)), 'side': Vector((1, 0, 0.05)), 'front': Vector((0, -1, 0.1))}[view].normalized()
cam.location = c + d * r * 4
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = os.path.abspath(A['out'])
bpy.ops.render.render(write_still=True)
print('SIZE', [round(x, 3) for x in (mx - mn)], 'MIN', [round(x, 3) for x in mn])
