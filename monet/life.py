"""Small things that travel through the whole film on the wind: petals, seeds, motes."""
import numpy as np
from engine import Batch, smooth, mix, noise, C, pal, DAB, LENS
from world import window


def make_petals(rng, n=120):
    ph = rng.random((n, 8)).astype(np.float32)
    kinds = [pal((252, 230, 238), (244, 190, 208), (255, 250, 246)),      # pond: lily and willow fluff
             pal((236, 70, 50), (250, 120, 80), (255, 246, 230), (250, 226, 120)),   # meadow: poppy petals, seeds
             pal((255, 214, 130), (255, 236, 170), (255, 180, 110))]      # evening: gold motes

    def actor(env):
        d = env.d
        if d < 0.55 or d > 3.6:
            return None
        t = env.t
        p = 0.6 + 1.5 * ph[:, 0]
        # each petal rides the wind a little faster than the camera, looping across the frame
        span = 2600.0
        speed = 60 + 150 * ph[:, 1]
        ox = (ph[:, 2] * span + speed * t + 120 * np.sin(t * 0.6 + 6.28 * ph[:, 3])) % span - span / 2
        Y = -90 - 620 * ph[:, 4] + 60 * np.sin(t * (0.5 + ph[:, 5]) + 6.28 * ph[:, 6]) + 25 * np.sin(t * 2.3 + 6.28 * ph[:, 7])
        sx = 960 + ox * (0.5 + 0.5 * p / 2.1)
        sy = env.hz + (Y + env.Hc) * (0.35 + 0.65 * p / 2.1) * 0.9
        k = np.clip(np.floor(d - 0.5), 0, 2).astype(int)
        cidx = (ph[:, 3] * 3.99).astype(int)
        cols = np.array([kinds[min(int(k), 2)][c % len(kinds[min(int(k), 2)])] for c in cidx], np.float32)
        tum = np.sin(t * (2.0 + 3.0 * ph[:, 5]) + 6.28 * ph[:, 6])
        size = (9 + 12 * ph[:, 7]) * (0.5 + 0.5 * p)
        gust = env.wind(env.camX + ox, 1.0)
        # petals thin out between scenes and thicken in the gusts
        a = 0.35 + 0.65 * smooth(0.25, 0.7, gust)
        a = a * float(smooth(0.55, 0.9, d)) * float(smooth(3.6, 3.2, d)) * (ph[:, 1] < 0.35 + 0.65 * float(window(d, 2.0, 1.2)))
        return Batch(sx, sy, tum * 1.4 + ph[:, 2] * 6.28, size, size * (0.35 + 0.4 * np.abs(tum)), DAB + (cidx % 4), cols,
                     0.9 * a, 3.0 + p)
    return actor


def build(rng):
    return [], [make_petals(rng)]
