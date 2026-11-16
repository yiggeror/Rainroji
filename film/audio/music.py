#!/usr/bin/env python3
"""Original score: slow felt-piano chords and a small melody, sent through a 'worn tape' chain
(slow-down, wow & flutter, low-pass, long reverb, hiss).  music.py OUT.wav [seconds]
6 bars of 4.5 s per scene -> every scene change falls on a bar line."""
import sys, os, subprocess, tempfile
import numpy as np, mido
import scipy.signal as sg
import soundfile as sf

SR = 44100
BAR = 4.5; BEAT = BAR / 4
SLOW = 39 / 40.0                 # tape runs slow: pitch -44 cents
SF2 = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
N = dict(A1=33, C2=36, Cs2=37, E2=40, Fs2=42, Gs2=44, A2=45, B2=47, Cs3=49, Ds3=51, E3=52, Fs3=54, Gs3=56, A3=57, B3=59, Cs4=61, Ds4=63, E4=64, Fs4=66, Gs4=68, A4=69, B4=71,
         Cs5=73, Ds5=75, E5=76, Fs5=78, Gs5=80, A5=81, B5=83)
CH = {   # left hand, right hand
    'A':    ([N['A2'], N['E3']], [N['Cs4'], N['E4'], N['Gs4']]),
    'E/G#': ([N['Gs2'], N['E3']], [N['B3'], N['E4'], N['Gs4']]),
    'F#m':  ([N['Fs2'], N['Cs3']], [N['A3'], N['Cs4'], N['E4']]),
    'C#m':  ([N['Cs3'], N['Gs3']], [N['B3'], N['E4'], N['Gs4']]),
    'Bsus': ([N['B2'], N['Fs3']], [N['B3'], N['E4'], N['Fs4']]),
    'G#m':  ([N['Gs2'], N['Ds3']], [N['B3'], N['Ds4'], N['Fs4']]),
    'E/B':  ([N['B2'], N['E3']], [N['Gs3'], N['B3'], N['E4']]),
    'F#m9': ([N['Fs2'], N['Cs3']], [N['A3'], N['E4'], N['Gs4']]),
    'Aend': ([N['A1'], N['A2'], N['E3']], [N['B3'], N['Cs4'], N['E4'], N['Gs4']]),
}
P1 = ['A', 'E/G#', 'F#m', 'C#m', 'A', 'Bsus']
P2 = ['A', 'G#m', 'C#m', 'E/B', 'F#m9', 'Bsus']
M1 = [[(0.0, 'Gs5', 2.0), (2.0, 'E5', 1.0), (3.0, 'Fs5', 1.0)], [(0.0, 'Ds5', 2.5), (2.5, 'B4', 1.5)], [(0.0, 'Cs5', 1.0), (1.0, 'E5', 1.0), (2.0, 'Gs5', 2.0)],
      [(0.0, 'Fs5', 1.5), (1.5, 'E5', 1.5), (3.0, 'B4', 1.0)], [(0.0, 'Cs5', 2.0), (2.0, 'A4', 1.0), (3.0, 'Cs5', 1.0)], [(0.0, 'B4', 2.0), (2.0, 'Fs5', 2.0)]]
M2 = [[(1.0, 'E5', 3.0)], [(0.0, 'B4', 2.0), (2.0, 'Gs4', 2.0)], [(1.0, 'A4', 2.0), (3.0, 'Cs5', 1.0)], [(0.0, 'B4', 4.0)], [(1.0, 'E5', 1.0), (2.0, 'Cs5', 2.0)], [(0.0, 'Ds5', 2.0), (2.0, 'B4', 2.0)]]
M3 = [[(2.0, 'Gs5', 2.0)], [], [(1.0, 'E5', 3.0)], [], [(0.0, 'Cs5', 2.0), (2.0, 'E5', 2.0)], [(2.0, 'Ds5', 2.0)]]

def compose():
    """returns piano notes and bell notes as (start_s, dur_s, midi, velocity)"""
    rng = np.random.default_rng(7)
    piano, bell, bars = [], [], []
    def chord(t, name, vel=46, roll=0.045, dur=BAR * 1.05, low=False):
        lh, rh = CH[name]
        notes = ([lh[0] - 12] if low else []) + lh + rh
        for i, n in enumerate(notes):
            piano.append((t + i * roll + rng.normal(0, 0.008), dur, n, int(vel + rng.normal(0, 3) - (4 if i == 0 else 0) + (3 if i == len(notes) - 1 else 0))))
    def arp(t, name, vel=34):
        lh, rh = CH[name]
        seq = [lh[0], lh[1], rh[0], rh[1], rh[2], rh[1], rh[0], lh[1]]
        for i, n in enumerate(seq):
            piano.append((t + i * BEAT / 2 + rng.normal(0, 0.012), BEAT * 1.6, n, int(vel + rng.normal(0, 3) + (5 if i == 0 else 0))))
    def mel(t, m, vel, to_piano=True, to_bell=0.0, octave=0):
        for (b, n, d) in m:
            tt = t + b * BEAT + rng.normal(0, 0.015)
            if to_piano: piano.append((tt, d * BEAT * 1.1, N[n] + octave, int(vel + rng.normal(0, 3))))
            if to_bell > 0: bell.append((tt + 0.01, d * BEAT, N[n] + 12 + octave, int(vel * to_bell)))
    t = 0.0
    # 1  dawn: bare chords, a few high echoes
    for i, c in enumerate(P1):
        chord(t, c, vel=44, low=(i % 2 == 0)); mel(t, M3[i], 40, to_piano=True, to_bell=0.0); bars.append((t, c)); t += BAR
    # 2  after rain: the melody appears, a music box an octave above it
    for i, c in enumerate(P2):
        chord(t, c, vel=46, low=(i in (0, 2, 4))); mel(t, M1[i], 56, to_bell=0.55); bars.append((t, c)); t += BAR
    # 3  rain at night: broken chords, the melody lower and sparser
    for i, c in enumerate(P1):
        arp(t, c, vel=36); chord(t, c, vel=34, roll=0.03, low=(i == 0)); mel(t, M2[i], 52, to_bell=0.0); bars.append((t, c)); t += BAR
    # 4  dusk: everything together
    for i, c in enumerate(P2):
        arp(t, c, vel=38); chord(t, c, vel=40, low=True); mel(t, M1[i], 60, to_bell=0.6); bars.append((t, c)); t += BAR
    # 5  snow: back to almost nothing; the music box alone remembers the tune
    for i, c in enumerate(P1):
        chord(t, c, vel=40 - i, low=(i % 2 == 0), roll=0.06); mel(t, M1[i] if i < 4 else M3[i], 44, to_piano=False, to_bell=1.0, octave=-12); bars.append((t, c)); t += BAR
    chord(t, 'Aend', vel=38, roll=0.09, dur=BAR * 2); bars.append((t, 'A')); t += BAR
    return piano, bell, bars, t

def render_midi(notes, program, path_wav, gain=1.0):
    mid = mido.MidiFile(ticks_per_beat=480); tr = mido.MidiTrack(); mid.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo', tempo=500000, time=0)); tr.append(mido.Message('program_change', program=program, time=0))
    ev = []
    for (t, d, n, v) in notes:
        t = max(t, 0) * SLOW; d = d * SLOW
        ev.append((t, 1, n, max(1, min(127, v)))); ev.append((t + d, 0, n, 0))
    ev.sort()
    last = 0
    for (t, on, n, v) in ev:
        tick = int(round(t * 960)); tr.append(mido.Message('note_on' if on else 'note_off', note=n, velocity=v, time=tick - last)); last = tick
    tr.append(mido.MetaMessage('end_of_track', time=960 * 8))
    with tempfile.TemporaryDirectory() as td:
        mp = os.path.join(td, 'a.mid'); mid.save(mp)
        subprocess.run(['fluidsynth', '-ni', '-g', '0.6', '-R', '0', '-C', '0', '-r', str(SR), '-F', path_wav, SF2, mp], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    x, sr = sf.read(path_wav)
    return x * gain

def slow_down(x):
    return sg.resample_poly(x, 40, 39, axis=0)

def wow(x, depth_ms=1.4, rate=0.33, flutter_ms=0.035, frate=5.7, seed=0):
    n = len(x); t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    drift = sg.lfilter(*sg.butter(1, 0.25 / (SR / 2)), rng.normal(0, 1, n)); drift = drift / (np.abs(drift).max() + 1e-9)
    d = (depth_ms * 0.6 * np.sin(2 * np.pi * rate * t) + depth_ms * 0.7 * drift + flutter_ms * np.sin(2 * np.pi * frate * t + 1.3)) * 1e-3 * SR
    idx = np.clip(np.arange(n) + d, 0, n - 1)
    return np.stack([np.interp(idx, np.arange(n), x[:, c]) for c in range(x.shape[1])], 1)

def reverb_ir(rt60=4.8, length=6.5, pre=0.028, seed=1, lo=180, hi=2800):
    rng = np.random.default_rng(seed); n = int(length * SR)
    t = np.arange(n) / SR
    ir = rng.normal(0, 1, (n, 2)) * np.exp(-6.9 * t / rt60)[:, None]
    ir = sg.sosfilt(sg.butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), ir, axis=0)
    ir[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))[:, None]
    ir = np.concatenate([np.zeros((int(pre * SR), 2)), ir])
    return ir / np.sqrt((ir ** 2).sum(0)).mean()

def reverb(x, ir, wet):
    y = np.stack([sg.fftconvolve(x[:, c], ir[:, c]) for c in range(2)], 1)[: len(x) + len(ir)]
    out = np.zeros((len(y), 2)); out[: len(x)] = x * (1 - wet * 0.5)
    return out + y * wet * 0.5

def lp(x, f, order=2): return sg.sosfilt(sg.butter(order, f / (SR / 2), output='sos'), x, axis=0)
def hp(x, f, order=2): return sg.sosfilt(sg.butter(order, f / (SR / 2), 'high', output='sos'), x, axis=0)

def pad(bars, total, level=0.05):
    n = int(total * SR); out = np.zeros((n, 2)); t_all = np.arange(n) / SR
    rng = np.random.default_rng(3)
    k = 2 ** (-44 / 1200)
    for i, (t0, name) in enumerate(bars):
        lh, rh = CH[name]
        dur = BAR + 3.0
        m = (t_all >= t0 - 1.2) & (t_all < t0 + dur)
        tt = t_all[m] - (t0 - 1.2)
        env = np.clip(tt / 2.2, 0, 1) * np.clip((dur + 1.2 - tt) / 3.0, 0, 1)
        env = env * env * (3 - 2 * env)
        sec = min(i // 6, 4); lv = level * [0.55, 0.8, 0.9, 1.15, 0.7][sec]
        for nn in (lh[0] + 12, lh[1] + 12, rh[0], rh[2]):
            f = 440 * 2 ** ((nn - 69) / 12) * k
            for det, pan in ((-0.0025, 0.3), (0.0025, 0.7), (0.0, 0.5)):
                ph = rng.random() * 6.28
                s = np.sin(2 * np.pi * f * (1 + det) * tt + ph) + 0.25 * np.sin(2 * np.pi * 2 * f * (1 + det) * tt + ph * 2) + 0.08 * np.sin(2 * np.pi * 3 * f * (1 + det) * tt)
                s = s * env * lv / 3 * (1 + 0.15 * np.sin(2 * np.pi * 0.17 * tt + ph))
                out[m, 0] += s * (1 - pan); out[m, 1] += s * pan
    return out

def noise_bed(n, seed=5):
    rng = np.random.default_rng(seed)
    w = rng.normal(0, 1, (n, 2))
    pink = sg.lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], w, axis=0)
    hiss = lp(hp(pink, 400), 6000) * 0.0035
    cr = np.zeros((n, 2)); k = rng.random(n) < (2.2 / SR)
    amp = rng.uniform(0.2, 1.0, k.sum()) ** 3
    cr[k, 0] = amp * rng.choice([-1, 1], k.sum()); cr[k, 1] = cr[k, 0] * rng.uniform(0.5, 1, k.sum())
    cr = lp(hp(cr, 900), 5000) * 0.05
    rumble = lp(w, 50) * 0.004
    return hiss + cr + rumble

def main(out, total=None):
    piano, bell, bars, T_end = compose()
    total = total or T_end + 5.0
    with tempfile.TemporaryDirectory() as td:
        p = render_midi(piano, 0, os.path.join(td, 'p.wav')); b = render_midi(bell, 10, os.path.join(td, 'b.wav'))
    p = slow_down(p); b = slow_down(b)
    n = int((total + 8) * SR)
    def fit(x):
        y = np.zeros((n, 2)); m = min(n, len(x)); y[:m] = x[:m]; return y
    p = fit(p); b = fit(b)
    p = wow(p, seed=1); b = wow(b, depth_ms=2.0, seed=2)
    p = lp(hp(p, 55), 1900); p = lp(p, 4200, 1)
    p = np.tanh(p * 2.2) / 2.2
    b = lp(hp(b, 300), 2600) * 0.5
    ir = reverb_ir(); ir2 = reverb_ir(rt60=6.5, length=8.0, seed=4, hi=2400)
    mix = reverb(p, ir, 0.55)[:n] + reverb(b, ir2, 0.95)[:n]
    pd = lp(pad(bars, total + 8), 1400)
    mix = mix + reverb(pd, ir2, 0.6)[:n]
    mix = mix / (np.abs(mix).max() + 1e-9) * 0.7
    mix = mix + noise_bed(n)
    # gentle glue + fades
    mix = np.tanh(mix * 1.3) / 1.3
    t = np.arange(n) / SR
    fade = np.clip(t / 1.5, 0, 1) * np.clip((total - t) / 5.0, 0, 1)
    mix = (mix * fade[:, None])[: int(total * SR)]
    rms = np.sqrt((mix ** 2).mean()); mix = mix * (10 ** (-21 / 20) / rms)
    mix = np.clip(mix, -0.98, 0.98)
    sf.write(out, mix, SR, subtype='PCM_24')
    print('music', out, f'{total:.1f}s', 'bars', len(bars))

if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else None)
