/* ============================================================================
   世界五 · 海 —— 透明水彩
   ----------------------------------------------------------------------------
   珠从皮影的浪线落下去，下面是一张湿着的水彩：
   · 颜料是「吸收」：每一层都是乘上去的（Beer–Lambert），颜色越叠越深、越透；纸的白就是光。
   · 水是湿画法一大片：青、天蓝、群青互相渗，深处一点紫；干了以后又罩了一层，边是硬的、带一道深线；
     有水渍（回流的花边），撒过盐（小白星）；光从上面一条条「洗」出来。
   · 海带、成群的小鱼、几只橙色的小鱼、水母、气泡；一头座头鲸：深背浅腹，喉褶，白色的长鳍，藤壶，眼睛。
   · 珠是这里唯一的暖色：四周的颜料被提掉，留出纸白，一圈藤黄晕开。
   · 后来一只鱿鱼受惊，喷出一团墨：墨在湿纸里炸开、羽化，越来越大，颜色被它吃掉——水墨。
   坐标：海的单位 = 一个画面高（缩放 1 时）；海面在 y = 0，往下是负的。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const HEAD = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime;
out vec4 o;
#define PI 3.14159265
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
const mat2 FR = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = FR * p + vec2(1.7, 9.2); a *= 0.5; } return s / 0.96875; }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = FR * p + vec2(1.7, 9.2); a *= 0.5; } return s / 0.875; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdEll(vec2 p, vec2 r){ float k = length(p / r); return (k - 1.0) * min(r.x, r.y); }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
float paperH(vec2 px){
  float h = 0.55 * vnoise(px * 0.35) + 0.30 * vnoise(px * 0.9 + 3.1) + 0.15 * vnoise(px * 2.3 + 7.7);
  float f = vnoise(vec2(px.x * 0.04 + px.y * 0.012, px.y * 0.6) + 11.0);
  h += 0.10 * smoothstep(0.72, 0.9, f);
  return h;
}
float wash(float d, float soft, float rim, float rimW){
  float cov = smoothstep(soft, -soft, d);
  float r = 1.0 + rim * exp(-max(-d, 0.0) / rimW);
  return cov * r;
}
float rough(vec2 p, float f, float a, float seed){ return (fbm3(p * f + seed) - 0.5) * a; }
const vec3 CERU = vec3(0.60, 0.22, 0.10);
const vec3 TURQ = vec3(1.05, 0.25, 0.22);
const vec3 ULTR = vec3(0.80, 0.69, 0.16);
const vec3 INDI = vec3(0.80, 0.73, 0.54);
const vec3 SAPG = vec3(0.48, 0.25, 0.92);
const vec3 ROSE = vec3(0.08, 0.60, 0.36);
const vec3 VIOL = vec3(0.40, 0.75, 0.20);
const vec3 GAMB = vec3(0.02, 0.20, 0.92);
const vec3 SIEN = vec3(0.22, 0.60, 0.92);
const vec3 ORAN = vec3(0.05, 0.60, 1.39);
const vec3 SUMI = vec3(1.55, 1.50, 1.40);
const vec3 PAPER = vec3(0.965, 0.952, 0.915);
`;
const FS = HEAD + `
uniform vec2 uCam; uniform float uZoom;
uniform vec2 uPearl; uniform float uPearlB;
uniform vec4 uWhale;          // whale: centre xy, length, heading
uniform vec4 uWhaleB;         // its eye's lid (1 open), its flipper's beat phase, how close the eye is looked at, -
uniform vec4 uSquid;          // squid: x, y, size, heading
uniform vec4 uSquidB;         // shown, its jet (0 … 1), -, -
uniform vec4 uInk;            // the ink: where, how far it has spread, how much of the colour is gone
uniform float uSurf;          // how much of the bright surface water shows above (in the entry)
// a bloom (backrun): water crept back into a drying wash and pushed the pigment out to a cauliflower edge
// returns (inside-lift, edge)
vec2 bloom(vec2 p, vec2 c, float r, float seed){
  vec2 d = p - c;
  float a = atan(d.y, d.x);
  float rr = r * (1.0 + 0.22 * (fbm3(vec2(cos(a), sin(a)) * 2.5 + seed) - 0.5) + 0.10 * (vnoise(vec2(a * 9.0, seed)) - 0.5));
  float e = length(d) - rr;
  e += 0.006 * (vnoise(p * 140.0 + seed) - 0.5);         // the fractal edge
  float inside = smoothstep(0.004, -0.02, e);
  float edge = exp(-pow(e / 0.0045, 2.0)) * 0.9 + exp(-max(e, 0.0) / 0.010) * step(0.0, e) * 0.25;
  return vec2(inside, edge);
}
// ---- giant kelp: a thin stipe swaying, with long blades streaming off it, each a glaze of its own (so they darken
// where they overlap), golden where the light comes through them and sienna where it does not
float kelpFrond(vec2 p, float x0, float top, float sc, float ph, float sway, out float lit){
  float dens = 0.0; lit = 0.0;
  float base = -1.1;
  // the stipe's centre at height y
  #define CX(y) (x0 + sway * pow(clamp(((y) - base) / (top - base), 0.0, 1.0), 1.6) * sin((y) * 2.4 + uTime * 0.5 + ph) + 0.012 * sin((y) * 7.0 + ph * 2.0 + uTime * 0.9))
  if (p.y > top + 0.25 || p.y < base - 0.02 || abs(p.x - x0) > 0.35) return 0.0;
  float stipe = abs(p.x - CX(p.y)) - 0.0028 * sc;
  dens += wash(stipe + step(top, p.y), 0.0015, 0.6, 0.003) * 0.9 * smoothstep(base, base + 0.35, p.y);
  for (int i = 0; i < 14; i++){
    float fi = float(i);
    float y0 = base + 0.12 + fi * (top - base) / 14.0;
    if (abs(p.y - y0) > 0.28 * sc) continue;
    float side = mod(fi, 2.0) * 2.0 - 1.0;
    vec2 a = vec2(CX(y0), y0);
    // the blade streams upward and out, bending with the swell
    float ang = side * (0.55 + 0.25 * sin(uTime * 0.7 + fi + ph)) ;
    vec2 dir = vec2(sin(ang), cos(ang));
    vec2 q = p - a;
    float along = dot(q, dir), across = dot(q, vec2(dir.y, -dir.x));
    float L = (0.20 + 0.06 * hash11(fi + ph)) * sc;
    float u = along / L;
    // it curves: the far end bends back toward the stipe
    across += side * 0.05 * sc * u * u;
    across += 0.006 * sc * sin(u * 18.0 + ph + fi);          // ruffled edge
    float wdt = 0.032 * sc * sin(clamp(u, 0.0, 1.0) * PI) * (0.6 + 0.4 * (1.0 - u));
    float d = max(abs(across) - wdt, max(-along, along - L));
    d += rough(p, 30.0, 0.004, fi + ph);
    float b = wash(d, 0.0016, 0.85, 0.006);
    // the float at the blade's foot
    float fl = length(q - dir * 0.012 * sc) - 0.009 * sc;
    b += wash(fl, 0.0015, 0.7, 0.004) * 0.8;
    dens += b * (0.75 + 0.35 * vnoise(vec2(along * 60.0, across * 300.0)));      // veining along the blade
    lit = max(lit, b * smoothstep(-0.2, 0.4, p.y) * (0.5 + 0.5 * u));
  }
  return dens;
}
// ---- a sea nettle: a domed bell, glowing through; four long frilled arms and fine tentacles streaming behind
void jelly(vec2 p, vec2 c, float s, float tilt, float ph, inout vec3 K, inout float liftOut){
  float pulse = 0.5 + 0.5 * sin(uTime * 1.8 + ph);
  vec2 q = rot(tilt) * (p - c) / s;
  q.x *= 1.0 + 0.10 * pulse; q.y *= 1.0 - 0.08 * pulse;
  if (length(q) > 3.6) return;
  float hem = 0.025 * sin(atan(q.x, 0.3) * 18.0);
  float bell = max(sdEll(q, vec2(0.62, 0.48)), -(q.y + 0.06 + hem));
  bell += rough(q, 8.0, 0.05, ph);
  // the bell is laid wet: pale in the middle where it glows, the pigment pooled to its rim
  float b = wash(bell, 0.02, 1.4, 0.08);
  float glowIn = smoothstep(0.1, -0.4, bell) * smoothstep(-0.3, 0.3, q.y);
  // radial ribs on the dome
  float rib = smoothstep(0.75, 1.0, cos(atan(q.x, q.y + 0.4) * 16.0)) * smoothstep(0.0, -0.1, bell) * 0.5;
  // arms: frilled ribbons, long, curling
  float arms = 0.0;
  for (int i = 0; i < 4; i++){
    float fi = float(i) - 1.5;
    float yy = -q.y - 0.05;
    if (yy < 0.0) continue;
    float cx = fi * 0.10 + 0.16 * sin(yy * 2.2 - uTime * 1.1 + ph + fi * 1.7) * smoothstep(0.0, 0.8, yy);
    float w = 0.05 * (0.7 + 0.3 * sin(yy * 26.0 + fi * 2.0)) * smoothstep(2.6, 0.3, yy);
    arms += wash(abs(q.x - cx) - w + rough(q, 16.0, 0.02, fi + ph), 0.012, 0.7, 0.03);
  }
  float tl = 0.0;
  for (int i = 0; i < 8; i++){
    float fi = float(i) / 7.0 - 0.5;
    float yy = -q.y - 0.04;
    if (yy < 0.0) continue;
    float cx = fi * 1.15 + 0.22 * sin(yy * 1.4 - uTime * 0.9 + ph + fi * 5.0) * smoothstep(0.0, 1.2, yy);
    float len = 2.2 + 0.9 * hash11(float(i) * 1.7 + ph);
    float th = 0.010 * (1.0 - yy / len);
    tl += smoothstep(th + 0.006, th, abs(q.x - cx)) * step(yy, len) * (0.5 + 0.5 * vnoise(vec2(yy * 14.0, fi * 9.0)));
  }
  K += (ROSE * 0.85 + GAMB * 0.15) * b * (1.0 - 0.75 * glowIn) * 0.75 + VIOL * rib * 0.25 + (ROSE * 0.7 + SIEN * 0.25) * arms * 0.65 + (ROSE * 0.5 + VIOL * 0.3) * tl * 0.5;
  liftOut = max(liftOut, glowIn);
}
// ---- a fish: a dart-shaped dab with a forked tail
float fish(vec2 q, float len){
  q /= len;
  float body = sdEll(q, vec2(0.5, 0.17));
  vec2 tq = q - vec2(-0.56, 0.0);
  float tail = max(abs(tq.y) - 0.22 * (1.0 + tq.x * 4.5), abs(tq.x + 0.05) - 0.10);
  return min(body, tail) * len;
}

// ---- the humpback, side on: a long granulating wash of indigo and sienna, dark along the back and lifted to warm
// grey under the belly, the pleats of the throat, a white wing of a flipper, knobs and barnacles, the eye
// its profile, from a humpback's proportions: half-heights above and below the spine, at u = 0, 0.1, ... 1.0
const float RD[11] = float[11](0.014, 0.046, 0.072, 0.090, 0.100, 0.100, 0.092, 0.074, 0.050, 0.028, 0.013);
const float RV[11] = float[11](0.012, 0.064, 0.104, 0.122, 0.124, 0.110, 0.088, 0.062, 0.038, 0.022, 0.013);
float prof(float u, bool up){
  float x = clamp(u, 0.0, 1.0) * 10.0;
  int i = int(min(floor(x), 9.0)); float f = x - float(i);
  int i0 = max(i - 1, 0), i2 = min(i + 1, 10), i3 = min(i + 2, 10);
  float a0 = up ? RD[i0] : RV[i0], a1 = up ? RD[i] : RV[i], a2 = up ? RD[i2] : RV[i2], a3 = up ? RD[i3] : RV[i3];
  // Catmull-Rom
  return 0.5 * ((2.0 * a1) + (-a0 + a2) * f + (2.0 * a0 - 5.0 * a1 + 4.0 * a2 - a3) * f * f + (-a0 + 3.0 * a1 - 3.0 * a2 + a3) * f * f * f);
}
float wOff(float u){ return 0.030 * u * u * u * sin(6.2832 * u * 0.6 - uTime * 1.0); }
void whale(vec2 p, vec4 Wh, float far, vec2 pearl, inout vec3 K, inout float body){
  vec3 Kw = K;
  float L = Wh.z;
  vec2 q = rot(-Wh.w) * (p - Wh.xy) / L;
  if (abs(q.x) > 0.72 || abs(q.y) > 0.5) return;
  float u = q.x + 0.5;
  float v = q.y - wOff(u);
  float rd = prof(u, true), rv = prof(u, false);
  rd += 0.010 * smoothstep(0.035, 0.0, abs(u - 0.66 - 0.6 * max(v - rd, 0.0)));          // the little dorsal fin
  float d = (v > 0.0 ? v - rd : -v - rv);
  d = smax(d, -(u + 0.004), 0.02);
  // the flukes, seen a little from above: two swept blades off the tail stock, beating with it
  vec2 R = vec2(0.93, wOff(0.93));
  float tAng = atan(wOff(1.0) - wOff(0.86), 0.14) * 1.6;
  vec2 fq = rot(-tAng) * (vec2(u, q.y) - R);
  float bladeA = sdSeg(fq, vec2(0.0), vec2(0.085, 0.075)) - 0.020 * (1.0 - clamp(dot(fq, vec2(0.085, 0.075)) / 0.0128, 0.0, 1.0)) - 0.004;
  float bladeB = sdSeg(fq, vec2(0.0), vec2(0.075, -0.060)) - 0.016 * (1.0 - clamp(dot(fq, vec2(0.075, -0.060)) / 0.0092, 0.0, 1.0)) - 0.003;
  float stock = max(abs(v) - 0.012, abs(u - 0.90) - 0.05);
  float flD = min(min(bladeA, bladeB), stock);
  d = smin(d, flD, 0.012);
  d += rough(q, 22.0, 0.003, 3.0);
  float dPx = d * L;
  float vSide = v / max(v > 0.0 ? rd : rv, 1e-3);
  float lost = smoothstep(-0.3, -0.9, vSide) * smoothstep(0.2, 0.7, fbm3(vec2(u * 9.0, 4.0)));      // where the belly melts into the water
  float bodyD = wash(dPx, mix(0.0015, 0.010, lost), 0.65 * (1.0 - lost), 0.007);
  float inB = smoothstep(0.002, -0.002, dPx);
  // counter-shading: dark back, the belly lifted, the two run together wet
  float vn = v / max(v > 0.0 ? rd : rv, 1e-3);                            // -1 belly .. +1 back
  float shade = smoothstep(-0.9, 0.7, vn + 0.25 * (fbm3(q * vec2(5.0, 12.0)) - 0.5));
  float dens = mix(0.10, 1.25, shade) * (0.80 + 0.40 * fbm3(q * vec2(5.0, 16.0) + 1.0));
  dens *= 0.85 + 0.30 * fbm3(vec2(u * 40.0, vn * 3.0) + 4.0);                   // the brush went along the body
  dens += 0.35 * smoothstep(0.55, 0.8, fbm3(q * 7.0 + 21.0)) * shade;          // pigment dropped in wet
  // white scars: thin scratches, mostly on the back half
  float sc1 = abs(fract(u * 9.0 + vn * 1.5 + 0.3 * fbm3(q * 8.0)) - 0.5);
  dens *= 1.0 - 0.6 * smoothstep(0.03, 0.0, sc1) * step(0.72, hash12(vec2(floor(u * 9.0 + vn * 1.5), 3.0))) * smoothstep(0.35, 0.8, u) * smoothstep(-0.2, 0.3, vn);
  // the light from above lifted out along the upper flank: a long pale streak following the body
  float streak = exp(-pow((vn - 0.35 - 0.12 * (fbm3(vec2(u * 6.0, 3.0)) - 0.5)) / 0.16, 2.0)) * smoothstep(0.03, 0.15, u) * smoothstep(0.85, 0.6, u);
  dens *= 1.0 - 0.38 * streak;
  // a second, darker glaze along the back, laid after the first dried: a wandering hard edge
  float ridge = vn - (0.62 + 0.25 * (fbm3(vec2(u * 7.0, 1.0)) - 0.5));
  dens += 0.40 * smoothstep(-0.02, 0.03, ridge) * (1.0 + 0.5 * exp(-max(ridge, 0.0) / 0.05)) * smoothstep(0.02, 0.08, u);
  // a bloom on the flank where water ran back in

  // the throat's pleats: pale lines parallel to the belly
  float pleatZone = smoothstep(0.02, 0.07, u) * smoothstep(0.52, 0.40, u) * smoothstep(-0.25, -0.55, vn);
  float pl = 0.5 + 0.5 * sin((vn + 1.0) * 26.0 + 2.5 * fbm3(q * 5.0));
  dens *= 1.0 - 0.55 * pleatZone * smoothstep(0.55, 0.95, pl);
  // the mouth: a long dark curve from the snout tip back and down, to under the eye
  float mouthV = -0.004 - 0.030 * smoothstep(0.0, 0.25, u);
  float mouth = abs(v - mouthV) * L;
  float mouthL = smoothstep(0.0016, 0.0005, mouth) * smoothstep(0.004, 0.02, u) * smoothstep(0.27, 0.22, u);
  // the eye, just above the corner of the mouth
  vec2 eyeP = vec2(0.245, -0.024);
  float eye = length((vec2(u, v) - eyeP) * vec2(1.0, 1.4)) * L;
  float eyeD = (smoothstep(0.0060, 0.0042, eye) + 0.45 * smoothstep(0.0110, 0.0085, eye) * smoothstep(0.0058, 0.0080, eye)) * 0.0;            // (the eye itself is drawn by bigEye, at every distance)
  // knobs along the head and barnacles on the chin: pale with a dark crescent
  vec2 bg = vec2(u, v) * 70.0;
  vec2 bi = floor(bg), bf = fract(bg) - 0.5;
  vec2 bo = (hash22(bi) - 0.5) * 0.5;
  float bs = 0.16 + 0.14 * hash12(bi + 2.0);
  float bh = hash12(bi + 7.0);
  float knobZone = smoothstep(0.20, 0.04, u) * smoothstep(0.1, 0.7, vn);
  float barnZone = smoothstep(0.17, 0.05, u) * smoothstep(-0.4, -0.85, vn);
  float bd = length(bf - bo) - bs;
  float isB = step(bh, 0.45 * knobZone + 0.6 * barnZone);
  dens *= 1.0 - 0.45 * smoothstep(0.03, -0.02, bd) * isB;
  dens += 0.6 * smoothstep(0.05, 0.0, abs(bd + 0.02)) * smoothstep(0.0, 0.3, bf.y - bo.y) * isB;
  float hueN = fbm3(vec2(u * 3.0, v * 6.0) + 11.0);
  vec3 wK = mix(INDI * 0.55 + ULTR * 0.55 + SIEN * 0.12, INDI * 0.6 + VIOL * 0.45 + SIEN * 0.2, smoothstep(0.35, 0.65, hueN));
  wK = mix(wK, INDI * 0.55 + TURQ * 0.35 + SIEN * 0.25, smoothstep(0.6, 0.95, u) * 0.7);
  // the flipper: long and white, knobbly along its leading edge, rowing slowly
  vec2 root = vec2(0.255, -rv * 0.55 + wOff(0.255));
  float fa = -0.80 + 0.18 * sin(uTime * 0.7);
  vec2 fd = rot(-fa) * (vec2(u, q.y) - root);
  float fu = fd.x / 0.31;
  float prof_ = pow(sin(PI * clamp(fu * 0.92 + 0.06, 0.0, 1.0)), 0.55) * (1.0 - 0.5 * clamp(fu, 0.0, 1.0));
  float wLead = 0.034 * prof_, wTrail = 0.022 * prof_;
  // the knobs along the leading edge: round scallops
  float knob = 0.0042 * sqrt(max(sin(fu * PI * 13.0), 0.0)) * smoothstep(0.05, 0.2, fu) * smoothstep(1.0, 0.8, fu);
  float flip = fd.y > 0.0 ? fd.y - wLead - knob : -fd.y - wTrail;
  flip = max(flip, max(-fd.x + 0.005, fd.x - 0.31));
  flip += rough(fd, 30.0, 0.002, 8.0);
  float fpx = flip * L;
  float flipD = wash(fpx, 0.0015, 1.3, 0.004);
  float flipIn = smoothstep(0.0015, -0.0015, fpx);
  vec3 add = wK * bodyD * dens + (INDI * 0.65 + SIEN * 0.15) * (mouthL * 1.1 + eyeD * 1.7) * inB;
  // over the body the flipper is lifted nearly to white, mottled; its leading edge darker
  float trail = smoothstep(0.0, -0.02, fd.y);
  vec3 flipK = (INDI * 0.20 + CERU * 0.15 + VIOL * 0.08) * flipD * (0.5 + 0.7 * fbm3(fd * 25.0)) * (0.5 + 0.9 * trail)
             + (INDI * 0.5 + ULTR * 0.2) * smoothstep(-0.005, 0.0, fpx) * flipIn * step(0.0, fd.y) * 0.8
             + (INDI * 0.6) * smoothstep(0.75, 0.9, fbm3(fd * 40.0 + 3.0)) * flipIn * 0.5;
  add = mix(add, flipK, flipIn);
  // the pearl's light on the flank: the paint lifted round it, warmed
  float pd = length(p - pearl);
  add *= 1.0 - 0.55 * exp(-pd / 0.09) * inB;
  add += GAMB * 0.25 * exp(-pd / 0.07) * inB;
  // the body is painted round, not over: inside it, the water's colour is mostly gone (a little stays: the water between us)
  float cov = max(clamp(bodyD, 0.0, 1.0) * smoothstep(0.004, -0.002, dPx + 0.004 * lost), flipIn);
  cov = max(cov, smoothstep(0.0015, -0.0015, dPx));
  vec3 inside = add + Kw * (0.22 + 0.5 * far);
  K = mix(Kw + add * (1.0 - cov), inside, cov);
  body = max(body, cov);
}

// ---- a squid, painted in rose and sienna, its chromatophores freckling it; arms trailing; the fins flapping
void squid(vec2 p, vec4 S, vec4 SB, inout vec3 K){
  if (SB.x <= 0.0) return;
  vec2 q = rot(-S.w) * (p - S.xy) / S.z;            // its mantle points along +x (it jets that way)
  if (length(q) > 2.6) return;
  float jet = SB.y;
  float mantle = sdEll(q - vec2(0.35, 0.0), vec2(0.62 * (1.0 - 0.10 * jet), 0.20 * (1.0 + 0.12 * jet)));
  float fin = sdEll(rot(0.0) * (q - vec2(0.80, 0.0)), vec2(0.18, 0.30 + 0.05 * sin(uTime * 6.0)));
  float head = sdEll(q - vec2(-0.30, 0.0), vec2(0.13, 0.15));
  float body = min(min(mantle, fin), head);
  float arms = 1e9;
  for (int i = 0; i < 6; i++){
    float fi = float(i) - 2.5;
    float x = -q.x - 0.38;
    if (x < 0.0) continue;
    float cy = fi * 0.040 * (1.0 + x * 1.4) + 0.05 * sin(x * 6.0 - uTime * 4.0 + fi);
    float w = 0.022 * (1.0 - x / 0.9);
    arms = min(arms, max(abs(q.y - cy) - w, x - 0.9 - 0.25 * step(abs(fi), 0.6)));
  }
  body = min(body, arms);
  body += rough(q, 18.0, 0.02, 4.0);
  float d = body * S.z;
  float b = wash(d, 0.0015, 0.8, 0.005);
  float spots = smoothstep(0.55, 0.75, vnoise(q * 26.0)) * step(d, 0.0);
  float eye = smoothstep(0.045, 0.030, length(q - vec2(-0.27, 0.05)));
  vec3 sK = (ROSE * 0.7 + SIEN * 0.45) * b * (0.7 + 0.3 * fbm3(q * 6.0)) + SIEN * 0.8 * spots + INDI * 1.2 * eye;
  K = mix(K, sK + K * 0.25, clamp(b, 0.0, 1.0) * SB.x);
}
// ---- the whale's eye, looked at close: folds of skin round it, the dark eye, a wet highlight, the pearl in it
void bigEye(vec2 p, vec2 c, float r, float lid, vec2 pearl, inout vec3 K){
  vec2 q = (p - c) / r;
  float d = length(q * vec2(1.0, 1.35));
  if (d > 9.0) return;
  // the folds: wrinkles running round the eye, drawn with a fine brush
  float fold = abs(fract(d * 1.6 - 0.15 * fbm3(q * 1.5)) - 0.5);
  float folds = smoothstep(0.06, 0.0, fold - 0.02) * smoothstep(1.3, 1.8, d) * smoothstep(7.0, 3.0, d);
  K += INDI * folds * 0.35 * (0.6 + 0.4 * vnoise(q * 3.0));
  // the lids
  float lidY = mix(0.02, 1.0, lid);
  float open = max(d - 1.0, abs(q.y) - 0.74 * lidY);
  float rim = smoothstep(0.10, 0.0, abs(d - 1.06)) * step(abs(q.y), 0.9);
  K += INDI * rim * 0.8;
  // the eye: nearly black, a ring of brown, the wet highlight lifted out, and the little warm pearl in it
  if (open < 0.0){
    vec3 eK = INDI * 2.1 + SIEN * 0.5;
    float iris = smoothstep(0.62, 0.80, d);
    eK = mix(eK, SIEN * 1.4 + INDI * 0.6, iris * 0.6);
    float hl = smoothstep(0.20, 0.08, length(q - vec2(-0.30, 0.32)));
    eK *= 1.0 - 0.85 * hl;
    vec2 pd = normalize(pearl - c + 1e-5) * 0.38;
    float warm = smoothstep(0.13, 0.03, length(q - pd));
    eK = mix(eK, GAMB * 0.3, warm);
    K = mix(K, eK, smoothstep(0.03, -0.03, open));
  }
}
void main(){
  vec2 px = gl_FragCoord.xy;
  vec2 s = (px - 0.5 * uRes) / uRes.y;
  vec2 p = s * uZoom + uCam;                   // the world, where the eye is
  vec3 K = vec3(0.0);
  // ===== the water
  vec2 w = s * uZoom * 0.8 + uCam * vec2(0.6, 1.0);
  float depth = -p.y;
  float m1 = fbm(w * vec2(1.1, 1.6) + vec2(3.0, uTime * 0.01));
  float m2 = fbm(w * vec2(1.6, 1.2) + vec2(9.0, 2.0));
  float m3 = fbm(w * 2.3 + 17.0);
  float streak = fbm(vec2(w.x * 0.9, w.y * 9.0) + 5.0);
  float dd = clamp(depth, 0.0, 4.0);
  float mot = mix(0.30, 0.14, smoothstep(0.8, 2.5, dd));
  float wd = 0.30 + 0.60 * min(dd, 1.0) + 0.16 * min(max(dd - 1.0, 0.0), 2.0) + mot * (m1 - 0.5) + 0.08 * (streak - 0.5);
  vec3 mixK = mix(TURQ * 0.85, CERU, smoothstep(0.35, 0.65, m1));
  mixK = mix(mixK, ULTR * 1.1, smoothstep(0.2, 1.0, dd) * smoothstep(0.35, 0.7, m2));
  mixK += VIOL * (0.25 * smoothstep(0.62, 0.8, m3) * smoothstep(0.3, 1.0, dd) + 0.10 * smoothstep(1.8, 4.0, dd));
  mixK = mix(mixK, CERU * 0.9 + TURQ * 0.25, 0.25 * smoothstep(1.2, 3.0, dd));
  K += mixK * wd;
  float gEdge = -0.60 - 0.22 * w.x + 0.14 * (fbm3(vec2(w.x * 2.3, 2.0)) - 0.5) + 0.05 * (fbm3(vec2(w.x * 9.0, 7.0)) - 0.5);
  float gd = gEdge - w.y;
  float g2 = smoothstep(-0.003, 0.006, gd) * (1.0 + 0.5 * exp(-max(gd, 0.0) / 0.008)) * (0.6 + 0.4 * fbm3(w * 3.0 + 2.0));
  K += (ULTR * 0.45 + CERU * 0.2) * g2 * (0.18 + 0.22 * clamp(dd, 0.0, 1.5));
  vec2 bl = bloom(w, vec2(-0.50, -0.92), 0.075, 1.0);
  K *= 1.0 - 0.16 * bl.x; K += ULTR * bl.y * 0.22;
  vec2 bl2 = bloom(w, vec2(0.62, -1.62), 0.055, 7.0);
  K *= 1.0 - 0.14 * bl2.x; K += ULTR * bl2.y * 0.18;
  // shafts of light from the surface, lifted out
  vec2 sun = vec2(-0.55, 1.35);
  vec2 rd = p - sun;
  float ang = atan(rd.x, -rd.y);
  float shafts = smoothstep(0.55, 0.95, vnoise(vec2(ang * 22.0 + uTime * 0.05, 0.5)));
  shafts += 0.6 * smoothstep(0.5, 0.9, vnoise(vec2(ang * 47.0 - uTime * 0.07, 3.5)));
  shafts *= exp(-max(depth - 0.1, 0.0) * 1.0) * (0.75 + 0.5 * vnoise(vec2(ang * 30.0, length(rd) * 3.0)));
  K *= 1.0 - 0.5 * clamp(shafts, 0.0, 1.2);
  // near the surface the light comes through in a net of caustic lines
  float caus = 1.0 - abs(vnoise(p * vec2(9.0, 14.0) + vec2(uTime * 0.3, 0.0)) * 2.0 - 1.0);
  K *= 1.0 - 0.35 * smoothstep(0.82, 0.97, caus) * exp(-max(depth, 0.0) / 0.25);
  // salt in the wet wash
  {
    vec2 sg = w * 46.0, si = floor(sg), sf = fract(sg) - 0.5;
    float h = hash12(si);
    float cluster = smoothstep(0.55, 0.75, fbm3(w * 2.2 + 31.0));
    if (h < 0.30 * cluster){
      vec2 o2 = (hash22(si + 4.0) - 0.5) * 0.5;
      vec2 sq = sf - o2;
      float sa = atan(sq.y, sq.x);
      float sr = length(sq) / (0.18 + 0.25 * hash12(si + 9.0));
      sr *= 1.0 + 0.35 * (vnoise(vec2(sa * 3.0, h * 50.0)) - 0.5);
      float salt = smoothstep(1.0, 0.25, sr) * smoothstep(0.2, 0.9, length(K));
      K *= 1.0 - 0.55 * salt; K += ULTR * 0.12 * smoothstep(0.85, 1.05, sr) * smoothstep(1.3, 1.05, sr) * step(0.01, salt + 0.01);
    }
  }
  // ===== far kelp (only near the surface)
  vec2 pf = s * uZoom + uCam * vec2(0.35, 0.7);
  float litf;
  float kfd = kelpFrond(pf, -0.80, 0.12 - 0.5, 0.75, 1.0, 0.06, litf) + kelpFrond(pf, 0.66, 0.20 - 0.5, 0.8, 4.0, 0.07, litf)
            + kelpFrond(pf, 0.86, -0.05 - 0.5, 0.65, 6.0, 0.05, litf);
  K += (TURQ * 0.5 + SAPG * 0.25 + ULTR * 0.35) * min(kfd, 2.0) * 0.32;
  // ===== a school of small silver fish, whirling
  vec2 sc = vec2(0.45, -0.85);
  vec2 sp = p - sc;
  float sr = length(sp * vec2(1.0, 1.7));
  float school = smoothstep(0.30, 0.14, sr) * smoothstep(0.02, 0.07, sr);
  if (school > 0.0){
    float a = atan(sp.y * 1.7, sp.x) - uTime * 0.25;
    vec2 polar = vec2(a * 11.0 / PI, sr * 44.0);
    vec2 cell = floor(polar), f = fract(polar) - 0.5;
    vec2 j = hash22(cell) - 0.5;
    if (hash12(cell + 3.1) < 0.62){
      float ta = atan(sp.y * 1.7, sp.x) + PI * 0.5;
      vec2 fq = rot(-ta) * (f - j * 0.4) * vec2(PI * sr * 2.0 / 11.0, 1.0 / 44.0);
      float fd = fish(fq, 0.016);
      float fdens = wash(fd, 0.0012, 0.6, 0.003) * school;
      K += (INDI * 0.7 + ULTR * 0.6) * fdens * 0.8;
      K *= 1.0 - 0.4 * smoothstep(0.004, 0.0, abs(fq.y + 0.0012)) * step(fd, 0.0) * school;
    }
  }
  // ===== jellyfish at their depths
  float jl = 0.0;
  jelly(p, vec2(-0.42, -0.55 + 0.02 * sin(uTime * 0.6)), 0.12, 0.25, 0.0, K, jl);
  jelly(p, vec2(0.30, -0.25), 0.06, -0.3, 2.0, K, jl);
  jelly(p, vec2(-0.10, -1.55), 0.05, 0.1, 4.0, K, jl);
  jelly(p, vec2(0.55, -3.2), 0.09, -0.2, 5.0, K, jl);
  jelly(p, vec2(-0.6, -3.9), 0.07, 0.3, 6.0, K, jl);
  // ===== the whale
  float wb = 0.0;
  if (uWhale.z > 0.0) whale(p, uWhale, 0.0, uPearl, K, wb);
  if (uWhale.z > 0.0){
    // its eye (in the whale's frame)
    vec2 eyeL = (vec2(0.245, -0.024) - vec2(0.5, 0.0)) * uWhale.z;
    vec2 eyeW = uWhale.xy + rot(uWhale.w) * eyeL;
    bigEye(p, eyeW, 0.0060 * uWhale.z, uWhaleB.x, uPearl, K);
  }
  // ===== near kelp, wet-on-dry (near the surface)
  vec2 pn = s * uZoom + uCam * vec2(1.15, 1.25);
  float litA, litB;
  float knd = kelpFrond(pn, -0.84, 0.32 - 0.55, 1.25, 0.3, 0.09, litA) + kelpFrond(pn, -0.64, 0.02 - 0.55, 1.0, 1.7, 0.07, litB);
  float lit = max(litA, litB);
  float kn2 = kelpFrond(pn, 0.80, 0.38 - 0.55, 1.3, 3.2, 0.09, litA);
  lit = max(lit, litA);
  K += mix(SIEN * 0.75 + SAPG * 0.55 + ULTR * 0.15, SAPG * 0.6 + GAMB * 0.55, clamp(lit, 0.0, 1.0)) * (knd + kn2) * 0.85;
  // ===== a few little orange fish about the pearl
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    vec2 c = uPearl + vec2(0.16 * cos(uTime * 0.35 + fi * 1.3) + 0.05 * fi - 0.1, 0.06 * sin(uTime * 0.5 + fi * 2.1) - 0.02 * fi + 0.03);
    float dirs = -sin(uTime * 0.35 + fi * 1.3) < 0.0 ? -1.0 : 1.0;
    vec2 q = (p - c) * vec2(dirs, 1.0);
    float fd = fish(q, 0.045 + 0.010 * hash11(fi));
    float fb = wash(fd + rough(p, 60.0, 0.002, fi), 0.0012, 0.8, 0.004);
    K = mix(K, (ORAN * 0.8 + SIEN * 0.15) * fb * 0.9 + K * 0.2, clamp(fb, 0.0, 1.0) * smoothstep(-1.2, -0.3, p.y));
  }
  // ===== the squid
  squid(p, uSquid, uSquidB, K);
  // ===== bubbles rising (near the surface, and a stream from where the pearl came in)
  for (int i = 0; i < 18; i++){
    float fi = float(i);
    float x = (hash11(fi * 3.7) - 0.5) * 1.7 + 0.02 * sin(uTime * 2.0 + fi) + uCam.x;
    float y = mod(hash11(fi * 1.3) * 2.4 + uTime * (0.05 + 0.04 * hash11(fi)), 2.4) - 2.0;
    float r = 0.003 + 0.008 * hash11(fi * 7.1);
    float d = length(p - vec2(x, y)) - r;
    K *= 1.0 - 0.7 * smoothstep(0.001, -0.002, d + r * 0.3);
    K += ULTR * wash(abs(d + r * 0.15) - r * 0.15, 0.001, 0.0, 0.01) * 0.5;
  }
  // ===== the ink: a cloud of sumi billowing in the water — a warped mass with folds, dense at its heart, thin and
  // see-through at its fringe, threads pulling out of it and curling; it swells until there is nothing else
  if (uInk.z > 0.0){
    float R = uInk.z;
    vec2 iq = (p - uInk.xy) / R;
    float tt = uTime * 0.12;
    vec2 wq = iq + 0.45 * vec2(fbm(iq * 1.8 + vec2(tt, 3.0)), fbm(iq * 1.8 + vec2(7.0, -tt))) - 0.22;
    wq += 0.18 * vec2(fbm(wq * 4.0 - tt * 1.3), fbm(wq * 4.0 + 5.0 + tt)) - 0.09;
    float n = fbm(wq * 3.0 + 11.0);
    float rr = length(wq * vec2(1.0, 1.2));
    float body = smoothstep(1.0, 0.45, rr + 0.55 * (n - 0.5));
    float folds = 0.75 + 0.5 * smoothstep(0.35, 0.75, fbm(wq * 7.0 + 2.0));
    float rid = 1.0 - abs(2.0 * fbm(wq * 6.5 + 4.0) - 1.0);
    float threads = pow(rid, 7.0) * smoothstep(1.7, 0.7, rr);
    float dens = max(body * folds, threads * 0.75);
    float edge = exp(-pow((rr + 0.55 * (n - 0.5) - 0.82) / 0.05, 2.0)) * 0.5;      // the drying edge, darker
    K = K * (1.0 - 0.6 * clamp(dens, 0.0, 1.0)) + SUMI * (dens * 1.35 + edge * body);
  }
  // the colour going out of everything as the ink takes it
  if (uInk.w > 0.0){
    float g = dot(K, vec3(0.33, 0.34, 0.33));
    K = mix(K, vec3(g) * vec3(1.02, 1.0, 0.96), uInk.w);
  }
  // ===== the pearl: the paper left white round it, a warm gamboge glaze blushing out
  vec2 pp = p - uPearl;
  float pr = length(pp) / uZoom;
  K *= 1.0 - 0.75 * exp(-pr / 0.13) * uPearlB;
  K += GAMB * (exp(-pr / 0.05) * 0.5 + exp(-pr / 0.18) * 0.12) * uPearlB;
  K *= 1.0 - 0.35 * jl;
  // ===== the paper: granulation, its tooth
  float ph = paperH(px);
  float gran = (vnoise(px * 0.55) - 0.5) * 0.6 + (vnoise(px * 1.6 + 5.0) - 0.5) * 0.35;
  float blueness = clamp(K.r - K.b, 0.0, 1.0);
  K *= 1.0 + 0.30 * (0.5 - ph) + (0.18 + 0.30 * blueness) * gran;
  vec3 col = PAPER * exp(-K);
  float hx = paperH(px + vec2(1.0, 0.0)) - ph, hy = paperH(px + vec2(0.0, 1.0)) - ph;
  col *= 1.0 + 0.12 * (hx * 0.7 + hy * 0.7);
  col += vec3(1.0, 0.86, 0.55) * (exp(-pr / 0.007) * 1.3 + exp(-pr / 0.03) * 0.28) * uPearlB;
  o = vec4(min(col, vec3(1.0)), 1.0);
}`;
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

W.sea = {
  ready: false, t: 0, vol: 1, fade: 1,
  cam: [0, 0], zoom: 1,
  pearl: [0, 0.1], pearlB: 1,
  whale: [9, 9, 0, 0], whaleB: [1, 0, 0, 0],
  squid: [9, 9, 0.12, 0], squidB: [0, 0, 0, 0],
  ink: [0, 0, 0, 0],
  init() {
    const gl = YL.gl;
    this.p = YL.makeProgram('sea', VS, FS); YL.checkProgram(this.p);
    this.empty = gl.createVertexArray();
    this.ready = true;
  },
  update(dt) { this.t += dt; this.sound(dt); },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.useProgram(p.p);
    U(p, 'uRes', [w, h]); U(p, 'uTime', this.t);
    U(p, 'uCam', this.cam); U(p, 'uZoom', this.zoom);
    U(p, 'uPearl', this.pearl); U(p, 'uPearlB', this.pearlB);
    U(p, 'uWhale', this.whale); U(p, 'uWhaleB', this.whaleB);
    U(p, 'uSquid', this.squid); U(p, 'uSquidB', this.squidB);
    U(p, 'uInk', this.ink);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  toNdc(q, aspect) { return [(q[0] - this.cam[0]) / this.zoom / (aspect * 0.5), (q[1] - this.cam[1]) / this.zoom / 0.5]; },
  /* ---- sound: under water. A low swell; the hiss of bubbles; the whale's song when it comes; a deep murmur */
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const brown = noiseBuffer(7.3, 'pink');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.7;
    const sw = ctx.createGain(); sw.gain.value = 0.10; loop(brown, 0.6, lp); lp.connect(sw); sw.connect(bus);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
    const bg = ctx.createGain(); bg.gain.value = 0.006; loop(brown, 1.3, bp); bp.connect(bg); bg.connect(bus);
    this.snd = { ctx, bus, sw, bg, ev: {}, nextBub: 0.3 };
  },
  bubble() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.01;
    const o = ctx.createOscillator(); const f = 500 + Math.random() * 900;
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.9, t0 + 0.05);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.012, t0 + 0.005); g.gain.setTargetAtTime(0, t0 + 0.01, 0.02);
    const pn = ctx.createStereoPanner(); pn.pan.value = Math.random() * 1.2 - 0.6;
    o.connect(g); g.connect(pn); pn.connect(S.bus); o.start(t0); o.stop(t0 + 0.2);
  },
  // the whale sings: a long falling moan, and a rising one
  song(a = 1) {
    const S = this.snd, ctx = S.ctx; let t0 = ctx.currentTime + 0.05;
    for (const [f0, f1, d] of [[310, 180, 2.4], [140, 260, 2.0]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const o2 = ctx.createOscillator(); o2.type = 'triangle';
      o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + d);
      o2.frequency.setValueAtTime(f0 * 2.01, t0); o2.frequency.exponentialRampToValueAtTime(f1 * 2.01, t0 + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05 * a, t0 + 0.5); g.gain.setTargetAtTime(0, t0 + d - 0.6, 0.3);
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(S.bus);
      o.start(t0); o2.start(t0); o.stop(t0 + d + 1); o2.stop(t0 + d + 1);
      t0 += d * 0.8;
    }
  },
  inkSound() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.01;
    const s = ctx.createBufferSource(); const sr = ctx.sampleRate, n = Math.floor(sr * 1.2), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.35));
    s.buffer = b; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain(); g.gain.value = 0.10; s.connect(lp); lp.connect(g); g.connect(S.bus); s.start(t0);
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.4);
    if ((S.nextBub -= dt) <= 0) { if (this.cam[1] > -1.5) this.bubble(); S.nextBub = 0.15 + Math.random() * 0.8; }
    if (this.whale[2] > 0 && !S.ev.song) { S.ev.song = 1; this.song(1); }
    if (this.ink[2] > 0.01 && !S.ev.ink) { S.ev.ink = 1; this.inkSound(); }
  },
};
})();
