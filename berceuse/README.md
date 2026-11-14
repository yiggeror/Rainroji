# Berceuse — a second code-painted short film after Claude Monet

One continuous take, 2 min 51 s, through a whole year on one river - and round to spring again.
Every frame is built from tens of thousands of individual brush strokes that are generated,
animated and composited by the Python code in this folder — no image assets, no 3-D renderer,
no AI image model.

| time | scene |
|------|-------|
| 0:00 | **spring** - down from above an orchard in blossom; cloud shadows cross it, swallows hunt over it |
| 0:18 | through the trees: a girl on a swing in an apple tree, her mother reading on a blue cloth |
| 0:32 | to the river and out along it |
| 0:39 | **summer** - a painter at his easel under a white umbrella, cows in the meadow behind him |
| 0:51 | the garden: a pink house with green shutters, beds of flowers down to the water, washing on the line |
| 1:01 | after a rose-coloured skiff, alongside it, past it; ducks, lily pads, shafts of sun under the willows |
| 1:20 | under the old stone bridge … |
| 1:22 | **autumn** - the wide water, sails, gold poplars, wild geese going over |
| 1:32 | ashore into a farm orchard: red apples, baskets, a ladder, geese in the grass, a fire of leaves, a scarlet creeper on the house |
| 1:44 | a wind gets up and takes the leaves, a few and then all; up over the yard into the mist |
| 2:03 | **winter** - the same yard under snow; a magpie on the gate; it flies off over the roofs |
| 2:17 | sunset on the ice from beside an old apple tree; the village lights its lamps |
| 2:22 | the snow turns to rain; ice and snow go; the roofs come out red |
| 2:30 | morning, a sun-shower, blossom - and the camera draws back and up over the whole reach in spring |

Nothing in the year is switched: leaves leave stroke by stroke, frost and snow arrive and melt in
patches, blossom opens touch by touch (`world.py` keeps the calendar, `film.py` fades each group).
Nothing in the picture is switched on either: whatever lives in the world is there from the first
frame and only fades with distance.

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
* `sc_spring.py` orchard · `sc_summer.py` river, bridge · `sc_garden.py` garden, painter, cows ·
  `sc_poplars.py` the poplar reach and its farm through autumn, winter and spring — the scenes; `people.py`, `boat.py`, `rig.py`
  — the figures (rigid parts, two-bone arms, a rowing cycle that drives the boat's speed, the
  rings its oars leave); `life.py` — whatever falls or flies.
* `shots.py` — the single take: camera keys, the rig that follows the skiff, the light of the
  film keyed over time, and the *pace*: the story is written in its own time and the film plays
  it faster where the picture would only repeat itself, slower where something is happening.
* `audio_mix.py` — the soundtrack; `audio/` — how the music was cut and where the sounds come from.

## Rebuild

```bash
pip install numpy scipy numba opencv-python-headless
python3 render.py still frame.png 66            # one 1080p frame at t = 66 s
./renderseg.sh out 1080 16 14 4                 # the whole film: 16 segments, crf 14, 4 at a time -> out/video.mp4
./audio/get_sfx.sh SRC/sfx                      # field recordings (see CREDITS.md)
python3 audio_mix.py SRC out/mix.wav            # needs SRC/music/berceuse_edit.wav (audio/music_edit.py)
ffmpeg -i out/video.mp4 -i out/mix.wav -c:v copy -c:a aac -b:a 256k out/berceuse.mp4
```

See `CREDITS.md` for music and sound sources.
