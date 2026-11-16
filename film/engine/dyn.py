"""Moving rigid objects: traced per frame against their own BVH (rays are moved instead of the geometry),
shaded with an ambient cube taken from the sky, depth-tested against the static plate."""
import numpy as np
from .rt import Accel
from .render import surface, fog_T, _n
from .world import MASK_HIDDEN

def ambient_cube(sky, n=4000, seed=0, ground=(0.05, 0.05, 0.06)):
    rng = np.random.default_rng(seed)
    d = _n(rng.normal(size=(n, 3))).astype(np.float32)
    L = sky(np.stack([d[:, 0], np.abs(d[:, 1]), d[:, 2]], 1))
    L = np.where(d[:, 1:2] < 0, np.asarray(ground, np.float32)[None], L)
    axes = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], np.float32)
    E = []
    for a in axes:
        w = np.maximum(d @ a, 0)
        E.append((L * w[:, None]).sum(0) / w.sum())
    return axes, np.array(E, np.float32)

class Dyn:
    def __init__(self, world, cam, S=4, seed=0):
        self.world = world; self.g = world.finalize(); self.cam = cam; self.S = S
        self.acc = Accel(self.g['v0'], self.g['v1'], self.g['v2'], self.g['tm'])
        rng = np.random.default_rng(seed)
        o, d = cam.rays(S, rng)
        H, W = cam.H, cam.W
        self.o = o.reshape(H * S, W * S, 3); self.d = d.reshape(H * S, W * S, 3)
        world.pixang = 2 * cam.th / cam.W

    def render(self, offset, shade, depth, y0, y1, fog=None, fogcol=None):
        """offset: world translation of the object. returns (rgb premultiplied [y1-y0,W,3], alpha [y1-y0,W])"""
        S = self.S; W = self.cam.W
        o = (self.o[y0 * S:y1 * S] - np.asarray(offset, np.float32)).reshape(-1, 3); d = self.d[y0 * S:y1 * S].reshape(-1, 3)
        t, tri = self.acc.closest(o, d, mask=MASK_HIDDEN)
        idx = np.nonzero(tri >= 0)[0]
        col = np.zeros((len(o), 3), np.float32); hit = np.zeros(len(o), np.float32); tt = np.zeros(len(o), np.float32)
        if len(idx):
            P = o[idx] + d[idx] * t[idx, None]
            sf = surface(self.world, self.g, tri[idx], P, d[idx], t[idx])
            c = shade(sf, P, d[idx])
            if fog is not None:
                T = np.exp(-fog * t[idx])[:, None]; c = c * T + np.asarray(fogcol, np.float32)[None] * (1 - T)
            col[idx] = c; hit[idx] = 1; tt[idx] = t[idx]
        h = y1 - y0
        agg = lambda a: a.reshape((h, S, W, S) + a.shape[1:]).mean((1, 3))
        hf = agg(hit); cm = agg(col); tm = agg(tt) / np.maximum(hf, 1e-6)
        occ = (depth[y0:y1] < tm[..., None]).mean(2)
        vis = np.where(hf > 0, 1 - occ, 0)
        return cm * vis[..., None], hf * vis

    def render_xf(self, origin, R, shade, depth, y0, y1, fog=None, fogcol=None):
        """like render, but the object's local frame is placed at `origin` and rotated by R (3x3, local->world)"""
        S = self.S; W = self.cam.W
        Rf = np.asarray(R, np.float32)
        o = ((self.o[y0 * S:y1 * S].reshape(-1, 3) - np.asarray(origin, np.float32)) @ Rf)      # world -> local (R orthonormal)
        d = self.d[y0 * S:y1 * S].reshape(-1, 3) @ Rf
        t, tri = self.acc.closest(o, d, mask=MASK_HIDDEN)
        idx = np.nonzero(tri >= 0)[0]
        col = np.zeros((len(o), 3), np.float32); hit = np.zeros(len(o), np.float32); tt = np.zeros(len(o), np.float32)
        if len(idx):
            P = o[idx] + d[idx] * t[idx, None]
            sf = surface(self.world, self.g, tri[idx], P, d[idx], t[idx])
            c = shade(sf, P, d[idx])
            if fog is not None:
                T = np.exp(-fog * t[idx])[:, None]; c = c * T + np.asarray(fogcol, np.float32)[None] * (1 - T)
            col[idx] = c; hit[idx] = 1; tt[idx] = t[idx]
        h = y1 - y0
        agg = lambda a: a.reshape((h, S, W, S) + a.shape[1:]).mean((1, 3))
        hf = agg(hit); cm = agg(col); tm = agg(tt) / np.maximum(hf, 1e-6)
        occ = (depth[y0:y1] < tm[..., None]).mean(2)
        vis = np.where(hf > 0, 1 - occ, 0)
        return cm * vis[..., None], hf * vis
