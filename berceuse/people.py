"""The people of the film, painted as Monet paints them: a few touches, no faces,
but the weight and the gesture right."""
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise
from rig import Part, rx, ry, rz, limb2, arm_ik
from life import merge
import props

WHITE_LI = pal((255, 252, 244), (252, 246, 236), (255, 248, 250), (246, 240, 246))
WHITE_SH = pal((172, 184, 228), (188, 190, 232), (204, 194, 226), (160, 176, 220))
PINK_LI = pal((250, 206, 210), (246, 190, 200), (255, 222, 220))
PINK_SH = pal((190, 150, 196), (176, 150, 204), (204, 160, 190))
BLUE_LI = pal((150, 180, 226), (132, 164, 216), (170, 196, 232))
BLUE_SH = pal((84, 100, 170), (72, 92, 160), (96, 104, 176))
SKIN_LI = pal((244, 208, 184), (238, 198, 176))
SKIN_SH = pal((196, 150, 160), (184, 142, 156))
HAIR = pal((92, 62, 60), (112, 76, 60), (74, 54, 66))
HAIR_LI = pal((170, 120, 84), (190, 140, 96))
STRAW_LI = pal((248, 226, 150), (240, 212, 132), (252, 236, 172))
STRAW_SH = pal((184, 156, 132), (170, 146, 140))
DARK = pal((60, 56, 84), (72, 60, 80))
DARK_LI = pal((110, 100, 130), (124, 108, 126))


def ease(t, t0, t1):
    return float(smooth(t0, t1, t))


def pulse(t, period, width, phase=0.0):
    """0..1 bump that comes round every `period` seconds and lasts `width` seconds."""
    u = (t / period + phase) % 1.0
    w = width / period
    return float(smooth(0.0, 0.3 * w, u) * smooth(w, 0.7 * w, u))


def reader(rng, x, z, yaw):
    """A woman in a white dress sitting in the grass under the blossom, reading.
    She sits on a pale blue cloth, her skirt spread to one side, a basket by her."""
    FOLD = pal((150, 164, 216), (166, 170, 222), (140, 156, 206))
    cloth = Part(rng).ell((0.05, 0.02, 0.3), (0.95, 0.02, 0.85), 0, pal((96, 116, 190), (110, 124, 196), (88, 104, 176)),
                          pal((150, 172, 228), (136, 160, 222), (166, 180, 232)), 0.22, flow=(1.0, 0, 0.3), occ_lo=0.85, cover=1.6).done()
    skirt = Part(rng).ell((0.14, 0.13, 0.34), (0.46, 0.15, 0.52), 0, WHITE_SH, WHITE_LI, 0.17, flow=(0.25, -0.25, 1.0), occ_lo=0.5) \
        .ell((0.0, 0.20, 0.06), (0.27, 0.19, 0.27), 0, WHITE_SH, WHITE_LI, 0.14, flow=(0.2, -0.8, 0.5), occ_lo=0.5) \
        .ell((-0.18, 0.10, 0.10), (0.34, 0.11, 0.34), 0, WHITE_SH, WHITE_LI, 0.16, flow=(-0.6, -0.2, 0.6), occ_lo=0.5) \
        .ell((0.42, 0.09, 0.78), (0.24, 0.09, 0.22), 0, WHITE_SH, WHITE_LI, 0.14, flow=(0.5, -0.2, 1.0), occ_lo=0.5)
    for k in range(9):                                    # the folds of the skirt, drawn in blue
        a = -0.6 + 0.26 * k
        p0 = np.array([0.06 * np.sin(a), 0.27, 0.10])
        p1 = np.array([0.16 + 0.55 * np.sin(a), 0.10, 0.36 + 0.55 * np.cos(a)])
        skirt.seg(p0 * 0.5 + p1 * 0.5 + [0, 0.07, 0], p1 + [0, 0.05, 0], 0.035, FOLD, FOLD, n=3, bias=0.015)
    skirt = skirt.done()
    torso = Part(rng).ell((0, 0.25, 0.0), (0.155, 0.27, 0.12), 0, WHITE_SH, WHITE_LI, 0.10, flow=(0.1, 1.0, 0.0)) \
        .ell((-0.17, 0.44, 0.0), (0.075, 0.08, 0.075), 0, WHITE_SH, WHITE_LI, 0.07) \
        .ell((0.17, 0.44, 0.0), (0.075, 0.08, 0.075), 0, WHITE_SH, WHITE_LI, 0.07) \
        .seg((-0.15, 0.04, 0.03), (0.15, 0.04, 0.03), 0.07, BLUE_SH, BLUE_LI, n=5, bias=0.02) \
        .seg((0.0, 0.04, -0.11), (0.05, -0.14, -0.20), 0.05, BLUE_SH, BLUE_LI, n=3, bias=0.02) \
        .seg((0.0, 0.50, 0.03), (0.0, 0.57, 0.02), 0.07, SKIN_SH, SKIN_LI, n=2).done()
    up, fo = limb2(rng, WHITE_SH, WHITE_LI, w=0.062, l=0.27, skin=(SKIN_SH[0], SKIN_LI[0]))
    book = Part(rng).dab((-0.08, 0, 0), (0.2, 0.2, 1), 0.21, 0.14, (0.80, 0.78, 0.88), (1.0, 0.98, 0.9), n=(-0.3, 0.9, -0.2)) \
        .dab((0.08, 0, 0), (-0.2, 0.2, 1), 0.21, 0.14, (0.80, 0.78, 0.88), (1.0, 0.98, 0.9), n=(0.3, 0.9, -0.2)) \
        .dab((0.0, -0.025, 0.02), (0, 0.1, 1), 0.22, 0.03, (0.50, 0.20, 0.22), (0.80, 0.30, 0.28), bias=0.0).done()
    head = Part(rng).ell((0, 0.10, 0.012), (0.090, 0.108, 0.098), 0, SKIN_SH, SKIN_LI, 0.07, occ_lo=0.6) \
        .ell((0, 0.125, -0.045), (0.098, 0.10, 0.09), 0, HAIR, HAIR_LI, 0.07) \
        .ell((0, 0.07, -0.11), (0.06, 0.055, 0.055), 0, HAIR, HAIR_LI, 0.055) \
        .ell((0, 0.205, -0.01), (0.20, 0.024, 0.20), 0, STRAW_SH, STRAW_LI, 0.095, flow=(1, 0, 0.3), occ_lo=0.7) \
        .ell((0, 0.24, -0.015), (0.105, 0.055, 0.105), 0, STRAW_SH, STRAW_LI, 0.08, flow=(1, 0, 0)) \
        .seg((-0.105, 0.214, -0.01), (0.105, 0.214, -0.01), 0.032, BLUE_SH, BLUE_LI, n=4, bias=0.02) \
        .seg((0.0, 0.21, -0.115), (0.03, 0.03, -0.24), 0.028, BLUE_SH, BLUE_LI, n=4, flex=0.10) \
        .seg((0.03, 0.21, -0.115), (-0.04, 0.08, -0.27), 0.026, BLUE_SH, BLUE_LI, n=3, flex=0.12).done()
    WK_SH = pal((110, 80, 70), (124, 90, 74))
    WK_LI = pal((214, 170, 110), (226, 186, 124))
    basket = Part(rng).ell((0, 0.13, 0), (0.21, 0.13, 0.15), 0, WK_SH, WK_LI, 0.07, flow=(1, 0.15, 0)) \
        .seg((-0.17, 0.22, 0.0), (0.0, 0.40, 0.0), 0.022, WK_SH, WK_LI, n=3).seg((0.0, 0.40, 0.0), (0.17, 0.22, 0.0), 0.022, WK_SH, WK_LI, n=3) \
        .ell((0.0, 0.25, 0.0), (0.15, 0.03, 0.10), 0, WHITE_SH, WHITE_LI, 0.07).done()
    y0 = props.gy(x, z)
    T0 = np.array([x, y0, z])
    Y = ry(yaw)

    def act(env):
        t = env.t
        if t > 60 or (env.C[0] - x) ** 2 + (env.C[2] - z) ** 2 > 120 ** 2:
            return []
        br = 0.012 * np.sin(t * 1.4)
        # she looks up from the page now and then, toward the child
        up_ = pulse(t, 13.0, 4.5, 0.42)
        lean = 0.16 - 0.10 * up_
        turn = -0.60 * up_
        page = pulse(t, 13.0, 1.2, 0.05)
        Mt = Y @ rx(lean + br)
        hip = T0 + Y @ np.array([0, 0.30, 0.0])
        sh = hip + Mt @ np.array([0, 0.55, 0.0])
        Mh = Y @ ry(turn) @ rx(0.42 - 0.40 * up_ + lean)
        hand = hip + Y @ np.array([0.0, 0.17 + 0.02 * up_, 0.34])
        parts = [cloth.at(Y, T0), skirt.at(Y, T0), torso.at(Mt, hip),
                 book.at(Y @ rx(-0.55 + 0.25 * page), hand + Y @ np.array([0, 0.02 + 0.04 * page, 0.02])),
                 head.at(Mh, sh), basket.at(Y @ ry(0.5), T0 + Y @ np.array([-0.95, 0.0, 0.05]))]
        for sgn in (-1, 1):
            S = hip + Mt @ np.array([sgn * 0.18, 0.44, 0.0])
            H = hand + Y @ np.array([sgn * (0.10 - 0.05 * page * (sgn > 0)), 0.0 + 0.06 * page * (sgn > 0), -0.02])
            parts += arm_ik(up, fo, S, H, pole=Y @ np.array([sgn * 0.8, -0.6, -0.3]), l=0.27)
        return [(merge(parts), dict(sway=True))]
    return act, (x, z, 1.0)


def child(rng, x, z, yaw):
    """A small girl in a pink frock and white pinafore, bare-headed, reaching up for the falling petals."""
    FAIR = pal((170, 120, 70), (150, 104, 64))
    FAIR_LI = pal((240, 200, 130), (250, 214, 150))
    STK = pal((176, 180, 214), (190, 190, 222))
    STK_LI = pal((250, 246, 240), (255, 250, 244))
    dress = Part(rng).ell((0, 0.21, 0), (0.16, 0.20, 0.135), 0, PINK_SH, PINK_LI, 0.09, flow=(0.1, -1, 0.1), flex=0.01) \
        .ell((0, 0.05, 0), (0.24, 0.10, 0.22), 0, PINK_SH, PINK_LI, 0.10, flow=(1, -0.3, 0.2), flex=0.05) \
        .ell((0, 0.17, 0.085), (0.11, 0.20, 0.06), 0, WHITE_SH, WHITE_LI, 0.08, flow=(0, -1, 0.1), bias=0.02) \
        .seg((-0.10, 0.37, 0.03), (0.10, 0.37, 0.03), 0.045, WHITE_SH, WHITE_LI, n=4, bias=0.03) \
        .seg((-0.12, 0.12, -0.10), (0.12, 0.12, -0.10), 0.05, WHITE_SH, WHITE_LI, n=3, bias=0.02, flex=0.03) \
        .ell((-0.145, 0.34, 0.0), (0.06, 0.06, 0.06), 0, PINK_SH, PINK_LI, 0.06).ell((0.145, 0.34, 0.0), (0.06, 0.06, 0.06), 0, PINK_SH, PINK_LI, 0.06) \
        .seg((0.0, 0.40, 0.01), (0.0, 0.445, 0.01), 0.055, SKIN_SH, SKIN_LI, n=2).done()
    legs = Part(rng).seg((-0.06, 0.0, 0), (-0.065, -0.24, 0.005), 0.05, STK, STK_LI).seg((0.06, 0.0, 0), (0.065, -0.24, 0.005), 0.05, STK, STK_LI) \
        .dab((-0.065, -0.285, 0.03), (0, 0, 1), 0.11, 0.06, DARK[0], DARK_LI[0]).dab((0.065, -0.285, 0.03), (0, 0, 1), 0.11, 0.06, DARK[0], DARK_LI[0]).done()
    up, fo = limb2(rng, PINK_SH, PINK_LI, w=0.05, l=0.17, skin=(SKIN_SH[0], SKIN_LI[0]))
    fo = limb2(rng, SKIN_SH, SKIN_LI, w=0.044, l=0.17, skin=(SKIN_SH[0], SKIN_LI[0]))[1]
    head = Part(rng).ell((0, 0.085, 0.01), (0.082, 0.092, 0.088), 0, SKIN_SH, SKIN_LI, 0.065, occ_lo=0.6) \
        .ell((0, 0.11, -0.03), (0.092, 0.092, 0.085), 0, FAIR, FAIR_LI, 0.065) \
        .seg((-0.07, 0.07, -0.05), (-0.085, -0.07, -0.07), 0.045, FAIR, FAIR_LI, n=3, flex=0.05) \
        .seg((0.07, 0.07, -0.05), (0.085, -0.07, -0.07), 0.045, FAIR, FAIR_LI, n=3, flex=0.05) \
        .seg((0.0, 0.08, -0.085), (0.0, -0.09, -0.10), 0.06, FAIR, FAIR_LI, n=3, flex=0.06) \
        .dab((-0.035, 0.195, -0.01), (-1, 0.5, 0), 0.085, 0.05, (0.72, 0.16, 0.20), (0.95, 0.30, 0.28), bias=0.03) \
        .dab((0.035, 0.195, -0.01), (1, 0.5, 0), 0.085, 0.05, (0.72, 0.16, 0.20), (0.95, 0.30, 0.28), bias=0.03).done()
    y0 = props.gy(x, z)

    def act(env):
        t = env.t
        if t > 60 or (env.C[0] - x) ** 2 + (env.C[2] - z) ** 2 > 120 ** 2:
            return []
        # she turns after the petals, rises on her toes, reaches with one hand and then the other
        turn = yaw + 0.9 * (noise(t * 0.10, 0.3, 1) - 0.5) * 2
        reach = pulse(t, 5.2, 3.4)
        hop = 0.05 * max(0.0, np.sin(t * 2.6)) ** 2 * (0.3 + 0.7 * reach)
        step = 0.25 * (noise(t * 0.07, 5.0, 2) - 0.5)
        Y = ry(turn)
        T = np.array([x + step * np.cos(turn), y0 + 0.32 + hop, z + step * 0.6])
        swayb = 0.06 * np.sin(t * 1.3)
        Mb = Y @ rz(swayb) @ rx(-0.06 * reach)
        sh = T + Mb @ np.array([0, 0.445, 0.01])
        parts = [legs.at(Y, T - [0, hop * 0.4, 0]), dress.at(Mb, T),
                 head.at(Y @ rx(-0.15 - 0.35 * reach + 0.08 * np.sin(t * 0.9)) @ rz(swayb * 0.5), sh)]
        for sgn, ph in ((-1, 0.0), (1, 2.3)):
            S = T + Mb @ np.array([sgn * 0.15, 0.35, 0.0])
            u = 0.5 + 0.5 * np.sin(t * 1.7 + ph)
            hi = Mb @ np.array([sgn * (0.16 + 0.05 * u), 0.26 + 0.07 * u, 0.12])       # reaching up
            lo = Mb @ np.array([sgn * 0.07, -0.30, 0.04])                              # hanging by her side
            k = reach * (0.55 + 0.45 * u)
            H = S + lo * (1 - k) + hi * k
            parts += arm_ik(up, fo, S, H, pole=Mb @ np.array([sgn * 1.0, -0.4, -0.3]), l=0.17)
        return [(merge(parts), dict(sway=True))]
    return act, (x, z, 0.45)
