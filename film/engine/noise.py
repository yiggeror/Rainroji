"""Hash noise (numba). All take flat float arrays and return float32 in [0,1]."""
import numpy as np
from numba import njit, prange

@njit(cache=True, inline='always')
def _h(ix, iy, iz, seed):
    x = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    x &= 0xFFFFFFFF
    x = ((x ^ (x >> 15)) * 0x2C1B3C6D) & 0xFFFFFFFF
    x = ((x ^ (x >> 12)) * 0x297A2D39) & 0xFFFFFFFF
    x ^= x >> 15
    return x / 4294967296.0

@njit(cache=True, inline='always')
def _v2(x, y, seed):
    xf = np.floor(x); yf = np.floor(y)
    ix = np.int64(xf); iy = np.int64(yf)
    fx = x - xf; fy = y - yf
    ux = fx * fx * (3 - 2 * fx); uy = fy * fy * (3 - 2 * fy)
    a = _h(ix, iy, 0, seed); b = _h(ix + 1, iy, 0, seed); c = _h(ix, iy + 1, 0, seed); d = _h(ix + 1, iy + 1, 0, seed)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy

@njit(cache=True, inline='always')
def _v3(x, y, z, seed):
    xf = np.floor(x); yf = np.floor(y); zf = np.floor(z)
    ix = np.int64(xf); iy = np.int64(yf); iz = np.int64(zf)
    fx = x - xf; fy = y - yf; fz = z - zf
    ux = fx * fx * (3 - 2 * fx); uy = fy * fy * (3 - 2 * fy); uz = fz * fz * (3 - 2 * fz)
    r = 0.0
    for k in range(2):
        a = _h(ix, iy, iz + k, seed); b = _h(ix + 1, iy, iz + k, seed); c = _h(ix, iy + 1, iz + k, seed); d = _h(ix + 1, iy + 1, iz + k, seed)
        v = a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
        r += v * (uz if k == 1 else 1 - uz)
    return r

@njit(cache=True, parallel=True)
def _fbm2(x, y, seed, octaves, lac, gain):
    n = x.shape[0]; out = np.empty(n, np.float32)
    for i in prange(n):
        a = 1.0; f = 1.0; s = 0.0; tot = 0.0
        for o in range(octaves):
            s += a * _v2(x[i] * f, y[i] * f, seed + o * 17); tot += a
            a *= gain; f *= lac
        out[i] = s / tot
    return out

@njit(cache=True, parallel=True)
def _fbm3(x, y, z, seed, octaves, lac, gain):
    n = x.shape[0]; out = np.empty(n, np.float32)
    for i in prange(n):
        a = 1.0; f = 1.0; s = 0.0; tot = 0.0
        for o in range(octaves):
            s += a * _v3(x[i] * f, y[i] * f, z[i] * f, seed + o * 17); tot += a
            a *= gain; f *= lac
        out[i] = s / tot
    return out

@njit(cache=True, parallel=True)
def _hash2(x, y, seed):
    n = x.shape[0]; out = np.empty(n, np.float32)
    for i in prange(n):
        out[i] = _h(np.int64(np.floor(x[i])), np.int64(np.floor(y[i])), 0, seed)
    return out

def _f(a):
    return np.ascontiguousarray(a, np.float64).ravel()

def fbm2(x, y, seed=0, octaves=4, lac=2.0, gain=0.5):
    x = np.asarray(x); sh = x.shape
    return _fbm2(_f(x), _f(np.broadcast_to(y, sh)), int(seed), octaves, lac, gain).reshape(sh)

def fbm3(x, y, z, seed=0, octaves=4, lac=2.0, gain=0.5):
    x = np.asarray(x); sh = x.shape
    return _fbm3(_f(x), _f(np.broadcast_to(y, sh)), _f(np.broadcast_to(z, sh)), int(seed), octaves, lac, gain).reshape(sh)

def hash2(x, y, seed=0):
    """per-cell random (cell = integer part)"""
    x = np.asarray(x); sh = x.shape
    return _hash2(_f(x), _f(np.broadcast_to(y, sh)), int(seed)).reshape(sh)

def loop3(x, y, ph, seed=0, octaves=3, tscale=1.0):
    """noise that loops in ph (0..1): crossfade of two time slices"""
    ph = ph % 1.0
    a = fbm3(x, y, np.full(np.shape(x), ph * tscale), seed, octaves)
    b = fbm3(x, y, np.full(np.shape(x), (ph - 1.0) * tscale), seed, octaves)
    return a * (1 - ph) + b * ph
