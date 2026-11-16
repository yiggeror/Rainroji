"""秋 · 黄昏 —— 落叶的老街 (an old plane-tree street at dusk; sodium lamps inside the golden canopy, leaves falling)"""
import sys
import numpy as np
from engine.world import World, srgb, MASK_THIN, MASK_NOSHADOW, MASK_NOBOUNCE, _n
from engine.render import Camera
from engine import props as pr, mats, fx
from engine.mats import mat, sstep, mix
from engine.noise import fbm2, hash2
from engine.hooks import GroundMap
from engine.props import TAG_NOSNOW, TAG_WIRE

NAME = 'autumn'; T = 9.0; K = 4
G_LAMP, G_TV, G_KIOSK = 1, 2, 3
SODIUM = '#ffa040'; TUNG = '#ffb866'
HEI = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
TREE_X = 5.7

def _ramp(t, stops):
    xs = np.array([s[0] for s in stops]); cs = np.array([srgb(s[1]) * s[2] for s in stops])
    return np.stack([np.interp(t, xs, cs[:, i]) for i in range(3)], -1)

def sky(d):
    y = np.clip(d[:, 1], 0.0, 1.0); el = np.arcsin(y) / (np.pi / 2)
    az = np.arctan2(d[:, 0], -d[:, 2])
    c = _ramp(el, [(0.0, '#ffb48a', 0.72), (0.04, '#f79aa0', 0.60), (0.10, '#c88ac0', 0.46), (0.2, '#7f7cc4', 0.34), (0.4, '#4a5cae', 0.24), (1.0, '#243a84', 0.16)])
    k = (0.5 + 0.5 * np.cos(az)) ** 2
    c = c * (0.55 + 0.6 * k[:, None])
    cl = sstep(0.52, 0.75, fbm2(az * 2.6 + 4.0, el * 24.0, 7, 4)) * sstep(0.02, 0.06, el) * (1 - sstep(0.25, 0.5, el))
    lit = _ramp(el, [(0.0, '#ff8a70', 0.8), (0.15, '#e87a9a', 0.55), (0.4, '#8a6ab0', 0.3), (1.0, '#5a5a9a', 0.2)])
    return (c * (1 - 0.6 * cl[:, None]) + lit * (0.6 * cl * (0.4 + 0.6 * k))[:, None]).astype(np.float32)

FOG = dict(sigma=0.0030, h=40.0, color=lambda d: sky(np.stack([d[:, 0], np.maximum(d[:, 1], 0.03), d[:, 2]], 1)) * np.array([0.75, 0.72, 0.95], np.float32)[None])

def amb_sky(d):
    return sky(d) * np.array([0.7, 0.85, 1.4], np.float32)[None] + np.array([0.014, 0.022, 0.06], np.float32)[None]

def leaf_hook(sf, acc, rng):
    """fallen leaves on everything that faces up along the street"""
    up = sf['Ng'][:, 1]
    ii = np.nonzero((up > 0.4) & (sf['tag'] != TAG_NOSNOW) & (sf['tag'] != TAG_WIRE) & (sf['tag'] != pr.TAG_FOLIAGE))[0]
    if not len(ii): return
    P = sf['P'][ii]; x, z, y = P[:, 0], P[:, 2], P[:, 1]
    dn = (0.30 + 0.62 * np.exp(-((np.abs(x) - 5.0) / 2.4) ** 2)) * (np.abs(x) < 13) * (y < 4.5)
    dn = dn * (1 - 0.45 * np.exp(-((np.abs(x) - 1.9) / 0.7) ** 2))                    # wheel tracks swept clearer
    n1 = fbm2(x * 0.7, z * 0.7, 401, 3); n2 = hash2(x * 14.0, z * 14.0, 402); n3 = hash2(x * 14.0, z * 14.0, 403)
    cover = np.clip(dn * (0.35 + 1.1 * n1), 0, 1) * (n2 > 0.28)
    pal = np.stack([srgb('#d9a23a'), srgb('#c2852e'), srgb('#9a6226'), srgb('#e2b84a'), srgb('#8a5a2a')])
    tint = pal[(n3 * 5).astype(np.int64) % 5]
    sf['alb'][ii] = sf['alb'][ii] * (1 - cover[:, None]) + tint * cover[:, None]
    sf['refl'][ii] *= (1 - cover)

def plane_tree(w, x, z, rng, lod):
    h = rng.uniform(11.5, 13.5)
    tips, n = pr.tree(w, (x, 0.15, z), h, 'plane', rng, col='#8a8474', trunk_r=0.3, detail=1.1 if lod == 0 else 0.85)
    tips = tips[tips[:, 1] > 5.4]
    kw = [dict(n_per=64, size=0.11, spread=0.8), dict(n_per=26, size=0.2, spread=0.9), dict(n_per=12, size=0.32, spread=1.0)][lod]
    pr.foliage(w, tips, col='#e8b240', col2='#c9822c', p2=0.34, rng=rng, droop=0.35, glow=0.035, **kw)
    pr.foliage(w, tips[rng.random(len(tips)) < 0.25], col='#a9a242', rng=rng, droop=0.3, **dict(kw, n_per=max(3, kw['n_per'] // 5)))

def kiosk(w, grp=0):
    """news kiosk, front faces +z"""
    w.box((0, 1.25, 0), (2.6, 2.5, 2.0), mat='metal', col='#3f6a56', prm=(0.5, 0, 0, 0), faces='xXz')
    w.box((0, 2.6, 0.25), (3.2, 0.14, 3.0), mat='metal', col='#35584a', prm=(0.5, 0.25, 0, 0))
    w.quads((-1.3, 0, 1.0), (1.3, 0, 1.0), (1.3, 0.95, 1.0), (-1.3, 0.95, 1.0), mat='metal', col='#3f6a56', prm=(0.5, 0, 0, 0))
    w.quads((-1.2, 0.95, 0.9), (1.2, 0.95, 0.9), (1.2, 2.2, 0.9), (-1.2, 2.2, 0.9), mat='shelf', prm=(0.16, 0.26, 1.1, 0), seed=0.4, grp=grp, tag=TAG_NOSNOW)
    w.box((0, 0.98, 1.2), (2.7, 0.06, 0.5), mat='wood', col='#6a5a44')
    for sx in (-1.75, 1.75):                                            # magazine racks either side
        w.quads((sx - 0.4, 0.3, 1.05), (sx + 0.4, 0.3, 1.05), (sx + 0.4, 1.9, 0.85), (sx - 0.4, 1.9, 0.85), mat='shelf', prm=(0.2, 0.3, 0.25, 0), seed=0.6 + sx * 0.1, grp=grp, tag=TAG_NOSNOW)
    tid, asp = pr.text_tex(w, '报刊亭', font=HEI, size=64, fg='#e8e2cc', bg='#a8322a', pad=0.2, spacing=0.3)
    w.quads((-1.2, 2.25, 1.02), (1.2, 2.25, 1.02), (1.2, 2.58, 1.02), (-1.2, 2.58, 1.02), mat='tex', prm=(tid, 2.4, 0.33, 0.25), grp=grp, tag=TAG_NOSNOW)
    w.light('point', np.asarray(srgb(TUNG)) * 4.5, pos=(0, 1.9, 1.5), radius=0.25, grp=grp, range=18.0, r0=0.6, vol=0.004)

def bus_stop(w):
    for x in (-2.2, 2.2): w.tube((x, 0, -0.4), (x, 2.5, -0.4), 0.05, sides=5, mat='plain', col='#5a6066')
    w.box((0, 2.55, 0.1), (5.0, 0.08, 1.5), mat='metal', col='#4a5a66', prm=(0.5, 0, 0, 0))
    w.box((0, 1.3, -0.45), (2.2, 1.5, 0.12), mat='plain', col='#2a2e32')
    w.quads((-1.05, 0.6, -0.38), (1.05, 0.6, -0.38), (1.05, 2.0, -0.38), (-1.05, 2.0, -0.38), mat='shelf', prm=(0.5, 0.7, 0.4, 0), seed=0.2, tag=TAG_NOSNOW)
    w.light('point', np.asarray(srgb('#dfe8f0')) * 0.8, pos=(0, 1.3, 0.2), radius=0.3, range=12.0, r0=0.5)
    w.box((0, 0.45, 0.1), (2.6, 0.06, 0.4), mat='wood', col='#5a5046')
    w.tube((3.2, 0, 0.3), (3.2, 2.9, 0.3), 0.04, sides=5, mat='plain', col='#8a8e90'); w.tube((3.2, 2.7, 0.27), (3.2, 2.7, 0.33), 0.3, sides=12, mat='plain', col='#2f5fa8', caps=True)

def build():
    w = World(seed=61); rng = np.random.default_rng(63)
    # ---------------------------------------------------------------- road and pavements
    gm = GroundMap(-30, -200, 30, 60, res=8)
    for z in np.arange(-190, 50, 7.0): gm.line([(0, z), (0, z + 3.0)], 0.14, 1.0)
    for x in (-3.4, 3.4): gm.line([(x, -200), (x, 60)], 0.1, 0.7)
    for x in np.arange(-4.0, 4.1, 1.0): gm.line([(x, 8.0), (x, 11.0)], 0.5, 1.0)          # zebra crossing
    gm.done(blur=0.03)
    @mat('avenue')
    def avenue(S):
        r = mats.MATS['asphalt'](S)
        m = gm.sample(S.P[:, 0], S.P[:, 2]) * (0.3 + 0.7 * fbm2(S.P[:, 0] * 3, S.P[:, 2] * 3, 77, 3))
        r['alb'] = mix(r['alb'], srgb('#b8b4a0')[None] * 0.8, m * 0.7)
        return r
    w.quads((-400, 0, 200), (400, 0, 200), (400, 0, -600), (-400, 0, -600), mat='avenue', col='#4a4a50', prm=(0, 0, 0, 0), tag=pr.TAG_GROUND)
    for sx in (-1, 1):
        w.box((sx * 8.0, 0.075, -70), (6.4, 0.15, 400), mat='pave', col='#807c74', prm=(0.5, 0, 0, 0), faces='xXY')
    # ---------------------------------------------------------------- the two rows of plane trees
    trng = np.random.default_rng(42)
    zs = np.arange(14.0, -190.0, -8.6)
    for i, z in enumerate(zs):
        lod = 0 if i < 4 else (1 if i < 11 else 2)
        for sx in (-1, 1):
            if (sx, i) in ((1, 0),): continue                                    # a gap in the row, as old streets have
            plane_tree(w, sx * TREE_X + trng.normal(0, 0.25), z + trng.normal(0, 0.6) + (2.6 if sx > 0 else 0), trng, lod)
            w.box((sx * TREE_X, 0.2, z + (2.6 if sx > 0 else 0)), (1.3, 0.12, 1.3), mat='brick', col='#7c5448')          # tree pit kerb
    # ---------------------------------------------------------------- street lamps inside the canopy
    for i, z in enumerate(np.arange(4.0, -190.0, -26.0)):
        sx = -1 if i % 2 == 0 else 1
        g = G_LAMP if i == 1 else 0
        pr.pole(w, (sx * 4.9, 0.15, z), h=8.6, arms=1, col='#77736a', lamp=dict(dir=(-sx, 0.0), color=SODIUM, grp=g, power=20.0, h=7.3, arm=2.6, vol=0.006, cone=(-0.35, 0.6), range=60.0))
    prev = None
    for z in np.arange(10.0, -190.0, -34.0):
        pts, _ = pr.pole(w, (7.4, 0.15, z), h=9.2, arms=2, col='#6a655c')
        if prev:
            for a, b in zip(prev, pts): pr.wire(w, a, b, sag=0.9)
        prev = pts
    # ---------------------------------------------------------------- buildings behind the trees
    def lit_a(side, u, b, f):
        if side == 'front' and (u, b, f) == (0, 1, 1): return (0.9, '#9fb4d8', G_TV)
        return None
    for i, (z, st, fl) in enumerate(((-6, 'brick', 5), (-56, 'plaster', 6), (-108, 'brick2', 5), (-160, 'yellow', 6))):
        with w.at((-17.8, 0, z), yaw=np.pi / 2):
            pr.apt_block(w, units=3, floors=fl, style=st, rng=np.random.default_rng(70 + i), lit=0.2, cages=0.2, ac=0.08, details=(i < 2), grp_fn=lit_a if i == 0 else None, lit_gain=1.2)
    for i, (z, st, fl) in enumerate(((-20, 'tile', 6), (-72, 'brick', 5), (-124, 'plaster', 6), (-176, 'brick2', 5))):
        with w.at((17.8, 0, z), yaw=-np.pi / 2):
            pr.apt_block(w, units=3, floors=fl, style=st, rng=np.random.default_rng(80 + i), lit=0.2, cages=0.2, ac=0.1, details=(i < 2), lit_gain=1.2)
    hr = np.random.default_rng(91)
    for (x, z, yw, Wd) in ((-13.2, 14.0, np.pi / 2, 9.0), (13.2, 9.0, -np.pi / 2, 10.0), (-13.4, -31.5, np.pi / 2, 8.0), (13.4, -46.0, -np.pi / 2, 9.0), (-13.4, -82.0, np.pi / 2, 9.0), (13.4, -98.0, -np.pi / 2, 9.0)):
        with w.at((x, 0, z), yaw=yw): pr.house(w, Wd=Wd, Dp=4.6, H=3.1, rng=hr, lit=0.85, wallc='#8f8a80', mat='plaster', roof='#55524e')
    for sx in (-1, 1):                                                         # garden walls between the blocks
        w.box((sx * 11.4, 1.05, -120), (0.25, 2.1, 190), mat='brick', col='#7c5448')
    # ---------------------------------------------------------------- pavement life
    with w.at((-9.4, 0.15, -3.5), yaw=np.pi / 2 - 0.05): kiosk(w, grp=G_KIOSK)
    with w.at((9.3, 0.15, -17.0), yaw=-np.pi / 2): bus_stop(w)
    crng = np.random.default_rng(55)
    for (x, z, n) in ((-8.6, 5.0, 7), (-8.8, -15.0, 9), (8.7, -3.0, 6), (8.9, -30.0, 8), (-8.7, -44.0, 7), (8.8, -58.0, 6)):
        with w.at((x, 0.15, z), yaw=0.0 if x < 0 else np.pi): pr.bike_row(w, n, rng=crng)
    for (x, z, yw, kind, col) in ((-3.3, -8.0, np.pi / 2, 'sedan', '#7a2a26'), (3.3, -26.0, -np.pi / 2, 'van', '#b9bcc0'), (-3.35, -50.0, np.pi / 2, 'jeep', '#3a4a3a'), (3.3, -70.0, -np.pi / 2, 'sedan', '#2a3a4a'),
                              (-3.3, -92.0, np.pi / 2, 'van', '#c9c6b8')):
        with w.at((x, 0, z), yaw=yw): pr.car(w, kind, col)
    for (x, z, yw) in ((-7.0, -22.0, 1.4), (7.2, 1.0, -1.5), (7.0, -40.0, 1.6)):
        with w.at((x, 0.15, z), yaw=yw): pr.trike(w)
    w.box((7.1, 0.6, -9.0), (0.5, 0.9, 0.5), mat='metal', col='#3f5a48', prm=(0.6, 0, 0, 0))
    w.box((-7.3, 1.25, -27.0), (0.9, 2.2, 0.9), mat='metal', col='#c9a23a', prm=(0.4, 0, 0, 0))                       # phone booth
    for (x, z) in ((-10.0, 9.0), (10.2, -9.5), (-10.1, -36.0)):
        with w.at((x, 0.15, z)): pr.bench(w)
    with w.at((-11.25, 0, -22.0), yaw=np.pi / 2): pr.wall_text(w, '发展体育运动增强人民体质', -9.0, 1.9, size=1.0, vertical=False, wear=0.5, z=0.14, wallcol='#cfcab8')
    # far end of the street: a cross street, a tall block with a red light
    with w.at((0, 0, -236), yaw=0.0): pr.apt_block(w, units=5, floors=9, style='tile', rng=np.random.default_rng(99), lit=0.2, details=False, lit_gain=1.5)
    return w

def camera():
    return Camera((0.9, 5.0, 34.0), (-0.2, 4.3, -60.0), fov=52.0)

RENDER = dict(K=K, fog=FOG, hook=leaf_hook, bounce_range=70.0, skyamb=1.0, amb_sky=amb_sky, emis_clamp=0.6)
GRADE = dict(exposure=2.9, contrast=1.2, sat=1.18, shoulder=1.0, lift=(0.022, 0.02, 0.045), tint_sh=(0.0, -0.004, 0.03))
PAL = dict(k=96, chroma_w=4.5)
DENOISE = dict(sl=0.10)

def setup(plate, cam):
    c = dict(plate=plate, cam=cam)
    H, W = plate['sky'].shape
    c['sky'] = fx.native_sky(sys.modules[__name__], cam, H, W) * plate['sky'][..., None]
    lamps = [L for L in plate['lights'] if L['kind'] == 'point' and 'axis' in L]
    c['lamps'] = sorted(lamps, key=lambda L: np.linalg.norm(L['pos'] - cam.pos))[:6]
    rng = np.random.default_rng(8)
    pal = np.array([[1.0, 0.72, 0.22], [0.9, 0.52, 0.16], [0.68, 0.40, 0.14], [1.05, 0.85, 0.32]], np.float32)
    def leaves(**k):
        p = fx.Particles(cam, plate, T=T, vjit=0.35, **k); p.tint = pal[rng.integers(0, 4, p.n)]; return p
    c['lv'] = [leaves(n=3600, seed=1, near=26, far=130, vel=(0.5, -0.8, 0.2), size=0.11, dpow=1.0, sway=0.7),
               leaves(n=900, seed=2, near=9, far=30, vel=(0.6, -0.9, 0.25), size=0.085, dpow=0.6, sway=0.6),
               leaves(n=50, seed=3, near=3, far=10, vel=(0.7, -1.0, 0.3), size=0.06, dpow=0.5, sway=0.4)]
    c['fol'] = np.clip(plate.get('tag1', np.zeros((H, W), np.float32)) * 2.0, 0, 1)
    c['lamp_px'] = cam.project(np.array([L['pos'] for L in c['lamps']]) + np.array([[0, 0.15, 0]]))
    c['amb'] = np.array([0.20, 0.17, 0.2], np.float32)
    return c

def gains(ph):
    g = np.ones(K, np.float32)
    g[G_LAMP] = 1.0 + 0.06 * (fx.loopnoise(ph, 24, 3) - 0.5) - 0.3 * fx.pulse(ph, 0.615, 0.632, 0.005) - 0.2 * fx.pulse(ph, 0.65, 0.657, 0.003)
    g[G_KIOSK] = 1.0 + 0.03 * (fx.stepnoise(ph, 80, 7) - 0.5)
    return g

def frame(c, ph):
    L = c['plate']['layers']; g = gains(ph)
    lin = c['sky'] + L[0] + g[G_LAMP] * L[G_LAMP] + g[G_KIOSK] * L[G_KIOSK]
    tv = 0.45 + 0.9 * fx.stepnoise(ph, 36, 11) * (0.6 + 0.4 * fx.stepnoise(ph, 9, 12))
    lin += L[G_TV] * (tv * np.array([0.9, 1.0, 1.2]))[None, None]
    lin = fx.sway(lin, c['fol'], ph, k=1)
    ll = [(Lm['pos'], Lm['color'] * (g[G_LAMP] if Lm['grp'] == G_LAMP else 1.0) * 0.4, 0.9, Lm['axis'], Lm['cone']) for Lm in c['lamps']]
    c['lv'][0].draw(lin, ph, c['amb'], ll, alpha=0.7)
    c['lv'][1].draw(lin, ph, c['amb'], ll, alpha=0.9)
    c['lv'][2].draw(lin, ph, c['amb'] * 1.1, ll, alpha=0.95)
    x, y, _, _ = c['lamp_px']
    for i, Lm in enumerate(c['lamps']):
        fx.glow(lin, x[i], y[i], Lm['color'] * 0.012 * (g[G_LAMP] if Lm['grp'] == G_LAMP else 1.0), r0=2.4, power=1.3)
    return fx.bloom(lin, thresh=0.5, sig=(1.2, 4.5), gain=(0.28, 0.2))
