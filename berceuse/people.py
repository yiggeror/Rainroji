"""The people of the film, painted as Monet paints them: a few touches, no faces,
but the weight and the gesture right."""
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise
from rig import Part, rx, ry, rz, limb2, arm_ik
from life import merge
from trees import pick
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
        if (env.C[0] - x) ** 2 + (env.C[2] - z) ** 2 > 140 ** 2:
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


def swinger(rng, x, z, yaw, H=3.5, Lr=2.75):
    """A small girl on a swing hung in an apple tree.  She is carried by a pendulum, so nothing
    about her movement has to be invented: the ropes, her weight and her kicking legs agree."""
    FAIR = pal((170, 120, 70), (150, 104, 64))
    FAIR_LI = pal((240, 200, 130), (250, 214, 150))
    STK = pal((176, 180, 214), (190, 190, 222))
    STK_LI = pal((250, 246, 240), (255, 250, 244))
    ROPE = pal((120, 100, 90), (136, 110, 92))
    ROPE_LI = pal((226, 204, 160), (236, 214, 170))
    body = Part(rng)
    for sx in (-0.21, 0.21):
        body.seg((sx, 0.0, 0.0), (sx, Lr, 0.0), 0.028, ROPE, ROPE_LI, n=14, smin=2.0)
    body.seg((-0.24, -0.01, 0.0), (0.24, -0.01, 0.0), 0.11, ROPE, ROPE_LI, n=4)
    body.ell((0, 0.06, 0.09), (0.17, 0.075, 0.19), 0, PINK_SH, PINK_LI, 0.085, flow=(1, -0.2, 0.4), flex=0.03) \
        .ell((0, 0.24, 0.0), (0.105, 0.18, 0.085), 0, PINK_SH, PINK_LI, 0.075, flow=(0.1, -1, 0.1)) \
        .ell((0, 0.21, 0.06), (0.075, 0.15, 0.04), 0, WHITE_SH, WHITE_LI, 0.065, flow=(0, -1, 0.1), bias=0.02) \
        .seg((0.0, 0.41, 0.0), (0.0, 0.45, 0.0), 0.05, SKIN_SH, SKIN_LI, n=2)
    for sx in (-1, 1):
        body.seg((sx * 0.105, 0.37, 0.0), (sx * 0.175, 0.27, 0.07), 0.045, PINK_SH, PINK_LI, n=3) \
            .seg((sx * 0.175, 0.27, 0.07), (sx * 0.205, 0.40, 0.02), 0.038, SKIN_SH, SKIN_LI, n=3) \
            .dab((sx * 0.21, 0.42, 0.015), (0, 1, 0), 0.055, 0.045, SKIN_SH[0], SKIN_LI[0], bias=0.03)
    body.ell((0, 0.535, 0.01), (0.074, 0.084, 0.08), 0, SKIN_SH, SKIN_LI, 0.058, occ_lo=0.6) \
        .ell((0, 0.555, -0.028), (0.083, 0.083, 0.078), 0, FAIR, FAIR_LI, 0.058) \
        .seg((0.0, 0.53, -0.08), (0.0, 0.34, -0.12), 0.07, FAIR, FAIR_LI, n=4, flex=0.10) \
        .dab((-0.032, 0.635, -0.01), (-1, 0.5, 0), 0.075, 0.045, (0.72, 0.16, 0.20), (0.95, 0.30, 0.28), bias=0.03) \
        .dab((0.032, 0.635, -0.01), (1, 0.5, 0), 0.075, 0.045, (0.72, 0.16, 0.20), (0.95, 0.30, 0.28), bias=0.03)
    body = body.done()
    shin = Part(rng).seg((-0.055, 0.0, 0.0), (-0.055, -0.25, 0.0), 0.045, STK, STK_LI, n=4).seg((0.055, 0.0, 0.0), (0.055, -0.25, 0.0), 0.045, STK, STK_LI, n=4) \
        .dab((-0.055, -0.275, 0.03), (0, 0, 1), 0.10, 0.055, DARK[0], DARK_LI[0]).dab((0.055, -0.275, 0.03), (0, 0, 1), 0.10, 0.055, DARK[0], DARK_LI[0]).done()
    y0 = props.gy(x, z)
    piv = np.array([x, y0 + H, z])
    B = ry(yaw)
    om = np.sqrt(9.81 / Lr)

    def act(env):
        t = env.t
        if (env.C[0] - x) ** 2 + (env.C[2] - z) ** 2 > 140 ** 2:
            return []
        th = 0.46 * np.sin(om * t)
        M = B @ rx(-th)
        seat = piv + M @ np.array([0.0, -Lr, 0.0])
        kick = 0.15 + 0.75 * (0.5 + 0.5 * np.sin(om * t + 0.9))          # legs out in front going forward, tucked coming back
        knee = seat + M @ np.array([0.0, 0.02, 0.23])
        parts = [body.at(M, seat), shin.at(M @ rx(-kick), knee)]
        return [(merge(parts), dict(sway=True))]
    return act, (x, z, 0.5)


def painter(rng, x, z, yaw):
    """A painter at his easel under a white umbrella, on the bank, working at the motif across the water."""
    CREAM_SH = pal((170, 164, 200), (184, 172, 200))
    CREAM_LI = pal((250, 240, 216), (255, 246, 226))
    TR = pal((70, 76, 120), (84, 86, 128))
    TR_LI = pal((140, 150, 190), (156, 160, 196))
    WD = pal((96, 76, 80), (110, 84, 80))
    WD_LI = pal((206, 170, 120), (220, 184, 134))
    fig = Part(rng).ell((0, 0.44, 0.12), (0.17, 0.11, 0.26), 0, TR, TR_LI, 0.10, flow=(0, -0.2, 1)) \
        .seg((-0.09, 0.42, 0.34), (-0.10, 0.05, 0.42), 0.085, TR, TR_LI).seg((0.09, 0.42, 0.34), (0.10, 0.05, 0.42), 0.085, TR, TR_LI) \
        .dab((-0.10, 0.03, 0.47), (0, 0, 1), 0.2, 0.08, DARK[0], DARK_LI[0]).dab((0.10, 0.03, 0.47), (0, 0, 1), 0.2, 0.08, DARK[0], DARK_LI[0]) \
        .seg((-0.16, 0.0, -0.02), (-0.14, 0.38, 0.0), 0.04, WD, WD_LI, n=3).seg((0.16, 0.0, -0.02), (0.14, 0.38, 0.0), 0.04, WD, WD_LI, n=3) \
        .ell((0, 0.74, 0.0), (0.185, 0.29, 0.135), 0, CREAM_SH, CREAM_LI, 0.11, flow=(0.1, 1, 0)).done()
    head = Part(rng).ell((0, 0.10, 0.012), (0.090, 0.108, 0.098), 0, SKIN_SH, SKIN_LI, 0.07, occ_lo=0.6) \
        .ell((0, 0.03, 0.065), (0.075, 0.085, 0.055), 0, pal((170, 170, 190), (184, 180, 196)), pal((244, 240, 236), (250, 246, 240)), 0.06, bias=0.01) \
        .ell((0, 0.205, 0.0), (0.21, 0.024, 0.21), 0, STRAW_SH, STRAW_LI, 0.095, flow=(1, 0, 0.3), occ_lo=0.7) \
        .ell((0, 0.24, 0.0), (0.105, 0.055, 0.105), 0, STRAW_SH, STRAW_LI, 0.08).done()
    up, fo = limb2(rng, CREAM_SH, CREAM_LI, w=0.07, skin=(SKIN_SH[0], SKIN_LI[0]))
    gear = Part(rng)
    apex = np.array([0.0, 1.62, 1.02])
    for foot in ((-0.42, 0.0, 0.80), (0.42, 0.0, 0.80), (0.0, 0.0, 1.55)):
        gear.seg(foot, apex, 0.035, WD, WD_LI, n=8)
    gear.seg((-0.36, 0.86, 0.90), (0.36, 0.86, 0.90), 0.04, WD, WD_LI, n=4)
    m = 60
    P = np.stack([rng.uniform(-0.34, 0.34, m), rng.uniform(0.90, 1.42, m), 0.93 + 0.0 * np.arange(m)], axis=1)
    P[:, 2] += (P[:, 1] - 0.9) * 0.16
    cols = pal((250, 244, 230), (250, 244, 230), (150, 196, 120), (240, 180, 190), (150, 180, 230), (250, 220, 120), (250, 246, 236))
    c = pick(cols, rng.random(m))
    gear.sb.add(P, (1, 0.1, 0), 0.15, 0.085, DAB + rng.integers(0, 4, m), c * 0.8, c, N=np.tile([0.0, 0.3, -1.0], (m, 1)), smin=2.5, bias=0.02, haze=0.8)
    gear.seg((-0.62, 0.0, -0.25), (-0.5, 2.32, -0.05), 0.03, WD, WD_LI, n=10)
    gear.ell((-0.42, 2.34, 0.15), (1.02, 0.25, 1.02), 0, pal((176, 184, 230), (190, 190, 232), (166, 176, 224)), pal((255, 252, 244), (255, 246, 236)), 0.26,
             flow=(1, 0, 0.2), occ_lo=0.25, cover=2.2)
    gear = gear.done()
    pal_ = Part(rng).ell((0, 0, 0), (0.15, 0.015, 0.11), 0, WD, WD_LI, 0.07, flow=(1, 0, 0)).dab((0.04, 0.02, 0.03), (1, 0, 0), 0.05, 0.04, (0.9, 0.3, 0.3)) \
        .dab((-0.04, 0.02, 0.0), (1, 0, 0), 0.05, 0.04, (0.3, 0.5, 0.9)).dab((0.0, 0.02, -0.04), (1, 0, 0), 0.05, 0.04, (0.98, 0.9, 0.4)).done()
    brush = Part(rng).seg((0, 0, 0), (0, 0.02, 0.22), 0.015, WD, WD_LI, n=3).done()
    y0 = props.gy(x, z)
    T0 = np.array([x, y0, z])
    Y = ry(yaw)

    def act(env):
        t = env.t
        if (env.C[0] - x) ** 2 + (env.C[2] - z) ** 2 > 150 ** 2:
            return []
        look = pulse(t, 7.0, 2.6, 0.3)                    # he looks up at the motif, then back to the canvas
        lean = 0.10 + 0.05 * np.sin(t * 0.6)
        Mt = Y @ rx(lean)
        hip = T0 + Y @ np.array([0, 0.40, 0.0])
        sh = T0 + Y @ np.array([0, 0.44, 0.0]) + Mt @ np.array([0, 0.60, 0.0])
        hx = 0.10 + 0.16 * (noise(t * 0.35, 0.2, 0) - 0.5) * (1 - 0.7 * look)
        hy = 1.14 + 0.18 * (noise(t * 0.30, 3.0, 1) - 0.5) * (1 - 0.7 * look) + 0.012 * np.sin(t * 9.0) * (1 - look)
        hand = T0 + Y @ np.array([hx, hy, 0.74 - 0.10 * look])
        lhand = T0 + Y @ np.array([-0.24, 0.80, 0.30])
        parts = [gear.at(Y, T0), fig.at(Y, T0 + Y @ np.array([0, 0.0, 0.0])), head.at(Y @ ry(0.35 * look - 0.1) @ rx(0.18 - 0.22 * look), sh),
                 pal_.at(Y @ rz(0.3), lhand), brush.at(Y @ rx(-0.2), hand)]
        parts += arm_ik(up, fo, sh + Mt @ np.array([0.19, -0.10, 0.0]), hand, pole=Y @ np.array([0.7, -0.7, -0.2]))
        parts += arm_ik(up, fo, sh + Mt @ np.array([-0.19, -0.10, 0.0]), lhand, pole=Y @ np.array([-0.7, -0.6, -0.3]))
        return [(merge(parts), dict(sway=True))]
    return act, (x, z, 1.1)


def cow(rng, x, z, yaw, grazing=True, seed=0.0):
    """A Normandy cow: white with red-brown patches.  It grazes, lifts its head, switches its tail."""
    BR = pal((120, 62, 60), (134, 72, 62), (106, 56, 66))
    BR_LI = pal((206, 124, 86), (220, 140, 96), (190, 110, 84))
    WS = pal((176, 176, 214), (190, 184, 216))
    WL = pal((252, 246, 236), (255, 250, 240))
    body = Part(rng).ell((0, 0.98, 0.0), (0.33, 0.35, 0.84), 0, WS, WL, 0.20, flow=(0, -0.3, 1), occ_lo=0.45)
    for k in range(4):
        c = (rng.uniform(-0.15, 0.15), 0.98 + rng.uniform(-0.05, 0.2), rng.uniform(-0.6, 0.6))
        body.ell(c, (0.30, rng.uniform(0.2, 0.3), rng.uniform(0.25, 0.42)), 0, BR, BR_LI, 0.18, flow=(0, -0.3, 1), occ_lo=0.45, bias=0.01)
    for sx in (-0.2, 0.2):
        for sz in (-0.6, 0.58):
            body.seg((sx, 0.72, sz), (sx, 0.0, sz + 0.02), 0.085, WS if rng.random() < 0.5 else BR, WL if rng.random() < 0.6 else BR_LI, n=5)
    body.seg((0.0, 1.22, -0.84), (0.0, 0.52, -0.94), 0.04, BR, BR_LI, n=5, flex=0.25)
    body = body.done()
    head = Part(rng).seg((0, 0, 0), (0, -0.06, 0.42), 0.20, BR, BR_LI, n=3).ell((0, -0.10, 0.60), (0.12, 0.13, 0.23), 0, BR, BR_LI, 0.11, flow=(0, 0, 1)) \
        .dab((0, -0.13, 0.80), (1, 0, 0), 0.16, 0.11, (0.72, 0.62, 0.66), (0.98, 0.90, 0.86), bias=0.02) \
        .dab((-0.13, 0.0, 0.50), (-1, 0.3, 0), 0.12, 0.05, BR[0], BR_LI[0]).dab((0.13, 0.0, 0.50), (1, 0.3, 0), 0.12, 0.05, BR[0], BR_LI[0]).done()
    y0 = props.gy(x, z)
    T0 = np.array([x, y0, z])
    Y = ry(yaw)

    def act(env):
        t = env.t
        if (env.C[0] - x) ** 2 + (env.C[2] - z) ** 2 > 170 ** 2:
            return []
        if grazing:
            up_ = pulse(t, 17.0, 5.0, seed)
            ang = 1.0 - 0.95 * up_ + 0.05 * np.sin(t * 2.6 + seed * 9) * (1 - up_)
            turn = 0.5 * up_ * np.sin(seed * 20)
        else:
            ang = 0.05 + 0.05 * np.sin(t * 0.5 + seed)
            turn = 0.5 * np.sin(t * 0.17 + seed * 7)
        parts = [body.at(Y, T0), head.at(Y @ ry(turn) @ rx(ang), T0 + Y @ np.array([0, 1.18, 0.74]))]
        return [(merge(parts), dict(sway=True))]
    return act, (x, z, 1.0)
