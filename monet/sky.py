"""The sky: one field of strokes whose colour follows the light of the day.

The same colour model is reused by the water shaders for reflections.
"""
import numpy as np
from engine import Batch, smooth, mix, noise, ramp, C, jitter, DASH, DAB, SCUM
from world import Set, jgrid, rnd_fields, window

PS = 0.03          # the sky drifts at 3% of the camera speed


def dmix(a, b, m, rnd, soft=0.28):
    """Broken-colour mix: each stroke leans to one side instead of averaging."""
    w = smooth(rnd - soft, rnd + soft, m)
    return a * (1 - w[:, None]) + b * w[:, None]


def sun_dawn(env):
    """Screen-relative position (x from centre, y from horizon) of the rising sun."""
    r = smooth(0.0, 20.0, env.t)
    return 250.0 - env.camX * PS * 0.6, -62.0 - 150.0 * r


def sun_evening(env):
    k = smooth(13200.0, 17400.0, env.camX)
    return 420.0 - 260.0 * k, -150.0 + 150.0 * k


def sky_rgb(sxr, ly, lxl, env, rnd):
    """Sky colour at screen-relative x, height ly (negative = up); lxl = layer x for clouds."""
    t = env.t
    d = env.d
    h = np.clip(-ly / 680.0, 0.0, 1.0)
    n = len(h)
    out = np.zeros((n, 3), np.float32)
    r3 = rnd[:, 3]

    w = float(window(d, 0))
    if w > 0:                                                   # ---- dawn
        sr = smooth(0.0, 18.0, t)
        base = ramp([(0, (176, 172, 184)), (0.2, (150, 164, 182)), (0.55, (122, 150, 176)),
                     (1, (98, 132, 168))], h)
        st = noise(lxl / 1050.0 + t * 0.004, ly / 250.0 + 3.0, 1)
        m = smooth(0.52, 0.84, st) * smooth(0.10, 0.34, h) * smooth(1.0, 0.72, h) * (0.5 + 0.4 * sr)
        hue = noise(lxl / 500.0, ly / 300.0 + 9.0, 2)
        acc = ramp([(0, (222, 156, 150)), (0.5, (232, 168, 128)), (1, (208, 158, 176))], hue)
        c = dmix(base, acc, m, r3)
        sx0, sy0 = sun_dawn(env)
        dist = np.sqrt((sxr - sx0) ** 2 + ((ly - sy0) * 1.25) ** 2)
        g = np.exp(-dist / 230.0) * (0.45 + 0.55 * sr)
        c = c + g[:, None] * np.array([0.34, 0.10, -0.10], np.float32)
        # low band of rose haze sitting on the horizon
        hz_band = np.exp(-h / 0.10) * (0.5 + 0.5 * sr)
        c = mix(c, C(214, 168, 170), hz_band * 0.55)
        out += w * c

    w = float(window(d, 1))
    if w > 0:                                                   # ---- clear morning
        base = ramp([(0, (214, 226, 236)), (0.3, (170, 204, 234)), (1, (112, 166, 226))], h)
        cl = noise((lxl + t * 5) / 620.0, ly / 300.0 + 5.0, 2)
        m = smooth(0.52, 0.72, cl) * smooth(0.05, 0.2, h)
        acc = mix(C(246, 228, 222), C(204, 196, 230), noise(lxl / 300.0, ly / 200.0, 3))
        out += w * dmix(base, acc, m, r3)

    w = float(window(d, 2))
    if w > 0:                                                   # ---- high summer noon
        base = ramp([(0, (196, 222, 238)), (0.18, (150, 196, 234)), (0.55, (96, 156, 222)),
                     (1, (62, 122, 204))], h)
        yy = ly / (230.0 + 260.0 * h)
        xx = (lxl + t * 9.0) / (520.0 + 300.0 * h)
        dens = noise(xx, yy, 2) + 0.22 * (noise(xx * 3.3, yy * 3.3, 3) - 0.5)
        up = noise(xx - 0.085, yy - 0.16, 2) + 0.22 * (noise(xx * 3.3 - 0.28, yy * 3.3 - 0.5, 3) - 0.5)
        cm = smooth(0.50, 0.60, dens) * smooth(0.015, 0.10, h)
        lit = smooth(-0.07, 0.06, dens - up)
        cc = mix(C(178, 188, 222), C(255, 252, 244), lit)
        cc = mix(cc, C(252, 240, 214), 0.5 * smooth(0.6, 0.9, rnd[:, 2]) * lit)
        out += w * dmix(base, cc, cm, r3, 0.16)

    w = float(window(d, 3))
    if w > 0:                                                   # ---- golden evening
        base = ramp([(0, (255, 214, 136)), (0.12, (254, 194, 128)), (0.30, (244, 164, 150)),
                     (0.55, (198, 160, 198)), (1, (124, 146, 208))], h)
        sx0, sy0 = sun_evening(env)
        dist = np.sqrt((sxr - sx0) ** 2 + ((ly - sy0) * 1.5) ** 2)
        g = np.exp(-dist / 300.0)
        base = base + g[:, None] * np.array([0.22, 0.16, 0.02], np.float32)
        st = noise((lxl + t * 4) / 900.0, ly / 150.0 + 7.0, 1)
        m = smooth(0.50, 0.74, st) * smooth(0.10, 0.3, h)
        under = smooth(0.45, 0.62, noise((lxl + t * 4) / 900.0, (ly - 26.0) / 150.0 + 7.0, 1))
        acc = mix(C(255, 150, 104), C(158, 122, 178), under * (0.35 + 0.65 * h)[...])
        out += w * dmix(base, acc, m, r3)

    w = float(window(d, 4))
    if w > 0:                                                   # ---- dusk over the lagoon
        base = ramp([(0, (236, 84, 50)), (0.07, (250, 128, 48)), (0.20, (253, 190, 78)),
                     (0.33, (206, 200, 132)), (0.46, (118, 164, 172)), (0.68, (58, 104, 172)),
                     (1, (32, 60, 138))], h)
        sx0 = 150.0
        side = smooth(380.0, 1000.0, np.abs(sxr - sx0)) * smooth(0.5, 0.0, h)
        base = mix(base, ramp([(0, (150, 70, 120)), (0.5, (96, 84, 160))], h), side * 0.8)
        st = noise((lxl + t * 3) / 1000.0, ly / 120.0 + 2.0, 1)
        m = smooth(0.60, 0.84, st) * smooth(0.06, 0.2, h) * smooth(0.75, 0.45, h) * 0.75
        acc = mix(C(244, 96, 72), C(110, 84, 150), smooth(0.12, 0.42, h))
        out += w * dmix(base, acc, m, r3)
    return out


def _sky_shader(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    lxl = g['lx']
    ly = g['ly']
    sxr = lxl - env.camX * PS
    x = 960.0 + sxr
    y = env.hz + ly
    rgb = sky_rgb(sxr, ly, lxl, env, rnd)
    rgb = jitter(rgb, rnd, 0.035 + 0.02 * g['lvl'], 0.022)
    t = env.t
    x = x + 2.5 * np.sin(t * 0.35 + rnd[:, 0] * 6.28)
    # opening: the picture is laid in, large strokes first
    rev = smooth(0.0, 0.7, t * (1.25 - 0.18 * g['lvl']) - 0.15 - 1.3 * rnd[:, 1] - 0.5 * g['lvl'])
    return Batch(x, y, g['ang'], g['L'] * (0.6 + 0.4 * rev), g['W'], g['spr'], rgb, g['a'] * rev, g['zo'])


def _sun_shader(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    out = []
    wd = float(window(env.d, 0, 0.9))
    if wd > 0:
        x0, y0 = sun_dawn(env)
        pul = 1 + 0.04 * np.sin(t * 1.3 + rnd[:, 0] * 6.28)
        x = 960 + x0 + g['ox'] * 31 * pul
        y = env.hz + y0 + g['oy'] * 31 * pul
        core = smooth(1.0, 0.2, g['rr'])
        rgb = mix(C(244, 92, 44), C(255, 138, 62), core)
        rgb = jitter(rgb, rnd, 0.05, 0.02)
        rev = float(smooth(2.6, 4.2, t))
        out.append(Batch(x, y, g['ang'], 20, 13, g['spr'], rgb, 0.95 * wd * rev, 0.5))
    we = float(window(env.d, 3, 0.9))
    if we > 0:
        x0, y0 = sun_evening(env)
        x = 960 + x0 + g['ox'] * 44
        y = env.hz + y0 + g['oy'] * 44
        rgb = mix(C(255, 226, 150), C(255, 250, 220), smooth(1.0, 0.1, g['rr']))
        out.append(Batch(x, y, g['ang'], 30, 20, g['spr'], rgb, 0.92 * we, 0.5))
    if not out:
        return None
    return out


def build(rng):
    sets = []
    lx0, lx1 = -1150.0, 1150.0 + 20000 * PS
    for lvl, (cell, L, W, a) in enumerate([(62, 230, 96, 0.96), (36, 140, 54, 0.88), (22, 78, 30, 0.72)]):
        lx, ly = jgrid(rng, lx0, lx1, -760.0, 170.0, cell)
        n = len(lx)
        rnd = rnd_fields(rng, n)
        ang = (noise(lx / 1100.0, ly / 700.0, 0) - 0.5) * 0.7 + (rnd[:, 0] - 0.5) * 1.1 * rnd[:, 2]
        spr = np.where(rnd[:, 1] < (0.7, 0.5, 0.3)[lvl], SCUM, DASH) + rng.integers(0, 4, n)
        sc = 0.7 + 0.6 * rng.random(n)
        sets.append(Set('sky%d' % lvl, _sky_shader, lx / PS, ly / PS, PS, margin=1e9,
                        lx=lx, ly=ly, rnd=rnd, ang=ang.astype(np.float32), spr=spr.astype(np.int32),
                        L=(L * sc).astype(np.float32), W=(W * sc).astype(np.float32), a=a,
                        zo=np.float32(0.1 * lvl), lvl=float(lvl)))
    # sun disc: a handful of loaded dabs
    n = 60
    a = rng.random(n) * 6.283
    rr = np.sort(np.sqrt(rng.random(n)))[::-1] * 0.92
    sets.append(Set('sun', _sun_shader, np.zeros(n), np.zeros(n), PS, margin=1e9,
                    ox=(rr * np.cos(a)).astype(np.float32), oy=(rr * np.sin(a)).astype(np.float32),
                    rr=rr.astype(np.float32), rnd=rnd_fields(rng, n),
                    ang=(rng.random(n) * 3.14).astype(np.float32), spr=(DAB + rng.integers(0, 4, n)).astype(np.int32)))
    return sets
