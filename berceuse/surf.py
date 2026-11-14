"""Water and land: the two endless surfaces of the film."""
import numpy as np
from engine import smooth, mix, noise, ramp, DASH, DAB, SCUM, LENS, pal
from core import Field, WATER, RIPPLE, GROUND, F
from sky import sky_rgb
import world as W

SHADOWS = []          # callables (env, x, z) -> 0..1 shade thrown on the ground / water
WATER_EXTRA = []      # callables (env, x, z, rnd, rgb) -> rgb  (scene specific colour in the water)


def shadow_at(env, x, z):
    s = np.zeros(len(x), F)
    for fn in SHADOWS:
        r = fn(env, x, z)
        if r is not None:
            s = 1 - (1 - s) * (1 - r)
    return s


def flat_dir(env, x, z, dist, h, Dw):
    """Strokes on a level surface: world aligned when seen from above, laid across the
    line of sight when the surface is seen at a grazing angle."""
    g = smooth(0.30, 0.75, h / dist)[:, None]
    D = np.asarray(Dw, np.float64) * g + env.rt[None, :] * (1 - g)
    D[:, 1] = 0
    return D / (np.linalg.norm(D, axis=1, keepdims=True) + 1e-9)


def jit(rgb, rnd, val=0.05, chroma=0.022):
    out = rgb * (1.0 + (rnd[:, 3:4] - 0.5) * 2 * val)
    out[:, 0] += (rnd[:, 4] - 0.5) * 2 * chroma
    out[:, 2] -= (rnd[:, 4] - 0.5) * 2 * chroma
    return out


# ----------------------------------------------------------------------------- water
def _water_rgb(env, x, z, rnd, dist):
    L = env.L
    t = env.t
    h = env.C[1]
    v = np.stack([x - env.C[0], np.full(len(x), -h), z - env.C[2]], axis=1) / dist[:, None]
    r = v * np.array([1.0, -1.0, 1.0])
    # the mirror is never perfect: each touch looks at a slightly different piece of sky
    r[:, 1] = np.abs(r[:, 1] + (rnd[:, 2] - 0.5) * 0.10) + 0.01
    r /= np.linalg.norm(r, axis=1, keepdims=True)
    skyc = sky_rgb(env, r, rnd, glow_k=0.45)
    cosi = h / dist
    Fr = 0.20 + 0.80 * (1 - cosi) ** 3
    flow = noise(x / 7.0 + 3.0, z / 34.0 - t * 0.02, 1)
    deep = L['deep'][None, :] * (0.75 + 0.5 * flow[:, None])
    rgb = mix(deep, skyc, Fr[:, None])
    return rgb, r, cosi, flow


def water_shader(lvl):
    def sh(env, x, z, rnd, dist):
        d = W.edge(x, z)
        m = d < 0.8
        if not m.any():
            return None
        L = env.L
        t = env.t
        rgb, r, cosi, flow = _water_rgb(env, x, z, rnd, dist)
        # under the banks the water takes the colour of what grows there
        wt = L['water_tint']
        bank = smooth(-9.0, 0.0, d) * wt[3] * 2.2
        rgb = mix(rgb, wt[None, :3] * (0.7 + 0.6 * flow[:, None]), np.clip(bank, 0, 0.85)[:, None])
        for fn in WATER_EXTRA:
            rgb = fn(env, x, z, rnd, rgb, d)
        sh_ = shadow_at(env, x, z)
        rgb = rgb * (1 - 0.30 * sh_[:, None])
        if lvl == 2:
            # ripples: small lights and darks that come and go
            ph = np.sin(t * (0.8 + 1.4 * rnd[:, 4]) + rnd[:, 5] * 6.28)
            keep = smooth(0.50, 0.75, rnd[:, 2] + 0.14 * ph)
            lite = rnd[:, 3] > 0.5
            spec = np.clip(r @ env.sun, 0, 1) ** 260
            glit = smooth(0.2, 0.8, spec * 4.0 + 0.3 * ph - rnd[:, 4] * 0.8) * L['glitter']
            c2 = np.where(lite[:, None], rgb * 1.10 + 0.05, rgb * 0.80)
            rgb = mix(c2, L['sun_col'][None, :], glit[:, None])
            a = np.maximum(keep * 0.75, glit) * m * L['ripple']
        else:
            a = (0.96 if lvl == 0 else 0.9) * m
        D = flat_dir(env, x, z, dist, env.C[1], (1.0, 0.0, 0.0))
        sway = np.sin(t * (0.6 + 0.6 * rnd[:, 4]) + rnd[:, 5] * 6.28)
        from core import haze_of
        vx = (x - env.C[0]) * env.sun[0] + (z - env.C[2]) * env.sun[2]
        rgb = haze_of(env, rgb, dist, vx / dist, 0.85)
        return dict(y=0.0, rgb=jit(rgb, rnd), a=a, D=D, kl=1.0 + 0.14 * sway,
                    spr=np.where(rnd[:, 1] < (0.3 if lvl == 0 else 0.08), SCUM, DASH) + (rnd[:, 5] * 4).astype(np.int32))
    return sh


# ----------------------------------------------------------------------------- land
GRASS = [
    # spring: new grass, yellow-green in the sun
    [(0.0, (88, 150, 96)), (0.3, (128, 180, 92)), (0.6, (170, 206, 104)), (0.85, (206, 222, 124)), (1.0, (232, 232, 150))],
    # summer: deep and full
    [(0.0, (40, 104, 76)), (0.3, (62, 132, 74)), (0.6, (96, 160, 70)), (0.85, (140, 186, 76)), (1.0, (196, 214, 104))],
    # autumn: olive, straw and rust
    [(0.0, (112, 118, 78)), (0.3, (150, 140, 76)), (0.6, (192, 160, 80)), (0.85, (226, 184, 96)), (1.0, (246, 214, 130))],
    # winter: snow - never white, always rose and cream in the light
    [(0.0, (206, 208, 232)), (0.3, (224, 222, 238)), (0.6, (240, 232, 232)), (0.85, (250, 240, 226)), (1.0, (255, 248, 232))],
]
GSHADE = pal((72, 140, 132), (38, 88, 92), (104, 96, 120), (132, 150, 214))      # shadow colour on each season's ground
FLOWERS = np.array([[(252, 224, 84), (255, 252, 240), (250, 236, 120), (255, 250, 236)],
                    [(250, 240, 150), (236, 96, 80), (255, 250, 240), (150, 150, 226)],
                    [(232, 120, 60), (246, 196, 80), (206, 96, 70), (250, 220, 120)]], np.float32) / 255.0
SHADE_AMT = np.array([0.72, 0.8, 0.7, 0.84], np.float32)
GSHADE2 = pal((88, 128, 170), (30, 70, 96), (128, 96, 132), (160, 160, 226))


def ground_rgb(env, x, z, rnd, d):
    s = W.season(z)
    v = 0.55 * noise(x / 26.0, z / 26.0, 0) + 0.45 * noise(x / 6.0 + 3.0, z / 6.0, 1)
    v = np.clip(v + (rnd[:, 2] - 0.5) * 0.5, 0, 1)
    k0 = np.clip(np.floor(s), 0, 2).astype(np.int32)
    w = s - k0
    # broken colour: each touch belongs wholly to one season or the other
    use = np.where(rnd[:, 0] < w, k0 + 1, k0)
    th = W.thaw()
    if th > 0:
        # the snow goes in patches, and what it uncovers is already green
        pat = 0.65 * noise(x / 13.0 + 2.0, z / 13.0, 3) + 0.35 * rnd[:, 4]
        use = np.where((use == 3) & (pat < th * 1.12 - 0.04), 0, use)
    rgb = np.zeros((len(x), 3), F)
    shc = np.zeros((len(x), 3), F)
    for k in range(4):
        mk = use == k
        if mk.any():
            rgb[mk] = ramp(GRASS[k], v[mk])
            shc[mk] = np.where(rnd[mk, 1:2] < 0.5, GSHADE[k], GSHADE2[k])
    sh = shadow_at(env, x, z)
    if env.L['cloudsh'] > 0.01:
        from core import cloud_shadow
        sh = 1 - (1 - sh) * (1 - 0.62 * env.L['cloudsh'] * cloud_shadow(env, x, z))
    shs = smooth(0.25, 0.75, sh + (rnd[:, 5] - 0.5) * 0.3)
    rgb = mix(rgb, shc * (0.85 + 0.3 * v[:, None]), (SHADE_AMT[np.clip(use, 0, 3)] * shs)[:, None])
    lit = 1 - shs
    rgb = rgb * (env.L['shade'][None, :] * (1 - lit[:, None]) + env.L['light'][None, :] * lit[:, None])
    return rgb, s, v, sh, use


def ground_shader(lvl):
    def sh(env, x, z, rnd, dist):
        d = W.edge(x, z)
        m = d > -0.6
        if not m.any():
            return None
        y = W.ground(x, z, d)
        rgb, s, v, shd, use = ground_rgb(env, x, z, rnd, d)
        # wet earth at the water's edge
        rgb = mix(rgb, np.array([0.36, 0.34, 0.30], F) * (1 + 0.0 * v[:, None]), (0.5 * smooth(0.9, 0.0, d) * (use < 3))[:, None])
        h = np.maximum(env.C[1] - y, 0.3)
        D = flat_dir(env, x, z, dist, h, (0.94, 0.0, 0.34))
        from core import haze_of
        vx = (x - env.C[0]) * env.sun[0] + (z - env.C[2]) * env.sun[2]
        rgb = haze_of(env, jit(rgb, rnd), dist, vx / dist)
        out = dict(y=y, rgb=rgb, a=0.96 * m, D=D,
                   spr=np.where(rnd[:, 1] < 0.25, SCUM, DASH) + (rnd[:, 5] * 4).astype(np.int32))
        if lvl >= 1:
            # blades of grass stand up; snow lies in soft level touches
            grassy = use < 3
            sc = env.f / np.maximum(dist, 0.3)
            up = np.clip(0.42 * sc / 60.0, 0.22, 1.0) * grassy
            g = env.wind(x, z)
            out['upright'] = up
            out['lean'] = 0.15 + 0.5 * g + (rnd[:, 4] - 0.5) * 0.5 + 0.12 * np.sin(env.t * (2.0 + rnd[:, 5]) + rnd[:, 2] * 6.28) * (0.3 + g)
            out['a'] = out['a'] * (0.9 if lvl == 1 else 0.8) * np.where(grassy, 1.0, 0.75)
            out['rgb'] = out['rgb'] * np.where(grassy, 0.92 + 0.22 * rnd[:, 3], 1.0)[:, None]
            if lvl == 2:
                # the flowers of each season, set down as single touches among the grass
                patch = smooth(0.45, 0.8, noise(x / 11.0 + 5.0, z / 11.0, 2)) * (0.4 + 0.6 * noise(x / 3.0, z / 3.0 + 2.0, 3))
                again = (z > 150.0) & (use == 0)            # spring come round again: flowers open with the blossom
                fl = (rnd[:, 3] < (0.012 + 0.20 * patch) * np.where(again, W.bloom(), 1.0)) & (use < 3) & (d > 0.5)
                k = np.clip(use, 0, 2).astype(np.int32)
                fc = FLOWERS[k, (rnd[:, 4] * 4).astype(np.int32) % 4]
                sun = 1 - 0.45 * smooth(0.3, 0.7, shd)
                out['rgb'] = np.where(fl[:, None], haze_of(env, fc * sun[:, None], dist, vx / dist, 0.8), out['rgb'])
                out['upright'] = np.where(fl, 0.0, out['upright'])
                out['kl'] = np.where(fl, 0.34 + 0.14 * rnd[:, 5], 1.0)
                out['kw'] = np.where(fl, 0.9, 1.0)
                out['spr'] = np.where(fl, DAB + (rnd[:, 5] * 4).astype(np.int32), out['spr'])
                out['a'] = np.where(fl, 0.95 * m, out['a'] * 0.8 * (rnd[:, 2] < 0.5))
        return out
    return sh


def build():
    return [
        Field(101, 46.0, water_shader(0), WATER, order=0.0),
        Field(102, 27.0, water_shader(1), WATER, order=1.0, kl=2.3),
        Field(103, 21.0, water_shader(2), RIPPLE, order=0.0, kl=2.1, kw=0.8),
        Field(201, 46.0, ground_shader(0), GROUND, order=0.0, yfun=W.ground),
        Field(202, 25.0, ground_shader(1), GROUND, order=1.0, kl=2.2, kw=1.0, yfun=W.ground),
        Field(203, 19.0, ground_shader(2), GROUND, order=2.0, kl=2.0, kw=1.0, yfun=W.ground),
    ]
