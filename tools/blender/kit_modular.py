"""Modular structure kit per map (no Meshy). Usage:
  blender -b --factory-startup -P tools/blender/kit_modular.py -- --out assets/kits [--maps kowloon,lisbon,rio]
Module: 4 m wide, storey height per map. Pieces face +Z (game), origin at base centre, footprint grid-snapped.
Each GLB carries extras.colliders ([minx,miny,minz,maxx,maxy,maxz,surface,floor,solid] in piece space) that match
src/maps MapBox semantics, and the per-map colliders.json collects them for the sim."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from lib import args, reset, material, Piece, export_glb

A = args()
OUT = A.get('out', 'assets/kits')
MAPS = {
    'kowloon': dict(H=3.3, wall='#6e6a64', trim='#3a3d42', metal='#5b5f63', wood='#6b4a33', glass='#9fb4c0', accent='#ff2e88', band='#8a8378'),
    'lisbon': dict(H=3.3, wall='#e8dcc4', trim='#cdbf9f', metal='#2f3a33', wood='#7a4b2a', glass='#a9c3d6', accent='#f2b400', band='#3f6fa8'),
    'rio': dict(H=3.0, wall='#b0674a', trim='#8c8c86', metal='#4b4f52', wood='#6d5a45', glass='#9fb0b8', accent='#18b8a8', band='#18b8a8'),
}
W, T = 4.0, 0.3


def pieces(P):
    H = P['H']
    M = {k: material(f"{mapid}_{k}", P[k], rough=0.35 if k == 'glass' else 0.5 if k == 'metal' else 0.85, metal=0.8 if k == 'metal' else 0.0,
                     alpha=0.35 if k == 'glass' else 1.0, emit=P['accent'] if k == 'accent' and mapid == 'kowloon' else None) for k in ('wall', 'trim', 'metal', 'wood', 'glass', 'accent', 'band')}
    out = {}

    def p(name):
        pc = Piece(f"b-{name}")
        out[name] = pc
        return pc

    # plain wall with a painted/tiled lower band and skirting
    w = p('wall'); w.box(-W / 2, 0, -T / 2, W / 2, H, T / 2, M['wall'], floor=False)
    w.box(-W / 2, 0, T / 2, W / 2, 1.0, T / 2 + 0.02, M['band'], collide=False)
    # wall with door (1.2 x 2.3)
    d = p('wall_door'); d.box(-W / 2, 0, -T / 2, -0.6, H, T / 2, M['wall'], floor=False).box(0.6, 0, -T / 2, W / 2, H, T / 2, M['wall'], floor=False).box(-0.6, 2.3, -T / 2, 0.6, H, T / 2, M['wall'], floor=False)
    for s in (-1, 1):
        d.box(s * 0.6 - 0.06, 0, -T / 2 - 0.04, s * 0.6 + 0.06, 2.36, T / 2 + 0.04, M['trim'], collide=False)
    d.box(-0.66, 2.3, -T / 2 - 0.04, 0.66, 2.42, T / 2 + 0.04, M['trim'], collide=False)
    # wall with window (1.4 x 1.2, sill 1.0) + frame + glass (glass: bullets pass, players don't)
    wn = p('wall_window'); wn.box(-W / 2, 0, -T / 2, -0.7, H, T / 2, M['wall'], floor=False).box(0.7, 0, -T / 2, W / 2, H, T / 2, M['wall'], floor=False)
    wn.box(-0.7, 0, -T / 2, 0.7, 1.0, T / 2, M['wall'], floor=False).box(-0.7, 2.2, -T / 2, 0.7, H, T / 2, M['wall'], floor=False)
    wn.box(-0.76, 0.94, -T / 2 - 0.05, 0.76, 1.02, T / 2 + 0.06, M['trim'], collide=False).box(-0.76, 2.2, -T / 2 - 0.03, 0.76, 2.28, T / 2 + 0.03, M['trim'], collide=False)
    wn.box(-0.7, 1.0, -0.01, 0.7, 2.2, 0.01, M['glass'], surface='glass', floor=False, solid=False)
    # half wall / parapet with cap
    pa = p('parapet'); pa.box(-W / 2, 0, -0.12, W / 2, 1.05, 0.12, M['wall'], floor=False).box(-W / 2, 1.05, -0.17, W / 2, 1.12, 0.17, M['trim'], collide=False)
    # floor tile 4x4, slab top at y=0
    f = p('floor'); f.box(-W / 2, -T, -W / 2, W / 2, 0, W / 2, M['trim'])
    # straight stairs rising +Z by one storey, width 2, steps <= 0.28 (under the 0.45 step height)
    st = p('stairs'); n = math.ceil(H / 0.28); run = 0.32
    for i in range(n):
        top = H * (i + 1) / n
        st.box(-1, top - 0.3 if i else 0, i * run, 1, top, (i + 1) * run, M['trim'])
    for s in (-1, 1):
        st.box(s * 1.02, 0, 0, s * 1.06, H + 0.9, n * run, M['metal'], collide=False)
    # ramp 1.5 m over 4 m: visual wedge, collision as 0.25 m steps (the sim has no slopes)
    r = p('ramp'); r.prism([(0, 0), (4, 0), (4, 1.5)], -1, 1, M['trim'], across='x')
    for i in range(6):
        y = 1.5 * (i + 1) / 6
        r.colliders.append([-1, 0, round(i * 4 / 6, 4), 1, round(y, 4), round((i + 1) * 4 / 6, 4), 'concrete', True, True])
    # ladder (one storey): rails + rungs; collider = climb volume tagged via surface metal, not solid for bullets
    la = p('ladder'); la.box(-0.25, 0, -0.03, -0.21, H + 1, 0.03, M['metal'], collide=False).box(0.21, 0, -0.03, 0.25, H + 1, 0.03, M['metal'], collide=False)
    for i in range(int((H + 1) / 0.3)):
        la.box(-0.21, 0.25 + i * 0.3, -0.015, 0.21, 0.28 + i * 0.3, 0.015, M['metal'], collide=False)
    la.colliders.append([-0.3, 0, -0.1, 0.3, H + 1, 0.1, 'metal', False, False])
    # standalone door frame and window frame (for interior partitions)
    df = p('doorframe')
    for s in (-1, 1):
        df.box(s * 0.6 - 0.08, 0, -0.12, s * 0.6 + 0.08, 2.38, 0.12, M['wood'], surface='wood', floor=False)
    df.box(-0.68, 2.3, -0.12, 0.68, 2.46, 0.12, M['wood'], surface='wood', floor=False)
    wf = p('window_frame')
    for s in (-1, 1):
        wf.box(s * 0.7 - 0.06, 0, -0.06, s * 0.7 + 0.06, 1.3, 0.06, M['trim'], collide=False)
    wf.box(-0.76, 0, -0.06, 0.76, 0.08, 0.06, M['trim'], collide=False).box(-0.76, 1.22, -0.06, 0.76, 1.3, 0.06, M['trim'], collide=False).box(-0.02, 0.08, -0.03, 0.02, 1.22, 0.03, M['trim'], collide=False)
    # railing 4 m (bullets pass)
    ra = p('railing')
    for x in (-2, -1, 0, 1, 2):
        ra.box(x - 0.03, 0, -0.03, x + 0.03, 1.05, 0.03, M['metal'], collide=False)
    ra.box(-2, 1.0, -0.04, 2, 1.06, 0.04, M['metal'], collide=False).box(-2, 0.5, -0.02, 2, 0.54, 0.02, M['metal'], collide=False)
    ra.colliders.append([-2, 0, -0.05, 2, 1.06, 0.05, 'metal', False, False])
    # pillar + beam
    p('pillar').box(-0.25, 0, -0.25, 0.25, H, 0.25, M['trim'], floor=False)
    p('beam').box(-W / 2, -0.4, -0.15, W / 2, 0, 0.15, M['trim'], floor=False)
    # awning over a doorway (accent colour; kowloon version glows as the map's neon accent)
    aw = p('awning'); aw.box(-1.4, 2.6, 0, 1.4, 2.66, 1.1, M['accent'], collide=False)
    for s in (-1, 1):
        aw.box(s * 1.35 - 0.02, 2.2, 1.0, s * 1.35 + 0.02, 2.66, 1.04, M['metal'], collide=False)
    # rooftop vent box and a pipe run (generic filler dressing)
    v = p('roof_vent'); v.box(-0.6, 0, -0.45, 0.6, 0.8, 0.45, M['metal'], surface='metal', floor=False).box(-0.65, 0.8, -0.5, 0.65, 0.88, 0.5, M['metal'], collide=False)
    pi = p('pipe_run'); pi.cyl((0, 0.15, 0), 'x', 4, 0.1, M['metal']).cyl((0, 0.15, 0.3), 'x', 4, 0.07, M['metal'])
    for x in (-1.5, 0, 1.5):
        pi.box(x - 0.03, 0, -0.1, x + 0.03, 0.3, 0.4, M['metal'], collide=False)
    # low crate stack + planter-box style cover (generic cover blocks at crouch/stand heights)
    c = p('cover_low'); c.box(-1, 0, -0.4, 1, 1.0, 0.4, M['wood'], surface='wood', floor=False)
    c2 = p('cover_high'); c2.box(-1, 0, -0.4, 1, 1.5, 0.4, M['wall'], floor=False)
    return out


index = []
for mapid, P in MAPS.items():
    if A.get('maps') and mapid not in A['maps'].split(','):
        continue
    reset()
    import lib; lib._mats.clear()
    ps = pieces(P)
    cols = {}
    for name, pc in ps.items():
        ob = pc.build()
        cols[name] = pc.colliders
    for name, pc in ps.items():
        ob = bpy.data.objects[f"b-{name}"]
        path = os.path.join(OUT, mapid, f"b-{name}.glb")
        export_glb(os.path.abspath(path), [ob])
        index.append({'id': f"b-{name}", 'cat': 'kits', 'map': mapid, 'name': f"b-{name}", 'size': 4, 'url': f"assets/kits/{mapid}/b-{name}.glb", 'lod1': None, 'stats': None, 'method': 'blender:kit_modular'})
    with open(os.path.join(OUT, mapid, 'colliders.json'), 'w') as fh:
        json.dump({'storeyHeight': P['H'], 'module': W, 'pieces': cols}, fh)
with open(os.path.join(os.path.dirname(OUT.rstrip('/')), 'blender-kit.json'), 'w') as fh:
    json.dump(index, fh, indent=1)
print('KIT', len(index))
