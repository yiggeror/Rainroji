"""Small BVH ray tracer (numba).  Triangles only; float32.
build(v0,v1,v2) -> Accel ; closest(acc,o,d,tmax,mask) ; anyhit(acc,o,d,tmax,mask)"""
import numpy as np
from numba import njit, prange

@njit(cache=True)
def _build(v0, v1, v2, leaf_size):
    n = v0.shape[0]
    tmin = np.minimum(np.minimum(v0, v1), v2)
    tmax = np.maximum(np.maximum(v0, v1), v2)
    cen = (tmin + tmax) * np.float32(0.5)
    idx = np.arange(n).astype(np.int32)
    maxn = 2 * n + 2
    bmin = np.empty((maxn, 3), np.float32); bmax = np.empty((maxn, 3), np.float32)
    left = np.full(maxn, -1, np.int32); right = np.full(maxn, -1, np.int32)
    start = np.zeros(maxn, np.int32); count = np.zeros(maxn, np.int32)
    stack = np.empty((128, 3), np.int64)
    sp = 0
    stack[0, 0] = 0; stack[0, 1] = 0; stack[0, 2] = n; sp = 1
    nn = 1
    NB = 16
    bcnt = np.empty(NB, np.int64)
    bbmin = np.empty((NB, 3), np.float32); bbmax = np.empty((NB, 3), np.float32)
    rarea = np.empty(NB, np.float32); rcnt = np.empty(NB, np.int64)
    while sp > 0:
        sp -= 1
        node = stack[sp, 0]; lo = stack[sp, 1]; hi = stack[sp, 2]
        mn = np.array([1e30, 1e30, 1e30], np.float32); mx = -mn
        cmn = mn.copy(); cmx = mx.copy()
        for i in range(lo, hi):
            t = idx[i]
            for a in range(3):
                if tmin[t, a] < mn[a]: mn[a] = tmin[t, a]
                if tmax[t, a] > mx[a]: mx[a] = tmax[t, a]
                if cen[t, a] < cmn[a]: cmn[a] = cen[t, a]
                if cen[t, a] > cmx[a]: cmx[a] = cen[t, a]
        bmin[node] = mn; bmax[node] = mx
        cnt = hi - lo
        ext = cmx - cmn
        ax = 0
        if ext[1] > ext[ax]: ax = 1
        if ext[2] > ext[ax]: ax = 2
        if cnt <= leaf_size or ext[ax] < 1e-7:
            start[node] = lo; count[node] = cnt
            continue
        # binned SAH
        for b in range(NB):
            bcnt[b] = 0
            for a in range(3):
                bbmin[b, a] = 1e30; bbmax[b, a] = -1e30
        scale = NB / ext[ax]
        for i in range(lo, hi):
            t = idx[i]
            b = int((cen[t, ax] - cmn[ax]) * scale)
            if b >= NB: b = NB - 1
            bcnt[b] += 1
            for a in range(3):
                if tmin[t, a] < bbmin[b, a]: bbmin[b, a] = tmin[t, a]
                if tmax[t, a] > bbmax[b, a]: bbmax[b, a] = tmax[t, a]
        # sweep from right
        amn = np.array([1e30, 1e30, 1e30], np.float32); amx = -amn
        c = 0
        for b in range(NB - 1, 0, -1):
            c += bcnt[b]
            for a in range(3):
                if bbmin[b, a] < amn[a]: amn[a] = bbmin[b, a]
                if bbmax[b, a] > amx[a]: amx[a] = bbmax[b, a]
            dx = amx[0] - amn[0]; dy = amx[1] - amn[1]; dz = amx[2] - amn[2]
            rarea[b] = dx * dy + dy * dz + dz * dx if c > 0 else 0.0
            rcnt[b] = c
        amn = np.array([1e30, 1e30, 1e30], np.float32); amx = -amn
        c = 0; best = 1e30; bs = -1
        for b in range(0, NB - 1):
            c += bcnt[b]
            for a in range(3):
                if bbmin[b, a] < amn[a]: amn[a] = bbmin[b, a]
                if bbmax[b, a] > amx[a]: amx[a] = bbmax[b, a]
            if c == 0 or rcnt[b + 1] == 0: continue
            dx = amx[0] - amn[0]; dy = amx[1] - amn[1]; dz = amx[2] - amn[2]
            cost = (dx * dy + dy * dz + dz * dx) * c + rarea[b + 1] * rcnt[b + 1]
            if cost < best: best = cost; bs = b
        if bs < 0:
            start[node] = lo; count[node] = cnt
            continue
        # partition
        i = lo; j = hi - 1
        while i <= j:
            t = idx[i]
            b = int((cen[t, ax] - cmn[ax]) * scale)
            if b >= NB: b = NB - 1
            if b <= bs:
                i += 1
            else:
                idx[i] = idx[j]; idx[j] = t; j -= 1
        mid = i
        if mid == lo or mid == hi:
            mid = (lo + hi) // 2
        l = nn; r = nn + 1; nn += 2
        left[node] = l; right[node] = r
        stack[sp, 0] = l; stack[sp, 1] = lo; stack[sp, 2] = mid; sp += 1
        stack[sp, 0] = r; stack[sp, 1] = mid; stack[sp, 2] = hi; sp += 1
    return bmin[:nn].copy(), bmax[:nn].copy(), left[:nn].copy(), right[:nn].copy(), start[:nn].copy(), count[:nn].copy(), idx


class Accel:
    def __init__(self, v0, v1, v2, tmask=None, leaf=4):
        v0 = np.ascontiguousarray(v0, np.float32); v1 = np.ascontiguousarray(v1, np.float32); v2 = np.ascontiguousarray(v2, np.float32)
        n = len(v0)
        if tmask is None: tmask = np.zeros(n, np.uint8)
        bmin, bmax, left, right, start, count, idx = _build(v0, v1, v2, leaf)
        self.nodes = (bmin, bmax, left, right, start, count)
        self.order = idx
        self.v0 = np.ascontiguousarray(v0[idx]); self.e1 = np.ascontiguousarray((v1 - v0)[idx]); self.e2 = np.ascontiguousarray((v2 - v0)[idx])
        self.tmask = np.ascontiguousarray(tmask[idx].astype(np.uint8))
        self.n = n

    def closest(self, o, d, tmax=1e30, mask=0):
        o = np.ascontiguousarray(o, np.float32); d = np.ascontiguousarray(d, np.float32)
        tm = np.full(len(o), tmax, np.float32) if np.isscalar(tmax) else np.ascontiguousarray(tmax, np.float32)
        t, tri = _closest(*self.nodes, self.v0, self.e1, self.e2, self.tmask, o, d, tm, np.uint8(mask))
        hit = tri >= 0
        tri[hit] = self.order[tri[hit]]
        return t, tri

    def anyhit(self, o, d, tmax=1e30, mask=0):
        o = np.ascontiguousarray(o, np.float32); d = np.ascontiguousarray(d, np.float32)
        tm = np.full(len(o), tmax, np.float32) if np.isscalar(tmax) else np.ascontiguousarray(tmax, np.float32)
        return _any(*self.nodes, self.v0, self.e1, self.e2, self.tmask, o, d, tm, np.uint8(mask))


@njit(cache=True, inline='always')
def _tri(v0, e1, e2, ox, oy, oz, dx, dy, dz):
    px = dy * e2[2] - dz * e2[1]; py = dz * e2[0] - dx * e2[2]; pz = dx * e2[1] - dy * e2[0]
    det = e1[0] * px + e1[1] * py + e1[2] * pz
    if det > -1e-12 and det < 1e-12: return -1.0
    inv = 1.0 / det
    tx = ox - v0[0]; ty = oy - v0[1]; tz = oz - v0[2]
    u = (tx * px + ty * py + tz * pz) * inv
    if u < -1e-6 or u > 1.000001: return -1.0
    qx = ty * e1[2] - tz * e1[1]; qy = tz * e1[0] - tx * e1[2]; qz = tx * e1[1] - ty * e1[0]
    v = (dx * qx + dy * qy + dz * qz) * inv
    if v < -1e-6 or u + v > 1.000001: return -1.0
    return (e2[0] * qx + e2[1] * qy + e2[2] * qz) * inv


@njit(cache=True, inline='always')
def _box(bmin, bmax, ox, oy, oz, ix, iy, iz, tmax):
    t1 = (bmin[0] - ox) * ix; t2 = (bmax[0] - ox) * ix
    if t1 > t2: t1, t2 = t2, t1
    tn = t1; tf = t2
    t1 = (bmin[1] - oy) * iy; t2 = (bmax[1] - oy) * iy
    if t1 > t2: t1, t2 = t2, t1
    if t1 > tn: tn = t1
    if t2 < tf: tf = t2
    t1 = (bmin[2] - oz) * iz; t2 = (bmax[2] - oz) * iz
    if t1 > t2: t1, t2 = t2, t1
    if t1 > tn: tn = t1
    if t2 < tf: tf = t2
    if tf < 0.0 or tn > tf or tn > tmax: return 1e30
    return tn


@njit(cache=True, parallel=True)
def _closest(bmin, bmax, left, right, start, count, v0, e1, e2, tmask, O, D, TM, mask):
    n = O.shape[0]
    T = np.empty(n, np.float32); TRI = np.empty(n, np.int32)
    for r in prange(n):
        ox = np.float64(O[r, 0]); oy = np.float64(O[r, 1]); oz = np.float64(O[r, 2])
        dx = np.float64(D[r, 0]); dy = np.float64(D[r, 1]); dz = np.float64(D[r, 2])
        ix = 1.0 / dx if dx != 0 else 1e30; iy = 1.0 / dy if dy != 0 else 1e30; iz = 1.0 / dz if dz != 0 else 1e30
        best = np.float64(TM[r]); bt = -1
        stack = np.empty(96, np.int32); sp = 1; stack[0] = 0
        while sp > 0:
            sp -= 1; nd = stack[sp]
            if _box(bmin[nd], bmax[nd], ox, oy, oz, ix, iy, iz, best) > 1e29: continue
            c = count[nd]
            if c > 0:
                s = start[nd]
                for k in range(s, s + c):
                    if tmask[k] & mask: continue
                    t = _tri(v0[k], e1[k], e2[k], ox, oy, oz, dx, dy, dz)
                    if t > 1e-5 and t < best: best = t; bt = k
            else:
                l = left[nd]; rr = right[nd]
                tl = _box(bmin[l], bmax[l], ox, oy, oz, ix, iy, iz, best)
                tr = _box(bmin[rr], bmax[rr], ox, oy, oz, ix, iy, iz, best)
                if tl < tr:
                    if tr < 1e29: stack[sp] = rr; sp += 1
                    if tl < 1e29: stack[sp] = l; sp += 1
                else:
                    if tl < 1e29: stack[sp] = l; sp += 1
                    if tr < 1e29: stack[sp] = rr; sp += 1
        T[r] = best; TRI[r] = bt
    return T, TRI


@njit(cache=True, parallel=True)
def _any(bmin, bmax, left, right, start, count, v0, e1, e2, tmask, O, D, TM, mask):
    n = O.shape[0]
    H = np.zeros(n, np.bool_)
    for r in prange(n):
        ox = np.float64(O[r, 0]); oy = np.float64(O[r, 1]); oz = np.float64(O[r, 2])
        dx = np.float64(D[r, 0]); dy = np.float64(D[r, 1]); dz = np.float64(D[r, 2])
        ix = 1.0 / dx if dx != 0 else 1e30; iy = 1.0 / dy if dy != 0 else 1e30; iz = 1.0 / dz if dz != 0 else 1e30
        tm = np.float64(TM[r])
        if tm <= 0: continue
        stack = np.empty(96, np.int32); sp = 1; stack[0] = 0
        found = False
        while sp > 0 and not found:
            sp -= 1; nd = stack[sp]
            if _box(bmin[nd], bmax[nd], ox, oy, oz, ix, iy, iz, tm) > 1e29: continue
            c = count[nd]
            if c > 0:
                s = start[nd]
                for k in range(s, s + c):
                    if tmask[k] & mask: continue
                    t = _tri(v0[k], e1[k], e2[k], ox, oy, oz, dx, dy, dz)
                    if t > 1e-5 and t < tm: found = True; break
            else:
                stack[sp] = left[nd]; sp += 1
                stack[sp] = right[nd]; sp += 1
        H[r] = found
    return H
