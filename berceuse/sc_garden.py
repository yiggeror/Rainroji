"""Summer on the open banks: a flower garden running down to the water in front of a pink house
(after 'Le jardin de l'artiste a Vetheuil' and Giverny), washing on a line, a landing stage;
and on the other bank a meadow, cows, and a painter at work under his umbrella."""
import math
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise
from core import SB, F, GROUND, Group
from trees import pick, unit, crown, limb
import props, life, people
import world as W

PATH_Z = 112.0
GREEN_SH = pal((30, 96, 70), (40, 110, 66), (26, 84, 86))
GREEN_LI = pal((110, 176, 80), (150, 196, 90), (90, 160, 96))
BEDS = [  # light palette, shadow palette
    (pal((240, 70, 80), (250, 120, 140), (255, 180, 190), (226, 50, 90)), pal((150, 40, 90), (170, 60, 110))),
    (pal((250, 170, 50), (255, 210, 70), (240, 120, 40), (255, 232, 120)), pal((176, 96, 60), (190, 120, 70))),
    (pal((150, 130, 230), (120, 110, 210), (190, 170, 240), (220, 190, 240)), pal((80, 70, 160), (96, 80, 170))),
    (pal((255, 250, 245), (250, 220, 230), (255, 240, 200), (244, 200, 220)), pal((190, 190, 230), (204, 184, 220))),
]
SHEET_SH = pal((166, 178, 228), (180, 186, 232), (150, 166, 220))
SHEET_LI = pal((255, 252, 246), (255, 246, 240), (250, 250, 255))


def wb(z, back):
    return float(W.rx(z)) - float(W.hw(z)) - back


def eb(z, back):
    return float(W.rx(z)) + float(W.hw(z)) + back


def bed(rng, z, b0, b1, k0):
    """One long bed from the water toward the house: colour massed, tall at the back."""
    sb = SB(rng)
    b = b0
    while b < b1:
        hh = 0.55 + 0.9 * (b - b0) / (b1 - b0) + rng.uniform(-0.1, 0.25)
        x, zz = wb(z, b), z + rng.normal(0, 0.25)
        y0 = props.gy(x, zz)
        li, sh = BEDS[(k0 + int(noise(b / 5.0, z / 3.0, 1) * 3.99)) % 4]
        crown(sb, (x, y0 + hh * 0.42, zz), (0.9, hh * 0.5, 0.75), 0, GREEN_SH, GREEN_LI, 0.17, rng, flex=0.08, smin=4.5, cover=0.7)
        crown(sb, (x, y0 + hh * 0.62, zz), (0.9, hh * 0.45, 0.75), 0, sh, li, 0.15, rng, flex=0.10, smin=4.5, cover=0.75, occ_lo=0.55, aspect=0.75)
        b += 1.5
    return sb.group(name='bed')


def house(rng):
    out = []
    x, z = wb(PATH_Z, 34.0), PATH_Z
    wall = pal((244, 196, 186), (250, 208, 196), (238, 184, 180))
    wall_sh = pal((176, 140, 172), (164, 134, 174), (186, 150, 176))
    slate = pal((150, 158, 190), (166, 170, 198), (138, 150, 184))
    slate_sh = pal((92, 98, 142), (104, 104, 150))
    g = props.house(rng, x, z, w=19.0, d=7.0, h=5.8, rh=2.6, yaw=math.pi / 2, wall=wall, wall_sh=wall_sh, roof=slate, roof_sh=slate_sh, size=0.5)
    out.append(g)
    o, ax, az, w, d, h = g.frame
    sb = SB(rng)
    nrm = -az                                               # the long front looks east, over the garden to the river
    up = np.array([0.0, 1.0, 0.0])
    for row_y in (1.7, 4.3):
        for k in range(7):
            if row_y < 2 and k == 3:
                continue
            p = o + ax * w * (k + 0.5) / 7 + up * row_y + nrm * 0.07
            sb.add(np.array([p]), up, 1.15, 0.60, DAB, (0.30, 0.34, 0.50), (0.56, 0.62, 0.76), N=nrm, smin=2.5, bias=0.05)
            for sgn in (-1, 1):
                sb.add(np.array([p + ax * sgn * 0.56]), up, 1.25, 0.34, DASH, (0.16, 0.40, 0.34), (0.36, 0.62, 0.44), N=nrm, smin=2.5, bias=0.06)
    p = o + ax * w * 0.5 + up * 1.15 + nrm * 0.07
    sb.add(np.array([p]), up, 2.2, 0.95, DASH, (0.16, 0.40, 0.34), (0.36, 0.62, 0.44), N=nrm, smin=2.5, bias=0.06)
    # climbing roses and creeper on the front
    for k in range(9):
        c = o + ax * w * rng.uniform(0.02, 0.98) + up * rng.uniform(0.8, 5.2) + nrm * 0.3
        crown(sb, c, (rng.uniform(0.7, 1.5), rng.uniform(0.6, 1.3), 0.25), 0, GREEN_SH, GREEN_LI, 0.2, rng, flex=0.04, smin=4.0, cover=0.9)
        crown(sb, c, (1.0, 0.8, 0.3), 12, BEDS[0][1], BEDS[0][0], 0.15, rng, flex=0.04, smin=3.5, aspect=0.85, occ_lo=0.8)
    out.append(sb.group(name='housefront'))
    return out


def garden(rng):
    G = house(rng)
    k = 0
    for z in (99.0, 102.6, 106.2, 117.8, 121.4, 125.0):
        G.append(bed(rng, z, 4.5, 27.0, k))
        k += 1
    # the gravel walk from the landing stage to the door
    sb = SB(rng)
    for i in range(10):
        b0 = 1.0 + i * 2.9
        x0, x1 = wb(PATH_Z, b0), wb(PATH_Z, b0 + 2.9)
        y = props.gy((x0 + x1) / 2, PATH_Z) + 0.03
        props.quad(sb, rng, (x0, y, PATH_Z - 1.4), (x1 - x0, 0, 0), (0, 0, 2.8), (0, 1, 0), 0.42, pal((190, 160, 176), (176, 150, 176)),
                   pal((250, 226, 200), (244, 214, 196), (255, 236, 214)), cover=2.6, smin=3.0)
    A = sb.arrays()
    G.append(Group(A, reflect=False, passid=GROUND, name='walk'))
    # rose arches over the walk
    sb = SB(rng)
    for b in (7.0, 12.5, 18.0, 23.5):
        x = wb(PATH_Z, b)
        y0 = props.gy(x, PATH_Z)
        pts = [(y0 + 0.45, -1.7), (y0 + 1.2, -1.7), (y0 + 0.45, 1.7), (y0 + 1.2, 1.7)]
        pts += [(y0 + 1.5 + 1.25 * math.sin(a), 1.7 * math.cos(a)) for a in np.linspace(0.1, math.pi - 0.1, 9)]
        for (yy, dz) in pts:
            c = (x + rng.normal(0, 0.08), yy, PATH_Z + dz)
            crown(sb, c, (0.42, 0.42, 0.42), 0, GREEN_SH, GREEN_LI, 0.15, rng, flex=0.05, smin=4.0, cover=0.9)
            crown(sb, c, (0.46, 0.46, 0.46), 9, BEDS[3][1], pal((255, 214, 224), (250, 180, 200), (255, 244, 240)), 0.13, rng, flex=0.05, smin=3.5,
                  aspect=0.85, occ_lo=0.8)
    G.append(sb.group(name='arches'))
    # sunflowers by the steps
    sb = SB(rng)
    for i in range(16):
        sgn = -1 if i % 2 else 1
        x = wb(PATH_Z, rng.uniform(26.0, 30.5))
        zz = PATH_Z + sgn * rng.uniform(2.2, 5.5)
        y0 = props.gy(x, zz)
        hh = rng.uniform(1.6, 2.4)
        limb(sb, (x, y0, zz), (x + rng.normal(0, 0.08), y0 + hh, zz), 0.05, 0.04, GREEN_SH, GREEN_LI, rng, n=6, smin=3.0, flex1=0.10)
        crown(sb, (x, y0 + hh * 0.5, zz), (0.3, hh * 0.4, 0.3), 14, GREEN_SH, GREEN_LI, 0.22, rng, flex=0.08, smin=4.0)
        hd = np.array([[x + 0.08, y0 + hh, zz]])
        sb.add(hd, (0, 1, 0.2), 0.34, 0.32, DAB + rng.integers(0, 4), (0.86, 0.60, 0.16), (1.0, 0.86, 0.22), N=(1.0, 0.4, 0.0), smin=3.0, bias=0.05, flex=0.10)
        sb.add(hd + [0.03, 0, 0], (0, 1, 0), 0.13, 0.12, DAB, (0.30, 0.18, 0.12), (0.46, 0.28, 0.14), N=(1.0, 0.4, 0.0), smin=3.0, bias=0.07, flex=0.10)
    G.append(sb.group(name='sunflowers'))
    # washing on the line: sheets that lift and fall with every gust
    sb = SB(rng)
    zl = 95.2
    xa, xb = wb(zl, 9.0), wb(zl, 19.5)
    ya = props.gy((xa + xb) / 2, zl)
    WD = pal((96, 76, 80), (110, 84, 80))
    WDL = pal((206, 170, 120), (220, 184, 134))
    for xx in (xa, xb):
        limb(sb, (xx, ya - 0.3, zl), (xx, ya + 2.25, zl), 0.07, 0.06, WD, WDL, rng, n=6, smin=3.0)
    limb(sb, (xa, ya + 2.2, zl), (xb, ya + 2.2, zl), 0.02, 0.02, WD, WDL, rng, n=14, smin=2.0, bend=0.0)
    n_sh = 6
    for i in range(n_sh):
        x0 = xb + (xa - xb) * (i + 0.12) / n_sh
        wdt = (xa - xb) / n_sh * 0.8
        drop = rng.uniform(0.9, 1.45)
        m = 150
        u, v = rng.random(m), rng.random(m)
        P = np.stack([x0 + u * wdt, ya + 2.18 - v * drop, np.full(m, zl)], axis=1)
        li = SHEET_LI if i not in (2, 4) else (pal((250, 214, 220), (255, 226, 226)) if i == 2 else pal((190, 210, 244), (204, 220, 248)))
        sb.add(P, unit(np.tile([0.0, -1.0, 0.0], (m, 1)) + rng.normal(0, 0.12, (m, 3))), 0.34, 0.15, DASH + rng.integers(0, 8, m), pick(SHEET_SH, rng.random(m)),
               pick(li, rng.random(m)), N=np.tile([0.2, 0.3, -1.0], (m, 1)), flex=0.03 + 0.42 * v ** 1.4, smin=3.5)
    G.append(sb.group(name='washing'))
    # the landing stage
    sb = SB(rng)
    x0 = wb(PATH_Z, 0.8)
    props.quad(sb, rng, (x0, 0.38, PATH_Z - 0.8), (4.4, 0, 0), (0, 0, 1.6), (0, 1, 0), 0.4, pal((110, 96, 110), (124, 104, 112)),
               pal((226, 204, 170), (236, 214, 180), (214, 190, 160)), along='v', cover=3.0, smin=3.0)
    for dx in (0.4, 2.3, 4.2):
        for dz in (-0.8, 0.8):
            limb(sb, (x0 + dx, -0.2, PATH_Z + dz), (x0 + dx, 0.75, PATH_Z + dz), 0.08, 0.07, WD, WDL, rng, n=3, smin=3.0)
    G.append(sb.group(name='stage'))
    return [g for g in G if g is not None]


PAINTER = (0.0, 0.0)


def actors(rng):
    global PAINTER
    acts = []
    px, pz = eb(71.0, 3.2), 71.0
    PAINTER = (px, pz)
    tx, tz = wb(108.0, 14.0), 108.0
    a, f = people.painter(rng, px, pz, math.atan2(tx - px, tz - pz))
    acts.append(a)
    figs = [f]
    for i, (z, back, yaw, gr) in enumerate(((64.0, 15.0, 0.6, True), (72.0, 27.0, 2.4, True), (80.0, 17.0, -1.2, False), (88.0, 30.0, 1.0, True), (58.0, 31.0, 3.4, True), (94.0, 16.0, -2.0, True))):
        a, f = people.cow(rng, eb(z, back), z, yaw, grazing=gr, seed=0.17 * (i + 1))
        acts.append(a)
        figs.append(f)
    import sc_spring
    sc_spring.FIGS.extend(figs)
    homes = [(wb(100.0, 10.0), props.gy(wb(100.0, 10.0), 100.0) + 1.3, 100.5), (wb(105.0, 16.0), 2.0, 105.0), (wb(119.0, 9.0), 1.6, 119.0),
             (wb(123.0, 18.0), 2.2, 123.0), (wb(113.0, 6.0), 1.5, 114.0), (eb(74.0, 8.0), 1.6, 76.0), (eb(66.0, 12.0), 1.5, 66.0)]
    acts.append(life.butterflies(homes))
    acts.append(life.swallows([(float(W.rx(84.0)), 5.0, 84.0), (wb(110.0, 10.0), 7.0, 110.0), (eb(70.0, 20.0), 6.0, 70.0)], 36.0, 98.0))
    return acts
