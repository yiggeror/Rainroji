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


def E(z, back):
    """x of a point `back` metres inland from the east bank at z (negative = out on the water)."""
    return float(W.rx(z)) + float(W.hw(z)) + back


GAP = 239.6          # set by scenes.py to the middle of a gap between two poplars

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
    [74.0,  R(124.5, -1.8), 1.5, 124.5,      R(144), 1.8, 144.0,                55],
    [77.0,  R(133, -0.5), 1.5, 133.0,        R(152), 2.2, 152.0,                56],
    [80.0,  R(144.5), 1.45, 144.5,           R(170), 2.4, 172.0,                58],
    [82.6,  R(155.5), 1.5, 155.5,            R(190), 3.2, 190.0,                58],
    # --- autumn: along the poplars, then up their whole height into the mist
    [88.0,  E(170, -7.0), 1.6, 170.0,        E(206, 2), 6.0, 206.0,             60],
    [93.5,  E(184, -4.0), 1.7, 184.0,        E(218, 3), 8.0, 218.0,             60],
    [98.0,  E(195, -2.0), 2.4, 195.0,        E(226, 3), 12.0, 226.0,            60],
    [102.5, E(205, 0.5), 12.0, 205.0,        E(232, 6), 20.0, 236.0,            58],
    [106.0, E(214, 2), 26.0, 214.0,          E(214, -28), 12.0, 262.0,          58],
    [109.5, E(226, 22), 24.0, 226.0,         E(236, -10), 3.0, 236.0,           58],
    # --- winter: down onto the snowfield, the gate and its magpie, out over the ice
    [113.5, E(243, 40), 5.0, 243.0,          E(240, 10), 1.5, 240.0,            56],
    [117.0, E(242.5, 35), 1.9, 242.5,        E(240, 22), 1.2, 240.3,            52],
    [121.0, E(241.6, 28.8), 1.65, 241.6,     E(240, 22), 1.3, 240.3,            48],
    [126.0, E(241, 24), 3.4, 241.0,          E(238, -10), 4.0, 238.0,           54],
    [132.0, E(GAP, 8), 4.0, GAP,             E(240, -60), 5.0, 242.0,           56],
    [138.0, E(GAP, -4), 3.2, GAP,            E(242, -80), 7.0, 244.0,           56],
    [143.0, E(GAP, -10), 3.4, GAP,           E(242, -70), 60.0, 244.0,          54],
    [DUR,   E(GAP, -12), 3.5, GAP,           E(242, -60), 110.0, 244.0,         54],
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
# autumn, late afternoon: gold on the poplars, the sky deep and clear
key(83.5, sun=sundir(250, 22), zen=c(56, 116, 206), mid=c(118, 176, 222), hor=c(236, 216, 176), cover=0.30,
    cloud_lit=c(255, 228, 184), cloud_sh=c(190, 154, 184), glow=c(255, 212, 140), glow_wide=0.20, glow_tight=0.45,
    haze=c(216, 194, 186), hazesun=c(255, 216, 156), vis=520.0, hazemax=0.9, light=c(255, 250, 236),
    water_tint=np.array([0.36, 0.44, 0.50, 0.10]), deep=c(40, 84, 112), wind=1.25, glitter=0.8, mirror_gain=0.95)
key(100.0)
# the mist
key(106.3, vis=30.0, hazemax=1.0, haze=c(236, 226, 230), hazesun=c(250, 234, 222), mist=1.0, cover=0.6, wind=0.7, snow=0.12)
key(109.2, vis=36.0, sun=sundir(246, 7.0), zen=c(126, 164, 214), mid=c(208, 208, 216), hor=c(250, 216, 176),
    cloud_lit=c(255, 216, 192), cloud_sh=c(178, 154, 192), cover=0.36, glow=c(255, 172, 96), glow_wide=0.32, glow_tight=0.7,
    light=c(255, 240, 222), shade=c(236, 242, 255), water_tint=np.array([0.50, 0.50, 0.62, 0.14]), deep=c(62, 72, 122),
    sun_col=c(255, 150, 70), snow=0.3)
# winter afternoon: rose light on the snow, blue shadows
key(114.0, vis=420.0, hazemax=0.93, haze=c(228, 208, 216), hazesun=c(255, 198, 152), mist=0.22, sundisc=1.0, glitter=1.0,
    wind=0.45, snow=0.22)
key(126.0, sun=sundir(246, 4.2), sun_col=c(255, 128, 60), hor=c(252, 196, 150), snow=0.3)
# the sun goes; lamps are lit
key(135.0, sun=sundir(246, 0.6), zen=c(70, 92, 162), mid=c(156, 128, 176), hor=c(244, 150, 108), cloud_lit=c(250, 150, 120),
    cloud_sh=c(120, 104, 160), glow=c(255, 120, 70), glow_wide=0.30, glow_tight=0.5, light=c(176, 168, 200), shade=c(140, 152, 214),
    haze=c(150, 130, 176), hazesun=c(236, 150, 120), sun_col=c(250, 96, 56), sundisc=0.7, lamps=0.75, ground=c(150, 132, 170), snow=0.6, glitter=0.5, mist=0.3,
    deep=c(40, 46, 100))
key(141.5, sun=sundir(246, -3.0), zen=c(24, 34, 88), mid=c(52, 58, 120), hor=c(118, 92, 136), cloud_lit=c(110, 96, 140),
    cloud_sh=c(50, 52, 104), glow_wide=0.06, glow_tight=0.1, light=c(104, 112, 164), shade=c(84, 96, 160),
    haze=c(58, 62, 118), hazesun=c(110, 90, 130), sundisc=0.0, lamps=1.0, snow=1.0, ground=c(34, 42, 96), glitter=0.1, deep=c(24, 28, 70), fade=0.0,
    fade_rgb=c(12, 16, 38))
key(144.0, fade=0.0)
key(147.0, fade=1.0)


# ------------------------------------------------------------------ following the skiff
# While the camera overtakes the boat it is rigged to the boat's own (steady) course, the way
# a second boat would follow it: offsets are in the boat's frame (right, up, ahead).
_FOLLOW = np.array([
    #  t     right   up    ahead
    [56.0,  -2.2,  1.55, -15.0],
    [60.0,  -3.2,  1.50, -10.8],
    [64.0,  -4.8,  1.45,  -6.6],
    [67.0,  -5.6,  1.45,  -3.6],
    [69.5,  -5.6,  1.45,  -1.2],
    [72.0,  -4.6,  1.48,   2.2],
    [74.5,  -3.0,  1.50,   6.5],
])


_G68 = {}


def _rig_pos(t):
    from scipy.interpolate import PchipInterpolator
    import boat
    tt = min(max(t, _FOLLOW[0, 0]), _FOLLOW[-1, 0])
    off = np.array([PchipInterpolator(_FOLLOW[:, 0], _FOLLOW[:, i])(tt) for i in (1, 2, 3)])
    zs = boat.Z_REF + boat.V0 * (t - boat.T_REF)                       # the boat's steady course
    xs = float(W.rx(zs)) + boat.SIDE
    tx, tz = W.river_tangent(np.array([zs]))
    tx, tz = float(tx[0]), float(tz[0])
    Cb = np.array([xs + tz * off[0] + tx * off[2], off[1], zs - tx * off[0] + tz * off[2]])
    Tb, _ = boat.boat_pose(t)
    Tb = np.array([xs, 0.0, zs]) * 0.6 + Tb * 0.4 + np.array([0.0, 0.55, 0.0])
    return Cb, Tb, (tx, tz)


def _follow(t, C, T):
    from engine import smooth
    w = float(smooth(52.0, 57.5, t) * smooth(77.0, 70.5, t))
    if w <= 0:
        return C, T
    Cb, Tb, (tx, tz) = _rig_pos(t)
    Cn = C * (1 - w) + Cb * w
    T_REL = 68.0
    if t <= T_REL:
        db = (Tb - Cn) / np.linalg.norm(Tb - Cn)
    else:
        # past the boat the gaze is not dragged round after it: it swings forward at an even rate
        if not _G68:
            c0, t0, (ax, az) = _rig_pos(T_REL)
            v = (t0 - c0) / np.linalg.norm(t0 - c0)
            _G68['phi'] = float(np.arctan2(v[0] * az - v[2] * ax, v[0] * ax + v[2] * az))
            _G68['pitch'] = float(v[1])
        u = (t - T_REL) / (75.6 - T_REL)
        k = 1.0 - min(max(u, 0.0), 1.0) ** 1.15
        phi = _G68['phi'] * k
        cph, sph = np.cos(phi), np.sin(phi)
        db = np.array([tx * cph + tz * sph, _G68['pitch'] * k, tz * cph - tx * sph])
        db /= np.linalg.norm(db)
    wt = float(smooth(52.5, 58.0, t) * smooth(77.0, 73.5, t))
    da = (T - Cn) / np.linalg.norm(T - Cn)
    d = da * (1 - wt) + db * wt
    d /= np.linalg.norm(d)
    return Cn, Cn + d * 12.0


PATH.post = _follow


def _rig(t, C, T):
    C, T = _follow(t, C, T)
    if 118.0 < t < 133.0:
        # the eye goes with the magpie when it leaves the gate
        from engine import smooth
        import sc_poplars
        w = float(smooth(119.6, 122.0, t) * smooth(131.5, 126.5, t))
        if w > 0:
            pos, _, _ = sc_poplars.magpie_pos(t)
            T = T * (1 - w) + (pos + np.array([-1.5, 0.3, 0.0])) * w
    return C, T


PATH.post = _rig
