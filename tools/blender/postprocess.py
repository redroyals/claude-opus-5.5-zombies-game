"""Meshy GLB -> game-ready GLB (+ LOD1) with orientation, scale, decimation, named material slots and mount empties.
  blender -b --factory-startup -P tools/blender/postprocess.py -- --in raw.glb --out work.glb --cat weapons --size 0.84
        --tris 7000 [--lod1 work.lod1.glb] [--frame frame.json] [--cls ar]
Game coordinates: +Y up, weapon barrel along -Z, origin at the grip hand point (see assets/weapons/frames.json).
Blender works Z-up: game (x, y, z) == blender (x, -z, y), so game -Z (barrel) == blender +Y."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
import numpy as np
from mathutils import Matrix, Vector
from lib import args, reset

A = args()
cat, size, tris = A['cat'], float(A['size']), int(A.get('tris', 8000))
reset()
bpy.ops.import_scene.gltf(filepath=os.path.abspath(A['in']))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
for o in list(bpy.context.scene.objects):
    if o is not ob:
        bpy.data.objects.remove(o)
ob.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = ob.data


def verts():
    a = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def xform(M):
    me.transform(M)
    me.update()


# clean: merge coincident verts (UVs live on loops, so seams survive), drop loose geometry
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(me); bm.free()

frame = {}
V = verts()
mn, mx = V.min(0), V.max(0)
if cat in ('weapons', 'attachments'):
    ext = mx - mn
    L = 0 if ext[0] >= ext[1] else 1  # long horizontal axis (blender X or Y); Z is up
    lo, hi = mn[L], mx[L]; ln = hi - lo

    O = 1 - L  # lateral axis

    def slice_h(a, b):  # bbox area (lateral x vertical) of an end slice: barrels are small in both, stocks are not
        s = V[(V[:, L] >= a) & (V[:, L] <= b)]
        return ((s[:, 2].max() - s[:, 2].min()) * (s[:, O].max() - s[:, O].min())) if len(s) else 0
    hLo, hHi = slice_h(lo, lo + 0.05 * ln), slice_h(hi - 0.05 * ln, hi)
    if A.get('flip'):
        hLo, hHi = hHi, hLo
    muzzle_pos = hHi <= hLo
    # rotate so that the muzzle end points to blender +Y (= game -Z)
    ang = {(0, True): math.pi / 2, (0, False): -math.pi / 2, (1, True): 0.0, (1, False): math.pi}[(L, bool(muzzle_pos))]
    xform(Matrix.Rotation(ang, 4, 'Z'))
    V = verts(); mn, mx = V.min(0), V.max(0); ln = mx[1] - mn[1]
    # grip: protrusions below the barrel line in the rear 15..70% (from the stock end = min Y). Pistol grips and
    # magazines both hang down; take the REARMOST slice at least 45% as deep as the deepest one (the magazine sits in
    # front of the grip), or the FRONTMOST for bullpups (--bullpup) where the magazine is behind the grip.
    front = V[V[:, 1] >= mx[1] - 0.2 * ln]
    ref = front[:, 2].min() if len(front) else mn[2]
    N = 40; w = ln / N
    prof = []
    for k in range(N):
        a = mn[1] + k * w
        sl = V[(V[:, 1] >= a) & (V[:, 1] <= a + w)]
        prof.append(ref - sl[:, 2].min() if len(sl) else 0.0)
    peaks = []
    for k in range(int(0.1 * N), int(0.8 * N)):
        if prof[k] > 0 and prof[k] >= prof[k - 1] and prof[k] >= prof[k + 1]:
            j0 = k
            while j0 > 0 and prof[j0 - 1] >= 0.6 * prof[k]: j0 -= 1
            j1 = k
            while j1 < N - 1 and prof[j1 + 1] >= 0.6 * prof[k]: j1 += 1
            if (j1 - j0 + 1) <= 0.3 * N and not any(abs(p[0] - k) < 2 for p in peaks):
                peaks.append((k, prof[k]))
    deep = max((p[1] for p in peaks), default=0)
    ok = [p for p in peaks if p[1] >= 0.3 * deep]
    # ok is ordered stock -> muzzle. Conventional layout: magazine = frontmost deep spike, grip = the spike right
    # behind it (stock toes/butts sit further back). Bullpups: the grip is the frontmost spike.
    pick = (ok[-1] if A.get('bullpup') or len(ok) < 2 else ok[-2]) if ok else None
    if A.get('cls') == 'pistol':  # the grip IS the rear end: deepest slice in the rear 45%
        k = max(range(int(0.45 * N)), key=lambda i: prof[i]); pick = (k, prof[k])
    if A.get('grip'):  # manual override: fraction of length from the stock end
        k = min(N - 1, int(float(A['grip']) * N)); pick = (k, prof[k])
    best = (mn[1] + (pick[0] + 0.5) * w, ref - pick[1]) if pick else None
    frame_note = 'override' if A.get('grip') else 'pistol-rear' if A.get('cls') == 'pistol' else 'bullpup' if A.get('bullpup') else 'spike-behind-magazine'
    melee = A.get('cls') in ('melee', 'special_melee') or cat == 'attachments'
    if melee or best is None:
        grip = Vector((0, mn[1] + 0.15 * ln, (mn[2] + mx[2]) / 2))
    else:
        grip = Vector((0, best[0], best[1] + 0.3 * (mx[2] - best[1])))
    s = size / ln
    xform(Matrix.Scale(s, 4) @ Matrix.Translation(-grip))
    V = verts(); mn, mx = V.min(0), V.max(0); ln = mx[1] - mn[1]
    tip = V[V[:, 1] >= mx[1] - 0.03 * ln]
    muzzle = Vector(((tip[:, 0].min() + tip[:, 0].max()) / 2, mx[1], (tip[:, 2].min() + tip[:, 2].max()) / 2))

    def top_at(y0, y1):
        s = V[(V[:, 1] >= y0) & (V[:, 1] <= y1)]
        return s[:, 2].max() if len(s) else mx[2]

    def bot_at(y0, y1):
        s = V[(V[:, 1] >= y0) & (V[:, 1] <= y1)]
        return s[:, 2].min() if len(s) else mn[2]
    mounts = {
        'socket_grip': Vector((0, 0, 0)),
        'mount_muzzle': muzzle,
        'mount_optic': Vector((0, 0.35 * mx[1], top_at(0.1 * mx[1], 0.6 * mx[1]))),
        'mount_under': Vector((0, 0.65 * mx[1], bot_at(0.55 * mx[1], 0.75 * mx[1]))),
        'mount_mag': Vector((0, 0.18 * mx[1], bot_at(0.08 * mx[1], 0.3 * mx[1]))),
        'mount_stock': Vector((0, mn[1], (mn[2] + mx[2]) / 2)),
    }
    if cat == 'attachments':
        mounts = {'mount_base': Vector((0, (mn[1] + mx[1]) / 2, mn[2])), 'mount_front': Vector((0, mx[1], (mn[2] + mx[2]) / 2))}
    g = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]  # blender -> game
    frame = {'length': size, 'sourceAxis': 'xy'[L], 'muzzleEndThinner': bool(muzzle_pos), 'gripRule': frame_note if cat == 'weapons' else None, 'confidence': 'high' if abs(hHi - hLo) / max(hHi, hLo, 1e-9) > 0.25 else 'low',
             'mounts': {k: g(v) for k, v in mounts.items()}}
    for k, v in mounts.items():
        e = bpy.data.objects.new(k, None); e.empty_display_size = 0.02; e.location = v
        bpy.context.scene.collection.objects.link(e); e.parent = ob
else:
    ext = mx - mn
    s = size / ext[2] if cat == 'characters' else size / max(ext)
    c = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]))
    xform(Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    V = verts(); frame = {'size': [round(float(x), 3) for x in (V.max(0) - V.min(0))]}

# material slots: the Meshy texture set becomes the single camo-able 'body' slot (a mask split needs per-part UVs)
for i, m in enumerate(me.materials):
    if m:
        m.name = 'body' if i == 0 else f'body_{i}'


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def decimate(o, target):
    t = tri_count(o)
    if t > target:
        mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = target / t
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)


decimate(ob, tris)
frame['tris'] = tri_count(ob)
ob.name = A.get('name', 'model')
os.makedirs(os.path.dirname(os.path.abspath(A['out'])), exist_ok=True)


def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format='GLB', use_selection=True, export_extras=True, export_yup=True, export_image_format='AUTO')


export(A['out'])
if A.get('lod1'):
    decimate(ob, max(300, frame['tris'] // 4))
    export(A['lod1'])
if A.get('frame'):
    with open(A['frame'], 'w') as fh:
        json.dump(frame, fh)
print('POST', json.dumps(frame))
