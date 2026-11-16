"""春 · 晨雾 —— 天台 (rooftops in spring dawn fog; pigeons circling)"""
import sys
import numpy as np
from engine.world import World, srgb, MASK_THIN, MASK_NOSHADOW, MASK_NOBOUNCE, _n
from engine.render import Camera
from engine import props as pr, mats, fx
from engine.mats import mat, sstep, mix
from engine.noise import fbm2, fbm3, hash2
from engine.hooks import GroundMap

NAME = 'roof'; T = 9.0; K = 2
G_RED = 1
SUN = _n(np.array([0.34, 0.085, -0.94]))
RY = 26.94         # our roof level (9 floors)

def sky(d):
    y = np.clip(d[:, 1], 0.0, 1.0); el = np.arcsin(y) / (np.pi / 2)
    zen = srgb('#8fa3c0') * 0.62; hor = srgb('#d9c2bc') * 0.74
    t = el ** 0.6
    c = hor[None] * (1 - t[:, None]) + zen[None] * t[:, None]
    cs = np.clip(d @ SUN.astype(np.float32), -1, 1)
    c = c + (np.clip(cs, 0, 1) ** 8)[:, None] * np.array([0.5, 0.28, 0.16], np.float32)[None] * 0.9
    disc = sstep(0.99965, 0.99985, cs)
    c = c * (1 - disc[:, None]) + disc[:, None] * np.array([1.9, 1.15, 0.75], np.float32)[None]
    return c.astype(np.float32)

def fogcol(d):
    cs = np.clip(d @ SUN.astype(np.float32), 0, 1)
    base = np.array([0.50, 0.50, 0.56], np.float32)[None] * np.ones((len(d), 1), np.float32)
    return base + (cs ** 5)[:, None] * np.array([0.42, 0.22, 0.10], np.float32)[None]

FOG = dict(sigma=0.0062, h=38.0, color=fogcol)

def amb_sky(d):
    return sky(d) * 0.85 + 0.06

@mat('town')
def town(S):
    x, z = S.P[:, 0], S.P[:, 2]
    n1 = fbm2(x * 0.08, z * 0.08, 3, 4); n2 = fbm2(x * 3, z * 3, 9, 2)
    dirt = srgb('#6f6a5e')[None] * (0.7 + 0.5 * n1 + 0.2 * (n2 - 0.5) * mats.fade(S, 3))[:, None]
    grass = srgb('#72865a')[None] * (0.7 + 0.5 * n1)[:, None]
    g = sstep(0.5, 0.62, fbm2(x * 0.05 + 9, z * 0.05, 31, 3))
    alb = mix(dirt, grass, g * 0.7)
    road = S.world.gm.sample(x, z)
    return np.clip(mix(alb, srgb('#55555a')[None] * (0.8 + 0.3 * n1)[:, None], road), 0, 1)

def crane(w, pos, h=95.0, jib=42.0, yaw=0.4):
    c = '#b8922e'
    with w.at(pos, yaw=yaw):
        for sx in (-1, 1):
            for sz in (-1, 1): w.tube((sx, 0, sz), (sx, h, sz), 0.16, sides=3, mat='plain', col=c, mask=MASK_THIN)
        for k in range(int(h / 4)):
            y = k * 4.0
            w.tube((-1, y, 1), (1, y + 4, 1), 0.08, sides=3, mat='plain', col=c, mask=MASK_THIN); w.tube((1, y, -1), (-1, y + 4, -1), 0.08, sides=3, mat='plain', col=c, mask=MASK_THIN)
            w.tube((1, y, 1), (1, y + 4, -1), 0.08, sides=3, mat='plain', col=c, mask=MASK_THIN); w.tube((-1, y, -1), (-1, y + 4, 1), 0.08, sides=3, mat='plain', col=c, mask=MASK_THIN)
        w.tube((-14, h, 0), (jib, h, 0), 0.25, sides=3, mat='plain', col=c, mask=MASK_THIN); w.tube((-14, h + 1.6, 0), (jib, h + 1.6, 0), 0.18, sides=3, mat='plain', col=c, mask=MASK_THIN)
        for x in np.arange(-14, jib, 3.2): w.tube((x, h, 0), (x + 1.6, h + 1.6, 0), 0.08, sides=3, mat='plain', col=c, mask=MASK_THIN); w.tube((x + 1.6, h + 1.6, 0), (x + 3.2, h, 0), 0.08, sides=3, mat='plain', col=c, mask=MASK_THIN)
        w.tube((0, h, 0), (0, h + 9, 0), 0.2, sides=3, mat='plain', col=c, mask=MASK_THIN)
        w.tube((0, h + 9, 0), (jib * 0.8, h + 1.6, 0), 0.06, sides=3, mat='plain', col='#333', mask=MASK_THIN); w.tube((0, h + 9, 0), (-14, h + 1.6, 0), 0.06, sides=3, mat='plain', col='#333', mask=MASK_THIN)
        w.box((-12, h - 1.5, 0), (4, 2.6, 2.2), mat='concrete', col='#8a8880')
        w.tube((jib * 0.6, h, 0), (jib * 0.6, h - 30, 0), 0.04, sides=3, mat='plain', col='#333', mask=MASK_THIN)
        return w.xf((0, h + 9, 0)), w.xf((jib, h + 1.6, 0))

def roof_life(w, Wd, Dp, y, rng):
    """what people keep on a flat roof: a pigeon loft, washing lines, pots, a sofa nobody wanted"""
    with w.at((rng.uniform(-Wd * 0.3, Wd * 0.3), y, rng.uniform(-1.5, 2.0)), yaw=rng.uniform(-0.4, 0.4)): pr.pigeon_loft(w)
    for k in range(int(rng.integers(1, 3))):
        x0 = rng.uniform(-Wd / 2 + 2, Wd / 2 - 8); z0 = rng.uniform(-3, 3); L = rng.uniform(4, 6.5)
        pa = np.array([x0, y + 2.0, z0]); pb = np.array([x0 + L, y + 2.0, z0 + rng.uniform(-1, 1)])
        for p in (pa, pb): w.tube((p[0], y, p[2]), p, 0.03, sides=4, mat='plain', col='#4a4640')
        pr.wire(w, pa, pb, sag=0.12, r=0.008, n=6)
        t = 0.06
        while t < 0.9:
            dt = rng.uniform(0.08, 0.3); hh = rng.uniform(0.6, 1.3)
            a_ = pa + (pb - pa) * t; b_ = pa + (pb - pa) * min(t + dt, 0.95); a_[1] -= 0.1; b_[1] -= 0.1
            c = ['#d9d6cc', '#8fa3b8', '#c9a8a0', '#b8b48a', '#c9c2b0', '#7a8a9a', '#b8423a', '#e6e2d6'][rng.integers(8)]
            w.quads(a_ - [0, hh, 0], b_ - [0, hh, 0], b_, a_, mat='plain', col=c, tag=pr.TAG_FOLIAGE, mask=MASK_THIN)
            t += dt + rng.uniform(0.02, 0.08)
    for k in range(int(rng.integers(3, 9))):
        x, z = rng.uniform(-Wd / 2 + 1, Wd / 2 - 1), rng.uniform(-Dp / 2 + 0.6, Dp / 2 - 0.6)
        w.tube((x, y, z), (x, y + 0.28, z), 0.13, 0.17, sides=7, mat='plain', col='#8a5a44', caps=True)
        w.sphere((x, y + 0.5, z), rng.uniform(0.2, 0.35), n=6, mat='leaf', col=['#5a7a48', '#6a8a52', '#b8607a', '#7a9a5a'][rng.integers(4)], tag=pr.TAG_FOLIAGE)
    with w.at((rng.uniform(-Wd * 0.4, Wd * 0.4), y, rng.uniform(-3, 3))): pr.junk_pile(w, rng, r=1.2, n=7)
    w.box((rng.uniform(-Wd * 0.4, Wd * 0.4), y + 0.4, rng.uniform(-3, 3)), (1.8, 0.8, 0.8), yaw=rng.uniform(0, 3), mat='plain', col='#6a4a44', prm=(0.6, 0, 0, 0))

def build():
    w = World(seed=23); rng = np.random.default_rng(29)
    gm = GroundMap(-260, -420, 260, 40, res=2)
    for z in (-14, -48, -82, -118, -156, -200, -250): gm.line([(-260, z), (260, z + rng.uniform(-4, 4))], 5.0, 1.0)
    for x in (-150, -86, -34, 38, 96, 160): gm.line([(x, 40), (x + rng.uniform(-6, 6), -420)], 5.0, 1.0)
    gm.done(blur=0.6); w.gm = gm
    w.quads((-900, 0, 300), (900, 0, 300), (900, 0, -1500), (-900, 0, -1500), mat='town', tag=pr.TAG_GROUND)
    # ---------------------------------------------------------------- our own roof (a 9-storey slab)
    with w.at((2.0, 0, 5.4)):
        pr.apt_block(w, units=4, floors=9, style='plaster', rng=np.random.default_rng(2), lit=0.0, roof_stuff=False, details=False)
        y = RY
        w.quads((-27, y, 5.3), (27, y, 5.3), (27, y, -5.3), (-27, y, -5.3), mat='concrete', col='#5f5c57')
    for (x, h) in ((-9.0, 3.4), (14.0, 3.0)): pr.antenna(w, (x, RY, 0.9), h, np.random.default_rng(int(abs(x) * 10) % 97))
    # ---------------------------------------------------------------- the neighbourhood
    styles = ['brick', 'plaster', 'brick2', 'yellow', 'tile', 'brick']
    k = 0
    for r, z in enumerate((-31, -65, -100, -137, -178, -224, -276, -335)):
        x = -190 + rng.uniform(-20, 0)
        while x < 190:
            un = int(rng.integers(2, 5)); fl = int(rng.choice([5, 6, 6, 6, 7] if r < 5 else [6, 7, 9, 12])) if r > 0 else int(rng.choice([5, 6]))
            Wd = un * 13.2 + 0.5
            st = styles[int(rng.integers(len(styles)))]
            near = (r <= 1) and abs(x + Wd / 2) < 70
            with w.at((x + Wd / 2, 0, z + rng.uniform(-3, 3)), yaw=rng.uniform(-0.04, 0.04) + (np.pi if rng.random() < 0.0 else 0)):
                info = pr.apt_block(w, units=un, floors=fl, style=st, rng=np.random.default_rng(100 + k), lit=0.045 if r < 4 else 0.03, details=near, cages=0.15, ac=0.05,
                                    roof_stuff=(r < 3), lit_gain=1.3, back_lit=0.08)
                if r < 2:
                    for i in range(int(rng.integers(1, 5))):
                        with w.at((rng.uniform(-Wd / 2 + 2, Wd / 2 - 2), info['roof_y'], rng.uniform(-3, 3)), yaw=np.pi): pr.solar_heater(w)
                    if near: roof_life(w, Wd, 10.5, info['roof_y'], np.random.default_rng(300 + k))
            x += Wd + rng.uniform(7, 16); k += 1
    # courtyard trees: bare with pale buds, a few in blossom
    trng = np.random.default_rng(37)
    for i in range(46):
        x, z = trng.uniform(-110, 110), trng.choice([-14, -48, -82, -118]) + trng.uniform(-4, 4)
        tips, n = pr.tree(w, (x, 0, z), trng.uniform(9, 14), 'poplar' if trng.random() < 0.6 else 'elm', trng, col='#3a332e', detail=0.8)
        r = trng.random()
        if r < 0.2: pr.foliage(w, tips, n_per=10, size=0.3, col='#f0d2d8', spread=0.6, rng=trng, col2='#ffffff', p2=0.4)
        else: pr.foliage(w, tips[trng.random(len(tips)) < 0.7], n_per=5, size=0.24, col='#a9c070', spread=0.5, rng=trng)
    for i in range(10):
        with w.at((trng.uniform(-80, 60), 0, trng.choice([-14, -48]) + trng.uniform(5, 8)), yaw=trng.uniform(-0.1, 0.1)): pr.shed_row(w, n=int(trng.integers(5, 12)), rng=trng)
    # far: chimney, water tower, a tower block under construction with its crane
    w.tube((-120, 0, -330), (-120, 96, -330), 3.6, 1.9, sides=12, mat='brick', col='#7c5448')
    w.tube((-60, 0, -210), (-60, 30, -210), 1.7, 1.3, sides=10, mat='brick', col='#7c5448'); w.tube((-60, 30, -210), (-60, 36, -210), 3.6, 3.6, sides=12, mat='plaster', col='#9a978f', caps=True)
    bx, bz = 86.0, -300.0
    for f in range(26):
        w.box((bx, f * 3.3 + 3.2, bz), (34, 0.3, 26), mat='concrete', col='#8a8880')
        xs = np.array([-16, -8, 0, 8, 16.0]); 
        for zz in (-12.5, 0, 12.5): w.box(np.stack([bx + xs, np.full(5, f * 3.3 + 1.6), np.full(5, bz + zz)], 1), (0.7, 3.2, 0.7), mat='concrete', col='#8a8880')
        if f < 15: w.box((bx, f * 3.3 + 1.6, bz), (33.6, 3.0, 25.6), mat='brick', col='#8f6a5a', faces='xXzZ')
    top, tip = crane(w, (bx + 22, 0, bz + 16), h=98.0, yaw=0.5)
    for p in (top, tip):
        w.sphere(p + np.array([0, 0.5, 0]), 0.6, n=6, mat='emit', col='#ff2a18', prm=(6.0, 0, 0, 0), grp=G_RED, mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=pr.TAG_NOSNOW)
    w.red_px = [top, tip, np.array([-120, 97.0, -330])]
    w.light('sun', np.array([1.0, 0.62, 0.40]) * 0.55, dir=SUN, soft=0.02)
    return w

def camera():
    return Camera((-1.2, RY + 2.4, 1.9), (6.0, 23.0, -45.0), fov=58.0)

RENDER = dict(K=K, fog=FOG, bounce_range=120.0, skyamb=1.0, amb_sky=amb_sky)
GRADE = dict(exposure=1.25, contrast=1.1, sat=0.95, shoulder=1.0, lift=(0.04, 0.04, 0.05))
PAL = dict(k=96, chroma_w=4.0)
DENOISE = dict(sl=0.10)
CHIM = (-120, 97, -330)

def setup(plate, cam):
    c = dict(plate=plate, cam=cam)
    H, W = plate['sky'].shape
    c['sky'] = fx.native_sky(sys.modules[__name__], cam, H, W) * plate['sky'][..., None]
    yy, xx = np.mgrid[0:H, 0:W]
    dirs = cam.dirs(xx.ravel() + 0.5, yy.ravel() + 0.5).astype(np.float32)
    c['fogc'] = fogcol(dirs).reshape(H, W, 3)
    c['far'] = np.clip(1 - plate['T'], 0, 1) * (1 - plate['sky']) + plate['sky'] * 0.6
    c['flock'] = fx.Flock(cam, plate, (10.0, 30.0, -55.0), rx=42.0, rz=26.0, n=24, T=T, seed=5, tilt=7.0)
    c['flock2'] = fx.Flock(cam, plate, (-70.0, 34.0, -150.0), rx=50.0, rz=30.0, n=16, T=T, seed=6, tilt=6.0)
    c['smoke'] = fx.Smoke(cam, plate, CHIM, n=14, T=T, loops=1, rise=1.4, wind=(2.2, 0, 0.6), r0=2.6, grow=1.6, seed=9, alpha=0.5)
    c['fol'] = np.clip(plate.get('tag1', np.zeros((H, W), np.float32)) * 2.5, 0, 1) * (plate['P'][..., 2] > -75)
    c['red'] = cam.project(np.array([[108.0 + 0, 107.5, -284.0]]))
    c['xx'], c['yy'] = xx, yy
    return c

def frame(c, ph):
    P = c['plate']; L = P['layers']
    blink = fx.pulse(ph, 0.05, 0.16, 0.03) + fx.pulse(ph, 0.55, 0.66, 0.03)
    lin = c['sky'] + L[0] + L[G_RED] * blink
    c['smoke'].draw(lin, ph, np.array([0.34, 0.33, 0.36], np.float32))
    # slow banks of mist drifting through the far layers
    xx, yy = c['xx'], c['yy']
    a1 = fbm2(xx * 0.022 + 0.9 * ph, yy * 0.07, 11, 3); a2 = fbm2(xx * 0.022 + 0.9 * (ph - 1.0), yy * 0.07, 11, 3)
    mist = np.clip((a1 * (1 - ph) + a2 * ph - 0.42) * 2.2, 0, 1) * c['far'] * 0.55
    lin = lin * (1 - mist[..., None]) + c['fogc'] * mist[..., None]
    c['flock2'].draw(lin, ph, np.array([0.16, 0.16, 0.19]), np.array([0.42, 0.40, 0.42]), fog=0.004, fogcol=np.array([0.5, 0.5, 0.56]))
    c['flock'].draw(lin, ph, np.array([0.12, 0.12, 0.15]), np.array([0.62, 0.58, 0.56]), fog=0.004, fogcol=np.array([0.5, 0.5, 0.56]))
    lin = fx.sway(lin, c['fol'], ph, k=1)
    return fx.bloom(lin, thresh=0.95, sig=(1.5, 6.0), gain=(0.25, 0.22))
