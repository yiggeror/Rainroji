"""Surface post-processes applied to every shaded hit: snow cover, rain wetness."""
import numpy as np
from .noise import fbm2
from .world import srgb, MASK_THIN
from .props import TAG_NOSNOW, TAG_WIRE
from .mats import sstep

def snow_hook(col='#e4ebf2', amount=1.0, thresh=0.3, shelter=1.6):
    c = srgb(col)
    def hook(sf, acc, rng):
        up = sf['Ng'][:, 1]
        ii = np.nonzero((up > thresh) & (sf['tag'] != TAG_NOSNOW) & (sf['tag'] != TAG_WIRE))[0]
        if not len(ii): return
        P = sf['P'][ii]
        o = P + np.array([0, 0.03, 0], np.float32)
        d = np.tile(np.array([[0.05, 1, 0.02]], np.float32), (len(ii), 1)); d /= np.linalg.norm(d[0])
        occ = acc.anyhit(o, d, shelter, mask=MASK_THIN)
        nz = fbm2(P[:, 0] * 1.3, P[:, 2] * 1.3, 301, 3)
        cover = sstep(thresh, thresh + 0.4, up[ii] + (nz - 0.5) * 0.5) * (~occ) * amount
        tint = c[None] * (0.86 + 0.14 * fbm2(P[:, 0] * 5, P[:, 2] * 5, 302, 2))[:, None]
        sf['alb'][ii] = sf['alb'][ii] * (1 - cover[:, None]) + tint * cover[:, None]
        sf['refl'][ii] *= (1 - cover)
    return hook

def wet_hook(amount=1.0):
    """rain: exposed surfaces darken and become glossy; sheltered ones stay dry"""
    def hook(sf, acc, rng):
        ii = np.nonzero(sf['tag'] != TAG_NOSNOW)[0]
        if not len(ii): return
        P = sf['P'][ii]
        o = P + sf['N'][ii] * 0.03
        d = np.tile(np.array([[0.08, 1, 0.03]], np.float32), (len(ii), 1)); d /= np.linalg.norm(d[0])
        occ = acc.anyhit(o, d, 60.0, mask=MASK_THIN)
        up = np.clip(sf['Ng'][ii, 1], 0, 1)
        wet = (~occ) * amount * (0.45 + 0.55 * up)
        sf['alb'][ii] *= (1 - 0.4 * wet)[:, None]
        add = np.where(up > 0.6, 0.03 * wet * (amount >= 0.75), 0.0)
        sf['refl'][ii] = np.maximum(sf['refl'][ii], add)
        sf['rough'][ii] = np.where((sf['rough'][ii] == 0) & (add > 0), 0.03, sf['rough'][ii])
    return hook

class GroundMap:
    """top-down scalar/RGB map over [x0,x1]x[z0,z1], drawn with PIL, sampled by materials"""
    def __init__(self, x0, z0, x1, z1, res=8, ch=1):
        from PIL import Image, ImageDraw
        self.x0, self.z0, self.res = x0, z0, res
        self.W = int((x1 - x0) * res); self.H = int((z1 - z0) * res)
        self.im = Image.new('L', (self.W, self.H), 0); self.d = ImageDraw.Draw(self.im)
        self.a = None
    def px(self, p): return ((p[0] - self.x0) * self.res, (p[1] - self.z0) * self.res)
    def line(self, pts, width, v=1.0):
        self.d.line([self.px(p) for p in pts], fill=int(v * 255), width=max(1, int(width * self.res)), joint='curve')
    def poly(self, pts, v=1.0): self.d.polygon([self.px(p) for p in pts], fill=int(v * 255))
    def steps(self, pts, stride=0.68, r=0.11, v=0.9, spread=0.11):
        """a trail of footprints along a polyline"""
        pts = [np.asarray(p, float) for p in pts]; k = 0; carry = 0.0
        for a, b in zip(pts[:-1], pts[1:]):
            L = np.linalg.norm(b - a); d = (b - a) / max(L, 1e-6); nrm = np.array([-d[1], d[0]])
            t = carry
            while t < L:
                p = a + d * t + nrm * spread * (1 if k % 2 == 0 else -1)
                self.disc(p, r, v); k += 1; t += stride
            carry = t - L

    def disc(self, c, r, v=1.0):
        x, y = self.px(c); rr = r * self.res; self.d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=int(v * 255))
    def done(self, blur=0.0):
        from PIL import ImageFilter
        im = self.im.filter(ImageFilter.GaussianBlur(blur * self.res)) if blur > 0 else self.im
        self.a = np.asarray(im, np.float32) / 255.0; return self
    def sample(self, x, z):
        fx = np.clip((x - self.x0) * self.res - 0.5, 0, self.W - 1.001); fy = np.clip((z - self.z0) * self.res - 0.5, 0, self.H - 1.001)
        ix = fx.astype(np.int32); iy = fy.astype(np.int32); tx = fx - ix; ty = fy - iy
        a = self.a
        return (a[iy, ix] * (1 - tx) + a[iy, ix + 1] * tx) * (1 - ty) + (a[iy + 1, ix] * (1 - tx) + a[iy + 1, ix + 1] * tx) * ty
