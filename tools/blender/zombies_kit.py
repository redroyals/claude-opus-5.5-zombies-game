"""Procedural modular kit for the abandoned research-bunker zombies map + the power switch.
  blender -b --factory-startup -P tools/blender/zombies_kit.py -- --out public/models/zombies
Game coords (metres, +Y up, front = +Z). Every piece: base at y=0, centred on X, front face toward +Z.
Named child nodes for gameplay: kit_barricade_window -> plank_0..plank_5, kit_door -> door (pivot at hinge, x=-1.2),
power_switch -> lever (pivot at the hinge axle). Colliders live in extras.colliders of each mesh node."""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from lib import args, reset, material, Piece, g2b

A = args()
OUT = os.path.abspath(A.get('out', 'public/models/zombies'))

def mats():
    return dict(
        concrete=material('concrete', '#6f6c66', 0.95),
        concrete_dark=material('concrete_dark', '#4a4845', 0.95),
        paint=material('paint_green', '#4f5d4a', 0.7, 0.1),
        steel=material('steel', '#5c6166', 0.45, 0.85),
        rust=material('rust', '#6b3d22', 0.9, 0.4),
        wood=material('wood', '#7a5a3a', 0.85),
        wood_dark=material('wood_dark', '#553b24', 0.9),
        hazard=material('hazard_yellow', '#c9a227', 0.6),
        black=material('hazard_black', '#1b1b1b', 0.7),
        red=material('lever_red', '#9e1b16', 0.5, 0.2),
        lamp=material('lamp_amber', '#ffb347', 0.4, 0.0, emit='#ffb347'),
    )

def root(name):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    return e

def attach(ob, parent, pivot=(0, 0, 0)):
    """Parent ob under parent with its origin moved to pivot (game coords)."""
    p = Vector(g2b(pivot))
    ob.data.transform(__import__('mathutils').Matrix.Translation(-p))
    ob.location = p
    ob.parent = parent
    return ob

def save(name, objs):
    path = os.path.join(OUT, f'{name}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_yup=True)
    print('KIT', name)

def piece(name, fn):
    reset(); __import__("lib")._mats.clear(); M = mats(); objs = fn(M); save(name, objs)

def wall(M):  # 4 m wide, 3 m tall, 0.25 thick, with a painted lower band and a floor trim
    p = Piece('kit_wall')
    p.box(-2, 0, -0.125, 2, 3, 0.125, M['concrete'])
    p.box(-2, 0, 0.125, 2, 1.1, 0.14, M['paint'], collide=False)
    p.box(-2, 0, 0.14, 2, 0.12, 0.16, M['concrete_dark'], collide=False)
    p.box(-2, 2.7, 0.125, 2, 2.8, 0.2, M['rust'], collide=False)  # pipe bracket rail
    p.cyl((0, 2.86, 0.22), 'x', 4, 0.06, M['steel'])
    return [p.build()]

def wall_corner(M):
    p = Piece('kit_wall_corner')
    p.box(-0.3, 0, -0.3, 0.3, 3, 0.3, M['concrete_dark'])
    p.box(-0.32, 0, -0.32, 0.32, 0.12, 0.32, M['concrete'], collide=False)
    return [p.build()]

def floor(M):
    p = Piece('kit_floor')
    p.box(-2, -0.2, -2, 2, 0, 2, M['concrete'], floor=True)
    for i in (-1, 1):
        p.box(-2, 0, i * 1.0 - 0.05, 2, 0.005, i * 1.0 + 0.05, M['hazard'], collide=False)
    return [p.build()]

def door(M):  # frame opening 2.4 x 3 m in a 4 m wall; panel is a separate `door` node hinged at x=-1.2
    r = root('kit_door')
    f = Piece('frame')
    f.box(-2, 0, -0.125, -1.3, 3.3, 0.125, M['concrete'])
    f.box(1.3, 0, -0.125, 2, 3.3, 0.125, M['concrete'])
    f.box(-2, 3.1, -0.125, 2, 3.3, 0.125, M['concrete'])
    f.box(-1.3, 0, -0.16, -1.2, 3.1, 0.16, M['steel'])
    f.box(1.2, 0, -0.16, 1.3, 3.1, 0.16, M['steel'])
    f.box(-1.3, 3.0, -0.16, 1.3, 3.1, 0.16, M['steel'])
    for i in range(8):  # hazard chevrons on the lintel
        f.box(-1.2 + i * 0.3, 3.1, 0.126, -1.05 + i * 0.3, 3.3, 0.13, M['hazard'] if i % 2 else M['black'], collide=False)
    fo = f.build(); fo.parent = r
    d = Piece('door')
    d.box(-1.2, 0, -0.05, 1.2, 3.0, 0.05, M['paint'])
    d.box(-1.1, 1.2, 0.05, 1.1, 1.35, 0.07, M['steel'], collide=False)
    d.box(-1.2, 0, 0.05, 1.2, 0.3, 0.06, M['hazard'], collide=False)
    d.box(0.9, 1.3, 0.07, 1.05, 1.9, 0.12, M['steel'], collide=False)  # handle bar
    attach(d.build(), r, (-1.2, 0, 0))
    return [r] + list(r.children)

def barricade_window(M):  # window hole 1.6 x 1.2 at sill 0.9 in a 3 m wide wall; 6 planks separate
    r = root('kit_barricade_window')
    w = Piece('frame')
    w.box(-1.5, 0, -0.15, -0.8, 3, 0.15, M['concrete'])
    w.box(0.8, 0, -0.15, 1.5, 3, 0.15, M['concrete'])
    w.box(-0.8, 0, -0.15, 0.8, 0.9, 0.15, M['concrete'])
    w.box(-0.8, 2.1, -0.15, 0.8, 3, 0.15, M['concrete'])
    for (x0, y0, x1, y1) in [(-0.85, 0.85, 0.85, 0.9), (-0.85, 2.1, 0.85, 2.15), (-0.85, 0.85, -0.8, 2.15), (0.8, 0.85, 0.85, 2.15)]:
        w.box(x0, y0, -0.18, x1, y1, 0.18, M['rust'], collide=False)
    wo = w.build(); wo.parent = r
    for i in range(6):  # planks nailed on the outside face (+Z), alternating tilt
        y = 1.0 + i * 0.19
        pl = Piece(f'plank_{i}')
        pl.box(-0.95, -0.07, -0.025, 0.95, 0.07, 0.025, M['wood'] if i % 2 else M['wood_dark'])
        o = pl.build()
        o.location = Vector(g2b((0, y, 0.2)))
        o.rotation_euler = (0, (0.12 if i % 2 else -0.1), 0)  # tilt about game Z (blender -Y)
        o.parent = r
    return [r] + list(r.children)

def debris(M):  # rubble pile that blocks a 2.4 m door; buyable clear
    import random
    random.seed(7)
    p = Piece('kit_debris')
    p.box(-1.3, 0, -0.6, 1.3, 0.5, 0.6, M['concrete_dark'])
    for i in range(22):
        sx, sy, sz = random.uniform(0.25, 0.8), random.uniform(0.15, 0.5), random.uniform(0.25, 0.7)
        x, z = random.uniform(-1.1, 1.1), random.uniform(-0.5, 0.5)
        y = 0.3 + random.uniform(0, 1.4) * (1 - abs(x) / 1.4)
        p.box(x - sx / 2, y - sy / 2, z - sz / 2, x + sx / 2, y + sy / 2, z + sz / 2, random.choice([M['concrete'], M['concrete_dark'], M['wood'], M['rust']]), collide=False)
    p.box(-1.2, 0, -0.6, 1.2, 2.2, 0.6, M['concrete'], collide=True) if False else None
    p.colliders.append([-1.2, 0, -0.6, 1.2, 2.4, 0.6, 'concrete', False, True])
    for i in range(3):
        p.cyl((random.uniform(-0.8, 0.8), 1.0 + i * 0.3, random.uniform(-0.3, 0.3)), 'x', 2.2, 0.05, M['steel'])
    return [p.build()]

def stairs(M):  # 1.6 wide, rises 3 m over 4.5 m toward -Z, 15 steps, railing on +X
    p = Piece('kit_stairs')
    n = 15
    for i in range(n):
        y1 = (i + 1) * 3 / n
        z1 = -i * 4.5 / n
        p.box(-0.8, 0, z1 - 4.5 / n, 0.8, y1, z1, M['concrete'])
        p.box(-0.8, y1 - 0.02, z1 - 0.06, 0.8, y1 + 0.005, z1, M['hazard'], collide=False)
    p.prism([(0, 0.9), (-4.5, 3.9), (-4.5, 3.95), (0, 0.95)], 0.75, 0.8, M['steel'])
    for i in range(0, n, 4):
        z = -i * 4.5 / n - 0.1
        p.box(0.75, (i + 1) * 3 / n, z - 0.03, 0.8, (i + 1) * 3 / n + 0.9, z, M['steel'], collide=False)
    return [p.build()]

def catwalk(M):  # 4 m long (along Z) x 1.4 wide grated deck at y=0 (place at any height), rails both sides
    p = Piece('kit_catwalk')
    p.box(-0.7, -0.08, -2, 0.7, 0, 2, M['steel'])
    for i in range(16):
        z = -2 + i * 0.25
        p.box(-0.7, 0, z, 0.7, 0.01, z + 0.04, M['rust'], collide=False)
    for s in (-1, 1):
        x = 0.68 * s
        p.box(x - 0.025, 1.0, -2, x + 0.025, 1.05, 2, M['hazard'], collide=False)
        p.box(x - 0.02, 0.5, -2, x + 0.02, 0.53, 2, M['steel'], collide=False)
        for z in (-1.95, -0.65, 0.65, 1.95):
            p.box(x - 0.025, 0, z - 0.025, x + 0.025, 1.05, z + 0.025, M['steel'], collide=False)
        p.colliders.append([round(x - 0.03, 3), 0, -2, round(x + 0.03, 3), 1.05, 2, 'metal', False, True])
    p.box(-0.72, -0.25, -2, -0.66, -0.08, 2, M['steel'], collide=False)
    p.box(0.66, -0.25, -2, 0.72, -0.08, 2, M['steel'], collide=False)
    return [p.build()]

def power_switch(M):  # wall-mounted breaker panel, lever node pivots about game X at (0, 1.2, 0.22); up = off
    r = root('power_switch')
    b = Piece('panel')
    b.box(-0.6, 0.4, -0.05, 0.6, 2.0, 0.2, M['paint'])
    b.box(-0.55, 1.75, 0.2, 0.55, 1.95, 0.21, M['hazard'], collide=False)
    b.box(-0.4, 0.55, 0.2, 0.4, 0.75, 0.22, M['black'], collide=False)
    b.box(-0.15, 1.1, 0.2, 0.15, 1.3, 0.3, M['steel'], collide=False)  # hinge block
    b.cyl((0.45, 1.55, 0.22), 'z', 0.06, 0.07, M['lamp'])
    for s in (-1, 1):
        b.box(0.5 * s - 0.04, 0.3, -0.05, 0.5 * s + 0.04, 2.1, 0.0, M['steel'], collide=False)
    b.cyl((0.0, 2.2, 0.05), 'y', 0.4, 0.05, M['steel'])  # conduit
    bo = b.build(); bo.parent = r
    l = Piece('lever')
    l.cyl((0, 1.2, 0.27), 'x', 0.36, 0.04, M['steel'])
    l.box(-0.03, 1.2, 0.25, 0.03, 1.65, 0.3, M['steel'])
    l.box(-0.12, 1.62, 0.23, 0.12, 1.72, 0.33, M['red'])
    attach(l.build(), r, (0, 1.2, 0.27))
    return [r] + list(r.children)

os.makedirs(OUT, exist_ok=True)
for name, fn in [('kit_wall', wall), ('kit_wall_corner', wall_corner), ('kit_floor', floor), ('kit_door', door), ('kit_barricade_window', barricade_window),
                 ('kit_debris', debris), ('kit_stairs', stairs), ('kit_catwalk', catwalk), ('power_switch', power_switch)]:
    piece(name, fn)
