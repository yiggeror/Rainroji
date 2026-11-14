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
DUR = shots.FILM_DUR            # the soundtrack is laid out in film time; the picture's own clock is story time
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
    TL = {k_: shots.to_film(v_) for k_, v_ in shots.TL.items()}
    D = DUR

    def near(point, r0, r1):
        """Film-time envelope: 1 while the camera is within r0 metres of a place, 0 beyond r1."""
        d = np.linalg.norm(C[:, [0, 2]] - np.asarray(point)[None, :], axis=1)
        return np.interp(T, ts, np.clip((r1 - d) / (r1 - r0), 0, 1)).astype(np.float32)

    def blackbirds(times, g0=1.0):
        ids = ['3476', '3486', '1667', '3494', '1670', '3499']
        for i, (t0, pan) in enumerate(times):
            sid = ids[i % len(ids)]
            place(mix, fade(sfx(src, sid), 0.02, 0.2), t0, (0.05 if sid.startswith('16') else 0.075) * g0, pan)

    # ------------------------------------------------------------- music
    mus = load(os.path.join(src, 'music', 'berceuse_edit.wav'))
    place(mix, mus * (0.80 / np.abs(mus).max()), M0)          # the loudest bar of the piece sits just under full scale

    # ------------------------------------------------------------- spring: an orchard on an April morning
    sp0 = TL['spring_out']
    spring = env([(0, 0), (2.5, 1), (sp0 - 2, 1), (sp0 + 8, 0.35), (sp0 + 18, 0.0), (D, 0)])
    bed(mix, tame(level(filt(sfx(src, '1906'), 300), -35)), spring, offset=40)
    bed(mix, tame(level(filt(sfx(src, '0912'), 200), -38)), spring, offset=10)
    bed(mix, tame(level(filt(sfx(src, '1353'), 250, 7000), -41), -18), env([(0, 0), (3, 1), (sp0 - 8, 1), (sp0 + 2, 0), (D, 0)]), offset=20)
    blackbirds([(4.6, -0.5), (11.8, 0.45), (17.6, -0.2), (23.4, 0.6), (29.5, -0.6), (34.6, 0.3)])

    # ------------------------------------------------------------- the river (wherever the camera is low over water)
    br, au = TL['bridge'], TL['autumn']
    river = env([(0, 0), (sp0 - 6, 0), (sp0 + 2, 0.7), (TL['summer'], 0.6), (TL['follow'], 0.55), (br - 3, 0.5), (br, 0.75), (au + 2, 0.6),
                 (TL['ashore'] - 2, 0.45), (TL['ashore'] + 4, 0.12), (TL['wind'], 0.1), (TL['mist'], 0.0), (D, 0)])
    bed(mix, tame(level(filt(sfx(src, '3136'), 150, 9000), -31)), river)
    bed(mix, tame(level(filt(sfx(src, '3137'), 150, 9000), -34)), river, offset=20)

    # ------------------------------------------------------------- summer: meadow, garden, the green reach
    su = TL['summer']
    summer = env([(0, 0), (su - 6, 0), (su + 2, 1), (br - 4, 1), (br, 0.25), (au + 3, 0.0), (D, 0)])
    bed(mix, tame(level(filt(sfx(src, '2749'), 300), -37)), summer, offset=30)
    bed(mix, tame(level(filt(sfx(src, '0097'), 300), -39)), summer, offset=5)
    import sc_garden
    garden = near((sc_garden.wb(110.0, 12.0), 110.0), 30.0, 60.0)
    bed(mix, tame(level(filt(sfx(src, '1353'), 250, 7000), -39), -18), garden, offset=70)          # bees in the flower beds
    blackbirds([(su + 4.0, 0.5), (su + 12.5, -0.4), (su + 21.0, -0.6), (su + 29.0, 0.3)], 0.8)
    # the oars: one recorded stroke for every stroke of the animated rower
    row = sfx(src, '1514')
    picks = [5.95, 14.95, 19.9, 24.6, 31.1, 37.6, 44.75, 51.45, 57.75, 61.25]
    clips = []
    for p in picks:
        c_ = fade(row[int((p - 0.45) * SR):int((p + 2.1) * SR)], 0.15, 0.8)
        clips.append(filt(c_ / (np.abs(c_).max() + 1e-9), 120))
    t_a, t_b = sp0 + 2.0, br - 1.5
    n0 = int(math.ceil((shots.to_story(t_a) - boat.T_REF) / boat.T_STROKE))
    k = 0
    while True:
        ts_ = boat.T_REF + (n0 + k) * boat.T_STROKE          # story time of this stroke's catch
        tc = shots.to_film(ts_)
        if tc > t_b:
            break
        e = Env(tc, shots.PATH, LK.look)
        pos, _ = boat.boat_pose(ts_)
        d = float(np.linalg.norm(pos + [0, 0.3, 0] - e.C))
        sx, _, zf, _ = e.project(pos[None])
        pan = float(np.clip((sx[0] - 960) / 960, -1, 1)) * 0.7 if zf[0] > 0 else 0.0
        g = 0.34 * min(6.0 / max(d, 3.0), 1.3) * float(np.interp(tc, [t_a, t_a + 5, t_b - 4, t_b], [0, 1, 1, 0]))
        if g > 0.01:
            place(mix, clips[k % len(clips)], tc - 0.30, g, pan)
        k += 1

    # ------------------------------------------------------------- under the bridge: drips, and the arch answering
    drops = sfx(src, '1385')
    dr = np.zeros((int(6.0 * SR), 2), np.float32)
    for (td, src_t, g) in ((0.3, 0.05, 0.5), (1.15, 2.95, 0.8), (1.9, 5.8, 0.4), (2.7, 8.65, 0.9), (3.3, 11.55, 0.5), (4.2, 14.45, 0.7)):
        c_ = fade(drops[int(src_t * SR):int((src_t + 0.9) * SR)], 0.01, 0.3)
        i0 = int(td * SR)
        dr[i0:i0 + len(c_)] += c_[:len(dr) - i0] * g
    dr = filt(dr, 300)
    place(mix, dr * 0.16 + reverb(dr, 1.5, 0.30, seed=3)[:len(dr)], br - 2.0)
    arch = env([(0, 0), (br - 1.6, 0), (br, 1), (br + 1.2, 1), (br + 2.6, 0), (D, 0)])
    wat = np.zeros((N, 2), np.float32)
    bed(wat, level(filt(sfx(src, '3137'), 200, 6000), -33), arch, offset=8)
    a0, a1 = int((br - 2.1) * SR), int((br + 5.4) * SR)
    place(mix, reverb(wat[a0:a1], 1.4, 0.55, seed=4), br - 2.1)

    # ------------------------------------------------------------- autumn: wind in the poplars, rooks, the yard
    wi, mi = TL['wind'], TL['mist']
    autumn = env([(0, 0), (au - 2, 0), (au + 1.5, 1), (wi, 1), (wi + 6, 1.6), (mi - 1, 0.6), (mi + 4, 0.0), (D, 0)])
    gain = autumn * (0.30 + 1.0 * np.minimum(gT, 1.2))
    bed(mix, tame(level(filt(sfx(src, '0904'), 180), -30)), gain, offset=15)
    bed(mix, tame(level(filt(sfx(src, '0659'), 250), -34)), gain, offset=30)
    for (sid, t0, g, pan) in (('3464', au + 5.0, 0.035, -0.5), ('3465', au + 16.0, 0.03, 0.4), ('3464', au + 27.0, 0.028, 0.2)):
        place(mix, filt(fade(sfx(src, sid), 0.02, 0.3), 300, 2600), t0, g, pan)
    yard = env([(0, 0), (TL['ashore'], 0), (TL['ashore'] + 5, 1), (wi + 2, 1), (wi + 8, 0), (D, 0)])
    bed(mix, tame(level(filt(sfx(src, '0097'), 400), -42)), yard, offset=40)

    # ------------------------------------------------------------- the mist, and winter: almost nothing
    w0, ss, rn = TL['winter'], TL['sunset'], TL['rain']
    winter = env([(0, 0), (mi - 3, 0), (mi + 2, 0.8), (w0, 0.6), (ss, 0.7), (rn + 1, 0.3), (rn + 7, 0.0), (D, 0)])
    bed(mix, tame(level(filt(sfx(src, '0147'), 150, 3500), -41)), winter, offset=10)
    bed(mix, tame(level(filt(sfx(src, '0595'), 120, 1800), -40)), winter * (0.5 + 0.6 * gT), offset=5)
    # the magpie: a chatter from the gate, again as it goes, and its wings
    TF = shots.to_film(sc_poplars.T_FLY)
    for (sid, dt, g) in (('2764', -4.2, 0.11), ('2766', -3.75, 0.09), ('2767', -0.85, 0.12), ('2765', -0.45, 0.10), ('2764', 0.55, 0.07), ('2766', 2.4, 0.035)):
        c_ = fade(sfx(src, sid), 0.005, 0.08)
        place(mix, filt(c_, 400, 7000) + reverb(filt(c_, 400, 5000), 0.9, 0.10, seed=6)[:len(c_)], TF + dt, g, -0.05)
    wings = fade(sfx(src, '0476', 0.25, 2.2), 0.03, 0.5)
    place(mix, filt(wings, 200, 6000), TF - 0.05, 0.9, 0.0)
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
    bell = np.stack([resample_poly(bell[:, c_], up, down) for c_ in (0, 1)], axis=1).astype(np.float32)
    print('bell partial %.1f Hz (midi %.2f) -> %d, ratio %.4f' % (f0, midi, tgt, ratio))
    bell = filt(fade(bell, 0.005, 1.5), 180, 2400)
    place(mix, bell * 0.10 + reverb(bell, 2.6, 0.12, hi=2500, seed=8)[:len(bell)], ss - 3.5, 1.0, -0.25)

    # ------------------------------------------------------------- the spring rain, the thaw, and morning again
    rainT = np.array([float(LK.look(shots.to_story(t))['rain']) for t in ts])
    rain_env = np.interp(T, ts, rainT).astype(np.float32)
    bed(mix, tame(level(filt(sfx(src, '2679'), 200, 9000), -29), -14), rain_env, offset=2)
    bed(mix, tame(level(filt(sfx(src, '1290'), 250, 8000), -34), -16), rain_env, offset=6)
    drops = sfx(src, '1384')                                   # meltwater falling from the boughs
    for i, (dt, src_t, g, pan) in enumerate(((3.4, 0.2, 0.10, -0.4), (4.6, 3.05, 0.14, 0.3), (5.5, 5.9, 0.10, -0.1), (6.7, 8.75, 0.16, 0.5), (7.6, 11.65, 0.12, -0.5),
                                              (8.8, 14.55, 0.14, 0.2), (10.1, 17.45, 0.10, -0.3))):
        c_ = filt(fade(drops[int(src_t * SR):int((src_t + 0.9) * SR)], 0.01, 0.3), 300)
        place(mix, c_ + reverb(c_, 0.8, 0.12, seed=11)[:len(c_)], rn + dt, g, pan)
    mo = TL['morning']
    dawn = env([(0, 0), (mo - 2.5, 0), (mo + 2.5, 0.9), (mo + 8, 1.0), (D - 3, 1.0), (D, 0.8)])
    bed(mix, tame(level(filt(sfx(src, '1906'), 300), -34)), dawn, offset=120)
    bed(mix, tame(level(filt(sfx(src, '0912'), 200), -38)), dawn, offset=60)
    blackbirds([(mo + 1.6, 0.4), (mo + 5.2, -0.3), (mo + 9.4, -0.5), (mo + 13.5, 0.5), (mo + 17.5, -0.2)])

    # ------------------------------------------------------------- master
    mix *= env([(0, 0), (0.4, 1), (D - 2.0, 1), (D - 0.1, 0), (D, 0)])[:, None]
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
