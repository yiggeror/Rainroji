"""Trees, painted the way Monet builds them: a few dark limbs and then touch upon touch of
broken colour, cool in the shadow side and warm in the light."""
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal
from core import SB, F


def pick(palette, r, w=None):
    k = len(palette)
    if w is None:
        i = np.minimum((r * k).astype(np.int32), k - 1)
    else:
        cw = np.cumsum(np.asarray(w, np.float64)); cw /= cw[-1]
        i = np.minimum(np.searchsorted(cw, r), k - 1)
    return palette[i]


def unit(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-9)


def limb(sb, p0, p1, w0, w1, csh, cli, rng, bend=0.0, flex0=0.0, flex1=0.0, n=None, smin=3.0, bias=-0.05):
    """A trunk or branch from p0 to p1: overlapping strokes laid along it."""
    p0, p1 = np.asarray(p0, np.float64), np.asarray(p1, np.float64)
    ln = np.linalg.norm(p1 - p0)
    seg = max(w0 * 3.2, ln / 7.0, 0.25)
    if n is None:
        n = max(2, int(ln / seg * 1.8) + 1)
    t = (np.arange(n) + 0.5) / n
    side = np.cross(p1 - p0, [0.3, 1.0, 0.2]); side = side / (np.linalg.norm(side) + 1e-9)
    P = p0[None] + (p1 - p0)[None] * t[:, None] + side[None] * (bend * ln * np.sin(np.pi * t))[:, None]
    tang = (p1 - p0)[None] + side[None] * (bend * ln * np.pi * np.cos(np.pi * t))[:, None]
    D = unit(tang + rng.normal(0, 0.05, (n, 3)) * ln)
    W = (w0 + (w1 - w0) * t) * (0.9 + 0.3 * rng.random(n))
    L = np.full(n, ln / n * 2.1)
    # one side catches the light
    for k, (off, lit) in enumerate(((-0.22, 0.0), (0.2, 1.0))):
        Nn = unit(np.cross(D, [0, 1, 0]) * (1 if lit else -1) + [0.0, 0.25, 0.0])
        Pk = P + np.cross(D, [0.0, 1.0, 0.0]) * (W * off)[:, None]
        sb.add(Pk, D, L, W * (0.95 if lit == 0 else 0.6), DASH + rng.integers(0, 8, n),
               csh[rng.integers(0, len(csh), n)], cli[rng.integers(0, len(cli), n)],
               N=np.tile([0.4, 0.3, -0.5] if lit == 0 else [-0.2, 0.6, 0.6], (n, 1)) if False else Nn,
               flex=flex0 + (flex1 - flex0) * t, smin=smin, bias=bias + 0.02 * k, occ=1.0 if lit else 0.35)
    return P


def crown(sb, c, rad, n, psh, pli, size, rng, shell=0.55, flex=0.12, droop=0.2, smin=6.0, wsh=None, wli=None,
          aspect=0.55, spr=DAB, nspr=4, occ_lo=0.45, a=0.96, lean=None, cover=None):
    """A mass of leaves: n touches in an ellipsoid, denser toward its surface."""
    c = np.asarray(c, np.float64)
    rad = np.broadcast_to(np.asarray(rad, np.float64), (3,))
    if cover is not None:
        area = 4 * np.pi * ((rad[0] * rad[1]) ** 1.6 / 3 + (rad[0] * rad[2]) ** 1.6 / 3 + (rad[1] * rad[2]) ** 1.6 / 3) ** (1 / 1.6)
        n = max(8, int(cover * area / (size * size * aspect)))
    u = unit(rng.normal(0, 1, (n, 3)))
    r = (shell + (1 - shell) * rng.random(n)) ** 0.6 * (0.55 + 0.45 * rng.random(n) ** 0.4)
    # lumpy outline
    r = r * (0.85 + 0.3 * np.sin(u[:, 0] * 5.0 + c[0]) * np.sin(u[:, 1] * 4.0 + c[2]))
    P = c[None] + u * r[:, None] * rad[None]
    N = unit(u * (1.0 / rad)[None] * rad.mean() + [0.0, 0.35, 0.0])
    D = unit(rng.normal(0, 1, (n, 3)) * [1.0, 0.55, 1.0] + [0.0, -droop, 0.0] + (0 if lean is None else np.asarray(lean)))
    L = size * np.clip(np.exp(rng.normal(0, 0.28, n)), 0.55, 1.8)
    occ = occ_lo + (1 - occ_lo) * np.clip(0.5 + 0.5 * N[:, 1] + 0.35 * (r - 0.6), 0, 1)
    sb.add(P, D, L, L * aspect * (0.8 + 0.4 * rng.random(n)), spr + rng.integers(0, nspr, n),
           pick(psh, rng.random(n), wsh), pick(pli, rng.random(n), wli), N=N, flex=flex * (0.5 + r),
           smin=smin, occ=occ, a=a, bias=0.10 * r * rad.mean() * 0)
    return P
