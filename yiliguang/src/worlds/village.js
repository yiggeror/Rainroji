/* ============================================================================
   世界三 · 雪夜 · 戏台 —— 新版画（shin-hanga）
   ----------------------------------------------------------------------------
   一个真正的三维村子，用套色木刻的方式印出来：
   · 第一遍（G）：光线求交——房子（墙、两坡顶、烟囱）、戏台（台、柱、幕、飞檐四角起翘的屋顶）、
     一串串灯笼、地上的雪；人、树是立在地上的「纸片」（总是朝着镜头）。每个面一种平色（版画的一块色版），
     加上窗格、木骨、瓦檐的雪唇；面的编号写进 alpha，深度写进第二张图。
   · 第二遍（印）：面编号一变就是墨版的线；色版错一点位；天上有木纹，处处有马连擦痕、和纸纤维；
     最后印上落雪（胡粉的白点，三层远近）。光（主角）在最上面：一朵刻出来的小火苗，暖光照在近处的雪上。
   夜里一条巷子通到村口的空场，场上搭着戏台，全村人提着灯、打着伞等着看皮影；戏台的幕是黑的——灯还没点。
   光从纸面落进来，顺着巷子飞，一路把横过巷子的灯笼串点亮，越过人群，钻到幕后：幕亮了，戏开场。
   幕上画的就是皮影那个世界自己（uScreen）——镜头一路推进幕里，直到幕就是整个画面，那时就已经在那个世界里了。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});

function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const LANE = [[0, 22], [-2.5, 2], [-1, -16], [3, -32], [4, -46]];
function laneAt(z) {
  for (let i = 0; i < LANE.length - 1; i++) { const a = LANE[i], b = LANE[i + 1]; if (z <= a[1] && z >= b[1]) { const t = (a[1] - z) / (a[1] - b[1]); const s = t * t * (3 - 2 * t); return a[0] + (b[0] - a[0]) * s; } }
  return z > LANE[0][1] ? LANE[0][0] : LANE[LANE.length - 1][0];
}
const STAGE = [4.5, -58];
// the screen: 5.6 × 3.15 m (16 : 9), its face toward the square
const SCR = { c: [STAGE[0], 3.05, STAGE[1] + 1.74], hw: 2.80, hh: 1.575 };
// ---- the village
const HOUSES = (() => {
  const H = []; let k = 0;
  for (let z = 16; z > -46; z -= 8.0) {
    for (const side of [-1, 1]) {
      k++;
      const two = rnd(k + 41) < 0.3;
      const hx = 2.8 + rnd(k) * 1.4, hz = 2.4 + rnd(k + 9) * 0.9;
      const rot = rnd(k + 3) < 0.55 ? 0 : 1;
      const ex = rot ? hz : hx;
      const x = laneAt(z) + side * (ex + 2.9 + rnd(k + 5) * 1.2);
      H.push([x, z + (rnd(k + 7) - 0.5) * 2.0, hx, hz, (two ? 4.6 : 2.6) + rnd(k + 2) * 0.5, 1.8 + rnd(k + 4) * 0.7, rot, k]);
      if (rnd(k + 11) < 0.8) {
        const x2 = x + side * (ex * 2 + 2.5 + rnd(k + 13) * 2.5);
        H.push([x2, z + (rnd(k + 17) - 0.5) * 3, 2.8 + rnd(k + 19), 2.5 + rnd(k + 23) * 0.6, 2.5 + rnd(k + 29) * 1.4, 1.8 + rnd(k + 31) * 0.5, rnd(k + 37) < 0.5 ? 0 : 1, k + 100]);
      }
      if (rnd(k + 43) < 0.6) {
        const x3 = x + side * (ex * 2 + 12 + rnd(k + 47) * 4);
        H.push([x3, z + (rnd(k + 53) - 0.5) * 4, 2.6 + rnd(k + 59), 2.4 + rnd(k + 61) * 0.6, 2.5, 1.8, rnd(k + 67) < 0.5 ? 0 : 1, k + 200]);
      }
    }
  }
  return H.filter(h => Math.hypot(h[0] - STAGE[0], h[1] - (STAGE[1] + 8)) > 13 && h[1] > -66).slice(0, 56);
})();
const NH = HOUSES.length;
// strings of lanterns across the lane, and two long ones to the stage
const STRINGS = (() => {
  const S = [];
  for (let z = 10; z > -44; z -= 9) { const cx = laneAt(z); S.push([cx - 3.6, 3.0, z + 0.5, cx + 3.6, 3.1, z - 0.5]); }
  S.push([laneAt(-44) - 2, 3.2, -44, STAGE[0] - 4.3, 5.0, STAGE[1] + 2.7]);
  S.push([laneAt(-44) + 3, 3.2, -44, STAGE[0] + 4.3, 5.0, STAGE[1] + 2.7]);
  return S;
})();
const NS = STRINGS.length, LPER = 5, NL = NS * LPER;
function strPt(s, u) { const [ax, ay, az, bx, by, bz] = STRINGS[s]; return [ax + (bx - ax) * u, ay + (by - ay) * u - 0.9 * Math.sin(Math.PI * u), az + (bz - az) * u]; }
const LANTERNS = []; for (let s = 0; s < NS; s++) for (let j = 0; j < LPER; j++) { const p = strPt(s, (j + 0.5) / LPER); p[1] -= 0.42; LANTERNS.push(p); }
// villagers: waiting in the square, and walking up the lane toward it
const PEOPLE = (() => {
  const P = [];
  for (let i = 0; i < 30; i++) {
    if (i < 18) { const a = rnd(i * 3.1) * Math.PI, r = 2.5 + rnd(i * 5.3) * 6.5; P.push({ x: STAGE[0] + Math.cos(a) * r * 1.2, z: STAGE[1] + 5.5 + Math.sin(a) * r * 0.55 + 1.5, walk: 0 }); }
    else { const z = 12 - (i - 18) * 4.6 + rnd(i) * 2; P.push({ x0: (rnd(i * 7) - 0.5) * 2.2, z0: z, walk: 1, v: 0.9 + 0.3 * rnd(i * 17) }); }
    P[i].h = 1.55 + rnd(i * 11) * 0.2 - (rnd(i * 13) < 0.12 ? 0.5 : 0); P[i].seed = i;
  }
  return P;
})();
const TREES = [[-9, 8, 8.5, 1], [10, -6, 9.5, 2], [-8, -25, 8, 3], [12, -38, 10, 4], [-6, -50, 9, 5], [15, -62, 8, 6], [-14, -66, 9, 7]];

const HEAD = `#version 300 es
precision highp float;
#define PI 3.14159265
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
const mat2 FR = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = FR * p + vec2(1.7, 9.2); a *= 0.5; } return s / 0.875; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdEll(vec2 p, vec2 r){ float k = length(p / r); return (k - 1.0) * min(r.x, r.y); }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
uniform vec2 uRes; uniform float uTime;
uniform vec3 uCamPos, uCamTgt; uniform float uFov;
`;
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

/* ---------------------------------------------------------------- pass 1: the blocks */
const FS_G = HEAD + `
uniform float uLit, uNH;
uniform vec4 uHA[56], uHB[56], uPP[30], uSA[${NS}], uSB[${NS}], uTR[7];
uniform vec4 uLanOn[${Math.ceil(NL / 4)}];
uniform vec4 uHero;                  // the light: where, how bright
uniform sampler2D uScreen;           // the shadow play, as it is on the screen
uniform float uScreenOn;             // (the screen's own picture is there at all)
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 oD;
#define NS ${NS}
#define LPER ${LPER}
#define STAGE vec2(${STAGE[0]}, ${STAGE[1]})
const vec3 SNOW = vec3(0.80, 0.84, 0.92), SNOWSH = vec3(0.61, 0.67, 0.80), SNOWDK = vec3(0.44, 0.50, 0.65);
const vec3 SKY0 = vec3(0.050, 0.078, 0.175), SKY1 = vec3(0.21, 0.26, 0.39);
const vec3 PLAST = vec3(0.31, 0.34, 0.46), PLASTSH = vec3(0.22, 0.25, 0.36);
const vec3 TIMB = vec3(0.11, 0.09, 0.11);
const vec3 WARM = vec3(1.0, 0.80, 0.42), WARM2 = vec3(0.93, 0.50, 0.19);
const vec3 SHU = vec3(0.78, 0.21, 0.12), SHUDK = vec3(0.38, 0.12, 0.11);
const vec3 TILE = vec3(0.12, 0.13, 0.18);
const vec3 KEYL = normalize(vec3(-0.6, 0.75, 0.35));
float lanOn(int i){ vec4 v = uLanOn[i / 4]; int k = i - (i / 4) * 4; return k == 0 ? v.x : k == 1 ? v.y : k == 2 ? v.z : v.w; }
float tBest; int best; vec3 bestN, bestL; vec4 bestInfo;
bool slab(vec3 ro, vec3 rd, vec3 n, float d, inout float tn, inout float tf, inout int idx, int i){
  float dn = dot(n, rd), dist = d - dot(n, ro);
  if (abs(dn) < 1e-6) return dist >= 0.0;
  float t = dist / dn;
  if (dn < 0.0){ if (t > tn){ tn = t; idx = i; } } else tf = min(tf, t);
  return true;
}
bool boxHit(vec3 o, vec3 d, vec3 c, vec3 s, out float t0, out vec3 n){
  vec3 a0 = (c - s - o) / d, a1 = (c + s - o) / d;
  vec3 l = min(a0, a1), h = max(a0, a1);
  t0 = max(max(l.x, l.y), l.z); float t1 = min(min(h.x, h.y), h.z);
  n = t0 == l.x ? vec3(-sign(d.x), 0, 0) : (t0 == l.z ? vec3(0, 0, -sign(d.z)) : vec3(0, -sign(d.y), 0));
  return t0 < t1 && t0 > 0.0;
}
bool boxSpan(vec3 o, vec3 d, vec3 c, vec3 s, out float tn, out float tf){
  vec3 a0 = (c - s - o) / d, a1 = (c + s - o) / d;
  vec3 l = min(a0, a1), h = max(a0, a1);
  tn = max(max(l.x, l.y), l.z); tf = min(min(h.x, h.y), h.z);
  return tn < tf && tf > 0.0;
}
// ---- a house: walls, a two-slope roof with overhangs, sometimes a chimney (ids: house*16 + part)
void house(vec3 ro, vec3 rd, int hi){
  vec4 A = uHA[hi], B = uHB[hi];
  vec3 o = ro - vec3(A.x, 0.0, A.y), d = rd;
  vec2 hs = A.zw;
  if (B.z > 0.5){ o.xz = vec2(o.z, -o.x); d.xz = vec2(d.z, -d.x); }
  float Hh = B.x, R = B.y;
  float tn0, tf0;
  if (!boxSpan(o, d, vec3(0.0, (Hh + R + 1.2) * 0.5, 0.0), vec3(hs.x + 0.9, (Hh + R + 1.2) * 0.5, hs.y + 0.8), tn0, tf0) || tn0 > tBest) return;
  float t0; vec3 n;
  if (boxHit(o, d, vec3(0.0, Hh * 0.5, 0.0), vec3(hs.x, Hh * 0.5, hs.y), t0, n) && t0 < tBest){
    tBest = t0; best = hi * 16 + (abs(n.z) > 0.5 ? 2 : abs(n.x) > 0.5 ? 1 : 3);
    bestN = n; bestL = o + d * t0; bestInfo = vec4(hs, Hh, R);
  }
  float ox = 0.80, oz = 0.60;
  float W = hs.x + ox;
  float drop = ox * R / hs.x;
  float yb = Hh - drop;
  vec3 n1 = normalize(vec3(R + drop, W, 0.0)), n2 = normalize(vec3(-(R + drop), W, 0.0));
  float d1 = dot(n1, vec3(0.0, Hh + R, 0.0)), d2 = dot(n2, vec3(0.0, Hh + R, 0.0));
  float tn = -1e9, tf = 1e9; int idx = -1;
  bool ok = slab(o, d, n1, d1, tn, tf, idx, 0) && slab(o, d, n2, d2, tn, tf, idx, 1)
         && slab(o, d, vec3(0, 0, 1), hs.y + oz, tn, tf, idx, 2) && slab(o, d, vec3(0, 0, -1), hs.y + oz, tn, tf, idx, 3)
         && slab(o, d, vec3(0, -1, 0), -yb, tn, tf, idx, 4);
  if (ok && tn < tf && tn > 0.0 && tn < tBest){
    tBest = tn; best = hi * 16 + 4 + idx;
    bestN = idx == 0 ? n1 : idx == 1 ? n2 : idx == 2 ? vec3(0, 0, 1) : idx == 3 ? vec3(0, 0, -1) : vec3(0, -1, 0);
    bestL = o + d * tn; bestInfo = vec4(hs, Hh, R);
  }
  if (hash11(B.w * 5.1) < 0.45){
    vec3 cc = vec3(hs.x * 0.35, Hh + R * 0.75, hs.y * 0.3);
    if (boxHit(o, d, cc, vec3(0.28, R * 0.55, 0.28), t0, n) && t0 < tBest){
      tBest = t0; best = hi * 16 + 10 + (abs(n.y) > 0.5 ? 1 : 0);
      bestN = n; bestL = o + d * t0 - cc; bestInfo = vec4(hs, Hh, R);
    }
  }
}
// ---- the stage (ids 1000 + part * 8 + face; the roof 1100 + facet)
#define SROOF_Y 5.45
float stageRoofH(vec2 q){
  float WX = 6.4, WZ = 4.4;
  float ux = clamp((abs(q.x) - (WX - WZ)) / WZ, 0.0, 1.0), uz = abs(q.y) / WZ;
  float u = max(ux, uz);
  float h = 2.7 * pow(1.0 - u, 1.7);
  h += 0.9 * pow(smoothstep(0.55, 1.0, abs(q.x) / WX), 2.0) * pow(smoothstep(0.35, 1.0, uz), 1.5);
  h += 0.25 * pow(smoothstep(0.75, 1.0, u), 2.0);
  return h;
}
void stage(vec3 ro, vec3 rd, bool roofToo){
  vec3 o = ro - vec3(STAGE.x, 0.0, STAGE.y), d = rd;
  float tn0, tf0;
  if (!boxSpan(o, d, vec3(0.0, 4.6, 0.0), vec3(6.6, 4.7, 4.6), tn0, tf0) || tn0 > tBest) return;
  vec3 C[9]; vec3 Sz[9];
  C[0] = vec3(0.0, 0.65, 0.0);     Sz[0] = vec3(4.8, 0.65, 3.2);
  C[1] = vec3(-4.2, 3.05, 2.8);    Sz[1] = vec3(0.20, 2.4, 0.20);
  C[2] = vec3(4.2, 3.05, 2.8);     Sz[2] = vec3(0.20, 2.4, 0.20);
  C[3] = vec3(0.0, 3.05, 1.6);     Sz[3] = vec3(3.25, 1.95, 0.10);
  C[4] = vec3(0.0, 3.05, 1.72);    Sz[4] = vec3(${SCR.hw.toFixed(3)}, ${SCR.hh.toFixed(3)}, 0.02);
  C[5] = vec3(0.0, 5.20, 2.85);    Sz[5] = vec3(4.4, 0.25, 0.08);
  C[6] = vec3(-4.2, 3.05, -2.8);   Sz[6] = vec3(0.20, 2.4, 0.20);
  C[7] = vec3(4.2, 3.05, -2.8);    Sz[7] = vec3(0.20, 2.4, 0.20);
  C[8] = vec3(0.0, 1.45, 2.9);     Sz[8] = vec3(4.9, 0.12, 0.35);
  float t0; vec3 n;
  for (int i = 0; i < 9; i++){
    if (boxHit(o, d, C[i], Sz[i], t0, n) && t0 < tBest){
      tBest = t0; best = 1000 + i * 8 + (abs(n.y) > 0.5 ? 1 : abs(n.x) > 0.5 ? 2 : 0);
      bestN = n; bestL = o + d * t0; bestInfo = vec4(C[i].xy - Sz[i].xy, Sz[i].xy * 2.0);
    }
  }
  if (!roofToo) return;
  float WX = 6.4, WZ = 4.4;
  float tn, tf;
  if (boxSpan(o, d, vec3(0.0, SROOF_Y + 1.6, 0.0), vec3(WX, 1.8, WZ), tn, tf) && tn < tBest){
    float t = max(tn, 0.0);
    float dt = (tf - t) / 40.0;
    for (int i = 0; i < 41; i++){
      vec3 p = o + d * t;
      float f = p.y - SROOF_Y - stageRoofH(p.xz);
      if (f < 0.0 && f > -0.45 && abs(p.x) < WX && abs(p.z) < WZ){
        float ta = t - dt, tb = t;
        for (int j = 0; j < 6; j++){ float tm = 0.5 * (ta + tb); vec3 pm = o + d * tm; float fm = pm.y - SROOF_Y - stageRoofH(pm.xz);
          if (fm < 0.0 && fm > -0.45 && abs(pm.x) < WX && abs(pm.z) < WZ) tb = tm; else ta = tm; }
        if (tb < tBest){
          tBest = tb; vec3 pp = o + d * tb;
          float fb = pp.y - SROOF_Y - stageRoofH(pp.xz);
          vec2 e = vec2(0.02, 0.0);
          vec3 nn = normalize(vec3(-(stageRoofH(pp.xz + e.xy) - stageRoofH(pp.xz - e.xy)) / 0.04, 1.0, -(stageRoofH(pp.xz + e.yx) - stageRoofH(pp.xz - e.yx)) / 0.04));
          bool under = fb < -0.38 || abs(pp.x) > WX - 0.03 || abs(pp.z) > WZ - 0.03;
          best = under ? 1100 : (abs(pp.x) - (WX - WZ) > abs(pp.z) ? 1102 : 1101 + (pp.z > 0.0 ? 2 : 0));
          bestN = under ? vec3(0.0, -1.0, 0.0) : nn; bestL = pp; bestInfo = vec4(fb, 0.0, 0.0, 0.0);
        }
        break;
      }
      t += dt;
    }
  }
}
// ---- paper lanterns along the strings (ids 1200 + string * 8 + j)
vec3 strPt(int s, float u){ vec3 a = uSA[s].xyz, b = uSB[s].xyz; return mix(a, b, u) - vec3(0.0, 0.9 * sin(PI * u), 0.0); }
void lanterns(vec3 ro, vec3 rd){
  for (int s = 0; s < NS; s++){
    vec3 a = uSA[s].xyz, b = uSB[s].xyz, m = 0.5 * (a + b) - vec3(0.0, 0.6, 0.0);
    float R = length(b - a) * 0.5 + 1.0;
    vec3 oc = ro - m; float bb = dot(oc, rd), cc = dot(oc, oc) - R * R;
    if (bb * bb - cc < 0.0) continue;
    for (int j = 0; j < LPER; j++){
      float u = (float(j) + 0.5) / float(LPER);
      vec3 c = strPt(s, u) - vec3(0.0, 0.42, 0.0);
      vec3 sc = vec3(0.24, 0.30, 0.24);
      vec3 oo = (ro - c) / sc, dd = rd / sc;
      float A = dot(dd, dd), B2 = dot(oo, dd), C2 = dot(oo, oo) - 1.0;
      float disc = B2 * B2 - A * C2;
      if (disc < 0.0) continue;
      float t = (-B2 - sqrt(disc)) / A;
      if (t > 0.0 && t < tBest){
        tBest = t; best = 1200 + s * 8 + j;
        bestL = (ro + rd * t - c) / sc; bestN = normalize(bestL); bestInfo = vec4(float(s * LPER + j), 0.0, 0.0, 0.0);
      }
    }
  }
}
float laneX(float z){
  vec2 L0 = vec2(0, 22), L1 = vec2(-2.5, 2), L2 = vec2(-1, -16), L3 = vec2(3, -32), L4 = vec2(4, -46);
  return z > 2.0 ? mix(L0.x, L1.x, smoothstep(22.0, 2.0, z)) : z > -16.0 ? mix(L1.x, L2.x, smoothstep(2.0, -16.0, z)) : z > -32.0 ? mix(L2.x, L3.x, smoothstep(-16.0, -32.0, z)) : mix(L3.x, L4.x, smoothstep(-32.0, -46.0, z));
}
// warm light thrown on the snow: lit windows, lit lanterns, the stage once its lamp burns, and the light itself
vec3 pools(vec3 p){
  vec3 L = vec3(0.0);
  for (int i = 0; i < 56; i++){
    if (float(i) >= uNH) break;
    vec4 A = uHA[i], B = uHB[i];
    if (hash11(B.w * 3.3) > 0.6) continue;
    float dd = length(p.xz - A.xy) - max(A.z, A.w);
    L += WARM2 * 0.40 * exp(-max(dd, 0.0) / 1.4) * smoothstep(-0.4, 0.0, dd);
  }
  for (int s = 0; s < NS; s++){
    for (int j = 0; j < LPER; j++){
      float on = lanOn(s * LPER + j);
      if (on <= 0.0) continue;
      vec3 c = strPt(s, (float(j) + 0.5) / float(LPER));
      L += WARM * 0.50 * on * exp(-length(p - c + vec3(0.0, 0.4, 0.0)) / 1.5);
    }
  }
  float ds = length((p.xz - STAGE - vec2(0.0, 4.5)) * vec2(0.5, 1.0));
  L += WARM * 0.9 * uLit * exp(-ds / 3.5);
  L += vec3(1.0, 0.78, 0.45) * uHero.w * 1.1 * exp(-length(p - uHero.xyz) / 1.8);
  return L;
}
vec3 skyCol(vec3 rd, out float fid){
  fid = 0.0;
  float e = rd.y;
  vec3 c = mix(SKY1, SKY0, smoothstep(-0.02, 0.40, e));
  float a = atan(rd.x, -rd.z);
  float m = -1.0; float side_ = 0.0;
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float ai = -0.75 + fi * 0.26 + 0.08 * (hash11(fi * 3.7) - 0.5);
    float hi = 0.035 + 0.035 * hash11(fi * 5.1);
    if (i == 3) { ai = 0.06; hi = 0.105; }
    float wi = hi * (1.9 + 0.6 * hash11(fi * 9.3));
    float x = (a - ai) / wi;
    float hgt = hi * (1.0 - abs(x)) + 0.004 * (vnoise(vec2(a * 90.0, fi)) - 0.5) * (1.0 - abs(x));
    if (hgt > m){ m = hgt; side_ = x; }
  }
  if (e < m){
    bool lit_ = side_ < 0.0;
    float gully = smoothstep(0.55, 0.8, vnoise(vec2(a * 180.0 + e * 60.0, e * 14.0)));
    c = lit_ ? vec3(0.70, 0.75, 0.86) : vec3(0.41, 0.47, 0.62);
    c = mix(c, vec3(0.45, 0.51, 0.66), gully * (lit_ ? 0.55 : 0.0));
    c = mix(c, SKY1 * 1.05, 0.20 + 0.45 * smoothstep(m - 0.02, m - 0.07, e));
    fid = lit_ ? 1.0 : 2.0;
  }
  float hh = -0.020 + 0.022 * fbm3(vec2(a * 3.5, 7.0)) + 0.008 * sin(a * 7.0);
  float g = a * 140.0; float gi = floor(g), gf = fract(g) - 0.5;
  float ph = 0.010 + 0.010 * hash11(gi);
  float pine = max(abs(gf) * (1.0 / 140.0) - 0.0035 * (1.0 - (e - hh) / ph), e - hh - ph);
  if (e < hh || (pine < 0.0 && hash11(gi + 3.0) < 0.8)){
    c = mix(vec3(0.27, 0.32, 0.46), vec3(0.11, 0.15, 0.25), smoothstep(hh - 0.05, hh, e));
    fid = 3.0;
  }
  return c;
}
// ---- a villager (a flat figure standing on the snow): hat or hood, padded coat, snow on the shoulders, maybe a lantern or umbrella
vec4 person(vec2 q, float seed, float h, float walk, out float fid){
  fid = 0.0;
  float kind = hash11(seed + 21.0);
  vec3 coat = kind < 0.45 ? vec3(0.15, 0.19, 0.33) : kind < 0.75 ? vec3(0.32, 0.22, 0.17) : kind < 0.88 ? vec3(0.33, 0.35, 0.42) : vec3(0.70, 0.17, 0.12);
  if (h < 1.3) coat = vec3(0.72, 0.18, 0.12);
  vec2 u = q / h;
  float ph = uTime * 3.4 + seed * 7.0;
  u.y -= walk * 0.012 * abs(sin(ph));
  vec4 c = vec4(0.0);
  float stride = walk * 0.05 * sin(ph);
  float legs = min(sdSeg(u, vec2(-0.06 + stride, 0.02), vec2(-0.05, 0.22)), sdSeg(u, vec2(0.06 - stride, 0.02), vec2(0.05, 0.22))) - 0.045;
  if (legs < 0.0){ c = vec4(vec3(0.09, 0.08, 0.10), 1.0); fid = 1.0; }
  float y = u.y;
  float hw = mix(0.29, 0.21, smoothstep(0.18, 0.80, y)) + 0.02 * sin(y * 9.0 + seed);
  float coatD = max(abs(u.x) - hw, max(0.18 - y, y - 0.80));
  coatD = smax(coatD, length(u - vec2(0.0, 0.66)) - 0.30, 0.06);
  float sw = walk * 0.04 * sin(ph);
  float arms = min(sdSeg(u, vec2(-0.20, 0.74), vec2(-0.27 + sw, 0.45)), sdSeg(u, vec2(0.20, 0.74), vec2(0.27 - sw, 0.45))) - 0.07;
  if (min(coatD, arms) < 0.0){ c = vec4(coat, 1.0); fid = arms < coatD ? 3.0 : 2.0; if (abs(fract(y * 7.0) - 0.5) < 0.06 && arms > 0.0) c.rgb *= 0.78; }
  float head = length(u - vec2(0.0, 0.87)) - 0.11;
  if (head < 0.0){ c = vec4(vec3(0.12, 0.10, 0.10), 1.0); fid = 4.0; }
  if (hash11(seed + 31.0) < 0.6){
    float hat = max(abs(u.x) - 0.36 * (1.0 - (u.y - 0.90) / 0.16), max(0.90 - u.y, u.y - 1.06));
    if (hat < 0.0){ c = vec4(vec3(0.62, 0.48, 0.30), 1.0); fid = 5.0; if (abs(fract((u.x / max(1.0 - (u.y - 0.90) / 0.16, 0.05)) * 9.0) - 0.5) < 0.08) c.rgb *= 0.75; }
    if (hat < 0.0 && u.y > 0.955 + 0.025 * vnoise(vec2(u.x * 25.0, seed + 2.0))){ c = vec4(SNOW, 1.0); fid = 6.0; }
  } else {
    float hood = length(u - vec2(0.0, 0.88)) - 0.14;
    if (hood < 0.0 && head >= -0.02){ c = vec4(coat * 0.85, 1.0); fid = 5.0; }
    if (hood < 0.0 && u.y > 0.96 + 0.02 * vnoise(vec2(u.x * 30.0, seed))){ c = vec4(SNOW, 1.0); fid = 6.0; }
  }
  float sh = max(abs(u.x) - 0.27, abs(u.y - 0.79 - 0.03 * vnoise(vec2(u.x * 20.0, seed))) - 0.025);
  if (sh < 0.0 && coatD < 0.02){ c = vec4(SNOW, 1.0); fid = 7.0; }
  float extra = hash11(seed + 11.0);
  if (extra > 0.72){
    vec2 uq = rot(0.18 * (hash11(seed + 9.0) - 0.5)) * (u - vec2(0.06, 1.16));
    float can = max(sdEll(uq, vec2(0.62, 0.24)), -uq.y);
    float shaft = max(abs(u.x - 0.06) - 0.012, max(0.55 - u.y, u.y - 1.16));
    if (shaft < 0.0 && can > 0.0){ c = vec4(vec3(0.15), 1.0); fid = 8.0; }
    if (can < 0.0){ c = vec4(mix(vec3(0.76, 0.48, 0.24), vec3(0.62, 0.20, 0.14), step(0.5, hash11(seed + 9.0))), 1.0); fid = 9.0;
      if (abs(fract(atan(uq.x, uq.y + 0.2) / PI * 7.0) - 0.5) < 0.05) c.rgb *= 0.55; }
    if (can < 0.0 && uq.y > 0.10 + 0.03 * vnoise(vec2(uq.x * 12.0, seed))){ c = vec4(SNOW, 1.0); fid = 10.0; }
  } else if (extra > 0.45){
    float side = hash11(seed + 3.0) < 0.5 ? -1.0 : 1.0;
    float pole = sdSeg(u, vec2(0.18 * side, 0.62), vec2(0.42 * side, 1.02)) - 0.012;
    vec2 lc = vec2(0.42 * side, 0.86 + 0.01 * sin(ph * 0.5));
    float lan = sdEll(u - lc, vec2(0.085, 0.11));
    if (pole < 0.0){ c = vec4(vec3(0.15), 1.0); fid = 11.0; }
    if (lan < 0.0){ c = vec4(mix(WARM, SHU, 0.25 + 0.6 * length((u - lc) / vec2(0.085, 0.11))), 1.0); fid = 12.0; }
  }
  return c;
}
float treeD(vec2 u, float seed){
  float d = max(abs(u.x - 0.03 * sin(u.y * 5.0 + seed)) - mix(0.035, 0.012, u.y), u.y - 0.62);
  for (int i = 0; i < 9; i++){
    float fi = float(i);
    float y0 = 0.28 + fi * 0.045;
    float side = mod(fi + seed, 2.0) < 1.0 ? -1.0 : 1.0;
    vec2 a = vec2(0.03 * sin(y0 * 5.0 + seed), y0);
    float ang = side * (0.6 + 0.5 * hash11(fi + seed));
    vec2 dir = vec2(sin(ang), cos(ang));
    float len = 0.30 - fi * 0.02 + 0.08 * hash11(fi * 3.0 + seed);
    vec2 b = a + dir * len;
    float r0 = 0.016 - fi * 0.0012;
    d = min(d, sdSeg(u, a, b) - r0 * (1.0 - 0.6 * clamp(dot(u - a, dir) / len, 0.0, 1.0)));
    vec2 m = a + dir * len * 0.55;
    vec2 dir2 = vec2(sin(ang + side * 0.6), cos(ang + side * 0.6));
    d = min(d, sdSeg(u, m, m + dir2 * len * 0.45) - r0 * 0.4);
    vec2 dir3 = vec2(sin(ang - side * 0.5), cos(ang - side * 0.5));
    d = min(d, sdSeg(u, b - dir * len * 0.2, b - dir * len * 0.2 + dir3 * len * 0.3) - r0 * 0.3);
  }
  return d;
}
vec4 tree(vec2 q, float hgt, float seed, out float fid){
  fid = 0.0;
  vec2 u = q / hgt;
  if (abs(u.x) > 0.6 || u.y < 0.0 || u.y > 1.05) return vec4(0.0);
  float d = treeD(u, seed);
  if (d >= 0.0) return vec4(0.0);
  float above = treeD(u + vec2(0.0, 0.010), seed);
  if (above > 0.0 && vnoise(u * 260.0) > 0.2){ fid = 2.0; return vec4(SNOW, 1.0); }
  fid = 1.0; return vec4(vec3(0.08, 0.07, 0.09), 1.0);
}
float smokeA(vec2 q, float seed){
  float a = 0.0;
  for (int i = 0; i < 10; i++){
    float fi = float(i);
    float age = fract(uTime * 0.10 + fi / 10.0 + seed);
    vec2 c = vec2(age * age * 3.0 + 0.2 * sin(age * 5.0 + seed), age * 5.0);
    float r = 0.12 + age * 0.75;
    float d = length(q - c) - r * (0.8 + 0.2 * vnoise(q * 2.0 + fi));
    a = max(a, smoothstep(0.15, -0.25, d) * (1.0 - age) * 0.9);
  }
  return a;
}
void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 sp = (frag - 0.5 * uRes) / uRes.y;
  vec3 fw = normalize(uCamTgt - uCamPos), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
  float fl = 0.5 / tan(radians(uFov) * 0.5);
  vec3 rd = normalize(fw * fl + rt * sp.x + up * sp.y), ro = uCamPos;
  tBest = 1e9; best = -1;
  for (int i = 0; i < 56; i++){ if (float(i) >= uNH) break; house(ro, rd, i); }
  stage(ro, rd, true);
  lanterns(ro, rd);
  float tg = -ro.y / rd.y;
  if (rd.y < 0.0 && tg < tBest && tg < 140.0){ tBest = tg; best = 1; }
  vec3 bn = normalize(vec3(-fw.x, 0.0, -fw.z));
  vec3 br = normalize(cross(vec3(0, 1, 0), bn));
  vec4 bb = vec4(0.0); float bfid = 0.0, bt = 1e9, smokeAcc = 0.0;
  for (int i = 0; i < 30; i++){
    vec4 P = uPP[i];
    vec3 c = vec3(P.x, 0.0, P.y);
    float t = dot(c - ro, bn) / dot(rd, bn);
    if (t < 0.0 || t > tBest || t > bt) continue;
    vec3 hp = ro + rd * t - c;
    vec2 q = vec2(dot(hp, -br), hp.y);
    if (abs(q.x) > 1.2 || q.y < 0.0 || q.y > 2.0) continue;
    float f;
    vec4 pc = person(q, mod(P.w, 100.0), P.z, step(99.5, P.w), f);
    if (pc.a > 0.5){ bb = pc; bt = t; bfid = 1400.0 + float(i) * 16.0 + f; }
  }
  for (int i = 0; i < 7; i++){
    vec4 Tr = uTR[i];
    vec3 c = vec3(Tr.x, 0.0, Tr.y);
    float t = dot(c - ro, bn) / dot(rd, bn);
    if (t < 0.0 || t > tBest || t > bt) continue;
    vec3 hp = ro + rd * t - c;
    vec2 q = vec2(dot(hp, -br), hp.y);
    float f;
    vec4 pc = tree(q, Tr.z, Tr.w, f);
    if (pc.a > 0.5){ bb = pc; bt = t; bfid = 1900.0 + float(i) * 4.0 + f; }
  }
  for (int i = 0; i < 56; i++){
    if (float(i) >= uNH) break;
    vec4 A = uHA[i], B = uHB[i];
    if (hash11(B.w * 5.1) >= 0.45 || hash11(B.w * 9.7) > 0.35) continue;
    vec3 cc;
    cc.y = B.x + B.y * 1.3;
    cc.xz = B.z > 0.5 ? vec2(A.x - A.w * 0.3, A.y + A.z * 0.35) : vec2(A.x + A.z * 0.35, A.y + A.w * 0.3);
    float t = dot(cc - ro, bn) / dot(rd, bn);
    if (t < 0.0) continue;
    vec3 hp = ro + rd * t - cc;
    vec2 q = vec2(dot(hp, -br), hp.y);
    if (q.y < -0.2 || q.y > 4.0 || abs(q.x - 1.2) > 2.4) continue;
    smokeAcc = max(smokeAcc, smokeA(q, B.w * 0.37) * step(t, min(tBest, bt)));
  }
  vec3 p = ro + rd * tBest;
  vec3 col; float fid;
  if (best < 0 || (best == 1 && tBest > 120.0)){ col = skyCol(rd, fid); }
  else if (best == 1){
    col = mix(SNOW * 0.93, SNOWSH, smoothstep(10.0, 90.0, tBest));
    float cx = laneX(p.z);
    float dl = abs(p.x - cx);
    float laneM = smoothstep(1.9, 1.3, dl + 0.35 * (vnoise(p.xz * 1.3) - 0.5)) * step(-48.0, p.z);
    float sq = smoothstep(8.0, 6.0, length((p.xz - STAGE - vec2(0.0, 7.0)) * vec2(0.55, 1.0)));
    laneM = max(laneM, sq);
    col = mix(col, SNOWSH, laneM * 0.8);
    float ruts = smoothstep(0.07, 0.0, abs(dl - 0.55)) * laneM * (1.0 - sq);
    col = mix(col, SNOWDK, ruts * 0.55);
    vec2 fp = vec2(p.x - cx, p.z) * vec2(3.0, 1.6);
    vec2 fi = floor(fp); vec2 ff = fract(fp) - 0.5;
    if (laneM > 0.5 && hash12(fi) < 0.35 && length(ff * vec2(1.0, 1.8)) < 0.22) col = mix(col, SNOWDK, 0.45);
    vec3 sro = p + vec3(0.0, 0.02, 0.0);
    float kT = tBest; int kB = best;
    tBest = 40.0; best = -1;
    for (int i = 0; i < 56; i++){ if (float(i) >= uNH) break; vec4 A = uHA[i]; if (length(A.xy - p.xz) > 16.0) continue; house(sro, KEYL, i); }
    if (length(p.xz - STAGE) < 16.0) stage(sro, KEYL, false);
    bool shadow = best >= 0;
    tBest = kT; best = kB;
    if (shadow) col = mix(col, SNOWDK, 0.80);
    col += pools(p) * (shadow ? 0.7 : 1.0);
    col = mix(col, SKY1 * 1.2, smoothstep(40.0, 120.0, tBest) * 0.5);
    fid = shadow ? 5.0 : 4.0;
  }
  else if (best < 1000){
    int hi = best / 16, face = best - hi * 16;
    vec4 A = uHA[hi], B = uHB[hi];
    vec3 n = bestN;
    if (B.z > 0.5) n.xz = vec2(-n.z, n.x);
    float lit = dot(n, KEYL);
    vec3 L = bestL; vec2 hs = bestInfo.xy; float Hh = bestInfo.z, R = bestInfo.w;
    float litHouse = step(hash11(B.w * 3.3), 0.6);
    if (face <= 3){
      col = lit > 0.0 ? PLAST : PLASTSH;
      float u = face == 1 ? L.z : L.x, w = face == 1 ? hs.y : hs.x;
      float v = L.y;
      float posts = step(abs(abs(u) - w), 0.16) + step(abs(u), 0.07);
      float beams = step(abs(v - Hh + 0.15), 0.15) + step(abs(v - 0.2), 0.2) + (Hh > 4.0 ? step(abs(v - Hh * 0.5), 0.12) : 0.0);
      col = mix(col, TIMB, clamp(posts + beams, 0.0, 1.0));
      for (int j = 0; j < 2; j++){
        for (int f2 = 0; f2 < 2; f2++){
          if (f2 == 1 && Hh < 4.0) continue;
          float wx = (j == 0 ? -0.5 : 0.5) * w;
          float wy = Hh > 4.0 ? (f2 == 0 ? Hh * 0.27 : Hh * 0.72) : Hh * 0.55;
          vec2 wq = vec2(u - wx, v - wy);
          vec2 ws = vec2(0.50, 0.42);
          if (hash11(B.w * 7.0 + float(j) * 3.0 + float(face) + float(f2) * 11.0) < 0.3) continue;
          float wd = max(abs(wq.x) - ws.x, abs(wq.y) - ws.y);
          float on = litHouse * step(0.35, hash11(B.w * 2.0 + float(j) + float(f2) * 5.0));
          if (wd < 0.0){
            vec3 wc = mix(WARM, WARM2, smoothstep(0.1, 1.2, length(wq / ws)));
            col = mix(vec3(0.16, 0.18, 0.27), wc, on);
            vec2 lat = abs(fract(wq / (ws * 0.34) + 0.5) - 0.5);
            if (min(lat.x, lat.y) < 0.07) col = mix(col, TIMB, 0.8);
          }
          if (wd > 0.0 && wd < 0.09) col = TIMB;
        }
      }
      if (face == 1 || face == 2){
        vec2 dq = vec2(u - w * 0.05, v - 0.95);
        if (abs(dq.x) < 0.48 && abs(dq.y) < 0.95 && hash11(B.w + float(face) * 9.0) < 0.5) col = vec3(0.20, 0.13, 0.11);
      }
      // the light passing close: its warmth on the wall
      col += vec3(1.0, 0.72, 0.40) * uHero.w * 0.55 * exp(-length(p - uHero.xyz) / 1.6) * max(dot(n, normalize(uHero.xyz - p)), 0.0);
    } else if (face >= 10){
      col = face == 11 ? SNOW : (lit > 0.0 ? vec3(0.30, 0.27, 0.30) : vec3(0.18, 0.16, 0.19));
    } else {
      int idx = face - 4;
      if (idx <= 1){
        col = lit > 0.35 ? SNOW : (lit > 0.0 ? mix(SNOW, SNOWSH, 0.5) : SNOWSH);
        float W = hs.x + 0.80;
        float edge = W - abs(L.x);
        float ridges = smoothstep(0.42, 0.5, abs(fract(L.z / 0.32) - 0.5)) * 0.10;
        col *= 1.0 - ridges * smoothstep(0.0, 1.2, edge);
        float lip = 0.26 + 0.10 * vnoise(vec2(L.z * 5.0, float(hi)));
        float droop = 0.13 + 0.07 * vnoise(vec2(L.z * 11.0, float(hi) + 4.0));
        if (edge < lip) col = TILE;
        if (edge < lip && edge > lip - droop) col = lit > 0.0 ? SNOW : SNOWSH;
        if (L.y > Hh + R - 0.12) col = SNOW;
        col += vec3(1.0, 0.75, 0.45) * uHero.w * 0.5 * exp(-length(p - uHero.xyz) / 1.6);
      } else if (idx <= 3){
        col = lit > 0.0 ? PLASTSH : PLASTSH * 0.8;
        float slopeTop = (Hh + R) - (abs(L.x) / (hs.x + 0.8)) * (R + 0.8 * R / hs.x);
        if (slopeTop - L.y < 0.30) col = TIMB;
        if (slopeTop - L.y < 0.12) col = lit > 0.0 ? SNOW : SNOWSH;
        if (abs(fract(L.x * 1.6) - 0.5) < 0.05) col *= 0.7;
      } else col = TIMB;
    }
    fid = float(best);
    col = mix(col, SKY1 * 1.15, smoothstep(30.0, 130.0, tBest) * 0.6);
  }
  else if (best >= 1200){
    int id = int(bestInfo.x);
    float on = lanOn(id);
    vec3 L = bestL;
    float rib = smoothstep(0.82, 1.0, abs(cos(L.y * 7.0)));
    vec3 lc = mix(SHUDK, mix(vec3(1.0, 0.90, 0.62), mix(vec3(1.0, 0.55, 0.22), SHU, 0.5), smoothstep(0.0, 0.95, length(L.xz))), on);
    lc *= 1.0 - 0.3 * rib;
    if (abs(L.y) > 0.80) lc = TIMB;
    col = lc; fid = float(best);
    col = mix(col, SKY1 * 1.15, smoothstep(30.0, 130.0, tBest) * 0.6);
  }
  else {
    vec3 L = bestL;
    if (best >= 1100){
      int idx = best - 1100;
      float lit = dot(bestN, KEYL);
      if (idx == 0){ col = vec3(0.30, 0.13, 0.11) + WARM2 * 0.25 * uLit; }
      else {
        col = lit > 0.3 ? SNOW : SNOWSH;
        float f = bestInfo.x;
        float rim = min(6.4 - abs(L.x), 4.4 - abs(L.z));
        float lipW = 0.30 + 0.12 * vnoise(vec2((L.x + L.z) * 5.0, 1.0));
        if (rim < lipW) col = TILE;
        if (rim < lipW && rim > 0.18) col = lit > 0.0 ? SNOW : SNOWSH;
        if (f < -0.30) col = SHU * 0.8;
      }
    } else {
      int part = (best - 1000) / 8;
      if (part == 0){ col = vec3(0.27, 0.21, 0.20); if (abs(fract(L.y * 2.4) - 0.5) < 0.05) col *= 0.6; if (bestN.y > 0.5) col = SNOWSH; }
      else if (part == 1 || part == 2 || part == 6 || part == 7) col = SHU;
      else if (part == 3) col = vec3(0.12, 0.09, 0.09);
      else if (part == 4){
        // the screen. Dark until the lamp behind it burns; then what is on it is the shadow play itself
        vec2 su = (L.xy - vec2(0.0, 3.05)) / vec2(${SCR.hw.toFixed(3)}, ${SCR.hh.toFixed(3)});
        vec3 glow = mix(vec3(1.0, 0.91, 0.64), vec3(0.95, 0.58, 0.26), smoothstep(0.2, 1.3, length(su * vec2(0.8, 1.0))));
        vec3 lit_ = uScreenOn > 0.5 ? texture(uScreen, su * 0.5 + 0.5).rgb : glow;
        col = mix(vec3(0.33, 0.36, 0.45), lit_, uLit);
      }
      else if (part == 5){ col = SHU; if (L.y < 5.02 + 0.06 * abs(sin(L.x * 6.0))) col = vec3(0.86, 0.66, 0.25); }
      else if (part == 8){ col = SHU * 0.85; if (bestN.y > 0.5) col = SNOW; }
      if (part != 4) col += WARM2 * 0.35 * uLit * exp(-length(L - vec3(0.0, 3.0, 2.0)) / 3.0);
    }
    fid = float(best);
  }
  if (bt < tBest){ col = bb.rgb; fid = bfid; col = mix(col, SKY1 * 1.15, smoothstep(30.0, 130.0, bt) * 0.55); tBest = bt; }
  col = mix(col, vec3(0.56, 0.61, 0.73), smokeAcc * 0.45);
  {
    float best2 = 1e9;
    for (int s = 0; s < NS; s++){
      for (int j = 0; j < 8; j++){
        vec3 a = strPt(s, float(j) / 8.0), b = strPt(s, float(j + 1) / 8.0);
        vec3 va = a - ro, vb = b - ro;
        float za = dot(va, fw), zb = dot(vb, fw);
        if (za < 0.5 || zb < 0.5) continue;
        vec2 pa = vec2(dot(va, rt), dot(va, up)) * fl / za, pb = vec2(dot(vb, rt), dot(vb, up)) * fl / zb;
        vec2 ba = pb - pa; float h = clamp(dot(sp - pa, ba) / dot(ba, ba), 0.0, 1.0);
        float dd = length(sp - pa - ba * h) * uRes.y;
        float z = mix(za, zb, h);
        if (dd < 0.9 && z < tBest * dot(rd, fw)) best2 = min(best2, dd);
      }
    }
    if (best2 < 0.9) col = mix(col, TIMB, 0.85);
  }
  o = vec4(col, fid);
  oD = vec4(tBest * dot(rd, fw), 0.0, 0.0, 1.0);          // depth along the view axis
}`;

/* ---------------------------------------------------------------- pass 2: the printing */
const FS_PRINT = HEAD + `
uniform sampler2D uA, uD;
uniform vec4 uHeroS;          // the light on screen: x, y (px), depth along the view, size (px)
uniform float uHeroB;         // its brightness
uniform float uSnowAmt;       // the falling snow (thins as the eye comes up to the screen)
uniform float uPure;          // inside the screen, how much of the printing is left (0 at the end of the push)
uniform vec4 uScrRect;        // the screen's rect on the picture (px): x0, y0, x1, y1
uniform float uBoil;          // which printing this is
uniform vec3 uWake;           // the print waking: from where (px), how far it has reached (px; huge = all awake)
out vec4 o;
void main(){
  vec2 frag = gl_FragCoord.xy, uv = frag / uRes;
  vec4 s0 = texture(uA, uv);
  float id = s0.a;
  float key = 0.0;
  for (int i = 0; i < 8; i++){
    float a = float(i) * PI * 0.25;
    vec2 o2 = vec2(cos(a), sin(a)) * 1.2;
    float id2 = texture(uA, uv + o2 / uRes).a;
    if (abs(id2 - id) > 0.5 && max(id, id2) > 5.5) key += 0.25;
  }
  key = clamp(key, 0.0, 1.0);
  vec2 mis = vec2(1.0, -0.7) / uRes;
  vec3 c = texture(uA, uv + mis).rgb;
  if (abs(texture(uA, uv + mis).a - id) > 0.5) c = s0.rgb * 0.6 + c * 0.4;
  vec2 p = frag / uRes.y;
  vec2 bo = vec2(hash11(uBoil), hash11(uBoil + 7.0)) * 3.0;           // each printing lands a little differently
  float fib = smoothstep(0.62, 0.9, vnoise(vec2(p.x * 40.0 + p.y * 9.0, p.y * 300.0))) * 0.5 + smoothstep(0.7, 0.95, vnoise(vec2(p.x * 300.0, p.y * 30.0 + p.x * 5.0))) * 0.5;
  float tooth = vnoise(frag * 0.7 + bo) * 0.6 + vnoise(frag * 1.9) * 0.4;
  float dark = 1.0 - dot(c, vec3(0.3, 0.5, 0.2));
  float isSky = step(id, 0.5);
  float grain = vnoise(vec2(p.x * 1.8 + 2.0 * fbm3(p * vec2(0.8, 5.0)), p.y * 150.0));
  float mottle = fbm3(p * 50.0 + bo);
  // inside the screen near the end of the push, the printing gives way to the screen itself
  float inScr = step(uScrRect.x, frag.x) * step(frag.x, uScrRect.z) * step(uScrRect.y, frag.y) * step(frag.y, uScrRect.w) * step(abs(id - ${1000 + 4 * 8}.0), 0.5);
  float pr = mix(1.0, uPure, inScr);
  vec3 c0 = c;
  c *= 1.0 + dark * ((0.05 + 0.10 * isSky) * (grain - 0.5) + 0.06 * (mottle - 0.5));
  c = mix(c, c * 0.93, smoothstep(0.55, 0.8, tooth) * dark);
  c = mix(c, vec3(0.97, 0.96, 0.92), fib * 0.08 * (1.0 - dark * 0.6));
  c = mix(c0, c, pr);
  // asleep: until the light comes, the sheet carries only the key block, black lines on bare paper (a proof, not yet
  // coloured); the colour blocks go on from where the light went in, outward
  float wd = length(frag - uWake.xy) + 0.06 * uRes.y * (fbm3(p * 7.0) - 0.5);
  float awake = smoothstep(uWake.z, uWake.z - 0.05 * uRes.y, wd);
  vec3 bare = vec3(0.95, 0.935, 0.89) * (0.96 + 0.04 * tooth);
  c = mix(bare, c, awake);
  c *= 1.0 - 0.10 * exp(-pow((wd - uWake.z) / (0.02 * uRes.y), 2.0)) * step(uWake.z, 1e4);      // the fresh edge of the ink, a little darker
  c = mix(c, vec3(0.06, 0.055, 0.075), key * (0.85 + 0.15 * vnoise(frag * 1.3)));
  // the light: a little carved flame, warm, and its glow on the paper; hidden where something stands in front of it
  if (uHeroB > 0.0){
    vec2 d = frag - uHeroS.xy;
    float sz = uHeroS.w;
    float depth = texture(uD, uv).r;
    float vis = 1.0;
    float hd = texture(uD, uHeroS.xy / uRes).r;
    if (hd < uHeroS.z - 0.3) vis = 0.0;                                  // something in front of it
    float r = length(d) / sz;
    // the flame: a teardrop, its point up and flickering
    vec2 q = d / sz; q.x *= 1.0 + 0.15 * sin(uTime * 13.0);
    float fl = length(vec2(q.x * (1.0 + max(q.y, 0.0) * 0.9), q.y * 0.75 + 0.15)) - 0.55;
    vec3 flame = mix(vec3(1.0, 0.97, 0.80), vec3(0.98, 0.55, 0.18), smoothstep(-0.35, 0.0, fl));
    float inF = smoothstep(0.06, -0.04, fl);
    // carved rays round it, as a printer would show a light
    float ang = atan(d.y, d.x);
    float rays = smoothstep(0.55, 0.95, sin(ang * 12.0 + 0.3 * sin(uTime * 2.0))) * smoothstep(1.0, 1.4, r) * smoothstep(3.6, 1.6, r);
    vec3 glow = vec3(1.0, 0.72, 0.38) * (exp(-r / 1.4) * 0.55 + rays * 0.25);
    c += glow * uHeroB * vis * (1.0 - inF);
    c = mix(c, flame, inF * uHeroB * vis);
    // round the flame a thin dark key line, as if cut
    c = mix(c, vec3(0.30, 0.10, 0.05), smoothstep(0.10, 0.04, abs(fl - 0.05)) * uHeroB * vis * 0.5);
  }
  // snow falling: gofun dots in three depths
  float snow = 0.0;
  for (int L = 0; L < 3; L++){
    float fl = float(L);
    float cell = 0.020 + fl * 0.028;
    vec2 q = p + vec2(0.015 * uTime * (0.5 + fl * 0.4) + 0.02 * sin(uTime * 0.3 + fl), uTime * (0.03 + 0.04 * fl));
    vec2 g = q / cell, gi = floor(g), gf = fract(g) - 0.5;
    float h = hash12(gi + fl * 17.0);
    if (h < 0.34 - fl * 0.10){
      vec2 o2 = (hash22(gi + fl * 5.0) - 0.5) * 0.6;
      float r = (0.040 + 0.028 * fl) * (0.6 + 0.6 * h / 0.34) * (0.020 / cell) * (1.0 + 1.3 * fl);
      float d = length(gf - o2) - r;
      snow = max(snow, smoothstep(0.012 + fl * 0.035, -0.01, d) * (0.92 - 0.15 * fl));
    }
  }
  c = mix(c, vec3(0.95, 0.96, 0.98), snow * uSnowAmt * awake);
  o = vec4(c, 1.0);
}`;

/* ---------------------------------------------------------------- the world */
const V3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] };
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
// Catmull-Rom through points, by arc parameter u in [0, 1]
function spline(P, u) {
  const n = P.length - 1, x = Math.min(Math.max(u, 0), 1) * n, i = Math.min(Math.floor(x), n - 1), f = x - i;
  const p0 = P[Math.max(i - 1, 0)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(i + 2, n)];
  return [0, 1, 2].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f));
}
// the establishing view: the whole village down the lane to the stage (this is the picture printed on the sheet in the summer)
const CAM0 = { pos: [0, 8.5, 18], tgt: [3, 1.0, -60], vfov: 20.6 };
// the sheet ends a hair larger than the picture (so no grass shows at its edges): the village takes over with the lens
// narrowed by the same hair, so nothing moves at the handover
const PAPER_OVER = 1.005;
const CAM0V = { pos: CAM0.pos, tgt: CAM0.tgt, vfov: 2 * Math.atan(Math.tan(CAM0.vfov * Math.PI / 360) / PAPER_OVER) * 180 / Math.PI };
// the end of the push: square on to the screen, the screen exactly filling a 16 : 9 picture
// (a hair closer than exactly filling, so no edge of the frame can show: the stage world starts with the same hair)
const OVER = 1.02;
const CAM_END = (() => { const d = SCR.hh / OVER / Math.tan(12 * Math.PI / 180); return { pos: [SCR.c[0], SCR.c[1], SCR.c[2] + d], tgt: SCR.c.slice(), vfov: 24 }; })();
// the light's way: from where it came in through the paper, down the lane under the lantern strings, over the crowd,
// over the screen's frame and down behind it, where the lamp is
const ENTRY = [-1.6, 6.2, 3.0];             // (high over the roofs, left of the middle of the print: where it comes in through the paper)
// (it ends on the screen's face: the light goes into the paper of the screen, as it went into the paper in the summer)
const PATH = [ENTRY, [-2.4, 4.0, -2], [-1.7, 3.4, -8], [-0.6, 3.5, -17], [1.6, 3.6, -26], [3.2, 3.5, -35], [4.1, 4.2, -44], [4.4, 3.9, -49], [4.6, 3.6, -52.5], [4.8, 3.5, -55.0], [4.9, 3.5, SCR.c[2]]];

W.village = {
  ready: false, t: 0, vol: 1, fade: 1,
  // driven from outside (the director): where the eye is, where the light is
  cam: CAM0, CAM0, CAM0V, PAPER_OVER, CAM_END, SCR, ENTRY, PATH, STAGE, OVER,
  hero: { p: ENTRY.slice(), b: 0 },
  lit: 0,                  // the stage's lamp (0 dark … 1 burning)
  snowAmt: 1, pure: 1,
  screenTex: null,
  lanOn: new Float32Array(Math.ceil(NL / 4) * 4),
  lanT: new Float32Array(NL).fill(-1),
  init() {
    const gl = YL.gl;
    this.pG = YL.makeProgram('village-g', VS, FS_G); YL.checkProgram(this.pG);
    this.pP = YL.makeProgram('village-print', VS, FS_PRINT); YL.checkProgram(this.pP);
    this.empty = gl.createVertexArray();
    this.black = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.black); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.ready = true;
  },
  targets(w, h) {
    if (this.G && this.G.w === w && this.G.h === h) return;
    this.G = YL.makeTarget(w, h, ['rgba16f', 'r16f'], { nearest: true });
  },
  // where a world point lands on a picture of the given aspect, in ndc (and its depth along the view)
  project(p, aspect, cam = this.cam) {
    const fw = V3.norm(V3.sub(cam.tgt, cam.pos)), rt = V3.norm(V3.cross(fw, [0, 1, 0])), up = V3.cross(rt, fw);
    const v = V3.sub(p, cam.pos), z = V3.dot(v, fw), f = 0.5 / Math.tan(cam.vfov * Math.PI / 360);
    return [V3.dot(v, rt) * f / z / (aspect * 0.5), V3.dot(v, up) * f / z / 0.5, z];
  },
  // the light along its way, by u in [0, 1]
  pathAt(u) { return spline(PATH, u); },
  // ... and by distance along it (m), with its heading
  arc() {
    if (this._arc) return this._arc;
    const N = 600, pts = [], d = [0];
    for (let i = 0; i <= N; i++) pts.push(spline(PATH, i / N));
    for (let i = 1; i <= N; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    return (this._arc = { pts, d, L: d[N], N });
  },
  pathAtS(sm) {
    const A = this.arc(); sm = Math.min(Math.max(sm, 0), A.L);
    let lo = 0, hi = A.N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A.d[m] < sm) lo = m; else hi = m; }
    const f = (sm - A.d[lo]) / Math.max(A.d[hi] - A.d[lo], 1e-6);
    return V3.lerp(A.pts[lo], A.pts[hi], f);
  },
  // light the lanterns the light passes close to
  lightNear(p, now) {
    for (let i = 0; i < NL; i++) {
      if (this.lanT[i] >= 0) continue;
      const L = LANTERNS[i];
      if (Math.hypot(L[0] - p[0], L[1] - p[1], L[2] - p[2]) < 3.4) this.lanT[i] = now;
    }
  },
  update(dt) {
    this.t += dt;
    for (let i = 0; i < NL; i++) this.lanOn[i] = this.lanT[i] < 0 ? 0 : smooth(0, 0.45, this.t - this.lanT[i]);
    // walkers come up the lane toward the stage, and stop at the back of the crowd
    this.pp = this.pp || new Float32Array(30 * 4);
    PEOPLE.forEach((P, i) => {
      let x, z, w = 0;
      if (!P.walk) { x = P.x; z = P.z; }
      else {
        z = Math.max(P.z0 - P.v * this.t, -46 - (i - 18) * 0.9);
        w = z > -46 - (i - 18) * 0.9 + 0.05 ? 1 : 0;
        x = laneAt(z) + P.x0;
      }
      this.pp.set([x, z, P.h, P.seed + w * 100], i * 4);
    });
    this.sound(dt);
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    this.targets(w, h);
    const cam = this.cam;
    const tq = Math.floor(this.t * 12) / 12;               // the print is re-printed twelve times a second
    // 1) the blocks
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.G.fb); gl.viewport(0, 0, w, h);
    gl.useProgram(this.pG.p);
    U(this.pG, 'uRes', [w, h]); U(this.pG, 'uTime', tq);
    U(this.pG, 'uCamPos', cam.pos); U(this.pG, 'uCamTgt', cam.tgt); U(this.pG, 'uFov', cam.vfov);
    U(this.pG, 'uLit', this.lit); U(this.pG, 'uNH', NH);
    if (!this.uni) {
      const a = [], b = [], sa = [], sb = [], tr = [];
      HOUSES.forEach(H => { a.push(H[0], H[1], H[2], H[3]); b.push(H[4], H[5], H[6], H[7]); });
      STRINGS.forEach(s => { sa.push(s[0], s[1], s[2], 0); sb.push(s[3], s[4], s[5], 0); });
      TREES.forEach(q => tr.push(...q));
      this.uni = { a: new Float32Array(a), b: new Float32Array(b), sa: new Float32Array(sa), sb: new Float32Array(sb), tr: new Float32Array(tr) };
    }
    U(this.pG, 'uHA', this.uni.a); U(this.pG, 'uHB', this.uni.b); U(this.pG, 'uSA', this.uni.sa); U(this.pG, 'uSB', this.uni.sb); U(this.pG, 'uTR', this.uni.tr);
    U(this.pG, 'uPP', this.pp || new Float32Array(120)); U(this.pG, 'uLanOn', this.lanOn);
    U(this.pG, 'uHero', [...this.hero.p, this.hero.b]);
    U(this.pG, 'uScreenOn', this.screenTex ? 1 : 0);
    YL.bindTex(this.pG, 'uScreen', this.screenTex || this.black, 0);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2) the printing
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.useProgram(this.pP.p);
    U(this.pP, 'uRes', [w, h]); U(this.pP, 'uTime', this.t); U(this.pP, 'uBoil', Math.floor(this.t * 12));
    const hs = this.project(this.hero.p, w / h);
    const sizePx = h * 0.5 / Math.tan(cam.vfov * Math.PI / 360) * (this.heroSize || 0.20) / Math.max(hs[2], 0.3);
    U(this.pP, 'uHeroS', [(hs[0] * 0.5 + 0.5) * w, (hs[1] * 0.5 + 0.5) * h, hs[2], Math.max(sizePx, 2.5)]);
    U(this.pP, 'uHeroB', hs[2] > 0.2 ? this.hero.b : 0);
    U(this.pP, 'uSnowAmt', this.snowAmt); U(this.pP, 'uPure', this.pure);
    const wk = this.wake;
    if (wk) { const q = this.project(wk.p, w / h, cam); U(this.pP, 'uWake', [(q[0] * 0.5 + 0.5) * w, (q[1] * 0.5 + 0.5) * h, wk.r * h]); }
    else U(this.pP, 'uWake', [0, 0, 1e6]);
    const a = this.project([SCR.c[0] - SCR.hw, SCR.c[1] - SCR.hh, SCR.c[2]], w / h), b = this.project([SCR.c[0] + SCR.hw, SCR.c[1] + SCR.hh, SCR.c[2]], w / h);
    U(this.pP, 'uScrRect', [(a[0] * 0.5 + 0.5) * w, (a[1] * 0.5 + 0.5) * h, (b[0] * 0.5 + 0.5) * w, (b[1] * 0.5 + 0.5) * h]);
    YL.bindTex(this.pP, 'uA', this.G.texs[0], 0); YL.bindTex(this.pP, 'uD', this.G.texs[1], 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: wind over the snow, the crowd murmuring in the square, a distant temple bell; a little chime as each
     string of lanterns lights; when the screen lights, the troupe's gong */
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const pink = noiseBuffer(7.1, 'pink');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const wg = ctx.createGain(); wg.gain.value = 0.05; loop(pink, 1, lp); lp.connect(wg); wg.connect(bus);
    // the crowd: a band of murmur, swelling as the eye comes to the square
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 1.2;
    const cg = ctx.createGain(); cg.gain.value = 0; loop(noiseBuffer(5.3, 'pink'), 0.9, bp); bp.connect(cg); cg.connect(bus);
    this.snd = { ctx, bus, wg, cg, nextBell: 1.5, lit: 0 };
  },
  strike(t0, parts, a, pan = 0) {
    const S = this.snd, ctx = S.ctx;
    const g = ctx.createGain(); g.gain.value = a;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(S.bus); } else g.connect(S.bus);
    for (const [f, amp, dec, bend = 1] of parts) {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.frequency.setValueAtTime(f * bend, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.3);
      e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(amp, t0 + 0.004); e.gain.setTargetAtTime(0, t0 + 0.01, dec / 3);
      o.connect(e); e.connect(g); o.start(t0); o.stop(t0 + dec * 2 + 0.1);
    }
  },
  chime(pan) { const t0 = this.snd.ctx.currentTime + 0.01; const f = [1318, 1568, 1760, 2093][Math.floor(Math.random() * 4)]; this.strike(t0, [[f, 1, 0.5], [f * 2.76, 0.25, 0.2]], 0.018, pan); },
  bell() { const t0 = this.snd.ctx.currentTime + 0.02; this.strike(t0, [[196, 1, 4.5], [392.8, 0.5, 3.2], [538, 0.25, 2.5], [742, 0.12, 1.6]], 0.020, -0.4); },
  gong() { const t0 = this.snd.ctx.currentTime + 0.02; this.strike(t0, [[110, 1, 1.6, 1.03], [167, 0.6, 1.2], [231, 0.35, 0.9], [298, 0.2, 0.7], [413, 0.1, 0.5]], 0.06); },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.4);
    S.wg.gain.setTargetAtTime(0.045 + 0.02 * Math.sin(this.t * 0.37), now, 0.6);
    const toStage = Math.hypot(this.cam.pos[0] - STAGE[0], this.cam.pos[2] - STAGE[1]);
    S.cg.gain.setTargetAtTime(0.035 * smooth(40, 10, toStage) * (1 - 0.7 * this.lit), now, 0.5);
    if ((S.nextBell -= dt) <= 0) { this.bell(); S.nextBell = 9 + Math.random() * 4; }
    // a chime for each lantern as it catches
    let n = 0; for (let i = 0; i < NL; i++) if (this.lanT[i] >= 0) n++;
    if (n > S.lit) { const pr = this.project(LANTERNS[0], 16 / 9); this.chime(Math.max(-0.8, Math.min(0.8, (Math.random() - 0.5) * 0.8))); S.lit = n; }
    if (this.lit > 0.3 && !S.gonged) { S.gonged = true; this.gong(); }
  },
};
})();
