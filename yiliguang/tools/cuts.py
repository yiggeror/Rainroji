#!/usr/bin/env python3
"""找片子里的「跳」：逐帧比较前后两帧，列出画面差突然变大的地方。
   python3 yiliguang/tools/cuts.py <视频> [--expect 秒,秒,...] [--k 4]

一段平滑的镜头运动，相邻两帧的差别也是平滑变化的；一次跳切（镜头猛跳、光点瞬移、换了画面）会让差别突然变大。
把每一帧的差和它前后一秒内的中位数比，超过 k 倍（并且绝对值不太小）就报出来。
--expect 给出计划内的转场时刻（±0.5 秒内的突增不算错）。"""
import subprocess, sys, json
import numpy as np

def frames(path, w=160, h=90):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'],
                       capture_output=True, check=True)
    a = np.frombuffer(p.stdout, np.uint8)
    return a.reshape(-1, h, w).astype(np.float32) / 255.0

def fps_of(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate',
                          '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
    n, d = out.split('/')
    return float(n) / float(d)

def main():
    args = sys.argv[1:]
    path = args[0]
    expect = []
    k = 4.0
    if '--expect' in args: expect = [float(x) for x in args[args.index('--expect') + 1].split(',') if x]
    if '--k' in args: k = float(args[args.index('--k') + 1])
    f = frames(path); fps = fps_of(path)
    d = np.abs(f[1:] - f[:-1]).mean(axis=(1, 2))           # d[i]: change from frame i to i+1
    win = int(fps)
    found = []
    for i in range(len(d)):
        lo, hi = max(0, i - win), min(len(d), i + win + 1)
        nb = np.concatenate([d[lo:i], d[i + 1:hi]])
        med = float(np.median(nb)) if len(nb) else 0.0
        if d[i] > k * max(med, 0.004) and d[i] > 0.02:
            t = (i + 1) / fps
            planned = any(abs(t - e) < 0.5 for e in expect)
            found.append({'t': round(t, 3), 'frame': i + 1, 'diff': round(float(d[i]), 4), 'median': round(med, 4), 'planned': planned})
    for c in found:
        print(f"{'  planned' if c['planned'] else 'UNPLANNED'}  {c['t']:7.3f} s  (frame {c['frame']})  diff {c['diff']:.3f}  vs {c['median']:.3f} around it")
    bad = [c for c in found if not c['planned']]
    print(f"{len(found)} jumps, {len(bad)} unplanned")
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
