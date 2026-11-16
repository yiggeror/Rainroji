"""秋 · 暮 —— 小城边的铁路 (dusk over the edge of a small town; a green passenger train glides past)"""
import sys
import numpy as np
from engine.world import World, srgb, MASK_THIN, MASK_NOSHADOW, MASK_NOBOUNCE, MASK_NEAR, _n
from engine.render import Camera
from engine import props as pr, mats, fx, dyn
from engine.mats import mat, sstep, mix
from engine.noise import fbm2, fbm3, hash2
from engine.hooks import GroundMap

NAME = 'rail'; T = 9.0; K = 3; TWO_PASS = True
G_R1, G_R2 = 1, 2
HEI = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
CAR_L = 25.5; NCAR = 4
RAIL_Y = 0.55
# the track: a straight line through TR0 with direction TRD
TR0 = np.array([0.0, 0.0, -42.0]); TRYAW = 0.17
TRD = np.array([np.cos(TRYAW), 0.0, -np.sin(TRYAW)])
TRN = np.array([np.sin(TRYAW), 0.0, np.cos(TRYAW)])        # towards the camera side
MOON = _n(np.array([-0.30, 0.165, -0.94]))

def _ramp(t, stops):
    xs = np.array([s[0] for s in stops]); cs = np.array([srgb(s[1]) * s[2] for s in stops])
    return np.stack([np.interp(t, xs, cs[:, i]) for i in range(3)], -1)

def sky(d, ph=0.0):
    y = np.clip(d[:, 1], 0.0, 1.0); el = np.arcsin(y) / (np.pi / 2)
    az = np.arctan2(d[:, 0], -d[:, 2])
    west = _ramp(el, [(0.0, '#ffb07a', 1.05), (0.035, '#ffa888', 0.92), (0.08, '#f0a0a0', 0.74), (0.14, '#c69ab8', 0.58), (0.22, '#8f8fc0', 0.44), (0.36, '#5a6aa8', 0.32), (1.0, '#2a3a72', 0.2)])
    east = _ramp(el, [(0.0, '#8a86a8', 0.3), (0.1, '#6a70a0', 0.27), (0.4, '#3f4f8a', 0.22), (1.0, '#2a3a72', 0.2)])
    k = (0.5 + 0.5 * np.cos(az)) ** 1.3
    c = east * (1 - k[:, None]) + west * k[:, None]
    a = fbm2(az * 2.6 + 3.0 + 0.08 * ph, el * 30.0, 7, 5); b = fbm2(az * 2.6 + 3.0 + 0.08 * (ph - 1.0), el * 30.0, 7, 5)
    n1 = a * (1 - ph) + b * ph
    cl = sstep(0.55, 0.75, n1) * sstep(0.03, 0.09, el) * (1 - sstep(0.3, 0.5, el))
    lit = _ramp(el, [(0.0, '#ff8a6a', 1.0), (0.12, '#f0889a', 0.75), (0.3, '#9a7aa8', 0.4), (1.0, '#5a5a8a', 0.25)])
    c = c * (1 - 0.75 * cl[:, None]) + lit * (0.75 * cl * (0.4 + 0.6 * k))[:, None] + east * (0.75 * cl * 0.6 * (1 - k))[:, None]
    # crescent moon
    cm = d @ MOON.astype(np.float32)
    off = _n(MOON + np.array([0.012, 0.004, 0.0]))
    disc = sstep(0.99990, 0.99994, cm) * (1 - sstep(0.99988, 0.99992, d @ off.astype(np.float32)))
    c = c + disc[:, None] * np.array([1.6, 1.5, 1.25], np.float32)[None]
    return c.astype(np.float32)

FOG = dict(sigma=0.0016, h=60.0, color=lambda d: sky(np.stack([d[:, 0], np.maximum(d[:, 1], 0.04), d[:, 2]], 1)) * 0.55)

def amb_sky(d):
    return sky(d) * 0.5 + np.array([0.05, 0.075, 0.15], np.float32)[None]

def terrain(x, z):
    hill = 10.5 * sstep(14.0, 66.0, z) * (0.8 + 0.2 * np.cos(x * 0.02))
    return hill + 0.5 * (fbm2(x * 0.03, z * 0.03, 41, 3) - 0.5) * sstep(-60, 20, z) * 2.0

def along(s, off=0.0, y=0.0):
    p = TR0 + TRD * s + TRN * off
    return (p[0], y, p[2])

def build():
    w = World(seed=9); rng = np.random.default_rng(33)
    # ---------------------------------------------------------------- land: fields, lanes, pond
    gm = GroundMap(-260, -420, 260, 90, res=3)          # lanes
    lane = [(8, 70), (4, 40), (-6, 10), (-14, -20), (-18, -60), (-16, -110), (-30, -200), (-40, -400)]
    gm.line(lane, 3.4, 1.0)
    gm.line([(-18, -80), (30, -86), (90, -98), (200, -110)], 3.0, 1.0); gm.line([(-16, -118), (60, -130), (150, -150)], 2.6, 1.0)
    gm.line([(40, -86), (44, -200)], 2.6, 1.0); gm.line([(100, -100), (108, -220)], 2.6, 1.0)
    gm.done(blur=0.5)
    wm = GroundMap(-260, -420, 260, 90, res=2)          # water
    wm.poly([(14, -10), (40, -6), (66, -9), (84, -18), (80, -30), (56, -35), (30, -33), (12, -24)])
    wm.line([(84, -22), (130, -30), (200, -34)], 3.0, 1.0)
    wm.done(blur=0.8)
    w.wm = wm
    @mat('land')
    def land(S):
        x, z = S.P[:, 0], S.P[:, 2]
        n1 = fbm2(x * 0.15, z * 0.15, 3, 4); n2 = fbm2(x * 6, z * 6, 9, 2); n3 = fbm2(x * 0.5 + 4, z * 0.5, 21, 4)
        # patchwork of harvested fields
        u = x * 0.9 + z * 0.25; v = z * 0.9 - x * 0.25
        cu = u / 34.0; cv = v / 22.0
        hh = hash2(cu, cv, 51)
        pal = np.stack([srgb('#6a5a40'), srgb('#7a6a45'), srgb('#5a5238'), srgb('#857548'), srgb('#4f4a36'), srgb('#6f6a4a')])
        fld = pal[(hh * 6).astype(np.int64) % 6]
        furrow = 0.88 + 0.12 * np.sin((u if 1 else v) * (5.0 + 3.0 * hh)) * mats.fade(S, 1.0)
        edge = np.minimum(np.minimum(cu - np.floor(cu), 1 - (cu - np.floor(cu))) * 34.0, np.minimum(cv - np.floor(cv), 1 - (cv - np.floor(cv))) * 22.0)
        fld = fld * (furrow * (0.75 + 0.4 * n1))[:, None]
        fld = mix(srgb('#9a9058')[None] * (0.7 + 0.5 * n2 * mats.fade(S, 6))[:, None], fld, sstep(0.5, 1.8, edge))
        wild = srgb('#84764a')[None] * (0.6 + 0.6 * n2 * mats.fade(S, 6) + 0.3 * n1)[:, None]
        k = sstep(-10.0, 12.0, z) * 1.0                               # the hillside near the camera is rough grass
        alb = mix(fld, wild, np.clip(k + sstep(0.6, 0.75, n3) * 0.6, 0, 1))
        rd = gm.sample(x, z)
        alb = mix(alb, srgb('#8a8272')[None] * (0.75 + 0.3 * n1)[:, None], sstep(0.3, 0.7, rd))
        wt = sstep(0.45, 0.6, wm.sample(x, z))
        alb = mix(alb, srgb('#141c26')[None], wt)
        return dict(alb=np.clip(alb, 0, 1), refl=(wt * 0.75).astype(np.float32), rough=(wt * 0.0025).astype(np.float32), aux=wt.astype(np.float32))
    w.grid(-240, -330, 240, 86, 3.0, terrain, mat='land', tag=pr.TAG_GROUND, seed=0.5)
    w.quads((-2500, -0.2, -320), (2500, -0.2, -320), (2500, -0.2, -3000), (-2500, -0.2, -3000), mat='land', tag=pr.TAG_GROUND)
    # distant ridges
    for (zz, hh, col, sd) in ((-1500, 150, '#4a4a66', 1), (-1100, 95, '#45455c', 2), (-800, 55, '#3f3f52', 3)):
        xs = np.linspace(-2600, 2600, 140)
        ys = hh * (0.25 + 0.75 * fbm2(xs * 0.0016, xs * 0 + sd, 60 + sd, 4)) * (0.6 + 0.4 * np.sin(xs * 0.0011 + sd))
        ys = np.maximum(ys, 4)
        P0 = np.stack([xs[:-1], np.zeros(139), np.full(139, zz)], 1); P1 = np.stack([xs[1:], np.zeros(139), np.full(139, zz)], 1)
        P2 = np.stack([xs[1:], ys[1:], np.full(139, zz)], 1); P3 = np.stack([xs[:-1], ys[:-1], np.full(139, zz)], 1)
        w.quads(P0, P1, P2, P3, mat='plain', col=col, prm=(0.2, 0, 0, 0))
    # ---------------------------------------------------------------- the railway (embankment, sleepers, rails, poles)
    with w.at(tuple(TR0), yaw=TRYAW):
        with w.at((0, 0, 0), yaw=np.pi / 2):
            w.extrude([(-3.6, 0.0), (3.6, 0.0), (2.0, 0.42), (-2.0, 0.42)], -420, 420, mat='gravel', col='#6a645c', caps=False)
        xs = np.arange(-420, 420, 0.65)
        w.box(np.stack([xs, np.full(len(xs), 0.41), np.zeros(len(xs))], 1), (0.24, 0.16, 2.5), mat='concrete', col='#6f6a62')
        for z in (-0.7175, 0.7175):
            w.box((0, RAIL_Y - 0.075, z), (840, 0.15, 0.07), mat='plain', col='#3a2e28', over={'Y': dict(mat='plain', col='#8f9296', prm=(0, 0, 0.55, 0.01))})
        prev = None
        for x in np.arange(-400, 401, 50.0):
            pts, _ = pr.pole(w, (x, 0, -5.2), h=8.0, arms=3, col='#6a655c')
            if prev:
                for a, b in zip(prev, pts): pr.wire(w, a, b, sag=0.8, r=0.012, n=8)
            prev = pts
        # level crossing where the lane meets the track
        sx = -15.5
        w.box((sx, 0.5, 0), (5.0, 0.1, 5.0), mat='concrete', col='#77746c')
        with w.flag(MASK_NEAR):
            for zz, k in ((4.2, 1), ):
                w.box((sx - 3.4, 0.7, zz), (0.28, 1.4, 0.28), mat='concrete', col='#8a877f')
                xs_ = np.linspace(sx - 3.4, sx + 3.4, 11)
                for i in range(10):
                    w.box(((xs_[i] + xs_[i + 1]) / 2, 1.15, zz), (xs_[i + 1] - xs_[i], 0.13, 0.08), mat='plain', col='#b5302a' if i % 2 == 0 else '#d8d4c8', prm=(0.35, 0, 0, 0))
            w.tube((sx + 4.2, 0, 4.6), (sx + 4.2, 3.9, 4.6), 0.07, sides=6, mat='plain', col='#a8a8a2')
            w.box((sx + 4.2, 2.7, 4.66), (0.95, 0.42, 0.05), mat='plain', col='#151515')
            for dx, g in ((-0.25, G_R1), (0.25, G_R2)):
                w.sphere((sx + 4.2 + dx, 2.7, 4.72), 0.14, n=6, mat='emit', col='#ff2a18', prm=(7.0, 0.05, 0, 0), grp=g, tag=pr.TAG_NOSNOW, mask=MASK_NOBOUNCE | MASK_NOSHADOW)
            with w.at((sx - 7.5, 0, 7.5), yaw=0.0):
                pr.kiosk(w, lit='#ffb866', power=5.0)
            pr.pole(w, (sx + 5.4, 0, 6.6), h=7.6, arms=1, lamp=dict(dir=(-1, -0.2), color='#ffa24a', power=16.0, h=6.3, arm=2.0, vol=0.004, range=40.0, cone=(0.1, 0.8)))
    # ---------------------------------------------------------------- the edge of town beyond the track
    hrng = np.random.default_rng(91)
    chim = []
    for r, zz in enumerate((-70, -92, -110, -128, -148, -170, -195, -225)):
        x = -30 + hrng.uniform(0, 12) + (r % 2) * 5
        while x < 230:
            Wd = hrng.uniform(7.5, 12.5)
            if abs(x + Wd / 2 - 42) < 5 or abs(x + Wd / 2 - 104) < 5: x += 8; continue
            with w.at((x + Wd / 2, 0, zz + hrng.uniform(-2, 2)), yaw=hrng.uniform(-0.05, 0.05) + TRYAW * 0.5):
                c = pr.house(w, Wd=Wd, Dp=hrng.uniform(5, 6.5), H=hrng.uniform(2.8, 3.3), rng=hrng, lit=0.34,
                             roof=['#5a5a5c', '#6a4a40', '#55504c', '#7a5a4a'][hrng.integers(4)], wallc=['#8a5648', '#93604e', '#9a968c', '#7c5448'][hrng.integers(4)],
                             mat='brick' if hrng.random() < 0.75 else 'plaster')
                if hrng.random() < 0.28: chim.append(c)
                if hrng.random() < 0.7:                           # courtyard wall + a shed
                    w.box((0, 0.9, 6.5), (Wd + 2, 1.8, 0.25), mat='brick', col='#7c5448'); w.box((Wd / 2 + 0.9, 0.9, 3.2), (0.25, 1.8, 6.5), mat='brick', col='#7c5448')
                    if hrng.random() < 0.5: w.box((-Wd / 2 + 1.5, 1.1, 4.4), (2.6, 2.2, 2.4), mat='brick', col='#7c5448')
            x += Wd + hrng.uniform(3.5, 9)
    w.chim = chim
    for i, (p, yw, un, fl, stl) in enumerate([((150, 0, -260), 0.1, 3, 5, 'brick'), ((60, 0, -280), -0.05, 4, 6, 'plaster'), ((-70, 0, -300), 0.1, 3, 5, 'brick2'), ((230, 0, -330), 0.0, 4, 6, 'tile'), ((-180, 0, -260), 0.2, 3, 4, 'yellow')]):
        with w.at(p, yaw=yw): pr.apt_block(w, units=un, floors=fl, style=stl, rng=np.random.default_rng(60 + i), lit=0.14, details=False, cages=0, roof_stuff=False, lit_gain=1.5)
    w.tube((120, 0, -300), (120, 28, -300), 1.6, 1.3, sides=10, mat='brick', col='#7c5448'); w.tube((120, 28, -300), (120, 33, -300), 3.3, 3.3, sides=12, mat='plaster', col='#8f8c84', caps=True)
    w.tube((-120, 0, -380), (-120, 60, -380), 2.2, 1.2, sides=10, mat='brick', col='#7c5448')
    # trees: poplar rows along lanes and the pond, scattered in the village
    trng = np.random.default_rng(72)
    def autumn(pos, h, det=0.9, near=False):
        tips, n = pr.tree(w, pos, h, 'poplar', trng, col='#2e2823', detail=det)
        pr.foliage(w, tips[trng.random(len(tips)) < 0.75], n_per=7 if near else 5, size=0.14 if near else 0.3, col='#c29a32', spread=0.4 if near else 0.6, rng=trng, col2='#9a6a26', p2=0.3)
    for zz in np.arange(-58, -200, -11.0):
        lx = np.interp(zz, [-200, -110, -60], [-30, -16, -18])
        autumn((lx - 4.2 + trng.normal(0, 0.4), 0, zz), trng.uniform(12, 16))
        if trng.random() < 0.7: autumn((lx + 4.2 + trng.normal(0, 0.4), 0, zz + 4), trng.uniform(12, 16))
    for a in np.linspace(0, 6.28, 16)[:-1]:
        autumn((-108 + 62 * np.cos(a) + trng.normal(0, 3), 0, -87 + 30 * np.sin(a) + trng.normal(0, 2)), trng.uniform(10, 15))
    for i in range(46): autumn((trng.uniform(-10, 220), 0, trng.uniform(-235, -72)), trng.uniform(9, 14), det=0.75)
    rr = np.random.default_rng(88)
    n = 9000; rx = rr.uniform(8, 90, n); rz = rr.uniform(-38, -3, n)
    wv = wm.sample(rx, rz); m = (wv > 0.12) & (wv < 0.5); rx, rz = rx[m], rz[m]; n = len(rx)
    hh = rr.uniform(0.6, 1.6, n); a = rr.uniform(0, np.pi, n); lean = rr.normal(0, 0.2, (n, 2))
    b0 = np.stack([rx - np.cos(a) * 0.03, np.zeros(n), rz - np.sin(a) * 0.03], 1); b1 = np.stack([rx + np.cos(a) * 0.03, np.zeros(n), rz + np.sin(a) * 0.03], 1)
    top = np.stack([lean[:, 0], hh, lean[:, 1]], 1)
    w.quads(b0, b1, b1 + top, b0 + top, mat='leaf', col=srgb('#9a8450')[None] * rr.uniform(0.5, 1.2, (n, 1)), tag=pr.TAG_FOLIAGE, mask=MASK_THIN, local=False)
    # ---------------------------------------------------------------- the hillside in front (NEAR)
    with w.flag(MASK_NEAR):
        for (x, z, h) in ((-24, 44, 13), (26, 40, 12), (-36, 20, 11), (-8, -8, 11), (-52, -4, 12), (96, -4, 12)):
            tips, n = pr.tree(w, (x, float(terrain(np.array([x]), np.array([z]))[0]), z), h, 'poplar', trng, col='#2e2823')
            pr.foliage(w, tips[trng.random(len(tips)) < 0.7], n_per=8, size=0.12, col='#c29a32', spread=0.38, rng=trng, col2='#9a6a26', p2=0.3)
        srng = np.random.default_rng(12)
        for k in range(70):
            x, z = srng.uniform(-70, 70), srng.uniform(-22, 50)
            pr.shrub(w, (x, float(terrain(np.array([x]), np.array([z]))[0]), z), r=srng.uniform(0.5, 1.2), h=srng.uniform(0.8, 1.8), rng=srng, col='#3a3026')
        # dry grass on the slope
        n = 90000; gx = srng.uniform(-70, 70, n); gz = srng.uniform(4, 64.5, n); gy = terrain(gx, gz)
        near = np.clip((66.5 - gz) / 16.0, 0.12, 1.0)
        hh = srng.uniform(0.12, 0.42, n) * near; a = srng.uniform(0, np.pi, n); wd = srng.uniform(0.012, 0.03, n) * near; lean = srng.normal(0, 0.12, (n, 2))
        b0 = np.stack([gx - np.cos(a) * wd, gy, gz - np.sin(a) * wd], 1); b1 = np.stack([gx + np.cos(a) * wd, gy, gz + np.sin(a) * wd], 1)
        top = np.stack([lean[:, 0], hh, lean[:, 1]], 1)
        w.quads(b0, b1, b1 + top, b0 + top, mat='leaf', col=srgb('#9a8450')[None] * srng.uniform(0.6, 1.3, (n, 1)), tag=pr.TAG_FOLIAGE, mask=MASK_THIN, local=False)
        # sheaves of maize stalks stacked in the nearest field, a fence along the lane
        for k in range(22):                                  # maize sheaves standing in rows
            x, z = -58 + (k % 6) * 9.0 + srng.normal(0, 0.8), -26 + (k // 6) * 8.0 + srng.normal(0, 0.8)
            pr.mound(w, (x, 0, z), 0.95, 2.1, col='#a89052', n=8)
        w.box((4.0, 1.2, -4.0), (3.0, 2.4, 2.6), mat='brick', col='#8a5648'); w.box((4.0, 2.45, -4.0), (3.4, 0.12, 3.0), mat='concrete', col='#7d7a72')     # pump house by the pond
        for k in range(14):                                  # bean poles in a vegetable plot
            w.tube((-30 + k * 0.9, 0, 8 + srng.normal(0, 0.1)), (-30 + k * 0.9 + srng.normal(0, 0.1), 1.9, 8.3), 0.02, sides=3, mat='plain', col='#5a4a36', mask=MASK_THIN)
        for z in np.arange(8, 52, 2.6):
            lx = np.interp(z, [10, 40, 70], [-6, 4, 8]) + 2.6
            y = float(terrain(np.array([lx]), np.array([z]))[0])
            w.tube((lx, y, z), (lx + srng.normal(0, 0.05), y + 1.1, z), 0.04, sides=4, mat='plain', col='#4a4036')
    return w

def camera():
    cy = float(terrain(np.array([4.0]), np.array([66.0]))[0])
    return Camera((4.0, cy + 1.75, 66.0), (14.0, 8.0, -80.0), fov=52.0)

# ------------------------------------------------------------------ the train
def build_train():
    w = World(seed=3); rng = np.random.default_rng(5)
    base = RAIL_Y + 0.7
    for k in range(-9, 12):
        rng = np.random.default_rng(100 + k % NCAR)          # the consist repeats every NCAR cars, so the loop closes exactly
        with w.at((k * CAR_L, 0, 0)):
            L = 23.8
            for bx in (-8.6, 8.6):
                for dx in (-1.2, 1.2):
                    for z in (-0.7175, 0.7175): w.tube((bx + dx, RAIL_Y + 0.46, z - 0.07), (bx + dx, RAIL_Y + 0.46, z + 0.07), 0.46, sides=10, mat='plain', col='#1a1817', caps=True)
                w.box((bx, RAIL_Y + 0.55, 0), (3.6, 0.35, 2.3), mat='plain', col='#1c1a19')
            w.box((0, base - 0.08, 0), (L, 0.5, 2.9), mat='plain', col='#1f1e1c')
            w.box((0, base + 0.2, 0), (9.0, 0.7, 2.4), mat='plain', col='#242220')
            for sx in (-1, 1): w.box((sx * (L / 2 + 0.4), base + 0.1, 0), (0.9, 0.25, 0.25), mat='plain', col='#1c1a19')
            Hb = 2.75; green = '#27432f'
            w.box((0, base + 0.17 + Hb / 2, 0), (L, Hb, 3.1), mat='metal', col=green, prm=(0.35, 0, 0, 0))
            prof = [(-1.55, base + 0.17 + Hb), (1.55, base + 0.17 + Hb), (1.2, base + Hb + 0.5), (0.5, base + Hb + 0.72), (-0.5, base + Hb + 0.72), (-1.2, base + Hb + 0.5)]
            with w.at((0, 0, 0), yaw=np.pi / 2): w.extrude(prof, -L / 2, L / 2, mat='metal', col='#55585a', prm=(0.4, 0, 0, 0))
            for z in (1.555, -1.555):
                w.box((0, base + 1.12, z), (L, 0.09, 0.01), mat='plain', col='#c9a83a'); w.box((0, base + 0.42, z), (L, 0.06, 0.01), mat='plain', col='#c9a83a')
                nwin = 12; xs = np.linspace(-L / 2 + 2.6, L / 2 - 2.6, nwin)
                for i, x in enumerate(xs):
                    r = rng.random()
                    lit = 0.0 if r < 0.08 else (0.55 if r < 0.3 else 1.0)
                    col = ['#ffd9a0', '#ffe2b4', '#f5d49a', '#e8e0c8'][rng.integers(4)]
                    sg = 1 if z > 0 else -1
                    a_, b_ = (x - 0.52, x + 0.52) if sg > 0 else (x + 0.52, x - 0.52)
                    w.quads((a_, base + 1.3, z + 0.006 * sg), (b_, base + 1.3, z + 0.006 * sg), (b_, base + 2.25, z + 0.006 * sg), (a_, base + 2.25, z + 0.006 * sg),
                            mat='emit', col=col, prm=(1.5 * lit, 0.05 + 0.1 * (lit == 0), 0, 0), tag=pr.TAG_NOSNOW)
                    if rng.random() < 0.35:                 # half-drawn curtain
                        w.quads((a_, base + 1.3, z + 0.009 * sg), ((a_ + b_) / 2, base + 1.3, z + 0.009 * sg), ((a_ + b_) / 2, base + 2.25, z + 0.009 * sg), (a_, base + 2.25, z + 0.009 * sg), mat='emit', col='#c9b08a', prm=(0.5 * lit, 0.3, 0, 0), tag=pr.TAG_NOSNOW)
                for x in (-L / 2 + 0.9, L / 2 - 0.9):
                    w.box((x, base + 1.3, z), (0.8, 2.0, 0.012), mat='metal', col='#2f4a36', prm=(0.4, 0, 0, 0))
    return w

RENDER = dict(K=K, fog=FOG, bounce_range=150.0, skyamb=1.0, emis_clamp=1.0, amb_sky=amb_sky)
GRADE = dict(exposure=1.45, contrast=1.1, sat=1.05, shoulder=1.0, lift=(0.02, 0.022, 0.04), tint_sh=(-0.01, 0.0, 0.03))
PAL = dict(k=96, chroma_w=4.0)
DENOISE = dict(sl=0.10)

def setup(plate, cam):
    c = dict(plate=plate, cam=cam)
    H, W = plate['sky'].shape
    yy, xx = np.mgrid[0:H, 0:W]
    c['dirs'] = cam.dirs(xx.ravel() + 0.5, yy.ravel() + 0.5).astype(np.float32)
    F = plate['far']
    c['skymask'] = F['sky'] > 0.003
    tw = World(seed=1)
    c['train'] = dyn.Dyn(build_train(), cam, S=5)
    axes, E = dyn.ambient_cube(amb_sky, ground=(0.03, 0.035, 0.05))
    R = np.array([[np.cos(TRYAW), 0, np.sin(TRYAW)], [0, 1, 0], [-np.sin(TRYAW), 0, np.cos(TRYAW)]])
    def shade(sf, P, D):
        N = sf['N'] @ R.T.astype(np.float32)
        wts = np.maximum(N @ axes.T, 0) ** 2
        ao = 0.3 + 0.7 * np.clip((P[:, 1] - 0.6) / 1.6, 0, 1)
        return sf['alb'] * (wts @ E) * ao[:, None] * 1.4 + sf['emis']
    c['shade'] = shade
    c['R'] = R
    ends = np.array([along(-330, 0, 0.3), along(330, 0, 0.3), along(-330, 0, 5.6), along(330, 0, 5.6)])
    py = cam.project(ends)[1]
    c['rows'] = (max(0, int(py.min()) - 3), min(H, int(py.max()) + 4))
    c['fogcol'] = FOG['color'](np.array([[0.1, 0.04, -1.0]], np.float32))[0]
    w_ch = plate.get('chim', [])
    c['smoke'] = [fx.Smoke(cam, F, p, n=7, T=T, loops=1, rise=1.0, wind=(0.35, 0, 0.1), r0=0.35, grow=0.55, seed=20 + i, alpha=0.5) for i, p in enumerate(w_ch)]
    c['birds'] = fx.Flock(cam, plate, (60.0, 46.0, -260.0), rx=190.0, rz=90.0, n=13, T=T, seed=5, tilt=10.0)
    c['fol'] = np.clip(plate.get('tag1', np.zeros((H, W), np.float32)) * 2.5, 0, 1) * (plate['near_a'] > 0.2)
    lp = np.array([TR0 + TRD * (-15.5 + 4.2 - 0.25) + TRN * 4.72, TR0 + TRD * (-15.5 + 4.2 + 0.25) + TRN * 4.72]); lp[:, 1] = 2.7
    c['lamps'] = cam.project(lp)
    c['water'] = np.clip(F['aux'] * 1.5, 0, 1)
    c['xx'], c['yy'] = xx, yy
    return c

def frame(c, ph):
    P = c['plate']; F = P['far']; H, W = P['sky'].shape
    r1 = 1.0 if (ph * 9) % 1.0 < 0.5 else 0.0
    g = np.array([1.0, 0.06 + 0.94 * r1, 0.06 + 0.94 * (1 - r1)], np.float32)
    skyimg = np.zeros((H * W, 3), np.float32); m = c['skymask'].ravel()
    skyimg[m] = sky(c['dirs'][m], ph)
    lin = skyimg.reshape(H, W, 3) * F['sky'][..., None]
    for k in range(K): lin += g[k] * F['layers'][k]
    # the pond shivers a little
    xx, yy = c['xx'], c['yy']
    rip = np.sin(2 * np.pi * (2 * ph + fbm2(xx * 0.09, yy * 0.6, 7, 2) * 3.0))
    sh = np.where(rip > 0.6, 1, np.where(rip < -0.6, -1, 0))
    wmask = c['water'] > 0.5
    shifted = np.where((sh == 1)[..., None], np.roll(lin, 1, 1), np.where((sh == -1)[..., None], np.roll(lin, -1, 1), lin))
    lin = np.where(wmask[..., None], shifted, lin)
    for s in c['smoke']: s.draw(lin, ph, c['fogcol'] * 0.45 + np.array([0.06, 0.06, 0.08], np.float32))
    c['birds'].draw(lin, ph, np.array([0.05, 0.05, 0.07]), np.array([0.09, 0.08, 0.1]), fog=0.0012, fogcol=c['fogcol'])
    # train
    y0, y1 = c['rows']
    s = ph * NCAR * CAR_L
    off = TR0 + TRD * s
    rgb, a = c['train'].render_xf(off, c['R'], c['shade'], F['depth'], y0, y1, fog=FOG['sigma'] * 0.8, fogcol=c['fogcol'])
    lin[y0:y1] = lin[y0:y1] * (1 - a[..., None]) + rgb
    lin = lin * (1 - P['near_a'][..., None])
    for k in range(K): lin += g[k] * P['near'][k]
    lx, ly, _, _ = c['lamps']
    for i in range(2): fx.glow(lin, lx[i], ly[i], np.array([1.0, 0.1, 0.05]) * 0.45 * (g[1 + i] - 0.06), r0=1.2, power=1.7)
    lin = fx.sway(lin, c['fol'], ph, k=2)
    return fx.bloom(lin, thresh=0.8, sig=(1.0, 4.0), gain=(0.22, 0.14))
