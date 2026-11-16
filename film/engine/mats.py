"""Procedural materials. Each takes a Ctx (per-hit arrays) and returns albedo [n,3] or a dict
(alb, emis, refl, rough).  Colours are linear."""
import numpy as np
from .noise import fbm2, fbm3, hash2
from .world import srgb

MATS = {}
class Ctx: pass

def mat(name):
    def deco(f):
        MATS[name] = f; return f
    return deco

def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 1 and np.ndim(a) + np.ndim(b) > 1: t = t[:, None]
    return a * (1 - t) + b * t

def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def fade(S, freq):
    """0..1: how much of a detail of spatial frequency `freq` (cycles/m) survives at this distance"""
    return np.clip(0.6 / (freq * np.maximum(S.lod, 1e-4)), 0, 1)

def weather(S, amt=1.0, seed=0):
    """multiplier: blotches + vertical streaks + damp base. for walls (a = along wall, b = height)"""
    blot = fbm2(S.a * 0.35, S.b * 0.35, 11 + seed, 4)
    streak = fbm2(S.a * 3.1, S.b * 0.22, 23 + seed, 3)
    fine = fbm2(S.a * 9, S.b * 9, 5 + seed, 2)
    m = 1 - amt * (0.55 * sstep(0.45, 0.8, blot) * 0.6 + 0.5 * sstep(0.5, 0.85, streak) * fade(S, 3) + 0.15 * (fine - 0.5) * fade(S, 9))
    base = np.exp(-np.maximum(S.b, 0) / 0.5)
    vert = (np.abs(S.Ng[:, 1]) < 0.7)
    m = m * (1 - 0.35 * amt * base * vert)
    return np.clip(m, 0.2, 1.3)[:, None]

def paper_ads(S, alb):
    """small pasted notices on walls between 0.6 and 1.9 m"""
    vert = (np.abs(S.Ng[:, 1]) < 0.3) & (S.b > 0.6) & (S.b < 1.95)
    cx = S.a / 0.3; cy = S.b / 0.34
    h = hash2(cx, cy, 201); fx_ = cx - np.floor(cx); fy_ = cy - np.floor(cy)
    m = vert & (h > 0.93) & (fx_ > 0.12) & (fx_ < 0.82) & (fy_ > 0.1) & (fy_ < 0.9)
    pal = np.stack([srgb('#d8d2c0'), srgb('#cfc9b8'), srgb('#d8b8b0'), srgb('#c9cfa8'), srgb('#b9bcc2')])
    c = pal[(hash2(cx, cy, 202) * 5).astype(np.int64) % 5] * (0.75 + 0.3 * hash2(cx * 7, cy * 9, 203))[:, None]
    k = (m * fade(S, 3.5))[:, None]
    return alb * (1 - k) + c * k

def big_patches(S, alb, seed=0, p=0.07, col='#b9b6aa', size=(2.6, 1.7)):
    """rectangular repainted / repaired patches"""
    cx = S.a / size[0] + 0.37 * np.floor(S.b / size[1]); cy = S.b / size[1]
    h = hash2(cx, cy, 211 + seed); fx_ = cx - np.floor(cx); fy_ = cy - np.floor(cy)
    w0 = 0.1 + 0.25 * hash2(cx, cy, 212 + seed); h0 = 0.12 + 0.3 * hash2(cx, cy, 213 + seed)
    m = (h < p) & (fx_ > w0) & (fx_ < 1 - w0 * 0.6) & (fy_ > h0) & (fy_ < 1 - h0 * 0.5) & (np.abs(S.Ng[:, 1]) < 0.3)
    c = srgb(col)[None] * (0.8 + 0.35 * hash2(cx, cy, 214 + seed))[:, None] * (0.9 + 0.2 * fbm2(S.a * 2, S.b * 2, 215, 2))[:, None]
    return np.where(m[:, None], c, alb)

@mat('plain')
def plain(S):
    """prm: grime, noise scale, refl, rough"""
    g = S.prm[:, 0]
    nz = fbm2(S.a * 2.0, S.b * 2.0, 3, 3)
    alb = S.col * (1 - g * 0.8 * (nz - 0.35))[:, None]
    return dict(alb=np.clip(alb, 0, 1), refl=S.prm[:, 2], rough=S.prm[:, 3])

@mat('emit')
def emit(S):
    """prm0 = intensity, prm1 = surface albedo"""
    return dict(alb=S.col * S.prm[:, 1:2], emis=S.col * S.prm[:, 0:1])

@mat('brick')
def brick(S):
    """prm0 = soot/weather amount"""
    bl, bh = 0.25, 0.07
    row = np.floor(S.b / bh)
    off = (row % 2) * 0.5
    bx = S.a / bl + off; by = S.b / bh
    fx = bx - np.floor(bx); fy = by - np.floor(by)
    mortar = (fx < 0.05) | (fy < 0.16)
    r = hash2(bx, by, 7)
    base = S.col * (0.72 + 0.5 * r)[:, None]
    dark = hash2(bx, by, 9) > 0.86
    base = np.where(dark[:, None], base * np.array([0.5, 0.45, 0.5], np.float32), base)
    mort = srgb('#8d857b')[None] * (0.85 + 0.3 * fbm2(S.a * 4, S.b * 4, 3, 2))[:, None]
    alb = np.where(mortar[:, None], mort, base)
    avg = S.col * 0.80 + srgb('#8d857b')[None] * 0.2
    alb = mix(avg, alb, fade(S, 9))
    hue = fbm2(S.a * 0.22 + 7, S.b * 0.22, 61, 3)                       # large-scale colour drift between batches of brick
    alb = alb * (0.86 + 0.3 * hue)[:, None] * (1 + (hue[:, None] - 0.5) * np.array([0.12, -0.02, -0.1], np.float32)[None])
    eff = sstep(0.6, 0.8, fbm2(S.a * 1.4, S.b * 0.5, 62, 4)) * sstep(0.45, 0.7, fbm2(S.a * 0.3, S.b * 0.3, 63, 2))
    alb = mix(alb, srgb('#b3aa9e')[None], eff * 0.45)                    # efflorescence
    alb = big_patches(S, alb, 0, 0.06, '#a8a39a')
    alb = paper_ads(S, alb)
    return np.clip(alb * weather(S, 0.5 + S.prm[:, 0]), 0, 1)

@mat('plaster')
def plaster(S):
    """cement render. prm0 = weather amount, prm1 = patchiness"""
    w = weather(S, 0.7 + S.prm[:, 0])
    patch = fbm2(S.a * 0.6 + 40, S.b * 0.6, 31, 3)
    alb = S.col * w * (1 + 0.18 * (sstep(0.55, 0.6, patch) - 0.3))[:, None]
    crack = fbm2(S.a * 1.3, S.b * 1.3, 77, 4)
    alb = alb * (1 - 0.35 * (np.abs(crack - 0.5) < 0.012) * fade(S, 6))[:, None]
    # plaster fallen away: the brick underneath shows
    fall = sstep(0.69, 0.72, fbm2(S.a * 0.55 + 3, S.b * 0.55, 81, 4) + 0.12 * (fbm2(S.a * 4, S.b * 4, 82, 2) - 0.5)) * (np.abs(S.Ng[:, 1]) < 0.3)
    bx = S.a / 0.25 + (np.floor(S.b / 0.07) % 2) * 0.5; by = S.b / 0.07
    bk = srgb('#8a4f3e')[None] * (0.7 + 0.5 * hash2(bx, by, 7))[:, None]
    bk = np.where((((bx - np.floor(bx)) < 0.06) | ((by - np.floor(by)) < 0.16))[:, None], srgb('#8d857b')[None], bk)
    bk = mix(srgb('#86594a')[None], bk, fade(S, 9))
    alb = mix(alb, bk * w, fall)
    alb = big_patches(S, alb, 1, 0.07, '#b0aca0')
    alb = paper_ads(S, alb)
    return np.clip(alb, 0, 1)

@mat('tile')
def tile(S):
    """small facade tiles. prm0 = weather, prm1 = tile w, prm2 = tile h"""
    tw = np.where(S.prm[:, 1] > 0, S.prm[:, 1], 0.24); thh = np.where(S.prm[:, 2] > 0, S.prm[:, 2], 0.06)
    bx = S.a / tw; by = S.b / thh
    fx = bx - np.floor(bx); fy = by - np.floor(by)
    seam = (fx < 0.06) | (fy < 0.14)
    r = hash2(bx, by, 5)
    alb = S.col * (0.9 + 0.14 * r)[:, None]
    miss = (hash2(bx / 3, by / 3, 13) > 0.985)
    alb = np.where((seam | miss)[:, None], srgb('#77756f')[None], alb)
    alb = mix(S.col * 0.9, alb, fade(S, 9))
    rust = sstep(0.62, 0.8, fbm2(S.a * 4.0, S.b * 0.3, 55, 3)) * sstep(0.5, 0.7, fbm2(S.a * 0.5, S.b * 0.5, 56, 2))
    alb = mix(alb, alb * srgb('#a9825c')[None], rust * 0.7)
    lost = sstep(0.7, 0.72, fbm2(S.a * 0.7 + 11, S.b * 0.7, 83, 4)) * (np.abs(S.Ng[:, 1]) < 0.3)      # sheets of tile fallen off
    alb = mix(alb, srgb('#7f7c74')[None] * (0.8 + 0.3 * fbm2(S.a * 3, S.b * 3, 84, 2))[:, None], lost)
    alb = paper_ads(S, alb)
    return np.clip(alb * weather(S, 0.45 + S.prm[:, 0]), 0, 1)

@mat('concrete')
def concrete(S):
    n1 = fbm2(S.a * 0.8, S.b * 0.8, 3, 4); n2 = fbm2(S.a * 12, S.b * 12, 9, 2)
    alb = S.col * (0.8 + 0.35 * n1 + 0.12 * (n2 - 0.5) * fade(S, 12))[:, None]
    crack = fbm2(S.a * 0.9, S.b * 0.9, 71, 4)
    alb = alb * (1 - 0.4 * (np.abs(crack - 0.5) < 0.01))[:, None]
    vert = np.abs(S.Ng[:, 1]) < 0.7
    alb = np.where(vert[:, None], alb * weather(S, 0.6 + S.prm[:, 0]), alb)
    return np.clip(alb, 0, 1)

@mat('asphalt')
def asphalt(S):
    """prm0 = wetness (0..1) -> reflective; puddles from low-frequency noise"""
    n1 = fbm2(S.a * 0.5, S.b * 0.5, 3, 4); n2 = fbm2(S.a * 25, S.b * 25, 9, 2)
    alb = S.col * (0.75 + 0.4 * n1 + 0.3 * (n2 - 0.5) * fade(S, 25))[:, None]
    patch = sstep(0.6, 0.63, fbm2(S.a * 0.25 + 9, S.b * 0.25, 44, 3))
    alb = alb * (1 - 0.25 * patch)[:, None]
    wet = S.prm[:, 0]
    pud = sstep(0.5, 0.6, fbm2(S.a * 0.35 + 3, S.b * 0.35 + 7, 91, 4) + 0.1 * (fbm2(S.a * 2, S.b * 2, 92, 2) - 0.5)) * (wet > 0)
    alb = alb * (1 - 0.45 * wet - 0.25 * pud)[:, None]
    refl = wet * (0.04 + 0.5 * pud)
    rough = np.where(pud > 0.5, 0.004, 0.035) * (wet > 0)
    return dict(alb=np.clip(alb, 0, 1), refl=refl.astype(np.float32), rough=rough.astype(np.float32), aux=pud.astype(np.float32))

@mat('snow')
def snow(S):
    n1 = fbm2(S.a * 0.4, S.b * 0.4, 3, 4); n2 = fbm2(S.a * 6, S.b * 6, 9, 3)
    alb = S.col * (0.84 + 0.16 * n1 + 0.1 * (n2 - 0.5) * fade(S, 6))[:, None]
    return np.clip(alb, 0, 1)

@mat('ground')
def ground(S):
    """dirt / packed earth with gravel. prm0: grass amount"""
    n1 = fbm2(S.a * 0.3, S.b * 0.3, 3, 5); n2 = fbm2(S.a * 14, S.b * 14, 9, 2)
    alb = S.col * (0.7 + 0.5 * n1 + 0.25 * (n2 - 0.5) * fade(S, 14))[:, None]
    gr = sstep(0.5, 0.65, fbm2(S.a * 0.45 + 5, S.b * 0.45, 33, 4)) * S.prm[:, 0]
    gcol = srgb('#55683a')[None] * (0.6 + 0.8 * fbm2(S.a * 20, S.b * 20, 12, 2))[:, None]
    return np.clip(mix(alb, gcol, gr), 0, 1)

@mat('metal')
def metal(S):
    """painted / corrugated sheet. prm0 = rust amount, prm1 = corrugation pitch (0 = flat)"""
    rust = sstep(0.5, 0.75, fbm2(S.a * 1.5, S.b * 0.6, 21, 4)) * S.prm[:, 0]
    alb = mix(S.col, srgb('#6b4630')[None] * (0.7 + 0.6 * fbm2(S.a * 8, S.b * 8, 3, 2))[:, None], rust)
    p = S.prm[:, 1]
    cor = np.where(p > 0, 0.82 + 0.18 * np.cos(2 * np.pi * S.a / np.where(p > 0, p, 1)), 1.0)
    return np.clip(alb * cor[:, None] * weather(S, 0.3), 0, 1)

@mat('wood')
def wood(S):
    """painted planks. prm0 = peel amount, prm1 = plank width"""
    pw = np.where(S.prm[:, 1] > 0, S.prm[:, 1], 0.12)
    px = S.a / pw; fx = px - np.floor(px)
    r = hash2(px, 0 * px, 3)
    alb = S.col * (0.85 + 0.25 * r)[:, None]
    peel = sstep(0.55, 0.7, fbm2(S.a * 5, S.b * 2, 17, 3)) * S.prm[:, 0]
    alb = mix(alb, srgb('#6a5a48')[None], peel)
    alb = alb * (1 - 0.5 * (fx < 0.08))[:, None]
    return np.clip(alb * weather(S, 0.3), 0, 1)

@mat('bark')
def bark(S):
    n = fbm2(S.P[:, 0] * 9 + S.P[:, 2] * 9, S.P[:, 1] * 3, 5, 3)
    return np.clip(S.col * (0.6 + 0.8 * n)[:, None], 0, 1)

@mat('glass')
def glass(S):
    """window pane. u,v = local metres from bottom-left; prm = [lit intensity, width, height, style]
    col = light colour when lit. Dark panes reflect the sky; frames/mullions drawn here."""
    w = np.maximum(S.prm[:, 1], 0.2); h = np.maximum(S.prm[:, 2], 0.2); st = S.prm[:, 3]
    u = S.u; v = S.v
    fw = 0.045
    frame = (u < fw) | (u > w - fw) | (v < fw) | (v > h - fw)
    # style 0: two casements + transom ; 1: three vertical ; 2: grid of small panes ; 3: plain
    s = np.round(st).astype(np.int32)
    mull = np.zeros(len(u), bool)
    mull |= (s == 0) & ((np.abs(u - w / 2) < fw * 0.6) | (np.abs(v - h * 0.72) < fw * 0.6))
    mull |= (s == 1) & ((np.abs(u - w / 3) < fw * 0.6) | (np.abs(u - 2 * w / 3) < fw * 0.6))
    gx = u / 0.42; gy = v / 0.42
    mull |= (s == 2) & (((gx - np.floor(gx)) < 0.09) | ((gy - np.floor(gy)) < 0.09))
    lit = S.prm[:, 0]
    # interior: curtains (per-window random), brighter upper part
    sd = S.seed
    cur_l = 0.12 + 0.5 * sd * (sd < 0.6)                     # how far the curtain is drawn (fraction)
    fold = 0.75 + 0.25 * np.sin((u / w) * 40 + sd * 50)
    is_cur = (u / w < cur_l) | (u / w > 1 - cur_l * (0.3 + sd))
    room = (0.55 + 0.45 * sstep(0.15, 0.9, v / h)) * (0.8 + 0.4 * fbm2(u * 3 + sd * 100, v * 3, 7, 2))
    inner = np.where(is_cur, 0.55 * fold, room)
    emis = S.col * (lit * inner)[:, None]
    dark = srgb('#0b0f14')[None] * (0.6 + 0.8 * fbm2(u * 2 + sd * 30, v * 2, 3, 2))[:, None]
    cpal = np.stack([srgb('#4a4d52'), srgb('#5a4a4c'), srgb('#3f4a58'), srgb('#5c584a'), srgb('#4a5548'), srgb('#62605c')])
    ccol = cpal[(sd * 977).astype(np.int64) % 6]
    cur_dark = np.where(is_cur[:, None] & (sd[:, None] > 0.25), ccol * fold[:, None], dark)
    paper = (sd > 0.9)[:, None] & (v / h > 0.5)[:, None] & ~is_cur[:, None]                      # old newspaper pasted on the upper panes
    cur_dark = np.where(paper, srgb('#6a6658')[None] * (0.8 + 0.3 * fbm2(u * 6, v * 6, 4, 2))[:, None], cur_dark)
    alb = np.where((lit > 0)[:, None], 0.02, cur_dark)
    fr = frame | mull
    fcol = srgb('#aeb3ae')[None] * (0.7 + 0.4 * S.seed)[:, None]
    alb = np.where(fr[:, None], fcol, alb)
    emis = np.where(fr[:, None], 0, emis)
    refl = np.where(fr, 0, np.where(lit > 0, 0.03, 0.08)).astype(np.float32)
    return dict(alb=alb, emis=emis, refl=refl, rough=np.zeros(len(u), np.float32))

@mat('tex')
def tex(S):
    """textured quad: prm = [texture id, width m, height m, emissive intensity]; col multiplies. alpha<0.5 -> col*0.02"""
    out = np.zeros((len(S.u), 3), np.float32); em = np.zeros_like(out)
    for tid in np.unique(S.prm[:, 0].astype(np.int32)):
        m = S.prm[:, 0].astype(np.int32) == tid
        T = S.world.textures[tid]; th, tw = T.shape[:2]
        x = np.clip(S.u[m] / S.prm[m, 1] * tw, 0, tw - 1).astype(np.int32)
        y = np.clip((1 - S.v[m] / S.prm[m, 2]) * th, 0, th - 1).astype(np.int32)
        c = T[y, x, :3] * S.col[m]
        out[m] = c * weather_sub(S, m)
        em[m] = c * S.prm[m, 3:4]
    return dict(alb=np.clip(out, 0, 1), emis=em)

def weather_sub(S, m):
    n = fbm2(S.a[m] * 2.5, S.b[m] * 0.4, 61, 3)
    return (1 - 0.3 * sstep(0.5, 0.85, n))[:, None]

@mat('stripes')
def stripes(S):
    """striped tarp (red / white / blue). prm0 = stripe width, prm1 = translucency glow from below"""
    wd = np.where(S.prm[:, 0] > 0, S.prm[:, 0], 0.12)
    k = np.floor(S.u / wd).astype(np.int64) % 8
    pal = np.stack([srgb('#b6392f'), srgb('#d9d6cc'), srgb('#d9d6cc'), srgb('#3e5fa0'), srgb('#d9d6cc'), srgb('#b6392f'), srgb('#b6392f'), srgb('#d9d6cc')])
    alb = pal[k] * (0.75 + 0.35 * fbm2(S.u * 3, S.v * 3, 5, 3))[:, None]
    return np.clip(alb * weather(S, 0.4), 0, 1)

@mat('shelf')
def shelf(S):
    """shop shelves full of goods. u,v local metres. prm0 = cell w, prm1 = row h, prm2 = emissive (self-lit fridge etc.)"""
    cw = np.where(S.prm[:, 0] > 0, S.prm[:, 0], 0.11); rh = np.where(S.prm[:, 1] > 0, S.prm[:, 1], 0.3)
    row = np.floor(S.v / rh); fy = S.v / rh - row
    cwr = cw * (0.7 + 0.9 * hash2(row, row * 0 + 3, 91))
    cx = S.u / cwr; fx = cx - np.floor(cx)
    h1 = hash2(cx, row, 17 + (S.seed * 100).astype(np.int64)[0] if len(S.seed) else 17); h2 = hash2(cx, row, 29); h3 = hash2(cx, row, 31)
    pal = np.stack([srgb('#c8392f'), srgb('#e2b23a'), srgb('#3f7f4a'), srgb('#2f5fa8'), srgb('#e6e2d6'), srgb('#d9772e'), srgb('#7a3f8c'), srgb('#4fa0a8'), srgb('#b6243a'), srgb('#f0d890')])
    col = pal[(h1 * len(pal)).astype(np.int64) % len(pal)] * (0.7 + 0.5 * h2)[:, None]
    hgt = 0.45 + 0.45 * h3                                # item height within the row
    item = (fy > 0.1) & (fy < 0.1 + hgt * 0.85) & (fx > 0.08) & (fx < 0.92)
    label = item & (fy > 0.1 + hgt * 0.3) & (fy < 0.1 + hgt * 0.5)
    col = np.where(label[:, None], col * 0.5 + 0.4, col)
    board = fy < 0.1
    alb = np.where(item[:, None], col, np.where(board[:, None], srgb('#8a7a62')[None], srgb('#2a2622')[None]))
    return dict(alb=np.clip(alb, 0, 1), emis=alb * S.prm[:, 2:3])

@mat('shutter')
def shutter(S):
    """roll-up door: horizontal slats. prm0 = rust"""
    k = S.v / 0.09; f = k - np.floor(k)
    sh = 0.72 + 0.28 * np.sin(f * np.pi)
    rust = sstep(0.5, 0.8, fbm2(S.a * 1.2, S.b * 2.5, 21, 4)) * S.prm[:, 0]
    alb = mix(S.col * sh[:, None], srgb('#5b4030')[None], rust * 0.7)
    return np.clip(alb * weather(S, 0.5), 0, 1)

@mat('dado')
def dado(S):
    """interior wall: whitewash above a painted dado. prm0 = dado height (world y), col = dado colour"""
    hh = S.prm[:, 0]
    lower = S.P[:, 1] < hh
    white = srgb('#cfcabb')[None] * (0.8 + 0.3 * fbm2(S.a * 1.5, S.b * 1.5, 7, 3))[:, None]
    alb = np.where(lower[:, None], S.col * (0.8 + 0.3 * fbm2(S.a * 2, S.b * 2, 9, 3))[:, None], white)
    line = np.abs(S.P[:, 1] - hh) < 0.02
    alb = np.where(line[:, None], alb * 0.6, alb)
    return np.clip(alb, 0, 1)

@mat('pave')
def pave(S):
    """concrete paving slabs. prm0 = slab size"""
    sz = np.where(S.prm[:, 0] > 0, S.prm[:, 0], 0.5)
    x = S.a / sz; z = S.b / sz
    fx = x - np.floor(x); fz = z - np.floor(z)
    seam = (fx < 0.05) | (fz < 0.05)
    r = hash2(x, z, 5)
    alb = S.col * (0.8 + 0.3 * r + 0.2 * (fbm2(S.a * 1.2, S.b * 1.2, 8, 3) - 0.5))[:, None]
    broken = hash2(x, z, 11) > 0.93
    alb = np.where(broken[:, None], alb * 0.7, alb)
    alb = mix(S.col * 0.85, np.where(seam[:, None], alb * 0.55, alb), fade(S, 4))
    return np.clip(alb, 0, 1)

@mat('leaf')
def leaf(S):
    """leaf cards; col varies per card; faint light transmission is faked by lighting both sides equally (two-sided anyway)"""
    alb = np.clip(S.col * (0.65 + 0.7 * S.seed)[:, None], 0, 1)
    return dict(alb=alb, emis=alb * S.prm[:, 0:1])       # prm0: a little self-glow (petals that seem to hold the light)

@mat('gravel')
def gravel(S):
    x, z = S.P[:, 0], S.P[:, 2]
    n = fbm2(x * 14, z * 14 + S.P[:, 1] * 9, 5, 2); n1 = fbm2(x * 0.5, z * 0.8, 6, 3)
    return np.clip(S.col * (0.7 + 0.5 * (n - 0.5) * fade(S, 14) + 0.4 * n1)[:, None], 0, 1)
