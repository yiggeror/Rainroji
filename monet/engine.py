"""Painterly stroke engine.

Everything on screen is a brush stroke: a textured, tinted, rotated dab that is
anchored in the world (not to the screen), composited back-to-front into a colour
buffer and a paint-thickness buffer.  The thickness buffer is lit afterwards to
give the relief of oil paint on canvas.
"""
import math
import numpy as np
from numba import njit
from scipy.ndimage import gaussian_filter, gaussian_filter1d
import cv2

W0, H0 = 1920, 1080          # design resolution; every size below is in these units

# --------------------------------------------------------------------------- noise
_NS = 1024
_NCELL = 128.0               # one noise unit = 128 texels, texture repeats every 8 units


def _make_noise(seed, beta=1.9, lowcut=7.0):
    rng = np.random.default_rng(seed)
    f = np.fft.fftfreq(_NS) * _NS
    fx, fy = np.meshgrid(f, f)
    r = np.sqrt(fx * fx + fy * fy)
    amp = np.where(r >= lowcut, 1.0 / np.maximum(r, 1.0) ** beta, 0.0)
    ph = rng.uniform(0, 2 * np.pi, (_NS, _NS))
    img = np.real(np.fft.ifft2(amp * np.exp(1j * ph)))
    flat = img.ravel()
    order = flat.argsort()
    ranks = np.empty(flat.size, np.float32)
    ranks[order] = np.linspace(0, 1, flat.size, dtype=np.float32)
    return ranks.reshape(_NS, _NS)


NOISE = [_make_noise(11 + i) for i in range(4)]


def noise(x, y, ch=0):
    """Tileable fbm noise, uniform in [0,1]; features are about one unit across."""
    tex = NOISE[ch % 4]
    fx = np.mod(np.asarray(x, np.float64) * _NCELL, _NS)
    fy = np.mod(np.asarray(y, np.float64) * _NCELL, _NS)
    x0 = fx.astype(np.int64) % _NS
    y0 = fy.astype(np.int64) % _NS
    tx = (fx - np.floor(fx)).astype(np.float32)
    ty = (fy - np.floor(fy)).astype(np.float32)
    x1 = (x0 + 1) % _NS
    y1 = (y0 + 1) % _NS
    a = tex[y0, x0] * (1 - tx) + tex[y0, x1] * tx
    b = tex[y1, x0] * (1 - tx) + tex[y1, x1] * tx
    return a * (1 - ty) + b * ty


def smooth(a, b, x):
    t = np.clip((np.asarray(x, np.float32) - a) / (b - a + 1e-9), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, w):
    w = np.asarray(w, np.float32)
    if w.ndim == 1 and np.ndim(a) + np.ndim(b) >= 2:
        w = w[:, None]
    return a * (1 - w) + b * w


def C(*rgb):
    return np.array(rgb, np.float32) / 255.0


def pal(*cols):
    return np.array(cols, np.float32) / 255.0


def pick(palette, rnd, weights=None):
    """Pick one palette entry per stroke (broken colour instead of blended colour)."""
    k = len(palette)
    if weights is None:
        i = np.minimum((rnd * k).astype(np.int32), k - 1)
    else:
        cw = np.cumsum(np.asarray(weights, np.float64))
        cw /= cw[-1]
        i = np.minimum(np.searchsorted(cw, rnd), k - 1)
    return palette[i]


def ramp(stops, x):
    """Piecewise-linear colour ramp.  stops = [(pos, (r,g,b)) ...] with 0-255 colours."""
    xs = np.array([s[0] for s in stops], np.float32)
    cs = np.array([s[1] for s in stops], np.float32) / 255.0
    x = np.asarray(x, np.float32)
    out = np.empty(x.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(x, xs, cs[:, c])
    return out


def jitter(rgb, rnd, val=0.06, chroma=0.04):
    """Per-stroke variation: value shift plus a small push along a random hue axis."""
    r1, r2, r3 = rnd[:, 0], rnd[:, 1], rnd[:, 2]
    out = rgb * (1.0 + (r1[:, None] - 0.5) * 2 * val)
    out[:, 0] += (r2 - 0.5) * 2 * chroma
    out[:, 1] += (r3 - 0.5) * chroma
    out[:, 2] -= (r2 - 0.5) * 2 * chroma
    return out


# --------------------------------------------------------------------------- brushes
SW, SH = 192, 64
DASH, DAB, SCUM, LENS = 0, 8, 12, 16      # sprite families (DASH has 8, the rest 4)
NSPR = 20


def _n1(rng, n, sigma):
    g = gaussian_filter1d(rng.standard_normal(n * 3), sigma, mode='wrap')[n:2 * n]
    return g / (g.std() + 1e-9)


def _bristles(rng, streaks, along):
    g = rng.standard_normal((SH, SW))
    g = gaussian_filter(g, (SH / streaks / 2.4, SW * along), mode='reflect')
    return g / (g.std() + 1e-9)


def _make_sprites(seed=5):
    rng = np.random.default_rng(seed)
    u = np.linspace(-1, 1, SW)[None, :]
    v = np.linspace(-1, 1, SH)[:, None]
    A = np.zeros((NSPR, SH, SW), np.float32)
    T = np.zeros((NSPR, SH, SW), np.float32)
    for k in range(NSPR):
        br = _bristles(rng, rng.uniform(9, 15), rng.uniform(0.10, 0.22))
        fine = _bristles(rng, 26, 0.05)
        e1 = 1 + 0.10 * _n1(rng, SW, 9)[None, :]
        e2 = 1 + 0.10 * _n1(rng, SW, 9)[None, :]
        edge = np.where(v < 0, e1, e2)
        if k < DAB:                                   # loaded dash, drier toward the tail
            n = rng.uniform(2.4, 4.0)
            taper = rng.uniform(0.0, 0.35)
            env = (1 - np.abs(u) ** n) ** 0.55 * (1 - taper * (u * 0.5 + 0.5)) * 0.92
            d = env * edge - np.abs(v)
            a = smooth(0.0, 0.16, d)
            dry = np.clip((u - rng.uniform(-0.1, 0.4)) / 0.8, 0, 1) ** 1.4 * rng.uniform(0.6, 1.5)
            a = a * smooth(-0.6, 0.5, br + 1.15 - dry * 2.4)
            a = a * (1 - 0.10 * np.clip(-fine, 0, 1))
        elif k < SCUM:                                # round loaded dab
            rr = np.sqrt(u * u + v * v) / (0.90 * (1 + 0.09 * _n1(rng, SW, 14)[None, :] * (v * 0.5 + 0.5)
                                                    + 0.07 * _n1(rng, SH, 6)[:, None]))
            a = smooth(1.0, 0.70, rr + 0.07 * br)
            a = a * (1 - 0.22 * np.clip(-br, 0, 1)) * smooth(-1.9, -0.9, br + 0.6 * fine)
        elif k < LENS:                                # scumble: broken, semi-transparent
            rr = np.sqrt(np.abs(u) ** 2.6 + np.abs(v) ** 2.6) ** (1 / 1.3)
            a = smooth(1.0, 0.25, rr)
            patch = gaussian_filter(rng.standard_normal((SH, SW)), (5, 9))
            patch /= patch.std()
            a = a * smooth(-1.1, 0.7, patch + 0.55 * br + 0.35)
        else:                                         # lens: pointed at both ends
            env = (1 - u * u) ** rng.uniform(0.8, 1.3) * 0.9
            d = env * edge - np.abs(v)
            a = smooth(0.0, 0.2, d)
            a = a * (1 - 0.15 * np.clip(-br, 0, 1))
        # paint piles up a little at the rim of a stroke and along the bristle tracks
        rim = smooth(0.0, 0.25, a) * smooth(1.0, 0.55, a)
        tone = np.clip(0.55 * br + 0.25 * fine + 0.5 * rim, -1.5, 1.5)
        A[k] = np.clip(a, 0, 1)
        T[k] = tone
    return A, T


def _mips(arr):
    out = [arr]
    w, h = SW, SH
    for _ in range(3):
        w //= 2
        h //= 2
        out.append(np.stack([cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA) for a in arr]))
    return [np.ascontiguousarray(o, np.float32) for o in out]


_A, _T = _make_sprites()
SPR_A = _mips(_A)
SPR_T = _mips(_T)


# --------------------------------------------------------------------------- rasteriser
@njit(cache=True, fastmath=True)
def _raster(col, hgt, A0, A1, A2, A3, T0, T1, T2, T3,
            sx, sy, ang, L, Wd, spr, rgb, alpha, hb, tone_amt):
    H, W = hgt.shape
    n = sx.shape[0]
    for i in range(n):
        ln = L[i]
        wd = Wd[i]
        al = alpha[i]
        if ln < 0.6 or wd < 0.4 or al <= 0.004:
            continue
        if ln > 110.0:
            A = A0; T = T0
        elif ln > 55.0:
            A = A1; T = T1
        elif ln > 27.0:
            A = A2; T = T2
        else:
            A = A3; T = T3
        th = A.shape[1]
        tw = A.shape[2]
        k = spr[i]
        c = math.cos(ang[i])
        s = math.sin(ang[i])
        hl = ln * 0.5
        hw = wd * 0.5
        ex = abs(c) * hl + abs(s) * hw + 1.0
        ey = abs(s) * hl + abs(c) * hw + 1.0
        x0 = int(math.floor(sx[i] - ex))
        x1 = int(math.ceil(sx[i] + ex))
        y0 = int(math.floor(sy[i] - ey))
        y1 = int(math.ceil(sy[i] + ey))
        if x0 < 0:
            x0 = 0
        if y0 < 0:
            y0 = 0
        if x1 > W - 1:
            x1 = W - 1
        if y1 > H - 1:
            y1 = H - 1
        if x0 > x1 or y0 > y1:
            continue
        r = rgb[i, 0]
        g = rgb[i, 1]
        b = rgb[i, 2]
        h0 = hb[i]
        iu = (tw - 1) / ln
        iv = (th - 1) / wd
        for py in range(y0, y1 + 1):
            dy = py - sy[i]
            for px in range(x0, x1 + 1):
                dx = px - sx[i]
                fu = (dx * c + dy * s + hl) * iu
                fv = (-dx * s + dy * c + hw) * iv
                if fu < 0.0 or fv < 0.0 or fu >= tw - 1 or fv >= th - 1:
                    continue
                u0 = int(fu)
                v0 = int(fv)
                tu = fu - u0
                tv = fv - v0
                a = (A[k, v0, u0] * (1 - tu) + A[k, v0, u0 + 1] * tu) * (1 - tv) + \
                    (A[k, v0 + 1, u0] * (1 - tu) + A[k, v0 + 1, u0 + 1] * tu) * tv
                a *= al
                if a < 0.004:
                    continue
                tn = T[k, v0, u0]
                m = 1.0 + tone_amt * tn
                col[py, px, 0] += (r * m - col[py, px, 0]) * a
                col[py, px, 1] += (g * m - col[py, px, 1]) * a
                col[py, px, 2] += (b * m - col[py, px, 2]) * a
                hgt[py, px] += (h0 + 0.35 * tn - hgt[py, px]) * a


class Batch:
    """Screen-space strokes ready to rasterise (design-resolution pixels)."""
    __slots__ = ('x', 'y', 'ang', 'L', 'W', 'spr', 'rgb', 'a', 'zo', 'hb')

    def __init__(self, x, y, ang, L, W, spr, rgb, a, zo, hb=None):
        n = len(x)
        f = np.float32
        self.x = np.asarray(x, f)
        self.y = np.asarray(y, f)
        self.ang = np.broadcast_to(np.asarray(ang, f), (n,))
        self.L = np.broadcast_to(np.asarray(L, f), (n,))
        self.W = np.broadcast_to(np.asarray(W, f), (n,))
        self.spr = np.broadcast_to(np.asarray(spr, np.int32), (n,))
        rgb = np.asarray(rgb, f)
        self.rgb = np.broadcast_to(rgb, (n, 3))
        self.a = np.broadcast_to(np.asarray(a, f), (n,))
        self.zo = np.broadcast_to(np.asarray(zo, f), (n,))
        if hb is None:
            hb = 0.5 + 0.5 * np.modf(self.x * 0.37 + self.y * 0.71)[0]
        self.hb = np.broadcast_to(np.asarray(hb, f), (n,))


_WEAVE = {}


def _weave(H, W):
    key = (H, W)
    if key not in _WEAVE:
        rs = H / H0
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        per = 5.2 * max(rs, 0.5)
        wv = 0.5 * np.sin(xx * 2 * np.pi / per) * (0.6 + 0.4 * np.sin(yy * 2 * np.pi / per / 2)) \
            + 0.5 * np.sin(yy * 2 * np.pi / per) * (0.6 + 0.4 * np.sin(xx * 2 * np.pi / per / 2))
        rng = np.random.default_rng(3)
        gr = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.8 * max(rs, 0.5))
        gr /= gr.std()
        lo = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 40 * rs)
        lo /= lo.std()
        vig = 1 - 0.16 * (((xx / W - 0.5) * 2) ** 2 + ((yy / H - 0.5) * 2) ** 2) ** 1.25
        _WEAVE[key] = (wv.astype(np.float32), gr, lo, vig.astype(np.float32))
    return _WEAVE[key]


CANVAS = C(229, 219, 198)


def render(batches, H, tone_amt=0.085, relief=1.0, bloom=0.14, fade=0.0):
    """Composite batches (back to front by zo) and return an HxWx3 uint8 frame."""
    W = H * W0 // H0
    rs = H / H0
    wv, gr, lo, vig = _weave(H, W)
    col = np.empty((H, W, 3), np.float32)
    col[:] = CANVAS * (1 + 0.012 * lo[..., None])
    hgt = np.zeros((H, W), np.float32)
    bs = [b for b in batches if b is not None and len(b.x)]
    if bs:
        zo = np.concatenate([b.zo for b in bs])
        o = np.argsort(zo, kind='stable')
        cat = lambda name: np.ascontiguousarray(np.concatenate([getattr(b, name) for b in bs])[o])
        sx = cat('x') * rs
        sy = cat('y') * rs
        L = cat('L') * rs
        Wd = cat('W') * rs
        _raster(col, hgt, SPR_A[0], SPR_A[1], SPR_A[2], SPR_A[3],
                SPR_T[0], SPR_T[1], SPR_T[2], SPR_T[3],
                sx, sy, cat('ang'), L, Wd, cat('spr'),
                cat('rgb'), cat('a'), cat('hb'), tone_amt)
    # light the paint relief from the upper left; canvas weave shows where paint is thin
    hf = hgt + 0.10 * wv * (1.2 - np.clip(hgt, 0, 1))
    hf = cv2.GaussianBlur(hf, (0, 0), 0.7 * max(rs, 0.6))
    gx = cv2.Sobel(hf, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(hf, cv2.CV_32F, 0, 1, ksize=3)
    sh = np.clip(1.0 - relief * 0.13 * (gx * 0.7 + gy * 0.7), 0.80, 1.22)
    col = cv2.GaussianBlur(col, (0, 0), 0.62 * max(rs, 0.5))      # paint is never pixel-sharp
    col *= sh[..., None]
    col *= (1 + 0.012 * gr)[..., None]
    if bloom > 0:
        lum = col.max(axis=2)
        hi = col * smooth(0.72, 1.02, lum)[..., None]
        small = cv2.resize(hi, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        g1 = cv2.GaussianBlur(small, (0, 0), 5 * rs)
        g2 = cv2.GaussianBlur(small, (0, 0), 16 * rs)
        gl = cv2.resize(0.6 * g1 + 0.4 * g2, (W, H), interpolation=cv2.INTER_LINEAR)
        col = 1 - (1 - np.clip(col, 0, 1)) * (1 - bloom * gl)
    col *= vig[..., None]
    if fade > 0:
        col = col * (1 - fade) + (CANVAS * (1 + 0.012 * lo[..., None]) * (1 + 0.02 * wv[..., None])) * fade
    return (np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8)


def sprite_sheet():
    rows = []
    for k in range(NSPR):
        a = SPR_A[0][k]
        t = SPR_T[0][k]
        img = (0.9 - 0.75 * a * (1 + 0.15 * t))
        rows.append(np.clip(img, 0, 1))
    grid = [np.concatenate(rows[i:i + 4], axis=1) for i in range(0, NSPR, 4)]
    return (np.concatenate(grid, axis=0) * 255).astype(np.uint8)
