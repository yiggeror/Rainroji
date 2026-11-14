"""Spring: an orchard in blossom on the west bank, a village across the river.
(after Monet's 'Printemps' and the apple trees in bloom at Vetheuil)"""
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise
from core import SB, F
from trees import pick, unit, crown, limb
import props, surf, life, people
import world as W

BLOS_LI = pal((255, 252, 246), (255, 244, 240), (253, 232, 236), (250, 214, 224), (244, 190, 208), (255, 248, 226))
BLOS_SH = pal((206, 196, 228), (188, 186, 224), (222, 198, 220), (176, 190, 226), (214, 176, 206))
LEAF_LI = pal((176, 206, 104), (150, 190, 92), (200, 218, 120))
LEAF_SH = pal((92, 140, 104), (78, 124, 110), (104, 150, 96))
BARK_SH = pal((74, 58, 84), (88, 64, 80), (62, 56, 86))
BARK_LI = pal((156, 120, 112), (176, 138, 118), (140, 112, 124))

TREES = []        # (x, z, crown height, crown radius)  - for the shadows on the grass


def apple_tree(rng, x, z, s=1.0, lean=None, dens=1.0):
    sb = SB(rng)
    y0 = props.gy(x, z)
    th = rng.uniform(1.3, 1.8) * s
    lean = rng.normal(0, 0.25, 2) if lean is None else lean
    top = np.array([x + lean[0], y0 + th, z + lean[1]])
    limb(sb, (x, y0 - 0.05, z), top, 0.34 * s, 0.26 * s, BARK_SH, BARK_LI, rng, bend=0.06)
    nb = rng.integers(4, 6)
    a0 = rng.uniform(0, 6.28)
    cen = []
    for b in range(nb):
        a = a0 + b * 6.283 / nb + rng.normal(0, 0.25)
        r = rng.uniform(2.0, 3.0) * s
        tip = top + np.array([np.cos(a) * r, rng.uniform(1.2, 2.4) * s, np.sin(a) * r])
        limb(sb, top, tip, 0.17 * s, 0.07 * s, BARK_SH, BARK_LI, rng, bend=rng.uniform(-0.18, 0.18), flex1=0.05)
        for k in range(3):
            f = (0.45, 0.78, 1.05)[k]
            c = top + (tip - top) * f + rng.normal(0, 0.3, 3) * s + [0, 0.25 * s, 0]
            cen.append(c)
            rad = np.array([1.25, 0.85, 1.25]) * s * rng.uniform(0.8, 1.15)
            # a few young leaves first, then blossom over them
            crown(sb, c, rad * 0.9, int(60 * dens), LEAF_SH, LEAF_LI, 0.20 * s, rng, flex=0.08, smin=5.0)
            crown(sb, c, rad, int(210 * dens), BLOS_SH, BLOS_LI, 0.23 * s, rng, flex=0.10, smin=5.5,
                  wli=[3, 3, 2.5, 2, 1.2, 1.5], occ_lo=0.35)
    # crown of the crown
    c = top + [0, 2.3 * s, 0]
    crown(sb, c, np.array([1.6, 1.0, 1.6]) * s, int(260 * dens), BLOS_SH, BLOS_LI, 0.23 * s, rng, flex=0.12, smin=5.5,
          wli=[3, 3, 2.5, 2, 1.2, 1.5], occ_lo=0.4)
    TREES.append((x, z, y0 + th + 1.6 * s, 3.2 * s))
    return sb.group(name='apple')


def orchard_shadow(env, x, z):
    """Dappled shade under the apple trees: each crown throws a soft, broken patch."""
    if env.t > 62:
        return None
    S = env.sun
    out = np.zeros(len(x), F)
    k = 1.0 / max(S[1], 0.2)
    dap = 0.55 + 0.45 * noise(x / 1.3 + 0.1 * np.sin(env.t * 0.7), z / 1.3, 3)
    for (tx, tz, h, r) in TREES:
        dx = x - (tx - S[0] * k * (h - 0.4))
        dz = z - (tz - S[2] * k * (h - 0.4))
        m = (np.abs(dx) < 3 * r) & (np.abs(dz) < 3 * r)
        if m.any():
            d2 = (dx[m] ** 2 + dz[m] ** 2) / (r * r * 1.25)
            out[m] = np.maximum(out[m], np.exp(-d2 * d2))
    return out * dap


VILLAGE = []
FIGS = []          # (x, z, radius) of the figures, for their shadows

PETAL_LI = pal((255, 250, 246), (255, 240, 242), (252, 224, 232), (255, 246, 230))
PETAL_SH = pal((206, 200, 232), (214, 196, 224), (196, 196, 230), (220, 204, 220))


def fig_shadow(env, x, z):
    if env.t > 60:
        return None
    S = env.sun
    out = np.zeros(len(x), F)
    for (fx, fz, r) in FIGS:
        dx = x - (fx - S[0] / S[1] * 0.5)
        dz = z - (fz - S[2] / S[1] * 0.5)
        out = np.maximum(out, np.exp(-((dx / (r * 1.3)) ** 2 + (dz / (r * 1.0)) ** 2) ** 1.5))
    return out


def petals(env):
    """Blossom let go by the wind: thick under the trees, carried out over the river."""
    if env.t > 66:
        return []
    def dens(x, z):
        g = env.wind(x, z)
        d = W.edge(x, z)
        orch = smooth(70.0, 45.0, z) * np.where(x < W.rx(z), 1.0, 0.25)
        return (0.22 + 0.5 * g) * orch * float(smooth(1.0, 7.0, env.t))
    A = life.falling(env, 311, 1.0, 30.0, 7.5, 0.55, (0.75, 0.42), 0.10, PETAL_SH, PETAL_LI, dens, layers=3,
                     tumble=3.4, sway=0.45, smin=2.2)
    return [(A, dict(reflect=True))]


def build(rng):
    G = []
    # ---- the orchard: loose rows, with room left for the camera to drift through
    from shots import clear_of_path
    pts = []
    for zi in np.arange(-90.0, 46.0, 7.6):
        for xi in np.arange(5.0, 84.0, 7.4):
            x = W.rx(zi) - W.hw(zi) - xi + rng.normal(0, 1.6)
            z = zi + rng.normal(0, 1.6) + (3.8 if int(xi / 7.4) % 2 else 0.0)
            if clear_of_path(x, z, 4.3) and W.edge(np.array([x]), np.array([z]))[0] > 2.5 and (x + 3.0) ** 2 + (z + 2.0) ** 2 > 4.6 ** 2:
                pts.append((x, z))
    # the tree the film opens in
    G.append(apple_tree(rng, -21.5, -45.0, s=1.25, lean=np.array([0.2, 0.3]), dens=1.5))
    for (x, z) in pts:
        if (x + 21.5) ** 2 + (z + 45.0) ** 2 < 7.0 ** 2:
            continue
        G.append(apple_tree(rng, x, z, s=rng.uniform(0.85, 1.2)))
    surf.SHADOWS.append(orchard_shadow)
    # ---- the far bank: poplars and willows in new leaf, a village and its church
    far_sh = pal((120, 150, 150), (104, 138, 160), (136, 150, 170))
    far_li = pal((186, 214, 130), (206, 224, 150), (164, 200, 128), (226, 230, 170))
    ptsl = [(W.rx(z) + W.hw(z) + 5 + 3 * np.sin(z * 0.11), z) for z in np.arange(-110, 70, 14.0)]
    G += props.treeline(rng, ptsl, h=8.0, wid=6.5, psh=far_sh, pli=far_li, size=0.55, dens=0.9, trunks=(BARK_SH, BARK_LI))
    ptsl = [(W.rx(z) + W.hw(z) + 70 + 10 * np.sin(z * 0.05), z) for z in np.arange(-140, 200, 22.0)]
    G += props.treeline(rng, ptsl, h=13.0, wid=10.0, psh=far_sh, pli=far_li, size=0.9, dens=0.8)
    # blossom across the water too
    for i in range(14):
        z = rng.uniform(-90, 60)
        x = W.rx(z) + W.hw(z) + rng.uniform(16, 60)
        G.append(apple_tree(rng, x, z, s=rng.uniform(0.9, 1.2), dens=0.6))
    # village on the rise to the north-east
    vx, vz = 150.0, 150.0
    wall = pal((240, 226, 202), (246, 236, 214), (232, 212, 190), (244, 220, 200))
    roofs = [pal((214, 128, 96), (226, 146, 108), (198, 112, 100)), pal((150, 158, 190), (168, 172, 200), (136, 150, 184))]
    for i in range(16):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(8, 46)
        hx, hz = vx + r * np.cos(a) * 1.4, vz + r * np.sin(a)
        G.append(props.house(rng, hx, hz, w=rng.uniform(7, 11), d=rng.uniform(5.5, 7), h=rng.uniform(3.2, 5), rh=rng.uniform(2.4, 3.4),
                             yaw=rng.normal(0.3, 0.5), wall=wall, roof=roofs[rng.integers(0, 2)], size=0.8,
                             y=props.gy(hx, hz) + 2.0))
    G.append(props.church(rng, vx + 6, vz + 10, yaw=0.35, scale=1.0, y=props.gy(vx, vz) + 3.0))
    hill_sh = pal((150, 164, 200), (164, 170, 206), (140, 160, 190))
    hill_li = pal((190, 212, 196), (204, 220, 206), (178, 204, 200), (212, 214, 222))
    G.append(props.ridge(rng, -0.5, 2.2, 900.0, 120.0, 0.0, hill_sh, hill_li, size=70.0, n=420, cx=0.0, cz=0.0))
    G.append(props.ridge(rng, -0.9, 2.4, 1500.0, 190.0, 3.0, hill_sh, hill_li, size=110.0, n=380, cx=0.0, cz=0.0))
    return [g for g in G if g is not None]


def actors(rng):
    a1, f1 = people.reader(rng, -3.9, -3.4, 3.6)
    a2, f2 = people.child(rng, -1.6, -4.6, 3.3)
    FIGS.extend([f1, f2])
    surf.SHADOWS.append(fig_shadow)
    homes = [(-10.0, props.gy(-10, -12) + 0.9, -12.0), (-4.0, props.gy(-4, 2) + 0.8, 2.0), (-16.0, props.gy(-16, -22) + 1.1, -22.0),
             (3.0, props.gy(3, 12) + 0.7, 12.0), (-13.0, props.gy(-13, -4) + 1.3, -4.0)]
    sw = [(-2.0, props.gy(-2, -8) + 4.5, -8.0), (8.0, 4.0, 14.0), (-12.0, props.gy(-12, -24) + 5.5, -24.0), (14.0, 3.2, 40.0)]
    return [a1, a2, petals, life.butterflies(homes), life.swallows(sw, 6.0, 52.0)]
