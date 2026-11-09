#!/usr/bin/env python3
"""把一段重画的片子接进上一次的整片渲染里：只有改过的中间部分需要重画，开头的房间和结尾的回家照用旧的。
   python3 yiliguang/tools/splice.py <旧的名字> <新的名字> <输出的名字> --from <帧> [--to-end] [--crf 16]

<名字> 是 rec.mjs 的输出去掉 .mp4：<名字>-v.mp4（画面）、<名字>.wav（声音）。
新的那一次这样录：整部片子从头跑到尾，但只画 --from 那一帧起、到某一段开始为止的帧，例如
   node yiliguang/tools/rec.mjs new/film.mp4 "film&draw=312-&drawTill=surface" 152 1280 720 16
（没画的帧照样推进故事、模拟和声音，只是画得极小、不交出来；所以新的声音是完整的一条，新画面接得上旧画面。）

接法：
  · 开头：新画面的头几帧和旧画面同一位置的帧比一比；从第一帧几乎一样的地方接过去（理应一开始就一样；
    缓冲区重新分配之类的差别会在这里显出来）。
  · 结尾：新画面的最后一帧是 drawTill 那一段开始的第一帧；在旧画面里找到和它一样的那一帧，从它的下一帧接着用旧的。
    两次的时间线可以不一样长（中间的世界变长变短都行），只要接点前后的画面是同一回事。
    --to-end：新的一直画到片尾（没有 drawTill），结尾不用旧的。
  · 声音：用新的那一条（它和新的时间线一帧不差）。
输出 <输出的名字>-v.mp4 和 <输出的名字>.wav，可以直接交给 master.mjs。"""
import subprocess, sys, shutil
import numpy as np

def frames(path, w=96, h=54, start=None, count=None, fps=24):
    vf = f'scale={w}:{h},format=gray'
    if start is not None:
        vf = f'select=between(n\\,{start}\\,{start + count - 1}),' + vf
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', vf, '-vsync', '0', '-f', 'rawvideo', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(-1, h, w).astype(np.float32)

def count(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames',
                          '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
    return int(out)

def main():
    a = sys.argv[1:]
    old, new, out = a[0], a[1], a[2]
    A = int(a[a.index('--from') + 1])
    crf = a[a.index('--crf') + 1] if '--crf' in a else '16'
    nOld, nNew = count(old + '-v.mp4'), count(new + '-v.mp4')
    print(f'old {nOld} frames, new {nNew} frames (from {A})')
    # ---- the head: where the new frames are the old ones
    m = min(48, nNew)
    fo = frames(old + '-v.mp4', start=A, count=m); fn = frames(new + '-v.mp4', start=0, count=m)
    d = np.abs(fo - fn).mean(axis=(1, 2))
    print('head: new vs old, mean abs diff (0–255) per frame:', ' '.join(f'{x:.2f}' for x in d[:24]))
    ok = np.nonzero(d < 0.8)[0]
    if not len(ok): sys.exit('the new frames never match the old ones at the head: not spliced')
    j = int(ok[0])
    if d[j:j + 6].max() > 0.8: print('  (warning: the match at the head is not steady)')
    to_end = '--to-end' in a
    if to_end:
        segs = f'old 0–{A + j - 1}, new {j}–{nNew - 1}'
        total = (A + j) + (nNew - j)
        print('splice:', segs, '→', total, 'frames')
        fc = (f'[0:v]trim=start_frame=0:end_frame={A + j},setpts=PTS-STARTPTS[a];'
              f'[1:v]trim=start_frame={j},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]')
        encode([old + '-v.mp4', new + '-v.mp4'], fc, crf, out)
        finish(new, out)
        return
    # ---- the tail: the old frame that is the new one's last
    last = frames(new + '-v.mp4', start=nNew - 1, count=1)[0]
    guess = A + nNew - 1
    lo, hi = max(0, guess - 120), min(nOld, guess + 120)
    fo = frames(old + '-v.mp4', start=lo, count=hi - lo)
    dt = np.abs(fo - last[None]).mean(axis=(1, 2))
    c = lo + int(np.argmin(dt))
    print(f'tail: the new last frame is old frame {c} (diff {dt.min():.2f}; next best {np.sort(dt)[1]:.2f})')
    if dt.min() > 1.5: sys.exit('the new last frame is not in the old film near where it should be: not spliced')
    # ---- the film: old [0, A + j) + new [j, end) + old (c, end)
    segs = f'old 0–{A + j - 1}, new {j}–{nNew - 1}, old {c + 1}–{nOld - 1}'
    total = (A + j) + (nNew - j) + (nOld - c - 1)
    print('splice:', segs, '→', total, 'frames')
    fc = (f'[0:v]trim=start_frame=0:end_frame={A + j},setpts=PTS-STARTPTS[a];'
          f'[1:v]trim=start_frame={j},setpts=PTS-STARTPTS[b];'
          f'[2:v]trim=start_frame={c + 1},setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0[v]')
    encode([old + '-v.mp4', new + '-v.mp4', old + '-v.mp4'], fc, crf, out)
    finish(new, out)

def encode(inputs, fc, crf, out):
    args = ['ffmpeg', '-v', 'error', '-y']
    for i in inputs: args += ['-i', i]
    subprocess.run(args + ['-filter_complex', fc, '-map', '[v]', '-r', '24', '-c:v', 'libx264', '-preset', 'slow', '-crf', crf,
                           '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out + '-v.mp4'], check=True)

def finish(new, out):
    shutil.copyfile(new + '.wav', out + '.wav')
    got = count(out + '-v.mp4')
    wav_s = (len(open(out + '.wav', 'rb').read()) - 44) / 4 / 48000
    print(f'{out}-v.mp4: {got} frames ({got / 24:.2f} s); sound {wav_s:.2f} s')

if __name__ == '__main__':
    main()
