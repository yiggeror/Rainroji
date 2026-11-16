"""Linear float image -> graded sRGB -> palette-limited, dithered pixel art."""
import numpy as np

def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055)

def srgb2lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

_M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]])
_M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]])

def oklab(srgb):
    lin = srgb2lin(np.clip(srgb, 0, 1))
    lms = np.cbrt(lin @ _M1.T)
    return (lms @ _M2.T).astype(np.float32)

def oklab_inv(lab):
    lms = (lab.astype(np.float64) @ np.linalg.inv(_M2).T) ** 3
    return lin2srgb(lms @ np.linalg.inv(_M1).T)

def tonemap(lin, exposure=1.0, contrast=1.0, sat=1.0, lift=(0, 0, 0), gain=(1, 1, 1), gamma=1.0, shoulder=1.0, tint_sh=None, tint_hi=None):
    """filmic-ish: exposure -> shoulder -> sRGB -> contrast about mid grey -> saturation -> lift/gain"""
    x = np.maximum(lin, 0) * exposure
    x = (1 - np.exp(-x * shoulder)) / shoulder if shoulder > 0 else x
    c = lin2srgb(x)
    if gamma != 1.0: c = c ** gamma
    if contrast != 1.0:
        c = np.clip((c - 0.5) * contrast + 0.5, 0, 1) if contrast < 1 else np.clip(0.5 + (c - 0.5) * contrast, 0, 1)
    lum = (c * np.array([0.299, 0.587, 0.114])).sum(-1, keepdims=True)
    if sat != 1.0: c = np.clip(lum + (c - lum) * sat, 0, 1)
    if tint_sh is not None: c = c + (1 - lum) ** 2 * np.asarray(tint_sh)
    if tint_hi is not None: c = c + lum ** 2 * np.asarray(tint_hi)
    c = np.asarray(lift) + c * (np.asarray(gain) - np.asarray(lift))
    return np.clip(c, 0, 1).astype(np.float32)

LABW = np.array([1.0, 1.6, 1.6], np.float32)

def fit_palette(imgs, k=48, iters=30, seed=0, chroma_w=6.0, extra=None, nsamp=80000):
    """k-means in OKLab. imgs: list of sRGB float images. extra: list of sRGB colours forced into the palette."""
    rng = np.random.default_rng(seed)
    px = np.concatenate([np.asarray(i).reshape(-1, 3) for i in imgs])
    if len(px) > nsamp: px = px[rng.choice(len(px), nsamp, replace=False)]
    lab = oklab(px) * LABW
    w = 1 + chroma_w * np.hypot(lab[:, 1], lab[:, 2])
    # k-means++ init
    cen = [lab[rng.integers(len(lab))]]
    d = ((lab - cen[0]) ** 2).sum(1)
    for _ in range(k - 1):
        p = d * w; cen.append(lab[rng.choice(len(lab), p=p / p.sum())])
        d = np.minimum(d, ((lab - cen[-1]) ** 2).sum(1))
    cen = np.array(cen)
    for _ in range(iters):
        a = ((lab[:, None] - cen[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            m = a == j
            if m.any(): cen[j] = (lab[m] * w[m, None]).sum(0) / w[m].sum()
            else: cen[j] = lab[rng.integers(len(lab))]
    cen = cen / LABW
    if extra is not None and len(extra):
        cen = np.concatenate([cen, oklab(np.asarray(extra, np.float32))])
    order = np.argsort(cen[:, 0])
    cen = cen[order]
    rgb = np.clip(np.round(oklab_inv(cen) * 255), 0, 255).astype(np.uint8)
    return dict(lab=oklab(rgb / 255.0), rgb=rgb)

def bayer(n=8):
    m = np.array([[0]])
    while m.shape[0] < n:
        m = np.block([[4 * m, 4 * m + 2], [4 * m + 3, 4 * m + 1]])
    return (m + 0.5) / (n * n)

def bluenoise(H, W, seed=0):
    """cheap blue-ish noise threshold map in (0,1): white noise minus its blur, rank-normalised"""
    rng = np.random.default_rng(seed)
    x = rng.random((H, W))
    for _ in range(3):
        b = x.copy()
        for ax in (0, 1):
            b = (np.roll(b, 1, ax) + np.roll(b, -1, ax) + 2 * b) / 4
        x = x - 0.9 * b
        r = np.argsort(np.argsort(x.ravel())).reshape(H, W)
        x = (r + 0.5) / (H * W)
    return x.astype(np.float32)

def threshold_map(H, W, kind='mix', seed=0):
    by = np.tile(bayer(4), (H // 4 + 1, W // 4 + 1))[:H, :W]
    if kind == 'bayer': return by.astype(np.float32)
    bn = bluenoise(H, W, seed)
    if kind == 'blue': return bn
    return (0.5 * by + 0.5 * bn).astype(np.float32)

def quantize(img, pal, thr, strength=1.0):
    """img sRGB float [H,W,3] -> uint8 [H,W,3] using only palette colours; ordered 2-colour dither"""
    lab = oklab(img) * LABW
    pl = pal['lab'] * LABW
    d = ((lab[:, :, None, :] - pl[None, None]) ** 2).sum(-1)
    i1 = d.argmin(-1)
    d[np.arange(d.shape[0])[:, None], np.arange(d.shape[1])[None], i1] = 1e9
    i2 = d.argmin(-1)
    c1 = pl[i1]; v = pl[i2] - c1
    t = ((lab - c1) * v).sum(-1) / np.maximum((v * v).sum(-1), 1e-9)
    pick = np.clip(t, 0, 1) * strength > thr
    return pal['rgb'][np.where(pick, i2, i1)]

def upscale(img, s):
    return np.repeat(np.repeat(img, s, 0), s, 1)
