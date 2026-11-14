"""Figures are built from rigid parts (a skirt, a torso, a head, an oar ...); every part is a
small cluster of strokes that keeps its place on the part while the part moves."""
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal
from core import SB, F
from trees import pick, unit


def rx(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


class Part:
    def __init__(self, rng):
        self.sb = SB(rng)
        self.rng = rng
        self.A = None

    def ell(self, c, rad, n, csh, cli, size, aspect=0.5, flow=None, spr=DAB, occ_lo=0.5, smin=2.5, flex=0.0, bias=0.0, cover=2.6):
        """Dabs over the surface of an ellipsoid (a head, a bodice, a skirt)."""
        rng = self.rng
        c = np.asarray(c, np.float64)
        rad = np.broadcast_to(np.asarray(rad, np.float64), (3,))
        area = 4 * np.pi * ((rad[0] * rad[1]) ** 1.6 / 3 + (rad[0] * rad[2]) ** 1.6 / 3 + (rad[1] * rad[2]) ** 1.6 / 3) ** (1 / 1.6)
        n = max(n, int(cover * area / (size * size * aspect)))
        u = unit(rng.normal(0, 1, (n, 3)))
        P = c[None] + u * rad[None] * (0.86 + 0.14 * rng.random(n))[:, None]
        N = unit(u / rad[None])
        if flow is None:
            D = unit(np.cross(N, rng.normal(0, 1, (n, 3))))
        else:
            fl = np.asarray(flow, np.float64)
            D = unit(fl[None] - (N @ fl)[:, None] * N + rng.normal(0, 0.25, (n, 3)))
        L = size * np.clip(np.exp(rng.normal(0, 0.22, n)), 0.6, 1.6)
        occ = occ_lo + (1 - occ_lo) * np.clip(0.55 + 0.6 * N[:, 1], 0, 1)
        self.sb.add(P, D, L, L * aspect, spr + rng.integers(0, 4, n), pick(csh, rng.random(n)), pick(cli, rng.random(n)),
                    N=N, smin=smin, occ=occ, flex=flex, bias=bias, haze=0.8)
        return self

    def seg(self, p0, p1, w, csh, cli, n=None, spr=DASH, smin=2.5, flex=0.0, bias=0.0):
        """A limb, an oar, a ribbon: strokes laid end to end."""
        rng = self.rng
        p0, p1 = np.asarray(p0, np.float64), np.asarray(p1, np.float64)
        ln = np.linalg.norm(p1 - p0)
        n = max(2, int(ln / max(w * 2.0, 0.05)) + 1) if n is None else n
        t = (np.arange(n) + 0.5) / n
        P = p0[None] + (p1 - p0)[None] * t[:, None] + rng.normal(0, w * 0.08, (n, 3))
        D = unit((p1 - p0)[None] + rng.normal(0, 0.06, (n, 3)) * ln)
        side = unit(np.cross(p1 - p0, [0.2, 0.1, 1.0]))
        for k, (off, occ) in enumerate(((-0.2, 0.35), (0.22, 1.0))):
            self.sb.add(P + side[None] * w * off, D, ln / n * 2.0, w * (1.0 if k == 0 else 0.6), spr + rng.integers(0, 4, n),
                        pick(csh, rng.random(n)), pick(cli, rng.random(n)), N=np.tile(unit(side * (1 if k else -1) + [0, 0.5, 0]), (n, 1)),
                        smin=smin, occ=occ, flex=np.linspace(0, flex, n), bias=bias + 0.005 * k, haze=0.8)
        return self

    def dab(self, p, d, L, Wd, col_sh, col_li=None, n=(0, 1, 0), spr=DAB, smin=2.0, bias=0.01, emis=0.0, flex=0.0):
        self.sb.add(np.atleast_2d(p), d, L, Wd, spr, col_sh, col_sh if col_li is None else col_li, N=n, smin=smin, bias=bias,
                    emis=emis, flex=flex, haze=0.8)
        return self

    def done(self):
        self.A = self.sb.arrays()
        return self

    def at(self, M, T):
        """The part's strokes with rotation M (3x3) and translation T applied."""
        A = dict(self.A)
        Mt = np.asarray(M, F).T
        A['P'] = A['P'] @ Mt + np.asarray(T, F)[None]
        A['D'] = A['D'] @ Mt
        A['N'] = A['N'] @ Mt
        return A


ARM = 0.31                 # upper arm = forearm (metres) for an adult


def align_y(v):
    """Rotation taking the local +y axis onto the direction v."""
    v = np.asarray(v, np.float64)
    v = v / (np.linalg.norm(v) + 1e-9)
    a = np.cross([0.0, 1.0, 0.0], v)
    s = np.linalg.norm(a)
    c = v[1]
    if s < 1e-6:
        return np.eye(3) if c > 0 else np.diag([1.0, -1.0, -1.0])
    k = a / s
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + s * K + (1 - c) * (K @ K)


def limb2(rng, csh, cli, w=0.07, hand=True, l=ARM, skin=None):
    """Upper arm and forearm (each l metres along +y) for two-bone arms."""
    up = Part(rng).seg((0, 0, 0), (0, l, 0), w, csh, cli, n=4).done()
    fo = Part(rng).seg((0, 0, 0), (0, l, 0), w * 0.88, csh, cli, n=4)
    if hand:
        sk = skin if skin is not None else ((0.75, 0.58, 0.62), (0.95, 0.80, 0.71))
        fo.dab((0, l + 0.025, 0), (0, 1, 0), 0.085, 0.06, sk[0], sk[1])
    return up, fo.done()


def arm_ik(up, fo, S, H, pole=(0.0, -1.0, 0.0), l=ARM):
    S, H = np.asarray(S, np.float64), np.asarray(H, np.float64)
    d = H - S
    dist = min(np.linalg.norm(d), 2 * l - 1e-3)
    dn = d / (np.linalg.norm(d) + 1e-9)
    pole = np.asarray(pole, np.float64)
    pole = pole - (pole @ dn) * dn
    pole = pole / (np.linalg.norm(pole) + 1e-9)
    E = S + dn * dist / 2 + pole * np.sqrt(max(l * l - (dist / 2) ** 2, 0.0))
    return [up.at(align_y(E - S), S), fo.at(align_y(S + dn * dist - E), E)]


