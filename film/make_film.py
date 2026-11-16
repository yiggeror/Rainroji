#!/usr/bin/env python3
"""Assemble the film and the per-scene loop clips from rendered loop frames + audio.
make_film.py WORK_DIR OUT_DIR
  WORK_DIR/<scene>_frames.npy   palette-quantised loop frames [n,H,W,3] (run.py <scene> anim)
  WORK_DIR/../audio/music.wav, WORK_DIR/../audio/sfx/<scene>.wav
"""
import sys, os, subprocess
import numpy as np, soundfile as sf

ORDER = [('roof', 'fog'), ('school', 'campus'), ('rain', 'rain'), ('rail', 'train'), ('snow', 'snow')]   # (scene module, output name)
FPS = 30; LOOPS = 3; XF = 1.0; FADE_IN = 1.5; TAIL = 3.0
SR = 44100; SFX_GAIN = 1.0; MUSIC_GAIN = 1.0
ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-g', '60', '-movflags', '+faststart']

def ss(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

def encode(frames_iter, n, W, H, wav, out, scale):
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', wav,
           '-vf', f'scale={W * scale}:{H * scale}:flags=neighbor', *ENC, '-c:a', 'aac', '-b:a', '256k', '-shortest', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in frames_iter: p.stdin.write(f.tobytes())
    p.stdin.close(); p.wait()

def loudnorm(src, dst, I=-16):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', f'loudnorm=I={I}:TP=-1.5:LRA=14', '-ar', str(SR), '-c:a', 'pcm_s24le', dst], check=True)

def main(work, out):
    os.makedirs(out + '/loops', exist_ok=True)
    aud = os.path.join(os.path.dirname(work.rstrip('/')), 'audio')
    F = {s: np.load(f'{work}/{s}_frames.npy', mmap_mode='r') for s, _ in ORDER}
    n0, H, W, _ = F[ORDER[0][0]].shape
    scale = 1920 // W
    per = n0 * LOOPS                                    # frames per scene
    total = per * len(ORDER) + int(TAIL * FPS)
    xf = int(XF * FPS / 2)
    # ---- loop clips: three periods of picture, the ambience bed (itself a seamless loop), no music
    for s, name in ORDER:
        bed, sr = sf.read(f'{aud}/sfx/{s}.wav')
        tmp = f'{out}/loops/_{name}.wav'; sf.write(tmp, bed[: int(per / FPS * SR)], SR, subtype='PCM_24')
        encode((F[s][i % n0] for i in range(per)), per, W, H, tmp, f'{out}/loops/{name}.mp4', scale)
        os.remove(tmp); print('loop', name, flush=True)
    # ---- the film: scenes back to back with short dissolves, fade in / out
    def frame(f):
        k = min(f // per, len(ORDER) - 1)
        img = F[ORDER[k][0]][(f - k * per) % n0].astype(np.float32)
        b = (k + 1) * per
        if k + 1 < len(ORDER) and f >= b - xf:           # dissolve into the next scene
            a = ss((f - (b - xf)) / (2 * xf)); nxt = F[ORDER[k + 1][0]][(f - b) % n0].astype(np.float32); img = img * (1 - a) + nxt * a
        b0 = k * per
        if k > 0 and f < b0 + xf:
            a = ss((f - (b0 - xf)) / (2 * xf)); prv = F[ORDER[k - 1][0]][(f - (k - 1) * per) % n0].astype(np.float32); img = prv * (1 - a) + img * a
        g = ss(f / (FADE_IN * FPS)) * ss((total - 1 - f) / (TAIL * FPS))
        return np.clip(img * g + 0.5, 0, 255).astype(np.uint8)
    # audio: ambience beds cross-faded at the cuts + the score
    N = int(total / FPS * SR); mix = np.zeros((N, 2))
    t = np.arange(N) / SR
    xa = 1.5
    for k, (s, name) in enumerate(ORDER):
        bed, sr = sf.read(f'{aud}/sfx/{s}.wav'); L = len(bed)
        t0 = k * per / FPS; t1 = (k + 1) * per / FPS if k + 1 < len(ORDER) else total / FPS
        env = np.sqrt(ss((t - (t0 - xa / 2)) / xa)) * np.sqrt(ss(((t1 + xa / 2) - t) / xa)) if 0 < k < len(ORDER) - 1 else \
              (np.sqrt(ss(((t1 + xa / 2) - t) / xa)) if k == 0 else np.sqrt(ss((t - (t0 - xa / 2)) / xa)))
        idx = np.nonzero(env > 0)[0]
        src = (idx - int(t0 * SR)) % L
        mix[idx] += bed[src] * env[idx, None] * SFX_GAIN
    music, sr = sf.read(f'{aud}/music.wav'); m = min(N, len(music)); mix[:m] += music[:m] * MUSIC_GAIN
    g = ss(t / FADE_IN) * ss((total / FPS - t) / TAIL)
    mix *= g[:, None]
    sf.write(f'{out}/_mix.wav', mix, SR, subtype='PCM_24'); loudnorm(f'{out}/_mix.wav', f'{out}/_mixn.wav')
    encode((frame(f) for f in range(total)), total, W, H, f'{out}/_mixn.wav', f'{out}/film.mp4', scale)
    os.remove(f'{out}/_mix.wav'); os.remove(f'{out}/_mixn.wav')
    print('film', total / FPS, 's')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
