#!/usr/bin/env python3
"""Ambience beds, one seamless 27 s loop per scene, cut from CC0 field recordings (BigSoundBank).
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

def build(src):
    """one quiet layer per scene (plus at most one accent). Everything is low-passed: heard from a distance, never in the way of the music."""
    n = int(L * SR); S = {}
    # spring: night air in the lane, the town far off
    S['spring'] = loop(lp(hp(load(src, '0595'), 80), 600), 5, -40) + loop(lp(load(src, '0080'), 700), 10, -42)
    # rain: one layer of rain on the street, softened
    S['rain'] = loop(lp(load(src, '1289'), 4200), 10, -33)
    # autumn: wind moving through dry leaves
    S['autumn'] = loop(lp(hp(load(src, '0904'), 120), 3200), 30, -37) + loop(lp(load(src, '0080'), 600), 40, -43)
    # snow: wind muffled by snow
    S['snow'] = loop(lp(hp(load(src, '0595'), 70), 520), 30, -38) + loop(lp(load(src, '0080'), 450), 60, -44)
    return S

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
    for k, a in build(src).items():
        a = hp(a, 35)
        a = np.tanh(a / 0.45) * 0.45                                 # soft limit: stray clicks in the recordings must not set the level
        sf.write(os.path.join(out, k + '.wav'), a, SR, subtype='PCM_24')
        print(k, f'rms {20 * np.log10(rms(a)):.1f} dB  peak {20 * np.log10(np.abs(a).max()):.1f} dB')
