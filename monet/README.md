# Un jour de lumière — a code-painted short film after Claude Monet

A 102-second, single-take animated short. Every frame is built from tens of thousands of
individual brush strokes that are generated, animated and composited by the Python code in
this folder — no image assets, no 3D renderer, no AI image model.

The camera travels through one continuous world over the course of a day:

| time | scene | after |
|------|-------|-------|
| 0:00 | dawn over a misty harbour, the picture paints itself in | *Impression, soleil levant* |
| 0:20 | the water-lily pond, willows and the Japanese bridge | *Le Bassin aux nymphéas* |
| 0:46 | a windy poppy meadow, a woman with a parasol and a child | *Les Coquelicots* |
| 1:05 | haystacks in the last sun, swallows overhead | *Meules, fin de l'été* |
| 1:20 | dusk on the lagoon, the church in violet silhouette | *Saint-Georges-Majeur au crépuscule* |

## How it works

* `engine.py` — the painter. Procedural bristle-textured brush sprites, a numba rasteriser that
  composites strokes back to front into a colour buffer and a paint-thickness buffer, then lights
  the thickness buffer so the picture has the relief of oil paint on canvas.
* `world.py` — a multiplane camera. Every stroke is anchored in the world (never to the screen),
  so strokes stay put as the camera moves and nothing flickers. Scene boundaries, the camera
  track and the shared wind field live here.
* `sky.py`, `water.py` — fields of strokes whose colour is recomputed every frame: the sky follows
  the light of the day, the water mirrors that same sky model.
* `s1.py` harbour · `s2.py` lily pond · `s3.py` meadow and haystacks · `s5.py` lagoon ·
  `life.py` petals on the wind — the scenes and everything that lives in them.
* `render.py` — stills, frame ranges, or raw frames piped to ffmpeg. `renderseg.sh` renders the film
  in parallel segments.
* `audio_mix.py` — builds the soundtrack; wind loudness follows the same gust function that bends
  the grass on screen.

## Rebuild

```bash
pip install numpy scipy numba opencv-python-headless pillow
python3 render.py still frame.png 37          # one 1080p frame at t = 37 s
./renderseg.sh out 1080 4                     # whole film, 4 processes -> out/video.mp4
python3 audio_mix.py SRC_DIR out/mix.wav      # needs the audio sources listed in CREDITS.md
```

See `CREDITS.md` for music and sound sources.
