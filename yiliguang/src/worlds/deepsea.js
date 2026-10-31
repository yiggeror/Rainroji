/* ============================================================================
   世界四 · 深海
   ----------------------------------------------------------------------------
   漆黑的水，没有上下。只有那一团暖光照亮的一小块水是看得见的：
   · 水按颜色吃光：红光一米就没了大半，绿和蓝走得远——近处是暖的，远一点就成了青蓝。
   · 光在水里散开：点光源的单次散射，沿视线用「等角采样」积分（前向散射的 HG 相函数），没有噪点。
   · 海雪：几千粒絮状的碎屑在光里慢慢飘过；离焦的变成虚的光斑（能量守恒地变暗）；少数是自己会闪的蓝色浮游生物。
   · 三只水母，全用解析的椭球求交（不是逐步步进），所以薄膜的边是锐的：
       海月水母   透明的伞一张一合；光穿过的路越长越亮，伞缘自然发亮；16 条辐射管、四瓣马蹄形的生殖腺、垂下的口腕
       栉水母     透明的长囊；八条栉板带被光照到时，彩虹沿着它一路流下去
       Atolla     深红的伞（红光到不了深处，离光远时它几乎是黑的）；伞缘一圈蓝色的生物光，像风车一样转
   · 触手是几何线条：海月水母伞缘一圈细短的触手，Atolla 一根长长拖着的触手。
   渲染：水与水母（全屏，HDR）→ 触手 → 海雪（实例化，加法混合）→ 色调映射、颗粒、暗角。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});

// the water and the light, shared by every pass
const COMMON = `
#define PI 3.14159265359
uniform vec3 uL;             // the light
uniform vec3 uLI;            // its intensity
uniform vec3 uL2;            // another light, just like it, out in the dark (an anglerfish's lure)
uniform vec3 uLI2;
const vec3 SIG_T = vec3(0.45, 0.13, 0.07);      // what a metre of this water takes away from the light: the red first, then the green
const vec3 SIG_V = vec3(0.10, 0.06, 0.045);      // … and on the way back to the eye (kept lighter: what the light touches keeps its warmth)
const float SIG_M = 0.030;                       // the coarse particles scatter every colour alike, mostly forward …
const vec3 SIG_R = vec3(0.004, 0.018, 0.075);    // … the fine stuff scatters blue most, every way
float sat(float x){ return clamp(x, 0.0, 1.0); }
float HG(float c, float g){ float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
// light arriving at x: inverse square, the water eating the red on the way
vec3 lightAt(vec3 x){
  vec3 d = uL - x; float r2 = dot(d, d);
  vec3 e = uLI * exp(-SIG_T * sqrt(r2)) / (r2 + 0.0009);
  if (uLI2.r > 0.0){ vec3 d2 = uL2 - x; float q2 = dot(d2, d2); e += uLI2 * exp(-SIG_T * sqrt(q2)) / (q2 + 0.0009); }
  return e;
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
`;

/* ---------------------------------------------------------------- the water, and the creatures in it */
const FS_SEA = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan;
uniform float uTime;
uniform vec4 uJP[3];         // creatures: centre (m), size (m)            — drawn far to near
uniform vec4 uJU[3];         //            up axis, pulse (0 relaxed … 1 contracted)
uniform vec4 uJK[3];         //            kind (0 moon jelly, 1 comb jelly, 2 Atolla), phase, alarm, -
uniform vec4 uSurf;          // the surface far above: its height (world y), how bright, how much the water is tea, -
uniform vec4 uWh;            // the whale: its eye (world), on/off
uniform vec4 uWhF;           //            which way it swims (unit), its blink
uniform vec4 uWhG;           //            where its eye looks (in its own frame)
out vec4 o;
` + COMMON + `
// ---- the light scattered toward the eye along [0, T]: equi-angular samples about the closest approach
vec3 inscatterFrom(vec3 L, vec3 LI, vec3 ro, vec3 rd, float T){
  vec3 lo = L - ro; float t0 = dot(lo, rd); float h = sqrt(max(dot(lo, lo) - t0 * t0, 1e-7));
  float ta = atan(-t0 / h), tb = atan((T - t0) / h);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++){
    float th = mix(ta, tb, (float(i) + 0.5) / 12.0);
    float t = t0 + h * tan(th);
    vec3 lx = ro + rd * t - L; float r = length(lx);
    float c = dot(lx / r, -rd);
    sum += exp(-SIG_T * r - SIG_V * t) * (SIG_M * HG(c, 0.85) + SIG_R * HG(c, 0.25));
  }
  return LI * sum / 12.0 * (tb - ta) / h;
}
vec3 inscatter(vec3 ro, vec3 rd, float T){
  vec3 c = inscatterFrom(uL, uLI, ro, rd, T);
  if (uLI2.r > 0.0) c += inscatterFrom(uL2, uLI2, ro, rd, T);
  return c;
}
// ---- ray against an axis-aligned ellipsoid (radii r) at the origin: entry, exit
vec2 ellip(vec3 ro, vec3 rd, vec3 r){
  vec3 oo = ro / r, d = rd / r;
  float a = dot(d, d), b = dot(oo, d), c = dot(oo, oo) - 1.0, h = b * b - a * c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2((-b - h) / a, (-b + h) / a);
}
vec2 isect(vec2 a, vec2 b){ return vec2(max(a.x, b.x), min(a.y, b.y)); }
float len(vec2 a){ return max(a.y - a.x, 0.0); }
// the slab above a plane y = y0 (local), as a ray interval
vec2 above(vec3 ro, vec3 rd, float y0){
  if (abs(rd.y) < 1e-6) return ro.y > y0 ? vec2(-1e9, 1e9) : vec2(1e9, -1e9);
  float t = (y0 - ro.y) / rd.y;
  return rd.y > 0.0 ? vec2(t, 1e9) : vec2(-1e9, t);
}
vec3 rainbow(float h){ return clamp(abs(fract(h + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }

// one creature: what it adds (already carried to the eye), what it lets through, how far away it is
struct Hit { vec3 c; float tr; float t; };
Hit creature(int k, vec3 ro, vec3 rd){
  Hit H = Hit(vec3(0.0), 1.0, 1e9);
  vec4 P = uJP[k], UU = uJU[k], KK = uJK[k];
  float s = P.w, pulse = UU.w, kind = KK.x;
  vec3 u = normalize(UU.xyz), a = normalize(cross(u, abs(u.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0))), b = cross(u, a);
  // into the creature's own frame, in units of its size (t stays in metres)
  vec3 rl = ro - P.xyz;
  vec3 o = vec3(dot(rl, a), dot(rl, u), dot(rl, b)) / s, d = vec3(dot(rd, a), dot(rd, u), dot(rd, b)) / s;
  // bounding sphere first
  float bb = dot(o, d), cc = dot(o, o) - 1.6 * 1.6, aa = dot(d, d);
  if (bb * bb - aa * cc < 0.0) return H;
  vec3 Ldir;
  if (kind == 0.0){
    // ---- moon jelly: a lens of clear jelly between the dome and the hollow beneath; open below the margin
    // a saucer: the dome's ellipsoid is cut well above its equator, so the margin is a thin sloping rim
    vec3 Ro = vec3(1.08 - 0.15 * pulse, 0.62 + 0.14 * pulse, 1.08 - 0.15 * pulse); vec3 co = vec3(0.0, -0.26, 0.0);
    vec3 Ri = Ro * vec3(0.93, 0.86, 0.93); vec3 ci = vec3(0.0, -0.33, 0.0);
    float ym = -0.04 - 0.06 * pulse;
    vec2 Io = isect(ellip(o - co, d, Ro), above(o, d, ym));
    vec2 Ii = isect(ellip(o - ci, d, Ri), Io);
    float th = (len(Io) - len(Ii)) * s;                        // metres of jelly along the ray
    if (len(Io) > 0.0){
      // the first surface: the dome, the margin, or the inside of the hollow
      float te = Io.x; vec3 n;
      vec3 pe = o + d * te;
      if (Ii.x <= te + 1e-4 && len(Ii) > 0.0){ te = Ii.y; pe = o + d * te; n = -normalize((pe - ci) / (Ri * Ri)); }
      else if (abs(pe.y - ym) < 1e-3) n = vec3(0.0, -1.0, 0.0);
      else n = normalize((pe - co) / (Ro * Ro));
      vec3 xe = ro + rd * te, xm = ro + rd * (0.5 * (Io.x + Io.y));
      float tm = 0.5 * (Io.x + Io.y);
      vec3 qm = o + d * tm;
      // radial canals and the ring canal, faintly denser jelly
      float phi = atan(pe.z, pe.x), rho = length(pe.xz) / (Ro.x * 0.92);
      float canal = smoothstep(0.975, 1.0, cos(16.0 * phi)) * smoothstep(0.15, 0.5, rho) * 0.3 + smoothstep(0.025, 0.0, abs(rho - 0.97)) * step(pe.y, 0.15) * 0.7;
      // the four horseshoe gonads, sampled through the bell
      float gon = 0.0;
      for (int i = 0; i < 10; i++){
        vec3 q = o + d * mix(Io.x, Io.y, (float(i) + 0.5) / 10.0);
        float best = 1e9;
        for (int j = 0; j < 4; j++){
          float ang = float(j) * 1.5708 + 0.785;
          vec2 cg = vec2(cos(ang), sin(ang)) * 0.30;
          vec2 r2 = q.xz - cg; float ring = length(r2) - 0.14;
          float open = dot(normalize(r2 + 1e-5), normalize(cg));               // the horseshoe opens outward
          float dd = length(vec2(ring, (q.y - 0.20 - 0.05 * pulse) * 1.5)) - 0.045;
          dd = max(dd, open - 0.82);
          best = min(best, dd);
        }
        gon += smoothstep(0.035, -0.02, best);
      }
      gon = gon / 10.0 * len(Io) * 3.0;
      vec3 E = lightAt(xm);
      Ldir = normalize(uL - xm);
      float fwd = HG(dot(-Ldir, rd), 0.55) * 4.0 * PI;                         // brighter seen against the light
      // clear jelly: it shows where the light's path through it is long (its rim) and where it is denser (canals)
      float dens = 1.0 - exp(-th * (2.2 + 14.0 * canal));
      float rim = smoothstep(0.035, 0.11, th);
      vec3 jelly = E * vec3(0.78, 0.88, 1.0) * dens * (0.06 + 0.16 * fwd) * (0.25 + 1.5 * rim);
      // the gonads: milky, pinkish, the brightest thing in it, soft-edged
      jelly += E * vec3(1.0, 0.70, 0.80) * (1.0 - exp(-gon * 1.6)) * (0.10 + 0.14 * fwd);
      // a glint where the light catches the curve of the bell
      vec3 Le = normalize(uL - xe);
      float F = 0.02 + 0.98 * pow(1.0 - abs(dot(n, -rd)), 5.0);
      jelly += lightAt(xe) * F * (pow(max(dot(reflect(rd, n), Le), 0.0), 60.0) * 2.5 + 0.05);
      H.c = jelly; H.tr = exp(-th * 2.0) * (1.0 - 0.35 * (1.0 - exp(-gon * 1.6))); H.t = te;
    }
  } else if (kind == 1.0){
    // ---- comb jelly: a clear sack, mouth open below; eight comb rows that break the light into rainbows
    vec3 Rb = vec3(0.46, 1.0, 0.42);
    vec2 I = isect(ellip(o, d, Rb), above(o, d, -0.82));
    if (len(I) > 0.0){
      vec2 Ii = isect(ellip(o - vec3(0.0, -0.08, 0.0), d, Rb * vec3(0.86, 0.90, 0.86)), I);
      float th = (len(I) - len(Ii)) * s;
      vec3 xm = ro + rd * (0.5 * (I.x + I.y));
      vec3 E = lightAt(xm);
      Ldir = normalize(uL - xm);
      float fwd = HG(dot(-Ldir, rd), 0.5) * 4.0 * PI;
      vec3 c = E * vec3(0.95, 0.88, 0.92) * (1.0 - exp(-th * 25.0)) * (0.10 + 0.25 * fwd) * (0.4 + 1.6 * smoothstep(0.004, 0.012, th));
      vec3 pe = o + d * I.x, ne = normalize(pe / (Rb * Rb));
      float Fe = pow(1.0 - abs(dot(ne, -normalize(d))), 4.0);
      c += lightAt(ro + rd * I.x) * vec3(0.85, 0.92, 1.0) * Fe * 0.22;
      // the comb rows, seen on the near wall and (fainter) through the jelly on the far one
      for (int side = 0; side < 2; side++){
        float tt = side == 0 ? I.x : I.y;
        vec3 q = o + d * tt;
        float phi = atan(q.z, q.x);
        float row = smoothstep(0.955, 1.0, cos(8.0 * phi)) * smoothstep(-0.78, -0.55, q.y) * smoothstep(0.92, 0.70, q.y);
        float beat = pow(0.5 + 0.5 * sin(q.y * 30.0 + uTime * 9.0 + KK.y), 3.0);           // the cilia beat in waves down each row
        vec3 x = ro + rd * tt;
        vec3 Lx = normalize(uL - x);
        // diffraction: the colour depends on the angle between the light and the eye, and runs down the row
        float hue = fract(dot(Lx, -rd) * 0.7 + q.y * 0.55 - uTime * 0.35 + floor(phi * 8.0 / 6.2832 + 0.5) * 0.06);
        c += lightAt(x) * mix(vec3(0.6), rainbow(hue), 0.85) * row * beat * (side == 0 ? 1.0 : 0.45) * 0.9;
      }
      H.c = c; H.tr = exp(-th * 4.0); H.t = I.x;
    }
  } else {
    // ---- Atolla: a deep red dome, crowned and furrowed; red is what the deep takes first, so far from the light it is black
    vec3 Ra = vec3(1.0, 0.44, 1.0);
    vec2 I = isect(ellip(o, d, Ra), above(o, d, -0.02));
    if (len(I) > 0.0){
      vec3 pe = o + d * I.x;
      vec3 n = normalize(pe / (Ra * Ra));
      float groove = smoothstep(0.03, 0.0, abs(length(pe.xz) - 0.62)) + 0.5 * smoothstep(0.8, 1.0, cos(atan(pe.z, pe.x) * 22.0)) * step(length(pe.xz), 0.6);
      vec3 xe = ro + rd * I.x;
      vec3 E = lightAt(xe);
      vec3 Le = normalize(uL - xe);
      float lam = max(dot(n, Le), 0.0) * 0.8 + 0.2;
      vec3 alb = vec3(0.50, 0.035, 0.05) * (1.0 - 0.5 * groove);
      vec3 c = E * alb * lam;
      float F = 0.02 + 0.98 * pow(1.0 - abs(dot(n, -rd)), 5.0);
      c += E * F * pow(max(dot(reflect(rd, n), Le), 0.0), 30.0) * 0.8;
      H.c = c; H.tr = 0.0; H.t = I.x;
    }
  }
  // carried to the eye through the water
  if (H.t < 1e8) H.c *= exp(-SIG_V * H.t);
  return H;
}
// Atolla's ring of blue light: a pinwheel of points running round its margin (it shines on its own, seen from anywhere)
vec3 atollaGlow(int k, vec3 ro, vec3 rd){
  vec4 P = uJP[k], UU = uJU[k], KK = uJK[k];
  vec3 u = normalize(UU.xyz), a = normalize(cross(u, abs(u.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0))), b = cross(u, a);
  float s = P.w;
  vec3 g = vec3(0.0);
  float spin = uTime * (0.6 + 3.0 * KK.z);
  for (int i = 0; i < 14; i++){
    float ang = float(i) / 14.0 * 6.2832 + 0.15 * sin(float(i) * 7.3);
    vec3 c = P.xyz + (a * cos(ang) + b * sin(ang)) * s * 1.05 - u * s * 0.03;
    vec3 v = c - ro; float t = dot(v, rd);
    if (t < 0.0) continue;
    float h2 = dot(v, v) - t * t;
    float w = pow(0.5 + 0.5 * cos(ang - spin), 10.0) * (0.45 + 0.55 * KK.z) + 0.025 * (0.5 + 0.5 * sin(float(i) * 3.1 + uTime * 0.7));
    float r0 = 0.004 * s / 0.11;
    g += vec3(0.10, 0.42, 1.0) * w * exp(-SIG_V * t) * (8.0e-6 / (h2 + r0 * r0) + 5.0e-6 / (h2 + 16.0 * r0 * r0));
  }
  return g * (0.6 + 0.4 * sin(uTime * 1.7 + KK.y));
}

/* ---- the whale: a humpback sliding by a hand's breadth behind the light. Never the whole animal: only the skin
   round its eye fills the picture. The skin is not noise but a drawn relief, a height (m) over its own surface —
   x along the body (forward), y up, eye at the origin — lit by our light from close by, so every fold casts a shadow:
     the almond of the eye, its lids, the folds that follow them and run out toward the corners, the fine creases
     fanning from the back corner; the line of the mouth below, the lower lip standing proud of it with its row of
     knobs (each with one bristle); crowns of barnacles on the chin; the pale rakes of an orca's teeth, long healed.
   The eye: a wet dark ball behind the lids, which turns to look at the light. */
float smin(float a, float b, float k){ float h = sat(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
float sq(float x){ return x * x; }
const float EYE_A = 0.042;                       // half the length of the eye's opening
float gOpen = 1.0;                               // how open the lids are (a blink closes them)
const vec3 BALL = vec3(0.0, 0.0, -0.041);        // the eyeball's centre, under the skin
const float BALL_R = 0.050;
// the mouth: the lower lip's edge, coming back from the snout and rising to its corner just below and behind the eye
const vec2 MOUTH = vec2(-0.035, -0.112);
float lipY(float x){ float u = x - MOUTH.x; return MOUTH.y - 0.060 * u - 0.30 * u * u; }
// a crease: a sharp valley, steep on the side the skin rolls over from (wa), easing out on the other (wb)
float crease(float d, float wa, float wb){ return -exp(-sqrt(d * d + 2e-7) / (d < 0.0 ? wa : wb)); }
// the opening between the lids: the intersection of two arcs, the back corner drawn to a point, the front rounder.
// open: 1 wide … 0 shut (the upper lid comes down to the lower). < 0 inside.
float eyeOpen(vec2 p, float open){
  p.y -= 0.004 * p.x / EYE_A;                    // the back corner sits a little lower
  const float hu = 0.0175, hl = 0.0105;
  float ru = (EYE_A * EYE_A + hu * hu) / (2.0 * hu), rl = (EYE_A * EYE_A + hl * hl) / (2.0 * hl);
  float du = length(p - vec2(0.0, hu - ru)) - ru, dl = length(p - vec2(0.0, rl - hl)) - rl;
  float k = mix(0.0015, 0.007, smoothstep(-EYE_A, EYE_A, p.x));
  float d = smax(du, dl, k);
  // the upper lid's edge, lowered for a blink
  float yu = hu - ru + sqrt(max(ru * ru - p.x * p.x, 0.0)), yl = rl - hl - sqrt(max(rl * rl - p.x * p.x, 0.0));
  return max(d, (p.y - mix(yl, yu, open)) * 0.9);
}
float ballH(vec2 p){ vec2 q = p - BALL.xy; float r2 = BALL_R * BALL_R - dot(q, q); return r2 > 0.0 ? BALL.z + sqrt(r2) : -1.0; }
// the skin's angle round the eye, 0 straight ahead (+x), PI/2 up, PI behind
float eyeAng(vec2 p){ return atan(p.y * 1.6, p.x); }
// a fold drawn as an arch over (dir +1) or under (dir -1) the eye: x0 ± L, its ends at height y1, its crown at y0.
// Each fold is a roll of skin overhanging the next one in toward the eye: steep on its outer side, easing inward.
float arch(vec2 p, float x0, float L, float y1, float y0, float A, float seed, inout float cav){
  float u = (p.x - x0) / L;
  if (abs(u) > 1.0) return 0.0;
  float yk = y1 + (y0 - y1) * (1.0 - u * u) + 0.0016 * sin(u * 5.0 + seed) + 0.0008 * sin(u * 13.0 + seed * 2.0);
  float slope = -2.0 * (y0 - y1) * u / L;
  float dk = (p.y - yk) * sign(y0 - y1) / sqrt(1.0 + slope * slope);
  float env = pow(1.0 - u * u, 0.6) * (0.55 + 0.45 * vnoise(vec2(u * 4.0, seed * 5.0)));
  cav += env * exp(-abs(dk) / 0.0016) * A / 0.004;
  return A * env * crease(dk, 0.0040, 0.0013);
}
// a bump of rounded flesh
float knob(vec2 p, vec2 c, vec2 r, float h){ float q = length((p - c) / r); return q < 1.0 ? h * sq(1.0 - q * q) : 0.0; }
// an acorn barnacle (Coronula): a ribbed crown sunk deep in the skin, its plates uneven, a ragged opening in its top
// with the grey plug inside; mat.x gets its shell, mat.y the dark of its opening
float barnacle(vec2 p, vec2 c, float r, float seed, inout vec4 mat){
  vec2 q = p - c; float dd = length(q);
  if (dd > r * 1.5) return 0.0;
  float th = atan(q.y, q.x);
  float jag = vnoise(vec2(th * 2.0 + seed * 10.0, seed));
  float rr = dd / r * (1.0 + 0.05 * sin(6.0 * th + seed * 6.0) + 0.10 * (jag - 0.5));
  float wall = smoothstep(1.0, 0.60, rr);
  float rim = 0.30 + 0.10 * (vnoise(vec2(th * 3.0, seed * 3.0)) - 0.5);
  float top = smoothstep(rim + 0.07, rim - 0.03, rr);
  float ribs = (0.5 + 0.5 * cos(18.0 * th + seed + 4.0 * vnoise(vec2(th * 3.0, seed)))) * smoothstep(1.0, 0.8, rr) * smoothstep(rim, 0.70, rr);
  float h = r * (0.40 + 0.25 * jag) * (wall * (1.0 + 0.05 * ribs) - 0.30 * top);
  h += r * 0.30 * exp(-sq((rr - 1.04) / 0.20));                       // sunk in: the skin heaped up round its foot
  mat.x = max(mat.x, smoothstep(1.0, 0.86, rr) * (1.0 - top) * (0.75 + 0.25 * ribs) * (0.45 + 0.55 * jag));
  vec2 sl = mat2(cos(seed), sin(seed), -sin(seed), cos(seed)) * q / r;
  mat.y = max(mat.y, top * (0.25 + 0.75 * smoothstep(0.05, 0.015, abs(sl.y)) * step(abs(sl.x), 0.22)));
  return h;
}
// the relief. fine: also the smallest creases (for shading; the shape and the shadows don't need them)
// mat: barnacle shell, barnacle top, crease darkness, pale (scars); lice: the little crabs among the barnacles
float whaleH(vec2 p, bool fine, out vec4 mat, out float lice){
  mat = vec4(0.0); lice = 0.0;
  float h = 0.0;
  // the head curves away above and toward the snout
  h -= sq(p.x + 0.05) / (2.0 * 2.6) + sq(p.y - 0.06) / (2.0 * 0.85);
  // ---- the mouth. The lower lip is a broad rounded rim standing out of the line; the upper jaw tucks in behind it
  float ym = lipY(p.x) + 0.0025 * sin(p.x * 37.0 + 1.0) + 0.0010 * sin(p.x * 107.0);
  float dy = p.y - ym;
  float lipOn = smoothstep(MOUTH.x - 0.005, MOUTH.x + 0.05, p.x);
  float lipT = 0.015 * (0.8 + 0.4 * vnoise(vec2(p.x * 11.0, 3.0)));
  h += lipOn * lipT * smoothstep(0.003, -0.007, dy) * (1.0 - 0.45 * smoothstep(-0.012, -0.05, dy));
  h += lipOn * 0.010 * crease(dy - 0.0025, 0.0016, 0.0050);
  // small creases across the lip's edge
  float lcr = smoothstep(0.65, 1.0, sin(p.x * 240.0 + 9.0 * vnoise(p * 18.0))) * smoothstep(0.35, 0.7, vnoise(vec2(p.x * 30.0, 4.0)));
  h -= lipOn * 0.0007 * lcr * smoothstep(0.001, -0.004, dy) * smoothstep(-0.028, -0.010, dy);
  mat.z += lipOn * (exp(-abs(dy - 0.0025) / 0.0030) + 0.4 * lcr * smoothstep(0.001, -0.004, dy) * smoothstep(-0.028, -0.010, dy));
  // behind its corner the mouth runs on as a fold that fades into the cheek; the corner itself a deep dimple
  float tail = smoothstep(MOUTH.x + 0.01, MOUTH.x - 0.02, p.x) * smoothstep(MOUTH.x - 0.17, MOUTH.x - 0.03, p.x);
  float ty = MOUTH.y + 0.20 * (p.x - MOUTH.x) - 0.7 * sq(p.x - MOUTH.x);
  h += tail * 0.006 * crease(p.y - ty, 0.0020, 0.0050);
  mat.z += tail * 0.7 * exp(-abs(p.y - ty) / 0.003);
  float cm = length((p - MOUTH) * vec2(1.0, 1.4));
  h -= 0.007 * exp(-sq(cm / 0.011));
  // the knobs along the lower jaw, each with a bristle in a pit on its top
  if (dy < 0.0 && dy > -0.075 && p.x > MOUTH.x) for (int k = 0; k < 6; k++){
    float fk = float(k), hk = hash12(vec2(fk, 41.0));
    float x = MOUTH.x + 0.07 + fk * 0.070 + 0.014 * (hk - 0.5);
    vec2 c = vec2(x, lipY(x) - 0.040 - 0.012 * hash12(vec2(fk, 5.0)));
    float r = 0.015 * (0.85 + 0.3 * hk);
    h += knob(p, c, vec2(r * 1.15, r), 0.0075 * (0.8 + 0.4 * hk));
    float pit = length(p - c - vec2(0.002, 0.003));
    h -= 0.0020 * exp(-sq(pit / 0.0016));
    mat.z += smoothstep(0.0020, 0.0006, pit);
  }
  // ---- the eye: a broad mound of thick flesh with the opening in it
  float d = eyeOpen(p, gOpen);
  float ang = eyeAng(p), r = length(p * vec2(0.75, 1.15));
  if (r < 0.22){
    h += 0.012 * exp(-sq((p.x + 0.01) / 0.10) - sq((p.y + 0.004) / 0.065));
    // the lids' rims: the upper a fat roll, the lower thinner
    float up = smoothstep(-0.2, 0.4, sin(ang));
    h += mix(0.0030, 0.0050, up) * (0.7 + 0.6 * vnoise(vec2(ang * 3.0, 11.0))) * exp(-sq((d - 0.005) / mix(0.0045, 0.0070, up)));
    // into the opening the skin turns under (the eyeball, below, fills it)
    h -= 0.05 * smoothstep(0.0005, -0.004, d);
    // folds that follow the lids, longer and flatter the further out, running on past the back corner; one forks
    float cav = 0.0;
    h += arch(p, -0.004, 0.058, -0.004, 0.029, 0.0036, 1.0, cav);
    h += arch(p, -0.013, 0.078, -0.007, 0.043, 0.0030, 2.0, cav);
    h += arch(p, -0.030, 0.085, -0.012, 0.058, 0.0022, 3.0, cav);
    h += arch(p, -0.070, 0.050, -0.020, 0.040, 0.0016, 5.0, cav);
    h += arch(p, 0.002, 0.055, -0.006, -0.020, 0.0024, 6.0, cav);
    h += arch(p, -0.010, 0.074, -0.008, -0.034, 0.0018, 7.0, cav);
    h += arch(p, -0.040, 0.060, -0.014, -0.047, 0.0012, 8.0, cav);
    // creases running out from the eye across the folds, so the skin round it is puckered into soft cells
    float rr = length(vec2(p.x, p.y * 1.6));
    if (fine) for (int j = 0; j < 18; j++){
      float fj = float(j), hj = hash12(vec2(fj, 77.0));
      float d0 = 0.006 + 0.018 * hash12(vec2(fj, 3.0)), d1 = d0 + 0.010 + 0.026 * hash12(vec2(fj, 9.0));
      if (d > d0 && d < d1){
        float sj = (d - d0) / (d1 - d0);
        float aa = ang - ((fj + 0.6 * hj) / 18.0 * 6.2832 - 3.14159) - 0.12 * sin(d * 70.0 + fj * 2.0);
        aa = mod(aa + 3.14159, 6.2832) - 3.14159;
        float w = pow(sin(sj * 3.14159), 1.2) * (0.5 + 0.5 * hj) * (1.0 - 0.7 * smoothstep(0.2, 0.8, sin(ang)));
        float dist = aa * rr / 1.3;
        h += 0.0013 * w * crease(dist, 0.0020, 0.0020);
        cav += 0.3 * w * exp(-abs(dist) / 0.0018);
      }
    }
    mat.z += cav + smoothstep(0.004, -0.0005, d) * 0.8;
  }
  // fine creases fanning out of the back corner, and a few from the front one
  vec2 q = p - vec2(-EYE_A - 0.003, -0.004);
  if (fine && q.x < 0.0 && dot(q, q) < 0.09 * 0.09){
    float a = atan(q.y, -q.x), rq = length(q);
    for (int k = 0; k < 7; k++){
      float fk = float(k), hk = hash12(vec2(fk, 13.0));
      float ak = (fk - 3.0) * 0.19 + 0.08 * (hk - 0.5) + 0.25 * rq;      // they curve a little as they go
      float along = rq / (0.030 + 0.045 * hk);
      if (along < 1.0){
        float w = sin(along * 3.14159) * (1.0 - along * 0.4) * smoothstep(1.35, 1.0, abs(a));
        float dist = (a - ak) * rq;
        h += 0.0013 * w * crease(dist, 0.0010, 0.0018);
        mat.z += 0.4 * w * exp(-abs(dist) / 0.0013);
      }
    }
  }
  q = p - vec2(EYE_A + 0.004, 0.002);
  if (fine && q.x > 0.0 && dot(q, q) < 0.05 * 0.05){
    float a = atan(q.y, q.x), rq = length(q);
    for (int k = 0; k < 3; k++){
      float fk = float(k);
      float along = rq / (0.022 + 0.01 * fk);
      if (along < 1.0) h += 0.0009 * sin(along * 3.14159) * crease((a - (fk - 1.0) * 0.45 - 0.15) * rq, 0.001, 0.0016);
    }
  }
  // ---- barnacles: a crowd of them on the chin, one riding a knob, a pair alone behind the mouth
  if (p.y < -0.12){
    h += barnacle(p, vec2(0.215, -0.220), 0.025, 1.0, mat);
    h += barnacle(p, vec2(0.251, -0.193), 0.018, 2.0, mat);
    h += barnacle(p, vec2(0.181, -0.244), 0.020, 3.0, mat);
    h += barnacle(p, vec2(0.252, -0.238), 0.013, 4.0, mat);
    h += barnacle(p, vec2(0.282, -0.216), 0.010, 5.0, mat);
    h += barnacle(p, vec2(0.236, -0.166), 0.007, 6.0, mat);
    h += barnacle(p, vec2(0.172, -0.166), 0.010, 7.0, mat);
    h += barnacle(p, vec2(-0.168, -0.176), 0.012, 8.0, mat);
    h += barnacle(p, vec2(-0.150, -0.188), 0.008, 9.0, mat);
  }
  // ---- the skin itself: broad slow swells; and (fine) patches of shallow creases that mostly run along the body
  h += 0.0022 * (vnoise(p * 7.0) - 0.5) + 0.0009 * (vnoise(p * 19.0 + 3.0) - 0.5);
  if (fine){
    vec2 w = p + 0.012 * vec2(vnoise(p * 11.0), vnoise(p * 11.0 + 9.0));
    float ph = w.y * 210.0 + 7.0 * vnoise(w * 5.0);
    float li = floor(ph);
    float seg = smoothstep(0.35, 0.70, vnoise(vec2(w.x * 6.0, li * 1.7))) * smoothstep(0.45, 0.70, vnoise(p * 3.5 + 20.0));
    float cr = 0.00018 * seg * crease((fract(ph) - 0.5) / 210.0, 0.0006, 0.0011);
    // near the eye the fine creases follow the lids
    float near = smoothstep(0.10, 0.05, r); float rr = length(vec2(p.x, p.y * 1.6));
    float ph2 = ang * 45.0 + 4.0 * vnoise(vec2(d * 120.0, 1.0));
    float seg2 = smoothstep(0.45, 0.75, vnoise(vec2(d * 160.0, floor(ph2) * 2.3)));
    float cr2 = 0.00022 * seg2 * crease((fract(ph2) - 0.5) * rr / 45.0, 0.0008, 0.0008) * smoothstep(0.004, 0.012, d);
    h += mix(cr, cr2, near);
    h += 0.00005 * (vnoise(p * 600.0) + vnoise(p * 1300.0 + 7.0) - 1.0);
  }
  return h;
}
float whaleSurf(vec2 p){ vec4 m; float l; return max(whaleH(p, false, m, l), ballH(p)); }
// returns the whale's colour (carried to the eye) and its distance, or T unchanged
vec3 whale(vec3 ro, vec3 rd, inout float T){
  if (uWh.w <= 0.0) return vec3(0.0);
  gOpen = 1.0 - uWhF.w;
  vec3 F = uWhF.xyz, Up = vec3(0.0, 1.0, 0.0), Z = normalize(cross(F, Up)); Up = cross(Z, F);
  vec3 rl = ro - uWh.xyz;
  vec3 o = vec3(dot(rl, F), dot(rl, Up), dot(rl, Z)), d = vec3(dot(rd, F), dot(rd, Up), dot(rd, Z));
  // the skin lies within a thin shell under the plane z = 0.03 (and nowhere is deeper than ~0.2 in view)
  if (d.z >= -0.02) return vec3(0.0);
  float t = max((0.035 - o.z) / d.z, 0.0), tEnd = min((-0.45 - o.z) / d.z, T);
  if (t > tEnd) return vec3(0.0);
  float tp = t; bool hit = false;
  for (int i = 0; i < 48; i++){
    vec3 p = o + d * t;
    float f = p.z - whaleSurf(p.xy);
    if (f < 0.0){ hit = true; break; }
    tp = t;
    t += max(f * 0.55, 0.0004);
    if (t > tEnd) break;
  }
  if (!hit) return vec3(0.0);
  for (int i = 0; i < 6; i++){ float tm = 0.5 * (tp + t); vec3 p = o + d * tm; if (p.z - whaleSurf(p.xy) < 0.0) t = tm; else tp = tm; }
  vec3 p = o + d * t;
  vec4 mat; float lice;
  float hs = whaleH(p.xy, true, mat, lice), hb = ballH(p.xy);
  bool isEye = hb > hs;
  // the normal, from the relief's slope
  vec2 e = vec2(0.0007, 0.0);
  vec4 m_; float l_;
  vec3 n;
  if (isEye){ n = normalize(vec3(p.xy, hb) - BALL); }
  else {
    float hx = whaleH(p.xy + e.xy, true, m_, l_) - whaleH(p.xy - e.xy, true, m_, l_);
    float hy = whaleH(p.xy + e.yx, true, m_, l_) - whaleH(p.xy - e.yx, true, m_, l_);
    n = normalize(vec3(-hx, -hy, 2.0 * e.x));
  }
  vec3 xw = ro + rd * t;
  vec3 Lw = uL - xw;
  vec3 Ll = vec3(dot(Lw, F), dot(Lw, Up), dot(Lw, Z)), Ld = normalize(Ll);
  float distL = length(Ll);
  // shadow: walk toward the light over the relief
  float sh = 1.0, s = 0.0015;
  for (int i = 0; i < 18; i++){
    vec3 q = p + Ld * s;
    float f = q.z - whaleSurf(q.xy);
    sh = min(sh, 0.5 + 0.5 * f / (0.03 * s));
    s += max(0.0025, s * 0.22);
    if (sh < 0.0 || s > min(distL, 0.30)) break;
  }
  sh = smoothstep(0.0, 1.0, sat(sh));
  vec3 V = -d;
  vec3 Hh = normalize(Ld + V);
  float ndl = dot(n, Ld), ndh = max(dot(n, Hh), 0.0), ndv = max(dot(n, V), 0.0);
  vec3 E = lightAt(xw) * sh;
  vec3 col;
  if (isEye){
    // the eye: turned toward wherever uWhG says. Nearly black: a dark brown iris with faint fibres, the pupil wide open
    // (it is very dark down here), and round them the white, which shows only when it looks aside
    vec3 g = normalize(uWhG.xyz);
    float a = acos(clamp(dot(n, g), -1.0, 1.0));
    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), g)), gy = cross(g, gx);
    float az = atan(dot(n, gy), dot(n, gx));
    float pr = 0.36 * (1.0 + 0.22 * abs(cos(az)));                     // a broad oval, wider than tall
    float fib = vnoise(vec2(az * 14.0, a * 10.0)) * 0.6 + vnoise(vec2(az * 40.0, a * 4.0)) * 0.4;
    vec3 iris = vec3(0.0085, 0.0058, 0.0042) * (0.7 + 0.5 * fib) * (0.8 + 0.5 * smoothstep(pr, 0.72, a));
    iris *= 1.0 - 0.5 * smoothstep(0.64, 0.74, a);                      // a darker ring at its edge
    vec3 sclera = vec3(0.16, 0.15, 0.135) * (0.80 + 0.30 * vnoise(vec2(az * 6.0, a * 7.0)));
    sclera = mix(sclera, vec3(0.025, 0.017, 0.012), smoothstep(1.0, 0.80, a) * 0.7);   // brown seeps into the white near the iris
    vec3 alb = mix(iris, sclera, smoothstep(0.76, 0.84, a));
    alb = mix(vec3(0.0012, 0.0010, 0.0010), alb, smoothstep(pr - 0.03, pr + 0.03, a));
    // a wet cornea: one crisp highlight, and a soft sheen over the whole ball
    float fr = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
    float spec = 2.0 * pow(ndh, 1400.0) * (0.25 + fr);
    col = E * (alb * max(ndl, 0.0) + spec * step(0.0, ndl)) ;
    col *= smoothstep(-0.010, 0.008, hb);                               // dim where it sinks in under the lids
  } else {
    // skin: nearly black slate; darker in its creases; pale where scarred; barnacles chalky grey, grimed, a little green
    vec3 alb = vec3(0.0070, 0.0076, 0.0090) * (0.80 + 0.40 * vnoise(p.xy * 11.0) + 0.15 * (vnoise(p.xy * 90.0) - 0.5));
    alb *= 1.0 - 0.6 * sat(mat.z);
    alb = mix(alb, vec3(0.034, 0.035, 0.036) * (0.75 + 0.4 * vnoise(p.xy * 150.0)), sat(mat.w) * 0.8);
    vec3 shell = vec3(0.085, 0.082, 0.075) * (0.6 + 0.6 * vnoise(p.xy * 320.0)) * mix(vec3(1.0), vec3(0.70, 0.80, 0.60), smoothstep(0.4, 0.8, vnoise(p.xy * 45.0)) * 0.8);
    alb = mix(alb, shell, sat(mat.x));
    vec3 opening = vec3(0.004, 0.0035, 0.003);
    vec3 plug = vec3(0.022, 0.021, 0.019) * (0.6 + 0.6 * vnoise(p.xy * 500.0));
    alb = mix(alb, mix(plug, opening, smoothstep(0.4, 0.9, mat.y)), smoothstep(0.0, 0.25, mat.y));
    alb = mix(alb, vec3(0.13, 0.07, 0.04), sat(lice));
    // wet skin: a broad sheen that shows its shape; a glassy line where the lid meets the eye
    float fr = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
    float gloss = (0.030 * pow(ndh, 40.0) + 0.005 * pow(ndh, 6.0)) * (1.0 - sat(mat.x) * 0.6);
    gloss += 0.15 * pow(ndh, 250.0) * smoothstep(0.0025, 0.0005, eyeOpen(p.xy, gOpen)) * smoothstep(0.3, 0.7, vnoise(p.xy * 300.0));
    float wrap = sat((ndl + 0.10) / 1.10);
    col = E * (alb * wrap + gloss * (0.4 + fr) * step(0.0, ndl));
  }
  T = t;
  return col * exp(-SIG_V * t);
}

/* ---- the whole whale going by, further off: a long dark body (a body of revolution, thickest a little ahead of the
   middle), the grooves of its throat, the flukes at the end of its tail, and the long white flipper, knobbed along its
   leading edge, held out toward the light. Local frame: x toward its head, y up, z toward us. */
uniform vec4 uGW;            // where the middle of its body is (world), on/off
uniform vec4 uGF;            // which way it swims (unit), the stroke of its flukes
uniform vec4 uGA;            // the near flipper: its direction (local, unit)
uniform float uDown;         // the daylight far above
float bodyR(float x){
  float u = clamp((x + 7.5) / 14.0, 0.0, 1.0);
  float head = sqrt(max(1.0 - sq(max(u - 0.60, 0.0) / 0.40), 0.0));
  float tail = pow(smoothstep(0.0, 0.60, u), 0.80);
  return 1.55 * head * tail + 0.10;
}
float greatSDF(vec3 q, out float part){
  // body: an ellipse in section (a little deeper than wide); throat grooves along its underside
  float r = bodyR(q.x);
  float d = (length(vec2(q.y / 0.88, q.z)) - r) * 0.82;
  d = max(d, abs(q.x + 0.5) - 7.05);
  float ph = atan(q.y, q.z);
  float throat = smoothstep(0.5, 2.0, q.x) * smoothstep(-0.25, -0.75, q.y / max(r, 0.2));
  d += 0.010 * throat * (0.5 + 0.5 * sin(ph * 70.0));
  part = 0.0;
  // the flukes: two broad swept lobes at the end of the tail stock, beating slowly up and down
  vec3 fq = q - vec3(-7.75, 0.30 * uGF.w, 0.0);
  float sw = 0.40;
  vec2 lz = vec2(fq.x + abs(fq.z) * sw, abs(fq.z) - 0.95);
  float fl = (length(vec3(lz.x / 0.42, fq.y / 0.06, lz.y / 1.00)) - 1.0) * 0.06;
  if (fl < d){ d = fl; part = 1.0; }
  // the flippers: from their roots low on each flank, long blades held down and out; thick along the leading edge,
  // knobbed there (the near one, z > 0, is the one that sweeps past the light)
  vec3 A = uGA.xyz;
  q.z = abs(q.z);                                                      // (the two are mirror images)
  vec3 R0 = vec3(2.55, -0.95, 1.05);
  vec3 v = q - R0;
  float al = dot(v, A), Lf = 3.6, s = clamp(al, 0.0, Lf), sl = s / Lf;
  vec3 Cd = normalize(vec3(1.0, 0.0, 0.0) - A * A.x), N = cross(A, Cd);
  vec3 off = v - A * s;
  float b = dot(off, Cd), n = dot(off, N);
  float chord = 0.46 * (1.0 - 0.35 * sl) * sqrt(max(1.0 - pow(sl, 5.0), 0.0)) + 0.02;
  float knob = pow(0.5 + 0.5 * sin(s * 10.5 + 1.0), 2.0) * smoothstep(0.05, 0.25, sl);
  float cb = b > 0.0 ? chord * (0.40 + 0.16 * knob) : chord * 0.60;        // the knobs stand out along the leading edge
  float th = (0.075 * (1.0 - 0.55 * sl) + 0.012) * (b > 0.0 ? 1.0 + 0.3 * knob : 1.0 - 0.7 * sat(-b / cb));
  float fd = (length(vec2(b / cb, n / th)) - 1.0) * min(cb, th) * 0.7;
  fd = max(fd, max(al - Lf, -al - 0.3));
  if (fd < d){ d = fd; part = 2.0 + knob * smoothstep(0.0, 0.6, b / cb); }
  return d;
}
vec3 great(vec3 ro, vec3 rd, inout float T){
  if (uGW.w <= 0.0) return vec3(0.0);
  vec3 F = uGF.xyz, Up = vec3(0.0, 1.0, 0.0), Z = normalize(cross(F, Up)); Up = cross(Z, F);
  vec3 rl = ro - uGW.xyz;
  vec3 o = vec3(dot(rl, F), dot(rl, Up), dot(rl, Z)), d = vec3(dot(rd, F), dot(rd, Up), dot(rd, Z));
  // a box round all of it
  vec3 bmin = vec3(-8.6, -4.8, -4.6), bmax = vec3(7.0, 2.0, 4.6);
  vec3 ia = (bmin - o) / d, ib = (bmax - o) / d;
  vec3 lo = min(ia, ib), hi = max(ia, ib);
  float t0 = max(max(lo.x, lo.y), max(lo.z, 0.0)), t1 = min(min(hi.x, hi.y), min(hi.z, T));
  if (t0 >= t1) return vec3(0.0);
  float t = t0, part = 0.0; bool hit = false;
  for (int i = 0; i < 64; i++){
    float f = greatSDF(o + d * t, part);
    if (f < 0.0012 * t){ hit = true; break; }
    t += max(f, 0.002);
    if (t > t1) break;
  }
  if (!hit) return vec3(0.0);
  vec3 p = o + d * t;
  vec2 e = vec2(0.004, -0.004); float pp;
  vec3 n = normalize(e.xyy * greatSDF(p + e.xyy, pp) + e.yyx * greatSDF(p + e.yyx, pp) + e.yxy * greatSDF(p + e.yxy, pp) + e.xxx * greatSDF(p + e.xxx, pp));
  vec3 xw = ro + rd * t;
  vec3 Lw = uL - xw, Ll = vec3(dot(Lw, F), dot(Lw, Up), dot(Lw, Z)), Ld = normalize(Ll);
  vec3 V = -d, Hh = normalize(Ld + V);
  float ndl = dot(n, Ld), ndh = max(dot(n, Hh), 0.0), ndv = max(dot(n, V), 0.0);
  vec3 E = lightAt(xw);
  vec3 alb; float gloss = 0.03;
  if (part >= 2.0){
    // the flipper: white, with grey mottling on top and a dark grime of barnacles on the knobs
    float mot = smoothstep(0.45, 0.75, vnoise(p.xz * 3.0 + p.y * 2.0) * 0.7 + vnoise(p.xz * 11.0) * 0.3);
    alb = mix(vec3(0.42, 0.43, 0.44), vec3(0.05, 0.05, 0.055), mot * 0.75 * smoothstep(-0.2, 0.4, n.y));
    float grime = smoothstep(2.4, 2.9, part) * smoothstep(0.55, 0.8, vnoise(p.xz * 40.0 + p.y * 30.0));
    alb = mix(alb, vec3(0.06, 0.06, 0.05), grime);
    gloss = 0.06;
  } else {
    // the body: slate black; paler and mottled underneath; the throat grooves' floors paler still
    float under = smoothstep(0.0, -0.8, n.y);
    alb = vec3(0.011, 0.012, 0.014) * (0.8 + 0.4 * vnoise(p.xz * 2.0));
    alb = mix(alb, vec3(0.10, 0.10, 0.10) * (0.6 + 0.6 * vnoise(p.xz * 4.0 + 3.0)), under * 0.6);
    // scars: thin pale scratches here and there
    float sc = smoothstep(0.985, 1.0, sin(p.x * 9.0 + 6.0 * vnoise(p.xz * 1.3)) * step(0.6, vnoise(p.xz * 0.7)));
    alb = mix(alb, vec3(0.08, 0.08, 0.08), sc * 0.6);
  }
  float fr = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  float wrap = sat((ndl + 0.15) / 1.15);
  vec3 col = E * (alb * wrap + gloss * (0.3 + fr) * pow(ndh, 30.0) * step(0.0, ndl));
  T = t;
  return col * exp(-SIG_V * t);
}

/* ---- the anglerfish behind the lure: a dark head, a great open mouth ringed with needle teeth, one eye that shines back.
   Local frame: x toward the light it is hunting, y up. Only what our light reaches is seen. */
uniform vec4 uFishP;         // head centre, shown (0/1)
uniform vec4 uFishF;         // facing (unit), mouth open (0 shut … 1 gaping)
float sdCone(vec3 p, vec3 a, vec3 b, float ra, float rb){
  vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float fishSDF(vec3 p, float gape, out float part){
  float head = length(p / vec3(0.22, 0.17, 0.16)) * 0.16 - 0.16;
  float body = length((p - vec3(-0.28, -0.02, 0.0)) / vec3(0.32, 0.15, 0.12)) * 0.12 - 0.12;
  float d = smin(head, body, 0.06);
  // the mouth: a big cavity opening forward and down
  vec3 mc = vec3(0.17, -0.035, 0.0);
  float mouth = length((p - mc) / vec3(0.12, 0.035 + 0.05 * gape, 0.115)) * 0.035 - 0.035;
  d = max(d, -mouth);
  part = 0.0;
  // fangs: a row along the upper jaw pointing down, a row along the lower pointing up, crossing like a cage;
  // long at the front, shorter toward the corners of the mouth
  float tooth = 1e9;
  float gh = 0.035 + 0.05 * gape;
  for (int k = 0; k < 11; k++){
    float th = (float(k) / 10.0 - 0.5) * 2.6;
    float front = cos(th);
    float h1 = hash12(vec2(float(k), 3.0)), h2 = hash12(vec2(float(k), 7.0));
    vec3 ru = mc + vec3(0.055 * front + 0.015, gh * 0.92, 0.105 * sin(th));
    float lu = (0.015 + 0.045 * front * front * h1 + 0.012 * h2) * (0.55 + 0.6 * gape);
    vec3 tu = ru + vec3(0.010 + 0.012 * (h2 - 0.5), -lu, (h1 - 0.5) * 0.02 - 0.010 * sin(th));
    tooth = min(tooth, sdCone(p, ru, tu, 0.0012 + 0.0016 * h1, 0.0002));
    // the lower jaw juts out past the upper (an underbite), its fangs the longest
    vec3 rl = mc + vec3(0.06 * front + 0.035, -gh * 0.92, 0.10 * sin(th + 0.12));
    float ll = (0.02 + 0.06 * front * front * h2 + 0.012 * h1) * (0.55 + 0.6 * gape);
    vec3 tl = rl + vec3(0.004 + 0.016 * (h1 - 0.3), ll, (h2 - 0.5) * 0.02 - 0.010 * sin(th));
    tooth = min(tooth, sdCone(p, rl, tl, 0.0014 + 0.0018 * h2, 0.0002));
  }
  if (tooth < d){ d = tooth; part = 1.0; }
  // the eye
  float eye = length(p - vec3(0.09, 0.085, 0.115)) - 0.016;
  if (eye < d){ d = eye; part = 2.0; }
  // the stalk that holds out the lure
  float stalk = min(sdCone(p, vec3(0.10, 0.15, 0.0), vec3(0.24, 0.24, 0.0), 0.005, 0.0035), sdCone(p, vec3(0.24, 0.24, 0.0), vec3(0.40, 0.18, 0.0), 0.0035, 0.002));
  if (stalk < d){ d = stalk; part = 3.0; }
  return d;
}
vec3 fish(vec3 ro, vec3 rd, inout float T){
  if (uFishP.w <= 0.0) return vec3(0.0);
  vec3 F = uFishF.xyz, Up0 = vec3(0.0, 1.0, 0.0), Z = normalize(cross(F, Up0)), Up = cross(Z, F);
  vec3 rl = ro - uFishP.xyz;
  vec3 o = vec3(dot(rl, F), dot(rl, Up), dot(rl, Z)), d = vec3(dot(rd, F), dot(rd, Up), dot(rd, Z));
  float b = dot(o, d), c = dot(o, o) - 0.62 * 0.62, h = b * b - c;
  if (h < 0.0) return vec3(0.0);
  float t = max(-b - sqrt(h), 0.0), tEnd = min(-b + sqrt(h), T);
  float part = 0.0, gape = uFishF.w; bool hit = false;
  for (int i = 0; i < 64; i++){
    float dd = fishSDF(o + d * t, gape, part);
    if (dd < 0.0004 * t + 0.0002){ hit = true; break; }
    t += dd * 0.8;
    if (t > tEnd) break;
  }
  if (!hit) return vec3(0.0);
  vec3 p = o + d * t; float pp;
  vec2 e = vec2(0.0015, 0.0);
  vec3 n = normalize(vec3(fishSDF(p + e.xyy, gape, pp) - fishSDF(p - e.xyy, gape, pp), fishSDF(p + e.yxy, gape, pp) - fishSDF(p - e.yxy, gape, pp), fishSDF(p + e.yyx, gape, pp) - fishSDF(p - e.yyx, gape, pp)));
  vec3 nw = normalize(F * n.x + Up * n.y + Z * n.z);
  vec3 xw = ro + rd * t;
  // lit by our light only (its own lure doesn't light its face)
  vec3 Ld = normalize(uL - xw); float r2 = dot(uL - xw, uL - xw);
  vec3 E = uLI * exp(-SIG_T * sqrt(r2)) / (r2 + 0.0009);
  float diff = max(dot(nw, Ld), 0.0);
  vec3 hv = normalize(Ld - rd);
  vec3 alb = vec3(0.10, 0.075, 0.065) * (0.65 + 0.7 * vnoise(p.xy * 90.0 + p.z * 40.0));
  float sh = 45.0, ks = 0.35;                                              // wet, slightly glossy skin
  bool inMouth = length((p - vec3(0.17, -0.035, 0.0)) / vec3(0.13, 0.045 + 0.05 * gape, 0.125)) < 1.0;
  if (part == 0.0 && inMouth) alb *= 0.25;                                  // the dark inside of it
  if (part == 1.0){ alb = vec3(0.75, 0.74, 0.68); sh = 80.0; ks = 0.9; }     // teeth: glassy, catching the light
  if (part == 2.0){ alb = vec3(0.02); sh = 400.0; ks = 4.0; }               // the eye shines back
  if (part == 3.0){ alb = vec3(0.10, 0.08, 0.07); }
  vec3 col = E * (alb * (diff * 0.85 + 0.15) + ks * pow(max(dot(nw, hv), 0.0), sh));
  T = t;
  return col * exp(-SIG_V * t) * uFishP.w;
}
void main(){
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y), ro = uEye;
  float T = 40.0;
  // the whale, if it is passing, is the far wall of everything
  vec3 c = whale(ro, rd, T);
  float Tg = T; vec3 cg = great(ro, rd, Tg);
  if (Tg < T){ c = cg; T = Tg; }
  float Tf = T; vec3 cf = fish(ro, rd, Tf);
  if (Tf < T){ c = cf; T = Tf; }
  // the creatures, composited far to near (JS sends them in that order); what is behind the whale is hidden
  for (int k = 0; k < 3; k++){
    Hit h = creature(k, ro, rd);
    if (h.t < T){ c = c * h.tr + h.c; }
    if (uJK[k].x == 2.0 && distance(uJP[k].xyz, ro) < T) c += atollaGlow(k, ro, rd);
  }
  // far above, the surface: a round window of warm light the size of a cup's mouth, a pale enamel rim round it,
  // tea leaves floating dark against it
  if (uSurf.y > 0.0 && rd.y > 0.0){
    float ts = (uSurf.x - ro.y) / rd.y;
    if (ts > 0.0 && ts < T){
      vec3 hp = ro + rd * ts;
      vec2 q = hp.xz - ro.xz * 0.0 - vec2(uEye.x, uEye.z);
      float R = 1.25, rq = length(q);
      vec2 w = q + 0.05 * vec2(vnoise(q * 3.0 + uTime * 0.4), vnoise(q * 3.0 + 7.0 - uTime * 0.3)) - 0.025;
      // the light coming down through it: brightest in the middle, shimmering with the surface's ripples
      float ripple = 0.70 + 0.35 * vnoise(w * 5.0 + uTime * 0.4) + 0.5 * pow(vnoise(w * 13.0 - uTime * 0.8), 3.0);
      float centre = 1.0 - 0.55 * smoothstep(0.0, R, rq);
      vec3 win = vec3(1.0, 0.74, 0.42) * ripple * centre * smoothstep(R, R * 0.95, rq) * 0.55;
      // the cup's enamel rim, lit from within
      float rim = smoothstep(R * 0.97, R, rq) * smoothstep(R * 1.12, R * 1.02, rq);
      win += vec3(0.90, 0.82, 0.70) * rim * 0.35;
      // tea leaves floating, dark, curled
      for (int k = 0; k < 7; k++){
        float fk = float(k);
        vec2 lc = vec2(cos(fk * 2.4 + uTime * 0.02), sin(fk * 2.4 + uTime * 0.02)) * (0.18 + 0.13 * fk);
        float la = fk * 1.7 + uTime * 0.05;
        vec2 lq = q - lc; lq = mat2(cos(la), -sin(la), sin(la), cos(la)) * lq;
        float len_ = 0.13 + 0.06 * fract(fk * 0.61);
        float wid = 0.05 * sqrt(max(1.0 - pow(lq.x / len_, 2.0), 0.0)) * (1.0 + 0.3 * sin(lq.x * 25.0 + fk));
        float leaf = smoothstep(0.004, -0.004, abs(lq.y + 0.02 * sin(lq.x * 12.0)) - wid) * step(abs(lq.x), len_);
        win *= 1.0 - 0.9 * leaf;
      }
      c += win * uSurf.y * exp(-SIG_V * ts * 0.4);
    }
  }
  // far, far above, the last of the daylight: a faint blue that only shows looking up (against it, what passes overhead
  // is a shadow)
  if (T > 39.0) c += vec3(0.0015, 0.010, 0.030) * pow(max(rd.y - 0.05, 0.0), 1.8) * uDown;
  // the light itself: a small hot core
  vec3 lo = uL - ro; float t0 = dot(lo, rd); float hl2 = max(dot(lo, lo) - t0 * t0, 0.0);
  if (t0 > 0.0 && t0 < T + 0.05) c += uLI * exp(-SIG_V * t0) * (40.0 * exp(-hl2 / 1.6e-5) + 0.0006 / (hl2 + 0.0004));
  // the lure has a core just like it
  if (uLI2.r > 0.0){
    vec3 l2 = uL2 - ro; float s0 = dot(l2, rd), q2 = max(dot(l2, l2) - s0 * s0, 0.0);
    if (s0 > 0.0 && s0 < T + 0.05) c += uLI2 * exp(-SIG_V * s0) * (40.0 * exp(-q2 / 1.6e-5) + 0.0006 / (q2 + 0.0004));
  }
  // and the water between, lit; light scattered many times fills a wide, soft, cold sphere round it
  c += inscatter(ro, rd, T);
  if (t0 > 0.0) c += uLI.r * (vec3(0.0, 0.06, 0.20) * 0.010 / (hl2 + 0.10) + vec3(0.0, 0.03, 0.12) * 0.004 / (hl2 + 0.7)) * exp(-0.25 * t0);
  o = vec4(c, T);
}`;

/* ---------------------------------------------------------------- the tentacles */
const VS_TENT = `#version 300 es
precision highp float;
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan;
uniform float uTime;
uniform vec4 uJP[3]; uniform vec4 uJU[3]; uniform vec4 uJK[3];
uniform int uSeg;            // vertices per tentacle
out vec3 vC;
` + COMMON + `
void main(){
  int inst = gl_InstanceID, seg = gl_VertexID;
  float s = float(seg) / float(uSeg - 1);
  // instances 0–95: the moon jelly's fringe; 96–119: Atolla's margin; 120: Atolla's long trailing tentacle
  int k = 0; float ang, len_, rad, fr = 1.0;
  int jm = -1, ja = -1;
  for (int i = 0; i < 3; i++){ if (uJK[i].x == 0.0) jm = i; if (uJK[i].x == 2.0) ja = i; }
  if (inst < 96){ k = jm; ang = float(inst) / 96.0 * 6.2832; len_ = 0.55 + 0.35 * fract(float(inst) * 0.618); rad = 1.0; }
  else if (inst < 120){ k = ja; ang = float(inst - 96) / 24.0 * 6.2832; len_ = 0.9 + 0.4 * fract(float(inst) * 0.618); rad = 1.02; }
  else { k = ja; ang = 1.3; len_ = 14.0; rad = 0.9; fr = 0.6; }
  if (k < 0){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vC = vec3(0.0); return; }
  vec4 P = uJP[k], UU = uJU[k];
  float sz = P.w, pulse = UU.w;
  vec3 u = normalize(UU.xyz), a = normalize(cross(u, abs(u.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0))), b = cross(u, a);
  float ym = k == jm ? -0.04 - 0.06 * pulse : -0.02;
  float Rx = 1.08 - 0.15 * pulse, Ry = 0.62 + 0.14 * pulse;
  float R = (k == jm ? Rx * sqrt(max(1.0 - pow((ym + 0.26) / Ry, 2.0), 0.0)) : 1.0) * rad;
  vec2 dir = vec2(cos(ang), sin(ang));
  // hanging down, swaying; the long one trails off in slow curves
  float y = ym - s * len_;
  float sw = 0.12 * s * s * len_;
  vec2 off = dir * (R - 0.08 * s * fr) + vec2(sin(uTime * 1.1 - s * 5.0 + ang * 3.0), cos(uTime * 0.9 - s * 4.0 + ang * 2.0)) * sw * fr;
  if (inst == 120) off += vec2(sin(s * 6.0 - uTime * 0.4), sin(s * 4.3 - uTime * 0.3 + 1.0)) * s * 1.6;
  vec3 local = vec3(off.x, y, off.y);
  vec3 p = P.xyz + (a * local.x + u * local.y + b * local.z) * sz;
  vec3 v = p - uEye; float z = dot(v, uFwd);
  gl_Position = vec4(dot(v, uRight) / uTan.x, dot(v, uUp) / uTan.y, z * 0.01, z);
  // lit like the rest; fading toward the tips; Atolla's carry a faint blue of their own
  vec3 E = lightAt(p);
  float fwd = HG(dot(normalize(p - uL), -normalize(v)), 0.5) * 4.0 * PI;
  vC = E * (k == jm ? vec3(0.9, 0.95, 1.0) : vec3(0.7, 0.12, 0.12)) * (0.012 + 0.02 * fwd) * (1.0 - 0.7 * s);
  if (k == ja) vC += vec3(0.05, 0.2, 0.6) * 0.004 * (1.0 - s) * (inst == 120 ? 0.4 : 1.0);
  vC *= exp(-SIG_V * z);
}`;
const FS_TENT = `#version 300 es
precision highp float;
in vec3 vC; out vec4 o;
void main(){ o = vec4(vC, 1.0); }`;

/* ---------------------------------------------------------------- marine snow */
const VS_SNOW = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aP;      // where it started (in a 4 m box), and a seed
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan; uniform vec2 uRes;
uniform float uTime, uFocus, uAperture, uSink;
uniform sampler2D uDepth;            // the sea pass: alpha is how far the ray went before something solid
out vec2 vUV; out vec3 vC; out float vSharp; out float vSeed;
` + COMMON + `
void main(){
  int corner = gl_VertexID;
  vec2 cq = vec2(corner & 1, corner >> 1) * 2.0 - 1.0;
  float h = aP.w;
  // slowly sinking, turning in the current
  vec3 p = aP.xyz + vec3(0.03 * sin(uTime * 0.11 + h * 40.0), -0.010 - 0.012 * fract(h * 17.0), 0.03 * cos(uTime * 0.09 + h * 30.0)) * uTime * 0.5
         + vec3(sin(uTime * 0.6 + h * 9.0), 0.0, cos(uTime * 0.5 + h * 7.0)) * 0.004;
  p.y += uSink;                                                      // as the light goes deeper, the snow seems to rise past
  p = uEye + mod(p - uEye + 2.0, 4.0) - 2.0;
  vec3 v = p - uEye; float z = dot(v, uFwd);
  if (z < 0.06){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 ndc = vec2(dot(v, uRight) / (z * uTan.x), dot(v, uUp) / (z * uTan.y));
  if (abs(ndc.x) < 1.0 && abs(ndc.y) < 1.0 && texture(uDepth, ndc * 0.5 + 0.5).a < length(v)){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float rad = 0.0006 + 0.0022 * pow(fract(h * 31.0), 3.0);                    // mostly tiny, a few big flakes
  float pxPhys = rad / (z * uTan.y) * uRes.y * 0.5;
  float coc = uAperture * abs(z - uFocus) / z * uRes.y;                        // out of focus: a disc
  float size = max(max(pxPhys, coc), 0.8);
  // how bright: the light on it (strongly forward), the water between it and the eye, its light spread over the disc
  vec3 E = lightAt(p);
  float fwd = HG(dot(normalize(p - uL), -normalize(v)), 0.6) * 4.0 * PI;
  // only what the light reaches is seen at all: outside its sphere the snow is lost in the dark
  float reach = exp(-2.4 * max(length(p - uL) - 0.30, 0.0));
  vec3 c = E * 0.7 * reach * (0.25 + 0.75 * fwd) * min(1.0, (pxPhys * pxPhys + 0.08) / (size * size));
  // a few are alive and glow blue now and then
  if (fract(h * 53.0) < 0.07){
    float blink = pow(max(sin(uTime * (0.4 + fract(h * 7.0)) + h * 60.0), 0.0), 30.0);
    c += vec3(0.10, 0.45, 1.0) * (0.002 + 0.08 * blink) / (size * size * 0.5 + 0.5);
  }
  vC = c * exp(-SIG_V * z);
  vSharp = smoothstep(2.5, 1.0, coc);
  vSeed = h;
  vUV = cq;
  gl_Position = vec4(ndc + cq * (size + 1.0) / uRes * 2.0, 0.5, 1.0);
}`;
const FS_SNOW = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vC; in float vSharp; in float vSeed;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  float r = length(vUV);
  // in focus: a ragged little aggregate; out of focus: a soft-edged disc, a touch brighter at its rim
  float ang = atan(vUV.y, vUV.x);
  float lump = 0.75 + 0.25 * sin(ang * 3.0 + vSeed * 50.0) * sin(ang * 5.0 + vSeed * 20.0);
  float edge = mix(1.0, lump, vSharp);
  float m = smoothstep(edge, edge * 0.82, r) * (1.0 + 0.25 * (1.0 - vSharp) * smoothstep(0.5, 0.9, r));
  o = vec4(vC * m, 1.0);
}`;

/* ---------------------------------------------------------------- the plankton the whale wakes
   Laid out along the whale's way through the water (not round the eye like the snow), thickest where its skin will
   pass. Each flashes blue as the skin comes by; the water stirred by the thick of its body keeps glowing a while after,
   fading; the bow wave starts them ahead of its head. So the whole great shape goes by outlined in blue sparks. */
const VS_PLK = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aP;      // along the way (-1…1), out from it (0…1), round it (angle), a seed
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan; uniform vec2 uRes;
uniform float uTime, uFocus, uAperture;
uniform vec4 uGW, uGF;               // the whale's middle now (on/off); which way it swims
uniform vec4 uGP;                    // its way: the point nearest the eye's view (world), how far its middle is past it (m)
uniform float uGS;                   // its speed (m/s)
uniform sampler2D uDepth;
out vec2 vUV; out vec3 vC; out float vSharp; out float vSeed;
const vec3 SIG_V = vec3(0.10, 0.06, 0.045);
float bodyR(float x){
  float u = clamp((x + 7.5) / 14.0, 0.0, 1.0);
  float head = sqrt(max(1.0 - pow(max(u - 0.60, 0.0) / 0.40, 2.0), 0.0));
  float tail = pow(smoothstep(0.0, 0.60, u), 0.80);
  return 1.55 * head * tail + 0.10;
}
void main(){
  vec2 cq = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
  vec3 F = uGF.xyz, Up = vec3(0.0, 1.0, 0.0), Z = normalize(cross(F, Up)); Up = cross(Z, F);
  float h = aP.w, X = aP.x * 9.0, rho = 0.75 + 1.85 * aP.y, ph = aP.z;
  vec3 p = uGP.xyz + F * X + Up * rho * sin(ph) * 0.88 + Z * rho * cos(ph);
  p += vec3(sin(uTime * 0.3 + h * 40.0), sin(uTime * 0.25 + h * 30.0), cos(uTime * 0.2 + h * 20.0)) * 0.03;
  float xl = X - uGP.w, r = bodyR(xl), dn = rho - r;
  float now = (xl > -7.6 && xl < 6.6) ? exp(-max(dn, 0.0) / 0.22) * step(-0.10, dn) : 0.0;
  float tau = (1.0 - xl) / uGS;
  float wake = tau > 0.0 ? exp(-max(rho - 1.65, 0.0) / 0.35) * exp(-tau / 1.3) * 0.7 : 0.0;
  float bow = (xl > 5.8 && xl < 7.2) ? exp(-max(rho - 0.6, 0.0) / 0.3) * smoothstep(7.2, 6.2, xl) : 0.0;
  float g = max(max(now, wake), bow) * (0.30 + 0.70 * pow(0.5 + 0.5 * sin(uTime * (6.0 + 9.0 * h) + h * 90.0), 3.0));
  vec3 v = p - uEye; float z = dot(v, uFwd);
  // brightest along its outline (where its skin turns away from the eye): so the shape reads, not just a field of sparks
  vec3 nl = normalize(Up * sin(ph) / 0.88 + Z * cos(ph));
  float sil = 1.0 - abs(dot(nl, normalize(v)));
  g *= 0.22 + 0.78 * sil * sil;
  if (g < 0.01 || uGW.w <= 0.0 || z < 0.1){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 ndc = vec2(dot(v, uRight) / (z * uTan.x), dot(v, uUp) / (z * uTan.y));
  if (abs(ndc.x) > 1.05 || abs(ndc.y) > 1.05 || texture(uDepth, ndc * 0.5 + 0.5).a < length(v) - 0.03){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float coc = uAperture * abs(z - uFocus) / z * uRes.y;
  float size = max(coc, 1.0);
  vC = vec3(0.30, 0.85, 1.0) * 0.12 * g / (size * size * 0.30 + 0.70) * exp(-SIG_V * z * 0.5);
  vSharp = smoothstep(2.5, 1.0, coc);
  vSeed = h;
  vUV = cq;
  gl_Position = vec4(ndc + cq * (size + 1.0) / uRes * 2.0, 0.5, 1.0);
}`;

/* ---------------------------------------------------------------- small lit lives: rows of blue photophores */
const VS_GLOW = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aG;      // a light: position, brightness
layout(location = 1) in vec4 aK;      //          its colour, its size (m)
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan; uniform vec2 uRes;
uniform sampler2D uDepth;
out vec2 vUV; out float vI; out float vR; out vec3 vK; out float vSoft;
const vec3 SIG_V = vec3(0.10, 0.06, 0.045);
void main(){
  vec2 cq = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
  vec3 v = aG.xyz - uEye; float z = dot(v, uFwd);
  if (z < 0.05 || aG.w <= 0.001){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 ndc = vec2(dot(v, uRight) / (z * uTan.x), dot(v, uUp) / (z * uTan.y));
  if (abs(ndc.x) < 1.0 && abs(ndc.y) < 1.0 && texture(uDepth, ndc * 0.5 + 0.5).a < length(v) - 0.05){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float px = aK.w / (z * uTan.y) * uRes.y * 0.5 + 3.0;                   // its glow, in pixels
  vI = aG.w * exp(-0.06 * z) / (z * z + 0.3);
  vR = px;
  vK = aK.rgb;
  vSoft = step(0.025, aK.w);                                              // (a cloud of light, not a point)
  vUV = cq * px;
  gl_Position = vec4(ndc + cq * px / uRes * 2.0, 0.5, 1.0);
}`;
const FS_GLOW = `#version 300 es
precision highp float;
in vec2 vUV; in float vI; in float vR; in vec3 vK; in float vSoft;
out vec4 o;
void main(){
  float r = length(vUV);
  float g = (exp(-r * r / 1.2) * 1.4 + exp(-r / (vR * 0.35)) * 0.12) * smoothstep(vR, vR * 0.6, r);
  if (vSoft > 0.5) g = exp(-r * r / (vR * vR) * 3.5) * 0.35;              // a spreading cloud: soft all the way out
  o = vec4(vK * g * vI * 0.6, 1.0);
}`;

/* ---------------------------------------------------------------- developing the picture */
const FS_POST = `#version 300 es
precision highp float;
uniform sampler2D uA, uB; uniform vec2 uRes; uniform float uExp, uTime, uFade, uTea, uFlash;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uA, uv).rgb + texture(uB, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(vec3(0.80, 0.98, 1.30), vec3(1.0), smoothstep(0.0, 0.04, l * uExp));
  c = mix(c, c * vec3(1.15, 0.80, 0.48) + vec3(0.010, 0.006, 0.002), uTea);       // the water turning to tea
  c = aces(c * uExp);
  vec2 d = uv - 0.5; c *= 1.0 - 0.45 * dot(d, d);
  c = pow(c, vec3(1.0 / 2.2));
  // film grain, strongest in the dark (where it keeps the black from banding)
  float g = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5;
  c += g * (0.018 + 0.02 * (1.0 - c.g));
  c = mix(c, vec3(1.0, 0.93, 0.80), uFlash);
  o = vec4(max(c, 0.0) * uFade, 1.0);
}`;

const VS_FULL = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const MOBILE = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

W.deepsea = {
  ready: false, t: 0, fade: 1, vol: 1,
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.pSea = YL.makeProgram('sea', VS_FULL, FS_SEA);
    this.pTent = YL.makeProgram('sea-tentacles', VS_TENT, FS_TENT);
    this.pSnow = YL.makeProgram('sea-snow', VS_SNOW, FS_SNOW);
    this.pPost = YL.makeProgram('sea-post', VS_FULL, FS_POST);
    [this.pSea, this.pTent, this.pSnow, this.pPost].forEach(YL.checkProgram);
    // marine snow: a box of flakes round the eye
    const rnd = YL.rnd, N = this.nSnow = MOBILE ? 2400 : 4500, a = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) a.set([rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2, rnd()], i * 4);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    this.empty = gl.createVertexArray();
    // the creatures: where they drift, how big, which way up
    this.jel = [
      { kind: 0, p: [0.21, 0.05, -1.32], s: 0.17, up: [0.22, 1, 0.62], ph: 0.0, period: 1.6, v: [0, 0.012, 0.004] },
      { kind: 1, p: [-0.20, -0.13, -1.05], s: 0.070, up: [0.45, 1, -0.25], ph: 1.3, period: 0, v: [0.004, 0.003, 0] },
      { kind: 2, p: [0.55, -0.40, -2.5], s: 0.11, up: [-0.25, 1, 0.35], ph: 2.0, period: 2.6, v: [-0.006, 0.002, 0.004], alarm: 0 },
    ];
    // the whale: once in a long while it goes by, left to right, just beyond the light
    // its near side slides by a hand's breadth behind the light: all we see is skin, and once, the eye
    this.whale = { E0: [0.0, 0.12, -3.33], F: YL.V.norm([1, 0, -0.02]), speed: 0.55, cycle: 80, at: YL.QS.has('whale') ? +YL.QS.get('whale') : null, look: 0, blink: 0 };
    // debug: &whaletest=x — a fixed close-up on the eye (x: how far it has slid on), &look=0…1, &blink=0…1, &wl=x,y,z the light by the eye
    if (YL.QS.has('whaletest')) {
      const q = (k, d) => YL.QS.has(k) ? YL.QS.get(k).split(',').map(Number) : d;
      this.wtest = { x: +YL.QS.get('whaletest') || 0, L: q('wl', [0.07, 0.05, 0.20]), F: YL.V.norm(q('wf', [1, 0, -0.18])), E: q('we', [0.09, -0.02, -0.55]) };
      this.whale.look = +(YL.QS.get('look') || 0); this.whale.blink = +(YL.QS.get('blink') || 0);
    }
    // small lives in the dark: each a little fish with a row of blue lights along its side
    this.glow = [];
    for (let i = 0; i < 36; i++) {
      const a = rnd() * 6.283, e = (rnd() - 0.5) * 1.2, r = 1.6 + 2.0 * rnd();
      const home = [Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r * 0.7, -1.0 + Math.sin(a) * Math.cos(e) * r];
      this.glow.push({ home, p: home.slice(), v: [0, 0, 0], ph: rnd() * 6.283, lit: 0.5 + 0.5 * rnd(), orbit: 0.22 + 0.30 * rnd(), tilt: rnd() * 6.283, shy: 0.6 + 0.8 * rnd(), flash: 0 });
    }
    // the lights drawn as glows: the school's photophores, a siphonophore's string of bells, the clouds a frightened
    // shrimp spits out. Eight numbers each: where, how bright, colour, how big
    this.nGlow = 36 * 4 + 56 + 6;
    this.glowBuf = new Float32Array(this.nGlow * 8);
    this.gvao = gl.createVertexArray(); gl.bindVertexArray(this.gvao);
    this.gbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.gbuf); gl.bufferData(gl.ARRAY_BUFFER, this.glowBuf.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    // a siphonophore: a colony strung out along a thread three metres long, drifting through the dark far off
    this.siph = { p: [-1.6, 0.5, -3.6], dir: YL.V.norm([1, -0.25, 0.3]) };
    // the plankton along the whale's way
    const NP = this.nPlk = MOBILE ? 6000 : 14000, pa = new Float32Array(NP * 4);
    for (let i = 0; i < NP; i++) pa.set([rnd() * 2 - 1, Math.pow(rnd(), 0.8), (rnd() * 2 - 1) * 1.9, rnd()], i * 4);
    this.pvao = gl.createVertexArray(); gl.bindVertexArray(this.pvao);
    const pbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferData(gl.ARRAY_BUFFER, pa, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    this.pPlk = YL.makeProgram('sea-plankton', VS_PLK, FS_SNOW); YL.checkProgram(this.pPlk);
    this.pGlow = YL.makeProgram('sea-glow', VS_GLOW, FS_GLOW); YL.checkProgram(this.pGlow);
    if (!this.inited) this.t = +(YL.QS.get('wt') || 0);
    this.inited = true;
    // debug: &calm=s — the light has been left alone for s seconds (the small lives have come close)
    if (YL.QS.has('lure')) {
      this.hero.on = true; const V = YL.V, cam = this.camera(YL.canvasAspect(), this.t, true);
      const Lr = this.lure, d = +YL.QS.get('lure');
      Lr.state = d < 0.65 ? 'reveal' : 'approach'; Lr.k = 1; Lr.shown = d < 0.65 ? 1 : 0;
      Lr.p = V.add(this.hero.p, V.mul(V.norm([-1, -0.10, -0.15]), d)); Lr.dir = V.norm(V.sub(this.hero.p, Lr.p));
    }
    if (YL.QS.has('calm')) { this.hero.on = true; this.L = this.hero.p; for (let k = 0, n = +YL.QS.get('calm') * 30; k < n; k++) { this.t += 1 / 30; this.creaturesUpdate(1 / 30); } }
    // debug: &scare=s — then the hand moved, s seconds ago
    if (YL.QS.has('scare')) { this.hero.speed = 2.5; this.hero.moved = this.t; for (let k = 0, n = +YL.QS.get('scare') * 30; k < n; k++) { this.t += 1 / 30; this.hero.speed *= Math.exp(-0.1); this.creaturesUpdate(1 / 30); } }
    this.ready = true;
  },
  /* ---------------------------------------------------------------- 一粒光 in the deep
     Here it is the only light there is: what it reaches is all that can be seen. Your hand leads it; left alone it
     drifts. Keep still, and the small lit lives come out of the dark one by one to look at it; move, and they flash
     once and go dark and scatter (and the Atolla sets off its blue alarm). */
  hero: { on: false, p: [0, -0.02, -1.0], v: [0, 0, 0], aim: null, moved: -99, speed: 0, glow: 1, sink: 0 },
  pointer(nx, ny, speed) {
    const H = this.hero;
    H.aim = [Math.max(-0.8, Math.min(0.8, nx)), Math.max(-0.75, Math.min(0.75, ny))];
    if (speed > 0.25) { H.moved = this.t; H.speed = Math.max(H.speed, speed); }
  },
  heroUpdate(dt) {
    const H = this.hero, V = YL.V, cam = this.cam || this.camera(YL.canvasAspect(), this.t, YL.DBG.still);
    if (!H.on) return;
    // where it wants to be: under your hand, a metre out; or, left alone, drifting about the middle
    let tgt;
    const recent = this.t - H.moved < 4;
    if (this.rise > 0) {
      tgt = V.add(V.add(cam.eye, V.mul(cam.fwd, 0.9)), [0, 0.05, 0]);
    } else if (H.hold) {
      tgt = V.add(H.hold, [0.006 * Math.sin(this.t * 0.9), 0.006 * Math.sin(this.t * 0.7 + 1), 0]);
    } else if (H.aim && recent) {
      const rd = V.norm(V.add(cam.fwd, V.add(V.mul(cam.right, H.aim[0] * cam.tan[0]), V.mul(cam.up, H.aim[1] * cam.tan[1]))));
      tgt = V.add(cam.eye, V.mul(rd, 1.0));
    } else {
      const t = this.t;
      tgt = V.add(V.add(cam.eye, V.mul(cam.fwd, 1.0)), [0.10 * Math.sin(t * 0.19), -0.02 + 0.07 * Math.sin(t * 0.15 + 1), 0.06 * Math.sin(t * 0.11 + 2)]);
    }
    const look = this.greatLook(), k = this.rise > 0 ? 7 : 2.2 + 3 * look, c = this.rise > 0 ? 5 : 2.6 + 1.5 * look;   // rising (or while the whale goes over), it keeps up with the eye
    for (let i = 0; i < 3; i++) { H.v[i] += (tgt[i] - H.p[i]) * k * dt; H.v[i] *= Math.exp(-dt * c); H.p[i] += H.v[i] * dt; }
    // the eye follows only when the light nears the edge of the picture
    const v = V.sub(H.p, cam.eye), z = Math.max(V.dot(v, cam.fwd), 0.1);
    const nx = V.dot(v, cam.right) / (z * cam.tan[0]), ny = V.dot(v, cam.up) / (z * cam.tan[1]);
    const push = (x) => this.pass || this.greatLook() > 0.01 ? 0 : Math.sign(x) * Math.max(Math.abs(x) - 0.5, 0);
    this.yawOff = (this.yawOff || 0) + push(nx) * 0.9 * dt;
    this.pitchOff = Math.max(-0.6, Math.min(0.6, (this.pitchOff || 0) + push(ny) * 0.7 * dt));
    H.speed *= Math.exp(-dt * 3);
    H.fear = Math.max(0, (H.fear || 0) - dt / 3);
    H.sink += dt * 0.02;                                                     // it is going down, slowly
  },
  creaturesUpdate(dt) {
    const H = this.hero, V = YL.V, L = this.L || H.p;
    const still = this.t - H.moved;                                         // how long your hand has been still
    const scared = H.on && H.speed > 1.0;
    for (const g of this.glow) {
      g.ph += dt;
      if (scared && g.mode !== 'flee') { g.mode = 'flee'; g.flash = 1; }
      if (g.mode === 'flee') {
        // one bright flash, then dark, and away from the light
        const away = V.norm(V.sub(g.p, L));
        for (let i = 0; i < 3; i++) g.v[i] += away[i] * 1.6 * dt;
        g.lit += (0 - g.lit) * Math.min(1, dt * 3);
        if (Math.hypot(...V.sub(g.p, L)) > 2.6 && H.speed < 0.3) g.mode = 'roam';
      } else if (H.on && still > 2.0 + g.shy * 3.0) {
        // curious: one by one they come close and circle it, keeping their distance
        const a = g.ph * (0.25 + 0.1 * g.shy) + g.tilt;
        const off = [Math.cos(a) * g.orbit, Math.sin(a * 0.7 + g.tilt) * g.orbit * 0.5, Math.sin(a) * g.orbit];
        const tgt = V.add(L, off);
        for (let i = 0; i < 3; i++) g.v[i] += (tgt[i] - g.p[i]) * 0.35 * dt;
        g.lit += (1 - g.lit) * Math.min(1, dt * 0.8);
        g.mode = 'near';
      } else {
        // roaming in the dark, far off
        g.mode = 'roam';
        const tgt = V.add(g.home, [0.3 * Math.sin(g.ph * 0.2 + g.tilt), 0.2 * Math.sin(g.ph * 0.15), 0.3 * Math.cos(g.ph * 0.17 + g.tilt)]);
        for (let i = 0; i < 3; i++) g.v[i] += (tgt[i] - g.p[i]) * 0.15 * dt;
        g.lit += (0.55 - g.lit) * Math.min(1, dt * 0.5);
      }
      const damp = Math.exp(-dt * (g.mode === 'flee' ? 0.8 : 1.6));
      for (let i = 0; i < 3; i++) { g.v[i] *= damp; g.p[i] += g.v[i] * dt; }
      g.flash = Math.max(0, g.flash - dt * 2.5);
    }
    // the Atolla's alarm: a fast bright spinning ring, dying away
    const at = this.jel.find(j => j.kind === 2);
    if (at) at.alarm = scared ? 1 : Math.max(0, (at.alarm || 0) - dt / 4);
  },
  /* ---------------------------------------------------------------- the other light
     Out in the dark, a light just like ours: same warmth, the same breathing. It comes closer. When our light
     reaches what is behind it, there is a mouth. Ours shrinks back; the mouth snaps shut on nothing, the lure goes
     out, and the fish sinks back into the dark.                                                                 */
  lure: { state: 'off', t: 0, p: [0, 0, 0], k: 0, gape: 1, shown: 0 },
  startLure() {
    const Lr = this.lure, H = this.hero, V = YL.V, cam = this.cam || this.camera(YL.canvasAspect(), this.t, YL.DBG.still);
    Lr.state = 'appear'; Lr.t = 0; Lr.k = 0; Lr.gape = 1; Lr.shown = 0;
    // from far off to the left, level with ours, so that when it comes close we see it side-on
    Lr.p = V.add(V.add(cam.eye, V.mul(cam.fwd, 1.5)), V.add(V.mul(cam.right, -2.6), V.mul(cam.up, -0.15)));
  },
  lureUpdate(dt) {
    const Lr = this.lure, H = this.hero, V = YL.V;
    if (Lr.state === 'off') return;
    Lr.t += dt;
    const L = H.p, toHero = V.sub(L, Lr.p), dist = Math.hypot(...toHero), dir = V.mul(toHero, 1 / Math.max(dist, 1e-4));
    Lr.dir = dir;
    if (Lr.state === 'appear') { Lr.k = Math.min(1, Lr.t / 2.5); if (Lr.t > 2.5) { Lr.state = 'approach'; Lr.t = 0; } }
    else if (Lr.state === 'approach') {
      // drifting closer the way ours drifts: unhurried, a little wavering
      const sp = 0.16 * Math.min(1, (dist - 0.5) / 0.6 + 0.3);
      Lr.p = V.add(Lr.p, V.add(V.mul(dir, sp * dt), [0.03 * Math.sin(Lr.t * 1.1) * dt, 0.02 * Math.sin(Lr.t * 0.8) * dt, 0]));
      if (dist < 0.62) { Lr.state = 'reveal'; Lr.t = 0; this.fishSound(); }
    } else if (Lr.state === 'reveal') {
      // what is behind it comes into our light; ours shrinks and backs away
      Lr.shown = Math.min(1, Lr.shown + dt / 0.5);
      H.fear = 1;
      for (let i = 0; i < 3; i++) H.v[i] += -dir[i] * 0.5 * dt;
      if (Lr.t > 1.6) { Lr.state = 'snap'; Lr.t = 0; this.snapSound(); }
    } else if (Lr.state === 'snap') {
      Lr.gape = Math.max(0, 1 - Lr.t / 0.12);
      Lr.k = Lr.t < 0.1 ? 1 : 0;                                              // the lure goes out
      if (Lr.t > 0.5) { Lr.state = 'retreat'; Lr.t = 0; }
    } else if (Lr.state === 'retreat') {
      Lr.p = V.add(Lr.p, V.mul(dir, -0.7 * dt));
      Lr.shown = Math.max(0, Lr.shown - dt / 1.5);
      if (Lr.shown <= 0) Lr.state = 'gone';
    }
  },
  // the fish's head sits behind and below its lure, facing our light
  fishFrame() {
    const Lr = this.lure, V = YL.V, F = Lr.dir || [1, 0, 0];
    const Z = V.norm(V.cross(F, [0, 1, 0])), Up = V.cross(Z, F);
    // the lure is at local (0.40, 0.18, 0) from the head
    return { c: V.sub(V.sub(Lr.p, V.mul(F, 0.40)), V.mul(Up, 0.18)), F };
  },
  fishSound() {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.02;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(55, t0); o.frequency.linearRampToValueAtTime(48, t0 + 1.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.10, t0 + 0.8); g.gain.linearRampToValueAtTime(0, t0 + 1.8);
    o.connect(g); g.connect(S.bus); g.connect(S.wet); o.start(t0); o.stop(t0 + 2);
  },
  snapSound() {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.01;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    const src = ctx.createBufferSource(); src.buffer = b;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.35;
    src.connect(lp); lp.connect(g); g.connect(S.bus); g.connect(S.wet); src.start(t0);
  },
  /* ---- the whale's pass. It comes out of the dark from the left, a hand's breadth behind the light: first the line of
     its jaw with the knobs and barnacles slides through the light, then its eye. It slows and stops there; the eye turns
     to look at the light; it blinks once; and it goes on its way. The light goes to wait where the eye will stop. */
  startWhale(go = 9.0, rate = 1) {
    const V = YL.V, cam = this.cam || this.camera(YL.canvasAspect(), this.t, YL.DBG.still);
    const F = V.norm(V.add(cam.right, V.mul(cam.fwd, 0.18))), Z = V.norm(V.cross(F, [0, 1, 0])), U = V.cross(Z, F);
    const E = V.add(cam.eye, V.add(V.mul(cam.fwd, 0.55), V.add(V.mul(cam.right, 0.09), V.mul(cam.up, -0.02))));
    this.pass = { t0: this.t, E, F, go, rate };
    this.whale.F = F;
    this.hero.hold = V.add(E, V.add(V.mul(F, 0.07), V.add(V.mul(U, 0.05), V.mul(Z, 0.20))));
    this.whaleCall();
  },
  whalePassUpdate() {
    const P = this.pass; if (!P) return;
    const s = (this.t - P.t0) * P.rate, W = this.whale;
    W.look = YL.smooth(4.6, 5.6, s) * (1 - YL.smooth(P.go, P.go + 1.2, s));
    W.blink = Math.max(0, 1 - Math.abs(s - 7.2) / 0.16);
    if (s > P.go + 0.5) this.hero.hold = null;
  },
  whaleSlide() {
    const P = this.pass, s = (this.t - P.t0) * P.rate, u = Math.min(1, s / 4.8);
    // gliding in, slowing to a stop; later, gathering way again
    return -1.15 * Math.pow(1 - u, 2.2) + (s > P.go ? 0.05 * Math.pow(s - P.go, 2) : 0);
  },
  // the whale, close: a long low call, and the hush of the water it pushes aside
  whaleCall() {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.1;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t0); o.frequency.linearRampToValueAtTime(96, t0 + 2.2); o.frequency.exponentialRampToValueAtTime(58, t0 + 5.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(260, t0); bp.frequency.linearRampToValueAtTime(420, t0 + 2.4); bp.frequency.linearRampToValueAtTime(180, t0 + 5.5); bp.Q.value = 5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.09, t0 + 1.2); g.gain.setValueAtTime(0.09, t0 + 3.6); g.gain.linearRampToValueAtTime(0, t0 + 5.6);
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(S.wet); g.connect(S.bus);
    o.start(t0); o.stop(t0 + 5.8);
    const sr = ctx.sampleRate, n = Math.floor(sr * 6), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < n; i++) { b += ((Math.random() * 2 - 1) - b) * 0.02; d[i] = b * 4; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.setValueAtTime(90, t0); wl.frequency.linearRampToValueAtTime(260, t0 + 3); wl.frequency.linearRampToValueAtTime(80, t0 + 6);
    const wg = ctx.createGain(); wg.gain.setValueAtTime(0, t0); wg.gain.linearRampToValueAtTime(0.5, t0 + 2.5); wg.gain.linearRampToValueAtTime(0, t0 + 6);
    src.connect(wl); wl.connect(wg); wg.connect(S.bus); src.start(t0);
  },
  /* ---- before that, the whole whale goes by: a long dark body sliding past a little way behind the light, the water it
     stirs lit blue along it; its long white flipper sweeps up through the light; its flukes go by last */
  startGreat() {
    const V = YL.V, cam = this.cam || this.camera(YL.canvasAspect(), this.t, YL.DBG.still), L = this.hero.p;
    const F = V.norm(V.add(cam.right, V.mul(cam.fwd, -0.10))), Z = V.norm(V.cross(F, [0, 1, 0])), U = V.cross(Z, F);
    const mid = V.add(L, V.add(V.mul(Z, -3.0), V.mul(U, 6.5)));           // its way passes high over the light
    this.great = { t0: this.t, F, Z, U, mid, speed: 5.0, s0: -16.0, fin: false };
    if (YL.QS.has('gs')) this.great.t0 = this.t - (+YL.QS.get('gs') - this.great.s0) / this.great.speed;   // (debug: &gs=m, already this far along)
    this.greatSound();
  },
  // how far its middle is past the point of its way nearest the light (m), or null when it is gone
  greatS() { const G = this.great; if (!G) return null; const s = G.s0 + G.speed * (this.t - G.t0); return s < 14 ? s : null; },
  // how far the eye is tipped up to watch it go over (0 … 1)
  greatLook() { const G = this.great; if (!G) return 0; const a = this.t - G.t0; return YL.smooth(0, 2.2, a) * (1 - YL.smooth(4.0, 6.4, a)); },
  // the flipper, in the whale's frame: held out toward us, sweeping up through the light as it comes by
  finDir(s) {
    // (held out to the side like wings, drooping a little; one slow stroke down and back up as it goes over)
    const e = 0.25 * Math.sin((s + 9) * 0.55) - 0.05, a = YL.V.norm([-0.30, -0.30, 0.90]);
    return [a[0], a[1] * Math.cos(e) - a[2] * Math.sin(e), a[1] * Math.sin(e) + a[2] * Math.cos(e)];
  },
  greatUpdate(dt) {
    const s = this.greatS(), G = this.great, H = this.hero, V = YL.V;
    if (s === null) return;
    // the light shrinks from it, and the water it pushes ahead of it shoves the light aside
    H.fear = Math.max(H.fear || 0, 0.45 * YL.smooth(-12, -7, s) * (1 - YL.smooth(4, 8, s)));
    const near = Math.exp(-Math.pow((s + 2.3) / 1.1, 2));                   // the flipper going by
    for (let i = 0; i < 3; i++) H.v[i] += (G.F[i] * 0.35 + G.U[i] * 0.25) * near * dt;
    if (!G.fin && s > -3.3) { G.fin = true; this.finSound(); }
  },

  // the whole whale going by: the water it pushes, swelling and ebbing; a long low call, close; the plankton's hiss
  greatSound() {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.05, sr = ctx.sampleRate;
    const n = Math.floor(sr * 8), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < n; i++) { b += ((Math.random() * 2 - 1) - b) * 0.03; d[i] = b * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.setValueAtTime(70, t0); wl.frequency.linearRampToValueAtTime(320, t0 + 3.2); wl.frequency.linearRampToValueAtTime(60, t0 + 7.5);
    const wg = ctx.createGain(); wg.gain.setValueAtTime(0, t0); wg.gain.linearRampToValueAtTime(0.75, t0 + 3.0); wg.gain.linearRampToValueAtTime(0, t0 + 7.8);
    const pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(-0.8, t0); pan.pan.linearRampToValueAtTime(0.8, t0 + 7.5);
    src.connect(wl); wl.connect(wg); wg.connect(pan); pan.connect(S.bus); src.start(t0);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(52, t0 + 1.0); o.frequency.linearRampToValueAtTime(74, t0 + 3.2); o.frequency.exponentialRampToValueAtTime(40, t0 + 6.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(180, t0 + 1); bp.frequency.linearRampToValueAtTime(330, t0 + 3.4); bp.frequency.linearRampToValueAtTime(140, t0 + 6.5); bp.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0 + 1.0); g.gain.linearRampToValueAtTime(0.11, t0 + 2.4); g.gain.setValueAtTime(0.11, t0 + 4.4); g.gain.linearRampToValueAtTime(0, t0 + 6.6);
    o.connect(bp); bp.connect(g); g.connect(S.wet); g.connect(S.bus); o.start(t0 + 1.0); o.stop(t0 + 6.8);
    const hs = ctx.createBufferSource(); hs.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 5200; hp.Q.value = 1.2;
    const hg = ctx.createGain(); hg.gain.setValueAtTime(0, t0); hg.gain.linearRampToValueAtTime(0.05, t0 + 2.5); hg.gain.linearRampToValueAtTime(0, t0 + 8);
    hs.connect(hp); hp.connect(hg); hg.connect(S.wet); hs.start(t0, 1.3);
  },
  // the flipper going by close: a long soft rush of water
  finSound() {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.02, sr = ctx.sampleRate;
    const n = Math.floor(sr * 2.2), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(180, t0); bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.9); bp.frequency.exponentialRampToValueAtTime(220, t0 + 2.0);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.16, t0 + 0.8); g.gain.linearRampToValueAtTime(0, t0 + 2.1);
    src.connect(bp); bp.connect(g); g.connect(S.bus); g.connect(S.wet); src.start(t0);
  },
  // the small lives take fright all at once (something big is coming); three shrimps bolt, each leaving a cloud of
  // blue light where it was
  scare() {
    const H = this.hero, V = YL.V, cam = this.cam || this.camera(YL.canvasAspect(), this.t, YL.DBG.still); H.speed = 2.5; H.moved = this.t;
    this.puffs = [[-0.55, 0.20, 0.3], [0.62, -0.28, 0.6], [0.25, 0.42, -0.4]].map(([x, y, z], k) => ({ t0: this.t + 0.05 + k * 0.18, p: V.add(H.p, V.add(V.mul(cam.right, x), V.add(V.mul(cam.up, y), V.mul(cam.fwd, z)))) }));
  },
  // where the whale's eye is (how far along its pass), or null when it isn't near
  whalePos() {
    const W = this.whale, V = YL.V;
    if (this.wtest) { W.F = this.wtest.F; return { eye: V.add(this.wtest.E, V.mul(W.F, this.wtest.x)), x: this.wtest.x }; }
    if (this.pass) { const x = this.whaleSlide(); return x < 2.0 ? { eye: V.add(this.pass.E, V.mul(this.pass.F, x)), x } : null; }
    // (its pass is still being framed — see M4b; for now it only appears when asked for with &whale=)
    if (W.at === null) return null;
    const x = W.at;
    if (x < -6 || x > 18) return null;
    return { eye: V.add(W.E0, V.mul(W.F, x)), x };
  },
  // where the whale's eye looks, in its own frame: out and a little forward; or, as much as it can, at the light
  whaleGaze(wp, L) {
    const V = YL.V, F = this.whale.F, Z = V.norm(V.cross(F, [0, 1, 0])), U = V.cross(Z, F);
    const ball = V.add(wp.eye, V.mul(Z, -0.036)), l = V.sub(L, ball);
    const toL = V.norm([V.dot(l, F), V.dot(l, U), V.dot(l, Z)]), rest = V.norm([0.10, -0.03, 1]);
    // it can turn about 30° from rest
    const c = Math.max(-1, Math.min(1, V.dot(toL, rest))), ang = Math.acos(c), lim = Math.min(ang, 0.52);
    const k = this.whale.look * (ang > 1e-4 ? lim / ang : 0);
    return [...V.norm(V.add(V.mul(rest, 1 - k), V.mul(toL, k))), 0];
  },
  targets(w, h) {
    // (&seaq=k: draw the water at k of the screen's resolution — it is dark and soft; the recorder uses this to save time)
    const k = MOBILE ? 0.7 : +(YL.QS.get('seaq') || 1), sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
    if (this.A && this.A.w === sw && this.A.h === sh) return;
    const gl = YL.gl;
    for (const t of [this.A, this.B]) if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex.t); }
    this.A = YL.makeTarget(sw, sh, ['rgba16f']); this.B = YL.makeTarget(sw, sh, ['rgba16f']);
  },
  // the eye: drifting, weightless, turning a little
  camera(aspect, t, still) {
    const V = YL.V;
    if (this.wtest) {
      // (&wz=k: k× closer in on the eye, for looking at detail)
      const z = +(YL.QS.get('wz') || 1), ty = Math.tan(25 * Math.PI / 180) / z;
      const wa = YL.QS.has('wa') ? YL.QS.get('wa').split(',').map(Number) : [0, 0];
      const at = z > 1 ? V.norm(V.add(this.whalePos().eye, [wa[0], wa[1], 0])) : [0, 0, -1], right = V.norm(V.cross(at, [0, 1, 0]));
      return { eye: [0, 0, 0], fwd: at, right, up: V.cross(right, at), tan: [ty * aspect, ty] };
    }
    const eye = still ? [0, 0, 0] : [0.04 * Math.sin(t * 0.07), 0.03 * Math.sin(t * 0.05 + 1), 0.03 * Math.sin(t * 0.06 + 2)];
    // at the end it rises toward the light above, and the eye goes up with it, looking up
    const r = Math.min(1, (this.rise || 0) * 1.8), re = r * r * (3 - 2 * r);
    eye[1] += this.riseY || 0;
    // (yawOff, pitchOff: the eye turning, slowly, to keep the light in the picture)
    // (while the whole whale goes over, the eye tips up to watch it)
    const ls = this.greatLook();
    const yaw = (still ? 0 : 0.05 * Math.sin(t * 0.045)) * (1 - re) + (this.yawOff || 0) * (1 - re), pitch = (still ? 0 : 0.03 * Math.sin(t * 0.038 + 0.5)) + 1.0 * re + (this.pitchOff || 0) * (1 - re) + 0.85 * ls;
    const fwd = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const right = V.norm(V.cross(fwd, [0, 1, 0])), up = V.cross(right, fwd);
    const vfov = aspect < 0.9 ? 64 : 50, ty = Math.tan(vfov * Math.PI / 360);
    return { eye, fwd, right, up, tan: [ty * aspect, ty] };
  },
  // a point on the screen, a given distance into this water (to hand the light over at the same spot)
  unproject(nx, ny, dist, aspect) {
    const cam = this.camera(aspect, this.t, YL.DBG.still), V = YL.V;
    const rd = V.norm(V.add(cam.fwd, V.add(V.mul(cam.right, nx * cam.tan[0]), V.mul(cam.up, ny * cam.tan[1]))));
    return V.add(cam.eye, V.mul(rd, dist));
  },
  arrive(nx, ny, aspect) {
    this.hero.on = true; this.hero.p = this.unproject(nx, ny, 1.4, aspect); this.hero.v = [0, 0.06, 0]; this.hero.moved = -99;
  },
  // (world only) the light that will be 一粒光: a metre in front, drifting
  lightPos(t, cam) {
    if (this.wtest) { const wp = this.whalePos(), F = this.whale.F, Z = YL.V.norm(YL.V.cross(F, [0, 1, 0])), U = YL.V.cross(Z, F), l = this.wtest.L;
      return YL.V.add(wp.eye, YL.V.add(YL.V.mul(F, l[0]), YL.V.add(YL.V.mul(U, l[1]), YL.V.mul(Z, l[2])))); }
    if (this.hero.on) return this.hero.p.slice();
    const V = YL.V, still = YL.DBG.still;
    const off = still ? [0, -0.02, 0] : [0.07 * Math.sin(t * 0.21), -0.02 + 0.05 * Math.sin(t * 0.17 + 1), 0.05 * Math.sin(t * 0.13 + 2)];
    return V.add(V.add(cam.eye, V.mul(cam.fwd, 1.0)), off);
  },
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    // a big, dark space: a long reverb with no early reflections
    const sr = ctx.sampleRate, n = Math.floor(sr * 6), ir = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; lp += ((Math.random() * 2 - 1) - lp) * 0.05; d[i] = lp * Math.exp(-t / 1.8) * (t < 0.15 ? t / 0.15 : 1); } }
    const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 1.0; wet.connect(conv); conv.connect(bus);
    // the pressure of the water: a low hum that slowly breathes
    const brown = noiseBuffer(7.3, 'brown');
    const hl = ctx.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 110; hl.Q.value = 0.7;
    const hg = ctx.createGain(); hg.gain.value = 0;
    loop(brown, 0.6, hl); hl.connect(hg); hg.connect(bus);
    const drone = ctx.createOscillator(); drone.frequency.value = 41; const dg = ctx.createGain(); dg.gain.value = 0;
    drone.connect(dg); dg.connect(bus); drone.start();
    this.snd = { ctx, bus, wet, hl, hg, dg, nextSong: 5 + Math.random() * 5, nextClick: 2 };
  },
  // a whale singing somewhere far off: long gliding moans, a formant or two, almost all reverb
  song() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.05;
    const n = 2 + Math.floor(Math.random() * 3);
    let t = t0;
    for (let k = 0; k < n; k++) {
      const dur = 1.4 + Math.random() * 2.2, f0 = 90 + Math.random() * 160, f1 = f0 * (0.6 + Math.random() * 1.2);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f0 * 3, t); bp.frequency.linearRampToValueAtTime(f1 * 2.2, t + dur); bp.Q.value = 6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0, t + dur);
      o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(S.wet); g.connect(S.bus);
      const dry = ctx.createGain(); dry.gain.value = 0.15; g.connect(dry);
      o.start(t); o.stop(t + dur + 0.1);
      t += dur + 0.4 + Math.random() * 1.2;
    }
  },
  // a click or a creak: something small, somewhere in the dark
  click() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.02;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
    const src = ctx.createBufferSource(); src.buffer = b;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random() * 3000; bp.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = 0.04 + 0.05 * Math.random();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(bp); bp.connect(g);
    if (p) { p.pan.value = Math.random() * 1.6 - 0.8; g.connect(p); p.connect(S.wet); p.connect(S.bus); } else { g.connect(S.wet); g.connect(S.bus); }
    src.start(t0);
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.8);
    const br = 0.5 + 0.5 * Math.sin(this.t * 0.13) * Math.sin(this.t * 0.051 + 2);
    S.hg.gain.setTargetAtTime(0.10 + 0.08 * br, now, 1.2);
    S.dg.gain.setTargetAtTime(0.012 + 0.010 * br, now, 1.2);
    S.hl.frequency.setTargetAtTime(80 + 60 * br, now, 1.2);
    if ((S.nextSong -= dt) <= 0) { this.song(); S.nextSong = 22 + Math.random() * 18; }
    if ((S.nextClick -= dt) <= 0) { this.click(); S.nextClick = Math.random() < 0.3 ? 0.15 + Math.random() * 0.3 : 3 + Math.random() * 7; }
  },
  update(dt) {
    this.t += dt;
    this.sound(dt);
    this.heroUpdate(dt);
    this.lureUpdate(dt);
    this.whalePassUpdate();
    this.greatUpdate(dt);
    this.creaturesUpdate(dt);
    for (const j of this.jel) {
      // the moon jelly swims in pulses: a quick contraction, a long slow relaxing; it rises a little after each
      if (j.period) {
        const u = ((this.t + j.ph) / j.period) % 1;
        j.pulse = u < 0.28 ? YL.smooth(0, 0.28, u) : 1 - YL.smooth(0.28, 1, u);
        const push = u < 0.35 ? 0.06 : 0.008;
        for (let i = 0; i < 3; i++) j.p[i] += (j.v[i] + YL.V.norm(j.up)[i] * push * j.s * (j.kind === 0 ? 0.6 : 0.2)) * dt;
      } else { j.pulse = 0; for (let i = 0; i < 3; i++) j.p[i] += j.v[i] * dt; }
    }
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    this.targets(w, h);
    const A = this.A, B = this.B, still = YL.DBG.still;
    const cam = this.cam = this.camera(aspect, this.t, still);
    const L = this.L = this.lightPos(this.t, cam);
    const br = 1 + 0.07 * Math.sin(this.t * 2.1) + 0.03 * Math.sin(this.t * 5.3);       // the same breathing as in every world
    const LI = YL.mulc(YL.bb(2500), 0.30 * br * (this.light ?? 1) * (1 - 0.6 * (this.hero.fear || 0)));
    const Lr = this.lure, br2 = 1 + 0.07 * Math.sin(this.t * 2.1 + 0.9) + 0.03 * Math.sin(this.t * 5.3 + 2);
    const LI2 = Lr.state !== 'off' && Lr.state !== 'gone' ? YL.mulc(YL.bb(2500), 0.30 * br2 * Lr.k) : [0, 0, 0];
    // the creatures, far to near
    const V = YL.V, J = this.jel.slice().sort((a, b) => V.dot(V.sub(b.p, cam.eye), cam.fwd) - V.dot(V.sub(a.p, cam.eye), cam.fwd));
    const jp = new Float32Array(12), ju = new Float32Array(12), jk = new Float32Array(12);
    J.forEach((j, i) => { jp.set([...j.p, j.s], i * 4); ju.set([...V.norm(j.up), j.pulse || 0], i * 4); jk.set([j.kind, j.ph, j.alarm || 0, 0], i * 4); });
    const camU = (p) => { U(p, 'uEye', cam.eye); U(p, 'uFwd', cam.fwd); U(p, 'uRight', cam.right); U(p, 'uUp', cam.up); U(p, 'uTan', cam.tan); U(p, 'uL', L); U(p, 'uLI', LI); U(p, 'uL2', Lr.p); U(p, 'uLI2', LI2); U(p, 'uTime', this.t); };
    // 1) the water and what swims in it
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb); gl.viewport(0, 0, A.w, A.h);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.pSea.p);
    U(this.pSea, 'uRes', [A.w, A.h]); camU(this.pSea);
    gl.uniform4fv(this.pSea.u.uJP, jp); gl.uniform4fv(this.pSea.u.uJU, ju); gl.uniform4fv(this.pSea.u.uJK, jk);
    const wp = this.wp = this.whalePos();
    U(this.pSea, 'uWh', wp ? [...wp.eye, 1] : [0, 0, 0, 0]);
    U(this.pSea, 'uWhF', [...this.whale.F, this.whale.blink]);
    U(this.pSea, 'uWhG', wp ? this.whaleGaze(wp, L) : [0, 0, 1, 0]);
    U(this.pSea, 'uSurf', [this.surfY ?? 99, this.surf || 0, this.tea || 0, 0]);
    const ff = this.fishFrame();
    U(this.pSea, 'uFishP', [...ff.c, Lr.shown]); U(this.pSea, 'uFishF', [...ff.F, Lr.gape]);
    const gs = this.greatS(), G = this.great;
    const gw = gs === null ? [0, 0, 0, 0] : [...V.add(G.mid, V.mul(G.F, gs)), 1];
    U(this.pSea, 'uDown', 1.0);
    U(this.pSea, 'uGW', gw); U(this.pSea, 'uGF', G ? [...G.F, Math.sin(this.t * 1.3)] : [1, 0, 0, 0]); U(this.pSea, 'uGA', [...this.finDir(gs ?? 0), 0]);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2) the tentacles, added on
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pTent.p); camU(this.pTent);
    gl.uniform4fv(this.pTent.u.uJP, jp); gl.uniform4fv(this.pTent.u.uJU, ju); gl.uniform4fv(this.pTent.u.uJK, jk);
    gl.uniform1i(this.pTent.u.uSeg, 24);
    gl.drawArraysInstanced(gl.LINE_STRIP, 0, 24, 121);
    // 3) marine snow, into its own buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb); gl.viewport(0, 0, B.w, B.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.pSnow.p); camU(this.pSnow);
    // the focus: on the light; while the whale goes by it pulls back onto the whale's near side, then returns
    const dL = V.dot(V.sub(L, cam.eye), cam.fwd), rack = gs === null ? 0 : 0.85 * YL.smooth(-9.5, -6.5, gs) * (1 - YL.smooth(3, 7, gs));
    const focus = dL + rack * (V.dot(V.sub(V.add(G ? G.mid : L, G ? V.mul(G.U, -1.3) : [0, 0, 0]), cam.eye), cam.fwd) - dL);
    U(this.pSnow, 'uRes', [B.w, B.h]); U(this.pSnow, 'uFocus', focus); U(this.pSnow, 'uAperture', 0.018);
    YL.bindTex(this.pSnow, 'uDepth', A.tex, 0);
    U(this.pSnow, 'uSink', this.hero.sink % 4);
    gl.bindVertexArray(this.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nSnow);
    // the plankton the whale wakes
    if (gs !== null) {
      gl.useProgram(this.pPlk.p); camU(this.pPlk);
      U(this.pPlk, 'uRes', [B.w, B.h]); U(this.pPlk, 'uFocus', focus); U(this.pPlk, 'uAperture', 0.018);
      U(this.pPlk, 'uGW', gw); U(this.pPlk, 'uGF', [...G.F, 0]); U(this.pPlk, 'uGP', [...G.mid, gs]); U(this.pPlk, 'uGS', G.speed);
      YL.bindTex(this.pPlk, 'uDepth', A.tex, 0);
      gl.bindVertexArray(this.pvao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nPlk);
    }
    // the small lives: four photophores each, along the way it swims, twinkling
    const gb = this.glowBuf, put = (i, q, I, c, sz) => gb.set([...q, I, ...c, sz], i * 8);
    this.glow.forEach((g, i) => {
      const sp = Math.hypot(...g.v), dir = sp > 1e-4 ? V.mul(g.v, 1 / sp) : [1, 0, 0];
      for (let k = 0; k < 4; k++) {
        const q = V.add(g.p, V.mul(dir, (k - 1.5) * 0.012));
        const tw = 0.8 + 0.2 * Math.sin(this.t * 3 + i + k * 1.7);
        put(i * 4 + k, q, (g.lit * tw + g.flash * 3) * (k === 0 ? 1.4 : 1), [0.10, 0.62, 1.0], 0.010);
      }
    });
    // the siphonophore: bells along a slowly undulating thread; flashes run down it now and then
    let gi = 36 * 4;
    const Sp = this.siph, sd = Sp.dir, side = V.norm(V.cross(sd, [0, 1, 0]));
    for (let k = 0; k < 56; k++) {
      const u = k / 55, along = u * 3.0, wv = Math.sin(along * 2.2 - this.t * 0.5) * 0.12 + Math.sin(along * 0.9 + this.t * 0.2) * 0.25;
      const q = V.add(V.add(Sp.p, V.mul(sd, along + this.t * 0.05)), V.add(V.mul(side, wv), [0, 0.10 * Math.sin(along * 1.3 + this.t * 0.3), 0]));
      const run = Math.exp(-Math.pow(((this.t * 0.9) % 6.0) - u * 4.0, 2) * 3.0), bell = k % 7 === 0 ? 2.2 : 1;
      put(gi++, q, (0.22 + 1.6 * run) * bell * (k < 4 ? 2 : 1), k < 4 ? [0.8, 0.55, 1.0] : [0.35, 0.50, 1.0], k % 7 === 0 ? 0.016 : 0.008);
    }
    // the clouds of blue a frightened shrimp leaves behind it
    (this.puffs || []).forEach((pf, k) => {
      const a = this.t - pf.t0, grow = 1 - Math.exp(-Math.max(a, 0) / 0.5);
      put(gi + k, pf.p, a > 0 ? 3.0 * Math.exp(-a / 1.6) * (1 - Math.exp(-a / 0.08)) : 0, [0.15, 0.75, 1.0], 0.03 + 0.16 * grow);
    });
    gl.useProgram(this.pGlow.p);
    U(this.pGlow, 'uEye', cam.eye); U(this.pGlow, 'uFwd', cam.fwd); U(this.pGlow, 'uRight', cam.right); U(this.pGlow, 'uUp', cam.up); U(this.pGlow, 'uTan', cam.tan); U(this.pGlow, 'uRes', [B.w, B.h]);
    YL.bindTex(this.pGlow, 'uDepth', A.tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, gb);
    gl.bindVertexArray(this.gvao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nGlow);
    gl.disable(gl.BLEND);
    // 4) develop it
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.useProgram(this.pPost.p);
    U(this.pPost, 'uRes', [w, h]); U(this.pPost, 'uExp', 1.6); U(this.pPost, 'uTime', this.t); U(this.pPost, 'uFade', this.fade);
    U(this.pPost, 'uTea', this.tea || 0); U(this.pPost, 'uFlash', this.flash || 0);
    YL.bindTex(this.pPost, 'uA', A.tex, 0); YL.bindTex(this.pPost, 'uB', B.tex, 1);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  },
};
})();
