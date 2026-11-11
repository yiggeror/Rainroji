"""Render stills or frame ranges.

  python3 render.py still OUT.png T [H]
  python3 render.py frames OUTDIR/prefix START END [H] [STEP]   (frame indices)
  python3 render.py pipe START END H      -> raw rgb24 on stdout
"""
import sys, time
import numpy as np
import cv2
import engine
from world import Env, FPS, DUR, flat
import scenes


_TITLE = {}


def _title(H):
    """End title, drawn like a signature in thinned paint on the bare canvas."""
    if H not in _TITLE:
        from PIL import Image, ImageDraw, ImageFont, ImageFilter
        W = H * 16 // 9
        im = Image.new('L', (W, H), 0)
        dr = ImageDraw.Draw(im)
        f1 = ImageFont.truetype('/usr/share/fonts/truetype/crosextra/Caladea-Italic.ttf', int(H * 0.070))
        f2 = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', int(H * 0.026))
        f3 = ImageFont.truetype('/usr/share/fonts/truetype/crosextra/Caladea-Italic.ttf', int(H * 0.026))
        dr.text((W / 2, H * 0.455), 'Un jour de lumi\u00e8re', font=f1, fill=255, anchor='mm')
        dr.text((W / 2, H * 0.545), '\u5149 \u4e4b \u4e00 \u65e5', font=f2, fill=215, anchor='mm')
        dr.text((W / 2, H * 0.600), "d'apr\u00e8s Claude Monet", font=f3, fill=200, anchor='mm')
        im = im.filter(ImageFilter.GaussianBlur(H / 1080 * 0.7))
        _TITLE[H] = np.asarray(im, np.float32) / 255.0
    return _TITLE[H]


def frame(t, H=1080):
    env = Env(t)
    batches = flat([s.emit(env) for s in scenes.SETS] + [f(env) for f in scenes.ACTORS])
    fade = float(engine.smooth(96.6, 99.2, t))
    im = engine.render(batches, H, fade=fade)
    ta = float(engine.smooth(98.4, 99.8, t)) * float(engine.smooth(DUR, DUR - 0.6, t))
    if ta > 0:
        m = (_title(H) * ta * 0.80)[..., None]
        ink = np.array([92, 78, 96], np.float32)
        im = (im * (1 - m) + ink * m + 0.5).astype(np.uint8)
    return im


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'still':
        out, t = sys.argv[2], float(sys.argv[3])
        H = int(sys.argv[4]) if len(sys.argv) > 4 else 1080
        t0 = time.time()
        im = frame(t, H)
        cv2.imwrite(out, im[:, :, ::-1])
        print('t=%.2f  %.2fs' % (t, time.time() - t0))
    elif mode == 'frames':
        pref, a, b = sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
        H = int(sys.argv[5]) if len(sys.argv) > 5 else 540
        step = int(sys.argv[6]) if len(sys.argv) > 6 else 1
        for i in range(a, b, step):
            cv2.imwrite('%s%05d.jpg' % (pref, i), frame(i / FPS, H)[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 93])
    elif mode == 'pipe':
        a, b, H = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
        out = sys.stdout.buffer
        for i in range(a, b):
            out.write(frame(i / FPS, H).tobytes())
        out.flush()
