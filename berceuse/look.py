"""The light of the film: every colour of sky, air and water is keyed over film time."""
import math
import numpy as np

F = np.float32


def c(*rgb):
    return np.array(rgb, F) / 255.0


def sundir(az, el):
    a, e = math.radians(az), math.radians(el)
    return np.array([math.sin(a) * math.cos(e), math.sin(e), math.cos(a) * math.cos(e)])


_BASE = dict(
    sun=sundir(120, 38),
    zen=c(104, 150, 214), mid=c(156, 190, 228), hor=c(214, 220, 228),
    glow=c(255, 236, 200), glow_wide=0.10, glow_tight=0.25,
    cover=0.45, cloud_lit=c(250, 246, 236), cloud_sh=c(176, 180, 212), cloud_scale=1.0, cloud_op=0.92,
    light=c(255, 255, 255), shade=c(255, 255, 255),
    haze=c(196, 208, 226), hazesun=c(236, 226, 214), vis=420.0, hazemax=0.88,
    water_tint=np.array([0.18, 0.34, 0.30, 0.22], F), deep=c(46, 92, 82), mirror_gain=0.92, mirror_a=0.82,
    ripple=1.0, wind=1.0, wind_dir=0.6, sundisc=0.0, sun_col=c(255, 240, 210), stars=0.0,
    glitter=0.5, expo=1.0, sat=1.0, fade=0.0, fade_rgb=c(229, 219, 198),
)

KEYS = []          # (t, dict)


def key(t, **kw):
    prev = dict(KEYS[-1][1]) if KEYS else dict(_BASE)
    for k, v in kw.items():
        if k not in _BASE:
            raise KeyError(k)
        prev[k] = np.asarray(v, np.float64 if k == 'sun' else F) if not np.isscalar(v) else float(v)
    KEYS.append((float(t), prev))


def look(t):
    if not KEYS:
        return dict(_BASE)
    ts = [k[0] for k in KEYS]
    if t <= ts[0]:
        return dict(KEYS[0][1])
    if t >= ts[-1]:
        return dict(KEYS[-1][1])
    i = int(np.searchsorted(ts, t, side='right')) - 1
    a, b = KEYS[i][1], KEYS[i + 1][1]
    w = (t - ts[i]) / (ts[i + 1] - ts[i])
    w = w * w * (3 - 2 * w)
    out = {}
    for k in a:
        out[k] = a[k] * (1 - w) + b[k] * w
        if isinstance(out[k], np.ndarray) and k != 'sun':
            out[k] = out[k].astype(F)
    return out
