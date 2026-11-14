"""The one take: where the camera is, what it looks at, and the light it moves through.

    0:00  spring    down from above the orchard, through it, past the swing, to the river
    0:40  summer    up the open reach: the painter and the cows, the garden and its house,
                    then after the skiff and past it, into the green shade
    1:34  the bridge
    1:37  autumn    the wide water, sails, poplars; ashore into the farm orchard
    2:08            the wind takes the leaves; up, into the mist
    2:26  winter    the same yard under snow: the gate, the magpie; sunset on the ice
    2:48            rain, thaw, morning; blossom
    3:02            back and up: the whole reach in spring
"""
import numpy as np
import world as W
from core import Path
import look as LK
from look import c, sundir, key

MUSIC_T0 = 1.0
DUR = 200.5
TZ = 238.0           # the old apple tree on the bank (sc_poplars.TREE_Z)
SH = 16.0            # the skiff sequence is timed from the boat's own clock (boat.T_REF = 64 + SH)

# moments other modules (the soundtrack above all) hang things on
TL = dict(spring_out=38.0, summer=46.0, garden=62.0, follow=72.0, bridge=94.5, autumn=97.0, ashore=110.0, wind=128.0, mist=141.0,
          winter=149.0, sunset=163.0, rain=169.0, morning=177.0, wide=183.0)


def R(z, off=0.0):
    return float(W.rx(z)) + off


def E(z, back):
    """x of a point `back` metres inland from the east bank at z (negative = out on the water)."""
    return float(W.rx(z)) + float(W.hw(z)) + back


def Wb(z, back):
    """The same from the west bank."""
    return float(W.rx(z)) - float(W.hw(z)) - back


#       t     camera x, y, z                     looking at x, y, z                 fov
KEYS = [
    # --- spring: from above the blossom down into the orchard
    [0.0,   -47.0, 12.5, -86.0,                  -2.0, 2.0, -8.0,                   54],
    [6.0,   -41.0, 11.0, -74.0,                  -2.0, 2.0, -6.0,                   54],
    [14.0,  -27.0, 5.5, -52.0,                   -3.5, 1.6, -3.0,                   55],
    [21.0,  -15.0, 2.4, -33.0,                   -4.0, 1.4, -2.6,                   56],
    [27.0,  -5.0, 1.8, -19.5,                    -3.6, 1.3, -3.0,                   54],
    [31.5,  2.6, 1.7, -11.0,                     -1.0, 1.1, -2.0,                   55],
    [36.0,  7.0, 1.7, -1.0,                      R(40), 1.2, 40.0,                  56],
    [41.0,  R(20, -7.5), 1.9, 18.0,              R(58, 8), 1.5, 58.0,               56],
    # --- summer: the open reach
    [47.0,  R(34, -2.0), 1.7, 34.0,              E(72, 8), 1.4, 74.0,               56],
    [53.0,  R(50, -1.5), 2.0, 50.0,              E(80, 10), 1.4, 84.0,              55],
    [58.0,  R(62, -1.0), 1.6, 62.0,              R(92, 2.0), 1.4, 94.0,             55],
    [63.0,  R(74, 1.5), 3.0, 74.0,               Wb(106, 6), 1.8, 106.0,            56],
    [68.0,  R(86, 2.0), 5.2, 86.0,               Wb(110, 14), 1.6, 110.0,           56],
    [72.0,  R(97, -1.0), 3.0, 97.0,              Wb(116, 10), 1.0, 118.0,           55],
    [80.0,  R(113, -2.8), 1.4, 113.0,            R(118, 1.2), 0.6, 118.5,           55],
    [86.0,  R(128, -3.0), 1.4, 128.0,            R(126, 1.2), 0.6, 126.0,           56],
    [90.0,  R(139, -1.8), 1.5, 139.0,            R(158), 1.8, 158.0,                55],
    [92.5,  R(146, -0.5), 1.5, 146.0,            R(170), 2.4, 172.0,                58],
    [95.0,  R(155.5), 1.5, 155.5,                R(190), 3.2, 190.0,                58],
    # --- autumn: the wide water, then ashore under the poplars into the farm orchard
    [100.0, R(170, -2.0), 1.6, 170.0,            E(210, 2), 6.0, 210.0,             60],
    [105.5, E(186, -8), 1.7, 186.0,              E(222, 8), 5.0, 222.0,             60],
    [110.0, E(198, -1), 1.8, 198.0,              E(232, 12), 3.0, 232.0,            58],
    [115.0, E(210, 9), 1.8, 210.0,               E(244, 13), 1.5, 244.0,            56],
    [121.0, E(224, 11), 1.8, 224.0,              E(252, 13), 2.0, 252.0,            56],
    [127.0, E(233, 13), 2.2, 233.0,              E(256, 12), 3.5, 256.0,            56],
    # --- the wind; up over the yard into the mist
    [133.0, E(236, 18), 8.0, 236.0,              E(250, 6), 10.0, 256.0,            58],
    [139.0, E(230, 24), 22.0, 230.0,             E(236, -10), 6.0, 244.0,           58],
    [145.0, E(236, 34), 20.0, 236.0,             E(240, 6), 2.0, 240.0,             58],
    # --- winter: down onto the snow, the gate and its magpie
    [149.0, E(243, 40), 5.0, 243.0,              E(240, 10), 1.5, 240.0,            56],
    [152.0, E(242.3, 33), 1.9, 242.3,            E(240, 22), 1.2, 240.3,            52],
    [154.6, E(241.6, 28.6), 1.65, 241.6,         E(240, 22), 1.3, 240.3,            48],
    [158.5, E(240.2, 21), 4.6, 240.2,            E(236, -14), 4.0, 233.0,           54],
    # --- beside the old apple tree on the bank: sunset on the ice, the lamps, the rain, the thaw
    [162.5, E(237.4, 13.5), 2.3, 237.4,          E(232, -45), 5.5, 228.0,           56],
    [167.0, E(TZ - 3.0, 9.6), 2.0, TZ - 3.0,     E(230, -62), 7.0, 226.0,           56],
    [176.0, E(TZ - 2.8, 9.4), 2.0, TZ - 2.8,     E(234, -62), 9.0, 232.0,           55],
    # --- blossom; and back, and up: the whole reach in spring
    [182.0, E(TZ - 3.5, 12.0), 2.8, TZ - 3.5,    E(236, -60), 8.0, 236.0,           55],
    [191.0, E(TZ - 7.0, 27.0), 9.5, TZ - 7.0,    E(238, -50), 5.0, 240.0,           56],
    [DUR,   E(TZ - 11.0, 43.0), 17.0, TZ - 11.0, E(240, -40), 4.0, 242.0,           56],
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
_tt = np.linspace(0, DUR, 900)
_pp = np.array([PATH.at(t)[:3] for t in _tt])


def clear_of_path(x, z, r):
    """True if (x, z) is at least r metres from the camera track, wherever the camera is low
    enough for a tree standing there to come close to the lens."""
    g = W.ground(_pp[:, 0], _pp[:, 2])
    low = (_pp[:, 1] - g) < 11.0
    d2 = (_pp[low, 0] - x) ** 2 + (_pp[low, 2] - z) ** 2
    return d2.min() > r * r


# ------------------------------------------------------------------ light
key(0.0, sun=sundir(118, 34), zen=c(88, 142, 218), mid=c(140, 186, 234), hor=c(212, 228, 240),
    cover=0.40, cloud_lit=c(255, 252, 244), cloud_sh=c(200, 208, 234), glow=c(255, 240, 210), glow_wide=0.10, glow_tight=0.22,
    haze=c(200, 214, 232), hazesun=c(240, 232, 220), vis=520.0, hazemax=0.9,
    water_tint=np.array([0.30, 0.46, 0.40, 0.20]), deep=c(58, 104, 96), wind=0.9, wind_dir=0.5, glitter=0.5,
    fade=1.0, fade_rgb=c(250, 244, 238), cloudsh=1.0)
key(0.7, fade=0.92)
key(3.6, fade=0.0)
key(38.0)
# summer noon
key(46.0, sun=sundir(185, 58), zen=c(70, 128, 214), mid=c(120, 172, 228), hor=c(196, 220, 232), cover=0.26,
    haze=c(176, 206, 204), hazesun=c(228, 232, 196), vis=330.0, hazemax=0.82,
    water_tint=np.array([0.12, 0.33, 0.26, 0.30]), deep=c(30, 80, 66), wind=0.65, glitter=0.9, mirror_gain=0.88, cloudsh=0.7)
key(92.0)
# autumn, late afternoon: gold on the poplars, the sky deep and clear
key(97.0, sun=sundir(250, 22), zen=c(56, 116, 206), mid=c(118, 176, 222), hor=c(236, 216, 176), cover=0.30,
    cloud_lit=c(255, 228, 184), cloud_sh=c(190, 154, 184), glow=c(255, 212, 140), glow_wide=0.20, glow_tight=0.45,
    haze=c(216, 194, 186), hazesun=c(255, 216, 156), vis=520.0, hazemax=0.9, light=c(255, 250, 236),
    water_tint=np.array([0.36, 0.44, 0.50, 0.10]), deep=c(40, 84, 112), wind=1.1, glitter=0.8, mirror_gain=0.95, cloudsh=0.9)
key(126.0)
key(133.0, wind=1.8)
# the mist
key(140.5, vis=30.0, hazemax=1.0, cloudsh=0.0, haze=c(236, 226, 230), hazesun=c(250, 234, 222), mist=1.0, cover=0.6, wind=0.7, snow=0.12)
key(144.5, vis=36.0, sun=sundir(246, 7.0), zen=c(126, 164, 214), mid=c(208, 208, 216), hor=c(250, 216, 176),
    cloud_lit=c(255, 216, 192), cloud_sh=c(178, 154, 192), cover=0.36, glow=c(255, 172, 96), glow_wide=0.32, glow_tight=0.7,
    light=c(255, 240, 222), shade=c(236, 242, 255), water_tint=np.array([0.50, 0.50, 0.62, 0.14]), deep=c(62, 72, 122),
    sun_col=c(255, 150, 70), snow=0.3)
# winter afternoon: rose light on the snow, blue shadows
key(149.5, vis=420.0, hazemax=0.93, haze=c(228, 208, 216), hazesun=c(255, 198, 152), mist=0.22, sundisc=1.0, glitter=1.0,
    wind=0.45, snow=0.20)
key(157.0, sun=sundir(246, 4.6), sun_col=c(255, 132, 62), hor=c(252, 198, 152), snow=0.25)
# sunset; the lamps are lit; snow thickens
key(164.0, sun=sundir(246, 1.0), zen=c(84, 104, 172), mid=c(170, 136, 180), hor=c(246, 156, 110), cloud_lit=c(252, 156, 124),
    cloud_sh=c(128, 110, 166), cover=0.46, glow=c(255, 124, 72), glow_wide=0.30, glow_tight=0.5, light=c(196, 180, 204),
    shade=c(150, 160, 220), haze=c(160, 138, 180), hazesun=c(238, 156, 124), sun_col=c(250, 98, 58), sundisc=0.75, lamps=0.7,
    snow=0.6, glitter=0.5, mist=0.3, deep=c(44, 50, 104), ground=c(170, 150, 180))
# blue hour: the snow turns to rain
key(169.0, sun=sundir(246, -2.0), zen=c(58, 74, 132), mid=c(96, 100, 150), hor=c(150, 124, 150), cloud_lit=c(138, 128, 164),
    cloud_sh=c(74, 80, 128), cover=0.80, glow_wide=0.05, glow_tight=0.05, light=c(140, 146, 190), shade=c(112, 124, 186),
    haze=c(96, 104, 150), hazesun=c(140, 124, 150), sundisc=0.0, lamps=1.0, snow=0.25, rain=0.7, glitter=0.15, mist=0.35,
    deep=c(34, 44, 92), water_tint=np.array([0.36, 0.40, 0.56, 0.16]), ground=c(84, 92, 138), vis=300.0, wind=0.8)
key(172.5, sun=sundir(110, -2.0), zen=c(64, 84, 140), mid=c(110, 120, 164), hor=c(164, 150, 170), cloud_lit=c(160, 154, 182),
    cloud_sh=c(86, 94, 140), cover=0.82, light=c(150, 158, 196), shade=c(118, 132, 190), haze=c(118, 128, 166),
    hazesun=c(170, 150, 166), lamps=0.9, snow=0.0, rain=1.0, mist=0.4, deep=c(36, 56, 96), ground=c(100, 110, 150))
# the rain thins and the morning comes up behind us: a sun-shower, and everything opening
key(177.0, sun=sundir(110, 9.0), zen=c(98, 148, 214), mid=c(170, 198, 230), hor=c(250, 226, 204), cloud_lit=c(255, 232, 214),
    cloud_sh=c(170, 170, 206), cover=0.56, glow=c(255, 226, 190), glow_wide=0.16, glow_tight=0.3, light=c(255, 244, 228),
    shade=c(236, 240, 255), haze=c(210, 214, 230), hazesun=c(250, 230, 210), lamps=0.0, rain=0.35, mist=0.25, glitter=0.9,
    deep=c(52, 100, 104), water_tint=np.array([0.30, 0.46, 0.42, 0.18]), ground=c(229, 219, 198), vis=460.0, wind=0.9,
    sun_col=c(255, 240, 210))
key(182.0, sun=sundir(116, 24.0), zen=c(88, 142, 218), mid=c(140, 186, 234), hor=c(214, 228, 240), cloud_lit=c(255, 252, 244),
    cloud_sh=c(200, 208, 234), cover=0.40, glow=c(255, 240, 210), glow_wide=0.10, glow_tight=0.22, light=c(255, 255, 255),
    shade=c(255, 255, 255), haze=c(200, 214, 232), hazesun=c(240, 232, 220), rain=0.0, mist=0.0, vis=560.0, hazemax=0.9,
    cloudsh=0.8, fade=0.0, fade_rgb=c(250, 244, 238))
key(197.6, fade=0.0)
key(200.3, fade=1.0)


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
_FOLLOW[:, 0] += SH
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
    w = float(smooth(52.0 + SH, 57.5 + SH, t) * smooth(77.0 + SH, 70.5 + SH, t))
    if w <= 0:
        return C, T
    Cb, Tb, (tx, tz) = _rig_pos(t)
    Cn = C * (1 - w) + Cb * w
    T_REL = 68.0 + SH
    if t <= T_REL:
        db = (Tb - Cn) / np.linalg.norm(Tb - Cn)
    else:
        # past the boat the gaze is not dragged round after it: it swings forward at an even rate
        if not _G68:
            c0, t0, (ax, az) = _rig_pos(T_REL)
            v = (t0 - c0) / np.linalg.norm(t0 - c0)
            _G68['phi'] = float(np.arctan2(v[0] * az - v[2] * ax, v[0] * ax + v[2] * az))
            _G68['pitch'] = float(v[1])
        u = (t - T_REL) / 7.6
        k = 1.0 - min(max(u, 0.0), 1.0) ** 1.15
        phi = _G68['phi'] * k
        cph, sph = np.cos(phi), np.sin(phi)
        db = np.array([tx * cph + tz * sph, _G68['pitch'] * k, tz * cph - tx * sph])
        db /= np.linalg.norm(db)
    wt = float(smooth(52.5 + SH, 58.0 + SH, t) * smooth(77.0 + SH, 73.5 + SH, t))
    da = (T - Cn) / np.linalg.norm(T - Cn)
    d = da * (1 - wt) + db * wt
    d /= np.linalg.norm(d)
    return Cn, Cn + d * 12.0


def _rig(t, C, T):
    C, T = _follow(t, C, T)
    import sc_poplars
    tf = sc_poplars.T_FLY
    if tf - 1.7 < t < tf + 9.8:
        # the eye goes with the magpie when it leaves the gate
        from engine import smooth
        w = 0.8 * float(smooth(tf - 0.6, tf + 1.4, t) * smooth(tf + 8.3, tf + 3.3, t))
        if w > 0:
            pos, _, _ = sc_poplars.magpie_pos(t)
            da = (T - C) / np.linalg.norm(T - C)
            db = (pos + np.array([-2.0, -1.2, 0.0]) - C)
            db /= np.linalg.norm(db)
            d = da * (1 - w) + db * w
            T = C + d / np.linalg.norm(d) * 14.0
    return C, T


PATH.post = _rig
