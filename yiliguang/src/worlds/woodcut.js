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
      float shade = lines(q.x, 1.0, q.y, 0.0020, 1.0 - 0.45 * smoothstep(0.35, 1.0, mer), 121.0) * step(0.3, mer);
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
uniform vec2 uRegB, uRegR;   // where the indigo and vermilion blocks landed, relative to the key block (uv)
uniform float uBoil;
uniform sampler2D uSeal;
uniform vec4 uSealBox;       // the seal's place on screen (uv): x0, y0, size x, size y
uniform float uFade;
out vec4 o;
const vec3 PAPER = vec3(0.935, 0.905, 0.835);
const vec3 AI    = vec3(0.150, 0.250, 0.450);
const vec3 SUMI  = vec3(0.070, 0.064, 0.074);
const vec3 SHU   = vec3(0.860, 0.300, 0.165);
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
  // the seal, red, its edges worn
  vec2 sq = (uv - uSealBox.xy) / uSealBox.zw;
  if (sq.x > 0.0 && sq.x < 1.0 && sq.y > 0.0 && sq.y < 1.0){
    float s = texture(uSeal, vec2(sq.x, 1.0 - sq.y)).r;
    s *= step(0.18, vnoise(sq * 38.0) + 0.3 * vnoise(sq * 9.0));
    c = mix(c, c * SHU / PAPER, s * 0.95);
  }
  o = vec4(c * uFade, 1.0);
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

const FPS = 8;            // the print's own frame rate: the world is re-printed eight times a second
W.woodcut = {
  ready: false, t: 0, fade: 1, vol: 1,
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.pScene = YL.makeProgram('woodcut-scene', VS, FS_SCENE); YL.checkProgram(this.pScene);
    this.pPrint = YL.makeProgram('woodcut-print', VS, FS_PRINT); YL.checkProgram(this.pPrint);
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
    this.hA = new Float32Array(32); this.hB = new Float32Array(32);
    H.forEach((h, i) => { this.hA.set(h.slice(0, 4), i * 4); this.hB.set(h.slice(4), i * 4); });
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeSeal());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.seal = tex;
    this.t = +(YL.QS.get('wt') || 0);
    this.ready = true;
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
    return [0.80 - 0.06 * narrow + pan, 0.5, s];
  },
  // where the lantern hangs at a given moment
  lantern(t) {
    const sway = 0.05 * Math.sin(t * 0.9) + 0.02 * Math.sin(t * 2.3 + 1);
    const piv = [0.618, 0.553], cord = 0.075;
    return [piv[0] + Math.sin(sway) * cord, piv[1] - Math.cos(sway) * cord, this.lanLight ?? 1, sway];
  },
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
    this.snd = { ctx, bus, wet, wl, wg, nextBell: 6 + Math.random() * 6, nextSlide: 14 + Math.random() * 10 };
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
  // snow sliding off a roof somewhere: a soft hush and a muffled thump
  slide() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.02;
    const n = ctx.createBufferSource(); n.buffer = this.noise || (this.noise = (() => { const L = ctx.sampleRate * 2, b = ctx.createBuffer(1, L, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < L; i++) d[i] = Math.random() * 2 - 1; return b; })());
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t0); f.frequency.exponentialRampToValueAtTime(180, t0 + 1.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.03, t0 + 0.5); g.gain.linearRampToValueAtTime(0.05, t0 + 1.1); g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.7);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    n.connect(f); f.connect(g); if (p) { p.pan.value = Math.random() * 1.4 - 0.7; g.connect(p); p.connect(S.bus); } else g.connect(S.bus);
    g.connect(S.wet);
    n.start(t0); n.stop(t0 + 1.8);
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.8);
    const br = 0.5 + 0.5 * Math.sin(this.t * 0.21) * Math.sin(this.t * 0.083 + 1);
    S.wg.gain.setTargetAtTime(0.03 + 0.05 * br, now, 1.0);
    S.wl.frequency.setTargetAtTime(220 + 260 * br, now, 1.0);
    if ((S.nextBell -= dt) <= 0) { this.bell(); S.nextBell = 24 + Math.random() * 14; }
    if ((S.nextSlide -= dt) <= 0) { this.slide(); S.nextSlide = 18 + Math.random() * 20; }
  },
  update(dt) {
    this.t += dt;
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
    U(pS, 'uRes', [w, h]); U(pS, 'uView', view); U(pS, 'uPx', view[2] / h); U(pS, 'uBoil', f % 4); U(pS, 'uTime', tq);
    gl.uniform4fv(pS.u.uBr, this.trBuf); gl.uniform4fv(pS.u.uBrR, this.trR); gl.uniform1i(pS.u.uBrN, this.tree.length); U(pS, 'uTreeBox', this.treeBox);
    gl.uniform4fv(pS.u.uHA, this.hA); gl.uniform4fv(pS.u.uHB, this.hB);
    U(pS, 'uLan', this.lantern(tq));
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
    // printing the three blocks onto the paper, each a little off register
    const tq = this.t;
    const view = this.view(aspect, this.shown / FPS);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    const pP = this.pPrint;
    gl.useProgram(pP.p);
    U(pP, 'uRes', [w, h]); U(pP, 'uView', view); U(pP, 'uBoil', this.shown % 4); U(pP, 'uFade', 1);
    const j = (k) => 0.00025 * (((this.shown * 7 + k * 13) % 5) / 2 - 1);       // each printing lands a hair differently
    const reg = (dx, dy) => [(dx + j(1)) / (view[2] * w / h), (dy + j(2)) / view[2]];
    U(pP, 'uRegB', reg(0.0014, -0.0010)); U(pP, 'uRegR', reg(-0.0011, 0.0013));
    const sz = Math.min(0.075 * h, 0.09 * w);
    U(pP, 'uSealBox', [1 - (sz + 0.03 * h) / w, 0.035, sz / w, sz / h]);
    YL.bindTex(pP, 'uInk', this.inks[this.front].tex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.seal); gl.uniform1i(pP.u.uSeal, 1);
    YL.drawFull();
  },
};
})();
