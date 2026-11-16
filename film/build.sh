#!/bin/bash
# Rebuild everything from nothing.  build.sh [WORK_DIR]   (about 45 minutes on 4 cores)
set -e
cd "$(dirname "$0")"
W=${1:-/tmp/px_work}; mkdir -p "$W/work" "$W/audio"
export PX_OUT="$W/work"
for s in roof school rain rail snow; do DSTR=0.5 python3 run.py $s anim 6; done      # plates (36 rays per pixel) + loop frames
bash audio/get_sfx.sh "$W/sfx_src"
python3 audio/sfx.py "$W/sfx_src/wav" "$W/audio/sfx"
python3 audio/music.py "$W/audio/music.wav" 138
python3 make_film.py "$W/work" out
# the whole film is over GitHub's 100 MB per-file limit: cut it on a keyframe without re-encoding (out/join.sh puts it back)
(cd out && ffmpeg -v error -y -i film.mp4 -c copy -map 0 -f segment -segment_times 82 -reset_timestamps 1 _part%d.mp4 && mv _part0.mp4 film_1.mp4 && mv _part1.mp4 film_2.mp4)
