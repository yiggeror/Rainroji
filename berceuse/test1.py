import sys, time
import numpy as np, cv2
import film, core, trees, world as W
from engine import pal, DAB, DASH
from core import SB, Path, Env
import look as LK

rng = np.random.default_rng(3)
GSH = pal((34, 84, 70), (46, 104, 84), (28, 70, 84), (40, 60, 104))
GLI = pal((120, 170, 80), (160, 196, 90), (96, 150, 76), (200, 214, 110))
TSH = pal((70, 56, 80), (58, 52, 70))
TLI = pal((150, 120, 100), (176, 140, 110))
for i in range(40):
    z = rng.uniform(-20, 220)
    sd = rng.choice([-1, 1])
    x = W.rx(z) + sd * (W.hw(z) + rng.uniform(2, 14))
    y = float(W.ground(np.array([x]), np.array([z]))[0])
    sb = SB(rng)
    h = rng.uniform(7, 12)
    trees.limb(sb, (x, y, z), (x + rng.normal(0, .4), y + h * 0.55, z), 0.45, 0.25, TSH, TLI, rng)
    for k in range(6):
        c = (x + rng.normal(0, 1.6), y + h * rng.uniform(0.5, 0.95), z + rng.normal(0, 1.6))
        trees.crown(sb, c, (2.6, 2.0, 2.6), 420, GSH, GLI, 0.42, rng)
    film.GROUPS.append(sb.group())

def still(C, T, fov, t, H=540):
    p = Path([[0, *C, *T, fov], [100, *C, *T, fov]])
    env = Env(t, p, LK.look)
    t0 = time.time()
    im = film.frame(t, H, env=env, stats=True)
    print('%.2fs' % (time.time() - t0))
    return im

views = [((W.rx(0) + 0, 1.5, 0), (W.rx(60), 1.2, 60), 58),
         ((W.rx(60) + 1, 3.0, 60), (W.rx(75), 0.0, 68), 58),
         ((W.rx(100) - 3, 14.0, 100), (W.rx(160), 2.0, 170), 58),
         ((W.rx(20) - 14, 2.2, 10), (W.rx(60) + 5, 2.5, 50), 50)]
if __name__ == "__main__":
  ims = [still(*v, 5.0) for v in views]
  cv2.imwrite(sys.argv[1], np.concatenate([np.concatenate(ims[:2], 1), np.concatenate(ims[2:], 1)], 0)[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 90])
