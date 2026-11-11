"""Scenes 3 and 4 share one field: a windy poppy meadow at noon that ripens into
a mown field with haystacks under the evening sun."""
import numpy as np
from engine import Batch, smooth, mix, noise, ramp, C, pal, pick, jitter, DASH, DAB, SCUM, LENS
from world import Set, ground_rows, rnd_fields, scene_coord, scene_of, window, B2, B3, B4
from sky import sun_evening, PS
from s2 import crowns, pond_vis, reeds, lit_pick, FOC

MEADOW = [(0.0, (70, 124, 92)), (0.25, (104, 156, 76)), (0.5, (140, 180, 78)), (0.75, (176, 198, 92)), (1.0, (218, 212, 124))]
STUBBLE = [(0.0, (170, 128, 150)), (0.25, (224, 150, 108)), (0.5, (242, 182, 116)), (0.75, (250, 208, 130)), (1.0, (255, 230, 160))]

# haystacks: X, depth, radius, body height, cone height
STACKS = [(15250.0, 0.80, 250.0, 215.0, 235.0), (15050.0, 0.50, 230.0, 200.0, 220.0), (16150.0, 0.33, 220.0, 190.0, 210.0)]


def shore_in(u, Z):
    nz = noise(Z * 1.1, 0.7, 3)
    return smooth(B2 - 420.0 + 380.0 * nz, B2 - 260.0 + 380.0 * nz, u)


def shore_out(u, Z):
    nz = noise(Z * 1.1 + 5.0, 0.2, 3)
    return 1.0 - smooth(B4 - 260.0 + 380.0 * nz, B4 - 60.0 + 380.0 * nz, u)


def stack_shadow(X, Z):
    """Long evening shadows thrown toward the viewer and to the left."""
    out = np.zeros(len(X), np.float32)
    for (xh, ph, R, hb, hc) in STACKS:
        zh = 1.0 / ph
        dz = (zh - Z) * FOC                      # world distance in front of the stack
        s = dz / 1500.0
        cx = xh - dz * 0.62
        wdt = R * (1.0 - 0.45 * np.clip(s, 0, 1))
        m = smooth(1.05, 0.75, s) * smooth(-0.06, 0.02, s) * smooth(wdt * 1.15, wdt * 0.7, np.abs(X - cx))
        out = np.maximum(out, m)
    return out


def _field(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    lvl = g['lvl']
    u = scene_coord(X, p, env.camX)
    d = scene_of(u)
    w = np.clip(d - 2.0, 0.0, 1.0)
    Z = 1.0 / np.maximum(p, 0.03)
    a = g['a'] * shore_in(u, Z) * shore_out(u, Z)
    wind = env.wind(X, p)
    v = 0.62 * noise(X / 1200.0, Z * 0.7, 0) + 0.38 * noise(X / 330.0 + 3.0, Z * 2.0, 1)
    # ---- meadow at noon
    vv = np.clip(v + (rnd[:, 0] - 0.5) * 0.5 + 0.16 * wind - 0.08, 0, 1)
    c0 = ramp(MEADOW, vv)
    cs = smooth(0.50, 0.72, noise((X - t * 46.0) / 2400.0, Z * 0.32 + t * 0.004, 2))
    c0 = mix(c0, c0 * np.array([0.60, 0.74, 0.88], np.float32), 0.75 * cs)
    c0 = mix(c0, C(176, 204, 196), 0.55 * smooth(0.30, 0.03, p))
    c0 = mix(c0, C(96, 120, 190), 0.5 * (rnd[:, 3] > 0.94) * (1 - vv))          # blue shadow flecks
    # ---- stubble in evening light
    row = noise(X / 2600.0 + 1.0, Z * 3.2, 2)
    v2 = np.clip(0.40 * v + 0.60 * row + (rnd[:, 0] - 0.5) * 0.42 + 0.06, 0, 1)
    c1 = ramp(STUBBLE, v2)
    c1 = mix(c1, C(150, 168, 104), 0.5 * (rnd[:, 3] < 0.10))
    sx0, sy0 = sun_evening(env)
    glow = np.exp(-((sx - 960.0 - sx0) / 620.0) ** 2) * smooth(0.5, 0.03, p)
    c1 = c1 + glow[:, None] * np.array([0.10, 0.07, -0.02], np.float32)
    sh = stack_shadow(X, Z)
    shc = pick(pal((116, 100, 172), (138, 104, 160), (92, 96, 168), (150, 118, 150)), rnd[:, 1])
    c1 = mix(c1, shc, 0.86 * smooth(rnd[:, 2] * 0.5, rnd[:, 2] * 0.5 + 0.5, sh))
    c1 = mix(c1, C(196, 164, 196), 0.45 * smooth(0.30, 0.03, p))
    rgb = jitter(mix(c0, c1, w), rnd, 0.05, 0.025)
    # ---- stroke direction: grass leans with the gusts, stubble lies in rows
    gust = np.sin(t * (2.0 + rnd[:, 2]) + rnd[:, 3] * 6.28)
    blade = -1.5708 + 0.20 + 0.75 * wind + 0.16 * gust * (0.3 + wind) + (rnd[:, 1] - 0.5) * 0.5
    flat_ = (rnd[:, 1] - 0.5) * 0.30
    ang0 = flat_ if lvl < 0.5 else blade
    ang1 = flat_ - 0.10 if lvl < 1.5 else np.where(rnd[:, 0] < 0.3, blade, flat_ * 1.6 - 0.1)
    ang = np.where(w > rnd[:, 2], ang1, ang0)
    x = sx + (lvl > 0.5) * (5.0 + 22.0 * wind) * (0.5 + 0.5 * gust) * sc * (1 - w)
    Wd = g['W'] * sc * (1.0 + (1.3 if lvl > 1.5 else 0.25) * w)
    return Batch(x, sy - (lvl > 0.5) * g['L'] * sc * 0.3 * (1 - w), ang, g['L'] * sc, Wd, g['spr'], rgb, a,
                 g['zo'] + p * 0.1)


def _flowers(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    wind = env.wind(g['rx'], p)
    s = g['s']
    sway = np.sin(t * 2.1 + g['ph'])
    dx = ((5.0 + 22.0 * wind) * sway + 40.0 * wind) * s ** 1.4
    u = scene_coord(g['rx'], p, env.camX)
    Z = 1.0 / np.maximum(p, 0.03)
    cs = smooth(0.50, 0.72, noise((g['rx'] - t * 46.0) / 2400.0, Z * 0.32 + t * 0.004, 2))
    rgb = g['col'] * (1.0 - 0.24 * cs[:, None])
    rgb = jitter(rgb, rnd, 0.05, 0.02)
    a = 0.95 * shore_in(u, Z) * pond_vis(env, rnd[:, 2], p, 2.0)
    return Batch(sx + (g['ox'] + dx) * sc, sy + (g['oy'] + 0.25 * np.abs(dx)) * sc, g['ang'] + 0.004 * dx, g['L'] * sc,
                 g['W'] * sc, g['spr'], rgb, a, g['zo'])


RED = pal((232, 58, 38), (214, 40, 36), (246, 88, 54), (226, 52, 60), (250, 110, 70), (196, 30, 40))


def poppies(rng):
    acc = []
    X, p, L, W = ground_rows(rng, B2 - 300.0, B3 + 700.0, 0.06, 2.9, 64.0, 2.0, cover=0.62, cover_y=0.9, size_pow=0.5)
    Z = 1.0 / p
    m = 0.6 * noise(X / 1000.0 + 2.0, Z * 0.8, 1) + 0.4 * noise(X / 300.0, Z * 2.4, 2)
    fade = 1.0 - smooth(B3 - 900.0, B3 + 500.0, X)
    keep = rng.random(len(X)) < smooth(0.40, 0.62, m) * 0.95 * fade + 0.02 * fade
    X, p = X[keep], p[keep]
    for i in range(len(X)):
        x, pp = X[i], p[i]
        size = rng.uniform(30, 46) * (pp ** -0.38 if pp < 1 else 1.0)          # far poppies stay visible as dabs
        hgt = rng.uniform(55, 110)
        c = RED[rng.integers(0, len(RED))]
        ph = rng.uniform(0, 6.28)
        zo = 3.0 + pp
        if pp > 1.3 and rng.random() < 0.5:
            st = pick(pal((84, 140, 70), (110, 160, 80), (66, 120, 80)), rng.random(1))[0]
            acc.append((x, -hgt * 0.5, 0, 0, hgt, 5.0, 1.5708 + rng.normal(0, 0.1), *st, LENS, zo, 0.5, x, ph))
        if pp < 0.5:
            acc.append((x, -hgt, 0, 0, size * 1.15, size * 0.62, rng.normal(0, 0.3), *c, DAB + rng.integers(0, 4), zo, 1.0, x, ph))
        else:
            tilt = rng.normal(0, 0.4)
            acc.append((x, -hgt, 0, 0.06 * size, size * 1.08, size * 0.74, tilt, *(c * 0.88), DAB + rng.integers(0, 4), zo + 1e-5, 1.0, x, ph))
            acc.append((x, -hgt, rng.normal(0, 0.1) * size, -0.16 * size, size * 0.8, size * 0.42, tilt + rng.normal(0, 0.3),
                        *np.minimum(c * 1.14 + 0.03, 1.0), DAB + rng.integers(0, 4), zo + 2e-5, 1.0, x, ph))
    # the small flowers that fill a meadow: daisies, buttercups, cornflowers
    X2, p2, L, W = ground_rows(rng, B2 - 300.0, B3 + 900.0, 0.12, 2.9, 44.0, 2.0, cover=0.7, cover_y=1.0, size_pow=0.5)
    keep = rng.random(len(X2)) < 0.42 * (1.0 - smooth(B3 - 600.0, B3 + 700.0, X2))
    X2, p2 = X2[keep], p2[keep]
    small = pal((250, 248, 236), (248, 222, 92), (252, 236, 150), (112, 126, 214), (236, 200, 226), (250, 250, 250))
    for i in range(len(X2)):
        c = small[rng.integers(0, len(small))]
        sz = rng.uniform(11, 20) * (p2[i] ** -0.3 if p2[i] < 1 else 1.0)
        acc.append((X2[i], -rng.uniform(30, 80), 0, 0, sz, sz * 0.7, rng.uniform(0, 3.14), *c, DAB + rng.integers(0, 4),
                    3.0 + p2[i] + 3e-5, 1.0, X2[i], rng.uniform(0, 6.28)))
    A = np.array(acc, np.float32)
    A = A[np.argsort(A[:, 11], kind='stable')]
    n = len(A)
    return Set('poppies', _flowers, A[:, 0], A[:, 1], A[:, 11] - 3.0, cam=(B2 - 2600, B3 + 2800), margin=200,
               ox=A[:, 2], oy=A[:, 3], L=A[:, 4], W=A[:, 5], ang=A[:, 6], col=A[:, 7:10], spr=A[:, 10].astype(np.int32),
               zo=A[:, 11], s=A[:, 12], rx=A[:, 13], ph=A[:, 14], rnd=rnd_fields(rng, n))


# ------------------------------------------------------------------ distant land
def _static(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    a = g['a'] * pond_vis(env, rnd[:, 2], p, g['k'])
    rgb = jitter(g['col'], rnd, 0.03, 0.012)
    return Batch(sx, sy, g['ang'], g['L'] * sc, g['W'] * sc, g['spr'], rgb, a, g['zo'])


def ridge(rng, name, p, X0, X1, hfun, colfun, k, lpx=60.0, wpx=22.0, cam=(-1e9, 1e9), zo=None, dens=1.0):
    """A band of land under a height profile, painted in mostly level strokes."""
    hmax = float(np.max(hfun(np.linspace(X0, X1, 2000))))
    n = int(dens * (X1 - X0) * hmax * p * p / (lpx * wpx * 0.22)) + 10
    X = rng.uniform(X0, X1, n)
    h = hfun(X)
    f = rng.random(n)
    Y = -f * h
    keep = h > 2.0
    X, Y, f, h = X[keep], Y[keep], f[keep], h[keep]
    n = len(X)
    rr = rnd_fields(rng, n)
    col = colfun(X, f, rr)
    return Set(name, _static, X, Y, p, cam=cam, margin=300, L=rng.uniform(0.7, 1.3, n) * lpx / p,
               W=rng.uniform(0.7, 1.3, n) * wpx / p, ang=rng.normal(0, 0.16, n), col=col, a=0.9, k=k,
               spr=np.where(rng.random(n) < 0.3, SCUM + rng.integers(0, 4, n), DASH + rng.integers(0, 8, n)).astype(np.int32),
               zo=np.float32(3.0 + p if zo is None else zo), rnd=rr)


def _backdrop_noon(rng):
    sets = []
    cam = (B2 - 2200, B3 + 2200)
    X0, X1 = B2 - 2200 - 960 / 0.05, B3 + 2200 + 960 / 0.05
    sets.append(ridge(rng, 'hillsN', 0.05, X0, X1,
                      lambda X: 1500 + 1700 * noise(X / 24000.0, 0.3, 1) + 500 * noise(X / 6000.0, 0.9, 2),
                      lambda X, f, rr: mix(mix(C(132, 168, 204), C(160, 190, 206), f), C(150, 186, 150), 0.25 * rr[:, 1:2]),
                      2.0, 90, 34, cam))
    # a line of trees with a red-roofed house, as on the edge of Argenteuil
    P = 0.15
    X0, X1 = B2 - 2200 - 1000 / P, B3 + 2200 + 1000 / P
    sp = []
    x = X0
    while x < X1:
        big = rng.random() < 0.3
        sp.append((x, -rng.uniform(140, 300) * (1.7 if big else 1.0), rng.uniform(170, 330), rng.uniform(150, 260) * (1.5 if big else 1.0), P, 22))
        x += rng.uniform(120, 420)
    sets.append(crowns(rng, sp, 'treelineN', (C(120, 160, 170), 0.30), cam, 0.5, k=2.0))
    acc = []
    for hx in (11050.0,):
        hx0 = hx + (hx - 11200.0) / P * 0.0
        for i in range(60):                                   # cream walls
            acc.append((hx0 + rng.uniform(-230, 230), -rng.uniform(0, 210), 150, 70, rng.normal(0, 0.05), *(C(238, 228, 204) * rng.uniform(0.9, 1.05)), DASH + rng.integers(0, 8), 3.0 + P + 0.001))
        for i in range(46):                                   # roof
            q = rng.uniform(-1, 1)
            acc.append((hx0 + q * 280, -215 - (1 - abs(q)) * 150 * rng.random() ** 0.6, 150, 60, -np.sign(q) * 0.42 + rng.normal(0, 0.05), *(C(206, 96, 72) * rng.uniform(0.85, 1.1)), DASH + rng.integers(0, 8), 3.0 + P + 0.002))
        acc.append((hx0 - 70, -120, 44, 110, 1.5708, *C(120, 132, 168), DASH, 3.0 + P + 0.003))
    A = np.array(acc, np.float32)
    sets.append(Set('house', _static, A[:, 0], A[:, 1], P, cam=cam, margin=300, L=A[:, 2], W=A[:, 3], ang=A[:, 4],
                    col=A[:, 5:8], spr=A[:, 8].astype(np.int32), zo=A[:, 9], a=0.92, k=2.0, rnd=rnd_fields(rng, len(A))))
    return sets


def _backdrop_evening(rng):
    sets = []
    cam = (B3 - 2200, B4 + 2200)
    X0, X1 = B3 - 2200 - 960 / 0.05, B4 + 2200 + 960 / 0.05
    sets.append(ridge(rng, 'hillsE', 0.05, X0, X1,
                      lambda X: 1300 + 2100 * noise(X / 26000.0, 3.3, 1) + 500 * noise(X / 5000.0, 1.9, 2),
                      lambda X, f, rr: mix(mix(C(128, 124, 186), C(170, 140, 190), f), C(226, 160, 160), 0.3 * rr[:, 1:2]),
                      3.0, 90, 34, cam))
    # poplars: tall flames of foliage, lit from behind on the right
    P = 0.13
    X0, X1 = B3 - 2200 - 1000 / P, B4 + 2200 + 1000 / P
    sp = []
    x = X0
    while x < X1:
        if rng.random() < 0.72:
            h = rng.uniform(800, 1250)
            for j in range(7):
                q = (j + 0.5) / 7
                sp.append((x + rng.normal(0, 8), -h * q - 40, rng.uniform(70, 100) * (1.15 - 0.75 * abs(q - 0.35)), h / 7 * 0.95, P, 17))
            x += rng.uniform(170, 300)
        else:
            sp.append((x, -rng.uniform(140, 260), rng.uniform(220, 380), rng.uniform(150, 240), P, 22))
            x += rng.uniform(300, 700)
    ev = (pal((84, 86, 140), (100, 84, 132), (74, 98, 134)), pal((118, 104, 136), (134, 112, 128), (106, 118, 134)),
          pal((238, 150, 96), (250, 184, 110), (214, 130, 110)))
    sets.append(crowns(rng, sp, 'poplars', (C(190, 150, 180), 0.22), cam, 0.5, pals=ev, k=3.0, light=(-0.9, 0.35)))
    return sets


# ------------------------------------------------------------------ haystacks
def _stack(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    # the rim burns brighter and dimmer as thin cloud crosses the sun
    fl = 0.86 + 0.14 * np.sin(t * 0.9 + rnd[:, 0] * 2.0) + 0.06 * np.sin(t * 5.0 + rnd[:, 1] * 6.28) * g['rim']
    rgb = g['col'] * (1.0 + (fl[:, None] - 1.0) * (0.3 + 0.7 * g['rim'][:, None]))
    a = g['a'] * pond_vis(env, rnd[:, 2], p, 3.0)
    return Batch(sx, sy, g['ang'], g['L'] * sc, g['W'] * sc, g['spr'], rgb, a, g['zo'])


ST_SH = pal((128, 72, 98), (104, 72, 124), (152, 90, 92), (86, 80, 144), (172, 106, 92), (118, 86, 150), (140, 60, 80))
ST_RIM = pal((255, 172, 82), (255, 210, 122), (252, 142, 70), (255, 232, 160))


def haystacks(rng):
    acc = []
    cool = pal((84, 82, 150), (98, 78, 138), (74, 92, 150))
    warm = pal((150, 78, 92), (168, 92, 86), (134, 70, 104))
    hot = pal((214, 116, 78), (232, 138, 84), (198, 100, 84))
    for (xh, ph, R, hb, hc) in STACKS:
        zo = 3.0 + ph
        spx = 34.0 / ph
        n = int(R * (hb + hc) * ph * ph / 26.0)
        H = hb + hc

        def half_width(y):
            """Silhouette: a body that swells a little, shoulders, then a rounded cone."""
            v = np.clip(y / H, 0, 1)
            vb = hb / H
            body = 0.84 + 0.20 * np.clip(v / vb, 0, 1.2)                         # leans out toward the eave
            cone = 1.05 * np.clip(1 - np.clip(v - vb, 0, 1) / (1 - vb), 0, 1) ** 0.82
            k = 0.10                                                             # smooth minimum: a rounded shoulder
            hmix = np.clip(0.5 + 0.5 * (cone - body) / k, 0, 1)
            return R * (cone * (1 - hmix) + body * hmix - k * hmix * (1 - hmix))
        for i in range(n):
            y = H * rng.random() ** 1.15
            u = rng.uniform(-1, 1)
            hw = float(half_width(y)) * (1.0 + 0.05 * np.sin(y * 0.045 + xh) + rng.normal(0, 0.025))
            x = xh + u * hw
            top = y > hb
            vt = (y - hb) / hc if top else 0.0
            ang = 1.5708 - (u * (0.62 - 0.2 * vt) if top else -0.12 * u) + rng.normal(0, 0.10)
            # light comes from behind on the right: a cool shadow face that warms toward the lit edge
            f = np.clip((u + 1) / 2 + rng.normal(0, 0.10), 0, 1)
            c = mix(mix(cool[rng.integers(0, 3)], warm[rng.integers(0, 3)], smooth(0.1, 0.55, f)),
                    hot[rng.integers(0, 3)], smooth(0.6, 0.92, f))
            c = c * (0.92 + 0.14 * (y / H))                     # reflected sky light toward the top
            rim = float(smooth(0.84, 1.0, u + 0.14 * vt + rng.normal(0, 0.07))) * (0.45 + 0.55 * (y / H))
            if rng.random() < rim:
                c = ST_RIM[rng.integers(0, len(ST_RIM))]
            acc.append((x, -y, spx * rng.uniform(1.1, 1.8), spx * rng.uniform(0.34, 0.5), ang, c[0], c[1], c[2],
                        DASH + rng.integers(0, 8), zo + 1e-4 * rim, rim, 0.95))
        for i in range(int(n * 0.03)):                         # light spilling round the right-hand edge
            y = H * rng.random()
            hw = float(half_width(y))
            c = ST_RIM[rng.integers(0, len(ST_RIM))]
            acc.append((xh + hw + rng.normal(3, 5), -y, spx * 1.2, spx * 0.30, 1.5708 - (0.6 if y > hb else 0.0), c[0], c[1], c[2],
                        DASH + rng.integers(0, 8), zo + 2e-4, 1.0, 0.9))
        for i in range(int(R / 4)):                            # where it meets the ground
            c = pick(pal((108, 84, 150), (130, 92, 140), (90, 84, 150)), rng.random(1))[0]
            acc.append((xh + rng.uniform(-1.05, 0.9) * R, rng.uniform(-6, 14), spx * 2.0, spx * 0.5, rng.normal(0, 0.06), c[0], c[1], c[2],
                        DASH + rng.integers(0, 8), zo - 1e-4, 0.0, 0.85))
    A = np.array(acc, np.float32)
    A = A[np.argsort(A[:, 9], kind='stable')]
    n = len(A)
    return Set('stacks', _stack, A[:, 0], A[:, 1], np.round(A[:, 9] - 3.0, 2), cam=(B3 - 2500, B4 + 2500), margin=300,
               L=A[:, 2], W=A[:, 3], ang=A[:, 4], col=A[:, 5:8], spr=A[:, 8].astype(np.int32), zo=A[:, 9], rim=A[:, 10],
               a=A[:, 11], rnd=rnd_fields(rng, n))


# ------------------------------------------------------------------ living things
def make_butterflies(rng, n=11):
    ph = rng.random((n, 8)).astype(np.float32)
    cols = pal((252, 250, 240), (250, 226, 110), (190, 206, 250), (252, 250, 240), (250, 170, 90), (240, 236, 250))

    def actor(env):
        if not (1.25 < env.d < 2.9):
            return None
        t = env.t
        xs, ys, an, L, W, col, zo = [], [], [], [], [], [], []
        for i in range(n):
            p = 0.75 + 1.1 * ph[i, 0]
            ox = -900 + 1900 * ph[i, 1] + 240 * np.sin(t * 0.33 + 6 * ph[i, 2]) + 60 * np.sin(t * 1.3 + i)
            Y = -150 - 330 * ph[i, 3] + 70 * np.sin(t * 0.8 + 6 * ph[i, 4]) + 22 * np.sin(t * 3.1 + i)
            sx, sy, sc = env.project(env.camX + ox / p, Y, p)
            flap = np.sin(t * (11 + 5 * ph[i, 5]) + i)
            tilt = 0.5 * np.sin(t * 0.33 + 6 * ph[i, 2] + 1.5)
            size = 26 * sc
            for sgn in (-1, 1):
                a = tilt + sgn * (0.95 - 0.55 * flap)
                xs.append(sx + sgn * 0.42 * size * np.cos(a) * (0.55 + 0.45 * abs(flap)))
                ys.append(sy - 0.42 * size * abs(np.sin(a)) - 4 * flap * sc)
                an.append(-a * sgn + (0 if sgn > 0 else 0)); L.append(size); W.append(size * (0.42 + 0.3 * abs(flap)))
                col.append(cols[i % len(cols)] * (0.94 + 0.08 * sgn)); zo.append(3.0 + p)
        return Batch(np.array(xs), np.array(ys), np.array(an), np.array(L), np.array(W), DAB, np.array(col), 0.95,
                     np.array(zo, np.float32))
    return actor


def make_swallows(rng, n=34):
    ph = rng.random((n, 8)).astype(np.float32)

    def actor(env):
        if not (2.5 < env.d < 3.75):
            return None
        t = env.t
        tt = t - 66.0
        cx = -1300 + 190 * tt + 260 * np.sin(tt * 0.5)
        cy = -330 + 110 * np.sin(tt * 0.37 + 1.0) - 60 * np.cos(tt * 0.8)
        xs, ys, an, L, W = [], [], [], [], []
        for i in range(n):
            # the flock breathes: birds orbit the centre on their own ellipses
            ax = 260 + 240 * ph[i, 0]
            ay = 80 + 120 * ph[i, 1]
            w = 0.5 + 0.5 * ph[i, 2]
            x = 960 + cx + ax * np.sin(tt * w + 6.28 * ph[i, 3]) + 80 * np.sin(tt * 1.7 + i)
            y = env.hz + cy + ay * np.sin(tt * w * 1.3 + 6.28 * ph[i, 4])
            vx = 190 + ax * w * np.cos(tt * w + 6.28 * ph[i, 3])
            vy = ay * w * 1.3 * np.cos(tt * w * 1.3 + 6.28 * ph[i, 4])
            hd = np.arctan2(vy, vx)
            flap = 0.35 + 0.5 * np.sin(t * (9 + 4 * ph[i, 5]) + i)
            size = 15 + 13 * ph[i, 6]
            for sgn in (-1, 1):
                a = hd + sgn * (2.05 - flap * 0.7)
                xs.append(x + 0.42 * size * np.cos(a)); ys.append(y + 0.42 * size * np.sin(a))
                an.append(a); L.append(size); W.append(size * 0.24)
        m = len(xs)
        return Batch(np.array(xs), np.array(ys), np.array(an), np.array(L), np.array(W), LENS, C(66, 56, 96), 0.9,
                     np.float32(1.95))
    return actor


def make_figures(rng):
    """A woman with a parasol and a child, standing in the flowers (strokes in local units, y up = negative)."""
    P = []

    def add(x, y, L, W, ang, col, part=0, spr=DASH, z=0.0):
        P.append((x, y, L, W, ang, col[0], col[1], col[2], part, spr + rng.integers(0, 4), z))
    white, cream, shade, lilac = (253, 249, 240), (250, 238, 212), (158, 176, 228), (204, 204, 242)
    # skirt: a few broad masses, light on the windward side, blue-violet in the shadow
    for x, c, z in [(-50, white, 0.0), (-26, white, 1e-4), (-2, cream, 2e-4), (24, lilac, 3e-4), (50, shade, 4e-4)]:
        add(x, -104, 196, 50, 1.5708 - x / 50.0 * 0.20, c, 1, DAB, z)
    for i in range(9):                                         # folds
        u = rng.uniform(-1, 1)
        c = white if u < -0.2 else (lilac if u < 0.45 else shade)
        add(u * 58, -rng.uniform(50, 150), 110, 15, 1.5708 - u * 0.22, tuple(v * rng.uniform(0.93, 1.0) for v in c), 1, DASH, 6e-4)
    add(-60, -26, 80, 26, 0.1, (214, 232, 196), 1, DAB, 7e-4)  # green light thrown up from the grass
    add(-12, -232, 84, 44, 1.5708, white, 2, DAB, 1e-3)        # blouse
    add(14, -230, 78, 30, 1.5708, shade, 2, DAB, 1.1e-3)
    add(0, -196, 70, 15, 0.04, (88, 124, 196), 2, DASH, 1.2e-3)  # sash
    for k in range(5):                                         # scarf streaming downwind
        add(18 + 27 * k, -268 + 3 * k, 50, 15 - 1.6 * k, 0.1, (246, 246, 252), 3, DASH, 1.3e-3)
    add(8, -296, 38, 28, 0.2, (112, 84, 70), 4, DAB, 1.4e-3)   # hair
    add(-2, -288, 31, 29, 0.3, (240, 206, 178), 4, DAB, 1.5e-3)  # face
    add(0, -312, 92, 22, -0.05, (236, 208, 124), 4, DAB, 1.6e-3)  # straw hat
    add(2, -322, 46, 20, 0.0, (248, 230, 160), 4, DAB, 1.7e-3)
    add(26, -262, 66, 14, -0.6, white, 5, DASH, 1.25e-3)       # arm
    for k in range(4):                                         # parasol stick
        add(52 + 9 * k, -296 - 30 * k, 42, 5.5, -1.27, (126, 100, 80), 6, DASH, 1.26e-3)
    add(88, -420, 214, 62, 0.0, (92, 148, 108), 6, DAB, 2.0e-3)   # canopy seen from below: cool green shade
    add(46, -414, 110, 46, -0.35, (120, 172, 118), 6, DAB, 2.1e-3)
    add(134, -414, 110, 46, 0.35, (66, 118, 96), 6, DAB, 2.1e-3)
    for k in range(5):                                         # sunlit rim
        q = (k + 0.5) / 5 - 0.5
        add(88 + q * 206, -446 + 40 * q * q * 4 * 0.5, 62, 15, q * 0.8, (250, 252, 232) if q < 0.2 else (214, 232, 212), 6, DASH, 2.2e-3)
    # the child, a few steps behind
    for x, c, z in [(-214, white, 0.0), (-196, cream, 1e-4), (-178, shade, 2e-4)]:
        add(x, -72, 116, 34, 1.5708 - (x + 196) / 18.0 * 0.12, c, 7, DAB, z)
    add(-196, -150, 27, 25, 0.2, (240, 206, 178), 7, DAB, 1.5e-3)
    add(-196, -168, 70, 18, 0.0, (236, 208, 124), 7, DAB, 1.6e-3)
    add(-192, -162, 38, 8, 0.0, (214, 70, 60), 7, DASH, 1.7e-3)
    P = np.array(P, np.float32)
    rr = rng.random((len(P), 4)).astype(np.float32)
    X0, PZ = 11500.0, 0.72

    def actor(env):
        if abs(env.camX - 11600.0) > 3200:
            return None
        t = env.t
        wind = float(env.wind(np.array([X0]))[0])
        lx, ly, ang = P[:, 0].copy(), P[:, 1].copy(), P[:, 4].copy()
        part = P[:, 8]
        sk = (part == 1) | (part == 7)
        flut = np.sin(t * 3.2 + lx * 0.03 + rr[:, 0] * 1.0)
        lx = lx + sk * (4 + 14 * wind) * (0.6 + 0.4 * flut)
        ang = ang - sk * (0.05 + 0.16 * wind) * (0.6 + 0.4 * flut)
        sc_ = part == 3                                        # scarf: a travelling wave
        kx = (lx - 18) / 27.0
        ly = ly + sc_ * (9 + 12 * wind) * np.sin(t * 5.0 - kx * 1.3) * (0.3 + 0.25 * kx)
        ang = ang + sc_ * 0.5 * np.cos(t * 5.0 - kx * 1.3) * (0.3 + 0.2 * kx)
        par = part == 6                                        # parasol leans into the gusts
        tilt = 0.05 * np.sin(t * 0.8) + 0.10 * (wind - 0.5)
        px, py = 50.0, -286.0
        dx, dy = lx - px, ly - py
        lx = np.where(par, px + dx * np.cos(tilt) - dy * np.sin(tilt), lx)
        ly = np.where(par, py + dx * np.sin(tilt) + dy * np.cos(tilt), ly)
        ang = ang + par * tilt
        walk = 14.0 * (t - 46.0)                               # they wander slowly on
        sx, sy, sc = env.project(X0 + walk + lx, ly + 2.0 * np.sin(t * 2.0), PZ)
        Z = 1.0 / PZ
        cs = float(smooth(0.50, 0.72, noise(np.array([(X0 - t * 46.0) / 2400.0]), np.array([Z * 0.32 + t * 0.004]), 2))[0])
        rgb = jitter(P[:, 5:8] / 255.0 * (1 - 0.2 * cs), rr, 0.03, 0.012)
        a = 0.95 * float(pond_vis(env, np.array([0.3]), np.array([PZ]), 2.0)[0])
        return Batch(sx, sy, ang, P[:, 2] * sc, P[:, 3] * sc, P[:, 9].astype(np.int32), rgb, a,
                     np.float32(3.0 + PZ) + P[:, 10])
    return actor


def build(rng):
    sets = []
    for lvl, (bl, asp, a) in enumerate([(150.0, 2.8, 0.95), (64.0, 3.4, 0.93), (40.0, 4.6, 0.9)]):
        X, p, L, W = ground_rows(rng, B2 - 700.0, B4 + 500.0, 0.02, 3.0, bl, asp, min_len=(60, 30, 18)[lvl],
                                 cover=0.5 if lvl < 2 else 0.36, cover_y=0.55 if lvl < 2 else 0.8)
        n = len(X)
        rnd = rnd_fields(rng, n)
        spr = (np.where(rnd[:, 0] < (0.4 if lvl == 0 else 0.05), SCUM, DASH if lvl < 2 else LENS) + rng.integers(0, 4, n)).astype(np.int32)
        sets.append(Set('field%d' % lvl, _field, X, np.zeros(n), p, cam=(B2 - 2600.0, B4 + 2600.0),
                        rnd=rnd, L=L, W=W, spr=spr, a=a, zo=np.float32(2.75 + 0.03 * lvl), lvl=float(lvl)))
    sets += _backdrop_noon(rng)
    sets += _backdrop_evening(rng)
    sets.append(poppies(rng))
    sets.append(haystacks(rng))
    # bank between pond and meadow: reeds and tall grass at every depth
    cl = []
    for pz in np.linspace(0.42, 2.3, 26):
        Z = 1.0 / pz
        xs = B2 - 330.0 + 380.0 * float(noise(np.array([Z * 1.1]), np.array([0.7]), 3)[0])
        cl.append((xs + rng.normal(0, 60), float(pz), rng.uniform(150, 240), 90, 16, 3))
    sets.append(reeds(rng, cl, 'bank2', (B2 - 2600, B2 + 2600)))
    # tall grass and big poppies brushing past the lens
    gl = pal((120, 164, 70), (150, 186, 80), (96, 140, 76), (186, 198, 100), (210, 204, 120), (84, 128, 96))
    cl = []
    x = B2 + 300.0
    while x < B3 + 300.0:
        cl.append((x, 2.25 + rng.uniform(-0.2, 0.3), rng.uniform(130, 210), rng.uniform(60, 130), 22, 4))
        x += rng.uniform(260, 620)
    sets.append(reeds(rng, cl, 'grass_fg', (B2 - 1500, B3 + 1800), leaf=gl, flower=RED, wpx=13.0))
    actors = [make_butterflies(rng), make_swallows(rng), make_figures(rng)]
    return sets, actors
