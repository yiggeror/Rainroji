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
        k0 = 0.34 + rng.uniform(0, 0.1)
        n = int(h * 0.9)
        for i in range(n):
            f = k0 + (1 - k0) * (i + rng.random()) / n
            wdt = (0.55 + 1.5 * math.sin(math.pi * min((f - k0) / (1 - k0) * 0.95 + 0.05, 1.0)) ** 0.6) * h / 25.0
            c = np.array([x, y0, z]) + (top - [x, y0, z]) * f + rng.normal(0, 0.25, 3)
            crown(sb, c, (wdt, 1.5 * h / 25.0 + 0.5, wdt), 0, GOLD_SH, GOLD_LI, 0.34 if not far else 0.5, rng, flex=0.10 + 0.35 * f, smin=6.0,
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
    m = int(ln * 30)
    s = rng.random(m) * ln
    v = rng.random(m)
    g = np.array([props.gy(x0 + d[0] * ss, z0 + d[2] * ss) for ss in np.linspace(0, ln, 12)])
    gy_ = np.interp(s, np.linspace(0, ln, 12), g)
    wav = 0.05 * np.sin(s * 9.0 + v * 12.0)
    P = np.stack([x0 + d[0] * s, gy_ + 0.08 + v * (h - 0.1) + wav, z0 + d[2] * s], axis=1) + nrm[None] * rng.normal(0, 0.03, (m, 1))
    D = unit(d[None] + np.stack([0 * s, 0.25 * np.cos(s * 9.0 + v * 12.0), 0 * s], axis=1) + rng.normal(0, 0.05, (m, 3)))
    sb.add(P, D, 0.42 * np.exp(rng.normal(0, 0.2, m)), 0.075, DASH + rng.integers(0, 8, m), pick(ws, rng.random(m)), pick(wl, rng.random(m)),
           N=np.tile(nrm + [0, 0.3, 0], (m, 1)) * np.where(rng.random(m) < 0.5, 1, -1)[:, None], smin=3.0, occ=0.6 + 0.4 * v)
    # stakes
    for ss in np.arange(0.3, ln, 1.35):
        px, pz = x0 + d[0] * ss, z0 + d[2] * ss
        yy = float(np.interp(ss, np.linspace(0, ln, 12), g))
        limb(sb, (px, yy - 0.05, pz), (px + rng.normal(0, 0.03), yy + h + rng.uniform(0.05, 0.3), pz), 0.085, 0.07, ws, wl, rng, n=3, smin=3.0, bias=0.02)
    # snow along the top
    m = int(ln * 7)
    s = rng.random(m) * ln
    gy_ = np.interp(s, np.linspace(0, ln, 12), g)
    P = np.stack([x0 + d[0] * s, gy_ + h + 0.06 + 0.03 * rng.random(m), z0 + d[2] * s], axis=1)
    sb.add(P, unit(d[None] + rng.normal(0, 0.08, (m, 3))), 0.40, 0.13, DAB + rng.integers(0, 4, m), pick(SNOW_SH, rng.random(m)), pick(SNOW_LI, rng.random(m)),
           N=np.tile([0.0, 1.0, 0.0], (m, 1)) + nrm[None] * rng.normal(0, 0.5, (m, 1)), smin=3.0, bias=0.04)
    return sb


def gate(rng, x, z, w=2.6, h=1.15):
    """A five-barred gate, a little ajar with age, snow on the top rail."""
    sb = SB(rng)
    y0 = props.gy(x, z)
    wl = pal((170, 136, 126), (190, 152, 132))
    ws = pal((62, 56, 96), (76, 62, 98))
    for i in range(5):
        yy = y0 + 0.16 + i * (h - 0.2) / 4
        limb(sb, (x, yy, z - w / 2), (x + 0.02, yy + 0.02 * (i - 2), z + w / 2), 0.065, 0.06, ws, wl, rng, n=6, smin=2.5)
    limb(sb, (x, y0 + 0.14, z - w / 2), (x, y0 + h - 0.04, z + w / 2), 0.055, 0.05, ws, wl, rng, n=6, smin=2.5)
    for zz in (z - w / 2, z + w / 2):
        limb(sb, (x, y0 - 0.05, zz), (x, y0 + h + 0.22, zz), 0.13, 0.12, ws, wl, rng, n=4, smin=3.0, bias=0.02)
        sb.add(np.array([[x, y0 + h + 0.3, zz]]), (0, 0, 1), 0.22, 0.14, DAB, SNOW_SH[0], SNOW_LI[0], smin=2.5, bias=0.05)
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
        infence = (zsrc > Z0) & (zsrc < Z1) & (dd > 0) & (dd < 1.3 * reach)
        gatebars = (np.abs(zsrc - GATE_Z) < 1.3)
        dens = np.where(gatebars, 0.42 + 0.3 * np.sin(dd / reach * 26.0), 0.9)
        out = np.maximum(out, w * infence * dens * smooth(1.3 * reach, 1.0 * reach, dd))
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
    for i in range(34):
        f = i / 33.0
        z = 190.0 + 330.0 * f
        x = edge_x(min(z, 330.0), 0) + 70.0 + 85.0 * math.sin(f * math.pi) + rng.normal(0, 2)
        h = rng.uniform(20, 26)
        st = rng.bit_generator.state
        G.append(poplar(rng, x, z, h, golden=True, far=True).group(name='poplar_far', span=AUT))
        rng.bit_generator.state = st
        G.append(poplar(rng, x, z, h, golden=False).group(name='poplar_far_w', span=WIN))
    # ---- west bank: willows and thorn, russet in autumn, frosted in winter
    for i in range(46):
        z = rng.uniform(160.0, 345.0)
        x = float(W.rx(z)) - float(W.hw(z)) - rng.uniform(1.5, 26.0) ** 1.0
        r, h = rng.uniform(2.0, 4.5), rng.uniform(2.5, 7.0)
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
    for g in props.treeline(rng, ptsl, h=15.0, wid=12.0, psh=wsh, pli=wli, size=1.0, dens=0.45):
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
        x = float(W.rx(z)) - float(W.hw(z)) - rng.uniform(12.0, 64.0)
        hh = props.house(rng, x, z, w=rng.uniform(7, 11), d=rng.uniform(5.5, 7), h=rng.uniform(3.2, 5.2), rh=rng.uniform(2.4, 3.4),
                         yaw=rng.normal(1.3, 0.5), wall=snow_wall, wall_sh=snow_wsh, roof=roofc, roof_sh=snow_wsh, size=0.75,
                         y=props.gy(x, z) + 0.5, snow=1.0)
        hh.span = WIN
        G.append(hh)
        VILL.append(hh)
    ch = props.church(rng, float(W.rx(246.0)) - float(W.hw(246.0)) - 46.0, 246.0, yaw=1.4, scale=0.95, snow=1.0)
    ch.span = WIN
    G.append(ch)
    build.village = VILL
    return [g for g in G if g is not None]
