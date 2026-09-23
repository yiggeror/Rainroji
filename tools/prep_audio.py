#!/usr/bin/env python3
"""Download, trim, loop and encode the recorded sound assets for the
multi-file site version (site/audio/).

Requires: numpy, imageio-ffmpeg  (pip install numpy imageio-ffmpeg)
All sources are CC0 / public domain; see site/audio/CREDITS.md.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.audio-cache')
OUT = os.path.join(ROOT, 'site', 'audio')
SR = 44100
UA = 'RainrojiBuild/1.0 (https://github.com/yiggeror/Rainroji)'

SOURCES = {
    'street': ('https://cdn.freesound.org/previews/380/380651_5902878-hq.mp3',
               'Light rain on street.wav', 'BonnyOrbit', 'https://freesound.org/people/BonnyOrbit/sounds/380651/', 'CC0 1.0'),
    'drain': ('https://cdn.freesound.org/previews/201/201548_53430-hq.mp3',
              'Rain and Drain.wav', 'Moonlight Dancer', 'https://freesound.org/people/Moonlight%20Dancer/sounds/201548/', 'CC0 1.0'),
    'roof': ('https://cdn.freesound.org/previews/645/645923_5902878-hq.mp3',
             'Rain coming down from roof.wav', 'BonnyOrbit', 'https://freesound.org/people/BonnyOrbit/sounds/645923/', 'CC0 1.0'),
    'gutter': ('https://cdn.freesound.org/previews/734/734164_11519060-hq.mp3',
               'rooftop gutter water', 'bruno.auzet', 'https://freesound.org/people/bruno.auzet/sounds/734164/', 'CC0 1.0'),
    'drops': ('https://cdn.freesound.org/previews/498/498999_10821817-hq.mp3',
              '12. Single drops od water.wav', '16G_Panska_Sand_Nikolas', 'https://freesound.org/people/16G_Panska_Sand_Nikolas/sounds/498999/', 'CC0 1.0'),
    'drip1': ('https://cdn.freesound.org/previews/546/546279_4937681-hq.mp3',
              'Single drip - dripping', 'Mega-X-stream', 'https://freesound.org/people/Mega-X-stream/sounds/546279/', 'CC0 1.0'),
    'drip2': ('https://cdn.freesound.org/previews/667/667386_14357477-hq.mp3',
              'droplet', 'MasterSuite', 'https://freesound.org/people/MasterSuite/sounds/667386/', 'CC0 1.0'),
    'crossing': ('https://cdn.freesound.org/previews/490/490524_371140-hq.mp3',
                 'TRAIN CROSSING - JAPAN 3.aif', 'muse88', 'https://freesound.org/people/muse88/sounds/490524/', 'CC0 1.0'),
    'gymnopedie': ('https://upload.wikimedia.org/wikipedia/commons/b/b7/Gymnopedie_No._1..ogg',
                   'Erik Satie – Gymnopédie No. 1', 'Teknopazzo (performance)', 'https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1..ogg', 'CC0 1.0'),
    'gnossienne': ('https://upload.wikimedia.org/wikipedia/commons/9/91/Satie_-_Gnossienne_1.ogg',
                   'Erik Satie – Gnossienne No. 1', 'Wikimedia Commons (public domain recording)', 'https://commons.wikimedia.org/wiki/File:Satie_-_Gnossienne_1.ogg', 'Public domain'),
}


def fetch(key):
    url = SOURCES[key][0]
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, key + os.path.splitext(url)[1])
    if not os.path.exists(path) or os.path.getsize(path) < 5000:
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f:
                    f.write(r.read())
                break
            except Exception as e:  # rate limits on upload.wikimedia.org
                print('  retry', key, e)
                time.sleep(8 * (attempt + 1))
    return path


def load(path, ch=2):
    raw = subprocess.run([FF, '-v', 'quiet', '-i', path, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


def normalize(x, target_db):
    return x * (10 ** ((target_db - rms_db(x)) / 20))


def loop(x, a, b, fade=2.5, pad=0.12):
    """Seamless loop of x[a:b]: tail crossfaded into head (equal power).
    Returns audio with `pad` seconds of wrap-around on both ends so encoder
    padding never touches the loop region, plus (loopStart, loopEnd)."""
    A, B, F = int(a * SR), int(b * SR), int(fade * SR)
    seg = x[A:B + F].copy()
    body = seg[:B - A].copy()
    t = np.linspace(0, 1, F)[:, None]
    body[:F] = seg[B - A:B - A + F] * np.cos(t * np.pi / 2) + body[:F] * np.sin(t * np.pi / 2)
    P = int(pad * SR)
    out = np.concatenate([body[-P:], body, body[:P]])
    return out, pad, pad + len(body) / SR


def encode(x, name, kbps=128):
    os.makedirs(OUT, exist_ok=True)
    x = np.clip(x, -0.99, 0.99).astype(np.float32)
    path = os.path.join(OUT, name)
    p = subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(x.shape[1]), '-i', '-', '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=x.tobytes())
    if p.returncode:
        sys.exit('encode failed ' + name)
    print(f'  {name}: {len(x) / SR:.1f}s  {os.path.getsize(path) / 1024:.0f} KB  rms {rms_db(x):.1f} dB')


def find_drops(x, min_gap=0.25, pre=0.01, length=0.45):
    mono = x.mean(axis=1)
    w = int(0.005 * SR)
    env = np.sqrt(np.convolve(mono ** 2, np.ones(w) / w, mode='same'))
    thr = np.percentile(env, 60) * 4 + 1e-4
    out, last = [], -1e9
    for i in range(1, len(env)):
        if env[i] > thr and env[i - 1] <= thr and (i - last) / SR > min_gap:
            last = i
            s = max(0, i - int(pre * SR))
            out.append(x[s:s + int(length * SR)])
    return out


def main():
    manifest = {}
    print('rain beds')
    street = load(fetch('street'))
    y, ls, le = loop(street, 14.0, 48.0)
    encode(normalize(y, -24), 'rain_street.mp3')
    manifest['rain_street'] = {'loopStart': ls, 'loopEnd': le}

    drain = load(fetch('drain'))
    y, ls, le = loop(drain, 60.0, 120.0, fade=3.0)
    encode(normalize(y, -26), 'rain_drain.mp3')
    manifest['rain_drain'] = {'loopStart': ls, 'loopEnd': le}

    roof = load(fetch('roof'))
    y, ls, le = loop(roof, 4.0, 44.0, fade=3.0)
    encode(normalize(y, -24), 'roof_drips.mp3')
    manifest['roof_drips'] = {'loopStart': ls, 'loopEnd': le}

    gutter = load(fetch('gutter'))
    y, ls, le = loop(gutter, 150.0, 190.0, fade=3.0)
    encode(normalize(y, -24), 'gutter.mp3')
    manifest['gutter'] = {'loopStart': ls, 'loopEnd': le}

    print('drops sprite')
    drops = find_drops(load(fetch('drops')))
    for k in ('drip1', 'drip2'):
        d = load(fetch(k))
        drops.append(d[: int(0.45 * SR)])
    drops = [normalize(d, -20) * np.linspace(1, 0.0, len(d))[:, None] ** 0.5 for d in drops if len(d) > SR * 0.1]
    gap = np.zeros((int(0.1 * SR), 2), dtype=np.float32)
    parts, offs, t = [], [], 0.0
    for d in drops[:24]:
        offs.append([round(t, 4), round(len(d) / SR, 4)])
        parts += [d, gap]
        t += (len(d) + len(gap)) / SR
    encode(np.concatenate(parts), 'drops.mp3')
    manifest['drops'] = {'sprites': offs}

    print('crossing')
    cr = load(fetch('crossing'))
    encode(normalize(cr, -20), 'crossing.mp3', 160)
    # detect where the train roars through (loudest 1s window) for syncing
    mono = cr.mean(axis=1)
    w = SR // 2
    en = [np.sqrt(np.mean(mono[i:i + w] ** 2)) for i in range(0, len(mono) - w, w)]
    manifest['crossing'] = {'trainPeak': float(np.argmax(en) * 0.5), 'duration': len(cr) / SR}

    print('music')
    for key in ('gymnopedie', 'gnossienne'):
        m = load(fetch(key))
        m = normalize(m, -22)
        # gentle fade in/out
        f = int(1.5 * SR)
        m[:f] *= np.linspace(0, 1, f)[:, None]
        m[-f:] *= np.linspace(1, 0, f)[:, None]
        encode(m, f'{key}.mp3', 160)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fp:
        json.dump(manifest, fp, indent=1)

    with open(os.path.join(OUT, 'CREDITS.md'), 'w') as fp:
        fp.write('# Sound credits\n\nAll recordings are CC0 1.0 or public domain. They were trimmed, looped and re-encoded for this scene.\n\n')
        fp.write('| File | Source | Author | License |\n|---|---|---|---|\n')
        used = {'rain_street.mp3': 'street', 'rain_drain.mp3': 'drain', 'roof_drips.mp3': 'roof', 'gutter.mp3': 'gutter',
                'drops.mp3': 'drops', 'crossing.mp3': 'crossing', 'gymnopedie.mp3': 'gymnopedie', 'gnossienne.mp3': 'gnossienne'}
        for f, k in used.items():
            _, title, author, page, lic = SOURCES[k]
            extra = ' (+ drip1, drip2)' if k == 'drops' else ''
            fp.write(f'| {f} | [{title}]({page}){extra} | {author} | {lic} |\n')
        for k in ('drip1', 'drip2'):
            _, title, author, page, lic = SOURCES[k]
            fp.write(f'| drops.mp3 | [{title}]({page}) | {author} | {lic} |\n')
        fp.write('\nThe level-crossing bell, train, rain and drips react to the camera position in the scene; the vending-machine hum is synthesized.\n')
    print('done ->', OUT)


if __name__ == '__main__':
    main()
