"""Static plate renderer: primary + direct light (shadows) + one diffuse bounce + reflection + fog,
split into K light groups so that lights can be animated afterwards."""
import numpy as np, time
from .rt import Accel
from .world import MASK_NOSHADOW, MASK_HIDDEN, MASK_THIN, MASK_NOBOUNCE, MASK_NEAR
from . import mats

def _n(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)

class Camera:
    def __init__(self, pos, look, fov=50.0, W=640, H=360, keep_vertical=True):
        self.pos = np.asarray(pos, np.float64); look = np.asarray(look, np.float64)
        f = _n(look - self.pos); self.shift = 0.0
        if keep_vertical:
            self.shift = f[1] / np.hypot(f[0], f[2]); f = _n(np.array([f[0], 0, f[2]]))
        self.f = f; self.r = _n(np.cross(f, [0, 1, 0])); self.u = np.cross(self.r, f)
        self.th = np.tan(np.radians(fov) / 2); self.tv = self.th * H / W
        self.W, self.H = W, H

    def rays(self, S, rng):
        W, H = self.W * S, self.H * S
        jx = rng.random((H, W)); jy = rng.random((H, W))
        x = (np.arange(W)[None, :] + jx) / W; y = (np.arange(H)[:, None] + jy) / H
        sx = (2 * x - 1) * self.th; sy = (1 - 2 * y) * self.tv + self.shift
        d = self.f[None, None] + sx[..., None] * self.r + sy[..., None] * self.u
        d = _n(d).reshape(-1, 3).astype(np.float32)
        o = np.broadcast_to(self.pos.astype(np.float32), d.shape).copy()
        return o, d

    def dirs(self, px, py):
        """ray directions through native pixel coords (float)"""
        sx = (2 * (np.asarray(px) / self.W) - 1) * self.th; sy = (1 - 2 * (np.asarray(py) / self.H)) * self.tv + self.shift
        return _n(self.f + sx[..., None] * self.r + sy[..., None] * self.u)

    def project(self, P):
        """world -> native pixel x,y (float), euclidean distance, forward depth"""
        v = np.asarray(P, np.float64) - self.pos
        z = v @ self.f; zz = np.where(np.abs(z) < 1e-6, 1e-6, z)
        sx = (v @ self.r) / zz; sy = (v @ self.u) / zz
        px = (sx / self.th + 1) * 0.5 * self.W; py = (1 - (sy - self.shift) / self.tv) * 0.5 * self.H
        return px, py, np.linalg.norm(v, axis=-1), z


def surface(world, g, tri, P, D, dist=None):
    """evaluate materials at hits. returns dict of per-hit arrays"""
    F = g['F']; face = g['tf'][tri]
    Ng = F['n'][face]
    flip = np.sign(-(Ng * D).sum(1, keepdims=True)); flip[flip == 0] = 1
    N = Ng * flip
    n = len(face)
    out = dict(N=N, Ng=Ng, face=face, alb=np.zeros((n, 3), np.float32), emis=np.zeros((n, 3), np.float32),
               refl=np.zeros(n, np.float32), rough=np.zeros(n, np.float32), aux=np.zeros(n, np.float32), grp=F['grp'][face], tag=F['tag'][face], P=P)
    mid = F['mat'][face]
    names = {v: k for k, v in world.mats.items()}
    for m in np.unique(mid):
        sel = np.nonzero(mid == m)[0]
        fa = face[sel]
        S = mats.Ctx()
        S.P = P[sel]; S.N = N[sel]; S.Ng = Ng[sel]; S.D = D[sel]
        S.seed = F['seed'][fa]; S.col = F['col'][fa]; S.prm = F['prm'][fa]
        rel = S.P - F['org'][fa]
        S.u = (rel * F['U'][fa]).sum(1); S.v = (rel * F['V'][fa]).sum(1)
        horiz = np.abs(S.Ng[:, 1]) > 0.7
        S.a = np.where(horiz, S.P[:, 0], (S.P * F['U'][fa]).sum(1)); S.b = np.where(horiz, S.P[:, 2], S.P[:, 1])
        S.world = world
        S.lod = (dist[sel] if dist is not None else np.full(len(sel), 60.0, np.float32)) * world.pixang
        r = mats.MATS[names[m]](S)
        if isinstance(r, np.ndarray): r = dict(alb=r)
        for k, v in r.items():
            out[k][sel] = v
    return out


def cos_hemi(N, rng):
    n = len(N)
    u1 = rng.random(n); u2 = rng.random(n)
    r = np.sqrt(u1); ph = 2 * np.pi * u2
    x = r * np.cos(ph); y = r * np.sin(ph); z = np.sqrt(np.maximum(0, 1 - u1))
    ref = np.where(np.abs(N[:, 1:2]) < 0.9, np.array([[0., 1, 0]], np.float32), np.array([[1., 0, 0]], np.float32))
    T = _n(np.cross(ref, N)); B = np.cross(N, T)
    return (x[:, None] * T + y[:, None] * B + z[:, None] * N).astype(np.float32)


def direct(lights, acc, P, N, rng, K, shadows=True):
    n = len(P)
    E = np.zeros((K, n, 3), np.float32)
    Po = P + N * 2e-3
    for L in lights:
        if L['kind'] == 'sun':
            ld = _n(L['dir'][None] + L['soft'] * rng.normal(size=(n, 3))).astype(np.float32)
            cos = np.maximum((N * ld).sum(1), 0)
            act = cos > 0
            tm = np.where(act, 1e5, 0).astype(np.float32)
            w = cos
        else:
            lp = L['pos'][None] + L['radius'] * rng.normal(size=(n, 3)).astype(np.float32)
            v = lp - Po
            d2 = (v * v).sum(1); dist = np.sqrt(d2)
            ld = v / dist[:, None]
            cos = np.maximum((N * ld).sum(1), 0)
            w = cos / (d2 + L['r0'] ** 2)
            if 'axis' in L:
                ca = -(ld * L['axis'][None]).sum(1)
                c0, c1 = L['cone']
                s = np.clip((ca - c0) / max(c1 - c0, 1e-6), 0, 1)
                w = w * s * s * (3 - 2 * s)
            if L['range'] < 1e8:
                s = np.clip(1 - dist / L['range'], 0, 1); w = w * np.minimum(1, s * 3)
            act = w > 1e-5
            tm = np.where(act, dist - 4e-3, 0).astype(np.float32)
        if shadows and act.any():
            ii = np.nonzero(act)[0]
            occ = acc.anyhit(Po[ii], ld[ii], tm[ii], mask=L.get('mask', MASK_NOSHADOW))
            w = w.copy(); w[ii[occ]] = 0
        E[L['grp']] += (w * act)[:, None] * L['color'][None]
    return E


def weathering(sf, acc, rng, dirt=0.5, dirt_r=0.7, streak=0.5):
    """grime that follows the geometry: darkening in creases (short-range occlusion) and drip stains
    on walls below anything that sticks out (sills, air conditioners, balconies, pipes brackets)"""
    from .noise import fbm2
    P = sf['P']; N = sf['N']; n = len(P)
    ok = sf['tag'] != 4
    if dirt > 0:
        d = cos_hemi(N, rng)
        occ = acc.anyhit(P + N * 4e-3, d, dirt_r, mask=MASK_THIN)
        k = (dirt * 0.55) * occ * ok
        sf['alb'] *= (1 - k)[:, None]
    if streak > 0:
        ii = np.nonzero((np.abs(sf['Ng'][:, 1]) < 0.3) & ok)[0]
        if len(ii):
            o = P[ii] + N[ii] * 0.05
            up = np.tile(np.array([[0, 1, 0]], np.float32), (len(ii), 1))
            t, tri = acc.closest(o, up, tmax=2.6, mask=MASK_THIN)
            hit = tri >= 0
            a = P[ii, 0] * 0.83 + P[ii, 2] * 0.55
            pat = 0.35 + 0.65 * fbm2(a * 7.0, P[ii, 1] * 0.35, 131, 3)
            st = np.where(hit, (1 - t / 2.6) ** 0.8, 0) * pat
            sf['alb'][ii] *= (1 - streak * 0.6 * st)[:, None] * (1 - 0.06 * st[:, None] * np.array([0.0, 0.3, 1.0], np.float32)[None])

def fog_T(fog, o, P, t):
    if fog is None: return np.ones(len(t), np.float32)
    sig = fog['sigma']
    if fog.get('h'):
        h = fog['h']; y0 = o[:, 1]; y1 = P[:, 1]; dy = (y1 - y0) / h
        e0 = np.exp(-np.clip(y0 / h, -5, 50)); e1 = np.exp(-np.clip(y1 / h, -5, 50))
        k = np.where(np.abs(dy) > 1e-4, (e0 - e1) / np.where(np.abs(dy) > 1e-4, dy, 1), e0)
        tau = sig * t * k
    else:
        tau = sig * t
    return np.exp(-tau).astype(np.float32)


def render(world, cam, sky, S=6, K=1, fog=None, hook=None, bounce_range=80.0, amb2=0.3, seed=0, emis_clamp=0.35, refl_clamp=30.0, verbose=True, skyamb=1.0, cam_mask=0, acc=None, amb_sky=None, dirt=0.55, dirt_r=0.7, streak=0.55):
    t0 = time.time()
    g = world.finalize()
    if acc is None: acc = Accel(g['v0'], g['v1'], g['v2'], g['tm'])
    rng = np.random.default_rng(seed)
    W, H = cam.W, cam.H
    o, d = cam.rays(S, rng)
    N = len(o)
    t, tri = acc.closest(o, d, mask=MASK_HIDDEN | cam_mask)
    idx = np.nonzero(tri >= 0)[0]; n = len(idx)
    if verbose: print(f'  tris {len(g["v0"])}  primary {time.time() - t0:.1f}s  hits {n / N:.2f}', flush=True)
    D = d[idx]; P = o[idx] + D * t[idx, None]
    world.pixang = 2 * cam.th / cam.W
    sf = surface(world, g, tri[idx], P, D, t[idx])
    weathering(sf, acc, rng, dirt, dirt_r, streak)
    if hook: hook(sf, acc, rng)
    lights = world.lights
    vis_sky = sky
    if amb_sky is not None: sky = amb_sky
    skyavg = sky(_n(np.array([[0.3, 0.8, 0.2], [-0.5, 0.6, -0.3], [0.1, 0.4, 0.9], [0.0, 1.0, 0.0]]))).mean(0) * amb2

    def shade(sf_, P_, bounce):
        Nn = sf_['N']
        E = direct(lights, acc, P_, Nn, rng, K)
        if bounce:
            bd = cos_hemi(Nn, rng)
            t2, tri2 = acc.closest(P_ + Nn * 2e-3, bd, tmax=bounce_range, mask=MASK_NOBOUNCE)
            miss = tri2 < 0
            E[0][miss] += sky(bd[miss]) * skyamb
            h2 = np.nonzero(~miss)[0]
            if len(h2):
                P2 = P_[h2] + Nn[h2] * 2e-3 + bd[h2] * t2[h2, None]
                s2 = surface(world, g, tri2[h2], P2, bd[h2], t2[h2] + 30.0)
                if hook: hook(s2, acc, rng)
                E2 = direct(lights, acc, P2, s2['N'], rng, K)
                E2[0] += skyavg
                R2 = s2['alb'][None] * E2
                em = np.minimum(s2['emis'], emis_clamp)
                for k in range(K):
                    m = s2['grp'] == k
                    if m.any(): R2[k][m] += em[m]
                E[:, h2] += R2
        else:
            E[0] += skyavg
        Lr = sf_['alb'][None] * E
        for k in range(K):
            m = sf_['grp'] == k
            if m.any(): Lr[k][m] += sf_['emis'][m]
        return Lr

    L = shade(sf, P, True)
    if verbose: print(f'  shade {time.time() - t0:.1f}s', flush=True)
    # reflections
    rm = np.nonzero(sf['refl'] > 0.005)[0]
    if len(rm):
        Nn = sf['N'][rm]; Dr = D[rm]
        R = Dr - 2 * (Dr * Nn).sum(1, keepdims=True) * Nn
        R = _n(R + sf['rough'][rm, None] * rng.normal(size=R.shape)).astype(np.float32)
        bad = (R * Nn).sum(1) < 0.01
        R[bad] = _n(R[bad] + 2 * Nn[bad] * (0.02 - (R[bad] * Nn[bad]).sum(1, keepdims=True)))
        tr, trr = acc.closest(P[rm] + Nn * 2e-3, R, tmax=400.0)
        Lr = np.zeros((K, len(rm), 3), np.float32)
        miss = trr < 0
        Lr[0][miss] = vis_sky(R[miss])
        h2 = np.nonzero(~miss)[0]
        if len(h2):
            P2 = P[rm][h2] + R[h2] * tr[h2, None]
            s2 = surface(world, g, trr[h2], P2, R[h2], tr[h2] + t[idx][rm][h2])
            if hook: hook(s2, acc, rng)
            l2 = shade(s2, P2, False)
            T2 = fog_T(fog, P[rm][h2], P2, tr[h2])
            l2 *= T2[None, :, None]
            if fog is not None:
                fc = fog['color'](R[h2]) if callable(fog['color']) else np.asarray(fog['color'], np.float32)[None]
                l2[0] += fc * (1 - T2)[:, None]
            Lr[:, h2] = np.minimum(l2, refl_clamp)
        cosv = np.clip(-(Dr * Nn).sum(1), 0, 1)
        F0 = sf['refl'][rm]
        Fr = (F0 + np.minimum(1.0, F0 * 25.0) * (1 - F0) * (1 - cosv) ** 5)[None, :, None]
        L[:, rm] = L[:, rm] * (1 - Fr) + Fr * Lr
        if verbose: print(f'  refl {time.time() - t0:.1f}s  ({len(rm) / max(n, 1):.2f})', flush=True)
    # fog
    T = fog_T(fog, o[idx], P, t[idx])
    L *= T[None, :, None]
    if fog is not None:
        fc = fog['color'](D) if callable(fog['color']) else np.asarray(fog['color'], np.float32)[None]
        L[0] += fc * (1 - T)[:, None]

    def agg(vals, w=None):
        full = np.zeros((N,) + vals.shape[1:], np.float32); full[idx] = vals
        return full.reshape((H, S, W, S) + vals.shape[1:]).mean((1, 3))
    layers = np.stack([agg(L[k]) for k in range(K)])
    cov = agg(np.ones(n, np.float32))
    covs = np.maximum(cov, 1e-6)
    depth = np.full(N, 1e9, np.float32); depth[idx] = t[idx]
    depth = np.sort(depth.reshape(H, S, W, S).transpose(0, 2, 1, 3).reshape(H, W, S * S), axis=2)
    plate = dict(layers=layers, sky=1 - cov, depth=depth, P=agg(P) / covs[..., None], N=agg(sf['N']) / covs[..., None],
                 alb=agg(sf['alb']) / covs[..., None], T=agg(T) / covs, aux=agg(sf['aux']))
    nearm = (g['tm'][tri[idx]] & MASK_NEAR) > 0
    if nearm.any():
        plate['near'] = np.stack([agg(L[k] * nearm[:, None]) for k in range(K)]); plate['near_a'] = agg(nearm.astype(np.float32))
    for tg in np.unique(sf['tag']):
        if tg > 0: plate[f'tag{tg}'] = agg((sf['tag'] == tg).astype(np.float32))
    vl = [L for L in lights if L.get('vol')]
    if vl:
        steps = 64
        yy, xx = np.mgrid[0:H, 0:W]
        dv = cam.dirs(xx.ravel() + 0.5, yy.ravel() + 0.5).astype(np.float32)
        ov = np.broadcast_to(cam.pos.astype(np.float32), dv.shape)
        tmax = np.minimum(depth[:, :, (S * S) // 2].ravel(), 160.0)
        acc_v = np.zeros((K, H * W, 3), np.float32)
        for j in range(steps):
            tj = (j + rng.random(H * W).astype(np.float32)) / steps * tmax
            Pj = ov + dv * tj[:, None]
            Tj = fog_T(fog, ov, Pj, tj)
            for L in vl:
                v = L['pos'][None] - Pj; d2 = (v * v).sum(1); dist = np.sqrt(d2); ld = v / dist[:, None]
                wgt = 1.0 / (d2 + L['r0'] ** 2)
                if 'axis' in L:
                    ca = -(ld * L['axis'][None]).sum(1); c0, c1 = L['cone']
                    sgm = np.clip((ca - c0) / max(c1 - c0, 1e-6), 0, 1); wgt = wgt * sgm * sgm * (3 - 2 * sgm)
                act = (wgt > 2e-4) & (dist < L['range'])
                ii = np.nonzero(act)[0]
                if len(ii):
                    occ = acc.anyhit(Pj[ii], ld[ii], dist[ii] - 0.05, mask=L.get('mask', MASK_NOSHADOW))
                    wv = wgt[ii] * (~occ) * Tj[ii] * (tmax[ii] / steps) * L['vol']
                    acc_v[L['grp']][ii] += wv[:, None] * L['color'][None]
        from scipy.ndimage import gaussian_filter
        plate['vol'] = gaussian_filter(acc_v.reshape(K, H, W, 3), (0, 1.3, 1.3, 0))
        layers += plate['vol']
    if verbose: print(f'  done {time.time() - t0:.1f}s', flush=True)
    return plate, acc
