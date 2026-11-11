"""Scene 2 - the water-lily pond: tree wall, weeping willows, the Japanese bridge,
lily pads that open as the camera passes, koi, dragonflies, irises on the bank."""
import numpy as np
from engine import Batch, smooth, mix, noise, ramp, C, pal, pick, jitter, DASH, DAB, SCUM, LENS
from world import Set, rnd_fields, window, scene_of, B1, B2

FOC = 1400.0                     # focal length used for ground foreshortening

SHADOW = pal((28, 64, 70), (36, 78, 62), (46, 58, 100), (24, 58, 54), (58, 60, 110))
MID = pal((56, 110, 62), (74, 130, 66), (48, 100, 82), (88, 138, 74))
LIGHT = pal((134, 174, 74), (162, 192, 88), (192, 208, 112), (112, 164, 84), (214, 214, 130))
W_SHADOW = pal((40, 88, 72), (50, 78, 104), (34, 74, 60))
W_MID = pal((94, 150, 72), (80, 134, 82), (112, 160, 78))
W_LIGHT = pal((178, 206, 98), (152, 192, 86), (204, 216, 124), (226, 226, 150))


def lit_pick(lit, rnd, sh, md, lt, spread=0.30):
    v = lit + (rnd[:, 0] - 0.5) * spread
    out = pick(md, rnd[:, 1])
    out = np.where((v < 0.36)[:, None], pick(sh, rnd[:, 1]), out)
    out = np.where((v > 0.64)[:, None], pick(lt, rnd[:, 1]), out)
    # pull every stroke a little toward the smooth light-to-shadow ramp so forms stay readable
    sm = mix(mix(sh.mean(0), md.mean(0), smooth(0.15, 0.5, lit)), lt.mean(0), smooth(0.5, 0.9, lit))
    return (0.62 * out + 0.38 * sm).astype(np.float32)


def pond_vis(env, rnd, p, k=1.0):
    """Far things emerge from the mist as their scene arrives and dissolve as it leaves."""
    v = np.clip(1.7 - 1.7 * abs(env.d - k), 0.0, 1.0)
    far = smooth(0.9, 0.55, p)
    return 1.0 - far * (1.0 - smooth(rnd * 0.6, rnd * 0.6 + 0.4, v))


# ------------------------------------------------------------------ foliage
def _foliage(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    wind = env.wind(X, p)
    dap = noise(X / 700.0 + t * 0.05, Y / 600.0 + t * 0.02, 3)
    rgb = g['col'] * (0.84 + 0.36 * dap[:, None] * (0.4 + 0.6 * g['lit'][:, None]))
    fl = np.sin(t * (1.6 + 1.5 * rnd[:, 2]) + rnd[:, 3] * 6.28)
    x = sx + (2.0 + 7.0 * wind) * fl * g['flut'] * sc * 3.0
    y = sy + 1.5 * fl * g['flut']
    ang = g['ang'] + 0.22 * fl * wind * g['flut']
    a = g['a'] * pond_vis(env, rnd[:, 2], p, g.get('k', 1.0))
    return Batch(x, y, ang, g['L'] * sc, g['W'] * sc, g['spr'], rgb, a, g['zo'])


def crowns(rng, specs, name, haze=None, cam=(-1e9, 1e9), flut=1.0, pals=(SHADOW, MID, LIGHT), dens=1.0, k=1.0,
           light=(0.55, 0.83)):
    """Round tree crowns: each is modelled by light from the upper left, not by noise."""
    Xs, Ys, ps, Ls, Ws, an, col, lit, zo = [], [], [], [], [], [], [], [], []
    for (cx, cy, rx, ry, p, spx) in specs:
        n = int(dens * 3.0 * rx * ry * p * p / (spx * spx * 0.26)) + 6
        a = rng.random(n) * 6.283
        r = np.sqrt(rng.random(n))
        ox, oy = r * np.cos(a), r * np.sin(a)
        l = 0.5 - 0.42 * (ox * light[0] + oy * light[1]) + 0.10 * rng.standard_normal(n)
        l = l * (0.6 + 0.4 * r)                       # the inside of a crown is dark
        Xs.append(cx + ox * rx); Ys.append(cy + oy * ry)
        ps.append(np.full(n, p) + rng.random(n) * 0.004)
        s = spx / p * (0.7 + 0.6 * rng.random(n))
        Ls.append(s); Ws.append(s * rng.uniform(0.42, 0.6, n))
        an.append(a + 1.5708 + rng.normal(0, 0.6, n))  # dabs wrap around the crown
        rr = rnd_fields(rng, n)
        c = lit_pick(l, rr, *pals)
        if haze is not None:
            c = mix(c, haze[0], haze[1])
        col.append(c); lit.append(l)
        zo.append(np.full(n, 3.0 + p) + l * 0.002)     # lights go on last
    X = np.concatenate(Xs); n = len(X)
    o = np.argsort(np.concatenate(zo), kind='stable')
    f = lambda v: np.concatenate(v)[o].astype(np.float32)
    return Set(name, _foliage, f(Xs), f(Ys), f(ps), cam=cam, margin=300,
               L=f(Ls), W=f(Ws), ang=f(an), col=f(col), lit=np.clip(f(lit), 0, 1), zo=f(zo), a=0.86,
               spr=np.where(rng.random(n) < 0.3, SCUM + rng.integers(0, 4, n), DASH + rng.integers(0, 8, n)).astype(np.int32),
               rnd=rnd_fields(rng, n), flut=flut, k=k)


def _tree_wall(rng):
    sets = []
    X0, X1 = -400.0, 13200.0
    # dark mass behind everything so gaps read as depth, with a ragged top that lets sky in
    n = 5200
    X = rng.uniform(X0, X1, n)
    top = 1150 + 700 * noise(X / 2300.0, 0.5, 1) + 260 * noise(X / 500.0, 2.5, 2)
    Y = -rng.random(n) ** 0.8 * top
    rr = rnd_fields(rng, n)
    hgt = -Y / 1700.0
    col = mix(pick(SHADOW, rr[:, 1]), C(84, 122, 128), 0.25 + 0.2 * hgt[:, None])
    sets.append(Set('wall_bg', _foliage, X, Y, 0.215, cam=(2600, 10200), margin=400,
                    L=rng.uniform(380, 640, n), W=rng.uniform(200, 320, n), ang=rng.uniform(0, 3.14, n),
                    col=col, lit=np.zeros(n, np.float32), zo=np.float32(3.2), a=0.9,
                    spr=(SCUM + rng.integers(0, 4, n)).astype(np.int32), rnd=rr, flut=0.3))
    haze = C(128, 166, 170)
    A, Bc, Cc = [], [], []
    x = X0
    while x < X1:
        A.append((x, -rng.uniform(700, 1500), rng.uniform(420, 760), rng.uniform(340, 560), 0.235, 34)); x += rng.uniform(380, 700)
    x = X0
    while x < X1:
        Bc.append((x, -rng.uniform(380, 1250), rng.uniform(330, 600), rng.uniform(270, 460), 0.275, 36)); x += rng.uniform(330, 620)
    x = X0
    while x < X1:
        Cc.append((x, -rng.uniform(120, 520), rng.uniform(240, 460), rng.uniform(170, 300), 0.305, 32)); x += rng.uniform(300, 560)
    sets.append(crowns(rng, A, 'wallA', (haze, 0.42), (2600, 10200), 0.5))
    sets.append(crowns(rng, Bc, 'wallB', (haze, 0.26), (2600, 10200), 0.6))
    sets.append(crowns(rng, Cc, 'wallC', (haze, 0.12), (2600, 10200), 0.7))
    # sunlit far bank: a pale yellow-green edge where the pond ends
    n = 2600
    X = rng.uniform(X0, X1, n)
    rr = rnd_fields(rng, n)
    col = pick(pal((150, 190, 100), (176, 204, 112), (120, 170, 96), (206, 214, 140), (96, 150, 104)), rr[:, 1])
    sets.append(Set('bank', _foliage, X, -rng.random(n) * 50, 0.312, cam=(2600, 10200), margin=300,
                    L=rng.uniform(90, 170, n), W=rng.uniform(26, 44, n), ang=rng.normal(0, 0.12, n),
                    col=col, lit=np.ones(n, np.float32) * 0.8, zo=np.float32(3.313), a=0.9,
                    spr=(DASH + rng.integers(0, 8, n)).astype(np.int32), rnd=rr, flut=0.4))
    return sets


# ------------------------------------------------------------------ willows
def _willow(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    s = g['s']
    wind = env.wind(g['rx'], p)
    amp = (26.0 + 120.0 * wind) * s ** 1.5
    ph = t * 1.25 - 2.4 * s + g['ph']
    dx = amp * np.sin(ph) + 70.0 * wind * s ** 1.3
    dslope = (amp * np.cos(ph) * -2.4 + 1.5 * amp * np.sin(ph) / np.maximum(s, 0.1)) / np.maximum(g['len'], 1.0)
    x = sx + dx * sc
    dap = noise(X / 500.0 + t * 0.06, Y / 500.0, 3)
    rgb = g['col'] * (0.86 + 0.34 * dap[:, None] * g['lit'][:, None])
    a = g['a'] * pond_vis(env, rnd[:, 2], p)
    return Batch(x, sy, g['ang'] - np.clip(dslope, -0.5, 0.5) * (s > 0), g['L'] * sc, g['W'] * sc, g['spr'], rgb, a, g['zo'])


def willow(rng, X0, p, Hw, R, strands, name, cam, hang_from=None, wpx=11.0):
    """A weeping willow: trunk, cap of foliage, curtains of hanging strands."""
    acc = {k: [] for k in 'X Y L W ang col lit s rx ph len spr zo'.split()}

    def put(X, Y, L, W, ang, col, lit, s, rx, ph, ln, spr, zo):
        for k, v in zip('X Y L W ang col lit s rx ph len spr zo'.split(), (X, Y, L, W, ang, col, lit, s, rx, ph, ln, spr, zo)):
            acc[k].append(v)
    if hang_from is None:
        for i in range(16):                                   # trunk, leaning a little
            q = i / 15.0
            put(X0 + 40 * np.sin(q * 2.0) + rng.normal(0, 8), -Hw * 0.82 * q, Hw * 0.11, (62 - 34 * q) / p * 0.5,
                1.5708 + 0.1 * np.cos(q * 2), pick(pal((70, 56, 76), (92, 70, 70), (54, 50, 84), (110, 90, 80)), rng.random(1))[0],
                0.3, 0.0, X0, 0.0, 1.0, DASH + rng.integers(0, 8), 3.0 + p)
    for k in range(strands):
        u = rng.uniform(-1, 1)
        front = rng.random()
        rx = X0 + u * R
        ry = (-Hw + 0.42 * R * u * u + rng.normal(0, 30)) if hang_from is None else hang_from + rng.normal(0, 40)
        ln = Hw * rng.uniform(0.5, 0.97) * (1 - 0.28 * u * u) if hang_from is None else Hw * rng.uniform(0.45, 1.0)
        m = int(rng.integers(9, 14))
        lit = 0.5 - 0.42 * u + 0.25 * front + rng.normal(0, 0.12)
        ph = rng.uniform(0, 6.28) * 0.35 + u * 1.5
        for j in range(m):
            s = (j + 0.5) / m
            ll = lit + 0.18 * (0.5 - s) + rng.normal(0, 0.1)
            rr = rng.random((1, 4)).astype(np.float32)
            c = lit_pick(np.array([ll]), rr, W_SHADOW, W_MID, W_LIGHT)[0]
            put(rx + u * R * 0.30 * s ** 1.4 + rng.normal(0, 5), ry + ln * s, ln / m * 1.5, wpx / p * rng.uniform(0.7, 1.3),
                1.5708 + u * 0.16 * s + rng.normal(0, 0.07), c, np.clip(ll, 0, 1), s, rx, ph, ln,
                (LENS if rng.random() < 0.6 else DASH) + rng.integers(0, 4), 3.0 + p + 0.001 * front + 0.0005 * ll)
    if hang_from is None:
        for i in range(int(strands * 1.2)):                   # leafy cap
            u = rng.uniform(-1, 1)
            ll = 0.55 - 0.4 * u + rng.normal(0, 0.15)
            rr = rng.random((1, 4)).astype(np.float32)
            put(X0 + u * R * 0.95, -Hw + 0.42 * R * u * u + rng.normal(0, 46), 120 / p * 0.42, 50 / p * 0.42,
                rng.uniform(0, 3.14), lit_pick(np.array([ll]), rr, W_SHADOW, W_MID, W_LIGHT)[0], np.clip(ll, 0, 1),
                0.05, X0, 0.0, 1.0, DAB + rng.integers(0, 4), 3.0 + p + 0.0012)
    n = len(acc['X'])
    A = {k: np.array(v, np.float32) for k, v in acc.items()}
    o = np.argsort(A['zo'], kind='stable')
    for k in A:
        A[k] = A[k][o]
    return Set(name, _willow, A['X'], A['Y'], p, cam=cam, margin=500, L=A['L'], W=A['W'], ang=A['ang'], col=A['col'],
               lit=A['lit'], s=A['s'], rx=A['rx'], ph=A['ph'], len=A['len'], spr=A['spr'].astype(np.int32), zo=A['zo'],
               a=0.93, rnd=rnd_fields(rng, n))


# ------------------------------------------------------------------ the bridge
BRX, BRP, BRA, BRB, BRR, RAIL = 7350.0, 0.45, 1560.0, 150.0, 330.0, 150.0


def _bridge(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    dap = noise(X / 420.0 + t * 0.07, 0.3 + t * 0.03, 3)
    rgb = g['col'] * (0.86 + 0.32 * dap[:, None])
    a = g['a'] * pond_vis(env, rnd[:, 2], p)
    return Batch(sx, sy, g['ang'], g['L'] * sc, g['W'] * sc, g['spr'], rgb, a, g['zo'])


def bridge(rng):
    acc = []
    deck = lambda x: -(BRB + BRR * (1 - (x / BRA) ** 2))
    slope = lambda x: np.arctan(2 * BRR * x / BRA ** 2)

    def arc(off, wpx, cols, n, alpha=0.95, z=0.0, lpx=58):
        for i in range(n):
            x = BRA * (2 * (i + rng.random()) / n - 1)
            c = cols[rng.integers(0, len(cols))]
            acc.append((BRX + x, deck(x) - off + rng.normal(0, 3), lpx / BRP, wpx / BRP * rng.uniform(0.8, 1.2),
                        slope(x) + rng.normal(0, 0.03), c[0], c[1], c[2], alpha, DASH + rng.integers(0, 8), 3.0 + BRP + z))
    dk_sh = pal((38, 92, 104), (46, 84, 118), (34, 78, 90))
    dk_md = pal((78, 146, 138), (92, 158, 150), (66, 132, 142))
    dk_lt = pal((158, 206, 186), (184, 220, 200), (206, 226, 196), (140, 196, 190))
    arc(-18, 16, dk_sh, 70, z=0.000)            # underside of the deck in shadow
    arc(0, 16, dk_md, 80, z=0.001)
    arc(15, 8, dk_lt, 64, z=0.002)              # sunlit edge of the deck
    for i in range(27):                          # posts
        x = BRA * (2 * (i + 0.5) / 27 - 1)
        for k in range(2):
            c = (dk_md if k == 0 else dk_lt)[rng.integers(0, 3)]
            acc.append((BRX + x + (k * 9 - 3), deck(x) - RAIL * 0.5 - 6, RAIL * 1.06, (8.5 - 4 * k) / BRP,
                        1.5708 + rng.normal(0, 0.03), c[0], c[1], c[2], 0.92, DASH + rng.integers(0, 8), 3.0 + BRP + 0.003 + 0.0005 * k))
    arc(RAIL * 0.52, 4.5, dk_md, 60, 0.85, 0.004, 46)   # middle rail
    arc(RAIL - 9, 11, dk_md, 76, z=0.005)                # handrail
    arc(RAIL + 1, 6.5, dk_lt, 70, z=0.006)
    A = np.array(acc, np.float32)
    n = len(A)
    return Set('bridge', _bridge, A[:, 0], A[:, 1], BRP, cam=(2600, 10600), margin=300, L=A[:, 2], W=A[:, 3],
               ang=A[:, 4], col=A[:, 5:8], a=A[:, 8], spr=A[:, 9].astype(np.int32), zo=A[:, 10], rnd=rnd_fields(rng, n))


# ------------------------------------------------------------------ lily pads
PAD = pal((82, 156, 116), (104, 172, 112), (66, 140, 128), (124, 184, 118), (92, 160, 142), (72, 136, 104))
PAD_L = pal((150, 198, 132), (176, 212, 140), (130, 186, 150), (198, 220, 150))
PAD_S = pal((36, 86, 92), (44, 96, 84), (52, 80, 112))
PETAL = [pal((252, 240, 244), (246, 214, 226), (236, 172, 196)),          # white flushed with pink
         pal((244, 170, 196), (228, 120, 160), (206, 86, 134)),            # rose
         pal((252, 244, 214), (248, 226, 150), (238, 198, 100)),           # cream yellow
         pal((250, 226, 236), (240, 190, 214), (222, 146, 186))]


def _pads(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    k = np.clip(env.Hc * p / FOC, 0.10, 0.62)                 # foreshortening of the water plane
    bob = np.sin(t * 1.1 + g['ph'] + X * 0.004)
    x = sx + g['ox'] * sc + 2.0 * bob * sc
    y = sy + g['oy'] * sc * k + 1.6 * bob * sc
    dap = noise(X / 520.0 + t * 0.035, 1.0 / np.maximum(p, 0.05) * 1.5 - t * 0.02, 3)
    rgb = g['col'] * (0.80 + 0.46 * dap[:, None])
    rgb = jitter(rgb, rnd, 0.04, 0.02)
    return Batch(x, y, g['ang'], g['L'] * sc, np.maximum(g['W'] * sc * (0.06 + k), 2.2), g['spr'], rgb,
                 0.95 * pond_vis(env, rnd[:, 2], p), g['zo'])


def _blossoms(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    # buds open as they come into view, a wave of blooming just ahead of the camera
    op = smooth(1720.0, 1180.0, sx + g['fr'] * 260.0)
    op = op * (0.93 + 0.07 * np.sin(t * 0.9 + g['ph']))
    k = np.clip(env.Hc * p / FOC, 0.16, 0.62)
    bob = np.sin(t * 1.1 + g['ph'] + X * 0.004)
    spread = 0.22 + 0.78 * op
    x = sx + g['ox'] * sc * spread + 2.0 * bob * sc
    y = sy + (g['oy'] * (0.45 + 0.55 * op) - g['lift'] * (0.3 + 0.7 * op)) * sc + 1.6 * bob * sc
    ang = mix(1.5708, g['ang'], 0.25 + 0.75 * op)
    glow = 0.92 + 0.14 * noise(X / 520.0 + t * 0.035, 1.0 / np.maximum(p, 0.05) * 1.5 - t * 0.02, 3)
    rgb = jitter(g['col'] * glow[:, None], rnd, 0.03, 0.015)
    s = 0.42 + 0.58 * op
    return Batch(x, y, ang, g['L'] * sc * s, g['W'] * sc * s, g['spr'], rgb, 0.96 * pond_vis(env, g['fr'], p), g['zo'])


def lilies(rng, X0, X1):
    P = {k: [] for k in 'X p ox oy L W ang col spr zo ph'.split()}
    Bl = {k: [] for k in 'X p ox oy L W ang col spr zo ph fr lift'.split()}
    islands = []
    # islands lie in bands across the pond, fewer and larger toward the viewer
    for Z0, Z1, gap in [(2.6, 3.1, 520), (2.0, 2.5, 600), (1.5, 1.9, 700), (1.12, 1.4, 820), (0.84, 1.03, 900), (0.60, 0.76, 1050)]:
        x = X0 + rng.uniform(0, gap)
        while x < X1:
            rxw = rng.uniform(260, 620) * (1.2 if Z0 < 1 else 1.0)
            islands.append((x, rng.uniform(Z0, Z1), rxw, rng.uniform(0.05, 0.11) * (Z0 + Z1) / 2))
            x += rxw + rng.uniform(0.4, 1.3) * gap
    for (cx, cz, rx, rz) in islands:
        dens = smooth(X0 - 100, X0 + 900, cx)                  # the first pads drift in sparsely
        npad = int(rx * rz * 0.40 * (0.25 + 0.75 * dens)) + 4
        kind = int(rng.integers(0, 4))
        for i in range(npad):
            a = rng.random() * 6.283
            r = rng.random() ** 0.75
            X = cx + r * np.cos(a) * rx
            Z = cz + r * np.sin(a) * rz
            p = 1.0 / Z
            if p > 2.4 or p < 0.33:
                continue
            rad = rng.uniform(30, 50)
            ph = rng.uniform(0, 6.28)
            zo = 3.0 + p
            base = PAD[rng.integers(0, len(PAD))]
            near = p > 0.62
            parts = [(0.0, 0.16, 2.1, 1.7, PAD_S[rng.integers(0, len(PAD_S))], 0.0, DAB)]
            nb = 5 if near else 2
            for j in range(nb):
                aa = rng.random() * 6.283
                r2 = np.sqrt(rng.random()) * 0.5
                c = base * rng.uniform(0.86, 1.14) if rng.random() < 0.75 else PAD[rng.integers(0, len(PAD))]
                parts.append((r2 * np.cos(aa), r2 * np.sin(aa) - 0.05, rng.uniform(1.0, 1.5), rng.uniform(0.62, 0.9), c, 1e-4, DASH))
            if rng.random() < 0.75:
                lc = PAD_L[rng.integers(0, len(PAD_L))] if rng.random() < 0.7 else np.array([0.74, 0.78, 0.92], np.float32)
                parts.append((-0.22 + rng.normal(0, 0.1), -0.34, rng.uniform(0.9, 1.3), 0.42, lc, 2e-4, DASH))
            for (dx, dy, sL, sW, c, dz, sp) in parts:
                P['X'].append(X); P['p'].append(p); P['ox'].append(dx * rad); P['oy'].append(dy * rad * 2)
                P['L'].append(rad * sL); P['W'].append(rad * sW); P['ang'].append(rng.normal(0, 0.10))
                P['col'].append(c); P['spr'].append(sp + rng.integers(0, 4)); P['zo'].append(zo + dz); P['ph'].append(ph)
            if rng.random() < 0.20 and p > 0.36:
                pk = PETAL[kind if rng.random() < 0.7 else int(rng.integers(0, 4))]
                if pk is PETAL[2] and rng.random() < 0.6:
                    pk = PETAL[0]
                fr = rng.random()
                bs = rad * rng.uniform(0.62, 0.9)
                # back petals stand, side petals lean out, front petals cup the centre
                petals = [(-0.55, -0.10, -1.0, 2, 0.0), (0.55, -0.10, 1.0, 2, 0.0), (0, -0.30, 1.5708, 1, 1e-5),
                          (-0.28, -0.26, 2.2, 1, 2e-5), (0.28, -0.26, 0.94, 1, 2e-5),
                          (-0.34, 0.05, -0.5, 0, 3e-5), (0.34, 0.05, 0.5, 0, 3e-5), (0, 0.12, 0.0, 0, 4e-5)]
                for (dx, dy, an, ci, dz) in petals:
                    Bl['X'].append(X); Bl['p'].append(p); Bl['ox'].append(dx * bs); Bl['oy'].append(dy * bs)
                    Bl['L'].append(bs * 0.86); Bl['W'].append(bs * 0.44); Bl['ang'].append(an + rng.normal(0, 0.12))
                    Bl['col'].append(pk[ci]); Bl['spr'].append((LENS if ci else DAB) + rng.integers(0, 4))
                    Bl['zo'].append(zo + 3e-4 + dz); Bl['ph'].append(ph); Bl['fr'].append(fr); Bl['lift'].append(bs * 0.30)
                Bl['X'].append(X); Bl['p'].append(p); Bl['ox'].append(0.0); Bl['oy'].append(-0.06 * bs)
                Bl['L'].append(bs * 0.36); Bl['W'].append(bs * 0.26); Bl['ang'].append(0.0)
                Bl['col'].append(C(250, 206, 84)); Bl['spr'].append(DAB); Bl['zo'].append(zo + 3.5e-4)
                Bl['ph'].append(ph); Bl['fr'].append(fr); Bl['lift'].append(bs * 0.30)
    out = []
    for D, sh, nm in ((P, _pads, 'pads'), (Bl, _blossoms, 'blossoms')):
        A = {k: np.array(v, np.float32) for k, v in D.items()}
        o = np.argsort(A['zo'], kind='stable')
        A = {k: v[o] for k, v in A.items()}
        n = len(A['X'])
        extra = {k: A[k] for k in A if k not in ('X', 'p', 'spr')}
        out.append(Set(nm, sh, A['X'], np.zeros(n), A['p'], cam=(X0 - 2500, X1 + 2500), margin=200,
                       spr=A['spr'].astype(np.int32), rnd=rnd_fields(rng, n), **extra))
    return out


# ------------------------------------------------------------------ irises and reeds in the foreground
def _reeds(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    wind = env.wind(g['rx'], p)
    s = g['s']
    dx = (10 + 60 * wind) * s ** 1.6 * np.sin(t * 1.5 + g['ph'] - s * 1.2) + 40 * wind * s ** 1.5
    dap = noise(X / 500.0 + t * 0.06, 0.2, 3)
    rgb = g['col'] * (0.85 + 0.3 * dap[:, None])
    return Batch(sx + dx * sc, sy, g['ang'] + dx * 0.0016, g['L'] * sc, g['W'] * sc, g['spr'], rgb, 0.96, g['zo'])


LEAF = pal((52, 112, 84), (70, 136, 92), (40, 92, 86), (96, 156, 96), (130, 178, 104), (44, 80, 104))
IRIS = pal((104, 84, 190), (132, 108, 214), (84, 70, 168), (170, 150, 232), (120, 90, 200))


def reeds(rng, clumps, name, cam, leaf=LEAF, flower=IRIS, wpx=20.0):
    acc = []
    for (cx, p, hgt, w, nblade, nflow) in clumps:
        for i in range(nblade):
            x0 = cx + rng.normal(0, w)
            lean = rng.normal(0, 0.16)
            h = hgt * rng.uniform(0.55, 1.0)
            ph = rng.uniform(0, 6.28)
            c = leaf[rng.integers(0, len(leaf))] * rng.uniform(0.9, 1.1)
            m = 4
            for j in range(m):
                s = (j + 0.5) / m
                acc.append((x0 + lean * h * s, -h * s + 30, h / m * 1.5, (wpx - 0.45 * wpx * s) / p, 1.5708 + lean, c[0], c[1], c[2],
                            LENS + rng.integers(0, 4), 3.0 + p + 1e-4 * i, s, x0, ph))
            if i < nflow:
                c2 = flower[rng.integers(0, len(flower))]
                tx, ty = x0 + lean * h, -h + 30
                for (dx, dy, an, sz, sh) in [(-0.55, 0.25, -0.9, 0.8, 0.8), (0.55, 0.25, 0.9, 0.8, 0.8), (0, -0.45, 1.5708, 0.9, 1.15),
                                             (-0.25, -0.2, 2.2, 0.6, 1.0), (0.25, -0.2, 0.94, 0.6, 1.0), (0, 0.4, 1.5708, 0.7, 0.75)]:
                    cc = flower[rng.integers(0, len(flower))] * sh
                    acc.append((tx + dx * 30 / p, ty + dy * 30 / p, 40 * sz / p, 17 * sz / p, an + rng.normal(0, 0.15), cc[0], cc[1], cc[2],
                                LENS + rng.integers(0, 4), 3.0 + p + 1e-4 * i + 5e-5, 1.0, x0, ph))
                acc.append((tx, ty + 8 / p, 12 / p, 8 / p, 0.0, 0.98, 0.84, 0.36, DAB, 3.0 + p + 1e-4 * i + 6e-5, 1.0, x0, ph))
    A = np.array(acc, np.float32)
    o = np.argsort(A[:, 9], kind='stable')
    A = A[o]
    n = len(A)
    pp = (A[:, 9] - 3.0)
    return Set(name, _reeds, A[:, 0], A[:, 1], np.round(pp, 2), cam=cam, margin=500, L=A[:, 2], W=A[:, 3], ang=A[:, 4],
               col=A[:, 5:8], spr=A[:, 8].astype(np.int32), zo=A[:, 9], s=A[:, 10], rx=A[:, 11], ph=A[:, 12],
               rnd=rnd_fields(rng, n))


# ------------------------------------------------------------------ living things
def make_koi(rng, n=8):
    ph = rng.random((n, 8)).astype(np.float32)
    patt = [pal((238, 112, 44), (246, 236, 224), (232, 84, 40)), pal((246, 238, 226), (238, 120, 50), (250, 244, 236)),
            pal((240, 150, 50), (244, 170, 70), (236, 120, 44)), pal((232, 90, 46), (246, 238, 226), (60, 56, 70))]
    m = 9
    q = (np.arange(m) + 0.5) / m                                  # head -> tail
    wid = np.array([15, 21, 24, 23, 20, 16, 11, 14, 19], np.float32)
    lens = np.array([40, 46, 48, 48, 46, 42, 38, 36, 34], np.float32)

    def actor(env):
        if not (0.45 < env.d < 1.55):
            return None
        t = env.t
        out = []
        for i in range(n):
            t0 = 20.0 + 21.0 * ph[i, 0]
            dirn = 1.0 if ph[i, 1] < 0.75 else -1.0
            tt = t - t0
            ox = dirn * (-1300 + 190 * (tt + 3.0)) + 90 * np.sin(tt * 0.5 + i)
            if abs(ox) > 1600:
                continue
            Z = 0.66 + 0.5 * ph[i, 2] + 0.06 * np.sin(tt * 0.45 + 2 * i)
            turn = 0.20 * np.cos(tt * 0.45 + 2 * i)              # gentle heading change
            # spine: straight behind the head with a travelling tail wave across it
            wag = np.sin(t * 4.2 + i * 1.7 - q * 3.6) * (2 + 20 * q ** 1.7)
            along = -dirn * q * 168
            X = env.camX + ox + along
            Zs = Z + (along * np.sin(turn) + wag) / 620.0
            p = 1.0 / Zs
            sx, sy, sc = env.project(X, np.zeros(m), p)
            k = np.clip(env.Hc * p / FOC, 0.2, 0.6)
            dwag = np.cos(t * 4.2 + i * 1.7 - q * 3.6) * (0.10 + 0.5 * q)
            ang = -dirn * (turn * 0.6 + dwag * 0.5) * (0.5 + k)
            ci = (np.array([0, 0, 1, 1, 0, 2, 0, 1, 1]) + i) % 3
            col = patt[i % 4][ci] * (0.9 + 0.2 * ph[i, 4])
            col = mix(col, C(60, 118, 104), 0.20 + 0.14 * np.sin(t * 0.7 + i) ** 2)
            size = 0.85 + 0.4 * ph[i, 3]
            spr = np.where(np.arange(m) >= 7, LENS, DASH) + (np.arange(m) + i) % 4
            out.append(Batch(sx, sy, ang, lens * sc * size, wid * sc * size * (0.35 + k), spr, col, 0.80,
                             np.float32(2.92) + 0 * q))
            # a pale ring where the fish stirs the surface
            rip = 0.5 + 0.5 * np.sin(t * 1.3 + i)
            out.append(Batch(sx[[1, 1]] + np.array([-30, 34]) * sc[1], sy[[1, 1]] + np.array([-9, 9]) * sc[1] * k[1],
                             0.0, 70 * sc[1], 5 * sc[1], DASH, C(226, 226, 244), 0.28 * rip, np.float32(2.93)))
        return out
    return actor


def make_dragonflies(rng, n=5):
    seeds = rng.integers(0, 10000, n)
    bodies = pal((40, 150, 210), (220, 70, 60), (60, 190, 170), (70, 110, 220), (236, 150, 50))

    def way(i, k):
        r = np.random.default_rng(int(seeds[i]) * 1000 + int(k))
        return np.array([r.uniform(-800, 800), r.uniform(-330, -90)])

    def actor(env):
        if not (0.4 < env.d < 1.7):
            return None
        t = env.t
        out = []
        for i in range(n):
            per = 1.5 + 0.3 * i
            k = np.floor(t / per)
            f = smooth(0.0, 0.32, t / per - k)
            a, b = way(i, k), way(i, k + 1)
            pos = a + (b - a) * float(f)
            pos = pos + np.array([7 * np.sin(t * 9 + i), 5 * np.sin(t * 7.3 + 2 * i)])
            p = 0.9 + 0.12 * i
            d = b - a
            hd = np.arctan2(d[1], d[0]) if float(f) < 1 else (0.0 if d[0] > 0 else 3.1416)
            sx, sy, sc = env.project(env.camX + pos[0] + 210 * i - 400, pos[1], p)
            c, s = np.cos(hd), np.sin(hd)
            xs = [sx - 12 * c * sc, sx + 13 * c * sc]
            ys = [sy - 12 * s * sc, sy + 13 * s * sc]
            an = [hd, hd]; L = [34 * sc, 16 * sc]; W = [6 * sc, 9 * sc]
            cols = [bodies[i % 5], bodies[i % 5] * 0.8]
            al = [0.95, 0.95]
            fl = np.sin(t * 60 + i)
            for sgn in (-1, 1):
                for j, back in enumerate((0.0, -9.0)):
                    wa = hd + sgn * (1.25 + 0.3 * fl * (1 if j == 0 else -1)) + 0.25 * j * sgn
                    xs.append(sx + (back * c + 18 * np.cos(wa)) * sc); ys.append(sy + (back * s + 18 * np.sin(wa)) * sc)
                    an.append(wa); L.append(38 * sc); W.append(9 * sc)
                    cols.append(C(240, 246, 250)); al.append(0.42)
            out.append(Batch(np.array(xs), np.array(ys), np.array(an), np.array(L), np.array(W),
                             np.array([DASH, DAB] + [LENS] * 4), np.array(cols), np.array(al), np.float32(3.0 + p)))
        return out
    return actor


def build(rng):
    sets = _tree_wall(rng)
    cam = (2600, 10400)
    sets.append(willow(rng, 4700, 0.36, 1500, 620, 110, 'willow1', cam))
    sets.append(willow(rng, 6150, 0.40, 1380, 560, 110, 'willow2', cam))
    sets.append(willow(rng, 9050, 0.38, 1500, 640, 120, 'willow3', cam))
    sets.append(bridge(rng))
    # rounded shrubs swallow both ends of the bridge
    sh = []
    for cx in (BRX - BRA - 120, BRX - BRA + 220, BRX + BRA - 220, BRX + BRA + 140):
        for k in range(3):
            sh.append((cx + rng.normal(0, 150), -rng.uniform(120, 420), rng.uniform(240, 380), rng.uniform(180, 280), BRP + 0.012, 30))
    sets.append(crowns(rng, sh, 'shrubs', None, cam, 0.8))
    sets += lilies(rng, 3900.0, 9000.0)
    # near bank: irises slide past in front of everything
    cl = []
    for cx, w in [(4850, 150), (5050, 110), (6500, 170), (6740, 120), (8050, 180), (8300, 130), (8650, 200), (8900, 160)]:
        cl.append((cx, 2.05 + rng.uniform(-0.15, 0.25), rng.uniform(190, 250), w * 0.5, 34, 7))
    sets.append(reeds(rng, cl, 'irises', (3300, 10200)))
    # willow fronds hanging into the top of the frame, close to the lens
    sets.append(willow(rng, 5500, 1.45, 430, 460, 30, 'frondA', (3800, 7600), hang_from=-850, wpx=12))
    sets.append(willow(rng, 8450, 1.55, 400, 520, 32, 'frondB', (6600, 9900), hang_from=-810, wpx=12))
    actors = [make_koi(rng), make_dragonflies(rng)]
    return sets, actors
