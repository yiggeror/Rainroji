"""The one take: where the camera is, what it looks at, and the light it moves through."""
import numpy as np
import world as W
from core import Path
import look as LK
from look import c, sundir, key

MUSIC_T0 = 1.0
DUR = 148.5


def R(z, off=0.0):
    return float(W.rx(z)) + off


def E(z, back):
    """x of a point `back` metres inland from the east bank at z (negative = out on the water)."""
    return float(W.rx(z)) + float(W.hw(z)) + back


TZ = 238.0           # the old apple tree on the bank (sc_poplars.TREE_Z)

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
    [113.0, E(243, 40), 5.0, 243.0,          E(240, 10), 1.5, 240.0,            56],
    [116.0, E(242.3, 33), 1.9, 242.3,        E(240, 22), 1.2, 240.3,            52],
    [118.6, E(241.6, 28.6), 1.65, 241.6,     E(240, 22), 1.3, 240.3,            48],
    [122.5, E(240.2, 21), 3.0, 240.2,        E(236, -14), 4.0, 233.0,           54],
    # --- beside the old apple tree on the bank: sunset on the ice, the lamps, the rain, the thaw
    [126.5, E(237.4, 13.5), 2.3, 237.4,      E(232, -45), 5.5, 228.0,           56],
    [131.0, E(TZ - 3.0, 9.6), 2.0, TZ - 3.0, E(230, -62), 7.0, 226.0,           56],
    [139.0, E(TZ - 2.8, 9.0), 2.0, TZ - 2.8, E(234, -62), 9.0, 232.0,           55],
    # --- and up into its blossom, where the film began
    [142.6, E(TZ - 2.2, 8.2), 2.4, TZ - 2.2, E(TZ, -26), 14.0, TZ - 1.0,        54],
    [146.4, E(TZ - 0.9, 6.2), 4.2, TZ - 0.9, E(TZ, 1.5), 22.0, TZ + 0.4,        52],
    [DUR,   E(TZ - 0.6, 5.6), 5.0, TZ - 0.6, E(TZ, 2.0), 26.0, TZ + 0.5,        52],
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
    fade=1.0, fade_rgb=c(250, 244, 238), cloudsh=1.0)
key(1.2, fade=0.85)
key(6.0, fade=0.0)
key(40.0)
# summer noon under the trees
key(52.0, sun=sundir(185, 60), zen=c(70, 128, 214), mid=c(120, 172, 228), hor=c(196, 220, 232), cover=0.22,
    haze=c(170, 204, 196), hazesun=c(226, 232, 190), vis=260.0, hazemax=0.8,
    water_tint=np.array([0.12, 0.33, 0.26, 0.34]), deep=c(30, 80, 66), wind=0.6, glitter=0.9, mirror_gain=0.86, cloudsh=0.0)
key(78.0)
# autumn, late afternoon: gold on the poplars, the sky deep and clear
key(83.5, sun=sundir(250, 22), zen=c(56, 116, 206), mid=c(118, 176, 222), hor=c(236, 216, 176), cover=0.30,
    cloud_lit=c(255, 228, 184), cloud_sh=c(190, 154, 184), glow=c(255, 212, 140), glow_wide=0.20, glow_tight=0.45,
    haze=c(216, 194, 186), hazesun=c(255, 216, 156), vis=520.0, hazemax=0.9, light=c(255, 250, 236),
    water_tint=np.array([0.36, 0.44, 0.50, 0.10]), deep=c(40, 84, 112), wind=1.25, glitter=0.8, mirror_gain=0.95, cloudsh=0.9)
key(100.0)
# the mist
key(103.0, wind=1.7)
key(106.3, vis=30.0, hazemax=1.0, cloudsh=0.0, haze=c(236, 226, 230), hazesun=c(250, 234, 222), mist=1.0, cover=0.6, wind=0.7, snow=0.12)
key(109.2, vis=36.0, sun=sundir(246, 7.0), zen=c(126, 164, 214), mid=c(208, 208, 216), hor=c(250, 216, 176),
    cloud_lit=c(255, 216, 192), cloud_sh=c(178, 154, 192), cover=0.36, glow=c(255, 172, 96), glow_wide=0.32, glow_tight=0.7,
    light=c(255, 240, 222), shade=c(236, 242, 255), water_tint=np.array([0.50, 0.50, 0.62, 0.14]), deep=c(62, 72, 122),
    sun_col=c(255, 150, 70), snow=0.3)
# winter afternoon: rose light on the snow, blue shadows
key(113.5, vis=420.0, hazemax=0.93, haze=c(228, 208, 216), hazesun=c(255, 198, 152), mist=0.22, sundisc=1.0, glitter=1.0,
    wind=0.45, snow=0.20)
key(121.0, sun=sundir(246, 4.6), sun_col=c(255, 132, 62), hor=c(252, 198, 152), snow=0.25)
# sunset; the lamps are lit; snow thickens
key(128.0, sun=sundir(246, 1.0), zen=c(84, 104, 172), mid=c(170, 136, 180), hor=c(246, 156, 110), cloud_lit=c(252, 156, 124),
    cloud_sh=c(128, 110, 166), cover=0.46, glow=c(255, 124, 72), glow_wide=0.30, glow_tight=0.5, light=c(196, 180, 204),
    shade=c(150, 160, 220), haze=c(160, 138, 180), hazesun=c(238, 156, 124), sun_col=c(250, 98, 58), sundisc=0.75, lamps=0.7,
    snow=0.6, glitter=0.5, mist=0.3, deep=c(44, 50, 104), ground=c(170, 150, 180))
# blue hour: the snow turns to rain
key(133.0, sun=sundir(246, -2.0), zen=c(58, 74, 132), mid=c(96, 100, 150), hor=c(150, 124, 150), cloud_lit=c(138, 128, 164),
    cloud_sh=c(74, 80, 128), cover=0.80, glow_wide=0.05, glow_tight=0.05, light=c(140, 146, 190), shade=c(112, 124, 186),
    haze=c(96, 104, 150), hazesun=c(140, 124, 150), sundisc=0.0, lamps=1.0, snow=0.25, rain=0.7, glitter=0.15, mist=0.35,
    deep=c(34, 44, 92), water_tint=np.array([0.36, 0.40, 0.56, 0.16]), ground=c(84, 92, 138), vis=300.0, wind=0.8)
key(136.5, sun=sundir(110, -2.0), zen=c(64, 84, 140), mid=c(110, 120, 164), hor=c(164, 150, 170), cloud_lit=c(160, 154, 182),
    cloud_sh=c(86, 94, 140), cover=0.82, light=c(150, 158, 196), shade=c(118, 132, 190), haze=c(118, 128, 166),
    hazesun=c(170, 150, 166), lamps=0.9, snow=0.0, rain=1.0, mist=0.4, deep=c(36, 56, 96), ground=c(100, 110, 150))
# the rain thins and the morning comes up behind us: a sun-shower, and everything opening
key(141.0, sun=sundir(110, 9.0), zen=c(98, 148, 214), mid=c(170, 198, 230), hor=c(250, 226, 204), cloud_lit=c(255, 232, 214),
    cloud_sh=c(170, 170, 206), cover=0.56, glow=c(255, 226, 190), glow_wide=0.16, glow_tight=0.3, light=c(255, 244, 228),
    shade=c(236, 240, 255), haze=c(210, 214, 230), hazesun=c(250, 230, 210), lamps=0.0, rain=0.35, mist=0.25, glitter=0.9,
    deep=c(52, 100, 104), water_tint=np.array([0.30, 0.46, 0.42, 0.18]), ground=c(229, 219, 198), vis=460.0, wind=0.9,
    sun_col=c(255, 240, 210))
key(145.0, sun=sundir(114, 22.0), zen=c(88, 142, 218), mid=c(140, 186, 234), hor=c(214, 228, 240), cloud_lit=c(255, 252, 244),
    cloud_sh=c(200, 208, 234), cover=0.40, glow=c(255, 240, 210), glow_wide=0.10, glow_tight=0.22, light=c(255, 255, 255),
    shade=c(255, 255, 255), haze=c(200, 214, 232), hazesun=c(240, 232, 220), rain=0.0, mist=0.0, vis=520.0, hazemax=0.9,
    fade=0.0, fade_rgb=c(250, 244, 238))
key(146.6, fade=0.0)
key(148.3, fade=1.0)


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
    if 116.5 < t < 128.0:
        # the eye goes with the magpie when it leaves the gate
        from engine import smooth
        import sc_poplars
        w = 0.8 * float(smooth(117.6, 119.6, t) * smooth(126.5, 121.5, t))
        if w > 0:
            pos, _, _ = sc_poplars.magpie_pos(t)
            da = (T - C) / np.linalg.norm(T - C)
            db = (pos + np.array([-2.0, -1.2, 0.0]) - C)
            db /= np.linalg.norm(db)
            d = da * (1 - w) + db * w
            T = C + d / np.linalg.norm(d) * 14.0
    return C, T


PATH.post = _rig
