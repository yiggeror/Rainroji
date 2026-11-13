"""Continuity check: frozen time, camera moved in tiny steps. Any spike is a pop."""
import sys
import numpy as np, cv2
import test1 as T
import film, world as W
from core import Path, Env
import look as LK
p = Path([[0, 0, 2, 0, 0, 2, 10, 58], [9, 0, 2, 0, 0, 2, 10, 58]])
def fr(C, Tg):
    env = Env(3.0, p, LK.look)
    env.set_view(np.array(C, float), np.array(Tg, float), 58)
    return film.frame(3.0, 540, env=env).astype(np.float32)
for name, f in (('dolly', lambda s: ((W.rx(10), 1.6, 10 + s), (W.rx(70), 1.0, 70 + s))),
                ('crane', lambda s: ((W.rx(10), 1.6 + s, 10), (W.rx(70), 1.0, 70))),
                ('pan', lambda s: ((W.rx(10), 1.6, 10), (W.rx(70) + s * 8, 1.0, 70)))):
    fs = [fr(*f(i * 0.03)) for i in range(16)]
    d = [np.abs(fs[i + 1] - fs[i]).mean() for i in range(15)]
    print(name, np.round(d, 2))
