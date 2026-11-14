"""Assemble the film: world, light, camera, and the frame function."""
import numpy as np
import engine
from core import Env, Path, shade, compose, STAND, FPS
from engine import smooth
import look as LK
import sky as SKYM
import surf

rng = np.random.default_rng(1891)
SKY = SKYM.Sky(rng)
FIELDS = surf.build()
GROUPS = []        # static stroke groups
ACTORS = []        # callables env -> list of (arrays, kwargs) world strokes
SCREEN = []        # callables env -> ready screen strokes (dict with key)
PATH = None
DUR = 10.0
MIRROR_FAR = 260.0


def frame_strokes(env):
    parts = []
    r = SKY.emit(env)
    if r:
        parts += r
    for f in FIELDS:
        parts.append(f.emit(env))
    cam_low = env.C[1] < 60
    for g in GROUPS:
        w = 1.0
        if g.fade is not None:
            w = float(g.fade(env.t))
            if w <= 0.004:
                continue
        vis = g.visible(env)
        mir = g.reflect and cam_low and g.visible(env, mirror=True, far=MIRROR_FAR)
        if not (vis or mir):
            continue
        for mirror in (False, True):
            if not (mir if mirror else vis):
                continue
            A = g.lod(env, mirror=mirror)
            if A is None:
                continue
            if w < 0.996:
                # strokes arrive (or leave) one after another, each in its own time
                u = A['ph'] * (0.75 / 6.2832)
                A = dict(A)
                A['a'] = A['a'] * smooth(u, u + 0.25, w)
            parts.append(shade(env, A, mirror=mirror, passid=g.passid))
    for act in ACTORS:
        for (A, kw) in act(env) or []:
            if A is None:
                continue
            parts.append(shade(env, A, passid=kw.get('passid', STAND), sway=kw.get('sway', False)))
            if kw.get('reflect', True) and cam_low:
                parts.append(shade(env, A, mirror=True, sway=kw.get('sway', False)))
    for s in SCREEN:
        r = s(env)
        if r is not None:
            parts += r if isinstance(r, list) else [r]
    return compose(parts)


def frame(t, H=1080, env=None, stats=False):
    if env is None:
        env = Env(t, PATH, LK.look)
    S = frame_strokes(env)
    L = env.L
    im = engine.render(S, H, fade=float(L.get('fade', 0.0)), fade_rgb=L.get('fade_rgb', None), ground=L.get('ground', None))
    if stats:
        print('strokes', 0 if S is None else len(S['x']))
    return im
