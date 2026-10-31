/* ============================================================================
   世界三 · 雪夜 —— 套色木刻
   ----------------------------------------------------------------------------
   一张三块版套印的木刻：墨版（黑）、靛版（夜里雪的阴影、冰、天）、朱版（灯笼、窗光、春联）。
   · 墨版上的白线是「刻掉」的：线顺着形体走（天是横的，山是顺坡往下的，雪堆是顺着雪棱的），
     暗处刀口窄而疏，亮处刀口宽而密；每一刀有起刀收刀（两头尖），有手刻的不匀。
     亮的地方反过来：纸上留下的是细黑线。
   · 靛版是「擦」出来的渐变（ぼかし），没有喷枪式的软斑；边缘处墨会积一点。
   · 两遍渲染：先把三块版的覆盖量画进一张图（场景），再「印」：三块版各自错一点位，叠在纸上，
     加纸的纤维、黑版的木纹、靛版的马连（baren）擦痕、没吃上墨的飞白。
   · 整张画以每秒 8 次的节奏「重印」：线条和墨色每一印都有一点点不同，像逐张印出来的定格动画。
   画面（从远到近）：落雪的夜空；雪峰；黑松坡下一排粉墙人家（亮着两三扇窗，一家贴着春联，烟囱冒烟）；
   左边一棵挂雪的老树；结冰的河，河心一个冰窟窿，一串脚印从岸上走过去；近岸雪坡、枯苇、一根挂着灯笼的木杆。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});

const HEAD = `#version 300 es
precision highp float;
#define PI 3.14159265359
float sat(float x){ return clamp(x, 0.0, 1.0); }
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
const mat2 FR = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = FR * p + vec2(3.1, 1.7); a *= 0.5; } return s / 0.875; }
uniform vec2 uRes;
uniform vec3 uView;          // the print point at the screen's centre (x, y), and print units per screen height
vec2 printPos(vec2 frag){ vec2 uv = frag / uRes; return vec2((uv.x - 0.5) * uRes.x / uRes.y, uv.y - 0.5) * uView.z + uView.xy; }
`;

// (both shaders declare uPx and uBoil before this)
const LINES = `
// The key block's line work along the isolines of a field f (print units; g = |grad f|), spaced sp; a runs along the lines.
// T is the tone wanted: 0 solid ink … 1 bare paper. Below 0.5 the lines are white cuts in the black; above, black lines left on the paper.
// Each line is cut as separate strokes; a stroke swells in the middle and comes to a point where the knife went in and came out.
float lines(float f, float g, float a, float sp, float T, float seed){
  float u = f / sp;
  u += (vnoise(vec2(a * 7.0 + seed, u * 0.37)) - 0.5) * 0.55 + (vnoise(vec2(a * 45.0 + uBoil * 11.0, u * 0.9)) - 0.5) * 0.07;
  float k = floor(u);
  float d = abs(fract(u) - 0.5) * 2.0;                    // 0 on a line's centre, 1 midway to the next
  float hk = hash11(k * 0.737 + seed);
  float s = a / (sp * (7.0 + 26.0 * hk)) + hk * 17.0;
  float sid = floor(s), st = fract(s);
  float r = hash12(vec2(sid, k + seed * 3.1));
  float taper = sqrt(max(sin(PI * st), 0.0)) * (0.8 + 0.4 * hash12(vec2(sid * 1.3, k * 0.7 + seed)));
  float aa = g * uPx / sp * 1.4 + 0.02;
  float ink;
  if (T < 0.5){
    float hw = min(T * 1.75, 1.0) * taper * step(r, 0.45 + 1.2 * T);
    ink = 1.0 - sat((hw - d) / aa + 0.5) * min(hw / aa, 1.0);
  } else {
    float hw = min((1.0 - T) * 1.75, 1.0) * taper * step(r, 1.55 - 1.1 * T);
    ink = sat((hw - d) / aa + 0.5) * min(hw / aa, 1.0);
  }
  return mix(ink, 1.0 - T, smoothstep(0.3, 0.6, aa));     // too fine to cut at this size: just the tone
}
`;

/* ---------------------------------------------------------------- the blocks */
const FS_SCENE = HEAD + `
uniform float uPx;           // one pixel, in print units
uniform float uBoil;         // which printing this frame is (the stop-motion's frame number)
uniform float uTime;         // time, stepped at the print's frame rate
uniform vec4 uBr[112];       // the old tree: limb segments a.xy → b.xy
uniform vec4 uBrR[28];       // … and their radii, four to a vector
uniform int uBrN;
uniform vec4 uTreeBox;       // its bounds
uniform vec4 uHA[8];         // houses: x, base y, half width, wall height
uniform vec4 uHB[8];         //         roof height, type (0 long side to us, 1 gable end), lit windows (bits), seed
uniform vec4 uLan;           // the lantern: centre x, y; its light; sway
uniform vec4 uFig[3];        // people going home: x, foot y, walk phase (sign: which way), their lantern lit
uniform vec4 uDog;           // the dog: x, foot y, trot phase (sign: which way), shown
uniform vec4 uCrow;          // the crow: x, y, wing phase, shown
uniform vec4 uEave[8];       // a paper lantern under each house's eaves: lit (0 … 1), -, -, -
out vec4 o;

vec3 ink;                    // coverage of the key (black) block, the indigo block's strength, the vermilion block
void lay(float m, vec3 v){ ink = mix(ink, v, sat(m)); }
float fill(float d){ return sat(0.5 - d / uPx); }
float sdBox(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdTrap(vec2 p, float r1, float r2, float he){
  vec2 k1 = vec2(r2, he), k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
// a knife's edge is never a perfect curve
float rough(vec2 p){ return (vnoise(p * 300.0) - 0.5) * 0.0010 + (vnoise(p * 70.0) - 0.5) * 0.0012; }

` + LINES + `
// ---- the land's shapes
// summits: x, y, left flank steepness, right flank steepness
const vec4 PEAKS[5] = vec4[5](vec4(0.30, 0.700, 0.62, 0.55), vec4(0.63, 0.680, 0.60, 0.70), vec4(1.03, 0.800, 0.50, 0.66), vec4(1.40, 0.720, 0.62, 0.55), vec4(1.76, 0.690, 0.6, 0.6));
float nearHill(float x){
  return 0.440 + 0.130 * exp(-pow((x - 0.88) / 0.27, 2.0)) + 0.070 * exp(-pow((x - 0.52) / 0.13, 2.0)) + 0.060 * exp(-pow((x - 1.30) / 0.13, 2.0))
       + 0.010 * (vnoise(vec2(x * 13.0, 1.0)) - 0.5) + 0.004 * (vnoise(vec2(x * 41.0, 2.0)) - 0.5);
}
float groundTop(float x){ return 0.457 + 0.005 * sin(x * 4.0 + 1.0) + 0.005 * (vnoise(vec2(x * 9.0, 3.0)) - 0.5); }
float bankFar(float x){ return 0.418 + 0.005 * sin(x * 5.0 + 1.0) + 0.004 * (vnoise(vec2(x * 11.0, 4.0)) - 0.5); }
float bankNear(float x){ return 0.205 + 0.028 * sin(x * 2.3 + 0.8) + 0.008 * (vnoise(vec2(x * 8.0, 5.0)) - 0.5); }
const vec2 HOLE = vec2(0.950, 0.285);
// drifts on the near bank: x centre, base, half width, height of the crest's arc
const vec4 DRIFTS[4] = vec4[4](vec4(0.30, 0.105, 0.24, 0.032), vec4(0.80, 0.050, 0.32, 0.042), vec4(1.32, 0.115, 0.26, 0.026), vec4(0.98, 0.160, 0.16, 0.014));
const float HOLE_R = 0.060;
const float HOLE_SQ = 2.6;    // the hole is round; we see it foreshortened

// falling snow, one layer: small carved flakes, not quite round
float flakes(vec2 p, float cell, float dens, float rad, float seed){
  vec2 g = p / cell, i = floor(g), f = fract(g) - 0.5;
  vec2 h = hash22(i + seed);
  if (h.x > dens) return 0.0;
  vec2 d = (f - (hash22(i * 1.7 + seed) - 0.5) * 0.5) * cell;
  float r = rad * (0.55 + 0.9 * h.y);
  float ang = atan(d.y, d.x);
  return fill(length(d) - r * (1.0 + 0.12 * sin(ang * 3.0 + h.y * 40.0) + 0.08 * sin(ang * 5.0 + h.x * 30.0)));
}
// a snowy pine: tiers of drooping boughs, each with a lid of snow along its upper edges
void pine(vec2 q, float H, float W, float seed){
  if (q.y < -0.012 || q.y > H * 1.05 || abs(q.x) > W * 1.2) return;
  float n = 4.0 + floor(hash11(seed * 5.7) * 2.5);
  q.x -= (hash11(seed * 8.1) - 0.5) * 0.25 * q.y;              // a slight lean
  float inside = 0.0, snow = 0.0;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    if (fi >= n) break;
    float y0 = H * fi / n * 0.92;
    float th = H / n * (1.55 + 0.3 * hash11(seed + fi * 3.1));
    float wi = W * (1.0 - fi / n * 0.85) * (0.8 + 0.4 * hash11(seed * 1.9 + fi));
    float u = q.x / wi, v = (q.y - y0) / th;
    float top = 1.0 - abs(u) + 0.10 * (vnoise(vec2(u * 7.0 + fi * 3.0, seed)) - 0.5);
    float bot = -0.30 * u * u + 0.08 * (vnoise(vec2(u * 9.0, seed + fi)) - 0.5);
    float d = max(max(v - top, bot - v), abs(u) - 1.0) * th * 0.6;
    float m = fill(d);
    if (m > 0.0){
      inside = max(inside, m);
      // snow: the band under the upper edges, thicker toward the tips; it ends raggedly above the black underside
      float lid = step(top - 0.30 - 0.12 * abs(u) - 0.10 * vnoise(vec2(u * 20.0, seed + fi)), v) * step(abs(u), 0.94);
      snow = mix(snow, lid, m);
    }
  }
  float trunk = fill(max(abs(q.x) - 0.0013, max(q.y - H * 0.2, -q.y - 0.012)));
  lay(max(inside, trunk), vec3(1.0, 0.8, 0.0));
  lay(snow * inside, vec3(0.0, 0.14, 0.0));
}

void main(){
  vec2 P = printPos(gl_FragCoord.xy);
  float t = uTime;
  ink = vec3(1.0, 0.9, 0.0);

  // ---------------- the sky: black, cut with long gently-curving lines; the cuts widen toward the snow-light over the land
  {
    float lift = smoothstep(1.02, 0.56, P.y);
    float T = mix(0.10, 0.47, lift * lift);
    float f = P.y + 0.010 * sin(P.x * 2.3 + 0.4) + 0.004 * sin(P.x * 6.1 + 2.0);
    ink = vec3(lines(f, 1.0, P.x, 0.0078, T, 1.0), mix(0.95, 0.40, lift), 0.0);
  }

  // ---------------- the snow peaks: concave flanks, shoulders and notches. Lit faces nearly bare paper, a few dark spurs;
  // shaded faces indigo, hatched with arcs that wrap round the mountain's bulk, white spurs of snow running down them
  if (P.y < 0.84) {
    float best = -1.0; vec4 pk = PEAKS[0];
    for (int i = 0; i < 5; i++){
      vec4 c = PEAKS[i]; float dx = P.x - c.x;
      float y = c.y - (dx < 0.0 ? c.z : c.w) * pow(abs(dx), 0.85);
      if (y > best){ best = y; pk = c; }
    }
    float h = best + 0.036 * (vnoise(vec2(P.x * 5.0, 3.0)) - 0.5) + 0.012 * (vnoise(vec2(P.x * 17.0, 5.0)) - 0.5) + 0.004 * (vnoise(vec2(P.x * 60.0, 6.0)) - 0.5);
    float d = P.y - h;
    float m = fill(d);
    if (m > 0.0){
      vec2 r = P - pk.xy; float rr = max(length(r), 1e-3);
      float shade = smoothstep(-0.003, 0.003, r.x + 0.30 * r.y + 0.022 * (vnoise(vec2(P.y * 22.0, pk.x * 9.0)) - 0.5) + 0.01 * (vnoise(vec2(P.y * 70.0, pk.x)) - 0.5));
      float low = smoothstep(pk.y - 0.03, pk.y - 0.22, P.y);       // toward the valley the snow goes blue (a wiped gradation)
      float B = mix(0.03 + 0.20 * low, 0.60 + 0.20 * low, shade);
      // cross-contours: arcs hanging from the summit, as the mountain's girth seen from below
      float f = P.y + 1.6 * r.x * r.x;
      float K = lines(f, 1.0 + 3.2 * abs(r.x), P.x, 0.0042, mix(0.91, 0.60, shade), 5.0 + pk.x * 10.0);
      // spurs: ridges coming down from the summit at fixed angles, wandering; white on the shaded face, dark on the lit
      float ang = atan(r.x, -r.y);
      for (int j = 0; j < 5; j++){
        float sa = (float(j) - 2.0) * 0.42 + (hash11(pk.x * 13.0 + float(j)) - 0.5) * 0.3;
        float sl = 0.06 + 0.12 * hash11(pk.x * 7.0 + float(j) * 3.0);
        vec2 dir = vec2(sin(sa), -cos(sa));
        float al = dot(r, dir);
        float pd = r.x * dir.y - r.y * dir.x + 0.010 * (vnoise(vec2(al * 30.0, float(j) + pk.x * 5.0)) - 0.5) * al * 8.0;
        float w = (0.0006 + 0.0018 * sin(PI * sat(al / sl))) * step(0.0, al) * step(al, sl);
        float sp = fill(abs(pd) - w);
        float side = step(0.0, pd);                                  // the spur's shadowed side
        K = mix(K, mix(side * 0.9, 0.0, shade), sp * (1.0 - shade * 0.0));
        B = mix(B, mix(B, 0.08, shade), sp);
      }
      // the summit ridge: a black line, broken where the snow lies over it
      K = max(K, fill(abs(d) - 0.0007) * step(0.32, vnoise(vec2(P.x * 46.0, 7.0))));
      lay(m, vec3(K, B, 0.0));
    }
  }

  // ---------------- the dark hill behind the village: black, with a few contour cuts; snowy pines along it
  float hn = nearHill(P.x);
  if (P.y < hn + 0.11 && P.x > 0.28 && P.x < 1.52){
    float d = P.y - hn + rough(P);
    float m = fill(d);
    if (m > 0.0){
      float K = lines(P.y - 0.55 * hn, 1.0, P.x, 0.0056, 0.08 + 0.16 * smoothstep(-0.05, 0.0, d), 13.0);
      lay(m, vec3(K, 0.75, 0.0));
    }
    float cw = 0.026, ci = floor(P.x / cw);
    for (int j = -2; j <= 2; j++){
      float c = ci + float(j);
      if (hash11(c * 1.37 + 0.5) > 0.62) continue;
      float xc = (c + 0.5 + (hash11(c * 2.1) - 0.5) * 0.8) * cw;
      if (xc < 0.36 || xc > 1.44) continue;
      float H = 0.040 + 0.055 * hash11(c * 3.3);
      float yb = nearHill(xc) - 0.012 - 0.045 * hash11(c * 4.1);
      pine(P - vec2(xc, yb), H, H * 0.30, c);
    }
  }

  // ---------------- the village ground: snow, lying up to the foot of the hill
  float gt = groundTop(P.x);
  if (P.y < gt + 0.002){
    float m = fill(P.y - gt + rough(P) * 0.6);
    float B = 0.10 + 0.28 * smoothstep(gt - 0.014, gt, P.y);
    lay(m, vec3(0.0, B, 0.0));
  }

  // ---------------- the houses: white plaster walls in night shade, roofs heavy with snow, black eaves, a few lit windows
  for (int i = 0; i < 8; i++){
    vec4 H = uHA[i], HB = uHB[i];
    if (H.z <= 0.0) continue;
    vec2 q = P - H.xy;
    float hw = H.z, wh = H.w, rh = HB.x, ov = hw * 0.20, sc = wh / 0.034, snowT = 0.0060 * sc;
    if (abs(q.x) > hw + ov + 0.02 || q.y < -0.012 || q.y > wh + rh + 0.03 + 0.17 * step(2.5, HB.w) * step(HB.w, 3.5)) continue;
    float seed = HB.w;
    bool gable = HB.y > 0.5;
    float lit0 = mod(HB.z, 2.0), lit1 = step(2.0, HB.z);
    // walls
    float dW = sdBox(q - vec2(0.0, wh * 0.5), vec2(hw, wh * 0.5));
    float mW = fill(dW + rough(P) * 0.4);
    if (mW > 0.0){
      float B = 0.30 + 0.30 * smoothstep(wh * 0.55, wh, q.y);                // the eaves' shadow deepens toward the top
      float K = 0.0, R = 0.0;
      // timber: corner posts, a beam, the stone plinth (hatched)
      K = max(K, fill(abs(abs(q.x) - hw + 0.0012 * sc) - 0.0012 * sc));
      K = max(K, fill(abs(q.y - wh * 0.86) - 0.0008 * sc));
      K = max(K, fill(q.y - 0.005 * sc) * lines(q.y, 1.0, q.x, 0.0018, 0.35, seed));
      // windows: lit ones are vermilion paper behind a black lattice
      for (int w = 0; w < 2; w++){
        if (gable && w == 1) break;
        float wx = gable ? 0.0 : (float(w) - 0.5) * hw * 1.05;
        float lit = w == 0 ? lit0 : lit1;
        vec2 wq = q - vec2(wx, wh * 0.52);
        vec2 wb = vec2(0.0070, 0.0066) * sc;
        float dWin = sdBox(wq, wb);
        float inWin = fill(dWin);
        float lat = fill(min(abs(wq.x) - 0.0005, min(abs(abs(wq.x) - wb.x * 0.5) - 0.0004, abs(wq.y) - 0.0005)));
        K = mix(K, max(lat, 1.0 - lit), inWin);
        K = max(K, fill(abs(dWin + 0.0001) - 0.0010));
        R = max(R, inWin * lit);
        B = mix(B, 0.0, inWin * lit);
      }
      // the door, and red couplets pasted either side of it (one house)
      if (seed == 3.0){
        vec2 dq = q / sc;
        float dD = sdBox(dq - vec2(0.0, 0.012), vec2(0.0075, 0.012));
        K = max(K, fill(dD * sc));
        float cp = min(sdBox(vec2(abs(dq.x) - 0.0118, dq.y - 0.013), vec2(0.0021, 0.0105)), sdBox(dq - vec2(0.0, 0.0285), vec2(0.0085, 0.0021)));
        float mc = fill(cp * sc + rough(P) * 0.3);
        K = mix(K, 0.0, mc); B = mix(B, 0.0, mc);
        R = max(R, mc);
        K = max(K, mc * fill((abs(fract(dq.y / 0.0042) - 0.5) * 0.0042 - 0.0006) * sc) * step(0.008, abs(dq.x)) * 0.8);   // characters, as dots
      }
      lay(mW, vec3(K, B, R));
    }
    if (gable){
      // the gable end's triangle; barge boards; snow along both slopes, overhanging
      float tri = max(abs(q.x) * rh / hw + (q.y - wh) - rh, wh - q.y);
      float mT = fill(tri * 0.7);
      if (mT > 0.0){
        float K = lines(q.y, 1.0, q.x, 0.0030, 0.72, seed + 3.0);
        K = max(K, fill(length(q - vec2(0.0, wh + rh * 0.42)) - 0.0035 * sc));
        lay(mT, vec3(K, 0.62, 0.0));
      }
      vec2 L0 = vec2(-hw - ov, wh - ov * rh / hw), R0 = vec2(hw + ov, wh - ov * rh / hw), AP = vec2(0.0, wh + rh);
      float dB = min(sdSeg(q, L0, AP), sdSeg(q, R0, AP));
      lay(fill(dB - 0.0016 * sc), vec3(1.0, 0.7, 0.0));
      vec2 sq = q - vec2(0.0, snowT * 0.85);
      float dS = min(sdSeg(sq, L0 + vec2(-0.002, 0.0), AP), sdSeg(sq, R0 + vec2(0.002, 0.0), AP)) - snowT * (0.85 + 0.30 * vnoise(vec2(q.x * 200.0, seed)));
      float mS = fill(dS);
      if (mS > 0.0){
        float B = 0.34 * smoothstep(0.0, -1.2 * snowT, dS + snowT) * smoothstep(wh + rh, wh, q.y);
        float K = fill(abs(dS) - 0.0006) * step(q.y, wh + rh * 0.55) * step(0.25, vnoise(vec2(q.x * 90.0, seed)));
        lay(mS, vec3(K, B, 0.0));
      }
    } else {
      // the long roof: a band of snow above the eaves, rounded where it's thick, its lip curling over the eave
      float yE = wh;
      float dS = sdTrap(q - vec2(0.0, yE + rh * 0.5), hw + ov, hw + ov - rh * 0.55, rh * 0.5) - snowT - 0.0016 * sc * (vnoise(vec2(q.x * 140.0, seed)) - 0.3);
      // under the lip: the eaves' black shadow, with white icicles cut into it
      float dE = sdBox(q - vec2(0.0, yE - snowT - 0.0038 * sc), vec2(hw + ov * 0.75, 0.0044 * sc));
      float mE = fill(dE);
      if (mE > 0.0){
        float cell = 0.0036 * sc;
        float ic = fract(q.x / cell + seed);
        float il = (0.0015 + 0.0060 * hash11(floor(q.x / cell + seed) * 7.3 + seed)) * sc;
        float yl = yE - snowT - q.y;
        float icicle = step(abs(ic - 0.5) * cell, 0.0008 * sc * sat(1.0 - yl / il)) * step(yl, il);
        lay(mE, vec3(1.0 - icicle, 0.8, 0.0));
      }
      float mS = fill(dS);
      if (mS > 0.0){
        float lip = smoothstep(yE + rh * 0.45, yE - snowT, q.y);
        float B = 0.42 * lip * lip;
        float K = lines(-dS, 1.0, q.x, 0.0032, 1.0 - 0.18 * lip, seed + 7.0) * step(q.y, yE + rh * 0.4);
        K = max(K, fill(abs(dS) - 0.0006) * step(q.y, yE + 0.002));
        lay(mS, vec3(K, B, 0.0));
      }
      // a chimney, and its smoke cut into the dark of the hill behind
      if (seed == 3.0){
        vec2 cq = q - vec2(hw * 0.55, yE + rh * 0.55);
        float dC = sdBox(cq - vec2(0.0, 0.012), vec2(0.0050, 0.012));
        lay(fill(dC), vec3(1.0 - lines(cq.y, 1.0, cq.x, 0.0025, 0.25, 61.0), 0.7, 0.0));
        lay(fill(length((cq - vec2(0.0, 0.0245)) * vec2(1.0, 2.2)) - 0.0072), vec3(0.0, 0.15, 0.0));
        float sy = cq.y - 0.028;
        if (sy > 0.0 && sy < 0.17){
          float sx = 0.011 * sin(sy * 34.0 - t * 1.6) * sat(sy * 30.0) + sy * 0.45 + 0.004 * sin(sy * 90.0 - t * 2.3);
          float wdt = 0.0024 + sy * 0.085;
          float e = abs(abs(cq.x - sx) - wdt) - 0.0007 * (1.0 - sy / 0.17);
          float keep = step(sy / 0.17, vnoise(vec2(sy * 60.0 - t * 2.0, sign(cq.x - sx))) + 0.25);
          float cut = fill(e) * keep;
          float dark = step(0.5, ink.x);
          ink.x = mix(ink.x, 1.0 - dark, cut); ink.y *= 1.0 - 0.7 * cut * dark;
        }
      }
    }
    // snow drifted against the foot of the wall
    float dDr = q.y - 0.005 * sc - 0.003 * vnoise(vec2(q.x * 120.0, seed));
    lay(fill(dDr) * step(abs(q.x), hw + 0.006), vec3(0.0, 0.12, 0.0));
  }

  // ---------------- under each house's eaves, a little paper lantern: dark until the light comes to it
  for (int i = 0; i < 8; i++){
    vec4 H = uHA[i], HB = uHB[i];
    if (H.z <= 0.0) continue;
    float sc = H.w / 0.034;
    vec2 lc = P - (H.xy + vec2((H.z + H.z * 0.20 * 0.55) * (hash11(HB.w * 3.3) < 0.5 ? -1.0 : 1.0), H.w - 0.0150 * sc));
    if (abs(lc.x) > 0.012 || abs(lc.y) > 0.02) continue;
    float on = uEave[i].x;
    lc.x -= 0.0010 * sin(t * 1.3 + HB.w) * (lc.y + 0.008) / 0.01;
    float string_ = fill(max(abs(lc.x) - 0.00035, max(lc.y - 0.0085, -lc.y)));
    float body = length(lc * vec2(1.0, 0.82)) - 0.0034;
    float caps = fill(sdBox(lc - vec2(0.0, 0.0040), vec2(0.0015, 0.0006))) + fill(sdBox(lc + vec2(0.0, 0.0040), vec2(0.0013, 0.0006)));
    lay(string_, vec3(1.0, 0.6, 0.0));
    lay(fill(body), vec3(0.0, 0.0, mix(0.35, 1.0, on)));               // unlit, the paper is only a ghost of red
    lay(fill(abs(body) - 0.00045), vec3(1.0, 0.0, 0.0));
    lay(sat(caps), vec3(1.0, 0.5, 0.0));
    lay(fill(length(lc * vec2(1.4, 1.0)) - 0.0013 * on), vec3(0.0, 0.0, 0.0));   // lit: a white heart of flame
    lay(fill(abs(fract(atan(lc.y, lc.x) / 6.2832 * 6.0) - 0.5) * length(lc) * 6.0 - 0.0004) * step(length(lc), 0.0034) * step(0.0012, length(lc)) * on, vec3(0.0, 0.0, 0.55));
  }

  // ---------------- people going home along the bank, each with a paper lantern on a pole; the coat flares, the legs scissor
  for (int i = 0; i < 3; i++){
    vec4 F = uFig[i];
    if (F.x < -0.5) continue;
    vec2 q = P - F.xy;
    if (abs(q.x) > 0.026 || q.y < -0.004 || q.y > 0.034) continue;
    float ph = abs(F.z); q.x *= F.z < 0.0 ? -1.0 : 1.0;
    float bob = 0.00055 * abs(sin(ph));
    float coat = sdTrap(q - vec2(0.0, 0.0098 + bob), 0.0058, 0.0033, 0.0068);
    float head = length(q - vec2(0.0006, 0.0190 + bob)) - 0.0023;
    vec2 hq = q - vec2(0.0006, 0.0205 + bob);
    float hat = max(abs(hq.x) * 0.42 + hq.y - 0.0017, -hq.y);
    float lx = 0.0021 * sin(ph);
    float legs = min(sdSeg(q, vec2(-0.0011, 0.0034 + bob), vec2(-0.0011 + lx, 0.0)), sdSeg(q, vec2(0.0011, 0.0034 + bob), vec2(0.0011 - lx, 0.0))) - 0.00075;
    float pole = sdSeg(q, vec2(0.0028, 0.0125 + bob), vec2(0.0112, 0.0188 + bob)) - 0.0004;
    vec2 lc = q - vec2(0.0115, 0.0145 + bob + 0.0005 * sin(ph * 2.0));
    float lan = length(lc * vec2(1.0, 0.8)) - 0.0025;
    float cord = sdSeg(q, vec2(0.0112, 0.0188 + bob), vec2(0.0115, 0.0175 + bob + 0.0005 * sin(ph * 2.0))) - 0.0003;
    lay(fill(min(min(coat, head), min(min(hat, legs), min(pole, cord)))), vec3(1.0, 0.75, 0.0));
    lay(fill(abs(coat + 0.0012) - 0.00035) * step(0.004, q.y) * step(q.y, 0.014), vec3(0.0, 0.75, 0.0));   // a padded hem, cut
    lay(fill(lan), vec3(0.0, 0.0, 1.0));
    lay(fill(abs(lan) - 0.0004), vec3(1.0, 0.0, 0.0));
    lay(fill(length(lc * vec2(1.4, 1.0)) - 0.0011 * F.w), vec3(0.0, 0.0, 0.0));
  }
  // ---------------- the far bank: a lip of snow, the dark face under it
  float bF = bankFar(P.x);
  {
    float dF = sdBox(vec2(0.0, P.y - (bF - 0.0070)), vec2(1.0, 0.0060)) + rough(P);
    float mF = fill(dF);
    if (mF > 0.0) lay(mF, vec3(lines(P.y, 1.0, P.x, 0.0024, 0.30, 81.0), 0.85, 0.0));
  }

  // ---------------- the frozen river
  float bN = bankNear(P.x);
  if (P.y < bF - 0.013 && P.y > bN - 0.012){
    float tt = (P.y - bN) / (bF - bN);
    // indigo, wiped: deepest under the far bank (its reflection), a little lighter in the middle
    float B = 0.56 + 0.20 * smoothstep(0.75, 0.97, tt) + 0.08 * (vnoise(vec2(P.x * 1.3, P.y * 7.0)) - 0.5);
    // the far bank's reflection: black lines thickening toward it
    float K = lines(P.y, 1.0, P.x, 0.0040, mix(0.93, 0.56, smoothstep(0.80, 0.985, tt)), 91.0);
    // glints: long thin cuts through the indigo, the snow-light on the ice
    float gl = lines(P.y + 0.0013, 1.0, P.x, 0.0050, 0.06 + 0.16 * smoothstep(0.35, 0.8, vnoise(vec2(P.x * 3.0, P.y * 22.0))), 93.0);
    B *= gl;
    float R = 0.0;
    // the lit windows' reflections: a column of short horizontal strokes going down from the bank
    for (int i = 0; i < 8; i++){
      vec4 H = uHA[i], HB = uHB[i];
      if (H.z <= 0.0 || HB.z < 0.5) continue;
      for (int w = 0; w < 2; w++){
        if (HB.y > 0.5 && w == 1) break;
        float lit = w == 0 ? mod(HB.z, 2.0) : step(2.0, HB.z);
        float wx = H.x + (HB.y > 0.5 ? 0.0 : (float(w) - 0.5) * H.z * 1.05);
        float dy = bF - 0.013 - P.y;
        if (dy < 0.0 || dy > 0.09) continue;
        float row = floor(P.y / 0.0048);
        float fade = 1.0 - dy / 0.09;
        float half_ = (0.0030 + 0.0060 * hash11(row * 3.1 + wx * 50.0)) * fade;
        float jx = (hash11(row * 7.7 + wx * 30.0) - 0.5) * 0.006;
        float dash = fill(abs(P.x - wx - jx) - half_) * step(abs(fract(P.y / 0.0048) - 0.5), 0.22) * step(0.25 * (1.0 - fade), hash11(row * 1.3 + wx * 9.0));
        R = max(R, dash * lit);
      }
    }
    // drifted snow lying on the ice in long streaks, mostly near the banks; a black shadow line under each
    float thr = 0.68 - 0.10 * (1.0 - smoothstep(0.0, 0.25, tt)) - 0.08 * smoothstep(0.80, 1.0, tt);
    vec2 sp = P * vec2(2.2, 30.0) + vec2(5.0, 0.0);
    float n = fbm3(sp) + 0.05 * (vnoise(P * vec2(30.0, 200.0)) - 0.5);
    float n2 = fbm3(sp + vec2(0.0, 0.0030 * 30.0));
    float patch_ = fill((thr - n) / 14.0);
    float shadowL = fill((thr - n2) / 14.0) * (1.0 - patch_) * step(0.3, vnoise(vec2(P.x * 50.0, 3.0)));
    B = mix(B, 0.05, patch_); K = mix(K, 0.0, patch_); R *= 1.0 - patch_;
    K = max(K, shadowL * 0.95);
    // a little boat frozen into the ice by the right bank: only what's above the ice shows; snow heaped in it, its pole leaning
    {
      vec2 bq = P - vec2(1.30, 0.330);
      if (abs(bq.x) < 0.12 && bq.y > -0.03 && bq.y < 0.12){
        float L = 0.078, u = bq.x / L;
        float top = 0.006 + 0.020 * pow(abs(u), 3.0) + 0.004 * u;                // the gunwale's sheer, higher at the bow (right)
        float dHull = max(max(abs(bq.x) - L * (1.0 - 0.3 * sat(-bq.y / 0.01)), bq.y - top), -bq.y - 0.001);
        float mH = fill(dHull);
        // its shadow and the trough of ice round it
        float sh = fill((length((bq - vec2(0.004, -0.002)) / vec2(L * 1.06, 0.010)) - 1.0) * 0.010) * step(bq.y, 0.0);
        B = mix(B, 0.95, sh); K = mix(K, lines(bq.y, 1.0, bq.x, 0.0022, 0.6, 133.0), sh * 0.8);
        float planks = lines(bq.y - top * 0.5, 1.0, bq.x, 0.0026, 0.16, 131.0);
        K = mix(K, max(planks, fill(abs(bq.y - top + 0.0016) - 0.0006)), mH); B = mix(B, 0.7, mH); R *= 1.0 - mH;
        float dSn = max(abs(bq.x) - L * 0.80, bq.y - top - 0.0055 * sat(1.0 - u * u) - 0.002 * vnoise(vec2(bq.x * 160.0, 1.0)));
        dSn = max(dSn, top - 0.003 - bq.y);
        float mSn = fill(dSn);
        K = mix(K, fill(abs(dSn) - 0.0005) * step(bq.y, top), mSn); B = mix(B, 0.10, mSn);
        float pole = fill(sdSeg(bq, vec2(-0.040, 0.004), vec2(0.030, 0.105)) - 0.0012);
        K = max(K, pole); B = mix(B, 0.6, pole);
      }
    }
    // the ice hole: black water ringed with broken ice; a few cracks run out from it
    vec2 hq = (P - HOLE) * vec2(1.0, HOLE_SQ);
    float hr = length(hq);
    if (hr < 0.17){
      float ha = atan(hq.y, hq.x);
      for (int j = 0; j < 5; j++){
        float ca = float(j) * 1.257 + (hash11(float(j) * 3.3 + 1.0) - 0.5) * 0.8;
        float cl = HOLE_R + 0.025 + 0.075 * hash11(float(j) * 5.1 + 2.0);
        vec2 cdir = vec2(cos(ca), sin(ca));
        float al = dot(hq, cdir);
        float cd = hq.x * cdir.y - hq.y * cdir.x + 0.010 * (vnoise(vec2(al * 40.0, float(j) * 7.0)) - 0.5) + 0.003 * (vnoise(vec2(al * 160.0, float(j))) - 0.5);
        float crack = fill(abs(cd) / HOLE_SQ * 1.6 - 0.0007 * (1.0 - al / cl)) * step(HOLE_R, al) * step(al, cl);
        K = max(K, crack);
      }
      // the rim: broken chunks of ice heaped round the hole, each its own size, outlined in black, shaded on the near side
      float cn = 13.0, cpos = ha / (2.0 * PI) * cn + 0.35 * vnoise(vec2(ha * 2.0, 2.0));
      float ci = floor(cpos), cf = fract(cpos);
      // the outer edge runs straight from corner to corner, each corner at its own distance: a jagged ring of slabs
      float outer = HOLE_R + 0.005 + 0.016 * mix(hash11(mod(ci, cn) * 3.7 + 1.0), hash11(mod(ci + 1.0, cn) * 3.7 + 1.0), cf);
      float dRim = (hr - outer) / HOLE_SQ * 1.6;
      float mRim = fill(dRim);
      float nearSide = step(hq.y, 0.0) * smoothstep(outer - 0.016, outer, hr);
      B = mix(B, 0.08 + 0.40 * nearSide * hash11(ci * 5.3), mRim); K = mix(K, 0.0, mRim); R *= 1.0 - mRim;
      K = max(K, fill(abs(dRim) - 0.0007));
      K = max(K, mRim * fill(abs(cf - 0.5) < 0.5 ? (0.5 - abs(cf - 0.5)) / cn * 2.0 * PI * hr / HOLE_SQ * 1.6 - 0.0006 : 1.0) * step(0.3, hash11(ci * 9.1)));
      // the water
      float dH = (hr - HOLE_R - (vnoise(vec2(ha * 6.0, 3.0)) - 0.5) * 0.006) / HOLE_SQ * 1.6;
      float mH = fill(dH);
      if (mH > 0.0){
        // the ice's thickness, seen on the far inner wall
        float wall = fill(-(length((P - HOLE - vec2(0.0, -0.0060)) * vec2(1.0, HOLE_SQ)) - HOLE_R) / HOLE_SQ * 1.6);
        float Kw = 1.0;
        for (int j = 0; j < 3; j++){
          float ph = t * 0.10 + float(j) / 3.0;
          float rr = fract(ph) * (HOLE_R - 0.004);
          Kw *= 1.0 - fill((abs(hr - rr) - 0.0016 * (1.0 - rr / HOLE_R)) / HOLE_SQ * 1.6) * 0.9 * step(0.55, vnoise(vec2(ha * 2.2, float(j) + floor(ph) * 7.0)));
        }
        float iceW = 1.0 - lines(P.x, 1.0, P.y, 0.0022, 0.42, 97.0);
        K = mix(K, mix(Kw, 1.0 - iceW * 0.8, wall), mH);
        B = mix(B, mix(1.0, 0.70, wall), mH); R *= 1.0 - mH;
      }
    }
    float mR = fill(max(P.y - bF + 0.013, bN - P.y) + rough(P));
    lay(mR, vec3(K, B, R));
  }

  // ---------------- the near bank: bare paper, mostly. A few long low drifts, each crest throwing a short blue shadow toward us,
  // hatched along the crest; the bottom of the sheet printed a little darker
  if (P.y < bN + 0.004){
    float K = fill(abs(P.y - bN) - 0.0008) * step(0.25, vnoise(vec2(P.x * 35.0, 6.0)));
    float B = 0.04 + 0.22 * smoothstep(0.07, 0.0, P.y);
    for (int i = 0; i < 4; i++){
      vec4 D = DRIFTS[i];
      float u = (P.x - D.x) / D.z;
      if (abs(u) > 1.0) continue;
      float arc = 1.0 - u * u;
      float cr = D.y + D.w * arc + 0.004 * (vnoise(vec2(P.x * 30.0, float(i))) - 0.5);
      float dc = cr - P.y;
      float len = 0.030 * arc;
      if (dc > 0.0 && dc < len){
        float sh = pow(1.0 - dc / len, 1.4);
        B = max(B, 0.55 * sh);
        K = max(K, lines(P.y - cr, 1.0, P.x, 0.0042, 1.0 - 0.30 * sh, 101.0 + float(i)) * step(0.08, sh));
      }
      K = max(K, fill(abs(dc) - 0.0008 * arc) * step(0.3, vnoise(vec2(P.x * 40.0, float(i) + 9.0))) * step(-0.002, dc));
    }
    // footprints: someone walked from here down onto the ice, to the hole
    {
      vec2 a = vec2(0.36, 0.0), b = HOLE + vec2(-0.045, -0.014);
      vec2 ab = b - a; float L = length(ab); vec2 dn = ab / L, pn = vec2(-dn.y, dn.x);
      float s2 = dot(P - a, dn) / L;
      if (s2 > -0.02 && s2 < 1.02){
        float N = 30.0, i0 = floor(s2 * N);
        for (int j = 0; j <= 1; j++){
          float i = i0 + float(j);
          if (i < 0.0 || i > N) continue;
          float sc = mix(1.25, 0.6, i / N);
          vec2 c = a + ab * (i / N) + pn * (mod(i, 2.0) - 0.5) * 0.010 * sc + pn * 0.020 * sin(i / N * 4.0);
          vec2 fq = P - c; fq = vec2(dot(fq, dn), dot(fq, pn));
          float df = length(fq / (vec2(0.0050, 0.0026) * sc)) - 1.0;
          float mf = fill(df * 0.0026 * sc);
          B = max(B, 0.62 * mf);
          K = max(K, fill(abs(df * 0.0026 * sc) - 0.00055) * step(0.0, fq.x + 0.001 * sc));
        }
      }
    }
    lay(fill(P.y - bN), vec3(K, B, 0.0));
  }

  // ---------------- the ice fisherman by the hole, hunched on his stool, his line down into the black water
  {
    vec2 q = P - (HOLE + vec2(0.072, -0.004));
    if (abs(q.x) < 0.03 && q.y > -0.006 && q.y < 0.03){
      float b = 0.0003 * sin(t * 0.8);
      float body = length((q - vec2(0.0, 0.0085 + b)) / vec2(0.0062, 0.0075)) - 1.0;
      float head = length(q - vec2(-0.0032, 0.0168 + b)) - 0.0024;
      vec2 hq = q - vec2(-0.0032, 0.0180 + b);
      float hat = max(abs(hq.x) * 0.40 + hq.y - 0.0016, -hq.y);
      float stool = sdBox(q - vec2(0.0012, 0.0012), vec2(0.0032, 0.0012));
      float rod = sdSeg(q, vec2(-0.0050, 0.0110 + b), vec2(-0.0220, 0.0190 + b)) - 0.00035;
      float line_ = sdSeg(q, vec2(-0.0220, 0.0190 + b), vec2(-0.0235, -0.0030)) - 0.00018;
      lay(fill(min(min(body * 0.006, head), min(hat, min(stool, min(rod, line_))))), vec3(1.0, 0.7, 0.0));
    }
  }
  // ---------------- dry reeds in clumps along the near bank: curving, tapering strokes, some broken over; snow on the seed heads
  if (P.y < bN + 0.24 && ((P.x > 0.24 && P.x < 0.56) || (P.x > 1.08 && P.x < 1.44))){
    float dR = 1e9, dSnow = 1e9;
    for (int c = 0; c < 4; c++){
      float fc = float(c);
      float cx = c == 0 ? 0.31 : c == 1 ? 0.47 : c == 2 ? 1.16 : 1.35;
      if (abs(P.x - cx) > 0.12) continue;
      for (int i = 0; i < 12; i++){
        float fi = float(i) + fc * 12.0;
        float x0 = cx + (hash11(fi * 3.3) - 0.5) * 0.05;
        float H = 0.08 + 0.13 * hash11(fi * 7.1) * (1.0 - 0.5 * abs(x0 - cx) / 0.025);
        float lean = (x0 - cx) * 1.6 + (hash11(fi * 1.7) - 0.5) * 0.05 + 0.005 * sin(t * 1.1 + fi * 1.3);
        vec2 p0 = vec2(x0, bankNear(x0) - 0.015 - 0.035 * hash11(fi * 5.5));
        vec2 p1 = p0 + vec2(lean * 0.06, H * 0.30), p2 = p0 + vec2(lean * 0.25, H * 0.58), p3 = p0 + vec2(lean * 0.55, H * 0.82), p4 = p0 + vec2(lean, H);
        if (hash11(fi * 9.3) > 0.75){ p3 = p2 + vec2(sign(lean + 0.001) * 0.35, 0.10) * H * 0.4; p4 = p3 + vec2(sign(lean + 0.001) * 0.45, -0.55) * H * 0.35; }
        if (abs(P.x - p0.x) > H * 0.8 + 0.03) continue;
        dR = min(dR, sdSeg(P, p0, p1) - 0.0021);
        dR = min(dR, sdSeg(P, p1, p2) - 0.0016);
        dR = min(dR, sdSeg(P, p2, p3) - 0.0011);
        dR = min(dR, sdSeg(P, p3, p4) - 0.0007);
        if (hash11(fi * 2.9) > 0.3){
          vec2 hd = normalize(p4 - p3), hp = P - (p4 + hd * 0.007);
          vec2 hl = vec2(dot(hp, hd), dot(hp, vec2(-hd.y, hd.x)));
          dR = min(dR, (length(hl / vec2(0.0095, 0.0026)) - 1.0) * 0.0026);
          vec2 up = vec2(-hd.y, hd.x) * sign(hd.x + 0.001);
          dSnow = min(dSnow, (length((hp - up * 0.0018) / vec2(0.0065, 0.0017)) - 1.0) * 0.0017);
        }
        // a long leaf, bending away from a few of them
        if (hash11(fi * 4.4) > 0.55){
          float sd = sign(hash11(fi) - 0.5);
          vec2 lp = mix(p1, p2, 0.2 + 0.6 * hash11(fi * 6.1)), lm = lp + vec2(sd * (0.012 + 0.010 * hash11(fi * 2.2)), 0.007), le = lm + vec2(sd * 0.010, -0.016 - 0.012 * hash11(fi * 3.4));
          float tl = clamp(dot(P - lp, le - lp) / dot(le - lp, le - lp), 0.0, 1.0);
          dR = min(dR, min(sdSeg(P, lp, lm), sdSeg(P, lm, le)) - 0.0026 * sqrt(max(1.0 - tl, 0.0)) * (0.4 + tl * 2.0));
        }
      }
    }
    lay(fill(dR), vec3(1.0, 0.3, 0.0));
    lay(fill(dSnow), vec3(0.0, 0.0, 0.0));
  }

  // ---------------- the lantern's light, cut out of everything behind it: a ring of rays, wider and closer near the flame
  vec2 lq = P - uLan.xy;
  float lr = length(lq);
  if (uLan.z > 0.0 && lr < 0.26){
    float la = atan(lq.x, -lq.y);
    float rk = floor(la / (2.0 * PI / 60.0) + 0.5);
    float reach = 0.07 + 0.19 * hash11(rk * 1.31 + 4.0) * hash11(rk * 0.73 + 9.0) + 0.05 * hash11(rk * 2.9);
    float T = 0.49 * uLan.z * exp(-max(lr - 0.03, 0.0) / 0.075) * smoothstep(reach, reach * 0.6, lr);
    float ray = lines(la, 1.0 / max(lr, 1e-3), lr, 2.0 * PI / 60.0, T, 111.0);
    float core = fill(lr - 0.029 * uLan.z - 0.004 * (vnoise(vec2(la * 8.0, 2.0)) - 0.5));
    float keep = ray * (1.0 - core);
    ink.x *= keep; ink.y *= mix(1.0, keep, 0.95);
  }

  // ---------------- the old tree in the foreground: black limbs, carved along their length, lit a little from the lantern's side;
  // snow along their tops; a fine white keyline where they cross the dark
  if (P.x > uTreeBox.x && P.x < uTreeBox.z && P.y > uTreeBox.y && P.y < uTreeBox.w){
    float dT = 1e9, dSn = 1e9, perp = 0.0, along = 0.0, rad = 0.0; vec2 nrm = vec2(0.0);
    for (int i = 0; i < 112; i++){
      if (i >= uBrN) break;
      vec4 b = uBr[i];
      float r = uBrR[i / 4][i % 4];
      vec2 ba = b.zw - b.xy, pa = P - b.xy;
      float L2 = dot(ba, ba);
      vec2 mid = pa - ba * 0.5;
      float reach = sqrt(L2) * 0.5 + r * 3.0 + 0.004;
      if (dot(mid, mid) > reach * reach) continue;
      float h = clamp(dot(pa, ba) / L2, 0.0, 1.0);
      vec2 dv = pa - ba * h;
      float dl = length(dv);
      float d = dl - r;
      if (d < dT){ dT = d; rad = r; nrm = dv / max(dl, 1e-5); vec2 dir = ba * inversesqrt(L2); perp = dir.x * pa.y - dir.y * pa.x; along = dot(pa, dir); }
      vec2 dir = ba * inversesqrt(L2);
      float s = (r * 1.15 * (1.0 - abs(dir.y)) + 0.0005) * (0.55 + 0.7 * vnoise(vec2(dot(pa, dir) * 60.0, float(i))));
      dSn = min(dSn, sdSeg(P - vec2(0.0, r * 0.55 + s * 0.6), b.xy, b.zw) - s * 0.75);
    }
    dT += (vnoise(P * 400.0) - 0.5) * 0.0008 + (vnoise(P * 90.0) - 0.5) * 0.0012 * step(0.006, rad);
    float ring = fill(dT - 0.0008) * (1.0 - fill(dT)) * smoothstep(0.008, 0.016, rad);
    ink.x *= 1.0 - ring; ink.y *= 1.0 - 0.6 * ring; ink.z *= 1.0 - ring;
    float mT = fill(dT);
    if (mT > 0.0){
      // bark: cuts running along the limb, wider on the side the light comes from
      float lit = dot(nrm, normalize(vec2(0.75, 0.25)));
      float T = mix(0.03, 0.26, smoothstep(0.1, 0.95, lit)) * step(0.0042, rad);
      float K = lines(perp, 1.0, along, max(rad * 0.30, 0.0024), T, 71.0);
      lay(mT, vec3(K, 0.65, 0.0));
    }
    lay(fill(dSn + (vnoise(P * 500.0) - 0.5) * 0.0010), vec3(0.0, 0.10, 0.0));
  }

  // ---------------- the lantern, hanging from the tree's low limb: vermilion paper whose ribs follow its roundness, black caps, a tassel
  {
    vec2 piv = vec2(uLan.x - sin(uLan.w) * 0.075, uLan.y + cos(uLan.w) * 0.075);
    lay(fill(sdSeg(P, piv, uLan.xy + vec2(-sin(uLan.w), cos(uLan.w)) * 0.034) - 0.0006), vec3(1.0, 0.5, 0.0));
    vec2 q = P - uLan.xy;
    float ca = cos(uLan.w), sa = sin(uLan.w);
    q = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y);
    vec2 rr = vec2(0.0255, 0.030);
    float dL = (length(q / rr) - 1.0) * rr.x;
    float mL = fill(dL);
    if (mL > 0.0){
      float yy = clamp(q.y / rr.y, -0.999, 0.999);
      float wy = rr.x * sqrt(1.0 - yy * yy);
      float mer = q.x / wy;                                               // -1 … 1 across the bulge
      float rib = fill((abs(fract(mer * 2.5 + 0.5) - 0.5) / 2.5) * wy - 0.00055);
      float shade = lines(q.x, 1.0, q.y, 0.0020, mix(0.50, 1.0 - 0.45 * smoothstep(0.35, 1.0, mer), sat(uLan.z)), 121.0) * mix(1.0, step(0.3, mer), sat(uLan.z));
      float glow = smoothstep(0.62, 0.0, length(q / rr)) * uLan.z;           // the flame burns the lines away at its heart
      float K = max(rib * 0.9, shade) * (1.0 - glow);
      K = max(K, fill(abs(dL) - 0.0007));
      lay(mL, vec3(K, 0.0, 1.0 - 0.35 * glow));
    }
    float dCap = min(sdBox(q - vec2(0.0, rr.y + 0.0014), vec2(0.0115, 0.0030)), sdBox(q - vec2(0.0, -rr.y - 0.0014), vec2(0.0105, 0.0028)));
    lay(fill(dCap), vec3(1.0, 0.6, 0.0));
    lay(fill(length((q - vec2(0.0, rr.y + 0.0050)) * vec2(1.0, 2.2)) - 0.0090), vec3(0.0, 0.06, 0.0));      // snow on its cap
    float dTs = sdSeg(q, vec2(0.0, -rr.y - 0.003), vec2(0.0, -rr.y - 0.020)) - 0.0015 * (0.45 + 0.55 * step(-rr.y - 0.010, q.y));
    float tas = fill(max(abs(q.x) - 0.0035 * sat((-rr.y - 0.009 - q.y) / 0.004), max(q.y + rr.y + 0.009, -q.y - rr.y - 0.024)));
    lay(fill(dTs), vec3(1.0, 0.0, 0.0));
    lay(tas, vec3(lines(q.x, 1.0, q.y, 0.0012, 0.55, 123.0), 0.0, 1.0));
  }

  // ---------------- a dog trotting along the near bank, its tail up
  if (uDog.w > 0.0){
    vec2 q = P - uDog.xy;
    if (abs(q.x) < 0.03 && q.y > -0.004 && q.y < 0.024){
      float ph = abs(uDog.z); q.x *= uDog.z < 0.0 ? -1.0 : 1.0;
      float bob = 0.0005 * abs(sin(ph * 2.0));
      float body = length((q - vec2(0.0, 0.0080 + bob)) / vec2(0.0085, 0.0034)) - 1.0;
      float neck = sdSeg(q, vec2(0.0060, 0.0090 + bob), vec2(0.0095, 0.0130 + bob)) - 0.0018;
      float head = length((q - vec2(0.0110, 0.0135 + bob)) / vec2(0.0030, 0.0021)) - 1.0;
      float ear = max(abs(q.x - 0.0102) - 0.0008 + (q.y - 0.0150 - bob) * 0.3, max(0.0150 + bob - q.y, q.y - 0.0172 - bob));
      float tail = sdSeg(q, vec2(-0.0080, 0.0095 + bob), vec2(-0.0110, 0.0150 + bob + 0.001 * sin(ph * 3.0))) - 0.0007;
      float a = 0.0018 * sin(ph);
      float legs = min(min(sdSeg(q, vec2(0.0055, 0.0060), vec2(0.0055 + a, 0.0)), sdSeg(q, vec2(0.0042, 0.0060), vec2(0.0042 - a, 0.0))),
                       min(sdSeg(q, vec2(-0.0055, 0.0060), vec2(-0.0055 - a, 0.0)), sdSeg(q, vec2(-0.0068, 0.0060), vec2(-0.0068 + a, 0.0)))) - 0.0007;
      float d = min(min(body * 0.003, neck), min(min(head * 0.002, ear), min(tail, legs)));
      lay(fill(d), vec3(1.0, 0.7, 0.0));
    }
  }
  // ---------------- a crow going over, black against the snow of the peaks (on the black sky only its edge shows)
  if (uCrow.w > 0.0){
    vec2 q = P - uCrow.xy;
    if (length(q) < 0.03){
      float f = sin(uCrow.z);
      vec2 w = vec2(abs(q.x), q.y);
      float wing = sdSeg(w, vec2(0.0010, 0.0), vec2(0.0120, 0.0045 * f + 0.0010)) - mix(0.0016, 0.0005, sat(w.x / 0.012));
      float wing2 = sdSeg(w, vec2(0.0120, 0.0045 * f + 0.0010), vec2(0.0175, 0.0060 * f - 0.0010)) - 0.0005;
      float body = length(q / vec2(0.0042, 0.0016)) - 1.0;
      float d = min(min(wing, wing2), body * 0.0016);
      float bg = ink.x;
      lay(fill(d), vec3(1.0, 0.8, 0.0));
      // against the black sky the carver cuts a thin white line round it, so it shows
      float rim = fill(abs(d - 0.0008) - 0.00035) * step(0.5, bg);
      ink.x = mix(ink.x, 0.0, rim); ink.y *= 1.0 - rim;
    }
  }

  // ---------------- snow falling: flakes carved out of the dark (on the white snow they vanish, as in a print)
  {
    float st = t;
    float f1 = flakes(P + vec2(0.012 * sin(st * 0.7 + P.y * 7.0), st * 0.030), 0.017, 0.50, 0.0010, 3.0);
    float f2 = flakes(P + vec2(0.016 * sin(st * 0.5 + P.y * 5.0 + 2.0), st * 0.048), 0.031, 0.33, 0.0017, 7.0);
    float f3 = flakes(P + vec2(0.022 * sin(st * 0.4 + P.y * 3.0 + 4.0), st * 0.075), 0.062, 0.16, 0.0029, 11.0);
    float fl = max(f1, max(f2, f3)) * step(0.45, vnoise(P * 3.0 + vec2(0.0, st * 0.05)) + 0.35);
    ink.x *= 1.0 - fl; ink.y *= 1.0 - 0.85 * fl; ink.z *= 1.0 - fl;
  }
  o = vec4(ink, 1.0);
}`;

/* ---------------------------------------------------------------- the printing */
const FS_PRINT = HEAD + `
uniform sampler2D uInk;
uniform sampler2D uCarve;    // what the knife has taken out of the blocks (print space, 1.6 × 1)
uniform sampler2D uRev;      // where the light has been over the blank sheet (print space): the blocks print there
uniform float uPaint;        // 1 while the light is printing the sheet; 0 once it is all printed
uniform vec2 uRegB, uRegR;   // where the indigo and vermilion blocks landed, relative to the key block (uv)
uniform float uBoil, uPx, uTime;
uniform sampler2D uSeal;
uniform vec4 uSealBox;       // the seal's place on screen (uv): x0, y0, size x, size y
uniform float uFade;
uniform vec3 uShow;          // how far each block has been printed yet (indigo, key, vermilion): the world arriving
uniform vec4 uHero;          // 一粒光 here: a little flame. x, y, size, strength
uniform vec4 uTrail[16];     // where it has just been: x, y, age (s)
uniform vec4 uPuff[12];      // snow shaken off the lantern: x, y, radius
out vec4 o;
const vec3 PAPER = vec3(0.935, 0.905, 0.835);
const vec3 AI    = vec3(0.150, 0.250, 0.450);
const vec3 SUMI  = vec3(0.070, 0.064, 0.074);
const vec3 SHU   = vec3(0.860, 0.300, 0.165);
float fill(float d){ return sat(0.5 - d / uPx); }
` + LINES + `
// a flame: a round body drawn up into a tip that leans and flickers (q in units of the body's radius)
float flame(vec2 q, float t){
  vec2 tip = vec2(0.30 * sin(t * 7.0) + 0.15 * sin(t * 11.3), 2.6 + 0.25 * sin(t * 9.1));
  float h = clamp(dot(q, tip) / dot(tip, tip), 0.0, 1.0);
  return min(length(q) - 1.0, length(q - tip * h) - (1.0 - h) * 0.98);
}
// the baren works across the sheet from the left in short zigzags; a block shows where it has passed
float shown(vec2 uv, float prog, float seed){
  if (prog >= 1.0) return 1.0;
  if (prog <= 0.0) return 0.0;
  float e = uv.x * 0.80 + 0.10 + 0.08 * (vnoise(uv * vec2(3.0, 9.0) + seed) - 0.5) + 0.018 * sin(uv.y * 47.0 + seed * 3.0);
  return smoothstep(e - 0.025, e + 0.025, prog * 1.15 - 0.05);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 P = printPos(gl_FragCoord.xy);
  float K = texture(uInk, uv).r;
  float B = texture(uInk, uv + uRegB).g;
  float R = texture(uInk, uv + uRegR).b;
  // ink pools a little at the edge of a printed area
  vec2 e = 1.6 / uRes;
  float Bb = 0.25 * (texture(uInk, uv + uRegB + vec2(e.x, 0.0)).g + texture(uInk, uv + uRegB - vec2(e.x, 0.0)).g + texture(uInk, uv + uRegB + vec2(0.0, e.y)).g + texture(uInk, uv + uRegB - vec2(0.0, e.y)).g);
  B = sat(B + 0.5 * max(B - Bb, 0.0));
  // the knife: what has been carved out of the blocks prints as bare paper
  vec2 cu = P / vec2(1.6, 1.0);
  if (cu.x > 0.0 && cu.x < 1.0 && cu.y > 0.0 && cu.y < 1.0){
    float cut = smoothstep(0.38, 0.62, texture(uCarve, cu).r + (vnoise(P * 650.0) - 0.5) * 0.30);
    K *= 1.0 - cut; B *= 1.0 - 0.92 * cut;
  }
  // the world arriving: each block printed in turn, the baren sweeping across; or, at the start of the film, printed
  // wherever the light has been over the blank sheet, the ink's edge ragged where it stops
  if (uPaint > 0.0){
    float rv = texture(uRev, vec2(P.x / 1.6, P.y)).r;
    float m = max(smoothstep(0.28, 0.72, rv + (vnoise(P * 26.0) - 0.5) * 0.45 + (vnoise(P * 170.0) - 0.5) * 0.18), 1.0 - uPaint);
    B *= m; K *= m;
  } else { B *= shown(uv, uShow.x, 1.0); K *= shown(uv, uShow.y, 2.0); }
  R *= shown(uv, uShow.z, 3.0);
  // where the flame has just passed, the cut is still warm
  for (int i = 0; i < 15; i++){
    vec4 a = uTrail[i], b = uTrail[i + 1];
    if (a.z < 0.0 || b.z < 0.0) break;
    vec2 pa = P - a.xy, ba = b.xy - a.xy;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
    float d = length(pa - ba * h);
    float age = mix(a.z, b.z, h);
    R = max(R, fill(d - 0.0018 * exp(-age / 0.5)) * exp(-age / 0.45) * 0.85);
  }
  // the flame, and its light cut into whatever is behind it
  if (uHero.w > 0.0){
    vec2 hq = P - uHero.xy; float hr = length(hq);
    if (hr < 0.10){
      float la = atan(hq.x, -hq.y);
      float T = 0.46 * uHero.w * exp(-max(hr - uHero.z * 1.4, 0.0) / 0.016);
      float ray = lines(la, 1.0 / max(hr, 1e-3), hr, 2.0 * PI / 36.0, min(T, 0.49), 7.0);
      K *= ray; B *= mix(1.0, ray, 0.9);
      float fo = flame(hq / uHero.z, uTime) * uHero.z;
      float fi = flame((hq + vec2(0.0, uHero.z * 0.30)) / (uHero.z * 0.55), uTime * 1.3 + 2.0) * uHero.z * 0.55;
      float mo = fill(fo) * sat(uHero.w * 3.0), mi = fill(fi) * sat(uHero.w * 3.0);
      K = mix(K, 0.0, mo); B = mix(B, 0.0, mo); R = mix(R, 1.0, mo);
      R = mix(R, 0.0, mi);                                                       // its white-hot heart is bare paper
      K = max(K, fill(abs(fo) - uPx * 0.55) * 0.9 * step(0.25, vnoise(vec2(atan(hq.y, hq.x) * 3.0, uTime * 2.0))) * sat(uHero.w * 3.0));
    }
  }
  // snow shaken off the lantern: white flecks
  for (int i = 0; i < 12; i++){
    vec4 f = uPuff[i];
    if (f.z <= 0.0) continue;
    float dd = length(P - f.xy) - f.z, m = fill(dd);
    K *= 1.0 - m; B *= 1.0 - 0.85 * m; R *= 1.0 - m;
    K = max(K, fill(abs(dd) - uPx * 0.6) * smoothstep(0.2 * f.z, -0.6 * f.z, P.y - f.y));   // its shadowed underside, so it shows on the light too
  }
  // the paper: warm, with long fibres and a soft cloudiness in its sizing
  float fib = vnoise(vec2(P.x * 900.0 + 40.0 * vnoise(P * 9.0), P.y * 140.0)) * 0.6 + vnoise(vec2(P.x * 130.0, P.y * 1100.0 + 30.0 * vnoise(P * 7.0))) * 0.4;
  vec3 paper = PAPER * (0.975 + 0.035 * fib + 0.025 * (fbm3(P * 14.0) - 0.5));
  float tooth = vnoise(P * 1300.0);
  // the indigo: rubbed on with the baren, its swirls faintly visible; it sits lighter on the paper's raised tooth
  vec2 bc = floor(P * 34.0); vec2 bq = fract(P * 34.0) - 0.5;
  float swirl = sin(length(bq + (hash22(bc) - 0.5) * 0.6) * 70.0 + hash12(bc) * 6.0) * 0.5 + 0.5;
  float Bt = B * (0.93 + 0.05 * swirl - 0.06 * tooth * tooth + 0.04 * (vnoise(P * 60.0 + uBoil * 3.0) - 0.5));
  // the black: the block's wood grain shows in the solid areas; here and there the paper shows through where the ink didn't take
  float grain = sin((P.y + 0.012 * fbm3(P * vec2(4.0, 14.0)) + 0.002 * vnoise(P * vec2(30.0, 200.0))) * 1500.0) * 0.5 + 0.5;
  grain *= smoothstep(0.35, 0.8, vnoise(vec2(P.x * 6.0, P.y * 60.0)));
  float specks = step(0.975, hash12(floor(P * 1700.0) + uBoil * 17.0)) * 0.7;
  float take = 1.0 - 0.10 * grain - specks - 0.10 * tooth * tooth * tooth + 0.03 * (vnoise(P * 90.0 + uBoil * 5.0) - 0.5);
  vec3 c = paper;
  c *= pow(AI / PAPER, vec3(sat(Bt)));
  c *= mix(vec3(1.0), SHU / PAPER, sat(R * (0.95 - 0.06 * tooth)));
  c *= mix(vec3(1.0), SUMI / PAPER, sat(K * take));
  // the seal, red, its edges worn (stamped last, once the print is done)
  vec2 sq = (uv - uSealBox.xy) / uSealBox.zw;
  if (sq.x > 0.0 && sq.x < 1.0 && sq.y > 0.0 && sq.y < 1.0){
    float s = texture(uSeal, vec2(sq.x, 1.0 - sq.y)).r;
    s *= step(0.18, vnoise(sq * 38.0) + 0.3 * vnoise(sq * 9.0));
    c = mix(c, c * SHU / PAPER, s * 0.95 * step(0.999, uShow.z));
  }
  o = vec4(c * uFade, 1.0);
}`;

// the knife: one cut, a capsule whose width changes along it, drawn into the carve mask (print space)
const VS_STAMP = `#version 300 es
uniform vec4 uSeg; uniform vec2 uRad;
out vec2 vP;
void main(){
  vec2 a = uSeg.xy, b = uSeg.zw; float r = max(uRad.x, uRad.y) + 0.004;
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vP = mix(min(a, b) - r, max(a, b) + r, c);
  gl_Position = vec4(vP / vec2(1.6, 1.0) * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_STAMP = `#version 300 es
precision highp float;
in vec2 vP; uniform vec4 uSeg; uniform vec2 uRad; uniform float uPxM;
out vec4 o;
void main(){
  vec2 a = uSeg.xy, b = uSeg.zw, pa = vP - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-10), 0.0, 1.0);
  float d = length(pa - ba * h) - mix(uRad.x, uRad.y, h);
  o = vec4(clamp(0.5 - d / uPxM, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// the old tree in the foreground: a thick leaning trunk, a great limb sweeping across the sky, a low one reaching
// out over the bank (the lantern hangs from its end), one going up out of the picture; twigs forking off them
function makeTree(rnd) {
  const segs = [];
  // a limb through the given points, each span bent a little off the straight (old wood grows in kinks), radius r0 → r1
  const poly = (pts, r0, r1, bend) => {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      const k = (rnd() - 0.5) * 2 * bend * l, m = [a[0] + dx * 0.5 - dy / l * k, a[1] + dy * 0.5 + dx / l * k];
      const ra = r0 + (r1 - r0) * (i + 0.25) / n, rb = r0 + (r1 - r0) * (i + 0.75) / n;
      segs.push([...a, ...m, ra], [...m, ...b, rb]);
    }
  };
  const along = (pts, f) => {   // a point a fraction f along a polyline, and the direction there
    const n = pts.length - 1, x = Math.min(f * n, n - 1e-6), i = Math.floor(x), u = x - i;
    const a = pts[i], b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
  };
  const twig = (x, y, ang, len, rad, depth) => {
    const a1 = ang + (rnd() - 0.5) * 0.35;
    const mx = x + Math.cos(a1) * len * 0.5, my = y + Math.sin(a1) * len * 0.5;
    const a2 = a1 + (rnd() - 0.5) * 0.6;
    const ex = mx + Math.cos(a2) * len * 0.5, ey = my + Math.sin(a2) * len * 0.5;
    segs.push([x, y, mx, my, rad], [mx, my, ex, ey, Math.max(rad * 0.75, 0.0008)]);
    if (depth > 0) {
      twig(mx, my, a2 + 0.5 + rnd() * 0.4, len * 0.55, Math.max(rad * 0.65, 0.0008), depth - 1);
      twig(ex, ey, a2 - 0.4 - rnd() * 0.4, len * 0.55, Math.max(rad * 0.65, 0.0008), depth - 1);
    }
  };
  const trunk = [[0.070, -0.03], [0.098, 0.10], [0.088, 0.24], [0.116, 0.38], [0.104, 0.50], [0.132, 0.60]];
  const A = [[0.132, 0.60], [0.21, 0.690], [0.29, 0.800], [0.42, 0.850], [0.56, 0.915], [0.70, 0.920], [0.87, 0.968]];
  const B = [[0.110, 0.470], [0.21, 0.530], [0.33, 0.600], [0.46, 0.585], [0.555, 0.585], [0.620, 0.553]];
  const C = [[0.132, 0.60], [0.108, 0.72], [0.100, 0.86], [0.080, 1.05]];
  poly(trunk, 0.036, 0.021, 0.10); poly(A, 0.018, 0.0035, 0.18); poly(B, 0.013, 0.0038, 0.16); poly(C, 0.015, 0.009, 0.12);
  // twigs off the great limb: most reach up, some hang
  for (const f of [0.18, 0.31, 0.44, 0.57, 0.70, 0.82, 0.93]) {
    const [x, y, a] = along(A, f), up = rnd() < 0.72;
    twig(x, y, up ? a + 0.9 + rnd() * 0.5 : a - 1.0 - rnd() * 0.4, (0.07 + 0.06 * rnd()) * (1.1 - f * 0.5), 0.0032 * (1.2 - f * 0.6), 1);
  }
  for (const f of [0.30, 0.55, 0.78]) {
    const [x, y, a] = along(B, f);
    twig(x, y, a + 1.0 + rnd() * 0.5, 0.05 + 0.04 * rnd(), 0.0026, 1);
  }
  for (const f of [0.35, 0.7]) { const [x, y, a] = along(C, f); twig(x, y, a - 0.9, 0.06, 0.004, 0); }
  return segs.slice(0, 112);
}
// the seal 「光」, drawn in strokes so it never depends on an installed font (朱文: red lines on the paper)
function makeSeal() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff'; g.lineCap = 'square'; g.lineJoin = 'miter';
  g.lineWidth = 8; g.strokeRect(9, 9, 110, 110);
  g.lineWidth = 9; g.lineCap = 'round';
  const S = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
  S([64, 24, 64, 52]);                     // the flame's middle stroke
  S([38, 30, 46, 48]); S([90, 30, 82, 48]); // its two sparks
  S([26, 60, 102, 60]);                    // the long horizontal
  S([54, 60, 54, 80, 46, 96, 30, 104]);    // the left leg
  S([76, 60, 76, 98, 82, 104, 104, 104, 104, 94]);   // the right leg with its hook
  return c;
}

YL.makeSeal = makeSeal;                 // (the ink painting stamps the same seal)
function hashJS(p) { p = (p * 0.1031) % 1; if (p < 0) p += 1; p *= p + 33.33; p *= p + p; return p % 1; }
const FPS = 8;                          // the print's own frame rate: the world is re-printed eight times a second
const CARVE_W = 1536, CARVE_H = 960;    // the knife's mask, over the whole 1.6 × 1 sheet
const HOLE = [0.950, 0.285];
// a smooth path through some points (Catmull-Rom), as a polyline
function curve(pts, per = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
function pathLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function pointAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= l || i === pts.length - 1) { const u = Math.min(s / Math.max(l, 1e-9), 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; }
    s -= l;
  }
  return pts[pts.length - 1].slice();
}

W.woodcut = {
  ready: false, t: 0, fade: 1, vol: 1, show: [1, 1, 1], lanLight: 1,
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.pScene = YL.makeProgram('woodcut-scene', VS, FS_SCENE); YL.checkProgram(this.pScene);
    this.pPrint = YL.makeProgram('woodcut-print', VS, FS_PRINT); YL.checkProgram(this.pPrint);
    this.pStamp = YL.makeProgram('woodcut-stamp', VS_STAMP, FS_STAMP); YL.checkProgram(this.pStamp);
    const rnd = YL.rnd;
    this.tree = makeTree(rnd);
    let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
    for (const s of this.tree) { x0 = Math.min(x0, s[0] - s[4], s[2] - s[4]); x1 = Math.max(x1, s[0] + s[4], s[2] + s[4]); y0 = Math.min(y0, s[1] - s[4], s[3] - s[4]); y1 = Math.max(y1, s[1] + s[4], s[3] + s[4]); }
    this.treeBox = [x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.02];
    this.trBuf = new Float32Array(112 * 4); this.trR = new Float32Array(112);
    this.tree.forEach((s, i) => { this.trBuf.set(s.slice(0, 4), i * 4); this.trR[i] = s[4]; });
    // the village: x, base, half width, wall height | roof height, type (1: gable end to us), lit windows (1, 2: bits), seed — back to front
    const H = [
      [0.735, 0.454, 0.034, 0.033, 0.030, 1, 1, 2],
      [1.080, 0.455, 0.040, 0.035, 0.032, 1, 0, 5],
      [1.330, 0.450, 0.040, 0.033, 0.030, 0, 2, 6],
      [0.465, 0.440, 0.040, 0.038, 0.030, 0, 0, 7],
      [0.985, 0.440, 0.046, 0.043, 0.042, 1, 1, 4],
      [1.200, 0.434, 0.058, 0.044, 0.034, 0, 1, 1],
      [0.830, 0.428, 0.074, 0.050, 0.040, 0, 3, 3],
    ];
    this.houses = H;
    this.litBase = H.map(h => h[6]); this.lit = this.litBase.slice();
    this.hA = new Float32Array(32); this.hB = new Float32Array(32);
    H.forEach((h, i) => { this.hA.set(h.slice(0, 4), i * 4); this.hB.set(h.slice(4), i * 4); });
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeSeal());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.seal = tex;
    this.carve = YL.makeTarget(CARVE_W, CARVE_H, ['rgba8']);
    this.clearCarve();
    this.trail = []; this.puff = []; this.queue = []; this.stroke = null;
    if (!this.inited) this.t = +(YL.QS.get('wt') || 0);
    this.inited = true;
    // debug: &wh=x,y shows the flame out of its lantern at that point of the print
    const wh = YL.QS.get('wh');
    if (wh) { this.hero.mode = 'fall'; this.hero.p = wh.split(',').map(Number); this.lanLight = 0.25; }
    // debug: &moon shows the new moon it carves when nobody else has cut anything
    if (YL.QS.has('moon')) { this.carveMoon(); for (const P of this.queue) for (let i = 1; i < P.length; i++) this.carveSeg(P[i - 1], P[i], P.carve, P.carve); this.queue = []; }
    // debug: &shiver=s shows the lantern s seconds after it has shaken the snow off
    if (YL.QS.get('shiver')) { this.shiver(); for (let k = 0, n = Math.round(+YL.QS.get('shiver') * 60); k < n; k++) for (const f of this.puff) { f.v[1] -= 0.10 / 60; f.p[0] += f.v[0] / 60; f.p[1] += f.v[1] / 60; } }
    this.ready = true;
  },
  clearCarve() {
    const gl = YL.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.carve.fb); gl.viewport(0, 0, CARVE_W, CARVE_H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  },
  // two ink buffers: one on show, the next printing drawn into the other a strip at a time
  targets(w, h) {
    if (this.inks && this.inks[0].w === w && this.inks[0].h === h) return;
    const gl = YL.gl;
    if (this.inks) for (const k of this.inks) { gl.deleteFramebuffer(k.fb); gl.deleteTexture(k.tex.t); }
    this.inks = [YL.makeTarget(w, h, ['rgba8']), YL.makeTarget(w, h, ['rgba8'])];
    this.front = 0; this.shown = -1; this.next = null;
  },
  // the print's view: which part of the 1.6 × 1 sheet is on screen
  view(aspect, t) {
    const s = Math.min(1, 1.6 / aspect), still = YL.DBG.still;
    const pan = still ? 0 : 0.016 * Math.sin(t * 0.05);
    const narrow = Math.min(Math.max((1.0 - aspect) / 0.45, 0), 1);       // on a phone held upright, keep the lantern well inside
    const v = [0.80 - 0.06 * narrow + pan, 0.5, s];
    if (this.panX !== undefined) { v[0] = this.panX; v[2] = s * (this.panZ ?? 0.84); v[1] = this.panY ?? 0.49; }
    // the way out: the eye goes into the lantern until its lit paper is all there is
    const z = this.zoomIn || 0;
    if (z > 0) {
      const L = this.lantern(t), e = z * z * (3 - 2 * z), k = Math.pow(z, 1.6);
      v[0] += (L[0] - v[0]) * e; v[1] += (L[1] - 0.004 - v[1]) * e;
      v[2] = v[2] * Math.exp(Math.log(0.011 / v[2]) * k);                         // (from wherever the eye already is)
    }
    return v;
  },
  toPrint(nx, ny, aspect) {
    const v = this.view(aspect, (this.shown > 0 ? this.shown : 0) / FPS);
    return [nx * 0.5 * aspect * v[2] + v[0], ny * 0.5 * v[2] + v[1]];
  },
  // where the lantern hangs at a given moment (a knock sets it swinging)
  lantern(t) {
    let sway = 0.05 * Math.sin(t * 0.9) + 0.02 * Math.sin(t * 2.3 + 1);
    if (this.kickT !== undefined && t > this.kickT) sway += 0.16 * Math.sin((t - this.kickT) * 5.5) * Math.exp(-(t - this.kickT) * 1.3);
    const piv = [0.618, 0.553], cord = 0.075;
    return [piv[0] + Math.sin(sway) * cord, piv[1] - Math.cos(sway) * cord, this.lanLight, sway];
  },

  /* ---------------------------------------------------------------- 一粒光 in the print
     A little flame. It is drawn when the paper is printed — every screen frame — not cut into the blocks, so it moves
     smoothly while the world around it re-prints eight times a second: it is not from here.
       fall   it comes down with the snow, finds the dark lantern
       enter  goes in; the lantern lights, its light cut out of the night; one by one the windows answer
       home   the lantern's light is its light. Snow piles on the cap; now and then it shivers and shakes it off
       out    when you carve a line, it leaves the lantern, runs along your cut, and comes back
       leave  at the end it carves its own way down to the hole in the ice, and sinks into the black water        */
  hero: { mode: 'home', p: [0.618, 0.47], v: [0, 0], size: 0.0090, k: 0, path: null, s: 0, leg: '', snow: 0, lastTrail: 0 },
  arrive(nx, ny, aspect) {
    const H = this.hero;
    H.mode = 'fall'; H.p = this.toPrint(nx, ny, aspect); H.v = [0, -0.02]; H.k = 0; H.snow = 0;
    this.lanLight = 0; this.lit = this.litBase.map((v, i) => i === 6 ? 1 : 0); this.lightsOn = false;
    this.queue = []; this.trail = []; this.clearCarve();
  },
  /* ---- the film's way in: the light has gone into a blank sheet. It sweeps across it in three broad rows (the sky,
     the village, the river and snow), and the blocks print wherever it has been, as if it were the baren; then it
     goes home into the lantern, and the vermilion goes on. */
  paintFrom(nx, ny, aspect) {
    this.arrive(nx, ny, aspect);
    const H = this.hero, gl = YL.gl;
    H.mode = 'paint'; H.k = 0;
    H.route = [H.p.slice(), [0.14, 0.80], [1.46, 0.80], [1.46, 0.50], [0.14, 0.50], [0.14, 0.18], [1.46, 0.18]];
    if (!this.rev) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.rev = { cv, ctx: cv.getContext('2d'), tex, dirty: true };
    }
    const c = this.rev.ctx; c.fillStyle = '#000'; c.fillRect(0, 0, 256, 160); this.rev.dirty = true;
    this.paintK = 1; this.paintS = 0;
  },
  // the light's brush on the reveal: a soft round dab where it is
  dab(p) {
    const c = this.rev.ctx, x = p[0] / 1.6 * 256, y = p[1] * 160, r = 0.21 / 1.6 * 256;
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); c.globalCompositeOperation = 'source-over';
    this.rev.dirty = true;
  },
  steer(target, speed, dt, turn = 4) {
    const H = this.hero, dx = target[0] - H.p[0], dy = target[1] - H.p[1], d = Math.hypot(dx, dy);
    const sp = Math.min(speed, d * 3 + 0.01);
    H.v[0] += (dx / Math.max(d, 1e-6) * sp - H.v[0]) * Math.min(1, dt * turn);
    H.v[1] += (dy / Math.max(d, 1e-6) * sp - H.v[1]) * Math.min(1, dt * turn);
    H.p[0] += H.v[0] * dt; H.p[1] += H.v[1] * dt;
    return d;
  },
  heroUpdate(dt) {
    const H = this.hero, L = this.lantern(this.t), core = [L[0], L[1] - 0.003];
    const breath = 1 + 0.07 * Math.sin(this.t * 2.1) + 0.03 * Math.sin(this.t * 5.3);     // the same breathing as in every world
    let moving = false;
    if (H.mode === 'paint') {
      // along its rows at a steady pace (a beat's pause first), dabbing the sheet as it goes
      moving = true; H.k += dt;
      const R = H.route, sp = 2.4, go = Math.max(0, H.k - 0.35) * sp * YL.smooth(0.35, 0.8, H.k);
      let left = go, i = 0, p = R[0].slice();
      while (i < R.length - 1) { const a = R[i], b = R[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (left <= L) { p = [a[0] + (b[0] - a[0]) * left / L, a[1] + (b[1] - a[1]) * left / L]; break; } left -= L; i++; p = b.slice(); }
      // (dab every 2 cm along the way since the last frame, so a fast stretch leaves no gaps)
      const last = H.lastDab || H.p, n = Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / 0.02);
      for (let k = 1; k <= n; k++) this.dab([last[0] + (p[0] - last[0]) * k / n, last[1] + (p[1] - last[1]) * k / n]);
      H.lastDab = p; H.v = [(p[0] - H.p[0]) / Math.max(dt, 1e-4), (p[1] - H.p[1]) / Math.max(dt, 1e-4)]; H.p = p;
      if (i >= R.length - 1) { H.mode = 'hop'; this.hops = []; H.lastDab = null; }
    } else if (H.mode === 'hop') {
      moving = true;
      this.lanLight += (0.35 - this.lanLight) * Math.min(1, dt * 3);
      if (this.hops && this.hops.length) {
        const i = this.hops[0], e = this.eavePos(i), tgt = [e[0], e[1] + 0.002];
        if (this.steer(tgt, 0.62, dt, 5) < 0.007) {
          this.hops.shift();
          (this.eaveOn = this.eaveOn || [])[i] = 1;
          if (!this.lit[i]) { this.lit[i] = this.litBase[i] || 1; }
          this.hopNote && this.hopNote(this.hops.length);
        }
      } else if (this.steer(core, 0.62, dt, 5) < 0.012) { H.mode = 'enter'; H.k = 0.4; }
    } else if (H.mode === 'fall') {
      // drifting down like the snow, but it knows where it's going
      const d = this.steer([core[0] + 0.02 * Math.sin(this.t * 1.3), core[1] + 0.012], 0.085 * (this.pace || 1), dt, 1.2);
      moving = true;
      if (d < 0.016) { H.mode = 'enter'; H.k = 0; }
    } else if (H.mode === 'enter') {
      H.k = Math.min(1, H.k + dt / 0.9);
      H.p[0] += (core[0] - H.p[0]) * Math.min(1, dt * 6); H.p[1] += (core[1] - H.p[1]) * Math.min(1, dt * 6);
      this.lanLight = Math.max(this.lanLight, YL.smooth(0.35, 1, H.k) * (1 + 0.45 * Math.sin(Math.PI * YL.smooth(0.35, 1, H.k))));
      if (H.k >= 1) {
        H.mode = 'home'; H.snow = 0;
        this.motif();
        if (!this.lightsOn) { this.lightsOn = true; this.winT = 0.6; }
      }
    } else if (H.mode === 'home') {
      H.p = core.slice();
      // snow settles on the lantern's cap; the light dims a little under it, then the lantern shivers and shakes it off
      H.snow += dt / 13;
      this.lanLight += (breath * (1 - 0.22 * Math.min(H.snow, 1)) - this.lanLight) * Math.min(1, dt * 3);
      if (H.snow >= 1) this.shiver();
      if (this.queue.length) { H.mode = 'out'; H.path = this.queue.shift(); H.leg = 'to'; H.v = [0, 0]; }
    } else if (H.mode === 'out') {
      this.lanLight += (0.25 - this.lanLight) * Math.min(1, dt * 4);                    // the lantern keeps only an ember
      moving = true;
      if (H.leg === 'to') { if (this.steer(H.path[0], 0.55 * (this.pace || 1), dt) < 0.006) { H.leg = 'along'; H.s = 0; } }
      else if (H.leg === 'along') {
        const s0 = H.s;
        H.s += (H.path.carve ? 0.16 : 0.30) * dt * (this.pace || 1);
        H.p = pointAt(H.path, H.s); H.v = [0, 0];
        // a path of its own (the moon): it is the knife, and cuts as it goes
        if (H.path.carve) { const a = pointAt(H.path, Math.max(s0 - 0.003, 0)); this.carveSeg(a, H.p, H.path.carve, H.path.carve); }
        if (H.s >= H.pathL) { H.leg = 'back'; if (this.queue.length) { H.path = this.queue.shift(); H.leg = 'to'; } }
      } else if (this.steer(core, 0.55 * (this.pace || 1), dt) < 0.012) { H.mode = 'enter'; H.k = 0.4; }
    } else if (H.mode === 'leave') {
      this.lanLight += (0.12 - this.lanLight) * Math.min(1, dt * 2);
      moving = true;
      const s0 = H.s;
      H.s += 0.095 * dt * (this.pace || 1);
      H.p = pointAt(H.path, H.s);
      // it is the knife now: its way down is cut into the print behind it
      const a = pointAt(H.path, Math.max(s0 - 0.004, 0));
      const taper = Math.min(1, H.s / 0.03) * Math.min(1, (H.pathL - H.s) / 0.05 + 0.25);
      this.carveSeg(a, H.p, 0.0021 * taper, 0.0021 * taper);
      if (H.s >= H.pathL) { H.mode = 'sink'; H.k = 0; }
    } else if (H.mode === 'sink') {
      H.k = Math.min(1, H.k + dt / 1.6);
      H.p[0] += (HOLE[0] - H.p[0]) * Math.min(1, dt * 3); H.p[1] += (HOLE[1] - 0.004 - H.p[1]) * Math.min(1, dt * 3);
      if (H.k >= 1) { H.mode = 'gone'; this.gone = true; }
    }
    // where it has just been stays warm a moment
    const now = this.t;
    if (moving && now - H.lastTrail > 0.035) { this.trail.push([H.p[0], H.p[1], now]); H.lastTrail = now; if (this.trail.length > 16) this.trail.shift(); }
    this.trail = this.trail.filter(p => now - p[2] < 1.6);
    // the windows answer the lantern, nearest first
    if (this.lightsOn && this.winT !== undefined) {
      this.winT -= dt;
      if (this.winT <= 0) {
        const order = this.houses.map((h, i) => [Math.abs(h[0] - L[0]), i]).sort((a, b) => a[0] - b[0]);
        const next = order.find(([, i]) => this.lit[i] !== this.litBase[i]);
        if (next) { this.lit[next[1]] = this.litBase[next[1]]; this.winT = 0.7 + Math.random() * 0.6; } else this.winT = undefined;
      }
    }
    // the shaken-off snow
    for (const f of this.puff) { f.v[1] -= 0.10 * dt; f.p[0] += f.v[0] * dt; f.p[1] += f.v[1] * dt; f.life -= dt; }
    this.puff = this.puff.filter(f => f.life > 0);
  },
  shiver() {
    const H = this.hero, L = this.lantern(this.t);
    H.snow = 0; this.kickT = this.t; this.lanLight = 1.25;
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (0.15 + 0.7 * Math.random());
      const sp = 0.04 + 0.07 * Math.random();
      this.puff.push({ p: [L[0] + (Math.random() - 0.5) * 0.016, L[1] + 0.036], v: [Math.cos(a) * sp, Math.sin(a) * sp], r: 0.0026 + 0.0034 * Math.random(), life: 1.1 + 0.7 * Math.random() });
    }
    this.puffSound();
  },
  // where the ice hole is on the screen (ndc), and its half-size there (pixels), for the way out
  holeOnScreen(aspect, h) {
    const v = this.view(aspect, (this.shown > 0 ? this.shown : 0) / FPS);
    const nx = (HOLE[0] - v[0]) / (v[2] * aspect) * 2, ny = (HOLE[1] - v[1]) / v[2] * 2;
    const r = 0.060 / v[2] * h;
    return { nx, ny, rx: r, ry: r / 2.6 };
  },
  // if nobody has cut anything yet, it shows how: it goes up into the dark and carves a new moon, then comes home
  carveMoon() {
    if (this.moonDone) return; this.moonDone = true;
    // a waxing crescent: the outer edge is the moon's own circle; the inner, a larger circle through its two horns
    const c = [0.87, 0.875], R = 0.052, out = [], inn = [], hatch = [];
    const t0 = 0.62 * Math.PI, t1 = 1.38 * Math.PI;
    for (let i = 0; i <= 24; i++) { const a = t0 + (t1 - t0) * i / 24; out.push([c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R]); }
    const d = 0.45 * R, hx = Math.cos(t1) * R - d, hy = Math.sin(t1) * R, rho = Math.hypot(hx, hy);
    const a2 = Math.atan2(hy, hx) + 2 * Math.PI, a1 = 2 * Math.PI - a2;          // from the lower horn back up to the upper, round the inside
    for (let i = 1; i <= 24; i++) { const a = a2 + (a1 - a2) * i / 24; inn.push([c[0] + d + Math.cos(a) * rho, c[1] + Math.sin(a) * rho]); }
    const pts = out.concat(inn);
    pts.carve = 0.0020; pts.L = pathLength(pts);
    // and two cuts inside it, following its curve (the way a carver shades a crescent)
    for (let k = 1; k <= 2; k++) {
      const h = [], r = R * (1 - 0.075 * k), span = 0.30 - 0.05 * k;
      for (let i = 0; i <= 16; i++) { const a = Math.PI * (1 - span + 2 * span * i / 16); h.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
      h.carve = 0.0011; h.L = pathLength(h); hatch.push(h);
    }
    this.queue.push(pts, ...hatch);
  },
  // the end of this world: it leaves the lantern and cuts its way down across the ice to the hole
  leave() {
    const H = this.hero, L = this.lantern(this.t);
    const pts = [[L[0], L[1] - 0.003], [L[0] + 0.02, L[1] - 0.07], [0.70, 0.355], [0.80, 0.318], [0.88, 0.322], [HOLE[0] - 0.02, HOLE[1] + 0.022], [HOLE[0], HOLE[1] + 0.004]];
    H.path = curve(pts, 14); H.pathL = pathLength(H.path); H.s = 0; H.mode = 'leave'; this.queue = [];
  },

  /* ---------------------------------------------------------------- the knife
     Press and draw: the line is cut out of the blocks (both the black and the indigo), so it prints as bare paper.
     You can only carve light into the dark — on the white snow there is nothing to take away.
     A slow hand cuts wide, a quick one narrow; the cut starts thin where the knife goes in and tapers out where it lifts. */
  carveSeg(a, b, r0, r1) {
    const gl = YL.gl, pS = this.pStamp;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.carve.fb); gl.viewport(0, 0, CARVE_W, CARVE_H);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(pS.p);
    YL.U(pS, 'uSeg', [a[0], a[1], b[0], b[1]]); YL.U(pS, 'uRad', [r0, r1]); YL.U(pS, 'uPxM', 1.6 / CARVE_W);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND);
  },
  pointer(nx, ny, speed) {
    if (!YL.ptrDown || !this.ready || this.show[1] < 1) return;
    const aspect = YL.canvasAspect(), p = this.toPrint(nx, ny, aspect);
    const S = this.stroke;
    if (!S) { this.stroke = { pts: [p], r: 0, len: 0 }; return; }
    const last = S.pts[S.pts.length - 1], d = Math.hypot(p[0] - last[0], p[1] - last[1]);
    if (d < 0.002) return;
    const v = speed * 0.5 * this.view(aspect, 0)[2];                         // print units per second
    const r = Math.max(0.0014, Math.min(0.0042, 0.0042 / (1 + 0.9 * v))) * Math.min(1, (S.len + d) / 0.02);
    this.carveSeg(last, p, S.r, r);
    S.r = r; S.len += d; S.pts.push(p);
    this.carving = Math.min(1.5, v);
  },
  endStroke() {
    const S = this.stroke; this.stroke = null; this.carving = 0;
    if (!S || S.pts.length < 2) return;
    // the knife lifts out: a short tail, narrowing to nothing
    const n = S.pts.length, a = S.pts[n - 1], b = S.pts[Math.max(n - 3, 0)];
    const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1;
    const tail = [a[0] + dx / l * 0.012, a[1] + dy / l * 0.012];
    this.carveSeg(a, tail, S.r, 0);
    S.pts.push(tail);
    if (S.len > 0.04 && this.queue.length < 2 && ['home', 'out', 'enter'].includes(this.hero.mode)) {
      const pts = S.pts; this.queue.push(pts); pts.L = pathLength(pts); this.userCut = true;
    }
  },

  /* ---------------------------------------------------------------- sound */
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    // a long, dark reverb: the valley
    const sr = ctx.sampleRate, n = Math.floor(sr * 4.5), ir = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const tt = i / sr; lp += ((Math.random() * 2 - 1) - lp) * 0.12; d[i] = lp * Math.exp(-tt / 1.3) * (tt < 0.06 ? tt / 0.06 : 1); } }
    const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.8; wet.connect(conv); conv.connect(bus);
    // the wind: almost nothing, a low breath that rises and falls
    const pink = noiseBuffer(6.7, 'pink');
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 320; wl.Q.value = 0.3;
    const wg = ctx.createGain(); wg.gain.value = 0;
    loop(pink, 0.8, wl); wl.connect(wg); wg.connect(bus);
    // the knife in the wood: a dry scratch that follows your hand
    const white = noiseBuffer(3.3, 'white');
    const kb = ctx.createBiquadFilter(); kb.type = 'bandpass'; kb.frequency.value = 2600; kb.Q.value = 0.9;
    const kh = ctx.createBiquadFilter(); kh.type = 'highpass'; kh.frequency.value = 900;
    const kg = ctx.createGain(); kg.gain.value = 0;
    loop(white, 1.0, kb); kb.connect(kh); kh.connect(kg); kg.connect(bus);
    this.snd = { ctx, bus, wet, wl, wg, kb, kg, nextBell: 6 + Math.random() * 6, nextSlide: 14 + Math.random() * 10 };
  },
  // a temple bell far off across the valley: a low hum, its partials beating slowly, a very long tail
  bell() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.05, f0 = 98;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.10;
    lp.connect(g); g.connect(S.bus); g.connect(S.wet);
    [[0.5, 1.0, 14], [1.0, 0.7, 10], [1.19, 0.35, 7], [1.5, 0.3, 6], [2.0, 0.28, 5], [2.52, 0.16, 3.5], [2.98, 0.12, 3], [4.07, 0.06, 2]].forEach(([r, a, dec]) => {
      for (const det of [-0.35, 0.35]) {
        const o = ctx.createOscillator(); o.frequency.value = f0 * r + det * r;
        const e = ctx.createGain(); e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(a * 0.5, t0 + 0.012); e.gain.exponentialRampToValueAtTime(1e-4, t0 + dec);
        o.connect(e); e.connect(lp); o.start(t0); o.stop(t0 + dec + 0.1);
      }
    });
  },
  noiseBuf() {
    const ctx = this.snd.ctx;
    return this.noise || (this.noise = (() => { const L = ctx.sampleRate * 2, b = ctx.createBuffer(1, L, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < L; i++) d[i] = Math.random() * 2 - 1; return b; })());
  },
  // snow sliding off a roof somewhere: a soft hush and a muffled thump
  slide() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.02;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t0); f.frequency.exponentialRampToValueAtTime(180, t0 + 1.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.03, t0 + 0.5); g.gain.linearRampToValueAtTime(0.05, t0 + 1.1); g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.7);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    n.connect(f); f.connect(g); if (p) { p.pan.value = Math.random() * 1.4 - 0.7; g.connect(p); p.connect(S.bus); } else g.connect(S.bus);
    g.connect(S.wet);
    n.start(t0); n.stop(t0 + 1.8);
  },
  puffSound() {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.01;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3800; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.035, t0 + 0.02); g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.35);
    n.connect(f); f.connect(g); g.connect(S.bus); g.connect(S.wet);
    n.start(t0, Math.random()); n.stop(t0 + 0.4);
  },
  // 一粒光的动机，这里是木头的声音：三声敲在木琴的音板上，短而温暖
  // a lantern catching: one wooden note, rising a step with each lantern (the pentatonic A C# E F# A)
  hopNote(left) {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, t = ctx.currentTime + 0.02, f = [1760, 1479.98, 1318.5, 1108.7][Math.min(left, 3)];
    const g = ctx.createGain(); g.gain.value = 0.05; g.connect(S.bus); g.connect(S.wet);
    [[1, 0.9, 0.5], [3.93, 0.25, 0.07]].forEach(([r, a, dec]) => {
      const o = ctx.createOscillator(); o.frequency.value = f * r;
      const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(a, t + 0.003); e.gain.exponentialRampToValueAtTime(1e-4, t + dec);
      o.connect(e); e.connect(g); o.start(t); o.stop(t + dec + 0.05);
    });
  },
  motif(rate = 1, gain = 0.07) {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.03;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain(); g.gain.value = gain;
    if (p) { p.pan.value = (this.hero.p[0] - 0.8) * 1.2; g.connect(p); p.connect(S.bus); } else g.connect(S.bus);
    g.connect(S.wet);
    [880, 1108.7, 1318.5].forEach((f, i) => {
      const t = t0 + i * 0.17;
      [[1, 0.9, 0.55], [3.93, 0.25, 0.07], [9.2, 0.06, 0.02]].forEach(([r, a, dec]) => {
        const o = ctx.createOscillator(); o.frequency.value = f * rate * r;
        const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(a, t + 0.003); e.gain.exponentialRampToValueAtTime(1e-4, t + dec);
        o.connect(e); e.connect(g); o.start(t); o.stop(t + dec + 0.05);
      });
    });
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.8);
    const br = 0.5 + 0.5 * Math.sin(this.t * 0.21) * Math.sin(this.t * 0.083 + 1);
    S.wg.gain.setTargetAtTime(0.03 + 0.05 * br, now, 1.0);
    S.wl.frequency.setTargetAtTime(220 + 260 * br, now, 1.0);
    const k = this.carving || 0;
    S.kg.gain.setTargetAtTime(0.05 * Math.min(1, k) * (0.7 + 0.3 * Math.random()), now, 0.025);
    S.kb.frequency.setTargetAtTime(2000 + 1400 * Math.min(1, k), now, 0.05);
    this.carving = (this.carving || 0) * Math.exp(-dt * 12);
    if ((S.nextBell -= dt) <= 0) { this.bell(); S.nextBell = 24 + Math.random() * 14; }
    if ((S.nextSlide -= dt) <= 0) { this.slide(); S.nextSlide = 18 + Math.random() * 20; }
  },
  /* ---- the village's evening (in print units; stepped at the print's own rate when drawn) */
  life(t) {
    const bankY = (x) => 0.428 + 0.003 * Math.sin(x * 4.0 + 1.0);
    const figs = [[0.42, 0.020, 1], [1.46, 0.016, -1], [0.78, 0.013, 1]].map(([x0, v, d], i) => {
      const x = x0 + d * v * t, ph = (v * t) / 0.0042 * Math.PI;
      return [x, bankY(x), d * (ph + 0.3 + i), 1];
    });
    const dx = 0.22 + 0.045 * t, dog = [dx, 0.152 + 0.010 * Math.sin(dx * 3.0), (0.045 * t / 0.0050) * Math.PI + 0.2, dx < 1.7 ? 1 : 0];
    const ct = t - (this.crowAt ?? 3.5), cu = Math.min(1, Math.max(0, ct / 4.5));
    const crow = [0.56 + 0.72 * cu, 0.60 + 0.20 * cu + 0.03 * Math.sin(cu * 6.0), ct * 13.0, ct > 0 && ct < 4.5 ? 1 : 0];
    return { figs, dog, crow };
  },
  // where the lantern under house i's eaves hangs (as drawn in the scene)
  eavePos(i) {
    const h = this.houses[i], sc = h[3] / 0.034, side = hashJS(h[7] * 3.3) < 0.5 ? -1 : 1;
    return [h[0] + side * (h[2] + h[2] * 0.20 * 0.55), h[1] + h[3] - 0.0150 * sc];
  },
  // the way out of the lantern that wakes the village: from eave to eave it goes, lighting each little lantern
  lightVillage() {
    if (this.villageDone) return; this.villageDone = true;
    const L = this.lantern(this.t);
    this.hops = this.houses.map((h, i) => i).sort((a, b) => Math.abs(this.eavePos(a)[0] - L[0]) - Math.abs(this.eavePos(b)[0] - L[0])).slice(0, 4);
    this.hero.mode = 'hop'; this.hero.v = [0, 0];
  },
  update(dt) {
    this.t += dt;
    if (!this.eave) this.eave = new Float32Array(32);
    for (let i = 0; i < 8; i++) if (this.eaveOn && this.eaveOn[i]) this.eave[i * 4] = Math.min(1, this.eave[i * 4] + dt / 0.35);
    // the eye follows the light across the print (the film): close in while it drifts down and goes from eave to eave
    // through the village (the people, the windows lighting); back out to the whole sheet for the moon. It never jumps:
    // it leans after the light
    if (this.paintK > 0 && this.hero.mode !== 'paint') this.paintK = Math.max(0, this.paintK - dt / 0.6);
    if (this.panX !== undefined) {
      const H = this.hero, painting = H.mode === 'paint' || this.paintK > 0;
      const close = painting ? 0.86 : H.mode === 'hop' ? 0.46 : (H.mode === 'fall' || H.mode === 'enter') ? 0.60 : 0.86;
      const z = this.panZ = (this.panZ ?? 0.84) + (close - (this.panZ ?? 0.84)) * (1 - Math.exp(-dt * 1.1));
      const half = 0.5 * Math.min(1.6, YL.canvasAspect() * Math.min(1, 1.6 / YL.canvasAspect())) * z;   // half the width on screen
      const tx = painting ? 0.80 : Math.max(half, Math.min(1.6 - half, H.p[0] * 0.85 + 0.90 * 0.15));
      this.panX += (tx - this.panX) * (1 - Math.exp(-dt * 1.4));
      const ty = painting ? 0.49 : 0.49 + (H.p[1] - 0.49) * 0.6 * YL.smooth(0.84, 0.50, z), hv = 0.5 * Math.min(1, 1.6 / YL.canvasAspect()) * z;
      this.panY = (this.panY ?? 0.49) + (Math.max(hv, Math.min(1 - hv, ty)) - (this.panY ?? 0.49)) * (1 - Math.exp(-dt * 1.4));
      this.whole = true;
    }
    if (this.stroke && !YL.ptrDown) this.endStroke();
    if (this.hero.path && !this.hero.pathL) this.hero.pathL = this.hero.path.L || pathLength(this.hero.path);
    if (this.hero.mode === 'out' && this.hero.path && this.hero.path.L) this.hero.pathL = this.hero.path.L;
    this.heroUpdate(dt);
    this.sound(dt);
  },
  // draw rows [y0, y1) of one printing (frame number f) into ink buffer k
  printRows(k, f, aspect, y0, y1) {
    const gl = YL.gl, U = YL.U, ink = this.inks[k], w = ink.w, h = ink.h, tq = f / FPS;
    const view = this.view(aspect, tq), pS = this.pScene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, ink.fb); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, y0, w, y1 - y0);
    gl.useProgram(pS.p);
    U(pS, 'uRes', [w, h]); U(pS, 'uView', view); U(pS, 'uPx', view[2] / h); U(pS, 'uBoil', YL.reduced ? 0 : f % 4); U(pS, 'uTime', tq);
    gl.uniform4fv(pS.u.uBr, this.trBuf); gl.uniform4fv(pS.u.uBrR, this.trR); gl.uniform1i(pS.u.uBrN, this.tree.length); U(pS, 'uTreeBox', this.treeBox);
    this.lit.forEach((v, i) => { this.hB[i * 4 + 2] = v; });
    gl.uniform4fv(pS.u.uHA, this.hA); gl.uniform4fv(pS.u.uHB, this.hB);
    U(pS, 'uLan', this.lantern(tq));
    const lf = this.life(tq), fg = new Float32Array(12);
    lf.figs.forEach((q, i) => fg.set(q, i * 4));
    gl.uniform4fv(pS.u.uFig, fg); U(pS, 'uDog', lf.dog); U(pS, 'uCrow', lf.crow);
    gl.uniform4fv(pS.u.uEave, this.eave || new Float32Array(32));
    YL.drawFull();
    gl.disable(gl.SCISSOR_TEST);
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    this.targets(w, h);
    const frame = Math.floor(this.t * FPS);
    // The blocks are heavy to cut; the paper is cheap to print. So each printing is drawn ahead, a strip per screen frame,
    // into the buffer that isn't on show, and swapped in on its tick. (Stills, and any jump, draw it whole.)
    const whole = YL.DBG.still || this.whole || this.aspect !== aspect || this.shown < 0 || frame !== this.shown + 1 && frame !== this.shown;
    this.aspect = aspect;
    if (whole) {
      if (frame !== this.shown || YL.DBG.still || this.whole) { this.printRows(this.front, frame, aspect, 0, h); this.shown = frame; this.next = null; }
    } else if (frame !== this.shown) {
      const back = 1 - this.front;
      if (!this.next || this.next.f !== frame) this.next = { f: frame, row: 0 };
      if (this.next.row < h) this.printRows(back, frame, aspect, this.next.row, h);
      this.front = back; this.shown = frame; this.next = null;
    }
    if (!whole && !this.next) this.next = { f: this.shown + 1, row: 0 };
    if (this.next && this.next.row < h) {
      const rows = Math.ceil(h / 6);
      this.printRows(1 - this.front, this.next.f, aspect, this.next.row, Math.min(h, this.next.row + rows));
      this.next.row += rows;
    }
    // printing the three blocks onto the paper, each a little off register; the flame, the knife's cuts, on top
    const view = this.view(aspect, this.shown / FPS);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    const pP = this.pPrint;
    gl.useProgram(pP.p);
    U(pP, 'uRes', [w, h]); U(pP, 'uView', view); U(pP, 'uBoil', YL.reduced ? 0 : this.shown % 4); U(pP, 'uFade', this.fade); U(pP, 'uPx', view[2] / h); U(pP, 'uTime', this.t);
    const j = (k) => YL.reduced ? 0 : 0.00025 * (((this.shown * 7 + k * 13) % 5) / 2 - 1);       // each printing lands a hair differently
    const reg = (dx, dy) => [(dx + j(1)) / (view[2] * w / h), (dy + j(2)) / view[2]];
    U(pP, 'uRegB', reg(0.0014, -0.0010)); U(pP, 'uRegR', reg(-0.0011, 0.0013));
    const sz = Math.min(0.075 * h, 0.09 * w);
    U(pP, 'uSealBox', [1 - (sz + 0.03 * h) / w, 0.035, sz / w, sz / h]);
    U(pP, 'uShow', this.show);
    const H = this.hero, vis = H.mode === 'fall' || H.mode === 'out' || H.mode === 'leave' || H.mode === 'hop' || H.mode === 'paint' ? 1 : H.mode === 'enter' ? 1 - YL.smooth(0, 0.6, H.k) : H.mode === 'sink' ? 1 - H.k : 0;
    const br = 1 + 0.07 * Math.sin(this.t * 2.1) + 0.03 * Math.sin(this.t * 5.3);
    U(pP, 'uHero', [H.p[0], H.p[1], H.size * br * (H.mode === 'sink' ? 1 - 0.7 * H.k : 1), vis]);
    const tr = new Float32Array(64).fill(-1);
    this.trail.forEach((p, i) => tr.set([p[0], p[1], this.t - p[2], 0], i * 4));
    if (vis > 0 && this.trail.length) tr.set([H.p[0], H.p[1], 0, 0], this.trail.length * 4 < 64 ? this.trail.length * 4 : 60);
    gl.uniform4fv(pP.u.uTrail, tr);
    const pf = new Float32Array(48);
    this.puff.forEach((f, i) => { if (i < 12) pf.set([f.p[0], f.p[1], f.r * Math.min(1, f.life * 2), 0], i * 4); });
    gl.uniform4fv(pP.u.uPuff, pf);
    YL.bindTex(pP, 'uInk', this.inks[this.front].tex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.seal); gl.uniform1i(pP.u.uSeal, 1);
    YL.bindTex(pP, 'uCarve', this.carve.tex, 2);
    if (this.rev) {
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.rev.tex);
      if (this.rev.dirty) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.rev.cv); this.rev.dirty = false; }
      gl.uniform1i(pP.u.uRev, 3);
    }
    U(pP, 'uPaint', this.paintK || 0);
    YL.drawFull();
  },
};
})();
