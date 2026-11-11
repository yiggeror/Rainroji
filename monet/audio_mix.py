"""Build the soundtrack: music plus scene ambiences that follow the picture.

  python3 audio_mix.py SRC_DIR OUT.wav

SRC_DIR holds the downloaded sources (see CREDITS.md): gymno1.mp3 and sfx/<id>.<ext>.
Wind loudness follows the same gust function that bends the grass on screen.
"""
import sys, subprocess, glob, os
import numpy as np
from scipy.signal import butter, sosfilt
from world import Env, DUR

SR = 48000
N = int(DUR * SR)
T = np.arange(N) / SR


def load(path, start=0.0, dur=None):
    cmd = ['ffmpeg', '-loglevel', 'error', '-ss', str(start)]
    if dur:
        cmd += ['-t', str(dur)]
    cmd += ['-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.float32).reshape(-1, 2).copy()


def sfx(src, sid):
    return glob.glob(os.path.join(src, 'sfx', sid + '.*'))[0]


def filt(x, lo=None, hi=None):
    if lo:
        x = sosfilt(butter(2, lo, 'hp', fs=SR, output='sos'), x, axis=0)
    if hi:
        x = sosfilt(butter(2, hi, 'lp', fs=SR, output='sos'), x, axis=0)
    return x.astype(np.float32)


def level(x, db):
    """Scale so the RMS of the loudest half of the clip sits at db dBFS."""
    e = np.sqrt((x ** 2).mean(axis=1).reshape(-1)[:len(x) // 4800 * 4800].reshape(-1, 4800).mean(axis=1))
    ref = np.sqrt((np.sort(e)[len(e) // 2:] ** 2).mean()) + 1e-9
    return x * (10 ** (db / 20.0) / ref)


def env(points):
    """Piecewise-linear gain envelope over film time from (t, gain) points, smoothed."""
    p = np.array(points, np.float64)
    g = np.interp(T, p[:, 0], p[:, 1])
    return (g * g * (3 - 2 * g) if g.max() <= 1.0 else g).astype(np.float32)


def place(mix, x, t0, gain=None, pan=0.0):
    """Add clip x at film time t0 (looping is the caller's job), with optional envelope and pan."""
    i0 = int(t0 * SR)
    n = min(len(x), N - i0)
    if n <= 0:
        return
    seg = x[:n].copy()
    if pan:
        seg[:, 0] *= min(1.0, 1.0 - pan)
        seg[:, 1] *= min(1.0, 1.0 + pan)
    if gain is not None:
        seg *= gain[i0:i0 + n, None]
    mix[i0:i0 + n] += seg


def bed(mix, x, points, **kw):
    """Loop x under an envelope for as long as the envelope is open."""
    g = env(points)
    on = np.nonzero(g > 1e-4)[0]
    if len(on) == 0:
        return
    t0 = on[0] / SR
    need = on[-1] - on[0] + SR
    xf = 2 * SR                                   # 2 s crossfade at the loop point
    body = x
    while len(body) < need:
        k = np.linspace(0, 1, xf, dtype=np.float32)[:, None]
        body = np.concatenate([body[:-xf], body[-xf:] * (1 - k) + x[:xf] * k, x[xf:]])
    place(mix, body[:need], t0, g, **kw)


def main(src, out):
    mix = np.zeros((N, 2), np.float32)
    ts = np.arange(0, DUR, 0.1)
    wind = np.array([float(Env(t).wind(np.array([Env(t).camX]))[0]) for t in ts])
    wind = np.interp(T, ts, wind).astype(np.float32)

    # ---- music: the second half of the Gymnopedie, complete to its final chord
    m = load(os.path.join(src, 'gymno1.mp3'), 91.53)
    m[:int(0.35 * SR)] *= np.linspace(0, 1, int(0.35 * SR), dtype=np.float32)[:, None]
    if not os.environ.get('NO_MUSIC'):
        place(mix, level(m, -20.5), 3.6)
    music_only = mix.copy()

    # ---- dawn harbour: water against wood, far gulls, a sculling oar
    bed(mix, level(filt(load(sfx(src, '1444'), 2, 33), 90), -31), [(0, 0), (1.2, 1), (17, 1), (22, 0.45), (40, 0.4), (45, 0)])
    bed(mix, level(filt(load(sfx(src, '2573'), 62, 46), 350), -35), [(0.5, 0), (4, 1), (15, 1), (20.5, 0)], pan=0.25)
    bed(mix, level(filt(load(sfx(src, '1514'), 4, 40), 200, 5000), -37), [(4, 0), (6, 1), (15, 1), (19, 0)], pan=-0.35)

    # ---- the pond: morning chorus, frogs in the reeds, a fish breaking the surface
    bed(mix, level(filt(load(sfx(src, '0999'), 20, 60), 400), -33), [(17.5, 0), (22, 1), (41, 1), (47, 0.35), (60, 0.3), (65, 0)])
    bed(mix, level(filt(load(sfx(src, '2715'), 80, 60), 400), -34), [(19, 0), (24, 1), (42, 1), (46, 0)], pan=-0.3)
    bed(mix, level(filt(load(sfx(src, '0691'), 0, 34), 150, 6000), -37), [(20, 0), (25, 1), (40, 1), (45, 0)], pan=0.3)
    for t0, sid, pan in [(27.4, '1529', 0.3), (33.8, '1531', -0.4), (38.6, '1533', 0.5)]:
        place(mix, level(filt(load(sfx(src, sid)), 200), -30), t0, pan=pan)

    # ---- the meadow: wind running through tall grass, louder with every gust on screen
    g = env([(42, 0), (47, 1), (62, 1), (67, 0.5), (76, 0.3), (81, 0)]) * (0.45 + 1.1 * wind)
    w = level(filt(load(sfx(src, '0908'), 6, 38), 250), -27)
    wb = np.zeros((N, 2), np.float32)
    bed(wb, w, [(42, 0), (42.1, 1), (81, 1), (81.1, 0)])
    mix += wb * g[:, None]
    # a softer breath of wind in the willows earlier on
    mix += wb[::-1] * (env([(20, 0), (26, 0.3), (40, 0.3), (43, 0)]) * (0.4 + 1.0 * wind))[:, None]

    # ---- haystacks: evening birds, swallows hunting overhead, the first crickets
    bed(mix, level(filt(load(sfx(src, '1859'), 28, 60), 500), -32), [(61, 0), (66, 1), (77, 1), (83, 0)])
    bed(mix, level(filt(load(sfx(src, '1015'), 11, 20), 1200), -36), [(64.5, 0), (67, 1), (76, 1), (79, 0)], pan=0.2)
    bed(mix, level(filt(load(sfx(src, '1020'), 1, 30), 1500), -45), [(66, 0), (72, 1), (82, 1), (90, 0.5), (100, 0)], pan=-0.4)

    # ---- dusk on the lagoon: slow water, night insects, six strokes of a far bell
    bed(mix, level(filt(load(sfx(src, '1446'), 20, 60), 120, 3500), -31), [(77, 0), (83, 1), (98, 1), (101.8, 0)])
    bed(mix, level(filt(load(sfx(src, '1880'), 30, 60), 1500), -44), [(80, 0), (87, 1), (99, 1), (101.8, 0)], pan=0.3)
    bell = filt(load(sfx(src, '0135')), 150, 2200)
    wet = bell.copy()                                           # distance: a few soft echoes
    for d, gdb in [(0.31, -9), (0.67, -13), (1.13, -17)]:
        k = int(d * SR)
        wet[k:] += bell[:-k] * 10 ** (gdb / 20.0)
    place(mix, level(wet, -32), 84.2, env([(84.2, 0), (84.6, 1), (99, 1), (101.5, 0)]), pan=-0.3)

    if os.environ.get('STEMS'):
        amb = mix - music_only
        for a in range(0, int(DUR), 6):
            r = lambda x: 20 * np.log10(np.sqrt((x[a * SR:(a + 6) * SR] ** 2).mean()) + 1e-9)
            print('%3d-%3ds  music %6.1f dB   ambience %6.1f dB' % (a, a + 6, r(music_only), r(amb)))
    # ---- master
    mix *= env([(0, 0), (1.0, 1), (99.8, 1), (DUR - 0.05, 0)])[:, None]
    mix = np.tanh(mix * 1.25) / 1.25
    mix *= 10 ** (-1.0 / 20) / np.abs(mix).max()
    pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', out],
                   input=pcm.tobytes(), check=True)
    print('wrote', out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
