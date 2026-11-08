/* ============================================================================
   世界 · 孔特笔·雨夜（修拉那样的炭精笔素描）
   ----------------------------------------------------------------------------
   光从窗上那颗雨滴钻出来，落进窗外的街——这条街是用黑色孔特笔画在粗纹纸上的：没有一根轮廓线，
   只有炭粉挂在纸的颗粒上，越密越黑；亮的地方就是纸本身。
   · 镜头一直在走：沿着湿漉漉的街往下，一直走到河岸，从不停下。
   · 街上的人在走（一帧一帧画出来的走路：打伞的男人和孩子、拄手杖的绅士），一辆出租马车从近处跑过去：马在小跑，
     车轮在转，车灯亮着，湿石板路上倒映着它们。河岸上，撑阳伞的女人、坐着的男人；那只小狗看见光，跳起来追着它跑。
     一群鸽子从河岸上飞起来。河上一条驳船慢慢漂过石桥，舱里亮着灯，烟囱冒着烟。
   · 天气是活的：一阵一阵的风，雨跟着斜过来、一片一片扫过街面；路灯和车灯照亮的雨丝发白；石板路上溅起水花，
     水洼里一圈圈涟漪；屋顶的烟囱冒烟，被风吹斜；雾在河上流。
   · 这张画是活的：每秒八张，像一张一张重画出来的（纸的颗粒不动，炭的笔触在变）；画面右边，还没画完的地方，
     一笔一笔地画上去，先是淡淡的一层，再压深。
   · 光在这里就是纸的白：它到哪里，哪里的炭粉就退开。最后它越来越亮，把整张画擦成一张白纸——夏天从白里出来。
   画法：街和河是一张生成的长图；路灯、树、人、马车、驳船、鸽子都在一张图集里，会动的每样东西是一排帧（见
   assets/prompts/）。它们先合成一张「浓淡图」，然后统一用纸的纹理重新上「炭」——纸的颗粒固定在画面上不动，画在上面移动。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});
const NS = 18;                     // cut-outs drawn at most
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uBuild, uWhite, uFade, uAspect, uBoil, uGust, uDrawX;
uniform vec3 uCam;                 // where the eye is on the long drawing (u along it, v up it) and how close
uniform sampler2D uPano, uPaper, uAtlas;
uniform int uNS, uNS0, uNS1, uNS2;   // the cut-outs: [0, uNS0) scenery behind, [uNS0, uNS1) what moves, [uNS1, uNS2) scenery in front, then what moves in front of that
uniform vec4 uR[${NS}];            // each cut-out: x0, y0, w, h on the screen (screen-height units, origin at the centre)
uniform vec4 uA[${NS}];            // where its present frame is in the atlas: u0, v0, du, dv
uniform vec4 uM[${NS}];            // its sway (the top moves, the foot stays), how much paler (haze), how much there, how dark
uniform vec4 uX[${NS}];            // mirrored, its reflection in the wet ground (strength), its wheels' turn (the cab), -
uniform vec4 uWh[2];               // the cab's wheels: hub x, y (of the cut-out), radius (of its height), -
uniform vec4 uGlow[6];             // lights: x, y, how bright, how big (lifting the crayon round them, lighting the rain)
uniform vec4 uHero;                // the light: x, y, how bright, how big
uniform vec4 uWin;                 // the lit window x, y, brightness, a shadow crossing it (-1 … 1)
uniform vec4 uSmoke[5];            // chimneys (and the barge's stovepipe): x, y on the screen, size, how much
uniform float uLampY;              // the street under the gas lamp (its reflection hangs from there)
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }
float sat(float x){ return clamp(x, 0.0, 1.0); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
// a cut-out: how dark it is at p and how much of it is there; its reflection hangs below its foot in the wet ground
float cut(int i, vec2 p, out float a){
  a = 0.0;
  vec4 r = uR[i], m = uM[i], x = uX[i];
  if (m.z <= 0.0) return 0.0;
  vec2 q = (p - r.xy) / r.zw;
  float refl = 0.0;
  if (q.y < 0.0 && x.y > 0.0 && q.y > -0.7){
    refl = x.y * (1.0 + q.y / 0.7);
    q.x += 0.012 * sin(q.y * 70.0 + uTime * 3.0) + 0.006 * sin(q.y * 190.0 - uTime * 5.0);     // (broken by the rain on it)
    q.y = -q.y * 1.05;
  }
  q.x -= m.x * q.y * q.y;
  if (x.x > 0.5) q.x = 1.0 - q.x;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
  vec2 gr = uA[i].zw / (r.zw * uRes.y);                     // (its texels per pixel, worked out: no derivatives at its edge)
  vec4 c = textureGrad(uAtlas, uA[i].xy + q * uA[i].zw, vec2(gr.x, 0.0), vec2(0.0, gr.y));
  float d = pow(sat((1.0 - dot(c.rgb, vec3(0.333)) - 0.06) * 1.22), 1.0 / m.w);
  // the cab's wheels: twelve spokes turning round each hub
  if (x.z != 0.0){
    float asp = r.z / r.w;
    for (int k = 0; k < 2; k++){
      vec4 wh = uWh[k];
      vec2 dq = vec2((q.x - wh.x) * asp, q.y - wh.y) / wh.z;
      float rr = length(dq);
      if (rr < 0.9){
        float ang = atan(dq.y, dq.x) - x.z * (k == 0 ? 1.0 : 125.0 / 162.0);
        float spoke = smoothstep(0.11, 0.06, abs(sin(ang * 6.0)) * rr) * smoothstep(0.16, 0.24, rr) * smoothstep(0.90, 0.84, rr);
        float hub = smoothstep(0.20, 0.15, rr);
        d = max(d, max(spoke * 0.82, hub * 0.9));
        c.a = max(c.a, max(spoke, hub));
      }
    }
  }
  a = c.a * m.z * (refl > 0.0 ? refl : 1.0);
  return d * (1.0 - m.y) * (refl > 0.0 ? 0.75 : 1.0);
}
float drawnIn(float D, float first, float full){ return max(min(D, 0.42) * first + max(D - 0.42, 0.0) * full, min(D, 0.45) * 0.62); }
float smokeAt(vec2 p, vec4 s, float t){
  if (s.w <= 0.0) return 0.0;
  vec2 q = (p - s.xy) / s.z;
  if (q.y < 0.0 || q.y > 6.0 || abs(q.x) > 6.0) return 0.0;
  float lean = q.y * (0.55 + 0.6 * uGust) + 0.25 * sin(q.y * 1.3 - t * 1.4);
  float w = 0.20 + q.y * 0.32;
  float body = exp(-pow((q.x - lean) / w, 2.0)) * smoothstep(0.0, 0.3, q.y) * smoothstep(6.0, 1.5, q.y);
  return body * (0.35 + 0.65 * fbm(vec2(q.x * 1.6 - t * 0.3, q.y * 1.2 - t * 1.1))) * s.w;
}
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;           // the screen, in screen heights, origin at the centre
  float t = uTime;
  // ---- the hand that drew it: eight drawings a second, each a little different (the paper itself doesn't move)
  float bt = floor(uBoil);
  vec2 jit = (vec2(hash12(vec2(bt, 1.7)), hash12(vec2(bt, 8.3))) - 0.5) * 0.0011;
  vec2 pw = p + jit + 0.0007 * (vec2(vnoise(p * 9.0 + bt * 3.1), vnoise(p * 9.0 + 5.0 + bt * 3.1)) - 0.5);
  // ---- the long drawing: where on it this pixel looks, its reflections trembling below the horizon
  vec2 pu = vec2(uCam.x + pw.x / uCam.z, uCam.y + pw.y / uCam.z);
  float wet = smoothstep(0.47, 0.36, pu.y);
  vec2 wob = vec2(0.0018 * sin(pu.y * 820.0 + t * 2.3 + pu.x * 9.0) + 0.0009 * sin(pu.y * 1900.0 - t * 3.1), 0.0) * wet;
  float D = 1.0 - textureLod(uPano, vec2((pu.x + wob.x) / 3.0, pu.y), 1.1).r;
  // the river flows: long streaks of light on it drifting downstream
  float river = smoothstep(0.42, 0.36, pu.y) * smoothstep(1.25, 1.55, pu.x) * smoothstep(0.17, 0.25, pu.y);
  if (river > 0.0){
    float fl = vnoise(vec2((pu.x + t * 0.05) * 14.0, pu.y * 260.0)) * 0.6 + vnoise(vec2((pu.x + t * 0.08) * 40.0, pu.y * 700.0)) * 0.4;
    D *= 1.0 - 0.30 * river * smoothstep(0.62, 0.9, fl);
    D = max(D, D + 0.10 * river * smoothstep(0.35, 0.1, fl) * (1.0 - D));
  }
  // mist drifting low over the river and down the street, lifting the crayon off; a second bank nearer, quicker
  float mist = smoothstep(0.35, 0.8, fbm(vec2(pu.x * 2.4 - t * 0.07, pu.y * 9.0))) * exp(-pow((pu.y - 0.46) / 0.07, 2.0)) * smoothstep(0.9, 1.4, pu.x);
  vec2 pn = vec2(uCam.x * 1.35 + pw.x / uCam.z, pu.y);
  float mist2 = smoothstep(0.45, 0.85, fbm(vec2(pn.x * 1.6 - t * 0.12 + 7.0, pn.y * 5.0))) * exp(-pow((pn.y - 0.33) / 0.09, 2.0)) * smoothstep(1.3, 1.8, pn.x);
  D *= 1.0 - 0.45 * mist - 0.35 * mist2;
  // rings spreading in the puddles where the rain falls into them; crowns of spray where it hits the stones
  if (pu.y < 0.36){
    vec2 g = vec2(pu.x * 9.0, pu.y * 30.0), gi = floor(g), gf = fract(g) - 0.5;
    float h = hash12(gi), ph = fract(t * (0.55 + 0.5 * h) + h * 7.0);
    vec2 c = (vec2(hash12(gi + 3.1), hash12(gi + 5.7)) - 0.5) * 0.5;
    float r = length((gf - c) * vec2(1.0, 0.33)) - ph * 0.42;
    D *= 1.0 - 0.45 * step(0.55, h) * smoothstep(0.03, 0.0, abs(r)) * (1.0 - ph) * wet;
    vec2 g2 = vec2(pu.x * 60.0, pu.y * 160.0), g2i = floor(g2), g2f = fract(g2) - 0.5;
    float h2 = hash12(g2i + 9.0), ph2 = fract(t * (1.3 + h2) + h2 * 13.0);
    float crown = smoothstep(0.22, 0.0, abs(length(g2f * vec2(1.0, 0.6)) - ph2 * 0.45)) * step(0.80, h2) * smoothstep(0.35, 0.0, ph2);
    D *= 1.0 - 0.75 * crown * wet * (0.6 + 0.8 * uGust);
  }
  // smoke from the chimneys, blown over by the wind
  for (int k = 0; k < 5; k++) D = max(D, D + 0.42 * smokeAt(p, uSmoke[k], t + float(k) * 3.0) * (1.0 - D));
  // ---- the cut-outs, back to front
  for (int i = 0; i < ${NS}; i++){
    if (i >= uNS0) break;
    float a, d = cut(i, pw, a);
    D = mix(D, d, a);
  }
  // ---- being drawn: on the right, where the eye hasn't been yet, there is only a pale lay-in; the drawing goes down over it
  // in strokes — a first layer just ahead, then pressed darker; behind it the drawing is whole
  float first = 1.0, full = 1.0;
  {
    float dx = p.x - uDrawX;
    if (dx > -0.30){
      first = 0.0; full = 0.0;
      for (int L = 0; L < 2; L++){
        float fl = float(L), cs = 26.0 + fl * 9.0;
        vec2 q = vec2(pu.x * cs, pu.y * cs) + fl * vec2(0.37, 0.61), qi = floor(q);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
          vec2 c = qi + vec2(float(i), float(j));
          float h1 = hash12(c + fl * 13.1 + 2.0), h2 = hash12(c + 4.3 + fl * 7.7), h3 = hash12(c + 9.1 + fl * 3.3);
          vec2 ctr = (c + vec2(h1, h2) - fl * vec2(0.37, 0.61)) / cs;
          float sx = (ctr.x - uCam.x) * uCam.z;                       // (the stroke's place on the screen)
          float ang = 1.05 + 0.35 * (h1 - 0.5);
          vec2 dir = vec2(cos(ang), sin(ang)), d = pu - ctr;
          float al = dot(d, dir) * cs, ac = dot(d, vec2(-dir.y, dir.x)) * cs;
          float len = 0.85 + 0.5 * h2, wd = 0.26 + 0.12 * h3;
          // it goes down along its length, from one end to the other, as the front reaches it
          float k1 = (uDrawX + 0.10 - sx) / 0.10 + 0.6 * (h3 - 0.5), k2 = (uDrawX - 0.12 - sx) / 0.12 + 0.6 * (h1 - 0.5);
          float cap = smoothstep(wd, wd * 0.5, abs(ac) + max(abs(al) - len, 0.0));
          first = max(first, cap * smoothstep(0.0, 0.1, k1 * (2.0 * len) - (al + len)));
          full = max(full, cap * smoothstep(0.0, 0.1, k2 * (2.0 * len) - (al + len)));
        }
      }
      float behind = smoothstep(-0.05, -0.28, dx);
      first = max(first, behind); full = max(full, behind);
    }
  }
  D = drawnIn(D, first, full);
  // ---- what moves through it (people, the cab, the birds, the dog running) is drawn whole, back to front; what stands in
  // front of it all (the near tree) is drawn in with the rest
  for (int i = 0; i < ${NS}; i++){
    if (i >= uNS) break;
    if (i < uNS0) continue;
    float a, d = cut(i, pw, a);
    if (i >= uNS1 && i < uNS2) d = drawnIn(d, first, full);
    D = mix(D, d, a);
  }
  // ---- light is paper: round each light the crayon is lifted off, and the street under it shines
  for (int k = 0; k < 6; k++){
    vec4 g = uGlow[k];
    if (g.z <= 0.0) continue;
    vec2 d = p - g.xy; float r = length(d * vec2(1.0, 0.85));
    D *= 1.0 - g.z * (0.85 * exp(-r / (0.022 * g.w)) + 0.42 * exp(-r / (0.085 * g.w)));
  }
  {
    vec4 g = uGlow[0];                                     // (the gas lamp's long reflection down the wet street)
    vec2 dr = vec2(p.x - g.x, max(0.0, uLampY - p.y));
    D *= 1.0 - g.z * 0.35 * exp(-abs(dr.x) / (0.012 + dr.y * 0.05)) * exp(-dr.y / 0.25) * step(p.y, uLampY) * (0.75 + 0.25 * sin(p.y * 260.0 + t * 3.0));
    vec2 dw = p - uWin.xy; float rw = length(dw);
    float shadow = 1.0 - 0.75 * exp(-pow((dw.x - uWin.w * 0.03) / 0.008, 2.0)) * step(abs(dw.y), 0.03);
    D *= 1.0 - uWin.z * (0.5 * exp(-rw / 0.04) * shadow);
  }
  float hr = length(p - uHero.xy);
  D *= 1.0 - uHero.z * (0.95 * exp(-hr / (uHero.w * 0.55)) + 0.55 * exp(-hr / (uHero.w * 2.2)));
  // ---- rain: fine slanting lines, three depths; it comes in sheets with the gusts; where a light is, the rain shines
  float lit = exp(-hr / 0.16) * uHero.z;
  for (int k = 0; k < 6; k++){ vec4 g = uGlow[k]; if (g.z > 0.0) lit += g.z * exp(-length(p - g.xy) / (0.13 * g.w)); }
  float sheet = 0.55 + 0.75 * smoothstep(0.35, 0.8, fbm(vec2(p.x * 1.3 + p.y * 0.4 - t * (0.9 + 1.2 * uGust), t * 0.15)));
  float slant = 0.16 + 0.30 * uGust;
  for (int k = 0; k < 3; k++){
    float fk = float(k), sc = 1.0 + fk * 0.75;
    vec2 r = vec2(p.x + p.y * slant * (1.0 - 0.2 * fk), p.y) * vec2(85.0 / sc, 3.2 / sc) + vec2(fk * 17.0 + uCam.x * 85.0 / sc * (0.6 + 0.3 * fk), t * (6.0 - fk * 1.6) * (1.0 + 0.3 * uGust));
    vec2 ri = floor(r); float h = hash12(ri + fk * 31.0);
    float line = smoothstep(0.10, 0.0, abs(fract(r.x) - 0.5)) * step(0.84 - 0.06 * sheet, h) * smoothstep(0.0, 0.2, fract(r.y + h * 5.0)) * smoothstep(0.75, 0.45, fract(r.y + h * 5.0));
    line *= (0.42 - fk * 0.11) * sheet;
    // white (lifted) where the drawing is dark or a light is on it; a grey crayon line on the pale sky and water
    float lift = sat(smoothstep(0.30, 0.55, D) + lit * 1.5);
    D *= 1.0 - line * lift * (1.0 + 0.8 * sat(lit));
    D += line * (1.0 - lift) * 0.30 * (1.0 - D);
  }
  // ---- coming in: the drawing is laid down patch by patch; going out: the light rubs the whole page back to white
  float n = fbm(p * 3.5 + 2.0) * 0.7 + 0.3 * hash12(floor(gl_FragCoord.xy / 2.0));
  D *= smoothstep(n - 0.08, n + 0.08, uBuild * 1.25 - 0.1);
  if (uWhite > 0.0){
    float R = pow(uWhite, 1.4) * 1.35, er = 0.0;
    for (int L = 0; L < 2; L++){
      float fl = float(L), cs = 7.0 + fl * 1.7;
      vec2 q = p * cs + fl * vec2(0.37, 0.61), qi = floor(q);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
        vec2 c = qi + vec2(float(i), float(j));
        float h1 = hash12(c + fl * 13.1), h2 = hash12(c + 4.3 + fl * 7.7), h3 = hash12(c + 9.1 + fl * 3.3);
        vec2 ctr = (c + vec2(h1, h2) - fl * vec2(0.37, 0.61)) / cs;
        float on = smoothstep(0.0, 0.07, R - length(ctr - uHero.xy) - 0.10 * h3);
        if (on <= 0.0) continue;
        float ang = 0.35 + 0.9 * (h1 - 0.5);
        vec2 dir = vec2(cos(ang), sin(ang)), d = p - ctr;
        float al = dot(d, dir), ac = dot(d, vec2(-dir.y, dir.x));
        float len = 0.045 + 0.035 * h2, wd = 0.016 + 0.012 * h3;
        float cap = smoothstep(wd, wd * 0.55, abs(ac) + max(abs(al) - len, 0.0));
        float st = 0.55 + 0.45 * smoothstep(0.3, 0.7, vnoise(vec2(al * 40.0, ac * 520.0) + c * 3.1));
        er = 1.0 - (1.0 - er) * (1.0 - cap * on * st * (0.65 + 0.3 * h1));
      }
    }
    D *= 1.0 - er;
    D *= 1.0 - smoothstep(R - 0.08, R - 0.38, hr + 0.06 * (fbm(p * 5.0 + 5.0) - 0.5));
  }
  // ---- the crayon on the paper: the paper's grain stays where it is on the screen, the drawing moves over it; the crayon's
  // own specks change with each drawing
  vec2 pp = gl_FragCoord.xy / 1024.0;
  float pl = texture(uPaper, pp * 1.15).r, pb = textureLod(uPaper, pp * 1.15, 4.5).r;
  vec2 bo = vec2(hash12(vec2(bt, 3.3)), hash12(vec2(bt, 6.1))) * 97.0;
  float tooth = (pl - pb) * 4.2 + (vnoise(gl_FragCoord.xy * 0.75 + bo) - 0.5) * 0.55 + (vnoise(gl_FragCoord.xy * 0.21 + 9.0 + bo * 0.3) - 0.5) * 0.30 + (vnoise(gl_FragCoord.xy * vec2(0.9, 0.35) + 3.0 + bo) - 0.5) * 0.2;
  float mid = 1.0 - abs(D - 0.5) * 1.6;
  float ink = sat(D * 1.06 + tooth * 0.42 * max(mid, 0.15));
  ink = mix(ink, smoothstep(0.25, 0.75, ink), 0.25);
  vec3 paper = vec3(0.958, 0.944, 0.918) * (0.97 + 0.06 * (pl - 0.5) * 2.0);
  vec3 crayon = vec3(0.105, 0.098, 0.095);
  vec3 c = mix(paper, crayon, ink * 0.95);
  // the light itself: a pale warm core, the only warm thing on the page
  float core = exp(-hr * hr / (uHero.w * uHero.w * 0.06));
  c = mix(c, vec3(1.0, 0.95, 0.82), sat(core * uHero.z));
  c += vec3(0.10, 0.07, 0.02) * uHero.z * exp(-hr / (uHero.w * 1.5));
  // the sheet's edges a little darker, as a drawing under a lamp
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.10 * dot(uv, uv) * 1.6 * (1.0 - uWhite);
  c = mix(c, vec3(1.0, 0.99, 0.96), smoothstep(0.82, 1.0, uWhite));          // (the white the summer comes out of)
  c += (hash12(gl_FragCoord.xy + fract(t * 7.13) * 917.0) - 0.5) * 0.010;
  o = vec4(c * uFade, 1.0);
}`;
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// the wind: gusts coming and going (0 … 1)
const gust = (t) => clamp(0.35 + 0.35 * Math.sin(t * 0.83 + 0.6) + 0.25 * Math.sin(t * 1.91 + 2.0) + 0.15 * Math.sin(t * 3.7), 0, 1);
/* ---- the cut-outs. Each: its picture in the atlas; where its foot is on the drawing (u, v, as seen with the eye at uRef);
   its height on the screen; how much nearer than the drawing it is (kd: it slides kd times as fast); haze; how it moves.
   Walkers walk: their u goes on at their pace, and their frame follows the distance gone (so their feet don't slide). */
const ACT = [
  // the far end of the street: a gentleman with a cane, head down, walking away to the left
  { k: 'gent', u: 0.98, v: 0.255, h: 0.150, kd: 0.92, uRef: 1.0, haze: 0.30, vel: -0.070, stride: 0.125, to: 8.0, refl: 0.35 },
  // the gas lamp
  { k: 'lamp', u: 0.60, v: 0.040, h: 0.86, kd: 1.40, uRef: 0.95, haze: 0.0 },
  // the man and the child under their umbrellas, walking down the street the way the eye goes
  { k: 'walk_child', u: 1.15, v: 0.085, h: 0.235, kd: 1.12, uRef: 1.0, haze: 0.05, vel: -0.20, stride: 0.21, refl: 0.45, ph: 0.4, flip: true, to: 8.0 },
  { k: 'walk_man', u: 1.235, v: 0.075, h: 0.325, kd: 1.15, uRef: 1.0, haze: 0.03, vel: -0.20, stride: 0.29, refl: 0.45, flip: true, to: 8.0 },
  // the riverbank: the woman with the parasol, the man sitting, his dog (it jumps up and runs after the light)
  { k: 'woman', u: 1.66, v: 0.030, h: 0.44, kd: 1.30, uRef: 2.05, haze: 0.05, sway: 0.02 },
  { k: 'man', u: 1.93, v: 0.030, h: 0.22, kd: 1.30, uRef: 2.05, haze: 0.08 },
  { k: 'dogsit', u: 2.17, v: 0.035, h: 0.10, kd: 1.30, uRef: 2.05, haze: 0.10, to: 6.75 },
  { k: 'dog', u: 2.17, v: 0.035, h: 0.112, kd: 1.30, uRef: 2.05, haze: 0.10, vel: 0.30, stride: 0.13, from: 6.75, to: 13, accel: 0.6 },
  // the near tree over the bank
  { k: 'tree', u: 1.33, v: -0.10, h: 0.82, kd: 3.00, uRef: 1.45, haze: 0.06, tree: true },
];
const T_CAB = 3.3;                 // when the cab comes in from the left (the eye's clock)
W.conte = {
  ready: false, t: 0, fade: 1, vol: 0, white: 0, T: 12.5,
  hero: { p: [0, 0], on: true, glow: 1 },
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.p = YL.makeProgram('conte', VS, FS); YL.checkProgram(this.p);
    this.vao = gl.createVertexArray();
    if (!this.started) this.start([0.1, 0.1]);
    if (YL.QS.has('ct')) this.t = +YL.QS.get('ct');
    this.ready = true;
  },
  // the light comes in where the drop opened (ndc)
  start(ndc) { this.t = 0; this.white = 0; this.started = true; this.entry = ndc ? ndc.slice() : [0.1, 0.1]; this.hero.on = true; this.ev = {}; },
  // the eye: along the street and down to the river at a walking pace, never stopping, leaning down to the water, closing in
  cam(t) {
    const s = (x) => x < 0 ? 0 : x < 2.2 ? x * x / 4.4 : x - 1.1;          // (gets going over two seconds, then keeps going)
    const u = 0.93 + 0.135 * s(t - 0.6);
    return { u, v: lerp(0.50, 0.455, ease((t - 3.0) / 6.5)), z: lerp(1.0, 1.10, ease((t - 2.0) / 9.0)) };
  },
  // the light's place on the screen: out of the drop, then along with the eye, low over the water at the end
  heroAt(t, aspect) {
    const e = [this.entry[0] * aspect * 0.5, this.entry[1] * 0.5];
    const a = ease((t - 0.2) / 2.2), b = ease((t - 6.0) / 4.0);
    const mid = [0.10 + 0.07 * Math.sin(t * 0.7), 0.05 + 0.04 * Math.sin(t * 1.1 + 1.0)];
    const end = [0.14 + 0.03 * Math.sin(t * 0.9), -0.13 + 0.015 * Math.sin(t * 1.4)];
    const m = [lerp(mid[0], end[0], b), lerp(mid[1], end[1], b)];
    return [lerp(e[0], m[0], a), lerp(e[1], m[1], a)];
  },
  ndcOfHero(aspect) { const p = this.hero.p; return [p[0] / (aspect * 0.5), p[1] / 0.5]; },
  update(dt) {
    this.t += dt;
    this.white = ease((this.t - (this.T - 2.6)) / 2.3);
    const aspect = YL.canvasAspect ? YL.canvasAspect() : 16 / 9;
    this.hero.p = this.heroAt(this.t, aspect);
    this.sound(dt);
  },
  // where a thing standing on the drawing at (u, v), kd times nearer, is on the screen, and how tall h is there
  place(c, u, v, h, kd, uRef) {
    const x = ((u - uRef) + (uRef - c.u) * kd) * c.z, y = (v - c.v) * c.z;
    return { x, y, H: h * c.z * (1 + (kd - 1) * (c.z - 1) * 2.0) };
  },
  frame(k, i) {
    const A = YL.CONTE_ATLAS[k], at = A.at[i % A.n], aw = this.aw, ah = this.ah;
    return [at[0] / aw, 1 - (at[1] + A.h) / ah, A.w / aw, A.h / ah];
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p, t = this.t;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    const c = this.cam(t);
    const pano = YL.assetTex('conte_pano'), paper = YL.assetTex('conte_paper'), atlas = YL.assetTex('conte_atlas');
    if (paper && !paper.rep) { gl.bindTexture(gl.TEXTURE_2D, paper); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); paper.rep = true; }
    const AT = YL.CONTE_ATLAS, sz = YL.ASSET_SIZE && YL.ASSET_SIZE.conte_atlas;
    this.ev = this.ev || {};
    const R = [], A = [], M = [], X = [], glow = [];
    const boil = Math.floor(t * 8);                                  // (eight drawings a second)
    const add = (k, x, y, H, fr, mods, ext) => {
      const S = AT[k]; if (!S) return;
      const Wd = H * S.w / S.h;
      R.push([x - S.anchor[0] * Wd, y - S.anchor[1] * H, Wd, H]); A.push(this.frame(k, fr)); M.push(mods); X.push(ext || [0, 0, 0, 0]);
    };
    if (AT && sz) {
      this.aw = sz[0]; this.ah = sz[1];
      const items = [];
      for (const a of ACT) {
        if (a.from !== undefined && t < a.from) continue;
        if (a.to !== undefined && t >= a.to) continue;
        let u = a.u, fr = 0;
        if (a.vel) {
          const s0 = a.accel ? a.from : 0, dtw = t - s0;
          const dist = a.accel ? a.vel * (dtw - a.accel * (1 - Math.exp(-dtw / a.accel))) : a.vel * dtw;   // (the dog takes a moment to get going)
          u = a.u + dist;
          fr = Math.floor(Math.abs(dist) / a.stride * 6 + (a.ph || 0) * 6);
          fr = Math.floor(fr / 1) % 6;
        }
        const P = this.place(c, u, a.v, a.h, a.kd, a.uRef);
        let sway = a.sway ? a.sway * Math.sin(t * 0.9) : 0, bob = 0;
        if (a.tree) sway = 0.020 * Math.sin(t * 0.8) + 0.012 * Math.sin(t * 2.1) + 0.035 * gust(t);
        if (a.k === 'woman') sway += 0.015 * gust(t);
        if (a.k === 'man') bob = 0.003 * Math.sin(t * 1.3);
        items.push({ kd: a.kd, act: !!a.vel, f: () => add(a.k, P.x, P.y + bob, P.H, fr, [sway, a.haze, 1, a.k === 'dog' || a.k === 'dogsit' ? 1.05 : 1], [a.flip ? 1 : 0, a.refl || 0, 0, 0]) });
      }
      // ---- the cab: up from behind on the left, near, overtaking the eye at a trot; its wheels turn, its lamps are lit
      const tc = t - T_CAB;
      if (tc > 0 && tc < 6.5) {
        const vel = 1.30, kd = 3.2, c0 = this.cam(T_CAB), uRef = c0.u, H0 = 0.58;          // (nearer than the tree: it sweeps past)
        const cabW0 = H0 * AT.cab.w / AT.cab.h, horseW0 = H0 * 0.66 * AT.horse.w / AT.horse.h;
        const u0 = uRef + (-aspect * 0.5 - 0.04 - cabW0 * 0.5 - horseW0 * 0.80) / c0.z;   // (the horse's nose just off the left edge)
        const dist = vel * tc;
        const P = this.place(c, u0 + dist, 0.012, H0, kd, uRef);
        const cabW = P.H * AT.cab.w / AT.cab.h, Hh = P.H * 0.66, horseW = Hh * AT.horse.w / AT.horse.h;
        const trot = Math.floor(tc * 1.7 * 6) % 6;
        const turn = dist * c.z / (P.H * AT.cab.wheels[0][2]);
        items.push({ kd, act: true, f: () => {
          add('horse', P.x + cabW * 0.5 + horseW * 0.30, P.y + 0.004 * Math.abs(Math.sin(tc * Math.PI * 1.7)), Hh, trot, [0, 0.0, 1, 1.9], [1, 0.5, 0, 0]);
          add('cab', P.x, P.y + 0.003 * Math.sin(tc * 9.0), P.H, 0, [0, 0.0, 1, 1.0], [1, 0.5, turn, 0]);
        } });
        // its two lamps (they light the rain round them)
        const lx = (fx, fy) => [P.x + cabW * 0.5 - cabW * fx, P.y + P.H * fy];
        glow.push([...lx(0.502, 1 - 118 / 640), 0.55, 1.1], [...lx(0.853, 1 - 118 / 640), 0.45, 1.0]);
        this.cabX = P.x;
      } else this.cabX = undefined;
      // ---- the barge on the river, going slowly downstream under the bridge; its lantern, its lit window, its smoke
      const bu = 2.62 - 0.035 * t, bP = this.place(c, bu, 0.345, 0.105, 0.88, 2.0);
      const bW = bP.H * AT.barge.w / AT.barge.h;
      items.push({ kd: 0.88, f: () => add('barge', bP.x, bP.y, bP.H, 0, [0, 0.22, 1, 0.95], [0, 0.4, 0, 0]) });
      glow.push([bP.x - bW * 0.5 + bW * 0.11, bP.y + bP.H * 0.66, 0.35, 0.55]);
      this.bargeSmoke = [bP.x - bW * 0.5 + bW * 0.635, bP.y + bP.H * 1.0, 0.018, 0.9];
      // ---- the pigeons: startled up off the bank as the light goes by, wheeling off over the water
      const tb = t - 5.6;
      if (tb > 0 && tb < 7) {
        for (let i = 0; i < 7; i++) {
          const ph = i * 0.37, sp = 0.85 + 0.25 * Math.sin(i * 2.1);
          const x0 = -0.35 + 0.09 * i - 0.04 * (i % 3), y0 = -0.32 + 0.03 * (i % 2);
          const k = Math.max(0, tb - 0.12 * i);
          const x = x0 + (0.30 * k + 0.05 * k * k) * sp, y = y0 + 0.30 * k * sp - 0.025 * k * k + 0.02 * Math.sin(k * 2 + i);
          const H = (0.045 + 0.012 * (i % 3)) * (1 + 0.25 * k);
          const fr = Math.floor((k * 9 + ph * 6)) % 6;
          items.push({ kd: 1.3 + 0.05 * i, act: true, f: () => add('birds', x, y, H, fr, [0, 0.0, Math.min(1, k * 4 + 0.2), 0.85], [0, 0, 0, 0]) });
        }
        if (!this.ev.birds) { this.ev.birds = true; this.flutter(); }
      }
      if (t > 6.75 && !this.ev.dog) { this.ev.dog = true; this.bark(0.0); this.bark(0.45); }
      const by = (f) => items.filter(f).sort((a, b) => a.kd - b.kd);
      for (const it of by(i => !i.act && i.kd < 2.5)) it.f();
      this.nScen = R.length;
      for (const it of by(i => i.act && i.kd < 3.0)) it.f();
      this.nActs = R.length;
      for (const it of by(i => !i.act && i.kd >= 2.5)) it.f();
      this.nFront = R.length;
      for (const it of by(i => i.act && i.kd >= 3.0)) it.f();
    }
    const n = Math.min(NS, R.length);
    const pack = (L, w4) => { const f = new Float32Array(NS * 4); for (let i = 0; i < n; i++) f.set(L[i], i * 4); return f; };
    // the gas lamp's head (near the top of its cut-out)
    const li = ACT.findIndex(a => a.k === 'lamp');
    const lampA = ACT[li], lP = this.place(c, lampA.u, lampA.v, lampA.h, lampA.kd, lampA.uRef);
    const lampOn = 1 - this.white;
    glow.unshift([lP.x + 0.0, lP.y + lP.H * 0.93, lampOn * (0.9 + 0.05 * Math.sin(t * 9.0) * Math.sin(t * 3.3)), 1.0]);
    while (glow.length < 6) glow.push([0, 0, 0, 1]);
    const G = new Float32Array(24); glow.slice(0, 6).forEach((g, i) => G.set([g[0], g[1], g[2] * (i === 0 ? 1 : lampOn), g[3]], i * 4));
    const wx = (0.29 - c.u) * c.z, wy = (0.67 - c.v) * c.z;
    U(p, 'uWin', [wx, wy, lampOn, Math.max(-1, Math.min(1, (t - 5.0) / 1.6))]); U(p, 'uLampY', lP.y);
    // the chimneys (on the drawing) and the barge's stovepipe
    const sm = new Float32Array(20);
    [[0.40, 0.905], [0.645, 0.775], [0.81, 0.69]].forEach(([u, v], i) => sm.set([(u - c.u) * c.z, (v - c.v) * c.z, 0.020 * c.z, 0.8], i * 4));
    if (this.bargeSmoke) sm.set(this.bargeSmoke, 12);
    U(p, 'uRes', [w, h]); U(p, 'uTime', t); U(p, 'uAspect', aspect); U(p, 'uFade', this.fade);
    U(p, 'uCam', [c.u, c.v, c.z]); U(p, 'uBoil', t * 8); U(p, 'uGust', gust(t));
    // the front of the drawing: a third of the way in from the right edge, going out to the edge as the eye slows
    U(p, 'uDrawX', aspect * 0.5 * lerp(0.62, 1.30, ease((t - 6.0) / 3.0)));
    U(p, 'uBuild', ease(t / 1.8)); U(p, 'uWhite', this.white);
    U(p, 'uHero', [this.hero.p[0], this.hero.p[1], this.hero.on ? this.hero.glow * (1.15 + 0.08 * Math.sin(t * 2.3)) : 0, 0.028 + 0.06 * this.white]);
    gl.uniform1i(p.u.uNS, n); gl.uniform1i(p.u.uNS0, Math.min(n, this.nScen || 0)); gl.uniform1i(p.u.uNS1, Math.min(n, this.nActs || 0)); gl.uniform1i(p.u.uNS2, Math.min(n, this.nFront || 0));
    gl.uniform4fv(p.u.uR, pack(R)); gl.uniform4fv(p.u.uA, pack(A)); gl.uniform4fv(p.u.uM, pack(M)); gl.uniform4fv(p.u.uX, pack(X));
    const wh = AT && AT.cab ? AT.cab.wheels : [[0, 0, 0.1], [0, 0, 0.1]];
    gl.uniform4fv(p.u.uWh, new Float32Array([wh[0][0], wh[0][1], wh[0][2], 0, wh[1][0], wh[1][1], wh[1][2], 0]));
    gl.uniform4fv(p.u.uGlow, G); gl.uniform4fv(p.u.uSmoke, sm);
    const bind = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex || null); gl.uniform1i(p.u[name], unit); };
    bind('uPano', pano, 0); bind('uPaper', paper, 1); bind('uAtlas', atlas, 2);
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    void boil;
  },
  /* ---- sound: the rain on the street (the room's rain, heard from outside now), coming in gusts; the river lapping against
     the quay; the cab going by (hooves on the stones, the wheels' rumble, panned with it); the dog's bark; the pigeons'
     wings; the crayon on the paper as the drawing is laid down and rubbed out */
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO && YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime, t = this.t;
    S.bus.gain.setTargetAtTime(this.vol * this.fade, now, 0.3);
    S.lap.gain.setTargetAtTime(0.18 * ease((t - 4) / 4), now, 0.5);
    S.rg.gain.setTargetAtTime(0.11 + 0.10 * gust(t), now, 0.25);
    S.hp.frequency.setTargetAtTime(1200 + 900 * gust(t), now, 0.3);
    // the cab: hooves (a trot: two beats close together, twice a stride) and the iron tyres rumbling, panned with it
    const tc = t - T_CAB;
    const near = this.cabX === undefined ? 0 : Math.exp(-Math.abs(this.cabX) / 0.9);
    S.rum.gain.setTargetAtTime(0.10 * near, now, 0.15);
    if (S.pan) S.pan.pan.setTargetAtTime(this.cabX === undefined ? 0 : clamp(this.cabX / 1.0, -1, 1), now, 0.1);
    if (tc > 0 && tc < 6 && (S.nextHoof -= dt) <= 0) { this.hoof(now + 0.01, 0.6 + 0.4 * near); S.hoofK = (S.hoofK || 0) + 1; S.nextHoof = S.hoofK % 2 ? 0.11 : 0.20; }
    // a scratch of crayon now and then while it is being drawn, an eraser's rub as it goes white
    const drawing = t < 2.0 ? 1 : this.white > 0 ? 0.8 : t < 9 ? 0.35 : 0;
    if ((S.next -= dt) <= 0 && drawing > 0) { this.scratch(now + 0.02, drawing); S.next = 0.08 + Math.random() * 0.18; }
  },
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const rain = noiseBuffer(6.1, 'pink');
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const rg = ctx.createGain(); rg.gain.value = 0.16;
    loop(rain, 1.0, hp); hp.connect(rg); rg.connect(bus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const lap = ctx.createGain(); lap.gain.value = 0;
    loop(noiseBuffer(4.3, 'brown'), 1.0, lp); lp.connect(lap); lap.connect(bus);
    // the cab's place in the stereo field; its wheels' low rumble
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.connect(bus);
    const cabOut = pan || bus;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 180; rlp.Q.value = 0.9;
    const rum = ctx.createGain(); rum.gain.value = 0;
    loop(noiseBuffer(3.7, 'brown'), 1.0, rlp); rlp.connect(rum); rum.connect(cabOut);
    this.snd = { ctx, bus, lap, rg, hp, rum, pan, cabOut, next: 0, nextHoof: 0 };
  },
  hoof(when, k) {
    const S = this.snd, ctx = S.ctx, sr = ctx.sampleRate, n = Math.floor(sr * 0.07);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const e = Math.exp(-i / (sr * 0.012)); d[i] = ((Math.random() * 2 - 1) * 0.6 + Math.sin(i / sr * 2 * Math.PI * 320) * 0.8) * e; }
    const s = ctx.createBufferSource(); s.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700 + 300 * Math.random(); bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0.22 * k;
    s.connect(bp); bp.connect(g); g.connect(S.cabOut); s.start(when);
  },
  bark(delay) {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, when = ctx.currentTime + 0.02 + delay;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, when); o.frequency.exponentialRampToValueAtTime(330, when + 0.12);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.10, when + 0.01); g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    o.connect(f); f.connect(g); g.connect(S.bus); o.start(when); o.stop(when + 0.2);
  },
  flutter() {
    if (!this.snd) return;
    const S = this.snd, ctx = S.ctx, sr = ctx.sampleRate, n = Math.floor(sr * 1.6);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const tt = i / sr, beat = Math.pow(Math.max(0, Math.sin(tt * 2 * Math.PI * 11)), 3); d[i] = (Math.random() * 2 - 1) * beat * Math.exp(-tt / 0.6); }
    const s = ctx.createBufferSource(); s.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.12;
    s.connect(bp); bp.connect(g); g.connect(S.bus); s.start(ctx.currentTime + 0.02);
  },
  scratch(when, k) {
    const S = this.snd, ctx = S.ctx, sr = ctx.sampleRate, n = Math.floor(sr * (0.05 + 0.08 * Math.random()));
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const e = Math.sin(Math.PI * i / n); d[i] = (Math.random() * 2 - 1) * e * (0.5 + 0.5 * Math.sin(i * 0.02)); }
    const s = ctx.createBufferSource(); s.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + 1800 * Math.random(); bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.05 * k;
    s.connect(bp); bp.connect(g); g.connect(S.bus); s.start(when);
  },
};
})();
