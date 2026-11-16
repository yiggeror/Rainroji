#!/usr/bin/env python3
"""Ambience beds, one seamless 27 s loop per scene, cut from CC0 field recordings (BigSoundBank) plus a little synthesis.
sfx.py SRC_DIR OUT_DIR"""
import sys, os, glob
import numpy as np, soundfile as sf, librosa
import scipy.signal as sg
SR = 44100; L = 27.0; XF = 3.0

def load(src, sid):
    y, sr = sf.read(os.path.join(src, sid + '.wav'), always_2d=True)      # sources are converted to 44.1 kHz stereo wav first (get_sfx.sh)
    assert sr == SR
    return y.astype(np.float64)

def lp(x, f, o=2): return sg.sosfilt(sg.butter(o, f / (SR / 2), output='sos'), x, axis=0)
def hp(x, f, o=2): return sg.sosfilt(sg.butter(o, f / (SR / 2), 'high', output='sos'), x, axis=0)
def db(x): return 10 ** (x / 20)
def rms(x): return np.sqrt((x ** 2).mean() + 1e-12)

def loop(x, start, level_db, length=L, xf=XF):
    """cut `length` seconds starting at `start`, cross-fading its tail into its head so it repeats seamlessly; set RMS level"""
    n = int(length * SR); k = int(xf * SR); s = int(start * SR)
    if s + n + k > len(x): s = max(0, len(x) - n - k)
    seg = x[s:s + n + k].copy()
    if len(seg) < n + k: seg = np.tile(seg, (int(np.ceil((n + k) / len(seg))), 1))[: n + k]
    t = np.linspace(0, np.pi / 2, k)[:, None]
    out = seg[:n].copy()
    out[:k] = seg[:k] * np.sin(t) + seg[n:n + k] * np.cos(t)
    return out * (db(level_db) / rms(out))

def place(n, x, t, gain_db, pan=0.5, fade=0.05):
    """one-shot placed at t (wraps round the loop)"""
    out = np.zeros((n, 2)); x = x.copy()
    k = int(fade * SR); x[:k] *= np.linspace(0, 1, k)[:, None]; x[-k:] *= np.linspace(1, 0, k)[:, None]
    x = x * db(gain_db) / (np.abs(x).max() + 1e-9)
    x[:, 0] *= np.sqrt(1 - pan) * 1.414; x[:, 1] *= np.sqrt(pan) * 1.414
    s = int(t * SR) % n
    idx = (s + np.arange(len(x))) % n
    np.add.at(out, idx, x)
    return out

def hum(n, f0=100.0, level_db=-52, seed=0):
    t = np.arange(n) / SR; rng = np.random.default_rng(seed)
    f0 = round(f0 * L) / L                                            # whole number of cycles in the loop
    s = sum(a * np.sin(2 * np.pi * f0 * k * t + rng.random() * 6.28) for k, a in ((1, 1.0), (2, 0.5), (3, 0.35), (5, 0.12), (7, 0.06)))
    s = s * (1 + 0.08 * np.sin(2 * np.pi * round(0.7 * L) / L * t))
    return np.stack([s, s], 1) * db(level_db) / rms(s)

def build(src):
    n = int(L * SR); S = {}
    # 1 roof: a dawn chorus heard through fog, the town barely awake, pigeons taking off
    a = loop(lp(load(src, '0222'), 5200), 20, -31) + loop(lp(load(src, '0080'), 900), 10, -37) + loop(lp(hp(load(src, '0595'), 80), 700), 5, -38)
    wing = load(src, '0476'); w2 = load(src, '0840')
    for (t, g, p, w_) in ((3.2, -22, 0.35, wing), (12.4, -25, 0.6, w2), (14.1, -27, 0.7, w2), (21.3, -23, 0.4, wing)): a += place(n, lp(w_, 4500), t, g, p)
    S['roof'] = a
    # 2 school after rain: frogs, swallows, dripping eaves, thunder walking away
    a = loop(lp(load(src, '0998'), 4200), 30, -33) + loop(lp(load(src, '3572'), 6000), 12, -35) + loop(load(src, '0621'), 8, -33) + loop(lp(load(src, '1470'), 5000), 20, -40)
    th = lp(load(src, '2718'), 420); th2 = lp(load(src, '3114'), 380)
    a += place(n, th[: int(11 * SR)], 5.5, -24, 0.65, fade=1.5) + place(n, th2[: int(9 * SR)], 16.5, -27, 0.6, fade=1.5)
    S['school'] = a
    # 3 rain: steady rain on asphalt and puddles, the city far away, a neon tube buzzing
    a = loop(load(src, '1289'), 10, -26) + loop(load(src, '1290'), 20, -29) + loop(lp(load(src, '1019'), 3000), 40, -31) + loop(lp(load(src, '0680'), 700), 20, -36) + hum(n, 100.0, -50)
    S['rain'] = a
    # 4 rail: evening insects in the fields, the train rolling past in the middle distance, a dog somewhere in the village
    tr = lp(hp(load(src, '3416'), 60), 2400)
    a = loop(lp(load(src, '1880'), 6000), 60, -34) + loop(lp(load(src, '1020'), 5500), 5, -42) + loop(tr, 9.0, -27, xf=4.0) + loop(lp(load(src, '2727'), 500), 60, -34)
    dog = lp(load(src, '0288'), 1800)
    a += place(n, dog[: int(4 * SR)], 7.0, -30, 0.75, fade=0.3) + place(n, dog[int(5 * SR): int(8 * SR)], 19.5, -33, 0.7, fade=0.3)
    S['rail'] = a
    # 5 snow: wind muffled by snow, the distant town, the sodium lamp's ballast
    a = loop(lp(hp(load(src, '0595'), 70), 650), 30, -31) + loop(lp(load(src, '1714'), 500), 20, -35) + loop(lp(load(src, '0080'), 500), 60, -39) + hum(n, 100.0, -54, seed=2)
    dg = lp(load(src, '2353'), 1100)
    a += place(n, dg[: int(3.5 * SR)], 15.0, -36, 0.3, fade=0.4)
    S['snow'] = a
    return S

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
    for k, a in build(src).items():
        a = hp(a, 35)
        a = np.tanh(a / 0.45) * 0.45                                 # soft limit: stray clicks in the recordings must not set the level
        sf.write(os.path.join(out, k + '.wav'), a, SR, subtype='PCM_24')
        print(k, f'rms {20 * np.log10(rms(a)):.1f} dB  peak {20 * np.log10(np.abs(a).max()):.1f} dB')
