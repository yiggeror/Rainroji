"""Core of the film: a real perspective camera moving through a world of brush strokes.

Every stroke is anchored at a 3-D point (metres; x east, y up, z north; water is y = 0).
Three kinds of things produce strokes:

* groups   - static stroke clusters (a tree, a house, a fence) built once,
* actors   - functions that return world strokes for the current instant (boat, bird, petals),
* fields   - endless surfaces (water, grass, snow, sky) whose strokes are generated on the
             fly from a hashed, nested grid so that the density on screen stays constant
             while every stroke stays glued to its place in the world.

The frame is drawn like a painting: sky, water, reflections, ground, then everything that
stands on it from far to near.
"""
import math
import numpy as np
from numba import njit
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import gaussian_filter1d
from engine import smooth, mix, noise

F = np.float32
FPS = 30

# drawing passes
SKY, WATER, MIRROR, RIPPLE, GROUND, STAND, OVER = range(7)
_PASS = 1.0e7


def norm(v):
    v = np.asarray(v, np.float64)
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


# ----------------------------------------------------------------------------- camera
class Path:
    """Camera track: keyed position, look-at target and field of view, smoothed in time so
    that the move has no corners (velocity and acceleration are continuous)."""

    def __init__(self, keys, sigma=0.9, hz=50):
        k = np.array(keys, np.float64)                 # t, px,py,pz, tx,ty,tz, fov
        self.t0, self.t1 = k[0, 0], k[-1, 0]
        ts = np.arange(self.t0, self.t1 + 1e-9, 1.0 / hz)
        raw = np.stack([PchipInterpolator(k[:, 0], k[:, i])(ts) for i in range(1, 8)], axis=1)
        self.ts = ts
        self.v = gaussian_filter1d(raw, sigma * hz, axis=0, mode='nearest')
        self.post = None

    def at(self, t):
        t = min(max(t, self.t0), self.t1)
        return np.array([np.interp(t, self.ts, self.v[:, i]) for i in range(7)])


class Env:
    """Everything a shader needs to know about the current frame."""

    def __init__(self, t, path, look):
        self.t = float(t)
        v = path.at(t)
        # the camera floats a little, like something carried on air or water
        dr = np.array([noise(t * 0.11, 0.3, 0) - 0.5, noise(t * 0.13, 1.7, 1) - 0.5, noise(t * 0.09, 3.1, 2) - 0.5])
        C0, T0 = v[0:3], v[3:6]
        if getattr(path, 'post', None) is not None:
            C0, T0 = path.post(t, C0, T0)
        self.C = C0 + dr * np.array([0.10, 0.06, 0.10])
        tgt = T0 + dr[::-1] * 0.05 * np.linalg.norm(T0 - C0)
        self.set_view(self.C, tgt, v[6])
        import world
        world.NOW = self.t
        self.L = look(self.t)                           # dict of look parameters
        self.sun = norm(self.L['sun'])
        wa = self.L.get('wind_dir', 0.6)
        self.wdir = np.array([math.cos(wa), 0.0, math.sin(wa)])

    def set_view(self, C, tgt, fov):
        self.C = np.asarray(C, np.float64)
        f = norm(np.asarray(tgt, np.float64) - self.C)
        r = norm(np.cross([0.0, 1.0, 0.0], f))
        u = np.cross(f, r)
        self.fw, self.rt, self.up = f, r, u
        self.fov = float(fov)
        self.f = 960.0 / math.tan(math.radians(fov) / 2)

    # -- projection
    def view(self, P):
        v = P.astype(np.float64) - self.C
        return v @ self.rt, v @ self.up, v @ self.fw

    def project(self, P):
        vr, vu, vf = self.view(P)
        zc = np.maximum(vf, 1e-3)
        sc = self.f / zc
        return (960.0 + vr * sc), (540.0 - vu * sc), vf, sc

    def wind(self, x, z):
        """Gust strength 0..1; gust fronts travel downwind."""
        t = self.t
        s = x * self.wdir[0] + z * self.wdir[2]
        c = -x * self.wdir[2] + z * self.wdir[0]
        g = 0.6 * noise((s - 3.2 * t) / 34.0, c / 50.0 + t * 0.01, 2) + 0.4 * noise((s - 5.0 * t) / 11.0, c / 16.0, 3)
        return g * self.L.get('wind', 1.0)


# ----------------------------------------------------------------------------- stroke sets
_DEF = dict(a=1.0, bias=0.0, flex=0.0, smin=5.0, emis=0.0, occ=1.0, haze=1.0)


class SB:
    """Stroke builder: accumulate world strokes, then freeze them into a Group."""

    def __init__(self, rng):
        self.rng = rng
        self.parts = []

    def add(self, P, D, L, W, spr, csh, cli=None, N=None, **kw):
        P = np.atleast_2d(np.asarray(P, F))
        n = len(P)
        if n == 0:
            return
        b = lambda v, k=None: np.broadcast_to(np.asarray(v, F), (n,) if k is None else (n, k)).copy()
        d = dict(P=P.copy(), D=b(D, 3), L=b(L), W=b(W), spr=np.broadcast_to(np.asarray(spr, np.int32), (n,)).copy(),
                 csh=b(csh, 3), cli=b(csh if cli is None else cli, 3),
                 N=b((0, 1, 0) if N is None else N, 3))
        for k, v in _DEF.items():
            d[k] = b(kw.get(k, v))
        d['ph'] = self.rng.random(n).astype(F) * 6.2832
        d['r'] = self.rng.random(n).astype(F)
        self.parts.append(d)

    def arrays(self):
        if not self.parts:
            return None
        return {k: np.concatenate([p[k] for p in self.parts]) for k in self.parts[0]}

    def group(self, **kw):
        A = self.arrays()
        return None if A is None else Group(A, **kw)


class Group:
    def __init__(self, A, reflect=True, passid=STAND, name='', span=(-1e9, 1e9)):
        o = np.argsort(A['r'], kind='stable')          # sorted by detail rank: a far group only needs a prefix
        A = {k: np.ascontiguousarray(v[o]) for k, v in A.items()}
        self.A = A
        self.span = span
        self.n = len(A['P'])
        self.lmax = float(A['L'].max())
        self.smin = float(A['smin'].min())
        lo, hi = A['P'].min(0), A['P'].max(0)
        self.c = ((lo + hi) / 2).astype(np.float64)
        self.rad = float(np.linalg.norm(hi - lo) / 2 + A['L'].max())
        self.reflect = reflect and hi[1] > 0.05
        self.passid = passid
        self.name = name

    def visible(self, env, mirror=False, far=1e9):
        if not (self.span[0] <= env.t <= self.span[1]):
            return False
        c = self.c.copy()
        if mirror:
            c[1] = -c[1]
        v = c - env.C
        zf = v @ env.fw
        if zf < -self.rad or zf - self.rad > far:
            return False
        z = max(zf, 0.5)
        m = self.rad * env.f / z
        x = 960 + (v @ env.rt) * env.f / z
        y = 540 - (v @ env.up) * env.f / z
        return (-m - 200 < x < 1920 + m + 200) and (-m - 200 < y < 1080 + m + 200)


    def lod(self, env, mirror=False):
        """The strokes of this group that can matter at its present distance (a cheap prefix)."""
        c = self.c.copy()
        if mirror:
            c[1] = -c[1]
        d = max(float(np.linalg.norm(c - env.C)) - self.rad, 0.5)
        frac = (self.lmax * env.f / d / (self.smin * LOD_K * (1.6 if mirror else 1.0))) ** LOD_P
        if mirror:
            frac *= 0.75
        if frac >= 0.84:
            return self.A
        n = int(np.searchsorted(self.A['r'], frac + 0.17))
        if n <= 0:
            return None
        return {k: v[:n] for k, v in self.A.items()}


def take(A, idx):
    return {k: v[idx] for k, v in A.items()}


def cat(dicts):
    dicts = [d for d in dicts if d is not None and len(d['x'])]
    if not dicts:
        return None
    return {k: np.concatenate([d[k] for d in dicts]) for k in dicts[0]}


def _dirproj(env, vr, vu, vf, D):
    Dr, Du, Df = D @ env.rt, D @ env.up, D @ env.fw
    ex = Dr * vf - vr * Df
    ey = -(Du * vf - vu * Df)
    return np.arctan2(ey, ex), np.hypot(ex, ey) / np.maximum(vf, 1e-3)


MIRROR_STRETCH = 1.12
LOD_P = 2.0          # ... keeping the painted area of a distant mass the same
LOD_K = 2.2          # touches smaller than about 8 px (at 1920 wide) are merged into fewer, larger ones


def shade(env, A, mirror=False, passid=STAND, sway=True, grade=True):
    """World strokes -> screen strokes: wind, projection, level of detail, light, air."""
    P = A['P'].astype(np.float64)
    t = env.t
    flex = A['flex']
    if sway and flex.max() > 0:
        g = env.wind(P[:, 0], P[:, 2])
        fl = np.sin(t * (2.2 + 1.7 * A['r']) + A['ph'])
        d = flex * (0.25 + 1.0 * g + 0.22 * fl * (0.4 + g))
        P[:, 0] += d * env.wdir[0]
        P[:, 2] += d * env.wdir[2]
        P[:, 1] -= 0.18 * d * g
    else:
        g = None
    D = A['D']
    if mirror:
        keep = P[:, 1] > 0.02
        if not keep.any():
            return None
        if not keep.all():
            A = take(A, keep)
            P = P[keep]
            D = A['D']
            g = None if g is None else g[keep]
        P[:, 1] *= -MIRROR_STRETCH
        D = D * np.array([1, -1, 1], F)
    v = P - env.C
    vr, vu, vf = v @ env.rt, v @ env.up, v @ env.fw
    ok = vf > 0.25
    sc = env.f / np.maximum(vf, 0.25)
    x = 960.0 + vr * sc
    y = 540.0 - vu * sc
    px = A['L'] * sc
    mg = np.minimum(px, 500.0) * 0.6 + 20
    ok &= (x > -mg) & (x < 1920 + mg) & (y > -mg) & (y < 1080 + mg)
    # level of detail: far away a mass is painted with fewer, relatively larger touches
    smin = A['smin'] * (LOD_K * (1.6 if mirror else 1.0))
    frac = np.clip(px / smin, 0.0, 1.0) ** LOD_P
    if mirror:
        frac *= 0.75
    lod = np.clip((frac - A['r']) * 6.0 + 1.0, 0.0, 1.0)
    ok &= lod > 0.02
    idx = np.nonzero(ok)[0]
    if len(idx) == 0:
        return None
    A = take(A, idx)
    P, D = P[idx], D[idx]
    vr, vu, vf, sc, x, y, px, lod, smin = vr[idx], vu[idx], vf[idx], sc[idx], x[idx], y[idx], px[idx], lod[idx], smin[idx]
    ang, fore = _dirproj(env, vr, vu, vf, D.astype(np.float64))
    grow = np.maximum(1.0, smin * 0.9 / np.maximum(px, 1e-3))
    Lp = px * np.clip(fore, 0.45, 1.3) * grow
    Wp = A['W'] * sc * grow
    if g is not None:
        ang = ang + 0.25 * np.sin(t * (3.0 + 2.0 * A['r']) + A['ph'] * 1.7) * np.minimum(A['flex'] * 6.0, 1.0) * (0.3 + g[idx])
    # ---- light
    S = env.sun
    L = env.L
    nd = A['N'] @ S.astype(F)
    lit = np.clip(0.5 + 0.62 * nd + (A['r'] - 0.5) * 0.36, 0.0, 1.0)
    lit = lit * lit * (3 - 2 * lit) * A['occ']
    em = A['emis'][:, None]
    rgb = A['csh'] * (1 - lit[:, None]) + A['cli'] * lit[:, None]
    if grade:
        tint = L['shade'][None, :] * (1 - lit[:, None]) + L['light'][None, :] * lit[:, None]
        rgb = rgb * (tint * (1 - em) + em)
    # ---- air: distance dissolves everything toward the colour of the sky near the horizon
    dist = np.sqrt(vr * vr + vu * vu + vf * vf)
    hz = (1.0 - np.exp(-dist / L['vis'])) * L['hazemax'] * A['haze'] * (1 - 0.7 * A['emis'])
    hx = v[idx] @ env.sun / np.maximum(dist, 1e-3)
    hcol = L['haze'][None, :] + (L['hazesun'] - L['haze'])[None, :] * (np.clip(hx, 0, 1) ** 3)[:, None]
    rgb = rgb + (hcol - rgb) * hz[:, None]
    a = A['a'] * lod * smooth(0.35, 1.3, vf) * smooth(900.0, 420.0, Lp)
    Lp = np.minimum(Lp, 560.0)
    if mirror:
        # a reflection is laid in with broken horizontal touches and takes the tint of the water
        depth = np.maximum(y - 540.0, 0.0)
        wob = np.sin(y * 0.11 + t * 1.3 + A['ph']) + 0.6 * np.sin(y * 0.047 - t * 0.8 + A['ph'] * 2.3)
        rp = L.get('ripple', 1.0)
        x = x + wob * (1.5 + 0.02 * Lp + 0.012 * depth) * rp
        horiz = np.maximum(Lp * np.abs(np.cos(ang)), Wp * 1.5)
        vert = np.maximum(Lp * np.abs(np.sin(ang)), Wp)
        Lp = horiz * (1.25 + 0.5 * A['r'])
        Wp = np.maximum(vert * 0.42, 2.5)
        ang = (A['r'] - 0.5) * 0.12
        wt = L['water_tint']
        rgb = (rgb * (1 - wt[3]) + wt[None, :3] * wt[3]) * L.get('mirror_gain', 0.92)
        a = a * L.get('mirror_a', 0.82) * (0.75 + 0.25 * np.sin(t * (0.9 + A['r']) + A['ph']))
        key = MIRROR * _PASS + 1e6 - vf + A['bias']
    else:
        key = passid * _PASS + 1e6 - vf + A['bias']
    hb = 0.5 + 0.5 * A['r']
    return dict(x=x.astype(F), y=y.astype(F), ang=ang.astype(F), L=Lp.astype(F), W=Wp.astype(F), spr=A['spr'],
                rgb=rgb.astype(F), a=a.astype(F), hb=hb.astype(F), key=key)


# ----------------------------------------------------------------------------- fields
@njit(cache=True)
def _cells(i0, i1, j0, j1, k, seed, c, cx, cz, R2):
    n = max(i1 - i0, 0) * max(j1 - j0, 0)
    X = np.empty(n, np.float64)
    Z = np.empty(n, np.float64)
    R = np.empty((n, 6), np.float32)
    m = 0
    for i in range(i0, i1):
        for j in range(j0, j1):
            h = np.uint64(i + 1000003) * np.uint64(0x9E3779B97F4A7C15) ^ np.uint64(j + 7000003) * np.uint64(0xC2B2AE3D27D4EB4F)
            h ^= np.uint64(k * 7919 + seed) * np.uint64(0x165667B19E3779F9)
            h ^= h >> np.uint64(29)
            h *= np.uint64(0xBF58476D1CE4E5B9)
            h ^= h >> np.uint64(32)
            r0 = np.float32(h & np.uint64(0xFFFF)) / np.float32(65536.0)
            r1 = np.float32((h >> np.uint64(16)) & np.uint64(0xFFFF)) / np.float32(65536.0)
            x = (i + 0.5 + (r0 - 0.5) * 0.92) * c
            z = (j + 0.5 + (r1 - 0.5) * 0.92) * c
            if (x - cx) ** 2 + (z - cz) ** 2 > R2:
                continue
            h2 = h * np.uint64(0x94D049BB133111EB)
            h2 ^= h2 >> np.uint64(31)
            X[m] = x
            Z[m] = z
            R[m, 0] = np.float32((h >> np.uint64(32)) & np.uint64(0xFFFF)) / np.float32(65536.0)
            R[m, 1] = np.float32((h >> np.uint64(48)) & np.uint64(0xFFFF)) / np.float32(65536.0)
            R[m, 2] = np.float32(h2 & np.uint64(0xFFFF)) / np.float32(65536.0)
            R[m, 3] = np.float32((h2 >> np.uint64(16)) & np.uint64(0xFFFF)) / np.float32(65536.0)
            R[m, 4] = np.float32((h2 >> np.uint64(32)) & np.uint64(0xFFFF)) / np.float32(65536.0)
            R[m, 5] = np.float32((h2 >> np.uint64(48)) & np.uint64(0xFFFF)) / np.float32(65536.0)
            m += 1
    return X[:m], Z[:m], R[:m]


def footprint(env, y0, R):
    """Bounding box (x0, x1, z0, z1) of the part of the plane y = y0 seen within distance R."""
    pts = [env.C[[0, 2]]]
    tx = 1.12 * 960.0 / env.f
    ty = 1.12 * 540.0 / env.f
    for sx in (-tx, tx):
        for sy in (-ty, ty):
            d = env.fw + sx * env.rt + sy * env.up
            d = d / np.linalg.norm(d)
            h = env.C[1] - y0
            if d[1] < -1e-4:
                s = min(h / -d[1], R)
            else:
                s = R
            hd = d[[0, 2]] * s
            n = np.linalg.norm(hd)
            if n > R:
                hd *= R / n
            pts.append(env.C[[0, 2]] + hd)
    p = np.array(pts)
    return p[:, 0].min(), p[:, 0].max(), p[:, 1].min(), p[:, 1].max()


class Field:
    """A surface painted at constant density on screen with strokes anchored in the world.

    shader(env, x, z, rnd, dist) -> dict with
        y      height of the surface (scalar or array)
        rgb    colour, a alpha (0 drops the stroke)
        D      world direction of the stroke (n,3) lying in the surface
        kl, kw optional size multipliers, spr sprite ids
    """

    def __init__(self, seed, S, shader, passid, c0=0.04, kmax=15, kl=2.5, kw=1.5, wmin=3.8, y0=0.0, order=0.0,
                 maxdist=4000.0, yfun=None):
        self.seed, self.S, self.shader, self.passid = seed, float(S), shader, passid
        self.c0, self.kmax, self.kl, self.kw, self.wmin, self.y0 = c0, kmax, kl, kw, wmin, y0
        self.order = order
        self.maxdist = maxdist
        self.yfun = yfun

    def emit(self, env):
        S, f, c0 = self.S, env.f, self.c0
        y0 = self.y0 if self.yfun is None else float(self.yfun(env.C[[0]], env.C[[2]])[0])
        h = max(abs(env.C[1] - y0), 0.15)
        kmin = max(0, int(math.floor(math.log2(max(h * S / (f * c0), 1e-6)))) - 1)
        Xs, Zs, Rs, As = [], [], [], []
        for k in range(kmin, self.kmax + 1):
            c = c0 * 2.0 ** k
            R = min(2.0 * c * f / S, self.maxdist)
            if R < h:
                continue
            x0, x1, z0, z1 = footprint(env, y0, R)
            i0, i1 = int(math.floor(x0 / c)) - 1, int(math.floor(x1 / c)) + 2
            j0, j1 = int(math.floor(z0 / c)) - 1, int(math.floor(z1 / c)) + 2
            if (i1 - i0) * (j1 - j0) > 400000:
                continue
            X, Z, Rn = _cells(i0, i1, j0, j1, k, self.seed, c, env.C[0], env.C[2], R * R)
            if len(X) == 0:
                continue
            dist = np.sqrt((X - env.C[0]) ** 2 + (Z - env.C[2]) ** 2 + h * h)
            lam = np.log2(np.maximum(dist * S / (f * c0), 1e-9))
            u = lam - k
            gq = np.where(u <= 0, 0.75, np.exp2(-2.0 * np.clip(u, 0, 1)) - 0.25)
            if k == self.kmax:
                gq = np.where(u <= 0, 1.0, gq)
            av = np.clip((gq - Rn[:, 0] * 1.0) * 14.0, 0.0, 1.0) * (dist < self.maxdist)
            m = av > 0.01
            if not m.any():
                continue
            # quick screen test before the (expensive) shader
            v0 = X[m] - env.C[0]
            v2 = Z[m] - env.C[2]
            v1 = (self.y0 if self.yfun is None else self.yfun(X[m], Z[m])) - env.C[1]
            vf = v0 * env.fw[0] + v1 * env.fw[1] + v2 * env.fw[2]
            vr = v0 * env.rt[0] + v2 * env.rt[2]
            vu = v0 * env.up[0] + v1 * env.up[1] + v2 * env.up[2]
            mm = (vf > 0.05) & (np.abs(vr) * f < (960 + 3 * S + 40) * vf) & (np.abs(vu) * f < (540 + 3 * S + 40) * vf)
            if not mm.any():
                continue
            ii = np.nonzero(m)[0][mm]
            Xs.append(X[ii]); Zs.append(Z[ii]); Rs.append(Rn[ii]); As.append(av[ii])
        if not Xs:
            return None
        X = np.concatenate(Xs); Z = np.concatenate(Zs); Rn = np.concatenate(Rs); av = np.concatenate(As)
        n = len(X)
        dist = np.sqrt((X - env.C[0]) ** 2 + (Z - env.C[2]) ** 2 + h * h)
        o = self.shader(env, X, Z, Rn, dist)
        if o is None:
            return None
        a = np.broadcast_to(np.asarray(o.get('a', 1.0), F), (n,)) * av
        keep = a > 0.01
        if not keep.any():
            return None
        P = np.stack([X, np.broadcast_to(np.asarray(o.get('y', self.y0), np.float64), (n,)), Z], axis=1)
        v = P - env.C
        vr, vu, vf = v @ env.rt, v @ env.up, v @ env.fw
        zc = np.maximum(vf, 0.05)
        sc = f / zc
        x = 960.0 + vr * sc
        y = 540.0 - vu * sc
        D = np.broadcast_to(np.asarray(o.get('D', (1.0, 0.0, 0.0)), np.float64), (n, 3))
        E = np.stack([-D[:, 2], np.zeros(n), D[:, 0]], axis=1)      # in-plane perpendicular
        ang, fd = _dirproj(env, vr, vu, vf, D)
        _, fe = _dirproj(env, vr, vu, vf, E)
        kl = np.asarray(o.get('kl', 1.0)) * self.kl
        kw = np.asarray(o.get('kw', 1.0)) * self.kw
        up = o.get('upright', None)
        Lp = S * kl * (0.75 + 0.5 * Rn[:, 4]) * np.clip(fd, 0.5, 1.2)
        Wp = np.maximum(S * kw * (0.8 + 0.4 * Rn[:, 5]) * np.clip(fe, 0.0, 1.2), self.wmin)
        if up is not None:
            # strokes that stand up (grass): keep them upright on screen
            ang = np.where(up > 0, -1.5708 + o.get('lean', 0.0), ang)
            Lp = np.where(up > 0, S * kl * (0.75 + 0.5 * Rn[:, 4]) * up, Lp)
            Wp = np.where(up > 0, np.maximum(S * kw * 0.5, self.wmin), Wp)
        Lp = np.maximum(Lp, Wp * 1.05)
        key = self.passid * _PASS + self.order * 1e5 + Rn[:, 1] * 9e4
        if 'depth_order' in o:
            key = self.passid * _PASS + 1e6 - vf + o['depth_order']
        rgb = np.asarray(o['rgb'], F)
        spr = np.broadcast_to(np.asarray(o.get('spr', 0), np.int32), (n,))
        out = dict(x=x.astype(F), y=(y + np.asarray(o.get('dy', 0.0))).astype(F), ang=ang.astype(F), L=Lp.astype(F), W=Wp.astype(F), spr=spr,
                   rgb=rgb, a=a.astype(F), hb=(0.5 + 0.5 * Rn[:, 2]).astype(F), key=key)
        return {k_: v_[keep] for k_, v_ in out.items()}


def scatter(env, seed, c, R, y0=0.0):
    """Hashed jittered points of one grid level within distance R of the camera and roughly
    in view: (x, z, rnd).  For things of fixed world density (tufts, flowers, petals)."""
    x0, x1, z0, z1 = footprint(env, y0, R)
    i0, i1 = int(math.floor(x0 / c)) - 1, int(math.floor(x1 / c)) + 2
    j0, j1 = int(math.floor(z0 / c)) - 1, int(math.floor(z1 / c)) + 2
    return _cells(i0, i1, j0, j1, 0, seed, c, env.C[0], env.C[2], R * R)


# ----------------------------------------------------------------------------- frame
def haze_of(env, rgb, dist, hx=0.0, amt=1.0):
    L = env.L
    hz = (1.0 - np.exp(-np.asarray(dist) / L['vis'])) * L['hazemax'] * amt
    hcol = L['haze'][None, :] + (L['hazesun'] - L['haze'])[None, :] * (np.clip(hx, 0, 1) ** 3)[..., None]
    return rgb + (hcol - rgb) * hz[:, None]


def compose(parts):
    S = cat(parts)
    if S is None:
        return None
    o = np.argsort(S['key'], kind='stable')
    return {k: v[o] for k, v in S.items() if k != 'key'}
