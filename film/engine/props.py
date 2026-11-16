"""Reusable procedural props. All build into a World in its current local frame (y up)."""
import numpy as np
from .world import srgb, MASK_THIN, MASK_NOSHADOW, MASK_NOBOUNCE, _n

TAG_FOLIAGE, TAG_GROUND, TAG_WATER, TAG_NOSNOW, TAG_TREE, TAG_WIRE = 1, 2, 3, 4, 5, 6

WARM = ['#ffc070', '#ffb45e', '#ffd08a', '#f5c98a', '#ffdca0', '#e8d9b0', '#d9e6d0', '#ffb98a']

# ---------------------------------------------------------------- walls / windows
def wall(w, width, height, openings=(), mat='plaster', col=1.0, prm=0.0, depth=0.2, y0=0.0, seed=None, reveal=None, tag=0):
    """wall in local XY plane (z=0, facing +z). openings: (x0,y0,x1,y1,cb) ; cb(w, ow, oh) draws content in a frame whose
    origin is the opening's bottom-left corner on the recessed plane."""
    if seed is None: seed = w.rng.random()
    xs = sorted(set([0.0, float(width)] + [float(o[0]) for o in openings] + [float(o[2]) for o in openings]))
    ys = sorted(set([float(y0), float(height)] + [float(o[1]) for o in openings] + [float(o[3]) for o in openings]))
    xs = [x for x in xs if 0 <= x <= width]; ys = [y for y in ys if y0 <= y <= height]
    cx = (np.array(xs[:-1]) + np.array(xs[1:])) / 2; cy = (np.array(ys[:-1]) + np.array(ys[1:])) / 2
    inside = np.zeros((len(cy), len(cx)), bool)
    for o in openings:
        inside |= ((cy[:, None] > o[1]) & (cy[:, None] < o[3])) & ((cx[None, :] > o[0]) & (cx[None, :] < o[2]))
    P0, P1, P2, P3 = [], [], [], []
    for j in range(len(cy)):
        i = 0
        while i < len(cx):
            if inside[j, i]: i += 1; continue
            k = i
            while k < len(cx) and not inside[j, k]: k += 1
            P0.append((xs[i], ys[j], 0)); P1.append((xs[k], ys[j], 0)); P2.append((xs[k], ys[j + 1], 0)); P3.append((xs[i], ys[j + 1], 0))
            i = k
    if P0: w.quads(P0, P1, P2, P3, mat=mat, col=col, prm=prm, seed=seed, tag=tag)
    rv = reveal or dict(mat=mat, col=col, prm=prm)
    for o in openings:
        x0, y0_, x1, y1 = o[:4]; d = o[5] if len(o) > 5 else depth
        w.quads([(x0, y0_, 0), (x0, y0_, 0), (x0, y1, -d), (x1, y0_, -d)],
                [(x0, y0_, -d), (x1, y0_, 0), (x1, y1, -d), (x1, y0_, 0)],
                [(x0, y1, -d), (x1, y0_, -d), (x1, y1, 0), (x1, y1, 0)],
                [(x0, y1, 0), (x0, y0_, -d), (x0, y1, 0), (x1, y1, -d)], seed=seed, **rv)
        if o[4] is not None:
            with w.at((x0, y0_, -d)):
                o[4](w, x1 - x0, y1 - y0_)

def pane(w, ow, oh, lit=0.0, col='#ffc070', style=0, grp=0, seed=None, frame_seed=None):
    return w.quads((0, 0, 0), (ow, 0, 0), (ow, oh, 0), (0, oh, 0), mat='glass', col=col, prm=(lit, ow, oh, style), grp=grp, seed=seed, tag=TAG_NOSNOW)

def sill(w, x0, y0, x1, out=0.1, th=0.07, col='#9a968c'):
    w.box(((x0 + x1) / 2, y0 - th / 2, out / 2), (x1 - x0 + 0.16, th, out + 0.04), mat='concrete', col=col)

# ---------------------------------------------------------------- apartment block
STYLES = {
    'brick': dict(mat='brick', col='#9c5a44', trim='#9a958a', frame=0, band=True, balc='#8f8a80'),
    'brick2': dict(mat='brick', col='#8a5648', trim='#8f8b84', frame=0, band=True, balc='#8a5648'),
    'plaster': dict(mat='plaster', col='#9a9790', trim='#aaa69c', frame=0, band=False, balc='#a29e94'),
    'yellow': dict(mat='plaster', col='#b9a77c', trim='#a8a294', frame=0, band=False, balc='#b0a27e'),
    'tile': dict(mat='tile', col='#d6d6cc', trim='#b9bab2', frame=1, band=False, balc='#cfcfc6'),
}

def apt_block(w, units=3, floors=6, style='brick', lit=0.05, rng=None, grp_fn=None, roof_stuff=True, bw=3.3, depth=10.5, fh=2.9,
              base=0.7, balcony=True, ac=0.0, cages=0.15, lit_cols=WARM, lit_gain=1.0, back_lit=None, details=True, end_windows=0.3, couplets=False):
    """Slab apartment block centred on origin, long axis = local x, front (balconies) faces +z.
    grp_fn(side, unit, bay, floor) -> (lit, col, grp) or None to use random."""
    rng = rng or w.rng
    st = STYLES[style]
    upb = 4
    Wd = units * upb * bw + 0.5; H = base + floors * fh
    mat, col = st['mat'], st['col']
    seed = rng.random()
    wk = dict(mat=mat, col=col, seed=seed)
    info = dict(W=Wd, D=depth, H=H, windows=[])

    def choose(side, u, b, f, p):
        if grp_fn is not None:
            r = grp_fn(side, u, b, f)
            if r is not None: return r
        if rng.random() < p:
            return (float(rng.uniform(0.6, 1.5) * lit_gain), lit_cols[rng.integers(len(lit_cols))], 0)
        return (0.0, '#ffc070', 0)

    def win_cb(side, u, b, f, p, style_):
        l, c, g = choose(side, u, b, f, p)
        def cb(w_, ow, oh):
            pane(w_, ow, oh, lit=l, col=c, style=style_, grp=g)
        return cb, l

    # ---- front
    with w.at((-Wd / 2, 0, depth / 2)):
        ops = []
        for u in range(units):
            for b in range(upb):
                x = 0.25 + (u * upb + b) * bw
                for f in range(floors):
                    y = base + f * fh
                    if balcony and b in (0, 3):
                        cb, l = win_cb('front', u, b, f, lit, 1)
                        ops.append((x + 0.45, y + 0.12, x + bw - 0.45, y + 2.45, cb))
                    else:
                        cb, l = win_cb('front', u, b, f, lit, st['frame'])
                        ww = 1.5 if b in (1, 2) else 1.8
                        ops.append((x + (bw - ww) / 2, y + 0.95, x + (bw + ww) / 2, y + 2.4, cb))
        wall(w, Wd, H, ops, **wk)
        for o in ops:
            if o[3] - o[1] < 2.0: sill(w, o[0], o[1], o[2], col=st['trim'])
        if balcony:
            for u in range(units):
                for b in (0, 3):
                    x = 0.25 + (u * upb + b) * bw + bw / 2
                    for f in range(floors):
                        y = base + f * fh
                        _balcony(w, x, y, bw - 0.5, fh, st, rng, top=(f == floors - 1), lit=choose('balc', u, b, f, lit * 0.5))
        if st['band']:
            for f in range(floors + 1):
                w.box((Wd / 2, base + f * fh - 0.02, 0.012), (Wd, 0.24, 0.03), mat='concrete', col=st['trim'])
        if details:
            _facade_details(w, Wd, H, base, fh, floors, units * upb, bw, rng, ac, cages, ops)
            _lived_in(w, Wd, H, base, fh, floors, rng, ops)
    # ---- back
    bl = lit if back_lit is None else back_lit
    with w.at((Wd / 2, 0, -depth / 2), yaw=np.pi):
        ops = []
        for u in range(units):
            for b in range(upb):
                x = 0.25 + (u * upb + b) * bw
                if b == 1:      # stairwell
                    ops.append((x + bw / 2 - 0.75, base * 0 + 0.0, x + bw / 2 + 0.75, 2.25, _door_cb(rng), 0.5))
                    for f in range(floors - 1):
                        y = base + f * fh + 1.45
                        cb, l = win_cb('stair', u, b, f, bl * 0.4, 2)
                        ops.append((x + bw / 2 - 0.6, y + 0.9, x + bw / 2 + 0.6, y + 2.3, cb))
                else:
                    for f in range(floors):
                        y = base + f * fh
                        cb, l = win_cb('back', u, b, f, bl, st['frame'])
                        ww = 1.2 if b != 3 else 1.5
                        ops.append((x + (bw - ww) / 2, y + 1.0, x + (bw + ww) / 2, y + 2.35, cb))
        wall(w, Wd, H, ops, **wk)
        for o in ops:
            if o[1] > 0.5: sill(w, o[0], o[1], o[2], col=st['trim'])
        for u in range(units):   # entrance canopies + steps
            x = 0.25 + (u * upb + 1) * bw + bw / 2
            w.box((x, 2.45, 0.6), (2.4, 0.12, 1.3), mat='concrete', col='#8c8a84')
            w.box((x, 0.08, 0.5), (1.9, 0.16, 1.0), mat='concrete', col='#8c8a84')
            if couplets: couplet(w, x, 0.0, 1.5, 2.25, rng)
        if st['band']:
            for f in range(floors + 1):
                w.box((Wd / 2, base + f * fh - 0.02, 0.012), (Wd, 0.24, 0.03), mat='concrete', col=st['trim'])
        if details:
            _facade_details(w, Wd, H, base, fh, floors, units * upb, bw, rng, ac * 0.5, cages * 0.6, ops)
            _lived_in(w, Wd, H, base, fh, floors, rng, ops)
    # ---- ends
    for sgn, yaw, org in ((1, np.pi / 2, (Wd / 2, 0, depth / 2)), (-1, -np.pi / 2, (-Wd / 2, 0, -depth / 2))):
        with w.at(org, yaw=yaw):
            ops = []
            if rng.random() < end_windows:
                xx = rng.uniform(2.5, depth - 4)
                for f in range(floors):
                    cb, l = win_cb('end', 0, 0, f, lit, st['frame'])
                    ops.append((xx, base + f * fh + 1.0, xx + 1.1, base + f * fh + 2.3, cb))
            wall(w, depth, H, ops, **wk)
            for o in ops: sill(w, o[0], o[1], o[2], col=st['trim'])
            if st['band']:
                for f in range(floors + 1):
                    w.box((depth / 2, base + f * fh - 0.02, 0.012), (depth, 0.24, 0.03), mat='concrete', col=st['trim'])
            if details and rng.random() < 0.7:
                xx = rng.uniform(0.6, depth - 0.6)
                w.tube((xx, 0, 0.09), (xx, H, 0.09), 0.055, sides=5, mat='metal', col='#6f6a62', prm=(0.6, 0, 0, 0))
    # ---- plinth (slightly proud, darker), roof
    w.box((0, base / 2 - 0.01, 0), (Wd + 0.12, base, depth + 0.12), mat='concrete', col='#7c7971', faces='xXzZ')
    w.box((0, H + 0.06, 0), (Wd + 0.5, 0.14, depth + 0.5), mat='concrete', col='#84817a')       # cornice slab
    ph = 0.55
    for (c_, s_) in (((0, H + 0.13 + ph / 2, depth / 2 + 0.1), (Wd + 0.5, ph, 0.18)), ((0, H + 0.13 + ph / 2, -depth / 2 - 0.1), (Wd + 0.5, ph, 0.18)),
                     ((Wd / 2 + 0.1, H + 0.13 + ph / 2, 0), (0.18, ph, depth + 0.3)), ((-Wd / 2 - 0.1, H + 0.13 + ph / 2, 0), (0.18, ph, depth + 0.3))):
        w.box(c_, s_, mat=mat, col=col, seed=seed)
    w.box((0, H + 0.13 + ph + 0.03, 0), (Wd + 0.6, 0.06, depth + 0.6), mat='concrete', col='#8d8a82', faces='xXzZ')
    if roof_stuff: _roof_stuff(w, Wd, depth, H + 0.14, units, upb * bw, rng)
    info['roof_y'] = H + 0.14
    return info

def _door_cb(rng):
    def cb(w, ow, oh):
        w.quads((0, 0, 0), (ow, 0, 0), (ow, oh, 0), (0, oh, 0), mat='plain', col='#07080a')
    return cb

def _balcony(w, x, y, bwid, fh, st, rng, top=False, lit=(0, '#ffc070', 0)):
    out = 1.15
    kind = rng.choice(['open', 'glazed', 'glazed', 'open', 'half'])
    bc = st['balc']
    w.box((x, y + 0.02, out / 2), (bwid, 0.12, out), mat='concrete', col='#8a877f')          # slab
    pm = 'brick' if (st['mat'] == 'brick' and rng.random() < 0.5) else 'plaster'
    pcol = st['col'] if pm == 'brick' else bc
    w.box((x, y + 0.55, out - 0.05), (bwid, 1.0, 0.1), mat=pm, col=pcol)
    w.box((x - bwid / 2 + 0.05, y + 0.55, out / 2 - 0.05), (0.1, 1.0, out - 0.1), mat=pm, col=pcol)
    w.box((x + bwid / 2 - 0.05, y + 0.55, out / 2 - 0.05), (0.1, 1.0, out - 0.1), mat=pm, col=pcol)
    w.box((x, y + 1.07, out - 0.05), (bwid + 0.06, 0.05, 0.16), mat='concrete', col='#96938b')
    if top:
        w.box((x, y + fh - 0.06, out / 2 + 0.05), (bwid + 0.1, 0.1, out + 0.1), mat='concrete', col='#8a877f')
    if kind in ('glazed', 'half'):
        l, c, g = lit
        hh = fh - 1.2
        fseed = rng.random()
        with w.at((x - bwid / 2 + 0.03, y + 1.1, out - 0.03)):
            w.quads((0, 0, 0), (bwid - 0.06, 0, 0), (bwid - 0.06, hh, 0), (0, hh, 0), mat='glass', col=c, prm=(l * 0.7, bwid - 0.06, hh, 2 if rng.random() < 0.5 else 1), grp=g, seed=fseed, tag=TAG_NOSNOW)
        if kind == 'glazed':
            for sx, yw in ((x - bwid / 2 + 0.02, -np.pi / 2), (x + bwid / 2 - 0.02, np.pi / 2)):
                with w.at((sx, y + 1.1, 0.0 if yw < 0 else out - 0.03), yaw=yw):
                    w.quads((0, 0, 0), (out - 0.03, 0, 0), (out - 0.03, hh, 0), (0, hh, 0), mat='glass', col=c, prm=(l * 0.7, out, hh, 1), grp=g, seed=fseed, tag=TAG_NOSNOW)
    else:
        if rng.random() < 0.6:     # laundry pole + something hanging
            yy = y + 2.3
            w.tube((x - bwid / 2 + 0.2, yy, out - 0.1), (x + bwid / 2 - 0.2, yy, out - 0.1), 0.015, sides=3, mat='plain', col='#55524c', mask=MASK_THIN)
            for k in range(rng.integers(0, 4)):
                cx = x + rng.uniform(-bwid / 2 + 0.4, bwid / 2 - 0.4); cw = rng.uniform(0.3, 0.6); ch = rng.uniform(0.5, 0.9)
                cc = ['#8d95a3', '#a39a8c', '#7e6f73', '#6f7f86', '#b3b0aa', '#8a4a44'][rng.integers(6)]
                w.quads((cx - cw / 2, yy - ch, out - 0.1), (cx + cw / 2, yy - ch, out - 0.1), (cx + cw / 2, yy, out - 0.1), (cx - cw / 2, yy, out - 0.1), mat='plain', col=cc, mask=MASK_THIN)
        if rng.random() < 0.22:    # a quilt airing over the rail
            qx = x + rng.uniform(-0.5, 0.5); qw = rng.uniform(1.0, 1.5)
            qc = ['#b8423a', '#c9a23a', '#4a6a9a', '#c9c2b0', '#8a5a7a', '#5a8a6a'][rng.integers(6)]
            w.box((qx, y + 0.85, out + 0.03), (qw, 0.55, 0.06), mat='plain', col=qc, prm=(0.3, 0, 0, 0), tag=TAG_FOLIAGE)
            w.box((qx, y + 1.11, out - 0.05), (qw, 0.05, 0.22), mat='plain', col=qc, prm=(0.3, 0, 0, 0))
        if rng.random() < 0.25:    # full-height security cage
            rc = srgb('#4a4039') * rng.uniform(0.7, 1.3); n = 9
            xs = np.linspace(x - bwid / 2, x + bwid / 2, n)
            w.tube(np.stack([xs, np.full(n, y + 1.1), np.full(n, out)], 1), np.stack([xs, np.full(n, y + fh - 0.1), np.full(n, out)], 1), 0.012, sides=3, mat='plain', col=rc, mask=MASK_THIN)
            for yy in (y + 1.7, y + 2.3): w.tube((x - bwid / 2, yy, out), (x + bwid / 2, yy, out), 0.012, sides=3, mat='plain', col=rc, mask=MASK_THIN)
        if rng.random() < 0.5:     # junk on the balcony
            w.box((x + rng.uniform(-0.6, 0.6), y + 0.4, out * 0.45), (rng.uniform(0.4, 0.9), 0.65, 0.5), mat='plain', col=['#5d564c', '#4d5560', '#6b6557'][rng.integers(3)], prm=(0.5, 0, 0, 0))

def _facade_details(w, Wd, H, base, fh, floors, nb, bw, rng, ac, cages, ops):
    # drain pipes
    for k in range(0, nb + 1, 4):
        x = 0.25 + k * bw + rng.uniform(-0.12, 0.12)
        x = min(max(x, 0.15), Wd - 0.15)
        w.tube((x, 0, 0.08), (x, H, 0.08), 0.055, sides=5, mat='metal', col='#716c64', prm=(0.7, 0, 0, 0))
    for o in ops:
        x0, y0, x1, y1 = o[:4]
        if y1 - y0 > 2.0 or y0 < 0.5: continue
        r = rng.random()
        fl = int((y0 - base) / fh)
        if r < cages * (2.5 if fl < 2 else 0.7):       # security cage
            d = 0.35; n = 7
            rc = srgb('#4a4039') * rng.uniform(0.7, 1.3)
            xs = np.linspace(x0 - 0.05, x1 + 0.05, n)
            w.tube(np.stack([xs, np.full(n, y0 - 0.05), np.full(n, d)], 1), np.stack([xs, np.full(n, y1 + 0.05), np.full(n, d)], 1), 0.012, sides=3, mat='plain', col=rc, mask=MASK_THIN)
            for yy in (y0 - 0.05, (y0 + y1) / 2, y1 + 0.05):
                w.tube((x0 - 0.05, yy, d), (x1 + 0.05, yy, d), 0.014, sides=3, mat='plain', col=rc, mask=MASK_THIN)
                w.tube((x0 - 0.05, yy, 0), (x0 - 0.05, yy, d), 0.014, sides=3, mat='plain', col=rc, mask=MASK_THIN)
                w.tube((x1 + 0.05, yy, 0), (x1 + 0.05, yy, d), 0.014, sides=3, mat='plain', col=rc, mask=MASK_THIN)
            w.box(((x0 + x1) / 2, y0 - 0.06, d / 2), (x1 - x0 + 0.1, 0.03, d), mat='plain', col='#5a554d')
        elif r < cages * 2.5 + ac:                     # air conditioner under the window
            xx = rng.uniform(x0 + 0.3, x1 - 0.3)
            w.box((xx, y0 - 0.45, 0.2), (0.82, 0.55, 0.32), mat='plain', col='#b9b7ad', prm=(0.6, 0, 0, 0))
            w.box((xx, y0 - 0.45, 0.365), (0.5, 0.42, 0.01), mat='plain', col='#55585a')
            w.box((xx, y0 - 0.76, 0.2), (0.9, 0.04, 0.36), mat='plain', col='#4b4640')
        elif r > 0.95:                                 # laundry pole out of the window
            yy = y0 + 0.25; L = rng.uniform(1.1, 1.6)
            for xx in (x0 + 0.15, x1 - 0.15): w.tube((xx, yy, 0), (xx, yy + 0.05, L), 0.014, sides=3, mat='plain', col='#6a665e', mask=MASK_THIN)
            for zz in (L * 0.55, L * 0.95):
                w.tube((x0 + 0.15, yy + 0.04, zz), (x1 - 0.15, yy + 0.04, zz), 0.01, sides=3, mat='plain', col='#6a665e', mask=MASK_THIN)
                for k in range(rng.integers(1, 4)):
                    cx = rng.uniform(x0 + 0.3, x1 - 0.3); cw = rng.uniform(0.25, 0.5); ch = rng.uniform(0.45, 0.85)
                    cc = ['#8d95a3', '#a39a8c', '#7e6f73', '#6f7f86', '#b3b0aa', '#8a4a44', '#c9c2a8', '#5c6a82'][rng.integers(8)]
                    w.quads((cx - cw / 2, yy - ch, zz), (cx + cw / 2, yy - ch, zz), (cx + cw / 2, yy, zz), (cx - cw / 2, yy, zz), mat='plain', col=cc, mask=MASK_THIN, tag=TAG_FOLIAGE)
        elif r > 0.90:                                 # little awning
            w.quads((x0 - 0.1, y1 + 0.02, 0.55), (x1 + 0.1, y1 + 0.02, 0.55), (x1 + 0.1, y1 + 0.3, 0.0), (x0 - 0.1, y1 + 0.3, 0.0), mat='plain', col=['#4f6f8c', '#5b7a66', '#8a8f94'][rng.integers(3)], prm=(0.6, 0, 0, 0))

def _lived_in(w, Wd, H, base, fh, floors, rng, ops, sash=0.22, pots=0.16):
    """open casements, things on sills, cable runs: the small disorder of an inhabited facade"""
    for o in ops:
        x0, y0, x1, y1 = o[:4]
        if y1 - y0 > 2.0 or y0 < 0.5: continue
        if rng.random() < sash:                         # a casement left open
            ww = (x1 - x0) * 0.48; ang = rng.uniform(0.5, 1.35); left = rng.random() < 0.5
            hx = x0 if left else x1; sg = 1 if left else -1
            ex, ez = hx + sg * ww * np.cos(ang), ww * np.sin(ang)
            yb, yt = y0 + 0.05, y0 + (y1 - y0) * 0.7
            w.quads((hx, yb, 0.0), (ex, yb, ez), (ex, yt, ez), (hx, yt, 0.0), mat='glass', prm=(0, ww, yt - yb, 3), seed=rng.random(), tag=TAG_NOSNOW, mask=MASK_THIN)
        if rng.random() < pots:
            for k in range(rng.integers(1, 4)):
                px = rng.uniform(x0 + 0.1, x1 - 0.1)
                w.box((px, y0 + 0.09, 0.07), (0.14, 0.14, 0.12), mat='plain', col=['#7a4a3a', '#4a5a48', '#8a8a84', '#5a6a8a'][rng.integers(4)])
                if rng.random() < 0.6: w.box((px, y0 + 0.24, 0.07), (0.2, 0.18, 0.16), mat='leaf', col='#4a6a3a', tag=TAG_FOLIAGE)
    # cable bundles strung along the wall between clamps, with drops
    for f in range(1, floors, 2):
        y = base + f * fh - 0.32 + rng.uniform(-0.08, 0.08)
        x = rng.uniform(0.3, 2.0)
        while x < Wd - 1.5:
            L = rng.uniform(2.5, 4.2); x2 = min(x + L, Wd - 0.3)
            wire(w, (x, y, 0.06), (x2, y + rng.uniform(-0.05, 0.05), 0.06), sag=rng.uniform(0.06, 0.2), r=0.016, n=5, col='#151516')
            if rng.random() < 0.3: wire(w, (x2, y, 0.06), (x2 + rng.uniform(-0.3, 0.3), y - rng.uniform(0.8, 2.4), 0.05), sag=0.0, r=0.01, n=2, col='#151516')
            x = x2

def _roof_stuff(w, Wd, Dp, y, units, uw, rng):
    w.quads((-Wd / 2, y, Dp / 2), (Wd / 2, y, Dp / 2), (Wd / 2, y, -Dp / 2), (-Wd / 2, y, -Dp / 2), mat='concrete', col='#55524e')
    for u in range(units):
        cx = -Wd / 2 + 0.25 + u * uw + uw / 2
        for dx in (-uw * 0.28, uw * 0.28):               # chimney / vent stacks
            hh = rng.uniform(1.1, 1.6)
            w.box((cx + dx, y + hh / 2, rng.uniform(-1.5, 1.5)), (0.75, hh, 0.6), mat='brick', col='#8a5648')
            w.box((cx + dx, y + hh + 0.04, 0), (0.95, 0.08, 0.8), mat='concrete', col='#7a776f', faces='xXyYzZ')
        if rng.random() < 0.7:                           # stair bulkhead
            w.box((cx - uw * 0.12, y + 1.1, -Dp / 2 + 1.6), (2.4, 2.2, 2.6), mat='plaster', col='#8f8c84')
            w.box((cx - uw * 0.12, y + 2.25, -Dp / 2 + 1.6), (2.7, 0.1, 2.9), mat='concrete', col='#7a776f')
        if rng.random() < 0.35:                          # water tank on legs
            tx, tz = cx + rng.uniform(-uw * 0.3, uw * 0.3), rng.uniform(-2, 2)
            w.box((tx, y + 1.5, tz), (1.6, 1.3, 1.6), mat='metal', col='#6a6e6c', prm=(0.7, 0, 0, 0))
            for sx in (-0.7, 0.7):
                for sz in (-0.7, 0.7): w.tube((tx + sx, y, tz + sz), (tx + sx, y + 0.9, tz + sz), 0.04, sides=4, mat='plain', col='#4a4640')
        if rng.random() < 0.45:
            with w.at((cx + rng.uniform(-uw * 0.35, uw * 0.35), y, rng.uniform(-2.5, 2.5)), yaw=rng.uniform(-0.2, 0.2)): solar_heater(w)
        for k in range(rng.integers(0, 4)):              # junk: boards, bricks, an old basin
            jx, jz = cx + rng.uniform(-uw * 0.45, uw * 0.45), rng.uniform(-Dp * 0.4, Dp * 0.4)
            w.box((jx, y + 0.12, jz), (rng.uniform(0.4, 1.6), 0.24, rng.uniform(0.3, 0.9)), yaw=rng.uniform(0, 3), mat='plain', col=['#5a5046', '#6a4a3e', '#4a4c4e', '#7a766a'][rng.integers(4)], prm=(0.6, 0, 0, 0))
        for k in range(rng.integers(1, 4)):              # TV antennas
            ax = cx + rng.uniform(-uw * 0.4, uw * 0.4); az = rng.uniform(-Dp * 0.35, Dp * 0.35); ah = rng.uniform(2.2, 4.0)
            antenna(w, (ax, y, az), ah, rng)

def antenna(w, p, h, rng):
    x, y, z = p
    c = '#3d3c3a'
    w.tube((x, y, z), (x, y + h, z), 0.018, sides=3, mat='plain', col=c, mask=MASK_THIN)
    yaw = rng.uniform(0, np.pi)
    dx, dz = np.cos(yaw), np.sin(yaw)
    L = 0.9
    w.tube((x - dx * L, y + h - 0.1, z - dz * L), (x + dx * L, y + h - 0.1, z + dz * L), 0.012, sides=3, mat='plain', col=c, mask=MASK_THIN)
    for k in np.linspace(-0.85, 0.85, 6):
        ww = 0.45 - 0.12 * (k + 0.85)
        cxx, czz = x + dx * L * k, z + dz * L * k
        w.tube((cxx + dz * ww, y + h - 0.1, czz - dx * ww), (cxx - dz * ww, y + h - 0.1, czz + dx * ww), 0.008, sides=3, mat='plain', col=c, mask=MASK_THIN)

# ---------------------------------------------------------------- trees
def tree_segs(rng, height=14.0, kind='poplar', trunk_r=None, detail=1.0, maxd=None):
    """returns arrays p0,p1,r0,r1 of branch segments (local, base at origin) and twig tip points"""
    segs = []; tips = []
    up = np.array([0, 1.0, 0])
    P = dict(poplar=dict(up=0.10, wig=0.10, side=0.42, ang=(0.45, 0.85), child=0.62, maxd=5, trunk_frac=0.95, bare=0.22),
             elm=dict(up=0.03, wig=0.16, side=0.34, ang=(0.6, 1.1), child=0.7, maxd=5, trunk_frac=0.55, bare=0.3),
             willow=dict(up=-0.02, wig=0.13, side=0.4, ang=(0.6, 1.2), child=0.72, maxd=5, trunk_frac=0.5, bare=0.3),
             plane=dict(up=0.05, wig=0.14, side=0.3, ang=(0.7, 1.15), child=0.72, maxd=4, trunk_frac=0.45, bare=0.35))[kind]
    r_trunk = trunk_r or height * 0.016
    if maxd: P = dict(P, maxd=maxd)

    def perp(d, ang):
        a = _n(np.cross(d, rng.normal(size=3)))
        return _n(d * np.cos(ang) + a * np.sin(ang))

    def grow(p, d, L, r, depth, is_trunk=False):
        ns = max(2, int(L / (0.55 if r > 0.03 else 0.4)))
        r_end = r * (0.45 if is_trunk else 0.5)
        for i in range(ns):
            f = (i + 1) / ns
            droop = -0.06 * depth if kind == 'willow' and depth >= 3 else P['up']
            d = _n(d + rng.normal(0, P['wig'] * (0.5 if is_trunk else 1), 3) + up * droop)
            p1 = p + d * (L / ns)
            r1 = r + (r_end - r) * f
            segs.append((p, p1, r if i == 0 else rp, r1)); rp = r1
            if depth < P['maxd'] and r1 > 0.006 and f > (P['bare'] if is_trunk else 0.25) and rng.random() < P['side'] * detail * (1.4 if is_trunk else 1.0):
                bl = L * (1 - f * 0.6) * rng.uniform(0.35, 0.6) if is_trunk else L * rng.uniform(0.35, 0.6)
                grow(p1, perp(d, rng.uniform(*P['ang'])), max(bl, 0.5), r1 * rng.uniform(0.4, 0.6), depth + 1)
            p = p1
        if depth < P['maxd'] and r_end > 0.005:
            for k in range(2 if depth > 0 else 3):
                grow(p, perp(d, rng.uniform(0.2, 0.6)), L * P['child'] * rng.uniform(0.7, 1.0), r_end * 0.8, depth + 1)
        else:
            tips.append(p)

    grow(np.zeros(3), _n(np.array([rng.normal(0, 0.03), 1, rng.normal(0, 0.03)])), height * P['trunk_frac'], r_trunk, 0, True)
    a = np.array([np.concatenate([s[0], s[1], [s[2], s[3]]]) for s in segs])
    return a[:, 0:3], a[:, 3:6], a[:, 6], a[:, 7], np.array(tips)

def tree(w, pos, height=14.0, kind='poplar', rng=None, col='#3a332e', yaw=None, detail=1.0, trunk_r=None, maxd=None):
    rng = rng or w.rng
    p0, p1, r0, r1, tips = tree_segs(rng, height, kind, trunk_r, detail, maxd)
    with w.at(pos, yaw=rng.uniform(0, 6.28) if yaw is None else yaw):
        big = r0 > 0.035
        c = srgb(col)
        if big.any(): w.tube(p0[big], p1[big], r0[big], r1[big], sides=6, mat='bark', col=c, mask=MASK_THIN, tag=TAG_TREE)
        sm = ~big
        if sm.any(): w.tube(p0[sm], p1[sm], np.maximum(r0[sm], 0.007), np.maximum(r1[sm], 0.006), sides=3, mat='plain', col=c * 0.8, mask=MASK_THIN, tag=TAG_TREE)
        return w.xf(tips), len(p0)

# ---------------------------------------------------------------- poles, wires, lamps
def wire(w, a, b, sag=0.6, r=0.012, n=10, col='#1c1c1e'):
    a = np.asarray(a, float); b = np.asarray(b, float)
    t = np.linspace(0, 1, n + 1)[:, None]
    p = a + (b - a) * t; p[:, 1] -= sag * 4 * t[:, 0] * (1 - t[:, 0])
    w.tube(p[:-1], p[1:], r, sides=3, mat='plain', col=col, mask=MASK_THIN, tag=TAG_WIRE)

def pole(w, pos, h=9.0, arms=2, lamp=None, col='#8a857c', transformer=False):
    """concrete utility pole. lamp = dict(dir=(x,z), color, grp, power) adds a street lamp arm."""
    x, y, z = pos
    w.tube((x, y, z), (x, y + h, z), 0.16, 0.10, sides=8, mat='concrete', col=col)
    pts = []
    for k in range(arms):
        yy = y + h - 0.35 - 0.7 * k
        w.box((x, yy, z), (1.7, 0.09, 0.09), mat='plain', col='#4a4640', prm=(0.5, 0, 0, 0))
        for dx in (-0.75, -0.3, 0.3, 0.75):
            w.tube((x + dx, yy, z), (x + dx, yy + 0.16, z), 0.035, sides=4, mat='plain', col='#6a3a2c')
            pts.append((x + dx, yy + 0.17, z))
    if transformer:
        w.box((x, y + h * 0.55, z + 0.45), (1.0, 1.2, 0.7), mat='metal', col='#5b6366', prm=(0.5, 0, 0, 0))
        w.box((x, y + h * 0.55 - 0.68, z + 0.3), (1.6, 0.1, 1.1), mat='plain', col='#3c3a36')
    if lamp:
        dx, dz = _n(np.array(lamp['dir'], float)); L = lamp.get('arm', 1.6); yy = y + lamp.get('h', h - 2.2)
        w.tube((x, yy - 0.5, z), (x + dx * L, yy, z + dz * L), 0.03, sides=4, mat='plain', col='#4a4640')
        hx, hz = x + dx * L, z + dz * L
        w.box((hx, yy - 0.02, hz), (0.34, 0.12, 0.34), yaw=np.arctan2(-dz, dx), mat='plain', col='#3c3b38', mask=MASK_NOSHADOW, faces='xXYzZ')
        w.box((hx, yy - 0.085, hz), (0.26, 0.02, 0.26), yaw=np.arctan2(-dz, dx), mat='emit', col=lamp['color'], prm=(lamp.get('glow', 60.0), 0, 0, 0), grp=lamp.get('grp', 0), mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=TAG_NOSNOW)
        w.light('point', np.asarray(srgb(lamp['color'])) * lamp.get('power', 120.0), pos=(hx, yy - 0.25, hz), radius=0.08, grp=lamp.get('grp', 0),
                axis=(0, -1, 0), cone=lamp.get('cone', (0.05, 0.75)), range=lamp.get('range', 70.0), r0=0.6, vol=lamp.get('vol', 0.0))
        return pts, w.xf((hx, yy - 0.12, hz))
    return pts, None

# ---------------------------------------------------------------- vehicles
def car(w, kind='sedan', col='#5a2a26', rng=None):
    """origin at ground centre, length along local x."""
    rng = rng or w.rng
    spec = dict(sedan=dict(L=4.5, W=1.7, h1=0.75, h2=1.38, cab=(-0.9, 1.1), slope=(0.55, 0.5), clear=0.22, wr=0.3),
                van=dict(L=3.6, W=1.45, h1=0.85, h2=1.85, cab=(-1.7, 1.55), slope=(0.1, 0.45), clear=0.2, wr=0.26),
                jeep=dict(L=3.9, W=1.7, h1=0.95, h2=1.8, cab=(-1.75, 0.8), slope=(0.08, 0.3), clear=0.3, wr=0.36))[kind]
    L, W, h1, h2 = spec['L'], spec['W'], spec['h1'], spec['h2']; cl = spec['clear']
    body = [(-L / 2, cl), (L / 2, cl), (L / 2, h1 - 0.08), (L / 2 - 0.06, h1), (-L / 2 + 0.06, h1), (-L / 2, h1 - 0.08)]
    w.extrude(body, -W / 2, W / 2, mat='plain', col=col, prm=(0.25, 0, 0.04, 0.1))
    c0, c1 = spec['cab']; s0, s1 = spec['slope']
    cab = [(c0, h1), (c1, h1), (c1 - s1, h2), (c0 + s0, h2)]
    w.extrude(cab, -W / 2 + 0.06, W / 2 - 0.06, mat='plain', col=col, prm=(0.25, 0, 0.04, 0.1))
    # windows: dark insets on both sides + front/back
    gl = dict(mat='plain', col='#0c1014', prm=(0, 0, 0.12, 0.0), tag=TAG_NOSNOW)
    for sz in (W / 2 - 0.05, -W / 2 + 0.05):
        k = 1 if sz > 0 else -1
        pts = [(c0 + s0 * 0.25 + 0.08, h1 + 0.06, sz + 0.012 * k), (c1 - s1 * 0.25 - 0.08, h1 + 0.06, sz + 0.012 * k), (c1 - s1 * 0.9 - 0.02, h2 - 0.08, sz + 0.012 * k), (c0 + s0 * 0.9 + 0.02, h2 - 0.08, sz + 0.012 * k)]
        w.poly(pts if k > 0 else pts[::-1], **gl)
    for (xa, xb, kx) in ((c1, c1 - s1, 1), (c0, c0 + s0, -1)):
        e = 0.015 * kx
        pts = [(xa - (xa - xb) * 0.12 + e, h1 + (h2 - h1) * 0.12, W / 2 - 0.16), (xa - (xa - xb) * 0.12 + e, h1 + (h2 - h1) * 0.12, -W / 2 + 0.16), (xb + (xa - xb) * 0.1 + e, h2 - (h2 - h1) * 0.1, -W / 2 + 0.16), (xb + (xa - xb) * 0.1 + e, h2 - (h2 - h1) * 0.1, W / 2 - 0.16)]
        w.poly(pts if kx > 0 else pts[::-1], **gl)
    wr = spec['wr']
    for wx in (-L / 2 + 0.75, L / 2 - 0.8):
        for sz in (W / 2 - 0.1, -W / 2 + 0.1):
            w.tube((wx, wr, sz - 0.09), (wx, wr, sz + 0.09), wr, sides=10, mat='plain', col='#111112', caps=True)
    w.box((L / 2, cl + 0.12, 0), (0.08, 0.14, W - 0.1), mat='plain', col='#2b2b2b'); w.box((-L / 2, cl + 0.12, 0), (0.08, 0.14, W - 0.1), mat='plain', col='#2b2b2b')
    return spec

def bicycle(w, col='#1d1d1f', lean=0.12):
    """28-inch roadster, origin at ground under the bottom bracket, pointing +x."""
    M = np.array([[1, 0, 0], [0, np.cos(lean), -np.sin(lean)], [0, np.sin(lean), np.cos(lean)]])
    with w.at((0, 0, 0), M=M):
        r = 0.34
        for cx in (-0.55, 0.55):
            a = np.linspace(0, 2 * np.pi, 13)
            p = np.stack([cx + r * np.cos(a), r + r * np.sin(a), 0 * a], 1)
            w.tube(p[:-1], p[1:], 0.018, sides=3, mat='plain', col='#151515', mask=MASK_THIN)
            for k in range(0, 12, 3):
                w.tube((cx, r, 0), p[k], 0.006, sides=3, mat='plain', col='#777', mask=MASK_THIN)
        fr = dict(sides=3, mat='plain', col=col, mask=MASK_THIN)
        seat = (-0.22, 0.92, 0); head = (0.42, 0.95, 0); bb = (0, 0.3, 0)
        w.tube(bb, seat, 0.016, **fr); w.tube(seat, head, 0.016, **fr); w.tube(bb, (0.4, 0.86, 0), 0.016, **fr)
        w.tube((-0.55, r, 0), seat, 0.012, **fr); w.tube((-0.55, r, 0), bb, 0.012, **fr)
        w.tube((0.55, r, 0), (0.4, 1.08, 0), 0.014, **fr)
        w.tube((0.4, 1.08, -0.26), (0.4, 1.08, 0.26), 0.012, **fr)
        w.box((-0.24, 0.97, 0), (0.26, 0.05, 0.16), mat='plain', col='#18130f')
        w.box((-0.62, 0.74, 0), (0.42, 0.02, 0.14), mat='plain', col='#222')

# ---------------------------------------------------------------- small structures
def shed_row(w, n=8, bay=2.6, depth=3.2, h=2.3, rng=None, style='brick'):
    """row of coal / storage sheds along local x, doors face +z."""
    rng = rng or w.rng
    Wd = n * bay
    col = '#8a5648' if style == 'brick' else '#8f8c84'
    wm = 'brick' if style == 'brick' else 'plaster'
    hb = h + 0.55; hf = h - 0.05
    sd = rng.random()
    w.quads((0, 0, 0), (Wd, 0, 0), (Wd, hf, 0), (0, hf, 0), mat=wm, col=col, seed=sd)
    w.quads((Wd, 0, -depth), (0, 0, -depth), (0, hb, -depth), (Wd, hb, -depth), mat=wm, col=col, seed=sd)
    w.poly([(0, 0, -depth), (0, 0, 0), (0, hf, 0), (0, hb, -depth)], mat=wm, col=col, seed=sd)
    w.poly([(Wd, 0, 0), (Wd, 0, -depth), (Wd, hb, -depth), (Wd, hf, 0)], mat=wm, col=col, seed=sd)
    ov = 0.4; yf = hf - ov * (hb - hf) / depth
    rk = dict(mat='metal', col='#5b5a58', prm=(0.5, 0.18, 0, 0))
    w.quads((-0.2, yf + 0.07, ov), (Wd + 0.2, yf + 0.07, ov), (Wd + 0.2, hb + 0.09, -depth - 0.2), (-0.2, hb + 0.09, -depth - 0.2), **rk)
    w.quads((-0.2, yf, ov), (-0.2, hb + 0.02, -depth - 0.2), (Wd + 0.2, hb + 0.02, -depth - 0.2), (Wd + 0.2, yf, ov), **rk)
    w.quads((-0.2, yf, ov), (Wd + 0.2, yf, ov), (Wd + 0.2, yf + 0.07, ov), (-0.2, yf + 0.07, ov), mat='plain', col='#4a4946')
    for i in range(n):
        x = i * bay + bay / 2
        dc = ['#3f5a4a', '#48566b', '#5a5046', '#4a4f48', '#6a5a44'][rng.integers(5)]
        dw = rng.uniform(0.85, 1.3)
        w.box((x + rng.uniform(-0.3, 0.3), 0.95, 0.02), (dw, 1.9, 0.05), mat='wood', col=dc, prm=(0.7, 0.14, 0, 0))
        if rng.random() < 0.4:
            w.box((x + 0.9, 0.3, 0.45), (rng.uniform(0.4, 0.8), 0.6, 0.5), mat='plain', col='#4b463f', prm=(0.6, 0, 0, 0))
    return Wd

def pingpong(w):
    w.box((0, 0.74, 0), (2.74, 0.1, 1.52), mat='concrete', col='#8f8d86')
    for x in (-0.9, 0.9):
        w.box((x, 0.35, 0), (0.24, 0.7, 1.1), mat='brick', col='#8a5648')
    w.box((0, 0.84, 0), (0.06, 0.1, 1.5), mat='brick', col='#8a5648')

def person(w, h=1.68, coat='#22262c', pants='#15171a', head='#b08a70', hat=None, stride=0.0, arm=0.0):
    """low-poly standing / mid-stride figure facing +x, origin at feet."""
    s = h / 1.7
    hip = 0.86 * s
    for k, sg in enumerate((1, -1)):
        a = stride * sg
        foot = (np.sin(a) * hip, 0.0, 0.09 * sg)
        w.tube((0, hip, 0.09 * sg), foot, 0.075 * s, 0.06 * s, sides=4, mat='plain', col=pants)
    w.box((0, hip + 0.33 * s, 0), (0.26 * s, 0.7 * s, 0.42 * s), mat='plain', col=coat)
    for sg in (1, -1):
        a = -arm * sg
        w.tube((0, hip + 0.6 * s, 0.25 * s * sg), (np.sin(a) * 0.55, hip + 0.6 * s - 0.55 * s * np.cos(a), 0.27 * s * sg), 0.055 * s, 0.045 * s, sides=4, mat='plain', col=coat)
    w.box((0.01, hip + 0.8 * s, 0), (0.19 * s, 0.22 * s, 0.18 * s), mat='plain', col=head)
    if hat: w.box((0.0, hip + 0.9 * s, 0), (0.22 * s, 0.1 * s, 0.21 * s), mat='plain', col=hat)

def text_tex(w, text, font='/usr/share/fonts/truetype/arphic/uming.ttc', size=96, fg='#b02a22', bg='#e8e4d8', pad=0.18, vertical=False, spacing=0.08, wear=0.0, seed=0):
    """render text to a texture; returns (tex id, aspect w/h)"""
    from PIL import Image, ImageDraw, ImageFont
    f = ImageFont.truetype(font, size)
    chars = list(text)
    cw = size * (1 + spacing)
    if vertical: W_, H_ = int(size * (1 + 2 * pad)), int(cw * len(chars) + size * 2 * pad)
    else: W_, H_ = int(cw * len(chars) + size * 2 * pad), int(size * (1 + 2 * pad))
    im = Image.new('RGB', (W_, H_), bg); d = ImageDraw.Draw(im)
    for i, ch in enumerate(chars):
        if vertical: d.text((size * pad, size * pad + i * cw), ch, font=f, fill=fg)
        else: d.text((size * pad + i * cw, size * pad * 0.6), ch, font=f, fill=fg)
    a = np.asarray(im, np.float32) / 255
    a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    if wear > 0:
        from .noise import fbm2
        yy, xx = np.mgrid[0:H_, 0:W_]
        m = fbm2(xx / 30.0, yy / 30.0, 5 + seed, 4) < wear * 0.8
        bgc = np.asarray(srgb(bg))
        a[m] = a[m] * 0.4 + bgc * 0.6
    return w.tex(a), W_ / H_

def kiosk(w, lit='#ffb45e', grp=0, power=6.0, sign=None):
    """small brick hut (gatehouse / shop), 3.0 x 2.6, window + door on +z."""
    Wd, Dp, H = 3.0, 2.6, 2.5
    def wcb(w_, ow, oh): pane(w_, ow, oh, lit=1.6, col=lit, style=0, grp=grp)
    def dcb(w_, ow, oh): w_.quads((0, 0, 0), (ow, 0, 0), (ow, oh, 0), (0, oh, 0), mat='wood', col='#3f5a4a', prm=(0.6, 0.14, 0, 0))
    with w.at((-Wd / 2, 0, Dp / 2)):
        wall(w, Wd, H, [(0.3, 0.95, 1.5, 1.95, wcb, 0.12), (1.85, 0, 2.7, 1.95, dcb, 0.1)], mat='brick', col='#8a5648')
        sill(w, 0.3, 0.95, 1.5)
    w.box((0, H / 2, -0.01), (Wd, H, Dp - 0.02), mat='brick', col='#8a5648', faces='xXz')
    w.box((0, H + 0.06, 0.15), (Wd + 0.5, 0.12, Dp + 0.8), mat='concrete', col='#84817a')
    w.tube((Wd / 2 - 0.5, H, -0.6), (Wd / 2 - 0.5, H + 1.3, -0.6), 0.07, sides=5, mat='metal', col='#55524c', prm=(0.6, 0, 0, 0))   # stove pipe
    w.light('point', np.asarray(srgb(lit)) * power, pos=(-0.6, 1.5, Dp / 2 + 0.35), radius=0.15, grp=grp, range=14.0, r0=0.5, axis=(0, -0.25, 1), cone=(-0.1, 0.6))

def drying_frame(w, span=5.0):
    c = '#4d4a45'
    for x in (-span / 2, span / 2):
        w.tube((x, 0, 0), (x, 2.0, 0), 0.035, sides=4, mat='plain', col=c)
        w.tube((x, 2.0, -0.6), (x, 2.0, 0.6), 0.03, sides=4, mat='plain', col=c)
    for z in (-0.55, 0, 0.55):
        wire(w, (-span / 2, 2.0, z), (span / 2, 2.0, z), sag=0.1, r=0.008, n=6, col='#3a3a3a')

def snowman(w):
    w.sphere((0, 0.36, 0), 0.42, n=8, mat='snow', col='#dfe6ee', squash=0.9)
    w.sphere((0, 0.95, 0), 0.3, n=8, mat='snow', col='#dfe6ee', squash=0.95)
    w.sphere((0, 1.38, 0), 0.2, n=8, mat='snow', col='#dfe6ee')
    w.tube((0.18, 1.38, 0), (0.36, 1.36, 0), 0.03, 0.005, sides=4, mat='plain', col='#c8642a', mask=MASK_THIN)
    w.tube((0, 1.0, 0.25), (0.1, 1.25, 0.7), 0.015, sides=3, mat='plain', col='#3a2e26', mask=MASK_THIN)
    w.tube((0, 1.0, -0.25), (-0.05, 1.2, -0.72), 0.015, sides=3, mat='plain', col='#3a2e26', mask=MASK_THIN)
    w.tube((0, 1.5, 0), (0, 1.66, 0), 0.17, 0.15, sides=7, mat='plain', col='#7a2a26', caps=True, tag=TAG_NOSNOW)   # red bucket hat

def notice_board(w, width=2.6):
    c = '#4a4f48'
    for x in (-width / 2, width / 2):
        w.tube((x, 0, 0), (x, 2.3, 0), 0.05, sides=4, mat='plain', col=c)
    w.box((0, 1.45, 0), (width, 1.1, 0.06), mat='wood', col='#5d6b5c', prm=(0.5, 0.2, 0, 0))
    w.box((0, 2.2, 0.05), (width + 0.4, 0.06, 0.6), mat='metal', col='#5b5a58', prm=(0.5, 0, 0, 0))
    rng = w.rng
    for k in range(5):
        pw, ph = rng.uniform(0.3, 0.6), rng.uniform(0.35, 0.7)
        x = rng.uniform(-width / 2 + 0.35, width / 2 - 0.35); y = rng.uniform(1.2, 1.7)
        w.box((x, y, 0.035), (pw, ph, 0.01), mat='plain', col=['#c9c4b4', '#b9b5a8', '#a8433a', '#c7c2ae', '#b0a48a'][rng.integers(5)], prm=(0.4, 0, 0, 0), tag=TAG_NOSNOW)

def heat_pipes(w, pts, r=0.19, y=1.1):
    """insulated district-heating pipes on concrete saddles along a polyline (x,z)"""
    pts = [np.array([p[0], y, p[1]]) for p in pts]
    for off in (-0.26, 0.26):
        for a, b in zip(pts[:-1], pts[1:]):
            d = _n(b - a); nrm = np.array([-d[2], 0, d[0]]) * off
            w.tube(a + nrm, b + nrm, r, sides=8, mat='plain', col='#8c8a82', prm=(0.6, 0, 0, 0))
    for a, b in zip(pts[:-1], pts[1:]):
        L = np.linalg.norm(b - a); n = max(2, int(L / 4))
        for k in range(n + 1):
            p = a + (b - a) * k / n
            w.box((p[0], y / 2 - 0.1, p[2]), (0.3, y - 0.1, 0.9), yaw=np.arctan2(-(b - a)[2], (b - a)[0]), mat='concrete', col='#7d7a73')

def mound(w, pos, r=1.2, h=0.7, col='#1b1b1d', mat='plain', n=9, tag=0):
    x, y, z = pos
    w.tube((x, y, z), (x, y + h * 0.75, z), r, r * 0.45, sides=n, mat=mat, col=col, tag=tag)
    w.tube((x, y + h * 0.75, z), (x, y + h, z), r * 0.45, 0.02, sides=n, mat=mat, col=col, tag=tag)

def couplet(w, x, y, dw, dh, rng=None, z=0.015, col='#a82a22'):
    """red spring-festival couplets around a door opening centred at x (local wall frame)"""
    kw = dict(mat='plain', col=col, prm=(0.35, 0, 0, 0), tag=TAG_NOSNOW)
    for sx in (-1, 1):
        w.box((x + sx * (dw / 2 + 0.2), y + dh * 0.52, z), (0.24, dh * 0.72, 0.01), **kw)
    w.box((x, y + dh + 0.14, z), (dw * 0.75, 0.2, 0.01), **kw)

def lantern(w, pos, r=0.22, grp=0, glow=2.2, col='#ff3a22'):
    x, y, z = pos
    w.sphere((x, y, z), r, n=8, squash=0.82, mat='emit', col=col, prm=(glow, 0.5, 0, 0), grp=grp, tag=TAG_NOSNOW, mask=MASK_NOSHADOW | MASK_NOBOUNCE)
    w.tube((x, y + r * 0.8, z), (x, y + r * 0.8 + 0.25, z), 0.008, sides=3, mat='plain', col='#222', mask=MASK_THIN)
    w.tube((x, y - r * 0.8, z), (x, y - r * 0.8 - 0.22, z), 0.02, 0.004, sides=3, mat='plain', col='#c9a03a', mask=MASK_THIN)
    w.light('point', np.asarray(srgb(col)) * 0.8, pos=(x, y - 0.1, z), radius=0.1, grp=grp, range=7.0, r0=0.4)

def banner(w, a, b, text, h=0.75, fg='#f2d36b', bg='#b3221c', font='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', sag=0.25):
    """cloth banner between two points (top edge at a.y / b.y)"""
    tid, asp = text_tex(w, text, font=font, size=64, fg=fg, bg=bg, pad=0.5, spacing=0.35)
    a = np.asarray(a, float); b = np.asarray(b, float); L = np.linalg.norm(b - a)
    n = 6
    t = np.linspace(0, 1, n + 1)
    P = a[None] + (b - a)[None] * t[:, None]; P[:, 1] -= sag * 4 * t * (1 - t)
    d = _n(b - a)
    for i in range(n):
        p0 = P[i] - [0, h, 0]; p1 = P[i + 1] - [0, h, 0]
        w.quads(p0, p1, P[i + 1], P[i], mat='tex', prm=(tid, L, h, 0.0), org=a - [0, h, 0], U=d, V=(0, 1, 0), tag=TAG_NOSNOW, mask=MASK_THIN)

def wall_text(w, text, x, y, size=1.5, fg='#9c342a', bg=None, vertical=True, font='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', wear=0.45, z=0.012, wallcol='#d8d2c2'):
    """painted slogan on a wall (local wall frame: x right, y up, wall at z=0); (x,y) = top-left"""
    tid, asp = text_tex(w, text, font=font, size=96, fg=fg, bg=bg or wallcol, pad=0.2, vertical=vertical, wear=wear)
    n = len(text)
    if vertical: W_, H_ = size * 1.4, size * (1.08 * n + 0.4)
    else: W_, H_ = size * (1.08 * n + 0.4), size * 1.4
    w.quads((x, y - H_, z), (x + W_, y - H_, z), (x + W_, y, z), (x, y, z), mat='tex', prm=(tid, W_, H_, 0.0), tag=TAG_NOSNOW)

def foliage(w, tips, n_per=10, size=0.16, col='#3f5a2e', spread=0.5, rng=None, droop=0.2, col2=None, p2=0.0):
    """leaf cards around twig tips (world coords)."""
    rng = rng or w.rng
    tips = np.asarray(tips); N = len(tips) * n_per
    c = np.repeat(tips, n_per, 0) + rng.normal(0, spread, (N, 3)) * np.array([1, 0.7, 1]); c[:, 1] -= droop * rng.random(N)
    a = _n(rng.normal(size=(N, 3))); b = _n(np.cross(a, rng.normal(size=(N, 3))))
    s = size * rng.uniform(0.6, 1.4, N)[:, None]
    cc = np.tile(srgb(col)[None], (N, 1))
    if col2 is not None:
        m = rng.random(N) < p2; cc[m] = srgb(col2)
    w.quads(c - a * s - b * s * 0.7, c + a * s - b * s * 0.7, c + a * s + b * s * 0.7, c - a * s + b * s * 0.7, mat='leaf', col=cc, tag=TAG_FOLIAGE, mask=MASK_THIN, local=False)

def trike(w, col='#3a5a48'):
    """flatbed cargo tricycle, origin at ground centre, pointing +x"""
    r = 0.3
    def wheel(cx, z):
        a = np.linspace(0, 2 * np.pi, 13); p = np.stack([cx + r * np.cos(a), r + r * np.sin(a), z + 0 * a], 1)
        w.tube(p[:-1], p[1:], 0.025, sides=3, mat='plain', col='#111', mask=MASK_THIN)
        for k in range(0, 12, 2): w.tube((cx, r, z), p[k], 0.006, sides=3, mat='plain', col='#666', mask=MASK_THIN)
    wheel(0.95, 0); wheel(-0.6, 0.45); wheel(-0.6, -0.45)
    w.box((-0.55, 0.62, 0), (1.3, 0.05, 0.95), mat='wood', col='#5c5145', prm=(0.6, 0.15, 0, 0))
    for (c, s) in (((-0.55, 0.78, 0.47), (1.3, 0.3, 0.03)), ((-0.55, 0.78, -0.47), (1.3, 0.3, 0.03)), ((-1.2, 0.78, 0), (0.03, 0.3, 0.95))):
        w.box(c, s, mat='metal', col=col, prm=(0.6, 0, 0, 0))
    fr = dict(sides=3, mat='plain', col=col, mask=MASK_THIN)
    w.tube((0.1, 0.62, 0), (0.25, 0.95, 0), 0.02, **fr); w.tube((0.25, 0.95, 0), (0.8, 1.02, 0), 0.02, **fr); w.tube((0.95, r, 0), (0.8, 1.12, 0), 0.02, **fr)
    w.tube((0.8, 1.12, -0.28), (0.8, 1.12, 0.28), 0.014, **fr); w.tube((0.1, 0.62, 0), (0.95, r, 0), 0.02, **fr)
    w.box((0.22, 0.99, 0), (0.26, 0.05, 0.18), mat='plain', col='#18130f')

def solar_heater(w, col='#232b3a'):
    """rooftop solar water heater: tilted tube collector + tank. origin at roof, faces +z (south)"""
    W_, L = 1.9, 1.7
    y0, y1 = 0.35, 1.45; z0, z1 = 0.6, -0.5
    w.quads((-W_ / 2, y0, z0), (W_ / 2, y0, z0), (W_ / 2, y1, z1), (-W_ / 2, y1, z1), mat='metal', col=col, prm=(0.1, 0.09, 0, 0), tag=TAG_NOSNOW)
    w.tube((-W_ / 2 - 0.12, y1 + 0.18, z1), (W_ / 2 + 0.12, y1 + 0.18, z1), 0.24, sides=10, mat='plain', col='#c9ccca', prm=(0.3, 0, 0, 0), caps=True)
    for sx in (-W_ / 2, W_ / 2):
        w.tube((sx, 0, z1), (sx, y1, z1), 0.02, sides=3, mat='plain', col='#8a8e8c'); w.tube((sx, 0, z0), (sx, y0, z0), 0.02, sides=3, mat='plain', col='#8a8e8c')
        w.tube((sx, 0, z0), (sx, y1, z1), 0.015, sides=3, mat='plain', col='#8a8e8c', mask=MASK_THIN)

def pigeon_loft(w):
    """home-made pigeon loft on a roof, opening faces +z"""
    c = '#6a6258'
    for sx in (-0.9, 0.9):
        for sz in (-0.6, 0.6): w.tube((sx, 0, sz), (sx, 0.55, sz), 0.035, sides=4, mat='plain', col='#4a4640')
    w.box((0, 1.2, 0), (2.0, 1.3, 1.4), mat='wood', col=c, prm=(0.7, 0.16, 0, 0), faces='xXyz')
    w.quads((-1.0, 0.55, 0.7), (1.0, 0.55, 0.7), (1.0, 1.85, 0.7), (-1.0, 1.85, 0.7), mat='plain', col='#15130f')
    xs = np.linspace(-0.95, 0.95, 14)
    w.tube(np.stack([xs, np.full(14, 0.55), np.full(14, 0.72)], 1), np.stack([xs, np.full(14, 1.85), np.full(14, 0.72)], 1), 0.008, sides=3, mat='plain', col='#8a8a84', mask=MASK_THIN)
    for yy in (0.9, 1.3): w.tube((-1.0, yy, 0.72), (1.0, yy, 0.72), 0.01, sides=3, mat='plain', col='#8a8a84', mask=MASK_THIN)
    w.quads((-1.15, 1.8, 0.95), (1.15, 1.8, 0.95), (1.15, 2.05, -0.85), (-1.15, 2.05, -0.85), mat='metal', col='#55524e', prm=(0.6, 0.18, 0, 0))
    w.box((0, 0.56, 1.0), (2.0, 0.04, 0.6), mat='wood', col=c, prm=(0.6, 0.2, 0, 0))
    for (x, z) in ((-0.5, 1.05), (0.1, 1.1), (0.55, 0.95)):                       # pigeons on the landing board
        w.sphere((x, 0.68, z), 0.1, n=6, squash=0.8, mat='plain', col=['#7a7e86', '#d8d6d0', '#5a5e68'][int(abs(x * 7)) % 3])
        w.sphere((x + 0.07, 0.8, z), 0.05, n=6, mat='plain', col='#5a5e68')

def figure(w, h=1.7, coat='#22262c', pants='#14161a', skin='#a8826a', hat='#2a2624', scarf=None, pose='stand', lean=0.07):
    """a person as a soft silhouette (tapered limbs, long coat, weight on one leg). faces +x, origin between the feet."""
    s = h / 1.7
    T = dict(sides=9, mat='plain')
    hip = np.array([0.0, 0.9 * s, 0.0]); sh = hip + np.array([lean * 2.2, 0.56 * s, 0.0]) * 1.0
    if pose == 'walk':
        feet = [np.array([0.26 * s, 0, 0.09 * s]), np.array([-0.24 * s, 0.03 * s, -0.09 * s])]
        knees = [np.array([0.2 * s, 0.47 * s, 0.09 * s]), np.array([-0.05 * s, 0.46 * s, -0.09 * s])]
    else:
        feet = [np.array([0.02, 0, 0.1 * s]), np.array([-0.05 * s, 0, -0.12 * s])]
        knees = [np.array([0.03 * s, 0.47 * s, 0.1 * s]), np.array([0.0, 0.46 * s, -0.11 * s])]
    for sg, ft, kn in zip((1, -1), feet, knees):
        hp = hip + np.array([0, 0, 0.085 * s * sg])
        w.tube(hp, kn, 0.085 * s, 0.07 * s, col=pants, **T); w.tube(kn, ft + np.array([0, 0.06 * s, 0]), 0.068 * s, 0.05 * s, col=pants, **T)
        w.box(ft + np.array([0.05 * s, 0.035 * s, 0]), (0.24 * s, 0.07 * s, 0.1 * s), mat='plain', col='#0e0e10')
    # long coat: flared below the hips, narrower at the shoulders
    w.tube(hip + np.array([-0.01, -0.36 * s, 0]), hip + np.array([0.0, 0.06 * s, 0]), 0.21 * s, 0.185 * s, col=coat, **T)
    w.tube(hip + np.array([0.0, 0.05 * s, 0]), sh, 0.185 * s, 0.16 * s, col=coat, **T)
    w.sphere(sh + np.array([0, -0.01, 0]), 0.165 * s, n=8, squash=0.6, mat='plain', col=coat)
    for sg in (1, -1):                              # arms, hands in pockets
        a = sh + np.array([0, -0.03 * s, 0.185 * s * sg]); e = a + np.array([-0.03 * s, -0.3 * s, 0.03 * s * sg]); hnd = hip + np.array([0.07 * s, 0.02 * s, 0.17 * s * sg])
        w.tube(a, e, 0.062 * s, 0.055 * s, col=coat, **T); w.tube(e, hnd, 0.055 * s, 0.05 * s, col=coat, **T)
    head = sh + np.array([lean * 0.9 + 0.02, 0.2 * s, 0.0])
    w.tube(sh, head, 0.055 * s, 0.05 * s, col=skin, **T)
    w.sphere(head, 0.105 * s, n=8, squash=1.08, mat='plain', col=skin)
    if hat: w.sphere(head + np.array([-0.01, 0.035 * s, 0]), 0.112 * s, n=8, squash=0.8, mat='plain', col=hat)
    if scarf:
        w.tube(sh + np.array([0, 0.03 * s, 0]), sh + np.array([0.01, 0.1 * s, 0]), 0.1 * s, 0.085 * s, col=scarf, **T)
        w.tube(sh + np.array([-0.1 * s, 0.05 * s, 0.05 * s]), sh + np.array([-0.16 * s, -0.25 * s, 0.07 * s]), 0.04 * s, 0.03 * s, col=scarf, **T)

def shrub(w, pos, r=0.7, h=1.0, n=38, col='#2e2823', rng=None):
    """bare bush: a burst of thin twigs"""
    rng = rng or w.rng
    p = np.asarray(pos, float)
    a = rng.uniform(0, 6.28, n); el = rng.uniform(0.5, 1.45, n); L = rng.uniform(0.5, 1.0, n) * h
    d = np.stack([np.cos(a) * np.cos(el), np.sin(el), np.sin(a) * np.cos(el)], 1)
    b = p[None] + rng.normal(0, r * 0.25, (n, 3)) * np.array([1, 0, 1])
    m = b + d * L[:, None] * 0.55 + rng.normal(0, 0.05, (n, 3))
    e = m + (d + rng.normal(0, 0.35, (n, 3))) * L[:, None] * 0.45
    w.tube(b, m, 0.012, 0.009, sides=3, mat='plain', col=col, mask=MASK_THIN, tag=TAG_TREE)
    w.tube(m, e, 0.009, 0.005, sides=3, mat='plain', col=col, mask=MASK_THIN, tag=TAG_TREE)

def hedge(w, a, b, h=0.9, wd=0.7, rng=None, col='#2e2823'):
    rng = rng or w.rng
    a = np.asarray(a, float); b = np.asarray(b, float); L = np.linalg.norm(b - a)
    for k in range(int(L / 0.7) + 1):
        p = a + (b - a) * (k * 0.7 / max(L, 1e-6)) + rng.normal(0, 0.12, 3) * np.array([1, 0, 1])
        shrub(w, p, r=wd, h=h * rng.uniform(0.8, 1.2), n=26, col=col, rng=rng)

def bench(w):
    w.box((0, 0.42, 0), (1.6, 0.08, 0.42), mat='concrete', col='#8f8d86')
    for x in (-0.6, 0.6): w.box((x, 0.19, 0), (0.14, 0.38, 0.36), mat='concrete', col='#84827a')

def bike_row(w, n=6, gap=0.55, rng=None):
    rng = rng or w.rng
    for i in range(n):
        if rng.random() < 0.15: continue
        with w.at((rng.normal(0, 0.06), 0, i * gap), yaw=rng.normal(0, 0.12)):
            bicycle(w, col=['#1d1d1f', '#2a3a2e', '#3a2222', '#22283a'][rng.integers(4)], lean=rng.uniform(0.1, 0.25))

def junk_pile(w, rng=None, r=1.0, n=7):
    rng = rng or w.rng
    for k in range(n):
        sx, sy, sz = rng.uniform(0.25, 0.9), rng.uniform(0.12, 0.5), rng.uniform(0.2, 0.7)
        w.box((rng.normal(0, r * 0.4), sy / 2 + rng.uniform(0, 0.25), rng.normal(0, r * 0.4)), (sx, sy, sz), yaw=rng.uniform(0, 3.1),
              mat=['plain', 'wood', 'brick', 'metal'][rng.integers(4)], col=['#5a5046', '#6a4a3e', '#4a4c4e', '#7a766a', '#3f4a52'][rng.integers(5)], prm=(0.6, 0.15, 0, 0))

def house(w, Wd=9.0, Dp=5.5, H=3.0, rng=None, lit=0.3, roof='#5a5a5c', wallc='#8a5648', mat='brick', smoke=False, lit_col=None, grp=0):
    """single-storey brick house with a pitched roof; long side along x, door side faces +z."""
    rng = rng or w.rng
    ops = []
    nwin = max(1, int(Wd // 3))
    for i in range(nwin):
        x = (i + 0.5) * Wd / nwin
        l = rng.uniform(0.7, 1.3) if rng.random() < lit else 0.0
        c = lit_col or WARM[rng.integers(len(WARM))]
        if i == nwin // 2 and nwin > 1:
            def dcb(w_, ow, oh): w_.quads((0, 0, 0), (ow, 0, 0), (ow, oh, 0), (0, oh, 0), mat='wood', col=['#3f5a4a', '#48566b', '#5a4a3a'][rng.integers(3)], prm=(0.6, 0.14, 0, 0))
            ops.append((x - 0.45, 0, x + 0.45, 2.0, dcb, 0.1))
        else:
            def wcb(w_, ow, oh, l=l, c=c): pane(w_, ow, oh, lit=l, col=c, style=0, grp=grp)
            ops.append((x - 0.65, 0.95, x + 0.65, 2.05, wcb, 0.1))
    with w.at((-Wd / 2, 0, Dp / 2)): wall(w, Wd, H, ops, mat=mat, col=wallc)
    w.box((0, H / 2, -0.01), (Wd, H, Dp - 0.02), mat=mat, col=wallc, faces='xXz')
    rh = Dp * 0.36
    prof = [(-Dp / 2 - 0.35, H - 0.1), (Dp / 2 + 0.35, H - 0.1), (0, H + rh)]
    with w.at((0, 0, 0), yaw=np.pi / 2):
        w.extrude(prof, -Wd / 2 - 0.3, Wd / 2 + 0.3, mat='metal', col=roof, prm=(0.25, 0.3, 0, 0), capkw=dict(mat=mat, col=wallc))
    cx = rng.uniform(-Wd * 0.3, Wd * 0.3)
    w.box((cx, H + rh * 0.75, -Dp * 0.15), (0.5, rh * 1.1, 0.5), mat='brick', col='#7c5448')
    return w.xf((cx, H + rh * 1.35, -Dp * 0.15))
