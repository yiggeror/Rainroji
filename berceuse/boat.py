"""The skiff on the summer river: one girl rows, her sister trails a hand in the water.

Nothing here slides: the boat surges with each pull and runs on between strokes, the rower
swings from the hips, the blades leave rings that stay where they were made.
"""
import math
import numpy as np
from engine import DASH, DAB, SCUM, LENS, pal, smooth, noise
from core import RIPPLE, F
from rig import Part, rx, ry, rz, align_y, limb2, arm_ik, ARM
from trees import pick, unit
from life import merge, strokes
import people as PP
import world as W

T_STROKE = 3.6
V0 = 1.22                      # mean speed, m/s
T_REF, Z_REF = 80.0, 122.0     # the boat is at Z_REF at film time T_REF
SIDE = 1.25                    # metres right of the middle of the river
LOCK = np.array([0.60, 0.42, -0.10])      # starboard oarlock in boat coordinates
SEAT_Z = 0.30                             # the rower sits forward of the pins and faces aft
INB, OUTB = 0.72, 1.95

HULL_LI = pal((232, 160, 140), (240, 178, 150), (220, 138, 128), (244, 190, 170))
HULL_SH = pal((120, 70, 104), (136, 82, 108), (104, 66, 110))
IN_LI = pal((222, 190, 140), (232, 204, 156), (206, 172, 130))
IN_SH = pal((112, 92, 112), (126, 100, 110), (98, 88, 116))
OAR_LI = pal((226, 200, 160), (240, 216, 176))
OAR_SH = pal((112, 90, 100), (126, 100, 104))


def beam(s):
    return np.where(s > 0, 0.60 * (1 - np.abs(s) ** 2.2) ** 0.85, 0.60 * (1 - 0.72 * np.abs(s) ** 3.0))


def hull(rng):
    p = Part(rng)
    sb = p.sb
    for sgn in (-1, 1):
        m = 260
        s = rng.uniform(-1, 1, m)
        v = rng.random(m)
        b = beam(s)
        P = np.stack([sgn * b * (0.74 + 0.26 * v), -0.03 + 0.42 * v + 0.10 * s * s, 2.4 * s], axis=1)
        D = unit(np.tile([0.0, 0.0, 1.0], (m, 1)) + rng.normal(0, 0.05, (m, 3)))
        N = unit(np.stack([sgn * np.ones(m), 0.25 - 0.7 * (1 - v), 0.4 * np.sign(s) * np.abs(s) ** 2], axis=1))
        sb.add(P, D, 0.50 * np.exp(rng.normal(0, 0.2, m)), 0.115, DASH + rng.integers(0, 8, m), pick(HULL_SH, rng.random(m)),
               pick(HULL_LI, rng.random(m)), N=N, smin=3.0, occ=0.55 + 0.45 * v, haze=0.8)
        # inside of the far side shows over the near gunwale
        m = 150
        s = rng.uniform(-0.97, 0.97, m)
        v = rng.random(m)
        b = beam(s)
        P = np.stack([sgn * b * (0.70 + 0.24 * v), 0.04 + 0.33 * v + 0.10 * s * s, 2.4 * s], axis=1)
        sb.add(P, D[:m], 0.46, 0.11, DASH + rng.integers(0, 8, m), pick(IN_SH, rng.random(m)), pick(IN_LI, rng.random(m)),
               N=np.tile([-sgn * 1.0, 0.5, 0.0], (m, 1)), smin=3.0, occ=0.5 + 0.5 * v, bias=-0.02, haze=0.8)
        # gunwale
        m = 34
        s = np.linspace(-0.99, 0.99, m)
        P = np.stack([sgn * beam(s), 0.40 + 0.10 * s * s, 2.4 * s], axis=1)
        sb.add(P, unit(np.gradient(P, axis=0)), 0.30, 0.05, DASH + rng.integers(0, 8, m), pal((150, 110, 110))[0], pal((255, 236, 210))[0],
               N=np.tile([0.0, 1.0, 0.0], (m, 1)), smin=2.5, bias=0.03, haze=0.8)
    # transom
    m = 30
    P = np.stack([rng.uniform(-0.17, 0.17, m), rng.uniform(0.02, 0.48, m), np.full(m, -2.4)], axis=1)
    sb.add(P, (1, 0, 0), 0.22, 0.10, DASH + rng.integers(0, 8, m), pick(HULL_SH, rng.random(m)), pick(HULL_LI, rng.random(m)),
           N=np.tile([0.0, 0.2, -1.0], (m, 1)), smin=3.0, haze=0.8)
    # bottom boards and thwarts
    m = 110
    s = rng.uniform(-0.9, 0.9, m)
    P = np.stack([rng.uniform(-1, 1, m) * beam(s) * 0.66, np.full(m, 0.05), 2.4 * s], axis=1)
    sb.add(P, unit(np.tile([0.0, 0.0, 1.0], (m, 1)) + rng.normal(0, 0.04, (m, 3))), 0.5, 0.11, DASH + rng.integers(0, 8, m),
           pick(IN_SH, rng.random(m)), pick(IN_LI, rng.random(m)), N=np.tile([0.0, 1.0, 0.0], (m, 1)), smin=3.0, occ=0.55, bias=-0.04, haze=0.8)
    for zt in (-1.45, SEAT_Z + 0.02, 1.45):
        st = zt / 2.4
        hb = float(beam(np.array([st]))[0]) * 0.9
        p.seg((-hb, 0.30, zt), (hb, 0.30, zt), 0.16, IN_SH, IN_LI, n=6, bias=0.0)
    return p.done()


def oar(rng, sgn):
    """An oar lying along the local x axis, pivot at the origin; sgn = +1 starboard, -1 port."""
    p = Part(rng)
    p.seg((-sgn * INB, 0, 0), (sgn * (OUTB - 0.52), 0, 0), 0.045, OAR_SH, OAR_LI, n=9)
    p.seg((sgn * (OUTB - 0.56), 0, 0), (sgn * OUTB, 0, 0), 0.15, pal((150, 130, 130), (166, 140, 132)), pal((250, 234, 200), (255, 244, 214)), n=4, bias=0.01)
    return p.done()


def cycle(t):
    """Rowing cycle at time t -> sweep angle, dip angle, lean of the rower, phase.

    The rower faces aft.  Catch (phase 0): she is reached forward, arms straight, blades far toward
    the bow.  Drive (to 0.40): legs and back swing her upright and past it, the hands come in to
    the body, the blades travel aft through the water.  Then the blades come out and she rocks
    forward again, slowly, while the boat runs."""
    ph = ((t - T_REF) / T_STROKE) % 1.0
    if ph < 0.40:
        e = float(smooth(0.0, 0.40, ph))
        e = 0.5 * e + 0.5 * (ph / 0.40)
        dip = -0.07 - 0.20 * float(smooth(0.0, 0.05, ph)) * float(smooth(0.40, 0.34, ph))
    else:
        e = 1.0 - float(smooth(0.44, 1.0, ph))
        dip = -0.06
    sweep = -0.62 + 1.07 * e
    lean = 0.50 - 0.76 * e
    return sweep, dip, lean, ph


def boat_z(t):
    ph = (t - T_REF) / T_STROKE
    return Z_REF + V0 * (t - T_REF) - 0.26 * V0 * T_STROKE / (2 * math.pi) * math.cos(2 * math.pi * (ph - 0.15))


def boat_pose(t):
    z = boat_z(t)
    x = float(W.rx(z)) + SIDE
    tx, tz = W.river_tangent(np.array([z]))
    yaw = math.atan2(float(tx[0]), float(tz[0]))
    return np.array([x, 0.0, z]), yaw


def make(rng):
    HUL = hull(rng)
    OAR_S, OAR_P = oar(rng, 1), oar(rng, -1)
    # the rower: white dress, straw hat with a red ribbon
    r_skirt = Part(rng).ell((0, 0.10, 0.24), (0.30, 0.17, 0.38), 0, PP.WHITE_SH, PP.WHITE_LI, 0.15, flow=(0.1, -0.3, 1.0)).done()
    r_torso = Part(rng).ell((0, 0.27, 0.0), (0.18, 0.29, 0.135), 0, PP.WHITE_SH, PP.WHITE_LI, 0.11, flow=(0.1, 1.0, 0.0)) \
        .seg((-0.17, 0.06, 0.02), (0.17, 0.06, 0.02), 0.06, PP.BLUE_SH, PP.BLUE_LI, n=4, bias=0.02).done()
    r_head = Part(rng).ell((0, 0.10, 0.0), (0.09, 0.11, 0.095), 0, PP.SKIN_SH, PP.SKIN_LI, 0.08, occ_lo=0.6) \
        .ell((0, 0.13, -0.05), (0.095, 0.095, 0.085), 0, PP.HAIR, PP.HAIR_LI, 0.075) \
        .ell((0, 0.21, 0.0), (0.175, 0.026, 0.175), 0, PP.STRAW_SH, PP.STRAW_LI, 0.09, flow=(1, 0, 0.3), occ_lo=0.7) \
        .ell((0, 0.245, 0.0), (0.105, 0.055, 0.105), 0, PP.STRAW_SH, PP.STRAW_LI, 0.08) \
        .seg((-0.11, 0.218, 0.0), (0.11, 0.218, 0.0), 0.032, pal((180, 50, 56)), pal((236, 96, 84)), n=4, bias=0.02) \
        .seg((0.0, 0.215, -0.12), (0.02, 0.05, -0.24), 0.028, pal((180, 50, 56)), pal((236, 96, 84)), n=4, flex=0.08).done()
    r_up, r_fo = limb2(rng, PP.WHITE_SH, PP.WHITE_LI)
    # the passenger in the stern: rose dress, blue ribbon
    p_skirt = Part(rng).ell((0, 0.10, 0.24), (0.31, 0.18, 0.38), 0, PP.PINK_SH, PP.PINK_LI, 0.15, flow=(0.1, -0.3, 1.0)).done()
    p_torso = Part(rng).ell((0, 0.26, 0.0), (0.175, 0.28, 0.13), 0, PP.PINK_SH, PP.PINK_LI, 0.11, flow=(0.1, 1.0, 0.0)) \
        .dab((0.0, 0.47, 0.09), (1, 0, 0), 0.2, 0.05, PP.WHITE_SH[0], PP.WHITE_LI[0]).done()
    p_head = Part(rng).ell((0, 0.10, 0.0), (0.09, 0.11, 0.095), 0, PP.SKIN_SH, PP.SKIN_LI, 0.08, occ_lo=0.6) \
        .ell((0, 0.13, -0.05), (0.095, 0.095, 0.085), 0, pal((150, 104, 70), (128, 88, 64)), pal((226, 176, 110), (240, 196, 130)), 0.075) \
        .ell((0, 0.21, 0.0), (0.18, 0.026, 0.18), 0, PP.STRAW_SH, PP.STRAW_LI, 0.09, flow=(1, 0, 0.3), occ_lo=0.7) \
        .ell((0, 0.245, 0.0), (0.105, 0.055, 0.105), 0, PP.STRAW_SH, PP.STRAW_LI, 0.08) \
        .seg((-0.11, 0.218, 0.0), (0.11, 0.218, 0.0), 0.032, PP.BLUE_SH, PP.BLUE_LI, n=4, bias=0.02) \
        .seg((0.0, 0.215, -0.12), (0.02, 0.04, -0.26), 0.028, PP.BLUE_SH, PP.BLUE_LI, n=4, flex=0.10).done()
    p_up, p_fo = limb2(rng, PP.PINK_SH, PP.PINK_LI)

    def tips(t):
        """World positions of the two blade tips at time t."""
        T0, yaw = boat_pose(t)
        B = ry(yaw)
        sweep, dip, lean, ph = cycle(t)
        out = []
        for sgn in (1, -1):
            M = ry(sgn * sweep) @ rz(sgn * dip)
            out.append(T0 + B @ (LOCK * [sgn, 1, 1] + M @ np.array([sgn * OUTB, 0, 0])))
        return out

    def act(env):
        t = env.t
        T0, yaw = boat_pose(t)
        far = math.sqrt((env.C[0] - T0[0]) ** 2 + (env.C[2] - T0[2]) ** 2)
        if far > 170 or T0[2] > 150.0:          # once it is under the bridge, and behind us, it has gone its way
            return []
        vis = float(smooth(170.0, 120.0, far))
        sweep, dip, lean, ph = cycle(t)
        pitch = 0.012 * math.sin(2 * math.pi * (ph - 0.05)) + 0.006 * math.sin(t * 0.9)
        roll = 0.02 * math.sin(t * 0.8 + 1.0)
        B = ry(yaw) @ rx(-pitch) @ rz(roll)
        T0 = T0 + [0, 0.012 * math.sin(t * 1.1), 0]
        w = lambda p: T0 + B @ np.asarray(p, np.float64)
        parts = [HUL.at(B, T0)]
        hands = []
        for sgn, OP in ((1, OAR_S), (-1, OAR_P)):
            M = ry(sgn * sweep) @ rz(sgn * dip)
            piv = LOCK * [sgn, 1, 1]
            parts.append(OP.at(B @ M, w(piv)))
            hands.append(w(piv + M @ np.array([-sgn * (INB - 0.04), 0, 0])))
        # rower: sits on the middle thwart facing aft and swings from the hips
        R = B @ ry(math.pi)
        hip = w([0.0, 0.34, SEAT_Z])
        Mt = R @ rx(lean)
        sh = hip + Mt @ np.array([0, 0.50, 0.0])
        parts += [r_skirt.at(R, hip - B @ np.array([0, 0.05, 0])), r_torso.at(Mt, hip),
                  r_head.at(R @ rx(lean * 0.35 + 0.05) @ ry(0.18 * math.sin(t * 0.37)), sh)]
        for sgn, H in ((1, hands[0]), (-1, hands[1])):
            S = hip + Mt @ np.array([-sgn * 0.19, 0.46, 0.0])
            # elbows always down and out to the side, never flipping over
            parts += arm_ik(r_up, r_fo, S, H, pole=B @ np.array([sgn * 0.9, -0.75, 0.35]))
        # passenger: in the stern facing forward, swaying against each pull, a hand in the water
        surge = math.sin(2 * math.pi * (ph - 0.15))
        hip2 = w([0.02, 0.34, -1.42])
        Mp = B @ rx(-0.10 - 0.035 * surge) @ rz(-0.10)
        sh2 = hip2 + Mp @ np.array([0, 0.49, 0.0])
        look = 0.5 * math.sin(t * 0.21 + 1.0) + 0.5
        parts += [p_skirt.at(B, hip2 - B @ np.array([0, 0.05, 0])), p_torso.at(Mp, hip2),
                  p_head.at(B @ ry(0.9 * look - 0.2) @ rx(0.05 + 0.14 * look), sh2)]
        parts += arm_ik(p_up, p_fo, hip2 + Mp @ np.array([0.19, 0.45, 0.0]), w([0.50, 0.44, -1.22 + 0.03 * math.sin(t * 0.8)]),
                        pole=B @ np.array([0.8, -0.5, -0.4]))
        parts += arm_ik(p_up, p_fo, hip2 + Mp @ np.array([-0.19, 0.45, 0.0]), w([-0.12, 0.40, -1.12]), pole=B @ np.array([-0.6, -0.6, 0.0]))
        M_ = merge(parts)
        M_['a'] = M_['a'] * vis
        res = [(M_, dict(sway=True))]
        # ---- what the boat does to the water
        P, D, L, Wd, col, al = [], [], [], [], [], []
        n0 = int(math.floor((t - T_REF) / T_STROKE))
        for n in range(n0 - 2, n0 + 1):
            for (tt, r0, grow) in ((T_REF + (n + 0.02) * T_STROKE, 0.16, 0.30), (T_REF + (n + 0.39) * T_STROKE, 0.24, 0.42)):
                age = t - tt
                if age < 0 or age > 6.0:
                    continue
                for c in tips(tt):
                    k = 18
                    a = np.arange(k) * 6.283 / k + n
                    for ring in (0, 1):
                        r = r0 + grow * max(age - 0.5 * ring, 0) ** 0.85
                        if age - 0.5 * ring < 0:
                            continue
                        P.append(np.stack([c[0] + r * np.cos(a), np.full(k, 0.012), c[2] + r * np.sin(a)], axis=1))
                        D.append(np.stack([-np.sin(a), 0 * a, np.cos(a)], axis=1))
                        L.append(np.full(k, r * 0.42 + 0.04)); Wd.append(np.full(k, 0.035 + 0.01 * age))
                        col.append(np.where((np.arange(k) % 2 == ring)[:, None], np.array([0.86, 0.94, 0.92]), np.array([0.10, 0.26, 0.25])))
                        al.append(np.full(k, 0.62 * (1 - age / 6.0) ** 1.4))
        # the wake: two soft lines opening behind the stern
        for tau in np.arange(0.3, 7.0, 0.35):
            Tp, yw = boat_pose(t - tau)
            Bp = ry(yw)
            for sgn in (-1, 1):
                off = 0.30 + 0.20 * tau
                c = Tp + Bp @ np.array([sgn * off, 0.012, -2.3])
                P.append(c[None]); D.append((Bp @ np.array([sgn * 0.35, 0, 1.0]))[None]); L.append([0.55]); Wd.append([0.05 + 0.012 * tau])
                col.append(np.array([[0.84, 0.93, 0.90]]) if int(tau / 0.35) % 2 else np.array([[0.12, 0.30, 0.28]]))
                al.append([0.5 * (1 - tau / 7.0) ** 1.2])
        if P:
            col = np.concatenate(col)
            A = strokes(np.concatenate(P), np.concatenate(D), np.concatenate(L), np.concatenate(Wd), LENS, col, col,
                        a=np.concatenate(al), smin=1.5, haze=0.5, emis=0.6, bias=0.4)
            res.append((A, dict(passid=RIPPLE, reflect=False)))
        return res
    return act
