"""Water of the dawn harbour and the lily pond (one continuous surface)."""
import numpy as np
from engine import Batch, smooth, mix, noise, ramp, C, pal, pick, jitter, DASH, DAB, SCUM, LENS
from world import Set, ground_rows, rnd_fields, scene_coord, scene_of, window, B1, B2
from sky import sky_rgb, sun_dawn, PS, dmix

POND_GREEN = pal((34, 84, 70), (46, 104, 84), (28, 70, 84), (58, 118, 78), (40, 60, 104), (72, 128, 84))
POND_SKY = pal((150, 186, 226), (176, 170, 220), (206, 196, 232), (232, 204, 214), (128, 170, 216))


def pond_mask(X, p):
    """Where the pond mirrors open sky (1) instead of the trees around it (0)."""
    z = 1.0 / np.maximum(p, 0.05)
    a = noise(X / 1300.0, z * 0.55, 1)
    b = noise(X / 420.0 + 4.0, z * 1.6, 2)
    return smooth(0.38, 0.66, 0.78 * a + 0.22 * b + 0.16 * smooth(0.4, 1.4, p) - 0.10 * smooth(0.55, 0.3, p))


def _water(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    n = len(X)
    u = scene_coord(X, p, env.camX)
    d = scene_of(u)                                  # 0 harbour ... 1 pond
    near = smooth(0.08, 1.7, p)
    sxr = sx - 960.0
    ly = -(sy - env.hz) / env.zoom * 1.12 - 6.0
    skyc = sky_rgb(sxr, ly, sxr + env.camX * PS, env, rnd)

    # ---------------- dawn harbour
    c0 = mix(skyc, C(78, 120, 138), 0.20 + 0.36 * near)
    rip = smooth(0.80, 0.86, rnd[:, 0] + 0.16 * near) * (0.55 + 0.45 * np.sin(t * (0.7 + rnd[:, 1]) + rnd[:, 2] * 6.28))
    c0 = mix(c0, C(46, 86, 104), 0.62 * np.clip(rip, 0, 1))
    lite = smooth(0.90, 0.95, rnd[:, 2] + 0.03 * np.sin(t * 0.8 + rnd[:, 0] * 6.28))
    c0 = mix(c0, mix(skyc, C(232, 196, 196), 0.5), 0.5 * lite)
    # the sun's path on the water: broken orange dashes, widening toward the viewer
    sx0, sy0 = sun_dawn(env)
    below = np.maximum(sy - env.hz, 0.0)
    wcol = 15.0 + 0.105 * below + 22.0 * noise(below / 90.0, t * 0.12, 3)
    gx = np.exp(-((sx - (960.0 + sx0 + 9.0 * np.sin(below * 0.035 + t * 0.9))) / wcol) ** 2)
    fl = 0.5 + 0.5 * np.sin(t * (1.6 + 2.2 * rnd[:, 1]) + rnd[:, 3] * 6.28 + below * 0.02)
    sr = float(smooth(3.0, 14.0, t))
    glit = smooth(0.25, 0.75, gx * (0.55 + 0.6 * fl) * 1.25 - rnd[:, 0] * 0.55) * (0.35 + 0.65 * sr) \
        * smooth(4.0, 26.0, below)
    c0 = mix(c0, mix(C(238, 104, 46), C(255, 172, 96), rnd[:, 1] * (0.4 + 0.6 * fl)), glit)
    halo = np.exp(-((sx - (960.0 + sx0)) / (150.0 + 0.5 * below)) ** 2) * (0.3 + 0.7 * sr)
    c0 = c0 + halo[:, None] * np.array([0.085, 0.02, -0.03], np.float32)
    ang = (rnd[:, 0] - 0.5) * 0.10
    rgb = c0
    L = g['L']
    Wd = g['W']

    # ---------------- lily pond
    wp = np.clip(d, 0, 1)
    if wp.max() > 0:
        m = g['pm']
        dap = noise(X / 520.0 + t * 0.035, 1.0 / np.maximum(p, 0.05) * 1.5 - t * 0.02, 3)
        gcol = pick(POND_GREEN, rnd[:, 1], [3, 3, 2, 2, 1.2, 1.5])
        gcol = gcol * (0.80 + 0.55 * dap[:, None])
        scol = mix(pick(POND_SKY, rnd[:, 2], [3, 2, 1.6, 1.0, 2]), skyc, 0.25)
        scol = scol * (0.93 + 0.14 * dap[:, None])
        fine = g['lvl'] >= 1.5
        c1 = dmix(gcol, scol, m, rnd[:, 3], 0.55 if fine else 0.30)
        # far water under the trees goes dark and green
        c1 = mix(c1, C(40, 88, 72), 0.45 * smooth(0.5, 0.25, p) * (1 - m))
        vert = (m < 0.30 + 0.2 * rnd[:, 3]) & (rnd[:, 0] < 0.7) & (not fine)
        ang1 = np.where(vert, 1.5708 + (rnd[:, 1] - 0.5) * 0.22, (rnd[:, 0] - 0.5) * 0.12)
        w = wp
        rgb = mix(c0, c1, w)
        sw = w > rnd[:, 2]
        ang = np.where(sw, ang1, ang)
        L = np.where(sw & vert, L * 0.8, L)
        Wd = np.where(sw & vert, Wd * 1.25, Wd)
    rgb = jitter(rgb, rnd, 0.05, 0.022)
    # the surface never stops moving: dashes slide sideways and breathe
    sway = np.sin(t * (0.55 + 0.5 * rnd[:, 2]) + rnd[:, 3] * 6.28)
    x = sx + (3.0 + 5.0 * near) * sway * (1 - 0.6 * wp)
    x = x + wp * 3.5 * np.sin(t * 1.4 + sy * 0.045 + rnd[:, 0] * 2.0)
    y = sy + 1.2 * np.sin(t * 0.8 + rnd[:, 1] * 6.28) * near
    Ls = L * sc * (1 + 0.12 * sway)
    rev = smooth(0.0, 0.7, t * (1.2 - 0.2 * g['lvl']) - 1.0 - 1.4 * rnd[:, 1] - 0.5 * g['lvl'])
    a = g['a'] * rev * (1 - 0.3 * wp * (g['lvl'] >= 1.5))
    return Batch(x, y, ang, Ls * (0.6 + 0.4 * rev), Wd * sc, g['spr'], rgb, a, g['zo'] + p * 0.1)


def build(rng):
    sets = []
    X1 = B2 + 900.0
    for lvl, (bl, asp, a) in enumerate([(150.0, 3.2, 0.95), (74.0, 3.6, 0.92), (40.0, 3.8, 0.9)]):
        X, p, L, W = ground_rows(rng, -200.0, X1, 0.02, 3.0, bl, asp, min_len=(60, 40, 26)[lvl])
        n = len(X)
        rnd = rnd_fields(rng, n)
        spr = (np.where(rnd[:, 0] < (0.35 if lvl == 0 else 0.1), SCUM, DASH) + rng.integers(0, 4, n)).astype(np.int32)
        sets.append(Set('water%d' % lvl, _water, X, np.zeros(n), p, cam=(-1e9, B2 + 1500.0),
                        rnd=rnd, L=L, W=W, spr=spr, a=a, zo=np.float32(2.0 + 0.2 * lvl), lvl=float(lvl),
                        pm=pond_mask(X, p).astype(np.float32)))
    return sets
