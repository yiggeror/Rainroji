"""Build the whole world once (deterministic)."""
import numpy as np
import film, shots
import sc_spring, sc_summer, sc_garden, sc_poplars

film.PATH = shots.PATH
film.DUR = shots.DUR
rng = np.random.default_rng(1872)
film.GROUPS += sc_spring.build(rng)
film.ACTORS += sc_spring.actors(rng)
film.GROUPS += sc_summer.build(rng)
film.ACTORS += sc_summer.actors(rng)
film.GROUPS += sc_garden.garden(rng)
film.ACTORS += sc_garden.actors(rng)
film.GROUPS += sc_poplars.build(rng)
film.ACTORS += sc_poplars.actors(rng)
