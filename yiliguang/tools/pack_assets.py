"""Pack the generated pictures for the new worlds into the page as data URIs.
usage: python3 tools/pack_assets.py <dir with the generated PNGs>
Writes src/assets/conte.js and src/assets/stop.js. Each layer is cropped to what it covers (transparent ones), split where
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

def split_columns(im, n, thr=8):
    """split a transparent picture into its n separate things, left to right, at the widest empty gaps"""
    a = im.getchannel('A')
    cols = [max(a.crop((x, 0, x + 1, im.height)).getextrema()[1], 0) > thr for x in range(im.width)]
    runs, start = [], None
    for x, c in enumerate(cols + [False]):
        if c and start is None: start = x
        if not c and start is not None: runs.append([start, x]); start = None
    while len(runs) > n:                     # merge across the smallest gaps
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps)); runs[i] = [runs[i][0], runs[i + 1][1]]; del runs[i + 1]
    return [crop_alpha(im.crop((x0, 0, x1, im.height)))[0] for x0, x1 in runs]

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
# ---- conté: the drawing is grey; the transparent layers keep their alpha
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
