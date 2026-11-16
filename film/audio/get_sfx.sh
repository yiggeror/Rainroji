#!/bin/bash
# Download the CC0 field recordings used by sfx.py from BigSoundBank and convert them to 44.1 kHz stereo wav.
# usage: get_sfx.sh DIR   ->  DIR/wav/<id>.wav
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
mkdir -p "$1/wav"; cd "$1"
for id in 0222 0080 0595 0476 0840 0998 3572 0621 1470 2718 3114 1289 1290 1019 0680 3416 1880 1020 2727 0288 1714 2353; do
  ls $id.* >/dev/null 2>&1 || for ext in flac mp3; do
    f="$id.$ext"; curl -sS -m 240 -L -A "$UA" -o "$f" "https://bigsoundbank.com/UPLOAD/$ext/$id.$ext"
    if file "$f" | grep -qiE "html|text|empty"; then rm -f "$f"; else break; fi
  done
  f=$(ls $id.* | head -1); [ -f wav/$id.wav ] || ffmpeg -v error -y -i "$f" -ar 44100 -ac 2 -c:a pcm_s16le wav/$id.wav
done
ls wav | wc -l
