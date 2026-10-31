/* ============================================================================
   世界二 · 盛夏午后 —— 手绘动画背景的画风
   ----------------------------------------------------------------------------
   色彩脚本：
     天：头顶是浓的天青（几乎发紫），往地平线褪成被暑气蒸白的浅青。
     云：一座高高的积雨云塔（入道云）和几朵晴天积云。受光面是带一点暖的纯白，背光面是冷的蓝灰，
         明暗交界是一条清楚的硬边（手绘动画的赛璐璐光影），边缘有薄处透光的亮边。
     山：两三层蓝紫色的远山，越远越淡（空气透视），向阳的山脊亮一点。
     地：一道起伏的绿坡，坡顶一棵孤零零的樟树；近处是齐腰的草，风吹过时一路倒伏，露出发亮的草背。
     光：太阳在左上方，下午三点左右的高光。
   做法：
     背景（天、云、山、坡、远处的草地）是一个全屏片元着色器，按视线方向画，每一层有自己的视差；
     近处的草是真的几何：两万多片草叶，实例化绘制，被风场吹弯，两三阶的赛璐璐明暗；4× MSAA。
     风场 = 持续的风 + 一阵阵的阵风波 + 光标划过的轨迹（光标就是风）。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});

const TOWER = [-0.30, 0.36];        // the great cumulus: azimuth, and the elevation the light flies up into
const SUN = (() => { const az = -0.75, el = 0.62; return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]; })();

const HEAD = `#version 300 es
precision highp float;
precision highp int;
#define PI 3.14159265359
float sat(float x){ return clamp(x, 0.0, 1.0); }
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
const mat2 FR = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = FR * p + vec2(3.1, 1.7); a *= 0.5; } return s; }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = FR * p + vec2(3.1, 1.7); a *= 0.5; } return s / 0.875; }
`;

// --------------------------------------------------------------------------- background: sky, clouds, hills, field
const FS_BG = HEAD + `
uniform vec2 uRes;
uniform vec3 uFwd, uRight, uUp;
uniform vec2 uTan;
uniform float uTime;
uniform vec3 uSun;
uniform vec4 uLobes[112];     // billows: x = azimuth (rad), y = elevation (rad), z = radius (rad), w = depth (painting order)
uniform vec4 uClouds[6];      // per cloud: x = base elevation, y = distance (0 near … 1 far), z = first billow, w = seed (<0: none)
uniform vec4 uCBox[6];        // per cloud: bounds (az min, az max, el min, el max)
uniform int uCCount[6];       // per cloud: number of billows
uniform vec2 uWind;           // ground-plane wind (m/s, x and z)
uniform float uGust;          // phase of the travelling gust bands
uniform int uMode;            // 0: the camera's view; 1: an equirect panorama seen from the room's window (for its drops)
uniform vec3 uEq;             // (azimuth range, elevation min, elevation max) of that panorama
uniform vec3 uEye;            // where the eye is over the field (it travels)
out vec4 o;
// a cloud's shadow on the field (shared with the grass): big soft-edged patches sailing downwind at a few m/s
float cloudShade(vec2 p, float t){ return smoothstep(0.50, 0.60, fbm3(p * 0.012 + vec2(t * 0.040, t * 0.012))); }

// ---- the painter's colours (display-referred)
const vec3 SKY_Z = vec3(0.10, 0.30, 0.78);
const vec3 SKY_M = vec3(0.26, 0.55, 0.92);
const vec3 SKY_H = vec3(0.72, 0.87, 0.95);
const vec3 CL_LIT = vec3(1.00, 0.99, 0.96);
const vec3 CL_MID = vec3(0.85, 0.89, 0.97);
const vec3 CL_SHD = vec3(0.60, 0.67, 0.84);
const vec3 CL_DEEP = vec3(0.46, 0.53, 0.73);

vec3 skyCol(float el, float az){
  float t = sat(el / 0.85);
  vec3 c = mix(SKY_H, SKY_M, smoothstep(0.0, 0.32, t));
  c = mix(c, SKY_Z, smoothstep(0.3, 1.0, t));
  vec2 sa = vec2(atan(uSun.x, -uSun.z), asin(uSun.y));
  float dsun = length(vec2((az - sa.x) * cos(el), el - sa.y));
  c += vec3(0.18, 0.16, 0.10) * exp(-dsun * 2.0) * 0.6;           // the sun's side of the sky, brighter and warmer
  c = mix(c, vec3(0.86, 0.93, 0.95), exp(-max(el, 0.0) * 25.0) * 0.6);   // heat haze along the horizon
  return c;
}

// A cumulus as a background painter paints it: one big light falls across the whole mass (lit on the left,
// blue shadow on the right, a crisp terminator wobbling like a brush), and the billows are relief on that
// surface: their caps catch the light, the creases between them sink into shadow.
//   silhouette: a tight smooth union of the billows;  relief: a soft-max height field of their spherical caps.
vec4 cloud(vec2 q, vec2 qw, int i0, int n, vec4 C, vec4 B, float aa){
  vec3 Ls = normalize(vec3(uSun.x * 1.7, uSun.y, 0.5));
  const float K = 0.005, KH = 140.0;
  float acc = 0.0, hs = 0.0, hmax = 0.0; vec2 gs = vec2(0.0);
  for (int i = i0; i < i0 + n; i++){
    vec4 L = uLobes[i];
    vec2 d = qw - L.xy; float len = length(d);
    float ang = atan(d.y, d.x);
    float lump = 1.0 + 0.09 * (vnoise(vec2(ang * 2.2 + L.w * 40.0, L.w * 9.0)) - 0.5);
    acc += exp(-(len - L.z * lump) / K);
    float r = L.z * lump;
    if (len < r){
      float hc = sqrt(r * r - len * len) + L.w * 0.004;
      float e = exp(KH * (hc - 0.08));
      hs += e; gs += e * (-d / max(hc, 2e-3)); hmax = max(hmax, hc);
    }
  }
  float d = -K * log(max(acc, 1e-30));
  // a solid core inside the silhouette (the billows make the outline; the body never shows sky through it)
  float xc0 = 0.5 * (B.x + B.y), hw0 = 0.5 * (B.y - B.x) - 0.04;
  vec2 ca = vec2(xc0, C.x + 0.02), cb = vec2(xc0, max(B.w - hw0 * 0.9, C.x + 0.03));
  vec2 pa = qw - ca, ba = cb - ca;
  float core = length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - hw0 * 0.5;
  d = min(d, core);
  d = max(d, C.x - qw.y);                                           // the flat base
  float alpha = smoothstep(aa, -aa, d);
  if (alpha <= 0.0) return vec4(0.0);
  vec2 grad = hs > 0.0 ? gs / hs : vec2(0.0);
  float hsoft = hs > 0.0 ? log(hs) / KH + 0.08 : 0.0;
  float crease = sat((hsoft - hmax) * KH / 0.69);                  // 1 where two billows meet
  // the mass: a rounded column (horizontal bulge from the centre line, a domed top)
  float xc = 0.5 * (B.x + B.y), hw = 0.5 * (B.y - B.x) - 0.03;
  vec3 Nm = normalize(vec3((qw.x - xc) / max(hw, 0.02) * 0.95, 0.15 + 0.9 * smoothstep(B.w - 0.16, B.w - 0.02, qw.y), 0.6));
  vec3 Nb = normalize(vec3(-grad * 0.8, 1.0));                    // height field normal: (−∇h, 1)
  vec3 N = normalize(Nm + vec3(Nb.xy * 0.9, 0.0));
  float wob = (vnoise(qw * 45.0 + C.w * 3.0) - 0.5) * 0.08 + (vnoise(qw * 200.0) - 0.5) * 0.04;
  float lam = dot(N, Ls) + wob;
  // four painted tones: a white highlight on the billow caps, warm-white light, a pale blue half-tone, blue shadow
  float hi = smoothstep(0.62, 0.66, lam), lit = smoothstep(0.24, 0.29, lam), mid = smoothstep(-0.10, -0.05, lam);
  vec3 c = mix(CL_SHD, mix(CL_MID, CL_LIT * vec3(0.985, 0.98, 0.965), lit), mid);
  c = mix(c, vec3(1.0, 1.0, 0.99), hi * 0.9);
  // on the sunlit side the billows still show: their undersides turned from the sun take a lilac half-tone
  float away = smoothstep(0.05, -0.25, dot(Nb.xy, normalize(Ls.xy)) * length(Nb.xy) * 2.0);
  c = mix(c, mix(CL_MID, CL_SHD, 0.25), away * lit * 0.55);
  c = mix(c, CL_DEEP, smoothstep(-0.38, -0.55, lam) * 0.6);
  // creases: a soft seam where the billows meet, mostly in the shade
  c = mix(c, c * vec3(0.84, 0.87, 0.95), crease * (1.0 - lit) * 0.7);
  // the lower body is shaded by the mass above; ground light warms the very bottom
  float h = (qw.y - C.x) / max(B.w - C.x, 0.05);
  c = mix(c, c * vec3(0.84, 0.87, 0.95), smoothstep(0.3, 0.0, h) * 0.55);
  c += vec3(0.05, 0.045, 0.0) * smoothstep(0.08, 0.0, h) * (1.0 - lit);
  // a thin rim of light along the sunward silhouette, where the cloud is thinnest
  c += vec3(0.06, 0.06, 0.04) * smoothstep(-0.005, 0.0, d) * sat(dot(normalize(vec2(qw.x - xc, 0.3)), normalize(Ls.xy)) * 2.0);
  c *= 0.975 + 0.04 * vnoise(qw * vec2(240.0, 100.0) + C.w);     // brush texture
  c = mix(c, mix(SKY_H, SKY_M, 0.35), C.y * 0.5);                // aerial perspective
  return vec4(c, alpha);
}

float ridge(float x, float seed){ float h = 0.0, a = 0.5, f = 1.0; for (int i = 0; i < 5; i++){ h += a * (1.0 - abs(2.0 * vnoise(vec2(x * f + seed, seed)) - 1.0)); f *= 2.1; a *= 0.5; } return h; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes, ndc = uv * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + ndc.x * uTan.x * uRight + ndc.y * uTan.y * uUp);
  if (uMode == 1){ float a = ndc.x * uEq.x, e = mix(uEq.y, uEq.z, uv.y); rd = vec3(sin(a) * cos(e), sin(e), -cos(a) * cos(e)); }
  float az = atan(rd.x, -rd.z), el = asin(clamp(rd.y, -1.0, 1.0));
  vec3 col = skyCol(el, az);
  float aaE = max(fwidth(el), 1e-4) * 1.2;                         // (derivatives taken here, in uniform control flow)
  // ---- clouds, far to near; each only inside its own bounds
  if (el > 0.0){
    vec2 q0 = vec2(az, el);
    vec2 rag = (vec2(fbm3(q0 * 34.0), fbm3(q0 * 34.0 + 7.0)) - 0.5) * 0.008 + (vec2(vnoise(q0 * 150.0), vnoise(q0 * 150.0 + 3.0)) - 0.5) * 0.002;
    for (int ci = 0; ci < 6; ci++){
      vec4 C = uClouds[ci];
      if (C.w < 0.0) continue;
      vec2 q = vec2(az + uTime * 0.0012 * (1.0 - C.y * 0.6), el);
      vec4 B = uCBox[ci];
      if (q.x < B.x || q.x > B.y || q.y < B.z || q.y > B.w) continue;
      vec4 cl = cloud(q, q + rag, int(C.z), uCCount[ci], C, B, aaE);
      col = mix(col, cl.rgb, cl.a);
    }
  }
  // ---- three mountain ranges: the farthest palest and highest, nearer ones darker and lower
  for (int m = 0; m < 3; m++){
    float fm = float(m);
    float fq = 1.3 + fm * 1.1;
    float rg = ridge(az * fq + 2.0 + fm, 11.0 + fm * 7.0);
    float h = 0.006 + (0.075 - 0.02 * fm) * rg * rg - 0.004 * fm;
    float inside = smoothstep(aaE, -aaE, el - h);
    if (inside > 0.0){
      vec3 c = mix(vec3(0.58, 0.66, 0.90), vec3(0.34, 0.44, 0.74), fm / 2.0);
      float slope = (ridge(az * fq + 2.0 + fm - 0.003, 11.0 + fm * 7.0) - ridge(az * fq + 2.0 + fm + 0.003, 11.0 + fm * 7.0)) * rg * 2.0;
      c *= 1.0 + 0.22 * smoothstep(0.0, 0.015, slope);                 // slopes turned to the sun (left)
      c = mix(c, SKY_H, exp(-max(h - el, 0.0) * 50.0) * (0.35 - fm * 0.08));   // haze pooled at their feet
      col = mix(col, c, inside);
    }
  }
  // ---- the near hill: a long green rise with a lone camphor tree on its crest
  float hill = 0.004 + 0.020 * smoothstep(-1.0, 0.3, az) * smoothstep(1.2, 0.3, az) + 0.003 * sin(az * 6.0 + 1.0) + 0.002 * fbm3(vec2(az * 9.0, 1.0));
  float onHill = smoothstep(aaE, -aaE, el - hill);
  if (onHill > 0.0){
    float below = hill - el;
    vec3 g = mix(vec3(0.58, 0.76, 0.28), vec3(0.32, 0.56, 0.22), smoothstep(0.0, 0.04, below));
    g *= 0.94 + 0.07 * sin(az * 140.0 + below * 380.0 + vnoise(vec2(az * 30.0, below * 80.0)) * 3.0);
    col = mix(col, mix(g, SKY_H, 0.12), onHill);
  }
  {
    // the tree: a dark trunk, a crown of round clumps lit from the left; its shadow pools on the slope to the right
    vec2 tq = vec2(az - 0.26, el - 0.021);
    tq.x -= (0.0012 * sin(uTime * 1.1) + 0.0007 * sin(uTime * 2.3 + 1.0)) * smoothstep(0.02, 0.06, tq.y);   // the crown tossing in the wind
    float trunk = max(abs(tq.x + 0.06 * tq.y) - 0.0018 * (1.0 + smoothstep(0.0, -0.012, tq.y)), max(tq.y - 0.03, -tq.y - 0.006));
    float crown = 1e9; vec3 cn = vec3(0.0); float cw = 0.0;
    for (int i = 0; i < 14; i++){
      float fi = float(i);
      float ang = fi * 2.4, rad = sqrt(hash11(fi * 3.1));
      vec2 c = vec2(cos(ang) * rad * 0.030, 0.045 + sin(ang) * rad * 0.018 + 0.004 * hash11(fi * 7.7));
      float r = 0.010 + 0.007 * hash11(fi * 1.9);
      vec2 dd = tq - c; float l = length(dd);
      crown = min(crown, l - r);
      float w = exp(-max(l - r, 0.0) * 500.0);
      cn += w * vec3(dd / r, sqrt(max(1.0 - (l / r) * (l / r), 0.0))); cw += w;
    }
    crown += (fbm3(tq * 700.0) - 0.5) * 0.004;
    float tr = smoothstep(aaE, -aaE, min(trunk, crown));
    // its shadow on the grass
    float shd = smoothstep(0.004, -0.002, length((tq - vec2(0.022, -0.0035)) * vec2(1.0, 6.0)) - 0.03) * onHill;
    col = mix(col, col * vec3(0.55, 0.68, 0.72), shd * 0.7);
    if (tr > 0.0){
      vec3 N = normalize(cn / max(cw, 1e-6));
      float lam = dot(N, normalize(vec3(uSun.x * 1.7, uSun.y, 0.5))) + (vnoise(tq * 1200.0) - 0.5) * 0.25;
      vec3 c = mix(vec3(0.10, 0.27, 0.24), vec3(0.27, 0.50, 0.20), smoothstep(-0.05, 0.05, lam));
      c = mix(c, vec3(0.55, 0.74, 0.27), smoothstep(0.45, 0.55, lam));
      c = trunk < crown ? vec3(0.17, 0.14, 0.13) : c;
      col = mix(col, mix(c, SKY_H, 0.08), tr);
    }
  }
  // ---- the field between the hill and the near grass, with gust bands running over it and cloud shadows
  if (el < hill){
    float tg = 0.85 / max(-rd.y, 0.003);
    vec2 gp = uEye.xz + vec2(rd.x, rd.z) * tg;
    vec3 g = vec3(0.30, 0.55, 0.19);
    vec2 wd = normalize(uWind + 1e-4);
    float band = dot(gp, wd) * 0.12 - uGust;
    float wave = smoothstep(0.55, 1.0, sin(band + 1.5 * fbm3(gp * 0.05)) * 0.5 + 0.5) * (0.6 + 0.4 * fbm3(gp * 0.08 + uGust * 0.3));
    g = mix(g, vec3(0.64, 0.80, 0.38), wave * 0.65);
    g *= 0.86 + 0.18 * fbm3(gp * vec2(0.25, 0.4));
    g *= 1.0 - 0.30 * cloudShade(gp, uTime);                          // cloud shadows sailing over
    g = mix(g, SKY_H * 0.96, sat(tg / 700.0) * 0.5);
    col = mix(col, g, (el < 0.0 ? 1.0 : 0.0) * (1.0 - onHill * step(0.0, el)));
    if (el < 0.0 && onHill > 0.0 && tg > 300.0) col = mix(col, g, 0.0);
  }
  col *= 0.985 + 0.03 * hash12(floor(gl_FragCoord.xy * 0.5));     // the paper's tooth
  o = vec4(col, 1.0);
}`;

// --------------------------------------------------------------------------- near grass: instanced blades
const VS_GRASS = HEAD + `
layout(location = 0) in vec4 aB;     // x, z (m), height (m), width (m)
layout(location = 1) in vec4 aC;     // phase, stiffness, colour variation, lean angle
uniform vec3 uEye, uFwd, uRight, uUp;
uniform vec2 uTan;
uniform float uTime;
uniform vec2 uWind;
uniform float uGust;
uniform vec4 uStroke[8];             // the pointer as wind: recent stroke points on the ground (x, z, strength, age)
uniform vec4 uTile;                  // the blades' tile: width (x), depth (z) — it travels with the eye
out vec3 vC; out float vT; out float vSide; out float vDepth; out float vShadow; out vec3 vWP;
// wind at a point of the field: the steady wind, travelling gust bands, and the pointer's stroke
vec2 windAt(vec2 p, float t){
  vec2 wd = normalize(uWind + 1e-4);
  float band = dot(p, wd) * 0.12 - uGust;
  float gust = smoothstep(0.3, 1.0, sin(band + 1.5 * fbm3(p * 0.05)) * 0.5 + 0.5);
  vec2 w = uWind * (0.35 + 0.9 * gust) + wd * 0.25 * sin(t * 1.7 + p.x * 0.9 + p.y * 0.7);
  for (int i = 0; i < 8; i++){
    vec4 s = uStroke[i];
    if (s.z <= 0.0) continue;
    vec2 d = p - s.xy; float r2 = dot(d, d);
    w += normalize(d + 1e-4) * s.z * exp(-r2 / 2.0) * exp(-s.w * 1.2) * 3.0;
  }
  return w;
}
void main(){
  int vid = gl_VertexID;                               // 7 vertices: 3 segments + tip, as a strip
  float seg = float(vid / 2) / 3.0;
  float side = (vid == 6) ? 0.0 : (float(vid & 1) * 2.0 - 1.0);
  float h = aB.z, wdt = aB.w;
  vec2 base = aB.xy;
  if (uTile.x > 0.0){
    // wrap into the tile round the eye: ahead of it out to the tile's depth, and either side
    base.x = uEye.x + mod(base.x - uEye.x + uTile.x * 0.5, uTile.x) - uTile.x * 0.5;
    base.y = uEye.z - 0.45 - mod(uEye.z - 0.45 - base.y, uTile.y);
    h *= smoothstep(uTile.y + 0.45, uTile.y - 2.0, uEye.z - base.y);       // (grows up out of the far edge, not popping)
  }
  vec2 wv = windAt(base, uTime + aC.x);
  float bend = length(wv) / (1.0 + aC.y);
  // the blade's own lean, then the wind bends it more toward the tip (quadratic)
  vec2 dir = vec2(cos(aC.w), sin(aC.w)) * 0.22 + wv / (1.0 + aC.y) * 0.34;
  float s = seg * seg;
  vec3 p = vec3(base.x, 0.0, base.y);
  p.xz += dir * s * h;
  p.y = h * seg * (1.0 - 0.35 * sat(bend * 0.3) * s);
  // width: a tapering blade, turned a little to face the camera
  vec3 toEye = normalize(uEye - p);
  vec3 wdir = normalize(cross(vec3(0.0, 1.0, 0.0), toEye) + vec3(0.3 * cos(aC.x * 7.0), 0.0, 0.3 * sin(aC.x * 7.0)));
  p += wdir * side * wdt * (1.0 - seg) * 0.5;
  vec3 v = p - uEye;
  float z = dot(v, uFwd);
  vec2 ndc = vec2(dot(v, uRight) / (z * uTan.x), dot(v, uUp) / (z * uTan.y));
  gl_Position = z < 0.05 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(ndc, clamp(z / 80.0, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  vT = seg; vSide = side; vDepth = z; vWP = p;
  // facing the sun or not (by the blade's bend direction); bent blades show their paler backs
  float face = dot(normalize(vec3(dir.x, 0.6, dir.y)), normalize(vec3(-0.68, 0.6, -0.25)));
  // colour: per blade, and per clump (grass grows in patches of slightly different greens)
  float clump = vnoise(base * 0.7) * 0.6 + vnoise(base * 2.3) * 0.4;
  vC = vec3(mix(aC.z, clump, 0.6), face, sat(bend * 0.4));
  // a cloud's shadow drifting over the field
  vShadow = smoothstep(0.50, 0.60, fbm3(base * 0.012 + vec2(uTime * 0.040, uTime * 0.012)));
}`;
const FS_GRASS = HEAD + `
in vec3 vC; in float vT; in float vSide; in float vDepth; in float vShadow; in vec3 vWP;
uniform vec3 uSun;
uniform vec3 uHP; uniform float uHOn;      // 一粒光 in this world: its warm light on the blades, painted in two steps
out vec4 o;
void main(){
  // cel steps: a dark base in the grass's own shade, a lit middle, a bright tip where the sun catches it
  vec3 shade = mix(vec3(0.08, 0.25, 0.21), vec3(0.16, 0.34, 0.19), vC.x);
  vec3 lit = mix(vec3(0.30, 0.56, 0.19), vec3(0.50, 0.71, 0.21), vC.x);
  vec3 tip = mix(vec3(0.66, 0.82, 0.32), vec3(0.82, 0.88, 0.44), vC.x);
  float l = smoothstep(0.32, 0.38, vT + vC.y * 0.25 + (vC.x - 0.5) * 0.2 + vSide * 0.08 * vC.y);
  vec3 c = mix(shade, lit, l);
  c = mix(c, tip, smoothstep(0.78, 0.86, vT + vC.z * 0.25) * 0.8);
  c = mix(c, vec3(0.72, 0.86, 0.45), vC.z * 0.45 * smoothstep(0.3, 0.9, vT));      // laid over by the wind: pale backs
  c = mix(c, mix(shade, vec3(0.20, 0.38, 0.30), 0.5), vShadow * 0.7);   // under a cloud's shadow
  float hd = length(vWP - uHP);
  c = mix(c, c * 1.15 + vec3(0.22, 0.16, 0.02), (1.0 - smoothstep(0.85, 0.9, hd)) * 0.55 * uHOn);
  c = mix(c, vec3(1.0, 0.93, 0.62), (1.0 - smoothstep(0.38, 0.42, hd)) * smoothstep(0.5, 0.9, vT) * 0.8 * uHOn);
  // a little aerial perspective for the farther blades
  c = mix(c, vec3(0.74, 0.88, 0.94), sat(vDepth / 120.0) * 0.6);
  o = vec4(c, 1.0);
}`;
/* ---------------------------------------------------------------------------- the field's small lives, painted as
   cels: dandelion seeds sailing on the wind, cabbage-white and yellow butterflies, dragonflies that hang in the air
   and then dart, and swallows swooping low over the grass. Each is one quad turned to the eye and lined up with the
   way it is moving; its shape is drawn in the fragment shader. Motion is a function of time (no state). */
const VS_CRIT = HEAD + `
layout(location = 0) in vec4 aA;     // kind (0 seed, 1 butterfly, 2 dragonfly, 3 swallow), x, y, z of its home
layout(location = 1) in vec4 aD;     // seed, size (m), colour index, -
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan; uniform float uTime; uniform vec2 uWind;
out vec2 vQ; flat out int vKind; out float vPhase; out float vCol; out float vDepth;
vec3 posAt(float t){
  float k = aA.x, sd = aD.x;
  vec3 h = aA.yzw;
  if (k < 0.5){
    // a seed: carried downwind, rising and sinking a little; the swarm is a tile round the eye
    vec3 p = h + vec3(uWind.x, 0.0, uWind.y) * t * 0.55 + vec3(0.25 * sin(t * 0.7 + sd * 9.0), 0.12 * sin(t * 1.1 + sd * 5.0), 0.25 * cos(t * 0.6 + sd * 3.0));
    p.x = uEye.x + mod(p.x - uEye.x + 6.0, 12.0) - 6.0;
    p.z = uEye.z + 1.0 - mod(uEye.z + 1.0 - p.z, 16.0);
    p.y = 0.45 + mod(p.y, 1.6);
    return p;
  }
  if (k < 1.5){
    // a butterfly: an aimless looping flight round its patch of grass, bobbing with each beat
    return h + vec3(0.9 * sin(t * 0.55 + sd * 6.0) + 0.3 * sin(t * 1.7 + sd), 0.12 * sin(t * 3.1 + sd * 4.0) + 0.08 * sin(t * 5.3), 0.6 * cos(t * 0.43 + sd * 2.0));
  }
  if (k < 2.5){
    // a dragonfly: hangs in the air, then darts a metre or so, then hangs again
    float cyc = 1.6 + 0.5 * fract(sd * 7.3), n = floor((t + sd * 3.0) / cyc), u = fract((t + sd * 3.0) / cyc);
    vec3 a = vec3(hash11(n + sd) - 0.5, hash11(n * 1.3 + sd) * 0.5 - 0.2, hash11(n * 1.7 + sd) - 0.5) * 2.0;
    vec3 b = vec3(hash11(n + 1.0 + sd) - 0.5, hash11((n + 1.0) * 1.3 + sd) * 0.5 - 0.2, hash11((n + 1.0) * 1.7 + sd) - 0.5) * 2.0;
    float m = smoothstep(0.80, 0.92, u);
    return h + mix(a, b, m) + vec3(0.0, 0.01 * sin(t * 13.0 + sd), 0.0);
  }
  // a swallow: long fast swoops across the field, low over the grass and up again
  float sp = 0.55 + 0.2 * fract(sd * 3.1), ph = t * sp + sd * 6.0;
  return h + vec3(6.0 * sin(ph), 1.0 * sin(ph * 2.0 + sd) + 0.5 * sin(ph * 3.3), 3.5 * sin(ph * 0.7 + sd * 2.0));
}
void main(){
  int corner = gl_VertexID;
  vec2 cq = vec2(corner & 1, corner >> 1) * 2.0 - 1.0;
  vec3 p = posAt(uTime), q = posAt(uTime + 0.05);
  vec3 v = p - uEye; float z = dot(v, uFwd);
  if (z < 0.15){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 ndc = vec2(dot(v, uRight) / (z * uTan.x), dot(v, uUp) / (z * uTan.y));
  vec3 vq = q - uEye; float zq = max(dot(vq, uFwd), 0.15);
  vec2 nq = vec2(dot(vq, uRight) / (zq * uTan.x), dot(vq, uUp) / (zq * uTan.y));
  vec2 dir = (nq - ndc) * vec2(uTan.x / uTan.y, 1.0); dir = length(dir) > 1e-5 ? normalize(dir) : vec2(1.0, 0.0);
  int kind = int(aA.x + 0.5);
  if (kind == 1 || kind == 0) dir = vec2(1.0, 0.0);                  // (butterflies and seeds stay upright)
  float size = aD.y / (z * uTan.y);                                   // half size in ndc (y)
  vec2 off = (dir * cq.x + vec2(-dir.y, dir.x) * cq.y) * size;
  gl_Position = vec4(ndc + off * vec2(uTan.y / uTan.x, 1.0), clamp(z / 80.0, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  vQ = cq; vKind = kind; vPhase = uTime * (kind == 1 ? 9.0 : kind == 2 ? 30.0 : 4.0) + aD.x * 20.0; vCol = aD.z; vDepth = z;
}`;
const FS_CRIT = HEAD + `
in vec2 vQ; flat in int vKind; in float vPhase; in float vCol; in float vDepth;
out vec4 o;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
void main(){
  vec2 q = vQ; float a = 0.0; vec3 c = vec3(1.0);
  float aa = max(fwidth(q.x), 0.02) * 1.2;
  vec3 ink = vec3(0.10, 0.12, 0.20);
  if (vKind == 0){
    // a dandelion seed: a fine parasol of filaments over a dark speck, lit white by the sun
    float r = length(q), ang = atan(q.y, q.x);
    float fil = smoothstep(0.12, 0.0, abs(fract(ang / 6.2832 * 12.0) - 0.5) * r * 6.0) * step(r, 0.95) * step(0.15, r) * step(-0.2, q.y);
    float rim = smoothstep(0.08, 0.0, abs(r - 0.92)) * step(-0.2, q.y);
    float stalk = smoothstep(0.06, 0.0, abs(q.x)) * step(-0.95, q.y) * step(q.y, 0.1);
    a = max(max(fil * 0.8, rim * 0.6), stalk);
    c = mix(vec3(1.0, 0.99, 0.94), vec3(0.45, 0.40, 0.32), stalk * step(q.y, -0.7));
  } else if (vKind == 1){
    // a butterfly seen from in front and below: two pairs of wings closing and opening on each beat
    float f = 0.25 + 0.75 * abs(cos(vPhase));
    vec2 w = vec2(abs(q.x) / max(f, 0.05), q.y);
    float fore = length((w - vec2(0.48, 0.22)) / vec2(0.46, 0.40)) - 1.0;
    float hind = length((w - vec2(0.36, -0.30)) / vec2(0.34, 0.30)) - 1.0;
    float wing = min(fore, hind), body = length(q / vec2(0.07, 0.42)) - 1.0;
    a = smoothstep(0.06, -0.06, min(wing, body));
    vec3 base = vCol < 0.33 ? vec3(0.98, 0.98, 0.94) : vCol < 0.66 ? vec3(0.99, 0.88, 0.30) : vec3(0.97, 0.56, 0.18);
    c = base;
    c = mix(c, ink, smoothstep(0.55, 0.75, length(w - vec2(0.75, 0.38))) * step(fore, 0.0) * 0.9);        // dark wing tips
    c = mix(c, base * vec3(0.72, 0.76, 0.90), smoothstep(-0.25, 0.25, -q.y) * 0.5);                      // the cel shadow under it
    c = mix(c, ink, smoothstep(-0.12, 0.0, wing) * step(wing, 0.06) + step(body, 0.0));                 // the outline, the body
  } else if (vKind == 2){
    // a dragonfly side-on: a long slim body, two pairs of glassy wings blurred by their beat
    float body = seg(q, vec2(-0.95, 0.0), vec2(0.75, 0.0)) - mix(0.035, 0.07, smoothstep(0.3, 0.7, q.x));
    float head = length(q - vec2(0.82, 0.0)) - 0.10;
    float wings = 1e9;
    for (int k = 0; k < 2; k++){
      float x0 = 0.32 - float(k) * 0.22, fl = 0.55 + 0.45 * sin(vPhase + float(k) * 1.7);
      wings = min(wings, length((q - vec2(x0, 0.30 * fl)) / vec2(0.10, 0.42 * fl + 0.05)) - 1.0);
      wings = min(wings, length((q - vec2(x0, -0.22 * fl)) / vec2(0.09, 0.30 * fl + 0.05)) - 1.0);
    }
    float sb = smoothstep(0.04, -0.04, min(body, head)), sw = smoothstep(0.08, -0.08, wings);
    vec3 bc = vCol < 0.5 ? vec3(0.15, 0.45, 0.70) : vec3(0.75, 0.20, 0.10);
    c = mix(vec3(0.90, 0.96, 1.0), bc, sb);
    a = max(sb, sw * 0.35);
  } else {
    // a swallow from below: dark back and wings, the swept forked tail; the wings flex as it beats and glides
    float beat = 0.5 + 0.5 * sin(vPhase);
    vec2 w = vec2(abs(q.y), q.x);
    float wing = seg(vec2(abs(q.y), q.x), vec2(0.05, 0.05), vec2(0.85, -0.10 - 0.25 * beat)) - mix(0.10, 0.02, smoothstep(0.1, 0.85, abs(q.y)));
    float body = length(q / vec2(0.40, 0.12)) - 1.0;
    float tail = min(seg(q, vec2(-0.35, 0.0), vec2(-0.95, 0.18)), seg(q, vec2(-0.35, 0.0), vec2(-0.95, -0.18))) - 0.03;
    float d = min(min(wing, tail), body * 0.12);
    a = smoothstep(0.03, -0.03, d);
    c = mix(vec3(0.07, 0.10, 0.22), vec3(0.85, 0.80, 0.72), step(body, 0.0) * smoothstep(0.0, -0.06, q.y + 0.02) * 0.6);
  }
  if (a < 0.02) discard;
  c = mix(c, vec3(0.74, 0.88, 0.94), clamp(vDepth / 120.0, 0.0, 1.0) * 0.6);
  o = vec4(c, a);
}`;
const FS_HERO = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan;
uniform vec3 uHP; uniform float uHR, uTime, uBreath, uOn;
out vec4 o;
void main(){
  vec3 v = uHP - uEye; float z = dot(v, uFwd);
  if (z < 0.05) discard;
  vec2 c = vec2(dot(v, uRight) / (z * uTan.x), dot(v, uUp) / (z * uTan.y));
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec2 d = (ndc - c) * uTan * z;                       // metres, at the light's depth
  float r = length(d) / uHR, px = length(fwidth(d)) / uHR;
  if (r > 14.0) discard;
  float ang = atan(d.y, d.x), b = uBreath;
  float core = 1.0 - smoothstep(1.0 - px, 1.0 + px, r);
  float halo = 1.0 - smoothstep(2.3 * b - px, 2.3 * b + px, r);
  float glow = exp(-r / (2.4 * b));
  float rays = pow(max(cos(3.0 * (ang + uTime * 0.12)), 0.0), 24.0) * smoothstep(11.0 * b, 2.0, r) + 0.6 * pow(max(cos(3.0 * (ang - uTime * 0.07) + 0.5), 0.0), 40.0) * smoothstep(8.0 * b, 2.0, r);
  vec3 col = vec3(1.0, 0.99, 0.94) * core + vec3(1.0, 0.80, 0.40) * halo * 0.45 * (1.0 - core) + vec3(1.0, 0.86, 0.52) * (glow * 0.35 + rays * 0.3);
  gl_FragDepth = clamp(z / 80.0, 0.0, 1.0);
  o = vec4(col * uOn, 1.0);
}`;
const FS_RESOLVE = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uRes; uniform float uFade;
out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy / uRes; vec3 c = texture(uSrc, uv).rgb;
  // a soft vignette, as in a painted background
  vec2 d = uv - 0.5; c *= 1.0 - 0.18 * dot(d, d) * 2.0;
  o = vec4(c * uFade, 1.0); }`;

// ---------------------------------------------------------------------------
function makeClouds(rnd) {
  // billows are generated per cloud, then each cloud's billows are sorted back-to-front for painting
  const clouds = [], per = [];
  const tower = (x0, base, top, wmax, far, seed) => {
    const ls = [];
    // the silhouette: a broad body swelling above the base, then narrowing turrets (cauliflower) at the top
    for (let y = base + 0.02; y < top; ) {
      const t = (y - base) / (top - base);
      const w = wmax * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 0.6) * (1 - 0.45 * t * t);
      const r = (0.03 + 0.055 * (1 - t) ** 0.8 + 0.01 * rnd()) * (wmax / 0.4);
      const xc = x0 + 0.03 * Math.sin(t * 5 + seed);                 // the tower leans a little
      const nEdge = Math.max(2, Math.round(w / r * 0.75));
      for (let k = 0; k <= nEdge; k++) {
        const u = k / nEdge - 0.5;
        const front = 1 - Math.abs(u) * 1.6;
        ls.push([xc + u * w + (rnd() - 0.5) * r * 0.6, y + (rnd() - 0.5) * r * 0.5 + front * r * 0.25, r * (0.75 + 0.5 * rnd()) * (0.8 + 0.35 * front), front + rnd() * 0.6 - t * 0.4]);
      }
      y += r * (0.95 + 0.3 * rnd());
    }
    // filler inside the lower body (no sky showing through), and a skirt of billows along the base
    for (let k = 0; k < 8; k++) ls.push([x0 + (rnd() - 0.5) * wmax * 0.7, base + 0.06 + rnd() * 0.22, 0.05 + rnd() * 0.02, 0.2 + rnd() * 0.5]);
    for (let k = 0; k < 6; k++) ls.push([x0 + (k / 5 - 0.5) * wmax * 0.95, base + 0.025 + rnd() * 0.02, 0.05 + rnd() * 0.02, 1.0 + rnd() * 0.4]);
    // a crown of small billows
    for (let k = 0; k < 7; k++) ls.push([x0 + (rnd() - 0.5) * wmax * 0.5, top - 0.01 + rnd() * 0.04, 0.02 + rnd() * 0.02, 0.5 + rnd()]);
    per.push(ls); clouds.push([base, far, 0, seed]);
  };
  const flat = (x0, base, w, far, seed, n) => {
    const ls = [];
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1) - 0.5, front = 1 - Math.abs(u) * 1.6;
      ls.push([x0 + u * w + (rnd() - 0.5) * 0.015, base + 0.008 + (0.5 - Math.abs(u)) * w * 0.25 + rnd() * 0.012, (0.016 + (0.5 - Math.abs(u)) * w * 0.22 + rnd() * 0.006), front + rnd() * 0.5]);
    }
    for (let k = 0; k < 3; k++) ls.push([x0 + (rnd() - 0.5) * w * 0.4, base + w * 0.22 + rnd() * 0.02, w * 0.14 + rnd() * 0.01, 1.2 + rnd()]);
    per.push(ls); clouds.push([base, far, 0, seed]);
  };
  flat(0.70, 0.050, 0.16, 0.9, 11, 7);
  flat(-0.98, 0.045, 0.14, 0.85, 12, 6);
  flat(1.02, 0.070, 0.11, 0.8, 13, 5);
  flat(0.30, 0.040, 0.30, 0.3, 7, 9);
  tower(-0.30, 0.012, 0.74, 0.36, 0.3, 3);
  while (clouds.length < 6) { clouds.push([0, 0, 0, -1]); per.push([]); }
  // far clouds first; within a cloud, back-to-front
  const order = clouds.map((c, i) => i).sort((a, b) => clouds[b][1] - clouds[a][1]);
  const out = [], boxes = [], counts = [], cl2 = [];
  order.forEach(ci => {
    const c = clouds[ci].slice(), ls = per[ci].slice().sort((a, b) => a[3] - b[3]);
    c[2] = out.length; counts.push(ls.length);
    let b = [9, -9, 9, -9];
    ls.forEach(l => { b = [Math.min(b[0], l[0] - l[2]), Math.max(b[1], l[0] + l[2]), Math.min(b[2], l[1] - l[2]), Math.max(b[3], l[1] + l[2])]; out.push(l); });
    boxes.push(ls.length ? [b[0] - 0.04, b[1] + 0.04, Math.max(b[2], c[0]) - 0.03, b[3] + 0.04] : [0, 0, 0, 0]);
    cl2.push(c);
  });
  if (out.length > 112) console.warn('too many billows', out.length);
  return { lobes: out.slice(0, 112), clouds: cl2, boxes, counts };
}

// the near grass: an even stand of blades over a tile 18 m wide and 28 m deep that travels with the eye (each blade
// wraps round to the far side as the eye passes it), so the field never runs out; a few tall stems in it brush the lens
const TILE = [18, 28];
function makeGrass(rnd, n) {
  const B = new Float32Array(n * 4), C = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * TILE[0], z = -0.6 - rnd() * TILE[1];
    const tall = rnd() < 0.035;
    const h = tall ? 0.70 + 0.5 * rnd() : 0.30 + 0.40 * rnd(), w = tall ? 0.020 + 0.016 * rnd() : 0.016 + 0.016 * rnd();
    B.set([x, z, h, w], i * 4);
    C.set([rnd() * 6.283, 0.5 + 1.0 * rnd(), rnd(), rnd() * 6.283], i * 4);
  }
  return { B, C };
}
// the small lives: [kind, home x, y, z], [seed, size (m), colour, -]
function makeCritters(rnd) {
  const A = [], D = [];
  const add = (k, p, size, col) => { A.push(k, ...p); D.push(rnd() * 10, size, col, 0); };
  for (let i = 0; i < 300; i++) add(0, [(rnd() - 0.5) * 12, 0.45 + rnd() * 1.6, -1 - rnd() * 16], 0.016 + 0.010 * rnd(), 0);
  // butterflies over the grass along the way the eye goes, near enough to see their wings
  for (let i = 0; i < 12; i++) add(1, [(rnd() < 0.5 ? -1 : 1) * (0.5 + 1.2 * rnd()), 0.72 + 0.25 * rnd(), -3 - i * 1.4 - rnd()], 0.055 + 0.015 * rnd(), [0.1, 0.5, 0.1, 0.8][i % 4]);
  // and a pair that the eye passes close by
  add(1, [0.35, 0.82, -2.6], 0.06, 0.5); add(1, [-0.45, 0.90, -6.0], 0.06, 0.1);
  [[0.9, 1.05, -4.5], [-1.1, 1.20, -8.0], [0.7, 1.00, -11.5], [-0.8, 1.15, -15.0]].forEach((p, i) => add(2, p, 0.065, i % 2 ? 0.8 : 0.2));
  // swallows: a loose flock swooping low across the field ahead
  for (let i = 0; i < 8; i++) add(3, [(rnd() - 0.5) * 5, 1.6 + rnd() * 2.0, -7 - rnd() * 9], 0.26 + 0.06 * rnd(), 0);
  return { A: new Float32Array(A), D: new Float32Array(D), n: A.length / 4 };
}

W.summer = {
  tower: TOWER,
  ready: false, t: 0, gust: 0, strokes: [], fade: 1,
  init() {
    if (this.ready) return;
    const gl = YL.gl, rnd = YL.rnd;
    this.pBg = YL.makeProgram('summer-bg', `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, FS_BG);
    this.pGrass = YL.makeProgram('summer-grass', VS_GRASS, FS_GRASS);
    this.pHero = YL.makeProgram('summer-hero', `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, FS_HERO);
    this.pRes = YL.makeProgram('summer-resolve', `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, FS_RESOLVE);
    this.pCrit = YL.makeProgram('summer-critters', VS_CRIT, FS_CRIT);
    [this.pBg, this.pGrass, this.pRes, this.pHero, this.pCrit].forEach(YL.checkProgram);
    const cr = makeCritters(YL.rnd); this.nCrit = cr.n;
    this.cvao = gl.createVertexArray(); gl.bindVertexArray(this.cvao);
    const c1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, c1); gl.bufferData(gl.ARRAY_BUFFER, cr.A, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(0, 1);
    const c2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, c2); gl.bufferData(gl.ARRAY_BUFFER, cr.D, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    this.cl = makeClouds(YL.rnd);
    const N = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 16000 : 34000;
    const g = makeGrass(YL.rnd, N); this.nGrass = N;
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, g.B, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(0, 1);
    const b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2); gl.bufferData(gl.ARRAY_BUFFER, g.C, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    this.empty = gl.createVertexArray();
    if (!this.inited) { this.t = +(YL.QS.get('wt') || 0); this.gust = this.t * 0.55; }      // (screenshots: start at a given moment)
    this.inited = true;
    this.ready = true;
  },
  // multisampled colour + depth → resolved texture
  targets(w, h) {
    const gl = YL.gl;
    if (this.tw === w && this.th === h && this.res) return;
    this.tw = w; this.th = h;
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    this.msFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFb);
    const rbC = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rbC); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rbC);
    const rbD = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rbD); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbD);
    this.res = YL.makeTarget(w, h, ['rgba8']);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  },
  // the pointer is wind: a stroke across the screen becomes a moving gust over the field
  pointer(nx, ny, speed) {
    const cam = this.cam; if (!cam) return;
    const rd = YL.V.norm(YL.V.add(cam.fwd, YL.V.add(YL.V.mul(cam.right, nx * cam.tan[0]), YL.V.mul(cam.up, ny * cam.tan[1]))));
    if (rd[1] >= -0.01) return;
    const t = 0.85 / -rd[1];
    this.strokes.unshift({ x: rd[0] * t, z: rd[2] * t, s: Math.min(speed * 0.5, 2.5), age: 0 });
    this.strokes.length = Math.min(this.strokes.length, 8);
  },
  // ---- sound: cicadas (知了) in the trees, the wind going through the grass
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const white = (() => { const n = ctx.sampleRate * 4, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return buf; })();
    const voices = [];
    // each cicada: a narrow band of noise, buzzed by a fast amplitude modulation, swelling and fading on its own cycle
    [[4600, 120, -0.6, 17], [5400, 95, 0.5, 23], [3900, 140, 0.15, 29]].forEach(([fc, am, pan, cyc]) => {
      const src = ctx.createBufferSource(); src.buffer = white; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = 5;
      const buzz = ctx.createGain(); buzz.gain.value = 0.5;
      const osc = ctx.createOscillator(); osc.frequency.value = am; const og = ctx.createGain(); og.gain.value = 0.5;
      osc.connect(og); og.connect(buzz.gain);
      const sw = ctx.createGain(); sw.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(bp); bp.connect(buzz); buzz.connect(sw);
      if (p) { p.pan.value = pan; sw.connect(p); p.connect(bus); } else sw.connect(bus);
      src.start(0, Math.random() * 4); osc.start();
      voices.push({ sw, cyc, ph: Math.random() * cyc });
    });
    // wind in the grass: low, soft, swelling with the gusts and with your strokes
    const pink = noiseBuffer(6.1, 'pink');
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 700;
    const wg = ctx.createGain(); wg.gain.value = 0;
    loop(pink, 1.0, wl); wl.connect(wg); wg.connect(bus);
    this.snd = { ctx, bus, voices, wl, wg, nextLark: 1.0, nextSwallow: 2.5 };
  },
  // a skylark far overhead: a run of quick, high warbled notes
  lark() {
    const S = this.snd, ctx = S.ctx; let t = ctx.currentTime + 0.05;
    const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(g); if (p) { p.pan.value = Math.random() * 1.2 - 0.6; g.connect(p); p.connect(S.bus); } else g.connect(S.bus);
    const n = 8 + Math.floor(Math.random() * 10), base = 2800 + Math.random() * 900;
    for (let i = 0; i < n; i++) {
      const d = 0.045 + Math.random() * 0.06, f0 = base * (0.85 + 0.4 * Math.random());
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.9 + 0.3 * Math.random()), t + d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.008); g.gain.setTargetAtTime(0, t + d * 0.7, d * 0.2);
      t += d + 0.01 + Math.random() * 0.05;
    }
    o.start(); o.stop(t + 0.2);
  },
  // swallows going by: two or three bright 'tswit' calls
  swallow() {
    const S = this.snd, ctx = S.ctx; let t = ctx.currentTime + 0.03;
    for (let i = 0, n = 2 + Math.floor(Math.random() * 2); i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(3800, t); o.frequency.exponentialRampToValueAtTime(6200, t + 0.05); o.frequency.exponentialRampToValueAtTime(4200, t + 0.09);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02, t + 0.01); g.gain.setTargetAtTime(0, t + 0.06, 0.02);
      o.connect(g); g.connect(S.bus); o.start(t); o.stop(t + 0.2);
      t += 0.14 + Math.random() * 0.1;
    }
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.6);
    // the cicadas swell and ebb; when the wind drops they come forward
    const calm = this.calm || 0;
    S.voices.forEach(v => {
      v.ph += dt;
      const c = 0.5 - 0.5 * Math.cos(2 * Math.PI * v.ph / v.cyc);
      v.sw.gain.setTargetAtTime(0.035 * (0.35 + 0.65 * c * c) * (1 + 1.2 * calm), now, 0.4);
    });
    const gust = 0.5 + 0.5 * Math.sin(this.gust), push = this.strokes.reduce((m, s) => Math.max(m, s.s * Math.exp(-s.age * 1.2)), 0);
    S.wg.gain.setTargetAtTime((0.05 + 0.08 * gust + 0.12 * Math.min(push, 1.5)) * (1 - 0.8 * calm), now, 0.3);
    S.wl.frequency.setTargetAtTime(450 + 500 * gust + 600 * Math.min(push, 1.5), now, 0.3);
    if ((S.nextLark -= dt) <= 0) { this.lark(); S.nextLark = 3 + Math.random() * 4; }
    if ((S.nextSwallow -= dt) <= 0) { this.swallow(); S.nextSwallow = 1.8 + Math.random() * 3; }
  },
  // 一粒光 here is a bit of sunlight blown about by the wind: your strokes push it, a spring keeps it near
  hero: { on: false, p: [0.25, 0.95, -2.8], v: [0, 0, 0], anchor: [0.25, 0.95, -2.8] },
  heroUpdate(dt) {
    const H = this.hero; if (!H.on) return;
    const t = this.t, calm = this.calm || 0;
    // carried off by an updraft (the way out of this world): it just goes where the air takes it
    if (H.fly) { for (let i = 0; i < 3; i++) H.p[i] += (H.fly[i] - H.p[i]) * Math.min(1, dt * 1.4); H.v = [0, 0, 0]; H.bob = 0; return; }
    for (const s of this.strokes) {
      const dx = H.p[0] - s.x, dz = H.p[2] - s.z, r2 = dx * dx + dz * dz, l = Math.sqrt(r2) + 1e-3;
      const f = s.s * Math.exp(-r2 / 2) * Math.exp(-s.age * 1.2) * 2.4 * dt;
      H.v[0] += dx / l * f; H.v[2] += dz / l * f; H.v[1] += f * 0.5;
    }
    H.v[0] += 0.10 * dt * (1 - calm); H.v[2] -= 0.04 * dt * (1 - calm);          // the steady breeze
    // where it likes to be: a little ahead of the travelling eye, weaving among the grass tops and the seeds
    const e = this.eyeAt(t);
    H.anchor = [e[0] + 0.20 + 0.35 * Math.sin(t * 0.37), 0.80 + 0.14 * Math.sin(t * 0.61 + 1), e[2] - 2.3 + 0.3 * Math.sin(t * 0.29)];
    const kk = (this.speed ?? 0.5) > 0.2 ? 2.2 : 0.55;
    for (let i = 0; i < 3; i++) H.v[i] += (H.anchor[i] - H.p[i]) * kk * dt;
    const damp = Math.exp(-dt * 0.9);
    for (let i = 0; i < 3; i++) { H.v[i] *= damp; H.p[i] += H.v[i] * dt; }
    H.p[1] = Math.max(H.p[1], 0.35);
    H.bob = 0.03 * Math.sin(t * 1.3) + 0.015 * Math.sin(t * 2.9 + 1);
  },
  // where the eye is: it travels forward over the field (this.speed m/s), weaving a little
  eyeAt(t) { const z = -(this.travel || 0); return [0.45 * Math.sin(z * 0.11), 0.80 + 0.05 * Math.sin(t * 0.55), z]; },
  update(dt, still) {
    this.t += dt;
    this.travel = (this.travel || 0) + (this.speed ?? 0.5) * dt;
    // pressing and holding still stops the wind
    const P = YL.ptr, now = YL.now();
    const holding = YL.ptrDown && P && now - P.t > 0.5;
    this.calm = (this.calm || 0) + ((holding ? 1 : 0) - (this.calm || 0)) * (1 - Math.exp(-dt / 1.2));
    this.heroUpdate(dt);
    this.sound(dt);
    this.gust += dt * 0.55 * (1 - 0.8 * this.calm);
    this.strokes.forEach(s => s.age += dt);
    this.strokes = this.strokes.filter(s => s.age < 3);
  },
  camera(aspect, t, still) {
    // eye 1.1 m above the field, looking a little up so the sky has most of the frame; a slow drift
    let yaw = (aspect < 0.9 ? -0.12 : 0) + (still ? 0 : 0.02 * Math.sin(t * 0.13)) + (YL.ptrPar ? YL.ptrPar[0] * 0.04 : 0);
    let pitch = 0.20 - 0.08 * Math.min(1, (this.speed ?? 0.5) / 1.1) + (still ? 0 : 0.008 * Math.sin(t * 0.11)) + (YL.ptrPar ? YL.ptrPar[1] * 0.02 : 0);
    // following the light up into the great cloud (TOWER: its azimuth and the height it rises to), then into it
    const lift = this.lift || 0, zoom = this.zoom || 0;
    yaw += (TOWER[0] - yaw) * lift; pitch += (TOWER[1] - 0.06 - pitch) * lift;
    const fwd = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const right = YL.V.norm(YL.V.cross(fwd, [0, 1, 0])), up = YL.V.cross(right, fwd);
    const vfov = (aspect < 0.9 ? 68 : 52) * (1 - zoom) + 9 * zoom, ty = Math.tan(vfov * Math.PI / 360);
    return { eye: this.eyeAt(t), fwd, right, up, tan: [ty * aspect, ty] };
  },
  // the summer sky and field as the room's window would see them, for the drops' inverted images
  renderEquirect(target) {
    const gl = YL.gl, U = YL.U, S = YL.S;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(this.pBg.p);
    U(this.pBg, 'uRes', [target.w, target.h]); U(this.pBg, 'uMode', YL.I(1)); U(this.pBg, 'uEq', [S.AZM, S.ELMIN, S.ELMAX]);
    U(this.pBg, 'uFwd', [0, 0, -1]); U(this.pBg, 'uRight', [1, 0, 0]); U(this.pBg, 'uUp', [0, 1, 0]); U(this.pBg, 'uTan', [1, 1]);
    U(this.pBg, 'uTime', this.t); U(this.pBg, 'uSun', SUN); U(this.pBg, 'uWind', [1.6, -0.6]); U(this.pBg, 'uGust', this.gust); U(this.pBg, 'uEye', [0, 0.85, 0]);
    gl.uniform4fv(this.pBg.u.uLobes, new Float32Array(this.cl.lobes.flat().concat(new Array((112 - this.cl.lobes.length) * 4).fill(0))));
    gl.uniform4fv(this.pBg.u.uClouds, new Float32Array(this.cl.clouds.flat()));
    gl.uniform4fv(this.pBg.u.uCBox, new Float32Array(this.cl.boxes.flat()));
    gl.uniform1iv(this.pBg.u.uCCount, new Int32Array(this.cl.counts));
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  },
  // where a point on the screen is, at a given distance in this world (to hand the light over at the same spot)
  project(p, aspect) {
    const cam = this.camera(aspect, this.t, YL.DBG.still), V = YL.V, v = V.sub(p, cam.eye), z = V.dot(v, cam.fwd);
    return [V.dot(v, cam.right) / (z * cam.tan[0]), V.dot(v, cam.up) / (z * cam.tan[1])];
  },
  unproject(nx, ny, dist, aspect) {
    const cam = this.camera(aspect, this.t, YL.DBG.still), V = YL.V;
    const rd = V.norm(V.add(cam.fwd, V.add(V.mul(cam.right, nx * cam.tan[0]), V.mul(cam.up, ny * cam.tan[1]))));
    return V.add(cam.eye, V.mul(rd, dist));
  },
  render(target, aspect) {
    const gl = YL.gl;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    this.targets(w, h);
    const cam = this.cam = this.camera(aspect, this.t, YL.DBG.still);
    const U = YL.U;
    // 1) background into the multisampled buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFb); gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.pBg.p);
    U(this.pBg, 'uRes', [w, h]); U(this.pBg, 'uFwd', cam.fwd); U(this.pBg, 'uRight', cam.right); U(this.pBg, 'uUp', cam.up); U(this.pBg, 'uTan', cam.tan);
    const wk = 1 - 0.85 * (this.calm || 0), wind = [1.6 * wk, -0.6 * wk];
    U(this.pBg, 'uTime', this.t); U(this.pBg, 'uSun', SUN); U(this.pBg, 'uWind', wind); U(this.pBg, 'uGust', this.gust); U(this.pBg, 'uMode', YL.I(0)); U(this.pBg, 'uEye', cam.eye);
    gl.uniform4fv(this.pBg.u.uLobes, new Float32Array(this.cl.lobes.flat().concat(new Array((112 - this.cl.lobes.length) * 4).fill(0))));
    gl.uniform4fv(this.pBg.u.uClouds, new Float32Array(this.cl.clouds.flat()));
    gl.uniform4fv(this.pBg.u.uCBox, new Float32Array(this.cl.boxes.flat()));
    gl.uniform1iv(this.pBg.u.uCCount, new Int32Array(this.cl.counts));
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2) the grass, depth-tested against itself
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    gl.useProgram(this.pGrass.p);
    U(this.pGrass, 'uEye', cam.eye); U(this.pGrass, 'uFwd', cam.fwd); U(this.pGrass, 'uRight', cam.right); U(this.pGrass, 'uUp', cam.up); U(this.pGrass, 'uTan', cam.tan);
    U(this.pGrass, 'uTime', this.t); U(this.pGrass, 'uWind', wind); U(this.pGrass, 'uGust', this.gust); U(this.pGrass, 'uSun', SUN); U(this.pGrass, 'uTile', [TILE[0], TILE[1], 0, 0]);
    const H = this.hero, hp = [H.p[0], H.p[1] + (H.bob || 0), H.p[2]];
    U(this.pGrass, 'uHP', hp); U(this.pGrass, 'uHOn', H.on ? 1 : 0);
    const st = new Float32Array(32); this.strokes.forEach((s, i) => st.set([s.x, s.z, s.s, s.age], i * 4));
    gl.uniform4fv(this.pGrass.u.uStroke, st);
    gl.bindVertexArray(this.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 7, this.nGrass);
    // the small lives, among the grass (hidden by the blades in front of them)
    gl.useProgram(this.pCrit.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    U(this.pCrit, 'uEye', cam.eye); U(this.pCrit, 'uFwd', cam.fwd); U(this.pCrit, 'uRight', cam.right); U(this.pCrit, 'uUp', cam.up); U(this.pCrit, 'uTan', cam.tan);
    U(this.pCrit, 'uTime', this.t); U(this.pCrit, 'uWind', wind);
    gl.bindVertexArray(this.cvao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nCrit);
    gl.disable(gl.BLEND); gl.depthMask(true);
    // the little light, in front of what is behind it and behind the blades in front of it
    if (H.on) {
      gl.useProgram(this.pHero.p);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      U(this.pHero, 'uRes', [w, h]); U(this.pHero, 'uEye', cam.eye); U(this.pHero, 'uFwd', cam.fwd); U(this.pHero, 'uRight', cam.right); U(this.pHero, 'uUp', cam.up); U(this.pHero, 'uTan', cam.tan);
      const br = 1 + 0.07 * Math.sin(this.t * 2.1) + 0.03 * Math.sin(this.t * 5.3);     // the same breathing as in the room
      const far = Math.hypot(hp[0] - cam.eye[0], hp[1] - cam.eye[1], hp[2] - cam.eye[2]);      // carried far off, it shrinks more slowly than it should, so the eye can follow it
      U(this.pHero, 'uHP', hp); U(this.pHero, 'uHR', 0.018 * Math.pow(Math.max(1, far / 2.4), 0.7)); U(this.pHero, 'uTime', this.t); U(this.pHero, 'uBreath', br); U(this.pHero, 'uOn', 1);
      gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND); gl.depthMask(true);
    }
    gl.disable(gl.DEPTH_TEST);
    // 3) resolve, then onto the screen (or the target)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.res.fb);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.useProgram(this.pRes.p); U(this.pRes, 'uRes', [w, h]); U(this.pRes, 'uFade', this.fade);
    YL.bindTex(this.pRes, 'uSrc', this.res.tex, 0);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  },
};
})();
