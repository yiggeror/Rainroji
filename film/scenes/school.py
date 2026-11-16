"""夏 · 雨后晚霞 —— 校园 (a school campus after summer rain; afterglow, wet sports ground, a few classrooms still lit)"""
import sys
import numpy as np
from engine.world import World, srgb, MASK_THIN, MASK_NOSHADOW, MASK_NOBOUNCE, _n
from engine.render import Camera
from engine import props as pr, mats, fx
from engine.mats import mat, sstep, mix
from engine.noise import fbm2, hash2
from engine.hooks import GroundMap, wet_hook

NAME = 'school'; T = 9.0; K = 2
G_CLASS = 1
HEI = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
FH = 3.6; BAYW = 3.6
CB_AZ = 0.62          # where the big cloud stands (radians right of -z)

def _ramp(t, stops):
    xs = np.array([s[0] for s in stops]); cs = np.array([srgb(s[1]) * s[2] for s in stops])
    return np.stack([np.interp(t, xs, cs[:, i]) for i in range(3)], -1)

def sky(d, ph=0.0, with_clouds=True):
    y = np.clip(d[:, 1], 0.0, 1.0); el = np.arcsin(y) / (np.pi / 2)
    az = np.arctan2(d[:, 0], -d[:, 2])
    c = _ramp(el, [(0.0, '#f0ac98', 0.85), (0.04, '#e0a4ac', 0.76), (0.10, '#aa9cc4', 0.62), (0.18, '#6f98c8', 0.55), (0.35, '#3f72b8', 0.44), (1.0, '#2a4a96', 0.3)])
    wk = (0.5 - 0.5 * np.cos(az - 2.4)) ** 2                      # brighter and warmer towards the sunset (behind-left of the camera)
    c = c * (1 + 0.5 * wk[:, None]) + wk[:, None] * np.array([0.35, 0.16, 0.06], np.float32)[None] * np.exp(-el * 5)[:, None]
    if with_clouds:
        def dens(sh, e2):
            x = az * 1.7 + sh; yy = e2 * 6.0
            return fbm2(x, yy, 3, 5) * 0.62 + 0.26 * fbm2(x * 3.3 + 5, yy * 3.3, 9, 3) + 0.12 * fbm2(x * 9 + 2, yy * 9, 12, 3)
        dn = dens(0.05 * ph, el) * (1 - ph) + dens(0.05 * (ph - 1.0), el) * ph
        mass = np.exp(-((az - CB_AZ) / 0.42) ** 2)
        top = 0.10 + 0.30 * mass                                  # cloud tops are highest in the big tower
        thr = 0.62 - 0.40 * mass + 0.55 * sstep(top, top + 0.14, el)
        cov = sstep(thr, thr + 0.06, dn) * sstep(0.004, 0.03, el)
        up = dens(0.05 * ph, el + 0.013) * (1 - ph) + dens(0.05 * (ph - 1.0), el + 0.013) * ph
        side = dens(0.05 * ph - 0.03, el) * (1 - ph) + dens(0.05 * (ph - 1.0) - 0.03, el) * ph
        lit = np.clip(0.62 + (dn - up) * 5.0 + (dn - side) * 4.0 - 0.9 * np.clip((top * 0.45 - el) / np.maximum(top, 0.05), 0, 1), 0, 1)
        warm = _ramp(el, [(0.0, '#f0a890', 0.95), (0.12, '#ffc8a8', 1.15), (0.3, '#fff0e0', 1.25), (1.0, '#ffffff', 1.2)])
        cool = _ramp(el, [(0.0, '#8a86a8', 0.5), (0.15, '#7a86b0', 0.5), (0.4, '#8a9ac0', 0.6), (1.0, '#9aaad0', 0.6)])
        cc = cool * (1 - lit[:, None]) + warm * lit[:, None]
        c = c * (1 - cov[:, None]) + cc * cov[:, None]
    return c.astype(np.float32)

def amb_sky(d):
    return sky(d, 0.0, False) * np.array([0.8, 0.92, 1.15], np.float32)[None]

FOG = dict(sigma=0.0010, h=70.0, color=lambda d: sky(np.stack([d[:, 0], np.maximum(d[:, 1], 0.03), d[:, 2]], 1), 0.0, False) * 0.6)

def school(w, rng, NB=11, NF=3, lit=None, slogan='好好学习天天向上', clock=True):
    """teaching block with open corridors. local frame: x along the front, corridor edge at z=+1.9."""
    L = NB * BAYW; lit = lit or {}
    white = '#e2e1d8'
    for f in range(NF):
        y = f * FH
        ops = []
        for b in range(NB):
            x = b * BAYW
            if b == NB // 2:
                ops.append((x + 0.5, y + 0.0, x + BAYW - 0.5, y + 2.9, lambda w_, ow, oh: w_.quads((0, 0, 0), (ow, 0, 0), (ow, oh, 0), (0, oh, 0), mat='plain', col='#1c1d1c'), 1.6))
                continue
            l, g = lit.get((f, b), (0.0, 0))
            dc = ['#5a7a62', '#6a5a44', '#4f6a7a'][rng.integers(3)]
            op = rng.random() < 0.12 or l > 0
            def dcb(w_, ow, oh, dc=dc, op=op, l=l, g=g):
                if l > 0: w_.quads((0, 0, 0), (ow, 0, 0), (ow, oh, 0), (0, oh, 0), mat='emit', col='#e6f2e0', prm=(0.9 * l, 0.1, 0, 0), grp=g, tag=pr.TAG_NOSNOW)
                else: w_.quads((0, 0, 0), (ow, 0, 0), (ow, oh, 0), (0, oh, 0), mat='wood' if not op else 'plain', col=dc if not op else '#141614', prm=(0.6, 0.2, 0, 0))
            ops.append((x + 0.25, y + 0.0, x + 1.15, y + 2.15, dcb, 0.1))
            def wcb(w_, ow, oh, l=l, g=g): pr.pane(w_, ow, oh, lit=l * 1.3, col='#e6f2e0', style=1 if rng.random() < 0.7 else 2, grp=g)
            ops.append((x + 1.45, y + 1.0, x + 3.35, y + 2.65, wcb, 0.12))
            ops.append((x + 0.25, y + 2.35, x + 1.15, y + 2.85, wcb, 0.1))
            if l > 0: w.light('point', np.asarray(srgb('#e6f2e0')) * 1.6 * l, pos=(x + 2.3, y + 2.0, 0.5), radius=0.3, grp=g, range=22.0, r0=0.8)
        pr.wall(w, L, y + FH - 0.16, ops, mat='dado', col='#8fb09a', prm=(y + 1.25, 0, 0, 0), y0=y)
        w.box((L / 2, y + FH - 0.08, 0.95), (L, 0.16, 1.9), mat='concrete', col='#a8a69c')
        if f > 0:
            w.box((L / 2, y + 0.55, 1.84), (L, 1.1, 0.12), mat='tile', col=white)
            w.box((L / 2, y + 0.80, 1.905), (L, 0.22, 0.01), mat='plain', col='#6f9fc8', prm=(0.4, 0, 0, 0))
            w.box((L / 2, y + 1.12, 1.84), (L + 0.04, 0.06, 0.2), mat='concrete', col='#b0aea4')
            for k in range(rng.integers(1, 4)):                  # things left on the corridor wall: mops, a potted plant, a jacket
                px = rng.uniform(1, L - 1)
                w.box((px, y + 1.25, 1.84), (0.3, 0.22, 0.2), mat='leaf', col='#4a6a3a', tag=pr.TAG_FOLIAGE)
        xs = np.arange(0, NB + 1) * BAYW
        w.box(np.stack([xs, np.full(len(xs), y + FH / 2), np.full(len(xs), 1.74)], 1), (0.34, FH, 0.34), mat='tile', col=white)
    H = NF * FH
    w.box((L / 2, H / 2, -4.0), (L, H, 8.0), mat='tile', col=white, faces='xXz')
    w.box((L / 2, H + 0.45, 1.9), (L + 0.3, 0.9, 0.16), mat='tile', col=white)
    w.box((L / 2, H + 0.02, -3.0), (L + 0.3, 0.05, 10.0), mat='concrete', col='#8a8880')
    if slogan:
        n = len(slogan); step = (L - 6) / n
        for i, ch in enumerate(slogan):
            tid, asp = pr.text_tex(w, ch, font=HEI, size=96, fg='#c22a20', bg='#d8d4c6', pad=0.12, wear=0.25, seed=i)
            cx = 3 + step * (i + 0.5) + (0.8 if i >= n // 2 else -0.8); s = 2.0
            w.quads((cx - s / 2, H + 1.0, 2.0), (cx + s / 2, H + 1.0, 2.0), (cx + s / 2, H + 1.0 + s, 2.0), (cx - s / 2, H + 1.0 + s, 2.0), mat='tex', prm=(tid, s, s, 0))
            w.box((cx, H + 1.0 + s / 2, 1.96), (s + 0.1, s + 0.1, 0.05), mat='metal', col='#6a6660', prm=(0.6, 0, 0, 0), faces='xXyYz')
            for dx in (-0.7, 0.7): w.tube((cx + dx, H + 0.9, 1.9), (cx + dx, H + 1.0 + s, 1.6), 0.03, sides=3, mat='plain', col='#4a4744', mask=MASK_THIN)
    if clock:
        with w.at(((NB // 2 + 0.5) * BAYW, (NF - 1) * FH + 0.62, 1.92)):
            w.tube((0, 0, 0), (0, 0, 0.04), 0.36, sides=14, mat='plain', col='#e6e3d8', caps=True)
            w.tube((0, 0, 0.05), (0.0, 0.24, 0.05), 0.02, sides=3, mat='plain', col='#151515'); w.tube((0, 0, 0.05), (0.17, -0.05, 0.05), 0.022, sides=3, mat='plain', col='#151515')
    w.box((L / 2, 0.08, 2.3), (L, 0.16, 0.8), mat='concrete', col='#a8a69c')
    for k in range(4):                                               # roof clutter: tanks, antenna
        with w.at((rng.uniform(3, L - 3), H + 0.05, rng.uniform(-6, -1))): pr.solar_heater(w) if rng.random() < 0.5 else w.box((0, 0.7, 0), (1.6, 1.3, 1.6), mat='metal', col='#6a6e6c', prm=(0.7, 0, 0, 0))
    return L, H

def hoop(w):
    w.tube((0, 0, -0.8), (0, 3.0, -0.8), 0.07, sides=6, mat='metal', col='#5a6a78', prm=(0.7, 0, 0, 0)); w.tube((0, 3.0, -0.8), (0, 3.3, 0.0), 0.06, sides=5, mat='metal', col='#5a6a78', prm=(0.7, 0, 0, 0))
    w.box((0, 3.45, 0.0), (1.8, 1.05, 0.05), mat='wood', col='#d8d6cc', prm=(0.7, 0.3, 0, 0))
    a = np.linspace(0, 2 * np.pi, 11); p = np.stack([0.23 * np.cos(a), np.full(11, 3.05), 0.3 + 0.23 * np.sin(a)], 1)
    w.tube(p[:-1], p[1:], 0.012, sides=3, mat='plain', col='#b3502a', mask=MASK_THIN)

def build():
    w = World(seed=13); rng = np.random.default_rng(17)
    # ---------------------------------------------------------------- sports ground maps
    X0, Z0, X1, Z1 = -110, -70, 130, 90
    def oval(cx, cz, a, b, r, n=64):
        pts = []
        for i in range(n + 1):
            t = 2 * np.pi * i / n; c, s = np.cos(t), np.sin(t)
            x = cx + np.sign(c) * (a - r) + r * c if abs(c) > 1e-9 else cx
            pts.append((cx + (a - r) * np.sign(c) + r * c, cz + r * s))
        return pts
    CX, CZ = 2.0, 8.0
    tm = GroundMap(X0, Z0, X1, Z1, res=5); tm.line(oval(CX, CZ, 44, 22, 22), 8.0, 1.0); tm.done(blur=0.15)
    lm = GroundMap(X0, Z0, X1, Z1, res=8)
    for k in range(6): lm.line(oval(CX, CZ, 40.4 + k * 1.45, 18.4 + k * 1.45, 18.4 + k * 1.45), 0.11, 1.0)
    lm.line([(CX - 21, CZ - 14), (CX + 21, CZ - 14), (CX + 21, CZ + 14), (CX - 21, CZ + 14), (CX - 21, CZ - 14)], 0.11, 0.8); lm.line([(CX, CZ - 14), (CX, CZ + 14)], 0.11, 0.8)
    courts = [(66, -18), (66, 14)]
    cm = GroundMap(X0, Z0, X1, Z1, res=5)
    for (x, z) in courts:
        cm.poly([(x - 9, z - 15), (x + 9, z - 15), (x + 9, z + 15), (x - 9, z + 15)])
        lm.line([(x - 7.5, z - 14), (x + 7.5, z - 14), (x + 7.5, z + 14), (x - 7.5, z + 14), (x - 7.5, z - 14)], 0.11, 1.0); lm.line([(x - 7.5, z), (x + 7.5, z)], 0.11, 1.0)
        for zz in (z - 14, z + 14):
            for a0 in range(0, 180, 15):
                a, b = np.radians(a0), np.radians(a0 + 15); sg = 1 if zz < z else -1
                lm.line([(x + 6.2 * np.cos(a), zz + sg * 6.2 * np.sin(a)), (x + 6.2 * np.cos(b), zz + sg * 6.2 * np.sin(b))], 0.11, 1.0)
    cm.done(blur=0.1); lm.done(blur=0.03)
    pm = GroundMap(X0, Z0, X1, Z1, res=4)
    pm.line([(-100, -24), (120, -24)], 6.0, 1.0); pm.line([(50, -60), (50, 80)], 4.0, 1.0); pm.line([(-52, -60), (-52, 80)], 4.0, 1.0); pm.line([(-100, 40), (-52, 40)], 4.0, 1.0)
    pm.done(blur=0.15)
    @mat('campus')
    def campus(S):
        x, z = S.P[:, 0], S.P[:, 2]
        n1 = fbm2(x * 0.15, z * 0.15, 3, 5); n2 = fbm2(x * 8, z * 8, 9, 2); n3 = fbm2(x * 0.6, z * 0.6, 23, 4)
        f8 = mats.fade(S, 8)
        dirt = srgb('#8f8468')[None] * (0.7 + 0.4 * n1 + 0.16 * (n2 - 0.5) * f8)[:, None]
        grass = srgb('#5f7a48')[None] * (0.6 + 0.5 * n2 * f8 + 0.3 * n1)[:, None]
        infield = mix(dirt, grass, sstep(0.35, 0.6, n3))
        alb = mix(dirt, infield, 0.9)
        tr = tm.sample(x, z)
        alb = mix(alb, srgb('#8a4f40')[None] * (0.75 + 0.35 * n1 + 0.15 * (n2 - 0.5) * f8)[:, None], sstep(0.4, 0.6, tr))
        ct = cm.sample(x, z)
        alb = mix(alb, srgb('#5f7068')[None] * (0.8 + 0.3 * n1)[:, None], sstep(0.4, 0.6, ct))
        p = pm.sample(x, z)
        alb = mix(alb, srgb('#9a988c')[None] * (0.8 + 0.25 * n1 + 0.1 * (n2 - 0.5) * f8)[:, None], sstep(0.4, 0.6, p) * (1 - sstep(0.4, 0.6, tr)))
        ln = lm.sample(x, z) * (0.45 + 0.55 * sstep(0.3, 0.6, n3))
        alb = mix(alb, srgb('#e6e2d6')[None], ln * 0.75)
        # standing water after the rain
        pud = sstep(0.585, 0.63, fbm2(x * 0.16 + 3, z * 0.16 + 7, 91, 4) + 0.12 * (fbm2(x * 0.9, z * 0.9, 92, 3) - 0.5) + 0.05 * (sstep(0.4, 0.6, tr) + sstep(0.4, 0.6, ct)))
        alb = alb * (1 - 0.5 * pud)[:, None] * 0.72
        return dict(alb=np.clip(alb, 0, 1), refl=(0.014 + 0.72 * pud).astype(np.float32), rough=np.where(pud > 0.5, 0.002, 0.05).astype(np.float32), aux=pud.astype(np.float32))
    w.quads((-900, 0, 400), (900, 0, 400), (900, 0, -1200), (-900, 0, -1200), mat='campus', tag=pr.TAG_NOSNOW)
    # ---------------------------------------------------------------- buildings
    with w.at((-24.0, 0, -36.0), yaw=0.0):
        L, H = school(w, np.random.default_rng(5), NB=12, NF=3, lit={(1, 8): (1.0, G_CLASS), (1, 9): (1.0, 0), (2, 2): (0.8, 0), (0, 10): (0.7, 0)})
    with w.at((92.0, 0, 26.0), yaw=-np.pi / 2):
        school(w, np.random.default_rng(6), NB=14, NF=4, lit={(2, 3): (0.9, 0), (2, 4): (0.9, 0), (0, 9): (0.7, 0)}, slogan='团结勤奋求实创新')
    with w.at((40.0, 0, -44.0)):                                    # single-storey canteen with a chimney
        c0 = pr.house(w, Wd=22, Dp=9, H=4.2, rng=np.random.default_rng(7), lit=0.5, wallc='#b9ac86', mat='plaster', roof='#6a5a50')
    w.chim = [c0]
    # flag platform
    w.box((-4.0, 0.3, -24.0), (3.4, 0.6, 3.4), mat='concrete', col='#b3b0a6'); w.box((-4.0, 0.12, -24.0), (4.6, 0.24, 4.6), mat='concrete', col='#a8a69c')
    w.tube((-4.0, 0.6, -24.0), (-4.0, 14.2, -24.0), 0.07, 0.045, sides=6, mat='plain', col='#cfd2d0'); w.sphere((-4.0, 14.3, -24.0), 0.12, n=6, mat='plain', col='#c9b04a')
    # courts: hoops ; pitch: goals
    for (x, z) in courts:
        with w.at((x, 0, z - 14.2), yaw=0): hoop(w)
        with w.at((x, 0, z + 14.2), yaw=np.pi): hoop(w)
    for sx in (-1, 1):
        gx = CX + sx * 21
        for dz in (-3.6, 3.6): w.tube((gx, 0, CZ + dz), (gx, 2.4, CZ + dz), 0.05, sides=5, mat='plain', col='#d8d6cc')
        w.tube((gx, 2.4, CZ - 3.6), (gx, 2.4, CZ + 3.6), 0.05, sides=5, mat='plain', col='#d8d6cc')
    # ping-pong tables, bars, bike shed, water trough, a stand of low terraces
    for i in range(6):
        with w.at((-62.0, 0, 4.0 + i * 4.2), yaw=0.05): pr.pingpong(w)
    for i, hh in enumerate((1.5, 1.9, 2.3)):
        x0 = -66 + i * 2.6
        for dx in (0, 2.0): w.tube((x0 + dx, 0, 34), (x0 + dx, hh, 34), 0.035, sides=5, mat='metal', col='#5a6a78', prm=(0.7, 0, 0, 0))
        w.tube((x0, hh, 34), (x0 + 2.0, hh, 34), 0.02, sides=4, mat='plain', col='#8a8e90')
    with w.at((-78.0, 0, -8.0), yaw=np.pi / 2):
        for x in np.arange(0, 30, 3.0): w.tube((x, 0, 0), (x, 2.3, 0), 0.05, sides=4, mat='plain', col='#5a6066'); w.tube((x, 0, 2.4), (x, 2.0, 2.4), 0.05, sides=4, mat='plain', col='#5a6066')
        w.quads((-0.5, 2.0, 2.8), (30, 2.0, 2.8), (30, 2.4, -0.4), (-0.5, 2.4, -0.4), mat='metal', col='#6a7a86', prm=(0.5, 0.18, 0, 0))
        for k in range(5):
            with w.at((2 + k * 5.5, 0, 0.6), yaw=np.pi / 2): pr.bike_row(w, 6, gap=0.6, rng=rng)
    for k in range(4): w.box((CX, 0.2 + 0.4 * k, CZ + 30.5 + 0.8 * k), (60, 0.4, 0.8), mat='concrete', col='#a09e94')
    w.box((48.0, 0.42, -30.2), (6.0, 0.84, 0.9), mat='concrete', col='#a8a69c')
    # campus wall + gate + lodge
    for (xa, za, xb, zb) in ((-96, -60, -96, 86), (-96, 86, 126, 86)):
        cx_, cz_ = (xa + xb) / 2, (za + zb) / 2; Lw = np.hypot(xb - xa, zb - za)
        w.box((cx_, 1.3, cz_), (Lw if za == zb else 0.3, 2.6, 0.3 if za == zb else Lw), mat='plaster', col='#cfcab8')
    with w.at((-90.0, 0, 50.0), yaw=np.pi / 2): pr.kiosk(w, lit='#ffc070', power=4.0)
    # ---------------------------------------------------------------- trees (wet, heavy summer green)
    trng = np.random.default_rng(31)
    def summer(pos, h, kind='plane', n_per=30, size=0.24, tr=None, spread=0.7):
        tips, n = pr.tree(w, pos, h, kind, trng, col='#4a4238', trunk_r=tr)
        pr.foliage(w, tips, n_per=n_per, size=size, col='#3f6a30', spread=spread, rng=trng, col2='#5a8a38', p2=0.3)
    for x in np.arange(-88, 120, 11.0):
        if abs(x - 50) < 5 or abs(x + 52) < 5 or (-30 < x < 20): continue
        summer((x + trng.normal(0, 0.8), 0, -27.5 + trng.normal(0, 0.5)), trng.uniform(9, 12))
    for z in np.arange(-10, 80, 10.0):
        summer((-56 + trng.normal(0, 0.6), 0, z), trng.uniform(9, 12)); summer((54.5 + trng.normal(0, 0.6), 0, z + 4), trng.uniform(9, 11))
    for x in np.arange(-80, 120, 12.0): summer((x, 0, 80 + trng.normal(0, 1)), trng.uniform(10, 13), 'poplar', n_per=22, size=0.3)
    summer((-44, 0, 52), 9.5, n_per=90, size=0.11, spread=0.6); summer((16, 0, 54), 8.0, n_per=90, size=0.11, spread=0.6)
    # ---------------------------------------------------------------- the town beyond
    for i, (p, yw, un, fl, stl) in enumerate([((-60, 0, -100), 0.05, 4, 6, 'brick'), ((10, 0, -110), -0.03, 4, 6, 'plaster'), ((85, 0, -105), 0.1, 3, 6, 'tile'), ((150, 0, -60), -0.3, 4, 6, 'yellow'),
                                              ((-20, 0, -160), 0.0, 5, 6, 'brick2'), ((70, 0, -170), 0.05, 5, 7, 'plaster'), ((-110, 0, -150), 0.1, 4, 6, 'brick'), ((170, 0, -140), 0.0, 4, 9, 'tile'),
                                              ((200, 0, 20), -np.pi / 2, 4, 6, 'brick'), ((-150, 0, -40), 0.4, 3, 6, 'plaster')]):
        with w.at(p, yaw=yw): pr.apt_block(w, units=un, floors=fl, style=stl, rng=np.random.default_rng(80 + i), lit=0.12, details=(i < 3), cages=0.15, ac=0.1, roof_stuff=(i < 6), lit_gain=1.4)
    w.tube((30, 0, -140), (30, 26, -140), 1.5, 1.2, sides=10, mat='brick', col='#9c6a58'); w.tube((30, 26, -140), (30, 31, -140), 3.3, 3.3, sides=12, mat='plaster', col='#b9b6aa', caps=True)
    prev = None
    for x in (-140, -90, -40, 10, 60, 110, 160):
        pts, _ = pr.pole(w, (x, 0, -62), h=9.5, arms=2, col='#6a655c')
        if prev:
            for a, b in zip(prev, pts): pr.wire(w, a, b, sag=1.0, r=0.014)
        prev = pts
    for (zz, hh, col, sd) in ((-1400, 120, '#5a6a8a', 1), (-900, 60, '#4f5c78', 2)):
        xs = np.linspace(-2600, 2600, 120)
        ys = np.maximum(hh * (0.25 + 0.75 * fbm2(xs * 0.0016, xs * 0 + sd, 60 + sd, 4)), 4)
        w.quads(np.stack([xs[:-1], np.zeros(119), np.full(119, zz)], 1), np.stack([xs[1:], np.zeros(119), np.full(119, zz)], 1),
                np.stack([xs[1:], ys[1:], np.full(119, zz)], 1), np.stack([xs[:-1], ys[:-1], np.full(119, zz)], 1), mat='plain', col=col, prm=(0.2, 0, 0, 0))
    w.light('sun', np.array([1.0, 0.62, 0.45]) * 0.22, dir=_n(np.array([-0.75, 0.28, 0.55])), soft=0.22)
    return w

def camera():
    return Camera((-24.0, 15.5, 72.0), (10.0, 4.5, -24.0), fov=56.0)

HOOK = wet_hook(0.5)
RENDER = dict(K=K, fog=FOG, hook=HOOK, bounce_range=120.0, skyamb=1.0, amb_sky=amb_sky, emis_clamp=1.0)
GRADE = dict(exposure=1.3, contrast=1.2, sat=1.15, shoulder=1.0, lift=(0.02, 0.022, 0.04))
PAL = dict(k=96, chroma_w=4.0)
DENOISE = dict(sl=0.10)
FLAG_TOP = (-3.93, 14.1, -24.0)

def setup(plate, cam):
    c = dict(plate=plate, cam=cam)
    H, W = plate['sky'].shape
    yy, xx = np.mgrid[0:H, 0:W]
    c['dirs'] = cam.dirs(xx.ravel() + 0.5, yy.ravel() + 0.5).astype(np.float32)
    c['skymask'] = plate['sky'] > 0.003
    c['fol'] = np.clip(plate.get('tag1', np.zeros((H, W), np.float32)) * 2.0, 0, 1)
    c['water'] = plate['aux'] > 0.45
    c['sw'] = fx.Flock(cam, plate, (6.0, 5.0, 6.0), rx=38.0, rz=20.0, n=9, T=T, seed=3, tilt=3.0, laps=1)
    c['sw2'] = fx.Flock(cam, plate, (50.0, 9.0, -20.0), rx=30.0, rz=22.0, n=7, T=T, seed=4, tilt=4.0, laps=1)
    c['smoke'] = [fx.Smoke(cam, plate, p, n=8, T=T, loops=1, rise=0.9, wind=(0.3, 0, -0.1), r0=0.4, grow=0.5, seed=20 + i, alpha=0.45) for i, p in enumerate(plate.get('chim', []))]
    d = _n(np.array([np.sin(CB_AZ + 0.08), 0.2, -np.cos(CB_AZ + 0.08)]))
    px, py, _, zf = cam.project(cam.pos[None] + d[None] * 1000.0)
    c['bolt'] = (px[0], py[0])
    c['xx'], c['yy'] = xx, yy
    return c

def frame(c, ph):
    P = c['plate']; H, W = P['sky'].shape; L = P['layers']
    skyimg = np.zeros((H * W, 3), np.float32); m = c['skymask'].ravel()
    skyimg[m] = sky(c['dirs'][m], ph)
    skyimg = skyimg.reshape(H, W, 3)
    # sheet lightning deep inside the cloud tower: two soft pulses per loop
    fl = fx.pulse(ph, 0.21, 0.235, 0.006) * 0.9 + fx.pulse(ph, 0.25, 0.262, 0.004) * 0.6 + fx.pulse(ph, 0.71, 0.73, 0.006) * 0.7
    if fl > 0:
        g = np.zeros((H, W, 3), np.float32); fx.glow(g, c['bolt'][0] + (30 if ph > 0.5 else 0), c['bolt'][1] + (6 if ph > 0.5 else 0), np.array([0.9, 0.85, 1.1]) * fl, r0=16.0, power=1.6)
        skyimg = skyimg + g * (skyimg.mean(-1, keepdims=True) > 0.42)
    cls = 1.0 + 0.06 * (fx.stepnoise(ph, 90, 3) - 0.5) - 0.5 * fx.pulse(ph, 0.44, 0.449, 0.002) - 0.35 * fx.pulse(ph, 0.462, 0.468, 0.002)
    lin = skyimg * P['sky'][..., None] + L[0] + L[G_CLASS] * cls
    xx, yy = c['xx'], c['yy']
    rip = np.sin(2 * np.pi * (2 * ph + fbm2(xx * 0.07, yy * 0.5, 7, 2) * 3.0))
    sh = np.where(rip > 0.75, 1, np.where(rip < -0.75, -1, 0))
    shifted = np.where((sh == 1)[..., None], np.roll(lin, 1, 1), np.where((sh == -1)[..., None], np.roll(lin, -1, 1), lin))
    lin = np.where(c['water'][..., None], shifted, lin)
    for s in c['smoke']: s.draw(lin, ph, np.array([0.34, 0.33, 0.38], np.float32))
    fx.cloth(lin, c['cam'], P['depth'], FLAG_TOP, ph, w=2.4, h=1.6, wind=(1, 0, 0.3), col=(0.62, 0.06, 0.05), amb=0.75, limp=0.85, k=1)
    lin = fx.sway(lin, c['fol'], ph, k=1)
    for f in (c['sw'], c['sw2']): f.draw(lin, ph, np.array([0.03, 0.03, 0.05]), np.array([0.06, 0.06, 0.08]))
    return fx.bloom(lin, thresh=0.9, sig=(1.2, 5.0), gain=(0.2, 0.14))
