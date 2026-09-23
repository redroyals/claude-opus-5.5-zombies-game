"""Shared helpers for headless Blender scripts. Geometry is authored in GAME coordinates (metres, +Y up,
front = +Z) and converted to Blender (Z up): blender = (x, -z, y). The glTF exporter converts back."""
import bpy, bmesh, math, sys, os, json


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for i, k in enumerate(a):
        if k.startswith('--'):
            out[k[2:]] = a[i + 1] if i + 1 < len(a) and not a[i + 1].startswith('--') else True
    return out


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def g2b(p):
    return (p[0], -p[2], p[1])


_mats = {}


def material(name, color, rough=0.8, metal=0.0, emit=None, alpha=1.0):
    key = name
    if key in _mats and _mats[key].name in bpy.data.materials:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)) if isinstance(color, str) else color
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        e = tuple(int(emit[i:i + 2], 16) / 255 for i in (1, 3, 5))
        b.inputs['Emission Color'].default_value = (*e, 1)
        b.inputs['Emission Strength'].default_value = 3.0
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    _mats[key] = m
    return m


class Piece:
    """Accumulates boxes/prisms (game coords) per material into one mesh object + collider list.
    uv_scale: multiplier applied to world-space coords before writing UVs (1.0 -> 1 UV unit = 1 m,
    the zombies-kit default; pass 0.5 for '1 UV unit = 2 m' tileable-texture kits)."""

    def __init__(self, name, uv_scale=1.0):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.uv_scale = uv_scale
        self.colliders = []  # [minx,miny,minz,maxx,maxy,maxz, surface, floor, solid]

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def box(self, x0, y0, z0, x1, y1, z1, mat, collide=True, surface='concrete', floor=True, solid=True):
        x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
        vs = [self.bm.verts.new(g2b(p)) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        idx = self._mi(mat)
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            face = self.bm.faces.new([vs[i] for i in f])
            face.material_index = idx
        if collide:
            self.colliders.append([round(v, 4) for v in (x0, y0, z0, x1, y1, z1)] + [surface, floor, solid])
        return self

    def prism(self, pts2, e0, e1, mat, across='x'):
        """Polygon pts2 = [(u, y)] in a vertical side plane, extruded across [e0, e1].
        across='x': u is game Z (ramps rising along Z); across='z': u is game X."""
        P = (lambda u, y, e: (e, y, u)) if across == 'x' else (lambda u, y, e: (u, y, e))
        a = [self.bm.verts.new(g2b(P(p[0], p[1], e0))) for p in pts2]
        b = [self.bm.verts.new(g2b(P(p[0], p[1], e1))) for p in pts2]
        idx = self._mi(mat)
        n = len(pts2)
        for f in [list(reversed(a)), b] + [[a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]] for i in range(n)]:
            self.bm.faces.new(f).material_index = idx
        return self

    def cyl(self, p0, axis, length, radius, mat, seg=10):
        m = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=radius, radius2=radius, depth=length)
        vs = m['verts']
        # created along blender Z, centred -> orient to game axis
        rot = {'y': None, 'x': ('Y', math.pi / 2), 'z': ('X', math.pi / 2)}[axis]
        if rot:
            bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(rot[1], 3, rot[0]))
        bmesh.ops.translate(self.bm, verts=vs, vec=g2b(p0))
        idx = self._mi(mat)
        for f in {f for v in vs for f in v.link_faces}:
            f.material_index = idx
        return self

    def obox(self, center, right, up, fwd, size, mat, collide=False, surface='concrete', floor=False, solid=True):
        """Axis-free box: `center` + orthonormal (right, up, fwd) unit basis vectors (game coords) and
        `size` = (sx, sy, sz) FULL extents along those axes. For radially/rotated placed pieces that
        box() (axis-aligned only) can't express."""
        cx, cy, cz = center
        sx, sy, sz = size

        def pt(a, b, c):
            return (
                cx + a * sx / 2 * right[0] + b * sy / 2 * up[0] + c * sz / 2 * fwd[0],
                cy + a * sx / 2 * right[1] + b * sy / 2 * up[1] + c * sz / 2 * fwd[1],
                cz + a * sx / 2 * right[2] + b * sy / 2 * up[2] + c * sz / 2 * fwd[2],
            )
        corners = {}
        for a in (-1, 1):
            for b in (-1, 1):
                for c in (-1, 1):
                    corners[(a, b, c)] = self.bm.verts.new(g2b(pt(a, b, c)))
        idx = self._mi(mat)
        faces = [
            [(-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)],
            [(1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1)],
            [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)],
            [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)],
            [(-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)],
            [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
        ]
        for fkeys in faces:
            f = self.bm.faces.new([corners[k] for k in fkeys])
            f.material_index = idx
        if collide:
            allc = [pt(a, b, c) for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)]
            lo = [min(v[i] for v in allc) for i in range(3)]
            hi = [max(v[i] for v in allc) for i in range(3)]
            self.colliders.append([round(v, 4) for v in (*lo, *hi)] + [surface, floor, solid])
        return self

    def lathe(self, profile, mat, sides=16, cap_bottom=True, cap_top=True, center=(0.0, 0.0, 0.0)):
        """Surface of revolution around a vertical (+Y) axis through `center` (game coords, x/z offset;
        the y of `center` is added to every profile y too). `profile` = [(radius, y), ...] ordered
        bottom to top; a point with radius ~0 becomes a single pole vertex (fan), so a profile that
        starts and/or ends at radius 0 is automatically capped by a point (dome apex, finial tip)."""
        cx, cy, cz = center
        idx = self._mi(mat)
        rings = []
        for (r, y) in profile:
            if r <= 1e-6:
                rings.append(None)
                continue
            ring = []
            for s in range(sides):
                a = 2 * math.pi * s / sides
                ring.append(self.bm.verts.new(g2b((cx + r * math.cos(a), cy + y, cz + r * math.sin(a)))))
            rings.append(ring)
        for i in range(len(rings) - 1):
            r0, r1, y0, y1 = rings[i], rings[i + 1], profile[i][1], profile[i + 1][1]
            if r0 is None and r1 is None:
                continue
            if r0 is None:
                pole = self.bm.verts.new(g2b((cx, cy + y0, cz)))
                for s in range(sides):
                    self.bm.faces.new([pole, r1[s], r1[(s + 1) % sides]]).material_index = idx
            elif r1 is None:
                pole = self.bm.verts.new(g2b((cx, cy + y1, cz)))
                for s in range(sides):
                    self.bm.faces.new([r0[s], pole, r0[(s + 1) % sides]]).material_index = idx
            else:
                for s in range(sides):
                    self.bm.faces.new([r0[s], r0[(s + 1) % sides], r1[(s + 1) % sides], r1[s]]).material_index = idx
        if cap_bottom and rings and rings[0] is not None:
            self.bm.faces.new(list(reversed(rings[0]))).material_index = idx
        if cap_top and rings and rings[-1] is not None:
            self.bm.faces.new(rings[-1]).material_index = idx
        return self

    def build(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        # world-scale box-projected UVs so tiling detail textures line up across pieces
        s = self.uv_scale
        uv = self.bm.loops.layers.uv.new('UVMap')
        for f in self.bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for l in f.loops:
                c = l.vert.co
                l[uv].uv = (c.y * s, c.z * s) if ax == 0 else (c.x * s, c.z * s) if ax == 1 else (c.x * s, c.y * s)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        for m in self.mats:
            me.materials.append(m)
        bpy.context.scene.collection.objects.link(ob)
        ob['colliders'] = json.dumps(self.colliders)
        return ob


def export_glb(path, objects=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects or bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_apply=True, export_yup=True)
