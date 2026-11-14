#!/bin/bash
# renderseg.sh OUTDIR H NSEG [CRF] [NPROC]  -> OUTDIR/video.mp4
# The film is cut into NSEG equal pieces which are rendered NPROC at a time (heavy and light
# passages then even out), encoded, and joined without re-encoding.
OUT=$1; H=$2; N=$3; CRF=${4:-14}; P=${5:-4}
W=$((H*16/9))
TOTAL=$(python3 -c "import shots; print(int(round(30*shots.FILM_DUR)))")
mkdir -p $OUT
one() {
  i=$1; A=$((TOTAL*i/N)); B=$((TOTAL*(i+1)/N)); f=$OUT/seg_$(printf %02d $i).mp4
  python3 render.py pipe $A $B $H | ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgb24 -s ${W}x${H} -r 30 -i - \
      -c:v libx264 -preset medium -crf $CRF -pix_fmt yuv420p $f.part.mp4 && mv $f.part.mp4 $f
}
export -f one; export OUT H N CRF W TOTAL
seq 0 $((N-1)) | xargs -P $P -I{} bash -c 'one {}'
ls $OUT/seg_??.mp4 | sed "s/^/file '/;s/$/'/" > $OUT/list.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i $OUT/list.txt -c copy $OUT/video.mp4
echo rendered $OUT/video.mp4
