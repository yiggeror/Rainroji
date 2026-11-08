/* ============================================================================
   世界 · 康定斯基（点、线、面）
   ----------------------------------------------------------------------------
   睡莲池还在，可它开始变成一张画：睡莲叶成了平涂的绿椭圆，花苞成了带光晕的粉圆，柳条成了一道道绿弧，
   水平线成了一根淡紫的线——底下的池子慢慢退成画布的米色。
   一粒光停在左边，成了那个「点」：线一根一根从它射出去，蓝色的大圆开出来，圆里一个黄圆，一道黑弧扫过，
   三角、方格、黑白格、红色的半圆从底下升起……每一样都踩着配乐的拍子出现，然后跟着音乐呼吸。
   最后镜头推进那个蓝圆：黑弧切过黄圆，黄圆成了一弯月亮——下一个世界里那弯真的纸板月亮。
   画法：全部是代码画的形状（圆、椭圆、三角、线、弧、方格），边缘有一点手绘的抖，颜色里有刷痕，底下是布纹。
   构图参照 assets/prompts/k1.txt 生成的那张定帧。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uFade, uBg, uAspect, uBeat;
uniform vec4 uView;           // the eye: centre x, y (in the picture), zoom, how far into the crescent (0 … 1)
uniform vec4 uHero;           // the light: x, y (picture), brightness, size
uniform sampler2D uPond;      // the pond it is coming out of (for the first seconds)
uniform sampler2D uCanvas;    // a scan of primed linen
uniform sampler2D uMoon;      // the cardboard moon of the next world (its outline: the crescent becomes its shape)
uniform vec4 uMoonR;          // where that moon will be on the screen: its pivot (top middle) x, y, its width, height
uniform vec4 uMoonV;          // the eye at the very end (x, y, zoom), and how far the crescent has become the moon's shape
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }
float sat(float x){ return clamp(x, 0.0, 1.0); }
const vec3 ULTRA = vec3(0.12, 0.19, 0.60), YEL = vec3(0.98, 0.78, 0.13), VERM = vec3(0.88, 0.26, 0.11), INK = vec3(0.07, 0.065, 0.07),
           LILAC = vec3(0.73, 0.63, 0.86), GREEN = vec3(0.41, 0.58, 0.33), PINK = vec3(0.93, 0.67, 0.82), GROUND = vec3(0.94, 0.86, 0.70);
// how far along a shape's entrance is (0 … 1), and an entrance that overshoots a little and settles (a pop on the beat)
float ap(float t0, float d){ return sat((uTime - t0) / d); }
float pop(float t0){ float x = ap(t0, 0.42), y = x - 1.0; return x <= 0.0 ? 0.0 : 1.0 + 2.70158 * y * y * y + 1.70158 * y * y; }
// (once it is all there it breathes with the music: a slow swell over a bar, and a little push on every beat)
float beatP(){ return exp(-fract(uTime * 1.8333) * 5.0) * smoothstep(5.5, 6.5, uTime); }
float breathe(float ph){ return 1.0 + (0.034 * sin(uTime * 2.88 + ph) + 0.018 * beatP()) * smoothstep(5.5, 6.5, uTime); }
float sdCircle(vec2 p, vec2 c, float r){ return length(p - c) - r; }
float sdEll(vec2 p, vec2 c, vec2 r){ vec2 q = (p - c) / r; return (length(q) - 1.0) * min(r.x, r.y); }
float sdBox(vec2 p, vec2 a, vec2 b){ vec2 c = (a + b) * 0.5, h = (b - a) * 0.5; vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2){
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2, v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * sat(dot(v0, e0) / dot(e0, e0)), pq1 = v1 - e1 * sat(dot(v1, e1) / dot(e1, e1)), pq2 = v2 - e2 * sat(dot(v2, e2) / dot(e2, e2));
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
// an arc of a circle drawn as a stroke: centre, radius, width, from angle a0 sweeping s (radians), drawn so far (0 … 1)
float arcMask(vec2 p, vec2 c, float r, float w, float a0, float s, float k){
  vec2 d = p - c; float a = atan(d.y, d.x) - a0; a = mod(a + 12.566, 6.2832);
  float inA = step(a, s * k);
  return smoothstep(w, w * 0.4, abs(length(d) - r)) * inA;
}
float qbez(vec2 p, vec2 A, vec2 B, vec2 C){      // (distance to a quadratic curve, sampled)
  float m = 1e9; vec2 pr = A;
  for (int i = 1; i <= 14; i++){ float t = float(i) / 14.0; vec2 q = mix(mix(A, B, t), mix(B, C, t), t); m = min(m, sdSeg(p, pr, q)); pr = q; }
  return m;
}
vec3 C;  // the picture so far
vec2 P;  // where we are in it
float rough(){ return (vnoise(P * 140.0) - 0.5) * 0.0028 + (vnoise(P * 31.0) - 0.5) * 0.0018; }
vec3 brush(vec3 col){ vec2 q = P * mat2(0.8, -0.6, 0.6, 0.8); return col * (0.94 + 0.10 * fbm(vec2(q.x * 60.0, q.y * 9.0))); }
void fillSd(float sd, vec3 col, float k){ if (k <= 0.0) return; float a = smoothstep(0.0016, -0.0016, sd + rough()) * k; C = mix(C, brush(col), a); }
void fillA(float a, vec3 col){ C = mix(C, brush(col), sat(a)); }
const vec3 TEAL = vec3(0.17, 0.43, 0.44), OLIVE = vec3(0.66, 0.64, 0.25), DEEPG = vec3(0.24, 0.40, 0.25);
void pad(vec2 p, vec2 c, vec2 r, int kind, float contour){
  if (r.x <= 0.0) return;
  vec3 band = kind == 0 ? TEAL : kind == 1 ? OLIVE : LILAC;
  fillSd(sdEll(p, c, r), GREEN, 1.0);
  fillSd(sdEll(p, c + vec2(0.04, 0.10) * r, r * 0.74), band, 1.0);
  fillSd(sdEll(p, c + vec2(0.07, 0.16) * r, r * 0.46), kind == 2 ? GREEN : DEEPG, 1.0);
  fillSd(sdEll(p, c + vec2(0.09, 0.20) * r, r * 0.22), kind == 1 ? TEAL : OLIVE, 1.0);
  if (contour > 0.0){
    float d = abs(sdEll(p, c, r)) - 0.0022;
    fillA(smoothstep(0.0012, -0.0012, d + rough() * 0.4) * smoothstep(-0.2, 0.5, (p.y - c.y) / r.y) * smoothstep(1.0, 0.6, abs(p.x - c.x) / r.x), INK);
  }
}
void main(){
  vec2 sp = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  P = uView.xy + sp / uView.z;
  vec2 p = P;
  float t = uTime;
  // ---- the canvas: warm, primed, its weave showing
  C = GROUND * (0.97 + 0.05 * fbm(p * 3.0));
  vec2 cu = P * 1.1 + 0.5;
  float wv = (texture(uCanvas, cu).r - textureLod(uCanvas, cu, 5.0).r) * 9.0;
  // ---- shapes, back to front
  // the lilac horizon, drawn out from the point both ways
  { float k = ap(0.6, 1.0); float d = abs(p.y - 0.024); float reach = k * 1.4; fillA(smoothstep(0.0030, 0.0012, d + rough()) * step(abs(p.x + 0.43), reach), LILAC); }
  // lily pads, turned into his concentric rings: a green ellipse, a band of another colour inside it, a darker heart, and
  // on the big ones a black contour along the far edge (the pink buds on them glow, below)
  pad(p, vec2(-0.61, -0.17), vec2(0.26, 0.06) * pop(0.8) * breathe(0.0), 0, 1.0);
  pad(p, vec2(-0.10, -0.06), vec2(0.15, 0.035) * pop(1.1) * breathe(1.0), 1, 0.0);
  pad(p, vec2(0.42, -0.22), vec2(0.47, 0.12) * pop(1.35) * breathe(2.0), 2, 1.0);
  pad(p, vec2(0.46, -0.05), vec2(0.11, 0.02) * pop(1.6), 0, 0.0);
  pad(p, vec2(0.76, -0.10), vec2(0.13, 0.03) * pop(1.9), 1, 1.0);
  pad(p, vec2(-0.76, -0.02), vec2(0.07, 0.012) * pop(2.1), 2, 0.0);
  pad(p, vec2(0.21, 0.0), vec2(0.055, 0.010) * pop(2.2), 0, 0.0);
  // the big blue circle, its lilac halo, the yellow in it; the black arc sweeping over
  {
    vec2 c = vec2(-0.68, 0.33); float k = pop(2.7);
    float mk = uMoonV.w, grow = 1.0 + 1.6 * mk * mk;              // (at the very end the blue spreads: the night sky of the next world)
    fillSd(sdCircle(p, c, 0.245 * k * breathe(0.5) * grow), LILAC, 1.0);
    fillSd(sdCircle(p, c, 0.205 * k * breathe(0.5) * grow), ULTRA, 1.0);
    // the yellow disc; at the end a blue disc slides over it from the right and leaves a crescent — and the crescent takes
    // on the outline of the cardboard moon it is about to be (painted flat, in his yellow, a little warmer)
    vec2 cy = vec2(-0.57, 0.33);
    float aY = smoothstep(0.0016, -0.0016, sdCircle(p, cy, 0.112 * pop(3.3)) + rough());
    float aB = smoothstep(0.0016, -0.0016, sdCircle(p, cy + vec2(0.30, 0.05) * (1.0 - uView.w) + vec2(0.046, 0.013) * uView.w, 0.094) + rough()) * step(0.001, uView.w);
    // (the shape changes as one shape: the two outlines' signed distances, on the screen, blended)
    float cres = aY * (1.0 - aB);
    if (mk > 0.0){
      float dA = max(sdCircle(p, cy, 0.112), -sdCircle(p, cy + vec2(0.046, 0.013), 0.094)) * uMoonV.z;
      vec2 s = (p - uMoonV.xy) * uMoonV.z;
      vec2 mu = vec2(0.508 + (s.x - uMoonR.x) / uMoonR.z, 1.0 + (s.y - uMoonR.y) / uMoonR.w);
      float inside = step(0.0, mu.x) * step(mu.x, 1.0) * step(0.0, mu.y) * step(mu.y, 1.0);
      float dM = mix(0.5, (texture(uMoon, clamp(mu, vec2(0.0), vec2(1.0))).r * 255.0 - 128.0) * 3.0 / 1100.0 * uMoonR.w, inside);
      dM = max(dM, (mu.y - 0.70) * uMoonR.w);                      // (not the string)
      cres = smoothstep(0.0022, -0.0022, mix(dA, dM, mk) + rough() * uMoonV.z * 0.5);
    }
    C = mix(C, brush(ULTRA), aB * (1.0 - aY) * pow(1.0 - mk, 3.0));       // (the bite where it lies past the yellow)
    C = mix(C, brush(mix(YEL, vec3(0.93, 0.79, 0.42), 0.55 * mk)), cres);
  }
  fillA(arcMask(p, vec2(-0.48, -0.15), 0.50, 0.0045, 0.95, 1.75, ap(3.6, 0.55)) * (1.0 - uView.w), INK);
  // lilac rectangle, the yellow triangle sliding up, the narrow black slab
  fillSd(sdBox(p, vec2(-0.25, 0.03), vec2(-0.11, 0.03 + 0.27 * pop(3.0))), LILAC, 1.0);
  { float k = pop(3.3); fillSd(sdTri(p, vec2(-0.21, 0.03), vec2(0.01, 0.03 + 0.46 * k), vec2(0.01, 0.03)), YEL, step(0.001, k)); }
  fillSd(sdBox(p, vec2(-0.11, 0.40 - 0.11 * pop(3.8)), vec2(-0.07, 0.40)), INK, 1.0);
  // the red arc
  fillA(arcMask(p, vec2(0.08, 0.055), 0.235, 0.010, 0.0, 3.1416, ap(3.9, 0.5)), VERM);
  // the grid, its cells drawn one by one; three of them coloured, which change now and then with the music
  {
    vec2 a = vec2(0.28, 0.20), b = vec2(0.48, 0.40);
    if (p.x > a.x - 0.003 && p.x < b.x + 0.003 && p.y > a.y - 0.003 && p.y < b.y + 0.003){
      vec2 g = (p - a) / (b - a) * 5.0, gi = floor(g), gf = fract(g);
      float n = gi.y * 5.0 + gi.x, on = step(n, ap(4.1, 1.1) * 25.0);
      float lw = 0.035;
      float line = max(smoothstep(lw, lw * 0.4, min(gf.x, 1.0 - gf.x)), smoothstep(lw, lw * 0.4, min(gf.y, 1.0 - gf.y)));
      float bar = floor(max(t - 5.6, 0.0) / 2.18);
      float h = hash12(gi + bar * 7.0);
      vec3 cc = h > 0.86 ? VERM : h > 0.74 ? YEL : h > 0.66 ? INK : GROUND;
      if (cc != GROUND) fillA(on * step(lw, min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y))), cc);
      fillA(line * on, INK);
    }
  }
  // the willow: green fronds coming down from the top right, drawn from the top, swaying with the beat
  for (int i = 0; i < 7; i++){
    float fi = float(i), x0 = 0.05 + fi * 0.115, ye = 0.25 - mod(fi * 0.37, 0.38);
    float sw = 0.022 * sin(t * 1.44 + fi) * smoothstep(5.0, 6.0, t);
    vec2 A = vec2(x0, 0.53), B = vec2(x0 + 0.05 + sw, 0.30), E = vec2(x0 + 0.15 + sw * 2.0, ye);
    float k = ap(1.0 + fi * 0.28, 0.9);
    float vis = step(mix(0.53, ye - 0.02, k), p.y);
    float w = 0.0058 * (0.4 + 0.6 * sat((p.y - ye) / (0.53 - ye)));
    fillA(smoothstep(w, w * 0.45, qbez(p, A, B, E) + rough() * 0.5) * vis, GREEN);
  }
  // the red triangle, the checkered strips, the black and yellow block
  { float k = pop(4.4); fillSd(sdTri(p, vec2(0.68, 0.03), vec2(0.78, 0.03 + 0.116 * k), vec2(0.78, 0.03)), VERM, step(0.001, k)); }
  for (int s = 0; s < 2; s++){
    vec2 a = s == 0 ? vec2(-0.89, -0.35) : vec2(0.73, -0.02), b = s == 0 ? vec2(-0.62, -0.30) : vec2(0.87, 0.024);
    if (p.x > a.x && p.x < b.x && p.y > a.y && p.y < b.y){
      vec2 g = (p - a) / (b.y - a.y) * 2.0; vec2 gi = floor(g);
      float shown = step(gi.x, ap(4.6 + float(s) * 0.27, 0.6) * 14.0);
      fillA(shown * mod(gi.x + gi.y, 2.0), INK);
    }
  }
  fillSd(sdBox(p, vec2(-0.50, -0.31), vec2(-0.43, -0.31 + 0.07 * pop(4.9))), INK, 1.0);
  fillSd(sdBox(p, vec2(-0.50, -0.39 - 0.0 * pop(5.0)), vec2(-0.43, -0.31)), YEL, step(0.001, pop(5.0)));
  // a long blue arc low on the left, the red half-sun rising out of the bottom, a thin lilac ring round it all
  fillA(arcMask(p, vec2(0.01, -0.75), 0.53, 0.008, 1.92, 1.15, ap(5.1, 0.6)), ULTRA);
  fillSd(sdCircle(p, vec2(-0.22, -0.47 - 0.22 * (1.0 - pop(5.3)) + 0.035 * smoothstep(5.8, 10.0, t)), 0.17 * breathe(3.0)), VERM, 1.0);
  // small circles set loose, drifting round on slow orbits, each its own colour (his points that float)
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    vec2 o = vec2(-0.30 + 0.25 * fi - 0.35 * step(3.5, fi), 0.22 - 0.21 * mod(fi, 3.0));
    vec2 c = o + vec2(0.06 * sin(t * (0.35 + 0.07 * fi) + fi * 1.7), 0.04 * cos(t * (0.29 + 0.05 * fi) + fi * 2.3));
    float r = (0.010 + 0.007 * mod(fi * 1.7, 3.0)) * pop(5.6 + fi * 0.27) * (1.0 + 0.12 * beatP());
    vec3 cc = i == 0 ? VERM : i == 1 ? ULTRA : i == 2 ? YEL : i == 3 ? INK : i == 4 ? LILAC : VERM;
    fillSd(sdCircle(p, c, r), cc, step(0.0, r - 0.0005));
  }
  fillA(arcMask(p, vec2(-0.05, -0.12), 0.36, 0.0028, 3.6, 4.4, ap(5.5, 0.9)), LILAC);
  // pink buds on the pads, glowing
  {
    vec4 bud[4] = vec4[4](vec4(-0.62, -0.14, 0.040, 1.4), vec4(-0.13, -0.04, 0.028, 1.6), vec4(0.40, -0.20, 0.075, 1.8), vec4(0.49, -0.03, 0.020, 2.0));
    for (int i = 0; i < 4; i++){
      float k = pop(bud[i].w) * breathe(float(i));
      float d = length(p - bud[i].xy);
      C += vec3(1.0, 0.85, 0.35) * 0.35 * exp(-max(d - bud[i].z * k, 0.0) / 0.025) * step(0.001, k) * (0.8 + 0.2 * sin(t * 2.88 + float(i)));
      fillSd(d - bud[i].z * k, PINK, 1.0);
    }
  }
  // the lines out of the point: one after another, quick, like the first notes of a score
  {
    vec2 o0 = vec2(-0.43, 0.035);
    vec2 E[10] = vec2[10](vec2(0.12, 0.52), vec2(0.20, 0.47), vec2(0.58, 0.19), vec2(0.62, 0.0), vec2(0.52, -0.22),
                          vec2(0.10, -0.27), vec2(-0.03, -0.40), vec2(-0.43, -0.52), vec2(-0.13, 0.52), vec2(0.40, 0.30));
    for (int i = 0; i < 10; i++){
      float k = ap(2.2 + float(i) * 0.272, 0.25);
      if (k <= 0.0) continue;
      float th = 0.03 * sin(t * 1.44 + float(i) * 1.3) * smoothstep(5.5, 6.5, t);
      vec2 Ei = o0 + mat2(cos(th), sin(th), -sin(th), cos(th)) * (E[i] - o0);
      vec2 e = mix(o0, Ei, k);
      float w = 0.0011 + 0.0006 * float(i % 3 == 0);
      fillA(smoothstep(w * 1.6, w * 0.5, sdSeg(p, o0, e) + rough() * 0.3) * (1.0 - uView.w), INK);
    }
    // two plumb lines
    fillA(smoothstep(0.0022, 0.0008, abs(p.x + 0.71)) * step(-0.33, p.y) * step(p.y, mix(-0.33, 0.52, ap(5.0, 0.6))) * (1.0 - uView.w), INK);
    fillA(smoothstep(0.0020, 0.0008, abs(p.x - 0.02)) * step(0.03, p.y) * step(p.y, mix(0.03, 0.40, ap(5.4, 0.5))), INK);
  }
  // ---- the pond underneath, fading into the canvas as the picture is made
  if (uBg > 0.0){ vec3 pond = texture(uPond, gl_FragCoord.xy / uRes).rgb; C = mix(C, pond, uBg * (1.0 - 0.0)); }
  // ---- the light: the point it all comes from
  float hr = length(p - uHero.xy) * uView.z;
  C += vec3(1.0, 0.85, 0.45) * uHero.z * (exp(-hr * hr / (uHero.w * uHero.w * 0.08)) * 1.2 + 0.28 * exp(-hr / (uHero.w * 2.2)));
  C *= 1.0 + 0.045 * wv * (1.0 - uBg);
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  C *= 1.0 - 0.12 * dot(uv, uv) * 1.6;
  C += (hash12(gl_FragCoord.xy + fract(t * 7.13) * 917.0) - 0.5) * 0.010;
  o = vec4(C * uFade, 1.0);
}`;
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const P0 = [-0.43, 0.035];                  // the point
const VEND = [-0.572, 0.331, 4.73];          // the eye at the end: the yellow disc where the cardboard moon's round will be
W.kand = {
  ready: false, t: 0, fade: 1, vol: 0, bg: 0, T: 11.0, pondTex: null, entry: [0.2, -0.1],
  init() {
    if (this.ready) return;
    this.p = YL.makeProgram('kand', VS, FS); YL.checkProgram(this.p);
    this.vao = YL.gl.createVertexArray();
    if (YL.QS.has('kt')) this.t = +YL.QS.get('kt');
    this.ready = true;
  },
  // the light comes in from where it was on the pond (screen units: x in screen heights from the centre)
  start(entry) { this.t = 0; this.entry = entry ? entry.slice() : [0.2, -0.1]; this.played = {}; },
  view(t) {
    // still for most of it; then in, onto the yellow in the blue circle, which a blue disc bites into a crescent
    const k = ease((t - 8.4) / 2.6);
    const kk = k * k;
    // (before that it drifts and leans in a little, never quite still)
    const dx = 0.035 * Math.sin(t * 0.33 + 0.4) - 0.02 * ease(t / 8.3), dy = 0.018 * Math.sin(t * 0.27 + 1.1), dz = 0.96 + 0.08 * ease(t / 8.3);
    const e = ease((t - 8.3) / 2.2);
    // and at the very end, on into the thick of the crescent until it is all yellow paint (the next world starts from its
    // own moon's yellow, close: paint becomes cardboard, not one moon over another)
    return { x: lerp(dx, VEND[0], e), y: lerp(dy, VEND[1], e), z: lerp(dz, VEND[2], kk), bite: ease((t - 9.0) / 1.6) };
  },
  update(dt) {
    this.t += dt;
    this.sound(dt);
  },
  heroAt(t) {
    const a = ease(t / 1.7);
    return [lerp(this.entry[0], P0[0], a) + 0.004 * Math.sin(t * 2.0), lerp(this.entry[1], P0[1], a) + 0.004 * Math.cos(t * 1.7)];
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p, t = this.t;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    const v = this.view(t), hp = this.heroAt(t);
    U(p, 'uRes', [w, h]); U(p, 'uTime', t); U(p, 'uFade', this.fade); U(p, 'uAspect', aspect);
    U(p, 'uBg', this.pondTex ? this.bg : 0); U(p, 'uView', [v.x, v.y, v.z, v.bite]);
    // the next world's moon: its outline, where it will be when that world begins
    const st = YL.worlds.stop, mt = YL.assetTex('stop_moon_sdf', false);
    U(p, 'uMoonR', st && st.moonRect ? st.moonRect(0) : [0, 0, 1, 1]); U(p, 'uMoonV', [VEND[0], VEND[1], VEND[2], mt ? ease((t - 9.7) / 1.1) : 0]);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mt || null); gl.uniform1i(p.u.uMoon, 2);
    U(p, 'uHero', [hp[0], hp[1], 1.0 + 0.08 * Math.sin(t * 2.88), 0.024]);
    if (this.pondTex) YL.bindTex(p, 'uPond', this.pondTex, 0); else { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null); gl.uniform1i(p.u.uPond, 0); }
    { const ct = YL.paperTex('paper_canvas'); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ct || null); gl.uniform1i(p.u.uCanvas, 1); }
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: each shape sounds as it appears, softly, under the music — Kandinsky heard colours: yellow high and
     bright, blue deep, red warm, black a muted knock */
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO && YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime, t = this.t;
    S.bus.gain.setTargetAtTime(this.vol * this.fade, now, 0.2);
    const cues = [[0.8, 392], [1.1, 440], [1.35, 523], [1.6, 587], [1.9, 659], [2.7, 196], [3.0, 330], [3.3, 784], [3.6, 147], [3.9, 262],
      [4.1, 880], [4.4, 523], [4.6, 988], [4.9, 220], [5.1, 175], [5.3, 262], [5.5, 659]];
    for (const [ct, f] of cues) if (t >= ct && !this.played[ct]) { this.played[ct] = 1; this.tone(now + 0.01, f, f > 600 ? 0.035 : 0.05); }
    for (let i = 0; i < 10; i++) { const ct = 2.2 + i * 0.272; if (t >= ct && !this.played['l' + i]) { this.played['l' + i] = 1; this.tone(now + 0.01, 1175 + i * 60, 0.018, 0.25); } }
  },
  buildAudio(b) {
    const { ctx, out } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const sr = ctx.sampleRate, n = Math.floor(sr * 2.5), ir = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.7)); }
    const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.4; wet.connect(conv); conv.connect(bus);
    this.snd = { ctx, bus, wet };
  },
  tone(when, f, gain, dur = 1.6) {
    const S = this.snd, ctx = S.ctx;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = 'sine'; o1.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(S.bus); g.connect(S.wet);
    o1.start(when); o2.start(when); o1.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  },
};
})();
