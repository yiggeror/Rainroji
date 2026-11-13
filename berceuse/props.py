"""Things that stand in the landscape: houses, a church, hedges, far hills."""
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal
from core import SB, F
from trees import pick, unit, crown, limb
import world as W


def gy(x, z):
    return float(W.ground(np.array([x], np.float64), np.array([z], np.float64))[0])


def quad(sb, rng, o, u, v, n, size, csh, cli, along='u', aspect=0.42, cover=2.3, jit=0.25, spr=DASH, smin=4.0,
         occ=1.0, emis=0.0, a=0.96, bias=0.0, haze=1.0):
    """Fill the parallelogram o + s*u + t*v with strokes (s, t in 0..1)."""
    o, u, v = np.asarray(o, np.float64), np.asarray(u, np.float64), np.asarray(v, np.float64)
    lu, lv = np.linalg.norm(u), np.linalg.norm(v)
    m = max(3, int(lu * lv / (size * size * aspect) * cover))
    s, t = rng.random(m), rng.random(m)
    P = o[None] + s[:, None] * u[None] + t[:, None] * v[None]
    d = (u / lu) if along == 'u' else (v / lv)
    D = unit(d[None] + rng.normal(0, jit, (m, 3)) * 0.4)
    L = size * np.clip(np.exp(rng.normal(0, 0.25, m)), 0.6, 1.6)
    sb.add(P, D, L, L * aspect, spr + rng.integers(0, 4, m), pick(csh, rng.random(m)), pick(cli, rng.random(m)),
           N=np.tile(unit(np.asarray(n, np.float64)), (m, 1)), smin=smin, occ=occ, emis=emis, a=a, bias=bias, haze=haze)
    return P


def house(rng, x, z, w=8.0, d=6.0, h=3.4, rh=2.6, yaw=0.0, wall=None, wall_sh=None, roof=None, roof_sh=None,
          chimney=True, size=0.55, y=None, snow=0.0):
    """A cottage: four walls and a pitched roof, every face painted with its own light."""
    sb = SB(rng)
    y0 = gy(x, z) if y is None else y
    c, s = np.cos(yaw), np.sin(yaw)
    ax = np.array([c, 0, s]); az = np.array([-s, 0, c]); up = np.array([0, 1.0, 0])
    o = np.array([x, y0, z]) - ax * w / 2 - az * d / 2
    wall = pal((236, 222, 196), (244, 232, 206), (226, 206, 184)) if wall is None else wall
    wall_sh = pal((150, 144, 178), (168, 152, 176), (136, 140, 170)) if wall_sh is None else wall_sh
    roof = pal((206, 122, 92), (220, 140, 100), (190, 104, 96)) if roof is None else roof
    roof_sh = pal((132, 90, 120), (120, 84, 110), (150, 100, 116)) if roof_sh is None else roof_sh
    for (oo, uu, nn) in ((o, ax * w, -az), (o + az * d, ax * w, az), (o, az * d, -ax), (o + ax * w, az * d, ax)):
        quad(sb, rng, oo, uu, up * h, nn, size, wall_sh, wall)
    # gables
    for (oo, nn) in ((o, -ax), (o + ax * w, ax)):
        m = max(3, int(d * rh / (size * size * 0.42) * 1.3))
        s_, t_ = rng.random(m), rng.random(m)
        t_ = t_ * (1 - np.abs(2 * s_ - 1))
        P = oo[None] + s_[:, None] * (az * d)[None] + (h + t_ * rh)[:, None] * up[None]
        sb.add(P, unit(az[None] + rng.normal(0, 0.1, (m, 3))), size, size * 0.42, DASH + rng.integers(0, 4, m),
               pick(wall_sh, rng.random(m)), pick(wall, rng.random(m)), N=np.tile(nn, (m, 1)), smin=4.0)
    # roof planes (with eaves)
    e = 0.35
    for sgn in (-1, 1):
        base = o + (az * d if sgn > 0 else 0) + up * h - ax * e + az * sgn * e
        slope = -sgn * az * (d / 2 + e) + up * rh
        nn = unit(sgn * az * rh + up * d / 2)
        quad(sb, rng, base, ax * (w + 2 * e), slope, nn, size * 1.05, roof_sh, roof, along='v', cover=2.6)
        if snow > 0:
            quad(sb, rng, base + nn * 0.08, ax * (w + 2 * e), slope, nn, size * 1.25,
                 pal((176, 184, 226), (190, 190, 232), (160, 172, 220)), pal((255, 246, 236), (250, 238, 232), (255, 250, 244)),
                 along='u', cover=4.0 * snow, spr=DAB, aspect=0.55, bias=0.03, occ=1.0)
    if chimney:
        cx = o + ax * w * rng.uniform(0.2, 0.8) + az * d * 0.5 + up * (h + rh * 0.8)
        for nn in (ax, -ax, az, -az):
            side = np.cross(nn, up)
            quad(sb, rng, cx + nn * 0.3 - side * 0.3, side * 0.6, up * 1.3, nn, 0.35, roof_sh, wall, along='v')
    g = sb.group(name='house')
    g.top = (o + ax * w * 0.5 + az * d * 0.5 + up * (h + rh + 1.2))
    g.frame = (o, ax, az, w, d, h)
    return g


def windows(o, ax, az, w, d, h, rng, n_long=2):
    """Window positions on the two long walls: list of (point, normal)."""
    out = []
    for k in range(n_long):
        s = (k + 0.5 + rng.uniform(-0.15, 0.15)) / n_long
        for (base, nn) in ((o, -az), (o + az * d, az)):
            out.append((base + ax * w * s + np.array([0, h * 0.55, 0]) + nn * 0.05, nn))
    for (base, nn) in ((o, -ax), (o + ax * w, ax)):
        out.append((base + az * d * 0.5 + np.array([0, h * 0.55, 0]) + nn * 0.05, nn))
    return out


def church(rng, x, z, yaw=0.0, scale=1.0, snow=0.0, y=None):
    """Nave, square tower and a slate spire - the church of a village on the Seine."""
    sb = SB(rng)
    y0 = gy(x, z) if y is None else y
    c, s = np.cos(yaw), np.sin(yaw)
    ax = np.array([c, 0, s]); az = np.array([-s, 0, c]); up = np.array([0, 1.0, 0])
    stone = pal((232, 218, 198), (240, 228, 208), (222, 204, 190))
    stone_sh = pal((146, 142, 180), (160, 150, 182), (132, 134, 172))
    slate = pal((150, 160, 190), (168, 172, 200), (136, 150, 184))
    slate_sh = pal((92, 98, 142), (104, 104, 150), (84, 92, 136))
    k = scale
    nave = house(rng, x, z, w=20 * k, d=8 * k, h=7 * k, rh=4.5 * k, yaw=yaw, wall=stone, wall_sh=stone_sh,
                 roof=slate, roof_sh=slate_sh, chimney=False, size=0.8 * k, y=y0, snow=snow)
    # tower at the west end
    tw, th = 5.5 * k, 17 * k
    o = np.array([x, y0, z]) - ax * (10 * k + tw * 0.2) - az * tw / 2
    for (oo, uu, nn) in ((o, ax * tw, -az), (o + az * tw, ax * tw, az), (o, az * tw, -ax), (o + ax * tw, az * tw, ax)):
        quad(sb, rng, oo, uu, up * th, nn, 0.8 * k, stone_sh, stone, along='v')
    apex = o + ax * tw / 2 + az * tw / 2 + up * (th + 12 * k)
    for (a_, b_, nn) in ((o, o + ax * tw, -az), (o + az * tw, o + ax * tw + az * tw, az), (o, o + az * tw, -ax),
                         (o + ax * tw, o + ax * tw + az * tw, ax)):
        a_ = a_ + up * th; b_ = b_ + up * th
        m = int(60 * 1.0)
        s_, t_ = rng.random(m), rng.random(m) ** 0.7
        P = (a_[None] * (1 - s_[:, None]) + b_[None] * s_[:, None]) * (1 - t_[:, None]) + apex[None] * t_[:, None]
        sb.add(P, unit((apex - (a_ + b_) / 2)[None] + rng.normal(0, 0.1, (m, 3))), 1.3 * k, 0.45 * k, DASH + rng.integers(0, 4, m),
               pick(slate_sh, rng.random(m)), pick(slate, rng.random(m)), N=np.tile(unit(nn + up * 0.3), (m, 1)), smin=4.0)
    A = sb.arrays()
    for kk in A:
        A[kk] = np.concatenate([nave.A[kk], A[kk]])
    from core import Group
    return Group(A, name='church')


def treeline(rng, pts, h=9.0, wid=7.0, psh=None, pli=None, size=1.0, dens=1.0, flex=0.1, trunks=None, smin=5.0):
    """A hedge or distant belt of trees along a polyline of (x, z) points: one group per stretch."""
    out = []
    pts = np.asarray(pts, np.float64)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ln = np.linalg.norm(b - a)
        sb = SB(rng)
        m = max(1, int(ln / (wid * 0.9)))
        for j in range(m):
            p = a + (b - a) * (j + rng.random()) / m
            hh = h * rng.uniform(0.7, 1.15)
            y0 = gy(p[0], p[1])
            crown(sb, (p[0] + rng.normal(0, 1.0), y0 + hh * 0.55, p[1] + rng.normal(0, 1.0)),
                  (wid * rng.uniform(0.55, 0.8), hh * 0.5, wid * rng.uniform(0.55, 0.8)), 0, psh, pli,
                  size * rng.uniform(0.85, 1.15), rng, flex=flex, smin=smin, cover=1.1 * dens)
            if trunks is not None and rng.random() < 0.6:
                limb(sb, (p[0], y0, p[1]), (p[0] + rng.normal(0, 0.3), y0 + hh * 0.5, p[1]), 0.3, 0.18, trunks[0], trunks[1], rng)
        out.append(sb.group(name='treeline'))
    return out


def ridge(rng, az0, az1, dist, hmax, seed_off, csh, cli, size=40.0, base=0.0, n=260, cx=0.0, cz=300.0):
    """A far range of hills, seen from the river: a band of large soft touches."""
    sb = SB(rng)
    from engine import noise
    a = rng.uniform(az0, az1, n)
    t = rng.random(n) ** 0.8
    prof = hmax * (0.35 + 0.65 * noise(a * 1.9 + seed_off, 0.3 + seed_off, 0)) * (0.8 + 0.4 * noise(a * 6.0, seed_off, 1))
    P = np.stack([cx + dist * np.sin(a), base + prof * t, cz + dist * np.cos(a)], axis=1)
    D = unit(np.stack([np.cos(a), 0.12 * rng.normal(0, 1, n), -np.sin(a)], axis=1))
    L = size * np.clip(np.exp(rng.normal(0, 0.25, n)), 0.6, 1.6)
    sb.add(P, D, L, L * 0.36, np.where(rng.random(n) < 0.5, SCUM, DASH) + rng.integers(0, 4, n), pick(csh, rng.random(n)),
           pick(cli, rng.random(n)), N=np.tile([0.0, 1.0, 0.0], (n, 1)) + rng.normal(0, 0.5, (n, 3)), smin=8.0,
           occ=0.5 + 0.5 * t)
    return sb.group(reflect=True, name='ridge')
