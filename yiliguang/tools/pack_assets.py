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

def write(name, items, extra=None):
    lines = ["/* 生成的图层（见 assets/prompts/），已裁切、压缩，作为 data URI 放进页面。 */", "(() => { const A = (window.YL.ASSET_DATA = window.YL.ASSET_DATA || {});"]
    meta = {}
    total = 0
    for key, (u, size) in items.items():
        lines.append(f"A[{json.dumps(key)}] = {json.dumps(u)};"); meta[key] = size; total += len(u)
    lines.append(f"(window.YL.ASSET_SIZE = window.YL.ASSET_SIZE || {{}}); Object.assign(window.YL.ASSET_SIZE, {json.dumps(meta)});")
    if extra: lines.append(extra)
    lines.append("})();")
    open(os.path.join(OUT, name + '.js'), 'w').write('\n'.join(lines) + '\n')
    print(name, f'{total / 1e6:.2f} MB', {k: v for k, v in meta.items()})

L = lambda n: Image.open(os.path.join(SRC, n + '.png'))
ONLY = sys.argv[2:]                         # (optionally just these bundles: conte stop paper summer pond village piying ink sea)
want = lambda name: not ONLY or name in ONLY
# ---- conté: the drawing is grey. Everything that stands or moves in it goes into one atlas: the old single layers, and the
# animated ones, each a row of frames (a walk, a trot, a wing-beat) cut from one generated sheet and lined up on one anchor
# (the feet on one line, the body over one point), so a frame can be swapped for the next without the figure jumping.
def bleed_edge(im, r=6):
    """the colour inside a cut-out carried out under its soft edge (a white fringe painted round it doesn't show as a halo)"""
    import numpy as np
    from PIL import ImageFilter
    A = np.asarray(im.convert('RGBA')).astype(np.float32); a = A[..., 3:] / 255.0
    solid = (a > 0.6).astype(np.float32)
    pm = Image.fromarray(np.clip(A[..., :3] * solid, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(r))
    am = Image.fromarray((solid[..., 0] * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(r))
    fill = np.asarray(pm).astype(np.float32) / np.maximum(np.asarray(am).astype(np.float32)[..., None] / 255.0, 1e-3)
    rgb = np.where(a > 0.6, A[..., :3], np.clip(fill, 0, 255))
    # where the soft edge was painted near white, it was a halo, not the thing: let it go
    lum = A[..., :3].mean(-1, keepdims=True) / 255.0
    a2 = np.where(a < 0.9, a * np.clip((1.0 - lum) / 0.25, 0, 1), a)
    return Image.fromarray(np.concatenate([rgb, a2 * 255], -1).clip(0, 255).astype('uint8'), 'RGBA')

def lum_key(im):
    """a cut-out drawn with an opaque white halo round it: only the crayon is the thing"""
    import numpy as np
    A = np.asarray(im.convert('RGBA')).astype(np.float32); d = 1.0 - A[..., :3].mean(-1) / 255.0
    A[..., 3] *= np.clip((d - 0.10) / 0.22, 0, 1)
    return Image.fromarray(A.clip(0, 255).astype('uint8'), 'RGBA')

def sheet_frames(im, n, h, anchor='feet'):
    """a sheet of n frames in n equal columns -> n frames of one size, lined up on the anchor, scaled to height h"""
    import numpy as np
    W = im.width // n; fr = []
    for i in range(n):
        c = im.crop((i * W, 0, (i + 1) * W, im.height)); A = np.asarray(c)[..., 3]
        m = A > 40; ys, xs = np.nonzero(m)
        bottom = ys.max(); top = ys.min()
        up = m[: top + (bottom - top) // 2]                       # (the body's upper half: its head and shoulders, the umbrella)
        uy, ux = np.nonzero(up)
        if anchor == 'feet': cx, cy = ux.mean(), bottom
        else:                                                        # (a bird: its beak, which keeps its place in a wing-beat)
            xm = xs.max(); cx, cy = xm, ys[xs > xm - 12].mean()
        fr.append((c, cx, cy, xs.min(), xs.max(), top, bottom))
    L_ = max(f[1] - f[3] for f in fr) + 6; R_ = max(f[4] - f[1] for f in fr) + 6
    T_ = max(f[2] - f[5] for f in fr) + 6; B_ = max(f[6] - f[2] for f in fr) + 6
    out = []
    for c, cx, cy, *_ in fr:
        cell = Image.new('RGBA', (int(L_ + R_), int(T_ + B_)), (0, 0, 0, 0))
        cell.alpha_composite(c, (int(round(L_ - cx)), int(round(T_ - cy))))
        out.append(cell)
    k = h / out[0].height
    out = [bleed_edge(f.resize((max(1, round(f.width * k)), h), Image.LANCZOS)) for f in out]
    return out, (L_ / (L_ + R_), B_ / (T_ + B_))                   # (and where the anchor is in a frame: from its left, from its foot)

def pack_atlas(sprites, W=4096, pad=10):
    """shelf-pack the frames; returns the atlas and, for each sprite, its frame size, its anchor and each frame's place"""
    items = [(name, fr, anc) for name, fr, anc in sprites]
    order = sorted(range(len(items)), key=lambda i: -items[i][1][0].height)
    x = y = sh = 0; place = {}
    for i in order:
        name, fr, anc = items[i]
        for j, f in enumerate(fr):
            if x + f.width + pad > W: x = 0; y += sh + pad; sh = 0
            place[(name, j)] = (x, y); x += f.width + pad; sh = max(sh, f.height)
    H = y + sh
    H = 1 << (H - 1).bit_length()
    at = Image.new('RGBA', (W, H), (0, 0, 0, 0)); meta = {}
    for name, fr, anc in items:
        for j, f in enumerate(fr): at.paste(f, place[(name, j)])
        meta[name] = {'w': fr[0].width, 'h': fr[0].height, 'n': len(fr), 'anchor': [round(anc[0], 4), round(anc[1], 4)], 'at': [list(place[(name, j)]) for j in range(len(fr))]}
    return at, meta

CAB_WHEELS = [(0.3922, 0.2375, 125 / 640), (0.8706, 0.2690, 162 / 640)]     # (hub x, y from the foot, radius: of the cab's height)
if want('conte'):
    items = {}
    pano = L('ct_pano').convert('L'); items['conte_pano'] = (uri(pano, 'jpeg', 88), pano.size)
    paper = L('ct_paper').convert('L'); items['conte_paper'] = (uri(paper, 'jpeg', 90), paper.size)
    sp = []
    def one(name, im, h, anc=(0.5, 0.0)):
        im, _ = crop_alpha(im.convert('RGBA')); im = bleed_edge(scale(im, h=h)); sp.append((name, [im], anc))
    one('lamp', L('ct_lamp'), 860); one('tree', L('ct_tree'), 820, (0.12, 0.0))
    for i, im in enumerate(split_columns(L('ct_river_figs').convert('RGBA'), 3)):
        one(['woman', 'man', 'dogsit'][i], im, [520, 380, 200][i])
    for n, h, a in [('walk_man', 440, 'feet'), ('walk_child', 330, 'feet'), ('gent', 420, 'feet'), ('dog', 210, 'feet'), ('horse', 380, 'feet'), ('birds', 150, 'beak')]:
        im = L('ct_' + n).convert('RGBA')
        if n == 'dog': im = lum_key(im)
        fr, anc = sheet_frames(im, 6, h, a); sp.append((n, fr, anc))
    one('cab', L('ct_cab'), 640, (0.5, 0.0)); one('barge', L('ct_barge'), 300, (0.5, 0.0))
    # the cab's wheels turn: their spokes are taken out of the picture here (a closing: the thin dark lines filled from
    # what is round them, the thick rim and the hub kept), and the page draws them, turning
    import numpy as np
    from PIL import ImageFilter
    cab = sp[-2][1][0]; A = np.asarray(cab).astype(np.float32)
    rgb = Image.fromarray(A[..., :3].astype('uint8')); cl = np.asarray(rgb.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.MinFilter(13))).astype(np.float32)
    al = Image.fromarray(A[..., 3].astype('uint8')); acl = np.asarray(al.filter(ImageFilter.MinFilter(13)).filter(ImageFilter.MaxFilter(13))).astype(np.float32)
    yy, xx = np.mgrid[0:A.shape[0], 0:A.shape[1]]
    for (cx, cy, r) in CAB_WHEELS:
        rr = np.hypot(xx - cx * A.shape[1], yy - (1 - cy) * A.shape[0]) / (r * A.shape[0])
        m = ((rr > 0.20) & (rr < 0.86))[..., None]
        A[..., :3] = np.where(m, cl, A[..., :3]); A[..., 3] = np.where(m[..., 0], np.maximum(acl, 0), A[..., 3])
    sp[-2] = ('cab', [Image.fromarray(A.clip(0, 255).astype('uint8'), 'RGBA')], sp[-2][2])
    at, meta = pack_atlas(sp)
    items['conte_atlas'] = (uri(at, 'webp', 84), at.size)
    meta['cab']['wheels'] = CAB_WHEELS
    write('conte', items, extra=f"window.YL.CONTE_ATLAS = {json.dumps(meta)};")
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
    # the moon's outline as a signed distance (for the Kandinsky's crescent to grow into its shape): 128 on the edge,
    # +/- 1 per 3 pixels of the moon picture (positive outside), a quarter of its size; the string left out
    import numpy as np
    from scipy import ndimage
    mo = L('sm_moon').convert('RGBA'); mo, _ = crop_alpha(mo); mo = scale(mo, h=1100)
    a = np.asarray(mo)[..., 3] > 128
    lab, n = ndimage.label(a); sizes = ndimage.sum(a, lab, range(1, n + 1)); m = lab == (np.argmax(sizes) + 1)
    d = ndimage.distance_transform_edt(~m) - ndimage.distance_transform_edt(m)
    sd = Image.fromarray(np.clip(128 + d / 3.0, 0, 255).astype('uint8'), 'L').resize((mo.width // 4, mo.height // 4), Image.BILINEAR)
    b = io.BytesIO(); sd.save(b, 'PNG', optimize=True)
    items['stop_moon_sdf'] = ('data:image/png;base64,' + base64.b64encode(b.getvalue()).decode(), sd.size)
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
    # when each place on it is painted (see tools/ink_times.py): a PNG of times, and the brush's way
    import subprocess, tempfile
    tmp = tempfile.mkdtemp()
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ink_times.py'), SRC, tmp + '/t.png', tmp + '/t.json'], check=True)
    b = open(tmp + '/t.png', 'rb').read(); tim = Image.open(tmp + '/t.png')
    items['ink_time'] = ('data:image/png;base64,' + base64.b64encode(b).decode(), tim.size)
    write('ink', items, extra='window.YL.INK_TIME = ' + open(tmp + '/t.json').read() + ';')
# ---- the sea's water, painted in watercolour from just under the surface down into the deep (opaque, tall)
if want('sea'):
    items = {}
    sw = L('se_water').convert('RGB'); items['sea_water'] = (uri(sw, 'jpeg', 88), sw.size)
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
    # the head again, closer: the same painting repainted at 2.06 times the size (columns 0 … 1240 of the rows above), its
    # detail moved onto the painting's own shapes (optical flow) and its coarse colour taken from the painting, so as the
    # eye comes close only detail is added (tools in assets/prompts/se_whdet.txt); its outline is the painting's, enlarged
    D = np.asarray(L('se_whdet').convert('RGB')).astype(np.float32)
    ah = np.asarray(Image.fromarray(A[:, :1240, 3].astype('uint8')).resize((D.shape[1], D.shape[0]), Image.BICUBIC)).astype(np.float32)[..., None] / 255.0
    pm = Image.fromarray(np.clip(D * ah, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(12))
    am = Image.fromarray((ah[..., 0] * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(12))
    fill = np.asarray(pm).astype(np.float32) / np.maximum(np.asarray(am).astype(np.float32)[..., None] / 255.0, 1e-3)
    rgb = np.where(ah > 0.5, D, np.clip(fill, 0, 255))
    wd = Image.fromarray(np.concatenate([rgb, ah * 255], -1).clip(0, 255).astype('uint8'), 'RGBA'); items['sea_whdet'] = (uri(wd, 'webp', 86), wd.size)
    # its near flipper, painted on its own (it rows: the page turns it about its root): rows 150 … 870, the edge bled out
    F = np.asarray(L('se_flipper').convert('RGBA').crop((0, 150, 3072, 870))).astype(np.float32); fa = F[..., 3:] / 255.0
    pm = Image.fromarray(np.clip(F[..., :3] * fa, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(8))
    am = Image.fromarray((fa[..., 0] * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(8))
    fill = np.asarray(pm).astype(np.float32) / np.maximum(np.asarray(am).astype(np.float32)[..., None] / 255.0, 1e-3)
    rgb = np.where(fa > 0.5, F[..., :3], np.clip(fill, 0, 255))
    fl = Image.fromarray(np.concatenate([rgb, F[..., 3:]], -1).clip(0, 255).astype('uint8'), 'RGBA'); items['sea_flipper'] = (uri(fl, 'webp', 86), fl.size)
    write('sea', items)
