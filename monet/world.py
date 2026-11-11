"""World model shared by all scenes: camera, projection, stroke sets, timeline.

A stroke lives at world (X, Y) with a depth factor p (1 = main plane, smaller =
farther).  The ground / water surface is the plane Y = 0 and the camera floats Hc
above it, so the screen position is

    sx = 960 + (X - camX) * p * zoom
    sy = hz  + (Y + Hc)   * p * zoom

which is a plain multiplane camera: far strokes drift slowly, near ones quickly.
"""
import numpy as np
from scipy.interpolate import PchipInterpolator
from engine import Batch, smooth, noise

FPS = 30
DUR = 102.0

# scene boundaries along the camera track
B1, B2, B3, B4 = 3700.0, 8900.0, 13700.0, 17500.0
BW = 650.0                      # half width of a transition


def scene_of(u):
    """Continuous scene coordinate: 0 dawn, 1 pond, 2 poppies, 3 haystacks, 4 dusk."""
    u = np.asarray(u, np.float32)
    return (smooth(B1 - BW, B1 + BW, u) + smooth(B2 - BW, B2 + BW, u)
            + smooth(B3 - BW, B3 + BW, u) + smooth(B4 - BW, B4 + BW, u))


def scene_coord(X, p, camX):
    """Near strokes belong to the place they stand in; far ones follow the camera,
    so a distant backdrop repaints itself as the camera crosses a boundary."""
    g = smooth(0.22, 0.7, p)
    return camX + (X - camX) * g


def window(d, k, soft=1.0):
    """1 while the scene coordinate is k, fading to 0 one scene away."""
    return np.clip(1.0 - np.abs(np.asarray(d, np.float32) - k) / soft, 0.0, 1.0)


# ---- camera keyframes:  t, camX, Hc, hz, zoom
_KEYS = np.array([
    #  t     camX    Hc    hz   zoom
    [0.0,     0.0,  250,  455, 1.00],
    [5.0,   160.0,  250,  455, 1.00],
    [17.0, 2700.0,  255,  450, 1.03],
    [22.0, 4200.0,  420,  330, 1.00],
    [30.0, 5600.0,  470,  300, 1.00],
    [41.0, 7850.0,  470,  300, 1.00],
    [47.0, 9500.0,  400,  560, 1.00],
    [55.0, 11300.0, 430,  600, 1.00],
    [62.0, 12900.0, 400,  590, 1.00],
    [66.5, 14300.0, 340,  575, 1.00],
    [77.0, 16500.0, 330,  570, 1.00],
    [82.5, 18100.0, 300,  560, 1.00],
    [92.0, 19500.0, 290,  555, 1.045],
    [100.0, 19800.0, 290, 555, 1.09],
    [102.0, 19815.0, 290, 555, 1.10],
], np.float64)
_INT = [PchipInterpolator(_KEYS[:, 0], _KEYS[:, i]) for i in range(1, 5)]


class Env:
    """Everything a shader needs to know about the current frame."""

    def __init__(self, t):
        self.t = float(t)
        tt = min(max(t, 0.0), DUR)
        self.camX = float(_INT[0](tt))
        self.Hc = float(_INT[1](tt))
        self.hz = float(_INT[2](tt))
        self.zoom = float(_INT[3](tt))
        self.d = float(scene_of(self.camX))
        # a slow gust front that everything growing or hanging responds to
        self.gust_t = t

    def wind(self, X, p=1.0):
        """Wind strength 0..1 at world X: gusts travel in the direction of the journey."""
        t = self.t
        return (0.55 * noise(X / 1700.0 - t * 0.11, 0.3 + t * 0.013, 2)
                + 0.45 * noise(X / 520.0 - t * 0.27, 1.7, 3))

    def project(self, X, Y, p):
        sc = p * self.zoom
        return 960.0 + (X - self.camX) * sc, self.hz + (Y + self.Hc) * sc, sc


class Set:
    """A static collection of strokes plus a shader that animates and colours them."""

    def __init__(self, name, shader, X, Y, p, cam=(-1e9, 1e9), margin=260.0, **f):
        self.name = name
        self.shader = shader
        self.X = np.asarray(X, np.float32)
        self.Y = np.asarray(Y, np.float32)
        n = len(self.X)
        self.p = np.broadcast_to(np.asarray(p, np.float32), (n,)).copy()
        self.cam = cam
        self.margin = margin
        self.f = {k: (np.asarray(v) if not np.isscalar(v) else v) for k, v in f.items()}
        self.n = n

    def emit(self, env):
        if not (self.cam[0] <= env.camX <= self.cam[1]) or self.n == 0:
            return None
        sx, sy, sc = env.project(self.X, self.Y, self.p)
        m = self.margin
        idx = np.nonzero((sx > -m) & (sx < 1920 + m) & (sy > -m) & (sy < 1080 + m))[0]
        if len(idx) == 0:
            return None
        g = {k: (v[idx] if isinstance(v, np.ndarray) and v.shape[:1] == (self.n,) else v)
             for k, v in self.f.items()}
        return self.shader(env, self.X[idx], self.Y[idx], self.p[idx], sx[idx], sy[idx], sc[idx], g)


def flat(items):
    out = []
    for b in items:
        if b is None:
            continue
        if isinstance(b, (list, tuple)):
            out.extend(flat(b))
        else:
            out.append(b)
    return out


def rnd_fields(rng, n):
    return rng.random((n, 4)).astype(np.float32)


def jgrid(rng, x0, x1, y0, y1, cell, jit=0.9):
    """Jittered grid: even coverage without the regularity."""
    nx = max(1, int((x1 - x0) / cell))
    ny = max(1, int((y1 - y0) / cell))
    gx, gy = np.meshgrid(np.arange(nx), np.arange(ny))
    x = x0 + (gx.ravel() + 0.5 + (rng.random(nx * ny) - 0.5) * jit) * (x1 - x0) / nx
    y = y0 + (gy.ravel() + 0.5 + (rng.random(nx * ny) - 0.5) * jit) * (y1 - y0) / ny
    o = rng.permutation(nx * ny)
    return x[o].astype(np.float32), y[o].astype(np.float32)


def ground_rows(rng, X0, X1, pmin, pmax, base_len, aspect, cover=0.5, cover_y=0.55,
                size_pow=0.55, Hc_ref=330.0, min_len=20.0):
    """Strokes on the ground plane, laid in rows from the horizon toward the viewer.

    Returns X, p, L, W (world units) sorted far to near.  Screen stroke length is
    base_len * p**size_pow so distant strokes shrink more slowly than perspective.
    X0/X1 bound the camera travel; each row is widened by what is visible at its depth.
    """
    Xs, ps, Ls, Ws = [], [], [], []
    p = pmin
    while p < pmax:
        ls = max(base_len * p ** size_pow, min_len)
        ws = ls / aspect
        dp = ws * cover_y / Hc_ref
        dX = ls * cover / p
        a = X0 - 1150.0 / p
        b = X1 + 1150.0 / p
        n = int((b - a) / dX) + 1
        x = a + (np.arange(n) + rng.random(n)) * dX
        Xs.append(x)
        ps.append(p + (rng.random(n) - 0.5) * dp * 1.6)
        Ls.append(np.full(n, ls / p) * np.clip(np.exp(rng.normal(0, 0.38, n)), 0.5, 2.4))
        Ws.append(np.full(n, ws / p) * (0.8 + 0.4 * rng.random(n)))
        p += dp
    X = np.concatenate(Xs).astype(np.float32)
    p = np.maximum(np.concatenate(ps), pmin * 0.6).astype(np.float32)
    L = np.concatenate(Ls).astype(np.float32)
    Wd = np.concatenate(Ws).astype(np.float32)
    o = np.argsort(p, kind='stable')
    return X[o], p[o], L[o], Wd[o]
