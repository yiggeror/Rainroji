/* ============================================================================
   世界七 · 印象派·清晨睡莲池
   ----------------------------------------------------------------------------
   天边破晓，颜色从水墨里渗出来、炸开：一片清晨的睡莲池。整张画全是笔触。
   · 先在一张小图上「打底」：天光、雾里的远岸、水面倒映的天、太阳在水上铺开的一条碎金的路、
     透视里一簇簇的睡莲叶、几朵粉白的花、从上方垂下来的柳条。每一处还记下笔该朝哪个方向走、多大。
   · 再用一万多笔把它重新画出来：每一笔取它所在处的颜色，却不老实——明度、色相各自抖一点，
     有的干脆用补色（绿叶里一笔紫，金光里一笔蓝）；笔有方向（水面横、柳条竖、叶子顺着叶形），
     有鬃毛的纹路，有颜料的厚度：一侧受光，亮起一道。
   · 笔触每秒换几次位置，整张画在呼吸。太阳那条路上的笔最碎、最亮，闪个不停。
   · 一粒光在这里是水面上初升的第一点阳光。最后它停进一片叶子上的一颗露珠里；露珠滚落——落进那杯茶。
   渲染：打底（小图，两张：颜色 + 笔的方向/大小）→ 底色（打底放大、模糊、压暗：笔触之间露出来的地方）→
         两层笔触（先大后小，实例化）→ 画布纹理、暗角。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});

const NPAD = 64;
const COMMON = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }
float sat(float x){ return clamp(x, 0.0, 1.0); }
`;
/* ---------------------------------------------------------------- the underpainting: what is where, its colour, which
   way the brush should go and how big. Painting coords: x 0…aspect, y 0…1 (up). */
const FS_BASE = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uAspect, uTime;
uniform vec4 uPad[${NPAD}];  // lily pads: centre (x, y), radius across, seed (flower if > 0.75)
uniform vec4 uSun;           // the sun: x, y (on the horizon), its brightness; the light on the water's x
uniform vec4 uHero;          // 一粒光: x, y, brightness, -
layout(location = 0) out vec4 oC;    // colour (sRGB-ish, 0…1)
layout(location = 1) out vec4 oP;    // the brush: direction (angle / π, 0…1), size (0…1), kind (0 water, .33 pad, .66 flower, 1 willow), -
` + COMMON + `
const float HZ = 0.745;      // the far bank's foot: where the water starts
void main(){
  vec2 p = vec2(gl_FragCoord.x / uRes.y, gl_FragCoord.y / uRes.y) * vec2(1.0, 1.0);
  p.x += (1.7778 - uAspect) * 0.5;
  vec3 c; float ang = 0.0, size = 0.5, kind = 0.0;
  float t = uTime;
  vec2 S = uSun.xy;
  if (p.y > HZ){
    // ---- the sky over the far bank, low sun behind the mist: gold at the horizon going up into a rose, then a lilac blue
    float h = (p.y - HZ) / (1.0 - HZ);
    c = mix(vec3(1.0, 0.86, 0.58), vec3(0.98, 0.74, 0.70), smoothstep(0.0, 0.45, h));
    c = mix(c, vec3(0.72, 0.74, 0.92), smoothstep(0.4, 1.0, h));
    float sd = length((p - S) * vec2(1.0, 1.3));
    c = mix(c, vec3(1.0, 0.97, 0.86), exp(-sd / 0.05) * uSun.z) + vec3(0.25, 0.15, 0.0) * exp(-sd / 0.18) * uSun.z;
    // the far bank: a long low line of trees in the mist, blue-violet, softer the further it is
    float crowns = 0.0; for (int k = 0; k < 7; k++){ float fk = float(k), cx = fk * 0.29 + 0.1 * sin(fk * 2.3), w = 0.10 + 0.06 * fract(fk * 0.618); crowns = max(crowns, (0.05 + 0.05 * fract(fk * 0.37)) * sqrt(sat(1.0 - pow((p.x - cx) / w, 2.0)))); }
    float bank = HZ + 0.020 + crowns + 0.02 * fbm(vec2(p.x * 6.0, 1.0)) + 0.05 * smoothstep(1.3, 1.78, p.x);
    float inB = smoothstep(bank + 0.006, bank - 0.006, p.y);
    vec3 trees = mix(vec3(0.46, 0.46, 0.66), vec3(0.62, 0.58, 0.72), smoothstep(HZ, bank, p.y));
    trees = mix(trees, vec3(0.86, 0.72, 0.62), exp(-abs(p.x - S.x) / 0.18) * 0.55);       // the sun's glow through them
    c = mix(c, trees, inB * 0.85);
    ang = inB > 0.5 ? vnoise(p * 25.0) : 0.05 * (vnoise(p * 10.0) - 0.5);
    size = inB > 0.5 ? 0.35 : 0.9;
    kind = inB > 0.5 ? 0.66 : 0.0;                                          // (dabs, not long strokes)
  } else {
    // ---- the water: the sky's colours upside down, deeper and bluer the nearer it is; long ripples
    float z = (HZ - p.y) / HZ;                                      // 0 at the far bank … 1 at our feet
    float rip = fbm(vec2(p.x * 6.0, p.y * 40.0 / (0.3 + z)) + vec2(t * 0.05, 0.0));
    c = mix(vec3(0.95, 0.80, 0.66), vec3(0.62, 0.68, 0.86), smoothstep(0.0, 0.35, z));
    c = mix(c, vec3(0.30, 0.42, 0.62), smoothstep(0.3, 1.0, z));
    c *= 0.9 + 0.2 * rip;
    // the trees' reflections: dark, broken verticals hanging down from the far bank
    float refl = smoothstep(0.12, 0.0, z) * (0.6 + 0.4 * fbm(vec2(p.x * 3.0, 1.0)));
    c = mix(c, vec3(0.40, 0.42, 0.58), refl * 0.6);
    // the sun's road: a column of broken gold down the water from under the sun, widening as it comes
    float road = exp(-pow((p.x - uSun.w) / (0.03 + 0.10 * z), 2.0)) * (0.35 + 0.65 * smoothstep(0.35, 0.8, vnoise(vec2(p.x * 40.0, p.y * 140.0 / (0.3 + z)) + t * 0.6)));
    c = mix(c, vec3(1.0, 0.86, 0.50), sat(road * uSun.z * 1.1));
    // 一粒光: the first light on the water: a hot point, ringed with glitter
    vec2 hd = p - uHero.xy;
    float hp = exp(-dot(hd * vec2(1.0, 2.5), hd * vec2(1.0, 2.5)) / 0.0006) * uHero.z;
    c = mix(c, vec3(1.0, 0.95, 0.75), sat(hp * 1.2));
    ang = 0.0 + 0.06 * (vnoise(p * 8.0) - 0.5);
    size = 0.45 + 0.4 * z;
    kind = 0.0;
    // ---- lily pads, in perspective: flattened discs with the notch cut in; some carry a flower
    for (int i = 0; i < ${NPAD}; i++){
      vec4 P = uPad[i];
      if (P.z <= 0.0) continue;
      vec2 q = p - P.xy;
      vec2 e = q / vec2(P.z, P.z * (0.25 + 0.35 * sat((HZ - P.y) / HZ)));
      float r = length(e);
      if (r > 1.25) continue;
      float a = atan(e.y, e.x), notch = smoothstep(0.10, 0.0, abs(a - (P.w * 6.28 - 3.14)) * 0.5) ;
      float pad = smoothstep(1.02, 0.95, r + 0.04 * sin(a * 5.0 + P.w * 20.0)) * (1.0 - notch * smoothstep(0.2, 0.5, r));
      if (pad > 0.0){
        vec3 g = mix(vec3(0.26, 0.48, 0.30), vec3(0.50, 0.66, 0.34), vnoise(P.xy * 40.0) * 0.7 + 0.3 * (e.x * 0.5 + 0.5));
        g = mix(g, vec3(0.72, 0.62, 0.38), smoothstep(0.6, 1.0, r) * 0.35);                     // the rim catches the light
        c = mix(c, g, pad);
        ang = mix(ang, 0.12 * sin(a) + 0.04 * (vnoise(p * 50.0) - 0.5), pad);   // the brush lies along the leaf, bending a little round it
        size = mix(size, 0.25 + 0.4 * P.z / 0.06, pad);
        kind = mix(kind, 0.33, pad);
        if (P.w > 0.72){
          vec2 f = (q - vec2(0.0, P.z * 0.10)) / (P.z * 0.45);
          float fl = smoothstep(1.0, 0.6, length(f * vec2(1.0, 1.4)));
          vec3 pink = mix(vec3(0.98, 0.70, 0.78), vec3(1.0, 0.94, 0.92), smoothstep(-0.2, 0.6, f.y));
          c = mix(c, pink, fl);
          ang = mix(ang, 0.5, fl); size = mix(size, 0.18, fl); kind = mix(kind, 0.66, fl);
        }
      }
    }
  }
  // ---- willow: long fronds hanging from the top right, swaying; yellow-green in the sun, dark where they overlap
  {
    float best = 0.0;
    for (int k = 0; k < 16; k++){
      float fk = float(k), x0 = 1.14 + fk * 0.042 + 0.02 * sin(fk * 3.1);
      float len_ = 0.26 + 0.34 * fract(fk * 0.618) + 0.08 * sin(fk);
      float yy = 1.02 - p.y;
      if (yy < 0.0 || yy > len_) continue;
      float sway = 0.015 * sin(t * 0.7 + fk) * yy / len_ + 0.03 * yy * yy;
      float d = abs(p.x - x0 - sway);
      float w = 0.020 * (1.0 - 0.5 * yy / len_);
      best = max(best, smoothstep(w, w * 0.4, d) * smoothstep(len_, len_ - 0.05, yy));
    }
    if (best > 0.0){
      vec3 wl = mix(vec3(0.42, 0.58, 0.26), vec3(0.85, 0.82, 0.40), vnoise(p * 60.0) * 0.7);
      c = mix(c, wl, best);
      ang = mix(ang, 0.5, best); size = mix(size, 0.22, best); kind = mix(kind, 1.0, best);
    }
  }
  oC = vec4(clamp(c, 0.0, 1.0), 1.0);
  oP = vec4(fract(ang + 1.0), size, kind, 1.0);
}`;
/* ---------------------------------------------------------------- the ground: the underpainting, softened, a little
   darker and duller, showing between the strokes */
const FS_GROUND = `#version 300 es
precision highp float;
uniform sampler2D uC; uniform vec2 uRes;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = textureLod(uC, uv, 2.0).rgb;
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  o = vec4(mix(vec3(l), c, 0.7) * 0.82 + vec3(0.04, 0.02, 0.0), 1.0);
}`;
/* ---------------------------------------------------------------- the strokes */
const VS_STROKE = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aS;     // where (0…1 of the frame), two dice
uniform sampler2D uC, uP;
uniform vec2 uRes; uniform float uTime, uScale, uBoil, uReveal; uniform vec4 uSun; uniform vec2 uBurst;
out vec2 vQ; out vec3 vCol; out float vSeed, vA;
` + COMMON + `
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
void main(){
  int corner = gl_VertexID;
  vec2 cq = vec2(corner & 1, corner >> 1) * 2.0 - 1.0;
  // the brush is put down again a few times a second, a little elsewhere each time
  float b = uBoil;
  vec2 jit = (vec2(hash12(aS.zw + b * 1.7), hash12(aS.wz + b * 3.1)) - 0.5) * 0.004;
  vec2 pos = aS.xy + jit;
  vec4 C = textureLod(uC, pos, 0.0), P = textureLod(uP, pos, 0.0);
  float kind = P.z;
  // colour: the place's colour, its value and hue each nudged; now and then the complement
  vec3 hsv = rgb2hsv(C.rgb);
  float r1 = hash12(aS.zw * 7.3 + b), r2 = hash12(aS.zw * 3.9 - b);
  hsv.x += (r1 - 0.5) * 0.06;
  hsv.y = clamp(hsv.y * (0.85 + 0.5 * r2), 0.0, 1.0);
  hsv.z = clamp(hsv.z * (0.88 + 0.24 * hash12(aS.zw * 1.3 + b * 0.7)), 0.0, 1.0);
  if (r2 > 0.975 && kind < 0.9){ hsv.x = fract(hsv.x + 0.5); hsv.y *= 0.45; }
  vec3 col = hsv2rgb(hsv);
  // on the sun's road, the strokes are short, fat and bright, and flicker
  float road = exp(-pow((aS.x * uRes.x / uRes.y - uSun.w) / 0.08, 2.0)) * step(aS.y, 0.74) * uSun.z;
  // direction and size
  float ang = P.x * 3.14159 + (hash12(aS.zw * 5.1 + b) - 0.5) * 0.35;
  float len_ = uScale * (0.6 + 0.8 * P.y) * (0.75 + 0.5 * hash12(aS.zw * 2.2));
  float wid = len_ * (kind > 0.5 && kind < 0.9 ? 0.55 : kind > 0.9 ? 0.18 : 0.30) * (1.0 - 0.3 * road);
  len_ *= 1.0 - 0.45 * road;
  vec2 dir = vec2(cos(ang), sin(ang)), nrm = vec2(-dir.y, dir.x);
  vec2 off = (dir * cq.x * len_ + nrm * cq.y * wid) / vec2(uRes.x / uRes.y, 1.0);
  // the painting bursts out of the dawn: from where the sun is, outward
  float dist = length((aS.xy - uBurst) * vec2(uRes.x / uRes.y, 1.0));
  vA = smoothstep(dist * 0.9 + 0.1 * hash12(aS.zw), dist * 0.9 + 0.1 * hash12(aS.zw) + 0.15, uReveal);
  gl_Position = vec4((pos + off) * 2.0 - 1.0, 0.0, 1.0);
  vQ = cq; vCol = col; vSeed = hash12(aS.zw * 11.0);
}`;
const FS_STROKE = `#version 300 es
precision highp float;
in vec2 vQ; in vec3 vCol; in float vSeed, vA;
out vec4 o;
` + COMMON + `
void main(){
  // along (s) and across (t) the stroke; it is fattest a little after it starts and thins as the brush lifts
  float s = vQ.x * 0.5 + 0.5, t = vQ.y;
  float w = sin(3.14159 * pow(s, 0.8)) * (0.85 + 0.15 * sin(s * 9.0 + vSeed * 20.0));
  float edge = abs(t) - w;
  float m = smoothstep(0.05, -0.08, edge);
  // the hairs of the brush: streaks along it, and where it ran thin at its end
  float hairs = vnoise(vec2(t * 9.0 + vSeed * 50.0, s * 1.5)) * 0.6 + vnoise(vec2(t * 23.0 + vSeed * 9.0, s * 3.0)) * 0.4;
  m *= smoothstep(0.15, 0.45, hairs + 0.35 * (1.0 - s));
  if (m * vA < 0.01) discard;
  // the paint stands up off the canvas: its ridge catches the light from the upper left
  float h = (1.0 - smoothstep(0.0, 1.0, abs(t) / max(w, 0.05))) * (0.6 + 0.4 * hairs);
  float lit = 0.92 + 0.22 * (h - 0.5) + 0.18 * smoothstep(0.2, 0.0, -t) * smoothstep(-0.2, -0.05, edge);
  o = vec4(vCol * lit, m * vA * 0.95);
}`;
const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uA; uniform vec2 uRes; uniform float uTime, uFade, uWhite; uniform vec4 uDew;
out vec4 o;
` + COMMON + `
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uA, uv).rgb;
  // the canvas under the paint: its weave shows through a little
  vec2 g = gl_FragCoord.xy / uRes.y * 420.0;
  float weave = 0.5 + 0.25 * sin(g.x * 3.14159) * sin(g.y * 3.14159) + 0.25 * vnoise(g * 0.5);
  c *= 0.95 + 0.07 * weave;
  // the dewdrop on its leaf, holding the sun: a bright bead, then a falling glint
  vec2 dp = (gl_FragCoord.xy - uDew.xy * uRes) / uRes.y;
  float dew = exp(-dot(dp, dp) / (uDew.z * uDew.z));
  c = mix(c, vec3(1.0, 0.97, 0.88), sat(dew * uDew.w * 1.4));
  c += vec3(1.0, 0.85, 0.55) * exp(-length(dp) / (uDew.z * 4.0)) * uDew.w * 0.25;
  vec2 v = uv - 0.5; c *= 1.0 - 0.28 * dot(v, v) * 1.6;
  c = mix(c, vec3(1.0, 0.97, 0.90), uWhite);
  o = vec4(c * uFade, 1.0);
}`;
const VS_FULL = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

W.pond = {
  ready: false, t: 0, fade: 1, vol: 1, reveal: 1, white: 0,
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.pBase = YL.makeProgram('pond-base', VS_FULL, FS_BASE);
    this.pGround = YL.makeProgram('pond-ground', VS_FULL, FS_GROUND);
    this.pStroke = YL.makeProgram('pond-stroke', VS_STROKE, FS_STROKE);
    this.pFinal = YL.makeProgram('pond-final', VS_FULL, FS_FINAL);
    [this.pBase, this.pGround, this.pStroke, this.pFinal].forEach(YL.checkProgram);
    // the lily pads: clusters drifting across the water, smaller and flatter toward the far bank
    let a = 0x51ed27; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pads = [], clusters = [[0.30, 0.13, 9], [0.80, 0.06, 7], [1.42, 0.17, 9], [0.58, 0.36, 7], [1.18, 0.43, 7], [0.16, 0.48, 6], [1.58, 0.55, 6], [0.88, 0.60, 6], [0.40, 0.64, 5]];
    for (const [cx, cy, n] of clusters) {
      const z = (0.745 - cy) / 0.745;
      for (let i = 0; i < n && pads.length < NPAD; i++) {
        const r = (0.025 + 0.085 * z * z) * (0.65 + 0.7 * rnd());
        pads.push([cx + (rnd() - 0.5) * 0.36 * (0.35 + z), cy + (rnd() - 0.5) * 0.08 * (0.3 + z), r, rnd()]);
      }
    }
    pads.sort((p, q) => q[1] - p[1]);                                 // far ones first, so near ones overlap them
    this.pads = new Float32Array(NPAD * 4); pads.forEach((p, i) => this.pads.set(p, i * 4));
    // the dewdrop sits on a near leaf
    const near = pads.filter(p => p[1] < 0.3).sort((p, q) => q[2] - p[2])[0] || pads[pads.length - 1];
    this.dewPad = near;
    // the strokes: two layers, on jittered grids
    const mk = (n) => { const d = new Float32Array(n * 4); for (let i = 0; i < n; i++) d.set([rnd(), rnd(), rnd() * 100, rnd() * 100], i * 4); return d; };
    this.layers = [];
    for (const [n, scale] of [[2600, 0.030], [9000, 0.016]]) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, mk(n), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 1);
      gl.bindVertexArray(null);
      this.layers.push({ vao, n, scale });
    }
    this.empty = gl.createVertexArray();
    if (!this.inited) this.t = +(YL.QS.get('wt') || 0);
    this.inited = true;
    this.ready = true;
  },
  targets(w, h) {
    if (this.res && this.res.w === w && this.res.h === h) return;
    const gl = YL.gl;
    if (this.res) for (const t of [this.base, this.canvas]) { gl.deleteFramebuffer(t.fb); t.texs.forEach(x => gl.deleteTexture(x.t)); }
    this.base = YL.makeTarget(Math.max(64, w >> 2), Math.max(36, h >> 2), ['rgba8', 'rgba8'], { mips: true });
    this.canvas = YL.makeTarget(w, h, ['rgba8']);
    this.res = { w, h };
  },
  // 一粒光: the first light on the water, drifting along the sun's road; at the end it goes into the dewdrop
  hero: { p: [0.98, 0.30], v: [0, 0], aim: null, k: 1 },
  arrive(px, py) { this.hero.p = [px, py]; this.hero.v = [0, 0]; },
  toPaint(nx, ny, aspect) { return [(nx * 0.5 + 0.5) * aspect + (1.7778 - aspect) * 0.5, ny * 0.5 + 0.5]; },
  pointer(nx, ny) { this.hero.aim = this.toPaint(nx, ny, YL.canvasAspect()); this.hero.aimT = this.t; },
  dew: 0, drop: 0,
  update(dt) {
    this.t += dt;
    const H = this.hero, sunX = 1.0;
    let tgt = H.aim && this.t - H.aimT < 3 ? H.aim : [sunX + 0.03 * Math.sin(this.t * 0.5), 0.30 + 0.05 * Math.sin(this.t * 0.31)];
    if (this.dew > 0) tgt = [this.dewPad[0] + 0.004, this.dewPad[1] + this.dewPad[2] * 0.12];
    for (let i = 0; i < 2; i++) { H.v[i] += (tgt[i] - H.p[i]) * 3.2 * dt; H.v[i] *= Math.exp(-dt * 2.6); H.p[i] += H.v[i] * dt; }
    this.sound(dt);
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    this.targets(w, h);
    const t = this.t, H = this.hero, br = 1 + 0.07 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 5.3);
    const sun = [1.0, 0.765, 1.0, 1.0];
    // 1) the underpainting
    const B = this.base;
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb); gl.viewport(0, 0, B.w, B.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.pBase.p);
    U(this.pBase, 'uRes', [B.w, B.h]); U(this.pBase, 'uAspect', aspect); U(this.pBase, 'uTime', t);
    gl.uniform4fv(this.pBase.u.uPad, this.pads); U(this.pBase, 'uSun', sun);
    U(this.pBase, 'uHero', [H.p[0], H.p[1], (1 - this.dew) * br, 0]);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (const tx of B.texs) { gl.bindTexture(gl.TEXTURE_2D, tx.t); gl.generateMipmap(gl.TEXTURE_2D); }
    // 2) the ground, then the strokes over it, big ones first
    const Cv = this.canvas;
    gl.bindFramebuffer(gl.FRAMEBUFFER, Cv.fb); gl.viewport(0, 0, Cv.w, Cv.h);
    gl.useProgram(this.pGround.p); U(this.pGround, 'uRes', [Cv.w, Cv.h]); YL.bindTex(this.pGround, 'uC', B.texs[0], 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.pStroke.p);
    YL.bindTex(this.pStroke, 'uC', B.texs[0], 0); YL.bindTex(this.pStroke, 'uP', B.texs[1], 1);
    // (the strokes are laid with the base texture's nearest samples: its direction must not be blended across an edge)
    gl.activeTexture(gl.TEXTURE1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const boil = YL.reduced ? 0 : Math.floor(t * 6);
    U(this.pStroke, 'uRes', [Cv.w, Cv.h]); U(this.pStroke, 'uTime', t); U(this.pStroke, 'uBoil', boil % 64); U(this.pStroke, 'uSun', sun);
    U(this.pStroke, 'uReveal', this.reveal * 2.4); U(this.pStroke, 'uBurst', [(sun[0] - (1.7778 - aspect) * 0.5) / aspect, 0.74]);
    for (const L of this.layers) {
      U(this.pStroke, 'uScale', L.scale);
      gl.bindVertexArray(L.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, L.n);
    }
    gl.activeTexture(gl.TEXTURE1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.disable(gl.BLEND);
    // 3) the canvas, the dewdrop, the frame
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.useProgram(this.pFinal.p);
    U(this.pFinal, 'uRes', [w, h]); U(this.pFinal, 'uTime', t); U(this.pFinal, 'uFade', this.fade); U(this.pFinal, 'uWhite', this.white);
    const dx = (H.p[0] - (1.7778 - aspect) * 0.5) / aspect, dy = H.p[1] - this.drop * this.drop * 0.9;
    U(this.pFinal, 'uDew', [dx, dy, 0.0045 + 0.002 * this.dew, this.dew * br]);
    YL.bindTex(this.pFinal, 'uA', Cv.tex, 0);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: morning birds, a breath of wind in the willow, now and then a drop into the water */
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const pink = noiseBuffer(6.3, 'pink');
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    loop(pink, 0.8, bp); bp.connect(wg); wg.connect(bus);
    this.snd = { ctx, bus, wg, nextBird: 0.4, nextDrip: 2.5 };
  },
  bird() {
    const S = this.snd, ctx = S.ctx; let t = ctx.currentTime + 0.05;
    const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(g); if (p) { p.pan.value = Math.random() * 1.4 - 0.7; g.connect(p); p.connect(S.bus); } else g.connect(S.bus);
    const base = 2400 + Math.random() * 1600, n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const d = 0.06 + Math.random() * 0.08, f0 = base * (0.9 + 0.3 * Math.random());
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (0.75 + 0.5 * Math.random()), t + d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.01); g.gain.setTargetAtTime(0, t + d * 0.7, d * 0.2);
      t += d + 0.04 + Math.random() * 0.08;
    }
    o.start(); o.stop(t + 0.3);
  },
  plip(gain = 0.08) {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.02;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(900, t0); o.frequency.exponentialRampToValueAtTime(2200, t0 + 0.05);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.004); g.gain.setTargetAtTime(0, t0 + 0.01, 0.03);
    o.connect(g); g.connect(S.bus); o.start(t0); o.stop(t0 + 0.3);
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.5);
    S.wg.gain.setTargetAtTime(0.04 + 0.03 * Math.sin(this.t * 0.4), now, 0.5);
    if ((S.nextBird -= dt) <= 0) { this.bird(); S.nextBird = 0.8 + Math.random() * 2.5; }
    if ((S.nextDrip -= dt) <= 0) { this.plip(0.04); S.nextDrip = 2 + Math.random() * 4; }
  },
};
})();
