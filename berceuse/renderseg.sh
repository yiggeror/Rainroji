#!/bin/bash
# renderseg.sh OUTDIR H NPROC [CRF] [T0 T1]  -> OUTDIR/video.mp4 (segments rendered in parallel)
OUT=$1; H=$2; N=$3; CRF=${4:-14}
W=$((H*16/9))
F0=$(python3 -c "print(int(30*${5:-0}))"); F1=$(python3 -c "import shots; print(int(30*${6:-0}) if ${6:-0} else int(30*shots.DUR))")
mkdir -p $OUT
for i in $(seq 0 $((N-1))); do
  A=$((F0+(F1-F0)*i/N)); B=$((F0+(F1-F0)*(i+1)/N))
  ( python3 render.py pipe $A $B $H | ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgb24 -s ${W}x${H} -r 30 -i - \
      -c:v libx264 -preset medium -crf $CRF -pix_fmt yuv420p $OUT/seg_$(printf %02d $i).mp4 ) &
done
wait
ls $OUT/seg_*.mp4 | sed "s/^/file '/;s/$/'/" > $OUT/list.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i $OUT/list.txt -c copy $OUT/video.mp4
echo rendered $OUT/video.mp4
