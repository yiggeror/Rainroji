"""Assemble every stroke set and actor of the film (deterministic)."""
import numpy as np
import sky, water

rng = np.random.default_rng(1874)
SETS = []
ACTORS = []
SETS += sky.build(rng)
SETS += water.build(rng)
import s1, s2, s3, s5, life
for mod in (s1, s2, s3, s5, life):
    s, a = mod.build(rng)
    SETS += s
    ACTORS += a
