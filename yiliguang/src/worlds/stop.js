/* ============================================================================
   世界 · 定格动画·纸船远航（桌上搭的一台小布景）
   ----------------------------------------------------------------------------
   康定斯基那张画里的蓝圆和黄月，变成了真东西：刷着蓝颜料的卡纸天幕，一弯瓦楞纸剪的月亮挂在线上。
   镜头往后退，一只纸船从左边驶进来：船上坐着毛毡做的小孩，两手捧着那粒光。
   玻璃纸的浪是三条长带，像戏台上的浪机一样一圈圈地转过去（越近越快），每条带子又被下面的凸轮顶起、落下，
   船骑在中间那条带子的浪上——浪头从船头底下过去，船头先翘起，再扎下去，船头溅起一团棉花做的浪花。
   孩子是替换动画：十二个姿势（抱着光、迎着风、被浪打得大笑、抓紧船沿、抬头看海鸥、把光递给它、回头笑……），
   一格一格地换；挂在线上的海鸥一只远远飞过，一只跟上来，在光的上面盘旋。
   光照着这片小海：浪上有一条它的碎金倒影，玻璃纸的折痕跟着它闪；浪花、海鸥、帆，离它近的都被照暖。
   最后孩子把光高高举起，光离开他的手，朝镜头飘过来，越来越亮，白——回到雨夜的房间。
   画法：天幕、月亮、云、三条浪、船上的十二个姿势、浪花六格、海鸥四格都是生成的图（见 assets/prompts/）；
   · 布景里的东西按定格动画的节奏动：每秒 12 格，一格一格地跳，每格还带一点点手摆的抖（镜头是轨道上的，平滑）；
   · 微距：焦点在船上，前后的层按远近虚掉。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uStep, uFade, uWhite, uFlick, uLift;
uniform sampler2D uSky, uMoon, uCl0, uCl1, uCl2, uW0, uW1, uW2, uAt;
uniform vec4 uSky4;                 // the sky card on the screen: x0, y0, w, h
// the things hanging still (moon, three clouds): pivot on the screen (x, y), size (w, h) | pivot in the picture (u, v), turn, lod | on, -, warm, -
uniform vec4 uA[4], uB[4], uC[4];
// the three wave strips: foot of set x 0 on the screen (x, y), scale, the water's flow (set units) | height, tile length (set units), swell gain, swell phase | lod, glints, warm, -
uniform vec4 uL[3], uM[3], uN[3];
uniform vec4 uSw;                   // the swell: amplitude, its phase, time (stepped), wave number
// the puppets out of the atlas (boat, splash, far gull, near gull): pivot on the screen, size | pivot in the frame, turn, lod | frame in the atlas (x0, y0, w, h) | on, mirrored, warm, -
uniform vec4 uP[4], uQ[4], uR[4], uS[4];
uniform vec4 uHero;                 // the light: x, y, brightness, size
uniform vec4 uHand;                 // the light in the boat's frame (u, v), how far it has left the hands, -
uniform vec4 uThr[2];               // the gulls' threads: x, y of the knot on the screen, alpha, -
uniform vec4 uStar[8];              // foil stars on threads: x, y on the screen, size, the turn on its thread
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float sat(float x){ return clamp(x, 0.0, 1.0); }
// the swell under the strips (the same as the page's swell(), which the boat rides)
float swell(float s, float A){
  return A * (sin(uSw.w * s + uSw.y) + 0.30 * sin(2.3 * uSw.w * s + 1.1 + 0.9 * uSw.z));
}
// a still cut-out
vec4 hung(sampler2D s, vec4 A, vec4 B, vec4 C, vec2 p, vec3 warm){
  if (C.x <= 0.0) return vec4(0.0);
  vec2 d = p - A.xy;
  float cs = cos(-B.z), sn = sin(-B.z);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  vec2 q = B.xy + d / A.zw;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0);
  vec4 c = textureLod(s, q, B.w);
  c.rgb += c.rgb * warm * C.z;
  c.a *= C.x;
  return c;
}
// a puppet: one frame out of the atlas (its gradients worked out, so the frame's edges never pick a wrong mip)
vec4 puppet(vec4 P, vec4 Q, vec4 R, vec4 S, vec2 p, out vec2 qo){
  qo = vec2(-1.0);
  if (S.x <= 0.0) return vec4(0.0);
  vec2 d = p - P.xy;
  float cs = cos(-Q.z), sn = sin(-Q.z);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  float fl = S.y > 0.5 ? -1.0 : 1.0;
  vec2 q = Q.xy + vec2(fl * d.x, d.y) / P.zw;
  qo = q;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0);
  float px = exp2(Q.w) / uRes.y;
  vec2 gx = vec2(fl * cs, sn) * px / P.zw * R.zw, gy = vec2(-fl * sn, cs) * px / P.zw * R.zw;
  return textureGrad(uAt, R.xy + q * R.zw, gx, gy);
}
// a wave strip: tiled along its length, lifted and dropped by the swell, its creases flashing, the light's path on it
vec4 strip(sampler2D s, vec4 L, vec4 M, vec4 N, vec2 p, vec3 warm){
  float sx = (p.x - L.x) / L.z + L.w;
  float eta = swell(sx, uSw.x * M.z + 0.0) ;
  float v = ((p.y - L.y) / L.z - eta) / M.x;
  float u = sx / M.y;
  vec2 uv = vec2(u, v);
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  float k = exp2(N.x);
  vec4 c = textureGrad(s, vec2(u, clamp(v, 0.002, 0.998)), gx * k, gy * k);
  if (v > 1.0) c = vec4(0.0);
  float l = dot(c.rgb, vec3(0.333));
  float satc = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float cel = smoothstep(0.12, 0.35, satc);                     // (the cellophane — not the wool of the foam)
  c.rgb += c.rgb * warm * N.z * (1.0 + 0.8 * uLift);
  // glints: one place in each cell of a grid over the strip, flashing on frames of its own — a short horizontal
  // flash, as a crease of cellophane turns to the light
  vec2 gc = vec2(u * 300.0, v * 30.0), ci = floor(gc), cf = fract(gc);
  vec2 gp = vec2(hash12(ci + 3.1), hash12(ci + 7.7)) * 0.6 + 0.2;
  vec2 gd = (cf - gp) * vec2(2.2, 4.5);
  float gsh = exp(-dot(gd, gd) * 3.0);
  float flash = step(0.62, hash12(ci + vec2(uStep * 1.37, uStep * 0.71)));
  float crease = (0.15 + 0.85 * cel) * (0.35 + pow(sat(l * 1.3), 2.0));
  c.rgb += vec3(0.9, 0.95, 1.0) * N.y * 0.55 * cel * flash * step(0.86, hash12(ci + 11.0)) * gsh * pow(sat(l * 1.4), 2.0);
  // the light's path: a column of broken gold on the water below it, wider and fainter the nearer it comes
  float dx = p.x - uHero.x, below = uHero.y - p.y;
  float wid = 0.028 + 0.20 * max(below, 0.0);
  float path = uHero.z * exp(-dx * dx / (wid * wid)) * smoothstep(-0.04, 0.06, below) * exp(-max(below, 0.0) * 0.9);
  float flash2 = step(0.40, hash12(ci + vec2(uStep * 0.93, 5.0 + uStep * 1.11)));
  c.rgb += vec3(1.0, 0.74, 0.40) * path * N.y * crease * (0.42 + 4.2 * flash2 * gsh) * (0.8 + 0.8 * uLift);
  return c;
}
float sdStar5(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// a star cut from crumpled gold foil, turning on its thread (seen edge-on it is a sliver; face-on it flashes)
vec4 star(vec4 S, vec2 p, vec3 warm){
  vec2 d = p - S.xy;
  float cs = cos(S.w), ac = max(abs(cs), 0.07);
  // the thread
  float th = smoothstep(1.2 / uRes.y, 0.2 / uRes.y, abs(d.x)) * step(S.z * 0.9, d.y) * 0.45;
  vec2 q = vec2(d.x / ac, d.y) / S.z;
  float sd = sdStar5(q, 1.0, 0.45) * S.z;
  float a = smoothstep(1.0 / uRes.y, -0.5 / uRes.y, sd);
  float cr = vnoise(q * 9.0 + floor(S.w * 3.0)) * 0.6 + vnoise(q * 23.0) * 0.4;
  vec3 col = vec3(0.92, 0.72, 0.30) * (0.45 + 0.55 * ac) * (0.65 + 0.6 * cr);
  col += vec3(1.0, 0.92, 0.7) * pow(ac, 10.0) * smoothstep(0.55, 0.85, cr) * 1.2;
  col += col * warm * 1.2;
  vec4 o_ = vec4(vec3(0.82, 0.80, 0.76) + warm * 0.3, th);
  return a > 0.0 ? vec4(mix(o_.rgb, col, a), max(a, th)) : o_;
}
float threadA(vec4 T, vec2 p){
  if (T.z <= 0.0) return 0.0;
  float d = abs(p.x - T.x - (p.y - T.y) * 0.04);
  return T.z * smoothstep(1.3 / uRes.y, 0.2 / uRes.y, d) * step(T.y, p.y);
}
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float hr = length(p - uHero.xy);
  vec3 warm = vec3(1.0, 0.72, 0.40) * uHero.z * (0.9 * exp(-hr / 0.30) + 0.35 * exp(-hr / 0.9));
  // ---- the painted card sky, out of focus behind everything
  vec2 qs = (p - uSky4.xy) / uSky4.zw;
  vec3 c = textureLod(uSky, clamp(qs, 0.0, 1.0), 2.2).rgb;
  c += c * warm * (0.35 + 0.4 * uLift);
  vec4 l; vec2 q;
  for (int i = 0; i < 8; i++){ l = star(uStar[i], p, warm); c = mix(c, l.rgb, l.a); }
  l = hung(uMoon, uA[0], uB[0], uC[0], p, warm); c = mix(c, l.rgb, l.a);
  l = hung(uCl0, uA[1], uB[1], uC[1], p, warm); c = mix(c, l.rgb, l.a);
  l = hung(uCl1, uA[2], uB[2], uC[2], p, warm); c = mix(c, l.rgb, l.a);
  l = hung(uCl2, uA[3], uB[3], uC[3], p, warm); c = mix(c, l.rgb, l.a);
  // the far gull, on its thread
  c = mix(c, vec3(0.80, 0.80, 0.78) + warm * 0.3, threadA(uThr[0], p) * 0.5);
  l = puppet(uP[2], uQ[2], uR[2], uS[2], p, q); l.rgb += l.rgb * warm * uS[2].z; c = mix(c, l.rgb * 0.92, l.a);
  // the back strip of waves
  l = strip(uW0, uL[0], uM[0], uN[0], p, warm); c = mix(c, l.rgb, l.a);
  // the boat and its sailor
  l = puppet(uP[0], uQ[0], uR[0], uS[0], p, q);
  if (l.a > 0.0){
    l.rgb += l.rgb * warm * uS[0].z;
    // once the light has left the hands, the hands are empty: the painted ball taken out (the sky seen where it was),
    // the glow it painted on the sailor and the sail dimmed
    if (uHand.z > 0.0){
      float r = length((q - uHand.xy - vec2(0.0, 0.004)) * vec2(${(669 / 640).toFixed(4)}, 1.0));
      l.a *= 1.0 - uHand.z * smoothstep(0.037, 0.027, r);
      l.rgb *= 1.0 - uHand.z * (0.28 * exp(-r / 0.16) + 0.10);
    }
    c = mix(c, l.rgb, l.a);
  }
  // the middle strip (the boat sits in it)
  l = strip(uW1, uL[1], uM[1], uN[1], p, warm); c = mix(c, l.rgb, l.a);
  // the splash at the bow: cotton wool and cellophane, lit by the light when it is near
  l = puppet(uP[1], uQ[1], uR[1], uS[1], p, q); l.rgb += l.rgb * warm * uS[1].z; c = mix(c, l.rgb, l.a * uS[1].x);
  // the near gull, on its thread
  c = mix(c, vec3(0.86, 0.84, 0.80) + warm * 0.4, threadA(uThr[1], p) * 0.55);
  l = puppet(uP[3], uQ[3], uR[3], uS[3], p, q); l.rgb += l.rgb * warm * uS[3].z; c = mix(c, l.rgb, l.a);
  // the front strip, close to the lens and soft
  l = strip(uW2, uL[2], uM[2], uN[2], p, warm); c = mix(c, l.rgb, l.a);
  // ---- motes of dust floating in its light
  for (int i = 0; i < 18; i++){
    float fi = float(i);
    vec2 m = uHero.xy + vec2(sin(fi * 7.1 + t * 0.21) * 0.25, cos(fi * 3.7 + t * 0.17) * 0.2) * (0.5 + 0.5 * hash12(vec2(fi, 2.0)));
    float r = length(p - m);
    c += vec3(1.0, 0.85, 0.6) * uHero.z * 0.35 * smoothstep(0.0035, 0.0, r) * exp(-length(m - uHero.xy) / 0.25);
  }
  // ---- the light: a warm white core and its bloom
  c += vec3(1.0, 0.86, 0.6) * uHero.z * (exp(-hr * hr / (uHero.w * uHero.w * 0.05)) * 1.4 + 0.25 * exp(-hr / (uHero.w * 1.8)));
  // a real lamp on a set: the exposure breathes a little from frame to frame
  c *= 1.0 + uFlick;
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.28 * dot(uv, uv) * 1.6;
  c = 1.0 - exp(-c * 1.25); c = pow(c, vec3(0.95));
  c = mix(c, vec3(1.0, 0.99, 0.96), uWhite);
  c += (hash12(gl_FragCoord.xy + fract(t * 7.13) * 917.0) - 0.5) * 0.012;
  o = vec4(c * uFade, 1.0);
}`;
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const hj = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const FPS = 12;                                   // the set moves on twos: twelve positions a second
// the things hanging still, back to front: [asset, pivot on the set (x, y), height, how near (k), pivot in its picture (u, v), focus lod, warmth]
const HUNG = [
  ['stop_moon',    0.55, 0.60, 0.46, 1.06, 0.508, 1.00, 1.4, 0.25],
  ['stop_cloud0', -0.70, 0.62, 0.40, 1.10, 0.454, 1.00, 1.5, 0.35],
  ['stop_cloud1', -0.08, 0.64, 0.33, 1.12, 0.407, 1.00, 1.5, 0.40],
  ['stop_cloud2',  1.02, 0.62, 0.36, 1.14, 0.469, 1.00, 1.5, 0.40],
];
// the wave strips: [asset, foot y on the set, height, k, flow (set units a second), swell gain, swell phase, lod, glints, warmth]
const STRIPS = [
  ['stop_wave_back',  -0.50, 0.22, 1.25, 0.33, 0.55,  1.3, 1.0, 0.8, 0.55],
  ['stop_wave_mid',   -0.62, 0.40, 1.50, 0.41, 1.00,  0.0, 0.15, 1.0, 0.75],
  ['stop_wave_front', -0.76, 0.44, 1.90, 0.52, 1.20, -0.9, 1.1, 0.9, 0.70],
];
// foil stars hung in the sky: [x, y on the set, size, k, phase]
const STARS = [[-1.25, 0.38, 0.034, 1.03, 0.4], [-0.52, 0.45, 0.026, 1.04, 2.1], [0.12, 0.33, 0.038, 1.05, 4.0],
  [0.98, 0.43, 0.030, 1.04, 5.3], [1.42, 0.30, 0.036, 1.05, 1.2], [0.40, -0.02, 0.028, 1.07, 3.1],
  [-0.10, 0.10, 0.030, 1.06, 2.6], [0.82, 0.06, 0.025, 1.06, 0.9]];
const KB = 1.50, BOAT_H = 0.44, BOAT_Y = -0.42;   // the boat rides the middle strip
const LAMBDA = 1.30, KW = 2 * Math.PI / LAMBDA;
// the sailor's poses (the atlas's frames): the first sheet, then the second
const PO = { cup: 0, lean: 1, ahead: 2, shoulder: 3, raise: 4, high: 5, hug: 6, brace: 7, laugh: 8, wonder: 9, offer: 10, smile: 11 };
const FALLBACK = { hug: 'cup', brace: 'lean', laugh: 'ahead', wonder: 'shoulder', offer: 'raise', smile: 'cup' };
// what the sailor does, and when
const ACTS = [
  [0.0, 'cup'], [1.5, 'hug'], [2.6, 'cup'], [3.3, 'brace'], [4.35, 'laugh'], [5.2, 'lean'], [6.1, 'ahead'],
  [6.9, 'wonder'], [7.9, 'offer'], [9.0, 'wonder'], [9.35, 'brace'], [9.95, 'laugh'], [10.75, 'smile'],
  [11.5, 'shoulder'], [12.1, 'raise'], [12.7, 'high'],
];
const T_LEAVE = 13.15;                            // the light leaves the raised hands
W.stop = {
  ready: false, t: 0, fade: 1, vol: 0, white: 0, T: 15.6,
  hero: { p: [0, 0], b: 1 },
  init() {
    if (this.ready) return;
    this.p = YL.makeProgram('stop', VS, FS); YL.checkProgram(this.p);
    this.vao = YL.gl.createVertexArray();
    if (YL.QS.has('st')) this.t = +YL.QS.get('st');
    this.ready = true;
  },
  start() { this.t = 0; this.white = 0; this.events = null; },
  // ---- the voyage (all in set units, on the boat's depth)
  boatX(t) { const s = clamp01(t / 4.6); return -0.42 + 0.07 * (t - 4.6) - 1.0 * (1 - s) * (1 - s); },
  // how high the sea runs: two big swells (the sailor braces, the bow dives, a splash), then calm as the light is raised
  amp(t) {
    const g = (c, w) => Math.exp(-(((t - c) / w) ** 2));
    return (0.016 + 0.021 * g(4.3, 0.95) + 0.022 * g(9.75, 0.95)) * (1 - 0.55 * ease((t - 11.0) / 2.0));
  },
  // the swell's phase, set so the first big crest has just passed under the boat at 4.6 s (the bow going down)
  phase() {
    if (this.ph === undefined) this.ph = Math.PI - KW * (this.boatX(4.6) + STRIPS[1][4] * 4.6) + 0.35;
    return this.ph;
  },
  swell(s, A, ts, ph) { return A * (Math.sin(KW * s + ph) + 0.30 * Math.sin(2.3 * KW * s + 1.1 + 0.9 * ts)); },
  // the boat on the swell at (stepped) time ts: its height and its pitch
  ride(ts) {
    const s = this.boatX(ts) + STRIPS[1][4] * ts, A = this.amp(ts), ph = this.phase();
    const y = this.swell(s, A, ts, ph);
    // the pitch: the slope of the water under the hull (a hull's length, so the small ripples don't toss it)
    const h = 0.16, slope = (this.swell(s + h, A, ts, ph) - this.swell(s - h, A, ts, ph)) / (2 * h);
    return { y, ang: Math.atan(slope * 1.05) };
  },
  // the bow's dives (each throws up a splash): found once, on the twelve-a-second steps
  dives() {
    if (this.events) return this.events;
    const ev = []; let prev = null, prev2 = null;
    const bow = (ts) => { const r = this.ride(ts); return r.y + Math.sin(r.ang) * 0.20; };
    for (let i = 2; i < this.T * FPS; i++) {
      const ts = i / FPS, v = (bow(ts) - bow(ts - 1 / FPS)) * FPS;
      if (prev !== null && prev2 !== null && prev < prev2 && prev <= v && prev < -0.10 && (!ev.length || ts - ev[ev.length - 1].t > 1.6))
        ev.push({ t: ts - 1 / FPS, k: Math.min(1, -prev / 0.30) });
      prev2 = prev; prev = v;
    }
    return (this.events = ev);
  },
  pose(t) {
    const n = (YL.STOP_ATLAS && YL.STOP_ATLAS.poses.n) || 6;
    let name = ACTS[0][1];
    for (const [t0, a] of ACTS) if (t >= t0) name = a;
    let i = PO[name]; if (i >= n) i = PO[FALLBACK[name]];
    return i;
  },
  // the camera: from right up against the moon (the circle of the painting it came out of), back and down to the
  // little sea as the boat sails in; then along with the boat; up a little as the light is raised; in to the light
  cam(t) {
    const a = ease((t - 0.9) / 3.4), ay = ease((t - 0.75) / 2.9), az = ease((t - 0.8) / 3.3);
    const zT = lerp(1.08, 1.20, ease((t - 4.8) / 6.5)) - 0.05 * ease((t - 11.4) / 1.8) + 0.45 * ease((t - 13.3) / 2.3);
    const S = zT * (1 + (KB - 1) * (zT - 1) * 0.6);
    const xs = lerp(-0.20, 0.0, ease((t - 4.0) / 7.5));           // where the boat is kept on the screen
    const tx = (this.boatX(Math.max(t - 0.3, 0)) - xs / S) / KB;
    const ty = lerp(-0.10, -0.12, ease((t - 4.8) / 6.5)) + 0.07 * ease((t - 11.4) / 1.8) + 0.06 * ease((t - 13.3) / 2.3);
    const z = lerp(2.7, zT, Math.pow(az, 0.8));
    return { x: lerp(0.54, tx, a), y: lerp(0.30, ty, ay), z };
  },
  // where the moon is on the screen at t: its pivot (x, y) and its width and height (the Kandinsky ends on its outline)
  moonRect(t) {
    const m = HUNG[0], c = this.cam(t), [sx, sy, sc] = this.place(m[1], m[2], m[4], c), sz = YL.ASSET_SIZE && YL.ASSET_SIZE.stop_moon;
    const H = m[3] * sc; return [sx, sy, H * (sz ? sz[0] / sz[1] : 0.659), H];
  },
  // where a thing on the set is on the screen: nearer things (k) slide and grow more as the camera moves
  place(x, y, k, c) { return [(x - c.x * k) * c.z, (y - c.y * k) * c.z, this.scl(k, c)]; },
  scl(k, c) { return c.z * (1 + (k - 1) * (c.z - 1) * 0.6); },
  // a thing at the boat's depth and nearer: its position and its size scale together
  placeN(x, y, k, c) { const S = this.scl(k, c); return [(x - c.x * k) * S, (y - c.y * k) * S, S]; },
  update(dt) {
    this.t += dt;
    this.white = ease((this.t - 13.9) / 1.6);
    this.sound(dt);
  },
  // an atlas frame's rectangle, in the atlas's uv (the atlas is turned up the right way when it is uploaded)
  frame(kind, j) {
    const M = YL.STOP_ATLAS[kind], sz = YL.ASSET_SIZE.stop_atlas, [x, y] = M.at[j];
    return [x / sz[0], 1 - (y + M.h) / sz[1], M.w / sz[0], M.h / sz[1]];
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p, t = this.t;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    const c = this.cam(t);
    const step = Math.floor(t * FPS), ts = step / FPS;
    this.lift = ease((t - 12.0) / 1.6);                                       // (the light raised: the little sea brightens)
    const boil = (id, a) => (hj(step * 7.31 + id * 13.7) - 0.5) * a;          // a hand on the puppet, a hair off each frame
    const ATL = YL.STOP_ATLAS, AS = YL.ASSET_SIZE || {};
    // ---- still things
    const A = new Float32Array(16), B = new Float32Array(16), C = new Float32Array(16), texs = [];
    HUNG.forEach(([k, x, y, hgt, kd, pu, pv, lod, warmth], i) => {
      const tx = YL.assetTex(k), sz = AS[k]; texs.push(tx);
      if (!tx || !sz) return;
      let xx = x, yy = y, ang = 0;
      if (k === 'stop_moon') ang = 0.05 * Math.sin(ts * 0.9) + boil(1, 0.004);
      else { const ph = i * 1.7; ang = 0.07 * Math.sin(ts * 1.1 + ph) + boil(i, 0.006); yy = y + 0.005 * Math.sin(ts * 0.7 + ph); xx = x - 0.012 * ts; }
      const [sx, sy, sc] = this.place(xx, yy, kd, c);
      const H = hgt * sc;
      A.set([sx, sy, H * sz[0] / sz[1], H], i * 4); B.set([pu, pv, ang, lod], i * 4); C.set([1, 0, warmth + 0.5 * this.lift, 0], i * 4);
    });
    // ---- the strips
    const L = new Float32Array(12), M = new Float32Array(12), N = new Float32Array(12), wtex = [];
    const ph = this.phase(), A_ = this.amp(ts);
    STRIPS.forEach(([k, y, hgt, kd, flow, gain, sph, lod, glint, warmth], i) => {
      const tx = YL.tileTex(k), sz = AS[k]; wtex.push(tx);
      if (!sz) return;
      const [sx, sy, S] = this.placeN(0, y, kd, c);
      L.set([sx, sy, S, flow * ts], i * 4); M.set([hgt, hgt * sz[0] / sz[1], gain, 0], i * 4);
      N.set([lod + (i === 2 ? 0.8 * (c.z - 1) : 0), glint, warmth, 0], i * 4);
    });
    // (each strip's swell: the same wave, its own gain and a shift of phase — passed as a gain on the amplitude and a phase)
    // the shader takes one phase; the strips' own shifts are folded into the flow (a shift of the water along the strip)
    STRIPS.forEach(([, , , , , , sph], i) => { L[i * 4 + 3] += sph / KW; });
    // ---- the puppets: 0 boat, 1 splash, 2 far gull, 3 near gull
    const P = new Float32Array(16), Q = new Float32Array(16), R = new Float32Array(16), Sx = new Float32Array(16);
    const thr = new Float32Array(8);
    let hand = [0, 0], handUV = [0.5, 0.5], leave = ease((t - T_LEAVE) / 0.6);
    if (ATL && AS.stop_atlas) {
      const PM = ATL.poses, pi = this.pose(ts), ride = this.ride(ts);
      const bx = this.boatX(ts) + boil(21, 0.003), by = BOAT_Y + ride.y + boil(22, 0.002), ang = ride.ang + boil(23, 0.006);
      const [sx, sy, S] = this.placeN(bx, by, KB, c), H = BOAT_H * S, Wd = H * PM.w / PM.h;
      P.set([sx, sy, Wd, H], 0); Q.set([PM.anchor[0], PM.anchor[1], ang, 0], 0); R.set(this.frame('poses', pi), 0);
      Sx.set([1, 0, 0.30 + 0.3 * this.lift, 0], 0);
      handUV = PM.lights[pi];
      const turn = (u, v) => { const du = (u - PM.anchor[0]) * Wd, dv = (v - PM.anchor[1]) * H, cs = Math.cos(ang), sn = Math.sin(ang); return [sx + cs * du - sn * dv, sy + sn * du + cs * dv]; };
      hand = turn(handUV[0], handUV[1]);
      // the splash: thrown up at the bow as it dives, six frames
      const SP = ATL.spray;
      for (const e of this.dives()) {
        const f = Math.floor((t - e.t) * 9);
        if (f < 0 || f >= SP.n) continue;
        const [qx, qy] = turn(0.86, 0.10), Hs = H * (0.42 + 0.30 * e.k);
        P.set([qx, qy, Hs * SP.w / SP.h, Hs], 4); Q.set([SP.anchor[0], SP.anchor[1], ang * 0.5, 0.3], 4); R.set(this.frame('spray', f), 4);
        Sx.set([0.95, 0, 0.9, 0], 4);
      }
      // the gulls: four frames of the wings, on threads from above
      const GL = ATL.gull, KNOT = [0.4895, 0.992];
      const gull = (slot, x, y, k, hgt, flip, flapRate, warmth, tslot) => {
        const [gx, gy, S] = this.placeN(x, y, k, c), Hg = hgt * S, Wg = Hg * GL.w / GL.h;
        const f = Math.floor(ts * flapRate) % GL.n;
        P.set([gx, gy, Wg, Hg], slot * 4); Q.set([GL.anchor[0], GL.anchor[1], boil(slot, 0.03), slot === 2 ? 1.0 : 0.1], slot * 4);
        R.set(this.frame('gull', f), slot * 4); Sx.set([1, flip ? 1 : 0, warmth, 0], slot * 4);
        // the knot: from the beak (the pivot) to the thread's place in the frame
        const kx = (flip ? -1 : 1) * (KNOT[0] - GL.anchor[0]) * Wg, ky = (KNOT[1] - GL.anchor[1]) * Hg;
        thr.set([gx + kx, gy + ky, 1, 0], tslot * 4);
      };
      // far: across the sky, right to left
      if (t < 12.5) gull(2, 1.15 - 0.27 * ts, Math.max(0.02, 0.30 - 0.06 * ts) + 0.02 * Math.sin(ts * 2.1), 1.12, 0.075, false, 6, 0.2, 0);
      // near: catches up with the boat from behind, hangs over the light (the sailor offers it up), then away up and ahead
      if (t > 5.6 && t < 13.2) {
        const kx = [[5.6, -1.25, 0.62], [7.5, 0.06, 0.46], [8.6, 0.16, 0.52], [9.6, 0.10, 0.47], [10.7, 0.16, 0.50], [12.9, 1.30, 0.95]];
        let j = 0; while (j < kx.length - 2 && ts > kx[j + 1][0]) j++;
        const [t0, x0, y0] = kx[j], [t1, x1, y1] = kx[j + 1], u = ease((ts - t0) / (t1 - t0));
        const hov = clamp01((ts - 7.3) / 0.6) * (1 - clamp01((ts - 10.7) / 0.5));
        const ox = lerp(x0, x1, u) + hov * 0.035 * Math.sin((ts - 7.5) * 2.4), oy = lerp(y0, y1, u) + hov * 0.02 * Math.sin((ts - 7.5) * 3.7);
        gull(3, bx + ox, by + oy, KB, 0.17, true, hov > 0.5 ? 12 : 8, 0.9, 1);
      }
    }
    // ---- the light: in the hands; then lifted off them, floating up toward the eye, growing, all white
    const up = ease((t - T_LEAVE) / 2.4);
    this.hero.p = [lerp(hand[0], 0.03, up), lerp(hand[1], 0.07, up) + 0.06 * Math.sin(Math.PI * up)];
    this.hero.b = 0.80 + 0.06 * Math.sin(t * 2.3) + 0.25 * this.lift + 2.2 * up * up;
    const skyTex = YL.assetTex('stop_sky');
    const [kx, ky, ksc] = this.place(-1.5, -0.5, 1.0, c);
    U(p, 'uSky4', [kx, ky, 3.0 * ksc, 1.0 * ksc]);
    gl.uniform4fv(p.u.uA, A); gl.uniform4fv(p.u.uB, B); gl.uniform4fv(p.u.uC, C);
    gl.uniform4fv(p.u.uL, L); gl.uniform4fv(p.u.uM, M); gl.uniform4fv(p.u.uN, N);
    gl.uniform4fv(p.u.uP, P); gl.uniform4fv(p.u.uQ, Q); gl.uniform4fv(p.u.uR, R); gl.uniform4fv(p.u.uS, Sx);
    gl.uniform4fv(p.u.uThr, thr);
    // the foil stars: each on its thread, turning a little this way and that, a frame at a time
    const st = new Float32Array(32);
    STARS.forEach(([x, y, sz, k, ph], i) => {
      const [sx, sy, sc] = this.place(x - 0.004 * ts, y + 0.004 * Math.sin(ts * 0.8 + ph), k, c);
      st.set([sx, sy, sz * sc, ph + 1.3 * Math.sin(ts * 0.55 + ph * 2.0) + 0.35 * ts], i * 4);
    });
    gl.uniform4fv(p.u.uStar, st);
    U(p, 'uSw', [A_, ph, ts, KW]);
    U(p, 'uRes', [w, h]); U(p, 'uTime', t); U(p, 'uStep', step); U(p, 'uFade', this.fade); U(p, 'uLift', this.lift);
    U(p, 'uWhite', this.white); U(p, 'uFlick', 0.012 * (Math.sin(step * 12.9898) * 0.5));
    U(p, 'uHero', [this.hero.p[0], this.hero.p[1], this.hero.b, 0.022 + 0.05 * up]);
    U(p, 'uHand', [handUV[0], handUV[1], leave, 0]);
    const bind = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex || null); gl.uniform1i(p.u[name], unit); };
    bind('uSky', skyTex, 0);
    ['uMoon', 'uCl0', 'uCl1', 'uCl2'].forEach((n, i) => bind(n, texs[i], 1 + i));
    ['uW0', 'uW1', 'uW2'].forEach((n, i) => bind(n, wtex[i], 5 + i));
    bind('uAt', YL.assetTex('stop_atlas'), 8);
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: the little sea (a soft wash that swells as the boat climbs and dives), the cellophane crinkling as the
     strips turn, a splash at each dive, the gulls, the paper hull creaking at the ends of its pitch */
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO && YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime, t = this.t;
    S.bus.gain.setTargetAtTime(this.vol * this.fade * (1 - this.white), now, 0.3);
    const step = Math.floor(t * FPS);
    if (step !== S.last) {
      const ts = step / FPS, r = this.ride(ts), r0 = this.ride(ts - 1 / FPS), vy = (r.y - r0.y) * FPS;
      S.wash.gain.setTargetAtTime(0.16 + 2.2 * Math.abs(vy) + 4.0 * this.amp(ts), now, 0.15);
      if (step % 3 === 0) this.crinkle(now + 0.01, 0.4 + 0.6 * Math.abs(Math.sin(t * 1.6)));
      // the hull creaks as its pitch turns
      const a2 = this.ride(ts - 2 / FPS).ang, a1 = r0.ang;
      if ((a1 - a2) * (r.ang - a1) < 0 && Math.abs(a1) > 0.07) this.creak(now + 0.02, Math.min(1, Math.abs(a1) / 0.15));
      for (const e of this.dives()) if (step === Math.round(e.t * FPS)) this.splash(now + 0.02, e.k);
      for (const [tc, k, f] of [[2.4, 0.35, 1.0], [6.4, 0.8, 1.12], [8.3, 1.0, 1.25], [8.75, 0.7, 1.18], [11.3, 0.6, 1.05]])
        if (step === Math.round(tc * FPS)) this.cry(now + 0.02, k, f);
      S.last = step;
    }
  },
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    const wash = ctx.createGain(); wash.gain.value = 0.2;
    loop(noiseBuffer(5.7, 'brown'), 1.0, lp); lp.connect(wash); wash.connect(bus);
    this.snd = { ctx, bus, wash, last: -1, noise: noiseBuffer(2.3, 'white') };
  },
  burst(when, dur, type, f, q, gain, attack = 0.005) {
    const S = this.snd, ctx = S.ctx;
    const s = ctx.createBufferSource(); s.buffer = S.noise;
    const bp = ctx.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
    s.connect(bp); bp.connect(g); g.connect(S.bus); s.start(when, Math.random() * 1.5); s.stop(when + dur + 0.05);
  },
  crinkle(when, k) {
    const S = this.snd, ctx = S.ctx, sr = ctx.sampleRate, n = Math.floor(sr * 0.12);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() < 0.06 ? Math.random() * 2 - 1 : 0) * Math.exp(-i / (n * 0.4));
    const s = ctx.createBufferSource(); s.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.value = 0.10 * k;
    s.connect(hp); hp.connect(g); g.connect(S.bus); s.start(when);
  },
  // a splash: a wash of water, then the cellophane rattling as the cotton-wool spray falls
  splash(when, k) {
    this.burst(when, 0.9, 'bandpass', 900, 0.7, 0.30 * (0.4 + 0.6 * k), 0.03);
    this.burst(when + 0.05, 0.6, 'highpass', 2500, 0.5, 0.10 * k, 0.01);
    for (let i = 0; i < 4; i++) this.crinkle(when + 0.12 + i * 0.09, 0.6 * k);
  },
  creak(when, k) { this.burst(when, 0.22, 'bandpass', 380 + 120 * Math.random(), 9, 0.06 * k, 0.04); },
  // a gull: a falling cry, twice (a reed-ish tone through a narrow band)
  cry(when, k, f) {
    const ctx = this.snd.ctx;
    for (let i = 0; i < 2; i++) {
      const w0 = when + i * 0.26, o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(1500 * f, w0); o.frequency.linearRampToValueAtTime(1900 * f, w0 + 0.05); o.frequency.exponentialRampToValueAtTime(1050 * f, w0 + 0.22);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 * f; bp.Q.value = 2.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, w0); g.gain.linearRampToValueAtTime(0.035 * k, w0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, w0 + 0.24);
      o.connect(bp); bp.connect(g); g.connect(this.snd.bus); o.start(w0); o.stop(w0 + 0.26);
    }
  },
};
})();
