"""春 · 蓝调时刻 —— 落花的巷子 (an old lane at blue hour; a great blossom tree over a warm lamp, petals falling)"""
import sys
import numpy as np
from engine.world import World, srgb, MASK_THIN, MASK_NOSHADOW, MASK_NOBOUNCE, _n
from engine.render import Camera
from engine import props as pr, mats, fx
from engine.mats import mat, sstep, mix
from engine.noise import fbm2, hash2
from engine.hooks import GroundMap
from engine.props import TAG_NOSNOW, TAG_WIRE

NAME = 'spring'; T = 9.0; K = 3
G_LAMP, G_TV = 1, 2
TUNG = '#ffb060'
MOON = _n(np.array([-0.52, 0.30, -0.80]))
# blossom trees: (x, z, height, petal radius)
BLOSSOM = [(5.0, 7.5, 10.0, 9.0), (-15.5, -13.0, 8.0, 6.0), (10.5, -19.0, 8.5, 6.5), (-5.5, -33.0, 8.0, 6.0), (15.0, -41.0, 9.0, 6.5), (-17.0, -52.0, 8.5, 6.0),
           (5.0, -62.0, 8.0, 6.0), (24.0, -8.0, 8.0, 6.0), (27.0, -58.0, 9.0, 6.0), (-30.0, -34.0, 8.0, 6.0), (-34.0, -70.0, 9.0, 6.0), (40.0, -34.0, 9.0, 6.0)]

def _ramp(t, stops):
    xs = np.array([s[0] for s in stops]); cs = np.array([srgb(s[1]) * s[2] for s in stops])
    return np.stack([np.interp(t, xs, cs[:, i]) for i in range(3)], -1)

def sky(d):
    y = np.clip(d[:, 1], 0.0, 1.0); el = np.arcsin(y) / (np.pi / 2)
    az = np.arctan2(d[:, 0], -d[:, 2])
    c = _ramp(el, [(0.0, '#d9a0c0', 0.40), (0.05, '#b890c4', 0.34), (0.12, '#7f84c4', 0.27), (0.25, '#4a62b0', 0.20), (0.5, '#2c4294', 0.14), (1.0, '#1c2c70', 0.10)])
    k = (0.5 + 0.5 * np.cos(az + 0.5)) ** 2
    c = c * (0.8 + 0.5 * k[:, None]) + (k * np.exp(-el * 9))[:, None] * np.array([0.16, 0.06, 0.07], np.float32)[None]
    cl = sstep(0.55, 0.78, fbm2(az * 2.4 + 1.0, el * 22.0, 7, 4)) * sstep(0.02, 0.07, el) * (1 - sstep(0.25, 0.5, el))
    c = c * (1 - 0.5 * cl[:, None]) + cl[:, None] * 0.5 * _ramp(el, [(0.0, '#e8a0b8', 0.42), (0.3, '#8a80b8', 0.24), (1.0, '#5a5a9a', 0.15)])
    cm = d @ MOON.astype(np.float32)
    off = _n(MOON + np.array([0.010, 0.004, 0.0]))
    disc = sstep(0.99992, 0.99995, cm) * (1 - sstep(0.99990, 0.99994, d @ off.astype(np.float32)))
    return (c + disc[:, None] * np.array([1.5, 1.45, 1.3], np.float32)[None]).astype(np.float32)

FOG = dict(sigma=0.0050, h=30.0, color=lambda d: sky(np.stack([d[:, 0], np.maximum(d[:, 1], 0.03), d[:, 2]], 1)) * np.array([0.78, 0.86, 1.05], np.float32)[None])

def amb_sky(d):
    return sky(d) * np.array([1.0, 1.15, 1.5], np.float32)[None] + np.array([0.010, 0.016, 0.04], np.float32)[None]

def petal_density(x, z):
    dn = np.zeros_like(x)
    for (tx, tz, h, r) in BLOSSOM:
        dn = np.maximum(dn, np.exp(-((x - tx) ** 2 + (z - tz) ** 2) / (2 * (r * 0.6) ** 2)))
    return dn

def petal_hook(sf, acc, rng):
    """fallen petals gather on everything that faces up near a blossom tree"""
    up = sf['Ng'][:, 1]
    ii = np.nonzero((up > 0.4) & (sf['tag'] != TAG_NOSNOW) & (sf['tag'] != TAG_WIRE) & (sf['tag'] != pr.TAG_FOLIAGE))[0]
    if not len(ii): return
    P = sf['P'][ii]
    dn = petal_density(P[:, 0], P[:, 2])
    n1 = fbm2(P[:, 0] * 0.9, P[:, 2] * 0.9, 401, 3); n2 = hash2(P[:, 0] * 22.0, P[:, 2] * 22.0, 402)
    cover = np.clip(dn * 1.25 * (0.45 + 0.9 * n1), 0, 1) * (0.55 + 0.45 * (n2 > 0.35))
    cover = np.clip(cover + 0.10 * (n2 > 0.93) * (dn > 0.02), 0, 0.92)
    tint = np.where((n2 > 0.7)[:, None], srgb('#fbdfe8')[None], srgb('#f2a4bd')[None])
    sf['alb'][ii] = sf['alb'][ii] * (1 - cover[:, None]) + tint * cover[:, None]

def blossom_tree(w, x, z, h, rng, near=False):
    tips, n = pr.tree(w, (x, 0, z), h, 'plane', rng, col='#3a2f2c', trunk_r=h * 0.03, detail=1.15 if near else 0.9)
    if near: pr.foliage(w, tips, n_per=150, size=0.085, col='#ffb4cb', spread=0.7, rng=rng, col2='#ffe6ee', p2=0.42, droop=0.25, glow=0.10)
    else: pr.foliage(w, tips, n_per=36, size=0.2, col='#ffb0c8', spread=0.75, rng=rng, col2='#ffe2eb', p2=0.4, droop=0.25, glow=0.085)

def gate(w):
    """courtyard gate in a wall along local x: two leaves, a little tiled roof, couplets"""
    for sx in (-1.15, 1.15): w.box((sx, 1.3, 0), (0.45, 2.6, 0.45), mat='brick', col='#8a5648')
    w.box((0, 1.1, -0.05), (1.85, 2.2, 0.08), mat='wood', col='#5a2f2a', prm=(0.6, 0.9, 0, 0))
    prof = [(-0.9, 2.6), (0.9, 2.6), (0, 3.15)]
    with w.at((0, 0, 0), yaw=np.pi / 2): w.extrude(prof, -1.6, 1.6, mat='metal', col='#55524e', prm=(0.3, 0.3, 0, 0), capkw=dict(mat='brick', col='#8a5648'))
    pr.couplet(w, 0, 0, 1.85, 2.2, z=0.25)
    pr.lantern(w, (-0.9, 2.35, 0.55), r=0.17, glow=1.4); pr.lantern(w, (0.9, 2.35, 0.55), r=0.17, glow=1.4)

def build():
    w = World(seed=41); rng = np.random.default_rng(43)
    # ---------------------------------------------------------------- ground
    gm = GroundMap(-70, -110, 70, 50, res=8)
    lane = [(0.0, 50), (0.0, 10), (-0.4, -20), (0.3, -45), (0.0, -110)]
    gm.line(lane, 3.6, 1.0)
    gm.line([(0, -8), (-30, -9), (-70, -10)], 3.0, 1.0); gm.line([(0, -46), (40, -47), (70, -48)], 3.0, 1.0); gm.line([(2, 14), (8, 13.5), (11, 9)], 1.4, 0.9)
    gm.done(blur=0.2)
    @mat('yardgnd')
    def yardgnd(S):
        x, z = S.P[:, 0], S.P[:, 2]
        n1 = fbm2(x * 0.3, z * 0.3, 3, 4); n2 = fbm2(x * 9, z * 9, 9, 2); n3 = fbm2(x * 0.9, z * 0.9, 23, 4)
        f9 = mats.fade(S, 9)
        dirt = srgb('#6a6052')[None] * (0.7 + 0.45 * n1 + 0.2 * (n2 - 0.5) * f9)[:, None]
        grass = srgb('#4f6a40')[None] * (0.6 + 0.6 * n2 * f9 + 0.3 * n1)[:, None]
        alb = mix(dirt, grass, sstep(0.52, 0.66, n3) * 0.8)
        p = gm.sample(x, z)
        conc = srgb('#7f7a70')[None] * (0.75 + 0.3 * n1 + 0.14 * (n2 - 0.5) * f9)[:, None]
        crack = np.abs(fbm2(x * 0.8, z * 0.8, 71, 4) - 0.5) < 0.012
        conc = conc * (1 - 0.35 * crack * f9)[:, None]
        return np.clip(mix(alb, conc, sstep(0.35, 0.6, p)), 0, 1)
    w.quads((-400, 0, 200), (400, 0, 200), (400, 0, -500), (-400, 0, -500), mat='yardgnd', tag=pr.TAG_GROUND)
    # ---------------------------------------------------------------- left: a three-storey brick block along the lane
    def lit_left(side, u, b, f):
        if side == 'front' and (u, b, f) == (1, 1, 1): return (1.2, '#ffc070', 0)
        if side == 'front' and (u, b, f) == (0, 2, 2): return (0.9, '#9fb4d8', G_TV)
        if side == 'front' and (u, b, f) == (0, 1, 0): return (1.0, '#ffd08a', 0)
        if side == 'balc' and (u, b, f) == (1, 3, 2): return (0.9, '#f5c98a', 0)
        if side == 'front' and (u, b, f) == (1, 2, 0): return (0.8, '#ffb98a', 0)
        return (0.0, '#ffc070', 0)
    with w.at((-8.6, 0, -4.5), yaw=np.pi / 2):
        pr.apt_block(w, units=2, floors=3, style='brick', rng=np.random.default_rng(3), grp_fn=lit_left, cages=0.2, ac=0.03, couplets=True)
    with w.at((-9.2, 0, -32.0), yaw=np.pi / 2 + 0.03):
        pr.apt_block(w, units=1, floors=2, style='brick2', rng=np.random.default_rng(4), lit=0.2, cages=0.2)
    # ---------------------------------------------------------------- right: courtyard wall with a gate, houses with pitched roofs
    for (za, zb) in ((34.0, 15.8), (12.2, -6.0)):
        w.box((2.15, 1.1, (za + zb) / 2), (0.28, 2.2, abs(za - zb)), mat='brick', col='#84584a'); w.box((2.15, 2.26, (za + zb) / 2), (0.46, 0.12, abs(za - zb)), mat='metal', col='#55524e', prm=(0.3, 0.3, 0, 0))
    with w.at((2.15, 0, 14.0), yaw=-np.pi / 2): gate(w)
    hr = np.random.default_rng(91); chim = []
    def hs(x, z, yaw, Wd, lit=0.35, **kw):
        with w.at((x, 0, z), yaw=yaw):
            c = pr.house(w, Wd=Wd, Dp=hr.uniform(5, 6.2), H=hr.uniform(2.8, 3.2), rng=hr, lit=lit, roof=['#55555a', '#5f4a44', '#4f4c4a'][hr.integers(3)],
                         wallc=['#8a5648', '#93604e', '#7c5448'][hr.integers(3)], **kw)
            chim.append(c)
    hs(12.5, 3.0, -np.pi / 2, 12.0, lit=0.6); hs(-8.6, 17.5, np.pi / 2, 11.0, lit=0.5); hs(-9.0, 30.0, np.pi / 2, 10.0, lit=0.3); hs(13.5, 19.5, -np.pi / 2, 10.0, lit=0.4)
    for (x, z, yw, Wd) in ((7.5, -13.0, 0.0, 10.5), (9.0, -27.0, 0.02, 12.0), (7.0, -39.0, -0.03, 9.5), (20.5, -14.0, 0.0, 11.0), (22.5, -27.5, 0.0, 10.0), (19.5, -40.0, 0.03, 12.0),
                           (-9.5, -53.0, 0.0, 12.0), (-22.0, -40.5, 0.0, 10.5), (-23.0, -53.5, 0.0, 11.0), (8.0, -56.0, 0.0, 11.5), (21.0, -56.5, 0.0, 10.0),
                           (-24.0, -20.0, 0.0, 11.0), (-36.0, -20.5, 0.0, 9.5), (34.0, -15.0, 0.0, 10.0), (35.0, -41.0, 0.0, 11.0), (-36.5, -53.0, 0.0, 10.0), (34.5, -57.0, 0.0, 10.0),
                           (-8.0, -68.0, 0.0, 11.0), (8.0, -69.5, 0.0, 12.0), (-22.0, -68.0, 0.0, 10.0), (22.0, -70.0, 0.0, 11.0)):
        hs(x, z, yw, Wd)
        if hr.random() < 0.7:
            w.box((x, 0.9, z + 6.2), (Wd + 2.0, 1.8, 0.25), mat='brick', col='#7c5448')
    w.chim = [c for i, c in enumerate(chim) if i in (2, 5, 9, 13)]
    # far blocks, a chimney, a water tower
    for i, (p, yw, un, fl, stl) in enumerate([((-34, 0, -98), 0.05, 3, 5, 'brick'), ((14, 0, -104), -0.04, 4, 6, 'plaster'), ((62, 0, -92), 0.2, 3, 5, 'yellow'), ((-80, 0, -70), 0.4, 3, 6, 'brick2'),
                                              ((-10, 0, -150), 0.0, 5, 6, 'plaster'), ((70, 0, -150), 0.1, 4, 6, 'tile'), ((-90, 0, -140), 0.0, 4, 6, 'brick')]):
        with w.at(p, yaw=yw): pr.apt_block(w, units=un, floors=fl, style=stl, rng=np.random.default_rng(60 + i), lit=0.12, details=False, cages=0, roof_stuff=(i < 3), lit_gain=1.4)
    w.tube((40, 0, -130), (40, 46, -130), 2.0, 1.1, sides=10, mat='brick', col='#7c5448')
    w.tube((-52, 0, -112), (-52, 22, -112), 1.5, 1.2, sides=10, mat='brick', col='#7c5448'); w.tube((-52, 22, -112), (-52, 27, -112), 3.2, 3.2, sides=12, mat='plaster', col='#8f8c84', caps=True)
    # ---------------------------------------------------------------- the lamp under the tree, poles and wires
    pts, lamp = pr.pole(w, (1.75, 0, 10.6), h=7.4, arms=1, col='#6a5a48', lamp=dict(dir=(-1, 0.15), color=TUNG, grp=G_LAMP, power=30.0, h=5.3, arm=1.5, vol=0.014, cone=(-0.25, 0.7), range=45.0))
    pts2, _ = pr.pole(w, (1.8, 0, -22.0), h=7.4, arms=1, col='#6a5a48', lamp=dict(dir=(-1, 0.0), color=TUNG, power=9.0, h=5.2, arm=1.3, vol=0.008, range=30.0))
    pts3, _ = pr.pole(w, (-1.9, 0, -50.0), h=7.4, arms=1, col='#6a5a48', lamp=dict(dir=(1, 0.0), color=TUNG, power=8.0, h=5.2, arm=1.3, vol=0.008, range=30.0))
    for a, b in zip(pts, pts2): pr.wire(w, a, b, sag=0.8)
    for a, b in zip(pts2, pts3): pr.wire(w, a, b, sag=0.8)
    pr.wire(w, pts[0], (-3.3, 7.6, 7.0), sag=0.3); pr.wire(w, pts[2], (9.5, 4.0, 3.0), sag=0.4); pr.wire(w, pts2[1], (4.0, 3.6, -13.0), sag=0.3); pr.wire(w, pts2[2], (-5.0, 5.6, -24.0), sag=0.3)
    # ---------------------------------------------------------------- blossom
    trng = np.random.default_rng(42)
    for i, (x, z, h, r) in enumerate(BLOSSOM): blossom_tree(w, x, z, h, trng, near=(i == 0))
    for (x, z, h) in ((-16.0, 22.0, 9.0), (17.5, 13.0, 8.0), (-3.0, -60.0, 9.0), (28.0, -24.0, 8.5), (-28.0, -6.0, 9.0)):          # trees just coming into leaf
        tips, n = pr.tree(w, (x, 0, z), h, 'poplar', trng, col='#3a332e')
        pr.foliage(w, tips[trng.random(len(tips)) < 0.8], n_per=8, size=0.2, col='#8fae62', spread=0.5, rng=trng)
    # ---------------------------------------------------------------- lived-in clutter
    crng = np.random.default_rng(55)
    w.box((6.4, 0.38, 11.4), (0.9, 0.08, 0.9), mat='concrete', col='#8f8d86'); w.box((6.4, 0.18, 11.4), (0.3, 0.36, 0.3), mat='concrete', col='#84827a')            # stone table + stools
    for a in (0.3, 1.9, 3.5, 5.1): w.box((6.4 + 0.8 * np.cos(a), 0.14, 11.4 + 0.8 * np.sin(a)), (0.3, 0.28, 0.3), mat='concrete', col='#84827a')
    with w.at((2.9, 0, 18.5), yaw=0.0): pr.bike_row(w, 4, rng=crng)
    with w.at((-1.55, 0, 12.0), yaw=np.pi / 2 + 0.1): pr.bicycle(w, lean=-0.2)
    with w.at((-1.5, 0, -3.5), yaw=np.pi / 2 - 0.1): pr.bicycle(w, lean=-0.2)
    with w.at((1.5, 0, 2.0), yaw=np.pi / 2 + 0.1): pr.trike(w)
    with w.at((1.3, 0, -9.5)): pr.junk_pile(w, crng, r=0.6, n=5)
    with w.at((10.0, 0, 13.0), yaw=0.4): pr.drying_frame(w)
    for (x, z) in ((2.7, 5.0), (2.8, 9.0), (3.4, 21.0), (-1.6, 9.0), (-1.6, 9.7)):
        w.tube((x, 0, z), (x, 0.3, z), 0.14, 0.18, sides=7, mat='plain', col='#8a5a44', caps=True); w.sphere((x, 0.5, z), 0.24, n=6, mat='leaf', col='#5a7a48', tag=pr.TAG_FOLIAGE)
    pr.hedge(w, (11.0, 0, 20.0), (15.5, 0, 9.0), rng=crng, col='#34402c')
    w.light('point', np.asarray(srgb(TUNG)) * 2.2, pos=(1.2, 2.6, -34.0), radius=0.08, range=16.0, r0=0.4)
    w.light('point', np.asarray(srgb(TUNG)) * 3.0, pos=(8.6, 2.7, 6.2), radius=0.08, range=20.0, r0=0.4, vol=0.004)
    w.box((8.6, 2.85, 6.2), (0.08, 0.1, 0.08), mat='emit', col=TUNG, prm=(16.0, 0, 0, 0), mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=TAG_NOSNOW)
    w.box((1.2, 2.75, -34.0), (0.08, 0.1, 0.08), mat='emit', col=TUNG, prm=(16.0, 0, 0, 0), mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=TAG_NOSNOW)
    return w

def camera():
    return Camera((9.0, 10.5, 37.0), (-0.5, 3.2, 2.0), fov=52.0)

RENDER = dict(K=K, fog=FOG, hook=petal_hook, bounce_range=70.0, skyamb=1.0, amb_sky=amb_sky)
GRADE = dict(exposure=3.3, contrast=1.16, sat=1.12, shoulder=1.0, lift=(0.022, 0.022, 0.05), tint_sh=(0.0, -0.004, 0.03))
PAL = dict(k=96, chroma_w=5.0, extra=[(1.0, 0.80, 0.87), (0.98, 0.66, 0.78), (0.9, 0.55, 0.68)])
DENOISE = dict(sl=0.10)

def setup(plate, cam):
    c = dict(plate=plate, cam=cam)
    H, W = plate['sky'].shape
    c['sky'] = fx.native_sky(sys.modules[__name__], cam, H, W) * plate['sky'][..., None]
    c['lamps'] = [L for L in plate['lights'] if L['kind'] == 'point' and 'axis' in L]
    rng = np.random.default_rng(8)
    def petals(**k):
        p = fx.Particles(cam, plate, T=T, vjit=0.35, **k)
        p.tint = np.array([[1.0, 0.60, 0.74], [1.0, 0.78, 0.85], [0.98, 0.52, 0.68]], np.float32)[rng.integers(0, 3, p.n)]
        return p
    c['pet'] = [petals(n=3800, seed=1, near=24, far=110, vel=(0.30, -0.55, 0.10), size=0.075, dpow=1.0, sway=0.6),
                petals(n=1200, seed=2, near=8, far=30, vel=(0.38, -0.62, 0.12), size=0.055, dpow=0.6, sway=0.55),
                petals(n=110, seed=3, near=2, far=9, vel=(0.42, -0.7, 0.14), size=0.03, dpow=0.5, sway=0.3, loops=1)]
    # extra petals shed by the big tree itself
    n = 900; tx, tz, th, tr = BLOSSOM[0]
    a = rng.uniform(0, 6.28, n); r = tr * 0.62 * np.sqrt(rng.random(n))
    base = np.stack([tx + r * np.cos(a), rng.uniform(1.5, th * 0.75, n), tz + r * np.sin(a)], 1)
    c['shed'] = fx.custom_particles(cam, plate, base, (0.3, -0.6, 0.1), T, 1, 0.05, seed=5)
    c['shed'].vel = c['shed'].vel * rng.uniform(0.7, 1.3, (n, 1)); c['shed'].sw_a = rng.uniform(0.2, 0.6, n); c['shed'].sw_f = rng.integers(1, 4, n); c['shed'].sw_p = rng.random(n) * 6.28
    c['shed'].tint = np.array([[1.0, 0.60, 0.74], [1.0, 0.78, 0.85]], np.float32)[rng.integers(0, 2, n)]
    c['smoke'] = [fx.Smoke(cam, plate, p, n=7, T=T, loops=1, rise=0.8, wind=(0.3, 0, 0.08), r0=0.3, grow=0.45, seed=20 + i, alpha=0.4) for i, p in enumerate(plate.get('chim', []))]
    c['fol'] = np.clip(plate.get('tag1', np.zeros((H, W), np.float32)) * 2.0, 0, 1)
    c['lamp_px'] = cam.project(np.array([L['pos'] for L in c['lamps']]) + np.array([[0, 0.15, 0]]))
    amb = sky(np.array([[0.2, 0.8, 0.1], [-0.4, 0.5, 0.3], [0.1, 0.3, -0.8]], np.float32)).mean(0)
    c['amb'] = np.array([0.34, 0.20, 0.25], np.float32)
    return c

def gains(ph):
    g = np.ones(K, np.float32)
    g[G_LAMP] = 1.0 + 0.05 * (fx.loopnoise(ph, 24, 3) - 0.5) - 0.2 * fx.pulse(ph, 0.415, 0.432, 0.006)
    return g

def frame(c, ph):
    L = c['plate']['layers']; g = gains(ph)
    lin = c['sky'] + L[0] + g[G_LAMP] * L[G_LAMP]
    tv = 0.45 + 0.9 * fx.stepnoise(ph, 36, 11) * (0.6 + 0.4 * fx.stepnoise(ph, 9, 12))
    tint = np.array([0.8, 0.95, 1.25]) * (1 - fx.stepnoise(ph, 13, 14) * 0.5) + np.array([1.2, 1.0, 0.7]) * fx.stepnoise(ph, 13, 14) * 0.5
    lin += L[G_TV] * (tv * tint)[None, None]
    for s in c['smoke']: s.draw(lin, ph, c['amb'] * 0.4)
    lin = fx.sway(lin, c['fol'], ph, k=1)
    ll = [(Lm['pos'], Lm['color'] * (g[G_LAMP] if Lm['grp'] == G_LAMP else 1.0) * 0.45, 0.8, Lm['axis'], Lm['cone']) for Lm in c['lamps']]
    c['pet'][0].draw(lin, ph, c['amb'], ll, alpha=0.5)
    c['pet'][1].draw(lin, ph, c['amb'], ll, alpha=0.8)
    c['shed'].draw(lin, ph, c['amb'], ll, alpha=0.85)
    c['pet'][2].draw(lin, ph, c['amb'] * 1.1, ll, alpha=0.9)
    x, y, _, _ = c['lamp_px']
    for i, Lm in enumerate(c['lamps']):
        fx.glow(lin, x[i], y[i], Lm['color'] * 0.010 * (g[G_LAMP] if Lm['grp'] == G_LAMP else 1.0), r0=2.4, power=1.3)
    return fx.bloom(lin, thresh=0.5, sig=(1.2, 4.5), gain=(0.28, 0.2))
