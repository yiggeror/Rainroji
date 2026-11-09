/* ============================================================================
   世界 · 定格动画·纸船远航（桌上搭的一台小布景）
   ----------------------------------------------------------------------------
   康定斯基那张画里的蓝圆和黄月，变成了真东西：刷着蓝颜料的卡纸天幕，一弯瓦楞纸剪的月亮挂在线上。
   镜头往后退，一只纸船从左边驶进来：船上坐着毛毡做的小孩，两手捧着那粒光。
   玻璃纸的浪是三条长带，像戏台上的浪机一样一圈圈地转过去（越近越快），每条带子又被下面的凸轮顶起、落下，
   船骑在中间那条带子的浪上——浪头从船头底下过去，船头先翘起，再扎下去，船头溅起一团棉花做的浪花。
   孩子是一个拆开的定格木偶：身体、两条胳膊（上臂、小臂）、四种可替换的手（捧、张开、攥拳、托）、八个可替换的头
   （平静、眨眼、笑、大笑、惊奇、被浪溅得皱脸、低头看光、仰头笑），围巾的结和一条在风里翻飞的长围巾。
   每一格都摆一点：关节被弹簧拉向表演给的位置（到了略微过头再回来），身子被船的俯仰和起落甩动，手按位置反解出
   肘和肩；一路上的动作不重复——护着光看浪来、抓紧船沿、被浪花打得皱脸、甩头、大笑、把光托向前方指路、
   回头看追上来的海鸥、把光举给它、第二个大浪来时弓身护住光、低头看手心里的光、跪起来把光高高举起、
   光离开手、挥手送它。挂在线上的海鸥一只远远飞过，一只跟上来，在光的上面盘旋。
   光照着这片小海：浪上有一条它的碎金倒影，玻璃纸的折痕跟着它闪；浪花、海鸥、帆，离它近的都被照暖。
   最后孩子把光高高举起，光离开他的手，朝镜头飘过来，越来越亮，白——回到雨夜的房间。
   画法：天幕、月亮、云、三条浪、空船、木偶的零件和替换的头与手、浪花六格、海鸥四格都是生成的图（见 assets/prompts/）；
   · 布景的大动作（浪机、涌浪、船随浪起伏、海鸥飞）每秒 24 格，平滑；木偶的姿势、旗子和围巾、海鸥扇翅、手摆的微抖每秒 12 格；
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
uniform sampler2D uSky, uMoon, uCl0, uCl1, uCl2, uW0, uW1, uW2, uAt, uBB, uBF, uRig;
uniform vec4 uSky4;                 // the sky card on the screen: x0, y0, w, h
// the things hanging still (moon, three clouds): pivot on the screen (x, y), size (w, h) | pivot in the picture (u, v), turn, lod | on, -, warm, -
uniform vec4 uA[4], uB[4], uC[4];
// the three wave strips: foot of set x 0 on the screen (x, y), scale, the water's flow (set units) | height, tile length (set units), swell gain, swell phase | lod, glints, warm, -
uniform vec4 uL[3], uM[3], uN[3];
uniform vec4 uSw;                   // the swell: amplitude, its phase, time (stepped), wave number
// the puppets out of the atlas (boat, splash, far gull, near gull): pivot on the screen, size | pivot in the frame, turn, lod | frame in the atlas (x0, y0, w, h) | on, mirrored, warm, -
uniform vec4 uP[4], uQ[4], uR[4], uS[4];
uniform vec4 uHero;                 // the light: x, y, brightness, size
// the boat, empty, in two layers (all of it; only the near side of its hull): pivot on the screen, size | pivot in the picture, turn, lod
uniform vec4 uBoat[2];
uniform vec4 uFlag, uFlagW;         // its flag's place in the picture (u0, v0, u1, v1); the flutter: amplitude, wave number, phase, -
// the sailor, a jointed puppet: its pieces back to front (far arm, body, scarf's knot, head, near arm), each like a puppet
// above but out of the rig's atlas | S: on, mirrored, warm, hair in the wind (> 0) or in shadow (< 0)
#define NK 8
uniform vec4 uK0[NK], uK1[NK], uK2[NK], uK3[NK];
uniform vec4 uKf[NK];               // (a head: where its face is in its frame, u, v) | the shadow it casts on what is behind it, -
// the scarf's loose end, a strip laid along a line in the wind: its points on the screen and its half-width there
#define NR 10
uniform vec4 uRib[NR];
uniform vec4 uRibF;                 // its frame in the rig's atlas
uniform vec4 uRibS;                 // where it goes in among the pieces, on, lod, warm
uniform vec4 uBall;                 // the light as a glowing glass bead in the child's hands: x, y, radius, how much
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
// the boat: one of its two layers; the flag on the mast flutters (the picture pulled up and down along it, more toward its tip)
vec4 boatL(sampler2D s, vec2 p, bool flag){
  vec4 A = uBoat[0], B = uBoat[1];
  vec2 d = p - A.xy;
  float cs = cos(-B.z), sn = sin(-B.z);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  vec2 q = B.xy + d / A.zw;
  if (flag && q.x > uFlag.x && q.x < uFlag.z && q.y > uFlag.w - 0.03 && q.y < uFlag.y + 0.03){
    float f = (q.x - uFlag.x) / (uFlag.z - uFlag.x);
    q.y -= uFlagW.x * pow(f, 1.25) * sin(uFlagW.y * f - uFlagW.z);
    q.x -= uFlagW.x * 0.35 * f * f * (1.0 + sin(uFlagW.y * f * 0.5 - uFlagW.z * 0.5));
  }
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0);
  return textureLod(s, q, B.w);
}
// a piece of the sailor
vec4 piece(int i, vec2 p){
  vec4 P = uK0[i], Q = uK1[i], R = uK2[i], S = uK3[i];
  if (S.x <= 0.0) return vec4(0.0);
  vec2 d = p - P.xy;
  float cs = cos(-Q.z), sn = sin(-Q.z);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  float fl = S.y > 0.5 ? -1.0 : 1.0;
  vec2 q = Q.xy + vec2(fl * d.x, d.y) / P.zw;
  if (S.w > 0.0){
    // the wool hair in the wind: the farther from the face, the more it lifts and shivers (a new shiver each frame)
    vec2 r = (q - uKf[i].xy) * vec2(P.z / P.w, 1.0);
    float w = smoothstep(0.17, 0.42, length(r));
    q += S.w * w * vec2(sin(q.y * 31.0 + uStep * 1.9) + 0.6 * sin(q.x * 17.0 - uStep * 1.3), cos(q.x * 27.0 + uStep * 2.3)) ;
  }
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0);
  float px = exp2(Q.w) / uRes.y;
  vec2 gx = vec2(fl * cs, sn) * px / P.zw * R.zw, gy = vec2(-fl * sn, cs) * px / P.zw * R.zw;
  vec4 c = textureGrad(uRig, R.xy + q * R.zw, gx, gy);
  if (S.w < 0.0) c.rgb *= 1.0 + S.w;
  c.a *= S.x;
  return c;
}
// the scarf's loose end: the nearest place on its line gives how far along it (u) and how far to the side (v)
vec4 scarf(vec2 p){
  if (uRibS.y <= 0.0) return vec4(0.0);
  float best = 1e9, sb = 0.0, side = 0.0, hw = 1.0, acc = 0.0, outEnd = 0.0;
  for (int i = 0; i < NR - 1; i++){
    vec2 a = uRib[i].xy, ab = uRib[i + 1].xy - a; float L = length(ab);
    float hu = dot(p - a, ab) / (L * L), h = clamp(hu, 0.0, 1.0);
    vec2 dd = p - (a + ab * h); float dl = length(dd);
    if (dl < best){ best = dl; sb = acc + h * L; side = sign(ab.x * dd.y - ab.y * dd.x); hw = mix(uRib[i].z, uRib[i + 1].z, h);
      outEnd = (i == 0 && hu < 0.0) || (i == NR - 2 && hu > 1.0) ? 1.0 : 0.0; }
    acc += L;
  }
  float v = side * best / hw;
  if (abs(v) > 1.0 || outEnd > 0.5) return vec4(0.0);
  vec2 q = vec2(sb / acc, 0.5 + 0.5 * v);
  vec4 c = textureLod(uRig, uRibF.xy + q * uRibF.zw, uRibS.z);
  // (the strip turns as the wave runs along it: one face to the light, then the other; its edges in the shade)
  c.rgb *= (0.80 + 0.22 * sin(q.x * 9.0 - uStep * 1.45)) * (1.0 - 0.22 * v * v);
  c.a *= uRibS.y;
  return c;
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
  // the boat and its sailor: the boat (its far side, its inside, the mast, the sail, the flag), the puppet, then the near
  // side of the hull over the child's legs
  l = boatL(uBB, p, true); l.rgb += l.rgb * warm * (0.35 + 0.3 * uLift); c = mix(c, l.rgb, l.a);
  for (int i = 0; i < NK; i++){
    if (float(i) == uRibS.x){ l = scarf(p); l.rgb += l.rgb * warm * uRibS.w; c = mix(c, l.rgb, l.a); }
    // (a piece in front casts a soft shadow on the felt and wool behind it: the near arm on the body, the chin on the scarf)
    if (uKf[i].z > 0.0){ vec4 sh = piece(i, p + uKf[i].w * vec2(0.55, 0.85)); c *= 1.0 - uKf[i].z * sh.a; }
    l = piece(i, p); l.rgb += l.rgb * warm * uK3[i].z; c = mix(c, l.rgb, l.a);
  }
  // the light in the hands: a little glass bead glowing from inside, brightest at its heart, a rim of warm colour
  if (uBall.w > 0.0){
    vec2 bd = (p - uBall.xy) / uBall.z; float br = length(bd);
    float ba = smoothstep(1.0, 0.86, br) * uBall.w;
    vec3 bc = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.97, 0.86), smoothstep(0.95, 0.15, br)) * (1.6 + 1.2 * smoothstep(0.6, 0.0, br));
    bc += vec3(1.0) * 1.4 * exp(-dot(bd - vec2(-0.32, 0.36), bd - vec2(-0.32, 0.36)) * 30.0);
    bc *= 0.9 + 0.2 * vnoise(bd * 6.0 + uStep * 0.37);
    c = mix(c, bc, ba);
    c += vec3(1.0, 0.72, 0.38) * uBall.w * 0.55 * exp(-max(br - 1.0, 0.0) * 1.6) * step(1.0, br);
  }
  l = boatL(uBF, p, false); l.rgb += l.rgb * warm * 0.12; c = mix(c, l.rgb, l.a);
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
// ---- the sailor: a stop-motion puppet in pieces (body, two arms of two pieces, replacement hands and heads, the scarf),
// posed a little further every frame. Places on the boat are in boat pixels (the empty boat's picture, 1536 square);
// the rig works in them too, with y up and the hull's foot at 0.
const BPX = 0.4496 / 1492;                        // set units per boat pixel (the hull as long as the old boat's)
const SEAT0 = [89, 286];                          // where the child sits (boat pixels from the hull's foot): hidden by the near side
const KNOT = [52, 440];                           // the scarf's knot round the neck (in the body's frame)
const HEADS = { calm: 0, blink: 1, smile: 2, laugh: 3, wonder: 4, wince: 5, tender: 6, up: 7 };
const OPEN_EYES = [0, 2, 4, 7];
// places for the hands, in the body's frame (boat pixels from the seat, y up; the child faces right)
const SPOT = {
  chestN: [150, 250], chestF: [166, 262], hug: [140, 272], chin: [138, 360], chinF: [162, 376], ahead: [335, 385],
  low: [285, 330], knee: [212, 192], wave: [262, 430], offer: [292, 560], high: [280, 650], highF: [252, 660],
  shoulder: [232, 432], shoulderF: [214, 446], bye: [300, 600], down: [196, 300],
};
// ...and on the boat: the near rim, where a hand grips it
const RIMGRIP = [292, 396];
// the acting, in the stop world's seconds. Continuous things: [t, value, seconds to get there]
const TRACK = {
  // how far the body leans back (radians; forward is negative)
  lean: [[0, 0.02], [2.9, -0.06, 0.4], [3.45, 0.06, 0.35], [3.9, 0.17, 0.3], [4.95, 0.03, 0.35], [5.3, 0.12, 0.2], [6.05, -0.12, 0.5],
    [6.6, 0.04, 0.35], [7.35, 0.13, 0.5], [8.1, 0.08, 0.5], [9.25, -0.20, 0.3], [10.55, -0.10, 0.6], [11.35, 0.04, 0.5],
    [12.05, 0.15, 0.8], [13.4, 0.07, 0.7]],
  // how far it rises from the seat (boat pixels): hunched over the light, kneeling up to raise it
  rise: [[0, 0], [9.25, -16, 0.3], [10.55, -6, 0.6], [11.5, 2, 0.4], [12.05, 36, 0.8], [14.3, 22, 0.9]],
  // the head on the neck (radians; back is positive)
  tilt: [[0, 0.06], [2.95, -0.24, 0.35], [3.45, 0.13, 0.3], [3.9, 0.02, 0.2], [4.45, -0.12, 0.12], [4.98, 0.11, 0.07],
    [5.09, -0.11, 0.07], [5.20, 0.09, 0.07], [5.31, -0.06, 0.07], [5.44, 0.19, 0.15], [6.2, 0.04, 0.3], [6.65, 0.10, 0.25],
    [7.3, 0.36, 0.35], [8.0, 0.30, 0.3], [9.15, 0.02, 0.25], [9.45, -0.16, 0.25], [10.4, -0.33, 0.45], [11.0, -0.12, 0.3],
    [11.35, 0.24, 0.4], [12.2, 0.42, 0.6], [13.2, 0.52, 0.4], [13.8, 0.30, 0.6]],
};
// the hands: [t, a place in the body's frame (or 'rim'), seconds to get there]
const HANDS = {
  N: [[0, 'chestN'], [3.9, 'rim', 0.32], [5.95, 'chestN', 0.3], [6.3, 'ahead', 0.5], [6.65, 'low', 0.35], [7.9, 'offer', 0.55],
    [9.25, 'chestN', 0.3], [10.35, 'chin', 0.55], [11.45, 'shoulder', 0.5], [12.05, 'high', 0.9], [13.3, 'bye', 0.4]],
  F: [[0, 'chestF'], [3.9, 'hug', 0.3], [5.95, 'chestF', 0.3], [6.35, 'knee', 0.45], [7.9, 'wave', 0.5], [9.25, 'chestF', 0.3],
    [10.35, 'chinF', 0.55], [11.45, 'shoulderF', 0.5], [12.05, 'highF', 0.9], [13.6, 'down', 1.0]],
};
// things that change at a frame: [t, value]
const SWAP = {
  head: [[0, 'calm'], [2.95, 'tender'], [3.45, 'calm'], [3.6, 'wonder'], [3.95, 'calm'], [4.42, 'wince'], [5.0, 'blink'], [5.25, 'laugh'],
    [6.15, 'smile'], [6.65, 'calm'], [7.35, 'wonder'], [7.75, 'up'], [9.15, 'wonder'], [9.45, 'calm'], [9.8, 'wince'],
    [10.25, 'blink'], [10.45, 'tender'], [10.95, 'smile'], [11.35, 'up'], [12.2, 'wonder'], [12.75, 'up'], [13.25, 'laugh'],
    [13.9, 'smile'], [14.5, 'laugh']],
  back: [[0, 0], [6.6, 1], [7.3, 0]],                       // looking back over the shoulder (the head turned the other way)
  handN: [[0, 'cup'], [3.9, 'fist'], [5.95, 'cup'], [6.25, 'reach'], [9.25, 'cup'], [13.2, 'open']],
  handF: [[0, 'cup'], [6.35, 'open'], [9.25, 'cup'], [13.2, 'open']],
  hold: [[0, 'N'], [3.9, 'F'], [6.15, 'N']],                // which hand has the light
};
const BLINKS = [2.3, 6.9, 8.45, 11.8, 14.1];
// little things on top: [from, to, what, amount, cycles a second]
const WIGGLE = [
  [5.3, 6.05, 'rise', 5, 4.6], [5.3, 6.05, 'tilt', 0.04, 4.6],        // the laugh shakes the shoulders
  [8.3, 9.15, 'Ny', 14, 1.7],                                          // offering the light up to the gull, again and again
  [13.55, 15.6, 'Nx', 52, 1.9], [13.55, 15.6, 'Ny', 9, 3.8],           // waving goodbye to it
];
const at = (tr, t) => { let v = tr[0][1]; for (let i = 1; i < tr.length && t >= tr[i][0]; i++) v = lerp(v, tr[i][1], ease((t - tr[i][0]) / tr[i][2])); return v; };
const swap = (tr, t) => { let v = tr[0][1]; for (const [t0, x] of tr) if (t >= t0) v = x; return v; };
const rot = (a, [x, y]) => [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
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
  // the wind over the little sea: steady, a little uneven, and a gust as each big swell breaks over the bow
  wind(t) {
    const g = (c) => (t > c ? Math.exp(-(t - c) / 0.7) : 0);
    return 0.70 + 0.12 * Math.sin(0.9 * t) + 0.08 * Math.sin(2.3 * t + 1.0) + 0.25 * g(4.6) + 0.25 * g(9.95) - 0.25 * ease((t - 11.0) / 2.0);
  },
  // ---- the puppet's joints, followed through: each is pulled toward where the acting puts it by a spring (so it gets
  // there with a little overshoot and settles), the body is thrown about by the boat's pitch and heave, the hands
  // follow their places. Worked out from the start in small steps (and kept, while time only goes forward).
  joints(T) {
    const st = this.js;
    if (!st || st.t > T + 1e-9) {
      this.js = { t: 0, lean: TRACK.lean[0][1], lv: 0, rise: 0, rv: 0, tilt: TRACK.tilt[0][1], tv: 0, N: null, Nv: [0, 0], F: null, Fv: [0, 0] };
    }
    const S = this.js, h = 1 / 120;
    const body = (lean, rise) => ({ seat: [SEAT0[0], SEAT0[1] + rise], a: lean });
    const toR = (b, pt) => add(b.seat, rot(b.a, pt));
    const target = (side, t, b) => {
      const tr = HANDS[side]; const where = (n) => (n === 'rim' ? RIMGRIP : toR(b, SPOT[n]));
      let v = where(tr[0][1]);
      for (let i = 1; i < tr.length && t >= tr[i][0]; i++) { const e = ease((t - tr[i][0]) / tr[i][2]), w = where(tr[i][1]); v = [lerp(v[0], w[0], e), lerp(v[1], w[1], e)]; }
      for (const [t0, t1, k, amt, f] of WIGGLE) if (k[0] === side && t > t0 && t < t1) {
        const env = Math.sin(Math.PI * (t - t0) / (t1 - t0)) ** 0.5, d = amt * env * Math.sin(2 * Math.PI * f * (t - t0));
        if (k[1] === 'x') v = [v[0] + d, v[1]]; else v = [v[0], v[1] + d];
      }
      return v;
    };
    const wig = (k, t) => { let d = 0; for (const [t0, t1, kk, amt, f] of WIGGLE) if (kk === k && t > t0 && t < t1) d += amt * Math.sin(Math.PI * (t - t0) / (t1 - t0)) * Math.sin(2 * Math.PI * f * (t - t0)); return d; };
    if (!S.N) { const b = body(S.lean, S.rise); S.N = target('N', 0, b); S.F = target('F', 0, b); }
    const spring = (x, v, x0, w, z, f) => { const a = w * w * (x0 - x) - 2 * z * w * v + f; v += a * h; return [x + v * h, v]; };
    while (S.t < T - 1e-9) {
      const t = S.t + h;
      // the boat's pitch and heave, how fast they change
      const r0 = this.ride(t - 1 / 60), r1 = this.ride(t), r2 = this.ride(t + 1 / 60);
      const angA = (r2.ang - 2 * r1.ang + r0.ang) * 3600, yA = (r2.y - 2 * r1.y + r0.y) * 3600 / BPX;
      const breath = 2.6 * Math.sin(2 * Math.PI * t / 2.4);
      [S.lean, S.lv] = spring(S.lean, S.lv, at(TRACK.lean, t), 8.0, 0.40, -0.55 * angA);
      [S.rise, S.rv] = spring(S.rise, S.rv, at(TRACK.rise, t) + breath + wig('rise', t), 11.0, 0.50, -0.08 * yA);
      [S.tilt, S.tv] = spring(S.tilt, S.tv, at(TRACK.tilt, t) + wig('tilt', t) + 0.03 * (Math.sin(1.3 * t) * Math.sin(0.71 * t + 2.0)), 13.0, 0.45, 0.25 * angA);
      const b = body(S.lean, S.rise);
      for (const side of ['N', 'F']) {
        const g = target(side, t, b), x = S[side], v = S[side + 'v'];
        const [x0, v0] = spring(x[0], v[0], g[0], 16.0, 0.62, 0), [x1, v1] = spring(x[1], v[1], g[1], 16.0, 0.62, 0);
        S[side] = [x0, x1]; S[side + 'v'] = [v0, v1];
      }
      S.t = t;
    }
    return S;
  },
  // the whole puppet at (stepped) time t: every piece's place and turn on the boat (boat pixels, y up), and the light
  puppet(t) {
    const RG = YL.STOP_RIG, PC = RG.pieces, S = this.joints(t);
    const b = { seat: [SEAT0[0], SEAT0[1] + S.rise], a: S.lean };
    const toR = (pt) => add(b.seat, rot(b.a, pt));
    const out = [];
    const put = (name, pos, a, opt = {}) => out.push({ name, pos, a, ...opt });
    // an arm: the shoulder to the hand's place, two pieces, the elbow bending down and back
    const L1 = Math.hypot(...PC.uarm.pts.elbow), ua0 = Math.atan2(PC.uarm.pts.elbow[1], PC.uarm.pts.elbow[0]);
    const arm = (sh, hand, kind) => {
      const fa = PC['fa_' + kind], hp = fa.pts.hand, L2 = Math.hypot(...hp), fa0 = Math.atan2(hp[1], hp[0]);
      let dx = hand[0] - sh[0], dy = hand[1] - sh[1], d = Math.hypot(dx, dy);
      const dd = Math.max(Math.abs(L1 - L2) * 1.05, Math.min(d, (L1 + L2) * 0.995));
      const a = Math.atan2(dy, dx), cb = Math.max(-1, Math.min(1, (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd)));
      const a1 = a - Math.acos(cb), el = add(sh, [L1 * Math.cos(a1), L1 * Math.sin(a1)]);
      const tip = add(sh, [dd * Math.cos(a), dd * Math.sin(a)]), a2 = Math.atan2(tip[1] - el[1], tip[0] - el[0]);
      return { sh, el, a1: a1 - ua0, a2: a2 - fa0, tip, kind };
    };
    const hN = swap(SWAP.handN, t), hF = swap(SWAP.handF, t);
    const AN = arm(toR(PC.body.pts.shN), S.N, hN), AF = arm(toR(PC.body.pts.shF), S.F, hF);
    // the head: on the neck, keeping itself a little level against the boat's pitch; a replacement face, blinking
    let head = HEADS[swap(SWAP.head, t)];
    if (OPEN_EYES.includes(head) && BLINKS.some((b0) => t >= b0 && t < b0 + 0.17)) head = HEADS.blink;
    const back = swap(SWAP.back, t) > 0.5, ride = this.ride(t);
    const ha = S.tilt + 0.35 * S.lean - 0.45 * ride.ang;
    put('fa_' + AF.kind, AF.el, AF.a2, { shade: -0.22, warm: 0.45 });
    out.unshift({ name: 'uarm', pos: AF.sh, a: AF.a1, shade: -0.28, warm: 0.4 });
    put('body', b.seat, b.a, { warm: 0.55 });
    put('knot', toR(KNOT), b.a, { warm: 0.6, cast: 0.25 });
    put('head' + head, toR(PC.body.pts.neck), back ? -ha : ha, { mirror: back, warm: 0.75, hair: 0.006 + 0.010 * this.wind(t), cast: 0.30 });
    put('uarm', AN.sh, AN.a1, { warm: 0.6, cast: 0.38 });
    put('fa_' + AN.kind, AN.el, AN.a2, { warm: 0.8, cast: 0.38 });
    // the scarf's loose end, from behind the knot, streaming back in the wind: a wave runs along it, faster and wider the
    // harder the wind; with less wind it hangs lower
    const kn = PC.knot, root = add(toR(KNOT), rot(b.a, kn.pts.tail)), w = this.wind(t);
    const pts = [root], NRb = 10, seg = 60, phs = 11.6 * t + 1.2 * Math.sin(0.7 * t);
    let pp = root;
    for (let i = 1; i < NRb; i++) {
      const u = i / (NRb - 1);
      const ang = Math.PI + 0.06 + b.a * 0.5 + (1 - w) * 1.15 * Math.pow(u, 1.3) + (0.14 + 0.42 * w) * u * Math.sin(1.25 * i - phs) + 0.07 * Math.sin(2.9 * i - 1.7 * phs);
      pp = add(pp, [seg * Math.cos(ang), seg * Math.sin(ang)]); pts.push(pp);
    }
    // the light: in the hand that holds it (just above the palm), passed from one hand to the other gently
    const tipOf = (A) => add(A.tip, [A.kind === 'reach' ? 4 : 8, A.kind === 'reach' ? 30 : 22]);
    const hold = swap(SWAP.hold, t), lastSw = SWAP.hold.filter(([t0]) => t >= t0).pop()[0], prev = SWAP.hold.filter(([t0]) => t0 < lastSw).pop();
    let light = tipOf(hold === 'N' ? AN : AF);
    if (prev) { const e = ease((t - lastSw) / 0.2), o = tipOf(prev[1] === 'N' ? AN : AF); light = [lerp(o[0], light[0], e), lerp(o[1], light[1], e)]; }
    return { pieces: out, scarf: pts, scarfAt: 2, light };
  },
  // the camera: from right up against the moon (the circle of the painting it came out of), back and down to the
  // little sea as the boat sails in; then along with the boat; up a little as the light is raised; in to the light
  cam(t) {
    const a = ease((t - 0.85) / 3.0), ay = ease((t - 0.7) / 2.3), az = ease((t - 0.75) / 2.8);
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
    // the big sweeps of the set (the wave machine, the swell, the boat riding it, the gulls flying) move on ones, smooth;
    // the replacement poses, the gulls' wingbeats and the hand-made tremble move on twos
    const step = Math.floor(t * FPS), ts = step / FPS, tc = t;
    this.lift = ease((t - 12.0) / 1.6);                                       // (the light raised: the little sea brightens)
    const boil = (id, a) => (hj(step * 7.31 + id * 13.7) - 0.5) * a;          // a hand on the puppet, a hair off each frame
    const ATL = YL.STOP_ATLAS, AS = YL.ASSET_SIZE || {};
    // ---- still things
    const A = new Float32Array(16), B = new Float32Array(16), C = new Float32Array(16), texs = [];
    HUNG.forEach(([k, x, y, hgt, kd, pu, pv, lod, warmth], i) => {
      const tx = YL.assetTex(k), sz = AS[k]; texs.push(tx);
      if (!tx || !sz) return;
      let xx = x, yy = y, ang = 0;
      if (k === 'stop_moon') ang = 0.05 * Math.sin(tc * 0.9) + boil(1, 0.004);
      else { const ph = i * 1.7; ang = 0.07 * Math.sin(tc * 1.1 + ph) + boil(i, 0.006); yy = y + 0.005 * Math.sin(tc * 0.7 + ph); xx = x - 0.012 * tc; }
      const [sx, sy, sc] = this.place(xx, yy, kd, c);
      const H = hgt * sc;
      A.set([sx, sy, H * sz[0] / sz[1], H], i * 4); B.set([pu, pv, ang, lod], i * 4); C.set([1, 0, warmth + 0.5 * this.lift, 0], i * 4);
    });
    // ---- the strips
    const L = new Float32Array(12), M = new Float32Array(12), N = new Float32Array(12), wtex = [];
    const ph = this.phase(), A_ = this.amp(tc);
    STRIPS.forEach(([k, y, hgt, kd, flow, gain, sph, lod, glint, warmth], i) => {
      const tx = YL.tileTex(k), sz = AS[k]; wtex.push(tx);
      if (!sz) return;
      const [sx, sy, S] = this.placeN(0, y, kd, c);
      L.set([sx, sy, S, flow * tc], i * 4); M.set([hgt, hgt * sz[0] / sz[1], gain, 0], i * 4);
      N.set([lod + (i === 2 ? 0.8 * (c.z - 1) : 0), glint, warmth, 0], i * 4);
    });
    // (each strip's swell: the same wave, its own gain and a shift of phase — passed as a gain on the amplitude and a phase)
    // the shader takes one phase; the strips' own shifts are folded into the flow (a shift of the water along the strip)
    STRIPS.forEach(([, , , , , , sph], i) => { L[i * 4 + 3] += sph / KW; });
    // ---- the puppets: 0 boat, 1 splash, 2 far gull, 3 near gull
    const P = new Float32Array(16), Q = new Float32Array(16), R = new Float32Array(16), Sx = new Float32Array(16);
    const thr = new Float32Array(8);
    let hand = [0, 0];
    const boatU = new Float32Array(8), K0 = new Float32Array(32), K1 = new Float32Array(32), K2 = new Float32Array(32), K3 = new Float32Array(32), Kf = new Float32Array(32), rib = new Float32Array(40);
    let ballR = 0, flag = [0, 0, 0, 0], flagW = [0, 0, 0, 0], ribF = [0, 0, 0, 0], ribS = [-1, 0, 0, 0];
    if (ATL && AS.stop_atlas && YL.STOP_RIG && AS.stop_rig) {
      const ride = this.ride(tc), RG = YL.STOP_RIG;
      const bx = this.boatX(tc) + boil(21, 0.003), by = BOAT_Y + ride.y + boil(22, 0.002), ang = ride.ang + boil(23, 0.006);
      const [sx, sy, S] = this.placeN(bx, by, KB, c), H = BOAT_H * S, g = BPX * S, cs = Math.cos(ang), sn = Math.sin(ang);
      // a place on the boat (boat pixels from the hull's foot, y up) on the screen
      const scr = ([x, y]) => [sx + (cs * x - sn * y) * g, sy + (sn * x + cs * y) * g];
      const fromB = ([x, y]) => [x - RG.boat.anchor[0], RG.boat.anchor[1] - y];
      const turn = (u, v) => scr(fromB([u, v]));
      // the boat's two layers
      const bo = RG.boat;
      boatU.set([sx, sy, bo.size[0] * g, bo.size[1] * g, (bo.anchor[0] - bo.org[0]) / bo.size[0], 1 - (bo.anchor[1] - bo.org[1]) / bo.size[1], ang, 0.0]);
      const fu = (x) => (x - bo.org[0]) / bo.size[0], fv = (y) => 1 - (y - bo.org[1]) / bo.size[1];
      flag = [fu(bo.flag[0]), fv(bo.flag[1]), fu(bo.flag[2]), fv(bo.flag[3])];
      const wd = this.wind(ts);
      flagW = [0.010 + 0.010 * wd, 2 * Math.PI * 1.5, 7.5 * ts + 3.0 * wd + 0.8 * Math.sin(1.3 * ts), 0];
      // the puppet, posed for this frame (its joints on twos, like the rest of the hand-moved things)
      const pz = this.puppet(ts), PC = RG.pieces, AT = AS.stop_rig;
      pz.pieces.forEach((pc, i) => {
        const M = PC[pc.name], k = M.k, [qx, qy] = scr(pc.pos);
        K0.set([qx, qy, M.w * k * g, M.h * k * g], i * 4);
        K1.set([M.anchor[0], M.anchor[1], ang + pc.a + boil(30 + i, 0.010), 0.0], i * 4);
        K2.set([M.at[0][0] / AT[0], 1 - (M.at[0][1] + M.h) / AT[1], M.w / AT[0], M.h / AT[1]], i * 4);
        K3.set([1, pc.mirror ? 1 : 0, pc.warm + 0.3 * this.lift, pc.hair || pc.shade || 0], i * 4);
        if (pc.name.startsWith('head')) {
          const f = M.pts.face; Kf.set([M.anchor[0] + (pc.mirror ? -1 : 1) * f[0] / (M.w * k), M.anchor[1] + f[1] / (M.h * k)], i * 4);
        }
        Kf.set([pc.cast || 0, 7 * g], i * 4 + 2);
      });
      const SC = PC.scarf, hw = 0.5 * 176;
      pz.scarf.forEach((q, i) => { const [qx, qy] = scr(q); rib.set([qx, qy, hw * g * (1 - 0.12 * i / 9), 0], i * 4); });
      ribF = [SC.at[0][0] / AT[0], 1 - (SC.at[0][1] + SC.h) / AT[1], SC.w / AT[0], SC.h / AT[1]];
      ribS = [pz.scarfAt, 1, Math.max(0, Math.log2(SC.h / (2 * hw * g * h))), 0.6 + 0.3 * this.lift];
      hand = scr(pz.light); ballR = 30 * g;
      // the splash: thrown up at the bow as it dives, six frames
      const SP = ATL.spray;
      for (const e of this.dives()) {
        const f = Math.floor((t - e.t) * 9);
        if (f < 0 || f >= SP.n) continue;
        const [qx, qy] = turn(...RG.boat.bow), Hs = H * (0.42 + 0.30 * e.k);
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
      if (t < 12.5) gull(2, 1.15 - 0.27 * tc, Math.max(0.02, 0.30 - 0.06 * tc) + 0.02 * Math.sin(tc * 2.1), 1.12, 0.075, false, 6, 0.2, 0);
      // near: catches up with the boat from behind, hangs over the light (the sailor offers it up), then away up and ahead
      if (t > 5.6 && t < 13.2) {
        const kx = [[5.6, -1.25, 0.62], [7.5, 0.06, 0.46], [8.6, 0.16, 0.52], [9.6, 0.10, 0.47], [10.7, 0.16, 0.50], [12.9, 1.30, 0.95]];
        let j = 0; while (j < kx.length - 2 && tc > kx[j + 1][0]) j++;
        const [t0, x0, y0] = kx[j], [t1, x1, y1] = kx[j + 1], u = ease((tc - t0) / (t1 - t0));
        const hov = clamp01((tc - 7.3) / 0.6) * (1 - clamp01((tc - 10.7) / 0.5));
        const ox = lerp(x0, x1, u) + hov * 0.035 * Math.sin((tc - 7.5) * 2.4), oy = lerp(y0, y1, u) + hov * 0.02 * Math.sin((tc - 7.5) * 3.7);
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
      const [sx, sy, sc] = this.place(x - 0.004 * tc, y + 0.004 * Math.sin(tc * 0.8 + ph), k, c);
      st.set([sx, sy, sz * sc, ph + 1.3 * Math.sin(tc * 0.55 + ph * 2.0) + 0.35 * tc], i * 4);
    });
    gl.uniform4fv(p.u.uStar, st);
    U(p, 'uSw', [A_, ph, tc, KW]);
    U(p, 'uRes', [w, h]); U(p, 'uTime', t); U(p, 'uStep', step); U(p, 'uFade', this.fade); U(p, 'uLift', this.lift);
    U(p, 'uWhite', this.white); U(p, 'uFlick', 0.012 * (Math.sin(step * 12.9898) * 0.5));
    U(p, 'uHero', [this.hero.p[0], this.hero.p[1], this.hero.b, 0.022 + 0.05 * up]);
    gl.uniform4fv(p.u.uBoat, boatU); U(p, 'uFlag', flag); U(p, 'uFlagW', flagW);
    gl.uniform4fv(p.u.uK0, K0); gl.uniform4fv(p.u.uK1, K1); gl.uniform4fv(p.u.uK2, K2); gl.uniform4fv(p.u.uK3, K3); gl.uniform4fv(p.u.uKf, Kf);
    gl.uniform4fv(p.u.uRib, rib); U(p, 'uRibF', ribF); U(p, 'uRibS', ribS);
    U(p, 'uBall', [this.hero.p[0], this.hero.p[1], ballR * (1 + 0.6 * up), ballR > 0 ? 1 - ease((t - T_LEAVE - 0.3) / 1.2) : 0]);
    const bind = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex || null); gl.uniform1i(p.u[name], unit); };
    bind('uSky', skyTex, 0);
    ['uMoon', 'uCl0', 'uCl1', 'uCl2'].forEach((n, i) => bind(n, texs[i], 1 + i));
    ['uW0', 'uW1', 'uW2'].forEach((n, i) => bind(n, wtex[i], 5 + i));
    bind('uAt', YL.assetTex('stop_atlas'), 8);
    bind('uBB', YL.assetTex('stop_boatB'), 9); bind('uBF', YL.assetTex('stop_boatF'), 10); bind('uRig', YL.assetTex('stop_rig'), 11);
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
