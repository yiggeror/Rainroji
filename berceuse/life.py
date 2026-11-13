"""Small moving things: whatever falls or drifts through the air, and what flies in it."""
import math
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise
from core import F, footprint, _cells, _DEF
from trees import pick, unit
import world as W


def strokes(P, D, L, Wd, spr, csh, cli=None, N=None, r=None, ph=None, **kw):
    """Pack per-frame world strokes into the arrays shade() expects."""
    P = np.atleast_2d(np.asarray(P, F))
    n = len(P)
    b = lambda v, k=None: np.broadcast_to(np.asarray(v, F), (n,) if k is None else (n, k))
    d = dict(P=P, D=b(D, 3), L=b(L), W=b(Wd), spr=np.broadcast_to(np.asarray(spr, np.int32), (n,)),
             csh=b(csh, 3), cli=b(csh if cli is None else cli, 3), N=b((0, 1, 0) if N is None else N, 3))
    for k, v in _DEF.items():
        d[k] = b(kw.get(k, v))
    d['ph'] = b(0.0 if ph is None else ph)
    d['r'] = b(0.5 if r is None else r)
    return d


def merge(parts):
    parts = [p for p in parts if p is not None and len(p['P'])]
    if not parts:
        return None
    return {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}


def falling(env, seed, cell, R, H, vy, drift, size, csh, cli, dens, layers=2, tumble=3.0, sway=0.35, aspect=0.6,
            spr=DAB, smin=2.0, ground=True, swirl=0.0, a=0.95, emis=0.0, haze=0.6):
    """Petals, leaves, snow: an endless lattice of falling touches around the camera.

    dens(x, z) -> 0..1 share of lattice points that carry a particle.
    """
    t = env.t
    out = []
    for lay in range(layers):
        shx = drift[0] * t * (0.8 + 0.25 * lay)
        shz = drift[1] * t * (0.8 + 0.25 * lay)
        x0, x1, z0, z1 = footprint(env, env.C[1] - 1.5, R)
        c = cell
        i0, i1 = int(math.floor((x0 - shx) / c)) - 1, int(math.floor((x1 - shx) / c)) + 2
        j0, j1 = int(math.floor((z0 - shz) / c)) - 1, int(math.floor((z1 - shz) / c)) + 2
        X, Z, Rn = _cells(i0, i1, j0, j1, lay, seed, c, env.C[0] - shx, env.C[2] - shz, R * R)
        if len(X) == 0:
            continue
        X = X + shx
        Z = Z + shz
        keep = Rn[:, 3] < dens(X, Z)
        if not keep.any():
            continue
        X, Z, Rn = X[keep], Z[keep], Rn[keep]
        u = np.mod(Rn[:, 0] + t * vy / H * (0.7 + 0.6 * Rn[:, 1]), 1.0)
        g0 = W.ground(X, Z) if ground else np.zeros(len(X))
        ph = Rn[:, 5] * 6.283
        w = 0.7 + 0.8 * Rn[:, 2]
        X = X + sway * np.sin(t * w + ph) + swirl * np.sin(t * 0.5 * w + ph * 2.0) * (0.5 + u)
        Z = Z + sway * np.cos(t * w * 0.8 + ph * 1.3) + swirl * np.cos(t * 0.4 * w + ph) * (0.5 + u)
        Y = g0 + (1 - u) * H + 0.12 * np.sin(t * 1.7 * w + ph)
        phi = t * tumble * (0.5 + Rn[:, 4]) + ph
        D = unit(np.stack([np.cos(phi), 0.6 * np.sin(phi), np.sin(phi * 0.7 + 1.0)], axis=1))
        L = size * (0.7 + 0.6 * Rn[:, 1])
        Wd = L * aspect * (0.35 + 0.65 * np.abs(np.sin(phi * 1.3 + 0.5)))
        N = unit(np.stack([0.6 * np.sin(phi), 0.6 + 0.4 * np.cos(phi * 1.3), 0.6 * np.cos(phi)], axis=1))
        al = a * smooth(0.0, 0.06, u) * smooth(1.0, 0.94, u)
        out.append(strokes(np.stack([X, Y, Z], axis=1), D, L, Wd, spr + (Rn[:, 4] * 4).astype(np.int32),
                           pick(csh, Rn[:, 2]), pick(cli, Rn[:, 2]), N=N, r=Rn[:, 1], ph=ph, a=al, smin=smin,
                           emis=emis, haze=haze, bias=0.0))
    return merge(out)


def butterflies(homes, col=(1.0, 0.99, 0.94), col2=(0.86, 0.88, 0.97)):
    """White butterflies: each wanders a small territory, wings opening and closing."""
    homes = np.asarray(homes, np.float64)
    n = len(homes)
    ph = np.arange(n) * 2.399

    def act(env):
        t = env.t
        if np.min((homes[:, 0] - env.C[0]) ** 2 + (homes[:, 2] - env.C[2]) ** 2) > 70.0 ** 2:
            return []
        x = homes[:, 0] + 2.2 * (noise(t * 0.16 + ph, ph * 0.7, 0) - 0.5) * 2 + 0.3 * np.sin(t * 3.1 + ph)
        z = homes[:, 2] + 2.2 * (noise(t * 0.14 + ph * 1.3, 3.0 + ph, 1) - 0.5) * 2 + 0.3 * np.cos(t * 2.7 + ph)
        y = homes[:, 1] + 0.7 * (noise(t * 0.22 + ph, 7.0, 2) - 0.5) * 2 + 0.12 * np.sin(t * 9.0 + ph)
        flap = np.sin(t * 22.0 + ph * 5.0)
        hd = t * 0.6 + ph
        P, D, Wd = [], [], []
        for sgn in (-1, 1):
            side = np.stack([np.cos(hd) * sgn, 0.7 * np.abs(flap) + 0.2, np.sin(hd) * sgn], axis=1)
            P.append(np.stack([x, y, z], axis=1) + side * 0.045)
            D.append(unit(side))
            Wd.append(0.075 * (0.45 + 0.55 * np.abs(flap)))
        A = strokes(np.concatenate(P), np.concatenate(D), 0.10, np.concatenate(Wd), DAB + np.tile(np.arange(n) % 4, 2),
                    np.tile(col2, (2 * n, 1)), np.tile(col, (2 * n, 1)), N=np.tile([0.2, 0.9, 0.2], (2 * n, 1)),
                    r=np.tile(0.2 + 0.05 * (np.arange(n) % 5), 2), smin=1.5, haze=0.4)
        return [(A, dict(reflect=True))]
    return act
