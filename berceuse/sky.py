"""The sky: a dome of strokes anchored to directions, so it turns with the camera and never
slides.  The same colour model is used for the dome, for the mirror image in the water and
for the air that distance puts in front of things."""
import numpy as np
from engine import smooth, mix, noise, snoise, DASH, DAB, SCUM, LENS
from core import SKY, _PASS, _dirproj

F = np.float32


def sky_rgb(env, d, rnd=None, clouds=True):
    """Colour of the sky in unit directions d (n,3)."""
    L = env.L
    t = env.t
    e = np.clip(d[:, 1], 0.0, 1.0)
    r0 = 0.5 if rnd is None else rnd[:, 0]
    r1 = 0.5 if rnd is None else rnd[:, 1]
    col = mix(L['hor'], L['mid'], smooth(0.0, 0.26, e + (r0 - 0.5) * 0.05)[:, None])
    col = mix(col, L['zen'], smooth(0.18, 0.92, e + (r1 - 0.5) * 0.10)[:, None])
    S = env.sun
    ca = d @ S
    glow = L['glow_wide'] * np.exp(-(1 - ca) / 0.22) + L['glow_tight'] * np.exp(-(1 - ca) / 0.018)
    col = col + glow[:, None] * L['glow'][None, :]
    if clouds and L['cover'] > 0.01:
        k = L['cloud_scale']
        den = e + 0.16
        qx = d[:, 0] / den * 0.30 * k + t * 0.004
        qz = d[:, 2] / den * 0.30 * k + t * 0.002
        n = 0.78 * snoise(qx, qz, 0) + 0.22 * snoise(qx * 2.3 + 1.7, qz * 2.3, 1)
        n = n + (r0 - 0.5) * 0.045
        th = 1.0 - L['cover']
        dens = smooth(th - 0.05, th + 0.09, n) * smooth(-0.02, 0.10, d[:, 1])
        # light side / shadow side: compare with the density a step toward the sun
        sx, sz = S[0], S[2]
        n2 = 0.78 * snoise(qx + 0.16 * sx, qz + 0.16 * sz, 0) + 0.22 * snoise((qx + 0.16 * sx) * 2.3 + 1.7, (qz + 0.16 * sz) * 2.3, 1)
        lit = smooth(-0.10, 0.12, n - n2 + (r1 - 0.5) * 0.10 + 0.25 * (th + 0.2 - n))
        cc = mix(L['cloud_sh'], L['cloud_lit'], lit[:, None])
        cc = cc + (glow * 0.6)[:, None] * L['glow'][None, :]
        col = mix(col, cc, (dens * L['cloud_op'])[:, None])
    return col


class Sky:
    def __init__(self, rng):
        specs = [(0.125, 3.2, 3.4, 0), (0.070, 3.2, 2.8, 1), (0.040, 3.2, 1.5, 2)]     # angular length, aspect, cover, level
        ds, ls, ws, lv = [], [], [], []
        for (al, asp, cover, lvl) in specs:
            band = 2 * np.pi * (1 + 0.10)
            n = int(band / (al * al / asp) * cover)
            # an even lattice of directions (golden-angle spiral), lightly jittered: no holes in the sky
            i = np.arange(n)
            y = np.clip(-0.10 + 1.10 * (i + 0.5) / n + rng.normal(0, 0.25 * al / asp, n), -0.12, 1.0)
            a = i * 2.399963 + rng.normal(0, 0.3 * al, n) / np.maximum(np.sqrt(1 - y * y), 0.2)
            r = np.sqrt(1 - y * y)
            ds.append(np.stack([r * np.cos(a), y, r * np.sin(a)], axis=1))
            s = np.clip(np.exp(rng.normal(0, 0.3, n)), 0.6, 1.9)
            ls.append(al * s)
            ws.append(al / asp * (0.8 + 0.4 * rng.random(n)))
            lv.append(np.full(n, lvl))
        self.d = np.concatenate(ds)
        self.L = np.concatenate(ls)
        self.W = np.concatenate(ws)
        self.lvl = np.concatenate(lv)
        n = len(self.d)
        self.rnd = rng.random((n, 6)).astype(F)
        # stroke direction: one slanting hand across the whole sky, projected onto the dome
        D0 = np.array([0.96, 0.22, 0.18])
        D1 = np.array([0.20, 0.25, 0.95])
        use1 = np.abs(self.d @ D0) > 0.8
        D = np.where(use1[:, None], D1, D0) + rng.normal(0, 0.16, (n, 3))
        D = D - (D * self.d).sum(1, keepdims=True) * self.d
        self.D = D / np.linalg.norm(D, axis=1, keepdims=True)
        self.spr = (np.where(self.rnd[:, 2] < 0.3, SCUM, DASH) + rng.integers(0, 4, n)).astype(np.int32)
        # stars
        m = 420
        y = rng.uniform(0.02, 1.0, m)
        a = rng.uniform(0, 2 * np.pi, m)
        r = np.sqrt(1 - y * y)
        self.sd = np.stack([r * np.cos(a), y, r * np.sin(a)], axis=1)
        self.srnd = rng.random((m, 4)).astype(F)

    def emit(self, env):
        f = env.f
        d = self.d
        vf = d @ env.fw
        vr = d @ env.rt
        vu = d @ env.up
        ok = (vf > 0.12)
        sc = f / np.maximum(vf, 0.12)
        x = 960 + vr * sc
        y = 540 - vu * sc
        mg = 160
        ok &= (x > -mg) & (x < 1920 + mg) & (y > -mg) & (y < 1080 + mg)
        i = np.nonzero(ok)[0]
        if len(i) == 0:
            return None
        d, rnd = d[i], self.rnd[i]
        ang, fore = _dirproj(env, vr[i], vu[i], vf[i], self.D[i])
        rgb = sky_rgb(env, d, rnd)
        # broken colour
        rgb = rgb * (1.0 + (rnd[:, 3:4] - 0.5) * 0.07)
        rgb[:, 0] += (rnd[:, 4] - 0.5) * 0.035
        rgb[:, 2] -= (rnd[:, 4] - 0.5) * 0.035
        sway = np.sin(env.t * (0.3 + 0.3 * rnd[:, 5]) + rnd[:, 4] * 6.28)
        out = dict(x=(x[i] + 2.0 * sway).astype(F), y=y[i].astype(F), ang=ang.astype(F), L=(self.L[i] * sc[i]).astype(F),
                   W=(self.W[i] * sc[i]).astype(F), spr=self.spr[i], rgb=rgb.astype(F),
                   a=np.where(self.lvl[i] == 2, 0.85, 0.95).astype(F), hb=(0.5 + 0.5 * rnd[:, 5]).astype(F),
                   key=SKY * _PASS + self.lvl[i] * 1e5 + rnd[:, 2] * 9e4)
        parts = [out]
        L = env.L
        if L['sundisc'] > 0.01:
            S = env.sun
            zf = S @ env.fw
            if zf > 0.15:
                s = f / zf
                sx, sy = 960 + (S @ env.rt) * s, 540 - (S @ env.up) * s
                k = 9
                rr = np.array([0, 0.5, 0.5, 0.5, 0.5, 0.9, 0.9, 0.9, 0.9]) * 0.011 * s
                aa = np.array([0, 0.3, 1.9, 3.5, 5.0, 1.0, 2.6, 4.2, 5.8])
                size = 0.030 * s * np.array([1.0, 0.7, 0.7, 0.7, 0.7, 0.5, 0.5, 0.5, 0.5]) * (0.8 + 0.2 * L['sundisc'])
                col = np.tile(L['sun_col'], (k, 1)) * (1.0 + 0.05 * np.sin(aa * 3.0))[:, None]
                parts.append(dict(x=(sx + rr * np.cos(aa)).astype(F), y=(sy + rr * np.sin(aa)).astype(F), ang=(aa * 0.7).astype(F),
                                  L=size.astype(F), W=(size * 0.8).astype(F), spr=(DAB + np.arange(k) % 4).astype(np.int32),
                                  rgb=col.astype(F), a=np.full(k, 0.95 * min(L['sundisc'], 1.0), F), hb=np.full(k, 0.9, F),
                                  key=np.full(k, SKY * _PASS + 5e5) + np.arange(k)))
        if L['stars'] > 0.01:
            d = self.sd
            vf = d @ env.fw
            ok = vf > 0.15
            sc = f / np.maximum(vf, 0.15)
            x = 960 + (d @ env.rt) * sc
            y = 540 - (d @ env.up) * sc
            ok &= (x > 0) & (x < 1920) & (y > 0) & (y < 1080)
            j = np.nonzero(ok)[0]
            if len(j):
                r = self.srnd[j]
                tw = 0.65 + 0.35 * np.sin(env.t * (1.0 + 2.0 * r[:, 0]) + r[:, 1] * 6.28)
                appear = smooth(r[:, 2] * 0.7, r[:, 2] * 0.7 + 0.3, L['stars'])
                size = (5.0 + 9.0 * r[:, 3] ** 3) * f / 1660.0
                col = mix(np.array([1.0, 0.96, 0.84], F), np.array([0.84, 0.90, 1.0], F), r[:, 0:1])
                parts.append(dict(x=x[j].astype(F), y=y[j].astype(F), ang=(r[:, 1] * 3.0).astype(F), L=size.astype(F),
                                  W=(size * 0.85).astype(F), spr=(DAB + (r[:, 0] * 4).astype(np.int32) % 4),
                                  rgb=col.astype(F), a=(0.9 * tw * appear).astype(F), hb=np.full(len(j), 0.9, F),
                                  key=np.full(len(j), SKY * _PASS + 6e5)))
        return parts
