"""夏 · 夜雨 —— 雨夜的街 (a wet street at night seen from a third-floor balcony; shop lights, neon, sodium lamps)"""
import sys
import numpy as np
from engine.world import World, srgb, MASK_THIN, MASK_NOSHADOW, MASK_NOBOUNCE
from engine.render import Camera
from engine import props as pr, mats, fx
from engine.mats import mat, sstep, mix
from engine.noise import fbm2, hash2
from engine.hooks import wet_hook, GroundMap

NAME = 'rain'; T = 9.0; K = 9
G_FLUO, G_NEON, G_TV, G_POLE, G_BULB, G_SIGN, G_TLR, G_TLG = 1, 2, 3, 4, 5, 6, 7, 8
KAI = '/usr/share/fonts/truetype/arphic/ukai.ttc'; HEI = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'; SONG = '/usr/share/fonts/truetype/arphic/uming.ttc'
FLUO_C = '#dff0e2'; TUNG = '#ffb060'; SODIUM = '#ffa850'

def sky(d):
    y = np.clip(d[:, 1], 0, 1)
    zen = srgb('#1c2e4e') * 0.11; hor = srgb('#4a5670') * 0.15
    t = y ** 0.5
    c = hor[None] * (1 - t[:, None]) + zen[None] * t[:, None]
    az = np.arctan2(d[:, 0], -d[:, 2])
    return (c * (0.8 + 0.4 * fbm2(az * 2.0, y * 6.0, 4, 3))[:, None]).astype(np.float32)

FOG = dict(sigma=0.009, color=lambda d: sky(np.stack([d[:, 0], np.maximum(d[:, 1], 0.03), d[:, 2]], 1)) * 2.4)

def amb_sky(d):
    return sky(d) * 2.0
BAY = 3.6; GF_TOP = 3.85; SW = 0.15

def room(w, ow, oh, D, col='#4f7a62', dh=1.35):
    k = dict(mat='dado', col=col, prm=(dh, 0, 0, 0))
    w.quads((0, 0, 0), (ow, 0, 0), (ow, 0, -D), (0, 0, -D), mat='concrete', col='#6d6a62')
    w.quads((0, oh, -D), (ow, oh, -D), (ow, oh, 0), (0, oh, 0), mat='plain', col='#b9b5a6', prm=(0.3, 0, 0, 0))
    w.quads((0, 0, -D), (ow, 0, -D), (ow, oh, -D), (0, oh, -D), **k)
    w.quads((0, 0, 0), (0, 0, -D), (0, oh, -D), (0, oh, 0), **k)
    w.quads((ow, 0, -D), (ow, 0, 0), (ow, oh, 0), (ow, oh, -D), **k)

def shop(w, ow, oh):
    D = 3.4
    room(w, ow, oh, D)
    w.quads((0.12, 0.4, -D + 0.04), (ow - 0.12, 0.4, -D + 0.04), (ow - 0.12, 2.5, -D + 0.04), (0.12, 2.5, -D + 0.04), mat='shelf', prm=(0.11, 0.3, 0, 0), seed=0.3)
    w.quads((ow - 0.04, 0.4, -D + 0.2), (ow - 0.04, 0.4, -0.5), (ow - 0.04, 2.3, -0.5), (ow - 0.04, 2.3, -D + 0.2), mat='shelf', prm=(0.13, 0.32, 0, 0), seed=0.7)
    for (x, y, pw, ph, c) in ((0.02, 1.9, 0.5, 0.7, '#c9b48a'), (0.02, 1.75, 0.34, 0.34, '#b0302a')):          # calendar, 福
        w.quads((0.02, y - ph / 2, -1.2 - pw), (0.02, y - ph / 2, -1.2), (0.02, y + ph / 2, -1.2), (0.02, y + ph / 2, -1.2 - pw), mat='plain', col=c)
    # glass counter + things on it
    w.box((0.95, 0.47, -0.75), (1.6, 0.94, 0.55), mat='plain', col='#3a4a44', prm=(0.2, 0, 0.06, 0.02), over={'Z': dict(mat='shelf', prm=(0.09, 0.22, 0, 0)), 'Y': dict(mat='plain', col='#1c2422', prm=(0, 0, 0.1, 0.01))})
    w.box((0.45, 1.06, -0.75), (0.2, 0.24, 0.2), mat='plain', col='#b02a22'); w.box((1.3, 1.02, -0.75), (0.3, 0.16, 0.25), mat='plain', col='#d8c890')
    # TV on a high shelf in the back-right corner
    w.box((ow - 0.5, 1.72, -D + 0.5), (0.7, 0.05, 0.6), mat='wood', col='#6a5a44')
    w.box((ow - 0.5, 1.98, -D + 0.5), (0.52, 0.44, 0.46), yaw=-0.6, mat='plain', col='#2a2a2c', over={'Z': dict(mat='emit', col='#9fc0ff', prm=(2.6, 0, 0, 0), grp=G_TV, tag=pr.TAG_NOSNOW)})
    w.light('point', np.asarray(srgb('#9fc0ff')) * 0.35, pos=(ow - 0.75, 1.98, -D + 0.85), radius=0.1, grp=G_TV, range=6.0, r0=0.4)
    # fluorescent tube
    w.box((ow / 2, oh - 0.07, -1.25), (1.25, 0.05, 0.07), mat='emit', col=FLUO_C, prm=(14.0, 0, 0, 0), grp=G_FLUO, mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=pr.TAG_NOSNOW)
    w.light('point', np.asarray(srgb(FLUO_C)) * 3.6, pos=(ow / 2, oh - 0.3, -1.25), radius=0.25, grp=G_FLUO, range=40.0, r0=0.6, vol=0.004)
    # goods hanging from the lintel
    rng = np.random.default_rng(9)
    for i in range(9):
        x = 0.25 + i * 0.33 + rng.uniform(-0.05, 0.05); c = ['#c8392f', '#e2b23a', '#3f7f4a', '#e6e2d6', '#d9772e', '#2f5fa8'][rng.integers(6)]
        hh = rng.uniform(0.25, 0.55)
        w.quads((x - 0.07, oh - 0.05 - hh, 0.03), (x + 0.07, oh - 0.05 - hh, 0.03), (x + 0.07, oh - 0.05, 0.03), (x - 0.07, oh - 0.05, 0.03), mat='plain', col=c, mask=MASK_THIN)
    # outside: chest freezer, beer crates, stool, phone
    w.box((ow - 0.72, 0.43, 0.62), (1.25, 0.85, 0.62), mat='plain', col='#c9c9c2', prm=(0.3, 0, 0.03, 0.05), over={'Y': dict(mat='plain', col='#20282c', prm=(0, 0, 0.1, 0.02))})
    w.box((ow - 0.72, 0.62, 0.935), (1.25, 0.14, 0.01), mat='plain', col='#b02a22')
    for i in range(3): w.box((0.35 + 0.02 * i, 0.16 + 0.31 * i, 0.5), (0.46, 0.3, 0.33), mat='plain', col=['#2f6a45', '#356f4a', '#b3882a'][i], prm=(0.4, 0, 0, 0))
    w.box((1.15, 0.2, 0.75), (0.3, 0.4, 0.3), mat='plain', col='#b3302a'); w.box((1.15, 0.41, 0.75), (0.34, 0.03, 0.34), mat='plain', col='#b3302a')
    w.box((1.75, 0.38, 0.45), (0.45, 0.76, 0.4), mat='wood', col='#6a5a44'); w.box((1.75, 0.83, 0.45), (0.22, 0.12, 0.2), mat='plain', col='#b5241c')

def barber(w, ow, oh):
    D = 3.0
    room(w, ow, oh, D, col='#7a6a72')
    with w.at((0.0, 0.0, -0.02)):
        w.quads((0.05, 0.5, 0), (2.0, 0.5, 0), (2.0, oh - 0.1, 0), (0.05, oh - 0.1, 0), mat='glass', prm=(0, 1.95, oh - 0.6, 3), tag=pr.TAG_NOSNOW, seed=0.9)
        w.quads((2.15, 0.0, 0), (ow - 0.05, 0.0, 0), (ow - 0.05, oh - 0.1, 0), (2.15, oh - 0.1, 0), mat='glass', prm=(0, ow - 2.2, oh - 0.1, 0), tag=pr.TAG_NOSNOW, seed=0.95)
        w.box((1.0, 0.25, 0), (2.0, 0.5, 0.08), mat='tile', col='#c9c8bd')
    tid, asp = pr.text_tex(w, '理发', font=KAI, size=96, fg='#b83a32', bg='#11161b', pad=0.15, spacing=0.3)
    w.quads((0.45, 1.25, 0.0), (1.65, 1.25, 0.0), (1.65, 1.85, 0.0), (0.45, 1.85, 0.0), mat='tex', prm=(tid, 1.2, 0.6, 0.0), tag=pr.TAG_NOSNOW)

def shut(col, rust=0.5):
    def cb(w, ow, oh):
        w.quads((0, 0, 0), (ow, 0, 0), (ow, oh, 0), (0, oh, 0), mat='shutter', col=col, prm=(rust, 0, 0, 0))
    return cb

def signboard(w, x0, x1, text, fg, bg, font=HEI, y0=3.05, y1=3.78, emis=0.0, grp=0, wear=0.25, z=0.06):
    tid, asp = pr.text_tex(w, text, font=font, size=96, fg=fg, bg=bg, pad=0.22, spacing=0.12, wear=wear)
    hh = y1 - y0; ww = min(x1 - x0, hh * asp)
    cx = (x0 + x1) / 2
    w.box((cx, (y0 + y1) / 2, z / 2), (x1 - x0, hh, z), mat='plain', col=bg, prm=(0.3, 0, 0, 0), faces='xXyY')
    w.quads((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), mat='plain', col=bg, prm=(0.3, 0, 0, 0))
    w.quads((cx - ww / 2, y0, z + 0.005), (cx + ww / 2, y0, z + 0.005), (cx + ww / 2, y1, z + 0.005), (cx - ww / 2, y1, z + 0.005), mat='tex', prm=(tid, ww, hh, emis), grp=grp, tag=pr.TAG_NOSNOW)

def upper(w, width, floors, rng, lit=0.08, col='#bdbcb0', fh=3.0, special=None):
    """upper floors of a tiled block (local wall frame, y=0 at the first upper floor)"""
    ops = []
    nb = int(round(width / BAY))
    for b in range(nb):
        for k in range(2):
            x = b * BAY + 0.45 + k * 1.75
            for f in range(floors):
                key = (b, k, f)
                if special and key in special: l, c, g = special[key]
                elif rng.random() < lit: l, c, g = rng.uniform(0.5, 1.1), pr.WARM[rng.integers(len(pr.WARM))], 0
                else: l, c, g = 0.0, '#ffc070', 0
                def cb(w_, ow, oh, l=l, c=c, g=g): pr.pane(w_, ow, oh, lit=l, col=c, style=0 if rng.random() < 0.6 else 1, grp=g)
                ops.append((x, f * fh + 0.9, x + 1.3, f * fh + 2.3, cb))
    pr.wall(w, width, floors * fh, ops, mat='tile', col=col)
    for o in ops: pr.sill(w, o[0], o[1], o[2], col='#a8a79c')
    pr._facade_details(w, width, floors * fh, 0.0, fh, floors, nb, BAY, rng, 0.3, 0.3, ops)
    w.box((width / 2, floors * fh + 0.2, 0.1), (width + 0.4, 0.4, 0.5), mat='concrete', col='#84817a')

def gable(w, width, height, rng, col='#bdbcb0', nwin=2, lit=None):
    ops = []
    for i in range(nwin):
        x = width * (i + 0.7) / (nwin + 0.6)
        for f in range(int(height // 3.0)):
            if f == 0 and i == 0: continue
            l, c = (0.0, '#ffc070')
            if lit and (i, f) in lit: l, c = lit[(i, f)]
            def cb(w_, ow, oh, l=l, c=c): pr.pane(w_, ow, oh, lit=l, col=c, style=0)
            ops.append((x, f * 3.0 + 1.0 + 0.9, x + 1.0, f * 3.0 + 1.0 + 2.2, cb))
    pr.wall(w, width, height, ops, mat='tile', col=col)
    for o in ops: pr.sill(w, o[0], o[1], o[2], col='#a8a79c')
    for o in ops:
        if rng.random() < 0.45:
            w.box(((o[0] + o[2]) / 2 + 1.15, o[1] + 0.2, 0.2), (0.82, 0.55, 0.32), mat='plain', col='#b9b7ad', prm=(0.6, 0, 0, 0))
    for x in (0.5, width - 0.6):
        w.tube((x, 0, 0.08), (x, height, 0.08), 0.055, sides=5, mat='metal', col='#716c64', prm=(0.7, 0, 0, 0))

def noodle(w, ow, oh):
    D = 4.0
    room(w, ow, oh, D, col='#8a7a52', dh=1.2)
    for (x, z) in ((0.8, -1.2), (2.3, -1.4), (0.9, -2.8), (2.4, -2.9)):
        w.box((x, 0.72, z), (0.8, 0.05, 0.8), mat='wood', col='#7a5a3a'); w.box((x, 0.36, z), (0.08, 0.72, 0.08), mat='wood', col='#5a4630')
        for dx in (-0.55, 0.55): w.box((x + dx, 0.22, z), (0.3, 0.44, 0.3), mat='plain', col='#b3302a')
    w.box((ow - 0.45, 0.5, -0.4), (0.7, 1.0, 0.6), mat='metal', col='#8a8e8c', prm=(0.4, 0, 0, 0))          # stove with pots at the door
    w.tube((ow - 0.45, 1.0, -0.4), (ow - 0.45, 1.3, -0.4), 0.24, sides=10, mat='metal', col='#9a9e9c', caps=True)
    for x in (ow * 0.3, ow * 0.7):
        w.box((x, oh - 0.12, -1.6), (0.07, 0.1, 0.07), mat='emit', col=TUNG, prm=(16.0, 0, 0, 0), mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=pr.TAG_NOSNOW)
    w.light('point', np.asarray(srgb(TUNG)) * 3.0, pos=(ow / 2, oh - 0.35, -1.6), radius=0.25, range=36.0, r0=0.6, vol=0.004)
    w.quads((0.3, 1.4, -D + 0.03), (ow - 0.3, 1.4, -D + 0.03), (ow - 0.3, 2.3, -D + 0.03), (0.3, 2.3, -D + 0.03), mat='plain', col='#b02a22')      # menu board

SIGNS = ['五金电料', '粮油副食', '修车补胎', '利民药店', '照相馆', '裁缝铺', '烟酒糖茶', '家电维修', '副食品店', '台球室', '音像制品', '洗衣店', '文具店', '日用杂货', '钟表眼镜', '土产日杂']
SIGNC = [('#d8c06a', '#7c2a24'), ('#b3261e', '#cfcabb'), ('#e6e2d6', '#2f4f6c'), ('#2f6a4a', '#d6d2c2'), ('#e6e2d6', '#8a3a2a'), ('#3a3a3a', '#c9c4a8'), ('#d8d4c4', '#3a5a4a')]
SHUT = ['#6a7478', '#5d6b62', '#74706a', '#58606c', '#6b6a5e', '#4f5a66', '#7a7468']

def shoprow(w, x_left, nb, special, rng):
    """ground floor of a block: mostly rolled-down shutters with signboards; special = {bay: (callback, sign)}"""
    with w.at((x_left, SW, 0)):
        ops = []
        for k in range(nb):
            cb = special[k][0] if k in special else shut(SHUT[rng.integers(len(SHUT))], rng.uniform(0.3, 0.8))
            ops.append((k * BAY + 0.18, 0.0, k * BAY + BAY - 0.18, 2.8, cb, 0.12))
        pr.wall(w, nb * BAY, GF_TOP - SW, ops, mat='tile', col='#b3b2a6')
    for k in range(nb):
        x0 = x_left + k * BAY
        if k in special:
            sg = special[k][1]
            if sg: signboard(w, x0 + 0.15, x0 + BAY - 0.15, *sg[0], **sg[1])
        elif rng.random() < 0.8:
            fg, bg = SIGNC[rng.integers(len(SIGNC))]
            signboard(w, x0 + 0.15, x0 + BAY - 0.15, SIGNS[rng.integers(len(SIGNS))], fg, bg, font=[HEI, SONG, KAI][rng.integers(3)], wear=rng.uniform(0.25, 0.5))
    w.box((x_left + nb * BAY / 2, GF_TOP + 0.1, 0.4), (nb * BAY + 0.2, 0.2, 0.9), mat='concrete', col='#7d7a72')

def street_lamp(w, x, z, toward, grp=0, power=15.0):
    return pr.pole(w, (x, SW, z), h=9.0, arms=1, lamp=dict(dir=(0.0, toward), color=SODIUM, power=power, h=7.6, arm=2.2, vol=0.006, range=55.0, cone=(0.0, 0.7), grp=grp))

def build():
    w = World(seed=5); rng = np.random.default_rng(21)
    # ---------------------------------------------------------------- road, zebra crossing, kerbs
    gm = GroundMap(-80, -20, 140, 30, res=10)
    for x in np.arange(-78, 138, 6.0): gm.line([(x, 8.0), (x + 2.6, 8.0)], 0.14, 1.0)
    for z in np.arange(3.0, 13.2, 1.1): gm.line([(12.0, z), (15.0, z)], 0.5, 1.0)                 # zebra
    for z in (2.9, 13.1): gm.line([(-78, z), (138, z)], 0.12, 0.6)
    gm.disc((-4.0, 6.0), 0.42, 0.5); gm.disc((30.0, 10.0), 0.42, 0.5)
    gm.done(blur=0.03)
    @mat('street')
    def street(S):
        r = mats.MATS['asphalt'](S)
        m = gm.sample(S.P[:, 0], S.P[:, 2]) * (0.35 + 0.65 * fbm2(S.P[:, 0] * 3, S.P[:, 2] * 3, 77, 3))
        r['alb'] = mix(r['alb'], srgb('#9a9684')[None] * 0.7, m * 0.7)
        return r
    w.quads((-300, 0, 80), (300, 0, 80), (300, 0, -200), (-300, 0, -200), mat='street', col='#3b3c3e', prm=(1.0, 0, 0, 0), tag=pr.TAG_GROUND)
    for (xa, xb) in ((-120, 5.4), (10.4, 160)):
        w.box(((xa + xb) / 2, SW / 2, 1.1), (xb - xa, SW, 2.2), mat='pave', col='#77746c', prm=(0.5, 0, 0, 0), faces='xXYZ')
    w.box((20, SW / 2, 15.2), (280, SW, 2.8), mat='pave', col='#77746c', prm=(0.5, 0, 0, 0), faces='xXYz')
    # ---------------------------------------------------------------- far side, block 1 (left of the alley)
    nb1 = 22; X1 = 5.4 - nb1 * BAY
    lightbox = (('红星小卖部', '#b3261e', '#e6e0cc'), dict(font=KAI, wear=0.0, emis=1.1, grp=G_SIGN, z=0.14))
    sp1 = {nb1 - 1: (shop, lightbox), nb1 - 2: (barber, (('美发厅', '#2f4f8c', '#cfcfc4'), dict(font=HEI, wear=0.35)))}
    shoprow(w, X1, nb1, sp1, np.random.default_rng(61))
    w.tube((1.72, 1.55, 0.2), (1.72, 2.35, 0.2), 0.085, sides=8, mat='emit', col='#ffffff', prm=(1.6, 0.6, 0, 0), grp=G_POLE, tag=pr.TAG_NOSNOW, mask=MASK_NOBOUNCE)
    for yy in (1.5, 2.4): w.tube((1.72, yy - 0.05, 0.2), (1.72, yy + 0.05, 0.2), 0.1, sides=8, mat='plain', col='#8a8a88', caps=True)
    sp_win = {(nb1 - 3, 0, 1): (0.9, '#9fb4d8', G_TV), (nb1 - 6, 1, 3): (0.8, '#9fb4d8', G_BULB)}
    with w.at((X1, GF_TOP + 0.2, 0)):
        upper(w, nb1 * BAY, 5, np.random.default_rng(31), lit=0.2, special=sp_win)
    with w.at((5.4, 0, 0), yaw=np.pi / 2):
        gable(w, 12.0, GF_TOP + 0.2 + 15.0, np.random.default_rng(32))
    # awning + bulb in front of the shop
    w.quads((1.6, 2.5, 2.1), (5.75, 2.5, 2.1), (5.75, 3.02, 0.06), (1.6, 3.02, 0.06), mat='stripes', prm=(0.13, 0, 0, 0))
    for x in (1.7, 5.65): w.tube((x, SW, 2.05), (x, 2.5, 2.08), 0.03, sides=5, mat='plain', col='#a08a5a')
    w.box((3.2, 2.33, 1.15), (0.07, 0.1, 0.07), mat='emit', col=TUNG, prm=(18.0, 0, 0, 0), mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=pr.TAG_NOSNOW)
    w.light('point', np.asarray(srgb(TUNG)) * 0.9, pos=(3.2, 2.25, 1.15), radius=0.06, range=18.0, r0=0.35, vol=0.002)
    with w.at((3.4, SW, 1.45), yaw=0.15): pr.bicycle(w, lean=0.16)
    # ---------------------------------------------------------------- far side, block 2 (right of the alley)
    nb2 = 26
    sign_n = (('清真面馆', '#e6d8a0', '#1f5a3a'), dict(font=HEI, wear=0.1, emis=0.5, z=0.1))
    sp2 = {3: (noodle, sign_n), 0: (shut('#5d6266', 0.5), (('录像出租', '#d8c06a', '#2a3a5a'), dict(font=HEI, wear=0.35)))}
    shoprow(w, 10.4, nb2, sp2, np.random.default_rng(62))
    with w.at((10.4, GF_TOP + 0.2, 0)):
        upper(w, nb2 * BAY, 5, np.random.default_rng(41), col='#b6b8b0', lit=0.18)
    with w.at((10.4, 0, -12.0), yaw=-np.pi / 2):
        gable(w, 12.0, GF_TOP + 0.2 + 15.0, np.random.default_rng(42), col='#b6b8b0', lit={(1, 1): (1.0, '#ffc070'), (0, 3): (0.8, '#ffd08a')})
    # vertical neon signs
    def vneon(text, x, y0, y1, col, grp, power=1.3):
        tid, asp = pr.text_tex(w, text, font=HEI, size=96, fg=col, bg='#120808', pad=0.25, vertical=True, spacing=0.15)
        w.box((x, (y0 + y1) / 2, 0.55), (0.12, y1 - y0 + 0.1, 0.95), mat='plain', col='#1a1414')
        for sx, a, b in ((x - 0.065, 0.08, 1.02), (x + 0.065, 1.02, 0.08)):
            w.quads((sx, y0, a), (sx, y0, b), (sx, y1, b), (sx, y1, a), mat='tex', prm=(tid, 0.94, y1 - y0, 7.0), grp=grp, tag=pr.TAG_NOSNOW, mask=MASK_NOSHADOW | MASK_NOBOUNCE)
        w.light('point', np.asarray(srgb(col)) * power, pos=(x - 0.4, (y0 + y1) / 2, 0.8), radius=0.3, grp=grp, range=24.0, r0=0.6, vol=0.004)
    vneon('网吧', 10.25, 4.3, 6.5, '#ff3b30', G_NEON)
    vneon('招待所', 46.0, 4.3, 7.6, '#ff5a3a', 0, power=1.0)
    vneon('台球', -14.0, 4.3, 6.5, '#4aa8ff', 0, power=0.8)
    # ---------------------------------------------------------------- the alley
    w.box((5.28, 1.3, -21.0), (0.25, 2.6, 18.0), mat='brick', col='#7c5448')
    with w.at((10.5, 0, -12.2), yaw=-np.pi / 2): pr.shed_row(w, n=7, bay=2.5, depth=2.6, h=2.2, rng=np.random.default_rng(6))
    with w.at((10.4, 0, -44.0), yaw=-np.pi / 2): gable(w, 14.0, 16.0, np.random.default_rng(44), col='#a5a39a', lit={(1, 2): (0.9, '#ffc070')})
    w.tube((10.4, 3.5, -8.5), (9.8, 3.7, -8.5), 0.02, sides=4, mat='plain', col='#3a3a38')
    w.box((9.8, 3.55, -8.5), (0.08, 0.1, 0.08), mat='emit', col=TUNG, prm=(20.0, 0, 0, 0), mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=pr.TAG_NOSNOW)
    w.light('point', np.asarray(srgb(TUNG)) * 1.6, pos=(9.8, 3.4, -8.5), radius=0.06, range=28.0, r0=0.4, vol=0.004)
    for (z, yw) in ((-2.6, 0.12), (-3.5, 0.2)):
        with w.at((10.05, 0, z), yaw=np.pi / 2 + yw): pr.bicycle(w, lean=-0.22)
    pr.wire(w, (5.45, 5.3, -5.2), (10.35, 5.3, -5.6), sag=0.25, r=0.008)
    # ---------------------------------------------------------------- street furniture
    lamps = []
    for x in (-34, -6, 22, 50, 78, 106): street_lamp(w, x, 1.2, 1.0)
    for x in (22, 50, 78, 106): street_lamp(w, x, 14.6, -1.0)
    pts_prev = None
    for x in (70, 98, 126):
        pts, _ = pr.pole(w, (x, SW, 14.4), h=9.5, arms=2, col='#6a655c')
        if pts_prev:
            for a_, b_ in zip(pts_prev, pts): pr.wire(w, a_, b_, sag=0.9)
        for a_ in pts[:3]: pr.wire(w, a_, (x + rng.uniform(-3, 3), rng.uniform(7, 12), 0.1), sag=0.5)
        pts_prev = pts
    # bus stop with a lit advertisement box
    with w.at((27.0, SW, 1.5)):
        for x in (-2.2, 2.2): w.tube((x, 0, -0.4), (x, 2.5, -0.4), 0.05, sides=5, mat='plain', col='#5a6066')
        w.box((0, 2.55, 0.1), (5.0, 0.08, 1.5), mat='metal', col='#4a5a66', prm=(0.5, 0, 0, 0))
        w.box((0, 1.3, -0.45), (2.2, 1.5, 0.12), mat='plain', col='#2a2e32'); 
        w.quads((-1.05, 0.6, -0.38), (1.05, 0.6, -0.38), (1.05, 2.0, -0.38), (-1.05, 2.0, -0.38), mat='shelf', prm=(0.5, 0.7, 0.45, 0), seed=0.2, tag=pr.TAG_NOSNOW)
        w.light('point', np.asarray(srgb('#dfe8f0')) * 0.9, pos=(0, 1.3, 0.2), radius=0.3, range=14.0, r0=0.5)
        w.box((0, 0.45, 0.1), (2.6, 0.06, 0.4), mat='wood', col='#5a5046'); w.tube((3.2, 0, 0.3), (3.2, 2.9, 0.3), 0.04, sides=5, mat='plain', col='#8a8e90'); w.box((3.2, 2.7, 0.3), (0.5, 0.5, 0.04), mat='plain', col='#2f5fa8')
    # vehicles (parked, wet)
    for (x, z, yw, kind, col) in ((-3.2, 3.3, 0.02, 'sedan', '#8c2a22'), (15.5, 3.4, 0.0, 'van', '#b9bcc0'), (38.0, 3.3, 0.03, 'sedan', '#2a3a4a'), (-12.0, 12.7, np.pi, 'van', '#c9c6b8'),
                              (20.5, 12.6, np.pi + 0.03, 'sedan', '#8c2a22'), (55, 3.4, 0, 'jeep', '#3a4a3a')):
        with w.at((x, 0, z), yaw=yw): pr.car(w, kind, col)
    for (x, z, yw) in ((7.4, 2.6, 1.4), (-9.0, 1.7, 0.1), (31.5, 1.8, 0.2)):
        with w.at((x, SW if z < 2.2 else 0, z), yaw=yw): pr.trike(w)
    with w.at((-25.0, SW, 1.3), yaw=np.pi / 2): pr.bike_row(w, 6, rng=rng)
    with w.at((18.0, SW, 1.6), yaw=np.pi / 2): pr.bike_row(w, 4, rng=rng)
    w.box((0.0, SW + 0.45, 1.75), (0.5, 0.9, 0.5), mat='metal', col='#3f5a48', prm=(0.6, 0, 0, 0))
    w.box((13.4, SW + 1.1, 1.3), (0.9, 2.2, 0.9), mat='metal', col='#c9a23a', prm=(0.4, 0, 0, 0))                    # IC-card phone booth
    w.quads((12.96, SW + 1.0, 1.76), (13.84, SW + 1.0, 1.76), (13.84, SW + 2.0, 1.76), (12.96, SW + 2.0, 1.76), mat='glass', prm=(0.5, 0.88, 1.0, 3), col='#dfe8d8', tag=pr.TAG_NOSNOW)
    # street trees
    trng = np.random.default_rng(15)
    for x in (58, 72, 86, 100):
        tips, n = pr.tree(w, (x + trng.normal(0, 0.5), SW, 14.9), trng.uniform(8.0, 9.5), 'plane', trng, col='#4a443c', trunk_r=0.2)
        pr.foliage(w, tips, n_per=26, size=0.17, col='#33502c', spread=0.6, rng=trng, col2='#4a6a34', p2=0.3)
    for x in (-44, 33, 62, 90):
        tips, n = pr.tree(w, (x + trng.normal(0, 0.5), SW, 1.35), trng.uniform(8.0, 9.5), 'plane', trng, col='#4a443c', trunk_r=0.2)
        pr.foliage(w, tips, n_per=26, size=0.17, col='#33502c', spread=0.6, rng=trng, col2='#4a6a34', p2=0.3)
    # ---------------------------------------------------------------- far end: cross street, traffic light, towers
    with w.at((126.0, 0, 9.0), yaw=-np.pi / 2 + 0.05): pr.apt_block(w, units=5, floors=9, style='tile', rng=np.random.default_rng(45), lit=0.2, details=False, lit_gain=1.5)
    with w.at((150.0, 0, -40.0), yaw=-np.pi / 2): pr.apt_block(w, units=4, floors=14, style='plaster', rng=np.random.default_rng(46), lit=0.2, details=False, lit_gain=1.5)
    w.tube((108.0, 0, 2.4), (108.0, 6.0, 2.4), 0.09, sides=6, mat='plain', col='#55585a'); w.tube((108.0, 5.8, 2.4), (108.0, 5.8, 7.0), 0.06, sides=5, mat='plain', col='#55585a')
    w.box((107.9, 5.6, 6.6), (0.3, 1.1, 0.4), mat='plain', col='#151515')
    for (yy, col, g) in ((5.95, '#ff2a18', G_TLR), (5.25, '#30ff7a', G_TLG)):
        w.sphere((107.72, yy, 6.6), 0.16, n=6, mat='emit', col=col, prm=(9.0, 0, 0, 0), grp=g, mask=MASK_NOSHADOW | MASK_NOBOUNCE, tag=pr.TAG_NOSNOW)
        w.light('point', np.asarray(srgb(col)) * 2.0, pos=(107.3, yy, 6.6), radius=0.2, grp=g, range=40.0, r0=1.0, vol=0.01)
    return w

def camera():
    return Camera((-21.0, 8.9, 15.4), (13.0, 2.6, 2.4), fov=62.0)

HOOK = wet_hook()
RENDER = dict(K=K, fog=FOG, hook=HOOK, bounce_range=40.0, skyamb=1.0, emis_clamp=1.0, refl_clamp=5.0, amb_sky=amb_sky)
GRADE = dict(exposure=3.0, contrast=1.12, sat=1.0, shoulder=1.0, lift=(0.012, 0.022, 0.045))
PAL = dict(k=96, chroma_w=4.0)
DENOISE = dict(sl=0.12)
STEAM = (24.2, 1.6, 0.6)

def setup(plate, cam):
    c = dict(plate=plate, cam=cam)
    H, W = plate['sky'].shape
    c['sky'] = fx.native_sky(sys.modules[__name__], cam, H, W) * plate['sky'][..., None]
    Ls = plate['lights']
    pts = [L for L in Ls if L['kind'] == 'point']
    cp = cam.pos
    pts = sorted(pts, key=lambda L: np.linalg.norm(L['pos'] - cp))[:22]
    c['lts'] = [(L['pos'], L['color'], L['grp'], L.get('axis'), L.get('cone')) for L in pts]
    mk = lambda **k: fx.Particles(cam, plate, T=T, vel=(0.6, -7.6, 0.3), vjit=0.08, sway=0.0, **k)
    c['rain'] = [mk(n=7000, seed=1, near=18, far=90, size=0.045, dpow=0.9, loops=9), mk(n=2000, seed=2, near=6, far=20, size=0.026, dpow=0.7, loops=9),
                 mk(n=90, seed=3, near=1.5, far=6, size=0.014, dpow=0.5, loops=9)]
    aux = plate['aux']
    c['rip'] = fx.Ripples(plate, aux, n=160, T=T, loops=9, seed=6)
    ground = (plate['N'][..., 1] > 0.9) & (plate['P'][..., 1] < 0.3) & (plate['sky'] < 0.5)
    c['rip2'] = fx.Ripples(plate, ground.astype(np.float32) * 0.8, n=260, T=T, loops=9, seed=7, rmax=0.16)
    px, py, _, _ = cam.project(np.array([[1.72, 1.55, 0.2], [1.72, 2.35, 0.2]]))
    c['pole'] = (px, py)
    c['steam'] = fx.Smoke(cam, plate, STEAM, n=10, T=T, loops=3, rise=0.6, wind=(0.15, 0, 0.25), r0=0.2, grow=0.35, seed=8, alpha=0.4)
    return c

def gains(ph):
    g = np.ones(K, np.float32)
    g[G_FLUO] = 1.0 + 0.03 * (fx.stepnoise(ph, 90, 3) - 0.5) - 0.45 * fx.pulse(ph, 0.37, 0.378, 0.002) - 0.3 * fx.pulse(ph, 0.390, 0.396, 0.002)
    buzz = fx.pulse(ph, 0.58, 0.72, 0.004)
    g[G_NEON] = (1.0 - buzz * 0.75 * (fx.stepnoise(ph, 135, 9) > 0.45)) * (0.94 + 0.06 * fx.stepnoise(ph, 60, 2))
    g[G_BULB] = 0.5 + 0.9 * fx.stepnoise(ph, 27, 31) * (0.6 + 0.4 * fx.stepnoise(ph, 9, 32))
    g[G_SIGN] = 1.0 - 0.12 * (fx.stepnoise(ph, 54, 21) > 0.9)
    g[G_TV] = 0.5 + 0.9 * fx.stepnoise(ph, 36, 11) * (0.6 + 0.4 * fx.stepnoise(ph, 9, 12))
    red = fx.pulse(ph, 0.5, 1.0, 0.003)
    g[G_TLR] = red; g[G_TLG] = 1 - red
    return g

def frame(c, ph):
    P = c['plate']; L = P['layers']; g = gains(ph); H, W = P['sky'].shape
    lin = c['sky'].copy()
    for k in range(K):
        if k == G_POLE: continue
        lin += g[k] * L[k]
    yy, xx = np.mgrid[0:H, 0:W]
    stripe = ((yy * 0.45 + xx * 0.45 + ph * 27.0) % 3.0).astype(np.int32)
    pal = np.array([[1.3, 0.12, 0.1], [1.1, 1.1, 1.1], [0.12, 0.25, 1.4]], np.float32)
    px, py = c['pole']
    on = ((np.abs(xx - px.mean()) < 4) & (yy > py.min() - 1) & (yy < py.max() + 1))[..., None]
    lin += L[G_POLE] * np.where(on, pal[stripe], np.array([0.75, 0.55, 0.7], np.float32))
    c['rip'].draw(lin, ph, gain=0.8); c['rip2'].draw(lin, ph, gain=0.5, win=6)
    c['steam'].draw(lin, ph, np.array([0.5, 0.42, 0.3], np.float32))
    lts = [(p, col * g[grp] * 0.22, 0.7, ax, cone) for (p, col, grp, ax, cone) in c['lts']]
    amb = np.array([0.003, 0.004, 0.007], np.float32)
    c['rain'][0].draw(lin, ph, amb, lts, alpha=0.5, streak=0.02, additive=True)
    c['rain'][1].draw(lin, ph, amb, lts, alpha=0.6, streak=0.024, additive=True)
    c['rain'][2].draw(lin, ph, amb * 2.0, lts, alpha=0.45, streak=0.03, additive=True)
    return fx.bloom(lin, thresh=0.6, sig=(1.0, 3.5), gain=(0.25, 0.16))
