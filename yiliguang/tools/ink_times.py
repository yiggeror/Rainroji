"""When each place on the painted handscroll is painted: a map of times, for the page to paint it by.
usage: python3 tools/ink_times.py <dir with in_A.png and in_B.png> <out.png> <out.json>

The scroll is split into what a painter lays first and what after:
  · the washes: the pale, soft tone under everything (the ink's low frequencies, up to a pale grey). They spread from a
    scatter of points like wet ink running into wet paper, along the shapes (fast inside where there is tone, slow across
    bare paper);
  · the lines: everything darker than the wash. The ink runs along them from their ends (the ends of the strokes, found on
    their skeleton) — a stroke is laid from one end to the other, fast along it, its width filled at once — and the
    darkest touches arrive a moment after the line they sit on.
Both arrive behind a front that crosses the scroll from left to right at the pace the eye travels (see PACE), the tall
things a little from the top down; far washes (the pale distant hills) come before anything, out of the dark.
Out: a PNG at 512 pixels per scroll unit over x 0 … 5.6, y 0 … 1 (rows from the top): R, G the lines' time (16 bits),
B the washes' time (8 bits), both in seconds of the painting, mapped from T0 … T1. And a JSON with the brush's way (the
light follows it) and the numbers the page needs to read the PNG."""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage, sparse
from scipy.sparse.csgraph import dijkstra
from skimage.morphology import skeletonize

SRC, OUT_PNG, OUT_JSON = sys.argv[1], sys.argv[2], sys.argv[3]
PX = 512                      # pixels per scroll unit
SL = 5.6                      # the scroll's length
T0, T1 = -3.0, 16.0           # the times stored (seconds of the painting; negative: before the brush sets out)
# the front: where the painting has reached at each time (the eye follows it), (seconds, x)
PACE = [(-1.0, -0.6), (1.2, 0.0), (3.4, 0.95), (5.6, 1.95), (7.8, 2.92), (10.0, 4.05), (12.0, 4.95), (13.0, 5.50)]
rng = np.random.default_rng(11)

def density(path):
    L = np.asarray(Image.open(path).convert('L')).astype(np.float32)
    paper = np.percentile(L, 97)
    d = np.clip((paper - L) / (paper - 22.0), 0, 1)
    return np.clip((d - 0.012) / 0.988, 0, 1)

A = density(SRC + '/in_A.png'); B = density(SRC + '/in_B.png')            # 1024 px per unit, 3 units each
W1 = int(SL * 1024); full = np.zeros((1024, W1), np.float32)
xa = np.arange(W1) / 1024.0
ia = np.clip((xa * 1024).astype(int), 0, A.shape[1] - 1); ib = np.clip(((xa - 2.45) * 1024).astype(int), 0, B.shape[1] - 1)
full[:, xa < 2.50] = A[:, ia[xa < 2.50]]
mb = (xa >= 2.50) & (xa < 5.45); full[:, mb] = B[:, ib[mb]]
fade = np.clip((5.45 - xa) / 0.09, 0, 1); full *= fade[None, :]
# to 512 per unit
H, W = PX, int(SL * PX)
D = full[:H * 2, :W * 2].reshape(H, 2, W, 2).mean(axis=(1, 3))
x = (np.arange(W) + 0.5) / PX; y = 1.0 - (np.arange(H) + 0.5) / PX          # (y up, as on the page)
X, Y = np.meshgrid(x, y)

def t_front(xx):
    """the time the front reaches x"""
    ts, xs = zip(*PACE)
    return np.interp(xx, xs, ts)

# ---- wash and line
Lo = ndimage.gaussian_filter(D, 6.0)
level = np.minimum(Lo * 0.75, 0.22)
Dw = np.minimum(D, level); Dl = np.maximum(D - level, 0.0)

def flood(cost, seeds, seedT, speed):
    """arrival time over the grid: from each seed, starting at its time, at `speed` (units per second) where cost is 1"""
    h, w = cost.shape; n = h * w
    idx = np.arange(n).reshape(h, w)
    rows, cols, wts = [], [], []
    for dy, dx in [(0, 1), (1, 0), (1, 1), (1, -1)]:
        ylo, yhi, xlo, xhi = max(0, -dy), h - max(0, dy), max(0, -dx), w - max(0, dx)
        a = idx[ylo:yhi, xlo:xhi]; b = idx[ylo + dy:yhi + dy, xlo + dx:xhi + dx]
        ca = cost.ravel()[a.ravel()]; cb = cost.ravel()[b.ravel()]
        step = np.hypot(dy, dx) / (PX * (h / H)) / speed
        wgt = 0.5 * (ca + cb) * step
        rows.append(a.ravel()); cols.append(b.ravel()); wts.append(wgt)
        rows.append(b.ravel()); cols.append(a.ravel()); wts.append(wgt)
    # a source before everything, joined to each seed by its start time
    s0 = n; base = seedT.min() - 1.0
    rows.append(np.full(len(seeds), s0)); cols.append(seeds); wts.append(seedT - base)
    G = sparse.csr_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))), shape=(n + 1, n + 1))
    d = dijkstra(G, directed=True, indices=s0)
    return (d[:n] + base).reshape(h, w)

# the washes, on a grid half as fine (they are soft)
h2, w2 = H // 2, W // 2
Lo2 = Lo[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).mean(axis=(1, 3))
X2, Y2 = X[::2, ::2][:h2, :w2], Y[::2, ::2][:h2, :w2]
wet = Lo2 > 0.025
# (the paper takes it unevenly: the blooms are ragged, not the grid's octagons)
cn = ndimage.gaussian_filter(rng.standard_normal((h2, w2)), 3.0); cn /= cn.std()
cn2 = ndimage.gaussian_filter(rng.standard_normal((h2, w2)), 10.0); cn2 /= cn2.std()
cost_w = (np.where(wet, 1.0, 5.0) * np.exp(0.45 * cn + 0.35 * cn2)).astype(np.float32)
# seeds: the darkest point of the wash in each patch of a loose grid (where there is wash)
seeds, seedT = [], []
gx, gy = int(0.22 * PX / 2), int(0.16 * PX / 2)
for j0 in range(0, h2, gy):
    for i0 in range(0, w2, gx):
        blk = Lo2[j0:j0 + gy, i0:i0 + gx]
        if blk.max() < 0.04: continue
        jj, ii = np.unravel_index(np.argmax(blk), blk.shape); j, i = j0 + jj, i0 + ii
        xs, ys = X2[j, i], Y2[j, i]
        far = ys > 0.55 and blk.max() < 0.22                                  # (the pale far hills: out of the dark first)
        t = t_front(xs) - 0.9 + 0.35 * rng.standard_normal() + 0.6 * (1.0 - ys) * (ys < 0.9)
        if far and xs < 1.9: t = min(t, -0.6 + 1.4 * rng.random())          # (the far hills of the first view come out of the dark)
        elif far: t -= 0.5
        seeds.append(j * w2 + i); seedT.append(t)
Tw2 = flood(cost_w, np.array(seeds), np.array(seedT, np.float64), 0.20)
Tw = ndimage.zoom(Tw2, (H / h2, W / w2), order=1)[:H, :W]
# (nothing runs far ahead of the front: a ragged limit, not a line)
rag = ndimage.gaussian_filter(rng.standard_normal((H, W)), 18.0); rag /= rag.std()
ss = lambda a, b, v: np.clip((v - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((v - a) / (b - a), 0, 1))
Tw = np.maximum(Tw, t_front(X + 0.10 * rag) - 1.7 - 0.6 * ss(0.45, 0.70, Y + 0.05 * rag) * ss(1.7, 2.1, X))

# the lines: they run from the ends of the strokes
M = Dl > 0.05
sk = skeletonize(M)
nb = ndimage.convolve(sk.astype(np.uint8), np.ones((3, 3), np.uint8), mode='constant') - 1
ends = sk & (nb == 1)
ey, ex = np.nonzero(ends)
# (and the middles of blobs that have no ends: their darkest points)
lab, nl = ndimage.label(M)
has = np.zeros(nl + 1, bool); has[lab[ey, ex]] = True
mx = ndimage.maximum_position(Dl, lab, index=np.arange(1, nl + 1))
extra = [(p[0], p[1]) for k, p in enumerate(mx, start=1) if not has[k]]
sy = np.concatenate([ey, np.array([p[0] for p in extra], int)]); sx = np.concatenate([ex, np.array([p[1] for p in extra], int)])
xs, ys = X[sy, sx], Y[sy, sx]
# a stroke starts after the wash under it; tall things a little from the top down; a scatter so they don't all go at once
st = np.maximum(t_front(xs) + 0.15 + 0.45 * rng.random(len(xs)) + 0.9 * (1.0 - ys) * (ys > 0.25) * 0.5, Tw[sy, sx] + 0.25)
cost_l = np.where(M, 1.0, 8.0).astype(np.float32)
Tl = flood(cost_l, sy * W + sx, st.astype(np.float64), 0.55)
Tl = np.maximum(Tl, t_front(X + 0.05 * rag) - 0.35)
# the darkest touches come a moment after the line they are on
Tl = Tl + 0.45 * np.clip((D - 0.72) / 0.2, 0, 1)
# ---- the brush's way: the beginnings of the bigger strokes, in the order they are laid, smoothed
order = np.argsort(st)
pts = np.stack([st[order], xs[order], ys[order]], 1)
path, last = [], None
for tt in np.arange(0.5, 13.5, 0.25):
    sel = pts[(pts[:, 0] >= tt) & (pts[:, 0] < tt + 0.5)]
    if len(sel) == 0: continue
    # the stroke nearest the front's own height there: where most is going on
    fx = np.interp(tt, [p[0] for p in PACE], [p[1] for p in PACE])
    cand = sel[np.abs(sel[:, 1] - fx) < 0.45]
    if len(cand) == 0: cand = sel
    c = cand[np.argmin(np.abs(cand[:, 1] - fx) + (0 if last is None else 0.6 * np.hypot(cand[:, 1] - last[0], cand[:, 2] - last[1])))]
    last = (c[1], c[2]); path.append([round(float(tt), 3), round(float(c[1]), 4), round(float(c[2]), 4)])
# ---- out
q = lambda T: np.clip((T - T0) / (T1 - T0), 0, 1)
tl16 = np.round(q(Tl) * 65535).astype(np.uint32)
img = np.stack([(tl16 >> 8).astype(np.uint8), (tl16 & 255).astype(np.uint8), np.round(q(Tw) * 255).astype(np.uint8)], -1)
Image.fromarray(img, 'RGB').save(OUT_PNG, optimize=True)
json.dump({'T0': T0, 'T1': T1, 'SL': SL, 'pace': PACE, 'brush': path}, open(OUT_JSON, 'w'))
print('lines', int(M.sum()), 'ends', len(ey), 'blobs', len(extra), 'Tl range', float(np.percentile(Tl[M], 1)), float(np.percentile(Tl[M], 99)),
      'Tw range', float(np.percentile(Tw[Lo > 0.03], 1)), float(np.percentile(Tw[Lo > 0.03], 99)))
