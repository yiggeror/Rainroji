"""Per-frame effects at native resolution. Everything is a periodic function of the loop phase ph in [0,1)."""
import numpy as np
from scipy.ndimage import gaussian_filter
SC = 640 / 480.0     # effects were tuned at 480 px wide; pixel-space sizes are multiplied by this
from .noise import fbm2, fbm3, hash2

def hashf(i, seed=0):
    x = (np.asarray(i, np.int64) * 2654435761 + seed * 40503) & 0xFFFFFFFF
    x = ((x ^ (x >> 15)) * 0x2C1B3C6D) & 0xFFFFFFFF; x = ((x ^ (x >> 12)) * 0x297A2D39) & 0xFFFFFFFF; x ^= x >> 15
    return x / 4294967296.0

def loopnoise(ph, n=4, seed=0):
    """smooth periodic 1-D noise in 0..1 with n knots per loop"""
    x = (ph % 1.0) * n; i = int(np.floor(x)); f = x - i; f = f * f * (3 - 2 * f)
    return hashf(i % n, seed) * (1 - f) + hashf((i + 1) % n, seed) * f

def stepnoise(ph, n=24, seed=0):
    return hashf(int(np.floor((ph % 1.0) * n)) % n, seed)

def pulse(ph, t0, t1, edge=0.01):
    """1 inside [t0,t1] (phase), smooth edges; wraps"""
    d = (ph - t0) % 1.0; L = (t1 - t0) % 1.0
    return float(np.clip(d / edge, 0, 1) * np.clip((L - d) / edge, 0, 1))

def bloom(lin, thresh=1.0, sig=(1.2, 4.0), gain=(0.25, 0.18)):
    b = np.maximum(lin - thresh, 0)
    out = lin
    for s, g in zip(sig, gain):
        out = out + g * gaussian_filter(b, (s * SC, s * SC, 0))
    return out

def glow(lin, x, y, color, r0=2.0, power=1.5):
    """additive radial halo centred on native pixel (x,y)"""
    H, W = lin.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    r2 = (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2
    r0 = r0 * SC
    lin += (1.0 / (1.0 + r2 / (r0 * r0)) ** power)[..., None] * np.asarray(color, np.float32)

class Particles:
    """looping weather particles in the camera frustum (snow, rain, leaves, dust)."""
    def __init__(self, cam, plate, n=6000, T=8.0, seed=0, near=3.0, far=110.0, vel=(0.3, -1.1, 0.1), vjit=0.35, sway=0.18,
                 size=0.02, dpow=1.0, loops=1, margin=1.15, ymax=None):
        rng = np.random.default_rng(seed)
        self.cam, self.plate, self.T, self.n = cam, plate, T, n
        u = rng.random(n)
        z = (near ** (dpow + 1) + u * (far ** (dpow + 1) - near ** (dpow + 1))) ** (1 / (dpow + 1))
        sx = (rng.random(n) * 2 - 1) * cam.th * margin; sy = (rng.random(n) * 2 - 1) * cam.tv * margin * 1.3 + cam.shift
        self.base = cam.pos[None] + cam.f[None] * z[:, None] + cam.r[None] * (sx * z)[:, None] + cam.u[None] * (sy * z)[:, None]
        v = np.asarray(vel, np.float64)
        self.vel = v[None] * (1 + vjit * rng.normal(size=(n, 1))) + rng.normal(0, 0.08, (n, 3)) * np.abs(v).max()
        self.phase = rng.random(n); self.loops = loops
        self.sw_a = sway * rng.uniform(0.3, 1.0, n); self.sw_f = rng.integers(1, 4, n); self.sw_p = rng.random(n) * 6.28
        self.size = size * rng.uniform(0.7, 1.4, n); self.rnd = rng.random(n); self.tint = None
        self.life = T / loops

    def positions(self, ph):
        tau = ((ph * self.loops + self.phase) % 1.0)
        t = (tau - 0.5) * self.life
        P = self.base + self.vel * t[:, None]
        sw = self.sw_a * np.sin(2 * np.pi * self.sw_f * tau + self.sw_p)
        P[:, 0] += sw; P[:, 2] += 0.6 * sw
        fade = np.clip(np.minimum(tau, 1 - tau) / 0.1, 0, 1)
        return P, fade

    def draw(self, lin, ph, amb, lights=(), alpha=1.0, streak=0.0, max_alpha=0.95, floor_y=0.02, additive=False):
        """amb: rgb radiance of a particle under ambient light. lights: [(pos, color*gain, r0, axis, cone)]"""
        cam = self.cam; H, W = lin.shape[:2]
        P, fade = self.positions(ph)
        px, py, dist, zf = cam.project(P)
        ok = (zf > 0.5) & (px >= 0) & (px < W) & (py >= 0) & (py < H) & (P[:, 1] > floor_y) & (fade > 0)
        ii = np.nonzero(ok)[0]
        if not len(ii): return
        P = P[ii]; x = px[ii].astype(np.int32); y = py[ii].astype(np.int32); d = dist[ii]
        occ = (self.plate['depth'][y, x, :] > d[:, None]).mean(1)
        f = 0.5 * W / cam.th
        spx = self.size[ii] * f / d                      # diameter in native px
        a = np.clip(spx, 0, 1.6) ** 1.2 * fade[ii] * occ * alpha
        col = np.broadcast_to(np.asarray(amb, np.float32), (len(ii), 3)).copy()
        if self.tint is not None: col *= self.tint[ii]
        for (lp, lc, r0, axis, cone) in lights:
            v = lp[None] - P; d2 = (v * v).sum(1)
            wgt = 1.0 / (d2 + r0 * r0)
            if axis is not None:
                ca = -(v / np.sqrt(d2)[:, None] * axis[None]).sum(1)
                s = np.clip((ca - cone[0]) / max(cone[1] - cone[0], 1e-6), 0, 1); wgt = wgt * s * s * (3 - 2 * s)
            col += wgt[:, None] * np.asarray(lc, np.float32)[None]
        A = np.zeros((H, W), np.float32); C = np.zeros((H, W, 3), np.float32)
        def splat(xx, yy, aa, cc):
            m = (xx >= 0) & (xx < W) & (yy >= 0) & (yy < H)
            np.add.at(A, (yy[m], xx[m]), aa[m]); np.add.at(C, (yy[m], xx[m]), cc[m] * aa[m, None])
        splat(x, y, np.minimum(a, 1.0), col)
        big = spx > 1.5
        if big.any():
            for dx, dy in ((1, 0), (0, 1), (1, 1)):
                splat(x[big] + dx, y[big] + dy, np.minimum(a[big], 1.0) * np.clip(spx[big] - 1.2, 0, 1), col[big])
        if streak > 0:                                   # motion streak along screen velocity (rain)
            P2 = P - self.vel[ii] * streak
            px2, py2, _, _ = cam.project(P2)
            L = np.maximum(np.abs(px2 - px[ii]), np.abs(py2 - py[ii]))
            nmax = int(min(40, np.ceil(L.max()))) if len(L) else 0
            for k in range(1, nmax + 1):
                m = L >= k
                if not m.any(): break
                t_ = k / np.maximum(L[m], 1)
                xs = (px[ii][m] + (px2[m] - px[ii][m]) * t_).astype(np.int32); ys = (py[ii][m] + (py2[m] - py[ii][m]) * t_).astype(np.int32)
                okk = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H)
                aa = np.minimum(a[m], 1.0) * (1 - 0.6 * t_)
                dd = d[m]
                oc = np.zeros(len(xs), np.float32)
                oc[okk] = (self.plate['depth'][ys[okk], xs[okk], :] > dd[okk, None]).mean(1)
                splat(xs, ys, aa * oc, col[m])
        Ac = np.minimum(A, max_alpha)
        Cn = C / np.maximum(A, 1e-6)[..., None]
        if additive: lin += Cn * Ac[..., None]
        else: lin[:] = lin * (1 - Ac[..., None]) + Cn * Ac[..., None]

def custom_particles(cam, plate, base, vel, T, loops, size, seed=0, phase=None):
    p = Particles(cam, plate, n=len(base), T=T, seed=seed, loops=loops, size=size, sway=0.0)
    p.base = np.asarray(base, np.float64); p.vel = np.broadcast_to(np.asarray(vel, np.float64), p.base.shape).copy()
    if phase is not None: p.phase = np.asarray(phase)
    return p

class Ripples:
    """expanding rings on wet ground: sites picked where mask>thr; perspective-correct via the plate's world positions"""
    def __init__(self, plate, mask, n=40, T=8.0, loops=6, seed=0, rmax=0.3, sites=None, thr=0.35):
        rng = np.random.default_rng(seed)
        self.P = plate['P']; H, W = mask.shape
        if sites is None:
            ys, xs = np.nonzero(mask > thr)
            k = rng.choice(len(ys), min(n, len(ys)), replace=False)
            self.sy, self.sx = ys[k], xs[k]
        else:
            self.sy, self.sx = np.asarray(sites)[:, 1], np.asarray(sites)[:, 0]
        self.c = self.P[self.sy, self.sx]
        self.phase = rng.random(len(self.sy)); self.loops = loops; self.rmax = rmax; self.mask = mask
    def draw(self, lin, ph, gain=0.7, win=10):
        H, W = lin.shape[:2]; win = int(win * SC) + 1
        for i in range(len(self.sy)):
            tau = (ph * self.loops + self.phase[i]) % 1.0
            y0, y1 = max(0, self.sy[i] - 3), min(H, self.sy[i] + 4); x0, x1 = max(0, self.sx[i] - win), min(W, self.sx[i] + win + 1)
            d = np.linalg.norm(self.P[y0:y1, x0:x1][..., [0, 2]] - self.c[i][[0, 2]], axis=-1)
            r = 0.03 + self.rmax * tau
            ring = np.exp(-((d - r) / 0.035) ** 2) * (1 - tau) ** 1.2
            inner = np.exp(-((d - r * 0.6) / 0.05) ** 2) * (1 - tau) ** 1.2
            m = np.clip(self.mask[y0:y1, x0:x1] * 1.5, 0, 1)
            lin[y0:y1, x0:x1] *= (1 + m * (gain * ring - 0.45 * gain * inner))[..., None]

class Smoke:
    """looping puffs rising from a point: each puff lives T/loops seconds"""
    def __init__(self, cam, plate, pos, n=10, T=8.0, loops=1, rise=1.2, wind=(0.8, 0, 0.2), r0=0.25, grow=0.5, seed=0, alpha=0.5):
        rng = np.random.default_rng(seed)
        self.cam, self.plate, self.pos = cam, plate, np.asarray(pos, np.float64)
        self.n, self.T, self.loops, self.rise, self.wind = n, T, loops, rise, np.asarray(wind, np.float64)
        self.phase = (np.arange(n) + rng.random(n) * 0.5) / n
        self.jit = rng.normal(0, 1, (n, 3)); self.r0, self.grow, self.alpha = r0, grow, alpha

    def draw(self, lin, ph, color):
        cam = self.cam; H, W = lin.shape[:2]
        tau = (ph * self.loops + self.phase) % 1.0
        t = tau * self.T / self.loops
        P = self.pos[None] + np.array([0, 1, 0])[None] * (self.rise * t)[:, None] + self.wind[None] * (t ** 1.3)[:, None] + self.jit * (0.12 * t)[:, None]
        r = self.r0 + self.grow * t
        px, py, dist, zf = cam.project(P)
        f = 0.5 * W / cam.th
        a = self.alpha * np.clip(tau / 0.08, 0, 1) * (1 - tau) ** 1.5
        yy, xx = np.mgrid[0:H, 0:W]
        A = np.zeros((H, W), np.float32)
        for i in range(self.n):
            if zf[i] <= 0.5: continue
            rp = r[i] * f / dist[i]
            if px[i] < -3 * rp or px[i] > W + 3 * rp or py[i] < -3 * rp or py[i] > H + 3 * rp: continue
            x0, x1 = int(max(0, px[i] - 3 * rp)), int(min(W, px[i] + 3 * rp + 1)); y0, y1 = int(max(0, py[i] - 3 * rp)), int(min(H, py[i] + 3 * rp + 1))
            if x1 <= x0 or y1 <= y0: continue
            g = np.exp(-((xx[y0:y1, x0:x1] + 0.5 - px[i]) ** 2 + (yy[y0:y1, x0:x1] + 0.5 - py[i]) ** 2) / (2 * max(rp, 0.35) ** 2))
            occ = (self.plate['depth'][y0:y1, x0:x1, :] > dist[i]).mean(2)
            A[y0:y1, x0:x1] = 1 - (1 - A[y0:y1, x0:x1]) * (1 - np.clip(a[i] * min(1.0, rp * rp / 0.25 + 0.2) * g * occ, 0, 1))
        lin[:] = lin * (1 - A[..., None]) + np.asarray(color, np.float32) * A[..., None]

def native_sky(sc, cam, H, W):
    yy, xx = np.mgrid[0:H, 0:W]
    return sc.sky(cam.dirs(xx.ravel() + 0.5, yy.ravel() + 0.5).astype(np.float32)).reshape(H, W, 3)

def denoise(plate, r=2, sl=0.10, sd=0.05, sa=0.10, sg=1.3):
    """joint bilateral over the light layers (guides: log luminance of the sum, log depth, albedo) -
    removes Monte-Carlo grain inside flat areas, keeps every visible edge"""
    L = plate['layers']
    lum = np.log(L.sum(0).mean(-1) + 0.01)
    S2 = plate['depth'].shape[2]
    dep = np.log(np.minimum(plate['depth'][:, :, S2 // 2], 1e4) + 1.0)
    alb = plate['alb']; sky = plate['sky']
    acc = np.zeros_like(L); ws = np.zeros(L.shape[1:3], np.float32)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            sh = lambda a: np.roll(np.roll(a, dy, 0), dx, 1)
            w = np.exp(-(dx * dx + dy * dy) / (2 * sg * sg)) * np.exp(-np.abs(sh(lum) - lum) / sl) * np.exp(-np.abs(sh(dep) - dep) / sd) \
                * np.exp(-np.abs(sh(alb) - alb).sum(-1) / sa) * np.exp(-np.abs(sh(sky) - sky) / 0.05)
            acc += sh(L.reshape(-1, *L.shape[1:]).transpose(1, 2, 0, 3)).transpose(2, 0, 1, 3) * w[None, ..., None]
            ws += w
    plate['layers'] = acc / ws[None, ..., None]
    return plate

def sway(lin, mask, ph, seed=0, k=2, scale=0.06, thr=0.25):
    """foliage shimmer: pixels inside mask borrow their neighbour's colour, driven by a looping phase field"""
    H, W = mask.shape
    yy, xx = np.mgrid[0:H, 0:W]
    phase = fbm2(xx * scale, yy * scale, 40 + seed, 3) * 6.0 + hash2(xx, yy, 41 + seed) * 0.6
    n = np.sin(2 * np.pi * (ph * k + phase))
    m = mask > thr
    out = lin.copy()
    a = m & (n > 0.55); b = m & (n < -0.55)
    out[a] = np.roll(lin, 1, 1)[a]; out[b] = np.roll(lin, -1, 1)[b]
    return out

def cloth(lin, cam, depth, anchor, ph, w=1.9, h=1.25, wind=(1, 0, 0.2), col=(0.75, 0.07, 0.05), amb=1.0, limp=0.5, nx=10, k=2, sun=None):
    """a flag hanging from `anchor` (top of the hoist), drawn as shaded quads; periodic in ph"""
    from PIL import Image, ImageDraw
    H, W = lin.shape[:2]; SS = 4
    wd = _nrm(np.asarray(wind, np.float64)); up = np.array([0, 1.0, 0]); side = np.cross(wd, up)
    u = np.linspace(0, 1, nx + 1)
    wave = np.sin(2 * np.pi * (u * 1.3 - ph * k)) * 0.16 * u + np.sin(2 * np.pi * (u * 2.1 - ph * k * 2) + 1.0) * 0.05 * u
    droop = limp * u ** 1.5 * h * 0.9
    top = np.asarray(anchor)[None] + wd[None] * (u * w * (1 - 0.35 * limp))[:, None] + side[None] * wave[:, None] - up[None] * droop[:, None]
    bot = top - up[None] * h + side[None] * (np.sin(2 * np.pi * (u * 1.3 - ph * k) + 0.7) * 0.12 * u)[:, None]
    tp = np.stack(cam.project(top)[:2], 1); bp = np.stack(cam.project(bot)[:2], 1)
    dist = cam.project(top)[2].mean()
    x0, y0 = np.floor(np.minimum(tp, bp).min(0)).astype(int) - 1; x1, y1 = np.ceil(np.maximum(tp, bp).max(0)).astype(int) + 2
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
    if x1 <= x0 or y1 <= y0: return
    ims = [Image.new('F', ((x1 - x0) * SS, (y1 - y0) * SS), 0.0) for _ in range(4)]
    drs = [ImageDraw.Draw(i) for i in ims]
    for i in range(nx):
        nrm = np.cross(top[i + 1] - top[i], bot[i] - top[i]); nrm /= np.linalg.norm(nrm) + 1e-9
        sh = amb * (0.55 + 0.45 * abs(nrm @ side)) if sun is None else amb * (0.45 + 0.75 * abs(nrm @ sun))
        poly = [tuple((p - (x0, y0)) * SS) for p in (tp[i], tp[i + 1], bp[i + 1], bp[i])]
        for c in range(3): drs[c].polygon(poly, fill=float(col[c] * sh))
        drs[3].polygon(poly, fill=1.0)
    arr = [np.asarray(i, np.float32).reshape(y1 - y0, SS, x1 - x0, SS).mean((1, 3)) for i in ims]
    a = arr[3] * (depth[y0:y1, x0:x1, :] > dist).mean(2)
    lin[y0:y1, x0:x1] = lin[y0:y1, x0:x1] * (1 - a[..., None]) + np.stack(arr[:3], -1) * (a / np.maximum(arr[3], 1e-6))[..., None]

def _nrm(v): return v / (np.linalg.norm(v) + 1e-12)

class Flutter:
    """a few butterflies / moths on looping lissajous paths (world space), 1-2 px flickering specks"""
    def __init__(self, cam, plate, centres, T=8.0, seed=0, r=1.2):
        rng = np.random.default_rng(seed)
        self.cam, self.plate = cam, plate; self.c = np.asarray(centres, np.float64); n = len(self.c)
        self.f = rng.integers(1, 3, (n, 3)); self.p = rng.random((n, 3)) * 6.28; self.r = r * rng.uniform(0.6, 1.3, (n, 3)) * np.array([1, 0.4, 1])
        self.fl = rng.integers(22, 34, n)
    def draw(self, lin, ph, col):
        H, W = lin.shape[:2]
        P = self.c + self.r * np.sin(2 * np.pi * self.f * ph + self.p)
        P += 0.25 * np.sin(2 * np.pi * (self.f[:, ::-1] * 5) * ph + self.p[:, ::-1])
        px, py, d, zf = self.cam.project(P)
        for i in range(len(P)):
            x, y = int(px[i]), int(py[i])
            if zf[i] <= 0 or x < 0 or x >= W - 1 or y < 0 or y >= H: continue
            if (self.plate['depth'][y, x, :] > d[i]).mean() < 0.5: continue
            open_ = np.sin(2 * np.pi * self.fl[i] * ph) > 0
            lin[y, x] = col
            if open_: lin[y, x + 1] = col

class Flock:
    """pigeons circling: every bird follows the same closed loop with its own lag and offset"""
    def __init__(self, cam, plate, centre, rx=30.0, rz=18.0, n=22, T=8.0, seed=0, tilt=4.0, laps=1):
        rng = np.random.default_rng(seed)
        self.cam, self.plate, self.c = cam, plate, np.asarray(centre, np.float64)
        self.rx, self.rz, self.tilt, self.laps, self.n = rx, rz, tilt, laps, n
        self.lag = rng.normal(0, 0.035, n); self.off = rng.normal(0, 1.0, (n, 3)) * np.array([3.5, 1.6, 3.5])
        self.flap = rng.integers(28, 40, n); self.fp = rng.random(n)
    def draw(self, lin, ph, dark, light, fog=None, fogcol=None):
        H, W = lin.shape[:2]
        a = 2 * np.pi * (ph * self.laps + self.lag)
        P = self.c[None] + np.stack([self.rx * np.cos(a), self.tilt * np.sin(a + 0.8), self.rz * np.sin(a)], 1) + self.off
        P += np.stack([2.5 * np.sin(2 * a + self.fp * 6), 0.8 * np.sin(3 * a + self.fp * 9), 2.0 * np.cos(2 * a + self.fp * 5)], 1)
        px, py, d, zf = self.cam.project(P)
        f = 0.5 * W / self.cam.th
        for i in range(self.n):
            x, y = int(px[i]), int(py[i])
            if zf[i] <= 1 or x < 3 or x >= W - 3 or y < 2 or y >= H - 2: continue
            if (self.plate['depth'][y, x, :] > d[i]).mean() < 0.5: continue
            bank = 0.5 + 0.5 * np.sin(a[i] + 1.2)
            col = np.asarray(dark) * (1 - bank) + np.asarray(light) * bank
            if fog is not None:
                T_ = np.exp(-fog * d[i]); col = col * T_ + np.asarray(fogcol) * (1 - T_)
            up = np.sin(2 * np.pi * (self.flap[i] * ph + self.fp[i])) > 0
            span = 0.62 * f / d[i]
            lin[y, x] = col
            if span > 0.75:
                dy = -1 if up else 0
                lin[y + dy, x - 1] = col; lin[y + dy, x + 1] = col
            if span > 1.6:
                dy2 = -1 if up else 1
                lin[y + dy2 * (1 if up else 0) + (0 if up else 0), x - 2] = col; lin[y + dy2 * (1 if up else 0), x + 2] = col

def vignette(H, W, amount=0.22, power=2.2):
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.hypot((xx + 0.5) / W - 0.5, ((yy + 0.5) / H - 0.5) * H / W) / 0.5
    return (1 - amount * np.clip(r, 0, 1.3) ** power).astype(np.float32)[..., None]
