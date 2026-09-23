"""Procedural kit for the Rio favela Zombies map "Ridgelight" (docs/maps/favela.md §10).
  blender -b --factory-startup -P tools/blender/favela_kit.py -- --out public/models/favela [--only fv_house_a,...]
Game coords (metres, +Y up, front = +Z). Every piece: base at y=0, centred on X/Z unless noted.
Materials are named `fv_*`: the game swaps them for shared, textured MeshStandardMaterials at load
(src/zombies/maps/favelaMaterials.ts), so GLBs stay tiny and every instance shares one material.
`fv_plaster` / `fv_plaster2` are tinted per instance (instanceColor) for the painted-house variety.
Colliders (game coords) live in extras.colliders of each mesh node; background houses carry one bbox box."""
import sys, os, math, json, random
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from lib import args, reset, material, Piece, g2b

A = args()
OUT = os.path.abspath(A.get('out', 'public/models/favela'))
ONLY = set(A['only'].split(',')) if 'only' in A else None


def mats():
    return dict(
        brick=material('fv_brick', '#b5643c', 0.95),
        concrete=material('fv_concrete', '#8e8b85', 0.95),
        concrete_dark=material('fv_concrete_dark', '#5e5c58', 0.95),
        plaster=material('fv_plaster', '#e2dccf', 0.92),
        plaster2=material('fv_plaster2', '#d8d2c4', 0.92),
        win=material('fv_window_dark', '#161b21', 0.3, 0.2),
        lit=material('fv_window_lit', '#ffb866', 0.5, 0.0, emit='#ffb060'),
        steel=material('fv_steel', '#4f5458', 0.5, 0.8),
        rust=material('fv_rust', '#7a4a2e', 0.9, 0.3),
        tin=material('fv_tin', '#9aa0a3', 0.7, 0.6),
        wood=material('fv_wood', '#7a5a3a', 0.9),
        tank=material('fv_tank_blue', '#2a6fb0', 0.6),
        white=material('fv_paint_white', '#e8e6e0', 0.7),
        bulb=material('fv_bulb', '#ffd28a', 0.4, 0.0, emit='#ffc070'),
        sodium=material('fv_sodium', '#ffae4a', 0.4, 0.0, emit='#ff9a30'),
        red=material('fv_paint_red', '#b3261e', 0.6),
        yellow=material('fv_paint_yellow', '#e2b21c', 0.6),
        black=material('fv_rubber', '#161616', 0.9),
    )


MURAL = {  # vivid, flat-lit street-art palette (not tinted at runtime)
    'm_orange': '#f26a1b', 'm_pink': '#e8327a', 'm_teal': '#12a89a', 'm_yellow': '#f5c518', 'm_blue': '#1f5fc8',
    'm_green': '#3cb043', 'm_purple': '#7b3fa0', 'm_white': '#f2efe8', 'm_black': '#1a1a1a', 'm_sky': '#56c2e6',
}


def mural_mats():
    return {k: material(f'fv_{k}', v, 0.8) for k, v in MURAL.items()}


def save(name, objs):
    path = os.path.join(OUT, f'{name}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_yup=True)
    print('KIT', name)


def root(name):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    return e


class P(Piece):
    """Piece + single-sided quads (for windows/decals) and a cheap cylinder."""

    def quad(self, corners, mat):
        vs = [self.bm.verts.new(g2b(c)) for c in corners]
        self.bm.faces.new(vs).material_index = self._mi(mat)
        return self

    def zquad(self, x0, y0, x1, y1, z, mat, back=False):  # facing +Z (or -Z with back)
        c = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
        return self.quad(list(reversed(c)) if back else c, mat)

    def xquad(self, z0, y0, z1, y1, x, mat, neg=False):  # facing +X (or -X)
        c = [(x, y0, z1), (x, y0, z0), (x, y1, z0), (x, y1, z1)]
        return self.quad(list(reversed(c)) if neg else c, mat)


# ------------------------------------------------------------------------------------------------
# Background houses. Concrete frame (columns + ring beams) with brick or painted-plaster infill,
# windows as inset dark/lit quads with sills and grilles, flat laje roof with rebar stubs.
# ------------------------------------------------------------------------------------------------
STOREY = 3.0


def house(name, w, d, storeys, seed, *, plaster_floors=(), lit=(), tank=True, balcony=None, tinroof=False,
          rebar=True, side_windows=True, stair=False, parapet=True):
    rnd = random.Random(seed)
    M = mats()
    p = P(name)
    H = storeys * STOREY
    hw, hd = w / 2, d / 2
    col = 0.13
    # infill walls per storey (so a storey can be plaster or brick)
    for s in range(storeys):
        y0, y1 = s * STOREY, (s + 1) * STOREY - 0.25
        mat = M['plaster'] if s in plaster_floors else M['brick']
        p.box(-hw + col, y0, -hd + col, hw - col, y1, hd - col, mat, collide=False)
        # ring beam
        p.box(-hw, y1, -hd, hw, (s + 1) * STOREY, hd, M['concrete'], collide=False)
    for sx in (-1, 1):  # columns
        for sz in (-1, 1):
            p.box(sx * hw - col, 0, sz * hd - col, sx * hw + col, H, sz * hd + col, M['concrete'], collide=False)
            if rebar and not tinroof:
                for k in range(4):
                    ox, oz = (k % 2 - 0.5) * 0.12, (k // 2 - 0.5) * 0.12
                    x, z = sx * (hw - 0.06) + ox, sz * (hd - 0.06) + oz
                    p.box(x - 0.012, H, z - 0.012, x + 0.012, H + 0.45 + rnd.random() * 0.3, z + 0.012, M['rust'], collide=False)
    # roof
    if tinroof:
        p.prism([(-hd - 0.3, H), (hd + 0.3, H + 0.5), (hd + 0.3, H + 0.56), (-hd - 0.3, H + 0.06)], -hw - 0.2, hw + 0.2, M['tin'], across='x')
    elif parapet:
        t = 0.12
        for (x0, z0, x1, z1) in [(-hw, -hd, hw, -hd + t), (-hw, hd - t, hw, hd), (-hw, -hd, -hw + t, hd), (hw - t, -hd, hw, hd)]:
            p.box(x0, H, z0, x1, H + 0.55, z1, M['concrete_dark'], collide=False)
    # windows / door on the front (+Z) and sides
    def front_windows(s, z, back=False):
        n = max(1, int(w // 2.2))
        for i in range(n):
            cx = -hw + (i + 0.5) * w / n + rnd.uniform(-0.2, 0.2)
            if s == 0 and i == n // 2:  # door
                p.zquad(cx - 0.45, 0, cx + 0.45, 2.1, z + (-0.01 if back else 0.01), M['wood'] if rnd.random() < 0.6 else M['steel'], back)
                continue
            ww, wh = rnd.choice([(0.9, 1.0), (1.2, 1.1), (0.7, 0.9)])
            y0 = s * STOREY + 1.0
            m = M['lit'] if (s, i) in lit or (rnd.random() < 0.18) else M['win']
            dz = -0.01 if back else 0.01
            p.zquad(cx - ww / 2, y0, cx + ww / 2, y0 + wh, z + dz, m, back)
            p.box(cx - ww / 2 - 0.06, y0 - 0.08, z - 0.06 if not back else z - 0.12, cx + ww / 2 + 0.06, y0, z + 0.12 if not back else z + 0.06, M['concrete'], collide=False)
            if rnd.random() < 0.5:  # grille bars
                for b in range(4):
                    bx = cx - ww / 2 + (b + 0.5) * ww / 4
                    zz = z + (0.05 if not back else -0.05)
                    p.box(bx - 0.012, y0, zz - 0.012, bx + 0.012, y0 + wh, zz + 0.012, M['steel'], collide=False)
    for s in range(storeys):
        front_windows(s, hd - col)
        if rnd.random() < 0.5:
            front_windows(s, -hd + col, back=True)
        if side_windows and rnd.random() < 0.6:
            y0 = s * STOREY + 1.0
            zc = rnd.uniform(-hd * 0.4, hd * 0.4)
            sx = rnd.choice((-1, 1))
            m = M['lit'] if rnd.random() < 0.2 else M['win']
            p.xquad(zc - 0.45, y0, zc + 0.45, y0 + 1.0, sx * (hw - col + 0.01), m, neg=sx < 0)
    if balcony is not None:
        s = balcony
        y = s * STOREY
        p.box(-hw + 0.3, y - 0.18, hd, hw - 0.3, y, hd + 1.1, M['concrete'], collide=False)
        p.box(-hw + 0.3, y, hd + 1.05, hw - 0.3, y + 0.95, hd + 1.1, M['steel'] if rnd.random() < 0.5 else M['concrete_dark'], collide=False)
    if tank and not tinroof:
        tx, tz = rnd.uniform(-hw + 0.9, hw - 0.9), rnd.uniform(-hd + 0.9, hd - 0.9)
        p.cyl((tx, H + 0.55, tz), 'y', 1.1, 0.6, M['tank'], seg=12)
        p.cyl((tx, H + 1.12, tz), 'y', 0.06, 0.64, M['tank'], seg=12)
    if stair:  # external concrete stair up the side (+X)
        n = storeys * 10
        for k in range(n):
            y1 = (k + 1) * H / n
            z1 = hd - k * (d - 0.4) / n
            p.box(hw + col, y1 - 0.2, z1 - (d - 0.4) / n, hw + col + 0.9, y1, z1, M['concrete'], collide=False)
    p.colliders.append([round(-hw - 0.02, 3), 0, round(-hd - 0.02, 3), round(hw + 0.02, 3), round(H, 3), round(hd + 0.02, 3), 'concrete', False, True])
    return [p.build()]


HOUSES = [
    ('fv_house_a', dict(w=4.2, d=4.0, storeys=2, seed=11, plaster_floors=(0,), balcony=1)),
    ('fv_house_b', dict(w=5.0, d=4.5, storeys=3, seed=12, plaster_floors=(0, 1), lit={(1, 0)})),
    ('fv_house_c', dict(w=3.6, d=4.0, storeys=1, seed=13, tinroof=True, tank=False)),
    ('fv_house_d', dict(w=6.0, d=5.0, storeys=2, seed=14, plaster_floors=(0, 1), lit={(0, 2), (1, 1)})),
    ('fv_house_e', dict(w=4.0, d=5.5, storeys=4, seed=15, stair=True, plaster_floors=(3,))),
    ('fv_house_f', dict(w=5.2, d=5.0, storeys=2, seed=16, balcony=1, plaster_floors=(1,))),
]


# ------------------------------------------------------------------------------------------------
# Dressing
# ------------------------------------------------------------------------------------------------
def pole():  # 8.5 m concrete utility pole with a crossarm, insulators and a pole-top transformer can
    M = mats(); p = P('fv_pole')
    p.box(-0.11, 0, -0.11, 0.11, 8.5, 0.11, M['concrete'], surface='concrete')
    p.box(-1.1, 7.6, -0.07, 1.1, 7.75, 0.07, M['wood'], collide=False)
    p.box(-0.8, 6.9, -0.06, 0.8, 7.0, 0.06, M['wood'], collide=False)
    for x in (-1.0, -0.5, 0.5, 1.0):
        p.cyl((x, 7.83, 0), 'y', 0.16, 0.035, M['white'], seg=6)
    p.cyl((0, 6.3, 0.35), 'y', 0.9, 0.26, M['concrete_dark'], seg=10)
    p.box(-0.05, 6.1, 0.1, 0.05, 6.2, 0.35, M['steel'], collide=False)
    return [p.build()]


def streetlamp():  # sodium street lamp: arm off a pole top, head at (0, 6.2, 1.6)
    M = mats(); p = P('fv_streetlamp')
    p.box(-0.08, 0, -0.08, 0.08, 6.4, 0.08, M['steel'], surface='metal')
    p.prism([(0, 6.25), (1.5, 6.45), (1.5, 6.52), (0, 6.33)], -0.03, 0.03, M['steel'], across='x')
    p.box(-0.16, 6.2, 1.35, 0.16, 6.42, 1.85, M['steel'], collide=False)
    p.box(-0.12, 6.18, 1.4, 0.12, 6.2, 1.8, M['sodium'], collide=False)
    return [p.build()]


def walllamp():  # wall-mounted bulb on a bent bracket, wall at z=0, bulb at (0, 0, 0.45) relative to mount height
    M = mats(); p = P('fv_walllamp')
    p.box(-0.06, -0.1, 0, 0.06, 0.1, 0.04, M['steel'], collide=False)
    p.box(-0.015, 0.0, 0.0, 0.015, 0.03, 0.45, M['steel'], collide=False)
    p.cyl((0, -0.08, 0.45), 'y', 0.12, 0.06, M['bulb'], seg=8)
    return [p.build()]


def floodlight():  # 11 m floodlight mast with a 4-lamp head facing +Z
    M = mats(); p = P('fv_floodlight')
    p.box(-0.15, 0, -0.15, 0.15, 11, 0.15, M['steel'], surface='metal')
    p.box(-1.2, 10.6, -0.1, 1.2, 10.75, 0.1, M['steel'], collide=False)
    p.box(-1.2, 11.5, -0.1, 1.2, 11.65, 0.1, M['steel'], collide=False)
    for x in (-0.8, 0.8):
        for y in (10.75, 11.55):
            p.box(x - 0.35, y - 0.3, -0.05, x + 0.35, y + 0.3, 0.25, M['steel'], collide=False)
            p.zquad(x - 0.3, y - 0.25, x + 0.3, y + 0.25, 0.26, M['bulb'])
    p.prism([(0, 0), (0.6, 0), (0, 1.6)], -0.04, 0.04, M['steel'], across='x')
    return [p.build()]


def pylon():  # cable-line lattice tower, 16 m, arms along X carrying two cables at y 15.6
    M = mats(); p = P('fv_pylon')
    H = 16.0
    for sx in (-1, 1):
        for sz in (-1, 1):
            p.prism([(sz * 1.3 - 0.08, 0), (sz * 1.3 + 0.08, 0), (sz * 0.45 + 0.06, H), (sz * 0.45 - 0.06, H)], sx * 1.3 - 0.08, sx * 1.3 + 0.08, M['steel'], across='x')
    for k in range(7):
        y = 1.5 + k * 2.1
        f = 1.3 - (1.3 - 0.45) * (y / H)
        for sz in (-1, 1):
            p.box(-f, y, sz * f - 0.04, f, y + 0.08, sz * f + 0.04, M['steel'], collide=False)
        for sx in (-1, 1):
            p.box(sx * f - 0.04, y, -f, sx * f + 0.04, y + 0.08, f, M['steel'], collide=False)
    p.box(-3.0, H - 0.4, -0.2, 3.0, H, 0.2, M['yellow'], collide=False)
    for x in (-2.6, 2.6):
        p.cyl((x, H - 0.55, 0), 'z', 0.6, 0.25, M['black'], seg=10)
    p.colliders.append([-1.35, 0, -1.35, 1.35, H, 1.35, 'metal', False, False])
    return [p.build()]


def ladder():  # 0.6 m wide steel ladder, 6 m tall, against a wall at z=0, rungs toward +Z
    M = mats(); p = P('fv_ladder')
    for x in (-0.3, 0.3):
        p.box(x - 0.025, 0, 0.05, x + 0.025, 6.0, 0.1, M['steel'], collide=False)
    for k in range(20):
        y = 0.3 + k * 0.3
        p.cyl((0, y, 0.075), 'x', 0.6, 0.015, M['steel'], seg=6)
    return [p.build()]


def railing():  # 2 m railing section along X, 1.05 m tall
    M = mats(); p = P('fv_railing')
    p.box(-1.0, 1.0, -0.03, 1.0, 1.06, 0.03, M['steel'], collide=False)
    p.box(-1.0, 0.5, -0.02, 1.0, 0.54, 0.02, M['steel'], collide=False)
    for x in (-0.98, 0, 0.98):
        p.box(x - 0.025, 0, -0.025, x + 0.025, 1.06, 0.025, M['steel'], collide=False)
    p.colliders.append([-1.0, 0, -0.05, 1.0, 1.06, 0.05, 'metal', False, False])
    return [p.build()]


def tinroof():  # 3 x 2.2 m corrugated sheet on two purlins, low end at +Z
    M = mats(); p = P('fv_tinroof')
    for k in range(15):
        x0 = -1.5 + k * 0.2
        y = 0.04 if k % 2 else 0.0
        p.prism([(-1.1, 0.5 + y), (1.1, 0.0 + y), (1.1, 0.03 + y), (-1.1, 0.53 + y)], x0, x0 + 0.2, M['tin'] if k % 5 else M['rust'], across='x')
    for z in (-0.8, 0.8):
        p.box(-1.5, 0.25 - z * 0.23 - 0.1, z - 0.04, 1.5, 0.25 - z * 0.23, z + 0.04, M['wood'], collide=False)
    return [p.build()]


def rebar():  # cluster of rusty rebar stubs on a column head (0.3 x 0.3)
    M = mats(); p = P('fv_rebar')
    rnd = random.Random(3)
    p.box(-0.15, 0, -0.15, 0.15, 0.25, 0.15, M['concrete'], collide=False)
    for k in range(4):
        x, z = (k % 2 - 0.5) * 0.16, (k // 2 - 0.5) * 0.16
        h = 0.6 + rnd.random() * 0.5
        p.box(x - 0.012, 0.25, z - 0.012, x + 0.012, 0.25 + h, z + 0.012, M['rust'], collide=False)
        if rnd.random() < 0.5:  # bent tip
            p.box(x - 0.012, 0.25 + h - 0.024, z - 0.012, x + 0.15, 0.25 + h, z + 0.012, M['rust'], collide=False)
    return [p.build()]


def grille():  # window grille 1.2 x 1.1 on a frame, wall at z=0
    M = mats(); p = P('fv_grille')
    p.box(-0.64, 0, 0, 0.64, 0.05, 0.06, M['concrete'], collide=False)
    for x in (-0.6, -0.3, 0, 0.3, 0.6):
        p.box(x - 0.012, 0.05, 0.03, x + 0.012, 1.15, 0.055, M['steel'], collide=False)
    for y in (0.35, 0.8):
        p.box(-0.6, y, 0.025, 0.6, y + 0.025, 0.06, M['steel'], collide=False)
    return [p.build()]


def kite():  # small diamond kite with a tail, faces +Z
    M = mural_mats(); p = P('fv_kite')
    p.quad([(0, -0.35, 0), (0.28, 0, 0), (0, 0.4, 0), (-0.28, 0, 0)], M['m_pink'])
    p.quad([(0, 0.4, 0), (0.28, 0, 0), (0, -0.35, 0), (-0.28, 0, 0)], M['m_yellow'])
    for k in range(5):
        y = -0.4 - k * 0.14
        p.quad([(-0.04, y, 0.01), (0.04, y, 0.01), (0.04, y + 0.06, 0.01), (-0.04, y + 0.06, 0.01)], M['m_teal'] if k % 2 else M['m_orange'])
    return [p.build()]


def laundry():  # 4 m washing line between hooks at y=2.1 with clothes (quads), along X
    M = mural_mats(); p = P('fv_laundry')
    rnd = random.Random(9)
    Mm = mats()
    p.box(-2.0, 2.09, -0.005, 2.0, 2.1, 0.005, Mm['black'], collide=False)
    x = -1.8
    cols = ['m_white', 'm_sky', 'm_pink', 'm_yellow', 'm_green', 'm_blue', 'm_orange', 'm_white']
    while x < 1.7:
        wdt = rnd.uniform(0.35, 0.6); h = rnd.uniform(0.45, 0.8)
        m = M[rnd.choice(cols)]
        sag = 0.08 * math.cos((x / 2.0) * math.pi / 2)
        p.zquad(x, 2.1 - sag - h, x + wdt, 2.1 - sag, 0.0, m)
        p.zquad(x, 2.1 - sag - h, x + wdt, 2.1 - sag, -0.001, m, back=True)
        x += wdt + rnd.uniform(0.05, 0.2)
    return [p.build()]


def mural(name, seed, w=6.0, h=3.6):
    """Murals-as-geometry: layered extruded abstract shapes on a panel (no text, no symbols), faces +Z."""
    M = mural_mats(); p = P(name)
    rnd = random.Random(seed)
    keys = list(MURAL)
    bg = M[rnd.choice(['m_sky', 'm_yellow', 'm_teal', 'm_orange'])]
    p.box(-w / 2, 0, -0.03, w / 2, h, 0.0, bg, collide=False)
    z = 0.0

    def disc(cx, cy, r, m, seg=24):
        nonlocal z
        z += 0.006
        vs = [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), z) for i in range(seg)]
        p.quad(vs, m)

    def band(y0, amp, freq, th, m, phase):
        nonlocal z
        z += 0.006
        n = 40
        for i in range(n):
            xa, xb = -w / 2 + i * w / n, -w / 2 + (i + 1) * w / n
            ya = y0 + amp * math.sin(freq * xa + phase); yb = y0 + amp * math.sin(freq * xb + phase)
            p.quad([(xa, ya, z), (xb, yb, z), (xb, yb + th, z), (xa, ya + th, z)], m)

    def zig(y0, amp, n, th, m):
        nonlocal z
        z += 0.006
        for i in range(n):
            xa, xb = -w / 2 + i * w / n, -w / 2 + (i + 1) * w / n
            ya, yb = (y0 + (amp if i % 2 else 0)), (y0 + (0 if i % 2 else amp))
            p.quad([(xa, ya, z), (xb, yb, z), (xb, yb + th, z), (xa, ya + th, z)], m)

    # sun / big disc + rays, rolling hill bands, waves, a leaf-fan, confetti dots
    k0 = min(w / 6.0, h / 3.6)
    sx, sy = rnd.uniform(-w * 0.25, w * 0.25), rnd.uniform(h * 0.55, h * 0.7)
    disc(sx, sy, 0.95 * k0, M['m_orange']); disc(sx, sy, 0.7 * k0, M['m_yellow'])
    for k in range(10):
        a = 2 * math.pi * k / 10
        z += 0.001
        p.quad([(sx + k0 * math.cos(a - 0.08), sy + k0 * math.sin(a - 0.08), z), (sx + 1.4 * k0 * math.cos(a), sy + 1.4 * k0 * math.sin(a), z),
                (sx + k0 * math.cos(a + 0.08), sy + k0 * math.sin(a + 0.08), z)], M['m_yellow'])
    band(h * 0.3, 0.35, 1.3, 0.6, M['m_green'], rnd.random() * 6)
    band(h * 0.12, 0.25, 2.1, 0.5, M['m_blue'], rnd.random() * 6)
    zig(0.05, 0.3, 14, 0.18, M[rnd.choice(['m_pink', 'm_purple'])])
    fx = max(-w / 2 + 2 * k0, min(w / 2 - 2 * k0, -sx * 0.8))
    for k in range(7):  # leaf fan
        a = math.pi * (0.15 + 0.7 * k / 6)
        z += 0.003
        cx, cy = fx, h * 0.35
        L = 1.6 * k0
        p.quad([(cx, cy, z), (cx + L * math.cos(a - 0.12), cy + L * math.sin(a - 0.12), z), (cx + 1.2 * L * math.cos(a), cy + 1.2 * L * math.sin(a), z),
                (cx + L * math.cos(a + 0.12), cy + L * math.sin(a + 0.12), z)], M['m_green'] if k % 2 else M['m_teal'])
    for k in range(18):
        disc(rnd.uniform(-w / 2 + 0.2, w / 2 - 0.2), rnd.uniform(0.3, h - 0.2), rnd.uniform(0.05, 0.14), M[rnd.choice(keys)], seg=8)
    return [p.build()]


def canopy():  # top-station canopy: 16 x 12 m steel roof on 6 columns, 7 m clear, with beacon posts
    M = mats(); p = P('fv_canopy')
    for x in (-7.5, 0, 7.5):
        for z in (-5.5, 5.5):
            p.box(x - 0.2, 0, z - 0.2, x + 0.2, 7.0, z + 0.2, M['steel'], surface='metal')
    p.box(-8.2, 7.0, -6.2, 8.2, 7.35, 6.2, M['concrete_dark'], collide=False)
    p.box(-8.3, 7.35, -6.3, 8.3, 7.6, 6.3, M['white'], collide=False)
    for x in (-7.8, 7.8):
        for z in (-5.9, 5.9):
            p.box(x - 0.05, 7.6, z - 0.05, x + 0.05, 8.6, z + 0.05, M['steel'], collide=False)
            p.cyl((x, 8.7, z), 'y', 0.2, 0.12, M['red'], seg=8)
    p.colliders.append([-8.3, 7.0, -6.3, 8.3, 7.6, 6.3, 'metal', False, True])
    return [p.build()]


def goalframe():  # fallback futsal goal (3 x 2 m) frame, open toward +Z
    M = mats(); p = P('fv_goalframe')
    for x in (-1.5, 1.5):
        p.box(x - 0.04, 0, -0.04, x + 0.04, 2.0, 0.04, M['white'], collide=False)
        p.box(x - 0.03, 0, -1.0, x + 0.03, 0.05, 0.0, M['white'], collide=False)
    p.box(-1.54, 1.96, -0.04, 1.54, 2.04, 0.04, M['white'], collide=False)
    p.colliders.append([-1.55, 0, -1.0, 1.55, 2.05, 0.05, 'metal', False, False])
    return [p.build()]


def pieces():
    out = [(n, (lambda kw=kw, n=n: house(n, **kw))) for n, kw in HOUSES]
    out += [('fv_pole', pole), ('fv_streetlamp', streetlamp), ('fv_walllamp', walllamp), ('fv_floodlight', floodlight), ('fv_pylon', pylon),
            ('fv_ladder', ladder), ('fv_railing', railing), ('fv_tinroof', tinroof), ('fv_rebar', rebar), ('fv_grille', grille),
            ('fv_kite', kite), ('fv_laundry', laundry), ('fv_mural_a', lambda: mural('fv_mural_a', 21)), ('fv_mural_b', lambda: mural('fv_mural_b', 34, 8.0, 4.5)),
            ('fv_mural_c', lambda: mural('fv_mural_c', 55, 4.0, 3.0)), ('fv_canopy', canopy), ('fv_goalframe', goalframe)]
    return out


os.makedirs(OUT, exist_ok=True)
colliders = {}
for name, fn in pieces():
    if ONLY and name not in ONLY:
        continue
    reset(); __import__('lib')._mats.clear()
    objs = fn()
    colliders[name] = [json.loads(o['colliders']) for o in objs if 'colliders' in o][0] if objs else []
    save(name, objs)
cf = os.path.join(OUT, 'colliders.json')
old = json.load(open(cf)) if os.path.exists(cf) else {}
old.update(colliders)
json.dump(old, open(cf, 'w'), indent=0)
