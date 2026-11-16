#!/usr/bin/env python3
"""render a scene.  run.py NAME still [S]   |   run.py NAME anim [S]"""
import sys, os, time, importlib, pickle
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import render as R, pix, fx
from PIL import Image
OUT = os.environ.get('PX_OUT', '/tmp/claude-0/-home-user-Rainroji/6146149c-374c-532e-9224-be2885cb3c7f/scratchpad/work')

def _dn(sc, plate):
    kw = getattr(sc, 'DENOISE', {})
    if kw is None: return plate
    fx.denoise(plate, **kw)
    if 'far' in plate: fx.denoise(plate['far'], **kw)
    return plate

def plate_for(sc, S, force=False):
    p = f'{OUT}/{sc.NAME}_S{S}.pkl'
    if os.path.exists(p) and not force:
        return _dn(sc, pickle.load(open(p, 'rb')))
    t = time.time(); w = sc.build(); print(f' build {time.time() - t:.1f}s', flush=True)
    plate, acc = R.render(w, sc.camera(), sc.sky, S=S, **sc.RENDER)
    plate['lights'] = w.lights
    for k in ('chim',):
        if hasattr(w, k): plate[k] = getattr(w, k)
    if getattr(sc, 'TWO_PASS', False):          # second pass with the foreground hidden: what moving things are composited onto
        from engine.world import MASK_NEAR
        far, _ = R.render(w, sc.camera(), sc.sky, S=S, cam_mask=MASK_NEAR, acc=acc, **sc.RENDER)
        plate['far'] = far
    pickle.dump(plate, open(p, 'wb'), protocol=4)
    return _dn(sc, plate)

def render_anim(sc, S, fps=30, scale=3, kind=None, strength=None):
    import subprocess
    plate = plate_for(sc, S)
    cam = sc.camera(); ctx = sc.setup(plate, cam)
    n = int(round(sc.T * fps))
    H, W = plate['sky'].shape
    vg = fx.vignette(H, W, getattr(sc, 'VIGNETTE', 0.22))
    imgs = [pix.tonemap(sc.frame(ctx, i / 8 + 0.03) * vg, **sc.GRADE) for i in range(8)]
    pal = pix.fit_palette(imgs, **sc.PAL)
    thr = pix.threshold_map(H, W, kind or getattr(sc, 'DITHER', 'mix'))
    st = strength if strength is not None else getattr(sc, 'DSTR', 0.6)
    frames = np.zeros((n, H, W, 3), np.uint8)
    t = time.time()
    for i in range(n):
        frames[i] = pix.quantize(pix.tonemap(sc.frame(ctx, i / n) * vg, **sc.GRADE), pal, thr, st)
    print(f' {n} frames {time.time() - t:.1f}s', flush=True)
    np.save(f'{OUT}/{sc.NAME}_frames.npy', frames)
    Image.fromarray(pal['rgb'][None].repeat(16, 0).repeat(16, 1)).save(f'{OUT}/{sc.NAME}_pal.png')
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                          '-vf', f'scale={W * scale}:{H * scale}:flags=neighbor', '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', '-pix_fmt', 'yuv420p', f'{OUT}/{sc.NAME}_loop.mp4'], stdin=subprocess.PIPE)
    p.stdin.write(frames.tobytes()); p.stdin.close(); p.wait()
    sheet = np.concatenate([np.concatenate([frames[0], frames[n // 4]], 1), np.concatenate([frames[n // 2], frames[3 * n // 4]], 1)], 0)
    Image.fromarray(pix.upscale(sheet, 2)).save(f'{OUT}/{sc.NAME}_sheet.png')
    Image.fromarray(pix.upscale(frames[n // 3], 3)).save(f'{OUT}/{sc.NAME}_f.png')
    return frames

if __name__ == '__main__':
    name = sys.argv[1]; mode = sys.argv[2]; S = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    sc = importlib.import_module('scenes.' + name)
    plate = plate_for(sc, S, force=('-f' in sys.argv))
    if mode == 'still':
        cam = sc.camera(); ctx = sc.setup(plate, cam)
        ph = float(os.environ.get('PH', 0.3))
        lin = sc.frame(ctx, ph)
        H, W = lin.shape[:2]
        img = pix.tonemap(lin * fx.vignette(H, W, getattr(sc, 'VIGNETTE', 0.22)), **sc.GRADE)
        Image.fromarray(pix.upscale((img * 255).astype(np.uint8), 3)).save(f'{OUT}/{name}_raw.png')
        pal = pix.fit_palette([img], **sc.PAL)
        outs = []
        for kind, st in (('mix', 0.6), ('bayer', 0.6), ('blue', 0.45), ('bayer', 0.3)):
            q = pix.quantize(img, pal, pix.threshold_map(H, W, kind), st)
            outs.append(q)
            if kind == getattr(sc, 'DITHER', 'mix') and st == 0.6: Image.fromarray(pix.upscale(q, 3)).save(f'{OUT}/{name}_px.png')
        cx, cy = [int(v) for v in os.environ.get('CROP', '240,150').split(',')]
        crops = [pix.upscale(o[cy:cy + 100, cx:cx + 160], 4) for o in outs]
        Image.fromarray(np.concatenate([np.concatenate(crops[:2], 1), np.concatenate(crops[2:], 1)], 0)).save(f'{OUT}/{name}_dither.png')
        print('saved')
    else:
        render_anim(sc, S)
