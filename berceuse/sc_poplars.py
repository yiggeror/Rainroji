"""Autumn and winter on the same reach: the poplars of the Epte in gold, and then - after the
mist - the same trees bare above the snow, a wattle fence, a gate, a magpie, a village across
the ice.  (after the 'Peupliers' series, 'La Pie' and the winters at Vetheuil and Lavacourt)"""
import math
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise, mix
from core import SB, F, Group
from trees import pick, unit, crown, limb
import props, surf, life
import world as W

# how each kind of thing comes and goes with the year (film time -> 0..1); see world.py
def f_autumn(t):          # the leaves of the old year
    return 1.0 - W.fall()


def f_winter(t):          # frost on the twigs
    return min(W.winter(), 1.0 - W.bloom())


def f_snow(t):            # snow lying on things
    return W.snowcover()


def f_built(t):           # fence, farm and village: they are there when the mist lifts
    return W.winter()


def f_spring(t):          # the new leaf, the blossom
    return W.bloom()


GOLD_LI = pal((255, 216, 92), (252, 194, 72), (255, 234, 134), (246, 164, 72), (238, 204, 112), (255, 244, 170))
GOLD_SH = pal((184, 108, 104), (156, 100, 132), (204, 132, 88), (126, 112, 142), (170, 120, 70))
GREENGOLD_LI = pal((226, 214, 100), (240, 226, 112), (200, 200, 96), (250, 222, 110), (186, 190, 96))
GREENGOLD_SH = pal((110, 124, 100), (96, 110, 120), (140, 120, 90))
RUST_LI = pal((236, 150, 80), (224, 120, 72), (250, 186, 96), (206, 96, 80), (240, 208, 120))
RUST_SH = pal((120, 72, 104), (104, 70, 116), (140, 84, 90), (96, 86, 120))
PTR_LI = pal((232, 210, 196), (240, 222, 204), (220, 196, 190))
PTR_SH = pal((122, 106, 152), (138, 116, 150), (106, 100, 146))
NEW_LI = pal((196, 220, 112), (218, 230, 132), (170, 204, 100), (232, 236, 150))
NEW_SH = pal((104, 150, 112), (90, 136, 120), (120, 160, 104))
BLOS_LI = pal((255, 252, 246), (255, 244, 240), (253, 232, 236), (250, 214, 224), (244, 190, 208), (255, 248, 226))
BLOS_SH = pal((206, 196, 228), (188, 186, 224), (222, 198, 220), (176, 190, 226), (214, 176, 206))
SNOW_LI = pal((255, 248, 238), (255, 240, 232), (250, 236, 240), (255, 250, 246))
SNOW_SH = pal((168, 178, 228), (184, 186, 232), (154, 168, 220), (196, 190, 226))
TWIG_LI = pal((226, 190, 196), (236, 204, 200), (214, 180, 200), (240, 214, 196))
TWIG_SH = pal((128, 112, 160), (146, 122, 160), (112, 106, 150))
BARE_LI = pal((176, 150, 150), (196, 166, 150), (160, 140, 156))
BARE_SH = pal((70, 62, 98), (84, 68, 96), (60, 60, 96))

POPLARS = []           # (x, z, height) of the bank line
FENCE_X = 22.0         # the fence stands this far back from the water's edge
Z0, Z1 = 204.0, 266.0  # extent of the fence
GATE_Z = 240.0


def edge_x(z, back):
    return float(W.rx(z)) + float(W.hw(z)) + back


def _grp(sb, name, fade=None):
    g = sb.group(name=name)
    if g is not None and fade is not None:
        g.fade = fade
    return g


def poplar(rng, x, z, h, far=False):
    """A poplar through the year: trunk; gold leaf that the wind takes; frost; new green."""
    out = []
    y0 = props.gy(x, z)
    base = np.array([x, y0, z])
    top = np.array([x + rng.normal(0, 0.25), y0 + h, z + rng.normal(0, 0.25)])
    sb = SB(rng)
    limb(sb, (x, y0 - 0.1, z), top, 0.34, 0.10, PTR_SH, PTR_LI, rng, bend=rng.uniform(-0.012, 0.012), flex1=0.25, n=int(h / 1.1))
    # the broom of fine branches (hidden inside the leaf in autumn, bare in winter)
    nb = int(h * 0.75)
    for i in range(nb):
        f = 0.30 + 0.68 * (i + rng.random()) / nb
        p0 = base + (top - base) * f
        a = rng.uniform(0, 6.283)
        ln = rng.uniform(1.6, 3.4) * (1.15 - 0.6 * f) * h / 25.0
        p1 = p0 + np.array([math.cos(a) * ln * 0.42, ln, math.sin(a) * ln * 0.42])
        limb(sb, p0, p1, 0.07, 0.03, BARE_SH, BARE_LI, rng, bend=rng.uniform(-0.1, 0.1), flex1=0.12, n=4, smin=3.5)
    out.append(_grp(sb, 'poplar'))
    # leaf: autumn gold, and the same crown again in the pale green of spring
    k0 = 0.30 + rng.uniform(0, 0.16)
    n = int(h * 0.9)
    slim = rng.uniform(0.62, 1.0)
    tone = rng.random()
    pli = GOLD_LI if tone < 0.6 else (RUST_LI if tone < 0.8 else GREENGOLD_LI)
    psh = GOLD_SH if tone < 0.8 else GREENGOLD_SH
    sa, sp = SB(rng), SB(rng)
    for i in range(n):
        f = k0 + (1 - k0) * (i + rng.random()) / n
        wdt = (0.5 + 1.35 * math.sin(math.pi * min((f - k0) / (1 - k0) * 0.95 + 0.05, 1.0)) ** 0.6) * h / 25.0 * slim * rng.uniform(0.7, 1.25)
        if rng.random() < 0.14:
            continue
        c = base + (top - base) * f + rng.normal(0, 0.4, 3)
        rad = (wdt, 1.4 * h / 25.0 + 0.5, wdt)
        crown(sa, c, rad, 0, psh, pli, 0.34 if not far else 0.5, rng, flex=0.10 + 0.35 * f, smin=6.0,
              cover=0.62 if not far else 0.5, droop=-0.3, wli=[3, 3, 2.5, 1.6, 2, 1.5], occ_lo=0.4)
        crown(sp, c, np.array(rad) * 0.85, 0, NEW_SH, NEW_LI, 0.30 if not far else 0.46, rng, flex=0.10 + 0.35 * f, smin=6.0,
              cover=0.40 if not far else 0.34, droop=-0.3, occ_lo=0.5)
    out.append(_grp(sa, 'poplar_leaf', f_autumn))
    out.append(_grp(sp, 'poplar_new', f_spring))
    # frost
    sw = SB(rng)
    m = int(h * 9)
    f = 0.36 + 0.64 * rng.random(m) ** 0.8
    wdt = (0.5 + 1.2 * np.sin(np.pi * np.minimum((f - 0.3) / 0.7, 1.0)) ** 0.6) * h / 25.0
    a = rng.uniform(0, 6.283, m)
    rr = wdt * np.sqrt(rng.random(m))
    P = base[None] + (top - base)[None] * f[:, None] + np.stack([np.cos(a) * rr, 0 * a, np.sin(a) * rr], axis=1)
    sw.add(P, unit(np.tile([0.0, 1.0, 0.0], (m, 1)) + rng.normal(0, 0.35, (m, 3))), 0.62 * np.exp(rng.normal(0, 0.25, m)), 0.11,
           np.where(rng.random(m) < 0.5, SCUM, DASH) + rng.integers(0, 4, m), pick(TWIG_SH, rng.random(m)), pick(TWIG_LI, rng.random(m)),
           N=unit(np.stack([np.cos(a), 0.2 + 0 * a, np.sin(a)], axis=1)), flex=0.08 + 0.2 * f, smin=5.0, a=0.62)
    out.append(_grp(sw, 'poplar_frost', f_winter))
    return out


def bush(rng, x, z, r, h, psh, pli, size=0.34, blossom=False):
    """Thorn and willow scrub: russet, then bare twigs under snow, then green or white with blossom."""
    out = []
    y0 = props.gy(x, z)
    sb = SB(rng)
    for i in range(int(6 + r * 3)):
        a = rng.uniform(0, 6.283)
        p1 = np.array([x + math.cos(a) * r * rng.uniform(0.3, 1.0), y0 + h * rng.uniform(0.6, 1.1), z + math.sin(a) * r * rng.uniform(0.3, 1.0)])
        limb(sb, (x + rng.normal(0, 0.3), y0, z + rng.normal(0, 0.3)), p1, 0.06, 0.025, BARE_SH, BARE_LI, rng, bend=rng.uniform(-0.15, 0.15), n=4, smin=3.0)
    out.append(_grp(sb, 'bush_twigs'))
    sa = SB(rng)
    crown(sa, (x, y0 + h * 0.5, z), (r, h * 0.55, r), 0, psh, pli, size, rng, flex=0.10, smin=5.0, cover=1.0)
    out.append(_grp(sa, 'bush_leaf', f_autumn))
    sw = SB(rng)
    crown(sw, (x, y0 + h * 0.62, z), (r, h * 0.45, r), 0, TWIG_SH, TWIG_LI, size * 1.3, rng, flex=0.05, smin=5.0, cover=0.5, spr=SCUM, a=0.5)
    out.append(_grp(sw, 'bush_frost', f_winter))
    ss = SB(rng)
    crown(ss, (x, y0 + h * 0.86, z), (r * 0.85, h * 0.2, r * 0.85), 0, SNOW_SH, SNOW_LI, size * 1.25, rng, flex=0.0, smin=5.0, cover=0.55, occ_lo=0.7)
    out.append(_grp(ss, 'bush_snow', f_snow))
    sp = SB(rng)
    if blossom:
        crown(sp, (x, y0 + h * 0.5, z), (r, h * 0.55, r), 0, NEW_SH, NEW_LI, size * 0.85, rng, flex=0.10, smin=5.0, cover=0.35)
        crown(sp, (x, y0 + h * 0.55, z), (r * 1.05, h * 0.55, r * 1.05), 0, BLOS_SH, BLOS_LI, size * 0.8, rng, flex=0.10, smin=5.0, cover=0.75,
              wli=[3, 3, 2.5, 2, 1.2, 1.5], occ_lo=0.4)
    else:
        crown(sp, (x, y0 + h * 0.5, z), (r, h * 0.55, r), 0, NEW_SH, NEW_LI, size, rng, flex=0.10, smin=5.0, cover=0.9)
    out.append(_grp(sp, 'bush_new', f_spring))
    return out


APPLE_LI = pal((236, 60, 50), (250, 110, 60), (246, 196, 80), (220, 40, 52))
APPLE_SH = pal((150, 30, 60), (170, 50, 50), (160, 110, 60))
FRUIT = []            # (x, z, crown height, radius) of the fruit trees, for their shade in spring


def fruit_tree(rng, x, z, s=1.0, dens=1.0):
    """An old apple tree by the water: russet leaf, then snow along every bough, then blossom."""
    out = []
    y0 = props.gy(x, z)
    th = rng.uniform(1.5, 1.9) * s
    top = np.array([x + rng.normal(0, 0.2), y0 + th, z + rng.normal(0, 0.2)])
    BSH = pal((66, 54, 84), (80, 60, 82), (56, 54, 88))
    BLI = pal((150, 118, 116), (170, 134, 120), (136, 112, 126))
    sb, sa, ss, sp = SB(rng), SB(rng), SB(rng), SB(rng)
    limb(sb, (x, y0 - 0.05, z), top, 0.36 * s, 0.27 * s, BSH, BLI, rng, bend=0.06)
    nb = rng.integers(5, 7)
    a0 = rng.uniform(0, 6.28)
    for b in range(nb):
        a = a0 + b * 6.283 / nb + rng.normal(0, 0.25)
        r = rng.uniform(2.1, 3.1) * s
        tip = top + np.array([np.cos(a) * r, rng.uniform(1.0, 2.3) * s, np.sin(a) * r])
        pts = limb(sb, top, tip, 0.17 * s, 0.07 * s, BSH, BLI, rng, bend=rng.uniform(-0.18, 0.18), flex1=0.05)
        # snow lying along the bough
        m = len(pts)
        ss.add(pts + [0, 0.09 * s, 0], unit((tip - top)[None] + rng.normal(0, 0.05, (m, 3))), np.linalg.norm(tip - top) / m * 1.6, 0.12 * s,
               DAB + rng.integers(0, 4, m), pick(SNOW_SH, rng.random(m)), pick(SNOW_LI, rng.random(m)), N=np.tile([0.0, 1.0, 0.0], (m, 1)), smin=3.0, bias=0.05)
        for k in range(3):
            f = (0.45, 0.78, 1.05)[k]
            c = top + (tip - top) * f + rng.normal(0, 0.3, 3) * s + [0, 0.25 * s, 0]
            rad = np.array([1.25, 0.85, 1.25]) * s * rng.uniform(0.8, 1.15)
            # twigs
            for j in range(4):
                e = c + rng.normal(0, 0.42, 3) * s
                limb(sb, top + (tip - top) * f * 0.92, e, 0.035 * s, 0.018 * s, BSH, BLI, rng, bend=rng.uniform(-0.35, 0.35), n=5, smin=3.0, flex1=0.06)
            crown(sa, c, rad, int(150 * dens), RUST_SH, RUST_LI, 0.22 * s, rng, flex=0.10, smin=5.5)
            crown(sa, c - [0, 0.25 * s, 0], rad * 0.85, int(16 * dens), APPLE_SH, APPLE_LI, 0.13 * s, rng, flex=0.05, smin=3.0, aspect=0.9, occ_lo=0.8)
            crown(sp, c, rad * 0.9, int(60 * dens), NEW_SH, NEW_LI, 0.20 * s, rng, flex=0.08, smin=5.0)
            crown(sp, c, rad, int(230 * dens), BLOS_SH, BLOS_LI, 0.23 * s, rng, flex=0.10, smin=5.5, wli=[3, 3, 2.5, 2, 1.2, 1.5], occ_lo=0.35)
    c = top + [0, 2.3 * s, 0]
    crown(sa, c, np.array([1.6, 1.0, 1.6]) * s, int(200 * dens), RUST_SH, RUST_LI, 0.22 * s, rng, flex=0.12, smin=5.5)
    crown(sp, c, np.array([1.6, 1.0, 1.6]) * s, int(280 * dens), BLOS_SH, BLOS_LI, 0.23 * s, rng, flex=0.12, smin=5.5, wli=[3, 3, 2.5, 2, 1.2, 1.5], occ_lo=0.4)
    FRUIT.append((x, z, y0 + th + 1.6 * s, 3.2 * s))
    return [_grp(sb, 'fruit'), _grp(sa, 'fruit_leaf', f_autumn), _grp(ss, 'fruit_snow', f_snow), _grp(sp, 'fruit_blossom', f_spring)]


def hurdle(rng, x0, z0, x1, z1, h=1.25):
    """A stretch of wattle fence; the snow on it is a second set of strokes (it melts)."""
    sb = SB(rng)
    sbs = SB(rng)
    ln = math.hypot(x1 - x0, z1 - z0)
    d = np.array([x1 - x0, 0, z1 - z0]) / ln
    nrm = np.array([d[2], 0, -d[0]])
    wl = pal((176, 140, 124), (196, 156, 130), (160, 128, 126))
    ws = pal((66, 58, 96), (80, 64, 98), (58, 62, 104), (92, 72, 96))
    m = int(ln * 260)
    s = rng.random(m) * ln
    v = (np.floor(rng.random(m) * 11) + 0.5 + rng.normal(0, 0.12, m)) / 11.0
    g = np.array([props.gy(x0 + d[0] * ss, z0 + d[2] * ss) for ss in np.linspace(0, ln, 12)])
    gy_ = np.interp(s, np.linspace(0, ln, 12), g)
    wav = 0.028 * np.sin(s * 4.65 + np.floor(v * 11) * np.pi)
    P = np.stack([x0 + d[0] * s, gy_ + 0.08 + v * (h - 0.1) + wav, z0 + d[2] * s], axis=1) + nrm[None] * rng.normal(0, 0.03, (m, 1))
    D = unit(d[None] + np.stack([0 * s, 0.13 * np.cos(s * 4.65 + np.floor(v * 11) * np.pi), 0 * s], axis=1) + rng.normal(0, 0.03, (m, 3)))
    sb.add(P, D, 0.24 * np.exp(rng.normal(0, 0.2, m)), 0.07, DASH + rng.integers(0, 8, m), pick(ws, rng.random(m)), pick(wl, rng.random(m)),
           N=np.tile(nrm + [0, 0.3, 0], (m, 1)) * np.where(rng.random(m) < 0.5, 1, -1)[:, None], smin=3.0, occ=(0.25 + 0.5 * v) * (rng.random(m) < 0.45))
    # stakes
    for ss in np.arange(0.3, ln, 1.35):
        px, pz = x0 + d[0] * ss, z0 + d[2] * ss
        yy = float(np.interp(ss, np.linspace(0, ln, 12), g))
        limb(sb, (px, yy + 0.08, pz), (px + rng.normal(0, 0.03), yy + h + rng.uniform(0.0, 0.2), pz), 0.085, 0.07, ws, wl, rng, n=6, smin=3.0, bias=0.02)
    # snow along the top
    m = int(ln * 7)
    s = rng.random(m) * ln
    gy_ = np.interp(s, np.linspace(0, ln, 12), g)
    P = np.stack([x0 + d[0] * s, gy_ + h + 0.06 + 0.03 * rng.random(m), z0 + d[2] * s], axis=1)
    sbs.add(P, unit(d[None] + rng.normal(0, 0.08, (m, 3))), 0.40, 0.17, DAB + rng.integers(0, 4, m), pick(SNOW_SH, rng.random(m)), pick(SNOW_LI, rng.random(m)),
            N=np.tile([0.0, 1.0, 0.0], (m, 1)) + nrm[None] * rng.normal(0, 0.5, (m, 1)), smin=3.0, bias=0.04)
    return sb, sbs


def gate(rng, x, z, w=3.3, h=1.2):
    """A five-barred gate, a little ajar with age, snow on the top rail."""
    sb = SB(rng)
    sbs = SB(rng)
    y0 = props.gy(x, z)
    wl = pal((170, 136, 126), (190, 152, 132))
    ws = pal((62, 56, 96), (76, 62, 98))
    for i in range(5):
        yy = y0 + 0.16 + i * (h - 0.2) / 4
        limb(sb, (x, yy, z - w / 2), (x + 0.02, yy + 0.02 * (i - 2), z + w / 2), 0.085, 0.08, ws, wl, rng, n=9, smin=2.5)
    limb(sb, (x, y0 + 0.14, z - w / 2), (x, y0 + h - 0.04, z + w / 2), 0.07, 0.065, ws, wl, rng, n=9, smin=2.5)
    limb(sb, (x, y0 + 0.14, z), (x, y0 + h - 0.04, z), 0.07, 0.065, ws, wl, rng, n=4, smin=2.5)
    for zz in (z - w / 2, z + w / 2):
        limb(sb, (x, y0 + 0.1, zz), (x, y0 + h + 0.2, zz), 0.17, 0.15, ws, wl, rng, n=7, smin=3.0, bias=0.02)
        sbs.add(np.array([[x, y0 + h + 0.37, zz]]), (0, 0, 1), 0.28, 0.17, DAB, SNOW_SH[0], SNOW_LI[0], smin=2.5, bias=0.05)
    m = 16
    zz = z - w / 2 + w * (np.arange(m) + 0.5) / m
    sbs.add(np.stack([np.full(m, x), np.full(m, y0 + h + 0.03) + 0.02 * rng.random(m), zz], axis=1), (0, 0, 1), 0.3, 0.10, DAB + rng.integers(0, 4, m),
            pick(SNOW_SH, rng.random(m)), pick(SNOW_LI, rng.random(m)), smin=2.5, bias=0.05)
    return sb, sbs, np.array([x, y0 + h + 0.085, z + 0.45])


# ----------------------------------------------------------------------------- shadows
_TRUNKS = []          # (x, z, width, length factor)


def long_shadows(env, x, z):
    """Low sun: the poplars lay long blue bars across the field, the fence a broken band."""
    t = env.t
    if env.C[2] < 140.0:
        return None
    S = env.sun
    if S[1] < 0.004:
        return None
    el = max(S[1], 0.03)
    hx, hz = -S[0], -S[2]
    hn = math.hypot(hx, hz)
    hx, hz = hx / hn, hz / hn
    reach = 1.0 / (el / hn)                      # shadow length per metre of height
    out = np.zeros(len(x), F)
    near = (np.abs(x - env.C[0]) < 400)
    for (tx, tz, wd, hh) in _TRUNKS:
        dx, dz = x - tx, z - tz
        along = dx * hx + dz * hz
        across = np.abs(-dx * hz + dz * hx)
        m = (along > 0) & (along < hh * reach) & (across < 2.5)
        if m.any():
            k = along[m] / (hh * reach)
            wloc = wd * (1 + 5.0 * k)          # the crown's shadow is wider and softer than the trunk's
            out[m] = np.maximum(out[m], smooth(wloc, wloc * 0.45, across[m]) * (1 - 0.55 * k) * smooth(1.0, 0.85, k))
    w = W.winter() if hx > 0.25 else 0.0
    if w > 0:
        # the fence: shadow thrown toward the viewer, with the light coming through the gate
        fx = W.rx(z) + W.hw(z) + FENCE_X
        dd = (x - fx) / max(hx, 0.2)
        zsrc = z - dd * hz
        flen = 5.2 + 0.8 * np.sin(zsrc * 0.9)
        infence = (zsrc > Z0) & (zsrc < Z1) & (dd > 0) & (dd < flen)
        gatebars = (np.abs(zsrc - GATE_Z) < 1.3)
        dens = np.where(gatebars, 0.35 + 0.4 * np.sin(dd / flen * 30.0), 0.82 + 0.1 * np.sin(zsrc * 4.6))
        out = np.maximum(out, w * infence * dens * smooth(flen, flen * 0.82, dd))
    return out * float(smooth(0.004, 0.03, S[1]))


def water_tone(env, x, z, rnd, rgb, d):
    return rgb


def farmyard(rng):
    """What lies about an orchard at apple time: baskets, a ladder against a tree, a heap of leaves."""
    out = []
    WK_SH = pal((110, 80, 70), (124, 90, 74))
    WK_LI = pal((214, 170, 110), (226, 186, 124))
    for (zz, back) in ((222.5, 16.0), (224.0, 15.0), (245.0, 16.5), (248.5, 7.5)):
        sb = SB(rng)
        x = edge_x(zz, back)
        y0 = props.gy(x, zz)
        crown(sb, (x, y0 + 0.2, zz), (0.3, 0.2, 0.3), 0, WK_SH, WK_LI, 0.11, rng, flex=0.0, smin=2.5, cover=2.0, aspect=0.5, spr=DASH)
        crown(sb, (x, y0 + 0.4, zz), (0.24, 0.08, 0.24), 0, APPLE_SH, APPLE_LI, 0.11, rng, flex=0.0, smin=2.5, cover=1.8, aspect=0.9, occ_lo=0.9)
        out.append(_grp(sb, 'basket', f_autumn))
    sb = SB(rng)                                   # the ladder
    x, zz = edge_x(221.6, 16.6), 221.6
    y0 = props.gy(x, zz)
    for dz in (-0.25, 0.25):
        limb(sb, (x - 1.5, y0, zz + dz), (x - 0.2, y0 + 3.3, zz + dz), 0.06, 0.05, WK_SH, WK_LI, rng, n=8, smin=2.5)
    for k in range(8):
        f = (k + 0.7) / 8.6
        limb(sb, (x - 1.5 + 1.3 * f, y0 + 3.3 * f, zz - 0.25), (x - 1.5 + 1.3 * f, y0 + 3.3 * f, zz + 0.25), 0.04, 0.04, WK_SH, WK_LI, rng, n=2, smin=2.5)
    out.append(_grp(sb, 'ladder', f_autumn))
    sb = SB(rng)                                   # the heap of leaves that is burning
    x, zz = BONFIRE[0], BONFIRE[2]
    crown(sb, (x, props.gy(x, zz) + 0.3, zz), (1.1, 0.4, 1.1), 0, RUST_SH, RUST_LI, 0.2, rng, flex=0.0, smin=3.0, cover=1.6)
    out.append(_grp(sb, 'leafheap', f_autumn))
    return out


def flock(rng, n=9):
    """White geese about the yard: they wander, stop, stretch a neck, put a head down to the grass."""
    home = np.array([edge_x(238.0, 5.0), 0.0, 238.0])
    off = np.stack([rng.uniform(-2.2, 2.6, n), np.zeros(n), rng.uniform(-9.0, 8.0, n)], axis=1)
    ph = rng.uniform(0, 100, n)

    def act(env):
        t = env.t
        w = max(1.0 - W.winter(), W.bloom())
        if w <= 0.02 or env.C[2] < 150:
            return []
        P, D, L, Wd, cs, cl = [], [], [], [], [], []
        WH, WHL, OR = (0.70, 0.72, 0.90), (1.0, 0.98, 0.94), (0.95, 0.55, 0.15)
        for i in range(n):
            def at(tt):
                return home + off[i] + np.array([2.2 * (noise(tt * 0.045 + ph[i], 0.3, 0) - 0.5) * 2, 0, 2.2 * (noise(tt * 0.04 + ph[i], 5.0, 1) - 0.5) * 2])
            p = at(t)
            v = at(t + 0.5) - p
            sp = np.linalg.norm(v) / 0.5
            hd = v / (np.linalg.norm(v) + 1e-6)
            p[1] = props.gy(p[0], p[2])
            wad = 0.03 * np.sin(t * 7.0 + ph[i]) * min(sp * 4, 1.0)
            peck = max(0.0, np.sin(t * 0.5 + ph[i])) ** 6
            b = p + [0, 0.30 + abs(wad) * 0.3, 0]
            sd = np.array([-hd[2], 0, hd[0]])
            nk0 = b + hd * 0.20 + [0, 0.08, 0]
            nk1 = b + hd * (0.30 + 0.25 * peck) + np.array([0, 0.42 - 0.62 * peck, 0])
            P += [b + sd * wad, b - hd * 0.22 + [0, 0.05, 0], (nk0 + nk1) / 2, nk1 + hd * 0.03, nk1 + hd * 0.11, p + [0, 0.09, 0]]
            D += [hd + [0, 0.15, 0], hd + [0, 0.5, 0], nk1 - nk0, hd, hd, [0, 1, 0]]
            L += [0.52, 0.24, float(np.linalg.norm(nk1 - nk0)) + 0.06, 0.12, 0.09, 0.18]
            Wd += [0.30, 0.16, 0.09, 0.10, 0.04, 0.05]
            cs += [WH, WH, WH, WH, OR, OR]
            cl += [WHL, WHL, WHL, WHL, OR, OR]
        A = life.strokes(np.array(P), np.array(D), np.array(L), np.array(Wd), DAB + (np.arange(len(P)) % 4), np.array(cs), np.array(cl),
                         N=np.tile([0.2, 0.9, 0.1], (len(P), 1)), r=0.05, smin=1.8, haze=0.6, a=0.96 * w)
        return [(A, dict(reflect=False))]
    return act


def sails(rng):
    """Sailing boats on the wide water below the poplars, as at Argenteuil."""
    boats = []
    for (z0, dx, v, hgt) in ((196.0, 3.0, -0.45, 7.5), (224.0, -5.0, -0.6, 8.5), (252.0, 6.0, -0.35, 7.0), (286.0, -9.0, -0.5, 8.0)):
        m = 70
        u, w_ = rng.random(m), rng.random(m)
        w_ = w_ * (1 - u)                                   # a triangle: tall at the mast, running out to the boom end
        boats.append((z0, dx, v, hgt, u, w_, rng.random(m), rng.uniform(0, 6.28)))

    def act(env):
        t = env.t
        w = 1.0 - W.fall()
        if w <= 0.02 or env.C[2] < 120:
            return []
        out = []
        for (z0, dx, v, hgt, u, w_, rr, ph) in boats:
            z = z0 + v * (t - 100.0)
            x = float(W.rx(z)) + dx + 2.0 * np.sin(t * 0.05 + ph)
            heel = 0.10 + 0.05 * np.sin(t * 0.6 + ph)
            base = np.array([x, 0.0, z])
            fw = np.array([0.25, 0.0, -1.0]); fw /= np.linalg.norm(fw)
            sd = np.array([-fw[2], 0, fw[0]])
            up = np.array([0, 1.0, 0]) * np.cos(heel) + sd * np.sin(heel)
            k = len(u)
            S_ = base[None] + up[None] * (0.7 + (hgt - 0.9) * w_)[:, None] - fw[None] * (0.15 + 3.4 * u)[:, None] + sd[None] * (0.25 * np.sin(np.pi * u))[:, None]
            sail = life.strokes(S_, np.tile(up, (k, 1)), 1.25, 0.62, DASH + (rr * 8).astype(np.int32), (0.72, 0.72, 0.90), (1.0, 0.97, 0.90),
                                N=np.tile(sd + [0, 0.2, 0], (k, 1)), r=rr * 0.5, ph=rr * 6.28, smin=2.5, haze=0.8, flex=0.03, a=0.96 * w)
            hs = np.linspace(-2.2, 2.2, 9)
            hull = life.strokes(base[None] + fw[None] * hs[:, None] + [0, 0.22, 0], np.tile(fw, (9, 1)), 0.9, 0.34, DASH, (0.50, 0.40, 0.52), (0.98, 0.94, 0.86),
                                N=np.tile(sd + [0, 0.6, 0], (9, 1)), r=0.1, smin=2.5, haze=0.8, a=0.96 * w)
            ms = np.linspace(0.3, hgt, 8)
            mast = life.strokes(base[None] + up[None] * ms[:, None], np.tile(up, (8, 1)), hgt / 8 * 1.6, 0.07, DASH, (0.36, 0.28, 0.34), (0.70, 0.56, 0.46), r=0.1,
                                smin=2.0, haze=0.8, a=0.96 * w)
            out.append((life.merge([hull, sail, mast]), dict(reflect=True)))
        return out
    return act


BONFIRE = (0.0, 0.0, 0.0)


TREE_Z = 238.0         # the old apple tree on the bank, in a gap of the poplar line: the film ends in it
TREE_BACK = 2.6


def build(rng):
    global BONFIRE
    BONFIRE = (edge_x(253.0, 17.5), 0.0, 253.0)
    G = []
    surf.SHADOWS.append(long_shadows)
    surf.SHADOWS.append(fruit_shade)
    # ---- the line of poplars along the east bank, following every turn of the river
    z = 163.0
    while z < 336.0:
        z += rng.uniform(5.6, 7.4)
        if abs(z - TREE_Z) < 5.2:
            continue
        x = edge_x(z, rng.uniform(3.0, 4.6))
        h = rng.uniform(22.0, 27.0)
        from shots import clear_of_path as _cop
        if not _cop(x, z, 3.2):
            continue
        G += poplar(rng, x, z, h)
        POPLARS.append((x, z, h))
        _TRUNKS.append((x, z, 0.35, h))
    # a second line far across the fields, turning back toward the river
    for i in range(30):
        f = (i + rng.uniform(-0.45, 0.45)) / 29.0
        if rng.random() < 0.5:
            continue
        z = 190.0 + 330.0 * f
        x = edge_x(min(z, 330.0), 0) + 80.0 + 95.0 * math.sin(f * math.pi) + rng.normal(0, 5)
        G += poplar(rng, x, z, rng.uniform(19, 30), far=True)
    # ---- west bank: willows and thorn
    for i in range(46):
        z = rng.uniform(160.0, 345.0)
        x = float(W.rx(z)) - float(W.hw(z)) - rng.uniform(1.5, 26.0)
        r, h = rng.uniform(2.0, 4.5), rng.uniform(2.5, 7.0)
        if 200.0 < z < 292.0:
            r, h = r * 0.5, h * 0.4
        G += bush(rng, x, z, r, h, RUST_SH, RUST_LI if rng.random() < 0.6 else GOLD_LI, size=0.36, blossom=rng.random() < 0.5)
    for i in range(22):
        z = rng.uniform(165.0, 340.0)
        if abs(z - TREE_Z) < 6.0:
            continue
        x = edge_x(z, rng.uniform(1.0, 3.0))
        if not _cop(x, z, 9.0):
            continue
        G += bush(rng, x, z, rng.uniform(1.0, 2.2), rng.uniform(1.2, 2.6), RUST_SH, RUST_LI, size=0.3, blossom=rng.random() < 0.6)
    # ---- woods closing the west and the north: autumn, frost, spring
    far_sh = pal((132, 104, 150), (150, 110, 140), (118, 110, 160))
    far_li = pal((236, 176, 110), (244, 200, 120), (220, 150, 110), (250, 220, 150))
    wsh = pal((120, 116, 170), (136, 124, 172), (108, 112, 164))
    wli = pal((226, 204, 214), (236, 216, 214), (214, 196, 216))
    gsh = pal((116, 150, 140), (104, 140, 150), (130, 156, 150))
    gli = pal((190, 220, 130), (210, 228, 150), (170, 206, 128), (236, 226, 226))
    for back, lo, hi in ((60.0, 150.0, 205.0), (60.0, 292.0, 420.0), (112.0, 190.0, 310.0)):
        ptsl = [(float(W.rx(z)) - float(W.hw(z)) - back - 20 * math.sin(z * 0.03), z) for z in np.arange(lo, hi, 20.0)]
        for (psh_, pli_, dn, fd) in ((far_sh, far_li, 0.8, f_autumn), (wsh, wli, 0.45, f_winter), (gsh, gli, 0.7, f_spring)):
            for g in props.treeline(rng, ptsl, h=15.0, wid=12.0, psh=psh_, pli=pli_, size=0.95, dens=dn):
                g.fade = fd
                G.append(g)
    hill_sh = pal((150, 140, 190), (164, 150, 196), (140, 140, 186))
    hill_li = pal((226, 190, 180), (236, 204, 190), (214, 184, 196))
    G.append(props.ridge(rng, 3.6, 6.6, 1100.0, 150.0, 5.0, hill_sh, hill_li, size=80.0, n=420, cx=0.0, cz=240.0))
    G.append(props.ridge(rng, -0.6, 0.9, 1300.0, 120.0, 8.0, hill_sh, hill_li, size=90.0, n=260, cx=0.0, cz=240.0))

    # ---- fruit trees: the old one on the bank, and a few by the farm
    G += fruit_tree(rng, edge_x(TREE_Z, TREE_BACK), TREE_Z, s=1.7, dens=1.6)
    from shots import clear_of_path
    for (zz, back, sc_) in ((205.0, 17.5, 1.2), (216.5, 3.5, 1.15), (221.0, 18.5, 1.25), (229.0, 4.0, 1.1), (250.0, 5.0, 1.2), (246.5, 19.0, 1.25),
                            (263.0, 26.0, 1.1), (272.0, 14.0, 1.25), (214.0, 32.0, 1.1), (251.0, 36.0, 1.0), (268.0, 5.0, 1.1)):
        if clear_of_path(edge_x(zz, back), zz, 9.5):
            G += fruit_tree(rng, edge_x(zz, back), zz, s=sc_)
    G += farmyard(rng)

    # ---- the fence and its gate, the farm, the village over the river (they stand clear when the mist lifts)
    def built(g, snow=None):
        if g is not None:
            G.append(g)
        if snow is not None:
            snow.fade = f_snow
            G.append(snow)

    zs = np.arange(Z0, Z1 + 0.1, 4.0)
    for i in range(len(zs) - 1):
        za, zb = zs[i], zs[i + 1]
        spans = [(za, zb)]
        if abs((za + zb) / 2 - GATE_Z) < 2.0:
            spans = [(za, GATE_Z - 1.75), (GATE_Z + 1.75, zb)]
        for (a_, b_) in spans:
            if b_ - a_ > 0.3:
                sbf, sbsn = hurdle(rng, edge_x(a_, FENCE_X), a_, edge_x(b_, FENCE_X), b_)
                built(sbf.group(name='fence'), sbsn.group(name='fence_snow'))
    gsb, gsn, perch = gate(rng, edge_x(GATE_Z, FENCE_X), GATE_Z)
    built(gsb.group(name='gate'), gsn.group(name='gate_snow'))
    build.perch = perch
    wall = pal((236, 214, 196), (244, 224, 204), (226, 200, 190), (240, 210, 186))
    wall_sh = pal((126, 116, 160), (140, 124, 160), (116, 112, 156))
    roofs = [(pal((190, 124, 110), (204, 138, 112), (176, 110, 110)), pal((112, 84, 122), (124, 90, 120))),
             (pal((150, 150, 176), (164, 160, 184)), pal((92, 94, 140), (102, 100, 146)))]
    rf = roofs[0]
    farm = props.house(rng, edge_x(259.0, 11.0), 259.0, w=10.0, d=6.5, h=3.4, rh=3.0, yaw=0.5, wall=wall, wall_sh=wall_sh,
                       roof=rf[0], roof_sh=rf[1], size=0.5, snow=1.0)
    built(farm, farm.snow)
    build.farm = farm
    # the village climbs the far bank in tiers: big houses and small, a barn, garden trees, the church above
    VILL = []
    k = 0
    for tier, (b0, b1, n) in enumerate(((7.0, 16.0, 7), (20.0, 34.0, 8), (38.0, 58.0, 9))):
        for i in range(n):
            z = 212.0 + 70.0 * (i + rng.uniform(0.1, 0.9)) / n
            x = float(W.rx(z)) - float(W.hw(z)) - rng.uniform(b0, b1)
            big = rng.random() < 0.35
            w_ = rng.uniform(10, 14) if big else rng.uniform(6, 9)
            rf = roofs[0 if rng.random() < 0.7 else 1]
            yaw = rng.normal(1.5, 0.3) if rng.random() < 0.7 else rng.normal(0.1, 0.3)
            hh = props.house(rng, x, z, w=w_, d=rng.uniform(5.5, 7.5), h=rng.uniform(4.2, 6.0) if big else rng.uniform(3.0, 4.2),
                             rh=rng.uniform(2.6, 3.8), yaw=yaw, wall=wall, wall_sh=wall_sh, roof=rf[0], roof_sh=rf[1], size=0.5,
                             snow=1.0, chimney=rng.random() < 0.8)
            built(hh, hh.snow)
            VILL.append(hh)
            if rng.random() < 0.45:          # a lean-to against the gable
                c_, s_ = math.cos(yaw), math.sin(yaw)
                ax = np.array([c_, 0, s_])
                p = np.array([x, 0, z]) + ax * (w_ / 2 + 1.6)
                le = props.house(rng, p[0], p[2], w=3.2, d=4.2, h=2.3, rh=1.4, yaw=yaw, wall=wall, wall_sh=wall_sh, roof=rf[0], roof_sh=rf[1],
                                 size=0.45, snow=1.0, chimney=False)
                built(le, le.snow)
            if rng.random() < 0.6:           # a tree in the garden
                tz = z + rng.uniform(-6, 6)
                tx = x + rng.uniform(4, 9)
                if rng.random() < 0.5:
                    G += fruit_tree(rng, tx, tz, s=rng.uniform(0.9, 1.3), dens=0.7)
                else:
                    G += bush(rng, tx, tz, rng.uniform(1.6, 2.6), rng.uniform(3.5, 6.0), RUST_SH, GOLD_LI, size=0.4, blossom=rng.random() < 0.5)
    cz = 247.0
    ch = props.church(rng, float(W.rx(cz)) - float(W.hw(cz)) - 66.0, cz, yaw=1.45, scale=0.9, snow=1.0)
    built(ch, ch.snow)
    build.village = VILL
    return [g for g in G if g is not None]


def fruit_shade(env, x, z):
    """In the returned spring the fruit trees throw their dapple on the new grass."""
    w = W.bloom()
    if w <= 0.02 or env.sun[1] < 0.05:
        return None
    S = env.sun
    out = np.zeros(len(x), F)
    k = 1.0 / max(S[1], 0.25)
    for (tx, tz, h, r) in FRUIT:
        dx = x - (tx - S[0] * k * (h - 0.4))
        dz = z - (tz - S[2] * k * (h - 0.4))
        m = (np.abs(dx) < 3 * r) & (np.abs(dz) < 3 * r)
        if m.any():
            d2 = (dx[m] ** 2 + dz[m] ** 2) / (r * r * 1.25)
            out[m] = np.maximum(out[m], np.exp(-d2 * d2))
    return out * w * (0.55 + 0.45 * noise(x / 1.3, z / 1.3, 3))


LEAF_LI = pal((255, 214, 90), (250, 186, 70), (255, 232, 130), (240, 150, 64), (226, 110, 60))
LEAF_SH = pal((190, 120, 80), (170, 100, 100), (204, 140, 70), (150, 90, 90))
T_FLY = 154.2


def leaves(env):
    """Gold leaves let go from the poplars: a few on every gust, and then the wind takes them all."""
    t = env.t
    fl = W.fall()
    if env.C[2] < 120.0 or fl >= 0.999:
        return []
    storm = math.sin(math.pi * fl) ** 0.7 if fl > 0 else 0.0        # thickest while the trees are being stripped

    def dens(x, z):
        d = W.edge(x, z)
        east = x > W.rx(z)
        near = np.where(east, smooth(34.0, 6.0, np.abs(d - 4.0)), 0.25 * smooth(-30.0, 0.0, d))
        return (0.10 + 0.5 * env.wind(x, z) + 0.55 * storm) * near * smooth(158.0, 172.0, z) * (1 - fl ** 3)
    A = life.falling(env, 421, 1.25, 38.0, 27.0, 1.25 + 1.0 * storm, (1.2 + 2.2 * storm, 0.5 + 0.8 * storm), 0.13, LEAF_SH, LEAF_LI, dens,
                     layers=3, tumble=4.2 + 2.0 * storm, sway=0.6, swirl=0.9 + 0.8 * storm, smin=2.2, aspect=0.62)
    return [(A, dict(reflect=True))]


def blossom_fall(env):
    """Spring come round: petals from the fruit trees."""
    w = W.bloom()
    if w < 0.35:
        return []
    PL = pal((255, 250, 246), (255, 240, 242), (252, 224, 232), (255, 246, 230))
    PS = pal((206, 200, 232), (214, 196, 224), (196, 196, 230))

    def dens(x, z):
        near = np.zeros(len(x))
        for (tx, tz, h, r) in FRUIT:
            near = np.maximum(near, np.exp(-((x - tx) ** 2 + (z - tz) ** 2) / (2.2 * r) ** 2))
        return (0.25 + 0.5 * env.wind(x, z)) * near * float(smooth(0.35, 0.9, w))
    A = life.falling(env, 317, 0.9, 26.0, 8.5, 0.55, (0.6, 0.3), 0.10, PS, PL, dens, layers=3, tumble=3.4, sway=0.45, smin=2.0)
    return [(A, dict(reflect=True))]


def rain(env):
    """The spring rain: fine slanting strokes, close ones long and pale, far ones a grey veil."""
    r = float(env.L['rain'])
    if r <= 0.02:
        return []
    from core import footprint, _cells
    t = env.t
    out = []
    for (cell, R, H, L0, wd, al, seed) in ((0.5, 16.0, 13.0, 0.85, 0.020, 0.72, 811), (1.3, 50.0, 24.0, 1.9, 0.05, 0.42, 813)):
        vy = 9.5
        drift = (1.7, 0.6)
        x0, x1, z0, z1 = footprint(env, env.C[1] - 1.5, R)
        for lay in range(3):
            shx, shz = drift[0] * t * (0.9 + 0.1 * lay), drift[1] * t * (0.9 + 0.1 * lay)
            X, Z, Rn = _cells(int(math.floor((x0 - shx) / cell)) - 1, int(math.floor((x1 - shx) / cell)) + 2, int(math.floor((z0 - shz) / cell)) - 1,
                              int(math.floor((z1 - shz) / cell)) + 2, lay, seed, cell, env.C[0] - shx, env.C[2] - shz, R * R)
            if len(X) == 0:
                continue
            keep = Rn[:, 3] < 0.85 * r
            X, Z, Rn = X[keep] + shx, Z[keep] + shz, Rn[keep]
            if len(X) == 0:
                continue
            u = np.mod(Rn[:, 0] + t * vy / H * (0.85 + 0.3 * Rn[:, 1]), 1.0)
            Y = np.maximum(W.ground(X, Z), 0.0) + (1 - u) * H
            n = len(X)
            D = unit(np.tile([0.17, -1.0, 0.06], (n, 1)) + (Rn[:, :3] - 0.5) * 0.04)
            col = np.clip(env.L['hor'][None, :] * 0.45 + 0.55 * np.array([0.90, 0.94, 1.0]) + 0.08, 0, 1)
            A = life.strokes(np.stack([X, Y, Z], axis=1), D, L0 * (0.7 + 0.6 * Rn[:, 4]), wd, LENS + (Rn[:, 5] * 4).astype(np.int32), col * 0.9, col,
                             r=Rn[:, 1] * 0.5, ph=Rn[:, 5] * 6.28, a=al * (0.6 + 0.4 * Rn[:, 2]) * smooth(0.0, 0.04, u) * smooth(1.0, 0.97, u),
                             smin=1.2, emis=0.7, haze=0.5)
            out.append((A, dict(reflect=False)))
    return out


def rain_rings(env):
    """Rings where the rain meets the river: each opens, widens and is gone."""
    r = float(env.L['rain'])
    if r <= 0.02 or env.C[1] > 30:
        return []
    from core import scatter, RIPPLE
    t = env.t
    X, Z, Rn = scatter(env, 823, 0.62, 44.0, 0.0)
    if len(X) == 0:
        return []
    d = W.edge(X, Z)
    keep = (d < -0.2) & (Rn[:, 0] < 0.8 * r)
    if not keep.any():
        return []
    X, Z, Rn = X[keep], Z[keep], Rn[keep]
    ph = np.mod(Rn[:, 1] + t * (0.9 + 0.5 * Rn[:, 2]), 1.0)
    rad = 0.05 + 0.42 * ph
    n = len(X)
    P, D, L, col = [], [], [], []
    for sgn, c in ((-1, (0.90, 0.95, 1.0)), (1, (0.16, 0.22, 0.36))):       # the near edge catches the light, the far edge is dark
        P.append(np.stack([X, np.full(n, 0.012), Z], axis=1) - sgn * env.fw[None, :] * [1, 0, 1] * rad[:, None])
        D.append(np.tile(env.rt * [1, 0, 1], (n, 1)))
        L.append(rad * 2.1)
        col.append(np.tile(c, (n, 1)))
    col = np.concatenate(col)
    A = life.strokes(np.concatenate(P), np.concatenate(D), np.concatenate(L), np.tile(0.03 + 0.025 * ph, 2), LENS + np.tile((Rn[:, 3] * 4).astype(np.int32), 2),
                     col, col, r=np.tile(Rn[:, 4] * 0.4, 2), a=np.tile(0.7 * (1 - ph) ** 1.3, 2), smin=1.2, emis=0.6, haze=0.5, bias=0.5)
    return [(A, dict(passid=RIPPLE, reflect=False))]


def snow(env):
    t = env.t
    s = float(env.L['snow'])
    if s <= 0.01:
        return []
    out = []
    A = life.falling(env, 611, 0.85, 24.0, 16.0, 1.0, (0.35, 0.15), 0.075, SNOW_SH, SNOW_LI, lambda x, z: np.full(len(x), 0.8 * s), layers=3,
                     tumble=1.6, sway=0.25, swirl=0.35, smin=1.0, aspect=0.9, emis=0.35, haze=0.2, round_=True)
    out.append((A, dict(reflect=False)))
    B = life.falling(env, 613, 2.6, 85.0, 30.0, 1.0, (0.35, 0.15), 0.17, SNOW_SH, SNOW_LI, lambda x, z: np.full(len(x), 0.8 * s), layers=3,
                     tumble=1.2, sway=0.4, swirl=0.5, smin=1.0, aspect=0.9, emis=0.35, haze=0.35, round_=True)
    out.append((B, dict(reflect=False)))
    return out


def mist(env):
    """Banks of mist: big dry scumbles hanging in the air, thick where the year turns."""
    m = float(env.L['mist'])
    if m <= 0.02:
        return []
    from core import footprint, _cells
    t = env.t
    c = 9.0
    R = 150.0
    x0, x1, z0, z1 = footprint(env, env.C[1] - 6.0, R)
    out = []
    for lay in range(3):
        sh = 1.2 * t * (1 + 0.3 * lay)
        X, Z, Rn = _cells(int(math.floor((x0 - sh) / c)) - 1, int(math.floor((x1 - sh) / c)) + 2, int(math.floor(z0 / c)) - 1, int(math.floor(z1 / c)) + 2,
                          lay, 907, c, env.C[0] - sh, env.C[2], R * R)
        if len(X) == 0:
            continue
        X = X + sh
        Y = 1.0 + 34.0 * Rn[:, 0] ** 1.3 + 2.0 * np.sin(t * 0.2 + Rn[:, 5] * 6.28)
        L = 7.0 + 9.0 * Rn[:, 1]
        col = env.L['haze'][None, :] * (0.97 + 0.06 * Rn[:, 2:3])
        A = life.strokes(np.stack([X, Y, Z], axis=1), unit(np.stack([np.ones(len(X)), 0.15 * (Rn[:, 3] - 0.5), 0.6 * (Rn[:, 4] - 0.5)], axis=1)),
                         L, L * 0.42, SCUM + (Rn[:, 4] * 4).astype(np.int32), col, col + 0.03, r=Rn[:, 1] * 0.3, ph=Rn[:, 5] * 6.28,
                         a=0.42 * m * (0.5 + 0.5 * Rn[:, 3]), smin=2.0, emis=1.0, haze=0.0)
        out.append((A, dict(reflect=False)))
    return out


def smoke(tops, gain=None):
    tops = [np.asarray(p, np.float64) for p in tops]

    def act(env):
        t = env.t
        if env.C[2] < 150.0:
            return []
        wb = 0.55 + 0.45 * W.winter()
        out = []
        n = 16
        for j, top in enumerate(tops):
            age = ((t / 9.0 + np.arange(n) / n + j * 0.37) % 1.0) * 9.0
            wob = np.sin(age * 0.9 + j) * 0.25 * age ** 0.7
            P = top[None] + np.stack([0.42 * age + wob, 0.85 * age ** 0.92, 0.2 * age + 0.5 * wob], axis=1)
            L = 0.7 + 0.42 * age
            a = 0.55 * smooth(0.0, 0.8, age) * (1 - age / 9.0) ** 1.3 * (wb * (1 - 0.6 * W.bloom()) if gain is None else gain(t))
            D = unit(np.stack([0.5 + 0 * age, np.ones(n), 0.2 * np.sin(age + j)], axis=1))
            out.append(life.strokes(P, D, L, L * 0.6, SCUM + (np.arange(n) % 4), (0.56, 0.56, 0.74), (0.96, 0.84, 0.80),
                                    N=np.tile(-env.sun * [1, 0, 1] + [0, 0.5, 0], (n, 1)), r=0.2, a=a, smin=2.0, haze=0.6))
        return [(life.merge(out), dict(reflect=False))]
    return act


def lamps(frames, rng):
    """Windows that light one after another as the day goes."""
    pts, nrm = [], []
    for fr in frames:
        for (p, n_) in props.windows(*fr, rng):
            pts.append(p); nrm.append(n_)
    pts, nrm = np.array(pts), np.array(nrm)
    pts[:, 1] += rng.normal(0, 0.18, len(pts))
    m = len(pts)
    order = rng.random(m)
    on = rng.random(m) < 0.8
    fl = rng.uniform(0, 6.28, m)

    def act(env):
        lv = float(env.L['lamps'])
        t = env.t
        if env.C[2] < 150.0:
            return []
        wb = 1.0
        lit = smooth(order * 0.8, order * 0.8 + 0.2, lv) * on
        flick = 0.9 + 0.1 * np.sin(t * 3.0 + fl)
        dark = life.strokes(pts, (0, 1, 0), 0.8, 0.5, DAB, (0.24, 0.23, 0.38), (0.34, 0.31, 0.44), N=nrm, r=0.2, a=0.8 * (1 - lit) * wb, smin=2.0, bias=0.05)
        warm = life.strokes(pts + nrm * 0.03, (0, 1, 0), 0.95, 0.62, DAB + 1, (1.0, 0.72, 0.30), (1.0, 0.80, 0.42), N=nrm, r=0.2, a=0.97 * lit * flick,
                            smin=3.2, emis=1.0, bias=0.08, haze=0.3)
        glow = life.strokes(pts + nrm * 0.3, (1, 0, 0), 4.2, 3.0, SCUM + 2, (1.0, 0.66, 0.30), (1.0, 0.66, 0.30), N=nrm, r=0.2, a=0.24 * lit * flick,
                            smin=3.0, emis=1.0, bias=0.3, haze=0.3)
        return [(life.merge([dark, warm, glow]), dict(reflect=True))]
    return act


def magpie_pos(t):
    """Where the magpie is: on the gate, then up over the old apple tree, out across the river,
    high above the roofs and away toward the sun."""
    p0 = build.perch
    tau = t - T_FLY
    if tau <= 0:
        hop = 0.35 * float(smooth(-4.0, -3.6, tau))            # one sidestep along the rail before it goes
        return p0 + np.array([0.0, 0.03 * math.sin(math.pi * float(smooth(-4.0, -3.6, tau))), -hop]), np.array([0.0, 0.0, -1.0]), 0.0
    sp = 8.5 * (1 - math.exp(-tau / 1.3))
    dist = 8.5 * (tau - 1.3 * (1 - math.exp(-tau / 1.3)))
    # out through the gap north of the apple tree, low; then round to the south-west and up, into the light
    turn = float(smooth(2.0, 9.0, tau))
    ang = 0.30 - 0.85 * turn
    hd = np.array([-math.cos(ang), 0.0, math.sin(ang)])
    # integrate the turning course in a few steps (the heading changes slowly)
    pos = p0 + [0, 0, -0.35]
    n = 24
    for i in range(n):
        ti = tau * (i + 0.5) / n
        ai = 0.30 - 0.85 * float(smooth(2.0, 9.0, ti))
        vi = 8.5 * (1 - math.exp(-ti / 1.3))
        pos = pos + np.array([-math.cos(ai), 0.0, math.sin(ai)]) * vi * tau / n
    climb = float(smooth(2.0, 6.5, tau))
    y = 3.4 * (1 - math.exp(-tau / 1.1)) + 1.05 * max(tau - 3.0, 0.0) * climb + 0.2 * math.sin(tau * 2.3) * float(smooth(0.5, 2.0, tau))
    dy = 3.4 / 1.1 * math.exp(-tau / 1.1) + 1.05 * climb + 0.46 * math.cos(tau * 2.3) * float(smooth(0.5, 2.0, tau))
    pos = pos + [0, y, 0]
    vel = hd * max(sp, 0.5) + [0, dy, 0]
    return pos, vel / np.linalg.norm(vel), sp


def magpie(env):
    t = env.t
    if W.winter() < 0.1 or t > T_FLY + 17:
        return []
    pos, fw, sp = magpie_pos(t)
    tau = t - T_FLY
    far = float(np.linalg.norm(pos - env.C))
    gone = float(smooth(175.0, 95.0, far)) * W.winter()          # it dwindles into the sky; it never just stops
    BLK, BLK_LI = (0.07, 0.07, 0.15), (0.20, 0.24, 0.42)
    WHT, WHT_LI = (0.66, 0.70, 0.90), (1.0, 0.97, 0.92)
    TAIL, TAIL_LI = (0.06, 0.12, 0.22), (0.16, 0.36, 0.46)
    up = np.array([0.0, 1.0, 0.0])
    P, D, L, Wd, cs, cl = [], [], [], [], [], []

    K = 1.55

    def add(p, d, l, w, a, b):
        P.append(pos + (np.asarray(p, np.float64) - pos) * K); D.append(d); L.append(l * K); Wd.append(w * K); cs.append(a); cl.append(b)
    if tau <= 0:
        # perched: body upright-ish, tail down and flicking, head turning
        flick = 0.5 * max(0.0, math.sin(t * 2.4)) ** 6 + 0.25 * max(0.0, math.sin(t * 1.1 + 2.0)) ** 10
        crouch = float(smooth(-0.35, -0.05, tau)) * 0.04
        turn = 0.6 * math.sin(t * 0.7) + (1.2 if math.sin(t * 0.43) > 0.6 else 0.0)
        f = np.array([0.0, 0.0, -1.0])                      # it faces south along the rail
        b = pos + [0, 0.075 - crouch, 0]
        add(b, unit(f * 0.8 + up * 0.6), 0.20, 0.105, BLK, BLK_LI)
        add(b + f * 0.02 - up * 0.035 + [-0.02, 0, 0], unit(f * 0.8 + up * 0.5), 0.13, 0.07, WHT, WHT_LI)        # belly
        add(b - f * 0.03 + up * 0.035 + [-0.03, 0, 0], unit(f + up * 0.4), 0.10, 0.045, WHT, WHT_LI)              # shoulder patch
        hd = b + f * 0.085 + up * 0.10
        hf = unit(f * math.cos(turn) + np.array([-1.0, 0, 0]) * math.sin(turn))
        add(hd, hf, 0.085, 0.07, BLK, BLK_LI)
        add(hd + hf * 0.055, hf, 0.05, 0.016, (0.05, 0.05, 0.08), (0.2, 0.2, 0.25))                                # bill
        tl = unit(-f * 0.75 - up * (0.5 - 0.5 * flick))
        add(b - f * 0.07 + tl * 0.13, tl, 0.25, 0.035, TAIL, TAIL_LI)
        add(b - up * 0.09, up, 0.06, 0.012, (0.1, 0.1, 0.14), (0.3, 0.3, 0.36))                                    # legs
    else:
        rt = unit(np.cross(up, fw))
        u2 = np.cross(fw, rt)
        # quick beats, then a short glide: the way a magpie rows itself through the air
        beat = (tau * 5.4) % 4.0
        fl = math.sin(tau * 5.4 * 2 * math.pi) if beat < 3.1 else 0.25
        amp = 1.05 if tau < 1.2 else 0.8
        phi = 0.15 + amp * fl
        b = pos
        add(b, fw, 0.21, 0.085, BLK, BLK_LI)
        add(b - u2 * 0.028 - fw * 0.01, fw, 0.13, 0.055, WHT, WHT_LI)
        add(b + fw * 0.12, fw, 0.075, 0.06, BLK, BLK_LI)
        add(b - fw * 0.22, unit(fw + u2 * 0.08), 0.27, 0.035, TAIL, TAIL_LI)
        for sgn in (-1, 1):
            w = unit(rt * sgn * math.cos(phi) + u2 * math.sin(phi) - fw * 0.15)
            add(b + w * 0.085 + fw * 0.02, w, 0.17, 0.085, BLK, BLK_LI)
            add(b + w * 0.215 + fw * 0.0, w, 0.16, 0.075, WHT, WHT_LI)
            add(b + w * 0.30 - fw * 0.01, w, 0.07, 0.05, BLK, BLK_LI)
    n = len(P)
    A = life.strokes(np.array(P), np.array(D), np.array(L), np.array(Wd), LENS + (np.arange(n) % 4), np.array(cs), np.array(cl),
                     N=np.tile([-0.5, 0.7, -0.2], (n, 1)), r=0.05, smin=1.4, haze=0.9, bias=0.02 * np.arange(n) / n, a=0.96 * gone)
    return [(A, dict(reflect=False))]


def ice_dens(x, z, d):
    return W.snowcover() * (0.18 + 0.5 * smooth(0.35, 0.7, noise(x / 14.0, z / 20.0, 1))) * smooth(150.0, 166.0, z) * (0.45 + 0.55 * smooth(-22.0, -2.0, d))


def leaf_dens(x, z, d):
    return (1 - W.winter()) * (0.10 + 0.5 * smooth(0.4, 0.75, noise(x / 5.0, z / 9.0, 2)) + 0.3 * W.fall()) * smooth(156.0, 170.0, z) * (0.3 + 0.7 * (x > W.rx(z)))


def petal_dens(x, z, d):
    near = np.zeros(len(x))
    for (tx, tz, h, r) in FRUIT[:3]:
        near = np.maximum(near, np.exp(-((x - tx) ** 2 + (z - tz) ** 2) / (4.0 * r) ** 2))
    return 0.6 * near * float(smooth(0.5, 1.0, W.bloom()))


def actors(rng):
    import sc_summer
    ICE_LI = pal((255, 244, 236), (255, 232, 224), (246, 236, 244), (255, 222, 200))
    ICE_SH = pal((170, 180, 228), (186, 188, 232), (156, 168, 222))
    PL = pal((255, 250, 246), (255, 240, 242), (252, 224, 232))
    PS = pal((206, 200, 232), (214, 196, 224))
    acts = [leaves,
            sc_summer.floaters(431, 0.5, 0.11, LEAF_SH, LEAF_LI, leaf_dens, speed=0.3, tmax=W.T_WINTER[1] + 1),
            sc_summer.floaters(641, 2.3, 1.9, ICE_SH, ICE_LI, ice_dens, speed=0.12, tmin=W.T_WINTER[0], tmax=W.T_THAW[1] + 0.5, aspect=0.6, R=170.0, sunny=2.2),
            sc_summer.floaters(643, 0.9, 0.6, ICE_SH, ICE_LI, ice_dens, speed=0.12, tmin=W.T_WINTER[0], tmax=W.T_THAW[1] + 0.5, aspect=0.62, R=60.0, sunny=2.2),
            sc_summer.floaters(645, 0.42, 0.085, PS, PL, petal_dens, speed=0.3, tmin=W.T_BLOOM[0] + 3),
            mist, magpie]
    tops = [build.farm.top] + [h.top for h in build.village[::3] if hasattr(h, 'top')]
    acts.append(smoke(tops))
    acts.append(lamps([build.farm.frame] + [h.frame for h in build.village], rng))
    acts.append(smoke([np.array([BONFIRE[0], props.gy(BONFIRE[0], BONFIRE[2]) + 0.5, BONFIRE[2]])], gain=lambda t: 1.3 * (1 - W.fall())))
    acts += [flock(rng), sails(rng)]
    acts += [snow, rain_rings, rain, blossom_fall]
    # wild geese going south, high over the poplars
    acts.append(life.geese(101.0, 121.0, (edge_x(250.0, 170.0), 60.0, 350.0), (-13.0, 0.2, -6.0)))
    acts.append(life.swallows([(edge_x(TREE_Z, -14.0), 5.0, TREE_Z + 4.0), (edge_x(TREE_Z, -30.0), 7.0, TREE_Z - 12.0)], 179.0, 205.0))
    return acts
