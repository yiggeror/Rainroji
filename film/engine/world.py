"""Scene builder: quads / boxes / tubes / extrusions -> triangle soup + face table."""
import numpy as np
from contextlib import contextmanager

MASK_NOSHADOW = 1   # skipped by shadow rays
MASK_THIN = 2       # skipped by shelter (snow / rain cover) rays
MASK_HIDDEN = 4     # skipped by camera rays
MASK_NEAR = 16      # foreground objects: hidden in the 'far' pass, composited over moving things
MASK_NOBOUNCE = 8   # skipped by diffuse bounce rays (tiny bright emitters -> fireflies)

def srgb(h):
    """'#rrggbb' or (r,g,b 0..255) -> linear float rgb"""
    if isinstance(h, str):
        h = h.lstrip('#')
        if len(h) == 3: h = ''.join(ch * 2 for ch in h)
        c = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255
    else:
        c = np.asarray(h, np.float32) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)

def _n(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)

def roty(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], np.float64)

class World:
    def __init__(self, seed=1):
        self.tris = []   # (v0,v1,v2,face,mask)
        self.F = {k: [] for k in ('n', 'org', 'U', 'V', 'mat', 'seed', 'col', 'prm', 'grp', 'tag')}
        self.nf = 0
        self.M = np.eye(3); self.t = np.zeros(3)
        self.stack = []
        self.rng = np.random.default_rng(seed)
        self.lights = []
        self.mats = {}      # name -> id
        self.textures = []  # list of float arrays [h,w,3 or 4] (linear)
        self.fin = None
        self.maskbits = 0

    # ---- transforms
    @contextmanager
    def at(self, pos=(0, 0, 0), yaw=0.0, scale=1.0, M=None):
        self.stack.append((self.M, self.t))
        R = roty(yaw) * scale if M is None else np.asarray(M, np.float64)
        self.t = self.t + self.M @ np.asarray(pos, np.float64)
        self.M = self.M @ R
        try:
            yield
        finally:
            self.M, self.t = self.stack.pop()

    @contextmanager
    def flag(self, bits):
        old = self.maskbits; self.maskbits |= bits
        try: yield
        finally: self.maskbits = old

    def xf(self, P):
        return np.asarray(P, np.float64) @ self.M.T + self.t

    def xd(self, D):
        return np.asarray(D, np.float64) @ self.M.T

    def mat_id(self, name):
        if name not in self.mats: self.mats[name] = len(self.mats)
        return self.mats[name]

    def tex(self, img):
        self.textures.append(np.asarray(img, np.float32)); return len(self.textures) - 1

    # ---- low level
    def _faces(self, N, n, org, U, V, mat, col, prm, seed, grp, tag):
        def bc(a, w):
            a = np.asarray(a, np.float32)
            if a.ndim == 0: a = np.full(w, a, np.float32)
            return np.broadcast_to(a, (N, w)).astype(np.float32)
        self.F['n'].append(n.astype(np.float32)); self.F['org'].append(org.astype(np.float32))
        self.F['U'].append(U.astype(np.float32)); self.F['V'].append(V.astype(np.float32))
        mid = self.mat_id(mat) if isinstance(mat, str) else mat
        self.F['mat'].append(np.broadcast_to(np.asarray(mid, np.int32), (N,)).copy())
        if seed is None: seed = self.rng.random(N)
        self.F['seed'].append(np.broadcast_to(np.asarray(seed, np.float32), (N,)).copy())
        if isinstance(col, str): col = srgb(col)
        self.F['col'].append(bc(col, 3)); self.F['prm'].append(bc(prm, 4))
        self.F['grp'].append(np.broadcast_to(np.asarray(grp, np.int32), (N,)).copy())
        self.F['tag'].append(np.broadcast_to(np.asarray(tag, np.int32), (N,)).copy())
        idx = np.arange(self.nf, self.nf + N); self.nf += N
        return idx

    def quads(self, P0, P1, P2, P3, mat='plain', col=1.0, prm=0.0, seed=None, grp=0, tag=0, mask=0, U=None, V=None, org=None, local=True):
        P0, P1, P2, P3 = [np.atleast_2d(np.asarray(p, np.float64)) for p in (P0, P1, P2, P3)]
        N = max(len(P0), len(P1), len(P2), len(P3))
        P0, P1, P2, P3 = [np.broadcast_to(p, (N, 3)) for p in (P0, P1, P2, P3)]
        if local:
            P0, P1, P2, P3 = [self.xf(p) for p in (P0, P1, P2, P3)]
            if U is not None: U = _n(self.xd(np.broadcast_to(U, (N, 3))))
            if V is not None: V = _n(self.xd(np.broadcast_to(V, (N, 3))))
            if org is not None: org = self.xf(np.broadcast_to(org, (N, 3)))
        n = _n(np.cross(P1 - P0, P3 - P0))
        if U is None: U = _n(P1 - P0)
        if V is None: V = np.cross(n, U)
        if org is None: org = P0
        f = self._faces(N, n, org, np.broadcast_to(U, (N, 3)), np.broadcast_to(V, (N, 3)), mat, col, prm, seed, grp, tag)
        m = np.full(N, mask | self.maskbits, np.uint8)
        self.tris.append((P0, P1, P2, f, m)); self.tris.append((P0, P2, P3, f, m))
        return f

    def poly(self, pts, mat='plain', col=1.0, prm=0.0, seed=None, grp=0, tag=0, mask=0, U=None):
        p = self.xf(np.asarray(pts, np.float64)); k = len(p)
        n = np.zeros(3)
        for i in range(k):
            a, b = p[i], p[(i + 1) % k]
            n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
        n = _n(n)
        U = _n(p[1] - p[0]) if U is None else _n(self.xd(U))
        V = np.cross(n, U)
        if seed is None: seed = self.rng.random()
        f = self._faces(1, n[None], p[0][None], U[None], V[None], mat, col, prm, seed, grp, tag)
        v0 = np.repeat(p[0][None], k - 2, 0)
        self.tris.append((v0, p[1:-1], p[2:], np.repeat(f, k - 2), np.full(k - 2, mask | self.maskbits, np.uint8)))
        return f

    def box(self, c, s, yaw=0.0, mat='plain', col=1.0, prm=0.0, seed=None, grp=0, tag=0, mask=0, faces='xXyYzZ', over=None):
        """c: centre(s) [N,3], s: full size(s). faces: x=-x X=+x y=bottom Y=top z=-z Z=+z. over: {'Y': dict(mat=..)}"""
        c = np.atleast_2d(np.asarray(c, np.float64)); N0 = len(c)
        s = np.broadcast_to(np.asarray(s, np.float64), (max(N0, np.atleast_2d(s).shape[0]), 3)); N = len(s)
        c = np.broadcast_to(c, (N, 3))
        yaw = np.broadcast_to(np.asarray(yaw, np.float64), (N,))
        h = s * 0.5
        cy, sy = np.cos(yaw), np.sin(yaw)
        X = np.stack([cy, 0 * cy, -sy], 1); Y = np.broadcast_to([0., 1, 0], (N, 3)); Z = np.stack([sy, 0 * cy, cy], 1)
        hx, hy, hz = h[:, :1] * X, h[:, 1:2] * Y, h[:, 2:3] * Z
        if seed is None: seed = self.rng.random(N)
        if isinstance(col, str): col = srgb(col)
        spec = {'Z': (c - hx - hy + hz, 2 * hx, 2 * hy), 'z': (c + hx - hy - hz, -2 * hx, 2 * hy),
                'X': (c + hx - hy + hz, -2 * hz, 2 * hy), 'x': (c - hx - hy - hz, 2 * hz, 2 * hy),
                'Y': (c - hx + hy + hz, 2 * hx, -2 * hz), 'y': (c - hx - hy - hz, 2 * hx, 2 * hz)}
        out = {}
        for k in faces:
            p0, a, b = spec[k]
            kw = dict(mat=mat, col=col, prm=prm, seed=seed, grp=grp, tag=tag, mask=mask)
            if over and k in over: kw.update(over[k])
            out[k] = self.quads(p0, p0 + a, p0 + a + b, p0 + b, **kw)
        return out

    def tube(self, p0, p1, r0, r1=None, sides=4, mat='plain', col=1.0, prm=0.0, seed=None, grp=0, tag=0, mask=0, caps=False):
        p0 = np.atleast_2d(np.asarray(p0, np.float64)); p1 = np.atleast_2d(np.asarray(p1, np.float64))
        N = max(len(p0), len(p1)); p0 = np.broadcast_to(p0, (N, 3)); p1 = np.broadcast_to(p1, (N, 3))
        r0 = np.broadcast_to(np.asarray(r0, np.float64), (N,))[:, None]
        r1 = r0 if r1 is None else np.broadcast_to(np.asarray(r1, np.float64), (N,))[:, None]
        a = _n(p1 - p0)
        ref = np.where(np.abs(a[:, 1:2]) < 0.9, np.array([[0., 1, 0]]), np.array([[1., 0, 0]]))
        b1 = _n(np.cross(ref, a)); b2 = np.cross(a, b1)
        if seed is None: seed = self.rng.random(N)
        if isinstance(col, str): col = srgb(col)
        fs = []
        for k in range(sides):
            a0 = 2 * np.pi * k / sides; a1 = 2 * np.pi * (k + 1) / sides
            d0 = np.cos(a0) * b1 + np.sin(a0) * b2; d1 = np.cos(a1) * b1 + np.sin(a1) * b2
            fs.append(self.quads(p0 + r0 * d0, p0 + r0 * d1, p1 + r1 * d1, p1 + r1 * d0, mat=mat, col=col, prm=prm, seed=seed, grp=grp, tag=tag, mask=mask))
        if caps:
            for i in range(N):
                for (pp, rr, sg) in ((p1[i], r1[i, 0], 1), (p0[i], r0[i, 0], -1)):
                    ang = np.arange(sides) * 2 * np.pi / sides * sg
                    pts = pp + rr * (np.cos(ang)[:, None] * b1[i] + np.sin(ang)[:, None] * b2[i])
                    self.poly(pts, mat=mat, col=np.broadcast_to(np.asarray(col, np.float32), (N, 3))[i] if np.ndim(col) > 1 else col, prm=prm, grp=grp, tag=tag, mask=mask)
        return fs

    def extrude(self, prof, z0, z1, mat='plain', col=1.0, prm=0.0, seed=None, grp=0, tag=0, mask=0, caps=True, capkw=None):
        """prof: [(x,y)] CCW seen from +z (local). Extruded along local z."""
        prof = np.asarray(prof, np.float64); k = len(prof)
        if seed is None: seed = self.rng.random()
        i = np.arange(k); j = (i + 1) % k
        A = np.concatenate([prof[i], np.full((k, 1), z1)], 1); B = np.concatenate([prof[i], np.full((k, 1), z0)], 1)
        C = np.concatenate([prof[j], np.full((k, 1), z0)], 1); D = np.concatenate([prof[j], np.full((k, 1), z1)], 1)
        f = self.quads(A, B, C, D, mat=mat, col=col, prm=prm, seed=seed, grp=grp, tag=tag, mask=mask)
        if caps:
            kw = dict(mat=mat, col=col, prm=prm, seed=seed, grp=grp, tag=tag, mask=mask)
            if capkw: kw.update(capkw)
            self.poly(np.concatenate([prof, np.full((k, 1), z1)], 1), **kw)
            self.poly(np.concatenate([prof[::-1], np.full((k, 1), z0)], 1), **kw)
        return f

    def sphere(self, c, r, n=8, squash=1.0, **kw):
        c = np.asarray(c, np.float64)
        la = np.linspace(-np.pi / 2, np.pi / 2, n // 2 + 2); lo = np.linspace(0, 2 * np.pi, n + 1)
        def pt(a, b): return c + r * np.array([np.cos(a) * np.cos(b), np.sin(a) * squash, np.cos(a) * np.sin(b)])
        P0, P1, P2, P3 = [], [], [], []
        for i in range(len(la) - 1):
            for j in range(n):
                P0.append(pt(la[i], lo[j + 1])); P1.append(pt(la[i], lo[j])); P2.append(pt(la[i + 1], lo[j])); P3.append(pt(la[i + 1], lo[j + 1]))
        if 'seed' not in kw: kw['seed'] = self.rng.random()
        return self.quads(P0, P1, P2, P3, **kw)

    def grid(self, x0, z0, x1, z1, step, hfn, **kw):
        """heightfield mesh; hfn(x,z)->y (world coords, call outside any transform)"""
        xs = np.arange(x0, x1 + 1e-6, step); zs = np.arange(z0, z1 + 1e-6, step)
        X, Z = np.meshgrid(xs, zs); Y = hfn(X.ravel(), Z.ravel()).reshape(X.shape)
        P = np.stack([X, Y, Z], -1)
        a = P[1:, :-1].reshape(-1, 3); b = P[1:, 1:].reshape(-1, 3); c = P[:-1, 1:].reshape(-1, 3); d = P[:-1, :-1].reshape(-1, 3)
        return self.quads(a, b, c, d, local=False, **kw)

    # ---- lights
    def light(self, kind, color, pos=None, dir=None, radius=0.05, grp=0, range=1e9, axis=None, cone=None, soft=0.01, r0=0.3, mask=MASK_NOSHADOW, vol=0.0):
        """kind 'sun' (dir = towards light, soft = angular radius rad) or 'point'.
        cone=(cos_outer, cos_inner) with axis for spots. Positions are transformed by the current frame."""
        L = dict(kind=kind, color=np.asarray(srgb(color) if isinstance(color, str) else color, np.float32), grp=grp, range=range, radius=radius, soft=soft, r0=r0, mask=mask, vol=vol)
        if pos is not None: L['pos'] = self.xf(pos).astype(np.float32)
        if dir is not None: L['dir'] = _n(np.asarray(dir, np.float64)).astype(np.float32)
        if axis is not None: L['axis'] = _n(self.xd(axis)).astype(np.float32); L['cone'] = cone
        self.lights.append(L); return L

    # ---- finalize
    def finalize(self):
        if self.fin is None:
            v0 = np.concatenate([t[0] for t in self.tris]).astype(np.float32)
            v1 = np.concatenate([t[1] for t in self.tris]).astype(np.float32)
            v2 = np.concatenate([t[2] for t in self.tris]).astype(np.float32)
            tf = np.concatenate([t[3] for t in self.tris]).astype(np.int32)
            tm = np.concatenate([t[4] for t in self.tris]).astype(np.uint8)
            F = {k: np.concatenate(v) for k, v in self.F.items()}
            self.fin = dict(v0=v0, v1=v1, v2=v2, tf=tf, tm=tm, F=F)
        return self.fin
