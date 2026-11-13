"""The people of the film, painted as Monet paints them: a few touches, no faces,
but the weight and the gesture right."""
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise
from rig import Part, rx, ry, rz
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
    """A woman in a white dress sitting in the grass under the blossom, reading."""
    skirt = Part(rng).ell((0, 0.20, 0.30), (0.62, 0.22, 0.72), 95, WHITE_SH, WHITE_LI, 0.20, flow=(0.2, -0.3, 1.0), occ_lo=0.45) \
        .ell((0.05, 0.30, 0.15), (0.40, 0.20, 0.42), 40, WHITE_SH, WHITE_LI, 0.16, flow=(0.3, -0.2, 1.0)).done()
    torso = Part(rng).ell((0, 0.27, 0.0), (0.185, 0.30, 0.14), 46, WHITE_SH, WHITE_LI, 0.12, flow=(0.1, 1.0, 0.0)) \
        .seg((-0.19, 0.48, 0.0), (-0.25, 0.20, 0.16), 0.085, WHITE_SH, WHITE_LI) \
        .seg((0.19, 0.48, 0.0), (0.25, 0.20, 0.16), 0.085, WHITE_SH, WHITE_LI) \
        .dab((0.0, 0.50, 0.10), (1, 0, 0), 0.20, 0.05, BLUE_SH[0], BLUE_LI[0]).done()          # a blue sash at the collar
    arms = Part(rng).seg((-0.25, 0.0, 0.0), (-0.07, -0.02, 0.24), 0.07, WHITE_SH, WHITE_LI) \
        .seg((0.25, 0.0, 0.0), (0.07, -0.02, 0.24), 0.07, WHITE_SH, WHITE_LI) \
        .dab((-0.06, -0.01, 0.27), (0, 0, 1), 0.07, 0.05, SKIN_SH[0], SKIN_LI[0]) \
        .dab((0.06, -0.01, 0.27), (0, 0, 1), 0.07, 0.05, SKIN_SH[0], SKIN_LI[0]).done()
    book = Part(rng).dab((-0.075, 0, 0), (0.2, 0.2, 1), 0.20, 0.13, (0.78, 0.76, 0.86), (1.0, 0.98, 0.9), n=(-0.3, 0.9, -0.2)) \
        .dab((0.075, 0, 0), (-0.2, 0.2, 1), 0.20, 0.13, (0.78, 0.76, 0.86), (1.0, 0.98, 0.9), n=(0.3, 0.9, -0.2)) \
        .dab((0.0, -0.03, 0), (0, 0.1, 1), 0.21, 0.035, (0.45, 0.2, 0.2), (0.75, 0.3, 0.26), bias=0.0).done()
    head = Part(rng).ell((0, 0.10, 0.0), (0.095, 0.115, 0.10), 16, SKIN_SH, SKIN_LI, 0.085, occ_lo=0.6) \
        .ell((0, 0.13, -0.05), (0.10, 0.10, 0.09), 14, HAIR, HAIR_LI, 0.08) \
        .ell((0, 0.215, 0.02), (0.235, 0.03, 0.235), 30, STRAW_SH, STRAW_LI, 0.11, flow=(1, 0, 0.3), occ_lo=0.7) \
        .ell((0, 0.255, 0.0), (0.115, 0.06, 0.115), 14, STRAW_SH, STRAW_LI, 0.09, flow=(1, 0, 0)) \
        .seg((-0.12, 0.225, 0.0), (0.12, 0.225, 0.0), 0.035, BLUE_SH, BLUE_LI, n=4, bias=0.02) \
        .seg((0.0, 0.22, -0.13), (0.03, 0.02, -0.26), 0.03, BLUE_SH, BLUE_LI, n=4, flex=0.10).done()
    y0 = props.gy(x, z)
    T0 = np.array([x, y0, z])
    Y = ry(yaw)

    def act(env):
        t = env.t
        if t > 60 or (env.C[0] - x) ** 2 + (env.C[2] - z) ** 2 > 120 ** 2:
            return []
        br = 0.012 * np.sin(t * 1.4)
        # she looks up from the page now and then, toward the child
        up = pulse(t, 13.0, 4.5, 0.42)
        lean = 0.20 - 0.10 * up
        turn = -0.55 * up
        page = pulse(t, 13.0, 1.2, 0.05)
        Mt = Y @ rx(lean + br)
        hip = T0 + Y @ np.array([0, 0.36, 0.0])
        sh = hip + Mt @ np.array([0, 0.50, 0.0])
        Mh = Y @ ry(turn) @ rx(0.34 - 0.36 * up + lean)
        Ma = Y @ rx(lean * 0.5) @ rz(0.0)
        hand = hip + Y @ np.array([0.0, 0.14 + 0.02 * up, 0.30])
        parts = [skirt.at(Y, T0), torso.at(Mt, hip), arms.at(Ma, hand + Y @ np.array([0, 0.02, -0.25])),
                 book.at(Y @ rx(-0.5 + 0.25 * page), hand + Y @ np.array([0, 0.03 + 0.04 * page, 0.04])),
                 head.at(Mh, sh)]
        return [(merge(parts), dict(sway=True))]
    return act, (x, z, 0.9)


def child(rng, x, z, yaw):
    """A small girl in pink reaching up for the falling petals."""
    dress = Part(rng).ell((0, 0.20, 0), (0.20, 0.24, 0.18), 46, PINK_SH, PINK_LI, 0.11, flow=(0.1, -1, 0.1), flex=0.02) \
        .ell((0, 0.06, 0), (0.25, 0.10, 0.23), 30, PINK_SH, PINK_LI, 0.11, flow=(1, -0.3, 0.2), flex=0.05) \
        .seg((-0.20, 0.36, -0.02), (0.20, 0.36, -0.02), 0.045, WHITE_SH, WHITE_LI, n=4, bias=0.02).done()
    legs = Part(rng).seg((-0.065, 0.0, 0), (-0.07, -0.30, 0.01), 0.055, DARK, DARK_LI).seg((0.065, 0.0, 0), (0.07, -0.30, 0.01), 0.055, DARK, DARK_LI).done()
    arm = Part(rng).seg((0, 0, 0), (0, 0.24, 0.03), 0.05, PINK_SH, PINK_LI).dab((0, 0.28, 0.035), (0, 1, 0), 0.06, 0.045, SKIN_SH[0], SKIN_LI[0]).done()
    head = Part(rng).ell((0, 0.085, 0.0), (0.085, 0.095, 0.09), 14, SKIN_SH, SKIN_LI, 0.075, occ_lo=0.6) \
        .ell((0, 0.11, -0.04), (0.095, 0.095, 0.085), 14, pal((150, 104, 70), (128, 88, 64)), pal((226, 176, 110), (240, 196, 130)), 0.07) \
        .seg((-0.02, 0.07, -0.09), (-0.03, -0.10, -0.12), 0.04, pal((150, 104, 70)), pal((226, 176, 110)), n=3, flex=0.06) \
        .ell((0, 0.175, 0.0), (0.16, 0.026, 0.16), 20, STRAW_SH, STRAW_LI, 0.085, flow=(1, 0, 0.3), occ_lo=0.7) \
        .ell((0, 0.205, 0.0), (0.09, 0.045, 0.09), 9, STRAW_SH, STRAW_LI, 0.07) \
        .seg((-0.09, 0.185, 0.0), (0.09, 0.185, 0.0), 0.03, pal((196, 60, 60)), pal((236, 96, 80)), n=3, bias=0.02).done()
    y0 = props.gy(x, z)

    def act(env):
        t = env.t
        if t > 60 or (env.C[0] - x) ** 2 + (env.C[2] - z) ** 2 > 120 ** 2:
            return []
        # she turns after the petals, rises on her toes, reaches with one hand and then the other
        turn = yaw + 0.9 * (noise(t * 0.10, 0.3, 1) - 0.5) * 2
        hop = 0.045 * max(0.0, np.sin(t * 2.1)) ** 2 * (0.4 + 0.6 * pulse(t, 6.5, 3.2))
        step = 0.25 * (noise(t * 0.07, 5.0, 2) - 0.5)
        Y = ry(turn)
        T = np.array([x + step * np.cos(turn), y0 + 0.33 + hop, z + step * 0.6])
        swayb = 0.06 * np.sin(t * 1.3)
        Mb = Y @ rz(swayb)
        ra = 0.45 * np.sin(t * 1.9) * 0.5 + 0.2
        la = 0.45 * np.sin(t * 1.9 + 2.2) * 0.5 + 0.2
        sh = T + Mb @ np.array([0, 0.36, 0])
        parts = [legs.at(Y, T - [0, hop * 0.3, 0]), dress.at(Mb, T),
                 arm.at(Mb @ rz(-0.5 - ra) @ rx(0.25), T + Mb @ np.array([-0.15, 0.34, 0])),
                 arm.at(Mb @ rz(0.45 + la) @ rx(0.3), T + Mb @ np.array([0.15, 0.34, 0])),
                 head.at(Y @ rx(-0.38 + 0.1 * np.sin(t * 0.9)) @ rz(swayb * 0.5), sh + [0, 0.02, 0])]
        return [(merge(parts), dict(sway=True))]
    return act, (x, z, 0.45)
