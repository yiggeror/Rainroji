/* ============================================================================
   世界六 · 水墨·烟雨山水
   ----------------------------------------------------------------------------
   深海的黑水化开，像一滴墨落进清水：翻涌、散成丝，再沉下来，沉成山。
   · 只有墨和纸。没有一根硬线：每一块墨的边都是湿的——往纸里洇开，毛边顺着纸的纤维，边上积一圈深的墨。
   · 墨分五色：远山淡墨一抹；中景一座主峰、一道瀑布、竹林、石桥、村子，由一块块矾头和一笔笔皴擦画成（inkscroll.js）；
     近处石崖浓墨、焦墨，干笔擦出飞白，崖上一棵老松斜出水面，松下有人抱琴。前面的东西挡住后面的；水里有倒影。
   · 大片留白就是水和云：雾一层一层地流过山腰，细雨斜斜地下。
   · 笔一笔一笔地落下来：远山先洇开；光就是那支笔，它走到哪里，那里的每一笔才顺着笔势画出来，墨晕从落笔处往外洇。
     画出来的长卷（生成的图）也是这样落笔的：先是一层淡墨，湿的，软的，在纸上一团团洇开、带着一圈水线；再是笔线，
     墨顺着每一笔从笔端流进去；最浓的点最后落下。每个地方什么时候画，事先算好（tools/ink_times.py）。
     镜头跟着画走：先贴近石崖老松，再退开看主峰，推近瀑布，沿竹林、石桥、村子走到芦苇和小舟——画面右边总有一块正在画。
   · 一粒光在这里是一点朱砂：整张画里唯一暖的颜色，落在小舟上，水里一道淡淡的倒影。
   · 走的时候天边破晓：颜色从水墨里渗出来——天边的粉、水的青、山的绿——下一个世界从颜色里炸开。
   渲染：一个全屏着色器，直接出最终颜色。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uFade, uBloom, uDawn, uAspect;
uniform vec4 uGrow;          // how far the far washes have spread out of the black (far peaks, the far shore)
uniform vec4 uHero;          // the vermilion light: where (painting coords), how bright, how big
uniform float uSunK;         // (at dawn a spark of it rises and becomes the sun: 0 … 1)
uniform vec3 uSunP;          // where that spark is
uniform vec2 uPan;
uniform sampler2D uBrush;    // the brush's strokes: R rocks and the built things, G trees, B what sways (willow, bamboo, reeds)
uniform sampler2D uWash;     // its washes: R rock and ground, G foliage; B how solid a thing is there (it hides the far hills)
uniform sampler2D uTS, uTW;  // when each stroke / each wash is laid (0 … 1 of the light's way); uTW.b: the line the water's reflections hang from
uniform sampler2D uWhen;     // when the painting reaches each place at all (for the far washes)
uniform float uNow;          // how far along its way the light is (0 … 1; past 1, everything is painted)
uniform vec4 uWalker;        // the traveller crossing the bridge: where along it (0 … 1), the step, on/off
uniform vec4 uEg[4];         // egrets rising from the reeds: where, the beat of the wings, size
uniform vec3 uGeese;         // a skein of geese crossing the sky: where its leader is, on/off
const float SL = 5.6;
uniform sampler2D uSeal;
uniform sampler2D uXuan;           // a scan of xuan paper (it moves with the scroll)
uniform sampler2D uScA, uScB;      // the painted handscroll, in two halves: how much ink lies at each place (0 bare paper)
uniform float uScK;                // 1: show the painted scroll (0: the brush's own painting, from inkscroll.js)
uniform vec4 uScSw[3];             // where things on it sway in the wind (bamboo, the willow, the reeds): x0, x1, foot, top
uniform sampler2D uPT;             // when each place is painted (seconds of the painting): r its lines, g its washes
uniform float uNowS;               // the painting's own clock (seconds; negative before the brush sets out)
uniform vec3 uView;                // the eye: the middle of the view on the scroll, and how close (1: the scroll's height fills it)
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.96875; }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.875; }
float sat(float x){ return clamp(x, 0.0, 1.0); }
// ---- wet ink. sd: how far inside the shape (painting units, + inside). The edge bleeds into the paper along its
// fibres; the ink pools at the edge as it dries (a darker rim); the wash inside is uneven
float wash(vec2 p, float sd, float soft, float seed){
  float feather = 0.010 * (fbm(p * 38.0 + seed) - 0.5) + 0.004 * (vnoise(vec2(p.x * 900.0, p.y * 140.0) + seed) - 0.5);
  float s = sd + feather * soft;
  float cov = smoothstep(-0.0035 * soft, 0.0035 * soft, s);
  float rim = exp(-max(s, 0.0) / (0.006 * soft)) * cov;
  float body = 0.78 + 0.35 * fbm(p * 7.0 + seed * 3.0);
  return cov * (body + 0.45 * rim);
}
// a spreading front: the ink reaches from where the brush touched (seed) out to r
float spread(vec2 p, vec2 seed, float r, float seedN){
  float d = length((p - seed) * vec2(0.8, 1.0)) + 0.10 * (fbm(p * 5.0 + seedN) - 0.5);
  return smoothstep(r, r - 0.04, d);
}
// a far peak: a rounded top, its two flanks falling at their own slopes
float peakA(float x, float c, float h, float kl, float kr){ float d = x - c; return h - (d < 0.0 ? kl : kr) * d * d / (abs(d) + 0.035); }
// the skyline's crags: ridged noise, so a range reads as rock — shoulders, notches, a second summit — not as cones
float crag(float x, float seed){
  float r = 0.0, a = 0.5, f = 6.0;
  for (int i = 0; i < 4; i++){ r += a * (1.0 - abs(2.0 * vnoise(vec2(x * f + seed, seed)) - 1.0)); f *= 2.15; a *= 0.5; }
  return r;
}
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
float whenF(vec2 p){ return texture(uWhen, vec2(p.x / SL, p.y)).r; }
float painted(vec2 p, float tm){ return smoothstep(tm - 0.004, tm + 0.010, uNow + 0.010 * (fbm3(p * 30.0) - 0.5)); }
vec2 PT(vec2 p){ return texture(uPT, vec2(p.x / SL, p.y)).rg; }
// (on the painted scroll: once its wash is down here, plus a lag in seconds)
float paintedAt(vec2 p, float lag){ return uScK > 0.5 ? smoothstep(0.0, 0.35, uNowS - PT(p).g - lag * 12.0) : painted(p, whenF(p) + lag); }
// ---- the brush's painting at p: x the strokes' ink, y the washes', z how solid it is (hiding the far washes), w the water's line
vec4 nearAt(vec2 p, float sway){
  vec2 uv = vec2(p.x / SL, 1.0 - p.y), uvb = uv + vec2(sway, 0.0);
  vec3 s0 = vec3(texture(uBrush, uv).rg, texture(uBrush, uvb).b);
  vec3 s1 = vec3(textureLod(uBrush, uv, 2.5).rg, textureLod(uBrush, uvb, 2.5).b);
  vec3 s2 = vec3(textureLod(uBrush, uv, 4.5).rg, textureLod(uBrush, uvb, 4.5).b);
  vec3 ts = vec3(texture(uTS, uv).rg, texture(uTS, uvb).b);
  vec3 rev = smoothstep(ts - 0.003, ts + 0.005, vec3(uNow));
  vec3 fresh = exp(-max(vec3(uNow) - ts, 0.0) / 0.03) * rev;
  // wet ink: it bleeds a little into the paper round it and pools at its edges as it dries; while fresh it is darker, spreading
  vec3 wet = s0 + 0.40 * max(s1 - s0, 0.0) + 0.50 * max(s0 - s2, 0.0) * s0;
  wet = (wet * (1.0 + 0.30 * fresh) + fresh * 0.35 * max(s1 - s0, 0.0)) * rev * vec3(0.95, 0.93, 0.90);
  float S = 1.0 - (1.0 - sat(wet.r)) * (1.0 - sat(wet.g)) * (1.0 - sat(wet.b));
  // the washes: soft-edged, uneven, a darker tide-line where they dried
  vec3 w0 = textureLod(uWash, uv, 0.8).rgb, w2 = textureLod(uWash, uv, 3.2).rgb;
  vec4 tw = texture(uTW, uv);
  vec2 rw = smoothstep(tw.rg - 0.002, tw.rg + 0.014, vec2(uNow));
  float mott = 0.78 + 0.44 * fbm3(p * 26.0);
  vec2 wv = (w0.rg + 0.55 * max(w0.rg - w2.rg, 0.0)) * mott * rw;
  float Wd = 1.0 - (1.0 - sat(wv.r)) * (1.0 - sat(wv.g));
  return vec4(S, Wd, w0.b * rw.r, tw.b);
}
// ---- the painted scroll. It was painted over this scroll's own layout, so everything that moves on it (the traveller,
// the skiff, the smoke, the egrets, the falling water) still stands where it should. The two halves meet down the white
// of the waterfall; the right one ends in open water and mist.
const float SC_SEAM = 2.50, SC_B0 = 2.45, SC_END = 5.45;
float scAt(vec2 p, float lod){
  float wa = smoothstep(SC_SEAM + 0.008, SC_SEAM - 0.008, p.x);
  vec2 ua = vec2(p.x / 3.0, p.y), ub = vec2((p.x - SC_B0) / 3.0, p.y);
  float a = lod < 0.0 ? texture(uScA, ua).r : textureLod(uScA, ua, lod).r;
  float b = lod < 0.0 ? texture(uScB, ub).r : textureLod(uScB, ub, lod).r;
  return mix(b, a, wa) * smoothstep(SC_END, SC_END - 0.09, p.x) * step(0.0, p.x) * step(0.0, p.y) * step(p.y, 1.0);
}
// where the open water is (under it what stands at its edge hangs upside down, and the ripples break it up)
float scWater(float x){ return x < 0.55 ? -1.0 : x < 2.28 ? 0.292 : x < 2.98 ? 0.145 : x < 3.42 ? 0.10 : 0.198; }
float scrollInk(vec2 p){
  float t = uTime;
  vec2 q = p;
  // the bamboo, the willow's long strands and the reeds move in the wind; the far hills behind them don't (only the ink of
  // the strokes themselves is moved: pale washes stay put)
  float gate = smoothstep(0.16, 0.38, scAt(p, 2.0));
  for (int i = 0; i < 3; i++){
    vec4 b = uScSw[i];
    float inb = smoothstep(b.x - 0.02, b.x + 0.02, p.x) * smoothstep(b.y + 0.02, b.y - 0.02, p.x) * smoothstep(b.w + 0.02, b.w - 0.04, p.y);
    if (inb <= 0.0) continue;
    float h = sat((p.y - b.z) / (b.w - b.z));
    float k = i == 1 ? smoothstep(0.0, 0.3, h) * (1.15 - 0.75 * h) : h * h;         // (the willow hangs: its tips move most)
    float gust = 0.55 + 0.7 * smoothstep(0.3, 0.8, vnoise(vec2(t * 0.35 + float(i) * 3.0, p.x * 2.0)));
    q.x += gate * inb * k * gust * (0.0045 * sin(t * 1.3 + p.x * 9.0 + p.y * 4.0 + float(i) * 2.0) + 0.0011 * sin(t * 3.7 + p.y * 60.0 + p.x * 30.0));
  }
  if (p.y < scWater(p.x)){
    float wob = 1.0 - smoothstep(0.22, 0.5, scAt(p, 1.5));
    q.x += wob * (0.0025 * sin(p.y * 240.0 + t * 1.7) + 0.0015 * sin(p.y * 77.0 - t * 1.1));
  }
  float dS = scAt(q, -1.0), lo = scAt(q, 3.4);
  // what a painter lays first (the wash: the soft tone under everything, up to a pale grey) and what after (the lines)
  float level = min(lo * 0.75, 0.22);
  float dw = min(dS, level), dl = max(dS - level, 0.0);
  vec2 T = PT(p);
  float aw = uNowS - T.y - 0.10 * (fbm3(p * 22.0) - 0.5);
  float al = uNowS - T.x - 0.025 * (vnoise(p * 300.0) - 0.5);
  // the wash runs out over the wet paper: soft and a little darker while it runs, a tide-line at its edge, then it settles
  float wv = smoothstep(0.0, 0.32, aw);
  float wetW = exp(-max(aw, 0.0) / 0.70) * step(0.0, aw);
  float dwB = min(scAt(q, 5.5) * 0.95, level);
  // (until its lines come, the wash is soft: the drawing's edges arrive with the lines)
  float sharp = smoothstep(-0.5, 0.15, al);
  float W_ = mix(mix(dwB, dw, sharp), dwB, wetW * 0.85) * wv * (1.0 + 0.15 * wetW);
  W_ += 0.11 * smoothstep(0.0, 0.05, aw) * exp(-max(aw, 0.0) / 0.16) * smoothstep(0.015, 0.08, lo);
  // the line: there where the brush has been, darker while wet, its edge feathering out into the damp paper, then drying
  float lv = smoothstep(0.0, 0.05, al);
  float wetL = exp(-max(al, 0.0) / 0.40) * lv;
  float L_ = dl * lv * (1.0 + 0.30 * wetL) + max(scAt(q, 2.4) - level - dl, 0.0) * 0.55 * wetL;
  return W_ + L_;
}
// mist flowing across the middle distance: bands over the far hills and the mountain, never over what is near
float mistAt(vec2 p0){
  float t = uTime;
  vec2 p = p0 + vec2(uView.x * 0.18, 0.0);                  // (nearer than the paper: it slides past)
  float m1 = smoothstep(0.35, 0.7, fbm(vec2(p.x * 2.2 - t * 0.018, p.y * 7.0 + 1.0))) * exp(-pow((p.y - 0.47) / 0.07, 2.0)) * smoothstep(0.8, 1.1, p.x) * smoothstep(2.95, 2.75, p.x);
  float m2 = smoothstep(0.45, 0.75, fbm(vec2(p.x * 1.6 - t * 0.011 + 4.0, p.y * 5.0))) * exp(-pow((p.y - 0.70) / 0.08, 2.0)) * smoothstep(0.72, 0.95, p.x) * smoothstep(2.95, 2.75, p.x);
  float m3 = smoothstep(0.4, 0.75, fbm(vec2(p.x * 2.0 - t * 0.02 + 9.0, p.y * 6.0))) * exp(-pow((p.y - 0.355) / 0.045, 2.0)) * smoothstep(0.9, 1.2, p.x) * smoothstep(2.3, 2.0, p.x);
  return max(max(m1, m2 * 0.8), m3);
}
// ---- the skiff on the water: a dark sliver of a hull, a fisherman in a broad hat, a pole
float boatD(vec2 p){
  float t = uTime;
  vec2 bc = vec2(5.30 + 0.004 * sin(t * 0.7), 0.205 + 0.002 * sin(t * 1.3));
  vec2 q = p - bc;
  if (dot(q, q) > 0.006) return 0.0;
  float hull = smoothstep(0.004, 0.0015, abs(q.y + 0.0015 - 0.35 * q.x * q.x / 0.04) - 0.0035 * (1.0 - q.x * q.x / 0.0016)) * step(abs(q.x), 0.040);
  float man = smoothstep(0.0045, 0.002, length((q - vec2(0.012, 0.012)) * vec2(1.6, 1.0)) - 0.005);
  float hat = smoothstep(0.003, 0.001, abs(q.y - 0.020 + 0.25 * abs(q.x - 0.012)) - 0.0012) * step(abs(q.x - 0.012), 0.011);
  float pole = smoothstep(0.0018, 0.0007, sdSeg(q, vec2(0.016, 0.014), vec2(0.045, -0.025)));
  return max(max(hull, man), max(hat, pole)) * 0.85 * paintedAt(p, 0.0);
}
// the painting: how much ink lies at p
float ink(vec2 p, out float tone){
  tone = 0.0;
  float t = uTime, D = 0.0;
  if (uScK > 0.5){
    // ---- the painted scroll, with mist flowing over the mountain and along the far hills behind the village
    D = scrollInk(p);
    float m4 = smoothstep(0.42, 0.75, fbm(vec2(p.x * 1.8 - t * 0.016 + 2.0, p.y * 6.0))) * exp(-pow((p.y - 0.47) / 0.06, 2.0)) * smoothstep(3.5, 3.8, p.x) * smoothstep(5.5, 5.2, p.x);
    float m5 = smoothstep(0.45, 0.8, fbm(vec2(p.x * 2.6 - t * 0.024 + 6.0, p.y * 9.0))) * exp(-pow((p.y - 0.215) / 0.025, 2.0)) * smoothstep(3.95, 4.2, p.x) * smoothstep(5.4, 5.1, p.x);
    float mk = max(max(mistAt(p), m4 * 0.85), m5 * 0.6);
    // and a veil nearer still, drifting across in front of everything now and then
    float m6 = smoothstep(0.55, 0.85, fbm(vec2((p.x + uView.x * 0.45) * 1.3 - t * 0.035 + 3.0, p.y * 3.2))) * exp(-pow((p.y - 0.42) / 0.16, 2.0));
    mk = max(mk, m6 * 0.55);
    D *= 1.0 - 0.8 * mk * (1.0 - smoothstep(0.45, 0.85, D));
    // the skiff, and its reflection broken by the ripples
    D = max(D, boatD(p));
    if (p.y < 0.205){
      vec2 q = vec2(p.x + 0.0025 * sin(p.y * 240.0 + t * 1.7), 0.41 - p.y);
      D = 1.0 - (1.0 - D) * (1.0 - 0.30 * boatD(q) * exp(-(0.205 - p.y) / 0.05));
    }
  } else {
  // ---- the far peaks: pale, slender, rising out of the mist (between and behind what the brush paints)
  {
    float x = p.x, n = 0.012 * (fbm(vec2(x * 9.0, 1.0)) - 0.5) + 0.045 * (crag(x, 2.0) - 0.55);
    {
      float rb = 0.72 + 0.10 * sin(x * 2.3 + 1.0) + 0.07 * sin(x * 5.1) + 0.05 * (crag(x * 0.7, 9.0) - 0.5);
      float db = wash(p, rb - p.y, 2.0, 21.0) * smoothstep(0.50, 0.72, p.y) * 0.07;
      D = max(D, db * max(spread(p, vec2(0.62, 0.80), uGrow.x * 1.3, 1.0) * step(x, 1.6), paintedAt(p, 0.02)));
    }
    float r = max(max(peakA(x, 0.62, 0.92, 2.9, 2.2), peakA(x, 0.79, 0.80, 2.3, 3.3)), max(peakA(x, 0.45, 0.70, 3.4, 2.6), max(peakA(x, 0.97, 0.66, 2.6, 3.1), peakA(x, 0.20, 0.62, 2.2, 2.8))));
    r = max(r, max(max(peakA(x, 3.05, 0.86, 2.0, 2.8), peakA(x, 3.40, 0.74, 3.0, 2.1)), max(peakA(x, 3.66, 0.66, 2.6, 2.4), peakA(x, 2.88, 0.70, 2.8, 2.0))));
    r = max(r, max(max(peakA(x, 4.18, 0.68, 2.4, 2.6), peakA(x, 4.56, 0.61, 2.6, 2.3)), max(peakA(x, 5.06, 0.78, 2.4, 2.9), max(peakA(x, 5.32, 0.68, 2.8, 2.2), peakA(x, 5.55, 0.60, 2.2, 2.6)))));
    float sd = r + n - p.y;
    float base = smoothstep(0.38, 0.62, p.y);
    float d = wash(p, sd, 1.6, 1.0) * base * 0.16;
    float hf = vnoise(vec2((x + 0.3 * p.y) * 80.0, p.y * 8.0)) * 0.6 + vnoise(vec2((x - 0.35 * p.y) * 140.0, p.y * 12.0)) * 0.4;
    d *= (0.70 + 0.55 * smoothstep(0.5, 0.85, hf)) * (0.85 + 0.45 * smoothstep(0.10, 0.0, sd));
    D += d * max(spread(p, vec2(0.62, 0.80), uGrow.x * 1.1, 1.0) * step(x, 1.6), paintedAt(p, 0.02));
  }
  // ---- the far shore: a low pale line of land across the water, under the mountain; and far off across the river
  {
    float y0 = 0.305 + 0.012 * (fbm(vec2(p.x * 4.0, 9.0)) - 0.5) + 0.02 * smoothstep(0.9, 1.4, p.x);
    float sd = min(y0 + 0.018 * fbm(vec2(p.x * 25.0, 2.0)) - p.y, p.y - 0.292);
    float d = wash(p, sd, 0.8, 11.0) * 0.20 * smoothstep(0.40, 0.6, p.x) * smoothstep(2.3, 2.1, p.x)
            + wash(p, sd - 0.03, 0.8, 13.0) * 0.15 * smoothstep(4.95, 5.15, p.x);
    D = max(D, d * max(spread(p, vec2(1.0, 0.30), uGrow.y * 1.6, 11.0), paintedAt(p, 0.02)));
  }
  // ---- the open water: left white; a few long pale strokes for its surface
  {
    float yy = p.y;
    float rip = smoothstep(0.0025, 0.0, abs(fract(yy * 38.0 + 0.3 * vnoise(vec2(p.x * 3.0, floor(yy * 38.0)))) - 0.5) / 38.0) * smoothstep(0.58, 0.85, vnoise(vec2(p.x * 9.0 - t * 0.05, floor(yy * 38.0) * 3.1)));
    float where_ = smoothstep(0.29, 0.25, yy) * smoothstep(0.55, 0.65, p.x) * smoothstep(2.15, 2.0, p.x) + smoothstep(0.25, 0.21, yy) * smoothstep(0.03, 0.06, yy) * smoothstep(4.85, 5.0, p.x);
    D = max(D, rip * 0.12 * where_ * paintedAt(p, 0.0));
  }
  // ---- the brush's painting over it all: what is solid hides the far washes behind it; ink laid over ink darkens
  float sw = 0.0019 / SL * sin(uTime * 1.4 + p.x * 40.0 + p.y * 12.0) * smoothstep(0.12, 0.45, p.y) * (0.6 + 0.6 * vnoise(vec2(uTime * 0.35, p.x * 3.0)));
  vec4 N = nearAt(p, sw);
  float mk = mistAt(p);
  D *= (1.0 - N.z) * (1.0 - 0.9 * mk);
  float nd = 1.0 - (1.0 - N.x) * (1.0 - N.y);
  nd *= 1.0 - 0.85 * mk * (1.0 - smoothstep(0.6, 0.95, N.z));
  D = 1.0 - (1.0 - D) * (1.0 - nd);
  // ---- the skiff
  float bt = boatD(p);
  D = max(D, bt);
  // ---- reflections: what stands at the water hangs upside down in it, broken by the ripples
  if (N.w < 0.99 && p.y < N.w){
    float dy = N.w - p.y;
    vec2 q = vec2(p.x + 0.0025 * sin(p.y * 240.0 + uTime * 1.7) + 0.0015 * sin(p.y * 77.0 - uTime * 1.1), N.w + dy * 1.02);
    vec4 M = nearAt(q, 0.0);
    float rd = max(1.0 - (1.0 - M.x) * (1.0 - M.y), boatD(q));
    float brk = 0.5 + 0.5 * smoothstep(0.25, 0.65, vnoise(vec2(p.x * 30.0 - uTime * 0.25, p.y * 380.0)));
    D = 1.0 - (1.0 - D) * (1.0 - sat(rd * 0.34 * exp(-dy / 0.10) * brk * (1.0 - N.z)));
  }
  }
  // ---- the waterfall: the white of the paper between the dark lips of the rock, streaming; spray where it lands
  {
    float xf = p.x - 2.490, up = step(0.555, p.y), lo = step(0.17, p.y) * step(p.y, 0.50);
    float hw = 0.040;
    if ((up + lo) > 0.0 && abs(xf) < hw){
      float st = vnoise(vec2(xf * 260.0, p.y * 7.0 + t * 2.6)) * 0.7 + vnoise(vec2(xf * 600.0, p.y * 16.0 + t * 4.0)) * 0.3;
      float streak = smoothstep(0.62, 0.9, st) * 0.20 + smoothstep(hw * 0.55, hw, abs(xf)) * 0.14;
      if (uScK > 0.5) streak *= 0.8 * (1.0 - smoothstep(0.10, 0.30, scAt(p, 1.0)));    // (only on the painted water's white)
      D = max(D, streak * paintedAt(p, 0.0));
    }
    float pool = exp(-pow((p.x - 2.49) / 0.16, 2.0) - pow((p.y - 0.17) / 0.05, 2.0)), ledge = exp(-pow((p.x - 2.49) / 0.07, 2.0) - pow((p.y - 0.535) / 0.022, 2.0));
    float bil = fbm(vec2(p.x * 9.0, p.y * 9.0 - t * 0.35));
    D *= 1.0 - (uScK > 0.5 ? 0.35 * pool : 0.85 * sat(pool * 1.3 + ledge));
    D = max(D, 0.07 * smoothstep(0.45, 0.75, bil) * pool * paintedAt(p, 0.0));
  }
  // ---- smoke from two of the houses, rising, leaning in the wind, thinning
  for (int i = 0; i < 2; i++){
    vec2 s0 = i == 0 ? vec2(4.29, 0.383) : vec2(4.585, 0.385), q = p - s0;
    if (q.y > 0.0 && q.y < 0.24 && abs(q.x) < 0.12){
      float drift = q.y * 0.38 + 0.015 * sin(q.y * 16.0 - uTime * 0.7 + float(i) * 2.0), wd = 0.004 + q.y * 0.09;
      float sm = exp(-pow((q.x - drift) / wd, 2.0)) * smoothstep(0.0, 0.02, q.y) * smoothstep(0.24, 0.05, q.y) * (0.45 + 0.55 * fbm3(vec2(q.x * 30.0, q.y * 12.0 - uTime * 0.5)));
      D = max(D, sm * 0.11 * paintedAt(s0, 0.04));
    }
  }
  // ---- the traveller under an umbrella, crossing the bridge
  if (uWalker.w > 0.0){
    float u = uWalker.x;
    vec2 base = uScK > 0.5 ? vec2(3.61 + 0.40 * u, 0.270 + 0.054 * sin(3.14159 * u))      // (the painted bridge's deck)
                           : vec2(3.62 + 0.40 * u, 0.255 + 0.07 * sin(3.14159 * u) + 0.004);
    vec2 q = p - base;
    float lean = 0.12;
    float body = smoothstep(0.0024, 0.0010, sdSeg(q, vec2(0.0, 0.006), vec2(lean * 0.02, 0.020)) - 0.0018);
    float s1 = sin(uWalker.y), s2 = sin(uWalker.y + 3.14159);
    float legs = smoothstep(0.0016, 0.0006, min(sdSeg(q, vec2(0.0, 0.007), vec2(0.004 * s1, 0.0)), sdSeg(q, vec2(0.0, 0.007), vec2(0.004 * s2, 0.0))));
    vec2 uq = q - vec2(lean * 0.02 + 0.001, 0.027);
    float umb = smoothstep(0.0012, 0.0, max(length(uq * vec2(1.0, 2.2)) - 0.013, -uq.y));
    float stick = smoothstep(0.0012, 0.0004, sdSeg(q, vec2(lean * 0.02, 0.016), vec2(lean * 0.02 + 0.001, 0.027)));
    D = max(D, max(max(body, legs), max(umb * 0.9, stick)) * 0.85 * uWalker.w);
  }
  // ---- egrets rising from the reeds: white birds, a few grey strokes for their shape, their wings beating
  for (int i = 0; i < 4; i++){
    vec4 e = uEg[i];
    if (e.w <= 0.0) continue;
    vec2 q = (p - e.xy) / e.w;
    if (dot(q, q) > 9.0) continue;
    float flap = sin(e.z);
    float bodyO = abs(length(q * vec2(0.55, 1.4)) - 0.30);
    float neck = sdSeg(q, vec2(-0.16, 0.08), vec2(-0.45, 0.18));
    float beak = sdSeg(q, vec2(-0.45, 0.18), vec2(-0.70, 0.12));
    float legsE = sdSeg(q, vec2(0.15, -0.02), vec2(0.75, -0.14));
    vec2 w1 = vec2(0.05, 0.10), w2 = w1 + vec2(0.30, 0.85 * flap), w3 = w2 + vec2(0.35, 0.25 * flap - 0.2);
    float wing = min(sdSeg(q, w1, w2), sdSeg(q, w2, w3));
    float lw = 0.035;
    float m = max(max(smoothstep(lw, lw * 0.3, bodyO) * 0.45, smoothstep(lw, lw * 0.3, wing) * 0.55), max(smoothstep(lw * 0.8, 0.0, neck) * 0.4, max(smoothstep(lw, 0.0, beak) * 0.9, smoothstep(lw * 0.7, 0.0, legsE) * 0.8)));
    D = max(D, m * 0.9);
  }
  // ---- geese, a skein of them going over, high, in a V
  if (uGeese.z > 0.0){
    for (int i = 0; i < 9; i++){
      float fi = float(i), rank = floor((fi + 1.0) * 0.5), sd = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
      vec2 g = uGeese.xy + vec2(rank * 0.026, sd * rank * 0.011);
      vec2 q = (p - g) / 0.010;
      if (dot(q, q) > 4.0) continue;
      float fl = sin(uTime * 6.0 + fi * 1.3), y0 = abs(q.x) * (0.25 + 0.45 * fl) - 0.05;
      D = max(D, smoothstep(0.16, 0.04, abs(q.y - y0)) * smoothstep(1.0, 0.7, abs(q.x)) * 0.6 * uGeese.z);
    }
  }
  // ---- 烟雨: a fine slanting drizzle, pale
  {
    vec2 r = vec2(p.x + p.y * 0.25, p.y);
    vec2 g = vec2(r.x * 160.0, r.y * 6.0 + t * 2.2);
    vec2 gi = floor(g);
    float h = hash12(gi);
    float l = smoothstep(0.08, 0.0, abs(fract(g.x) - 0.5)) * step(0.93, h) * smoothstep(0.0, 0.4, fract(g.y + h * 7.0)) * smoothstep(1.0, 0.6, fract(g.y + h * 7.0));
    D = max(D, l * 0.07);
  }
  tone = 0.5;
  return D;
}
void main(){
  vec2 fr = gl_FragCoord.xy / uRes.y;
  // the painting is composed for a wide frame; on a narrow one, keep its middle
  vec2 p = uView.xy + (gl_FragCoord.xy - 0.5 * uRes) / uRes.y / uView.z;
  float tone;
  float D = ink(p, tone);
  // ---- out of the deep: the black water breaking up into ink, swirling, thinning to threads, settling
  if (uBloom > 0.0){
    float t = uTime;
    vec2 w = p + 0.35 * vec2(fbm(p * 1.3 + vec2(t * 0.11, 0.0)), fbm(p * 1.3 + vec2(5.2, -t * 0.09))) - 0.17;
    w += 0.12 * vec2(fbm(w * 3.1 - t * 0.07), fbm(w * 3.1 + 7.0 + t * 0.05)) - 0.06;
    float n = fbm(w * 2.4);
    // where the ink thins it doesn't fade evenly: it pulls out into fine curling threads, as ink does in still water
    vec2 w2 = w * 4.0 + 0.6 * vec2(fbm(w * 6.0 + t * 0.08), fbm(w * 6.0 - 3.0 - t * 0.06));
    float rid = 1.0 - abs(2.0 * fbm(w2) - 1.0);
    float threads = pow(rid, 7.0);
    float th = mix(1.05, -0.15, uBloom);
    float mass = smoothstep(th - 0.06, th + 0.10, n);
    float near_ = smoothstep(th - 0.38, th - 0.02, n);
    float plume = max(mass * (0.88 + 0.12 * rid), threads * near_ * 0.95);
    D = mix(D, max(D, plume), smoothstep(0.0, 0.25, uBloom));
  }
  // ---- paper and ink
  vec2 pp = gl_FragCoord.xy / uRes.y;
  vec2 xu = p * 0.72;
  float xs = texture(uXuan, xu).r, xb = textureLod(uXuan, xu, 5.0).r, rel = xs - xb;
  float fib = 0.975 + 0.9 * rel - 0.02 * smoothstep(0.85, 1.0, vnoise(pp * vec2(80.0, 1500.0)));
  vec3 paper = vec3(0.925, 0.900, 0.845) * fib * (0.97 + 0.04 * fbm(p * 3.0)) * (0.98 + 0.08 * (xb - 0.75));
  vec3 inkC = vec3(0.075, 0.070, 0.068);
  float gran = 0.92 + 0.12 * vnoise(pp * 520.0) - 1.4 * rel;            // (the ink settles between the fibres, not on them)
  vec3 c = mix(paper, inkC, sat(D * gran));
  // ---- dawn: colour seeps into it — rose along the sky, a green-blue into the water and the hills
  if (uDawn > 0.0){
    float sky = smoothstep(0.55, 1.0, p.y) * (1.0 - sat(D * 2.0));
    vec3 rose = vec3(0.98, 0.76, 0.66), jade = vec3(0.55, 0.72, 0.66), gold = vec3(1.0, 0.86, 0.55);
    vec3 tint = mix(jade, rose, smoothstep(0.35, 0.9, p.y));
    tint = mix(tint, gold, exp(-pow((p.y - 0.80) / 0.08, 2.0)) * 0.6);
    float seep = uDawn * (0.6 + 0.4 * fbm(p * 3.0 + uTime * 0.05));
    c = mix(c, c * tint * 1.08, sat(seep * (0.5 + 0.5 * sky)));
    c = mix(c, gold * 1.02, sat((uDawn - 0.7) / 0.3) * sky * 0.6);
  }
  // ---- 一粒光: a point of vermilion, the only warm thing; its reflection a soft streak in the water
  {
    vec2 hp = uHero.xy, d = p - hp;
    float r = uHero.w;
    float core = exp(-dot(d, d) / (r * r)), halo = exp(-length(d) / (r * 5.0));
    float refl = exp(-pow(d.x / (r * 1.2), 2.0)) * smoothstep(0.0, -0.01, d.y) * exp(d.y / 0.05) * (0.6 + 0.4 * sin(p.y * 220.0 + uTime * 3.0)) * step(hp.y, 0.27);
    vec3 cin = vec3(0.90, 0.20, 0.08);
    c = mix(c, cin, sat(uHero.z * (core * 0.95 + halo * 0.25 + refl * 0.35)));
    c += vec3(1.0, 0.55, 0.25) * uHero.z * core * 0.35;
    // the spark it sends up at dawn: vermilion as it leaves, gold as it rises, the sun
    if (uSunK > 0.0){
      vec2 ds = p - uSunP.xy; float rs = uSunP.z;
      float cs = exp(-dot(ds, ds) / (rs * rs)), hs = exp(-length(ds) / (rs * 5.0));
      vec3 sc = mix(cin, vec3(1.0, 0.82, 0.48), smoothstep(0.0, 0.6, uSunK));
      c = mix(c, sc, sat(cs * 0.95 + hs * 0.6 * uSunK));
      c += vec3(1.0, 0.75, 0.40) * uSunK * exp(-length(ds) / 0.12) * 0.35;
    }
  }
  // the seal 「光」, red, the character left white in it (白文)
  {
    vec2 sp = (p - vec2(SL - 0.115, 0.045)) / 0.05;
    if (sp.x > 0.0 && sp.y > 0.0 && sp.x < 1.0 && sp.y < 1.0){
      float ch = texture(uSeal, vec2(sp.x, 1.0 - sp.y)).r;
      float worn = 0.75 + 0.25 * vnoise(sp * 40.0);
      c = mix(c, vec3(0.70, 0.13, 0.09), (1.0 - ch) * worn * 0.9 * smoothstep(0.85, 1.0, uGrow.w));
    }
  }
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.18 * dot(uv, uv) * 1.6;
  c += (hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5) * 0.012;
  o = vec4(c * uFade, 1.0);
}`;
/* ---------------------------------------------------------------- the brush
   The painting itself is laid in inkscroll.js (YL.INKSCROLL): every stroke of it, and when each is laid. */
const SL = 5.6;
const VS_FULL = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

/* ---------------------------------------------------------------- the light's way through the scroll
   It is the brush. From where it came up out of the black water it goes back to paint the old pine and the cliff and
   the man with his qin, then out along the far shore, up the mountain to its summit, down past the temple, up to the
   lip of the waterfall and down with the water, into the bamboo, over the bridge, through the village, past the
   pavilion into the reeds, and so to the skiff, where it stays as its lantern. */
const ROUTE = [[0.62, 0.58], [0.35, 0.57], [0.15, 0.46], [0.30, 0.30], [0.75, 0.30], [1.15, 0.45], [1.45, 0.72], [1.62, 0.90], [1.85, 0.70], [2.15, 0.88],
  [2.49, 0.96], [2.49, 0.55], [2.49, 0.24], [2.75, 0.16], [3.08, 0.30], [3.28, 0.42], [3.62, 0.27], [3.82, 0.34], [4.02, 0.27], [4.20, 0.38], [4.45, 0.40],
  [4.70, 0.35], [4.86, 0.25], [5.10, 0.24], [5.314, 0.232]];
// on the painted scroll, what moves in the wind: the bamboo grove, the willow by the bridge, the reeds (x0, x1, foot, top)
const SWAY = new Float32Array([2.97, 3.38, 0.03, 0.72,  3.38, 3.70, 0.20, 0.43,  4.97, 5.45, 0.0, 0.34]);
const VIEW = [[-1.2, 0.889, 0.50, 1.00], [0.6, 0.78, 0.47, 1.15], [2.2, 0.62, 0.45, 1.32], [3.8, 1.15, 0.50, 1.10], [5.6, 1.85, 0.52, 1.00],
  [7.4, 2.52, 0.56, 1.18], [9.4, 3.45, 0.48, 1.06], [11.3, 4.22, 0.46, 1.10], [13.0, 4.711, 0.50, 1.00], [14.6, 4.735, 0.515, 1.05], [16.4, 4.75, 0.53, 1.10]];
const WS = 144 / 1152;                           // (the map of when, for the far washes, at an eighth of the brush's resolution)
const SPREAD = 5.5;                              // how fast the painting spreads out from the light's way (painting units per unit of its time)
W.ink = {
  ready: false, t: 0, fade: 1, vol: 1, bloom: 0, dawn: 0, grow: [1, 1, 1, 1], now: 2, pan: [0, 0],
  init() {
    if (this.ready) return;
    const gl = YL.gl, IS = YL.INKSCROLL;
    this.p = YL.makeProgram('ink', VS_FULL, FS); YL.checkProgram(this.p);
    this.empty = gl.createVertexArray();
    const up = (src, mips, tex) => {
      const t = tex || gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
      if (mips) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.up = up;
    const seed = 0x2f6b7d; let a = seed; const rand = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const t0 = performance.now();
    const sc = this.scroll = IS.paint(rand);
    this.brush = up(sc.brush, true); this.washT = up(sc.wash, true);
    sc.brush = sc.wash = null;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.tsCv = mk(Math.round(IS.PW * IS.TS), Math.round(IS.PH * IS.TS)); this.twCv = mk(this.tsCv.width, this.tsCv.height);
    IS.times(sc, null, this.tsCv, this.twCv);
    this.ts = up(this.tsCv, false); this.tw = up(this.twCv, false);
    this.seal = up(YL.makeSeal ? YL.makeSeal() : document.createElement('canvas'), false);
    this.whenCv = mk(Math.round(IS.PW * WS), Math.round(IS.PH * WS));
    { const c = this.whenCv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, this.whenCv.width, this.whenCv.height); }   // (all painted until the light paints it)
    this.when = up(this.whenCv, false);
    console.log(`ink: painted ${sc.ops.length} marks in ${Math.round(performance.now() - t0)} ms`);
    this.loadTimes();
    if (!this.inited) this.t = +(YL.QS.get('wt') || 0);
    this.inited = true;
    this.ready = true;
  },
  // the map of when each place is painted (tools/ink_times.py): a PNG holding 16-bit times, read back to seconds and made a
  // half-float texture (r the lines, g the washes)
  loadTimes() {
    const im = YL.img('ink_time'), J = YL.INK_TIME;
    if (!im || !im.naturalWidth || !J || this.ptTex) return;
    const gl = YL.gl, w = im.naturalWidth, h = im.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, w, h).data, f = new Float32Array(w * h * 2), span = J.T1 - J.T0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 2;               // (rows from the bottom, as GL has them)
      f[o] = J.T0 + (d[i] * 256 + d[i + 1]) / 65535 * span; f[o + 1] = J.T0 + d[i + 2] / 255 * span;
    }
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, w, h, 0, gl.RG, gl.FLOAT, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.ptTex = t; this.brushWay = J.brush; this.pace = J.pace;
  },
  // the eye along the scroll, by the painting's clock: in close on the old pine and the cliff as they are painted, back for
  // the mountain, in to the waterfall, along the bamboo and the bridge to the village, out to the reeds and the skiff
  viewAt(ts, aspect) {
    const K = VIEW, n = K.length;
    let i = 0; while (i < n - 2 && ts > K[i + 1][0]) i++;
    const a = K[Math.max(0, i - 1)], b = K[i], c = K[i + 1], d = K[Math.min(n - 1, i + 2)];
    const u = Math.max(0, Math.min(1, (ts - b[0]) / (c[0] - b[0])));
    const cr = (j) => { const m1 = (c[j] - a[j]) / Math.max(1e-3, c[0] - a[0]) * (c[0] - b[0]), m2 = (d[j] - b[j]) / Math.max(1e-3, d[0] - b[0]) * (c[0] - b[0]);
      const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * b[j] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * c[j] + (u3 - u2) * m2; };
    const z = cr(3), hw = aspect * 0.5 / z, hh = 0.5 / z;
    return [Math.max(hw, Math.min(SL - hw, cr(1))), Math.max(hh, Math.min(1 - hh, cr(2))), z];
  },
  // where the brush is at ts (its way: tools/ink_times.py)
  brushAt(ts) {
    const B = this.brushWay; if (!B || !B.length) return null;
    if (ts <= B[0][0]) return [B[0][1], B[0][2]];
    for (let i = 0; i < B.length - 1; i++) if (ts < B[i + 1][0]) { const u = (ts - B[i][0]) / (B[i + 1][0] - B[i][0]); return [B[i][1] + (B[i + 1][1] - B[i][1]) * u, B[i][2] + (B[i + 1][2] - B[i][2]) * u]; }
    return [B[B.length - 1][1], B[B.length - 1][2]];
  },
  frontAt(ts) { const P = this.pace || [[0, 0], [13, 5.5]]; if (ts <= P[0][0]) return P[0][1]; for (let i = 0; i < P.length - 1; i++) if (ts < P[i + 1][0]) return P[i][1] + (P[i + 1][1] - P[i][1]) * (ts - P[i][0]) / (P[i + 1][0] - P[i][0]); return P[P.length - 1][1]; },
  // 一粒光: a point of vermilion, drifting down to the skiff, where it becomes its lantern
  hero: { on: true, p: [5.314, 0.232], v: [0, 0], home: [5.314, 0.232], aim: null },
  arrive(px, py) {
    this.hero.p = [px, py]; this.hero.v = [0, 0]; this.hero.on = true; this.route = [[px, py], ...ROUTE];
    this.now = -0.05; this.painting = false; this.reach = px; this.pan = [0, 0]; this.walkT = this.egT = this.geT = undefined;   // (nothing painted yet)
    this.t0 = this.t; this.nowS = -1.2; this.view = null;
  },
  // the light sets off with its brush: work out when the painting reaches each place (F), and so when each of its marks
  // is laid
  startPaint() {
    if (!this.ready) this.init();
    const R = this.route || [this.hero.p.slice(), ...ROUTE], IS = YL.INKSCROLL, t0 = performance.now();
    let L = 0; const seg = []; for (let i = 0; i < R.length - 1; i++) { const l = Math.hypot(R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]); seg.push(l); L += l; }
    this.routeL = L; this.paintT = 0; this.painting = true; this.now = 0;
    const S = []; let acc = 0;
    for (let i = 0; i < R.length - 1; i++) { const n = Math.max(1, Math.ceil(seg[i] / 0.02)); for (let k = 0; k < n; k++) { const u = k / n; S.push(R[i][0] + (R[i + 1][0] - R[i][0]) * u, R[i][1] + (R[i + 1][1] - R[i][1]) * u, (acc + seg[i] * u) / L); } acc += seg[i]; }
    S.push(R[R.length - 1][0], R[R.length - 1][1], 1);
    const F = (q) => { let m = 9; const x = q[0], y = q[1]; for (let j = 0; j < S.length; j += 3) { const dx = x - S[j], dy = y - S[j + 1], v = S[j + 2] + Math.sqrt(dx * dx + dy * dy) / SPREAD; if (v < m) m = v; } return m; };
    // the far washes' map
    const cv = this.whenCv, c = cv.getContext('2d'), w = cv.width, h = cv.height, img = c.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const b = Math.round(255 * Math.min(0.985, F([(i + 0.5) / w * SL, (j + 0.5) / h]))), o = (j * w + i) * 4; img.data[o] = b; img.data[o + 1] = b; img.data[o + 2] = 0; img.data[o + 3] = 255; }
    c.putImageData(img, 0, 0);
    this.up(cv, false, this.when);
    // and every mark's
    IS.times(this.scroll, F, this.tsCv, this.twCv);
    this.up(this.tsCv, false, this.ts); this.up(this.twCv, false, this.tw);
    console.log(`ink: the painting's times laid in ${Math.round(performance.now() - t0)} ms`);
  },
  // where it is along its way after s (m of painting)
  routeAt(s) {
    const R = this.route; let left = s;
    for (let i = 0; i < R.length - 1; i++) { const l = Math.hypot(R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]); if (left <= l) return [R[i][0] + (R[i + 1][0] - R[i][0]) * left / l, R[i][1] + (R[i + 1][1] - R[i][1]) * left / l]; left -= l; }
    return R[R.length - 1].slice();
  },
  // a point on the screen (ndc) in the painting's coordinates
  toPaint(nx, ny, aspect) { const v = this.view || [0.8889 + (this.pan ? this.pan[0] : 0), 0.5, 1]; return [v[0] + nx * aspect * 0.5 / v[2], v[1] + ny * 0.5 / v[2]]; },
  toNdc(q, aspect) { const v = this.view || [0.8889 + (this.pan ? this.pan[0] : 0), 0.5, 1]; return [(q[0] - v[0]) * v[2] / (aspect * 0.5), (q[1] - v[1]) * v[2] / 0.5]; },
  pointer(nx, ny) { this.hero.aim = this.toPaint(nx, ny, YL.canvasAspect()); this.hero.aimT = this.t; },
  update(dt) {
    this.t += dt;
    const H = this.hero;
    if (this.t0 !== undefined) this.nowS = this.t - this.t0 - 1.2;
    const scroll = !!this.ptTex && YL.QS.get('inkgen') !== '0';
    if (this.painting && scroll) {
      // the light is the brush: it goes where the strokes are being laid, and at the end down to the skiff
      this.paintT = this.nowS;
      const b = this.brushAt(this.nowS) || H.home, e = YL.smooth(11.6, 12.9, this.nowS);
      const tgt = [b[0] + (H.home[0] - b[0]) * e, b[1] + (H.home[1] - b[1]) * e];
      for (let i = 0; i < 2; i++) { H.v[i] += (tgt[i] - H.p[i]) * 26.0 * dt; H.v[i] *= Math.exp(-dt * 9.0); H.p[i] += H.v[i] * dt; }
      this.now = Math.min(1.06, this.nowS / 13.0);
      this.reach = this.frontAt(this.nowS);
      if (this.nowS >= 13.0) this.painting = false;
    } else if (this.painting) {
      // along its way at a brush's pace, easing off at the end; then everything it didn't pass over fills in
      this.paintT += dt;
      const sp = 0.68, s = Math.min(this.routeL, sp * Math.max(0, this.paintT - 0.25) * YL.smooth(0.25, 1.0, this.paintT));
      const p = this.routeAt(s); H.v = [(p[0] - H.p[0]) / Math.max(dt, 1e-4), (p[1] - H.p[1]) / Math.max(dt, 1e-4)]; H.p = p;
      this.now = s / this.routeL + (s >= this.routeL ? 0.06 * YL.smooth(0, 1.2, this.paintT - this.routeL / sp - 0.25) : 0);
      if (s >= this.routeL && this.now >= 1.059) this.painting = false;
      this.reach = Math.max(this.reach || 0, p[0]);
    } else if (this.sunK > 0) {
      // dawn: it stays, the skiff's lantern; a spark of it goes up into the sky, to where the sun will be
      const e = this.sunK * this.sunK * (3 - 2 * this.sunK), sp = this.view ? this.toPaint(0.13, 0.72, YL.canvasAspect()) : [this.pan[0] + 1.0 + (1.7778 - YL.canvasAspect()) * 0.5, 0.86];
      this.sunP = [H.home[0] + (sp[0] - H.home[0]) * e, H.home[1] + (sp[1] - H.home[1]) * e + 0.06 * Math.sin(Math.PI * e)];
      H.p = H.home.slice();
    } else {
      const tgt = H.aim && this.t - H.aimT < 3 ? H.aim : H.home;
      for (let i = 0; i < 2; i++) { H.v[i] += (tgt[i] - H.p[i]) * 3.0 * dt; H.v[i] *= Math.exp(-dt * 2.4); H.p[i] += H.v[i] * dt; }
      if (this.reach === undefined) this.reach = SL;                 // (a jump straight here: all painted, at the end of the scroll)
    }
    // the eye goes along the scroll after the brush, never back
    const aspect = YL.canvasAspect();
    if (scroll && this.t0 !== undefined) {
      this.view = this.viewAt(Math.min(this.nowS, 16.4), aspect);   // (and on into the dawn, slowly closing in)
      this.pan = [this.view[0] - 0.8889, 0];
    } else {
      const tgtPan = Math.max(0, Math.min(SL - aspect, (this.reach ?? 0) - aspect * 0.62));
      this.pan = [this.pan[0] + (Math.max(tgtPan, this.pan[0]) - this.pan[0]) * (1 - Math.exp(-dt * 2.2)), 0];
      this.view = null;
    }
    if (YL.QS.has('ipan')) { this.pan = [+YL.QS.get('ipan'), 0]; this.view = [this.pan[0] + aspect * 0.5 + (1.7778 - aspect) * 0.5, 0.5, 1]; }   // (debug: look at a given stretch)
    // the traveller sets off over the bridge once it is painted; the egrets get up as the brush comes into the reeds
    const k = this.now;
    if (this.walkT === undefined && (this.reach || 0) > 3.75) this.walkT = this.t;
    if (this.egT === undefined && (this.reach || 0) > 4.95) this.egT = this.t;
    if (this.geT === undefined && (this.reach || 0) > 4.4) this.geT = this.t;
    this.sound(dt);
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    const H = this.hero, br = 1 + 0.07 * Math.sin(this.t * 2.1) + 0.03 * Math.sin(this.t * 5.3);
    U(p, 'uRes', [w, h]); U(p, 'uTime', this.t); U(p, 'uFade', this.fade); U(p, 'uAspect', aspect);
    U(p, 'uBloom', this.bloom); U(p, 'uDawn', this.dawn); U(p, 'uGrow', this.grow); U(p, 'uPan', this.pan || [0, 0]);
    const sk = this.sunK || 0;
    U(p, 'uHero', [H.p[0], H.p[1], H.on ? br : 0, 0.0045]); U(p, 'uSunK', sk);
    U(p, 'uSunP', this.sunP ? [this.sunP[0], this.sunP[1], 0.0045 + 0.022 * sk * sk] : [0, 0, 0]);
    U(p, 'uNow', this.now); U(p, 'uNowS', this.nowS === undefined ? 99 : this.nowS);
    U(p, 'uView', this.view || [0.8889 + (this.pan ? this.pan[0] : 0) + 0 * aspect, 0.5, 1]);
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, this.ptTex || null); gl.uniform1i(p.u.uPT, 9);
    const wt = this.walkT === undefined ? -1 : this.t - this.walkT;
    U(p, 'uWalker', wt < 0 ? [0, 0, 0, 0] : [Math.min(1, wt / 7.0), wt * 2 * Math.PI * 1.6, 0, 1 - YL.smooth(6.6, 7.0, wt)]);
    const eg = new Float32Array(16), et = this.egT === undefined ? -1 : this.t - this.egT;
    for (let i = 0; i < 4; i++) if (et >= 0) { const a = Math.max(0, et - i * 0.25); eg.set([5.06 + 0.05 * i - (0.09 + 0.02 * i) * a, 0.11 + 0.03 * i + (0.075 + 0.012 * i) * a + 0.01 * Math.sin(a * 2 + i), a * 9.0 + i * 1.7, a > 0 ? 0.024 + 0.003 * i : 0], i * 4); }
    gl.uniform4fv(p.u.uEg, eg);
    const gt = this.geT === undefined ? -1 : this.t - this.geT;
    U(p, 'uGeese', gt < 0 ? [0, 0, 0] : [5.72 - 0.075 * gt, 0.80 + 0.012 * Math.sin(gt * 0.6), YL.smooth(0, 1.0, gt)]);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.when); gl.uniform1i(p.u.uWhen, 2);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.brush); gl.uniform1i(p.u.uBrush, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.seal); gl.uniform1i(p.u.uSeal, 1);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.washT); gl.uniform1i(p.u.uWash, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.ts); gl.uniform1i(p.u.uTS, 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.tw); gl.uniform1i(p.u.uTW, 5);
    { const xt = YL.paperTex('paper_xuan'); gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, xt || null); gl.uniform1i(p.u.uXuan, 6); }
    // the painted scroll (generated; see assets/prompts/in_A.txt, in_B.txt), when it has loaded (?inkgen=0: the brush's own)
    const sa = YL.assetTex('ink_a'), sb = YL.assetTex('ink_b'), scOn = !!(sa && sb) && YL.QS.get('inkgen') !== '0';
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, sa || this.ts); gl.uniform1i(p.u.uScA, 7);
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, sb || this.ts); gl.uniform1i(p.u.uScB, 8);
    U(p, 'uScK', scOn && this.ptTex ? 1 : 0); gl.uniform4fv(p.u.uScSw, SWAY);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: rain on water, the lap of it; the waterfall as it comes into view; a guqin (古琴) plucked now and then, its notes sliding */
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const pink = noiseBuffer(7.7, 'pink');
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    const rg = ctx.createGain(); rg.gain.value = 0.10;
    loop(pink, 1.0, hp); hp.connect(lp); lp.connect(rg); rg.connect(bus);
    // a long, soft room for the qin
    const sr = ctx.sampleRate, n = Math.floor(sr * 4), ir = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 1.2)); }
    const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.35; wet.connect(conv); conv.connect(bus);
    // the waterfall: a low rush, louder as the eye comes to it
    const fh = ctx.createBiquadFilter(); fh.type = 'highpass'; fh.frequency.value = 110;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1500;
    const fg = ctx.createGain(); fg.gain.value = 0;
    loop(noiseBuffer(5.3, 'pink'), 1.0, fh); fh.connect(fl); fl.connect(fg); fg.connect(bus);
    this.snd = { ctx, bus, wet, fall: fg, next: 0.6, k: 0 };
  },
  // a plucked silk string: Karplus–Strong, low and woody, with the left hand sliding the pitch after the pluck
  qin(f0, f1, when, gain = 0.25) {
    const S = this.snd, ctx = S.ctx, sr = ctx.sampleRate, dur = 3.5, n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let period = sr / f0, L = Math.ceil(sr / Math.min(f0, f1)) + 2;
    const line = new Float32Array(L * 2); for (let i = 0; i < line.length; i++) line[i] = Math.random() * 2 - 1;
    let w = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const u = Math.min(1, Math.max(0, (i / sr - 0.25) / 0.6)), f = f0 + (f1 - f0) * u * u * (3 - 2 * u);
      period = sr / f;
      const rp = w - period; const i0 = Math.floor(rp), fr = rp - i0;
      const a = line[(i0 + line.length * 4) % line.length], b2 = line[(i0 + 1 + line.length * 4) % line.length];
      const x = (a * (1 - fr) + b2 * fr);
      const y = 0.5 * (x + prev) * 0.996; prev = x;
      line[w % line.length] = y; w++;
      d[i] = y * Math.min(1, i / 40);
    }
    const s = ctx.createBufferSource(); s.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(lp); lp.connect(g); g.connect(S.bus); g.connect(S.wet); s.start(when);
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.6);
    const eye = (this.pan ? this.pan[0] : 0) + 0.889;
    S.fall.gain.setTargetAtTime(0.20 * Math.exp(-Math.pow((eye - 2.49) / 0.75, 2)), now, 0.5);
    if ((S.next -= dt) <= 0) {
      // a phrase from the pentatonic scale: D E G A B (low), one or two notes, one of them slid
      const sc = [146.83, 164.81, 196.0, 220.0, 246.94, 293.66];
      const k = S.k++ % 4, a = sc[[2, 4, 3, 5][k]], b = sc[[3, 3, 2, 4][k]];
      this.qin(a, k % 2 ? b : a, now + 0.05);
      if (k % 2 === 0) this.qin(sc[[0, 1, 0, 2][k]], sc[[0, 1, 0, 2][k]], now + 0.75, 0.18);
      S.next = 3.2 + Math.random() * 1.5;
    }
  },
};
})();
