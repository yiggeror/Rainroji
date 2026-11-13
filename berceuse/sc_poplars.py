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

T_SWAP = 107.6
AUT = (-1e9, T_SWAP)
WIN = (T_SWAP, 1e9)

GOLD_LI = pal((255, 216, 92), (252, 194, 72), (255, 234, 134), (246, 164, 72), (238, 204, 112), (255, 244, 170))
GOLD_SH = pal((184, 108, 104), (156, 100, 132), (204, 132, 88), (126, 112, 142), (170, 120, 70))
GREENGOLD_LI = pal((226, 214, 100), (240, 226, 112), (200, 200, 96), (250, 222, 110), (186, 190, 96))
GREENGOLD_SH = pal((110, 124, 100), (96, 110, 120), (140, 120, 90))
RUST_LI = pal((236, 150, 80), (224, 120, 72), (250, 186, 96), (206, 96, 80), (240, 208, 120))
RUST_SH = pal((120, 72, 104), (104, 70, 116), (140, 84, 90), (96, 86, 120))
PTR_LI = pal((232, 210, 196), (240, 222, 204), (220, 196, 190))
PTR_SH = pal((122, 106, 152), (138, 116, 150), (106, 100, 146))
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


def poplar(rng, x, z, h, golden=True, far=False):
    sb = SB(rng)
    y0 = props.gy(x, z)
    top = np.array([x + rng.normal(0, 0.25), y0 + h, z + rng.normal(0, 0.25)])
    limb(sb, (x, y0 - 0.1, z), top, 0.34, 0.10, PTR_SH, PTR_LI, rng, bend=rng.uniform(-0.012, 0.012), flex1=0.25, n=int(h / 1.1))
    if golden:
        k0 = 0.30 + rng.uniform(0, 0.16)
        n = int(h * 0.9)
        slim = rng.uniform(0.62, 1.0)
        tone = rng.random()
        pli = GOLD_LI if tone < 0.6 else (RUST_LI if tone < 0.8 else GREENGOLD_LI)
        psh = GOLD_SH if tone < 0.8 else GREENGOLD_SH
        for i in range(n):
            f = k0 + (1 - k0) * (i + rng.random()) / n
            wdt = (0.5 + 1.35 * math.sin(math.pi * min((f - k0) / (1 - k0) * 0.95 + 0.05, 1.0)) ** 0.6) * h / 25.0 * slim * rng.uniform(0.7, 1.25)
            if rng.random() < 0.14:
                continue
            c = np.array([x, y0, z]) + (top - [x, y0, z]) * f + rng.normal(0, 0.4, 3)
            crown(sb, c, (wdt, 1.4 * h / 25.0 + 0.5, wdt), 0, psh, pli, 0.34 if not far else 0.5, rng, flex=0.10 + 0.35 * f, smin=6.0,
                  cover=0.62 if not far else 0.5, droop=-0.3, wli=[3, 3, 2.5, 1.6, 2, 1.5], occ_lo=0.4)
    else:
        # bare: a broom of fine branches, frost on the twigs, snow lodged where it can lie
        nb = int(h * 0.75)
        for i in range(nb):
            f = 0.30 + 0.68 * (i + rng.random()) / nb
            p0 = np.array([x, y0, z]) + (top - [x, y0, z]) * f
            a = rng.uniform(0, 6.283)
            ln = rng.uniform(1.6, 3.4) * (1.15 - 0.6 * f) * h / 25.0
            p1 = p0 + np.array([math.cos(a) * ln * 0.42, ln, math.sin(a) * ln * 0.42])
            limb(sb, p0, p1, 0.07, 0.03, BARE_SH, BARE_LI, rng, bend=rng.uniform(-0.1, 0.1), flex1=0.12, n=4, smin=3.5)
        m = int(h * 9)
        f = 0.36 + 0.64 * rng.random(m) ** 0.8
        wdt = (0.5 + 1.2 * np.sin(np.pi * np.minimum((f - 0.3) / 0.7, 1.0)) ** 0.6) * h / 25.0
        a = rng.uniform(0, 6.283, m)
        rr = wdt * np.sqrt(rng.random(m))
        P = np.array([x, y0, z])[None] + (top - [x, y0, z])[None] * f[:, None] + np.stack([np.cos(a) * rr, 0 * a, np.sin(a) * rr], axis=1)
        sb.add(P, unit(np.tile([0.0, 1.0, 0.0], (m, 1)) + rng.normal(0, 0.35, (m, 3))), 0.62 * np.exp(rng.normal(0, 0.25, m)), 0.11,
               np.where(rng.random(m) < 0.5, SCUM, DASH) + rng.integers(0, 4, m), pick(TWIG_SH, rng.random(m)), pick(TWIG_LI, rng.random(m)),
               N=unit(np.stack([np.cos(a), 0.2 + 0 * a, np.sin(a)], axis=1)), flex=0.08 + 0.2 * f, smin=5.0, a=0.62)
    return sb


def bush(rng, x, z, r, h, psh, pli, size=0.34, snow=False, twigs=False):
    sb = SB(rng)
    y0 = props.gy(x, z)
    if twigs:
        for i in range(int(6 + r * 3)):
            a = rng.uniform(0, 6.283)
            p1 = np.array([x + math.cos(a) * r * rng.uniform(0.3, 1.0), y0 + h * rng.uniform(0.6, 1.1), z + math.sin(a) * r * rng.uniform(0.3, 1.0)])
            limb(sb, (x + rng.normal(0, 0.3), y0, z + rng.normal(0, 0.3)), p1, 0.06, 0.025, BARE_SH, BARE_LI, rng, bend=rng.uniform(-0.15, 0.15), n=4, smin=3.0)
        crown(sb, (x, y0 + h * 0.62, z), (r, h * 0.45, r), 0, TWIG_SH, TWIG_LI, size * 1.3, rng, flex=0.05, smin=5.0, cover=0.5, spr=SCUM, a=0.5)
    else:
        crown(sb, (x, y0 + h * 0.5, z), (r, h * 0.55, r), 0, psh, pli, size, rng, flex=0.10, smin=5.0, cover=1.0)
    if snow:
        crown(sb, (x, y0 + h * 0.86, z), (r * 0.85, h * 0.2, r * 0.85), 0, SNOW_SH, SNOW_LI, size * 1.25, rng, flex=0.0, smin=5.0, cover=0.55, occ_lo=0.7)
    return sb


def hurdle(rng, x0, z0, x1, z1, h=1.25):
    """A stretch of wattle fence under snow."""
    sb = SB(rng)
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
    sb.add(P, unit(d[None] + rng.normal(0, 0.08, (m, 3))), 0.40, 0.17, DAB + rng.integers(0, 4, m), pick(SNOW_SH, rng.random(m)), pick(SNOW_LI, rng.random(m)),
           N=np.tile([0.0, 1.0, 0.0], (m, 1)) + nrm[None] * rng.normal(0, 0.5, (m, 1)), smin=3.0, bias=0.04)
    return sb


def gate(rng, x, z, w=3.3, h=1.2):
    """A five-barred gate, a little ajar with age, snow on the top rail."""
    sb = SB(rng)
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
        sb.add(np.array([[x, y0 + h + 0.37, zz]]), (0, 0, 1), 0.28, 0.17, DAB, SNOW_SH[0], SNOW_LI[0], smin=2.5, bias=0.05)
    m = 16
    zz = z - w / 2 + w * (np.arange(m) + 0.5) / m
    sb.add(np.stack([np.full(m, x), np.full(m, y0 + h + 0.03) + 0.02 * rng.random(m), zz], axis=1), (0, 0, 1), 0.3, 0.10, DAB + rng.integers(0, 4, m),
           pick(SNOW_SH, rng.random(m)), pick(SNOW_LI, rng.random(m)), smin=2.5, bias=0.05)
    return sb, np.array([x, y0 + h + 0.085, z + 0.45])


# ----------------------------------------------------------------------------- shadows
_TRUNKS = []          # (x, z, width, length factor)


def long_shadows(env, x, z):
    """Low sun: the poplars lay long blue bars across the field, the fence a broken band."""
    t = env.t
    if t < 80:
        return None
    S = env.sun
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
    w = W.winter()
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
    return out * float(smooth(80.0, 84.0, t))


def water_tone(env, x, z, rnd, rgb, d):
    return rgb


def build(rng):
    G = []
    surf.SHADOWS.append(long_shadows)
    # ---- the line of poplars along the east bank, following every turn of the river
    z = 163.0
    while z < 336.0:
        z += rng.uniform(5.6, 7.4)
        x = edge_x(z, rng.uniform(3.0, 4.6))
        h = rng.uniform(22.0, 27.0)
        st = rng.bit_generator.state
        a = poplar(rng, x, z, h, golden=True).group(name='poplar', span=AUT)
        rng.bit_generator.state = st
        b = poplar(rng, x, z, h, golden=False).group(name='poplar_w', span=WIN)
        G += [a, b]
        POPLARS.append((x, z, h))
        _TRUNKS.append((x, z, 0.35, h))
    # a second line far across the fields, turning back toward the river
    for i in range(30):
        f = (i + rng.uniform(-0.45, 0.45)) / 29.0
        if rng.random() < 0.5:
            continue
        z = 190.0 + 330.0 * f
        x = edge_x(min(z, 330.0), 0) + 80.0 + 95.0 * math.sin(f * math.pi) + rng.normal(0, 5)
        h = rng.uniform(19, 30)
        st = rng.bit_generator.state
        G.append(poplar(rng, x, z, h, golden=True, far=True).group(name='poplar_far', span=AUT))
        rng.bit_generator.state = st
        G.append(poplar(rng, x, z, h, golden=False).group(name='poplar_far_w', span=WIN))
    # ---- west bank: willows and thorn, russet in autumn, frosted in winter
    for i in range(46):
        z = rng.uniform(160.0, 345.0)
        x = float(W.rx(z)) - float(W.hw(z)) - rng.uniform(1.5, 26.0) ** 1.0
        r, h = rng.uniform(2.0, 4.5), rng.uniform(2.5, 7.0)
        if 206.0 < z < 286.0:
            r, h = r * 0.5, h * 0.4
        st = rng.bit_generator.state
        G.append(bush(rng, x, z, r, h, RUST_SH, RUST_LI if rng.random() < 0.6 else GOLD_LI, size=0.36).group(name='bush', span=AUT))
        rng.bit_generator.state = st
        G.append(bush(rng, x, z, r, h, None, None, size=0.36, snow=True, twigs=True).group(name='bush_w', span=WIN))
    for i in range(22):
        z = rng.uniform(165.0, 340.0)
        x = edge_x(z, rng.uniform(1.0, 3.0))
        r, h = rng.uniform(1.0, 2.2), rng.uniform(1.2, 2.6)
        st = rng.bit_generator.state
        G.append(bush(rng, x, z, r, h, RUST_SH, RUST_LI, size=0.3).group(name='bush', span=AUT))
        rng.bit_generator.state = st
        G.append(bush(rng, x, z, r, h, None, None, size=0.3, snow=True, twigs=True).group(name='bush_w', span=WIN))
    # autumn woods closing the west and the north
    far_sh = pal((132, 104, 150), (150, 110, 140), (118, 110, 160))
    far_li = pal((236, 176, 110), (244, 200, 120), (220, 150, 110), (250, 220, 150))
    ptsl = [(float(W.rx(z)) - float(W.hw(z)) - 60 - 20 * math.sin(z * 0.03), z) for z in np.arange(150, 420, 20.0)]
    for g in props.treeline(rng, ptsl, h=15.0, wid=12.0, psh=far_sh, pli=far_li, size=0.9, dens=0.8):
        g.span = AUT
        G.append(g)
    wsh = pal((120, 116, 170), (136, 124, 172), (108, 112, 164))
    wli = pal((226, 204, 214), (236, 216, 214), (214, 196, 216))
    ptsw = [(float(W.rx(z)) - float(W.hw(z)) - 105 - 20 * math.sin(z * 0.03), z) for z in np.arange(150, 420, 20.0)]
    for g in props.treeline(rng, ptsw, h=16.0, wid=12.0, psh=wsh, pli=wli, size=1.0, dens=0.5):
        g.span = WIN
        G.append(g)
    hill_sh = pal((150, 140, 190), (164, 150, 196), (140, 140, 186))
    hill_li = pal((226, 190, 180), (236, 204, 190), (214, 184, 196))
    G.append(props.ridge(rng, 3.6, 6.6, 1100.0, 150.0, 5.0, hill_sh, hill_li, size=80.0, n=420, cx=0.0, cz=240.0))
    G.append(props.ridge(rng, -0.6, 0.9, 1300.0, 120.0, 8.0, hill_sh, hill_li, size=90.0, n=260, cx=0.0, cz=240.0))

    # ---- winter only: the fence and its gate, a farm, the village over the river
    zs = np.arange(Z0, Z1 + 0.1, 4.0)
    for i in range(len(zs) - 1):
        za, zb = zs[i], zs[i + 1]
        if abs((za + zb) / 2 - GATE_Z) < 2.0:
            for (a_, b_) in ((za, GATE_Z - 1.75), (GATE_Z + 1.75, zb)):
                if b_ - a_ > 0.3:
                    G.append(hurdle(rng, edge_x(a_, FENCE_X), a_, edge_x(b_, FENCE_X), b_).group(name='fence', span=WIN))
            continue
        G.append(hurdle(rng, edge_x(za, FENCE_X), za, edge_x(zb, FENCE_X), zb).group(name='fence', span=WIN))
    gsb, perch = gate(rng, edge_x(GATE_Z, FENCE_X), GATE_Z)
    G.append(gsb.group(name='gate', span=WIN))
    build.perch = perch
    snow_wall = pal((236, 214, 196), (244, 224, 204), (226, 200, 190))
    snow_wsh = pal((132, 124, 170), (148, 132, 170), (120, 118, 164))
    roofc = pal((176, 130, 130), (190, 140, 130))
    farm = props.house(rng, edge_x(259.0, 11.0), 259.0, w=10.0, d=6.5, h=3.4, rh=3.0, yaw=0.5, wall=snow_wall, wall_sh=snow_wsh,
                       roof=roofc, roof_sh=snow_wsh, size=0.5, snow=1.0)
    farm.span = WIN
    G.append(farm)
    build.farm = farm
    # the village on the far bank, under the setting sun
    VILL = []
    for i in range(19):
        z = 216.0 + 62.0 * rng.random()
        x = float(W.rx(z)) - float(W.hw(z)) - rng.uniform(7.0, 52.0)
        hh = props.house(rng, x, z, w=rng.uniform(8, 12), d=rng.uniform(6, 7.5), h=rng.uniform(3.6, 5.6), rh=rng.uniform(2.6, 3.6),
                         yaw=rng.normal(1.45, 0.35), wall=snow_wall, wall_sh=snow_wsh, roof=roofc, roof_sh=snow_wsh, size=0.55,
                         y=props.gy(x, z) + 0.5, snow=1.0)
        hh.span = WIN
        G.append(hh)
        VILL.append(hh)
    ch = props.church(rng, float(W.rx(246.0)) - float(W.hw(246.0)) - 46.0, 246.0, yaw=1.4, scale=0.95, snow=1.0)
    ch.span = WIN
    G.append(ch)
    build.village = VILL
    return [g for g in G if g is not None]


# ----------------------------------------------------------------------------- life
LEAF_LI = pal((255, 214, 90), (250, 186, 70), (255, 232, 130), (240, 150, 64), (226, 110, 60))
LEAF_SH = pal((190, 120, 80), (170, 100, 100), (204, 140, 70), (150, 90, 90))
T_FLY = 120.4


def leaves(env):
    """Gold leaves let go from the poplars, streaming on the gusts."""
    t = env.t
    if t < 76 or t > T_SWAP + 1:
        return []
    def dens(x, z):
        d = W.edge(x, z)
        east = x > W.rx(z)
        near = np.where(east, smooth(34.0, 6.0, np.abs(d - 4.0)), 0.25 * smooth(-30.0, 0.0, d))
        return (0.10 + 0.5 * env.wind(x, z)) * near * smooth(158.0, 172.0, z) * float(smooth(76.0, 84.0, t))
    A = life.falling(env, 421, 1.25, 38.0, 27.0, 1.25, (1.2, 0.5), 0.13, LEAF_SH, LEAF_LI, dens, layers=3, tumble=4.2, sway=0.6,
                     swirl=0.9, smin=2.2, aspect=0.62)
    return [(A, dict(reflect=True))]


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


def smoke(tops):
    tops = [np.asarray(p, np.float64) for p in tops]

    def act(env):
        t = env.t
        if t < T_SWAP:
            return []
        out = []
        n = 16
        for j, top in enumerate(tops):
            age = ((t / 9.0 + np.arange(n) / n + j * 0.37) % 1.0) * 9.0
            wob = np.sin(age * 0.9 + j) * 0.25 * age ** 0.7
            P = top[None] + np.stack([0.42 * age + wob, 0.85 * age ** 0.92, 0.2 * age + 0.5 * wob], axis=1)
            L = 0.7 + 0.42 * age
            a = 0.55 * smooth(0.0, 0.8, age) * (1 - age / 9.0) ** 1.3
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
        if t < T_SWAP:
            return []
        lit = smooth(order * 0.8, order * 0.8 + 0.2, lv) * on
        flick = 0.9 + 0.1 * np.sin(t * 3.0 + fl)
        dark = life.strokes(pts, (0, 1, 0), 0.8, 0.5, DAB, (0.24, 0.23, 0.38), (0.34, 0.31, 0.44), N=nrm, r=0.2, a=0.8 * (1 - lit), smin=2.0, bias=0.05)
        warm = life.strokes(pts + nrm * 0.03, (0, 1, 0), 0.95, 0.62, DAB + 1, (1.0, 0.72, 0.30), (1.0, 0.80, 0.42), N=nrm, r=0.2, a=0.97 * lit * flick,
                            smin=3.2, emis=1.0, bias=0.08, haze=0.3)
        glow = life.strokes(pts + nrm * 0.3, (1, 0, 0), 4.2, 3.0, SCUM + 2, (1.0, 0.66, 0.30), (1.0, 0.66, 0.30), N=nrm, r=0.2, a=0.24 * lit * flick,
                            smin=3.0, emis=1.0, bias=0.3, haze=0.3)
        return [(life.merge([dark, warm, glow]), dict(reflect=True))]
    return act


def magpie_pos(t):
    """Where the magpie is: on the gate, then away over the river toward the sun."""
    p0 = build.perch
    tau = t - T_FLY
    if tau <= 0:
        hop = 0.35 * float(smooth(-4.0, -3.6, tau))            # one sidestep along the rail before it goes
        return p0 + np.array([0.0, 0.03 * math.sin(math.pi * float(smooth(-4.0, -3.6, tau))), -hop]) - [0, 0, 0.0], np.array([0.0, 0.0, -1.0]), 0.0
    sp = 8.5 * (1 - math.exp(-tau / 1.3))
    dist = 8.5 * (tau - 1.3 * (1 - math.exp(-tau / 1.3)))
    hd = np.array([-0.93, 0.0, 0.37 - 0.25 * float(smooth(1.0, 6.0, tau))])
    hd /= np.linalg.norm(hd)
    y = 3.6 * (1 - math.exp(-tau / 1.5)) + 0.22 * math.sin(tau * 2.3) * float(smooth(0.5, 2.0, tau)) + 0.25 * tau * 0.4
    pos = p0 + [0, 0, -0.35] + hd * dist + [0, y, 0]
    vel = hd * max(sp, 0.5) + [0, 3.6 / 1.5 * math.exp(-tau / 1.5) + 0.5 * math.cos(tau * 2.3) * 0.5, 0]
    return pos, vel / np.linalg.norm(vel), sp


def magpie(env):
    t = env.t
    if t < T_SWAP - 1 or t > T_FLY + 14:
        return []
    pos, fw, sp = magpie_pos(t)
    tau = t - T_FLY
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
                     N=np.tile([-0.5, 0.7, -0.2], (n, 1)), r=0.05, smin=1.8, haze=0.5, bias=0.02 * np.arange(n) / n)
    return [(A, dict(reflect=False))]


def ice_dens(x, z, d):
    return W.winter() * (0.18 + 0.5 * smooth(0.35, 0.7, noise(x / 14.0, z / 20.0, 1))) * smooth(150.0, 166.0, z) * (0.45 + 0.55 * smooth(-22.0, -2.0, d))


def leaf_dens(x, z, d):
    return (1 - W.winter()) * (0.10 + 0.5 * smooth(0.4, 0.75, noise(x / 5.0, z / 9.0, 2))) * smooth(156.0, 170.0, z) * (0.3 + 0.7 * (x > W.rx(z)))


def actors(rng):
    import sc_summer
    ICE_LI = pal((255, 244, 236), (255, 232, 224), (246, 236, 244), (255, 222, 200))
    ICE_SH = pal((170, 180, 228), (186, 188, 232), (156, 168, 222))
    acts = [leaves,
            sc_summer.floaters(431, 0.5, 0.11, LEAF_SH, LEAF_LI, leaf_dens, speed=0.3, tmin=76.0, tmax=T_SWAP + 1),
            sc_summer.floaters(641, 2.3, 1.9, ICE_SH, ICE_LI, ice_dens, speed=0.12, tmin=T_SWAP - 1, aspect=0.6, R=170.0, sunny=2.2),
            sc_summer.floaters(643, 0.9, 0.6, ICE_SH, ICE_LI, ice_dens, speed=0.12, tmin=T_SWAP - 1, aspect=0.62, R=60.0, sunny=2.2),
            mist, magpie]
    tops = [build.farm.top] + [h.top for h in build.village[::4]]
    acts.append(smoke(tops))
    acts.append(lamps([build.farm.frame] + [h.frame for h in build.village], rng))
    acts.append(snow)
    return acts
