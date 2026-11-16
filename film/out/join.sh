#!/bin/bash
# film_1.mp4 + film_2.mp4 + film_3.mp4 -> film.mp4. The film was cut on keyframes with stream copy; nothing is re-encoded,
# and the decoded frames of the parts have the same checksum as the whole film.
cd "$(dirname "$0")"
printf "file 'film_1.mp4'\nfile 'film_2.mp4'\nfile 'film_3.mp4'\n" > _join.txt
ffmpeg -v error -y -f concat -safe 0 -i _join.txt -c copy -movflags +faststart film.mp4
rm -f _join.txt
