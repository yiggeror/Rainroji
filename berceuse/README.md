# Berceuse — a second code-painted short film after Claude Monet

One continuous take, about two and a half minutes, through a whole year on one river - and round
to spring again.  Every frame is built from tens of thousands of individual brush strokes that are
generated, animated and composited by the Python code in this folder — no image assets, no 3-D
renderer, no AI image model.

| time | scene |
|------|-------|
| 0:00 | inside the blossom of an apple tree; the camera sinks out of it into an orchard in spring |
| 0:10 | through the orchard under travelling cloud shadows, swallows overhead, past a woman reading and a child reaching for petals |
| 0:38 | out over the water, looking down: petals on the current, weeds in the stream |
| 0:52 | summer: up a green reach after a rose-coloured skiff - lily pads, a duck and her brood, shafts of sun - and past it |
| 1:18 | under the old stone bridge … |
| 1:22 | … into autumn: gold poplars along the bank, wild geese going over |
| 1:38 | a wind gets up and takes the leaves, a few and then all of them, as the camera climbs the trees |
| 1:45 | mist; the first snow |
| 1:52 | winter on the same reach: snowfield, wattle fence, a magpie on the gate; it flies off over the roofs |
| 2:03 | sunset on the ice seen from under an old apple tree; the village lights its lamps |
| 2:11 | the snow turns to rain; ice and snow go; the roofs come out red |
| 2:19 | morning behind us, a sun-shower, the tree breaks into blossom - and the camera rises into it, where the film began |

Nothing in the year is switched: leaves leave stroke by stroke, frost and snow arrive and melt in
patches, blossom opens touch by touch (`world.py` keeps the calendar, `film.py` fades each group).

## What is different from the first film (`monet/` on `claude/laughing-volta-yn071i`)

The first film slid a multiplane camera sideways.  Here the camera is a real perspective camera
that travels *through* a three-dimensional world of strokes: it sinks, pushes forward, tilts down
into the water, tracks and overtakes a rowing boat, passes under an arch, cranes 26 m up a line
of poplars, turns in the mist, follows a bird.

* `engine.py` — the painter (taken over from the first film so that the hand stays the same):
  bristle-textured brush sprites, a numba rasteriser, paint-relief lighting, canvas weave.
* `core.py` — the new part.  Every stroke is anchored at a 3-D point.  *Groups* are static
  clusters (a tree, a house), *actors* return strokes for the current instant (boat, bird,
  petals), *fields* are endless surfaces (water, grass, snow) whose strokes come from a hashed,
  nested grid: as the camera approaches, new strokes fade in between the old ones, so the
  density on screen stays constant while every stroke stays glued to its place in the world.
  Level of detail, wind, light, aerial perspective and the mirror image in the water are applied
  here, for everything alike.
* `sky.py` — a dome of strokes anchored to directions; the same colour model gives the mirror
  image in the water and the colour of the air.
* `world.py`, `surf.py` — the river, its banks, the seasons along it (and, in the mist, in time).
* `sc_spring.py`, `sc_summer.py`, `sc_poplars.py` — the scenes; `people.py`, `boat.py`, `rig.py`
  — the figures (rigid parts, two-bone arms, a rowing cycle that drives the boat's speed, the
  rings its oars leave); `life.py` — whatever falls or flies.
* `shots.py` — the single take: camera keys, the rig that follows the skiff, and the light of
  the film keyed over time.
* `audio_mix.py` — the soundtrack; `audio/` — how the music was cut and where the sounds come from.

## Rebuild

```bash
pip install numpy scipy numba opencv-python-headless
python3 render.py still frame.png 66            # one 1080p frame at t = 66 s
./renderseg.sh out 1080 4                       # the whole film, 4 processes -> out/video.mp4
./audio/get_sfx.sh SRC/sfx                      # field recordings (see CREDITS.md)
python3 audio_mix.py SRC out/mix.wav            # needs SRC/music/berceuse_edit.wav (audio/music_edit.py)
ffmpeg -i out/video.mp4 -i out/mix.wav -c:v copy -c:a aac -b:a 256k out/berceuse.mp4
```

See `CREDITS.md` for music and sound sources.
