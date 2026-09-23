"""Self-built favela houses, v2 (art pass). Imported by favela_kit.py.
Each variant: concrete frame (corner columns + slab edges that stick out past the walls), per-storey infill of exposed
brick or painted render (the render material shows brick through worn patches in the game shader), real window
openings (reveals, recessed glass, aluminium frames, concrete sills, iron grilles, open shutters, AC units),
steel/wood doors under small canopy slabs, a roll-up shopfront with an awning, balconies with railings and washing,
upper storeys that overhang or step back, and one of four tops: flat laje with a parapet, an unfinished storey
(columns with rebar, a half-built wall), a corrugated tin roof or a grey fibre-cement roof. Tanks, dishes,
downpipes, meter boxes and outside stairs with handrails complete it.
Game coords (metres, +Y up, front = +Z), base at y=0, centred on X/Z. `<id>.lod1` is a ~100-triangle shell.
Glass is always `fv_window_dark`: the game decides per window (per placed house) which ones are lit."""
import math, random

SH = 2.9      # storey height
SLAB = 0.18   # slab thickness
COL = 0.13    # column half-size
WT = 0.14     # infill wall thickness

FLAT = ['fv_door_teal', 'fv_door_red', 'fv_door_blue', 'fv_door_green', 'fv_door_yellow']
AWN = ['fv_m_pink', 'fv_m_teal', 'fv_m_blue', 'fv_m_orange', 'fv_m_green', 'fv_m_yellow']
CLOTH = ['fv_m_white', 'fv_m_sky', 'fv_m_pink', 'fv_m_yellow', 'fv_m_green', 'fv_m_blue', 'fv_m_orange', 'fv_m_purple']


def house2(P, material, name, w, d, storeys, seed, *, mats=(), top='flat', balcony=(), overhang=(), setback=(),
           shop=False, stair=False, tanks=1, dish=False, ac=0.35, grille=0.5, shutters=0.25, cobogo=False, lod=False):
    """P: the kit's Piece subclass; material(name, hex, rough, metal): the lib material factory.
    mats: per-storey 'b' (brick) / 'p' (render). Returns (Piece-built object, meta dict)."""
    rnd = random.Random(seed)
    M = {}

    def m(key, col='#888888', r=0.85, metal=0.0):
        if key not in M:
            M[key] = material(key, col, r, metal)
        return M[key]
    brick, plaster = m('fv_brick', '#b5643c', 0.95), m('fv_plaster', '#e2dccf', 0.92)
    conc, concd = m('fv_concrete', '#8e8b85', 0.95), m('fv_concrete_dark', '#5e5c58', 0.95)
    glass = m('fv_window_dark', '#161b21', 0.3, 0.2)
    steel, rust, alum = m('fv_steel', '#4f5458', 0.5, 0.8), m('fv_rust', '#7a4a2e', 0.9, 0.3), m('fv_alum', '#b8bcbe', 0.4, 0.6)
    tank, white, pvc = m('fv_tank_blue', '#2a6fb0', 0.6), m('fv_paint_white', '#e8e6e0', 0.7), m('fv_pvc', '#9a9a96', 0.6)
    acm, wood = m('fv_ac', '#dedad2', 0.6), m('fv_wood', '#7a5a3a', 0.9)
    tin, fibro, rtin, shut = m('fv_sheet_tin', '#a8adb0', 0.6, 0.5), m('fv_sheet_fibro', '#8a8c86', 0.9), m('fv_sheet_rust', '#8a5a3a', 0.9), m('fv_shutter', '#9aa0a4', 0.6, 0.5)
    door_m = m(rnd.choice(FLAT), '#3a7a78', 0.7)
    p = P(name)
    hw, hd = w / 2, d / 2
    mats = list(mats) or ['b'] * storeys
    wallmat = lambda s: plaster if mats[min(s, len(mats) - 1)] == 'p' else brick
    H = storeys * SH

    if lod:  # ~100-triangle shell: one box per storey, slab bands, flush windows, a roof item
        for s in range(storeys):
            y0 = s * SH
            p.box(-hw, y0, -hd, hw, y0 + SH - SLAB, hd, wallmat(s), collide=False)
            p.box(-hw - 0.05, y0 + SH - SLAB, -hd - 0.05, hw + 0.05, y0 + SH, hd + 0.12, conc, collide=False)
            n = max(1, int(w // 2.0))
            for i in range(n):
                cx = -hw + (i + 0.5) * w / n
                if s == 0 and i == n // 2:
                    p.zquad(cx - 0.45, y0, cx + 0.45, y0 + 2.1, hd + 0.01, door_m)
                else:
                    p.zquad(cx - 0.5, y0 + 1.0, cx + 0.5, y0 + 2.1, hd + 0.01, glass)
        if top in ('tin', 'fibro'):
            p.prism([(-hd - 0.3, H + 0.55), (hd + 0.3, H), (hd + 0.3, H + 0.06), (-hd - 0.3, H + 0.61)], -hw - 0.2, hw + 0.2, tin if top == 'tin' else fibro, across='x')
        else:
            p.box(-hw, H, -hd, hw, H + 0.7, hd, concd, collide=False)
            if tanks:
                p.cyl((0.4 - hw * 0.3, H + 1.25, 0), 'y', 1.1, 0.6, tank, seg=6)
        return p.build(), dict(w=w, d=d, h=H, top=H + (0.7 if top not in ('tin', 'fibro') else 0.6))

    # ---------------------------------------------------------------------------------------------
    def window(cx, y0, zf, ww, wh, s, face=1):
        """Opening in a front wall at z=zf (face=+1) already left open by the caller: reveal, glass, frame, sill,
        maybe grille / shutters / AC. face=-1 mirrors it onto the back wall."""
        f = face
        zg = zf - f * 0.1
        q = [(cx - ww / 2, y0, zg), (cx + ww / 2, y0, zg), (cx + ww / 2, y0 + wh, zg), (cx - ww / 2, y0 + wh, zg)]
        p.quad(q if f > 0 else list(reversed(q)), glass)
        fr = 0.04
        for (x0, x1, a, b) in [(cx - ww / 2, cx + ww / 2, y0, y0 + fr), (cx - ww / 2, cx + ww / 2, y0 + wh - fr, y0 + wh),
                               (cx - ww / 2, cx - ww / 2 + fr, y0, y0 + wh), (cx + ww / 2 - fr, cx + ww / 2, y0, y0 + wh), (cx - 0.02, cx + 0.02, y0, y0 + wh)]:
            p.box(x0, a, zg - 0.03, x1, b, zg + 0.03, alum, collide=False)
        p.box(cx - ww / 2 - 0.08, y0 - 0.07, zf - f * 0.12, cx + ww / 2 + 0.08, y0, zf + f * 0.07, conc, collide=False)
        r = rnd.random()
        if r < grille:
            n = max(3, int(ww / 0.14))
            zz = zf + f * 0.035
            for b in range(n):
                bx = cx - ww / 2 + (b + 0.5) * ww / n
                p.box(bx - 0.011, y0, zz - 0.011, bx + 0.011, y0 + wh, zz + 0.011, steel, collide=False)
            for yy in (y0 + 0.05, y0 + wh - 0.05, y0 + wh * 0.5):
                p.box(cx - ww / 2, yy - 0.014, zz - 0.014, cx + ww / 2, yy + 0.014, zz + 0.014, steel, collide=False)
        elif r < grille + shutters:
            sm = m(rnd.choice(FLAT), '#3a7a78', 0.7)
            for sx in (-1, 1):
                x0 = cx + sx * ww / 2
                p.box(min(x0, x0 + sx * ww / 2), y0, zf + (0.0 if f > 0 else -0.04), max(x0, x0 + sx * ww / 2), y0 + wh, zf + (0.04 if f > 0 else 0.0), sm, collide=False)
        if rnd.random() < ac and f > 0:
            ax = cx + rnd.choice((-1, 1)) * (ww / 2 - 0.35)
            ay = y0 + wh + 0.08 if rnd.random() < 0.5 else y0 - 0.55
            p.box(ax - 0.36, ay, zf, ax + 0.36, ay + 0.46, zf + 0.3, acm, collide=False)
            p.cyl((ax + 0.08, ay + 0.23, zf + 0.305), 'z', 0.01, 0.17, concd, seg=10)

    def front_wall(s, zf, x0w, x1w, openings, mat, face=1):
        """Front wall of storey s between x0w..x1w at face z=zf with rectangular openings [(xa, xb, ya, yb)] (local y)."""
        y0, y1 = s * SH, s * SH + SH - SLAB
        z0, z1 = (zf - WT, zf) if face > 0 else (zf, zf + WT)
        ops = sorted(openings)
        x = x0w
        for (xa, xb, ya, yb) in ops:
            if xa > x:
                p.box(x, y0, z0, xa, y1, z1, mat, collide=False)
            if ya > 0.01:
                p.box(xa, y0, z0, xb, y0 + ya, z1, mat, collide=False)
            if y0 + yb < y1:
                p.box(xa, y0 + yb, z0, xb, y1, z1, mat, collide=False)
            x = xb
        if x < x1w:
            p.box(x, y0, z0, x1w, y1, z1, mat, collide=False)

    zfs = [hd + (0.55 if s in overhang else 0.0) + (-1.4 if s in setback else 0.0) for s in range(storeys)]
    for s in range(storeys):
        y0 = s * SH
        y1 = y0 + SH - SLAB
        sb = -1.4 if s in setback else 0.0
        zf = zfs[s]
        mat = wallmat(s)
        # columns (front corners follow the overhang, back corners stay)
        for sx in (-1, 1):
            for zc in (zf - COL, -hd + COL):
                p.box(sx * hw - COL - 0.02 * sx, y0, zc - COL - 0.02, sx * hw + COL - 0.02 * sx, y1, zc + COL + 0.02, conc, collide=False)
        # front: openings laid out across the bay
        n = max(1, int((w - 0.6) // 1.9))
        ops, wins = [], []
        for i in range(n):
            cx = -hw + (i + 0.5) * w / n + rnd.uniform(-0.15, 0.15)
            if s == 0 and shop and i == n // 2:
                sw = min(2.6, w - 1.2)
                ops.append((cx - sw / 2, cx + sw / 2, 0.0, 2.35))
                wins.append(('shop', cx, sw))
            elif s == 0 and i == (n - 1 if shop else n // 2):
                ops.append((cx - 0.45, cx + 0.45, 0.0, 2.1))
                wins.append(('door', cx, 0.9))
            else:
                kind = rnd.random()
                ww, wh, sill = (1.2, 1.1, 1.0) if kind < 0.5 else (0.9, 1.0, 1.05) if kind < 0.85 else (0.55, 0.5, 1.6)
                if s in balcony and i == n // 2:
                    ww, wh, sill = 0.9, 2.1, 0.0  # balcony door
                ops.append((cx - ww / 2, cx + ww / 2, sill, sill + wh))
                wins.append(('win', cx, ww, sill, wh))
        front_wall(s, zf, -hw + COL, hw - COL, ops, mat)
        for wdef in wins:
            if wdef[0] == 'win':
                _, cx, ww, sill, wh = wdef
                window(cx, y0 + sill, zf, ww, wh, s)
            elif wdef[0] == 'door':
                cx = wdef[1]
                p.zquad(cx - 0.45, y0, cx + 0.45, y0 + 2.1, zf - 0.08, door_m)
                for k in range(3):  # door panel mouldings
                    p.box(cx - 0.35, y0 + 0.25 + k * 0.62, zf - 0.08, cx + 0.35, y0 + 0.75 + k * 0.62, zf - 0.06, door_m, collide=False)
                p.box(cx - 0.6, y0 + 2.25, zf - 0.02, cx + 0.6, y0 + 2.33, zf + 0.5, conc, collide=False)
                p.box(cx - 0.55, y0 - 0.02, zf - 0.08, cx + 0.55, y0 + 0.12, zf + 0.35, concd, collide=False)
                # meter box + wire
                p.box(cx + 0.62, y0 + 1.4, zf, cx + 0.95, y0 + 1.85, zf + 0.12, white, collide=False)
                p.box(cx + 0.77, y0 + 1.85, zf + 0.04, cx + 0.8, y1, zf + 0.07, steel, collide=False)
            else:  # shopfront: roll-up shutter half down + awning
                _, cx, sw = wdef
                ydn = rnd.uniform(1.2, 2.2)
                for k in range(int((2.35 - ydn) / 0.1)):
                    yy = ydn + k * 0.1
                    p.box(cx - sw / 2, yy, zf - 0.1, cx + sw / 2, yy + 0.06, zf - 0.06, shut, collide=False)
                p.box(cx - sw / 2, 2.2, zf - 0.12, cx + sw / 2, 2.45, zf + 0.05, shut, collide=False)
                p.quad([(cx - sw / 2, 0, zf - 0.6), (cx + sw / 2, 0, zf - 0.6), (cx + sw / 2, ydn, zf - 0.6), (cx - sw / 2, ydn, zf - 0.6)], glass)
                am = m(rnd.choice(AWN), '#e8327a', 0.8)
                p.prism([(zf, 2.6), (zf + 1.1, 2.3), (zf + 1.1, 2.34), (zf, 2.64)], cx - sw / 2 - 0.3, cx + sw / 2 + 0.3, am, across='x')
        # side + back walls
        for sx in (-1, 1):
            p.box(sx * hw - (WT if sx > 0 else 0) - 0.0, y0, -hd + COL, sx * hw + (0 if sx > 0 else WT), y1, zf - COL, mat, collide=False)
            if rnd.random() < 0.4:
                zc = rnd.uniform(-hd * 0.4, hd * 0.4)
                p.xquad(zc - 0.35, y0 + 1.2, zc + 0.35, y0 + 1.9, sx * (hw + 0.005), glass, neg=sx < 0)
                p.box(sx * hw - 0.02, y0 + 1.12, zc - 0.42, sx * hw + sx * 0.08, y0 + 1.2, zc + 0.42, conc, collide=False)
        bops = []
        if rnd.random() < 0.6:
            bx = rnd.uniform(-hw * 0.4, hw * 0.4)
            bops.append((bx - 0.45, bx + 0.45, 1.0, 2.0))
        front_wall(s, -hd, -hw + COL, hw - COL, bops, mat, face=-1)
        for (xa, xb, ya, yb) in bops:
            window((xa + xb) / 2, y0 + ya, -hd, xb - xa, yb - ya, s, face=-1)
        # slab (overhangs the walls a little all round; deeper at the front)
        zslab = max(zf, zfs[s + 1] if s + 1 < storeys else zf) + 0.12
        p.box(-hw - 0.06, y1, -hd - 0.06, hw + 0.06, y0 + SH, zslab, conc, collide=False)
        if sb < 0:  # stepped-back storey: the slab below is a terrace -> railing along its edge
            zt = hd + 0.1
            for k in range(int(w / 0.5) + 1):
                xx = -hw + k * w / int(w / 0.5)
                p.box(xx - 0.02, y0, zt - 0.02, xx + 0.02, y0 + 0.95, zt + 0.02, steel, collide=False)
            p.box(-hw, y0 + 0.92, zt - 0.03, hw, y0 + 0.97, zt + 0.03, steel, collide=False)
        if s in balcony:
            bw = min(w - 0.8, 2.8)
            p.box(-bw / 2, y0 - 0.16, zf, bw / 2, y0 + 0.02, zf + 0.95, conc, collide=False)
            if rnd.random() < 0.5:
                for k in range(int(bw / 0.12) + 1):
                    xx = -bw / 2 + k * bw / int(bw / 0.12)
                    p.box(xx - 0.012, y0, zf + 0.9, xx + 0.012, y0 + 0.95, zf + 0.924, steel, collide=False)
                for sx in (-1, 1):
                    p.box(sx * bw / 2 - 0.012, y0, zf, sx * bw / 2 + 0.012, y0 + 0.95, zf + 0.93, steel, collide=False)
                p.box(-bw / 2, y0 + 0.93, zf, bw / 2, y0 + 0.97, zf + 0.93, steel, collide=False)
            else:
                p.box(-bw / 2, y0, zf + 0.82, bw / 2, y0 + 0.9, zf + 0.95, plaster, collide=False)
            # washing line across the balcony
            yl = y0 + 1.9
            p.box(-bw / 2, yl, zf + 0.7, bw / 2, yl + 0.008, zf + 0.708, steel, collide=False)
            x = -bw / 2 + 0.15
            while x < bw / 2 - 0.35:
                cw, ch = rnd.uniform(0.3, 0.55), rnd.uniform(0.4, 0.75)
                cm = m(rnd.choice(CLOTH), '#f2efe8', 0.9)
                p.zquad(x, yl - ch, x + cw, yl, zf + 0.705, cm)
                p.zquad(x, yl - ch, x + cw, yl, zf + 0.703, cm, back=True)
                x += cw + rnd.uniform(0.06, 0.25)
    # ------------------------------------------------------------------------------------------------ top
    zft = zfs[-1]
    if top in ('flat', 'unfinished'):
        pm = wallmat(storeys - 1) if rnd.random() < 0.6 else concd
        t = 0.12
        ph = 0.85
        for (x0, z0, x1, z1) in [(-hw, -hd, hw, -hd + t), (-hw, zft - t, hw, zft), (-hw, -hd, -hw + t, zft), (hw - t, -hd, hw, zft)]:
            p.box(x0, H, z0, x1, H + ph, z1, pm, collide=False)
        for sx in (-1, 1):
            for zc in (zft - COL, -hd + COL):
                rise = 2.5 if top == 'unfinished' else 0.0
                if rise:
                    p.box(sx * hw - COL - 0.02 * sx, H, zc - COL, sx * hw + COL - 0.02 * sx, H + rise, zc + COL, conc, collide=False)
                for k in range(4):
                    ox, oz = (k % 2 - 0.5) * 0.12, (k // 2 - 0.5) * 0.12
                    x, z = sx * (hw - 0.08) + ox, zc + oz
                    hh = 0.4 + rnd.random() * 0.5
                    p.box(x - 0.012, H + rise, z - 0.012, x + 0.012, H + rise + hh, z + 0.012, rust, collide=False)
                    if rnd.random() < 0.4:
                        p.box(x - 0.012, H + rise + hh - 0.024, z - 0.012, x + 0.14 * -sx, H + rise + hh, z + 0.012, rust, collide=False)
        if top == 'unfinished':  # half-built back wall + a ring beam on one side
            bh = rnd.uniform(1.0, 2.2)
            p.box(-hw + COL, H, -hd, hw - COL, H + bh, -hd + WT, brick, collide=False)
            sx = rnd.choice((-1, 1))
            p.box(sx * hw - (WT if sx > 0 else 0), H, -hd + COL, sx * hw + (0 if sx > 0 else WT), H + rnd.uniform(0.6, 1.6), zft - COL, brick, collide=False)
            p.box(-hw, H + 2.5, -hd - 0.02, hw, H + 2.72, -hd + 0.26, conc, collide=False)
        for k in range(tanks):
            tx, tz = rnd.uniform(-hw + 0.8, hw - 0.8), rnd.uniform(-hd + 0.8, min(hd, zft) - 0.8)
            p.lathe([(0.52, 0), (0.62, 0.9), (0.66, 0.95), (0.3, 1.1), (0.0, 1.14)], tank, sides=12, center=(tx, H + 0.12, tz))
            p.box(tx - 0.6, H, tz - 0.6, tx + 0.6, H + 0.12, tz + 0.6, concd, collide=False)
        if dish:
            dx, dz = hw - 0.5, zft - 0.4
            p.box(dx - 0.02, H + 0.1, dz - 0.02, dx + 0.02, H + 1.4, dz + 0.02, steel, collide=False)
            p.cyl((dx, H + 1.4, dz + 0.05), 'z', 0.05, 0.34, white, seg=12)
            p.box(dx - 0.012, H + 1.38, dz + 0.05, dx + 0.012, H + 1.42, dz + 0.45, steel, collide=False)
            p.box(dx - 0.04, H + 1.36, dz + 0.45, dx + 0.04, H + 1.44, dz + 0.52, concd, collide=False)
        # clothes line across the roof
        if rnd.random() < 0.6:
            yl = H + 1.8
            p.box(-hw + 0.3, H, -0.02, -hw + 0.34, yl + 0.05, 0.02, steel, collide=False)
            p.box(hw - 0.34, H, -0.02, hw - 0.3, yl + 0.05, 0.02, steel, collide=False)
            p.box(-hw + 0.3, yl, -0.004, hw - 0.3, yl + 0.008, 0.004, steel, collide=False)
            x = -hw + 0.5
            while x < hw - 0.8:
                cw, ch = rnd.uniform(0.3, 0.6), rnd.uniform(0.4, 0.8)
                cm = m(rnd.choice(CLOTH), '#f2efe8', 0.9)
                p.zquad(x, yl - ch, x + cw, yl, 0.001, cm)
                p.zquad(x, yl - ch, x + cw, yl, -0.001, cm, back=True)
                x += cw + rnd.uniform(0.1, 0.4)
        topy = H + (2.8 if top == 'unfinished' else 1.9)
    else:  # sloped sheet roof: corrugations, purlins, overhang; low edge at the front
        sm = tin if top == 'tin' else fibro
        ov = 0.35
        z0, z1 = -hd - ov, zft + ov
        rise = 0.55
        k = 0
        x = -hw - 0.2
        while x < hw + 0.2:
            y = 0.035 if k % 2 else 0.0
            mm = rtin if (top == 'tin' and rnd.random() < 0.15) else sm
            p.prism([(z0, H + rise + y), (z1, H + y), (z1, H + 0.03 + y), (z0, H + rise + 0.03 + y)], x, x + 0.18, mm, across='x')
            x += 0.18
            k += 1
        for zz in (z0 + 0.4, (z0 + z1) / 2, z1 - 0.4):
            yy = H + rise * (z1 - zz) / (z1 - z0) - 0.09
            p.box(-hw - 0.2, yy - 0.06, zz - 0.04, hw + 0.2, yy, zz + 0.04, wood, collide=False)
        # gable infill: the walls rise to meet the slope
        m2 = wallmat(storeys - 1)
        for sx in (-1, 1):
            p.prism([(-hd, H), (zft, H), (zft, H + 0.02), (-hd, H + rise * (z1 + hd) / (z1 - z0))], sx * hw - 0.07, sx * hw + 0.07, m2, across='x')
        p.box(-hw, H, -hd, hw, H + rise * 0.6, -hd + WT, m2, collide=False)
        if tanks:
            tx = rnd.uniform(-hw + 0.8, hw - 0.8)
            p.lathe([(0.42, 0), (0.5, 0.75), (0.54, 0.8), (0.25, 0.92), (0.0, 0.95)], tank, sides=12, center=(tx, H + rise + 0.05, -hd + 0.2))
        topy = H + rise + 1.0
    # ------------------------------------------------------------------------------------------------ extras
    sx = rnd.choice((-1, 1))
    p.box(sx * (hw + 0.02), 0.0, hd - 0.12, sx * (hw + 0.02) + sx * 0.09, H + 0.4, hd - 0.03, pvc, collide=False)  # downpipe
    if stair:  # outside stair up the +X side with a pipe handrail
        n = 12  # one flight to the first-floor door (a whole-height flight reads as a ladder)
        run = d - 0.6
        H0 = H
        H = SH
        for k in range(n):
            y1 = (k + 1) * H / n
            za = hd - 0.3 - k * run / n
            p.box(hw + 0.02, y1 - 0.18, za - run / n, hw + 0.95, y1, za, concd, collide=False)
        for k in range(0, n, 4):
            y1 = (k + 1) * H / n
            za = hd - 0.3 - k * run / n
            p.box(hw + 0.9, y1, za - 0.02, hw + 0.94, y1 + 0.95, za + 0.02, steel, collide=False)
        p.prism([(hd - 0.3, 0.95), (hd - 0.3 - run, H + 0.95), (hd - 0.3 - run, H + 1.0), (hd - 0.3, 1.0)], hw + 0.9, hw + 0.94, steel, across='x')
        H = H0
    if cobogo:  # breeze-block vent panel on one side, upper storey
        s = storeys - 1
        y0 = s * SH + 0.9
        sx = rnd.choice((-1, 1))
        for i in range(4):
            for j in range(3):
                zc, yc = -0.6 + i * 0.4, y0 + j * 0.4
                p.box(sx * (hw + 0.02) - 0.03, yc, zc, sx * (hw + 0.02) + 0.03, yc + 0.34, zc + 0.34, white, collide=False)
    return p.build(), dict(w=w, d=d, h=round(H, 3), top=round(topy, 3))


# id, width, depth, storeys, seed, options
VARIANTS = [
    ('fv_h01', 4.2, 4.2, 2, 101, dict(mats='bp', top='flat', balcony=(1,), dish=True)),
    ('fv_h02', 5.0, 4.6, 3, 102, dict(mats='ppp', top='flat', overhang=(1, 2), tanks=2)),
    ('fv_h03', 3.6, 4.0, 1, 103, dict(mats='b', top='tin', tanks=1)),
    ('fv_h04', 6.2, 5.0, 2, 104, dict(mats='pp', top='fibro', shop=True, balcony=(1,))),
    ('fv_h05', 4.0, 5.4, 4, 105, dict(mats='ppbb', top='unfinished', stair=True, overhang=(2,))),
    ('fv_h06', 5.2, 5.0, 2, 106, dict(mats='pb', top='flat', setback=(1,), tanks=1, cobogo=True)),
    ('fv_h07', 4.6, 4.4, 3, 107, dict(mats='bbb', top='unfinished', balcony=(1,), tanks=1)),
    ('fv_h08', 3.4, 4.2, 3, 108, dict(mats='ppp', top='flat', overhang=(2,), dish=True)),
    ('fv_h09', 5.6, 4.8, 1, 109, dict(mats='p', top='flat', shop=True, tanks=2)),
    ('fv_h10', 4.4, 5.0, 2, 110, dict(mats='bb', top='tin', balcony=(1,))),
    ('fv_h11', 6.0, 5.2, 3, 111, dict(mats='ppb', top='flat', shop=True, balcony=(1, 2), dish=True)),
    ('fv_h12', 3.8, 4.4, 2, 112, dict(mats='pp', top='fibro', cobogo=True)),
    ('fv_h13', 4.8, 5.6, 4, 113, dict(mats='bppp', top='flat', balcony=(2,), overhang=(3,), tanks=2)),
    ('fv_h14', 5.4, 4.6, 2, 114, dict(mats='bb', top='unfinished', stair=True)),
]
