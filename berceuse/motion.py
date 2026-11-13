"""Temporal stability check: python3 motion.py OUT.jpg  (renders a short dolly and measures frame differences)"""
import sys
import numpy as np, cv2
import test1 as T
import film, world as W
from core import Path, Env
import look as LK
p = Path([[0, W.rx(0), 1.5, 0, W.rx(60), 1.2, 60, 58], [4, W.rx(12), 1.8, 12, W.rx(70), 0.8, 70, 58], [8, W.rx(30) - 2, 4.0, 30, W.rx(60), 0.0, 55, 58]], sigma=0.5)
fr = []
for i in range(0, 20):
    t = 2.0 + i / 30
    fr.append(film.frame(t, 540, env=Env(t, p, LK.look)).astype(np.float32))
d = [np.abs(fr[i + 1] - fr[i]).mean() for i in range(len(fr) - 1)]
print('mean abs diff', np.round(d, 2))
crop = lambda im: im[300:480, 380:700]
cv2.imwrite(sys.argv[1], np.concatenate([np.concatenate([crop(fr[i]) for i in range(0, 4)], 1), np.concatenate([crop(fr[i]) for i in range(4, 8)], 1)], 0)[:, :, ::-1].astype(np.uint8))
