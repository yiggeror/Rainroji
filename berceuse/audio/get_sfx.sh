#!/bin/bash
# download BigSoundBank recordings (CC0) as FLAC into the directory given as $1
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
mkdir -p "$1"
for id in 1353 1906 0912 3476 3486 3494 3499 1667 1670 3136 3137 0864 3430 2714 2749 0097 1514 1384 1385 1386 0659 0904 0907 3464 3465 2764 2765 2766 2767 0147 0595 0476 3445 0830; do
  ls "$1"/$id.* >/dev/null 2>&1 && continue
  # older recordings exist only as mp3
  for ext in flac mp3; do
    f="$1/$id.$ext"
    curl -sS -m 240 -L -A "$UA" -o "$f" "https://bigsoundbank.com/UPLOAD/$ext/$id.$ext"
    if file "$f" | grep -qi "html\|text"; then rm -f "$f"; else break; fi
  done
  sleep 0.5
done
ls "$1" | wc -l
