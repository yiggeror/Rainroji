"""The lay of the land: one river running north through a year.

    z  -90 ..  60   spring   an orchard in blossom on the west bank
    z   70 .. 150   summer   a narrow green reach under overhanging trees
    z  152          the bridge
    z  160 .. 330   autumn   the river widens; a long line of poplars on the east bank
                    winter   ... and the same reach again, after the mist, under snow
"""
import numpy as np
from scipy.interpolate import PchipInterpolator, CubicSpline
from engine import smooth, noise

NOW = 0.0                       # film time, set for every frame (the seasons turn in time too)
Z_BRIDGE = 152.0

# The year on the poplar reach (film seconds).  Nothing switches: every change is a slow one.
T_FALL = (128.0, 140.5)          # a wind takes the leaves, a few at first and then all of them
T_WINTER = (140.0, 146.5)       # frost on the twigs, snow on the ground
T_THAW = (167.5, 175.5)         # the spring rain: ice and snow go
T_BLOOM = (172.0, 181.0)        # leaf and blossom open


def _ramp(T):
    return float(smooth(T[0], T[1], NOW))


def fall():
    return _ramp(T_FALL)


def winter():
    return _ramp(T_WINTER)


def thaw():
    return _ramp(T_THAW)


def bloom():
    return _ramp(T_BLOOM)


def snowcover():
    return winter() * (1.0 - thaw())


_RZ = np.array([-200, -80, 0, 40, 80, 115, 150, 185, 225, 265, 310, 360, 500], np.float64)
_RX = np.array([34, 30, 22, 15, 7, -3, 4, 10, 2, -14, -6, 8, 20], np.float64)
_rx = CubicSpline(_RZ, _RX)
_HZ = np.array([-200, 40, 70, 88, 140, 152, 175, 210, 260, 330, 500], np.float64)
_HW = np.array([10, 9.5, 8.0, 7.4, 7.4, 6.9, 13, 20, 23, 26, 26], np.float64)
_hw = PchipInterpolator(_HZ, _HW)
_zs = np.linspace(-200, 500, 2801)
_rxs = _rx(_zs)
_dxs = _rx(_zs, 1)
_hws = _hw(_zs)


def rx(z):
    return np.interp(z, _zs, _rxs)


def rslope(z):
    return np.interp(z, _zs, _dxs)


def hw(z):
    return np.interp(z, _zs, _hws)


def edge(x, z):
    """Signed distance to the water's edge: negative on the water, positive on land.
    The edge wanders a little so that no bank is a ruled line."""
    c = 1.0 / np.sqrt(1.0 + rslope(z) ** 2)
    d = np.abs(x - rx(z)) * c - hw(z)
    return d + 1.6 * (noise(x / 23.0, z / 23.0, 1) - 0.5) + 0.5 * (noise(x / 5.0, z / 5.0, 2) - 0.5)


def side(x, z):
    return np.sign(x - rx(z))


def season(z):
    """0 spring, 1 summer, 2 autumn, 3 winter."""
    z = np.asarray(z, np.float64)
    return smooth(52.0, 92.0, z) + smooth(146.0, 162.0, z) + winter() * smooth(150.0, 162.0, z)


def ground(x, z, d=None):
    """Height of the land (metres above the water)."""
    if d is None:
        d = edge(x, z)
    dd = np.maximum(d, 0.0)
    h = 0.45 * smooth(0.0, 2.2, dd) + 0.012 * np.minimum(dd, 80.0)
    h = h + 0.5 * (noise(x / 37.0, z / 37.0, 0) - 0.5) * smooth(3.0, 25.0, dd)
    # the orchard climbs gently away from the river
    west = (x < rx(z))
    h = h + np.where(west, 0.045 * np.minimum(dd, 90.0) * (1 - smooth(30.0, 75.0, z)), 0.0)
    # the village across the poplar reach climbs a hillside, its church at the top
    h = h + np.where(west, 0.15 * np.clip(dd - 4.0, 0.0, 75.0) * smooth(196.0, 222.0, z) * smooth(298.0, 270.0, z), 0.0)
    return h


def river_tangent(z):
    s = rslope(z)
    n = np.sqrt(1 + s * s)
    return s / n, 1.0 / n
