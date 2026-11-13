"""Render stills, contact sheets or frame ranges.

  python3 render.py still OUT.png T [H]
  python3 render.py sheet OUT.jpg H COLS t1 t2 ...
  python3 render.py pipe START END H          -> raw rgb24 frames on stdout
"""
import sys, time
import numpy as np
import cv2
import scenes
import film
from core import FPS

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'still':
        out, t = sys.argv[2], float(sys.argv[3])
        H = int(sys.argv[4]) if len(sys.argv) > 4 else 1080
        t0 = time.time()
        im = film.frame(t, H, stats=True)
        cv2.imwrite(out, im[:, :, ::-1])
        print('t=%.2f  %.2fs' % (t, time.time() - t0))
    elif mode == 'sheet':
        out, H, cols = sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
        ims = []
        for t in [float(x) for x in sys.argv[5:]]:
            t0 = time.time()
            im = np.ascontiguousarray(film.frame(t, H, stats=True)[:, :, ::-1])
            print('t=%.2f  %.2fs' % (t, time.time() - t0))
            cv2.putText(im, '%.1f' % t, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            ims.append(im)
        while len(ims) % cols:
            ims.append(np.zeros_like(ims[0]))
        cv2.imwrite(out, np.concatenate([np.concatenate(ims[i:i + cols], axis=1) for i in range(0, len(ims), cols)], axis=0),
                    [cv2.IMWRITE_JPEG_QUALITY, 90])
    elif mode == 'pipe':
        a, b, H = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
        out = sys.stdout.buffer
        for i in range(a, b):
            out.write(film.frame(i / FPS, H).tobytes())
        out.flush()
