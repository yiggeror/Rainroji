"""Pack the generated pictures for the new worlds into the page as data URIs.
usage: python3 tools/pack_assets.py <dir with the generated PNGs>
Writes src/assets/conte.js, stop.js, paper.js, summer.js, pond.js, village.js, piying.js, ink.js and sea.js (or only the bundles named after the directory). Each layer is cropped to what it covers (transparent ones), split where
one picture holds several separate things, and stored as JPEG (opaque, grey or colour) or WebP (with transparency)."""
import base64, io, json, os, sys
from PIL import Image
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets')

def crop_alpha(im, pad=8, thr=8):
    a = im.getchannel('A').point(lambda v: 255 if v > thr else 0)
    bb = a.getbbox()
    if not bb: return im, (0, 0)
    x0, y0, x1, y1 = bb
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1)), (x0, y0)

def split_columns(im, n, thr=8, count=1):
    """split a transparent picture into its n separate things, left to right, at the widest empty gaps
    (a column is empty when fewer than `count` of its pixels are more opaque than `thr`)"""
    a = im.getchannel('A')
    if count > 1:
        import numpy as np
        occ = (np.asarray(a) > thr).sum(0)
        cols = [bool(c >= count) for c in occ]
    else:
        cols = [max(a.crop((x, 0, x + 1, im.height)).getextrema()[1], 0) > thr for x in range(im.width)]
    runs, start = [], None
    for x, c in enumerate(cols + [False]):
        if c and start is None: start = x
        if not c and start is not None: runs.append([start, x]); start = None
    while len(runs) > n:                     # merge across the smallest gaps
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps)); runs[i] = [runs[i][0], runs[i + 1][1]]; del runs[i + 1]
    return [crop_alpha(im.crop((x0, 0, x1, im.height)))[0] for x0, x1 in runs]

def split_components(im, n, thr=40, f=4):
    """split a transparent picture into its n largest separate things (connected regions of its alpha, found on a 1/f grid),
    left to right; each comes out cropped, with everything that belongs to the others made transparent"""
    import numpy as np
    from collections import deque
    A = np.asarray(im.getchannel('A'))
    H, W = A.shape[0] // f, A.shape[1] // f
    g = A[:H * f, :W * f].reshape(H, f, W, f).max(axis=(1, 3)) > thr
    lab = np.zeros((H, W), int); k = 0; sizes = {}
    for y0 in range(H):
        for x0 in range(W):
            if not g[y0, x0] or lab[y0, x0]: continue
            k += 1; q = deque([(y0, x0)]); lab[y0, x0] = k; c = 0
            while q:
                y, x = q.popleft(); c += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and g[yy, xx] and not lab[yy, xx]: lab[yy, xx] = k; q.append((yy, xx))
            sizes[k] = c
    keep = sorted(sorted(sizes, key=lambda i: -sizes[i])[:n], key=lambda i: np.where(lab == i)[1].mean())
    out = []
    for i in keep:
        m = np.repeat(np.repeat(lab == i, f, 0), f, 1)
        full = np.zeros(A.shape, bool); full[:H * f, :W * f] = m
        px = np.array(im.convert('RGBA')); px[..., 3] = np.where(full, px[..., 3], 0)
        out.append(crop_alpha(Image.fromarray(px, 'RGBA'))[0])
    return out

def uri(im, kind, q):
    b = io.BytesIO()
    if kind == 'jpeg': im.convert('L' if im.mode in ('L', 'LA') else 'RGB').save(b, 'JPEG', quality=q, optimize=True, progressive=True)
    else: im.save(b, 'WEBP', quality=q, method=6)
    return f'data:image/{kind};base64,' + base64.b64encode(b.getvalue()).decode()

def scale(im, h=None, w=None):
    if h and im.height > h: return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    if w and im.width > w: return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    return im

def write(name, items):
    lines = ["/* 生成的图层（见 assets/prompts/），已裁切、压缩，作为 data URI 放进页面。 */", "(() => { const A = (window.YL.ASSET_DATA = window.YL.ASSET_DATA || {});"]
    meta = {}
    total = 0
    for key, (u, size) in items.items():
        lines.append(f"A[{json.dumps(key)}] = {json.dumps(u)};"); meta[key] = size; total += len(u)
    lines.append(f"(window.YL.ASSET_SIZE = window.YL.ASSET_SIZE || {{}}); Object.assign(window.YL.ASSET_SIZE, {json.dumps(meta)});")
    lines.append("})();")
    open(os.path.join(OUT, name + '.js'), 'w').write('\n'.join(lines) + '\n')
    print(name, f'{total / 1e6:.2f} MB', {k: v for k, v in meta.items()})

L = lambda n: Image.open(os.path.join(SRC, n + '.png'))
ONLY = sys.argv[2:]                         # (optionally just these bundles: conte stop paper summer pond village piying ink sea)
want = lambda name: not ONLY or name in ONLY
# ---- conté: the drawing is grey; the transparent layers keep their alpha
if want('conte'):
    items = {}
    pano = L('ct_pano').convert('L'); items['conte_pano'] = (uri(pano, 'jpeg', 88), pano.size)
    paper = L('ct_paper').convert('L'); items['conte_paper'] = (uri(paper, 'jpeg', 90), paper.size)
    for n in ['ct_lamp', 'ct_umb', 'ct_tree']:
        im, _ = crop_alpha(L(n).convert('RGBA')); im = scale(im, h=1100)
        items['conte_' + n[3:]] = (uri(im, 'webp', 88), im.size)
    for i, im in enumerate(split_columns(L('ct_river_figs').convert('RGBA'), 3)):
        im = scale(im, h=900); items['conte_' + ['woman', 'man', 'dog'][i]] = (uri(im, 'webp', 88), im.size)
    write('conte', items)
# ---- stop-motion: colour, the cut-outs keep their alpha
if want('stop'):
    items = {}
    sky = L('sm_sky').convert('RGB'); items['stop_sky'] = (uri(sky, 'jpeg', 86), sky.size)
    for n in ['sm_moon', 'sm_boat']:
        im, _ = crop_alpha(L(n).convert('RGBA')); im = scale(im, h=1100)
        items['stop_' + n[3:]] = (uri(im, 'webp', 86), im.size)
    for i, im in enumerate(split_columns(L('sm_clouds').convert('RGBA'), 3)):
        im = scale(im, h=900); items[f'stop_cloud{i}'] = (uri(im, 'webp', 86), im.size)
    for n in ['sm_wave_back', 'sm_wave_mid', 'sm_wave_front']:
        im = L(n).convert('RGBA'); a = im.getchannel('A').point(lambda v: 255 if v > 8 else 0); bb = a.getbbox()
        im = im.crop((0, max(0, bb[1] - 8), im.width, im.height)); im = scale(im, w=2560)
        items['stop_' + n[3:]] = (uri(im, 'webp', 84), im.size)
    write('stop', items)
# ---- papers and a canvas for the older worlds (watercolour paper for the sea, washi for the print, xuan for the ink,
# linen for the Kandinsky): the middle of each scan, grey, 1024 square; the shaders tile it (mirrored) and take its relief
if want('paper'):
    items = {}
    for n, key in [('tx_watercolor', 'paper_watercolor'), ('tx_washi', 'paper_washi'), ('tx_xuan', 'paper_xuan'), ('tx_canvas', 'paper_canvas')]:
        im = L(n).convert('L'); c = im.width // 2
        im = im.crop((c - 768, c - 768, c + 768, c + 768)).resize((1024, 1024), Image.LANCZOS)
        items[key] = (uri(im, 'jpeg', 90), im.size)
    write('paper', items)
# ---- the summer sky (opaque, painted) and its far land (transparent strip); the pond's painted study
if want('summer'):
    items = {}
    sky = L('su_sky').convert('RGB'); items['summer_sky'] = (uri(sky, 'jpeg', 88), sky.size)
    if os.path.exists(os.path.join(SRC, 'su_land.png')):
        land = L('su_land').convert('RGBA')
        a = land.getchannel('A').point(lambda v: 255 if v > 8 else 0); bb = a.getbbox()
        land = land.crop((0, max(0, bb[1] - 8), land.width, land.height))      # keep the full width (it is mapped by azimuth)
        items['summer_land'] = (uri(land, 'webp', 88), land.size)
    write('summer', items)
if want('pond'):
    items = {}
    st = L('po_base').convert('RGB').resize((1344, 614), Image.LANCZOS); items['pond_study'] = (uri(st, 'jpeg', 88), st.size)
    write('pond', items)
# ---- the snowy night's sky and ranges, printed (shin-hanga): opaque
if want('village'):
    items = {}
    vs = L('vl_sky').convert('RGB'); items['village_sky'] = (uri(vs, 'jpeg', 88), vs.size)
    write('village', items)
# ---- carved and dyed hide for the lantern's shadow play: scenery pieces and the dragon's three segments (with alpha)
if want('piying'):
    items = {}
    for i, im in enumerate(split_components(L('sh_set').convert('RGBA'), 5)):
        im = scale(im, h=640); items['pi_' + ['pagoda', 'willow', 'pine', 'boat', 'lotus'][i]] = (uri(im, 'webp', 88), im.size)
    for i, im in enumerate(split_components(L('sh_dragon').convert('RGBA'), 3)):
        im = scale(im, h=640); items['pi_' + ['dhead', 'dbody', 'dtail'][i]] = (uri(im, 'webp', 88), im.size)
    for n in ['wall', 'bridge', 'clouds', 'mountains']:
        im, _ = crop_alpha(L('sh_' + n).convert('RGBA')); im = scale(im, w=1280)
        items['pi_' + n] = (uri(im, 'webp', 88), im.size)
    write('piying', items)
# ---- the ink handscroll, in two halves (painted over the scroll's own layout, so everything that moves on it still
# stands where it should): kept as how much ink lies on the paper (0 bare paper … 1 the blackest), grey
def ink_density(im):
    import numpy as np
    Lm = np.asarray(im.convert('L')).astype(np.float32)
    paper = np.percentile(Lm, 97)                                             # (the paper is flat and takes most of it)
    d = np.clip((paper - Lm) / (paper - 22.0), 0, 1)
    d = np.clip((d - 0.012) / 0.988, 0, 1)                                    # (the paper's own grain is not ink)
    return Image.fromarray((d * 255 + 0.5).astype('uint8'), 'L')
if want('ink'):
    items = {}
    for n, key in [('in_A', 'ink_a'), ('in_B', 'ink_b')]:
        im = ink_density(L(n)); items[key] = (uri(im, 'jpeg', 92), im.size)
    write('ink', items)
# ---- the sea's water, painted in watercolour from just under the surface down into the deep (opaque, tall)
if want('sea'):
    items = {}
    sw = L('se_water').convert('RGB'); items['sea_water'] = (uri(sw, 'jpeg', 88), sw.size)
    se = L('se_eye').convert('RGB'); items['sea_eye'] = (uri(se, 'jpeg', 90), se.size)       # (the whale's eye, close)
    # the whole whale (transparent): rows 200 … 760 of it; the paint's colour bled out past its edge, so the edge
    # doesn't filter to a dark fringe
    import numpy as np
    from PIL import ImageFilter
    wh = L('se_whale').convert('RGBA').crop((0, 200, 3072, 760)); A = np.asarray(wh).astype(np.float32); a = A[..., 3:] / 255.0
    pm = Image.fromarray(np.clip(A[..., :3] * a, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(6))
    am = Image.fromarray((a[..., 0] * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(6))
    fill = np.asarray(pm).astype(np.float32) / np.maximum(np.asarray(am).astype(np.float32)[..., None] / 255.0, 1e-3)
    rgb = np.where(a > 0.5, A[..., :3], np.clip(fill, 0, 255))
    wh = Image.fromarray(np.concatenate([rgb, A[..., 3:]], -1).astype('uint8'), 'RGBA'); items['sea_whale'] = (uri(wh, 'webp', 88), wh.size)
    write('sea', items)
