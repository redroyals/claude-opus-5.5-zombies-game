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
        shade=material('shade', '#3a2a22', 0.95, 0.0),
        inlay=material('inlay', '#e8e0d0', 0.3, 0.0),
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
# v2 (art pass 2): higher-fidelity pieces. Engaged/relief pieces have their back on z = 0 and project +Z, so the
# game can stick them on any wall face. All sit on y = 0.
# ---------------------------------------------------------------------------------------------

def half_lathe(p, profile, mat, sides=8, center=(0.0, 0.0, 0.0), z_scale=1.0):
    """Front half (+Z) of a surface of revolution, for engaged pilasters/bases against a wall at z = center.z.
    `z_scale` squashes the projection (an engaged shaft stands proud by only a fraction of its width)."""
    cx, cy, cz = center
    idx = p._mi(mat)
    rings = []
    for (r, y) in profile:
        ring = []
        for s in range(sides + 1):
            a = math.pi * s / sides  # 0..pi : +x .. -x through +z
            ring.append(p.bm.verts.new(g2b((cx + r * math.cos(a), cy + y, cz + max(r, 1e-4) * math.sin(a) * z_scale))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(sides):
            p.bm.faces.new([rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s]]).material_index = idx
    # top/bottom caps (half discs)
    for ring, (r, y), flip in ((rings[0], profile[0], True), (rings[-1], profile[-1], False)):
        if r < 1e-4:
            continue
        c = p.bm.verts.new(g2b((cx, cy + y, cz)))
        for s in range(sides):
            f = [c, ring[s + 1], ring[s]] if flip else [c, ring[s], ring[s + 1]]
            p.bm.faces.new(f).material_index = idx
    return p


def pilaster_base(M):
    """Engaged pilaster base, 0.62 tall: plinth block, cyma moulding and a kumbha (vase) swell. Width 0.56."""
    p = P('kit_pilaster_base')
    p.box(-0.3, 0, 0, 0.3, 0.18, 0.2, M['stone'], collide=False)
    p.box(-0.27, 0.18, 0, 0.27, 0.24, 0.17, M['trim'], collide=False)
    half_lathe(p, [(0.24, 0.24), (0.26, 0.29), (0.2, 0.34), (0.23, 0.44), (0.25, 0.5), (0.2, 0.56), (0.17, 0.62)], M['stone'], sides=6, z_scale=0.62)
    return [p.build()]


def pilaster_shaft(M):
    """Engaged fluted shaft, 1 m unit height (the game scales it in Y). 7 flutes across the front."""
    p = P('kit_pilaster_shaft')
    w, d = 0.17, 0.11
    p.box(-w, 0, 0, w, 1.0, d * 0.55, M['stone'], collide=False)
    n = 4
    for i in range(n):
        a = math.pi * (i + 0.5) / n
        x, z = w * 0.92 * math.cos(a), d * math.sin(a)
        fw = 0.03
        p.obox((x, 0.5, max(z, 0.02) * 0.9), (math.sin(a), 0, -math.cos(a)), (0, 1, 0), (math.cos(a), 0, math.sin(a)), (fw * 1.4, 1.0, 0.035), M['stone'])
    return [p.build()]


def pilaster_cap(M):
    """Bell capital with lotus-leaf facets, a carved necking band, abacus and a small corbel. 0.72 tall."""
    p = P('kit_pilaster_cap')
    half_lathe(p, [(0.17, 0.0), (0.2, 0.04), (0.17, 0.08)], M['trim'], sides=6, z_scale=0.65)
    half_lathe(p, [(0.16, 0.08), (0.22, 0.2), (0.3, 0.38)], M['stone'], sides=8, z_scale=0.62)
    # leaf tips around the bell
    for i in range(3):
        a = math.pi * (i + 0.5) / 3
        p.obox((0.25 * math.cos(a), 0.3, 0.16 * math.sin(a) + 0.02), (math.sin(a), 0, -math.cos(a)), (0, 1, 0), (math.cos(a), 0, math.sin(a)), (0.1, 0.16, 0.04), M['trim'])
    p.box(-0.33, 0.38, 0, 0.33, 0.47, 0.24, M['trim'], collide=False)
    p.box(-0.3, 0.47, 0, 0.3, 0.52, 0.21, M['stone'], collide=False)
    # corbel with a scroll
    p.prism([(0.0, 0.52), (0.26, 0.52), (0.26, 0.6), (0.18, 0.66), (0.08, 0.72), (0.0, 0.72)], -0.12, 0.12, M['stone'], across='x')
    return [p.build()]


def niche(M):
    """Blind cusped-arch niche panel in relief (3.0 x 3.6 m, 0.16 deep): alfiz frame, cusped arch ring with an
    inlay border, spandrel roundels, a carved dado panel and a recessed (darker) arch field."""
    p = P('kit_niche')
    W, H = 3.0, 3.6
    hw = W / 2
    SP, AP = 1.95, 3.05
    hopen = 1.02
    # recessed field (sits just proud of the wall, dark 'shade' slot so it reads as depth)
    curve = cusp_arch_pts(hopen, SP, AP, n=22, lobes=7, cusp=0.07)
    field = [(-hopen, 0.62)] + curve + [(hopen, 0.62)]
    p.prism([(x, y) for x, y in field], 0.004, 0.012, M['shade'], across='z')
    # jambs
    for s in (-1, 1):
        p.box(s * hopen, 0.55, 0, s * (hopen + 0.2), SP, 0.12, M['stone'], collide=False)
        p.box(s * (hopen + 0.02), 0.55, 0.1, s * (hopen + 0.08), SP, 0.15, M['trim'], collide=False)
    # arch ring (outer + inner inlay line)
    inner = offset_curve(curve, 0.0)
    outer = [(x * (hopen + 0.2) / hopen, SP + (y - SP) * 1.05 + 0.02) for x, y in cusp_arch_pts(hopen, SP, AP, n=22, lobes=0, cusp=0.0)]
    outer[0] = (-(hopen + 0.2), SP); outer[-1] = (hopen + 0.2, SP)
    ring_prism(p, M['stone'], outer, inner, 0.0, 0.12)
    band_o = [(x * (hopen + 0.12) / hopen, SP + (y - SP) * 1.02 + 0.01) for x, y in cusp_arch_pts(hopen, SP, AP, n=22, lobes=0, cusp=0.0)]
    band_i = [(x * (hopen + 0.06) / hopen, SP + (y - SP) * 1.0) for x, y in cusp_arch_pts(hopen, SP, AP, n=22, lobes=0, cusp=0.0)]
    band_o[0] = (-(hopen + 0.12), SP); band_o[-1] = (hopen + 0.12, SP); band_i[0] = (-(hopen + 0.06), SP); band_i[-1] = (hopen + 0.06, SP)
    ring_prism(p, M['trim'], band_o, band_i, 0.1, 0.15)
    # alfiz (rectangular frame) + spandrel roundels
    for x0, x1, y0, y1 in ((-hw, -hw + 0.12, 0.5, H), (hw - 0.12, hw, 0.5, H), (-hw, hw, H - 0.14, H)):
        p.box(x0, y0, 0, x1, y1, 0.1, M['stone'], collide=False)
    for x0, x1, y0, y1 in ((-hw + 0.03, -hw + 0.08, 0.5, H - 0.03), (hw - 0.08, hw - 0.03, 0.5, H - 0.03), (-hw + 0.03, hw - 0.03, H - 0.09, H - 0.05)):
        p.box(x0, y0, 0.1, x1, y1, 0.13, M['trim'], collide=False)
    for s in (-1, 1):
        cxr = s * (hopen + 0.2 + (hw - 0.12 - hopen - 0.2) / 2 + 0.02)
        annulus(p, M['trim'], 0.2, 0.13, 0.0, 0.1, center=(cxr, AP - 0.05), sides=10)
        p.prism(circle_pts(0.13, 10, cxr, AP - 0.05), 0.0, 0.06, M['inlay'], across='z')
    # dado panel under the niche
    p.box(-hw, 0, 0, hw, 0.12, 0.16, M['stone'], collide=False)
    p.box(-hw + 0.06, 0.12, 0, hw - 0.06, 0.5, 0.08, M['stone'], collide=False)
    p.box(-hw + 0.16, 0.18, 0.08, hw - 0.16, 0.44, 0.1, M['inlay'], collide=False)
    p.box(-hw, 0.5, 0, hw, 0.56, 0.14, M['trim'], collide=False)
    return [p.build()]


def bracket(M):
    """Chhajja corbel: a carved S-scroll with a pendant bud, 0.18 wide, 0.7 tall, 0.72 deep (hangs below y = 0)."""
    p = P('kit_bracket')
    prof = [(0.0, 0.0), (0.72, 0.0), (0.72, -0.08), (0.56, -0.16), (0.44, -0.3), (0.26, -0.4), (0.12, -0.6), (0.0, -0.7)]
    p.prism(prof, -0.09, 0.09, M['stone'], across='x')
    p.lathe([(0.0, -0.2), (0.055, -0.13), (0.0, -0.05)], M['stone'], sides=5, center=(0, -0.12, 0.62))
    p.box(-0.1, -0.02, 0.0, 0.1, 0.0, 0.74, M['trim'], collide=False)
    return [p.build()]


def merlon(M):
    """Kangura merlon for one 1.2 m module: base course + a cusped 5-lobe leaf-shaped crest with a pierced slit."""
    p = P('kit_merlon')
    W, D = 1.2, 0.42
    hw = W / 2
    p.box(-hw, 0, -D / 2, hw, 0.34, D / 2, M['stone'], collide=False)
    p.box(-hw - 0.02, 0.3, -D / 2 - 0.02, hw + 0.02, 0.36, D / 2 + 0.02, M['trim'], collide=False)
    bw = 0.36
    pts = [(-bw, 0.36), (bw, 0.36), (bw, 0.8)]
    for i in range(1, 8):
        t = i / 8
        a = math.pi * t
        r = bw * (1.0 - 0.45 * math.sin(a) ** 3)
        x = bw * math.cos(a)
        y = 0.8 + math.sin(a) * 0.46 + 0.05 * math.sin(5 * math.pi * t)
        pts.append((x, y))
    pts.append((-bw, 0.8))
    p.prism(pts, -D / 2 * 0.8, D / 2 * 0.8, M['stone'], across='z')
    p.lathe([(0.05, 0.0), (0.0, 0.14)], M['trim'], sides=4, center=(0, 1.3, 0))
    return [p.build()]


def column2(M):
    """Sikh-era court column, 4.2 m (drop-in for kit_column): moulded square plinth, kumbha vase base, 16-sided shaft
    with entasis and a carved necking band, a bell capital ringed by lotus leaves, and four radiating brackets."""
    p = P('kit_column2')
    p.box(-0.36, 0, -0.36, 0.36, 0.22, 0.36, M['stone'])
    p.box(-0.33, 0.22, -0.33, 0.33, 0.28, 0.33, M['trim'], collide=False)
    p.lathe([(0.31, 0.28), (0.33, 0.34), (0.25, 0.42), (0.3, 0.56), (0.32, 0.64), (0.27, 0.72), (0.2, 0.8), (0.21, 0.86)], M['stone'], sides=16, cap_bottom=False, cap_top=False)
    p.lathe([(0.21, 0.86), (0.23, 0.9), (0.21, 0.95)], M['trim'], sides=16, cap_bottom=False, cap_top=False)
    p.lathe([(0.2, 0.95), (0.205, 2.0), (0.19, 3.1), (0.18, 3.28)], M['stone'], sides=16, cap_bottom=False, cap_top=False)
    p.lathe([(0.18, 3.28), (0.21, 3.32), (0.21, 3.38), (0.18, 3.42)], M['trim'], sides=16, cap_bottom=False, cap_top=False)
    p.lathe([(0.18, 3.42), (0.22, 3.55), (0.3, 3.7), (0.36, 3.8), (0.0, 3.8)], M['stone'], sides=16, cap_bottom=False, cap_top=False)
    for i in range(12):
        a = 2 * math.pi * (i + 0.5) / 12
        fwd = (math.cos(a), 0.0, math.sin(a))
        right = (-math.sin(a), 0.0, math.cos(a))
        p.obox((0.27 * math.cos(a), 3.63, 0.27 * math.sin(a)), right, (0, 1, 0), fwd, (0.13, 0.2, 0.04), M['trim'])
    p.box(-0.42, 3.8, -0.42, 0.42, 3.92, 0.42, M['trim'], collide=False)
    p.box(-0.38, 3.92, -0.38, 0.38, 4.2, 0.38, M['stone'], collide=False)
    for fx, fz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        prof = [(0.0, 3.92), (0.58, 3.92), (0.58, 4.2), (0.0, 4.2)]
        prof = [(0.0, 4.2), (0.62, 4.2), (0.62, 4.12), (0.5, 4.02), (0.34, 3.95), (0.2, 3.8), (0.0, 3.7)]
        if fz == 0:
            pts = [(u * fx, y) for u, y in prof]
            p.prism(pts if fx > 0 else list(reversed(pts)), -0.09, 0.09, M['stone'], across='z')
        else:
            pts = [(u * fz, y) for u, y in prof]
            p.prism(pts if fz > 0 else list(reversed(pts)), -0.09, 0.09, M['stone'], across='x')
    p.colliders.append([-0.36, 0, -0.36, 0.36, 4.2, 0.36, 'stone', False, True])
    return [p.build()]


def arch_span2(M):
    """Cusped arch span between two column2s (3 m centre to centre; the game scales x to the real span), 3.0..4.9 m:
    a 9-lobed cusped arch with an inlay border on both faces, spandrel roundels and a moulded top band."""
    p = P('kit_arch_span2')
    W, D = 3.0, 0.5
    Y0, SP, AP, YT = 3.95, 4.05, 4.62, 4.95
    hw, ho = W / 2, W / 2 * 0.78
    curve = cusp_arch_pts(ho, SP, AP, lobes=9, cusp=0.06)
    spandrel_fill(p, M['stone'], hw, YT - 0.12, curve, ho, -D / 2, D / 2)
    p.box(-hw, Y0, -D / 2, -ho, SP, D / 2, M['stone'], collide=False)
    p.box(ho, Y0, -D / 2, hw, SP, D / 2, M['stone'], collide=False)
    inner = offset_curve(curve, 0.1, dx_scale=0.93)
    for z0, z1 in ((-D / 2 - 0.02, -D / 2 + 0.04), (D / 2 - 0.04, D / 2 + 0.02)):
        ring_prism(p, M['trim'], curve, inner, z0, z1)
    for z in (-D / 2 - 0.01, D / 2 + 0.01):
        for s in (-1, 1):
            zz0, zz1 = (z - 0.03, z) if z < 0 else (z, z + 0.03)
            p.prism(circle_pts(0.11, 14, s * (hw - 0.28), YT - 0.42), zz0, zz1, M['inlay'], across='z')
    p.box(-hw - 0.02, YT - 0.12, -D / 2 - 0.05, hw + 0.02, YT - 0.04, D / 2 + 0.05, M['trim'], collide=False)
    p.box(-hw, YT - 0.04, -D / 2, hw, YT, D / 2, M['stone'], collide=False)
    p.colliders.append([-hw, Y0, -D / 2, hw, YT, D / 2, 'stone', False, True])
    return [p.build()]


def chhatri2(M):
    """Domed kiosk, 2.6 m footprint: moulded plinth, 4 baluster columns with bracket capitals, a chhajja on brackets,
    a ribbed (gadrooned) dome on an inverted-lotus collar and a finial."""
    p = P('kit_chhatri2')
    pl = 2.6
    hp = pl / 2
    p.box(-hp, 0, -hp, hp, 0.24, hp, M['stone'])
    p.box(-hp + 0.05, 0.24, -hp + 0.05, hp - 0.05, 0.3, hp - 0.05, M['trim'], collide=False)
    r = hp - 0.28
    ch = 2.0
    for dx in (-1, 1):
        for dz in (-1, 1):
            x, z = dx * r, dz * r
            p.lathe([(0.13, 0.0), (0.14, 0.06), (0.1, 0.12), (0.13, 0.26), (0.08, 0.4), (0.075, 1.5), (0.1, 1.62), (0.09, 1.7),
                     (0.16, 1.86), (0.18, 1.94)], M['stone'], sides=10, center=(x, 0.3, z))
            p.box(x - 0.16, 0.3 + 1.94, z - 0.16, x + 0.16, 0.3 + ch, z + 0.16, M['trim'], collide=False)
    y = 0.3 + ch
    p.box(-hp - 0.05, y, -hp - 0.05, hp + 0.05, y + 0.14, hp + 0.05, M['stone'], collide=False)
    # sloped chhajja all round
    ring = [(-hp - 0.55, y + 0.02), (-hp - 0.55, y + 0.06), (-hp, y + 0.26), (hp, y + 0.26), (hp + 0.55, y + 0.06), (hp + 0.55, y + 0.02), (hp, y + 0.14), (-hp, y + 0.14)]
    p.prism(ring, -hp - 0.55, hp + 0.55, M['trim'], across='x')
    p.prism(ring, -hp - 0.55, hp + 0.55, M['trim'], across='z')
    # drum + ribbed dome
    by = y + 0.26
    p.lathe([(1.02, 0.0), (1.02, 0.22), (0.98, 0.26)], M['stone'], sides=16, center=(0, by, 0))
    petals = 16
    p.lathe([(0.98, 0.26), (1.1, 0.32), (0.95, 0.4)], M['trim'], sides=petals, center=(0, by, 0))
    prof = [(0.95, 0.4), (1.08, 0.62), (1.07, 0.9), (0.9, 1.2), (0.55, 1.45), (0.2, 1.58), (0.0, 1.62)]
    p.lathe(prof, M['stone'], sides=24, center=(0, by, 0))
    for i in range(12):
        a = 2 * math.pi * i / 12
        for (r0, y0), (r1, y1) in zip(prof[:-2], prof[1:-1]):
            mx, my = (r0 + r1) / 2 + 0.02, (y0 + y1) / 2
            L = math.hypot(r1 - r0, y1 - y0)
            fwd = (math.cos(a), 0.0, math.sin(a))
            up = ((r1 - r0) / L * math.cos(a), (y1 - y0) / L, (r1 - r0) / L * math.sin(a))
            right = (-math.sin(a), 0.0, math.cos(a))
            nrm = (up[1] * right[2] - up[2] * right[1], up[2] * right[0] - up[0] * right[2], up[0] * right[1] - up[1] * right[0])
            p.obox((mx * math.cos(a), by + my, mx * math.sin(a)), right, up, nrm, (0.05, L, 0.04), M['trim'])
    p.lathe([(0.2, 1.58), (0.26, 1.64), (0.14, 1.7), (0.1, 1.76), (0.16, 1.84), (0.06, 1.95), (0.0, 2.15)], M['metal'], sides=8, center=(0, by, 0))
    p.colliders.append([-hp, 0, -hp, hp, 0.3, hp, 'stone', False, True])
    return [p.build()]


def window_arched(M):
    """Haveli window, 1.5 x 2.4 m, back at z = 0: plaster surround moulding, a cusped wooden arch head with fretwork,
    two panelled shutters, a sill on corbels and a small sloped wooden hood on brackets."""
    p = P('kit_window_arched')
    hw, H = 0.62, 2.1
    # plaster surround
    for x0, x1 in ((-hw - 0.14, -hw), (hw, hw + 0.14)):
        p.box(x0, 0.0, 0, x1, H, 0.07, M['plaster'], collide=False)
    p.box(-hw - 0.2, -0.1, 0, hw + 0.2, 0.0, 0.16, M['plaster'], collide=False)
    for s in (-1, 1):
        p.prism([(0, -0.1), (0.14, -0.1), (0.14, -0.14), (0.05, -0.3), (0, -0.3)], s * hw - 0.05, s * hw + 0.05, M['plaster'], across='x')
    curve = cusp_arch_pts(hw, 1.45, H, n=18, lobes=5, cusp=0.05)
    spandrel_fill(p, M['plaster'], hw + 0.14, H + 0.18, curve, hw, 0.0, 0.07)
    p.box(-hw - 0.22, H + 0.18, 0, hw + 0.22, H + 0.26, 0.14, M['plaster'], collide=False)
    # dark opening + shutters
    p.box(-hw, 0.0, 0.0, hw, 1.45, 0.012, M['shade'], collide=False)
    p.prism([(x, y) for x, y in [(-hw, 1.45)] + curve + [(hw, 1.45)]], 0.0, 0.012, M['shade'], across='z')
    fret = offset_curve(curve, -0.06, dx_scale=0.9)
    ring_prism(p, M['wood'], curve, fret, 0.01, 0.05)
    for s in (-1, 1):
        x0, x1 = (-hw + 0.03, -0.02) if s < 0 else (0.02, hw - 0.03)
        p.box(x0, 0.03, 0.01, x1, 1.43, 0.05, M['woodPaint'], collide=False)
        for y0, y1 in ((0.12, 0.62), (0.76, 1.34)):
            p.box(x0 + 0.06, y0, 0.05, x1 - 0.06, y1, 0.07, M['woodPaint'], collide=False)
            p.box(x0 + 0.1, y0 + 0.05, 0.07, x1 - 0.1, y1 - 0.05, 0.08, M['wood'], collide=False)
        p.lathe([(0.02, 0.0), (0.03, 0.02), (0.0, 0.04)], M['metal'], sides=6, center=(s * 0.08, 0.72, 0.08))
    # sloped hood
    ring = chajja_ring(0.5, H + 0.6, H + 0.32, 0.05, n=6)
    p.prism(ring, -hw - 0.3, hw + 0.3, M['wood'], across='x')
    for s in (-1, 1):
        p.prism([(0.0, H + 0.28), (0.4, H + 0.3), (0.12, H - 0.02), (0.0, H - 0.1)], s * (hw + 0.2) - 0.03, s * (hw + 0.2) + 0.03, M['wood'], across='x')
    return [p.build()]


def jharokha2(M):
    """Oriel balcony (2.4 wide, projects 1.0): three stepped brackets, a panelled base with jaali lower screens,
    four slender columns carrying cusped arches, and a curved bangla hood with finials. Back at z = 0, y = 0 is the
    underside of the lowest bracket."""
    p = P('kit_jharokha2')
    W, PROJ = 2.4, 1.0
    hw = W / 2
    for x in (-hw + 0.25, 0.0, hw - 0.25):
        prof = [(0.0, 0.9), (PROJ, 0.9), (PROJ - 0.08, 0.78), (0.7, 0.66), (0.45, 0.46), (0.25, 0.22), (0.1, 0.05), (0.0, 0.0)]
        p.prism(prof, x - 0.09, x + 0.09, M['stone'], across='x')
    p.box(-hw, 0.9, 0, hw, 1.02, PROJ, M['trim'], collide=False)
    # base panels with jaali (lattice slots)
    by0, by1 = 1.02, 1.62
    p.box(-hw, by0, PROJ - 0.08, hw, by0 + 0.08, PROJ, M['stone'], collide=False)
    p.box(-hw, by1 - 0.08, PROJ - 0.1, hw, by1, PROJ + 0.02, M['trim'], collide=False)
    for i in range(12):
        x = -hw + 0.1 + (W - 0.2) * (i + 0.5) / 12
        p.box(x - 0.018, by0 + 0.08, PROJ - 0.05, x + 0.018, by1 - 0.08, PROJ - 0.02, M['stone'], collide=False)
    for j in range(3):
        y = by0 + 0.08 + (by1 - by0 - 0.16) * (j + 0.5) / 3
        p.box(-hw + 0.06, y - 0.015, PROJ - 0.05, hw - 0.06, y + 0.015, PROJ - 0.02, M['stone'], collide=False)
    for s in (-1, 1):
        p.box(s * hw - 0.05, by0, 0.05, s * hw + 0.05, by1, PROJ, M['stone'], collide=False)
    p.box(-hw, by0 - 0.02, 0, hw, by0, PROJ, M['stone'], collide=False)
    p.box(-hw + 0.05, by0, 0.0, hw - 0.05, 2.9, 0.02, M['shade'], collide=False)
    # columns + arches
    cy0, cy1 = by1, 2.72
    xs = [-hw + 0.08, -hw / 3, hw / 3, hw - 0.08]
    for x in xs:
        p.lathe([(0.06, 0.0), (0.045, 0.12), (0.04, cy1 - cy0 - 0.16), (0.07, cy1 - cy0)], M['stone'], sides=8, center=(x, cy0, PROJ - 0.1))
    bay = (xs[1] - xs[0]) / 2
    for i in range(3):
        cx = (xs[i] + xs[i + 1]) / 2
        curve = [(x + cx, y) for x, y in cusp_arch_pts(bay * 0.9, cy1 - 0.42, cy1 - 0.02, lobes=5, cusp=0.035)]
        arch_niche_fill(p, M['stone'], cx - bay, cx + bay, cy1 + 0.1, curve, PROJ - 0.14, PROJ - 0.05)
    p.box(-hw - 0.02, cy1 + 0.1, 0, hw + 0.02, cy1 + 0.2, PROJ + 0.02, M['trim'], collide=False)
    # bangla hood (curved both ways)
    ring = roof_ring(PROJ / 2 + 0.25, 0.55, 0.0, 0.08, n=10)
    ring = [(z + PROJ / 2, y + cy1 + 0.2) for z, y in ring]
    p.prism(ring, -hw - 0.22, hw + 0.22, M['stone'], across='x')
    for s in (-1, 1):
        p.lathe([(0.05, 0.0), (0.06, 0.05), (0.02, 0.12), (0.0, 0.2)], M['metal'], sides=6, center=(s * (hw + 0.1), cy1 + 0.75, PROJ / 2))
    return [p.build()]


def fresco_frame(M):
    """Painted-panel frame: a thin moulded plaster frame (1 x 1 m unit, scaled by the game) around a fresco field."""
    p = P('kit_fresco_frame')
    t = 0.07
    for x0, y0, x1, y1 in ((-0.5, 0, -0.5 + t, 1), (0.5 - t, 0, 0.5, 1), (-0.5, 0, 0.5, t), (-0.5, 1 - t, 0.5, 1)):
        p.box(x0, y0, 0, x1, y1, 0.05, M['trim'], collide=False)
    return [p.build()]


def coffer(M):
    """Sheesh Mahal ceiling coffer, 2 x 2 m, hangs below y = 0: a gilded octagonal frame with a shallow faceted
    mirror dome (convex glass look) and a ring of mirror petals."""
    p = P('kit_coffer')
    hw = 1.0
    p.box(-hw, -0.06, -hw, hw, 0.0, hw, M['trim'], collide=False)
    for s in (-1, 1):
        p.box(-hw, -0.16, s * hw - 0.08, hw, -0.06, s * hw + 0.08 if s < 0 else s * hw, M['trim'], collide=False)
        p.box(s * hw - 0.08 if s > 0 else s * hw, -0.16, -hw, s * hw + 0.08 if s < 0 else s * hw, -0.06, hw, M['trim'], collide=False)
    p.lathe([(0.78, -0.06), (0.78, -0.1), (0.62, -0.18), (0.4, -0.26), (0.18, -0.3), (0.0, -0.31)], M['metal'], sides=16, cap_bottom=False, cap_top=False)
    for i in range(16):
        a = 2 * math.pi * (i + 0.5) / 16
        fwd = (math.cos(a), 0.0, math.sin(a))
        right = (-math.sin(a), 0.0, math.cos(a))
        p.obox((0.88 * math.cos(a), -0.08, 0.88 * math.sin(a)), right, fwd, (0, -1, 0), (0.1, 0.16, 0.02), M['mirror'])
    return [p.build()]


def naqqara2(M):
    """The power: a pair of naqqara kettle drums (hammered copper bowls, laced cream leather heads) on low carved
    wooden ring stands wrapped in red-and-gold cloth, two curved beaters resting across. Real colours (loaded
    untouched as a machine skin): copper, leather, wood, cloth, gold. ~1.7 x 0.95 x 0.95 m."""
    p = P('naqqara2')
    copper = material('copper', '#a8603a', 0.32, 1.0)
    leather = material('leather', '#cdbb94', 0.62, 0.0)
    wood = material('woodDark', '#4a2c1a', 0.7, 0.0)
    cloth = material('clothRed', '#7a1a1e', 0.9, 0.0)
    gold = material('gold', '#c49a48', 0.3, 1.0)
    for cx, R, D in ((-0.42, 0.47, 0.58), (0.5, 0.37, 0.48)):
        # low carved ring stand with brass-capped tassels; the bowl's round belly rests in it
        p.lathe([(R * 0.62, 0.0), (R * 0.7, 0.02), (R * 0.7, 0.1), (R * 0.62, 0.13)], wood, sides=20, center=(cx, 0, 0))
        p.lathe([(R * 0.58, 0.05), (R * 0.64, 0.07), (R * 0.64, 0.12)], cloth, sides=20, cap_bottom=False, center=(cx, 0, 0))
        for i in range(10):
            a = 2 * math.pi * i / 10
            p.lathe([(0.0, -0.07), (0.022, -0.04), (0.018, 0.0)], cloth, sides=6, center=(cx + R * 0.7 * math.cos(a), 0.09, R * 0.7 * math.sin(a)))
        # the kettle bowl (hemisphere-ish) and its rim
        y0 = 0.02
        prof = [(0.0, y0), (R * 0.4, y0 + 0.02), (R * 0.68, y0 + D * 0.14), (R * 0.87, y0 + D * 0.36), (R * 0.97, y0 + D * 0.62), (R * 1.0, y0 + D * 0.84), (R * 0.99, y0 + D * 0.92)]
        p.lathe(prof, copper, sides=28, cap_bottom=False, cap_top=False, center=(cx, 0, 0))
        top = y0 + D * 0.92
        p.lathe([(R * 1.0, top), (R * 1.04, top + 0.015), (R * 1.03, top + 0.04), (R * 0.99, top + 0.05)], gold, sides=28, cap_bottom=False, cap_top=False, center=(cx, 0, 0))
        p.lathe([(R * 0.99, top + 0.05), (R * 0.7, top + 0.065), (0.0, top + 0.07)], leather, sides=28, cap_bottom=False, center=(cx, 0, 0))
        # lacing: V thongs from the head hoop to a ring under the bowl's belly
        n = 14
        ring_y = y0 + D * 0.34
        p.lathe([(R * 0.89, ring_y - 0.012), (R * 0.9, ring_y + 0.012)], leather, sides=24, cap_bottom=False, cap_top=False, center=(cx, 0, 0))
        for i in range(n):
            for da in (-0.5, 0.5):
                a0 = 2 * math.pi * i / n
                a1 = 2 * math.pi * (i + da) / n
                x0, z0, yy0 = cx + R * 1.03 * math.cos(a0), R * 1.03 * math.sin(a0), top + 0.01
                x1, z1, yy1 = cx + R * 0.91 * math.cos(a1), R * 0.91 * math.sin(a1), ring_y
                L = math.dist((x0, yy0, z0), (x1, yy1, z1))
                up = ((x0 - x1) / L, (yy0 - yy1) / L, (z0 - z1) / L)
                rad = (math.cos((a0 + a1) / 2), 0.0, math.sin((a0 + a1) / 2))
                right = (up[1] * rad[2] - up[2] * rad[1], up[2] * rad[0] - up[0] * rad[2], up[0] * rad[1] - up[1] * rad[0])
                p.obox(((x0 + x1) / 2 + rad[0] * 0.012, (yy0 + yy1) / 2, (z0 + z1) / 2 + rad[2] * 0.012), right, up, rad, (0.018, L, 0.006), leather)
    # low wooden takht under both drums, dressed with a red-and-gold cloth (lifts the pair to ~0.97 m so the
    # machine skin keeps its native size)
    p.box(-0.98, -0.22, -0.52, 0.98, -0.02, 0.52, wood, collide=False)
    p.box(-1.0, -0.03, -0.54, 1.0, 0.0, 0.54, cloth, collide=False)
    for sx in (-1, 1):
        for sz in (-1, 1):
            p.box(sx * 0.98 - 0.06, -0.24, sz * 0.52 - 0.06, sx * 0.98 + 0.06, -0.02, sz * 0.52 + 0.06, gold, collide=False)
    p.box(-1.0, -0.12, 0.53, 1.0, -0.02, 0.56, gold, collide=False)
    # beaters: curved sticks resting across the heads
    for i, (x0, x1, z) in enumerate(((-0.7, 0.35, 0.12), (-0.3, 0.75, -0.14))):
        seg = 6
        pts = []
        for k in range(seg + 1):
            t = k / seg
            pts.append((x0 + (x1 - x0) * t, 0.62 + 0.08 * math.sin(math.pi * t) + i * 0.03, z + 0.08 * math.sin(math.pi * t)))
        for k in range(seg):
            a, b = pts[k], pts[k + 1]
            L = math.dist(a, b)
            up = tuple((b[j] - a[j]) / L for j in range(3))
            fwd = (0.0, 0.0, 1.0)
            right = (up[1] * fwd[2] - up[2] * fwd[1], up[2] * fwd[0] - up[0] * fwd[2], up[0] * fwd[1] - up[1] * fwd[0])
            p.obox(tuple((a[j] + b[j]) / 2 for j in range(3)), right, up, fwd, (0.03, L, 0.03), wood)
        p.lathe([(0.0, -0.04), (0.035, 0.0), (0.0, 0.04)], leather, sides=8, center=pts[-1])
    return [p.build()]


def pedestal2(M):
    """Jewel pedestal for the treasury: an octagonal marble shaft with pietra-dura inlay panels, a lotus-petal
    base, a gilded rim and a crimson cushion (the Koh-i-Noor sits on top). 1.25 m tall."""
    p = P('kit_pedestal2')
    p.lathe([(0.52, 0.0), (0.52, 0.1), (0.46, 0.14), (0.46, 0.2), (0.4, 0.24)], M['stone'], sides=8)
    for i in range(16):
        a = 2 * math.pi * (i + 0.5) / 16
        fwd = (math.cos(a), 0.0, math.sin(a)); right = (-math.sin(a), 0.0, math.cos(a))
        p.obox((0.36 * math.cos(a), 0.3, 0.36 * math.sin(a)), right, (0, 1, 0), fwd, (0.14, 0.16, 0.06), M['trim'])
    p.lathe([(0.34, 0.24), (0.33, 0.36), (0.3, 0.4)], M['stone'], sides=8, cap_bottom=False)
    p.lathe([(0.27, 0.4), (0.27, 0.98)], M['stone'], sides=8, cap_bottom=False, cap_top=False)
    ro = 0.27 * math.cos(math.pi / 8)
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8 - math.pi / 8 + math.pi / 8
        a = 2 * math.pi * i / 8 + math.pi / 8
        fwd = (math.cos(a), 0.0, math.sin(a)); right = (-math.sin(a), 0.0, math.cos(a))
        p.obox((ro * math.cos(a), 0.69, ro * math.sin(a)), right, (0, 1, 0), fwd, (0.16, 0.44, 0.012), M['inlay'])
    p.lathe([(0.3, 0.98), (0.36, 1.03), (0.38, 1.08), (0.34, 1.12)], M['metal'], sides=16, cap_bottom=False)
    p.lathe([(0.3, 1.12), (0.32, 1.16), (0.26, 1.24), (0.0, 1.25)], M['cloth'], sides=16, cap_bottom=False)
    p.colliders.append([-0.5, 0, -0.5, 0.5, 1.25, 0.5, 'stone', False, True])
    return [p.build()]


def torch_holder(M):
    """Wall mashaal holder: an iron back plate, a scrolled arm and an open brass cup (the flame is a runtime sprite).
    Back at z = 0; the cup centre is at (0, 0.42, 0.34)."""
    p = P('kit_mashaal')
    p.box(-0.08, 0.0, 0.0, 0.08, 0.5, 0.025, M['iron'], collide=False)
    p.lathe([(0.03, 0.0), (0.04, 0.02), (0.0, 0.04)], M['metal'], sides=6, center=(0, 0.1, 0.02))
    arm = [(0.0, 0.16), (0.12, 0.18), (0.22, 0.24), (0.3, 0.3), (0.34, 0.34)]
    for (z0, y0), (z1, y1) in zip(arm[:-1], arm[1:]):
        L = math.hypot(z1 - z0, y1 - y0)
        up = (0.0, (y1 - y0) / L, (z1 - z0) / L)
        p.obox((0.0, (y0 + y1) / 2, (z0 + z1) / 2), (1, 0, 0), up, (0.0, -up[2], up[1]), (0.03, L, 0.03), M['iron'])
    p.lathe([(0.02, 0.0), (0.09, 0.05), (0.11, 0.12), (0.1, 0.14)], M['metal'], sides=10, cap_top=False, center=(0, 0.3, 0.34))
    p.lathe([(0.09, 0.12), (0.07, 0.16), (0.03, 0.2), (0.0, 0.2)], M['cloth'], sides=8, cap_bottom=False, center=(0, 0.3, 0.34))
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
    # v2
    ('kit_pilaster_base', pilaster_base), ('kit_pilaster_shaft', pilaster_shaft), ('kit_pilaster_cap', pilaster_cap),
    ('kit_niche', niche), ('kit_bracket', bracket), ('kit_merlon', merlon), ('kit_column2', column2), ('kit_arch_span2', arch_span2),
    ('kit_chhatri2', chhatri2), ('kit_window_arched', window_arched), ('kit_jharokha2', jharokha2), ('kit_fresco_frame', fresco_frame),
    ('kit_coffer', coffer), ('naqqara2', naqqara2), ('kit_pedestal2', pedestal2), ('kit_mashaal', torch_holder),
]

os.makedirs(OUT, exist_ok=True)
for name, fn in PIECES:
    short = name[4:] if name.startswith('kit_') else name
    if ONLY and short not in ONLY and name not in ONLY:
        continue
    piece(name, fn)
