"""Procedural modular kit for the 1830s Lahore Fort + old-Lahore-haveli-district zombies map
(Mughal / Sikh-era architecture: cusped arches, chhatris, jaali, Sheesh Mahal mirror-work).
  blender -b --factory-startup -P tools/blender/lahore_kit.py -- --out public/models/lahore [--only arch_bay,jaali]

Game coords (metres, +Y up, front = +Z). No image textures: every piece uses only the named material
slots stone/trim/plaster/wood/woodPaint/metal/iron/mirror/cloth/paper, which the game re-textures at
runtime. UVs are box-projected world-scale at 1 UV unit = 2 m (Piece(..., uv_scale=0.5)) so the game's
tileable detail textures read at a consistent scale across every piece.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
import lib
from lib import args, reset, material, Piece, g2b

A = args()
OUT = os.path.abspath(A.get('out', 'public/models/lahore'))
ONLY = set(A['only'].split(',')) if 'only' in A else None
UV = 0.5  # 1 UV unit = 2 m


def P(name):
    return Piece(name, uv_scale=UV)


def mats():
    return dict(
        stone=material('stone', '#b4553a', 0.80, 0.0),
        trim=material('trim', '#cdbb92', 0.55, 0.0),
        plaster=material('plaster', '#d9c7a0', 0.90, 0.0),
        wood=material('wood', '#4a2e1c', 0.85, 0.0),
        woodPaint=material('woodPaint', '#3f6b4f', 0.60, 0.0),
        metal=material('metal', '#c9a24a', 0.35, 1.0),
        iron=material('iron', '#2e2b28', 0.45, 0.85),
        mirror=material('mirror', '#dfe8f0', 0.05, 1.0),
        cloth=material('cloth', '#8a2f2f', 0.85, 0.0),
        paper=material('paper', '#d94f2b', 0.55, 0.0),
    )


# ---------------------------------------------------------------------------------------------
# shared curve / placement helpers
# ---------------------------------------------------------------------------------------------

def cusp_arch_pts(half_w, y0, y1, n=32, lobes=7, cusp=0.075, pw=1.7):
    """(x, y) points of a multifoil cusped Mughal pointed-arch curve, left spring (-half_w, y0) to
    right spring (half_w, y0) via the apex (0, y1). The scallop (lobes) fades to 0 at both springs."""
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 2 * t - 1
        base_y = y0 + (y1 - y0) * math.cos(math.pi / 2 * abs(u) ** pw)
        fade = math.sin(math.pi * t) ** 0.6
        bump = cusp * fade * math.sin(lobes * math.pi * t)
        pts.append((u * half_w, base_y + bump))
    return pts


def offset_curve(pts, dy, dx_scale=1.0):
    """Shrink a cusp_arch_pts curve toward its own chord midline: scale x by dx_scale, raise y by dy.
    Used to build the *inner* edge of a curved trim/frame band from the same curve."""
    return [(x * dx_scale, y + dy) for (x, y) in pts]


def ring_prism(p, mat, outer_pts, inner_pts, e0, e1, across='z'):
    """Extrude the simple closed ring polygon (outer forward + inner reversed) between two curves
    that share both endpoints (springing points) -- a picture-frame / arch-trim band."""
    pts = list(outer_pts) + list(reversed(inner_pts))
    p.prism(pts, e0, e1, mat, across=across)


def spandrel_fill(p, mat, half_wall, y_top, curve_pts, half_open, e0, e1, across='z'):
    """Solid fill of the rectangle [-half_wall,half_wall] x [spring_y, y_top] MINUS the area under an
    arch curve (curve_pts spans -half_open..half_open at its two ends, both at spring_y)."""
    spring_y = curve_pts[0][1]
    pts = [(-half_wall, y_top), (half_wall, y_top), (half_wall, spring_y), (half_open, spring_y)] \
        + list(reversed(curve_pts)) + [(-half_open, spring_y), (-half_wall, spring_y)]
    p.prism(pts, e0, e1, mat, across=across)


def radial(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def cyl_base(p, base, axis, length, radius, mat, seg=10):
    """lib.Piece.cyl() centres the cylinder ON p0; this places it with its BASE at `base`, extending
    +length along `axis` (the common case for a post/column/finial standing on something)."""
    bx, by, bz = base
    c = (bx + length / 2, by, bz) if axis == 'x' else (bx, by + length / 2, bz) if axis == 'y' else (bx, by, bz + length / 2)
    return p.cyl(c, axis, length, radius, mat, seg=seg)


# ---------------------------------------------------------------------------------------------
# reusable sub-assemblies
# ---------------------------------------------------------------------------------------------

def add_dome(p, M, cx, cz, base_y, drum_d, dome_d, total_h, sides=16, finial_h=0.35, drum_h=None, neck_h=0.12, mat_stone='stone'):
    """Drum (short cylinder) + bulbous onion dome + metal finial, centred at (cx, cz), base at base_y.
    Returns the world position of the finial tip (for an optional socket_top empty)."""
    drum_r, dome_r = drum_d / 2, dome_d / 2
    if drum_h is None:
        drum_h = total_h * 0.16
    dome_h = total_h - drum_h - neck_h - finial_h
    c = (cx, base_y, cz)
    profile = [
        (drum_r, 0.0), (drum_r, drum_h),                          # drum
        (dome_r * 0.78, drum_h + dome_h * 0.06),                  # slight outward kick
        (dome_r, drum_h + dome_h * 0.30),                          # widest bulge
        (dome_r * 0.66, drum_h + dome_h * 0.70),
        (dome_r * 0.22, drum_h + dome_h * 0.94),
        (0.0, drum_h + dome_h),                                    # apex point
    ]
    p.lathe(profile, M[mat_stone], sides=sides, center=c)
    apex_y = drum_h + dome_h
    neck_top = apex_y + neck_h
    p.lathe([(dome_r * 0.05, apex_y), (0.045, neck_top - 0.05), (0.09, neck_top), (0.0, neck_top + finial_h)],
            M['metal'], sides=8, center=c)
    return (cx, base_y + neck_top + finial_h, cz)


def add_chhatri(p, M, cx, cz, scale=1.0, base_y=0.0):
    """Domed kiosk: plinth, 4 slender columns, a chajja eave, a small onion dome + finial."""
    s = scale
    plinth = 2.6 * s
    col_h = 2.0 * s
    r = plinth / 2 - 0.28 * s
    y0 = base_y
    p.box(cx - plinth / 2, y0, cz - plinth / 2, cx + plinth / 2, y0 + 0.3 * s, cz + plinth / 2, M['stone'])
    col_top = y0 + 0.3 * s + col_h
    for dx in (-1, 1):
        for dz in (-1, 1):
            x, z = cx + dx * r, cz + dz * r
            cyl_base(p, (x, y0 + 0.3 * s, z), 'y', col_h, 0.09 * s, M['stone'], seg=8)
            p.lathe([(0.09 * s, 0), (0.16 * s, 0.05 * s), (0.16 * s, 0.10 * s), (0.09 * s, 0.14 * s)],
                    M['trim'], sides=8, cap_bottom=False, center=(x, col_top, z))
    chajja_y = col_top
    p.box(cx - plinth / 2 - 0.22 * s, chajja_y, cz - plinth / 2 - 0.22 * s, cx + plinth / 2 + 0.22 * s, chajja_y + 0.1 * s, cz + plinth / 2 + 0.22 * s, M['trim'], collide=False)
    tip = add_dome(p, M, cx, cz, chajja_y + 0.1 * s, 1.55 * s, 1.75 * s, 1.35 * s, sides=12, finial_h=0.22 * s)
    return tip


def louvred_shutter(p, M, cx, y0, y1, hw, mat, n=7, z=0.0):
    """A closed louvred shutter panel (n angled slats) centred at cx, from y0 to y1, half-width hw,
    front face at world-Z `z`."""
    frame_t = 0.03
    p.box(cx - hw, y0, z - 0.02, cx + hw, y1, z + 0.02, mat, collide=False)
    slat_h = (y1 - y0 - 2 * frame_t) / n
    for i in range(n):
        yy = y0 + frame_t + i * slat_h
        p.box(cx - hw + frame_t, yy, z - 0.025, cx + hw - frame_t, yy + slat_h * 0.65, z + 0.025, mat, collide=False)
    return p


def circle_pts(r, n=16, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def annulus(p, mat, r_out, r_in, z0, z1, center=(0.0, 0.0), sides=20, cap_front=True, cap_back=True):
    """A proper closed washer/tube in the X-Y plane (game), thickness along Z, from r_in to r_out.
    NOTE: ring_prism()/prism() treat their point list as one simple polygon with a start/end seam --
    correct for an OPEN arc (arch bands) but WRONG for a full 360 degree circle (it leaves an angular
    sliver uncovered where the seam's two spokes collide). This builds independently-wrapped outer/
    inner rings instead, so there is no seam at all."""
    cx, cy = center
    idx = p._mi(mat)

    def ring(r, z):
        return [p.bm.verts.new(g2b((cx + r * math.cos(2 * math.pi * i / sides), cy + r * math.sin(2 * math.pi * i / sides), z))) for i in range(sides)]
    o0, i0, o1, i1 = ring(r_out, z0), ring(r_in, z0), ring(r_out, z1), ring(r_in, z1)
    for s in range(sides):
        s2 = (s + 1) % sides
        p.bm.faces.new([o0[s], o0[s2], o1[s2], o1[s]]).material_index = idx
        p.bm.faces.new([i0[s2], i0[s], i1[s], i1[s2]]).material_index = idx
        if cap_front:
            p.bm.faces.new([o0[s2], o0[s], i0[s], i0[s2]]).material_index = idx
        if cap_back:
            p.bm.faces.new([o1[s], o1[s2], i1[s2], i1[s]]).material_index = idx
    return p


def add_mirror_facet(p, M, cx, cy, cz, size, rng):
    """A tiny double-sided glinting mirror tile facing roughly +Z, at a small random tilt, for a
    Sheesh Mahal mosaic. 4 tris (front + back so it never backface-culls, however recalc_face_normals
    settles the winding of this disconnected island)."""
    a1 = rng.uniform(-0.55, 0.55)
    a2 = rng.uniform(-0.55, 0.55)
    u = (math.cos(a1), math.sin(a1) * 0.35, 0.0)
    v = (0.0, math.cos(a2), math.sin(a2))
    hs = size / 2
    pts = []
    for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        pts.append((cx + u[0] * hs * su + v[0] * hs * sv,
                     cy + u[1] * hs * su + v[1] * hs * sv,
                     cz + u[2] * hs * su + v[2] * hs * sv))
    idx = p._mi(M['mirror'])
    front = [p.bm.verts.new(g2b(pt)) for pt in pts]
    p.bm.faces.new(front).material_index = idx
    back = [p.bm.verts.new(g2b(pt)) for pt in pts]
    p.bm.faces.new(list(reversed(back))).material_index = idx


def roof_curve_pts(half_d, ridge_h, eave_h, n=12, droop=0.16):
    """Half cross-section (z=0 ridge .. z=half_d eave) of a curved bangla/do-chala roof: a concave
    sweep that curls down past-vertical at the eave for the classic drooping silhouette."""
    pts = []
    for i in range(n + 1):
        t = i / n
        z = t * half_d
        y = ridge_h - (ridge_h - eave_h) * math.sin(math.pi / 2 * t ** 1.3)
        curl = -droop * max(0.0, t - 0.72) / 0.28
        pts.append((z, y + curl))
    return pts


def roof_ring(half_d, ridge_h, eave_h, thickness, n=12):
    half = roof_curve_pts(half_d, ridge_h, eave_h, n=n)
    outer = [(-z, y) for z, y in reversed(half)] + half[1:]
    inner = [(z, y - thickness) for z, y in outer]
    return outer + list(reversed(inner))


def chajja_curve_pts(depth, h0, h1, n=10, droop=0.05):
    """One-sided sloped/curved eave profile: flush at the wall (z=0, y=h0) curving out to the
    projecting tip (z=depth, y=h1), with a slight extra downward curl right at the tip."""
    pts = []
    for i in range(n + 1):
        t = i / n
        z = t * depth
        y = h0 + (h1 - h0) * math.sin(math.pi / 2 * t ** 1.2)
        curl = -droop * max(0.0, t - 0.75) / 0.25
        pts.append((z, y + curl))
    return pts


def chajja_ring(depth, h0, h1, thickness, n=10, droop=0.05):
    outer = chajja_curve_pts(depth, h0, h1, n=n, droop=droop)
    inner = [(z, y - thickness) for z, y in outer]
    return outer + list(reversed(inner))


def arch_niche_fill(p, mat, x0, x1, y_top, curve_pts, e0, e1, across='z'):
    """Solid fill of the rectangle [x0,x1] x [spring_y, y_top] MINUS the area under an arch curve
    (curve_pts, an absolute-coordinate cusp_arch_pts curve whose ends lie within [x0,x1])."""
    spring_y = curve_pts[0][1]
    pts = [(x0, y_top), (x1, y_top), (x1, spring_y), (curve_pts[-1][0], spring_y)] \
        + list(reversed(curve_pts)) + [(curve_pts[0][0], spring_y), (x0, spring_y)]
    p.prism(pts, e0, e1, mat, across=across)


# ---------------------------------------------------------------------------------------------
# 1-3: arcade (wall bay, column, span)
# ---------------------------------------------------------------------------------------------

def arch_bay(M):
    W, H, D = 3.0, 4.6, 0.6
    OPEN_W, SPRING, APEX = 2.2, 2.4, 3.6
    half_w, half_o = W / 2, OPEN_W / 2
    p = P('kit_arch_bay')
    p.box(-half_w, 0, -D / 2, -half_o, SPRING, D / 2, M['stone'])
    p.box(half_o, 0, -D / 2, half_w, SPRING, D / 2, M['stone'])
    curve = cusp_arch_pts(half_o, SPRING, APEX)
    spandrel_fill(p, M['stone'], half_w, H, curve, half_o, -D / 2, D / 2)
    p.colliders.append([-half_w, SPRING, -D / 2, half_w, H, D / 2, 'stone', False, True])
    inner = offset_curve(curve, 0.16, dx_scale=0.90)
    ring_prism(p, M['trim'], curve, inner, -D / 2 - 0.015, -D / 2 + 0.09)
    ring_prism(p, M['trim'], curve, inner, D / 2 - 0.09, D / 2 + 0.015)
    # alfiz: rectangular carved border framing the whole bay (jambs + lintel only -- never crosses
    # the doorway itself), proud of both faces
    for z0, z1 in ((-D / 2 - 0.03, -D / 2 + 0.03), (D / 2 - 0.03, D / 2 + 0.03)):
        p.box(-half_w + 0.08, H - 0.22, z0, half_w - 0.08, H - 0.08, z1, M['trim'], collide=False)
        p.box(-half_w + 0.08, 0.05, z0, -half_w + 0.22, H - 0.08, z1, M['trim'], collide=False)
        p.box(half_w - 0.22, 0.05, z0, half_w - 0.08, H - 0.08, z1, M['trim'], collide=False)
    return [p.build()]


def column(M):
    p = P('kit_column')
    BASE, SHAFT, H = 0.7, 0.5, 4.2
    base_h, chamfer_h = 0.34, 0.12
    cap_steps = ((0.10, 0.11), (0.16, 0.10), (0.23, 0.09))
    cap_h = sum(hh for _, hh in cap_steps) + 0.07  # + the flat abacus slab on top
    shaft_h = H - base_h - chamfer_h - cap_h
    p.box(-BASE / 2, 0, -BASE / 2, BASE / 2, base_h, BASE / 2, M['stone'])
    p.lathe([(BASE / 2 * 0.98, 0), (SHAFT / 2, chamfer_h)], M['trim'], sides=8, center=(0, base_h, 0))
    shaft_top = base_h + chamfer_h + shaft_h
    p.lathe([(SHAFT / 2 * 0.96, 0), (SHAFT / 2 * 0.90, shaft_h * 0.5), (SHAFT / 2 * 0.96, shaft_h)],
            M['stone'], sides=8, cap_top=False, center=(0, base_h + chamfer_h, 0))
    r0 = SHAFT / 2 * 0.96
    cy, rout = shaft_top, r0
    for (dr, hh) in cap_steps:
        rin, rout = rout, r0 + dr
        p.lathe([(rin, 0), (rout, hh * 0.45), (rout, hh)], M['trim'], sides=8, cap_bottom=False, center=(0, cy, 0))
        cy += hh
    p.box(-rout * 0.92, cy, -rout * 0.92, rout * 0.92, cy + 0.07, rout * 0.92, M['stone'], collide=False)
    p.colliders.append([-BASE / 2, 0, -BASE / 2, BASE / 2, cy + 0.07, BASE / 2, 'stone', False, True])
    return [p.build()]


def arch_span(M):
    p = P('kit_arch_span')
    W, D = 3.0, 0.55
    Y0, SPRING, APEX, YTOP = 3.0, 3.2, 4.3, 4.8
    half_w, half_o = W / 2, W / 2 * 0.70
    p.box(-half_w, Y0, -D / 2, half_w, SPRING, D / 2, M['trim'])
    curve = cusp_arch_pts(half_o, SPRING, APEX)
    spandrel_fill(p, M['stone'], half_w, YTOP, curve, half_o, -D / 2, D / 2)
    p.colliders.append([-half_w, Y0, -D / 2, half_w, YTOP, D / 2, 'stone', False, True])
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# 4-6: chhatri, onion dome, bangla roof
# ---------------------------------------------------------------------------------------------

def chhatri(M):
    p = P('kit_chhatri')
    add_chhatri(p, M, 0, 0, scale=1.0, base_y=0.0)
    p.colliders.append([-1.3, 0, -1.3, 1.3, 0.3, 1.3, 'stone', False, True])
    return [p.build()]


def dome_onion(M):
    p = P('kit_dome_onion')
    tip = add_dome(p, M, 0, 0, 0.0, 4.0, 4.6, 5.5, sides=20, finial_h=0.5, drum_h=1.0, neck_h=0.18)
    p.colliders.append([-2.0, 0, -2.0, 2.0, 1.0, 2.0, 'stone', False, True])
    ob = p.build()
    socket = bpy.data.objects.new('socket_top', None)
    socket.location = Vector(g2b(tip))
    socket.parent = ob
    bpy.context.scene.collection.objects.link(socket)
    return [ob, socket]


def bangla_roof(M):
    p = P('kit_bangla_roof')
    W, D, H, THICK = 8.0, 5.0, 2.6, 0.25
    NSEG = 7
    seg_w = W / NSEG
    for i in range(NSEG):
        x0, x1 = -W / 2 + i * seg_w, -W / 2 + (i + 1) * seg_w
        tc = (x0 + x1) / 2 / (W / 2)
        scale = 1.0 - 0.16 * max(0.0, abs(tc) - 0.30) / 0.70
        ring = roof_ring(D / 2, H * scale, 0.18 * scale, THICK)
        p.prism(ring, x0, x1, M['stone'], across='x')
    p.colliders.append([-W / 2, 0.0, -D / 2, W / 2, H, D / 2, 'stone', False, True])
    for s in (-1, 1):
        cyl_base(p, (s * W / 2 * 0.94, H * 0.96, 0), 'y', 0.22, 0.028, M['metal'], seg=6)
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# 7: jharokha
# ---------------------------------------------------------------------------------------------

def jharokha(M):
    p = P('kit_jharokha')
    W, H, PROJ = 2.6, 3.4, 1.1
    hw = W / 2
    # stepped corbels, y 0..0.6, growing projection
    steps = 4
    for i in range(steps):
        y0, y1 = i * 0.6 / steps, (i + 1) * 0.6 / steps
        z1 = 0.20 + (PROJ - 0.20) * (i + 1) / steps
        p.box(-hw * (0.55 + 0.1 * i / steps), y0, 0.0, hw * (0.55 + 0.1 * i / steps), y1, z1, M['trim'])
    p.colliders.append([-hw, 0, 0, hw, 0.6, PROJ, 'stone', False, True])
    # floor slab
    p.box(-hw, 0.6, 0.0, hw, 0.72, PROJ, M['stone'])
    # low railing on front + 2 sides (jaali-ish balusters)
    rail_y0, rail_y1 = 0.72, 1.05
    for x in [-hw + 0.08 * i for i in range(0)]:
        pass
    n_bal = 9
    for i in range(n_bal + 1):
        x = -hw + 0.15 + (W - 0.30) * i / n_bal
        p.box(x - 0.025, rail_y0, PROJ - 0.05, x + 0.025, rail_y1, PROJ, M['trim'], collide=False)
    p.box(-hw, rail_y1 - 0.06, PROJ - 0.06, hw, rail_y1, PROJ, M['trim'], collide=False)
    for s in (-1, 1):
        n_side = 4
        for i in range(n_side + 1):
            z = 0.10 + (PROJ - 0.15) * i / n_side
            p.box(s * hw - 0.025, rail_y0, z - 0.025, s * hw + 0.025, rail_y1, z + 0.025, M['trim'], collide=False)
    # 3 small cusped arches on 4 slender columns
    col_y0, col_y1 = 0.72, 2.65
    xs = [-hw + 0.06, -hw / 3, hw / 3, hw - 0.06]
    for x in xs:
        cyl_base(p, (x, col_y0, PROJ * 0.55), 'y', col_y1 - col_y0, 0.045, M['stone'], seg=8)
    bay_half = (xs[1] - xs[0]) / 2
    for i in range(3):
        cx = (xs[i] + xs[i + 1]) / 2
        curve = cusp_arch_pts(bay_half * 0.86, col_y1 - 0.55, col_y1, lobes=5, cusp=0.045)
        curve = [(x + cx, y) for x, y in curve]
        arch_niche_fill(p, M['trim'], cx - bay_half * 0.95, cx + bay_half * 0.95, col_y1 + 0.10, curve,
                         PROJ * 0.55 - 0.05, PROJ * 0.55 + 0.05)
    p.colliders.append([-hw, col_y1 - 0.1, PROJ * 0.55 - 0.08, hw, col_y1 + 0.10, PROJ * 0.55 + 0.08, 'stone', False, True])
    # curved bangla canopy on top: a one-sided eave curving out from the wall over the full width
    canopy_y0 = col_y1 + 0.10
    ring = chajja_ring(PROJ + 0.15, canopy_y0 + 0.15, canopy_y0 - 0.35, 0.09, n=10)
    p.prism(ring, -hw - 0.1, hw + 0.1, M['stone'], across='x')
    ob = p.build()
    ob.location = Vector(g2b((0, 0, 0)))
    return [ob]




# ---------------------------------------------------------------------------------------------
# 8-9: jaali, kangura
# ---------------------------------------------------------------------------------------------

def jaali(M):
    p = P('kit_jaali')
    W, H, D = 2.0, 2.6, 0.08
    hw = W / 2
    FT = 0.12
    p.box(-hw, 0, -D / 2, -hw + FT, H, D / 2, M['stone'])
    p.box(hw - FT, 0, -D / 2, hw, H, D / 2, M['stone'])
    p.box(-hw + FT, 0, -D / 2, hw - FT, FT, D / 2, M['stone'])
    p.box(-hw + FT, H - FT, -D / 2, hw - FT, H, D / 2, M['stone'])
    p.colliders.append([-hw, 0, -D / 2, hw, H, D / 2, 'stone', False, True])
    x0, x1 = -hw + FT, hw - FT
    y0, y1 = FT, H - FT
    bar = 0.045
    ncols, nrows = 7, 9
    for i in range(ncols + 1):
        x = x0 + (x1 - x0) * i / ncols
        p.box(x - bar / 2, y0, -D * 0.28, x + bar / 2, y1, D * 0.28, M['stone'], collide=False)
    for j in range(nrows + 1):
        y = y0 + (y1 - y0) * j / nrows
        p.box(x0, y - bar / 2, -D * 0.28, x1, y + bar / 2, D * 0.28, M['stone'], collide=False)
    for i in range(1, ncols):
        for j in range(1, nrows):
            x = x0 + (x1 - x0) * i / ncols
            y = y0 + (y1 - y0) * j / nrows
            p.box(x - bar * 1.4, y - bar * 1.4, -D * 0.32, x + bar * 1.4, y + bar * 1.4, D * 0.32, M['trim'], collide=False)
    return [p.build()]


def kangura(M):
    p = P('kit_kangura')
    W, H, D = 3.0, 1.2, 0.45
    base_h = 0.5
    hw = W / 2
    p.box(-hw, 0, -D / 2, hw, base_h, D / 2, M['stone'])
    p.colliders.append([-hw, 0, -D / 2, hw, base_h, D / 2, 'stone', False, True])
    n = 5
    mw = W / n
    body_h = (H - base_h) * 0.72
    for i in range(n):
        x0 = -hw + i * mw + mw * 0.12
        x1 = x0 + mw * 0.76
        cx = (x0 + x1) / 2
        mr = (x1 - x0) / 2
        p.box(x0, base_h, -D / 2 * 0.85, x1, base_h + body_h, D / 2 * 0.85, M['stone'])
        p.lathe([(mr, 0.0), (mr * 0.55, (H - base_h - body_h) * 0.6), (0.0, H - base_h - body_h)],
                M['trim'], sides=8, center=(cx, base_h + body_h, 0.0))
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# 10: burj (octagonal bastion)
# ---------------------------------------------------------------------------------------------

def burj(M):
    p = P('kit_burj')
    ACROSS, H = 10.0, 10.2
    STRING_Y = 7.0
    r_out = ACROSS / 2 / math.cos(math.pi / 8)
    r_top = r_out * 0.90
    profile = [
        (r_out, 0.0),
        (r_out * 0.99, STRING_Y * 0.5),
        (r_out * 0.97, STRING_Y - 0.15),
        (r_out * 1.02, STRING_Y - 0.08),
        (r_out * 1.02, STRING_Y + 0.05),
        (r_top, H),
    ]
    p.lathe(profile, M['stone'], sides=8)
    p.colliders.append([-r_out - 0.05, 0, -r_out - 0.05, r_out + 0.05, H, r_out + 0.05, 'stone', False, True])
    # blind arches: shallow recessed cusped-arch panels on each of the 8 faces
    for i in range(8):
        deg = i * 45 + 22.5
        rad = math.radians(deg)
        fwd = (math.cos(rad), 0.0, math.sin(rad))
        right = (-math.sin(rad), 0.0, math.cos(rad))
        up = (0.0, 1.0, 0.0)
        cx, cz = (r_out * 0.985) * math.cos(rad), (r_out * 0.985) * math.sin(rad)
        p.obox((cx, STRING_Y * 0.42, cz), right, up, fwd, (2.4, STRING_Y * 0.66, 0.08), M['trim'])
        p.obox((cx, STRING_Y * 0.08, cz), right, up, fwd, (2.0, STRING_Y * 0.16, 0.05), M['stone'])
    # kangura parapet ring on top, gap on the -X side (the stair arrives there)
    ring_r = r_top * 0.90
    n_merlons = 20
    gap0, gap1 = 155, 205
    for i in range(n_merlons):
        deg = i * 360 / n_merlons
        d = (deg + 180) % 360 - 180  # not needed, just check range directly on 0..360
        if gap0 <= deg <= gap1:
            continue
        rad = math.radians(deg)
        fwd = (math.cos(rad), 0.0, math.sin(rad))
        right = (-math.sin(rad), 0.0, math.cos(rad))
        up = (0.0, 1.0, 0.0)
        cx, cz = ring_r * math.cos(rad), ring_r * math.sin(rad)
        p.obox((cx, H + 0.55, cz), right, up, fwd, (0.60, 1.1, 0.32), M['stone'])
        p.obox((cx, H + 1.16, cz), right, up, fwd, (0.42, 0.20, 0.22), M['trim'])
    p.lathe([(ring_r - 0.35, 0.0), (ring_r - 0.35, 0.02)], M['trim'], sides=n_merlons, center=(0, H, 0))
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# 11-12: door frame, shutter window
# ---------------------------------------------------------------------------------------------

def door_frame(M):
    p = P('kit_door_frame')
    OPEN_W, OPEN_H = 3.0, 3.4
    W, H, D = 3.8, 4.2, 0.5
    half_w, half_o = W / 2, OPEN_W / 2
    SPRING = OPEN_H * 0.72
    p.box(-half_w, 0, -D / 2, -half_o, SPRING, D / 2, M['stone'])
    p.box(half_o, 0, -D / 2, half_w, SPRING, D / 2, M['stone'])
    curve = cusp_arch_pts(half_o, SPRING, OPEN_H, lobes=7, cusp=0.07)
    spandrel_fill(p, M['stone'], half_w, H, curve, half_o, -D / 2, D / 2)
    p.colliders.append([-half_w, SPRING, -D / 2, half_w, H, D / 2, 'stone', False, True])
    inner = offset_curve(curve, 0.15, dx_scale=0.90)
    ring_prism(p, M['trim'], curve, inner, -D / 2 - 0.02, -D / 2 + 0.10)
    ring_prism(p, M['trim'], curve, inner, D / 2 - 0.10, D / 2 + 0.02)
    return [p.build()]


def shutter_window(M):
    p = P('kit_shutter_window')
    W, H, D = 1.6, 2.2, 0.15
    hw = W / 2
    FT = 0.14  # plaster surround frame thickness -- a real opening, not a solid block
    ihw, iy0, iy1 = hw - FT, FT, H - FT
    p.box(-hw, 0, -D / 2, -ihw, H, D / 2, M['plaster'])
    p.box(ihw, 0, -D / 2, hw, H, D / 2, M['plaster'])
    p.box(-ihw, 0, -D / 2, ihw, iy0, D / 2, M['plaster'])
    p.box(-ihw, iy1, -D / 2, ihw, H, D / 2, M['plaster'])
    p.colliders.append([-hw, 0, -D / 2, hw, H, D / 2, 'plaster', False, True])
    p.box(-hw - 0.06, H - 0.14, D / 2 - 0.02, hw + 0.06, H, D / 2 + 0.06, M['wood'], collide=False)
    p.box(-hw - 0.06, 0.0, D / 2 - 0.02, hw + 0.06, 0.12, D / 2 + 0.06, M['wood'], collide=False)
    inner_hw = ihw - 0.02
    z_front = 0.0
    louvred_shutter(p, M, -inner_hw / 2, iy0 + 0.02, iy1 - 0.02, inner_hw / 2 - 0.01, M['woodPaint'], z=z_front)
    louvred_shutter(p, M, inner_hw / 2, iy0 + 0.02, iy1 - 0.02, inner_hw / 2 - 0.01, M['woodPaint'], z=z_front)
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# 13-17: wood balcony, marble rail, wood rail, wood pillar, fountain
# ---------------------------------------------------------------------------------------------

def wood_balcony(M):
    p = P('kit_wood_balcony')
    W, H, PROJ = 3.0, 3.0, 1.0
    hw = W / 2
    floor_y = 1.9
    n_brackets = 4
    for i in range(n_brackets):
        x = -hw + 0.3 + (W - 0.6) * i / (n_brackets - 1)
        by0, bz0 = floor_y - 0.55, 0.05
        by1, bz1 = floor_y, PROJ - 0.05
        length = math.hypot(by1 - by0, bz1 - bz0)
        fwd = (0.0, (by1 - by0) / length, (bz1 - bz0) / length)
        right = (1.0, 0.0, 0.0)
        up = (0.0, -fwd[2], fwd[1])  # right x fwd
        cx, cy, cz = x, (by0 + by1) / 2, (bz0 + bz1) / 2
        p.obox((cx, cy, cz), right, up, fwd, (0.10, 0.09, length), M['wood'])
    p.box(-hw, floor_y, 0.0, hw, floor_y + 0.10, PROJ, M['wood'])
    p.colliders.append([-hw, floor_y - 0.6, 0.0, hw, floor_y + 0.10, PROJ, 'wood', False, True])
    rail_y0, rail_y1 = floor_y + 0.10, H - 0.35
    n_bal = 11
    for i in range(n_bal + 1):
        x = -hw + 0.1 + (W - 0.2) * i / n_bal
        p.lathe([(0.035, 0.0), (0.05, 0.15), (0.03, 0.30), (0.05, 0.45), (0.03, rail_y1 - rail_y0)],
                M['wood'], sides=8, center=(x, rail_y0, PROJ - 0.06))
    p.box(-hw, rail_y1 - 0.05, PROJ - 0.10, hw, rail_y1, PROJ - 0.02, M['wood'], collide=False)
    post_h = H - rail_y1
    for x in (-hw + 0.05, hw - 0.05):
        cyl_base(p, (x, rail_y1, PROJ - 0.06), 'y', post_h, 0.045, M['wood'], seg=8)
    ring = chajja_ring(PROJ + 0.15, H, H - 0.35, 0.06, n=8)
    p.prism(ring, -hw - 0.1, hw + 0.1, M['wood'], across='x')
    return [p.build()]


def rail_marble(M):
    p = P('kit_rail_marble')
    W, H, D = 3.0, 1.0, 0.25
    hw = W / 2
    p.box(-hw, 0, -D / 2, hw, 0.08, D / 2, M['stone'])
    p.box(-hw, H - 0.10, -D / 2, hw, H, D / 2, M['stone'])
    p.colliders.append([-hw, 0, -D / 2, hw, H, D / 2, 'stone', False, True])
    n = 9
    for i in range(n + 1):
        x = -hw + 0.15 + (W - 0.30) * i / n
        p.lathe([(0.05, 0.0), (0.08, 0.15), (0.045, 0.35), (0.08, 0.55), (0.05, H - 0.18)],
                M['stone'], sides=8, cap_top=False, center=(x, 0.08, 0.0))
    return [p.build()]


def rail_wood(M):
    p = P('kit_rail_wood')
    W, H, D = 3.0, 1.0, 0.15
    hw = W / 2
    p.box(-hw, 0, -D / 2, hw, 0.08, D / 2, M['wood'])
    p.box(-hw, H - 0.08, -D / 2, hw, H, D / 2, M['wood'])
    p.colliders.append([-hw, 0, -D / 2, hw, H, D / 2, 'wood', False, True])
    x0, x1 = -hw + 0.06, hw - 0.06
    y0, y1 = 0.08, H - 0.08
    bar = 0.03
    ncols = 11
    for i in range(ncols + 1):
        x = x0 + (x1 - x0) * i / ncols
        p.box(x - bar / 2, y0, -D * 0.25, x + bar / 2, y1, D * 0.25, M['wood'], collide=False)
    for j in range(3):
        y = y0 + (y1 - y0) * (j + 1) / 4
        p.box(x0, y - bar / 2, -D * 0.25, x1, y + bar / 2, D * 0.25, M['wood'], collide=False)
    return [p.build()]


def pillar_wood(M):
    p = P('kit_pillar_wood')
    H, T = 3.9, 0.3
    r = T / 2
    base_h = 0.35
    cap_h = 0.40
    shaft_h = H - base_h - cap_h
    p.lathe([(r * 1.3, 0.0), (r * 0.75, base_h * 0.4), (r * 0.95, base_h)], M['wood'], sides=10)
    p.lathe([(r * 0.85, 0.0), (r * 0.82, shaft_h * 0.5), (r * 0.85, shaft_h)], M['wood'], sides=10, center=(0, base_h, 0))
    cy = base_h + shaft_h
    p.lathe([(r * 0.85, 0.0), (r * 1.3, 0.15), (r * 1.3, 0.30), (r * 1.7, cap_h)], M['wood'], sides=10, cap_top=False, center=(0, cy, 0))
    top_y = cy + cap_h
    p.box(-0.55, top_y, -0.08, 0.55, top_y + 0.07, 0.08, M['wood'], collide=False)
    p.colliders.append([-r, 0, -r, r, top_y + 0.07, r, 'wood', False, True])
    return [p.build()]


def fountain(M):
    p = P('kit_fountain')
    ACROSS = 4.0
    r_out = ACROSS / 2 / math.cos(math.pi / 8)
    r_in = r_out - 0.3
    p.lathe([(r_out, 0.0), (r_out, 0.5), (r_in, 0.5), (r_in, 0.05)], M['stone'], sides=8, cap_bottom=True, cap_top=False)
    p.colliders.append([-r_out, 0, -r_out, r_out, 0.5, r_out, 'stone', False, True])
    p.lathe([(r_in, 0.05)], M['trim'], sides=8, cap_bottom=True, cap_top=False)
    p.lathe([(r_in * 0.97, 0.35)], M['mirror'], sides=8, cap_bottom=True, cap_top=False)
    p.lathe([(0.30, 0.0), (0.30, 0.35), (0.14, 0.35), (0.14, 0.55), (0.0, 0.62)], M['trim'], sides=10)
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# 18-20: stepped cistern, ladder, kite
# ---------------------------------------------------------------------------------------------

def cistern(M):
    p = P('kit_cistern')
    OUTER, POOL, DEPTH = 7.0, 3.0, 2.5
    ho, hp = OUTER / 2, POOL / 2
    n = 6
    for i in range(n):
        h0 = ho - (ho - hp) * i / n
        h1 = ho - (ho - hp) * (i + 1) / n
        y0 = -DEPTH * i / n
        y1 = -DEPTH * (i + 1) / n
        p.box(-h0, y1, -h0, -h1, y1 + 0.06, h1, M['stone'])
        p.box(h1, y1, -h0, h0, y1 + 0.06, h1, M['stone'])
        p.box(-h1, y1, -h0, h1, y1 + 0.06, -h1, M['stone'])
        p.box(-h1 - 0.02, y1, -h1, -h1, y0, h1, M['stone'], collide=False)
        p.box(h1, y1, -h1, h1 + 0.02, y0, h1, M['stone'], collide=False)
        p.box(-h1, y1, -h1 - 0.02, h1, y0, -h1, M['stone'], collide=False)
        p.colliders.append([round(v, 4) for v in (-h0, y1, -h0, h0, y1 + 0.06, h0)] + ['stone', False, True])
    p.box(-ho, -DEPTH, hp, ho, 0, ho, M['stone'])
    p.colliders.append([-ho, -DEPTH, hp, ho, 0, ho, 'stone', False, True])
    p.box(-hp, -DEPTH - 0.15, -hp, hp, -DEPTH, hp, M['trim'])
    p.box(-hp * 0.95, -DEPTH + 0.02, -hp * 0.95, hp * 0.95, -DEPTH + 0.035, hp * 0.95, M['mirror'], collide=False)
    p.colliders.append([-hp, -DEPTH - 0.15, -hp, hp, -DEPTH, hp, 'stone', False, True])
    return [p.build()]


def ladder(M):
    p = P('kit_ladder')
    W, H, D = 0.55, 3.0, 0.08
    hw = W / 2
    for s in (-1, 1):
        p.box(s * hw - 0.03, 0, -D / 2, s * hw + 0.03, H, D / 2, M['wood'])
    n = 9
    for i in range(n):
        y = 0.25 + (H - 0.5) * i / (n - 1)
        p.box(-hw + 0.03, y, -D / 2 * 0.6, hw - 0.03, y + 0.04, D / 2 * 0.6, M['wood'], collide=False)
    p.colliders.append([-hw, 0, -D / 2, hw, H, D / 2, 'wood', False, True])
    return [p.build()]


def kite(M):
    p = P('kit_kite')
    W, HH = 0.6, 0.7
    top, bot = (0.0, HH * 0.62, 0.0), (0.0, -HH * 0.38, 0.0)
    right, left = (W / 2, 0.05, 0.0), (-W / 2, 0.05, 0.0)
    idx = p._mi(M['paper'])
    vt, vb, vr, vl = (p.bm.verts.new(g2b(x)) for x in (top, bot, right, left))
    p.bm.faces.new([vt, vr, vb, vl]).material_index = idx
    vt2, vb2, vr2, vl2 = (p.bm.verts.new(g2b(x)) for x in (top, bot, right, left))
    p.bm.faces.new([vt2, vl2, vb2, vr2]).material_index = idx
    p.box(-W / 2, 0.05 - 0.012, -0.005, W / 2, 0.05 + 0.012, 0.005, M['wood'], collide=False)
    p.box(-0.012, bot[1] - 0.005, -0.005, 0.012, top[1] + 0.005, 0.005, M['wood'], collide=False)
    ty = bot[1]
    for i in range(4):
        yy = ty - 0.08 - i * 0.10
        p.box(-0.03, yy - 0.04, -0.004, 0.03, yy + 0.04, 0.004, M['cloth'], collide=False)
    p.box(-0.006, ty - 0.5, -0.004, 0.006, ty, 0.004, M['wood'], collide=False)
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# 21-22: Sheesh Mahal mirror-work
# ---------------------------------------------------------------------------------------------

def mirror_panel(M):
    p = P('kit_mirror_panel')
    W, H, D = 3.0, 4.0, 0.12
    hw = W / 2
    p.box(-hw, 0, 0, hw, H, D, M['plaster'])
    p.colliders.append([-hw, 0, 0, hw, H, D, 'plaster', False, True])
    niche_hw = hw * 0.7
    curve = cusp_arch_pts(niche_hw, H * 0.18, H * 0.85, lobes=7, cusp=0.06)
    inner = offset_curve(curve, 0.10, dx_scale=0.94)
    ring_prism(p, M['trim'], curve, inner, D - 0.015, D + 0.03)
    z0, z1 = D - 0.01, D + 0.025
    p.box(-hw + 0.10, H - 0.24, z0, hw - 0.10, H - 0.10, z1, M['trim'], collide=False)
    p.box(-hw + 0.10, 0.10, z0, -hw + 0.24, H - 0.10, z1, M['trim'], collide=False)
    p.box(hw - 0.24, 0.10, z0, hw - 0.10, H - 0.10, z1, M['trim'], collide=False)
    p.box(-hw + 0.10, 0.10, z0, hw - 0.10, 0.24, z1, M['trim'], collide=False)
    import random
    rng = random.Random(11)
    n_facets = 320
    for _ in range(n_facets):
        x = rng.uniform(-hw + 0.28, hw - 0.28)
        y = rng.uniform(0.28, H - 0.28)
        add_mirror_facet(p, M, x, y, D + 0.006, 0.10, rng)
    return [p.build()]


def mirror_medallion(M):
    p = P('kit_mirror_medallion')
    DIA, D = 0.8, 0.1
    R = DIA / 2
    inner_rim = circle_pts(R * 0.88, 20)
    annulus(p, M['metal'], R, R * 0.88, 0.0, D * 0.35, sides=20)
    p.colliders.append([-R, -R, 0, R, R, D * 0.35, 'stone', False, True])
    p.prism(inner_rim, 0.0, D * 0.5, M['trim'], across='z')
    boss_in = circle_pts(R * 0.05, 12)
    annulus(p, M['mirror'], R * 0.30, R * 0.05, D * 0.5, D, sides=12)
    p.prism(boss_in, D * 0.5, D, M['mirror'], across='z')
    import random
    rng = random.Random(3)
    for rr, n in ((R * 0.45, 14), (R * 0.62, 20), (R * 0.78, 26)):
        for k in range(n):
            a = 2 * math.pi * k / n
            x, y = rr * math.cos(a), rr * math.sin(a)
            add_mirror_facet(p, M, x, y, D * 0.42, 0.045, rng)
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# 23: baradari roof (with corner chhatris)
# ---------------------------------------------------------------------------------------------

def baradari_roof(M):
    p = P('kit_baradari_roof')
    W, D, THICK = 12.0, 12.0, 0.4
    hw, hd = W / 2, D / 2
    p.box(-hw, 0, -hd, hw, THICK, hd, M['stone'])
    p.colliders.append([-hw, 0, -hd, hw, THICK, hd, 'stone', False, True])
    proj = 0.8

    def chajja_edge(u0_base, sign, axis_across, span0, span1):
        prof = [(u0_base, THICK), (u0_base + sign * proj, THICK - 0.30),
                (u0_base + sign * proj, THICK - 0.34), (u0_base, THICK - 0.08)]
        p.prism(prof, span0, span1, M['stone'], across=axis_across)

    chajja_edge(hd, 1, 'x', -hw - proj, hw + proj)
    chajja_edge(-hd, -1, 'x', -hw - proj, hw + proj)
    chajja_edge(hw, 1, 'z', -hd - proj, hd + proj)
    chajja_edge(-hw, -1, 'z', -hd - proj, hd + proj)

    ph, inset = 0.6, 0.3
    px0, px1 = -hw + inset, hw - inset
    pz0, pz1 = -hd + inset, hd - inset

    def pierced_run(a0, a1, fixed, axis):
        n = max(4, int((a1 - a0) / 0.55))
        seg = (a1 - a0) / n
        for i in range(n):
            if i % 3 == 2:
                continue
            a = a0 + i * seg
            if axis == 'x':
                p.box(a, THICK, fixed - 0.06, a + seg * 0.8, THICK + ph, fixed + 0.06, M['stone'], collide=False)
            else:
                p.box(fixed - 0.06, THICK, a, fixed + 0.06, THICK + ph, a + seg * 0.8, M['stone'], collide=False)

    pierced_run(px0, px1, pz0, 'x')
    pierced_run(px0, px1, pz1, 'x')
    pierced_run(pz0, pz1, px0, 'z')
    pierced_run(pz0, pz1, px1, 'z')

    for sx in (-1, 1):
        for sz in (-1, 1):
            add_chhatri(p, M, sx * (hw - 1.0), sz * (hd - 1.0), scale=0.6, base_y=THICK)
    return [p.build()]


# ---------------------------------------------------------------------------------------------
# driver
# ---------------------------------------------------------------------------------------------

def save(name, objs):
    path = os.path.join(OUT, f'{name}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_apply=True, export_yup=True)
    print('LAHORE-KIT', name, len(objs), len(bpy.data.meshes) and sum(len(m.polygons) for m in bpy.data.meshes))


def piece(name, fn):
    reset()
    lib._mats.clear()
    M = mats()
    objs = fn(M)
    save(name, objs)


PIECES = [
    ('kit_arch_bay', arch_bay), ('kit_column', column), ('kit_arch_span', arch_span),
    ('kit_chhatri', chhatri), ('kit_dome_onion', dome_onion), ('kit_bangla_roof', bangla_roof),
    ('kit_jharokha', jharokha), ('kit_jaali', jaali), ('kit_kangura', kangura), ('kit_burj', burj),
    ('kit_door_frame', door_frame), ('kit_shutter_window', shutter_window),
    ('kit_wood_balcony', wood_balcony), ('kit_rail_marble', rail_marble), ('kit_rail_wood', rail_wood),
    ('kit_pillar_wood', pillar_wood), ('kit_fountain', fountain), ('kit_cistern', cistern),
    ('kit_ladder', ladder), ('kit_kite', kite), ('kit_mirror_panel', mirror_panel),
    ('kit_mirror_medallion', mirror_medallion), ('kit_baradari_roof', baradari_roof),
]

os.makedirs(OUT, exist_ok=True)
for name, fn in PIECES:
    short = name[4:] if name.startswith('kit_') else name
    if ONLY and short not in ONLY and name not in ONLY:
        continue
    piece(name, fn)
