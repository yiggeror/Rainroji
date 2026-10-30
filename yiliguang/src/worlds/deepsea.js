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
uniform vec4 uWh;            // the whale: its eye (world), on/off
uniform vec4 uWhF;           //            which way it swims (unit), the fin's stroke
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

/* ---- the whale: a humpback going by at the edge of the light. Local frame at its eye: x forward, y up, z out of
   its right side (toward us). Only a stretch of it is ever in view: the head and eye, the long white flipper, the flank. */
float smin(float a, float b, float k){ float h = sat(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1.0 - h); }
float bodyR(float x){
  // the head narrows to the snout ahead of the eye; the body swells behind it and tapers away to the tail
  float f = sqrt(max(1.0 - pow((x + 3.0) / 5.8, 2.0), 0.0));
  float b = 1.0 - 0.75 * pow(sat((-x - 3.0) / 8.0), 1.4);
  return 2.0 * (x > -3.0 ? f : b);
}
vec3 finLocal(vec3 p, float stroke, out float s){
  // the flipper: from behind the eye, swept back, down and out toward us; it beats slowly
  vec3 root = vec3(-1.25, -0.75, 0.95);
  vec3 ax = normalize(vec3(-0.66, -0.50 + 0.25 * stroke, 0.24));
  vec3 ch = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));      // chord: leading edge forward-ish
  vec3 th = cross(ax, ch);
  vec3 q = p - root;
  s = dot(q, ax);
  return vec3(dot(q, ch), dot(q, th), s);
}
float whaleSDF(vec3 p, float stroke, out float part){
  float x = p.x;
  float r = bodyR(x);
  vec2 yz = vec2((p.y + 0.10 * x * 0.1) / 0.86, p.z);
  float body = (length(yz) - r) * 0.82;
  if (x > 2.8) body = length(p - vec3(2.8, -0.15, 0.0)) - 0.02;
  // the eye sits in a shallow socket; around it, folds of skin
  vec3 ep = p - vec3(0.0, -0.22, bodyR(0.0) * 0.98);
  float sock = length(ep * vec3(0.85, 1.7, 1.0)) - 0.085;
  body = max(body, -sock * 0.6 - 0.012);
  float eye = length(ep - vec3(0.0, 0.0, -0.012)) - 0.044;
  // the flipper
  float s;
  vec3 f = finLocal(p, stroke, s);
  float L = 3.9;
  float u = sat(s / L);
  float chord = mix(0.42, 0.10, u) * (1.0 - 0.6 * pow(u, 4.0)) + 0.035 * sin(s * 11.0) * step(0.0, f.x);   // scalloped leading edge
  float thick = mix(0.10, 0.03, u);
  float fin = (length(vec2(f.x / chord, f.y / thick)) - 1.0) * min(chord, thick) * 0.8;
  fin = max(fin, max(-s, s - L));
  float d = body;
  part = 0.0;
  if (eye < d){ d = eye; part = 2.0; }
  return d;
}
vec3 whaleN(vec3 p, float stroke){
  float pp; vec2 e = vec2(0.004, 0.0);
  return normalize(vec3(whaleSDF(p + e.xyy, stroke, pp) - whaleSDF(p - e.xyy, stroke, pp), whaleSDF(p + e.yxy, stroke, pp) - whaleSDF(p - e.yxy, stroke, pp), whaleSDF(p + e.yyx, stroke, pp) - whaleSDF(p - e.yyx, stroke, pp)));
}
float cell(vec2 p){   // distance to the nearest of a scatter of points (for barnacles)
  vec2 i = floor(p), f = fract(p); float m = 1.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 g = vec2(x, y); vec2 o2 = vec2(hash12(i + g), hash12(i + g + 17.0)); m = min(m, length(g + o2 - f)); }
  return m;
}
// returns the whale's colour (carried to the eye) and its distance, or T unchanged
vec3 whale(vec3 ro, vec3 rd, inout float T){
  if (uWh.w <= 0.0) return vec3(0.0);
  vec3 F = uWhF.xyz, Up = vec3(0.0, 1.0, 0.0), Z = normalize(cross(F, Up)); Up = cross(Z, F);
  // local frame: x along F, y up, z toward its right side
  vec3 rl = ro - uWh.xyz;
  vec3 o = vec3(dot(rl, F), dot(rl, Up), dot(rl, Z)), d = vec3(dot(rd, F), dot(rd, Up), dot(rd, Z));
  // bound: a fat capsule round the body's axis
  vec3 A = vec3(3.0, 0.0, 0.0), B = vec3(-12.0, 0.0, 0.0);
  vec3 ba = B - A, oa = o - A;
  float baba = dot(ba, ba), bard = dot(ba, d), baoa = dot(ba, oa), rdoa = dot(d, oa), oaoa = dot(oa, oa);
  float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - 6.0 * 6.0 * baba;
  float h = b * b - a * c;
  if (h < 0.0) return vec3(0.0);
  float t = max((-b - sqrt(h)) / a, 0.0), tEnd = min((-b + sqrt(h)) / a, T);
  float stroke = uWhF.w, part = 0.0;
  bool hit = false;
  for (int i = 0; i < 90; i++){
    vec3 p = o + d * t;
    float dd = whaleSDF(p, stroke, part);
    if (dd < 0.0015 * t){ hit = true; break; }
    t += dd * 0.75;
    if (t > tEnd) break;
  }
  if (!hit) return vec3(0.0);
  vec3 p = o + d * t;
  vec3 n = whaleN(p, stroke);
  // the skin's surface: fine wrinkles running round the body (across its length), pores, and folds round the eye
  float er = length((p - vec3(0.0, -0.22, bodyR(0.0) * 0.98)).xy * vec2(0.8, 1.9));    // the folds lie long and low, like lids
  float wr = sin(p.x * 70.0 + 6.0 * vnoise(p.yz * 6.0)) * 0.5 + 0.5;
  float fold = sin(er * 80.0 + 1.5) * smoothstep(0.36, 0.10, er) * smoothstep(0.06, 0.09, er);
  vec2 bump = vec2((vnoise(p.xy * 90.0) - 0.5) * 0.14 + (vnoise(p.xy * 23.0) - 0.5) * 0.10 + fold * 0.10, (vnoise(p.yx * 85.0) - 0.5) * 0.14 + fold * 0.55 + (vnoise(p.yx * 19.0 + 4.0) - 0.5) * 0.10);
  n = normalize(n + vec3(bump.x, bump.y, 0.0) * (part == 2.0 ? 0.0 : 1.0));
  // colour: dark slate above, paler below, with crisp-edged pale patches; scars; barnacles round the chin; the throat's grooves
  float under = smoothstep(-0.2, -0.9, p.y / max(bodyR(p.x), 0.3));
  float mott = vnoise(p.xy * 1.6 + p.z) * 0.6 + vnoise(p.xz * 4.0 + 3.0) * 0.4;
  float patch_ = smoothstep(0.60, 0.63, mott) * under;                      // the pale patches are on its belly
  vec3 alb = mix(vec3(0.085, 0.088, 0.095), vec3(0.34, 0.34, 0.33), patch_);
  alb *= 0.80 + 0.35 * vnoise(p.xy * 6.0 + p.z) + 0.15 * (vnoise(p.xy * 40.0) - 0.5);
  alb *= 1.0 - 0.45 * smoothstep(0.22, 0.05, er);                          // the skin darkens round the eye
  float groove = smoothstep(0.75, 1.0, sin(atan(p.y, p.z) * 70.0)) * under * step(p.x, 1.5);
  alb *= 1.0 - 0.45 * groove;
  // old scars: a few thin wandering pale lines, here and there
  vec2 sc = p.xy * vec2(2.2, 3.0) + p.z * 0.5;
  float scar = smoothstep(0.006, 0.0, abs(vnoise(sc * 1.7 + 7.0) - 0.5)) * smoothstep(0.70, 0.80, vnoise(p.xy * 0.9 + 11.0));
  alb = mix(alb, vec3(0.45, 0.45, 0.43), scar * 0.85);
  float barn = smoothstep(0.30, 0.18, cell(p.xy * 9.0 + p.z * 3.0)) * smoothstep(0.55, 0.85, vnoise(p.xy * 2.2)) * step(0.6, p.x) * smoothstep(-0.1, -0.5, p.y);
  alb = mix(alb, vec3(0.50, 0.48, 0.44) * (0.7 + 0.3 * vnoise(p.xy * 60.0)), barn);
  if (part == 1.0){
    // the flipper: white beneath, dark-mottled on top, its scalloped edge pale
    float sfin; vec3 fl = finLocal(p, stroke, sfin);
    float top = step(0.0, fl.y);
    alb = mix(vec3(0.55, 0.56, 0.55), vec3(0.08, 0.085, 0.09), top * smoothstep(0.3, 0.6, vnoise(fl.xz * 3.0)));
    alb *= 0.85 + 0.25 * vnoise(fl.xz * 14.0);
  }
  float spec = 0.25;
  if (part == 2.0){ alb = vec3(0.030, 0.018, 0.012); spec = 1.6; }           // a wet, dark brown eye
  // world point, light
  vec3 xw = ro + rd * t;
  vec3 E = lightAt(xw), Ld = normalize(uL - xw);
  vec3 nw = normalize(F * n.x + Up * n.y + Z * n.z);
  float diff = max(dot(nw, Ld), 0.0);
  vec3 hv = normalize(Ld - rd);
  float sp = pow(max(dot(nw, hv), 0.0), part == 2.0 ? 300.0 : 40.0) * spec * (0.04 + 0.96 * pow(1.0 - max(dot(nw, -rd), 0.0), 5.0) + 0.06);
  vec3 col = E * (alb * (diff * 0.9 + 0.1) + sp);
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
  float Tf = T; vec3 cf = fish(ro, rd, Tf);
  if (Tf < T){ c = cf; T = Tf; }
  // the creatures, composited far to near (JS sends them in that order); what is behind the whale is hidden
  for (int k = 0; k < 3; k++){
    Hit h = creature(k, ro, rd);
    if (h.t < T){ c = c * h.tr + h.c; }
    if (uJK[k].x == 2.0 && distance(uJP[k].xyz, ro) < T) c += atollaGlow(k, ro, rd);
  }
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

/* ---------------------------------------------------------------- small lit lives: rows of blue photophores */
const VS_GLOW = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aG;      // a photophore: position, brightness
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan; uniform vec2 uRes;
out vec2 vUV; out float vI; out float vR;
const vec3 SIG_V = vec3(0.10, 0.06, 0.045);
void main(){
  vec2 cq = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
  vec3 v = aG.xyz - uEye; float z = dot(v, uFwd);
  if (z < 0.05 || aG.w <= 0.001){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 ndc = vec2(dot(v, uRight) / (z * uTan.x), dot(v, uUp) / (z * uTan.y));
  float px = 0.010 / (z * uTan.y) * uRes.y * 0.5 + 3.0;                   // its glow, in pixels
  vI = aG.w * exp(-0.06 * z) / (z * z + 0.3);
  vR = px;
  vUV = cq * px;
  gl_Position = vec4(ndc + cq * px / uRes * 2.0, 0.5, 1.0);
}`;
const FS_GLOW = `#version 300 es
precision highp float;
in vec2 vUV; in float vI; in float vR;
out vec4 o;
void main(){
  float r = length(vUV);
  float g = exp(-r * r / 1.2) * 1.4 + exp(-r / (vR * 0.35)) * 0.12;
  o = vec4(vec3(0.10, 0.62, 1.0) * g * vI * 0.6, 1.0);
}`;

/* ---------------------------------------------------------------- developing the picture */
const FS_POST = `#version 300 es
precision highp float;
uniform sampler2D uA, uB; uniform vec2 uRes; uniform float uExp, uTime, uFade;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uA, uv).rgb + texture(uB, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(vec3(0.80, 0.98, 1.30), vec3(1.0), smoothstep(0.0, 0.04, l * uExp));
  c = aces(c * uExp);
  vec2 d = uv - 0.5; c *= 1.0 - 0.45 * dot(d, d);
  c = pow(c, vec3(1.0 / 2.2));
  // film grain, strongest in the dark (where it keeps the black from banding)
  float g = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5;
  c += g * (0.018 + 0.02 * (1.0 - c.g));
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
    this.whale = { E0: [0.0, 0.12, -3.33], F: YL.V.norm([1, 0, -0.02]), speed: 0.55, cycle: 80, at: YL.QS.has('whale') ? +YL.QS.get('whale') : null };
    // small lives in the dark: each a little fish with a row of blue lights along its side
    this.glow = [];
    for (let i = 0; i < 16; i++) {
      const a = rnd() * 6.283, e = (rnd() - 0.5) * 1.2, r = 1.6 + 2.0 * rnd();
      const home = [Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r * 0.7, -1.0 + Math.sin(a) * Math.cos(e) * r];
      this.glow.push({ home, p: home.slice(), v: [0, 0, 0], ph: rnd() * 6.283, lit: 0.5 + 0.5 * rnd(), orbit: 0.22 + 0.30 * rnd(), tilt: rnd() * 6.283, shy: 0.6 + 0.8 * rnd(), flash: 0 });
    }
    this.glowBuf = new Float32Array(16 * 4 * 4);
    this.gvao = gl.createVertexArray(); gl.bindVertexArray(this.gvao);
    this.gbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.gbuf); gl.bufferData(gl.ARRAY_BUFFER, this.glowBuf.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    this.pGlow = YL.makeProgram('sea-glow', VS_GLOW, FS_GLOW); YL.checkProgram(this.pGlow);
    this.t = +(YL.QS.get('wt') || 0);
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
    if (H.aim && recent) {
      const rd = V.norm(V.add(cam.fwd, V.add(V.mul(cam.right, H.aim[0] * cam.tan[0]), V.mul(cam.up, H.aim[1] * cam.tan[1]))));
      tgt = V.add(cam.eye, V.mul(rd, 1.0));
    } else {
      const t = this.t;
      tgt = V.add(V.add(cam.eye, V.mul(cam.fwd, 1.0)), [0.10 * Math.sin(t * 0.19), -0.02 + 0.07 * Math.sin(t * 0.15 + 1), 0.06 * Math.sin(t * 0.11 + 2)]);
    }
    for (let i = 0; i < 3; i++) { H.v[i] += (tgt[i] - H.p[i]) * 2.2 * dt; H.v[i] *= Math.exp(-dt * 2.6); H.p[i] += H.v[i] * dt; }
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
  // where the whale's eye is (how far along its pass), or null when it isn't near
  whalePos() {
    const W = this.whale, V = YL.V;
    // (its pass is still being framed — see M4b; for now it only appears when asked for with &whale=)
    if (W.at === null) return null;
    const x = W.at;
    if (x < -6 || x > 18) return null;
    return { eye: V.add(W.E0, V.mul(W.F, x)), x };
  },
  targets(w, h) {
    const k = MOBILE ? 0.7 : 1.0, sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
    if (this.A && this.A.w === sw && this.A.h === sh) return;
    const gl = YL.gl;
    for (const t of [this.A, this.B]) if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex.t); }
    this.A = YL.makeTarget(sw, sh, ['rgba16f']); this.B = YL.makeTarget(sw, sh, ['rgba16f']);
  },
  // the eye: drifting, weightless, turning a little
  camera(aspect, t, still) {
    const V = YL.V;
    const eye = still ? [0, 0, 0] : [0.04 * Math.sin(t * 0.07), 0.03 * Math.sin(t * 0.05 + 1), 0.03 * Math.sin(t * 0.06 + 2)];
    const yaw = still ? 0 : 0.05 * Math.sin(t * 0.045), pitch = still ? 0 : 0.03 * Math.sin(t * 0.038 + 0.5);
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
    U(this.pSea, 'uWhF', [...this.whale.F, 0.6 * Math.sin(this.t * 0.45)]);
    const ff = this.fishFrame();
    U(this.pSea, 'uFishP', [...ff.c, Lr.shown]); U(this.pSea, 'uFishF', [...ff.F, Lr.gape]);
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
    U(this.pSnow, 'uRes', [B.w, B.h]); U(this.pSnow, 'uFocus', V.dot(V.sub(L, cam.eye), cam.fwd)); U(this.pSnow, 'uAperture', 0.018);
    YL.bindTex(this.pSnow, 'uDepth', A.tex, 0);
    U(this.pSnow, 'uSink', this.hero.sink % 4);
    gl.bindVertexArray(this.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nSnow);
    // the small lives: four photophores each, along the way it swims, twinkling
    const gb = this.glowBuf;
    this.glow.forEach((g, i) => {
      const sp = Math.hypot(...g.v), dir = sp > 1e-4 ? V.mul(g.v, 1 / sp) : [1, 0, 0];
      for (let k = 0; k < 4; k++) {
        const q = V.add(g.p, V.mul(dir, (k - 1.5) * 0.012));
        const tw = 0.8 + 0.2 * Math.sin(this.t * 3 + i + k * 1.7);
        gb.set([...q, (g.lit * tw + g.flash * 3) * (k === 0 ? 1.4 : 1)], (i * 4 + k) * 4);
      }
    });
    gl.useProgram(this.pGlow.p);
    U(this.pGlow, 'uEye', cam.eye); U(this.pGlow, 'uFwd', cam.fwd); U(this.pGlow, 'uRight', cam.right); U(this.pGlow, 'uUp', cam.up); U(this.pGlow, 'uTan', cam.tan); U(this.pGlow, 'uRes', [B.w, B.h]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, gb);
    gl.bindVertexArray(this.gvao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 64);
    gl.disable(gl.BLEND);
    // 4) develop it
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.useProgram(this.pPost.p);
    U(this.pPost, 'uRes', [w, h]); U(this.pPost, 'uExp', 1.6); U(this.pPost, 'uTime', this.t); U(this.pPost, 'uFade', this.fade);
    YL.bindTex(this.pPost, 'uA', A.tex, 0); YL.bindTex(this.pPost, 'uB', B.tex, 1);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  },
};
})();
