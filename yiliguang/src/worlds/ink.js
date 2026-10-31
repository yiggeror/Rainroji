/* ============================================================================
   世界六 · 水墨·烟雨山水
   ----------------------------------------------------------------------------
   深海的黑水化开，像一滴墨落进清水：翻涌、散成丝，再沉下来，沉成山。
   · 只有墨和纸。没有一根硬线：每一块墨的边都是湿的——往纸里洇开，毛边顺着纸的纤维，边上积一圈深的墨。
   · 墨分五色：远山淡墨一抹，中景的山用中墨，近处的石壁浓墨、焦墨，干笔擦出飞白；石上一棵老松斜出水面。
   · 大片留白就是水和云：雾一层一层地流过山腰，细雨斜斜地下。
   · 笔一笔一笔地落下来：远山先洇开，然后中景，然后石壁和松，最后是水上一叶小舟。
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
uniform vec4 uGrow;          // how far each layer of ink has spread: far peaks, middle range, the near cliff and its pine, the boat
uniform vec4 uHero;          // the vermilion light: where (painting coords), how bright, how big
uniform vec2 uPan;
uniform sampler2D uBrush;    // the painted layers: R rocks and cliffs and the built things, G trees, B the willow and reeds
uniform sampler2D uWhen;     // when the light's brush reached each place (1 - the fraction of its way): R close by it, G within a wash's reach
uniform float uNow;          // how far along its way the light is (0 … 1; past 1, everything is painted)
uniform vec4 uWalker;        // the traveller crossing the bridge: where along it (0 … 1), the step, on/off
uniform vec4 uEg[4];         // egrets rising from the reeds: where, the beat of the wings, size
const float SL = 5.6;
uniform sampler2D uSeal;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.96875; }
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
// a spreading front: the ink reaches from where the brush touched (seed) out to r; at the front it is wettest
float spread(vec2 p, vec2 seed, float r, float seedN){
  float d = length((p - seed) * vec2(0.8, 1.0)) + 0.10 * (fbm(p * 5.0 + seedN) - 0.5);
  return smoothstep(r, r - 0.04, d);
}
// a mountain's outline: peaks with rounded tops (height h at x = c, flanks falling at slope k)
float peak(float x, float c, float h, float k){ float d = abs(x - c); return h - k * d * d / (d + 0.03); }
// dry brush (飞白): streaks where the hairs of a nearly dry brush skipped the paper, running along dir
float dry(vec2 p, vec2 dir, float amt){
  vec2 q = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
  float st = vnoise(vec2(q.x * 9.0, q.y * 260.0)) * 0.6 + vnoise(vec2(q.x * 30.0, q.y * 700.0)) * 0.4;
  return 1.0 - amt * smoothstep(0.45, 0.75, st);
}
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
// the light painting: has its brush (k = 0) or the wash it leaves (k = 1) reached p yet? and how wet is it still
float when(vec2 p, int k){ vec2 w = 1.0 - texture(uWhen, vec2(p.x / SL, p.y)).rg; return k == 0 ? w.r : w.g + 0.025; }
float painted(vec2 p, float tm){ return smoothstep(tm - 0.004, tm + 0.010, uNow + 0.010 * (fbm(p * 30.0) - 0.5)); }
float wetness(float tm){ return exp(-max(uNow - tm, 0.0) / 0.035) * step(tm, uNow + 0.01); }
// the painting: how much ink lies at p (and how warm a grey it is)
float ink(vec2 p, out float tone){
  tone = 0.0;
  float t = uTime, D = 0.0;
  // ---- the far peaks: pale, slender, rising out of the mist
  {
    float x = p.x, n = 0.012 * (fbm(vec2(x * 9.0, 1.0)) - 0.5);
    float r = max(max(peak(x, 0.62, 0.92, 2.6), peak(x, 0.76, 0.80, 3.0)), max(peak(x, 0.47, 0.71, 3.2), max(peak(x, 0.93, 0.68, 2.8), peak(x, 1.10, 0.60, 2.4))));
    r = max(r, max(max(peak(x, 2.05, 0.80, 2.2), peak(x, 2.35, 0.97, 2.6)), max(peak(x, 2.95, 0.84, 2.4), peak(x, 3.30, 0.70, 2.8))));
    r = max(r, max(max(peak(x, 3.75, 0.76, 2.4), peak(x, 4.20, 0.66, 2.6)), max(peak(x, 4.80, 0.62, 2.2), peak(x, 5.30, 0.56, 2.6))));
    float sd = r + n - p.y;
    float base = smoothstep(0.38, 0.62, p.y);
    float d = wash(p, sd, 1.6, 1.0) * base * 0.16;
    // texture down their faces (hemp-fibre, barely there), the ink heavier near the tops and thinning into the mist
    float hf = vnoise(vec2((x + 0.3 * p.y) * 80.0, p.y * 8.0)) * 0.6 + vnoise(vec2((x - 0.35 * p.y) * 140.0, p.y * 12.0)) * 0.4;
    d *= (0.70 + 0.55 * smoothstep(0.5, 0.85, hf)) * (0.85 + 0.45 * smoothstep(0.10, 0.0, sd));
    D += d * max(spread(p, vec2(0.62, 0.80), uGrow.x * 1.1, 1.0) * step(x, 1.6), painted(p, when(p, 1)));
  }
  // ---- the middle range on the right: a long ridge, hemp-fibre strokes down its slopes, moss dots along its top
  {
    float x = p.x;
    float r = max(peak(x, 1.25, 0.63, 1.2), max(peak(x, 1.52, 0.55, 1.5), peak(x, 1.05, 0.47, 2.0))) + 0.015 * (fbm(vec2(x * 7.0, 3.0)) - 0.5);
    float sd = r - p.y;
    float base = smoothstep(0.33, 0.50, p.y);
    float d = wash(p, sd, 1.2, 7.0) * base * 0.32;
    // 披麻皴: long, slightly wavy strokes running down the slopes
    float f = vnoise(vec2((x + 0.25 * p.y) * 95.0, p.y * 9.0)) * 0.7 + vnoise(vec2((x - 0.3 * p.y) * 160.0, p.y * 14.0)) * 0.3;
    d *= 0.70 + 0.55 * smoothstep(0.55, 0.85, f) * smoothstep(0.0, 0.05, sd);
    // 点苔: dark dots of moss along the ridge
    vec2 g = p * vec2(70.0, 70.0); vec2 gi = floor(g);
    float h = hash12(gi);
    float dot_ = smoothstep(0.30, 0.12, length(fract(g) - 0.5 - 0.2 * (vec2(hash12(gi + 3.0), hash12(gi + 5.0)) - 0.5))) * step(0.72, h) * smoothstep(0.035, 0.0, abs(sd - 0.012));
    d = max(d, dot_ * 0.75 * base);
    D = max(D, d * spread(p, vec2(1.30, 0.58), uGrow.y * 1.2, 7.0));
    // and the hills behind the village, further on
    float r2 = max(peak(x, 4.05, 0.50, 1.6), max(peak(x, 4.45, 0.46, 1.8), peak(x, 3.55, 0.44, 2.2))) + 0.015 * (fbm(vec2(x * 7.0, 5.0)) - 0.5);
    float d2 = wash(p, r2 - p.y, 1.2, 9.0) * smoothstep(0.30, 0.45, p.y) * 0.24;
    D = max(D, d2 * painted(p, when(p, 1)));
  }
  // ---- the far shore: a low pale line of land across the water, a few dots of trees
  {
    float y0 = 0.305 + 0.012 * (fbm(vec2(p.x * 4.0, 9.0)) - 0.5) + 0.02 * smoothstep(0.9, 1.4, p.x);
    float sd = min(y0 + 0.018 * fbm(vec2(p.x * 25.0, 2.0)) - p.y, p.y - 0.292);
    float d = wash(p, sd, 0.8, 11.0) * 0.20 * smoothstep(0.45, 0.6, p.x) * smoothstep(1.75, 1.55, p.x)
            + wash(p, sd, 0.8, 13.0) * 0.18 * smoothstep(4.6, 4.8, p.x) * painted(p, when(p, 1));
    D = max(D, d * spread(p, vec2(1.0, 0.30), uGrow.y * 1.6, 11.0));
  }
  // ---- the near things, painted with the brush: wet. Each stroke bleeds a little into the paper round it, and its ink
  // pools at its edges as it dries (darker there than in its middle)
  {
    vec2 uv = vec2(p.x / SL, 1.0 - p.y);
    vec2 uvb = uv + vec2(0.0018 / SL * sin(uTime * 1.4 + p.x * 40.0 + p.y * 12.0) * smoothstep(0.15, 0.45, p.y), 0.0);   // (the willow's strands in the air)
    vec3 d0 = vec3(texture(uBrush, uv).rg, texture(uBrush, uvb).b), d1 = textureLod(uBrush, uv, 2.5).rgb, d2 = textureLod(uBrush, uv, 4.5).rgb;
    vec3 wet = d0 + 0.45 * max(d1 - d0, 0.0) + 0.55 * max(d0 - d2, 0.0) * d0;
    wet *= 0.85 + 0.3 * vnoise(p * 240.0);
    // where the light's brush has been: there, just now; the ink darker and spreading a little while it is wet
    float tb = when(p, 0), pb = painted(p, tb), fresh = wetness(tb);
    vec3 wf = wet * (1.0 + 0.35 * fresh) + fresh * 0.25 * vec3(textureLod(uBrush, uv, 3.5).rgb);
    D = max(D, wf.r * 0.92 * pb);
    D = max(D, wf.g * 0.90 * pb);
    D = max(D, wf.b * 0.85 * pb);
  }
  // ---- the water: left white; a few short pale strokes for ripples
  {
    float yy = p.y;
    float rip = smoothstep(0.0025, 0.0, abs(fract(yy * 38.0 + 0.3 * vnoise(vec2(p.x * 3.0, floor(yy * 38.0)))) - 0.5) / 38.0) * smoothstep(0.58, 0.85, vnoise(vec2(p.x * 9.0 - t * 0.05, floor(yy * 38.0) * 3.1)));
    float where_ = smoothstep(0.29, 0.25, yy) * smoothstep(0.55, 0.65, p.x) * smoothstep(1.9, 1.7, p.x) + smoothstep(0.25, 0.21, yy) * smoothstep(0.03, 0.06, yy) * smoothstep(2.85, 3.0, p.x);
    D = max(D, rip * 0.12 * where_ * painted(p, when(p, 1)));
  }
  // ---- a skiff on the water: a dark sliver of a hull, a fisherman in a broad hat, a pole
  {
    vec2 bc = vec2(5.30 + 0.004 * sin(t * 0.7), 0.205 + 0.002 * sin(t * 1.3));
    vec2 q = p - bc;
    float hull = smoothstep(0.004, 0.0015, abs(q.y + 0.0015 - 0.35 * q.x * q.x / 0.04) - 0.0035 * (1.0 - q.x * q.x / 0.0016)) * step(abs(q.x), 0.040);
    float man = smoothstep(0.0045, 0.002, length((q - vec2(0.012, 0.012)) * vec2(1.6, 1.0)) - 0.005);
    float hat = smoothstep(0.003, 0.001, abs(q.y - 0.020 + 0.25 * abs(q.x - 0.012)) - 0.0012) * step(abs(q.x - 0.012), 0.011);
    float pole = smoothstep(0.0018, 0.0007, sdSeg(q, vec2(0.016, 0.014), vec2(0.045, -0.025)));
    float boat = max(max(hull, man), max(hat, pole)) * 0.85;
    D = max(D, boat * painted(p, when(p, 0)));
  }
  // ---- the waterfall: the white of the paper between the dark lips of the rock, streaming; mist where it lands
  {
    float xf = p.x - 2.485, up = step(0.56, p.y) * step(p.y, 0.86), lo = step(0.22, p.y) * step(p.y, 0.50);
    float hw = mix(0.036, 0.042, lo);
    if ((up + lo) > 0.0 && abs(xf) < hw){
      float st = vnoise(vec2(xf * 260.0, p.y * 7.0 + t * 2.6)) * 0.7 + vnoise(vec2(xf * 600.0, p.y * 16.0 + t * 4.0)) * 0.3;
      float streak = smoothstep(0.62, 0.9, st) * 0.20 + smoothstep(hw * 0.55, hw, abs(xf)) * 0.12;
      D = max(D, streak * painted(p, when(p, 0)));
    }
    // spray: the paper left white, and soft grey billows rising and fading round where the water lands
    float pool = exp(-pow((p.x - 2.49) / 0.16, 2.0) - pow((p.y - 0.21) / 0.06, 2.0)), ledge = exp(-pow((p.x - 2.49) / 0.07, 2.0) - pow((p.y - 0.53) / 0.025, 2.0));
    float bil = fbm(vec2(p.x * 9.0, p.y * 9.0 - t * 0.35));
    D *= 1.0 - 0.9 * sat(pool * 1.3 + ledge);
    D = max(D, 0.07 * smoothstep(0.45, 0.75, bil) * pool * painted(p, when(p, 1)));
  }
  // ---- the traveller under an umbrella, crossing the bridge
  if (uWalker.w > 0.0){
    float u = uWalker.x;
    vec2 base = vec2(3.62 + 0.40 * u, 0.255 + 0.07 * sin(3.14159 * u) + 0.004);
    vec2 q = p - base;
    float lean = 0.12;
    float body = smoothstep(0.0024, 0.0010, sdSeg(q, vec2(0.0, 0.006), vec2(lean * 0.02, 0.020)) - 0.0018);
    float s1 = sin(uWalker.y), s2 = sin(uWalker.y + 3.14159);
    float legs = smoothstep(0.0016, 0.0006, min(sdSeg(q, vec2(0.0, 0.007), vec2(0.004 * s1, 0.0)), sdSeg(q, vec2(0.0, 0.007), vec2(0.004 * s2, 0.0))));
    vec2 uq = q - vec2(lean * 0.02 + 0.001, 0.027);
    float umb = smoothstep(0.0012, 0.0, max(length(uq * vec2(1.0, 2.2)) - 0.013, -uq.y)) ;
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
    float bodyO = abs(length((q - vec2(0.0, 0.0)) * vec2(0.55, 1.4)) - 0.30);
    float neck = sdSeg(q, vec2(-0.16, 0.08), vec2(-0.45, 0.18));
    float beak = sdSeg(q, vec2(-0.45, 0.18), vec2(-0.70, 0.12));
    float legsE = sdSeg(q, vec2(0.15, -0.02), vec2(0.75, -0.14));
    vec2 w1 = vec2(0.05, 0.10), w2 = w1 + vec2(0.30, 0.85 * flap), w3 = w2 + vec2(0.35, 0.25 * flap - 0.2);
    float wing = min(sdSeg(q, w1, w2), sdSeg(q, w2, w3));
    float lw = 0.035;
    float m = max(max(smoothstep(lw, lw * 0.3, bodyO) * 0.45, smoothstep(lw, lw * 0.3, wing) * 0.55), max(smoothstep(lw * 0.8, 0.0, neck) * 0.4, max(smoothstep(lw, 0.0, beak) * 0.9, smoothstep(lw * 0.7, 0.0, legsE) * 0.8)));
    D = max(D, m * 0.9);
  }
  // ---- mist: bands of it flowing across the mountains' waists; the ink there thins to nothing
  {
    float m1 = smoothstep(0.35, 0.7, fbm(vec2(p.x * 2.2 - t * 0.018, p.y * 7.0 + 1.0))) * exp(-pow((p.y - 0.47) / 0.07, 2.0));
    float m2 = smoothstep(0.45, 0.75, fbm(vec2(p.x * 1.6 - t * 0.011 + 4.0, p.y * 5.0))) * exp(-pow((p.y - 0.68) / 0.09, 2.0));
    D *= 1.0 - 0.9 * max(m1, m2 * 0.8);
  }
  // ---- 烟雨: a fine slanting drizzle, pale
  {
    vec2 r = vec2(p.x + p.y * 0.25, p.y);
    vec2 g = vec2(r.x * 160.0, r.y * 6.0 + t * 2.2);
    vec2 gi = floor(g);
    float h = hash12(gi);
    float l = smoothstep(0.08, 0.0, abs(fract(g.x) - 0.5) - 0.0) * step(0.93, h) * smoothstep(0.0, 0.4, fract(g.y + h * 7.0)) * smoothstep(1.0, 0.6, fract(g.y + h * 7.0));
    D = max(D, l * 0.07);
  }
  tone = 0.5;
  return D;
}
void main(){
  vec2 fr = gl_FragCoord.xy / uRes.y;
  // the painting is composed for a wide frame; on a narrow one, keep its middle
  vec2 p = vec2(fr.x + (1.7778 - uAspect) * 0.5, fr.y) + uPan;
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
  float fib = 0.97 + 0.03 * vnoise(pp * vec2(900.0, 120.0)) - 0.025 * smoothstep(0.85, 1.0, vnoise(pp * vec2(80.0, 1500.0)));
  vec3 paper = vec3(0.925, 0.900, 0.845) * fib * (0.97 + 0.04 * fbm(pp * 3.0));
  vec3 inkC = vec3(0.075, 0.070, 0.068);
  float gran = 0.92 + 0.16 * vnoise(pp * 520.0);
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
   The near things are painted, not computed: strokes of a soft brush whose hairs each carry their own ink, and run dry
   one by one (the outer ones first), skipping the paper where they do (飞白). They are laid into a canvas the size of the
   painting, each layer in its own channel, so each can spread into the paper at its own moment. */
const SL = 5.6;                                   // the scroll's length (the picture is 1 high)
const PW = Math.round(SL * 1152), PH = 1152, PS = 1152;
function paint(rand) {
  const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  const X = x => x * PS, Y = y => (1 - y) * PS;
  // a smooth run through points [x, y, width] (painting units)
  const run = (pts, per = 10) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let k = 0; k < per; k++) { const t = k / per, t2 = t * t, t3 = t2 * t; out.push([0, 1, 2].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); }
    }
    out.push(pts[pts.length - 1].slice()); return out;
  };
  // one stroke of the brush
  function stroke(pts, { ch = 0, ink = 0.8, hairs = 24, dry = 0.3, taper = [0.12, 0.3], per = 10 } = {}) {
    const P = run(pts, per), n = P.length, col = ['255,0,0', '0,255,0', '0,0,255'][ch];
    const wMax = Math.max(...P.map(q => q[2]));
    for (let h = 0; h < hairs; h++) {
      const off = ((h + 0.5) / hairs * 2 - 1) * (0.85 + 0.3 * rand()), load = ink * (0.45 + 0.55 * rand());
      const runOut = 1 - dry * (0.2 + 0.8 * rand()) * (0.3 + 0.7 * Math.abs(off)), seed = rand() * 100;
      g.strokeStyle = `rgba(${col},${load})`; g.lineWidth = Math.max(0.8, wMax * PS / hairs * 1.7);
      let open = false;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), q = P[i], a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6;
        const tw = Math.max(0.0, Math.min(1, u / taper[0], (1 - u) / taper[1]));
        const o = off * q[2] * 0.5 * (0.35 + 0.65 * tw);
        const x = q[0] - dy / L * o, y = q[1] + dx / L * o;
        const lifted = Math.abs(off) > tw * 1.15 + 0.08;                     // as the brush lifts, its outer hairs leave the paper
        const skip = lifted || u > runOut && (Math.sin(u * 41 + seed) + Math.sin(u * 97 + seed * 2.3)) * 0.5 > 1 - 1.8 * Math.min(1, (u - runOut) / 0.25);
        if (skip) { if (open) { g.stroke(); open = false; } continue; }
        if (!open) { g.beginPath(); g.moveTo(X(x), Y(y)); open = true; } else g.lineTo(X(x), Y(y));
      }
      if (open) g.stroke();
    }
  }
  const dot = (x, y, r, ch, ink) => { g.fillStyle = `rgba(${['255,0,0', '0,255,0', '0,0,255'][ch]},${ink})`; g.beginPath(); g.ellipse(X(x), Y(y), r * PS * (0.8 + 0.4 * rand()), r * PS * (0.6 + 0.4 * rand()), rand() * 3, 0, 6.283); g.fill(); };
  // ---- the near cliff. First a pale uneven wash for its mass; then the line of its top, laid with the side of a loaded
  //      brush; a few drier lines for the facets of the rock; straight wedges dragged down its face as the brush dries
  //      (斧劈皴), and much of it left white; moss dots along the top
  const C = [[-0.02, 0.495, 0.026], [0.07, 0.525, 0.034], [0.16, 0.50, 0.03], [0.25, 0.44, 0.036], [0.34, 0.345, 0.03], [0.44, 0.235, 0.034], [0.53, 0.125, 0.03], [0.60, 0.02, 0.026]];
  const CP = run(C, 20), along = (u) => CP[Math.min(CP.length - 1, Math.floor(u * (CP.length - 1)))];
  {
    // the wash: heaviest under the line of the top, fading as it goes down into the water
    const gr = g.createLinearGradient(X(0.25), Y(0.48), X(0.10), Y(0.0));
    gr.addColorStop(0, 'rgba(255,0,0,0.42)'); gr.addColorStop(0.35, 'rgba(255,0,0,0.22)'); gr.addColorStop(1, 'rgba(255,0,0,0.06)');
    g.fillStyle = gr; g.beginPath(); CP.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1] - 0.004)) : g.moveTo(X(q[0]), Y(q[1] - 0.004))); g.lineTo(X(-0.05), Y(-0.05)); g.closePath(); g.fill();
  }
  stroke(C, { ch: 0, ink: 0.95, hairs: 30, dry: 0.45, per: 14, taper: [0.03, 0.08] });
  const facet = (pts) => stroke(pts, { ch: 0, ink: 0.75, hairs: 10, dry: 0.6, taper: [0.08, 0.5] });
  facet([[0.13, 0.49, 0.012], [0.15, 0.40, 0.014], [0.13, 0.31, 0.010]]);
  facet([[0.30, 0.385, 0.012], [0.27, 0.29, 0.012], [0.28, 0.20, 0.008]]);
  // rubbing (擦): a broad, nearly dry brush dragged down the rock, leaving grain rather than shapes
  const rubs = [[0.02, 0.49, 0.22], [0.07, 0.50, 0.26], [0.16, 0.47, 0.24], [0.21, 0.44, 0.20], [0.29, 0.37, 0.20], [0.36, 0.30, 0.18], [0.44, 0.21, 0.15], [0.50, 0.13, 0.11], [0.08, 0.30, 0.20], [0.20, 0.27, 0.18], [0.03, 0.20, 0.16]];
  for (const [x, y, L] of rubs) {
    const dx = 0.15 + 0.45 * rand(), n = Math.hypot(dx, 1), w = 0.035 + 0.05 * rand(), bend = 0.03 * (rand() - 0.5), ll = L * (0.6 + 0.6 * rand());
    stroke([[x, y - 0.006, w * 0.6], [x + dx / n * ll * 0.5 + bend, y - ll * 0.5 / n, w * 0.7], [x + dx / n * ll, y - ll / n, w * 0.4]], { ch: 0, ink: 0.12 + 0.18 * rand(), hairs: 18, dry: 0.88 + 0.1 * rand(), taper: [0.04 + 0.1 * rand(), 0.3 + 0.4 * rand()], per: 8 });
  }
  for (let k = 0; k < 26; k++) { const q = along(0.02 + 0.9 * rand()); dot(q[0] + 0.01 * (rand() - 0.5), q[1] + 0.006 + 0.006 * rand(), 0.004 + 0.004 * rand(), 0, 0.9); }
  for (let k = 0; k < 9; k++) { const q = along(0.05 + 0.85 * rand()); for (let j = 0; j < 4; j++) { const a = 1.2 + 0.7 * (rand() - 0.5) + (j - 1.5) * 0.25; stroke([[q[0], q[1] + 0.004, 0.003], [q[0] + Math.cos(a) * 0.012, q[1] + Math.sin(a) * 0.022, 0.002], [q[0] + Math.cos(a) * 0.02, q[1] + Math.sin(a) * 0.035, 0.001]], { ch: 0, ink: 0.8, hairs: 3, dry: 0.1 }); } }
  // ---- the old pine, rooted in the cliff top, its trunk reaching out over the water: two dry lines for the trunk with
  //      a pale wash between and bark scales; its needles in flat clusters of short strokes fanning upward
  const T = [[0.245, 0.43, 0], [0.265, 0.50, 0], [0.305, 0.565, 0], [0.38, 0.595, 0], [0.47, 0.588, 0], [0.56, 0.566, 0], [0.64, 0.548, 0]];
  const TP = run(T, 12), wid = (u) => 0.016 * (1 - 0.65 * u);
  const side = (sgn) => TP.map((q, i) => { const a = TP[Math.max(i - 1, 0)], b = TP[Math.min(i + 1, TP.length - 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6, u = i / (TP.length - 1), w = wid(u) * (1 + 0.15 * Math.sin(i * 1.7)); return [q[0] - dy / L * w * 0.5 * sgn, q[1] + dx / L * w * 0.5 * sgn, 0.006]; });
  stroke(TP.map((q, i) => [q[0], q[1], wid(i / (TP.length - 1))]), { ch: 1, ink: 0.28, hairs: 14, dry: 0.3, per: 2 });
  stroke(side(1), { ch: 1, ink: 0.95, hairs: 6, dry: 0.5, per: 2 }); stroke(side(-1), { ch: 1, ink: 0.85, hairs: 6, dry: 0.6, per: 2 });
  for (let i = 5; i < TP.length - 8; i += 4 + Math.floor(rand() * 4)) { const q = TP[i]; dot(q[0] + 0.003 * (rand() - 0.5), q[1] + 0.003 * (rand() - 0.5), 0.0018, 1, 0.7); }
  const branch = (pts) => stroke(pts, { ch: 1, ink: 0.85, hairs: 5, dry: 0.4, taper: [0.05, 0.6] });
  branch([[0.33, 0.578, 0.008], [0.305, 0.63, 0.006], [0.275, 0.655, 0.004]]);
  branch([[0.47, 0.588, 0.007], [0.485, 0.625, 0.005], [0.50, 0.645, 0.003]]);
  branch([[0.56, 0.566, 0.006], [0.595, 0.59, 0.005], [0.625, 0.61, 0.003]]);
  branch([[0.63, 0.55, 0.006], [0.67, 0.53, 0.005], [0.70, 0.50, 0.003]]);
  branch([[0.40, 0.594, 0.006], [0.42, 0.615, 0.004]]);
  const needles = (cx, cy, s) => {
    for (let f = 0; f < 3; f++) {
      const ox = cx + (f - 1) * 0.018 * s + 0.004 * (rand() - 0.5), oy = cy + 0.004 * (rand() - 0.5) - Math.abs(f - 1) * 0.004;
      for (let k = 0; k < 15; k++) {
        const a = Math.PI * (0.08 + 0.84 * k / 14) + 0.06 * (rand() - 0.5), L = (0.020 + 0.008 * rand()) * s;
        const ca = Math.cos(a), sa = Math.sin(a) * 0.75;
        stroke([[ox + ca * 0.003, oy + sa * 0.003, 0.0024], [ox + ca * L * 0.6, oy + sa * L * 0.6, 0.0020], [ox + ca * L, oy + sa * L, 0.0008]], { ch: 1, ink: 0.75 + 0.2 * rand(), hairs: 2, dry: 0.15, taper: [0.02, 0.6], per: 4 });
      }
    }
  };
  [[0.27, 0.66, 1.1], [0.32, 0.632, 1.0], [0.40, 0.622, 0.9], [0.50, 0.648, 1.1], [0.455, 0.605, 0.8], [0.555, 0.60, 0.9], [0.625, 0.615, 1.0], [0.66, 0.562, 0.8], [0.705, 0.502, 0.9]].forEach(([x, y, s]) => needles(x, y, s));
  // ---- reeds in the near water at the river's end: long blades bending in the wind, two plumes
  for (let k = 0; k < 11; k++) {
    const x0 = 5.02 + k * 0.028 + 0.02 * rand(), h = 0.16 + 0.16 * rand(), lean = 0.04 + 0.06 * rand() * (k % 3 === 0 ? -1 : 1);
    stroke([[x0, -0.01, 0.009], [x0 + lean * 0.3, h * 0.5, 0.008], [x0 + lean * 0.8, h * 0.85, 0.005], [x0 + lean * 1.4, h * 0.95, 0.001]], { ch: 2, ink: 0.55 + 0.3 * rand(), hairs: 6, dry: 0.3, taper: [0.02, 0.5] });
  }
  // two reeds in flower: a tall stem each, its plume nodding
  for (const [x0, h, lean] of [[5.09, 0.33, 0.05], [5.16, 0.29, 0.03]]) {
    const tip = [x0 + lean, h];
    stroke([[x0, -0.01, 0.004], [x0 + lean * 0.4, h * 0.55, 0.0035], [tip[0], tip[1], 0.003]], { ch: 2, ink: 0.7, hairs: 3, dry: 0.2, taper: [0.02, 0.1] });
    for (let j = 0; j < 9; j++) { const a = -0.35 - 0.12 * j + 0.08 * rand(); stroke([[tip[0], tip[1], 0.004], [tip[0] + Math.cos(a) * 0.018, tip[1] + Math.sin(a) * 0.012 - 0.003 * j, 0.003], [tip[0] + Math.cos(a) * 0.032, tip[1] + Math.sin(a) * 0.02 - 0.006 * j, 0.001]], { ch: 2, ink: 0.45, hairs: 3, dry: 0.4 }); }
  }

  /* ---- further along the scroll. A cliff split by a waterfall in two leaps, pines on its brow, rocks in the pool;
     a stream, a stone bridge over it, a willow by the bridge; a few thatched houses among trees; then the open river. */
  const CH = ['255,0,0', '0,255,0', '0,0,255'];
  // a line whose weight swells and thins as the brush is pressed and lifted (and breaks where it lifts off)
  const line = (pts, w, ink, ch = 0, breaks = 0.15) => {
    const P = run(pts.map(q => [q[0], q[1], 0]), 10), n = P.length;
    const ph = rand() * 6, fr = 2 + 3 * rand();
    for (let i = 0; i < n - 1; i++) {
      const u = i / (n - 1), pr = 0.35 + 0.65 * Math.abs(Math.sin(u * Math.PI * fr * 0.5 + ph)) * Math.min(1, u / 0.06, (1 - u) / 0.1);
      if (Math.sin(u * 37 + ph * 3) > 1 - breaks * 2) continue;
      g.strokeStyle = `rgba(${CH[ch]},${ink * (0.75 + 0.25 * rand())})`; g.lineWidth = Math.max(0.8, w * pr * PS);
      g.beginPath(); g.moveTo(X(P[i][0]), Y(P[i][1])); g.lineTo(X(P[i + 1][0]), Y(P[i + 1][1])); g.stroke();
    }
  };
  // a wash inside a closed outline, darkest just under its top edge, fading away downward to nothing (into the mist)
  const wash = (poly, ink, depth, ch = 0) => {
    const top = Math.max(...poly.map(q => q[1]));
    g.save(); g.beginPath(); poly.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.closePath(); g.clip();
    const gr = g.createLinearGradient(0, Y(top), 0, Y(top - depth));
    gr.addColorStop(0, `rgba(${CH[ch]},${ink})`); gr.addColorStop(0.45, `rgba(${CH[ch]},${ink * 0.45})`); gr.addColorStop(1, `rgba(${CH[ch]},0)`);
    g.fillStyle = gr; g.fillRect(X(Math.min(...poly.map(q => q[0]))) - 4, Y(top) - 4, (Math.max(...poly.map(q => q[0])) - Math.min(...poly.map(q => q[0]))) * PS + 8, depth * PS + 8);
    // and a few blotches of a second wash, so it is not even
    for (let k = 0; k < 6; k++) { const q = poly[Math.floor(rand() * poly.length)], r = (0.03 + 0.05 * rand()) * PS; const rg = g.createRadialGradient(X(q[0]), Y(q[1] - 0.03), 0, X(q[0]), Y(q[1] - 0.03), r); rg.addColorStop(0, `rgba(${CH[ch]},${ink * 0.35})`); rg.addColorStop(1, `rgba(${CH[ch]},0)`); g.fillStyle = rg; g.fillRect(X(q[0]) - r, Y(q[1] - 0.03) - r, 2 * r, 2 * r); }
    g.restore();
  };
  // hemp-fibre strokes (披麻皴): long, thin, dry, a little wavy, running down a rock's face from its top edge
  const hemp = (top, n, len, ink) => { for (let k = 0; k < n; k++) { const q = top[Math.floor(rand() * top.length)], L = len * (0.5 + 0.7 * rand()), dx = 0.02 * (rand() - 0.5);
    stroke([[q[0], q[1] - 0.008, 0.004], [q[0] + dx, q[1] - L * 0.5, 0.005], [q[0] + dx * 2 + 0.01 * (rand() - 0.5), q[1] - L, 0.002]], { ch: 0, ink: ink * (0.6 + 0.4 * rand()), hairs: 4, dry: 0.75, taper: [0.08, 0.5], per: 6 }); } };
  // a rock: a lumpy rounded form, bulging at its brow and drawing in toward its foot, which is lost in mist. Contoured
  // in broken thick-and-thin lines (the line fades as it goes down the sides); washed under the brow; hemp-fibre strokes
  // curving down and out over its face; moss along the brow
  const rock = (cx, cy, w, h, depth = 0.6, opts = {}) => {
    const sk = opts.skew || 0, ph = rand() * 6;
    const at = (a) => { const r = 1 + 0.10 * Math.sin(a * 5 + ph) + 0.06 * (rand() - 0.5); return [cx - Math.cos(a) * w * r + sk * Math.sin(a) * w, cy + Math.sin(a) * h * r]; };
    const top = []; for (let k = 0; k <= 12; k++) top.push(at(Math.PI * (0.02 + 0.96 * k / 12)));
    // the sides: from the brow's ends down and inward
    const L0 = top[0], R0 = top[top.length - 1];
    const left = [[L0[0] + 0.02 * w, L0[1] - depth * 0.35], [L0[0] + 0.12 * w, L0[1] - depth * 0.7]], right = [[R0[0] - 0.03 * w, R0[1] - depth * 0.3], [R0[0] - 0.14 * w, R0[1] - depth * 0.65]];
    wash([...left.slice().reverse(), ...top, ...right], opts.ink ?? 0.30, h + depth * 0.75);
    line(top, 0.010 * (opts.weight || 1), 0.95, 0, 0.12);
    line([L0, left[0], left[1]], 0.007, 0.55, 0, 0.35); line([R0, right[0], right[1]], 0.007, 0.5, 0, 0.35);
    // its folds: one or two inner contours, shorter, nested under the brow
    for (let f = 0; f < 2; f++) { const s0 = 2 + Math.floor(rand() * 3), s1 = s0 + 3 + Math.floor(rand() * 3), k = 0.5 + 0.2 * f; line(top.slice(s0, Math.min(s1, top.length - 1)).map(q => [cx + (q[0] - cx) * k + 0.01 * f, cy - 0.02 - 0.03 * f + (q[1] - cy) * k]), 0.005, 0.7, 0, 0.3); }
    // hemp-fibre strokes: from the brow, curving down and outward over the form, dry
    for (let k = 0; k < Math.round(14 * w / 0.1); k++) {
      const a = Math.PI * (0.08 + 0.84 * rand()), q = at(a), out = -Math.cos(a), L = (h + depth * 0.45) * (0.4 + 0.6 * rand());
      stroke([[q[0], q[1] - 0.006, 0.004], [q[0] + out * L * 0.15, q[1] - L * 0.45, 0.004], [q[0] + out * L * 0.35, q[1] - L, 0.0015]], { ch: 0, ink: 0.35 + 0.35 * rand(), hairs: 4, dry: 0.75, taper: [0.08, 0.5], per: 6 });
    }
    for (let k = 0; k < Math.round(7 * w / 0.1); k++) { const q = top[2 + Math.floor(rand() * (top.length - 4))]; dot(q[0] + 0.008 * (rand() - 0.5), q[1] + 0.004 * rand(), 0.0032 + 0.003 * rand(), 0, 0.9); }
    return top;
  };
  // the waterfall cliff: left and right of the fall, built up from rock forms, top to bottom
  rock(2.27, 0.76, 0.17, 0.12, 0.30, { skew: -0.15, weight: 1.3 }); rock(2.15, 0.57, 0.13, 0.10, 0.25, { skew: 0.1 }); rock(2.33, 0.45, 0.11, 0.08, 0.22, { skew: 0.15 });
  rock(2.12, 0.31, 0.12, 0.08, 0.20); rock(2.36, 0.25, 0.07, 0.05, 0.12, { ink: 0.4 });
  rock(2.70, 0.69, 0.17, 0.11, 0.30, { skew: 0.18, weight: 1.3 }); rock(2.79, 0.51, 0.13, 0.09, 0.25, { skew: -0.1 }); rock(2.63, 0.37, 0.10, 0.07, 0.22, { skew: -0.15 });
  rock(2.85, 0.27, 0.12, 0.08, 0.20); rock(2.63, 0.21, 0.06, 0.04, 0.10, { ink: 0.45 });
  // the lips of the fall: two broken dry lines down each side of the white water; the ledge it breaks on
  line([[2.433, 0.86], [2.437, 0.72], [2.442, 0.57]], 0.007, 0.9, 0, 0.25); line([[2.528, 0.80], [2.532, 0.68], [2.531, 0.57]], 0.007, 0.9, 0, 0.25);
  line([[2.41, 0.545], [2.47, 0.552], [2.56, 0.54]], 0.012, 0.95, 0, 0.05);
  line([[2.441, 0.50], [2.444, 0.36], [2.440, 0.23]], 0.006, 0.8, 0, 0.3); line([[2.536, 0.50], [2.540, 0.36], [2.545, 0.23]], 0.006, 0.8, 0, 0.3);
  // dark wet stones in the pool at its foot
  for (const [x, y, r] of [[2.36, 0.165, 0.022], [2.40, 0.15, 0.012], [2.60, 0.155, 0.028], [2.66, 0.175, 0.016], [2.72, 0.16, 0.012]]) {
    for (let k = 0; k < 3; k++) dot(x + 0.008 * (rand() - 0.5), y + 0.004 * (rand() - 0.5), r * (0.7 + 0.3 * rand()), 0, 0.35);
    line([[x - r, y], [x - r * 0.4, y + r * 0.55], [x + r * 0.5, y + r * 0.5], [x + r, y]], 0.004, 0.9, 0, 0.05);
  }
  // pines leaning from the brow of the cliff
  for (const [x0, y0, dx, h, s] of [[2.13, 0.875, -0.07, 0.07, 0.9], [2.33, 0.885, 0.04, 0.08, 0.8], [2.74, 0.785, 0.09, 0.07, 1.0]]) {
    stroke([[x0, y0, 0.008], [x0 + dx * 0.5, y0 + h * 0.6, 0.006], [x0 + dx, y0 + h, 0.004]], { ch: 1, ink: 0.9, hairs: 5, dry: 0.4, taper: [0.05, 0.4] });
    needles(x0 + dx, y0 + h, s); needles(x0 + dx * 0.5 - 0.015, y0 + h * 0.55, s * 0.8);
  }
  // the stream's banks: broken lines, grass in tufts along them
  const bank = (a, b) => { line([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.008], b], 0.004, 0.6, 0, 0.2);
    for (let k = 0; k < 5; k++) { const u = rand(), x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u + 0.004; for (let j = 0; j < 2 + Math.floor(rand() * 3); j++) stroke([[x, y, 0.002], [x + 0.006 * (j - 1) + 0.004 * (rand() - 0.5), y + 0.012 + 0.008 * rand(), 0.0008]], { ch: 2, ink: 0.6, hairs: 1, dry: 0.1, per: 2 }); } };
  bank([2.98, 0.15], [3.55, 0.19]); bank([3.10, 0.07], [3.62, 0.10]); bank([4.08, 0.21], [4.75, 0.25]); bank([4.10, 0.12], [4.85, 0.15]);   // (the banks)
  // the stone bridge: a hump of a deck, the arch beneath, its stones in a few strokes
  const BR = (u) => [3.62 + 0.40 * u, 0.255 + 0.07 * Math.sin(Math.PI * u)];
  line([0, 0.2, 0.4, 0.6, 0.8, 1].map(BR), 0.009, 0.95, 0, 0.05);
  line([0.1, 0.3, 0.5, 0.7, 0.9].map(u => { const q = BR(u); return [q[0], q[1] - 0.016 - 0.006 * Math.sin(Math.PI * u)]; }), 0.005, 0.7, 0, 0.2);
  line([[3.70, 0.205], [3.735, 0.25], [3.82, 0.282], [3.905, 0.25], [3.94, 0.205]], 0.007, 0.9, 0, 0.05);
  wash([[3.70, 0.205], [3.735, 0.25], [3.82, 0.282], [3.905, 0.25], [3.94, 0.205], [4.0, 0.25], [3.82, 0.30], [3.64, 0.25]], 0.18, 0.08);
  for (let k = 0; k < 7; k++) { const q = BR(0.08 + 0.13 * k); line([[q[0], q[1] - 0.003], [q[0] + 0.003, q[1] - 0.014]], 0.003, 0.55, 0, 0); }
  // the willow by the bridge: a leaning trunk; from its crown long strands arch out and hang (in its own channel, so they
  // can move in the air)
  line([[3.50, 0.19], [3.515, 0.27], [3.535, 0.35], [3.56, 0.41]], 0.012, 0.9, 2, 0.05);
  line([[3.525, 0.31], [3.48, 0.36], [3.45, 0.39]], 0.006, 0.85, 2, 0.05); line([[3.55, 0.38], [3.60, 0.42], [3.63, 0.415]], 0.004, 0.8, 2, 0.05);
  for (let k = 0; k < 34; k++) {
    const x0 = 3.47 + 0.15 * rand(), y0 = 0.40 + 0.05 * Math.sin((x0 - 3.47) / 0.15 * Math.PI) + 0.01 * rand(), L = 0.08 + 0.17 * rand(), sw = 0.008 * (rand() - 0.5);
    stroke([[x0, y0, 0.0022], [x0 + 0.004 + sw, y0 - L * 0.35, 0.0018], [x0 + 0.003 + sw * 2, y0 - L * 0.75, 0.0014], [x0 + sw * 2.5, y0 - L, 0.0006]], { ch: 2, ink: 0.30 + 0.40 * rand(), hairs: 2, dry: 0.15, taper: [0.1, 0.5], per: 6 });
  }
  // leafy trees: a trunk with a few boughs; over them a pale wash of foliage and clumps of leaf dots, darker within
  const tree = (x, y, s, kind) => {
    line([[x, y - 0.10 * s], [x + 0.004, y - 0.03 * s], [x - 0.003, y + 0.03 * s]], 0.007 * s, 0.9, 1, 0.05);
    for (const b of [-1, 1]) line([[x, y - 0.01 * s], [x + b * 0.025 * s, y + 0.02 * s], [x + b * 0.04 * s, y + 0.035 * s]], 0.003 * s, 0.85, 1, 0.1);
    const rg = g.createRadialGradient(X(x), Y(y + 0.03 * s), 0, X(x), Y(y + 0.03 * s), 0.07 * s * PS); rg.addColorStop(0, 'rgba(0,255,0,0.22)'); rg.addColorStop(1, 'rgba(0,255,0,0)');
    g.fillStyle = rg; g.fillRect(X(x) - 0.08 * s * PS, Y(y + 0.03 * s) - 0.08 * s * PS, 0.16 * s * PS, 0.16 * s * PS);
    for (let c = 0; c < 4; c++) {
      const cx = x + 0.04 * s * (c - 1.5) * 0.7 + 0.01 * (rand() - 0.5), cy = y + 0.035 * s + 0.025 * s * Math.sin(c * 2.1);
      for (let k = 0; k < 26; k++) {
        const a = rand() * 6.283, r = 0.028 * s * Math.sqrt(rand()), px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.7, dark = 0.45 + 0.5 * (1 - r / (0.028 * s));
        if (kind === 0) dot(px, py, 0.0036 * s, 1, dark);
        else { const L = 0.007 * s; for (const bb of [-0.6, 0, 0.6]) stroke([[px, py, 0.0018], [px + Math.sin(bb) * L, py + Math.cos(bb) * L * 0.8, 0.0008]], { ch: 1, ink: dark, hairs: 1, dry: 0.1, per: 2 }); }
      }
    }
  };
  // thatched houses on the far bank, half among the trees: a low heavy roof with a lifted eave, pale walls, a doorway
  const house = (x, y, w) => {
    const h = w * 0.45;
    // the thatch: dry strokes laid down the slope from the ridge to the eaves, the ridge line over them
    const rh = w * 0.42;
    for (let k = 0; k < 12; k++) { const u = k / 11 - 0.5; stroke([[x + u * w * 0.55, y + h + rh, 0.006], [x + u * w * 1.30, y + h + 0.002, 0.007]], { ch: 0, ink: 0.55 + 0.3 * rand(), hairs: 5, dry: 0.55, taper: [0.05, 0.2], per: 4 }); }
    line([[x - w * 0.30, y + h + rh], [x + w * 0.30, y + h + rh + 0.002]], 0.006, 0.95, 0, 0.0);
    line([[x - w * 0.70, y + h], [x, y + h + 0.003], [x + w * 0.70, y + h]], 0.0028, 0.85, 0, 0.1);
    line([[x - w * 0.5, y + h - 0.004], [x - w * 0.5, y]], 0.0025, 0.6, 0, 0.0); line([[x + w * 0.5, y + h - 0.004], [x + w * 0.5, y]], 0.0025, 0.6, 0, 0.0);
    line([[x - w * 0.55, y], [x + w * 0.55, y]], 0.002, 0.45, 0, 0.3);
    stroke([[x + w * 0.12, y + h * 0.62, 0.008], [x + w * 0.12, y + 0.002, 0.008]], { ch: 0, ink: 0.8, hairs: 5, dry: 0.1 });
  };
  house(4.18, 0.30, 0.075); house(4.33, 0.335, 0.06); house(4.47, 0.31, 0.07);
  for (const [x, y, s, kind] of [[3.38, 0.33, 1.1, 0], [3.26, 0.30, 0.8, 1], [4.08, 0.36, 1.0, 1], [4.255, 0.38, 0.75, 0], [4.58, 0.37, 1.15, 0], [4.70, 0.34, 0.85, 1]]) tree(x, y, s, kind);
  return cv;
}
const VS_FULL = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

/* ---------------------------------------------------------------- the light's way through the scroll
   It is the brush. From where it came up out of the black water it goes back to paint the old pine and the cliff, then
   on along the far shore and the hills, up to the brow of the waterfall cliff, down beside the falling water, along the
   stream, over the bridge, among the houses, down into the reeds, and so to the skiff, where it stays as its lantern. */
const ROUTE = [[0.62, 0.58], [0.35, 0.57], [0.15, 0.46], [0.30, 0.30], [0.75, 0.30], [1.25, 0.55], [1.70, 0.62], [2.15, 0.88], [2.48, 0.86], [2.48, 0.55], [2.49, 0.24],
  [2.75, 0.16], [3.30, 0.31], [3.55, 0.37], [3.82, 0.33], [4.05, 0.37], [4.30, 0.42], [4.60, 0.45], [4.85, 0.30], [5.10, 0.24], [5.314, 0.232]];
const WS = 144 / 1152;                           // (the map of when, at an eighth of the brush's resolution)
W.ink = {
  ready: false, t: 0, fade: 1, vol: 1, bloom: 0, dawn: 0, grow: [1, 1, 1, 1], now: 2, pan: [0, 0],
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.p = YL.makeProgram('ink', VS_FULL, FS); YL.checkProgram(this.p);
    this.empty = gl.createVertexArray();
    const up = (src, mips) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
      if (mips) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const seed = 0x2f6b7d; let a = seed; const rand = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    this.brush = up(paint(rand), true);
    this.seal = up(YL.makeSeal ? YL.makeSeal() : document.createElement('canvas'), false);
    this.whenCv = document.createElement('canvas'); this.whenCv.width = Math.round(PW * WS); this.whenCv.height = Math.round(PH * WS);
    { const c = this.whenCv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, this.whenCv.width, this.whenCv.height); }   // (unpainted ways count as painted: the film paints them)
    this.when = up(this.whenCv, false);
    if (!this.inited) this.t = +(YL.QS.get('wt') || 0);
    this.inited = true;
    this.ready = true;
  },
  // 一粒光: a point of vermilion, drifting down to the skiff, where it becomes its lantern
  hero: { on: true, p: [5.314, 0.232], v: [0, 0], home: [5.314, 0.232], aim: null },
  arrive(px, py) {
    this.hero.p = [px, py]; this.hero.v = [0, 0]; this.hero.on = true; this.route = [[px, py], ...ROUTE];
    this.now = 0; this.painting = false; this.reach = px; this.pan = [0, 0]; this.walkT = this.egT = undefined;
  },
  // the light sets off with its brush: lay down, all along its way, when it will reach each place (an earlier time wins)
  startPaint() {
    if (!this.ready) this.init();
    const R = this.route || [this.hero.p.slice(), ...ROUTE], cv = this.whenCv, c = cv.getContext('2d'), sc = cv.height;
    let L = 0; const seg = []; for (let i = 0; i < R.length - 1; i++) { const l = Math.hypot(R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]); seg.push(l); L += l; }
    this.routeL = L; this.paintT = 0; this.painting = true; this.now = 0;
    c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'lighten';
    let acc = 0;
    for (let i = 0; i < R.length - 1; i++) {
      const n = Math.max(1, Math.ceil(seg[i] / 0.008));
      for (let k = 0; k < n; k++) {
        const u = k / n, x = R[i][0] + (R[i + 1][0] - R[i][0]) * u, y = R[i][1] + (R[i + 1][1] - R[i][1]) * u, v = 1 - (acc + seg[i] * u) / L;
        const b = Math.round(v * 255);
        c.fillStyle = `rgb(${b},0,0)`; c.beginPath(); c.arc(x * sc, y * sc, 0.13 * sc, 0, 6.2832); c.fill();
        c.fillStyle = `rgb(0,${Math.max(0, b - 6)},0)`; c.beginPath(); c.arc(x * sc, y * sc, 0.55 * sc, 0, 6.2832); c.fill();
      }
      acc += seg[i];
    }
    c.globalCompositeOperation = 'source-over';
    const gl = YL.gl; gl.bindTexture(gl.TEXTURE_2D, this.when); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  },
  // where it is along its way after s (m of painting)
  routeAt(s) {
    const R = this.route; let left = s;
    for (let i = 0; i < R.length - 1; i++) { const l = Math.hypot(R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]); if (left <= l) return [R[i][0] + (R[i + 1][0] - R[i][0]) * left / l, R[i][1] + (R[i + 1][1] - R[i][1]) * left / l]; left -= l; }
    return R[R.length - 1].slice();
  },
  // a point on the screen (ndc) in the painting's coordinates
  toPaint(nx, ny, aspect) { return [(nx * 0.5 + 0.5) * aspect + (1.7778 - aspect) * 0.5 + (this.pan ? this.pan[0] : 0), ny * 0.5 + 0.5]; },
  pointer(nx, ny) { this.hero.aim = this.toPaint(nx, ny, YL.canvasAspect()); this.hero.aimT = this.t; },
  update(dt) {
    this.t += dt;
    const H = this.hero;
    if (this.painting) {
      // along its way at a brush's pace, easing off at the end; then everything it didn't pass over fills in
      this.paintT += dt;
      const sp = 0.68, s = Math.min(this.routeL, sp * Math.max(0, this.paintT - 0.25) * YL.smooth(0.25, 1.0, this.paintT));
      const p = this.routeAt(s); H.v = [(p[0] - H.p[0]) / Math.max(dt, 1e-4), (p[1] - H.p[1]) / Math.max(dt, 1e-4)]; H.p = p;
      this.now = s / this.routeL + (s >= this.routeL ? 0.06 * YL.smooth(0, 1.2, this.paintT - this.routeL / sp - 0.25) : 0);
      if (s >= this.routeL && this.now >= 1.059) this.painting = false;
      this.reach = Math.max(this.reach || 0, p[0]);
    } else {
      const tgt = H.aim && this.t - H.aimT < 3 ? H.aim : H.home;
      for (let i = 0; i < 2; i++) { H.v[i] += (tgt[i] - H.p[i]) * 3.0 * dt; H.v[i] *= Math.exp(-dt * 2.4); H.p[i] += H.v[i] * dt; }
      if (this.reach === undefined) this.reach = SL;                 // (a jump straight here: all painted, at the end of the scroll)
    }
    // the eye goes along the scroll after the brush, never back
    const aspect = YL.canvasAspect(), tgtPan = Math.max(0, Math.min(SL - aspect, (this.reach ?? 0) - aspect * 0.62));
    this.pan = [this.pan[0] + (Math.max(tgtPan, this.pan[0]) - this.pan[0]) * (1 - Math.exp(-dt * 2.2)), 0];
    if (YL.QS.has('ipan')) this.pan = [+YL.QS.get('ipan'), 0];                    // (debug: look at a given stretch of the scroll)
    // the traveller sets off over the bridge once it is painted; the egrets get up as the brush comes into the reeds
    const k = this.now;
    if (this.walkT === undefined && (this.reach || 0) > 3.75) this.walkT = this.t;
    if (this.egT === undefined && (this.reach || 0) > 4.95) this.egT = this.t;
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
    U(p, 'uHero', [H.p[0], H.p[1], H.on ? br : 0, 0.0045]);
    U(p, 'uNow', this.now);
    const wt = this.walkT === undefined ? -1 : this.t - this.walkT;
    U(p, 'uWalker', wt < 0 ? [0, 0, 0, 0] : [Math.min(1, wt / 7.0), wt * 2 * Math.PI * 1.6, 0, 1 - YL.smooth(6.6, 7.0, wt)]);
    const eg = new Float32Array(16), et = this.egT === undefined ? -1 : this.t - this.egT;
    for (let i = 0; i < 4; i++) if (et >= 0) { const a = Math.max(0, et - i * 0.25); eg.set([5.06 + 0.05 * i - (0.09 + 0.02 * i) * a, 0.11 + 0.03 * i + (0.075 + 0.012 * i) * a + 0.01 * Math.sin(a * 2 + i), a * 9.0 + i * 1.7, a > 0 ? 0.024 + 0.003 * i : 0], i * 4); }
    gl.uniform4fv(p.u.uEg, eg);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.when); gl.uniform1i(p.u.uWhen, 2);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.brush); gl.uniform1i(p.u.uBrush, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.seal); gl.uniform1i(p.u.uSeal, 1);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: rain on water, the lap of it; a guqin (古琴) plucked now and then, its notes sliding */
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
    this.snd = { ctx, bus, wet, next: 0.6, k: 0 };
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
