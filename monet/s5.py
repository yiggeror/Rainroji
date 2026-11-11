"""Scene 5 - dusk on the lagoon: a church and its bell tower in violet silhouette,
the whole sky burning in the water, a gondola, the first stars."""
import numpy as np
from engine import Batch, smooth, mix, noise, ramp, C, pal, pick, jitter, DASH, DAB, SCUM, LENS
from world import Set, ground_rows, rnd_fields, scene_coord, scene_of, window, B4, DUR
from sky import sky_rgb, PS, dmix
from s2 import pond_vis
from s3 import ridge, _static
import s1

SP = 0.27                      # depth of the island
SX = 18840.0                   # world X of the bell tower
KH, KW = 0.76, 0.90


def profile(x):
    """Height (world units) of the island skyline at world offset x from the tower."""
    x = np.asarray(x, np.float32) / KW
    h = np.zeros_like(x)
    h = np.maximum(h, np.where(np.abs(x) < 92, 1150.0, 0))                                        # bell tower shaft
    h = np.maximum(h, np.where(np.abs(x) < 112, 1235.0, 0))                                       # belfry
    h = np.maximum(h, np.where(np.abs(x) < 100, 1235.0 + 430.0 * (1 - np.abs(x) / 100.0), 0))     # spire
    xc = x - 760.0                                                                                # the church
    h = np.maximum(h, np.where(np.abs(xc) < 430, 500.0, 0))
    h = np.maximum(h, np.where(np.abs(xc + 40) < 230, 560.0 + 290.0 * np.sqrt(np.clip(1 - ((xc + 40) / 230.0) ** 2, 0, 1)), 0))
    h = np.maximum(h, np.where(np.abs(xc + 40) < 34, 930.0, 0))                                   # lantern on the dome
    xf = x - 1180.0                                                                               # temple front
    h = np.maximum(h, np.where(np.abs(xf) < 210, 470.0 + 200.0 * (1 - np.abs(xf) / 210.0), 0))
    h = np.maximum(h, np.where((x > -1000) & (x < 1800), 235.0, 0))                               # monastery roofs
    h = np.maximum(h, 110.0 * smooth(-1900.0, -1300.0, x) * smooth(2700.0, 2000.0, x))             # quay, tapering into the water
    return h * KH


def _lagoon(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    u = scene_coord(X, p, env.camX)
    Z = 1.0 / np.maximum(p, 0.03)
    nz = noise(Z * 1.1 + 5.0, 0.2, 3)
    a = g['a'] * smooth(B4 - 300.0 + 380.0 * nz, B4 - 80.0 + 380.0 * nz, u)
    near = smooth(0.08, 1.7, p)
    sxr = sx - 960.0
    below = np.maximum(sy - env.hz, 0.0)
    wob = 26.0 * (noise(below / 70.0, t * 0.16 + rnd[:, 2] * 0.2, 3) - 0.5) * (0.4 + below / 300.0)
    ly = -(below / env.zoom) * 1.0 - 4.0
    skyc = sky_rgb(sxr + wob, ly, sxr + env.camX * PS, env, rnd)
    # the mirror is broken into bands: each dash keeps one pure colour of the sky above
    alt = sky_rgb(sxr + wob, ly * (0.4 + 1.5 * rnd[:, 1]) - 30.0, sxr + env.camX * PS, env, rnd)
    c = mix(skyc, alt, (rnd[:, 0] < 0.42).astype(np.float32))
    c = mix(c, C(40, 62, 132), 0.16 + 0.30 * near * (rnd[:, 2] < 0.6))
    # reflection of the island: a violet column that trembles with the swell
    sxi, syi, sci = env.project(SX, 0.0, SP)
    xo = (sx + wob * 0.8 - sxi) / sci
    hp = profile(xo) * sci * 0.9
    inref = smooth(hp * 1.02 + 6.0, hp * 0.80, below - 6.0) * (hp > 4.0)
    rc = pick(pal((78, 70, 150), (96, 78, 156), (64, 62, 132), (120, 84, 150)), rnd[:, 1])
    c = mix(c, rc, 0.86 * smooth(rnd[:, 3] * 0.5, rnd[:, 3] * 0.5 + 0.4, inref))
    # embers: the last sunlight skipping across the ripples
    fl = 0.5 + 0.5 * np.sin(t * (1.4 + 2.4 * rnd[:, 1]) + rnd[:, 3] * 6.28)
    gx = np.exp(-((sxr - 150.0) / (200.0 + 0.9 * below)) ** 2)
    emb = smooth(0.55, 0.95, gx * (0.5 + 0.7 * fl) - rnd[:, 0] * 0.55) * (1 - inref)
    c = mix(c, mix(C(255, 150, 60), C(255, 214, 120), rnd[:, 2]), 0.9 * emb)
    rgb = jitter(c, rnd, 0.05, 0.025)
    sway = np.sin(t * (0.55 + 0.5 * rnd[:, 2]) + rnd[:, 3] * 6.28)
    x = sx + (3.0 + 6.0 * near) * sway
    Ls = g['L'] * sc * (1 + 0.14 * sway)
    return Batch(x, sy + 1.2 * np.sin(t * 0.8 + rnd[:, 1] * 6.28) * near, (rnd[:, 0] - 0.5) * 0.10, Ls, g['W'] * sc,
                 g['spr'], rgb, a, g['zo'] + p * 0.1)


def _island(rng):
    sets = []
    cam = (B4 - 2400, 1e9)
    n = 15000
    x = rng.uniform(-1900 * KW, 2700 * KW, n)
    h = profile(x)
    wall = h > 300 * KH
    Wd = np.where(wall, 36.0, 30.0) * rng.uniform(0.75, 1.25, n)
    L = np.where(wall, 104.0, 120.0) * rng.uniform(0.7, 1.3, n)
    # keep every stroke inside the silhouette so the architecture stays crisp against the sky
    hl = np.minimum(profile(x - 0.5 * Wd), profile(x + 0.5 * Wd))
    y = rng.random(n) ** 0.85 * np.maximum(hl - np.where(wall, L * 0.5, Wd * 0.5), 0.0)
    keep = hl > np.where(wall, L * 0.6, Wd * 0.7)
    x, y, h, L, Wd, wall = x[keep], y[keep], h[keep], L[keep], Wd[keep], wall[keep]
    y = np.where(wall, np.maximum(y, L * 0.45), y)
    n = len(x)
    rr = rnd_fields(rng, n)
    col = pick(pal((74, 70, 148), (90, 78, 156), (62, 64, 134), (104, 84, 160), (84, 96, 164)), rr[:, 1])
    col = mix(col, C(176, 104, 140), 0.42 * (y / (1700.0 * KH))[:, None] * (0.4 + rr[:, 0:1]))       # warm sky on the upper stone
    hr = profile(x + 26.0)
    edge = (hr < y) & (rr[:, 3] < 0.8) & (y > 260.0 * KH)                                                                # faces turned to the afterglow
    col = np.where(edge[:, None], pick(pal((238, 132, 104), (250, 164, 110), (214, 110, 120)), rr[:, 0]), col)
    ang = np.where(wall, 1.5708 + rng.normal(0, 0.035, n), rng.normal(0, 0.06, n))
    sets.append(Set('island', _static, SX + x, -y, SP, cam=cam, margin=300, L=L, W=Wd, ang=ang, col=col, a=0.95, k=4.0,
                    spr=(DASH + rng.integers(0, 8, n)).astype(np.int32), zo=np.float32(3.0 + SP) + 1e-4 * edge, rnd=rr))
    # the long low city across the water, almost dissolved
    X0, X1 = B4 - 2400 - 1000 / 0.09, 21500 + 1000 / 0.09
    sets.append(ridge(rng, 'city', 0.09, X0, X1,
                      lambda X: 170 + 150 * noise(X / 3800.0, 0.5, 1) + 330 * smooth(0.84, 0.88, noise(X / 1300.0, 2.0, 2)),
                      lambda X, f, rr: mix(mix(C(128, 84, 150), C(170, 96, 136), f), C(100, 90, 160), 0.4 * rr[:, 1:2]),
                      4.0, 60, 20, cam, dens=1.6))
    return sets


def _stars(env, X, Y, p, sx, sy, sc, g):
    rnd = g['rnd']
    t = env.t
    w = float(window(env.d, 4, 0.5)) * float(smooth(84.0, 93.0, t))
    if w <= 0:
        return None
    tw = 0.55 + 0.45 * np.sin(t * (1.5 + 3 * rnd[:, 0]) + rnd[:, 1] * 6.28)
    x = 960 + g['lx'] - env.camX * PS
    y = env.hz + g['ly']
    appear = smooth(0.0, 1.0, (t - 84.0) / 9.0 * 1.6 - rnd[:, 2])
    rgb = mix(C(255, 240, 190), C(214, 226, 255), rnd[:, 3])
    return Batch(x, y, rnd[:, 0] * 3.0, g['L'] * (0.8 + 0.3 * tw), g['L'] * 0.62, DAB + 1, rgb, 0.8 * w * tw * appear, np.float32(0.6))


def build(rng):
    sets = []
    for lvl, (bl, asp, a) in enumerate([(150.0, 3.2, 0.95), (80.0, 3.6, 0.93), (44.0, 3.8, 0.9)]):
        X, p, L, W = ground_rows(rng, B4 - 500.0, 20200.0, 0.02, 3.0, bl, asp, min_len=(60, 40, 26)[lvl])
        n = len(X)
        rnd = rnd_fields(rng, n)
        spr = (np.where(rnd[:, 0] < (0.3 if lvl == 0 else 0.08), SCUM, DASH) + rng.integers(0, 4, n)).astype(np.int32)
        sets.append(Set('lagoon%d' % lvl, _lagoon, X, np.zeros(n), p, cam=(B4 - 2600.0, 1e9),
                        rnd=rnd, L=L, W=W, spr=spr, a=a, zo=np.float32(2.84 + 0.02 * lvl), lvl=float(lvl)))
    sets += _island(rng)
    n = 90
    lx = rng.uniform(-1000, 1700, n)
    ly = -(330 + 430 * rng.random(n) ** 0.7)
    sets.append(Set('stars', _stars, lx * 0, ly * 0, PS, cam=(B4, 1e9), margin=1e9, lx=lx.astype(np.float32),
                    ly=ly.astype(np.float32), L=rng.uniform(5, 11, n).astype(np.float32), rnd=rnd_fields(rng, n)))
    actors = [
        s1.make_boat(rng, lambda t: 900 - 40 * (t - 82), 0.95, 1.0, 0.0, 1.3, k=4, dark=(C(46, 40, 96), C(78, 60, 120)),
                     refl=C(70, 60, 130)),
        s1.make_boat(rng, lambda t: -1500 + 24 * (t - 82), 0.48, 1.0, 0.25, 3.3, k=4, dark=(C(60, 52, 116), C(90, 70, 130)),
                     refl=C(80, 66, 136)),
        s1.make_gulls(rng, 5, k=4, t0=84.0),
    ]
    return sets, actors
