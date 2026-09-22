"""Split a chest mesh into `body` + `lid` (faces whose centroid is above --frac of the height), lid pivot at the
rear-top hinge edge (game -Z side), both parented under a root named after the file. Game: +Y up, front +Z."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix
from lib import args, reset
A = args(); reset()
bpy.ops.import_scene.gltf(filepath=os.path.abspath(A['in']))
ob = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
ob.parent = None
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
zs = [v.co.z for v in ob.data.vertices]; lo, hi = min(zs), max(zs); cut = lo + float(A.get('frac', 0.74)) * (hi - lo)
bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(ob.data)
for f in bm.faces: f.select = f.calc_center_median().z > cut
bmesh.update_edit_mesh(ob.data); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
lid = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o is not ob][0]
ob.name = 'body'; lid.name = 'lid'
ys = [v.co.y for v in lid.data.vertices]  # blender +Y == game -Z (rear)
hinge = Vector((0, max(ys), cut))
lid.data.transform(Matrix.Translation(-hinge)); lid.location = hinge
root = bpy.data.objects.new(os.path.splitext(os.path.basename(A['out']))[0], None); bpy.context.scene.collection.objects.link(root)
ob.parent = root; lid.parent = root
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.abspath(A['out']), export_format='GLB', use_selection=True, export_yup=True)
print('SPLIT lid hinge', tuple(round(x, 3) for x in hinge))
