"""Build the soundtrack: the Berceuse, and under it the sound of each season.

  python3 audio_mix.py SRC_DIR OUT.wav

SRC_DIR holds   music/berceuse_edit.wav   (made by audio/music_edit.py)
                sfx/<id>.<ext>            (fetched by audio/get_sfx.sh; see CREDITS.md)

Everything that moves on screen is heard from where it is: the oars are placed on the very
strokes of the animated rower and grow louder as the camera draws level, the wind in the
poplars follows the gust function that bends them, the magpie calls before it flies.
"""
import sys, subprocess, glob, os, math
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly
import scenes          # builds the world: the mix reads positions from it
import shots, boat, sc_poplars
import look as LK
from core import Env
import world as W

SR = 48000
DUR = shots.DUR
N = int(DUR * SR)
T = np.arange(N) / SR
M0 = shots.MUSIC_T0
rng = np.random.default_rng(57)


def load(path, start=0.0, dur=None):
    cmd = ['ffmpeg', '-loglevel', 'error', '-ss', str(start)]
    if dur:
        cmd += ['-t', str(dur)]
    cmd += ['-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.float32).reshape(-1, 2).copy()


def sfx(src, sid, start=0.0, dur=None):
    return load(glob.glob(os.path.join(src, 'sfx', sid + '.*'))[0], start, dur)


def filt(x, lo=None, hi=None, order=2):
    if lo:
        x = sosfilt(butter(order, lo, 'hp', fs=SR, output='sos'), x, axis=0)
    if hi:
        x = sosfilt(butter(order, hi, 'lp', fs=SR, output='sos'), x, axis=0)
    return x.astype(np.float32)


def level(x, db):
    """Scale so that the RMS of the louder half of the clip sits at db dBFS."""
    k = 4800
    e = np.sqrt((x ** 2).mean(axis=1)[:len(x) // k * k].reshape(-1, k).mean(axis=1))
    ref = np.sqrt((np.sort(e)[len(e) // 2:] ** 2).mean()) + 1e-9
    return x * (10 ** (db / 20.0) / ref)


def tame(x, ceil_db=-12.0):
    """Keep an ambience from jumping out: soft-limit anything far above its own bed."""
    c = 10 ** (ceil_db / 20.0)
    return (np.tanh(x / c) * c).astype(np.float32)


def env(points):
    p = np.array(points, np.float64)
    g = np.interp(T, p[:, 0], p[:, 1])
    return g.astype(np.float32)


def fade(x, a=0.02, b=0.05):
    x = x.copy()
    na, nb = min(int(a * SR), len(x) // 2), min(int(b * SR), len(x) // 2)
    x[:na] *= np.linspace(0, 1, na)[:, None]
    x[-nb:] *= np.linspace(1, 0, nb)[:, None]
    return x


def place(mix, x, t0, gain=1.0, pan=0.0):
    """Add clip x at film time t0, with gain (scalar or film-time envelope) and pan (-1 .. 1)."""
    i0 = int(t0 * SR)
    if i0 < 0:
        x = x[-i0:]
        i0 = 0
    n = min(len(x), N - i0)
    if n <= 0:
        return
    seg = x[:n].copy()
    seg[:, 0] *= min(1.0, 1.0 - pan)
    seg[:, 1] *= min(1.0, 1.0 + pan)
    if np.ndim(gain):
        seg *= gain[i0:i0 + n, None]
    else:
        seg *= gain
    mix[i0:i0 + n] += seg


def bed(mix, x, gain, offset=0.0):
    """Loop an ambience under the whole film with a film-time gain envelope."""
    xf = int(1.5 * SR)
    x = x[int(offset * SR):]
    out = np.zeros((N, 2), np.float32)
    pos = 0
    first = True
    while pos < N:
        seg = x.copy()
        w = np.ones(len(seg), np.float32)
        if not first:
            w[:xf] = np.sin(np.linspace(0, np.pi / 2, xf)) ** 2
        w[-xf:] = np.cos(np.linspace(0, np.pi / 2, xf)) ** 2
        n = min(len(seg), N - pos)
        out[pos:pos + n] += (seg * w[:, None])[:n]
        pos += len(seg) - xf
        first = False
    mix += out * gain[:, None]


def reverb(x, rt=1.6, wet=1.0, lo=250.0, hi=5000.0, seed=1):
    r = np.random.default_rng(seed)
    n = int(rt * 1.4 * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal((n, 2)) * np.exp(-6.9 * t / rt)[:, None]
    ir[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    ir = filt(ir, lo, hi)
    ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
    out = np.stack([fftconvolve(x[:, c], ir[:, c])[:len(x) + n] for c in (0, 1)], axis=1)
    return (out * wet).astype(np.float32)


def camera_track(step=0.05):
    ts = np.arange(0, DUR, step)
    C, gust = [], []
    for t in ts:
        e = Env(t, shots.PATH, LK.look)
        C.append(e.C)
        gust.append(float(e.wind(np.array([e.C[0]]), np.array([e.C[2]]))[0]))
    return ts, np.array(C), np.array(gust)


def build(src):
    mix = np.zeros((N, 2), np.float32)
    ts, C, gust = camera_track()
    gT = np.interp(T, ts, gust).astype(np.float32)

    # ------------------------------------------------------------- music
    mus = load(os.path.join(src, 'music', 'berceuse_edit.wav'))
    place(mix, mus * 1.9, M0)

    # ------------------------------------------------------------- spring: an orchard on an April morning
    spring = env([(0, 0), (2.5, 1), (36, 1), (47, 0.35), (58, 0.0), (DUR, 0)])
    bed(mix, tame(level(filt(sfx(src, '1906'), 300), -35)), spring, offset=40)
    bed(mix, tame(level(filt(sfx(src, '0912'), 200), -38)), spring, offset=10)
    bed(mix, tame(level(filt(sfx(src, '1353'), 250, 7000), -41), -18), env([(0, 0), (3, 1), (30, 1), (40, 0), (DUR, 0)]), offset=20)
    for (sid, t0, g, pan) in (('3476', 5.2, 0.085, -0.5), ('3486', 13.4, 0.07, 0.45), ('1667', 18.6, 0.05, -0.2), ('3494', 23.9, 0.075, 0.6),
                              ('1670', 29.5, 0.05, -0.6), ('3499', 34.2, 0.055, 0.3)):
        place(mix, fade(sfx(src, sid), 0.02, 0.2), t0, g, pan)

    # ------------------------------------------------------------- the river
    river = env([(0, 0), (30, 0), (37, 0.6), (41, 1.0), (49, 1.0), (54, 0.55), (76, 0.5), (79.5, 0.75), (83, 0.6), (98, 0.45),
                 (104, 0.0), (DUR, 0)])
    bed(mix, tame(level(filt(sfx(src, '3136'), 150, 9000), -31)), river)
    bed(mix, tame(level(filt(sfx(src, '3137'), 150, 9000), -34)), river, offset=20)

    # ------------------------------------------------------------- summer: the green reach
    summer = env([(0, 0), (46, 0), (53, 1), (76, 1), (80, 0.25), (84, 0.0), (DUR, 0)])
    bed(mix, tame(level(filt(sfx(src, '2749'), 300), -37)), summer, offset=30)
    bed(mix, tame(level(filt(sfx(src, '0097'), 300), -40)), summer, offset=5)
    # the oars: one recorded stroke for every stroke of the animated rower
    row = sfx(src, '1514')
    picks = [5.95, 14.95, 19.9, 24.6, 31.1, 37.6, 44.75, 51.45, 57.75, 61.25]
    clips = []
    for p in picks:
        c = fade(row[int((p - 0.45) * SR):int((p + 2.1) * SR)], 0.15, 0.8)
        clips.append(filt(c / (np.abs(c).max() + 1e-9), 120))
    n0 = int(math.ceil((47.0 - boat.T_REF) / boat.T_STROKE))
    k = 0
    while True:
        tc = boat.T_REF + (n0 + k) * boat.T_STROKE
        if tc > 78.5:
            break
        e = Env(tc, shots.PATH, LK.look)
        pos, _ = boat.boat_pose(tc)
        d = float(np.linalg.norm(pos + [0, 0.3, 0] - e.C))
        sx, _, zf, _ = e.project(pos[None])
        pan = float(np.clip((sx[0] - 960) / 960, -1, 1)) * 0.7 if zf[0] > 0 else 0.0
        g = 0.34 * min(6.0 / max(d, 3.0), 1.3) * float(np.interp(tc, [47, 52, 74, 78.5], [0, 1, 1, 0]))
        place(mix, clips[k % len(clips)], tc - 0.30, g, pan)
        k += 1

    # ------------------------------------------------------------- under the bridge: drips, and the arch answering
    drops = sfx(src, '1385')
    dr = np.zeros((int(6.0 * SR), 2), np.float32)
    for (td, src_t, g) in ((0.3, 0.05, 0.5), (1.15, 2.95, 0.8), (1.9, 5.8, 0.4), (2.7, 8.65, 0.9), (3.3, 11.55, 0.5), (4.2, 14.45, 0.7)):
        c = fade(drops[int(src_t * SR):int((src_t + 0.9) * SR)], 0.01, 0.3)
        i0 = int(td * SR)
        dr[i0:i0 + len(c)] += c[:len(dr) - i0] * g
    dr = filt(dr, 300)
    place(mix, dr * 0.16 + reverb(dr, 1.5, 0.30, seed=3)[:len(dr)], 78.6)
    arch = env([(0, 0), (79.0, 0), (80.6, 1), (81.8, 1), (83.2, 0), (DUR, 0)])
    wat = np.zeros((N, 2), np.float32)
    bed(wat, level(filt(sfx(src, '3137'), 200, 6000), -33), arch, offset=8)
    a0, a1 = int(78.5 * SR), int(86.0 * SR)
    wet = reverb(wat[a0:a1], 1.4, 0.55, seed=4)
    place(mix, wet, 78.5)

    # ------------------------------------------------------------- autumn: wind in the poplars, rooks far off
    autumn = env([(0, 0), (81.5, 0), (84.5, 1), (101, 1), (106.5, 0.45), (110, 0.0), (DUR, 0)])
    gain = autumn * (0.30 + 1.0 * gT)
    bed(mix, tame(level(filt(sfx(src, '0904'), 180), -30)), gain, offset=15)
    bed(mix, tame(level(filt(sfx(src, '0659'), 250), -34)), gain, offset=30)
    for (sid, t0, g, pan) in (('3464', 88.4, 0.035, -0.5), ('3465', 95.6, 0.03, 0.4)):
        place(mix, filt(fade(sfx(src, sid), 0.02, 0.3), 300, 2600), t0, g, pan)

    # ------------------------------------------------------------- the mist, and winter: almost nothing
    winter = env([(0, 0), (103, 0), (108, 0.8), (114, 0.6), (136, 0.7), (143, 1.0), (146.0, 0.5), (DUR, 0)])
    bed(mix, tame(level(filt(sfx(src, '0147'), 150, 3500), -41)), winter, offset=10)
    bed(mix, tame(level(filt(sfx(src, '0595'), 120, 1800), -40)), winter * (0.5 + 0.6 * gT), offset=5)
    # the magpie: a chatter from the gate, again as it goes, and its wings
    for (sid, t0, g) in (('2764', 115.3, 0.11), ('2766', 115.75, 0.09), ('2767', 119.55, 0.12), ('2765', 119.95, 0.10), ('2764', 120.9, 0.07)):
        c = fade(sfx(src, sid), 0.005, 0.08)
        place(mix, filt(c, 400, 7000) + reverb(filt(c, 400, 5000), 0.9, 0.10, seed=6)[:len(c)], t0, g, -0.05)
    wings = fade(sfx(src, '0476', 0.25, 2.2), 0.03, 0.5)
    place(mix, filt(wings, 200, 6000), sc_poplars.T_FLY - 0.05, 0.9, 0.0)
    # five o'clock from the church across the river - retuned so that it sits inside the music's D flat
    bell = sfx(src, '3445')
    m = bell[:int(2.0 * SR)].mean(1)
    sp = np.abs(np.fft.rfft(m * np.hanning(len(m)), 1 << 18))
    fr = np.fft.rfftfreq(1 << 18, 1 / SR)
    band = (fr > 250) & (fr < 1100)
    f0 = fr[band][np.argmax(sp[band])]
    midi = 69 + 12 * math.log2(f0 / 440.0)
    targets = [n for n in range(48, 96) if n % 12 in (1, 5, 8)]          # D flat, F, A flat
    tgt = min(targets, key=lambda n: abs(n - midi))
    ratio = 2 ** ((tgt - midi) / 12.0)
    up, down = 1000, int(round(1000 * ratio))
    bell = np.stack([resample_poly(bell[:, c], up, down) for c in (0, 1)], axis=1).astype(np.float32)
    print('bell partial %.1f Hz (midi %.2f) -> %d, ratio %.4f' % (f0, midi, tgt, ratio))
    bell = filt(fade(bell, 0.005, 1.5), 180, 2400)
    place(mix, bell * 0.10 + reverb(bell, 2.6, 0.12, hi=2500, seed=8)[:len(bell)], 128.6, 1.0, -0.25)

    # ------------------------------------------------------------- master
    mix *= env([(0, 0), (0.4, 1), (DUR - 2.2, 1), (DUR - 0.15, 0), (DUR, 0)])[:, None]
    mix = filt(mix, 28)
    pk = np.abs(mix).max()
    print('peak before limiting %.3f' % pk)
    c = 0.89
    over = np.abs(mix) > 0.7
    mix = np.where(over, np.sign(mix) * (0.7 + (c - 0.7) * np.tanh((np.abs(mix) - 0.7) / (c - 0.7))), mix)
    return mix.astype(np.float32)


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    mix = build(src)
    k = SR * 3
    mm = mix.mean(1)
    print('rms per 3 s (dB):', np.round(20 * np.log10(np.sqrt((mm[:len(mm) // k * k].reshape(-1, k) ** 2).mean(1)) + 1e-9), 0).astype(int))
    p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le', out],
                         stdin=subprocess.PIPE)
    p.communicate(mix.tobytes())
    print('wrote', out)
