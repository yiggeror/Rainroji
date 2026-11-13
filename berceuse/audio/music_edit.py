import numpy as np, json
from scipy.signal import butter, sosfiltfilt
sr = 48000
x = np.fromfile('music/b48.raw', np.float32).reshape(-1, 2)
m = x.mean(1)
def onset_near(t, win=0.5):
    a, b = max(int((t - win) * sr), 0), int((t + win) * sr)
    seg = sosfiltfilt(butter(4, [60, 300], 'bp', fs=sr, output='sos'), m[a:b])
    e = np.convolve(np.abs(seg), np.ones(480) / 480, 'same')
    d = np.convolve(np.diff(e), np.ones(240) / 240, 'same')
    i = int(np.argmax(d)); j = i
    while j > 0 and d[j] > 0.15 * d[i]:
        j -= 1
    return (a + j) / sr
bars = [0.2, 4.2, 8.6, 12.3, 15.9, 19.5, 23.1, 26.8, 30.3, 33.8, 37.1, 40.4, 43.9, 47.4, 51.1, 54.7, 58.1, 61.3, 64.7, 68.1, 71.4, 74.5, 78.0, 81.8, 85.3, 88.5, 91.8, 95.0, 98.2, 101.2, 104.5, 108.2, 111.6, 114.6, 117.9, 121.5, 125.5, 128.8, 132.2, 135.8, 139.4, 142.7, 146.2, 150.0, 154.3, 158.2, 162.2, 166.0, 169.9, 173.6, 177.5, 181.3, 184.9, 188.4, 192.1, 196.0, 199.7, 203.3, 206.9, 210.9, 214.4, 217.8, 221.6, 225.7, 229.5, 233.2, 237.1, 241.0]
on = [onset_near(t, 0.45) for t in bars]
A_end, B_start = on[14], on[46]
print('cut', A_end, '->', B_start)
xf = int(0.050 * sr); pre = int(0.012 * sr)
a1 = int(A_end * sr) - pre; b0 = int(B_start * sr) - pre
A = x[:a1].copy(); B = x[b0 - xf:].copy()
g = np.ones(len(B)); n = int(7 * sr); g[:n] = 10 ** (-2.5 / 20 * (1 - np.linspace(0, 1, n)))
B = B * g[:, None]
out = np.concatenate([A[:-xf], A[-xf:] * np.cos(np.linspace(0, np.pi / 2, xf))[:, None] + B[:xf] * np.sin(np.linspace(0, np.pi / 2, xf))[:, None], B[xf:]])
print('duration', len(out) / sr, 'peak', np.abs(out).max())
out.astype(np.float32).tofile('music/edit48.raw')
shift = B_start - A_end
tl = [t for t in on[:14]] + [t - shift for t in on[46:]]
names = list(range(1, 15)) + list(range(47, 47 + len(on[46:])))
json.dump(dict(bars=[[n_, round(float(t), 3)] for n_, t in zip(names, tl)], cut=float(A_end), dur=len(out) / sr), open('music/timeline.json', 'w'))
print([(n_, round(t, 1)) for n_, t in zip(names, tl)])
mm = out.mean(1); k = sr * 3
print(np.round(20 * np.log10(np.sqrt((mm[:len(mm) // k * k].reshape(-1, k) ** 2).mean(1)) + 1e-9), 1))
