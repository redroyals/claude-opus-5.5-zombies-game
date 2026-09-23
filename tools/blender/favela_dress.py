"""Favela art-pass dressing pieces (imported by favela_kit.py): plants and trees, a market stall, a snack kiosk,
chain-link fencing, a substation gantry, the cable-car station hall and cap, a striped awning, benches, planters,
a coin-free lookout viewer, handrails. Game coords (metres, +Y up, front +Z), base at y=0.
Small painted parts use single-colour `fv_*` slots that the game folds into one vertex-coloured material."""
import math, random


def _leaf(p, base, yaw, pitch, length, width, droop, mat, segs=5):
    """A drooping leaf/frond strip from `base` heading along yaw (radians, 0 = +Z), rising at `pitch`, bending down."""
    bx, by, bz = base
    dx, dz = math.sin(yaw), math.cos(yaw)
    px, pz = dz, -dx  # sideways
    pts = []
    for i in range(segs + 1):
        t = i / segs
        r = length * t
        y = by + math.sin(pitch) * r - droop * t * t * length
        h = r * math.cos(pitch)
        wdt = width * math.sin(math.pi * min(1.0, t * 1.1 + 0.05)) * (1 - 0.3 * t)
        c = (bx + dx * h, y, bz + dz * h)
        pts.append(((c[0] - px * wdt / 2, c[1] + 0.02 * wdt, c[2] - pz * wdt / 2), (c[0] + px * wdt / 2, c[1] + 0.02 * wdt, c[2] + pz * wdt / 2)))
    for i in range(segs):
        a0, a1 = pts[i]
        b0, b1 = pts[i + 1]
        p.quad([a0, a1, b1, b0], mat)
        p.quad([b0, b1, a1, a0], mat)


def _blob(p, c, r, mat, sides=6, squash=0.85):
    x, y, z = c
    prof = [(0.0, -r * squash)] + [(r * math.sin(math.pi * k / 4), -r * squash * math.cos(math.pi * k / 4)) for k in (1, 2, 3)] + [(0.0, r * squash)]
    p.lathe(prof, mat, sides=sides, center=(x, y, z))


def banana(P, material, name, seed=1):
    rnd = random.Random(seed)
    p = P(name)
    trunk, leaf, leaf2, fruit = material('fv_trunk_green', '#6f7a3a', 0.9), material('fv_leaf', '#4f8a3a', 0.8), material('fv_leaf2', '#79a843', 0.8), material('fv_fruit_green', '#8aa43a', 0.8)
    for k in range(3 + rnd.randint(0, 1)):
        a = k * 2.2 + rnd.random()
        ox, oz = math.cos(a) * 0.35 * (k > 0), math.sin(a) * 0.35 * (k > 0)
        h = rnd.uniform(2.0, 3.2) if k == 0 else rnd.uniform(1.2, 2.4)
        p.lathe([(0.14, 0), (0.12, h * 0.5), (0.08, h), (0.0, h + 0.05)], trunk, sides=7, center=(ox, 0, oz))
        for j in range(6):
            yaw = j * 1.05 + rnd.random() * 0.5
            _leaf(p, (ox, h - 0.1, oz), yaw, rnd.uniform(0.5, 1.0), rnd.uniform(1.4, 2.1), rnd.uniform(0.45, 0.6), rnd.uniform(0.35, 0.7), leaf if j % 2 else leaf2)
        if k == 0:
            for i in range(5):
                p.lathe([(0.0, 0), (0.07, 0.05), (0.06, 0.2), (0.0, 0.26)], fruit, sides=5, center=(ox + 0.18, h - 0.7 - i * 0.12, oz + (i % 2) * 0.08))
    return [p.build()]


def palm(P, material, name, height=8.5, seed=2):
    rnd = random.Random(seed)
    p = P(name)
    bark, frond, frond2 = material('fv_bark', '#7a6a52', 0.95), material('fv_leaf', '#4f8a3a', 0.8), material('fv_leaf2', '#79a843', 0.8)
    x = z = 0.0
    lean = rnd.uniform(0.02, 0.06)
    n = 8
    for i in range(n):
        y0, y1 = height * i / n, height * (i + 1) / n
        r0, r1 = 0.2 - 0.07 * i / n, 0.2 - 0.07 * (i + 1) / n
        p.lathe([(r0, -0.12), (r0 * 1.08, (y1 - y0) * 0.3), (r1, y1 - y0 + 0.02)], bark, sides=7, cap_bottom=i == 0, cap_top=False, center=(x, y0, z))
        x += lean * (y1 - y0) * 0.35
    for j in range(11):
        yaw = j * (2 * math.pi / 11) + rnd.random() * 0.3
        _leaf(p, (x, height, z), yaw, rnd.uniform(0.2, 0.7), rnd.uniform(2.4, 3.2), 0.5, rnd.uniform(0.6, 1.0), frond if j % 2 else frond2, segs=6)
    _blob(p, (x, height - 0.2, z), 0.28, material('fv_fruit_brown', '#6a5030', 0.9))
    return [p.build()]


def tree(P, material, name, height=6.5, seed=3):
    """Broad tropical tree (mango/almond): trunk with two limbs and a clumpy low-poly crown."""
    rnd = random.Random(seed)
    p = P(name)
    bark, c1, c2, c3 = material('fv_bark', '#6a5a44', 0.95), material('fv_leaf_dark', '#3d6a30', 0.85), material('fv_leaf', '#4f8a3a', 0.8), material('fv_leaf2', '#79a843', 0.8)
    p.lathe([(0.32, 0), (0.24, 0.6), (0.2, height * 0.45), (0.12, height * 0.6)], bark, sides=7)
    for k in range(2):
        a = k * math.pi + rnd.random()
        for t in range(4):
            y = height * 0.45 + t * 0.35
            p.lathe([(0.1, 0), (0.08, 0.4)], bark, sides=5, cap_bottom=False, center=(math.cos(a) * t * 0.35, y, math.sin(a) * t * 0.35))
    for k in range(9):
        a = k * 2.4 + rnd.random()
        rr = rnd.uniform(0.3, 1.6)
        _blob(p, (math.cos(a) * rr, height * 0.7 + rnd.uniform(-0.3, 0.9), math.sin(a) * rr), rnd.uniform(1.1, 1.7), [c1, c2, c3][k % 3], sides=7)
    return [p.build()]


def bush(P, material, name, seed=4, flowers=True):
    """Bougainvillea in a big terracotta planter: magenta and green clumps."""
    rnd = random.Random(seed)
    p = P(name)
    pot, soil = material('fv_pot', '#b5603a', 0.9), material('fv_soil', '#3a2a1e', 1.0)
    fl, fl2, lf = material('fv_flower', '#d8308a', 0.8), material('fv_flower2', '#f05aa8', 0.8), material('fv_leaf_dark', '#3d6a30', 0.85)
    p.lathe([(0.34, 0), (0.42, 0.55), (0.46, 0.6), (0.44, 0.62)], pot, sides=10, cap_top=False)
    p.lathe([(0.42, 0.52), (0.0, 0.55)], soil, sides=10, cap_bottom=False)
    for k in range(8):
        a = k * 2.3 + rnd.random()
        rr = rnd.uniform(0.0, 0.45)
        m = (fl, fl2, lf)[k % 3] if flowers else (lf, material('fv_leaf', '#4f8a3a', 0.8))[k % 2]
        _blob(p, (math.cos(a) * rr, 1.0 + rnd.uniform(-0.15, 0.6), math.sin(a) * rr), rnd.uniform(0.3, 0.5), m, sides=6)
    return [p.build()]


def pots(P, material, name, seed=5):
    """Cluster of potted plants in mismatched pots and old paint tins."""
    rnd = random.Random(seed)
    p = P(name)
    pots_m = [material('fv_pot', '#b5603a', 0.9), material('fv_tin_can', '#a8adb0', 0.5, 0.5), material('fv_paint_white', '#e8e6e0', 0.7), material('fv_door_blue', '#2e5aa8', 0.7)]
    leaves = [material('fv_leaf', '#4f8a3a', 0.8), material('fv_leaf2', '#79a843', 0.8), material('fv_leaf_dark', '#3d6a30', 0.85)]
    for k in range(6):
        x, z = rnd.uniform(-0.6, 0.6), rnd.uniform(-0.3, 0.3)
        r = rnd.uniform(0.12, 0.22)
        h = rnd.uniform(0.2, 0.4)
        p.lathe([(r * 0.8, 0), (r, h)], pots_m[k % 4], sides=8, center=(x, 0, z))
        for j in range(5):
            _leaf(p, (x, h, z), j * 1.3 + rnd.random(), rnd.uniform(0.6, 1.2), rnd.uniform(0.3, 0.6), 0.14, 0.3, leaves[(k + j) % 3], segs=3)
    return [p.build()]


def stall(P, material, name, seed=6):
    """Market fruit stall: timber frame, sloped striped awning, crates of fruit."""
    rnd = random.Random(seed)
    p = P(name)
    wood, tarp_a, tarp_b = material('fv_wood', '#7a5a3a', 0.9), material('fv_m_teal', '#12a89a', 0.8), material('fv_m_white', '#f2efe8', 0.8)
    fruits = [material('fv_m_orange', '#f26a1b', 0.8), material('fv_m_yellow', '#f5c518', 0.8), material('fv_m_green', '#3cb043', 0.8), material('fv_paint_red', '#b3261e', 0.6)]
    W, D = 2.4, 1.3
    for x in (-W / 2, W / 2):
        for z, h in ((-D / 2, 2.4), (D / 2, 2.1)):
            p.box(x - 0.04, 0, z - 0.04, x + 0.04, h, z + 0.04, wood, collide=False)
    p.box(-W / 2, 0.8, -D / 2, W / 2, 0.85, D / 2, wood, collide=False)
    p.box(-W / 2, 0.3, D / 2 - 0.04, W / 2, 0.8, D / 2, wood, collide=False)
    k = 0
    x = -W / 2 - 0.15
    while x < W / 2 + 0.15:
        p.prism([(-D / 2 - 0.1, 2.45), (D / 2 + 0.45, 2.05), (D / 2 + 0.45, 2.08), (-D / 2 - 0.1, 2.48)], x, x + 0.3, tarp_a if k % 2 else tarp_b, across='x')
        x += 0.3
        k += 1
    for i in range(4):
        cx = -W / 2 + 0.3 + i * 0.6
        p.box(cx - 0.25, 0.85, -0.3, cx + 0.25, 1.1, 0.35, wood, collide=False)
        fm = fruits[i % 4]
        for j in range(6):
            _blob(p, (cx - 0.15 + (j % 3) * 0.15, 1.16, -0.15 + (j // 3) * 0.22), 0.07, fm, sides=5)
    for i in range(3):  # crates stacked on the ground beside it
        p.box(W / 2 + 0.1, i * 0.3, -0.3, W / 2 + 0.6, i * 0.3 + 0.28, 0.2, wood, collide=False)
    return [p.build()]


def kiosk(P, material, name):
    """Street snack kiosk: a small painted booth with a serving hatch, a grill, a big umbrella and cool box."""
    p = P(name)
    body, trim, steel = material('fv_m_yellow', '#f5c518', 0.8), material('fv_m_blue', '#1f5fc8', 0.8), material('fv_steel', '#4f5458', 0.5, 0.8)
    dark, white, umb = material('fv_window_dark', '#161b21', 0.3, 0.2), material('fv_paint_white', '#e8e6e0', 0.7), material('fv_m_pink', '#e8327a', 0.8)
    lit = material('fv_bulb', '#ffd28a', 0.4)
    p.box(-0.9, 0, -0.7, 0.9, 1.0, 0.7, body, collide=False)
    p.box(-0.9, 1.0, -0.7, -0.75, 2.1, 0.7, body, collide=False)
    p.box(0.75, 1.0, -0.7, 0.9, 2.1, 0.7, body, collide=False)
    p.box(-0.9, 1.0, -0.7, 0.9, 2.1, -0.55, body, collide=False)
    p.zquad(-0.75, 1.0, 0.75, 2.0, -0.54, dark)
    p.box(-1.0, 2.1, -0.8, 1.0, 2.25, 0.95, trim, collide=False)
    p.box(-0.95, 0.95, 0.7, 0.95, 1.02, 0.95, white, collide=False)
    p.box(-0.95, 0.3, 0.68, 0.95, 0.45, 0.72, trim, collide=False)
    p.box(-0.6, 2.04, 0.4, 0.6, 2.08, 0.5, lit, collide=False)
    p.box(1.3, 0, 0.1, 1.34, 2.5, 0.14, steel, collide=False)
    p.lathe([(1.3, 0), (0.0, 0.45)], umb, sides=8, center=(1.32, 2.45, 0.12))
    p.box(1.0, 0, 0.5, 1.6, 0.45, 0.9, white, collide=False)
    return [p.build()]


def fence(P, material, name, w=3.0, h=3.0):
    """Chain-link panel on two posts with a top rail; the mesh is one double quad (`fv_chainlink`, alpha-tested)."""
    p = P(name)
    steel, link = material('fv_steel', '#4f5458', 0.5, 0.8), material('fv_chainlink', '#9aa0a4', 0.6, 0.6)
    for x in (-w / 2, w / 2):
        p.cyl((x, h / 2, 0), 'y', h, 0.035, steel, seg=6)
    p.cyl((0, h - 0.03, 0), 'x', w, 0.022, steel, seg=6)
    p.cyl((0, 0.08, 0), 'x', w, 0.018, steel, seg=6)
    p.zquad(-w / 2, 0.05, w / 2, h - 0.05, 0.0, link)
    p.zquad(-w / 2, 0.05, w / 2, h - 0.05, -0.002, link, back=True)
    return [p.build()]


def gantry(P, material, name):
    """Substation steel gantry: two lattice towers, a crossbeam and strings of insulators with bus bars."""
    p = P(name)
    steel, ins, bus = material('fv_alum', '#b8bcbe', 0.4, 0.6), material('fv_insulator', '#8a4a2a', 0.5), material('fv_steel', '#4f5458', 0.5, 0.8)
    H, S = 7.5, 6.0
    for sx in (-1, 1):
        cx = sx * S / 2
        for dx in (-0.35, 0.35):
            for dz in (-0.35, 0.35):
                p.box(cx + dx - 0.04, 0, dz - 0.04, cx + dx + 0.04, H, dz + 0.04, steel, collide=False)
        for k in range(8):
            y = 0.5 + k * 0.9
            p.box(cx - 0.35, y, -0.37, cx + 0.35, y + 0.05, -0.33, steel, collide=False)
            p.box(cx - 0.35, y, 0.33, cx + 0.35, y + 0.05, 0.37, steel, collide=False)
            p.box(cx - 0.37, y, -0.35, cx - 0.33, y + 0.05, 0.35, steel, collide=False)
            p.box(cx + 0.33, y, -0.35, cx + 0.37, y + 0.05, 0.35, steel, collide=False)
    p.box(-S / 2 - 0.4, H - 0.5, -0.3, S / 2 + 0.4, H, 0.3, steel, collide=False)
    for x in (-1.6, 0, 1.6):
        for k in range(5):
            p.cyl((x, H - 0.7 - k * 0.12, 0), 'y', 0.06, 0.14, ins, seg=8)
        p.cyl((x, H - 1.35, 0), 'z', 3.0, 0.04, bus, seg=6)
    return [p.build()]


def station_hall(P, material, name):
    """Cable-car station hall for the crest skyline: concrete plinth with a glazing band, a steel-framed upper hall
    under a curved barrel roof (open toward +Z where the cables come in), red beacons on the ridge."""
    p = P(name)
    conc, concd, glass = material('fv_concrete', '#8e8b85', 0.95), material('fv_concrete_dark', '#5e5c58', 0.95), material('fv_window_dark', '#161b21', 0.3, 0.2)
    steel, roof, red, white = material('fv_steel', '#4f5458', 0.5, 0.8), material('fv_paint_white', '#e8e6e0', 0.7), material('fv_paint_red', '#b3261e', 0.6), material('fv_alum', '#b8bcbe', 0.4, 0.6)
    W, D = 18.0, 11.0
    p.box(-W / 2, 0, -D / 2, W / 2, 4.2, D / 2, conc, collide=False)
    p.zquad(-W / 2 + 0.6, 1.4, W / 2 - 0.6, 3.4, D / 2 + 0.01, glass)
    for k in range(10):
        x = -W / 2 + 0.6 + k * (W - 1.2) / 9
        p.box(x - 0.05, 1.4, D / 2, x + 0.05, 3.4, D / 2 + 0.06, white, collide=False)
    p.box(-W / 2 - 0.2, 4.2, -D / 2 - 0.2, W / 2 + 0.2, 4.55, D / 2 + 0.2, concd, collide=False)
    for x in (-W / 2 + 0.3, -W / 6, W / 6, W / 2 - 0.3):
        for z in (-D / 2 + 0.3, D / 2 - 0.3):
            p.box(x - 0.18, 4.55, z - 0.18, x + 0.18, 9.0, z + 0.18, steel, collide=False)
    # barrel roof (arc across X, extruded along Z)
    R = W / 2 + 0.6
    arc = [(R * math.cos(math.pi * (1 - k / 14)), 9.0 + 3.0 * math.sin(math.pi * k / 14)) for k in range(15)]
    for i in range(14):
        (x0, y0), (x1, y1) = arc[i], arc[i + 1]
        p.quad([(x0, y0, -D / 2 - 0.8), (x1, y1, -D / 2 - 0.8), (x1, y1, D / 2 + 0.8), (x0, y0, D / 2 + 0.8)], roof)
        p.quad([(x0, y0 - 0.12, D / 2 + 0.8), (x1, y1 - 0.12, D / 2 + 0.8), (x1, y1 - 0.12, -D / 2 - 0.8), (x0, y0 - 0.12, -D / 2 - 0.8)], steel)
    for z in (-D / 2 - 0.8, D / 2 + 0.8):  # gable ribs
        for i in range(14):
            (x0, y0), (x1, y1) = arc[i], arc[i + 1]
            p.quad([(x0, y0 - 0.12, z), (x1, y1 - 0.12, z), (x1, y1, z), (x0, y0, z)], steel)
    p.quad([(-W / 2, 4.55, -D / 2 + 0.1), (W / 2, 4.55, -D / 2 + 0.1), (W / 2, 9.0, -D / 2 + 0.1), (-W / 2, 9.0, -D / 2 + 0.1)][::-1], glass)
    for z in (-D / 2, D / 2):
        p.box(-0.1, 11.9, z - 0.1, 0.1, 12.4, z + 0.1, steel, collide=False)
        p.cyl((0, 12.55, z), 'y', 0.25, 0.16, red, seg=8)
    # big bull wheel under the roof
    p.cyl((0, 6.2, 0), 'y', 0.35, 3.0, concd, seg=24)
    p.cyl((0, 6.2, 0), 'y', 0.5, 2.85, steel, seg=24)
    p.cyl((0, 5.0, 0), 'y', 2.4, 0.4, steel, seg=10)
    return [p.build()]


def station_cap(P, material, name):
    """Curved steel roof cap for the bottom station (sits on its walls), with a beacon and a sign-less fascia band."""
    p = P(name)
    steel, roof, red, band = material('fv_steel', '#4f5458', 0.5, 0.8), material('fv_paint_white', '#e8e6e0', 0.7), material('fv_paint_red', '#b3261e', 0.6), material('fv_m_teal', '#12a89a', 0.8)
    W, D = 9.6, 9.6
    p.box(-W / 2, 0, -D / 2, W / 2, 0.6, D / 2, band, collide=False)
    R = W / 2
    arc = [(R * math.cos(math.pi * (1 - k / 12)), 0.6 + 1.8 * math.sin(math.pi * k / 12)) for k in range(13)]
    for i in range(12):
        (x0, y0), (x1, y1) = arc[i], arc[i + 1]
        p.quad([(x0, y0, -D / 2), (x1, y1, -D / 2), (x1, y1, D / 2), (x0, y0, D / 2)], roof)
    for z in (-D / 2, D / 2):
        for i in range(12):
            (x0, y0), (x1, y1) = arc[i], arc[i + 1]
            f = [(x0, 0.6, z), (x1, 0.6, z), (x1, y1, z), (x0, y0, z)]
            p.quad(f if z > 0 else f[::-1], steel)
    p.cyl((0, 2.6, 0), 'y', 0.3, 0.14, red, seg=8)
    return [p.build()]


def awning(P, material, name, w=11.0):
    """Striped canvas awning over the lanchonete front (pitched down toward +Z), on two thin rods."""
    p = P(name)
    a, b, steel = material('fv_m_orange', '#f26a1b', 0.8), material('fv_m_white', '#f2efe8', 0.8), material('fv_steel', '#4f5458', 0.5, 0.8)
    k = 0
    x = -w / 2
    while x < w / 2 - 0.01:
        p.prism([(0, 0.6), (1.4, 0.0), (1.4, 0.03), (0, 0.63)], x, x + 0.5, a if k % 2 else b, across='x')
        p.prism([(1.4, 0.0), (1.4, -0.25), (1.42, -0.25), (1.42, 0.0)], x, x + 0.5, a if k % 2 else b, across='x')
        x += 0.5
        k += 1
    for x in (-w / 2 + 0.2, w / 2 - 0.2):
        p.box(x - 0.015, 0.0, 0.0, x + 0.015, 0.03, 1.4, steel, collide=False)
    return [p.build()]


def bench(P, material, name):
    """Cast-concrete bench with a painted timber seat."""
    p = P(name)
    conc, seat = material('fv_concrete', '#8e8b85', 0.95), material('fv_door_teal', '#3a7a78', 0.7)
    for x in (-0.7, 0.7):
        p.box(x - 0.1, 0, -0.2, x + 0.1, 0.42, 0.2, conc, collide=False)
    for k in range(3):
        p.box(-0.9, 0.42, -0.2 + k * 0.14, 0.9, 0.47, -0.2 + k * 0.14 + 0.11, seat, collide=False)
    return [p.build()]


def viewer(P, material, name):
    """Lookout viewer on a post (binocular head on a yoke), for the mirante rail."""
    p = P(name)
    steel, paint, dark = material('fv_steel', '#4f5458', 0.5, 0.8), material('fv_door_green', '#2f7a4a', 0.7), material('fv_window_dark', '#161b21', 0.3, 0.2)
    p.lathe([(0.2, 0), (0.08, 0.1), (0.06, 1.1), (0.1, 1.15)], paint, sides=10)
    p.box(-0.18, 1.15, -0.05, 0.18, 1.2, 0.05, steel, collide=False)
    for sx in (-1, 1):
        p.box(sx * 0.18 - 0.03, 1.15, -0.05, sx * 0.18 + 0.03, 1.45, 0.05, steel, collide=False)
    p.box(-0.16, 1.3, -0.22, 0.16, 1.52, 0.22, paint, collide=False)
    for sx in (-1, 1):
        p.cyl((sx * 0.07, 1.41, 0.26), 'z', 0.1, 0.06, steel, seg=10)
        p.zquad(sx * 0.07 - 0.04, 1.37, sx * 0.07 + 0.04, 1.45, 0.311, dark)
    return [p.build()]


def pieces(P, material):
    return [
        ('fv_banana', lambda: banana(P, material, 'fv_banana')),
        ('fv_palm', lambda: palm(P, material, 'fv_palm')),
        ('fv_tree', lambda: tree(P, material, 'fv_tree')),
        ('fv_tree_b', lambda: tree(P, material, 'fv_tree_b', 5.0, 9)),
        ('fv_bush', lambda: bush(P, material, 'fv_bush')),
        ('fv_shrub', lambda: bush(P, material, 'fv_shrub', 8, False)),
        ('fv_pots', lambda: pots(P, material, 'fv_pots')),
        ('fv_stall', lambda: stall(P, material, 'fv_stall')),
        ('fv_kiosk', lambda: kiosk(P, material, 'fv_kiosk')),
        ('fv_fence', lambda: fence(P, material, 'fv_fence')),
        ('fv_gantry', lambda: gantry(P, material, 'fv_gantry')),
        ('fv_station_hall', lambda: station_hall(P, material, 'fv_station_hall')),
        ('fv_station_cap', lambda: station_cap(P, material, 'fv_station_cap')),
        ('fv_awning', lambda: awning(P, material, 'fv_awning')),
        ('fv_bench', lambda: bench(P, material, 'fv_bench')),
        ('fv_viewer', lambda: viewer(P, material, 'fv_viewer')),
    ]
