"""Summer: the narrow river under its trees, a skiff, and the old bridge.
(after 'La barque rose', 'En norvegienne' and the bridges at Argenteuil and Vervy)"""
import math
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise, mix
from core import SB, F, WATER, RIPPLE, STAND, scatter
from trees import pick, unit, crown, limb
import props, surf, life
import world as W

G_SH = pal((22, 72, 64), (30, 86, 70), (24, 62, 86), (38, 96, 66), (30, 52, 92))
G_LI = pal((98, 162, 72), (140, 188, 78), (196, 216, 104), (232, 232, 132), (120, 176, 96))
W_SH = pal((40, 92, 84), (52, 106, 80), (36, 80, 100))
W_LI = pal((150, 196, 110), (184, 212, 124), (214, 226, 150), (126, 180, 120))
BARK_SH = pal((52, 50, 72), (64, 54, 70), (44, 56, 72))
BARK_LI = pal((150, 132, 110), (170, 150, 116), (128, 124, 120))

TREES = []


def river_tree(rng, x, z, h, toward, willow=False, dens=1.0):
    """A tall waterside tree leaning out over the river; `toward` is +1/-1 (x direction of the water)."""
    sb = SB(rng)
    y0 = props.gy(x, z)
    psh, pli = (W_SH, W_LI) if willow else (G_SH, G_LI)
    top = np.array([x + toward * h * 0.16, y0 + h * 0.42, z + rng.normal(0, 0.5)])
    limb(sb, (x, y0 - 0.1, z), top, 0.30 + h * 0.022, 0.2 + h * 0.012, BARK_SH, BARK_LI, rng, bend=0.05 * toward)
    nb = rng.integers(5, 8)
    a0 = rng.uniform(0, 6.28)
    for b in range(nb):
        a = a0 + b * 6.283 / nb + rng.normal(0, 0.3)
        out = np.array([np.cos(a), 0, np.sin(a)])
        over = max(0.0, out[0] * toward)                     # boughs on the water side reach further and hang lower
        r = h * rng.uniform(0.22, 0.34) * (1 + 0.7 * over)
        tip = top + out * r + [0, h * rng.uniform(0.18, 0.5) * (1 - 0.75 * over), 0]
        limb(sb, top, tip, 0.16 + h * 0.006, 0.07, BARK_SH, BARK_LI, rng, bend=rng.uniform(-0.15, 0.15), flex1=0.08)
        for k in range(3):
            f = (0.5, 0.82, 1.08)[k]
            c = top + (tip - top) * f + rng.normal(0, 0.5, 3)
            rad = np.array([1.0, 0.72, 1.0]) * h * rng.uniform(0.14, 0.19)
            crown(sb, c, rad, 0, psh, pli, 0.36 + h * 0.008, rng, flex=0.16, smin=6.0, cover=0.95 * dens,
                  wli=None if willow else [3, 3, 2, 1, 2])
            if willow or over > 0.55:
                # trailing sprays
                m = rng.integers(4, 8)
                for j in range(m):
                    p = c + np.array([rng.normal(0, rad[0] * 0.6), -rad[1] * 0.5, rng.normal(0, rad[2] * 0.6)])
                    ln = rng.uniform(1.2, 3.0) * (1.0 if willow else 0.55)
                    n = max(3, int(ln / 0.3))
                    t = (np.arange(n) + 0.5) / n
                    P = p[None] + np.stack([0.15 * np.sin(t * 2 + j), -ln * t, 0.15 * np.cos(t * 2.3 + j)], axis=1)
                    sb.add(P, unit(np.tile([0.0, -1.0, 0.0], (n, 1)) + rng.normal(0, 0.22, (n, 3))), 0.40 * np.exp(rng.normal(0, 0.2, n)), 0.13, DASH + rng.integers(0, 8, n),
                           pick(psh, rng.random(n)), pick(pli, rng.random(n)), N=np.tile([toward * 0.3, 0.6, 0.0], (n, 1)),
                           flex=0.10 + 0.55 * t, smin=5.0, occ=0.6 + 0.4 * rng.random(n))
    crown(sb, top + [0, h * 0.42, 0], np.array([0.2, 0.15, 0.2]) * h, 0, psh, pli, 0.4 + h * 0.008, rng, flex=0.2, smin=6.0, cover=0.9 * dens)
    TREES.append((x, z, h))
    return sb.group(name='rivertree')


def summer_shade(env, x, z):
    """Under the trees the banks and the water lie in green shade, pierced by spots of sun."""
    if env.t < 30 or env.t > 90:
        return None
    w = smooth(60.0, 84.0, z) * smooth(151.0, 144.0, z)
    if w.max() <= 0:
        return None
    sun = smooth(0.60, 0.74, noise(x / 4.2 + 0.25 * np.sin(env.t * 0.5), z / 4.2, 3))
    mid = smooth(4.0, 0.5, np.abs(x - W.rx(z)))           # the open strip in the middle of the river
    return w * (1 - sun) * (1 - 0.8 * mid) * 0.95


def water_colour(env, x, z, rnd, rgb, d):
    """Scene colour in the water: green depths in summer, spots of sun, the gold of the poplars."""
    s = W.season(z)
    w = smooth(0.4, 1.0, s) * smooth(2.0, 1.3, s)
    if w.max() > 0:
        deep = pick(pal((26, 78, 66), (34, 92, 70), (22, 64, 84), (44, 104, 72)), rnd[:, 1])
        mid = smooth(5.0, 1.0, np.abs(x - W.rx(z)))
        sun = smooth(0.62, 0.76, noise(x / 4.2 + 0.25 * np.sin(env.t * 0.5), z / 4.2, 3))
        k = w * (0.72 - 0.50 * mid)
        rgb = mix(rgb, deep, k[:, None])
        fleck = (sun * (1 - mid) * w * (rnd[:, 2] > 0.55))[:, None]
        rgb = mix(rgb, pick(pal((190, 214, 110), (226, 230, 140), (150, 196, 100)), rnd[:, 0]), 0.75 * fleck)
    return rgb


def reeds(env):
    """Reeds, rushes and yellow flag at the water's edge."""
    t = env.t
    if t > 100:
        return []
    out = []
    X, Z, Rn = scatter(env, 771, 0.55, 46.0, 0.2)
    if len(X) == 0:
        return []
    d = W.edge(X, Z)
    s = W.season(Z)
    clump = noise(X / 4.0, Z / 4.0, 0)
    keep = (np.abs(d + 0.1) < 0.9) & (Rn[:, 0] < (0.30 + 0.3 * smooth(0.5, 1.0, s)) * smooth(0.25, 0.6, clump) * 1.6) & (s < 2.3)
    if not keep.any():
        return []
    X, Z, Rn, d, s, clump = X[keep], Z[keep], Rn[keep], d[keep], s[keep], clump[keep]
    y0 = np.maximum(W.ground(X, Z, d), 0.0)
    n = len(X)
    for j in range(3):
        hh = (0.45 + 1.5 * Rn[:, (1 + j) % 6] * clump) * (0.75 + 0.35 * np.clip(s, 0, 1))
        ox = (Rn[:, (2 + j) % 6] - 0.5) * 0.4
        oz = (Rn[:, (3 + j) % 6] - 0.5) * 0.4
        lean = (Rn[:, (4 + j) % 6] - 0.5) * 0.5
        P = np.stack([X + ox, y0 + hh * 0.5, Z + oz], axis=1)
        D = unit(np.stack([lean, np.ones(n), (Rn[:, j] - 0.5) * 0.4], axis=1))
        aut = (s > 1.5 + 0.5 * Rn[:, 5])[:, None]
        csh = np.where(aut, pick(pal((120, 96, 84), (140, 104, 80)), Rn[:, 4]), pick(pal((30, 92, 80), (44, 106, 76), (28, 76, 96)), Rn[:, 4]))
        cli = np.where(aut, pick(pal((230, 180, 96), (214, 150, 84), (246, 210, 130)), Rn[:, 5]), pick(pal((130, 186, 96), (172, 206, 104), (104, 164, 110)), Rn[:, 5]))
        out.append(life.strokes(P, D, hh * 1.05, 0.055 + 0.03 * Rn[:, 2], LENS + (Rn[:, 3] * 4).astype(np.int32), csh, cli,
                                N=np.tile([0.3, 0.7, -0.2], (n, 1)), r=Rn[:, 1], ph=Rn[:, 5] * 6.28, flex=0.22 * hh, smin=4.0))
    # yellow flag iris here and there (spring into summer)
    fl = (Rn[:, 2] < 0.16) & (s < 1.4)
    if fl.any():
        hh = 0.6 + 0.5 * Rn[fl, 1]
        P = np.stack([X[fl], y0[fl] + hh, Z[fl]], axis=1)
        out.append(life.strokes(P, unit(np.stack([Rn[fl, 3] - 0.5, 0.3 + 0 * hh, Rn[fl, 4] - 0.5], axis=1)), 0.16, 0.11, DAB + (Rn[fl, 3] * 4).astype(np.int32),
                                (0.86, 0.66, 0.2), (1.0, 0.9, 0.36), r=Rn[fl, 1], ph=Rn[fl, 5] * 6.28, flex=0.2, smin=2.5, bias=0.02))
    return [(life.merge(out), dict(sway=True))]


def weeds(env):
    """Long water-weeds streaming in the current, seen when the camera looks down into the river."""
    t = env.t
    h = env.C[1]
    if h > 9 or t < 34 or t > 84 or env.fw[1] > -0.12:
        return []
    X, Z, Rn = scatter(env, 551, 0.8, 17.0, 0.0)
    if len(X) == 0:
        return []
    d = W.edge(X, Z)
    patch = noise(X / 5.0, Z / 9.0, 1)
    keep = (d < -0.8) & (Rn[:, 0] < smooth(0.35, 0.7, patch) * 0.9)
    if not keep.any():
        return []
    X, Z, Rn = X[keep], Z[keep], Rn[keep]
    tx, tz = W.river_tangent(Z)
    out = []
    nseg = 6
    ln = 0.42 + 0.3 * Rn[:, 1]
    ph = Rn[:, 5] * 6.283
    px, pz = X.copy(), Z.copy()
    for k in range(nseg):
        a = 0.55 * np.sin(k * 0.8 - t * 1.5 + ph) * (0.25 + k / nseg) + (Rn[:, 2] - 0.5) * 0.6
        dx = tx * np.cos(a) - tz * np.sin(a)
        dz = tz * np.cos(a) + tx * np.sin(a)
        P = np.stack([px + dx * ln * 0.5, np.full(len(X), 0.0), pz + dz * ln * 0.5], axis=1)
        dist = np.sqrt((P[:, 0] - env.C[0]) ** 2 + h * h + (P[:, 2] - env.C[2]) ** 2)
        vis = np.clip((h / dist) * 1.9 - 0.42, 0.0, 1.0)             # only where we look steeply into the water
        csh = pick(pal((30, 84, 60), (22, 66, 62), (44, 96, 60), (60, 92, 50)), Rn[:, 3])
        cli = pick(pal((92, 150, 70), (126, 170, 74), (70, 130, 80), (150, 164, 80)), Rn[:, 4])
        out.append(life.strokes(P, np.stack([dx, 0 * dx, dz], axis=1), ln * 1.25, 0.075 + 0.05 * Rn[:, 2] * (1 - k / nseg), LENS + (Rn[:, 3] * 4).astype(np.int32),
                                csh, cli, N=np.tile([0.0, 1.0, 0.0], (len(X), 1)) + (Rn[:, :3] - 0.5) * 1.2, r=Rn[:, 1], ph=ph,
                                a=0.85 * vis * (1 - 0.5 * k / nseg), smin=3.0, haze=0.0, bias=-0.3))
        px, pz = px + dx * ln, pz + dz * ln
    return [(life.merge(out), dict(passid=WATER, reflect=False))]


def floaters(seed, cell, size, csh, cli, dens, speed=0.38, tmin=0.0, tmax=1e9, aspect=0.7, R=42.0, a=0.95):
    """Things lying on the water and going with the current: petals, leaves, ice."""
    def act(env):
        t = env.t
        if t < tmin or t > tmax or env.C[1] > 45:
            return []
        sh = speed * t
        C0 = env.C.copy()
        env.C = C0 - np.array([0.0, 0.0, sh])          # the lattice travels downstream
        X, Z, Rn = scatter(env, seed, cell, R, 0.0)
        env.C = C0
        if len(X) == 0:
            return []
        Z = Z + sh
        X = X + 0.25 * np.sin(t * 0.3 + Rn[:, 5] * 6.28)
        d = W.edge(X, Z)
        keep = (d < -0.3) & (Rn[:, 0] < dens(X, Z, d))
        if not keep.any():
            return []
        X, Z, Rn = X[keep], Z[keep], Rn[keep]
        ang = Rn[:, 2] * 6.283 + t * 0.25 * (Rn[:, 3] - 0.5)
        D = np.stack([np.cos(ang), 0 * ang, np.sin(ang)], axis=1)
        L = size * (0.65 + 0.7 * Rn[:, 1])
        A = life.strokes(np.stack([X, np.full(len(X), 0.012), Z], axis=1), D, L, L * aspect, DAB + (Rn[:, 4] * 4).astype(np.int32),
                         pick(csh, Rn[:, 3]), pick(cli, Rn[:, 4]), N=np.tile([0.0, 1.0, 0.0], (len(X), 1)) + (Rn[:, :3] - 0.5) * 0.8,
                         r=Rn[:, 1], ph=Rn[:, 5] * 6.28, a=a, smin=2.2, haze=0.7, bias=0.3)
        return [(A, dict(passid=RIPPLE, reflect=False))]
    return act


def dragonflies(pts):
    """Blue darts over the water: hover, then a sudden straight dash."""
    pts = np.asarray(pts, np.float64)
    n = len(pts)
    ph = np.arange(n) * 1.7

    def act(env):
        t = env.t
        if t < 40 or t > 86:
            return []
        k = np.floor(t / 1.6 + ph)                       # a new perch every 1.6 s
        fr = (t / 1.6 + ph) - k
        e = smooth(0.0, 0.22, fr)                        # the dash is quick, then it hangs in the air
        def perch(kk):
            return np.stack([noise(kk * 0.37 + ph, 1.0, 0) - 0.5, 0.3 * noise(kk * 0.41, ph, 1), noise(kk * 0.29 + ph, 5.0, 2) - 0.5], axis=1) * [5.0, 1.0, 7.0]
        p = pts + perch(k - 1) * (1 - e)[:, None] + perch(k)[:, None][:, 0] * e[:, None]
        hd = perch(k) - perch(k - 1)
        hd = unit(hd + [0, 0, 1e-3])
        hov = 0.03 * np.sin(t * 30 + ph)
        p = p + [0, 1, 0] * hov[:, None]
        side = unit(np.cross(hd, [0, 1.0, 0]))
        body = life.strokes(p, hd, 0.11, 0.022, LENS, (0.12, 0.3, 0.62), (0.3, 0.62, 0.92), r=0.1, smin=1.6, haze=0.3)
        wings = life.strokes(np.concatenate([p + side * 0.05, p - side * 0.05]), np.concatenate([side, side]), 0.11, 0.035, LENS + 1,
                             (0.8, 0.86, 0.92), (0.96, 0.98, 1.0), r=0.1, smin=1.6, a=0.45 + 0.25 * np.tile(np.sin(t * 40 + ph), 2), haze=0.3)
        return [(life.merge([body, wings]), dict(reflect=True))]
    return act


# ----------------------------------------------------------------------------- the bridge
STONE_LI = pal((232, 212, 176), (240, 224, 192), (220, 196, 164), (236, 206, 184))
STONE_SH = pal((122, 112, 152), (138, 122, 152), (106, 106, 142), (128, 116, 130))
VAULT = pal((70, 74, 96), (84, 80, 98), (60, 76, 88), (92, 88, 92))
VAULT_LI = pal((128, 136, 110), (150, 146, 112), (110, 128, 120))
ZB = W.Z_BRIDGE
BW = 2.6                    # half the width of the bridge along the river
SPAN = 7.6                  # half span of the arch
RISE = 4.3
DECK = 5.5


def arch_y(u):
    """Height of the arch above the water at lateral offset u from the middle of the river."""
    return RISE * np.sqrt(np.clip(1 - (u / SPAN) ** 2, 0, 1))


def bridge(rng):
    G = []
    cx = float(W.rx(ZB))
    # the two faces
    for face, nz in ((ZB - BW, -1.0), (ZB + BW, 1.0)):
        sb = SB(rng)
        m = 3800
        u = rng.uniform(-24, 24, m)
        y = rng.uniform(-0.2, DECK + 0.95, m)
        gyv = np.array([props.gy(cx + uu, face) for uu in np.linspace(-24, 24, 49)])
        g = np.interp(u, np.linspace(-24, 24, 49), gyv)
        keep = (y > arch_y(u) + 0.05 * (np.abs(u) < SPAN)) & (y > g - 0.3) & (y < DECK + 0.95 - 0.02 * np.abs(u) ** 1.3)
        u, y, g = u[keep], y[keep], g[keep]
        m = len(u)
        par = y > DECK
        P = np.stack([cx + u, y, np.full(m, face) + nz * 0.02 * rng.random(m)], axis=1)
        D = unit(np.tile([1.0, 0.0, 0.0], (m, 1)) + rng.normal(0, 0.10, (m, 3)))
        L = 0.62 * np.clip(np.exp(rng.normal(0, 0.25, m)), 0.6, 1.6)
        # damp and moss low down, sun-bleached stone above
        low = smooth(1.6, 0.2, y - g)[:, None]
        cli = mix(pick(STONE_LI, rng.random(m)), pal((150, 160, 110))[0], 0.55 * low)
        sb.add(P, D, L, L * 0.5, DASH + rng.integers(0, 8, m), pick(STONE_SH, rng.random(m)), cli,
               N=np.tile([0.0, 0.15, nz], (m, 1)), smin=4.5, occ=np.where(par, 1.0, 0.92))
        # the ring of the arch: longer stones set radially
        a = np.linspace(0.04, np.pi - 0.04, 46)
        for rr, w in ((1.0, 1.0), (1.045, 0.6)):
            P = np.stack([cx + SPAN * rr * np.cos(a), RISE * rr * np.sin(a) + 0.05, np.full(len(a), face) + nz * 0.04], axis=1)
            Dr = unit(np.stack([np.cos(a) * RISE, np.sin(a) * SPAN, 0 * a], axis=1))
            P = P + rng.normal(0, 0.04, P.shape); Dr = unit(Dr + rng.normal(0, 0.18, Dr.shape))
            sb.add(P, Dr, 0.46 * np.exp(rng.normal(0, 0.18, len(a))), 0.34, DASH + rng.integers(0, 8, len(a)), pick(STONE_SH, rng.random(len(a))),
                   pick(pal((250, 236, 204), (244, 226, 190)), rng.random(len(a))), N=np.tile([0.0, 0.3, nz], (len(a), 1)), smin=4.0, bias=0.03)
        # ivy spilling over the parapet
        for k in range(9):
            u0 = rng.uniform(-20, 20)
            crown(sb, (cx + u0, DECK + 0.5 - rng.uniform(0, 1.2), face + nz * 0.25), (rng.uniform(0.8, 2.2), rng.uniform(0.6, 1.5), 0.3), 0,
                  G_SH, G_LI, 0.26, rng, flex=0.05, smin=4.0, cover=1.0)
        G.append(sb.group(name='bridgeface'))
    # the vault, in two halves so that each sorts properly as the camera passes beneath
    for half in (0, 1):
        sb = SB(rng)
        m = 2600
        a = rng.uniform(0.0, np.pi, m)
        zz = rng.uniform(ZB - BW, ZB, m) if half == 0 else rng.uniform(ZB, ZB + BW, m)
        P = np.stack([cx + SPAN * np.cos(a), RISE * np.sin(a), zz], axis=1)
        N = -unit(np.stack([np.cos(a) / SPAN, np.sin(a) / RISE, 0 * a], axis=1))
        D = unit(np.tile([0.0, 0.0, 1.0], (m, 1)) + rng.normal(0, 0.12, (m, 3)))
        sb.add(P, D, 0.75, 0.36, DASH + rng.integers(0, 8, m), pick(VAULT, rng.random(m)), pick(VAULT_LI, rng.random(m)),
               N=N + [0, 1.0, 0], smin=5.0, occ=0.5)
        G.append(sb.group(name='vault'))
    # the road over it: parapet tops, and the roadway where it runs off into the lanes
    sb = SB(rng)
    for face, nz in ((ZB - BW, -1.0), (ZB + BW, 1.0)):
        m = 240
        u = rng.uniform(-24, 24, m)
        P = np.stack([cx + u, DECK + 0.95 - 0.02 * np.abs(u) ** 1.3, np.full(m, face)], axis=1)
        sb.add(P, unit(np.tile([1.0, 0, 0], (m, 1)) + rng.normal(0, 0.05, (m, 3))), 0.7, 0.22, DASH + rng.integers(0, 8, m),
               pick(STONE_SH, rng.random(m)), pick(pal((252, 240, 210), (246, 230, 196)), rng.random(m)), N=np.tile([0.0, 1.0, 0.0], (m, 1)), smin=4.0, bias=0.04)
    G.append(sb.group(name='parapet'))
    return G


def caustics(rng):
    """Light thrown up from the water, wavering on the underside of the arch."""
    cx = float(W.rx(ZB))
    m = 150
    a = rng.uniform(0.25, np.pi - 0.25, m)
    zz = rng.uniform(ZB - BW + 0.2, ZB + BW - 0.2, m)
    P = np.stack([cx + (SPAN - 0.04) * np.cos(a), (RISE - 0.04) * np.sin(a), zz], axis=1)
    D = unit(np.stack([-np.sin(a), np.cos(a), rng.normal(0, 0.5, m)], axis=1))
    ph = rng.uniform(0, 6.28, m)
    rr = rng.random(m)

    def act(env):
        t = env.t
        if abs(env.C[2] - ZB) > 45:
            return []
        w = np.sin(t * 1.7 + ph) * np.sin(t * 0.9 + ph * 2.1 + P[:, 2])
        al = 0.7 * smooth(0.15, 0.8, w)
        A = life.strokes(P, D, 0.75, 0.16, LENS + (rr * 4).astype(np.int32), (0.72, 0.8, 0.56), (0.9, 0.92, 0.62), r=rr * 0.3,
                         a=al, emis=1.0, smin=3.0, bias=0.06)
        return [(A, dict(reflect=False))]
    return act


def build(rng):
    from shots import clear_of_path
    G = []
    surf.SHADOWS.append(summer_shade)
    surf.WATER_EXTRA.append(water_colour)
    for sd in (-1, 1):
        z = 62.0
        while z < 147.0:
            z += rng.uniform(5.5, 8.5)
            back = rng.uniform(1.8, 4.5)
            x = float(W.rx(z)) + sd * (float(W.hw(z)) + back)
            h = rng.uniform(10.0, 15.5)
            G.append(river_tree(rng, x, z, h, -sd, willow=rng.random() < 0.38))
            # a second rank behind, to close the green wall
            if rng.random() < 0.8:
                G.append(river_tree(rng, x + sd * rng.uniform(7, 12), z + rng.uniform(-3, 3), rng.uniform(12, 18), -sd, dens=0.8))
    for sd in (-1, 1):
        ptsl = [(float(W.rx(z)) + sd * (float(W.hw(z)) + 22 + 4 * np.sin(z * 0.2)), z) for z in np.arange(56, 160, 13.0)]
        G += props.treeline(rng, ptsl, h=17.0, wid=11.0, psh=G_SH, pli=G_LI, size=0.8, dens=0.8, flex=0.15)
    # undergrowth between the trunks, so that the reach is a closed green room
    U_SH = pal((18, 60, 58), (26, 74, 62), (20, 54, 78), (34, 84, 58))
    U_LI = pal((70, 136, 70), (104, 160, 72), (150, 190, 86), (84, 146, 92))
    for sd in (-1, 1):
        for back, hh in ((5.5, 4.5), (11.0, 7.5)):
            ptsl = [(float(W.rx(z)) + sd * (float(W.hw(z)) + back + 1.5 * np.sin(z * 0.4)), z) for z in np.arange(60, 150, 7.0)]
            G += props.treeline(rng, ptsl, h=hh * 1.25, wid=6.5, psh=U_SH, pli=U_LI, size=0.46, dens=1.25, flex=0.12)
    G += bridge(rng)
    return [g for g in G if g is not None]


def actors(rng):
    P_LI = pal((255, 250, 246), (255, 240, 242), (252, 224, 232), (255, 246, 230))
    P_SH = pal((206, 200, 232), (214, 196, 224), (196, 196, 230))

    def pdens(x, z, d):
        return 0.5 * smooth(-10.0, 25.0, z) * smooth(118.0, 70.0, z) * (0.4 + 0.6 * noise(x / 3.0, z / 6.0, 2))
    acts = [reeds, weeds, floaters(881, 0.42, 0.085, P_SH, P_LI, pdens, tmax=74.0), caustics(rng)]
    df = [(float(W.rx(z)) + dx, 0.5 + 0.4 * (i % 3), z) for i, (z, dx) in enumerate(((84, -2), (96, 2.5), (108, -1), (118, 3), (128, -2.5), (138, 1)))]
    acts.append(dragonflies(df))
    import boat
    acts.append(boat.make(rng))
    return acts
