"""Scene 1 - dawn over the harbour: hazy masts, drifting boats, gulls, mist."""
import numpy as np
from engine import Batch, smooth, mix, noise, ramp, C, pal, pick, jitter, DASH, DAB, SCUM, LENS
from world import Set, rnd_fields, window, scene_of
from sky import sky_rgb, PS

HP = 0.11            # depth of the far quay


def _far(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    w = float(window(env.d, 0, 0.85))
    if w <= 0:
        return None
    haze = sky_rgb(sx - 960, np.full(len(sx), -30.0, np.float32), sx - 960 + env.camX * PS, env, rnd)
    rgb = mix(g['col'], haze, g['hz'])
    rgb = jitter(rgb, rnd, 0.04, 0.015)
    x = sx + g['smoke'] * (-(t * 5.0 + 30 * np.sin(t * 0.3 + rnd[:, 0] * 6)) * g['lift'])
    y = sy - g['smoke'] * (4.0 * np.sin(t * 0.5 + rnd[:, 1] * 6.28))
    rev = smooth(0.0, 1.0, t - 2.2 - 2.0 * rnd[:, 1])
    a = g['a'] * w * rev * (1 - 0.25 * g['smoke'] * np.sin(t * 0.4 + rnd[:, 2] * 6.28) ** 2)
    return Batch(x, y, g['ang'], g['L'] * sc, g['W'] * sc, g['spr'], rgb, a, g['zo'])


def _mist(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    # mist is thickest at dawn and once more while the harbour dissolves into the pond
    w = float(np.clip(1.0 - abs(env.d - 0.0) / 1.25, 0, 1))
    w = max(w, 0.9 * float(window(env.d, 0.5, 0.5)))
    if w <= 0:
        return None
    lxr = sx - 960
    rgb = mix(sky_rgb(lxr, np.full(len(sx), -60.0, np.float32), lxr + env.camX * PS, env, rnd), C(226, 214, 222), 0.45)
    drift = -t * (5.0 + 9.0 * rnd[:, 0])
    x = sx + drift * sc * 6.0 + 30 * np.sin(t * 0.21 + rnd[:, 1] * 6.28)
    x = (x + 600.0) % 3200.0 - 600.0
    y = env.hz + g['yo'] + 5 * np.sin(t * 0.3 + rnd[:, 2] * 6.28)
    a = g['a'] * w * (0.65 + 0.35 * np.sin(t * 0.33 + rnd[:, 3] * 6.28)) * smooth(0.0, 1.0, t - 1.5 - rnd[:, 2])
    return Batch(x, y, g['ang'], g['L'], g['W'], g['spr'], rgb, a, g['zo'])


def _add(acc, x, y, L, W, ang, col, a, hz, spr, zo, smoke=0.0, lift=0.0):
    acc.append((x, y, L, W, ang, col[0], col[1], col[2], a, hz, spr, zo, smoke, lift))


def _harbour(rng):
    """Screen-space design (px at depth HP, y up from the waterline), converted to world."""
    acc = []
    ink = C(62, 92, 122)
    ink2 = C(78, 104, 134)
    # a low grey-violet shore so the horizon is a place and not an edge
    for i in range(520):
        x = rng.uniform(-1300, 3400)
        _add(acc, x, rng.uniform(0, 9), rng.uniform(34, 80), rng.uniform(6, 12), rng.normal(0, 0.05),
             C(112, 128, 158), 0.55, rng.uniform(0.3, 0.6), DASH + rng.integers(0, 8), 1.20)

    def ship(cx, s, haze, masts=3, funnel=False):
        s = s * 1.25
        w = 170 * s
        for i in range(int(30 * s) + 10):             # the hull: a dark bar standing out of the mist
            _add(acc, cx + rng.uniform(-w / 2, w / 2), rng.uniform(6, 46 * s), rng.uniform(50, 96) * s,
                 rng.uniform(15, 24) * s, rng.normal(0, 0.05), ink * rng.uniform(0.88, 1.08), 0.9, haze * 0.7,
                 DASH + rng.integers(0, 8), 1.30)
        for i in range(int(12 * s) + 5):              # sails and rigging as a soft smear
            _add(acc, cx + rng.normal(0, w * 0.26), rng.uniform(50, 150) * s, rng.uniform(80, 140) * s,
                 rng.uniform(24, 44) * s, 1.5708 + rng.normal(0, 0.12), ink2, 0.40, haze + 0.10,
                 SCUM + rng.integers(0, 4), 1.31)
        for m in range(masts):
            mx = cx + (m - (masts - 1) / 2) * w / masts * 0.9 + rng.normal(0, 5)
            mh = rng.uniform(130, 215) * s
            for k in range(3):
                _add(acc, mx + rng.normal(0, 1.5), 30 * s + mh * (k + 0.5) / 3, mh / 3 * 1.3, 9.0 * s + 2.0 - 2.0 * k,
                     1.5708 + rng.normal(0, 0.04), ink2, 0.8, haze + 0.07 * k, DASH + rng.integers(0, 8), 1.32)
            for sgn in (-1, 1):                       # stays running down to the deck
                for k in range(3):
                    q = (k + 0.5) / 3
                    _add(acc, mx + sgn * w * 0.2 * q, 30 * s + mh * (1 - q) * 0.92, mh / 3 * 1.05, 3.0,
                         1.5708 - sgn * np.arctan2(w * 0.2, mh), ink2, 0.42, haze + 0.15, DASH + rng.integers(0, 8), 1.33)
        if funnel:
            fx = cx + rng.uniform(-20, 20) * s
            _add(acc, fx, 62 * s, 60 * s, 19 * s, 1.5708, ink, 0.9, haze, DASH, 1.34)
            plume(fx, 92 * s, s)

    def plume(fx, fy, s):
        for i in range(34):
            k = i / 34.0
            _add(acc, fx - 26 * k * 8 * s + rng.normal(0, 10), fy + 120 * s * k ** 0.7 + rng.normal(0, 9),
                 rng.uniform(60, 120) * s * (0.6 + k), rng.uniform(28, 50) * s * (0.6 + k), rng.uniform(-0.6, 0.1),
                 mix(C(150, 150, 172), C(214, 178, 176), k), 0.32 * (1 - 0.6 * k), 0.25, SCUM + rng.integers(0, 4),
                 1.36, 1.0, 0.4 + k)

    def crane(cx, s, haze):
        hgt = 170 * s
        for k in range(4):
            _add(acc, cx + 14 * s * k / 4, hgt * (k + 0.5) / 4, hgt / 4 * 1.3, 7 * s, 1.5708 - 0.08, ink2, 0.7, haze,
                 DASH + rng.integers(0, 8), 1.31)
        for k in range(4):
            q = (k + 0.5) / 4
            _add(acc, cx + 14 * s + 110 * s * q, hgt + 40 * s * q, 34 * s, 5 * s, -0.36, ink2, 0.65, haze + 0.05,
                 DASH + rng.integers(0, 8), 1.31)
        _add(acc, cx + 124 * s, hgt - 20 * s, 60 * s, 2.5, 1.5708, ink2, 0.5, haze + 0.1, DASH, 1.31)

    def chimney(cx, s, haze):
        hgt = rng.uniform(130, 190) * s
        for k in range(3):
            _add(acc, cx, hgt * (k + 0.5) / 3, hgt / 3 * 1.25, 9 * s, 1.5708, ink2, 0.7, haze, DASH + rng.integers(0, 8), 1.31)
        plume(cx, hgt, s * 0.9)

    def sheds(cx, w, haze):
        for i in range(int(w / 12)):
            _add(acc, cx + rng.uniform(0, w), rng.uniform(6, 34), rng.uniform(34, 70), rng.uniform(12, 20),
                 rng.normal(0, 0.06), mix(ink, C(120, 120, 150), rng.random()), 0.7, haze, DASH + rng.integers(0, 8), 1.25)

    sheds(-1250, 700, 0.42); crane(-1100, 1.0, 0.36); ship(-900, 1.0, 0.22, 3); ship(-700, 0.8, 0.34, 2)
    crane(-520, 0.8, 0.44); chimney(-420, 0.9, 0.46); ship(-260, 0.7, 0.44, 3, True)
    sheds(-150, 500, 0.5); ship(120, 0.55, 0.52, 2); chimney(330, 0.7, 0.55)
    sheds(520, 800, 0.45); ship(640, 0.9, 0.3, 3); crane(820, 1.05, 0.36); ship(1010, 1.1, 0.24, 3, True)
    chimney(1230, 1.0, 0.4); crane(1380, 0.9, 0.42); ship(1560, 0.8, 0.36, 2); sheds(1650, 900, 0.48)
    ship(1900, 1.0, 0.3, 3); chimney(2100, 0.9, 0.45); crane(2300, 1.0, 0.4); ship(2520, 0.9, 0.34, 3, True)
    ship(2900, 0.8, 0.4, 2); chimney(3100, 0.8, 0.5)
    A = np.array(acc, np.float32)
    n = len(A)
    # design x is the screen offset at camX = 0 for depth HP
    X = A[:, 0] / HP
    Y = -A[:, 1] / HP
    return Set('harbour', _far, X, Y, HP, cam=(-1e9, 5200), margin=400,
               L=A[:, 2] / HP, W=A[:, 3] / HP, ang=A[:, 4], col=A[:, 5:8], a=A[:, 8], hz=A[:, 9],
               spr=A[:, 10].astype(np.int32), zo=A[:, 11], smoke=A[:, 12], lift=A[:, 13], rnd=rnd_fields(rng, n))


def _mists(rng):
    n = 260
    x = rng.uniform(-600, 2600, n)
    band = rng.random(n)
    y = -8 - 80 * band ** 1.6 + rng.normal(0, 8, n) + 34 * (rng.random(n) < 0.35)
    L = rng.uniform(260, 520, n)
    return Set('mist', _mist, x, y * 0, 1.0, cam=(-1e9, 6500), margin=1e9, yo=y.astype(np.float32),
               L=L.astype(np.float32), W=(L * rng.uniform(0.16, 0.3, n)).astype(np.float32),
               ang=rng.normal(0, 0.05, n).astype(np.float32), spr=(SCUM + rng.integers(0, 4, n)).astype(np.int32),
               a=(0.16 + 0.26 * rng.random(n) * (1 - band)).astype(np.float32), zo=np.float32(1.6),
               rnd=rnd_fields(rng, n))


# ------------------------------------------------------------------ boats and gulls
def _boat_strokes(rng, s=1.0):
    """Local strokes of a small skiff with a standing sculler and a seated figure."""
    P = []

    def add(x, y, L, W, ang, tone, part=0, spr=DASH):
        P.append((x * s, y * s, L * s, W * s, ang, tone, part, spr + rng.integers(0, 4)))
    for i in range(9):                                # hull: a shallow crescent
        q = (i + 0.5) / 9 - 0.5
        add(q * 300, -8 - 46 * q * q * 2.2 + 12, 62, 21, -q * 0.42, 0.0)
    for i in range(6):
        q = (i + 0.5) / 6 - 0.5
        add(q * 270, -24 - 36 * q * q * 2.2 + 12, 62, 11, -q * 0.42, 0.22)
    add(60, -62, 84, 34, 1.5708 + 0.08, 0.04, 1, DAB)      # standing sculler: one mass
    add(63, -98, 46, 30, 1.5708 + 0.05, 0.08, 1, DAB)
    add(65, -128, 27, 24, 0.3, 0.1, 1, DAB)
    add(74, -84, 50, 12, 0.95, 0.06, 1)
    add(-58, -42, 60, 40, 1.5708, 0.08, 2, DAB)             # seated figure
    add(-56, -76, 26, 23, 0.2, 0.14, 2, DAB)
    for k in range(4):                                # the oar
        add(92 + 26 * k, -70 + 30 * k, 40, 5, 0.86, 0.12, 3)
    return np.array(P, np.float32)


def make_boat(rng, off_fn, p, s, haze, seed, k=0, dark=None, refl=None):
    dark = dark or (C(34, 62, 80), C(58, 92, 110))
    refl = C(60, 100, 118) if refl is None else refl
    P = _boat_strokes(rng, s)
    rr = rng.random((len(P), 4)).astype(np.float32)

    def actor(env):
        w = float(window(env.d, k, 0.8))
        if w <= 0:
            return None
        t = env.t
        Xb = env.camX + off_fn(t)
        bob = 4.0 * np.sin(t * 1.1 + seed)
        roll = 0.035 * np.sin(t * 0.8 + seed * 2)
        lx, ly = P[:, 0].copy(), P[:, 1].copy()
        ang = P[:, 4].copy()
        oar = P[:, 6] == 3
        sw = 0.16 * np.sin(t * 1.25 + seed)
        px, py = 92 * s, -78 * s
        dx, dy = lx[oar] - px, ly[oar] - py
        lx[oar] = px + dx * np.cos(sw) - dy * np.sin(sw)
        ly[oar] = py + dx * np.sin(sw) + dy * np.cos(sw)
        ang[oar] += sw
        body = P[:, 6] == 1
        lx[body] += 6 * s * np.sin(t * 1.25 + seed) * (-ly[body] / (130 * s))
        cr, sr_ = np.cos(roll), np.sin(roll)
        wx = lx * cr - ly * sr_
        wy = lx * sr_ + ly * cr + bob
        sx, sy, sc = env.project(Xb + wx, wy, p)
        dk = mix(dark[0], dark[1], P[:, 5:6] * 1.6)
        hzc = sky_rgb(sx - 960, np.full(len(sx), -40.0, np.float32), sx - 960 + env.camX * PS, env, rr)
        rgb = jitter(mix(dk, hzc, haze), rr, 0.05, 0.02)
        rev = float(smooth(3.0, 4.6, t))
        zo = np.float32(3.0 + p)
        b1 = Batch(sx, sy, ang, P[:, 2] * sc, P[:, 3] * sc, P[:, 7].astype(np.int32), rgb, 0.95 * w * rev, zo)
        # reflection: mirrored about the waterline, squeezed, broken by ripples
        wl = env.hz + env.Hc * p * env.zoom
        ry = wl + (wl - sy) * 0.72 + 4
        rx = sx + (5.0 + 0.05 * (ry - wl)) * np.sin(t * 2.1 + ry * 0.11) * sc
        rc = mix(rgb, refl, 0.3)
        b2 = Batch(rx, ry, -ang * 0.3, P[:, 2] * sc * 1.1, P[:, 3] * sc * 0.8, DASH + (P[:, 7].astype(np.int32) % 4),
                   rc, 0.58 * w * rev, np.float32(2.9))
        return [b2, b1]
    return actor


def make_gulls(rng, n=7, k=0, t0=2.0):
    ph = rng.random((n, 6)).astype(np.float32)

    def actor(env):
        w = float(window(env.d, k, 1.0))
        if w <= 0:
            return None
        t = env.t
        xs, ys, an, Ls, Ws = [], [], [], [], []
        for i in range(n):
            pz = 0.22 + 0.5 * ph[i, 0]
            x = 2300 - (70 + 60 * ph[i, 1]) * (t - t0 - 9 * ph[i, 2]) + 60 * np.sin(t * 0.4 + ph[i, 3] * 6)
            y = env.hz - 120 - 250 * ph[i, 4] + 26 * np.sin(t * 0.7 + ph[i, 5] * 6.28) + 14 * np.sin(t * 1.9 + i)
            flap = 0.45 + 0.42 * np.sin(t * (5.0 + 2 * ph[i, 3]) + i)
            size = 30 * pz + 9
            for sgn in (-1, 1):
                a = sgn * flap
                xs.append(x + sgn * size * 0.44 * np.cos(flap)); ys.append(y - size * 0.44 * np.sin(flap))
                an.append(-sgn * flap); Ls.append(size); Ws.append(size * 0.26)
        m = len(xs)
        rgb = np.tile(mix(C(64, 84, 110), C(236, 232, 230), float(np.clip(env.d, 0, 1))) if k == 0 else C(60, 52, 110), (m, 1))
        return Batch(np.array(xs), np.array(ys), np.array(an), np.array(Ls), np.array(Ws), LENS, rgb,
                     0.85 * w * float(smooth(t0 + 2, t0 + 4, t)), np.float32(1.9))
    return actor


def build(rng):
    sets = [_harbour(rng), _mists(rng)]
    actors = [
        make_boat(rng, lambda t: -170 - 560 * float(smooth(5, 22, t)) + 0 * t, 1.0, 1.0, 0.0, 0.3),
        make_boat(rng, lambda t: -640 - 300 * float(smooth(5, 22, t)), 0.52, 1.0, 0.34, 2.1),
        make_boat(rng, lambda t: -330 - 160 * float(smooth(5, 22, t)), 0.30, 1.0, 0.56, 4.4),
        make_gulls(rng),
    ]
    return sets, actors
