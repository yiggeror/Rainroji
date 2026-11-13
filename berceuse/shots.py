"""The one take: where the camera is, what it looks at, and the light it moves through."""
import numpy as np
import world as W
from core import Path
import look as LK
from look import c, sundir, key

MUSIC_T0 = 1.0
DUR = 147.0


def R(z, off=0.0):
    return float(W.rx(z)) + off


#       t     camera x, y, z                 looking at x, y, z                 fov
KEYS = [
    # --- inside the blossom of the first tree, then down and out into the orchard
    [0.0,   -21.0, 4.9, -48.5,               -17.5, 7.4, -38.0,                 52],
    [5.0,   -20.4, 4.6, -47.0,               -15.0, 6.6, -34.0,                 52],
    [10.5,  -18.5, 3.2, -41.0,               -6.0, 3.6, -16.0,                  54],
    [17.0,  -12.0, 2.0, -30.5,               -4.0, 1.5, -6.0,                   56],
    [24.0,  -3.6, 1.75, -17.5,               -2.2, 0.9, -3.6,                   54],
    [28.0,  1.6, 1.7, -9.5,                  2.0, 1.0, 4.0,                     55],
    [32.0,  5.8, 1.7, -0.5,                  R(40), 1.2, 40.0,                  56],
    [36.5,  R(22, -6.0), 1.8, 16.0,          R(44), 0.4, 44.0,                  56],
    # --- out over the water, looking down at the petals
    [41.0,  R(32, -1.0), 2.5, 32.0,          R(41), -0.6, 41.0,                 56],
    [46.0,  R(52), 2.3, 52.0,                R(60), -0.8, 59.0,                 56],
    [50.5,  R(70), 1.7, 70.0,                R(92), 0.9, 92.0,                  56],
    # --- summer: up the green reach after the skiff
    [57.0,  R(86, -1.0), 1.5, 86.0,          R(100, 1.2), 0.8, 100.0,           54],
    [64.0,  R(101, -2.8), 1.4, 101.0,        R(106, 1.2), 0.6, 106.5,           55],
    [70.0,  R(118, -3.0), 1.4, 118.0,        R(114, 1.2), 0.6, 114.0,           56],
    [73.5,  R(127, -1.4), 1.5, 127.0,        R(142), 1.6, 142.0,                54],
    [76.5,  R(134, -0.5), 1.5, 134.0,        R(152), 2.2, 152.0,                56],
    [80.0,  R(144.5), 1.45, 144.5,           R(170), 2.4, 172.0,                58],
    [82.6,  R(155.5), 1.5, 155.5,            R(190), 3.2, 190.0,                58],
    [DUR,   R(160), 1.5, 160.0,              R(195), 3.2, 195.0,                58],
]


def _lift(keys):
    """Heights in the table are above the local surface (land or water); make them absolute."""
    out = []
    for k in keys:
        k = list(k)
        g1 = float(W.ground(np.array([k[1]]), np.array([k[3]]))[0])
        g2 = float(W.ground(np.array([k[4]]), np.array([k[6]]))[0])
        k[2] += g1
        k[5] += g2
        out.append(k)
    return out


PATH = Path(_lift(KEYS), sigma=1.1)
_tt = np.linspace(0, DUR, 600)
_pp = np.array([PATH.at(t)[:3] for t in _tt])


def clear_of_path(x, z, r):
    """True if (x, z) is at least r metres from the camera track (where the camera is low)."""
    low = _pp[:, 1] < 9.0
    d2 = (_pp[low, 0] - x) ** 2 + (_pp[low, 2] - z) ** 2
    return d2.min() > r * r


# ------------------------------------------------------------------ light
key(0.0, sun=sundir(118, 34), zen=c(88, 142, 218), mid=c(140, 186, 234), hor=c(212, 228, 240),
    cover=0.40, cloud_lit=c(255, 252, 244), cloud_sh=c(200, 208, 234), glow=c(255, 240, 210), glow_wide=0.10, glow_tight=0.22,
    haze=c(200, 214, 232), hazesun=c(240, 232, 220), vis=520.0, hazemax=0.9,
    water_tint=np.array([0.30, 0.46, 0.40, 0.20]), deep=c(58, 104, 96), wind=0.9, wind_dir=0.5, glitter=0.5,
    fade=1.0, fade_rgb=c(250, 244, 238))
key(1.2, fade=0.85)
key(6.0, fade=0.0)
key(40.0)
# summer noon under the trees
key(52.0, sun=sundir(185, 60), zen=c(70, 128, 214), mid=c(120, 172, 228), hor=c(196, 220, 232), cover=0.22,
    haze=c(170, 204, 196), hazesun=c(226, 232, 190), vis=260.0, hazemax=0.8,
    water_tint=np.array([0.12, 0.33, 0.26, 0.34]), deep=c(30, 80, 66), wind=0.6, glitter=0.9, mirror_gain=0.86)
key(78.0)


# ------------------------------------------------------------------ following the skiff
# While the camera overtakes the boat it is rigged to the boat's own (steady) course, the way
# a second boat would follow it: offsets are in the boat's frame (right, up, ahead).
_FOLLOW = np.array([
    #  t     right   up    ahead
    [56.0,  -2.2,  1.55, -15.0],
    [60.0,  -3.0,  1.45, -10.5],
    [64.0,  -4.6,  1.45,  -6.5],
    [67.5,  -5.6,  1.45,  -1.0],
    [70.5,  -5.0,  1.45,   4.5],
    [73.5,  -3.0,  1.50,   9.5],
])


def _follow(t, C, T):
    from engine import smooth
    import boat
    w = float(smooth(52.0, 57.5, t) * smooth(74.5, 70.5, t))
    if w <= 0:
        return C, T
    tt = min(max(t, _FOLLOW[0, 0]), _FOLLOW[-1, 0])
    from scipy.interpolate import PchipInterpolator
    off = np.array([PchipInterpolator(_FOLLOW[:, 0], _FOLLOW[:, i])(tt) for i in (1, 2, 3)])
    zs = boat.Z_REF + boat.V0 * (t - boat.T_REF)                       # the boat's steady course
    xs = float(W.rx(zs)) + boat.SIDE
    tx, tz = W.river_tangent(np.array([zs]))
    tx, tz = float(tx[0]), float(tz[0])
    Cb = np.array([xs + tz * off[0] + tx * off[2], off[1], zs - tx * off[0] + tz * off[2]])
    Tb, _ = boat.boat_pose(t)
    Tb = np.array([xs, 0.0, zs]) * 0.6 + Tb * 0.4 + np.array([0.0, 0.55, 0.0])
    wt = float(smooth(52.5, 58.0, t) * smooth(73.0, 69.0, t))
    return C * (1 - w) + Cb * w, T * (1 - wt) + Tb * wt


PATH.post = _follow
